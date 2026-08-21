/*
 * Proves the single-writer rule and the load-time backfill (spec §11.3).
 *
 *   node scripts/verify_phrase_bindings.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { adaptV06Library } = await load("ac-dc-app/js/utils/smartphrase-lib-adapter.js");
const { parseUSDM } = await load("ac-dc-app/js/utils/usdm-parser.js");
const { buildConceptGraph, addUnresolvedConcept } =
  await load("ac-dc-app/js/utils/smartphrase-graph.js");
const { setDimensionBinding, resolveLabelToConceptId, backfillPhraseInstances,
        ensureUnresolvedConcepts } = await load("ac-dc-app/js/utils/phrase-bindings.js");
const E = (await load("ac-dc-app/js/utils/smartphrase-engine.js")).default;

const v06 = JSON.parse(fs.readFileSync(
  path.join(root, "lib/transformations/ACDC_Transformation_Library_v06.json"), "utf8"));
const methodsDir = path.join(root, "lib/methods/analyses");
const methods = {};
for (const f of fs.readdirSync(methodsDir)) {
  if (!f.endsWith(".json")) continue;
  const m = JSON.parse(fs.readFileSync(path.join(methodsDir, f), "utf8"));
  methods[m.oid] = m;
}
const lib = adaptV06Library(v06, methods);
const studies = JSON.parse(fs.readFileSync(
  path.join(root, "ac-dc-app/data/usdm/studies.json"), "utf8"));
const pilot = parseUSDM(JSON.parse(fs.readFileSync(
  path.join(root, "ac-dc-app/data/usdm", studies[0].file), "utf8")));
const graph = buildConceptGraph(pilot, lib, methods);

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : "")); };

/* --- one write updates both representations --- */
const spec = { dimensionValues: {}, phraseInstances: [] };
setDimensionBinding(spec, graph, "SP_TIMEPOINT", "visit", "AnalysisVisit", "V.Encounter_1");

check("phraseInstances records the id",
  spec.phraseInstances[0]?.bindings?.visit?.concept === "V.Encounter_1",
  JSON.stringify(spec.phraseInstances));
check("dimensionValues records the label",
  spec.dimensionValues.AnalysisVisit === "Screening 1", spec.dimensionValues.AnalysisVisit);
check("one phrase instance, not two", spec.phraseInstances.length === 1);

/* --- rebinding the same slot replaces, never appends --- */
setDimensionBinding(spec, graph, "SP_TIMEPOINT", "visit", "AnalysisVisit", "V.Encounter_3");
check("rebinding replaces", spec.phraseInstances.length === 1, JSON.stringify(spec.phraseInstances));
check("rebinding updates the id",
  spec.phraseInstances[0].bindings.visit.concept === "V.Encounter_3");
check("rebinding updates the label", spec.dimensionValues.AnalysisVisit === "Baseline",
  spec.dimensionValues.AnalysisVisit);

/* --- label -> id, and the ambiguity rule --- */
check("unique label resolves",
  resolveLabelToConceptId(graph, "visit", "Baseline") === "V.Encounter_3");
check("unknown label yields null",
  resolveLabelToConceptId(graph, "visit", "Week 999") === null);

const ambiguous = { concepts: {
  "V.A": { kind: "AnalysisVisit", label: "Week 4", source: "visit" },
  "V.B": { kind: "AnalysisVisit", label: "Week 4", source: "visit" }
} };
check("ambiguous label yields null rather than a guess",
  resolveLabelToConceptId(ambiguous, "visit", "Week 4") === null);

/* --- an unresolved concept must not permanently shadow a later-anchored one ---
   Both match the label. Counting them equally would return null forever, and the caller's
   `|| addUnresolvedConcept(...)` would idempotently hand back the unresolved id — the anchored
   concept could never be adopted, however many times the study is re-parsed. */
const shadowed = { concepts: {
  "V.Real": { kind: "AnalysisVisit", label: "Week 4", source: "visit", anchored: true },
  "UNRESOLVED.visit.week-4": { kind: "AnalysisVisit", label: "Week 4", source: "visit",
                               anchored: false }
} };
check("an anchored concept wins over an unresolved one with the same label",
  resolveLabelToConceptId(shadowed, "visit", "Week 4") === "V.Real",
  String(resolveLabelToConceptId(shadowed, "visit", "Week 4")));
/* Preferring anchored must not weaken the ambiguity rule among anchored concepts themselves. */
const twoAnchored = { concepts: {
  "V.A": { kind: "AnalysisVisit", label: "Week 4", source: "visit", anchored: true },
  "V.B": { kind: "AnalysisVisit", label: "Week 4", source: "visit", anchored: true },
  "UNRESOLVED.visit.week-4": { kind: "AnalysisVisit", label: "Week 4", source: "visit",
                               anchored: false }
} };
check("two anchored hits are still ambiguous",
  resolveLabelToConceptId(twoAnchored, "visit", "Week 4") === null,
  String(resolveLabelToConceptId(twoAnchored, "visit", "Week 4")));

/* --- an optional render mode, for the UI phase to choose per slot --- */
const rendered = { dimensionValues: {}, phraseInstances: [] };
setDimensionBinding(rendered, graph, "SP_TIMEPOINT", "visit", "AnalysisVisit",
  "V.Encounter_1", "name");
check("a supplied render mode is written",
  rendered.phraseInstances[0].bindings.visit.render === "name",
  JSON.stringify(rendered.phraseInstances[0].bindings.visit));
check("no render mode means no render key — the engine's default_render still applies",
  spec.phraseInstances[0].bindings.visit.render === undefined,
  JSON.stringify(spec.phraseInstances[0].bindings.visit));

/* --- backfill against the real scenario files (read-only: never written back) --- */
const scenarioDir = path.join(root, "ac-dc-app/data/study_ac_spec");
const readScenario = (file) =>
  JSON.parse(fs.readFileSync(path.join(scenarioDir, file), "utf8"));

const scenario1 = readScenario(
  "Scenario 1_cdisc-pilot-lzzt-merged.study-instance-adas-cog-analysis-only.json");
const s1 = scenario1.endpointSpecs.Endpoint_1;

check("scenario 1 has no phraseInstances yet", s1.phraseInstances === undefined);
backfillPhraseInstances(s1, graph, lib);
check("backfill creates phraseInstances", Array.isArray(s1.phraseInstances));
check("backfill carries the endpoint phrase",
  s1.phraseInstances.some((p) => p.phrase === "SP_CFB_ENDPOINT"),
  JSON.stringify(s1.phraseInstances.map((p) => p.phrase)));
check("backfill carries the dimension phrase",
  s1.phraseInstances.some((p) => p.phrase === "SP_TIMEPOINT"),
  JSON.stringify(s1.phraseInstances.map((p) => p.phrase)));
check("backfill leaves dimensionValues untouched",
  s1.dimensionValues.AnalysisVisit === "Week 24", s1.dimensionValues.AnalysisVisit);

/* The visit label is unambiguous in the pilot, so the backfill must land on the real encounter
   — not merely on "some concept". A non-null id proves nothing about which one it is. */
const visitBinding = s1.phraseInstances
  .find((p) => p.phrase === "SP_TIMEPOINT")?.bindings?.visit;
check("backfill binds the visit to the Week 24 encounter, by id",
  visitBinding?.concept === "V.Encounter_11", JSON.stringify(visitBinding));
check("that concept is the anchored USDM one",
  graph.concepts["V.Encounter_11"]?.anchored === true &&
  graph.concepts["V.Encounter_11"]?.label === "Week 24",
  JSON.stringify(graph.concepts["V.Encounter_11"]));

const snapshot = JSON.stringify(s1.phraseInstances);
backfillPhraseInstances(s1, graph, lib);
check("backfill is idempotent", JSON.stringify(s1.phraseInstances) === snapshot);

/* The override's point: an unresolved backfilled binding must be a CONCEPT, not a bare value,
   or the engine's boundConcepts skips it and the fixture silently leaves the cube. */
const paramBinding = s1.phraseInstances
  .find((p) => p.phrase === "SP_CFB_ENDPOINT")?.bindings?.parameter;
check("unresolved parameter is a concept binding, not a bare value",
  paramBinding && typeof paramBinding.concept === "string" && paramBinding.value === undefined,
  JSON.stringify(paramBinding));
check("the unresolved concept was added to the graph",
  paramBinding && graph.concepts[paramBinding.concept]?.anchored === false,
  JSON.stringify(paramBinding && graph.concepts[paramBinding.concept]));

/* An id the graph does not know must fail loudly rather than write one side and leave the
   other stale — the drift this module exists to prevent. */
let threw = false;
try {
  setDimensionBinding({ dimensionValues: {}, phraseInstances: [] }, graph,
    "SP_TIMEPOINT", "visit", "AnalysisVisit", "V.NoSuchEncounter");
} catch (e) { threw = /not in the graph/.test(e.message); }
check("an unknown concept id throws rather than drifting", threw);

/* An empty array means "already backfilled, nothing was derivable" — not "needs backfilling". */
const emptySpec = { phraseInstances: [], dimensionValues: { AnalysisVisit: "Baseline" },
                    selectedEndpointPhrase: "SP_CFB_ENDPOINT", selectedDimPhrases: ["SP_TIMEPOINT"] };
backfillPhraseInstances(emptySpec, graph, lib);
check("an empty phraseInstances array is left alone", emptySpec.phraseInstances.length === 0,
  JSON.stringify(emptySpec.phraseInstances));

/* ---------- scenario 2: a Visit key alongside AnalysisVisit, and a Population ---------- */

const scenario2 = readScenario(
  "Scenario 2_cdisc-pilot-lzzt-merged.study-instance-adas-cog-with-derivation.json");
const s2 = scenario2.endpointSpecs.Endpoint_1;
const g2 = buildConceptGraph(pilot, lib, methods);
backfillPhraseInstances(s2, g2, lib);

const s2Phrases = s2.phraseInstances.map((p) => p.phrase).sort();
/* Only the phrases the author actually selected. `dimensionValues` also carries `Population`
   and a raw SDTM `Visit`, but SP_POPULATION is not in selectedDimPhrases, so no instance for
   it — the backfill reconstructs what was composed, it does not invent phrases. */
check("scenario 2 backfills exactly the composed phrases",
  JSON.stringify(s2Phrases) === JSON.stringify(["SP_CFB_ENDPOINT", "SP_TIMEPOINT"]),
  JSON.stringify(s2Phrases));
check("scenario 2 binds AnalysisVisit, not the raw SDTM Visit value",
  s2.phraseInstances.find((p) => p.phrase === "SP_TIMEPOINT")?.bindings?.visit?.concept
    === "V.Encounter_11",
  JSON.stringify(s2.phraseInstances.find((p) => p.phrase === "SP_TIMEPOINT")?.bindings));
check("scenario 2 leaves the unselected Population value alone",
  s2.dimensionValues.Population === "AP_1" &&
  !s2.phraseInstances.some((p) => p.phrase === "SP_POPULATION"),
  JSON.stringify(s2.dimensionValues));
/* "AP_1" IS a resolvable population label in this study, so its absence above is a decision
   about selectedDimPhrases, not an inability to resolve it. */
check("AP_1 would have resolved had the phrase been composed",
  resolveLabelToConceptId(g2, "population", "AP_1") === "POP.AnalysisPopulation_1",
  String(resolveLabelToConceptId(g2, "population", "AP_1")));

/* ---------- scenario 3: a different endpoint phrase, and no dimension phrases ---------- */

const scenario3 = readScenario(
  "Scenario 3_cdisc-pilot-lzzt-merged.study-instance_unit_conversion_mean.json");
const s3 = scenario3.endpointSpecs.Endpoint_4;
const g3 = buildConceptGraph(pilot, lib, methods);
backfillPhraseInstances(s3, g3, lib);

check("scenario 3 backfills its own endpoint phrase",
  JSON.stringify(s3.phraseInstances.map((p) => p.phrase)) === JSON.stringify(["SP_VALUE_ENDPOINT"]),
  JSON.stringify(s3.phraseInstances.map((p) => p.phrase)));
const s3Param = s3.phraseInstances[0]?.bindings?.parameter;
check("scenario 3 binds under SP_VALUE_ENDPOINT's own slot",
  typeof s3Param?.concept === "string", JSON.stringify(s3.phraseInstances[0]?.bindings));
/* "Weight (cm)" is not a USDM label in this study (the pilot has "Weight" twice, and
   "Body Weight"), so it must synthesise — and keep the typed text verbatim. */
check("scenario 3's unmatched parameter becomes an unresolved concept",
  g3.concepts[s3Param.concept]?.anchored === false &&
  g3.concepts[s3Param.concept]?.label === "Weight (cm)",
  JSON.stringify(g3.concepts[s3Param?.concept]));

/* --- slug aliasing: two labels differing only in punctuation must not share an id ---
   Reachable from scenario 3: both "Weight (cm)" and "Weight cm" reduce to "weight-cm", and a
   presence guard alone would hand the second caller the first's concept. */
const aliasId = addUnresolvedConcept(g3, "biomedicalConcept", "Weight cm");
check("a punctuation-only variant gets its own id",
  aliasId !== s3Param.concept, `${aliasId} vs ${s3Param.concept}`);
check("and its own label, not the incumbent's",
  g3.concepts[aliasId]?.label === "Weight cm", g3.concepts[aliasId]?.label);
check("the incumbent is untouched",
  g3.concepts[s3Param.concept]?.label === "Weight (cm)", g3.concepts[s3Param.concept]?.label);
check("the discriminated id is stable across calls",
  addUnresolvedConcept(g3, "biomedicalConcept", "Weight cm") === aliasId,
  addUnresolvedConcept(g3, "biomedicalConcept", "Weight cm"));

/* ---------- the endpoint slot is the library's, never assumed to be `parameter` ----------
   SP_TTE_ENDPOINT declares `event`. Writing `parameter` there would bind a placeholder that
   does not exist while the real slot reported "no binding for required placeholder". */
const tte = { selectedEndpointPhrase: "SP_TTE_ENDPOINT", selectedDimPhrases: [],
              dimensionValues: { Parameter: "Progression-free survival" } };
const gTte = buildConceptGraph(pilot, lib, methods);
backfillPhraseInstances(tte, gTte, lib);
const tteBindings = tte.phraseInstances[0]?.bindings || {};
check("SP_TTE_ENDPOINT binds its `event` slot",
  typeof tteBindings.event?.concept === "string", JSON.stringify(tteBindings));
check("SP_TTE_ENDPOINT does NOT bind a `parameter` slot it never declared",
  tteBindings.parameter === undefined, JSON.stringify(tteBindings));

/* ---------- the full save/reload cycle (the bug this rehydration exists for) ----------
   `addUnresolvedConcept` mutates the live graph, but the graph is rebuilt from USDM on every
   study load. Without rehydration, load 2 renders ⟨parameter?⟩ and the sliceKey goes null. */
const gLoad1 = buildConceptGraph(pilot, lib, methods);
const fresh1 = readScenario(
  "Scenario 1_cdisc-pilot-lzzt-merged.study-instance-adas-cog-analysis-only.json")
  .endpointSpecs.Endpoint_1;
backfillPhraseInstances(fresh1, gLoad1, lib);
const savedParamId = fresh1.phraseInstances
  .find((p) => p.phrase === "SP_CFB_ENDPOINT").bindings.parameter.concept;
check("load 1 synthesised the parameter concept",
  savedParamId.startsWith("UNRESOLVED.") && !!gLoad1.concepts[savedParamId], savedParamId);

/* Save, then reload into a graph that has never heard of it. */
const reloaded = JSON.parse(JSON.stringify(fresh1));
const gLoad2 = buildConceptGraph(pilot, lib, methods);
check("the fresh graph does not carry the synthesised concept",
  gLoad2.concepts[savedParamId] === undefined);
backfillPhraseInstances(reloaded, gLoad2, lib);
check("the load path re-adds it",
  gLoad2.concepts[savedParamId]?.anchored === false, JSON.stringify(gLoad2.concepts[savedParamId]));
check("with the label recovered from dimensionValues, not from the lossy slug",
  gLoad2.concepts[savedParamId]?.label === "Adas-Cog(11) Subscore",
  gLoad2.concepts[savedParamId]?.label);
check("rehydration does not re-derive phraseInstances",
  JSON.stringify(reloaded.phraseInstances) === JSON.stringify(fresh1.phraseInstances),
  JSON.stringify(reloaded.phraseInstances));

/* And the instance must actually resolve on load 2 — the symptom was ⟨parameter?⟩. */
const visitId2 = reloaded.phraseInstances.find((p) => p.phrase === "SP_TIMEPOINT")
  .bindings.visit.concept;
const popId2 = Object.keys(gLoad2.concepts).find((k) => gLoad2.concepts[k].kind === "Population");
const ctxLoad2 = E.ctxOf(lib, gLoad2, null, null);
const instLoad2 = {
  id: "AC.RELOAD", template: "T.CFB_ANCOVA", sentenceRole: "primary",
  phrases: [
    { phrase: "SP_CFB_ENDPOINT", bindings: { parameter: { concept: savedParamId } } },
    { phrase: "SP_TIMEPOINT", bindings: { visit: { concept: visitId2 } } },
    { phrase: "SP_POPULATION", bindings: { population: { concept: popId2 } } },
    { phrase: "SP_METHOD_ANCOVA", bindings: { method: { method: "M.ANCOVA" } } }
  ]
};
const resLoad2 = E.resolveInstance(ctxLoad2, instLoad2, "en");
check("load 2 resolves with no errors", resLoad2.errors.length === 0,
  JSON.stringify(resLoad2.errors));
check("load 2 renders the label, not a ⟨slot?⟩ placeholder",
  resLoad2.sentence.includes("Adas-Cog(11) Subscore") && !resLoad2.sentence.includes("?⟩"),
  resLoad2.sentence);
const viewLoad2 = E.constructModelView(ctxLoad2, instLoad2);
check("load 2's Parameter sliceKey is not null",
  viewLoad2.sliceKeys.find((sk) => sk.dimension === "Parameter")?.value?.label
    === "Adas-Cog(11) Subscore",
  JSON.stringify(viewLoad2.sliceKeys.map((sk) => [sk.dimension, sk.value && sk.value.label])));

/* Rehydration is idempotent and additive-only. */
const conceptsBefore = JSON.stringify(gLoad2.concepts);
ensureUnresolvedConcepts(reloaded, gLoad2, lib);
check("rehydration is idempotent", JSON.stringify(gLoad2.concepts) === conceptsBefore);

/* A label that cannot be recovered leaves the graph alone rather than inventing one. */
const orphan = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT",
  bindings: { parameter: { concept: "UNRESOLVED.biomedicalConcept.nothing-knows-this" } } }],
  dimensionValues: {} };
const gOrphan = buildConceptGraph(pilot, lib, methods);
const orphanBefore = Object.keys(gOrphan.concepts).length;
ensureUnresolvedConcepts(orphan, gOrphan, lib);
check("an unrecoverable label adds nothing to the graph",
  Object.keys(gOrphan.concepts).length === orphanBefore,
  String(Object.keys(gOrphan.concepts).length - orphanBefore));

/* A label that does not round-trip to the binding's id is the WRONG label — it must not be
   adopted, and must not leave its speculative concept behind either. */
const mismatched = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT",
  bindings: { parameter: { concept: "UNRESOLVED.biomedicalConcept.some-other-thing" } } }],
  dimensionValues: { Parameter: "Adas-Cog(11) Subscore" } };
const gMismatch = buildConceptGraph(pilot, lib, methods);
const mismatchBefore = Object.keys(gMismatch.concepts).length;
ensureUnresolvedConcepts(mismatched, gMismatch, lib);
check("a non-round-tripping label is rejected, and rolled back",
  Object.keys(gMismatch.concepts).length === mismatchBefore &&
  gMismatch.concepts["UNRESOLVED.biomedicalConcept.some-other-thing"] === undefined,
  String(Object.keys(gMismatch.concepts).length - mismatchBefore));

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — one writer keeps ids and labels in step; backfill handles existing saves.");
