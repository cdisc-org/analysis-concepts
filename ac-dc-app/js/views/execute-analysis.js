import { appState, navigateTo, rebuildSpec } from '../app.js';
import { getAllEndpoints, getDerivationBCTopicDecode, getEndpointParameterOptions, getArmNames, getVisitLabels } from '../utils/usdm-parser.js';
import {
  initWebR, loadXptFile, executeR, isInitialized,
  getLoadedDatasets, loadEngine, setJsonVariable
} from '../utils/webr-engine.js';
import { generateExecutionPayload, getVariableOptions, getDefaultVariable, resolveCallTemplate } from '../utils/r-code-generator.js';
import { buildPipelineGraph, orderChainPostOrder, computeColumnMap, computeAnalysisInputColumns } from '../utils/transformation-linker.js';
import { loadMethod } from '../data-loader.js';
import { getSpecParameterValue } from './endpoint-spec.js';

/**
 * Resolve a derivation's slices into concrete {dimension, value} constraints
 * for the payload sent to R. Slice constraints referencing a conceptCategory
 * are substituted with the user's concrete pick from dimensionOverrides;
 * value-level overrides from derivationSliceOverrides are also applied.
 * Returns [] when the derivation declares no slices.
 */
function resolveDerivationSlices(transform, slotKey, dimensionOverrides, categoriesMap, derivSliceOverrides, endpointPicks) {
  const slices = transform?.slices || [];
  if (slices.length === 0) return [];
  const bindings = transform.bindings || [];
  const perSlotOverrides = derivSliceOverrides?.[slotKey] || {};
  const picks = endpointPicks || {};
  return slices.map(s => {
    const constraints = [];
    for (const c of (s.constraints || [])) {
      let dim = c.dimension;
      if (!dim && c.conceptCategory) {
        // Resolve the category with the same precedence as bindings:
        //   per-slot override → endpoint pick → category first member.
        for (let i = 0; i < bindings.length; i++) {
          if (bindings[i].conceptCategory === c.conceptCategory) {
            dim = dimensionOverrides?.[slotKey]?.[i]?.concept;
            if (dim) break;
          }
        }
        if (!dim) dim = picks[c.conceptCategory];
        if (!dim) dim = categoriesMap?.[c.conceptCategory]?.members?.[0]?.concept;
      }
      if (!dim) continue;
      // Apply per-slot value override (user typed a different baseline label, etc.)
      const overrideVal = perSlotOverrides?.[s.name]?.[dim];
      constraints.push({ dimension: dim, value: overrideVal ?? c.value });
    }
    return { name: s.name, constraints };
  });
}

/**
 * Determine expected datasets for configured endpoints based on their dimensions
 * and derivation chains. Returns an array of { domain, reason } objects.
 */
function _getExpectedDatasets(configuredEps) {
  const expected = new Map(); // domain → Set<reason>

  for (const ep of configuredEps) {
    const spec = appState.endpointSpecs?.[ep.id];
    if (!spec) continue;

    // Check if there's a derivation chain (SDTM → needs observation domain + enrichment domains)
    const hasDerivations = (spec.derivationChain || []).some(e => e.derivationOid);
    if (hasDerivations) {
      // Primary observation domain from BC reference
      const bcRef = (appState.selectedStudy?.biomedicalConcepts || [])
        .find(bc => spec.linkedBCIds?.includes(bc.id));
      // Derive domain code from BC TESTCD property name prefix (e.g., VSTESTCD → VS)
      const domainProp = (bcRef?.properties || []).find(p => /TESTCD/i.test(p.name));
      const domainCode = domainProp?.name?.replace(/TESTCD$/i, '') || '';
      if (domainCode) {
        const addReason = (d, r) => {
          if (!expected.has(d)) expected.set(d, new Set());
          expected.get(d).add(r);
        };
        addReason(domainCode, 'observation data');
      }
    }

    // Check dimensions that require auxiliary domains
    const analyses = spec.selectedAnalyses || [];
    for (const analysis of analyses) {
      const bindings = analysis.resolvedBindings || [];
      for (const b of bindings) {
        const concept = (b.concept || '').replace(/@.*/, '');
        if (concept === 'Treatment' || concept === 'Site') {
          if (!expected.has('DM')) expected.set('DM', new Set());
          expected.get('DM').add(`${concept} dimension`);
        }
      }
    }
  }

  return Array.from(expected.entries()).map(([domain, reasons]) => ({
    domain,
    reason: Array.from(reasons).join(', ')
  }));
}

export function renderExecuteAnalysis(container) {
  const study = appState.selectedStudy;
  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3></div>';
    return;
  }

  rebuildSpec();

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));
  const configuredEps = selectedEps.filter(ep =>
    appState.endpointSpecs[ep.id]?.selectedAnalyses?.length > 0
  );

  // Ensure every analysis's methodDef is in cache before render — without it,
  // method config defaults (e.g. alpha=0.05 for ANCOVA) never reach the R
  // engine, leaving `<alpha>` unsubstituted in the callTemplate.
  const missingMethodOids = new Set();
  for (const ep of configuredEps) {
    const analyses = appState.resolvedSpec?.endpoints?.find(r => r.id === ep.id)?.analyses || [];
    for (const a of analyses) {
      const oid = a?.method?.oid;
      if (oid && !appState.methodsCache[oid]) missingMethodOids.add(oid);
    }
  }
  if (missingMethodOids.size > 0) {
    Promise.all([...missingMethodOids].map(oid =>
      loadMethod(appState, oid).catch(err => console.error('loadMethod failed:', oid, err))
    )).then(() => renderExecuteAnalysis(container));
  }

  const webRReady = isInitialized();
  const datasets = appState.loadedDatasets || [];

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Execute Analysis</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
          Run analyses from the specification metadata via WebR
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-derivations">&larr; Derivations</button>
        <button class="btn btn-secondary" id="btn-back-esap">&larr; eSAP</button>
      </div>
    </div>

    <!-- WebR Engine -->
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <h3 style="font-size:14px; font-weight:600;">R Engine</h3>
        ${webRReady
          ? '<div class="exec-status exec-status-ready">WebR Ready</div>'
          : `<div style="display:flex; align-items:center;">
              <button class="btn btn-primary" id="btn-init-webr">Initialize WebR Engine</button>
              <span id="webr-progress" style="margin-left:12px; font-size:12px; color:var(--cdisc-text-secondary);"></span>
             </div>`}
      </div>
    </div>

    <!-- Data Upload -->
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; font-weight:600; margin-bottom:12px;">Analysis / Source Datasets</h3>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
        <label class="btn btn-secondary" style="cursor:pointer;">
          Upload .xpt files
          <input type="file" id="xpt-file-input" accept=".xpt" multiple style="display:none;">
        </label>
        <span id="upload-status" style="font-size:12px; color:var(--cdisc-text-secondary);"></span>
      </div>
      ${datasets.length > 0 ? _renderDatasetTable(datasets) : `
      <div style="font-size:12px; color:var(--cdisc-text-secondary);">No datasets loaded. Upload SDTM or ADaM .xpt files to begin.</div>`}
      ${(() => {
        const expectedDs = _getExpectedDatasets(configuredEps);
        if (expectedDs.length === 0) return '';
        const loadedNames = new Set(datasets.map(d => d.name.toUpperCase()));
        return `<div style="margin-top:8px; font-size:11px; color:var(--cdisc-text-secondary); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span style="font-weight:600;">Expected:</span>
          ${expectedDs.map(d => {
            const loaded = loadedNames.has(d.domain.toUpperCase());
            return `<span style="padding:1px 6px; border-radius:3px; border:1px solid ${loaded ? 'var(--cdisc-primary)' : 'var(--cdisc-border)'}; background:${loaded ? 'var(--cdisc-primary-light)' : 'transparent'};" title="${d.reason}">${d.domain}.xpt ${loaded ? '\u2713' : ''}</span>`;
          }).join('')}
        </div>`;
      })()}
    </div>

    <!-- Endpoint Analyses -->
    <div class="card">
      <h3 style="font-size:14px; font-weight:600; margin-bottom:12px;">
        Configured Analyses <span style="font-weight:400; color:var(--cdisc-text-secondary);">(${configuredEps.length})</span>
      </h3>
      ${configuredEps.length > 0
        ? configuredEps.map(ep => _renderEndpointCard(ep, study, datasets, webRReady)).join('')
        : '<div style="font-size:12px; color:var(--cdisc-text-secondary);">No analyses configured. Set up endpoints in Steps 3-4 first.</div>'}
    </div>

    ${_styles()}
  `;

  _wireEvents(container, configuredEps, study);
}

// ---------------------------------------------------------------------------
// Dataset table
// ---------------------------------------------------------------------------

function _renderDatasetTable(datasets) {
  return `<table style="width:100%; font-size:12px; border-collapse:collapse;">
    <thead><tr style="text-align:left; border-bottom:1px solid var(--cdisc-border);">
      <th style="padding:4px 8px;">Dataset</th><th style="padding:4px 8px;">Rows</th>
      <th style="padding:4px 8px;">Cols</th><th style="padding:4px 8px;">Variables</th>
    </tr></thead>
    <tbody>${datasets.map(ds => `<tr>
      <td style="padding:4px 8px; font-weight:600;">${ds.name}</td>
      <td style="padding:4px 8px;">${ds.nrow.toLocaleString()}</td>
      <td style="padding:4px 8px;">${ds.ncol}</td>
      <td style="padding:4px 8px; font-size:11px; color:var(--cdisc-text-secondary);">${ds.columns.slice(0, 8).join(', ')}${ds.columns.length > 8 ? ', ...' : ''}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ---------------------------------------------------------------------------
// Endpoint card — header + per-analysis sub-cards + combined ARD view
// ---------------------------------------------------------------------------

function _renderEndpointCard(ep, study, datasets, webRReady) {
  const spec = appState.endpointSpecs[ep.id];
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === ep.id);
  const result = _ensureEndpointResult(ep.id);
  const adam = appState.conceptMappings?.adam || {};
  const selectedDataset = (result.datasetOverride || resolvedEp?.targetDataset || '').toLowerCase();
  const analyses = resolvedEp?.analyses || [];

  // Union of languages across all analyses' implementations
  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const langSet = new Set();
  for (const a of analyses) {
    const oid = a?.method?.oid;
    if (!oid) continue;
    for (const impl of (implCatalog[oid] || [])) {
      if (impl.language) langSet.add(impl.language);
    }
  }
  const availableLangs = [...langSet];
  const selectedLang = result.selectedLang || (availableLangs.includes('R') ? 'R' : availableLangs[0] || 'R');

  const anyRunning = analyses.some((_, i) => result.analysisResults?.[i]?.status === 'running');
  const anyComplete = analyses.some((_, i) => result.analysisResults?.[i]?.status === 'complete');
  const canRunAll = webRReady && datasets.length > 0 && analyses.length > 0 && !!selectedDataset;

  const statusClass = anyRunning ? 'exec-card-running' : (anyComplete ? 'exec-card-complete' : '');

  return `
    <div class="exec-endpoint-card ${statusClass}" data-ep-id="${ep.id}">
      <!-- Header -->
      <div class="exec-card-header">
        <div>
          <strong>${ep.name}</strong>
          <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:6px;">${ep.level}</span>
          <span style="font-size:11px; color:var(--cdisc-text-secondary); margin-left:8px;">
            ${analyses.length} ${analyses.length === 1 ? 'analysis' : 'analyses'}
          </span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${anyRunning ? '<span class="badge badge-blue">Running...</span>' : ''}
          <button class="btn btn-primary btn-sm exec-run-all-btn" data-ep-id="${ep.id}"
            ${!canRunAll ? 'disabled style="opacity:0.5;"' : ''}>
            ${anyComplete ? 'Re-run all' : 'Run all'}
          </button>
        </div>
      </div>

      <!-- Endpoint-level meta (shared across analyses) -->
      <div class="exec-card-meta">
        <span>${spec.conceptCategory || ''}</span>
        <span style="display:flex; align-items:center; gap:4px;">Language:
          ${availableLangs.length > 1 ? `
          <select class="exec-lang-select" data-ep-id="${ep.id}" style="font-size:11px; padding:2px 6px;">
            ${availableLangs.map(lang => `<option value="${lang}" ${lang === selectedLang ? 'selected' : ''}>${lang}</option>`).join('')}
          </select>` : `<code>${selectedLang}</code>`}
        </span>
        <span style="display:flex; align-items:center; gap:4px;">Dataset:
          ${datasets.length > 0 ? `
          <select class="exec-dataset-select" data-ep-id="${ep.id}" style="font-size:11px; padding:2px 6px;">
            <option value="">-- select --</option>
            ${datasets.map(ds => `<option value="${ds.name}" ${ds.name === selectedDataset ? 'selected' : ''}>${ds.name} (${ds.nrow.toLocaleString()})</option>`).join('')}
          </select>` : `<code>${selectedDataset || 'not set'}</code>`}
        </span>
        ${anyComplete || anyRunning ? `<button class="btn-reset-exec" data-ep-id="${ep.id}" style="margin-left:auto; font-size:10px; padding:2px 8px; cursor:pointer; background:none; border:1px solid var(--cdisc-border); border-radius:3px; color:var(--cdisc-text-secondary);">Reset</button>` : ''}
      </div>

      <!-- Derivation Pipeline (if any) -->
      ${_renderDerivationSummary(ep)}

      <!-- Analysis sub-cards -->
      ${analyses.length === 0
        ? '<div style="font-size:12px; color:var(--cdisc-text-secondary); padding:10px;">No analyses configured for this endpoint.</div>'
        : analyses.map((analysis, aIdx) =>
            _renderAnalysisSubcard(ep, analysis, aIdx, result, adam, selectedLang, selectedDataset, webRReady, datasets.length > 0, datasets)
          ).join('')}

      <!-- Combined ARD / cube view (long format across all completed analyses) -->
      ${anyComplete ? _renderCombinedARD(ep, analyses, result) : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Analysis sub-card — bindings, slices, formula, generated program, results
// ---------------------------------------------------------------------------

function _renderAnalysisSubcard(ep, analysis, aIdx, resultState, adam, selectedLang, selectedDataset, webRReady, hasDatasets, datasets) {
  const methodOid = analysis?.method?.oid || '';
  const methodDef = appState.methodsCache?.[methodOid] || null;
  const methodName = methodDef?.name || methodOid;

  // Build column-presence and distinct-value lookups across loaded datasets.
  // Used to (a) filter binding-variable candidates to columns that actually
  // exist in loaded data, and (b) populate slice value dropdowns with real
  // data values (e.g. EFFFL → ["N","Y"]) instead of variable names.
  const loadedDatasets = Array.isArray(datasets) ? datasets : [];
  const loadedColumnSet = new Set();
  const dataValuesByVar = {}; // colName → string[] of distinct values (union across datasets)
  for (const ds of loadedDatasets) {
    for (const col of (ds.columns || [])) loadedColumnSet.add(col);
    for (const [col, vals] of Object.entries(ds.distinctValues || {})) {
      if (!Array.isArray(vals) || vals.length === 0) continue;
      const merged = new Set(dataValuesByVar[col] || []);
      vals.forEach(v => merged.add(v));
      dataValuesByVar[col] = [...merged].sort();
    }
  }
  const hasLoadedColumns = loadedColumnSet.size > 0;

  // Detect ADaM-style population flag columns: any character column whose
  // distinct values are a subset of {Y, N}. Used to surface study-specific
  // flag columns (custom names like FLG_PP1, ADASEFFFL) for "domain-keyed"
  // dimensions like Population — whose model byDataType enumerates only
  // CDISC-standard names (ITTFL/SAFFL/EFFFL/...) and so misses non-standard
  // flags entirely.
  const detectedFlagColumns = Object.entries(dataValuesByVar)
    .filter(([, vals]) => vals.length > 0 && vals.length <= 2 && vals.every(v => v === 'Y' || v === 'N'))
    .map(([col]) => col)
    .sort();

  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const implList = implCatalog[methodOid] || [];
  const rImpl = implList.find(i => i.language === 'R') || null;
  const selectedImpl = implList.find(i => i.language === selectedLang) || rImpl;

  // Build a per-analysis spec for payload generation (so the R engine, which
  // reads spec$analyses[[1]], gets the correct analysis)
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === ep.id);
  const singleAnalysisSpec = resolvedEp
    ? { ...resolvedEp, analyses: [analysis], targetDataset: selectedDataset || resolvedEp.targetDataset }
    : null;
  const payload = singleAnalysisSpec
    ? generateExecutionPayload(singleAnalysisSpec, appState.conceptMappings, resultState.varOverrides, methodDef, rImpl, null, null, null)
    : null;

  const aResult = resultState.analysisResults?.[aIdx] || {};
  const aStatusClass = aResult.status === 'complete' ? 'exec-sub-complete'
    : aResult.status === 'running' ? 'exec-sub-running'
    : aResult.status === 'error' ? 'exec-sub-error' : '';

  const bindings = analysis?.resolvedBindings || [];
  const slices = analysis?.resolvedSlices || [];
  const expression = analysis?.resolvedExpression;

  // Split bindings into "active" (consumed by the method or structurally
  // functional) and "inactive template defaults" (bindings that aren't used).
  // Method input_roles (response, group) plus structural roles (constraint,
  // partition) are always active — the engine uses them even if the method
  // definition doesn't explicitly list them as input roles.
  const STRUCTURAL_ROLES = new Set(['constraint', 'partition']);
  const methodInputRoleNames = new Set(
    (methodDef?.input_roles || []).map(r => r.name)
  );
  const inputBindings = bindings.filter(b => b.direction !== 'output');
  const activeBindings = methodInputRoleNames.size > 0
    ? inputBindings.filter(b => methodInputRoleNames.has(b.methodRole) || STRUCTURAL_ROLES.has(b.methodRole))
    : inputBindings;
  const inactiveBindings = methodInputRoleNames.size > 0
    ? inputBindings.filter(b => !methodInputRoleNames.has(b.methodRole) && !STRUCTURAL_ROLES.has(b.methodRole))
    : [];

  const canRun = webRReady && hasDatasets && !!payload && !!selectedDataset;

  return `
    <div class="exec-analysis-sub ${aStatusClass}" data-ep-id="${ep.id}" data-a-idx="${aIdx}">
      <div class="exec-sub-header">
        <div>
          <span class="exec-sub-seq">#${aIdx + 1}</span>
          <strong>${methodName}</strong>
          <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-left:6px;">${methodOid}</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${aResult.status === 'complete' ? '<span class="badge badge-teal">Complete</span>' : ''}
          ${aResult.status === 'error' ? '<span class="badge" style="background:var(--cdisc-error); color:white;">Error</span>' : ''}
          ${aResult.status === 'running' ? '<span class="badge badge-blue">Running...</span>' : ''}
          <button class="btn btn-primary btn-sm exec-run-btn" data-ep-id="${ep.id}" data-a-idx="${aIdx}"
            ${!canRun ? 'disabled style="opacity:0.5;"' : ''}>
            ${aResult.status === 'complete' ? 'Re-run' : 'Execute'}
          </button>
        </div>
      </div>

      <!-- Resolved Bindings — view-mode-aware variable display -->
      ${activeBindings.length > 0 ? (() => {
        const viewMode = appState.modelViewMode || 'concepts';
        const isConceptMode = viewMode === 'concepts';
        const varColLabel = isConceptMode ? 'Concept Key' : 'Implementation Variable';
        return `
      <div class="exec-bindings-section">
        <div class="exec-bindings-title">RESOLVED BINDINGS (from specification)</div>
        <table class="exec-bindings-table">
          <thead><tr><th>Role</th><th>Concept</th><th>${varColLabel}</th><th>Type</th><th>Slice</th></tr></thead>
          <tbody>${activeBindings.map(b => {
            const concept = b.concept?.replace(/@.*/, '') || '';
            if (isConceptMode) {
              // In concept mode, show the concept key the engine will use (no store-specific dropdown)
              let conceptKey = concept;
              if (b.qualifierType === 'facet' && b.qualifierValue) {
                const facet = b.qualifierValue.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('.');
                conceptKey = concept + '.' + facet;
              }
              return '<tr>' +
                '<td>' + b.methodRole + '</td>' +
                '<td><code>' + concept + '</code></td>' +
                '<td><code>' + conceptKey + '</code></td>' +
                '<td>' + b.dataStructureRole + '</td>' +
                '<td>' + (b.slice || '--') + '</td>' +
              '</tr>';
            }
            const allOptions = getVariableOptions(concept, adam, b.requiredValueType, b.dataStructureRole);
            // When data is loaded, narrow candidates to columns that exist in some loaded
            // dataset — but always include the current default so the row never goes blank.
            const overrides = resultState.varOverrides || {};
            const displayVar = overrides[concept]
              || getDefaultVariable(concept, b.dataStructureRole, adam);
            const options = hasLoadedColumns
              ? [...new Set([...allOptions.filter(v => loadedColumnSet.has(v)), displayVar].filter(Boolean))]
              : allOptions;
            return '<tr>' +
              '<td>' + b.methodRole + '</td>' +
              '<td><code>' + concept + '</code></td>' +
              '<td>' + (options.length > 1
                ? '<select class="exec-var-override" data-ep-id="' + ep.id + '" data-concept="' + concept + '"' +
                  ' style="font-size:11px; padding:2px 4px; font-family:monospace;">' +
                  options.map(v => '<option value="' + v + '"' + (v === displayVar ? ' selected' : '') + '>' + v + '</option>').join('') +
                  '</select>'
                : '<code>' + displayVar + '</code>') + '</td>' +
              '<td>' + b.dataStructureRole + '</td>' +
              '<td>' + (b.slice || '--') + '</td>' +
            '</tr>';
          }).join('')}
          </tbody>
        </table>
        ${inactiveBindings.length > 0 ? `
          <details style="margin-top:6px;">
            <summary style="font-size:10px; color:var(--cdisc-text-secondary); cursor:pointer;">
              Template defaults not consumed by ${methodOid} (${inactiveBindings.length})
            </summary>
            <table class="exec-bindings-table" style="opacity:0.6; margin-top:4px;">
              <thead><tr><th>Role</th><th>Concept</th><th>Type</th><th>Slice</th></tr></thead>
              <tbody>${inactiveBindings.map(b => `
                <tr>
                  <td>${b.methodRole}</td>
                  <td><code>${b.concept?.replace(/@.*/, '') || ''}</code></td>
                  <td>${b.dataStructureRole}</td>
                  <td>${b.slice || '--'}</td>
                </tr>
              `).join('')}
              </tbody>
            </table>
          </details>
        ` : ''}
      </div>`;
      })() : ''}

      <!-- Resolved Slices -->
      ${slices.length > 0 ? (() => {
        const isConceptMode = (appState.modelViewMode || 'concepts') === 'concepts';
        // Build USDM value suggestions per dimension concept.
        // Population is intentionally omitted: USDM populations[].name is an internal
        // identifier (e.g. "AP_1") that never matches an ADaM Y/N flag value, and the
        // slice value here must be a literal that filters the bound column.
        const usdmValues = {};
        const parsedStudy = appState.selectedStudy;
        if (parsedStudy) {
          const paramOpts = getEndpointParameterOptions(parsedStudy, ep.id, appState.endpointSpecs);
          if (paramOpts?.length) usdmValues['Parameter'] = paramOpts;
          const armOpts = getArmNames(parsedStudy);
          if (armOpts?.length) usdmValues['Treatment'] = armOpts;
          const visitOpts = getVisitLabels(parsedStudy);
          if (visitOpts?.length) usdmValues['AnalysisVisit'] = visitOpts;
        }
        return `
      <div class="exec-bindings-section">
        <div class="exec-bindings-title">RESOLVED SLICES (cube constraints)</div>
        <table class="exec-bindings-table">
          <thead><tr><th>Slice</th><th>Dimension</th><th>${isConceptMode ? 'Concept Key' : 'Implementation Variable'}</th><th>Value</th></tr></thead>
          <tbody>${slices.map(s => {
            const dims = s.resolvedValues || {};
            return Object.entries(dims).map(([dim, val]) => {
              const allDimOptions = getVariableOptions(dim, adam, null, 'dimension');
              // For domain-keyed dimensions like Population (whose byDataType uses
              // clinical descriptors instead of standard data-type keys), the model's
              // enumerated variables only cover CDISC-standard names. Augment with
              // every Y/N flag column detected in the loaded data so study-specific
              // flags appear in the dropdown.
              const dimEntry = adam?.dimensions?.[dim] || adam?.concepts?.[dim];
              const isDomainKeyed = dimEntry?.byDataType
                && !Object.keys(dimEntry.byDataType).some(k => ['string', 'code', 'id', 'decimal', 'integer'].includes(k));
              const augmentedDimOptions = isDomainKeyed
                ? [...new Set([...allDimOptions, ...detectedFlagColumns])]
                : allDimOptions;
              const sliceOverrides = resultState.sliceOverrides || {};
              const overrideKey = `${s.name}|${dim}`;
              const currentVal = sliceOverrides[overrideKey]?.value ?? val;
              const currentVar = sliceOverrides[overrideKey]?.variable;
              const defaultVar = getDefaultVariable(dim, 'dimension', adam);
              // For domain-keyed dimensions, prefer a flag column that ACTUALLY
              // exists in loaded data over the model's first-listed default
              // (which may be a CDISC standard the study doesn't use).
              const displayVar = currentVar
                || (isDomainKeyed && !loadedColumnSet.has(defaultVar) && detectedFlagColumns[0])
                || defaultVar;
              const dimOptions = hasLoadedColumns
                ? [...new Set([...augmentedDimOptions.filter(v => loadedColumnSet.has(v)), displayVar].filter(Boolean))]
                : augmentedDimOptions;
              const usdmOpts = usdmValues[dim] || [];
              const dataVals = dataValuesByVar[displayVar] || [];
              const hasAnyValueOptions = usdmOpts.length > 0 || dataVals.length > 0;
              return `<tr>
                <td>${s.name}</td>
                <td>${dim}</td>
                <td>${isConceptMode
                  ? `<code>${dim}</code>`
                  : (dimOptions.length > 1 ? `
                  <select class="exec-slice-var-override" data-ep-id="${ep.id}" data-slice="${s.name}" data-dim="${dim}"
                    style="font-size:11px; padding:2px 4px; font-family:monospace;">
                    ${dimOptions.map(v => `<option value="${v}" ${v === displayVar ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>` : `<code>${displayVar}</code>`)}</td>
                <td>${hasAnyValueOptions ? `
                  <select class="exec-slice-val-override" data-ep-id="${ep.id}" data-slice="${s.name}" data-dim="${dim}"
                    style="font-size:11px; padding:2px 6px; width:200px;">
                    ${dataVals.length > 0 ? `<optgroup label="${displayVar} values">
                      ${dataVals.map(v => `<option value="${_escapeAttr(v)}" ${v === currentVal ? 'selected' : ''}>${v}</option>`).join('')}
                    </optgroup>` : ''}
                    ${usdmOpts.length > 0 ? `<optgroup label="USDM">
                      ${usdmOpts.map(v => `<option value="${_escapeAttr(v)}" ${v === currentVal ? 'selected' : ''}>${v}</option>`).join('')}
                    </optgroup>` : ''}
                    <optgroup label="Template">
                      <option value="${_escapeAttr(val)}" ${val === currentVal && !usdmOpts.includes(val) && !dataVals.includes(val) ? 'selected' : ''}>${val}</option>
                    </optgroup>
                  </select>`
                  : `<input class="exec-slice-val-override" data-ep-id="${ep.id}" data-slice="${s.name}" data-dim="${dim}"
                  value="${_escapeAttr(currentVal)}" style="font-size:11px; padding:2px 6px; width:180px;
                  border:1px solid var(--cdisc-border); border-radius:3px;">`}</td>
              </tr>`;
            }).join('');
          }).join('')}
          </tbody>
        </table>
      </div>`;
      })() : ''}

      <!-- Expression / formula -->
      ${expression ? (() => {
        const varMap = {};
        for (const b of bindings) {
          if (b.direction === 'output') continue;
          const concept = (b.concept || '').replace(/@.*/, '');
          const userOverride = resultState.varOverrides?.[concept];
          const defaultVar = getDefaultVariable(concept, b.dataStructureRole, adam);
          varMap[concept] = userOverride || defaultVar;
        }
        let resolved = expression.resolved || '';
        const keys = Object.keys(varMap).sort((a, b) => b.length - a.length);
        for (const key of keys) {
          resolved = resolved.replace(new RegExp(`\\b${key}(@\\w+)?\\b`, 'g'), varMap[key]);
        }
        return `
        <div class="exec-bindings-section">
          <div class="exec-bindings-title">FORMULA (${expression.notation || 'unknown'})</div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <code style="font-size:12px; background:var(--cdisc-background); padding:4px 10px; border-radius:4px; display:inline-block; color:var(--cdisc-text-secondary);">
              ${_escapeHtml((expression.resolved || '').replace(/@\w+/g, ''))}
            </code>
            <code style="font-size:12px; background:var(--cdisc-background); padding:4px 10px; border-radius:4px; display:inline-block; font-weight:600;">
              ${_escapeHtml(resolved)}
            </code>
          </div>
        </div>`;
      })() : ''}

      <!-- Spec JSON + Concept Mappings -->
      <div style="display:flex; gap:0; margin-top:12px; flex-wrap:wrap;">
        <details class="exec-code-details">
          <summary>Specification JSON</summary>
          <pre class="exec-code-pre">${payload ? _escapeHtml(payload.specJson) : 'No specification available'}</pre>
        </details>
        <details class="exec-code-details">
          <summary>Concept Mappings</summary>
          <pre class="exec-code-pre">${payload ? _escapeHtml(payload.mappingJson) : ''}</pre>
        </details>
      </div>

      <!-- Error -->
      ${aResult.error ? `
      <div style="margin-top:8px; padding:10px 14px; background:rgba(220,53,69,0.08); border:1px solid var(--cdisc-error); border-radius:var(--radius); font-size:12px; color:var(--cdisc-error); white-space:pre-wrap;">
        <strong>Error:</strong> ${_escapeHtml(aResult.error)}
      </div>` : ''}

      <!-- Console output (diagnostics) -->
      ${aResult.console ? `
      <details style="margin-top:6px; font-size:11px;">
        <summary style="cursor:pointer; color:var(--cdisc-text-secondary);">Engine console output</summary>
        <pre style="margin:4px 0; padding:8px; background:rgba(0,0,0,0.04); border-radius:var(--radius); font-size:10px; max-height:300px; overflow:auto;">${_escapeHtml(aResult.console)}</pre>
      </details>` : ''}

      <!-- Results (per-analysis) -->
      ${aResult.results ? _renderARDResults(aResult.results, analysis, adam, resultState.varOverrides) : ''}

      <!-- Generated Program -->
      ${selectedImpl ? (() => {
        const liveOvr = appState.endpointSpecs?.[ep.id]?.methodConfigOverrides || appState.methodConfig || {};
        const configs = _buildConfigs(analysis, methodDef, liveOvr);
        // Mirror _executeAnalysis's effectiveOverrides: promote each binding's
        // visible default into the override map UNLESS that default is the
        // canonical primary that ingest will rename away (in which case the
        // engine should use the concept-key column directly). Keeps the
        // preview formula in sync with what actually runs.
        const previewOverrides = { ...(resultState.varOverrides || {}) };
        for (const b of bindings) {
          if (b.direction === 'output') continue;
          const concept = (b.concept || '').replace(/@.*/, '');
          if (!concept || previewOverrides[concept] !== undefined) continue;
          const entry = adam?.dimensions?.[concept] || adam?.concepts?.[concept];
          const bt = entry?.byDataType;
          if (!bt) continue;
          const def = getDefaultVariable(concept, b.dataStructureRole, adam);
          if (!def || def === concept) continue;
          if (hasLoadedColumns && !loadedColumnSet.has(def)) continue;
          if (def === Object.values(bt)[0]) continue;
          previewOverrides[concept] = def;
        }
        // The R engine filters `selectedDataset` through execute_cube → analysis_data
        // BEFORE running the call template. Show the same name in the preview so it's
        // clear the model fits filtered rows, not the raw upload.
        const callCode = resolveCallTemplate(selectedImpl, bindings, previewOverrides, adam, configs, 'analysis_data', analysis?.outputConfiguration);
        const sliceOverridesForPreview = resultState.sliceOverrides || {};
        const cubeHeader = _renderCubePreviewHeader(selectedDataset, slices, sliceOverridesForPreview, previewOverrides);
        const resolvedCode = (cubeHeader ? cubeHeader + '\n\n' : '') + callCode;
        return `
      <div class="exec-bindings-section" style="margin-top:16px;">
        <div class="exec-bindings-title">GENERATED ${selectedLang} PROGRAM</div>
        <div style="display:flex; gap:0; flex-wrap:wrap;">
          ${payload && selectedLang === 'R' ? `
          <details class="exec-code-details" open>
            <summary>Metadata-Driven (via engine)</summary>
            <pre class="exec-code-pre">${_escapeHtml(payload.bootstrapCode)}</pre>
          </details>` : ''}
          <details class="exec-code-details" open>
            <summary>Resolved (standalone)</summary>
            <pre class="exec-code-pre">${resolvedCode ? _escapeHtml(resolvedCode) : 'No implementation available'}</pre>
          </details>
        </div>
      </div>`;
      })() : `
      <div class="exec-bindings-section" style="margin-top:16px;">
        <div class="exec-bindings-title">GENERATED ${selectedLang} PROGRAM</div>
        <div style="font-size:11px; color:var(--cdisc-text-secondary); padding:6px 0;">No ${selectedLang} implementation available for ${methodOid}.</div>
      </div>`}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// ARD results rendering
// ---------------------------------------------------------------------------

/**
 * Build a reverse lookup: ADaM variable name → { role, roleLabel, concept }.
 * Used to annotate term-level result rows with their dimension type.
 */
function _buildTermRoleMap(analysisBindings, adam, varOverrides) {
  const map = {};
  if (!analysisBindings) return map;
  for (const b of analysisBindings) {
    if (b.direction === 'output') continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    const role = b.methodRole || '';

    let adamVar;
    if (varOverrides?.[concept]) {
      adamVar = varOverrides[concept];
    } else {
      const entry = adam?.concepts?.[concept] || adam?.dimensions?.[concept];
      if (entry?.byDataType) {
        const bt = entry.byDataType;
        adamVar = b.dataStructureRole === 'measure'
          ? (bt.decimal || bt.baseline || bt.code || bt.string)
          : (bt.code || bt.string || bt.decimal);
        if (!adamVar) adamVar = entry.variable?.split('/')[0];
      } else {
        adamVar = concept.toUpperCase();
      }
    }
    if (!adamVar) continue;

    const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    map[adamVar] = { role, roleLabel, concept };
  }
  return map;
}

function _classifyTerm(term, roleMap) {
  if (!term) return { roleLabel: '', role: '', concept: '' };
  const t = String(term).trim();
  if (t.includes(':')) {
    const parts = t.split(':');
    const entries = parts.map(p => roleMap[p]);
    const roles = entries.map(e => e?.role || '').filter(Boolean);
    const concepts = entries.map(e => e?.concept || '').filter(Boolean);
    const concept = concepts.length === 2 ? `${concepts[0]}:${concepts[1]}` : '';
    const role = roles.length === 2 ? `${roles[0]}:${roles[1]}` : '';
    return { roleLabel: 'Interaction', role, concept };
  }
  const entry = roleMap[t];
  if (!entry) return { roleLabel: '', role: '', concept: '' };
  return { roleLabel: entry.roleLabel, role: entry.role, concept: entry.concept };
}

function _filterRowsByOutputConfig(rows, termKey, roleMap, selectedDimensions) {
  if (!selectedDimensions || !termKey) return rows;
  const selected = new Set(selectedDimensions);
  return rows.filter(row => {
    const term = row[termKey];
    const { concept } = _classifyTerm(term, roleMap);
    if (!concept) return true;
    return selected.has(concept);
  });
}

function _renderARDResults(results, analysis, adam, varOverrides) {
  const sections = [];
  const roleMap = _buildTermRoleMap(analysis?.resolvedBindings, adam, varOverrides);

  const outputConfigArr = analysis?.outputConfiguration || [];
  const outputConfigMap = {};
  for (const cfg of outputConfigArr) {
    outputConfigMap[cfg.outputClass] = cfg.selectedDimensions;
  }

  if (results.computed_value) {
    sections.push({ id: 'computed', label: 'Result',
      html: _renderComputedValueTable(results.computed_value, analysis) });
  }
  if (results.ls_means) {
    sections.push({ id: 'lsmeans', label: 'LS Means',
      html: _renderTable(_toRows(results.ls_means), ['Group', 'estimate', 'SE', 'df', 'CI_lower', 'CI_upper']) });
  }
  if (results.contrasts) {
    sections.push({ id: 'contrasts', label: 'Contrasts',
      html: _renderTable(_toRows(results.contrasts), ['Contrast', 'estimate', 'SE', 'df', 'CI_lower', 'CI_upper', 't_statistic', 'p_value']) });
  }
  if (results.type3_tests) {
    let rows = _toRows(results.type3_tests);
    const selectedDims = outputConfigMap['type3_tests'];
    rows = _filterRowsByOutputConfig(rows, 'Term', roleMap, selectedDims);
    sections.push({ id: 'type3', label: 'Type III Tests',
      html: _renderAnnotatedTable(rows, ['Term', 'Type', 'SS', 'df', 'F_statistic', 'p_value'], 'Term', roleMap) });
  }
  if (results.fit_statistics) {
    sections.push({ id: 'fit', label: 'Fit Statistics',
      html: `<table class="exec-ard-table"><thead><tr><th>Statistic</th><th>Value</th></tr></thead><tbody>
        ${Object.entries(results.fit_statistics).map(([k, v]) => `<tr><td>${k}</td><td>${_fmt(v)}</td></tr>`).join('')}
      </tbody></table>` });
  }
  if (sections.length === 0) return '';

  return `
    <div class="exec-ard-tabs">${sections.map((s, i) =>
      `<div class="exec-ard-tab ${i === 0 ? 'active' : ''}" data-tab="${s.id}">${s.label}</div>`
    ).join('')}</div>
    ${sections.map((s, i) =>
      `<div class="exec-ard-section ${i === 0 ? 'active' : ''}" data-tab-panel="${s.id}">${s.html}</div>`
    ).join('')}
  `;
}

/**
 * Render a computed_value result (from descriptive stats: Count, Mean, SD,
 * Median, Min, Max). The R outputMapping returns positional dim_1/dim_2/dim_3
 * columns plus a `value` column. We rename the dim columns to the concept names
 * of the fixed_effect bindings (in order) for display.
 */
function _renderComputedValueTable(computed, analysis) {
  const rows = _toRows(computed);
  if (!rows?.length) return '<div style="font-size:12px; color:var(--cdisc-text-secondary);">No data</div>';

  const constraintDims = _getConstraintDimensions(analysis);
  const dimConcepts = _getFixedEffectConcepts(analysis);
  const statName = _getStatisticName(analysis);

  // Figure out which dim columns have content (drop empty trailing dims)
  const dimCols = ['dim_1', 'dim_2', 'dim_3'].filter((c, i) => {
    if (i >= dimConcepts.length) return false;
    return rows.some(r => r[c] != null && r[c] !== '');
  });
  const headers = [
    ...constraintDims.map(c => c.concept),
    ...dimCols.map((_, i) => dimConcepts[i] || `Dim ${i + 1}`),
    statName || 'Value'
  ];

  return `<table class="exec-ard-table">
    <thead><tr>${headers.map(h => `<th>${_escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => {
      const cells = [
        ...constraintDims.map(c => `<td>${_escapeHtml(c.value)}</td>`),
        ...dimCols.map(c => `<td>${_escapeHtml(row[c] ?? '')}</td>`),
        `<td>${_fmt(row.value)}</td>`
      ];
      return `<tr>${cells.join('')}</tr>`;
    }).join('')}</tbody>
  </table>`;
}

/**
 * Combined ARD / cube view — long format table spanning all completed
 * analyses on an endpoint. Columns: dim concepts... + Statistic + Value.
 * Rows: one per (group × statistic) tuple.
 */
function _renderCombinedARD(ep, analyses, resultState) {
  // Gather completed analyses with computed_value results
  const completed = [];
  for (let i = 0; i < analyses.length; i++) {
    const aRes = resultState.analysisResults?.[i];
    if (aRes?.status !== 'complete' || !aRes.results?.computed_value) continue;
    completed.push({ analysis: analyses[i], results: aRes.results });
  }
  if (completed.length === 0) return '';

  // Union of constraint + fixed-effect dimensions across analyses
  const constraintConceptUnion = [];
  const dimConceptUnion = [];
  for (const { analysis } of completed) {
    for (const c of _getConstraintDimensions(analysis)) {
      if (!constraintConceptUnion.find(x => x.concept === c.concept)) constraintConceptUnion.push(c);
    }
    for (const c of _getFixedEffectConcepts(analysis)) {
      if (!dimConceptUnion.includes(c)) dimConceptUnion.push(c);
    }
  }

  // Build long-format rows
  const rows = [];
  for (const { analysis, results } of completed) {
    const analysisConstraints = _getConstraintDimensions(analysis);
    const concepts = _getFixedEffectConcepts(analysis);
    const statName = _getStatisticName(analysis) || analysis?.method?.oid || 'value';
    const cvRows = _toRows(results.computed_value);
    for (const cv of cvRows) {
      const row = { Statistic: statName, Value: cv.value };
      // Add constraint dimension values (constant per analysis)
      for (const c of analysisConstraints) {
        row[c.concept] = c.value;
      }
      // Map this analysis' dim_1..dim_N onto concept names
      for (let i = 0; i < concepts.length; i++) {
        row[concepts[i]] = cv[`dim_${i + 1}`] ?? '';
      }
      rows.push(row);
    }
  }

  if (rows.length === 0) return '';

  const headers = [...constraintConceptUnion.map(c => c.concept), ...dimConceptUnion, 'Statistic', 'Value'];

  return `
    <div class="exec-combined-ard">
      <div class="exec-bindings-title" style="margin-top:16px; margin-bottom:6px;">COMBINED ARD (long format)</div>
      <table class="exec-ard-table">
        <thead><tr>${headers.map(h => `<th>${_escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row => `<tr>${headers.map(h => {
          const val = row[h];
          if (val == null || val === '') return '<td style="color:var(--cdisc-text-secondary);">--</td>';
          if (h === 'Value') return `<td>${_fmt(val)}</td>`;
          return `<td>${_escapeHtml(String(val))}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

/**
 * Extract the ordered list of concept names bound to any input role whose
 * statistical role is 'fixed_effect'. The binding stores `methodRole` (the
 * method input_role `name`, e.g. "group" or "fixed_effect"), which may differ
 * from the statistical role — M.Mean declares its grouping input as
 * name="group", statisticalRole="fixed_effect". We look up the method
 * definition to map roles correctly.
 */
function _getFixedEffectConcepts(analysis) {
  const methodOid = analysis?.method?.oid;
  const methodDef = methodOid ? appState.methodsCache?.[methodOid] : null;
  // Find input_role names whose statisticalRole is 'fixed_effect'
  const fixedEffectRoleNames = new Set();
  for (const ir of (methodDef?.input_roles || [])) {
    if (ir.statisticalRole === 'fixed_effect') fixedEffectRoleNames.add(ir.name);
  }
  // Fallback: if method def is unavailable or declares none, accept the
  // common literal role names used across the library.
  if (fixedEffectRoleNames.size === 0) {
    fixedEffectRoleNames.add('fixed_effect');
    fixedEffectRoleNames.add('group');
  }

  const out = [];
  for (const b of (analysis?.resolvedBindings || [])) {
    if (b.direction === 'output') continue;
    if (!fixedEffectRoleNames.has(b.methodRole)) continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    if (concept && !out.includes(concept)) out.push(concept);
  }
  return out;
}

/**
 * Get constraint dimensions and their resolved values from the analysis slices.
 * These are dimensions that filter the data (e.g., Parameter = "Weight (kg)")
 * but don't appear in the R result because the method only groups by fixed_effects.
 * Returns array of { concept, value } objects.
 */
function _getConstraintDimensions(analysis) {
  const constraints = [];
  const sliceValues = {};
  for (const s of (analysis?.resolvedSlices || [])) {
    for (const [dim, val] of Object.entries(s.resolvedValues || {})) {
      sliceValues[dim] = val;
    }
  }
  for (const b of (analysis?.resolvedBindings || [])) {
    if (b.methodRole !== 'constraint') continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    if (concept && sliceValues[concept]) {
      constraints.push({ concept, value: sliceValues[concept] });
    }
  }
  return constraints;
}

/** Look up the statistic name (e.g. 'n', 'mean', 'sd') for a method. */
function _getStatisticName(analysis) {
  const methodOid = analysis?.method?.oid;
  if (!methodOid) return null;
  const methodDef = appState.methodsCache?.[methodOid];
  const cls = methodDef?.output_specification?.output_classes?.[0];
  return cls?.statistics?.[0] || null;
}

function _renderAnnotatedTable(rows, columns, termKey, roleMap) {
  if (!rows?.length) return '<div style="font-size:12px; color:var(--cdisc-text-secondary);">No data</div>';
  return `<table class="exec-ard-table">
    <thead><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => {
      const { roleLabel } = _classifyTerm(row[termKey], roleMap);
      return `<tr>${columns.map(c => {
        if (c === 'Type') {
          const color = roleLabel === 'Interaction' ? 'var(--cdisc-accent2)'
            : roleLabel === 'Covariate' ? 'var(--cdisc-text-secondary)'
            : 'var(--cdisc-primary)';
          return `<td style="font-size:10px; font-style:italic; color:${color};">${roleLabel}</td>`;
        }
        return `<td>${_fmt(row[c])}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody>
  </table>`;
}

function _renderTable(rows, columns) {
  if (!rows?.length) return '<div style="font-size:12px; color:var(--cdisc-text-secondary);">No data</div>';
  return `<table class="exec-ard-table">
    <thead><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row =>
      `<tr>${columns.map(c => `<td>${_fmt(row[c])}</td>`).join('')}</tr>`
    ).join('')}</tbody>
  </table>`;
}

function _toRows(df) {
  if (Array.isArray(df)) return df;
  const keys = Object.keys(df);
  if (keys.length === 0) return [];
  const first = df[keys[0]];
  const n = Array.isArray(first) ? first.length : 1;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const k of keys) row[k] = Array.isArray(df[k]) ? df[k][i] : df[k];
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function _wireEvents(container, configuredEps, study) {
  container.querySelector('#btn-back-derivations')?.addEventListener('click', () => navigateTo(6));
  container.querySelector('#btn-back-esap')?.addEventListener('click', () => navigateTo(7));

  // WebR init
  container.querySelector('#btn-init-webr')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-init-webr');
    const progress = container.querySelector('#webr-progress');
    btn.disabled = true;
    btn.textContent = 'Initializing...';
    try {
      await initWebR(msg => { if (progress) progress.textContent = msg; });
      progress.textContent = 'Loading AC/DC engine...';
      await loadEngine();
      renderExecuteAnalysis(container);
    } catch (err) {
      if (progress) progress.textContent = `Error: ${err.message}`;
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  });

  // XPT upload
  container.querySelector('#xpt-file-input')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const status = container.querySelector('#upload-status');
    if (!isInitialized()) { if (status) status.textContent = 'Initialize WebR first.'; return; }

    for (const file of files) {
      const name = file.name.replace(/\.xpt$/i, '').toUpperCase();
      if (status) status.textContent = `Loading ${name}...`;
      try {
        await loadXptFile(await file.arrayBuffer(), name);
        appState.loadedDatasets = getLoadedDatasets();
      } catch (err) {
        if (status) status.textContent = `Error: ${err.message}`;
      }
    }
    renderExecuteAnalysis(container);
  });

  // Slice value/variable overrides
  container.querySelectorAll('.exec-slice-var-override, .exec-slice-val-override').forEach(el => {
    el.addEventListener('change', () => {
      const epId = el.dataset.epId;
      const key = `${el.dataset.slice}|${el.dataset.dim}`;
      const res = _ensureEndpointResult(epId);
      if (!res.sliceOverrides) res.sliceOverrides = {};
      if (!res.sliceOverrides[key]) res.sliceOverrides[key] = {};
      if (el.classList.contains('exec-slice-var-override')) {
        res.sliceOverrides[key].variable = el.value;
      } else {
        res.sliceOverrides[key].value = el.value;
      }
    });
  });

  // Variable override dropdowns — re-render to update bootstrap + formula display
  container.querySelectorAll('.exec-var-override').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = sel.dataset.epId;
      const concept = sel.dataset.concept;
      const res = _ensureEndpointResult(epId);
      if (!res.varOverrides) res.varOverrides = {};
      res.varOverrides[concept] = sel.value;
      renderExecuteAnalysis(container);
    });
  });

  // Language selection
  container.querySelectorAll('.exec-lang-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = sel.dataset.epId;
      const res = _ensureEndpointResult(epId);
      res.selectedLang = sel.value;
      renderExecuteAnalysis(container);
    });
  });

  // Dataset selection
  container.querySelectorAll('.exec-dataset-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = sel.dataset.epId;
      const res = _ensureEndpointResult(epId);
      res.datasetOverride = sel.value;
      renderExecuteAnalysis(container);
    });
  });

  // Derivation source store/domain overrides (execution-layer config)
  container.querySelectorAll('.exec-deriv-config-input').forEach(el => {
    el.addEventListener('change', () => {
      const epId = el.dataset.epId;
      const slotKey = el.dataset.slotKey;
      const configKey = el.dataset.configKey;
      let value = el.value;
      if (!isNaN(value) && value !== '') value = Number(value);
      const spec = appState.endpointSpecs?.[epId];
      if (!spec) return;
      if (!spec.derivationConfigValues) spec.derivationConfigValues = {};
      if (!spec.derivationConfigValues[slotKey]) spec.derivationConfigValues[slotKey] = {};
      if (value === '' || value == null) {
        delete spec.derivationConfigValues[slotKey][configKey];
      } else {
        spec.derivationConfigValues[slotKey][configKey] = value;
      }
    });
  });

  // Reset execution (clears per-analysis results but preserves selections)
  container.querySelectorAll('.btn-reset-exec').forEach(btn => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.epId;
      const prev = appState.endpointResults[epId] || {};
      appState.endpointResults[epId] = {
        varOverrides: prev.varOverrides,
        datasetOverride: prev.datasetOverride,
        selectedLang: prev.selectedLang,
        sliceOverrides: prev.sliceOverrides,
        analysisResults: {}
      };
      renderExecuteAnalysis(container);
    });
  });

  // Per-analysis execute buttons
  container.querySelectorAll('.exec-run-btn').forEach(btn => {
    btn.addEventListener('click', () => _executeAnalysis(container, btn.dataset.epId, Number(btn.dataset.aIdx)));
  });

  // Run-all (batch) button
  container.querySelectorAll('.exec-run-all-btn').forEach(btn => {
    btn.addEventListener('click', () => _executeAllAnalyses(container, btn.dataset.epId));
  });

  // Derivation-only buttons
  container.querySelectorAll('.exec-derive-only-btn').forEach(btn => {
    btn.addEventListener('click', () => _executeDerivationOnly(container, btn.dataset.epId));
  });

  // ARD tabs
  container.querySelectorAll('.exec-ard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const sub = tab.closest('.exec-analysis-sub') || tab.closest('.exec-endpoint-card');
      if (!sub) return;
      // Only toggle tabs within the same tab group (sub-card)
      const tabGroup = tab.parentElement;
      const panels = tabGroup.nextElementSibling
        ? Array.from(tabGroup.parentElement.querySelectorAll(':scope > .exec-ard-section'))
        : [];
      tabGroup.querySelectorAll('.exec-ard-tab').forEach(t => t.classList.remove('active'));
      panels.forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      const target = tabGroup.parentElement.querySelector(`:scope > [data-tab-panel="${tab.dataset.tab}"]`);
      if (target) target.classList.add('active');
    });
  });
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute a single analysis for an endpoint. Builds a per-analysis patched
 * spec (with analyses: [selected]) so the single-analysis R engine receives
 * the correct one via spec$analyses[[1]].
 */
async function _executeAnalysis(container, epId, aIdx) {
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === epId);
  if (!resolvedEp) return;
  const analysis = resolvedEp.analyses?.[aIdx];
  if (!analysis) return;

  // Ensure methodDef is in cache before building the payload — without it,
  // method config defaults (alpha, ss_type, …) never reach R and template
  // placeholders like <alpha> survive into the executed code.
  const oid = analysis?.method?.oid;
  if (oid && !appState.methodsCache[oid]) {
    try { await loadMethod(appState, oid); }
    catch (err) { console.error('loadMethod failed:', oid, err); }
  }

  // Always reload the engine to pick up latest changes
  try {
    await loadEngine();
  } catch (err) {
    _setAnalysisResult(epId, aIdx, { status: 'error', error: `Failed to load engine: ${err.message}` });
    renderExecuteAnalysis(container);
    return;
  }

  const resultState = _ensureEndpointResult(epId);
  const overrides = resultState.varOverrides || null;
  const selectedDataset = (resultState.datasetOverride || resolvedEp.targetDataset || '').toLowerCase();

  // Snapshot loaded-data column-presence + Y/N flag detection — same logic as
  // the render path uses, so the engine sees the same column choices the user
  // saw in the dropdowns (whether or not they explicitly clicked).
  const _adamForExec = appState.conceptMappings?.adam || {};
  const _loadedDsForExec = getLoadedDatasets();
  const _loadedColsForExec = new Set();
  const _flagColsForExec = [];
  for (const ds of _loadedDsForExec) {
    for (const col of (ds.columns || [])) _loadedColsForExec.add(col);
    for (const [col, vals] of Object.entries(ds.distinctValues || {})) {
      if (Array.isArray(vals) && vals.length > 0 && vals.length <= 2 && vals.every(v => v === 'Y' || v === 'N')) {
        _flagColsForExec.push(col);
      }
    }
  }
  _flagColsForExec.sort();
  // Only auto-resolve a column for domain-keyed dimensions (e.g. Population).
  // Type-keyed dims (Parameter, AnalysisVisit, …) are handled by the R engine's
  // existing fallback: look up the dim_name itself, which after ingest is the
  // canonical concept-keyed column (PARAM→Parameter, AVISIT→AnalysisVisit).
  // Auto-defaulting those to PARAMCD/AVISITN would break label-based filters.
  const _resolveDimColumn = (dim) => {
    const entry = _adamForExec.dimensions?.[dim] || _adamForExec.concepts?.[dim];
    if (!entry?.byDataType) return null;
    const isDomainKeyed = !Object.keys(entry.byDataType).some(k =>
      ['string', 'code', 'id', 'decimal', 'integer'].includes(k));
    if (!isDomainKeyed) return null;
    const bt = entry.byDataType;
    const modelDefault = bt.code || bt.string || bt.decimal || Object.values(bt)[0];
    if (modelDefault && _loadedColsForExec.has(modelDefault)) return modelDefault;
    if (_flagColsForExec.length > 0) return _flagColsForExec[0];
    return modelDefault;
  };

  // Build a patched single-analysis spec, apply slice overrides to its slices
  const singleAnalysis = JSON.parse(JSON.stringify(analysis));
  const sliceOverrides = resultState.sliceOverrides || {};
  if (singleAnalysis?.resolvedSlices) {
    for (const s of singleAnalysis.resolvedSlices) {
      const vals = s.resolvedValues || {};
      const vars = s.resolvedVariables || {};
      for (const dim of Object.keys(vals)) {
        const key = `${s.name}|${dim}`;
        if (sliceOverrides[key]?.value !== undefined) {
          vals[dim] = sliceOverrides[key].value;
        }
        // Resolve the actual filter column for this slice/dimension. Priority:
        //   1. Explicit user override from the slices table dropdown
        //   2. The dropdown's effective default (model default, OR detected
        //      Y/N flag column for domain-keyed dims like Population whose
        //      model default isn't in the loaded data)
        // This guarantees the engine receives a column choice even when the
        // user accepts the default without clicking — without it, the engine
        // would fall back to the dim_name itself (Population), find no such
        // column, and silently skip the filter.
        const explicit = sliceOverrides[key]?.variable;
        if (explicit) {
          vars[dim] = explicit;
        } else {
          const resolved = _resolveDimColumn(dim);
          if (resolved && resolved !== dim) vars[dim] = resolved;
        }
      }
      if (Object.keys(vars).length > 0) s.resolvedVariables = vars;
    }
  }
  // Merge live UI config overrides into the analysis configurationValues
  const liveOverrides = appState.endpointSpecs?.[epId]?.methodConfigOverrides
    || appState.methodConfig || {};
  if (Object.keys(liveOverrides).length > 0) {
    const existing = singleAnalysis.configurationValues || [];
    for (const [name, value] of Object.entries(liveOverrides)) {
      const idx = existing.findIndex(cv => cv.name === name);
      if (idx >= 0) {
        existing[idx] = { name, value: String(value) };
      } else {
        existing.push({ name, value: String(value) });
      }
    }
    singleAnalysis.configurationValues = existing;
  }
  const patchedSpec = {
    ...resolvedEp,
    analyses: [singleAnalysis],
    targetDataset: selectedDataset
  };

  // Auto-resolve binding variable defaults into the override map ONLY when
  // the dropdown's displayed default differs from the canonical primary that
  // ingest_to_concepts renames away. Without this guard:
  //   - Site → default SITEGR1, primary SITEID-renamed-to-Site → DIFFERS, set override
  //     (otherwise engine substitutes "Site" = SITEID, 30 levels instead of 3)
  //   - Change → default CHG, primary CHG-renamed-to-Change → SAME, no override needed
  //     (overriding to CHG would make engine reach for a column ingest just deleted)
  // Heuristic: ingest's primary picker takes the first byDataType entry (string-
  // first for dimensions); JS getDefaultVariable picks code-first for dimensions
  // and decimal-first for measures. When those agree, ingest will rename the
  // chosen column away — so leave the override empty and let the engine use the
  // concept-key column directly.
  const effectiveOverrides = { ...(overrides || {}) };
  for (const b of (singleAnalysis?.resolvedBindings || [])) {
    if (b.direction === 'output') continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    if (!concept) continue;
    if (effectiveOverrides[concept] !== undefined) continue;  // explicit pick wins
    const entry = _adamForExec.dimensions?.[concept] || _adamForExec.concepts?.[concept];
    const bt = entry?.byDataType;
    if (!bt) continue;
    const def = getDefaultVariable(concept, b.dataStructureRole, _adamForExec);
    if (!def || def === concept || !_loadedColsForExec.has(def)) continue;
    // canonical primary that ingest will rename: first byDataType value
    const ingestPrimary = Object.values(bt)[0];
    if (def === ingestPrimary) continue;  // would clash with rename
    effectiveOverrides[concept] = def;
  }

  const methodOid = analysis?.method?.oid || '';
  const methodDef = appState.methodsCache?.[methodOid] || null;
  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const rImpl = implCatalog[methodOid]?.find(i => i.language === 'R') || null;

  if (!rImpl) {
    _setAnalysisResult(epId, aIdx, { status: 'error', error: `No R implementation available for ${methodOid}` });
    renderExecuteAnalysis(container);
    return;
  }

  // Build engine-ready derivation chain from raw chain + transformation library
  const rawChain = appState.endpointSpecs?.[epId]?.derivationChain || [];
  console.log('[AC/DC] epId:', epId, 'rawChain:', JSON.stringify(rawChain));
  const derivConfigValues = appState.endpointSpecs?.[epId]?.derivationConfigValues || {};
  const txLib = [
    ...(appState.transformationLibrary?.derivationTransformations || []),
    ...(appState.transformationLibrary?.analysisTransformations || [])
  ];
  // Per-derivation BC Topic constraint resolution via shared helper.
  // Each derivation's terminal slotKey identifies the BC (Step 6 choice),
  // with endpoint-level BC (Step 5) as fallback inside the helper.
  const endpointSpec = appState.endpointSpecs?.[epId];
  const study = appState.selectedStudy;

  // R engine executes derivations in array order with no dependency sort —
  // reorder post-order (leaves first) so child aggregations produce columns
  // before parent derivations reference them.
  const fullLib = appState.transformationLibrary;
  const analysisTx = fullLib?.analysisTransformations?.find(
    t => t.oid === endpointSpec?.selectedTransformationOid
  );
  const confirmedKeys = new Set(
    (endpointSpec?.confirmedTerminals || []).map(t => t.slotKey)
  );
  const slotsForSort = analysisTx
    ? buildPipelineGraph(analysisTx, fullLib,
        endpointSpec?.selectedDerivations || {}, confirmedKeys,
        endpointSpec?.dimensionCategoryPicks || {},
        appState.conceptCategories?.categories || {})
    : [];
  // Collect every live slot key (path-unique post-§3) so we can drop stale
  // chain entries whose keys reference an older graph shape. Without this,
  // pre-§3 saved specs keep feeding entries with now-unknown slotKeys —
  // computeColumnMap can't resolve them and the R engine falls back to the
  // concept-keyed column names, triggering merge-induced .x/.y collisions.
  const liveKeys = new Set();
  (function collect(list) {
    for (const s of (list || [])) { liveKeys.add(s.key); if (s.children?.length) collect(s.children); }
  })(slotsForSort);
  const cleanRawChain = (rawChain || []).filter(e => liveKeys.has(e.slotKey));
  if (cleanRawChain.length !== (rawChain || []).length) {
    console.warn('[AC/DC] Dropped', (rawChain?.length || 0) - cleanRawChain.length,
      'stale derivationChain entries whose slotKey no longer matches the current graph. Re-pick affected slots in Step 6 if needed.');
  }
  const pipelineRefs = endpointSpec?.pipelineReferences || [];
  const sortedRawChain = orderChainPostOrder(slotsForSort, cleanRawChain, pipelineRefs);
  const columnMap = computeColumnMap(slotsForSort, sortedRawChain, pipelineRefs);

  // Debug: surface chain→columnMap mapping so we can see if any entry is empty
  console.log('[§3 columnMap]', {
    chainLen: sortedRawChain.length,
    liveKeys: Array.from(liveKeys).slice(0, 5),
    mapKeys: Object.keys(columnMap),
    firstMap: sortedRawChain[0] ? columnMap[sortedRawChain[0].slotKey] : null
  });

  // Analysis-level chain-lookup: build role→column for the analysis transform's
  // own measure bindings so execute_cube doesn't fall back to concept-keyed
  // names that don't match the derived __col_ columns.
  const analysisInputColumns = computeAnalysisInputColumns(
    slotsForSort, sortedRawChain, pipelineRefs, analysisTx
  );
  console.log('[§3.7 analysisInputColumns]', analysisInputColumns);
  // Attach to the analysis object so R's execute_cube can apply the override.
  // `singleAnalysis` is held by reference inside `patchedSpec.analyses`, so
  // mutating it here propagates into the serialised spec_json.
  singleAnalysis.analysisInputColumns = analysisInputColumns;

  const dimensionOverrides = endpointSpec?.dimensionOverrides || {};
  const conceptCategories = appState.conceptCategories?.categories || {};

  const derivationChain = sortedRawChain
    .filter(entry => entry.derivationOid)
    .map(entry => {
      const transform = txLib.find(t => t.oid === entry.derivationOid);
      if (!transform) return null;
      // Resolve conceptCategory bindings → concrete concepts using:
      //   1. per-slot Step 6 override
      //   2. per-endpoint Step 3 category pick (cascades across all slots)
      //   3. category's first member
      const endpointPicks = endpointSpec?.dimensionCategoryPicks || {};
      const resolvedBindings = (transform.bindings || []).map((b, i) => {
        if (!b.conceptCategory) return b;
        const override = dimensionOverrides[entry.slotKey]?.[i]?.concept;
        const endpointPick = endpointPicks[b.conceptCategory];
        const fallback = conceptCategories[b.conceptCategory]?.members?.[0]?.concept;
        const concrete = override || endpointPick || b.concept || fallback;
        if (!concrete) return b;
        // Drop the category and inject the concrete concept
        const { conceptCategory: _drop, ...rest } = b;
        return { ...rest, concept: concrete };
      });
      // Merge library method configs + user overrides. Preserve native JS
      // types for array/object values (e.g. windowed-visit schedule) so R
      // can consume them as lists via configs$<name>. Only stringify scalars
      // so that existing numeric/string placeholders keep working.
      const normConfig = v => (v !== null && typeof v === 'object') ? v : String(v);
      const configValues = [
        ...(transform.methodConfigurations || []).map(mc =>
          ({ name: mc.configurationName, value: normConfig(mc.value) }))
      ];
      const userConfigs = derivConfigValues[entry.slotKey] || {};
      for (const [name, value] of Object.entries(userConfigs)) {
        const idx = configValues.findIndex(cv => cv.name === name);
        if (idx >= 0) configValues[idx] = { name, value: normConfig(value) };
        else configValues.push({ name, value: normConfig(value) });
      }

      // Auto-inject `parameter_label` config when the derivation declares an
      // output binding with methodRole="parameter_label" (e.g. T.UnitConversion).
      // The R callTemplate uses <parameter_label> as a placeholder to stamp the
      // endpoint's user-defined Parameter label (e.g. "Weight (kg)") onto every
      // converted row, so the downstream analysis cube can filter on it.
      const hasParamLabelOutput = (transform.bindings || []).some(b =>
        b.direction === 'output' && b.methodRole === 'parameter_label'
      );
      if (hasParamLabelOutput && !configValues.some(cv => cv.name === 'parameter_label')) {
        const paramLabel = getSpecParameterValue(epId, endpointSpec, study);
        if (paramLabel) configValues.push({ name: 'parameter_label', value: String(paramLabel) });
      }
      // Constraint value: only if the transform declares a constraint binding
      // on a facet-qualified concept (Observation.Identification.Topic)
      const constraintValues = [];
      const hasTopicConstraint = (transform.bindings || []).some(b =>
        b.methodRole === 'constraint' &&
        b.qualifierType === 'facet' &&
        /Topic/i.test(b.qualifierValue || '')
      );
      if (hasTopicConstraint) {
        // Derive dimension from the constraint binding's concept + qualifier
        const constraintBinding = (transform.bindings || []).find(b =>
          b.methodRole === 'constraint' && b.qualifierType === 'facet' && /Topic/i.test(b.qualifierValue || '')
        );
        // The BC is linked on a terminal node (child of the derivation), not on the
      // derivation chain entry itself. Try the entry's slotKey first, then scan all
      // confirmedTerminals for any with a linked BC under this derivation.
      let bcInfo = getDerivationBCTopicDecode(endpointSpec, entry.slotKey, study);
      if (!bcInfo) {
        const terminals = endpointSpec?.confirmedTerminals || [];
        for (const term of terminals) {
          if (term.linkedBCIds?.length) {
            bcInfo = getDerivationBCTopicDecode(endpointSpec, term.slotKey, study);
            if (bcInfo) break;
          }
        }
      }
        if (bcInfo && constraintBinding) {
          const concept = (constraintBinding.concept || '').replace(/@.*/, '');
          const facet = (constraintBinding.qualifierValue || '').split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('.');
          constraintValues.push({
            dimension: `${concept}.${facet}`,
            value: bcInfo.decode
          });
        }
      }
      const resolvedSlices = resolveDerivationSlices(
        transform, entry.slotKey, dimensionOverrides, conceptCategories,
        endpointSpec?.derivationSliceOverrides, endpointPicks
      );
      const cols = columnMap[entry.slotKey] || {};
      return {
        slotKey: entry.slotKey,
        method: { oid: transform.usesMethod },
        resolvedBindings,
        configurationValues: configValues,
        constraintValues,
        resolvedSlices,
        outputColumn: cols.outputColumn || null,
        inputColumns: cols.inputColumns || {},
        sourceStore: userConfigs.sourceStore || null,
        sourceDomain: userConfigs.sourceDomain || null
      };
    })
    .filter(Boolean);
  console.log('%c[AC/DC] derivationChain: ' + derivationChain.length + ' entries', 'color:blue;font-weight:bold', derivationChain);
  if (derivationChain.length > 0) {
    console.log('%c[AC/DC] First derivation configs:', 'color:blue', derivationChain[0].configurationValues);
    console.log('%c[AC/DC] First derivation bindings:', 'color:blue', derivationChain[0].resolvedBindings?.length, 'bindings');
  }
  const unitConversions = appState.unitConversions || null;
  const rImplCatalog = derivationChain.length > 0
    ? Object.values(appState.methodImplementationCatalog?.implementations || {}).flat().filter(i => i.language === 'R')
    : null;

  const availableDatasets = getLoadedDatasets().map(d => d.name);
  const payload = generateExecutionPayload(
    patchedSpec, appState.conceptMappings, effectiveOverrides, methodDef, rImpl,
    derivationChain, unitConversions, rImplCatalog, availableDatasets
  );

  _setAnalysisResult(epId, aIdx, { status: 'running', results: null, error: null });
  renderExecuteAnalysis(container);

  try {
    await setJsonVariable('spec_json', payload.specJson);
    await setJsonVariable('mapping_json', payload.mappingJson);
    await setJsonVariable('method_json', payload.methodJson);
    await setJsonVariable('r_impl_json', payload.rImplJson);
    if (payload.overridesJson !== 'NULL') {
      await setJsonVariable('overrides_json', payload.overridesJson);
    }
    if (payload.derivationsJson !== 'null') {
      await setJsonVariable('derivations_json', payload.derivationsJson);
    }
    if (payload.unitConversionsJson !== 'null') {
      await setJsonVariable('unit_conversions_json', payload.unitConversionsJson);
    }
    if (payload.rImplsJson !== 'null') {
      await setJsonVariable('r_impls_json', payload.rImplsJson);
    }

    const result = await executeR(payload.bootstrapCode);

    if (result.success) {
      let parsed = result.result;
      try {
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        else if (parsed?.values) parsed = JSON.parse(parsed.values[0]);
      } catch (e) { /* keep as-is */ }

      // Check for engine-level errors caught by the bootstrap tryCatch
      if (parsed?.engine_error) {
        const errMsg = parsed.engine_error + (parsed.console ? '\n\nConsole:\n' + parsed.console : '');
        _setAnalysisResult(epId, aIdx, { status: 'error', results: null, error: errMsg });
      } else {
        // Attach console output to results for diagnostics
        const console = parsed?.console;
        if (console) delete parsed.console;
        _setAnalysisResult(epId, aIdx, { status: 'complete', results: parsed, error: null, console });
      }
    } else {
      _setAnalysisResult(epId, aIdx, { status: 'error', results: null, error: result.error });
    }
  } catch (err) {
    _setAnalysisResult(epId, aIdx, { status: 'error', results: null, error: err.message });
  }

  renderExecuteAnalysis(container);
}

/**
 * Batch execute — run every analysis on an endpoint sequentially. Sequential
 * rather than parallel because the WebR engine has shared global state
 * (spec_json, mapping_json, etc.) between calls.
 */
async function _executeAllAnalyses(container, epId) {
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === epId);
  if (!resolvedEp) return;
  const analyses = resolvedEp.analyses || [];
  for (let i = 0; i < analyses.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    await _executeAnalysis(container, epId, i);
  }
}

// ---------------------------------------------------------------------------
// Derivation pipeline summary for Execute panel
// ---------------------------------------------------------------------------

/**
 * Run only the derivation pipeline (no analysis) for diagnostic purposes.
 * Calls acdc_derive_only in the R engine and displays column diagnostics.
 */
async function _executeDerivationOnly(container, epId) {
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === epId);
  if (!resolvedEp) return;

  try { await loadEngine(); } catch (err) {
    console.error('Failed to load engine:', err);
    return;
  }

  // Reuse the same derivation chain building logic from _executeAnalysis
  const rawChain = appState.endpointSpecs?.[epId]?.derivationChain || [];
  const derivConfigValues = appState.endpointSpecs?.[epId]?.derivationConfigValues || {};
  const txLib = [
    ...(appState.transformationLibrary?.derivationTransformations || []),
    ...(appState.transformationLibrary?.analysisTransformations || [])
  ];
  // Per-derivation BC Topic constraint resolution via shared helper
  const endpointSpec = appState.endpointSpecs?.[epId];
  const study = appState.selectedStudy;

  // Reorder to post-order (leaves first) so child aggregations run before
  // parent derivations consume their output columns.
  const fullLib = appState.transformationLibrary;
  const analysisTx = fullLib?.analysisTransformations?.find(
    t => t.oid === endpointSpec?.selectedTransformationOid
  );
  const confirmedKeys = new Set(
    (endpointSpec?.confirmedTerminals || []).map(t => t.slotKey)
  );
  const slotsForSort = analysisTx
    ? buildPipelineGraph(analysisTx, fullLib,
        endpointSpec?.selectedDerivations || {}, confirmedKeys,
        endpointSpec?.dimensionCategoryPicks || {},
        appState.conceptCategories?.categories || {})
    : [];
  const liveKeys = new Set();
  (function collect(list) {
    for (const s of (list || [])) { liveKeys.add(s.key); if (s.children?.length) collect(s.children); }
  })(slotsForSort);
  const cleanRawChain = (rawChain || []).filter(e => liveKeys.has(e.slotKey));
  if (cleanRawChain.length !== (rawChain || []).length) {
    console.warn('[AC/DC] Dropped', (rawChain?.length || 0) - cleanRawChain.length,
      'stale derivationChain entries whose slotKey no longer matches the current graph.');
  }
  const pipelineRefs = endpointSpec?.pipelineReferences || [];
  const sortedRawChain = orderChainPostOrder(slotsForSort, cleanRawChain, pipelineRefs);
  const columnMap = computeColumnMap(slotsForSort, sortedRawChain, pipelineRefs);

  console.log('[§3 columnMap DERIV-ONLY]', {
    chainLen: sortedRawChain.length,
    liveKeys: Array.from(liveKeys).slice(0, 5),
    mapKeys: Object.keys(columnMap),
    firstMap: sortedRawChain[0] ? columnMap[sortedRawChain[0].slotKey] : null
  });

  const dimensionOverrides = endpointSpec?.dimensionOverrides || {};
  const endpointPicks = endpointSpec?.dimensionCategoryPicks || {};
  const conceptCategoriesMap = appState.conceptCategories?.categories || {};

  const derivationChain = sortedRawChain.filter(e => e.derivationOid).map(entry => {
    const transform = txLib.find(t => t.oid === entry.derivationOid);
    if (!transform) return null;
    const resolvedBindings = (transform.bindings || []).map((b, i) => {
      if (!b.conceptCategory) return b;
      const override = dimensionOverrides[entry.slotKey]?.[i]?.concept;
      const endpointPick = endpointPicks[b.conceptCategory];
      const fallback = conceptCategoriesMap[b.conceptCategory]?.members?.[0]?.concept;
      const concrete = override || endpointPick || b.concept || fallback;
      if (!concrete) return b;
      const { conceptCategory: _drop, ...rest } = b;
      return { ...rest, concept: concrete };
    });
    const normConfig2 = v => (v !== null && typeof v === 'object') ? v : String(v);
    const configValues = [...(transform.methodConfigurations || []).map(mc =>
      ({ name: mc.configurationName, value: normConfig2(mc.value) }))];
    const userConfigs = derivConfigValues[entry.slotKey] || {};
    for (const [name, value] of Object.entries(userConfigs)) {
      const idx = configValues.findIndex(cv => cv.name === name);
      if (idx >= 0) configValues[idx] = { name, value: normConfig2(value) };
      else configValues.push({ name, value: normConfig2(value) });
    }

    // Mirror _executeAnalysis: auto-inject parameter_label for derivations
    // declaring an output binding with methodRole="parameter_label" (T.UnitConversion).
    const hasParamLabelOutput2 = (transform.bindings || []).some(b =>
      b.direction === 'output' && b.methodRole === 'parameter_label'
    );
    if (hasParamLabelOutput2 && !configValues.some(cv => cv.name === 'parameter_label')) {
      const paramLabel = getSpecParameterValue(epId, endpointSpec, study);
      if (paramLabel) configValues.push({ name: 'parameter_label', value: String(paramLabel) });
    }

    const constraintValues = [];
    const hasTopicConstraint = (transform.bindings || []).some(b =>
      b.methodRole === 'constraint' &&
      b.qualifierType === 'facet' &&
      /Topic/i.test(b.qualifierValue || '')
    );
    if (hasTopicConstraint) {
      const constraintBinding = (transform.bindings || []).find(b =>
        b.methodRole === 'constraint' && b.qualifierType === 'facet' && /Topic/i.test(b.qualifierValue || '')
      );
      // The BC is linked on a terminal node (child of the derivation), not on the
      // derivation chain entry itself. Try the entry's slotKey first, then scan all
      // confirmedTerminals for any with a linked BC under this derivation.
      let bcInfo = getDerivationBCTopicDecode(endpointSpec, entry.slotKey, study);
      console.log('[constraint] slotKey lookup:', entry.slotKey, '→', bcInfo);
      if (!bcInfo) {
        const terminals = endpointSpec?.confirmedTerminals || [];
        console.log('[constraint] scanning', terminals.length, 'terminals:', terminals.map(t => `${t.slotKey}(bc:${t.linkedBCIds?.length||0})`));
        for (const term of terminals) {
          if (term.linkedBCIds?.length) {
            bcInfo = getDerivationBCTopicDecode(endpointSpec, term.slotKey, study);
            console.log('[constraint] terminal', term.slotKey, 'bcIds:', term.linkedBCIds, '→', bcInfo);
            if (bcInfo) break;
          }
        }
      }
      if (bcInfo && constraintBinding) {
        const concept = (constraintBinding.concept || '').replace(/@.*/, '');
        const facet = (constraintBinding.qualifierValue || '').split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('.');
        constraintValues.push({
          dimension: `${concept}.${facet}`,
          value: bcInfo.decode
        });
        console.log('[constraint] RESOLVED:', `${concept}.${facet}`, '=', bcInfo.decode);
      } else {
        console.log('[constraint] NOT resolved. bcInfo:', bcInfo, 'constraintBinding:', !!constraintBinding);
      }
    }
    const resolvedSlices = resolveDerivationSlices(
      transform, entry.slotKey, dimensionOverrides, conceptCategoriesMap,
      endpointSpec?.derivationSliceOverrides, endpointPicks
    );
    const cols = columnMap[entry.slotKey] || {};
    const result = {
      slotKey: entry.slotKey,
      method: { oid: transform.usesMethod },
      resolvedBindings,
      configurationValues: configValues,
      constraintValues,
      resolvedSlices,
      outputColumn: cols.outputColumn || null,
      inputColumns: cols.inputColumns || {}
    };
    console.log('[derivation]', transform.oid, 'constraintValues:', JSON.stringify(constraintValues));
    return result;
  }).filter(Boolean);

  if (derivationChain.length === 0) {
    // Surface this — silent no-op was confusing for users whose spec saved
    // an empty derivationChain or had all entries pruned for stale slotKeys.
    console.warn('[derivation-only]', epId, 'has no executable derivation chain. Check Step 6 selections and console above for stale-key pruning warnings.');
    const resultStateW = _ensureEndpointResult(epId);
    resultStateW.derivationOnlyMessage = 'No derivations to execute. Check Step 6 — pick a derivation for each chain slot, or upload data with the source columns this transformation expects.';
    renderExecuteAnalysis(container);
    return;
  }

  const resultState = _ensureEndpointResult(epId);
  const datasets = getLoadedDatasets();
  const selectedDataset = resultState.datasetOverride || datasets[0]?.name;
  const datasetName = (selectedDataset || 'addata').toLowerCase();

  const specJson = JSON.stringify({
    targetStore: resolvedEp.targetStore || 'adam',
    targetDataset: selectedDataset
  });
  const mappingJson = JSON.stringify(appState.conceptMappings);
  const derivationsJson = JSON.stringify(derivationChain);
  const unitConversionsJson = JSON.stringify(appState.unitConversions || null);
  const rImplCatalog = Object.values(appState.methodImplementationCatalog?.implementations || {}).flat().filter(i => i.language === 'R');
  const rImplsJson = JSON.stringify(rImplCatalog);

  try {
    await setJsonVariable('spec_json', specJson);
    await setJsonVariable('mapping_json', mappingJson);
    await setJsonVariable('derivations_json', derivationsJson);
    await setJsonVariable('unit_conversions_json', unitConversionsJson);
    await setJsonVariable('r_impls_json', rImplsJson);

    const allDatasetNames = datasets.map(d => d.name);
    const code = [
      `spec <- jsonlite::fromJSON(spec_json, simplifyVector = FALSE)`,
      `all_mappings <- jsonlite::fromJSON(mapping_json, simplifyVector = FALSE)`,
      `target_store <- spec$targetStore; if (is.null(target_store)) target_store <- "adam"`,
      `mappings <- all_mappings[[target_store]]; if (is.null(mappings)) mappings <- all_mappings$adam`,
      `derivations <- jsonlite::fromJSON(derivations_json, simplifyVector = FALSE)`,
      `unit_conversions <- jsonlite::fromJSON(unit_conversions_json, simplifyVector = FALSE)`,
      `r_impls <- jsonlite::fromJSON(r_impls_json, simplifyVector = FALSE)`,
      `dataset <- get("${datasetName}")`,
      `available_datasets <- c(${allDatasetNames.map(d => `"${d}"`).join(', ')})`,
      `result <- acdc_derive_only(spec, mappings, dataset, derivations, unit_conversions, r_impls, all_mappings, available_datasets)`,
      `jsonlite::toJSON(result, auto_unbox = TRUE, pretty = TRUE)`
    ].join('\n');

    const result = await executeR(code);
    if (result.success) {
      let parsed = result.result;
      try {
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        else if (parsed?.values) parsed = JSON.parse(parsed.values[0]);
      } catch (e) { /* keep */ }
      resultState.derivationOnly = parsed;
    } else {
      resultState.derivationOnly = { error: result.error };
    }
  } catch (err) {
    resultState.derivationOnly = { error: err.message };
  }

  renderExecuteAnalysis(container);
}

function _renderDerivationSummary(ep) {
  const rawChain = appState.endpointSpecs?.[ep.id]?.derivationChain || [];
  const derivConfigValues = appState.endpointSpecs?.[ep.id]?.derivationConfigValues || {};
  const txLib = [
    ...(appState.transformationLibrary?.derivationTransformations || []),
    ...(appState.transformationLibrary?.analysisTransformations || [])
  ];

  const derivations = rawChain
    .filter(entry => entry.derivationOid)
    .map(entry => {
      const transform = txLib.find(t => t.oid === entry.derivationOid);
      const configs = derivConfigValues[entry.slotKey] || {};
      return { entry, transform, configs };
    })
    .filter(d => d.transform);

  if (derivations.length === 0) return '';

  // Check if there's a derivation-only result stored
  const derivResult = appState.endpointResults[ep.id]?.derivationOnly;
  const derivMessage = appState.endpointResults[ep.id]?.derivationOnlyMessage;

  return `
    <div class="exec-bindings-section" style="margin:8px 0; padding:10px 14px; background:rgba(13,110,253,0.04); border:1px solid var(--cdisc-primary); border-radius:var(--radius);">
      <div style="display:flex; align-items:center; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-primary); margin-bottom:8px;">
        Derivation Pipeline (runs before analysis)
        <button class="btn btn-sm exec-derive-only-btn" data-ep-id="${ep.id}" style="margin-left:auto; font-size:11px; padding:2px 8px;">Run Derivation Only</button>
      </div>
      ${derivMessage && !derivResult ? `
      <div style="margin-top:6px; padding:8px 10px; background:rgba(255,193,7,0.1); border:1px solid var(--cdisc-warning, #ffc107); border-radius:var(--radius); font-size:11px;">
        ${_escapeHtml(derivMessage)}
      </div>` : ''}
      ${derivResult ? `
      <div style="margin-top:6px; padding:8px 10px; background:rgba(0,0,0,0.03); border-radius:var(--radius); font-size:11px; font-family:var(--font-mono);">
        ${(() => {
          // jsonlite::toJSON(auto_unbox=TRUE) collapses single-element character
          // vectors to JSON strings instead of single-element arrays. Normalise
          // every "list-of-strings" field on derivResult so the renderer can
          // treat them uniformly without TypeError on .join().
          const arr = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
          const original_columns = arr(derivResult.original_columns);
          const ingested_columns = arr(derivResult.ingested_columns);
          const final_columns = arr(derivResult.final_columns);
          const enriched_dimensions = arr(derivResult.enriched_dimensions);
          const log = arr(derivResult.derivation_log);
          return `
        ${derivResult.error ? `<div style="color:var(--cdisc-error);"><strong>Error:</strong> ${_escapeHtml(derivResult.error)}</div>` : ''}
        <div><strong>Store:</strong> ${derivResult.detected_store || '?'} (${derivResult.match_count || 0} column matches${derivResult.domain_code ? `, domain=${derivResult.domain_code}` : ''})</div>
        <div><strong>Ingest:</strong> ${original_columns.join(', ')} → ${ingested_columns.join(', ')}</div>
        <div><strong>Final columns:</strong> ${final_columns.join(', ')}</div>
        <div><strong>Rows:</strong> ${derivResult.nrow || '?'}</div>
        ${log.map((d, i) => {
          const newCols = arr(d.new_columns);
          const colsAtFailure = arr(d.columns_at_failure);
          return `
          <div style="margin-top:4px;">
            <strong>#${i + 1} ${d.method || '?'}:</strong> ${d.status}
            ${newCols.length ? `<br>New columns: <code>${newCols.join(', ')}</code>` : ''}
            ${colsAtFailure.length ? `<br>Columns at failure: <code>${colsAtFailure.join(', ')}</code>` : ''}
          </div>`;
        }).join('')}
        ${enriched_dimensions.length ? `
          <div style="margin-top:4px;"><strong>Enriched dimensions:</strong> <code>${enriched_dimensions.join(', ')}</code> (merged from other datasets by Subject)</div>
        ` : ''}`;
        })()}
        ${derivResult.data_preview ? (() => {
          const preview = derivResult.data_preview;
          // jsonlite serializes data.frames as arrays of row objects
          const rowArr = Array.isArray(preview) ? preview : [preview];
          if (rowArr.length === 0) return '';
          const cols = Object.keys(rowArr[0] || {});
          if (cols.length === 0) return '';
          return '<div style="margin-top:8px; overflow-x:auto;"><strong>Data preview (first ' + rowArr.length + ' rows):</strong>' +
            '<table class="exec-bindings-table" style="margin-top:4px; font-size:10px;"><thead><tr>' +
            cols.map(c => '<th>' + _escapeHtml(c) + '</th>').join('') +
            '</tr></thead><tbody>' +
            rowArr.map(row => '<tr>' + cols.map(c => {
              const v = row[c]; return '<td>' + _escapeHtml(v == null ? '' : String(v)) + '</td>';
            }).join('') + '</tr>').join('') +
            '</tbody></table></div>';
        })() : ''}
      </div>` : ''}
      ${derivations.map((d, i) => {
        const t = d.transform;
        const bindings = t.bindings || [];
        const inputBindings = bindings.filter(b => b.direction !== 'output');
        const outputBindings = bindings.filter(b => b.direction === 'output');
        // BC constraint resolution
        let bcInfo = getDerivationBCTopicDecode(appState.endpointSpecs?.[ep.id], d.entry.slotKey, appState.selectedStudy);
        if (!bcInfo) {
          const epSpec = appState.endpointSpecs?.[ep.id];
          for (const term of (epSpec?.confirmedTerminals || [])) {
            if (term.linkedBCIds?.length) {
              bcInfo = getDerivationBCTopicDecode(epSpec, term.slotKey, appState.selectedStudy);
              if (bcInfo) break;
            }
          }
        }
        const sourceStore = d.configs.sourceStore || '';
        const sourceDomain = d.configs.sourceDomain || '';
        return `
        <div style="padding:8px 0; font-size:12px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span class="badge badge-secondary">#${i + 1}</span>
            <strong>${t.name || t.oid}</strong>
            <span style="color:var(--cdisc-text-secondary);">${t.usesMethod || ''}</span>
          </div>

          <!-- Derivation bindings -->
          <div class="exec-bindings-section" style="margin-bottom:8px;">
            <div class="exec-bindings-title">BINDINGS</div>
            <table class="exec-bindings-table">
              <thead><tr><th>Role</th><th>Concept</th><th>Direction</th><th>Type</th></tr></thead>
              <tbody>
                ${inputBindings.map(b => `<tr>
                  <td>${b.methodRole || ''}</td>
                  <td><code>${(b.concept || '').replace(/@.*/, '')}${b.qualifierValue ? '.' + b.qualifierValue : ''}</code></td>
                  <td>input</td>
                  <td>${b.dataStructureRole || ''}</td>
                </tr>`).join('')}
                ${outputBindings.map(b => `<tr style="background:rgba(0,133,124,0.04);">
                  <td>${b.methodRole || ''}</td>
                  <td><code>${(b.concept || '').replace(/@.*/, '')}${b.qualifierValue ? '.' + b.qualifierValue : ''}</code></td>
                  <td><span class="badge badge-teal" style="font-size:9px;">output</span></td>
                  <td>${b.dataStructureRole || ''}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>

          <!-- Input cube / constraint -->
          <div class="exec-bindings-section" style="margin-bottom:8px;">
            <div class="exec-bindings-title">INPUT CUBE</div>
            <table class="exec-bindings-table">
              <thead><tr><th>Dimension</th><th>Value</th><th>Source</th></tr></thead>
              <tbody>
                ${bcInfo ? `<tr>
                  <td>Observation.Identification.Topic</td>
                  <td><code>${bcInfo.decode}</code></td>
                  <td><span class="badge" style="background:var(--cdisc-primary-light);color:var(--cdisc-primary);font-size:9px;">BC: ${bcInfo.bcName}</span></td>
                </tr>` : `<tr><td colspan="3" style="color:var(--cdisc-text-secondary);">No BC linked — derivation runs on all rows</td></tr>`}
                <tr>
                  <td>Source Store</td>
                  <td>
                    <select class="exec-deriv-config-input config-select" data-ep-id="${ep.id}" data-slot-key="${d.entry.slotKey}" data-config-key="sourceStore" style="font-size:11px; padding:2px 6px;">
                      <option value="">auto-detect</option>
                      ${Object.keys(appState.conceptMappings || {}).map(k => `<option value="${k}" ${k === sourceStore ? 'selected' : ''}>${k}</option>`).join('')}
                    </select>
                  </td>
                  <td style="font-size:10px; color:var(--cdisc-text-secondary);">auto-detected from uploaded data</td>
                </tr>
                <tr>
                  <td>Source Domain</td>
                  <td>
                    <input class="exec-deriv-config-input config-input" data-ep-id="${ep.id}" data-slot-key="${d.entry.slotKey}" data-config-key="sourceDomain"
                      value="${sourceDomain}" placeholder="auto" style="font-size:11px; padding:2px 6px; width:60px;">
                  </td>
                  <td style="font-size:10px; color:var(--cdisc-text-secondary);">domain code for -- prefix (e.g., VS, LB)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Configuration -->
          <div class="exec-bindings-section">
            <div class="exec-bindings-title">CONFIGURATION</div>
            <table class="exec-bindings-table">
              <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
              <tbody>
                ${Object.entries(d.configs).filter(([k]) => k !== 'sourceStore' && k !== 'sourceDomain').map(([k, v]) =>
                  `<tr><td>${k}</td><td><code>${v}</code></td></tr>`
                ).join('') || '<tr><td colspan="2" style="color:var(--cdisc-text-secondary);">No configuration</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Output cube -->
          <div class="exec-bindings-section">
            <div class="exec-bindings-title">OUTPUT CUBE</div>
            <table class="exec-bindings-table">
              <thead><tr><th>Concept</th><th>Role</th><th>Type</th></tr></thead>
              <tbody>
                ${outputBindings.map(b => `<tr>
                  <td><code>${(b.concept || '').replace(/@.*/, '')}${b.qualifierValue ? '.' + b.qualifierValue : ''}</code></td>
                  <td>${b.methodRole || ''}</td>
                  <td>${b.dataStructureRole || ''}</td>
                </tr>`).join('') || '<tr><td colspan="3" style="color:var(--cdisc-text-secondary);">No output bindings</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the endpointResults slot exists and has the new shape. Silently
 * migrates the old single-analysis shape ({status, results, error}) into
 * analysisResults[0] so a user mid-session doesn't lose state.
 */
function _ensureEndpointResult(epId) {
  if (!appState.endpointResults[epId]) {
    appState.endpointResults[epId] = { analysisResults: {} };
  }
  const r = appState.endpointResults[epId];
  if (!r.analysisResults) {
    // Migrate legacy flat shape if present
    if (r.status || r.results || r.error) {
      r.analysisResults = { 0: { status: r.status, results: r.results, error: r.error } };
      delete r.status; delete r.results; delete r.error;
    } else {
      r.analysisResults = {};
    }
  }
  return r;
}

function _setAnalysisResult(epId, aIdx, patch) {
  const r = _ensureEndpointResult(epId);
  r.analysisResults[aIdx] = { ...(r.analysisResults[aIdx] || {}), ...patch };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render a comment block describing the cube extraction that the R engine
 * performs before the call template runs. Makes the standalone preview
 * honest: the user can see the slice constraints that filter `analysis_data`.
 *
 * Non-default slices inherit constraints from the default slice (Population,
 * etc.) — mirroring execute_cube's inheritance so baseline pulls don't leak
 * across populations.
 */
function _renderCubePreviewHeader(selectedDataset, slices, sliceOverrides, varOverrides) {
  if (!slices || slices.length === 0) return '';
  // Default slice: heuristic mirrors the R engine — the slice whose name
  // isn't claimed by a binding's b.slice attribute. We don't have bindings
  // here, so use convention: "endpoint" or the first slice.
  const defaultSlice = slices.find(s => s.name === 'endpoint') || slices[0];
  const defaultDims = defaultSlice?.resolvedValues || {};
  const renderConstraint = (sliceName, dim, val) => {
    const ovr = sliceOverrides?.[`${sliceName}|${dim}`] || {};
    const col = ovr.variable || varOverrides?.[dim] || dim;
    const value = ovr.value ?? val;
    return `${col} == ${JSON.stringify(value)}`;
  };
  const lines = [];
  lines.push(`# analysis_data is the cube extracted from ${selectedDataset || 'dataset'} by execute_cube():`);
  for (const s of slices) {
    const dims = s.resolvedValues || {};
    const isDefault = s === defaultSlice;
    const inheritedDims = isDefault ? {} :
      Object.fromEntries(Object.entries(defaultDims).filter(([d]) => !(d in dims)));
    const parts = [];
    for (const [dim, val] of Object.entries(dims)) {
      parts.push(renderConstraint(s.name, dim, val));
    }
    for (const [dim, val] of Object.entries(inheritedDims)) {
      // Inherited constraints come from the default slice — render with the
      // default slice's overrides, not this slice's.
      parts.push(renderConstraint(defaultSlice.name, dim, val) + '  # inherited from default');
    }
    if (parts.length > 0) {
      lines.push(`#   slice "${s.name}": ${parts.join(' & ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * Build config map from method definition defaults + analysis overrides.
 * Mirrors the R engine's parse_configs() logic.
 */
function _buildConfigs(analysis, methodDef, liveOverrides) {
  const configs = {};
  // Method-level config defaults
  if (methodDef?.configurations) {
    for (const cfg of methodDef.configurations) {
      if (cfg.defaultValue != null) configs[cfg.name] = cfg.defaultValue;
    }
  }
  // Output-class-level config defaults (e.g., multiplicity_adjustment on contrasts)
  if (methodDef?.output_specification?.output_classes) {
    for (const oc of methodDef.output_specification.output_classes) {
      for (const cfg of oc.configurations || []) {
        if (cfg.defaultValue != null && !(cfg.name in configs)) {
          configs[cfg.name] = cfg.defaultValue;
        }
      }
    }
  }
  // Analysis-level overrides from serialized spec
  if (analysis?.configurationValues) {
    for (const cv of analysis.configurationValues) {
      const num = Number(cv.value);
      configs[cv.name] = isNaN(num) ? cv.value : num;
    }
  }
  // Live UI overrides (highest priority)
  for (const [name, value] of Object.entries(liveOverrides || {})) {
    const num = Number(value);
    configs[name] = isNaN(num) ? value : num;
  }
  return configs;
}

function _fmt(val) {
  if (val === null || val === undefined) return '--';
  if (typeof val === 'number') {
    if (Math.abs(val) < 0.001 && val !== 0) return val.toExponential(3);
    return Number.isInteger(val) ? val.toString() : val.toFixed(4);
  }
  return String(val);
}

function _escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function _escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function _styles() {
  return `<style>
    .exec-status { padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }
    .exec-status-ready { background:rgba(40,167,69,0.1); color:#28a745; }
    .exec-endpoint-card { border:1px solid var(--cdisc-border); border-radius:var(--radius); padding:16px; margin-bottom:12px; }
    .exec-card-complete { border-left:3px solid #28a745; }
    .exec-card-running { border-left:3px solid var(--cdisc-primary); }
    .exec-card-error { border-left:3px solid var(--cdisc-error); }
    .exec-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .exec-card-meta { font-size:12px; color:var(--cdisc-text-secondary); display:flex; gap:16px; margin-bottom:12px; }
    .btn-sm { padding:4px 12px; font-size:12px; }

    /* Per-analysis sub-card */
    .exec-analysis-sub { border:1px solid var(--cdisc-border); border-radius:var(--radius); padding:12px; margin-top:10px; background:var(--cdisc-surface, #fff); }
    .exec-sub-complete { border-left:3px solid #28a745; }
    .exec-sub-running { border-left:3px solid var(--cdisc-primary); }
    .exec-sub-error { border-left:3px solid var(--cdisc-error); }
    .exec-sub-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .exec-sub-seq { display:inline-block; min-width:22px; padding:1px 6px; margin-right:6px; font-size:10px; font-weight:700; color:var(--cdisc-text-secondary); background:var(--cdisc-background); border-radius:10px; }

    .exec-bindings-section { margin:10px 0; }
    .exec-bindings-title { font-size:10px; font-weight:700; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
    .exec-bindings-table { width:100%; font-size:11px; border-collapse:collapse; }
    .exec-bindings-table th { text-align:left; padding:3px 8px; border-bottom:1px solid var(--cdisc-border); font-weight:600; color:var(--cdisc-text-secondary); font-size:10px; }
    .exec-bindings-table td { padding:3px 8px; border-bottom:1px solid var(--cdisc-border); }
    .exec-code-details { flex:1; min-width:200px; }
    .exec-code-details summary { cursor:pointer; font-size:12px; font-weight:600; color:var(--cdisc-primary); padding:6px 10px; border:1px solid var(--cdisc-border); border-radius:var(--radius) var(--radius) 0 0; }
    .exec-code-details[open] summary { background:var(--cdisc-primary-light); }
    .exec-code-pre { font-size:11px; line-height:1.5; background:var(--cdisc-background); padding:12px; border:1px solid var(--cdisc-border); border-top:0; border-radius:0 0 var(--radius) var(--radius); overflow-x:auto; max-height:400px; margin:0; }
    .exec-ard-tabs { display:flex; gap:0; border-bottom:2px solid var(--cdisc-border); margin:12px 0 8px; }
    .exec-ard-tab { padding:6px 14px; font-size:11px; font-weight:600; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; color:var(--cdisc-text-secondary); }
    .exec-ard-tab:hover { color:var(--cdisc-text); }
    .exec-ard-tab.active { color:var(--cdisc-primary); border-bottom-color:var(--cdisc-primary); }
    .exec-ard-section { display:none; }
    .exec-ard-section.active { display:block; }
    .exec-ard-table { width:100%; font-size:11px; border-collapse:collapse; }
    .exec-ard-table th { text-align:left; padding:4px 8px; border-bottom:2px solid var(--cdisc-border); font-weight:600; color:var(--cdisc-text-secondary); font-size:10px; text-transform:uppercase; }
    .exec-ard-table td { padding:4px 8px; border-bottom:1px solid var(--cdisc-border); }
    .exec-ard-table tr:hover td { background:var(--cdisc-primary-light); }

    .exec-combined-ard { margin-top:16px; padding:12px; border:1px dashed var(--cdisc-border); border-radius:var(--radius); background:var(--cdisc-background); }
  </style>`;
}
