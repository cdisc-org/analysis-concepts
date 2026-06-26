# Concept-Model LinkML Spike — Findings

**Date:** 2026-06-24 · **Branch:** methods_02
**Plan:** `docs/superpowers/plans/2026-06-24-concept-model-linkml-spike.md`
**Spec of record:** `docs/superpowers/specs/2026-06-24-one-concept-model-design.md`
**Result:** 14/14 spike tests pass (`.venv/bin/python -m pytest tests/spike/ -v`).

---

## 1. Did the shapes hold? — YES

- A single `ConceptLibrary` (`lib_alternative/concepts/ACDC_Concept_Library_v01.json`)
  holds **11 concepts spanning OC + DC + AC + dimensions** and validates against the new
  `model_alternative/linkML/acdc_concept.yaml` via `linkml-validate`.
- The **role-discriminated `rules` work in the installed LinkML version** — the
  `value_presence: PRESENT/ABSENT` + `equals_string` idiom correctly rejects a `derived`
  concept with no algebraic identity. **No fallback to Python was needed** (the plan's
  contingency did not trigger).
- One small schema addition during execution: `ConceptLibrary` gained optional
  `model`/`version`/`description` metadata slots to match the production libraries' style.
- Coverage gate passes: **every DC category** (PointComputation, Comparison,
  SequenceAggregate, EventAggregate, Classification) and **every AC category**
  (TreatmentComparison, SurvivalAnalysis, DescriptiveSummary) has a slice concept.
  Coverage is read from the production libraries (no hardcoding); the `note` documentation
  key is excluded by taking only dict-valued category entries.

## 2. Did the binding hold? — YES (DC cleanly; AC with a documented normalization)

- **DC unification (clean win):** `unify(Change.identity, M.Subtraction.formula)` derives
  `{value→minuend, reference→subtrahend}` from a ~40-line stdlib parser, and the derived
  inputs **exactly equal the real v07 transformation's** bound inputs
  (`lib/transformations/ACDC_Transformation_Library_v07.json`, not a hand-written stand-in).
- **AC interface satisfaction (works, with indirection):** `LSMeans` estimand constituents
  are satisfied by `M.ANCOVA`'s `ls_means` output **only after two steps**:
  1. **statistic-set expansion** — `ls_means` → set `ci_estimate_t_distribution` →
     terms `[estimate, CI_lower, CI_upper, SE, df]` (the template names a *set*, not stats);
  2. **concept→term normalization** — estimand names are concept-side
     (`Estimate`, `ConfidenceInterval`, `DF`) while terms are term-side
     (`estimate`, `CI_lower`+`CI_upper`, `df`); note `ConfidenceInterval` is **multi-leaf**.

## 3. Cross-layer headline proofs — YES

- **`Change` is layer-agnostic:** its operand contract (`produces Quantity`) is satisfied by
  **both** the OC leaf `ObservationResult` and the DC `Measure` — proving "a Change of two
  observation results" and "a Change of two Measures" are the same concept. (The unified
  concept diagram renders both feeding `Change`.)
- **`Parameter` is one concept, two renderings:** a single node carries OC `--TEST` and DC
  `PARAM` provenance — the dimension-axis analogue of the value-axis unification.

## 4. Transformation payoff (the "is it worth it?" evidence) — STRONG

`impact_metric` on the real v07 `T.ChangeFromBaseline` vs the slimmed form:

| metric | v07 | slim |
|---|---|---|
| binding fields | 10 | 4 (**−60%**) |
| names method slots? | **yes** (`minuend`/`subtrahend`) | **no** (concept operands) |

The slim form **losslessly reconstructs** the v07 binding (`reconstruct() == v07 binding`),
so the shrink costs no information — the binding is recovered by unification, and the
transformation stops leaking method vocabulary.

## 5. Answers to the spec's open questions

1. **Grammar scope (DC) — PARTIALLY NEGATIVE, the key finding.** Pure algebra
   (`+ − × ÷ log`) cleanly expresses **Comparison / Arithmetic / PointComputation**
   (`Change`, `Measure`). It does **not** express **SequenceAggregate** (`AreaUnderCurve =
   integral(...)`), **EventAggregate** (`EventCount = cardinality(...)`), or windowed
   **Classification** (`AnalysisVisit = window(...)`). Those "identities" are really *named
   operations* — i.e. methods — so forcing them into `AlgebraicIdentity` re-encodes a method
   (the very thing we forbid). See recommendation.
2. **Result-contract granularity.** `valueType` alone sufficed to demonstrate cross-layer
   operand matching; `unitFamily` was authored but not yet exercised by the matcher. A
   real engine should match `valueType` + `unitFamily` (+ dimensionality) for soundness.
3. **Derived dimensions.** `AnalysisVisit` validated structurally but its `window()` identity
   is non-algebraic — the **same problem as #1**. Derived dimensions are method-bound, not
   closed-form.
4. **Provenance model.** A `provenance` slot on the concept (list of `{layer, variable,
   sdtmTopic}`) cleanly expressed one concept with OC+DC renderings (`Parameter`). It
   subsumes today's `concept-variable-mappings.json`.
5. **AC vocabulary axis.** `requiresModelClass` worked as a plain string. The real friction
   is constituent naming: the AC model already encodes `ConfidenceInterval` as a multi-leaf
   (`CI_lower`/`CI_upper`) concept — that existing leaf structure should *drive* the
   normalization rather than the hand map used in the spike.
6. **NEW — `DescriptiveSummary` has no natural single concept.** The coverage gate forced a
   representative for every category, but `DescriptiveSummary.typicallyInvolves` is empty in
   the production AC model — its members are atomic statistics produced directly by methods
   (`M.Mean`, `M.Quartile`, …). The spike's `DescriptiveStatistics` concept (constituents
   `[Mean, SD, Min, Max, N]`) is therefore **synthetic** — invented only to fill the slot.
   Open question: should a descriptive summary be modelled as *one* concept (a table/pattern)
   or as *N* atomic analysis concepts (`Mean`, `SD`, …)? The coverage gate should probably
   allow "category satisfied by atomic stats" rather than demanding a composite concept.

## 6. Recommendation — ADOPT, with one schema revision

The unified base, `role`+`provenance` metadata, result-contract operand typing, and the
two binding mechanisms **all hold**. One revision is needed, and the spike makes it precise:

> **`derived` is not one thing.** Split it into **closed-form** (carries an
> `AlgebraicIdentity`, binds by *unification*) and **procedural** (carries a *method
> reference* — AUC, EventCount, windowing — binds by *interface satisfaction*, exactly like
> AC estimands). So the definition forms become: **none** (collected) / **AlgebraicIdentity**
> (closed-form) / **MethodBound** (procedural derived *and* analysis estimand share this
> shape). The grammar guardrail was right to exclude integrals/cardinality/windowing — that
> exclusion is the signal that those concepts are method-bound, not algebraic.

Concrete next steps if adopted:
1. Add a third definition form (`MethodBound`: `{usesMethod, outputBinding}`) to
   `acdc_concept.yaml`; reclassify SequenceAggregate / EventAggregate / windowed
   Classification concepts onto it.
2. Drive AC (and multi-leaf) name resolution from the existing AC leaf model instead of a
   hand map (open Q5).
3. Wire `acdc_transformation.yaml`'s concept FKs to `range: Concept` so the schema-map
   edges become real (today rendered via `FK_BRIDGES`).
4. Only then widen from the per-category slice to the full corpus.

## Artifacts produced

- Schema: `model_alternative/linkML/acdc_concept.yaml` (+ copied `acdc_method`/`acdc_transformation`)
- Library: `lib_alternative/concepts/ACDC_Concept_Library_v01.json`
- Probes: `scripts/spike_concept_binding.py`, `scripts/spike_transformation_impact.py`, `scripts/spike_build_slice.py`
- Diagrams: `model_alternative/linkML/unified_concept_diagram.drawio`, `unified_schema_map.drawio` (+ generator `gen_unified_diagrams.py`)
- Tests: `tests/spike/` (14 tests, all passing)
