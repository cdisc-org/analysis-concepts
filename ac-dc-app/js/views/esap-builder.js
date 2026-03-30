import { appState, navigateTo } from '../app.js';
import { getAllEndpoints, getVisitLabels } from '../utils/usdm-parser.js';
import {
  getFormalizedDescription, buildEstimandFrameworkHtml, buildEstimandDescription,
  getTransformationByOid, getDerivationTransformationByOid,
  buildFormalizedDescription
} from './endpoint-spec.js';
import { resolveNarrative } from '../utils/usdm-ref-resolver.js';
import { getOutputMapping } from '../utils/transformation-linker.js';
import { displayConcept } from '../utils/concept-display.js';
import { loadMethod } from '../data-loader.js';
import { renderFormulaExpression } from './transformation-config.js';
import { buildResolvedSpecification } from '../utils/instance-serializer.js';

// ===== SAP ToC Section Mapping =====

const ESAP_SECTION_PREFIXES = {
  abbreviations:   ['13'],
  introduction:    ['0', '1'],
  objectives:      ['2'],
  studyDesign:     ['3.1', '3.2', '3.3', '3.5', '3.6', '3.7'],
  protocolChanges: [],
  estimands:       [],
  endpoints:       ['3.9'],
  analysisSets:    ['3.4'],
  statMethods:     ['4'],
  statAnalysis:    [],
  software:        [],
  references:      ['14'],
  shells:          [],
  appendices:      ['12']
};

const ESAP_SECTION_LABELS = {
  abbreviations:   '1. List of Abbreviations',
  introduction:    '2. Introduction',
  objectives:      '3. Study Objectives',
  studyDesign:     '4. Study Design',
  protocolChanges: '5. Changes in the Protocol',
  estimands:       '6. Estimands',
  endpoints:       '7. Study Endpoints',
  analysisSets:    '8. Analysis Sets',
  statMethods:     '9. Statistical Methods',
  statAnalysis:    '10. Statistical Analysis',
  software:        '11. Computer Software',
  references:      '12. References',
  shells:          '13. Table/Figure/Listing Shells',
  appendices:      '14. Appendices'
};

// ===== Helper: build contentItemId → section mapping =====
function buildNciToSectionMap(study) {
  const map = new Map();
  for (const sec of study.documentSections || []) {
    if (sec.contentItemId) {
      map.set(sec.contentItemId, {
        sectionNumber: sec.sectionNumber,
        sectionTitle: sec.sectionTitle
      });
    }
  }
  return map;
}

// ===== Helper: group narratives for the picker =====
function groupNarrativesForPicker(narratives, nciToSection, esapSectionKey) {
  const prefixes = ESAP_SECTION_PREFIXES[esapSectionKey] || [];
  const relevant = [];
  const groups = {};
  const other = [];

  for (const [key, label] of Object.entries(ESAP_SECTION_LABELS)) {
    if (key !== esapSectionKey) {
      groups[key] = { label, items: [] };
    }
  }

  for (const nc of narratives) {
    const sec = nciToSection.get(nc.id);
    if (!sec) {
      other.push({ ...nc, sectionNumber: '', sectionTitle: nc.name });
      continue;
    }

    const sNum = sec.sectionNumber.replace(/\.\s*$/, '');
    const item = { ...nc, sectionNumber: sNum, sectionTitle: sec.sectionTitle };

    if (prefixes.some(p => sNum === p || sNum.startsWith(p + '.') || sNum.startsWith(p + ' '))) {
      relevant.push(item);
      continue;
    }

    let placed = false;
    for (const [key, gPrefixes] of Object.entries(ESAP_SECTION_PREFIXES)) {
      if (key === esapSectionKey) continue;
      if (gPrefixes.some(p => sNum === p || sNum.startsWith(p + '.') || sNum.startsWith(p + ' '))) {
        groups[key].items.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      other.push(item);
    }
  }

  return { relevant, groups, other };
}

// ===== Main render function =====

export async function renderEsapBuilder(container) {
  const study = appState.selectedStudy;
  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study in Step 1 first.</p></div>';
    return;
  }

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));

  if (selectedEps.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No endpoints selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select endpoints in Step 2 first.</p></div>';
    return;
  }

  // Group selected endpoints by objective
  const byObjective = {};
  for (const ep of selectedEps) {
    if (!byObjective[ep.objectiveId]) {
      byObjective[ep.objectiveId] = {
        objectiveName: ep.objectiveName,
        objectiveText: ep.objectiveText,
        objectiveLevel: ep.objectiveLevel,
        endpoints: []
      };
    }
    byObjective[ep.objectiveId].endpoints.push(ep);
  }

  // Load all methods used by configured analyses
  const methodOids = new Set();
  for (const ep of selectedEps) {
    const spec = appState.endpointSpecs?.[ep.id];
    for (const analysis of spec?.selectedAnalyses || []) {
      const transform = getTransformationByOid(analysis.transformationOid);
      if (transform?.usesMethod) methodOids.add(transform.usesMethod);
    }
  }
  const loadedMethods = {};
  for (const oid of methodOids) {
    if (!appState.methodsCache[oid]) {
      await loadMethod(appState, oid);
    }
    loadedMethods[oid] = appState.methodsCache[oid] || null;
  }

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:22px; font-weight:700;">Electronic Statistical Analysis Plan</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">${study.name}</p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary esap-view-toggle active" data-view="document" style="font-size:11px; background:var(--cdisc-primary); color:#fff;">SAP Document</button>
        <button class="btn btn-secondary esap-view-toggle" data-view="datasets" style="font-size:11px;">ADaM Datasets</button>
        <button class="btn btn-secondary esap-view-toggle" data-view="json" style="font-size:11px;">{ } JSON</button>
        <button class="btn btn-secondary" id="btn-back-pipeline">&larr; Back to Pipeline</button>
      </div>
    </div>

    <div class="esap-doc">
      ${renderEsapSection('abbreviations', ESAP_SECTION_LABELS.abbreviations, renderPlaceholderSection('Link protocol abbreviations from USDM, or add manually.'), false)}
      ${renderEsapSection('introduction', ESAP_SECTION_LABELS.introduction, renderIntroductionSection(study), false)}
      ${renderEsapSection('objectives', ESAP_SECTION_LABELS.objectives, renderObjectivesSection(selectedEps, byObjective))}
      ${renderEsapSection('studyDesign', ESAP_SECTION_LABELS.studyDesign, renderStudyDesignSection(study), false)}
      ${renderEsapSection('protocolChanges', ESAP_SECTION_LABELS.protocolChanges, renderPlaceholderSection('Link USDM content describing protocol amendments and their impact on planned analyses.'), false)}
      ${renderEsapSection('estimands', ESAP_SECTION_LABELS.estimands, renderEstimandsSection(selectedEps, study))}
      ${renderEsapSection('endpoints', ESAP_SECTION_LABELS.endpoints, renderEndpointsSection(selectedEps, study))}
      ${renderEsapSection('analysisSets', ESAP_SECTION_LABELS.analysisSets, renderAnalysisSetsSection(study))}
      ${renderEsapSection('statMethods', ESAP_SECTION_LABELS.statMethods, renderStatMethodsSection(selectedEps, study, loadedMethods))}
      ${renderEsapSection('statAnalysis', ESAP_SECTION_LABELS.statAnalysis, renderStatAnalysisSection(selectedEps, study))}
      ${renderEsapSection('software', ESAP_SECTION_LABELS.software, renderPlaceholderSection('Specify statistical software (e.g., SAS 9.4, R 4.3).'), false)}
      ${renderEsapSection('references', ESAP_SECTION_LABELS.references, renderPlaceholderSection('Add references to ICH E9(R1), protocol, and relevant literature.'), false)}
      ${renderEsapSection('shells', ESAP_SECTION_LABELS.shells, renderPlaceholderSection('Table, figure, and listing shells will be appended.'), false)}
      ${renderEsapSection('appendices', ESAP_SECTION_LABELS.appendices, renderPlaceholderSection('Supplementary material.'), false)}
    </div>

    <div id="esap-datasets-panel" style="display:none; margin-top:16px;">
      ${renderDatasetsPanel(selectedEps, study)}
    </div>

    <div id="esap-json-panel" style="display:none; margin-top:16px;">
      <div class="card" style="padding:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div style="font-weight:700; font-size:14px;">Resolved Analysis Specification (JSON)</div>
          <button class="btn btn-sm btn-secondary" id="btn-copy-json" style="font-size:11px;">Copy to Clipboard</button>
        </div>
        <pre id="esap-json-content" style="max-height:600px; overflow:auto; padding:12px; background:#1e1e1e; color:#d4d4d4; border-radius:var(--radius); font-size:11px; line-height:1.5; white-space:pre-wrap; word-wrap:break-word;"></pre>
      </div>
    </div>
  `;

  // ===== Wire event handlers =====

  // Collapsible toggle
  container.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-link-usdm')) return;
      header.parentElement.classList.toggle('open');
    });
  });

  // Back button
  container.querySelector('#btn-back-pipeline')?.addEventListener('click', () => navigateTo(6));

  // Link USDM Content buttons
  container.querySelectorAll('.btn-link-usdm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showNarrativePicker(container, btn.dataset.section);
    });
  });

  // Remove linked narrative buttons
  container.querySelectorAll('.btn-remove-linked').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      const nciId = btn.dataset.nciId;
      appState.esapLinkedNarratives[section] =
        appState.esapLinkedNarratives[section].filter(id => id !== nciId);
      renderEsapBuilder(container);
    });
  });

  // Edit step buttons
  container.querySelectorAll('.esap-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.dataset.step, 10);
      if (!isNaN(step)) navigateTo(step);
    });
  });

  // View toggle (Document / ADaM Datasets / JSON)
  const panels = {
    document: container.querySelector('.esap-doc'),
    datasets: container.querySelector('#esap-datasets-panel'),
    json: container.querySelector('#esap-json-panel')
  };
  const jsonContent = container.querySelector('#esap-json-content');

  container.querySelectorAll('.esap-view-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;

      // Toggle active button styling
      container.querySelectorAll('.esap-view-toggle').forEach(b => {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = '';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--cdisc-primary)';
      btn.style.color = '#fff';

      // Show/hide panels
      for (const [key, panel] of Object.entries(panels)) {
        if (panel) panel.style.display = key === view ? '' : 'none';
      }

      // Lazy-generate JSON
      if (view === 'json' && jsonContent) {
        const resolved = buildResolvedSpecification(appState, selectedEps, study);
        jsonContent.textContent = JSON.stringify(resolved, null, 2);
      }
    });
  });

  // Copy JSON button
  const copyBtn = container.querySelector('#btn-copy-json');
  if (copyBtn && jsonContent) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(jsonContent.textContent).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
      });
    });
  }

  // Dataset assignment handlers
  container.querySelectorAll('.dataset-assign-input').forEach(input => {
    input.addEventListener('change', () => {
      const epId = input.dataset.epId;
      if (!epId) return;
      if (!appState.endpointSpecs[epId]) appState.endpointSpecs[epId] = {};
      appState.endpointSpecs[epId].targetDataset = input.value.trim().toUpperCase();
      // Also update the endpoint-how input if visible
    });
  });
}

// ===== Section Renderers — Front Matter (1-5) =====

function renderPlaceholderSection(text) {
  return `<p style="font-size:12px; color:var(--cdisc-text-secondary); font-style:italic;">${text}</p>`;
}

function renderIntroductionSection(study) {
  return `
    <table class="data-table">
      <tbody>
        <tr><td style="width:180px; font-weight:600;">Study Title</td><td>${study.name}</td></tr>
        <tr><td style="font-weight:600;">Protocol Number</td><td>${study.identifiers.map(i => i.text).join(', ')}</td></tr>
        <tr><td style="font-weight:600;">Phase</td><td>${study.phase}</td></tr>
        <tr><td style="font-weight:600;">Therapeutic Area</td><td>${study.therapeuticAreas.map(t => t.decode).join(', ')}</td></tr>
      </tbody>
    </table>
  `;
}

function renderObjectivesSection(selectedEps, byObjective) {
  let html = '';
  const levels = ['Primary', 'Secondary', 'Exploratory'];
  for (const level of levels) {
    const objs = Object.entries(byObjective).filter(([, obj]) => obj.objectiveLevel.includes(level));
    if (objs.length === 0) continue;
    const subNum = level === 'Primary' ? '3.1' : level === 'Secondary' ? '3.2' : '3.3';
    html += `<div style="margin-bottom:16px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:8px;">${subNum} ${level} Objective(s)</div>
      ${objs.map(([, obj]) => `
        <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius);">
          <strong>${obj.objectiveName}</strong>
          <p style="font-size:12px; margin-top:4px; line-height:1.5;">${obj.objectiveText || ''}</p>
          ${obj.endpoints.map(ep => `<div style="font-size:12px; margin-top:4px;"><span class="badge badge-blue">${ep.name}</span> ${ep.text || ''}</div>`).join('')}
        </div>
      `).join('')}
    </div>`;
  }
  return html || '<p style="color:var(--cdisc-text-secondary);">No objectives configured.</p>';
}

function renderStudyDesignSection(study) {
  return `
    <div style="font-weight:600; font-size:13px; margin-bottom:8px;">4.1 General Design</div>
    <table class="data-table" style="margin-bottom:16px;">
      <tbody>
        <tr><td style="width:180px; font-weight:600;">Study Type</td><td>${study.studyType || 'N/A'}</td></tr>
        <tr><td style="font-weight:600;">Phase</td><td>${study.phase}</td></tr>
        <tr><td style="font-weight:600;">Study Model</td><td>${study.studyModel || 'N/A'}</td></tr>
        <tr><td style="font-weight:600;">Intent</td><td>${(study.intentTypes || []).join(', ') || 'N/A'}</td></tr>
      </tbody>
    </table>
    <div style="font-weight:600; font-size:13px; margin-bottom:8px;">4.2 Randomization and Treatment Assignments</div>
    <table class="data-table" style="margin-bottom:16px;">
      <thead><tr><th>Arm</th><th>Type</th><th>Description</th></tr></thead>
      <tbody>
        ${study.arms.map(arm => `
          <tr>
            <td style="font-weight:600;">${arm.name}</td>
            <td><span class="badge badge-blue">${arm.type}</span></td>
            <td>${arm.description || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="font-weight:600; font-size:13px; margin-bottom:8px;">4.3 Blinding/Unblinding</div>
    <p style="font-size:12px;">${study.blindingSchema || '<span style="color:var(--cdisc-text-secondary); font-style:italic;">Not specified in USDM</span>'}</p>
  `;
}

// ===== Section 6: Estimands =====

function renderEstimandsSection(selectedEps, study) {
  const primaryEps = selectedEps.filter(ep => ep.level.includes('Primary'));
  const secondaryEps = selectedEps.filter(ep => ep.level.includes('Secondary'));
  const otherEps = selectedEps.filter(ep => !ep.level.includes('Primary') && !ep.level.includes('Secondary'));

  function renderEstimandGroup(label, eps) {
    if (eps.length === 0) return '';
    return `
      <div style="margin-bottom:16px;">
        <div style="font-weight:600; font-size:13px; margin-bottom:8px;">${label}</div>
        ${eps.map(ep => {
          const spec = appState.endpointSpecs?.[ep.id] || {};
          const estimandDesc = buildEstimandDescription(ep, spec, study);
          return `
            <div style="margin-bottom:12px;">
              <div style="font-size:12px; font-weight:600; margin-bottom:4px;">${ep.name}</div>
              ${buildEstimandFrameworkHtml(ep, spec, study, estimandDesc)}
            </div>`;
        }).join('')}
      </div>`;
  }

  let html = renderEstimandGroup('6.1 Primary Estimand(s)', primaryEps);
  html += renderEstimandGroup('6.2 Secondary Estimand(s)', secondaryEps);
  if (otherEps.length > 0) html += renderEstimandGroup('6.3 Other Estimand(s)', otherEps);

  if (!html) html = '<p style="color:var(--cdisc-text-secondary);">Configure endpoints and analyses to auto-generate estimands.</p>';

  html += `<div style="margin-top:8px;"><button class="btn btn-sm btn-secondary esap-edit-btn" data-step="4">Edit in Endpoint How &rarr;</button></div>`;
  return html;
}

// ===== Section 7: Study Endpoints =====

function renderEndpointsSection(selectedEps, study) {
  const visitLabels = getVisitLabels(study);

  let html = `
    <div style="margin-bottom:16px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:8px;">7.2 Timepoint Definitions</div>
      <div style="font-size:12px;">
        ${visitLabels.length > 0
          ? `<div style="display:flex; flex-wrap:wrap; gap:4px;">${visitLabels.map(v => `<span class="badge badge-teal">${v}</span>`).join('')}</div>`
          : '<span style="color:var(--cdisc-text-secondary);">No timepoints defined in study.</span>'}
      </div>
    </div>`;

  const groups = [
    { label: '7.7 Primary Endpoint(s)', filter: ep => ep.level.includes('Primary') },
    { label: '7.8 Secondary Endpoint(s)', filter: ep => ep.level.includes('Secondary') },
    { label: '7.9 Exploratory Endpoint(s)', filter: ep => ep.level.includes('Exploratory') },
    { label: '7.10 Safety Endpoints', filter: ep => ep.level.includes('Safety') }
  ];

  for (const group of groups) {
    const eps = selectedEps.filter(group.filter);
    if (eps.length === 0) continue;
    html += `<div style="margin-bottom:16px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:8px;">${group.label}</div>
      ${eps.map(ep => renderEndpointCard(ep)).join('')}
    </div>`;
  }

  html += `<div style="margin-top:8px;"><button class="btn btn-sm btn-secondary esap-edit-btn" data-step="3">Edit in Endpoint What &rarr;</button></div>`;
  return html;
}

function renderEndpointCard(ep) {
  const study = appState.selectedStudy;
  const formalized = study ? getFormalizedDescription(ep.id, study) : null;
  const displayText = formalized || ep.text || '';
  return `
    <div style="padding:8px 12px; margin-bottom:6px; background:var(--cdisc-background); border-radius:var(--radius); font-size:12px;">
      <strong>${ep.name}</strong>
      <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:6px;">${ep.level}</span>
      <div style="color:var(--cdisc-text-secondary); margin-top:4px; line-height:1.4;">${displayText}</div>
      ${formalized ? '<div style="font-size:10px; color:var(--cdisc-primary); margin-top:2px; font-style:italic;">Formalized description</div>' : ''}
    </div>
  `;
}

// ===== Section 8: Analysis Sets =====

function renderAnalysisSetsSection(study) {
  const analysisPopulations = study.analysisPopulations || [];

  if (analysisPopulations.length === 0) {
    return '<p style="color:var(--cdisc-text-secondary);">No analysis sets defined in study.</p>';
  }

  return `
    <table class="data-table">
      <thead><tr><th>Analysis Set</th><th>Description</th></tr></thead>
      <tbody>
        ${analysisPopulations.map(ap => `
          <tr>
            <td style="font-weight:600;">${ap.name}</td>
            <td>${ap.text || ap.description || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

// ===== Section 9: Statistical Methods =====

function renderStatMethodsSection(selectedEps, study, loadedMethods) {
  const methodUsage = new Map();

  for (const ep of selectedEps) {
    const spec = appState.endpointSpecs?.[ep.id];
    for (const analysis of spec?.selectedAnalyses || []) {
      const transform = getTransformationByOid(analysis.transformationOid);
      if (!transform?.usesMethod) continue;
      const methodOid = transform.usesMethod;
      if (!methodUsage.has(methodOid)) {
        methodUsage.set(methodOid, {
          method: loadedMethods[methodOid] || null,
          methodOid,
          transforms: [],
          endpoints: []
        });
      }
      const entry = methodUsage.get(methodOid);
      if (!entry.transforms.find(t => t.oid === transform.oid)) entry.transforms.push(transform);
      if (!entry.endpoints.find(e => e.id === ep.id)) entry.endpoints.push(ep);
    }
  }

  if (methodUsage.size === 0) {
    return '<p style="color:var(--cdisc-text-secondary);">No statistical methods configured. Select analyses in the Endpoint How step.</p>';
  }

  let html = '<div style="font-weight:600; font-size:13px; margin-bottom:12px;">9.1 General Methodology</div>';

  for (const [oid, usage] of methodUsage) {
    const m = usage.method;
    html += `
      <div class="card" style="margin-bottom:12px; padding:12px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <strong>${m?.name || oid}</strong>
          <span class="badge badge-blue">${m?.type || ''}</span>
          <span class="badge badge-secondary">${m?.class || ''}</span>
        </div>
        ${m?.description ? `<p style="font-size:12px; margin-bottom:8px;">${m.description}</p>` : ''}
        ${m?.formula ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:4px;">Formula: <code>${m.formula.default_expression || ''}</code></div>` : ''}
        <div style="font-size:11px; color:var(--cdisc-text-secondary);">
          Used by: ${usage.endpoints.map(ep => `<span class="badge badge-teal">${ep.name}</span>`).join(' ')}
        </div>
        ${m?.input_roles ? `
        <div style="margin-top:8px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; margin-bottom:4px;">Input Roles</div>
          <table class="data-table" style="font-size:11px;">
            <thead><tr><th>Role</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
            <tbody>
              ${m.input_roles.map(r => `<tr><td style="font-weight:600;">${r.name}</td><td>${r.dataType}</td><td>${r.required ? 'Yes' : 'No'}</td><td>${r.description || ''}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
        ${m?.assumptions?.length > 0 ? `
        <div style="margin-top:8px; font-size:11px;">
          <strong>Assumptions:</strong> ${m.assumptions.join('; ')}
        </div>` : ''}
      </div>`;
  }

  html += `
    <div style="font-weight:600; font-size:13px; margin-top:16px; margin-bottom:8px;">9.3 Handling of Dropouts or Missing Data</div>
    <p style="font-size:12px; color:var(--cdisc-text-secondary); font-style:italic;">Link USDM content or describe imputation methods.</p>
    <div style="font-weight:600; font-size:13px; margin-top:16px; margin-bottom:8px;">9.5 Multiple Comparisons/Multiplicity</div>
    <p style="font-size:12px; color:var(--cdisc-text-secondary); font-style:italic;">Link USDM content describing multiplicity adjustments.</p>
  `;

  html += `<div style="margin-top:8px;"><button class="btn btn-sm btn-secondary esap-edit-btn" data-step="4">Edit in Endpoint How &rarr;</button></div>`;
  return html;
}

// ===== Section 10: Statistical Analysis =====

function renderStatAnalysisSection(selectedEps, study) {
  const lib = appState.transformationLibrary;

  const groups = [
    { label: '10.5 Analysis of Primary Endpoint(s)', filter: ep => ep.level.includes('Primary') },
    { label: '10.6 Analysis of Secondary Endpoint(s)', filter: ep => ep.level.includes('Secondary') },
    { label: '10.7 Analysis of Exploratory Endpoint(s)', filter: ep => ep.level.includes('Exploratory') },
    { label: '10.8 Analysis of Safety Endpoint(s)', filter: ep => ep.level.includes('Safety') }
  ];

  let html = '';

  for (const group of groups) {
    const eps = selectedEps.filter(group.filter);
    if (eps.length === 0) continue;

    html += `<div style="margin-bottom:20px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:12px;">${group.label}</div>
      ${eps.map(ep => renderStatAnalysisCard(ep, study, lib)).join('')}
    </div>`;
  }

  if (!html) {
    html = '<p style="color:var(--cdisc-text-secondary);">No analyses configured. Use the Endpoint How step to add analyses.</p>';
  }

  html += `<div style="margin-top:8px; display:flex; gap:8px;">
    <button class="btn btn-sm btn-secondary esap-edit-btn" data-step="4">Edit in Endpoint How &rarr;</button>
    <button class="btn btn-sm btn-secondary esap-edit-btn" data-step="6">Edit Derivation Pipeline &rarr;</button>
  </div>`;
  return html;
}

function renderStatAnalysisCard(ep, study, lib) {
  const spec = appState.endpointSpecs?.[ep.id] || {};
  const analyses = spec.selectedAnalyses || [];
  const formalized = buildFormalizedDescription(ep, spec, study);
  const derivChain = spec.derivationChain || [];

  // Derivation chain visualization
  let derivHtml = '';
  if (derivChain.length > 0) {
    const derivations = lib?.derivationTransformations || [];
    derivHtml = `<div style="margin-top:8px;">
      <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; margin-bottom:4px;">Derivation Chain</div>
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:4px;">
        ${derivChain.map(entry => {
          const d = derivations.find(x => x.oid === entry.derivationOid);
          return d ? `<span class="badge badge-teal">${d.name}</span><span style="color:var(--cdisc-text-secondary);">&#9654;</span>` : '';
        }).join('')}
      </div>
    </div>`;
  }

  // Per-analysis detail
  const analysisHtml = analyses.map(analysis => {
    const transform = getTransformationByOid(analysis.transformationOid);
    if (!transform) return '';

    const method = appState.methodsCache?.[transform.usesMethod] || null;
    const customBindings = analysis.customInputBindings || [];
    const outputSlots = getOutputMapping(transform, appState.acModel, method, customBindings, analysis.activeInteractions || []);

    // Temporarily set selectedTransformation so renderFormulaExpression can resolve named slices
    const prevTransform = appState.selectedTransformation;
    appState.selectedTransformation = transform;
    const formulaHtml = method?.formula ? renderFormulaExpression(customBindings, method, analysis.activeInteractions || []) : '';
    appState.selectedTransformation = prevTransform;

    const notationLabel = method?.formula?.notation === 'wilkinson_rogers' ? 'Wilkinson-Rogers'
      : method?.formula?.notation === 'survival' ? 'Survival'
      : method?.formula?.notation === 'assignment' ? 'Assignment'
      : '';

    return `
      <div style="margin-top:8px; padding:8px 12px; border:1px solid var(--cdisc-border); border-radius:var(--radius);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <strong style="font-size:12px;">${transform.name}</strong>
          <span class="badge badge-blue">${transform.usesMethod}</span>
        </div>
        ${formulaHtml ? `
        <div style="margin-bottom:8px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Model Expression${notationLabel ? ` <span style="font-weight:400; text-transform:none; letter-spacing:0;">(${notationLabel})</span>` : ''}</div>
          <div class="formula-display" style="font-family:'SF Mono','Fira Code','Consolas',monospace; font-size:12px; background:var(--cdisc-background); padding:8px 12px; border-radius:var(--radius); border-left:3px solid var(--cdisc-primary); line-height:1.6;">${formulaHtml}</div>
        </div>` : ''}
        ${outputSlots.length > 0 ? `
        <div style="margin-top:8px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; margin-bottom:4px;">Outputs</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${outputSlots.map(slot => `
              <div style="padding:4px 8px; border:1px solid var(--cdisc-border); border-radius:var(--radius); font-size:11px;">
                <strong>${slot.patternName}</strong>
                <div style="font-size:9px; color:var(--cdisc-text-secondary);">${slot.constituents.slice(0, 3).join(', ')}</div>
                ${slot.dimensions.length > 0 ? `<div style="font-size:9px; color:var(--cdisc-primary);">Indexed by: ${slot.dimensions.map(id => {
                  if (id.includes(':')) return id.split(':').map(p => displayConcept(p)).join(':');
                  return displayConcept(id);
                }).join(', ')}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>`;
  }).join('');

  return `
    <details style="margin-bottom:12px; border:1px solid var(--cdisc-border); border-radius:var(--radius); overflow:hidden;">
      <summary style="padding:10px 14px; cursor:pointer; background:var(--cdisc-background); font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px;">
        ${ep.name}
        <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}">${ep.level}</span>
        ${analyses.length > 0 ? `<span class="badge badge-blue">${analyses.length} analysis${analyses.length > 1 ? 'es' : ''}</span>` : '<span class="badge" style="background:var(--cdisc-background); color:var(--cdisc-text-secondary);">not configured</span>'}
      </summary>
      <div style="padding:12px 14px;">
        ${formalized ? `<div style="font-size:12px; margin-bottom:8px; padding:8px 12px; background:var(--cdisc-primary-light); border-left:3px solid var(--cdisc-primary); border-radius:var(--radius);">${formalized}</div>` : ''}
        ${derivHtml}
        ${analysisHtml || '<p style="color:var(--cdisc-text-secondary); font-size:12px;">No analysis configured for this endpoint.</p>'}
      </div>
    </details>`;
}

// ===== ADaM Datasets Panel =====

function renderDatasetsPanel(selectedEps, study) {
  const lib = appState.transformationLibrary;
  const derivations = lib?.derivationTransformations || [];

  // Collect all transformation instances per endpoint (both derivations and analyses)
  const allInstances = [];

  for (const ep of selectedEps) {
    const spec = appState.endpointSpecs?.[ep.id] || {};
    const currentDataset = spec.targetDataset || '';

    // Derivation chain entries
    for (const entry of spec.derivationChain || []) {
      const d = derivations.find(x => x.oid === entry.derivationOid);
      if (d) {
        allInstances.push({
          epId: ep.id,
          epName: ep.name,
          epLevel: ep.level,
          oid: d.oid,
          name: d.name,
          type: 'derivation',
          method: d.usesMethod || '',
          dataset: currentDataset
        });
      }
    }

    // Analysis entries
    for (const analysis of spec.selectedAnalyses || []) {
      const t = (lib?.analysisTransformations || []).find(x => x.oid === analysis.transformationOid);
      if (t) {
        allInstances.push({
          epId: ep.id,
          epName: ep.name,
          epLevel: ep.level,
          oid: t.oid,
          name: t.name,
          type: 'analysis',
          method: t.usesMethod || '',
          category: t.acCategory || '',
          dataset: currentDataset
        });
      }
    }
  }

  if (allInstances.length === 0) {
    return `<div class="card" style="padding:24px; text-align:center;">
      <p style="color:var(--cdisc-text-secondary);">No transformations configured. Configure endpoints and analyses first.</p>
    </div>`;
  }

  // Group by dataset
  const byDataset = {};
  const unassigned = [];
  for (const inst of allInstances) {
    if (inst.dataset) {
      if (!byDataset[inst.dataset]) byDataset[inst.dataset] = [];
      byDataset[inst.dataset].push(inst);
    } else {
      unassigned.push(inst);
    }
  }

  // Common ADaM datasets for suggestions
  const commonDatasets = ['ADSL', 'ADQS', 'ADVS', 'ADLB', 'ADAE', 'ADTTE', 'ADEG', 'ADCM', 'ADMH', 'ADEFF'];

  let html = `
    <div class="card" style="padding:16px; margin-bottom:16px;">
      <div style="font-weight:700; font-size:14px; margin-bottom:4px;">ADaM Dataset Assignment</div>
      <p style="font-size:12px; color:var(--cdisc-text-secondary); margin-bottom:16px;">
        Assign each endpoint's configured transformation instances to an ADaM dataset. The template is a generic recipe &mdash; the dataset is an implementation choice made per study instance.
      </p>

      <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:16px;">
        <span style="font-size:11px; color:var(--cdisc-text-secondary); margin-right:4px;">Common datasets:</span>
        ${commonDatasets.map(ds => {
          const count = byDataset[ds]?.length || 0;
          return `<span class="badge ${count > 0 ? 'badge-blue' : 'badge-secondary'}" style="font-size:10px;">${ds}${count > 0 ? ` (${count})` : ''}</span>`;
        }).join('')}
      </div>`;

  // Unassigned section
  if (unassigned.length > 0) {
    html += `
      <div style="margin-bottom:20px; padding:12px; border:2px dashed var(--cdisc-border); border-radius:var(--radius);">
        <div style="font-weight:600; font-size:13px; margin-bottom:8px; color:var(--cdisc-warning, #d97706);">Unassigned (${unassigned.length})</div>
        <table class="data-table" style="font-size:12px;">
          <thead><tr><th>Endpoint (Instance)</th><th>Template</th><th>Type</th><th>Method</th><th style="width:100px;">ADaM Dataset</th></tr></thead>
          <tbody>
            ${unassigned.map(inst => `
              <tr>
                <td><span class="badge ${inst.epLevel.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="font-size:9px;">${inst.epLevel}</span> ${inst.epName}</td>
                <td style="font-weight:600;">${inst.name}</td>
                <td><span class="badge ${inst.type === 'analysis' ? 'badge-blue' : 'badge-teal'}" style="font-size:9px;">${inst.type}</span></td>
                <td>${inst.method}</td>
                <td><input class="config-input dataset-assign-input" data-ep-id="${inst.epId}" value="" placeholder="e.g., ADQS" style="width:80px; font-size:11px; padding:2px 6px;"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // Assigned datasets
  for (const [dataset, instances] of Object.entries(byDataset).sort(([a], [b]) => a.localeCompare(b))) {
    html += `
      <div style="margin-bottom:16px; padding:12px; border:1px solid var(--cdisc-border); border-radius:var(--radius);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <strong style="font-size:14px;">${dataset}</strong>
          <span class="badge badge-blue">${instances.length} transformation${instances.length > 1 ? 's' : ''}</span>
        </div>
        <table class="data-table" style="font-size:12px;">
          <thead><tr><th>Endpoint (Instance)</th><th>Template</th><th>Type</th><th>Method</th><th style="width:100px;">ADaM Dataset</th></tr></thead>
          <tbody>
            ${instances.map(inst => `
              <tr>
                <td><span class="badge ${inst.epLevel.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="font-size:9px;">${inst.epLevel}</span> ${inst.epName}</td>
                <td style="font-weight:600;">${inst.name}</td>
                <td><span class="badge ${inst.type === 'analysis' ? 'badge-blue' : 'badge-teal'}" style="font-size:9px;">${inst.type}</span></td>
                <td>${inst.method}</td>
                <td><input class="config-input dataset-assign-input" data-ep-id="${inst.epId}" value="${inst.dataset}" style="width:80px; font-size:11px; padding:2px 6px;"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  html += '</div>';
  return html;
}

// ===== eSAP Section Wrapper =====

function renderEsapSection(sectionKey, title, bodyHtml, startOpen = true) {
  const linkedCount = (appState.esapLinkedNarratives[sectionKey] || []).length;
  const btnLabel = linkedCount > 0 ? `Linked (${linkedCount})` : 'Link USDM Content';
  const btnClass = linkedCount > 0
    ? 'btn btn-sm btn-primary btn-link-usdm'
    : 'btn btn-sm btn-secondary btn-link-usdm';

  return `
    <div class="collapsible ${startOpen ? 'open' : ''}">
      <div class="collapsible-header" style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="collapsible-arrow">&#9654;</span>
          ${title}
        </div>
        <button class="${btnClass}" data-section="${sectionKey}"
                style="font-size:11px; padding:2px 8px; white-space:nowrap;">
          ${btnLabel}
        </button>
      </div>
      <div class="collapsible-body">
        ${bodyHtml}
        ${renderLinkedNarratives(sectionKey)}
      </div>
    </div>
  `;
}

function renderLinkedNarratives(sectionKey) {
  const linkedIds = appState.esapLinkedNarratives[sectionKey] || [];
  if (linkedIds.length === 0) return '';

  const study = appState.selectedStudy;
  const index = appState.usdmIndex;
  if (!study || !index) return '';

  const blocks = linkedIds.map(nciId => {
    const nc = study.narrativeContent.find(n => n.id === nciId);
    if (!nc) return '';
    const resolved = resolveNarrative(nc, index);
    return `
      <div style="border-left:3px solid var(--cdisc-accent6); padding:8px 12px; margin-bottom:8px; background:var(--cdisc-primary-light); border-radius:0 var(--radius) var(--radius) 0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
          <span style="font-size:11px; font-weight:600; color:var(--cdisc-accent6);">
            Linked: ${nc.name} (${nc.id})
          </span>
          <button class="btn-remove-linked" data-section="${sectionKey}" data-nci-id="${nciId}"
                  style="background:none; border:none; color:var(--cdisc-text-secondary); cursor:pointer; font-size:14px; padding:0 4px;" title="Remove">
            &times;
          </button>
        </div>
        <div style="font-size:12px; line-height:1.6;">${resolved}</div>
      </div>
    `;
  });

  return `
    <div style="margin-top:16px;">
      <div style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">
        Linked USDM Content
      </div>
      ${blocks.join('')}
    </div>
  `;
}

// ===== Narrative Picker (Master-Detail) =====

function showNarrativePicker(container, sectionKey) {
  container.querySelector('.narrative-picker-overlay')?.remove();

  const study = appState.selectedStudy;
  const index = appState.usdmIndex;
  if (!study || !index) return;

  const linked = new Set(appState.esapLinkedNarratives[sectionKey] || []);
  const narratives = study.narrativeContent.filter(nc => nc.text && nc.text.length > 30);
  const nciToSection = buildNciToSectionMap(study);
  const { relevant, groups, other } = groupNarrativesForPicker(narratives, nciToSection, sectionKey);
  const sectionLabel = ESAP_SECTION_LABELS[sectionKey] || sectionKey;

  const resolvedCache = new Map();
  for (const nc of narratives) {
    resolvedCache.set(nc.id, resolveNarrative(nc, index));
  }

  const plainTextCache = new Map();
  for (const nc of narratives) {
    const tmp = document.createElement('div');
    tmp.innerHTML = resolvedCache.get(nc.id);
    plainTextCache.set(nc.id, (tmp.textContent || '').toLowerCase());
  }

  const overlay = document.createElement('div');
  overlay.className = 'narrative-picker-overlay';

  overlay.innerHTML = `
    <div class="narrative-picker-modal">
      <div class="narrative-picker-header">
        <div>
          <h3>Link USDM Narrative &mdash; ${sectionLabel}</h3>
          <div class="picker-subtitle">Select items to link, click to preview</div>
        </div>
        <button class="picker-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cdisc-text-secondary);padding:4px;">&times;</button>
      </div>
      <div class="narrative-picker-search">
        <input type="text" placeholder="Search by section title or content..." class="picker-search-input">
      </div>
      <div class="narrative-picker-panels">
        <div class="narrative-picker-nav" id="picker-nav"></div>
        <div class="narrative-picker-viewer" id="picker-viewer">
          <div class="narrative-picker-viewer-empty">Click an item to preview its content</div>
        </div>
      </div>
      <div class="narrative-picker-footer">
        <button class="btn btn-secondary picker-cancel" style="font-size:12px;">Cancel</button>
        <button class="btn btn-primary picker-apply" style="font-size:12px;">Apply</button>
      </div>
    </div>
  `;

  container.appendChild(overlay);

  const nav = overlay.querySelector('#picker-nav');
  const viewer = overlay.querySelector('#picker-viewer');
  const applyBtn = overlay.querySelector('.picker-apply');
  const searchInput = overlay.querySelector('.picker-search-input');
  let activeItemId = null;

  const checkedIds = new Set(linked);

  function updateApplyBtn() {
    const count = checkedIds.size;
    applyBtn.textContent = count > 0 ? `Apply (${count} selected)` : 'Apply';
  }

  function renderNavItem(item, isActive) {
    const isChecked = checkedIds.has(item.id);
    return `
      <div class="narrative-picker-item ${isActive ? 'active' : ''}" data-nci-id="${item.id}">
        <input type="checkbox" ${isChecked ? 'checked' : ''} data-nci-id="${item.id}">
        <div class="item-label">
          ${item.sectionNumber ? `<span class="item-section-num">${item.sectionNumber}</span>` : ''}
          <span class="item-title">${item.sectionTitle || item.name}</span>
        </div>
      </div>
    `;
  }

  function renderGroup(key, label, items, expanded) {
    if (items.length === 0) return '';
    return `
      <div class="narrative-picker-group ${expanded ? 'expanded' : ''}" data-group="${key}">
        <div class="narrative-picker-group-header">
          <div>
            <span class="group-arrow">&#9654;</span>
            ${label}
            <span class="group-count">(${items.length})</span>
          </div>
        </div>
        <div class="narrative-picker-group-items">
          ${items.map(item => renderNavItem(item, item.id === activeItemId)).join('')}
        </div>
      </div>
    `;
  }

  function renderNav(filter) {
    const filterLower = (filter || '').toLowerCase().trim();

    function matchesFilter(item) {
      if (!filterLower) return true;
      const titleMatch = (item.sectionTitle || item.name || '').toLowerCase().includes(filterLower);
      const numMatch = (item.sectionNumber || '').toLowerCase().includes(filterLower);
      const textMatch = (plainTextCache.get(item.id) || '').includes(filterLower);
      return titleMatch || numMatch || textMatch;
    }

    const filteredRelevant = relevant.filter(matchesFilter);
    const filteredOther = other.filter(matchesFilter);

    let html = '';
    html += renderGroup('relevant', `Relevant to ${sectionLabel}`, filteredRelevant, true);

    for (const [key, group] of Object.entries(groups)) {
      const filtered = group.items.filter(matchesFilter);
      html += renderGroup(key, group.label, filtered, false);
    }

    html += renderGroup('other', 'Other', filteredOther, false);

    nav.innerHTML = html;

    nav.querySelectorAll('.narrative-picker-group-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('expanded');
      });
    });

    nav.querySelectorAll('.narrative-picker-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        showPreview(el.dataset.nciId);
      });
    });

    nav.querySelectorAll('.narrative-picker-item input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const nciId = cb.dataset.nciId;
        if (cb.checked) checkedIds.add(nciId);
        else checkedIds.delete(nciId);
        updateApplyBtn();
      });
    });
  }

  function showPreview(nciId) {
    activeItemId = nciId;
    const nc = narratives.find(n => n.id === nciId);
    if (!nc) return;

    const sec = nciToSection.get(nc.id);
    const sectionNum = sec ? sec.sectionNumber.replace(/\.\s*$/, '') : '';
    const sectionTitle = sec ? sec.sectionTitle : nc.name;
    const resolved = resolvedCache.get(nc.id) || '';

    viewer.innerHTML = `
      <div class="narrative-picker-viewer-header">${sectionNum ? sectionNum + '. ' : ''}${sectionTitle}</div>
      <div class="narrative-picker-viewer-subtitle">${nc.name} (${nc.id})</div>
      <div class="narrative-content">${resolved}</div>
    `;

    nav.querySelectorAll('.narrative-picker-item').forEach(el => {
      el.classList.toggle('active', el.dataset.nciId === nciId);
    });
  }

  renderNav('');
  updateApplyBtn();

  if (relevant.length > 0) {
    showPreview(relevant[0].id);
  }

  searchInput.addEventListener('input', () => {
    renderNav(searchInput.value);
  });

  const close = () => overlay.remove();
  overlay.querySelector('.picker-close').addEventListener('click', close);
  overlay.querySelector('.picker-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  applyBtn.addEventListener('click', () => {
    appState.esapLinkedNarratives[sectionKey] = [...checkedIds];
    close();
    renderEsapBuilder(container);
  });

  searchInput.focus();
}
