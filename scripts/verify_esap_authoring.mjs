/*
 * Asserts on the markup the authoring surface returns. Pure strings — no DOM, no jsdom.
 *
 *   node scripts/verify_esap_authoring.mjs
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
const { renderAuthoredSentenceHtml, renderAuthoringSectionHtml } =
  await load("ac-dc-app/js/views/esap-authoring.js");
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
const context = buildSmartphraseContext(study, v06, methods);

const scenario = JSON.parse(fs.readFileSync(path.join(root,
  "ac-dc-app/data/study_ac_spec/Scenario 1_cdisc-pilot-lzzt-merged.study-instance-adas-cog-analysis-only.json"),
  "utf8"));
const spec = scenario.endpointSpecs.Endpoint_1;
const ep = getAllEndpoints(study).find((e) => e.id === "Endpoint_1");
prepareSpec(spec, context, context.lib);
const instance = specToInstance(spec, ep, context.lib);

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : "")); };

const html = renderAuthoredSentenceHtml(context.ctx, instance, ep.id);

check("returns a string", typeof html === "string", typeof html);
check("renders a chip per phrase",
  (html.match(/class="phrase-chip/g) || []).length === instance.phrases.length,
  String((html.match(/class="phrase-chip/g) || []).length));
check("chips carry their phrase oid", html.includes('data-phrase="SP_CFB_ENDPOINT"'));
check("chips carry their slot", html.includes('data-slot="parameter"'));
check("chips carry the endpoint id", html.includes(`data-ep-id="${ep.id}"`));
check("chips carry their role for the stylesheet", html.includes('data-role="endpoint"'));
check("the parameter label is rendered", html.includes("Adas-Cog(11) Subscore"), html.slice(0, 200));

/* Frame text must not be a chip — it belongs to the sentence template, not to any phrase. */
check("frame text is rendered outside chips",
  html.includes("frame-text"), html.slice(0, 200));

/* Render mode: label, not name_with_label — no "(Week 24)" duplication. */
check("visit renders as its label only",
  html.includes("Week 24") && !html.includes("Week 24 (Week 24)"), html);

/* Escaping must survive a label containing markup characters. Real study labels are tame, so
   this needs a synthetic one — otherwise the check passes whether esc() is called or not.
   The mutated concept must be the one this instance's visit slot actually binds: the graph
   holds one AnalysisVisit concept per study encounter, and the first one in insertion order
   (Screening 1) is not the one SP_TIMEPOINT's binding points at (Week 24, Encounter_11) — mutating
   an unreferenced concept would leave the rendered sentence, and this check, unaffected
   regardless of whether esc() runs. */
const visitConceptId = instance.phrases
  .map((p) => p.bindings && p.bindings.visit && p.bindings.visit.concept)
  .find(Boolean);
const hostileGraph = JSON.parse(JSON.stringify(context.graph));
hostileGraph.concepts[visitConceptId].label = '<script>alert("x")</script> & "quoted"';
const hostileCtx = { ...context, graph: hostileGraph,
  ctx: E.ctxOf(context.lib, hostileGraph, null, null) };
const hostileHtml = renderAuthoredSentenceHtml(hostileCtx.ctx, instance, ep.id);
check("markup characters in a label are escaped",
  !hostileHtml.includes("<script>") && hostileHtml.includes("&lt;script&gt;"),
  hostileHtml.slice(0, 300));

/* --- the whole section --- */
const section = renderAuthoringSectionHtml(context, spec, ep);
check("section includes the sentence", section.includes("phrase-chip"));
check("section shows the seeded transformation",
  section.includes("T.CFB_ANCOVA"), section.slice(0, 400));
check("section offers to add a phrase", section.includes("data-add-phrase"));

/* A spec that already carries a chosen transformation is resolved, not open. */
const chosenSection = renderAuthoringSectionHtml(context, spec, ep);
check("a chosen transformation is shown as resolved",
  chosenSection.includes("sp-seed-one") && chosenSection.includes("T.CFB_ANCOVA"),
  chosenSection.slice(0, 400));
check("a chosen transformation is not listed as candidates",
  !chosenSection.includes("sp-seed-many"), chosenSection.slice(0, 400));

/* A chosen transformation the sentence no longer supports must say so. */
const staleSpec = JSON.parse(JSON.stringify(spec));
staleSpec.selectedTransformationOid = "T.OS_LogRank";
check("a stale choice is flagged, not silently shown as resolved",
  renderAuthoringSectionHtml(context, staleSpec, ep).includes("sp-seed-stale"),
  renderAuthoringSectionHtml(context, staleSpec, ep).slice(0, 400));

/* With no choice recorded, the candidate list stands. */
const openSpec = JSON.parse(JSON.stringify(spec));
openSpec.selectedTransformationOid = null;
const openSection = renderAuthoringSectionHtml(context, openSpec, ep);
check("with no choice, candidates are listed", openSection.includes("sp-seed-many"),
  openSection.slice(0, 400));

/* --- an endpoint with no phrase instances gets a prompt, not a crash --- */
const emptySection = renderAuthoringSectionHtml(context, {}, ep);
check("an unauthored endpoint renders a prompt",
  typeof emptySection === "string" && emptySection.includes("data-start-authoring"),
  emptySection.slice(0, 200));
check("an unauthored endpoint renders no chips", !emptySection.includes("phrase-chip"));

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — the authoring surface renders the authored sentence.");
