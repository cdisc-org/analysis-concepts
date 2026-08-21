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

/* --- prepareSpec is safe to call twice --- */
const before = JSON.stringify(spec.phraseInstances);
prepareSpec(spec, context, context.lib);
check("prepareSpec is idempotent", JSON.stringify(spec.phraseInstances) === before);

/* The document's render policy is applied to bindings that lack one, without mutating the spec. */
const rendered = instance.phrases.find((p) => p.phrase === "SP_TIMEPOINT").bindings.visit;
check("visit binding gains render: label", rendered.render === "label", JSON.stringify(rendered));
check("the saved spec is not mutated",
  spec.phraseInstances.find((p) => p.phrase === "SP_TIMEPOINT").bindings.visit.render === undefined,
  JSON.stringify(spec.phraseInstances.find((p) => p.phrase === "SP_TIMEPOINT").bindings.visit));
const resRendered = E.resolveInstance(context.ctx, instance, "en");
check("the sentence no longer duplicates the visit",
  !resRendered.sentence.includes("Week 24 (Week 24)"), resRendered.sentence);

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — engine context and spec→instance conversion work against the real study.");
