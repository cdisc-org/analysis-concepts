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

/* One builder per declared source. Keyed by the source name the library uses. */
const BUILDERS = {
  biomedicalConcept(study, concepts) {
    for (const bc of study.biomedicalConcepts || []) {
      concepts["P." + bc.id] = {
        kind: "Parameter",
        conceptCategory: "ParameterDimension",
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
        kind: "AnalysisVisit",
        conceptCategory: "VisitDimension",
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
        kind: "Population",
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
 * Ground the methods the engine may render. The engine reads `label`, `name` and `formula`
 * off a method; `name` is lower-cased for prose ("analysis of covariance"), so the display
 * name comes from the method's own `name` and the short form from `label` where present.
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
    if (build) build(study, concepts);
    /* An undeclared builder is not an error here: the library may name a source this phase
       does not yet populate. The slot for it simply has no options, which surfaces in the UI
       as an unbindable slot rather than as a crash. */
  }

  return {
    prefixes: { ...PREFIXES },
    study: { studyId: study.name || "", title: study.description || study.name || "" },
    concepts,
    methodGrounding: buildMethodGrounding(methods),
    instances: [],
    traceTemplates: {}
  };
}

/* The vocabulary each source contributes, reused when synthesising an unresolved concept
   so it matches sliceKeys exactly as an anchored one would. */
const SOURCE_VOCABULARY = {
  biomedicalConcept: { kind: "Parameter", conceptCategory: "ParameterDimension" },
  visit: { kind: "AnalysisVisit", conceptCategory: "VisitDimension" },
  population: { kind: "Population" }
};

function slug(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Add a concept for a fixture whose declared source has not been satisfied — a typed label
 * with no USDM object behind it (spec §7.4). It matches sliceKeys exactly as an anchored
 * concept does, so the sentence renders and the cube still slices; `anchored: false` is what
 * lets the UI say the fixture is unresolved.
 *
 * Idempotent: the same source and label always yield the same id.
 *
 * @param {object} graph   graph to add to (mutated — the caller owns it)
 * @param {string} source  a declared sliceKey source
 * @param {string} label   the typed label
 * @returns {string} the concept id
 */
export function addUnresolvedConcept(graph, source, label) {
  const id = `UNRESOLVED.${source}.${slug(label)}`;
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
