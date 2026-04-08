/**
 * Execution Payload Generator for AC/DC Analysis Specifications.
 *
 * Instead of generating hardcoded R code, this module serializes the
 * endpoint's resolved specification and concept-variable mappings as JSON.
 * A generic R engine (acdc_engine.R) reads these JSONs and executes.
 */

/**
 * Generate the execution payload: spec JSON + mapping JSON + bootstrap R code.
 *
 * @param {Object} endpointResolvedSpec - The resolved endpoint object from appState.resolvedSpec.endpoints[]
 * @param {Object} conceptMappings     - concept-variable-mappings.json (full object)
 * @param {Object} [overrides]         - User variable overrides { concept: adamVar }
 * @returns {{ specJson: string, mappingJson: string, bootstrapCode: string }}
 */
export function generateExecutionPayload(endpointResolvedSpec, conceptMappings, overrides) {
  const adam = conceptMappings?.adam || {};

  // Strip $ui fields for clean spec
  const { $ui, ...cleanSpec } = endpointResolvedSpec || {};

  const specJson = JSON.stringify(cleanSpec, null, 2);
  const mappingJson = JSON.stringify(adam, null, 2);
  const overridesJson = overrides && Object.keys(overrides).length > 0
    ? JSON.stringify(overrides) : 'NULL';

  const datasetName = (cleanSpec.targetDataset || 'addata').toLowerCase();

  const bootstrapCode = [
    `# ═══════════════════════════════════════════════════════════════`,
    `# AC/DC Execution Bootstrap`,
    `# This code passes the specification to the generic AC/DC engine`,
    `# ═══════════════════════════════════════════════════════════════`,
    ``,
    `# Parse the specification and mappings from JSON`,
    `spec <- jsonlite::fromJSON(spec_json, simplifyVector = FALSE)`,
    `mappings <- jsonlite::fromJSON(mapping_json, simplifyVector = FALSE)`,
    ``,
    `# User variable overrides (selected in UI)`,
    overridesJson === 'NULL'
      ? `overrides <- NULL`
      : `overrides <- jsonlite::fromJSON(overrides_json, simplifyVector = FALSE)`,
    ``,
    `# Load the analysis dataset`,
    `dataset <- get("${datasetName}")`,
    `cat("Dataset: ${datasetName},", nrow(dataset), "rows\\n")`,
    ``,
    `# Execute using the generic AC/DC engine`,
    `result <- acdc_execute(spec, mappings, dataset, overrides)`,
    ``,
    `# Return results as JSON`,
    `jsonlite::toJSON(result, auto_unbox = TRUE, pretty = TRUE)`,
  ].join('\n');

  return { specJson, mappingJson, overridesJson, bootstrapCode };
}

/** Data type keys that are numeric (compatible with Quantity/NumericValue) */
const NUMERIC_TYPES = new Set(['decimal', 'integer', 'baseline']);
/** Data type keys that are categorical (compatible with CodeableConcept) */
const CATEGORICAL_TYPES = new Set(['code', 'string', 'id']);

/**
 * Get the available ADaM variable options for a concept, filtered by value type.
 *
 * @param {string} concept       - Concept name (e.g., "Change", "Treatment", "Parameter")
 * @param {Object} adam          - The adam section of concept-variable-mappings.json
 * @param {string} [valueType]   - Required value type from binding (e.g., "Quantity", "NumericValue", "CodeableConcept")
 * @param {string} [structRole]  - dataStructureRole ("measure" or "dimension")
 * @returns {string[]} Unique ADaM variable names compatible with the value type
 */
export function getVariableOptions(concept, adam, valueType, structRole) {
  const entry = adam?.concepts?.[concept] || adam?.dimensions?.[concept];
  if (!entry?.byDataType) return [];

  const bt = entry.byDataType;

  // If a numeric value type is required, only show numeric-compatible variables
  if (valueType && /quantity|numeric/i.test(valueType)) {
    const filtered = Object.entries(bt)
      .filter(([type]) => NUMERIC_TYPES.has(type))
      .map(([, varName]) => varName);
    if (filtered.length > 0) return [...new Set(filtered)];
  }

  // If a categorical value type is required, only show categorical variables
  if (valueType && /code|categor/i.test(valueType)) {
    const filtered = Object.entries(bt)
      .filter(([type]) => CATEGORICAL_TYPES.has(type))
      .map(([, varName]) => varName);
    if (filtered.length > 0) return [...new Set(filtered)];
  }

  // If structRole is measure, prefer numeric; if dimension, prefer categorical
  if (structRole === 'measure') {
    const numeric = Object.entries(bt)
      .filter(([type]) => NUMERIC_TYPES.has(type))
      .map(([, varName]) => varName);
    if (numeric.length > 0) return [...new Set(numeric)];
  }

  // Fallback: return all unique variables
  return [...new Set(Object.values(bt))];
}

/**
 * Get the default ADaM variable for a concept + dataStructureRole.
 */
export function getDefaultVariable(concept, dataStructureRole, adam) {
  const entry = adam?.concepts?.[concept] || adam?.dimensions?.[concept];
  if (!entry?.byDataType) return concept.toUpperCase();
  const bt = entry.byDataType;
  if (dataStructureRole === 'measure') {
    return bt.decimal || bt.code || bt.string || Object.values(bt)[0];
  }
  return bt.code || bt.string || bt.decimal || Object.values(bt)[0];
}
