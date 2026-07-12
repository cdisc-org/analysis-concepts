# Smartphrase — SAP ↔ AC/DC model linkage (PoC)

Proof of concept for issue [#9](https://github.com/cdisc-org/analysis-concepts/issues/9): spans of SAP
prose bound to AC/DC model metadata so the prose and the model are **two views of one thing**.

## Run the demo

Open [`demo/index.html`](demo/index.html) in any browser — double-click it. No server, no install.

The demo is one page with four stops:

1. **The passage** — a SAP analysis passage; hover any smartphrase to inspect the model behind it,
   click to trace it down to the physical dataset.
2. **Two views, one thing** — edit the model and the prose follows; edit the prose (chips or the
   editable tag source) and the model follows. Tabs show the constructed model instance, the tag
   source and the JSON-LD graph — all projections of one state object.
3. **Template reuse** — three analyses instantiating the *same* library template `T.CFB_ANCOVA`
   with different bindings.
4. **Standards grounding** — every identifier and the standard it resolves into (USDM / ARS / STATO /
   NCIt / AC-DC), with illustrative ids flagged.

## Contents

| Path | What |
|---|---|
| `DESIGN.md` | Design record — architecture, decisions, rationale, verification |
| `GETTING-STARTED.md` | For integrators (embed smartphrases in your own tooling) and standards managers (build reusable phrase libraries, e.g. per therapeutic area) |
| `REFERENCE.md` | Reference guide — every structure, algorithm and engine function of the smartphrase layer |
| `WALKTHROUGH.md` | Working-group session script |
| `demo/index.html` | The integrated demo (single page) |
| `demo/engine.js` | Pure-function engine: resolve / construct / trace / tag dialect / JSON-LD |
| `demo/data/acdc-library.js` | **Generated** verbatim subset of the `methods_02` library (v0.7) — do not hand-edit |
| `demo/data/study-graph.js` | Illustrative study layer: CDISC Pilot concepts, instances, trace tiers |
| `spec/format-evaluation.md` | Carrier-format analysis (retained from the first PoC round) |

The authoritative model source is the **`methods_02` branch** (Transformation Library v0.7, Method
schema v0.9.1); `acdc-library.js` records the exact commit it was generated from.
