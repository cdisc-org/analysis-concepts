/*
 * Proves slot derivation: a sentence narrows a candidate set, the candidates declare the
 * slots, and multiple candidates is a valid state (spec §11.1).
 *
 *   node scripts/verify_phrase_slots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { adaptV06Library } = await load("ac-dc-app/js/utils/smartphrase-lib-adapter.js");
const { resolveCandidates, deriveSlots } = await load("ac-dc-app/js/utils/phrase-slots.js");

const v06 = JSON.parse(fs.readFileSync(
  path.join(root, "lib/transformations/ACDC_Transformation_Library_v06.json"), "utf8"));
const lib = adaptV06Library(v06);

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : "")); };
const ids = (cands) => cands.map((c) => c.conceptId).sort();

/* --- endpoint phrase alone: three candidates, not an error --- */
const cfbOnly = resolveCandidates(["SP_CFB_ENDPOINT"], lib);
check("CFB alone yields 3 candidates", cfbOnly.length === 3, JSON.stringify(ids(cfbOnly)));
check("CFB candidates are the expected three",
  JSON.stringify(ids(cfbOnly)) ===
    JSON.stringify(["T.CFB_ANCOVA", "T.CFB_MMRM_Primary", "T.ChangeFromBaseline"]),
  JSON.stringify(ids(cfbOnly)));

/* --- adding the method phrase narrows to one --- */
const ancova = resolveCandidates(["SP_CFB_ENDPOINT", "SP_METHOD_ANCOVA"], lib);
check("CFB + ANCOVA narrows to T.CFB_ANCOVA",
  ancova.length === 1 && ancova[0].conceptId === "T.CFB_ANCOVA", JSON.stringify(ids(ancova)));

const mmrm = resolveCandidates(["SP_CFB_ENDPOINT", "SP_METHOD_MMRM"], lib);
check("CFB + MMRM narrows to T.CFB_MMRM_Primary",
  mmrm.length === 1 && mmrm[0].conceptId === "T.CFB_MMRM_Primary", JSON.stringify(ids(mmrm)));

/* --- slots come from the resolved transformation --- */
const ancovaSlots = deriveSlots(ancova, lib);
check("ANCOVA requires 3 slots", ancovaSlots.required.length === 3,
  JSON.stringify(ancovaSlots.required));
check("ANCOVA requires a visit slot",
  ancovaSlots.required.some((s) => s.dimension === "AnalysisVisit" && s.source === "visit"),
  JSON.stringify(ancovaSlots.required));
check("ANCOVA has no pending slots", ancovaSlots.pending.length === 0,
  JSON.stringify(ancovaSlots.pending));

const mmrmSlots = deriveSlots(mmrm, lib);
check("MMRM requires 2 slots", mmrmSlots.required.length === 2, JSON.stringify(mmrmSlots.required));
check("MMRM requires NO visit slot",
  !mmrmSlots.required.some((s) => s.dimension === "AnalysisVisit"),
  JSON.stringify(mmrmSlots.required));

/* --- multiple candidates: required is the intersection, the rest are pending --- */
const both = resolveCandidates(["SP_CFB_ENDPOINT", "SP_PARAMETER"], lib)
  .filter((c) => c.transformationType === "analysis");
const bothSlots = deriveSlots(both, lib);
check("intersection across ANCOVA+MMRM is Parameter and Population",
  JSON.stringify(bothSlots.required.map((s) => s.dimension).sort()) ===
    JSON.stringify(["Parameter", "Population"]),
  JSON.stringify(bothSlots.required));
check("AnalysisVisit is pending, not required",
  bothSlots.pending.some((s) => s.dimension === "AnalysisVisit"),
  JSON.stringify(bothSlots.pending));
check("pending slot names which candidate needs it",
  bothSlots.pending.find((s) => s.dimension === "AnalysisVisit")?.neededBy
    .includes("T.CFB_ANCOVA"),
  JSON.stringify(bothSlots.pending));

/* --- a transformation with no sliceKeys yields no slots, not a crash --- */
const noSlots = deriveSlots(
  [{ conceptId: "T.BaselineSelection", transformationType: "derivation", coverage: 1 }], lib);
check("no sliceKeys -> no required slots", noSlots.required.length === 0);
check("no sliceKeys -> no pending slots", noSlots.pending.length === 0);

/* --- empty input is not a crash --- */
check("no phrases -> no candidates", resolveCandidates([], lib).length === 0);
check("no candidates -> no slots", deriveSlots([], lib).required.length === 0);

/* --- The spec's headline multi-candidate case, UNFILTERED — a slot-less derivation shares
     the candidate set with two analyses and must not empty `required`. --- */
const unfiltered = resolveCandidates(["SP_CFB_ENDPOINT"], lib);
check("unfiltered CFB yields 3 candidates including the derivation",
  unfiltered.length === 3, JSON.stringify(ids(unfiltered)));
const unfilteredSlots = deriveSlots(unfiltered, lib);
check("a slot-less derivation does not empty required",
  JSON.stringify(unfilteredSlots.required.map((s) => s.dimension).sort()) ===
    JSON.stringify(["Parameter", "Population"]),
  JSON.stringify(unfilteredSlots.required));
check("AnalysisVisit stays pending in the unfiltered set",
  unfilteredSlots.pending.some((s) => s.dimension === "AnalysisVisit"),
  JSON.stringify(unfilteredSlots.pending));

/* --- All-slot-less candidates: nothing to bind, and no crash. --- */
const allSlotless = deriveSlots(
  [{ conceptId: "T.BaselineSelection", transformationType: "derivation", coverage: 1 },
   { conceptId: "T.ChangeFromBaseline", transformationType: "derivation", coverage: 1 }], lib);
check("all-slot-less candidates yield no slots",
  allSlotless.required.length === 0 && allSlotless.pending.length === 0,
  JSON.stringify(allSlotless));

/* --- Pin the source invariant: each dimension declares exactly one source library-wide. --- */
const sourcesByDimension = new Map();
for (const t of lib.transformations || []) {
  for (const sk of t.sliceKeys || []) {
    if (!sk.dimension) continue;
    if (!sourcesByDimension.has(sk.dimension)) sourcesByDimension.set(sk.dimension, new Set());
    sourcesByDimension.get(sk.dimension).add(sk.source);
  }
}
const conflicting = [...sourcesByDimension.entries()]
  .filter(([, s]) => s.size > 1)
  .map(([d, s]) => `${d}: ${[...s].join("/")}`);
check("each dimension declares exactly one source library-wide",
  conflicting.length === 0, conflicting.join(", "));

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — slot derivation follows the resolved transformations.");
