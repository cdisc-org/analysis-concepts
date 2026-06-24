/*
 * Shared smartphrase resolution helpers (model -> text), used by the hover and trace demos.
 * Mirrors the resolution algorithm in spec/smartphrase-spec.md:
 *   concept-id takes precedence over value; value is the fallback if concept resolution fails.
 * Exposed as window.ACDCRender so it does not collide with a demo's own globals.
 */
window.ACDCRender = (function () {
  "use strict";

  function renderConcept(concepts, conceptId, mode) {
    const c = concepts[conceptId];
    if (!c) return { text: null, error: "unresolved concept-id " + conceptId };
    if (mode === "short") return { text: c.short };
    if (mode === "long") return { text: c.long };
    if (mode === "long_with_short") return { text: c.long + " (" + c.short + ")" };
    return { text: c.short };
  }

  function resolveBinding(concepts, b) {
    if (b.conceptId) {
      const r = renderConcept(concepts, b.conceptId, b.render || "short");
      if (r.text != null) return { text: r.text };
      if (b.value != null) return { text: b.value, fellback: true };
      return { error: r.error };
    }
    if (b.value != null) return { text: b.value };
    return { error: "empty binding" };
  }

  function resolvePhrase(model, item) {
    const sp = model.smartPhrases[item.sp];
    let err = null;
    const text = sp.phrase_template.replace(/\{(\w+)\}/g, function (_, name) {
      const b = item.bindings[name];
      if (!b) { err = "missing binding: " + name; return "{" + name + "}"; }
      const r = resolveBinding(model.concepts, b);
      if (r.error) { err = r.error; return "{" + name + "}"; }
      return r.text;
    });
    return { text: text, err: err };
  }

  function resolveSentence(model, analysis) {
    const parts = [];
    analysis.sentence.forEach(function (item, i) {
      if (item.enabled === false) return;
      const sp = model.smartPhrases[item.sp];
      const r = resolvePhrase(model, item);
      parts.push({ i: i, role: sp.role, sp: item.sp, item: item, text: r.text, err: r.err });
    });
    return parts;
  }

  function capitalise(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  return {
    renderConcept: renderConcept,
    resolveBinding: resolveBinding,
    resolvePhrase: resolvePhrase,
    resolveSentence: resolveSentence,
    capitalise: capitalise
  };
})();
