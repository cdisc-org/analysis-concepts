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
const categories = JSON.parse(fs.readFileSync(
  path.join(root, "model/concept/concept_categories.json"), "utf8")).categories;
const context = buildSmartphraseContext(study, v06, methods, categories);

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

/* Spec §7.4: a fixture concept must be shown as unresolved. An `UNRESOLVED.*` concept resolves
   with no engine error at all — it is a real graph concept with `anchored: false` — so this has
   to be read off the graph. Scenario 1 binds an unanchored parameter and an anchored visit, so
   both directions are pinned: marking everything, or nothing, fails one of these. */
const chipOpenTag = (h, oid) => {
  const at = h.indexOf(`data-phrase="${oid}"`);
  return at < 0 ? "" : h.slice(h.lastIndexOf("<span", at), at);
};
const cfbChip = chipOpenTag(html, "SP_CFB_ENDPOINT");
const timepointChip = chipOpenTag(html, "SP_TIMEPOINT");
check("an unanchored binding marks its chip unresolved",
  cfbChip.includes("sp-unresolved"), cfbChip);
check("an anchored binding does not",
  !timepointChip.includes("sp-unresolved"), timepointChip);

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

/* The section reports the analysis the SENTENCE names, not selectedAnalyses[0]. Index 0 belongs
   to the author's own Step 4 choice by design, so with [author ANCOVA, seeded MMRM] the legacy
   mirror says ANCOVA while the sentence unambiguously names MMRM. */
const bothSpec = JSON.parse(JSON.stringify(spec));
bothSpec.phraseInstances = [
  { phrase: "SP_CFB_ENDPOINT", bindings: {} },
  { phrase: "SP_METHOD_MMRM", bindings: {} }
];
bothSpec.selectedAnalyses = [
  { transformationOid: "T.CFB_ANCOVA", resolvedBindings: [], activeInteractions: [],
    estimandSummaryPattern: null },
  { transformationOid: "T.CFB_MMRM_Primary", resolvedBindings: [], activeInteractions: [],
    estimandSummaryPattern: null, seededByPhrase: true }
];
bothSpec.selectedTransformationOid = "T.CFB_ANCOVA";   /* the mirror, per the index-0 policy */
const bothSection = renderAuthoringSectionHtml(context, bothSpec, ep);
check("the section names the analysis the sentence seeded, not the mirror",
  /sp-seed-one">T\.CFB_MMRM_Primary</.test(bothSection)
    && !bothSection.includes("T.CFB_ANCOVA"),
  bothSection.slice(0, 500));

/* A single candidate that is a DERIVATION is not seeded, so the line must not claim it is.
   SP_PEAK_ENDPOINT's sole candidate is T.PeakConcentration, a derivation. */
const derivSpec = { phraseInstances: [{ phrase: "SP_PEAK_ENDPOINT", bindings: {} }] };
const derivSection = renderAuthoringSectionHtml(context, derivSpec, ep);
check("a lone derivation candidate is not reported as seeded",
  !derivSection.includes("sp-seed-one"), derivSection.slice(0, 500));
check("and it is named as a derivation belonging to Step 6",
  derivSection.includes("T.PeakConcentration is a derivation, specified in Step 6")
    && derivSection.includes("sp-seed-none"),
  derivSection.slice(0, 500));

/* The single-ANALYSIS case is untouched: it still reports as resolved. */
const oneAnalysisSpec = { phraseInstances: [
  { phrase: "SP_CFB_ENDPOINT", bindings: {} },
  { phrase: "SP_METHOD_ANCOVA", bindings: {} }
] };
const oneAnalysisSection = renderAuthoringSectionHtml(context, oneAnalysisSpec, ep);
check("a lone analysis candidate is still reported as seeded",
  oneAnalysisSection.includes(`<span class="sp-seed-one">T.CFB_ANCOVA</span>`),
  oneAnalysisSection.slice(0, 500));

/* --- an endpoint with no phrase instances gets a prompt, not a crash --- */
const emptySection = renderAuthoringSectionHtml(context, {}, ep);
check("an unauthored endpoint renders a prompt",
  typeof emptySection === "string" && emptySection.includes("data-start-authoring"),
  emptySection.slice(0, 200));
check("an unauthored endpoint renders no chips", !emptySection.includes("phrase-chip"));

/* ---------- slot editor ---------- */

const { renderSlotEditorHtml } = await load("ac-dc-app/js/views/esap-authoring.js");

const editor = renderSlotEditorHtml(context, spec, ep, "SP_TIMEPOINT", "visit");
check("editor is a string", typeof editor === "string", typeof editor);
check("editor offers every encounter as an option",
  (editor.match(/<option /g) || []).length === 12,
  String((editor.match(/<option /g) || []).length));
check("editor options carry concept ids",
  editor.includes('value="V.Encounter_11"'), editor.slice(0, 300));
check("editor marks the current binding selected",
  /value="V\.Encounter_11"[^>]*selected/.test(editor), editor.slice(0, 400));
/* Anchored on the rendered element and its text, not on the bare word "visit" — which also
   occurs in `data-slot="visit"`, so deleting the whole sp-slot-source element left the old
   form of this check green. */
check("editor names the declared source",
  editor.includes("sp-slot-source") && editor.includes("from visit"), editor.slice(0, 300));
check("editor carries the write target",
  editor.includes('data-phrase="SP_TIMEPOINT"') && editor.includes('data-slot="visit"'));

/* `data-dimension` is the key the picker writes into dimensionValues, and Steps 6 and 8 read
   the key the endpoint's dimensionCategoryPicks names — endpoint-how.js renames it when the
   pick changes. With no pick, the library's own name stands. Note the pick is on
   `VisitDimension`, not on an `AnalysisVisitDimension` that does not exist: resolution is by
   category membership, so a name-suffix convention would not find it. */
check("with no pick, the library's dimension name stands",
  editor.includes('data-dimension="AnalysisVisit"'), editor.slice(0, 300));
const ocPicked = { ...spec, dimensionCategoryPicks: { VisitDimension: "Visit" } };
const ocEditor = renderSlotEditorHtml(context, ocPicked, ep, "SP_TIMEPOINT", "visit");
check("a category pick redirects the dimension the picker writes",
  ocEditor.includes('data-dimension="Visit"')
    && !ocEditor.includes('data-dimension="AnalysisVisit"'), ocEditor.slice(0, 300));
/* Population belongs to no category, so no pick can ever redirect it. */
const popEditor = renderSlotEditorHtml(context, ocPicked, ep, "SP_POPULATION", "population");
check("a dimension in no category is never redirected",
  popEditor.includes('data-dimension="Population"'), popEditor.slice(0, 300));

/* A parameter slot draws from biomedical concepts — a different, much larger set. */
const paramEditor = renderSlotEditorHtml(context, spec, ep, "SP_CFB_ENDPOINT", "parameter");
check("parameter editor draws from biomedical concepts",
  (paramEditor.match(/<option /g) || []).length === 183,
  String((paramEditor.match(/<option /g) || []).length));
/* Anchored on the id followed by `selected`, matching the visit check's pattern above — not
   merely that the id appears somewhere in a 183-option string. The diagnostic slices around
   the id's own position rather than the string's first 300 characters, which on this
   much-larger option list never reaches the fragment in question. */
const unresolvedIdx = paramEditor.indexOf("UNRESOLVED.biomedicalConcept.adas-cog-11-subscore");
const unresolvedContext = unresolvedIdx >= 0
  ? paramEditor.slice(Math.max(0, unresolvedIdx - 40), unresolvedIdx + 250)
  : paramEditor.slice(0, 300);
check("an unresolved current value is offered and selected",
  /value="UNRESOLVED\.biomedicalConcept\.adas-cog-11-subscore"[^>]*selected/.test(paramEditor),
  unresolvedContext);

/* An unknown slot must not crash. */
const noSlot = renderSlotEditorHtml(context, spec, ep, "SP_TIMEPOINT", "nosuchslot");
check("an unknown slot renders an empty editor, not a crash", typeof noSlot === "string");
check("an unknown slot offers no options", !noSlot.includes("<option "));

/* A slot whose dimension has no declared source must offer nothing rather than an empty
   picker — and must not carry a dimension that could be written. */
for (const [oid, slotName] of [["SP_GROUPING", "treatment"], ["SP_TTE_ENDPOINT", "event"]]) {
  const unbindable = renderSlotEditorHtml(context, spec, ep, oid, slotName);
  check(`${oid}/${slotName} renders as unbindable`,
    unbindable.includes("sp-slot-unbindable"), unbindable.slice(0, 200));
  check(`${oid}/${slotName} offers no options`, !unbindable.includes("<option "), unbindable.slice(0, 200));
  check(`${oid}/${slotName} carries no dimension to write`,
    !unbindable.includes("data-dimension"), unbindable.slice(0, 200));
}

/* ---------- add and remove ---------- */

const { renderAddPhraseHtml, addPhraseToSpec, removePhraseFromSpec } =
  await load("ac-dc-app/js/views/esap-authoring.js");

/* From nothing, only endpoint phrases can start a sentence. */
const blank = {};
const startList = renderAddPhraseHtml(context, blank, ep);
/* The count and the exclusion together are the gate: asserting only that SP_CFB_ENDPOINT is
   present left the check green when the role filter was replaced by `filter(() => true)`,
   which offers "using ANCOVA" as a sentence STARTER. v06 declares 8 endpoint-role phrases. */
const startOids = [...startList.matchAll(/data-add-oid="([^"]+)"/g)].map((m) => m[1]);
check("a blank spec offers exactly the endpoint phrases",
  startOids.length === 8 && startOids.every((oid) => /_ENDPOINT$/.test(oid)),
  JSON.stringify(startOids));
check("and offers no method phrase as a sentence starter",
  !startOids.some((oid) => /^SP_METHOD_/.test(oid)), JSON.stringify(startOids));
check("options carry the add action", startList.includes("data-add-oid"));

/* With an endpoint phrase chosen, the offers narrow to what its candidates allow. */
const building = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT", bindings: {} }] };
const nextList = renderAddPhraseHtml(context, building, ep);
check("a method phrase is offerable next", nextList.includes("SP_METHOD_ANCOVA"),
  nextList.slice(0, 400));
check("an already-used phrase is not offered again",
  !nextList.includes('data-add-oid="SP_CFB_ENDPOINT"'), nextList.slice(0, 400));
check("a phrase no candidate allows is not offered",
  !nextList.includes("SP_METHOD_LOGRANK"), nextList.slice(0, 400));

/* Adding, then removing. */
addPhraseToSpec(building, context, "SP_METHOD_ANCOVA");
check("adding appends the phrase",
  building.phraseInstances.some((p) => p.phrase === "SP_METHOD_ANCOVA"),
  JSON.stringify(building.phraseInstances.map((p) => p.phrase)));
check("adding a method phrase binds its method",
  building.phraseInstances.find((p) => p.phrase === "SP_METHOD_ANCOVA")
    ?.bindings?.method?.method === "M.ANCOVA",
  JSON.stringify(building.phraseInstances));

addPhraseToSpec(building, context, "SP_METHOD_ANCOVA");
check("adding twice does not duplicate",
  building.phraseInstances.filter((p) => p.phrase === "SP_METHOD_ANCOVA").length === 1,
  String(building.phraseInstances.length));

removePhraseFromSpec(building, "SP_METHOD_ANCOVA");
check("removing drops the phrase",
  !building.phraseInstances.some((p) => p.phrase === "SP_METHOD_ANCOVA"),
  JSON.stringify(building.phraseInstances.map((p) => p.phrase)));
removePhraseFromSpec(building, "SP_NOT_PRESENT");
check("removing an absent phrase is a no-op", building.phraseInstances.length === 1);

/* A phrase the author has only just added has no resolved binding yet, so every other check in
   this file — all of which run against Scenario 1 AFTER backfill — renders a spec whose bindings
   are already populated. That is the gap this covers: the chip must carry the slot the author
   needs to click, taken from the phrase definition rather than from a binding that does not
   exist yet. */
const fresh = {};
addPhraseToSpec(fresh, context, "SP_CFB_ENDPOINT");
const freshHtml = renderAuthoredSentenceHtml(context.ctx,
  specToInstance(fresh, ep, context.lib), ep.id);
check("a freshly added phrase renders a usable slot",
  /data-phrase="SP_CFB_ENDPOINT"[^>]*data-slot="parameter"/.test(freshHtml),
  freshHtml.slice(0, 400));
check("and its slot editor offers real options",
  (renderSlotEditorHtml(context, fresh, ep, "SP_CFB_ENDPOINT", "parameter")
    .match(/<option /g) || []).length > 100,
  String((renderSlotEditorHtml(context, fresh, ep, "SP_CFB_ENDPOINT", "parameter")
    .match(/<option /g) || []).length));

/* The endpoint phrase is what makes a sentence a sentence — it must not be removable. */
removePhraseFromSpec(building, "SP_CFB_ENDPOINT");
check("the endpoint phrase cannot be removed",
  building.phraseInstances.some((p) => p.phrase === "SP_CFB_ENDPOINT"),
  JSON.stringify(building.phraseInstances.map((p) => p.phrase)));

/* ---------- the remove control ---------- */

check("a removable phrase carries a remove control",
  /data-remove-phrase="SP_TIMEPOINT"/.test(html), html.slice(0, 400));
check("the remove control carries the endpoint id",
  new RegExp(`data-remove-phrase="SP_TIMEPOINT"[^>]*data-ep-id="${ep.id}"`).test(html),
  html.slice(0, 400));
check("the endpoint phrase carries no remove control",
  !/data-remove-phrase="SP_CFB_ENDPOINT"/.test(html), html.slice(0, 400));
/* Counted on markup rendered AFTER a mutation. The old form re-evaluated the identical
   expression on the identical `html` string as the "renders a chip per phrase" check far
   above, and `html` predates every add and remove in this file — so it restated a passing
   check rather than gating anything. */
const mutated = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT", bindings: {} }] };
addPhraseToSpec(mutated, context, "SP_TIMEPOINT");
addPhraseToSpec(mutated, context, "SP_METHOD_ANCOVA");
removePhraseFromSpec(mutated, "SP_TIMEPOINT");
const mutatedHtml = renderAuthoredSentenceHtml(context.ctx,
  specToInstance(mutated, ep, context.lib), ep.id);
check("the remove control does not disturb the chip count",
  (mutatedHtml.match(/class="phrase-chip/g) || []).length === mutated.phraseInstances.length,
  `${(mutatedHtml.match(/class="phrase-chip/g) || []).length} chips for ` +
  JSON.stringify(mutated.phraseInstances.map((p) => p.phrase)));
check("and the surviving removable phrase keeps its control",
  (mutatedHtml.match(/data-remove-phrase="/g) || []).length === 1, mutatedHtml);

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — the authoring surface renders the authored sentence.");
