# ZE.csv — derived for demo, NOT collected SDTM

A sponsor-domain **union** of the event-like records the progression-free-survival
chain reads: overall-response assessments (RS), the randomisation milestone (DS) and
fatal adverse events (AE). One row per source record — nothing is joined, so nothing
multiplies.

It exists because the execution engine ingests **one** primary dataset and can merge
only *dimensions* from others (`enrich_dimensions`), never measures. The PFS leaves read
dates — measures — from three domains, so no single collected dataset can serve them.
Stacking removes the need to cross datasets rather than fixing the engine.

Column names carry one domain prefix so the existing SDTM `--` mappings resolve:

| column     | resolves to (after ingest)          | source |
|------------|-------------------------------------|--------|
| `ZETESTCD` | `Parameter` (alias `Observation.Identification.Topic`) | `RS.RSTESTCD` |
| `ZEORRES`  | `Observation.Result.Value`          | `RS.RSORRES` |
| `ZEDECOD`  | `EventTerm.Coding.PreferredTerm`    | `DS.DSDECOD` / `AE.AEDECOD` |
| `ZECAT`    | `Category`                          | `RS.RSCAT` / `DS.DSCAT` |
| `ZEOUT`    | `EventTerm.Outcome`                 | `AE.AEOUT` |
| `ZEDTC`    | `Timing`                            | `RS.RSDTC` / `DS.DSSTDTC` / `AE.AEENDTC` |

The death date is the fatal event's **end** date (`AEENDTC`), falling back to its start.

Treatment is **not** here: it is a subject-level dimension living in `DM` (`ARM`), and
dimension enrichment across datasets is supported. Load `DM.csv` alongside.

Regenerate from the collected domains rather than editing by hand.
