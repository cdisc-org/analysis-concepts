# Synthesised SAP Template — Output Set

A single SAP template synthesising **Veramed FOR-039 v3.0** (ICH E9 implementation, prescriptive depth) and the **CoreTEE / TransCelerate v005 draft** (estimand-first, ICH E9(R1) flow), built for ingestion by an AI agent deriving a **semantic data model for SAPs**.

## Files

| File | Role |
|---|---|
| `SAP_Template_Master.md` | Source of truth. Hybrid backbone. Every section is a self-describing **node** with a metadata block (stable `id`, `parent`, `required`, `repeatable`, `estimand_linked`, `ich_refs`, `source`, `produces`, `placeholders`) followed by guidance/example content. |
| `SAP_Template_Schema.yaml` | Machine-readable spine. The node graph extracted from the master plus cross-cutting `relationships` (estimand alignment, TFL enumeration). Key off `id`. |

## Synthesis decisions

- **Flow from CoreTEE, depth from Veramed.** Estimand framework leads (objectives → endpoints → estimands → analysis sets aligned to estimands). Veramed's granular interim-analysis, safety, reporting-convention and TFL-appendix sections are retained as child nodes so nothing is lost.
- **Estimand is a first-class repeatable entity** (`estimand`, child of objectives), with the five ICH E9(R1) attributes as explicit fields, so the data model can represent co-primary / supplementary / secondary estimands as instances.
- **`estimand_linked` flag** marks every node whose content must align to an estimand (analysis sets, missing data, primary/secondary analyses, ICE impact) — these become the constrained edges in the model.
- **Stable kebab-case IDs, never renumbered.** Display numbering (1–21) is cosmetic; `id` is the join key.
- **`produces` enum** (`prose | table | tfl_shell | definition | none`) tells the agent what artifact each node yields.
- **Placeholders** use `{{snake_case}}` tokens — the candidate attributes for each entity.

## Suggested entity mapping for the data model

- `Document` → title-page, version-history (1:1)
- `Objective` 1:n `Endpoint`; `Objective` 1:1 `Estimand` (estimand 1:5 `EstimandAttribute`)
- `AnalysisSet` n:1 `Estimand` (via `aligns_to`)
- `Analysis` n:1 `Estimand` (via `realises`); `Analysis` 1:n `TFL` (via `enumerates`)
- `TFL` rows carry `analysis_set`, `linked_estimand`, `deliverable`, `programming_notes`

Coverage spans every section present in either source; sections unique to one source are tagged `source: veramed | coretee` so provenance is queryable.
