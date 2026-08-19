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

import {
  allAnchors, quoteAppearsIn, resolveSection, sectionsIn
} from "./lib-anchors.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const demo = path.join(here, "..", "demo");
const smartphraseDir = path.join(here, "..");
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

    /*
     * COVERAGE — the requirement in issue #12, refined by #13. Every assertion
     * the generated prose makes must be traceable to the text that grounds it,
     * OR must state that no text grounds it. The audit that raised #12 found
     * roughly half of all phrase uses unanchored precisely because the
     * uncovered kinds were invisible rather than few; #13 adds that silence is
     * itself ambiguous, so it has to be broken deliberately.
     */
    if (graph.sourceDocument) {
      const undeclared = inst.phrases
        .map((pi, i) => ({ pi, i }))
        .filter(({ pi }) => {
          const res = E.anchorForPhrase(ctx, pi, E.phraseDef(ctx, pi.phrase), inst);
          if (res.anchors.length) return false;
          return !(Array.isArray(pi.sapRefs) && typeof pi.noAnchorReason === "string" &&
                   pi.noAnchorReason.length > 0);
        })
        /* Identify by position within inst.phrases, not OID alone — a
           repeating role can use one OID twice, and the JSON-LD anchor lookup
           (#12) and the trace focus (#11) both broke exactly that way. */
        .map(({ pi, i }) => `${pi.phrase}[${i}]`);
      check(`${studyKey}/${inst.id} every phrase use is anchored or declares why not`,
        undeclared.length === 0, undeclared.join(", "));
    }

    /* Anchors must be PROJECTED, not merely stored. Before issue #12 the
       sapRef field appeared in zero pinned outputs — no surface consumed it and
       no gate could detect it regressing, which is why three of four binding
       kinds went unanchored unnoticed. */
    if (graph.sourceDocument) {
      check(`${studyKey}/${inst.id} model view carries document anchors`,
        (mv.documentAnchors || []).length > 0, JSON.stringify(mv.documentAnchors));
      check(`${studyKey}/${inst.id} model view carries the instance's own anchor`,
        (mv.sapRefs || []).length > 0, JSON.stringify(mv.sapRefs));
      check(`${studyKey}/${inst.id} JSON-LD quotes its source`,
        JSON.stringify(E.toJSONLD(ctx, inst)).includes("prov:wasQuotedFrom"));
    } else {
      /* Important 2: the anchor type means "here is the text that grounds
         this" and must not be overloaded to mean "there is none" by emitting
         the key with a null value (study-graph.js's own stated principle).
         This is also what makes the "JSON-LD quotes its source" check above
         discriminating rather than vacuous: the key must be able to be
         ABSENT, and here it must be. */
      check(`${studyKey}/${inst.id} JSON-LD omits prov:wasQuotedFrom entirely when nothing grounds it`,
        !("prov:wasQuotedFrom" in E.toJSONLD(ctx, inst)));
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
  /* Estimands and analyses are study-side entities, so they anchor like any
     other — and the section reference must be a typed field, not a string
     smuggled into a label for tooling to regex out again (issue #12). */
  Object.keys(graph.estimands || {}).forEach((eid) => {
    check(`${studyKey}/${eid} estimand carries a document anchor`,
      !graph.sourceDocument || (graph.estimands[eid].sapRefs || []).length > 0,
      "no sapRefs");
    check(`${studyKey}/${eid} label does not embed a section reference`,
      !/\(\s*SAP\s*[0-9]/i.test(graph.estimands[eid].label), graph.estimands[eid].label);
  });
  graph.instances.forEach((inst) => {
    check(`${studyKey}/${inst.id} instance carries a document anchor`,
      !graph.sourceDocument || (inst.sapRefs || []).length > 0, "no sapRefs");
    check(`${studyKey}/${inst.id} label does not embed a section reference`,
      !/\(\s*SAP\s*[0-9]/i.test(inst.label), inst.label);
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

/* ---- every study states whether it has a source document ---- */
for (const [studyKey, graph] of Object.entries(graphs)) {
  check(`${studyKey} declares sourceDocument (object or explicit null)`,
    "sourceDocument" in graph, "field absent — an exemption must be declared, not implied");
  if (graph.sourceDocument === null) {
    check(`${studyKey} explains why it has no source document`,
      typeof graph.sourceDocumentNote === "string" && graph.sourceDocumentNote.length > 20,
      String(graph.sourceDocumentNote));
  } else if (graph.sourceDocument) {
    const sd = graph.sourceDocument;
    check(`${studyKey} source document identifies itself`,
      !!sd.id && !!sd.title && !!sd.date, JSON.stringify(sd));
    check(`${studyKey} source document maps top-level sections to files`,
      !!sd.sectionFiles && Object.keys(sd.sectionFiles).length > 0);
  }
}

/* ---- every quote must actually appear in the section it cites ---- */
for (const [studyKey, graph] of Object.entries(graphs)) {
  if (!graph.sourceDocument) continue;
  for (const a of allAnchors(graph)) {
    const file = resolveSection(smartphraseDir, graph, a.section);
    check(`${studyKey}/${a.where} cites a resolvable section (${a.section})`, !!file, a.section);
    if (!file) continue;
    check(`${studyKey}/${a.where} section ${a.section} exists in the document`,
      sectionsIn(file).has(a.section), "not a heading in " + path.basename(file));
    if (!a.quote) continue;
    /* The check that makes an anchor a fact rather than a claim. */
    check(`${studyKey}/${a.where} quote appears verbatim in section ${a.section}`,
      quoteAppearsIn(fs.readFileSync(file, "utf8"), a.quote),
      JSON.stringify(a.quote.slice(0, 90)));
  }
}

/* ---- anchor resolution and precedence ---- */
{
  const ctx = E.ctxOf(LIB, graphs.PRE0102, I18N);
  const inst = graphs.PRE0102.instances.find((i) => i.id === "AC.PRIMARY.PFS");

  /* A concept-bound phrase falls back to the bound concept's anchor. */
  const endpoint = E.resolveInstance(ctx, inst, "en").phrases.find((p) => p.role === "endpoint");
  check("a concept-bound phrase inherits the concept's anchor",
    !!endpoint.anchor && /^concept:/.test(endpoint.anchorSource || ""),
    String(endpoint.anchorSource));

  /* Instance-level wins, and does not destroy the concept's. */
  const probe = JSON.parse(JSON.stringify(inst));
  probe.phrases.find((p) => p.phrase === "SP_TTE_ENDPOINT").sapRefs =
    [{ section: "7.7.2", quote: "PFS = time from randomization to documented disease progression or death" }];
  const rp = E.resolveInstance(ctx, probe, "en").phrases.find((p) => p.role === "endpoint");
  check("instance-level anchor takes precedence",
    !!rp.anchor && rp.anchor.section === "7.7.2" && rp.anchorSource === "phraseInstance",
    JSON.stringify(rp.anchor) + " " + rp.anchorSource);
  check("the concept's own anchor survives being overridden",
    E.concept(ctx, "EVENT.PFS").sapRefs[0].section === "5.3");

  /* A phrase with no concept binding — the whole point of #12 — can anchor. */
  const mprobe = JSON.parse(JSON.stringify(inst));
  mprobe.phrases.find((p) => p.phrase === "SP_METHOD_KM").sapRefs =
    [{ section: "7.7.2", quote: "using Kaplan-Meier estimates" }];
  const mrp = E.resolveInstance(ctx, mprobe, "en").phrases.find((p) => p.role === "method");
  check("a method phrase can carry its own anchor",
    !!mrp.anchor && mrp.anchorSource === "phraseInstance", JSON.stringify(mrp));

  /* Anchors must survive a round-trip through the tag dialect, which does not
     serialise them — an edit through the text surface must not strip provenance. */
  const src = E.toMacroText(ctx, mprobe);
  const back = E.parseMacroText(ctx, src, mprobe);
  const countRefs = (ps) => ps.reduce((n, p) => n + (p.sapRefs || []).length, 0);
  const before = countRefs(mprobe.phrases);
  const kept = back.instancePatch ? countRefs(back.instancePatch.phrases) : -1;
  check("tag-dialect round-trip preserves every anchor",
    kept === before && before > 0, kept + " of " + before);
}

/* ---- union resolution, proximity and relation ranking (issue #13) ----
 *
 * Study data still holds one reference per site at this point, so these run on
 * probes. The live-data assertions arrive with the real second references.
 */
{
  const ctx = E.ctxOf(LIB, graphs.PRE0102, I18N);
  const inst = graphs.PRE0102.instances.find((i) => i.id === "AC.PRIMARY.PFS");

  /* NO-DISCARD. First-match-wins threw away every reference after the first;
     the count resolved must now equal the count authored. */
  const ctxTwo = E.ctxOf(LIB, JSON.parse(JSON.stringify(graphs.PRE0102)), I18N);
  ctxTwo.graph.concepts["EVENT.PFS"].sapRefs = [
    { section: "5.3", quote: "the duration of time from time of randomization to time of progression or death, whichever occurs first" },
    { section: "7.7.2", quote: "PFS = time from randomization to documented disease progression or death" }
  ];
  const rTwo = E.resolveInstance(ctxTwo, inst, "en").phrases.find((p) => p.role === "endpoint");
  check("union resolution discards no reference",
    (rTwo.anchors || []).length === 2, JSON.stringify(rTwo.anchors));

  /* PROXIMITY. The instance is specified at 7.7.2, so the 7.7.2 reference must
     lead — this is the reviewer's complaint, mechanised. */
  check("the nearer reference leads",
    rTwo.anchor.section === "7.7.2", JSON.stringify(rTwo.anchor));
  check("the engine reports proximity as the basis",
    rTwo.anchorBasis === "proximity", String(rTwo.anchorBasis));
  check("the engine reports the section it measured against",
    rTwo.anchorContextSection === "7.7.2", String(rTwo.anchorContextSection));

  /* PLANTED FAULT: ordering must not be authoring order. The far reference is
     declared FIRST here, and must still rank second. */
  const ctxOrder = E.ctxOf(LIB, JSON.parse(JSON.stringify(graphs.PRE0102)), I18N);
  ctxOrder.graph.concepts["EVENT.PFS"].sapRefs = [
    { section: "5.3", quote: "the time from randomization until progression of the disease" },
    { section: "7.7.2", quote: "PFS = time from randomization to documented disease progression or death" }
  ];
  const rOrder = E.resolveInstance(ctxOrder, inst, "en").phrases.find((p) => p.role === "endpoint");
  check("planted fault: a farther reference declared first still ranks second",
    rOrder.anchor.section === "7.7.2" && rOrder.anchors[1].section === "5.3",
    JSON.stringify(rOrder.anchors.map((a) => a.section)));

  /* RELATION breaks a proximity tie, and only a tie. */
  const ctxRel = E.ctxOf(LIB, JSON.parse(JSON.stringify(graphs.PRE0102)), I18N);
  ctxRel.graph.concepts["EVENT.PFS"].sapRefs = [
    { section: "7.7.2", quote: "PFS = time from randomization to documented disease progression or death", relation: "definition" },
    { section: "7.7.2", quote: "If medians have not been reached, 2-year PFS, TTP and OS should be reported instead, with 90% confidence intervals", relation: "qualification" }
  ];
  const rRel = E.resolveInstance(ctxRel, inst, "en").phrases.find((p) => p.role === "endpoint");
  check("relation breaks a proximity tie",
    /If medians have not been reached/.test(rRel.anchor.quote || ""),
    JSON.stringify(rRel.anchor));
  check("the engine reports relation as the basis",
    rRel.anchorBasis === "relation", String(rRel.anchorBasis));

  /* LEVEL DOMINANCE (D-5). A deliberate use-specific anchor outranks a nearer
     concept reference — this is #12's precedence decision, and it must hold.
     The ICE phrase's own 4.3 anchor must not be demoted by a 7.7.2 concept one. */
  const ctxLevel = E.ctxOf(LIB, JSON.parse(JSON.stringify(graphs.PRE0102)), I18N);
  ctxLevel.graph.concepts["ICE.TOX_DISCONT"].sapRefs.push(
    { section: "7.7.2", quote: "by treatment arm" });
  const iceInst = ctxLevel.graph.instances.find((i) => i.id === "AC.PRIMARY.PFS");
  const rIce = E.resolveInstance(ctxLevel, iceInst, "en").phrases
    .find((p) => p.role === "ice_handling");
  check("a use-specific anchor is not demoted by a nearer concept anchor",
    rIce.anchorSource === "phraseInstance" && rIce.anchor.section === "4.3",
    rIce.anchorSource + " " + JSON.stringify(rIce.anchor));
  check("the engine reports level as the basis",
    rIce.anchorBasis === "level", String(rIce.anchorBasis));

  /* DEDUPLICATION. The same passage reachable by two routes is one reference. */
  const ctxDup = E.ctxOf(LIB, JSON.parse(JSON.stringify(graphs.PRE0102)), I18N);
  const dupQuote = "PFS = time from randomization to documented disease progression or death";
  ctxDup.graph.concepts["EVENT.PFS"].sapRefs = [{ section: "7.7.2", quote: dupQuote }];
  const dupInst = ctxDup.graph.instances.find((i) => i.id === "AC.PRIMARY.PFS");
  dupInst.phrases.find((p) => p.phrase === "SP_TTE_ENDPOINT").sapRefs =
    [{ section: "7.7.2", quote: dupQuote }];
  const rDup = E.resolveInstance(ctxDup, dupInst, "en").phrases.find((p) => p.role === "endpoint");
  check("the same passage reached twice is one reference",
    (rDup.anchors || []).length === 1, JSON.stringify(rDup.anchors));

  /* PROJECTION. A gate can only assert what a projection carries — the lesson
     of #12, where sapRef appeared in zero pinned outputs. */
  const mvTwo = E.constructModelView(ctxTwo, inst);
  const epAnchors = (mvTwo.documentAnchors || [])
    .filter((a) => a.phrase === "SP_TTE_ENDPOINT");
  check("the model view carries every reference, not just the head",
    epAnchors.length === 2, JSON.stringify(epAnchors));
  check("the model view marks which reference is the head",
    epAnchors.filter((a) => a.head).length === 1, JSON.stringify(epAnchors));
  /* Counting "prov:wasQuotedFrom" across the whole serialised instance proves
     nothing on its own — every anchored phrase node emits that key once, so
     the count is already >1 with a single quote per phrase, before this
     change. The claim under test is specific to ONE phrase node — and even
     there, the count alone does not distinguish the fix from the pre-#13
     behaviour, because a concept-only anchor already returned its whole ref
     list (just unordered, keyed off the first). It is the ORDER — nearest
     section first — that only threading the instance into this call
     produces, so that is what is asserted. */
  const endpointNode = E.toJSONLD(ctxTwo, inst)["sp:hasPhraseInstance"]
    .find((n) => n["sp:phrase"] === "SP_TTE_ENDPOINT");
  const wasQuoted = (endpointNode && endpointNode["prov:wasQuotedFrom"]) || [];
  check("the JSON-LD quotes every passage, nearest first",
    wasQuoted.length === 2 && /#7\.7\.2$/.test(wasQuoted[0]["@id"] || ""),
    JSON.stringify(endpointNode));
}

/* ---- relevance: the head must be the passage specifying THIS analysis ----
 *
 * The reviewer's spot-check, mechanised (issue #13). Where a reference in the
 * analysis's own section is available to a use, that reference must lead.
 *
 * One exemption, and it is D-5 rather than a fudge: a reference authored on the
 * phrase INSTANCE is a deliberate act about this use, and #12 decided it
 * outranks a definitional one. So a use whose head is a phrase-instance
 * reference in another section is exempt — SP_ICE_TREATMENT_POLICY citing 4.3
 * from an analysis specified at 7.7.2 is correct, not a regression.
 */
for (const [studyKey, graph] of Object.entries(graphs)) {
  if (!graph.sourceDocument) continue;
  const ctx = E.ctxOf(LIB, graph, I18N);
  for (const inst of graph.instances) {
    const own = (inst.sapRefs || [])[0];
    if (!own) continue;
    for (const rp of E.resolveInstance(ctx, inst, "en").phrases) {
      if (!rp.anchor) continue;
      if (rp.anchorSource === "phraseInstance" && rp.anchor.section !== own.section) continue;
      const local = (rp.anchors || []).filter((a) => a.section === own.section);
      if (!local.length) continue;
      check(`${studyKey}/${inst.id}/${rp.oid} leads with the section specifying this analysis`,
        rp.anchor.section === own.section,
        `head §${rp.anchor.section} but §${own.section} is available`);
    }
  }
}

/* The eight uses this issue repairs, named individually so a regression says
   which one moved rather than only that coverage fell. */
{
  const ctx = E.ctxOf(LIB, graphs.PRE0102, I18N);
  const expect = [
    ["AC.PRIMARY.PFS", "endpoint", "7.7.2"],
    ["AC.SENS.PFS.ITT", "endpoint", "7.7.2"],
    ["AC.SEC.OS", "endpoint", "7.7.2"],
    ["AC.SEC.TTP", "endpoint", "7.7.2"],
    ["AC.PRIMARY.PFS", "population", "7.7.2"],
    ["AC.SEC.OS", "population", "7.7.2"],
    ["AC.SEC.TTP", "population", "7.7.2"],
    ["AC.SENS.PFS.ITT", "population", "7.7.2"]
  ];
  for (const [instId, role, section] of expect) {
    const inst = graphs.PRE0102.instances.find((i) => i.id === instId);
    const rp = E.resolveInstance(ctx, inst, "en").phrases.find((p) => p.role === role);
    check(`${instId} ${role} now leads with §${section}`,
      !!rp && !!rp.anchor && rp.anchor.section === section,
      rp && rp.anchor ? rp.anchor.section : "no anchor");
    check(`${instId} ${role} keeps its definitional reference`,
      !!rp && (rp.anchors || []).length >= 2,
      JSON.stringify(rp && rp.anchors));
  }

  /* SP_GROUPING is deliberately untouched: 4.1 is the right grounding for
     treatment allocation, and the only 7.7.2 fragment available recurs
     throughout the section. The fix is for references that are WRONG, not for
     every reference that is distant. */
  const primary = graphs.PRE0102.instances.find((i) => i.id === "AC.PRIMARY.PFS");
  const grouping = E.resolveInstance(ctx, primary, "en").phrases
    .find((p) => p.role === "grouping");
  check("SP_GROUPING still cites §4.1 by design",
    !!grouping && grouping.anchor.section === "4.1",
    grouping && grouping.anchor && grouping.anchor.section);

  /* The relation tie-break, on live data: two references sharing a level AND a
     section, so nothing but relation can order them. The median-and-CI sentence
     specifies the measure; the not-reached sentence qualifies it. */
  const summary = E.resolveInstance(ctx, primary, "en").phrases
    .find((p) => p.role === "summary_measure");
  check("the summary measure holds two references in one section",
    (summary.anchors || []).length === 2, JSON.stringify(summary.anchors));
  check("relation orders them on live data",
    summary.anchorBasis === "relation", String(summary.anchorBasis));
  check("the specification leads and the qualification follows",
    summary.anchors[0].relation === "specification" &&
      summary.anchors[1].relation === "qualification",
    JSON.stringify(summary.anchors.map((a) => a.relation)));

  /* THE HEADLINE: one concept, two analyses, two different correct sections.
     Inspected from an analysis specified at 5.3, EVENT.PFS leads with 5.3. */
  const at53 = JSON.parse(JSON.stringify(primary));
  at53.sapRefs = [{ section: "5.3", quote: "the duration of time from time of randomization to time of progression or death, whichever occurs first" }];
  const rp53 = E.resolveInstance(ctx, at53, "en").phrases.find((p) => p.role === "endpoint");
  check("one concept anchors differently per analysis",
    rp53.anchor.section === "5.3", JSON.stringify(rp53.anchor));
}

/* ---- declared-empty: "nothing to anchor to" is an answer, silence is not ----
 *
 * No PrE0102 use is in this position — all 33 resolve — so the rule is proven
 * on probes. That is stated rather than hidden: the gate is real, and the study
 * simply has nothing that triggers it.
 */
{
  const graph = JSON.parse(JSON.stringify(graphs.PRE0102));
  const ctx = E.ctxOf(LIB, graph, I18N);
  const inst = graph.instances.find((i) => i.id === "AC.PRIMARY.PFS");
  const km = inst.phrases.find((p) => p.phrase === "SP_KM_CURVES");

  /* Strip the anchor entirely: absent, not empty. */
  delete km.sapRefs;
  const bare = E.anchorForPhrase(ctx, km, E.phraseDef(ctx, "SP_KM_CURVES"), inst);
  check("a use with no reference anywhere resolves to none",
    bare.anchors.length === 0 && bare.anchor === null, JSON.stringify(bare));
  check("an absent list is not a declaration",
    bare.declaredEmpty === false, String(bare.declaredEmpty));
  check("an absent list carries no reason",
    bare.noAnchorReason === null, String(bare.noAnchorReason));

  /* Now declare it. */
  km.sapRefs = [];
  km.noAnchorReason = "probe: the SAP does not specify Kaplan-Meier curves for this analysis";
  const declared = E.anchorForPhrase(ctx, km, E.phraseDef(ctx, "SP_KM_CURVES"), inst);
  check("an empty list is a declaration",
    declared.declaredEmpty === true, String(declared.declaredEmpty));
  check("a declared-empty use still resolves to no reference",
    declared.anchors.length === 0);
  check("the reason for the declaration is carried on the resolved anchor",
    declared.noAnchorReason === km.noAnchorReason, String(declared.noAnchorReason));

  /*
   * PROJECTION (Important 3). anchorForPhrase carrying noAnchorReason is not
   * enough on its own — DESIGN.md D18's lesson is that a field only reaches a
   * surface or a gate once a PROJECTION carries it. Check both hops: the
   * resolved phrase (resolveInstance, what the popover reads) and the model
   * view (constructModelView, what the JSON tab and other tooling read).
   */
  const rpKm = E.resolveInstance(ctx, inst, "en").phrases.find((p) => p.oid === "SP_KM_CURVES");
  check("the resolved phrase carries the declared-empty reason",
    rpKm.anchorDeclaredEmpty === true && rpKm.noAnchorReason === km.noAnchorReason,
    JSON.stringify([rpKm.anchorDeclaredEmpty, rpKm.noAnchorReason]));

  const mvKm = E.constructModelView(ctx, inst);
  const declaredEntry = (mvKm.declaredEmptyUses || []).find((d) => d.phrase === "SP_KM_CURVES");
  check("the model view projects the declared-empty use and its reason",
    !!declaredEntry && declaredEntry.noAnchorReason === km.noAnchorReason,
    JSON.stringify(mvKm.declaredEmptyUses));
}

/* ---- planted fault: plurality must not open an unverified back door ---- */
{
  const graph = graphs.PRE0102;
  const body = fs.readFileSync(resolveSection(smartphraseDir, graph, "7.7.2"), "utf8");
  check("planted fault: an invented SECOND reference is still rejected",
    !quoteAppearsIn(body, "PFS is measured from the date of first dose"));
  check("the real second reference passes",
    quoteAppearsIn(body, "PFS = time from randomization to documented disease progression or death"));

  /*
   * ENUMERATION (Important 5). Both checks above call quoteAppearsIn directly
   * — exactly what the pre-existing paraphrase checks already do — so they
   * exercise the quote gate, never the plural WALK. If allAnchors regressed
   * to reading refs[0] only, every one of the second references below would
   * silently vanish from the walk and neither check above would notice,
   * since neither ever asks allAnchors for anything. Naming the second
   * references (rather than only pinning a count) makes that regression fail
   * BY NAME — "concept EVENT.PFS ref[1] missing" — which is the more useful
   * failure for a reviewer to read than a bare count dropping from 44 to 35.
   */
  const all = allAnchors(graph);
  check("allAnchors reaches 44 entries (35 single-reference + 9 from #13's plural sites)",
    all.length === 44, String(all.length));
  const SECOND_REFS = [
    "concept EVENT.PFS ref[1]", "concept EVENT.OS ref[1]", "concept EVENT.TTP ref[1]",
    "concept POP.EVAL_EFFICACY ref[1]",
    "AC.PRIMARY.PFS phrase[8] SP_SUMMARY_MEASURE ref[1]",
    "AC.SENS.PFS.ITT phrase[8] SP_SUMMARY_MEASURE ref[1]",
    "AC.SEC.OS phrase[7] SP_SUMMARY_MEASURE ref[1]",
    "AC.SEC.TTP phrase[6] SP_SUMMARY_MEASURE ref[1]"
  ];
  const wheres = all.map((a) => a.where);
  const missing = SECOND_REFS.filter((w) => wheres.indexOf(w) === -1);
  check("every second reference is reachable — plurality is walked, not read as refs[0] only",
    missing.length === 0, "missing: " + missing.join(", "));
}

/* ---- planted faults: the quote gate must actually bite ---- */
{
  const graph = graphs.PRE0102;
  const f = resolveSection(smartphraseDir, graph, "4.1");
  const body = fs.readFileSync(f, "utf8");
  /* The exact paraphrase that shipped in #9 and read like a quotation. */
  check("planted fault: a paraphrase is rejected",
    !quoteAppearsIn(body, "randomized 1:1 to everolimus or placebo, both with fulvestrant"));
  check("planted fault: invented text is rejected",
    !quoteAppearsIn(body, "subjects will be randomised by coin toss"));
  /* Normalisation must forgive line wrapping, typographic punctuation and
     Markdown emphasis — but nothing else. */
  check("real quotes survive hard wrapping",
    quoteAppearsIn(body,
      "Subjects will be randomized (1:1) to receive everolimus or placebo after consideration of stratification factors"));
  check("Markdown emphasis is not treated as source text",
    quoteAppearsIn(fs.readFileSync(resolveSection(smartphraseDir, graph, "7.2"), "utf8"),
      "Intent-to-treat (ITT) analysis population includes all subjects as randomized"));
  check("planted fault: a non-existent subsection is rejected",
    !sectionsIn(resolveSection(smartphraseDir, graph, "7.99")).has("7.99"));
}

/* ---- document anchors are structured, not prose strings ---- */
{
  for (const [studyKey, graph] of Object.entries(graphs)) {
    Object.keys(graph.concepts).forEach((id) => {
      const refs = graph.concepts[id].sapRefs;
      if (refs === undefined) return;
      check(`${studyKey}/${id} sapRefs is a list`, Array.isArray(refs), JSON.stringify(refs));
      (Array.isArray(refs) ? refs : []).forEach((a, i) => {
        check(`${studyKey}/${id} sapRefs[${i}] is a structured anchor`,
          a !== null && typeof a === "object" && typeof a.section === "string",
          JSON.stringify(a));
        check(`${studyKey}/${id} sapRefs[${i}] cites a section number`,
          /^[0-9]+(\.[0-9]+)*$/.test(a && a.section), String(a && a.section));
      });
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
  const iceRef = iceConcept && iceConcept.sapRefs && iceConcept.sapRefs[0];
  check("the PrE0102 ICE quotes its source sentence",
    !!iceRef && iceRef.section === "4.3" &&
      /suspected everolimus-associated toxicity/.test(iceRef.quote || ""),
    iceRef ? JSON.stringify(iceRef) : "ICE.TOX_DISCONT not in the registry");
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
