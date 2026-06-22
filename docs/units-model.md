# How units work in the ACDC model

This note describes where unit information lives, how it flows through a transformation, and
how an execution engine turns it into a concrete unit on a result. It reflects the
2026-06-22 decision to make **the concept the single source of truth for units** and keep
**methods unit-agnostic**.

## Principle

Units are split into four distinct facts, each living in exactly one layer:

| Fact | Example | Where it lives |
|---|---|---|
| The **concrete unit** a value carries | `mg/dL`, `mg/L/week` | **instance data** — the FHIR `Quantity.unit` (sourced from SDTM `--ORRESU`) |
| The **unit rule** of a derived result | "inherits its source's unit"; "is a %"; "value ÷ time" | **the concept** (`unitRule`) |
| The **input precondition** (must operands agree?) | "the two operands must be the same kind of unit" | **the concept** (`inputUnitRelation`) |
| The **dimensional rule** (how units combine) | `Δy/Δt` (human) · `result := <a> - <b>` (executable) | documented for people in the concept's `math`; **realized by the bound method's `formula`** — that is what the engine runs (see below) |

The **method** carries *none* of these — it is pure scalar computation (`result := <minuend> - <subtrahend>`).
This mirrors the earlier decision that the FHIR *datatype* lives on the concept, not the method.

## What a concept declares

A concept's `result` is fully described by two small fields (plus three optional ones):

```jsonc
"result": {
  "valueType": "Quantity",            // FHIR datatype: Quantity | Range | Count | CodeableConcept | boolean | decimal
  "unitRule": "derived",              // inherited | derived | fixed | unitless | none
  "fixedUnit": "%",                   // ONLY when unitRule = fixed
  "inheritsFrom": "Timing",           // OPTIONAL: names the source when it isn't the obvious single value input
  "inputUnitRelation": "heterogeneous"// OPTIONAL: only when >=2 unit-bearing inputs — uniform | heterogeneous
}
```

### `unitRule` — how the result unit is determined

| value | meaning | how the engine resolves the concrete unit |
|---|---|---|
| `inherited` | same unit as the source | copy the source `Quantity`'s unit through |
| `derived` | a compound unit built from input units | **compute it** by dimensional arithmetic along the bound method's `formula` (`mg/L ÷ week → mg/L/week`) |
| `fixed` | a literal constant unit | use `fixedUnit` — the one case the engine cannot derive |
| `unitless` | a pure number, unit = 1 | no unit (ratios, p-values, test statistics). *Named `unitless`, not `dimensionless`, because "dimension" is reserved for the cube axes.* |
| `none` | not a quantity at all | n/a (codes, flags, bare counts) |

### `inputUnitRelation` — the "same kind?" precondition

Only meaningful when an operation takes ≥2 unit-bearing inputs. It lives on the concept, not the
method, because the *same* method serves opposite intents (`M.Division` produces both `Ratio`,
which needs like operands, and `RateOfChange`, which needs value-over-time):

- `uniform` — operands must be the same kind of unit (`Change`, `Ratio`). Validator + engine reject mismatches.
- `heterogeneous` — operands are deliberately different kinds (`RateOfChange` value÷time, `AreaUnderCurve` value×time).

### `valueType` ↔ `unitRule` coherence (enforced by the validator)

| `valueType` | allowed `unitRule` |
|---|---|
| `Quantity`, `Range` | `inherited`, `derived`, `fixed`, `unitless` |
| `Count`, `decimal`, `integer` | `unitless`, `none` |
| `CodeableConcept`, `boolean`, `string` | `none` |

## The metadata chain — what is human vs what the engine reads

Units are resolved by walking a chain of metadata across three layers. Only some of it is
machine-readable; one field is documentation only, and it is important not to confuse them:

```
transformation                         method                              concept (result)
──────────────                         ──────                              ────────────────
usesMethod ───────────────────────▶   formula.generic_expression          valueType         ◀─ machine
inputDataStructure.measures            "result := <minuend> - <subtrahend>" unitRule          ◀─ machine
  input ─▶ method slot   ◀─ machine    notation ("assignment", …)          fixedUnit         ◀─ machine
  concept, slice         ◀─ machine    (governed by formula_grammar.json   inheritsFrom      ◀─ machine
  requiredValueType      ◀─ machine     → has a BNF) ........ machine        inputUnitRelation ◀─ machine
outputDataStructure.measures           inputs[].dataType (primitive) ◀─ machine
  output ─▶ concept      ◀─ machine                                        math: "Δy/Δt"     ◀─ HUMAN ONLY
```

- **Executable (the engine reads these):** the transformation's bindings, the method's `formula`
  (`result := <minuend> - <subtrahend>`, a tokenized expression with a declared `notation`, governed by
  `lib/vocabulary/formula_grammar.json` which carries a **BNF**), and the concept's `valueType` /
  `unitRule` / `fixedUnit` / `inheritsFrom` / `inputUnitRelation`.
- **Human-only (the engine must NOT parse it):** the concept's **`math`** field (`Δy/Δt`, `∫y dt`,
  `sup{yᵢ}`). These are Unicode math glyphs with no grammar behind them — documentation of intent and a
  cross-check that the bound method does the right thing.

So when this note says a `derived` unit "follows the formula", it means the **method's `formula`**
applied to the input `Quantity`s by a units library — **never** the concept's `math`. The `math` glyph
is the human description of the same step; the executable description is the method formula it is bound to.

## The complete flow for a transformation

A transformation (`lib/transformations/…`) is the binding layer. It names a method, binds the
method's input/output slots to concepts + dimensions, and the **output** slot names the concept
whose `unitRule` governs the result's unit.

### Worked example — `T.ChangeFromBaseline`

```
transformation T.ChangeFromBaseline
  usesMethod: M.Subtraction
  inputDataStructure.measures:
    minuend    -> concept Measure, requiredValueType Quantity, slice endpoint
    subtrahend -> concept Measure, requiredValueType Quantity, slice parameter_baseline
  outputDataStructure.measures:
    result     -> concept Change

method M.Subtraction
  formula: result := <minuend> - <subtrahend>
  inputs:  minuend (decimal), subtrahend (decimal)
  outputs: result (decimal)

concept Change   (lib/concepts/Option_B_Clinical.json)
  valueType: Quantity
  unitRule: inherited
  inputUnitRelation: uniform
```

Step by step, what the engine does on a given `(Subject, Parameter, Visit)` row:

1. **Resolve inputs.** Both `minuend` and `subtrahend` bind to concept `Measure` of the *same*
   parameter (the two slices differ only by visit: `endpoint` vs `parameter_baseline`). Each input
   row arrives as a FHIR `Quantity` carrying a concrete unit, e.g. `minuend = 150 mg/dL` (this visit)
   and `subtrahend = 200 mg/dL` (baseline).
2. **Type bridge (already validated).** `requiredValueType: Quantity` projects to the method's
   primitive `decimal` via `compatiblePrimitives` (`Quantity → decimal|integer`). The method consumes
   the scalar `.value`; the unit rides alongside.
3. **Same-kind check.** `Change.inputUnitRelation = uniform` → the engine requires `minuend.unit == subtrahend.unit`.
   Here both are `mg/dL` (guaranteed structurally, since both bind to the same parameter), so it passes.
4. **Compute.** `M.Subtraction` runs `result := 150 - 200 = -50` on the scalars.
5. **Resolve the output unit.** The output binds to `Change`, whose `unitRule = inherited`. The engine
   copies the (common) input unit through → result unit = `mg/dL`.
6. **Emit.** The result is a `Quantity` `{ value: -50, unit: "mg/dL" }`.

### A worked example for every `unitRule`

The same six-step flow runs for every transformation; only the **unit-resolution step (5)** differs.
`(wired)` = a transformation exists today; `(illustrative)` = the concept is defined but not yet bound
to a transformation, so the binding shown is representative.

| `unitRule` | concept · transformation | an example row | output value · unit | how step 5 resolves the unit |
|---|---|---|---|---|
| `inherited` | `Change` · `T.ChangeFromBaseline` *(wired)* | `150 mg/dL − 200 mg/dL` | `-50` · `mg/dL` | copy the (common) input unit through |
| `none` | `Flag` · `T.BaselineSelection` *(wired)* | baseline record of a parameter | `"Y"` · *(none)* | result is a code, not a quantity — no unit participates |
| `fixed` | `PercentChange` · `M.PercentChange` *(illustrative)* | `100·(150−200)/200`, `mg/dL` cancels | `-25` · `%` | math cancels to a pure number; engine stamps the literal `fixedUnit = %` |
| `derived` | `RateOfChange` · slope of a series over time *(illustrative)* | eGFR `90 → 78 mL/min` over `24 week` | `-0.5` · `mL/min/week` | dimensional arithmetic on heterogeneous inputs: `(mL/min) ÷ week` |
| `unitless` | `Ratio` · `M.Division` *(illustrative)* | `150 mg/dL / 200 mg/dL` | `0.75` · *(none)* | like units cancel (`uniform` inputs) → unit = 1 |

Three of these are worth a sentence on the mechanism:

- **`fixed` is an override.** Dimensional arithmetic would give a pure number, but the concept *forces*
  `%`. This is the only `unitRule` where the engine cannot derive the unit and must read `fixedUnit`.
- **`derived` is pure arithmetic.** `inputUnitRelation: heterogeneous` tells the engine the operands are
  meant to differ; the output unit falls out of combining the input `Quantity`s along the **method's
  `formula`** (the concept's `math: Δy/Δt` is the human-readable description of the same step). No unit is
  stored — only computed.
- **`none` vs `unitless` are different.** `none` = not a quantity at all (a code/flag/count); `unitless`
  = a real number whose unit is 1 (a ratio). Both "have no unit", for opposite reasons.

### A wrinkle: configuration-driven units (`T.UnitConversion`, wired)

`M.UnitConversion` reads a `target_unit` **configuration** and converts each value — e.g. `5 mg/dL`
with `target_unit = g/L` becomes `0.05 g/L`. Its output binds to `Measure` (`unitRule: inherited`),
but the emitted unit is the *configured target*, not the inherited input unit. So for this method the
engine takes the unit from the method's configuration rather than the concept rule. This is the one
case where a config value, not the concept's `unitRule`, determines the output unit — worth keeping in
mind as the model evolves (it is the practical meaning of the retired `configured` policy).

## How it feeds an engine

For each output of a transformation, the engine computes the unit as:

```
unit_of(output) =
    inherited  -> unit_of(source input | inheritsFrom target)
    derived    -> dimensional_arithmetic(input units, following the method's formula)
    fixed      -> fixedUnit                         # literal override
    unitless   -> 1                                 # no unit
    none       -> (not applicable)
```

Two things the engine needs that are **not** on the concept:
- the **concrete input units** — read from the input `Quantity`s (instance data); and
- a **units library** capable of dimensional arithmetic and unit equality (so `derived` and the
  `uniform` check work). UCUM is the natural choice.

Everything else (which inputs must agree, what shape the output unit takes) is read from the
concept, and the method stays a reusable, unit-free computation template.

## Validation gates (`scripts/validate_methods_model.py`)

| check | what it guarantees |
|---|---|
| **C1** | every AC statistic concept has a valid `valueType` + `unitRule`, and the pair is coherent |
| **G1** | a transformation's `requiredValueType` is allowed by the bound concept and reachable to the method's primitive (`compatiblePrimitives`) |
| **G2** | every DC concept's `(valueType, unitRule)` is coherent; `fixedUnit` present iff `unitRule = fixed`; `inheritsFrom`/`inputUnitRelation` valid; and a transformation whose output concept is `uniform` binds its unit-bearing inputs to a single concept (same unit by construction) |

## Known gaps (not yet wired)

- **Numeric time axis.** `derived` time concepts (`RateOfChange`, `AreaUnderCurve`, `EventRate`,
  time-to-event) need Δt in *real units*. Transformations currently carry a Visit/Timing *ordering*
  dimension but no numeric duration + unit; that must come from the study time model (USDM timeline /
  SDTM `--DY`/`--DTC`). Until then the time-derived family cannot fully resolve its unit.
- **Orphan concepts.** Several concepts (`RateOfChange`, `Ratio`, `PercentChange`, `EventRate`,
  time-to-*, …) are not yet bound to any method/transformation, so their unit rules are declared but
  not exercised.
