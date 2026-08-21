/**
 * The single writer for phrase bindings.
 *
 * A binding persists a USDM concept id (spec §7.3) while `dimensionValues` persists a label
 * string, and Steps 6 and 8 execute from the latter. The two must never drift, so exactly one
 * function writes either of them — Step 3's dropdown resolves its label to an id and calls the
 * same helper Step 7's picker calls (spec §11.3).
 */
import { addUnresolvedConcept } from "./smartphrase-graph.js";

/**
 * Find the concept a label refers to, within one declared source.
 *
 * Returns null when zero or more than one concept matches. An ambiguous label is left
 * unresolved rather than guessed — a wrong anchor is worse than an absent one.
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
  return hits.length === 1 ? hits[0] : null;
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
 * @throws {Error} if conceptId is not in graph.concepts
 */
export function setDimensionBinding(spec, graph, phraseOid, slot, dimension, conceptId) {
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
  instance.bindings[slot] = { concept: conceptId };

  spec.dimensionValues[dimension] = concept.label;
}

/* Which phrase slot and dimensionValues key each source pairs with, for the backfill. */
const BACKFILL_SLOTS = [
  { phrase: "SP_TIMEPOINT", slot: "visit", dimension: "AnalysisVisit", source: "visit" },
  { phrase: "SP_POPULATION", slot: "population", dimension: "Population", source: "population" },
  { phrase: "SP_PARAMETER", slot: "parameter", dimension: "Parameter", source: "biomedicalConcept" }
];

/**
 * Derive `phraseInstances` for a spec saved before this field existed.
 *
 * Reads the fields older saves do carry — `selectedEndpointPhrase`, `selectedDimPhrases` and
 * `dimensionValues` — and resolves each label back to a concept id. A label that does not
 * resolve is given an unresolved concept via `addUnresolvedConcept` rather than a bare value,
 * so the binding still carries a `.concept` — the only shape the engine's `boundConcepts`
 * recognises — and the fixture still slices the cube while the UI can flag it as unanchored.
 *
 * No-op when `phraseInstances` already exists, so it is safe to call on every load.
 *
 * @param {object} spec   endpointSpecs[epId]
 * @param {object} graph
 */
export function backfillPhraseInstances(spec, graph) {
  if (Array.isArray(spec.phraseInstances)) return;

  const instances = [];
  const dims = spec.dimensionValues || {};

  if (spec.selectedEndpointPhrase) {
    const paramLabel = dims.Parameter;
    const bindings = {};
    if (paramLabel) {
      const id = resolveLabelToConceptId(graph, "biomedicalConcept", paramLabel)
        || addUnresolvedConcept(graph, "biomedicalConcept", paramLabel);
      bindings.parameter = { concept: id };
    }
    instances.push({ phrase: spec.selectedEndpointPhrase, bindings });
  }

  const selected = new Set(spec.selectedDimPhrases || []);
  for (const entry of BACKFILL_SLOTS) {
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
