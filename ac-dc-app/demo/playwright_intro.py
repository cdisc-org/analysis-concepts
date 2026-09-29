"""A narrated introduction to driving ac-dc-app with Playwright.

Run it in front of someone: every step prints what it is about to do and what
came back, so the terminal tells the story while the work happens.

    python -m http.server 8080 --bind 127.0.0.1   # from the repo root
    python ac-dc-app/demo/playwright_intro.py            # headless, ~5 s
    python ac-dc-app/demo/playwright_intro.py --headed   # real window, slowed down

Nothing here is specific to this demo — it is the same six moves every probe and
the recorder are built from.
"""

import os
import sys
import time

from playwright.sync_api import sync_playwright

APP = "http://localhost:8080/ac-dc-app/"
HERE = os.path.dirname(os.path.abspath(__file__))


def step(n, title):
    print(f"\n\033[1m[{n}] {title}\033[0m", flush=True)


def show(label, value):
    print(f"      {label:<26} {value}", flush=True)


def main(headed=False):
    t0 = time.time()

    with sync_playwright() as p:
        # ------------------------------------------------------------------
        step(1, "Launch a browser")
        # Headless is the default -- nothing about the browser changes, only
        # whether a window is drawn. slow_mo paces each action so a person
        # watching can follow; it is pure presentation, never correctness.
        browser = p.chromium.launch(headless=not headed, slow_mo=450 if headed else 0)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        show("mode", "headed (watch the window)" if headed else "headless")
        build = next((seg for seg in p.chromium.executable_path.split(os.sep)
                      if seg.startswith("chromium-")), "chromium")
        show("browser build", build)

        # Console messages are the app talking back. Collecting them is how the
        # `l is not defined` crash in the option renderer was caught.
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # ------------------------------------------------------------------
        step(2, "Open the app")
        page.goto(APP)
        page.wait_for_timeout(1200)
        show("title", page.title())
        show("url", page.url)

        # ------------------------------------------------------------------
        step(3, "Read the app's own state, not the pixels")
        # This is the move that matters. ac-dc-app exposes window.appState, so
        # instead of scraping rendered text we ask the application what it
        # believes. Assertions become exact rather than approximate.
        state = page.evaluate("""() => ({
            loaded:       window.appState?.loaded,
            studies:      (window.appState?.studies || []).map(s => s.name ?? s),
            viewMode:     window.appState?.modelViewMode,
            mappings:     Object.keys(window.appState?.conceptMappings || {}),
        })""")
        for k, v in state.items():
            show(k, v)

        # ------------------------------------------------------------------
        step(4, "Click something, the way a person would")
        page.click("text=Breast Cancer Study PrE0102")
        page.wait_for_timeout(900)
        show("hash after click", page.evaluate("() => location.hash"))
        show("selected study", page.evaluate("() => window.appState.selectedStudy?.name"))

        # Reach into the study the app just parsed out of its USDM.
        usdm = page.evaluate("""() => {
            const s = window.appState.selectedStudy || {};
            return {
                arms:       (s.arms || []).length,
                objectives: (s.objectives || []).length,
                // endpoints hang off objectives -- the USDM shape, not a flat list
                endpoints:  (s.objectives || []).reduce((n, o) => n + (o.endpoints || []).length, 0),
                bcs:        (s.biomedicalConcepts || []).length,
            };
        }""")
        for k, v in usdm.items():
            show(f"usdm {k}", v)

        # ------------------------------------------------------------------
        step(5, "Drive a form control and watch state change")
        page.click('button:has-text("Objectives & Endpoints")')
        page.wait_for_timeout(700)
        before = page.evaluate("() => (window.appState.selectedEndpoints || []).length")
        page.locator("input[type=checkbox]").first.check()
        page.wait_for_timeout(700)
        after = page.evaluate("() => (window.appState.selectedEndpoints || []).length")
        show("endpoints selected", f"{before} -> {after}")
        # selectedEndpoints holds plain id strings, not objects.
        show("which", page.evaluate(
            "() => (window.appState.selectedEndpoints || []).map(e => e.name || e.id || e)"))

        # ------------------------------------------------------------------
        step(6, "Capture what it looks like")
        shot = os.path.join(HERE, "playwright_intro.png")
        page.screenshot(path=shot)
        show("screenshot", os.path.relpath(shot, os.getcwd()))
        show("console errors", [e for e in errors if "404" not in e] or "none")

        browser.close()

    print(f"\n\033[1mdone in {time.time() - t0:.1f}s\033[0m")
    print("""
What to take from this
  * The browser is real; only the window is missing (headless=True).
  * Step 3 is the important one. Asserting on window.appState means a test says
    "the spec now holds Population = Population_1", not "some text appeared".
  * Steps 4-5 are ordinary user actions. Anything a person can click, this can.
  * Add record_video_dir to new_context() and the same script produces the demo
    video -- that is all record_demo.py does, with narration pacing on top.
""")


if __name__ == "__main__":
    main(headed="--headed" in sys.argv)
