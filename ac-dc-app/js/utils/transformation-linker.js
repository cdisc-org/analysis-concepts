/**
 * Links transformations to methods, builds dependency chains,
 * and maps output slots to AC concepts.
 */

/**
 * Build the dependency chain for a transformation by tracing input/output
 * concept bindings through the derivation graph.
 *
 * Walks from the analysis transformation's inputBindings (skipping dimensional
 * bindings) and matches each required concept against derivations' outputConcept.
 * Recurses through each matched derivation's inputConcepts the same way.
 *
 * Returns an ordered array of nodes from leaf derivations to the analysis itself.
 */
export function buildDependencyChain(transformation, library) {
  const derivations = library.derivationTransformations || [];
  const visited = new Set();
  const ordered = [];

  // Find all derivations whose outputConcept matches a required concept
  function visitConcept(concept) {
    for (const d of derivations) {
      if (d.outputConcept === concept && !visited.has(d.oid)) {
        visited.add(d.oid);

        // Recurse into this derivation's own inputConcepts
        for (const inputConcept of (d.inputConcepts || [])) {
          visitConcept(inputConcept);
        }

        ordered.push({
          oid: d.oid,
          name: d.name,
          produces: d.outputConcept || '',
          method: d.usesMethod || '',
          description: d.description || ''
        });
      }
    }
  }

  // Start from the analysis transformation's non-dimensional inputBindings
  for (const binding of (transformation.inputBindings || [])) {
    if (binding.type === 'dimensional') continue;
    visitConcept(binding.concept);
  }

  // Add the analysis transformation itself at the end
  ordered.push({
    oid: transformation.oid,
    name: transformation.name,
    produces: transformation.acCategory || '',
    method: transformation.usesMethod,
    description: transformation.description || ''
  });

  return ordered;
}

/**
 * Find all derivation transformations that produce a given concept.
 */
export function findDerivationsForConcept(concept, library) {
  return (library.derivationTransformations || [])
    .filter(d => d.outputConcept === concept);
}

/**
 * Build an interactive pipeline graph for a transformation.
 * Returns an array of PipelineSlot trees for each non-dimensional inputBinding.
 *
 * Each PipelineSlot: {
 *   key: string,              // unique key for state tracking
 *   concept: string,          // required concept (e.g., "C.Change")
 *   methodRole: string,       // e.g., "response"
 *   candidates: Derivation[], // derivations producing this concept
 *   selected: Derivation|null,// auto or user-selected
 *   status: 'auto'|'choice'|'terminal',
 *   children: PipelineSlot[]  // recursive slots for selected derivation's inputConcepts
 * }
 */
export function buildPipelineGraph(transformation, library, selectedDerivations = {}) {
  const visited = new Set();

  function buildSlot(concept, parentKey, index) {
    const key = `${parentKey}/${concept}/${index}`;
    if (visited.has(key)) return null;
    visited.add(key);

    const candidates = findDerivationsForConcept(concept, library);
    let status, selected = null;

    if (candidates.length === 0) {
      status = 'terminal';
    } else if (candidates.length === 1) {
      status = 'auto';
      selected = candidates[0];
    } else {
      status = 'choice';
      const chosenOid = selectedDerivations[key];
      if (chosenOid) {
        selected = candidates.find(c => c.oid === chosenOid) || null;
      }
    }

    const children = [];
    if (selected) {
      const seen = new Map();
      for (const ic of (selected.inputConcepts || [])) {
        const idx = seen.get(ic) || 0;
        seen.set(ic, idx + 1);
        const child = buildSlot(ic, selected.oid, idx);
        if (child) children.push(child);
      }
    }

    return { key, concept, methodRole: '', candidates, selected, status, children };
  }

  const slots = [];
  const bindings = (transformation.inputBindings || [])
    .filter(b => b.type !== 'dimensional');

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const slot = buildSlot(b.concept, transformation.oid, i);
    if (slot) {
      slot.methodRole = b.methodRole || '';
      slots.push(slot);
    }
  }

  return slots;
}

/**
 * Compute the set of concept **slots** that still need resolution.
 *
 * Each slot has a unique key (parentOid/concept/index) so that duplicate
 * concepts (e.g., two C.Measure inputs with different method roles) are
 * tracked independently.
 *
 * Returns an array of { slotKey, concept, roleLabel } objects.
 *
 * @param {Object} transformation - The analysis transformation
 * @param {Array} derivationChain - Array of { slotKey, concept, derivationOid }
 * @param {Object} library - The transformation library
 * @returns {{ slotKey: string, concept: string, roleLabel: string }[]}
 */
export function getUnresolvedConcepts(transformation, derivationChain, library) {
  const derivations = library.derivationTransformations || [];

  // Build set of resolved slot keys
  const resolvedKeys = new Set((derivationChain || []).map(e => e.slotKey));

  // Start from the analysis transformation's non-dimensional inputBindings
  const allSlots = [];
  const bindings = (transformation.inputBindings || [])
    .filter(b => b.type !== 'dimensional');

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const slotKey = `${transformation.oid}/${b.concept}/${i}`;
    const roleLabel = b.methodRole || '';
    allSlots.push({ slotKey, concept: b.concept, roleLabel, parentOid: transformation.oid });
  }

  // For each selected derivation, add its inputConcepts as new slots
  for (const entry of (derivationChain || [])) {
    const deriv = derivations.find(d => d.oid === entry.derivationOid);
    if (!deriv) continue;
    const roleMapping = deriv.methodRoleMapping || {};
    const roleKeys = Object.keys(roleMapping);
    const inputConcepts = deriv.inputConcepts || [];

    // Track per-concept index within this derivation
    const conceptCount = new Map();
    for (let i = 0; i < inputConcepts.length; i++) {
      const ic = inputConcepts[i];
      const idx = conceptCount.get(ic) || 0;
      conceptCount.set(ic, idx + 1);
      const childSlotKey = `${deriv.oid}/${ic}/${idx}`;

      // Derive role label from methodRoleMapping by matching concept and index
      let roleLabel = '';
      if (roleKeys.length > 0) {
        // Find the i-th role key that references this concept
        const conceptRoles = roleKeys.filter(k => roleMapping[k].startsWith(ic));
        roleLabel = conceptRoles[idx] || roleKeys[i] || '';
      }

      allSlots.push({ slotKey: childSlotKey, concept: ic, roleLabel, parentOid: deriv.oid });
    }
  }

  // Filter to unresolved: slot not in resolvedKeys and not a confirmed terminal
  return allSlots.filter(slot => !resolvedKeys.has(slot.slotKey));
}

/**
 * Get the output slot mapping for a transformation, enriched with
 * AC result pattern details.
 */
export function getOutputMapping(transformation, acModel) {
  const mapping = transformation.methodOutputSlotMapping || {};
  const resultPatterns = acModel.resultPatterns || {};

  return Object.entries(mapping).map(([slot, patternId]) => {
    // resultPatterns is an object keyed by pattern name (e.g., "LSMeans")
    const pattern = resultPatterns[patternId];
    return {
      slot,
      patternId,
      patternName: patternId,
      description: pattern?.definition || '',
      constituents: pattern?.constituents || [],
      identifiedBy: pattern?.identifiedBy || []
    };
  });
}

/**
 * Get input binding details for a transformation.
 */
export function getInputBindings(transformation) {
  return (transformation.inputBindings || []).map(binding => ({
    role: binding.methodRole,
    concept: binding.concept,
    from: binding.from || null,
    type: binding.type || 'concept',
    description: binding.description || ''
  }));
}

/**
 * Get method configurations with their current values and available options.
 * Method configurations is an array of { name, dataType, defaultValue, enumValues, description }.
 */
export function getMethodConfigurations(method) {
  const configs = method.configurations || [];
  if (!Array.isArray(configs)) return [];

  return configs.map(cfg => ({
    key: cfg.name,
    label: (cfg.name || '').replace(/_/g, ' '),
    description: cfg.description || '',
    type: cfg.dataType || 'string',
    default: cfg.defaultValue,
    options: cfg.enumValues || [],
    value: cfg.defaultValue
  }));
}

/**
 * Get inherited and added dimensions for display.
 */
export function getDimensions(transformation) {
  const inherited = transformation.inheritedDimensions || {};
  const added = transformation.addedDimensions || {};

  return {
    inherited: Object.entries(inherited).map(([dim, role]) => ({ dimension: dim, role })),
    added: Object.entries(added).map(([dim, role]) => ({ dimension: dim, role }))
  };
}
