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
