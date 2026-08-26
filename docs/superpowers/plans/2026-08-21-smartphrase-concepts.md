# SmartPhrase Concept Layer Implementation Plan (P3-concepts)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything the Step 7 authoring surface needs — a concept graph derived from USDM, slot derivation from candidate transformations, and a single binding writer — proven against both real studies, with no UI change.

**Architecture:** The library declares where every value comes from (`sliceKeys[].source`), so the graph builder reads that declaration and populates only the sources the library actually names. Concepts are keyed by USDM identifier and carry both `kind` and `conceptCategory`, which lets v06's two vocabularies resolve against the engine's `||` match. Slot derivation and binding writes are pure functions in their own modules. Nothing renders; the deliverable is a proven data layer plus five Node harnesses.

**Tech Stack:** Vanilla ES modules, no bundler, no framework. Node for verification scripts, no npm dependencies (the repo's root `package.json` declares `"type": "module"`). No test framework — verification is plain scripts, matching `scripts/verify_smartphrase_adapter.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-20-esap-smartphrase-authoring-design.md` — §7 (all subsections) and §11.1–11.3.

## Global Constraints

- **The library dictates the graph's contents.** Never hardcode which dimensions or sources exist; read them from `sliceKeys[].source`. Adding a transformation with a new source must be the only thing that widens the graph.
- **Concepts are keyed by USDM identifier**, never by label. A binding must survive a label change or a study re-parse.
- **Every concept carries both `kind` and `conceptCategory`** where the library has a category for it. The engine matches `bc.c.conceptCategory === sk.dimension || bc.c.kind === sk.dimension`; carrying both satisfies v06's concrete vocabulary (`Parameter`, `AnalysisVisit`, `Population`) and its category vocabulary (`ParameterDimension`, `VisitDimension`) at once.
- **No trace tier.** Do not build `traceTemplates`, do not populate a concept `data{}` map, do not reference `PARAMCD`. Spec §7.6 defers this; `buildTrace` is the only engine function that reads either.
- **The adapter must not mutate its input**, and neither must the graph builder mutate the parsed study.
- **Never `git push`.** Commit locally, using each task's exact message.
- **Do not modify** `lib/transformations/ACDC_Transformation_Library_v06.json`, anything under `smartphrase/`, `ac-dc-app/js/utils/smartphrase-engine.js`, `ac-dc-app/js/utils/smartphrase-lib-adapter.js`, or anything under `ac-dc-app/js/views/`.
- All existing gates must still pass at every commit:
  ```bash
  python3 scripts/validate_phrase_shapes.py && python3 scripts/upgrade_phrase_metadata.py --check \
    && node smartphrase/tools/verify.mjs && node scripts/verify_smartphrase_engine.mjs \
    && node scripts/verify_smartphrase_adapter.mjs
  ```

---

## Scope note

This plan covers **P3-concepts only**. The Step 7 authoring surface (spec §11, the `esap-authoring.js` / `esap-transformation-card.js` views) is a separate plan that follows.

The split is deliberate: everything here is pure data and pure functions, verifiable by Node harnesses against the two real studies. The UI plan consumes these three modules through interfaces this plan fixes. Splitting keeps each task reviewable and means the UI work starts from a proven layer rather than co-developing one.

## Reference data — verified 2026-08-21

Both studies in `ac-dc-app/data/usdm/studies.json`, parsed through `parseUSDM`:

| | `CDISC_Pilot_Study_usdm.json 07-50-56-737.json` | `NCT01797120-latest.json` |
|---|---|---|
| name | CDISC PILOT - LZZT - USDM aligned | Breast Cancer Study PrE0102 |
| `biomedicalConcepts` | 182 | 84 |
| `encounters` | 12 | 17 |
| `populations` | 1 | 1 |
| `analysisPopulations` | 1 | **0** |

The breast-cancer study having **zero** analysis populations is the edge case that matters: population concepts must fall back to the study-design population rather than producing an empty picker.

Label uniqueness, which decides whether `resolveLabelToConceptId` can ever resolve: the pilot's
12 encounter labels are all distinct, but its 182 biomedical concepts carry only **163 distinct
labels**. Visits always resolve by label; parameters may not.

Declared sources across the whole v06 library — there are exactly three:

| `sliceKeys[].dimension` | `sliceKeys[].source` |
|---|---|
| `Parameter` | `biomedicalConcept` |
| `AnalysisVisit` | `visit` |
| `Population` | `population` |

## File Structure

| File | Responsibility |
|---|---|
| `ac-dc-app/js/utils/smartphrase-graph.js` (new) | Build `ctx.graph` from a parsed USDM study. Concepts, method grounding, study block. No trace. |
| `scripts/verify_smartphrase_graph.mjs` (new) | Graph builder against both real studies. |
| `ac-dc-app/js/utils/phrase-slots.js` (new) | Pure: phrase oids → candidate transformations → required and pending slots. |
| `scripts/verify_phrase_slots.mjs` (new) | Slot derivation, including the multi-candidate case. |
| `ac-dc-app/js/utils/phrase-bindings.js` (new) | The single writer for bindings, plus the load-time backfill. |
| `scripts/verify_phrase_bindings.mjs` (new) | Writer and backfill against the three scenario files. |

---

## Task 1: Concept graph builder

The graph's contents are dictated by the library. This task reads `sliceKeys[].source` and populates only the sources named there.

**Files:**
- Create: `ac-dc-app/js/utils/smartphrase-graph.js`
- Create: `scripts/verify_smartphrase_graph.mjs`

**Interfaces:**
- Consumes: `adaptV06Library(v06)` from `ac-dc-app/js/utils/smartphrase-lib-adapter.js` (returns a library whose `transformations[]` each carry `sliceKeys`); `parseUSDM(rawUsdm)` from `ac-dc-app/js/utils/usdm-parser.js` (returns a study with `biomedicalConcepts[{id,name,label}]`, `encounters[{id,name,label,description}]`, `populations[{id,name,label,description}]`, `analysisPopulations[{id,name,label,description,text}]`).
- Produces:
  - `collectDeclaredSources(lib) -> Set<string>`
  - `buildConceptGraph(study, lib) -> graph` where `graph = { prefixes, study, concepts, methodGrounding, instances, traceTemplates }`, `traceTemplates` always `{}`, and each `concepts[id] = { kind, conceptCategory?, label, name, iri, anchored: true, source }`
  - Concept id scheme: `P.<bcId>`, `V.<encounterId>`, `POP.<populationId>`

- [ ] **Step 1: Write the failing harness**

Create `scripts/verify_smartphrase_graph.mjs`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/kwl/repos/Github/CDISC/analysis-concepts
node scripts/verify_smartphrase_graph.mjs; echo "exit=$?"
```
Expected: `ERR_MODULE_NOT_FOUND` for `smartphrase-graph.js`, `exit=1`.

- [ ] **Step 3: Write the graph builder**

Create `ac-dc-app/js/utils/smartphrase-graph.js`:

```js
/**
 * Builds `ctx.graph` for the ported smartphrase engine from a parsed USDM study.
 *
 * The engine resolves a phrase binding by looking up `ctx.graph.concepts[id]`. What may be
 * bound is not a decision this module makes: each transformation's `sliceKeys[].source`
 * declares where that dimension's values come from, and this module populates exactly those
 * sources. Adding a transformation with a new source is the only thing that should widen the
 * graph — see spec §7.1.
 *
 * Concepts are keyed by USDM identifier, never by label, so a binding survives a rename or a
 * re-parse of the study (spec §7.3).
 *
 * Each concept carries `kind` AND `conceptCategory`. The engine matches a sliceKey with
 *   bc.c.conceptCategory === sk.dimension || bc.c.kind === sk.dimension
 * — an OR — so carrying both satisfies v06's concrete vocabulary (Parameter, AnalysisVisit,
 * Population) and its category vocabulary (ParameterDimension, VisitDimension) at once. No
 * mapping layer is needed.
 *
 * NOT built here: the four-tier data trace. `traceTemplates` is always {} and no concept
 * carries a `data` map. `buildTrace` is the only engine function that reads either, and the
 * trace is deferred pending the PARAMCD decision — spec §7.6.
 */

const PREFIXES = {
  usdm: "https://ddf.cdisc.org/usdm/v4/",
  acdc: "https://w3id.org/cdisc/ac-dc/"
};

/**
 * Every `source` any transformation declares on a sliceKey.
 * @param {object} lib  adapted library (transformations[] carry sliceKeys)
 * @returns {Set<string>}
 */
export function collectDeclaredSources(lib) {
  const out = new Set();
  for (const t of lib.transformations || []) {
    for (const sk of t.sliceKeys || []) {
      if (sk.source) out.add(sk.source);
    }
  }
  return out;
}

/* One builder per declared source. Keyed by the source name the library uses. */
const BUILDERS = {
  biomedicalConcept(study, concepts) {
    for (const bc of study.biomedicalConcepts || []) {
      concepts["P." + bc.id] = {
        kind: "Parameter",
        conceptCategory: "ParameterDimension",
        label: bc.label || bc.name,
        name: bc.name || bc.label,
        iri: "usdm:BiomedicalConcept/" + bc.id,
        anchored: true,
        source: "biomedicalConcept"
      };
    }
  },

  visit(study, concepts) {
    for (const enc of study.encounters || []) {
      concepts["V." + enc.id] = {
        kind: "AnalysisVisit",
        conceptCategory: "VisitDimension",
        label: enc.label || enc.name,
        name: enc.description || enc.label || enc.name,
        iri: "usdm:Encounter/" + enc.id,
        anchored: true,
        source: "visit"
      };
    }
  },

  /* Analysis populations first, then the study-design population. A study may declare no
     analysis populations at all (NCT01797120 declares zero), so the design population is not
     a fallback of last resort — it is a legitimate member of the set. */
  population(study, concepts) {
    const add = (p, isAnalysis) => {
      concepts["POP." + p.id] = {
        kind: "Population",
        label: p.label || p.name,
        name: p.text || p.description || p.label || p.name,
        iri: (isAnalysis ? "usdm:AnalysisPopulation/" : "usdm:StudyDesignPopulation/") + p.id,
        anchored: true,
        source: "population"
      };
    };
    for (const p of study.analysisPopulations || []) add(p, true);
    for (const p of study.populations || []) add(p, false);
  }
};

/**
 * Build the graph. Does not mutate `study`.
 *
 * @param {object} study  parsed study from parseUSDM()
 * @param {object} lib    adapted library from adaptV06Library()
 * @returns {object} ctx.graph
 */
export function buildConceptGraph(study, lib) {
  const concepts = {};
  for (const source of collectDeclaredSources(lib)) {
    const build = BUILDERS[source];
    if (build) build(study, concepts);
    /* An undeclared builder is not an error here: the library may name a source this phase
       does not yet populate. The slot for it simply has no options, which surfaces in the UI
       as an unbindable slot rather than as a crash. */
  }

  return {
    prefixes: { ...PREFIXES },
    study: { studyId: study.name || "", title: study.description || study.name || "" },
    concepts,
    methodGrounding: {},
    instances: [],
    traceTemplates: {}
  };
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_smartphrase_graph.mjs; echo "exit=$?"
```
Expected: `PASS — concept graph built from declared sources for both studies.` and `exit=0`

- [ ] **Step 5: Confirm the existing gates are untouched**

```bash
python3 scripts/validate_phrase_shapes.py && python3 scripts/upgrade_phrase_metadata.py --check \
  && node smartphrase/tools/verify.mjs && node scripts/verify_smartphrase_engine.mjs \
  && node scripts/verify_smartphrase_adapter.mjs
echo "gates-exit=$?"
```
Expected: five PASS lines, `gates-exit=0`.

- [ ] **Step 6: Commit**

```bash
git add ac-dc-app/js/utils/smartphrase-graph.js scripts/verify_smartphrase_graph.mjs
git commit -m "Build the smartphrase concept graph from the library's declared sources

Concepts keyed by USDM id, carrying both kind and conceptCategory so v06's
concrete and category sliceKey vocabularies both resolve. No trace tier."
```

---

## Task 2: Method grounding, and a real end-to-end resolution

The graph is only useful if the engine resolves a real instance through it. This task supplies method grounding and proves the whole chain — study → graph → adapter → engine — against the pilot study.

**Files:**
- Modify: `ac-dc-app/js/utils/smartphrase-graph.js` (add `buildMethodGrounding`, populate `methodGrounding`)
- Modify: `scripts/verify_smartphrase_graph.mjs` (append the end-to-end section)

**Interfaces:**
- Consumes: Task 1's `buildConceptGraph`; `adaptV06Method(m)` from the lib adapter; the engine's `ctxOf(lib, graph, i18n, proposed)`, `resolveInstance(ctx, instance, lang)`, `constructModelView(ctx, instance)`.
- Produces:
  - `buildMethodGrounding(methods) -> { [oid]: { label, name, iri } }`
  - `buildConceptGraph(study, lib, methods = {})` — third parameter added; `methodGrounding` populated from it

- [ ] **Step 1: Append the failing end-to-end checks**

Append to `scripts/verify_smartphrase_graph.mjs`, immediately before the final `if (failures.length)` block:

```js
/* ---------- end-to-end: study -> graph -> adapter -> engine ---------- */

const E = (await load("ac-dc-app/js/utils/smartphrase-engine.js")).default;

/* The library adapter needs the method JSON or method references cannot resolve. */
const methodsDir = path.join(root, "lib/methods/analyses");
const methods = {};
for (const f of fs.readdirSync(methodsDir)) {
  if (!f.endsWith(".json")) continue;
  const m = JSON.parse(fs.readFileSync(path.join(methodsDir, f), "utf8"));
  methods[m.oid] = m;
}
check("M.ANCOVA loaded", !!methods["M.ANCOVA"]);

const libWithMethods = adaptV06Library(v06, methods);
const graph = buildConceptGraph(pilot, libWithMethods, methods);

check("methodGrounding populated", Object.keys(graph.methodGrounding).length > 0,
  String(Object.keys(graph.methodGrounding).length));
check("M.ANCOVA grounded", !!graph.methodGrounding["M.ANCOVA"]);

/* Bind against real study objects: ADAS-Cog BC, Week 24 encounter, the analysis population. */
const paramId = Object.keys(graph.concepts).find((k) =>
  graph.concepts[k].kind === "Parameter" && /ADAS/i.test(graph.concepts[k].name || ""));
const visitId = Object.keys(graph.concepts).find((k) =>
  graph.concepts[k].kind === "AnalysisVisit" && graph.concepts[k].label === "Week 24");
const popId = Object.keys(graph.concepts).find((k) => graph.concepts[k].kind === "Population");
check("found an ADAS parameter concept", !!paramId, paramId);
check("found the Week 24 visit concept", !!visitId, visitId);
check("found a population concept", !!popId, popId);

const ctx = E.ctxOf(libWithMethods, graph, null, null);
const instance = {
  id: "AC.VERIFY", template: "T.CFB_ANCOVA", sentenceRole: "primary",
  phrases: [
    { phrase: "SP_CFB_ENDPOINT", bindings: { parameter: { concept: paramId } } },
    { phrase: "SP_TIMEPOINT", bindings: { visit: { concept: visitId } } },
    { phrase: "SP_POPULATION", bindings: { population: { concept: popId } } },
    { phrase: "SP_METHOD_ANCOVA", bindings: { method: { method: "M.ANCOVA" } } }
  ]
};

const res = E.resolveInstance(ctx, instance, "en");
check("instance resolves with no errors", res.errors.length === 0, JSON.stringify(res.errors));
check("sentence mentions change from baseline", /change from baseline/i.test(res.sentence), res.sentence);
check("sentence renders the method, not a raw token",
  res.sentence.includes("{method}") === false && /covariance/i.test(res.sentence), res.sentence);

const view = E.constructModelView(ctx, instance);
check("model view has no errors", !("errors" in view), JSON.stringify(view.errors));
check("all three sliceKeys resolve",
  view.sliceKeys.length === 3 && view.sliceKeys.every((sk) => sk.value !== null),
  JSON.stringify(view.sliceKeys.map((sk) => [sk.dimension, sk.value && sk.value.label])));
```

- [ ] **Step 2: Run it to verify the new checks fail**

```bash
node scripts/verify_smartphrase_graph.mjs; echo "exit=$?"
```
Expected: `exit=1`, with `methodGrounding populated` and `M.ANCOVA grounded` among the failures. Task 1's checks still pass.

- [ ] **Step 3: Add method grounding**

In `ac-dc-app/js/utils/smartphrase-graph.js`, add this export after `collectDeclaredSources`:

```js
/**
 * Ground the methods the engine may render. The engine reads `label`, `name` and `formula`
 * off a method; `name` is lower-cased for prose ("analysis of covariance"), so the display
 * name comes from the method's own `name` and the short form from `label` where present.
 *
 * @param {object} methods  { [oid]: method JSON, schema 0.8.0 }
 * @returns {object} { [oid]: { label, name, iri } }
 */
export function buildMethodGrounding(methods) {
  const out = {};
  for (const [oid, m] of Object.entries(methods || {})) {
    out[oid] = {
      label: m.label || m.name,
      name: m.name,
      iri: "acdc:method/" + oid
    };
  }
  return out;
}
```

Then change the signature and the returned `methodGrounding`:

```js
export function buildConceptGraph(study, lib, methods = {}) {
```

```js
    methodGrounding: buildMethodGrounding(methods),
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_smartphrase_graph.mjs; echo "exit=$?"
```
Expected: `PASS — concept graph built from declared sources for both studies.` and `exit=0`

- [ ] **Step 5: Commit**

```bash
git add ac-dc-app/js/utils/smartphrase-graph.js scripts/verify_smartphrase_graph.mjs
git commit -m "Ground methods in the concept graph and prove end-to-end resolution

study -> graph -> adapter -> engine resolves a real ADAS-Cog/Week 24/ANCOVA
instance against the pilot study with all three sliceKeys filled."
```

---

## Task 3: Unresolved fixtures

A fixture is unresolved when its declared source has not been satisfied — Scenario 1's parameter is the typed string `"Adas-Cog(11) Subscore"` with `linkedBCIds: []`, against a sliceKey declaring `source: biomedicalConcept`. Spec §7.4 requires this be surfaced, not blocked.

**Files:**
- Modify: `ac-dc-app/js/utils/smartphrase-graph.js` (add `addUnresolvedConcept`)
- Modify: `scripts/verify_smartphrase_graph.mjs` (append the unresolved section)

**Interfaces:**
- Consumes: Task 1's concept shape.
- Produces: `addUnresolvedConcept(graph, source, label) -> conceptId` — mutates the graph it is given (which the caller owns), returns the synthesised id `UNRESOLVED.<source>.<slug>`; the concept carries `anchored: false`.

- [ ] **Step 1: Append the failing checks**

Append to `scripts/verify_smartphrase_graph.mjs`, before the final `if (failures.length)` block:

```js
/* ---------- unresolved fixtures (spec 7.4) ---------- */

const { addUnresolvedConcept } = await load("ac-dc-app/js/utils/smartphrase-graph.js");

const g2 = buildConceptGraph(pilot, libWithMethods, methods);
const unresolvedId = addUnresolvedConcept(g2, "biomedicalConcept", "Adas-Cog(11) Subscore");

check("unresolved id is stable and namespaced",
  unresolvedId === "UNRESOLVED.biomedicalConcept.adas-cog-11-subscore", unresolvedId);
const u = g2.concepts[unresolvedId];
check("unresolved concept exists", !!u);
check("unresolved concept is flagged", u?.anchored === false, JSON.stringify(u));
check("unresolved concept keeps the typed label", u?.label === "Adas-Cog(11) Subscore", u?.label);
check("unresolved concept still carries the matching vocabulary",
  u?.kind === "Parameter" && u?.conceptCategory === "ParameterDimension", JSON.stringify(u));
check("unresolved concept has no iri", u?.iri === undefined, u?.iri);

check("calling twice returns the same id",
  addUnresolvedConcept(g2, "biomedicalConcept", "Adas-Cog(11) Subscore") === unresolvedId);

/* An unresolved fixture must still render and still fill its sliceKey — it is incomplete,
   not invalid (spec 7.4). */
const ctx2 = E.ctxOf(libWithMethods, g2, null, null);
const inst2 = {
  id: "AC.UNRESOLVED", template: "T.CFB_ANCOVA", sentenceRole: "primary",
  phrases: [
    { phrase: "SP_CFB_ENDPOINT", bindings: { parameter: { concept: unresolvedId } } },
    { phrase: "SP_TIMEPOINT", bindings: { visit: { concept: visitId } } },
    { phrase: "SP_POPULATION", bindings: { population: { concept: popId } } },
    { phrase: "SP_METHOD_ANCOVA", bindings: { method: { method: "M.ANCOVA" } } }
  ]
};
const res2 = E.resolveInstance(ctx2, inst2, "en");
check("unresolved fixture still resolves", res2.errors.length === 0, JSON.stringify(res2.errors));
check("unresolved label appears in the sentence",
  res2.sentence.includes("Adas-Cog(11) Subscore"), res2.sentence);
const view2 = E.constructModelView(ctx2, inst2);
check("unresolved fixture still fills its sliceKey",
  view2.sliceKeys.every((sk) => sk.value !== null),
  JSON.stringify(view2.sliceKeys.map((sk) => [sk.dimension, sk.value && sk.value.label])));
```

- [ ] **Step 2: Run it to verify the new checks fail**

```bash
node scripts/verify_smartphrase_graph.mjs; echo "exit=$?"
```
Expected: `exit=1`, failing on `unresolved id is stable and namespaced` (the export does not exist yet, so the import itself fails first — that is an acceptable RED; the message will be `ERR_MODULE_NOT_FOUND`-adjacent or `addUnresolvedConcept is not a function`).

- [ ] **Step 3: Implement `addUnresolvedConcept`**

Add to `ac-dc-app/js/utils/smartphrase-graph.js`:

```js
/* The vocabulary each source contributes, reused when synthesising an unresolved concept
   so it matches sliceKeys exactly as an anchored one would. */
const SOURCE_VOCABULARY = {
  biomedicalConcept: { kind: "Parameter", conceptCategory: "ParameterDimension" },
  visit: { kind: "AnalysisVisit", conceptCategory: "VisitDimension" },
  population: { kind: "Population" }
};

function slug(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Add a concept for a fixture whose declared source has not been satisfied — a typed label
 * with no USDM object behind it (spec §7.4). It matches sliceKeys exactly as an anchored
 * concept does, so the sentence renders and the cube still slices; `anchored: false` is what
 * lets the UI say the fixture is unresolved.
 *
 * Idempotent: the same source and label always yield the same id.
 *
 * @param {object} graph   graph to add to (mutated — the caller owns it)
 * @param {string} source  a declared sliceKey source
 * @param {string} label   the typed label
 * @returns {string} the concept id
 */
export function addUnresolvedConcept(graph, source, label) {
  const id = `UNRESOLVED.${source}.${slug(label)}`;
  if (!graph.concepts[id]) {
    graph.concepts[id] = {
      ...(SOURCE_VOCABULARY[source] || {}),
      label: label,
      name: label,
      anchored: false,
      source: source
    };
  }
  return id;
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_smartphrase_graph.mjs; echo "exit=$?"
```
Expected: `PASS — concept graph built from declared sources for both studies.` and `exit=0`

- [ ] **Step 5: Commit**

```bash
git add ac-dc-app/js/utils/smartphrase-graph.js scripts/verify_smartphrase_graph.mjs
git commit -m "Surface unresolved fixtures as flagged concepts

A typed label with no USDM object behind it becomes an anchored:false concept
that still matches sliceKeys, so the sentence renders and the cube slices while
the gap stays visible."
```

---

## Task 4: Slot derivation from candidate transformations

The sentence narrows a candidate set; the candidates declare which fixture slots exist. Multiple candidates is a valid state (spec §11.1).

**Files:**
- Create: `ac-dc-app/js/utils/phrase-slots.js`
- Create: `scripts/verify_phrase_slots.mjs`

**Interfaces:**
- Consumes: an adapted library (`transformations[]` with `conceptId`, `validSmartPhrases`, `sliceKeys`, `transformationType`).
- Produces:
  - `resolveCandidates(phraseOids, lib) -> [{ conceptId, transformationType, coverage }]` sorted by coverage descending then conceptId ascending
  - `deriveSlots(candidates, lib) -> { required: [{dimension, source}], pending: [{dimension, source, neededBy: [conceptId]}] }` — `required` is the intersection across candidates, `pending` the rest

- [ ] **Step 1: Write the failing harness**

Create `scripts/verify_phrase_slots.mjs`:

```js
/*
 * Proves slot derivation: a sentence narrows a candidate set, the candidates declare the
 * slots, and multiple candidates is a valid state (spec §11.1).
 *
 *   node scripts/verify_phrase_slots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { adaptV06Library } = await load("ac-dc-app/js/utils/smartphrase-lib-adapter.js");
const { resolveCandidates, deriveSlots } = await load("ac-dc-app/js/utils/phrase-slots.js");

const v06 = JSON.parse(fs.readFileSync(
  path.join(root, "lib/transformations/ACDC_Transformation_Library_v06.json"), "utf8"));
const lib = adaptV06Library(v06);

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : "")); };
const ids = (cands) => cands.map((c) => c.conceptId).sort();

/* --- endpoint phrase alone: three candidates, not an error --- */
const cfbOnly = resolveCandidates(["SP_CFB_ENDPOINT"], lib);
check("CFB alone yields 3 candidates", cfbOnly.length === 3, JSON.stringify(ids(cfbOnly)));
check("CFB candidates are the expected three",
  JSON.stringify(ids(cfbOnly)) ===
    JSON.stringify(["T.CFB_ANCOVA", "T.CFB_MMRM_Primary", "T.ChangeFromBaseline"]),
  JSON.stringify(ids(cfbOnly)));

/* --- adding the method phrase narrows to one --- */
const ancova = resolveCandidates(["SP_CFB_ENDPOINT", "SP_METHOD_ANCOVA"], lib);
check("CFB + ANCOVA narrows to T.CFB_ANCOVA",
  ancova.length === 1 && ancova[0].conceptId === "T.CFB_ANCOVA", JSON.stringify(ids(ancova)));

const mmrm = resolveCandidates(["SP_CFB_ENDPOINT", "SP_METHOD_MMRM"], lib);
check("CFB + MMRM narrows to T.CFB_MMRM_Primary",
  mmrm.length === 1 && mmrm[0].conceptId === "T.CFB_MMRM_Primary", JSON.stringify(ids(mmrm)));

/* --- slots come from the resolved transformation --- */
const ancovaSlots = deriveSlots(ancova, lib);
check("ANCOVA requires 3 slots", ancovaSlots.required.length === 3,
  JSON.stringify(ancovaSlots.required));
check("ANCOVA requires a visit slot",
  ancovaSlots.required.some((s) => s.dimension === "AnalysisVisit" && s.source === "visit"),
  JSON.stringify(ancovaSlots.required));
check("ANCOVA has no pending slots", ancovaSlots.pending.length === 0,
  JSON.stringify(ancovaSlots.pending));

const mmrmSlots = deriveSlots(mmrm, lib);
check("MMRM requires 2 slots", mmrmSlots.required.length === 2, JSON.stringify(mmrmSlots.required));
check("MMRM requires NO visit slot",
  !mmrmSlots.required.some((s) => s.dimension === "AnalysisVisit"),
  JSON.stringify(mmrmSlots.required));

/* --- multiple candidates: required is the intersection, the rest are pending --- */
const both = resolveCandidates(["SP_CFB_ENDPOINT", "SP_PARAMETER"], lib)
  .filter((c) => c.transformationType === "analysis");
const bothSlots = deriveSlots(both, lib);
check("intersection across ANCOVA+MMRM is Parameter and Population",
  JSON.stringify(bothSlots.required.map((s) => s.dimension).sort()) ===
    JSON.stringify(["Parameter", "Population"]),
  JSON.stringify(bothSlots.required));
check("AnalysisVisit is pending, not required",
  bothSlots.pending.some((s) => s.dimension === "AnalysisVisit"),
  JSON.stringify(bothSlots.pending));
check("pending slot names which candidate needs it",
  bothSlots.pending.find((s) => s.dimension === "AnalysisVisit")?.neededBy
    .includes("T.CFB_ANCOVA"),
  JSON.stringify(bothSlots.pending));

/* --- a transformation with no sliceKeys yields no slots, not a crash --- */
const noSlots = deriveSlots(
  [{ conceptId: "T.BaselineSelection", transformationType: "derivation", coverage: 1 }], lib);
check("no sliceKeys -> no required slots", noSlots.required.length === 0);
check("no sliceKeys -> no pending slots", noSlots.pending.length === 0);

/* --- empty input is not a crash --- */
check("no phrases -> no candidates", resolveCandidates([], lib).length === 0);
check("no candidates -> no slots", deriveSlots([], lib).required.length === 0);

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — slot derivation follows the resolved transformations.");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node scripts/verify_phrase_slots.mjs; echo "exit=$?"
```
Expected: `ERR_MODULE_NOT_FOUND` for `phrase-slots.js`, `exit=1`.

- [ ] **Step 3: Write the module**

Create `ac-dc-app/js/utils/phrase-slots.js`:

```js
/**
 * Derives, from a set of composed phrase oids, which transformations the sentence could mean
 * and which fixture slots those transformations declare.
 *
 * The sentence narrows; it does not have to decide. A phrase set matching several
 * transformations is a valid state — choosing between them is the downstream selection Step 4
 * already owns (spec §11.1). While several stand, the slots they ALL declare are `required`
 * (bindable whichever is eventually chosen) and the rest are `pending`, each naming the
 * candidates that would need it.
 *
 * Which slots exist is never hardcoded here: it comes from each transformation's
 * `sliceKeys[]`, and each slot's picker source from `sliceKeys[].source` (spec §7.1, §7.2).
 */

/**
 * Transformations whose validSmartPhrases contain EVERY supplied phrase oid.
 *
 * This is a stricter rule than `phrase-engine.js:findMatchingTransformations`, which ranks by
 * partial coverage for a fuzzy palette. Authoring needs the opposite: a transformation that
 * cannot express one of the phrases the author actually wrote is not a candidate for it.
 *
 * @param {string[]} phraseOids
 * @param {object} lib  adapted library
 * @returns {Array<{conceptId: string, transformationType: string, coverage: number}>}
 */
export function resolveCandidates(phraseOids, lib) {
  const oids = [...new Set(phraseOids || [])];
  if (!oids.length) return [];

  const out = [];
  for (const t of lib.transformations || []) {
    const valid = new Set(t.validSmartPhrases || []);
    if (!valid.size) continue;
    if (!oids.every((o) => valid.has(o))) continue;
    out.push({
      conceptId: t.conceptId,
      transformationType: t.transformationType,
      /* How much of the transformation's vocabulary the sentence uses. Ranks a tightly
         matched transformation above one that merely permits these phrases among many. */
      coverage: oids.length / valid.size
    });
  }
  out.sort((a, b) => b.coverage - a.coverage || a.conceptId.localeCompare(b.conceptId));
  return out;
}

/**
 * The fixture slots the candidates declare.
 *
 * @param {Array<{conceptId: string}>} candidates  from resolveCandidates()
 * @param {object} lib  adapted library
 * @returns {{required: Array<{dimension: string, source: string}>,
 *            pending: Array<{dimension: string, source: string, neededBy: string[]}>}}
 */
export function deriveSlots(candidates, lib) {
  if (!candidates || !candidates.length) return { required: [], pending: [] };

  const byId = new Map((lib.transformations || []).map((t) => [t.conceptId, t]));
  const perCandidate = candidates.map((c) => {
    const t = byId.get(c.conceptId);
    const slots = new Map();
    for (const sk of (t && t.sliceKeys) || []) {
      if (sk.dimension) slots.set(sk.dimension, sk.source);
    }
    return { conceptId: c.conceptId, slots };
  });

  const required = [];
  const pending = [];
  const seen = new Set();
  for (const { slots } of perCandidate) {
    for (const [dimension, source] of slots) {
      if (seen.has(dimension)) continue;
      seen.add(dimension);
      const neededBy = perCandidate.filter((p) => p.slots.has(dimension)).map((p) => p.conceptId);
      if (neededBy.length === perCandidate.length) required.push({ dimension, source });
      else pending.push({ dimension, source, neededBy });
    }
  }
  return { required, pending };
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_phrase_slots.mjs; echo "exit=$?"
```
Expected: `PASS — slot derivation follows the resolved transformations.` and `exit=0`

- [ ] **Step 5: Commit**

```bash
git add ac-dc-app/js/utils/phrase-slots.js scripts/verify_phrase_slots.mjs
git commit -m "Derive fixture slots from the transformations a sentence resolves to

Several candidates is a valid state: the slots they all declare are required,
the rest pending with the candidates that would need them."
```

---

## Task 5: The single binding writer and the load-time backfill

Bindings persist USDM ids; `dimensionValues` persists labels and is what Steps 6 and 8 execute from. Exactly one helper writes either (spec §11.3).

**Files:**
- Create: `ac-dc-app/js/utils/phrase-bindings.js`
- Create: `scripts/verify_phrase_bindings.mjs`

**Interfaces:**
- Consumes: a graph from `buildConceptGraph`; a spec object shaped like `endpointSpecs[epId]`.
- Produces:
  - `setDimensionBinding(spec, graph, phraseOid, slot, dimension, conceptId) -> void`
  - `resolveLabelToConceptId(graph, source, label) -> string | null` — `null` when zero or more than one concept matches
  - `backfillPhraseInstances(spec, graph) -> void` — no-op when `phraseInstances` already exists

- [ ] **Step 1: Write the failing harness**

Create `scripts/verify_phrase_bindings.mjs`:

```js
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

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — one writer keeps ids and labels in step; backfill handles existing saves.");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node scripts/verify_phrase_bindings.mjs; echo "exit=$?"
```
Expected: `ERR_MODULE_NOT_FOUND` for `phrase-bindings.js`, `exit=1`.

- [ ] **Step 3: Write the module**

Create `ac-dc-app/js/utils/phrase-bindings.js`:

```js
/**
 * The single writer for phrase bindings.
 *
 * A binding persists a USDM concept id (spec §7.3) while `dimensionValues` persists a label
 * string, and Steps 6 and 8 execute from the latter. The two must never drift, so exactly one
 * function writes either of them — Step 3's dropdown resolves its label to an id and calls the
 * same helper Step 7's picker calls (spec §11.3).
 */

/**
 * Find the concept a label refers to, within one declared source.
 *
 * Returns null when zero or more than one concept matches. An ambiguous label is left
 * unresolved rather than guessed — a wrong anchor is worse than an absent one.
 *
 * @param {object} graph
 * @param {string} source  a declared sliceKey source
 * @param {string} label
 * @returns {string|null}
 */
export function resolveLabelToConceptId(graph, source, label) {
  const hits = Object.keys(graph.concepts || {}).filter((id) => {
    const c = graph.concepts[id];
    return c.source === source && c.label === label;
  });
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Bind one dimension, updating both representations.
 *
 * @param {object} spec        endpointSpecs[epId]
 * @param {object} graph
 * @param {string} phraseOid   e.g. "SP_TIMEPOINT"
 * @param {string} slot        the placeholder name, e.g. "visit"
 * @param {string} dimension   the dimensionValues key, e.g. "AnalysisVisit"
 * @param {string} conceptId
 */
export function setDimensionBinding(spec, graph, phraseOid, slot, dimension, conceptId) {
  if (!Array.isArray(spec.phraseInstances)) spec.phraseInstances = [];
  if (!spec.dimensionValues) spec.dimensionValues = {};

  let instance = spec.phraseInstances.find((p) => p.phrase === phraseOid);
  if (!instance) {
    instance = { phrase: phraseOid, bindings: {} };
    spec.phraseInstances.push(instance);
  }
  if (!instance.bindings) instance.bindings = {};
  instance.bindings[slot] = { concept: conceptId };

  const concept = (graph.concepts || {})[conceptId];
  if (concept) spec.dimensionValues[dimension] = concept.label;
}

/* Which phrase slot and dimensionValues key each source pairs with, for the backfill. */
const BACKFILL_SLOTS = [
  { phrase: "SP_TIMEPOINT", slot: "visit", dimension: "AnalysisVisit", source: "visit" },
  { phrase: "SP_POPULATION", slot: "population", dimension: "Population", source: "population" },
  { phrase: "SP_PARAMETER", slot: "parameter", dimension: "Parameter", source: "biomedicalConcept" }
];

/**
 * Derive `phraseInstances` for a spec saved before this field existed.
 *
 * Reads the fields older saves do carry — `selectedEndpointPhrase`, `selectedDimPhrases` and
 * `dimensionValues` — and resolves each label back to a concept id. A label that does not
 * resolve is recorded with `unresolved: true` and its literal value, so nothing is silently
 * dropped and the UI can offer to link it.
 *
 * No-op when `phraseInstances` already exists, so it is safe to call on every load.
 *
 * @param {object} spec   endpointSpecs[epId]
 * @param {object} graph
 */
export function backfillPhraseInstances(spec, graph) {
  if (Array.isArray(spec.phraseInstances)) return;

  const instances = [];
  const dims = spec.dimensionValues || {};

  if (spec.selectedEndpointPhrase) {
    const paramLabel = dims.Parameter;
    const bindings = {};
    if (paramLabel) {
      const id = resolveLabelToConceptId(graph, "biomedicalConcept", paramLabel);
      bindings.parameter = id ? { concept: id } : { value: paramLabel, unresolved: true };
    }
    instances.push({ phrase: spec.selectedEndpointPhrase, bindings });
  }

  const selected = new Set(spec.selectedDimPhrases || []);
  for (const entry of BACKFILL_SLOTS) {
    if (!selected.has(entry.phrase)) continue;
    const label = dims[entry.dimension];
    if (!label) continue;
    const id = resolveLabelToConceptId(graph, entry.source, label);
    instances.push({
      phrase: entry.phrase,
      bindings: { [entry.slot]: id ? { concept: id } : { value: label, unresolved: true } }
    });
  }

  spec.phraseInstances = instances;
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_phrase_bindings.mjs; echo "exit=$?"
```
Expected: `PASS — one writer keeps ids and labels in step; backfill handles existing saves.` and `exit=0`

- [ ] **Step 5: Run every gate together**

```bash
python3 scripts/validate_phrase_shapes.py \
  && python3 scripts/upgrade_phrase_metadata.py --check \
  && node smartphrase/tools/verify.mjs \
  && node scripts/verify_smartphrase_engine.mjs \
  && node scripts/verify_smartphrase_adapter.mjs \
  && node scripts/verify_smartphrase_graph.mjs \
  && node scripts/verify_phrase_slots.mjs \
  && node scripts/verify_phrase_bindings.mjs
echo "all-gates-exit=$?"
```
Expected: eight PASS lines, `all-gates-exit=0`.

- [ ] **Step 6: Confirm the app is untouched**

```bash
git diff --name-only 40c45e1 HEAD | grep -E 'ac-dc-app/js/views/|ACDC_Transformation_Library_v06|^smartphrase/' \
  && echo "*** VIOLATION ***" || echo "confirmed: no view, library or smartphrase/ file changed"
```
Expected: `confirmed: …`

- [ ] **Step 7: Commit**

```bash
git add ac-dc-app/js/utils/phrase-bindings.js scripts/verify_phrase_bindings.mjs
git commit -m "Add the single binding writer and the load-time backfill

One helper writes both the concept id and the label, so phraseInstances and
dimensionValues cannot drift. Existing saves gain phraseInstances derived from
the fields they already carry; labels that do not resolve are kept and flagged."
```

---

## Definition of done

All eight gates pass. Three new modules exist under `ac-dc-app/js/utils/`, each with its own Node harness, and nothing imports them yet — the UI plan does that. No file under `ac-dc-app/js/views/` has changed, the v06 library is untouched, and `smartphrase/` is untouched.

## What this hands the UI plan

| Module | The UI calls it to… |
|---|---|
| `smartphrase-graph.js` | build `ctx.graph` for the selected study; add unresolved concepts for typed labels |
| `phrase-slots.js` | learn which slots to render, which picker source feeds each, and what is still pending |
| `phrase-bindings.js` | write every dimension binding, and backfill on load |

**Deliberately left to the UI plan: per-analysis (manual) phrase writing.** Spec §11.2 puts
`method`, `method_qualifier` and `covariate` phrases on `selectedAnalyses[i].phraseInstances`
rather than on the spec. No helper for that lives here, because those phrases have no
`dimensionValues` counterpart — nothing can drift, so the single-writer rule that motivates
`phrase-bindings.js` does not apply to them. The UI plan writes them directly.

## Testing

| Level | What |
|---|---|
| Graph | both real studies, exact concept counts, USDM-id keys, both vocabularies, no trace |
| End-to-end | study → graph → adapter → engine resolves a real ADAS-Cog/Week 24/ANCOVA instance, all sliceKeys filled |
| Unresolved | a typed label still renders and still slices, flagged `anchored: false` |
| Slots | 3 candidates from the endpoint phrase alone; 1 after the method phrase; MMRM requires no visit; intersection and pending across candidates |
| Bindings | one write updates both fields; rebinding replaces; ambiguity yields null; backfill on the real Scenario 1 file, idempotent |
| Regression | the five pre-existing gates at every commit |

## Risks

1. **`SP_PARAMETER` in the backfill.** Scenario 1's `selectedDimPhrases` is `["SP_TIMEPOINT"]` only, so the parameter path is exercised through `selectedEndpointPhrase` rather than the `BACKFILL_SLOTS` entry. The entry is there for specs that do select `SP_PARAMETER`; if none exist in practice it is dead code and should be removed when the UI plan confirms that.
2. **Ambiguous labels return null, and the pilot has ambiguity.** Measured: the pilot's 12 encounter labels are all distinct, so visits always resolve — but its **182 biomedical concepts carry only 163 distinct labels**, so 19 are duplicated. Any older save whose `dimensionValues.Parameter` matches one of those resolves to `null` and is recorded with `unresolved: true` rather than guessed. That is correct and §7.4 sanctions it, but expect unresolved parameters to be visible on first open — including Scenario 1's, whose `"Adas-Cog(11) Subscore"` matches no BC label at all.
3. **`resolveCandidates` is stricter than `findMatchingTransformations`.** The existing palette function ranks by partial coverage; this one requires every written phrase to be valid for the candidate. That is deliberate — a transformation that cannot express a phrase the author wrote is not a candidate — but the two functions will disagree, and the UI plan must be clear about which surface uses which.
