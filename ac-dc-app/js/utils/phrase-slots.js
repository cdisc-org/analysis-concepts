/**
 * Derives, from a set of composed phrase oids, which transformations the sentence could mean
 * and which fixture slots those transformations declare.
 *
 * The sentence narrows; it does not have to decide. A phrase set matching several
 * transformations is a valid state — choosing between them is the downstream selection Step 4
 * already owns (spec §11.1). While several stand, the slots they ALL declare are `required`
 * (bindable whichever is eventually chosen) and the rest are `pending`, each naming the
 * candidates that would need it.
 *
 * Which slots exist is never hardcoded here: it comes from each transformation's
 * `sliceKeys[]`, and each slot's picker source from `sliceKeys[].source` (spec §7.1, §7.2).
 */

/**
 * Transformations whose validSmartPhrases contain EVERY supplied phrase oid.
 *
 * This is a stricter rule than `phrase-engine.js:findMatchingTransformations`, which ranks by
 * partial coverage for a fuzzy palette. Authoring needs the opposite: a transformation that
 * cannot express one of the phrases the author actually wrote is not a candidate for it.
 *
 * @param {string[]} phraseOids
 * @param {object} lib  adapted library
 * @returns {Array<{conceptId: string, transformationType: string, coverage: number}>}
 */
export function resolveCandidates(phraseOids, lib) {
  const oids = [...new Set(phraseOids || [])];
  if (!oids.length) return [];

  const out = [];
  for (const t of lib.transformations || []) {
    const valid = new Set(t.validSmartPhrases || []);
    if (!valid.size) continue;
    if (!oids.every((o) => valid.has(o))) continue;
    out.push({
      conceptId: t.conceptId,
      transformationType: t.transformationType,
      /* How much of the transformation's vocabulary the sentence uses. Ranks a tightly
         matched transformation above one that merely permits these phrases among many. */
      coverage: oids.length / valid.size
    });
  }
  out.sort((a, b) => b.coverage - a.coverage || a.conceptId.localeCompare(b.conceptId));
  return out;
}

/**
 * The fixture slots the candidates declare.
 *
 * @param {Array<{conceptId: string}>} candidates  from resolveCandidates()
 * @param {object} lib  adapted library
 * @returns {{required: Array<{dimension: string, source: string}>,
 *            pending: Array<{dimension: string, source: string, neededBy: string[]}>}}
 */
export function deriveSlots(candidates, lib) {
  if (!candidates || !candidates.length) return { required: [], pending: [] };

  const byId = new Map((lib.transformations || []).map((t) => [t.conceptId, t]));
  const perCandidate = candidates.map((c) => {
    const t = byId.get(c.conceptId);
    const slots = new Map();
    for (const sk of (t && t.sliceKeys) || []) {
      if (sk.dimension) slots.set(sk.dimension, sk.source);
    }
    return { conceptId: c.conceptId, slots };
  });

  /* A candidate declaring no sliceKeys has no opinion about slots — 14 of the library's 25
     transformations are in that position, every derivation among them. Counting them toward
     unanimity would make it unreachable whenever one shares a candidate set with analyses,
     which is the common case, so agreement is measured over slot-bearing candidates only. */
  const slotBearing = perCandidate.filter((p) => p.slots.size > 0);
  if (slotBearing.length === 0) return { required: [], pending: [] };

  const required = [];
  const pending = [];
  const seen = new Set();
  for (const { slots } of slotBearing) {
    for (const [dimension, source] of slots) {
      if (seen.has(dimension)) continue;
      seen.add(dimension);
      const neededBy = slotBearing.filter((p) => p.slots.has(dimension)).map((p) => p.conceptId);
      if (neededBy.length === slotBearing.length) required.push({ dimension, source });
      else pending.push({ dimension, source, neededBy });
    }
  }
  return { required, pending };
}

/**
 * The phrase and placeholder that carry a given slice dimension.
 *
 * `deriveSlots` answers "which dimensions need binding"; `setDimensionBinding` needs
 * "(phraseOid, slot)". This closes that gap, so nothing downstream has to keep its own
 * dimension → phrase/slot table.
 *
 * Derived from the library, not declared here: a phrase's `anchors.produced_concept` names the
 * dimension it fills, and its `placeholders[].name` is the slot. Returns null when no phrase
 * carries that dimension.
 *
 * @param {string} dimension  e.g. "AnalysisVisit"
 * @param {object} lib  adapted library
 * @returns {{phrase: string, slot: string}|null}
 */
export function phraseSlotForDimension(dimension, lib) {
  if (!dimension) return null;
  for (const p of lib.smartPhrases || []) {
    if (!p || !p.anchors || p.anchors.produced_concept !== dimension) continue;
    const slot = ((p.placeholders || [])[0] || {}).name;
    /* A phrase that produces the dimension but declares no placeholder has nothing to bind. */
    if (slot) return { phrase: p.oid, slot };
  }
  return null;
}
