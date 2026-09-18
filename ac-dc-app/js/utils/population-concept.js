/**
 * The Population dimension as a concept rather than a literal.
 *
 * A population is never identified by a flag's value: population flags are
 * Y/N by construction, so "Y" names nothing. The identity lives either in the
 * study's own USDM population (what the SPEC layer stores) or in which flag
 * column represents it (what the EXECUTION layer chooses). "Y" is a constant
 * the projection supplies for itself.
 *
 * This module owns that vocabulary: the identity keys
 * `concept-variable-mappings.json` declares in
 * `<model>.dimensions.Population.byDataType`, the labels those columns carry,
 * and the rule for turning any of it into a where-clause.
 */

/**
 * Display label for a population identity key.
 *
 * Derived from the mapping file's own `populationFlags[].label` ("Intent-To-Treat
 * Population Flag" -> "Intent-To-Treat"), so the wording and casing stay CDISC's
 * rather than this module's. Falls back to humanising the key when no mapping is
 * to hand -- a picker rendered before the mappings load still reads sensibly.
 */
export function populationLabel(key, mappings, model = 'adam') {
  if (!key) return key;
  const variable = populationVariable(key, mappings, model);
  const label = populationFlagMeta(mappings, model, variable)?.label;
  if (label) return label.replace(/\s*Population\s+Flag$/i, '').trim();
  // Anything the model does not declare as an identity is someone else's
  // identifier — a USDM population id such as "AP_1" — and belongs on screen
  // exactly as it was minted. Only identity-shaped keys get humanised, for
  // the case where the mappings have not loaded yet.
  return /^[a-z][a-z_]*$/.test(key)
    ? key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : key;
}

/** The ADaM variable metadata row for a population flag column. */
function populationFlagMeta(mappings, model, variable) {
  if (!variable) return null;
  const flags = mappings?.[model]?.standardVariables?.SubjectLevel?.populationFlags || [];
  return flags.find(f => f.name === variable) || null;
}

/**
 * The variable that represents this population in a given source model.
 *
 * Reads `byDataType`, which is the bridge the mapping file already
 * maintains — so FHIR (`Group.member`) and OMOP (cohort table) resolve
 * through the same call rather than through a model-specific branch.
 */
export function populationVariable(key, mappings, model = 'adam') {
  return populationVariableIn(mappings?.[model], key);
}

/** As `populationVariable`, against an already-selected model's map. */
export function populationVariableIn(modelMap, key) {
  if (!key) return null;
  return modelMap?.dimensions?.Population?.byDataType?.[key] ?? null;
}

/** The codelist value a population flag carries for "in this population". */
export const POPULATION_FLAG_VALUE = 'Y';

const FLAG_VALUES = new Set(['Y', 'N']);

/**
 * Coerce a stored Population value to an identity key.
 *
 * Specs written before the dimension carried a concept hold the flag's
 * VALUE ("Y"), which names no population — every flag holds it. Such a
 * value normalizes to null so the caller can show it as unresolved
 * instead of inventing an identity the data never recorded.
 */
export function normalizePopulation(value) {
  if (!value) return null;
  return FLAG_VALUES.has(String(value).toUpperCase()) ? null : value;
}

/**
 * The (variable, value) pair that filters a dataset to a population.
 *
 * The value is always the flag constant; only the column varies. It is chosen
 * in this order:
 *
 *   1. `preferredVariable` — what the author picked in the execution layer.
 *   2. the column mapped to `key`, when `key` is one of the model's own
 *      identities (`safety` -> SAFFL).
 *   3. the dimension's declared default (the first of "ITTFL/SAFFL/FASFL").
 *
 * A spec normally names the study's OWN population ("Population_1"), which
 * says nothing about which flag implements it — that is an execution-layer
 * choice. Case 3 therefore reports `assumed: true`, so a projection can say it
 * guessed instead of presenting the guess as specified.
 *
 * Returns null when the value is unresolved (a bare "Y") or no column exists.
 */
export function populationWhereClause(key, modelMap, preferredVariable = null) {
  if (!key) return null;
  if (preferredVariable) {
    return { variable: preferredVariable, value: POPULATION_FLAG_VALUE, assumed: false };
  }
  const mapped = populationVariableIn(modelMap, key);
  if (mapped) return { variable: mapped, value: POPULATION_FLAG_VALUE, assumed: false };

  const declared = modelMap?.dimensions?.Population?.variable;
  const fallback = typeof declared === 'string' ? declared.split('/')[0].trim() : null;
  return fallback ? { variable: fallback, value: POPULATION_FLAG_VALUE, assumed: true } : null;
}
