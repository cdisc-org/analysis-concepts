/*
 * Proves ac-dc-app/js/utils/smartphrase-engine.js is behaviour-identical to the
 * ported demo engine, against the 69 pinned goldens.
 *
 *   node scripts/verify_smartphrase_engine.mjs
 *
 * The demo's DATA files stay browser IIFEs and load under Node via vm; only the
 * ENGINE is converted to an ES module, so it is imported normally. If the two
 * ever disagree, the conversion changed behaviour.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const demo = path.join(root, "smartphrase", "demo");

for (const rel of [
  "data/acdc-library.js",
  "data/acdc-library-proposed.js",
  "data/study-graph.js",
  "data/study-graph-pre0102.js",
  "data/lang-overlay.js"
]) {
  vm.runInThisContext(fs.readFileSync(path.join(demo, rel), "utf8"), { filename: rel });
}

const { default: E } = await import(
  pathToFileURL(path.join(root, "ac-dc-app", "js", "utils", "smartphrase-engine.js")).href
);

const LIB = globalThis.ACDC_LIBRARY;
const I18N = globalThis.LANG_OVERLAY;
const PROPOSED = globalThis.ACDC_LIBRARY_PROPOSED;
const goldens = JSON.parse(
  fs.readFileSync(path.join(root, "smartphrase", "tools", "goldens.json"), "utf8")
);

const captured = {};
for (const [studyKey, graph] of Object.entries(globalThis.STUDY_GRAPHS)) {
  const ctx = E.ctxOf(LIB, graph, I18N, PROPOSED);
  for (const inst of graph.instances) {
    for (const lang of E.availableLangs(ctx)) {
      captured[`${studyKey}/${inst.id}/sentence/${lang}`] =
        E.resolveInstance(ctx, inst, lang).sentence;
    }
    captured[`${studyKey}/${inst.id}/modelView`] = E.constructModelView(ctx, inst);
    captured[`${studyKey}/${inst.id}/macro`] = E.toMacroText(ctx, inst);
    captured[`${studyKey}/${inst.id}/jsonld`] = E.toJSONLD(ctx, inst);
    for (const role of ["endpoint", "covariate", "timepoint", "grouping", "population"]) {
      const t = E.buildTrace(ctx, inst, role);
      if (t) captured[`${studyKey}/${inst.id}/trace/${role}`] = t;
    }
  }
}

const failures = [];
for (const key of Object.keys(goldens)) {
  if (!(key in captured)) { failures.push(`${key} — not produced`); continue; }
  const a = JSON.stringify(goldens[key]);
  const b = JSON.stringify(captured[key]);
  if (a !== b) failures.push(`${key} — differs\n    golden: ${a.slice(0, 160)}\n    actual: ${b.slice(0, 160)}`);
}

if (failures.length) {
  console.error(`FAIL — ${failures.length} of ${Object.keys(goldens).length} goldens differ:`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log(`PASS — ${Object.keys(goldens).length} goldens reproduced by the ES module engine.`);
