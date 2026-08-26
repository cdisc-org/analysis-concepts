# eSAP Builder — SmartPhrase authoring, USDM reuse, and in-document transformations

> Status: P1-P2 implemented (branch `cdisc-us-interchange-demo-app`, commits 40c45e1..ebc9d13)
> Amended 2026-08-21 for P3-concepts + P4 authoring: §7 replaced, §11.1-11.3 added, §15 revised
> Branch: `cdisc-us-interchange-demo-app`
> Source of the ported engine: `smartphrase_01` (folder `smartphrase/`)

## 1. Purpose

Turn Step 7 (eSAP Builder) from a read-only projection of the analysis spec into a
**second authoring surface** over the same spec, so a statistician can write the SAP in
the form they already work in and have that seed a draft analysis into Steps 3 and 4.
Three things must coexist in that one view:

1. SmartPhrase-authored SAP prose.
2. Reuse of, and reference to, USDM content.
3. The transformation itself rendered **inside** the document.

Steps 3, 4, 5, 6 and 8 keep their current behaviour throughout.

## 2. The authoring-direction decision, restated

An earlier decision (2026-06-03/04) held that *the analysis spec is authoritative and
narrative is a rendering over it*, and rejected a "prose drives analyses" alternative.
That decision is **refined, not reversed**:

> The **analysis instance** is authoritative. Both Step 7 and Steps 3–6 write to it.
> Each surface writes only the fields it can express. Prose is never parsed — smartphrase
> authoring is structured slot-filling that writes instance fields directly.

Two facts make this safe rather than a reversal:

- **Authoring cannot produce an inconsistent spec, only an incomplete one.** The
  transformation is *derived* from the phrase set, never chosen independently of it — so
  authoring cannot assert an analysis the sentence does not support. When the phrase set
  narrows to exactly one transformation, `selectedTransformationOid` is set with it; when it
  narrows to several, the candidate set is recorded and the choice falls to Step 4, which
  already owns transformation selection (§11.1). An unnarrowed candidate set is one more
  species of incompleteness, alongside an unresolved fixture (§7.4) and an undetailed
  pipeline.
- **Incompleteness is already a valid, executable state.** The two scenario files on disk
  are exactly the two completion levels:

  | | Scenario 1 (analysis only) | Scenario 2 (with derivation) |
  |---|---|---|
  | `selectedTransformationOid` | `T.CFB_ANCOVA` | `T.CFB_ANCOVA` |
  | `dimensionValues` | Parameter, AnalysisVisit | + Visit, Population |
  | `resolvedBindings` | 7 | 7 |
  | `derivationChain` | *absent* | 9 nodes |
  | `selectedDerivations` | *absent* | present |
  | `confirmedTerminals` | *absent* | present |
  | `pipelineReferences` | *absent* | present |
  | `dimensionOverrides`, `sliceDimensionOverrides` | *absent* | present |

  **The absence of `derivationChain` is the "pending" signal.** No draft layer, no
  accept/reject gate, and no new state machine is required: Step 7 authoring produces a
  Scenario-1-shaped `endpointSpecs[epId]`, and completing it is what Step 6 already does.

This also supports the two-person workflow: the statistician produces Scenario 1; whoever
owns derivations turns it into Scenario 2, possibly much later; the SAP document then
re-renders at the higher detail level.

## 3. Why the smartphrase branch can be adopted without taking v07

`smartphrase_01` shares **no git history** with this branch (the clone is shallow, grafted
at `739344c`; a merge reports 332 files and ~359k deletions). It contains no `ac-dc-app/`,
no `lib/`, no `studies/`. Adoption is therefore a folder port, not a merge.

The demo's data file is generated from `methods_02@ffee5df` (Transformation Library v0.7),
but **the engine has no runtime dependency on that branch** — verified by extracting
`smartphrase/` outside the repo and running `node smartphrase/tools/verify.mjs`, which
passes 69/69 pinned goldens.

v06 → v07 comparison, and what the app cares about:

| | v06 (this branch) | v07 (`methods_02`) | App impact |
|---|---|---|---|
| Transformation ids | 25 | same 25 | — |
| `validSmartPhrases` | present | **byte-identical, 25/25** | the prose↔model join is stable |
| `roleDefinitions` | — | differs only in a `description` string | none |
| `configurationOptions` | — | identical | none |
| Array layout | `derivationTransformations` + `analysisTransformations` | merged `transformations` | 45 refs / 11 files |
| `oid` / `name` | present | renamed `conceptId` / `label` | many |
| **`bindings`** | **25 of 25** | **0 of 25 — removed** | **328 hits / 12 files** |
| `slices` | top-level | moved under `inputDataStructure` | 77 hits / 9 files |
| `composedPhrase`, `acCategory`, `methodOutputSlotMapping`, `instanceOf` | present | removed | 27 hits |
| Method schema | 0.8.0 (`oid`, `input_roles`, `output_specification`) | 0.9.1 (`conceptId`, `inputs`, `outputs`) | 23 hits / 6 files |
| `smartPhrases[]` | 18, `configurations[]` + `references[]` | 23, `placeholders[]` + `anchors{}` | the only genuine coupling |

Adopting v07 wholesale would break Step 4's `inferDefaultSummaryPattern` (keys on
`acCategory`, verifies against `methodOutputSlotMapping`), Step 6's pipeline and Step 8's
execution — all of which read `bindings`. **Only the `smartPhrases[]` block is upgraded.**

## 4. Architecture — one instance, five projections

No new store. Step 7 reads and writes `appState.endpointSpecs[epId]`, the same object
Steps 3–6 use. There is nothing to synchronise because there is no second copy.

The spec gains one field. Today it persists `selectedEndpointPhrase` and
`selectedDimPhrases`, which record *which* phrases but not their bindings or render mode —
too thin to regenerate prose from. That becomes:

```js
phraseInstances: [
  { phrase: "SP_CFB_ENDPOINT",
    bindings: { parameter: { concept: "PARAM.ADASCOG11", render: "name_with_label" } } },
  { phrase: "SP_TIMEPOINT",
    bindings: { visit: { concept: "VISIT.WK24" } } },
  { phrase: "SP_POPULATION",
    bindings: { population: { concept: "POP.EFFICACY" } } },
  { phrase: "SP_METHOD_ANCOVA",
    bindings: { method: { method: "M.ANCOVA" } } }
]
```

This is exactly the demo's `state.phrases` shape, so the ported engine consumes it with no
translation. `selectedEndpointPhrase` / `selectedDimPhrases` remain as derived, read-only
fields backfilled from `phraseInstances`, so Step 3's panel and `buildSyntaxTemplate` keep
working unchanged.

```
                    endpointSpecs[epId].phraseInstances
                                  │
   ┌──────────────┬───────────────┼───────────────┬────────────────┐
   ▼              ▼               ▼               ▼                ▼
resolveInstance  findMatching   bindings      buildTrace     constructModelView
 → parts[]       Transformations → dimension     → 4 tiers     → template, method,
   │             → candidate set   Values{}       ┈┈┈┈┈┈┈┈┈       sliceKeys, slices,
   ▼                 ▼               ▼            DEFERRED        config, expression
SAP prose         Step 4          Step 3          (§7.6)              │
 (Step 7)         analysis        endpoint                            ▼
                                                              transformation card
                                                                  (Step 7)

   derivationChain absent → Step 6 "pending";  present → SAP §12 appendix
```

## 5. The phrase metadata upgrade

One file changes: `lib/transformations/ACDC_Transformation_Library_v06.json`, and only its
`smartPhrases[]` block.

- For each of the 18 phrases, add `placeholders[]` and `anchors{}` **copied verbatim from
  v07** — all 18 oids exist there, so nothing is invented.
- **Keep `configurations[]` and `references[]` unchanged.** Step 3's panel and the trigger
  predicates in `ac-dc-app/data/phrase-role-config.json` read them.
- **Add all 5 v07-only phrases**: `SP_AUC_ENDPOINT`, `SP_SHIFT_ENDPOINT`,
  `SP_PCTCFB_ENDPOINT`, `SP_METHOD_CHISQ`, `SP_METHOD_DESCSTATS`. This is not optional
  polish — v06 currently has a **dangling reference**: `T.Responder_ChiSq` lists
  `SP_METHOD_CHISQ` in its `validSmartPhrases`, but no such phrase is defined in v06's
  `smartPhrases[]`. Any responder analysis authored through phrase matching would therefore
  fail to compose its method fragment today. Adding the five fixes that latent defect and
  unlocks shift, AUC and descriptive-statistics endpoints. (`SP_METHOD_KM` is the converse
  case — defined but referenced by no transformation; left as-is, since Kaplan-Meier has no
  analysis transformation in either library version.)

Nothing else in v06 is touched. `bindings`, `slices`, `methodOutputSlotMapping`,
`acCategory`, `composedPhrase` and the split arrays all stay exactly as they are.

**Guard:** `scripts/validate_phrase_shapes.py`, following the existing
`validate_methods_model.py` pattern, asserts three properties per phrase. Together they
prevent the two shapes drifting while both are live:

1. every `{token}` in `phrase_template` appears in `configurations[]` — the *existing*
   engine substitutes only what `configurations` names, so anything else reaches the UI
   literally;
2. every `{token}` in `phrase_template_slotted` is a `placeholders[].name` — the same
   property for the ported engine;
3. `configurations[]` is a **subset of** `placeholders[].name` — every slot the old engine
   fills must exist as a placeholder for the new one.

> Corrected 2026-08-20. An earlier draft required set *equality* between `configurations[]`
> and the non-`method_ref` placeholders. That is wrong, and Task 3 of the implementation
> plan proved it: `SP_IMPUTATION` carries `configurations: ["imputation"]` and a template
> containing `{imputation}` — so the old engine must substitute it — while v07 classifies
> that same slot as `kind: "method_ref"`, because LOCF/BOCF/WOCF are imputation *methods*
> drawn from the catalogue. The slot is legitimately both. Equality would have forced a
> false choice between mis-typing the slot and letting the old engine leak a raw token.
> The subset rule keeps every protection and drops the false constraint; verified against
> all 23 post-upgrade phrases with zero leaks in either direction.

## 6. Ported engine and its adapters

`smartphrase/demo/engine.js` → `ac-dc-app/js/utils/smartphrase-engine.js`, converted from
IIFE to ES module exports. Pure functions, no DOM. The 69 goldens port with it as
`scripts/verify_smartphrase_engine.mjs`.

The engine expects v07 field names in three places. Rather than reshape the library, a thin
**v06 read adapter** (`js/utils/smartphrase-lib-adapter.js`) presents v06 through v07 names:

| Engine reads | v06 source |
|---|---|
| `lib.transformations` | `derivationTransformations.concat(analysisTransformations)` |
| `tpl.conceptId` / `tpl.label` | `tpl.oid` / `tpl.name` |
| `tpl.inputDataStructure.slices` | `tpl.slices` |
| slice constraint `c.dimension` | `c.conceptCategory` |
| `tpl.outputDataStructure.measures` | `tpl.bindings.filter(direction === 'output' && dataStructureRole === 'measure')` |
| `method.conceptId` / `method.label` | `method.oid` / `method.name` |

`formula` and `configurations` are byte-identical between method schema 0.8.0 and 0.9.1, so
no adaptation is needed there.

The adapter is **read-only and non-mutating** — it wraps, it does not rewrite the library
object the rest of the app holds.

## 7. The study-graph adapter

> **Amended 2026-08-21**, after P1–P2 shipped and the mechanism was probed against the real
> library. The original §7 built the graph from a hand-chosen list of sources and derived a
> four-tier data trace. Both are revised: the *sources are declared by the library*, not
> chosen here, and the **trace tier is deferred** (see "What is deferred" below). The
> original trace table is preserved in git history at commit `ebc9d13`.

New module: `ac-dc-app/js/utils/smartphrase-graph.js`. It builds `ctx.graph` from live app
state. The demo ships this hand-written and flagged `iri_status: "illustrative"`; deriving
it is where this port improves on the demo.

### 7.1 The library declares where every value comes from

A phrase binding is not merely a label for display. Binding a dimension phrase **fixes a
dimension of the transformation's analysis cube**: it supplies the value of a `sliceKey` and
substitutes into the `{token}` of any slice constraint that names it. `constructModelView`
already performs both in one pass.

Critically, each `sliceKey` declares its own value source. Across the whole v06 library there
are exactly three:

| `sliceKeys[].dimension` | `sliceKeys[].source` | Populated from |
|---|---|---|
| `Parameter` | `biomedicalConcept` | the study's USDM biomedical concepts |
| `AnalysisVisit` | `visit` | USDM encounters |
| `Population` | `population` | USDM analysis populations |

**So the graph's contents are dictated by the library, not chosen by this module.** The
`{parameter}` picker offers biomedical concepts because `T.CFB_ANCOVA` says
`source: biomedicalConcept`. Adding a transformation with a new source is the only thing that
should ever widen the graph — no code change, no new convention.

### 7.2 The required fixtures depend on the transformation

`sliceKeys` vary per transformation, and the variation is clinically meaningful:

| Transformation | Declared fixtures |
|---|---|
| `T.CFB_ANCOVA` | Parameter, **AnalysisVisit**, Population |
| `T.CFB_MMRM_Primary` | Parameter, Population — **no visit** |
| `T.OS_LogRank` | Population only |

MMRM takes no visit fixture because it models visit as a fixed effect rather than slicing to
one. Eleven of the twenty-five transformations declare `sliceKeys` at all.

Consequently **which slots a sentence has is derived, never hardcoded**. Writing
*"change from baseline in {parameter} … using analysis of covariance"* requires a timepoint;
switching the method phrase to MMRM removes that slot, because the resolved transformation no
longer declares it.

### 7.3 Concept identity and shape

Concepts are keyed by their **USDM identifier**, not their label, so a binding survives a
rename or a re-parse of the study. Each concept carries:

```js
graph.concepts["V.Encounter_7"] = {
  kind:            "AnalysisVisit",      // matched against sliceKeys[].dimension
  conceptCategory: "VisitDimension",     // matched against slice constraint conceptCategory
  label:           "Week 24",
  name:            "Week 24 (end of double-blind treatment)",
  iri:             "usdm:Encounter/Encounter_7"
}
```

`kind` and `conceptCategory` are both populated deliberately. The engine matches a sliceKey
with `bc.c.conceptCategory === sk.dimension || bc.c.kind === sk.dimension` — an **or** — so
carrying both satisfies v06's concrete vocabulary (`Parameter`, `AnalysisVisit`, `Population`)
and its category vocabulary (`ParameterDimension`, `VisitDimension`) simultaneously. No
mapping layer is required.

This was verified before the design was written: a throwaway graph shaped exactly as above,
run through the real engine against the real adapted v06 library, resolved all three of
`T.CFB_ANCOVA`'s sliceKeys and produced the expected sentence.

The probe also exposed one mundane requirement: `adaptV06Library(v06)` defaults its `methods`
argument to `{}`, so method references fail to resolve unless the loaded method JSON is passed
through. `data-loader.js` already loads `lib/methods/_index.json`; the graph builder must
supply those methods to the adapter.

### 7.4 Unresolved fixtures

A fixture is **unresolved** when its declared source has not been satisfied — for example
Scenario 1's parameter, which is the typed string `"Adas-Cog(11) Subscore"` with
`linkedBCIds: []`, against a sliceKey declaring `source: biomedicalConcept`.

An unresolved fixture is **the same class of incompleteness as an undetailed derivation
pipeline**, one level up. Scenario 1 is already a valid, loadable, executable state with
`derivationChain` absent; a fixture whose source is unsatisfied is the same story. It is
therefore surfaced, not blocked: the phrase renders with the typed label, the fixture is shown
as unresolved against its declared source, and it can be satisfied later — by linking a
biomedical concept in Step 3, or by whoever details the analysis.

### 7.5 What the graph contains

| Graph key | Built from |
|---|---|
| `study` | `appState.selectedStudy` — studyId, title |
| `concepts{}` Parameter | study `biomedicalConcepts`, keyed by BC id; unresolved entry synthesised from the typed label when no BC is linked |
| `concepts{}` Visit | USDM encounters, keyed by encounter id |
| `concepts{}` Population | USDM analysis populations, keyed by population id |
| `methodGrounding{}` | `lib/methods/**` — `name`, plus the STATO/NCIt `codings` already present |
| `instances[]` | one per `spec.selectedAnalyses[]` entry |
| `traceTemplates{}` | **omitted — see 7.6** |

`ctxOf(lib, graph, i18n, proposed)` takes the graph as a parameter, so this adapter plus the
library adapter remain the **only** coupling between ported code and the app.

### 7.6 What is deferred, and why

The demo's four-tier data trace (DataConcept → ADaM class variable → study variable →
physical dataset) is **not built in this phase.**

`buildTrace` is the only engine function that reads `graph.traceTemplates` or a concept's
`data{}` map — it appears at exactly two lines in the engine, both inside `buildTrace`.
Nothing in prose rendering or `constructModelView` touches either. So deferring the trace
costs nothing elsewhere.

It is deferred because its study-variable tier wants `PARAMCD = '{paramcd}'`, and **PARAMCD is
not derivable from current metadata**: `model/shared/bc_to_oc_instance_mapping.json` contains
none across 161 `bcMappings`, and `ac-dc-app/js/utils/define-xml-generator.js:504` already
emits a note recording the same gap ("slice holds the parameter label … not the PARAMCD
submission value (needs BC/CT resolution)").

Three options remain open, to be settled before the trace is built:

1. render the tier with the parameter **label** and mark the where-clause unresolved — what
   Define-XML generation already does, and consistent with §7.4;
2. add BC → Controlled Terminology resolution, which would also improve Define-XML export;
3. capture `PARAMCD` per endpoint alongside `datasetAssignments`.

## 8. USDM reuse — three modes, all first-class

USDM reuse is not a side panel that happens to be present; it is how slot values are
constrained and where document prose comes from.

**(a) Slot values come from USDM.** The concept pickers are populated *from* the parsed
study — visits from USDM encounters, populations from USDM analysis populations, parameters
from the endpoint's linked biomedical concepts. A slot cannot be bound to something the
study does not declare. This is reuse enforced by construction rather than by convention.

**(b) Every binding is a USDM reference.** Each concept in the graph carries its USDM IRI
(`usdm:ScheduledActivityInstance/…`, `usdm:AnalysisPopulation/…`,
`usdm:BiomedicalConcept/…`). The inspect popover shows it, `buildTrace` carries it into the
trace, and it appears in the JSON-LD projection. Binding a slot *is* citing USDM.

**(c) Narrative reuse and copy.** `appState.esapLinkedNarratives[sectionKey]` and
`resolveNarrative()` (in `usdm-ref-resolver.js`) are kept as they are — the existing
**Link USDM Content** button and master-detail picker are unchanged. Two additions:

- **Copy into prose** — a linked narrative block gains a *Copy into section* action that
  inserts its resolved text into the section's free-prose frame, where the author can edit
  it around the phrase spans. This is the "statisticians start from what the protocol
  already says" path.
- **Provenance retained** — copied text records the source `narrativeContent` id so the
  document can show "adapted from OBJ1" without re-resolving the link.

Modes (a) and (b) are new; mode (c) is the existing feature plus a copy action.

## 9. Rendering the transformation in the document

The document must show not only the sentence but the analysis concept it denotes. The
engine's `constructModelView(ctx, instance)` already produces exactly that projection —
template identity and provenance, `usesMethod` with its generic expression, resolved
`sliceKeys`, `slices` with `{parameter}` / `{baseline_visit}` tokens substituted,
`configurationValues` tagged with where each came from (`template` vs `SP_CONFIDENCE_LEVEL`),
output measures, and a `resolvedExpression`.

It is rendered as an **inline transformation card** directly beneath the authored sentence
in the section, not in a separate tab:

```
§ 4.1.2  Main Analytical Approach

  The primary endpoint is the change from baseline in ADAS-Cog(11) at
  Week 24, analysed in the efficacy population using analysis of
  covariance, with 95% confidence intervals.

  ┌─ Analysis concept ─────────────────────────────────────────┐
  │ T.CFB_ANCOVA · analysis · Transformation Library v0.6       │
  │ method   M.ANCOVA   CHG ~ BASE + TRTP                        │
  │ slices   parameter_baseline:                                 │
  │            ParameterDimension = ADAS-Cog(11)                 │
  │            VisitDimension     = Baseline                     │
  │ keys     Parameter ← biomedicalConcept · AnalysisVisit ←     │
  │          visit · Population ← population                     │
  │ config   alpha = 0.05  (from SP_CONFIDENCE_LEVEL)            │
  │          ss_type = III (from template)                       │
  │ derivations  ⚠ not yet specified — see Step 6                │
  └──────────────────────────────────────────────────────────────┘
```

The `derivations` line is the completion indicator: absent `derivationChain` renders the
warning and a link to Step 6; present, it renders a cross-reference to the appendix.

`constructModelView` reads `inputDataStructure` / `outputDataStructure`, which v06 does not
have — this is handled by the library adapter in §6, not by changing v06.

## 10. Protocol and Detailed renditions

One document, two renditions, both from the same instance — mirroring the existing
Protocol/Detailed treatment of the Schedule of Activities.

- **Protocol** — authored sentences; the transformation card collapsed to one line; the
  derivation appendix omitted, with cross-references shown as plain text.
- **Detailed** — transformation cards expanded; **§12 Supporting Documentation** carries a
  numbered derivation appendix.

The appendix is generated by walking `spec.derivationChain` (9 nodes in Scenario 2), one
entry per node, in post-order. Each node already carries human-readable `note` fields on its
bindings — *"Baseline-flagged record"*, *"Scoreable fraction (1.0 when no items are missing;
(70−x)/70 otherwise)"*, *"11 ADAS-Cog item scores (from BCs)"*. No new metadata is authored
for the appendix; it renders what the pipeline already contains.

```
§ 4.1.2  … (see Appendix, Derivation D1)

§ 12  Supporting Documentation
  D1    Change from baseline           T.ChangeFromBaseline · M.Subtraction
        minuend    current visit value
        subtrahend baseline-flagged record
  D1.1  ADAS-Cog(11) total score       T.ADAS_Cog_11_TotalScore · M.Division
        numerator   sum of available item scores
        denominator scoreable fraction
  D1.2  Scoreable fraction             T.ADAS_ScoreableFraction
  …
```

Toggle placement: beside the existing `SAP Document / ADaM Datasets / ADaM Spec / JSON /
Define-XML` tabs.

## 11. Step 7 view and module layout

`esap-builder.js` is already ~74 KB with roughly 30 render functions. It gains a dispatch
and nothing else; new work lands in three modules:

| Module | Responsibility |
|---|---|
| `js/views/esap-authoring.js` | prose surface — `renderProse(el, instance, mode)`, slot-editor popover, "+ add phrase", collapsible model rail |
| `js/views/esap-transformation-card.js` | the inline analysis-concept card from `constructModelView` |
| `js/views/esap-appendix.js` | §12 derivation appendix from `derivationChain` |

**Layout** — full-width document; the model rail collapses in from the right; the existing
Link USDM Content button and picker open as they do now. One renderer serves both modes:
`mode === "inspect"` gives hover-to-inspect (read-only viewing); click-to-trace is
part of the deferred trace tier (§7.6) and is not wired in this phase;
`mode === "edit"` gives click-to-open-slot-editor.

**Which sections are authorable is decided by the template, not by new config.** The
`fromSpec` values in `sap_core_tee_v005.json` that currently return
`renderPlaceholderSection('… configure in Step 4')` are precisely the analysis-mechanics
sections:

| `fromSpec` | Treatment |
|---|---|
| `analyses.primary.definition` (4.1.1) | authorable |
| `analyses.primary.main` (4.1.2) | authorable |
| `analyses.primary.sensitivity` (4.1.3) | authorable — adds a second `selectedAnalyses[]` entry |
| `analyses.primary.supplementary` (4.1.4) | authorable |
| `analyses.secondary.key.*` (5.1.1.x) | authorable |
| `multiplicity`, `missingDataHandling`, `protocolChanges`, `sampleSize`, … | free prose + USDM links, unchanged |
| §12 Supporting Documentation | derivation appendix |

Those placeholders literally read *"Configure variants in Step 4"* today — the one-way
arrow. Replacing them with authoring surfaces is a swap inside `dispatchFromSpec`, not a
restructure.

### 11.1 Slots are derived from the resolved transformation *(added 2026-08-21)*

The authoring surface never carries a fixed list of slots. The order is:

1. The author writes the **endpoint phrase** — *"change from baseline in …"*. That alone
   narrows the candidates: `SP_CFB_ENDPOINT` appears in `validSmartPhrases` for
   `T.ChangeFromBaseline`, `T.CFB_MMRM_Primary` and `T.CFB_ANCOVA`.
2. Adding the **method phrase** narrows further — `SP_METHOD_ANCOVA` → `T.CFB_ANCOVA`.
3. The resolved transformation's `sliceKeys` then declare **which fixture slots exist**, and
   each slot's `source` declares **what its picker offers** (§7.1, §7.2).

**Multiple candidates is a valid state, not an error.** A sentence that resolves to several
transformations has simply not been narrowed yet; choosing between them is part of the
downstream selection that Step 4 already owns. Step 7 therefore records the ranked candidate
set from `findMatchingTransformations` and sets `selectedTransformationOid` only when the set
collapses to one, or when the author picks in Step 4.

While several candidates stand, render the slots they **all** declare — the intersection.
For the CFB case that is `{Parameter, Population}`: bindable regardless of which analysis is
eventually chosen, because `T.CFB_ANCOVA` and `T.CFB_MMRM_Primary` both declare them. The
`AnalysisVisit` slot appears once ANCOVA is selected, and never appears for MMRM. Slots
outside the intersection are listed as "appears once the analysis is chosen", so the author
can see what remains rather than discovering it later.

### 11.2 Phrase scope: endpoint-wide versus per-analysis *(added 2026-08-21)*

An endpoint may carry a main analysis plus sensitivity and supplementary ones —
`selectedAnalyses[]` is already an array. Phrase instances must therefore be scoped, and the
library already says how: `roleDefinitions.roles[*].contextSource`.

| `contextSource` | Roles | Stored on |
|---|---|---|
| `endpoint` | endpoint, parameter, timepoint, population, grouping | `spec.phraseInstances` — once per endpoint |
| `manual` | method, method_qualifier, covariate | `spec.selectedAnalyses[i].phraseInstances` — per analysis |

A sensitivity analysis that swaps ANCOVA for MMRM therefore changes only the manual half;
parameter, timepoint and population stay shared across every analysis of that endpoint. This
is the library's own classification, already consumed by `getEndpointContextRoles()` in
`phrase-engine.js` — not a new convention.

### 11.3 One writer for bindings *(added 2026-08-21)*

Bindings persist USDM identifiers (§7.3) while `dimensionValues` persists label strings, and
Steps 6 and 8 execute from the latter. The two must not drift, so **exactly one helper writes
either of them**:

```
setDimensionBinding(spec, dimension, conceptId)
   ├─→ phraseInstances[…].bindings[slot].concept = conceptId
   └─→ dimensionValues[dimension]                = graph.concepts[conceptId].label
```

Step 3's dropdown yields a label, resolves it to a concept id, and calls the same helper.
Step 7's picker yields an id and calls it directly. Nothing writes one field alone.

On load, a spec with no `phraseInstances` (every saved instance today, including the three
scenario files) has one derived from `dimensionValues` and `selectedEndpointPhrase` /
`selectedDimPhrases` — the backfill in §12. Where the two disagree, **`dimensionValues`
wins**: it is what the app executes from and what older tooling wrote.

Where a label resolves to more than one study object, the binding is left unresolved (§7.4)
rather than guessed.

## 12. Migration and back-compatibility

- **`phraseInstances` backfill.** On load, any spec lacking `phraseInstances` gets one
  synthesised from `selectedEndpointPhrase`, `selectedDimPhrases` and `dimensionValues`.
  This is the same backfill idiom `ensureSpec()` already uses for `selectedDerivationOid`,
  `useInEsap` and `writeBackToUsdm`. The three files in
  `ac-dc-app/data/study_ac_spec/` are the test cases.
- **`smartphrase-builder.js` is orphaned** — nothing imports it and it is absent from
  `app.js`'s dispatch. It is superseded by this work and should be deleted, not ported.
- **Steps 3–6 and 8 are untouched.** No file they read changes shape.

## 13. Delivery sequence

Five phases, each independently verifiable and each leaving the app running.

| Phase | Work | Done when |
|---|---|---|
| **P1** Library | v06 `smartPhrases[]` upgrade + the 5 additions; `validate_phrase_shapes.py` | guard passes; Steps 3/4/6/8 unchanged in manual check |
| **P2** Engine | port `engine.js` as an ES module; port the goldens; write the v06 library adapter | 69/69 goldens green against the adapted v06 library |
| **P3** Graph | `smartphrase-graph.js` — concepts, methodGrounding, derived trace templates | clicking a phrase in a scratch harness reaches `adqsadas.xpt` |
| **P4** Authoring | `esap-authoring.js` + `phraseInstances` backfill; wire into `dispatchFromSpec` | authoring in §4.1.2 seeds a Scenario-1-shaped spec that Steps 3/4 render |
| **P5** Rendering | transformation card, §12 appendix, Protocol/Detailed toggle | Scenario 2 renders 9 appendix entries; Scenario 1 renders the pending marker |

P1 and P2 are prerequisites for everything, and both shipped on 2026-08-21 (commits `40c45e1..ebc9d13`). P3 is the largest remaining phase; the PARAMCD risk that once dominated it is resolved by deferring the trace tier (§7.6), and the concept-vs-category mismatch by choosing `kind` and `conceptCategory` together (§7.3).
P4 delivers the seeding the request centres on; P5 delivers the reverse direction.

## 14. Testing

| Level | What |
|---|---|
| Engine | port the 69 goldens as `scripts/verify_smartphrase_engine.mjs`; must stay green |
| Library shape | `scripts/validate_phrase_shapes.py` — placeholders ↔ configurations parity |
| Adapter | round-trip: v06 through the library adapter must satisfy every field `constructModelView` and `resolveInstance` read |
| Scenario | load Scenario 1 → authoring renders the known sentence; load Scenario 2 → appendix renders 9 entries |
| Regression | Scenario 1 and Scenario 3 must still execute in Step 8 (they work today) |
| Manual | Step 3 panel, Step 4 summary-measure inference, Step 6 pipeline unchanged after the v06 phrase edit |

## 15. Risks and open questions

1. ~~**`bc_to_oc_instance_mapping.json` → PARAMCD coverage.**~~ **Resolved 2026-08-21 —
   the route does not work.** `bc_to_oc_instance_mapping.json` contains no `PARAMCD` at all
   (161 `bcMappings`, zero occurrences), and `define-xml-generator.js:504` already records
   the identical gap. This no longer blocks the phase: PARAMCD is read only by `buildTrace`,
   which §7.6 defers, and nothing in prose rendering or `constructModelView` touches it.
   The three remaining options are listed in §7.6.
2. **Two phrase engines coexist** until Step 3 migrates to `phraseInstances`. The parity
   guard in §5 bounds the risk; consolidation is deliberate follow-up work.
3. **Sentence templates are English-shaped by default.** The demo's per-language
   `sentence_template` mechanism ports with the engine, but the FR/DE packs are illustrative
   and are **not** adopted here.
4. **`resolvedExpression` needs a measure→ADaM-variable map** the library does not carry;
   the demo dispatches on `usesMethod` as an acknowledged seam. The transformation card
   should show the method's `generic_expression` and mark the study-variable form as
   derived, not authoritative.
5. ~~**Multiple analyses per endpoint.**~~ **Resolved 2026-08-21 by §11.2** — the library's
   `roleDefinitions.roles[*].contextSource` already partitions the roles: `endpoint` roles
   are stored once per endpoint, `manual` roles per `selectedAnalyses[]` entry.

6. **A sentence may resolve to several transformations.** This is expected, not an error —
   narrowing is part of the downstream selection Step 4 owns (§11.1). The risk is only in
   the UI: while candidates stand, the slot set shown is their intersection, so an author
   may bind fewer slots than the eventual analysis needs. *Mitigation:* list the
   out-of-intersection slots as pending rather than hiding them.

7. **Concept identity depends on the study having the objects.** Visits and populations
   always carry USDM ids; a parameter may not (§7.4). Unresolved fixtures are surfaced, not
   blocked — but a study whose endpoints link no biomedical concepts will author entirely in
   unresolved parameters, which is honest yet weak. Watch whether that pushes users toward
   linking BCs or toward ignoring the marker.

8. **`smartphrase/SAP/` provenance.** The PrE0102 SAP is publicly posted on
   ClinicalTrials.gov as **NCT01797120** (OrgStudyId `PrE0102`, sponsor PrECOG LLC —
   confirmed against the registry). A short provenance note citing that registration should
   be added to `smartphrase/SAP/`, since the folder currently records no rights basis.

## 16. Out of scope

- Adopting Transformation Library v07 or method schema 0.9.1.
- The `acdc:macro` tag dialect and JSON-LD projections (they port with the engine but no UI
  is built for them here).
- FR/DE language packs.
- Inferring the derivation pipeline from concept production — Step 6 stays manual.
- Writing authored content back into USDM.
