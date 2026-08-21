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
    const slot = (rp.bindings && rp.bindings[0] && rp.bindings[0].placeholder) || "";
    const label = first ? rp.text.charAt(0).toUpperCase() + rp.text.slice(1) : rp.text;
    first = false;
    const broken = (rp.errors || []).length ? " sp-unresolved" : "";
    return `<span class="phrase-chip${broken}" data-role="${esc(rp.role)}" ` +
      `data-phrase="${esc(rp.oid)}" data-slot="${esc(slot)}" data-ep-id="${esc(epId)}" ` +
      `title="${esc(rp.template || rp.oid)}">${esc(label)}</span>`;
  }).join("");

  const errs = res.errors.length
    ? `<div class="sp-errors">${res.errors.map((e) => esc(e)).join("<br>")}</div>`
    : "";

  return `<p class="sp-sentence">${body}</p>${errs}`;
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
  const chosen = spec.selectedTransformationOid || null;
  const chosenIsCandidate = chosen && candidates.some((c) => c.conceptId === chosen);

  let seeded;
  if (chosen && chosenIsCandidate) {
    seeded = `<span class="sp-seed-one">${esc(chosen)}</span>`;
  } else if (chosen) {
    seeded = `<span class="sp-seed-stale">${esc(chosen)} &mdash; no longer matches the sentence</span>`;
  } else if (candidates.length === 1) {
    seeded = `<span class="sp-seed-one">${esc(candidates[0].conceptId)}</span>`;
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
    `data-dimension="${esc(dimension || "")}">
    <label class="sp-slot-label">${esc(slot)} <span class="sp-slot-source">from ${esc(source || "—")}</span></label>
    <select class="sp-slot-select">${options}</select>
  </div>`;
}
