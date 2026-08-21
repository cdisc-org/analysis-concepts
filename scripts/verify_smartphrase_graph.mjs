/*
 * Proves the concept graph is built from the library's declared sources, keyed by USDM id,
 * and shaped so v06's two sliceKey vocabularies both resolve.
 *
 *   node scripts/verify_smartphrase_graph.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { adaptV06Library } = await load("ac-dc-app/js/utils/smartphrase-lib-adapter.js");
const { parseUSDM } = await load("ac-dc-app/js/utils/usdm-parser.js");
const { buildConceptGraph, collectDeclaredSources } = await load("ac-dc-app/js/utils/smartphrase-graph.js");

const v06 = JSON.parse(fs.readFileSync(
  path.join(root, "lib/transformations/ACDC_Transformation_Library_v06.json"), "utf8"));
const lib = adaptV06Library(v06);

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : "")); };

/* --- the library declares exactly three sources --- */
const sources = collectDeclaredSources(lib);
check("three declared sources", sources.size === 3, [...sources].join(","));
for (const s of ["biomedicalConcept", "visit", "population"]) {
  check(`source '${s}' is declared`, sources.has(s));
}

/* --- both real studies --- */
const studies = JSON.parse(fs.readFileSync(
  path.join(root, "ac-dc-app/data/usdm/studies.json"), "utf8"));
const parsed = studies.map((e) =>
  parseUSDM(JSON.parse(fs.readFileSync(path.join(root, "ac-dc-app/data/usdm", e.file), "utf8"))));

const [pilot, breast] = parsed;
const gPilot = buildConceptGraph(pilot, lib);
const gBreast = buildConceptGraph(breast, lib);

const count = (g, kind) => Object.values(g.concepts).filter((c) => c.kind === kind).length;

check("pilot: 182 Parameter concepts", count(gPilot, "Parameter") === 182, String(count(gPilot, "Parameter")));
check("pilot: 12 AnalysisVisit concepts", count(gPilot, "AnalysisVisit") === 12, String(count(gPilot, "AnalysisVisit")));
check("pilot: 2 Population concepts", count(gPilot, "Population") === 2, String(count(gPilot, "Population")));

check("breast: 84 Parameter concepts", count(gBreast, "Parameter") === 84, String(count(gBreast, "Parameter")));
check("breast: 17 AnalysisVisit concepts", count(gBreast, "AnalysisVisit") === 17, String(count(gBreast, "AnalysisVisit")));
/* zero analysisPopulations — must still yield the study-design population, not an empty set */
check("breast: 1 Population concept despite 0 analysisPopulations",
  count(gBreast, "Population") === 1, String(count(gBreast, "Population")));

/* --- keys are USDM ids, not labels --- */
check("visit concept keyed by encounter id", "V.Encounter_1" in gPilot.concepts);
check("visit label is the human one",
  gPilot.concepts["V.Encounter_1"]?.label === "Screening 1",
  gPilot.concepts["V.Encounter_1"]?.label);
check("parameter concept keyed by BC id", "P.BiomedicalConcept_20" in gPilot.concepts);

/* --- both vocabularies present --- */
const v = gPilot.concepts["V.Encounter_1"];
check("visit carries kind AND conceptCategory",
  v?.kind === "AnalysisVisit" && v?.conceptCategory === "VisitDimension",
  JSON.stringify(v));
const p = gPilot.concepts["P.BiomedicalConcept_20"];
check("parameter carries kind AND conceptCategory",
  p?.kind === "Parameter" && p?.conceptCategory === "ParameterDimension",
  JSON.stringify(p));

/* --- everything from USDM is anchored, and carries its iri --- */
check("all concepts anchored", Object.values(gPilot.concepts).every((c) => c.anchored === true));
check("visit iri", v?.iri === "usdm:Encounter/Encounter_1", v?.iri);

/* --- the trace tier is NOT built (spec 7.6) --- */
check("traceTemplates is empty", JSON.stringify(gPilot.traceTemplates) === "{}");
check("no concept carries a data map", Object.values(gPilot.concepts).every((c) => c.data === undefined));

/* --- non-mutating --- */
const before = JSON.stringify(pilot);
buildConceptGraph(pilot, lib);
check("parsed study not mutated", JSON.stringify(pilot) === before);

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — concept graph built from declared sources for both studies.");
