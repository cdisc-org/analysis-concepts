/*
 * Proves the engine context builds from app-shaped inputs and that a saved spec converts
 * into an instance the engine resolves.
 *
 *   node scripts/verify_smartphrase_context.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { parseUSDM, getAllEndpoints } = await load("ac-dc-app/js/utils/usdm-parser.js");
const { buildSmartphraseContext, specToInstance, prepareSpec } =
  await load("ac-dc-app/js/utils/smartphrase-context.js");
const E = (await load("ac-dc-app/js/utils/smartphrase-engine.js")).default;

const v06 = JSON.parse(fs.readFileSync(
  path.join(root, "lib/transformations/ACDC_Transformation_Library_v06.json"), "utf8"));
const methods = {};
const methodsDir = path.join(root, "lib/methods/analyses");
for (const f of fs.readdirSync(methodsDir)) {
  if (!f.endsWith(".json")) continue;
  const m = JSON.parse(fs.readFileSync(path.join(methodsDir, f), "utf8"));
  methods[m.oid] = m;
}
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, "ac-dc-app/data/usdm/studies.json"), "utf8"));
const study = parseUSDM(JSON.parse(fs.readFileSync(
  path.join(root, "ac-dc-app/data/usdm", manifest[0].file), "utf8")));

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : "")); };

/* --- context --- */
const context = buildSmartphraseContext(study, v06, methods);
check("context exposes lib, graph and ctx",
  !!context.lib && !!context.graph && !!context.ctx, Object.keys(context).join(","));
check("library has all 25 transformations", context.lib.transformations.length === 25,
  String(context.lib.transformations.length));
check("graph carries the pilot's concepts",
  Object.keys(context.graph.concepts).length === 196,
  String(Object.keys(context.graph.concepts).length));
check("methods reached the library", !!context.lib.methods["M.ANCOVA"]);

/* --- prepareSpec then specToInstance, on the real Scenario 1 spec --- */
const scenario = JSON.parse(fs.readFileSync(path.join(root,
  "ac-dc-app/data/study_ac_spec/Scenario 1_cdisc-pilot-lzzt-merged.study-instance-adas-cog-analysis-only.json"),
  "utf8"));
const spec = scenario.endpointSpecs.Endpoint_1;
const ep = getAllEndpoints(study).find((e) => e.id === "Endpoint_1");
check("found END1 in the study", !!ep);

prepareSpec(spec, context, context.lib);
check("prepareSpec backfilled phraseInstances", Array.isArray(spec.phraseInstances));

const instance = specToInstance(spec, ep, context.lib);
check("instance built", !!instance);
check("instance carries the saved template",
  instance.template === "T.CFB_ANCOVA", instance && instance.template);
check("sentenceRole derived from the endpoint level",
  instance.sentenceRole === "the primary analysis", instance && instance.sentenceRole);
check("instance carries the backfilled phrases",
  instance.phrases.some((p) => p.phrase === "SP_CFB_ENDPOINT"),
  JSON.stringify(instance && instance.phrases.map((p) => p.phrase)));

const res = E.resolveInstance(context.ctx, instance, "en");
check("the engine resolves it with no errors", res.errors.length === 0, JSON.stringify(res.errors));
check("the sentence names the parameter",
  res.sentence.includes("Adas-Cog(11) Subscore"), res.sentence);

/* --- a spec with no phraseInstances and nothing to derive them from yields null --- */
check("an empty spec yields no instance",
  specToInstance({}, ep, context.lib) === null);

/* A spec that already carries phrase instances is authoritative — prepareSpec must not
   re-derive them from dimensionValues and overwrite an author's work. */
const authored = {
  dimensionValues: { AnalysisVisit: "Baseline", Parameter: "Adas-Cog(11) Subscore" },
  selectedEndpointPhrase: "SP_CFB_ENDPOINT",
  selectedDimPhrases: ["SP_TIMEPOINT"],
  phraseInstances: [{ phrase: "SP_TIMEPOINT", bindings: { visit: { concept: "V.Encounter_11" } } }]
};
prepareSpec(authored, context, context.lib);
check("an existing phraseInstances array is never re-derived",
  authored.phraseInstances.length === 1 &&
  authored.phraseInstances[0].bindings.visit.concept === "V.Encounter_11",
  JSON.stringify(authored.phraseInstances));

/* The document's render policy is applied to bindings that lack one, without mutating the spec. */
const rendered = instance.phrases.find((p) => p.phrase === "SP_TIMEPOINT").bindings.visit;
check("visit binding gains render: label", rendered.render === "label", JSON.stringify(rendered));
check("the saved spec is not mutated",
  spec.phraseInstances.find((p) => p.phrase === "SP_TIMEPOINT").bindings.visit.render === undefined,
  JSON.stringify(spec.phraseInstances.find((p) => p.phrase === "SP_TIMEPOINT").bindings.visit));
const resRendered = E.resolveInstance(context.ctx, instance, "en");
check("the sentence no longer duplicates the visit",
  !resRendered.sentence.includes("Week 24 (Week 24)"), resRendered.sentence);

/* ---------- seeding Step 4 ---------- */

const { applyPhraseChange } = await load("ac-dc-app/js/utils/smartphrase-context.js");

/* One candidate: the transformation is seeded, in the shape Step 4 actually renders from. */
const seeded = { phraseInstances: [
  { phrase: "SP_CFB_ENDPOINT", bindings: {} },
  { phrase: "SP_METHOD_ANCOVA", bindings: {} }
] };
const r1 = applyPhraseChange(seeded, context.lib);
check("one candidate seeds selectedTransformationOid",
  seeded.selectedTransformationOid === "T.CFB_ANCOVA", seeded.selectedTransformationOid);
check("one candidate seeds selectedAnalyses, which is what Step 4 renders",
  (seeded.selectedAnalyses || []).length === 1
    && seeded.selectedAnalyses[0].transformationOid === "T.CFB_ANCOVA",
  JSON.stringify(seeded.selectedAnalyses));
check("the seeded analysis carries the transformation's non-output bindings",
  Array.isArray(seeded.selectedAnalyses[0].resolvedBindings)
    && seeded.selectedAnalyses[0].resolvedBindings.length === 6
    && seeded.selectedAnalyses[0].resolvedBindings.every((b) => b.direction !== "output"),
  JSON.stringify((seeded.selectedAnalyses[0].resolvedBindings || []).length));
check("the result reports the candidate", r1.candidates.length === 1);
check("the result reports the required slots",
  r1.required.map((s) => s.dimension).sort().join(",") === "AnalysisVisit,Parameter,Population",
  JSON.stringify(r1.required));

/* Several candidates: nothing is chosen, and that is a valid state (spec §11.1). */
const ambiguous = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT", bindings: {} }] };
const r2 = applyPhraseChange(ambiguous, context.lib);
check("several candidates leave the transformation unset",
  ambiguous.selectedTransformationOid === null, String(ambiguous.selectedTransformationOid));
check("several candidates are still reported", r2.candidates.length === 3,
  String(r2.candidates.length));
check("the intersection is still bindable",
  r2.required.map((s) => s.dimension).sort().join(",") === "Parameter,Population",
  JSON.stringify(r2.required));
check("the rest is pending", r2.pending.some((s) => s.dimension === "AnalysisVisit"),
  JSON.stringify(r2.pending));

/* A selection the prose no longer permits is cleared — from BOTH fields. */
const stale = { phraseInstances: [
  { phrase: "SP_CFB_ENDPOINT", bindings: {} },
  { phrase: "SP_METHOD_ANCOVA", bindings: {} }
] };
applyPhraseChange(stale, context.lib);
stale.phraseInstances[1] = { phrase: "SP_METHOD_MMRM", bindings: {} };
applyPhraseChange(stale, context.lib);
check("swapping the method re-seeds rather than stranding the old choice",
  stale.selectedTransformationOid === "T.CFB_MMRM_Primary", stale.selectedTransformationOid);
check("re-seeding replaces selectedAnalyses too",
  stale.selectedAnalyses.length === 1
    && stale.selectedAnalyses[0].transformationOid === "T.CFB_MMRM_Primary",
  JSON.stringify(stale.selectedAnalyses));

/* A manual Step 4 pick still permitted by the prose SURVIVES an unrelated binding edit.
   This is the regression this round exists to prevent: applyPhraseChange also runs on
   dimension-value changes, which do not alter the phrase set. */
const manual = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT", bindings: {} }],
                 selectedTransformationOid: "T.CFB_MMRM_Primary",
                 selectedAnalyses: [{ transformationOid: "T.CFB_MMRM_Primary",
                                      resolvedBindings: [{ concept: "hand-edited" }],
                                      activeInteractions: [], estimandSummaryPattern: null }] };
applyPhraseChange(manual, context.lib);
check("a manual pick consistent with the prose is preserved",
  manual.selectedTransformationOid === "T.CFB_MMRM_Primary", manual.selectedTransformationOid);
check("and its hand-edited bindings are not discarded",
  manual.selectedAnalyses[0].resolvedBindings[0].concept === "hand-edited",
  JSON.stringify(manual.selectedAnalyses[0].resolvedBindings));

/* A manual pick the prose forbids IS cleared. */
const contradicted = { phraseInstances: [
  { phrase: "SP_CFB_ENDPOINT", bindings: {} },
  { phrase: "SP_METHOD_ANCOVA", bindings: {} }
], selectedTransformationOid: "T.Responder_ChiSq",
   selectedAnalyses: [{ transformationOid: "T.Responder_ChiSq" }] };
applyPhraseChange(contradicted, context.lib);
check("a contradicted pick is replaced by the single candidate",
  contradicted.selectedTransformationOid === "T.CFB_ANCOVA",
  contradicted.selectedTransformationOid);

/* The clear branch: several candidates, and a selection none of them permits. Removing a
   phrase is how this is reached from the UI (Task 5), and it is the only branch that
   destroys state, so it is checked explicitly rather than inferred from the reseed case. */
const stranded = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT", bindings: {} }],
                   selectedTransformationOid: "T.Responder_ChiSq",
                   selectedAnalyses: [{ transformationOid: "T.Responder_ChiSq" }],
                   resolvedBindings: [{ concept: "stale" }],
                   activeInteractions: ["TRT*VISIT"],
                   estimandSummaryPattern: "P" };
applyPhraseChange(stranded, context.lib);
check("a selection no candidate permits is cleared",
  stranded.selectedTransformationOid === null, String(stranded.selectedTransformationOid));
check("clearing empties selectedAnalyses too",
  Array.isArray(stranded.selectedAnalyses) && stranded.selectedAnalyses.length === 0,
  JSON.stringify(stranded.selectedAnalyses));
check("clearing resets the mirrored legacy fields",
  stranded.resolvedBindings === null && stranded.activeInteractions.length === 0
    && stranded.estimandSummaryPattern === null,
  JSON.stringify([stranded.resolvedBindings, stranded.activeInteractions,
                  stranded.estimandSummaryPattern]));

/* Re-running on an unchanged sentence must not churn state. */
const idem = { phraseInstances: [
  { phrase: "SP_CFB_ENDPOINT", bindings: {} },
  { phrase: "SP_METHOD_ANCOVA", bindings: {} }
] };
applyPhraseChange(idem, context.lib);
idem.selectedAnalyses[0].activeInteractions = ["TRT*VISIT"];
applyPhraseChange(idem, context.lib);
check("re-running on an unchanged sentence preserves edited analysis state",
  idem.selectedAnalyses[0].activeInteractions.join(",") === "TRT*VISIT",
  JSON.stringify(idem.selectedAnalyses[0].activeInteractions));

/* It must not disturb unrelated spec fields. */
const guarded = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT", bindings: {} }],
                  dimensionValues: { Parameter: "keep me" }, derivationChain: [1, 2, 3] };
applyPhraseChange(guarded, context.lib);
check("dimensionValues untouched", guarded.dimensionValues.Parameter === "keep me");
check("derivationChain untouched", guarded.derivationChain.length === 3);

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — engine context and spec→instance conversion work against the real study.");
