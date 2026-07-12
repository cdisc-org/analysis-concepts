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
and `lib/methods/analyses/M_ANCOVA.json` at `methods_02@ffee5df` (Transformation Library v0.7, Method
schema v0.9.1) — provenance is recorded in the file and shown in the demo. The study layer
(`demo/data/study-graph.js`) is hand-crafted and marked illustrative.

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
| Phrase templates, roles, transformation templates, method definition | `methods_02@ffee5df`, generated subset | authoritative (for this PoC) |
| STATO method IRI (`STATO_0000176`) | STATO/OBO | authoritative |
| Study concepts, USDM/ARS/NCIt instance ids, trace tiers, document shell | hand-crafted for CDISC Pilot | illustrative, flagged in-UI |
| `acdc:macro` dialect | methods_02 authoring experiment | design input, revisable |

## Verification

- **Engine (Node, no DOM):** all three instances resolve with 0 errors and the primary reproduces the
  known-good sentence; the constructed model view fills sliceKeys/slices correctly; all five trace roles
  reach the right `.xpt`; the tag dialect round-trips byte-equal; planted faults (invalid phrase for
  template, unbound required slot, out-of-range value) are all caught; JSON-LD projection well-formed.
- **Demo (headless Chrome, puppeteer):** 21 end-to-end checks covering chip rendering, hover inspect,
  click-to-trace, model→SAP edits, SAP→model edits via chips and via tag source, validator accept/reject
  (state untouched on reject), reuse cards with binding diffs, open-in-editor, trace following the loaded
  instance, standards table and provenance. All pass; no console errors.
- **i18n (both layers):** EN output is byte-identical to the pre-i18n renderer; FR/DE resolve all three
  instances with zero errors; the German verb bracket is produced by the sentence template (frame text,
  not chips); switching language leaves the tag source and JSON-LD byte-identical (the graph already
  carries all languages as tagged literals); model edits re-render correctly in the active language.
  15 further browser checks, all passing.

## Planned extension — estimands and intercurrent events

The model side already exists on `methods_02` (eSAP: `Estimand`, `IntercurrentEvent`, the reified
`IceHandling` triple with `implementedBy`, the `IchE9R1Strategy` enum, `Analysis.analysisRole`,
`Analysis.summarizedByOutputClass`; and `model/linkML/intercurrent-event-derivation.md` for the
ascertainment-vs-handling split). What is missing is the phrase layer over it. The mapping is
additive to this design — no architectural change:

- **The estimand is the analysis-instance level, not a phrase.** Four of the five ICH E9(R1)
  attributes map onto existing roles (treatment → `grouping`, variable → `endpoint`/`parameter`/
  `timepoint`, population → `population`); the instance grounds in a `usdm:Estimand` IRI as it
  grounds in an objective today. Correction that falls out: the instance's free-string
  `sentenceRole` should bind to the typed `Analysis.analysisRole`
  (MainEstimator | SensitivityAnalysis | SupplementaryAnalysis).
- **Two new roles** (a library minor-version event): `ice_handling` — repeating, like `covariate` —
  and `summary_measure` (E9(R1) attribute 5), whose phrase binds to a **method output** the bound
  method provably produces (`summarizedByOutputClass` is the model hook), e.g. M.ANCOVA's
  `contrasts_t` → "difference in least-squares means".
- **One smartphrase per E9(R1) strategy** (`SP_ICE_TREATMENT_POLICY` "regardless of {ice}",
  `SP_ICE_HYPOTHETICAL` "as if {ice} had not occurred", `SP_ICE_COMPOSITE` "with {ice} treated as
  {outcome}", `SP_ICE_WHILE_ON_TREATMENT` "using measurements taken prior to {ice}",
  `SP_ICE_PRINCIPAL_STRATUM` "in the stratum of participants in whom {ice} would not occur"), the
  strategy carried in `anchors`. `{ice}` is a `concept_ref` to a new registry kind
  **IntercurrentEvent** grounding in `usdm:IntercurrentEvent` — which brings its
  strategy-independent `ascertainedBy` (OccurrenceCriterion path or derivation) along for the
  **trace**: an ICE phrase traces ascertainment-side (BC criterion → source record → ICE flag +
  timing → dataset).
- **Strategy phrases change the shape of the instantiated model**, not just slice values — the
  first phrases to do so, and exactly what `IceHandling.implementedBy` receives: TreatmentPolicy →
  no modification; Hypothetical → inserts an imputation transformation; Composite → redefines the
  variable (a derivation producing a composite endpoint concept); WhileOnTreatment → adds a
  timing-bounded slice constraint; PrincipalStratum → changes the population definition.
  Model→SAP runs the reverse: each `IceHandling` resolves to its strategy's phrase with the ICE
  bound. Per-estimand overrides (primary Hypothetical vs sensitivity TreatmentPolicy on the *same*
  ICE) become two instances reusing one ICE concept — template reuse at estimand level.
- **Estimand-aware validation:** every declared ICE has exactly one strategy phrase; exactly one
  MainEstimator per estimand; the summary phrase names an output the method produces; conditional
  template-validity (e.g. `SP_ICE_HYPOTHETICAL` only where an imputation transformation exists to
  implement it).
- **i18n stress test:** the hypothetical strategy wants the German subjunctive ("als ob … nicht
  aufgetreten wäre") — per-language phrase templates (D7) already accommodate it.

Target prose:

> *Change from baseline in ADAS-Cog(11) at Week 24 in the efficacy population comparing treatment
> groups, **as if discontinuation of study treatment had not occurred** and **regardless of use of
> concomitant AD medication**, using ANCOVA … **summarised as the difference in least-squares
> means**, will be assessed as the primary estimand's main estimator.*

## Deliberately out of scope / future

- A real LinkML-emitted `@context` (the hand-written context stands in for it).
- Web Annotation-style anchoring for documents authored *outside* the tool (the document-first path).
- Validated translations and full morphological handling (elision, agreement) — D7 demonstrates the
  mechanism with illustrative FR/DE copy; production language packs are a terminology-management deliverable.
- Overlapping annotations, versioning, and schema validation of the instance graph.
