# Smartphrase — SAP ↔ AC/DC model linkage (PoC)

Proof of concept for issues [#9](https://github.com/cdisc-org/analysis-concepts/issues/9) and
[#11](https://github.com/cdisc-org/analysis-concepts/issues/11): spans of SAP prose bound to AC/DC model
metadata so the prose and the model are **two views of one thing** — extended to carry a full ICH E9(R1)
estimand, intercurrent events included.

## Run the demo

Open [`demo/index.html`](demo/index.html) in any browser — double-click it. No server, no install.

The demo is one page with four stops:

1. **The passage** — a SAP analysis passage; hover any smartphrase to inspect the model behind it,
   click to trace it down to the physical dataset.
2. **Two views, one thing** — edit the model and the prose follows; edit the prose (chips or the
   editable tag source) and the model follows. Tabs show the constructed model instance, the tag
   source and the JSON-LD graph — all projections of one state object.
3. **Template reuse** — two dimensions of it: within each study, several analyses instantiate the
   *same* library template with different bindings; across studies, different templates come from the
   one library. Use the **study switch** at stop 1 to move between the CDISC Pilot (change from
   baseline, ANCOVA) and PrECOG PrE0102 (progression-free survival, Kaplan-Meier).
4. **Standards grounding** — every identifier and the standard it resolves into (USDM / ARS / STATO /
   NCIt / AC-DC), with illustrative ids flagged.

**Estimands.** The CDISC Pilot primary passage carries all five ICH E9(R1) attributes: four fall on
existing phrase roles, and intercurrent-event handling plus the summary measure are two roles added for
#11. Each intercurrent event traces on its own axis — through the occurrence criterion that ascertains it,
rather than through an analysis value — and the reuse grid shows one event handled two ways by two
*estimands* — a primary and a sensitivity estimand sharing the event concept rather than copying it,
because changing an event's strategy changes E9(R1) attribute 4 and therefore the estimand itself.

## Contents

| Path | What |
|---|---|
| `DESIGN.md` | Design record — architecture, decisions, rationale, verification |
| `GETTING-STARTED.md` | For integrators (embed smartphrases in your own tooling) and standards managers (build reusable phrase libraries, e.g. per therapeutic area) |
| `REFERENCE.md` | Reference guide — every structure, algorithm and engine function of the smartphrase layer |
| `WALKTHROUGH.md` | Working-group session script |
| `demo/index.html` | The integrated demo (single page) |
| `demo/engine.js` | Pure-function engine: resolve / construct / trace / tag dialect / JSON-LD |
| `demo/data/acdc-library.js` | **Generated** verbatim subset of the `methods_02` library (v0.7) — do not hand-edit; regenerate with `tools/build-library-subset.mjs` |
| `demo/data/acdc-library-proposed.js` | **Proposed** library additions not yet upstream — `T.PFS_KaplanMeier`, the `ice_handling` / `summary_measure` roles, the five ICH E9(R1) strategy phrases and `SP_SUMMARY_MEASURE` — badged in the UI |
| `demo/data/study-graph.js` | Illustrative study layer: CDISC Pilot concepts, instances, trace tiers |
| `demo/data/study-graph-pre0102.js` | Illustrative study layer: PrE0102 breast cancer (time-to-event) |
| `SAP/` | Source SAP for PrE0102 — original PDF plus a Markdown conversion split by section |
| `tools/build-library-subset.mjs` | Regenerates the library subset from `methods_02`; `--check` asserts no hand-edits |
| `tools/verify.mjs` | Engine + pinned-golden gate (no DOM, no dependencies) |
| `tools/verify-ui.mjs` | Headless DOM walkthrough of the demo (needs jsdom; dev-only) |
| `tools/diff-goldens.mjs` | Leaf-by-leaf review of a golden recapture — a review aid, not a gate |
| `demo/data/lang-overlay.js` | EN/FR/DE language packs: per-language sentence templates, phrase translations, label overlays (illustrative) |
| `spec/format-evaluation.md` | Carrier-format analysis (retained from the first PoC round) |

## Verify

```bash
node smartphrase/tools/verify.mjs                          # engine + 86 pinned outputs
node smartphrase/tools/build-library-subset.mjs --check    # generated file unmodified
NODE_PATH=<dir>/node_modules node smartphrase/tools/verify-ui.mjs   # real DOM (needs jsdom)
```

After `verify.mjs --update-goldens`, review what moved:

```bash
node smartphrase/tools/diff-goldens.mjs --summary
```

The demo itself stays zero-install; jsdom is needed only by the optional UI check, which exits 2 with
install instructions if it is absent.

The authoritative model source is the **`methods_02` branch** (Transformation Library v0.7, Method
schema v0.9.1); `acdc-library.js` records the exact commit it was generated from.
