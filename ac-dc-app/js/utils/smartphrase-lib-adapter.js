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
 *   slice constraint `.dimension`  <- constraint.conceptCategory, when the
 *                                      constraint is category-keyed; left
 *                                      absent (not merely undefined — see
 *                                      adaptTransformation) when the
 *                                      constraint is `concept`-keyed instead,
 *                                      e.g. `concept: "Parameter"`. Which one
 *                                      a given constraint uses is a v06 fact,
 *                                      not something this adapter chooses.
 *   tpl.outputDataStructure.measures <- methodOutputSlotMapping (analysis) or
 *                                      output measure bindings (derivation)
 *   method.conceptId / .label      <- method.oid / method.name
 *
 * `formula` and `configurations` are identical between method schema 0.8.0 and
 * 0.9.1, so they pass through by reference.
 *
 * NOT adapted — `tpl.sliceKeys` passes through unchanged (by spread) with its
 * v06 `dimension` values (e.g. "Parameter", "AnalysisVisit"). The engine
 * matches sliceKeys against a bound concept's `conceptCategory`
 * ("ParameterDimension", "VisitDimension", …) or `kind`
 * (smartphrase-engine.js constructModelView), so under v06 those two
 * sliceKeys resolve to `value: null` today. This is the same concept-vs-
 * category gap as the slice-constraint `dimension` above; resolving a
 * concrete concept to its dimension category is deferred to the later
 * slice-resolution phase, not fixed here. See
 * scripts/verify_smartphrase_adapter.mjs for the pinning assertion.
 */

/** Adapt one transformation. Returns a new object; the input is untouched. */
function adaptTransformation(t) {
  const slices = (t.slices || []).map(sl => ({
    ...sl,
    constraints: (sl.constraints || []).map(c => {
      // v07 calls this `dimension`. v06 stores dimensions two ways:
      // - `conceptCategory` (e.g. "ParameterDimension") on 4 constraints; or
      // - `concept` (e.g. "Parameter") on 2 constraints.
      // Mapping a concrete concept to its dimension category is deferred to the
      // slice-resolution phase. When `concept`-keyed, no `dimension` key is
      // added at all — not a key holding `undefined` — so a plain `'dimension'
      // in constraint` presence check still reports it as absent, matching
      // what a v07-shaped constraint that never had this field would look
      // like. The original `concept` value survives via spread for that phase.
      const dimension = c.dimension || c.conceptCategory;
      return dimension === undefined ? { ...c } : { ...c, dimension };
    })
  }));

  // Two v06 shapes carry outputs, split by transformation type:
  //   analysis   -> methodOutputSlotMapping  { slotName: Concept }
  //   derivation -> output bindings with dataStructureRole 'measure'
  // For T.CFB_ANCOVA the mapping's concepts (LSMeans, Contrasts, Type3Tests,
  // ParameterEstimates, FitStatistics) are exactly v07's
  // outputDataStructure.measures concepts, so this is faithful, not a guess.
  // No transformation carries both shapes (0 of 25); if one ever did,
  // methodOutputSlotMapping takes precedence and bindings-derived outputs are silently dropped.
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
    // TODO: the engine hardcodes this into
    // "Transformation Library v" + library_version + " (methods_02)"
    // (smartphrase-engine.js constructModelView). Once this adapter is wired
    // into a live surface, that will render "Transformation Library v0.6
    // (methods_02)" — a false provenance claim, since v06 lives on this
    // branch, not on methods_02. Not reachable yet (nothing imports this
    // adapter outside scripts/verify_smartphrase_adapter.mjs); fix the
    // provenance string before this adapter ships.
    library_version: v06.version,
    configurationOptions: v06.configurationOptions,
    roleDefinitions: v06.roleDefinitions,
    // The ported engine renders `phrase_template` (smartphrase-engine.js:145)
    // and never reads `phrase_template_slotted`. Where a slotted form exists,
    // swap it into the field the engine actually looks at, so the six
    // affected phrases (e.g. SP_METHOD_ANCOVA) keep their {method}-style
    // slot instead of silently losing it. This is safe: the *existing*
    // engine (js/utils/phrase-engine.js) reads state.transformationLibrary
    // .smartPhrases, the raw parsed JSON from data-loader.js — never this
    // adapter's output — so it still sees the plain v06 phrase_template.
    // Do not "simplify" this back to `v06.smartPhrases` by reference.
    smartPhrases: v06.smartPhrases.map(p =>
      p.phrase_template_slotted ? { ...p, phrase_template: p.phrase_template_slotted } : p),
    transformations: all.map(adaptTransformation),
    methods: adaptedMethods
  };
}
