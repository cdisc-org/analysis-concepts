import { appState } from '../app.js';

const PRIMITIVE_TYPES = ['decimal', 'integer', 'code', 'string', 'boolean', 'date', 'dateTime', 'id'];
const MODEL_LABELS = { adam: 'ADaM', omop: 'OMOP', fhir: 'FHIR' };

let activeModel = 'adam';
let defaultMappingsCache = null;

export function toggleConfigPanel() {
  appState.configPanelOpen = !appState.configPanelOpen;
  const panel = document.getElementById('study-config-panel');
  const trigger = document.getElementById('sidebar-config-trigger');
  if (panel) {
    panel.classList.toggle('open', appState.configPanelOpen);
  }
  if (trigger) {
    trigger.classList.toggle('active', appState.configPanelOpen);
  }
}

export function renderConfigPanel() {
  const panel = document.getElementById('study-config-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="config-panel-header">
      <div>
        <div style="font-size:15px; font-weight:700; color:var(--cdisc-text);">Study Configuration</div>
        <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:2px;">Variable mappings</div>
      </div>
      <button class="config-panel-close" id="config-panel-close">&times;</button>
    </div>
    <div class="config-panel-body" id="config-panel-body">
      ${renderPanelContent()}
    </div>
  `;

  wirePanel(panel);
}

function renderPanelContent() {
  const mappings = appState.conceptMappings;
  if (!mappings) {
    return '<p style="color:var(--cdisc-text-secondary); padding:16px;">Mappings not loaded yet.</p>';
  }

  const modelKeys = Object.keys(MODEL_LABELS).filter(k => mappings[k]);

  return `
    <div class="config-sub-tabs" id="cp-sub-tabs">
      ${modelKeys.map(k => `<button ${k === activeModel ? 'class="active"' : ''} data-model="${k}">${MODEL_LABELS[k]}</button>`).join('')}
    </div>
    ${modelKeys.map(k => `
      <div class="cp-model-panel" id="cp-model-${k}" style="${k !== activeModel ? 'display:none;' : ''}">
        ${renderGroupCards(k, 'concepts', 'Derivation Concepts')}
        ${renderGroupCards(k, 'dimensions', 'Dimensional Concepts')}
      </div>
    `).join('')}
    <div style="padding:12px 0; border-top:1px solid var(--cdisc-border); margin-top:16px;">
      <button class="btn btn-sm btn-secondary" id="cp-reset-btn" style="width:100%;">Reset to Defaults</button>
    </div>
  `;
}

function renderGroupCards(modelKey, typeKey, typeLabel) {
  const entries = appState.conceptMappings?.[modelKey]?.[typeKey] || {};

  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-text-secondary); margin-bottom:8px;">${typeLabel}</div>
      ${Object.entries(entries).map(([name, entry]) => renderConceptCard(modelKey, typeKey, name, entry)).join('')}
    </div>
  `;
}

function renderConceptCard(modelKey, typeKey, name, entry) {
  const byDataType = entry.byDataType || {};
  const dtRows = Object.entries(byDataType).map(([dt, varName]) => `
    <tr>
      <td style="font-size:11px; color:var(--cdisc-text-secondary);">${dt}</td>
      <td><input class="cp-dt-var" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" data-dt="${dt}" value="${varName}" style="font-size:11px; width:100%; border:1px solid transparent; border-radius:3px; padding:2px 4px; font-family:var(--font-family); color:var(--cdisc-text); background:transparent;"></td>
      <td style="width:24px; text-align:center;"><span class="cp-dt-remove" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" data-dt="${dt}" style="cursor:pointer; color:var(--cdisc-text-secondary); font-size:14px;" title="Remove">&times;</span></td>
    </tr>
  `).join('');

  return `
    <div class="config-concept-card">
      <div class="config-concept-card-header" data-card="${modelKey}-${typeKey}-${name}">
        <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-right:6px;">&#9654;</span>
        <code style="font-size:12px; font-weight:600; color:var(--cdisc-primary);">${name}</code>
      </div>
      <div class="config-concept-card-body" id="card-${modelKey}-${typeKey}-${name}" style="display:none;">
        <div style="margin-bottom:8px;">
          <label style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.3px;">Variable</label>
          <input class="cp-var-input" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" value="${entry.variable || ''}" style="width:100%; padding:4px 8px; border:1px solid var(--cdisc-border); border-radius:4px; font-size:12px; font-family:var(--font-family); color:var(--cdisc-text); margin-top:2px;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.3px;">Notes</label>
          <input class="cp-notes-input" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" value="${entry.notes || ''}" style="width:100%; padding:4px 8px; border:1px solid var(--cdisc-border); border-radius:4px; font-size:12px; font-family:var(--font-family); color:var(--cdisc-text); margin-top:2px;">
        </div>
        ${Object.keys(byDataType).length > 0 || true ? `
        <div>
          <label style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.3px;">By Data Type</label>
          <table style="width:100%; border-collapse:collapse; margin-top:4px;">
            <thead><tr>
              <th style="text-align:left; font-size:10px; color:var(--cdisc-text-secondary); padding:2px 4px; font-weight:600;">Type</th>
              <th style="text-align:left; font-size:10px; color:var(--cdisc-text-secondary); padding:2px 4px; font-weight:600;">Variable</th>
              <th></th>
            </tr></thead>
            <tbody>${dtRows}</tbody>
          </table>
          <div class="cp-add-dt-row" style="display:flex; align-items:center; gap:6px; margin-top:6px;">
            <select class="cp-add-dt-select" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" style="flex:1; padding:3px 6px; border:1px solid var(--cdisc-border); border-radius:4px; font-size:11px; font-family:var(--font-family); color:var(--cdisc-text);">
              <option value="">+ Add type...</option>
              ${PRIMITIVE_TYPES.filter(t => !byDataType[t]).map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <input class="cp-add-dt-var" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" placeholder="Variable" style="flex:1; padding:3px 6px; border:1px solid var(--cdisc-border); border-radius:4px; font-size:11px; font-family:var(--font-family); color:var(--cdisc-text);">
            <button class="cp-add-dt-btn btn btn-sm btn-secondary" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" style="padding:2px 8px; font-size:11px;">+</button>
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

function wirePanel(panel) {
  // Close button
  panel.querySelector('#config-panel-close')?.addEventListener('click', toggleConfigPanel);

  // Sub-tab switching
  panel.querySelectorAll('#cp-sub-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      activeModel = btn.dataset.model;
      panel.querySelectorAll('#cp-sub-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Object.keys(MODEL_LABELS).forEach(k => {
        const p = panel.querySelector(`#cp-model-${k}`);
        if (p) p.style.display = k === activeModel ? '' : 'none';
      });
    });
  });

  // Collapsible card headers
  panel.querySelectorAll('.config-concept-card-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.config-concept-card');
      const body = card.querySelector('.config-concept-card-body');
      const arrow = header.querySelector('span');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      arrow.textContent = isOpen ? '\u25B6' : '\u25BC';
    });
  });

  // Variable input changes
  panel.querySelectorAll('.cp-var-input').forEach(input => {
    input.addEventListener('input', () => {
      const { model, type, concept } = input.dataset;
      if (appState.conceptMappings?.[model]?.[type]?.[concept]) {
        appState.conceptMappings[model][type][concept].variable = input.value;
      }
    });
  });

  // Notes input changes
  panel.querySelectorAll('.cp-notes-input').forEach(input => {
    input.addEventListener('input', () => {
      const { model, type, concept } = input.dataset;
      if (appState.conceptMappings?.[model]?.[type]?.[concept]) {
        appState.conceptMappings[model][type][concept].notes = input.value;
      }
    });
  });

  // byDataType variable changes
  panel.querySelectorAll('.cp-dt-var').forEach(input => {
    input.addEventListener('input', () => {
      const { model, type, concept, dt } = input.dataset;
      const entry = appState.conceptMappings?.[model]?.[type]?.[concept];
      if (entry?.byDataType) {
        entry.byDataType[dt] = input.value;
      }
    });
  });

  // byDataType remove
  panel.querySelectorAll('.cp-dt-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const { model, type, concept, dt } = btn.dataset;
      const entry = appState.conceptMappings?.[model]?.[type]?.[concept];
      if (entry?.byDataType) {
        delete entry.byDataType[dt];
        refreshPanelBody(panel);
      }
    });
  });

  // Add byDataType row
  panel.querySelectorAll('.cp-add-dt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { model, type, concept } = btn.dataset;
      const row = btn.closest('.cp-add-dt-row');
      const select = row.querySelector('.cp-add-dt-select');
      const varInput = row.querySelector('.cp-add-dt-var');
      const dt = select.value;
      const varName = varInput.value.trim();
      if (!dt || !varName) return;
      const entry = appState.conceptMappings?.[model]?.[type]?.[concept];
      if (entry) {
        if (!entry.byDataType) entry.byDataType = {};
        entry.byDataType[dt] = varName;
        refreshPanelBody(panel);
      }
    });
  });

  // Reset to defaults
  panel.querySelector('#cp-reset-btn')?.addEventListener('click', async () => {
    try {
      if (!defaultMappingsCache) {
        const basePath = location.pathname.includes('ac-dc-app')
          ? location.pathname.substring(0, location.pathname.indexOf('ac-dc-app'))
          : '/';
        const resp = await fetch(basePath + 'ac-dc-app/data/concept-variable-mappings.json');
        if (resp.ok) {
          defaultMappingsCache = await resp.json();
        }
      }
      if (defaultMappingsCache) {
        appState.conceptMappings = JSON.parse(JSON.stringify(defaultMappingsCache));
        refreshPanelBody(panel);
      }
    } catch (e) {
      console.error('Failed to reset mappings:', e);
    }
  });
}

function refreshPanelBody(panel) {
  const body = panel.querySelector('#config-panel-body');
  if (body) {
    body.innerHTML = renderPanelContent();
    wirePanel(panel);
  }
}
