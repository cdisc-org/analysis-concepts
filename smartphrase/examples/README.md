# Examples

Worked SAP encodings for the smartphrase PoC (issue #9).

## Committed PoC carrier — `sap:` / `smartphrase:` XHTML

- `cdisc-pilot-sap.xhtml` — CDISC Pilot SAP in the `sap:` + `smartphrase:` XHTML structure (the carrier chosen for this PoC). *Stub — full document encoding still to do.*
- `breast-cancer-sap.xhtml` — second study. *Deferred until a source SAP is supplied.*

## B1 reference sketches — HTML5 carrier + JSON-LD (illustrative, not the PoC carrier)

These accompany [`../spec/format-evaluation.md`](../spec/format-evaluation.md), which evaluates carrier
formats and recommends **HTML5 + JSON-LD grounded in the AC/DC LinkML model** as the longer-term target.
They are *comparison artefacts* so the working group can see the alternative concretely — the committed
PoC deliberately stays on the XHTML carrier above.

- **`cdisc-pilot-sap.b1-sketch.html`** — the static reference. Plain, valid HTML5 prose that renders with
  **no script and no namespaces**, plus a `<script type="application/ld+json">` graph fragment. Spans carry
  `data-sp-ref` hooks into graph nodes; identifiers are IRIs into USDM / ARS / STATO / NCIt + AC/DC LinkML.

- **`cdisc-pilot-sap.b1-i18n.html`** — the interactive companion. The same graph, with the prose
  **generated from it** and an EN / FR / DE language switch. Demonstrates the internationalisation argument:
  concept labels are `@language`-tagged literals (the RDF-native way, much of it inheritable from CDISC/NCIt
  codelists), and word order is handled by per-language *sentence* templates — the real linguistic cost the
  smartphrase spec must own, independent of carrier. Translations are illustrative, not validated copy.

### How the two carriers compare

| | `sap:`/`smartphrase:` XHTML *(PoC)* | HTML5 + JSON-LD *(B1 sketch)* |
|---|---|---|
| Prose | namespaced elements inline | plain HTML5 + `data-sp-ref` hooks |
| Serves as | `application/xhtml+xml` only | `text/html` anywhere |
| Semantics | attributes a tool re-parses | a real RDF graph |
| Identifiers | private IDs | USDM / ARS / STATO / LinkML IRIs |
| i18n | one `xml:lang` per document | language-tagged literals + per-language templates |

> The `@context` shown is hand-written for readability; in practice it would be the context the AC/DC
> LinkML model **emits**. Some bindings are denormalised inline for legibility.
