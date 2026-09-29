"""eSAP PFS demo — records the walkthrough, paced by the narration.

The picture is cut to the voice, not the other way round: `d.line("4_3")` holds
the screen for exactly as long as that narration line takes to speak (measured
from the rendered audio in durations.json) and logs the moment it starts. The
cue log then places the same audio at the same timestamps, so the two cannot
drift.

    python build_voiceover.py synth    # render lines, measure -> durations.json
    python record_demo.py              # record, honouring those durations
    ./convert.sh                       # webm -> mp4
    python build_voiceover.py mux      # audio onto the mp4 at the logged cues

A synthetic cursor is injected because Playwright's real mouse is invisible to
the recorder. Every selector here is one the dry probe verified.
"""
import os, sys, time, json
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from narration import LINES, GAP, LABEL

APP = "http://localhost:8080/ac-dc-app/"
OUT = os.path.dirname(os.path.abspath(__file__))
# Repo-relative: this file lives at <repo>/ac-dc-app/demo/
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S5 = os.path.join(APP_DIR, "data", "study_ac_spec",
                  "Scenario 5_NCT01797120-PrE0102.study-instance-pfs-with-derivation.json")

# Minimum seconds per beat. The narration usually exceeds these, in which case
# the narration wins -- these only stop a beat with little to say from flashing
# past. The old fixed-budget padding is gone: audio determines length now.
BUDGET = {1: 6, 2: 8, 3: 6, 4: 14, 5: 16, 6: 6, 7: 18, 8: 10, 9: 20}

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
    def __init__(self, pg, durations):
        self.pg = pg
        self.t0 = time.time()
        self.log = []
        self.durations = durations
        self.cues = {}
        self.busy_until = 0.0   # when the current narration line stops speaking

    # -- narration ---------------------------------------------------------
    # Narration is a single serial stream. Actions may run underneath a line,
    # but two lines must never sound at once -- so every cue waits for the
    # previous line to finish speaking before it starts. Without this guard
    # `line_over` produced 12 collisions, some 6 seconds deep.
    def _cue(self, key):
        if key not in self.durations:
            raise KeyError(f"no rendered audio for line {key!r} -- run build_voiceover.py synth")
        waited = self.busy_until - (time.time() - self.t0)
        if waited > 0:
            self.pg.wait_for_timeout(int(waited * 1000))
        at = time.time() - self.t0
        self.cues[key] = round(at, 3)
        self.busy_until = at + self.durations[key] + GAP
        print(f"        {at:7.1f}s  {key:<6} {LINES[key][:58]}", flush=True)
        return self.durations[key]

    def line(self, key):
        """Speak a line and hold the picture until it finishes."""
        secs = self._cue(key)
        self.pg.wait_for_timeout(int((secs + GAP) * 1000))

    def line_over(self, key):
        """Start a line and carry on -- the picture moves while it speaks.

        The next cue still waits for this line to end, so the action underneath
        overlaps the speech but the following sentence never does."""
        self._cue(key)

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
        durations = json.load(open(os.path.join(OUT, f"durations-{LABEL}.json")))
        d = Demo(pg, durations)

        pg.goto(APP); pg.wait_for_timeout(1500); d.cursor()

        # ---- 1. Select the study -------------------------------------------
        with Beat(d, 1, "Select study"):
            d.line("1_1")
            d.line_over("1_2")
            d.click("text=Breast Cancer Study PrE0102", after=1500)

        # ---- 2. What a USDM carries ----------------------------------------
        with Beat(d, 2, "USDM tabs"):
            d.line("2_1")
            for tab, key in (("Arms", "2_2"),
                             ("Objectives & Endpoints", "2_3"),
                             ("Schedule of Activities", "2_4"),
                             ("Narrative", "2_5")):
                d.click(f'button:has-text("{tab}")', after=600)
                d.line(key)
            d.click('button:has-text("Summary")', after=600)
            d.line("2_6")

        # ---- 3. Pick the primary endpoint ----------------------------------
        with Beat(d, 3, "Pick PFS endpoint"):
            d.click('button:has-text("Objectives & Endpoints")', after=900)
            d.line("3_1")
            d.line_over("3_2")
            d.check("input[type=checkbox] >> nth=0", after=1400)

        # ---- 4. Author the endpoint ----------------------------------------
        with Beat(d, 4, "Author endpoint"):
            d.click("text=Variable of interest", after=1200)
            d.line("4_1")
            d.line_over("4_2")
            d.select("select.ep-concept-category", value="TimeToEvent", after=800)
            d.select("select.ep-data-type", value="Duration", after=900)
            # The fuller phrase is what creates the three definition slots.
            d.line_over("4_3")
            d.check('input.ep-phrase-radio[data-oid="SP_TTE_FULL_ENDPOINT"]', after=1500)
            d.line("4_4")
            d.line_over("4_5")
            d.select('select.ep-phrase-slot-bc[data-slot="risk_origin"]',
                     label="Subject is Randomized", after=900)
            # Multi-valued slot: both events, joined with "or".
            d.line_over("4_6")
            d.select('select.ep-phrase-slot-bc[data-slot="event"]',
                     label=["Overall Response", "Solicited Adverse Event"], after=1100)
            d.line_over("4_7")
            d.select('select.ep-phrase-slot-bc[data-slot="censoring_event"]',
                     label="Overall Response", after=1100)
            # Population BEFORE grouping: clause order follows check order.
            d.line_over("4_8")
            d.check('input.ep-dim-phrase-cb[data-oid="SP_POPULATION"]', after=800)
            d.check('input.ep-dim-phrase-cb[data-oid="SP_GROUPING"]', after=800)
            d.select("select.ep-cube-add-dim", value="Parameter", after=800)
            ctrls = pg.evaluate("""() => [...document.querySelectorAll('.ep-cube-slice-value')].map(e => ({
                idx:e.dataset.idx,
                dim:(window.appState.endpointSpecs.Endpoint_1.cubeDimensions[+e.dataset.idx]||{}).dimension}))""")
            for c in ctrls:
                sel = f'.ep-cube-slice-value[data-idx="{c["idx"]}"]'
                if c["dim"] == "Parameter":
                    d.type(sel, "Progression-Free Survival (Days)", after=900)
                elif c["dim"] == "Population":
                    d.select(sel, label="Population_1", after=900)
            d.line("4_9")

        # ---- 5. Choose the analysis ----------------------------------------
        with Beat(d, 5, "Analysis"):
            d.click("text=Summary measure", after=1200)
            d.line("5_1")
            d.line_over("5_2")
            d.click('.ep-library-card[data-transform-oid="T.OS_LogRank"]', after=1800)
            # Resolved bindings first, then down to the estimand panel.
            # The specification reads top-down: what goes in, what is done, what
            # comes out -- then the estimand that all three imply.
            d.line("5_3")          # what goes in
            d.scroll(300)
            d.line("5_4")          # the bindings table
            d.scroll(300)
            d.line("5_5")          # model expression
            d.line("5_6")          # method configuration
            d.scroll(280)
            d.line("5_7")          # declared outputs
            d.scroll(400)
            d.line("5_8")          # the estimand assembles itself
            d.line("5_9")
            d.line("5_10")

        # ---- 6. Summary ------------------------------------------------------
        with Beat(d, 6, "Summary"):
            d.click("text=Review all endpoints", after=1200)
            d.line("6_1")
            d.scroll(500)
            d.line("6_2")

        # ---- 7. eSAP builder -------------------------------------------------
        with Beat(d, 7, "eSAP builder"):
            d.click("text=Generate analysis plan", after=1500)
            d.line("7_1")

            # 1.1 Objectives, Endpoints and Estimands -> link the protocol's own
            # primary objective from the USDM narrative.
            d.line_over("7_2")
            d.click('button.btn-link-usdm >> nth=1', after=1400)
            d.line("7_3")
            d.click('text=2.1 Primary Objective', after=1200)   # row click renders the preview
            d.line("7_4")                                        # the objective text
            d.check('input[type=checkbox][data-nci-id="NarrativeContentItem_14"]', after=800)
            d.line_over("7_5")
            d.click('button:has-text("Apply")', after=1800)
            d.line("7_6")                                        # Linked (1) + embedded text

            d.scroll(380)
            # Section 4 — open the endpoint's analysis to show what the plan embeds:
            # the formalized sentence, the method, the model expression, the outputs.
            row = 'details:has(> summary span.badge-blue) > summary'
            pg.locator(row).first.scroll_into_view_if_needed()
            pg.wait_for_timeout(700)
            d.line_over("7_7")
            d.click(row, after=2400)
            d.scroll(200)
            d.line("7_8")
            d.line_over("7_9")
            d.click('button:has-text("{ } JSON")', after=2000)
            d.scroll(380)
            d.line("7_10")
            d.line("7_11")

        # ---- 8. Derivation pipeline -----------------------------------------
        with Beat(d, 8, "Derivations + load Scenario 5"):
            d.click("text=Dependent derivation pipeline", after=1200)
            d.line("8_1")
            d.line_over("8_2")
            with pg.expect_file_chooser() as fc:
                d.click("#btn-load-instance", after=400)
            fc.value.set_files(S5)
            pg.wait_for_timeout(2200)
            d.click("text=Dependent derivation pipeline", after=1500)
            d.line("8_3")          # eleven steps
            d.scroll(300)
            d.line("8_4")          # naming them
            d.line("8_5")
            d.scroll(360)
            d.line("8_6")          # graph root
            d.scroll(180)
            d.line("8_7")
            d.line("8_8")

        # ---- 9. Execute -------------------------------------------------------
        with Beat(d, 9, "Execute"):
            d.click("text=Run analysis via WebR", after=1200)
            d.line("9_1")
            d.line_over("9_2")     # plays while the engine boots
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
            d.line_over("9_3")
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
            d.line_over("9_3b")
            d.select(".exec-dataset-select", label="ze (923)", after=1100)
            # The resolved-slices table sits ~1030px down -- below the fold at this
            # point, so the population binding happened off-screen while the
            # narration described it. Scroll it into view first.
            d.scroll(380)
            d.line_over("9_4")
            d.select('.exec-slice-aux-select[data-concept="Population"]', value="adsl", after=1200)
            d.select('.exec-slice-val-override[data-dim="Population"]', value="Y", after=1200)
            d.dwell(1200)          # let the bound slice read on screen
            d.line_over("9_5")
            d.click('button:has-text("Run all")', after=1200)
            for _ in range(60):
                pg.wait_for_timeout(1000)
                if "CHI_SQUARED" in pg.evaluate("() => document.body.innerText"):
                    break
            pg.wait_for_timeout(1200)
            d.scroll(900, steps=9)
            d.line("9_6")
            d.line("9_7")

        total = time.time() - d.t0
        print(f"\nwalkthrough finished in {int(total//60)}:{int(total%60):02d}")
        json.dump(d.log, open(os.path.join(OUT, f"beats-{LABEL}.json"), "w"), indent=2)
        json.dump(d.cues, open(os.path.join(OUT, f"cues-{LABEL}.json"), "w"), indent=2, sort_keys=True)
        missing = [k for k in LINES if k not in d.cues]
        if missing:
            print(f"WARNING: {len(missing)} narration lines never cued: {missing}")
        print(f"cues logged: {len(d.cues)}/{len(LINES)}")

        path = pg.video.path()
        ctx.close(); b.close()
        print("video:", path)
        return path

if __name__ == "__main__":
    main()
