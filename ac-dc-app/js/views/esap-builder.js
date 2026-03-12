import { appState, navigateTo } from '../app.js';
import { getAllEndpoints } from '../utils/usdm-parser.js';
import { resolveNarrative } from '../utils/usdm-ref-resolver.js';

// ===== Section relevance mapping =====
const ESAP_SECTION_PREFIXES = {
  studyInfo:  ['0', '1'],
  objectives: ['2'],
  studyDesign: ['3.1', '3.2', '3.3', '3.5', '3.6', '3.7', '3.8', '3.9', '3.10', '3.11'],
  population: ['3.4'],
  methods:    ['4']
};

const ESAP_SECTION_LABELS = {
  studyInfo:   'Study Information',
  objectives:  'Objectives',
  studyDesign: 'Study Design',
  population:  'Study Population',
  methods:     'Statistical Methods'
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

  // Init groups for all eSAP sections except the current one
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

    const sNum = sec.sectionNumber.replace(/\.\s*$/, ''); // strip trailing dots
    const item = { ...nc, sectionNumber: sNum, sectionTitle: sec.sectionTitle };

    // Check if relevant to the current eSAP section
    if (prefixes.some(p => sNum === p || sNum.startsWith(p + '.') || sNum.startsWith(p + ' '))) {
      relevant.push(item);
      continue;
    }

    // Place in the correct other group
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

export function renderEsapBuilder(container) {
  const study = appState.selectedStudy;
  if (!study) { navigateTo(1); return; }

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));

  if (selectedEps.length === 0) { navigateTo(2); return; }

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

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:22px; font-weight:700;">Electronic Statistical Analysis Plan</h2>
        <p style="color:var(--cdisc-gray); font-size:13px; margin-top:4px;">${study.name}</p>
      </div>
      <button class="btn btn-secondary" id="btn-back-overview">&larr; Back to Overview</button>
    </div>

    <div class="esap-doc">
      <!-- Section 1: Study Information -->
      ${renderEsapSection('studyInfo', '1. Study Information', renderStudyInfoSection(study))}

      <!-- Section 2: Study Design -->
      ${renderEsapSection('studyDesign', '2. Study Design', renderStudyDesignSection(study))}

      <!-- Section 3: Study Population -->
      ${renderEsapSection('population', '3. Study Population', renderPopulationSection(study))}

      <!-- Section 4: Objectives & Endpoints -->
      ${renderEsapSection('objectives', '4. Objectives & Selected Endpoints', `
        ${Object.entries(byObjective).map(([objId, obj]) => `
          <div style="margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <span class="badge ${obj.objectiveLevel.includes('Primary') ? 'badge-primary' : 'badge-secondary'}">${obj.objectiveLevel}</span>
              <strong>${obj.objectiveName}</strong>
            </div>
            <p style="font-size:12px; color:var(--cdisc-text-secondary); margin-bottom:12px; line-height:1.5;">${obj.objectiveText || ''}</p>
            ${obj.endpoints.map(ep => renderEndpointCard(ep)).join('')}
          </div>
        `).join('')}
      `)}

      <!-- Section 5: Statistical Methods -->
      ${renderEsapSection('methods', '5. Statistical Methods', `
        <p style="font-size:12px; color:var(--cdisc-gray); margin-bottom:16px;">
          Click on an endpoint below to configure its analysis using SmartPhrases and transformation templates.
        </p>
        ${selectedEps.map(ep => renderAnalysisSlot(ep)).join('')}
      `)}
    </div>
  `;

  // Collapsible toggle — only toggle on the text area, not the link button
  container.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-link-usdm')) return;
      header.parentElement.classList.toggle('open');
    });
  });

  // Back button
  container.querySelector('#btn-back-overview').addEventListener('click', () => navigateTo(2));

  // Link USDM Content buttons
  container.querySelectorAll('.btn-link-usdm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sectionKey = btn.dataset.section;
      showNarrativePicker(container, sectionKey);
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

  // Configure analysis buttons
  container.querySelectorAll('.btn-configure-analysis').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.currentEndpointId = btn.dataset.endpointId;
      appState.composedPhrases = [];
      appState.matchedTransformations = [];
      appState.selectedTransformation = null;
      navigateTo(4);
    });
  });

  // Edit analysis buttons
  container.querySelectorAll('.btn-edit-analysis').forEach(btn => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.endpointId;
      const existing = appState.esapAnalyses[epId];
      appState.currentEndpointId = epId;
      appState.composedPhrases = existing?.phrases || [];
      appState.matchedTransformations = existing?.matchedTransformations || [];
      appState.selectedTransformation = existing?.transformation || null;
      navigateTo(4);
    });
  });
}

function renderStudyInfoSection(study) {
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

function renderStudyDesignSection(study) {
  return `
    <table class="data-table" style="margin-bottom:16px;">
      <tbody>
        <tr><td style="width:180px; font-weight:600;">Study Type</td><td>${study.studyType || 'N/A'}</td></tr>
        <tr><td style="font-weight:600;">Phase</td><td>${study.phase}</td></tr>
        <tr><td style="font-weight:600;">Study Model</td><td>${study.studyModel || 'N/A'}</td></tr>
        <tr><td style="font-weight:600;">Blinding</td><td>${study.blindingSchema || 'N/A'}</td></tr>
        <tr><td style="font-weight:600;">Intent</td><td>${(study.intentTypes || []).join(', ') || 'N/A'}</td></tr>
      </tbody>
    </table>
    <div style="font-weight:600; font-size:13px; margin-bottom:8px;">Treatment Arms (${study.arms.length})</div>
    <table class="data-table">
      <thead>
        <tr><th>Name</th><th>Type</th><th>Description</th></tr>
      </thead>
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
  `;
}

function renderPopulationSection(study) {
  const pop = study.populations[0];
  if (!pop) return '<p style="color:var(--cdisc-gray);">No population data available.</p>';

  return `
    <table class="data-table">
      <tbody>
        <tr><td style="width:180px; font-weight:600;">Population</td><td>${pop.description || pop.name}</td></tr>
        <tr><td style="font-weight:600;">Planned Enrollment</td><td>${pop.plannedEnrollment || 'N/A'}</td></tr>
        <tr><td style="font-weight:600;">Planned Completion</td><td>${pop.plannedCompletion || 'N/A'}</td></tr>
        <tr><td style="font-weight:600;">Sex</td><td>${pop.sex || 'N/A'}</td></tr>
        <tr><td style="font-weight:600;">Healthy Subjects</td><td>${pop.includesHealthySubjects ? 'Yes' : 'No'}</td></tr>
      </tbody>
    </table>
    ${study.analysisPopulations.length > 0 ? `
      <div style="margin-top:16px;">
        <div style="font-weight:600; font-size:13px; margin-bottom:8px;">Analysis Populations</div>
        ${study.analysisPopulations.map(ap => `
          <div style="padding:8px 0; border-bottom:1px solid var(--cdisc-border);">
            <strong>${ap.name}</strong>: ${ap.text || ap.description || ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function renderEndpointCard(ep) {
  return `
    <div style="padding:8px 12px; margin-bottom:6px; background:var(--cdisc-light-gray); border-radius:var(--radius); font-size:12px;">
      <strong>${ep.name}</strong>
      <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:6px;">${ep.level}</span>
      <div style="color:var(--cdisc-text-secondary); margin-top:4px; line-height:1.4;">${ep.text || ''}</div>
    </div>
  `;
}

function renderAnalysisSlot(ep) {
  const analysis = appState.esapAnalyses[ep.id];

  if (analysis) {
    return `
      <div class="analysis-configured" style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <strong style="font-size:13px;">${ep.name}: ${ep.text || ''}</strong>
          <button class="btn btn-sm btn-secondary btn-edit-analysis" data-endpoint-id="${ep.id}">Edit</button>
        </div>
        <div class="analysis-phrase">${analysis.resolvedSentence || ''}</div>
        <div class="analysis-method">
          Method: ${analysis.transformation?.usesMethod || 'Configured'}
          ${analysis.transformation?.name ? ` (${analysis.transformation.name})` : ''}
        </div>
      </div>
    `;
  }

  return `
    <div class="esap-placeholder" style="margin-bottom:12px;">
      <button class="btn btn-primary btn-sm btn-configure-analysis" data-endpoint-id="${ep.id}">
        Configure Analysis for ${ep.name}
      </button>
      <div style="margin-top:6px; font-size:12px;">${ep.text || ''}</div>
    </div>
  `;
}

// ===== eSAP Section Wrapper with Link USDM Content button =====

function renderEsapSection(sectionKey, title, bodyHtml) {
  const linkedCount = (appState.esapLinkedNarratives[sectionKey] || []).length;
  const btnLabel = linkedCount > 0 ? `Linked (${linkedCount})` : 'Link USDM Content';
  const btnClass = linkedCount > 0
    ? 'btn btn-sm btn-primary btn-link-usdm'
    : 'btn btn-sm btn-secondary btn-link-usdm';

  return `
    <div class="collapsible open">
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
      <div style="border-left:3px solid var(--cdisc-accent); padding:8px 12px; margin-bottom:8px; background:var(--cdisc-light-blue); border-radius:0 var(--radius) var(--radius) 0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
          <span style="font-size:11px; font-weight:600; color:var(--cdisc-accent);">
            Linked: ${nc.name} (${nc.id})
          </span>
          <button class="btn-remove-linked" data-section="${sectionKey}" data-nci-id="${nciId}"
                  style="background:none; border:none; color:var(--cdisc-gray); cursor:pointer; font-size:14px; padding:0 4px;" title="Remove">
            &times;
          </button>
        </div>
        <div style="font-size:12px; line-height:1.6;">${resolved}</div>
      </div>
    `;
  });

  return `
    <div style="margin-top:16px;">
      <div style="font-size:11px; font-weight:600; color:var(--cdisc-gray); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">
        Linked USDM Content
      </div>
      ${blocks.join('')}
    </div>
  `;
}

// ===== Narrative Picker (Master-Detail) =====

function showNarrativePicker(container, sectionKey) {
  // Remove any existing picker
  container.querySelector('.narrative-picker-overlay')?.remove();

  const study = appState.selectedStudy;
  const index = appState.usdmIndex;
  if (!study || !index) return;

  const linked = new Set(appState.esapLinkedNarratives[sectionKey] || []);
  const narratives = study.narrativeContent.filter(nc => nc.text && nc.text.length > 30);
  const nciToSection = buildNciToSectionMap(study);
  const { relevant, groups, other } = groupNarrativesForPicker(narratives, nciToSection, sectionKey);
  const sectionLabel = ESAP_SECTION_LABELS[sectionKey] || sectionKey;

  // Resolve all narratives once for search and preview
  const resolvedCache = new Map();
  for (const nc of narratives) {
    resolvedCache.set(nc.id, resolveNarrative(nc, index));
  }

  // Plain-text cache for search filtering
  const plainTextCache = new Map();
  for (const nc of narratives) {
    const tmp = document.createElement('div');
    tmp.innerHTML = resolvedCache.get(nc.id);
    plainTextCache.set(nc.id, (tmp.textContent || '').toLowerCase());
  }

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'narrative-picker-overlay';

  overlay.innerHTML = `
    <div class="narrative-picker-modal">
      <div class="narrative-picker-header">
        <div>
          <h3>Link USDM Narrative &mdash; ${sectionLabel}</h3>
          <div class="picker-subtitle">Select items to link, click to preview</div>
        </div>
        <button class="picker-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cdisc-gray);padding:4px;">&times;</button>
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

  // Track checked state locally
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

    // Relevant group — always expanded
    html += renderGroup('relevant', `Relevant to ${sectionLabel}`, filteredRelevant, true);

    // Other eSAP section groups
    for (const [key, group] of Object.entries(groups)) {
      const filtered = group.items.filter(matchesFilter);
      html += renderGroup(key, group.label, filtered, false);
    }

    // "Other" group
    html += renderGroup('other', 'Other', filteredOther, false);

    nav.innerHTML = html;

    // Wire up group toggle
    nav.querySelectorAll('.narrative-picker-group-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('expanded');
      });
    });

    // Wire up item click (preview)
    nav.querySelectorAll('.narrative-picker-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return; // let checkbox handle itself
        const nciId = el.dataset.nciId;
        showPreview(nciId);
      });
    });

    // Wire up checkboxes
    nav.querySelectorAll('.narrative-picker-item input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const nciId = cb.dataset.nciId;
        if (cb.checked) {
          checkedIds.add(nciId);
        } else {
          checkedIds.delete(nciId);
        }
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

    // Update active state in nav
    nav.querySelectorAll('.narrative-picker-item').forEach(el => {
      el.classList.toggle('active', el.dataset.nciId === nciId);
    });
  }

  // Initial render
  renderNav('');
  updateApplyBtn();

  // Auto-focus first relevant item
  if (relevant.length > 0) {
    showPreview(relevant[0].id);
  }

  // Search handler
  searchInput.addEventListener('input', () => {
    renderNav(searchInput.value);
  });

  // Close handlers
  const close = () => overlay.remove();
  overlay.querySelector('.picker-close').addEventListener('click', close);
  overlay.querySelector('.picker-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Apply handler
  applyBtn.addEventListener('click', () => {
    appState.esapLinkedNarratives[sectionKey] = [...checkedIds];
    close();
    renderEsapBuilder(container);
  });

  // Focus search
  searchInput.focus();
}
