/*
 * Headless DOM check of the smartphrase demo.
 *
 *   NODE_PATH=<dir>/node_modules node smartphrase/tools/verify-ui.mjs
 *
 * Loads the real index.html in jsdom, walks both studies through all four
 * stops — study switch, prose, inspect, trace, model->SAP edit, tag source,
 * JSON-LD, reuse grid, standards table, language switch — and fails on any
 * failed assertion or console error. Exit 0 pass, 1 fail, 2 jsdom missing.
 *
 * Complements verify.mjs, which checks the engine and pinned goldens with no
 * DOM at all.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * jsdom is a DEV-ONLY dependency and is deliberately not vendored: the demo
 * itself stays zero-install and this repo has no package.json. Install it
 * anywhere on NODE_PATH, e.g.
 *     mkdir -p /tmp/spui && cd /tmp/spui && npm init -y && npm i jsdom
 *     NODE_PATH=/tmp/spui/node_modules node smartphrase/tools/verify-ui.mjs
 */
let JSDOM, VirtualConsole;
try {
  /* createRequire (unlike ESM import) honours NODE_PATH, so jsdom can live
     outside the repo. SP_JSDOM may also give an explicit module path. */
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const jsdomPkg = req(process.env.SP_JSDOM || "jsdom");
  ({ JSDOM, VirtualConsole } = jsdomPkg);
} catch {
  console.error(
    "SKIP — jsdom not found. This UI check needs it (dev-only dependency):\n" +
      "  mkdir -p /tmp/spui && cd /tmp/spui && npm init -y && npm i jsdom\n" +
      "  NODE_PATH=/tmp/spui/node_modules node smartphrase/tools/verify-ui.mjs"
  );
  process.exit(2);
}

const DEMO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo");

const consoleErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => consoleErrors.push("jsdomError: " + e.message));
vc.on("error", (...a) => consoleErrors.push("console.error: " + a.join(" ")));
vc.on("warn", (...a) => consoleErrors.push("console.warn: " + a.join(" ")));

/* Inline every <script src> in place, so jsdom parses and executes the page in
   its real document order — no manual eval, no load-order skew. */
const rawHtml = fs.readFileSync(path.join(DEMO, "index.html"), "utf8");
const html = rawHtml.replace(
  /<script src="([^"]+)"><\/script>/g,
  (_m, src) => "<script>" + fs.readFileSync(path.join(DEMO, src), "utf8") + "</script>"
);

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "file://" + DEMO + "/index.html",
  virtualConsole: vc,
  pretendToBeVisual: true,
  beforeParse(win) {
    /* jsdom implements neither of these; they are pure viewport behaviour. */
    win.Element.prototype.scrollIntoView = function () {};
    win.HTMLElement.prototype.scrollIntoView = function () {};
  }
});

const { window } = dom;
const doc = window.document;

const failures = [];
function check(name, cond, detail) {
  if (!cond) failures.push(name + (detail ? " — " + detail : ""));
}
const $ = (id) => doc.getElementById(id);
const txt = (id) => ($(id) ? $(id).textContent.trim() : null);

/* ---------- 1. study switch ---------- */
const studyBtns = [...$("studySwitch").querySelectorAll("button")];
check("study switch renders both studies", studyBtns.length === 2, studyBtns.map(b=>b.textContent).join(","));
check("CDISCPILOT01 is first and active",
  studyBtns[0].textContent === "CDISCPILOT01" && studyBtns[0].className.includes("active"));
check("PRE0102 offered", studyBtns[1] && studyBtns[1].textContent === "PRE0102");

/* ---------- 2. default study renders the CDISC Pilot passage ---------- */
const pilotProse = txt("prose1");
check("pilot prose mentions ADAS-Cog", pilotProse.includes("ADAS-Cog(11)"), pilotProse.slice(0, 80));
check("pilot prose mentions ANCOVA", pilotProse.includes("ANCOVA"));
check("pilot doc study label", txt("docStudy") === "Study CDISCPILOT01", txt("docStudy"));
const pilotChips = [...$("prose1").querySelectorAll(".sp")].length ||
                   [...$("prose1").querySelectorAll("[data-oid]")].length ||
                   [...$("prose1").querySelectorAll("span")].filter(s=>s.className).length;
check("pilot prose has phrase chips", pilotChips > 0, "chips=" + pilotChips);

/* pilot model panel offers the ANCOVA fields */
const pilotPanel = $("modelPanel").textContent;
check("pilot panel names SP_CFB_ENDPOINT", pilotPanel.includes("SP_CFB_ENDPOINT"));
check("pilot panel names the active template", pilotPanel.includes("T.CFB_ANCOVA"), pilotPanel.slice(0,200));

/* ---------- 2b. estimand surfaces (issue #11) ---------- */
check("model panel shows the estimand", pilotPanel.includes("EST.PRIMARY"), pilotPanel.slice(0, 300));
check("model panel shows the typed analysis role", pilotPanel.includes("MainEstimator"));
check("model panel shows the ICE handling role", pilotPanel.includes("ICE Handling"));
check("model panel shows the summary measure role", pilotPanel.includes("Summary Measure"));
check("model panel badges proposed phrases on a released template",
  pilotPanel.includes("proposed phrase"), pilotPanel.slice(-400));
check("prose renders both ICE clauses joined by 'and'",
  /as if .+ had not occurred and regardless of /.test(pilotProse), pilotProse.slice(0, 400));
check("prose renders the summary measure", pilotProse.includes("summarised as"), pilotProse.slice(-160));
check("prose has no stranded punctuation", !/\s,|,\s*,/.test(pilotProse), pilotProse.slice(0, 300));

/* the model view must carry the eSAP IceHandling triples and their implementer */
{
  const mvText = $("modelView").textContent;
  check("model view emits IceHandling triples", mvText.includes("handlesIntercurrentEvent"));
  check("model view names the implementing transformation", mvText.includes("T.LOCF_Imputation"));
  check("model view carries summarizedByOutputClass in the graph",
    $("jsonldView").textContent.includes("summarizedByOutputClass"),
    $("jsonldView").textContent.slice(0, 200));
}

/* pilot reuse grid: two study groups, 8 cards */
const cards = [...doc.querySelectorAll("#reuseGrid .reuse-card")];
const heads = [...doc.querySelectorAll("#reuseGrid > h3")];
check("reuse grid groups by study (2 headings)", heads.length === 2, heads.map(h=>h.textContent).join(" | "));
check("reuse grid shows 8 cards (4 pilot + 4 PrE0102)", cards.length === 8, "cards=" + cards.length);
const proposedBadges = cards.filter(c => c.textContent.includes("proposed"));
check("4 PrE0102 cards badged proposed", proposedBadges.length === 4, "badged=" + proposedBadges.length);

/* standards table mentions the proposed provenance */
check("provenance notes proposed additions",
  $("provenance").textContent.includes("Proposed additions"),
  $("provenance").textContent.slice(0, 120));

/* ---------- 3. switch to PRE0102 ---------- */
studyBtns[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

const bcProse = txt("prose1");
check("PrE0102 prose is the PFS sentence",
  bcProse.includes("disease progression or death") && bcProse.includes("Kaplan-Meier"),
  bcProse.slice(0, 120));
check("PrE0102 prose has no doubled 'estimation estimation'",
  !bcProse.includes("estimation estimation"));
check("PrE0102 doc study label", txt("docStudy") === "Study PRE0102", txt("docStudy"));
check("PrE0102 title is the trial title",
  txt("docTitle").includes("Primary efficacy analysis"), txt("docTitle"));

/* model panel is now KM-shaped */
const bcPanel = $("modelPanel").textContent;
check("PrE0102 panel names SP_TTE_ENDPOINT", bcPanel.includes("SP_TTE_ENDPOINT"), bcPanel.slice(0,240));
check("PrE0102 panel shows its own estimand", bcPanel.includes("EST.PFS"), bcPanel.slice(0, 240));
check("PrE0102 prose states the source-grounded ICE strategy",
  bcProse.includes("regardless of discontinuation of everolimus"), bcProse.slice(0, 300));
check("PrE0102 prose states its summary measure",
  bcProse.includes("summarised as the median time to event"), bcProse.slice(-200));
check("PrE0102 panel names the proposed template", bcPanel.includes("T.PFS_KaplanMeier"));
check("PrE0102 panel flags the template proposed", bcPanel.includes("proposed template"));
check("PrE0102 panel offers SP_STRATIFICATION as addable", bcPanel.includes("SP_STRATIFICATION"));
check("PrE0102 panel has no ANCOVA leftovers", !bcPanel.includes("SP_CFB_ENDPOINT"));

/* constructed model view shows the survival formula */
const modelView = txt("modelView");
check("model view shows T.PFS_KaplanMeier", modelView.includes("T.PFS_KaplanMeier"));
check("model view shows the survival expression",
  modelView.includes("Surv(AVAL, 1-CNSR) ~ TRTP"), modelView.slice(0, 200));
check("model view alpha is clean 0.1", modelView.includes('"0.1"'), "alpha not 0.1");

/* tag source regenerates for the new study */
check("tag source references the KM template",
  $("srcArea").value.includes("T.PFS_KaplanMeier"), $("srcArea").value.slice(0, 120));

/* JSON-LD projection is well-formed JSON */
try {
  const ld = JSON.parse(txt("jsonldView"));
  check("JSON-LD parses and identifies the instance",
    ld["@id"] && ld["@id"].includes("PRE0102"), JSON.stringify(ld["@id"]));
} catch (e) {
  check("JSON-LD parses", false, e.message);
}

/* standards table now lists PrE0102 identifiers and the KM method */
const idTable = $("idTable").textContent;
check("standards table lists EVENT.PFS", idTable.includes("EVENT.PFS"));
check("standards table lists the KM method grounding", idTable.includes("M.KaplanMeier"));
check("standards table no longer shows pilot-only ANCOVA", !idTable.includes("M.ANCOVA"));

/* ---------- 3b. the ICE trace, and that focus works through the real DOM ----
 * Back on the Pilot, which has TWO intercurrent events in one instance. Each
 * chip must trace to its OWN ascertainment; without the focus parameter both
 * would resolve to whichever concept library role order puts first.
 */
studyBtns[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
{
  const iceChips = [...$("prose1").querySelectorAll("span.ice_handling")];
  check("both ICE chips are in the prose", iceChips.length === 2, "chips=" + iceChips.length);
  if (iceChips.length === 2) {
    iceChips[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const t1 = $("traceTiers").textContent;
    check("first ICE traces to its own dataset", t1.includes("adsl.xpt"), t1.slice(0, 240));
    check("ICE trace descends through the occurrence criterion",
      t1.includes("BC_DS_001"), t1.slice(0, 240));
    check("ICE trace shows the ascertained fact tier",
      t1.includes("occurred, when"), t1.slice(0, 240));
    check("ICE trace has no unfilled tokens",
      !t1.includes("⟨") && !/\{[a-zA-Z_]+\}/.test(t1), t1.slice(0, 240));

    iceChips[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const t2 = $("traceTiers").textContent;
    check("second ICE traces somewhere ELSE — focus works in the DOM",
      t2.includes("adcm.xpt") && !t2.includes("adsl.xpt"), t2.slice(0, 240));
    check("the endpoint concept does not shadow the focused ICE",
      !t2.includes("adqsadas.xpt"), t2.slice(0, 240));
  }
  /* The standards table must name the strategies the study asserts. */
  const idTablePilot = $("idTable").textContent;
  check("standards table grounds the ICH E9(R1) strategies used",
    idTablePilot.includes("ICH E9(R1) strategy — Hypothetical") &&
    idTablePilot.includes("ICH E9(R1) strategy — TreatmentPolicy"),
    idTablePilot.slice(0, 300));
  check("standards table lists the estimand",
    idTablePilot.includes("EST.PRIMARY"), idTablePilot.slice(0, 300));
}
/* back to PrE0102 for the remaining stops */
studyBtns[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

/* ---------- 3c. document anchoring shows in the UI (issue #12) ----------
 * The method phrase is the case the issue says visibly never highlighted
 * anything: its binding resolves into the library, which correctly forbids
 * study text, so there was no route to the SAP at all.
 */
{
  const chipsByText = (t) =>
    [...$("prose1").querySelectorAll("span.sp")].filter((s) => s.textContent.includes(t));

  const methodChip = chipsByText("Kaplan-Meier estimation")[0];
  check("method chip present", !!methodChip);
  if (methodChip) {
    methodChip.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: true }));
    const pop = $("pop").textContent;
    check("hovering the method phrase now cites the SAP", pop.includes("SAP 7.7.2"), pop.slice(0, 300));
    check("the popover shows the quotation itself",
      pop.includes("using Kaplan-Meier estimates"), pop.slice(0, 400));
    check("the popover says the anchor is on the phrase use",
      pop.includes("phrase use"), pop.slice(0, 400));
  }

  /* A FIXED-TEXT phrase: no bindings at all, so no concept could ever have
     carried its anchor. */
  const fixedChip = chipsByText("censoring subjects lost to follow-up")[0];
  check("fixed-text chip present in prose", !!fixedChip);
  if (fixedChip) {
    fixedChip.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: true }));
    const pop = $("pop").textContent;
    check("a fixed-text phrase cites the SAP", pop.includes("SAP 7.7.2"), pop.slice(0, 300));
    check("its quote is the censoring sentence",
      pop.includes("lost to follow-up are censored"), pop.slice(0, 400));
  }

  /* A concept-bound phrase attributes its anchor to the concept, not the use. */
  const endpointChip = chipsByText("disease progression or death")[0];
  if (endpointChip) {
    endpointChip.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: true }));
    const pop = $("pop").textContent;
    check("a concept-bound phrase attributes its anchor to the concept",
      pop.includes("bound concept"), pop.slice(0, 400));
  }

  /*
   * Issue #13: a reused concept must lead with the section specifying THIS
   * analysis, and the passages it does not lead with must remain visible.
   */
  const endpointChip2 = chipsByText("disease progression or death")[0];
  if (endpointChip2) {
    endpointChip2.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: true }));
    const pop = $("pop").textContent;
    /* This is a regression pin on task 3's work (the endpoint already resolved
       to §7.7.2 before any of this task's changes) — kept because it is still
       a cheap, useful guard, but it is not this task's assertion. What THIS
       task introduced is order: the head must render ahead of the reference
       it outranks, not merely alongside it. */
    check("the endpoint's SAP 7.7.2 anchor is present (regression pin, predates this task)",
      pop.includes("SAP 7.7.2"), pop.slice(0, 400));
    check("the head anchor (7.7.2) renders before the reference it outranks (5.3)",
      pop.indexOf("7.7.2") !== -1 && pop.indexOf("5.3") !== -1 &&
        pop.indexOf("7.7.2") < pop.indexOf("5.3"), pop.slice(0, 500));
    check("the popover says why that reference leads",
      /nearest to/.test(pop), pop.slice(0, 400));
    check("the definitional reference is listed as SAP 5.3, not merely present somewhere",
      /also grounded in SAP 5\.3\b/.test(pop), pop.slice(0, 500));
  }

  /* Two references sharing a section, ordered by relation. */
  const summaryChip = chipsByText("median")[0];
  if (summaryChip) {
    summaryChip.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: true }));
    const pop = $("pop").textContent;
    check("the summary measure lists its other reference as SAP 7.7.2 (qualification)",
      /also grounded in SAP 7\.7\.2 \(qualification\)/.test(pop), pop.slice(0, 500));
  }

  /* Both numbers pinned, not just the wording: "33 phrase uses" alone still
     matches a regression to "30 of 33 phrase uses", and a bare "document
     references" match pins no total at all — the same class of
     non-discriminating assertion already caught once in the Task 2 fix round. */
  check("stop 4 reports anchoring coverage",
    /33 of 33 phrase uses/.test(txt("anchorCoverage")) &&
      /across 47 document references/.test(txt("anchorCoverage")), txt("anchorCoverage"));
}

/* ---------- 4. trace: click the endpoint chip ---------- */
const chips = [...$("prose1").querySelectorAll("span")].filter(
  (s) => s.textContent.includes("disease progression or death")
);
check("endpoint chip found in prose", chips.length > 0, "chips=" + chips.length);
if (chips.length) {
  chips[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const tiers = $("traceTiers").textContent;
  check("trace reaches adtte.xpt", tiers.includes("adtte.xpt"), tiers.slice(0, 200));
  check("trace shows ADTTE.AVAL", tiers.includes("ADTTE.AVAL"));
  check("trace shows the PFS where-clause", tiers.includes("PARAMCD = 'PFS'"));
  check("trace has no unfilled tokens", !tiers.includes("⟨"), tiers.slice(0, 200));
}

/* ---------- 5. model -> SAP edit: change the event to OS ---------- */
const selects = [...$("modelPanel").querySelectorAll("select")];
const eventSel = selects.find((s) => [...s.options].some((o) => o.value === "EVENT.OS"));
check("event select present in model panel", !!eventSel);
if (eventSel) {
  eventSel.value = "EVENT.OS";
  eventSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const after = txt("prose1");
  check("changing the event re-renders prose to OS",
    after.includes("death from any cause"), after.slice(0, 120));
  /* Re-render hides the trace box; re-click the (new) endpoint chip and assert
     the trace now follows the edited state rather than the old binding. */
  const osChips = [...$("prose1").querySelectorAll("span")].filter((s) =>
    s.textContent.includes("death from any cause")
  );
  check("OS endpoint chip present after edit", osChips.length > 0);
  if (osChips.length) {
    osChips[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const tiersAfter = $("traceTiers").textContent;
    check("trace follows the edit to the OS parameter",
      tiersAfter.includes("PARAMCD = 'OS'"), tiersAfter.slice(0, 200));
  }
}

/* ---------- 6. language switch on PrE0102 ---------- */
const langBtns = [...doc.querySelectorAll("#langsw button")];
check("language switch has three languages", langBtns.length === 3, "n=" + langBtns.length);
for (const b of langBtns) {
  b.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const p = txt("prose1");
  check(`prose renders in ${b.textContent} with no unfilled placeholders`,
    !p.includes("⟨"), p.slice(0, 100));
  check(`prose non-empty in ${b.textContent}`, p.length > 40);
}

/* ---------- 7. switch back to the pilot: unchanged ---------- */
[...$("studySwitch").querySelectorAll("button")][0]
  .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("switching back restores the pilot passage",
  txt("prose1").includes("ADAS-Cog(11)"), txt("prose1").slice(0, 80));

/* ---------- report ---------- */
check("no console errors or warnings", consoleErrors.length === 0, consoleErrors.join(" | "));

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} problem(s):`);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS — headless DOM walkthrough: all checks green, no console errors.");
