"""Regression probe: picking a Definition Slot on Step 3 must persist to the spec.

Reproduces the wiring gap where the slot <select>s are rendered by
endpoint-spec.js but their change handler is only attached by
renderEndpointSpec — which Step 3 (renderEndpointWhat) never calls.
"""
import sys
from playwright.sync_api import sync_playwright

APP = "http://localhost:8080/ac-dc-app/"

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto(APP)
        pg.click("text=Breast Cancer Study PrE0102")
        pg.click('button:has-text("Objectives & Endpoints")')
        pg.locator('input[type=checkbox]').first.check()
        pg.click("text=Variable of interest")
        pg.select_option("select.ep-concept-category", "TimeToEvent")
        pg.select_option("select.ep-data-type", "Duration")
        pg.wait_for_timeout(300)
        pg.check('input.ep-phrase-radio[data-oid="SP_TTE_FULL_ENDPOINT"]')
        pg.wait_for_timeout(500)

        pg.select_option('select.ep-phrase-slot-bc[data-slot="risk_origin"]',
                         label="Subject is Randomized")
        pg.select_option('select.ep-phrase-slot-bc[data-slot="event"]',
                         label=["Overall Response", "Solicited Adverse Event"])
        pg.select_option('select.ep-phrase-slot-bc[data-slot="censoring_event"]',
                         label="Overall Response")
        pg.wait_for_timeout(400)

        got = pg.evaluate("() => window.appState.endpointSpecs.Endpoint_1.phraseSlotBindings")
        want = {
            "risk_origin": ["BiomedicalConcept_145"],
            "event": ["BiomedicalConcept_141", "BiomedicalConcept_127"],
            "censoring_event": ["BiomedicalConcept_141"],
        }
        b.close()

    # Multi-select order follows DOM order, not click order -- `selectedOptions`
    # always does. A human cannot produce any other order through this UI, so
    # the comparison is order-insensitive; Scenario 4's own ordering was
    # hand-authored in JSON.
    norm = lambda d: {k: sorted(v) for k, v in (d or {}).items()}
    if norm(got) != norm(want):
        print("FAIL  slot picks did not persist")
        print(f"      got : {got}")
        print(f"      want: {want}")
        return 1
    print("PASS  slot picks persist to phraseSlotBindings")
    return 0

sys.exit(main())
