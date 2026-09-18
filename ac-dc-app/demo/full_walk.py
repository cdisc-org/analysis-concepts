"""Dry probe: all nine demo beats, one screenshot each, asserting what must be true."""
import os, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from _author import author_endpoint

HERE = os.path.dirname(__file__)
# Repo-relative: this file lives at <repo>/ac-dc-app/demo/
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S5 = os.path.join(APP_DIR, "data", "study_ac_spec",
                  "Scenario 5_NCT01797120-PrE0102.study-instance-pfs-with-derivation.json")
checks, errs = [], []

def ck(name, cond, detail=""):
    checks.append((name, bool(cond), detail))
    print(("  OK   " if cond else "  FAIL") + f" {name}" + (f"  [{detail}]" if detail and not cond else ""))

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width":1440,"height":900})
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" and "404" not in m.text else None)
    pg.on("dialog", lambda d: d.accept())
    S = lambda n: pg.screenshot(path=os.path.join(HERE, f"beat{n}.png"))

    print("BEATS 1-4  select study / USDM tabs / pick endpoint / author endpoint")
    author_endpoint(pg)
    spec = lambda: pg.evaluate("() => window.appState.endpointSpecs.Endpoint_1")
    st = spec()
    ck("endpoint authored: phrase", st["selectedEndpointPhrase"] == "SP_TTE_FULL_ENDPOINT")
    ck("endpoint authored: 3 slots bound", len(st.get("phraseSlotBindings") or {}) == 3)
    ck("endpoint authored: population", st["dimensionValues"].get("Population") == "Population_1")
    sent = pg.evaluate("() => document.querySelector('.ep-syntax-resolved')?.innerText || ''")
    ck("step-3 sentence resolves slots", "{risk_origin}" not in sent and "Subject is Randomized" in sent, sent)
    S(4)

    print("\nBEAT 5  analysis")
    pg.click("text=Summary measure"); pg.wait_for_timeout(900)
    pg.click('.ep-library-card[data-transform-oid="T.OS_LogRank"]'); pg.wait_for_timeout(1000)
    ck("analysis selected", spec().get("selectedTransformationOid") == "T.OS_LogRank",
       str(spec().get("selectedTransformationOid")))
    S(5)

    print("\nBEAT 6  summary")
    pg.click("text=Review all endpoints"); pg.wait_for_timeout(900)
    ck("on summary step", pg.evaluate("() => location.hash") == "#/step/5")
    S(6)

    print("\nBEAT 7  eSAP builder")
    pg.click("text=Generate analysis plan"); pg.wait_for_timeout(1100)
    btns = pg.evaluate("() => [...document.querySelectorAll('button')].map(b=>b.innerText.trim())")
    ck("on eSAP step", pg.evaluate("() => location.hash") == "#/step/7")
    ck("JSON view available", any("JSON" in x for x in btns))
    ck("USDM linking available", any("Link USDM Content" in x for x in btns))
    pg.click('button:has-text("{ } JSON")'); pg.wait_for_timeout(900)
    ck("JSON view renders", pg.evaluate("() => /\\{|\\}/.test(document.body.innerText)"))
    S(7)

    print("\nBEAT 8  derivations + load Scenario 5")
    pg.click("text=Dependent derivation pipeline"); pg.wait_for_timeout(900)
    with pg.expect_file_chooser() as fc:
        pg.click("#btn-load-instance")
    fc.value.set_files(S5); pg.wait_for_timeout(1800)
    pg.click("text=Dependent derivation pipeline"); pg.wait_for_timeout(1200)
    ck("scenario 5 chain loaded", len(spec().get("derivationChain") or []) == 10,
       str(len(spec().get("derivationChain") or [])))
    ck("population survived the load", spec()["dimensionValues"].get("Population") == "Population_1")
    S(8)

    print("\nBEAT 9  execute")
    pg.click("text=Run analysis via WebR"); pg.wait_for_timeout(1300)
    btns9 = pg.evaluate("() => [...document.querySelectorAll('button')].map(b=>b.innerText.trim())")
    ck("on execute step", pg.evaluate("() => location.hash") == "#/step/8")
    ck("DM domain button", "DM" in btns9)
    ck("ZE domain button", "ZE" in btns9)
    ck("Execute button", any(x == "Execute" for x in btns9))
    ck("WebR init button", any("WebR" in x for x in btns9))
    S(9)

    print("\nconsole errors:", errs or "none")
    b.close()

bad = [n for n, ok, _ in checks if not ok]
print(f"\n=== {len(checks)-len(bad)}/{len(checks)} checks passed ===")
if bad: print("failed:", bad)
sys.exit(1 if bad else 0)
