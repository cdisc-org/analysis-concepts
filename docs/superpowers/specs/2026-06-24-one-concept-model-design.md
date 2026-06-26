# Design Memo: One Concept Model — concepts that own their math, unifying OC + DC + AC

**Status:** Design memo for team discussion — *not* an implementation plan.
**Date:** 2026-06-24 · **Branch:** methods_02
**Author:** drafted with Claude, from a question by the team.

---

## Context — why this memo exists

A team member proposed a "hierarchy / type" structure in the concept model
(Python-class-like): families such as `Comparison` with members `Change`, `PercentChange`,
`Ratio`, `LogRatio`; a method *applicable* to certain concepts; transformations that
*resolve* concepts at runtime. Probing it surfaced three deeper, connected questions, which
are the real subject of this memo:

1. Can a concept (e.g. `Change`) define its **own math** — `result = value − reference` —
   so it is self-describing, **without becoming a method**?
2. Does introducing concept-owned math + dependencies (`Change ← two value-bearing concepts`)
   **unify** the analysis (AC), derivation (DC), and **collected-data (OC)** concept models —
   can they be viewed as **ONE concept model**?
3. Two worked tests that decide it: *what if a `Change` is of two **observation results** (OC)
   and not two **Measures** (DC)?* and *`parameter` is both an ADaM `PARAM` (DC) and an SDTM
   `TEST` (OC Identifier)* — does the model handle the same concept appearing in two layers?

**Decisions taken with the team:** LinkML is the **intended destination**; prove the design
in a parallel **unified-base** sandbox; scope = one DC + one AC concept **per category** (plus
the OC leaves they depend on).

## Where the model actually is today

- **LinkML is already the source of truth** at `model/linkML/` for three of four layers:
  `acdc_method.yaml`, `acdc_transformation.yaml`, `acdc_output_classes.yaml`. The
  `model/json_schema/acdc_*.schema.json` files are **generated** (`gen-json-schema`);
  instances under `lib/` are validated with `linkml-validate`. This design *extends* LinkML.
- The team already uses the needed idioms: `is_a` + `abstract` + `slot_usage` (the
  `ConceptReference → DimensionBinding → …` hierarchy) and `rules`/postconditions
  (`concept XOR conceptCategory`, `term XOR leaves`).
- **The concept layer is the gap.** The DC/AC concept *libraries*
  (`lib/concepts/Option_B_Clinical.json`, `AC_Concept_Model_v017.json`) are **not** first-class
  LinkML classes — no `is_a`, hierarchy only via JSON `categories` + SKOS `broader`. There is
  no `acdc_concept.yaml`.
- **The OC layer is the most LinkML-ready of all.** `OC_Recording_Model_v017.json` already has
  an abstract `Recording` spine with `Finding`/`Event`/`Intervention` specializing via
  `inherits`, plus a reusable `ResultValue` pattern (`Quantity | Coded`). It is the natural
  anchor for the unified base.
- **The seeds already exist in the data:** DC has `math` ("x − x_ref") + `mathematicalEquivalent`
  ("AbsoluteDifference"); AC has `constituents` + `dimensions` + SKOS `broader`; OC carries
  `Result.Value`/`Result.Unit`; and `concept-variable-mappings.json` already maps concepts to
  per-layer variables (`Observation→--ORRES`, `Measure→--STRESN`, `Change→CHG`, `Parameter→TEST/PARAM`).
- **Cross-layer invariants live in Python** (`scripts/validate_methods_model.py`) — the home for
  the binding probe below.

## The core distinction: **definition vs. procedure**

A concept and a method can share the shape `a − b` and still differ fundamentally:

| | **Concept** | **Method** |
|---|---|---|
| Owns | *meaning* — what the value **is** | *mechanism* — how to **compute** it |
| Reads as | invariant: `result = value − reference` | command: `result := subtract(...)` |
| Operands typed by | **result contract** (`produces Quantity`) | structural slot (`minuend: decimal`) |
| Carries | pure algebra only | notation, configs, cardinality, windowing |
| Cardinality | one concept ← many methods may satisfy it | one method → many concepts in bindings |

**Litmus test:** *"Could two different procedures both satisfy this statement?"* → yes ⇒ concept.
*"Does writing it down force a choice of notation/config/cardinality?"* → yes ⇒ method.

## Operands typed by **result contract**, not by layer-class (the key rule)

The draft of this memo typed `Change`'s operands as `Measure` — and the team's question
*"what if a Change is of two observation results?"* exposed that as too narrow. Change-from-baseline
is computed sometimes from two raw OC `Result`s, sometimes from two standardized DC `Measure`s,
sometimes from two derived values. So operands must be typed **structurally** — by what they
*produce* — not nominally by `Measure`:

```jsonc
"Change": {
  "definition": {
    "operands": {
      "value":     { "produces": { "valueType": "Quantity", "unitFamily": "*" } },
      "reference": { "produces": { "valueType": "Quantity", "unitFamily": "*" } }
    },
    "identity": "result = value - reference",
    "resultContract": { "valueType": "Quantity", "unitRule": "inherited",
                        "inputUnitRelation": "uniform" }
  }
}
```

**This single rule is what dissolves the OC/DC boundary at the type level.** An OC `Result`,
a DC `Measure`, and a DC `Change` all *satisfy* `produces Quantity` — so `Change` composes over
collected, standardized, or derived inputs interchangeably. Nominal typing keeps layers apart;
structural typing unifies them.

**Grammar guardrail (keeps a concept from becoming a method):** identities admit only
`+ − × ÷ log` + scalar multiples — no assignment-over-group, no windowing, no configs, no
cardinality. Members refine via LinkML `is_a` + `slot_usage`; a `Comparison` **abstract**
supertype hoists the shared contract (`arity: 2`, `inputUnitRelation: uniform`).

## ONE concept model: OC + DC + AC as a single DAG

**Two unifying substrates already exist** across all three layers:
1. **A shared dimensional spine** — Subject, Timing, Treatment, Population, Site appear
   (near-)identically in each `sharedDimensions`.
2. **One value/unit vocabulary** — FHIR `Quantity`/`CodeableConcept`/`Range` + value + unit. OC
   writes it as node structure (`Result.Value`/`Result.Unit`); DC as metadata
   (`result.valueType`/`unitRule`) — same semantics, different surface syntax.

Add the **dependency edge** (concept-owned math, operands typed by result contract) and the three
layers become **one DAG of value-producing concepts**:
- **OC concepts = source leaves** — `definition` absent ⇒ collected, no operands.
- **DC concepts = internal nodes** — operands = other value-producers, via algebraic identity.
- **AC concepts = estimand nodes** — operand = a *set/population* of values, via estimand contract.

**Dimensions unify the same way — by provenance, not just measures.** The same concept appears in
two layers with two renderings:
- `Parameter` → OC `Topic`/`--TEST` (Identifier) **and** DC `PARAM`/`PARAMCD`.
- `Visit` (OC, collected) ↔ `AnalysisVisit` (DC, **derived by windowing** — `M.WindowedVisitAssignment`).
- `value` → OC `Result` (`--ORRES`) ↔ DC `Measure` (`--STRESN`) ↔ DC `Change` (`CHG`).

So **one mechanism explains derived values, derived parameters (e.g. a composite/derived `PARAM`
like MAP from SBP+DBP), and derived timing (`AnalysisVisit`)** — each is a concept with a
`definition` and operands; collected ones are leaves. `concept-variable-mappings.json` is the
existing seed of the **provenance binding** layer; the unified base promotes it to a first-class
`provenance` slot per concept (OC `--TEST`/`--ORRES`, DC `PARAM`/`CHG`, …).

**Payoff:** this DAG *is* SDTM→ADaM→analysis **traceability made first-class** — the
collected→derived→analyzed lineage the standards always implied, now one object.

**Caveat — unify, don't erase.** Collected vs derived vs analyzed stays meaningful (regulatory
traceability, validation). "One model" = one base + explicit `provenance`/`role` metadata +
**faceted** classification (OC's observation-class axis and DC's computation-type axis coexist as
`mixins`, not one inheritance tree). Layers become *roles in one graph*, not separate type universes.

## The payoff for binding: computed by **unification / interface satisfaction**

```
Change.identity        :  result = value − reference
M.Subtraction.formula  :  result := <minuend> − <subtrahend>
                          ───────── unify parse trees ─────────
                          value ↦ minuend ,  reference ↦ subtrahend
```

Binding becomes **derived, not authored**; the transformation shrinks to its study-specific
residue — the **slices** that locate operands in the cube. "Which methods produce a `Change`?"
becomes "every method whose formula unifies with `Change.identity`." On the **AC** side, binding is
by **interface satisfaction** (does the method emit `{Estimate, SE, CI, DF}` indexed by factor×level
under a GLM?) — not unification, because an AC concept owns a structural **estimand contract**:

```jsonc
"LSMeans": { "definition": {
  "kind": "estimand",
  "constituents": ["Estimate","SE","ConfidenceInterval","DF"],
  "dimensions": ["factor","level"], "requiresModelClass": "GeneralLinearModel" } }
```

## The unifying frame: **estimand vs. estimator** (ICH E9(R1))

> **The concept owns the *meaning* (the estimand); the method owns the *mechanism* (the estimator).**

DC = degenerate case where the estimand *is* a deterministic equation → algebraic identity → bind by
unification. AC = general case, no closed form → estimand contract → bind by interface satisfaction.
OC = the boundary case with *no* estimator at all → a collected leaf. Same rule, three forms.

## Validation strategy: LinkML **unified-base** sandbox

### Layout

```
model_alternative/linkML/
  acdc_concept.yaml          # NEW unified base spanning OC + DC + AC (the heart of the spike)
lib_alternative/
  concepts/                  # one DC + one AC per category, plus the OC leaves they depend on
  methods/  transformations/ # matching methods + slimmed (slice-only) transformations
```

Plugs into the existing pipeline: `linkml-validate -s acdc_concept.yaml` for shapes,
`gen-json-schema` for the generated artifact, a Python matcher beside
`validate_methods_model.py` for binding.

### `acdc_concept.yaml` — unified base (sketch)

- `Concept` (abstract) with: shared `dimensions`; a unified `result` contract (reconcile OC's
  `Result.Value`/`Unit` node form with DC's `valueType`/`unitRule` metadata form); a `provenance`
  slot (per-layer variable bindings, from `concept-variable-mappings.json`).
- An **optional** `definition` slot, discriminated by a `rules` postcondition (like `term XOR leaves`):
  - absent ⇒ **CollectedConcept** (OC leaf),
  - `AlgebraicIdentity` (operands typed by `produces` contract, `identity`) ⇒ **DerivedConcept** (DC),
  - `EstimandContract` (`constituents`, `dimensions`, `requiresModelClass`) ⇒ **AnalysisConcept** (AC).
- **Category supertypes** as `abstract` classes carrying inherited contracts (`Comparison`,
  `PointComputation`, … ; `TreatmentComparison`, … ; OC observation classes). Members via `is_a`.
- **`mixins`** for faceted axes (observation-class vs computation-type) — no forced single parent.
- Applies to **dimension concepts too** (`Parameter`, `Visit/AnalysisVisit`), not only measures.

### The two probes (what "the approach holds" means)

1. **Shapes hold (LinkML).** Every chosen concept validates; category inheritance resolves;
   collected/derived/estimand discrimination fires. **Headline tests:** model `Change` so its
   operands bind *either* two OC `Result`s *or* two DC `Measure`s; model `Parameter` once with OC
   (`--TEST`) and DC (`PARAM`) provenance bindings.
2. **Binding holds (Python matcher).** DC: unify concept identity with candidate method formula,
   confirm the derived slot map equals the current hand-authored transformation. AC: confirm method
   outputs ⊇ estimand `constituents` under the right model class.

### Decision gate

After the per-category slice: **adopt** (migrate concept libs to the unified base + `definition`/
`provenance`, then widen to full corpus) / **revise** / **discard**. The sandbox is time-boxed, not
a maintained fork; scenarios 1 & 3 stay untouched until the gate.

## What this is NOT

- **Not** OOP single inheritance; methods stay concept-free, classification is faceted (`mixins`).
- **Not** erasure of OC/DC/AC — the distinction survives as `provenance`/`role` metadata.
- **Not** an execution engine — unification / interface-satisfaction are *probes*, specified only
  far enough to validate the design.
- **Not** a rewrite of the working pipeline — the sandbox is parallel.

## Open questions for the team

1. **Grammar scope (DC).** Is `+ − × ÷ log` + scalars enough for the Comparison + Arithmetic
   families without leaking method behavior?
2. **Result-contract granularity.** How precise must `produces` be — `valueType` only, or
   `valueType` + `unitFamily` + dimensionality — to make cross-layer operand binding both sound and
   not over-constrained?
3. **Derived dimensions.** Do `AnalysisVisit` (windowed) and composite/derived `PARAM` use the same
   `definition` mechanism as derived measures, or a dimension-specific variant?
4. **Provenance model.** Is `provenance` a slot on the concept, or a separate mapping object
   (today's `concept-variable-mappings.json`) referenced by id? One-to-many layers (OC + DC + AC
   renderings of one concept) must be expressible.
5. **AC estimand axis.** Is `requiresModelClass` the right axis, or a model-family taxonomy
   (GLM / GLMM / survival / categorical)?
6. **Migration cost.** Once the slice holds, how much hand-authored transformation content collapses
   into derived binding — and is that worth the concept-schema migration?

## Recommendation

Adopt the principle — **concept owns meaning, method owns mechanism** — in three forms across one
model: **collected leaf** (OC), **algebraic identity** (DC), **estimand contract** (AC), with operands
typed by **result contract** so the OC/DC/AC boundary dissolves at the type level and dimensions
(`Parameter`, `AnalysisVisit`) unify by the same provenance mechanism as measures. Prove it in a
LinkML **unified-base** sandbox whose central new artifact is **`acdc_concept.yaml`**, scoped to one
DC + one AC per category plus their OC leaves, with the **two headline tests** (cross-layer `Change`,
cross-layer `Parameter`) and the **two probes** (shapes via `linkml-validate`, binding via a Python
matcher) as the pass/fail gate. Keep E9(R1) as the through-line; treat full-corpus migration as gated
on the slice.

---

*Next step:* spin a focused spike spec for `acdc_concept.yaml` + the per-category slice + the two
probes.
