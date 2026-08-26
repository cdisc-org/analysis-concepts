# SmartPhrase Foundation Implementation Plan (Phases P1–P2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the smartphrase engine and the upgraded phrase metadata in this branch, verified, without changing any behaviour the app has today.

**Architecture:** Port the self-contained `smartphrase/` folder from `smartphrase_01` (no git merge — the branches share no history). Upgrade only the `smartPhrases[]` block of Transformation Library v06, purely additively, so the existing v06-shaped phrase engine keeps working byte-for-byte. Convert the demo engine to an ES module with a three-line wrapper swap, proven by its own 69 pinned goldens. Add a read-only adapter that presents v06 through the v07 field names the engine expects.

**Tech Stack:** Vanilla ES modules (no bundler, no framework); Node ≥ 14.8 for verification scripts (top-level `await` in the `.mjs` harnesses; no npm dependencies) — the root `package.json` declares `"type": "module"` so the `.js` files the harnesses `import()` (`smartphrase-engine.js`, `smartphrase-lib-adapter.js`) are classified as ES modules directly, rather than depending on Node's unflagged module-syntax detection, which only landed in Node ≥ 20.19 / 22.7; Python 3 stdlib for the metadata guard and generator. The repo has no test framework and none is introduced — verification is plain scripts, matching `scripts/enrich_usdm_for_soa.py`.

**Spec:** `docs/superpowers/specs/2026-08-20-esap-smartphrase-authoring-design.md`

## Global Constraints

- **Do not adopt Transformation Library v07 or method schema 0.9.1.** Only the `smartPhrases[]` block of `lib/transformations/ACDC_Transformation_Library_v06.json` may change.
- **Never modify** `bindings`, `slices`, `composedPhrase`, `acCategory`, `methodOutputSlotMapping`, `instanceOf`, `sliceKeys`, `derivationTransformations`, `analysisTransformations`, `roleDefinitions` or `configurationOptions` in v06. Steps 6 and 8 execute from these.
- **Additive only:** existing phrase fields `phrase_template`, `configurations`, `references`, `role`, `name` keep their current values. New fields are `placeholders`, `anchors`, and `phrase_template_slotted`.
- **The old engine must never emit an unsubstituted token.** `js/utils/phrase-engine.js:resolvePhrase` iterates `phrase.configurations` only; any `{token}` in `phrase_template` not listed in `configurations` renders literally in the UI. This is enforced by the guard in Task 2.
- **Node scripts take no dependencies.** `node <script>` must work on a clean clone.
- **Commit per task, locally. Never push.** The user approved per-task subagent commits for this run (2026-08-20), consistent with the 2026-06-29 policy. Use the exact commit message given in each task's final step. `git push` is out of bounds — the user integrates the branch themselves.
- Source commit for v07 content: `ffee5df` (branch `methods_02`), file `lib/transformations/ACDC_Transformation_Library_v07.json`.

---

## Scope note

The spec's phases P3 (study-graph adapter), P4 (authoring UI) and P5 (in-document rendering) are **deliberately not in this plan.** A probe during planning found that `model/shared/bc_to_oc_instance_mapping.json` contains no `PARAMCD` anywhere (161 `bcMappings`, zero occurrences), and `js/utils/define-xml-generator.js:504` already records the same gap in its own output:

> `slice holds the parameter label "${val}", not the PARAMCD submission value (needs BC/CT resolution)`

So spec risk §15.1 is not merely unverified — the route it names is known not to work. P3's trace tier needs a decision (render the label and mark the where-clause unresolved, as define-xml does, or add BC/CT resolution as separate work) before it can be planned honestly. P1 and P2 are fully specifiable now and unblock that decision by making the engine runnable against real data.

---

## File Structure

| File | Responsibility |
|---|---|
| `smartphrase/**` (new, ported) | Reference implementation, design records, demo, goldens, fixtures. Nothing in `ac-dc-app/` imports it. |
| `scripts/validate_phrase_shapes.py` (new) | Guard: phrase metadata is internally consistent and safe for both engines. |
| `scripts/upgrade_phrase_metadata.py` (new) | Generator: merges v07 phrase metadata into v06 additively. Re-runnable, `--check`able. |
| `ac-dc-app/js/utils/smartphrase-engine.js` (new) | The ported engine as an ES module. Pure functions, no DOM. |
| `scripts/verify_smartphrase_engine.mjs` (new) | Proves the ESM conversion is behaviour-identical against the 69 goldens. |
| `ac-dc-app/js/utils/smartphrase-lib-adapter.js` (new) | Read-only v06 → v07-field-name view for the engine. Non-mutating. |
| `scripts/verify_smartphrase_adapter.mjs` (new) | Proves the adapter satisfies every field the engine reads. |

Nothing under `ac-dc-app/js/views/` is touched in this plan.

---

## Task 1: Port the smartphrase folder and establish the golden baseline

Bringing the folder in is risk-free — it shares no path with anything on this branch — and it gives Tasks 4 and 5 their fixtures and goldens.

**Files:**
- Create: `smartphrase/**` (20 files, extracted from branch `smartphrase_01`)
- Modify: `.gitignore:1` (add `.superpowers/`)

**Interfaces:**
- Consumes: nothing
- Produces: `smartphrase/demo/engine.js` (IIFE assigning `g.SP_ENGINE`), `smartphrase/demo/data/acdc-library.js`, `smartphrase/demo/data/acdc-library-proposed.js`, `smartphrase/demo/data/study-graph.js`, `smartphrase/demo/data/study-graph-pre0102.js`, `smartphrase/demo/data/lang-overlay.js`, `smartphrase/tools/goldens.json` (69 keys), `smartphrase/tools/verify.mjs`

- [ ] **Step 1: Confirm the branches genuinely share no history**

Run:
```bash
cd /Users/kwl/repos/Github/CDISC/analysis-concepts
git merge-base HEAD smartphrase_01; echo "exit=$?"
```
Expected: no output, `exit=1`. This confirms a merge is not an option and the folder port is correct. If it prints a commit, STOP — the situation has changed since planning and the plan needs revisiting.

- [ ] **Step 2: Extract the folder**

```bash
cd /Users/kwl/repos/Github/CDISC/analysis-concepts
git archive smartphrase_01 smartphrase | tar -x
ls smartphrase
```
Expected: `DESIGN.md GETTING-STARTED.md PLAN-breast-cancer.md README.md REFERENCE.md SAP WALKTHROUGH.md demo spec tools`

- [ ] **Step 3: Run the ported harness to establish the baseline**

```bash
node smartphrase/tools/verify.mjs
```
Expected: `PASS — 69 outputs checked, no failures.`

If this fails, do not continue — every later task uses these goldens as its definition of correct.

- [ ] **Step 4: Confirm the app is untouched**

```bash
git status --porcelain | grep -v '^?? smartphrase/' | grep -v '^?? .superpowers/'
```
Expected: no output. The port must add files only.

- [ ] **Step 5: Ignore the brainstorm scratch directory**

Append to `.gitignore`:
```
.superpowers/
```

- [ ] **Step 6: Commit**

```bash
git add smartphrase .gitignore
git commit -m "Port the smartphrase reference implementation from smartphrase_01

Self-contained folder; no path overlap with the app. Verified in place:
node smartphrase/tools/verify.mjs -> 69/69."
```

---

## Task 2: Phrase-shape guard (must fail against current v06)

This is the acceptance test for Task 3, written first. It also encodes the safety property that keeps the *existing* engine working.

**Files:**
- Create: `scripts/validate_phrase_shapes.py`
- Reads: `lib/transformations/ACDC_Transformation_Library_v06.json`

**Interfaces:**
- Consumes: nothing
- Produces: CLI `python3 scripts/validate_phrase_shapes.py` → exit 0 on pass, 1 on failure

- [ ] **Step 1: Write the guard**

Create `scripts/validate_phrase_shapes.py`:

```python
#!/usr/bin/env python3
"""
Guard for the smartPhrases[] block of Transformation Library v06.

    python3 scripts/validate_phrase_shapes.py

Two engines read this block at once and they read different fields:

  * the existing engine (ac-dc-app/js/utils/phrase-engine.js) substitutes only
    the tokens listed in `configurations`, from `phrase_template`;
  * the ported engine (ac-dc-app/js/utils/smartphrase-engine.js) substitutes
    `placeholders[].name`, from `phrase_template_slotted` when present.

The checks below are exactly the invariants that let both be correct at once.
Stdlib only; no test framework in this repo by design.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = ROOT / "lib" / "transformations" / "ACDC_Transformation_Library_v06.json"

TOKEN = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def main() -> int:
    lib = json.loads(LIB.read_text(encoding="utf-8"))
    phrases = lib["smartPhrases"]
    defined = {p["oid"] for p in phrases}
    failures = []

    for p in phrases:
        oid = p["oid"]

        if "placeholders" not in p:
            failures.append(f"{oid}: missing placeholders[]")
            continue
        if "anchors" not in p:
            failures.append(f"{oid}: missing anchors{{}}")

        names = {ph["name"] for ph in p["placeholders"]}
        # A method_ref slot is new in the v07 shape; the old engine never
        # modelled it, so it is deliberately absent from `configurations`.
        non_method = {ph["name"] for ph in p["placeholders"]
                      if ph.get("kind") != "method_ref"}
        configured = set(p.get("configurations", []))
        if non_method != configured:
            failures.append(
                f"{oid}: non-method placeholders {sorted(non_method)} "
                f"!= configurations {sorted(configured)}")

        # The old engine renders `phrase_template` and substitutes only
        # `configurations`. Any other token would reach the UI literally.
        for tok in TOKEN.findall(p["phrase_template"]):
            if tok not in configured:
                failures.append(
                    f"{oid}: phrase_template token {{{tok}}} is not in "
                    f"configurations — the existing engine would render it literally")

        # The ported engine renders the slotted template against placeholders.
        slotted = p.get("phrase_template_slotted")
        if slotted is not None:
            for tok in TOKEN.findall(slotted):
                if tok not in names:
                    failures.append(
                        f"{oid}: phrase_template_slotted token {{{tok}}} "
                        f"is not a placeholder name")

    transformations = (lib["derivationTransformations"]
                       + lib["analysisTransformations"])
    for t in transformations:
        for oid in t.get("validSmartPhrases", []):
            if oid not in defined:
                failures.append(
                    f"{t['oid']}: validSmartPhrases references undefined phrase {oid}")

    if failures:
        print(f"FAIL — {len(failures)} problem(s):")
        for f in failures:
            print("  -", f)
        return 1

    print(f"PASS — {len(phrases)} phrases: placeholders and configurations agree, "
          f"anchors present, no unsubstitutable tokens, no dangling references.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 scripts/validate_phrase_shapes.py; echo "exit=$?"
```
Expected: `exit=1`, with 19 failures — `missing placeholders[]` for each of the 18 phrases, plus:
```
  - T.Responder_ChiSq: validSmartPhrases references undefined phrase SP_METHOD_CHISQ
```

That last line is a **pre-existing defect in v06**, not something this work introduces: `T.Responder_ChiSq` names a phrase that v06 never defines, so a responder analysis composed through phrase matching silently loses its method fragment today. Task 3 repairs it.

- [ ] **Step 3: Commit**

```bash
git add scripts/validate_phrase_shapes.py
git commit -m "Add phrase-shape guard for Transformation Library v06

Currently fails: 18 phrases lack placeholders[], and T.Responder_ChiSq
references SP_METHOD_CHISQ which v06 does not define."
```

---

## Task 3: Upgrade the phrase metadata

A generator, not a hand edit — so it is re-runnable, reviewable, and provably scoped to `smartPhrases[]`.

**Files:**
- Create: `scripts/upgrade_phrase_metadata.py`
- Modify: `lib/transformations/ACDC_Transformation_Library_v06.json` (`smartPhrases[]` only)

**Interfaces:**
- Consumes: `scripts/validate_phrase_shapes.py` (as the acceptance check)
- Produces: v06 phrases each carrying `placeholders[]`, `anchors{}`, and `phrase_template_slotted` where the slotted form differs; 5 new phrase entries

- [ ] **Step 1: Write the generator**

Create `scripts/upgrade_phrase_metadata.py`:

```python
#!/usr/bin/env python3
"""
Merge v07 phrase metadata into the v06 transformation library, additively.

    python3 scripts/upgrade_phrase_metadata.py           # write
    python3 scripts/upgrade_phrase_metadata.py --check   # verify, no write

Only `smartPhrases[]` is touched. Everything the execution path reads —
bindings, slices, methodOutputSlotMapping, acCategory, the split
derivation/analysis arrays — is copied through untouched, and the script
asserts that before writing.

Existing phrases keep their v06 `phrase_template`, `configurations`,
`references`, `role` and `name`. They gain `placeholders[]` and `anchors{}`
verbatim from v07, plus `phrase_template_slotted` when v07's template differs
(which happens only for the four method phrases, where v06 bakes the method
name into the sentence and v07 makes it a slot).
"""
import copy
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = ROOT / "lib" / "transformations" / "ACDC_Transformation_Library_v06.json"

SOURCE_COMMIT = "ffee5df"
SOURCE_FILE = "lib/transformations/ACDC_Transformation_Library_v07.json"

# Phrases to add that v06 does not define. SP_METHOD_CHISQ is not optional:
# T.Responder_ChiSq already references it.
NEW_PHRASES = [
    "SP_AUC_ENDPOINT",
    "SP_SHIFT_ENDPOINT",
    "SP_PCTCFB_ENDPOINT",
    "SP_METHOD_CHISQ",
    "SP_METHOD_DESCSTATS",
]

# v06-style plain templates for new phrases whose v07 template contains a
# method_ref slot. Declared, not inferred — the existing engine cannot
# substitute a method_ref, so it needs prose with the method already in it.
PLAIN_TEMPLATE = {
    "SP_METHOD_CHISQ": "using the chi-squared test",
    "SP_METHOD_DESCSTATS": "summarised by descriptive statistics",
}

# Keys that must be identical before and after. Everything the app executes from.
FROZEN_KEYS = [
    "version", "description", "_w3c_alignment", "$references",
    "configurationOptions", "roleDefinitions",
    "derivationTransformations", "analysisTransformations",
]


def load_v07():
    raw = subprocess.run(
        ["git", "show", f"{SOURCE_COMMIT}:{SOURCE_FILE}"],
        cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(raw)


def upgrade(v06, v07):
    out = copy.deepcopy(v06)
    s7 = {p["oid"]: p for p in v07["smartPhrases"]}

    for phrase in out["smartPhrases"]:
        oid = phrase["oid"]
        src = s7.get(oid)
        if src is None:
            raise SystemExit(f"FAIL — v06 phrase {oid} has no v07 counterpart")
        phrase["placeholders"] = copy.deepcopy(src["placeholders"])
        phrase["anchors"] = copy.deepcopy(src.get("anchors", {}))
        if src["phrase_template"] != phrase["phrase_template"]:
            phrase["phrase_template_slotted"] = src["phrase_template"]

    existing = {p["oid"] for p in out["smartPhrases"]}
    for oid in NEW_PHRASES:
        if oid in existing:
            continue
        src = s7[oid]
        placeholders = copy.deepcopy(src["placeholders"])
        configurations = [ph["name"] for ph in placeholders
                          if ph.get("kind") != "method_ref"]
        plain = PLAIN_TEMPLATE.get(oid, src["phrase_template"])
        entry = {
            "oid": oid,
            "name": src["name"],
            "role": src["role"],
            "phrase_template": plain,
            "configurations": configurations,
            "references": sorted(
                {v for v in src.get("anchors", {}).values()
                 if not str(v).startswith("M.")}
                | {ph["concept_constraint"] for ph in placeholders
                   if ph.get("concept_constraint")}),
            "placeholders": placeholders,
            "anchors": copy.deepcopy(src.get("anchors", {})),
        }
        if src["phrase_template"] != plain:
            entry["phrase_template_slotted"] = src["phrase_template"]
        out["smartPhrases"].append(entry)

    for key in FROZEN_KEYS:
        if json.dumps(out[key], sort_keys=True) != json.dumps(v06[key], sort_keys=True):
            raise SystemExit(f"FAIL — generator altered frozen key '{key}'")

    return out


def main() -> int:
    check = "--check" in sys.argv
    v06 = json.loads(LIB.read_text(encoding="utf-8"))
    result = upgrade(v06, load_v07())
    body = json.dumps(result, indent=2, ensure_ascii=False) + "\n"

    if check:
        if LIB.read_text(encoding="utf-8") != body:
            print("FAIL — v06 on disk differs from generator output.")
            return 1
        print("PASS — v06 matches generator output.")
        return 0

    LIB.write_text(body, encoding="utf-8")
    print(f"wrote {LIB.relative_to(ROOT)} — {len(result['smartPhrases'])} phrases "
          f"({len(NEW_PHRASES)} added)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Capture the pre-change state of the frozen sections**

```bash
python3 - <<'EOF'
import json, hashlib
d = json.load(open('lib/transformations/ACDC_Transformation_Library_v06.json'))
keys = ["version","description","_w3c_alignment","$references","configurationOptions",
        "roleDefinitions","derivationTransformations","analysisTransformations"]
blob = json.dumps({k: d[k] for k in keys}, sort_keys=True)
print("frozen-sha256:", hashlib.sha256(blob.encode()).hexdigest())
EOF
```
Record the hash. Step 5 must reproduce it exactly.

- [ ] **Step 3: Run the generator**

```bash
python3 scripts/upgrade_phrase_metadata.py
```
Expected: `wrote lib/transformations/ACDC_Transformation_Library_v06.json — 23 phrases (5 added)`

- [ ] **Step 4: Run the guard to verify it now passes**

```bash
python3 scripts/validate_phrase_shapes.py; echo "exit=$?"
```
Expected: `PASS — 23 phrases: placeholders and configurations agree, anchors present, no unsubstitutable tokens, no dangling references.` and `exit=0`

- [ ] **Step 5: Prove the execution metadata is byte-identical**

Re-run the Step 2 snippet. Expected: the **same** `frozen-sha256`. If it differs, revert the file and stop — Steps 6 and 8 read those sections.

Then confirm the diff is confined to one block:
```bash
git diff --stat lib/transformations/ACDC_Transformation_Library_v06.json
python3 -c "
import json,subprocess
old=json.loads(subprocess.run(['git','show','HEAD:lib/transformations/ACDC_Transformation_Library_v06.json'],capture_output=True,text=True).stdout)
new=json.load(open('lib/transformations/ACDC_Transformation_Library_v06.json'))
print('top-level keys changed:', [k for k in new if json.dumps(new[k],sort_keys=True)!=json.dumps(old.get(k),sort_keys=True)])
"
```
Expected: `top-level keys changed: ['smartPhrases']`

- [ ] **Step 6: Verify `--check` is idempotent**

```bash
python3 scripts/upgrade_phrase_metadata.py --check; echo "exit=$?"
```
Expected: `PASS — v06 matches generator output.` and `exit=0`

- [ ] **Step 7: Smoke-test the running app**

```bash
python3 ac-dc-app/serve.py
```
Open `http://localhost:8080/ac-dc-app/index.html`. Check, with the browser console open and no errors:
- Step 3 (Endpoint) — the SmartPhrase panel lists phrases and the composed sentence renders with **no literal `{token}`** visible.
- Step 4 (Analysis) — the summary-measure dropdown still populates.
- Step 6 (Derivations) — the pipeline tree still renders.
- Step 8 (Execute) — loads without error.

Stop the server with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add scripts/upgrade_phrase_metadata.py lib/transformations/ACDC_Transformation_Library_v06.json
git commit -m "Add v07 phrase metadata to v06 smartPhrases, additively

placeholders[] and anchors{} copied verbatim from methods_02@ffee5df;
phrase_template_slotted added for the four method phrases whose v07 form
is slotted. Adds the five v07-only phrases, which repairs T.Responder_ChiSq's
dangling reference to SP_METHOD_CHISQ.

Frozen sections byte-identical; only smartPhrases[] changed."
```

---

## Task 4: The engine as an ES module

The conversion is a three-line wrapper swap on a verbatim copy — deliberately minimal, so the goldens prove the port rather than a hand-rewrite.

**Files:**
- Create: `ac-dc-app/js/utils/smartphrase-engine.js`
- Create: `scripts/verify_smartphrase_engine.mjs`

**Interfaces:**
- Consumes: `smartphrase/demo/engine.js`, `smartphrase/tools/goldens.json`, and the demo fixtures under `smartphrase/demo/data/` (from Task 1)
- Produces: named ES exports `ctxOf(lib, graph, i18n, proposed)`, `availableLangs(ctx)`, `langPack(ctx, lang)`, `phraseDef(ctx, oid)`, `templateDef(ctx, conceptId)`, `concept(ctx, id)`, `method(ctx, id)`, `resolvePhrase(ctx, phraseInstance, lang)`, `resolveInstance(ctx, instance, lang)`, `constructModelView(ctx, instance)`, `buildTrace(ctx, instance, role)`, `toMacroText(ctx, instance)`, `parseMacroText(ctx, text, baseInstance)`, `toJSONLD(ctx, instance)`; plus default export `SPEngine` (the same object the demo exposes as `window.SP_ENGINE`)

- [ ] **Step 1: Write the verification harness**

Create `scripts/verify_smartphrase_engine.mjs`:

```js
/*
 * Proves ac-dc-app/js/utils/smartphrase-engine.js is behaviour-identical to the
 * ported demo engine, against the 69 pinned goldens.
 *
 *   node scripts/verify_smartphrase_engine.mjs
 *
 * The demo's DATA files stay browser IIFEs and load under Node via vm; only the
 * ENGINE is converted to an ES module, so it is imported normally. If the two
 * ever disagree, the conversion changed behaviour.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const demo = path.join(root, "smartphrase", "demo");

for (const rel of [
  "data/acdc-library.js",
  "data/acdc-library-proposed.js",
  "data/study-graph.js",
  "data/study-graph-pre0102.js",
  "data/lang-overlay.js"
]) {
  vm.runInThisContext(fs.readFileSync(path.join(demo, rel), "utf8"), { filename: rel });
}

const { default: E } = await import(
  pathToFileURL(path.join(root, "ac-dc-app", "js", "utils", "smartphrase-engine.js")).href
);

const LIB = globalThis.ACDC_LIBRARY;
const I18N = globalThis.LANG_OVERLAY;
const goldens = JSON.parse(
  fs.readFileSync(path.join(root, "smartphrase", "tools", "goldens.json"), "utf8")
);

const captured = {};
for (const [studyKey, graph] of Object.entries(globalThis.STUDY_GRAPHS)) {
  const ctx = E.ctxOf(LIB, graph, I18N);
  for (const inst of graph.instances) {
    for (const lang of E.availableLangs(ctx)) {
      captured[`${studyKey}/${inst.id}/sentence/${lang}`] =
        E.resolveInstance(ctx, inst, lang).sentence;
    }
    captured[`${studyKey}/${inst.id}/modelView`] = E.constructModelView(ctx, inst);
    captured[`${studyKey}/${inst.id}/macro`] = E.toMacroText(ctx, inst);
    captured[`${studyKey}/${inst.id}/jsonld`] = E.toJSONLD(ctx, inst);
    for (const role of ["endpoint", "covariate", "timepoint", "grouping", "population"]) {
      const t = E.buildTrace(ctx, inst, role);
      if (t) captured[`${studyKey}/${inst.id}/trace/${role}`] = t;
    }
  }
}

const failures = [];
for (const key of Object.keys(goldens)) {
  if (!(key in captured)) { failures.push(`${key} — not produced`); continue; }
  const a = JSON.stringify(goldens[key]);
  const b = JSON.stringify(captured[key]);
  if (a !== b) failures.push(`${key} — differs\n    golden: ${a.slice(0, 160)}\n    actual: ${b.slice(0, 160)}`);
}

if (failures.length) {
  console.error(`FAIL — ${failures.length} of ${Object.keys(goldens).length} goldens differ:`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log(`PASS — ${Object.keys(goldens).length} goldens reproduced by the ES module engine.`);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node scripts/verify_smartphrase_engine.mjs; echo "exit=$?"
```
Expected: failure with `Cannot find module` (or `ERR_MODULE_NOT_FOUND`) for `smartphrase-engine.js`, `exit=1`.

- [ ] **Step 3: Create the ES module**

```bash
cp smartphrase/demo/engine.js ac-dc-app/js/utils/smartphrase-engine.js
```

Then make exactly two edits to `ac-dc-app/js/utils/smartphrase-engine.js`.

Edit A — insert a namespace object immediately before the IIFE opener at line 9. Change:

```js
(function (g) {
  "use strict";
```
to:
```js
const __ns = {};

(function (g) {
  "use strict";
```

Edit B — replace the final line. Change:

```js
})(typeof window !== "undefined" ? window : globalThis);
```
to:
```js
})(__ns);

/* ES-module surface. The engine body above is a verbatim copy of
   smartphrase/demo/engine.js; only this wrapper differs, and
   scripts/verify_smartphrase_engine.mjs proves the behaviour is identical. */
export default __ns.SP_ENGINE;
export const {
  availableLangs, langPack, ctxOf, phraseDef, templateDef, concept, method,
  resolvePhrase, resolveInstance, constructModelView, buildTrace,
  toMacroText, parseMacroText, toJSONLD
} = __ns.SP_ENGINE;
```

Make no other change to the file.

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_smartphrase_engine.mjs; echo "exit=$?"
```
Expected: `PASS — 69 goldens reproduced by the ES module engine.` and `exit=0`

- [ ] **Step 5: Confirm the body is a verbatim copy**

Extract each file's IIFE body — from the opener line up to, but not including, its
closer — and compare. Symmetric, so it cannot silently pass on a mismatched slice.

```bash
diff <(sed -n '/^(function (g) {$/,/^})(typeof window/p' smartphrase/demo/engine.js | sed '$d') \
     <(sed -n '/^(function (g) {$/,/^})(__ns);$/p' ac-dc-app/js/utils/smartphrase-engine.js | sed '$d')
echo "diff-exit=$?"
```
Expected: no output and `diff-exit=0`. If there is output, the copy was edited beyond
the wrapper — revert and redo Step 3.

- [ ] **Step 6: Commit**

```bash
git add ac-dc-app/js/utils/smartphrase-engine.js scripts/verify_smartphrase_engine.mjs
git commit -m "Add the smartphrase engine as an ES module

Verbatim copy of smartphrase/demo/engine.js with the IIFE wrapper swapped for
named exports. node scripts/verify_smartphrase_engine.mjs -> 69/69 goldens."
```

---

## Task 5: v06 library adapter

The engine reads v07 field names in six places. Rather than reshape the library the app executes from, present it through a read-only view.

**Files:**
- Create: `ac-dc-app/js/utils/smartphrase-lib-adapter.js`
- Create: `scripts/verify_smartphrase_adapter.mjs`

**Interfaces:**
- Consumes: `ac-dc-app/js/utils/smartphrase-engine.js` (Task 4)
- Produces: `adaptV06Library(v06) -> library` — an object with `library_version`, `configurationOptions`, `roleDefinitions`, `smartPhrases`, `transformations[]` (each carrying `conceptId`, `label`, `inputDataStructure.slices`, `outputDataStructure.measures` alongside its original fields), and `methods{}`; and `adaptV06Method(method) -> method` adding `conceptId` and `label`

- [ ] **Step 1: Write the verification harness**

Create `scripts/verify_smartphrase_adapter.mjs`:

```js
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

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach(f => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — adapted v06 satisfies every field the engine reads.");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node scripts/verify_smartphrase_adapter.mjs; echo "exit=$?"
```
Expected: `ERR_MODULE_NOT_FOUND` for `smartphrase-lib-adapter.js`, `exit=1`.

- [ ] **Step 3: Write the adapter**

Create `ac-dc-app/js/utils/smartphrase-lib-adapter.js`:

```js
/**
 * Read-only v06 -> v07-field-name view for the ported smartphrase engine.
 *
 * The engine (ac-dc-app/js/utils/smartphrase-engine.js) was written against
 * Transformation Library v0.7. This branch runs v0.6, which the execution path
 * (Steps 6 and 8) reads directly — `bindings`, `slices`, `acCategory` and
 * `methodOutputSlotMapping` only exist in v06 and must not move.
 *
 * So the library is not reshaped; it is wrapped. Every adapted object spreads
 * its v06 original, so v06 fields remain available and nothing is mutated.
 *
 * Field mapping:
 *   lib.transformations            <- derivationTransformations + analysisTransformations
 *   tpl.conceptId                  <- tpl.oid
 *   tpl.label                      <- tpl.name
 *   tpl.inputDataStructure.slices  <- tpl.slices
 *   slice constraint `.dimension`  <- constraint.conceptCategory
 *   tpl.outputDataStructure.measures <- methodOutputSlotMapping (analysis) or
 *                                      output measure bindings (derivation)
 *   method.conceptId / .label      <- method.oid / method.name
 *
 * `formula` and `configurations` are identical between method schema 0.8.0 and
 * 0.9.1, so they pass through by reference.
 */

/** Adapt one transformation. Returns a new object; the input is untouched. */
function adaptTransformation(t) {
  const slices = (t.slices || []).map(sl => ({
    ...sl,
    constraints: (sl.constraints || []).map(c => ({
      ...c,
      // v07 calls this `dimension`; v06 carries the same value as
      // `conceptCategory` (e.g. "ParameterDimension") or, on some entries,
      // already as `dimension`.
      dimension: c.dimension || c.conceptCategory
    }))
  }));

  // Two v06 shapes carry outputs, split by transformation type:
  //   analysis   -> methodOutputSlotMapping  { slotName: Concept }
  //   derivation -> output bindings with dataStructureRole 'measure'
  // For T.CFB_ANCOVA the mapping's concepts (LSMeans, Contrasts, Type3Tests,
  // ParameterEstimates, FitStatistics) are exactly v07's
  // outputDataStructure.measures concepts, so this is faithful, not a guess.
  const slotMapping = t.methodOutputSlotMapping || {};
  const measures = Object.keys(slotMapping).length
    ? Object.entries(slotMapping).map(([output, concept]) => ({ output, concept }))
    : (t.bindings || [])
        .filter(b => b.direction === 'output' && b.dataStructureRole === 'measure')
        .map(b => ({ output: b.methodRole, concept: b.concept }));

  return {
    ...t,
    conceptId: t.oid,
    label: t.name,
    inputDataStructure: { slices },
    outputDataStructure: { measures }
  };
}

/** Adapt one method definition (schema 0.8.0) to the names the engine reads. */
export function adaptV06Method(m) {
  return { ...m, conceptId: m.oid, label: m.label || m.name };
}

/**
 * Adapt the whole v06 library.
 *
 * @param {object} v06      the parsed ACDC_Transformation_Library_v06.json
 * @param {object} methods  optional map of oid -> method JSON (schema 0.8.0)
 * @returns {object} a library object the engine's ctxOf() accepts
 */
export function adaptV06Library(v06, methods = {}) {
  const all = [
    ...(v06.derivationTransformations || []),
    ...(v06.analysisTransformations || [])
  ];

  const adaptedMethods = {};
  for (const [oid, m] of Object.entries(methods)) {
    adaptedMethods[oid] = adaptV06Method(m);
  }

  return {
    library_version: v06.version,
    configurationOptions: v06.configurationOptions,
    roleDefinitions: v06.roleDefinitions,
    smartPhrases: v06.smartPhrases,
    transformations: all.map(adaptTransformation),
    methods: adaptedMethods
  };
}
```

- [ ] **Step 4: Run the harness to verify it passes**

```bash
node scripts/verify_smartphrase_adapter.mjs; echo "exit=$?"
```
Expected: `PASS — adapted v06 satisfies every field the engine reads.` and `exit=0`

- [ ] **Step 5: Re-run every gate**

```bash
python3 scripts/validate_phrase_shapes.py \
  && python3 scripts/upgrade_phrase_metadata.py --check \
  && node smartphrase/tools/verify.mjs \
  && node scripts/verify_smartphrase_engine.mjs \
  && node scripts/verify_smartphrase_adapter.mjs
```
Expected: five PASS lines, exit 0.

- [ ] **Step 6: Commit**

```bash
git add ac-dc-app/js/utils/smartphrase-lib-adapter.js scripts/verify_smartphrase_adapter.mjs
git commit -m "Add read-only v06 adapter for the smartphrase engine

Presents v06 through the v07 field names the engine reads. Non-mutating;
v06 fields survive on every adapted object so the execution path is unaffected."
```

---

## Definition of done

All five commands in Task 5 Step 5 pass, and the app behaves exactly as it did before this plan: Step 3 composes sentences with no literal tokens, Step 4's summary-measure inference works, Step 6 renders the pipeline, Step 8 executes Scenarios 1 and 3.

No file under `ac-dc-app/js/views/` has been modified. Nothing imports `smartphrase-engine.js` or `smartphrase-lib-adapter.js` yet — they are proven and ready for the P3–P5 plan.

## What this unblocks, and the decision it surfaces

With the engine runnable against the real v06 library, the P3 study-graph adapter can be probed directly. Before it can be planned, one product decision is needed:

**`PARAMCD` is not derivable from current metadata.** The trace's study-variable tier wants `PARAMCD = '{paramcd}'`. `bc_to_oc_instance_mapping.json` has no PARAMCD, and `define-xml-generator.js:504` already emits a note recording the same gap. Options:

1. Render the tier with the parameter **label** and mark the where-clause unresolved — consistent with what Define-XML generation already does, and honest.
2. Add BC → Controlled Terminology resolution so a real submission value is available — larger, benefits Define-XML export too.
3. Let the user supply PARAMCD per endpoint in Step 6 alongside `datasetAssignments`.

This is a spec-level question, not an implementation detail; it belongs in the next brainstorming round.
