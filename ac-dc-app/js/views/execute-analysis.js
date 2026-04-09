import { appState, navigateTo, rebuildSpec } from '../app.js';
import { getAllEndpoints } from '../utils/usdm-parser.js';
import {
  initWebR, loadXptFile, executeR, isInitialized,
  getLoadedDatasets, loadEngine, setJsonVariable
} from '../utils/webr-engine.js';
import { generateExecutionPayload, getVariableOptions, getDefaultVariable } from '../utils/r-code-generator.js';


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
      <button class="btn btn-secondary" id="btn-back-esap">&larr; Back to eSAP</button>
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
      <h3 style="font-size:14px; font-weight:600; margin-bottom:12px;">ADaM Data</h3>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
        <label class="btn btn-secondary" style="cursor:pointer;">
          Upload .xpt files
          <input type="file" id="xpt-file-input" accept=".xpt" multiple style="display:none;">
        </label>
        <span id="upload-status" style="font-size:12px; color:var(--cdisc-text-secondary);"></span>
      </div>
      ${datasets.length > 0 ? _renderDatasetTable(datasets) : `
      <div style="font-size:12px; color:var(--cdisc-text-secondary);">No datasets loaded. Upload ADaM .xpt files to begin.</div>`}
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
// Endpoint card
// ---------------------------------------------------------------------------

function _renderEndpointCard(ep, study, datasets, webRReady) {
  const spec = appState.endpointSpecs[ep.id];
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === ep.id);
  const result = appState.endpointResults[ep.id] || {};
  const adam = appState.conceptMappings?.adam || {};
  const selectedDataset = (result.datasetOverride || resolvedEp?.targetDataset || '').toLowerCase();

  const analysis = resolvedEp?.analyses?.[0];
  const methodOid = analysis?.method?.oid || '';
  const methodDef = appState.methodsCache?.[methodOid] || null;
  const methodName = methodDef?.name || methodOid;

  // Look up R implementation from the catalog
  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const rImpl = implCatalog[methodOid]?.[0] || null;

  // Generate execution payload from the resolved spec (with any user overrides)
  const specWithDataset = resolvedEp ? { ...resolvedEp, targetDataset: selectedDataset || resolvedEp.targetDataset } : null;
  const payload = specWithDataset
    ? generateExecutionPayload(specWithDataset, appState.conceptMappings, result.varOverrides, methodDef, rImpl)
    : null;

  const statusClass = result.status === 'complete' ? 'exec-card-complete'
    : result.status === 'running' ? 'exec-card-running'
    : result.status === 'error' ? 'exec-card-error' : '';

  // Binding summary from the resolved spec
  const bindings = analysis?.resolvedBindings || [];
  const slices = analysis?.resolvedSlices || [];
  const expression = analysis?.resolvedExpression;

  return `
    <div class="exec-endpoint-card ${statusClass}" data-ep-id="${ep.id}">
      <!-- Header -->
      <div class="exec-card-header">
        <div>
          <strong>${ep.name}</strong>
          <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:6px;">${ep.level}</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${result.status === 'complete' ? '<span class="badge badge-teal">Complete</span>' : ''}
          ${result.status === 'error' ? '<span class="badge" style="background:var(--cdisc-error); color:white;">Error</span>' : ''}
          ${result.status === 'running' ? '<span class="badge badge-blue">Running...</span>' : ''}
          <button class="btn btn-primary btn-sm exec-run-btn" data-ep-id="${ep.id}"
            ${!webRReady || datasets.length === 0 || !payload ? 'disabled style="opacity:0.5;"' : ''}>
            ${result.status === 'complete' ? 'Re-run' : 'Execute'}
          </button>
        </div>
      </div>

      <div class="exec-card-meta">
        <span>${spec.conceptCategory || ''}</span>
        <span>Method: ${methodName}</span>
        <span style="display:flex; align-items:center; gap:4px;">Dataset:
          ${datasets.length > 0 ? `
          <select class="exec-dataset-select" data-ep-id="${ep.id}" style="font-size:11px; padding:2px 6px;">
            <option value="">-- select --</option>
            ${datasets.map(ds => `<option value="${ds.name}" ${ds.name === selectedDataset ? 'selected' : ''}>${ds.name} (${ds.nrow.toLocaleString()})</option>`).join('')}
          </select>` : `<code>${selectedDataset || 'not set'}</code>`}
        </span>
        ${result.status ? `<button class="btn-reset-exec" data-ep-id="${ep.id}" style="margin-left:auto; font-size:10px; padding:2px 8px; cursor:pointer; background:none; border:1px solid var(--cdisc-border); border-radius:3px; color:var(--cdisc-text-secondary);">Reset</button>` : ''}
      </div>

      <!-- Resolved Bindings from spec — with ADaM variable selection -->
      ${bindings.length > 0 ? `
      <div class="exec-bindings-section">
        <div class="exec-bindings-title">RESOLVED BINDINGS (from specification)</div>
        <table class="exec-bindings-table">
          <thead><tr><th>Role</th><th>Concept</th><th>ADaM Variable</th><th>Type</th><th>Slice</th></tr></thead>
          <tbody>${bindings.filter(b => b.direction !== 'output').map(b => {
            const concept = b.concept?.replace(/@.*/, '') || '';
            const options = getVariableOptions(concept, adam, b.requiredValueType, b.dataStructureRole);
            const overrides = result.varOverrides || {};
            const defaultVar = overrides[concept]
              || getDefaultVariable(concept, b.dataStructureRole, adam);
            // Special case: baseline covariate
            const displayVar = defaultVar;
            const allOptions = options;
            return `<tr>
              <td>${b.methodRole}</td>
              <td><code>${concept}</code></td>
              <td>${allOptions.length > 1
                ? `<select class="exec-var-override" data-ep-id="${ep.id}" data-concept="${concept}"
                    style="font-size:11px; padding:2px 4px; font-family:monospace;">
                    ${allOptions.map(v => `<option value="${v}" ${v === displayVar ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>`
                : `<code>${displayVar}</code>`}</td>
              <td>${b.dataStructureRole}</td>
              <td>${b.slice || '--'}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Resolved Slices from spec -->
      ${slices.length > 0 ? `
      <div class="exec-bindings-section">
        <div class="exec-bindings-title">RESOLVED SLICES (cube constraints)</div>
        <table class="exec-bindings-table">
          <thead><tr><th>Slice</th><th>Dimension</th><th>ADaM Variable</th><th>Value</th></tr></thead>
          <tbody>${slices.map(s => {
            const dims = s.resolvedValues || {};
            return Object.entries(dims).map(([dim, val]) => {
              const dimOptions = getVariableOptions(dim, adam, null, 'dimension');
              const sliceOverrides = result.sliceOverrides || {};
              const overrideKey = `${s.name}|${dim}`;
              const currentVal = sliceOverrides[overrideKey]?.value ?? val;
              const currentVar = sliceOverrides[overrideKey]?.variable;
              const defaultVar = getDefaultVariable(dim, 'dimension', adam);
              const displayVar = currentVar || defaultVar;
              return `<tr>
                <td>${s.name}</td>
                <td>${dim}</td>
                <td>${dimOptions.length > 1 ? `
                  <select class="exec-slice-var-override" data-ep-id="${ep.id}" data-slice="${s.name}" data-dim="${dim}"
                    style="font-size:11px; padding:2px 4px; font-family:monospace;">
                    ${dimOptions.map(v => `<option value="${v}" ${v === displayVar ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>` : `<code>${displayVar}</code>`}</td>
                <td><input class="exec-slice-val-override" data-ep-id="${ep.id}" data-slice="${s.name}" data-dim="${dim}"
                  value="${_escapeAttr(currentVal)}" style="font-size:11px; padding:2px 6px; width:180px;
                  border:1px solid var(--cdisc-border); border-radius:3px;"></td>
              </tr>`;
            }).join('');
          }).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Expression: concept-level + resolved with ADaM variables -->
      ${expression ? (() => {
        // Build concept → ADaM variable map from bindings + overrides
        const varMap = {};
        for (const b of bindings) {
          if (b.direction === 'output') continue;
          const concept = (b.concept || '').replace(/@.*/, '');
          const userOverride = result.varOverrides?.[concept];
          const defaultVar = getDefaultVariable(concept, b.dataStructureRole, adam);
          varMap[concept] = userOverride || defaultVar;
        }
        // Substitute concept names in formula (longest first), strip @slice suffixes
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
      ${result.error ? `
      <div style="margin-top:8px; padding:10px 14px; background:rgba(220,53,69,0.08); border:1px solid var(--cdisc-error); border-radius:var(--radius); font-size:12px; color:var(--cdisc-error);">
        <strong>Error:</strong> ${_escapeHtml(result.error)}
      </div>` : ''}

      <!-- Results -->
      ${result.results ? _renderARDResults(result.results) : ''}

      <!-- Generated R Program (shown after results) -->
      ${result.results ? `
      <div class="exec-bindings-section" style="margin-top:16px;">
        <div class="exec-bindings-title">GENERATED R PROGRAM</div>
        <div style="display:flex; gap:0; flex-wrap:wrap;">
          <details class="exec-code-details" open>
            <summary>Metadata-Driven (via engine)</summary>
            <pre class="exec-code-pre">${payload ? _escapeHtml(payload.bootstrapCode) : ''}</pre>
          </details>
          <details class="exec-code-details" open>
            <summary>Resolved (standalone)</summary>
            <pre class="exec-code-pre">${result.results.resolved_code ? _escapeHtml(result.results.resolved_code) : 'Not available'}</pre>
          </details>
        </div>
      </div>` : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// ARD results rendering
// ---------------------------------------------------------------------------

function _renderARDResults(results) {
  const sections = [];

  if (results.ls_means) {
    sections.push({ id: 'lsmeans', label: 'LS Means',
      html: _renderTable(_toRows(results.ls_means), ['Group', 'estimate', 'SE', 'df', 'CI_lower', 'CI_upper']) });
  }
  if (results.contrasts) {
    sections.push({ id: 'contrasts', label: 'Contrasts',
      html: _renderTable(_toRows(results.contrasts), ['Contrast', 'estimate', 'SE', 'df', 'CI_lower', 'CI_upper', 't_statistic', 'p_value']) });
  }
  if (results.type3_tests) {
    sections.push({ id: 'type3', label: 'Type III Tests',
      html: _renderTable(_toRows(results.type3_tests), ['Term', 'SS', 'df', 'F_statistic', 'p_value']) });
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
  container.querySelector('#btn-back-esap')?.addEventListener('click', () => navigateTo(7));

  // WebR init
  container.querySelector('#btn-init-webr')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-init-webr');
    const progress = container.querySelector('#webr-progress');
    btn.disabled = true;
    btn.textContent = 'Initializing...';
    try {
      await initWebR(msg => { if (progress) progress.textContent = msg; });
      // Load the AC/DC engine into the R environment
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

  // Slice value/variable overrides (editable in resolved slices table)
  container.querySelectorAll('.exec-slice-var-override, .exec-slice-val-override').forEach(el => {
    el.addEventListener('change', () => {
      const epId = el.dataset.epId;
      const key = `${el.dataset.slice}|${el.dataset.dim}`;
      if (!appState.endpointResults[epId]) appState.endpointResults[epId] = {};
      if (!appState.endpointResults[epId].sliceOverrides) appState.endpointResults[epId].sliceOverrides = {};
      if (!appState.endpointResults[epId].sliceOverrides[key]) appState.endpointResults[epId].sliceOverrides[key] = {};
      if (el.classList.contains('exec-slice-var-override')) {
        appState.endpointResults[epId].sliceOverrides[key].variable = el.value;
      } else {
        appState.endpointResults[epId].sliceOverrides[key].value = el.value;
      }
    });
  });

  // Variable override dropdowns — re-render to update bootstrap + formula display
  container.querySelectorAll('.exec-var-override').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = sel.dataset.epId;
      const concept = sel.dataset.concept;
      if (!appState.endpointResults[epId]) appState.endpointResults[epId] = {};
      if (!appState.endpointResults[epId].varOverrides) appState.endpointResults[epId].varOverrides = {};
      appState.endpointResults[epId].varOverrides[concept] = sel.value;
      renderExecuteAnalysis(container);
    });
  });

  // Dataset selection
  container.querySelectorAll('.exec-dataset-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = sel.dataset.epId;
      if (!appState.endpointResults[epId]) appState.endpointResults[epId] = {};
      appState.endpointResults[epId].datasetOverride = sel.value;
      renderExecuteAnalysis(container);
    });
  });

  // Reset execution
  container.querySelectorAll('.btn-reset-exec').forEach(btn => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.epId;
      const varOverrides = appState.endpointResults[epId]?.varOverrides;
      const datasetOverride = appState.endpointResults[epId]?.datasetOverride;
      appState.endpointResults[epId] = { varOverrides, datasetOverride };
      renderExecuteAnalysis(container);
    });
  });

  // Execute buttons
  container.querySelectorAll('.exec-run-btn').forEach(btn => {
    btn.addEventListener('click', () => _executeEndpoint(container, btn.dataset.epId));
  });

  // ARD tabs
  container.querySelectorAll('.exec-ard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const card = tab.closest('.exec-endpoint-card');
      card.querySelectorAll('.exec-ard-tab').forEach(t => t.classList.remove('active'));
      card.querySelectorAll('.exec-ard-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      card.querySelector(`[data-tab-panel="${tab.dataset.tab}"]`)?.classList.add('active');
    });
  });
}

async function _executeEndpoint(container, epId) {
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === epId);
  if (!resolvedEp) return;

  // Always reload the engine to pick up latest changes
  try {
    await loadEngine();
  } catch (err) {
    appState.endpointResults[epId] = { status: 'error', error: `Failed to load engine: ${err.message}` };
    renderExecuteAnalysis(container);
    return;
  }

  const resultState = appState.endpointResults[epId] || {};
  const overrides = resultState.varOverrides || null;
  const selectedDataset = (resultState.datasetOverride || resolvedEp.targetDataset || '').toLowerCase();

  // Apply slice value overrides to the spec before passing to R
  const patchedSpec = JSON.parse(JSON.stringify({ ...resolvedEp, targetDataset: selectedDataset }));
  const sliceOverrides = resultState.sliceOverrides || {};
  if (patchedSpec.analyses?.[0]?.resolvedSlices) {
    for (const s of patchedSpec.analyses[0].resolvedSlices) {
      const vals = s.resolvedValues || {};
      for (const dim of Object.keys(vals)) {
        const key = `${s.name}|${dim}`;
        if (sliceOverrides[key]?.value !== undefined) {
          vals[dim] = sliceOverrides[key].value;
        }
      }
    }
  }

  // Look up method definition and R implementation
  const methodOid = resolvedEp.analyses?.[0]?.method?.oid || '';
  const methodDef = appState.methodsCache?.[methodOid] || null;
  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const rImpl = implCatalog[methodOid]?.[0] || null;

  const payload = generateExecutionPayload(patchedSpec, appState.conceptMappings, overrides, methodDef, rImpl);

  appState.endpointResults[epId] = {
    ...appState.endpointResults[epId],
    status: 'running', results: null, error: null
  };
  renderExecuteAnalysis(container);

  try {
    // Pass all metadata JSONs to R as string variables
    await setJsonVariable('spec_json', payload.specJson);
    await setJsonVariable('mapping_json', payload.mappingJson);
    await setJsonVariable('method_json', payload.methodJson);
    await setJsonVariable('r_impl_json', payload.rImplJson);
    if (payload.overridesJson !== 'NULL') {
      await setJsonVariable('overrides_json', payload.overridesJson);
    }

    // Execute the bootstrap code (which calls acdc_execute)
    const result = await executeR(payload.bootstrapCode);

    if (result.success) {
      let parsed = result.result;
      try {
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        else if (parsed?.values) parsed = JSON.parse(parsed.values[0]);
      } catch (e) { /* keep as-is */ }
      appState.endpointResults[epId] = { ...appState.endpointResults[epId], status: 'complete', results: parsed, error: null };
    } else {
      appState.endpointResults[epId] = { ...appState.endpointResults[epId], status: 'error', results: null, error: result.error };
    }
  } catch (err) {
    appState.endpointResults[epId] = { ...appState.endpointResults[epId], status: 'error', results: null, error: err.message };
  }

  renderExecuteAnalysis(container);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    .exec-card-meta { font-size:12px; color:var(--cdisc-text-secondary); display:flex; gap:16px; }
    .btn-sm { padding:4px 12px; font-size:12px; }
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
  </style>`;
}
