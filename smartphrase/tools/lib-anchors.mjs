/*
 * Document-anchor helpers, shared by the verification gates.
 *
 * An anchor is `{ section, quote? }` on a study-side entity — a concept, a
 * phrase instance, an estimand or an analysis instance. Issue #12: anchoring is
 * a property of the study-side USE, not of one entity class, because three of
 * the four binding kinds (method, output, value) resolve into the library, which
 * correctly forbids study text.
 *
 * The point of this module is that a quote is CHECKED, not merely stored: an
 * anchor nobody verifies is an assertion, and the first run of this gate caught
 * a paraphrase that had been sitting in the repo looking like a quotation.
 */
import fs from "node:fs";
import path from "node:path";

/*
 * Normalise before comparing. The converted SAP is hard-wrapped, so a quote
 * spanning lines carries newlines the author never typed; the PDF conversion
 * produced typographic punctuation (' " – —) where a reader would type ASCII;
 * and Markdown emphasis markers are conversion artefacts, not source characters
 * — a sentence rendered in bold in the PDF must still be quotable as text.
 */
export function normalise(s) {
  return String(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/*
 * The PDF wrapped lines mid-word, and the conversion preserved that faithfully:
 * §7.7.2 contains "Kaplan-\nMeier". Rejoining is genuinely ambiguous — a
 * line-break hyphen may belong to the word ("Kaplan-Meier") or be pure
 * typesetting ("random-\nised") — and nothing in the text says which.
 *
 * Rather than guess, both readings are tried and either may match. That cannot
 * admit a wrong quote: the text must still equal one of the two legitimate
 * de-hyphenations of what the document actually contains.
 */
function dehyphenations(body) {
  return [
    normalise(body),                                     // "kaplan- meier"
    normalise(String(body).replace(/(\w)-\n\s*(\w)/g, "$1-$2")),  // "kaplan-meier"
    normalise(String(body).replace(/(\w)-\n\s*(\w)/g, "$1$2"))    // "kaplanmeier"
  ];
}

export function quoteAppearsIn(body, quote) {
  const q = normalise(quote);
  return dehyphenations(body).some((v) => v.includes(q));
}

/*
 * "7.7.2" resolves through its head, "7": the conversion is split by top-level
 * section, so subsections live in their parent's file.
 */
export function resolveSection(smartphraseDir, graph, section) {
  const sd = graph.sourceDocument;
  if (!sd) return null;
  const head = String(section).split(".")[0];
  const rel = sd.sectionFiles[head];
  return rel ? path.join(smartphraseDir, sd.root, rel) : null;
}

/*
 * Every anchor in a study graph, with a human-readable `where` for failure
 * messages. Walks whatever entity classes exist, so a later task adding anchors
 * to a new class is covered without revisiting this.
 */
export function allAnchors(graph, phraseDefOf) {
  const out = [];
  const add = (where, a) => {
    if (a && typeof a === "object" && a.section) out.push({ where, ...a });
  };

  Object.keys(graph.concepts || {}).forEach((id) => add(`concept ${id}`, graph.concepts[id].sapRef));
  Object.keys(graph.estimands || {}).forEach((id) => add(`estimand ${id}`, graph.estimands[id].sapRef));

  (graph.instances || []).forEach((inst) => {
    add(`instance ${inst.id}`, inst.sapRef);
    (inst.phrases || []).forEach((pi, i) => {
      const oid = pi.phrase;
      add(`${inst.id} phrase[${i}] ${oid}`, pi.sapRef);
    });
  });
  return out;
}

/*
 * Section headings actually present in a converted file, e.g. "7.7.2". Used to
 * check that a cited subsection exists rather than only that its parent file
 * does — citing "7.99" would otherwise resolve happily to section 7's file.
 */
export function sectionsIn(file) {
  const body = fs.readFileSync(file, "utf8");
  const found = new Set();
  const re = /^#{1,6}\s+([0-9]+(?:\.[0-9]+)*)\.?\s/gm;
  let m;
  while ((m = re.exec(body))) found.add(m[1]);
  return found;
}
