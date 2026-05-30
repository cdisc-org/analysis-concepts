# `define.yaml` vs. the AC/DC framework

*A comparison of two LinkML-rooted approaches to clinical metadata, walked through the Change From Baseline derivation and the ANCOVA-on-CFB analysis.*

| | |
|---|---|
| **Status** | Draft (rev 2 — updated for the §6 Option B twin-DSD transformation shape) |
| **Date** | 2026-05-30 |
| **Audience** | AC/DC working group; reviewers deciding whether to converge on `define.yaml` |
| **Scope** | Method / Analysis / Transformation layer only. The Item / ItemGroup / Dataset / Dataflow parts of `define.yaml` are summarised but not compared in detail. |
| **Library version** | `ACDC_Transformation_Library_v06.json` v0.7 (post-§6 migration). Transformation bindings are now twin `inputDataStructure` / `outputDataStructure` qb:DSDs. |

---

## 0. Executive summary

`define.yaml` and the AC framework cover overlapping territory in opposite styles:

- `define.yaml` is **one Rosetta-Stone schema** (~2,560 lines, ~50 classes) that models items, item groups, methods, conditions, datasets, data flows, and analyses in a single type system with `exact_mappings` / `close_mappings` to SDMX, qb (RDF Data Cube), FHIR, OMOP, USDM, ODM, NCIt and PROV. Everything is one graph; the cost is breadth of types and many optional slots.
- The AC framework is **a stack of narrow, layered artefacts** (`acdc_method.yaml`, `acdc_transformation.yaml`, `lib/concepts/*`, `concept-variable-mappings.json`) where each layer enforces one invariant the others cannot violate. The headline invariant is the *concept-free method*: `M.ANCOVA` knows nothing about "baseline" or "Change"; that binding only exists in the transformation.

The two models could coexist. `define.yaml` already has the slots an AC `Method` or `Transformation` would need (`Method`, `Analysis`, `FormalExpression`, `Parameter`, `DataStructureDefinition`, `Dimension`, `Measure`, `ReifiedConcept`, `ConceptProperty`). What it doesn't yet have is the **architectural rule** that those slots stay layered. That rule is not expressible in LinkML alone, which is exactly why the AC framework keeps it as a separate schema with a build-time validator.

**The post-§6 migration tightens the alignment seam.** The new twin-DSD shape (`inputDataStructure` / `outputDataStructure`) maps almost 1:1 onto Define's `Dataflow` + `Dataset.structuredBy → DataStructureDefinition` pattern. The `_w3c_alignment` block at the top of the transformation library file is conceptually the same thing as Define's class-level `exact_mappings: qb:DataStructureDefinition`. The export transformer described in §7.2 becomes materially easier to write after the migration than it would have been before.

The recommendation at the end of this doc is to **adopt define.yaml as the export / interchange surface** (so AC artefacts can be serialised as Define-style governed elements with full SDMX / FHIR / qb mappings) while **keeping the AC framework as the authoring surface** (so the concept-free method rule is enforceable, not just recommended).

---

## 1. The two models, in one diagram

```text
DEFINE.YAML  (one schema, ~50 classes)            AC FRAMEWORK  (stacked schemas)
───────────────────────────────────────────       ────────────────────────────────────────────
                                                  acdc_method.yaml
                              ┌── Method ──┐         Method, MethodInput, MethodOutput,
                              │  Analysis  │         Formula, Configuration
                              │  Formal-   │         "concept-free" — enforced by absence
                              │  Expression│         of any concept-typed slot
GovernedElement ──┬── Item ───┘  Parameter │
                  ├── ItemGroup ─┐         │      acdc_transformation.yaml (post-§6)
                  ├── Data-      │  Reified-       Transformation
                  │   Structure- │  Concept          inputDataStructure  ─┐
                  │   Definition │  Concept-         outputDataStructure ─┴── twin qb:DSDs
                  ├── Dataflow ──┘  Property         Input/OutputMeasureBinding,
                  ├── Dataset                        Input/OutputDimensionBinding,
                  ├── Dimension                      Slice, SliceConstraint, SliceKey
                  ├── Measure                        XOR rule: concept | conceptCategory
                  └── CubeComponent              lib/concepts/
                                                    Option_B_Clinical.json (Derivation
SDMX / qb / FHIR / OMOP / USDM /                    Concepts: Measure, Change, …)
ODM / NCIt / PROV mappings                          AC_Concept_Model_v017.json (Analysis
on most classes                                     Concepts: LSMeans, Contrasts, Type3-
                                                    Tests, ParameterEstimates, …)

                                                  lib/concepts/concept-variable-mappings.json
                                                    sdtm.concepts.Change → "CHG"
                                                    adam.concepts.Change → "CHG"
                                                    (the SDTM/ADaM ↔ concept bridge)
```

Both stacks ultimately project onto an **RDF Data Cube** (`qb:DataStructureDefinition` / `qb:dimension` / `qb:measure` / `qb:Slice` / `qb:SliceKey`). That convergence is the alignment seam exploited in §6.

---

## 2. Walkthrough A — Change From Baseline (derivation)

The same derivation expressed in both models, side by side.

### 2.1 AC framework

Three artefacts collaborate:

**`lib/methods/derivations/M_Subtraction.json`** — concept-free arithmetic primitive.

```jsonc
{
  "conceptId": "M.Subtraction",
  "name": "Subtraction",
  "formula": {
    "notation": "assignment",
    "generic_expression": "result := <minuend> - <subtrahend>"
  },
  "inputs":  [{ "name": "minuend", "dataType": "decimal", "cardinality": "single" },
              { "name": "subtrahend", "dataType": "decimal", "cardinality": "single" }],
  "outputs": [{ "name": "result", "output_type": "computed_value",
                "dataType": "decimal", "unit_policy": "preserved" }]
}
```

No mention of *baseline*, *visit*, *parameter*, or *CHG*. This file is reusable for any subtraction — date differences, residuals, anything.

**`lib/transformations/ACDC_Transformation_Library_v06.json` → `T.ChangeFromBaseline`** — the binding layer, in the §6 Option B twin-DSD shape.

```jsonc
{
  "conceptId":          "T.ChangeFromBaseline",
  "label":              "Change From Baseline",
  "shortLabel":         "CFB",
  "transformationType": "derivation",
  "usesMethod":         "M.Subtraction",
  "methodConfigurations": [],

  "inputDataStructure": {
    "dimensions": [
      { "concept": "Subject" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" }
    ],
    "measures": [
      { "input": "minuend",    "concept": "Measure", "requiredValueType": "Quantity",
        "slice": "endpoint" },
      { "input": "subtrahend", "concept": "Measure", "requiredValueType": "Quantity",
        "slice": "parameter_baseline" }
    ],
    "slices": [
      { "name": "endpoint",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{visit}" }
        ] },
      { "name": "parameter_baseline",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{baseline_visit}" }
        ] }
    ]
  },

  "outputDataStructure": {
    "dimensions": [
      { "concept": "Subject" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" }
    ],
    "measures": [
      { "output": "result", "concept": "Change" }
    ]
  },

  "sliceKeys": [
    { "dimension": "ParameterDimension", "source": "biomedicalConcept" },
    { "dimension": "VisitDimension",     "source": "visit" }
  ]
}
```

The two slices `endpoint` and `parameter_baseline` are the only place "baseline" exists; their *diff* (one `{visit}`, the other `{baseline_visit}`) is the load-bearing signal that says "subtract the baseline value from the current value." The method has no idea it's being used for CFB. The §6 migration also moved several things: the qb cube structure is now twin `qb:DataStructureDefinition` blocks (each 1:1 with `qb:DataStructureDefinition`); slice templates live inside `inputDataStructure.slices[]`; the output binding's `concept` ("Change") replaces the old top-level `instanceOf: "Change"` field; and the rendered phrase that used to live in `composedPhrase` is now derived at render time from `validSmartPhrases[]` × `sliceKeys[]`-bound values.

**`lib/concepts/Option_B_Clinical.json` → `Change`** — the semantic anchor.

```jsonc
"Change": {
  "definition": "The arithmetic difference between two values of the same parameter.",
  "math": "x − x_ref",
  "result": { "valueType": "NumericValue", "unit": "inherited" }
}
```

**`lib/concepts/concept-variable-mappings.json` → `adam.concepts.Change`** — the projection to ADaM.

```jsonc
"Change": { "variable": "CHG", "byDataType": { "decimal": "CHG" },
            "notes": "Change from baseline" }
```

So the chain is `M.Subtraction` (math) → `T.ChangeFromBaseline` (the *baseline* binding + a `Subject × Parameter × Visit` cube) → `Change` (the AC/DC semantic concept) → `CHG` (the ADaM column). Each file owns one thing, and the validator's job (§6.6 of the method-schema spec) is to check the FK joins.

### 2.2 `define.yaml` equivalent

`define.yaml` does not provide M / T / Concept / Mapping as four separate files. The closest single-file expression is:

- A `Method` instance for the *arithmetic itself*, with a `FormalExpression` carrying the assignment and `Parameter` instances for `minuend` / `subtrahend`.
- An `Item` representing `CHG`, whose `method:` slot points at that `Method` instance and whose `conceptProperty:` slot points at a `ConceptProperty` (e.g. `BC_VS_SBP_change.value`).
- The encompassing `ItemGroup` (an `ADaM BDS DSD` — modelled as `DataStructureDefinition` with `dimensions: [USUBJID, PARAMCD, AVISIT]` and `measures: [AVAL, BASE, CHG, ...]`).
- The `Method` may carry `implementsConcept:` pointing at a `ReifiedConcept` named `Change` (which would replicate `Option_B_Clinical.json`'s `Change` entry as a Define `ReifiedConcept`).

A faithful (illustrative — not generated by a real Define-yaml validator) instance:

```yaml
- id: M.CHG.SBP
  name: Change from baseline in SBP
  type: Computation
  implementsConcept: Change       # ReifiedConcept reference
  expressions:
    - id: E.CHG.SBP.assignment
      expression: "CHG := AVAL - BASE"
      parameters:
        - name: AVAL,  items: [Item.AVAL]
        - name: BASE,  items: [Item.BASE]
      returnValue:
        id: RV.CHG.SBP
        dataType: float

- id: Item.CHG
  dataType: float
  method: M.CHG.SBP                       # FK to the Method above
  conceptProperty: CP.Change.value        # FK to a ConceptProperty
  origin:
    type: Derived
    sourceItems:
      - { item: Item.AVAL }
      - { item: Item.BASE }
```

#### What is the same

- `FormalExpression.expression` corresponds to the AC method's `formula.generic_expression`. (The Define expression is a concrete code string; the AC one is a symbolic template — see §3.4.)
- `Parameter` corresponds to `MethodInput`. Both carry name + dataType + binding.
- `Method.implementsConcept → ReifiedConcept` corresponds to `binding.concept = "Change"`.
- `ItemGroup` of type `DataCube` with `dimensions / measures` corresponds to the AC transformation's `inputDataStructure` / `outputDataStructure`.

#### What changes shape

| AC artefact (post-§6) | Define.yaml location | Comment |
|---|---|---|
| `M.Subtraction` (concept-free) | A *generic* `Method` instance, possibly without `implementsConcept` set | Define allows this — but does not require it. There is no rule that says "a Method MUST NOT reference a ReifiedConcept." |
| `T.ChangeFromBaseline` | A bespoke `Method` per parameter, OR a single `Method` plus per-`Item` rebinding | Define has no first-class "transformation" object; the binding lives on the `Item.method` reference and the `FormalExpression.parameters[].items`. |
| Twin `inputDataStructure` / `outputDataStructure` blocks | Two `DataStructureDefinition`s, one per `Dataflow` (or `Dataset.structuredBy`) | The new twin-DSD shape lines up almost 1:1 with Define's pattern of a `Dataflow` referencing an input and an output `Dataset`, each `structuredBy → DataStructureDefinition`. This is the closest direct correspondence in the whole comparison. |
| `inputDataStructure.measures[].input: "minuend"` / `outputDataStructure.measures[].output: "result"` | `FormalExpression.parameters[].name` / `FormalExpression.returnValue.id`, with `parameters[].items → Item` | Both sides FK the method's input/output slot names; both validate against the method definition at build time. |
| `slice = parameter_baseline` (in `inputDataStructure.slices[]`) | A `WhereClause` containing `Condition`s on `PARAMCD` and `AVISIT`, attached either to a `Parameter` (`applicableWhen`) or used as a `qb:SliceKey` analogue | Define has `WhereClause`, `Condition`, `RangeCheck`, and `qb:SliceKey` listed under `Condition.related_mappings` — but no concrete `Slice` class with a templated value like `{baseline_visit}`. |
| `sliceKeys[].source = "biomedicalConcept" \| "visit" \| "population"` | No direct equivalent | This is the AC-specific contract that *the endpoint spec supplies the slice values*. Define-yaml doesn't speak about endpoints. |
| `requiredValueType: Quantity` on the binding | `Item.dataType` + Item's link to FHIR Quantity (via `narrow_mappings: fhir:StructureDefinition/variable`) | Define expresses type constraints on the `Item`, not on the binding. |
| `_w3c_alignment` block at the top of the file (new in v0.7) | Mappings declared inline on each class (`exact_mappings: qb:DataStructureDefinition`, etc.) | The §6.5 alignment block is conceptually similar to Define's `exact_mappings` — both say "this AC/Define construct is a qb thing." Define puts it on the class; the migrated AC library puts it once at file scope. |

#### What is lost going from AC → Define

1. **The concept-free invariant for methods.** In AC, `M.ANCOVA.json` *cannot* mention `Change` — there is no slot to hold it. In Define, `Method.implementsConcept` is always available, so a sponsor could publish `M.ANCOVA_for_change_in_SBP` and Define would accept it. The reusability discipline becomes a convention, not a schema rule.
2. **The transformation as an addressable object.** `T.ChangeFromBaseline` has its own OID, its own `composedPhrase`, its own `validSmartPhrases`. In Define, the binding is implicit in `Item.method` + `FormalExpression.parameters`; you can't grant or revoke it as a unit, and there's no `composedPhrase`-like field at all.
3. **The endpoint-spec coupling (`sliceKeys[].source`).** Slice values like `{baseline_visit}` flow from a USDM endpoint at study time. Define has no slot that says "this dimension is bound at endpoint-pick time."

#### What is gained going from AC → Define

1. **Audit & governance.** `GovernedElement` mixes in `OID`, `mandatory`, `comments`, `siteOrSponsorComments`, `lastUpdated`, `owner`, `wasDerivedFrom`. AC files have only `version` and provenance is implicit in git history.
2. **Multilingual labels.** `Labelled` carries `label`, `description`, `aliases` all able to be `TranslatedText`. AC labels are plain strings.
3. **Standards mappings everywhere.** Each Define class declares `exact_mappings` / `close_mappings` / `narrow_mappings` against SDMX (`sdmx:Measure`, `sdmx:Dimension`, `sdmx:DataStructureDefinition`), RDF Data Cube (`qb:DataStructureDefinition`, `qb:dimension`, `qb:measure`, `qb:Slice`, `qb:SliceKey`), FHIR (`fhir:Expression`, `fhir:StructureDefinition`), OMOP (`omop:Transformation`, `omop:Table`, `omop:Field`), USDM (`usdm:BiomedicalConcept`, `usdm:AnalysisConcept`, `usdm:DerivationConcept`), ODM (`odm:Method`, `odm:ItemGroupDef`), and PROV (`prov:wasDerivedFrom`, `prov:wasAttributedTo`). The AC schemas have a handful (NCIt, STATO, FHIR) but nothing approaching this breadth.
4. **Origin & traceability.** `Origin` (with `type`: Collected / Derived / Assigned / Predecessor / Protocol) plus `sourceItems` gives a uniform way to record where every `Item` value comes from. AC's `concept-variable-mappings.json` covers the *target*-side projection but does not model the SDTM-to-ADaM derivation chain explicitly.

---

## 3. Walkthrough B — ANCOVA on Change From Baseline (analysis)

### 3.1 AC framework

**`lib/methods/analyses/M_ANCOVA.json`** — concept-free statistical primitive.

```jsonc
{
  "conceptId": "M.ANCOVA",
  "name": "Analysis of Covariance",
  "label": "ANCOVA",
  "formula": {
    "notation": "wilkinson_rogers",
    "generic_expression": "<response> ~ <covariate>* + <fixed_effect>+ + ..."
  },
  "configurations": [
    { "name": "ss_type", "dataType": "enum",
      "enumValues": ["I","II","III","IV"], "defaultValue": "III" },
    { "name": "alpha",   "dataType": "decimal", "defaultValue": 0.05 }
  ],
  "inputs":  [
    { "name": "response",     "dataType": "decimal", "cardinality": "single" },
    { "name": "covariate",    "dataType": "decimal", "cardinality": "multiple" },
    { "name": "fixed_effect", "dataType": "code",    "cardinality": "multiple" }
  ],
  "outputs": [
    { "name": "fit_statistics_linear",    "output_type": "fit_statistics_linear" },
    { "name": "type3_tests_f",            "output_type": "type3_tests_f",
      "indexed_by": ["covariate","fixed_effect","fixed_effect:fixed_effect","covariate:fixed_effect"] },
    { "name": "parameter_estimates_linear","output_type": "parameter_estimates_linear" },
    { "name": "ls_means",                  "output_type": "ls_means",
      "indexed_by": ["fixed_effect"] },
    { "name": "contrasts_t",               "output_type": "contrasts_t",
      "indexed_by": ["fixed_effect"] }
  ]
}
```

Nothing here says "change from baseline", "treatment", or "site". The five outputs are statistical *patterns* indexed by formula slot names.

**`T.CFB_ANCOVA`** — the binding, in the §6 Option B twin-DSD shape.

```jsonc
{
  "conceptId":          "T.CFB_ANCOVA",
  "label":              "Change From Baseline ANCOVA",
  "shortLabel":         "CFB ANCOVA",
  "transformationType": "analysis",
  "usesMethod":         "M.ANCOVA",
  "methodConfigurations": [
    { "configurationName": "ss_type", "value": "III" }
  ],

  "inputDataStructure": {
    "dimensions": [
      { "input": "fixed_effect", "concept": "Treatment" },
      { "concept": "Subject" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" }
    ],
    "measures": [
      { "input": "response",  "concept": "Change",  "requiredValueType": "Quantity",
        "slice": "endpoint" },
      { "input": "covariate", "concept": "Measure", "requiredValueType": "Quantity",
        "slice": "parameter_baseline" }
    ],
    "slices": [
      { "name": "endpoint",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{visit}" },
          { "dimension": "Population",         "value": "{population}" }
        ] },
      { "name": "parameter_baseline",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{baseline_visit}" },
          { "dimension": "Population",         "value": "{population}" }
        ] }
    ]
  },

  "outputDataStructure": {
    "dimensions": [
      { "concept": "Treatment" },
      { "concept": "Subject" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" }
    ],
    "measures": [
      { "output": "ls_means",                   "concept": "LSMeans" },
      { "output": "contrasts_t",                "concept": "Contrasts" },
      { "output": "type3_tests_f",              "concept": "Type3Tests" },
      { "output": "parameter_estimates_linear", "concept": "ParameterEstimates" },
      { "output": "fit_statistics_linear",      "concept": "FitStatistics" }
    ]
  },

  "sliceKeys": [
    { "dimension": "ParameterDimension", "source": "biomedicalConcept" },
    { "dimension": "VisitDimension",     "source": "visit" },
    { "dimension": "Population",         "source": "population" }
  ]
}
```

This single object encodes: *ANCOVA, with response = the Change concept (which T.ChangeFromBaseline produced), with the baseline value of the same parameter as covariate, with planned treatment as the fixed effect, at one analysis visit, in one population, using SS type III*. Producing the same ANCOVA on the raw (unsubtracted) value would be a different transformation but the same method.

Two §6-migration details worth noting against the older v06 shape:

- The five method outputs `ls_means`, `contrasts_t`, `type3_tests_f`, `parameter_estimates_linear`, `fit_statistics_linear` each bind to the corresponding AC result pattern via `output` + `concept`. The old `methodOutputSlotMapping` block is gone — that mapping IS the output-measure binding list now.
- Both inputs cite a named slice (`endpoint` for the response, `parameter_baseline` for the covariate). The diff between the two slices (`{visit}` vs `{baseline_visit}`) is the load-bearing signal. The old v06 only sliced the covariate explicitly and left the response's implicit endpoint filter to engine convention.

The analysis concepts the outputs map onto (`LSMeans`, `Contrasts`, `Type3Tests`, `ParameterEstimates`, `FitStatistics`) live in `AC_Concept_Model_v017.json` and define *what statistical objects look like* (constituents and dimensions) independently of the method that produced them.

### 3.2 `define.yaml` equivalent

`define.yaml` has an `Analysis` class explicitly for this — `Analysis is_a Method` plus `analysisReason`, `analysisPurpose`, `analysisMethod`, `applicableWhen`, `inputData`. A faithful instance:

```yaml
- id: A.CFB_ANCOVA.SBP.Week24
  name: ANCOVA on change from baseline in SBP at Week 24
  analysisPurpose: "Primary efficacy comparison"
  analysisMethod:
    - id: M.ANCOVA
      type: Analysis
      implementsConcept: ANCOVA   # ReifiedConcept
      expressions:
        - expression: "CHG ~ BASE + TRTP"
          parameters:
            - name: response,     items: [Item.CHG]
            - name: covariate,    items: [Item.BASE]
            - name: fixed_effect, items: [Item.TRTP]
  applicableWhen:
    - id: WC.ITT_Week24
      conditions:
        - { item: Item.ITTFL,  comparator: EQ, checkValues: ["Y"] }
        - { item: Item.AVISIT, comparator: EQ, checkValues: ["Week 24"] }
  inputData:
    - id: IG.ADVS_BDS         # ItemGroup with dimensions+measures
```

#### What is the same

- `Analysis.analysisMethod` is the AC `usesMethod` FK.
- The formula text in `FormalExpression.expression` is the AC `formula.default_expression`.
- `Parameter.items` (which references an `Item` or `Dimension` or `Measure`) is the AC binding's `methodRole → concept` link.
- `Analysis.applicableWhen → WhereClause → Condition → RangeCheck` is how Define expresses the AC `sliceKeys` / `slice.constraints`.
- `Analysis.inputData → ItemGroup | Dataset` is the AC `inputDataStructure`.

#### What changes shape

| AC artefact (post-§6) | Define.yaml location | Comment |
|---|---|---|
| `M.ANCOVA` (concept-free, statistical generic) | A `Method` instance, possibly tagged `implementsConcept: ANCOVA` | Same problem as §2.2: nothing in Define stops a sponsor from collapsing M and T into one statement (`A.CFB_ANCOVA.SBP.Week24` above already does it implicitly — there is no separate ANCOVA-without-context object). |
| `outputs[]` with `output_type` into `output_class_templates.json` (template by *statistical shape*) | `ReturnValue` plus `Item`s in the output `ItemGroup` (a `Dataset` typed as `DataCube`) | Define's output shape is enumerated as concrete `Item`s. The AC layer-1 / layer-2 / layer-3 templates (statistic / pattern / instance) are not modelled as such — though `ReifiedConcept` plus `ConceptProperty` could carry the same info if you reified the patterns. |
| Output measure bindings `{output: "ls_means", concept: "LSMeans"}` (one per method-output slot) | One `Item` per output column in the output `ItemGroup`, each with `conceptProperty → LSMeans.<constituent>` | Define expresses each column individually; AC binds the *method-output slot* directly to the *AC result pattern*, and the validator (per §6.6 rule 11) chain-resolves the per-statistic columns from the pattern's `constituents[]` against `statistics_vocabulary.json`. |
| `methodConfigurations[].configurationName="ss_type", value="III"` | `Parameter.value` on a `FormalExpression` parameter | Define's `Parameter` is overloaded: it can be a formula token AND a configuration value-holder. AC keeps these in separate arrays (`inputs[]` vs `configurations[]`), which is easier to validate and easier to render. |
| Twin `inputDataStructure` + `outputDataStructure` with explicit dim duplication | One `Analysis.inputData → ItemGroup | Dataset` plus an output `ItemGroup`, each with its own DSD | After the §6 migration both schemas now describe the consumed vs. produced cubes as independent DSDs. AC carries this duplication on purpose ("the price of qb fidelity" per §6.5); Define does it because `Dataflow` already separates input from output. |
| `inputDataStructure.slices[]` with `{visit}` / `{baseline_visit}` placeholders | `WhereClause` + `Condition` + `RangeCheck` (no templating) | Define can express the literal version of either slice but does not have the *template* mechanism. The endpoint-driven binding (`sliceKeys[].source = "visit"`) has no Define counterpart. |
| `validSmartPhrases[]` (composed phrase rendered at display time from this list × sliceKey-bound values) | No equivalent slot | Same point as before; with the §6 migration the rendered string is no longer baked into the JSON (`composedPhrase` was dropped), reinforcing that this is a UI-layer concern. Define has no slot for it on either side. |

#### What is lost going from AC → Define

1. **Concept-free method discipline** (same point as §2.2 — louder here because analyses are where it matters most).
2. **Output decomposition into (class, shape, distribution).** `output_class_templates.json` decomposes every analysis output as a triple (e.g. `(ls_means, vector, none)` or `(type3_tests_f, vector, F)`). Define expresses outputs as `Item`s and leaves the statistical typology to documentation.
3. **The SmartPhrase / `composedPhrase` rendering contract.** Authors-of-protocols-see-and-edit-spec-as-text is a first-class concern in AC; in Define it would have to live in `comments` or `description`.
4. **Slice templates with parameterised placeholders.** AC's `Slice.constraints[].value = "{baseline_visit}"` is a *template*, not a literal. Define's `RangeCheck.checkValues` is a list of literal strings.

#### What is gained going from AC → Define

1. **`analysisReason`, `analysisPurpose`, `applicableWhen`** — explicit narrative slots tied to USDM that AC currently shells out to the protocol or the analysis spec.
2. **`Analysis is_a Method`** — Method and Analysis share the same surface (governance, audit, mappings, OID identity). The AC stack instead splits them into `M_*.json` and `analyses/M_*.json` (a directory naming convention, not a schema discriminator).
3. **`Display` and `Dataflow`** — first-class objects for "the rendered output" and "the data movement". AC has neither; ARS submissions and TLF rendering live downstream of the framework.
4. **`Origin.sourceItems` on every Item** — uniform provenance, including documenting that `CHG` was derived from `AVAL - BASE`. The AC framework's "source store / execution layer" idea (see project memory) maps cleanly to this.

---

## 4. Concept and mapping comparison

### 4.1 Semantic concepts

| AC | Define.yaml |
|---|---|
| `lib/concepts/Option_B_Clinical.json` (DC: Measure, Change, PercentChange, Ratio, LogRatio, Shift, …) | `ReifiedConcept` instances (with `ConceptProperty` children for value/unit/baseline). `narrow_mappings: usdm:DerivationConcept`. |
| `lib/concepts/AC_Concept_Model_v017.json` (AC: LSMeans, Contrasts, Type3Tests, ParameterEstimates, FitStatistics — each with `constituents` and `dimensions`) | `ReifiedConcept` instances (with `ConceptProperty` children for each constituent). `narrow_mappings: usdm:AnalysisConcept`. |
| `lib/concepts/OC_Instance_Model_v016.json` (Observation Concepts) | `ReifiedConcept`. `narrow_mappings: usdm:BiomedicalConcept`. |

The AC choice to keep DC, AC, and OC in three separate JSON files (and to name them clinical-style: *Measure*, *Change*, *LSMeans* rather than statistical-style: *AbsoluteDifference*, *LeastSquaresMean*) is design, not necessity — `define.yaml` would happily accept all three as `ReifiedConcept` instances in one file, with `properties → ConceptProperty`. The `concept` field on AC bindings becomes a string FK into `ReifiedConcept.OID` in Define.

### 4.2 SDTM/ADaM ↔ concept mappings

`lib/concepts/concept-variable-mappings.json` is the AC framework's "Implementation" layer: it maps each concept (`Change`, `Measure`, `Shift`) to the ADaM variable (`CHG`, `AVAL`, `AVALC`) and, for SDTM, to facet → variable maps (`Identification.Topic → --TESTCD`).

`define.yaml` has *no equivalent file* but has the *mechanism* for it: each `Item` carries `conceptProperty: ConceptProperty`, so the same information can be expressed as `Item.CHG → ConceptProperty.Change.value` repeated across every ADaM / SDTM `ItemGroup`. The AC file is more compact (one entry per concept, varies by `byDataType`); the Define encoding is more explicit (one `Item` per variable per dataset, with `conceptProperty` plus `Origin.sourceItems`).

If you converged, the AC mapping file becomes a *generator* for Define-style `Item`s in the SDTMIG / ADaMIG standards packages.

---

## 5. What you would lose by adopting `define.yaml` wholesale

These are the things the AC framework gives you that `define.yaml` does not — in priority order.

### 5.1 Schema-enforced concept-free methods

The biggest one. `acdc_method.yaml` has **no slot** that could carry a concept reference. The constraint in §6.6 of the design spec — *"method files MUST NOT reference clinical concepts"* — is enforced by absence: there is nothing to violate. In `define.yaml`, `Method.implementsConcept` is always present, and `Analysis is_a Method` means analyses inherit it. The convention becomes a recommendation enforced only at review time, which is materially weaker.

### 5.2 The Method × Transformation orthogonal product

In AC, *N* methods × *M* concepts = *N×M* possible transformations, each addressable, configurable, and reviewable in isolation. The current library has 38 analysis methods and 21 derivation methods. The transformation library exploits this multiplicatively: `T.CFB_ANCOVA`, `T.CFB_MMRM_Primary`, `T.LOCF_Imputation`, `T.OS_LogRank`, … each one a thin pairing.

In `define.yaml`, a transformation has no first-class object: it is implicit in `Item.method + FormalExpression.parameters[].items`. To make CFB-ANCOVA addressable you create a per-study `Method` instance, which means the *N×M* matrix collapses to *one instance per study × per binding*. Reuse becomes file-copy reuse, not FK reuse.

### 5.3 The output decomposition vocabulary

AC's three axes from `output_class_templates.json` — class × shape × distribution — give every analysis output a *typed contract*: a Type-III F test is `(type3_tests_f, vector, F)`; an LS-mean is `(ls_means, vector, none)`; a CFB is `(computed_value, scalar, none)`. ARS consumers can validate the shape of every result without reading documentation. Define expresses the result as a `Dataset` of `Item`s; the typology lives in description text.

### 5.4 Slice templates and `sliceKeys[].source`

`{baseline_visit}` resolving to "the baseline visit declared in the endpoint spec at study-spec time" is an AC-specific contract. Define has `qb:SliceKey` listed as a mapping but no schema slot that says where the slice value comes from at study time.

### 5.5 Smart-phrase composability (`composedPhrase`, `validSmartPhrases`)

Authoring an analysis spec by typing *"change from baseline in {parameter} at {visit} comparing {treatment} groups using ANCOVA adjusting for baseline {parameter}"* and having a deterministic mapping to `T.CFB_ANCOVA` is unique to AC. Define has no slot for this.

### 5.6 Layered narrowness

`acdc_method.yaml` has 4 enums + 8 classes. `acdc_transformation.yaml` has 3 enums + 14 classes. Reviewers can hold each file in their head. `define.yaml` has ~30 enums and ~50 classes in one file; reviewers cannot.

---

## 6. What you would gain by adopting `define.yaml` wholesale

In priority order.

### 6.1 SDMX / qb / FHIR / OMOP / PROV mapping out of the box

Every Define class declares mappings against the major statistical and clinical metadata standards. Today the AC framework has NCI/STATO/FHIR codings on `Method` and `Coding` but no class-level mappings. Adopting Define would let you serialise the AC library as RDF Data Cube / SDMX / FHIR resources without writing transformers.

### 6.2 Governance fields

`Governed` mixin (`mandatory`, `comments`, `siteOrSponsorComments`, `purpose`, `lastUpdated`, `owner`, `wasDerivedFrom`) gives every metadata element an audit trail. The AC framework has only `version`.

### 6.3 Multilingual / labelled

`Labelled` mixin makes `label`, `description`, `aliases` `TranslatedText`-capable. AC labels are plain strings.

### 6.4 `Origin`, `SourceItem`, `wasDerivedFrom`

Uniform provenance. `Item` → `Method` → `FormalExpression` → `Parameter.items → Item` is a navigable derivation graph. The AC framework's pipeline / "source store" concern is materially served by this.

### 6.5 First-class `Dataset`, `Dataflow`, `Display`

Define models the full upstream-and-downstream pipeline. The AC framework stops at the transformation; ARS submission and TLF rendering live downstream. If you want one schema to describe all of it, Define already has the slots.

### 6.6 `Condition` / `WhereClause` / `RangeCheck` composability

AC's `slice.constraints` are flat (a list of `{ concept, value }`). Define's `Condition` / `WhereClause` / `RangeCheck` support nesting, operators (AND/OR/NOT/EXPRESSION), reusable OIDs, and formal-expression escapes for the corner cases. The AC slice mechanism would benefit from this composability when validation rules get more complex.

### 6.7 Standards-package shape

Define is designed to be the publishing format for CDISC standards packages (SDTMIG, ADaMIG, CDASH, Define-XML). Sponsors already speak it. If the AC framework is to be ratified as a CDISC standard, expressing it in `define.yaml` reduces the learning curve.

---

## 7. Alignment options

Three plausible postures, in increasing order of integration:

### 7.1 Status quo — independent stacks (no alignment)

Keep the AC framework as-is. Use `define.yaml` only for `define.json` / `define-xml` exports of the resulting study artefacts. **Risk**: divergence; the same Method/Concept information is maintained in two places.

### 7.2 Map AC → Define at export time (recommended near-term)

Add a transformer that emits Define instances from the AC library. The post-§6 shape makes most of these mappings near-mechanical:

- `M_*.json` → `Method` instances (with `implementsConcept` left null to mark them concept-free).
- `Transformation` entries → a `Dataflow` whose `structure` is the input `DataStructureDefinition` (from `inputDataStructure`), whose corresponding output `Dataset.structuredBy` is the output `DataStructureDefinition` (from `outputDataStructure`), and whose `analysisMethod` references the named `Method` (with `methodConfigurations[]` projected onto `FormalExpression.parameters[].value`). For analyses, the transformation also maps to an `Analysis` instance with `analysisMethod` set; for derivations, the bound output measures' `concept` field projects to `Item.conceptProperty` on the output cube.
- `Option_B_Clinical.json` / `AC_Concept_Model_v017.json` / `OC_Instance_Model_v016.json` → `ReifiedConcept` instances.
- `concept-variable-mappings.json` → `Item` instances in the SDTMIG / ADaMIG packages, each with `conceptProperty` set.
- `inputDataStructure.slices[]` → `WhereClause` + `Condition` + `RangeCheck` (one per `SliceConstraint`), with `{placeholder}` values left as a comment string until the endpoint binds them.
- `sliceKeys[].source` → an AC-specific *extension* slot on the Define `WhereClause` (or a Coding under `Condition`). This is the one place AC carries information Define cannot express natively.
- `_w3c_alignment` block → already says the same thing Define's class-level `exact_mappings: qb:DataStructureDefinition` etc. say. The transformer can simply elide it on emission.

**Gain**: a Define-XML / Define-JSON export of the AC library *with full SDMX/qb/FHIR/OMOP/USDM mappings* falls out automatically. The twin-DSD shape is exactly what Define expects on both ends of a `Dataflow`.

**Cost**: a transformer with tests; no breaking changes to the AC library; ongoing maintenance of the transformer when either schema evolves.

### 7.3 Migrate AC schemas to inherit from Define classes (longer-term)

Rewrite `acdc_method.yaml` and `acdc_transformation.yaml` so their root classes `is_a` Define classes. The post-§6 shape makes the inheritance graph particularly clean:

- `acdc_method.Method` (renamed something like `ACDCMethod`) `is_a: define.Method` with `implementsConcept` *removed* via `slot_usage`. (LinkML supports overriding a parent slot to be forbidden; the validator checks this.)
- `acdc_method.MethodInput` `is_a: define.Parameter`.
- `acdc_method.MethodOutput` `is_a: define.ReturnValue` (or a new `ItemGroup`-like class for structured outputs).
- `acdc_transformation.Transformation` `is_a: define.Dataflow` (since the §6 shape now declares an input DSD, an output DSD, and a method — exactly what `Dataflow` carries). For `transformationType: "analysis"`, it would additionally project to a `define.Analysis` instance with `analysisMethod` set.
- `acdc_transformation.InputDataStructure` / `OutputDataStructure` `is_a: define.DataStructureDefinition` (1:1, no slot adaptation needed).
- `acdc_transformation.InputMeasureBinding` / `InputDimensionBinding` `is_a: define.CubeComponent` (which already extends `GovernedElement` and references `Item`).
- `acdc_transformation.Slice` `is_a: define.WhereClause` (plus the placeholder extension).
- `acdc_transformation.SliceKey` — no Define parent; an AC-specific extension.

**Gain**: one schema, one validator, AC-extracted SDMX/qb/FHIR mappings preserved across the layered enforcement. The twin-DSD shape inherits Define's mappings on `DataStructureDefinition` automatically.

**Cost**: schema redesign, file regeneration, validator rewrite. The concept-free rule on `Method` is preserved by `slot_usage: { implementsConcept: { required: false, equals_string: "" } }` plus a build-time rule; that's a structural pattern Define currently doesn't use but LinkML supports. The `_w3c_alignment` block at the top of the transformation library file becomes redundant (the class-level Define mappings replace it).

A reasonable plan: do 7.2 immediately (low effort, immediate interoperability) and pre-commit to 7.3 only after the AC framework's own semantics (output decomposition, slice templates, smart phrases) are formalised enough that the inheritance map is clear.

---

## 8. Recommendation

Adopt **Option 7.2** now and **plan for 7.3** once two AC-side designs settle:

1. **Output decomposition** (`output_class_templates.json`) is currently AC-only. If it stabilises, propose adding three axes (`OutputClass`, `OutputShape`, `Distribution` — they're already enums in `acdc_method.yaml`) into Define as `ReifiedConcept` categories so structured analysis outputs are typeable across both schemas.
2. **Slice templates** (`{baseline_visit}` etc.) and `sliceKeys[].source` are also AC-only and have no Define analogue. Either:
   - propose them as a Define extension (e.g. a `Slice` class with `constraints: SliceConstraint[]` carrying templated values, parallel to AC), or
   - keep them as AC-private extensions of `WhereClause` and accept that AC artefacts round-trip through Define only with a `comments` field carrying the AC encoding.

You are not missing anything material *for the current AC framework's job* by not having adopted Define. What you would gain is **publishability**: SDMX / qb / FHIR / USDM / PROV mappings on every element, a multilingual labelling story, full audit fields, and a path to express the AC library as a Define-JSON / Define-XML deliverable. What you would lose if you adopted Define naïvely (no extensions, no `slot_usage` overrides) is the very thing that makes the AC framework distinctive: the schema-enforced separation of *math* from *meaning*. The recommendation is to keep that separation as the authoring discipline, and to use Define as the publication and interoperability surface.

---

## 9. Post-§6 migration: what the assessment changed

The §6 (Option B twin-DSD) migration of `ACDC_Transformation_Library_v06.json` (v0.6 → v0.7) does **not** change the high-level conclusion: the AC framework's concept-free method discipline is still its load-bearing distinction from `define.yaml`, and `define.yaml` still wins on standards mappings, governance, and publishability. The recommendation (do Option 7.2 now, plan for 7.3 later) is unchanged.

What the migration does change:

1. **The qb correspondence is no longer aspirational.** Pre-§6, the AC library asserted qb alignment via a `_w3c_alignment` block but used a single flat `bindings[]` array with a `direction` discriminator — meaning a JSON→RDF converter had to *partition* `bindings[]` to materialise the two real DSDs. Post-§6, the file has two literal `qb:DataStructureDefinition`s on disk. A converter just emits them.
2. **The Define `Dataflow` correspondence becomes obvious.** Pre-§6, mapping a transformation to Define required choosing between a bespoke `Method`-per-binding or some `ItemGroup`-of-output construction. Post-§6, a transformation IS a `Dataflow` with an input DSD, an output DSD, and an `analysisMethod` — exactly what `define.Dataflow` carries. §7.2 of this doc was rewritten to reflect that.
3. **The FK structure is now uniform.** Every binding now carries either an `input` FK (into `method.inputs[].name`) or an `output` FK (into `method.outputs[].name`). The migrated library has 25 transformations and every input/output/configuration FK validates cleanly against the method files. This is the same FK contract Define enforces between `Item.method`, `FormalExpression.parameters[].items`, and `Item`s — the validation surfaces line up.
4. **`composedPhrase` is gone; `methodOutputSlotMapping` is gone; `instanceOf` is gone.** All three were AC-only conveniences with no Define counterpart. Dropping them simplifies §3's "what changes shape" table and removes friction in any future export transformer.
5. **`output_class_templates.json` is now the only AC artefact with no clean Define counterpart.** The three-axis decomposition (class × shape × distribution) is still AC-specific. §8's recommendation to formalise it before pursuing Option 7.3 stands.

The biggest *non-change*: `define.yaml` still has no schema-level way to enforce the concept-free method rule. Whatever path the working group picks, that rule has to be re-encoded — either as a LinkML `slot_usage` override on a subclassed Method (Option 7.3), or as a validator-rule maintained alongside the transformer (Option 7.2).

---

## Appendix — file index referenced

| File | Role |
|---|---|
| `define.yaml` | Single-schema metadata model (LinkML, ~2,560 lines) with SDMX/qb/FHIR/OMOP/USDM/ODM/NCIt/PROV mappings. |
| `model/linkML/acdc_method.yaml` | LinkML schema for AC methods. Encodes §3 of the method-schema design spec. |
| `model/linkML/acdc_transformation.yaml` | LinkML schema for AC transformations. Encodes §6 (Option B — strict twin DSDs). |
| `model/json_schema/acdc_method.schema.json` | Generated JSON Schema from `acdc_method.yaml`. |
| `model/json_schema/acdc_transformation.schema.json` | Generated JSON Schema from `acdc_transformation.yaml`. |
| `lib/methods/analyses/M_ANCOVA.json` | Concept-free ANCOVA primitive. |
| `lib/methods/derivations/M_Subtraction.json` | Concept-free arithmetic primitive used by `T.ChangeFromBaseline`. |
| `lib/transformations/ACDC_Transformation_Library_v06.json` | All transformations; contains `T.ChangeFromBaseline` (§2.1) and `T.CFB_ANCOVA` (§3.1). |
| `lib/concepts/Option_B_Clinical.json` | Derivation Concepts (Measure, Change, PercentChange, …). |
| `lib/concepts/AC_Concept_Model_v017.json` | Analysis Concepts (LSMeans, Contrasts, Type3Tests, …) plus categories (TreatmentComparison, …). |
| `lib/concepts/OC_Instance_Model_v016.json` | Observation Concepts. |
| `lib/concepts/concept-variable-mappings.json` | SDTM / ADaM ↔ concept mappings. |
