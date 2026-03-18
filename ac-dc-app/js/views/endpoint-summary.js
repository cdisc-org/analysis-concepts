import { appState, navigateTo } from '../app.js';
import { getAllEndpoints } from '../utils/usdm-parser.js';
import {
  buildSyntaxTemplate, buildFormalizedDescription, buildEstimandDescription,
  getSpecParameterValue, getTransformationByOid, getDerivationTransformationByOid
} from './endpoint-spec.js';

export function renderEndpointSummary(container) {
  const study = appState.selectedStudy;
  if (!study) { navigateTo(1); return; }

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));
  const configuredEps = selectedEps.filter(ep => {
    const spec = appState.endpointSpecs[ep.id];
    return spec?.conceptCategory;
  });

  if (configuredEps.length === 0) { navigateTo(3); return; }

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
        dimensionalSliceValues: spec.dimensionValues || {}
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

    return `
      <div class="ep-summary-card">
        <!-- Header -->
        <div class="ep-summary-header">
          <strong style="font-size:15px;">${ep.name}</strong>
          <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}">${ep.level}</span>
          ${spec.conceptCategory ? `<span class="badge badge-teal">${spec.conceptCategory}</span>` : ''}
          <button class="btn btn-sm btn-secondary ep-edit-btn" data-ep-id="${ep.id}" style="margin-left:auto; font-size:11px;">Edit</button>
        </div>

        <!-- Three-column comparison -->
        <div class="ep-summary-comparison">
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-gray);">Original (Protocol)</div>
            <div class="ep-summary-col-text" style="background:var(--cdisc-light-gray); border-left-color:var(--cdisc-gray); color:var(--cdisc-text-secondary);">
              ${originalText}
            </div>
          </div>
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-blue);">Formalized (Repaired)</div>
            <div class="ep-summary-col-text" style="background:var(--cdisc-light-blue); border-left-color:var(--cdisc-blue); font-weight:500;">
              ${formalized || '<span style="color:var(--cdisc-gray); font-style:italic;">Not yet formalized</span>'}
            </div>
          </div>
          <div>
            <div class="ep-summary-col-label" style="color:var(--cdisc-teal);">Estimand (ICH E9(R1))</div>
            <div class="ep-summary-col-text" style="background:rgba(0,133,124,0.06); border-left-color:var(--cdisc-teal); font-weight:500;">
              ${estimandDesc || '<span style="color:var(--cdisc-gray); font-style:italic;">No summary measure tagged</span>'}
            </div>
          </div>
        </div>

        <!-- Detail grid -->
        <div class="ep-summary-detail-grid">
          <div class="ep-summary-detail">
            <div class="ep-summary-detail-label">Endpoint (What)</div>
            <div style="font-size:13px;">
              <strong>${spec.conceptCategory}</strong>
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
              ` : '<span style="color:var(--cdisc-gray); font-style:italic;">No analysis selected</span>'}
            </div>
          </div>
        </div>

        ${syntax ? `
        <div style="margin-top:12px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-gray); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Syntax Template</div>
          <div style="font-family:'SF Mono','Fira Code','Consolas',monospace; font-size:12px; background:var(--cdisc-light-gray); padding:10px 14px; border-radius:var(--radius); line-height:1.6;">
            ${syntax.resolved}
          </div>
        </div>
        ` : ''}
      </div>`;
  }).join('');

  const hasAnyAnalysis = configuredEps.some(ep => appState.endpointSpecs[ep.id]?.selectedTransformationOid);

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Summary: All Endpoints</h2>
        <p style="color:var(--cdisc-gray); font-size:13px; margin-top:4px;">
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
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-blue);">${configuredEps.length}</div>
        <div style="font-size:11px; color:var(--cdisc-gray);">Endpoints Configured</div>
      </div>
      <div class="card" style="padding:12px 20px; flex:1; text-align:center;">
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-teal);">${configuredEps.filter(ep => appState.endpointSpecs[ep.id]?.selectedTransformationOid).length}</div>
        <div style="font-size:11px; color:var(--cdisc-gray);">With Analysis</div>
      </div>
      <div class="card" style="padding:12px 20px; flex:1; text-align:center;">
        <div style="font-size:24px; font-weight:700; color:var(--cdisc-success);">${configuredEps.filter(ep => appState.endpointSpecs[ep.id]?.estimandSummaryPattern).length}</div>
        <div style="font-size:11px; color:var(--cdisc-gray);">With Estimand</div>
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

  container.querySelector('#btn-back-analysis')?.addEventListener('click', () => navigateTo(4));
  container.querySelector('#btn-proceed-derivations')?.addEventListener('click', () => {
    if (hasAnyAnalysis) navigateTo(6);
  });
}
