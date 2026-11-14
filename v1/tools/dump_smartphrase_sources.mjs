// Evaluates the SmartPhrase proof-of-concept data files (plain browser scripts
// that assign to `window`) from origin/estimands_01 and prints what they define
// as one JSON object, for the Python migration scripts to read.
//
// Usage: node v1/tools/dump_smartphrase_sources.mjs > sources.json
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const REF = "origin/estimands_01";
const DIR = "smartphrase/demo/data/";
const FILES = ["acdc-library.js", "acdc-library-proposed.js", "study-graph.js", "study-graph-pre0102.js", "lang-overlay.js"];

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of FILES) {
  const code = execFileSync("git", ["show", `${REF}:${DIR}${f}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  vm.runInContext(code, sandbox, { filename: f });
}
const out = {};
for (const k of Object.keys(sandbox)) {
  if (k === "window" || k === "globalThis") continue;
  out[k] = sandbox[k];
}
process.stdout.write(JSON.stringify(out));
