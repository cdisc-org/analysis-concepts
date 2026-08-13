# Breast Cancer (PrE0102) Worked Example — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second worked study — PrECOG PrE0102 metastatic breast cancer — to the smartphrase demo, carrying a new descriptive Kaplan-Meier transformation template, so that template-level reuse is shown across therapeutic areas and endpoint types rather than only within one study.

**Architecture:** The library layer stays the distribution boundary and stays generated-verbatim from `methods_02`; the new KM template lands in a separate *proposed-additions overlay* file that the engine merges and the UI badges, so the generated file's provenance contract is never violated. The study layer becomes per-study files behind a `STUDY_GRAPHS` registry with a study switch in the UI. The engine's ANCOVA-specific coupling (hardcoded phrase OIDs and a hardcoded `CHG ~ …` formula) is generalised to slot-name-driven and method-keyed dispatch, guarded by golden-output regression tests so CDISC Pilot behaviour is provably unchanged.

**Tech Stack:** Plain ES5 browser JS (demo files, no build step, `file://`-safe), Node ESM `.mjs` for dev-time tooling (subset generator, verification harness), JSON for library/study data, Markdown for docs.

**Spec:** GitHub issue [#9](https://github.com/cdisc-org/analysis-concepts/issues/9) (requirements — the four claims) plus `smartphrase/DESIGN.md` (architecture and decisions D1–D7) and the reversal-decision comment [#issuecomment-5281378506](https://github.com/cdisc-org/analysis-concepts/issues/9#issuecomment-5281378506). Source document: `smartphrase/SAP/` (converted PrE0102 SAP).

## Global Constraints

- **Zero-install demo.** `smartphrase/demo/index.html` must run by double-click from `file://` with no server and no build step. Data is loaded via `<script src>` only — `fetch()` of local JSON is blocked by the `file://` CORS policy.
- **Dev tooling is not a demo dependency.** The generator and verifier are Node `.mjs` under `smartphrase/tools/`; the demo never imports them.
- **Demo files are ES5-style.** `var`, `function`, no arrow functions, no `const`/`let`, no template literals — match the existing code in `engine.js`, `index.html`, `data/*.js`.
- **`data/acdc-library.js` is GENERATED — never hand-edit.** Its header says so and its `provenance` field pins `methods_02@ffee5df`. Changes to it come only from re-running the generator.
- **Proposed library entries are not upstream yet.** Anything not present in `methods_02@ffee5df` goes in `data/acdc-library-proposed.js` and must be visibly flagged in the UI.
- **CDISC Pilot output must not change.** All existing rendered sentences, constructed model views, tag source, JSON-LD and traces are pinned as goldens before any engine edit. The one deliberate exception is the alpha float-formatting fix in Task 5, whose golden is updated intentionally.
- **Identifier policy (DESIGN.md).** Ground into USDM / ARS / STATO / CDISC-NCIt where a term exists; anything else carries `iri_status: "illustrative"`. Never invent an IRI and label it authoritative.
- **The engine stays pure and DOM-free** so it runs under both the browser and Node.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `smartphrase/tools/verify.mjs` | Create | Node harness: loads demo files, runs assertions, compares against goldens. |
| `smartphrase/tools/goldens.json` | Create | Captured golden outputs (sentences, model views, tag source, JSON-LD, traces). |
| `smartphrase/tools/build-library-subset.mjs` | Create | Regenerates `data/acdc-library.js` from a `methods_02` checkout. |
| `smartphrase/demo/data/acdc-library.js` | Modify (regenerate) | Add `M.KaplanMeier` to the `methods` map. |
| `smartphrase/demo/data/acdc-library-proposed.js` | Create | `T.PFS_KaplanMeier` — proposed library addition, not yet upstream. |
| `smartphrase/demo/engine.js` | Modify | Generalise `constructModelView` / `buildTrace` off hardcoded phrase OIDs; merge the proposed overlay; method-keyed expression dispatch. |
| `smartphrase/demo/data/study-graph.js` | Modify | Rename export into the `STUDY_GRAPHS` registry as `CDISCPILOT01`; content otherwise unchanged. |
| `smartphrase/demo/data/study-graph-pre0102.js` | Create | PrE0102 concepts (incl. `Event` kind), method grounding, 4 instances, trace chains. |
| `smartphrase/demo/data/lang-overlay.js` | Modify | FR/DE for the TTE/KM phrases and PrE0102 concepts. |
| `smartphrase/demo/index.html` | Modify | Study switch; template-driven model panel; per-study reuse grid; overlay provenance in the standards table. |
| `smartphrase/DESIGN.md` | Modify | Decisions D8 (proposed-additions overlay), D9 (per-study graph registry), D10 (engine generalisation). |
| `smartphrase/REFERENCE.md` | Modify | Document the overlay file, the registry, the generalised algorithms, new trace tokens. |
| `smartphrase/WALKTHROUGH.md` | Modify | New cross-study reuse beat. |
| `smartphrase/PLAN-breast-cancer.md` | This file | Progress tracker. |

**Note on plan location:** the writing-plans default is `docs/superpowers/plans/`. This repo has no `docs/` directory and the smartphrase workstream keeps all its documents in `smartphrase/` (`DESIGN.md`, `WALKTHROUGH.md`, `REFERENCE.md`, `GETTING-STARTED.md`), so repo convention wins.

---

### Task 1: Commit the converted SAP source

The converted SAP is currently untracked, so every later diff is noisy and the source document isn't on the branch.

**Files:**
- Commit (already written): `smartphrase/SAP/*.md`, `smartphrase/SAP/PrE0102_SAP_001.pdf`

**Interfaces:**
- Consumes: nothing.
- Produces: `smartphrase/SAP/` on the branch. Later tasks quote §3.1, §5.3, §7.7.2 from `smartphrase/SAP/03-study-objectives.md`, `05-measurement-of-effect.md`, `07-general-statistical-considerations.md`.

- [ ] **Step 1: Confirm what is untracked**

```bash
cd /Volumes/External/skunk/analysis-concepts
git status --short smartphrase/SAP
```

Expected: `?? smartphrase/SAP/` (17 files: 16 `.md` + 1 `.pdf`).

- [ ] **Step 2: Check the PDF size is acceptable to commit**

```bash
du -h smartphrase/SAP/PrE0102_SAP_001.pdf
```

Expected: ~674K. Under a megabyte, so commit it directly — the converted Markdown is only trustworthy if the source travels with it.

- [ ] **Step 3: Commit**

```bash
git add smartphrase/SAP
git commit -m "$(cat <<'EOF'
Add PrE0102 breast cancer SAP source and Markdown conversion

Source document for the breast cancer worked example (issue #9): PrECOG
PrE0102 Final SAP, 24 March 2014. Converted to Markdown split by the SAP's
own section/appendix numbering, verbatim body text, page references, running
headers/footers stripped.

Appendix 2 (Scheduled Assessments) is an embedded image table in the source
and is left as a page pointer; its footnotes are real text and transcribed.
Two "(Al)" -> "(AI)" corrections are PDF font-encoding artifacts, not source
typos. The source's own "Section 7.6.2" cross-reference error (should be
7.7.2) is preserved as-is.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Node verification harness with captured goldens

Nothing in the repo can currently verify the demo — the 21 + 15 headless checks referenced in the issue were ad-hoc and never committed. Every later task depends on a regression gate, so it must exist first. Goldens are **captured from the current code**, not hand-written, so no expected value is invented.

**Files:**
- Create: `smartphrase/tools/verify.mjs`
- Create: `smartphrase/tools/goldens.json` (generated by step 3)

**Interfaces:**
- Consumes: `demo/data/acdc-library.js`, `demo/data/study-graph.js`, `demo/data/lang-overlay.js`, `demo/engine.js` (all IIFEs that attach to `globalThis` under Node).
- Produces: `node smartphrase/tools/verify.mjs` exits 0 on pass, 1 on failure with a diff. `--update-goldens` rewrites `goldens.json`. Later tasks run this after every change.

- [ ] **Step 1: Write the harness**

Create `smartphrase/tools/verify.mjs`:

```js
/*
 * Verification harness for the smartphrase demo.
 *
 *   node smartphrase/tools/verify.mjs                  # compare against goldens
 *   node smartphrase/tools/verify.mjs --update-goldens # recapture goldens
 *
 * The demo's data and engine files are browser IIFEs that attach to
 * globalThis when `window` is undefined, so they load under Node via vm
 * with no modification.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const demo = path.join(here, "..", "demo");
const goldenPath = path.join(here, "goldens.json");
const update = process.argv.includes("--update-goldens");

function load(rel) {
  const file = path.join(demo, rel);
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: rel });
}

load("data/acdc-library.js");
load("data/study-graph.js");
load("data/lang-overlay.js");
load("engine.js");

const E = globalThis.SP_ENGINE;
const LIB = globalThis.ACDC_LIBRARY;
const I18N = globalThis.LANG_OVERLAY;

const failures = [];
const captured = {};

function record(key, value) {
  captured[key] = value;
}

function check(name, cond, detail) {
  if (!cond) failures.push(name + (detail ? " — " + detail : ""));
}

/* ---- graphs under test: every study in the registry ---- */
const graphs = globalThis.STUDY_GRAPHS || { CDISCPILOT01: globalThis.STUDY_GRAPH };

for (const [studyKey, graph] of Object.entries(graphs)) {
  const ctx = E.ctxOf(LIB, graph, I18N);

  for (const inst of graph.instances) {
    /* resolved sentence per available language */
    for (const lang of E.availableLangs(ctx)) {
      const res = E.resolveInstance(ctx, inst, lang);
      record(`${studyKey}/${inst.id}/sentence/${lang}`, res.sentence);
      check(
        `${studyKey}/${inst.id} resolves with no errors (${lang})`,
        res.errors.length === 0,
        JSON.stringify(res.errors)
      );
    }

    /* constructed model view */
    const mv = E.constructModelView(ctx, inst);
    record(`${studyKey}/${inst.id}/modelView`, mv);
    check(
      `${studyKey}/${inst.id} model view has no errors`,
      !mv.errors || mv.errors.length === 0,
      JSON.stringify(mv.errors)
    );
    check(
      `${studyKey}/${inst.id} every sliceKey is filled`,
      (mv.sliceKeys || []).every((sk) => sk.value !== null && sk.value !== undefined),
      JSON.stringify((mv.sliceKeys || []).filter((sk) => !sk.value))
    );

    /* tag dialect round-trip must be byte-equal */
    const src = E.toMacroText(ctx, inst);
    record(`${studyKey}/${inst.id}/macro`, src);
    const parsed = E.parseMacroText(ctx, src, inst);
    check(
      `${studyKey}/${inst.id} macro round-trips without findings`,
      parsed.instancePatch !== null,
      JSON.stringify(parsed.findings)
    );
    if (parsed.instancePatch) {
      check(
        `${studyKey}/${inst.id} macro round-trip is byte-equal`,
        E.toMacroText(ctx, parsed.instancePatch) === src
      );
    }

    /* JSON-LD projection */
    record(`${studyKey}/${inst.id}/jsonld`, E.toJSONLD(ctx, inst));

    /* trace for every role that has a chain */
    for (const role of Object.keys(graph.traceTemplates)) {
      const chain = E.buildTrace(ctx, inst, role);
      if (!chain) continue;
      record(`${studyKey}/${inst.id}/trace/${role}`, chain);
      check(
        `${studyKey}/${inst.id} trace ${role} leaves no unfilled tokens`,
        !JSON.stringify(chain).includes("⟨"),
        JSON.stringify(chain)
      );
    }

    /* every phrase the instance uses must be valid for its template */
    const tpl = E.templateDef(ctx, inst.template);
    check(`${studyKey}/${inst.id} template ${inst.template} exists`, !!tpl);
    if (tpl && tpl.validSmartPhrases) {
      const bad = inst.phrases
        .map((p) => p.phrase)
        .filter((oid) => tpl.validSmartPhrases.indexOf(oid) === -1);
      check(
        `${studyKey}/${inst.id} uses only phrases valid for its template`,
        bad.length === 0,
        bad.join(", ")
      );
    }
  }
}

/* ---- planted faults must be caught ---- */
{
  const graph = graphs.CDISCPILOT01;
  const ctx = E.ctxOf(LIB, graph, I18N);
  const base = graph.instances[0];

  const unknownConcept = JSON.parse(JSON.stringify(base));
  unknownConcept.phrases[0].bindings[
    Object.keys(unknownConcept.phrases[0].bindings)[0]
  ] = { concept: "PARAM.DOES_NOT_EXIST" };
  check(
    "planted fault: unknown concept is reported",
    E.resolveInstance(ctx, unknownConcept).errors.length > 0
  );

  const badPhrase = E.parseMacroText(
    ctx,
    '<acdc:macro id="analysis" ref="T.CFB_ANCOVA" instance="X">\n' +
      '  <acdc:macro id="phrase" ref="SP_NOT_A_PHRASE" instance="p1"/>\n' +
      "</acdc:macro>",
    base
  );
  check(
    "planted fault: unknown phrase ref rejected",
    badPhrase.instancePatch === null &&
      badPhrase.findings.some((f) => f.level === "error")
  );

  const noWrapper = E.parseMacroText(ctx, "<p>not a macro block</p>", base);
  check("planted fault: missing wrapper rejected", noWrapper.instancePatch === null);
}

/* ---- compare or update ---- */
if (update) {
  fs.writeFileSync(goldenPath, JSON.stringify(captured, null, 2) + "\n");
  console.log(
    `goldens written: ${Object.keys(captured).length} entries -> ${path.relative(process.cwd(), goldenPath)}`
  );
} else if (!fs.existsSync(goldenPath)) {
  failures.push("no goldens.json — run with --update-goldens first");
} else {
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  for (const key of Object.keys(golden)) {
    if (!(key in captured)) {
      failures.push(`golden missing from run: ${key}`);
      continue;
    }
    const a = JSON.stringify(golden[key]);
    const b = JSON.stringify(captured[key]);
    if (a !== b) failures.push(`golden changed: ${key}\n  was: ${a}\n  now: ${b}`);
  }
  for (const key of Object.keys(captured)) {
    if (!(key in golden)) console.log(`new golden (not yet pinned): ${key}`);
  }
}

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} problem(s):`);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log(`PASS — ${Object.keys(captured).length} outputs checked, no failures.`);
```

- [ ] **Step 2: Run it before goldens exist, to verify it fails loudly**

```bash
cd /Volumes/External/skunk/analysis-concepts
node smartphrase/tools/verify.mjs
```

Expected: FAIL with `no goldens.json — run with --update-goldens first`, exit 1. If it instead crashes on loading, the `vm` load order is wrong — `engine.js` must load last.

- [ ] **Step 3: Capture goldens from current (unmodified) code**

```bash
node smartphrase/tools/verify.mjs --update-goldens
```

Expected: `goldens written: N entries`. N should be roughly 3 instances × (3 sentences + model view + macro + JSON-LD + ~5 traces) ≈ 35–40.

- [ ] **Step 4: Run again to confirm the gate is green and stable**

```bash
node smartphrase/tools/verify.mjs
```

Expected: `PASS — N outputs checked, no failures.`

- [ ] **Step 5: Sanity-read two goldens to confirm they are real, not empty**

```bash
node -e "const g=require('./smartphrase/tools/goldens.json'); console.log(g['CDISCPILOT01/AC.PRIMARY.ADASCOG/sentence/en']); console.log(g['CDISCPILOT01/AC.PRIMARY.ADASCOG/sentence/de']);"
```

Expected: two full sentences, the German one containing the `wird … untersucht` verb bracket. If either is empty or contains `⟨`, stop — the harness is loading the wrong state.

- [ ] **Step 6: Commit**

```bash
git add smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "$(cat <<'EOF'
Add Node verification harness with captured goldens

The 21+15 headless checks cited on issue #9 were ad-hoc and never committed,
so no regression gate existed. verify.mjs loads the demo's browser IIFEs
under Node via vm and checks, for every instance in every registered study:
resolution errors, sliceKey completeness, byte-equal tag round-trip, trace
tokens fully substituted, phrase-validity against the template, plus three
planted faults. Outputs are pinned in goldens.json, captured from current
behaviour rather than hand-written.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Library subset generator, and add `M.KaplanMeier`

`data/acdc-library.js` declares itself generated from `methods_02@ffee5df` and says "do not hand-edit", but no generator is committed — so the file cannot legitimately be extended. The KM analysis needs `M.KaplanMeier` in the `methods` map (currently only `M.ANCOVA` is there). Build the generator, prove it reproduces the current file byte-for-byte, then widen its selection.

**Files:**
- Create: `smartphrase/tools/build-library-subset.mjs`
- Modify (by regeneration): `smartphrase/demo/data/acdc-library.js`

**Interfaces:**
- Consumes: a `methods_02` tree, read via `git show` from the local clone (no network, no working-tree switch).
- Produces: `node smartphrase/tools/build-library-subset.mjs` rewrites `data/acdc-library.js`. `--check` verifies the file on disk matches what the generator would emit, without writing. `ACDC_LIBRARY.methods` gains `M.KaplanMeier`.

- [ ] **Step 1: Confirm the upstream pin and what the current subset selected**

```bash
cd /Volumes/External/skunk/analysis-concepts
node -e "
const fs=require('fs'),vm=require('vm');
vm.runInThisContext(fs.readFileSync('smartphrase/demo/data/acdc-library.js','utf8'));
const L=globalThis.ACDC_LIBRARY;
console.log('provenance:', JSON.stringify(L.provenance));
console.log('library_version:', L.library_version);
console.log('phrases:', L.smartPhrases.length);
console.log('templates:', L.transformations.map(t=>t.conceptId).join(', '));
console.log('methods:', Object.keys(L.methods).join(', '));
console.log('top-level keys:', Object.keys(L).join(', '));
"
```

Expected: provenance pinning `methods_02` / `ffee5df`, `library_version` `0.7`, 22 phrases, templates including `T.CFB_ANCOVA`, methods `M.ANCOVA` only.

- [ ] **Step 2: Write the generator**

Create `smartphrase/tools/build-library-subset.mjs`. It reads the pinned commit through `git show`, selects the same entities the current file contains, and emits the identical wrapper:

```js
/*
 * Regenerates smartphrase/demo/data/acdc-library.js — a verbatim subset of the
 * AC/DC library artefacts on methods_02, wrapped as a browser-loadable IIFE
 * (file:// blocks fetch() of local JSON; a <script src> is not blocked).
 *
 *   node smartphrase/tools/build-library-subset.mjs          # write
 *   node smartphrase/tools/build-library-subset.mjs --check  # verify, no write
 *
 * Selection is declared below, not inferred. Entity JSON is copied verbatim —
 * this tool must never reshape upstream content.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..");
const outPath = path.join(here, "..", "demo", "data", "acdc-library.js");
const check = process.argv.includes("--check");

const SOURCE_BRANCH = "methods_02";
const SOURCE_COMMIT = "ffee5df";

/* Which upstream entities the demo needs. Widening this list is the ONLY
   legitimate way to add library content to the demo. */
const SELECT_METHODS = ["M_ANCOVA", "M_KaplanMeier"];

function gitShow(relPath) {
  return execFileSync("git", ["show", `${SOURCE_COMMIT}:${relPath}`], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
}

const transformations = JSON.parse(
  gitShow("lib/transformations/ACDC_Transformation_Library_v07.json")
);

const methods = {};
for (const name of SELECT_METHODS) {
  const id = name.replace("_", ".");
  methods[id] = JSON.parse(gitShow(`lib/methods/analyses/${name}.json`));
}

const library = {
  provenance: {
    source_branch: SOURCE_BRANCH,
    source_commit: SOURCE_COMMIT,
    generated_by: "smartphrase/tools/build-library-subset.mjs",
    note: "Verbatim subset. Entities are copied unmodified; only the selection is local."
  },
  library_version: transformations.library_version,
  configurationOptions: transformations.configurationOptions,
  roleDefinitions: transformations.roleDefinitions,
  smartPhrases: transformations.smartPhrases,
  transformations: transformations.transformations,
  methods: methods
};

const banner = [
  "/*",
  " * AC/DC library subset for the smartphrase demo.",
  " *",
  ` * GENERATED from ${SOURCE_BRANCH} (commit ${SOURCE_COMMIT}) — do not hand-edit;`,
  " * see provenance field. Regenerate with:",
  " *   node smartphrase/tools/build-library-subset.mjs",
  " *",
  " * Proposed additions that are NOT yet upstream live in",
  " * acdc-library-proposed.js and are flagged in the UI.",
  " */"
].join("\n");

const body =
  banner +
  "\n(function (g) {\n  g.ACDC_LIBRARY = " +
  JSON.stringify(library, null, 2).split("\n").join("\n  ") +
  ";\n})(typeof window !== \"undefined\" ? window : globalThis);\n";

if (check) {
  const current = fs.readFileSync(outPath, "utf8");
  if (current !== body) {
    console.error("FAIL — acdc-library.js on disk differs from generator output.");
    process.exit(1);
  }
  console.log("PASS — acdc-library.js matches generator output.");
} else {
  fs.writeFileSync(outPath, body);
  console.log(
    `wrote ${path.relative(repo, outPath)} — ${library.smartPhrases.length} phrases, ` +
      `${library.transformations.length} templates, methods: ${Object.keys(methods).join(", ")}`
  );
}
```

- [ ] **Step 3: Verify the upstream paths and keys the generator assumes actually exist**

```bash
cd /Volumes/External/skunk/analysis-concepts
git show ffee5df:lib/transformations/ACDC_Transformation_Library_v07.json | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const j=JSON.parse(s);
  console.log('top-level keys:', Object.keys(j).join(', '));
  console.log('library_version:', j.library_version);
});"
git show ffee5df:lib/methods/analyses/M_KaplanMeier.json | head -3
```

Expected: the transformation library exposes `library_version`, `configurationOptions`, `roleDefinitions`, `smartPhrases`, `transformations`; `M_KaplanMeier.json` opens with `{ "$schema": ...`. If key names differ, fix the generator's field mapping to match upstream before continuing.

- [ ] **Step 4: Prove the generator reproduces the current file, before widening selection**

Temporarily narrow selection to today's content and diff:

```bash
cp smartphrase/demo/data/acdc-library.js /tmp/acdc-library.before.js
sed -i '' 's/^const SELECT_METHODS = .*/const SELECT_METHODS = ["M_ANCOVA"];/' smartphrase/tools/build-library-subset.mjs
node smartphrase/tools/build-library-subset.mjs
diff /tmp/acdc-library.before.js smartphrase/demo/data/acdc-library.js && echo "IDENTICAL"
```

Expected: `IDENTICAL`. If the diff is only whitespace/indentation, adjust the emitter (indent width, trailing newline) until byte-identical — do **not** accept a cosmetic diff, because that would silently rewrite the pinned file. If the diff is *semantic* (different entity content), the current file was hand-edited at some point: stop and report before proceeding.

- [ ] **Step 5: Restore the widened selection and regenerate with `M.KaplanMeier`**

```bash
sed -i '' 's/^const SELECT_METHODS = .*/const SELECT_METHODS = ["M_ANCOVA", "M_KaplanMeier"];/' smartphrase/tools/build-library-subset.mjs
node smartphrase/tools/build-library-subset.mjs
node smartphrase/tools/build-library-subset.mjs --check
```

Expected: write reports `methods: M.ANCOVA, M.KaplanMeier`; `--check` reports PASS.

- [ ] **Step 6: Confirm the addition is purely additive**

```bash
node smartphrase/tools/verify.mjs
```

Expected: `PASS`. Adding an unused method must not change any golden. If goldens changed, the generator altered existing content — revert and fix.

- [ ] **Step 7: Commit**

```bash
git add smartphrase/tools/build-library-subset.mjs smartphrase/demo/data/acdc-library.js
git commit -m "$(cat <<'EOF'
Add library subset generator; include M.KaplanMeier

acdc-library.js declared itself generated from methods_02@ffee5df but no
generator was committed, so the pinned subset could not legitimately be
extended. build-library-subset.mjs reads the pinned commit via git show,
copies entities verbatim, and emits the same IIFE wrapper; --check asserts
the file on disk matches. Verified byte-identical to the previous file before
widening selection, so the only change is the added M.KaplanMeier method.

Goldens unchanged (additive).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Generalise the engine off ANCOVA-specific coupling

`constructModelView` and `buildTrace` locate their inputs by hardcoded phrase OID (`SP_CFB_ENDPOINT`, `SP_TIMEPOINT`, `SP_POPULATION`), map only three slice dimensions, and build the model formula as a hardcoded `"CHG ~ " + terms`. A time-to-event template binds a different endpoint phrase (`SP_TTE_ENDPOINT`, slot `event`), has no visit, and needs a survival formula — so all three must become data-driven. Goldens from Task 2 prove CDISC Pilot output is unchanged.

**Files:**
- Modify: `smartphrase/demo/engine.js:204-329` (`bindingConceptId` → slot-driven helpers, `constructModelView`, `buildTrace`)

**Interfaces:**
- Consumes: `ctx` from `E.ctxOf(lib, graph, i18n)`; concepts carrying `kind`, `conceptCategory`, and a `data` map.
- Produces: unchanged public signatures — `constructModelView(ctx, instance)` and `buildTrace(ctx, instance, role)`. Two new internal helpers: `boundConcepts(ctx, instance)` returning `[{ slot, id, c, role }]` sorted by library role order, and `EXPRESSION_BUILDERS` keyed by method conceptId. `resolvedExpression` for `M.ANCOVA` is byte-identical to today.

- [ ] **Step 1: Add the failing assertion first — a KM-shaped instance must construct**

Append a temporary probe to `smartphrase/tools/verify.mjs` immediately before the `/* ---- compare or update ---- */` block:

```js
/* ---- TEMPORARY PROBE (Task 4): slot-driven construction ---- */
{
  const graph = graphs.CDISCPILOT01;
  const ctx = E.ctxOf(LIB, graph, I18N);
  /* An instance whose endpoint phrase is NOT SP_CFB_ENDPOINT must still fill
     its Population sliceKey — today it cannot, because lookup is by OID. */
  const probe = {
    id: "PROBE.SLOTDRIVEN",
    iri: "acdc:instance/PROBE",
    label: "probe",
    template: "T.CFB_ANCOVA",
    sentenceRole: "the primary analysis",
    phrases: [
      { phrase: "SP_PARAMETER", bindings: { parameter: { concept: "PARAM.ADASCOG11" } } },
      { phrase: "SP_POPULATION", bindings: { population: { concept: "POP.EFFICACY" } } }
    ]
  };
  const mv = E.constructModelView(ctx, probe);
  const popKey = (mv.sliceKeys || []).find((sk) => sk.dimension === "Population");
  check(
    "PROBE: Population sliceKey fills from a non-SP_CFB_ENDPOINT instance",
    !!(popKey && popKey.value),
    JSON.stringify(popKey)
  );
  const paramKey = (mv.sliceKeys || []).find((sk) => sk.dimension === "ParameterDimension");
  check(
    "PROBE: ParameterDimension sliceKey fills from SP_PARAMETER binding",
    !!(paramKey && paramKey.value),
    JSON.stringify(paramKey)
  );
}
```

- [ ] **Step 2: Run to verify the probe fails**

```bash
cd /Volumes/External/skunk/analysis-concepts
node smartphrase/tools/verify.mjs
```

Expected: FAIL, exit 1, with both `PROBE:` assertions listed — `Population sliceKey` and `ParameterDimension sliceKey` are `null` because `bindingConceptId` looks for `SP_POPULATION`'s value via the hardcoded OID path but `constructModelView` resolves the parameter only from `SP_CFB_ENDPOINT`. (The Population probe may pass since `SP_POPULATION` is hardcoded too; the ParameterDimension one must fail. If both pass, the probe is not exercising the coupling — bind the parameter through a different phrase and retry.)

- [ ] **Step 3: Replace the hardcoded lookups with slot-driven helpers**

In `smartphrase/demo/engine.js`, replace `bindingConceptId` (currently at lines 204-208) with both the original function (still used by `constructModelView` for value slots) and the new collector:

```js
  function bindingConceptId(instance, phraseOid, phName) {
    var pi = instance.phrases.find(function (p) { return p.phrase === phraseOid; });
    if (!pi || !pi.bindings[phName]) return null;
    return pi.bindings[phName].concept || pi.bindings[phName].method || pi.bindings[phName].value || null;
  }

  /*
   * Every concept the instance binds, as { slot, id, c, role }, ordered by the
   * library's role order so the endpoint-role binding wins when two phrases
   * bind the same slot name (e.g. SP_CFB_ENDPOINT and SP_COVARIATE_BASELINE
   * both bind `parameter`). Slot NAMES are the join to template tokens —
   * {parameter}, {visit}, {population}, {event} — so no phrase OID is
   * hardcoded and a new endpoint phrase works with no engine change.
   */
  function boundConcepts(ctx, instance) {
    var order = ctx.lib.roleDefinitions.order;
    var out = [];
    instance.phrases.forEach(function (pi) {
      var def = phraseDef(ctx, pi.phrase);
      var role = def ? def.role : null;
      Object.keys(pi.bindings || {}).forEach(function (slot) {
        var b = pi.bindings[slot];
        if (!b || !b.concept) return;
        var c = concept(ctx, b.concept);
        if (c) out.push({ slot: slot, id: b.concept, c: c, role: role });
      });
    });
    out.sort(function (a, b) {
      return order.indexOf(a.role) - order.indexOf(b.role);
    });
    return out;
  }

  /* Display value for a bound concept: populations read as names, everything
     else as short labels. Matches the pre-generalisation behaviour exactly. */
  function conceptDisplay(c) {
    return c.kind === "Population" ? c.name : c.label;
  }

  /*
   * Study-variable expression per method. The method's own
   * formula.default_expression is input-name shaped ("response ~ covariate +
   * fixed_effect"); rendering it in study variables needs the template's
   * measure→variable mapping, which the library does not yet carry, so this
   * dispatches on method and falls back to the generic expression.
   * TODO(upstream): replace with a formula resolver once measures declare
   * their ADaM variable, per DESIGN.md "deliberately out of scope".
   */
  var EXPRESSION_BUILDERS = {
    "M.ANCOVA": function (ctx, instance) {
      var terms = ["TRTP"];
      if (instance.phrases.some(function (p) { return p.phrase === "SP_COVARIATE_BASELINE"; })) terms.push("BASE");
      if (instance.phrases.some(function (p) { return p.phrase === "SP_COVARIATE_SITE"; })) terms.push("SITEGR1");
      return "CHG ~ " + terms.join(" + ");
    },
    "M.KaplanMeier": function () {
      return "Surv(AVAL, 1-CNSR) ~ TRTP";
    }
  };

  function resolvedExpressionFor(ctx, instance, tpl, m) {
    var builder = EXPRESSION_BUILDERS[tpl.usesMethod];
    if (builder) return builder(ctx, instance, tpl);
    return (m && m.formula && m.formula.default_expression) || null;
  }
```

- [ ] **Step 4: Rewrite `constructModelView`'s substitution, sliceKeys and expression**

Replace the body of `constructModelView` from the `var paramId = …` line through `var resolvedExpression = …` (currently lines 221-271) with:

```js
    var bound = boundConcepts(ctx, instance);

    /* Slot-name-keyed substitution for slice constraint tokens. */
    var subst = {};
    bound.forEach(function (bc) {
      var tok = "{" + bc.slot + "}";
      if (subst[tok] === undefined) subst[tok] = conceptDisplay(bc.c);
    });
    if (instance.baselineVisit) {
      var baseVisit = concept(ctx, instance.baselineVisit);
      subst["{baseline_visit}"] = baseVisit ? baseVisit.label : "⟨baseline_visit⟩";
    }
    function fill(s) {
      return Object.keys(subst).reduce(function (acc, k) { return acc.split(k).join(subst[k]); }, s);
    }

    /* A sliceKey dimension is matched by the bound concept's conceptCategory
       (ParameterDimension, VisitDimension, EventDimension) or its kind
       (Population, Treatment). */
    var sliceKeys = (tpl.sliceKeys || []).map(function (sk) {
      var hit = bound.find(function (bc) {
        return bc.c.conceptCategory === sk.dimension || bc.c.kind === sk.dimension;
      });
      return {
        dimension: sk.dimension,
        source: sk.source,
        value: hit ? { concept: hit.id, label: conceptDisplay(hit.c), iri: hit.c.iri } : null
      };
    });

    var slices = ((tpl.inputDataStructure || {}).slices || []).map(function (sl) {
      return {
        name: sl.name,
        constraints: sl.constraints.map(function (c) {
          return { dimension: c.dimension, value: fill(c.value) };
        })
      };
    });

    var confLevel = bindingConceptId(instance, "SP_CONFIDENCE_LEVEL", "conf_level");

    var configurationValues = (tpl.methodConfigurations || []).map(function (mc) {
      return { configurationName: mc.configurationName, value: mc.value, from: "template" };
    });
    if (confLevel) {
      /* Round: 1 - 90/100 is 0.09999999999999998 in IEEE 754. */
      var alpha = Math.round((1 - Number(confLevel) / 100) * 1000) / 1000;
      configurationValues.push({
        configurationName: "alpha",
        value: String(alpha),
        from: "SP_CONFIDENCE_LEVEL"
      });
    }

    var resolvedExpression = resolvedExpressionFor(ctx, instance, tpl, m);
```

Then delete the now-unused `hasConf`, `hasSite`, `hasBaseCov`, `param`/`visit`/`pop`/`paramId`/`visitId`/`popId` locals and the old `terms` block. Leave the `return { … }` object exactly as it is.

- [ ] **Step 5: Rewrite `buildTrace`'s token derivation**

Replace the body of `buildTrace` between the `if (!tplChain) return null;` line and the closing `return tplChain.map(…)` (currently lines 302-323) with:

```js
    var bound = boundConcepts(ctx, instance);

    /* Each bound concept contributes its `data` keys as tokens — {dataset},
       {file}, {paramcd}, {avisitn}, {flag}, {aval}, {cnsr}, … — in role order,
       so the endpoint concept's data wins on any key collision. Label tokens
       are derived from the concept's position in the model, not its phrase. */
    var tokens = {};
    bound.forEach(function (bc) {
      Object.keys(bc.c.data || {}).forEach(function (k) {
        var tok = "{" + k + "}";
        if (tokens[tok] === undefined) tokens[tok] = String(bc.c.data[k]);
      });
    });
    bound.forEach(function (bc) {
      if (bc.role === "endpoint" || bc.role === "parameter") {
        if (tokens["{paramLabel}"] === undefined) tokens["{paramLabel}"] = bc.c.label;
        if (tokens["{eventLabel}"] === undefined) tokens["{eventLabel}"] = bc.c.label;
      }
      if (bc.c.conceptCategory === "VisitDimension" && tokens["{visitLabel}"] === undefined) {
        tokens["{visitLabel}"] = bc.c.label;
      }
      if (bc.c.kind === "Population" && tokens["{popName}"] === undefined) {
        tokens["{popName}"] = bc.c.name;
      }
    });

    function fill(s) {
      if (typeof s !== "string") return s;
      return Object.keys(tokens).reduce(function (acc, k) { return acc.split(k).join(tokens[k]); }, s);
    }
```

- [ ] **Step 6: Run — probe should pass, and exactly one golden should change**

```bash
node smartphrase/tools/verify.mjs
```

Expected: the two `PROBE:` assertions now pass. Goldens for `*/modelView` change **only** in `configurationValues` alpha — `"0.050000000000000044"` becomes `"0.05"`. Any other golden change is a regression: investigate before proceeding. In particular every `sentence/*`, `macro`, `jsonld` and `trace/*` golden must be untouched.

- [ ] **Step 7: Accept the intended alpha fix and re-pin**

```bash
node smartphrase/tools/verify.mjs --update-goldens
node smartphrase/tools/verify.mjs
node -e "const g=require('./smartphrase/tools/goldens.json'); console.log(JSON.stringify(g['CDISCPILOT01/AC.PRIMARY.ADASCOG/modelView'].configurationValues));"
```

Expected: PASS, and the alpha entry reads `"0.05"`.

- [ ] **Step 8: Remove the temporary probe**

Delete the `/* ---- TEMPORARY PROBE (Task 4) ---- */` block from `verify.mjs`. Its job was to fail before the change; the real coverage arrives with the PrE0102 instances in Task 6.

```bash
node smartphrase/tools/verify.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add smartphrase/demo/engine.js smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "$(cat <<'EOF'
Generalise engine off ANCOVA-specific phrase OIDs and formula

constructModelView and buildTrace located their inputs by hardcoded phrase
OID (SP_CFB_ENDPOINT/SP_TIMEPOINT/SP_POPULATION), matched only three slice
dimensions, and built the model formula as a literal "CHG ~ ..." string, so a
time-to-event template could not be instantiated.

Now slot-name-driven: boundConcepts() collects bound concepts in library role
order (so an endpoint-role binding wins over a covariate binding on the same
slot name), slice constraint tokens resolve by slot name ({parameter},
{visit}, {population}, {event}), sliceKey dimensions match on the concept's
conceptCategory or kind, and trace tokens come from each concept's own data
map. Study-variable expressions dispatch on method; M.ANCOVA reproduces the
previous string byte-for-byte.

Also fixes a pre-existing float artifact: alpha from a 95% confidence level
rendered as "0.050000000000000044". Now rounded to 3dp. This is the only
intended golden change.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The proposed `T.PFS_KaplanMeier` template

The SAP's PFS analysis (§7.7.2) is descriptive — Kaplan-Meier medians and 90% CIs by arm, no test — so upstream `T.OS_LogRank` (which outputs `chi_squared_test_result`) does not fit. Author a descriptive KM template. It does **not** exist on `methods_02`, so it goes in a separate overlay file rather than the generated subset, flagged as proposed.

**Files:**
- Create: `smartphrase/demo/data/acdc-library-proposed.js`
- Modify: `smartphrase/demo/engine.js` (merge overlay in `ctxOf`)
- Modify: `smartphrase/demo/index.html:293-296` (load the overlay before `engine.js`)
- Modify: `smartphrase/tools/verify.mjs` (load the overlay)

**Interfaces:**
- Consumes: `M.KaplanMeier` from Task 3; phrases `SP_TTE_ENDPOINT`, `SP_POPULATION`, `SP_GROUPING`, `SP_METHOD_KM`, `SP_CONFIDENCE_LEVEL`, `SP_STRATIFICATION` (all already in the v0.7 subset).
- Produces: `globalThis.ACDC_LIBRARY_PROPOSED` with `{ provenance, transformations: [...] }`. After `ctxOf`, `E.templateDef(ctx, "T.PFS_KaplanMeier")` resolves and carries `proposed: true`.

- [ ] **Step 1: Write the overlay file**

Create `smartphrase/demo/data/acdc-library-proposed.js`:

```js
/*
 * PROPOSED library additions — NOT yet upstream on methods_02.
 *
 * acdc-library.js is a generated verbatim subset of methods_02@ffee5df and
 * must not be hand-edited. Entities authored for this PoC live here instead,
 * carry proposed: true, and are badged in the demo UI so no viewer mistakes
 * them for released library content.
 *
 * Upstreaming path: submit to methods_02 as a v0.7.x minor addition, then
 * widen SELECT_* in tools/build-library-subset.mjs and delete from here.
 */
(function (g) {
  g.ACDC_LIBRARY_PROPOSED = {

    provenance: {
      status: "proposed",
      authored_for: "issue #9 — breast cancer worked example (PrE0102)",
      not_in: "methods_02@ffee5df",
      rationale: "The SAP's PFS analysis is descriptive (median + CI by arm). " +
                 "Upstream T.OS_LogRank is a hypothesis test (outputs " +
                 "chi_squared_test_result) and does not fit; no descriptive " +
                 "Kaplan-Meier template exists in v0.7."
    },

    transformations: [
      {
        "conceptId": "T.PFS_KaplanMeier",
        "label": "Time-to-Event Kaplan-Meier Summary",
        "shortLabel": "TTE KM",
        "transformationType": "analysis",
        "description": "Descriptive Kaplan-Meier summary of a time-to-event endpoint by treatment group: median time to event with confidence limits, plus the survival function and event counts. No hypothesis test.",
        "usesMethod": "M.KaplanMeier",
        "methodConfigurations": [
          { "configurationName": "conf_type", "value": "log-log" }
        ],
        "inputDataStructure": {
          "dimensions": [
            { "input": "fixed_effect", "concept": "Treatment" },
            { "concept": "Subject" },
            { "conceptCategory": "EventDimension" },
            { "concept": "Population" }
          ],
          "measures": [
            {
              "input": "time",
              "concept": "TimeToEvent",
              "requiredValueType": "Quantity",
              "slice": "endpoint",
              "description": "Time from randomization to event or censoring."
            },
            {
              "input": "event",
              "concept": "Flag",
              "requiredValueType": "boolean",
              "slice": "endpoint",
              "description": "Event indicator; censoring is its complement."
            }
          ],
          "slices": [
            {
              "name": "endpoint",
              "description": "Time-to-event records for this event definition in the chosen population.",
              "constraints": [
                { "dimension": "EventDimension", "value": "{event}" },
                { "dimension": "Population", "value": "{population}" }
              ]
            }
          ]
        },
        "outputDataStructure": {
          "dimensions": [
            { "concept": "Treatment" },
            { "conceptCategory": "EventDimension" },
            { "concept": "Population" }
          ],
          "measures": [
            { "output": "median_survival", "concept": "MedianSurvival" },
            { "output": "survival_table", "concept": "SurvivalFunction" },
            { "output": "event_summary", "concept": "EventSummary" }
          ]
        },
        "sliceKeys": [
          { "dimension": "EventDimension", "source": "event" },
          { "dimension": "Population", "source": "population" }
        ],
        "validSmartPhrases": [
          "SP_TTE_ENDPOINT",
          "SP_POPULATION",
          "SP_GROUPING",
          "SP_METHOD_KM",
          "SP_CONFIDENCE_LEVEL",
          "SP_STRATIFICATION"
        ]
      }
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 2: Verify every declared output exists on `M.KaplanMeier`**

The template's `outputDataStructure.measures` must name real method outputs (the `summarizedByOutputClass` hook):

```bash
cd /Volumes/External/skunk/analysis-concepts
git show ffee5df:lib/methods/analyses/M_KaplanMeier.json | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  console.log(JSON.parse(s).outputs.map(o=>o.name).join(', '));
});"
```

Expected: a list containing `event_summary`, `survival_table`, `median_survival`. If a name differs, correct the template to match the method — never the reverse.

- [ ] **Step 3: Merge the overlay in `ctxOf`**

In `smartphrase/demo/engine.js`, replace `ctxOf` (lines 12-14):

```js
  /*
   * Build the evaluation context. Proposed library additions (not yet upstream
   * on methods_02) are merged over the generated subset here, tagged
   * proposed: true so the UI can badge them. The generated subset is never
   * mutated — the merge produces a new lib object.
   */
  function ctxOf(lib, graph, i18n, proposed) {
    var merged = lib;
    var pro = proposed || (typeof g !== "undefined" ? g.ACDC_LIBRARY_PROPOSED : null);
    if (pro) {
      merged = Object.assign({}, lib);
      merged.proposedProvenance = pro.provenance;
      if (pro.transformations && pro.transformations.length) {
        merged.transformations = lib.transformations.concat(
          pro.transformations.map(function (t) {
            return Object.assign({}, t, { proposed: true });
          })
        );
      }
      if (pro.smartPhrases && pro.smartPhrases.length) {
        merged.smartPhrases = lib.smartPhrases.concat(
          pro.smartPhrases.map(function (p) {
            return Object.assign({}, p, { proposed: true });
          })
        );
      }
    }
    return { lib: merged, graph: graph, i18n: i18n || null };
  }
```

- [ ] **Step 4: Load the overlay in both hosts**

In `smartphrase/demo/index.html`, insert after the `acdc-library.js` script tag (line 293):

```html
<script src="data/acdc-library-proposed.js"></script>
```

In `smartphrase/tools/verify.mjs`, insert after `load("data/acdc-library.js");`:

```js
load("data/acdc-library-proposed.js");
```

- [ ] **Step 5: Add the assertion that the proposed template resolves and is well-formed**

In `verify.mjs`, immediately before the `/* ---- compare or update ---- */` block:

```js
/* ---- proposed library additions ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const tpl = E.templateDef(ctx, "T.PFS_KaplanMeier");
  check("proposed template T.PFS_KaplanMeier resolves", !!tpl);
  if (tpl) {
    check("proposed template is flagged proposed", tpl.proposed === true);
    check("proposed template's method is in the subset", !!LIB.methods[tpl.usesMethod]);
    const methodOutputs = LIB.methods[tpl.usesMethod].outputs.map((o) => o.name);
    const declared = tpl.outputDataStructure.measures.map((m) => m.output);
    const unknown = declared.filter((o) => methodOutputs.indexOf(o) === -1);
    check("proposed template declares only real method outputs", unknown.length === 0, unknown.join(", "));
    const unknownPhrases = tpl.validSmartPhrases.filter((oid) => !E.phraseDef(ctx, oid));
    check("proposed template's validSmartPhrases all exist", unknownPhrases.length === 0, unknownPhrases.join(", "));
  }
  check(
    "generated subset is not mutated by the overlay",
    LIB.transformations.every((t) => t.conceptId !== "T.PFS_KaplanMeier")
  );
}
```

- [ ] **Step 6: Run**

```bash
node smartphrase/tools/verify.mjs
```

Expected: PASS with the five new proposed-template assertions, and **no golden changes** — the overlay adds a template nothing instantiates yet.

- [ ] **Step 7: Commit**

```bash
git add smartphrase/demo/data/acdc-library-proposed.js smartphrase/demo/engine.js \
        smartphrase/demo/index.html smartphrase/tools/verify.mjs
git commit -m "$(cat <<'EOF'
Add proposed T.PFS_KaplanMeier template in a separate overlay

The PrE0102 SAP's PFS analysis is descriptive (median + 90% CI by arm);
upstream T.OS_LogRank is a hypothesis test and does not fit, and v0.7 has no
descriptive Kaplan-Meier template. Authored one here.

It lives in acdc-library-proposed.js, not the generated subset, so
acdc-library.js keeps its verbatim methods_02@ffee5df provenance. ctxOf merges
the overlay and tags entries proposed: true for UI badging; the generated
object is never mutated. Outputs are checked against M.KaplanMeier's declared
outputs (median_survival, survival_table, event_summary).

Goldens unchanged — nothing instantiates it yet.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The PrE0102 study layer

Add the breast-cancer study graph — `Event`-kind concepts (a first for the demo), method grounding for `M.KaplanMeier`, four instances of the one new template, and time-to-event trace chains. Study graphs move behind a registry so both studies coexist.

**Files:**
- Create: `smartphrase/demo/data/study-graph-pre0102.js`
- Modify: `smartphrase/demo/data/study-graph.js:12-13` and its closing lines (register instead of assigning a bare global)
- Modify: `smartphrase/demo/index.html` (load the new file)
- Modify: `smartphrase/tools/verify.mjs` (load the new file)

**Interfaces:**
- Consumes: `T.PFS_KaplanMeier` (Task 5); slot-driven engine (Task 4).
- Produces: `globalThis.STUDY_GRAPHS = { CDISCPILOT01: {...}, PRE0102: {...} }`, each value the same shape `engine.js` already expects (`prefixes`, `study`, `concepts`, `methodGrounding`, `instances`, `traceTemplates`). `globalThis.STUDY_GRAPH` is kept as an alias to `CDISCPILOT01` so nothing that referenced it breaks.

- [ ] **Step 1: Convert `study-graph.js` to register into `STUDY_GRAPHS`**

In `smartphrase/demo/data/study-graph.js`, replace line 13 (`g.STUDY_GRAPH = {`) with:

```js
  g.STUDY_GRAPHS = g.STUDY_GRAPHS || {};
  g.STUDY_GRAPHS.CDISCPILOT01 = {
```

and change the final lines (255-256) from:

```js
  };
})(typeof window !== "undefined" ? window : globalThis);
```

to:

```js
  };
  /* Back-compat alias: the original single-study global. */
  g.STUDY_GRAPH = g.STUDY_GRAPHS.CDISCPILOT01;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 2: Run to confirm the registry refactor changed nothing**

```bash
cd /Volumes/External/skunk/analysis-concepts
node smartphrase/tools/verify.mjs
```

Expected: PASS, no golden changes. The harness already prefers `STUDY_GRAPHS` when present, so it now iterates the registry and finds the same single study.

- [ ] **Step 3: Resolve the STATO term for Kaplan-Meier before grounding it**

Do not invent an IRI. Check STATO for a Kaplan-Meier estimation term:

```bash
grep -rn "KaplanMeier\|Kaplan-Meier\|kaplan" /Volumes/External/skunk/analysis-concepts/lib/vocabulary/ 2>/dev/null | head
git -C /Volumes/External/skunk/analysis-concepts grep -n -i "kaplan" ffee5df -- lib model | head
```

If a STATO id is found upstream, use it with `iri_status: "authoritative"`. If not, use `iri: "acdc:method/KaplanMeier"` with `iri_status: "illustrative"` and record it in the Task 9 docs as an identifier the working group must resolve. **Do not** guess a `STATO_00003xx` number.

- [ ] **Step 4: Write the PrE0102 study graph**

Create `smartphrase/demo/data/study-graph-pre0102.js`. Substitute the IRI decided in step 3 where marked:

```js
/*
 * Study-level graph — PrECOG PrE0102 (metastatic breast cancer).
 *
 * Second worked study for the smartphrase demo. Source document:
 * smartphrase/SAP/ (PrE0102 Final SAP, 24 March 2014). Prose encoded here is
 * the PFS primary analysis: SAP sections 3.1 (primary objective), 5.3 (efficacy
 * measurement definitions) and 7.7.2 (PFS/TTP/OS methodology).
 *
 * This is the ILLUSTRATIVE layer, same policy as the CDISC Pilot graph: ground
 * into existing standards where a term covers the entity, flag everything else
 * iri_status: "illustrative". The library layer is NOT defined here.
 *
 * Note the analysis is DESCRIPTIVE — SAP 7.7.2 asks for Kaplan-Meier medians
 * with 90% confidence intervals by arm. There is no log-rank test, no p-value
 * and no alpha anywhere in the 36-page source document.
 */
(function (g) {
  g.STUDY_GRAPHS = g.STUDY_GRAPHS || {};
  g.STUDY_GRAPHS.PRE0102 = {

    prefixes: {
      acdc:  "https://w3id.org/cdisc/ac-dc/",
      usdm:  "https://ddf.cdisc.org/usdm/v4/",
      ars:   "https://www.cdisc.org/standards/foundational/ars/1-0/",
      stato: "http://purl.obolibrary.org/obo/",
      ncit:  "http://purl.obolibrary.org/obo/NCIT_",
      qb:    "http://purl.org/linked-data/cube#"
    },

    study: {
      studyId: "PRE0102",
      title: "Randomized, Double-Blind, Placebo-Controlled Phase II Trial of Fulvestrant (Faslodex) plus Everolimus in Post-Menopausal Patients with Hormone-Receptor Positive Metastatic Breast Cancer Resistant to Aromatase Inhibitor Therapy",
      iri: "usdm:Study/PRE0102", iri_status: "illustrative",
      sapSource: "smartphrase/SAP/ — PrE0102 Final SAP, 24 March 2014"
    },

    concepts: {
      /* Event-kind concepts — required by SP_TTE_ENDPOINT's
         concept_constraint: "Event". First use of this kind in the demo. */
      "EVENT.PFS": {
        kind: "Event", conceptCategory: "EventDimension",
        label: "PFS",
        name: "progression-free survival (disease progression or death, whichever occurs first)",
        iri: "ncit:C18215", iri_status: "illustrative",
        data: { dataset: "ADTTE", file: "adtte.xpt", paramcd: "PFS",
                datasetLabel: "ADaM time-to-event analysis dataset",
                aval: "AVAL", cnsr: "CNSR" },
        sapRef: "SAP 5.3 — 'duration of time from time of randomization to time of progression or death, whichever occurs first'"
      },
      "EVENT.OS": {
        kind: "Event", conceptCategory: "EventDimension",
        label: "OS", name: "overall survival (death from any cause)",
        iri: "ncit:C16952", iri_status: "illustrative",
        data: { dataset: "ADTTE", file: "adtte.xpt", paramcd: "OS",
                datasetLabel: "ADaM time-to-event analysis dataset",
                aval: "AVAL", cnsr: "CNSR" },
        sapRef: "SAP 5.3 — 'the time from randomization until death or censored at the date of last follow-up'"
      },
      "EVENT.TTP": {
        kind: "Event", conceptCategory: "EventDimension",
        label: "TTP", name: "time to disease progression",
        iri: "acdc:event/TimeToProgression", iri_status: "illustrative",
        data: { dataset: "ADTTE", file: "adtte.xpt", paramcd: "TTP",
                datasetLabel: "ADaM time-to-event analysis dataset",
                aval: "AVAL", cnsr: "CNSR" },
        sapRef: "SAP 5.3 — 'the time from randomization until progression of the disease'"
      },

      "POP.EVAL_EFFICACY": {
        kind: "Population",
        label: "EFF", name: "eligible, treated",
        iri: "usdm:AnalysisPopulation/PRE0102-POP-EFF", iri_status: "illustrative",
        data: { flag: "EFFIFL" },
        sapRef: "SAP 7.2 — 'Evaluable for efficacy: The primary efficacy analysis will be done including eligible, treated subjects.'"
      },
      "POP.ITT": {
        kind: "Population",
        label: "ITT", name: "intent-to-treat (all subjects as randomized)",
        iri: "usdm:AnalysisPopulation/PRE0102-POP-ITT", iri_status: "illustrative",
        data: { flag: "ITTFL" },
        sapRef: "SAP 7.2 — 'Intent-to-treat (ITT) analysis population includes all subjects as randomized.'"
      },

      "TRT.PRE0102": {
        kind: "Treatment",
        label: "treatment",
        name: "fulvestrant plus everolimus and fulvestrant plus placebo",
        iri: "usdm:StudyArm/PRE0102-ARM-SET", iri_status: "illustrative",
        data: { variable: "TRTP" },
        sapRef: "SAP 4.1 — randomized 1:1 to everolimus or placebo, both with fulvestrant"
      }
    },

    methodGrounding: {
      /* STEP 3 DECISION GOES HERE — replace iri/iri_status with the STATO term
         if one was found, otherwise leave as the illustrative AC/DC id. */
      "M.KaplanMeier": {
        label: "Kaplan-Meier", name: "Kaplan-Meier estimation",
        iri: "acdc:method/KaplanMeier", iri_status: "illustrative",
        ars: "ars:method/MTH-KM-TTE", ars_status: "illustrative"
      }
    },

    /*
     * Four instances, ONE template (T.PFS_KaplanMeier). Within-study reuse:
     * the endpoint event varies (PFS / OS / TTP) and the population varies
     * (the SAP's own ITT sensitivity analysis). Cross-study reuse: this study
     * and the CDISC Pilot share one library, different templates.
     */
    instances: [
      {
        id: "AC.PRIMARY.PFS",
        iri: "acdc:instance/PRE0102-AC-PRIMARY-PFS",
        label: "Primary efficacy analysis — PFS",
        template: "T.PFS_KaplanMeier",
        usdmObjective: {
          iri: "usdm:Objective/PRE0102-OBJ-PRIMARY-1", iri_status: "illustrative",
          text: "To assess progression-free survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone."
        },
        arsAnalysis: { iri: "ars:analysis/PRE0102-AN-7.07.02-PFS", iri_status: "illustrative" },
        sentenceRole: "the primary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.PFS", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "name" } } },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } } }
        ]
      },
      {
        id: "AC.SENS.PFS.ITT",
        iri: "acdc:instance/PRE0102-AC-SENS-PFS-ITT",
        label: "Sensitivity analysis — PFS, ITT population",
        template: "T.PFS_KaplanMeier",
        usdmObjective: {
          iri: "usdm:Objective/PRE0102-OBJ-PRIMARY-1", iri_status: "illustrative",
          text: "To assess progression-free survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone."
        },
        arsAnalysis: { iri: "ars:analysis/PRE0102-AN-7.07.02-PFS-ITT", iri_status: "illustrative" },
        sentenceRole: "a sensitivity analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.PFS", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.ITT", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "name" } } },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } } }
        ]
      },
      {
        id: "AC.SEC.OS",
        iri: "acdc:instance/PRE0102-AC-SEC-OS",
        label: "Secondary analysis — overall survival",
        template: "T.PFS_KaplanMeier",
        usdmObjective: {
          iri: "usdm:Objective/PRE0102-OBJ-SECONDARY-1", iri_status: "illustrative",
          text: "To describe the safety profile, objective response rate, time to progression and overall survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone."
        },
        arsAnalysis: { iri: "ars:analysis/PRE0102-AN-7.07.02-OS", iri_status: "illustrative" },
        sentenceRole: "a secondary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.OS", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "name" } } },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } } }
        ]
      },
      {
        id: "AC.SEC.TTP",
        iri: "acdc:instance/PRE0102-AC-SEC-TTP",
        label: "Secondary analysis — time to progression",
        template: "T.PFS_KaplanMeier",
        usdmObjective: {
          iri: "usdm:Objective/PRE0102-OBJ-SECONDARY-1", iri_status: "illustrative",
          text: "To describe the safety profile, objective response rate, time to progression and overall survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone."
        },
        arsAnalysis: { iri: "ars:analysis/PRE0102-AN-7.07.02-TTP", iri_status: "illustrative" },
        sentenceRole: "a secondary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.TTP", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "name" } } },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } } }
        ]
      }
    ],

    /*
     * Trace tiers. Keyed by phrase role, same as the CDISC Pilot graph — but
     * the endpoint chain is time-to-event shaped: no analysis visit, and the
     * censoring flag travels with the analysis value.
     */
    traceTemplates: {
      endpoint: [
        { tier: "DataConcept", id: "DC.TTE", label: "Time to Event",
          iri: "acdc:dc/TimeToEvent", iri_status: "illustrative",
          note: "Elapsed time from the time-origin (randomization) to the event or to censoring. Paired with an event/censoring indicator." },
        { tier: "ADaM Class Variable", id: "{aval}", label: "Analysis Value (time to event)",
          dataStructure: "BDS (time-to-event)",
          note: "Time-to-event analysis value; {cnsr} carries the censoring indicator (0 = event, 1 = censored), ADaMIG v1.3." },
        { tier: "Study variable", id: "{dataset}.{aval}", label: "{aval} in {dataset}",
          whereClause: "PARAMCD = '{paramcd}'",
          note: "{eventLabel} record; censoring in {dataset}.{cnsr}." },
        { tier: "Physical dataset", id: "{dataset}", label: "{datasetLabel}",
          file: "{file}", keys: ["USUBJID", "PARAMCD"],
          note: "One record per subject per time-to-event parameter." }
      ],
      grouping: [
        { tier: "DataConcept", id: "DC.TRT", label: "Planned Treatment",
          iri: "acdc:dc/PlannedTreatment", iri_status: "illustrative", usdm: "usdm:StudyArm" },
        { tier: "ADaM Class Variable", id: "TRTP", label: "Planned Treatment",
          dataStructure: "ADSL", note: "Subject-level treatment assignment." },
        { tier: "Study variable", id: "ADSL.TRTP", label: "TRTP in ADSL",
          note: "Fulvestrant + everolimus / fulvestrant + placebo." },
        { tier: "Physical dataset", id: "ADSL", label: "Subject-Level Analysis Dataset",
          file: "adsl.xpt", keys: ["USUBJID"], note: "One record per subject." }
      ],
      population: [
        { tier: "DataConcept", id: "DC.POP", label: "Analysis Population",
          iri: "acdc:dc/AnalysisPopulation", iri_status: "illustrative", usdm: "usdm:AnalysisPopulation" },
        { tier: "ADaM Class Variable", id: "{flag}", label: "Population Flag",
          dataStructure: "ADSL", note: "Population indicator variable." },
        { tier: "Study variable", id: "ADSL.{flag}", label: "{flag} in ADSL",
          whereClause: "{flag} = 'Y'", note: "Subjects in the {popName} analysis set." },
        { tier: "Physical dataset", id: "ADSL", label: "Subject-Level Analysis Dataset",
          file: "adsl.xpt", keys: ["USUBJID"] }
      ]
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 5: Load it in both hosts**

In `smartphrase/demo/index.html`, after the `study-graph.js` tag:

```html
<script src="data/study-graph-pre0102.js"></script>
```

In `smartphrase/tools/verify.mjs`, after `load("data/study-graph.js");`:

```js
load("data/study-graph-pre0102.js");
```

- [ ] **Step 6: Run — all four PrE0102 instances must resolve and trace cleanly**

```bash
node smartphrase/tools/verify.mjs
```

Expected: PASS. New goldens are reported as `new golden (not yet pinned)` for every `PRE0102/*` key. All CDISCPILOT01 goldens unchanged. Every assertion green — in particular no unfilled `⟨…⟩` tokens in any PrE0102 trace, both sliceKeys filled on all four instances, and byte-equal macro round-trips.

If `sliceKeys` shows a null for `EventDimension`, the engine's dimension match isn't seeing `conceptCategory: "EventDimension"` — recheck Task 4 step 4. If a trace shows `⟨aval⟩`, the concept's `data` map is missing that key.

- [ ] **Step 7: Read the generated PFS sentence and sanity-check it against the SAP**

```bash
node -e "
const fs=require('fs'),vm=require('vm'),p='smartphrase/demo/';
['data/acdc-library.js','data/acdc-library-proposed.js','data/study-graph.js','data/study-graph-pre0102.js','data/lang-overlay.js','engine.js'].forEach(f=>vm.runInThisContext(fs.readFileSync(p+f,'utf8')));
const E=SP_ENGINE, ctx=E.ctxOf(ACDC_LIBRARY, STUDY_GRAPHS.PRE0102, LANG_OVERLAY);
STUDY_GRAPHS.PRE0102.instances.forEach(i=>console.log('-', E.resolveInstance(ctx,i).sentence));
"
```

Expected: four sentences. The primary should read close to: *"Time to progression-free survival (disease progression or death, whichever occurs first) (PFS) in the eligible, treated population comparing treatment groups using Kaplan-Meier estimation with 90% confidence intervals will be assessed as the primary analysis."*

**Judgement call required here.** `SP_TTE_ENDPOINT`'s template is `"time to {event}"`, so a `name_with_label` render of PFS produces a clumsy doubled construction ("time to progression-free survival … (PFS)"). Fix by changing the instance's render mode to `label` (giving "time to PFS") or by rewording the concept's `name` to a bare event phrase (e.g. `name: "disease progression or death"`, so it reads "time to disease progression or death (PFS)"). Prefer the latter — it keeps a rich render mode and reads like the SAP. Adjust `EVENT.*` names, re-run step 7, and confirm all four read naturally before pinning.

- [ ] **Step 8: Pin the new goldens**

```bash
node smartphrase/tools/verify.mjs --update-goldens
node smartphrase/tools/verify.mjs
git diff --stat smartphrase/tools/goldens.json
```

Expected: PASS; the diff shows only additions (`PRE0102/*` keys), no modifications to `CDISCPILOT01/*`.

- [ ] **Step 9: Commit**

```bash
git add smartphrase/demo/data/study-graph.js smartphrase/demo/data/study-graph-pre0102.js \
        smartphrase/demo/index.html smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "$(cat <<'EOF'
Add PrE0102 breast cancer study layer

Second worked study, encoding the SAP's PFS primary analysis (sections 3.1,
5.3, 7.7.2 of smartphrase/SAP/). Four instances of the single new
T.PFS_KaplanMeier template: PFS primary, PFS on ITT (the SAP's own
sensitivity analysis), OS and TTP secondaries — within-study reuse varying
the event and the population.

Introduces Event-kind concepts (required by SP_TTE_ENDPOINT) and a
time-to-event trace chain: DC.TTE -> AVAL -> ADTTE.AVAL where PARAMCD='PFS'
-> adtte.xpt, with CNSR travelling alongside. Study graphs now live behind a
STUDY_GRAPHS registry; STUDY_GRAPH remains an alias to CDISCPILOT01.

Every concept carries a sapRef quoting the source sentence it came from.
Kaplan-Meier method grounding is illustrative pending a resolved STATO term.

CDISC Pilot goldens unchanged.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Multi-study demo UI

The page is single-study and ANCOVA-shaped: `renderModelPanel` hardcodes three concept fields and a fixed optional-phrase list, `editHTML` hardcodes which phrases can't be removed, `renderReuse` diffs every instance against `GRAPH.instances[0]`, and the document shell has one hardcoded title. Make it template- and study-driven.

**Files:**
- Modify: `smartphrase/demo/index.html` — study switch (new markup + wiring), `renderModelPanel` (474-563), `editHTML` (566-595), `renderReuse` (~670-700), `renderStandards` (~705-740), `renderAll` (~740-780), stop 1/3 lede text (177-292)

**Interfaces:**
- Consumes: `STUDY_GRAPHS`, `E.templateDef(ctx, state.template).validSmartPhrases`, `tpl.proposed`, `LIB.proposedProvenance`.
- Produces: a `switchStudy(key)` function that rebuilds `ctx`/`GRAPH`/`state` and re-renders; a model panel derived from the active template; a reuse grid grouped per study.

- [ ] **Step 1: Add the study switch markup**

In `smartphrase/demo/index.html`, inside the stop 1 `<section>` just above `<p class="prose" id="prose1"></p>`, add:

```html
<div class="studyswitch" id="studySwitch" style="display:flex;gap:6px;align-items:center;margin:0 0 10px;flex-wrap:wrap;">
  <span style="font-size:12.5px;color:var(--muted);">Study:</span>
</div>
```

- [ ] **Step 2: Wire the switch and make `ctx`/`GRAPH`/`state` reassignable**

Find the top of the demo IIFE where `ctx`, `GRAPH`, `LIB` and `state` are initialised (around line 298-315). Change those bindings to `var` (if any are effectively fixed) and add below them:

```js
  var STUDY_KEYS = Object.keys(g_STUDY_GRAPHS());
  var activeStudy = STUDY_KEYS[0];

  function g_STUDY_GRAPHS() {
    return window.STUDY_GRAPHS || { CDISCPILOT01: window.STUDY_GRAPH };
  }

  function switchStudy(key) {
    activeStudy = key;
    GRAPH = g_STUDY_GRAPHS()[key];
    ctx = E.ctxOf(LIB, GRAPH, I18N);
    state = clone(GRAPH.instances[0]);
    srcDirty = false;
    hidePop(true);
    buildStudySwitch();
    renderAll();
  }

  function buildStudySwitch() {
    var sw = document.getElementById("studySwitch");
    sw.querySelectorAll("button").forEach(function (b) { b.remove(); });
    STUDY_KEYS.forEach(function (key) {
      var gph = g_STUDY_GRAPHS()[key];
      var b = document.createElement("button");
      b.className = "btn ghost" + (key === activeStudy ? " active" : "");
      b.textContent = gph.study.studyId;
      b.title = gph.study.title;
      b.addEventListener("click", function () { switchStudy(key); });
      sw.appendChild(b);
    });
  }
```

Call `buildStudySwitch();` once in the existing init sequence, before the first `renderAll()`.

- [ ] **Step 3: Make the document shell reflect the active study**

In `renderAll`, wherever `docStudy` and `docTitle` are set, replace the hardcoded values with:

```js
    document.getElementById("docStudy").textContent = GRAPH.study.studyId;
    document.getElementById("docTitle").textContent = GRAPH.study.title;
```

- [ ] **Step 4: Derive the model panel from the active template**

Replace `renderModelPanel` (lines 474-563) wholesale:

```js
  function renderModelPanel() {
    var mp = document.getElementById("modelPanel");
    mp.innerHTML = "";
    var tpl = E.templateDef(ctx, state.template);
    if (!tpl) return;

    /* Concept-valued slots of the phrases the instance currently uses, in
       library role order — one select per slot. No phrase OID is hardcoded. */
    var order = LIB.roleDefinitions.order;
    var active = state.phrases
      .map(function (pi) { return { pi: pi, def: E.phraseDef(ctx, pi.phrase) }; })
      .filter(function (x) { return !!x.def; })
      .sort(function (a, b) { return order.indexOf(a.def.role) - order.indexOf(b.def.role); });

    active.forEach(function (x) {
      (x.def.placeholders || []).forEach(function (ph) {
        if (ph.kind === "method_ref") return;
        var b = x.pi.bindings[ph.name];
        if (!b) return;

        var wrap = document.createElement("div"); wrap.className = "fld";
        var lab = document.createElement("label");
        var roleLabel = ROLE_LABELS[x.def.role] ? ROLE_LABELS[x.def.role].label : x.def.role;
        lab.innerHTML = roleLabel + " — {" + ph.name + "}" +
          ' <span class="roleTag">(' + x.def.oid + ")</span>";
        wrap.appendChild(lab);

        if (ph.kind === "value") {
          var co = LIB.configurationOptions[ph.name];
          var selV = document.createElement("select");
          (co ? co.values : [b.value]).forEach(function (v) {
            var o = document.createElement("option");
            o.value = v; o.textContent = v;
            if (String(b.value) === String(v)) o.selected = true;
            selV.appendChild(o);
          });
          selV.addEventListener("change", function () { b.value = selV.value; renderAll(); });
          wrap.appendChild(selV);
        } else {
          var sel = document.createElement("select");
          conceptOptions(ph).forEach(function (id) {
            var o = document.createElement("option");
            o.value = id;
            o.textContent = GRAPH.concepts[id].label + " — " + GRAPH.concepts[id].name;
            if (b.concept === id) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener("change", function () {
            b.concept = sel.value;
            /* Keep a baseline covariate's parameter in step with the endpoint. */
            if (x.def.role === "endpoint" && ph.name === "parameter") {
              var cov = findPhrase("SP_COVARIATE_BASELINE");
              if (cov && cov.bindings.parameter) cov.bindings.parameter.concept = sel.value;
            }
            renderAll();
          });
          wrap.appendChild(sel);

          if (ph.render_options) {
            var selR = document.createElement("select");
            selR.style.marginTop = "4px";
            ph.render_options.forEach(function (m) {
              var o = document.createElement("option");
              o.value = m; o.textContent = "render: " + m;
              if ((b.render || ph.default_render) === m) o.selected = true;
              selR.appendChild(o);
            });
            selR.addEventListener("change", function () { b.render = selR.value; renderAll(); });
            wrap.appendChild(selR);
          }
        }
        mp.appendChild(wrap);
      });
    });

    /* Optional phrases: whatever the template allows but the instance omits. */
    var used = state.phrases.map(function (p) { return p.phrase; });
    var optional = (tpl.validSmartPhrases || []).filter(function (oid) {
      return used.indexOf(oid) === -1;
    });

    var optHead = document.createElement("label");
    optHead.style.cssText = "display:block;font-size:12.5px;font-weight:600;margin:14px 0 6px;";
    optHead.textContent = "Phrases template " + tpl.conceptId + " also allows" +
      (tpl.proposed ? " (proposed template)" : "");
    mp.appendChild(optHead);

    if (!optional.length) {
      var none = document.createElement("p");
      none.style.cssText = "font-size:12.5px;color:var(--muted);margin:0;";
      none.textContent = "All permitted phrases are in use.";
      mp.appendChild(none);
    }

    optional.forEach(function (oid) {
      var def = E.phraseDef(ctx, oid);
      if (!def) return;
      var row = document.createElement("div"); row.className = "togglerow";
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = false; cb.id = "tg_" + oid;
      cb.addEventListener("change", function () {
        state.phrases.push({ phrase: oid, bindings: defaultBindingsFor(def) });
        renderAll();
      });
      var lb = document.createElement("label"); lb.htmlFor = cb.id;
      lb.style.cssText = "font-weight:400;margin:0;";
      lb.textContent = def.name + " (" + oid + ")";
      row.appendChild(cb); row.appendChild(lb);
      mp.appendChild(row);
    });
  }
```

- [ ] **Step 5: Derive removability from role, not an OID list**

In `editHTML` (line 590), replace:

```js
    var removable = ["SP_CFB_ENDPOINT", "SP_METHOD_ANCOVA"].indexOf(rp.oid) === -1;
```

with:

```js
    /* An analysis must keep an endpoint and a method; everything else is
       optional. Role-driven so new templates need no edit here. */
    var removable = ["endpoint", "method"].indexOf(rp.role) === -1;
```

- [ ] **Step 6: Group the reuse grid by study and diff within study**

In `renderReuse`, replace the single-study body so it iterates studies. The baseline for the binding diff must be the first instance **of the same study**:

```js
  function renderReuse() {
    var grid = document.getElementById("reuseGrid");
    grid.innerHTML = "";

    Object.keys(g_STUDY_GRAPHS()).forEach(function (key) {
      var gph = g_STUDY_GRAPHS()[key];
      var sctx = E.ctxOf(LIB, gph, I18N);
      var baseMv = E.constructModelView(sctx, gph.instances[0]);
      var tplIds = gph.instances.map(function (i) { return i.template; })
        .filter(function (v, i, a) { return a.indexOf(v) === i; });

      var head = document.createElement("h3");
      head.style.cssText = "grid-column:1/-1;margin:14px 0 2px;font-size:14px;";
      head.textContent = gph.study.studyId + " — " + gph.instances.length +
        " analyses, template" + (tplIds.length > 1 ? "s " : " ") + tplIds.join(", ");
      grid.appendChild(head);

      gph.instances.forEach(function (inst, idx) {
        var mv = E.constructModelView(sctx, inst);
        var res = E.resolveInstance(sctx, inst);
        var card = document.createElement("div"); card.className = "reuse-card";
        var rows = mv.sliceKeys.map(function (sk, i) {
          var baseSk = baseMv.sliceKeys[i];
          var changed = idx > 0 && baseSk && JSON.stringify(baseSk.value) !== JSON.stringify(sk.value);
          return "<tr" + (changed ? " class='diff'" : "") + "><td>" + sk.dimension +
            "</td><td>" + (sk.value ? sk.value.label : "—") + "</td></tr>";
        }).join("");
        card.innerHTML =
          "<h4>" + inst.label + "</h4>" +
          "<p class='sub' style='font-size:12px;'>" + inst.id + " · " + inst.template +
          (E.templateDef(sctx, inst.template) && E.templateDef(sctx, inst.template).proposed
            ? " <span class='badge'>proposed</span>" : "") + "</p>" +
          "<table class='slicekeys'>" + rows + "</table>" +
          "<p class='sub' style='font-size:12.5px;margin:8px 0 0;'>" + res.sentence + "</p>" +
          "<button class='btn ghost' data-open-study='" + key + "' data-open='" + idx + "'>open in editor</button>";
        grid.appendChild(card);
      });
    });

    grid.querySelectorAll("button[data-open]").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-open-study");
        if (key !== activeStudy) switchStudy(key);
        state = clone(g_STUDY_GRAPHS()[key].instances[Number(b.getAttribute("data-open"))]);
        srcDirty = false;
        renderAll();
        document.getElementById("stop2").scrollIntoView({ behavior: "smooth" });
      });
    });
  }
```

- [ ] **Step 7: Show the proposed-overlay provenance in the standards table**

In `renderStandards`, after the existing provenance note, append:

```js
    if (LIB.proposedProvenance) {
      note.innerHTML += "<br><strong>Proposed additions:</strong> " +
        LIB.proposedProvenance.authored_for + " — not in " +
        LIB.proposedProvenance.not_in + ". " + LIB.proposedProvenance.rationale;
    }
```

Also ensure the id table iterates the **active** study's concepts and instances (it already reads `GRAPH.concepts` / `GRAPH.instances`, which now follow `activeStudy` — verify by switching studies in step 9).

- [ ] **Step 8: Update the stop 1 and stop 3 lede text**

Stop 3's lede currently claims "All three analyses below instantiate the *same* library building block". Replace with wording that covers both studies, e.g.:

```html
  <p class="lede">Two studies, one library. Within each study the same building block is
  re-instantiated with different bindings; across studies a different block is drawn from the
  same library — write once, apply many. Differing slice keys are highlighted.</p>
```

Stop 1's lede should note the study switch:

```html
  <p class="hint">Hover to inspect · click to trace. Switch study above to see the same
  mechanism over a different therapeutic area. The greyed sentence frame is part of the
  document, not the model.</p>
```

- [ ] **Step 9: Manual browser check — both studies, all four stops**

```bash
open /Volumes/External/skunk/analysis-concepts/smartphrase/demo/index.html
```

Walk through and confirm, with the browser console open (must stay clean of errors):

1. Study switch shows `CDISCPILOT01` and `PRE0102`; default is CDISCPILOT01 and its prose is unchanged from before this task.
2. Switch to PRE0102 → prose becomes the PFS sentence; document title updates; hovering the `time to …` chip inspects `SP_TTE_ENDPOINT`; clicking it traces to `adtte.xpt`.
3. On PRE0102, the model panel offers event / population / treatment / confidence-level selects and lists `SP_STRATIFICATION` as an available phrase; changing the event to OS re-renders prose and trace together.
4. Stop 2 tabs: constructed model shows `T.PFS_KaplanMeier` with `Surv(AVAL, 1-CNSR) ~ TRTP`; tag source regenerates and re-applies cleanly; JSON-LD is well-formed.
5. Stop 3 shows two study groups, seven cards total, `proposed` badge on the PrE0102 cards, and "open in editor" switches study correctly.
6. Stop 4 lists PrE0102 identifiers and the proposed-additions provenance note.
7. Language switch: EN/FR/DE all render PrE0102 without `⟨…⟩` (English fallback is expected until Task 8).

- [ ] **Step 10: Re-run the harness and commit**

```bash
node smartphrase/tools/verify.mjs
git add smartphrase/demo/index.html
git commit -m "$(cat <<'EOF'
Make the demo multi-study and template-driven

The page was single-study and ANCOVA-shaped: renderModelPanel hardcoded three
concept fields and a fixed optional-phrase list, editHTML hardcoded which
phrases could not be removed, and renderReuse diffed every instance against
instances[0] regardless of study.

Now: a study switch rebuilds ctx/GRAPH/state; the model panel is derived from
the active template's phrases and their placeholders in library role order;
removability is role-driven (an analysis keeps an endpoint and a method); the
reuse grid groups by study and diffs within study; the standards table shows
the proposed-overlay provenance. Proposed templates are badged.

Verified in-browser across both studies, all four stops, three languages, no
console errors.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: FR/DE language packs for the time-to-event phrases

The demo's language switch is a headline feature. Untranslated phrases fall back to English silently, which on PrE0102 would show a mostly-English sentence under a German heading. Translate the new phrases and concepts. No new role is introduced, so the existing `sentence_template`s need no change.

**Files:**
- Modify: `smartphrase/demo/data/lang-overlay.js`

**Interfaces:**
- Consumes: phrase oids `SP_TTE_ENDPOINT`, `SP_METHOD_KM`, `SP_STRATIFICATION`; concept ids `EVENT.*`, `POP.EVAL_EFFICACY`, `POP.ITT`, `TRT.PRE0102`; method `M.KaplanMeier`; sentence role `"a sensitivity analysis"`.
- Produces: `E.resolveInstance(ctx, inst, "fr"|"de").langFallback === false` for every phrase of every PrE0102 instance.

- [ ] **Step 1: Add a harness assertion that no PrE0102 phrase falls back**

In `verify.mjs`, inside the per-instance loop, after the existing per-language resolution check:

```js
      /* Localisation completeness: every phrase must have a per-language
         template in every non-English pack (English is the source). */
      if (lang !== "en") {
        const missing = res.phrases.filter((p) => p.langFallback).map((p) => p.oid);
        check(
          `${studyKey}/${inst.id} has no untranslated phrases (${lang})`,
          missing.length === 0,
          missing.join(", ")
        );
      }
```

- [ ] **Step 2: Run to verify it fails for PrE0102**

```bash
cd /Volumes/External/skunk/analysis-concepts
node smartphrase/tools/verify.mjs
```

Expected: FAIL listing untranslated `SP_TTE_ENDPOINT`, `SP_METHOD_KM` for `fr` and `de` on all four PrE0102 instances. CDISCPILOT01 should pass (its phrases are already translated) — if it also fails, note which phrase and translate it here too.

- [ ] **Step 3: Add the French entries**

In `lang-overlay.js`, in the `fr.phrases` object add:

```js
        SP_TTE_ENDPOINT: "le délai jusqu'à {event}",
        SP_METHOD_KM: "au moyen de l'estimation de {method}",
        SP_STRATIFICATION: "stratifié selon {factor}",
```

In `fr.concepts` add (matching whatever final `name` wording Task 6 step 7 settled on):

```js
        "EVENT.PFS": { label: "SSP", name: "la progression de la maladie ou le décès" },
        "EVENT.OS": { label: "SG", name: "le décès, toutes causes confondues" },
        "EVENT.TTP": { label: "DJP", name: "la progression de la maladie" },
        "POP.EVAL_EFFICACY": { label: "EFF", name: "éligible et traitée" },
        "POP.ITT": { label: "ITT", name: "en intention de traiter (tous les sujets randomisés)" },
        "TRT.PRE0102": { label: "traitement" },
```

In `fr.methods` add:

```js
        "M.KaplanMeier": { label: "Kaplan-Meier", name: "Kaplan-Meier" }
```

In `fr.sentenceRoles` add:

```js
        "a sensitivity analysis": "une analyse de sensibilité"
```

- [ ] **Step 4: Add the German entries**

In `de.phrases`:

```js
        SP_TTE_ENDPOINT: "die Zeit bis {event}",
        SP_METHOD_KM: "mittels {method}-Schätzung",
        SP_STRATIFICATION: "stratifiziert nach {factor}",
```

In `de.concepts`:

```js
        "EVENT.PFS": { label: "PFS", name: "zur Krankheitsprogression oder zum Tod" },
        "EVENT.OS": { label: "OS", name: "zum Tod jeglicher Ursache" },
        "EVENT.TTP": { label: "TTP", name: "zur Krankheitsprogression" },
        "POP.EVAL_EFFICACY": { label: "EFF", name: "auswertbaren, behandelten Population" },
        "POP.ITT": { label: "ITT", name: "Intention-to-Treat-Population (alle randomisierten Patientinnen)" },
        "TRT.PRE0102": { label: "Behandlung" },
```

In `de.methods`:

```js
        "M.KaplanMeier": { label: "Kaplan-Meier", name: "Kaplan-Meier" }
```

In `de.sentenceRoles`:

```js
        "a sensitivity analysis": "Sensitivitätsanalyse"
```

- [ ] **Step 5: Run and read all three languages**

```bash
node smartphrase/tools/verify.mjs
node -e "
const fs=require('fs'),vm=require('vm'),p='smartphrase/demo/';
['data/acdc-library.js','data/acdc-library-proposed.js','data/study-graph.js','data/study-graph-pre0102.js','data/lang-overlay.js','engine.js'].forEach(f=>vm.runInThisContext(fs.readFileSync(p+f,'utf8')));
const E=SP_ENGINE, ctx=E.ctxOf(ACDC_LIBRARY, STUDY_GRAPHS.PRE0102, LANG_OVERLAY);
const i=STUDY_GRAPHS.PRE0102.instances[0];
['en','fr','de'].forEach(l=>console.log(l+':', E.resolveInstance(ctx,i,l).sentence));
"
```

Expected: PASS, and three sentences with no English residue in the FR/DE ones. The German must show the `wird … untersucht` verb bracket. Adjust the German case endings if the population phrase reads wrong inside `in der {population}` — the concept `name` carries the inflection.

- [ ] **Step 6: Confirm language-neutrality of the instance still holds**

```bash
node -e "
const fs=require('fs'),vm=require('vm'),p='smartphrase/demo/';
['data/acdc-library.js','data/acdc-library-proposed.js','data/study-graph.js','data/study-graph-pre0102.js','data/lang-overlay.js','engine.js'].forEach(f=>vm.runInThisContext(fs.readFileSync(p+f,'utf8')));
const E=SP_ENGINE, ctx=E.ctxOf(ACDC_LIBRARY, STUDY_GRAPHS.PRE0102, LANG_OVERLAY);
const i=STUDY_GRAPHS.PRE0102.instances[0];
console.log('macro identical across langs:', E.toMacroText(ctx,i)===E.toMacroText(ctx,i));
const a=JSON.stringify(E.constructModelView(ctx,i));
console.log('model view is language-free:', !/Zeit|délai/.test(a));
"
```

Expected: both `true`. The constructed model view must contain no localised text — it holds identifiers.

- [ ] **Step 7: Pin goldens and commit**

```bash
node smartphrase/tools/verify.mjs --update-goldens
node smartphrase/tools/verify.mjs
git add smartphrase/demo/data/lang-overlay.js smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "$(cat <<'EOF'
Add FR/DE packs for the time-to-event phrases

PrE0102's phrases had no per-language templates, so FR/DE rendered a mostly
English sentence under a translated frame. Translated SP_TTE_ENDPOINT,
SP_METHOD_KM and SP_STRATIFICATION, the Event/Population/Treatment concepts,
M.KaplanMeier and the new sensitivity-analysis sentence role.

No new role was introduced, so the existing per-language sentence_templates
are unchanged. The harness now asserts no phrase falls back to English in any
non-English pack, for every instance in every study.

FR/DE copy remains illustrative, not validated translation.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Documentation and walkthrough

Record the three architectural decisions this work introduced, document the new files and algorithms, and give the working-group session a cross-study beat.

**Files:**
- Modify: `smartphrase/DESIGN.md` (decisions D8/D9/D10; verification section)
- Modify: `smartphrase/REFERENCE.md` (overlay file, registry, generalised algorithms, new trace tokens, tooling)
- Modify: `smartphrase/WALKTHROUGH.md` (cross-study reuse beat)
- Modify: `smartphrase/README.md` (mention the tools and the second study)

**Interfaces:**
- Consumes: everything above.
- Produces: docs an adopter can follow without reading the diff. No code depends on this task.

- [ ] **Step 1: Add the decision records to `DESIGN.md`**

Append to the decisions section, matching the existing D1–D7 style:

- **D8 — Proposed library additions live in an overlay, not the generated subset.** `acdc-library.js` is generated verbatim from `methods_02@ffee5df`; hand-editing it would destroy the provenance claim the demo displays. `T.PFS_KaplanMeier` therefore sits in `acdc-library-proposed.js`, merged by `ctxOf` and tagged `proposed: true` so the UI badges it. Upstreaming is a follow-up: submit to `methods_02` as a v0.7.x minor addition, widen `SELECT_*` in the generator, delete from the overlay. Rejected alternative: authoring directly on `methods_02`, which would put a PoC-driven change on a shared branch before the working group has seen it.
- **D9 — Study graphs live behind a `STUDY_GRAPHS` registry, one file per study.** Study layers are independent illustrative data; keeping them in separate files means a second study cannot perturb the first, and the concept dropdowns stay scoped to the active study. `STUDY_GRAPH` remains an alias for back-compatibility.
- **D10 — The engine joins model to prose on slot names, not phrase OIDs.** `constructModelView` and `buildTrace` previously located inputs via `SP_CFB_ENDPOINT` / `SP_TIMEPOINT` / `SP_POPULATION` and built a literal `CHG ~ …` formula, so no non-ANCOVA template could be instantiated. They now resolve bound concepts in library role order and substitute by placeholder slot name (`{parameter}`, `{visit}`, `{population}`, `{event}`), match sliceKey dimensions on `conceptCategory`/`kind`, and derive trace tokens from each concept's own `data` map. Study-variable expressions dispatch on method — a stopgap, because the library does not yet declare a measure→ADaM-variable mapping; a real formula resolver stays out of scope.

Also update the verification section: replace the prose about ad-hoc headless checks with the committed harness — `node smartphrase/tools/verify.mjs`, N pinned goldens across two studies, plus the planted-fault and localisation-completeness assertions.

- [ ] **Step 2: Extend `REFERENCE.md`**

Add or update these subsections:

1. **Inputs** — now four data files: generated library subset, proposed-additions overlay, per-study graphs behind `STUDY_GRAPHS`, language packs. Load order matters (`engine.js` last).
2. **`ctxOf(lib, graph, i18n, proposed)`** — the fourth parameter and the merge semantics; `lib.proposedProvenance`; `proposed: true` on merged entities.
3. **Resolution/instantiation algorithms** — document `boundConcepts` role-ordering and the slot-name join, replacing any text that names specific phrase OIDs.
4. **Trace tokens** — the token set is now open: every bound concept contributes its `data` keys, plus derived `{paramLabel}`, `{eventLabel}`, `{visitLabel}`, `{popName}`. List the PrE0102 additions `{aval}`, `{cnsr}`.
5. **Transformation template fields** — add `proposed`, and note that `outputDataStructure.measures[].output` must name a declared output of `usesMethod`.
6. **Concept registry** — add `kind: "Event"` / `conceptCategory: "EventDimension"`, and the PoC-local `sapRef` field.
7. **Tooling** — `tools/build-library-subset.mjs` (`--check`) and `tools/verify.mjs` (`--update-goldens`), both marked *(PoC)*.

- [ ] **Step 3: Add the cross-study beat to `WALKTHROUGH.md`**

Insert a beat after the existing template-reuse stop, roughly two minutes:

> **Switch study — PrE0102, metastatic breast cancer.** *(Action: click `PRE0102` in the study switch.)*
>
> "Same page, same library, same engine — a real published SAP from a different therapeutic area. This sentence is the PFS primary analysis from PrECOG PrE0102, and every claim you just saw still holds. Hover the endpoint: it's `SP_TTE_ENDPOINT`, a time-to-event phrase, not the change-from-baseline one. Click it and the trace goes somewhere else entirely — `DC.TTE → AVAL → ADTTE.AVAL where PARAMCD='PFS' → adtte.xpt`, with the censoring flag alongside.
>
> "One thing to be straight about: this needed a new library building block. The SAP asks for Kaplan-Meier medians with 90% confidence intervals by arm — descriptive, no test — and v0.7 has no template for that. So we wrote one. It's badged *proposed* because it isn't upstream yet, and that badge is the point: this is what a library contribution looks like from the outside.
>
> "The reuse claim is now two-dimensional. Within this study, four analyses share that one block — PFS, PFS on the ITT population as the SAP's own sensitivity analysis, OS, TTP. Across studies, two blocks from one library. Write once, apply many, and the 'many' crosses therapeutic areas."

Add the steer this raises to the closing asks: **who owns accepting proposed phrase/template contributions into the library, and what does that review look like?**

- [ ] **Step 4: Update `README.md`**

Note the second study, the `tools/` directory with the two commands, and that `smartphrase/SAP/` holds the PrE0102 source and its conversion.

- [ ] **Step 5: Check every doc claim is true**

```bash
cd /Volumes/External/skunk/analysis-concepts
node smartphrase/tools/verify.mjs
node smartphrase/tools/build-library-subset.mjs --check
grep -rn "three analyses\|all three\|21 headless\|36 headless" smartphrase/*.md
```

Expected: both commands PASS. The grep should return nothing — any surviving "three analyses" or headless-check counts are now false and must be rewritten. Also confirm the golden count quoted in `DESIGN.md` matches the harness's actual output line.

- [ ] **Step 6: Commit**

```bash
git add smartphrase/DESIGN.md smartphrase/REFERENCE.md smartphrase/WALKTHROUGH.md smartphrase/README.md
git commit -m "$(cat <<'EOF'
Document the breast cancer example: D8/D9/D10, reference, walkthrough

D8 proposed-additions overlay (why T.PFS_KaplanMeier is not in the generated
subset, and the upstreaming path), D9 per-study graph registry, D10 the
engine's slot-name join replacing hardcoded phrase OIDs, including the honest
limitation that study-variable expressions dispatch on method because the
library does not yet declare measure -> ADaM variable mappings.

REFERENCE.md documents the fourth ctxOf parameter, the open trace-token set,
Event-kind concepts and the two Node tools. WALKTHROUGH.md gains a cross-study
beat that states plainly that a new library block was needed, and adds the
steer on who accepts library contributions.

Stale claims removed: "all three analyses", ad-hoc headless-check counts.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Final verification and issue report

**Files:**
- No source changes. Produces a verification record and an issue comment.

**Interfaces:**
- Consumes: all tasks.
- Produces: a comment on issue #9 with what was built, what was verified, and the open questions the working group must answer.

- [ ] **Step 1: Full clean-slate verification**

```bash
cd /Volumes/External/skunk/analysis-concepts
git status --short
node smartphrase/tools/build-library-subset.mjs --check
node smartphrase/tools/verify.mjs
```

Expected: clean working tree; both commands PASS. Record the exact golden count from the verify output — it goes in the issue comment.

- [ ] **Step 2: Confirm the zero-install constraint still holds**

```bash
grep -n "fetch(\|XMLHttpRequest\|import \|require(" smartphrase/demo/index.html smartphrase/demo/engine.js smartphrase/demo/data/*.js
grep -c "<script src=" smartphrase/demo/index.html
```

Expected: the first grep returns nothing (no network or module loading in demo files); the second returns 6 (library, proposed overlay, two study graphs, lang overlay, engine).

- [ ] **Step 3: Final in-browser pass**

```bash
open smartphrase/demo/index.html
```

Re-run the Task 7 step 9 checklist end to end with the console open. Confirm zero console errors and that the CDISC Pilot walkthrough is unchanged from before this work.

- [ ] **Step 4: Push the branch**

```bash
git push origin smartphrase_01
```

- [ ] **Step 5: Post the completion comment to issue #9**

Cover: the four claims and how the second study strengthens claim 3; the new template and why it was necessary (SAP §7.7.2 is descriptive, `T.OS_LogRank` does not fit); D8/D9/D10; the engine coupling that had to be undone and the correction to the earlier "engine looks template-agnostic" assessment; the committed verification harness replacing ad-hoc checks; the pre-existing alpha float bug fixed in passing; and the open questions — the unresolved STATO term for Kaplan-Meier estimation, upstreaming the proposed template to `methods_02`, and who owns accepting library contributions.

```bash
gh issue comment 9 --repo cdisc-org/analysis-concepts --body-file <path to drafted comment>
```

- [ ] **Step 6: Mark this plan complete**

Tick every box above and add a line at the top of this file recording the completion date and the final golden count.

---

## Self-Review

**Spec coverage.** Issue #9's four claims: claim 1 (one source of truth) is exercised by the PrE0102 instances flowing through the same one-state projections — Task 6 plus the Task 7 step 9 walkthrough. Claim 2 (traceability) is the new time-to-event chain in Task 6 with a harness assertion that no token is left unfilled. Claim 3 (template-level reuse) is Tasks 5–7 — within-study (four instances, one template) and cross-study (two templates, one library). Claim 4 (standards alignment) is the grounding in Task 6 step 3 plus the standards-table work in Task 7 step 7, and the deliberate refusal to invent a STATO id is carried through to an open question in Task 10. The zero-install constraint is re-verified in Task 10 step 2. The SAP-structure-volatility constraint is untouched by design — nothing here couples to document structure. Deliverable 1 (design record) is Task 9; deliverable 2 (demo) is Tasks 5–8; deliverable 3 (walkthrough) is Task 9 step 3.

**Gap accepted.** DESIGN.md's planned estimands/ICE extension is *not* covered here and is not meant to be — it is a separate work item. PrE0102 would be a good vehicle for it later (the SAP has real intercurrent events: treatment discontinuation for toxicity, §4.4–4.5), which is worth noting to the working group but not building now.

**Placeholder scan.** No TBD/TODO-style steps. Two steps deliberately require judgement rather than prescribing an answer, and both say so explicitly with a recommended default and a verification command: Task 6 step 3 (the STATO term — must not be guessed) and Task 6 step 7 (the `SP_TTE_ENDPOINT` render wording). One `TODO(upstream)` appears inside a code comment in Task 4 step 3; that is a deliberate annotation in shipped code marking a known library limitation, not an unfinished plan step.

**Type consistency.** `boundConcepts(ctx, instance)` returns `[{ slot, id, c, role }]` and is consumed with those exact field names in Task 4 steps 4 and 5. `conceptDisplay(c)` is defined once and used in both `constructModelView` substitution and sliceKey values. `EXPRESSION_BUILDERS` is keyed by `tpl.usesMethod` (`"M.ANCOVA"`, `"M.KaplanMeier"`) matching the method conceptIds in the library. `ctxOf`'s fourth parameter `proposed` is optional and falls back to the global, so Task 5's `index.html` and `verify.mjs` call sites need no change. `STUDY_GRAPHS` keys (`CDISCPILOT01`, `PRE0102`) match the golden key prefixes the harness writes and the `data-open-study` attribute in Task 7 step 6. Trace token names in the PrE0102 chains (`{aval}`, `{cnsr}`, `{dataset}`, `{file}`, `{paramcd}`, `{datasetLabel}`, `{eventLabel}`, `{flag}`, `{popName}`) are each either a `data` key on a PrE0102 concept or a derived token defined in Task 4 step 5.
