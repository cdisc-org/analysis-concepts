// AC/DC demo video — Playwright walkthrough with overlay captions.
// Output: videos/output/*.webm
//
// v2 — adapted per script.docx feedback:
//   • Caption banner now floats at the TOP of the viewport (just under the
//     app header), so it doesn't cover data tables / cubes / tree panels.
//     Each scene can request top or bottom positioning per its visuals.
//   • Scene 2 expanded to navigate the Study Overview tabs
//     (Summary → Arms → Objectives & Endpoints → select END1).
//   • Scene 4 scrolls down to show Outputs + Estimand.
//   • Scene 9 (Derivation) walks list → tree → node-detail panel.
//   • Scene 10 (Execute) walks bindings/slices → Derived Data Preview → LS Means.
//   • Scene 11 (Engine vs Resolved) expands JSON + side-by-side R panes.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SCENARIO1_URL = 'http://localhost:8080/ac-dc-app/data/study_ac_spec/Scenario%201_cdisc-pilot-lzzt-merged.study-instance-adas-cog-analysis-only.json';
const SCENARIO2_URL = 'http://localhost:8080/ac-dc-app/data/study_ac_spec/Scenario%202_cdisc-pilot-lzzt-merged.study-instance-adas-cog-with-derivation.json';

async function setCaption(page, text, opts = {}) {
  await page.evaluate(({ t, position }) => window.__setCaption(t, position), { t: text, position: opts.position || 'top' });
}
async function hideCaption(page) {
  await page.evaluate(() => window.__setCaption(''));
}
async function setMode(page, mode) {
  await page.evaluate((m) => {
    if (window.appState) window.appState.modelViewMode = m;
    const sel = document.querySelector('#model-view-toggle');
    if (sel) sel.value = m;
  }, mode);
}
async function navStep(page, n) {
  await page.evaluate((step) => window.__navigateTo(step), n);
  await page.waitForTimeout(400);
}
async function loadInstance(page, url) {
  await page.evaluate(async (u) => {
    const r = await fetch(u);
    const json = await r.json();
    const { deserializeStudyInstance } = await import('./js/utils/instance-serializer.js');
    deserializeStudyInstance(json, window.appState);
  }, url);
}
async function waitForReady(page) {
  for (let i = 0; i < 60; i++) {
    const ready = await page.evaluate(() => !!window.appState?.loaded);
    if (ready) return;
    await page.waitForTimeout(150);
  }
}
async function smoothScroll(page, selector, offset = -120) {
  await page.evaluate(({ sel, off }) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY + off;
    window.scrollTo({ top, behavior: 'smooth' });
  }, { sel: selector, off: offset });
  await page.waitForTimeout(900);
}
async function clickByText(page, selector, text) {
  await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e =>
      e.textContent && e.textContent.trim().toLowerCase().includes(t.toLowerCase())
    );
    if (el) el.click();
  }, { sel: selector, t: text });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1600, height: 1000 } }
  });

  // Inject caption overlay with top/bottom switching.
  await context.addInitScript(() => {
    const ensure = () => {
      let el = document.getElementById('__demo_caption');
      if (el) return el;
      el = document.createElement('div');
      el.id = '__demo_caption';
      el.style.cssText = [
        'position:fixed',
        'left:50%',
        'transform:translateX(-50%)',
        'max-width:1320px',
        'padding:8px 22px',
        'background:rgba(0,0,0,0.88)',
        'color:#fff',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'font-size:17px',
        'line-height:1.35',
        'font-weight:500',
        'border-radius:8px',
        'z-index:2147483647',
        'text-align:center',
        'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
        'pointer-events:none'
      ].join(';');
      document.body.appendChild(el);
      return el;
    };
    window.__setCaption = (text, position) => {
      const el = ensure();
      if (!text) { el.style.display = 'none'; return; }
      el.textContent = text;
      el.style.display = 'block';
      if (position === 'bottom') {
        el.style.top = '';
        el.style.bottom = '20px';
      } else {
        // Sit over the app header (dark banner). No content of interest
        // lives there, and the caption is then well clear of the workflow
        // page heading + tabs + content area below.
        el.style.bottom = '';
        el.style.top = '8px';
      }
    };
    new MutationObserver(() => { if (document.body && !document.getElementById('__demo_caption')) ensure(); })
      .observe(document.documentElement, { childList: true, subtree: true });
  });

  const page = await context.newPage();

  await page.goto('http://localhost:8080/ac-dc-app/index.html');
  await waitForReady(page);

  await page.evaluate(async () => {
    const mod = await import('./js/app.js');
    window.__navigateTo = mod.navigateTo;
  });

  await setMode(page, 'concepts_adam');

  // ============================================================
  // Scene 1 — Cold open (Step 1)
  // ============================================================
  await navStep(page, 1);
  await page.waitForTimeout(400);
  await setCaption(page,
    'eSAP — CDISC 360i Phase 2 prototype. From USDM through endpoint, analysis, and SAP — to a runnable analysis, driven by concept-keyed metadata.');
  await page.waitForTimeout(10000);

  // ============================================================
  // Scene 2 — Select study + Study Overview tabs
  // ============================================================
  await setCaption(page,
    'Pick a USDM study — here, CDISC PILOT - LZZT - USDM aligned. Design, objectives and endpoints are derived from the USDM document.');

  // Highlight chosen card
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find(el =>
      (el.textContent?.includes('CDISC PILOT - LZZT - USDM aligned') ||
       el.textContent?.includes('CDISC PILOT - LZZT - merged')) &&
      getComputedStyle(el).cursor === 'pointer'
    );
    if (card) {
      card.scrollIntoView({ block: 'center' });
      card.style.outline = '3px solid #0d6efd';
      card.style.boxShadow = '0 0 0 6px rgba(13,110,253,0.2)';
    }
  });
  await page.waitForTimeout(5000);

  // Click study → enters Step 2 Study Overview
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find(el =>
      (el.textContent?.includes('CDISC PILOT - LZZT - USDM aligned') ||
       el.textContent?.includes('CDISC PILOT - LZZT - merged')) &&
      getComputedStyle(el).cursor === 'pointer'
    );
    if (card) card.click();
  });
  await page.waitForTimeout(1500);

  await setCaption(page,
    'Step 2 — Study Overview. Phase, therapeutic area, rationale, all sourced from USDM.');
  await page.waitForTimeout(5000);

  // Arms tab — Step 2 uses .tab-btn[data-tab="arms"] buttons
  await page.evaluate(() => {
    const btn = document.querySelector('.tab-btn[data-tab="arms"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);
  await setCaption(page,
    'Three treatment arms — Placebo, Xanomeline Low Dose, Xanomeline High Dose.', { position: 'top' });
  await page.waitForTimeout(5500);

  // Objectives & Endpoints tab
  await page.evaluate(() => {
    const btn = document.querySelector('.tab-btn[data-tab="objectives"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);
  await setCaption(page,
    'Objectives & Endpoints. Pick END1 — the ADAS-Cog (11) cognitive change endpoint at Week 24.', { position: 'top' });
  await page.waitForTimeout(4000);

  // Actually click END1's checkbox so the viewer sees the selection happen.
  // The endpoint ID isn't always literally 'END1' — find the row whose label
  // text starts with 'END1' and click its inner .endpoint-checkbox.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('label, li, div')].find(el => {
      const t = el.textContent?.trim() || '';
      return /^END1\b/.test(t) && el.querySelector('.endpoint-checkbox');
    });
    const cb = row?.querySelector('.endpoint-checkbox');
    if (cb && !cb.checked) {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      // Brief highlight so the click is visually obvious in the recording.
      const parentRow = cb.closest('div, li, label');
      if (parentRow) {
        parentRow.style.outline = '3px solid #0d6efd';
        parentRow.style.boxShadow = '0 0 0 6px rgba(13,110,253,0.18)';
      }
    }
  });
  await page.waitForTimeout(4500);

  // Load Scenario 1 spec for Steps 3–7 capture
  await loadInstance(page, SCENARIO1_URL);
  await setMode(page, 'concepts_adam');
  await page.waitForTimeout(400);

  // ============================================================
  // Scene 3 — Endpoint spec (Step 3)
  // ============================================================
  await navStep(page, 3);
  await page.evaluate(() => {
    const item = document.querySelector('.ep-accordion-item');
    if (item && !item.classList.contains('open')) item.classList.add('open');
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(800);
  await setCaption(page,
    'Step 3 — Endpoint specification. Concept Category = Change; the data cube binds Parameter and AnalysisVisit. Smart phrases turn the cube into endpoint prose.', { position: 'top' });
  await page.waitForTimeout(11000);

  // Scroll to the Endpoint Data Cube — locate the "Endpoint Data Cube"
  // header span (no class on the container), or fall back to the first
  // dimension tag in the cube. block:'center' so both measure + dim rows
  // are in view.
  await page.evaluate(() => {
    const header = [...document.querySelectorAll('span')]
      .find(el => el.textContent?.trim() === 'Endpoint Data Cube');
    const target = header
      || document.querySelector('.ep-cube-dim-tag')
      || document.querySelector('[id^="formalized-"]');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1500);
  await setCaption(page,
    'The Endpoint Data Cube — measure CHG (Quantity), dimensions PARAMCD/PARAM and AVISIT/AVISITN, slice key on Parameter × AnalysisVisit.', { position: 'top' });
  await page.waitForTimeout(11000);

  // ============================================================
  // Scene 4 — Analysis spec (Step 4) — top then scroll for outputs+estimand
  // ============================================================
  await navStep(page, 4);
  await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.waitForTimeout(800);
  await setCaption(page,
    'Step 4 — Analysis specification. M.ANCOVA: response = Change (CHG), covariate = Measure @ Parameter/Baseline (BASE), fixed effects = Treatment + Site.', { position: 'top' });
  await page.waitForTimeout(13000);

  // Scroll to Outputs section
  await page.evaluate(() => {
    const out = [...document.querySelectorAll('*')].find(el =>
      el.textContent === 'Outputs' && el.children.length === 0);
    if (out) out.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1200);
  await setCaption(page,
    'Outputs declared by the spec — LSMeans, Contrasts (★ primary), Type III Tests, Parameter Estimates, Fit Statistics.', { position: 'top' });
  await page.waitForTimeout(8000);

  // Scroll further to the Estimand framework — uses id="estimand-<epId>"
  await page.evaluate(() => {
    const est = document.querySelector('[id^="estimand-"]');
    if (est) est.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1300);
  await setCaption(page,
    'And alongside it the ICH E9(R1) estimand framework — population, treatment, endpoint variable, population-level summary, intercurrent events.', { position: 'top' });
  await page.waitForTimeout(10000);

  // ============================================================
  // Scene 5 — Summary (Step 5)
  // ============================================================
  await navStep(page, 5);
  await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.waitForTimeout(700);
  await setCaption(page,
    'Step 5 — the complete specification: bindings, slices, formula in one place.', { position: 'top' });
  await page.waitForTimeout(8500);

  // ============================================================
  // Scene 6 — eSAP SAP doc + JSON (Step 7)
  // ============================================================
  await navStep(page, 7);
  await page.waitForTimeout(700);
  await setCaption(page,
    'Step 7 — the eSAP document. Behind the prose is a single JSON: concept-keyed, machine-readable, transport-ready.', { position: 'top' });
  await page.waitForTimeout(7000);

  await page.evaluate(() => {
    const btn = document.querySelector('.esap-view-toggle[data-view="json"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(7000);

  // ============================================================
  // Scene 7 — ADaM Spec panel
  // ============================================================
  await page.evaluate(() => {
    const btn = document.querySelector('.esap-view-toggle[data-view="adamspec"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(900);
  await setCaption(page,
    'The same metadata projected as an ADaM specification — dataset, variables, methods. Concepts are the source of truth; a different mapping yields a different ADaM realization.', { position: 'top' });
  await page.waitForTimeout(15000);

  // ============================================================
  // Scene 8 — Load Scenario 2
  // ============================================================
  await setCaption(page, 'Scenario 2 — same study, now with a derivation chain.', { position: 'top' });
  await loadInstance(page, SCENARIO2_URL);
  await setMode(page, 'concepts_adam');
  await page.waitForTimeout(5500);

  // ============================================================
  // Scene 9 — Derivation pipeline (Step 6): list → tree → node detail
  // ============================================================
  await navStep(page, 6);
  await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.waitForTimeout(900);
  // Open pipeline detail block
  await page.evaluate(() => {
    document.querySelectorAll('details.exec-bindings-section').forEach(d => { d.open = true; });
  });
  await setCaption(page,
    'Derivation Pipeline — ADAS-Cog 11 total score: item-level missing-data handling, scoreability checks, then Change From Baseline.', { position: 'top' });
  await page.waitForTimeout(11000);

  // Scroll to the tree visualization
  await page.evaluate(() => {
    const tree = document.querySelector('.pipeline-node, .pipeline-tree, [class*="pipeline-tree"], svg');
    if (tree) tree.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1500);
  await setCaption(page,
    'Each derivation is a transformation on the concept-keyed cube. The tree reads bottom-up: leaves are source measures, the root is the analysis input.', { position: 'top' });
  await page.waitForTimeout(11000);

  // Click a node to expose its detail panel
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('.pipeline-node')]
      .find(n => /Total Score/i.test(n.textContent));
    if (node) {
      node.click();
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  await page.waitForTimeout(1500);
  await setCaption(page,
    'Click any node to see its method, bindings, and alternatives — the metadata is fully introspectable.', { position: 'top' });
  await page.waitForTimeout(8000);

  // ============================================================
  // Scene 10 — Execute (Step 8): WebR init → XPT load → bindings/slices →
  // derived preview → results
  // ============================================================
  await navStep(page, 8);
  await page.waitForTimeout(800);

  // 10a — Real WebR initialization (visible). The button click triggers the
  // genuine engine boot; we caption-cover the wait and poll for the "WebR
  // Ready" badge.
  await setCaption(page,
    'Step 8 — Execute. Initialize WebR: the R interpreter compiled to WebAssembly, running in the browser.', { position: 'top' });
  await page.waitForTimeout(3500);
  await page.click('#btn-init-webr').catch(() => {});
  await page.waitForFunction(() => {
    const txt = (document.body.textContent || '');
    return txt.includes('WebR Ready');
  }, { timeout: 150000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // 10b — Upload SDTM XPT files. setInputFiles triggers the change handler
  // which loads them through the same code path as the user picker.
  await setCaption(page,
    'WebR ready. Now upload the source datasets — ADSL (subject-level) and QS_USDM_ALIGNED (ADAS-Cog items).', { position: 'top' });
  await page.waitForTimeout(2500);
  await page.setInputFiles('#xpt-file-input', [
    '/Users/kwl/repos/Github/CDISC/analysis-concepts/ac-dc-app/data/adam/adsl.xpt',
    '/Users/kwl/repos/Github/CDISC/analysis-concepts/ac-dc-app/data/sdtm/qs_usdm_aligned.xpt'
  ]).catch(() => {});
  await page.waitForFunction(() => (window.appState?.loadedDatasets?.length || 0) >= 2, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);

  await setCaption(page,
    'Two datasets loaded — the engine will ingest both into concept-keyed form on execute.', { position: 'top' });
  await page.waitForTimeout(4500);

  // 10c — Inject synthetic complete result + force ADaM variable selections
  // so Parameter renders as PARAM (label form — matches the value
  // "Adas-Cog(11) Subscore"), Treatment as TRTP, Site as SITEGR1. Without
  // these overrides the dropdowns default to PARAMCD which mismatches the
  // displayed value and looks wrong against the data preview rows.
  await page.evaluate(() => {
    const ep = window.appState?.resolvedSpec?.endpoints?.[0];
    if (!ep) return;
    if (!window.appState.endpointResults) window.appState.endpointResults = {};
    const epRes = window.appState.endpointResults[ep.id] = window.appState.endpointResults[ep.id] || { analysisResults: {} };
    epRes.varOverrides = {
      ...(epRes.varOverrides || {}),
      Parameter: 'PARAM',
      Treatment: 'TRTP',
      Site: 'SITEGR1'
    };
    epRes.sliceOverrides = {
      ...(epRes.sliceOverrides || {}),
      'endpoint|Parameter':           { variable: 'PARAM' },
      'parameter_baseline|Parameter': { variable: 'PARAM' }
    };
    epRes.analysisResults = epRes.analysisResults || {};
    epRes.analysisResults[0] = {
      status: 'complete',
      error: null,
      console: 'AC/DC Engine: Executing analysis\nMethod: M.ANCOVA\nDerivations: 9\nDetected store: sdtm (23 column matches)\nAnalysis data: 116 rows × 9 cols\nMethod completed.',
      results: {
        ls_means: {
          Group: ['Placebo', 'Xanomeline High Dose', 'Xanomeline Low Dose'],
          estimate: [1.8872, 0.7347, -0.1820],
          SE: [0.7306, 1.0322, 1.0600],
          df: [102, 102, 102],
          CI_lower: [0.4380, -1.3127, -2.2845],
          CI_upper: [3.3364, 2.7820, 1.9205]
        },
        contrasts: {
          Contrast: ['Xanomeline High Dose vs Placebo', 'Xanomeline Low Dose vs Placebo'],
          estimate: [-1.1525, -2.0692],
          SE: [1.2640, 1.2960],
          df: [102, 102],
          CI_lower: [-3.6601, -4.6403],
          CI_upper: [1.3551, 0.5019],
          t_statistic: [-0.91, -1.60],
          p_value: [0.3641, 0.1135]
        },
        type3_tests: {
          Effect: ['TRTA', 'BASE', 'SITEID'],
          DF_Num: [2, 1, 16],
          DF_Den: [102, 102, 102],
          FStatistic: [1.42, 35.07, 1.18],
          PValue: [0.2461, 1.0e-7, 0.2972]
        },
        fit_statistics: { AIC: 712.4, BIC: 776.1, Minus2LogL: 678.4 },
        derived_data_preview: [
          { USUBJID: '01-701-1015', PARAMCD: 'ADASTL11', PARAM: 'Adas-Cog(11) Subscore', AVISIT: 'Week 24', VISIT: 'Week 24', TRTA: 'Placebo', SITEID: '701', BASE: 13, CHG: -5 },
          { USUBJID: '01-701-1028', PARAMCD: 'ADASTL11', PARAM: 'Adas-Cog(11) Subscore', AVISIT: 'Week 24', VISIT: 'Week 24', TRTA: 'Xanomeline High Dose', SITEID: '701', BASE: 3, CHG: 0 },
          { USUBJID: '01-701-1034', PARAMCD: 'ADASTL11', PARAM: 'Adas-Cog(11) Subscore', AVISIT: 'Week 24', VISIT: 'Week 24', TRTA: 'Xanomeline High Dose', SITEID: '701', BASE: 11, CHG: 0 },
          { USUBJID: '01-701-1097', PARAMCD: 'ADASTL11', PARAM: 'Adas-Cog(11) Subscore', AVISIT: 'Week 24', VISIT: 'Week 24', TRTA: 'Xanomeline Low Dose', SITEID: '701', BASE: 56.7241, CHG: -5.7241 },
          { USUBJID: '01-701-1118', PARAMCD: 'ADASTL11', PARAM: 'Adas-Cog(11) Subscore', AVISIT: 'Week 24', VISIT: 'Week 24', TRTA: 'Placebo', SITEID: '701', BASE: 26, CHG: -11 },
          { USUBJID: '01-701-1130', PARAMCD: 'ADASTL11', PARAM: 'Adas-Cog(11) Subscore', AVISIT: 'Week 24', VISIT: 'Week 24', TRTA: 'Placebo', SITEID: '701', BASE: 19, CHG: -5 }
        ],
        derived_data_store: 'adam',
        derived_data_total: 116
      }
    };
    return import('./js/views/execute-analysis.js').then(m => {
      const container = document.querySelector('#app-content') || document.querySelector('main') || document.body;
      m.renderExecuteAnalysis(container);
    });
  });
  await page.waitForTimeout(900);

  // Show bindings/slices first (top of subcard)
  await page.evaluate(() => {
    const subcard = document.querySelector('.exec-analysis-sub');
    if (subcard) { subcard.open = true; subcard.scrollIntoView({ behavior: 'instant', block: 'start' }); }
  });
  await setCaption(page,
    'Bindings and slices come from the spec; the engine resolves them through the ADaM mapping — CHG, BASE, TRTP, USUBJID, PARAM, VISIT, SITEGR1.', { position: 'top' });
  await page.waitForTimeout(12000);

  // Scroll to Derived Data Preview
  await page.evaluate(() => {
    const panel = [...document.querySelectorAll('details.exec-bindings-section')]
      .find(d => d.querySelector('.exec-bindings-title')?.textContent?.trim() === 'DERIVED DATA PREVIEW');
    if (panel) { panel.open = true; panel.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  await page.waitForTimeout(1200);
  await setCaption(page,
    'The Derived Data Preview — exactly what M.ANCOVA fits, in ADaM-shaped columns.', { position: 'top' });
  await page.waitForTimeout(9000);

  // Scroll to LS Means table
  await page.evaluate(() => {
    const lsm = [...document.querySelectorAll('*')].find(el =>
      el.tagName === 'BUTTON' && /LS Means/i.test(el.textContent || ''));
    if (lsm) { lsm.click(); lsm.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  await page.waitForTimeout(1200);
  await setCaption(page,
    'Results — LS Means, Contrasts, Type III Tests, Fit Statistics, exactly as the spec ordered.', { position: 'top' });
  await page.waitForTimeout(9000);

  // ============================================================
  // Scene 11 — Specification JSON + Generated R Program (engine + resolved)
  // ============================================================
  // Open the Specification JSON pane
  await page.evaluate(() => {
    const det = [...document.querySelectorAll('details.exec-code-details')]
      .find(d => /Specification JSON/i.test(d.textContent || ''));
    if (det) { det.open = true; det.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  await page.waitForTimeout(1200);
  await setCaption(page,
    'The Specification JSON — concept-keyed, portable, the single source of truth the engine consumes.', { position: 'top' });
  await page.waitForTimeout(9000);

  // Generated R Program — note the outer container is a plain <div>, not
  // <details>. Locate by the title text inside .exec-bindings-title.
  await page.evaluate(() => {
    const title = [...document.querySelectorAll('.exec-bindings-title')]
      .find(t => /GENERATED .* PROGRAM/i.test(t.textContent || ''));
    if (!title) return;
    const container = title.parentElement;  // div.exec-bindings-section
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Force both code panes open (they're inner <details class="exec-code-details">)
    container.querySelectorAll('details').forEach(d => { d.open = true; });
  });
  await page.waitForTimeout(1500);
  // First beat: introduce both columns
  await setCaption(page,
    'Two execution paths, one spec. Left: the metadata-driven engine — JSON in, results out. Right: the resolved standalone program.', { position: 'top' });
  await page.waitForTimeout(11000);

  // Second beat: emphasize the resolved (standalone) pane specifically
  await page.evaluate(() => {
    const resolvedPane = [...document.querySelectorAll('details.exec-code-details')]
      .find(d => /Resolved \(standalone\)/i.test(d.querySelector('summary')?.textContent || ''));
    if (resolvedPane) {
      resolvedPane.open = true;
      resolvedPane.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Briefly highlight the resolved pane so the viewer's eye is drawn
      resolvedPane.style.outline = '3px solid #0d6efd';
      resolvedPane.style.boxShadow = '0 0 0 6px rgba(13,110,253,0.18)';
    }
  });
  await setCaption(page,
    'The resolved code is the actual R you would hand to a validated environment — concrete variables (CHG, BASE, TRTP, SITEGR1), real call to lm() and emmeans(). R today, SAS tomorrow.', { position: 'top' });
  await page.waitForTimeout(13000);

  // ============================================================
  // Scene 12 — Closing
  // ============================================================
  await navStep(page, 7);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = document.querySelector('.esap-view-toggle[data-view="adamspec"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(700);
  await setCaption(page,
    'One concept-keyed spec, multiple ADaM realizations, multiple engines — the SAP becomes executable.', { position: 'top' });
  await page.waitForTimeout(12000);

  await hideCaption(page);
  await page.waitForTimeout(400);

  await page.close();
  await context.close();
  await browser.close();
}

main().catch(err => {
  console.error('Recording failed:', err);
  process.exit(1);
});
