# Briefing: Is XHTML the right carrier for the smartphrase layer?

> Prepared for: Stuart Malcolm
> Date: 2026-06-18
> Context: Architectural review of issue #9 (smartphrase PoC), before reworking the plan.
> Status: Decision-support briefing — not a spec.

---

## 1. The question, framed correctly

The current draft picks **XHTML + two custom XML namespaces** (`sap:`, `smartphrase:`) as the carrier. Before we polish that, we should test whether it is the *right* carrier, or merely the most familiar one.

The first useful move is to notice that the design is conflating **two separable concerns**:

| Concern | Question it answers | Current answer |
|---------|--------------------|----------------|
| **(A) Carrier document** | What format holds the human-readable SAP prose and renders it? | XHTML |
| **(B) Linking mechanism** | How do spans of that prose bind to AC/DC model elements, and how is that link expressed/queried? | Bespoke inline XML namespace |

The current approach welds these together: the semantic links live *inline* in the prose as namespaced elements. Almost every option below is really a different combination of an (A) choice and a (B) choice. Keeping them separate is what makes the trade-offs visible.

The deeper truth: **this is a standoff/inline *semantic-annotation-over-a-knowledge-graph* problem**, not a document-schema problem. AC/DC is already a graph (LinkML model, STATO IRIs, Neo4j). The SAP is a human-readable *projection of, and authoring surface for, that graph*. That reframing should drive the technology choice.

---

## 2. What the carrier must actually do (evaluation criteria)

1. **Renders as a readable SAP with no tooling** — regulators read and print these; must work as `text/html` in any browser, and ideally print cleanly.
2. **Authoring reality** — SAPs are written by statisticians, today in Word against the TransCelerate template. Whatever we choose must have a credible path from how documents are *actually* produced.
3. **Semantic expressivity** — must link prose to *all* AC/DC layers (DataConcept, AC/DC instance + template, Method, Cube/Dimension/Measure/Attribute, Slice, Sentence), with typed roles and render modes.
4. **Graph-native linkage** — because AC/DC *is* a graph, the ideal mechanism lets the SAP contribute to / be queried against that same graph, rather than describing links in prose a tool must re-parse.
5. **Standards alignment & governance** — prefer a W3C/OASIS/CDISC standard over a bespoke `urn:cdisc:ac-dc:` vocabulary we must govern ourselves (review §1.2).
6. **Bidirectionality** — supports both model→SAP resolution and SAP→model instantiation.
7. **Overlap & standoff** — can one passage carry several links, or links that cross element boundaries, without distorting the prose?
8. **PoC cost** — self-contained HTML/JS demos, no server (issue #9 constraint).

---

## 3. The candidate technologies

### Group A — Document markup (text primary, common carrier = HTML/XHTML)

**A1. XHTML + custom XML namespaces** *(current draft)*
- **For:** clean, legible vocabulary; inline so prose and semantics are co-located; RELAX NG/XSD-validatable; maps 1:1 to the model's element names.
- **Against:** only parses correctly as `application/xhtml+xml` — under `text/html` the colon in `sap:foo` is *not* a namespace, and parsing is undefined/broken (review §1.3). Bespoke namespace = self-governed URIs (§1.2). Inline-only ⇒ no overlapping annotations, and the prose is polluted with markup that statisticians won't hand-author. Reinvents semantic annotation instead of using an existing standard.
- **Verdict:** Defensible *for a quick visual PoC*, but it is the **least standards-aligned** and most governance-heavy option, and it is the source of three separate review §1 issues.

**A2. HTML5 + `data-*` attributes**
- **For:** valid HTML5, renders anywhere as `text/html`; trivial CSS/JS hooks; no namespace/MIME problem.
- **Against:** `data-*` values are opaque strings — no schema, no graph semantics; you are still inventing a private convention, just in attributes instead of elements.
- **Verdict:** A pragmatic *carrier* fix for the MIME problem, but it does nothing for the *semantic* concern (B). Only interesting in combination with a real semantic layer (see A4/A5).

**A3. HTML5 custom elements (`<sap-…>`, `<sp-…>`)**
- **For:** valid HTML5, renders as `text/html`, web-component-friendly for the demos.
- **Against:** not XML (no XML tooling); still a bespoke vocabulary; element names diverge from the namespaced model.
- **Verdict:** A nicer carrier than A1 with the same *semantic* gap as A2. Good demo ergonomics, weak standards story.

**A4. HTML5 + RDFa 1.1** *(W3C Recommendation)*
- **For:** embeds real **RDF triples** inline in ordinary HTML attributes (`property`, `resource`, `typeof`, `prefix`). Renders as `text/html`. A standard RDFa processor extracts a graph directly — so the SAP *becomes part of the AC/DC graph* rather than describing links in prose. Native fit for a LinkML/STATO/Neo4j project. Governance solved: reuse existing IRIs.
- **Against:** verbose and fiddly to hand-author; inline (no overlap); authors need to understand RDF.
- **Verdict:** The most *semantically correct inline* option, and the one that aligns with where the model already is.

**A5. HTML5 + Microdata** *(HTML-native, schema.org lineage)*
- **For:** simpler than RDFa (`itemscope`/`itemprop`/`itemtype`); HTML-native; convertible to RDF.
- **Against:** less expressive than RDFa; the wider ecosystem has largely moved to JSON-LD; still inline.
- **Verdict:** A lighter A4. Rarely the best choice now that JSON-LD exists.

### Group B — Standoff / sidecar semantics (prose and semantics decoupled)

**B1. HTML5 carrier + embedded JSON-LD** (`<script type="application/ld+json">`)
- **For:** prose stays clean HTML (authorable, printable, renders anywhere); the semantic layer is a self-contained JSON-LD block that *is* a graph fragment. **JSON-LD is the dominant RDF serialization today, and LinkML emits a JSON-LD context for free** — so the AC/DC model can generate the context the SAP needs. Demos load the JSON-LD trivially. Lightweight DOM hooks (ids/`data-*`) anchor text spans to JSON-LD nodes.
- **Against:** needs an id/selector convention to tie a `<span>` to a JSON-LD node (this is essentially Web Annotation, B2); two artefacts to keep in sync.
- **Verdict:** **Strongest all-round fit for this project.** Clean carrier + graph-native semantics + zero bespoke governance + direct LinkML pipeline.

**B2. W3C Web Annotation Data Model** *(W3C Recommendation)*
- **For:** purpose-built standoff annotation. An annotation is a separate resource that *targets* a range of the document via selectors (TextQuote/XPath/CSS). Supports overlapping and multiple annotations on the same passage. Lets you annotate a SAP *exported from Word* without editing the prose at all — directly addressing the authoring-reality criterion.
- **Against:** range anchoring is brittle under text edits; conceptually heavier; needs an anchoring strategy.
- **Verdict:** The most principled answer to "how do we annotate documents we didn't author as XML." Pairs naturally with B1 (JSON-LD bodies). Strong candidate if **document-first** authoring wins the source-of-truth fork.

### Group C — Heavyweight document standards

**C1. DITA** *(OASIS)* — topic authoring with `conref`/`keyref` reuse and specialisation. Conceptually elegant: a smartphrase *is* a `keyref` to a managed key (the AC/DC element), and the SAP template *is* a reuse problem. **But** it needs a DITA toolchain to render (fails "renders with no tooling"), is heavy for a PoC, and statisticians won't author it. *Keep as prior art / inspiration, not the PoC carrier.*

**C2. DocBook / JATS-BITS / TEI** — TEI is the academic home of standoff text markup and worth citing as precedent; JATS/DocBook are publishing-oriented and add little over HTML here. *Reference only.*

### Group D — CDISC-ecosystem alignment (the strategic axis for this audience)

This is the dimension most likely to matter to the working group, and it cuts across A–C.

- **USDM (Unified Study Definition Model)** — CDISC's digital protocol model (DDF). SAP objectives/estimands/populations trace directly to USDM entities. The smartphrase `ref` to an objective or population *should arguably resolve into USDM*, not a private id space.
- **ARS (Analysis Results Standard)** — CDISC's machine-readable model of analyses, methods, operations, and where-clauses. **This overlaps heavily with what AC/DC and the smartphrase layer describe.** The "SAP→model" instantiation story is, in large part, "populate ARS/AC content."
- **Define-XML / Dataset-JSON / ODM** — transport standards for the physical-data layer the "trace" demo reaches into.
- **RDF/LinkML direction** — `Principles.md` commits AC/DC to **LinkML** precisely because USDM's UML is heavy. LinkML's deliverables include a **JSON-LD context, JSON Schema, OWL and SHACL**. This is a decisive signal: the project's own tooling is built to emit the very artefacts that make **JSON-LD/RDFa** cheap and natural — and makes a hand-rolled `urn:cdisc:ac-dc:` XML namespace an outlier.

**Implication:** whatever carrier we pick, the *identifiers and vocabulary* the smartphrase layer binds to should be IRIs from the AC/DC LinkML model (and, where they exist, USDM/ARS terms), not a parallel bespoke namespace. That single decision retires review §1.2, §3.8, §3.10 at once.

---

## 4. Comparison matrix

Scoring: ✓✓ strong · ✓ adequate · ✗ weak. (Criteria from §2.)

| Option | Renders no-tooling | Authoring reality | Semantic power | Graph-native | Standards/governance | Bidirectional | Overlap/standoff | PoC cost |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| A1 XHTML + namespaces *(current)* | ✗ (MIME) | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓✓ |
| A2 HTML5 + `data-*` | ✓✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓✓ |
| A3 HTML5 custom elements | ✓✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓✓ |
| A4 HTML5 + RDFa | ✓✓ | ✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✗ | ✓ |
| A5 HTML5 + Microdata | ✓✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| **B1 HTML5 + JSON-LD** | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓ | ✓✓ |
| B2 Web Annotation | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓ |
| C1 DITA | ✗ | ✗ | ✓✓ | ✓ | ✓✓ | ✓ | ✓ | ✗ |

---

## 5. Recommendation

**Headline: XHTML + custom namespaces is the weakest of the credible options for anything beyond a throwaway demo. Move the carrier to plain HTML5 and the semantics to JSON-LD grounded in the AC/DC LinkML model.**

Concretely, a two-speed recommendation:

- **Target architecture (what the spec should describe):**
  **HTML5 carrier + JSON-LD semantic layer (B1), with identifiers drawn from the AC/DC LinkML model and, where applicable, USDM/ARS.** Lightweight `data-sp-*` hooks (A2) anchor prose spans to JSON-LD nodes. If the source-of-truth fork lands on **document-first**, layer the **Web Annotation model (B2)** on top so SAPs exported from Word can be annotated without rewriting them as XML.
  - Retires review §1.1 (semantics are a real graph, not prose constraints), §1.2 (no bespoke namespace), §1.3 (`text/html`, no MIME trap), §3.8/§3.10 (vocabulary is the model's IRIs, not a private library filename).

- **PoC shortcut (if we need pixels this week):**
  Keep an HTML5 carrier so the demos render anywhere, but **do not invest further in the `sap:`/`smartphrase:` XML namespace**. Even at PoC scale, A3 (custom elements) + a small JSON-LD sidecar gets the hover/resolve/trace demos working with a clean upgrade path, and avoids hardening a design we intend to drop.

**Why not just fix XHTML (add the MIME section, a RELAX NG schema, a project URI)?** That work is real but it polishes the option that scores worst on the dimensions that matter most to *this* project — graph-nativeness and CDISC/standards alignment. We'd be governing a bespoke vocabulary that duplicates what LinkML already emits.

**Honest case for keeping XHTML:** it is the lowest-friction way to get a legible, self-contained artefact in front of the working group quickly, and inline markup is easy to read on a slide. If the goal of #9 is purely an illustrative demo and *not* a foundation, A1/A3 is fine. The recommendation above assumes #9 is meant to seed the real architecture.

---

## 6. How this intersects the source-of-truth fork

The carrier choice and the (unanswered) source-of-truth fork are coupled:

| Source of truth | Best-fit carrier/linking |
|-----------------|--------------------------|
| **Model-first** (SAP is a generated view) | B1 — model emits JSON-LD + renders HTML; smartphrases are read-only resolutions. Cleanest. |
| **Document-first** (author prose, extract model) | B2 over B1 — standoff annotation of Word-exported HTML; instantiation walks annotations. |
| **Co-equal bidirectional** | B1+B2 with explicit reconciliation; most powerful, most spec to write. |

So: **deciding the carrier and the source-of-truth question together is more efficient than sequentially.**

---

## 7. Decision points for you

1. **Is #9 a throwaway illustration, or the seed of the real architecture?** (Determines whether we even bother moving off XHTML.)
2. **Do you accept "HTML5 carrier + JSON-LD grounded in the LinkML model" as the target?** (My recommendation.)
3. **Should smartphrase identifiers resolve into USDM/ARS where those standards already cover the entity, rather than a private AC/DC id space?** (Strategic alignment for the working group.)
4. **Source-of-truth fork** — model-first / document-first / co-equal? (Still open from the last discussion; couples to #2.)

Answer 1–4 and I will rework the #9 plan and deliverables around the chosen architecture.
