import { appState } from '../app.js';

const PRIMITIVE_TYPES = ['decimal', 'integer', 'code', 'string', 'boolean', 'date', 'dateTime', 'id'];
const MODEL_LABELS = { sdtm: 'SDTM', adam: 'ADaM', omop: 'OMOP', fhir: 'FHIR' };

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
      ${modelKeys.map(k => {
        const meta = mappings[k]?._meta;
        const version = meta?.igVersion || meta?.version || meta?.modelVersion || '';
        const badge = version ? `<span style="font-size:9px; color:var(--cdisc-text-secondary); margin-left:4px;">${version}</span>` : '';
        return `<button ${k === activeModel ? 'class="active"' : ''} data-model="${k}">${MODEL_LABELS[k]}${badge}</button>`;
      }).join('')}
    </div>
    ${modelKeys.map(k => `
      <div class="cp-model-panel" id="cp-model-${k}" style="${k !== activeModel ? 'display:none;' : ''}">
        ${renderMetaHeader(k)}
        ${renderStandardReference(k)}
        ${renderGroupCards(k, 'concepts', 'Derivation Concepts')}
        ${renderGroupCards(k, 'dimensions', 'Dimensional Concepts')}
      </div>
    `).join('')}
    <div style="padding:12px 0; border-top:1px solid var(--cdisc-border); margin-top:16px;">
      <button class="btn btn-sm btn-secondary" id="cp-reset-btn" style="width:100%;">Reset to Defaults</button>
    </div>
  `;
}

/** Render version metadata header for a store */
function renderMetaHeader(modelKey) {
  const meta = appState.conceptMappings?.[modelKey]?._meta;
  if (!meta) return '';

  const badges = [];
  if (meta.modelVersion) badges.push(`Model ${meta.modelVersion}`);
  if (meta.igVersion) badges.push(`IG ${meta.igVersion}`);
  if (meta.occdsVersion) badges.push(`OCCDS ${meta.occdsVersion}`);
  if (meta.version) badges.push(meta.version);

  return `
    <div style="padding:8px 0; margin-bottom:12px; border-bottom:1px solid var(--cdisc-border);">
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <span style="font-size:13px; font-weight:700; color:var(--cdisc-text);">${meta.standard || MODEL_LABELS[modelKey]}</span>
        ${badges.map(b => `<span style="font-size:10px; padding:1px 6px; border-radius:3px; background:var(--cdisc-primary-light); color:var(--cdisc-primary); font-weight:600;">${b}</span>`).join('')}
      </div>
      ${meta.sources?.length ? `<div style="font-size:10px; color:var(--cdisc-text-secondary); margin-top:4px;">Sources: ${meta.sources.join(', ')}</div>` : ''}
    </div>
  `;
}

/** Render the Standard Reference section (read-only classVariables or standardVariables) */
function renderStandardReference(modelKey) {
  const mappings = appState.conceptMappings?.[modelKey];
  const classVars = mappings?.classVariables;
  const stdVars = mappings?.standardVariables;
  if (!classVars && !stdVars) return '';

  const sectionLabel = classVars ? 'Class Variables' : 'Standard Variables';
  const varData = classVars || stdVars;

  const groupHtml = Object.entries(varData).map(([groupName, roles]) => {
    const roleHtml = Object.entries(roles).map(([roleName, vars]) => {
      if (!Array.isArray(vars) || vars.length === 0) return '';
      return `
        <div style="margin-bottom:8px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">${roleName}</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead><tr>
              <th style="text-align:left; padding:2px 4px; font-size:10px; color:var(--cdisc-text-secondary); font-weight:600; border-bottom:1px solid var(--cdisc-border);">Variable</th>
              <th style="text-align:left; padding:2px 4px; font-size:10px; color:var(--cdisc-text-secondary); font-weight:600; border-bottom:1px solid var(--cdisc-border);">Label</th>
              <th style="text-align:left; padding:2px 4px; font-size:10px; color:var(--cdisc-text-secondary); font-weight:600; border-bottom:1px solid var(--cdisc-border);">Type</th>
              ${stdVars ? '<th style="text-align:left; padding:2px 4px; font-size:10px; color:var(--cdisc-text-secondary); font-weight:600; border-bottom:1px solid var(--cdisc-border);">Core</th>' : ''}
            </tr></thead>
            <tbody>${vars.map(v => `<tr>
              <td style="padding:2px 4px;"><code style="font-size:10px; color:var(--cdisc-primary);">${v.name}</code></td>
              <td style="padding:2px 4px; color:var(--cdisc-text);">${v.label}</td>
              <td style="padding:2px 4px; color:var(--cdisc-text-secondary);">${v.type}</td>
              ${stdVars ? `<td style="padding:2px 4px;"><span style="font-size:9px; padding:0 4px; border-radius:2px; ${v.core === 'Req' ? 'background:#e8f5e9; color:#2e7d32;' : v.core === 'Cond' ? 'background:#fff3e0; color:#ef6c00;' : 'color:var(--cdisc-text-secondary);'}">${v.core || ''}</span></td>` : ''}
            </tr>`).join('')}</tbody>
          </table>
        </div>
      `;
    }).join('');

    return `
      <div class="config-concept-card" style="background:var(--cdisc-background);">
        <div class="config-concept-card-header cp-ref-header" data-card="ref-${modelKey}-${groupName}">
          <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-right:6px;">&#9654;</span>
          <span style="font-size:12px; font-weight:600; color:var(--cdisc-text);">${groupName.replace(/([A-Z])/g, ' $1').trim()}</span>
        </div>
        <div class="config-concept-card-body" id="card-ref-${modelKey}-${groupName}" style="display:none;">
          ${roleHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-text-secondary); margin-bottom:8px;">
        ${sectionLabel}
        <span style="font-size:9px; font-weight:400; color:var(--cdisc-text-secondary); margin-left:6px;">(read-only reference)</span>
      </div>
      ${groupHtml}
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

  // Show facets if present (read-only)
  const facets = entry.facets;
  const facetHtml = facets ? `
    <div style="margin-bottom:8px;">
      <label style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.3px;">Facets</label>
      <table style="width:100%; border-collapse:collapse; margin-top:4px;">
        ${Object.entries(facets).map(([facet, varName]) => `
          <tr>
            <td style="font-size:10px; color:var(--cdisc-text-secondary); padding:2px 4px;">${facet}</td>
            <td style="font-size:11px; padding:2px 4px;"><code style="color:var(--cdisc-primary);">${varName}</code></td>
          </tr>
        `).join('')}
      </table>
    </div>
  ` : '';

  // Show intentType if present (read-only)
  const intentType = entry.intentType;
  const intentHtml = intentType ? `
    <div style="margin-bottom:8px;">
      <label style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.3px;">Intent Type</label>
      <table style="width:100%; border-collapse:collapse; margin-top:4px;">
        ${Object.entries(intentType).map(([intent, vars]) => `
          <tr>
            <td style="font-size:10px; color:var(--cdisc-text-secondary); padding:2px 4px;">${intent}</td>
            <td style="font-size:11px; padding:2px 4px;">${Object.entries(vars).map(([t, v]) => `<code style="color:var(--cdisc-primary);">${v}</code>`).join(' / ')}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  ` : '';

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
        ${facetHtml}
        ${intentHtml}
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

  // Sub-tab switching — use MODEL_LABELS keys to show/hide all panels
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

  // Collapsible card headers (both editable concept cards and read-only reference cards)
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
