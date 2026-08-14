/*
 * Regenerates smartphrase/demo/data/acdc-library.js — a verbatim subset of the
 * AC/DC library artefacts on methods_02, wrapped as a browser-loadable IIFE
 * (file:// blocks fetch() of local JSON; a <script src> is not blocked).
 *
 *   node smartphrase/tools/build-library-subset.mjs                 # write
 *   node smartphrase/tools/build-library-subset.mjs --check         # verify, no write
 *   node smartphrase/tools/build-library-subset.mjs --legacy-banner # fidelity proof
 *
 * Selection is declared below, not inferred. Entity JSON is copied verbatim —
 * this tool must never reshape upstream content. Widening the SELECT_* lists is
 * the only legitimate way to add library content to the demo.
 *
 * --legacy-banner reproduces the pre-generator file header, used once to prove
 * this tool emits the committed file byte-for-byte before selection was widened.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..");
const outPath = path.join(here, "..", "demo", "data", "acdc-library.js");
const check = process.argv.includes("--check");
const legacyBanner = process.argv.includes("--legacy-banner");

const SOURCE_BRANCH = "methods_02";
const SOURCE_COMMIT = "ffee5df";
const TRANSFORMATION_LIB = "lib/transformations/ACDC_Transformation_Library_v07.json";
const OUTPUT_CLASS_VOCAB = "lib/vocabulary/output_class_templates.json";

/* Which upstream entities the demo needs. */
const SELECT_TRANSFORMATIONS = [
  "T.BaselineSelection",
  "T.ChangeFromBaseline",
  "T.CFB_ANCOVA",
  /* Implements the Hypothetical strategy for the Pilot estimand — real
     upstream content, referenced by IceHandling.implementedBy (issue #11). */
  "T.LOCF_Imputation"
];
const SELECT_METHODS = ["M_ANCOVA", "M_KaplanMeier"];

/* Output classes the demo's templates declare. The summary-measure phrase
   binds one of these, and the binding is validated against both the template's
   declared outputs and the method's own outputs[] — so this vocabulary is what
   makes ICH E9(R1) attribute 5 verifiable rather than decorative. Selected
   explicitly so the subset stays small and the selection stays auditable. */
const SELECT_OUTPUT_CLASSES = [
  "ls_means", "contrasts_t", "type3_tests_f", "parameter_estimates_linear",
  "fit_statistics_linear", "median_survival", "survival_table",
  "event_summary", "landmark_estimates"
];

function gitShow(relPath) {
  return execFileSync("git", ["show", `${SOURCE_COMMIT}:${relPath}`], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
}

const upstream = JSON.parse(gitShow(TRANSFORMATION_LIB));

/* Filter, preserving upstream order. Fail loudly on a typo in the selection. */
const transformations = upstream.transformations.filter(
  (t) => SELECT_TRANSFORMATIONS.indexOf(t.conceptId) !== -1
);
const missingT = SELECT_TRANSFORMATIONS.filter(
  (id) => !transformations.some((t) => t.conceptId === id)
);
if (missingT.length) {
  console.error(`FAIL — transformations not found upstream: ${missingT.join(", ")}`);
  process.exit(1);
}

const methodFiles = SELECT_METHODS.map((n) => `lib/methods/analyses/${n}.json`);
const methods = {};
SELECT_METHODS.forEach((name, i) => {
  methods[name.replace("_", ".")] = JSON.parse(gitShow(methodFiles[i]));
});

const vocab = JSON.parse(gitShow(OUTPUT_CLASS_VOCAB)).output_class_templates;
const outputClasses = {};
SELECT_OUTPUT_CLASSES.forEach((id) => {
  if (!vocab[id]) {
    console.error(`FAIL — output class not found upstream: ${id}`);
    process.exit(1);
  }
  outputClasses[id] = vocab[id];
});

const library = {
  provenance: {
    source_branch: SOURCE_BRANCH,
    source_commit: SOURCE_COMMIT,
    files: [TRANSFORMATION_LIB, OUTPUT_CLASS_VOCAB].concat(methodFiles),
    note: "Verbatim subset of the authoritative AC/DC model artefacts; generated, not hand-edited."
  },
  /* Upstream calls this `version`; the demo has always exposed it as
     `library_version`. Renaming a field is not reshaping content. */
  library_version: upstream.version,
  configurationOptions: upstream.configurationOptions,
  roleDefinitions: upstream.roleDefinitions,
  smartPhrases: upstream.smartPhrases,
  transformations: transformations,
  methods: methods,
  outputClasses: outputClasses
};

const BANNER_LEGACY = [
  "/*",
  " * AC/DC library subset for the smartphrase demo.",
  ` * GENERATED from ${SOURCE_BRANCH} (commit ${SOURCE_COMMIT}) — do not hand-edit; see provenance field.`,
  " */"
].join("\n");

const BANNER = [
  "/*",
  " * AC/DC library subset for the smartphrase demo.",
  ` * GENERATED from ${SOURCE_BRANCH} (commit ${SOURCE_COMMIT}) — do not hand-edit; see provenance field.`,
  " *",
  " * Regenerate with:  node smartphrase/tools/build-library-subset.mjs",
  " *",
  " * Proposed additions that are NOT yet upstream live in acdc-library-proposed.js",
  " * and are flagged in the demo UI.",
  " */"
].join("\n");

const body =
  (legacyBanner ? BANNER_LEGACY : BANNER) +
  "\n(function(g){ g.ACDC_LIBRARY = " +
  JSON.stringify(library, null, 2) +
  ";\n})(typeof window!=='undefined' ? window : globalThis);\n";

if (check) {
  const current = fs.readFileSync(outPath, "utf8");
  if (current !== body) {
    console.error("FAIL — acdc-library.js on disk differs from generator output.");
    process.exit(1);
  }
  console.log("PASS — acdc-library.js matches generator output.");
} else {
  fs.writeFileSync(outPath, body);
  console.log(
    `wrote ${path.relative(repo, outPath)} — ${library.smartPhrases.length} phrases, ` +
      `${transformations.length} templates, methods: ${Object.keys(methods).join(", ")}`
  );
}
