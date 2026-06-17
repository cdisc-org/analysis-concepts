# Getting Started

A short, practical guide to cloning the repo, running the eSAP Builder, and exercising the **Study SoA** feature. For the design and architecture narrative, see [`README.md`](README.md).

## Prerequisites

| Tool | Required for | Install |
|---|---|---|
| **Python 3.10+** | Running the app | ships with macOS; otherwise `brew install python@3.12` |
| **git** | Clone | ships with Xcode CLT |
| **CDISC Library API key** *(optional)* | Re-fetching SDTM specs | Request at <https://api.library.cdisc.org> |

## 1. Clone and run the app

```bash
git clone https://github.com/cdisc-org/analysis-concepts.git
cd analysis-concepts
python3 ac-dc-app/serve.py
```

Open <http://localhost:8080/ac-dc-app/index.html>.

On **Step 1 (Select Study)** you'll see the study card(s) listed in `ac-dc-app/data/usdm/studies.json`. A study whose USDM carries the SDTM-specialization extension shows a teal **SoA-ready** badge and can drive the Study SoA views; if the bundled study isn't enriched yet, run the enrichment script first (see section 2).

Left sidebar includes:
- **Workflow Steps 1–8** — the existing eSAP builder (study selection, endpoint specification, derivation pipeline, execute-via-WebR).
- **Study SoA** *(new)* — two sub-items: **Protocol SoA** (generic BCs × Encounters) and **Detailed SoA** (SDTM Dataset Specializations × Encounters).

Click any BC row in either SoA to open a drill-in panel. Use the search box at the top right for live filtering.

## 2. Refresh CDISC Library data (optional)

The CDISC Library cache under `ac-dc-app/data/cdisc-library/` is **not committed** (it's gitignored and fully regenerable). Run the enrichment below to build it locally before using the Detailed SoA drill-ins; re-run it to pick up a newer CDISC Library package release.

```bash
# Put your key into .env at the repo root (gitignored)
cp .env.example .env
# edit .env → set CDISC_LIBRARY_API_KEY=...

# Dry-run: reports what would change, no writes
python3 scripts/enrich_usdm_for_soa.py

# Re-fetch + rewrite the enriched USDM and cache
python3 scripts/enrich_usdm_for_soa.py --write

# Include every sibling spec per parent BC (slow on first run, cached after)
python3 scripts/enrich_usdm_for_soa.py --write --deep-siblings
```

Re-running with the same API state produces byte-identical output — safe to automate.

## What gets written where

| File / directory | Source | Committed? |
|---|---|---|
| `ac-dc-app/data/usdm/CDISC_Pilot_Study_soa_enriched.json` | `scripts/enrich_usdm_for_soa.py --write` | **yes** — SoA-enriched study (reference it from `studies.json` to load it) |
| `ac-dc-app/data/cdisc-library/_index.json` | enrichment script | **no** — gitignored; BC↔spec lookup (regenerate locally) |
| `ac-dc-app/data/cdisc-library/bcs/*.json` | enrichment script | **no** — gitignored; parent BC payloads |
| `ac-dc-app/data/cdisc-library/sdtm-specs/*.json` | enrichment script | **no** — gitignored; spec variable lists |
| `ac-dc-app/data/cdisc-library/_packages/*.json` | enrichment script | **no** — gitignored; package listings |
| `.env` | you | **no** — gitignored |

The ~12 MB CDISC Library cache is **gitignored, not committed** — each developer regenerates it locally with their own API key via the enrichment script above. This avoids redistributing CDISC Library content; the app itself boots fine without the cache (the Detailed SoA drill-ins just show "No cached payload" until it's built).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Port 8080 already in use | Another dev server is running. Stop it or change `PORT = 8080` in `ac-dc-app/serve.py`. |
| Detailed SoA drill-in says "No cached payload" for a spec | Enrichment hasn't been run or missed that spec — re-run `python3 scripts/enrich_usdm_for_soa.py --write --deep-siblings`. |
| Glucose drill-in shows only 1 candidate | Needs the deep-siblings pass: `python3 scripts/enrich_usdm_for_soa.py --write --deep-siblings`. |
| SoA sidebar items show a "run enrichment script" placeholder | The selected study isn't SoA-enriched — run `--write` (section 2) and make sure `studies.json` references the enriched file. |

## Where the Study SoA code lives

- **Enrichment script**: `scripts/enrich_usdm_for_soa.py`
- **USDM parser**: `ac-dc-app/js/utils/usdm-parser.js` (extracts the `sdtmDatasetSpecialization` extension into `parsedBc.sdtmSpec`)
- **Matrix builder**: `ac-dc-app/js/utils/soa-matrix.js` (Encounters × Activities × cells + Study-Day offsets + epoch groups)
- **View**: `ac-dc-app/js/views/study-soa.js` (Protocol + Detailed + drill-in + search)
- **Styles**: `ac-dc-app/css/study-soa.css`
- **Sidebar menu registration**: `ac-dc-app/js/app.js` (`SOA_MENU`) + `ac-dc-app/js/components/sidebar.js`
