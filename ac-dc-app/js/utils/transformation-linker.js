/**
 * Links transformations to methods, builds dependency chains,
 * and maps output slots to AC concepts.
 */

import { normalizeConcept } from './concept-display.js';

/**
 * Normalize a transformation object from old field names to new.
 * Handles backward compatibility during migration:
 * - inputBindings/inputConcepts → bindings
 * - outputConcept → output binding
 * - dimensionalSlices → sliceKeys
 * - type → dataStructureRole
 * - dimensionConstraints → slice
 */
export function normalizeTransformation(t) {
  if (!t) return t;
  // Field renames
  if (t.inputBindings && !t.bindings) t.bindings = t.inputBindings;
  if (t.inputConcepts && !t.bindings) {
    t.bindings = (t.inputConcepts || []).map(ic => ({
      ...ic, direction: 'input', dataStructureRole: 'measure'
    }));
  }
  // outputConcept → output binding
  if (t.outputConcept && !t.bindings?.some(b => b.direction === 'output')) {
    (t.bindings = t.bindings || []).push({
      concept: t.outputConcept, direction: 'output', dataStructureRole: 'measure',
      methodRole: 'result'
    });
  }
  // dimensionalSlices → sliceKeys
  if (t.dimensionalSlices && !t.sliceKeys) {
    t.sliceKeys = Object.entries(t.dimensionalSlices)
      .filter(([_, def]) => def.configurable)
      .map(([dim, def]) => ({ dimension: dim, source: def.source || null }));
  }
  // Per-binding normalization
  for (const b of (t.bindings || [])) {
    if (b.type === 'dimensional' && !b.dataStructureRole) b.dataStructureRole = 'dimension';
    if (!b.dataStructureRole) b.dataStructureRole = b.concept?.startsWith('C.') ? 'measure' : 'dimension';
    if (!b.direction) b.direction = 'input';
    // dimensionConstraints → namedSlice inline (temporary compat)
    if (b.dimensionConstraints && !b.slice) {
      const key = Object.values(b.dimensionConstraints)[0]?.toLowerCase();
      if (key) b.slice = key;
    }
  }
  return t;
}

/**
 * Get the output concept from a derivation transformation.
 * Reads from bindings (new format) or outputConcept (legacy).
 */
function getOutputConcept(d) {
  const outputBinding = (d.bindings || []).find(b => b.direction === 'output');
  return outputBinding?.concept || d.outputConcept || '';
}

/**
 * Get input bindings from a transformation, filtering to direction=input.
 * Handles both old (inputConcepts/inputBindings) and new (bindings) format.
 */
function getInputBindingsArray(t) {
  return (t.bindings || t.inputBindings || []).filter(b => b.direction !== 'output');
}

/**
 * Get measure-role input bindings (non-dimensional).
 */
function getMeasureBindings(t) {
  return getInputBindingsArray(t).filter(b => b.dataStructureRole !== 'dimension');
}

/**
 * Build the dependency chain for a transformation by tracing input/output
 * concept bindings through the derivation graph.
 *
 * Walks from the analysis transformation's measure bindings and matches each
 * required concept against derivations' output bindings.
 * Recurses through each matched derivation's input bindings the same way.
 *
 * Returns an ordered array of nodes from leaf derivations to the analysis itself.
 */
export function buildDependencyChain(transformation, library) {
  const derivations = library.derivationTransformations || [];
  const visited = new Set();
  const ordered = [];

  // Find all derivations whose output concept matches a required concept
  function visitConcept(concept) {
    for (const d of derivations) {
      if (getOutputConcept(d) === concept && !visited.has(d.oid)) {
        visited.add(d.oid);

        // Recurse into this derivation's input bindings
        for (const b of getMeasureBindings(d)) {
          visitConcept(normalizeConcept(b));
        }

        ordered.push({
          oid: d.oid,
          name: d.name,
          produces: getOutputConcept(d),
          method: d.usesMethod || '',
          description: d.description || ''
        });
      }
    }
  }

  // Start from the analysis transformation's measure bindings
  for (const binding of getMeasureBindings(transformation)) {
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
    .filter(d => getOutputConcept(d) === concept);
}

/**
 * Build an interactive pipeline graph for a transformation.
 * Returns an array of PipelineSlot trees for each measure inputBinding.
 *
 * Each PipelineSlot: {
 *   key: string,              // unique key for state tracking
 *   concept: string,          // required concept (e.g., "C.Change")
 *   methodRole: string,       // e.g., "response"
 *   candidates: Derivation[], // derivations producing this concept
 *   selected: Derivation|null,// auto or user-selected
 *   status: 'auto'|'choice'|'terminal',
 *   children: PipelineSlot[]  // recursive slots for selected derivation's input bindings
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
      for (const b of getMeasureBindings(selected)) {
        const concept = normalizeConcept(b);
        const idx = seen.get(concept) || 0;
        seen.set(concept, idx + 1);
        const child = buildSlot(concept, selected.oid, idx);
        if (child) {
          child.methodRole = b.methodRole || '';
          child.slice = b.slice || '';
          children.push(child);
        }
      }
    }

    return { key, concept, methodRole: '', slice: '', dataStructureRole: 'measure', candidates, selected, status, children };
  }

  const slots = [];
  // Include ALL input bindings (measures + dimensions) for the top-level transformation
  const bindings = getInputBindingsArray(transformation);

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const isDimension = b.dataStructureRole === 'dimension';

    // Dimension slots are terminal by definition — they don't recurse into derivations
    if (isDimension) {
      const key = `${transformation.oid}/${b.concept}/${i}`;
      if (!visited.has(key)) {
        visited.add(key);
        slots.push({
          key,
          concept: b.concept,
          methodRole: b.methodRole || '',
          slice: b.slice || '',
          dataStructureRole: 'dimension',
          candidates: [],
          selected: null,
          status: 'terminal',
          children: [],
          qualifierType: b.qualifierType || '',
          qualifierValue: b.qualifierValue || ''
        });
      }
    } else {
      const slot = buildSlot(b.concept, transformation.oid, i);
      if (slot) {
        slot.methodRole = b.methodRole || '';
        slot.slice = b.slice || '';
        slot.dataStructureRole = b.dataStructureRole || 'measure';
        slots.push(slot);
      }
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

  // Start from the analysis transformation's measure bindings
  const allSlots = [];
  const bindings = getMeasureBindings(transformation);

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const slotKey = `${transformation.oid}/${b.concept}/${i}`;
    const roleLabel = b.methodRole || '';
    allSlots.push({ slotKey, concept: b.concept, roleLabel, parentOid: transformation.oid });
  }

  // For each selected derivation, add its input bindings as new slots
  for (const entry of (derivationChain || [])) {
    const deriv = derivations.find(d => d.oid === entry.derivationOid);
    if (!deriv) continue;
    const inputBindings = getMeasureBindings(deriv);

    // Track per-concept index within this derivation
    const conceptCount = new Map();
    for (let i = 0; i < inputBindings.length; i++) {
      const ic = normalizeConcept(inputBindings[i]);
      const idx = conceptCount.get(ic) || 0;
      conceptCount.set(ic, idx + 1);
      const childSlotKey = `${deriv.oid}/${ic}/${idx}`;

      // Use binding's methodRole as role label
      const roleLabel = inputBindings[i].methodRole || '';

      allSlots.push({ slotKey: childSlotKey, concept: ic, roleLabel, parentOid: deriv.oid });
    }
  }

  // Filter to unresolved: slot not in resolvedKeys and not a confirmed terminal
  return allSlots.filter(slot => !resolvedKeys.has(slot.slotKey));
}

/**
 * Convert a PascalCase pattern name to snake_case output class name.
 * e.g., "LSMeans" → "ls_means", "Type3Tests" → "type3_tests"
 */
function patternToClass(patternId) {
  // Insert underscore before uppercase letters that follow lowercase letters or digits
  return patternId
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Resolve dimensions from the method's output_class, substituting
 * actual bound concept names for role names and interaction patterns.
 *
 * @param {Array} methodDimensions - The method's dimensions array (role names and interaction patterns)
 * @param {Array} bindings - Current input bindings (customInputBindings)
 * @param {Array} activeInteractions - Currently active interaction terms (concept:concept pairs)
 * @returns {Array} Resolved dimensions with actual concept/variable names
 */
function resolveIndexedBy(methodDimensions, bindings, activeInteractions) {
  if (!methodDimensions || !bindings) return [];

  // Build role → concepts lookup
  const roleConcepts = {};
  for (const b of bindings) {
    if (!roleConcepts[b.methodRole]) roleConcepts[b.methodRole] = [];
    roleConcepts[b.methodRole].push(b.concept);
  }

  const resolved = [];

  for (const entry of methodDimensions) {
    if (entry.includes(':')) {
      // Interaction pattern like "covariate:fixed_effect" or "fixed_effect:fixed_effect"
      const [roleA, roleB] = entry.split(':');
      const conceptsA = roleConcepts[roleA] || [];
      const conceptsB = roleConcepts[roleB] || [];

      // Only include interactions that are actually active
      if (roleA === roleB) {
        // Same-role interaction (e.g., fixed_effect:fixed_effect)
        for (let i = 0; i < conceptsA.length; i++) {
          for (let j = i + 1; j < conceptsA.length; j++) {
            const pair = `${conceptsA[i]}:${conceptsA[j]}`;
            if (activeInteractions?.includes(pair)) {
              resolved.push(pair);
            }
          }
        }
      } else {
        // Cross-role interaction (e.g., covariate:fixed_effect)
        for (const a of conceptsA) {
          for (const b of conceptsB) {
            const pair = `${a}:${b}`;
            if (activeInteractions?.includes(pair)) {
              resolved.push(pair);
            }
          }
        }
      }
    } else {
      // Main effect — expand role to bound concepts
      const concepts = roleConcepts[entry] || [];
      resolved.push(...concepts);
    }
  }

  return resolved;
}

/**
 * Map any remaining method role names in an dimensions array to
 * their bound concept names.  Items that are already concept names
 * (i.e. don't match any role) pass through unchanged.
 */
function resolveRoleNames(dimensions, bindings) {
  const roleConcepts = {};
  for (const b of bindings) {
    if (!roleConcepts[b.methodRole]) roleConcepts[b.methodRole] = [];
    roleConcepts[b.methodRole].push(b.concept);
  }

  const result = [];
  for (const entry of dimensions) {
    if (entry.includes(':')) {
      // Interaction pair — resolve each half
      const [a, b] = entry.split(':');
      const resolvedA = roleConcepts[a] ? roleConcepts[a][0] : a;
      const resolvedB = roleConcepts[b] ? roleConcepts[b][0] : b;
      result.push(`${resolvedA}:${resolvedB}`);
    } else if (roleConcepts[entry]) {
      result.push(...roleConcepts[entry]);
    } else {
      result.push(entry);
    }
  }
  return result;
}

/**
 * Get the output slot mapping for a transformation, enriched with
 * AC result pattern details AND resolved dimensions from the method.
 *
 * @param {Object} transformation - The transformation definition
 * @param {Object} acModel - The AC Concept Model
 * @param {Object} [method] - The loaded method JSON (optional, enables resolved dimensions)
 * @param {Array} [bindings] - Current input bindings (optional, for resolution)
 * @param {Array} [activeInteractions] - Active interaction terms (optional, for resolution)
 */
export function getOutputMapping(transformation, acModel, method, bindings, activeInteractions) {
  const mapping = transformation.methodOutputSlotMapping || {};
  const resultPatterns = acModel.resultPatterns || {};

  // Build output class lookup from method
  const outputClasses = {};
  if (method?.output_specification?.output_classes) {
    for (const oc of method.output_specification.output_classes) {
      outputClasses[oc.class] = oc;
    }
  }

  return Object.entries(mapping).map(([slot, patternId]) => {
    // resultPatterns is an object keyed by pattern name (e.g., "LSMeans")
    const pattern = resultPatterns[patternId];

    // Try to find the corresponding method output_class
    const className = patternToClass(patternId);
    const outputClass = outputClasses[className];

    // Resolve dimensions: prefer method-level resolved, fall back to AC model
    let dimensions = pattern?.dimensions || [];
    if (outputClass?.dimensions && bindings) {
      const resolved = resolveIndexedBy(outputClass.dimensions, bindings, activeInteractions);
      if (resolved.length > 0) {
        dimensions = resolved;
      }
    }

    // Ensure any remaining role names are resolved to concept names from bindings
    if (dimensions.length > 0 && bindings) {
      dimensions = resolveRoleNames(dimensions, bindings);
    }

    return {
      slot,
      patternId,
      patternName: patternId,
      description: pattern?.definition || '',
      constituents: pattern?.constituents || [],
      dimensions
    };
  });
}

/**
 * Get input binding details for a transformation.
 */
export function getInputBindings(transformation) {
  const bindings = (transformation.bindings || transformation.inputBindings || [])
    .filter(b => b.direction !== 'output');
  return bindings.map(binding => ({
    role: binding.methodRole,
    concept: binding.concept,
    from: binding.from || null,
    type: binding.dataStructureRole === 'dimension' ? 'dimensional' : 'concept',
    dataStructureRole: binding.dataStructureRole || (binding.concept?.startsWith('C.') ? 'measure' : 'dimension'),
    description: binding.description || '',
    qualifierType: binding.qualifierType || null,
    qualifierValue: binding.qualifierValue || null,
    slice: binding.slice || null
  }));
}

/**
 * Resolve transformation-level method config overrides from either format.
 * New format: [{ configurationName, value }]  Old format: { key: value }
 */
function resolveTransformationOverrides(transformation) {
  const mc = transformation?.methodConfigurations;
  if (!mc) return {};
  if (Array.isArray(mc)) {
    return Object.fromEntries(mc.map(c => [c.configurationName, c.value]));
  }
  return { ...mc };
}

/**
 * Build method configurations with 3-layer merge:
 * method defaults → transformation overrides → user overrides.
 * Returns array of config objects with effective value and source indicator.
 */
export function getMethodConfigurations(method, transformation = null, userOverrides = {}) {
  const configs = method?.configurations || [];
  if (!Array.isArray(configs)) return [];

  const txOverrides = resolveTransformationOverrides(transformation);
  const userOvr = userOverrides || {};

  return configs.map(cfg => {
    const key = cfg.name;
    let value = cfg.defaultValue;
    let source = 'method';

    if (key in txOverrides) {
      value = txOverrides[key];
      source = 'transformation';
    }
    if (key in userOvr) {
      value = userOvr[key];
      source = 'user';
    }

    return {
      key,
      label: (key || '').replace(/_/g, ' '),
      description: cfg.description || '',
      type: cfg.dataType || 'string',
      default: cfg.defaultValue,
      options: cfg.enumValues || [],
      value,
      source
    };
  });
}

/**
 * Get dimensions for display. With Option_B, dimensions come from bindings
 * with dataStructureRole: "dimension". Falls back to legacy fields if
 * no dimension bindings exist (unmigrated library).
 */
export function getDimensions(transformation) {
  const dimBindings = (transformation.bindings || []).filter(b => b.dataStructureRole === 'dimension');
  const sliceKeys = transformation.sliceKeys || [];

  if (dimBindings.length > 0) {
    return {
      dimensions: dimBindings.map(b => ({ dimension: b.concept, role: b.methodRole || 'dimension' })),
      slices: sliceKeys.map(sk => ({ dimension: sk.dimension, source: sk.source, configurable: true }))
    };
  }

  // Legacy fallback for unmigrated transformation library
  const inherited = transformation.inheritedDimensions || {};
  const added = transformation.addedDimensions || {};
  return {
    dimensions: [
      ...Object.entries(inherited).map(([dim, role]) => ({ dimension: dim, role })),
      ...Object.entries(added).map(([dim, role]) => ({ dimension: dim, role }))
    ],
    slices: sliceKeys.map(sk => ({ dimension: sk.dimension, source: sk.source, configurable: true }))
  };
}
