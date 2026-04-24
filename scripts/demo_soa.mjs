#!/usr/bin/env node
/**
 * Captions-only walkthrough of the Study SoA views.
 * Drives the running ac-dc-app via Playwright and records a WebM video.
 *
 * Usage:
 *   python3 ac-dc-app/serve.py            # in another terminal
 *   node scripts/demo_soa.mjs             # produces demo-output/<hash>.webm
 *
 * Override the app URL: SOA_APP_URL=http://localhost:8888/ac-dc-app/index.html node scripts/demo_soa.mjs
 */

import { chromium } from 'playwright';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const APP_URL = process.env.SOA_APP_URL ?? 'http://localhost:8080/ac-dc-app/index.html';
const OUT_DIR = 'demo-output';
const FINAL_NAME = 'soa-demo.webm';
const VIEWPORT = { width: 1440, height: 900 };

await mkdir(OUT_DIR, { recursive: true });

console.log(`[demo] recording walkthrough of ${APP_URL}`);
console.log(`[demo] viewport ${VIEWPORT.width}x${VIEWPORT.height}  →  ${OUT_DIR}/`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: OUT_DIR, size: VIEWPORT }
});
const page = await context.newPage();

// ---------- Caption overlay injected on every navigation ----------
await page.addInitScript(() => {
  window.__soaCaption = (text, opts = {}) => {
    let el = document.getElementById('__soa_caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__soa_caption';
      Object.assign(el.style, {
        position: 'fixed',
        bottom: '36px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '880px',
        padding: '14px 24px',
        background: 'rgba(19, 70, 120, 0.96)',
        color: 'white',
        borderRadius: '10px',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '19px',
        fontWeight: '500',
        lineHeight: '1.35',
        boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
        zIndex: '99999',
        opacity: '0',
        transition: 'opacity 0.25s ease',
        pointerEvents: 'none',
        textAlign: 'center'
      });
      document.body.appendChild(el);
    }
    el.textContent = text || '';
    el.style.opacity = opts.hide ? '0' : '1';
  };
});

const caption = (txt) => page.evaluate(t => window.__soaCaption(t), txt);
const hideCap = () => page.evaluate(() => window.__soaCaption('', { hide: true }));
const beat = (ms) => page.waitForTimeout(ms);

function logScene(n, desc) {
  console.log(`[demo] scene ${n}: ${desc}`);
}

try {
  // ---------- Load app ----------
  await page.goto(APP_URL);
  await page.waitForSelector('.study-card', { timeout: 15000 });
  // Wait for data-loader to finish — study cards arrive synchronously after loadAllData resolves
  await page.waitForSelector('.study-card .badge-soa', { timeout: 15000 });

  // ---------- Scene 1 — SoA-ready badge ----------
  logScene(1, 'Select Study page + SoA-ready badge');
  await caption('Studies with CDISC Library enrichment show a SoA-ready badge.');
  await beat(4500);

  // ---------- Scene 2 — click the enriched card ----------
  logScene(2, 'click SoA-ready study card');
  await caption('Select the enriched study to unlock the SoA views.');
  await beat(1500);
  await page.locator('.study-card:has(.badge-soa)').click();
  await page.waitForSelector('.tab-bar, [data-tab], #app-content', { timeout: 5000 });
  await beat(2500);

  // ---------- Scene 3 — open Protocol SoA ----------
  logScene(3, 'open Protocol SoA');
  await page.locator('[data-soa="protocol"]').click();
  await page.waitForSelector('.soa-table', { timeout: 5000 });
  await caption('Protocol SoA — generic Biomedical Concepts × Encounters.');
  await beat(4000);

  // ---------- Scene 4 — highlight epoch row + Baseline anchor ----------
  logScene(4, 'epoch row + Day-1 anchor');
  await caption('42 activities, 12 encounters, grouped by Epoch. Baseline is the Day-1 anchor.');
  await beat(6500);

  // ---------- Scene 5 — search "weight" ----------
  logScene(5, 'live search: weight');
  await page.locator('#soa-search').click();
  await caption('Live search: activity labels, BC names, synonyms, SDTM spec ids.');
  await beat(800);
  await page.locator('#soa-search').type('weight', { delay: 80 });
  await beat(4000);

  // ---------- Scene 6 — Escape clears ----------
  logScene(6, 'Esc clears filter');
  await caption('Escape clears the filter.');
  await page.locator('#soa-search').press('Escape');
  await beat(3000);

  // ---------- Scene 7 — click Body Weight BC ----------
  logScene(7, 'click Body Weight BC');
  const weightRow = page.locator('.soa-bc-clickable', { hasText: /Weight/i }).first();
  await weightRow.scrollIntoViewIfNeeded();
  await caption('Every BC drills into its CDISC Library parent definition.');
  await beat(1500);
  await weightRow.click();
  await page.waitForSelector('.soa-drillin:not(.hidden)', { timeout: 5000 });
  await beat(4500);

  // ---------- Scene 8 — pause on drill-in contents ----------
  logScene(8, 'pause on parent BC drill-in');
  await caption('Parent BC — Concept ID, definition and Data Element Concepts.');
  await beat(5500);

  // ---------- Scene 9 — close + switch to Detailed SoA ----------
  logScene(9, 'switch to Detailed SoA');
  await page.locator('.soa-drillin-close').click();
  await beat(500);
  await page.locator('[data-soa="detailed"]').click();
  await page.waitForSelector('.soa-table', { timeout: 5000 });
  await caption('Detailed SoA — cells now reference SDTM Dataset Specializations.');
  await beat(4000);

  // ---------- Scene 10 — search glucose ----------
  logScene(10, 'search glucose');
  await page.locator('#soa-search').click();
  await caption('Use search to find 1-to-many cases quickly.');
  await beat(800);
  await page.locator('#soa-search').type('glucose', { delay: 80 });
  await beat(3000);

  // ---------- Scene 11 — click Glucose, show 8 candidates ----------
  logScene(11, 'Glucose → 8 candidate specs');
  const glucoseRow = page.locator('.soa-bc-clickable', { hasText: /Glucose Measurement/i }).first();
  await glucoseRow.click();
  await page.waitForSelector('.soa-spec-candidate', { timeout: 5000 });
  await caption('Glucose Measurement maps to 8 SDTM specializations — urine, blood, serum, …');
  await beat(6500);

  // ---------- Scene 12 — expand a sibling ----------
  logScene(12, 'expand GLUCSERPL sibling');
  await caption('Click any sibling to inspect its variables.');
  const sibling = page.locator('.soa-spec-candidate', { hasText: 'GLUCSERPL' }).first();
  if (await sibling.count()) {
    await sibling.locator('.soa-spec-accordion-header').click();
  } else {
    // fallback: just open the second candidate if GLUCSERPL wasn't the label match
    const any = page.locator('.soa-spec-candidate:not(.selected) .soa-spec-accordion-header').first();
    if (await any.count()) await any.click();
  }
  await beat(5500);

  // ---------- Scene 13 — end card ----------
  logScene(13, 'end card');
  await caption('Study SoA — end of demo.');
  await beat(3000);
  await hideCap();
  await beat(500);
} finally {
  await context.close();   // flushes video
  await browser.close();
}

// ---------- Rename the auto-generated video to a stable name ----------
const files = (await readdir(OUT_DIR)).filter(f => f.endsWith('.webm'));
files.sort();
const latest = files[files.length - 1];
if (latest) {
  const target = join(OUT_DIR, FINAL_NAME);
  if (existsSync(target)) {
    // keep a backup of the prior demo
    await rename(target, target.replace(/\.webm$/, `.prev.webm`));
  }
  await rename(join(OUT_DIR, latest), target);
  console.log(`\n[demo] done → ${target}`);
} else {
  console.warn('[demo] no .webm produced');
}
