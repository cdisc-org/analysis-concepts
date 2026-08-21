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
const { buildConceptGraph } = await load("ac-dc-app/js/utils/smartphrase-graph.js");
const { setDimensionBinding, resolveLabelToConceptId, backfillPhraseInstances } =
  await load("ac-dc-app/js/utils/phrase-bindings.js");

const v06 = JSON.parse(fs.readFileSync(
  path.join(root, "lib/transformations/ACDC_Transformation_Library_v06.json"), "utf8"));
const lib = adaptV06Library(v06);
const studies = JSON.parse(fs.readFileSync(
  path.join(root, "ac-dc-app/data/usdm/studies.json"), "utf8"));
const pilot = parseUSDM(JSON.parse(fs.readFileSync(
  path.join(root, "ac-dc-app/data/usdm", studies[0].file), "utf8")));
const graph = buildConceptGraph(pilot, lib);

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

/* --- backfill against the real scenario files --- */
const scenarioDir = path.join(root, "ac-dc-app/data/study_ac_spec");
const scenario1 = JSON.parse(fs.readFileSync(path.join(scenarioDir,
  "Scenario 1_cdisc-pilot-lzzt-merged.study-instance-adas-cog-analysis-only.json"), "utf8"));
const s1 = scenario1.endpointSpecs.Endpoint_1;

check("scenario 1 has no phraseInstances yet", s1.phraseInstances === undefined);
backfillPhraseInstances(s1, graph);
check("backfill creates phraseInstances", Array.isArray(s1.phraseInstances));
check("backfill carries the endpoint phrase",
  s1.phraseInstances.some((p) => p.phrase === "SP_CFB_ENDPOINT"),
  JSON.stringify(s1.phraseInstances.map((p) => p.phrase)));
check("backfill carries the dimension phrase",
  s1.phraseInstances.some((p) => p.phrase === "SP_TIMEPOINT"),
  JSON.stringify(s1.phraseInstances.map((p) => p.phrase)));
check("backfill leaves dimensionValues untouched",
  s1.dimensionValues.AnalysisVisit === "Week 24", s1.dimensionValues.AnalysisVisit);

const snapshot = JSON.stringify(s1.phraseInstances);
backfillPhraseInstances(s1, graph);
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
backfillPhraseInstances(emptySpec, graph);
check("an empty phraseInstances array is left alone", emptySpec.phraseInstances.length === 0,
  JSON.stringify(emptySpec.phraseInstances));

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — one writer keeps ids and labels in step; backfill handles existing saves.");
