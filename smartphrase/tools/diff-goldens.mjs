/*
 * Structural diff of goldens.json against its committed version.
 *
 *   node smartphrase/tools/diff-goldens.mjs              # vs HEAD
 *   node smartphrase/tools/diff-goldens.mjs <rev>        # vs any revision
 *   node smartphrase/tools/diff-goldens.mjs --summary     # leaf paths only
 *
 * Goldens are captured from behaviour, so the question after `--update-goldens`
 * is never "are they right?" but "did anything move that I did not intend?".
 * A 35KB textual diff of two JSON blobs cannot answer that; this walks the two
 * trees and reports one line per changed LEAF, so an intended addition shows up
 * as N × ADDED and an accidental edit shows up as a value change that is
 * impossible to miss.
 *
 * Exits 0 always — this is a review aid, not a gate. The gate is verify.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..");
const rel = "smartphrase/tools/goldens.json";

const args = process.argv.slice(2);
const summary = args.includes("--summary");
const rev = args.filter((a) => !a.startsWith("--"))[0] || "HEAD";

let before;
try {
  before = JSON.parse(
    execFileSync("git", ["show", `${rev}:${rel}`], {
      cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024
    })
  );
} catch (e) {
  console.error(`cannot read ${rel} at ${rev}: ${e.message}`);
  process.exit(1);
}
const after = JSON.parse(fs.readFileSync(path.join(repo, rel), "utf8"));

const changes = [];
function walk(o, n, at) {
  if (JSON.stringify(o) === JSON.stringify(n)) return;
  const leaf = o === null || n === null || typeof o !== "object" || typeof n !== "object";
  if (leaf) {
    changes.push({ at, kind: "CHANGED", from: o, to: n });
    return;
  }
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  for (const k of keys) {
    const sub = Array.isArray(o) ? `${at}[${k}]` : `${at}.${k}`;
    if (!(k in o)) changes.push({ at: sub, kind: "ADDED", to: n[k] });
    else if (!(k in n)) changes.push({ at: sub, kind: "REMOVED", from: o[k] });
    else walk(o[k], n[k], sub);
  }
}

for (const k of Object.keys(before)) {
  if (!(k in after)) changes.push({ at: k, kind: "GOLDEN REMOVED" });
  else walk(before[k], after[k], k);
}
for (const k of Object.keys(after)) {
  if (!(k in before)) changes.push({ at: k, kind: "GOLDEN ADDED" });
}

if (!changes.length) {
  console.log(`no change vs ${rev} — ${Object.keys(after).length} goldens identical.`);
  process.exit(0);
}

const byKind = {};
changes.forEach((c) => { byKind[c.kind] = (byKind[c.kind] || 0) + 1; });

console.log(`${changes.length} leaf change(s) vs ${rev}:`);
Object.keys(byKind).sort().forEach((k) => console.log(`  ${k}: ${byKind[k]}`));
console.log("");

/* Group by the trailing field path so "the same addition on every instance"
   reads as one line rather than seven. */
if (summary) {
  const shapes = {};
  changes.forEach((c) => {
    /* Golden keys are slash-separated (study/instance/kind); the field path
       begins at the first "." or "[" AFTER the last slash. Splitting on the
       first "." outright would cut inside instance ids like AC.PRIMARY.PFS. */
    const slash = c.at.lastIndexOf("/");
    const tail = slash === -1 ? c.at : c.at.slice(slash + 1);
    const m = tail.match(/[.[]/);
    const field = m ? tail.slice(m.index) : "";
    const key = c.kind + " " + (field || "(whole golden)");
    shapes[key] = (shapes[key] || 0) + 1;
  });
  Object.keys(shapes).sort().forEach((k) => console.log(`  ${k}  ×${shapes[k]}`));
} else {
  changes.forEach((c) => {
    const val = (v) => {
      const s = JSON.stringify(v);
      return s && s.length > 160 ? s.slice(0, 157) + "…" : s;
    };
    if (c.kind === "CHANGED") console.log(`  ${c.at}\n      was: ${val(c.from)}\n      now: ${val(c.to)}`);
    else if (c.kind === "ADDED") console.log(`  + ${c.at} = ${val(c.to)}`);
    else if (c.kind === "REMOVED") console.log(`  - ${c.at} (was ${val(c.from)})`);
    else console.log(`  ${c.kind}: ${c.at}`);
  });
}
