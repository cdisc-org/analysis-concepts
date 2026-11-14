# Build status

This file is the build's own memory: it says what is done and what comes next,
so the work can be picked up from here at any point.

| Phase | State |
| --- | --- |
| 1 Plan and decisions | done |
| 2 Trial migration | done — no fallbacks; five small schema extensions (see migration-notes.md) |
| 3 Method layer | done — 60 methods, 57 statistics, 13 statistic sets, 43 output classes; all validate |
| 4 Concept layer | done — one library, 106 concepts; validates |
| 5 Transformation layer | done — 26 templates; validates |
| 6 SmartPhrase layer | done — 31 phrases, 10 roles, 3 language packs; validates |
| 7 Implementation layer | next |
| 8 Study layer | not started |
| 9 Conformance | not started |
| 10 Documentation and final report | not started |

## Notes for resuming

- Work only on branch `candidate_v1`; push only there.
- Environment: `.venv` in the repo root (Python 3.12, linkml, pytest).
- Sources are read with `git show origin/<branch>:<path>`; nothing is checked out.
