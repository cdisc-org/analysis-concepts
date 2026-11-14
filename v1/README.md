# Analysis Concepts — candidate v1

A proposal for working-group review, not an agreed standard.
Tracking issue: [#15](https://github.com/cdisc-org/analysis-concepts/issues/15).

Analysis Concepts (AC) says, in a form a machine can read, how clinical trial
data is derived and analysed. This tree brings the model work on three branches
(`model-schema`, `methods_02`, `estimands_01`) into one LinkML model with five
layers, its libraries, two worked studies and a conformance suite.

Start with **[docs/overview.md](docs/overview.md)**.

## What is here

| Folder | Contents |
| --- | --- |
| `schema/` | The LinkML model, one file per layer |
| `json_schema/` | JSON Schema generated from it |
| `lib/statistics/` | 57 statistics, 13 statistic sets, 43 output classes |
| `lib/methods/` | 60 methods (14 model-based, 25 aggregation, 21 derivation) |
| `lib/concepts/` | One concept library, 108 concepts |
| `lib/transformations/` | 26 transformation templates |
| `lib/smartphrases/` | 31 phrases in 10 roles; English, French and German language packs |
| `lib/bindings/` | Class-level data bindings: 49 ADaM, 72 SDTM |
| `lib/implementations/` | R and SAS method implementations (informative) |
| `studies/` | CDISC Pilot and PrE0102, as study analysis sets |
| `tools/` | Migration scripts, validator, sentence renderer, dependency and data resolver |
| `tests/` | 69 conformance tests |
| `docs/` | Overview, model reference, worked examples, conformance rules, decisions, migration notes, gaps, glossary |

## Check it

```
uv venv .venv --python 3.12 && source .venv/bin/activate
uv pip install linkml pytest
python -m pytest v1/tests -q          # 69 tests
python v1/tools/validate.py --all     # 0 errors; warnings listed
python v1/tools/render.py cdiscpilot01 fr     # the analysis sentences, in French
python v1/tools/resolve.py pre0102            # derivations and study variables per analysis
```

To rebuild the libraries from the source branches (needs `git fetch origin`
and Node.js): `python v1/tools/migrate_all.py`.

## Status

Everything validates and every reference resolves. The content has not been
reviewed by the working group or by a statistician, and some of it is marked
`provisional`. See [docs/final-report.md](docs/final-report.md) for what was
built and [docs/gaps.md](docs/gaps.md) for what is missing.

Nothing outside `v1/` is part of the candidate. It is the earlier content of
the branch, kept for reference.
