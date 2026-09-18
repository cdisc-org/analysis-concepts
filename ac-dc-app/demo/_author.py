"""Shared: author the PFS endpoint (beats 1-4). Leaves the page on Step 3."""
def author_endpoint(pg, app="http://localhost:8080/ac-dc-app/"):
    pg.goto(app)
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
    pg.select_option('select.ep-phrase-slot-bc[data-slot="event"]',
                     label=["Overall Response", "Solicited Adverse Event"])
    pg.select_option('select.ep-phrase-slot-bc[data-slot="censoring_event"]', label="Overall Response")
    pg.wait_for_timeout(250)
    pg.check('input.ep-dim-phrase-cb[data-oid="SP_POPULATION"]'); pg.wait_for_timeout(200)
    pg.check('input.ep-dim-phrase-cb[data-oid="SP_GROUPING"]');  pg.wait_for_timeout(300)
    pg.select_option("select.ep-cube-add-dim", "Parameter"); pg.wait_for_timeout(400)
    ctrls = pg.evaluate("""() => [...document.querySelectorAll('.ep-cube-slice-value')].map(e => ({
        idx:e.dataset.idx, dim:(window.appState.endpointSpecs.Endpoint_1.cubeDimensions[+e.dataset.idx]||{}).dimension}))""")
    for c in ctrls:
        sel = f'.ep-cube-slice-value[data-idx="{c["idx"]}"]'
        if c["dim"] == "Parameter":
            pg.fill(sel, "Progression-Free Survival (Days)"); pg.dispatch_event(sel, "change")
        elif c["dim"] == "Population":
            pg.select_option(sel, label="Population_1")
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(400)
