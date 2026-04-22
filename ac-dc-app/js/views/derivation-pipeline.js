import { appState, navigateTo, rebuildSpec } from '../app.js';
import { getAllEndpoints, getDerivationBCTopicDecode, getDerivationBCUnit } from '../utils/usdm-parser.js';
import {
  buildPipelineGraph, getUnresolvedConcepts, orderChainPostOrder
} from '../utils/transformation-linker.js';
import { displayConcept, normalizeConcept, buildSliceLookup, resolveSliceCategories } from '../utils/concept-display.js';
import { getSpecParameterValue } from './endpoint-spec.js';
import { isNumericOutputConcept } from '../utils/concept-classifier.js';
import { loadMethod } from '../data-loader.js';

/* ─── Module-level UI state (not persisted) ─── */
let activeNodeKey = null;

/* ─── Helpers ─── */

/**
 * Find a PipelineSlot by key in the recursive tree.
 */
function findSlotByKey(slots, key) {
  for (const slot of slots) {
    if (slot.key === key) return slot;
    if (slot.children?.length) {
      const found = findSlotByKey(slot.children, key);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find the first unresolved or unconfirmed slot (depth-first).
 */
function findFirstUnresolved(slots, confirmedTerminals, activeSpec) {
  const confirmedKeys = new Set((confirmedTerminals || []).map(t => t.slotKey));
  const refKeys = new Set((activeSpec?.pipelineReferences || []).map(r => r.slotKey));
  function walk(list) {
    for (const slot of list) {
      if (refKeys.has(slot.key)) continue; // reference slots are resolved
      if (slot.status === 'terminal' && !confirmedKeys.has(slot.key)) return slot;
      if ((slot.status === 'choice' || slot.status === 'auto') && !slot.selected) return slot;
      if (slot.children?.length) {
        const found = walk(slot.children);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(slots);
}

/**
 * Collect resolved pipeline outputs that produce a given concept.
 * Returns sibling slots (and their ancestors) that have a selected derivation
 * outputting the target concept. Used to offer "reference from pipeline" options.
 */
function getResolvedPipelineOutputs(slots, targetConcept, excludeKey, activeSpec) {
  const results = [];
  const confirmedRefs = new Set((activeSpec.pipelineReferences || []).map(r => r.slotKey));

  function walk(list) {
    for (const slot of list) {
      // Skip the slot we're resolving and its ancestors
      if (slot.key === excludeKey) continue;
      // A resolved slot that outputs the target concept
      if (slot.selected && slot.concept === targetConcept && !confirmedRefs.has(slot.key)) {
        const outputBinding = (slot.selected.bindings || []).find(b => b.direction === 'output');
        if (outputBinding?.concept === targetConcept || slot.selected.instanceOf === targetConcept) {
          results.push({
            slotKey: slot.key,
            concept: slot.concept,
            methodRole: slot.methodRole,
            derivationName: slot.selected.name,
            derivationOid: slot.selected.oid,
            slice: slot.slice || ''
          });
        }
      }
      if (slot.children?.length) walk(slot.children);
    }
  }
  walk(slots);
  return results;
}

/**
 * Check if a slot is resolved via a pipeline reference.
 */
function isReferenceSlot(slotKey, activeSpec) {
  return (activeSpec.pipelineReferences || []).some(r => r.slotKey === slotKey);
}

/**
 * Get the reference info for a slot.
 */
function getReferenceInfo(slotKey, activeSpec) {
  return (activeSpec.pipelineReferences || []).find(r => r.slotKey === slotKey) || null;
}

/**
 * Build the set of auto-confirmed dimension names from the DC model.
 * A dimension is auto-confirmed when its sharedDimensions entry has
 * `autoConfirm: true` (see model/concept/Option_B_Clinical.json).
 */
function getAutoConfirmDimensions(dcModel) {
  const shared = dcModel?.sharedDimensions || {};
  const set = new Set();
  for (const [name, def] of Object.entries(shared)) {
    if (def && typeof def === 'object' && def.autoConfirm === true) set.add(name);
  }
  return set;
}

/**
 * Auto-confirm standard dimension terminals that always come from source data.
 * The auto-confirm vocabulary is declared by dcModel.sharedDimensions[*].autoConfirm.
 */
function autoConfirmStandardDimensions(slots, activeSpec) {
  const autoConfirm = getAutoConfirmDimensions(appState.dcModel);
  for (const slot of slots) {
    if (slot.dataStructureRole === 'dimension' && autoConfirm.has(slot.concept)) {
      const already = (activeSpec.confirmedTerminals || []).some(t => t.slotKey === slot.key);
      if (!already) {
        activeSpec.confirmedTerminals.push({
          slotKey: slot.key,
          concept: slot.concept,
          roleLabel: slot.methodRole || ''
        });
      }
    }
  }
}

/**
 * Render the BC property picker for a terminal measure node.
 */
function renderTerminalBCPicker(slot, activeSpec) {
  if (slot.dataStructureRole === 'dimension') return '';

  const study = appState.selectedStudy;
  const mapping = appState.bcOcInstanceMapping;
  if (!study) return '';

  const studyVersion = study.versions?.[0] || study;
  const studyBCs = studyVersion.biomedicalConcepts || [];
  if (studyBCs.length === 0) return '';

  // Filter BCs that have Result.Value with compatible type
  // Any DC concept whose result.valueType includes 'NumericValue' needs
  // Quantity-typed BCs; others accept any Result.Value type.
  const isNumericConcept = isNumericOutputConcept(slot.concept, appState.dcModel);
  const compatibleBCs = [];
  const matchedStudyBCIds = new Set();

  if (mapping) {
    for (const bcMapping of mapping.bcMappings || []) {
      const hasCompatibleValue = bcMapping.propertyMappings.some(p =>
        p.ocFacet === 'Result.Value' && (isNumericConcept ? p.ocValueType === 'Quantity' : true)
      );
      if (hasCompatibleValue) {
        const studyBC = studyBCs.find(bc => bc.id === bcMapping.bcId || bc.name === bcMapping.bcName);
        if (studyBC) {
          matchedStudyBCIds.add(studyBC.id);
          compatibleBCs.push({
            id: studyBC.id,
            name: studyBC.name,
            displayName: studyBC.label || studyBC.name,
            code: bcMapping.bcCode
          });
        }
      }
    }
  }

  // Include study BCs that weren't matched by the external mapping —
  // the study may define BCs at a different granularity or with different IDs
  for (const bc of studyBCs) {
    if (matchedStudyBCIds.has(bc.id)) continue;
    compatibleBCs.push({
      id: bc.id,
      name: bc.name,
      displayName: bc.label || bc.name,
      code: ''
    });
  }

  if (compatibleBCs.length === 0) return '';

  // Derivation terminals aren't tied to collection Activities — show a
  // flat, alphabetically-sorted list by clinical label.
  const sortedBCs = [...compatibleBCs].sort(
    (a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
  );

  // Get currently linked BCs for this terminal
  const termEntry = (activeSpec.confirmedTerminals || []).find(t => t.slotKey === slot.key);
  const linkedIds = new Set(termEntry?.linkedBCIds || []);

  let html = `
    <div class="config-panel-section">
      <div class="config-panel-section-title">Source Data: Biomedical Concepts</div>
      <div style="font-size:12px; color:var(--cdisc-text-secondary); margin-bottom:6px;">
        Select which BC observations provide <code>${displayConcept(slot.concept)}</code> data:
      </div>
      <div class="terminal-bc-list">`;

  for (const bc of sortedBCs) {
    const checked = linkedIds.has(bc.id) ? 'checked' : '';
    const showMnemonic = bc.name && bc.name !== bc.displayName;
    html += `
      <label class="terminal-bc-item">
        <input type="checkbox" class="terminal-bc-checkbox" data-slot-key="${slot.key}" data-bc-id="${bc.id}" data-concept="${slot.concept || ''}" ${checked}>
        ${bc.displayName || bc.name}
        ${showMnemonic ? `<span style="font-size:10px; color:var(--cdisc-text-secondary); font-family:monospace; margin-left:6px;">${bc.name}</span>` : ''}
        <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-left:auto;">${bc.code || ''}</span>
      </label>`;
  }

  html += `</div></div>`;
  return html;
}

/**
 * Auto-select single-candidate derivations that aren't yet in the chain.
 * Returns true if any were added (requires re-building the tree).
 */
function autoSelectSingleCandidates(slots, activeSpec) {
  let added = false;
  function walk(list) {
    for (const slot of list) {
      if (slot.status === 'auto' && slot.selected) {
        const already = (activeSpec.derivationChain || []).some(e => e.slotKey === slot.key);
        if (!already) {
          activeSpec.derivationChain.push({
            slotKey: slot.key,
            concept: slot.concept,
            derivationOid: slot.selected.oid
          });
          activeSpec.selectedDerivations[slot.key] = slot.selected.oid;
          added = true;
        }
      }
      if (slot.children?.length) walk(slot.children);
    }
  }
  walk(slots);
  return added;
}

/**
 * Check if derivation pipeline is complete for a given endpoint spec.
 */
function isDerivationComplete(spec, lib) {
  if (!spec?.selectedTransformationOid) return false;
  const transform = lib?.analysisTransformations?.find(t => t.oid === spec.selectedTransformationOid);
  if (!transform) return false;
  const unresolved = getUnresolvedConcepts(transform, spec.derivationChain || [], lib);
  const confirmedKeys = new Set((spec.confirmedTerminals || []).map(t => t.slotKey));
  const refKeys = new Set((spec.pipelineReferences || []).map(r => r.slotKey));
  return unresolved.every(s => {
    if (confirmedKeys.has(s.slotKey)) return true;
    if (refKeys.has(s.slotKey)) return true;
    return (spec.derivationChain || []).some(e => e.slotKey === s.slotKey);
  });
}

/**
 * Remove all downstream derivation chain entries and confirmed terminals
 * that were children of a removed derivation.
 */
function removeDownstream(derivation, lib, spec) {
  const derivations = lib.derivationTransformations || [];
  const inputBindings = (derivation.bindings || []).filter(b => b.direction !== 'output');
  const conceptCount = new Map();

  for (let i = 0; i < inputBindings.length; i++) {
    const ic = normalizeConcept(inputBindings[i]);
    const idx = conceptCount.get(ic) || 0;
    conceptCount.set(ic, idx + 1);
    const childSlotKey = `${derivation.oid}/${ic}/${idx}`;

    const termIdx = spec.confirmedTerminals.findIndex(t => t.slotKey === childSlotKey);
    if (termIdx !== -1) spec.confirmedTerminals.splice(termIdx, 1);

    const chainIdx = spec.derivationChain.findIndex(e => e.slotKey === childSlotKey);
    if (chainIdx !== -1) {
      const entry = spec.derivationChain[chainIdx];
      const childDeriv = derivations.find(d => d.oid === entry.derivationOid);
      spec.derivationChain.splice(chainIdx, 1);
      delete spec.selectedDerivations[childSlotKey];
      if (childDeriv) removeDownstream(childDeriv, lib, spec);
    }
  }
}

/* ─── Tree Rendering ─── */

function getNodeStatusClass(slot, confirmedKeys, refKeys) {
  const isDim = slot.dataStructureRole === 'dimension';
  if (refKeys?.has(slot.key)) return isDim ? 'dimension confirmed' : 'resolved';
  if (slot.status === 'terminal') {
    if (isDim) return confirmedKeys.has(slot.key) ? 'dimension confirmed' : 'dimension';
    return confirmedKeys.has(slot.key) ? 'terminal confirmed' : 'terminal';
  }
  if (slot.selected) return isDim ? 'dimension confirmed' : 'resolved';
  if (slot.status === 'choice') return 'pending';
  return isDim ? 'dimension' : '';
}

function getNodeStatusIcon(slot, confirmedKeys, refKeys) {
  if (refKeys?.has(slot.key)) return ' <span class="pipeline-check">&#10003;</span>';
  if (slot.selected) return ' <span class="pipeline-check">&#10003;</span>';
  if (slot.status === 'terminal' && confirmedKeys.has(slot.key)) return ' <span class="pipeline-check">&#10003;</span>';
  if (slot.status === 'terminal') return ' <span style="color:var(--cdisc-text-secondary);">&#9675;</span>';
  if (slot.status === 'choice') return ' <span style="color:var(--cdisc-warning);">&#9679;</span>';
  return '';
}

/**
 * Recursively render a tree node and its children.
 */
function renderTreeNode(slot, activeKey, confirmedKeys, refKeys, activeSpec) {
  const isActive = slot.key === activeKey;
  const ref = getReferenceInfo(slot.key, activeSpec);
  const statusClass = getNodeStatusClass(slot, confirmedKeys, refKeys);
  const statusIcon = getNodeStatusIcon(slot, confirmedKeys, refKeys);
  const roleLabel = slot.methodRole ? `<div class="pipeline-node-sub">${slot.methodRole}</div>` : '';
  const sliceLabel = slot.slice ? `<div class="pipeline-node-sub" style="color:var(--cdisc-accent2); font-size:10px;">${slot.slice}</div>` : '';

  // Reference nodes show the reference target instead of selected derivation
  let selectedName = '';
  if (ref) {
    selectedName = `<div class="pipeline-node-sub" style="color:var(--cdisc-primary); font-size:10px;">&#8594; ref: ${ref.referenceLabel || ref.referenceSlotKey}</div>`;
  } else if (slot.selected) {
    selectedName = `<div class="pipeline-node-sub" style="color:var(--cdisc-accent6);">${slot.selected.name || ''}</div>`;
  }

  const nodeHtml = `
    <div class="pipeline-node pipeline-tree-node ${statusClass} ${isActive ? 'pipeline-node-highlight' : ''}"
         data-slot-key="${slot.key}">
      <div class="pipeline-node-title">${displayConcept(slot.concept)}${statusIcon}</div>
      ${roleLabel}
      ${selectedName}
      ${sliceLabel}
    </div>`;

  // Reference nodes have no children — they point to another branch
  if (ref || !slot.children || slot.children.length === 0) {
    return `<div class="pipeline-tree-branch">${nodeHtml}</div>`;
  }

  const childrenHtml = slot.children.map(c => renderTreeNode(c, activeKey, confirmedKeys, refKeys, activeSpec)).join('');

  return `
    <div class="pipeline-tree-branch">
      ${nodeHtml}
      <div class="pipeline-tree-connector-down"></div>
      <div class="pipeline-tree-children">
        ${childrenHtml}
      </div>
    </div>`;
}

/**
 * Render derivation method configuration panel (target_unit, precision, etc.)
 * Reads configs from the cached method definition, stores values in derivationConfigValues.
 */
function renderDerivationConfigPanel(derivation, slot, activeSpec) {
  const methodOid = derivation.usesMethod;
  if (!methodOid) return '';

  const methodDef = appState.methodsCache?.[methodOid];
  if (!methodDef) {
    // Trigger async load; re-render will pick it up once cached
    loadMethod(appState, methodOid).then(() => {
      const pipelineEl = document.querySelector('.pipeline-3zone');
      if (pipelineEl?.parentElement) renderDerivationPipeline(pipelineEl.parentElement);
    }).catch(err => console.error('loadMethod failed:', methodOid, err));
    return `<div class="config-panel-section">
      <div class="config-panel-section-title">Method Configuration</div>
      <p style="font-size:12px; color:var(--cdisc-text-secondary);">Loading ${methodOid}...</p>
    </div>`;
  }

  const configs = methodDef.configurations || [];

  // Get saved values for this slot
  if (!activeSpec.derivationConfigValues) activeSpec.derivationConfigValues = {};
  const savedValues = activeSpec.derivationConfigValues[slot.key] || {};

  if (configs.length === 0) return '';
  // Also check transformation-level defaults
  const txDefaults = {};
  for (const mc of derivation.methodConfigurations || []) {
    txDefaults[mc.configurationName] = mc.value;
  }

  // Build unit options from unit_conversions vocabulary (for target_unit / source_unit)
  const allUnitOptions = (appState.unitConversions?.units || [])
    .map(u => ({ code: u.code, name: u.name, display: u.display, dimension: u.dimension }));

  // Filter units by BC dimension when a BC is linked
  const bcUnitInfo = getDerivationBCUnit(activeSpec, slot.key, appState.selectedStudy);
  let filteredUnitOptions = allUnitOptions;
  let bcUnitBadge = '';
  if (bcUnitInfo) {
    // Match the BC label (e.g., "Weight") against unit vocabulary dimensions
    // "Weight" → mass, "Height" → length. Use the BC's unit decode which contains the keyword.
    const bcLabel = (bcUnitInfo.bcName || '').toLowerCase();
    const unitDecode = (bcUnitInfo.decode || '').toLowerCase();
    const matchDim = allUnitOptions.find(u => {
      const dim = u.dimension.toLowerCase();
      return unitDecode.includes(dim) || bcLabel.includes(dim)
        || (dim === 'mass' && (bcLabel.includes('weight') || unitDecode.includes('weight')))
        || (dim === 'length' && (bcLabel.includes('height') || unitDecode.includes('height')));
    });
    if (matchDim) {
      filteredUnitOptions = allUnitOptions.filter(u => u.dimension === matchDim.dimension);
      bcUnitBadge = `<span style="font-size:10px;color:var(--cdisc-primary);margin-left:6px;">filtered by BC: ${bcUnitInfo.bcName}</span>`;
    }
  }

  const UNIT_LIKE_CONFIGS = ['target_unit', 'source_unit'];

  const configHtml = configs.map(cfg => {
    const saved = savedValues[cfg.name];
    const txDefault = txDefaults[cfg.name];
    const value = saved != null ? saved : (txDefault != null ? txDefault : cfg.defaultValue);

    if (UNIT_LIKE_CONFIGS.includes(cfg.name)) {
      const unitOptions = filteredUnitOptions;
      const dims = [...new Set(unitOptions.map(u => u.dimension))];
      return `<div class="config-field">
        <label class="config-label">${cfg.name.replace(/_/g, ' ')}${bcUnitBadge}</label>
        <select class="config-select deriv-config-input" data-slot-key="${slot.key}" data-config-key="${cfg.name}">
          <option value="">Select target unit...</option>
          ${dims.map(dim => `
            <optgroup label="${dim}">
              ${unitOptions.filter(u => u.dimension === dim).map(u =>
                `<option value="${u.name}" ${u.name === value ? 'selected' : ''}>${u.display} (${u.name})</option>`
              ).join('')}
            </optgroup>
          `).join('')}
        </select>
        ${cfg.description ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px;">${cfg.description}</div>` : ''}
      </div>`;
    }

    if (cfg.enumValues?.length > 0) {
      return `<div class="config-field">
        <label class="config-label">${cfg.name.replace(/_/g, ' ')}</label>
        <select class="config-select deriv-config-input" data-slot-key="${slot.key}" data-config-key="${cfg.name}">
          ${cfg.enumValues.map(v => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        ${cfg.description ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px;">${cfg.description}</div>` : ''}
      </div>`;
    }

    return `<div class="config-field">
      <label class="config-label">${cfg.name.replace(/_/g, ' ')}</label>
      <input class="config-input deriv-config-input" data-slot-key="${slot.key}" data-config-key="${cfg.name}"
        value="${value != null ? value : ''}" placeholder="${cfg.description || ''}">
      ${cfg.description ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px;">${cfg.description}</div>` : ''}
    </div>`;
  }).join('');

  return `
  <div class="config-panel-section" style="margin-top:12px;">
    <div class="config-panel-section-title">Method Configuration (${methodOid})</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px;">
      ${configHtml}
    </div>
  </div>`;
}

/**
 * Render the full dependency tree with the analysis transformation as root.
 */
function renderTree(transformation, slots, activeKey, confirmedTerminals, activeSpec) {
  const confirmedKeys = new Set((confirmedTerminals || []).map(t => t.slotKey));
  const refKeys = new Set((activeSpec?.pipelineReferences || []).map(r => r.slotKey));

  const rootHtml = `
    <div class="pipeline-node pipeline-tree-node active ${activeKey === '__root__' ? 'pipeline-node-highlight' : ''}"
         data-slot-key="__root__">
      <div class="pipeline-node-title">${transformation.name}</div>
      <div class="pipeline-node-sub">${transformation.usesMethod}</div>
      <div class="pipeline-node-sub" style="color:var(--cdisc-accent6);">${transformation.acCategory || ''}</div>
    </div>`;

  if (slots.length === 0) {
    return `<div class="pipeline-tree"><div class="pipeline-tree-root">${rootHtml}</div></div>`;
  }

  const childrenHtml = slots.map(s => renderTreeNode(s, activeKey, confirmedKeys, refKeys, activeSpec)).join('');

  return `
    <div class="pipeline-tree">
      <div class="pipeline-tree-root">
        ${rootHtml}
        <div class="pipeline-tree-connector-down"></div>
        <div class="pipeline-tree-children">
          ${childrenHtml}
        </div>
      </div>
    </div>`;
}

/* ─── Execution Order Panel ─── */

/**
 * Render a numbered execution-order list of the derivations in post-order
 * (leaves first, analysis root last) — the actual order the R engine runs.
 */
function renderExecutionOrderPanel(slots, activeSpec, lib, transformation) {
  const chain = activeSpec?.derivationChain || [];
  if (chain.length === 0) return '';

  const sorted = orderChainPostOrder(slots, chain, activeSpec?.pipelineReferences || []);
  const derivations = lib?.derivationTransformations || [];
  const analysisTx = transformation;

  const rowHtml = sorted.map((entry, i) => {
    const d = derivations.find(x => x.oid === entry.derivationOid);
    const name = d?.name || entry.derivationOid;
    const method = d?.usesMethod || '';
    const role = entry.slotKey.split('/').slice(-2, -1)[0] || '';
    return `
      <div style="display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid var(--cdisc-border);">
        <div style="font-size:11px; font-weight:700; color:var(--cdisc-text-secondary); text-align:right;">${i + 1}.</div>
        <div>
          <div style="font-size:12px; color:var(--cdisc-text);">${name}</div>
          <div style="font-size:10px; color:var(--cdisc-text-secondary);">concept: <code>${entry.concept}</code></div>
        </div>
        <span class="badge badge-secondary" style="font-size:10px;">${method}</span>
      </div>`;
  }).join('');

  const total = sorted.length + 1;
  return `
    <div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--cdisc-border);">
      <div style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary); margin-bottom:6px;">
        Execution Order (${total} step${total === 1 ? '' : 's'})
      </div>
      ${rowHtml}
      <div style="display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:8px; padding:4px 0;">
        <div style="font-size:11px; font-weight:700; color:var(--cdisc-success); text-align:right;">${sorted.length + 1}.</div>
        <div>
          <div style="font-size:12px; font-weight:600; color:var(--cdisc-text);">${analysisTx?.name || 'Analysis'}</div>
          <div style="font-size:10px; color:var(--cdisc-text-secondary);">analysis root</div>
        </div>
        <span class="badge badge-secondary" style="font-size:10px;">${analysisTx?.usesMethod || ''}</span>
      </div>
    </div>`;
}

/* ─── Config Panel (Middle Zone) ─── */

function renderNodeConfigPanel(slot, transformation, lib, activeSpec) {
  const study = appState.selectedStudy;
  const paramValue = getSpecParameterValue(appState.activeEndpointId, activeSpec, study);

  // Resolve slices from the context transformation (analysis or derivation)
  const namedSlices = buildSliceLookup(transformation);

  // Ancestor slices: every derivation in the chain contributes its own slices
  // to the lookup so that a slot inheriting a `slice: "..."` from a parent
  // binding (e.g. subtrahend of ChangeFromBaseline) can resolve that slice's
  // definition even when its own selected derivation (Total Score) doesn't
  // declare it.
  const ancestorSlices = {};
  for (const entry of (activeSpec.derivationChain || [])) {
    const d = lib?.derivationTransformations?.find(x => x.oid === entry.derivationOid);
    if (d) Object.assign(ancestorSlices, buildSliceLookup(d));
  }

  // Merge derivation slices into lookup when viewing a derivation node
  function getSliceLookup(derivTransform) {
    const derivSlices = buildSliceLookup(derivTransform);
    return { ...namedSlices, ...ancestorSlices, ...derivSlices };
  }

  // Resolve sliceKey constraints (e.g., Parameter from biomedicalConcept)
  function resolveSliceKeyValue(concept) {
    const sliceKey = (transformation.sliceKeys || []).find(sk => sk.dimension === concept);
    if (!sliceKey) return null;
    if (sliceKey.source === 'biomedicalConcept' && paramValue) return paramValue;
    if (sliceKey.source === 'visit' && activeSpec.visitValue) return activeSpec.visitValue;
    if (sliceKey.source === 'population' && activeSpec.populationValue) return activeSpec.populationValue;
    return null;
  }

  /**
   * Render a single binding row with annotations (slice, parameter constraint, endpoint link).
   */
  function renderBindingRow(b, sliceLookup, isEditable, index) {
    // If the binding references a conceptCategory, resolve to the user's pick
    // (per-endpoint override); otherwise fall back to the first member. The
    // concrete concept is what gets displayed and eventually sent to the engine.
    const categoryName = b.conceptCategory;
    const category = categoryName
      ? appState.conceptCategories?.categories?.[categoryName] : null;
    const override = categoryName && slot?.key
      ? activeSpec?.dimensionOverrides?.[slot.key]?.[index]?.concept
      : null;
    // Endpoint-level pick (Step 3) is the default across the whole pipeline
    // for this category; per-slot override (Step 6) trumps it when set.
    const endpointPick = categoryName
      ? activeSpec?.dimensionCategoryPicks?.[categoryName] : null;
    const categoryDefault = category?.members?.[0]?.concept;
    const effectiveConcept = override || endpointPick || b.concept || categoryDefault || categoryName || '';
    const concept = displayConcept(effectiveConcept);
    const typeBadge = `<span class="badge ${b.dataStructureRole === 'dimension' ? 'badge-teal' : 'badge-blue'}">${b.dataStructureRole || 'measure'}</span>`;

    // Category picker — user selects a concrete concept from the category's members
    let categoryPicker = '';
    if (category && isEditable) {
      categoryPicker = `
        <div style="margin-top:4px; display:flex; align-items:center; gap:6px;">
          <span style="font-size:10px; color:var(--cdisc-text-secondary); min-width:80px;">category: <code>${categoryName}</code></span>
          <select class="deriv-category-picker" data-slot-key="${slot?.key || ''}" data-binding-idx="${index}"
            style="font-size:11px; padding:2px 6px; flex:1; border:1px solid var(--cdisc-border); border-radius:3px;">
            ${category.members.map(m => `
              <option value="${m.concept}" ${m.concept === effectiveConcept ? 'selected' : ''}>
                ${m.label || `${m.model}: ${m.concept}`}
              </option>`).join('')}
          </select>
        </div>`;
    } else if (category) {
      categoryPicker = `<div style="font-size:10px; color:var(--cdisc-text-secondary); margin-top:2px;">category: <code>${categoryName}</code> → ${effectiveConcept}</div>`;
    }

    // Slice annotation + optional editor.
    // Slice constraints may use `conceptCategory` instead of a concrete
    // `dimension`; resolve those via the same dimensionOverrides picked on
    // bindings (e.g. VisitDimension → Visit | AnalysisVisit).
    let sliceAnnotation = '';
    if (b.slice && sliceLookup[b.slice]) {
      const rawSliceDef = sliceLookup[b.slice];
      const categoriesMap = appState.conceptCategories?.categories || {};
      const slotOverrides = slot?.key
        ? (activeSpec?.dimensionOverrides?.[slot.key] || {})
        : {};
      const ownerBindings = slot?.selected?.bindings || transformation?.bindings || [];
      const sliceDef = rawSliceDef.categoryConstraints
        ? resolveSliceCategories(rawSliceDef, slotOverrides, ownerBindings, categoriesMap)
        : { ...rawSliceDef, categoryBy: {} };
      const dims = sliceDef.fixedDimensions || sliceDef;
      const categoryBy = sliceDef.categoryBy || {};

      // USDM encounters (for the VisitDimension combobox datalist)
      const encounters = (study?.encounters || [])
        .map(e => ({ value: e.label || e.name || '', desc: e.description || e.type || '' }))
        .filter(e => e.value);

      if (isEditable) {
        const overrides = activeSpec?.derivationSliceOverrides?.[slot?.key]?.[b.slice] || {};
        sliceAnnotation = `
          <div style="margin-top:4px; padding:6px 8px; background:rgba(161,208,202,0.08); border-radius:4px;">
            <div style="font-size:10px; font-weight:600; color:var(--cdisc-accent2); margin-bottom:4px;">Slice: ${b.slice}</div>
            ${Object.entries(dims).map(([dim, defaultVal]) => {
              const currentVal = overrides[dim] ?? defaultVal;
              const fromCategory = categoryBy[dim]; // e.g. "VisitDimension"
              // Render a combobox (input + datalist of USDM encounters) when the
              // dimension was resolved from a VisitDimension category. Users can
              // still type any free-text value — encounter labels are only
              // suggestions because USDM labels may diverge from dataset values.
              const listId = fromCategory
                ? `enc-${(slot?.key || '').replace(/[^\w-]/g, '_')}-${b.slice}-${dim}`
                : null;
              const listAttr = listId ? ` list="${listId}"` : '';
              const datalistHtml = listId
                ? `<datalist id="${listId}">
                     ${encounters.map(e => `<option value="${e.value}"${e.desc ? ` label="USDM: ${e.desc.replace(/"/g, '&quot;')}"` : ''}>`).join('')}
                   </datalist>`
                : '';
              const label = fromCategory ? `${dim} <span style="opacity:0.6">(${fromCategory})</span>` : dim;
              return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                <span style="font-size:10px; min-width:100px; color:var(--cdisc-text-secondary);">${label}</span>
                <input class="deriv-slice-override" data-slot-key="${slot?.key || ''}" data-slice="${b.slice}" data-dim="${dim}"
                  value="${currentVal}" placeholder="${defaultVal}"${listAttr}
                  style="font-size:11px; padding:2px 6px; flex:1; border:1px solid var(--cdisc-border); border-radius:3px;">
                ${datalistHtml}
              </div>`;
            }).join('')}
          </div>`;
      } else {
        const dimStr = Object.entries(dims).map(([k, v]) => {
          const cat = categoryBy[k] ? ` (${categoryBy[k]})` : '';
          return `${k}${cat} = ${v}`;
        }).join(', ');
        sliceAnnotation = `<div style="font-size:10px; color:var(--cdisc-accent2); margin-top:2px;">slice: ${b.slice} &rarr; ${dimStr}</div>`;
      }
    }

    // SliceKey constraint annotation (e.g., Parameter = Adas-Cog)
    let constraintAnnotation = '';
    if (b.dataStructureRole === 'dimension' && b.methodRole === 'constraint') {
      // Try to resolve BC constraint — scan all terminals for linked BCs
      const terminals = activeSpec?.confirmedTerminals || [];
      console.log('[BC constraint] slot:', slot?.key, 'terminals:', terminals.map(t => `${t.slotKey}(bc:${(t.linkedBCIds||[]).join(',')})`));
      let bcInfo = getDerivationBCTopicDecode(activeSpec, slot?.key, study);
      console.log('[BC constraint] direct lookup:', bcInfo);
      if (!bcInfo) {
        for (const term of terminals) {
          if (term.linkedBCIds?.length) {
            bcInfo = getDerivationBCTopicDecode(activeSpec, term.slotKey, study);
            console.log('[BC constraint] terminal', term.slotKey, '→', bcInfo);
            if (bcInfo) break;
          }
        }
      }
      if (bcInfo) {
        constraintAnnotation = `<div style="margin-top:4px;">
          <span class="badge" style="background:var(--cdisc-primary-light);color:var(--cdisc-primary);font-size:11px;padding:2px 8px;border-radius:10px;">
            ${bcInfo.decode} &larr; BC: ${bcInfo.bcName}
          </span>
        </div>`;
      }
      // Fallback: sliceKey-based resolution (e.g., Parameter = BC name)
      if (!constraintAnnotation) {
        const resolved = resolveSliceKeyValue(b.concept);
        if (resolved) {
          constraintAnnotation = `<div style="margin-top:4px;">
            <span class="badge" style="background:var(--cdisc-primary-light);color:var(--cdisc-primary);font-size:11px;padding:2px 8px;border-radius:10px;">
              ${resolved} &larr; endpoint
            </span>
          </div>`;
        }
      }
    }

    // Endpoint linkage for response binding
    let endpointLink = '';
    if (b.methodRole === 'response' && paramValue && b.dataStructureRole === 'measure') {
      endpointLink = `<div style="font-size:10px; color:var(--cdisc-primary); margin-top:2px;">&larr; from endpoint: "${paramValue}"</div>`;
    }

    const removeBtn = isEditable
      ? `<button class="btn btn-sm binding-remove-btn" data-role="${b.methodRole}" data-index="${index}"
          style="color:var(--cdisc-error); border-color:var(--cdisc-error); padding:1px 6px; font-size:10px; margin-left:auto;">&times;</button>`
      : '';

    const isOutput = b.direction === 'output';
    const rowStyle = isOutput
      ? 'display:flex; flex-direction:column; padding:6px 10px; border:1px solid var(--cdisc-border); border-left:3px solid var(--cdisc-accent2); border-radius:4px; margin-bottom:4px; background:rgba(161,208,202,0.04);'
      : 'display:flex; flex-direction:column; padding:6px 10px; border:1px solid var(--cdisc-border); border-radius:4px; margin-bottom:4px;';
    return `
      <div class="binding-row" style="${rowStyle}">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-weight:600; font-size:12px; min-width:80px; color:var(--cdisc-text);">${b.methodRole || ''}</span>
          <code style="font-size:12px;">${concept}</code>
          ${typeBadge}
          ${removeBtn}
        </div>
        ${categoryPicker}${sliceAnnotation}${constraintAnnotation}${endpointLink}
      </div>`;
  }

  /**
   * Split bindings into Inputs and Outputs sections. Returns the full HTML
   * including both section headers. Preserves each binding's original index
   * in the unfiltered array so event handlers (remove, picker) wire correctly.
   */
  function renderBindingsSections(bindings, sliceLookup, isEditable) {
    const inputRows = [];
    const outputRows = [];
    bindings.forEach((b, i) => {
      const html = renderBindingRow(b, sliceLookup, isEditable, i);
      if (b.direction === 'output') outputRows.push(html);
      else inputRows.push(html);
    });
    const headerStyle = 'font-size:11px; font-weight:700; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin:0 0 6px 0; padding-bottom:3px; border-bottom:1px solid var(--cdisc-border);';
    const inputsBlock = inputRows.length > 0
      ? `<div style="margin-bottom:10px;"><div style="${headerStyle}">Inputs</div>${inputRows.join('')}</div>`
      : '';
    const outputsBlock = outputRows.length > 0
      ? `<div><div style="${headerStyle}; color:var(--cdisc-accent2);">Outputs</div>${outputRows.join('')}</div>`
      : '';
    return inputsBlock + outputsBlock;
  }

  if (!slot) {
    // Root node — analysis transformation
    const bindings = (transformation.bindings || []);
    const sliceLookup = getSliceLookup(transformation);

    return `
      <div class="card">
        <div class="transform-section" style="margin-bottom:0;">
          <div class="transform-section-title">Analysis Transformation</div>
          <table class="data-table" style="margin-bottom:12px;">
            <tbody>
              <tr><td style="width:120px; font-weight:600;">Name</td><td>${transformation.name}</td></tr>
              <tr><td style="font-weight:600;">Method</td><td><span class="badge badge-secondary">${transformation.usesMethod || ''}</span></td></tr>
              <tr><td style="font-weight:600;">Category</td><td>${transformation.acCategory || ''}</td></tr>
              ${transformation.description ? `<tr><td style="font-weight:600;">Description</td><td>${transformation.description}</td></tr>` : ''}
            </tbody>
          </table>

          <div class="config-panel-section">
            <div class="config-panel-section-title">Bindings</div>
            ${renderBindingsSections(bindings, sliceLookup, false)}
          </div>
        </div>
      </div>`;
  }

  const confirmedKeys = new Set((activeSpec.confirmedTerminals || []).map(t => t.slotKey));

  // Reference node — points to another pipeline slot's output
  const ref = getReferenceInfo(slot.key, activeSpec);
  if (ref) {
    const sliceLookup = getSliceLookup(transformation);
    // Editable slice constraints for reference nodes
    let sliceEditor = '';
    if (slot.slice && sliceLookup[slot.slice]) {
      const rawSliceDef = sliceLookup[slot.slice];
      const categoriesMap = appState.conceptCategories?.categories || {};
      const slotOverrides = activeSpec?.dimensionOverrides?.[slot.key] || {};
      const ownerBindings = slot.selected?.bindings || transformation?.bindings || [];
      const sliceDef = rawSliceDef.categoryConstraints
        ? resolveSliceCategories(rawSliceDef, slotOverrides, ownerBindings, categoriesMap)
        : { ...rawSliceDef, categoryBy: {} };
      const dims = sliceDef.fixedDimensions || sliceDef;
      const categoryBy = sliceDef.categoryBy || {};
      const overrides = activeSpec?.derivationSliceOverrides?.[slot.key]?.[slot.slice] || {};
      const encounters = (appState.selectedStudy?.encounters || [])
        .map(e => ({ value: e.label || e.name || '', desc: e.description || e.type || '' }))
        .filter(e => e.value);
      sliceEditor = `
        <div style="margin-top:8px; padding:6px 8px; background:rgba(161,208,202,0.08); border-radius:4px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-accent2); margin-bottom:4px;">Slice: ${slot.slice}</div>
          ${Object.entries(dims).map(([dim, defaultVal]) => {
            const currentVal = overrides[dim] ?? defaultVal;
            const fromCategory = categoryBy[dim];
            const listId = fromCategory
              ? `enc-${(slot.key || '').replace(/[^\w-]/g, '_')}-${slot.slice}-${dim}`
              : null;
            const listAttr = listId ? ` list="${listId}"` : '';
            const datalistHtml = listId
              ? `<datalist id="${listId}">
                   ${encounters.map(e => `<option value="${e.value}"${e.desc ? ` label="USDM: ${e.desc.replace(/"/g, '&quot;')}"` : ''}>`).join('')}
                 </datalist>`
              : '';
            const label = fromCategory ? `${dim} <span style="opacity:0.6">(${fromCategory})</span>` : dim;
            return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <span style="font-size:10px; min-width:100px; color:var(--cdisc-text-secondary);">${label}</span>
              <input class="deriv-slice-override" data-slot-key="${slot.key}" data-slice="${slot.slice}" data-dim="${dim}"
                value="${currentVal}" placeholder="${defaultVal}"${listAttr}
                style="font-size:11px; padding:2px 6px; flex:1; border:1px solid var(--cdisc-border); border-radius:3px;">
              ${datalistHtml}
            </div>`;
          }).join('')}
        </div>`;
    }
    return `
      <div class="card" style="border-color:var(--cdisc-primary);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:36px; height:36px; border-radius:50%; background:var(--cdisc-primary-light); display:flex; align-items:center; justify-content:center; color:var(--cdisc-primary); font-size:16px;">&#8594;</div>
          <div style="flex:1;">
            <div style="font-weight:600; color:var(--cdisc-text);">Pipeline Reference</div>
            <div style="font-size:12px; color:var(--cdisc-text-secondary); margin-top:2px;">
              Uses output of <strong>${ref.referenceLabel}</strong>
            </div>
          </div>
          <button class="btn btn-sm pipeline-remove-ref-btn" data-slot-key="${slot.key}"
            style="color:var(--cdisc-error); border-color:var(--cdisc-error); font-size:11px;">
            Remove
          </button>
        </div>
        ${sliceEditor}
      </div>`;
  }

  // Terminal node
  if (slot.status === 'terminal') {
    const isConfirmed = confirmedKeys.has(slot.key);
    const isDimension = slot.dataStructureRole === 'dimension';

    // Dimension terminal — show OC shared dimension info
    if (isDimension) {
      const ocDim = appState.ocModel?.Observation?.sharedDimensions?.[slot.concept];
      const qualInfo = slot.qualifierType && slot.qualifierValue
        ? `<div style="font-size:11px; color:var(--cdisc-accent2); margin-top:4px;">${slot.qualifierType}: ${slot.qualifierValue}</div>`
        : '';
      const constraintValue = resolveSliceKeyValue(slot.concept);
      const constraintInfo = constraintValue
        ? `<div style="font-size:11px; color:var(--cdisc-primary); margin-top:4px;">&larr; from endpoint: "${constraintValue}"</div>`
        : '';

      if (isConfirmed) {
        return `
          <div class="card" style="border-color:var(--cdisc-accent2);">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:28px; height:28px; border-radius:50%; background:rgba(161,208,202,0.2); display:flex; align-items:center; justify-content:center; color:var(--cdisc-accent2); font-size:14px; font-weight:700;">&#10003;</div>
              <div style="flex:1;">
                <div style="font-weight:600; font-size:13px; color:var(--cdisc-text);">${displayConcept(slot.concept)}</div>
                <div style="font-size:11px; color:var(--cdisc-text-secondary);">${slot.methodRole || ''} &middot; ${ocDim?.valueType || 'dimension'}</div>
                ${qualInfo}${constraintInfo}
                ${ocDim?.definition ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px;">${ocDim.definition}</div>` : ''}
              </div>
            </div>
          </div>`;
      }
      return `
        <div class="card">
          <div class="transform-section" style="margin-bottom:0;">
            <div class="transform-section-title">Dimension: ${displayConcept(slot.concept)}</div>
            <div style="font-size:12px; color:var(--cdisc-text-secondary); margin-bottom:8px;">
              ${slot.methodRole || ''} &middot; ${ocDim?.valueType || 'dimension'}
            </div>
            ${ocDim?.definition ? `<p style="font-size:12px; color:var(--cdisc-text); margin-bottom:8px;">${ocDim.definition}</p>` : ''}
            ${qualInfo}${constraintInfo}
            <button class="btn btn-primary btn-sm terminal-confirm-btn" data-slot-key="${slot.key}" data-concept="${slot.concept}" data-role-label="${slot.methodRole || ''}" style="margin-top:8px;">
              Confirm
            </button>
          </div>
        </div>`;
    }

    // Measure terminal
    const bcPicker = renderTerminalBCPicker(slot, activeSpec);
    if (isConfirmed) {
      return `
        <div class="card" style="border-color:var(--cdisc-success);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:50%; background:#D1FAE5; display:flex; align-items:center; justify-content:center; color:var(--cdisc-success); font-size:18px; font-weight:700;">&#10003;</div>
            <div style="flex:1;">
              <div style="font-weight:600; color:var(--cdisc-text);">${displayConcept(slot.concept)} — Source Data</div>
              <div style="font-size:12px; color:var(--cdisc-text-secondary); margin-top:2px;">
                Confirmed as source data. Select BC properties below to link observations.
              </div>
            </div>
            <button class="btn btn-sm pipeline-undo-terminal-btn" data-slot-key="${slot.key}"
              style="color:var(--cdisc-error); border-color:var(--cdisc-error); font-size:11px;">
              Undo
            </button>
          </div>
          ${bcPicker}
        </div>`;
    }
    return `
      <div class="card">
        <div class="transform-section" style="margin-bottom:0;">
          <div class="transform-section-title">Terminal Node</div>
          <p style="font-size:13px; color:var(--cdisc-text); margin-bottom:12px;">
            No derivation template produces <code>${displayConcept(slot.concept)}</code>${slot.methodRole ? ` (${slot.methodRole})` : ''}.
            This concept must come directly from source data.
          </p>
          <button class="btn btn-primary terminal-confirm-btn" data-slot-key="${slot.key}" data-concept="${slot.concept}" data-role-label="${slot.methodRole || ''}">
            Confirm as Source Data
          </button>
          ${bcPicker}
        </div>
      </div>`;
  }

  // Resolved derivation node — interactive bindings
  if (slot.selected) {
    const d = slot.selected;
    const outputBinding = (d.bindings || []).find(b => b.direction === 'output');
    const sliceLookup = getSliceLookup(d);

    // Inherited slice block — visible when the parent binding that points at
    // this slot declared a slice (e.g. subtrahend's parameter_baseline on
    // T.ChangeFromBaseline). The slice definition lives on the parent
    // derivation, which is included via ancestorSlices in getSliceLookup.
    let inheritedSliceBlock = '';
    if (slot.slice && sliceLookup[slot.slice]) {
      const rawSliceDef = sliceLookup[slot.slice];
      const categoriesMap = appState.conceptCategories?.categories || {};
      const slotOverrides = activeSpec?.dimensionOverrides?.[slot.key] || {};
      // ancestor binding list is unknown here, but the category resolver
      // tolerates empty bindings — it falls through to endpointPicks then
      // the first member.
      const resolved = rawSliceDef.categoryConstraints
        ? resolveSliceCategories(rawSliceDef, slotOverrides, [], categoriesMap)
        : { ...rawSliceDef, categoryBy: {} };
      const dims = resolved.fixedDimensions || resolved;
      const categoryBy = resolved.categoryBy || {};
      const overrides = activeSpec?.derivationSliceOverrides?.[slot.key]?.[slot.slice] || {};
      const encounters = (appState.selectedStudy?.encounters || [])
        .map(e => ({ value: e.label || e.name || '', desc: e.description || e.type || '' }))
        .filter(e => e.value);
      inheritedSliceBlock = `
        <div style="margin-bottom:12px; padding:8px 10px; background:rgba(161,208,202,0.10); border:1px dashed var(--cdisc-accent2); border-radius:4px;">
          <div style="font-size:11px; font-weight:600; color:var(--cdisc-accent2); margin-bottom:6px;">
            Inherited slice: <code>${slot.slice}</code>
            <span style="font-weight:400; color:var(--cdisc-text-secondary);"> — scopes this subtree's inputs</span>
          </div>
          ${Object.entries(dims).map(([dim, defaultVal]) => {
            const currentVal = overrides[dim] ?? defaultVal;
            const fromCategory = categoryBy[dim];
            const listId = fromCategory
              ? `enc-${(slot.key || '').replace(/[^\w-]/g, '_')}-${slot.slice}-${dim}`
              : null;
            const listAttr = listId ? ` list="${listId}"` : '';
            const datalistHtml = listId
              ? `<datalist id="${listId}">
                   ${encounters.map(e => `<option value="${e.value}"${e.desc ? ` label="USDM: ${e.desc.replace(/"/g, '&quot;')}"` : ''}>`).join('')}
                 </datalist>`
              : '';
            const label = fromCategory ? `${dim} <span style="opacity:0.6">(${fromCategory})</span>` : dim;
            return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <span style="font-size:10px; min-width:110px; color:var(--cdisc-text-secondary);">${label}</span>
              <input class="deriv-slice-override" data-slot-key="${slot.key}" data-slice="${slot.slice}" data-dim="${dim}"
                value="${currentVal}" placeholder="${defaultVal}"${listAttr}
                style="font-size:11px; padding:2px 6px; flex:1; border:1px solid var(--cdisc-border); border-radius:3px;">
              ${datalistHtml}
            </div>`;
          }).join('')}
        </div>`;
    }

    // Initialize custom bindings for this derivation if not yet done
    const chainEntry = (activeSpec.derivationChain || []).find(e => e.slotKey === slot.key);
    if (chainEntry && !chainEntry.customBindings) {
      chainEntry.customBindings = JSON.parse(JSON.stringify(d.bindings || []));
    }
    const bindings = chainEntry?.customBindings || d.bindings || [];

    // Available concepts for the add-binding dropdown
    const dcConcepts = [];
    if (appState.dcModel) {
      for (const cat of Object.values(appState.dcModel.categories || {})) {
        for (const cName of Object.keys(cat.concepts || {})) {
          dcConcepts.push(cName);
        }
      }
    }
    // Dimension concepts come from dcModel.sharedDimensions
    // (skip the 'note' metadata key)
    const dimOptions = Object.keys(appState.dcModel?.sharedDimensions || {})
      .filter(k => k !== 'note');

    return `
      <div class="card">
        <div class="transform-section" style="margin-bottom:0;">
          <div class="transform-section-title" style="display:flex; align-items:center; justify-content:space-between;">
            <span>Selected Derivation</span>
            <button class="btn btn-sm derivation-remove-btn" data-slot-key="${slot.key}" data-oid="${d.oid}"
              style="color:var(--cdisc-error); border-color:var(--cdisc-error); padding:2px 8px; font-size:11px;">
              Remove
            </button>
          </div>
          <table class="data-table" style="margin-bottom:12px;">
            <tbody>
              <tr><td style="width:120px; font-weight:600;">Name</td><td>${d.name}</td></tr>
              <tr><td style="font-weight:600;">OID</td><td><code>${d.oid}</code></td></tr>
              <tr><td style="font-weight:600;">Method</td><td><span class="badge badge-secondary">${d.usesMethod || ''}</span></td></tr>
              <tr><td style="font-weight:600;">Output</td><td><code>${displayConcept(outputBinding?.concept || d.outputConcept || '')}</code></td></tr>
              ${d.description ? `<tr><td style="font-weight:600;">Description</td><td>${d.description}</td></tr>` : ''}
            </tbody>
          </table>

          ${inheritedSliceBlock}

          <div class="config-panel-section">
            <div class="config-panel-section-title">Bindings</div>
            ${renderBindingsSections(bindings, sliceLookup, true)}
            <div style="margin-top:8px; display:flex; gap:6px; align-items:center;">
              <select class="pipeline-binding-add-select" data-slot-key="${slot.key}" style="font-size:11px; padding:4px 8px; border:1px dashed var(--cdisc-border); border-radius:4px; background:var(--cdisc-surface); color:var(--cdisc-text-secondary);">
                <option value="">+ Add binding...</option>
                <optgroup label="Measure Concepts">
                  ${dcConcepts.map(c => `<option value="${c}|measure">${c}</option>`).join('')}
                </optgroup>
                <optgroup label="Dimension Concepts">
                  ${dimOptions.map(c => `<option value="${c}|dimension">${c}</option>`).join('')}
                </optgroup>
              </select>
            </div>
          </div>

          ${renderDerivationConfigPanel(d, slot, activeSpec)}
        </div>
      </div>`;
  }

  // Unresolved slot with candidates
  return `
    <div class="card">
      <div class="transform-section" style="margin-bottom:0;">
        <div class="transform-section-title">Resolve Dependency</div>
        <p style="font-size:13px; color:var(--cdisc-text); margin-bottom:12px;">
          Select a derivation template from the library panel that produces
          <code>${displayConcept(slot.concept)}</code>${slot.methodRole ? ` (${slot.methodRole})` : ''}.
        </p>
        <div style="font-size:12px; color:var(--cdisc-text-secondary);">
          ${slot.candidates.length} template${slot.candidates.length !== 1 ? 's' : ''} available &rarr;
        </div>
      </div>
    </div>`;
}

/* ─── Library Panel (Right Zone) ─── */

function renderDerivationLibraryPanel(slot, lib, activeSpec, slots) {
  const confirmedKeys = new Set((activeSpec.confirmedTerminals || []).map(t => t.slotKey));

  // Root node or no slot
  if (!slot) {
    return `
      <div class="ep-library-panel">
        <div class="ep-library-panel-title">Derivation Templates</div>
        <div class="ep-library-panel-empty">Select a node in the tree to see matching templates.</div>
      </div>`;
  }

  // Reference node
  if (isReferenceSlot(slot.key, activeSpec)) {
    const ref = getReferenceInfo(slot.key, activeSpec);
    return `
      <div class="ep-library-panel">
        <div class="ep-library-panel-title">Pipeline Reference</div>
        <div class="ep-library-panel-empty">
          This node references the output of <strong>${ref?.referenceLabel || 'another branch'}</strong>.
        </div>
      </div>`;
  }

  // Build pipeline reference options for this slot
  const pipelineOutputs = slots ? getResolvedPipelineOutputs(slots, slot.concept, slot.key, activeSpec) : [];
  const pipelineRefHtml = pipelineOutputs.length > 0 ? `
    <div style="font-size:11px; font-weight:600; color:var(--cdisc-primary); margin-bottom:6px; padding-bottom:4px; border-bottom:1px solid var(--cdisc-border);">
      From Pipeline
    </div>
    ${pipelineOutputs.map(p => `
      <div class="pipeline-lib-card pipeline-lib-ref-btn" style="border-color:var(--cdisc-primary); background:var(--cdisc-primary-light);"
           data-slot-key="${slot.key}" data-ref-slot-key="${p.slotKey}" data-concept="${slot.concept}"
           data-ref-label="${p.methodRole ? p.methodRole + ' → ' : ''}${p.derivationName}">
        <div class="pipeline-lib-card-name" style="color:var(--cdisc-primary);">&#8594; ${p.derivationName}</div>
        <div class="pipeline-lib-card-meta">
          <span style="font-size:11px; color:var(--cdisc-text-secondary);">from: <strong>${p.methodRole || 'pipeline'}</strong></span>
        </div>
        <div class="pipeline-lib-card-desc">Use the same derived ${displayConcept(p.concept)} output${p.slice ? ' (at ' + p.slice + ')' : ''}</div>
      </div>
    `).join('')}
    <div style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary); margin:10px 0 6px; padding-bottom:4px; border-bottom:1px solid var(--cdisc-border);">
      From Library
    </div>
  ` : '';

  // Terminal node
  if (slot.status === 'terminal') {
    const isConfirmed = confirmedKeys.has(slot.key);
    if (pipelineOutputs.length > 0 && !isConfirmed) {
      // Terminal but has pipeline references available
      return `
        <div class="ep-library-panel">
          <div class="ep-library-panel-title">Sources for <code>${displayConcept(slot.concept)}</code></div>
          ${pipelineRefHtml}
          <div class="ep-library-panel-empty" style="margin-top:8px;">
            No derivation templates produce this concept. Use a pipeline reference above or confirm as source data.
          </div>
        </div>`;
    }
    return `
      <div class="ep-library-panel">
        <div class="ep-library-panel-title">Derivation Templates</div>
        <div class="ep-library-panel-empty">
          ${isConfirmed
            ? 'This node is confirmed as source data.'
            : 'No derivation templates produce this concept. Confirm as source data in the config panel.'}
        </div>
      </div>`;
  }

  // Resolved slot — show selected + alternatives
  if (slot.selected) {
    const d = slot.selected;
    const outputConcept = (d.bindings || []).find(b => b.direction === 'output')?.concept || d.outputConcept || '';
    const alternatives = slot.candidates.filter(c => c.oid !== d.oid);

    return `
      <div class="ep-library-panel">
        <div class="ep-library-panel-title">Selected for <code>${displayConcept(slot.concept)}</code></div>
        <div class="pipeline-lib-card selected">
          <div class="pipeline-lib-card-name">${d.name}</div>
          <div class="pipeline-lib-card-meta">
            <span class="badge badge-secondary">${d.usesMethod || ''}</span>
            <span style="font-size:11px; color:var(--cdisc-text-secondary);">outputs: <code>${displayConcept(outputConcept)}</code></span>
          </div>
          ${d.description ? `<div class="pipeline-lib-card-desc">${d.description}</div>` : ''}
        </div>
        ${alternatives.length > 0 ? `
          <div style="font-size:11px; color:var(--cdisc-text-secondary); margin:8px 0 6px; padding-top:8px; border-top:1px solid var(--cdisc-border);">
            Alternatives (${alternatives.length})
          </div>
          ${alternatives.map(c => {
            const cOutput = (c.bindings || []).find(b => b.direction === 'output')?.concept || c.outputConcept || '';
            return `
              <div class="pipeline-lib-card pipeline-lib-pick-btn" data-slot-key="${slot.key}" data-concept="${slot.concept}" data-oid="${c.oid}">
                <div class="pipeline-lib-card-name">${c.name}</div>
                <div class="pipeline-lib-card-meta">
                  <span class="badge badge-secondary">${c.usesMethod || ''}</span>
                  <span style="font-size:11px; color:var(--cdisc-text-secondary);">outputs: <code>${displayConcept(cOutput)}</code></span>
                </div>
                ${c.description ? `<div class="pipeline-lib-card-desc">${c.description}</div>` : ''}
              </div>`;
          }).join('')}
        ` : ''}
      </div>`;
  }

  // Unresolved slot — show candidates + pipeline references
  const candidates = slot.candidates;
  return `
    <div class="ep-library-panel">
      <div class="ep-library-panel-title">Templates for <code>${displayConcept(slot.concept)}</code></div>
      ${pipelineRefHtml}
      <input class="ep-library-search" placeholder="Search templates..." />
      <div id="pipeline-lib-cards">
        ${candidates.map(c => {
          const outputConcept = (c.bindings || []).find(b => b.direction === 'output')?.concept || c.outputConcept || '';
          const inputs = (c.bindings || []).filter(b => b.direction !== 'output');
          return `
            <div class="pipeline-lib-card pipeline-lib-pick-btn" data-slot-key="${slot.key}" data-concept="${slot.concept}" data-oid="${c.oid}">
              <div class="pipeline-lib-card-name">${c.name}</div>
              <div class="pipeline-lib-card-meta">
                <span class="badge badge-secondary">${c.usesMethod || ''}</span>
                <span style="font-size:11px; color:var(--cdisc-text-secondary);">outputs: <code>${displayConcept(outputConcept)}</code></span>
              </div>
              ${c.description ? `<div class="pipeline-lib-card-desc">${c.description}</div>` : ''}
              ${inputs.length > 0 ? `
                <div class="pipeline-lib-card-inputs">
                  Requires: ${inputs.map(b => `<code>${displayConcept(normalizeConcept(b))}</code>`).join(', ')}
                </div>` : ''}
            </div>`;
        }).join('')}
        <div class="pipeline-lib-card-source pipeline-lib-source-btn" data-slot-key="${slot.key}" data-concept="${slot.concept}" data-role-label="${slot.methodRole || ''}">
          <div class="pipeline-lib-card-name">${displayConcept(slot.concept)} (raw)</div>
          <div style="font-size:11px; color:var(--cdisc-text-secondary);">Use source data directly without derivation.</div>
        </div>
      </div>
    </div>`;
}

/* ─── Partial Re-render ─── */

function updateZones(container, slots, transformation, lib, activeSpec) {
  const slot = activeNodeKey === '__root__' ? null : findSlotByKey(slots, activeNodeKey);

  // Update tree highlight
  container.querySelectorAll('.pipeline-tree-node').forEach(el => {
    el.classList.toggle('pipeline-node-highlight', el.dataset.slotKey === activeNodeKey);
  });

  // Re-render config zone
  const configZone = container.querySelector('#pipeline-config-zone');
  if (configZone) {
    configZone.innerHTML = renderNodeConfigPanel(slot, transformation, lib, activeSpec);
    wireConfigEvents(container, slots, transformation, lib, activeSpec);
  }

  // Re-render library zone
  const libZone = container.querySelector('#pipeline-library-zone');
  if (libZone) {
    libZone.innerHTML = renderDerivationLibraryPanel(slot, lib, activeSpec, slots);
    wireLibraryEvents(container, slots, transformation, lib, activeSpec);
  }
}

/* ─── Event Wiring ─── */

function wireTreeEvents(container, slots, transformation, lib, activeSpec) {
  container.querySelectorAll('.pipeline-tree-node').forEach(node => {
    node.addEventListener('click', () => {
      activeNodeKey = node.dataset.slotKey;
      updateZones(container, slots, transformation, lib, activeSpec);
    });
  });
}

function wireConfigEvents(container, slots, transformation, lib, activeSpec) {
  // Terminal confirm
  container.querySelectorAll('.terminal-confirm-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotKey = btn.dataset.slotKey;
      const concept = btn.dataset.concept;
      const roleLabel = btn.dataset.roleLabel || '';
      if (!activeSpec.confirmedTerminals.find(t => t.slotKey === slotKey)) {
        activeSpec.confirmedTerminals.push({ slotKey, concept, roleLabel });
      }
      // Auto-advance to next unresolved
      const newSlots = buildAndAutoSelect(transformation, lib, activeSpec);
      const next = findFirstUnresolved(newSlots, activeSpec.confirmedTerminals, activeSpec);
      activeNodeKey = next ? next.key : '__root__';
      renderDerivationPipeline(container);
    });
  });

  // Undo terminal
  container.querySelectorAll('.pipeline-undo-terminal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotKey = btn.dataset.slotKey;
      const idx = activeSpec.confirmedTerminals.findIndex(t => t.slotKey === slotKey);
      if (idx !== -1) activeSpec.confirmedTerminals.splice(idx, 1);
      renderDerivationPipeline(container);
    });
  });

  // Remove derivation
  container.querySelectorAll('.derivation-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotKey = btn.dataset.slotKey;
      const oid = btn.dataset.oid;
      const removedIdx = activeSpec.derivationChain.findIndex(
        entry => entry.slotKey === slotKey && entry.derivationOid === oid
      );
      if (removedIdx !== -1) {
        const derivations = lib.derivationTransformations || [];
        const removedDeriv = derivations.find(d => d.oid === oid);
        activeSpec.derivationChain.splice(removedIdx, 1);
        delete activeSpec.selectedDerivations[slotKey];
        if (removedDeriv) removeDownstream(removedDeriv, lib, activeSpec);
      }
      // Stay on same node
      renderDerivationPipeline(container);
    });
  });

  // Remove pipeline reference
  container.querySelectorAll('.pipeline-remove-ref-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotKey = btn.dataset.slotKey;
      if (!activeSpec.pipelineReferences) activeSpec.pipelineReferences = [];
      activeSpec.pipelineReferences = activeSpec.pipelineReferences.filter(r => r.slotKey !== slotKey);
      renderDerivationPipeline(container);
    });
  });

  // Remove individual binding from derivation
  container.querySelectorAll('.binding-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      // Find chain entry for active node
      const chainEntry = (activeSpec.derivationChain || []).find(e => e.slotKey === activeNodeKey);
      if (chainEntry?.customBindings && chainEntry.customBindings[index]) {
        chainEntry.customBindings.splice(index, 1);
        updateZones(container, slots, transformation, lib, activeSpec);
      }
    });
  });

  // Add binding to derivation
  container.querySelectorAll('.pipeline-binding-add-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const val = sel.value;
      if (!val) return;
      const [concept, structRole] = val.split('|');
      const slotKey = sel.dataset.slotKey;
      const chainEntry = (activeSpec.derivationChain || []).find(e => e.slotKey === slotKey);
      if (chainEntry) {
        if (!chainEntry.customBindings) chainEntry.customBindings = [];
        chainEntry.customBindings.push({
          concept,
          methodRole: '',
          direction: 'input',
          dataStructureRole: structRole || 'measure',
          _custom: true
        });
        updateZones(container, slots, transformation, lib, activeSpec);
      }
    });
  });

  // Concept category picker — user selects a concrete concept from a category
  container.querySelectorAll('.deriv-category-picker').forEach(sel => {
    sel.addEventListener('change', () => {
      const slotKey = sel.dataset.slotKey;
      const bindingIdx = sel.dataset.bindingIdx;
      const concept = sel.value;
      if (!slotKey || bindingIdx == null) return;
      if (!activeSpec.dimensionOverrides) activeSpec.dimensionOverrides = {};
      if (!activeSpec.dimensionOverrides[slotKey]) activeSpec.dimensionOverrides[slotKey] = {};
      activeSpec.dimensionOverrides[slotKey][bindingIdx] = { concept };
      updateZones(container, slots, transformation, lib, activeSpec);
    });
  });

  // BC property checkboxes in terminal config
  container.querySelectorAll('.terminal-bc-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const slotKey = cb.dataset.slotKey;
      const bcId = cb.dataset.bcId;
      // Create the terminal entry if it doesn't exist yet — the user is linking
      // a BC which implicitly confirms this terminal as a source data node.
      if (!activeSpec.confirmedTerminals) activeSpec.confirmedTerminals = [];
      let termEntry = activeSpec.confirmedTerminals.find(t => t.slotKey === slotKey);
      if (!termEntry) {
        termEntry = { slotKey, concept: cb.dataset.concept || '', roleLabel: '' };
        activeSpec.confirmedTerminals.push(termEntry);
      }
      if (!termEntry.linkedBCIds) termEntry.linkedBCIds = [];
      if (cb.checked) {
        if (!termEntry.linkedBCIds.includes(bcId)) termEntry.linkedBCIds.push(bcId);
      } else {
        termEntry.linkedBCIds = termEntry.linkedBCIds.filter(id => id !== bcId);
      }
    });
  });

  // Slice constraint overrides at study level
  container.querySelectorAll('.deriv-slice-override').forEach(input => {
    input.addEventListener('change', () => {
      const slotKey = input.dataset.slotKey;
      const sliceName = input.dataset.slice;
      const dim = input.dataset.dim;
      const value = input.value.trim();
      if (!slotKey || !sliceName || !dim) return;
      if (!activeSpec.derivationSliceOverrides) activeSpec.derivationSliceOverrides = {};
      if (!activeSpec.derivationSliceOverrides[slotKey]) activeSpec.derivationSliceOverrides[slotKey] = {};
      if (!activeSpec.derivationSliceOverrides[slotKey][sliceName]) activeSpec.derivationSliceOverrides[slotKey][sliceName] = {};
      activeSpec.derivationSliceOverrides[slotKey][sliceName][dim] = value;
    });
  });

  // Derivation method config inputs (target_unit, precision, etc.)
  container.querySelectorAll('.deriv-config-input').forEach(el => {
    const eventType = el.tagName === 'SELECT' ? 'change' : 'change';
    el.addEventListener(eventType, () => {
      const slotKey = el.dataset.slotKey;
      const configKey = el.dataset.configKey;
      let value = el.value;
      if (!isNaN(value) && value !== '') value = Number(value);
      if (!activeSpec.derivationConfigValues) activeSpec.derivationConfigValues = {};
      if (!activeSpec.derivationConfigValues[slotKey]) activeSpec.derivationConfigValues[slotKey] = {};
      if (value === '' || value == null) {
        delete activeSpec.derivationConfigValues[slotKey][configKey];
      } else {
        activeSpec.derivationConfigValues[slotKey][configKey] = value;
      }
    });
  });
}

function wireLibraryEvents(container, slots, transformation, lib, activeSpec) {
  // Pick derivation from library
  container.querySelectorAll('.pipeline-lib-pick-btn').forEach(card => {
    card.addEventListener('click', () => {
      const slotKey = card.dataset.slotKey;
      const concept = card.dataset.concept;
      const oid = card.dataset.oid;

      // If switching from a previously selected derivation, remove old one + downstream
      const existing = activeSpec.derivationChain.find(e => e.slotKey === slotKey);
      if (existing) {
        const derivations = lib.derivationTransformations || [];
        const oldDeriv = derivations.find(d => d.oid === existing.derivationOid);
        activeSpec.derivationChain = activeSpec.derivationChain.filter(e => e.slotKey !== slotKey);
        delete activeSpec.selectedDerivations[slotKey];
        if (oldDeriv) removeDownstream(oldDeriv, lib, activeSpec);
      }

      activeSpec.derivationChain.push({ slotKey, concept, derivationOid: oid });
      activeSpec.selectedDerivations[slotKey] = oid;

      // Auto-advance to first unresolved child
      const newSlots = buildAndAutoSelect(transformation, lib, activeSpec);
      const next = findFirstUnresolved(newSlots, activeSpec.confirmedTerminals, activeSpec);
      activeNodeKey = next ? next.key : slotKey;
      renderDerivationPipeline(container);
    });
  });

  // Pick pipeline reference
  container.querySelectorAll('.pipeline-lib-ref-btn').forEach(card => {
    card.addEventListener('click', () => {
      const slotKey = card.dataset.slotKey;
      const refSlotKey = card.dataset.refSlotKey;
      const concept = card.dataset.concept;
      const refLabel = card.dataset.refLabel || refSlotKey;

      if (!activeSpec.pipelineReferences) activeSpec.pipelineReferences = [];
      // Remove existing reference for this slot
      activeSpec.pipelineReferences = activeSpec.pipelineReferences.filter(r => r.slotKey !== slotKey);
      activeSpec.pipelineReferences.push({
        slotKey,
        concept,
        referenceSlotKey: refSlotKey,
        referenceLabel: refLabel
      });

      // Auto-advance
      const newSlots = buildAndAutoSelect(transformation, lib, activeSpec);
      const next = findFirstUnresolved(newSlots, activeSpec.confirmedTerminals, activeSpec);
      activeNodeKey = next ? next.key : '__root__';
      renderDerivationPipeline(container);
    });
  });

  // Use as source data from library panel
  container.querySelectorAll('.pipeline-lib-source-btn').forEach(card => {
    card.addEventListener('click', () => {
      const slotKey = card.dataset.slotKey;
      const concept = card.dataset.concept;
      const roleLabel = card.dataset.roleLabel || '';
      if (!activeSpec.confirmedTerminals.find(t => t.slotKey === slotKey)) {
        activeSpec.confirmedTerminals.push({ slotKey, concept, roleLabel });
      }
      const newSlots = buildAndAutoSelect(transformation, lib, activeSpec);
      const next = findFirstUnresolved(newSlots, activeSpec.confirmedTerminals, activeSpec);
      activeNodeKey = next ? next.key : '__root__';
      renderDerivationPipeline(container);
    });
  });

  // Search filter
  const searchInput = container.querySelector('.ep-library-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      container.querySelectorAll('#pipeline-lib-cards .pipeline-lib-card, #pipeline-lib-cards .pipeline-lib-card-source').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }
}

/**
 * Build pipeline graph and auto-select single candidates. Returns final slots.
 * Also prunes stale derivationChain entries whose slotKey no longer appears
 * in the live graph — happens after the §3 path-unique-slotKey change when
 * loading a spec saved against the older shape.
 */
function buildAndAutoSelect(transformation, lib, activeSpec) {
  const confirmedKeys = new Set((activeSpec.confirmedTerminals || []).map(t => t.slotKey));
  // Pass endpoint-level dimensionCategoryPicks + categoriesMap so analysis
  // bindings declared with conceptCategory (e.g. VisitDimension) resolve to
  // the user's concrete pick (Timepoint) instead of producing "?" slots.
  const endpointPicks = activeSpec?.dimensionCategoryPicks || {};
  const categoriesMap = appState.conceptCategories?.categories || {};
  // Prune stale chain entries before building
  if (activeSpec.derivationChain?.length) {
    // Build once to know current keys
    const probeSlots = buildPipelineGraph(transformation, lib, activeSpec.selectedDerivations, confirmedKeys, endpointPicks, categoriesMap);
    const liveKeys = new Set();
    (function collect(list) {
      for (const s of list) { liveKeys.add(s.key); if (s.children?.length) collect(s.children); }
    })(probeSlots);
    const before = activeSpec.derivationChain.length;
    activeSpec.derivationChain = activeSpec.derivationChain.filter(e => liveKeys.has(e.slotKey));
    if (activeSpec.derivationChain.length !== before) {
      console.warn('[AC/DC] Pruned', before - activeSpec.derivationChain.length,
        'stale derivationChain entries. You may need to re-pick derivations for affected slots.');
    }
  }
  let slots = buildPipelineGraph(transformation, lib, activeSpec.selectedDerivations, confirmedKeys, endpointPicks, categoriesMap);
  // Iteratively auto-select single-candidate slots
  let maxIterations = 20;
  while (autoSelectSingleCandidates(slots, activeSpec) && maxIterations-- > 0) {
    slots = buildPipelineGraph(transformation, lib, activeSpec.selectedDerivations, confirmedKeys, endpointPicks, categoriesMap);
  }
  return slots;
}

/* ─── Main Render ─── */

export function renderDerivationPipeline(container) {
  const study = appState.selectedStudy;
  const lib = appState.transformationLibrary;

  // Rebuild resolved spec so downstream steps have fresh data
  rebuildSpec();

  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study in Step 1 first.</p></div>';
    return;
  }

  const allEps = getAllEndpoints(study);
  const analysisEps = allEps.filter(ep => {
    const spec = appState.endpointSpecs?.[ep.id];
    return spec?.selectedTransformationOid && appState.selectedEndpoints.includes(ep.id);
  });

  if (analysisEps.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No analysis transformations configured</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please configure analysis transformations in Step 5 first.</p></div>';
    return;
  }

  if (!appState.activeEndpointId || !analysisEps.find(ep => ep.id === appState.activeEndpointId)) {
    appState.activeEndpointId = analysisEps[0].id;
  }

  const activeSpec = appState.endpointSpecs[appState.activeEndpointId];
  const transformation = lib?.analysisTransformations?.find(t => t.oid === activeSpec.selectedTransformationOid);

  if (!transformation) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No transformation found</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please configure analysis transformations in Step 5 first.</p></div>';
    return;
  }

  // Initialize per-endpoint derivation state
  if (!activeSpec.derivationChain) activeSpec.derivationChain = [];
  if (!activeSpec.selectedDerivations) activeSpec.selectedDerivations = {};
  if (!activeSpec.confirmedTerminals) activeSpec.confirmedTerminals = [];
  if (!activeSpec.pipelineReferences) activeSpec.pipelineReferences = [];

  // Build tree with auto-selection
  const slots = buildAndAutoSelect(transformation, lib, activeSpec);

  // Auto-confirm standard dimension terminals (Subject, Parameter, AnalysisVisit, etc.)
  autoConfirmStandardDimensions(slots, activeSpec);

  // Determine active node
  if (!activeNodeKey || (activeNodeKey !== '__root__' && !findSlotByKey(slots, activeNodeKey))) {
    const first = findFirstUnresolved(slots, activeSpec.confirmedTerminals, activeSpec);
    activeNodeKey = first ? first.key : '__root__';
  }

  const activeSlot = activeNodeKey === '__root__' ? null : findSlotByKey(slots, activeNodeKey);

  const allEndpointsComplete = analysisEps.every(ep => isDerivationComplete(appState.endpointSpecs[ep.id], lib));
  const isComplete = !findFirstUnresolved(slots, activeSpec.confirmedTerminals, activeSpec);

  container.innerHTML = `
    <div class="pipeline-3zone">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <h2 style="font-size:18px; font-weight:700;">Derivation Pipeline</h2>
          <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
            Build the derivation chain for each endpoint. Click a node to configure it.
          </p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" id="btn-back-config">&larr; Back to Summary</button>
          <button class="btn btn-primary" id="btn-add-esap" ${!allEndpointsComplete ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>Proceed to eSAP</button>
        </div>
      </div>

      <!-- Endpoint Tabs -->
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${analysisEps.map(ep => {
          const isActive = ep.id === appState.activeEndpointId;
          const epSpec = appState.endpointSpecs[ep.id];
          const epComplete = isDerivationComplete(epSpec, lib);
          return `
            <button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'} ep-tab-btn" data-ep-id="${ep.id}" style="font-size:12px;">
              ${ep.name}${epComplete ? ' &#10003;' : ''}
            </button>`;
        }).join('')}
      </div>

      <!-- Completion Banner + Execution Order -->
      ${isComplete ? `
      <div class="card" style="border-color:var(--cdisc-success); padding:12px 16px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:28px; height:28px; border-radius:50%; background:#D1FAE5; display:flex; align-items:center; justify-content:center; color:var(--cdisc-success); font-size:14px; font-weight:700;">&#10003;</div>
          <div style="flex:1;">
            <span style="font-weight:600; color:var(--cdisc-text);">Pipeline Complete</span>
            <span style="font-size:12px; color:var(--cdisc-text-secondary); margin-left:8px;">All dependencies resolved for this endpoint.</span>
          </div>
        </div>
        ${renderExecutionOrderPanel(slots, activeSpec, lib, transformation)}
      </div>` : ''}

      <!-- Top Zone: Dependency Tree -->
      <div class="card" style="padding:8px; overflow-x:auto;">
        ${renderTree(transformation, slots, activeNodeKey, activeSpec.confirmedTerminals, activeSpec)}
      </div>

      <!-- Lower Split: Config + Library -->
      <div class="pipeline-split-lower">
        <div id="pipeline-config-zone" class="pipeline-config-zone">
          ${renderNodeConfigPanel(activeSlot, transformation, lib, activeSpec)}
        </div>
        <div id="pipeline-library-zone">
          ${renderDerivationLibraryPanel(activeSlot, lib, activeSpec, slots)}
        </div>
      </div>
    </div>
  `;

  // Wire events
  wireTreeEvents(container, slots, transformation, lib, activeSpec);
  wireConfigEvents(container, slots, transformation, lib, activeSpec);
  wireLibraryEvents(container, slots, transformation, lib, activeSpec);

  // Endpoint tabs
  container.querySelectorAll('.ep-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.activeEndpointId = btn.dataset.epId;
      activeNodeKey = null; // reset for new endpoint
      renderDerivationPipeline(container);
    });
  });

  // Navigation
  container.querySelector('#btn-back-config').addEventListener('click', () => navigateTo(5));
  const addBtn = container.querySelector('#btn-add-esap');
  if (allEndpointsComplete) {
    addBtn.addEventListener('click', () => navigateTo(7));
  }
}
