"""A live-authored endpoint must show its estimand, and the summary must read as a measure.

Two defects:
  1. inferDefaultSummaryPattern writes selectedAnalyses[i].estimandSummaryPattern
     during render, AFTER buildEstimandDescription has already read the
     spec-level field -- which syncLegacyTransformationOid mirrored while it was
     still null. Panel shows "not specified" and no headline.
  2. SUMMARY_MEASURE_PHRASES entries are composition fragments ending in a
     connective ("...distributions for"); shown as a standalone estimand
     attribute they dangle.
"""
import os, sys, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from _author import author_endpoint

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width":1440,"height":900})
    pg.on("dialog", lambda d: d.accept())
    author_endpoint(pg)
    pg.click("text=Summary measure"); pg.wait_for_timeout(900)
    pg.click('.ep-library-card[data-transform-oid="T.OS_LogRank"]'); pg.wait_for_timeout(1500)

    spec_level = pg.evaluate("() => window.appState.endpointSpecs.Endpoint_1.estimandSummaryPattern")
    per_analysis = pg.evaluate(
        "() => (window.appState.endpointSpecs.Endpoint_1.selectedAnalyses||[]).map(a=>a.estimandSummaryPattern)")
    txt = pg.evaluate("() => document.body.innerText")
    row = next((l for l in txt.split("\n") if "Population-level Summary" in l), "")
    value = row.split("\t")[-1].strip() if "\t" in row else ""
    headline = next((l.strip() for l in txt.split("\n") if l.strip().startswith("The ")), "")
    b.close()

print("spec-level pattern       :", spec_level)
print("per-analysis pattern     :", per_analysis)
print("Population-level Summary :", repr(value))
print("headline                 :", repr(headline[:110]))

fails = []
if not spec_level:
    fails.append("spec-level estimandSummaryPattern not mirrored from the analysis")
if value.lower() in ("", "not specified"):
    fails.append(f"Population-level Summary reads {value!r}")
if not headline:
    fails.append("no estimand headline sentence rendered")
m = re.search(r"\b(for|of|in|to|with)$", value.strip())
if m:
    fails.append(f"summary ends on dangling '{m.group(1)}'")

print()
for f in fails: print("FAIL ", f)
if fails: sys.exit(1)
print("PASS  estimand renders, and the summary reads as a measure"); sys.exit(0)
