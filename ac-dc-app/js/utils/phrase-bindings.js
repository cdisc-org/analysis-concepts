/**
 * The single writer for phrase bindings.
 *
 * A binding persists a USDM concept id (spec §7.3) while `dimensionValues` persists a label
 * string, and Steps 6 and 8 execute from the latter. The two must never drift, so exactly one
 * function writes either of them — Step 3's dropdown resolves its label to an id and calls the
 * same helper Step 7's picker calls (spec §11.3).
 */
import { addUnresolvedConcept } from "./smartphrase-graph.js";
import { phraseSlotForDimension } from "./phrase-slots.js";

/**
 * Find the concept a label refers to, within one declared source.
 *
 * Returns null when zero or more than one concept matches. An ambiguous label is left
 * unresolved rather than guessed — a wrong anchor is worse than an absent one.
 *
 * Anchored concepts win outright. Without that rule an `UNRESOLVED.*` concept synthesised for
 * a label would permanently shadow the real USDM concept that later arrives under it: both
 * would match, the count would be two, this would return null, and `addUnresolvedConcept`
 * would idempotently hand back the unresolved id forever. Preferring anchored hits lets a
 * study re-parse adopt the real concept.
 *
 * @param {object} graph
 * @param {string} source  a declared sliceKey source
 * @param {string} label
 * @returns {string|null}
 */
export function resolveLabelToConceptId(graph, source, label) {
  const hits = Object.keys(graph.concepts || {}).filter((id) => {
    const c = graph.concepts[id];
    return c.source === source && c.label === label;
  });
  const anchored = hits.filter((id) => graph.concepts[id].anchored !== false);
  const pool = anchored.length ? anchored : hits;
  return pool.length === 1 ? pool[0] : null;
}

/**
 * Bind one dimension, updating both representations.
 *
 * `conceptId` must already be in `graph.concepts` — the id and the label it writes to
 * `dimensionValues` must always be written together, from the same concept, or not at all.
 * An unknown id throws rather than writing the id side while leaving `dimensionValues[dimension]`
 * stale: the concept id is expected to always originate from the graph, so an unknown id here is
 * a programming error, not user input, and a raised error is far cheaper to recover from than a
 * wrong parameter silently baked into `dimensionValues` — the field Steps 6 and 8 execute from.
 *
 * @param {object} spec        endpointSpecs[epId]
 * @param {object} graph
 * @param {string} phraseOid   e.g. "SP_TIMEPOINT"
 * @param {string} slot        the placeholder name, e.g. "visit"
 * @param {string} dimension   the dimensionValues key, e.g. "AnalysisVisit"
 * @param {string} conceptId   must exist in graph.concepts
 * @param {string} [render]    optional engine render mode for this binding. Omitted, the engine
 *   falls back to the placeholder's `default_render`, which is `name_with_label` for both
 *   `parameter` and `visit` — rendering "at Week 24 (Week 24)" when name and label coincide, as
 *   they do for every concept this module builds. Passing e.g. "name" suppresses that. Choosing
 *   a mode per slot is the UI phase's call; this is only the plumbing that lets it be made.
 * @throws {Error} if conceptId is not in graph.concepts
 */
export function setDimensionBinding(spec, graph, phraseOid, slot, dimension, conceptId, render) {
  const concept = (graph.concepts || {})[conceptId];
  if (!concept) {
    throw new Error(
      `setDimensionBinding: concept "${conceptId}" is not in the graph. ` +
      `Bindings and dimensionValues must be written together or not at all — ` +
      `writing only the id would leave dimensionValues[${dimension}] stale.`);
  }

  if (!Array.isArray(spec.phraseInstances)) spec.phraseInstances = [];
  if (!spec.dimensionValues) spec.dimensionValues = {};

  let instance = spec.phraseInstances.find((p) => p.phrase === phraseOid);
  if (!instance) {
    instance = { phrase: phraseOid, bindings: {} };
    spec.phraseInstances.push(instance);
  }
  if (!instance.bindings) instance.bindings = {};
  instance.bindings[slot] = render ? { concept: conceptId, render } : { concept: conceptId };

  spec.dimensionValues[dimension] = concept.label;
}

/**
 * Every dimension the library declares a sliceKey source for, mapped to that source.
 *
 * Read from `sliceKeys[]`, never listed here: adding a transformation with a new dimension must
 * be the only thing that widens this. First declaration wins — `verify_phrase_slots.mjs` pins
 * that no dimension declares two different sources anywhere in the library.
 *
 * @param {object} lib  adapted library
 * @returns {Map<string, string>} dimension -> source
 */
function declaredDimensionSources(lib) {
  const out = new Map();
  for (const t of (lib && lib.transformations) || []) {
    for (const sk of t.sliceKeys || []) {
      if (sk.dimension && sk.source && !out.has(sk.dimension)) out.set(sk.dimension, sk.source);
    }
  }
  return out;
}

/**
 * The routing table the backfill and the rehydration both read: for each dimension the library
 * declares, which phrase and placeholder carry it and where its values come from.
 *
 * Entirely derived — `declaredDimensionSources` supplies the source and `phraseSlotForDimension`
 * the phrase and slot. A dimension no phrase carries simply has no route.
 *
 * @param {object} lib  adapted library
 * @returns {Array<{phrase: string, slot: string, dimension: string, source: string}>}
 */
function dimensionRoutes(lib) {
  const routes = [];
  for (const [dimension, source] of declaredDimensionSources(lib)) {
    const ps = phraseSlotForDimension(dimension, lib);
    if (ps) routes.push({ phrase: ps.phrase, slot: ps.slot, dimension, source });
  }
  return routes;
}

/* Saves made before `phraseInstances` existed record the endpoint's subject label under the
   `Parameter` key of `dimensionValues`, whatever the endpoint phrase calls its own placeholder
   — SP_TTE_ENDPOINT calls it `event`, not `parameter`. That key is a fact about the saved file's
   shape, not about the library, which is why it is named here; the SLOT the binding is written
   to is still read from the library's `placeholders[].name`. */
const LEGACY_ENDPOINT_DIMENSION = "Parameter";

/** @returns {object|undefined} the adapted phrase with this oid */
function phraseByOid(lib, oid) {
  return ((lib && lib.smartPhrases) || []).find((p) => p && p.oid === oid);
}

/** @returns {string|undefined} a phrase's first placeholder name — the slot a binding fills */
function slotOfPhrase(lib, oid) {
  const p = phraseByOid(lib, oid);
  return p && ((p.placeholders || [])[0] || {}).name;
}

/**
 * Re-add the synthesised concepts a saved spec's bindings refer to.
 *
 * `addUnresolvedConcept` mutates the live graph, but `buildConceptGraph` rebuilds that graph
 * from USDM on every study load, and `backfillPhraseInstances` no-ops once `phraseInstances`
 * exists. Without this, a spec saved with an UNRESOLVED.* binding loads into a graph that has
 * never heard of it: the phrase renders ⟨slot?⟩ and its sliceKey goes null.
 *
 * The id's slug is lossy, so the label is recovered from `dimensionValues`, which is saved
 * alongside and holds the original text. A recovered label is only accepted when re-adding it
 * reproduces the binding's exact id; a label that does not round-trip is the wrong label, and
 * the graph is left as it was. If no label can be recovered the binding is left alone — a
 * missing concept that stays missing is honest, a guessed label is not.
 *
 * Idempotent, and safe to call on every load — including before backfill.
 *
 * @param {object} spec   endpointSpecs[epId]
 * @param {object} graph  the live graph (mutated)
 * @param {object} lib    adapted library
 */
export function ensureUnresolvedConcepts(spec, graph, lib) {
  if (!spec || !Array.isArray(spec.phraseInstances)) return;
  if (!graph || !graph.concepts) return;

  const dims = spec.dimensionValues || {};
  const bySlot = new Map(dimensionRoutes(lib).map((r) => [r.slot, r]));

  for (const instance of spec.phraseInstances) {
    for (const [slot, binding] of Object.entries((instance && instance.bindings) || {})) {
      const id = binding && binding.concept;
      if (typeof id !== "string" || !id.startsWith("UNRESOLVED.")) continue;
      if (graph.concepts[id]) continue;

      /* UNRESOLVED.<source>.<slug> — `slug()` emits only [a-z0-9-], so the second segment is
         the whole source and nothing else can contain a dot. */
      const source = id.split(".")[1];
      if (!source) continue;

      /* The dimension whose label this slot was bound from: the slot's own, and failing that
         the legacy endpoint key, since an endpoint slot ("event") has no dimension phrase. */
      const mapped = bySlot.get(slot);
      const candidates = [...new Set([mapped && mapped.dimension, LEGACY_ENDPOINT_DIMENSION])]
        .filter(Boolean);

      for (const dimension of candidates) {
        const label = dims[dimension];
        if (!label) continue;
        const known = new Set(Object.keys(graph.concepts));
        const readded = addUnresolvedConcept(graph, source, label);
        if (readded === id) break;
        /* That label belongs to a different concept — its id does not round-trip. Undo the
           speculative add (unless it was already there) and try the next candidate. */
        if (!known.has(readded)) delete graph.concepts[readded];
      }
    }
  }
}

/**
 * Derive `phraseInstances` for a spec saved before this field existed.
 *
 * Reads the fields older saves do carry — `selectedEndpointPhrase`, `selectedDimPhrases` and
 * `dimensionValues` — and resolves each label back to a concept id. A label that does not
 * resolve is given an unresolved concept via `addUnresolvedConcept` rather than a bare value,
 * so the binding still carries a `.concept` — the only shape the engine's `boundConcepts`
 * recognises — and the fixture still slices the cube while the UI can flag it as unanchored.
 *
 * Which phrase and placeholder each dimension routes to is read from the library, not listed
 * here: a phrase's `anchors.produced_concept` names the dimension it fills and its
 * `placeholders[].name` the slot, and the endpoint phrase's slot is read the same way rather
 * than assumed to be `parameter` — SP_TTE_ENDPOINT's is `event`.
 *
 * It writes `spec.phraseInstances` directly rather than routing through `setDimensionBinding`
 * because that writer also overwrites `dimensionValues[dimension]` with the graph concept's
 * label, which is precisely what a backfill must never do: the saved label is the authority
 * here, and Steps 6 and 8 already execute from it.
 *
 * `ensureUnresolvedConcepts` runs first and unconditionally — the early-return below covers
 * only the derivation, and a spec that already has `phraseInstances` still needs its
 * synthesised concepts re-added to the freshly rebuilt graph.
 *
 * @param {object} spec   endpointSpecs[epId]
 * @param {object} graph
 * @param {object} lib    adapted library
 */
export function backfillPhraseInstances(spec, graph, lib) {
  ensureUnresolvedConcepts(spec, graph, lib);
  if (Array.isArray(spec.phraseInstances)) return;

  const instances = [];
  const dims = spec.dimensionValues || {};
  const routes = dimensionRoutes(lib);

  if (spec.selectedEndpointPhrase) {
    const slot = slotOfPhrase(lib, spec.selectedEndpointPhrase);
    const label = dims[LEGACY_ENDPOINT_DIMENSION];
    const route = routes.find((r) => r.dimension === LEGACY_ENDPOINT_DIMENSION);
    const bindings = {};
    if (slot && label && route) {
      const id = resolveLabelToConceptId(graph, route.source, label)
        || addUnresolvedConcept(graph, route.source, label);
      bindings[slot] = { concept: id };
    }
    instances.push({ phrase: spec.selectedEndpointPhrase, bindings });
  }

  const selected = new Set(spec.selectedDimPhrases || []);
  for (const entry of routes) {
    if (!selected.has(entry.phrase)) continue;
    const label = dims[entry.dimension];
    if (!label) continue;
    const id = resolveLabelToConceptId(graph, entry.source, label)
      || addUnresolvedConcept(graph, entry.source, label);
    instances.push({
      phrase: entry.phrase,
      bindings: { [entry.slot]: { concept: id } }
    });
  }

  spec.phraseInstances = instances;
}
