import { appState, navigateTo } from '../app.js';
import { getAllEndpoints, getBiomedicalConcepts, getVisitLabels, getPopulationNames, getArmNames, getEndpointParameterOptions } from '../utils/usdm-parser.js';
import {
  ensureSpec, getConceptCategoryOptions, classifyBcProperties,
  getMatchingDerivationTransformations, getDerivationTransformationByOid,
  getDerivationEndpointPhrase, getSpecParameterValue,
  renderParameterPicker, renderOcFacetCards, renderDerivationConfigPanel,
  buildSyntaxTemplate, updateSyntaxPreview, DATA_TYPES, PLACEHOLDER_DIM_MAP,
  OBSERVATION_DIMENSIONS, getDimensionOptions
} from './endpoint-spec.js';

export function renderEndpointWhat(container) {
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

  if (!appState.endpointSpecs) appState.endpointSpecs = {};

  const conceptOptions = getConceptCategoryOptions();
  const hasAnySpec = selectedEps.some(ep => appState.endpointSpecs[ep.id]?.conceptCategory);

  // Set initial active endpoint if not set
  if (!appState.activeEndpointId && selectedEps.length > 0) {
    appState.activeEndpointId = selectedEps[0].id;
  }

  // Build left content (endpoint accordions)
  const endpointCards = selectedEps.map((ep, i) => {
    const isActive = ep.id === appState.activeEndpointId;
    const spec = appState.endpointSpecs[ep.id] || {};
    const isObservation = spec.conceptCategory === 'Observation';

    // Get BCs for this endpoint
    const bcs = getBiomedicalConcepts(study, ep.id);
    const allBCs = study.biomedicalConcepts || [];
    const hasBCs = bcs.length > 0 || allBCs.length > 0;
    const paramSource = spec.parameterSource || 'bc';

    // Derivation handling
    const matchingDerivations = isObservation ? [] : getMatchingDerivationTransformations(spec.conceptCategory);

    // Auto-select single derivation
    if (matchingDerivations.length === 1 && !spec.selectedDerivationOid && spec.conceptCategory) {
      ensureSpec(ep.id);
      appState.endpointSpecs[ep.id].selectedDerivationOid = matchingDerivations[0].oid;
    }

    const selectedDerivation = spec.selectedDerivationOid
      ? getDerivationTransformationByOid(spec.selectedDerivationOid)
      : null;

    // Build "What" preview
    const derivPhrase = getDerivationEndpointPhrase(selectedDerivation);
    const paramValue = getSpecParameterValue(ep.id, spec, study);
    let whatPreview = null;
    if (derivPhrase) {
      let whatTpl = derivPhrase.phrase_template;
      if (whatTpl.includes('{parameter}')) {
        whatTpl = paramValue
          ? whatTpl.replace('{parameter}', `<strong>${paramValue}</strong>`)
          : whatTpl.replace('{parameter}', '<span class="placeholder">{parameter}</span>');
      }
      // Resolve other config placeholders
      for (const [key, val] of Object.entries(spec.derivationConfigValues || {})) {
        const ph = `{${key}}`;
        if (whatTpl.includes(ph)) {
          whatTpl = val ? whatTpl.replace(ph, `<strong>${val}</strong>`) : whatTpl;
        }
      }
      whatPreview = whatTpl;
    }

    // OC facets for observation
    const linkedBcs = getBiomedicalConcepts(study, ep.id);
    const primaryBc = (spec.linkedBCIds?.length > 0)
      ? (study.biomedicalConcepts || []).find(bc => spec.linkedBCIds.includes(bc.id))
      : linkedBcs[0] || null;
    const classifiedProps = (isObservation && primaryBc) ? classifyBcProperties(primaryBc) : [];

    // Auto-select Result.Value facet
    if (isObservation && classifiedProps.length > 0 && !spec.selectedOcFacet) {
      if (classifiedProps.some(p => p.ocFacet === 'Result.Value')) {
        ensureSpec(ep.id);
        appState.endpointSpecs[ep.id].selectedOcFacet = 'Result.Value';
      }
    }

    const syntax = buildSyntaxTemplate(ep, spec, study);
    const originalText = ep.text || ep.description || ep.name;

    // DC model hover descriptions for concept categories
    const dcModel = appState.dcModel;

    return `
      <div class="ep-accordion-item ${isActive ? 'open' : ''}" data-ep-id="${ep.id}">
        <div class="ep-accordion-header" data-ep-id="${ep.id}">
          <span class="ep-accordion-arrow">&#9654;</span>
          <strong style="font-size:14px;">${ep.name}</strong>
          <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:4px;">${ep.level}</span>
          ${spec.conceptCategory ? `<span class="badge badge-teal" style="margin-left:auto;">${spec.conceptCategory}</span>` : ''}
        </div>
        <div class="ep-accordion-body">
          <!-- Protocol Endpoint Text -->
          <div style="margin-bottom:16px; padding:10px 14px; background:var(--cdisc-primary-light); border-radius:var(--radius); border-left:3px solid var(--cdisc-primary);">
            <div style="font-size:11px; font-weight:600; color:var(--cdisc-primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Protocol Endpoint (Original)</div>
            <div style="font-size:13px; line-height:1.5;">${originalText}</div>
          </div>

          <!-- Concept Category + Data Type -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
            <div class="config-field">
              <label class="config-label">Concept Category</label>
              <select class="config-select ep-concept-category" data-ep-id="${ep.id}">
                <option value="">-- Select --</option>
                ${conceptOptions.map(opt => {
                  // Get hover description from DC model
                  const bare = opt.value.startsWith('C.') ? opt.value.slice(2) : opt.value;
                  let title = '';
                  if (dcModel?.categories) {
                    for (const [catName, cat] of Object.entries(dcModel.categories)) {
                      if (cat.concepts?.[bare]?.definition) {
                        title = cat.concepts[bare].definition;
                        break;
                      }
                    }
                  }
                  if (opt.value === 'Observation') title = 'Direct observation or measurement — no derivation needed';
                  return `<option value="${opt.value}" ${opt.value === spec.conceptCategory ? 'selected' : ''} ${title ? `title="${title}"` : ''}>${opt.label}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="config-field">
              <label class="config-label">Data Type</label>
              <select class="config-select ep-data-type" data-ep-id="${ep.id}">
                ${DATA_TYPES.map(dt =>
                  `<option value="${dt}" ${dt === (spec.dataType || 'Quantity') ? 'selected' : ''}>${dt}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          ${spec.conceptCategory ? `
          ${isObservation ? `
            <!-- Observation Path -->
            ${renderParameterPicker(ep, spec, bcs, allBCs, hasBCs, paramSource)}
            ${primaryBc && classifiedProps.length > 0 ? renderOcFacetCards(classifiedProps, spec, ep.id) : `
              <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:11px; color:var(--cdisc-text-secondary);">
                Link a Biomedical Concept above to see its observation structure.
              </div>
            `}
            <!-- Observation Dimensions -->
            <div style="margin-top:12px; margin-bottom:12px;">
              <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">
                Dimensional Context
              </div>
              <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:8px;">
                Specify which visits and populations this observation applies to.
              </div>
              <div class="ep-dim-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">
                ${Object.entries(OBSERVATION_DIMENSIONS).map(([dim, info]) => {
                  const options = getDimensionOptions(dim, study);
                  const currentVal = (spec.dimensionValues || {})[dim] || '';
                  const isMulti = info.cardinality === '0..*';
                  return `
                    <div class="config-field">
                      <label class="config-label" style="display:flex; align-items:center; gap:6px;">
                        <span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">${dim}</span>
                        <span style="font-size:10px; color:var(--cdisc-text-secondary);">${info.role}${isMulti ? ' (multi)' : ''}</span>
                      </label>
                      ${options && options.length > 0 ? `
                        <select class="config-select ep-obs-dim-value" data-ep-id="${ep.id}" data-dim="${dim}">
                          <option value="">-- Select --</option>
                          ${isMulti ? '<option value="__ALL__"' + (currentVal === '__ALL__' ? ' selected' : '') + '>All visits</option>' : ''}
                          ${options.map(opt => {
                            const v = typeof opt === 'object' ? opt.value : opt;
                            const l = typeof opt === 'object' ? opt.label : opt;
                            const tip = typeof opt === 'object' && opt.label !== opt.value ? ` title="${l}"` : '';
                            return `<option value="${v}"${tip} ${v === currentVal ? 'selected' : ''}>${v}</option>`;
                          }).join('')}
                        </select>
                      ` : `
                        <input class="config-input ep-obs-dim-value" data-ep-id="${ep.id}" data-dim="${dim}" value="${currentVal}" placeholder="Enter ${dim.toLowerCase()} value">
                      `}
                    </div>`;
                }).join('')}
              </div>
            </div>
          ` : `
            <!-- Derived Concept Path -->
            ${matchingDerivations.length > 0 && selectedDerivation ? `
              <!-- Derivation selected — show config panel -->
              ${renderDerivationConfigPanel(selectedDerivation, spec, study, ep)}
            ` : matchingDerivations.length === 0 ? `
              <!-- No derivation — source data endpoint -->
              <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:11px; color:var(--cdisc-text-secondary);">
                No endpoint-level derivation for <strong>${spec.conceptCategory}</strong> — source data endpoint.
              </div>
              ${renderParameterPicker(ep, spec, bcs, allBCs, hasBCs, paramSource)}
            ` : `
              <!-- Derivations available but none selected -->
              <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:11px; color:var(--cdisc-text-secondary);">
                Select a derivation template from the library panel on the right.
              </div>
            `}
          `}

          ${whatPreview ? `
          <div style="margin-top:8px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:12px; line-height:1.6;">
            <span style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px;">What: </span>
            ${whatPreview}
          </div>
          ` : ''}

          ${syntax ? `
          <div id="syntax-preview-${ep.id}" style="margin-top:12px;">
            <div class="ep-syntax-template">${syntax.template}</div>
            <div class="ep-syntax-resolved">${syntax.resolved}</div>
          </div>
          ` : ''}
          ` : ''}
        </div>
      </div>`;
  }).join('');

  // Build right panel (derivation library)
  const activeSpec = appState.endpointSpecs[appState.activeEndpointId] || {};
  const isActiveObservation = activeSpec.conceptCategory === 'Observation';
  const activeDerivations = isActiveObservation ? [] : getMatchingDerivationTransformations(activeSpec.conceptCategory);

  const libraryContent = !activeSpec.conceptCategory
    ? '<div class="ep-library-panel-empty">Select a concept category first</div>'
    : isActiveObservation
      ? '<div class="ep-library-panel-empty">Observation concepts use direct measurement — no derivation templates</div>'
      : activeDerivations.length === 0
        ? `<div class="ep-library-panel-empty">No derivation templates for ${activeSpec.conceptCategory}</div>`
        : activeDerivations.map(d => {
            const isSelected = activeSpec.selectedDerivationOid === d.oid;
            return `
              <div class="ep-library-card ${isSelected ? 'selected' : ''}" data-derivation-oid="${d.oid}" data-ep-id="${appState.activeEndpointId}">
                <div class="ep-library-card-name">${d.name}</div>
                <div class="ep-library-card-meta">
                  ${d.usesMethod ? `<span class="badge badge-secondary" style="font-size:10px;">${d.usesMethod}</span>` : ''}
                  <span style="font-size:11px; color:var(--cdisc-text-secondary);">outputs: <code>${(d.bindings || []).find(b => b.direction === 'output')?.concept || d.outputConcept}</code></span>
                </div>
                ${d.description ? `<div class="ep-library-card-desc">${d.description.length > 100 ? d.description.slice(0, 100) + '...' : d.description}</div>` : ''}
              </div>`;
          }).join('');

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Endpoint: Variable of Interest</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
          Define what is being measured or computed for each endpoint
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-overview">&larr; Back to Overview</button>
        <button class="btn btn-primary" id="btn-proceed-analysis" ${!hasAnySpec ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
          Proceed to Analysis &rarr;
        </button>
      </div>
    </div>

    <div class="ep-split-layout">
      <div class="ep-main-content">
        ${endpointCards}
      </div>
      <div class="ep-library-panel" id="derivation-library-panel">
        <div class="ep-library-panel-title">Derivation Templates</div>
        <div id="library-cards">
          ${libraryContent}
        </div>
      </div>
    </div>

    <style>
      .ep-syntax-template {
        font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 12px;
        background: var(--cdisc-background);
        padding: 10px 14px;
        border-radius: var(--radius);
        color: var(--cdisc-text-secondary);
        letter-spacing: 0.2px;
        line-height: 1.6;
        margin-bottom: 4px;
      }
      .ep-syntax-resolved {
        font-size: 13px;
        padding: 12px 16px;
        border: 1px solid var(--cdisc-border);
        border-radius: var(--radius);
        line-height: 1.8;
        color: var(--cdisc-text);
      }
      .ep-syntax-resolved .placeholder {
        color: var(--cdisc-text-secondary);
        font-style: italic;
        background: var(--cdisc-background);
        padding: 1px 6px;
        border-radius: 3px;
      }
      .ep-syntax-resolved strong { color: var(--cdisc-primary); }
      .ep-composed-phrase {
        font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 12px;
        background: var(--cdisc-primary-light);
        padding: 10px 14px;
        border-radius: var(--radius);
        line-height: 1.6;
        border-left: 3px solid var(--cdisc-primary);
        margin-bottom: 12px;
      }
      .ep-composed-phrase .placeholder {
        color: var(--cdisc-text-secondary);
        font-style: italic;
        background: var(--cdisc-background);
        padding: 1px 6px;
        border-radius: 3px;
      }
      .ep-composed-phrase strong { color: var(--cdisc-primary); }
      .ep-placeholder-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
        margin-bottom: 12px;
      }
    </style>
  `;

  // Wire event handlers
  wireEndpointWhatEvents(container, study, selectedEps);
}

function wireEndpointWhatEvents(container, study, selectedEps) {
  // Accordion toggles — clicking header sets activeEndpointId and re-renders library
  container.querySelectorAll('.ep-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const epId = header.dataset.epId;
      const item = header.parentElement;
      const wasOpen = item.classList.contains('open');

      // Close all
      container.querySelectorAll('.ep-accordion-item').forEach(el => el.classList.remove('open'));

      if (!wasOpen) {
        item.classList.add('open');
        appState.activeEndpointId = epId;
      } else {
        appState.activeEndpointId = null;
      }

      // Update library panel
      updateLibraryPanel(container);
    });
  });

  // Concept category change
  container.querySelectorAll('.ep-concept-category').forEach(select => {
    select.addEventListener('change', () => {
      const epId = select.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].conceptCategory = select.value;
      appState.endpointSpecs[epId].selectedDerivationOid = null;
      appState.endpointSpecs[epId].selectedTransformationOid = null;
      appState.endpointSpecs[epId].selectedAnalyses = [];
      appState.endpointSpecs[epId].customInputBindings = null;
      appState.endpointSpecs[epId].activeInteractions = [];
      appState.endpointSpecs[epId].estimandSummaryPattern = null;
      appState.endpointSpecs[epId].dimensionValues = {};
      appState.endpointSpecs[epId].selectedOcFacet = null;
      appState.endpointSpecs[epId].derivationConfigValues = {};
      appState.endpointSpecs[epId].derivationDimensionValues = {};
      renderEndpointWhat(container);
    });
  });

  // Data type change
  container.querySelectorAll('.ep-data-type').forEach(select => {
    select.addEventListener('change', () => {
      const epId = select.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].dataType = select.value;
    });
  });

  // Parameter source radios
  container.querySelectorAll('.ep-param-source').forEach(radio => {
    radio.addEventListener('change', () => {
      const epId = radio.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].parameterSource = radio.value;
      renderEndpointWhat(container);
    });
  });

  // BC checkboxes
  container.querySelectorAll('.ep-bc-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = cb.dataset.epId;
      const bcId = cb.dataset.bcId;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (cb.checked) {
        if (!spec.linkedBCIds.includes(bcId)) spec.linkedBCIds.push(bcId);
      } else {
        spec.linkedBCIds = spec.linkedBCIds.filter(id => id !== bcId);
      }
      updateSyntaxPreview(container, epId, study);
    });
  });

  // BC toggle all
  container.querySelectorAll('.ep-bc-select-all').forEach(btn => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.epId;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      const checkboxes = container.querySelectorAll(`.ep-bc-checkbox[data-ep-id="${epId}"]`);
      const allChecked = [...checkboxes].every(cb => cb.checked);
      checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        const bcId = cb.dataset.bcId;
        if (!allChecked) {
          if (!spec.linkedBCIds.includes(bcId)) spec.linkedBCIds.push(bcId);
        } else {
          spec.linkedBCIds = spec.linkedBCIds.filter(id => id !== bcId);
        }
      });
      updateSyntaxPreview(container, epId, study);
    });
  });

  // Manual parameter name
  container.querySelectorAll('.ep-param-name').forEach(input => {
    input.addEventListener('input', () => {
      const epId = input.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].parameterName = input.value;
      updateSyntaxPreview(container, epId, study);
    });
  });

  // OC facet card click
  container.querySelectorAll('.ep-oc-facet-card').forEach(card => {
    card.addEventListener('click', () => {
      const epId = card.dataset.epId;
      const facet = card.dataset.facet;
      ensureSpec(epId);
      appState.endpointSpecs[epId].selectedOcFacet = facet;
      // Update highlights inline
      const allCards = container.querySelectorAll(`.ep-oc-facet-card[data-ep-id="${epId}"]`);
      allCards.forEach(c => {
        const isSel = c.dataset.facet === facet;
        c.style.borderColor = isSel ? 'var(--cdisc-primary)' : 'var(--cdisc-border)';
        c.style.background = isSel ? 'var(--cdisc-primary-light)' : 'white';
      });
      updateSyntaxPreview(container, epId, study);
    });
  });

  // Observation dimension inputs
  container.querySelectorAll('.ep-obs-dim-value').forEach(el => {
    const handler = () => {
      const epId = el.dataset.epId;
      const dim = el.dataset.dim;
      ensureSpec(epId);
      const val = el.value === '__ALL__' ? 'All visits' : el.value;
      appState.endpointSpecs[epId].dimensionValues[dim] = val;
      updateSyntaxPreview(container, epId, study);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });

  // Derivation config placeholder inputs
  container.querySelectorAll('.ep-deriv-config-value').forEach(el => {
    const handler = () => {
      const epId = el.dataset.epId;
      const key = el.dataset.configKey;
      ensureSpec(epId);
      appState.endpointSpecs[epId].derivationConfigValues[key] = el.value;
      const dimName = PLACEHOLDER_DIM_MAP[key];
      if (dimName && el.value) {
        appState.endpointSpecs[epId].dimensionValues[dimName] = el.value;
      }
      updateSyntaxPreview(container, epId, study);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });

  // Derivation dimension inputs
  container.querySelectorAll('.ep-deriv-dim-value').forEach(el => {
    const handler = () => {
      const epId = el.dataset.epId;
      const dim = el.dataset.dim;
      ensureSpec(epId);
      appState.endpointSpecs[epId].derivationDimensionValues[dim] = el.value;
      appState.endpointSpecs[epId].dimensionValues[dim] = el.value;
      updateSyntaxPreview(container, epId, study);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });

  // Library panel card clicks (derivation selection)
  container.querySelectorAll('.ep-library-card[data-derivation-oid]').forEach(card => {
    card.addEventListener('click', () => {
      const epId = card.dataset.epId;
      const oid = card.dataset.derivationOid;
      ensureSpec(epId);
      appState.endpointSpecs[epId].selectedDerivationOid = oid;
      // Reset downstream
      appState.endpointSpecs[epId].selectedTransformationOid = null;
      appState.endpointSpecs[epId].selectedAnalyses = [];
      appState.endpointSpecs[epId].customInputBindings = null;
      appState.endpointSpecs[epId].activeInteractions = [];
      appState.endpointSpecs[epId].estimandSummaryPattern = null;
      appState.endpointSpecs[epId].dimensionValues = {};
      appState.endpointSpecs[epId].derivationConfigValues = {};
      appState.endpointSpecs[epId].derivationDimensionValues = {};
      renderEndpointWhat(container);
    });
  });

  // Navigation
  container.querySelector('#btn-back-overview')?.addEventListener('click', () => navigateTo(2));
  container.querySelector('#btn-proceed-analysis')?.addEventListener('click', () => {
    if (selectedEps.some(ep => appState.endpointSpecs[ep.id]?.conceptCategory)) {
      navigateTo(4);
    }
  });
}

function updateLibraryPanel(container) {
  const activeSpec = appState.endpointSpecs[appState.activeEndpointId] || {};
  const isObservation = activeSpec.conceptCategory === 'Observation';
  const derivations = isObservation ? [] : getMatchingDerivationTransformations(activeSpec.conceptCategory);

  const libraryCards = container.querySelector('#library-cards');
  if (!libraryCards) return;

  if (!activeSpec.conceptCategory) {
    libraryCards.innerHTML = '<div class="ep-library-panel-empty">Select a concept category first</div>';
  } else if (isObservation) {
    libraryCards.innerHTML = '<div class="ep-library-panel-empty">Observation concepts use direct measurement — no derivation templates</div>';
  } else if (derivations.length === 0) {
    libraryCards.innerHTML = `<div class="ep-library-panel-empty">No derivation templates for ${activeSpec.conceptCategory}</div>`;
  } else {
    libraryCards.innerHTML = derivations.map(d => {
      const isSelected = activeSpec.selectedDerivationOid === d.oid;
      return `
        <div class="ep-library-card ${isSelected ? 'selected' : ''}" data-derivation-oid="${d.oid}" data-ep-id="${appState.activeEndpointId}">
          <div class="ep-library-card-name">${d.name}</div>
          <div class="ep-library-card-meta">
            ${d.usesMethod ? `<span class="badge badge-secondary" style="font-size:10px;">${d.usesMethod}</span>` : ''}
            <span style="font-size:11px; color:var(--cdisc-text-secondary);">outputs: <code>${(d.bindings || []).find(b => b.direction === 'output')?.concept || d.outputConcept}</code></span>
          </div>
          ${d.description ? `<div class="ep-library-card-desc">${d.description.length > 100 ? d.description.slice(0, 100) + '...' : d.description}</div>` : ''}
        </div>`;
    }).join('');

    // Re-wire library card clicks
    libraryCards.querySelectorAll('.ep-library-card[data-derivation-oid]').forEach(card => {
      card.addEventListener('click', () => {
        const epId = card.dataset.epId;
        const oid = card.dataset.derivationOid;
        ensureSpec(epId);
        appState.endpointSpecs[epId].selectedDerivationOid = oid;
        appState.endpointSpecs[epId].selectedTransformationOid = null;
        appState.endpointSpecs[epId].estimandSummaryPattern = null;
        appState.endpointSpecs[epId].dimensionValues = {};
        appState.endpointSpecs[epId].derivationConfigValues = {};
        appState.endpointSpecs[epId].derivationDimensionValues = {};
        renderEndpointWhat(container);
      });
    });
  }
}
