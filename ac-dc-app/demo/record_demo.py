"""eSAP PFS demo — records a ~5:30 silent walkthrough for voiceover.

Produces a .webm via Playwright's recordVideo; convert to mp4 with ffmpeg.
A synthetic cursor is injected because Playwright's real mouse is invisible to
the recorder, so clicks would otherwise appear to happen by themselves.

Every selector here is one the dry probe verified.
"""
import os, sys, time, json
from playwright.sync_api import sync_playwright

APP = "http://localhost:8080/ac-dc-app/"
OUT = os.path.dirname(os.path.abspath(__file__))
# Repo-relative: this file lives at <repo>/ac-dc-app/demo/
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S5 = os.path.join(APP_DIR, "data", "study_ac_spec",
                  "Scenario 5_NCT01797120-PrE0102.study-instance-pfs-with-derivation.json")

# Target seconds per beat. The runner pads each beat to its target, so the total
# stays stable even when the app responds at different speeds.
BUDGET = {1: 14, 2: 26, 3: 18, 4: 62, 5: 70, 6: 16, 7: 86, 8: 46, 9: 54}

CURSOR_JS = """
() => {
  if (document.getElementById('__cur')) return;
  const c = document.createElement('div');
  c.id = '__cur';
  c.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'width:22px', 'height:22px',
    'border-radius:50%', 'background:rgba(245,178,0,.35)',
    'border:2px solid #f5b200', 'box-shadow:0 0 0 2px rgba(18,33,64,.25)',
    'pointer-events:none', 'z-index:2147483647',
    'transition:left .45s cubic-bezier(.4,0,.2,1), top .45s cubic-bezier(.4,0,.2,1), transform .12s',
    'transform:translate(-50%,-50%)'
  ].join(';');
  document.body.appendChild(c);
  window.__cur = {
    to(x, y) { c.style.left = x + 'px'; c.style.top = y + 'px'; },
    tap() { c.style.transform = 'translate(-50%,-50%) scale(.6)';
            setTimeout(() => c.style.transform = 'translate(-50%,-50%) scale(1)', 140); }
  };
}
"""

class Demo:
    def __init__(self, pg):
        self.pg = pg
        self.t0 = time.time()
        self.log = []

    def cursor(self):
        self.pg.evaluate(CURSOR_JS)

    def _point(self, sel):
        box = self.pg.locator(sel).first.bounding_box()
        if not box:
            return None
        return box["x"] + box["width"] / 2, box["y"] + min(box["height"] / 2, 18)

    def move(self, sel, settle=520):
        self.cursor()
        pt = self._point(sel)
        if pt:
            self.pg.evaluate("([x,y]) => window.__cur && window.__cur.to(x,y)", list(pt))
            self.pg.wait_for_timeout(settle)

    def click(self, sel, after=700):
        self.move(sel)
        self.pg.evaluate("() => window.__cur && window.__cur.tap()")
        self.pg.wait_for_timeout(120)
        self.pg.locator(sel).first.click()
        self.pg.wait_for_timeout(after)

    def check(self, sel, after=700):
        self.move(sel)
        self.pg.evaluate("() => window.__cur && window.__cur.tap()")
        self.pg.wait_for_timeout(120)
        self.pg.locator(sel).first.check()
        self.pg.wait_for_timeout(after)

    def select(self, sel, after=700, **kw):
        self.move(sel)
        self.pg.evaluate("() => window.__cur && window.__cur.tap()")
        self.pg.wait_for_timeout(120)
        self.pg.locator(sel).first.select_option(**kw)
        self.pg.wait_for_timeout(after)

    def type(self, sel, text, after=700):
        self.move(sel)
        self.pg.locator(sel).first.click()
        self.pg.locator(sel).first.type(text, delay=45)
        self.pg.dispatch_event(sel, "change")
        self.pg.wait_for_timeout(after)

    def dwell(self, ms):
        self.pg.wait_for_timeout(ms)

    def scroll(self, px, steps=6):
        for _ in range(steps):
            self.pg.mouse.wheel(0, px / steps)
            self.pg.wait_for_timeout(110)

class Beat:
    """Pads each beat to its budgeted duration so the cut stays ~5:30."""
    def __init__(self, demo, n, name):
        self.d, self.n, self.name = demo, n, name
    def __enter__(self):
        self.start = time.time()
        self.offset = self.start - self.d.t0
        print(f"[{self.offset:6.1f}s] BEAT {self.n}  {self.name}", flush=True)
        return self
    def __exit__(self, *exc):
        target = BUDGET[self.n]
        spent = time.time() - self.start
        if spent < target:
            self.d.pg.wait_for_timeout(int((target - spent) * 1000))
        self.d.log.append({
            "beat": self.n, "name": self.name,
            "start": round(self.offset, 1),
            "end": round(time.time() - self.d.t0, 1),
        })
        return False

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900},
                            record_video_dir=OUT,
                            record_video_size={"width": 1440, "height": 900})
        pg = ctx.new_page()
        pg.on("dialog", lambda dlg: dlg.accept())
        d = Demo(pg)

        pg.goto(APP); pg.wait_for_timeout(1500); d.cursor()

        # ---- 1. Select the study -------------------------------------------
        with Beat(d, 1, "Select study"):
            d.dwell(2500)
            d.click("text=Breast Cancer Study PrE0102", after=1500)

        # ---- 2. What a USDM carries ----------------------------------------
        with Beat(d, 2, "USDM tabs"):
            for tab in ("Arms", "Objectives & Endpoints", "Schedule of Activities",
                        "Narrative", "Summary"):
                d.click(f'button:has-text("{tab}")', after=1600)

        # ---- 3. Pick the primary endpoint ----------------------------------
        with Beat(d, 3, "Pick PFS endpoint"):
            d.click('button:has-text("Objectives & Endpoints")', after=1200)
            d.dwell(2200)
            d.check("input[type=checkbox] >> nth=0", after=1600)

        # ---- 4. Author the endpoint ----------------------------------------
        with Beat(d, 4, "Author endpoint"):
            d.click("text=Variable of interest", after=1400)
            d.select("select.ep-concept-category", value="TimeToEvent", after=900)
            d.select("select.ep-data-type", value="Duration", after=900)
            # The fuller phrase is what creates the three definition slots.
            d.check('input.ep-phrase-radio[data-oid="SP_TTE_FULL_ENDPOINT"]', after=1500)
            d.select('select.ep-phrase-slot-bc[data-slot="risk_origin"]',
                     label="Subject is Randomized", after=900)
            # Multi-valued slot: both events, joined with "or".
            d.select('select.ep-phrase-slot-bc[data-slot="event"]',
                     label=["Overall Response", "Solicited Adverse Event"], after=1100)
            d.select('select.ep-phrase-slot-bc[data-slot="censoring_event"]',
                     label="Overall Response", after=1100)
            # Population BEFORE grouping: clause order follows check order.
            d.check('input.ep-dim-phrase-cb[data-oid="SP_POPULATION"]', after=900)
            d.check('input.ep-dim-phrase-cb[data-oid="SP_GROUPING"]', after=900)
            d.select("select.ep-cube-add-dim", value="Parameter", after=900)
            ctrls = pg.evaluate("""() => [...document.querySelectorAll('.ep-cube-slice-value')].map(e => ({
                idx:e.dataset.idx,
                dim:(window.appState.endpointSpecs.Endpoint_1.cubeDimensions[+e.dataset.idx]||{}).dimension}))""")
            for c in ctrls:
                sel = f'.ep-cube-slice-value[data-idx="{c["idx"]}"]'
                if c["dim"] == "Parameter":
                    d.type(sel, "Progression-Free Survival (Days)", after=900)
                elif c["dim"] == "Population":
                    d.select(sel, label="Population_1", after=900)
            d.dwell(2200)

        # ---- 5. Choose the analysis ----------------------------------------
        with Beat(d, 5, "Analysis"):
            d.click("text=Summary measure", after=1500)
            d.dwell(1800)
            d.click('.ep-library-card[data-transform-oid="T.OS_LogRank"]', after=1800)
            # Resolved bindings first, then down to the estimand panel.
            # The specification reads top-down: what goes in, what is done, what
            # comes out -- then the estimand that all three imply.
            d.dwell(3000)          # resolved bindings: the input measures/dimensions
            d.scroll(300)
            d.dwell(4200)          # bindings table in full
            d.scroll(300)
            d.dwell(4000)          # model expression + method configuration
            d.scroll(280)
            d.dwell(4000)          # declared outputs
            d.scroll(400)
            d.dwell(5000)          # estimand: the ICH E9(R1) attribute table

        # ---- 6. Summary ------------------------------------------------------
        with Beat(d, 6, "Summary"):
            d.click("text=Review all endpoints", after=1600)
            d.dwell(2000)
            d.scroll(500)
            d.dwell(1800)

        # ---- 7. eSAP builder -------------------------------------------------
        with Beat(d, 7, "eSAP builder"):
            d.click("text=Generate analysis plan", after=1800)
            d.dwell(1800)

            # 1.1 Objectives, Endpoints and Estimands -> link the protocol's own
            # primary objective from the USDM narrative.
            d.click('button.btn-link-usdm >> nth=1', after=1600)
            d.dwell(1600)
            d.click('text=2.1 Primary Objective', after=1400)   # row click renders the preview
            d.dwell(3200)                                        # the objective text
            d.check('input[type=checkbox][data-nci-id="NarrativeContentItem_14"]', after=1000)
            d.dwell(1400)
            d.click('button:has-text("Apply")', after=2000)
            d.dwell(3800)                                        # Linked (1) + embedded text

            d.scroll(380)
            d.dwell(1600)
            # Section 4 — open the endpoint's analysis to show what the plan embeds:
            # the formalized sentence, the method, the model expression, the outputs.
            row = 'details:has(> summary span.badge-blue) > summary'
            pg.locator(row).first.scroll_into_view_if_needed()
            pg.wait_for_timeout(700)
            d.click(row, after=2600)
            d.dwell(4000)
            d.scroll(200)
            d.dwell(3400)
            d.click('button:has-text("{ } JSON")', after=2200)
            d.scroll(380)
            d.dwell(2200)

        # ---- 8. Derivation pipeline -----------------------------------------
        with Beat(d, 8, "Derivations + load Scenario 5"):
            d.click("text=Dependent derivation pipeline", after=1600)
            d.dwell(1800)
            with pg.expect_file_chooser() as fc:
                d.click("#btn-load-instance", after=400)
            fc.value.set_files(S5)
            pg.wait_for_timeout(2200)
            d.click("text=Dependent derivation pipeline", after=1800)
            d.dwell(3000)          # Pipeline Complete + the head of the execution order
            d.scroll(300)
            d.dwell(4500)          # all eleven steps, each naming the concept it produces
            d.scroll(360)
            d.dwell(3000)          # graph root: the analysis the chain feeds
            d.scroll(180)
            d.dwell(4000)          # its inputs, and their inputs

        # ---- 9. Execute -------------------------------------------------------
        with Beat(d, 9, "Execute"):
            d.click("text=Run analysis via WebR", after=1600)
            d.click('button:has-text("Initialize WebR Engine")', after=600)
            for _ in range(60):
                pg.wait_for_timeout(1000)
                if not [x for x in pg.evaluate(
                        "() => [...document.querySelectorAll('button')].map(b=>b.innerText.trim())")
                        if "Initializ" in x]:
                    break
            pg.wait_for_timeout(800)
            # Wait for each dataset to actually register rather than trusting a
            # fixed delay -- the button gains a tick, and the primary-dataset
            # picker only exists once something is loaded.
            for dom in ("DM", "ZE", "ADSL"):
                d.click(f'button:text-is("{dom}")', after=300)
                for _ in range(40):
                    pg.wait_for_timeout(250)
                    loaded = pg.evaluate("() => (window.appState.loadedDatasets||[]).map(x=>x.name)")
                    if dom.lower() in loaded:
                        break
                else:
                    print(f"  WARNING: {dom} did not load")
                pg.wait_for_timeout(500)
            pg.wait_for_selector(".exec-dataset-select", timeout=30000)
            d.select(".exec-dataset-select", label="ze (923)", after=1100)
            d.select('.exec-slice-aux-select[data-concept="Population"]', value="adsl", after=1100)
            d.select('.exec-slice-val-override[data-dim="Population"]', value="Y", after=1100)
            d.click('button:has-text("Run all")', after=1200)
            for _ in range(60):
                pg.wait_for_timeout(1000)
                if "CHI_SQUARED" in pg.evaluate("() => document.body.innerText"):
                    break
            pg.wait_for_timeout(1200)
            d.scroll(900, steps=9)
            d.dwell(3000)

        total = time.time() - d.t0
        print(f"\nwalkthrough finished in {int(total//60)}:{int(total%60):02d}")
        json.dump(d.log, open(os.path.join(OUT, "beats.json"), "w"), indent=2)

        path = pg.video.path()
        ctx.close(); b.close()
        print("video:", path)
        return path

if __name__ == "__main__":
    main()
