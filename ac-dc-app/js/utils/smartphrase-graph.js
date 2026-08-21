/**
 * Builds `ctx.graph` for the ported smartphrase engine from a parsed USDM study.
 *
 * The engine resolves a phrase binding by looking up `ctx.graph.concepts[id]`. What may be
 * bound is not a decision this module makes: each transformation's `sliceKeys[].source`
 * declares where that dimension's values come from, and this module populates exactly those
 * sources. Adding a transformation with a new source is the only thing that should widen the
 * graph — see spec §7.1.
 *
 * Concepts are keyed by USDM identifier, never by label, so a binding survives a rename or a
 * re-parse of the study (spec §7.3).
 *
 * Each concept carries `kind` AND `conceptCategory`. The engine matches a sliceKey with
 *   bc.c.conceptCategory === sk.dimension || bc.c.kind === sk.dimension
 * — an OR — so carrying both satisfies v06's concrete vocabulary (Parameter, AnalysisVisit,
 * Population) and its category vocabulary (ParameterDimension, VisitDimension) at once. No
 * mapping layer is needed.
 *
 * NOT built here: the four-tier data trace. `traceTemplates` is always {} and no concept
 * carries a `data` map. `buildTrace` is the only engine function that reads either, and the
 * trace is deferred pending the PARAMCD decision — spec §7.6.
 */

const PREFIXES = {
  usdm: "https://ddf.cdisc.org/usdm/v4/",
  acdc: "https://w3id.org/cdisc/ac-dc/"
};

/**
 * Every `source` any transformation declares on a sliceKey.
 * @param {object} lib  adapted library (transformations[] carry sliceKeys)
 * @returns {Set<string>}
 */
export function collectDeclaredSources(lib) {
  const out = new Set();
  for (const t of lib.transformations || []) {
    for (const sk of t.sliceKeys || []) {
      if (sk.source) out.add(sk.source);
    }
  }
  return out;
}

/* The vocabulary each source contributes. Single source of truth: the builders below spread it,
   and `addUnresolvedConcept` spreads the same entry, so a synthesised concept matches sliceKeys
   exactly as an anchored one does. */
const SOURCE_VOCABULARY = {
  biomedicalConcept: { kind: "Parameter", conceptCategory: "ParameterDimension" },
  visit: { kind: "AnalysisVisit", conceptCategory: "VisitDimension" },
  population: { kind: "Population" }
};

/* One builder per declared source. Keyed by the source name the library uses. */
const BUILDERS = {
  biomedicalConcept(study, concepts) {
    for (const bc of study.biomedicalConcepts || []) {
      concepts["P." + bc.id] = {
        ...SOURCE_VOCABULARY.biomedicalConcept,
        label: bc.label || bc.name,
        name: bc.name || bc.label,
        iri: "usdm:BiomedicalConcept/" + bc.id,
        anchored: true,
        source: "biomedicalConcept"
      };
    }
  },

  visit(study, concepts) {
    for (const enc of study.encounters || []) {
      concepts["V." + enc.id] = {
        ...SOURCE_VOCABULARY.visit,
        label: enc.label || enc.name,
        /* The encounter's description is timing (e.g., "Day 168"), not a display name.
           Using it for `name` would render "at Day 168 (Week 24)" in sentences. */
        name: enc.label || enc.name,
        iri: "usdm:Encounter/" + enc.id,
        anchored: true,
        source: "visit"
      };
    }
  },

  /* Analysis populations first, then the study-design population. A study may declare no
     analysis populations at all (NCT01797120 declares zero), so the design population is not
     a fallback of last resort — it is a legitimate member of the set. */
  population(study, concepts) {
    const add = (p, isAnalysis) => {
      concepts["POP." + p.id] = {
        ...SOURCE_VOCABULARY.population,
        label: p.label || p.name,
        name: p.text || p.description || p.label || p.name,
        iri: (isAnalysis ? "usdm:AnalysisPopulation/" : "usdm:StudyDesignPopulation/") + p.id,
        anchored: true,
        source: "population"
      };
    };
    for (const p of study.analysisPopulations || []) add(p, true);
    for (const p of study.populations || []) add(p, false);
  }
};

/**
 * Ground the methods the engine may render.
 *
 * The engine renders a method as `grounding.name || def.name.toLowerCase()` — it lower-cases the
 * library's name ONLY when the grounding supplies none. Supplying `name` here therefore suppresses
 * that `toLowerCase()` fallback for EVERY method, not just the ones anyone has looked at. That is
 * deliberate: none of the 39 files in `lib/methods/analyses` carries a `label` at all, so `label`
 * below falls through to `name` — a Title-Case string that is often an acronym or a proper noun,
 * and v06 method JSON has no expanded prose form to lower-case safely. Lower-casing would render
 * "using ancova" and "using cochran-mantel-haenszel test"; mangling an acronym is worse than a
 * method name reading slightly formally mid-sentence.
 *
 * The consequence, stated plainly so nobody rediscovers it as a bug: rendered sentences carry
 * Title-Case method names ("using Mixed Model for Repeated Measures"). Getting genuinely
 * lower-caseable prose would mean adding an expanded prose name to the method library itself,
 * which is a later question and not one this module can answer.
 *
 * `label` here duplicates what `adaptV06Method` already computes from the same fields; the
 * grounding's one genuinely new contribution is the `iri`.
 *
 * @param {object} methods  { [oid]: method JSON, schema 0.8.0 }
 * @returns {object} { [oid]: { label, name, iri } }
 */
export function buildMethodGrounding(methods) {
  const out = {};
  for (const [oid, m] of Object.entries(methods || {})) {
    out[oid] = {
      label: m.label || m.name,
      name: m.name,
      iri: "acdc:method/" + oid
    };
  }
  return out;
}

/**
 * Build the graph. Does not mutate `study`.
 *
 * @param {object} study    parsed study from parseUSDM()
 * @param {object} lib      adapted library from adaptV06Library()
 * @param {object} methods  optional { [oid]: method JSON, schema 0.8.0 }
 * @returns {object} ctx.graph
 */
export function buildConceptGraph(study, lib, methods = {}) {
  const concepts = {};
  for (const source of collectDeclaredSources(lib)) {
    const build = BUILDERS[source];
    if (build) { build(study, concepts); continue; }
    /* An undeclared builder is not an error here: the library may name a source this phase
       does not yet populate. The slot for it simply has no options, which surfaces in the UI
       as an unbindable slot rather than as a crash.
       It is also, however, the only place a typo in a `sliceKeys[].source` goes undetected —
       a misspelt source is indistinguishable from an unimplemented one — so it warns. */
    console.warn(
      `buildConceptGraph: no builder for declared sliceKey source "${source}" — ` +
      `slots on that dimension will have no options. Unimplemented source, or a typo in ` +
      `the library's sliceKeys[].source?`);
  }

  return {
    prefixes: { ...PREFIXES },
    /* `study` and `instances` are carried for fidelity with the reference graph shape the
       smartphrase library ships; the engine reads neither. */
    study: { studyId: study.name || "", title: study.description || study.name || "" },
    concepts,
    methodGrounding: buildMethodGrounding(methods),
    instances: [],
    traceTemplates: {}
  };
}

function slug(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * A short, deterministic discriminator for a label.
 *
 * `slug()` is lossy — "Weight (cm)" and "Weight cm" both reduce to "weight-cm" — so two distinct
 * labels can claim one id, and the presence guard in `addUnresolvedConcept` would then hand the
 * second caller the FIRST label's concept. This suffix separates them. FNV-1a over the raw label,
 * base36: the same label always yields the same suffix, so ids stay stable across sessions.
 *
 * @param {string} label
 * @returns {string}
 */
function labelDiscriminator(label) {
  let h = 0x811c9dc5;
  const s = String(label);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Add a concept for a fixture whose declared source has not been satisfied — a typed label
 * with no USDM object behind it (spec §7.4). It matches sliceKeys exactly as an anchored
 * concept does, so the sentence renders and the cube still slices; `anchored: false` is what
 * lets the UI say the fixture is unresolved.
 *
 * Idempotent: the same source and label always yield the same id.
 *
 * Distinct labels never share an id. `slug()` alone cannot promise that — "Weight (cm)" and
 * "Weight cm" both slug to "weight-cm" — so when the slug is already taken by a DIFFERENT label,
 * the newcomer gets a deterministic suffix instead of silently inheriting the incumbent's concept.
 *
 * @param {object} graph   graph to add to (mutated — the caller owns it)
 * @param {string} source  a declared sliceKey source
 * @param {string} label   the typed label
 * @returns {string} the concept id
 */
export function addUnresolvedConcept(graph, source, label) {
  const base = `UNRESOLVED.${source}.${slug(label)}`;
  const incumbent = graph.concepts[base];
  const id = incumbent && incumbent.label !== label
    ? `${base}-${labelDiscriminator(label)}`
    : base;
  if (!graph.concepts[id]) {
    graph.concepts[id] = {
      ...(SOURCE_VOCABULARY[source] || {}),
      label: label,
      name: label,
      anchored: false,
      source: source
    };
  }
  return id;
}
