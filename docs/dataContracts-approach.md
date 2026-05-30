# DataContracts for Analysis Concepts

*Ingestion · Derivation · Analysis — anchored to a single graph of typed identifiers*

| | |
|---|---|
| **Status** | Draft — architectural proposal |
| **Date** | 2026-05-29 |
| **Audience** | AC/DC working group; CDISC implementers; engine implementers |

---


## Note on terminology


Throughout this document, "DC" is shorthand for dataContract. This is NOT the same as "DC" in the AC/DC concept model name, where "DC" means Derivation Concept. To avoid confusion:

- dataContract (the subject of this document) — a unique identifier that sets the required context for a future data point. Abbreviated "DC" only in this document.
- Derivation Concept (from AC/DC = Analysis Concept / Derivation Concept) — a semantic concept describing a derived clinical value (e.g. Change, Ratio, Flag). These are entries in lib/concepts/Option_B_Clinical.json. Not abbreviated here; written out in full.

When the text references the existing concept model's Derivation Concepts (e.g., a transformation that implements the Change derivation concept), the term is written out in full to avoid collision with the dataContract abbreviation.


---


## 1. Summary


A dataContract (DC) is a unique identifier — a URI or barcode — that sets the required context for a future data point.

The required context that a DC sets is type-level (subject-agnostic):

- what the data point will represent (a Biomedical Concept's recording structure, a derivation's output, or an analysis result),
- when / under what conditions it must arise (a position in the study Schedule of Activities, or the placeholder values of an endpoint specification: parameter, visit, baseline visit),
- how it must be produced (collected, derived by a named transformation, or computed by a named analysis),
- and — for aggregate results only — the population / grouping it describes (e.g. ITT × ARM A).

Subject is NOT in the DC URI for ingestion or per-subject derivations. The DC is one contract per (BC Property × ScheduledActivityInstance) for ingestion, or per (transformation × output Property × placeholder values) for derivation; many subjects fulfill the same DC, each via their own data point (DP). A single BC at a single SoA position therefore produces as many DCs as the BC has measurable properties (value, unit, dateTime, test, ...) — one DC per property.

DCs are GENERATED automatically by a study-authoring system from inputs already in the spec stack: the USDM study design, the bound Biomedical Concepts, and the AC analysis specification. At generation they are empty contracts — PROMISES, not values.

DCs are FULFILLED later, when a DP arrives (one DP per subject for ingestion / per-subject derivation; one DP per output cell for analysis) and links to the DC URI as its declared context. Each DP also carries the subject identity (for ingestion / per-subject derivation) via a separate 'for_subject' edge.

The same identifier mechanism spans the full pipeline: ingestion of raw observations, derivation of analysis variables, computation of analysis results, and submission via ADaM datasets and ARS result packages.


## 2. Why we need DCs

Today the link between what was planned, what was collected, what was derived, and what was analyzed is reconstructed manually — through naming conventions in SDTM, parsing of ADaM specs, traceability annotations in Define-XML, footnotes in TLFs. The link is fragile and lives only in the heads of programmers and statisticians.

A DC makes the link first-class and machine-readable. Given a number in an analysis output, the chain is:

```
ARS result number  →  Analysis DC  →  Derivation DC(s)  →  Ingestion DC(s) + DPs
                                                            ↓
                            (BC Property × ScheduledActivityInstance)
                            for the DC; Subject + value for the DP
```

Every step is a deterministic URI resolution. No name parsing, no convention-guessing, no manual reconstruction.

This is the foundation for: end-to-end traceability, regulatory reproducibility, swap-in/swap-out of standards (SDTM ↔ ADaM ↔ FHIR ↔ OMOP), and concept-driven analysis pipelines.


## 3. Anatomy of a dataContract

A DC declares the required context for a future data point. That context has three coordinates regardless of which lifecycle stage the DC belongs to — they are the slots the URI must encode for any DP that arrives to be unambiguously matched to the right contract:

| Coordinate | What it identifies | Source |
|---|---|---|
| Concept | The semantic structure (BC property concept, derived concept, analysis concept) | Concept model (Option_B_Clinical.json, AC_Concept_Model.json) |
| Context | When / under what conditions the value applies | USDM SoA + endpoint spec + slice keys |
| Subject | Who or what aggregation grain | USDM Subject; or a population for aggregate results |

All three families of concepts in the Concept row — BC property concepts, derivation concepts, analysis concepts — are first-class entries in the concept model. Each is a semantic structure that describes a kind of value, independently of how it's stored in any particular standard. For example:

- BC property concepts describe what's RECORDED about an observation: Recording.Result.Quantity.value (a quantitative measurement), Recording.Result.Coded.code (a coded result), Recording.Result.Quantity.code (units), Recording.DateTime (when), Recording.Test (which test), plus qualifiers like Location, Laterality, Specimen, Method, Position. These are the properties of a Biomedical Concept.
- Derivation concepts describe what's PRODUCED by a derivation transformation: Change.value (change from a reference), PercentChange.value, Baseline.flag (a Y/N flag), AnalysisVisit.label, StudyDay.value, and so on. Each derivation transformation declares which derivation concept(s) its output Property fulfills.
- Analysis concepts describe what's PRODUCED by a statistical analysis: LSMean.estimate, Contrast_T.estimate, Contrast_T.pvalue, Type3_F.pvalue, ParameterEstimate.estimate, FitStatistic.value, HazardRatio.estimate, and so on. Each analysis transformation declares which analysis concept(s) its output cells fulfill.

The BC concept model uses INHERITANCE the same way the derivation and analysis concept models do. A generic Recording template (Recording → Result → Quantity → value, code; → Coded → code; → Test) sits in the model; specific BCs (BODY TEMP, FRAME SIZE, SYSTOLIC BP, GLUCOSE) inherit from it and constrain or extend it. BODY TEMP inherits Recording and constrains its `Coded.code` to N/A; FRAME SIZE inherits Recording and constrains its `Quantity` branch to N/A while populating `Coded.code` with the value set {small, medium, large}. The same inheritance pattern applies to derivation concepts (Change inherits from a generic Difference template; PercentChange inherits from a generic Ratio template) and to analysis concepts (Type 3 F-test inherits from a generic Test template, and so on).

Implementation-side bindings (SDTM --ORRES, --STRESN, --STRESC; ADaM AVAL, BASE, CHG) connect to the concept model via 'is a' relationships. For SDTM Findings, the chain is slightly subtle:

- --ORRES (LBORRES, VSORRES, EGORRES, ...) IS a Recording.Result property — the raw observation as collected, in its original units. NOTE: --ORRES is always Char in SDTM, even when the actual recorded value is numeric (e.g., '5.2' for glucose). The per-test type information (float, integer, code, string) lives in Define-XML metadata keyed by --TESTCD. The engine reads Define-XML to know how to interpret --ORRES on a per-row basis.
- --STRESN (numeric) and --STRESC (character) are NOT raw recordings — they are the STANDARDIZED result, in standard units. They are the OUTPUT of a standardization derivation (T.UnitConversion or equivalent), not direct ingestion targets. In the existing concept-variable-mappings.json, --ORRES maps to the Observation concept (input to T.UnitConversion) and --STRESN/--STRESC + --STRESU maps to the Measure concept (output of T.UnitConversion).
- ADaM AVAL IS a Measure.value (or sometimes a derived concept value, like Change.value, depending on the dataset and PARAMCD's definition). ADaM BASE IS a Measure.value with applicableWhen baseline. ADaM CHG IS a Change.value, produced by T.ChangeFromBaseline.

Multiple implementation variables can bind to the same concept property — that's how the same concept appears in SDTM, in ADaM, in FHIR, and in OMOP, each with its own variable name. And the same source observation can spawn distinct DPs along a derivation chain: the raw Observation DP (from --ORRES), the standardized Measure DP (from T.UnitConversion landing in --STRESN), and any downstream derivation DPs (Change.value, Baseline.flag, etc.) — each with its own DC, each addressable individually.

The DC URI encodes these coordinates so that a resolver can reconstruct the full type-level context from the identifier alone. DC URIs do not carry a subject — that lives on the DP that fulfills the DC.

Representative DC URI forms (subject-agnostic):

```
acdc://STUDY_001/dc/ingestion/BC.BodyTemp/at:DAY3
acdc://STUDY_001/dc/derivation/T.CFB/parameter:SYSBP/visit:WEEK24/baseline:SCREEN
acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/parameter:SYSBP/visit:WEEK24/population:ITT/cell:lsmean.arm:A
```

Representative DP URI forms (per-subject for ingestion / per-subject derivation; per-output-cell for analysis — note the analysis DP URI is identical to the analysis DC URI because cell-level analysis results have grain = one DP per DC):

```
acdc://STUDY_001/dp/ingestion/BC.BodyTemp/at:DAY3/subject:SUBJ-001        fulfills the ingestion DC above
acdc://STUDY_001/dp/derivation/T.CFB/parameter:SYSBP/visit:WEEK24/baseline:SCREEN/subject:SUBJ-001    fulfills the derivation DC
acdc://STUDY_001/dp/analysis/T.CFB_ANCOVA/parameter:SYSBP/visit:WEEK24/population:ITT/cell:lsmean.arm:A    fulfills the analysis DC
```

For high-volume / opaque use, a hash form is equivalent:

```
acdc://STUDY_001/dc/h/3f9a7e2c8b1d4f6a
```

Both forms resolve through a per-study DC + DP registry that the engine maintains.


## 4. Ingestion DC

For collected data, an ingestion DC is one contract per (BC Property × ScheduledActivityInstance). A BC bound to one SoA activity at one timepoint generates as many DCs as the BC has measurable properties — value, units, dateTime, test, etc. — each property's DC being a separate, subject-agnostic, addressable contract. Subjects fulfill those contracts through per-subject DPs.

![Figure 1 — An ingestion DC is one contract per (BC Property × ScheduledActivityInstance) — subject-agnostic. Shown: the DC for BC.BodyTemp's `value` property at SAI-Day3 (the planned occurrence of the body-temp measurement on Day 3). Parallel DCs exist for the BC's other properties (.units, .dateTime, .test) — not drawn for clarity. Three subjects fulfill the same DC via per-subject DPs (36.1 and 36.5 fulfilled; SUBJ-003's DP is still PLANNED).](dataContracts-images/01_ingestion.png)

*Figure 1 — An ingestion DC is one contract per (BC Property × ScheduledActivityInstance) — subject-agnostic. Shown: the DC for BC.BodyTemp's `value` property at SAI-Day3 (the planned occurrence of the body-temp measurement on Day 3). Parallel DCs exist for the BC's other properties (.units, .dateTime, .test) — not drawn for clarity. Three subjects fulfill the same DC via per-subject DPs (36.1 and 36.5 fulfilled; SUBJ-003's DP is still PLANNED).*

> **★ INSIGHT ─────────────────────────────────────**
>
> - The DC granularity is one per (BC Property × ScheduledActivityInstance). One BC at one timepoint generates AS MANY DCs as the BC has measurable properties — value, units, dateTime, test, etc. Each property's DC is a separate, addressable contract.
> - The DC is subject-agnostic. Subjects fulfill the contract via DPs — one DP per subject who provides data. A DP arrives, links to (fulfills) the DC, and carries the subject identity via a 'for_subject' edge.
> - DCs precede data. A DP with no matching DC is unexpected data; a subject's missing DP under a known DC is missing data. Both become detectable conditions instead of silent failures.
> **─────────────────────────────────────────────────**


## 5. Derivation DC

A derived value is the output of a transformation applied to source values. The derivation DC bundles: the transformation template, the resolved placeholder values (parameter, visit, baseline visit), and the subject. Its inputs are the source ingestion (or upstream derivation) DCs.

![Figure 2 — A derivation DC is a unique identifier set when the study spec adds the transformation to a dataset. It declares the required context — concept (Change.value), transformation (T.CFB v1.0.0), subject (SUBJ-001), and dimension values (Parameter SYSBP, AnalysisVisit WEEK24, baseline SCREEN). Source DCs supply lineage via derives_from. The derived DP (7 mmHg) arrives later, when the engine runs, and FULFILLS the contract.](dataContracts-images/02_derivation.png)

*Figure 2 — A derivation DC is a unique identifier set when the study spec adds the transformation to a dataset. It declares the required context — concept (Change.value), transformation (T.CFB v1.0.0), subject (SUBJ-001), and dimension values (Parameter SYSBP, AnalysisVisit WEEK24, baseline SCREEN). Source DCs supply lineage via derives_from. The derived DP (7 mmHg) arrives later, when the engine runs, and FULFILLS the contract.*

> **★ INSIGHT ─────────────────────────────────────**
>
> - The derivation DC is set BEFORE the engine runs. Its URI is deterministic from (transformation + placeholder picks + subject), so two engines on the same spec produce the same DC URI. That's the reproducibility guarantee.
> - derives_from is a structural lineage edge between DC URIs. Walking it backwards reconstructs the full derivation tree without parsing any program code.
> - The DC URI is the natural FK for ADLB.CHG to carry. Define-XML's Method and Origin elements become projections of the DC graph, computed rather than hand-authored, and stay in sync by construction.
> **─────────────────────────────────────────────────**


## 6. Analysis DC

An analysis result (LSMean, contrast, p-value) is the output of an analysis transformation applied to a population of derivation DCs. The analysis DC bundles: the analysis template, the placeholder picks, and the population (or grouping) rather than a single subject.

![Figure 3 — One analysis transformation sets a family of analysis DCs — one unique identifier per output cell (LSMean per ARM, contrast per pair, Type 3 test per term). Each DC declares its required context via dimension-value nodes (Parameter, AnalysisVisit, Population, ARM, Contrast Level, Term). When the engine runs the analysis, each result DP (6.2, 9.6, -3.4, p=0.003) arrives and FULFILLS its DC.](dataContracts-images/03_analysis.png)

*Figure 3 — One analysis transformation sets a family of analysis DCs — one unique identifier per output cell (LSMean per ARM, contrast per pair, Type 3 test per term). Each DC declares its required context via dimension-value nodes (Parameter, AnalysisVisit, Population, ARM, Contrast Level, Term). When the engine runs the analysis, each result DP (6.2, 9.6, -3.4, p=0.003) arrives and FULFILLS its DC.*

> **★ INSIGHT ─────────────────────────────────────**
>
> - Aggregate results don't lose subject lineage. The analysis DC's derives_from lists every subject-level DC that contributed. A reviewer can answer 'which subjects' CHG values fed this LSMean?' by walking the DC graph — no need to re-run the analysis.
> - Each ARS result cell (one LSMean for ARM A, one p-value for the treatment term) gets its own DC URI — its own promise — set at analysis-spec time. The whole result table is a DC family, addressable as a group or per cell.
> - Re-running the analysis after a data update produces the same DC URIs (deterministic from spec + population) with different DPs. The DC IS the slot; the DP fills it. This is what makes 'did this number change?' a one-query check.
> **─────────────────────────────────────────────────**


## 7. Full pipeline

The DC registry, generated from the spec stack, is the canonical record. SDTM, ADaM, and ARS are presentation views projected from the registry as needed for different consumers.

![Figure 4 — End-to-end pipeline. The study spec generates the DC registry; the registry's DCs are subject-agnostic (one per BC Property × ScheduledActivityInstance for ingestion, one per Transformation × output Property × placeholders for derivation, one per output cell for analysis). The registry is materialized as SDTM, ADaM, and ARS via projection. One SDTM row is one observation that produces multiple DPs (one per BC property); each DP fulfills its DC, and one DC has many subjects' DPs. Each ADaM analytical column is one DP fulfilling either an ingestion or derivation DC. Each ARS result cell is one analysis DP fulfilling one analysis DC. The canonical record is the DC + DP graph; the standard formats are projections.](dataContracts-images/04_pipeline.png)

*Figure 4 — End-to-end pipeline. The study spec generates the DC registry; the registry's DCs are subject-agnostic (one per BC Property × ScheduledActivityInstance for ingestion, one per Transformation × output Property × placeholders for derivation, one per output cell for analysis). The registry is materialized as SDTM, ADaM, and ARS via projection. One SDTM row is one observation that produces multiple DPs (one per BC property); each DP fulfills its DC, and one DC has many subjects' DPs. Each ADaM analytical column is one DP fulfilling either an ingestion or derivation DC. Each ARS result cell is one analysis DP fulfilling one analysis DC. The canonical record is the DC + DP graph; the standard formats are projections.*

> **★ INSIGHT ─────────────────────────────────────**
>
> - DCs unify SDTM, ADaM, and ARS. Each is a different shape of presenting the same underlying graph of typed, lineage-linked DCs. The pipeline doesn't translate SDTM into ADaM then into ARS — it produces DC nodes, then projects them into whatever presentation form a consumer needs.
> - Adding a new presentation (FHIR submission, OMOP-aligned export, regulator-specific package) becomes a generation problem, not a re-architecture. The DC graph is invariant; the projection logic varies.
> - A study's DC graph IS the trial's machine-readable submission package. Define-XML, dataset traceability annotations, ARS metadata files all become projections rather than separately-authored documents.
> **─────────────────────────────────────────────────**


## 8. The data as one navigable space

The previous sections introduced dataContracts (DCs), data points (DPs), and dimension values (the hexagons in the figures — specific instances like Subject:SUBJ-001, Parameter:GLUC, Visit:WEEK24). This section steps back to give the big-picture, non-mathematical version: it introduces the cube vocabulary, shows how this way of organizing data lets you ask questions across the whole study without writing multi-file joins, and explains why this is NOT a replacement for SDTM and ADaM but a more flexible foundation underneath them.

![Figure 7 — The whole study as many concept-anchored cubes sharing a Subject spine. LB, VS, AE, EX, CM, DM each define their own cube; all of them have the Subject axis in common, so they hang off the same Subject spine. Common questions (everything for one subject; all glucose data; AEs in safety population; Day 14 cross-section) become slicing operations on this collection of cubes.](dataContracts-images/07_navigable_space.png)

*Figure 7 — The whole study as many concept-anchored cubes sharing a Subject spine. LB, VS, AE, EX, CM, DM each define their own cube; all of them have the Subject axis in common, so they hang off the same Subject spine. Common questions (everything for one subject; all glucose data; AEs in safety population; Day 14 cross-section) become slicing operations on this collection of cubes.*


### 8.1 Picture the data as a grid

Think of a spreadsheet, but with more than two dimensions. Imagine a spreadsheet where rows are subjects (SUBJ-001, SUBJ-002, ..., SUBJ-N), columns are timepoints (Screening, Day 1, Week 4, Week 12, Week 24), and there's a third dimension: which lab parameter you're looking at (Glucose, Hemoglobin, Sodium, ...). You don't have one spreadsheet — you have a stack of spreadsheets, one per lab parameter. Each cell of each spreadsheet is one observation: subject X's value for parameter Y at timepoint Z.

This 3D grid is one example of a cube in our model. Each axis of the cube corresponds to one concept:

- The Subject axis = the Subject concept (its values are the specific subjects in the study).
- The Parameter axis = the Parameter concept (its values are the lab tests).
- The Visit axis = the Visit concept (its values are the planned visits).

Different domains have different cubes. The AE cube has axes (Subject × AE Term × Start Date × Severity). The Vitals cube has axes (Subject × Vital Sign × Visit). They all SHARE the Subject axis (every domain has subjects) and often share Visit or Date.

The whole study is not ONE giant cube — it's MANY cubes glued together along their shared axes. Subject is the spine: every cube hangs off the Subject axis. (See Figure 7.)


### 8.2 What this lets you ask

Once data is organized this way, common clinical questions become natural slicing operations on the cubes. Four examples:


#### Everything for Subject 1001

You're asking for a slice across ALL cubes, where the Subject axis is fixed to SUBJ-1001 and everything else is open. Every lab value, every AE, every dose, every vital — anything that ever happened to this subject — comes back.

In familiar terms: this is what a programmer might write as 'all rows where USUBJID = 1001 across LB, AE, EX, VS, CM, DM, ...'. Here it's a single slicing operation, expressed once, against the concept-anchored cube collection.


#### All glucose data, all subjects, all timepoints

You're asking for a slice of the LB cube where Parameter = GLUC, with Subject and Visit left open. Returns the whole 2D plane of subject-vs-time for that one parameter.

In familiar terms: 'WHERE PARAMCD = GLUC in ADLB'. Same query, different framing.


#### All AEs in the safety population

You're asking for the AE cube intersected with the SAFFL = Y subset of subjects. Returns every AE that happened to a safety-population subject. The Subject axis is restricted to a sub-population, and the AE cube is the lens you view through.

In familiar terms: 'ADAE filtered to subjects where SAFFL = Y'.


#### Day 14 cross-section

You're asking for a slice of EVERY cube that has a Date or Visit axis, fixed to Day 14. Returns a snapshot — every lab value, every vital, every AE start, every dose given — that happened on that one day, across all subjects and all domains.

In familiar terms: this would normally require querying many tables and unioning the results. Here it's one cross-axis slice — Day 14 cuts through every cube that has Time as one of its dimensions, and you get the union back as a single result.

The point isn't that these queries are impossible today — they're routinely done with SAS or Python. The point is that the data shape makes them DIRECT. Each question is 'fix some axes, leave others open' against a navigable structure, rather than 'load these tables, join them, filter, deduplicate' in code that has to be re-written every time the table format changes.


### 8.3 The concept layer defines the meaning of the axes

The concepts (Subject, Parameter, Visit, Treatment, Population, ...) ARE the semantic definitions of the cube's axes. This is what makes the grid meaningful — without concepts, the axes are just labeled columns; with concepts, every axis has known meaning that's the same across studies, sponsors, and CDISC standards.

When we say 'the Parameter axis', we mean a coordinate axis whose values are instances of the Parameter concept (a CDISC-controlled-terminology code list). When a study has GLUC on its Parameter axis, GLUC means the same Glucose concept it means in any other study that uses GLUC. That's semantic interoperability.

There are actually two kinds of concepts at work, defining two kinds of cube axes:

- DIMENSION concepts (Subject, Parameter, Visit, Treatment, Population, ScheduledActivityInstance, ...) define the POSITIONAL axes — the coordinates that locate where in the cube an observation sits.
- PROPERTY/MEASURE concepts (Measure.value, Measure.unit, Change.value, AnalysisResult.lsmean, ...) define the MEASURE axes at each cell — the things that are recorded or computed AT a position.

Together, the dimension concepts and the property concepts give the cube its full semantic shape. Hexagons (the values like SUBJ-001, GLUC, WEEK24) are points along the dimension axes — instances of the dimension concepts.


### 8.4 We are not replacing SDTM or ADaM

This is important and worth stating clearly: this approach does NOT retire SDTM, ADaM, or Define-XML. Those are the table formats the industry uses and the deliverables regulatory bodies require, and they continue to be exactly that.

What changes is where the data LIVES. Instead of being authored as SDTM and then transformed into ADaM (with all the bookkeeping and validation that requires), the data lives in the concept-anchored cube collection, and SDTM and ADaM are PROJECTIONS of that collection back into table form.

Practically, this means several things:

- Same data, multiple SDTM versions. When SDTMIG 3.4 → 4.0 introduces variable renames or new variables, you don't re-run derivation programs against your data. You change the concept-variable mapping (which says 'Measure.value projects as LBSTRESN in 3.4, projects as RESULTNUM in 4.0') and re-project. Same source data, both standards on demand.
- Same data, multiple ADaMIG versions. Same logic for ADaM evolution.
- Other projections. The same concept-anchored data can be projected as FHIR resources for clinical research data exchange, as OMOP CDM tables for real-world-evidence analytics, as custom views for sponsor-internal reporting. All from one source.
- Existing tools work unchanged. Pinnacle 21 validates the SDTM projection. SAS programs read the ADaM projection. Define-XML describes the projections. Submission packages are produced the same way. None of those processes change.

The advantage is not replacement; it is that the data underneath becomes RESHAPABLE without re-derivation. Author once at the concept layer, project many times to whatever table format is needed. CDISC standards become projection rules rather than data migrations.

And the same eSAP — the executable Statistical Analysis Plan — drives both paths to results. The engine can execute the eSAP DIRECTLY against the concept layer to produce derived DPs and analysis DPs (which then project into ADaM and ARS); OR the engine can GENERATE SAS, R, or Python programs from the same eSAP, which when run against the SDTM/ADaM dataset projections produce the same analytical results. The two paths converge by construction — they implement the same eSAP-declared logic against equivalent representations of the same source data.

Both paths are supported because they serve different needs:

- Direct execution on the cube. Faster (no code-generation step), integrated with the DC graph so traceability is automatic, used during spec authoring and iteration. Also runs when the engine produces the canonical ADaM and ARS outputs — the concept layer IS the authority.
- Generated SAS / R / Python programs against SDTM / ADaM projections. Matches how pharma programmers actually work today — they expect a program file as the auditable artifact, want to read it line-by-line, often need to tweak edge cases. The generated program is what reviewers code-review, what programmers modify when a study has a one-off requirement, and what gets submitted alongside the datasets in the submission package.

Equivalence between the two paths is a property the engine implementation must guarantee: same eSAP + same source data + faithful code-generation should yield the same results. For deterministic operations (subtraction, sum, count, flag assignment) the agreement is bit-exact. For statistical procedures (ANCOVA, MMRM, log-rank, Cox PH), small numerical differences between the engine's statistical library and SAS PROC implementations are possible at the 6th-or-later decimal — typically well below the precision of submitted results, but worth validating during engine-to-SAS-generator certification. The eSAP-as-source-of-truth model is what makes the equivalence reasonable to assert in the first place.

This is the same architectural pattern compilers use: one source language (eSAP), multiple backends (direct engine execution, SAS generation, R generation, …) that all produce equivalent observable behavior. Pharma chooses which backend output to submit; the source-of-truth doesn't change.

A common concern at this point: how do we see traceability from SDTM to ADaM if there is a concept layer in between? Won't the layer obscure where each ADaM value came from? The honest answer is the opposite — traceability becomes BETTER, more structural, and more auditable than it is today, because every value carries its own DC URI and the DC graph has explicit lineage edges. Walking from any ADaM cell back to the SDTM rows that produced it is a chain of URI lookups, not a process of reading SAS comments, opening ADaM specs, and cross-referencing Define-XML.

Concretely, for an ADaM ADLB row's CHG column for glucose at Week 24 for SUBJ-001:

```
ADLB.CHG cell  =  acdc://STUDY_001/dp/derivation/T.CFB/Change.value/
                     parameter:GLUC/visit:WEEK24/baseline:SCREEN/subject:STUDY_001-001
                  → fulfills DC: acdc://STUDY_001/dc/derivation/T.CFB/Change.value/...
                  → derives_from edges point at:
                      • DP (Measure.value @ WEEK24, SUBJ-001)  — T.UnitConversion output
                      • DP (Measure.value @ SCREEN, SUBJ-001)  — T.UnitConversion output

Each of those T.UnitConversion DPs has its OWN derives_from edges:
  T.UnitConversion DP @ WEEK24
    → derives_from:
        • DP (Observation.value @ SAI-LB-Week24, SUBJ-001)
            ↳ provenance: LB.csv  row LBSEQ=42  column LBORRES = "5.2"
        • DP (Observation.unit  @ SAI-LB-Week24, SUBJ-001)
            ↳ provenance: LB.csv  row LBSEQ=42  column LBORRESU = "mmol/L"

  T.UnitConversion DP @ SCREEN
    → derives_from:
        • DP (Observation.value @ SAI-LB-Screen, SUBJ-001)
            ↳ provenance: LB.csv  row LBSEQ=12  column LBORRES = "4.8"
        • DP (Observation.unit  @ SAI-LB-Screen, SUBJ-001)
            ↳ provenance: LB.csv  row LBSEQ=12  column LBORRESU = "mmol/L"

Following the chain from ADLB.CHG = 0.4 mmol/L all the way back to the
two LB rows it came from takes 4 URI lookups. No naming-convention
guessing, no SAS log mining, no Excel spec reading.
```

The same traceability is bidirectional. Forward — 'if I correct the LB row at SCREEN (LBSEQ=12) for SUBJ-001, which ADaM cells and TLF cells change?' — you walk the inverse direction, following `feeds` edges from the ingestion DP up through every derivation DP that consumed it to every analysis DP that derived from those. The query is structural.

This is a strict improvement over how traceability works today. In current practice, lineage is documented in three places that have to stay in sync manually:

- Define-XML's Origin and Method elements, hand-authored per ADaM variable.
- ADaM specification documents (often Excel), describing the derivation logic in prose.
- SAS programs with comments saying 'CHG = AVAL - BASE per SUBJ-001 row'.

Those three artifacts drift independently — the SAS program changes but the Define-XML annotation doesn't, or the ADaM spec evolves but the Origin element isn't updated. Reviewers reading the submission package have to compare them and reconcile. With dataContracts, the lineage is structural: it lives in the DC graph, and Define-XML's Origin and Method elements are GENERATED from the graph rather than hand-authored. They cannot drift, because they aren't independent artifacts — they are projections of the same source.

For regulatory reviewers and FDA auditors: the submitted Define-XML continues to describe each ADaM variable's Origin and Method exactly as it does today; the difference is that under the hood, every claim in the Define-XML is backed by a URI that resolves to a structural lineage chain. If an auditor asks 'show me how this LSMean was computed', the answer is one URI lookup into the analysis DC, then a walk of its `derives_from` edges all the way back to LB.csv rows. The same query that today requires reading SAS programs and Define-XML annotations becomes a deterministic graph traversal.


### 8.5 What this looks like to the user — nothing changes

From a user perspective — statistician, statistical programmer, data manager, regulatory reviewer, FDA reviewer — none of the internal machinery is visible or needs to be understood. The cubes, the dataContracts, the data points, the vector/graph structure, the projection rules — all of that is engine internals. Users continue to see and work with the artifacts they always have:

- Statisticians see ADaM datasets and produce tables, listings, and figures via SAS / R programs — written by hand for one-off analyses and explorations, or generated from the eSAP for spec-driven analyses (per Section 8.4). Either way, the program file is the auditable artifact they review and the ADaM dataset is the input, exactly as the workflow expects today.
- Statistical programmers see SDTM and ADaM datasets, run them through Pinnacle 21, and write or review derivation programs — hand-written when the situation calls for it, generated from the eSAP when the derivation is library-driven. The Pinnacle 21 step, the program-review step, the dataset-comparison step are all unchanged.
- Data managers see CRF screens, lab vendor files, EDC exports, and SDTM tables when reviewing data.
- Regulatory reviewers see Define-XML, submission packages, and the same dataset structures they've reviewed for years.
- FDA / agency reviewers see exactly the standard CDISC submission they expect — they don't need to know that the data was anchored in a concept graph internally, or whether the SAS programs in the submission were authored by hand or generated from an eSAP.

The cube, vector, dataContract, and normalized data-point structure are entirely internal to the engine. They power the architecture's benefits — flexibility, traceability, multi-standard projection, validation — but they don't surface to anyone who isn't building the engine or curating the concept library. The user-facing deliverables remain SDTM datasets, ADaM datasets, Define-XML, ARS packages, and TLFs. Familiar, standards-conformant, regulatorily acceptable.

If anything, the user experience is BETTER because the projected SDTM/ADaM are guaranteed to be internally consistent (their lineage and content are derived from the same concept-anchored source), and switching between standards versions or producing alternative projections (FHIR, OMOP, custom reports) doesn't require new SAS programs.


### 8.6 This way of thinking is mainstream in modern data work

If you've worked with SAS datasets, Pandas DataFrames in Python, R data frames, NumPy or PyTorch tensors, an OLAP cube in a data warehouse, or a knowledge graph, you've used exactly this framing already. A SAS dataset is a 2D cube (rows × columns) with PROC SQL joining across dimensions and BY-group processing as slicing. A DataFrame is a 2D cube; a tensor is an N-dimensional cube; an OLAP fact table sits at the intersection of dimensions and reports measures; a knowledge graph is the concept-anchored navigable space we've been describing. SAS arrays, PROC TABULATE, PROC REPORT, and PROC TRANSPOSE are cube operations under different names.

In clinical research specifically, the OMOP Common Data Model (used by OHDSI for real-world evidence) is a fact-table cube approach with concept-keyed terminology. FHIR resources are conceptually graph nodes joined through Patient identity. Tidy data principles (each row an observation, each column a variable) are the long-form cube view. SDTM itself, with its Identifiers / Topic / Qualifiers / Timing / Result variable groupings, is essentially a dimensional model expressed in CDISC vocabulary — a fact table per domain, with shared identifying dimensions.

What's specifically new for CDISC clinical-trial data is not the mathematics, which is well established and widely used, but bringing it as a foundation under the existing SDTM/ADaM ecosystem. The dataContract layer adds something genuinely beyond standard dimensional modeling: explicit contracts/promises that enable planned-vs-fulfilled validation, structural lineage across the whole pipeline, and reproducibility guarantees that don't depend on parsing SAS logs.

Readers from a mathematical or data-engineering background may want the precise formulation. Appendix A gives it (vectors, projections, fiber bundles, vector fields). The main document does not assume that background.


## 9. Data flow into the concept layer

The diagrams above show what the dataContract graph looks like at rest. This section walks through how data actually moves through it — from raw collection in CRFs, lab feeds, EHR streams, devices, and ePRO instruments, through ingestion into the concept layer, then through derivation and analysis, and finally back out as SDTM / ADaM / ARS projections.

![Figure 6 — End-to-end data flow. Sources on the left feed the engine via two paths: a MODERN path where DCs are pushed to the collection instrument at study setup (the spec's DC URIs flow up to CRF/EDC/lab/devices) so incoming records are pre-tagged with their DC URIs and need only validation before fulfillment; and a LEGACY path for untagged data (CSVs, historical SDTM, EHR feeds without binding) which goes through the four-step inference (parse → identify conceptProperty via concept-variable mappings → match dataContract → fulfill). Both paths land in the concept layer's DC + DP registry. From the concept layer, the engine drives derivations and analyses directly (the DIRECT execution path) AND emits SAS / R / Python programs via eSAP code-generation (the alternative execution path) that, when run against the SDTM / ADaM dataset projections, produce equivalent results. The graph is projected outward to SDTM, ADaM, ARS, and Define-XML (whose Origin/Method elements are generated from the DC lineage).](dataContracts-images/06_data_flow.png)

*Figure 6 — End-to-end data flow. Sources on the left feed the engine via two paths: a MODERN path where DCs are pushed to the collection instrument at study setup (the spec's DC URIs flow up to CRF/EDC/lab/devices) so incoming records are pre-tagged with their DC URIs and need only validation before fulfillment; and a LEGACY path for untagged data (CSVs, historical SDTM, EHR feeds without binding) which goes through the four-step inference (parse → identify conceptProperty via concept-variable mappings → match dataContract → fulfill). Both paths land in the concept layer's DC + DP registry. From the concept layer, the engine drives derivations and analyses directly (the DIRECT execution path) AND emits SAS / R / Python programs via eSAP code-generation (the alternative execution path) that, when run against the SDTM / ADaM dataset projections, produce equivalent results. The graph is projected outward to SDTM, ADaM, ARS, and Define-XML (whose Origin/Method elements are generated from the DC lineage).*


### 9.1 Ingestion: lifting raw data into the concept layer

Ingestion is the step that turns a raw row, a lab message, or an HL7 resource into a typed, concept-anchored data point bound to a specific dataContract. The engine does this lifting in four passes:

1. Parse and normalize. The engine reads the raw record (CRF submission, lab CSV, FHIR Bundle, device export) and normalizes its fields into a typed record — strings to numbers, code strings to coded values, dates to ISO-8601, units to canonical form.
1. Identify the conceptProperty. For each field of the normalized record, the engine consults concept-variable-mappings.json to determine which conceptProperty the field realizes (e.g., LBSTRESN → CP.Measure.value; VISIT → CP.Visit.label; USUBJID → CP.Subject.identifier).
1. Match the dataContract. Using the conceptProperty plus the record's identifying context (Subject, ScheduledActivityInstance derived from the visit/timepoint), the engine looks up the unique dataContract whose (BC Property × ScheduledActivityInstance) signature matches.
1. Fulfill. The engine creates a data point (DP) that links to the dataContract URI via a `fulfills` edge, carries the actual value, and links to the Subject via a `for_subject` edge. The DC registry is updated: the contract's state moves from Planned to Fulfilled, and provenance (timestamp, source system, operator) is attached.

After ingestion, two reconciliation views fall out for free:

- Planned vs Fulfilled. Every Planned DC with no matching DP is a missing-data condition that can be enumerated by querying the registry (no separate reconciliation step needed).
- Unexpected data. Any incoming field that doesn't resolve to a known conceptProperty, or whose context doesn't match any planned DC, is flagged for review — the engine refuses to silently absorb data the study didn't commit to collect.


#### When dataContracts are carried into the collection instruments

The four-step flow above describes the worst case: the engine receives legacy data (a flat LB.csv, an EDC export, a lab vendor file) that has NO knowledge of the study's dataContracts, so the engine must infer which DC each incoming field fulfills using the concept-variable mappings. That works, but the inference is the most error-prone step in the pipeline — it's where a mis-mapped field becomes mis-mapped data.

A much stronger pattern is to push the DC URIs OUT to the collection instruments at study-setup time, so each field of each EDC form, each row template in a lab vendor's LIMS, each output channel of a device or ePRO app is pre-bound to the DC it fulfills. When data arrives back, each value carries its DC URI directly — no inference needed. Steps 2 and 3 (Identify the conceptProperty, Match the dataContract) collapse to a single 'look up the named DC' step. The wire format for an incoming record becomes a stream of explicit DC fulfillments:

```
{
  "fulfillments": [
    {
      "dc":      "acdc://STUDY_001/dc/ingestion/BC.Glucose.observed_value/at:SAI-LB-Week24",
      "subject": "STUDY_001-001",
      "value":   "5.2",
      "provenance": {
        "instrument":  "LabCorp-Analyzer-X-S/N-4471",
        "operator":    "Tech-042",
        "collectedAt": "2026-04-03T10:14",
        "sourceFile":  "LabCorp-batch-2026-04-03.json"
      }
    },
    {
      "dc":      "acdc://STUDY_001/dc/ingestion/BC.Glucose.observed_unit/at:SAI-LB-Week24",
      "subject": "STUDY_001-001",
      "value":   "mmol/L",
      "provenance": { ... }
    }
  ]
}
```

The ingestion engine, on receiving this, runs a much simpler pass: validate each fulfillment against its DC's metadata (type, code list, range), then create the DP and bind it to the DC. No concept-variable-mapping consultation is needed because the mapping was applied at setup time, when the collection instrument was configured.

Benefits of carrying DCs into collection:

- No identification ambiguity. Mis-mapping is impossible — each value is delivered with its DC URI. The risk class of 'we mapped LBSTRESN to Measure.value but actually it should have been...' disappears.
- Validation at the point of entry. The EDC / LIMS / device can validate every entry against the DC's contract metadata BEFORE accepting it — wrong unit, wrong code, value out of range, wrong data type — caught at the moment of capture, not at the moment of ingestion.
- Real-time planned-vs-fulfilled visibility. As soon as the first DPs arrive, the registry's fulfillment state updates. A clinical-operations dashboard can show 'Subject SUBJ-001 fulfilled 17 of 19 expected Week 24 DCs; missing: BC.Hemoglobin.value, BC.Hemoglobin.unit' in real time. Missing-data follow-up moves from monthly reconciliation reports to continuous monitoring.
- End-to-end provenance with no naming intermediation. The DC URI on the lab result, the DC URI in the engine, the DC URI in the analysis trace are the same string. There's no 'LBORRES means the same thing as the BC.Glucose.observed_value DC' translation step — the lab system literally records the DC URI on the result.
- Standards-agnostic source data. The lab vendor doesn't need to know SDTM, ADaM, or any CDISC standard — they just need to fulfill the DCs the study sent them. Standards conformance is a downstream projection concern, not an upstream collection burden.
- Stronger data-integrity story for regulators. ALCOA+ principles (Attributable, Legible, Contemporaneous, Original, Accurate) are reinforced because each value's identity is bound at capture and preserved through the pipeline.

This pattern is the modern data-engineering meaning of 'data contract' — a producer (lab vendor, EDC system, device) and a consumer (analysis engine) agree on a contract identifier; the producer commits to fulfilling it on the contracted terms; the consumer commits to accepting any conforming fulfillment. The DC URI IS the contract handle, exchanged at setup time and honored at every subsequent data exchange.

In practice, you'll usually have a mix: modern systems that adopt DC tagging at setup, and legacy feeds (existing CSVs, historical data) that still arrive untagged and need the full four-step inference. The engine supports both; the cleaner the upstream gets, the simpler the ingestion code becomes. The architecture doesn't require source systems to change — it rewards them when they do.


### 9.2 Derivation: producing new DPs from fulfilled ones

Once ingestion DPs exist in the concept layer, derivation can run. The engine walks the study instance file (which transformations apply to which datasets), computes the dependency graph from each transformation's input/output concept FKs, and schedules derivations in topological order. For each derivation dataContract:

1. Resolve inputs. For each input concept the transformation needs (e.g., 'Measure.value at current visit' and 'Measure.value at baseline visit'), the engine queries the registry for the per-subject DPs that satisfy each input slot's contract.
1. Compute. For each subject in scope, the engine invokes the method's formula (M.Subtraction, M.ANCOVA, M.LOCF, ...) with the subject's resolved input values and produces a derived value.
1. Fulfill the derivation dataContract. A derivation DP is created, linked to the derivation DC via `fulfills`, carrying the derived value, and pointing back at the source DPs via `derives_from` edges. The source DPs gain a `feeds` edge to the new DP. Lineage is structural, not annotated.
1. Cascade. If any downstream transformation depends on the just-produced derivation DC, the engine queues it for the next pass and the cycle repeats until the dependency graph is fully evaluated.


### 9.3 Analysis: aggregating concept-layer DPs into results

Analyses operate on the same concept-layer graph, but their output dataContracts are at a coarser grain (per output cell, not per subject). For each analysis dataContract family:

1. Scope the population. The analysis spec selects which Subjects participate (typically by population flag — ITT, PP, SAFFL).
1. Gather inputs. The engine queries the registry for every subject-level derivation DP that fulfills the analysis's input contracts (e.g., every subject's CFB.SYSBP.WEEK24 DP).
1. Invoke the analysis engine. The method (M.ANCOVA, M.LogRankTest, M.CoxPH, …) runs against the gathered data — typically via an external statistical engine (R, SAS, Python). The transformation library declares the method's parameters; the analysis engine returns one value per output cell.
1. Fulfill the analysis dataContracts. For each output cell defined by the method's output template (one per LSMean per ARM, one per contrast, one per Type 3 test term), the engine creates an analysis DP linked to the matching analysis DC, carrying the result value, and pointing back at every contributing subject-level DP via `derives_from` edges.


### 9.4 Projection: rendering the graph as SDTM / ADaM / ARS

The concept layer is the canonical record. Standard output formats are projections of it, generated on demand by walking the graph:

- SDTM datasets: each SDTM domain declares which BCs it can contain (per the SDTMIG's scope definition for that domain — LB contains laboratory-measurement BCs like Glucose, Hemoglobin, Sodium; VS contains vital-signs BCs like Systolic BP, Heart Rate, Body Temperature; AE contains adverse-event BCs; CM contains concomitant-medication BCs; and so on). For each ingestion DP, the engine looks up which domain hosts the DP's BC and emits the DP's value into the right row of that domain's dataset. The COLUMN within the domain comes from the concept-variable mapping (CP.Measure.value → LBSTRESN in LB, → VSSTRESN in VS, → EGSTRESN in EG, …). No discovery or post-hoc grouping is needed — both 'which domain hosts which BCs' and 'which column hosts which conceptProperty' are spec-declared (the first by the SDTMIG-scoped domain definitions, the second by the concept-variable mapping).
- ADaM datasets: each ADaM dataset declares which transformations produce its variables (per the ADaM dataset's structural specification — ADLB hosts the transformations applied to laboratory BCs like T.ChangeFromBaseline-on-lab, T.AssignBaselineFlag, T.LOCF imputation, ...; ADVS hosts the corresponding transformations on vital-sign BCs; ADAE hosts transformations on adverse-event BCs; and so on). For each derivation DP, the engine looks up which ADaM dataset hosts the DP's transformation and emits the DP's value into the right row. The COLUMN within the dataset comes from the concept-variable mapping for ADaM (CP.Measure.value → AVAL; CP.Change.value → CHG; CP.PercentChange.value → PCHG; CP.Baseline.flag → ABLFL; CP.Measure.value with baseline applicableWhen → BASE; etc.). The DC URI is attached as metadata (DC_AVAL, DC_CHG, …) or carried via Define-XML extensions. As with SDTM, both 'which dataset hosts which transformations' and 'which column hosts which conceptProperty' are spec-declared — the first by the ADaM dataset definitions in the study instance file, the second by the concept-variable mapping (one entry per conceptProperty per IG version).
- ARS results package: walk analysis DPs; each result cell has a resultId equal to (or resolvable from) its analysis DC URI; groupings come from the DC's grouping context.
- Define-XML Origin/Method elements: walk the `derives_from` edges in the DC graph and render as `Method` definitions and `Origin` references. No hand-authoring.
- Generated SAS / R / Python programs: for pharma users who run derivations in SAS (or other languages), the engine emits readable code from the same eSAP that drives direct execution — comments cite the DC URI, the transformation template version, and the source DPs (see Section 8.4 for the dual-execution model).


### 9.5 Bidirectional traceability

Once the graph exists, traceability is symmetric and structural:

- Forward (from a raw observation to its consequences). Start at any ingestion DP, walk `feeds` edges through derivation DPs, then through analysis DPs, to every result cell that depends on this raw value. 'Which TLF cells move if I correct this lab value?' becomes a graph query.
- Backward (from a result number to its sources). Start at any analysis DP, walk `derives_from` edges through derivation DPs, then through ingestion DPs, to every raw observation that contributed. 'Which subjects' baseline glucose values fed this LSMean for ARM A?' becomes a graph query.
- Both directions are queries, not file searches. No SAS log parsing, no Define-XML annotation reading, no naming-convention guessing. The graph IS the audit trail.

> **★ INSIGHT ─────────────────────────────────────**
>
> - The engine is the only component that 'understands' raw data. Every layer above the engine (transformation library, study instance, analysis spec) operates on the concept layer — typed nodes anchored to dataContracts. This is what makes the library reusable across studies and the analyses portable across data standards.
> - Validation moves from after-the-fact to in-line. Planned-vs-fulfilled DC reconciliation runs continuously as ingestion proceeds. Missing data is detectable the moment a deadline passes; unexpected data is detectable at the moment of attempted ingest.
> - The same engine, same library, same study instance, same source data must produce byte-identical output. The DC graph is deterministic: same inputs in, same DC URIs out, same DP values out. That's the regulatory-reproducibility guarantee in one sentence.
> **─────────────────────────────────────────────────**


### 9.6 Worked example: a glucose lab observation flowing through the concept layer

This walks through a single glucose lab measurement from raw arrival to ADaM CHG. Two important framing notes before the steps:

- Real raw lab data does NOT arrive in SDTM format. It arrives from the lab vendor in the vendor's own format — typically a JSON / CSV / HL7 v2 / FHIR Bundle / LDM (Lab Data Model) feed. SDTM is itself a downstream PROJECTION of the concept layer (per Sections 8.4 and 9.4), not an input to it. So 'ingestion' in this example means receiving the vendor's record into the engine, not reading an existing SDTM LB row.
- In the modern flow, each value arrives with its DC URI already attached — the dataContracts were pushed to the lab vendor at study setup (per Section 9.1's DC-tagged collection pattern). The engine validates each fulfillment against the DC's contract and creates the DP. No 4-step inference, no concept-variable-mapping consultation per record. (The legacy flow — receiving an untagged vendor file, or re-ingesting an existing SDTM dataset for migration — uses the four-step inference instead. That fallback is covered in Section 9.1 and noted at the end of this example.)


#### Step 1 — DC-tagged record arrives from the lab vendor

The lab vendor's LIMS, configured at study setup with the DCs the study expects, posts a record for STUDY_001-001's Week 24 glucose measurement. The wire format (JSON shown here; CSV, FHIR, or any other carrier works the same way) carries the DC URI for each measured property:

```
{
  "study":   "STUDY_001",
  "subject": "STUDY_001-001",
  "sai":     "SAI-LB-Week24",
  "vendorRecordId": "LabCorp-2026-04-03-r471",
  "fulfillments": [
    {
      "dc":    "acdc://STUDY_001/dc/ingestion/BC.Glucose.observed_value/at:SAI-LB-Week24",
      "value": "5.2",
      "provenance": {
        "instrument":  "LabCorp-Analyzer-X-S/N-4471",
        "operator":    "Tech-042",
        "collectedAt": "2026-04-03T10:14"
      }
    },
    {
      "dc":    "acdc://STUDY_001/dc/ingestion/BC.Glucose.observed_unit/at:SAI-LB-Week24",
      "value": "mmol/L",
      "provenance": { ... }
    },
    {
      "dc":    "acdc://STUDY_001/dc/ingestion/BC.Glucose.collectionDateTime/at:SAI-LB-Week24",
      "value": "2026-04-03T10:14",
      "provenance": { ... }
    }
  ]
}
```

Notice what's NOT in this record: no SDTM column names (no LBORRES, LBORRESU, LBSTRESN, LBSTRESU, LBTESTCD, LBDTC, VISIT, VISITNUM), no SDTM domain code, no IG version. The vendor doesn't need to know any of those. They committed at setup time to fulfilling the DCs the study sent them; the record reports the fulfillments. Every CDISC-standards detail is downstream of this point.

Legacy variant (for reference, used when no DC tagging exists): the same observation might arrive in a CSV row with the vendor's own column names (SUBJ_ID, TEST, RESULT, UNIT, COLLECTION_DT) or — in a migration scenario — as a row in an existing SDTM LB dataset:

```
Lab-vendor CSV (untagged):
  SUBJ_ID         TEST  RESULT  UNIT    COLLECTION_DT
  STUDY_001-001   GLUC  5.2     mmol/L  2026-04-03T10:14

Existing SDTM LB row (untagged — migration scenario):
  STUDYID    USUBJID         LBSEQ  LBTESTCD  LBTEST    LBORRES  LBORRESU
  STUDY_001  STUDY_001-001   42     GLUC      Glucose   5.2      mmol/L
  LBSTRESN   LBSTRESU   VISIT     VISITNUM   LBDTC
  5.2        mmol/L     WEEK 24   24         2026-04-03T10:14

In either legacy form, the engine falls back to the four-step inference from Section 9.1
(parse → identify conceptProperty via concept-variable mappings → match DC → fulfill).
The remaining steps below describe what happens AFTER fulfillment, which is identical
regardless of whether the data arrived DC-tagged (this example's primary path) or untagged.
```


#### Step 2 — Engine validates each fulfillment and creates ingestion DPs

Because each fulfillment in the record carries its DC URI, the engine does NOT need to consult the concept-variable mapping, resolve the ScheduledActivityInstance, or look up which DC matches — the DC URI itself names the contract directly, and the URI already encodes both the BC Property (BC.Glucose.observed_value, BC.Glucose.observed_unit, …) and the SAI (SAI-LB-Week24). The engine instead does two things per fulfillment:

1. Validate the value against the DC's contract metadata — the expected data type, code list, allowed range, format. If anything fails, the fulfillment is rejected and the DC remains Unfulfilled (with the error captured for the data manager). This is shift-left validation: errors caught at ingest, not at analysis time.
1. Create the data point. The engine writes a DP node that links to the DC URI via `fulfills`, carries the value, attaches the Subject via `for_subject`, and records provenance. The DC's registry state flips from Planned to Fulfilled.

```
INGESTION DP (raw observed value from the vendor record):
  uri:          acdc://STUDY_001/dp/ingestion/BC.Glucose.observed_value/
                    at:SAI-LB-Week24/subject:STUDY_001-001
  value:        "5.2"               # as carried in the vendor record (Char form)
  typed_value:  5.2                  # float, after validating against the DC's dataType
  fulfills:     acdc://STUDY_001/dc/ingestion/BC.Glucose.observed_value/at:SAI-LB-Week24
  for_subject:  STUDY_001-001
  provenance:
    vendorRecordId: "LabCorp-2026-04-03-r471"
    instrument:     "LabCorp-Analyzer-X-S/N-4471"
    collectedAt:    "2026-04-03T10:14"
    ingestedAt:     "2026-04-15T08:02:31Z"

INGESTION DP (raw observed unit):
  uri:          acdc://STUDY_001/dp/ingestion/BC.Glucose.observed_unit/
                    at:SAI-LB-Week24/subject:STUDY_001-001
  value:        "mmol/L"
  fulfills:     acdc://STUDY_001/dc/ingestion/BC.Glucose.observed_unit/at:SAI-LB-Week24
  for_subject:  STUDY_001-001
  ... (similarly for collectionDateTime)
```

A parallel record at the SCREEN visit (vendor file from earlier in the study) would have created the corresponding ingestion DPs at SAI-LB-Screen for the baseline glucose value (e.g., "4.8" mmol/L for SUBJ-001).

LEGACY FALLBACK: If the data arrives untagged (vendor CSV with the vendor's own column names, or an existing SDTM dataset being migrated into the concept layer), the engine inserts the four-step inference from Section 9.1 between Step 1 and Step 2 above:

- Parse + normalize the record's fields (strings → typed values, units → canonical form).
- Identify the conceptProperty per field by consulting concept-variable-mappings.json. For an SDTM Findings row this gives, for example: LBORRES → CP.Observation.value (raw); LBORRESU → CP.Observation.unit; LBSTRESN → CP.Measure.value (the STANDARDIZED value, an output of T.UnitConversion done upstream by the SDTM creation pipeline); LBDTC → CP.Timing.collectionDateTime; USUBJID → CP.Subject.identifier; VISIT → CP.Visit.label; LBTESTCD → CP.Parameter.code.
- Resolve the ScheduledActivityInstance by combining the LB activity binding with VISIT="WEEK 24" to find SAI-LB-Week24.
- Match the dataContract by looking up the registry for the (conceptProperty × ScheduledActivityInstance) pair — this is where the DC URI would be discovered for the untagged data.

After those four inference steps complete, the legacy path joins the modern path at Step 2 (validate + create DPs). The DPs created end up identical regardless of whether the DC URI was given (modern) or inferred (legacy). One nuance worth noting for the legacy SDTM-migration case: LBORRES is Char in SDTM even when the recorded value is numeric, and the per-test type interpretation lives in Define-XML metadata keyed by LBTESTCD — the engine reads Define-XML to know that for LBTESTCD=GLUC, LBORRES should be parsed as a float. Similarly, --STRESN is treated as the output of a T.UnitConversion derivation rather than a raw ingestion, preserving the derivation graph even though the standardization physically happened upstream of the engine.


#### Step 3 — Engine runs the T.UnitConversion derivation

The study instance file says ADLB applies T.UnitConversion to lab BCs to produce standardized Measure values from raw Observation values. The engine consults the transformation library, builds the dependency, and runs the derivation per subject. For STUDY_001-001 at WEEK24:

```
Inputs resolved by registry lookup:
  observed_value = DP @ ingestion/BC.Glucose.observed_value/
                       at:SAI-LB-Week24/subject:STUDY_001-001 = "5.2" (typed 5.2 float)
  observed_unit  = DP @ ingestion/BC.Glucose.observed_unit/
                       at:SAI-LB-Week24/subject:STUDY_001-001 = "mmol/L"

Compute via M.AffineTransform (the method T.UnitConversion uses):
  (mmol/L is already the standard unit for glucose — affine scale = 1, offset = 0)
  Measure.value := scale * observed_value + offset  =  1 * 5.2 + 0  =  5.2 mmol/L

Create derivation DP:
  uri:          acdc://STUDY_001/dp/derivation/T.UnitConversion/Measure.value/
                    parameter:GLUC/target_unit:mmol/L/subject:STUDY_001-001
  value:        5.2
  fulfills:     acdc://STUDY_001/dc/derivation/T.UnitConversion/Measure.value/
                    parameter:GLUC/target_unit:mmol/L
  for_subject:  STUDY_001-001
  derives_from:
    - DP @ ingestion/BC.Glucose.observed_value @ WEEK24/STUDY_001-001
    - DP @ ingestion/BC.Glucose.observed_unit  @ WEEK24/STUDY_001-001
  produced_by:  T.UnitConversion @ v1.0.0, engine ACDC@0.5
```

For a non-standard original unit (e.g., glucose in mg/dL), the same T.UnitConversion derivation would multiply by an appropriate scale factor (1/18.0156 for mg/dL → mmol/L) and the Measure.value would differ from the observed_value. In this glucose example with mmol/L already as the original unit, the conversion is a no-op and the value passes through unchanged.

A parallel record at the SCREEN visit produces the analogous T.UnitConversion DP at SAI-LB-Screen with the baseline glucose value (4.8 mmol/L for SUBJ-001), derived from the SCREEN-visit ingestion DPs.


#### Step 4 — Engine runs T.ChangeFromBaseline derivation

The study instance file says ADLB includes T.ChangeFromBaseline → CHG. The engine consults the transformation library, builds the dependency, and runs the derivation per subject. T.CFB's input is the STANDARDIZED Measure (not the raw Observation) — so its sources are the T.UnitConversion derivation DPs from Step 6, not the raw ingestion DPs. For STUDY_001-001 at WEEK24, with baseline visit = SCREEN:

```
Inputs resolved by registry lookup:
  minuend    = DP @ derivation/T.UnitConversion/Measure.value/
                  parameter:GLUC/.../subject:STUDY_001-001 at WEEK24 = 5.2 mmol/L
  subtrahend = DP @ derivation/T.UnitConversion/Measure.value/
                  parameter:GLUC/.../subject:STUDY_001-001 at SCREEN = 4.8 mmol/L

Compute via M.Subtraction:
  difference := minuend − subtrahend  =  5.2 − 4.8  =  0.4 mmol/L

Create derivation DP:
  uri:          acdc://STUDY_001/dp/derivation/T.CFB/Change.value/
                    parameter:GLUC/visit:WEEK24/baseline:SCREEN/subject:STUDY_001-001
  value:        0.4
  fulfills:     acdc://STUDY_001/dc/derivation/T.CFB/Change.value/
                    parameter:GLUC/visit:WEEK24/baseline:SCREEN
  for_subject:  STUDY_001-001
  derives_from:
    - DP @ derivation/T.UnitConversion/Measure.value @ WEEK24/STUDY_001-001
    - DP @ derivation/T.UnitConversion/Measure.value @ SCREEN/STUDY_001-001
  produced_by:  T.CFB @ v1.0.0,  engine ACDC@0.5
  computedAt:   2026-04-15T08:02:33Z
```

Full lineage from the result back to source is now: T.CFB output → derives_from → T.UnitConversion output → derives_from → raw Observation (--ORRES/--ORRESU) → sourced from LB.csv row LBSEQ=42. Three derivation steps captured in the graph, with the standardization step preserved even though it physically happened upstream of the engine.


#### Step 5 — Engine projects the concept layer as SDTM AND ADaM rows

From the concept-layer DPs created above, the engine projects BOTH the SDTM LB row and the ADaM ADLB row. Neither was the input; both are outputs. The projection rules come from the spec — domain bindings (LB hosts laboratory BCs; ADLB hosts laboratory transformations) and concept-variable mappings (which conceptProperty maps to which column per IG version, per Section 9.4).

First, the SDTM LB row — projected from the ingestion DPs and the T.UnitConversion DP:

```
SDTM LB row (PROJECTED from concept-layer DPs for STUDY_001-001 at Week 24):
  STUDYID    USUBJID         LBSEQ  LBTESTCD  LBTEST    LBORRES  LBORRESU
  STUDY_001  STUDY_001-001   42     GLUC      Glucose   5.2      mmol/L
  LBSTRESN   LBSTRESU   VISIT     VISITNUM   LBDTC
  5.2        mmol/L     WEEK 24   24         2026-04-03T10:14

Column-to-DP mapping (the inverse of concept-variable-mappings.json):
  LBORRES   ← ingestion DP (BC.Glucose.observed_value, Char form)
  LBORRESU  ← ingestion DP (BC.Glucose.observed_unit)
  LBSTRESN  ← T.UnitConversion DP (Measure.value, Num form)
  LBSTRESU  ← T.UnitConversion DP (Measure.unit)
  LBDTC     ← ingestion DP (BC.Glucose.collectionDateTime)
  LBTESTCD  ← derived from the BC identity (BC.Glucose)
  VISIT     ← derived from the SAI's visit (SAI-LB-Week24 → Visit:WEEK 24)
  USUBJID, STUDYID  ← Subject and Study dimension values
```

Then the ADaM ADLB row — projected from the same ingestion DPs plus the derivation DPs (T.CFB, T.AssignBaselineFlag):

```
ADLB row (PROJECTED for STUDY_001-001, PARAMCD=GLUC, AVISIT=WEEK 24):
  STUDYID   USUBJID         PARAMCD  AVISIT    AVAL  AVALU   BASE  CHG  ABLFL
  STUDY_001 STUDY_001-001   GLUC     WEEK 24   5.2   mmol/L  4.8   0.4  N

Column-to-DP mapping (per concept-variable mapping for ADaM):
  AVAL    ← T.UnitConversion DP (Measure.value)
  AVALU   ← T.UnitConversion DP (Measure.unit)
  BASE    ← T.UnitConversion DP at SCREEN (Measure.value, baseline-filtered)
  CHG     ← T.CFB derivation DP (Change.value)
  ABLFL   ← T.AssignBaselineFlag derivation DP (Baseline.flag)

Metadata (Define-XML extensions or sidecar columns):
  DC_AVAL  = acdc://STUDY_001/dc/derivation/T.UnitConversion/Measure.value/parameter:GLUC/...
  DC_BASE  = acdc://STUDY_001/dc/derivation/T.UnitConversion/Measure.value/parameter:GLUC/...
             (with applicableWhen baseline)
  DC_CHG   = acdc://STUDY_001/dc/derivation/T.CFB/Change.value/parameter:GLUC/visit:WEEK24/baseline:SCREEN
  DC_ABLFL = acdc://STUDY_001/dc/derivation/T.AssignBaselineFlag/Baseline.flag/parameter:GLUC/baseline:SCREEN
```

Both the SDTM row and the ADaM row are generated from the same DC graph in a single projection pass. They are internally consistent by construction — same source DPs, same dimension-value hexagons (SUBJ-001, GLUC, WEEK24), same DC URIs. End-to-end traceability is a chain of URI lookups, in either direction: from any ADaM or SDTM cell back to the raw vendor record that arrived in Step 1, or forward from that vendor record to every ADaM and SDTM cell it produced.

> **★ INSIGHT ─────────────────────────────────────**
>
> - Neither SDTM nor ADaM was the INPUT in this example. The raw lab vendor record was the input; SDTM and ADaM are both OUTPUTS — projections of the resulting concept-layer DPs. The familiar table formats remain the deliverables, but they're computed from a single source, so they cannot drift from each other.
> - A DC-tagged vendor record skips the four-step inference entirely. The engine reads each fulfillment, validates the value against the DC's contract metadata, and creates the DP. Identification is delivered, not inferred. (Legacy vendor CSVs and migration-case existing SDTM rows still work via the inference fallback — see Section 9.1.)
> - The vendor never had to know SDTMIG or ADaMIG. They committed to fulfilling the DCs the study sent them; the standards-conformance work is downstream projection logic (Section 9.4). Locality of change: a sponsor moving from SDTMIG 3.4 to SDTMIG 4.0 updates the concept-variable mapping; the vendor, the engine ingestion code, and the derivation library all stay the same.
> **─────────────────────────────────────────────────**


## 10. How dataContracts are auto-generated

The DC registry for a study is computed deterministically from the spec inputs. No human authors DC URIs; they fall out of the spec.


### 10.1 Ingestion dataContracts from USDM + BCs

```
INPUT:
  USDM StudyDesign         (Schedule of Activities, ScheduledActivityInstances)
  Biomedical Concept binds (each BC bound to one or more SoA Activities)
  Subject roster           (planned enrollment count or known subject IDs)

ALGORITHM (DCs are per BC Property × ScheduledActivityInstance — subject-agnostic):
  for each (ScheduledActivityInstance SAI in SoA):
    for each (BC bound to SAI's Activity):
      for each (BC Property in BC.properties):
        generate ingestion DC:
          property  = BC Property identifier (e.g. BC.Glucose.value)
          context   = SAI identifier
          uri       = acdc://STUDY/dc/ingestion/<bc.property>/at:<sai>
        register in DC registry

  (Subject is NOT in the DC URI. Per-subject DPs fulfill the DC at
   ingestion time, each carrying a for_subject edge and the value.)
```


### 10.2 Derivation dataContracts from AC transformations + study instance

```
INPUT:
  AC transformation library  (T.ChangeFromBaseline, T.UnitConversion, ...)
  Study instance file        (which transformations apply to which datasets)
  Endpoint specs             (placeholder values per analysis)

ALGORITHM (DCs are per transformation × output Property × placeholder values
           — subject-agnostic):
  for each (transformation T in study instance):
    for each (endpoint that triggers T):
      for each (output Property of T):
        generate derivation DC:
          transformation = T.conceptId  (e.g. T.CFB)
          property       = output Property identifier (e.g. Change.value)
          context        = endpoint placeholders (parameter, visit,
                                                  baseline_visit, ...)
          uri            = acdc://STUDY/dc/derivation/<t>/<property>/
                              <placeholders>
          derives_from   = source DC URIs (resolved via concept mapping;
                                          subject-agnostic at the DC level)
        register in DC registry

  (Per-subject derived DPs are produced when the engine runs;
   each DP fulfills the DC and carries for_subject + value.)
```

Two terms in this algorithm — output Property and placeholder values — drive the URI structure and are worth making concrete. They appear together in every derivation DC URI.


#### Output Property

The output Property is the conceptProperty (semantic type) the transformation's formula produces. It is the typed kind of value that fills the output column — analogous to a BC's property like Recording.Result.Quantity.value on the ingestion side. One transformation can have multiple output properties if it computes more than one thing per output cell (e.g., a unit conversion produces both a new value and a new unit code). Examples across the existing library:

| Transformation | Method used | Output Property(ies) | What the value looks like |
|---|---|---|---|
| T.ChangeFromBaseline | M.Subtraction | Change.value | numeric (e.g., 0.4 mmol/L) |
| T.PercentChangeFromBaseline | M.Division | PercentChange.value | numeric (e.g., 8.33 %) |
| T.UnitConversion | M.AffineTransform | Measure.value + Measure.unit | numeric + code (e.g., 93.6 + "mg/dL") |
| T.LOCF | M.ImputedValue_LOCF | Measure.value (imputed) + Imputation.method | numeric + "LOCF" |
| T.AssignBaselineFlag | M.MatchVisitFlag | Baseline.flag | boolean (Y/N) |
| T.AssignAnalysisVisit | (windowing) | AnalysisVisit.label + AnalysisVisit.number | code + numeric ("WEEK 24" + 24) |
| T.DateDifference | M.DateDifference | StudyDay.value | integer (days) |
| T.Categorization | M.Categorization | Category.code | code (e.g., "65-74") |
| T.Aggregation (e.g., max grade per subject) | M.Aggregation | MaxGrade.value | code (e.g., "GRADE3") |


#### Placeholder values

Placeholder values are the spec-time-supplied coordinates that disambiguate WHICH instance of the derivation we're talking about. They pin the template down to a specific analysis context — the parameter, the visit, the baseline visit, the population, the unit, the window — that the study spec selects from the available code lists. Subjects are NOT placeholders; subjects fulfill the contract via per-subject DPs at runtime. Examples per transformation:

| Transformation | Placeholders typically supplied at study-spec time |
|---|---|
| T.ChangeFromBaseline | parameter (GLUC), visit (WEEK24), baseline_visit (SCREEN) |
| T.PercentChangeFromBaseline | same as above |
| T.UnitConversion | parameter (GLUC), source_unit (mmol/L), target_unit (mg/dL) |
| T.LOCF | parameter (GLUC), partition_on ([Subject, Parameter]), time_order_axis (AnalysisVisit) |
| T.AssignBaselineFlag | parameter (GLUC), baseline_visit (SCREEN) |
| T.AssignAnalysisVisit | window_days (±3), planned_visits ([SCREEN, WEEK4, WEEK12, WEEK24]) |
| T.DateDifference | anchor_date (FirstDoseDate), target_date_concept (AE.startDate) |
| T.CFB_ANCOVA (analysis) | parameter, visit, baseline_visit, population, treatment_axis |
| T.OS_LogRank (analysis) | event (death), population (ITT), treatment_axis |
| T.Aggregation (e.g., max AE grade per subject) | aggregator (max), partition_on (Subject), concept_axis (AE.severity) |


#### Concrete derivation DC URIs — putting them together

The full derivation DC URI has the form acdc://STUDY/dc/derivation/<transformation>/<Output Property>/<placeholder:value>/<placeholder:value>/... — transformation template, then output property, then the spec-time placeholders in order. Concrete examples:

Change from baseline in glucose at Week 24, baseline at Screening:

```
acdc://STUDY_001/dc/derivation/T.CFB/Change.value/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN
                                ─┬─   ──────┬─────   ─────────────┬─────────────────────────
                                 │           │                     │
                                 │           │                     └── placeholder values
                                 │           │                         (set at study-spec time)
                                 │           │
                                 │           └── output Property
                                 │               (what the formula produces)
                                 │
                                 └── transformation template (from library)
```

Percent change in glucose at Week 4 (same study, different placeholder values):

```
acdc://STUDY_001/dc/derivation/T.PCFB/PercentChange.value/
    parameter:GLUC/visit:WEEK4/baseline_visit:SCREEN
```

Unit conversion of glucose from mmol/L to mg/dL — TWO DCs because two output Properties (value + unit):

```
acdc://STUDY_001/dc/derivation/T.UnitConversion/Measure.value/
    parameter:GLUC/source_unit:mmol/L/target_unit:mg/dL

acdc://STUDY_001/dc/derivation/T.UnitConversion/Measure.unit/
    parameter:GLUC/source_unit:mmol/L/target_unit:mg/dL
```

Baseline flag assignment for systolic BP:

```
acdc://STUDY_001/dc/derivation/T.AssignBaselineFlag/Baseline.flag/
    parameter:SYSBP/baseline_visit:SCREEN
```

Each URI is read as: 'this is the contract for the [transformation] producing [output Property] in the analysis context where [placeholders are set to these values].' Subjects' DPs fulfill the contract at engine-run time.

> **★ INSIGHT ─────────────────────────────────────**
>
> - Same transformation, different placeholder values = different dataContracts. T.CFB applied to glucose vs T.CFB applied to systolic BP are TWO separate DCs (different parameter placeholder); same for different visits or different baseline definitions. This is what makes one transformation template reusable across an entire study without code duplication.
> - Same transformation, multiple output Properties = multiple dataContracts. T.UnitConversion produces both a new value and a new unit code, so two DCs are generated — one per output Property. The DPs for both come from the same engine run on the same input.
> - Subject is never a placeholder. Subject lives on the DP (fulfilling the DC) via a for_subject edge. The DC is subject-agnostic precisely so it can be the single contract that every subject's DP fulfills.
> **─────────────────────────────────────────────────**


### 10.3 Analysis dataContracts from AC analyses + study instance

```
INPUT:
  AC transformation library  (T.CFB_ANCOVA, T.OS_LogRank, ...)
  Study analysis spec        (which analyses run, on which populations)
  Output structure templates (one DC per output cell)

ALGORITHM (one DC per output cell — population-bound, not subject-bound):
  for each (analysis A in study spec):
    for each (output cell defined by A's output template):
      generate analysis DC:
        analysis      = A.conceptId  (e.g. T.CFB_ANCOVA)
        property      = cell's measure property (e.g. lsmeans.estimate)
        context       = endpoint placeholders + population + grouping/
                        cell discriminator (ARM, contrast level, term, ...)
        uri           = acdc://STUDY/dc/analysis/<a>/<property>/
                            <placeholders>/<grouping>
        derives_from  = lookup all subject-level derivation DCs that
                        contribute to this analysis
      register in DC registry

  (Each analysis DC is fulfilled by exactly one DP — the analysis engine's
   computed result for that cell.)
```

Like derivation DCs, analysis DCs are built from two parts that appear in every URI: the output Property (the analysis concept whose value is being computed) and the placeholder values (the study-specific context — parameter, visit, population, grouping). Analysis differs from derivation in two ways: (a) the output Properties are typically multi-component statistical outputs (an LSMean has estimate, stderr, CI, df, … — each of which is its own analysis concept and its own DC), and (b) there are additional placeholders that disambiguate which OUTPUT CELL we're talking about (which ARM, which contrast pair, which model term).


#### Output Property (analysis side)

Analysis output Properties come from the AC concept model — analysis concepts that describe the kinds of values statistical methods produce. Each cell of an analysis output is a separate output Property, and each cell is its own DC. Examples across the existing library:

| Analysis transformation | Method used | Output Property(ies) | What each value looks like |
|---|---|---|---|
| T.CFB_ANCOVA | M.ANCOVA | lsmeans.estimate / .stderr / .df / .ci_lower / .ci_upper; contrasts_t.estimate / .stderr / .t / .pvalue / .ci_*; type3_tests_f.numdf / .dendf / .F / .pvalue; parameter_estimates_linear.*; fit_statistics_linear.* | numeric / p-value / CI bound |
| T.MMRM_Primary | M.MMRM | lsmeans.estimate (per visit × ARM); contrasts_t.* (per visit × ARM pair); type3_tests_f.* (per term); fit_statistics_linear.* | numeric / p-value |
| T.OS_LogRank | M.LogRankTest | test.chi_squared / .df / .pvalue | numeric / p-value |
| T.OS_Cox | M.CoxPH | hazard_ratio.estimate / .ci_lower / .ci_upper / .pvalue | numeric / p-value / CI bound |
| T.ResponderAnalysis | M.ChiSquaredTest | test.chi_squared / .df / .pvalue; count.value (per cell) | numeric / count / p-value |
| T.CMH | M.CMH | test.chi_squared / .df / .pvalue (per stratum and overall) | numeric / p-value |
| T.FisherExact | M.FisherExactTest | test.pvalue (one-sided + two-sided) | p-value |
| T.Descriptive_Mean | M.Mean | computed_value | numeric |
| T.Descriptive_Median | M.Median | computed_value | numeric |
| T.Descriptive_CV | M.CoefficientOfVariation | computed_value | numeric (%) |
| T.Count | M.Count | count.value | integer |
| T.CumulativeFrequency | M.CumulativeFrequency | cumulative_frequency.value (per category) | numeric |

For the multi-statistic outputs (lsmeans, contrasts_t, type3_tests_f), each statistic (estimate, stderr, p-value, CI bound, …) is its OWN output Property and produces its OWN DC. A single M.ANCOVA run can therefore produce dozens of analysis DCs — one per (statistic × cell). This is what makes individual numbers in a result table separately addressable, queryable, and traceable.


#### Placeholder values (analysis side)

Analysis placeholder values include all of the derivation-side placeholders (parameter, visit, baseline_visit) PLUS additional values that scope the analysis to a population and disambiguate which output cell each DC names. Examples per analysis transformation:

| Analysis transformation | Placeholder values typically supplied |
|---|---|
| T.CFB_ANCOVA | parameter (GLUC), visit (WEEK24), baseline_visit (SCREEN), population (ITT), treatment_axis (ARM); cell discriminators: arm (A, B, ...) for lsmeans rows, contrast (A-B, A-PLACEBO, ...) for contrasts_t rows, term (treatment, baseline:treatment, ...) for type3_tests_f rows |
| T.MMRM_Primary | parameter, visits (set of analysis visits — MMRM is longitudinal), baseline_visit, population, treatment_axis, correlation_structure (e.g. UN, AR1, CS); cell discriminators include visit on top of the ANCOVA set |
| T.OS_LogRank | event (e.g. death, disease_progression), population (ITT), treatment_axis (ARM); cell discriminator: none (one test per analysis), OR strata if stratified |
| T.OS_Cox | event, population, treatment_axis, covariates (e.g. [baseline_severity, region]); cell discriminator: term (which covariate's HR) |
| T.ResponderAnalysis | parameter, visit, baseline_visit, response_criterion (e.g. 'AVAL >= 50% reduction from BASE'), population, treatment_axis; cell discriminators: arm (for count cells), contrast for the test |
| T.Descriptive_Mean (or .Median, .CV, etc.) | parameter, visit, population, treatment_axis; cell discriminator: arm (one descriptive value per arm) — and visit if the analysis is repeated longitudinally |
| T.CMH | parameter, visit, stratum_variable (e.g. region), population, treatment_axis; cell discriminators: stratum (per stratum's test) + 'overall' for the pooled test |


#### Concrete analysis DC URIs — putting them together

An analysis transformation typically generates a FAMILY of DCs — one per (output Property × output cell × placeholder context). The full analysis DC URI has the form acdc://STUDY/dc/analysis/<analysis>/<output Property>/<placeholder:value>/.../cell:<discriminator>. Concrete examples for an ANCOVA of change-from-baseline in glucose at Week 24 with two arms (A, B) in the ITT population:

Two LSMeans (one per arm) — two DCs, one per (output Property × arm):

```
acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/lsmeans.estimate/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:arm.A

acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/lsmeans.estimate/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:arm.B
```

LSMean standard error (a separate output Property) — another two DCs, one per arm:

```
acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/lsmeans.stderr/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:arm.A

acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/lsmeans.stderr/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:arm.B
```

The A-vs-B contrast estimate, standard error, and p-value (three output Properties on one cell):

```
acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/contrasts_t.estimate/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:contrast.A-B

acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/contrasts_t.stderr/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:contrast.A-B

acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/contrasts_t.pvalue/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:contrast.A-B
```

The Type 3 test for the treatment term (a separate output Property family on a different cell):

```
acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/type3_tests_f.F/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:term.treatment

acdc://STUDY_001/dc/analysis/T.CFB_ANCOVA/type3_tests_f.pvalue/
    parameter:GLUC/visit:WEEK24/baseline_visit:SCREEN/population:ITT/cell:term.treatment
```

All of those DCs come from ONE ANCOVA run on ONE endpoint context. The engine produces them as a family at analysis-spec time (Planned), and the analysis run fulfills them all with one set of computed values (one DP per DC). Each individual number in the resulting result table — every LSMean, every p-value, every CI bound — has its own URI.

> **★ INSIGHT ─────────────────────────────────────**
>
> - Analysis DCs come in FAMILIES — one M.ANCOVA run produces dozens of DCs (one per statistic per cell). The family structure mirrors the result table's structure: rows = cells (per arm, per contrast, per term), columns = statistics (estimate, stderr, p-value, CI bound). Each cell in that table is one DC.
> - Cell discriminators are placeholders too. arm.A, arm.B, contrast.A-B, term.treatment — these aren't accidents of the engine; they're part of the URI's required-context spec, supplied at analysis-spec time. They're what makes 'the LSMean for arm A' a different DC from 'the LSMean for arm B'.
> - Each ARS result cell maps 1:1 to one analysis DP, which fulfills one analysis DC. The whole ARS package is a projection of a connected sub-graph of analysis DPs back into the ARS JSON shape. Traceability from any ARS number back to the source SDTM is a chain of URI lookups: ARS resultId → analysis DC URI → derives_from → derivation DC URIs → derives_from → ingestion DC URIs → source SDTM rows.
> **─────────────────────────────────────────────────**


## 11. Link to ADaM

Every ADaM dataset row carries one or more DCs as columns (or attached via Define-XML metadata):

```
ADLB row:
  USUBJID   PARAMCD  AVISIT   AVAL  BASE   CHG   ABLFL
  SUBJ-001  SYSBP    SCREEN   138   .      .     Y
  SUBJ-001  SYSBP    WEEK24   145   138    7     N

  DC_AVAL = acdc://.../dc/ingestion/BC.SBP/visit:WEEK24/subject:SUBJ-001
  DC_CHG  = acdc://.../dc/derivation/T.CFB/parameter:SYSBP/visit:WEEK24/.../subject:SUBJ-001
```

The CHG row's DC resolves to the derivation DC; that DC's derives_from lists the two source ingestion DCs.

> **★ INSIGHT ─────────────────────────────────────**
>
> - This makes Define-XML's Origin and Method elements computable from the DC graph rather than hand-authored. Today they drift from the actual derivation logic; with DCs they are projections of it and stay in sync by construction.
> - Existing ADaM tooling doesn't need to change. The DC columns are extra metadata; legacy consumers that ignore them still see standard ADLB. Modern consumers that follow the DC URIs get full lineage.
> - DC columns can be carried via Define-XML extensions rather than as physical columns in the dataset, depending on submission constraints.
> **─────────────────────────────────────────────────**


## 12. Link to ARS (Analysis Results Standard)

The Analysis Results Standard provides a structured way to capture analysis outputs. ARS results map 1:1 to analysis DCs:

```
ARS result:
  analysisId:    AN001
  resultId:      R-001-LSM-A
  description:   "LS Mean of CHG in SYSBP at Week 24, ARM A"
  value:         6.2
  resultGroups:  [ { groupingId: TRT, groupId: A } ]

  ↓ resolves to ↓

  DC.analysis.T.CFB_ANCOVA.parameter:SYSBP.visit:WEEK24.lsmean.arm:A
    concept:      T.CFB_ANCOVA / output: ls_means
    context:      SYSBP @ WEEK24
    grouping:     ARM=A
    value:        6.2 mmHg
    derives_from: [ DC.derivation.T.CFB.SYSBP.WEEK24.SUBJ-001, ..., SUBJ-N ]
    produced_by:  T.CFB_ANCOVA @ v1.0.0
```

![Figure 5 — ARS results, the DC graph, and source data form one resolution chain. Each ARS result cell resolves to an analysis DC; that DC's derives_from points at per-subject derivation DCs; those point at per-subject-per-timepoint ingestion DCs; those point at raw source data.](dataContracts-images/05_ars_linkage.png)

*Figure 5 — ARS results, the DC graph, and source data form one resolution chain. Each ARS result cell resolves to an analysis DC; that DC's derives_from points at per-subject derivation DCs; those point at per-subject-per-timepoint ingestion DCs; those point at raw source data.*


## 13. Implementation notes


### 13.1 URI scheme

Recommended form for human-debuggable contexts:

```
acdc://<study-id>/dc/<lifecycle>/<concept>/<context-fields>/<subject-or-grouping>

lifecycle ∈ { ingestion, derivation, analysis }
context-fields = ordered, slash-separated, key:value pairs
                 (e.g. parameter:SYSBP/visit:WEEK24/baseline:SCREEN)
```

For hashed / opaque form (when context cardinality is high):

```
acdc://<study-id>/dc/h/<sha256-of-canonical-form>
```

Both must resolve to the same DC record via the registry.


### 13.2 DC registry

A per-study registry stores the canonical DC record for each URI:

```
- uri: acdc://STUDY_001/dc/derivation/T.CFB/parameter:SYSBP/visit:WEEK24/baseline:SCREEN/subject:SUBJ-001
  lifecycle: derivation
  concept: T.CFB
  context:
    parameter: SYSBP
    visit: WEEK24
    baseline_visit: SCREEN
  subject: SUBJ-001
  produced_by:
    transformation: T.CFB
    version: "1.0.0"
    engine: "ACDC-engine@0.5"
  derives_from:
    - acdc://STUDY_001/dc/ingestion/BC.SBP/visit:WEEK24/subject:SUBJ-001
    - acdc://STUDY_001/dc/ingestion/BC.SBP/visit:SCREEN/subject:SUBJ-001
  fulfilled:
    timestamp: 2026-05-29T14:00:00Z
    value: 7.0
    unit: mmHg
```


### 13.3 Lifecycle states

| State | Meaning |
|---|---|
| Planned | DC URI exists; no data bound yet |
| Fulfilled | DC has a value (or result) attached |
| Unfulfilled | DC was expected but no data arrived; missing-data condition |
| Superseded | A newer fulfillment replaced an older one (audit retained) |
| Invalidated | Spec changed in a way that retired this DC |


### 13.4 Versioning

DCs reference the spec versions that produced them:

- Library transformation version (T.CFB @ v1.0.0).
- Concept-variable mapping version (ADaMIG_v1.3 mappings @ ...).
- Study instance version.
- Engine version.

A change to any of these may produce different values for the same DC URI; the audit trail records which version produced which fulfillment.


## 14. Benefits summary

| Concern | Without DCs | With DCs |
|---|---|---|
| Source-to-result traceability | Manual reconstruction from naming + Define-XML notes | URI resolution |
| Missing-data detection | After-the-fact reconciliation | Planned-vs-fulfilled DC compare |
| Reproducibility of analysis numbers | Re-run the SAS, hope same output | Same DC URI + same spec versions ⟹ same value |
| Define-XML Origin/Method | Hand-authored, drifts | Projection of DC graph |
| ARS result identifiers | Locally-scoped, opaque | Globally-resolvable URIs with full lineage |
| Standards interop (SDTM/ADaM/FHIR/OMOP/ARS) | N-to-N translation matrices | All projections of one DC graph |
| Versioning and re-run | Custom per-sponsor | Built into DC fulfillment records |
| Multi-study pooling | Manual alignment | DC URIs match across studies for shared concepts |


## 15. Open questions / next steps

1. 1. Granularity of analysis DCs. Per result-cell (per LSMean per ARM) vs per result-family (one DC for 'all LSMeans') vs per analysis-run. Trade-off between URI explosion and queryability.
1. 2. DC URI stability under spec evolution. If a transformation's derives_from set changes (new input added), does the DC URI change, or only the fulfilled value? Affects audit semantics.
1. 3. Population grouping in URIs. How to encode 'subjects ∈ ITT population, ARM = A' in a URI compactly. Hash form may be the practical answer.
1. 4. Hash collision and opaqueness. When using dc/h/<sha> form, ensure SHA-256 collision-free over realistic study sizes.
1. 5. Integration with existing CDISC artifacts. Where DC URIs go in Define-XML, in ARS JSON, in SDTM/ADaM datasets — physical column, metadata extension, or external sidecar.
1. 6. Engine implementation. Reference implementation that consumes the spec stack and generates/fulfills DCs, with SAS code generation as a primary output for regulated environments.
1. 7. DC registry storage. In-band (versioned alongside study spec), out-of-band (database), or both.


## 16. Relationship to existing AC/DC artifacts

DCs are not a new artifact in the spec stack — they are a byproduct of artifacts that already exist:

| Existing artifact | Role in DC generation |
|---|---|
| lib/concepts/*.json (concept model) | Defines what concepts a DC can reference |
| lib/transformations/*.json (AC/DC schema) | Defines transformation conceptIds and parameter contracts; the T.* part of derivation/analysis DC URIs |
| lib/concepts/concept-variable-mappings.json | Maps concepts to SDTM/ADaM variables — used to project DCs into dataset rows |
| USDM study design | Provides SoA positions and subject roster for ingestion DC generation |
| Study instance file (small, per-study) | Picks which transformations apply where; provides placeholder values |
| Endpoint spec | Resolves placeholders ({parameter}, {visit}, {baseline_visit}, {population}) |

The DC registry is computed from the above inputs; no additional authored content is required. The architectural addition is a resolver and registry, not a new spec format.


---


## Appendix A — Mathematical foundation

The main document deliberately avoids mathematical notation. This appendix provides it for readers from mathematical, data-engineering, or category-theory backgrounds who want the formal anchor. The concepts described here have well-established equivalents in tensor analysis, linear algebra, OLAP, RDF Data Cube (qb), SDMX, and fiber-bundle geometry — but you do not need to read this appendix to use, implement, or reason about dataContracts.


### A.1 The cube as a vector field

A cube is a positional space — its axes are dimension concepts, its cells are positions. At each populated position, there is an observation. In conventional dimensional modeling, that observation is a fact with measure values.

In our model, the observation (one Recording instance) is a VECTOR: a multi-component value sitting at a cube position. The components of the vector are the BC's measurable properties (value, unit, dateTime, test, ...). Formally:

```
R : positions  →  property-space vectors
R(Subject, Parameter, Visit)  =  (value, unit, dateTime, test, ...)
```

The whole dataset is a VECTOR FIELD: each populated cube cell has its own vector. Where no observation exists, the field is undefined (the corresponding dataContract is unfulfilled).


### A.2 DPs as projections

A data point (DP) is one component of a Recording vector — its scalar projection onto a single Property basis axis:

```
DP_value     =  ⟨R(p), e_value⟩
DP_unit      =  ⟨R(p), e_unit⟩
DP_dateTime  =  ⟨R(p), e_dateTime⟩
...
Reconstruction:  R(p) = Σ over properties (DP_property · e_property)
```

In database terms this is the wide ↔ narrow pivot. Wide form = Recording as a single cell with many measure components. Narrow form = each DP as its own cell in a Property-extended cube.


### A.3 dataContracts as partial vectors / fiber-bundle base points

A dataContract lives in a projected sub-space of the cube — axes the spec doesn't yet know about (Subject for ingestion / per-subject derivation; the scalar value for analysis) are quotiented out. Formally:

```
V    = full cube space
K    = spec-knowable axes
U    = spec-unknown axes
π_K  : V → V/U   (canonical projection / quotient map)

DC ∈ V[K]        (a point in the spec sub-space)
DP ∈ V           (a point in the full space)
fulfills:         DP fulfills DC  ⇔  π_K(DP) = DC
```

This is a fiber bundle: V is the total space, V[K] is the base, π_K is the projection, fibers are the open-axis sets (one Subject per DP, in ingestion / per-subject derivation). DCs name base points; DPs are elements of fibers above those base points.


### A.4 Slicing as restriction; cubes as hyperplanes

A slice of the cube is the field restricted to a sub-cube defined by fixing one or more axes:

```
Slice(Visit = SCREEN)  =  R restricted to { p : p.Visit = SCREEN }

Different fixings produce different-dimensional restrictions:
  fix 0 axes  →  the whole cube
  fix 1 axis  →  a hyperplane (a plane in 3D)
  fix k axes  →  a sub-cube of dimension (n−k)
  fix all n   →  a single cell (a 0-dim point)
```

DCs for ingestion / per-subject derivation are LINES (1D — one open axis, Subject). DCs for analysis are POINTS (0D — no open axis in the aggregate space). Baseline references are PLANES (one axis fixed, others free).


### A.5 Derivations as field maps

A derivation is a map between vector fields. For T.ChangeFromBaseline:

```
R_input  : (Subject × Parameter × Visit)  →  Measure.value
R_output : (Subject × Parameter × Visit)  →  Change.value
R_output(p)  =  R_input(p)  −  R_input(p with Visit replaced by baseline)
```

Pointwise (per cube cell), with a baseline-plane reference. The map is FIBER-PRESERVING — each Subject's contribution is independent; the map does not mix fibers.


### A.6 Analyses as integrations along an axis

An analysis aggregates the vector field along the Subject axis (and possibly others), producing a new vector field at coarser granularity:

```
R_CFB      : (Subject × Parameter × Visit) → Change.value
R_analysis : (Parameter × Visit × Population × Grouping) → AnalysisResult-vector

R_analysis(param, visit, pop, group)
  =  LSMean( R_CFB | restricted to Subject ∈ pop, Group = group )
```

The output cells have their own Property axis (lsmean, contrasts_t, type3_tests_f, ...), which is itself a vector at each output cell — the same Recording-as-vector pattern at the analysis level.


### A.7 The four query examples as cube algebra

The four examples from Section 8.2, formally:

```
"Everything for SUBJ-1001"
  =  R restricted to { p : p.Subject = SUBJ-1001 }
  =  the fiber over SUBJ-1001 across every bundle attached
     to the Subject base manifold

"All glucose data, all subjects, all timepoints"
  =  LB cube restricted to Parameter = GLUC
  =  a 2D hyperplane: Subject × Visit free, Parameter fixed

"All AEs in safety population"
  =  AE cube restricted to Subject ∈ { s : R_DM(s).SAFFL = Y }
  =  AE field restricted to a sub-population of the Subject axis

"Day 14 cross-section"
  =  ⋃ over cubes c with a Date or Visit axis,
        of  c restricted to Date = Day 14
  =  union of one-axis restrictions across heterogeneous cubes
```


### A.8 Standards versions as projection maps

Projecting concept-layer data back to a tabular standard (SDTM 3.4, SDTM 4.0, ADaMIG 1.3, FHIR, OMOP) is a (linear / affine / structural) map from the concept layer's vector field to a table-shaped view. Different standards = different projection maps; same underlying field:

```
P_SDTM_3_4   : R_concept  →  SDTM 3.4 tables
P_SDTM_4_0   : R_concept  →  SDTM 4.0 tables
P_FHIR       : R_concept  →  FHIR Bundle
P_OMOP       : R_concept  →  OMOP CDM tables

All P_* are induced by the concept-variable mapping that pairs each
conceptProperty with its variable / element name in the target standard.
```


### A.9 What this view buys you

Beyond conceptual clarity, formalizing the architecture as a vector-field / fiber-bundle / projection structure gives several concrete benefits:

- Provable invariants. Derivation correctness can be verified per-fiber (per-subject) rather than per-row.
- Equivalence checks. Two transformation pipelines compute the same output if and only if their composed field maps are equal — useful for swapping engines or migrating libraries.
- Composability. Field maps compose; analyses compose with derivations; projections compose with restrictions. Everything operates on the same vector-field structure.
- Standard-library reuse. The mathematics is the same as in dimensional modeling, OLAP, qb, SDMX, tensor analysis, knowledge-graph databases, and ML/data-science frameworks. Tools and theories from those domains apply directly.
- Cross-study reasoning. Pooling two studies is mathematically a coproduct of bundles sharing a (possibly aligned) base; aggregating is integration; cohort selection is restriction. Same operations, larger inputs.


### A.10 Summary

In one sentence: a dataContract is a point on the base manifold of the fiber bundle whose total space is the full data cube; a data point is one component of the Recording vector at one cube cell, equivalently a fiber-element above the dataContract base point; derivations are fiber-preserving field maps; analyses are integrations along axes; SDTM and ADaM are projection maps from the vector field to specific tabular standards.

Everything in the main document is a particular case or operational instance of this structure. The structure exists whether or not anyone working with the data thinks about it in these terms.


— End of document —
