# OC Recording Model v017 — Design Note

**Date:** 2026-06-09
**Status:** Approved for build
**Artifact:** `lib/concepts/OC_Recording_Model_v017.json` (new; `OC_Instance_Model_v016.json` left untouched)

## 1. Purpose

Restate the Observation Concept model around the **abstract "Recording" tree** from the
SCDM *Build Definitions* principle (data4knowledge), so that:

- generic, study-independent **concept identities** are the nodes,
- **SDTM variables are aliases** bound to those nodes via `"is a"` relationships,
- **FHIR R5 complex datatypes** model the result/value branch (`Quantity` = value + unit,
  `CodeableConcept` = coded),
- **USDM Biomedical Concept properties** resolve onto the nodes, and a concrete BC is an
  *inherited, constrained* `BuildDefinition`,
- the one abstraction covers **Findings, Events, and Interventions**.

## 2. Source grounding (no hardcoding — everything derives from model metadata)

| Source | What it contributes |
| --- | --- |
| `model/SDTM_v2.0.csv` (+ PDF) | Class/Role backbone: Topic, Timing, Identifier, the qualifier roles. |
| `model/cdisc_sdtm_dataset_specializations_latest.xlsx` | The **relationship graph**: each `sdtm_variable` links via a `linking_phrase` / `predicate_term` back to the Topic, carrying a `dec_id` (cross-domain generic concept C-code). 12,680 rows / 197 dec_ids / 1,326 specializations. |
| `https://build.fhir.org/datatypes.html` (R5) | Complex datatypes for the value branch: `Quantity`, `CodeableConcept`, `Identifier`. |
| `model/NCT01797120-…json` (USDM) | Real `BiomedicalConcept` shape used to define the BC-property hook and the worked example. |

Key empirical facts that justify the abstraction (reuse is real, not speculative):

- `C70856` "Observation Result" reused across **18 domains**; `C82515` "date of occurrence"
  across **22**; `C13717` "Anatomic Site" across **8**.
- `C13717` appears **independently** in both the xlsx (`VSLOC -[specifies the anatomical
  location…]-> VSTESTCD`) and the USDM BC (`VSLOC.standardCode = C13717`) — the two join
  keys cross-check.
- Topic suffixes by class: `TESTCD` (Finding), `TERM` (Event), `TRT` (Intervention),
  `PARMCD` (parameter-style findings).

## 3. The motivation (why a generic Recording earns its place)

1. **Define semantics once, inherit everywhere** — 1,326 specializations / 50 BCs share one
   definition of Result/Unit/Location instead of each redefining it.
2. **One engine traverses every class** — concept-keyed execution walks
   `Recording → Result → Quantity → value` for a vital sign, a dose, or a severity grade alike.
3. **Star, not spaghetti** — each external standard (SDTM, FHIR, USDM) maps **once** to the
   generic hub; cross-standard links fall out, instead of N×M direct mappings.
4. **The abstraction is the validation schema** — a `BuildDefinition` only *constrains* the
   inherited tree (the slide's red ✗ on the unused branch is only checkable against a parent).
5. **Traceability** — results trace to a stable identity (`Result/C70856`), not to a
   variable name that drifts; SDTM/FHIR/USDM churn is absorbed as new aliases.

**Cost / guardrail:** a node belongs on the abstract spine only if its `linking_phrase`
genuinely recurs across classes; otherwise it is class-gated (`appliesToClass`). This stops
over-abstraction (e.g. `GenomicContext` stays Finding-only).

## 4. Architecture — spine + value-pattern + class-specific characterizing nodes

The crucial correction over a naïve "one flat tree": **there is no universal `Result`
slot.** An adverse event has no `--ORRES`. Three things are distinguished:

### 4a. Shared spine (truly universal — every General Observation Class has it)
```
Recording ─┬─→ Identity   (Sequence, GroupId, RefId, LinkId)
           ├─→ Topic      (Finding:--TESTCD | Event:--TERM | Intervention:--TRT)
           ├─→ Timing     (C82515; FHIR effective[x])
           └─→ [shared qualifiers]  Category(C25372), Subcategory(C25692),
                                     Method(C82535), Location(C13717),
                                     Laterality(C25185), Specimen(C70713),
                                     EvaluatorRole(C51824), Position, …
```

**Timing is a single concept shaped as FHIR `effective[x]`** — not a flat set of date
aliases. `--DTC` (instant) and `--STDTC` (period start) are the *same* occurrence concept
(both carry dec_id **C82515**); only `--ENDTC` is distinct (the period end). The
instant-vs-period choice mirrors the class split:
```
Timing (C82515)
 └─ effective : CHOICE
      • instant → --DTC                    (point;    Finding)
      • period  → start:--STDTC + end:--ENDTC (interval; Event/Intervention)
 └─ Duration (--DUR) · StudyDay (--DY/--STDY) · RelativeTiming (--ENRF/--ENTPT)
```
This replaces both the earlier flat `DateTime` node **and** the separate
`sharedDimensions.Timing` — they were the same concept modelled twice. Timing lives on the
spine (it is universal); `sharedDimensions` keeps only the planned `Timepoint` label.

### 4b. Reusable value pattern (a datatype shape the spine offers — NOT a universal slot)
```
Result/Value ─┬─→ Quantity ─→ value
              │              └─→ code (units)   [FHIR Quantity]
              └─→ Coded ─────→ code             [FHIR CodeableConcept]
```

### 4c. Class-specific characterizing nodes (each binds the value pattern its own way)
| Class | Characterizing node(s) | dec_id | Value pattern |
| --- | --- | --- | --- |
| **Finding** | `Result` (`--ORRES`/`--STRESN`/`--STRESC`) | C70856 | Quantity \| Coded |
| **Intervention** | `Dose` (`--DOSE`+`--DOSU`), `Frequency`(C83044), `Route`(C83120) | C83221 | **Quantity** |
| **Event** | `Occurrence`(C127786, boolean), `Severity`(C53253), `Seriousness`(C53252), `Outcome`(C49489), `ActionTaken`(C83013) | — | Coded / boolean |

This is a **hybrid of "one polymorphic tree" (A) and "class-specialized subtrees" (B)**: the
spine and the value pattern are written once (A's benefit); the characterizing branch is
class-specific (B's honesty). It is consistent with v016's existing `observationCategories →
additionalDefinitions`.

## 5. Node binding shape

Every node carries four kinds of binding so that all four sources resolve onto it:

```jsonc
"Location": {
  "conceptId": "Location",
  "definition": "Anatomical site at which the observation was performed",
  "valueType": "CodeableConcept",            // FHIR
  "relationship": "atLocation",
  "linkingPhrase": "specifies the anatomical location of the performance of the test in",
  "predicateTerm": "SPECIFIES",              // from xlsx
  "decConcepts": ["C13717"],                 // generic cross-domain identity
  "aliases": ["--LOC"],                      // SDTM variable pattern ("is a")
  "appliesToClass": ["Finding", "Intervention"],
  "usdmBinding": { "resolvesBy": { "aliasPattern": "--LOC", "standardCode": "C13717" } }
}
```

## 6. Two-tier: Abstract + BuildDefinition (= USDM BC)

- **Tier 1 — Abstract `Recording`**: §4 above + `sharedDimensions` + `valueTypes`
  (carried from v016, lightly aligned).
- **Tier 2 — `BuildDefinition`**: `inherits` Recording, then *constrains* — picks the value
  branch (Quantity vs Coded), fixes `responseCodes`/units, sets the Topic term. **A
  `BuildDefinition` is a USDM `BiomedicalConcept`**; its `BiomedicalConceptProperty` items
  resolve onto Tier-1 nodes by `usdmBinding` (alias + `standardCode`).

**Worked example (real, from the USDM file): Systolic Blood Pressure** — `inherits`
`Recording`, picks the `Quantity` branch (`VSORRES` decimal + `VSORRESU` → mmHg), resolves 5
properties (`VSORRES`→Result/C70856, `VSORRESU`→Unit, `VSPOS`→Position/C62164,
`VSLOC`→Location/C13717, `VSLAT`→Laterality).

## 7. File layout (`OC_Recording_Model_v017.json`)

```
model, version "0.17", description, fhirAlignment
principleSource           // attribution to the SCDM Build Definitions slide
valueTypes                // primitiveTypes + complexTypes (FHIR: Quantity, CodeableConcept, Identifier, Period)
Recording                 // §4a spine + §4b value pattern, with §5 bindings
  spine: identity, topic, timing(effective[x]), sharedQualifiers ; valuePattern
observationClasses        // Finding / Event / Intervention: inherits + characterizing nodes
sharedDimensions          // Subject, Study, Visit, Timing, Treatment, Population, Site
buildDefinition           // the inherits/constrain mechanism + USDM BC mapping rules
  workedExample: Systolic Blood Pressure
valueTypeUsageByLayer     // from v016
```

## 8. Out of scope

- Generating the full set of 1,326 BuildDefinitions (only one worked example is included).
- Modelling `GenomicContext`, Associated Persons, Trial Design classes (Finding-/non-GOC
  specific; can be added later as class-gated nodes).
- Changing any downstream consumer of v016.
