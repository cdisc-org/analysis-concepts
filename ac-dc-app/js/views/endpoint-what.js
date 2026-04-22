import { appState, navigateTo, rebuildSpec } from '../app.js';
import { getAllEndpoints } from '../utils/usdm-parser.js';
import { getPhraseResolvedRefs } from '../utils/concept-display.js';
import {
  ensureSpec, getConceptCategoryOptions,
  buildSyntaxTemplate, updateSyntaxPreview,
  DATA_TYPES, renderDataCube
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

  // Rebuild resolved spec so $ui fields are fresh for display-only elements
  rebuildSpec();

  const conceptOptions = getConceptCategoryOptions();
  const hasAnySpec = selectedEps.some(ep => appState.endpointSpecs[ep.id]?.conceptCategory);
  const dcModel = appState.dcModel;

  if (!appState.activeEndpointId && selectedEps.length > 0) {
    appState.activeEndpointId = selectedEps[0].id;
  }

  const endpointCards = selectedEps.map((ep) => {
    const isActive = ep.id === appState.activeEndpointId;
    const spec = appState.endpointSpecs[ep.id] || {};
    // Use pre-computed syntax from resolved spec, fall back to inline build
    const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === ep.id);
    let syntax = resolvedEp?.$ui?.syntax || null;
    if (!syntax) { try { syntax = buildSyntaxTemplate(ep, spec, study); } catch (e) { console.warn('Syntax template error:', e); } }
    const originalText = ep.text || ep.description || ep.name;

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
                  let title = '';
                  if (dcModel?.categories) {
                    for (const [, cat] of Object.entries(dcModel.categories)) {
                      if (cat.concepts?.[opt.value]?.definition) {
                        title = cat.concepts[opt.value].definition;
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
          <!-- Syntax Template + Preview -->
          ${syntax ? `
          <div id="syntax-preview-${ep.id}" style="margin-bottom:16px;">
            <div class="ep-syntax-template">${syntax.template}</div>
            <div class="ep-syntax-resolved">${syntax.resolved}</div>
          </div>
          ` : ''}

          <!-- Data Cube -->
          ${(() => { try { return renderDataCube(ep, spec, study); } catch(e) { console.error('renderDataCube error:', e); return `<div style="color:var(--cdisc-error); padding:8px; font-size:12px;">Error rendering data cube: ${e.message}</div>`; } })()}
          ` : ''}
        </div>
      </div>`;
  }).join('');

  // Smart phrase panel
  const activeSpec = appState.endpointSpecs[appState.activeEndpointId] || {};
  const smartPhrasePanel = renderSmartPhrasePanel(activeSpec);

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
      ${smartPhrasePanel}
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
    </style>
  `;

  wireEndpointWhatEvents(container, study, selectedEps);
}

/**
 * Render the smart phrase panel for the active endpoint's concept.
 */
function renderSmartPhrasePanel(spec) {
  const lib = appState.transformationLibrary;
  const smartPhrases = lib?.smartPhrases || [];
  const concept = spec.conceptCategory;

  if (!concept) {
    return `
      <div class="ep-library-panel">
        <div class="ep-library-panel-title">Smart Phrases</div>
        <div class="ep-library-panel-empty">Select a concept category to see matching smart phrases.</div>
      </div>`;
  }

  // Endpoint phrases — match by concept reference
  const endpointPhrases = smartPhrases.filter(sp =>
    sp.role === 'endpoint' && sp.references?.includes(concept)
  );

  // Dimension phrases — concrete references OR a single category reference
  const dimPhrases = smartPhrases.filter(sp =>
    sp.role && sp.role !== 'endpoint' &&
    (sp.references?.length === 1 || sp.referenceCategories?.length === 1)
  );

  const selectedEpPhrase = spec.selectedEndpointPhrase || (endpointPhrases[0]?.oid || null);
  const selectedDimPhrases = new Set(spec.selectedDimPhrases || []);
  const categoriesMap = appState.conceptCategories?.categories || {};
  const picks = spec.dimensionCategoryPicks || {};

  return `
    <div class="ep-library-panel">
      <div class="ep-library-panel-title">Smart Phrases</div>

      ${endpointPhrases.length > 0 ? `
      <div style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary); margin-bottom:6px;">Endpoint Phrases</div>
      ${endpointPhrases.map(sp => {
        const isSelected = sp.oid === selectedEpPhrase;
        return `
          <label class="ep-library-card ${isSelected ? 'selected' : ''}" style="display:flex; align-items:flex-start; gap:8px; cursor:pointer;">
            <input type="radio" name="ep-phrase" class="ep-phrase-radio" data-oid="${sp.oid}" ${isSelected ? 'checked' : ''} style="margin-top:3px;">
            <div>
              <div class="ep-library-card-name">${sp.name}</div>
              <div class="ep-library-card-desc" style="font-style:italic;">${sp.phrase_template}</div>
            </div>
          </label>`;
      }).join('')}
      ` : `
      <div class="ep-library-panel-empty">No endpoint phrases match ${concept}.</div>
      `}

      ${dimPhrases.length > 0 ? `
      <div style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary); margin-top:12px; margin-bottom:6px; padding-top:8px; border-top:1px solid var(--cdisc-border);">Dimension Phrases</div>
      ${dimPhrases.map(sp => {
        const isChecked = selectedDimPhrases.has(sp.oid);
        const concreteRef = sp.references?.[0] || '';
        const catName = sp.referenceCategories?.[0] || '';
        const category = catName ? categoriesMap[catName] : null;
        const pickedConcept = catName
          ? (picks[catName] || category?.members?.[0]?.concept || '')
          : concreteRef;
        // The checkbox's data-dim-ref carries the resolved concrete concept so
        // the handler doesn't need to re-resolve. For category-bound phrases,
        // we also add data-category so the select handler can rewrite the pick
        // and sync cubeDimensions when it changes.
        const dataDim = pickedConcept;
        const subtitle = category
          ? `<div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
               <span style="font-size:10px; color:var(--cdisc-text-secondary);">category: <code>${catName}</code></span>
               <select class="ep-category-pick" data-oid="${sp.oid}" data-category="${catName}"
                 style="font-size:11px; padding:1px 4px; border:1px solid var(--cdisc-border); border-radius:3px; background:var(--cdisc-surface);">
                 ${(category.members || []).map(m => `
                   <option value="${m.concept}" ${m.concept === pickedConcept ? 'selected' : ''}>
                     ${m.label || `${m.model}: ${m.concept}`}
                   </option>`).join('')}
               </select>
             </div>`
          : `<div style="font-size:10px; color:var(--cdisc-text-secondary);">${concreteRef}</div>`;
        return `
          <label class="ep-library-card" style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; ${isChecked ? 'border-color:var(--cdisc-accent2); background:rgba(161,208,202,0.08);' : ''}">
            <input type="checkbox" class="ep-dim-phrase-cb" data-oid="${sp.oid}" data-dim-ref="${dataDim}" data-category="${catName}" ${isChecked ? 'checked' : ''} style="margin-top:3px;">
            <div style="flex:1;">
              <div class="ep-library-card-name">${sp.name}</div>
              <div class="ep-library-card-desc" style="font-style:italic;">${sp.phrase_template}</div>
              ${subtitle}
            </div>
          </label>`;
      }).join('')}
      ` : ''}
    </div>`;
}

function wireEndpointWhatEvents(container, study, selectedEps) {
  // Accordion toggles
  container.querySelectorAll('.ep-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const epId = header.dataset.epId;
      const item = header.parentElement;
      const wasOpen = item.classList.contains('open');
      container.querySelectorAll('.ep-accordion-item').forEach(el => el.classList.remove('open'));
      if (!wasOpen) {
        item.classList.add('open');
        appState.activeEndpointId = epId;
      } else {
        appState.activeEndpointId = null;
      }
      renderEndpointWhat(container);
    });
  });

  // Concept category change
  container.querySelectorAll('.ep-concept-category').forEach(select => {
    select.addEventListener('change', () => {
      const epId = select.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].conceptCategory = select.value;
      appState.endpointSpecs[epId].cubeDimensions = [];
      appState.endpointSpecs[epId].cubeSlices = [];
      appState.endpointSpecs[epId].selectedEndpointPhrase = null;
      appState.endpointSpecs[epId].selectedDimPhrases = [];
      appState.endpointSpecs[epId].selectedDerivationOid = null;
      appState.endpointSpecs[epId].selectedTransformationOid = null;
      appState.endpointSpecs[epId].selectedAnalyses = [];
      appState.endpointSpecs[epId].linkedBCIds = [];
      appState.endpointSpecs[epId].selectedOcFacet = null;
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

  // Add dimension to cube
  container.querySelectorAll('.ep-cube-add-dim').forEach(select => {
    select.addEventListener('change', () => {
      const epId = select.dataset.epId;
      const dim = select.value;
      if (!dim) return;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (!spec.cubeDimensions) spec.cubeDimensions = [];
      if (!spec.cubeDimensions.some(d => d.dimension === dim)) {
        spec.cubeDimensions.push({ dimension: dim, sliceValue: '' });
      }
      renderEndpointWhat(container);
    });
  });

  // Remove dimension from cube
  container.querySelectorAll('.ep-cube-remove-dim').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const epId = btn.dataset.epId;
      const idx = parseInt(btn.dataset.idx, 10);
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (spec.cubeDimensions?.[idx]) {
        spec.cubeDimensions.splice(idx, 1);
      }
      renderEndpointWhat(container);
    });
  });

  // Toggle slice key on dimension tag click
  container.querySelectorAll('.ep-cube-dim-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      if (e.target.closest('.ep-cube-remove-dim')) return; // don't toggle when clicking remove
      const epId = tag.dataset.epId;
      const idx = parseInt(tag.dataset.idx, 10);
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (spec.cubeDimensions?.[idx]) {
        spec.cubeDimensions[idx].isSliceKey = !spec.cubeDimensions[idx].isSliceKey;
      }
      renderEndpointWhat(container);
    });
  });

  // Slice value change
  container.querySelectorAll('.ep-cube-slice-value').forEach(el => {
    const handler = () => {
      const epId = el.dataset.epId;
      const idx = parseInt(el.dataset.idx, 10);
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (spec.cubeDimensions?.[idx]) {
        spec.cubeDimensions[idx].sliceValue = el.value;
        // Sync to dimensionValues for syntax resolution
        if (!spec.dimensionValues) spec.dimensionValues = {};
        spec.dimensionValues[spec.cubeDimensions[idx].dimension] = el.value;
      }
      updateSyntaxPreview(container, epId, study);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });

  // Observation: OC facet select
  container.querySelectorAll('.ep-oc-facet-select').forEach(select => {
    select.addEventListener('change', () => {
      const epId = select.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].selectedOcFacet = select.value;
      appState.endpointSpecs[epId].linkedBCIds = []; // reset BCs when facet changes
      renderEndpointWhat(container);
    });
  });

  // Observation: BC checkboxes
  container.querySelectorAll('.ep-obs-bc-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = cb.dataset.epId;
      const bcId = cb.dataset.bcId;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (!spec.linkedBCIds) spec.linkedBCIds = [];
      if (cb.checked) {
        if (!spec.linkedBCIds.includes(bcId)) spec.linkedBCIds.push(bcId);
      } else {
        spec.linkedBCIds = spec.linkedBCIds.filter(id => id !== bcId);
      }
      renderEndpointWhat(container);
    });
  });

  // BC parameter picker: toggle list visibility on input focus
  container.querySelectorAll('.ep-cube-slice-value[list]').forEach(input => {
    const listEl = input.parentElement?.querySelector('.ep-bc-param-list');
    if (!listEl) return;
    input.addEventListener('focus', () => { listEl.style.display = ''; });
    input.addEventListener('blur', () => {
      // Delay to allow click on item
      setTimeout(() => { listEl.style.display = 'none'; }, 200);
    });
  });

  // BC parameter picker: click item to select
  container.querySelectorAll('.ep-bc-param-item').forEach(item => {
    item.addEventListener('click', () => {
      const epId = item.dataset.epId;
      const idx = parseInt(item.dataset.idx, 10);
      const bcName = item.dataset.bcName;
      const bcId = item.dataset.bcId;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (spec.cubeDimensions?.[idx]) {
        spec.cubeDimensions[idx].sliceValue = bcName;
        spec.cubeDimensions[idx].linkedBCId = bcId;
        if (!spec.dimensionValues) spec.dimensionValues = {};
        spec.dimensionValues[spec.cubeDimensions[idx].dimension] = bcName;
      }
      renderEndpointWhat(container);
    });
  });

  // Smart phrase: endpoint phrase radio
  container.querySelectorAll('.ep-phrase-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      const epId = appState.activeEndpointId;
      if (!epId) return;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      spec.selectedEndpointPhrase = radio.dataset.oid;

      // Auto-add dimensions implied by phrase placeholders (e.g., {parameter} → Parameter)
      const lib = appState.transformationLibrary;
      const sp = (lib?.smartPhrases || []).find(s => s.oid === radio.dataset.oid);
      if (sp?.references) {
        if (!spec.cubeDimensions) spec.cubeDimensions = [];
        // Build set of known concepts to skip (only add dimension references)
        const dcCats = appState.dcModel?.categories || {};
        const conceptNames = new Set();
        for (const cat of Object.values(dcCats)) {
          for (const name of Object.keys(cat.concepts || {})) conceptNames.add(name);
        }
        for (const ref of sp.references) {
          if (conceptNames.has(ref) || ref.startsWith('M.')) continue;
          if (!spec.cubeDimensions.some(d => d.dimension === ref)) {
            spec.cubeDimensions.push({ dimension: ref, sliceValue: '' });
          }
        }
      }
      renderEndpointWhat(container);
    });
  });

  // Smart phrase: dimension phrase checkbox
  container.querySelectorAll('.ep-dim-phrase-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = appState.activeEndpointId;
      if (!epId) return;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (!spec.selectedDimPhrases) spec.selectedDimPhrases = [];
      const dimRef = cb.dataset.dimRef;

      if (cb.checked) {
        if (!spec.selectedDimPhrases.includes(cb.dataset.oid)) {
          spec.selectedDimPhrases.push(cb.dataset.oid);
        }
        // Auto-add the dimension to cube if not already there
        if (!spec.cubeDimensions) spec.cubeDimensions = [];
        if (dimRef && !spec.cubeDimensions.some(d => d.dimension === dimRef)) {
          spec.cubeDimensions.push({ dimension: dimRef, sliceValue: '' });
        }
      } else {
        spec.selectedDimPhrases = spec.selectedDimPhrases.filter(id => id !== cb.dataset.oid);
        // Remove the dimension from cube
        if (dimRef && spec.cubeDimensions) {
          spec.cubeDimensions = spec.cubeDimensions.filter(d => d.dimension !== dimRef);
        }
      }
      renderEndpointWhat(container);
    });
  });

  // Smart phrase: category pick (e.g. VisitDimension → Visit | AnalysisVisit)
  container.querySelectorAll('.ep-category-pick').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = appState.activeEndpointId;
      if (!epId) return;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      const catName = sel.dataset.category;
      const newConcept = sel.value;
      if (!catName || !newConcept) return;
      if (!spec.dimensionCategoryPicks) spec.dimensionCategoryPicks = {};
      const oldConcept = spec.dimensionCategoryPicks[catName] || null;
      spec.dimensionCategoryPicks[catName] = newConcept;

      // If the phrase is already checked, swap the stale concrete reference
      // in cubeDimensions for the new one (preserve any sliceValue).
      const phraseOid = sel.dataset.oid;
      const isChecked = (spec.selectedDimPhrases || []).includes(phraseOid);
      if (isChecked && oldConcept && oldConcept !== newConcept) {
        if (!spec.cubeDimensions) spec.cubeDimensions = [];
        const idx = spec.cubeDimensions.findIndex(d => d.dimension === oldConcept);
        if (idx >= 0) {
          spec.cubeDimensions[idx] = { ...spec.cubeDimensions[idx], dimension: newConcept };
          if (spec.dimensionValues && spec.dimensionValues[oldConcept] !== undefined) {
            spec.dimensionValues[newConcept] = spec.dimensionValues[oldConcept];
            delete spec.dimensionValues[oldConcept];
          }
        } else if (!spec.cubeDimensions.some(d => d.dimension === newConcept)) {
          spec.cubeDimensions.push({ dimension: newConcept, sliceValue: '' });
        }
      }
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
