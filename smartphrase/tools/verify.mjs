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

/*
 * A copy of an instance with every phrase in the named roles removed. Fixtures
 * that add phrases must state their own precondition: several blocks below build
 * on a live study instance, and once that instance grew ICE phrases of its own,
 * "push two ICEs onto it" silently became "push two more".
 */
function without(ctx, inst, roles) {
  const copy = JSON.parse(JSON.stringify(inst));
  copy.phrases = copy.phrases.filter((p) => {
    const d = E.phraseDef(ctx, p.phrase);
    return !d || roles.indexOf(d.role) === -1;
  });
  return copy;
}
const ESTIMAND_ROLES = ["ice_handling", "summary_measure"];

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

    /* Estimand attribution. Every analysis instance references exactly one
       estimand in the study's registry and states its ICH E9(R1) role for it. */
    const est = E.estimandOf(ctx, inst);
    check(`${studyKey}/${inst.id} references a registered estimand`, !!est,
      "unresolved: " + JSON.stringify(inst.estimand));
    check(`${studyKey}/${inst.id} declares a typed analysisRole`,
      ["MainEstimator", "SensitivityAnalysis", "SupplementaryAnalysis"].indexOf(inst.analysisRole) !== -1,
      String(inst.analysisRole));
    check(`${studyKey}/${inst.id} model view carries the estimand`, !!mv.estimand);

    /*
     * Requirement 2 — every ICE the ESTIMAND declares carries exactly one
     * strategy for this analysis, whether stated by a phrase or inherited from
     * the event's study default. Before the estimand declared its ICE scope, an
     * analysis could silently omit an event its estimand declared and emit
     * handlesIntercurrentEvent: [] — reading as "handles no intercurrent
     * events", which is a different claim from "handles them as standard".
     */
    if (est) {
      const declared = est.intercurrentEvents || [];
      const handled = (mv.handlesIntercurrentEvent || []).map((h) => h.forIntercurrentEvent);
      check(`${studyKey}/${inst.id} accounts for every ICE its estimand declares`,
        declared.every((id) => handled.indexOf(id) !== -1),
        "declared " + JSON.stringify(declared) + " handled " + JSON.stringify(handled));
      check(`${studyKey}/${inst.id} handles no ICE outside its estimand's scope`,
        handled.every((id) => declared.indexOf(id) !== -1),
        "handled " + JSON.stringify(handled) + " declared " + JSON.stringify(declared));
      check(`${studyKey}/${inst.id} every handling names a strategy`,
        (mv.handlesIntercurrentEvent || []).every((h) => !!h.icheStrategy),
        JSON.stringify(mv.handlesIntercurrentEvent));
      /* An ICE phrase may only bind an event its estimand declares — otherwise
         the prose asserts a handling for something outside the question. */
      const phraseIces = inst.phrases
        .map((p) => ({ d: E.phraseDef(ctx, p.phrase), b: (p.bindings || {}).ice }))
        .filter((x) => x.d && x.d.role === "ice_handling" && x.b)
        .map((x) => x.b.concept);
      check(`${studyKey}/${inst.id} ICE phrases bind only declared events`,
        phraseIces.every((id) => declared.indexOf(id) !== -1),
        JSON.stringify(phraseIces));
    }

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

    /*
     * Trace every role the instance ACTUALLY USES, focused on each concept the
     * role binds. Both parts matter: tracing a role the instance has no phrase
     * for fills the chain from unrelated concepts (it produced "ADQSADAS.ITTFL"
     * — the endpoint's dataset crossed with the population's flag), and an
     * unfocused repeating role gives every phrase the first concept's data.
     */
    for (const role of Object.keys(graph.traceTemplates)) {
      const forRole = inst.phrases.filter((p) => {
        const d = E.phraseDef(ctx, p.phrase);
        return d && d.role === role;
      });
      if (!forRole.length) continue;
      /* The concept each phrase of this role binds — slot name is irrelevant,
         so this needs no per-role list of slots to maintain. */
      const focuses = forRole
        .map((p) => {
          const b = Object.keys(p.bindings || {})
            .map((s) => p.bindings[s])
            .find((x) => x && x.concept);
          return b ? b.concept : null;
        })
        .filter(Boolean);
      for (const f of focuses.length ? focuses : [null]) {
        const chain = E.buildTrace(ctx, inst, role, f);
        if (!chain) continue;
        record(`${studyKey}/${inst.id}/trace/${role}${f ? "/" + f : ""}`, chain);
        const json = JSON.stringify(chain);
        check(
          `${studyKey}/${inst.id} trace ${role}${f ? " (" + f + ")" : ""} leaves no unfilled tokens`,
          /* Two failure shapes: ⟨name⟩ from phrase resolution, and a surviving
             {token} the trace fill found no value for. The second was invisible
             to this gate until an ICE chain exposed it. */
          !json.includes("⟨") && !/\{[a-zA-Z_]+\}/.test(json),
          json
        );
      }
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

  /* Exactly one MainEstimator per estimand — per Analysis.analysisRole's own
     upstream documentation ("MainEstimator (exactly one per estimand)"). */
  const byEstimand = {};
  graph.instances.forEach((i) => {
    const e = E.estimandOf(ctx, i);
    if (!e) return;
    byEstimand[e.id] = byEstimand[e.id] || [];
    byEstimand[e.id].push(i);
  });
  /* Every registered estimand must be addressed by at least one analysis, and
     must declare its ICE scope explicitly (an empty list is a valid answer —
     "this estimand declares no intercurrent events" — but it must be stated). */
  Object.keys(graph.estimands || {}).forEach((eid) => {
    check(`${studyKey}/${eid} is addressed by at least one analysis`,
      (byEstimand[eid] || []).length > 0);
    check(`${studyKey}/${eid} declares its intercurrent-event scope`,
      Array.isArray(graph.estimands[eid].intercurrentEvents),
      "intercurrentEvents must be an array, even if empty");
  });
  Object.keys(byEstimand).forEach((k) => {
    const mains = byEstimand[k].filter((i) => i.analysisRole === "MainEstimator");
    check(`${studyKey}/${k} has exactly one MainEstimator`, mains.length === 1,
      mains.map((i) => i.id).join(", ") || "none");
  });
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

/* ---- document anchors are structured, not prose strings ---- */
{
  for (const [studyKey, graph] of Object.entries(graphs)) {
    Object.keys(graph.concepts).forEach((id) => {
      const a = graph.concepts[id].sapRef;
      if (a === undefined) return;
      check(`${studyKey}/${id} sapRef is a structured anchor`,
        a !== null && typeof a === "object" && typeof a.section === "string",
        JSON.stringify(a));
      check(`${studyKey}/${id} sapRef cites a section number`,
        /^[0-9]+(\.[0-9]+)*$/.test((a && a.section) || ""), String(a && a.section));
    });
  }
}

/* ---- per-estimand override with no duplicated ICE ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const main = graphs.CDISCPILOT01.instances.find((i) => i.id === "AC.PRIMARY.ADASCOG");
  const sens = graphs.CDISCPILOT01.instances.find((i) => i.id === "AC.SENS.ADASCOG.TP");
  check("the sensitivity-estimand instance exists", !!sens);
  if (sens) {
    const ice = "ICE.TRT_DISCONT";
    const a = E.constructModelView(ctx, main).handlesIntercurrentEvent
      .find((h) => h.forIntercurrentEvent === ice);
    const b = E.constructModelView(ctx, sens).handlesIntercurrentEvent
      .find((h) => h.forIntercurrentEvent === ice);
    check("the same ICE is handled two ways",
      a && b && a.icheStrategy === "Hypothetical" && b.icheStrategy === "TreatmentPolicy",
      JSON.stringify([a && a.icheStrategy, b && b.icheStrategy]));
    check("the override is flagged as such",
      b && b.isOverride === true && a.isOverride === false,
      JSON.stringify([a && a.isOverride, b && b.isOverride]));
    check("only ONE ICE concept backs both",
      a && b && a.forIntercurrentEvent === b.forIntercurrentEvent);
    check("the override drops the implementing transformation",
      a && b && a.implementedBy.length === 1 && b.implementedBy.length === 0,
      JSON.stringify([a && a.implementedBy, b && b.implementedBy]));
    /*
     * Changing an ICE strategy changes an ESTIMAND ATTRIBUTE, so it yields a
     * DIFFERENT estimand — not a sensitivity analysis of the same one. That is
     * what IceHandling's own upstream example says ("primary estimand uses
     * Hypothetical while a sensitivity estimand uses TreatmentPolicy on the same
     * ICE") and what requirement 6 literally asks for. Both estimands share the
     * ICE concept; neither duplicates it.
     */
    const eMain = E.estimandOf(ctx, main);
    const eSens = E.estimandOf(ctx, sens);
    check("differing ICE strategy yields a DIFFERENT estimand",
      eMain.id !== eSens.id, eMain.id + " vs " + eSens.id);
    check("the sensitivity estimand is its own main estimator",
      sens.analysisRole === "MainEstimator", sens.analysisRole);
    check("both estimands declare the same ICE, not a copy of it",
      JSON.stringify(eMain.intercurrentEvents) === JSON.stringify(eSens.intercurrentEvents),
      JSON.stringify([eMain.intercurrentEvents, eSens.intercurrentEvents]));
  }

  /* An analysis that states no ICE phrase INHERITS its estimand's scope at the
     events' study-default strategies — it does not silently handle nothing. */
  {
    const supp = graphs.CDISCPILOT01.instances.find((i) => i.id === "AC.SUPP.ADASCOG.WK16");
    const h = E.constructModelView(ctx, supp).handlesIntercurrentEvent;
    check("an analysis with no ICE phrase inherits its estimand's ICEs",
      h.length === 2, JSON.stringify(h));
    check("inherited handlings are marked as study defaults",
      h.every((x) => x.source === "studyDefault" && x.fromPhrase === null),
      JSON.stringify(h.map((x) => x.source)));
    check("inherited handlings are not flagged as overrides",
      h.every((x) => x.isOverride === false), JSON.stringify(h));
  }
  /* All five ICH E9(R1) attributes present on the primary. */
  const roles = E.resolveInstance(ctx, main, "en").phrases.map((p) => p.role);
  check("all five E9(R1) attributes are expressed",
    ["endpoint", "population", "grouping", "ice_handling", "summary_measure"]
      .every((r) => roles.indexOf(r) !== -1), roles.join(","));
}

/* ---- PrE0102: source-grounded ICE and summary measure ---- */
{
  const ctx = E.ctxOf(LIB, graphs.PRE0102, I18N);
  const inst = graphs.PRE0102.instances.find((i) => i.id === "AC.PRIMARY.PFS");
  const res = E.resolveInstance(ctx, inst, "en");
  check("PrE0102 primary states the ICE strategy in prose",
    res.sentence.includes("regardless of"), res.sentence);
  check("PrE0102 primary states the summary measure in prose",
    res.sentence.includes("median"), res.sentence);
  const mv = E.constructModelView(ctx, inst);
  check("PrE0102 emits a TreatmentPolicy IceHandling",
    (mv.handlesIntercurrentEvent || []).some((h) => h.icheStrategy === "TreatmentPolicy"),
    JSON.stringify(mv.handlesIntercurrentEvent));
  check("PrE0102 summary measure is a real KM output",
    JSON.stringify(mv).includes("median_survival"));
  /* Every PrE0102 concept quotes its source — the ICE included. That discipline
     is what separates this study from the illustrative Pilot layer. */
  const iceConcept = ctx.graph.concepts["ICE.TOX_DISCONT"];
  check("the PrE0102 ICE quotes its source sentence",
    !!iceConcept && iceConcept.sapRef && iceConcept.sapRef.section === "4.3" &&
      /suspected everolimus-associated toxicity/.test(iceConcept.sapRef.quote || ""),
    iceConcept ? JSON.stringify(iceConcept.sapRef) : "ICE.TOX_DISCONT not in the registry");
}

/* ---- ICE ascertainment trace: a distinct axis, focused per ICE ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const inst = without(ctx, graphs.CDISCPILOT01.instances[0], ESTIMAND_ROLES);
  inst.phrases.push({ phrase: "SP_ICE_HYPOTHETICAL", bindings: { ice: { concept: "ICE.TRT_DISCONT" } } });
  inst.phrases.push({ phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.CONMED" } } });

  const a = E.buildTrace(ctx, inst, "ice_handling", "ICE.TRT_DISCONT");
  const b = E.buildTrace(ctx, inst, "ice_handling", "ICE.CONMED");
  check("ICE trace exists", !!a && !!b);
  /* Two ICEs in one instance must trace to DIFFERENT data. Unfocused, role
     order would give both the first ICE's dataset — or the endpoint's. */
  check("each ICE traces to its own dataset",
    JSON.stringify(a).includes("adsl.xpt") && JSON.stringify(b).includes("adcm.xpt"),
    JSON.stringify([a, b]).slice(0, 300));
  check("the focused ICE is not shadowed by the endpoint concept",
    !JSON.stringify(b).includes("adqsadas.xpt"), JSON.stringify(b).slice(0, 300));
  check("ICE traces leave no unfilled tokens",
    !JSON.stringify([a, b]).includes("⟨"), JSON.stringify([a, b]).slice(0, 300));
  check("the ICE trace descends through its occurrence criterion",
    JSON.stringify(a).includes("BC_DS_001"), JSON.stringify(a).slice(0, 200));
}

/* ---- IceHandling: strategy resolves to what implements it ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const base = without(ctx, graphs.CDISCPILOT01.instances[0], ESTIMAND_ROLES);
  base.phrases.push({ phrase: "SP_ICE_HYPOTHETICAL", bindings: { ice: { concept: "ICE.TRT_DISCONT" } } });
  base.phrases.push({ phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.CONMED" } } });
  const mv = E.constructModelView(ctx, base);
  const h = mv.handlesIntercurrentEvent || [];
  check("model view emits one IceHandling per ICE phrase", h.length === 2, JSON.stringify(h));
  const hyp = h.find((x) => x.icheStrategy === "Hypothetical");
  check("Hypothetical resolves to an implementing transformation",
    hyp && hyp.implementedBy.length === 1 &&
    hyp.implementedBy[0].transformationId === "T.LOCF_Imputation", JSON.stringify(hyp));
  check("the implementing transformation is really in the library",
    !!E.templateDef(ctx, "T.LOCF_Imputation"));
  const tp = h.find((x) => x.icheStrategy === "TreatmentPolicy");
  check("TreatmentPolicy legitimately implements by nothing",
    tp && tp.implementedBy.length === 0, JSON.stringify(tp));

  /* Planted fault: a strategy the ICE declares no handling for must be an
     error, not a silently unimplemented claim. This is what stops the prose and
     the model drifting apart. ICE.CONMED supports TreatmentPolicy only. */
  const drift = without(ctx, graphs.CDISCPILOT01.instances[0], ESTIMAND_ROLES);
  drift.phrases.push({ phrase: "SP_ICE_HYPOTHETICAL", bindings: { ice: { concept: "ICE.CONMED" } } });
  check("planted fault: strategy with no declared handling is rejected",
    E.resolveInstance(ctx, drift).errors.length > 0,
    JSON.stringify(E.resolveInstance(ctx, drift).errors));
}

/* ---- summary measure is verifiable, not decorative ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  const tpl = E.templateDef(ctx, "T.CFB_ANCOVA");
  const def = E.phraseDef(ctx, "SP_SUMMARY_MEASURE");
  check("SP_SUMMARY_MEASURE exists", !!def);
  check("output classes are in the library subset", !!ctx.lib.outputClasses);

  /* contrasts_t IS produced by T.CFB_ANCOVA. */
  const good = E.resolvePhrase(
    ctx, { phrase: "SP_SUMMARY_MEASURE", bindings: { summary: { output: "contrasts_t" } } }, "en", tpl);
  check("a real method output resolves", good.errors.length === 0, JSON.stringify(good.errors));

  /* median_survival is a real output CLASS but T.CFB_ANCOVA/M.ANCOVA does not
     produce it — the whole point of requirement 4. */
  const bad = E.resolvePhrase(
    ctx, { phrase: "SP_SUMMARY_MEASURE", bindings: { summary: { output: "median_survival" } } }, "en", tpl);
  check("planted fault: summary the method cannot produce is rejected",
    bad.errors.length > 0, JSON.stringify(bad.errors));

  const nonsense = E.resolvePhrase(
    ctx, { phrase: "SP_SUMMARY_MEASURE", bindings: { summary: { output: "not_an_output" } } }, "en", tpl);
  check("planted fault: unknown output class is rejected", nonsense.errors.length > 0);
}

/* ---- ICH E9(R1) strategy phrase coverage ---- */
{
  const ctx = E.ctxOf(LIB, graphs.CDISCPILOT01, I18N);
  /* The five enum values of IchE9R1Strategy in study_esap.schema.yaml on
     methods_02. One phrase per strategy, no more and no fewer — a strategy
     with no phrase is an estimand the layer cannot express. */
  const STRATEGIES = ["TreatmentPolicy", "Hypothetical", "Composite",
                      "WhileOnTreatment", "PrincipalStratum"];
  const icePhrases = ctx.lib.smartPhrases.filter((p) => p.role === "ice_handling");
  check("every ICH E9(R1) strategy has exactly one phrase",
    STRATEGIES.every((s) => icePhrases.filter((p) => p.anchors.icheStrategy === s).length === 1),
    icePhrases.map((p) => p.oid + "=" + p.anchors.icheStrategy).join(", "));
  check("no ice_handling phrase claims an unknown strategy",
    icePhrases.every((p) => STRATEGIES.indexOf(p.anchors.icheStrategy) !== -1));
  check("every ice_handling phrase binds an IntercurrentEvent concept",
    icePhrases.every((p) => p.placeholders.some(
      (ph) => ph.name === "ice" && ph.concept_constraint === "IntercurrentEvent")));
  check("every ice_handling phrase declares its implementation pattern",
    icePhrases.every((p) => typeof p.anchors.implementation === "string"));
  check("only TreatmentPolicy needs no implementing transformation",
    icePhrases.filter((p) => p.anchors.implementation === "none")
      .every((p) => p.anchors.icheStrategy === "TreatmentPolicy"));
}

/* ---- sentence-template optional groups ---- */
{
  const graph = graphs.CDISCPILOT01;
  const pctx0 = E.ctxOf(LIB, graph, I18N);
  /* A pack whose template wraps an absent role in punctuation: the whole group
     must vanish, not strand its comma. The fixture strips ice_handling so the
     precondition is explicit — `covariate` is present, `ice_handling` is not, so
     one group renders and the other disappears. */
  const base = without(pctx0, graph.instances[0], ESTIMAND_ROLES);
  const probe = {
    en: {
      name: "probe",
      sentence_template:
        "{endpoint}[, ICE: {ice_handling}][, COV: {covariate}] will be assessed as {sentenceRole}."
    }
  };
  const pctx = E.ctxOf(LIB, graph, probe);
  const s = E.resolveInstance(pctx, base, "en").sentence;
  check("optional group with no phrases is elided entirely", !s.includes("ICE:"), s);
  check("optional group with a phrase is kept", s.includes("COV:"), s);
  check("eliding leaves no stranded punctuation", !/,\s*,/.test(s) && !/,\s*will be/.test(s), s);
  check("no literal brackets survive in the sentence", !/[[\]]/.test(s), s);
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
