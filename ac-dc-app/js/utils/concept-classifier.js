/**
 * Concept classification helpers driven by the DC concept model.
 *
 * The app uses an 'Observation' pseudo-category (synthesized in
 * endpoint-spec.js at the top of getConceptCategoryOptions) that is
 * NOT declared as a DC concept — it represents directly-collected
 * observation data rather than a derivation. These helpers centralize
 * the checks that used to be hardcoded string comparisons, so the
 * vocabulary stays in the model files.
 *
 * All functions take the DC model as an explicit argument and do NOT
 * import appState, so they're pure and testable.
 */

/**
 * Return the set of all DC concept names declared in the model, flattened
 * across categories.
 *
 * @param {object} dcModel
 * @returns {Set<string>}
 */
function getDcConceptNames(dcModel) {
  const names = new Set();
  const categories = dcModel?.categories || {};
  for (const cat of Object.values(categories)) {
    const concepts = cat?.concepts || {};
    for (const name of Object.keys(concepts)) names.add(name);
  }
  return names;
}

/**
 * Look up a DC concept definition by name, searching across all categories.
 *
 * @param {string} conceptName
 * @param {object} dcModel
 * @returns {object|null}  the concept definition, or null if not found
 */
function findDcConcept(conceptName, dcModel) {
  if (!conceptName || !dcModel) return null;
  const categories = dcModel.categories || {};
  for (const cat of Object.values(categories)) {
    const concepts = cat?.concepts || {};
    if (concepts[conceptName]) return concepts[conceptName];
  }
  return null;
}

/**
 * True if conceptCategory is NOT a DC-defined derivation concept. In
 * practice this catches the app-synthesized 'Observation' pseudo-category
 * (directly-collected data with no derivation step).
 *
 * @param {string} conceptCategory
 * @param {object} dcModel
 * @returns {boolean}
 */
export function isObservationCategory(conceptCategory, dcModel) {
  if (!conceptCategory) return false;
  return !getDcConceptNames(dcModel).has(conceptCategory);
}

/**
 * Resolve a concept category to the DC concept that should stand in for it
 * during transformation-matching lookups. Returns the input unchanged if
 * it is already a DC concept or if no proxy is declared.
 *
 * Reads `dcModel.conceptProxies[conceptCategory].proxyConcept`.
 *
 * @param {string} conceptCategory
 * @param {object} dcModel
 * @returns {string}
 */
export function derivationProxyFor(conceptCategory, dcModel) {
  if (!conceptCategory) return conceptCategory;
  const proxies = dcModel?.conceptProxies || {};
  const entry = proxies[conceptCategory];
  if (entry && typeof entry === 'object' && entry.proxyConcept) {
    return entry.proxyConcept;
  }
  return conceptCategory;
}

/**
 * True if the DC concept's `result.valueType` is (or includes) 'NumericValue'.
 *
 * For concepts absent from the DC model (e.g. the 'Observation'
 * pseudo-category), follow the conceptProxies mapping once and re-check.
 * If no proxy is declared, returns false — the caller should fall back
 * to BC-level ocValueType inspection.
 *
 * @param {string} conceptName
 * @param {object} dcModel
 * @returns {boolean}
 */
export function isNumericOutputConcept(conceptName, dcModel) {
  if (!conceptName || !dcModel) return false;
  let concept = findDcConcept(conceptName, dcModel);
  if (!concept) {
    const proxyName = derivationProxyFor(conceptName, dcModel);
    if (proxyName && proxyName !== conceptName) {
      concept = findDcConcept(proxyName, dcModel);
    }
  }
  const valueType = concept?.result?.valueType;
  if (!valueType) return false;
  if (Array.isArray(valueType)) return valueType.includes('NumericValue');
  return valueType === 'NumericValue';
}
