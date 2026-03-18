import { appState, navigateTo } from '../app.js';
import { getAllEndpoints } from '../utils/usdm-parser.js';
import {
  findDerivationsForConcept, getUnresolvedConcepts
} from '../utils/transformation-linker.js';
import { displayConcept, normalizeConcept } from '../utils/concept-display.js';

/**
 * Compute the full pipeline chain from a derivation chain array,
 * resolving each derivation object from the library.
 */
function getResolvedChain(lib, chain) {
  const derivations = lib.derivationTransformations || [];
  return chain.map(entry => {
    const deriv = derivations.find(d => d.oid === entry.derivationOid);
    return { ...entry, derivation: deriv || null };
  });
}

/**
 * Render the pipeline visualization (left-to-right: terminals → derivations → analysis).
 */
function renderPipelineVisualization(transformation, lib, chain, confirmedTerminals) {
  const resolvedChain = getResolvedChain(lib, chain);
  const unresolved = getUnresolvedConcepts(transformation, chain, lib);
  const confirmedKeys = new Set((confirmedTerminals || []).map(t => t.slotKey));

  // Collect terminal slots: confirmed + unresolved with no candidates
  const terminalSlots = [
    ...(confirmedTerminals || []),
    ...unresolved.filter(s =>
      findDerivationsForConcept(s.concept, lib).length === 0 && !confirmedKeys.has(s.slotKey)
    )
  ];

  // De-duplicate by slotKey for display
  const seen = new Set();
  const uniqueTerminals = terminalSlots.filter(s => {
    if (seen.has(s.slotKey)) return false;
    seen.add(s.slotKey);
    return true;
  });

  const nodes = [];

  for (const t of uniqueTerminals) {
    const isConfirmed = confirmedKeys.has(t.slotKey);
    const roleLabel = t.roleLabel ? ` (${t.roleLabel})` : '';
    nodes.push(`
      <div class="pipeline-node terminal ${isConfirmed ? 'confirmed' : ''}">
        <div class="pipeline-node-title">${displayConcept(t.concept)}${roleLabel} ${isConfirmed ? '<span class="pipeline-check">&#10003;</span>' : ''}</div>
        <div class="pipeline-node-sub">Source data</div>
      </div>`);
  }

  for (const entry of resolvedChain) {
    if (!entry.derivation) continue;
    nodes.push(`
      <div class="pipeline-node resolved">
        <div class="pipeline-node-title">${entry.derivation.name} <span class="pipeline-check">&#10003;</span></div>
        <div class="pipeline-node-sub">${entry.derivation.usesMethod || ''}</div>
        <div class="pipeline-node-sub" style="color:var(--cdisc-accent);">${displayConcept(entry.concept)}</div>
      </div>`);
  }

  // Analysis node (always rightmost)
  nodes.push(`
    <div class="pipeline-node active">
      <div class="pipeline-node-title">${transformation.name}</div>
      <div class="pipeline-node-sub">${transformation.usesMethod}</div>
      <div class="pipeline-node-sub" style="color:var(--cdisc-accent);">${transformation.acCategory || ''}</div>
    </div>`);

  return nodes.join('<div class="pipeline-arrow">&#9654;</div>');
}

/**
 * Render candidate derivation cards for an unresolved slot.
 */
function renderCandidateCards(slot, candidates) {
  const { slotKey, concept, roleLabel } = slot;
  const isSingle = candidates.length === 1;
  const roleDisplay = roleLabel ? ` <span style="color:var(--cdisc-gray);">(${roleLabel})</span>` : '';

  return `
    <div class="derivation-prompt">
      <div class="derivation-prompt-label">
        ${isSingle
          ? `One derivation produces <code>${displayConcept(concept)}</code>${roleDisplay}. Select it or use raw source data:`
          : `Select a derivation template that produces <code>${displayConcept(concept)}</code>${roleDisplay}, or use raw source data:`}
      </div>
      <div class="derivation-candidates">
        ${candidates.map(c => `
          <div class="derivation-candidate-card ${isSingle ? 'auto-suggested' : ''}" data-slot-key="${slotKey}" data-concept="${concept}" data-oid="${c.oid}">
            <div class="derivation-candidate-info">
              <div class="derivation-candidate-name">${c.name}</div>
              <div class="derivation-candidate-meta">
                <span class="badge badge-secondary">${c.usesMethod || ''}</span>
                <span style="font-size:11px; color:var(--cdisc-gray);">outputs: <code>${displayConcept((c.bindings || []).find(b => b.direction === 'output')?.concept || c.outputConcept)}</code></span>
              </div>
              ${c.description ? `<div class="derivation-candidate-desc">${c.description}</div>` : ''}
              ${(c.bindings || []).filter(b => b.direction !== 'output').length > 0 ? `
                <div class="derivation-candidate-inputs">
                  Requires: ${(c.bindings || []).filter(b => b.direction !== 'output').map(b => `<code>${displayConcept(normalizeConcept(b))}</code>`).join(', ')}
                </div>
              ` : ''}
            </div>
            <button class="btn btn-primary btn-sm derivation-pick-btn" data-slot-key="${slotKey}" data-concept="${concept}" data-oid="${c.oid}">
              ${isSingle ? 'Confirm' : 'Pick'}
            </button>
          </div>
        `).join('')}
        <div class="derivation-candidate-card" style="border-style:dashed; opacity:0.8;" data-slot-key="${slotKey}" data-concept="${concept}">
          <div class="derivation-candidate-info">
            <div class="derivation-candidate-name">${displayConcept(concept)}${roleLabel ? ` — ${roleLabel}` : ''} (raw)</div>
            <div class="derivation-candidate-meta">
              <span class="badge" style="background:var(--cdisc-light-gray); color:var(--cdisc-gray);">No derivation</span>
            </div>
            <div class="derivation-candidate-desc">Use source data directly without applying a derivation template.</div>
          </div>
          <button class="btn btn-secondary btn-sm terminal-confirm-btn" data-slot-key="${slotKey}" data-concept="${concept}" data-role-label="${roleLabel || ''}">
            Use as Source Data
          </button>
        </div>
      </div>
    </div>`;
}

/**
 * Render terminal concept cards requiring user confirmation (no candidates available).
 */
function renderTerminalCards(terminalSlots) {
  if (terminalSlots.length === 0) return '';

  return terminalSlots.map(slot => {
    const { slotKey, concept, roleLabel } = slot;
    const roleDisplay = roleLabel ? ` <span style="color:var(--cdisc-gray);">(${roleLabel})</span>` : '';
    return `
    <div class="derivation-prompt">
      <div class="derivation-prompt-label">
        No derivation template produces <code>${displayConcept(concept)}</code>${roleDisplay}. This concept must come from source data.
      </div>
      <div class="derivation-candidates">
        <div class="derivation-candidate-card auto-suggested" style="border-style:dashed;" data-slot-key="${slotKey}" data-concept="${concept}">
          <div class="derivation-candidate-info">
            <div class="derivation-candidate-name">${displayConcept(concept)}${roleLabel ? ` — ${roleLabel}` : ''}</div>
            <div class="derivation-candidate-meta">
              <span class="badge" style="background:var(--cdisc-light-gray); color:var(--cdisc-gray);">Terminal</span>
              <span style="font-size:11px; color:var(--cdisc-gray);">No derivation available — sourced directly from dataset</span>
            </div>
            <div class="derivation-candidate-desc">
              This concept is a leaf node in the derivation chain. It will be bound to actual data columns during execution.
            </div>
          </div>
          <button class="btn btn-primary btn-sm terminal-confirm-btn" data-slot-key="${slotKey}" data-concept="${concept}" data-role-label="${roleLabel || ''}">
            Confirm as Source Data
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/**
 * Render the selected derivations accordion with enriched detail.
 */
function renderSelectedAccordion(lib, chain) {
  const chain_resolved = getResolvedChain(lib, chain);
  if (chain_resolved.length === 0) return '';

  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section">
        <div class="transform-section-title">Selected Derivation Templates</div>
        <div class="derivation-accordion">
          ${chain_resolved.map(entry => {
            if (!entry.derivation) return '';
            const d = entry.derivation;
            const inputBindings = (d.bindings || []).filter(b => b.direction !== 'output');
            const outputBinding = (d.bindings || []).find(b => b.direction === 'output');
            const outputConceptDisplay = outputBinding?.concept || d.outputConcept || '';
            const inherited = d.inheritedDimensions || {};
            const added = d.addedDimensions || {};
            const hasDimensions = Object.keys(inherited).length > 0 || Object.keys(added).length > 0;
            const hasBindings = inputBindings.length > 0;

            return `
              <details>
                <summary>
                  ${d.name}
                  <span class="badge badge-teal" style="margin-left:auto;">${d.usesMethod || ''}</span>
                  <button class="btn btn-sm derivation-remove-btn" data-slot-key="${entry.slotKey}" data-oid="${entry.derivationOid}"
                    style="margin-left:8px; color:var(--cdisc-error); border-color:var(--cdisc-error); padding:2px 8px; font-size:11px;">
                    Remove
                  </button>
                </summary>
                <div class="derivation-detail">
                  <table class="data-table">
                    <tbody>
                      <tr><td style="width:140px; font-weight:600;">OID</td><td><code>${d.oid}</code></td></tr>
                      <tr><td style="font-weight:600;">Output</td><td><code>${displayConcept(outputConceptDisplay)}</code></td></tr>
                      <tr><td style="font-weight:600;">Inputs</td><td>${inputBindings.map(b => `<code>${displayConcept(normalizeConcept(b))}</code>`).join(', ') || 'None'}</td></tr>
                      ${d.description ? `<tr><td style="font-weight:600;">Description</td><td>${d.description}</td></tr>` : ''}
                    </tbody>
                  </table>

                  ${hasBindings ? `
                  <div style="margin-top:16px;">
                    <div style="font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-gray); margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid var(--cdisc-border);">
                      Bindings
                    </div>
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Concept</th>
                          <th>Direction</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(d.bindings || []).map(b => `
                          <tr>
                            <td style="font-weight:600;">${b.methodRole || ''}</td>
                            <td><code>${displayConcept(normalizeConcept(b))}</code></td>
                            <td>${b.direction || 'input'}</td>
                            <td><span class="badge ${b.dataStructureRole === 'dimension' ? 'badge-teal' : 'badge-blue'}">${b.dataStructureRole || 'measure'}</span></td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                  ` : ''}

                  ${hasDimensions ? `
                  <div style="margin-top:16px;">
                    <div style="font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-gray); margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid var(--cdisc-border);">
                      Dimensions
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                      ${Object.keys(inherited).length > 0 ? `
                      <div>
                        <div style="font-weight:600; font-size:11px; margin-bottom:6px; color:var(--cdisc-text);">Inherited</div>
                        ${Object.entries(inherited).map(([dim, role]) => `
                          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                            <span class="badge badge-teal">${displayConcept(dim)}</span>
                            <span style="font-size:11px; color:var(--cdisc-gray);">${role}</span>
                          </div>
                        `).join('')}
                      </div>` : ''}
                      ${Object.keys(added).length > 0 ? `
                      <div>
                        <div style="font-weight:600; font-size:11px; margin-bottom:6px; color:var(--cdisc-text);">Added</div>
                        ${Object.entries(added).map(([dim, role]) => `
                          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                            <span class="badge badge-blue">${displayConcept(dim)}</span>
                            <span style="font-size:11px; color:var(--cdisc-gray);">${role}</span>
                          </div>
                        `).join('')}
                      </div>` : ''}
                    </div>
                  </div>
                  ` : ''}
                </div>
              </details>`;
          }).join('')}
        </div>
      </div>
    </div>`;
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
  return unresolved.every(s => {
    if (confirmedKeys.has(s.slotKey)) return true;
    return (spec.derivationChain || []).some(e => e.slotKey === s.slotKey);
  });
}

/**
 * Main render function for Step 6: Derivation Pipeline Builder.
 */
export function renderDerivationPipeline(container) {
  const study = appState.selectedStudy;
  const lib = appState.transformationLibrary;

  if (!study) { navigateTo(1); return; }

  // Find endpoints with analysis transformations
  const allEps = getAllEndpoints(study);
  const analysisEps = allEps.filter(ep => {
    const spec = appState.endpointSpecs?.[ep.id];
    return spec?.selectedTransformationOid && appState.selectedEndpoints.includes(ep.id);
  });

  if (analysisEps.length === 0) { navigateTo(5); return; }

  // Set active endpoint if needed
  if (!appState.activeEndpointId || !analysisEps.find(ep => ep.id === appState.activeEndpointId)) {
    appState.activeEndpointId = analysisEps[0].id;
  }

  const activeEp = analysisEps.find(ep => ep.id === appState.activeEndpointId);
  const activeSpec = appState.endpointSpecs[appState.activeEndpointId];
  const transformation = lib?.analysisTransformations?.find(t => t.oid === activeSpec.selectedTransformationOid);

  if (!transformation) { navigateTo(5); return; }

  // Initialize per-endpoint derivation state
  if (!activeSpec.derivationChain) activeSpec.derivationChain = [];
  if (!activeSpec.selectedDerivations) activeSpec.selectedDerivations = {};
  if (!activeSpec.confirmedTerminals) activeSpec.confirmedTerminals = [];

  // Compute unresolved concept slots
  const unresolved = getUnresolvedConcepts(transformation, activeSpec.derivationChain, lib);
  const confirmedKeys = new Set(activeSpec.confirmedTerminals.map(t => t.slotKey));

  // Split into actionable (have candidates), unconfirmed terminals, and skip confirmed
  const actionable = [];
  const unconfirmedTerminals = [];
  for (const slot of unresolved) {
    if (confirmedKeys.has(slot.slotKey)) continue;
    const candidates = findDerivationsForConcept(slot.concept, lib);
    if (candidates.length > 0) {
      actionable.push({ slot, candidates });
    } else {
      unconfirmedTerminals.push(slot);
    }
  }

  const isComplete = actionable.length === 0 && unconfirmedTerminals.length === 0;
  const allEndpointsComplete = analysisEps.every(ep => isDerivationComplete(appState.endpointSpecs[ep.id], lib));
  const hasWork = actionable.length > 0 || unconfirmedTerminals.length > 0;

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Derivation Pipeline</h2>
        <p style="color:var(--cdisc-gray); font-size:13px; margin-top:4px;">
          Build the derivation chain step by step for each endpoint
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-config">&larr; Back to Summary</button>
        <button class="btn btn-primary" id="btn-add-esap" ${!allEndpointsComplete ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>Proceed to eSAP</button>
      </div>
    </div>

    <!-- Endpoint Selector -->
    <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
      ${analysisEps.map(ep => {
        const isActive = ep.id === appState.activeEndpointId;
        const epSpec = appState.endpointSpecs[ep.id];
        const epComplete = isDerivationComplete(epSpec, lib);
        return `
          <button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'} ep-tab-btn" data-ep-id="${ep.id}" style="font-size:12px;">
            ${ep.name}
            ${epComplete ? ' &#10003;' : ''}
          </button>`;
      }).join('')}
    </div>

    <!-- Pipeline Visualization -->
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section" style="margin-bottom:0;">
        <div class="transform-section-title">Dependency Visualization</div>
        <div class="pipeline">${renderPipelineVisualization(transformation, lib, activeSpec.derivationChain, activeSpec.confirmedTerminals)}</div>
      </div>
    </div>

    <!-- Selection Prompt -->
    ${hasWork ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section" style="margin-bottom:0;">
        <div class="transform-section-title">Select Next Template</div>
        ${actionable.map(({ slot, candidates }) =>
          renderCandidateCards(slot, candidates)
        ).join('')}

        ${unconfirmedTerminals.length > 0 ? renderTerminalCards(unconfirmedTerminals) : ''}
      </div>
    </div>
    ` : `
    <div class="card" style="margin-bottom:16px; border-color:var(--cdisc-success);">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:36px; height:36px; border-radius:50%; background:#D1FAE5; display:flex; align-items:center; justify-content:center; color:var(--cdisc-success); font-size:18px; font-weight:700;">&#10003;</div>
        <div>
          <div style="font-weight:600; color:var(--cdisc-text);">Pipeline Complete</div>
          <div style="font-size:12px; color:var(--cdisc-gray); margin-top:2px;">
            All derivation dependencies have been resolved.
            ${activeSpec.confirmedTerminals.length > 0
              ? `Source data: ${activeSpec.confirmedTerminals.map(t => {
                  const role = t.roleLabel ? ` (${t.roleLabel})` : '';
                  return `<code>${displayConcept(t.concept)}${role}</code>`;
                }).join(', ')}`
              : ''}
          </div>
        </div>
      </div>
    </div>
    `}

    <!-- Selected Derivations Accordion -->
    ${renderSelectedAccordion(lib, activeSpec.derivationChain)}
  `;

  // Wire derivation pick buttons
  container.querySelectorAll('.derivation-pick-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotKey = btn.dataset.slotKey;
      const concept = btn.dataset.concept;
      const oid = btn.dataset.oid;

      activeSpec.derivationChain.push({ slotKey, concept, derivationOid: oid });
      activeSpec.selectedDerivations[slotKey] = oid;

      renderDerivationPipeline(container);
    });
  });

  // Candidate card click (whole card is clickable)
  container.querySelectorAll('.derivation-candidate-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.derivation-pick-btn') || e.target.closest('.terminal-confirm-btn')) return;
      const btn = card.querySelector('.derivation-pick-btn') || card.querySelector('.terminal-confirm-btn');
      if (btn) btn.click();
    });
  });

  // Terminal confirm buttons
  container.querySelectorAll('.terminal-confirm-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotKey = btn.dataset.slotKey;
      const concept = btn.dataset.concept;
      const roleLabel = btn.dataset.roleLabel || '';
      if (!activeSpec.confirmedTerminals.find(t => t.slotKey === slotKey)) {
        activeSpec.confirmedTerminals.push({ slotKey, concept, roleLabel });
      }
      renderDerivationPipeline(container);
    });
  });

  // Remove buttons in accordion
  container.querySelectorAll('.derivation-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
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

        // Remove downstream entries (children of this derivation)
        if (removedDeriv) {
          removeDownstream(removedDeriv, lib, activeSpec);
        }
      }

      renderDerivationPipeline(container);
    });
  });

  // Wire endpoint tab buttons
  container.querySelectorAll('.ep-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.activeEndpointId = btn.dataset.epId;
      renderDerivationPipeline(container);
    });
  });

  // Navigation
  container.querySelector('#btn-back-config').addEventListener('click', () => navigateTo(5));

  const addBtn = container.querySelector('#btn-add-esap');
  if (allEndpointsComplete) {
    addBtn.addEventListener('click', () => {
      navigateTo(7);
    });
  }
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

    // Remove from confirmed terminals
    const termIdx = spec.confirmedTerminals.findIndex(t => t.slotKey === childSlotKey);
    if (termIdx !== -1) {
      spec.confirmedTerminals.splice(termIdx, 1);
    }

    // Remove from derivation chain
    const chainIdx = spec.derivationChain.findIndex(e => e.slotKey === childSlotKey);
    if (chainIdx !== -1) {
      const entry = spec.derivationChain[chainIdx];
      const childDeriv = derivations.find(d => d.oid === entry.derivationOid);
      spec.derivationChain.splice(chainIdx, 1);
      delete spec.selectedDerivations[childSlotKey];

      if (childDeriv) {
        removeDownstream(childDeriv, lib, spec);
      }
    }
  }
}
