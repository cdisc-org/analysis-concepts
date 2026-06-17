/**
 * SmartPhrase resolution engine.
 *
 * Role metadata (labels, ordering, endpoint/manual contextSource) lives in
 * the transformation library at `roleDefinitions` — those describe the role
 * itself and are transformation metadata.
 *
 * Trigger predicates that decide when a role is implicitly satisfied by the
 * Step 3 endpoint spec are app runtime dynamics (they reference epSpec state)
 * and live in a separate app-local config file at
 * `ac-dc-app/data/phrase-role-config.json` under the top-level `triggers` key.
 * That file is loaded by data-loader.js as `state.phraseRoleAppConfig`.
 *
 * A `trigger` is a tiny declarative predicate with seven primitive kinds:
 *   - conceptCategoryInReferences       sp.references includes epSpec.conceptCategory
 *   - referencesInclude {value}         sp.references includes the literal value
 *   - hasLinkedBCs                      epSpec.linkedBCIds is non-empty
 *   - hasParameterName                  epSpec.parameterName is set
 *   - dimensionHasValue {dimension}     epSpec.dimensionValues[dimension] is truthy
 *   - anyOf {checks}                    any subcheck fires
 *   - all {checks}                      every subcheck fires
 */

// ---------------- Role registry accessors ----------------

/**
 * Return the Set of role names whose contextSource is 'endpoint' — these
 * roles are satisfied by the Step 3 endpoint spec and hidden from the
 * SmartPhrase palette.
 *
 * @param {object} library  transformationLibrary
 * @returns {Set<string>}
 */
export function getEndpointContextRoles(library) {
  const roles = library?.roleDefinitions?.roles || {};
  const out = new Set();
  for (const [name, def] of Object.entries(roles)) {
    if (def && def.contextSource === 'endpoint') out.add(name);
  }
  return out;
}

/**
 * Declared display order for roles in the SmartPhrase palette.
 *
 * @param {object} library
 * @returns {string[]}
 */
export function getRoleOrder(library) {
  return library?.roleDefinitions?.order || [];
}

/**
 * Human-readable label for a role.
 *
 * @param {string} role
 * @param {object} library
 * @returns {string}
 */
export function getRoleLabel(role, library) {
  return library?.roleDefinitions?.roles?.[role]?.label || role;
}

// ---------------- Trigger evaluator ----------------

/**
 * Evaluate a declarative trigger against a SmartPhrase + endpoint spec.
 * Private to this module.
 */
function evaluateTrigger(trigger, sp, epSpec) {
  if (!trigger || typeof trigger !== 'object') return false;
  const refs = sp?.references || [];
  const dims = epSpec?.dimensionValues || {};

  switch (trigger.kind) {
    case 'conceptCategoryInReferences':
      return refs.includes(epSpec?.conceptCategory);
    case 'referencesInclude':
      return refs.includes(trigger.value);
    case 'hasLinkedBCs':
      return (epSpec?.linkedBCIds?.length || 0) > 0;
    case 'hasParameterName':
      return !!epSpec?.parameterName;
    case 'dimensionHasValue':
      return !!dims[trigger.dimension];
    case 'anyOf':
      return (trigger.checks || []).some(c => evaluateTrigger(c, sp, epSpec));
    case 'all':
      return (trigger.checks || []).every(c => evaluateTrigger(c, sp, epSpec));
    default:
      return false;
  }
}

// ---------------- Implicit phrase derivation ----------------

/**
 * Derive SmartPhrase OIDs that are implicitly satisfied by the endpoint
 * spec. These OIDs feed into findMatchingTransformations alongside
 * explicit method selections.
 *
 * Driven by:
 *  - `library.roleDefinitions.roles[role].contextSource === 'endpoint'` to
 *    identify which roles are eligible for implicit satisfaction, AND
 *  - `phraseRoleAppConfig.triggers[role]` to supply the declarative
 *    predicate that decides whether each eligible role is actually satisfied
 *    by the current epSpec. Triggers live outside the transformation library
 *    because they reference runtime app state.
 *
 * No hardcoded per-role logic in this module.
 *
 * @param {object} epSpec              the Step 3 endpoint spec
 * @param {Array}  smartPhrases        library.smartPhrases
 * @param {object} library             transformationLibrary (for role metadata)
 * @param {object} phraseRoleAppConfig state.phraseRoleAppConfig (for trigger predicates)
 * @returns {string[]} array of implicitly-satisfied SmartPhrase OIDs
 */
export function deriveImplicitPhraseOids(epSpec, smartPhrases, library, phraseRoleAppConfig) {
  if (!epSpec?.conceptCategory) return [];
  const implicit = [];
  const endpointRoles = getEndpointContextRoles(library);
  const triggers = phraseRoleAppConfig?.triggers || {};

  for (const sp of smartPhrases || []) {
    if (!endpointRoles.has(sp.role)) continue;
    const trigger = triggers[sp.role];
    if (!trigger) continue;
    if (evaluateTrigger(trigger, sp, epSpec)) implicit.push(sp.oid);
  }
  return implicit;
}

// ---------------- Endpoint-context phrase lookup helper ----------------

/**
 * Find a SmartPhrase that (a) belongs to any endpoint-context role and
 * (b) references the given concept category in its `references` array.
 * Returns the first match, or null.
 *
 * Consolidates the previous scattered `sp.role === 'endpoint'` filters
 * across endpoint-spec.js. If new endpoint-context roles are added to
 * roleDefinitions, they are automatically considered.
 *
 * @param {Array} smartPhrases
 * @param {object} library
 * @param {string} conceptCategory
 * @returns {object|null}
 */
export function findEndpointContextPhraseForConcept(smartPhrases, library, conceptCategory) {
  if (!conceptCategory) return null;
  const endpointRoles = getEndpointContextRoles(library);
  for (const sp of smartPhrases || []) {
    if (!endpointRoles.has(sp.role)) continue;
    if ((sp.references || []).includes(conceptCategory)) return sp;
  }
  return null;
}

// ---------------- Phrase resolution and composition ----------------

/**
 * Resolve a single SmartPhrase template with given configuration values.
 */
export function resolvePhrase(phrase, config, displayOverrides = {}) {
  let resolved = phrase.phrase_template;
  for (const key of phrase.configurations) {
    const value = config[key];
    if (value) {
      const display = (displayOverrides[key] && displayOverrides[key][value]) || value;
      resolved = resolved.replace(`{${key}}`, display);
    }
  }
  return resolved;
}

/**
 * Compose a full sentence from an array of phrase entries.
 * Each entry: { oid, phrase, config }
 */
export function composeFullSentence(phraseEntries, library, displayOverrides = {}, syntaxPrefix = '') {
  const methodParts = phraseEntries
    .map(entry => {
      const sp = library.smartPhrases.find(p => p.oid === entry.oid);
      if (!sp) return '';
      return resolvePhrase(sp, entry.config, displayOverrides);
    })
    .filter(Boolean)
    .join(' ');
  return syntaxPrefix ? `${syntaxPrefix} ${methodParts}` : methodParts;
}

/**
 * Check if all configuration placeholders in a phrase are filled.
 */
export function isPhraseComplete(phrase, config) {
  return phrase.configurations.every(key => config[key] && config[key].trim() !== '');
}

/**
 * Find analysis transformations that match the set of composed SmartPhrase OIDs.
 * A match means all the user's chosen phrase OIDs are within the transformation's validSmartPhrases.
 */
export function findMatchingTransformations(phraseOids, library, implicitOids = []) {
  const allOids = [...new Set([...implicitOids, ...phraseOids])];
  if (!allOids.length) return [];

  const analyses = library.analysisTransformations || [];
  return analyses
    .map(t => {
      const validSet = new Set(t.validSmartPhrases || []);
      const matchCount = allOids.filter(oid => validSet.has(oid)).length;
      const coverage = matchCount / allOids.length;
      return { transformation: t, coverage, matchCount };
    })
    .filter(r => r.coverage >= 0.5) // at least 50% overlap
    .sort((a, b) => b.coverage - a.coverage || b.matchCount - a.matchCount)
    .map(r => r.transformation);
}

/**
 * Find derivation transformations that match a given SmartPhrase OID set.
 */
export function findMatchingDerivations(phraseOids, library) {
  const derivations = library.derivationTransformations || [];
  return derivations.filter(t => {
    const validSet = new Set(t.validSmartPhrases || []);
    return phraseOids.some(oid => validSet.has(oid));
  });
}

/**
 * Get the composed phrase template for a transformation with placeholders highlighted.
 */
export function getComposedPhraseHTML(transformation) {
  const phrase = transformation.composedPhrase || '';
  return phrase.replace(/\{(\w+)\}/g, '<span class="placeholder">{$1}</span>');
}

/**
 * Group SmartPhrases by their role for palette display.
 * Order follows library.roleDefinitions.order, then alphabetical for any
 * undeclared roles encountered.
 */
export function groupPhrasesByRole(smartPhrases, library) {
  const groups = {};
  for (const sp of smartPhrases || []) {
    const role = sp.role || 'other';
    if (!groups[role]) groups[role] = [];
    groups[role].push(sp);
  }

  const declaredOrder = getRoleOrder(library);
  const ordered = {};
  for (const role of declaredOrder) {
    if (groups[role]) ordered[role] = groups[role];
  }
  const remaining = Object.keys(groups)
    .filter(r => !(r in ordered))
    .sort();
  for (const role of remaining) {
    ordered[role] = groups[role];
  }
  return ordered;
}
