import { appState, navigateTo } from '../app.js';
import { getAllEndpoints, getPopulationNames, getEndpointParameterOptions } from '../utils/usdm-parser.js';
import {
  groupPhrasesByRole, getRoleLabel,
  findMatchingTransformations,
  deriveImplicitPhraseOids, getEndpointContextRoles
} from '../utils/phrase-engine.js';
import { buildSyntaxTemplate, buildSyntaxTemplatePlainText } from './endpoint-spec.js';

/**
 * Get the current endpoint spec for the active endpoint, if any.
 */
function getActiveEndpointSpec() {
  const epId = appState.currentEndpointId;
  return epId ? appState.endpointSpecs?.[epId] : null;
}

/**
 * Determine if the endpoint spec is sufficiently populated to drive implicit OIDs.
 */
function hasEndpointSpec() {
  const spec = getActiveEndpointSpec();
  return !!spec?.conceptCategory;
}

export function renderSmartPhraseBuilder(container) {
  const study = appState.selectedStudy;
  const lib = appState.transformationLibrary;
  if (!study || !lib) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study in Step 1 first.</p></div>';
    return;
  }

  const currentEp = getAllEndpoints(study).find(ep => ep.id === appState.currentEndpointId);
  if (!currentEp) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No endpoint selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select an endpoint in Step 4 first.</p></div>';
    return;
  }

  const epSpec = getActiveEndpointSpec();
  const specActive = hasEndpointSpec();

  // Pre-select transformation from endpoint spec (Step 3 → Step 5 flow)
  if (epSpec?.selectedTransformationOid && !appState.selectedTransformation) {
    const transforms = lib.analysisTransformations || [];
    const preSelected = transforms.find(t => t.oid === epSpec.selectedTransformationOid);
    if (preSelected) {
      appState.selectedTransformation = preSelected;
    }
  }

  // Compute implicit OIDs from endpoint spec — triggers come from app-local
  // phrase-role-config.json (not library metadata)
  const implicitOids = specActive
    ? deriveImplicitPhraseOids(epSpec, lib.smartPhrases, lib, appState.phraseRoleAppConfig)
    : [];

  // Build syntax template text for preview
  const syntaxTemplate = specActive ? buildSyntaxTemplate(currentEp, epSpec, study) : null;
  const syntaxPlainText = specActive ? buildSyntaxTemplatePlainText(currentEp, epSpec, study) : '';

  // Filter palette: when endpoint spec is active, hide endpoint-context roles
  const groupedPhrases = groupPhrasesByRole(lib.smartPhrases, lib);
  const endpointContextRoles = getEndpointContextRoles(lib);
  const selectedOids = new Set(appState.composedPhrases.map(e => e.oid));

  // Determine which palette groups to show
  const filteredGroups = {};
  for (const [role, phrases] of Object.entries(groupedPhrases)) {
    if (specActive && endpointContextRoles.has(role)) {
      // Skip endpoint-context roles when spec is active
      // Exception: SP_STRATIFICATION has role 'grouping' but empty references — keep it
      const kept = phrases.filter(sp => sp.oid === 'SP_STRATIFICATION');
      if (kept.length > 0) filteredGroups[role] = kept;
      continue;
    }
    filteredGroups[role] = phrases;
  }

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">SmartPhrase Builder</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
          Composing analysis for <strong>${currentEp.name}</strong>${epSpec?.conceptCategory ? ` [${epSpec.conceptCategory}]` : ''}: ${currentEp.text || ''}
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
        ${specActive ? `
          <div class="card-title" style="margin-bottom:12px; font-size:14px;">Analysis Method</div>
          <p style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:16px;">
            Endpoint context is provided by Step 3. Select the statistical method and qualifiers below.
          </p>
        ` : `
          <div class="card-title" style="margin-bottom:16px; font-size:14px;">SmartPhrases</div>
          <div style="padding:8px 12px; background:#FEF3C7; border:1px solid #F59E0B; border-radius:var(--radius); margin-bottom:16px; font-size:11px; color:#92400E;">
            No endpoint spec found. Complete Step 3 (Endpoint Specification) for a streamlined experience.
            All phrase roles are shown below.
          </div>
          <p style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:16px;">Click phrases to select or deselect them for your analysis description.</p>
        `}
        ${Object.entries(filteredGroups).map(([role, phrases]) => `
          <div class="sp-palette-group">
            <div class="sp-palette-group-title">${getRoleLabel(role, lib)}</div>
            <div style="display:flex; flex-wrap:wrap;">
              ${phrases.map(sp => `
                <div class="phrase-chip ${selectedOids.has(sp.oid) ? 'selected' : ''}" data-role="${sp.role}" data-oid="${sp.oid}">
                  ${sp.name}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Right: Composition Area -->
      <div>
        ${specActive && syntaxTemplate ? `
        <!-- Endpoint Context (read-only, from Step 3) -->
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--cdisc-accent2);">
          <div class="card-title" style="margin-bottom:8px; font-size:14px; display:flex; align-items:center; gap:8px;">
            Endpoint Context
            <span class="badge badge-teal" style="font-size:10px;">from Step 3</span>
          </div>
          <div class="ep-syntax-resolved" style="font-size:13px; line-height:1.8;">${syntaxTemplate.resolved}</div>
          ${implicitOids.length > 0 ? `
            <div style="margin-top:8px; font-size:11px; color:var(--cdisc-text-secondary);">
              Implicit phrases: ${implicitOids.map(oid => {
                const sp = lib.smartPhrases.find(p => p.oid === oid);
                return sp ? `<span class="badge badge-secondary" style="font-size:10px;">${sp.name}</span>` : oid;
              }).join(' ')}
            </div>
          ` : ''}
        </div>
        ` : ''}

        <div class="card" style="margin-bottom:16px;">
          <div class="card-title" style="margin-bottom:12px; font-size:14px;">Selected Method Phrases</div>
          <div class="drop-zone" id="drop-zone">
            ${appState.composedPhrases.length === 0
              ? `<span class="drop-zone-placeholder">${specActive ? 'Select method and qualifier phrases from the left...' : 'Click SmartPhrases on the left to build your analysis description...'}</span>`
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
            <em style="color:var(--cdisc-text-secondary);">Your composed sentence will appear here...</em>
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

  // Initialize existing phrases in the composition display
  renderDropZoneContents();
  renderConfigFields();
  updatePreview();
  findMatches();

  // Click to toggle selection
  container.querySelectorAll('.sp-palette .phrase-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      togglePhrase(chip.dataset.oid);
    });
  });

  // Navigation
  container.querySelector('#btn-back-esap').addEventListener('click', () => navigateTo(4));
  container.querySelector('#btn-proceed-transform').addEventListener('click', () => {
    if (appState.matchedTransformations.length > 0) {
      if (!appState.selectedTransformation) {
        appState.selectedTransformation = appState.matchedTransformations[0];
      }
      navigateTo(6);
    }
  });
}

function togglePhrase(oid) {
  const existingIndex = appState.composedPhrases.findIndex(e => e.oid === oid);
  if (existingIndex >= 0) {
    // Deselect: remove from composed phrases
    appState.composedPhrases.splice(existingIndex, 1);
  } else {
    // Select: add with default config
    const lib = appState.transformationLibrary;
    const sp = lib.smartPhrases.find(p => p.oid === oid);
    if (!sp) return;
    const config = {};
    for (const key of sp.configurations) {
      config[key] = getDefaultConfigValue(key);
    }
    appState.composedPhrases.push({ oid, config });
  }
  refreshAll();
}

function refreshAll() {
  // Update palette selected state
  document.querySelectorAll('.sp-palette .phrase-chip').forEach(chip => {
    const isSelected = appState.composedPhrases.some(e => e.oid === chip.dataset.oid);
    chip.classList.toggle('selected', isSelected);
  });
  renderDropZoneContents();
  renderConfigFields();
  updatePreview();
  findMatches();
}

function getDefaultConfigValue(key) {
  const study = appState.selectedStudy;
  const lib = appState.transformationLibrary;

  switch (key) {
    case 'conf_level': return lib?.configurationOptions?.conf_level?.default || '95';
    case 'imputation': return lib?.configurationOptions?.imputation?.default || 'LOCF';
    case 'event': return '';
    case 'strata': return '';
    case 'parameter': {
      // Only needed for covariate phrases (e.g. SP_COVARIATE_BASELINE)
      const opts = getEndpointParameterOptions(study, appState.currentEndpointId, appState.endpointSpecs);
      return opts[0] || '';
    }
    default: return '';
  }
}

function getConfigOptions(key) {
  const study = appState.selectedStudy;
  switch (key) {
    case 'parameter':
      return getEndpointParameterOptions(study, appState.currentEndpointId, appState.endpointSpecs);
    case 'imputation':
    case 'event':
    case 'strata':
    case 'conf_level': {
      const lib = appState.transformationLibrary;
      return lib?.configurationOptions?.[key]?.values || [];
    }
    default: return [];
  }
}

function renderDropZoneContents() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;
  const lib = appState.transformationLibrary;
  const specActive = hasEndpointSpec();

  if (appState.composedPhrases.length === 0) {
    dropZone.innerHTML = `<span class="drop-zone-placeholder">${specActive ? 'Select method and qualifier phrases from the left...' : 'Click SmartPhrases on the left to build your analysis description...'}</span>`;
    return;
  }

  dropZone.innerHTML = appState.composedPhrases.map((entry, i) => {
    const sp = lib.smartPhrases.find(p => p.oid === entry.oid);
    return `
      <div class="phrase-chip" data-role="${sp.role}" data-oid="${entry.oid}">
        ${sp.name}
        <span class="chip-remove" data-oid="${entry.oid}">&times;</span>
      </div>
    `;
  }).join('');

  // Remove handlers (also deselects from palette)
  dropZone.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePhrase(btn.dataset.oid);
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
      // Bridge SmartPhrase config values into dimensionalSliceValues
      if (appState.dimensionalSliceValues) {
        const sliceKeyMap = { parameter: 'Parameter', visit: 'AnalysisVisit', population: 'Population' };
        const sliceDim = sliceKeyMap[key];
        if (sliceDim && sliceDim in appState.dimensionalSliceValues) {
          appState.dimensionalSliceValues[sliceDim] = value;
        }
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
  const study = appState.selectedStudy;
  const currentEp = getAllEndpoints(study).find(ep => ep.id === appState.currentEndpointId);
  const epSpec = getActiveEndpointSpec();
  const specActive = hasEndpointSpec();

  // Build syntax prefix from endpoint spec
  const syntaxPrefix = specActive && currentEp
    ? buildSyntaxTemplatePlainText(currentEp, epSpec, study)
    : '';

  if (appState.composedPhrases.length === 0 && !syntaxPrefix) {
    previewEl.innerHTML = '<em style="color:var(--cdisc-text-secondary);">Your composed sentence will appear here...</em>';
    return;
  }

  // Build method phrase parts with HTML formatting
  const methodParts = appState.composedPhrases.map(entry => {
    const sp = lib.smartPhrases.find(p => p.oid === entry.oid);
    if (!sp) return '';
    let text = sp.phrase_template;
    for (const key of sp.configurations) {
      const val = entry.config[key];
      if (val) {
        let displayVal = val;
        if (key === 'population') {
          const popOptions = getPopulationNames(study);
          const match = popOptions.find(o => typeof o === 'object' && o.value === val);
          if (match) displayVal = match.label;
        }
        text = text.replace(`{${key}}`, `<strong>${displayVal}</strong>`);
      } else {
        text = text.replace(`{${key}}`, `<span class="placeholder">{${key}}</span>`);
      }
    }
    return text;
  }).filter(Boolean);

  const parts = [];
  if (syntaxPrefix) parts.push(syntaxPrefix);
  parts.push(...methodParts);
  previewEl.innerHTML = parts.join(' ') || '<em style="color:var(--cdisc-text-secondary);">Your composed sentence will appear here...</em>';
}

function findMatches() {
  const lib = appState.transformationLibrary;
  const epSpec = getActiveEndpointSpec();
  const specActive = hasEndpointSpec();

  const oids = appState.composedPhrases.map(e => e.oid);
  const implicitOids = specActive
    ? deriveImplicitPhraseOids(epSpec, lib.smartPhrases, lib, appState.phraseRoleAppConfig)
    : [];
  const matches = findMatchingTransformations(oids, lib, implicitOids);
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
    <div class="card" style="margin-bottom:8px; padding:14px; cursor:pointer; ${i === 0 ? 'border-left:4px solid var(--cdisc-primary);' : 'border-left:4px solid var(--cdisc-border);'}"
         data-transform-index="${i}">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-weight:600; font-size:13px;">${t.name}</div>
          <div style="font-size:12px; color:var(--cdisc-text-secondary); margin-top:2px;">
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
      card.style.borderLeftColor = 'var(--cdisc-primary)';
    });
  });

  // Auto-select first
  if (!appState.selectedTransformation) {
    appState.selectedTransformation = matches[0];
  }
}
