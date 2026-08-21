/**
 * Assembles the smartphrase engine's evaluation context from app state, and converts a saved
 * endpoint spec into the instance shape the engine consumes.
 *
 * The engine takes its library and its concept graph as parameters, so this module is the
 * single place the app's data is married to them. Everything here is pure except
 * `getSmartphraseContext`, which caches per study.
 */

import { adaptV06Library } from "./smartphrase-lib-adapter.js";
import { buildConceptGraph } from "./smartphrase-graph.js";
import { ensureUnresolvedConcepts, backfillPhraseInstances } from "./phrase-bindings.js";
import SPEngine from "./smartphrase-engine.js";
import { resolveCandidates, deriveSlots } from "./phrase-slots.js";

/**
 * Build the adapted library, the concept graph, and the engine context.
 *
 * `categories` is the concept-category map (`concept_categories.json`'s `categories` object).
 * It is carried on the context rather than read from app state so the authoring surface can
 * stay pure: resolving a library dimension to the endpoint's concrete `dimensionCategoryPicks`
 * choice needs category membership, and nothing else in the library carries it. Omitting it
 * degrades to using the library's own dimension name, which is what happens when no pick has
 * been made anyway.
 *
 * @param {object} study    parsed study from parseUSDM()
 * @param {object} v06      the raw ACDC_Transformation_Library_v06.json
 * @param {object} methods  { [oid]: method JSON }
 * @param {object} categories  appState.conceptCategories?.categories
 * @returns {{lib: object, graph: object, ctx: object, categories: object}}
 */
export function buildSmartphraseContext(study, v06, methods = {}, categories = {}) {
  const lib = adaptV06Library(v06, methods);
  const graph = buildConceptGraph(study, lib, methods);
  /* `proposed` is null: the demo's proposed-overlay entities are not part of this app's
     library, and the ES-module engine has no global fallback for them. */
  const ctx = SPEngine.ctxOf(lib, graph, null, null);
  return { lib, graph, ctx, categories: categories || {} };
}

/**
 * Bring a saved spec up to date with the freshly-built graph.
 *
 * Rehydration must happen before anything resolves: the graph is rebuilt from USDM on every
 * study load and has never heard of a saved `UNRESOLVED.*` concept, so `ensureUnresolvedConcepts`
 * re-adds the synthesised concepts a saved binding refers to before that binding is used.
 *
 * `backfillPhraseInstances` happens to call `ensureUnresolvedConcepts` itself as its own first
 * line today, so the explicit call here is not load-bearing — it is defensive insurance against
 * relying on an internal of a module this call does not own, and it is idempotent, so the
 * redundancy costs nothing. `backfillPhraseInstances` then no-ops for specs that already have
 * `phraseInstances`, and derives them for older saves.
 *
 * @param {object} spec     endpointSpecs[epId]
 * @param {{graph: object}} context
 * @param {object} lib
 */
export function prepareSpec(spec, context, lib) {
  ensureUnresolvedConcepts(spec, context.graph, lib);
  backfillPhraseInstances(spec, context.graph, lib);
}

/** The analysis record Step 4 reads, built the same way endpoint-spec.js:653-665 builds it. */
function analysisRecordFor(oid, lib) {
  const t = (lib.transformations || []).find((x) => x.conceptId === oid);
  return {
    transformationOid: oid,
    resolvedBindings: t
      ? JSON.parse(JSON.stringify((t.bindings || []).filter((b) => b.direction !== "output")))
      : null,
    activeInteractions: [],
    estimandSummaryPattern: null
  };
}

/** Mirror the first analysis onto the legacy top-level fields, as syncLegacyTransformationOid does. */
function mirrorLegacyFields(spec) {
  const first = (spec.selectedAnalyses || [])[0] || null;
  spec.selectedTransformationOid = first ? first.transformationOid : null;
  spec.resolvedBindings = first ? first.resolvedBindings : null;
  spec.activeInteractions = first ? first.activeInteractions || [] : [];
  spec.estimandSummaryPattern = first ? first.estimandSummaryPattern : null;
}

/**
 * Re-derive what the current phrase set means, and seed the analysis when it is unambiguous.
 *
 * Step 4 renders its analysis cards from `selectedAnalyses` (endpoint-how.js:76) and derives
 * the legacy `selectedTransformationOid` from that array (endpoint-spec.js:1036), so seeding
 * writes both — writing only the legacy field is invisible to Step 4 and is reset by the next
 * sync.
 *
 * **Ownership rule.** This function owns exactly the one analysis entry it seeded, identified
 * by `spec.phraseSeededOid`; every other entry in `selectedAnalyses` belongs to Step 4 and is
 * never touched. Step 4 is genuinely multi-select (endpoint-how.js:522-536 pushes and splices
 * entries and renders a card each), so replacing the array — as this function used to — deleted
 * an author's sensitivity analysis and every hand edit on it, silently and with no undo.
 *
 * That provenance mark is also what makes withdrawal safe. Deleting the method phrase is
 * precisely how an author says "I no longer mean ANCOVA", so the entry the prose put there is
 * withdrawn as soon as the prose stops naming exactly one analysis — while a pick the author
 * made in Step 4 carries no mark and survives, which was the reason the earlier, narrower
 * clearing rule existed at all.
 *
 * @param {object} spec  endpointSpecs[epId]
 * @param {object} lib   adapted library
 * @returns {{candidates: Array, required: Array, pending: Array}}
 */
export function applyPhraseChange(spec, lib) {
  const oids = (spec.phraseInstances || []).map((p) => p.phrase);
  const candidates = resolveCandidates(oids, lib);
  const slots = deriveSlots(candidates, lib);
  if (!Array.isArray(spec.selectedAnalyses)) spec.selectedAnalyses = [];
  const seeded = spec.phraseSeededOid || null;

  if (candidates.length === 1) {
    const only = candidates[0].conceptId;
    const at = spec.selectedAnalyses.findIndex((a) => a.transformationOid === only);
    /* Already present — from an earlier seed or from Step 4 — so leave it exactly as it is.
       Re-running on an unchanged sentence must not discard bindings edited since. */
    if (at === -1) {
      const wasAt = seeded
        ? spec.selectedAnalyses.findIndex((a) => a.transformationOid === seeded) : -1;
      /* Replace what we seeded before; otherwise take index 0 without displacing anything. */
      if (wasAt >= 0) spec.selectedAnalyses[wasAt] = analysisRecordFor(only, lib);
      else spec.selectedAnalyses.unshift(analysisRecordFor(only, lib));
    }
    spec.phraseSeededOid = only;
  } else {
    /* The sentence no longer names one analysis, so withdraw the one it put there — and only
       that one. A pick the author made in Step 4 carries no provenance mark and survives. */
    if (seeded) {
      spec.selectedAnalyses = spec.selectedAnalyses
        .filter((a) => a.transformationOid !== seeded);
    }
    spec.phraseSeededOid = null;
  }

  mirrorLegacyFields(spec);
  return { candidates, required: slots.required, pending: slots.pending };
}

/** "Primary Endpoint" -> "the primary analysis". Falls back to a neutral phrase. */
function sentenceRoleFor(ep) {
  const level = String((ep && ep.level) || "").toLowerCase();
  if (level.includes("primary")) return "the primary analysis";
  if (level.includes("secondary")) return "a secondary analysis";
  if (level.includes("exploratory") || level.includes("tertiary")) return "an exploratory analysis";
  return "an analysis";
}

/* How the document reads each kind of slot. The saved spec stores what is bound; this decides
   how it renders. Bindings that already carry a `render` are left alone — an author's explicit
   choice wins. Without this, the engine's `name_with_label` default duplicates any concept
   whose name and label coincide: "at Week 24 (Week 24)". */
const RENDER_BY_SLOT = { parameter: "label", visit: "label", event: "label", population: "name" };

/**
 * Apply the document's render policy to a phrase instance's bindings, without mutating the
 * saved spec. Only bindings that lack a `render` are given one, keyed on the slot name.
 *
 * @param {object} phrase  one entry of spec.phraseInstances
 * @returns {object} a new phrase-instance object with new binding objects
 */
function withRenderPolicy(phrase) {
  const bindings = {};
  for (const [slot, binding] of Object.entries(phrase.bindings || {})) {
    if (binding && binding.render === undefined && RENDER_BY_SLOT[slot]) {
      bindings[slot] = { ...binding, render: RENDER_BY_SLOT[slot] };
    } else {
      bindings[slot] = binding;
    }
  }
  return { ...phrase, bindings };
}

/**
 * Convert a saved spec into the instance the engine resolves.
 *
 * The template is the spec's chosen transformation. When the phrase set has not narrowed to
 * one, `selectedTransformationOid` is null and the caller supplies a candidate — the engine
 * needs a template to build a model view, though `resolveInstance` only uses it for role order.
 *
 * The saved spec records what is bound; how each slot renders is this document's decision
 * (see `RENDER_BY_SLOT`), applied here rather than stored, so the spec itself stays untouched.
 *
 * @param {object} spec  endpointSpecs[epId]
 * @param {object} ep    endpoint from getAllEndpoints()
 * @param {object} lib   adapted library
 * @returns {object|null} null when the spec carries no phrase instances
 */
export function specToInstance(spec, ep, lib) {
  if (!spec || !Array.isArray(spec.phraseInstances) || !spec.phraseInstances.length) return null;
  return {
    id: (ep && ep.id) || "instance",
    template: spec.selectedTransformationOid || null,
    sentenceRole: sentenceRoleFor(ep),
    phrases: spec.phraseInstances.map(withRenderPolicy)
  };
}

/* ---------------------------------------------------------------- cached accessor */

let cache = { key: null, value: null };

/**
 * The context for the currently-selected study, built once and reused.
 *
 * Keyed on `selectedStudyIndex`, so switching study rebuilds. Returns null before a study is
 * chosen or before the library has loaded.
 *
 * @param {object} appState
 * @returns {{lib: object, graph: object, ctx: object}|null}
 */
export function getSmartphraseContext(appState) {
  if (!appState || !appState.selectedStudy || !appState.transformationLibrary) return null;
  const methods = appState.methodsCache || {};
  /* Methods load lazily (data-loader.js:loadMethod), so a context built before they arrive
     resolves no method references. Keying on the count as well as the study means the context
     is rebuilt as they land, instead of freezing an empty method table for the session. */
  const key = `${appState.selectedStudyIndex}:${Object.keys(methods).length}`;
  if (cache.key === key && cache.value) return cache.value;
  /* conceptCategories is assigned in the same block of data-loader.js that assigns
     transformationLibrary, so it is never missing once the guard above has passed. */
  cache = { key, value: buildSmartphraseContext(
    appState.selectedStudy, appState.transformationLibrary, methods,
    (appState.conceptCategories && appState.conceptCategories.categories) || {}) };
  return cache.value;
}

/** Drop the cache. Call when the study or the library changes underneath. */
export function resetSmartphraseContext() {
  cache = { key: null, value: null };
}
