# Estimands and Intercurrent Events Implementation Plan

> **COMPLETE — 2026-08-14.** All twelve tasks executed and verified. Final state: **86 pinned outputs**
> across two studies, all three gates green, working tree clean.
>
> **Deviations from this plan, all deliberate:**
>
> 1. **Task 10 (localisation) was folded into Task 8**, not committed separately. Task 8 as written would
>    have pinned knowingly-English-fallback FR/DE sentences as goldens and left the localisation gate red
>    across two commits. Translating first avoided both.
> 2. **`role_conjunctions` landed in Task 8 rather than Task 9.** The EN sentence template needed it as
>    soon as the optional groups were written, so the engine support came with the template change.
> 3. **Two prose defects were found by reading rendered output, as the plan instructed** — an ICE clause
>    that opened a comma without closing it, and `" , "` left where an elided optional group met an empty
>    `covariate` role. Both fixed; the second needed normalising in the `parts` array rather than the
>    assembled string, because the DOM renders parts individually.
> 4. **Two holes in the verification gate surfaced during Task 7**, neither predicted here: the
>    per-instance trace loop ran for roles the instance did not use (producing `ADQSADAS.ITTFL`, the
>    endpoint's dataset crossed with the population's flag), and the "no unfilled tokens" assertion only
>    looked for `⟨name⟩`, so a surviving `{token}` passed silently. Both fixed.
> 5. **Test fixtures were coupled to live data**, discovered in Task 9: three blocks pushed ICE phrases
>    onto `instances[0]`, so once that instance grew ICE phrases of its own, "push two ICEs" became "push
>    two more". Added a `without(ctx, inst, roles)` helper so each fixture states its own precondition.
> 6. **`tools/diff-goldens.mjs` was added** — not in the plan. Reviewing a recapture by eye across a 35KB
>    JSON diff cannot answer "did anything move that I did not intend?"; a leaf-level structural diff can,
>    and every recapture here was reviewed with it.
> 7. **`REFERENCE.md` §6 was stale from #9**, still describing the pre-D10 phrase-OID keying that issue
>    had already replaced. Rewritten while updating it.
> 8. **`SP_ICE_TREATMENT_POLICY` appears twice in one instance** (`AC.SENS.ADASCOG.TP`), which the plan did
>    not anticipate. The engine handles a repeated phrase OID and the macro round-trip stays byte-equal;
>    noted in `REFERENCE.md` §3.2 as supported for `repeating` roles.
>
> The five design deviations recorded below were all confirmed correct in implementation. Deviation E
> (`analysisRole` beside `sentenceRole`, not replacing it) is the one worth the working group's attention.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an ICH E9(R1) estimand — all five attributes, including intercurrent-event handling and
the summary measure — authorable as SAP prose and readable back as eSAP model metadata, with no second
copy.

**Architecture:** Additive to the one-state/many-projections design of issue #9. Two new phrase roles
(`ice_handling`, `summary_measure`) arrive through the D8 proposed-additions overlay; a new registry kind
`IntercurrentEvent` carries strategy-independent ascertainment; the estimand itself sits at the
analysis-instance level, not in a phrase. Every new surface is a projection of the same instance object.

**Tech Stack:** ES5-style browser JS (`var`/`function`, no arrows, no template literals) in `demo/`;
Node ESM `.mjs` for dev tooling; zero-install (`file://`, `<script src>`, no build step, no `fetch`).

**Spec:** Issue [#11](https://github.com/cdisc-org/analysis-concepts/issues/11) states the requirements.
`smartphrase/DESIGN.md` § *Planned extension — estimands and intercurrent events* is the design input and
is explicitly revisable — **five deviations from it are recorded below and are load-bearing.**

## Global Constraints

- **Base branch:** `estimands_01`, forked from `smartphrase_01`. Baseline commit `7e0b9fc`, all three
  gates green before any change.
- **Zero-install:** static files opened via `file://`. No `fetch` of local JSON, no ES modules, no build
  step in the demo. New data files ship as `<script src>` IIFEs attaching to `window`/`globalThis`.
- **`demo/data/acdc-library.js` is generated — never hand-edit.** The only legitimate way to add upstream
  content is to widen `SELECT_*` in `tools/build-library-subset.mjs` and regenerate. Content that is *not*
  upstream goes in `demo/data/acdc-library-proposed.js` with `proposed: true` (decision D8).
- **Model side pinned to `methods_02@ffee5df`** (the commit the library subset is generated from).
- **Identifier policy:** resolve into USDM / ARS / STATO / NCIt wherever they cover the entity; everything
  else carries `iri_status: "illustrative"`. **Never invent a plausible-looking registered identifier.**
- **Every study concept carries a `sapRef`** quoting the source sentence it was encoded from. Anything
  *not* in the source document must say so in that field.
- **Three gates must be green at the end of every task:**
  ```
  node smartphrase/tools/verify.mjs
  node smartphrase/tools/build-library-subset.mjs --check
  NODE_PATH=<scratchpad>/domtest/node_modules node smartphrase/tools/verify-ui.mjs
  ```
- **Goldens are captured from behaviour, never hand-written.** `--update-goldens` is only run when a
  change of output is intended, and the diff must be inspected and justified in the commit message.
- **British English** in prose and comments.

---

## Deviations from `DESIGN.md`, and why

These were found by reading the code and the upstream model rather than the design note. Each one changes
what gets built, so they are settled here rather than mid-task.

**A. Roles cannot simply be "added" — `ctxOf` does not merge them, and the UI reads them off the raw
global.** `roleDefinitions` comes from the generated subset, so new roles must arrive via the overlay. But
`ctxOf` merges only `transformations` and `smartPhrases` (`engine.js:18-40`), and `index.html` reads
`LIB.roleDefinitions` directly at lines 328 and 537 — the *same bug class* as the `proposedProvenance` bug
that #9's UI gate caught. Task 1 fixes both. New roles declare an insertion point rather than appending,
because appending would put `ice_handling` after `covariate`.

**B. The sentence template needs optional groups.** ICE clauses need commas: *"…comparing treatment
groups, as if X had not occurred, using ANCOVA…"*. Today an absent role leaves whitespace, which the
normaliser collapses harmlessly — but literal punctuation would strand as `", ,"` on every instance with
no ICE, breaking all seven existing instances. Task 2 adds `[...]` optional groups to the template
language. Existing templates are unaffected because their frame text is pure whitespace.

**C. `buildTrace` needs a focus, because `ice_handling` repeats.** `buildTrace(ctx, instance, role)` keys
on role and gathers `data` tokens from all bound concepts in role order, first-wins
(`engine.js:388-427`). With two ICEs bound, the first would win for both, and the endpoint concept's
`{dataset}` would shadow the ICE's anyway. Task 7 adds a focus-concept parameter. This is the single most
substantial engine change.

**D. `summary_measure` needs the template threaded into binding resolution.** Requirement 4 says the
summary must be an output the method provably produces. That check needs the active template, which
`resolvePhrase`/`resolveBinding` do not receive. Task 4 threads it through as an optional parameter.
The authoritative labels come from a *new upstream file* — `lib/vocabulary/output_class_templates.json`,
which carries `conceptId`/`name`/`label`/`statistics[]` per output class. It is real, pinned content, so
it enters through the generator, not the overlay.

**E. `sentenceRole` must NOT be replaced by `analysisRole` — they are different things.** `DESIGN.md` says
the free-string `sentenceRole` "should bind to the typed `Analysis.analysisRole`". That is not a 1:1
mapping. `AnalysisRole` is *per estimand*: a secondary analysis is the **MainEstimator of a secondary
estimand**, not a distinct role value. Deriving *"a secondary analysis"* from the enum is impossible
without the estimand's rank. So Task 5 **adds** typed `analysisRole` and an `estimand` reference beside
`sentenceRole`, and *validates* consistency (exactly one MainEstimator per estimand) instead of
substituting one for the other. This preserves all existing prose and goldens, and is the more faithful
reading of the model. Record it as a finding for the working group.

**F. Library output-class labels are analyst-facing, not SAP-facing.** Upstream `contrasts_t` has
`label: "T-based contrasts"`, but the target prose wants *"the difference in least-squares means"*.
Rendering the upstream label produces bad SAP English. Resolution: the language packs supply the
SAP-facing wording via an `outputClasses` overlay, exactly as they already do for `concepts` and
`methods` — English is a language like any other. The upstream label stays visible in the inspect panel
and the standards table. This is a genuine finding worth reporting: the library's output vocabulary is
not written for document prose.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `demo/engine.js` | Pure projections of one instance object | Modify — role overlay merge, optional groups, `output_ref` kind, trace focus, ICE/estimand emission |
| `demo/data/acdc-library-proposed.js` | Library content not yet upstream (D8) | Modify — 2 roles, 6 phrases, output-class prose note |
| `demo/data/acdc-library.js` | Generated verbatim subset | Regenerate only — never hand-edit |
| `tools/build-library-subset.mjs` | Declares and emits the subset | Modify — add `T.LOCF_Imputation`, add output-class vocabulary file |
| `demo/data/study-graph.js` | CDISC Pilot study layer | Modify — 2 ICE concepts, estimands, ascertainment traces |
| `demo/data/study-graph-pre0102.js` | PrE0102 study layer | Modify — 1 real ICE, estimands, ascertainment trace |
| `demo/data/lang-overlay.js` | EN/FR/DE rendering packs | Modify — sentence templates, ICE + summary phrases, output-class prose |
| `demo/index.html` | The four demo stops | Modify — `ctx.lib` reads, estimand panel, ICE trace wiring |
| `tools/verify.mjs` | Engine + golden gate | Modify — estimand assertions, 4 new planted faults |
| `tools/verify-ui.mjs` | Headless DOM gate | Modify — estimand walkthrough checks |
| `DESIGN.md` | Design record | Modify — D11–D15, planned → delivered |
| `REFERENCE.md`, `GETTING-STARTED.md`, `WALKTHROUGH.md`, `README.md` | Docs | Modify — new roles, kind, trace axis, session beat |

---

## Task 1: Role overlay plumbing

New roles are library content that is not upstream, so they must arrive through the D8 overlay and be
visible everywhere the library's role registry is read. Ships no phrases — this task only proves a
proposed role reaches `ctx.lib` at the right index and that nothing else moves.

**Files:**
- Modify: `smartphrase/demo/engine.js:18-40` (`ctxOf`)
- Modify: `smartphrase/demo/data/acdc-library-proposed.js`
- Modify: `smartphrase/demo/index.html:328,537` (and every other `LIB.` read)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `ctx.lib.roleDefinitions.order` containing `ice_handling` immediately after `grouping` and
  `summary_measure` last; `ctx.lib.roleDefinitions.roles[<new>].proposed === true`.

- [x] **Step 1: Write the failing assertions in `verify.mjs`**

Add to the `/* ---- proposed library additions ---- */` block:

```js
  /* Proposed ROLES reach ctx.lib at their declared insertion point, and the
     generated subset is untouched — the same overlay discipline as templates. */
  const order = ctx.lib.roleDefinitions.order;
  check("proposed role ice_handling is in ctx.lib order", order.indexOf("ice_handling") !== -1);
  check("proposed role summary_measure is in ctx.lib order", order.indexOf("summary_measure") !== -1);
  check(
    "ice_handling sits immediately after grouping",
    order.indexOf("ice_handling") === order.indexOf("grouping") + 1,
    order.join(",")
  );
  check("summary_measure sits last", order[order.length - 1] === "summary_measure", order.join(","));
  check(
    "generated subset role order is not mutated",
    LIB.roleDefinitions.order.indexOf("ice_handling") === -1
  );
  check(
    "proposed roles are flagged proposed",
    ["ice_handling", "summary_measure"].every(
      (r) => ctx.lib.roleDefinitions.roles[r] && ctx.lib.roleDefinitions.roles[r].proposed === true
    )
  );
```

- [x] **Step 2: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL, 6 problems, first being `proposed role ice_handling is in ctx.lib order`.

- [x] **Step 3: Declare the roles in the overlay**

In `demo/data/acdc-library-proposed.js`, add a `roleDefinitions` block before `transformations`. The
`order_after` field is overlay-only metadata consumed by `ctxOf` — it is not upstream shape, so it is
commented as such:

```js
    /*
     * Two new phrase roles — a library MINOR-VERSION event, not a study
     * addition. `order_after` is overlay-only plumbing (upstream carries a
     * flat `order` array): it declares where each role splices into the
     * generated subset's order, so the overlay never restates upstream order
     * and cannot silently reorder existing roles. "last" appends.
     */
    roleDefinitions: {
      roles: {
        ice_handling: {
          label: "ICE Handling",
          contextSource: "manual",
          repeating: true,
          order_after: "grouping",
          description: "ICH E9(R1) attribute 4 — the strategy applied to an intercurrent event. Repeating: one phrase per declared ICE."
        },
        summary_measure: {
          label: "Summary Measure",
          contextSource: "manual",
          order_after: "last",
          description: "ICH E9(R1) attribute 5 — the population-level summary, bound to a method output class."
        }
      }
    },
```

- [x] **Step 4: Merge role definitions in `ctxOf`**

In `engine.js`, inside `ctxOf`'s `if (pro) { ... }` block, after the `smartPhrases` merge:

```js
      /* Proposed ROLES splice into the generated order at their declared
         position — appending would put ice_handling after covariate. The
         generated subset's arrays are copied, never mutated. */
      if (pro.roleDefinitions && pro.roleDefinitions.roles) {
        var newOrder = lib.roleDefinitions.order.slice();
        var newRoles = Object.assign({}, lib.roleDefinitions.roles);
        Object.keys(pro.roleDefinitions.roles).forEach(function (name) {
          var def = pro.roleDefinitions.roles[name];
          newRoles[name] = Object.assign({}, def, { proposed: true });
          if (newOrder.indexOf(name) !== -1) return;
          var after = def.order_after;
          var at = after && after !== "last" ? newOrder.indexOf(after) : -1;
          if (at === -1) newOrder.push(name);
          else newOrder.splice(at + 1, 0, name);
        });
        merged.roleDefinitions = Object.assign({}, lib.roleDefinitions, {
          order: newOrder, roles: newRoles
        });
      }
```

- [x] **Step 5: Run the gate — role assertions pass, goldens unchanged**

Run: `node smartphrase/tools/verify.mjs`
Expected: PASS, 69 outputs. **If any golden changed, stop and investigate** — adding an unused role must
not alter any output. (The default sentence template in `resolveInstance` is only used when no language
pack exists, and `en` always exists, so the new role tokens cannot leak into prose yet.)

- [x] **Step 6: Route every `index.html` library read through `ctx.lib`**

Replace all `LIB.` reads with `ctx.lib.` — lines 328, 379, 537, 557, 650, 837, 844. Keep `var LIB` as the
raw global only where the overlay must *not* apply (nowhere, currently). At line 328:

```js
  /* Read the role registry off ctx.lib, not the raw global: proposed roles are
     merged in ctxOf and would be invisible here otherwise. Same bug class as
     the proposedProvenance note that #9's UI gate caught. */
  var ROLE_LABELS = ctx.lib.roleDefinitions.roles;
```

`switchStudy` rebuilds `ctx`, so also reassign `ROLE_LABELS` there alongside the existing `TRACEABLE`
reassignment at line 341.

- [x] **Step 7: Assert it in the UI gate**

In `verify-ui.mjs`, after the pilot model-panel checks:

```js
check("model panel role labels come from the merged library",
  !!doc.getElementById("modelPanel").innerHTML, "panel empty");
```

Then add a stronger check once phrases exist (Task 3). For now, run all three gates.

Run: `node smartphrase/tools/verify.mjs && node smartphrase/tools/build-library-subset.mjs --check && NODE_PATH=<scratchpad>/domtest/node_modules node smartphrase/tools/verify-ui.mjs`
Expected: three PASS lines.

- [x] **Step 8: Commit**

```bash
git add smartphrase/demo/engine.js smartphrase/demo/data/acdc-library-proposed.js \
        smartphrase/demo/index.html smartphrase/tools/verify.mjs smartphrase/tools/verify-ui.mjs
git commit -m "Merge proposed phrase roles through the overlay, read roles from ctx.lib"
```

---

## Task 2: Optional groups in the sentence template

ICE clauses need surrounding commas. Today, punctuation in the frame would strand on every instance
without an ICE. This task extends the template language *before* anything needs it, and proves all 69
existing outputs are byte-identical.

**Files:**
- Modify: `smartphrase/demo/engine.js:175-226` (`resolveInstance`)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: Task 1's merged role order.
- Produces: `[` … `]` in any `sentence_template` marks a group emitted only when at least one role token
  inside it resolves to a phrase.

- [x] **Step 1: Write the failing assertions in `verify.mjs`**

Add a new block after the planted faults:

```js
/* ---- sentence-template optional groups ---- */
{
  const graph = graphs.CDISCPILOT01;
  const base = graph.instances[0];
  /* A pack whose template wraps an absent role in punctuation: the whole
     group must vanish, not strand its comma. `covariate` is present in this
     instance and `ice_handling` has no phrases yet, so one group renders and
     the other disappears. */
  const probe = {
    en: {
      name: "probe",
      sentence_template:
        "{endpoint}[, ICE: {ice_handling}][, COV: {covariate}] will be assessed as {sentenceRole}."
    }
  };
  const pctx = E.ctxOf(LIB, graph, probe);
  const s = E.resolveInstance(pctx, base, "en").sentence;
  check("optional group with no phrases is elided entirely", !s.includes("ICE:"), s);
  check("optional group with a phrase is kept", s.includes("COV:"), s);
  check("eliding leaves no stranded punctuation", !/,\s*,/.test(s) && !/,\s*will be/.test(s), s);
}
```

- [x] **Step 2: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL — `optional group with no phrases is elided entirely` (the literal `[`/`]` characters
appear in the output because nothing strips them).

- [x] **Step 3: Implement segmentation in `resolveInstance`**

Insert before the `var parts = [];` line:

```js
    /*
     * A sentence template is a sequence of segments. `[ ... ]` marks an
     * OPTIONAL group: it is emitted only if at least one role token inside it
     * resolves to a phrase, so punctuation belonging to an optional clause
     * disappears with the clause instead of stranding a comma. Existing packs
     * use no brackets and are unaffected (their frame text is pure whitespace,
     * which the normaliser already collapses).
     */
    function segmentsOf(t) {
      var segs = [];
      var re = /\[([^\]]*)\]/g;
      var last = 0, mm;
      while ((mm = re.exec(t))) {
        if (mm.index > last) segs.push({ text: t.slice(last, mm.index), optional: false });
        segs.push({ text: mm[1], optional: true });
        last = mm.index + mm[0].length;
      }
      if (last < t.length) segs.push({ text: t.slice(last), optional: false });
      return segs;
    }
    function segHasPhrase(t) {
      var toks = t.match(/\{([a-zA-Z_]+)\}/g) || [];
      return toks.some(function (tk) {
        var role = tk.slice(1, -1);
        return resolved.some(function (rp) { return rp.role === role; });
      });
    }
```

Then replace the `tmpl.split(...)` loop's driver so it runs per segment. Change:

```js
    tmpl.split(/(\{[a-zA-Z_]+\})/).forEach(function (seg) {
```

to:

```js
    segmentsOf(tmpl).forEach(function (group) {
      if (group.optional && !segHasPhrase(group.text)) return;
      group.text.split(/(\{[a-zA-Z_]+\})/).forEach(function (seg) {
```

and close the extra `});` at the end of that loop body.

- [x] **Step 4: Run the gate — new assertions pass, all 69 goldens byte-identical**

Run: `node smartphrase/tools/verify.mjs`
Expected: PASS, 69 outputs, **zero golden changes**. If a golden moved, the refactor changed existing
behaviour — stop and diff it.

- [x] **Step 5: Commit**

```bash
git add smartphrase/demo/engine.js smartphrase/tools/verify.mjs
git commit -m "Add optional [...] groups to the sentence template language"
```

---

## Task 3: IntercurrentEvent kind and the five strategy phrases

**Files:**
- Modify: `smartphrase/demo/data/acdc-library-proposed.js`
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: `ice_handling` role from Task 1.
- Produces: `SP_ICE_TREATMENT_POLICY`, `SP_ICE_HYPOTHETICAL`, `SP_ICE_COMPOSITE`,
  `SP_ICE_WHILE_ON_TREATMENT`, `SP_ICE_PRINCIPAL_STRATUM`, each with `anchors.icheStrategy` matching an
  `IchE9R1Strategy` enum value and `anchors.implementation` naming the transformation pattern
  `IceHandling.implementedBy` expects. `{ice}` binds `concept_constraint: "IntercurrentEvent"`.

- [x] **Step 1: Write the failing assertions in `verify.mjs`**

```js
/* ---- ICH E9(R1) strategy phrase coverage ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  /* The five enum values of IchE9R1Strategy in study_esap.schema.yaml on
     methods_02. One phrase per strategy, no more and no fewer — a strategy
     with no phrase is an estimand the layer cannot express. */
  const STRATEGIES = ["TreatmentPolicy", "Hypothetical", "Composite",
                      "WhileOnTreatment", "PrincipalStratum"];
  const icePhrases = ctx.lib.smartPhrases.filter((p) => p.role === "ice_handling");
  check("every ICH E9(R1) strategy has exactly one phrase",
    STRATEGIES.every((s) => icePhrases.filter((p) => p.anchors.icheStrategy === s).length === 1),
    icePhrases.map((p) => p.oid + "=" + p.anchors.icheStrategy).join(", "));
  check("no ice_handling phrase claims an unknown strategy",
    icePhrases.every((p) => STRATEGIES.indexOf(p.anchors.icheStrategy) !== -1));
  check("every ice_handling phrase binds an IntercurrentEvent concept",
    icePhrases.every((p) => p.placeholders.some(
      (ph) => ph.name === "ice" && ph.concept_constraint === "IntercurrentEvent")));
  check("every ice_handling phrase declares its implementation pattern",
    icePhrases.every((p) => typeof p.anchors.implementation === "string"));
  check("only TreatmentPolicy needs no implementing transformation",
    icePhrases.filter((p) => p.anchors.implementation === "none")
      .every((p) => p.anchors.icheStrategy === "TreatmentPolicy"));
}
```

- [x] **Step 2: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL — `every ICH E9(R1) strategy has exactly one phrase` (no `ice_handling` phrases exist).

- [x] **Step 3: Add the five phrases to the overlay**

In `demo/data/acdc-library-proposed.js`, add a `smartPhrases` array. The `implementation` values are
copied from `IceHandling.implementedBy`'s own upstream documentation, so the phrase layer and the model
layer name the same patterns:

```js
    /*
     * One smartphrase per ICH E9(R1) strategy. The strategy is carried in
     * `anchors.icheStrategy` (an IchE9R1Strategy enum value) rather than being
     * inferred from the OID, so model→SAP is a lookup, not string surgery.
     *
     * `anchors.implementation` names the transformation pattern that
     * operationalises the strategy — the values are taken verbatim from
     * IceHandling.implementedBy's own documentation on methods_02, so the two
     * layers agree on semantics. "none" is correct for TreatmentPolicy: data
     * are used as observed, and there is nothing to implement.
     */
    smartPhrases: [
      {
        oid: "SP_ICE_TREATMENT_POLICY",
        name: "Intercurrent event — treatment policy strategy",
        role: "ice_handling",
        phrase_template: "regardless of {ice}",
        anchors: { icheStrategy: "TreatmentPolicy", implementation: "none" },
        placeholders: [ICE_SLOT]
      },
      {
        oid: "SP_ICE_HYPOTHETICAL",
        name: "Intercurrent event — hypothetical strategy",
        role: "ice_handling",
        phrase_template: "as if {ice} had not occurred",
        anchors: { icheStrategy: "Hypothetical", implementation: "imputation" },
        placeholders: [ICE_SLOT]
      },
      {
        oid: "SP_ICE_COMPOSITE",
        name: "Intercurrent event — composite strategy",
        role: "ice_handling",
        phrase_template: "with {ice} treated as {outcome}",
        anchors: { icheStrategy: "Composite", implementation: "derivation" },
        placeholders: [ICE_SLOT, {
          name: "outcome",
          kind: "concept_ref",
          concept_class: "Outcome",
          concept_constraint: "Outcome",
          value_source: "study_registry",
          render_options: ["label", "name"],
          default_render: "name",
          required: true
        }]
      },
      {
        oid: "SP_ICE_WHILE_ON_TREATMENT",
        name: "Intercurrent event — while on treatment strategy",
        role: "ice_handling",
        phrase_template: "using measurements taken prior to {ice}",
        anchors: { icheStrategy: "WhileOnTreatment", implementation: "censoring" },
        placeholders: [ICE_SLOT]
      },
      {
        oid: "SP_ICE_PRINCIPAL_STRATUM",
        name: "Intercurrent event — principal stratum strategy",
        role: "ice_handling",
        phrase_template: "in the stratum of participants in whom {ice} would not occur",
        anchors: { icheStrategy: "PrincipalStratum", implementation: "population_subsetting" },
        placeholders: [ICE_SLOT]
      }
    ],
```

Define `ICE_SLOT` once above `g.ACDC_LIBRARY_PROPOSED`, inside the IIFE, since all five share it:

```js
  /* All five strategy phrases bind the same slot — one ICE per phrase. */
  var ICE_SLOT = {
    name: "ice",
    kind: "concept_ref",
    concept_class: "IntercurrentEvent",
    concept_constraint: "IntercurrentEvent",
    value_source: "study_registry",
    render_options: ["label", "name", "name_with_label"],
    default_render: "name",
    required: true
  };
```

Note: `ICE_SLOT` is shared by reference across five phrase definitions. That is safe because nothing
mutates placeholder objects — but state it in the comment so a later change does not break it silently.

- [x] **Step 4: Extend the overlay provenance block**

The existing `provenance` says `authored_for: "issue #9 …"`. Add the second work item rather than
overwriting:

```js
    provenance: {
      status: "proposed",
      authored_for: [
        "issue #9 — breast cancer worked example (PrE0102)",
        "issue #11 — estimands and intercurrent events"
      ],
      not_in: "methods_02@ffee5df",
      rationale: "..." // keep existing text, append the #11 sentence
    },
```

**Check every consumer of `provenance.authored_for`** before changing its type from string to array —
`grep -rn "authored_for" smartphrase/` — and update `index.html`'s `renderStandards` if it renders it.

- [x] **Step 5: Run the gate**

Run: `node smartphrase/tools/verify.mjs`
Expected: PASS, 69 outputs, no golden changes (phrases exist but no instance uses them yet).

- [x] **Step 6: Commit**

```bash
git add smartphrase/demo/data/acdc-library-proposed.js smartphrase/tools/verify.mjs
git commit -m "Add the five ICH E9(R1) strategy smartphrases to the proposed overlay"
```

---

## Task 4: `output_ref` placeholder kind and the summary-measure phrase

Requirement 4: the summary named in prose must be an output the bound method provably produces. This is
enforced in `resolveBinding`, so a wrong summary measure is a resolution error, not a silent mismatch.

**Files:**
- Modify: `smartphrase/tools/build-library-subset.mjs` (add the output-class vocabulary)
- Regenerate: `smartphrase/demo/data/acdc-library.js`
- Modify: `smartphrase/demo/engine.js` (`resolveBinding`, `resolvePhrase`, `resolveInstance`, `parseMacroText`)
- Modify: `smartphrase/demo/data/acdc-library-proposed.js` (`SP_SUMMARY_MEASURE`)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: `summary_measure` role from Task 1.
- Produces: `ctx.lib.outputClasses` (verbatim upstream subset); placeholder `kind: "output_ref"`;
  `resolveBinding(ctx, ph, binding, lang, tpl)` and `resolvePhrase(ctx, pi, lang, tpl)` — the 5th/4th
  parameters are optional, so existing callers keep working.

- [x] **Step 1: Write the failing assertions in `verify.mjs`**

```js
/* ---- summary measure is verifiable, not decorative ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const tpl = E.templateDef(ctx, "T.CFB_ANCOVA");
  const def = E.phraseDef(ctx, "SP_SUMMARY_MEASURE");
  check("SP_SUMMARY_MEASURE exists", !!def);
  check("output classes are in the library subset", !!ctx.lib.outputClasses);

  /* contrasts_t IS produced by T.CFB_ANCOVA. */
  const good = E.resolvePhrase(
    ctx, { phrase: "SP_SUMMARY_MEASURE", bindings: { summary: { output: "contrasts_t" } } }, "en", tpl);
  check("a real method output resolves", good.errors.length === 0, JSON.stringify(good.errors));

  /* median_survival is a real output CLASS but T.CFB_ANCOVA/M.ANCOVA does not
     produce it — the whole point of requirement 4. */
  const bad = E.resolvePhrase(
    ctx, { phrase: "SP_SUMMARY_MEASURE", bindings: { summary: { output: "median_survival" } } }, "en", tpl);
  check("planted fault: summary the method cannot produce is rejected",
    bad.errors.length > 0, JSON.stringify(bad.errors));

  const nonsense = E.resolvePhrase(
    ctx, { phrase: "SP_SUMMARY_MEASURE", bindings: { summary: { output: "not_an_output" } } }, "en", tpl);
  check("planted fault: unknown output class is rejected", nonsense.errors.length > 0);
}
```

- [x] **Step 2: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL — `SP_SUMMARY_MEASURE exists` and `output classes are in the library subset`.

- [x] **Step 3: Add the output-class vocabulary to the generator**

In `tools/build-library-subset.mjs`, after `TRANSFORMATION_LIB`:

```js
const OUTPUT_CLASS_VOCAB = "lib/vocabulary/output_class_templates.json";
```

and a selection list beside the others:

```js
/* Output classes the demo's templates declare. Selected explicitly so the
   subset stays small and the selection stays auditable. */
const SELECT_OUTPUT_CLASSES = [
  "ls_means", "contrasts_t", "type3_tests_f", "parameter_estimates_linear",
  "fit_statistics_linear", "median_survival", "survival_table",
  "event_summary", "landmark_estimates"
];
```

Read and filter, failing loudly on a typo exactly as the transformation selection does:

```js
const vocab = JSON.parse(gitShow(OUTPUT_CLASS_VOCAB)).output_class_templates;
const outputClasses = {};
SELECT_OUTPUT_CLASSES.forEach(function (id) {
  if (!vocab[id]) {
    console.error(`FAIL — output class not found upstream: ${id}`);
    process.exit(1);
  }
  outputClasses[id] = vocab[id];
});
```

Add `T.LOCF_Imputation` to `SELECT_TRANSFORMATIONS` (needed by Task 6 — do it now so the file is
regenerated once):

```js
const SELECT_TRANSFORMATIONS = [
  "T.BaselineSelection",
  "T.ChangeFromBaseline",
  "T.CFB_ANCOVA",
  /* Implements the Hypothetical strategy for the Pilot estimand — real
     upstream content, referenced by IceHandling.implementedBy (issue #11). */
  "T.LOCF_Imputation"
];
```

Add both to the emitted `library` object and to `provenance.files`:

```js
    files: [TRANSFORMATION_LIB, OUTPUT_CLASS_VOCAB].concat(methodFiles),
...
  outputClasses: outputClasses,
```

Place `outputClasses` after `methods` so the diff to the generated file is append-only where possible.

- [x] **Step 4: Regenerate and confirm the gate agrees**

```bash
node smartphrase/tools/build-library-subset.mjs
node smartphrase/tools/build-library-subset.mjs --check
```
Expected: `wrote …` then `PASS — acdc-library.js matches generator output.`

- [x] **Step 5: Run the engine gate to see whether adding upstream content moved any output**

Run: `node smartphrase/tools/verify.mjs`
Expected: the Task 4 Step 1 failures only. **No golden may change** — `T.LOCF_Imputation` and
`outputClasses` are additive and no instance references them. If a golden moved, stop: something reads
the transformation list positionally.

- [x] **Step 6: Thread the template through binding resolution**

In `engine.js`, change three signatures (all new parameters optional):

```js
  function resolveBinding(ctx, ph, binding, lang, tpl) {
```
```js
  function resolvePhrase(ctx, pi, lang, tpl) {
```
and inside `resolvePhrase`, pass it on:
```js
      var r = resolveBinding(ctx, ph, b, lang, tpl);
```
In `resolveInstance`, resolve the template once and pass it:
```js
    var tpl = templateDef(ctx, instance.template);
    var resolved = instance.phrases.map(function (pi) { return resolvePhrase(ctx, pi, lang, tpl); });
```
In `parseMacroText`, the local `tpl` is already in scope at the `resolveBinding` call:
```js
        var check = resolveBinding(ctx, ph, b, "en", tpl);
```

- [x] **Step 7: Handle `output_ref` in `resolveBinding`**

Insert before the `method_ref` branch (so `binding.output` is matched before the concept fallback):

```js
    if (ph.kind === "output_ref" || binding.output !== undefined) {
      var oc = (ctx.lib.outputClasses || {})[binding.output];
      if (!oc) return { error: "unknown output class '" + binding.output + "'" };
      /* Requirement 4: the summary must be an output the bound method
         provably produces. Checked against BOTH the template's declared
         output measures and the method's own outputs[] — a template may
         declare a subset, and neither list alone is authoritative. */
      if (tpl) {
        var declared = ((tpl.outputDataStructure || {}).measures || [])
          .map(function (om) { return om.output; });
        if (declared.indexOf(binding.output) === -1) {
          return { error: "output '" + binding.output + "' is not produced by template " +
                          tpl.conceptId + " (declares: " + declared.join(", ") + ")" };
        }
        var md = ctx.lib.methods[tpl.usesMethod];
        var produced = md ? (md.outputs || []).map(function (o) { return o.name; }) : [];
        if (md && produced.indexOf(binding.output) === -1) {
          return { error: "output '" + binding.output + "' is not produced by method " +
                          tpl.usesMethod };
        }
      }
      var ocl = localiseEntity(ctx, lang, "outputClasses", binding.output, oc);
      var omode = binding.render || ph.default_render || "name";
      return { text: renderEntity(ocl, omode),
               detail: { kind: "output", id: binding.output, render: omode,
                         statistics: oc.statistics, libraryLabel: oc.label } };
    }
```

`detail.libraryLabel` deliberately keeps the *upstream* label alongside the localised prose, so the
inspect panel can show both — finding F made visible rather than hidden.

- [x] **Step 8: Add `SP_SUMMARY_MEASURE` to the overlay**

Append to the overlay's `smartPhrases`:

```js
      {
        oid: "SP_SUMMARY_MEASURE",
        name: "Population-level summary measure",
        role: "summary_measure",
        phrase_template: "summarised as {summary}",
        anchors: { estimandAttribute: "PopulationLevelSummary" },
        placeholders: [{
          name: "summary",
          kind: "output_ref",
          value_source: "method_outputs",
          render_options: ["label", "name"],
          default_render: "name",
          required: true,
          description: "A MethodOutput the bound method produces — the model hook is Analysis.summarizedByOutputClass."
        }]
      }
```

- [x] **Step 9: Teach the tag dialect the new slot kind**

`toMacroText` writes `b.concept || b.method || b.value` (line 447) and `parseMacroText` builds bindings by
`ph.kind` (lines 516-518). Both need `output`:

```js
        attrs.push(slot + '="' + (b.concept || b.method || b.value || b.output) + '"');
```
```js
        if (ph.kind === "value") b = { value: raw };
        else if (ph.kind === "method_ref") b = { method: raw };
        else if (ph.kind === "output_ref") b = { output: raw };
        else b = { concept: raw };
```

Also `bindingConceptId` (line 233) and `toJSONLD`'s binding loop (lines 572-584) — add `output` so the
JSON-LD projection emits the summary measure. In `toJSONLD`:

```js
        } else if (b.output) {
          bnodes.push({ "sp:slot": slot, "acdc:outputClass": b.output,
                        "esap:summarizedByOutputClass": b.output });
```

- [x] **Step 10: Run the gate**

Run: `node smartphrase/tools/verify.mjs`
Expected: PASS. The three Task 4 assertions pass; all 69 goldens unchanged.

- [x] **Step 11: Commit**

```bash
git add smartphrase/tools/build-library-subset.mjs smartphrase/demo/data/acdc-library.js \
        smartphrase/demo/engine.js smartphrase/demo/data/acdc-library-proposed.js \
        smartphrase/tools/verify.mjs
git commit -m "Add output_ref placeholder kind and the summary-measure phrase, validated against method outputs"
```

---

## Task 5: The estimand at instance level, and typed `analysisRole`

Per deviation E, this **adds** typed fields beside `sentenceRole` rather than replacing it.

**Files:**
- Modify: `smartphrase/demo/data/study-graph.js` (estimand blocks on 3 instances)
- Modify: `smartphrase/demo/engine.js` (`constructModelView`, `toJSONLD`)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `instance.estimand = { id, iri, iri_status, label, rank }` and
  `instance.analysisRole ∈ {MainEstimator, SensitivityAnalysis, SupplementaryAnalysis}`;
  `constructModelView(...).estimand` and `.analysisRole`.

- [x] **Step 1: Write the failing assertions in `verify.mjs`**

Inside the per-instance loop, after the model-view checks:

```js
    /* Estimand attribution. Every analysis instance belongs to exactly one
       estimand and states its ICH E9(R1) role for that estimand. */
    check(`${studyKey}/${inst.id} declares an estimand`, !!inst.estimand, "no estimand block");
    check(`${studyKey}/${inst.id} declares a typed analysisRole`,
      ["MainEstimator", "SensitivityAnalysis", "SupplementaryAnalysis"].indexOf(inst.analysisRole) !== -1,
      String(inst.analysisRole));
    check(`${studyKey}/${inst.id} model view carries the estimand`, !!mv.estimand);
```

and after the loop over each study's instances:

```js
  /* Exactly one MainEstimator per estimand — ICH E9(R1) via
     Analysis.analysisRole's own upstream documentation. */
  const byEstimand = {};
  graph.instances.forEach((i) => {
    const k = i.estimand && i.estimand.id;
    if (!k) return;
    byEstimand[k] = byEstimand[k] || [];
    byEstimand[k].push(i);
  });
  Object.keys(byEstimand).forEach((k) => {
    const mains = byEstimand[k].filter((i) => i.analysisRole === "MainEstimator");
    check(`${studyKey}/${k} has exactly one MainEstimator`, mains.length === 1,
      mains.map((i) => i.id).join(", ") || "none");
  });
```

- [x] **Step 2: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL — one `declares an estimand` failure per instance across both studies (7), plus the
`analysisRole` and `model view carries the estimand` failures.

- [x] **Step 3: Add estimand blocks to the CDISC Pilot instances**

Only `study-graph.js` in this step — PrE0102 comes in Task 8. For each of `AC.PRIMARY.ADASCOG`,
`AC.SEC.NPIX`, `AC.SUPP.ADASCOG.WK16`, add beside `sentenceRole`:

```js
        /*
         * The estimand is instance-level metadata, not a phrase: four of the
         * five ICH E9(R1) attributes are already carried by the phrases
         * (treatment→grouping, variable→endpoint/parameter/timepoint,
         * population→population). `rank` is what makes "a secondary analysis"
         * renderable: AnalysisRole is per-estimand, so a secondary analysis is
         * the MainEstimator OF a secondary estimand — the display string needs
         * both, which is why sentenceRole is kept rather than derived.
         */
        estimand: {
          id: "EST.PRIMARY",
          iri: "usdm:Estimand/CDISCPILOT01-EST-PRIMARY", iri_status: "illustrative",
          label: "Primary estimand — ADAS-Cog(11) change at Week 24",
          rank: "primary"
        },
        analysisRole: "MainEstimator",
```

`AC.SEC.NPIX` → `EST.SECONDARY.NPIX` / `rank: "secondary"` / `MainEstimator` (it is the main estimator of
its own secondary estimand). `AC.SUPP.ADASCOG.WK16` → `estimand: EST.PRIMARY` (same estimand) with
`analysisRole: "SupplementaryAnalysis"` — a supplementary analysis of the primary estimand, which is the
honest reading of a Week 16 supporting analysis and gives the one-MainEstimator check something real to
verify.

- [x] **Step 4: Emit the estimand in the model view**

In `constructModelView`'s return object, after `instance`/`iri`:

```js
      /* eSAP: the Analysis sits under Estimand.hasTransformation, and states
         its role for that estimand via Analysis.analysisRole. */
      estimand: instance.estimand || null,
      analysisRole: instance.analysisRole || null,
```

- [x] **Step 5: Emit it in the JSON-LD projection**

In `toJSONLD`'s return object, after `usdm:objective`:

```js
      "usdm:estimand": instance.estimand && {
        "@id": instance.estimand.iri, "rdfs:label": instance.estimand.label
      },
      "esap:analysisRole": instance.analysisRole || null,
```

- [x] **Step 6: Run the gate and recapture the intended golden changes**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL with `golden changed` for the 3 Pilot `modelView` and `jsonld` entries — **this change is
intended**. PrE0102's four instances still fail the `declares an estimand` check; that is Task 8.

Inspect each reported diff and confirm it adds only `estimand`, `analysisRole`, `usdm:estimand` and
`esap:analysisRole`. Then:

```bash
node smartphrase/tools/verify.mjs --update-goldens
node smartphrase/tools/verify.mjs
```
Expected after update: the only remaining failures are PrE0102's missing estimand blocks. **Do not
proceed past Task 8 with a red gate** — Tasks 6 and 7 are engine-only and may be committed with this
known, named failure, but each commit message must say so.

To avoid committing a red gate at all, do Task 8's Step 3 (PrE0102 estimand blocks) now as part of this
task. **Preferred:** add PrE0102's four estimand blocks here, leaving only the ICE work for Task 8.

- [x] **Step 7: Add estimand blocks to the PrE0102 instances**

`AC.PRIMARY.PFS` → `EST.PFS` (`rank: "primary"`, `MainEstimator`); `AC.SENS.PFS.ITT` → **the same**
`EST.PFS` with `analysisRole: "SensitivityAnalysis"` — the SAP's own §7.7.2 sensitivity analysis, so this
pairing is source-grounded, and it is what makes the one-MainEstimator check meaningful. `AC.SEC.OS` →
`EST.OS` (`secondary`, `MainEstimator`); `AC.SEC.TTP` → `EST.TTP` (`secondary`, `MainEstimator`).

Each carries a `sapRef`-style note in the estimand label where the source supports it, e.g.
`label: "Primary estimand — progression-free survival (SAP 3.1, 7.7.2)"`.

- [x] **Step 8: Recapture, verify green, commit**

```bash
node smartphrase/tools/verify.mjs --update-goldens
node smartphrase/tools/verify.mjs
node smartphrase/tools/build-library-subset.mjs --check
NODE_PATH=<scratchpad>/domtest/node_modules node smartphrase/tools/verify-ui.mjs
git add smartphrase/demo/data/study-graph.js smartphrase/demo/data/study-graph-pre0102.js \
        smartphrase/demo/engine.js smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "Attribute every analysis to an estimand with a typed ICH E9(R1) analysis role"
```

---

## Task 6: `IceHandling` emission and `implementedBy` resolution

Requirement 3: a strategy is not merely asserted in prose; it resolves to the transformation(s) that
operationalise it. Enforced, so a Hypothetical strategy with nothing to implement it is an error.

**Files:**
- Modify: `smartphrase/demo/engine.js` (`constructModelView`, `resolveBinding`)
- Modify: `smartphrase/demo/data/study-graph.js` (ICE concepts with `implementedBy`)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: strategy phrases (Task 3), estimands (Task 5), `T.LOCF_Imputation` in the subset (Task 4).
- Produces: `constructModelView(...).handlesIntercurrentEvent` — an array of
  `{ forIntercurrentEvent, icheStrategy, implementedBy: [{transformationId}] }`, matching `IceHandling`
  in `study_esap.schema.yaml`.

- [x] **Step 1: Add the two Pilot ICE concepts**

In `study-graph.js` `concepts`. The `implementedBy` map is keyed by strategy — **on the ICE, not on the
estimand** — so a per-estimand override automatically picks up the right implementer without duplicating
the ICE (requirement 6):

```js
      /*
       * Intercurrent events. New registry kind, grounding in
       * usdm:IntercurrentEvent. `ascertainedBy` mirrors the eSAP model's
       * OccurrenceCriterion shape (BC ▸ property ▸ code path, one path named
       * once) and is STRATEGY-INDEPENDENT — the same ascertainment is reused
       * whichever strategy an estimand applies, which is why the ICE trace is
       * a separate axis from the analysis-value trace.
       *
       * `implementedBy` is keyed by strategy and lives on the ICE, so two
       * estimands handling this ICE differently each resolve to the right
       * transformation without a second copy of the event.
       *
       * ILLUSTRATIVE: the CDISC Pilot has no protocol-defined ICE list; these
       * are constructed to exercise the layer. Contrast PrE0102, whose ICE is
       * quoted from its SAP.
       */
      "ICE.TRT_DISCONT": {
        kind: "IntercurrentEvent",
        label: "treatment discontinuation",
        name: "discontinuation of study treatment",
        iri: "usdm:IntercurrentEvent/CDISCPILOT01-ICE-DISC", iri_status: "illustrative",
        icheStrategy: "Hypothetical",
        ascertainedBy: {
          arm: "collected",
          criteria: [{ property: "BC_DS_001/Disposition Event",
                       operator: "equals", responseCode: "C49489 (Treatment Discontinued)" }]
        },
        implementedBy: { Hypothetical: ["T.LOCF_Imputation"] },
        data: { dataset: "ADSL", file: "adsl.xpt", flag: "DCSREAS",
                datasetLabel: "Subject-Level Analysis Dataset",
                timing: "EOSDT", bc: "BC_DS_001", property: "Disposition Event" },
        sapRef: "ILLUSTRATIVE — not from a source SAP; constructed for issue #11"
      },
      "ICE.CONMED": {
        kind: "IntercurrentEvent",
        label: "concomitant AD medication",
        name: "use of concomitant AD medication",
        iri: "usdm:IntercurrentEvent/CDISCPILOT01-ICE-CONMED", iri_status: "illustrative",
        icheStrategy: "TreatmentPolicy",
        ascertainedBy: {
          arm: "collected",
          criteria: [{ property: "BC_CM_001/Category",
                       operator: "in", responseCode: "AD THERAPY" }]
        },
        /* TreatmentPolicy is implemented by nothing: data are used as
           observed. Upstream IceHandling.implementedBy documents this as
           "omitted", so an empty list here is correct, not missing. */
        implementedBy: { TreatmentPolicy: [] },
        data: { dataset: "ADCM", file: "adcm.xpt", flag: "CMCAT",
                datasetLabel: "Concomitant Medications Analysis Dataset",
                timing: "ASTDT", bc: "BC_CM_001", property: "Category" },
        sapRef: "ILLUSTRATIVE — not from a source SAP; constructed for issue #11"
      },
```

- [x] **Step 2: Write the failing assertions in `verify.mjs`**

```js
/* ---- IceHandling: strategy resolves to what implements it ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const base = JSON.parse(JSON.stringify(graphs.CDISCPILOT01.instances[0]));
  base.phrases.push({ phrase: "SP_ICE_HYPOTHETICAL", bindings: { ice: { concept: "ICE.TRT_DISCONT" } } });
  base.phrases.push({ phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.CONMED" } } });
  const mv = E.constructModelView(ctx, base);
  const h = mv.handlesIntercurrentEvent || [];
  check("model view emits one IceHandling per ICE phrase", h.length === 2, JSON.stringify(h));
  const hyp = h.find((x) => x.icheStrategy === "Hypothetical");
  check("Hypothetical resolves to an implementing transformation",
    hyp && hyp.implementedBy.length === 1 &&
    hyp.implementedBy[0].transformationId === "T.LOCF_Imputation", JSON.stringify(hyp));
  check("the implementing transformation is really in the library",
    !!E.templateDef(ctx, "T.LOCF_Imputation"));
  const tp = h.find((x) => x.icheStrategy === "TreatmentPolicy");
  check("TreatmentPolicy legitimately implements by nothing",
    tp && tp.implementedBy.length === 0, JSON.stringify(tp));

  /* Planted fault: a strategy the ICE has no implementer for must be an
     error, not a silently unimplemented claim. This is what stops prose and
     model drifting apart. */
  const drift = JSON.parse(JSON.stringify(graphs.CDISCPILOT01.instances[0]));
  drift.phrases.push({ phrase: "SP_ICE_HYPOTHETICAL", bindings: { ice: { concept: "ICE.CONMED" } } });
  check("planted fault: strategy with no implementer is rejected",
    E.resolveInstance(ctx, drift).errors.length > 0);
}
```

- [x] **Step 3: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL — `model view emits one IceHandling per ICE phrase`.

- [x] **Step 4: Enforce implementability in `resolveBinding`**

In the concept branch, after the `concept_category` check:

```js
    /* Requirement 3: an ICE phrase asserts a strategy; the ICE must declare a
       transformation that operationalises it. An empty list is a valid answer
       (TreatmentPolicy uses data as observed); an ABSENT key is not — that is
       prose claiming a handling the model cannot deliver. The phrase's
       anchors.implementation says whether an implementer is expected. */
    if (c.kind === "IntercurrentEvent" && ph.name === "ice" && phDef && phDef.anchors) {
      var strat = phDef.anchors.icheStrategy;
      var impl = (c.implementedBy || {})[strat];
      if (impl === undefined) {
        return { error: "intercurrent event '" + binding.concept + "' declares no handling for the " +
                        strat + " strategy" };
      }
      if (phDef.anchors.implementation !== "none" && impl.length === 0) {
        return { error: "strategy " + strat + " on '" + binding.concept +
                        "' needs an implementing transformation (" +
                        phDef.anchors.implementation + ") but declares none" };
      }
      impl.forEach(function (tid) {
        if (!templateDef(ctx, tid)) {
          return { error: "implementing transformation '" + tid + "' is not in the library" };
        }
      });
    }
```

`resolveBinding` does not currently receive the phrase definition. Add it as a 6th optional parameter
(`phDef`) and pass it from `resolvePhrase`, where `def` is already in scope:

```js
      var r = resolveBinding(ctx, ph, b, lang, tpl, def);
```
```js
  function resolveBinding(ctx, ph, binding, lang, tpl, phDef) {
```

Note the `impl.forEach` above cannot `return` an error out of the enclosing function — rewrite as a
pre-check:

```js
      var missingImpl = impl.filter(function (tid) { return !templateDef(ctx, tid); });
      if (missingImpl.length) {
        return { error: "implementing transformation(s) not in the library: " + missingImpl.join(", ") };
      }
```

Update `parseMacroText`'s call too: `resolveBinding(ctx, ph, b, "en", tpl, def)`.

- [x] **Step 5: Emit `handlesIntercurrentEvent` in the model view**

Add a helper near `boundConcepts`:

```js
  /*
   * The reified (Estimand, IntercurrentEvent, Strategy) triples this instance
   * asserts — eSAP IceHandling. Read from the ICE phrases: the strategy comes
   * from the phrase's anchors, the event from its binding, and the
   * implementing transformation(s) from the ICE concept's strategy-keyed
   * implementedBy map. Model→SAP is the reverse lookup: find the phrase whose
   * anchors.icheStrategy matches and bind the ICE.
   */
  function iceHandlings(ctx, instance) {
    var out = [];
    instance.phrases.forEach(function (pi) {
      var def = phraseDef(ctx, pi.phrase);
      if (!def || def.role !== "ice_handling") return;
      var b = (pi.bindings || {}).ice;
      var c = b && concept(ctx, b.concept);
      if (!c) return;
      var strat = def.anchors.icheStrategy;
      out.push({
        forIntercurrentEvent: b.concept,
        label: c.name,
        icheStrategy: strat,
        studyDefaultStrategy: c.icheStrategy || null,
        isOverride: !!c.icheStrategy && c.icheStrategy !== strat,
        implementedBy: ((c.implementedBy || {})[strat] || []).map(function (tid) {
          return { transformationId: tid };
        }),
        fromPhrase: def.oid
      });
    });
    return out;
  }
```

Export it on `SP_ENGINE` and add to `constructModelView`'s return object after `estimand`:

```js
      handlesIntercurrentEvent: iceHandlings(ctx, instance),
```

`isOverride` is what makes requirement 6 visible: the ICE carries a study-default `icheStrategy`, and an
estimand applying a different one is flagged rather than silently diverging.

- [x] **Step 6: Run the gate**

Run: `node smartphrase/tools/verify.mjs`
Expected: PASS on the new assertions; `golden changed` for all 7 `modelView` entries (each gains an empty
`handlesIntercurrentEvent: []`). Confirm the diff is only that addition, then `--update-goldens` and
re-run.

- [x] **Step 7: Commit**

```bash
git add smartphrase/demo/engine.js smartphrase/demo/data/study-graph.js \
        smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "Emit eSAP IceHandling triples and enforce that a strategy resolves to its implementer"
```

---

## Task 7: The intercurrent-event ascertainment trace

Requirement 5: an ICE phrase can be followed to how its per-subject occurrence is ascertained, and on to
the data — a different trace axis from the analysis-value traces of #9.

**Files:**
- Modify: `smartphrase/demo/engine.js` (`buildTrace`)
- Modify: `smartphrase/demo/data/study-graph.js` (`traceTemplates.ice_handling`)
- Modify: `smartphrase/demo/index.html` (`showTrace`)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: ICE concepts (Task 6).
- Produces: `buildTrace(ctx, instance, role, focusConceptId)` — the 4th parameter is optional; when given,
  that concept's `data` keys take precedence over role order.

- [x] **Step 1: Write the failing assertions in `verify.mjs`**

```js
/* ---- ICE ascertainment trace: a distinct axis, focused per ICE ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const inst = JSON.parse(JSON.stringify(graphs.CDISCPILOT01.instances[0]));
  inst.phrases.push({ phrase: "SP_ICE_HYPOTHETICAL", bindings: { ice: { concept: "ICE.TRT_DISCONT" } } });
  inst.phrases.push({ phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.CONMED" } } });

  const a = E.buildTrace(ctx, inst, "ice_handling", "ICE.TRT_DISCONT");
  const b = E.buildTrace(ctx, inst, "ice_handling", "ICE.CONMED");
  check("ICE trace exists", !!a && !!b);
  /* Two ICEs in one instance must trace to DIFFERENT data. Unfocused, role
     order would give both the first ICE's dataset — or the endpoint's. */
  check("each ICE traces to its own dataset",
    JSON.stringify(a).includes("adsl.xpt") && JSON.stringify(b).includes("adcm.xpt"),
    JSON.stringify([a, b]).slice(0, 300));
  check("the focused ICE is not shadowed by the endpoint concept",
    !JSON.stringify(b).includes("adqsadas.xpt"), JSON.stringify(b).slice(0, 300));
  check("ICE traces leave no unfilled tokens",
    !JSON.stringify([a, b]).includes("⟨"), JSON.stringify([a, b]).slice(0, 300));
}
```

- [x] **Step 2: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL — `ICE trace exists` (no `ice_handling` trace template).

- [x] **Step 3: Add the focus parameter to `buildTrace`**

```js
  /*
   * `focusConceptId` puts one bound concept at the head of the token
   * precedence order. Required for repeating roles: two ICE phrases in one
   * instance must each trace to their OWN ascertainment, and without a focus
   * the endpoint concept's {dataset} would shadow both (role order puts
   * endpoint first, first-wins).
   */
  function buildTrace(ctx, instance, role, focusConceptId) {
    var tplChain = ctx.graph.traceTemplates[role];
    if (!tplChain) return null;

    var bound = boundConcepts(ctx, instance);
    if (focusConceptId) {
      bound = bound.filter(function (bc) { return bc.id === focusConceptId; })
        .concat(bound.filter(function (bc) { return bc.id !== focusConceptId; }));
    }
```

Then extend the derived-label block with ICE tokens, following the existing `{popName}`/`{visitLabel}`
pattern:

```js
      if (bc.c.kind === "IntercurrentEvent") {
        if (tokens["{iceLabel}"] === undefined) tokens["{iceLabel}"] = bc.c.label;
        if (tokens["{iceName}"] === undefined) tokens["{iceName}"] = bc.c.name;
        var crit = ((bc.c.ascertainedBy || {}).criteria || [])[0];
        if (crit && tokens["{criterion}"] === undefined) {
          tokens["{criterion}"] = crit.property + " " + crit.operator + " " + crit.responseCode;
        }
      }
```

Note: with a focus, the *focused* concept's tokens must win — the loop already uses first-wins, and the
focus reorders `bound`, so this works without further change. Verify that in Step 5.

- [x] **Step 4: Add the ascertainment trace chain**

In `study-graph.js` `traceTemplates`:

```js
      /*
       * The ICE axis. Note the shape differs from the analysis-value chains:
       * it descends through the ascertainment CRITERION rather than an ADaM
       * class variable, because what is being traced is "did this event occur,
       * and when" — a per-subject (boolean, timing) pair, strategy-independent.
       */
      ice_handling: [
        { tier: "Occurrence criterion", id: "{bc}/{property}", label: "{iceName}",
          iri: "usdm:Condition", iri_status: "illustrative",
          whereClause: "{criterion}",
          note: "Executable USDM Condition entering the BC ▸ property ▸ code path; the source Biomedical Concept is the path head." },
        { tier: "Ascertained fact", id: "(occurred, when)", label: "Per-subject occurrence",
          note: "Boolean indicator plus a Timing, per subject. Strategy-independent — the same ascertainment is reused whichever strategy an estimand applies." },
        { tier: "Study variable", id: "{dataset}.{flag}", label: "{flag} in {dataset}",
          note: "Occurrence flag; timing in {dataset}.{timing}." },
        { tier: "Physical dataset", id: "{dataset}", label: "{datasetLabel}",
          file: "{file}", keys: ["USUBJID"] }
      ]
```

- [x] **Step 5: Run the gate**

Run: `node smartphrase/tools/verify.mjs`
Expected: PASS on the four new assertions. Note that `verify.mjs`'s existing per-instance trace loop
iterates `Object.keys(graph.traceTemplates)` and calls `buildTrace` with **no focus** — it will now
capture an `ice_handling` chain for instances with no ICE phrase, filled from whatever concepts they bind.
That is wrong. **Fix the loop** to skip roles the instance has no phrase for, and to focus per bound
concept:

```js
    /* trace for every role the instance actually uses, focused per bound
       concept so repeating roles are traced individually */
    for (const role of Object.keys(graph.traceTemplates)) {
      const usesRole = inst.phrases.some((p) => {
        const d = E.phraseDef(ctx, p.phrase);
        return d && d.role === role;
      });
      if (!usesRole) continue;
      const focuses = inst.phrases
        .filter((p) => { const d = E.phraseDef(ctx, p.phrase); return d && d.role === role; })
        .map((p) => (p.bindings.ice || p.bindings.event || p.bindings.parameter ||
                     p.bindings.population || p.bindings.treatment || {}).concept)
        .filter(Boolean);
      const keys = focuses.length ? focuses : [null];
      for (const f of keys) {
        const chain = E.buildTrace(ctx, inst, role, f);
        if (!chain) continue;
        record(`${studyKey}/${inst.id}/trace/${role}${f ? "/" + f : ""}`, chain);
        check(`${studyKey}/${inst.id} trace ${role} leaves no unfilled tokens`,
          !JSON.stringify(chain).includes("⟨"), JSON.stringify(chain));
      }
    }
```

This renames existing golden keys (adding `/CONCEPTID`). Expect `golden missing from run` for the old
keys plus `new golden` lines. **Confirm the chains themselves are unchanged** by comparing one old and
one new value by hand before recapturing.

- [x] **Step 6: Wire the focus through the UI**

In `index.html`, `showTrace(rp)` at line 501. The clicked phrase's own bound concept is the focus:

```js
  function showTrace(rp) {
    /* Focus the trace on THIS phrase's concept: with a repeating role
       (ice_handling) each chip must trace to its own event, not to whichever
       concept role order happens to put first. */
    var focus = null;
    (rp.bindings || []).forEach(function (b) {
      if (!focus && b.detail && b.detail.kind === "concept") focus = b.detail.id;
    });
    var chain = E.buildTrace(ctx, state, rp.role, focus);
```

- [x] **Step 7: Recapture, run all three gates, commit**

```bash
node smartphrase/tools/verify.mjs --update-goldens && node smartphrase/tools/verify.mjs
node smartphrase/tools/build-library-subset.mjs --check
NODE_PATH=<scratchpad>/domtest/node_modules node smartphrase/tools/verify-ui.mjs
git add smartphrase/demo/engine.js smartphrase/demo/data/study-graph.js \
        smartphrase/demo/index.html smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "Trace an intercurrent event to its ascertainment, focused per ICE"
```

---

## Task 8: PrE0102 — the real, source-grounded intercurrent event

The distinguishing value of this task: the ICE, its strategy **and** the summary measure are all quoted
from a published SAP, not constructed.

**Files:**
- Modify: `smartphrase/demo/data/study-graph-pre0102.js`
- Modify: `smartphrase/demo/data/acdc-library-proposed.js` (widen `T.PFS_KaplanMeier.validSmartPhrases`)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces: `AC.PRIMARY.PFS` rendering an ICE clause and a summary measure, both source-quoted.

**Source basis** (all verbatim from `smartphrase/SAP/`):
- §4.3: *"Subjects who discontinue everolimus/placebo because of suspected everolimus-associated toxicity
  should continue treatment with fulvestrant alone until disease progression."*
- §4.3: *"All subjects who have discontinued protocol therapy will be followed for survival and for
  progression, even if protocol therapy was discontinued because of toxicity or for other reasons."*
  → an explicit **TreatmentPolicy**: the event is not allowed to change what is measured.
- §7.7.2: *"Median time and 90% confidence interval for PFS, TTP, and OS will be summarized …"*
  → summary measure = output class `median_survival`.

- [x] **Step 1: Write the failing assertions in `verify.mjs`**

```js
/* ---- PrE0102: source-grounded ICE and summary measure ---- */
{
  const ctx = E.ctxOf(LIB, graphs.PRE0102, I18N);
  const inst = graphs.PRE0102.instances.find((i) => i.id === "AC.PRIMARY.PFS");
  const res = E.resolveInstance(ctx, inst, "en");
  check("PrE0102 primary states the ICE strategy in prose",
    res.sentence.includes("regardless of"), res.sentence);
  check("PrE0102 primary states the summary measure in prose",
    res.sentence.includes("median"), res.sentence);
  const mv = E.constructModelView(ctx, inst);
  check("PrE0102 emits a TreatmentPolicy IceHandling",
    (mv.handlesIntercurrentEvent || []).some((h) => h.icheStrategy === "TreatmentPolicy"),
    JSON.stringify(mv.handlesIntercurrentEvent));
  check("PrE0102 summary measure is a real KM output",
    JSON.stringify(mv).includes("median_survival"));
  /* Every PrE0102 concept must quote its source — the ICE included. */
  check("the PrE0102 ICE quotes its source sentence",
    /SAP 4\.3/.test(ctx.graph.concepts["ICE.TOX_DISCONT"].sapRef),
    ctx.graph.concepts["ICE.TOX_DISCONT"].sapRef);
}
```

- [x] **Step 2: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL — `PrE0102 primary states the ICE strategy in prose`.

- [x] **Step 3: Add the ICE concept**

```js
      /*
       * A REAL intercurrent event, from the source SAP — contrast the CDISC
       * Pilot's illustrative pair. The SAP's handling is an explicit
       * TreatmentPolicy: subjects who stop protocol therapy are still followed
       * for progression, so the event is not permitted to change what is
       * measured. That is stated in prose in the source document, which is
       * exactly the claim this layer makes machine-readable.
       */
      "ICE.TOX_DISCONT": {
        kind: "IntercurrentEvent",
        label: "everolimus discontinuation",
        name: "discontinuation of everolimus for suspected toxicity",
        iri: "usdm:IntercurrentEvent/PRE0102-ICE-TOXDISC", iri_status: "illustrative",
        icheStrategy: "TreatmentPolicy",
        ascertainedBy: {
          arm: "collected",
          criteria: [{ property: "BC_DS_001/Disposition Event",
                       operator: "equals",
                       responseCode: "Adverse Event / toxicity" }]
        },
        implementedBy: { TreatmentPolicy: [] },
        data: { dataset: "ADSL", file: "adsl.xpt", flag: "DCTREAS",
                datasetLabel: "Subject-Level Analysis Dataset",
                timing: "TRTEDT", bc: "BC_DS_001", property: "Disposition Event" },
        sapRef: "SAP 4.3 — 'Subjects who discontinue everolimus/placebo because of suspected everolimus-associated toxicity should continue treatment with fulvestrant alone until disease progression'; handled by treatment policy per SAP 4.3 — 'All subjects who have discontinued protocol therapy will be followed for survival and for progression, even if protocol therapy was discontinued because of toxicity or for other reasons.'"
      },
```

- [x] **Step 4: Widen the KM template's valid phrase set**

In `acdc-library-proposed.js`, `T.PFS_KaplanMeier.validSmartPhrases` — add the ICE strategies the
template can legitimately host and the summary phrase:

```js
        "validSmartPhrases": [
          "SP_TTE_ENDPOINT",
          "SP_POPULATION",
          "SP_GROUPING",
          "SP_METHOD_KM",
          "SP_CONFIDENCE_LEVEL",
          "SP_STRATIFICATION",
          /* issue #11. Hypothetical is deliberately EXCLUDED: implementing it
             for a time-to-event endpoint needs an imputation or censoring
             derivation this template does not carry, so offering it would be
             prose the model cannot honour. Conditional template validity, per
             DESIGN.md. */
          "SP_ICE_TREATMENT_POLICY",
          "SP_ICE_WHILE_ON_TREATMENT",
          "SP_SUMMARY_MEASURE"
        ]
```

Also add `SP_ICE_HYPOTHETICAL`, `SP_ICE_TREATMENT_POLICY` and `SP_SUMMARY_MEASURE` to `T.CFB_ANCOVA` —
but that template is in the **generated** subset and must not be hand-edited. Instead, the overlay
declares a `validSmartPhrasesAdded` map and `ctxOf` merges it:

```js
    /*
     * Phrases added to an EXISTING upstream template. The template itself is
     * generated content and must not be hand-edited, so the addition is
     * declared here and merged in ctxOf — the same discipline as roles.
     * Upstreaming this means widening T.CFB_ANCOVA.validSmartPhrases on
     * methods_02 and deleting this block.
     */
    validSmartPhrasesAdded: {
      "T.CFB_ANCOVA": ["SP_ICE_HYPOTHETICAL", "SP_ICE_TREATMENT_POLICY", "SP_SUMMARY_MEASURE"]
    },
```

And in `ctxOf`, after the transformations merge:

```js
      if (pro.validSmartPhrasesAdded) {
        merged.transformations = merged.transformations.map(function (t) {
          var add = pro.validSmartPhrasesAdded[t.conceptId];
          if (!add) return t;
          return Object.assign({}, t, {
            validSmartPhrases: (t.validSmartPhrases || []).concat(add),
            proposedPhrasesAdded: add
          });
        });
      }
```

`proposedPhrasesAdded` lets the UI badge *which* phrases on an otherwise-released template are proposed.

- [x] **Step 5: Add the phrases to `AC.PRIMARY.PFS`**

```js
          { phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.TOX_DISCONT", render: "name" } } },
          { phrase: "SP_SUMMARY_MEASURE",      bindings: { summary: { output: "median_survival" } } }
```

Add the same two to `AC.SENS.PFS.ITT` (the SAP says the sensitivity analysis repeats *all* of the above),
and `SP_SUMMARY_MEASURE` to `AC.SEC.OS` / `AC.SEC.TTP`.

- [x] **Step 6: Add the EN summary-measure wording**

Per deviation F, the upstream label for `median_survival` is "Median survival" — fine for a table header,
wrong mid-sentence. Add to `lang-overlay.js` `en`:

```js
      /* SAP-facing wording for output classes. The library's own labels are
         analyst-facing ("Median survival", "T-based contrasts"); document
         prose needs a different register. English is a language pack like any
         other, so this is the right seam — see DESIGN.md D14. */
      outputClasses: {
        median_survival: { name: "the median time to event with 90% confidence limits" },
        contrasts_t: { name: "the difference in least-squares means" }
      }
```

The `en` pack currently has only `name` and `sentence_template`; adding `outputClasses` to it is the first
time English carries entity overlays. Confirm `localiseEntity` is reached for `lang === "en"` — it is,
because `langPack(ctx, "en")` returns the `en` pack.

**Careful:** the 90% is hard-coded in that string while `SP_CONFIDENCE_LEVEL` also renders "with 90%
confidence intervals", producing a duplicated statement. Read the assembled sentence before accepting
it. If it reads badly, prefer `name: "the median time to event"` and let the existing confidence-level
phrase carry the interval. **Decide by reading the rendered prose, not by reasoning about it** — this is
exactly how #9's "estimation estimation" defect was caught.

- [x] **Step 7: Run the gate, read the prose, recapture**

Run: `node smartphrase/tools/verify.mjs`
Then print the sentence and read it critically:
```bash
node -e "
var fs=require('fs'),vm=require('vm'),p='smartphrase/demo/';
['data/acdc-library.js','data/acdc-library-proposed.js','data/study-graph.js','data/study-graph-pre0102.js','data/lang-overlay.js','engine.js'].forEach(f=>vm.runInThisContext(fs.readFileSync(p+f,'utf8'),{filename:f}));
var E=SP_ENGINE,g=STUDY_GRAPHS.PRE0102,c=E.ctxOf(ACDC_LIBRARY,g,LANG_OVERLAY);
['en','fr','de'].forEach(l=>console.log(l+': '+E.resolveInstance(c,g.instances[0],l).sentence+'\n'));
"
```
Expected EN, reading naturally: *"Time to disease progression or death (PFS) in the eligible, treated
population comparing treatment groups, regardless of discontinuation of everolimus for suspected
toxicity, using Kaplan-Meier estimation with 90% confidence intervals, summarised as the median time to
event, will be assessed as the primary analysis."*

FR/DE will still fall back for the new phrases — Task 10. The localisation gate will fail here; that is
expected and named. Recapture goldens and commit with that failure noted.

- [x] **Step 8: Commit**

```bash
git add smartphrase/demo/data/study-graph-pre0102.js smartphrase/demo/data/acdc-library-proposed.js \
        smartphrase/demo/data/lang-overlay.js smartphrase/demo/engine.js \
        smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "Encode PrE0102's real intercurrent event and summary measure from the source SAP

FR/DE localisation of the new phrases lands in the i18n task; the
localisation gate is red until then."
```

---

## Task 9: CDISC Pilot — the full five-attribute estimand and a per-estimand override

This is the `DESIGN.md` target prose, and the only place requirement 6 is exercised: the *same* ICE
handled differently by two estimands.

**Files:**
- Modify: `smartphrase/demo/data/study-graph.js`
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Consumes: Tasks 3–8.
- Produces: `AC.PRIMARY.ADASCOG` with two ICE phrases and a summary measure; a new instance
  `AC.SENS.ADASCOG.TP` that overrides `ICE.TRT_DISCONT` to TreatmentPolicy.

- [x] **Step 1: Write the failing assertions in `verify.mjs`**

```js
/* ---- requirement 6: per-estimand override with no duplicated ICE ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const main = graphs.CDISCPILOT01.instances.find((i) => i.id === "AC.PRIMARY.ADASCOG");
  const sens = graphs.CDISCPILOT01.instances.find((i) => i.id === "AC.SENS.ADASCOG.TP");
  check("the override instance exists", !!sens);
  const hm = E.constructModelView(ctx, main).handlesIntercurrentEvent;
  const hs = E.constructModelView(ctx, sens).handlesIntercurrentEvent;
  const ice = "ICE.TRT_DISCONT";
  const a = hm.find((h) => h.forIntercurrentEvent === ice);
  const b = hs.find((h) => h.forIntercurrentEvent === ice);
  check("the same ICE is handled two ways across estimand analyses",
    a.icheStrategy === "Hypothetical" && b.icheStrategy === "TreatmentPolicy",
    a.icheStrategy + " vs " + b.icheStrategy);
  check("the override is flagged as such", b.isOverride === true && a.isOverride === false);
  check("only ONE ICE concept backs both", a.forIntercurrentEvent === b.forIntercurrentEvent);
  check("the override drops the implementing transformation",
    a.implementedBy.length === 1 && b.implementedBy.length === 0);
  /* All five E9(R1) attributes present on the primary. */
  const res = E.resolveInstance(ctx, main, "en");
  const roles = res.phrases.map((p) => p.role);
  check("all five E9(R1) attributes are expressed",
    ["endpoint", "population", "grouping", "ice_handling", "summary_measure"]
      .every((r) => roles.indexOf(r) !== -1), roles.join(","));
}
```

- [x] **Step 2: Run the gate to verify it fails**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL — `the override instance exists`.

- [x] **Step 3: Extend `AC.PRIMARY.ADASCOG`**

Add three phrases, in role order for readability:

```js
          { phrase: "SP_ICE_HYPOTHETICAL",      bindings: { ice: { concept: "ICE.TRT_DISCONT", render: "name" } } },
          { phrase: "SP_ICE_TREATMENT_POLICY",  bindings: { ice: { concept: "ICE.CONMED", render: "name" } } },
          { phrase: "SP_SUMMARY_MEASURE",       bindings: { summary: { output: "contrasts_t" } } }
```

- [x] **Step 4: Add the override instance**

```js
      {
        id: "AC.SENS.ADASCOG.TP",
        iri: "acdc:instance/CDISCPILOT01-AC-SENS-ADASCOG-TP",
        label: "Sensitivity analysis — treatment policy for discontinuation",
        template: "T.CFB_ANCOVA",
        /* SAME estimand, SAME ICE concept — only the strategy differs. This is
           requirement 6: the reified IceHandling triple lets one event be
           handled two ways without a second copy of the event. */
        estimand: { /* copy EST.PRIMARY exactly */ },
        analysisRole: "SensitivityAnalysis",
        sentenceRole: "a sensitivity analysis",
        usdmObjective: { /* copy from AC.PRIMARY.ADASCOG */ },
        arsAnalysis: { iri: "ars:analysis/CDISCPILOT01-AN-SENS-TP", iri_status: "illustrative" },
        phrases: [ /* as AC.PRIMARY.ADASCOG, but SP_ICE_HYPOTHETICAL replaced by
                      SP_ICE_TREATMENT_POLICY bound to ICE.TRT_DISCONT */ ]
      }
```

`ICE.TRT_DISCONT` declares `implementedBy: { Hypothetical: ["T.LOCF_Imputation"] }` only, so this
instance will fail Task 6's implementability check. Add the TreatmentPolicy key to the concept:

```js
        implementedBy: { Hypothetical: ["T.LOCF_Imputation"], TreatmentPolicy: [] },
```

That is the honest encoding: the ICE declares both handlings it supports, and each estimand picks one.

- [x] **Step 5: Run the gate and read the target prose**

Run: `node smartphrase/tools/verify.mjs`, then render the Pilot primary sentence with the snippet from
Task 8 Step 7 (swap `PRE0102` for `CDISCPILOT01`).

Target: *"Change from baseline in Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items)
(ADAS-Cog(11)) at Week 24 in the efficacy (intent-to-treat) population comparing treatment groups, as if
discontinuation of study treatment had not occurred and regardless of use of concomitant AD medication,
using ANCOVA with 95% confidence intervals adjusting for baseline ADAS-Cog(11), summarised as the
difference in least-squares means, will be assessed as the primary analysis."*

**The "and" between two ICE clauses does not exist yet.** `resolveInstance` joins same-role phrases with
a bare space (`engine.js:199-203`). Options, in order of preference:
1. A per-language `role_conjunction` in the pack: `{ ice_handling: " and " }` — localisable, generalises
   to `covariate`, and keeps the decision in the pack that owns word order.
2. Hard-code " and " for `ice_handling` — rejected: not localisable.

Implement option 1: in `resolveInstance`, when pushing the separator between two phrases of the same
role, use `(pack.role_conjunctions && pack.role_conjunctions[tok[1]]) || " "`. Add
`role_conjunctions: { ice_handling: " and " }` to the `en` pack (FR `" et "`, DE `" und "` in Task 10).

This changes the separator only for roles that declare a conjunction, so `covariate` (the only other
repeating role in use) is untouched and its goldens hold.

- [x] **Step 6: Update the sentence templates for the new roles**

The `en` template must now place the ICE clause and the summary. Using Task 2's optional groups so the
six instances without them are unaffected:

```js
      sentence_template:
        "{endpoint} {parameter} {timepoint} {population} {grouping}[, {ice_handling}] {method} {method_qualifier} {covariate}[, {summary_measure}] will be assessed as {sentenceRole}."
```

Run the gate: the six ICE-free instances must be **byte-identical**. If any moved, the optional-group
elision is wrong — go back to Task 2.

- [x] **Step 7: Recapture, verify, commit**

```bash
node smartphrase/tools/verify.mjs --update-goldens && node smartphrase/tools/verify.mjs
git add smartphrase/demo/data/study-graph.js smartphrase/demo/data/lang-overlay.js \
        smartphrase/demo/engine.js smartphrase/tools/verify.mjs smartphrase/tools/goldens.json
git commit -m "Express the full five-attribute estimand and a per-estimand ICE override"
```

---

## Task 10: Localisation — three sentence templates and the German subjunctive

The declared i18n stress test. The localisation gate (`has no untranslated phrases`) has been red since
Task 8 and must go green here.

**Files:**
- Modify: `smartphrase/demo/data/lang-overlay.js`

**Interfaces:**
- Consumes: all new phrases.
- Produces: FR and DE templates for all six new phrases, ICE concept names, output-class prose,
  `role_conjunctions`, and updated `sentence_template`s.

- [x] **Step 1: Confirm the gate is red for the right reason**

Run: `node smartphrase/tools/verify.mjs`
Expected: failures naming `has no untranslated phrases (fr)` / `(de)` and listing exactly the new OIDs.

- [x] **Step 2: Add the FR pack entries**

```js
        SP_ICE_TREATMENT_POLICY: "indépendamment de {ice}",
        SP_ICE_HYPOTHETICAL: "comme si {ice} ne s'était pas produit",
        SP_ICE_COMPOSITE: "avec {ice} considéré comme {outcome}",
        SP_ICE_WHILE_ON_TREATMENT: "en utilisant les mesures recueillies avant {ice}",
        SP_ICE_PRINCIPAL_STRATUM: "dans la strate des participants chez qui {ice} ne se produirait pas",
        SP_SUMMARY_MEASURE: "résumé par {summary}"
```
plus `role_conjunctions: { ice_handling: " et " }`, ICE concept names, and `outputClasses` prose.

- [x] **Step 3: Add the DE pack entries — the subjunctive inside the verb bracket**

```js
        /* The hypothetical strategy wants Konjunktiv II ("als ob … nicht
           aufgetreten wäre") and it must sit INSIDE the wird … untersucht
           bracket. This is the case per-language phrase templates (D7) exist
           for: no amount of fragment concatenation produces it. */
        SP_ICE_HYPOTHETICAL: "als ob {ice} nicht aufgetreten wäre",
        SP_ICE_TREATMENT_POLICY: "unabhängig von {ice}",
        SP_ICE_COMPOSITE: "wobei {ice} als {outcome} gewertet wird",
        SP_ICE_WHILE_ON_TREATMENT: "unter Verwendung der vor {ice} erhobenen Messwerte",
        SP_ICE_PRINCIPAL_STRATUM: "in der Schicht der Teilnehmenden, bei denen {ice} nicht aufträte",
        SP_SUMMARY_MEASURE: "zusammengefasst als {summary}"
```

ICE concept names need the **dative** for `unabhängig von` and the nominative for `als ob … aufgetreten
wäre` — one name cannot serve both. Prefer nominative (`"das Absetzen der Studienbehandlung"`), which
works after `von` when the article is inflected in the phrase template. **Read the rendered German before
accepting it** and adjust the phrase template rather than the concept name where they conflict — the same
lesson as PrE0102's dative event names in #9.

- [x] **Step 4: Update the FR and DE sentence templates**

FR mirrors EN. DE places the ICE clause inside the bracket:

```js
      sentence_template:
        "{endpoint} {parameter} {timepoint} {population} wird {grouping}[, {ice_handling},] {method} {method_qualifier} {covariate}[, {summary_measure},] als {sentenceRole} untersucht."
```

- [x] **Step 5: Read all three languages for every instance with an ICE**

```bash
node -e "
var fs=require('fs'),vm=require('vm'),p='smartphrase/demo/';
['data/acdc-library.js','data/acdc-library-proposed.js','data/study-graph.js','data/study-graph-pre0102.js','data/lang-overlay.js','engine.js'].forEach(f=>vm.runInThisContext(fs.readFileSync(p+f,'utf8'),{filename:f}));
var E=SP_ENGINE;
Object.keys(STUDY_GRAPHS).forEach(function(k){var g=STUDY_GRAPHS[k];var c=E.ctxOf(ACDC_LIBRARY,g,LANG_OVERLAY);
g.instances.forEach(function(i){['en','fr','de'].forEach(function(l){console.log(k+' '+i.id+' ['+l+'] '+E.resolveInstance(c,i,l).sentence);});console.log();});});
"
```
Check specifically: no stranded commas, no doubled words, the German bracket intact, and the ICE
conjunction correct in each language.

- [x] **Step 6: Recapture, verify green, commit**

```bash
node smartphrase/tools/verify.mjs --update-goldens && node smartphrase/tools/verify.mjs
git add smartphrase/demo/data/lang-overlay.js smartphrase/tools/goldens.json
git commit -m "Localise the estimand phrases; German subjunctive inside the verb bracket"
```

---

## Task 11: UI surfaces and the headless gate

**Files:**
- Modify: `smartphrase/demo/index.html`
- Modify: `smartphrase/tools/verify-ui.mjs`

**Interfaces:**
- Consumes: everything.
- Produces: estimand/ICE/summary visible in the model panel, ICH E9(R1) in the standards table, and
  headless coverage of all of it.

- [x] **Step 1: Write the failing UI assertions**

In `verify-ui.mjs`, in the pilot section:

```js
check("model panel shows the estimand", pilotPanel.includes("EST.PRIMARY"), pilotPanel.slice(0, 300));
check("model panel shows the ICE handling role", pilotPanel.includes("ICE Handling"));
check("model panel shows the summary measure role", pilotPanel.includes("Summary Measure"));
check("model view emits IceHandling triples", modelView.includes("handlesIntercurrentEvent"));
check("model view names the implementing transformation", modelView.includes("T.LOCF_Imputation"));
check("prose renders both ICE clauses joined by 'and'",
  /as if .* had not occurred and regardless of /.test(pilotProse), pilotProse);
check("standards table grounds ICH E9(R1) strategies", idTable.includes("IchE9R1Strategy") ||
  idTable.includes("ICH E9(R1)"), idTable.slice(0, 400));
```

and an ICE trace walk: click the `ice_handling` chip, assert the tiers reach `adsl.xpt` and show the
occurrence criterion, and that a *second* ICE chip reaches `adcm.xpt` — the focus behaviour proven
through the real DOM, not just the engine.

- [x] **Step 2: Run the UI gate to verify it fails**

Run: `NODE_PATH=<scratchpad>/domtest/node_modules node smartphrase/tools/verify-ui.mjs`
Expected: FAIL on `model panel shows the estimand`.

- [x] **Step 3: Show the estimand in the model panel**

`renderModelPanel` (line 531) is derived from the template's phrases in role order, so ICE and summary
rows appear automatically once the roles exist — **verify that before writing code.** What is missing is
the estimand header. Add above the field list:

```js
    /* Estimand header. The estimand is instance-level, not a phrase, so it is
       not derivable from the phrase loop below. */
    if (state.estimand) {
      var eh = document.createElement("div");
      eh.className = "estimandhead";
      eh.innerHTML = "<b>" + state.estimand.label + "</b>" +
        '<span class="rolebadge">' + state.analysisRole + "</span>" +
        '<div class="iri">' + expand(state.estimand.iri) + statBadge(state.estimand.iri_status) + "</div>";
      mp.appendChild(eh);
    }
```

Add a minimal `.estimandhead` rule to the stylesheet, matching the existing visual language.

- [x] **Step 4: Ground ICH E9(R1) in the standards table**

In `renderStandards`, add a row per distinct strategy the active study asserts, grounding in ICH E9(R1)
rather than an invented IRI:

```js
    /* ICH E9(R1) is a guideline, not a registry, so the "identifier" is the
       guideline reference itself — flagged illustrative because no resolvable
       term was found. Naming it explicitly is more honest than omitting it. */
```

- [x] **Step 5: Badge proposed phrases on a released template**

`T.CFB_ANCOVA` is released but three of its valid phrases now come from the overlay
(`proposedPhrasesAdded`, Task 8). The panel must badge those individually, not the template. Use the
`proposedPhrasesAdded` array set in `ctxOf`.

- [x] **Step 6: Run all three gates, commit**

```bash
node smartphrase/tools/verify.mjs
node smartphrase/tools/build-library-subset.mjs --check
NODE_PATH=<scratchpad>/domtest/node_modules node smartphrase/tools/verify-ui.mjs
git add smartphrase/demo/index.html smartphrase/tools/verify-ui.mjs
git commit -m "Surface the estimand, ICE handling and summary measure in the demo UI"
```

---

## Task 12: Documentation and design record

**Files:**
- Modify: `smartphrase/DESIGN.md`, `REFERENCE.md`, `GETTING-STARTED.md`, `WALKTHROUGH.md`, `README.md`
- Modify: `smartphrase/PLAN-estimands.md` (completion note)

- [x] **Step 1: Record decisions D11–D15 in `DESIGN.md`**

- **D11** Proposed roles merge through the overlay with declared insertion points; all library reads go
  through `ctx.lib`.
- **D12** `[...]` optional groups in the sentence template, and `role_conjunctions` for repeating roles.
- **D13** Trace focus — repeating roles trace per bound concept; the ICE axis descends through the
  ascertainment criterion, not an ADaM class variable.
- **D14** `output_ref` bindings validated against both template and method outputs; output-class prose
  lives in the language packs because the library's labels are analyst-facing.
- **D15** `analysisRole` is added beside `sentenceRole`, not substituted for it, because `AnalysisRole` is
  per-estimand and cannot express "a secondary analysis" alone. **Record this as a correction to the
  planned design.**

- [x] **Step 2: Convert the "Planned extension" section to delivered**

Rewrite the section as a record of what was built, keeping the cross-reference to #11 and stating the
five deviations and their reasons. Move unexercised strategies (Composite, PrincipalStratum, and
WhileOnTreatment where no censoring derivation exists) into a clearly-labelled "authored but not
exercised" list with what each would need — **do not imply coverage that is not there.**

- [x] **Step 3: Update `REFERENCE.md`**

New roles, the `IntercurrentEvent` and `Outcome` kinds, the `output_ref` placeholder kind, the
`ice_handling` trace tier shape, `implementedBy`/`isOverride`, optional groups and `role_conjunctions`,
and the new `ctx.lib` rule for `roleDefinitions`.

- [x] **Step 4: Add the walkthrough beat**

A ~2-minute estimand beat, and revise the stated timing (currently "~12 minutes" — recount it, do not
guess). Add the honest cost: two new roles is a library minor version, and it forced all three sentence
templates to change. Extend the pocket facts with the new golden count, and add an ask about who owns
role-level library changes.

- [x] **Step 5: Sweep for stale claims**

The lesson from #9: a targeted grep missed `21 + 15 headless-`. Use loose patterns:
```bash
grep -rniE "[0-9]+ *(pinned|outputs|golden|phrases|roles|checks|instances|templates)" smartphrase/*.md
grep -rniE "8 roles|23 smartphrase|69|two worked|~1[0-9] min" smartphrase/*.md
```
Reconcile every number against a gate run.

- [x] **Step 6: Tick this plan's boxes and add a completion note**

Record deviations from *this* plan, as `PLAN-breast-cancer.md` does.

- [x] **Step 7: Final gate run and commit**

```bash
node smartphrase/tools/verify.mjs
node smartphrase/tools/build-library-subset.mjs --check
NODE_PATH=<scratchpad>/domtest/node_modules node smartphrase/tools/verify-ui.mjs
git status --porcelain
git add smartphrase/*.md
git commit -m "Document the estimands extension: decisions D11-D15, delivered design, walkthrough beat"
```

- [x] **Step 8: Push and report on the issue**

```bash
git push -u origin estimands_01
```
Post a summary comment on #11: what was built, the five deviations from the design note with reasons, the
findings for the working group (deviations E and F especially), what is authored-but-unexercised, and the
gate results. Then use `superpowers:finishing-a-development-branch` to decide integration.

---

## Open questions to resolve during execution

1. **No resolvable identifier for ICH E9(R1) strategies.** The enum is eSAP-owned; the guideline is not a
   registry. Search NCIt for estimand/strategy terms before falling back to `illustrative` — and do not
   invent one. (Same discipline as Kaplan-Meier in #9, still unresolved.)
2. **Is `T.LOCF_Imputation` really the right implementer for a Hypothetical strategy?** LOCF is a
   missing-data method; a hypothetical estimand strictly wants imputation under an explicitly stated
   alternative assumption. It is the only imputation derivation in v0.7, so it is what the library
   affords — flag the gap rather than papering over it.
3. **Ascertainment criteria are illustrative BC paths.** `BC_DS_001/Disposition Event` follows the
   `OccurrenceCriterion` shape but the BC ids are not from a published BC library. Check
   `methods_02` for real BC ids before settling for placeholders.
4. **Does the working group want `sentenceRole` retired eventually?** Deviation E keeps it. The
   alternative is a rendering rule computed from (estimand rank, analysisRole) — cleaner, but it changes
   every existing sentence's provenance. Raise it rather than deciding unilaterally.
