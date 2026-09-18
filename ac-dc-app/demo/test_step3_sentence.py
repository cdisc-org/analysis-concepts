"""The Step 3 preview must resolve the slots the author just bound.

buildSyntaxTemplate mapped {event} to the PARAMETER value and never consulted
phraseSlotBindings, so a freshly authored endpoint previewed as
"time from {risk_origin} to Progression-Free Survival (Days), censored at
{censoring_event}" -- contradicting the Definition Slots directly above it.
"""
import sys
from playwright.sync_api import sync_playwright

APP = "http://localhost:8080/ac-dc-app/"

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(APP)
    pg.click("text=Breast Cancer Study PrE0102")
    pg.click('button:has-text("Objectives & Endpoints")')
    pg.locator('input[type=checkbox]').first.check()
    pg.click("text=Variable of interest")
    pg.select_option("select.ep-concept-category", "TimeToEvent")
    pg.select_option("select.ep-data-type", "Duration")
    pg.wait_for_timeout(300)
    pg.check('input.ep-phrase-radio[data-oid="SP_TTE_FULL_ENDPOINT"]')
    pg.wait_for_timeout(400)
    pg.select_option('select.ep-phrase-slot-bc[data-slot="risk_origin"]', label="Subject is Randomized")
    pg.select_option('select.ep-phrase-slot-bc[data-slot="event"]', label=["Overall Response","Solicited Adverse Event"])
    pg.select_option('select.ep-phrase-slot-bc[data-slot="censoring_event"]', label="Overall Response")
    pg.wait_for_timeout(500)
    sentence = pg.evaluate("() => { const e=document.querySelector('.ep-syntax-resolved'); return e?e.innerText:''; }")
    b.close()

problems = []
if "{risk_origin}" in sentence: problems.append("{risk_origin} left unresolved")
if "{censoring_event}" in sentence: problems.append("{censoring_event} left unresolved")
if "Subject is Randomized" not in sentence: problems.append("risk_origin binding not shown")
if "Overall Response" not in sentence: problems.append("event/censoring binding not shown")

print("sentence:", sentence)
if problems:
    print("FAIL  " + "; ".join(problems)); sys.exit(1)
print("PASS  step 3 preview reflects the bound slots"); sys.exit(0)
