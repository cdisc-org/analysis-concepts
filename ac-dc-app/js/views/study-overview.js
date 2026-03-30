import { appState, navigateTo } from '../app.js';
import { resolveNarrative } from '../utils/usdm-ref-resolver.js';

export function renderStudyOverview(container) {
  const study = appState.selectedStudy;
  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study in Step 1 first.</p></div>';
    return;
  }

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:22px; font-weight:700;">${study.name}</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">${study.identifiers.map(i => i.text).join(' | ')}</p>
      </div>
      <button class="btn btn-primary" id="btn-proceed-esap">
        Specify Endpoints &rarr;
      </button>
    </div>

    <div class="tab-bar">
      <button class="tab-btn active" data-tab="summary">Summary</button>
      <button class="tab-btn" data-tab="arms">Arms</button>
      <button class="tab-btn" data-tab="objectives">Objectives & Endpoints</button>
      <button class="tab-btn" data-tab="narrative">Narrative</button>
      <button class="tab-btn" data-tab="configuration">Configuration</button>
    </div>

    <div class="tab-panel active" id="tab-summary">${renderSummary(study)}</div>
    <div class="tab-panel" id="tab-arms">${renderArms(study)}</div>
    <div class="tab-panel" id="tab-objectives">${renderObjectives(study)}</div>
    <div class="tab-panel" id="tab-narrative">${renderNarrative(study)}</div>
    <div class="tab-panel" id="tab-configuration">${renderConfiguration()}</div>
  `;

  // Tab switching
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // Endpoint selection checkboxes
  container.querySelectorAll('.endpoint-checkbox').forEach(cb => {
    // Restore prior selections
    if (appState.selectedEndpoints.includes(cb.value)) cb.checked = true;

    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!appState.selectedEndpoints.includes(cb.value)) {
          appState.selectedEndpoints.push(cb.value);
        }
      } else {
        appState.selectedEndpoints = appState.selectedEndpoints.filter(id => id !== cb.value);
      }
      updateSelectionCount(container);
    });
  });

  // Select all button
  container.querySelector('#select-all-endpoints')?.addEventListener('click', () => {
    const allCbs = container.querySelectorAll('.endpoint-checkbox');
    const allChecked = [...allCbs].every(cb => cb.checked);
    allCbs.forEach(cb => {
      cb.checked = !allChecked;
      cb.dispatchEvent(new Event('change'));
    });
  });

  // Proceed button
  container.querySelector('#btn-proceed-esap').addEventListener('click', () => {
    if (appState.selectedEndpoints.length === 0) {
      // Switch to objectives tab and highlight
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      container.querySelector('[data-tab="objectives"]').classList.add('active');
      document.getElementById('tab-objectives').classList.add('active');
      return;
    }
    navigateTo(3);
  });

  updateSelectionCount(container);
  wireConfigurationTab(container);
}

function updateSelectionCount(container) {
  const count = appState.selectedEndpoints.length;
  const el = container.querySelector('#selection-count');
  if (el) {
    el.textContent = count > 0 ? `${count} endpoint${count > 1 ? 's' : ''} selected` : 'No endpoints selected';
    el.style.color = count > 0 ? 'var(--cdisc-success)' : 'var(--cdisc-text-secondary)';
  }
}

function renderSummary(study) {
  const pop = study.populations[0];
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:12px;">Study Information</div>
      <table class="data-table">
        <tbody>
          <tr><td style="width:180px; font-weight:600;">Study Name</td><td>${study.name}</td></tr>
          <tr><td style="font-weight:600;">Phase</td><td><span class="badge badge-blue">${study.phase}</span></td></tr>
          <tr><td style="font-weight:600;">Therapeutic Area</td><td>${study.therapeuticAreas.map(ta => `<span class="badge badge-teal" style="margin-right:6px;">${ta.decode}</span>`).join('')}</td></tr>
          <tr><td style="font-weight:600;">Identifiers</td><td>${study.identifiers.map(i => `<code style="background:var(--cdisc-background);padding:2px 6px;border-radius:3px;margin-right:8px;">${i.text}</code>`).join('')}</td></tr>
          ${pop ? `
          <tr><td style="font-weight:600;">Population</td><td>${pop.description || pop.name}</td></tr>
          <tr><td style="font-weight:600;">Planned Enrollment</td><td>${pop.plannedEnrollment || 'N/A'}</td></tr>
          <tr><td style="font-weight:600;">Sex</td><td>${pop.sex || 'N/A'}</td></tr>
          ` : ''}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:12px;">Study Rationale</div>
      <p style="font-size:13px; line-height:1.7; color:var(--cdisc-text-secondary);">${study.rationale}</p>
    </div>
  `;
}

function renderArms(study) {
  return `
    <div class="card">
      <div class="card-title" style="margin-bottom:16px;">Treatment Arms (${study.arms.length})</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
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
    </div>
  `;
}

function renderObjectives(study) {
  return `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
      <div>
        <span id="selection-count" style="font-size:13px; font-weight:500; color:var(--cdisc-text-secondary);">No endpoints selected</span>
      </div>
      <button class="btn btn-sm btn-secondary" id="select-all-endpoints">Toggle All</button>
    </div>

    ${study.objectives.map(obj => `
      <div class="objective-group">
        <div class="objective-header">
          <span class="badge ${obj.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}">${obj.level || 'Objective'}</span>
          <div>
            <div style="font-weight:600; font-size:13px; margin-bottom:4px;">${obj.name}</div>
            <div class="objective-text">${obj.text || obj.description || ''}</div>
          </div>
        </div>
        <div class="endpoint-list">
          ${obj.endpoints.map(ep => `
            <div class="endpoint-item">
              <input type="checkbox" class="endpoint-checkbox" value="${ep.id}" id="ep-${ep.id}">
              <div>
                <label for="ep-${ep.id}" style="font-weight:600; font-size:13px; cursor:pointer;">${ep.name}</label>
                <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:8px;">${ep.level}</span>
                <div style="font-size:12px; color:var(--cdisc-text-secondary); margin-top:4px; line-height:1.5;">${ep.text || ep.description || ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

function renderConfiguration() {
  const mappings = appState.conceptMappings;
  if (!mappings) {
    return '<div class="card"><p style="color:var(--cdisc-text-secondary);">Mappings not loaded yet.</p></div>';
  }

  function renderMappingTable(modelKey, typeKey, typeLabel) {
    const entries = mappings[modelKey]?.[typeKey] || {};
    const rows = Object.entries(entries).map(([name, entry]) => `
      <tr>
        <td style="font-weight:600; white-space:nowrap;"><code>${name}</code></td>
        <td><input class="mapping-variable-input" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" value="${entry.variable || ''}"></td>
        <td><input class="mapping-notes-input" data-model="${modelKey}" data-type="${typeKey}" data-concept="${name}" value="${entry.notes || ''}"></td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom:20px;">
        <div style="font-weight:600; font-size:12px; margin-bottom:8px; color:var(--cdisc-text);">${typeLabel}</div>
        <table class="data-table mapping-table">
          <thead>
            <tr>
              <th style="width:180px;">Concept</th>
              <th style="width:220px;">Variable</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="card">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <div class="card-title">Concept-to-Variable Mappings</div>
        <button class="btn btn-sm btn-secondary" id="reset-mappings-btn">Reset to Defaults</button>
      </div>
      <p style="font-size:12px; color:var(--cdisc-text-secondary); margin-bottom:16px; line-height:1.5;">
        Edit variable names to customize how concepts are displayed when using the model view toggle in the header.
        Changes take effect immediately when viewing other steps.
      </p>
      <div class="config-sub-tabs" id="config-sub-tabs">
        <button class="active" data-model="adam">ADaM</button>
        <button data-model="omop">OMOP</button>
        <button data-model="fhir">FHIR</button>
      </div>
      <div id="config-model-adam">
        ${renderMappingTable('adam', 'concepts', 'Derivation Concepts')}
        ${renderMappingTable('adam', 'dimensions', 'Dimensional Concepts')}
      </div>
      <div id="config-model-omop" style="display:none;">
        ${renderMappingTable('omop', 'concepts', 'Derivation Concepts')}
        ${renderMappingTable('omop', 'dimensions', 'Dimensional Concepts')}
      </div>
      <div id="config-model-fhir" style="display:none;">
        ${renderMappingTable('fhir', 'concepts', 'Derivation Concepts')}
        ${renderMappingTable('fhir', 'dimensions', 'Dimensional Concepts')}
      </div>
    </div>
  `;
}

function wireConfigurationTab(container) {
  // Sub-tab switching
  const modelKeys = ['adam', 'omop', 'fhir'];
  container.querySelectorAll('#config-sub-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#config-sub-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const model = btn.dataset.model;
      modelKeys.forEach(key => {
        const panel = container.querySelector(`#config-model-${key}`);
        if (panel) panel.style.display = key === model ? '' : 'none';
      });
    });
  });

  // Variable input changes
  container.querySelectorAll('.mapping-variable-input').forEach(input => {
    input.addEventListener('input', () => {
      const { model, type, concept } = input.dataset;
      if (appState.conceptMappings?.[model]?.[type]?.[concept]) {
        appState.conceptMappings[model][type][concept].variable = input.value;
      }
    });
  });

  // Notes input changes
  container.querySelectorAll('.mapping-notes-input').forEach(input => {
    input.addEventListener('input', () => {
      const { model, type, concept } = input.dataset;
      if (appState.conceptMappings?.[model]?.[type]?.[concept]) {
        appState.conceptMappings[model][type][concept].notes = input.value;
      }
    });
  });

  // Reset to defaults
  const resetBtn = container.querySelector('#reset-mappings-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      try {
        const basePath = location.pathname.includes('ac-dc-app')
          ? location.pathname.substring(0, location.pathname.indexOf('ac-dc-app'))
          : '/';
        const resp = await fetch(basePath + 'ac-dc-app/data/concept-variable-mappings.json');
        if (resp.ok) {
          appState.conceptMappings = await resp.json();
          // Re-render the configuration tab content
          const configPanel = container.querySelector('#tab-configuration');
          if (configPanel) {
            configPanel.innerHTML = renderConfiguration();
            wireConfigurationTab(container);
          }
        }
      } catch (e) {
        console.error('Failed to reset mappings:', e);
      }
    });
  }
}

function renderNarrative(study) {
  if (!study.narrativeContent || study.narrativeContent.length === 0) {
    return '<div class="card"><p style="color:var(--cdisc-text-secondary);">No narrative content available.</p></div>';
  }

  const index = appState.usdmIndex;

  return `
    <div class="card">
      <div class="card-title" style="margin-bottom:16px;">Protocol Narrative Content</div>
      <div class="narrative-content">
        ${study.narrativeContent.map(nc => {
          const html = resolveNarrative(nc, index);
          return `
            <div style="margin-bottom:16px;">
              <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:4px; font-weight:500;">${nc.name} (${nc.id})</div>
              ${html}
            </div>`;
        }).join('')}
      </div>
    </div>
  `;
}
