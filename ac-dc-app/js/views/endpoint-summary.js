import { appState, navigateTo } from '../app.js';
import { getAllEndpoints } from '../utils/usdm-parser.js';
import {
  buildSyntaxTemplate, buildFormalizedDescription, buildEstimandDescription,
  getSpecParameterValue, getTransformationByOid, getDerivationTransformationByOid
} from './endpoint-spec.js';
import { buildResolvedSpecification, buildMergedDataStructure, renderMergedDSD } from '../utils/instance-serializer.js';
import { buildSliceLookup, displayConcept } from '../utils/concept-display.js';
import { getMethodConfigurations } from '../utils/transformation-linker.js';
import { buildResolvedExpressionObject } from './transformation-config.js';

export function renderEndpointSummary(container) {
  const study = appState.selectedStudy;
  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study in Step 1 first.</p></div>';
    return;
  }

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));
  const configuredEps = selectedEps.filter(ep => {
    const spec = appState.endpointSpecs[ep.id];
    return spec?.conceptCategory;
  });

  if (configuredEps.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No endpoints configured</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please configure endpoint specifications in Step 3 first.</p></div>';
    return;
  }

  // Save analysis specs to esapAnalyses for later eSAP generation
  for (const ep of configuredEps) {
    const spec = appState.endpointSpecs[ep.id];
    if (spec?.selectedTransformationOid && spec.useInEsap !== false) {
      const transform = getTransformationByOid(spec.selectedTransformationOid);
      appState.esapAnalyses[ep.id] = {
        transformation: transform,
        endpointSpec: spec,
        resolvedSentence: buildFormalizedDescription(ep, spec, study) || '',
        customInputBindings: spec.customInputBindings || null,
        activeInteractions: spec.activeInteractions || [],
        dimensionalSliceValues: spec.dimensionValues || {},
        methodConfig: spec.methodConfigOverrides || {}
      };
    }
  }

  const cards = configuredEps.map(ep => {
    const spec = appState.endpointSpecs[ep.id];
    const originalText = ep.text || ep.description || ep.name;
    const formalized = buildFormalizedDescription(ep, spec, study);
    const estimandDesc = buildEstimandDescription(ep, spec, study);
    const syntax = buildSyntaxTemplate(ep, spec, study);
    const paramValue = getSpecParameterValue(ep.id, spec, study);

    const derivation = spec.selectedDerivationOid
      ? getDerivationTransformationByOid(spec.selectedDerivationOid) : null;
    const transform = spec.selectedTransformationOid
      ? getTransformationByOid(spec.selectedTransformationOid) : null;

    // Build resolved expression
    const customBindings = spec.customInputBindings || transform?.bindings?.filter(b => b.direction !== 'output') || [];
    const method = transform?.usesMethod ? appState.methodsCache?.[transform.usesMethod] : null;
    const resolvedExpr = method ? buildResolvedExpressionObject(customBindings, method, spec.activeInteractions || []) : null;

    // Build expanded detail sections
    const dimValues = spec.dimensionValues || {};
    const dimEntries = Object.entries(dimValues).filter(([, v]) => v);
    const bindings = customBindings;
    const sliceLookup = transform ? buildSliceLookup(transform) : {};
    const methodConfigs = method ? getMethodConfigurations(method, transform, spec.methodConfigOverrides || {}) : [];
    const derivChain = spec.derivationChain || [];
    const derivLib = appState.transformationLibrary?.derivationTransformations || [];

    return `
      <div class="ep-summary-card">
        <!-- Header -->
        <div class="ep-summary-header">
          <strong style="font-size:15px;">${ep.name}</strong>
          <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}">${ep.level}</span>
          ${spec.conceptCategory ? `<span class="badge badge-teal">${spec.conceptCategory}</span>` : ''}
          <div style="margin-left:auto; display:flex; gap:6px;">
            <button class="btn btn-sm btn-secondary ep-detail-toggle" data-ep-id="${ep.id}" style="font-size:11px;">Detail</button>
            <button class="btn btn-sm btn-secondary ep-json-toggle" data-ep-id="${ep.id}" style="font-size:11px;">JSON</button>
            <button class="btn btn-sm btn-secondary ep-edit-btn" data-ep-id="${ep.id}" style="font-size:11px;">Edit</button>
          </div>
        </div>

        <!-- Three-column comparison -->
        <div class="ep-summary-comparison">
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-text-secondary);">Original (Protocol)</div>
            <div class="ep-summary-col-text" style="background:var(--cdisc-background); border-left-color:var(--cdisc-text-secondary); color:var(--cdisc-text-secondary);">
              ${originalText}
            </div>
          </div>
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-primary);">Formalized (Repaired)</div>
            <div class="ep-summary-col-text" style="background:var(--cdisc-primary-light); border-left-color:var(--cdisc-primary); font-weight:500;">
              ${formalized || '<span style="color:var(--cdisc-text-secondary); font-style:italic;">Not yet formalized</span>'}
            </div>
          </div>
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-accent2);">Estimand (ICH E9(R1))</div>
            <div class="ep-summary-col-text" style="background:rgba(0,133,124,0.06); border-left-color:var(--cdisc-accent2); font-weight:500;">
              ${estimandDesc || '<span style="color:var(--cdisc-text-secondary); font-style:italic;">No summary measure tagged</span>'}
            </div>
          </div>
        </div>

        <!-- Compact detail grid (always visible) -->
        <div class="ep-summary-detail-grid">
          <div class="ep-summary-detail">
            <div class="ep-summary-detail-label">Endpoint (What)</div>
            <div style="font-size:13px;">
              <strong>${displayConcept(spec.conceptCategory)}</strong>
              ${derivation ? ` — ${derivation.name}` : ''}
              ${paramValue ? `<br><span style="color:var(--cdisc-text-secondary);">Parameter: ${paramValue}</span>` : ''}
            </div>
          </div>
          <div class="ep-summary-detail">
            <div class="ep-summary-detail-label">Analysis (How)</div>
            <div style="font-size:13px;">
              ${transform ? `
                <strong>${transform.name}</strong>
                ${transform.usesMethod ? `<br><span style="color:var(--cdisc-text-secondary);">Method: ${transform.usesMethod}</span>` : ''}
                ${transform.acCategory ? `<br><span class="badge badge-secondary" style="font-size:10px;">${transform.acCategory}</span>` : ''}
              ` : '<span style="color:var(--cdisc-text-secondary); font-style:italic;">No analysis selected</span>'}
            </div>
          </div>
        </div>

        ${resolvedExpr ? `
        <div style="margin-top:12px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">
            Method Expression
            <span style="font-size:9px; font-weight:400; text-transform:none; letter-spacing:0; margin-left:6px; color:var(--cdisc-text-secondary);">(${resolvedExpr.notation})</span>
          </div>
          <div style="font-family:'SF Mono','Fira Code','Consolas',monospace; font-size:13px; background:var(--cdisc-background); padding:10px 14px; border-radius:var(--radius); border-left:3px solid var(--cdisc-primary); line-height:1.6;">
            ${resolvedExpr.resolved}
          </div>
          ${resolvedExpr.interactions?.length ? `
          <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px;">
            Interactions: ${resolvedExpr.interactions.join(', ')}
          </div>
          ` : ''}
        </div>
        ` : ''}

        ${syntax ? `
        <div style="margin-top:12px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Syntax Template</div>
          <div style="font-family:'SF Mono','Fira Code','Consolas',monospace; font-size:12px; background:var(--cdisc-background); padding:10px 14px; border-radius:var(--radius); line-height:1.6;">
            ${syntax.resolved}
          </div>
        </div>
        ` : ''}

        <!-- Expanded Detail Panel (hidden by default) -->
        <div class="ep-detail-panel" data-ep-id="${ep.id}" style="display:none; margin-top:16px; padding-top:16px; border-top:1px solid var(--cdisc-border);">

          ${dimEntries.length > 0 ? `
          <div style="margin-bottom:14px;">
            <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Dimensions</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${dimEntries.map(([dim, val]) => `
                <div style="font-size:12px; padding:4px 10px; background:var(--cdisc-background); border-radius:var(--radius); border-left:3px solid var(--cdisc-accent2);">
                  <span style="color:var(--cdisc-text-secondary);">${dim}:</span> <strong>${val}</strong>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          ${bindings.length > 0 ? `
          <div style="margin-bottom:14px;">
            <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Input Bindings</div>
            <table class="data-table" style="font-size:12px;">
              <thead><tr><th>Role</th><th>Concept</th><th>Value Type</th><th>Structure</th><th>Slice</th><th>Note</th></tr></thead>
              <tbody>
                ${bindings.map(b => `
                  <tr>
                    <td style="font-weight:600;">${b.methodRole || ''}</td>
                    <td>
                      <code>${displayConcept(b.concept, { dataType: spec.dataType, qualifierType: b.qualifierType, qualifierValue: b.qualifierValue })}</code>
                      ${b.qualifierType && b.qualifierValue ? `<br><span style="font-size:10px; color:var(--cdisc-text-secondary);">${b.qualifierType}: ${b.qualifierValue}</span>` : ''}
                    </td>
                    <td>${b.requiredValueType ? `<span style="font-size:11px;">${b.requiredValueType}</span>` : ''}</td>
                    <td><span class="badge ${b.dataStructureRole === 'dimension' ? 'badge-teal' : 'badge-blue'}" style="font-size:10px;">${b.dataStructureRole || 'measure'}</span></td>
                    <td>${b.slice || ''}</td>
                    <td style="font-size:11px; color:var(--cdisc-text-secondary);">${b.note || b.description || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}

          ${methodConfigs.length > 0 ? `
          <div style="margin-bottom:14px;">
            <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Method Configuration</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${methodConfigs.map(cfg => {
                const sourceColor = cfg.source === 'user' ? 'var(--cdisc-accent2)' : cfg.source === 'transformation' ? 'var(--cdisc-primary)' : 'var(--cdisc-text-secondary)';
                return `
                <div style="font-size:12px; padding:4px 10px; background:var(--cdisc-background); border-radius:var(--radius); border-left:3px solid ${sourceColor};">
                  <span style="color:var(--cdisc-text-secondary);">${cfg.label}:</span> <strong>${cfg.value}</strong>
                </div>`;
              }).join('')}
            </div>
          </div>
          ` : ''}

          ${Object.keys(sliceLookup).length > 0 ? `
          <div style="margin-bottom:14px;">
            <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Named Slices</div>
            ${Object.entries(sliceLookup).map(([name, def]) => {
              const dims = def.fixedDimensions || def;
              return `<div style="font-size:12px; margin-bottom:2px;"><code>${name}</code>: ${Object.entries(dims).map(([k, v]) => `${k} = ${v}`).join(', ')}</div>`;
            }).join('')}
          </div>
          ` : ''}

          ${derivChain.length > 0 ? `
          <div style="margin-bottom:14px;">
            <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Derivation Pipeline</div>
            <div style="display:flex; align-items:center; gap:0; overflow-x:auto;">
              ${derivChain.map((entry, i) => {
                const d = derivLib.find(x => x.oid === entry.derivationOid);
                return `
                  ${i > 0 ? '<span style="padding:0 6px; color:var(--cdisc-text-secondary);">→</span>' : ''}
                  <div style="padding:6px 10px; border:1px solid var(--cdisc-border); border-radius:var(--radius); background:var(--cdisc-surface); font-size:11px; white-space:nowrap;">
                    <strong>${displayConcept(d?.name || entry.derivationOid)}</strong>
                    <div style="font-size:10px; color:var(--cdisc-text-secondary);">${d?.usesMethod || ''}</div>
                  </div>`;
              }).join('')}
              <span style="padding:0 6px; color:var(--cdisc-text-secondary);">→</span>
              <div style="padding:6px 10px; border:1px solid var(--cdisc-primary); border-radius:var(--radius); background:var(--cdisc-primary-light); font-size:11px; white-space:nowrap;">
                <strong>${transform?.name || 'Analysis'}</strong>
                <div style="font-size:10px; color:var(--cdisc-text-secondary);">${transform?.usesMethod || ''}</div>
              </div>
            </div>
          </div>
          ` : ''}

          ${spec.activeInteractions?.length > 0 ? `
          <div style="margin-bottom:14px;">
            <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Interactions</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${spec.activeInteractions.map(i => `<code style="font-size:11px; padding:2px 6px; background:var(--cdisc-background); border-radius:var(--radius);">${i}</code>`).join('')}
            </div>
          </div>
          ` : ''}
        </div>

        <!-- Merged Data Structure (W3C QB) -->
          ${(() => {
            const mergedDSD = buildMergedDataStructure(spec, transform);
            return renderMergedDSD(mergedDSD);
          })()}

        <!-- JSON Panel (hidden by default) -->
        <div class="ep-json-panel" data-ep-id="${ep.id}" style="display:none; margin-top:16px; padding-top:16px; border-top:1px solid var(--cdisc-border);">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">eSAP Specification (JSON)</div>
          <pre style="font-family:'SF Mono','Fira Code','Consolas',monospace; font-size:11px; background:var(--cdisc-background); padding:14px; border-radius:var(--radius); overflow-x:auto; max-height:400px; overflow-y:auto; line-height:1.5; white-space:pre-wrap;" class="ep-json-content" data-ep-id="${ep.id}"></pre>
        </div>
      </div>`;
  }).join('');

  const hasAnyAnalysis = configuredEps.some(ep => appState.endpointSpecs[ep.id]?.selectedTransformationOid);

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Summary: All Endpoints</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
          Review all configured endpoints before proceeding to derivations
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-analysis">&larr; Back to Analysis</button>
        <button class="btn btn-primary" id="btn-proceed-derivations" ${!hasAnyAnalysis ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
          Identify Derivations &rarr;
        </button>
      </div>
    </div>

    <!-- Summary stats -->
    <div style="display:flex; gap:16px; margin-bottom:24px;">
      <div class="card" style="padding:12px 20px; flex:1; text-align:center;">
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-primary);">${configuredEps.length}</div>
        <div style="font-size:11px; color:var(--cdisc-text-secondary);">Endpoints Configured</div>
      </div>
      <div class="card" style="padding:12px 20px; flex:1; text-align:center;">
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-accent2);">${configuredEps.filter(ep => appState.endpointSpecs[ep.id]?.selectedTransformationOid).length}</div>
        <div style="font-size:11px; color:var(--cdisc-text-secondary);">With Analysis</div>
      </div>
      <div class="card" style="padding:12px 20px; flex:1; text-align:center;">
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-success);">${configuredEps.filter(ep => appState.endpointSpecs[ep.id]?.estimandSummaryPattern).length}</div>
        <div style="font-size:11px; color:var(--cdisc-text-secondary);">With Estimand</div>
      </div>
    </div>

    ${cards}
  `;

  // Wire events
  // Edit buttons → navigate back to step 3 with that endpoint active
  container.querySelectorAll('.ep-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.activeEndpointId = btn.dataset.epId;
      navigateTo(3);
    });
  });

  // Detail toggle buttons
  container.querySelectorAll('.ep-detail-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.epId;
      const panel = container.querySelector(`.ep-detail-panel[data-ep-id="${epId}"]`);
      const jsonPanel = container.querySelector(`.ep-json-panel[data-ep-id="${epId}"]`);
      if (!panel) return;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (jsonPanel) jsonPanel.style.display = 'none';
      btn.textContent = isOpen ? 'Detail' : 'Hide Detail';
      // Reset JSON button text
      const jsonBtn = container.querySelector(`.ep-json-toggle[data-ep-id="${epId}"]`);
      if (jsonBtn) jsonBtn.textContent = 'JSON';
    });
  });

  // JSON toggle buttons
  container.querySelectorAll('.ep-json-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.epId;
      const panel = container.querySelector(`.ep-json-panel[data-ep-id="${epId}"]`);
      const detailPanel = container.querySelector(`.ep-detail-panel[data-ep-id="${epId}"]`);
      if (!panel) return;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (detailPanel) detailPanel.style.display = 'none';
      btn.textContent = isOpen ? 'JSON' : 'Hide JSON';
      // Reset detail button text
      const detailBtn = container.querySelector(`.ep-detail-toggle[data-ep-id="${epId}"]`);
      if (detailBtn) detailBtn.textContent = 'Detail';

      // Populate JSON on first open
      if (!isOpen) {
        const pre = panel.querySelector('.ep-json-content');
        if (pre && !pre.dataset.populated) {
          const ep = configuredEps.find(e => e.id === epId);
          if (ep) {
            const resolved = buildResolvedSpecification(appState, [ep], study);
            const epJson = resolved.endpoints?.[0] || {};
            pre.textContent = JSON.stringify(epJson, null, 2);
            pre.dataset.populated = 'true';
          }
        }
      }
    });
  });

  container.querySelector('#btn-back-analysis')?.addEventListener('click', () => navigateTo(4));
  container.querySelector('#btn-proceed-derivations')?.addEventListener('click', () => {
    if (hasAnyAnalysis) navigateTo(6);
  });
}
