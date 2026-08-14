# Smartphrase PoC — design record

> Status: implemented · 2026-07-12 · issue [#9](https://github.com/cdisc-org/analysis-concepts/issues/9)
> Requirements live in the issue body (regrounded 2026-07-12); this records the solution design and its rationale.

## What is being demonstrated

The smartphrase concept: spans of SAP prose bound to AC/DC model metadata such that the prose and the
model are **two views of one thing**. Four claims must be believable to the AC/DC working group:

1. one source of truth (co-equal bidirectional authoring),
2. traceability from any phrase to the physical data,
3. template-level reuse (one library building block, many instantiations),
4. standards alignment (no private identifier space).

## Architecture — one state, many projections

The design centre is a single **analysis-instance object** (an eSAP-style fragment: which library
transformation template, plus the phrase instances whose bindings fill the template's slice keys).
Everything the user sees is a pure-function projection of that one object:

```
                        ┌──────────────────────────────┐
   library layer        │   analysis instance (STATE)  │       study layer
   (methods_02,         │   template: T.CFB_ANCOVA     │       (illustrative)
    verbatim)     ──►   │   phrases + bindings          │  ◄──  concepts, IRIs,
                        └──────────────┬───────────────┘       trace tiers
                                       │  engine.js (pure functions)
        ┌──────────────┬───────────────┼────────────────┬──────────────┐
        ▼              ▼               ▼                ▼              ▼
   SAP prose     constructed      tag source        JSON-LD       data trace
   (generated    model view       (acdc:macro       graph         (4 tiers to
    chips)       (eSAP-style)      dialect)         fragment      the .xpt)
```

Bidirectionality falls out of the shape: *model → SAP* is projection (edit the state through the model
panel and the prose re-renders); *SAP → model* is structured authoring that writes the same state (edit
a phrase chip, add/remove phrases the template allows, or edit the tag source and apply it through the
validator). There is no synchronisation step because there is no second copy.

## Decisions

**D1 — The shared state is a model instance; prose is generated, never parsed.**
Authoring the SAP means composing phrases and filling their typed placeholders, not free-text NLP.
This is the honest version of "SAP → model": what a production authoring tool would actually do, and
what makes validation (required slots, constraint kinds, template membership) tractable.

**D2 — Semantics are standoff; the carrier is plain HTML5.**
The semantic layer is a graph fragment (projected as JSON-LD) whose nodes anchor to prose spans; the
document is ordinary HTML that renders anywhere with no tooling. Nothing in the linking mechanism
depends on how the surrounding document is structured — which is what isolates the volatility of the
**SAP-structure sister project** (an M11-analogue for SAPs): whatever structure it lands on hosts the
same anchors. This retires the XHTML + `sap:`/`smartphrase:` namespace approach; the full carrier
analysis is in [`spec/format-evaluation.md`](spec/format-evaluation.md).

**D3 — Identifiers ground into existing standards.**
USDM for study structure (objectives, populations, visits, arms), ARS for analysis/method definitions,
STATO for statistical methods, NCIt for terminology; AC/DC ids only for what is genuinely new
(templates, phrase library, instances). Identifiers not yet registered anywhere are flagged
`iri_status: "illustrative"` and surfaced as such in the demo — the mechanism is the claim, not the ids.

**D4 — Library data is verbatim from `methods_02`.**
`demo/data/acdc-library.js` is a **generated** subset of `lib/transformations/ACDC_Transformation_Library_v07.json`
and the selected `lib/methods/analyses/*.json` at `methods_02@ffee5df` (Transformation Library v0.7, Method
schema v0.9.1) — provenance is recorded in the file and shown in the demo. The study layer
(`demo/data/study-graph*.js`) is hand-crafted and marked illustrative.

The generator that produces it is `tools/build-library-subset.mjs`, which reads the pinned commit via
`git show`, copies entities unmodified, and declares its selection explicitly (3 of the 25 upstream
transformations, and the methods the demo instantiates). `--check` asserts that the file on disk is
exactly what the generator emits, so the "do not hand-edit" contract is enforced rather than merely
stated. Widening the `SELECT_*` lists is the only legitimate way to add upstream library content.

**D5 — Two authoring surfaces, layered.**
Phrase chips with constrained pickers are the primary surface. The `acdc:macro` tag dialect (adopted
from the `methods_02` authoring experiment, still revisable) is the secondary, text-shaped surface:
the demo emits it from state and parses it back through a two-pass validator, so the working group can
see that a text serialisation exists without it being the mechanism.

**D6 — Zero-install.**
Data ships as `<script src>` modules (a `fetch()` of local JSON is blocked by `file://` CORS; a script
tag is not). One folder, double-click `demo/index.html`, works in any browser.

**D7 — Localisation via per-language sentence templates and label packs.**
Because the instance stores identifiers and prose is generated, i18n is a renderer concern — but not a
free one: concatenating phrase fragments in a fixed role order is itself an English assumption (German
needs the verb bracket, French needs agreement and articles). The design therefore gives each language
pack (`demo/data/lang-overlay.js`) three things: a **sentence template** that owns word order (role
tokens + literal frame text — this replaces both the global role order and any hard-coded frame),
per-language **phrase templates** keyed by oid (falling back to the library's English), and
**language-tagged display labels** for concepts/methods (in production largely inherited from
CDISC/NCIt terminology translations). Switching language re-renders the same instance: the tag source,
constructed model view and every identifier are language-invariant, and the JSON-LD carries the
rendered sentence as language-tagged literals (`sp:resolvesTo` per language) — the RDF-native
mechanism. The demo ships EN/FR/DE; the FR/DE copy is illustrative, not validated translation.

**D8 — Proposed library additions live in an overlay, not the generated subset.**
The breast-cancer example needs a transformation template that does not exist upstream (see below), and
hand-editing the generated file would destroy the provenance claim D4 makes and the demo displays. Such
entities therefore live in `demo/data/acdc-library-proposed.js`, which carries its own `provenance`
block stating what it is and why, is merged over the generated subset by `ctxOf`, and has every entity
tagged `proposed: true` so the UI can badge it. The generated object is never mutated — the merge
produces a new library object, which the verification harness asserts. Upstreaming is a deliberate
follow-up: submit to `methods_02` as a v0.7.x minor addition, widen the generator's selection, delete
from the overlay. *Rejected alternative:* authoring directly on `methods_02`, which would put a
PoC-driven change on a shared branch before the working group has seen it.

**D9 — Study graphs live behind a `STUDY_GRAPHS` registry, one file per study.**
Study layers are independent illustrative data, so each gets its own file (`study-graph.js`,
`study-graph-pre0102.js`) registering itself into `window.STUDY_GRAPHS`. A second study therefore cannot
perturb the first, and because the engine already takes the graph as a parameter, switching study is
just rebuilding the context — no engine change. Concept pickers, trace chains, method grounding and the
identifier table all scope to the active study automatically. `STUDY_GRAPH` remains an alias to the
first study for back-compatibility.

**D10 — The model↔prose join is on placeholder slot names, not phrase OIDs.**
`constructModelView` and `buildTrace` originally located their inputs by hardcoded phrase OID
(`SP_CFB_ENDPOINT`, `SP_TIMEPOINT`, `SP_POPULATION`), matched three fixed slice dimensions, and built
the study-variable expression as a literal `"CHG ~ …"` string — so no non-ANCOVA template could be
instantiated. They now collect the instance's bound concepts in library **role order** (so an
endpoint-role binding wins over a covariate binding on the same slot name), substitute slice-constraint
tokens by **slot name** (`{parameter}`, `{visit}`, `{population}`, `{event}`), match sliceKey dimensions
on the concept's `conceptCategory` or `kind`, and derive trace tokens from each concept's own `data`
map. A new endpoint phrase or dimension needs no engine change.

The one honest exception is the study-variable expression, which dispatches on `usesMethod`. A method's
`formula.default_expression` is input-name shaped (`response ~ covariate + fixed_effect`) and rendering
it in study variables needs a measure→ADaM-variable mapping the library does not yet carry; term order
also differs from the current output. A real formula resolver stays out of scope (see below).

**D11 — Proposed *roles* merge through the overlay, and every library read goes through `ctx.lib`.**
The estimand extension needs two new phrase roles (`ice_handling`, `summary_measure`), which is a library
minor-version event. `roleDefinitions` lives in the generated subset, so the roles arrive via the D8
overlay — but `ctxOf` merged only `transformations` and `smartPhrases`, and `index.html` read
`LIB.roleDefinitions` off the raw generated global. That is the **same bug class** the headless gate
caught in #9 with the proposed-provenance note: a merge that produces a new object, read around. All
library reads in the UI now go through `ctx.lib`. Overlay roles declare `order_after` rather than
appending, because appending would place `ice_handling` after `covariate`; and `validSmartPhrasesAdded`
lets the overlay widen an **existing upstream template's** valid-phrase set without hand-editing
generated content, carrying `proposedPhrasesAdded` so the UI badges the additions individually rather
than badging a released template.

**D12 — The sentence template has optional groups and per-role conjunctions.**
An ICE clause needs commas around it (*"…comparing treatment groups, as if X had not occurred,
using ANCOVA…"*). Until now every frame segment between role tokens was pure whitespace, which the
normaliser collapses harmlessly — but literal punctuation beside an **absent** role stranded as `", ,"`
on every instance without that role. `[ … ]` marks an optional group, emitted only when at least one role
token inside it resolves to a phrase, so punctuation disappears with its clause. Two related fixes fell
out of reading the rendered output: an elided group left the preceding role's separating space in front of
the next group's comma (`"intervals , summarised"`), normalised in the `parts` array rather than the
assembled string because the DOM renders parts individually; and repeating roles now join with a
pack-declared `role_conjunctions` entry (`" and "` / `" et "` / `" und "`) instead of a bare space.

**D13 — Traces take an optional focus concept; the ICE axis is shaped differently.**
`buildTrace(ctx, instance, role)` gathered `data` tokens from all bound concepts in role order,
first-wins. That is fine for singular roles but wrong for a repeating one: with two ICEs in one instance
both traced to whichever came first, and the endpoint concept's `{dataset}` shadowed both regardless.
A fourth parameter heads the precedence order with one concept, and the UI passes the clicked phrase's own
binding. The ICE chain also **descends through the ascertainment criterion**, not an ADaM class variable,
because what is traced is *"did this event occur, and when"* — a per-subject (boolean, `Timing`) pair
that is strategy-independent, so one chain serves every estimand declaring the event.

Two holes in the verification gate surfaced here rather than by inspection: the per-instance loop traced
*every* role in `traceTemplates` whether the instance used it or not, producing chains filled from
unrelated concepts (`ADQSADAS.ITTFL` — the endpoint's dataset crossed with the population's flag) and
pinning them as goldens; and the "no unfilled tokens" assertion only looked for the phrase-resolution
marker `⟨name⟩`, so a surviving `{token}` from trace fill passed silently. Both are fixed.

**D14 — A summary measure binds a method *output class*, validated against template and method.**
ICH E9(R1) attribute 5 is a new placeholder kind, `output_ref`. It resolves against
`lib/vocabulary/output_class_templates.json` — real upstream content, so it enters through the generator,
not the overlay — and is **rejected** unless the named output appears in both the template's declared
`outputDataStructure.measures` and the bound method's own `outputs[]`. Neither list alone is
authoritative: a template may declare a subset. This required threading the active template and the phrase
definition into `resolveBinding`.

A finding worth reporting: **the library's output labels are analyst-facing, not document-facing.**
Upstream `contrasts_t` is labelled *"T-based contrasts"*, but SAP prose wants *"the difference in
least-squares means"*. Rendering the library label mid-sentence produces bad English. The language packs
supply the prose register via an `outputClasses` overlay — exactly as they already do for concepts and
methods, English being a pack like any other — and the inspect panel shows the upstream label alongside,
so the divergence is visible rather than hidden.

**D15 — `analysisRole` is added *beside* `sentenceRole`, not substituted for it.**
The planned design said the instance's free-string `sentenceRole` "should bind to" the typed
`Analysis.analysisRole`. **It cannot.** `AnalysisRole` is defined *per estimand*, so *"a secondary
analysis"* is the `MainEstimator` **of a secondary estimand** — not a distinct enum value. Rendering that
string needs the estimand's rank as well as the role, so it is not derivable from the enum alone. Each
instance therefore carries an `estimand` reference (with `rank`) *and* a typed `analysisRole`, and the
consistency is **validated** — exactly one `MainEstimator` per estimand, per `Analysis.analysisRole`'s own
upstream documentation — rather than one field being derived from the other. Every existing sentence and
golden is preserved as a result. Whether `sentenceRole` should eventually be retired in favour of a
rendering rule computed from (rank, role) is a working-group question, not a unilateral one.

`IceHandling` follows the model exactly: `implementedBy` is keyed by strategy and lives on the **ICE
concept**, not the estimand, so two estimands handling one event differently each resolve to the right
transformation without duplicating the event. An empty list is a valid answer — `TreatmentPolicy` uses
data as observed, which upstream documents as "omitted" — but an *absent* key is an error, because that is
prose claiming a handling the model cannot deliver.

## Relationship to the eSAP schema

The demo's "constructed model instance" view mirrors the eSAP v0.5.0 philosophy deliberately: the
template is copied, `sliceKeys[].value` are study-resolved from the phrase bindings, slice-constraint
`{placeholder}` tokens are substituted, method configurations are collected (the confidence-level
phrase resolves to `alpha`), and a `resolvedExpression` gives the study-variable formula. Per the
requirements, the eSAP structure is assumed to change with the sister project — only this *shape of
information*, not its schema, is load-bearing here.

## Distribution — the CDISC Library end-state

When AC/DC is released as a CDISC standard, the intention is that the smartphrase library is
distributed from the **CDISC Library** (or another shared repository facility CDISC offers). The
design already assumes this shape: the library layer is an injected, versioned, read-only artefact
that studies consume but never own — exactly what a CDISC Library package is. Distribution changes
where the artefact comes from and how real its identifiers are, not the architecture:

- **The layer separation is the distribution boundary.** The library layer (phrases, templates,
  methods, roles) is what CDISC publishes; the study layer and engine are indifferent to its origin
  (`ctxOf` takes the library as an input — a CDISC Library API response replaces a `<script src>`
  file as a loading concern only).
- **Provenance generalises.** Today's `{source_branch, source_commit}` becomes
  `{source: "CDISC Library", package, version, retrieved}`; the consumer discipline (pin the
  version, read-only, record provenance) is unchanged.
- **The identifier policy anticipates release.** `iri_status: "illustrative"` exists because there
  is no registration authority yet; a released standard is that authority. `SP_*` / `T.*` / `M.*`
  become CDISC Library-addressable resources and the flags retire — consumers already bind by
  stable oid, so nothing downstream changes.
- **Adjacent CDISC Library content plugs in.** `sliceKeys[].source: "biomedicalConcept"` points
  study registry entries at CDISC Library Biomedical Concepts; language-pack label overlays inherit
  from CT translations; the core + TA-overlay layering mirrors foundational-standard + TAUG-style
  packaging.

What release requires — none of it architectural:

1. **A normative schema for the smartphrase entities** (phrases and roles currently sit informally
   inside the transformation library JSON; methods already have this treatment on `methods_02`),
   plus oid governance.
2. **Versioning and deprecation policy.** Instances bind by oid indefinitely; additive = minor,
   semantic change = major must become normative, with a deprecation path (the CT precedent).
3. **Reference-and-pin vs full-copy** — a working-group decision. A submitted SAP must not depend
   on repository availability or version drift; the eSAP philosophy (full-copy of used definitions
   into the study, the CDISC Library reference kept as provenance) is the consistent answer for
   regulatory self-containment.
4. **A loader, not an embedder, in production tooling.** The demo embeds the library only because
   of the `file://` zero-install constraint; a real editor fetches from the CDISC Library API,
   caches and pins — the embedded copy is then honestly a snapshot with provenance.

## What is authoritative vs illustrative

| Layer | Source | Status |
|---|---|---|
| Phrase templates, roles, transformation templates, method definitions | `methods_02@ffee5df`, generated subset | authoritative (for this PoC) |
| STATO ANCOVA IRI (`STATO_0000176`) | STATO/OBO | authoritative |
| Output class vocabulary (`output_class_templates.json`) | `methods_02@ffee5df`, generated subset | authoritative (for this PoC) |
| `T.LOCF_Imputation` (implements the Hypothetical strategy) | `methods_02@ffee5df`, generated subset | authoritative — real v0.7 content, not invented |
| `T.PFS_KaplanMeier` transformation template | authored here, `acdc-library-proposed.js` | **proposed** — not upstream, badged in-UI |
| `ice_handling` / `summary_measure` roles, the five strategy phrases, `SP_SUMMARY_MEASURE` | authored here, `acdc-library-proposed.js` | **proposed** — a library *minor version*, badged in-UI |
| Kaplan-Meier method IRI | none found | illustrative — **open question**, see below |
| ICH E9(R1) strategy identifiers | none exist — a guideline is not a registry | illustrative — **open question**, see below |
| Occurrence-criterion BC paths (`BC_DS_001/Disposition Event`, …) | shaped per `OccurrenceCriterion`, ids not from a published BC library | illustrative |
| Study concepts, USDM/ARS/NCIt instance ids, trace tiers, document shell | hand-crafted per study (CDISC Pilot, PrE0102) | illustrative, flagged in-UI |
| `acdc:macro` dialect | methods_02 authoring experiment | design input, revisable |

**Open identifier questions.** `M.ANCOVA` grounds authoritatively in STATO, but no STATO (or NCIt) term
for Kaplan-Meier estimation was found in the AC/DC artefacts, and `M_KaplanMeier.json` carries
`"ncitCode": null` upstream. Rather than invent a plausible-looking `STATO_00003xx`, the grounding is an
AC/DC identifier flagged `illustrative`. The same applies to the five **ICH E9(R1) strategies**: the enum
is eSAP-owned and a guideline is not a registry, so there is no resolvable term to point at. Both are
listed in the standards table as AC/DC ids flagged `illustrative` — more honest than omitting the rows and
implying the entities are ungrounded. Resolving them is a steer for the working group.

**One substantive modelling doubt, stated rather than buried.** `T.LOCF_Imputation` is used as the
Hypothetical strategy's implementer because it is the only imputation derivation v0.7 affords. LOCF is a
missing-data method; a hypothetical estimand strictly wants imputation under an explicitly stated
alternative assumption. The mechanism is right — a strategy resolving to a real transformation — but
whether *this* transformation is the right one for *this* strategy is a question for the working group, not
something the demo should assert by choosing quietly.

## Verification

Verification is **committed and runnable**, not described. Three gates, plus a review aid:

```
node smartphrase/tools/verify.mjs                    # engine + pinned goldens
node smartphrase/tools/build-library-subset.mjs --check   # generated file is unmodified
NODE_PATH=<dir>/node_modules node smartphrase/tools/verify-ui.mjs   # real DOM, needs jsdom
node smartphrase/tools/diff-goldens.mjs --summary     # review aid, not a gate
```

- **`verify.mjs` — engine, no DOM.** Loads the demo's browser IIFEs under Node via `vm` and, for every
  instance in **every registered study**, checks: resolution has no errors in every available language;
  every `sliceKey` is filled; the `acdc:macro` dialect round-trips byte-equal; no trace leaves an
  unfilled `⟨token⟩`; every phrase used is valid for the instance's template; and no phrase falls back
  to English in a non-English pack. Every instance must declare an estimand and a typed `analysisRole`,
  and each estimand must have **exactly one** `MainEstimator`. Traces run only for roles the instance
  actually uses, focused per bound concept, and must leave neither an unfilled `⟨token⟩` nor a surviving
  `{token}`. Planted faults that must all be rejected: unknown concept, unknown phrase ref, missing
  wrapper, a summary measure the bound method cannot produce, an unknown output class, and an ICE phrase
  asserting a strategy its event declares no handling for. Also asserts the proposed overlay resolves, is
  flagged, declares only outputs its method really has, splices its roles at the declared position, does
  not mutate the generated subset, and covers each of the five `IchE9R1Strategy` values exactly once.
- **Goldens.** 86 outputs (sentences per language, constructed model views, tag source, JSON-LD, traces)
  are pinned in `tools/goldens.json`, **captured from behaviour** rather than hand-written, and compared
  on every run. This is what let the engine generalisation (D10) be proven non-breaking: a leaf-level
  diff showed the *only* change across all pinned outputs was an intended float-formatting fix.
- **`diff-goldens.mjs` — a review aid, not a gate.** Because goldens are captured from behaviour, the
  question after `--update-goldens` is never "are they right?" but "did anything move that I did not
  intend?" — which a textual diff of two large JSON blobs cannot answer. This walks both trees and reports
  one line per changed **leaf**, so an intended addition reads as *N × ADDED* and an accidental edit is
  impossible to miss. It is how each recapture in this extension was reviewed.
- **`verify-ui.mjs` — real DOM.** Loads the actual `index.html` in jsdom and walks both studies through
  all four stops: study switch, prose rendering, hover inspect, click-to-trace, model→SAP edit (change
  the endpoint and assert prose *and* trace follow), tag source regeneration, JSON-LD well-formedness,
  the reuse grid's per-study grouping and proposed badges, the identifier table, and EN/FR/DE. It also
  walks the two-ICE instance, clicking each ICE chip in turn to prove the **trace focus** works through
  the real DOM — each reaches its own dataset, and neither the other ICE nor the endpoint concept shadows
  it. Fails on any console error. jsdom is dev-only and deliberately not vendored — the demo itself stays
  zero-install, and the script exits 2 with install instructions when jsdom is absent.

Both the alpha float artefact and a real bug in the proposed-provenance note (it read the raw generated
global instead of the merged library, so it would never have rendered) were found by these gates rather
than by inspection.

## Estimands and intercurrent events

> Delivered on branch `estimands_01` under issue
> [#11](https://github.com/cdisc-org/analysis-concepts/issues/11), a sub-issue of #9. That issue states
> the requirements. The approach recorded here during #9 was **revised in five places** once the code and
> the upstream schema were read against it — see D11–D15, each of which records what the planned design
> got wrong and why.

The model side already existed on `methods_02` (eSAP: `Estimand`, `IntercurrentEvent`, the reified
`IceHandling` triple with `implementedBy`, the `IchE9R1Strategy` enum, `Analysis.analysisRole`,
`Analysis.summarizedByOutputClass`; and `model/linkML/intercurrent-event-derivation.md` for the
ascertainment-vs-handling split). What was missing was the phrase layer over it, and the mapping turned
out to be additive — no architectural change to the one-state design.

**How the five ICH E9(R1) attributes are carried.** Four were already covered by v0.7 roles without anyone
designing for it: treatment → `grouping`, variable → `endpoint`/`parameter`/`timepoint`, population →
`population`. Attribute 4 (intercurrent-event handling) and attribute 5 (the population-level summary) are
the two new roles. The estimand itself is **instance-level metadata**, not a phrase — the instance grounds
in a `usdm:Estimand` IRI as it already grounds in an objective.

**One smartphrase per strategy**, the strategy carried in `anchors.icheStrategy` as an `IchE9R1Strategy`
enum value so model→SAP is a lookup rather than string surgery on the OID:

| Phrase | English template | Implementation pattern |
|---|---|---|
| `SP_ICE_TREATMENT_POLICY` | regardless of {ice} | *none* — data used as observed |
| `SP_ICE_HYPOTHETICAL` | as if {ice} had not occurred | imputation |
| `SP_ICE_COMPOSITE` | with {ice} treated as {outcome} | derivation |
| `SP_ICE_WHILE_ON_TREATMENT` | using measurements taken prior to {ice} | censoring |
| `SP_ICE_PRINCIPAL_STRATUM` | in the stratum of participants in whom {ice} would not occur | population subsetting |

The `implementation` values are taken from `IceHandling.implementedBy`'s own upstream documentation, so the
phrase and model layers name the same patterns. `{ice}` binds a new registry kind **IntercurrentEvent**,
which carries strategy-independent `ascertainedBy` (an `OccurrenceCriterion` path, BC-headed) and hence its
own trace axis.

**What is exercised, and what is not.** All five strategies are authored, so the enum is fully covered, but
only two are bound by worked instances:

| Strategy | Exercised? | Note |
|---|---|---|
| TreatmentPolicy | yes — PrE0102 (real) and CDISC Pilot | `implementedBy: []` is correct, not missing |
| Hypothetical | yes — CDISC Pilot, implemented by `T.LOCF_Imputation` | real upstream v0.7 content |
| WhileOnTreatment | no | needs a censoring derivation; none in v0.7 |
| Composite | no | needs a folding derivation and an `Outcome` concept kind |
| PrincipalStratum | no | needs population subsetting driven by a counterfactual |

`SP_ICE_HYPOTHETICAL` is deliberately **excluded** from `T.PFS_KaplanMeier`'s valid-phrase set for exactly
this reason: with no imputation or censoring derivation on that template, offering it would be prose the
model cannot honour. That conditional template validity is enforced, not documented — `resolveBinding`
rejects an ICE phrase whose event declares no handling for the asserted strategy.

**Prose delivered** (CDISC Pilot primary, all five attributes):

> *Change from baseline in Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items)
> (ADAS-Cog(11)) at Week 24 in the efficacy (intent-to-treat) population comparing treatment groups,
> **as if discontinuation of study treatment had not occurred** and **regardless of use of concomitant AD
> medication**, using ANCOVA with 95% confidence intervals adjusting for baseline ADAS-Cog(11),
> **summarised as the difference in least-squares means**, will be assessed as the primary analysis.*

**Per-estimand override.** `AC.SENS.ADASCOG.TP` shares the primary's estimand *and* its ICE concept,
applying `TreatmentPolicy` where the primary applies `Hypothetical`. One event, two handlings, no second
copy of the event — and the implementer follows the strategy automatically. The model view flags it
`isOverride: true` against the event's study-default strategy, so a divergence is stated rather than
silent.

**The real intercurrent event is PrE0102's.** The CDISC Pilot has no protocol-defined ICE list, so its two
events are constructed and marked `ILLUSTRATIVE — not from a source SAP`. PrE0102's is quoted, and so is
its handling and its summary measure:

- SAP §4.3 — *"Subjects who discontinue everolimus/placebo because of suspected everolimus-associated
  toxicity should continue treatment with fulvestrant alone until disease progression."*
- SAP §4.3 — *"All subjects who have discontinued protocol therapy will be followed for survival and for
  progression, even if protocol therapy was discontinued because of toxicity or for other reasons."*
  → an explicit **TreatmentPolicy**, stated in prose in a published SAP.
- SAP §7.7.2 — *"Median time and 90% confidence interval … using Kaplan-Meier estimates"* → summary
  measure `median_survival`.

Requirement 6 (the same ICE handled two ways) is **not** in PrE0102 — its own sensitivity analysis changes
the *population*, not a strategy — which is why the override lives on the Pilot rather than being invented
for the real document and breaking the `sapRef` discipline every PrE0102 concept follows.

**The i18n stress test found a real limit.** German assigns a **case** to the ICE noun phrase, and the case
differs by strategy: the natural *"unabhängig von {ice}"* and *"vor {ice}"* demand the dative while
*"als ob {ice} … wäre"* demands the nominative — and one concept `name` cannot be both. Per-language
phrase templates (D7) cannot fix this; it needs per-case declined forms the registry does not carry. It is
resolved here by choosing nominative-compatible constructions for all five strategies, so a single
nominative name serves every one. A language with richer case marking than German would strain this
further, and that is worth putting to the working group.

## Second worked study — PrE0102 (metastatic breast cancer)

The CDISC Pilot passage demonstrates reuse *within* one study and one therapeutic area. A second study
was added to show the same building-block mechanism holding across therapeutic areas and across endpoint
types — a stronger form of claim 3.

Source: **PrECOG PrE0102**, Final SAP 24 March 2014, converted to Markdown in [`SAP/`](SAP/) alongside
the original PDF. The encoded passage is the PFS primary analysis (SAP §3.1 objective, §5.3 definitions,
§7.7.2 methodology). Every study concept carries a `sapRef` quoting the source sentence it came from.

What this surfaced, and why it matters:

- **The SAP's analysis is descriptive.** §7.7.2 asks for Kaplan-Meier medians with 90% confidence
  intervals by arm. There is no log-rank test, no p-value and no alpha anywhere in the 36-page document.
  Upstream `T.OS_LogRank` is a hypothesis test (it outputs `chi_squared_test_result`) and does not fit,
  and v0.7 has no descriptive Kaplan-Meier template — hence `T.PFS_KaplanMeier` and D8. **A real SAP
  needed a library addition**, which is itself a finding worth putting to the working group: the phrase
  layer was largely sufficient (`SP_TTE_ENDPOINT`, `SP_METHOD_KM`, `SP_STRATIFICATION` already existed,
  unused), but the template layer was not.
- **The engine was more ANCOVA-coupled than it looked.** See D10 — the coupling was invisible to a search
  for "ANCOVA" because it was expressed through phrase OIDs and a literal formula string.
- **Reuse is now two-dimensional.** Within PrE0102, four analyses share the one template, varying the
  event (PFS / OS / TTP) and the population — the ITT instance is the SAP's *own* sensitivity analysis
  (§7.7.2), not an invented variation. Across studies, two templates from one library.
- **A time-to-event trace looks different.** `DC.TTE → AVAL → ADTTE.AVAL where PARAMCD='PFS' →
  adtte.xpt`, with `CNSR` travelling alongside the analysis value, and no analysis-visit tier at all.
  The trace-chain-per-role design absorbed this without engine changes because chains live in the study
  layer (D9).

## Deliberately out of scope / future

- A real LinkML-emitted `@context` (the hand-written context stands in for it).
- Web Annotation-style anchoring for documents authored *outside* the tool (the document-first path).
- Validated translations and full morphological handling (elision, agreement, **case declension** — see
  the German ICE finding above) — D7 demonstrates the mechanism with illustrative FR/DE copy; production
  language packs are a terminology-management deliverable.
- **The three unexercised E9(R1) strategies** (Composite, WhileOnTreatment, PrincipalStratum). The phrases
  exist and the enum is fully covered, but each needs library content v0.7 does not have — a folding
  derivation, a censoring derivation, and counterfactual population subsetting respectively. Binding them
  without an implementer is refused by design, not left to chance.
- **Multiplicity, `MultiplicityStrategy` and `Hypothesis`.** Adjacent in the eSAP model and deliberately
  not bundled with the estimand work.
- **Estimand *selection* guidance** — which strategy is clinically appropriate. This layer expresses a
  chosen estimand; it does not recommend one.
- Overlapping annotations, versioning, and schema validation of the instance graph.
- **A generic formula resolver.** Study-variable expressions dispatch on method (D10) because the library
  does not declare a measure→ADaM-variable mapping. Adding one upstream would let the expression be
  derived from `formula.generic_expression` instead.
- **Upstreaming the proposed overlay** to `methods_02` — `T.PFS_KaplanMeier`, the two new roles, the six
  new phrases, and `T.CFB_ANCOVA`'s widened valid-phrase set — and the governance question of who accepts
  contributions into the library. Two new **roles** is a larger ask than a template: it is a library minor
  version, and it forced all three language packs' sentence templates to change.
