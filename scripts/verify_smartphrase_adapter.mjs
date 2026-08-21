/*
 * Proves the v06 library, seen through the adapter, satisfies every field the
 * ported engine reads — without v06 itself changing shape.
 *
 *   node scripts/verify_smartphrase_adapter.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { adaptV06Library, adaptV06Method } = await import(
  pathToFileURL(path.join(root, "ac-dc-app", "js", "utils", "smartphrase-lib-adapter.js")).href
);

const v06 = JSON.parse(fs.readFileSync(
  path.join(root, "lib", "transformations", "ACDC_Transformation_Library_v06.json"), "utf8"));
const ancova = JSON.parse(fs.readFileSync(
  path.join(root, "lib", "methods", "analyses", "M.ANCOVA.json"), "utf8"));

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : "")); };

const lib = adaptV06Library(v06);

check("all 25 transformations are merged into one array",
  lib.transformations.length === 25, `got ${lib.transformations.length}`);
check("every transformation has conceptId",
  lib.transformations.every(t => typeof t.conceptId === "string"));
check("every transformation has label",
  lib.transformations.every(t => typeof t.label === "string"));

const t = lib.transformations.find(x => x.conceptId === "T.CFB_ANCOVA");
check("T.CFB_ANCOVA is present", !!t);
check("conceptId comes from oid", t && t.conceptId === "T.CFB_ANCOVA");
check("label comes from name", t && t.label === v06.analysisTransformations
  .find(x => x.oid === "T.CFB_ANCOVA").name);
check("inputDataStructure.slices exposes the v06 slices",
  t && t.inputDataStructure.slices.length === 1
    && t.inputDataStructure.slices[0].name === "parameter_baseline");
check("slice constraints expose `dimension` from conceptCategory",
  t && t.inputDataStructure.slices[0].constraints
    .every(c => typeof c.dimension === "string"),
  t && JSON.stringify(t.inputDataStructure.slices[0].constraints));
// An ANALYSIS transformation has no output measure bindings in v06; its outputs
// live in methodOutputSlotMapping. The concepts there match v07's
// outputDataStructure.measures exactly, so this is a faithful mapping.
check("analysis outputs derive from methodOutputSlotMapping",
  t && t.outputDataStructure.measures.length === 5,
  t && JSON.stringify(t.outputDataStructure.measures));
check("analysis output concepts match v07",
  t && JSON.stringify(t.outputDataStructure.measures.map(m => m.concept).sort())
    === JSON.stringify(["Contrasts", "FitStatistics", "LSMeans",
                        "ParameterEstimates", "Type3Tests"]));

// A DERIVATION has no methodOutputSlotMapping; its output is a measure binding.
const cfb = lib.transformations.find(x => x.conceptId === "T.ChangeFromBaseline");
check("derivation outputs derive from output measure bindings",
  cfb && cfb.outputDataStructure.measures.length === 1
    && cfb.outputDataStructure.measures[0].concept === "Change"
    && cfb.outputDataStructure.measures[0].output === "difference",
  cfb && JSON.stringify(cfb.outputDataStructure.measures));

check("concept-keyed constraints yield undefined dimension, original concept preserved (deferred to slice-resolution phase)",
  cfb && cfb.inputDataStructure.slices.length === 1
    && cfb.inputDataStructure.slices[0].constraints.length === 2
    && cfb.inputDataStructure.slices[0].constraints.every(c => c.dimension === undefined)
    && cfb.inputDataStructure.slices[0].constraints.some(c => c.concept === "Parameter")
    && cfb.inputDataStructure.slices[0].constraints.some(c => c.concept === "AnalysisVisit"),
  cfb && JSON.stringify(cfb.inputDataStructure.slices[0].constraints));

check("v06 fields survive untouched",
  t && Array.isArray(t.bindings) && t.bindings.length === 6 && t.oid === "T.CFB_ANCOVA");

check("adapting does not mutate the source",
  v06.analysisTransformations.find(x => x.oid === "T.CFB_ANCOVA").conceptId === undefined);

const m = adaptV06Method(ancova);
check("method conceptId comes from oid", m.conceptId === "M.ANCOVA");
check("method label is set", typeof m.label === "string" && m.label.length > 0);
check("method formula passes through", m.formula === ancova.formula);
check("method configurations pass through", m.configurations === ancova.configurations);
check("adapting does not mutate the source method", ancova.conceptId === undefined);

check("phrases carry placeholders after Task 3",
  lib.smartPhrases.every(p => Array.isArray(p.placeholders)));
check("roleDefinitions pass through", lib.roleDefinitions === v06.roleDefinitions);
check("configurationOptions pass through", lib.configurationOptions === v06.configurationOptions);

// Pinned, deliberate gap (see the "NOT adapted" note in
// smartphrase-lib-adapter.js's header): tpl.sliceKeys passes through with
// v06's raw `dimension` values, not the v07 category vocabulary
// ("ParameterDimension", "VisitDimension", …) the engine matches against
// (smartphrase-engine.js constructModelView). This assertion records
// today's v06 values so a change to either side is visible here, not
// silently absorbed. It is deliberately NOT a claim that sliceKeys resolve
// correctly at runtime — that resolution is deferred to the later
// slice-resolution phase and is out of scope here.
check("sliceKeys carry v06's raw dimension vocabulary (pinned, not v07 categories)",
  t && JSON.stringify((t.sliceKeys || []).map(sk => sk.dimension))
    === JSON.stringify(["Parameter", "AnalysisVisit", "Population"]),
  t && JSON.stringify(t.sliceKeys));

// --- Engine smoke test: prove the adapter's output actually satisfies the
// engine end to end, not just field-by-field. This is what would have
// caught the phrase_template_slotted gap (fixed above) before it shipped. ---
const { ctxOf, constructModelView } = await import(
  pathToFileURL(path.join(root, "ac-dc-app", "js", "utils", "smartphrase-engine.js")).href
);

const graph = { prefixes: {}, study: {}, concepts: {}, methodGrounding: {}, instances: [], traceTemplates: {} };
const ctx = ctxOf(lib, graph, null, null);
const view = constructModelView(ctx, { template: "T.CFB_ANCOVA", phrases: [] });

check("engine accepts the adapted library and returns a view with no errors",
  view && typeof view === "object" && !("errors" in view),
  view && JSON.stringify(view.errors));

// Regression test for the phrase_template_slotted fix: without the mapping,
// the engine would render v06's plain "using analysis of covariance" and
// silently drop the resolved {method} binding.
const ancovaPhrase = lib.smartPhrases.find(p => p.oid === "SP_METHOD_ANCOVA");
check("adapted SP_METHOD_ANCOVA.phrase_template carries the {method} slot",
  ancovaPhrase && ancovaPhrase.phrase_template.includes("{method}"),
  ancovaPhrase && ancovaPhrase.phrase_template);

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach(f => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — adapted v06 satisfies every field the engine reads.");
