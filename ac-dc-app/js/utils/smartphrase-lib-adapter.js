/**
 * Read-only v06 -> v07-field-name view for the ported smartphrase engine.
 *
 * The engine (ac-dc-app/js/utils/smartphrase-engine.js) was written against
 * Transformation Library v0.7. This branch runs v0.6, which the execution path
 * (Steps 6 and 8) reads directly — `bindings`, `slices`, `acCategory` and
 * `methodOutputSlotMapping` only exist in v06 and must not move.
 *
 * So the library is not reshaped; it is wrapped. Every adapted object spreads
 * its v06 original, so v06 fields remain available and nothing is mutated.
 *
 * Field mapping:
 *   lib.transformations            <- derivationTransformations + analysisTransformations
 *   tpl.conceptId                  <- tpl.oid
 *   tpl.label                      <- tpl.name
 *   tpl.inputDataStructure.slices  <- tpl.slices
 *   slice constraint `.dimension`  <- constraint.conceptCategory
 *   tpl.outputDataStructure.measures <- methodOutputSlotMapping (analysis) or
 *                                      output measure bindings (derivation)
 *   method.conceptId / .label      <- method.oid / method.name
 *
 * `formula` and `configurations` are identical between method schema 0.8.0 and
 * 0.9.1, so they pass through by reference.
 */

/** Adapt one transformation. Returns a new object; the input is untouched. */
function adaptTransformation(t) {
  const slices = (t.slices || []).map(sl => ({
    ...sl,
    constraints: (sl.constraints || []).map(c => ({
      ...c,
      // v07 calls this `dimension`; v06 carries the same value as
      // `conceptCategory` (e.g. "ParameterDimension") or, on some entries,
      // already as `dimension`.
      dimension: c.dimension || c.conceptCategory
    }))
  }));

  // Two v06 shapes carry outputs, split by transformation type:
  //   analysis   -> methodOutputSlotMapping  { slotName: Concept }
  //   derivation -> output bindings with dataStructureRole 'measure'
  // For T.CFB_ANCOVA the mapping's concepts (LSMeans, Contrasts, Type3Tests,
  // ParameterEstimates, FitStatistics) are exactly v07's
  // outputDataStructure.measures concepts, so this is faithful, not a guess.
  const slotMapping = t.methodOutputSlotMapping || {};
  const measures = Object.keys(slotMapping).length
    ? Object.entries(slotMapping).map(([output, concept]) => ({ output, concept }))
    : (t.bindings || [])
        .filter(b => b.direction === 'output' && b.dataStructureRole === 'measure')
        .map(b => ({ output: b.methodRole, concept: b.concept }));

  return {
    ...t,
    conceptId: t.oid,
    label: t.name,
    inputDataStructure: { slices },
    outputDataStructure: { measures }
  };
}

/** Adapt one method definition (schema 0.8.0) to the names the engine reads. */
export function adaptV06Method(m) {
  return { ...m, conceptId: m.oid, label: m.label || m.name };
}

/**
 * Adapt the whole v06 library.
 *
 * @param {object} v06      the parsed ACDC_Transformation_Library_v06.json
 * @param {object} methods  optional map of oid -> method JSON (schema 0.8.0)
 * @returns {object} a library object the engine's ctxOf() accepts
 */
export function adaptV06Library(v06, methods = {}) {
  const all = [
    ...(v06.derivationTransformations || []),
    ...(v06.analysisTransformations || [])
  ];

  const adaptedMethods = {};
  for (const [oid, m] of Object.entries(methods)) {
    adaptedMethods[oid] = adaptV06Method(m);
  }

  return {
    library_version: v06.version,
    configurationOptions: v06.configurationOptions,
    roleDefinitions: v06.roleDefinitions,
    smartPhrases: v06.smartPhrases,
    transformations: all.map(adaptTransformation),
    methods: adaptedMethods
  };
}
