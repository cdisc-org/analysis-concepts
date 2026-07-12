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

## Deliberately out of scope / future

- A real LinkML-emitted `@context` (the hand-written context stands in for it).
- Web Annotation-style anchoring for documents authored *outside* the tool (the document-first path).
- Validated translations and full morphological handling (elision, agreement) — D7 demonstrates the
  mechanism with illustrative FR/DE copy; production language packs are a terminology-management deliverable.
- Overlapping annotations, versioning, and schema validation of the instance graph.
