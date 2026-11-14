# Known gaps and what the working group needs to do

The candidate is internally consistent: every file validates and every
reference resolves. It is not finished. This page lists what is missing or
unreviewed, most important first. The numbered findings are in
[migration-notes.md](migration-notes.md).

## Needs a decision by the working group

| Topic | The question | Findings |
| --- | --- | --- |
| The thirteen design decisions | The model follows decisions D1–D13, taken by one person to make a proposal possible. Each needs the group's agreement | [decisions.md](decisions.md) |
| A class for hypothesis tests | Chi-squared, Fisher's exact, log-rank and t-tests are carried as model-based methods because nothing else holds their notation. Add a test-method class, or allow a formula on a composite method? | 1 |
| Analysis concepts across distributions | Contrasts, type III tests, parameter estimates and test results are each tied to one distribution, so z-based, chi-squared and exact outputs have no concept to bind to. Generalise the concepts, or add variants? | 7 |
| The hypothetical strategy | Is last-observation-carried-forward an acceptable implementation? It is the only one the library has | 23 |
| Provisional content | One template, two roles, eight phrases and two concepts were proposed during earlier work and are marked `provisional`. Accept, change or drop each | — |
| The eSAP boundary | AC stops at the study analysis set. Is the extension mechanism (reference by identifier, own namespace, `extension_ref` placeholders, `definedBy` roles) enough for an eSAP model? | D13 |

## Needs expert review

| What | Why |
| --- | --- |
| Model terms and parameters of the 14 model-based methods | Generated from each formula, following the one hand-written example (ANOVA). A statistician should check the terms, the generic factor levels and which parameters each output refers to (findings 3, 6) |
| All 60 methods | Migrated faithfully from `methods_02`; their statistical content was not reviewed in this build |
| The French and German language packs | Illustrative, marked `validated: false` (finding 14) |
| Data bindings | Migrated from a mapping file that had no schema and was not used by any tool (findings 16, 18) |

## Missing from the model

| Gap | Detail |
| --- | --- |
| Codes | Almost nothing has an NCIt code. There are no registered identifiers for the ICH E9(R1) strategies or for Kaplan-Meier estimation. One STATO code is inconsistent (findings 5, 9, 24) |
| Conditional and gated analyses | "If the dose-response test is significant, then pairwise comparisons" cannot be expressed. The CDISC Pilot's own primary analysis needs it |
| Treatment as a continuous dose | The method schema can type an input as continuous or categorical, but no template yet uses a treatment dose as a covariate |
| Analyses with no method | A listing or a subset is a slice with no method. The principles say it must be allowed; the model does not yet allow it |
| Three intercurrent-event strategies | Composite, while-on-treatment and principal-stratum have phrases but no implementing Transformation |
| Time-to-event derivations | Nothing says how time to event and censoring are derived (finding 20) |
| Arm-level study concepts | Needed for contrasts against a control arm (finding 19) |
| Demographic and epoch concepts | Age, sex, race, region and epoch are bound in ADaM but defined nowhere (finding 16) |
| A confidence-level configuration on Kaplan-Meier | Finding 21 |
| A field-level mapping to ARS | An Analysis Concept points at an ARS analysis. How its Method, outputs and data structures correspond to ARS `AnalysisMethod`, `Operation` and results is not written down |
| Non-CDISC standards | OMOP and FHIR bindings are deferred until after v1 (D8) |
| Attributes | The data structures reserve attributes; none is used |

## Out of step

| What | Detail |
| --- | --- |
| R and SAS catalogues | Written against earlier role names; 33 warnings (finding 17) |
| `T.BaselineSelection` | Leaves a required input of its method unbound |
| `T.PFS_KaplanMeier` | Named for one event but used for three (finding 22) |
| The demo application (`ac-dc-app`) and the SmartPhrase proof of concept | Neither reads the candidate v1 files. Both would need an adapter or a port. The proof of concept's sentences are reproduced by `v1/tools/render.py` |
| Legacy content on this branch | Everything outside `v1/` predates the candidate and is kept only for reference. It should be removed or archived when the candidate is accepted |

## Governance, not yet addressed

- Who accepts library contributions, and how provisional content is promoted.
- A versioning policy. The intended rule is: an addition is a minor version; a
  change of meaning, of a placeholder's kind or of a role is a major version;
  and a deprecation path, as for controlled terminology. It is not enforced.
- Core libraries and therapeutic-area packages (overlays).
- Publication through the CDISC Library.
