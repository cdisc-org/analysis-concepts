import { appState, navigateTo } from '../app.js';
import { loadMethod } from '../data-loader.js';
import { getAllEndpoints, getBiomedicalConcepts, getVisitLabels, getPopulationNames, getEndpointParameterOptions } from '../utils/usdm-parser.js';
import {
  ensureSpec, getMatchingAnalysisTransformations, getTransformationByOid,
  getSpecParameterValue, buildSyntaxTemplate, buildFormalizedDescription,
  buildEstimandDescription, getDimensionOptionsForSlice, inferDefaultSummaryPattern,
  getSummaryMeasurePhrase, updateSyntaxPreview, syncLegacyTransformationOid,
  SKIP_IN_DIM_GRID, SUMMARY_MEASURE_PHRASES, getDerivationTransformationByOid,
  buildEstimandFrameworkHtml
} from './endpoint-spec.js';
import {
  renderFormulaExpression, renderInteractiveBindings, renderInteractiveBindingsByRole,
  generateInteractionPairings,
  classifyBindings, buildExpressionString, parseDefaultInteractions, getConceptOptions
} from './transformation-config.js';
import { getOutputMapping, getInputBindings, getMethodConfigurations, getDimensions } from '../utils/transformation-linker.js';
import { displayConcept, formatDimensionConstraints, formatSliceDisplay, buildSliceLookup } from '../utils/concept-display.js';


// ===== Main render function =====

export async function renderEndpointHow(container) {
  const study = appState.selectedStudy;
  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study in Step 1 first.</p></div>';
    return;
  }

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));
  // Only show endpoints that have conceptCategory set (configured in step 3)
  const configuredEps = selectedEps.filter(ep => appState.endpointSpecs[ep.id]?.conceptCategory);
  if (configuredEps.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No endpoints configured</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please configure endpoint specifications in Step 3 first.</p></div>';
    return;
  }

  if (!appState.activeEndpointId || !configuredEps.find(ep => ep.id === appState.activeEndpointId)) {
    appState.activeEndpointId = configuredEps[0].id;
  }

  // Ensure selectedAnalyses is initialized for all configured endpoints
  for (const ep of configuredEps) {
    ensureSpec(ep.id);
  }

  // Load methods for ALL selected analyses of the active endpoint
  const activeSpec = appState.endpointSpecs[appState.activeEndpointId] || {};
  const activeAnalyses = activeSpec.selectedAnalyses || [];
  const activeMethodMap = {}; // transformationOid -> method
  for (const analysis of activeAnalyses) {
    const transform = getTransformationByOid(analysis.transformationOid);
    if (transform) {
      try {
        activeMethodMap[analysis.transformationOid] = await loadMethod(appState, transform.usesMethod);
      } catch (e) { console.warn('Could not load method:', e); }
    }
  }

  // Build endpoint accordion cards
  const epCards = configuredEps.map(ep => {
    const isActive = ep.id === appState.activeEndpointId;
    const spec = appState.endpointSpecs[ep.id] || {};
    const originalText = ep.text || ep.description || ep.name;
    const syntax = buildSyntaxTemplate(ep, spec, study);
    const formalized = buildFormalizedDescription(ep, spec, study);
    const estimandDesc = buildEstimandDescription(ep, spec, study);
    const paramValue = getSpecParameterValue(ep.id, spec, study);
    const analyses = spec.selectedAnalyses || [];

    // Get derivation name for carry-forward display
    const derivation = spec.selectedDerivationOid
      ? getDerivationTransformationByOid(spec.selectedDerivationOid) : null;

    // Initialize per-analysis custom input bindings if needed
    for (const analysis of analyses) {
      const transform = getTransformationByOid(analysis.transformationOid);
      if (transform && !analysis.resolvedBindings) {
        analysis.resolvedBindings = JSON.parse(JSON.stringify(
          (transform.bindings || []).filter(b => b.direction !== 'output')
        ));
        if (!analysis.activeInteractions) analysis.activeInteractions = [];
      }
      // Auto-infer summary measure per analysis
      if (transform && !analysis.estimandSummaryPattern) {
        const inferred = inferDefaultSummaryPattern(transform);
        if (inferred) analysis.estimandSummaryPattern = inferred;
      }
    }

    // Build per-analysis cards HTML
    const analysisCardsHtml = analyses.map((analysis, aIdx) => {
      const transform = getTransformationByOid(analysis.transformationOid);
      if (!transform) return '';

      const method = isActive ? activeMethodMap[analysis.transformationOid] || null : null;
      const customBindings = analysis.resolvedBindings || (transform.bindings ? JSON.parse(JSON.stringify(transform.bindings.filter(b => b.direction !== 'output'))) : null);

      // Temporarily set global state for renderInteractiveBindings compatibility
      const prevTransform = appState.selectedTransformation;
      if (isActive && transform) appState.selectedTransformation = transform;

      const hasFormula = !!(method?.formula);
      const notation = method?.formula?.notation || '';
      const hasModelFormula = notation === 'wilkinson_rogers' || notation === 'survival';
      const formulaHtml = hasFormula ? renderFormulaExpression(customBindings, method, analysis.activeInteractions || []) : '';
      const interactionPairings = hasModelFormula ? generateInteractionPairings(customBindings, method) : [];

      // Split bindings into measures and dimensions for cube-structure display
      const measureBindingsHtml = (method && customBindings) ? renderInteractiveBindingsByRole(customBindings, method, appState.dcModel, 'measure', paramValue, derivation, transform) : '';
      const dimensionBindingsHtml = (method && customBindings) ? renderInteractiveBindingsByRole(customBindings, method, appState.dcModel, 'dimension', paramValue, derivation, transform) : '';

      appState.selectedTransformation = prevTransform;

      // Method configurations with 3-layer merge
      const userConfigOverrides = spec?.methodConfigOverrides || {};
      const methodConfigs = method ? getMethodConfigurations(method, transform, userConfigOverrides) : [];

      const outputMapping = (method && customBindings)
        ? getOutputMapping(transform, appState.acModel, method, customBindings, analysis.activeInteractions || [])
        : [];

      // Build named slices section
      const namedSlices = buildSliceLookup(transform);
      const namedSliceEntries = Object.entries(namedSlices);
      // Find which bindings reference each named slice
      const sliceUsage = {};
      for (const [sliceName] of namedSliceEntries) {
        sliceUsage[sliceName] = (customBindings || [])
          .filter(b => b.slice === sliceName)
          .map(b => b.methodRole);
      }

      return `
        <div class="ep-analysis-card card" style="margin-bottom:12px; padding:16px; border-left:3px solid var(--cdisc-primary);" data-ep-id="${ep.id}" data-analysis-idx="${aIdx}">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <strong style="font-size:13px;">${transform.name}</strong>
              <span class="badge badge-secondary" style="font-size:10px;">${transform.acCategory || ''}</span>
              ${transform.usesMethod ? `<span style="font-size:11px; color:var(--cdisc-text-secondary);">${transform.usesMethod}</span>` : ''}
            </div>
            <button class="btn btn-secondary ep-remove-analysis" data-ep-id="${ep.id}" data-analysis-idx="${aIdx}" style="padding:2px 8px; font-size:11px;" title="Remove this analysis">&times;</button>
          </div>

          ${method && customBindings ? `
          <!-- Input Measures -->
          <div style="margin-bottom:12px; padding:10px 14px; background:rgba(0,100,200,0.03); border:1px solid rgba(0,100,200,0.12); border-radius:var(--radius);">
            <div style="font-weight:600; font-size:11px; margin-bottom:6px; color:var(--cdisc-primary); text-transform:uppercase; letter-spacing:0.5px;">Input Measures</div>
            <div class="ep-analysis-bindings" data-ep-id="${ep.id}" data-analysis-idx="${aIdx}">
              ${measureBindingsHtml}
            </div>
          </div>

          <!-- Input Dimensions -->
          ${dimensionBindingsHtml ? `
          <div style="margin-bottom:12px; padding:10px 14px; background:rgba(0,133,124,0.03); border:1px solid rgba(0,133,124,0.12); border-radius:var(--radius);">
            <div style="font-weight:600; font-size:11px; margin-bottom:6px; color:var(--cdisc-accent2); text-transform:uppercase; letter-spacing:0.5px;">Input Dimensions</div>
            <div class="ep-analysis-bindings" data-ep-id="${ep.id}" data-analysis-idx="${aIdx}">
              ${dimensionBindingsHtml}
            </div>
          </div>
          ` : ''}
          ` : ''}

          ${transform.sliceKeys?.length > 0 ? `
          <!-- Analysis Scope (Slice Keys) -->
          <div style="margin-bottom:12px; padding:10px 14px; background:var(--cdisc-background); border:1px solid var(--cdisc-border); border-radius:var(--radius);">
            <div style="font-weight:600; font-size:11px; margin-bottom:6px; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Analysis Scope</div>
            <div class="ep-dim-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:8px;">
              ${transform.sliceKeys.map(sk => {
                const dim = sk.dimension;
                if (SKIP_IN_DIM_GRID.has(dim)) return '';
                const currentVal = (spec.dimensionValues || {})[dim] || '';
                const options = getDimensionOptionsForSlice(dim, { source: sk.source, configurable: true }, study, ep.id);
                return `
                    <div class="config-field">
                      <label class="config-label"><span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">${dim}</span></label>
                      ${options && options.length > 0 ? `
                        <select class="config-select ep-dim-value" data-ep-id="${ep.id}" data-dim="${dim}">
                          <option value="">-- Select --</option>
                          ${options.map(opt => {
                            const val = typeof opt === 'object' ? opt.value : opt;
                            const label = typeof opt === 'object' ? opt.label : opt;
                            const tooltip = typeof opt === 'object' && opt.label !== opt.value ? ` title="${label}"` : '';
                            return `<option value="${val}"${tooltip} ${val === currentVal ? 'selected' : ''}>${val}</option>`;
                          }).join('')}
                        </select>
                      ` : `
                        <input class="config-input ep-dim-value" data-ep-id="${ep.id}" data-dim="${dim}" value="${currentVal}" placeholder="Enter ${dim.toLowerCase()} value">
                      `}
                    </div>`;
              }).join('')}
            </div>
          </div>
          ` : ''}

          ${namedSliceEntries.length > 0 ? `
          <!-- Named Slices -->
          <div style="margin-bottom:12px; padding:8px 14px; background:rgba(0,133,124,0.03); border:1px solid rgba(0,133,124,0.1); border-radius:var(--radius);">
            <div style="font-weight:600; font-size:11px; margin-bottom:4px; color:var(--cdisc-accent2); text-transform:uppercase; letter-spacing:0.5px;">Named Slices</div>
            ${namedSliceEntries.map(([sliceName, sliceDef]) => {
              const dims = sliceDef.fixedDimensions || sliceDef;
              const dimStr = Object.entries(dims).map(([k, v]) => `${k} = ${v}`).join(', ');
              const usedBy = sliceUsage[sliceName] || [];
              return `<div style="font-size:12px; line-height:1.6;">
                <code>${sliceName}</code>: ${dimStr}
                ${usedBy.length > 0 ? `<span style="font-size:10px; color:var(--cdisc-text-secondary);"> (used by: ${usedBy.join(', ')})</span>` : ''}
              </div>`;
            }).join('')}
          </div>
          ` : ''}

          ${hasFormula ? `
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:11px; margin-bottom:6px; color:var(--cdisc-text-secondary);">Model Expression</div>
            <div class="formula-display" style="font-size:12px;">${formulaHtml}</div>
            ${hasModelFormula && interactionPairings.length > 0 ? `
              <div style="margin-top:10px;">
                <div style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary); margin-bottom:4px;">Interaction terms:</div>
                <div class="interaction-list">
                  ${interactionPairings.map(pair => {
                    const checked = (analysis.activeInteractions || []).includes(pair);
                    return `<label><input type="checkbox" class="ep-interaction" data-ep-id="${ep.id}" data-analysis-idx="${aIdx}" data-interaction="${pair}" ${checked ? 'checked' : ''}> ${pair}</label>`;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
          ` : ''}

          ${methodConfigs.length > 0 ? `
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:11px; margin-bottom:8px; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Method Configuration</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px;">
              ${methodConfigs.map(cfg => {
                const sourceColor = cfg.source === 'user' ? 'var(--cdisc-accent2)' : cfg.source === 'transformation' ? 'var(--cdisc-primary)' : 'var(--cdisc-text-secondary)';
                const sourceLabel = cfg.source === 'user' ? 'custom' : cfg.source === 'transformation' ? 'template' : 'default';
                return `
                <div>
                  <label style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary); display:flex; align-items:center; gap:4px; margin-bottom:3px;">
                    ${cfg.label}
                    <span style="font-size:9px; color:${sourceColor}; font-weight:500;">${sourceLabel}</span>
                  </label>
                  ${cfg.options.length > 0 ? `
                    <select class="config-select ep-method-config" data-ep-id="${ep.id}" data-analysis-idx="${aIdx}" data-config-key="${cfg.key}" style="font-size:12px; padding:4px 8px;">
                      ${cfg.options.map(opt => `
                        <option value="${opt}" ${String(opt) === String(cfg.value) ? 'selected' : ''}>${opt}</option>
                      `).join('')}
                    </select>
                  ` : `
                    <input class="config-input ep-method-config" data-ep-id="${ep.id}" data-analysis-idx="${aIdx}" data-config-key="${cfg.key}" value="${cfg.value != null ? cfg.value : ''}" style="font-size:12px; padding:4px 8px; width:120px;">
                  `}
                  ${cfg.description ? `<div style="font-size:10px; color:var(--cdisc-text-secondary); margin-top:2px;">${cfg.description}</div>` : ''}
                </div>`;
              }).join('')}
            </div>
          </div>
          ` : ''}

          ${transform.methodOutputSlotMapping ? (() => {
            const outputSlots = getOutputMapping(transform, appState.acModel, method, customBindings, analysis.activeInteractions || []);
            return `
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:11px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Outputs</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${outputSlots.map(slot => {
                const isSummary = analysis.estimandSummaryPattern === slot.patternName;
                return `
                <div class="ep-output-pattern-card" data-ep-id="${ep.id}" data-analysis-idx="${aIdx}" data-pattern-name="${slot.patternName}"
                  style="padding:6px 10px; border:2px solid ${isSummary ? 'var(--cdisc-accent2)' : 'var(--cdisc-border)'}; border-radius:var(--radius); cursor:pointer; background:${isSummary ? 'rgba(0,133,124,0.06)' : 'white'}; min-width:120px; max-width:200px;">
                  <div style="display:flex; align-items:center; gap:4px; margin-bottom:2px;">
                    ${isSummary ? '<span style="font-size:11px;">&#9733;</span>' : ''}
                    <strong style="font-size:11px;">${slot.patternName}</strong>
                  </div>
                  <span class="ep-summary-badge" style="display:${isSummary ? 'inline-block' : 'none'}; font-size:8px; font-weight:600; color:var(--cdisc-accent2); text-transform:uppercase;">Summary Measure</span>
                  <div style="font-size:9px; color:var(--cdisc-text-secondary);">${slot.constituents.slice(0, 3).join(', ')}${slot.constituents.length > 3 ? ', ...' : ''}</div>
                  ${slot.dimensions.length > 0 ? `
                  <div style="font-size:9px; color:var(--cdisc-primary); margin-top:3px; border-top:1px solid var(--cdisc-border); padding-top:3px;">
                    Indexed by: ${slot.dimensions.map(id => {
                      if (id.includes(':')) {
                        return id.split(':').map(part => `<code>${displayConcept(part)}</code>`).join(':');
                      }
                      return `<code>${displayConcept(id)}</code>`;
                    }).join(', ')}
                  </div>` : ''}
                </div>`;
              }).join('')}
            </div>
          </div>`;
          })() : ''}
        </div>`;
    }).join('');

    // Header badges: show count of selected analyses
    const analysisBadges = analyses.length > 0
      ? analyses.map(a => {
          const t = getTransformationByOid(a.transformationOid);
          return t ? `<span class="badge badge-blue" style="margin-left:4px;">${t.name}</span>` : '';
        }).join('')
      : '';

    return `
      <div class="ep-accordion-item ${isActive ? 'open' : ''}" data-ep-id="${ep.id}">
        <div class="ep-accordion-header" data-ep-id="${ep.id}">
          <span class="ep-accordion-arrow">&#9654;</span>
          <strong style="font-size:14px;">${ep.name}</strong>
          <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:4px;">${ep.level}</span>
          ${spec.conceptCategory ? `<span class="badge badge-teal" style="margin-left:auto;">${spec.conceptCategory}</span>` : ''}
          ${analyses.length > 0 ? `<span class="badge badge-blue" style="margin-left:4px;">${analyses.length} analysis${analyses.length > 1 ? 'es' : ''}</span>` : ''}
        </div>
        <div class="ep-accordion-body">
          <!-- Carry-forward from Endpoint step -->
          <div class="ep-carry-forward">
            <div class="ep-carry-forward-label">Endpoint Definition (from Step 3)</div>
            <div style="margin-bottom:4px;">${originalText}</div>
            ${syntax ? `<div style="margin-top:8px; font-size:13px; line-height:1.6;">${syntax.resolved}</div>` : `
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
              <span class="badge badge-teal">${spec.conceptCategory}</span>
              ${paramValue ? `<span style="font-size:12px; color:var(--cdisc-text-secondary);">Parameter: <strong>${paramValue}</strong></span>` : ''}
            </div>`}
          </div>

          ${analyses.length > 0 ? `
          <!-- Selected Analyses -->
          <div style="margin-bottom:16px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:8px; color:var(--cdisc-text-secondary);">
              Selected Analyses <span class="badge badge-blue" style="font-size:10px; margin-left:4px;">${analyses.length}</span>
            </div>
            ${analysisCardsHtml}
          </div>
          ` : `
          <div style="padding:16px; background:var(--cdisc-background); border-radius:var(--radius); font-size:12px; color:var(--cdisc-text-secondary); text-align:center;">
            Select analysis templates from the library panel on the right.
          </div>
          `}

          <!-- Endpoint & Estimand Descriptions -->
          <div style="margin-top:16px; border-top:2px solid var(--cdisc-border); padding-top:12px;">
            <!-- Row 1: Endpoint -->
            <div style="font-weight:700; font-size:13px; margin-bottom:8px;">Endpoint</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
              <div>
                <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Original (Protocol)</div>
                <div style="padding:10px 14px; background:var(--cdisc-background); border-radius:var(--radius); font-size:12px; line-height:1.5; border-left:3px solid var(--cdisc-text-secondary);">${originalText}</div>
              </div>
              <div>
                <div style="font-size:10px; font-weight:600; color:var(--cdisc-primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Formalized (Repaired)</div>
                <div id="formalized-${ep.id}" style="padding:10px 14px; background:var(--cdisc-primary-light); border-radius:var(--radius); font-size:12px; line-height:1.5; border-left:3px solid var(--cdisc-primary); font-weight:500;">${formalized || '<span style="color:var(--cdisc-text-secondary); font-style:italic;">Configure analysis to generate</span>'}</div>
              </div>
            </div>
            <!-- Row 2: Estimand Framework (ICH E9(R1)) -->
            <div style="font-weight:700; font-size:13px; margin-bottom:8px;">Estimand <span style="font-weight:400; font-size:11px; color:var(--cdisc-text-secondary);">(ICH E9(R1))</span> <span style="position:relative; display:inline-flex; align-items:center; justify-content:center; width:15px; height:15px; border-radius:50%; background:var(--cdisc-accent2); color:#fff; font-size:10px; font-weight:700; cursor:help; vertical-align:middle; margin-left:2px;" class="estimator-info-trigger">i<span class="estimator-info-tooltip" style="display:none; position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%); width:340px; padding:12px 14px; background:#fff; border:1px solid var(--cdisc-border); border-radius:var(--radius); box-shadow:0 4px 12px rgba(0,0,0,0.15); font-size:11px; font-weight:400; color:var(--cdisc-text); line-height:1.5; z-index:100; text-align:left; cursor:default;"><strong style="color:var(--cdisc-accent2);">Estimand</strong> (ICH E9(R1) §A.3)<br><br>A precise description of the treatment effect reflecting the clinical question posed by the trial objective.<br><br><strong>Attributes:</strong> Population, Treatment, Variable, Intercurrent events, Population-level summary<br><br><span style="color:var(--cdisc-text-secondary); font-size:10px;">Estimand = what to estimate &nbsp;|&nbsp; Estimator = how to estimate &nbsp;|&nbsp; Estimate = numerical result</span></span></span></div>
            <div id="estimand-${ep.id}" style="margin-bottom:12px;">
              ${buildEstimandFrameworkHtml(ep, spec, study, estimandDesc)}
            </div>

            <!-- Implementation & Write-back options -->
            <div style="display:flex; gap:20px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); flex-wrap:wrap; align-items:center;">
              <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="checkbox" class="ep-use-esap" data-ep-id="${ep.id}" ${spec.useInEsap !== false ? 'checked' : ''}>
                Use in eSAP
              </label>
              <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="checkbox" class="ep-write-usdm" data-ep-id="${ep.id}" ${spec.writeBackToUsdm ? 'checked' : ''}>
                Write back to USDM
              </label>
              <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
                <span style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary);">Target Dataset:</span>
                <input class="config-input ep-target-dataset" data-ep-id="${ep.id}" value="${spec.targetDataset || ''}" placeholder="e.g., ADQS" style="width:80px; font-size:11px; padding:2px 6px;">
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Build analysis library panel (multi-select with checkmarks)
  const activeSpecForLib = appState.endpointSpecs[appState.activeEndpointId] || {};
  const matchingTransforms = getMatchingAnalysisTransformations(activeSpecForLib.conceptCategory);
  const activeSelectedOids = new Set((activeSpecForLib.selectedAnalyses || []).map(a => a.transformationOid));

  const libraryContent = matchingTransforms.length === 0
    ? `<div class="ep-library-panel-empty">No analysis templates for ${activeSpecForLib.conceptCategory || 'this concept'}</div>`
    : matchingTransforms.map(t => {
        const isSelected = activeSelectedOids.has(t.oid);
        return `
          <div class="ep-library-card ${isSelected ? 'selected-teal' : ''}" data-transform-oid="${t.oid}" data-ep-id="${appState.activeEndpointId}">
            <div style="display:flex; align-items:center; gap:6px;">
              ${isSelected ? '<span style="color:var(--cdisc-accent2); font-weight:700;">&#10003;</span>' : '<span style="color:var(--cdisc-border); font-size:14px;">&#9634;</span>'}
              <div class="ep-library-card-name">${t.name}</div>
            </div>
            <div class="ep-library-card-meta">
              <span class="badge badge-secondary" style="font-size:10px;">${t.acCategory || ''}</span>
              ${t.usesMethod ? `<span style="font-size:11px; color:var(--cdisc-text-secondary);">${t.usesMethod}</span>` : ''}
            </div>
            ${t.description ? `<div class="ep-library-card-desc">${t.description.length > 100 ? t.description.slice(0, 100) + '...' : t.description}</div>` : ''}
          </div>`;
      }).join('');

  const hasAnyAnalysis = configuredEps.some(ep => (appState.endpointSpecs[ep.id]?.selectedAnalyses || []).length > 0);

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Analysis Specification</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
          Configure analysis inputs, scope, and summary measures for each endpoint
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-endpoint">&larr; Back to Endpoint</button>
        <button class="btn btn-primary" id="btn-proceed-summary" ${!hasAnyAnalysis ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
          View Summary &rarr;
        </button>
      </div>
    </div>

    <div class="ep-split-layout">
      <div class="ep-main-content">
        ${epCards}
      </div>
      <div class="ep-library-panel" id="analysis-library-panel">
        <div class="ep-library-panel-title">Analysis Templates</div>
        <div id="library-cards">
          ${libraryContent}
        </div>
      </div>
    </div>
  `;

  wireEndpointHowEvents(container, study, configuredEps);
}


// ===== Update library panel when active endpoint changes =====

function updateAnalysisLibraryPanel(container) {
  const spec = appState.endpointSpecs[appState.activeEndpointId] || {};
  const transforms = getMatchingAnalysisTransformations(spec.conceptCategory);
  const selectedOids = new Set((spec.selectedAnalyses || []).map(a => a.transformationOid));
  const panel = container.querySelector('#library-cards');
  if (!panel) return;

  if (transforms.length === 0) {
    panel.innerHTML = `<div class="ep-library-panel-empty">No analysis templates for ${spec.conceptCategory || 'this concept'}</div>`;
    return;
  }

  panel.innerHTML = transforms.map(t => {
    const isSelected = selectedOids.has(t.oid);
    return `
      <div class="ep-library-card ${isSelected ? 'selected-teal' : ''}" data-transform-oid="${t.oid}" data-ep-id="${appState.activeEndpointId}">
        <div style="display:flex; align-items:center; gap:6px;">
          ${isSelected ? '<span style="color:var(--cdisc-accent2); font-weight:700;">&#10003;</span>' : '<span style="color:var(--cdisc-border); font-size:14px;">&#9634;</span>'}
          <div class="ep-library-card-name">${t.name}</div>
        </div>
        <div class="ep-library-card-meta">
          <span class="badge badge-secondary" style="font-size:10px;">${t.acCategory || ''}</span>
          ${t.usesMethod ? `<span style="font-size:11px; color:var(--cdisc-text-secondary);">${t.usesMethod}</span>` : ''}
        </div>
        ${t.description ? `<div class="ep-library-card-desc">${t.description.length > 100 ? t.description.slice(0, 100) + '...' : t.description}</div>` : ''}
      </div>`;
  }).join('');

  // Re-wire library card click events
  wireLibraryCardEvents(container);
}


// ===== Wire library card click events =====

function wireLibraryCardEvents(container) {
  container.querySelectorAll('.ep-library-card').forEach(card => {
    card.addEventListener('click', () => {
      const transformOid = card.dataset.transformOid;
      const epId = card.dataset.epId;
      if (!transformOid || !epId) return;

      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      const transform = getTransformationByOid(transformOid);
      if (!transform) return;

      // Multi-select toggle: add or remove from selectedAnalyses
      const existingIdx = spec.selectedAnalyses.findIndex(a => a.transformationOid === transformOid);
      if (existingIdx >= 0) {
        // Remove this analysis
        spec.selectedAnalyses.splice(existingIdx, 1);
      } else {
        // Add new analysis with template defaults
        spec.selectedAnalyses.push({
          transformationOid: transformOid,
          resolvedBindings: JSON.parse(JSON.stringify(
            (transform.bindings || []).filter(b => b.direction !== 'output')
          )),
          activeInteractions: [],
          estimandSummaryPattern: null
        });
      }

      // Sync legacy field for backward compat
      syncLegacyTransformationOid(epId);

      // Full re-render to load method and rebuild UI
      renderEndpointHow(container);
    });
  });
}


// ===== Wire all event handlers =====

function wireEndpointHowEvents(container, study, configuredEps) {

  // --- Accordion header toggles ---
  container.querySelectorAll('.ep-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const epId = header.dataset.epId;
      const item = header.closest('.ep-accordion-item');
      if (!item) return;

      const wasOpen = item.classList.contains('open');

      // Close all accordions
      container.querySelectorAll('.ep-accordion-item').forEach(el => el.classList.remove('open'));

      if (wasOpen) {
        // Collapsed the active one — clear active
        appState.activeEndpointId = null;
      } else {
        // Open the clicked one
        item.classList.add('open');
        appState.activeEndpointId = epId;
      }

      // Update the library panel for the new active endpoint
      updateAnalysisLibraryPanel(container);
    });
  });

  // --- Binding shape click-to-expand provenance ---
  container.querySelectorAll('.binding-shape-line').forEach(line => {
    line.addEventListener('click', (e) => {
      e.stopPropagation();
      const bindingId = line.dataset.bindingId;
      const prov = line.parentElement?.querySelector(`.binding-provenance[data-binding-id="${bindingId}"]`);
      if (prov) {
        prov.style.display = prov.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  // --- Library card clicks ---
  wireLibraryCardEvents(container);

  // --- Estimator info tooltip hover ---
  container.querySelectorAll('.estimator-info-trigger').forEach(trigger => {
    const tooltip = trigger.querySelector('.estimator-info-tooltip');
    if (!tooltip) return;
    trigger.addEventListener('mouseenter', () => { tooltip.style.display = 'block'; });
    trigger.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });

  // --- Dimensional slice changes ---
  container.querySelectorAll('.ep-dim-value').forEach(el => {
    const handler = () => {
      const epId = el.dataset.epId;
      const dim = el.dataset.dim;
      if (!epId || !dim) return;

      ensureSpec(epId);
      if (!appState.endpointSpecs[epId].dimensionValues) {
        appState.endpointSpecs[epId].dimensionValues = {};
      }
      appState.endpointSpecs[epId].dimensionValues[dim] = el.value;

      updateSyntaxPreview(container, epId, study);
    };
    el.addEventListener('change', handler);
    if (el.tagName === 'INPUT') {
      el.addEventListener('input', handler);
    }
  });

  // --- Remove analysis button ---
  container.querySelectorAll('.ep-remove-analysis').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const epId = btn.dataset.epId;
      const aIdx = parseInt(btn.dataset.analysisIdx, 10);
      if (!epId || isNaN(aIdx)) return;

      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (spec.selectedAnalyses && aIdx < spec.selectedAnalyses.length) {
        spec.selectedAnalyses.splice(aIdx, 1);
        syncLegacyTransformationOid(epId);
      }
      renderEndpointHow(container);
    });
  });

  // --- Output pattern clicks (estimand summary measure tagging) — per-analysis ---
  container.querySelectorAll('.ep-output-pattern-card').forEach(card => {
    card.addEventListener('click', () => {
      const epId = card.dataset.epId;
      const aIdx = parseInt(card.dataset.analysisIdx, 10);
      const patternName = card.dataset.patternName;
      if (!epId || !patternName) return;

      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];

      if (!isNaN(aIdx) && spec.selectedAnalyses?.[aIdx]) {
        // Per-analysis summary measure toggle
        const analysis = spec.selectedAnalyses[aIdx];
        analysis.estimandSummaryPattern = analysis.estimandSummaryPattern === patternName ? null : patternName;
        syncLegacyTransformationOid(epId);
      } else {
        // Legacy: toggle on spec directly
        spec.estimandSummaryPattern = spec.estimandSummaryPattern === patternName ? null : patternName;
      }

      // Update pattern card visuals within the analysis card
      const analysisCard = card.closest('.ep-analysis-card') || card.closest('.ep-accordion-item');
      if (analysisCard) {
        const activePattern = !isNaN(aIdx) && spec.selectedAnalyses?.[aIdx]
          ? spec.selectedAnalyses[aIdx].estimandSummaryPattern
          : spec.estimandSummaryPattern;
        analysisCard.querySelectorAll('.ep-output-pattern-card').forEach(otherCard => {
          if (!isNaN(aIdx) && otherCard.dataset.analysisIdx !== String(aIdx)) return;
          const otherPattern = otherCard.dataset.patternName;
          const isSummary = activePattern === otherPattern;
          otherCard.style.borderColor = isSummary ? 'var(--cdisc-accent2)' : 'var(--cdisc-border)';
          otherCard.style.background = isSummary ? 'rgba(0,133,124,0.06)' : 'white';
          const badge = otherCard.querySelector('.ep-summary-badge');
          if (badge) badge.style.display = isSummary ? 'inline-block' : 'none';
          const titleDiv = otherCard.querySelector('div > div:first-child');
          if (titleDiv) {
            const starSpan = titleDiv.querySelector('span[style*="font-size:11px"]');
            if (isSummary && !starSpan) {
              const star = document.createElement('span');
              star.style.fontSize = '11px';
              star.innerHTML = '&#9733;';
              titleDiv.insertBefore(star, titleDiv.firstChild);
            } else if (!isSummary && starSpan) {
              starSpan.remove();
            }
          }
        });
      }

      updateSyntaxPreview(container, epId, study);
    });
  });

  // --- Interaction checkboxes — per-analysis ---
  container.querySelectorAll('.ep-interaction').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = cb.dataset.epId;
      const aIdx = parseInt(cb.dataset.analysisIdx, 10);
      const inter = cb.dataset.interaction;
      if (!epId || !inter) return;

      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];

      if (!isNaN(aIdx) && spec.selectedAnalyses?.[aIdx]) {
        const analysis = spec.selectedAnalyses[aIdx];
        if (!analysis.activeInteractions) analysis.activeInteractions = [];
        if (cb.checked) {
          if (!analysis.activeInteractions.includes(inter)) analysis.activeInteractions.push(inter);
        } else {
          analysis.activeInteractions = analysis.activeInteractions.filter(i => i !== inter);
        }
        syncLegacyTransformationOid(epId);
      } else {
        // Legacy fallback
        if (!spec.activeInteractions) spec.activeInteractions = [];
        if (cb.checked) {
          if (!spec.activeInteractions.includes(inter)) spec.activeInteractions.push(inter);
        } else {
          spec.activeInteractions = spec.activeInteractions.filter(i => i !== inter);
        }
      }

      renderEndpointHow(container);
    });
  });

  // --- Method configuration change handlers ---
  container.querySelectorAll('.ep-method-config').forEach(el => {
    el.addEventListener('change', () => {
      const epId = el.dataset.epId;
      const configKey = el.dataset.configKey;
      let value = el.value;
      if (!isNaN(value) && value !== '') value = Number(value);
      if (!epId) return;

      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (!spec.methodConfigOverrides) spec.methodConfigOverrides = {};

      // Sparse: only store if different from method default
      const method = appState.methodsCache?.[spec.selectedTransformationOid?.replace('T.', 'M.')] || null;
      const cfgDef = (method?.configurations || []).find(c => c.name === configKey);
      if (cfgDef && (value === cfgDef.defaultValue || String(value) === String(cfgDef.defaultValue))) {
        delete spec.methodConfigOverrides[configKey];
      } else {
        spec.methodConfigOverrides[configKey] = value;
      }

      renderEndpointHow(container);
    });
  });

  // --- Binding remove buttons — per-analysis ---
  container.querySelectorAll('.binding-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const analysisCard = btn.closest('.ep-analysis-card');
      const accordionItem = btn.closest('.ep-accordion-item');
      if (!accordionItem) return;
      const epId = accordionItem.dataset.epId;
      const roleName = btn.dataset.role;
      const idx = parseInt(btn.dataset.index, 10);

      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];

      // Determine which bindings array to modify
      let bindings = null;
      let analysis = null;
      if (analysisCard) {
        const aIdx = parseInt(analysisCard.dataset.analysisIdx, 10);
        if (!isNaN(aIdx) && spec.selectedAnalyses?.[aIdx]) {
          analysis = spec.selectedAnalyses[aIdx];
          bindings = analysis.resolvedBindings;
        }
      }
      if (!bindings) bindings = spec.resolvedBindings;
      if (!bindings) return;

      let count = 0;
      for (let i = 0; i < bindings.length; i++) {
        if (bindings[i].methodRole === roleName) {
          if (count === idx) {
            bindings.splice(i, 1);
            break;
          }
          count++;
        }
      }

      // Clean up interactions referencing removed concepts
      const remainingConcepts = new Set(bindings.map(b => b.concept));
      const interactions = analysis ? analysis.activeInteractions : spec.activeInteractions;
      if (interactions) {
        const filtered = interactions.filter(inter => {
          const [a, b] = inter.split(':');
          return remainingConcepts.has(a) && remainingConcepts.has(b);
        });
        if (analysis) analysis.activeInteractions = filtered;
        else spec.activeInteractions = filtered;
      }

      if (analysis) syncLegacyTransformationOid(epId);
      renderEndpointHow(container);
    });
  });

  // --- Binding add selects — per-analysis ---
  container.querySelectorAll('.binding-add-select').forEach(select => {
    select.addEventListener('change', () => {
      const analysisCard = select.closest('.ep-analysis-card');
      const accordionItem = select.closest('.ep-accordion-item');
      if (!accordionItem) return;
      const epId = accordionItem.dataset.epId;
      const roleName = select.dataset.role;
      const value = select.value;
      if (!value) return;

      const type = select.options[select.selectedIndex].dataset.type || 'concept';

      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];

      let bindings = null;
      if (analysisCard) {
        const aIdx = parseInt(analysisCard.dataset.analysisIdx, 10);
        if (!isNaN(aIdx) && spec.selectedAnalyses?.[aIdx]) {
          bindings = spec.selectedAnalyses[aIdx].resolvedBindings;
        }
      }
      if (!bindings) bindings = spec.resolvedBindings;
      if (!bindings) return;

      bindings.push({
        methodRole: roleName,
        concept: value,
        direction: 'input',
        dataStructureRole: type === 'dimensional' ? 'dimension' : 'measure',
        description: '',
        _custom: true
      });

      syncLegacyTransformationOid(epId);
      renderEndpointHow(container);
    });
  });

  // --- Write-back options: Use in eSAP ---
  container.querySelectorAll('.ep-use-esap').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = cb.dataset.epId;
      if (!epId) return;
      ensureSpec(epId);
      appState.endpointSpecs[epId].useInEsap = cb.checked;
    });
  });

  // --- Write-back options: Write back to USDM ---
  container.querySelectorAll('.ep-write-usdm').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = cb.dataset.epId;
      if (!epId) return;
      ensureSpec(epId);
      appState.endpointSpecs[epId].writeBackToUsdm = cb.checked;
    });
  });

  // --- Target dataset input ---
  container.querySelectorAll('.ep-target-dataset').forEach(input => {
    input.addEventListener('change', () => {
      const epId = input.dataset.epId;
      if (!epId) return;
      ensureSpec(epId);
      appState.endpointSpecs[epId].targetDataset = input.value.trim().toUpperCase();
    });
  });

  // --- Navigation: Back to Endpoint (step 3) ---
  const btnBack = container.querySelector('#btn-back-endpoint');
  if (btnBack) {
    btnBack.addEventListener('click', () => navigateTo(3));
  }

  // --- Navigation: Proceed to Summary (step 5) ---
  const btnProceed = container.querySelector('#btn-proceed-summary');
  if (btnProceed) {
    btnProceed.addEventListener('click', () => {
      const hasAny = configuredEps.some(ep => (appState.endpointSpecs[ep.id]?.selectedAnalyses || []).length > 0);
      if (!hasAny) return;
      navigateTo(5);
    });
  }
}
