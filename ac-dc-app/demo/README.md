# PFS demo — recording, script and verification

A ~6½ minute silent walkthrough of the eSAP workflow, built for a voice artist to
narrate. Recorded against the Breast Cancer Study PrE0102 (NCT01797120) and its
primary endpoint, progression-free survival.

| File | What it is |
|---|---|
| `esap-pfs-demo.mp4` | The recording — 6 min 34 s, 1440×900, silent |
| `demo-script.md` | Voiceover script: per-beat timecodes, measured pace, production notes |
| `record_demo.py` | Drives the browser and produces the recording |
| `convert.sh` | Converts the captured `.webm` to mp4, with guards |
| `beats.json` | Beat boundaries emitted by the last recording |
| `full_walk.py` | Asserts all nine beats still work (17 checks) |
| `test_*.py`, `_author.py` | Regression probes for the fixes the demo depends on |

## The nine beats

1. Select the study
2. What the USDM already carries — arms, objectives, SoA, narrative
3. Choose the primary endpoint
4. **Author the endpoint** — concept category, the time-to-event phrase, its three
   definition slots, the cube dimensions
5. **The analysis specification** — inputs (resolved bindings), the method and its
   configuration, the declared outputs, then the ICH E9(R1) estimand
6. Review
7. **The eSAP** — link the protocol's primary objective from the USDM narrative,
   expand the embedded analysis, then the JSON view
8. **The derivation pipeline** — eleven ordered steps, then the dependency graph
9. **Execute** — WebR in the browser, DM + ZE + ADSL, bind the population, run

Beat 9 produces `CHI_SQUARED 18.5776, DF 1, P_VALUE 1.631e-5`.

## Re-recording

Prerequisites: the app served at `http://localhost:8080/ac-dc-app/` (a bare
`python -m http.server` from the repo root does it), and Playwright in a Python
environment:

```bash
pip install playwright && python -m playwright install chromium
```

Then:

```bash
python ac-dc-app/demo/record_demo.py   # writes a .webm beside the script
ac-dc-app/demo/convert.sh              # .webm -> esap-pfs-demo.mp4
```

Beat lengths live in the `BUDGET` dictionary at the top of `record_demo.py`. Each
beat is padded to its budgeted duration, so the cut stays stable even when the
app responds at different speeds — change a number there and re-record rather
than trimming in an editor. Re-recording invalidates the timecodes in
`demo-script.md`; `beats.json` is rewritten with the new boundaries.

`convert.sh` refuses to overwrite a good mp4 with a source under 5 MB or 300 s,
and stages through a temp file. A truncated capture destroyed a finished take
once; this is why.

## Verifying before you record

```bash
python ac-dc-app/demo/full_walk.py           # 17 checks across all nine beats
python ac-dc-app/demo/test_slot_wiring.py    # definition slots persist
python ac-dc-app/demo/test_step3_sentence.py # step 3 preview resolves its slots
python ac-dc-app/demo/test_estimand.py       # estimand renders; summary is a measure
```

The three `test_*.py` probes cover bugs found while building this demo, all of
which would have been visible on camera:

- the Definition Slots dropdowns on Step 3 were inert — their handler was only
  attached by a view that Step 3 never renders, so slot picks silently vanished;
- the Step 3 preview mapped `{event}` onto the *parameter* value, contradicting
  the slots directly above it;
- a live-authored endpoint showed no estimand at all, because the summary measure
  was inferred onto the analysis after the estimand text had already been built
  from the spec-level mirror.

They are browser probes rather than unit tests because the modules involved touch
`location` and cannot be imported outside a page. The unit tests that *can* run
headless live in `ac-dc-app/test/` (`node --test 'test/*.test.js'`).

## Gotchas worth knowing

- **Beat 9 needs ADSL**, not just DM and ZE. Population flags are an ADaM
  construct and Scenario 5 runs off SDTM, so without ADSL the run completes but
  reports *"NOT APPLIED — the result does not honour 1 declared constraint"*.
- **`Run all` stays disabled** until a primary dataset is chosen; loading datasets
  is not the same as selecting one.
- **Row count stays 200 after the ITT filter** — `ADSL.ITTFL` is `Y` for all 200
  subjects, so the restriction legitimately excludes nobody. `PPROTFL` is 142 Y /
  58 N, so a per-protocol population *would* move the numbers.
- **Multi-select order follows DOM order**, never click order, so the authored
  sentence reads "Solicited Adverse Event or Overall Response" where the
  hand-authored Scenario 4 JSON has the reverse. Cosmetic only.
- Loading a scenario raises a JS `alert` that must be dismissed; the recording
  auto-accepts it.
