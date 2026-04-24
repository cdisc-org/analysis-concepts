# Getting Started

A short, practical guide to cloning the repo, running the eSAP Builder, and exercising the **Study SoA** feature. For the design and architecture narrative, see [`README.md`](README.md).

## Prerequisites

| Tool | Required for | Install |
|---|---|---|
| **Python 3.10+** | Running the app | ships with macOS; otherwise `brew install python@3.12` |
| **git** | Clone | ships with Xcode CLT |
| **Node 18+** *(optional)* | Recording the demo video | `brew install node` |
| **CDISC Library API key** *(optional)* | Re-fetching SDTM specs | Request at <https://api.library.cdisc.org> |

## 1. Clone and run the app

```bash
git clone https://github.com/cdisc-org/analysis-concepts.git
cd analysis-concepts
python3 ac-dc-app/serve.py
```

Open <http://localhost:8080/ac-dc-app/index.html>.

On **Step 1 (Select Study)** you'll see four study cards. The one labelled **"CDISC PILOT - LZZT - SoA (enriched)"** has a teal **SoA-ready** badge — pick it to drive the Study SoA views.

Left sidebar includes:
- **Workflow Steps 1–8** — the existing eSAP builder (study selection, endpoint specification, derivation pipeline, execute-via-WebR).
- **Study SoA** *(new)* — two sub-items: **Protocol SoA** (generic BCs × Encounters) and **Detailed SoA** (SDTM Dataset Specializations × Encounters).

Click any BC row in either SoA to open a drill-in panel. Use the search box at the top right for live filtering.

## 2. Refresh CDISC Library data (optional)

The repo ships with a cached snapshot under `ac-dc-app/data/cdisc-library/`, so the SoA views work out of the box. You only need to re-run enrichment if you want to pick up a newer CDISC Library package release.

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

## 3. Record the walkthrough video (optional)

A Playwright script captures a captioned ~60 s demo of both SoA views as a WebM file.

```bash
# one-time setup (~170 MB under node_modules/, gitignored)
npm install
npx playwright install chromium

# in another terminal, keep the app server running
python3 ac-dc-app/serve.py

# record
node scripts/demo_soa.mjs
# → demo-output/soa-demo.webm (~4 MB)
```

Open the WebM in any modern browser or drop it into Slack/Teams/Notion — they all play WebM natively. For MP4 conversion: `brew install ffmpeg && ffmpeg -i demo-output/soa-demo.webm -c:v libx264 demo-output/soa-demo.mp4`.

To tweak the walkthrough, edit the `caption('…')` strings and `beat(ms)` pauses in `scripts/demo_soa.mjs` — each scene is a small self-contained block.

## What gets written where

| File / directory | Source | Committed? |
|---|---|---|
| `ac-dc-app/data/usdm/CDISC_Pilot_Study_soa_enriched.json` | `scripts/enrich_usdm_for_soa.py --write` | **yes** — app entry point |
| `ac-dc-app/data/cdisc-library/_index.json` | enrichment script | **yes** — BC↔spec lookup |
| `ac-dc-app/data/cdisc-library/bcs/*.json` | enrichment script | **yes** — parent BC payloads |
| `ac-dc-app/data/cdisc-library/sdtm-specs/*.json` | enrichment script | **yes** — spec variable lists |
| `ac-dc-app/data/cdisc-library/_packages/*.json` | enrichment script | **yes** — package listings |
| `.env` | you | **no** — gitignored |
| `node_modules/` | `npm install` | **no** — gitignored |
| `demo-output/*.webm` | `node scripts/demo_soa.mjs` | **no** — gitignored |

The 12 MB of CDISC Library cache is committed so teammates who clone the repo can run the SoA feature immediately without needing their own API key. If your licensing requires otherwise, see `.gitignore` for an easy opt-out.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `env: node: No such file or directory` | Broken Homebrew Node install — `brew reinstall node`. |
| Port 8080 already in use | Another dev server is running. Stop it or change `PORT = 8080` in `ac-dc-app/serve.py`. |
| Detailed SoA drill-in says "No cached payload" for a spec | Enrichment hasn't been run or missed that spec — re-run `python3 scripts/enrich_usdm_for_soa.py --write --deep-siblings`. |
| Glucose drill-in shows only 1 candidate | Needs the deep-siblings pass: `python3 scripts/enrich_usdm_for_soa.py --write --deep-siblings`. |
| SoA sidebar items show a "run enrichment script" placeholder | `ac-dc-app/data/usdm/CDISC_Pilot_Study_soa_enriched.json` is missing — run `--write` (see section 2). |
| Demo script hangs on "waiting for selector" | Make sure `python3 ac-dc-app/serve.py` is running first; the script reaches out to `http://localhost:8080`. |

## Where the Study SoA code lives

- **Enrichment script**: `scripts/enrich_usdm_for_soa.py`
- **USDM parser**: `ac-dc-app/js/utils/usdm-parser.js` (extracts the `sdtmDatasetSpecialization` extension into `parsedBc.sdtmSpec`)
- **Matrix builder**: `ac-dc-app/js/utils/soa-matrix.js` (Encounters × Activities × cells + Study-Day offsets + epoch groups)
- **View**: `ac-dc-app/js/views/study-soa.js` (Protocol + Detailed + drill-in + search)
- **Styles**: `ac-dc-app/css/study-soa.css`
- **Sidebar menu registration**: `ac-dc-app/js/app.js` (`SOA_MENU`) + `ac-dc-app/js/components/sidebar.js`

## Re-recording the demo after changes

Any time you change the UI and want a fresh demo for the team:

```bash
node scripts/demo_soa.mjs
```

The previous `demo-output/soa-demo.webm` is renamed to `soa-demo.prev.webm` (kept for A/B comparison); the new recording becomes the latest.
