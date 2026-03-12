import { appState, navigateTo } from '../app.js';
import { getAllEndpoints, getVisitLabels, getPopulationNames, getArmNames } from '../utils/usdm-parser.js';
import {
  groupPhrasesByRole, getRoleLabel, resolvePhrase,
  composeFullSentence, findMatchingTransformations
} from '../utils/phrase-engine.js';

let draggedOid = null;

export function renderSmartPhraseBuilder(container) {
  const study = appState.selectedStudy;
  const lib = appState.transformationLibrary;
  if (!study || !lib) { navigateTo(1); return; }

  const currentEp = getAllEndpoints(study).find(ep => ep.id === appState.currentEndpointId);
  if (!currentEp) { navigateTo(3); return; }

  const groupedPhrases = groupPhrasesByRole(lib.smartPhrases);

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">SmartPhrase Builder</h2>
        <p style="color:var(--cdisc-gray); font-size:13px; margin-top:4px;">
          Composing analysis for <strong>${currentEp.name}</strong>: ${currentEp.text || ''}
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-esap">&larr; Back to eSAP</button>
        <button class="btn btn-primary" id="btn-proceed-transform" disabled>
          Configure Transformation &rarr;
        </button>
      </div>
    </div>

    <div class="sp-layout">
      <!-- Left: Phrase Palette -->
      <div class="sp-palette card">
        <div class="card-title" style="margin-bottom:16px; font-size:14px;">SmartPhrases</div>
        <p style="font-size:11px; color:var(--cdisc-gray); margin-bottom:16px;">Drag phrases to the composition area to build an analysis description.</p>
        ${Object.entries(groupedPhrases).map(([role, phrases]) => `
          <div class="sp-palette-group">
            <div class="sp-palette-group-title">${getRoleLabel(role)}</div>
            <div style="display:flex; flex-wrap:wrap;">
              ${phrases.map(sp => `
                <div class="phrase-chip" data-role="${sp.role}" data-oid="${sp.oid}" draggable="true">
                  ${sp.name}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Right: Composition Area -->
      <div>
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title" style="margin-bottom:12px; font-size:14px;">Composition Area</div>
          <div class="drop-zone" id="drop-zone">
            ${appState.composedPhrases.length === 0
              ? '<span class="drop-zone-placeholder">Drop SmartPhrases here to compose your analysis description...</span>'
              : ''
            }
          </div>
        </div>

        <!-- Configuration Panel -->
        <div class="card" id="config-panel" style="margin-bottom:16px; ${appState.composedPhrases.length === 0 ? 'display:none;' : ''}">
          <div class="card-title" style="margin-bottom:12px; font-size:14px;">Configure Parameters</div>
          <div id="config-fields"></div>
        </div>

        <!-- Live Preview -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title" style="margin-bottom:12px; font-size:14px;">Live Preview</div>
          <div class="sentence-preview" id="sentence-preview">
            <em style="color:var(--cdisc-gray);">Your composed sentence will appear here...</em>
          </div>
        </div>

        <!-- Matching Transformations -->
        <div class="card" id="match-panel" style="display:none;">
          <div class="card-title" style="margin-bottom:12px; font-size:14px;">Matching Transformations</div>
          <div id="match-list"></div>
        </div>
      </div>
    </div>
  `;

  // Initialize existing phrases in the drop zone
  renderDropZoneContents();
  renderConfigFields();
  updatePreview();

  // Drag from palette
  container.querySelectorAll('.sp-palette .phrase-chip').forEach(chip => {
    chip.addEventListener('dragstart', (e) => {
      draggedOid = chip.dataset.oid;
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/plain', chip.dataset.oid);
      e.dataTransfer.effectAllowed = 'copy';
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      draggedOid = null;
    });
    // Click to add
    chip.addEventListener('click', () => {
      addPhrase(chip.dataset.oid);
    });
  });

  // Drop zone
  const dropZone = container.querySelector('#drop-zone');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const oid = e.dataTransfer.getData('text/plain');
    if (oid) addPhrase(oid);
  });

  // Navigation
  container.querySelector('#btn-back-esap').addEventListener('click', () => navigateTo(3));
  container.querySelector('#btn-proceed-transform').addEventListener('click', () => {
    if (appState.matchedTransformations.length > 0) {
      if (!appState.selectedTransformation) {
        appState.selectedTransformation = appState.matchedTransformations[0];
      }
      navigateTo(5);
    }
  });
}

function addPhrase(oid) {
  const lib = appState.transformationLibrary;
  const sp = lib.smartPhrases.find(p => p.oid === oid);
  if (!sp) return;

  // Create default config
  const config = {};
  for (const key of sp.configurations) {
    config[key] = getDefaultConfigValue(key);
  }

  appState.composedPhrases.push({ oid, config });

  renderDropZoneContents();
  renderConfigFields();
  updatePreview();
  findMatches();
}

function removePhrase(index) {
  appState.composedPhrases.splice(index, 1);
  renderDropZoneContents();
  renderConfigFields();
  updatePreview();
  findMatches();
}

function getDefaultConfigValue(key) {
  const study = appState.selectedStudy;
  const currentEp = getAllEndpoints(study).find(ep => ep.id === appState.currentEndpointId);

  switch (key) {
    case 'parameter': return currentEp?.text || currentEp?.name || '';
    case 'visit': return 'Week 24';
    case 'population': return '';
    case 'treatment': return study.arms.map(a => a.name).join(' vs ');
    case 'conf_level': return '95';
    case 'imputation': return 'LOCF';
    case 'event': return '';
    case 'strata': return '';
    default: return '';
  }
}

function getConfigOptions(key) {
  const study = appState.selectedStudy;
  switch (key) {
    case 'parameter': {
      const eps = getAllEndpoints(study);
      return eps.map(ep => ep.text || ep.name);
    }
    case 'visit': return getVisitLabels(study);
    case 'population': return getPopulationNames(study);
    case 'treatment': {
      const arms = getArmNames(study);
      const combos = [];
      for (let i = 0; i < arms.length; i++) {
        for (let j = i + 1; j < arms.length; j++) {
          combos.push(`${arms[i]} vs ${arms[j]}`);
        }
      }
      combos.push(arms.join(' vs '));
      return combos;
    }
    case 'conf_level': return ['90', '95', '97.5', '99'];
    case 'imputation': return ['LOCF', 'BOCF', 'WOCF', 'Mean', 'Median', 'MMRM (implicit)'];
    case 'event': return ['death', 'discontinuation', 'first AE', 'disease progression'];
    case 'strata': return ['site', 'region', 'baseline severity'];
    default: return [];
  }
}

function renderDropZoneContents() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;
  const lib = appState.transformationLibrary;

  if (appState.composedPhrases.length === 0) {
    dropZone.innerHTML = '<span class="drop-zone-placeholder">Drop SmartPhrases here to compose your analysis description...</span>';
    return;
  }

  dropZone.innerHTML = appState.composedPhrases.map((entry, i) => {
    const sp = lib.smartPhrases.find(p => p.oid === entry.oid);
    return `
      <div class="phrase-chip" data-role="${sp.role}" data-index="${i}">
        ${sp.name}
        <span class="chip-remove" data-index="${i}">&times;</span>
      </div>
    `;
  }).join('');

  // Remove handlers
  dropZone.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePhrase(parseInt(btn.dataset.index, 10));
    });
  });
}

function renderConfigFields() {
  const panel = document.getElementById('config-panel');
  const fieldsEl = document.getElementById('config-fields');
  if (!panel || !fieldsEl) return;

  const lib = appState.transformationLibrary;
  // Gather all unique config keys from composed phrases
  const configEntries = [];
  for (let i = 0; i < appState.composedPhrases.length; i++) {
    const entry = appState.composedPhrases[i];
    const sp = lib.smartPhrases.find(p => p.oid === entry.oid);
    if (!sp) continue;
    for (const key of sp.configurations) {
      configEntries.push({ phraseIndex: i, key, value: entry.config[key] || '' });
    }
  }

  if (configEntries.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = '';

  // Deduplicate by key (use first occurrence value)
  const seen = new Map();
  const unique = [];
  for (const ce of configEntries) {
    if (!seen.has(ce.key)) {
      seen.set(ce.key, []);
      unique.push(ce);
    }
    seen.get(ce.key).push(ce.phraseIndex);
  }

  fieldsEl.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px;">
      ${unique.map(ce => {
        const options = getConfigOptions(ce.key);
        const hasOptions = options.length > 0;
        return `
          <div class="config-field">
            <label class="config-label">${ce.key.replace(/_/g, ' ')}</label>
            ${hasOptions ? `
              <select class="config-select" data-key="${ce.key}">
                <option value="">-- Select --</option>
                ${options.map(opt => {
                  const val = typeof opt === 'object' ? opt.value : opt;
                  const lbl = typeof opt === 'object' ? opt.label : opt;
                  const title = typeof opt === 'object' && opt.label !== opt.value ? ` title="${lbl}"` : '';
                  return `<option value="${val}" ${val === ce.value ? 'selected' : ''}${title}>${val}</option>`;
                }).join('')}
              </select>
            ` : `
              <input class="config-input" data-key="${ce.key}" value="${ce.value}" placeholder="Enter ${ce.key}">
            `}
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Change handlers
  fieldsEl.querySelectorAll('.config-select, .config-input').forEach(el => {
    const handler = () => {
      const key = el.dataset.key;
      const value = el.value;
      // Update all phrases that have this config key
      const indices = seen.get(key) || [];
      for (const idx of indices) {
        appState.composedPhrases[idx].config[key] = value;
      }
      updatePreview();
      findMatches();
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });
}

function updatePreview() {
  const previewEl = document.getElementById('sentence-preview');
  if (!previewEl) return;

  const lib = appState.transformationLibrary;
  if (appState.composedPhrases.length === 0) {
    previewEl.innerHTML = '<em style="color:var(--cdisc-gray);">Your composed sentence will appear here...</em>';
    return;
  }

  const parts = appState.composedPhrases.map(entry => {
    const sp = lib.smartPhrases.find(p => p.oid === entry.oid);
    if (!sp) return '';
    let text = sp.phrase_template;
    for (const key of sp.configurations) {
      const val = entry.config[key];
      if (val) {
        let displayVal = val;
        if (key === 'population') {
          const popOptions = getConfigOptions('population');
          const match = popOptions.find(o => typeof o === 'object' && o.value === val);
          if (match) displayVal = match.label;
        }
        text = text.replace(`{${key}}`, `<strong>${displayVal}</strong>`);
      } else {
        text = text.replace(`{${key}}`, `<span class="placeholder">{${key}}</span>`);
      }
    }
    return text;
  });

  previewEl.innerHTML = parts.filter(Boolean).join(' ');
}

function findMatches() {
  const lib = appState.transformationLibrary;
  const oids = appState.composedPhrases.map(e => e.oid);
  const matches = findMatchingTransformations(oids, lib);
  appState.matchedTransformations = matches;

  const matchPanel = document.getElementById('match-panel');
  const matchList = document.getElementById('match-list');
  const proceedBtn = document.getElementById('btn-proceed-transform');

  if (!matchPanel || !matchList) return;

  if (matches.length === 0) {
    matchPanel.style.display = 'none';
    if (proceedBtn) proceedBtn.disabled = true;
    return;
  }

  matchPanel.style.display = '';
  if (proceedBtn) proceedBtn.disabled = false;

  matchList.innerHTML = matches.map((t, i) => `
    <div class="card" style="margin-bottom:8px; padding:14px; cursor:pointer; ${i === 0 ? 'border-left:4px solid var(--cdisc-blue);' : 'border-left:4px solid var(--cdisc-border);'}"
         data-transform-index="${i}">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-weight:600; font-size:13px;">${t.name}</div>
          <div style="font-size:12px; color:var(--cdisc-gray); margin-top:2px;">
            Method: ${t.usesMethod} | Category: ${t.acCategory || 'N/A'}
          </div>
        </div>
        <span class="badge badge-blue">${i === 0 ? 'Best Match' : `Match ${i + 1}`}</span>
      </div>
    </div>
  `).join('');

  matchList.querySelectorAll('[data-transform-index]').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.transformIndex, 10);
      appState.selectedTransformation = matches[idx];
      // Highlight selected
      matchList.querySelectorAll('[data-transform-index]').forEach(c => {
        c.style.borderLeftColor = 'var(--cdisc-border)';
      });
      card.style.borderLeftColor = 'var(--cdisc-blue)';
    });
  });

  // Auto-select first
  if (!appState.selectedTransformation) {
    appState.selectedTransformation = matches[0];
  }
}
