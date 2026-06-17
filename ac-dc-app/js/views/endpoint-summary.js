import { appState, navigateTo } from '../app.js';
import { getAllEndpoints } from '../utils/usdm-parser.js';
import { getTransformationByOid } from './endpoint-spec.js';
import { displayConcept } from '../utils/concept-display.js';

export function renderEndpointSummary(container) {
  const study = appState.selectedStudy;
  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study in Step 1 first.</p></div>';
    return;
  }

  // Read from resolved spec (JSON-driven UI)
  const resolvedSpec = appState.resolvedSpec;
  const resolvedEndpoints = resolvedSpec?.endpoints || [];

  // Filter to endpoints that have been configured (have a concept category)
  const configuredReps = resolvedEndpoints.filter(rep => rep.$ui?.conceptCategory);

  if (configuredReps.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No endpoints configured</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please configure endpoint specifications in Step 3 first.</p></div>';
    return;
  }

  // Save analysis specs to esapAnalyses for later eSAP generation (still reads raw spec for mutation)
  const allEndpoints = getAllEndpoints(study);
  for (const rep of configuredReps) {
    const rawSpec = appState.endpointSpecs[rep.id];
    const ep = allEndpoints.find(e => e.id === rep.id);
    if (rawSpec?.selectedTransformationOid && rep.$ui.useInEsap) {
      const transform = getTransformationByOid(rawSpec.selectedTransformationOid);
      appState.esapAnalyses[rep.id] = {
        transformation: transform,
        endpointSpec: rawSpec,
        resolvedSentence: rep.$ui.formalized || '',
        resolvedBindings: rawSpec.resolvedBindings || null,
        activeInteractions: rawSpec.activeInteractions || [],
        dimensionalSliceValues: rawSpec.dimensionValues || {},
        methodConfig: rawSpec.methodConfigOverrides || {}
      };
    }
  }

  const derivLib = appState.transformationLibrary?.derivationTransformations || [];

  const cards = configuredReps.map(rep => {
    const ui = rep.$ui;
    const uiAnalyses = ui.analyses || [];
    const derivChain = ui.derivationChain || [];
    const syntax = ui.syntax;

    return `
      <div class="ep-summary-card">
        <!-- Header -->
        <div class="ep-summary-header">
          <strong style="font-size:15px;">${rep.name}</strong>
          <span class="badge ${rep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}">${rep.level}</span>
          ${ui.conceptCategory ? `<span class="badge badge-teal">${ui.conceptCategory}</span>` : ''}
          <div style="margin-left:auto; display:flex; gap:6px;">
            <button class="btn btn-sm btn-secondary ep-detail-toggle" data-ep-id="${rep.id}" style="font-size:11px;">Detail</button>
            <button class="btn btn-sm btn-secondary ep-json-toggle" data-ep-id="${rep.id}" style="font-size:11px;">JSON</button>
            <button class="btn btn-sm btn-secondary ep-edit-btn" data-ep-id="${rep.id}" style="font-size:11px;">Edit</button>
          </div>
        </div>

        <!-- Three-column comparison -->
        <div class="ep-summary-comparison">
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-text-secondary);">Original (Protocol)</div>
            <div class="ep-summary-col-text" style="background:var(--cdisc-background); border-left-color:var(--cdisc-text-secondary); color:var(--cdisc-text-secondary);">
              ${rep.originalText}
            </div>
          </div>
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-primary);">Formalized (Repaired)</div>
            <div class="ep-summary-col-text" style="background:var(--cdisc-primary-light); border-left-color:var(--cdisc-primary); font-weight:500;">
              ${ui.formalized || '<span style="color:var(--cdisc-text-secondary); font-style:italic;">Not yet formalized</span>'}
            </div>
          </div>
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-accent2);">Estimand (ICH E9(R1))</div>
            <div class="ep-summary-col-text" style="background:rgba(0,133,124,0.06); border-left-color:var(--cdisc-accent2); font-weight:500;">
              ${ui.estimandDescription || '<span style="color:var(--cdisc-text-secondary); font-style:italic;">No summary measure tagged</span>'}
            </div>
          </div>
        </div>

        <!-- Compact detail grid (always visible) -->
        <div class="ep-summary-detail-grid">
          <div class="ep-summary-detail">
            <div class="ep-summary-detail-label">Endpoint (What)</div>
            <div style="font-size:13px;">
              <strong>${displayConcept(ui.conceptCategory)}</strong>
              ${ui.derivationName ? ` — ${ui.derivationName}` : ''}
              ${ui.parameterValue ? `<br><span style="color:var(--cdisc-text-secondary);">Parameter: ${ui.parameterValue}</span>` : ''}
            </div>
          </div>
          <div class="ep-summary-detail">
            <div class="ep-summary-detail-label">Analysis (How) ${uiAnalyses.length > 1 ? `<span style="color:var(--cdisc-text-secondary); font-weight:400;">· ${uiAnalyses.length} analyses</span>` : ''}</div>
            <div style="font-size:13px;">
              ${uiAnalyses.length === 0 ? '<span style="color:var(--cdisc-text-secondary); font-style:italic;">No analysis selected</span>' : uiAnalyses.map(a => `
                <div style="padding:6px 0; ${uiAnalyses.length > 1 ? 'border-bottom:1px dashed var(--cdisc-border);' : ''}">
                  <strong>${a.transformName || '(unnamed)'}</strong>
                  ${a.transformMethod ? `<span style="color:var(--cdisc-text-secondary); margin-left:6px;">${a.transformMethod}</span>` : ''}
                  ${a.transformCategory ? `<br><span class="badge badge-secondary" style="font-size:10px;">${a.transformCategory}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        ${uiAnalyses.filter(a => a.resolvedExpression).length > 0 ? `
        <div style="margin-top:12px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">
            Method Expression${uiAnalyses.length > 1 ? 's' : ''}
          </div>
          ${uiAnalyses.filter(a => a.resolvedExpression).map(a => `
            <div style="margin-bottom:8px;">
              ${uiAnalyses.length > 1 ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:2px;">${a.transformName} <span style="font-size:9px;">(${a.resolvedExpression.notation})</span></div>` : `<div style="font-size:9px; font-weight:400; margin-bottom:2px; color:var(--cdisc-text-secondary);">(${a.resolvedExpression.notation})</div>`}
              <div style="font-family:'SF Mono','Fira Code','Consolas',monospace; font-size:13px; background:var(--cdisc-background); padding:10px 14px; border-radius:var(--radius); border-left:3px solid var(--cdisc-primary); line-height:1.6;">
                ${a.resolvedExpression.resolved}
              </div>
              ${a.resolvedExpression.interactions?.length ? `
              <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px;">
                Interactions: ${a.resolvedExpression.interactions.join(', ')}
              </div>
              ` : ''}
            </div>
          `).join('')}
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
        <div class="ep-detail-panel" data-ep-id="${rep.id}" style="display:none; margin-top:16px; padding-top:16px; border-top:1px solid var(--cdisc-border);">

          ${uiAnalyses.map((a, idx) => `
            ${uiAnalyses.length > 1 ? `
            <div style="font-size:12px; font-weight:700; color:var(--cdisc-primary); margin:${idx === 0 ? '0' : '18px'} 0 8px 0; padding-bottom:4px; border-bottom:2px solid var(--cdisc-primary-light);">
              Analysis ${idx + 1}: ${a.transformName || '(unnamed)'} <span style="font-weight:400; color:var(--cdisc-text-secondary);">${a.transformMethod || ''}</span>
            </div>
            ` : ''}

            ${a.resolvedBindings?.length > 0 ? `
            <div style="margin-bottom:14px;">
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Resolved Bindings</div>
              <table class="data-table" style="font-size:12px;">
                <thead><tr><th>Role</th><th>Concept</th><th>Value Type</th><th>Structure</th><th>Slice</th><th>Note</th></tr></thead>
                <tbody>
                  ${a.resolvedBindings.map(b => `
                    <tr>
                      <td style="font-weight:600;">${b.methodRole || ''}</td>
                      <td>
                        <code>${displayConcept(b.concept, { dataType: ui.dataType, qualifierType: b.qualifierType, qualifierValue: b.qualifierValue })}</code>
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

            ${a.methodConfigs?.length > 0 ? `
            <div style="margin-bottom:14px;">
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Method Configuration</div>
              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${a.methodConfigs.map(cfg => {
                  const sourceColor = cfg.source === 'user' ? 'var(--cdisc-accent2)' : cfg.source === 'transformation' ? 'var(--cdisc-primary)' : 'var(--cdisc-text-secondary)';
                  return `
                  <div style="font-size:12px; padding:4px 10px; background:var(--cdisc-background); border-radius:var(--radius); border-left:3px solid ${sourceColor};">
                    <span style="color:var(--cdisc-text-secondary);">${cfg.label}:</span> <strong>${cfg.value}</strong>
                  </div>`;
                }).join('')}
              </div>
            </div>
            ` : ''}

            ${a.resolvedSlices?.length > 0 ? `
            <div style="margin-bottom:14px;">
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Resolved Slices</div>
              ${a.resolvedSlices.map(s => `
                <div style="padding:6px 12px; border:1px solid var(--cdisc-border); border-radius:var(--radius); margin-bottom:6px;">
                  <span style="font-weight:600; font-size:12px;">"${s.name}"</span>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
                    ${Object.entries(s.resolvedValues).map(([dim, val]) => `
                      <div style="font-size:12px; display:flex; gap:6px; align-items:center;">
                        <span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">${dim}</span>
                        <span>=</span>
                        <strong>${val}</strong>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
            ` : ''}

            ${a.activeInteractions?.length > 0 ? `
            <div style="margin-bottom:14px;">
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Interactions</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${a.activeInteractions.map(i => `<code style="font-size:11px; padding:2px 6px; background:var(--cdisc-background); border-radius:var(--radius);">${i}</code>`).join('')}
              </div>
            </div>
            ` : ''}
          `).join('')}

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
              ${uiAnalyses.length === 1 ? `
              <div style="padding:6px 10px; border:1px solid var(--cdisc-primary); border-radius:var(--radius); background:var(--cdisc-primary-light); font-size:11px; white-space:nowrap;">
                <strong>${uiAnalyses[0].transformName || 'Analysis'}</strong>
                <div style="font-size:10px; color:var(--cdisc-text-secondary);">${uiAnalyses[0].transformMethod || ''}</div>
              </div>
              ` : `
              <div style="padding:6px 10px; border:1px solid var(--cdisc-primary); border-radius:var(--radius); background:var(--cdisc-primary-light); font-size:11px; white-space:nowrap;">
                <strong>${uiAnalyses.length} analyses</strong>
                <div style="font-size:10px; color:var(--cdisc-text-secondary);">${uiAnalyses.map(a => a.transformName).join(', ')}</div>
              </div>
              `}
            </div>
          </div>
          ` : ''}
        </div>

        <!-- JSON Panel (hidden by default) -->
        <div class="ep-json-panel" data-ep-id="${rep.id}" style="display:none; margin-top:16px; padding-top:16px; border-top:1px solid var(--cdisc-border);">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">eSAP Specification (JSON)</div>
          <pre style="font-family:'SF Mono','Fira Code','Consolas',monospace; font-size:11px; background:var(--cdisc-background); padding:14px; border-radius:var(--radius); overflow-x:auto; max-height:400px; overflow-y:auto; line-height:1.5; white-space:pre-wrap;" class="ep-json-content" data-ep-id="${rep.id}"></pre>
        </div>
      </div>`;
  }).join('');

  const hasAnyAnalysis = configuredReps.some(rep => (rep.$ui.analyses?.length || 0) > 0);
  const totalAnalyses = configuredReps.reduce((n, rep) => n + (rep.$ui.analyses?.length || 0), 0);

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
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-primary);">${configuredReps.length}</div>
        <div style="font-size:11px; color:var(--cdisc-text-secondary);">Endpoints Configured</div>
      </div>
      <div class="card" style="padding:12px 20px; flex:1; text-align:center;">
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-accent2);">${totalAnalyses}</div>
        <div style="font-size:11px; color:var(--cdisc-text-secondary);">Analyses Defined</div>
      </div>
      <div class="card" style="padding:12px 20px; flex:1; text-align:center;">
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-success);">${configuredReps.filter(rep => rep.$ui.estimandSummaryPattern).length}</div>
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
      const jsonBtn = container.querySelector(`.ep-json-toggle[data-ep-id="${epId}"]`);
      if (jsonBtn) jsonBtn.textContent = 'JSON';
    });
  });

  // JSON toggle buttons — now uses cached resolvedSpec instead of rebuilding
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
      const detailBtn = container.querySelector(`.ep-detail-toggle[data-ep-id="${epId}"]`);
      if (detailBtn) detailBtn.textContent = 'Detail';

      // Populate JSON on first open — read from cached resolvedSpec
      if (!isOpen) {
        const pre = panel.querySelector('.ep-json-content');
        if (pre && !pre.dataset.populated) {
          const rep = configuredReps.find(r => r.id === epId);
          if (rep) {
            // Strip $ui from the JSON export view
            const { $ui, ...exportShape } = rep;
            pre.textContent = JSON.stringify(exportShape, null, 2);
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
