# SmartPhrase Authoring Surface Implementation Plan (P4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Step 7's analysis sections writable — author the SAP sentence with smartphrases, and have that seed a draft transformation into Steps 3 and 4.

**Architecture:** Every render function is a pure `(ctx, spec, …) -> htmlString`, so a Node harness can assert on the markup with no DOM and no test framework; the event wiring on top is deliberately thin. The engine context (adapted library + concept graph) is built once per study and cached on `appState`. Every write goes through `setDimensionBinding`, which the P3 layer already guarantees keeps ids and labels in step.

**Tech Stack:** Vanilla ES modules, no bundler, no framework. Node for verification scripts, no npm dependencies. No test framework — verification is plain scripts, matching `scripts/verify_phrase_bindings.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-20-esap-smartphrase-authoring-design.md` — §11.1–11.3, plus §8 (USDM reuse) and §4 (one instance, many projections).

## Global Constraints

- **Render functions are pure and return strings.** No DOM API inside them; they must run under Node. Event wiring lives separately, in `renderEsapBuilder`'s existing wiring block.
- **Every binding write goes through `setDimensionBinding`** from `ac-dc-app/js/utils/phrase-bindings.js`. Never write `phraseInstances` or `dimensionValues` directly — that is the single-writer rule the P3 layer exists to enforce.
- **`ensureUnresolvedConcepts` must run on every load**, before rendering. A saved `UNRESOLVED.*` binding whose concept is missing from a freshly-built graph renders `⟨slot?⟩` and drops its cube fixture.
- **Render mode is `label` for parameter and visit slots, `name` for population.** Passed explicitly on every binding — the engine's `default_render` is `name_with_label`, which yields "at Week 24 (Week 24)".
- **Steps 3, 4, 5, 6 and 8 keep their current behaviour.** This plan adds to Step 7 only.
- **Node stdlib only, no npm installs.**
- **Commit locally. NEVER `git push`.**
- **Do not modify** `lib/transformations/ACDC_Transformation_Library_v06.json`, anything under `smartphrase/`, `ac-dc-app/js/utils/smartphrase-engine.js`, `ac-dc-app/js/utils/smartphrase-lib-adapter.js`, `ac-dc-app/js/utils/smartphrase-graph.js`, `ac-dc-app/js/utils/phrase-slots.js`, `ac-dc-app/js/utils/phrase-bindings.js`, or the scenario files in `ac-dc-app/data/study_ac_spec/`.
- The eight existing gates must pass at every commit:
  ```bash
  python3 scripts/validate_phrase_shapes.py && python3 scripts/upgrade_phrase_metadata.py --check \
    && node smartphrase/tools/verify.mjs && node scripts/verify_smartphrase_engine.mjs \
    && node scripts/verify_smartphrase_adapter.mjs && node scripts/verify_smartphrase_graph.mjs \
    && node scripts/verify_phrase_slots.mjs && node scripts/verify_phrase_bindings.mjs
  ```

---

## What P3 already provides

These are done, gated, and must not be reimplemented:

| Module | Exports this plan uses |
|---|---|
| `smartphrase-graph.js` | `buildConceptGraph(study, lib, methods)`, `addUnresolvedConcept(graph, source, label)` |
| `smartphrase-lib-adapter.js` | `adaptV06Library(v06, methods)` |
| `smartphrase-engine.js` (default export) | `ctxOf(lib, graph, i18n, proposed)`, `resolveInstance(ctx, instance, lang)`, `phraseDef(ctx, oid)`, `templateDef(ctx, conceptId)` |
| `phrase-slots.js` | `resolveCandidates(phraseOids, lib)`, `deriveSlots(candidates, lib)` — `phraseSlotForDimension` exists but maps dimension→phrase/slot, the opposite of what the slot editor needs |
| `phrase-bindings.js` | `setDimensionBinding(spec, graph, phraseOid, slot, dimension, conceptId, render)`, `backfillPhraseInstances(spec, graph, lib)`, `ensureUnresolvedConcepts(spec, graph, lib)`, `resolveLabelToConceptId(graph, source, label)` |

## Reference facts — verified 2026-08-21

- `resolveInstance` returns `{ parts, sentence, errors, phrases }`. `parts` alternates `{type:"text", text, frame}` and `{type:"phrase", phrase:{oid, role, text, template, bindings, anchors, errors}}`.
- An endpoint's `level` is a string like `"Primary Endpoint"` (from `getAllEndpoints`).
- `appState` already holds `selectedStudy`, `selectedStudyIndex`, `transformationLibrary` (raw v06), `endpointSpecs`, `methodsIndex`.
- `esap-builder.js` re-renders by calling `renderEsapBuilder(container)` again — it already does this at lines 261 and 1344 after interactions.
- `dispatchFromSpec` maps `analyses.primary.main` → `renderMainAnalyses(selectedEps, study, /Primary/i)` at line 448.
- `css/smartphrase.css` already ships `.phrase-chip` with per-role colouring via `[data-role]`, and `.sp-palette`.
- For `T.CFB_ANCOVA`, `resolveCandidates(["SP_CFB_ENDPOINT","SP_METHOD_ANCOVA"], lib)` returns exactly one candidate.

## File Structure

| File | Responsibility |
|---|---|
| `ac-dc-app/js/utils/smartphrase-context.js` (new) | Build and cache `{lib, graph, ctx}` from app state; convert a spec to an engine instance. Pure functions plus one cached accessor. |
| `scripts/verify_smartphrase_context.mjs` (new) | Context building and spec→instance conversion against the real study. |
| `ac-dc-app/js/views/esap-authoring.js` (new) | All P4 render functions, each pure `(…) -> htmlString`. |
| `scripts/verify_esap_authoring.mjs` (new) | Asserts on the returned markup. |
| `ac-dc-app/js/views/esap-builder.js` (modify) | Two `dispatchFromSpec` cases; one wiring block. Nothing else. |

---

## Task 1: Engine context from app state, and spec → instance

**Files:**
- Create: `ac-dc-app/js/utils/smartphrase-context.js`
- Create: `scripts/verify_smartphrase_context.mjs`

**Interfaces:**
- Consumes: `adaptV06Library(v06, methods)`, `buildConceptGraph(study, lib, methods)`, `ensureUnresolvedConcepts(spec, graph, lib)`, `backfillPhraseInstances(spec, graph, lib)`, engine default export's `ctxOf`.
- Produces:
  - `buildSmartphraseContext(study, v06, methods) -> { lib, graph, ctx }`
  - `specToInstance(spec, ep, lib) -> { id, template, sentenceRole, phrases } | null` — `null` when the spec has no `phraseInstances`
  - `prepareSpec(spec, context, lib) -> void` — runs `ensureUnresolvedConcepts` then `backfillPhraseInstances`, in that order

- [ ] **Step 1: Write the failing harness**

Create `scripts/verify_smartphrase_context.mjs`:

```js
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

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — engine context and spec→instance conversion work against the real study.");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/kwl/repos/Github/CDISC/analysis-concepts
node scripts/verify_smartphrase_context.mjs; echo "exit=$?"
```
Expected: `ERR_MODULE_NOT_FOUND` for `smartphrase-context.js`, `exit=1`.

- [ ] **Step 3: Write the module**

Create `ac-dc-app/js/utils/smartphrase-context.js`:

```js
/**
 * Assembles the smartphrase engine's evaluation context from app state, and converts a saved
 * endpoint spec into the instance shape the engine consumes.
 *
 * The engine takes its library and its concept graph as parameters, so this module is the
 * single place the app's data is married to them. Everything here is pure except
 * `getSmartphraseContext`, which caches per study.
 */

import { adaptV06Library } from "./smartphrase-lib-adapter.js";
import { buildConceptGraph } from "./smartphrase-graph.js";
import { ensureUnresolvedConcepts, backfillPhraseInstances } from "./phrase-bindings.js";
import SPEngine from "./smartphrase-engine.js";

/**
 * Build the adapted library, the concept graph, and the engine context.
 *
 * @param {object} study    parsed study from parseUSDM()
 * @param {object} v06      the raw ACDC_Transformation_Library_v06.json
 * @param {object} methods  { [oid]: method JSON }
 * @returns {{lib: object, graph: object, ctx: object}}
 */
export function buildSmartphraseContext(study, v06, methods = {}) {
  const lib = adaptV06Library(v06, methods);
  const graph = buildConceptGraph(study, lib, methods);
  /* `proposed` is null: the demo's proposed-overlay entities are not part of this app's
     library, and the ES-module engine has no global fallback for them. */
  const ctx = SPEngine.ctxOf(lib, graph, null, null);
  return { lib, graph, ctx };
}

/**
 * Bring a saved spec up to date with the freshly-built graph.
 *
 * Order matters. `ensureUnresolvedConcepts` re-adds the synthesised concepts a saved binding
 * refers to — the graph is rebuilt from USDM on every load and has never heard of them —
 * and must run before anything resolves. `backfillPhraseInstances` then no-ops for specs that
 * already have `phraseInstances`, and derives them for older saves.
 *
 * @param {object} spec     endpointSpecs[epId]
 * @param {{graph: object}} context
 * @param {object} lib
 */
export function prepareSpec(spec, context, lib) {
  ensureUnresolvedConcepts(spec, context.graph, lib);
  backfillPhraseInstances(spec, context.graph, lib);
}

/** "Primary Endpoint" -> "the primary analysis". Falls back to a neutral phrase. */
function sentenceRoleFor(ep) {
  const level = String((ep && ep.level) || "").toLowerCase();
  if (level.includes("primary")) return "the primary analysis";
  if (level.includes("secondary")) return "a secondary analysis";
  if (level.includes("exploratory") || level.includes("tertiary")) return "an exploratory analysis";
  return "an analysis";
}

/**
 * Convert a saved spec into the instance the engine resolves.
 *
 * The template is the spec's chosen transformation. When the phrase set has not narrowed to
 * one, `selectedTransformationOid` is null and the caller supplies a candidate — the engine
 * needs a template to build a model view, though `resolveInstance` only uses it for role order.
 *
 * @param {object} spec  endpointSpecs[epId]
 * @param {object} ep    endpoint from getAllEndpoints()
 * @param {object} lib   adapted library
 * @returns {object|null} null when the spec carries no phrase instances
 */
export function specToInstance(spec, ep, lib) {
  if (!spec || !Array.isArray(spec.phraseInstances) || !spec.phraseInstances.length) return null;
  return {
    id: (ep && ep.id) || "instance",
    template: spec.selectedTransformationOid || null,
    sentenceRole: sentenceRoleFor(ep),
    phrases: spec.phraseInstances
  };
}

/* ---------------------------------------------------------------- cached accessor */

let cache = { key: null, value: null };

/**
 * The context for the currently-selected study, built once and reused.
 *
 * Keyed on `selectedStudyIndex`, so switching study rebuilds. Returns null before a study is
 * chosen or before the library has loaded.
 *
 * @param {object} appState
 * @returns {{lib: object, graph: object, ctx: object}|null}
 */
export function getSmartphraseContext(appState) {
  if (!appState || !appState.selectedStudy || !appState.transformationLibrary) return null;
  const key = String(appState.selectedStudyIndex);
  if (cache.key === key && cache.value) return cache.value;
  const methods = appState.methodsCache || {};
  cache = { key, value: buildSmartphraseContext(appState.selectedStudy, appState.transformationLibrary, methods) };
  return cache.value;
}

/** Drop the cache. Call when the study or the library changes underneath. */
export function resetSmartphraseContext() {
  cache = { key: null, value: null };
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_smartphrase_context.mjs; echo "exit=$?"
```
Expected: `PASS — engine context and spec→instance conversion work against the real study.` and `exit=0`

If the concept count assertion fails, report the actual number rather than editing it — 196 is 182 biomedical concepts + 12 encounters + 2 populations, and a different number means the graph changed.

- [ ] **Step 5: Run the eight existing gates**

```bash
python3 scripts/validate_phrase_shapes.py && python3 scripts/upgrade_phrase_metadata.py --check \
  && node smartphrase/tools/verify.mjs && node scripts/verify_smartphrase_engine.mjs \
  && node scripts/verify_smartphrase_adapter.mjs && node scripts/verify_smartphrase_graph.mjs \
  && node scripts/verify_phrase_slots.mjs && node scripts/verify_phrase_bindings.mjs
echo "gates-exit=$?"
```
Expected: eight PASS lines, `gates-exit=0`.

- [ ] **Step 6: Commit**

```bash
git add ac-dc-app/js/utils/smartphrase-context.js scripts/verify_smartphrase_context.mjs
git commit -m "Assemble the smartphrase engine context from app state

Builds the adapted library, concept graph and engine context once per study, and
converts a saved endpoint spec into the instance the engine resolves. Rehydration
runs before backfill so a saved UNRESOLVED binding survives a reload."
```

---

## Task 2: Render the authored sentence

The first visible change: §4.1.2 stops saying "not configured" and shows the sentence.

**Files:**
- Create: `ac-dc-app/js/views/esap-authoring.js`
- Create: `scripts/verify_esap_authoring.mjs`
- Modify: `ac-dc-app/js/views/esap-builder.js` (`dispatchFromSpec` case `analyses.primary.main` and `analyses.secondary.key.main`)

**Interfaces:**
- Consumes: Task 1's `specToInstance`, `prepareSpec`; the engine's `resolveInstance`.
- Produces:
  - `renderAuthoredSentenceHtml(ctx, instance, epId) -> string` — the sentence with each phrase as a clickable chip
  - `renderAuthoringSectionHtml(context, spec, ep) -> string` — the whole §4.1.2 body for one endpoint

- [ ] **Step 1: Write the failing harness**

Create `scripts/verify_esap_authoring.mjs`:

```js
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

/* HTML-escaping: a label containing a bracket must not break the markup. */
check("labels are escaped", !html.includes("<script"), "unexpected raw markup");

/* --- the whole section --- */
const section = renderAuthoringSectionHtml(context, spec, ep);
check("section includes the sentence", section.includes("phrase-chip"));
check("section shows the seeded transformation",
  section.includes("T.CFB_ANCOVA"), section.slice(0, 400));
check("section offers to add a phrase", section.includes("data-add-phrase"));

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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node scripts/verify_esap_authoring.mjs; echo "exit=$?"
```
Expected: `ERR_MODULE_NOT_FOUND` for `esap-authoring.js`, `exit=1`.

- [ ] **Step 3: Write the render module**

Create `ac-dc-app/js/views/esap-authoring.js`:

```js
/**
 * The Step 7 authoring surface.
 *
 * Every function here is pure: it takes state and returns an HTML string, with no DOM API and
 * no reads of module-level app state. That is what lets `scripts/verify_esap_authoring.mjs`
 * assert on the markup under Node with no jsdom and no test framework. The event wiring that
 * makes the markup interactive lives in esap-builder.js, keyed off the data- attributes below.
 *
 * Data attributes are the contract between this file and that wiring:
 *   data-ep-id      the endpoint whose spec a control edits
 *   data-phrase     the smartphrase oid
 *   data-slot       the placeholder name within that phrase
 *   data-add-phrase / data-start-authoring   actions rather than edits
 */

import SPEngine from "../utils/smartphrase-engine.js";
import { specToInstance, prepareSpec } from "../utils/smartphrase-context.js";
import { resolveCandidates } from "../utils/phrase-slots.js";

/** Minimal HTML escape for text interpolated into markup. */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The authored sentence: frame text as plain prose, each phrase as a clickable chip.
 *
 * The engine returns `parts` already ordered by the language's sentence template, so this walks
 * them rather than composing word order itself.
 *
 * @param {object} ctx       engine context
 * @param {object} instance  from specToInstance()
 * @param {string} epId
 * @returns {string} HTML
 */
export function renderAuthoredSentenceHtml(ctx, instance, epId) {
  if (!instance) return "";
  const res = SPEngine.resolveInstance(ctx, instance, "en");
  let first = true;

  const body = res.parts.map((part) => {
    if (part.type === "text") {
      const text = first && part.text.trim()
        ? part.text.charAt(0).toUpperCase() + part.text.slice(1)
        : part.text;
      if (part.text.trim()) first = false;
      return part.frame
        ? `<span class="frame-text">${esc(text)}</span>`
        : esc(text);
    }
    const rp = part.phrase;
    const slot = (rp.bindings && rp.bindings[0] && rp.bindings[0].placeholder) || "";
    const label = first ? rp.text.charAt(0).toUpperCase() + rp.text.slice(1) : rp.text;
    first = false;
    const broken = (rp.errors || []).length ? " sp-unresolved" : "";
    return `<span class="phrase-chip${broken}" data-role="${esc(rp.role)}" ` +
      `data-phrase="${esc(rp.oid)}" data-slot="${esc(slot)}" data-ep-id="${esc(epId)}" ` +
      `title="${esc(rp.template || rp.oid)}">${esc(label)}</span>`;
  }).join("");

  const errs = res.errors.length
    ? `<div class="sp-errors">${res.errors.map((e) => esc(e)).join("<br>")}</div>`
    : "";

  return `<p class="sp-sentence">${body}</p>${errs}`;
}

/**
 * The whole §4.1.2 body for one endpoint: the sentence, what it seeds, and the add control.
 *
 * @param {{lib: object, graph: object, ctx: object}} context
 * @param {object} spec  endpointSpecs[epId] (may be empty)
 * @param {object} ep    endpoint from getAllEndpoints()
 * @returns {string} HTML
 */
export function renderAuthoringSectionHtml(context, spec, ep) {
  prepareSpec(spec, context, context.lib);
  const instance = specToInstance(spec, ep, context.lib);

  if (!instance) {
    return `<div class="sp-authoring sp-empty">
      <p class="sp-prompt">No analysis written yet for ${esc(ep.label || ep.id)}.</p>
      <button class="btn btn-sm btn-primary" data-start-authoring data-ep-id="${esc(ep.id)}">
        Write the analysis
      </button>
    </div>`;
  }

  const oids = instance.phrases.map((p) => p.phrase);
  const candidates = resolveCandidates(oids, context.lib);
  const seeded = candidates.length === 1
    ? `<span class="sp-seed-one">${esc(candidates[0].conceptId)}</span>`
    : candidates.length
      ? `<span class="sp-seed-many">${candidates.length} candidates: ` +
        `${candidates.map((c) => esc(c.conceptId)).join(", ")}</span>`
      : `<span class="sp-seed-none">no matching transformation</span>`;

  const pipeline = Array.isArray(spec.derivationChain) && spec.derivationChain.length
    ? `<span class="sp-pipeline-done">derivations specified (${spec.derivationChain.length})</span>`
    : `<span class="sp-pipeline-pending">derivations not yet specified &mdash; see Step 6</span>`;

  return `<div class="sp-authoring" data-ep-id="${esc(ep.id)}">
    ${renderAuthoredSentenceHtml(context.ctx, instance, ep.id)}
    <div class="sp-meta">
      <span class="sp-meta-label">Seeds into Step 4:</span> ${seeded}
      <span class="sp-meta-sep">&middot;</span> ${pipeline}
    </div>
    <button class="btn btn-sm btn-secondary" data-add-phrase data-ep-id="${esc(ep.id)}">
      + add phrase
    </button>
  </div>`;
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_esap_authoring.mjs; echo "exit=$?"
```
Expected: `PASS — the authoring surface renders the authored sentence.` and `exit=0`

- [ ] **Step 5: Wire it into the eSAP builder**

In `ac-dc-app/js/views/esap-builder.js`, add to the imports at the top:

```js
import { renderAuthoringSectionHtml } from './esap-authoring.js';
import { getSmartphraseContext } from '../utils/smartphrase-context.js';
```

Then add this helper immediately above `function renderMainAnalyses`:

```js
/**
 * §4.1.2 and its secondary equivalent: the smartphrase authoring surface, one block per
 * endpoint at this level. Falls back to the previous read-only cards when the engine context
 * cannot be built (no study selected, or the library has not loaded).
 */
function renderAuthoredAnalyses(selectedEps, study, levelRe) {
  const eps = (selectedEps || []).filter(ep => levelRe.test(ep.level));
  if (!eps.length) return renderPlaceholderSection('No analyses configured at this level.');

  const context = getSmartphraseContext(appState);
  if (!context) return renderMainAnalyses(selectedEps, study, levelRe);

  return eps.map(ep => {
    if (!appState.endpointSpecs[ep.id]) appState.endpointSpecs[ep.id] = {};
    return renderAuthoringSectionHtml(context, appState.endpointSpecs[ep.id], ep);
  }).join('');
}
```

Then change the two dispatch cases:

```js
    case 'analyses.primary.main':
      return renderAuthoredAnalyses(selectedEps, study, /Primary/i);
```

```js
    case 'analyses.secondary.key.main':
      return renderAuthoredAnalyses(selectedEps, study, /Secondary/i);
```

Leave every other case, and `renderMainAnalyses` itself, exactly as they are — the fallback path uses it.

- [ ] **Step 6: Run the eight gates and confirm the app still boots**

```bash
python3 scripts/validate_phrase_shapes.py && python3 scripts/upgrade_phrase_metadata.py --check \
  && node smartphrase/tools/verify.mjs && node scripts/verify_smartphrase_engine.mjs \
  && node scripts/verify_smartphrase_adapter.mjs && node scripts/verify_smartphrase_graph.mjs \
  && node scripts/verify_phrase_slots.mjs && node scripts/verify_phrase_bindings.mjs \
  && node scripts/verify_smartphrase_context.mjs && node scripts/verify_esap_authoring.mjs
echo "gates-exit=$?"
for f in $(find ac-dc-app/js -name '*.js'); do node --check "$f" || echo "SYNTAX FAIL: $f"; done
echo "syntax-ok"
```
Expected: ten PASS lines, `gates-exit=0`, and no syntax failures.

- [ ] **Step 7: Commit**

```bash
git add ac-dc-app/js/views/esap-authoring.js scripts/verify_esap_authoring.mjs ac-dc-app/js/views/esap-builder.js
git commit -m "Render the authored sentence in the eSAP builder's analysis sections

Replaces the 'not configured' placeholder in 4.1.2 and its secondary equivalent
with the smartphrase sentence, what it seeds into Step 4, and whether the
derivation pipeline is still pending."
```

---

## Task 3: The slot editor

Clicking a chip opens a picker whose options come from the slot's declared source.

**Files:**
- Modify: `ac-dc-app/js/views/esap-authoring.js` (add `renderSlotEditorHtml`)
- Modify: `scripts/verify_esap_authoring.mjs` (append)
- Modify: `ac-dc-app/js/views/esap-builder.js` (wiring block)

**Interfaces:**
- Consumes: Task 2's module; `setDimensionBinding(spec, graph, phraseOid, slot, dimension, conceptId, render)` — verified 7-arity, `render` optional.
- Produces: `renderSlotEditorHtml(context, spec, ep, phraseOid, slot) -> string`

- [ ] **Step 1: Append the failing checks**

Append to `scripts/verify_esap_authoring.mjs`, before the final `if (failures.length)` block:

```js
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
check("editor names the declared source",
  editor.includes("visit"), editor.slice(0, 200));
check("editor carries the write target",
  editor.includes('data-phrase="SP_TIMEPOINT"') && editor.includes('data-slot="visit"'));

/* A parameter slot draws from biomedical concepts — a different, much larger set. */
const paramEditor = renderSlotEditorHtml(context, spec, ep, "SP_CFB_ENDPOINT", "parameter");
check("parameter editor draws from biomedical concepts",
  (paramEditor.match(/<option /g) || []).length === 183,
  String((paramEditor.match(/<option /g) || []).length));
check("an unresolved current value is offered and selected",
  paramEditor.includes("UNRESOLVED.biomedicalConcept.adas-cog-11-subscore"),
  paramEditor.slice(0, 300));

/* An unknown slot must not crash. */
const noSlot = renderSlotEditorHtml(context, spec, ep, "SP_TIMEPOINT", "nosuchslot");
check("an unknown slot renders an empty editor, not a crash", typeof noSlot === "string");
check("an unknown slot offers no options", !noSlot.includes("<option "));
```

- [ ] **Step 2: Run it to verify the new checks fail**

```bash
node scripts/verify_esap_authoring.mjs; echo "exit=$?"
```
Expected: `exit=1` with `renderSlotEditorHtml is not a function`. Task 2's checks still pass.

- [ ] **Step 3: Add the editor renderer**

Add to `ac-dc-app/js/views/esap-authoring.js`:

```js
/**
 * The picker for one slot.
 *
 * Which concepts are offered is not a decision made here: the slot belongs to a dimension, the
 * dimension's sliceKey declares its `source`, and the graph tags every concept with the source
 * it came from. So the option list is exactly the concepts of that source (spec §7.1).
 *
 * The currently-bound concept is always offered even when it is unresolved, so an
 * `UNRESOLVED.*` binding stays visible and re-selectable rather than silently disappearing.
 *
 * @returns {string} HTML — a select plus its label
 */
export function renderSlotEditorHtml(context, spec, ep, phraseOid, slot) {
  const def = SPEngine.phraseDef(context.ctx, phraseOid);
  const placeholder = def && (def.placeholders || []).find((p) => p.name === slot);
  if (!placeholder) {
    return `<div class="sp-slot-editor sp-slot-unknown">` +
      `<span class="sp-slot-label">${esc(slot)}</span>` +
      `<span class="sp-slot-note">no such slot on ${esc(phraseOid)}</span></div>`;
  }

  /* The dimension this phrase fills, and therefore the source its values come from. */
  const dimension = (def.anchors && def.anchors.produced_concept) || null;
  let source = null;
  for (const t of context.lib.transformations || []) {
    for (const sk of t.sliceKeys || []) {
      if (sk.dimension === dimension) { source = sk.source; break; }
    }
    if (source) break;
  }

  const current = (spec.phraseInstances || [])
    .find((p) => p.phrase === phraseOid)?.bindings?.[slot]?.concept || "";

  const ids = Object.keys(context.graph.concepts)
    .filter((id) => context.graph.concepts[id].source === source);
  if (current && !ids.includes(current)) ids.unshift(current);

  const options = ids.map((id) => {
    const c = context.graph.concepts[id];
    const flag = c && c.anchored === false ? " (unresolved)" : "";
    return `<option value="${esc(id)}"${id === current ? " selected" : ""}>` +
      `${esc((c && c.label) || id)}${flag}</option>`;
  }).join("");

  return `<div class="sp-slot-editor" data-ep-id="${esc(ep.id)}" ` +
    `data-phrase="${esc(phraseOid)}" data-slot="${esc(slot)}" ` +
    `data-dimension="${esc(dimension || "")}">
    <label class="sp-slot-label">${esc(slot)} <span class="sp-slot-source">from ${esc(source || "—")}</span></label>
    <select class="sp-slot-select">${options}</select>
  </div>`;
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_esap_authoring.mjs; echo "exit=$?"
```
Expected: `PASS — the authoring surface renders the authored sentence.` and `exit=0`

- [ ] **Step 5: Wire the click and the change**

In `ac-dc-app/js/views/esap-builder.js`, add to the imports:

```js
import { renderSlotEditorHtml } from './esap-authoring.js';
import { setDimensionBinding } from '../utils/phrase-bindings.js';
```

Then add this block inside `renderEsapBuilder`, alongside the other `container.querySelectorAll(...)` wiring near the end of the function:

```js
  /* Clicking a phrase chip opens its slot editor inline, directly beneath the sentence. */
  container.querySelectorAll('.phrase-chip[data-slot]').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const { epId, phrase, slot } = chip.dataset;
      if (!slot) return;
      const context = getSmartphraseContext(appState);
      if (!context) return;
      const ep = getAllEndpoints(appState.selectedStudy).find(x => x.id === epId);
      const host = chip.closest('.sp-authoring');
      host.querySelector('.sp-slot-editor')?.remove();
      host.insertAdjacentHTML('beforeend',
        renderSlotEditorHtml(context, appState.endpointSpecs[epId] || {}, ep, phrase, slot));
      host.querySelector('.sp-slot-select')?.addEventListener('change', (ev) => {
        const editor = ev.target.closest('.sp-slot-editor');
        setDimensionBinding(
          appState.endpointSpecs[epId], context.graph,
          editor.dataset.phrase, editor.dataset.slot, editor.dataset.dimension,
          ev.target.value,
          editor.dataset.slot === 'population' ? 'name' : 'label');
        renderEsapBuilder(container);
      });
    });
  });
```

The render mode passed here is the Global Constraint: `label` for parameter and visit, `name` for population.

- [ ] **Step 6: Run the ten gates and the syntax check**

```bash
python3 scripts/validate_phrase_shapes.py && python3 scripts/upgrade_phrase_metadata.py --check \
  && node smartphrase/tools/verify.mjs && node scripts/verify_smartphrase_engine.mjs \
  && node scripts/verify_smartphrase_adapter.mjs && node scripts/verify_smartphrase_graph.mjs \
  && node scripts/verify_phrase_slots.mjs && node scripts/verify_phrase_bindings.mjs \
  && node scripts/verify_smartphrase_context.mjs && node scripts/verify_esap_authoring.mjs
echo "gates-exit=$?"
for f in $(find ac-dc-app/js -name '*.js'); do node --check "$f" || echo "SYNTAX FAIL: $f"; done
echo "syntax-ok"
```
Expected: ten PASS lines, `gates-exit=0`, no syntax failures.

- [ ] **Step 7: Commit**

```bash
git add ac-dc-app/js/views/esap-authoring.js scripts/verify_esap_authoring.mjs ac-dc-app/js/views/esap-builder.js
git commit -m "Add the slot editor to the authoring surface

Clicking a phrase opens a picker whose options come from the slot's declared
source, and selecting one writes through setDimensionBinding with the render
mode the document reads best in."
```

---

## Task 4: Seed the transformation into Step 4

Writing the sentence must set `selectedTransformationOid` when the phrase set narrows to exactly one candidate — the "draft transformations in the endpoint and analysis menu" the whole feature is for.

**Files:**
- Modify: `ac-dc-app/js/utils/smartphrase-context.js` (add `applyPhraseChange`)
- Modify: `scripts/verify_smartphrase_context.mjs` (append)
- Modify: `ac-dc-app/js/views/esap-builder.js` (call it after a binding change)

**Interfaces:**
- Consumes: `resolveCandidates`, `deriveSlots`.
- Produces: `applyPhraseChange(spec, lib) -> { candidates, required, pending }` — sets `spec.selectedTransformationOid` when exactly one candidate remains, clears it otherwise, and never touches anything else

- [ ] **Step 1: Append the failing checks**

Append to `scripts/verify_smartphrase_context.mjs`, before the final `if (failures.length)` block:

```js
/* ---------- seeding Step 4 ---------- */

const { applyPhraseChange } = await load("ac-dc-app/js/utils/smartphrase-context.js");

/* One candidate: the transformation is seeded. */
const seeded = { phraseInstances: [
  { phrase: "SP_CFB_ENDPOINT", bindings: {} },
  { phrase: "SP_METHOD_ANCOVA", bindings: {} }
] };
const r1 = applyPhraseChange(seeded, context.lib);
check("one candidate seeds selectedTransformationOid",
  seeded.selectedTransformationOid === "T.CFB_ANCOVA", seeded.selectedTransformationOid);
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

/* Narrowing then widening clears a stale choice rather than leaving it. */
const narrowed = { phraseInstances: [
  { phrase: "SP_CFB_ENDPOINT", bindings: {} },
  { phrase: "SP_METHOD_ANCOVA", bindings: {} }
] };
applyPhraseChange(narrowed, context.lib);
narrowed.phraseInstances = [{ phrase: "SP_CFB_ENDPOINT", bindings: {} }];
applyPhraseChange(narrowed, context.lib);
check("widening clears a stale transformation",
  narrowed.selectedTransformationOid === null, String(narrowed.selectedTransformationOid));

/* It must not disturb anything else on the spec. */
const guarded = { phraseInstances: [{ phrase: "SP_CFB_ENDPOINT", bindings: {} }],
                  dimensionValues: { Parameter: "keep me" }, derivationChain: [1, 2, 3] };
applyPhraseChange(guarded, context.lib);
check("dimensionValues untouched", guarded.dimensionValues.Parameter === "keep me");
check("derivationChain untouched", guarded.derivationChain.length === 3);
```

- [ ] **Step 2: Run it to verify the new checks fail**

```bash
node scripts/verify_smartphrase_context.mjs; echo "exit=$?"
```
Expected: `exit=1` with `applyPhraseChange is not a function`.

- [ ] **Step 3: Add the function**

Add to `ac-dc-app/js/utils/smartphrase-context.js`:

```js
import { resolveCandidates, deriveSlots } from "./phrase-slots.js";

/**
 * Re-derive what the current phrase set means, and seed the analysis when it is unambiguous.
 *
 * The transformation is derived from the phrases, never chosen independently of them, so this
 * runs after every phrase change. A phrase set matching several transformations is a valid
 * state, not an error — narrowing is the downstream selection Step 4 owns (spec §11.1) — so
 * `selectedTransformationOid` is set only when exactly one candidate remains, and cleared when
 * the set widens again so a stale choice cannot linger.
 *
 * Touches nothing else on the spec.
 *
 * @param {object} spec  endpointSpecs[epId]
 * @param {object} lib   adapted library
 * @returns {{candidates: Array, required: Array, pending: Array}}
 */
export function applyPhraseChange(spec, lib) {
  const oids = (spec.phraseInstances || []).map((p) => p.phrase);
  const candidates = resolveCandidates(oids, lib);
  const slots = deriveSlots(candidates, lib);
  spec.selectedTransformationOid = candidates.length === 1 ? candidates[0].conceptId : null;
  return { candidates, required: slots.required, pending: slots.pending };
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_smartphrase_context.mjs; echo "exit=$?"
```
Expected: `PASS — engine context and spec→instance conversion work against the real study.` and `exit=0`

- [ ] **Step 5: Call it after every binding change**

In `ac-dc-app/js/views/esap-builder.js`, add `applyPhraseChange` to the `smartphrase-context.js` import, and call it in the slot-editor change handler added in Task 3 — immediately after `setDimensionBinding` and before `renderEsapBuilder(container)`:

```js
        applyPhraseChange(appState.endpointSpecs[epId], context.lib);
```

- [ ] **Step 6: Run the ten gates and the syntax check**

```bash
python3 scripts/validate_phrase_shapes.py && python3 scripts/upgrade_phrase_metadata.py --check \
  && node smartphrase/tools/verify.mjs && node scripts/verify_smartphrase_engine.mjs \
  && node scripts/verify_smartphrase_adapter.mjs && node scripts/verify_smartphrase_graph.mjs \
  && node scripts/verify_phrase_slots.mjs && node scripts/verify_phrase_bindings.mjs \
  && node scripts/verify_smartphrase_context.mjs && node scripts/verify_esap_authoring.mjs
echo "gates-exit=$?"
for f in $(find ac-dc-app/js -name '*.js'); do node --check "$f" || echo "SYNTAX FAIL: $f"; done
echo "syntax-ok"
```
Expected: ten PASS lines, `gates-exit=0`, no syntax failures.

- [ ] **Step 7: Commit**

```bash
git add ac-dc-app/js/utils/smartphrase-context.js scripts/verify_smartphrase_context.mjs ac-dc-app/js/views/esap-builder.js
git commit -m "Seed the analysis transformation from the authored phrase set

Writing the sentence sets selectedTransformationOid when the phrases narrow to
one transformation, and clears it when they widen. Several candidates is a valid
state, not an error."
```

---

## Task 5: Add and remove phrases

The sentence has to be writable from nothing, and the library decides what may be added.

**Files:**
- Modify: `ac-dc-app/js/views/esap-authoring.js` (add `renderAddPhraseHtml`, `addPhraseToSpec`, `removePhraseFromSpec`)
- Modify: `scripts/verify_esap_authoring.mjs` (append)
- Modify: `ac-dc-app/js/views/esap-builder.js` (wiring)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces:
  - `renderAddPhraseHtml(context, spec, ep) -> string`
  - `addPhraseToSpec(spec, context, phraseOid) -> void`
  - `removePhraseFromSpec(spec, phraseOid) -> void`

- [ ] **Step 1: Append the failing checks**

Append to `scripts/verify_esap_authoring.mjs`, before the final `if (failures.length)` block:

```js
/* ---------- add and remove ---------- */

const { renderAddPhraseHtml, addPhraseToSpec, removePhraseFromSpec } =
  await load("ac-dc-app/js/views/esap-authoring.js");

/* From nothing, only endpoint phrases can start a sentence. */
const blank = {};
const startList = renderAddPhraseHtml(context, blank, ep);
check("a blank spec offers endpoint phrases",
  startList.includes("SP_CFB_ENDPOINT"), startList.slice(0, 300));
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

/* The endpoint phrase is what makes a sentence a sentence — it must not be removable. */
removePhraseFromSpec(building, "SP_CFB_ENDPOINT");
check("the endpoint phrase cannot be removed",
  building.phraseInstances.some((p) => p.phrase === "SP_CFB_ENDPOINT"),
  JSON.stringify(building.phraseInstances.map((p) => p.phrase)));
```

- [ ] **Step 2: Run it to verify the new checks fail**

```bash
node scripts/verify_esap_authoring.mjs; echo "exit=$?"
```
Expected: `exit=1` with `renderAddPhraseHtml is not a function`.

- [ ] **Step 3: Add the three functions**

Add to `ac-dc-app/js/views/esap-authoring.js`:

```js
/**
 * The phrases that may be added next.
 *
 * The library decides, not this file. With nothing written, only endpoint-role phrases can
 * start a sentence. Once an endpoint phrase exists, the offers are the union of what the
 * current candidate transformations declare in `validSmartPhrases`, minus what is already
 * used — so a phrase no candidate can express is never offered.
 */
export function renderAddPhraseHtml(context, spec, ep) {
  const used = new Set((spec.phraseInstances || []).map((p) => p.phrase));
  let offerable;

  if (!used.size) {
    offerable = (context.lib.smartPhrases || [])
      .filter((p) => p.role === "endpoint")
      .map((p) => p.oid);
  } else {
    const candidates = resolveCandidates([...used], context.lib);
    const allowed = new Set();
    for (const c of candidates) {
      const t = (context.lib.transformations || []).find((x) => x.conceptId === c.conceptId);
      for (const oid of (t && t.validSmartPhrases) || []) allowed.add(oid);
    }
    offerable = [...allowed].filter((oid) => !used.has(oid));
  }

  if (!offerable.length) {
    return `<div class="sp-add-list sp-add-empty">Every phrase the analysis allows is present.</div>`;
  }

  const rows = offerable.map((oid) => {
    const def = SPEngine.phraseDef(context.ctx, oid);
    if (!def) return "";
    return `<button class="sp-add-option" data-add-oid="${esc(oid)}" data-ep-id="${esc(ep.id)}">` +
      `<span class="sp-add-role" data-role="${esc(def.role)}">${esc(def.role)}</span> ` +
      `<span class="sp-add-template">${esc(def.phrase_template)}</span></button>`;
  }).join("");

  return `<div class="sp-add-list">${rows}</div>`;
}

/**
 * Add a phrase to the spec, with its method pre-bound when the library names one.
 *
 * A method phrase's `anchors.uses_method` names the method it stands for, so the binding is
 * derivable rather than asked for. Concept slots stay empty — those are the author's to fill.
 *
 * Idempotent: adding a phrase already present does nothing.
 */
export function addPhraseToSpec(spec, context, phraseOid) {
  if (!Array.isArray(spec.phraseInstances)) spec.phraseInstances = [];
  if (spec.phraseInstances.some((p) => p.phrase === phraseOid)) return;

  const def = SPEngine.phraseDef(context.ctx, phraseOid);
  const bindings = {};
  const usesMethod = def && def.anchors && def.anchors.uses_method;
  if (usesMethod) {
    const slot = (def.placeholders || []).find((p) => p.kind === "method_ref");
    if (slot) bindings[slot.name] = { method: usesMethod };
  }
  spec.phraseInstances.push({ phrase: phraseOid, bindings });
}

/**
 * Remove a phrase.
 *
 * The endpoint phrase is what makes the sentence an analysis at all — removing it would leave
 * a spec that resolves to nothing — so it is refused. Everything else is optional.
 */
export function removePhraseFromSpec(spec, phraseOid) {
  if (!Array.isArray(spec.phraseInstances)) return;
  const keep = spec.phraseInstances.filter((p) => p.phrase !== phraseOid);
  const removedEndpoint = spec.phraseInstances.length !== keep.length &&
    !keep.some((p) => /_ENDPOINT$/.test(p.phrase));
  if (removedEndpoint && /_ENDPOINT$/.test(phraseOid)) return;
  spec.phraseInstances = keep;
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_esap_authoring.mjs; echo "exit=$?"
```
Expected: `PASS — the authoring surface renders the authored sentence.` and `exit=0`

- [ ] **Step 5: Wire the add and start buttons**

In `ac-dc-app/js/views/esap-builder.js`, extend the `esap-authoring.js` import with `renderAddPhraseHtml, addPhraseToSpec, removePhraseFromSpec`, then add to the wiring block:

```js
  /* "+ add phrase" and "Write the analysis" both open the same offer list. */
  container.querySelectorAll('[data-add-phrase], [data-start-authoring]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const epId = btn.dataset.epId;
      const context = getSmartphraseContext(appState);
      if (!context) return;
      const ep = getAllEndpoints(appState.selectedStudy).find(x => x.id === epId);
      if (!appState.endpointSpecs[epId]) appState.endpointSpecs[epId] = {};
      const host = btn.closest('.sp-authoring');
      host.querySelector('.sp-add-list')?.remove();
      host.insertAdjacentHTML('beforeend',
        renderAddPhraseHtml(context, appState.endpointSpecs[epId], ep));
      host.querySelectorAll('.sp-add-option').forEach(opt => {
        opt.addEventListener('click', () => {
          addPhraseToSpec(appState.endpointSpecs[epId], context, opt.dataset.addOid);
          applyPhraseChange(appState.endpointSpecs[epId], context.lib);
          renderEsapBuilder(container);
        });
      });
    });
  });
```

- [ ] **Step 6: Run the ten gates and the syntax check**

```bash
python3 scripts/validate_phrase_shapes.py && python3 scripts/upgrade_phrase_metadata.py --check \
  && node smartphrase/tools/verify.mjs && node scripts/verify_smartphrase_engine.mjs \
  && node scripts/verify_smartphrase_adapter.mjs && node scripts/verify_smartphrase_graph.mjs \
  && node scripts/verify_phrase_slots.mjs && node scripts/verify_phrase_bindings.mjs \
  && node scripts/verify_smartphrase_context.mjs && node scripts/verify_esap_authoring.mjs
echo "gates-exit=$?"
for f in $(find ac-dc-app/js -name '*.js'); do node --check "$f" || echo "SYNTAX FAIL: $f"; done
echo "syntax-ok"
```
Expected: ten PASS lines, `gates-exit=0`, no syntax failures.

- [ ] **Step 7: Confirm nothing else regressed**

```bash
git diff --name-only <BASE> HEAD
```
where `<BASE>` is the commit this plan started from. Expected: only `ac-dc-app/js/utils/smartphrase-context.js`, `ac-dc-app/js/views/esap-authoring.js`, `ac-dc-app/js/views/esap-builder.js`, `scripts/verify_smartphrase_context.mjs`, `scripts/verify_esap_authoring.mjs`.

- [ ] **Step 8: Commit**

```bash
git add ac-dc-app/js/views/esap-authoring.js scripts/verify_esap_authoring.mjs ac-dc-app/js/views/esap-builder.js
git commit -m "Add and remove phrases from the authoring surface

The library decides what may be added: endpoint phrases start a sentence, and
after that the offers are what the candidate transformations allow. Method
phrases bind their method from the library's anchors."
```

---

## Definition of done

All ten gates pass. Step 7's §4.1.2 shows the authored sentence for a configured endpoint, offers a prompt for an unauthored one, opens a slot picker on clicking a phrase, seeds `selectedTransformationOid` when the phrases narrow to one, and lets phrases be added and removed within what the library allows.

Steps 3, 4, 5, 6 and 8 behave as before. The three P3 utility modules and the engine are unmodified.

## Manual verification the controller performs

A subagent cannot drive a browser. After Task 5, the controller runs `python3 ac-dc-app/serve.py`, opens Step 7 for the CDISC pilot with END1 selected, and confirms: the sentence renders with coloured chips; clicking a chip opens a picker; changing the visit re-renders the sentence and updates Step 3's `dimensionValues`; "+ add phrase" offers only library-allowed phrases; and the console is free of new errors.

## Testing

| Level | What |
|---|---|
| Context | library, graph and ctx build from app-shaped inputs; spec→instance on the real Scenario 1; `prepareSpec` idempotent |
| Sentence | one chip per phrase, data attributes present, render mode is `label` (no "Week 24 (Week 24)"), frame text outside chips, labels escaped |
| Slot editor | 12 visit options, 183 parameter options, current value selected, unresolved value offered, unknown slot renders empty |
| Seeding | one candidate seeds, several leave it unset, widening clears a stale choice, nothing else on the spec is touched |
| Add/remove | endpoint phrases start a sentence, offers narrow to candidate-allowed, no duplicates, endpoint phrase not removable |
| Regression | the eight pre-existing gates at every commit; `node --check` on every app JS file |

## Risks

1. **`appState.methodsCache` may be empty when the context is first built.** `getSmartphraseContext` reads it, and the app loads methods lazily via `loadMethod`. If it is empty, method references fail to resolve and a method phrase renders `⟨method?⟩`. The context cache is keyed on study index, so it will not self-heal. If the manual verification shows this, the fix is to key the cache on method count as well, or to load methods eagerly — flag it rather than guessing.
2. **The chip's slot comes from `rp.bindings[0].placeholder`**, which is the first *resolved* binding. A phrase whose only binding failed to resolve reports no bindings, so the chip gets an empty `data-slot` and is not clickable. That is the correct degradation, but it means an unresolved fixture cannot be repaired by clicking it — the author would use "+ add phrase" or Step 3. Worth confirming in manual verification.
3. **`removePhraseFromSpec`'s endpoint guard keys on the `_ENDPOINT` oid suffix**, which is a naming convention rather than library metadata. Every endpoint-role phrase in v06 follows it, but a future phrase with `role: "endpoint"` and a different oid would be removable. Deriving from `role` instead would need the library passed in; noted rather than done.
