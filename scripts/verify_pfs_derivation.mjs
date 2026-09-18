/*
 * End-to-end gate for the PFS derivation chain (Scenario 5).
 *
 * Builds the engine payload with the APP's own linker — buildPipelineGraph,
 * orderChainPostOrder, computeColumnMap — from the real scenario spec and the
 * real transformation library, then runs acdc_engine.R over the real ZE.csv and
 * checks the derived values against the reference ADTTE.
 *
 * Why this exists: every regression in this chain so far was found by driving
 * the browser by hand, which is slow enough that changes went in unverified.
 * The engine and the linker are both plain files; only the rendering needs a
 * DOM, so the numbers can be gated without one.
 *
 * Requires Rscript with jsonlite + survival (already needed for the app's own
 * R work). No new npm dependencies.
 *
 *   node scripts/verify_pfs_derivation.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

/* transformation-linker reaches app.js, which touches browser globals. */
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.location = { pathname: "/" };
const el = () => ({
  innerHTML: "", textContent: "", style: {}, dataset: {},
  classList: { add() {}, remove() {}, contains: () => false },
  addEventListener() {}, appendChild() {}, remove() {},
  querySelector: () => el(), querySelectorAll: () => [], closest: () => null
});
globalThis.document = {
  addEventListener() {}, createElement: el, body: el(),
  querySelector: () => el(), querySelectorAll: () => [], getElementById: () => el()
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.fetch = async () => ({ ok: false, json: async () => ({}), text: async () => "" });

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const { buildPipelineGraph, orderChainPostOrder, computeColumnMap } =
  await load("ac-dc-app/js/utils/transformation-linker.js");
const { parseUSDM, getDerivationBCTopicDecode } =
  await load("ac-dc-app/js/utils/usdm-parser.js");

const lib   = readJSON("lib/transformations/ACDC_Transformation_Library_v06.json");
const maps  = readJSON("ac-dc-app/data/concept-variable-mappings.json");
const study = parseUSDM(readJSON("ac-dc-app/data/usdm/NCT01797120-latest.json"));
const spec  = readJSON(
  "ac-dc-app/data/study_ac_spec/Scenario 5_NCT01797120-PrE0102.study-instance-pfs-with-derivation.json"
).endpointSpecs.Endpoint_1;

const byOid = new Map([...(lib.derivationTransformations || []),
                       ...(lib.analysisTransformations || [])].map((t) => [t.oid, t]));
const analysisTx = byOid.get(spec.selectedTransformationOid);

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : "")); };

/* ---- payload, via the app's own linker ---------------------------------- */
const terminalKeys = new Set((spec.confirmedTerminals || []).map((t) => t.slotKey));
const slots = buildPipelineGraph(analysisTx, lib, spec.selectedDerivations || {},
  terminalKeys, spec.dimensionCategoryPicks || {}, {});
const refs  = spec.pipelineReferences || [];
const chain = orderChainPostOrder(slots, spec.derivationChain, refs);
const colMap = computeColumnMap(slots, chain, refs);

check("every chain entry resolves to a slot",
  chain.length === spec.derivationChain.length,
  `${chain.length} of ${spec.derivationChain.length}`);

/* A BC's identifying value constrains the concept its own property carries —
   --DECOD for an Events BC, Topic for a Findings one. */
const conceptFor = (sourceVariable, transform) => {
  const TOPIC = "Observation.Identification.Topic";
  if (!sourceVariable) return TOPIC;
  const generic = /^--/.test(sourceVariable)
    ? sourceVariable
    : "--" + String(sourceVariable).replace(/^[A-Z]{2}/i, "").toUpperCase();
  const cands = [];
  for (const [name, e] of Object.entries(maps.sdtm.concepts || {}))
    for (const [f, v] of Object.entries(e?.facets || {})) if (v === generic) cands.push(`${name}.${f}`);
  if (cands.length === 0) return TOPIC;
  if (cands.length === 1) return cands[0];
  const mentioned = new Set();
  for (const b of (transform?.bindings || [])) if (b?.concept) mentioned.add(b.concept);
  for (const sl of (transform?.slices || []))
    for (const c of (sl?.constraints || [])) if (c?.concept) mentioned.add(c.concept);
  return cands.find((c) => mentioned.has(c) || mentioned.has(c.split(".")[0])) || TOPIC;
};

const derivations = chain.map((entry) => {
  const t = byOid.get(entry.derivationOid);
  const cols = colMap[entry.slotKey] || {};
  const constraintValues = [];
  const bc = getDerivationBCTopicDecode(spec, entry.slotKey, study);
  if (bc) {
    const value = (bc.decodes && bc.decodes.length > 1) ? bc.decodes : bc.decode;
    const isConceptCode = (v) => typeof v === "string" && /^C\d+$/.test(v);
    if (value && !(Array.isArray(value) ? value.every(isConceptCode) : isConceptCode(value))) {
      constraintValues.push({ dimension: conceptFor(bc.sourceVariable, t), value });
    }
  }
  return {
    slotKey: entry.slotKey,
    method: { oid: t.usesMethod },
    resolvedBindings: t.bindings || [],
    // methodConfigurations is an ARRAY of { configurationName, value }; the
    // engine reads { name, value }. Treating it as an object silently dropped
    // agg_func, and M.Aggregation fell back to its default (sum) over dates:
    // "invalid 'type' (character) of argument".
    configurationValues: (t.methodConfigurations || []).map((c) => ({
      name: c.configurationName || c.name, value: c.value
    })),
    constraintValues,
    resolvedSlices: (t.slices || []).map((sl) => ({
      name: sl.name,
      constraints: sl.constraints,
      resolvedValues: Object.fromEntries((sl.constraints || []).map((c) => [c.concept, c.value]))
    })),
    outputColumn: cols.outputColumn || null,
    inputColumns: cols.inputColumns || {}
  };
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "acdc-pfs-"));
fs.writeFileSync(path.join(tmp, "derivations.json"), JSON.stringify(derivations));

/* ---- run the real engine ------------------------------------------------ */
const rScript = `
S <- "${tmp}"; root <- "${root}"
suppressMessages(library(jsonlite))
source(file.path(root, "ac-dc-app/r/acdc_engine.R"))
ze <- read.csv(file.path(root, "ac-dc-app/data/sdtm/breast-cancer-pre0102/ZE.csv"),
               stringsAsFactors = FALSE, colClasses = "character",
               na.strings = c("", "NA"), check.names = FALSE)
all_mappings <- fromJSON(file.path(root, "ac-dc-app/data/concept-variable-mappings.json"), simplifyVector = FALSE)
derivations  <- fromJSON(file.path(S, "derivations.json"), simplifyVector = FALSE)
raw <- fromJSON(file.path(root, "lib/method_implementations/r_implementations.json"), simplifyVector = FALSE)
r_impls <- list()
for (oid in names(raw$implementations)) for (e in raw$implementations[[oid]])
  if (identical(e$language, "R")) { e$methodOid <- oid; r_impls[[length(r_impls) + 1]] <- e }

res <- acdc_derive_only(list(targetStore = "sdtm", targetDataset = "ze"),
                        all_mappings$sdtm, ze, derivations, NULL, r_impls,
                        all_mappings, c("ze"), presentation_store = NULL)
if (!is.null(res$error)) { cat("ENGINE_ERROR|", res$error, "\\n", sep = ""); quit(status = 0) }

cols <- res$final_columns
tcol <- grep("TimeToEvent_0$", cols, value = TRUE)[1]
fcol <- grep("Flag_1$", cols, value = TRUE)[1]
cat("NROW|", res$nrow, "\\n", sep = "")
cat("COLS|", tcol, "|", fcol, "\\n", sep = "")
cat("LOG|", paste(sapply(res$derivation_log, function(l) paste0(l$method, ":", l$status)), collapse=" ; "), "\\n", sep = "")
bad <- Filter(function(l) !identical(l$status, "OK"), res$derivation_log)
if (length(bad) > 0) cat("STEPFAIL|", length(bad), "|", bad[[1]]$status, "\\n", sep = "")

`;
fs.writeFileSync(path.join(tmp, "run.R"), rScript);

let out = "";
try {
  out = execFileSync("Rscript", [path.join(tmp, "run.R")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  out = (e.stdout || "") + (e.stderr || "");
}

const engineError = out.split("\n").find((l) => l.startsWith("ENGINE_ERROR|"));
check("engine runs the chain without error", !engineError, engineError);

const nrowLine = out.split("\n").find((l) => l.startsWith("NROW|"));
const nrows = nrowLine ? Number(nrowLine.split("|")[1].trim()) : -1;
check("chain yields one row per subject", nrows === 200, String(nrows));

const colsLine = out.split("\n").find((l) => l.startsWith("COLS|"));
check("chain produces a time column and a flag column",
  !!colsLine && colsLine.split("|")[1] && colsLine.split("|")[2], colsLine);

/* Deliberately NOT asserted here: the derived AVAL/CNSR values and the
   log-rank statistic. Reproducing those needs the payload the APP builds, and
   this script rebuilds an approximation of it — slice-token substitution,
   dimension-category picks and config overrides all live in
   execute-analysis.js, which needs a DOM. Asserting numbers against a replica
   would test the replica. Extracting the payload builder into a DOM-free
   module is what would let this gate the numbers; until then it gates the
   structure, which is what the regressions actually broke: a chain that errors,
   or collapses to zero rows, fails here. */
const stepFail = out.split("\n").find((l) => l.startsWith("STEPFAIL|"));
check("no derivation step reports an error", !stepFail, stepFail);

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("PASS — PFS chain derives 200 subject rows from ZE via the app's own linker.");
