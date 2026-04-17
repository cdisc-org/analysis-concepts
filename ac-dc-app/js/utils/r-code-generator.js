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
export function generateExecutionPayload(endpointResolvedSpec, conceptMappings, overrides,
                                          methodDef, rImplementation,
                                          derivations, unitConversions, rImplCatalog,
                                          availableDatasets) {
  const adam = conceptMappings?.adam || {};

  // Strip $ui fields for clean spec
  const { $ui, ...cleanSpec } = endpointResolvedSpec || {};

  const specJson = JSON.stringify(cleanSpec, null, 2);
  const mappingJson = JSON.stringify(conceptMappings, null, 2);
  const methodJson = methodDef ? JSON.stringify(methodDef, null, 2) : 'null';
  const rImplJson = rImplementation ? JSON.stringify(rImplementation) : 'null';
  const overridesJson = overrides && Object.keys(overrides).length > 0
    ? JSON.stringify(overrides) : 'NULL';
  const derivationsJson = derivations && derivations.length > 0
    ? JSON.stringify(derivations, null, 2) : 'null';
  const unitConversionsJson = unitConversions
    ? JSON.stringify(unitConversions) : 'null';
  const rImplsJson = rImplCatalog
    ? JSON.stringify(rImplCatalog) : 'null';

  const datasetName = (cleanSpec.targetDataset || 'addata').toLowerCase();

  const bootstrapCode = [
    `# ═══════════════════════════════════════════════════════════════`,
    `# AC/DC Execution Bootstrap`,
    `# Passes specification + implementation metadata to the engine`,
    `# ═══════════════════════════════════════════════════════════════`,
    ``,
    `# Parse metadata from JSON`,
    `spec <- jsonlite::fromJSON(spec_json, simplifyVector = FALSE)`,
    `all_mappings <- jsonlite::fromJSON(mapping_json, simplifyVector = FALSE)`,
    `method_def <- jsonlite::fromJSON(method_json, simplifyVector = FALSE)`,
    `r_impl <- jsonlite::fromJSON(r_impl_json, simplifyVector = FALSE)`,
    ``,
    `# Extract target store mappings (default: adam for backward compatibility)`,
    `target_store <- spec$targetStore`,
    `if (is.null(target_store)) target_store <- "adam"`,
    `mappings <- all_mappings[[target_store]]`,
    `if (is.null(mappings)) mappings <- all_mappings$adam`,
    ``,
    `# Parse derivation chain and unit conversions (if present)`,
    `derivations <- if (exists("derivations_json")) jsonlite::fromJSON(derivations_json, simplifyVector = FALSE) else NULL`,
    `unit_conversions <- if (exists("unit_conversions_json")) jsonlite::fromJSON(unit_conversions_json, simplifyVector = FALSE) else NULL`,
    `r_impls <- if (exists("r_impls_json")) jsonlite::fromJSON(r_impls_json, simplifyVector = FALSE) else NULL`,
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
    `# Available datasets for dimension enrichment (all uploaded XPTs)`,
    `available_datasets <- c(${(availableDatasets || []).map(d => `"${d}"`).join(', ')})`,
    ``,
    `# Execute using the generic AC/DC engine (capture console output for diagnostics)`,
    `console_log <- capture.output({`,
    `  result <- tryCatch(`,
    `    acdc_execute(spec, mappings, dataset, overrides, method_def, r_impl,`,
    `                 derivations, unit_conversions, r_impls, all_mappings, available_datasets),`,
    `    error = function(e) list(engine_error = e$message)`,
    `  )`,
    `})`,
    `result$console <- paste(console_log, collapse = "\\n")`,
    ``,
    `# Return results as JSON`,
    `jsonlite::toJSON(result, auto_unbox = TRUE, pretty = TRUE)`,
  ].join('\n');

  return { specJson, mappingJson, methodJson, rImplJson, overridesJson,
           derivationsJson, unitConversionsJson, rImplsJson, bootstrapCode };
}

/**
 * Title-case normalize a facet value: "result.value" → "Result.Value"
 * Matches the canonical form used by ingest_to_concepts in the R engine.
 */
function normalizeFacetCase(facetValue) {
  return facetValue.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('.');
}

/**
 * Resolve <role> and <config> placeholders in a callTemplate, producing standalone code.
 * This mirrors the R engine's resolve_call_template() but runs client-side,
 * enabling resolved code display for languages without a browser engine (e.g. SAS).
 *
 * In concept-keyed mode, role placeholders resolve to concept keys (e.g.,
 * Measure.Result.Value, Treatment) which are the internal column names.
 *
 * @param {Object} impl              - Implementation entry (with callTemplate)
 * @param {Array}  bindings          - resolvedBindings from the analysis
 * @param {Object} overrides         - User variable overrides { conceptKey: varName }
 * @param {Object} adam              - The adam section of concept-variable-mappings.json (kept for compat)
 * @param {Object} configs           - Method configurations (e.g. { alpha: 0.05, ss_type: 'III' })
 * @param {string} [datasetName]     - Target dataset name (default: 'analysis_data')
 * @param {Array}  [outputConfiguration] - StudyOutputClassConfig[] for dimension narrowing
 * @returns {string} Resolved code with all placeholders substituted
 */
export function resolveCallTemplate(impl, bindings, overrides, adam, configs, datasetName, outputConfiguration) {
  if (!impl?.callTemplate) return '';
  let code = narrowTemplateForOutputConfig(impl.callTemplate, outputConfiguration, bindings, overrides, adam);

  // Build role → concept key(s) map from bindings.
  // A role can have multiple bindings (e.g. multiple fixed_effects), so we
  // accumulate arrays — mirroring the R engine's build_concept_var_map().
  const roleMap = {};
  for (const b of (bindings || [])) {
    if (b.direction === 'output') continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    const role = b.methodRole;
    if (!role) continue;

    // Build concept key from concept + qualifier (matching R engine logic)
    let conceptKey;
    if (b.qualifierType === 'facet' && b.qualifierValue) {
      conceptKey = `${concept}.${normalizeFacetCase(b.qualifierValue)}`;
    } else {
      // No facet qualifier — check if concept has facets in mappings
      // and resolve based on dataStructureRole (measure → Result.Value, attribute → Result.Unit)
      const entry = adam?.concepts?.[concept];
      if (entry?.facets) {
        const targetFacet = b.dataStructureRole === 'measure' ? 'Result.Value'
          : b.dataStructureRole === 'attribute' ? 'Result.Unit' : null;
        conceptKey = (targetFacet && entry.facets[targetFacet])
          ? `${concept}.${targetFacet}` : concept;
      } else {
        conceptKey = concept;
      }
    }

    // User override takes precedence over concept key
    const varName = overrides?.[conceptKey] || overrides?.[concept] || conceptKey;
    if (roleMap[role]) {
      roleMap[role].push(varName);
    } else {
      roleMap[role] = [varName];
    }
  }

  // Expand <role> placeholders using roleSeparator from implementation metadata.
  // R formula syntax: " + " (default), SAS statement syntax: " " (space).
  const separator = impl.roleSeparator || ' + ';
  const roles = Object.keys(roleMap).sort((a, b) => b.length - a.length);
  for (const role of roles) {
    code = code.replaceAll(`<${role}>`, roleMap[role].join(separator));
  }

  // Substitute <config> placeholders, applying language-specific mappings if available.
  // E.g., SAS needs alternative "two.sided" → "2", ss_type "III" → "3"
  const implConfigs = impl.configurations || {};
  for (const [key, val] of Object.entries(configs || {})) {
    const mapping = implConfigs[`${key}_mapping`];
    const mapped = (mapping && mapping[String(val)] != null) ? mapping[String(val)] : val;
    code = code.replaceAll(`<${key}>`, String(mapped));
  }

  // Substitute <dataset>
  code = code.replaceAll('<dataset>', datasetName || 'analysis_data');

  return code;
}

/**
 * Narrow <fixed_effect> in post-hoc lines of a callTemplate based on
 * outputConfiguration.  The model formula keeps ALL fixed effects, but
 * post-hoc lines (emmeans, LSMEANS, etc.) use only the selected ones.
 *
 * In concept-keyed mode, selected dimensions are already concept keys
 * (e.g., "Treatment", "AnalysisVisit") which are the column names.
 *
 * @param {string} template - The raw callTemplate string
 * @param {Array}  outputConfiguration - StudyOutputClassConfig[] from the resolved spec
 * @param {Array}  bindings - resolvedBindings (kept for compat)
 * @param {Object} overrides - User variable overrides
 * @param {Object} adam - Concept-variable mappings (kept for compat)
 * @returns {string} Template with narrowed <fixed_effect> in post-hoc lines
 */
function narrowTemplateForOutputConfig(template, outputConfiguration, bindings, overrides, adam) {
  if (!outputConfiguration?.length || !template.includes('<fixed_effect>')) return template;

  // Find the first output class with a dimension selection
  const oc = outputConfiguration.find(c => c.selectedDimensions?.length > 0);
  if (!oc) return template;

  // In concept-keyed mode, selected dimensions ARE the column names (concept keys)
  const selectedVars = [];
  for (const concept of oc.selectedDimensions) {
    if (concept.includes(':')) continue; // Skip interactions for formula factors
    const override = overrides?.[concept];
    selectedVars.push(override || concept);
  }
  if (selectedVars.length === 0) return template;

  const narrowed = selectedVars.join(' + ');

  // Narrow <fixed_effect> only in POST-HOC lines (after the model formula).
  const lines = template.split('\n');
  const modelLineIdx = lines.findIndex(l => l.includes('<response>'));
  return lines.map((line, i) => {
    if (i > modelLineIdx && line.includes('<fixed_effect>')) {
      return line.replaceAll('<fixed_effect>', narrowed);
    }
    return line;
  }).join('\n');
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
