/*
 * Verification harness for the smartphrase demo.
 *
 *   node smartphrase/tools/verify.mjs                  # compare against goldens
 *   node smartphrase/tools/verify.mjs --update-goldens # recapture goldens
 *
 * The demo's data and engine files are browser IIFEs that attach to
 * globalThis when `window` is undefined, so they load under Node via vm
 * with no modification.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const demo = path.join(here, "..", "demo");
const goldenPath = path.join(here, "goldens.json");
const update = process.argv.includes("--update-goldens");

function load(rel) {
  const file = path.join(demo, rel);
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: rel });
}

load("data/acdc-library.js");
load("data/acdc-library-proposed.js");
load("data/study-graph.js");
load("data/study-graph-pre0102.js");
load("data/lang-overlay.js");
load("engine.js");

const E = globalThis.SP_ENGINE;
const LIB = globalThis.ACDC_LIBRARY;
const I18N = globalThis.LANG_OVERLAY;

const failures = [];
const captured = {};

function record(key, value) {
  captured[key] = value;
}

function check(name, cond, detail) {
  if (!cond) failures.push(name + (detail ? " — " + detail : ""));
}

/* ---- graphs under test: every study in the registry ---- */
const graphs = globalThis.STUDY_GRAPHS || { CDISCPILOT01: globalThis.STUDY_GRAPH };

for (const [studyKey, graph] of Object.entries(graphs)) {
  const ctx = E.ctxOf(LIB, graph, I18N);

  for (const inst of graph.instances) {
    /* resolved sentence per available language */
    for (const lang of E.availableLangs(ctx)) {
      const res = E.resolveInstance(ctx, inst, lang);
      record(`${studyKey}/${inst.id}/sentence/${lang}`, res.sentence);
      check(
        `${studyKey}/${inst.id} resolves with no errors (${lang})`,
        res.errors.length === 0,
        JSON.stringify(res.errors)
      );

      /* Localisation completeness: every phrase must have a per-language
         template in every non-English pack (English is the source). */
      if (lang !== "en") {
        const missing = res.phrases.filter((p) => p.langFallback).map((p) => p.oid);
        check(
          `${studyKey}/${inst.id} has no untranslated phrases (${lang})`,
          missing.length === 0,
          missing.join(", ")
        );
      }
    }

    /* constructed model view */
    const mv = E.constructModelView(ctx, inst);
    record(`${studyKey}/${inst.id}/modelView`, mv);
    check(
      `${studyKey}/${inst.id} model view has no errors`,
      !mv.errors || mv.errors.length === 0,
      JSON.stringify(mv.errors)
    );
    check(
      `${studyKey}/${inst.id} every sliceKey is filled`,
      (mv.sliceKeys || []).every((sk) => sk.value !== null && sk.value !== undefined),
      JSON.stringify((mv.sliceKeys || []).filter((sk) => !sk.value))
    );

    /* tag dialect round-trip must be byte-equal */
    const src = E.toMacroText(ctx, inst);
    record(`${studyKey}/${inst.id}/macro`, src);
    const parsed = E.parseMacroText(ctx, src, inst);
    check(
      `${studyKey}/${inst.id} macro round-trips without findings`,
      parsed.instancePatch !== null,
      JSON.stringify(parsed.findings)
    );
    if (parsed.instancePatch) {
      check(
        `${studyKey}/${inst.id} macro round-trip is byte-equal`,
        E.toMacroText(ctx, parsed.instancePatch) === src
      );
    }

    /* JSON-LD projection */
    record(`${studyKey}/${inst.id}/jsonld`, E.toJSONLD(ctx, inst));

    /* trace for every role that has a chain */
    for (const role of Object.keys(graph.traceTemplates)) {
      const chain = E.buildTrace(ctx, inst, role);
      if (!chain) continue;
      record(`${studyKey}/${inst.id}/trace/${role}`, chain);
      check(
        `${studyKey}/${inst.id} trace ${role} leaves no unfilled tokens`,
        !JSON.stringify(chain).includes("⟨"),
        JSON.stringify(chain)
      );
    }

    /* every phrase the instance uses must be valid for its template */
    const tpl = E.templateDef(ctx, inst.template);
    check(`${studyKey}/${inst.id} template ${inst.template} exists`, !!tpl);
    if (tpl && tpl.validSmartPhrases) {
      const bad = inst.phrases
        .map((p) => p.phrase)
        .filter((oid) => tpl.validSmartPhrases.indexOf(oid) === -1);
      check(
        `${studyKey}/${inst.id} uses only phrases valid for its template`,
        bad.length === 0,
        bad.join(", ")
      );
    }
  }
}

/* ---- planted faults must be caught ---- */
{
  const graph = graphs.CDISCPILOT01;
  const ctx = E.ctxOf(LIB, graph, I18N);
  const base = graph.instances[0];

  const unknownConcept = JSON.parse(JSON.stringify(base));
  unknownConcept.phrases[0].bindings[
    Object.keys(unknownConcept.phrases[0].bindings)[0]
  ] = { concept: "PARAM.DOES_NOT_EXIST" };
  check(
    "planted fault: unknown concept is reported",
    E.resolveInstance(ctx, unknownConcept).errors.length > 0
  );

  const badPhrase = E.parseMacroText(
    ctx,
    '<acdc:macro id="analysis" ref="T.CFB_ANCOVA" instance="X">\n' +
      '  <acdc:macro id="phrase" ref="SP_NOT_A_PHRASE" instance="p1"/>\n' +
      "</acdc:macro>",
    base
  );
  check(
    "planted fault: unknown phrase ref rejected",
    badPhrase.instancePatch === null &&
      badPhrase.findings.some((f) => f.level === "error")
  );

  const noWrapper = E.parseMacroText(ctx, "<p>not a macro block</p>", base);
  check("planted fault: missing wrapper rejected", noWrapper.instancePatch === null);
}

/* ---- proposed library additions ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const tpl = E.templateDef(ctx, "T.PFS_KaplanMeier");
  check("proposed template T.PFS_KaplanMeier resolves", !!tpl);
  if (tpl) {
    check("proposed template is flagged proposed", tpl.proposed === true);
    check("proposed template's method is in the subset", !!LIB.methods[tpl.usesMethod]);
    const methodOutputs = LIB.methods[tpl.usesMethod].outputs.map((o) => o.name);
    const declared = tpl.outputDataStructure.measures.map((m) => m.output);
    const unknown = declared.filter((o) => methodOutputs.indexOf(o) === -1);
    check("proposed template declares only real method outputs", unknown.length === 0, unknown.join(", "));
    const unknownPhrases = tpl.validSmartPhrases.filter((oid) => !E.phraseDef(ctx, oid));
    check("proposed template's validSmartPhrases all exist", unknownPhrases.length === 0, unknownPhrases.join(", "));
  }
  check(
    "generated subset is not mutated by the overlay",
    LIB.transformations.every((t) => t.conceptId !== "T.PFS_KaplanMeier")
  );

  /* Proposed ROLES reach ctx.lib at their declared insertion point, and the
     generated subset is untouched — the same overlay discipline as templates. */
  const order = ctx.lib.roleDefinitions.order;
  check("proposed role ice_handling is in ctx.lib order", order.indexOf("ice_handling") !== -1);
  check("proposed role summary_measure is in ctx.lib order", order.indexOf("summary_measure") !== -1);
  check(
    "ice_handling sits immediately after grouping",
    order.indexOf("ice_handling") === order.indexOf("grouping") + 1,
    order.join(",")
  );
  check("summary_measure sits last", order[order.length - 1] === "summary_measure", order.join(","));
  check(
    "generated subset role order is not mutated",
    LIB.roleDefinitions.order.indexOf("ice_handling") === -1
  );
  check(
    "proposed roles are flagged proposed",
    ["ice_handling", "summary_measure"].every(
      (r) => ctx.lib.roleDefinitions.roles[r] && ctx.lib.roleDefinitions.roles[r].proposed === true
    )
  );
}

/* ---- compare or update ---- */
if (update) {
  fs.writeFileSync(goldenPath, JSON.stringify(captured, null, 2) + "\n");
  console.log(
    `goldens written: ${Object.keys(captured).length} entries -> ${path.relative(process.cwd(), goldenPath)}`
  );
} else if (!fs.existsSync(goldenPath)) {
  failures.push("no goldens.json — run with --update-goldens first");
} else {
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  for (const key of Object.keys(golden)) {
    if (!(key in captured)) {
      failures.push(`golden missing from run: ${key}`);
      continue;
    }
    const a = JSON.stringify(golden[key]);
    const b = JSON.stringify(captured[key]);
    if (a !== b) failures.push(`golden changed: ${key}\n  was: ${a}\n  now: ${b}`);
  }
  for (const key of Object.keys(captured)) {
    if (!(key in golden)) console.log(`new golden (not yet pinned): ${key}`);
  }
}

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} problem(s):`);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log(`PASS — ${Object.keys(captured).length} outputs checked, no failures.`);
