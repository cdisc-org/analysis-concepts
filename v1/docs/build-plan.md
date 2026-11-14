# Candidate v1 build plan

Tracking issue: [#15](https://github.com/cdisc-org/analysis-concepts/issues/15).
Decisions this plan follows: [decisions.md](decisions.md). Live progress: [STATUS.md](STATUS.md).

## Goal

One consolidated, validated LinkML model of Analysis Concepts (AC), with its
libraries and two worked studies, in a single self-contained tree (`v1/`) on the
`candidate_v1` branch. It is a proposal for working-group review.

## Where the content comes from

| Source branch | What is taken |
| --- | --- |
| `model-schema` (the branch this one starts from) | The LinkML method, statistic and statistic-set schemas (Richard Marshall, Edwin van Stein). These are the base of the v1 method layer. R and SAS implementation catalogues |
| `methods_02` | 60 method instances, statistics vocabulary, statistic sets, output classes, Transformation Library v0.7, the three concept models and the unified-concept spike, concept-to-variable mappings |
| `estimands_01` | SmartPhrase library additions, study analysis instances, estimand and intercurrent-event handling, document anchors, two worked studies |

Everything already on the branch outside `v1/` is left untouched as the legacy
reference. Nothing in `v1/` depends on it.

## Layout

```
v1/
  schema/        LinkML sources, one file per layer
  json_schema/   generated from schema/ (never edited by hand)
  lib/           libraries: statistics, methods, concepts, transformations,
                 smartphrases, bindings, implementations
  studies/       worked study analysis sets (CDISC Pilot, PrE0102)
  tools/         migration scripts and the validator
  tests/         conformance tests (pytest)
  docs/          overview, per-layer reference, decisions, glossary, gaps
```

## Phases

1. **Plan and decisions** — this file, the decisions log, the status file.
2. **Trial migration** — convert a representative set of methods (ANCOVA, MMRM,
   Kaplan-Meier, log-rank, subtraction, aggregation, mean) into the base method
   schema, and test that Transformations, Concepts and SmartPhrases can still
   bind to them. Record every place the base schema needed an extension or a
   fallback.
3. **Method layer** — schemas and all 60 methods, statistics, statistic sets,
   output classes.
4. **Concept layer** — unified concept schema and library.
5. **Transformation layer** — schema and the template library.
6. **SmartPhrase layer** — schema and phrase library.
7. **Implementation layer** — data-binding schema and CDISC bindings;
   implementation catalogues (informative).
8. **Study layer** — study analysis instance schema; CDISC Pilot and PrE0102.
9. **Conformance** — validator and tests for cross-references, layer rules and
   interface satisfaction; one command runs everything.
10. **Documentation and final report.**

## Working rules

- Push only to `candidate_v1`. No other branch is changed.
- Where a choice is needed, make it, record it in the decisions log as
  provisional, and continue.
- Where the base method schema cannot carry something the rest of the model
  needs, prefer a small, named extension to the schema; fall back to the
  `methods_02` form only when an extension is not enough. Both are logged in
  [migration-notes.md](migration-notes.md).
- Migration is done by scripts in `tools/`, so it can be re-run and reviewed.

## How to check the build

```
uv venv .venv --python 3.12 && source .venv/bin/activate
uv pip install linkml pytest
python v1/tools/build.py      # regenerate JSON Schema
python -m pytest v1/tests -q  # all conformance checks
```
