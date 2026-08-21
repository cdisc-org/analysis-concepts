/**
 * The Step 7 authoring surface.
 *
 * Every function here is pure: it takes state and returns an HTML string, with no DOM API and
 * no reads of module-level app state. That is what lets `scripts/verify_esap_authoring.mjs`
 * assert on the markup under Node with no jsdom and no test framework. The event wiring that
 * makes the markup interactive lives in esap-builder.js, keyed off the data- attributes below.
 *
 * Data attributes are the contract between this file and that wiring:
 *   data-ep-id      the endpoint whose spec a control edits
 *   data-phrase     the smartphrase oid
 *   data-slot       the placeholder name within that phrase
 *   data-add-phrase / data-start-authoring   actions rather than edits
 *   data-remove-phrase   drops that phrase from the sentence
 */

import SPEngine from "../utils/smartphrase-engine.js";
import { specToInstance, prepareSpec } from "../utils/smartphrase-context.js";
import { resolveCandidates } from "../utils/phrase-slots.js";

/** Minimal HTML escape for text interpolated into markup. */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The authored sentence: frame text as plain prose, each phrase as a clickable chip.
 *
 * The engine returns `parts` already ordered by the language's sentence template, so this walks
 * them rather than composing word order itself.
 *
 * @param {object} ctx       engine context
 * @param {object} instance  from specToInstance()
 * @param {string} epId
 * @returns {string} HTML
 */
export function renderAuthoredSentenceHtml(ctx, instance, epId) {
  if (!instance) return "";
  const res = SPEngine.resolveInstance(ctx, instance, "en");
  let first = true;

  const body = res.parts.map((part) => {
    if (part.type === "text") {
      const text = first && part.text.trim()
        ? part.text.charAt(0).toUpperCase() + part.text.slice(1)
        : part.text;
      if (part.text.trim()) first = false;
      return part.frame
        ? `<span class="frame-text">${esc(text)}</span>`
        : esc(text);
    }
    const rp = part.phrase;
    const def = SPEngine.phraseDef(ctx, rp.oid);
    /* The slot comes from the phrase DEFINITION, not from resolved bindings: the engine only
       pushes into `bindings[]` once a placeholder resolves, so a phrase that was just added has
       none — and it is exactly that phrase the author needs to click in order to bind it.
       Taking the slot from `bindings[0]` rendered `data-slot=""` and left the chip inert, with
       no other route to a binding. The resolved binding stays as a fallback for a phrase whose
       definition declares no placeholder. */
    const slot = (def && def.placeholders && def.placeholders[0] && def.placeholders[0].name) ||
      (rp.bindings && rp.bindings[0] && rp.bindings[0].placeholder) || "";
    const label = first ? rp.text.charAt(0).toUpperCase() + rp.text.slice(1) : rp.text;
    first = false;
    /* Spec §7.4 wants the fixture shown as unresolved against its declared source, and engine
       errors do not say that: an `UNRESOLVED.*` concept resolves perfectly cleanly — it is a
       real graph concept, distinguished only by `anchored: false` — so the unanchored parameter
       rendered identically to the anchored visit. The graph is already on the engine context
       (`ctxOf` returns it), so this needs no extra parameter to read it.

       A resolved binding is not shaped like a saved one: it carries
       `{placeholder, text, detail: {kind, id, render}}`, so the concept id is `detail.id` and
       not `concept`. */
    const concepts = (ctx && ctx.graph && ctx.graph.concepts) || {};
    const unanchored = (rp.bindings || []).some((b) => {
      const d = b && b.detail;
      const c = d && d.kind === "concept" && d.id && concepts[d.id];
      return !!c && c.anchored === false;
    });
    const broken = ((rp.errors || []).length || unanchored) ? " sp-unresolved" : "";
    /* Every phrase but the endpoint one may be removed. The endpoint phrase is what makes the
       sentence an analysis at all, and removePhraseFromSpec refuses to drop the last one, so
       rendering a control for it would offer an action that silently does nothing. */
    const removeBtn = rp.role === "endpoint" ? "" :
      `<span class="phrase-remove" data-remove-phrase="${esc(rp.oid)}" ` +
      `data-ep-id="${esc(epId)}" role="button" tabindex="0" ` +
      `title="Remove this phrase">×</span>`;
    return `<span class="phrase-chip${broken}" data-role="${esc(rp.role)}" ` +
      `data-phrase="${esc(rp.oid)}" data-slot="${esc(slot)}" data-ep-id="${esc(epId)}" ` +
      `title="${esc(rp.template || rp.oid)}">${esc(label)}${removeBtn}</span>`;
  }).join("");

  const errs = res.errors.length
    ? `<div class="sp-errors">${res.errors.map((e) => esc(e)).join("<br>")}</div>`
    : "";

  return `<p class="sp-sentence">${body}</p>${errs}`;
}

/**
 * Whether a resolved candidate is something Step 4 can hold.
 *
 * The library types every transformation as exactly `"analysis"` or `"derivation"`, and only an
 * analysis is ever seeded (applyPhraseChange uses the same discriminator). A derivation among
 * the candidates is a real match for the sentence — it is simply Step 6's business, not Step 4's.
 */
function isAnalysisCandidate(c) {
  return !!c && c.transformationType === "analysis";
}

/**
 * The whole §4.1.2 body for one endpoint: the sentence, what it seeds, and the add control.
 *
 * @param {{lib: object, graph: object, ctx: object}} context
 * @param {object} spec  endpointSpecs[epId] (may be empty)
 * @param {object} ep    endpoint from getAllEndpoints()
 * @returns {string} HTML
 */
export function renderAuthoringSectionHtml(context, spec, ep) {
  prepareSpec(spec, context, context.lib);
  const instance = specToInstance(spec, ep, context.lib);

  if (!instance) {
    return `<div class="sp-authoring sp-empty">
      <p class="sp-prompt">No analysis written yet for ${esc(ep.label || ep.id)}.</p>
      <button class="btn btn-sm btn-primary" data-start-authoring data-ep-id="${esc(ep.id)}">
        Write the analysis
      </button>
    </div>`;
  }

  const oids = instance.phrases.map((p) => p.phrase);
  const candidates = resolveCandidates(oids, context.lib);

  /* What the sentence resolves to. A chosen transformation wins over a recomputed candidate
     list: spec §11.1 allows the choice to come from Step 4, so a spec that already carries one
     is resolved, not open. The fourth case matters most — if the author has since edited the
     sentence so the chosen analysis no longer matches, saying so is the whole point of showing
     this line at all. */
  /* The flagged record is the one the SENTENCE put there, and it is what this line reports on.
     `selectedTransformationOid` mirrors selectedAnalyses[0], which by design belongs to the
     author's own Step 4 choice when they have made one — so with [author ANCOVA, seeded MMRM]
     the legacy field says ANCOVA while the sentence unambiguously names MMRM. Reporting the
     mirror there named the wrong analysis. The state is right; only the report was wrong, so
     this reads past the mirror rather than changing it. */
  const seededRecord = (spec.selectedAnalyses || []).find((a) => a.seededByPhrase);
  const chosen = (seededRecord && seededRecord.transformationOid) ||
    spec.selectedTransformationOid || null;
  const chosenIsCandidate = chosen && candidates.some((c) => c.conceptId === chosen);

  let seeded;
  if (chosen && chosenIsCandidate) {
    seeded = `<span class="sp-seed-one">${esc(chosen)}</span>`;
  } else if (chosen) {
    seeded = `<span class="sp-seed-stale">${esc(chosen)} &mdash; no longer matches the sentence</span>`;
  } else if (candidates.length === 1 && isAnalysisCandidate(candidates[0])) {
    seeded = `<span class="sp-seed-one">${esc(candidates[0].conceptId)}</span>`;
  } else if (candidates.length === 1) {
    /* A single candidate that is a DERIVATION seeds nothing — saying "Seeds into Step 4" here
       asserted something false, and on a surface whose whole value is that the SAP prose can be
       trusted, a label that overstates the state is a defect in its own right. */
    seeded = `<span class="sp-seed-none">no analysis yet &mdash; ` +
      `${esc(candidates[0].conceptId)} is a derivation, specified in Step 6</span>`;
  } else if (candidates.length) {
    seeded = `<span class="sp-seed-many">${candidates.length} candidates: ` +
      `${candidates.map((c) => esc(c.conceptId)).join(", ")}</span>`;
  } else {
    seeded = `<span class="sp-seed-none">no matching transformation</span>`;
  }

  const pipeline = Array.isArray(spec.derivationChain) && spec.derivationChain.length
    ? `<span class="sp-pipeline-done">derivations specified (${spec.derivationChain.length})</span>`
    : `<span class="sp-pipeline-pending">derivations not yet specified &mdash; see Step 6</span>`;

  return `<div class="sp-authoring" data-ep-id="${esc(ep.id)}">
    ${renderAuthoredSentenceHtml(context.ctx, instance, ep.id)}
    <div class="sp-meta">
      <span class="sp-meta-label">Seeds into Step 4:</span> ${seeded}
      <span class="sp-meta-sep">&middot;</span> ${pipeline}
    </div>
    <button class="btn btn-sm btn-secondary" data-add-phrase data-ep-id="${esc(ep.id)}">
      + add phrase
    </button>
  </div>`;
}

/**
 * The dimension key this slot writes.
 *
 * The library's sliceKeys name one member of a concept category (`AnalysisVisit`); the
 * endpoint's `dimensionCategoryPicks` names which member of that category the rest of the app
 * reads, and endpoint-how.js renames the `dimensionValues` key when that pick changes. Writing
 * the library's name regardless would create a second key that Steps 6 and 8 never read — the
 * prose would say Week 12 while the run used Week 24.
 *
 * Resolution is by category MEMBERSHIP, not by name. The `${dimension}Dimension` convention
 * holds for only one of the three dimensions the library declares: `Parameter` sits in
 * `ParameterDimension`, but `AnalysisVisit` sits in `VisitDimension` (there is no
 * `AnalysisVisitDimension`) and `Population` sits in no category at all — and `AnalysisVisit`
 * is precisely the case this fix exists for.
 *
 * With no categories map, no owning category, or no pick recorded, the library's own name
 * stands: that is today's behaviour, and it is right when no pick has been made.
 *
 * @param {object} categories  context.categories — concept_categories.json's `categories`
 * @param {object} spec        endpointSpecs[epId]
 * @param {string} dimension   the sliceKey's dimension name
 * @returns {string}
 */
function concreteDimension(categories, spec, dimension) {
  const picks = (spec && spec.dimensionCategoryPicks) || {};
  for (const [catName, cat] of Object.entries(categories || {})) {
    const owns = ((cat && cat.members) || []).some((m) => m.concept === dimension);
    if (owns && picks[catName]) return picks[catName];
  }
  return dimension;
}

/**
 * The picker for one slot.
 *
 * Which concepts are offered is not a decision made here: the slot belongs to a dimension, the
 * dimension's sliceKey declares its `source`, and the graph tags every concept with the source
 * it came from. So the option list is exactly the concepts of that source (spec §7.1).
 *
 * The currently-bound concept is always offered even when it is unresolved, so an
 * `UNRESOLVED.*` binding stays visible and re-selectable rather than silently disappearing.
 *
 * @returns {string} HTML — a select plus its label
 */
export function renderSlotEditorHtml(context, spec, ep, phraseOid, slot) {
  const def = SPEngine.phraseDef(context.ctx, phraseOid);
  const placeholder = def && (def.placeholders || []).find((p) => p.name === slot);
  if (!placeholder) {
    return `<div class="sp-slot-editor sp-slot-unknown">` +
      `<span class="sp-slot-label">${esc(slot)}</span>` +
      `<span class="sp-slot-note">no such slot on ${esc(phraseOid)}</span></div>`;
  }

  /* The dimension this SLOT is constrained to, and therefore the source its values come from.
     The placeholder's own `concept_constraint` is tried first — it names the SharedDimension
     the slot itself refers to (e.g. SP_CFB_ENDPOINT's "parameter" is constrained to
     "Parameter"). `anchors.produced_concept` describes what the phrase's SENTENCE produces
     (e.g. "Change" for SP_CFB_ENDPOINT), which is a different thing and only coincides with the
     slot's own dimension for single-purpose phrases like SP_TIMEPOINT ("AnalysisVisit") — so it
     is kept only as a fallback for phrases whose placeholder has no concept_constraint. Neither
     name is hardcoded here: both are read off the phrase, and matched against whichever
     dimension a sliceKey actually declares. */
  /* This inline scan duplicates the unexported declaredDimensionSources() in phrase-bindings.js
     — that file is on the do-not-modify list, so importing its internals isn't an option, and
     this is the compliant alternative. It is only safe to duplicate because
     verify_phrase_slots.mjs pins the invariant this logic relies on (no dimension declares two
     different sources anywhere in the library); a future change relaxing that invariant would
     not be caught by anything local to this file. */
  const dimensionCandidates = [placeholder.concept_constraint, def.anchors && def.anchors.produced_concept]
    .filter(Boolean);
  let dimension = null;
  let source = null;
  outer:
  for (const cand of dimensionCandidates) {
    for (const t of context.lib.transformations || []) {
      for (const sk of t.sliceKeys || []) {
        if (sk.dimension === cand) { dimension = cand; source = sk.source; break outer; }
      }
    }
  }

  if (!source) {
    /* The slot's dimension is not one the library declares a sliceKey source for —
       SP_GROUPING's `treatment` and SP_TTE_ENDPOINT's `event` are both in this position under
       v06. There is nothing to offer, so offer nothing rather than an empty <select>: an empty
       picker invites a change event that would write dimensionValues[""] via the empty
       data-dimension, putting a junk key into the object Steps 6 and 8 execute from. */
    return `<div class="sp-slot-editor sp-slot-unbindable" data-ep-id="${esc(ep.id)}" ` +
      `data-phrase="${esc(phraseOid)}" data-slot="${esc(slot)}">` +
      `<span class="sp-slot-label">${esc(slot)}</span>` +
      `<span class="sp-slot-note">no source declared for this dimension &mdash; ` +
      `nothing in the study can bind it yet</span></div>`;
  }

  const current = (spec.phraseInstances || [])
    .find((p) => p.phrase === phraseOid)?.bindings?.[slot]?.concept || "";

  const ids = Object.keys(context.graph.concepts)
    .filter((id) => context.graph.concepts[id].source === source);
  if (current && !ids.includes(current)) ids.unshift(current);

  const options = ids.map((id) => {
    const c = context.graph.concepts[id];
    const flag = c && c.anchored === false ? " (unresolved)" : "";
    return `<option value="${esc(id)}"${id === current ? " selected" : ""}>` +
      `${esc((c && c.label) || id)}${flag}</option>`;
  }).join("");

  return `<div class="sp-slot-editor" data-ep-id="${esc(ep.id)}" ` +
    `data-phrase="${esc(phraseOid)}" data-slot="${esc(slot)}" ` +
    `data-dimension="${esc(dimension ? concreteDimension(context.categories, spec, dimension) : "")}">
    <label class="sp-slot-label">${esc(slot)} <span class="sp-slot-source">from ${esc(source || "—")}</span></label>
    <select class="sp-slot-select">${options}</select>
  </div>`;
}

/**
 * The phrases that may be added next.
 *
 * The library decides, not this file. With nothing written, only endpoint-role phrases can
 * start a sentence. Once an endpoint phrase exists, the offers are the union of what the
 * current candidate transformations declare in `validSmartPhrases`, minus what is already
 * used — so a phrase no candidate can express is never offered.
 */
export function renderAddPhraseHtml(context, spec, ep) {
  const used = new Set((spec.phraseInstances || []).map((p) => p.phrase));
  let offerable;

  if (!used.size) {
    offerable = (context.lib.smartPhrases || [])
      .filter((p) => p.role === "endpoint")
      .map((p) => p.oid);
  } else {
    const candidates = resolveCandidates([...used], context.lib);
    const allowed = new Set();
    for (const c of candidates) {
      const t = (context.lib.transformations || []).find((x) => x.conceptId === c.conceptId);
      for (const oid of (t && t.validSmartPhrases) || []) allowed.add(oid);
    }
    offerable = [...allowed].filter((oid) => !used.has(oid));
  }

  if (!offerable.length) {
    return `<div class="sp-add-list sp-add-empty">Every phrase the analysis allows is present.</div>`;
  }

  const rows = offerable.map((oid) => {
    const def = SPEngine.phraseDef(context.ctx, oid);
    if (!def) return "";
    return `<button class="sp-add-option" data-add-oid="${esc(oid)}" data-ep-id="${esc(ep.id)}">` +
      `<span class="sp-add-role" data-role="${esc(def.role)}">${esc(def.role)}</span> ` +
      `<span class="sp-add-template">${esc(def.phrase_template)}</span></button>`;
  }).join("");

  return `<div class="sp-add-list">${rows}</div>`;
}

/**
 * Add a phrase to the spec, with its method pre-bound when the library names one.
 *
 * A method phrase's `anchors.uses_method` names the method it stands for, so the binding is
 * derivable rather than asked for. Concept slots stay empty — those are the author's to fill.
 *
 * Idempotent: adding a phrase already present does nothing.
 */
export function addPhraseToSpec(spec, context, phraseOid) {
  if (!Array.isArray(spec.phraseInstances)) spec.phraseInstances = [];
  if (spec.phraseInstances.some((p) => p.phrase === phraseOid)) return;

  const def = SPEngine.phraseDef(context.ctx, phraseOid);
  const bindings = {};
  const usesMethod = def && def.anchors && def.anchors.uses_method;
  if (usesMethod) {
    const slot = (def.placeholders || []).find((p) => p.kind === "method_ref");
    if (slot) bindings[slot.name] = { method: usesMethod };
  }
  spec.phraseInstances.push({ phrase: phraseOid, bindings });
}

/**
 * Remove a phrase.
 *
 * The endpoint phrase is what makes the sentence an analysis at all — removing it would leave
 * a spec that resolves to nothing — so it is refused. Everything else is optional.
 */
export function removePhraseFromSpec(spec, phraseOid) {
  if (!Array.isArray(spec.phraseInstances)) return;
  const keep = spec.phraseInstances.filter((p) => p.phrase !== phraseOid);
  const removedEndpoint = spec.phraseInstances.length !== keep.length &&
    !keep.some((p) => /_ENDPOINT$/.test(p.phrase));
  if (removedEndpoint && /_ENDPOINT$/.test(phraseOid)) return;
  spec.phraseInstances = keep;
}
