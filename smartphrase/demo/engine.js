/*
 * Smartphrase engine — the single set of functions every surface of the demo
 * uses. One analysis-instance object is the shared state; the SAP prose, the
 * constructed model view, the tag source and the JSON-LD graph are all
 * projections computed here from that one object.
 *
 * Pure functions, no DOM: runs in the browser and under Node (verification).
 */
(function (g) {
  "use strict";

  /*
   * Build the evaluation context. Proposed library additions (not yet upstream
   * on methods_02) are merged over the generated subset here, tagged
   * proposed: true so the UI can badge them. The generated subset is never
   * mutated — the merge produces a new lib object.
   */
  function ctxOf(lib, graph, i18n, proposed) {
    var merged = lib;
    var pro = proposed || g.ACDC_LIBRARY_PROPOSED || null;
    if (pro) {
      merged = Object.assign({}, lib);
      merged.proposedProvenance = pro.provenance;
      if (pro.transformations && pro.transformations.length) {
        merged.transformations = lib.transformations.concat(
          pro.transformations.map(function (t) {
            return Object.assign({}, t, { proposed: true });
          })
        );
      }
      /* Phrases added to an upstream template. The generated entry is copied,
         never mutated; proposedPhrasesAdded lets the UI badge the additions
         individually rather than badging the whole released template. */
      if (pro.validSmartPhrasesAdded) {
        merged.transformations = merged.transformations.map(function (t) {
          var add = pro.validSmartPhrasesAdded[t.conceptId];
          if (!add) return t;
          return Object.assign({}, t, {
            validSmartPhrases: (t.validSmartPhrases || []).concat(add),
            proposedPhrasesAdded: add
          });
        });
      }
      if (pro.smartPhrases && pro.smartPhrases.length) {
        merged.smartPhrases = lib.smartPhrases.concat(
          pro.smartPhrases.map(function (p) {
            return Object.assign({}, p, { proposed: true });
          })
        );
      }
      /* Proposed ROLES splice into the generated order at their declared
         position — appending would put ice_handling after covariate. The
         generated subset's arrays are copied, never mutated. */
      if (pro.roleDefinitions && pro.roleDefinitions.roles) {
        var newOrder = lib.roleDefinitions.order.slice();
        var newRoles = Object.assign({}, lib.roleDefinitions.roles);
        Object.keys(pro.roleDefinitions.roles).forEach(function (name) {
          var def = pro.roleDefinitions.roles[name];
          newRoles[name] = Object.assign({}, def, { proposed: true });
          if (newOrder.indexOf(name) !== -1) return;
          var after = def.order_after;
          var at = after && after !== "last" ? newOrder.indexOf(after) : -1;
          if (at === -1) newOrder.push(name);
          else newOrder.splice(at + 1, 0, name);
        });
        merged.roleDefinitions = Object.assign({}, lib.roleDefinitions, {
          order: newOrder, roles: newRoles
        });
      }
    }
    return { lib: merged, graph: graph, i18n: i18n || null };
  }

  // ---------- language packs ----------------------------------------------

  function langPack(ctx, lang) {
    return (ctx.i18n && ctx.i18n[lang]) || null;
  }

  function availableLangs(ctx) {
    return ctx.i18n ? Object.keys(ctx.i18n) : ["en"];
  }

  /* Overlay per-language label/name onto a registry/method entity. */
  function localiseEntity(ctx, lang, section, id, entity) {
    var pack = langPack(ctx, lang);
    var over = pack && pack[section] && pack[section][id];
    return over ? Object.assign({}, entity, over) : entity;
  }

  // ---------- lookups ----------------------------------------------------

  function phraseDef(ctx, oid) {
    return ctx.lib.smartPhrases.find(function (p) { return p.oid === oid; }) || null;
  }

  function templateDef(ctx, conceptId) {
    return ctx.lib.transformations.find(function (t) { return t.conceptId === conceptId; }) || null;
  }

  function concept(ctx, id) {
    return ctx.graph.concepts[id] || null;
  }

  function method(ctx, id) {
    var def = ctx.lib.methods[id] || null;
    var grounding = ctx.graph.methodGrounding[id] || {};
    if (!def) return null;
    return {
      conceptId: def.conceptId,
      label: grounding.label || def.label,
      name: grounding.name || def.name.toLowerCase(),
      formula: def.formula,
      configurations: def.configurations,
      iri: grounding.iri, iri_status: grounding.iri_status,
      ars: grounding.ars, ars_status: grounding.ars_status
    };
  }

  // ---------- rendering ---------------------------------------------------

  function renderEntity(entity, mode) {
    if (!entity) return null;
    switch (mode) {
      case "label": return entity.label;
      case "name": return entity.name;
      case "name_with_label": return entity.name + " (" + entity.label + ")";
      default: return entity.label;
    }
  }

  /*
   * Resolve one placeholder binding → { text, detail } or { error }.
   *
   * `tpl` (the active transformation template) and `phDef` (the phrase this
   * placeholder belongs to) are optional and carry the context some slot kinds
   * need to validate themselves: an output_ref must be an output the template
   * and method actually produce, and an ICE must declare a handling for the
   * strategy its phrase asserts.
   */
  function resolveBinding(ctx, ph, binding, lang, tpl, phDef) {
    lang = lang || "en";
    if (!binding) {
      return { error: "no binding for required placeholder '" + ph.name + "'" };
    }
    if (ph.kind === "value" || binding.value !== undefined) {
      var v = binding.value;
      if (ph.constraint && (Number(v) < ph.constraint.min || Number(v) > ph.constraint.max)) {
        return { error: "value " + v + " outside constraint [" + ph.constraint.min + ", " + ph.constraint.max + "] for '" + ph.name + "'" };
      }
      return { text: String(v), detail: { kind: "value", value: v } };
    }
    if (ph.kind === "output_ref" || binding.output !== undefined) {
      var oc = (ctx.lib.outputClasses || {})[binding.output];
      if (!oc) return { error: "unknown output class '" + binding.output + "'" };
      /* Requirement: the summary must be an output the bound method provably
         produces. Checked against BOTH the template's declared output measures
         and the method's own outputs[] — a template may declare a subset, and
         neither list alone is authoritative. */
      if (tpl) {
        var declared = ((tpl.outputDataStructure || {}).measures || [])
          .map(function (om) { return om.output; });
        if (declared.indexOf(binding.output) === -1) {
          return { error: "output '" + binding.output + "' is not produced by template " +
                          tpl.conceptId + " (declares: " + declared.join(", ") + ")" };
        }
        var md = ctx.lib.methods[tpl.usesMethod];
        var produced = md ? (md.outputs || []).map(function (o) { return o.name; }) : [];
        if (md && produced.indexOf(binding.output) === -1) {
          return { error: "output '" + binding.output + "' is not produced by method " +
                          tpl.usesMethod };
        }
      }
      var ocl = localiseEntity(ctx, lang, "outputClasses", binding.output, oc);
      var omode = binding.render || ph.default_render || "name";
      return { text: renderEntity(ocl, omode),
               detail: { kind: "output", id: binding.output, render: omode,
                         statistics: oc.statistics, libraryLabel: oc.label } };
    }
    if (ph.kind === "method_ref" || binding.method) {
      var m = method(ctx, binding.method);
      if (!m) return { error: "unknown method '" + binding.method + "'" };
      m = localiseEntity(ctx, lang, "methods", binding.method, m);
      var mode = binding.render || ph.default_render || "name";
      return { text: renderEntity(m, mode),
               detail: { kind: "method", id: binding.method, render: mode,
                         iri: m.iri, iri_status: m.iri_status, formula: m.formula } };
    }
    var c = concept(ctx, binding.concept);
    if (!c) return { error: "unknown concept '" + binding.concept + "'" };
    if (ph.concept_constraint && c.kind !== ph.concept_constraint) {
      return { error: "concept '" + binding.concept + "' has kind " + c.kind + ", placeholder '" + ph.name + "' requires " + ph.concept_constraint };
    }
    if (ph.concept_category && c.conceptCategory !== ph.concept_category) {
      return { error: "concept '" + binding.concept + "' is not in category " + ph.concept_category };
    }
    /* An ICE phrase asserts a strategy; the event must declare a handling that
       operationalises it. An empty list is a valid answer — TreatmentPolicy
       uses data as observed, which upstream IceHandling.implementedBy documents
       as "omitted". An ABSENT key is not: that is prose claiming a handling the
       model cannot deliver, which is exactly the drift this layer exists to
       prevent. The phrase's anchors say whether an implementer is expected. */
    if (c.kind === "IntercurrentEvent" && phDef && phDef.anchors && phDef.anchors.icheStrategy) {
      var strat = phDef.anchors.icheStrategy;
      var impl = (c.implementedBy || {})[strat];
      if (impl === undefined) {
        return { error: "intercurrent event '" + binding.concept +
                        "' declares no handling for the " + strat + " strategy" };
      }
      if (phDef.anchors.implementation !== "none" && impl.length === 0) {
        return { error: "strategy " + strat + " on '" + binding.concept +
                        "' needs an implementing transformation (" +
                        phDef.anchors.implementation + ") but declares none" };
      }
      var missingImpl = impl.filter(function (tid) { return !templateDef(ctx, tid); });
      if (missingImpl.length) {
        return { error: "implementing transformation(s) not in the library: " +
                        missingImpl.join(", ") };
      }
    }
    var cmode = binding.render || ph.default_render || "label";
    var cl = localiseEntity(ctx, lang, "concepts", binding.concept, c);
    return { text: renderEntity(cl, cmode),
             detail: { kind: "concept", id: binding.concept, render: cmode,
                       iri: c.iri, iri_status: c.iri_status } };
  }

  /*
   * Relation ranks (issue #13). Unlabelled sits in the MIDDLE deliberately:
   * labelling a reference `specification` promotes it and labelling it
   * `definition` demotes it, and both are positive claims an author has made.
   * `qualification` sits just above unlabelled because a caveat attached to
   * this analysis is more use-specific than a passage nobody has characterised.
   *
   * No registered identifier covers "why this passage grounds this use" —
   * USDM, ARS, STATO and NCIt are all silent — so the vocabulary is
   * illustrative under the project's identifier policy, and deliberately stops
   * at three terms.
   */
  var RELATION_RANK = { specification: 0, qualification: 1, definition: 3 };
  var RELATION_NEUTRAL = 2;

  /*
   * How near a reference is to the section that specifies the analysis being
   * inspected: the number of matching leading dotted components. Against
   * "7.7.2", a "7.7.2" reference scores 3, "7.2" scores 1, and "5.3" scores 0.
   *
   * This assumes dotted section numbering. A document anchored by heading text
   * alone scores every reference 0 and falls through to relation, then
   * declaration order — a stated limitation, not a silent one.
   */
  function sectionProximity(a, b) {
    if (!a || !b) return 0;
    var x = String(a).split("."), y = String(b).split(".");
    var n = 0;
    while (n < x.length && n < y.length && x[n] === y[n]) n++;
    return n;
  }

  /* Enough normalisation to spot the same passage reached by two routes. The
     gate's normaliser (tools/lib-anchors.mjs) is stricter because it compares
     against the document; this one only has to catch duplicates. */
  function anchorKey(ref) {
    return ref.section + "|" +
      String(ref.quote || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  /*
   * Order candidates by, outermost key first: level (a use-specific anchor
   * outranks a definitional one — issue #12's decision, unchanged), then
   * proximity, then relation, then declaration order. Declaration order is the
   * LAST resort; it used to be the first, which is the bug.
   */
  function rankAnchors(cands, contextSection) {
    return cands.map(function (c, i) {
      var rel = RELATION_RANK[c.ref.relation];
      return {
        ref: c.ref, level: c.level, from: c.from,
        _prox: sectionProximity(c.ref.section, contextSection),
        _rel: rel === undefined ? RELATION_NEUTRAL : rel,
        _i: i
      };
    }).sort(function (a, b) {
      return a.level - b.level || b._prox - a._prox || a._rel - b._rel || a._i - b._i;
    });
  }

  /* What actually distinguished the head from the runner-up, so a heuristic is
     never presented to a reviewer as a stated fact. Named basisOf rather than
     anchorBasis because the resolved phrase carries a FIELD of that name. */
  function basisOf(ordered) {
    if (!ordered.length) return null;
    if (ordered.length === 1) return "only";
    var a = ordered[0], b = ordered[1];
    if (a.level !== b.level) return "level";
    if (a._prox !== b._prox) return "proximity";
    if (a._rel !== b._rel) return "relation";
    return "declarationOrder";
  }

  /*
   * Every study-side anchor site is a LIST (issue #13). A concept exists to be
   * reused, and the analyses that bind it are specified in different sections,
   * so one reference can never be the right anchor for all of them.
   *
   * Absent and empty are different answers: an absent sapRefs is an unanswered
   * question, whereas [] states "nothing in the document grounds this" and must
   * be accompanied by noAnchorReason. Both read as no references here; the gate
   * is what distinguishes them.
   */
  function refsOf(x) {
    return (x && x.sapRefs) || [];
  }

  /*
   * Every document reference that grounds one phrase USE, ordered by relevance
   * to the analysis being inspected (issues #12 and #13).
   *
   * #12 gave a use a path back to the document. #13 is that ONE path was not
   * enough: a concept exists to be reused, its definitional quote sits wherever
   * it was first defined, and first-match-wins then sent every later analysis
   * to that same passage instead of to the text specifying it. An independent
   * reviewer working through 96 encoded instances hit this repeatedly.
   *
   * So: collect from the phrase instance and from every bound concept,
   * deduplicate, and rank. The instance's own anchor is the REFERENCE POINT for
   * proximity, never a member of the set — admitting it would make every use
   * resolve to something and turn the declared-empty rule into a dead letter.
   *
   * Shared by resolvePhrase and toJSONLD so the prose and the graph cannot
   * disagree, and so neither has to pair a resolved phrase back to its instance
   * by oid — which would break for a repeating role using one oid twice.
   */
  function anchorForPhrase(ctx, pi, def, instance) {
    var contextSection = (refsOf(instance)[0] || {}).section || null;
    var cands = [];
    refsOf(pi).forEach(function (r) {
      cands.push({ ref: r, level: 0, from: "phraseInstance" });
    });
    ((def && def.placeholders) || []).forEach(function (ph) {
      var b = (pi.bindings || {})[ph.name];
      var c = b && b.concept && concept(ctx, b.concept);
      refsOf(c).forEach(function (r) {
        cands.push({ ref: r, level: 1, from: "concept:" + b.concept });
      });
    });

    /* When the same passage is authored identically at two levels, this keeps
       whichever candidate was pushed first — the phrase instance's own copy,
       pushed above, before any concept's — so a duplicate never costs the
       use-specific anchor its level precedence. */
    var seen = {};
    var uniq = cands.filter(function (c) {
      var k = anchorKey(c.ref);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });

    var ordered = rankAnchors(uniq, contextSection);
    var head = ordered[0] || null;
    return {
      anchors: ordered.map(function (o) {
        return Object.assign({}, o.ref, { from: o.from, proximity: o._prox });
      }),
      anchor: head ? head.ref : null,
      source: head ? head.from : null,
      basis: basisOf(ordered),
      contextSection: contextSection,
      declaredEmpty: Array.isArray(pi.sapRefs) && pi.sapRefs.length === 0,
      /* Carried alongside declaredEmpty rather than left for a caller to fetch
         off the raw phrase instance — DESIGN.md D18's lesson (a field no
         projection carries is inert) applies just as much to the REASON for a
         declared-empty use as to the anchors themselves. */
      noAnchorReason: typeof pi.noAnchorReason === "string" ? pi.noAnchorReason : null
    };
  }

  /* Resolve one phrase instance → { oid, role, text, bindings[], errors[] } */
  function resolvePhrase(ctx, pi, lang, tpl, instance) {
    lang = lang || "en";
    var def = phraseDef(ctx, pi.phrase);
    if (!def) return { oid: pi.phrase, errors: ["unknown smartphrase '" + pi.phrase + "'"], text: "⟨" + pi.phrase + "?⟩" };
    var pack = langPack(ctx, lang);
    var text = (pack && pack.phrases && pack.phrases[def.oid]) || def.phrase_template;
    var langFallback = lang !== "en" && !(pack && pack.phrases && pack.phrases[def.oid]);
    var errors = [];
    var bindings = [];
    (def.placeholders || []).forEach(function (ph) {
      var b = (pi.bindings || {})[ph.name];
      if (!b && !ph.required) return;
      var r = resolveBinding(ctx, ph, b, lang, tpl, def);
      if (r.error) {
        errors.push(r.error);
        text = text.replace("{" + ph.name + "}", "⟨" + ph.name + "?⟩");
      } else {
        text = text.replace("{" + ph.name + "}", r.text);
        bindings.push({ placeholder: ph.name, text: r.text, detail: r.detail });
      }
    });
    var resolvedAnchor = anchorForPhrase(ctx, pi, def, instance);

    return { oid: def.oid, role: def.role, name: def.name,
             template: def.phrase_template,
             text: text, bindings: bindings, errors: errors,
             langFallback: langFallback,
             anchor: resolvedAnchor.anchor, anchorSource: resolvedAnchor.source,
             anchors: resolvedAnchor.anchors, anchorBasis: resolvedAnchor.basis,
             anchorContextSection: resolvedAnchor.contextSection,
             anchorDeclaredEmpty: resolvedAnchor.declaredEmpty,
             noAnchorReason: resolvedAnchor.noAnchorReason };
  }

  /*
   * Resolve a whole instance → ordered phrases, an assembled sentence, and
   * `parts` (the render sequence: phrase chips + literal frame text).
   *
   * Word order comes from the language pack's `sentence_template` — a string
   * of {role} tokens plus literal frame text (plus {sentenceRole}). Phrases
   * sharing a role fill their token in library role order. With no pack, a
   * default template concatenating all roles in roleDefinitions.order is
   * used, which reproduces the plain-English assembly.
   */
  function resolveInstance(ctx, instance, lang) {
    lang = lang || "en";
    var order = ctx.lib.roleDefinitions.order;
    var instTpl = templateDef(ctx, instance.template);
    var resolved = instance.phrases.map(function (pi) {
      return resolvePhrase(ctx, pi, lang, instTpl, instance);
    });
    resolved.sort(function (a, b) {
      return order.indexOf(a.role) - order.indexOf(b.role);
    });

    var pack = langPack(ctx, lang) || langPack(ctx, "en");
    var tmpl = (pack && pack.sentence_template) ||
      "{" + order.join("} {") + "} will be assessed as {sentenceRole}.";
    var roleText = (pack && pack.sentenceRoles && pack.sentenceRoles[instance.sentenceRole]) ||
      instance.sentenceRole || "an analysis";

    /*
     * A sentence template is a sequence of segments. `[ ... ]` marks an
     * OPTIONAL group: it is emitted only if at least one role token inside it
     * resolves to a phrase, so punctuation belonging to an optional clause
     * disappears with the clause instead of stranding a comma. Templates using
     * no brackets are unaffected — their frame text between role tokens is pure
     * whitespace, which the normaliser below already collapses.
     */
    function segmentsOf(t) {
      var segs = [];
      var re = /\[([^\]]*)\]/g;
      var last = 0, mm;
      while ((mm = re.exec(t))) {
        if (mm.index > last) segs.push({ text: t.slice(last, mm.index), optional: false });
        segs.push({ text: mm[1], optional: true });
        last = mm.index + mm[0].length;
      }
      if (last < t.length) segs.push({ text: t.slice(last), optional: false });
      return segs;
    }
    function segHasPhrase(t) {
      var toks = t.match(/\{([a-zA-Z_]+)\}/g) || [];
      return toks.some(function (tk) {
        var role = tk.slice(1, -1);
        return resolved.some(function (rp) { return rp.role === role; });
      });
    }

    // Build the render sequence from the sentence template.
    var parts = [];
    segmentsOf(tmpl).forEach(function (group) {
      if (group.optional && !segHasPhrase(group.text)) return;
      group.text.split(/(\{[a-zA-Z_]+\})/).forEach(function (seg) {
        if (!seg) return;
        var tok = seg.match(/^\{([a-zA-Z_]+)\}$/);
        if (!tok) { parts.push({ type: "text", text: seg, frame: true }); return; }
        if (tok[1] === "sentenceRole") { parts.push({ type: "text", text: roleText, frame: true }); return; }
        if (order.indexOf(tok[1]) === -1) { parts.push({ type: "text", text: seg, frame: true }); return; }
        /* Phrases sharing a role are separated by a bare space unless the pack
           declares a conjunction for that role — "as if X had not occurred AND
           regardless of Y". Localisable, and roles with no entry are unchanged. */
        var joiner = (pack && pack.role_conjunctions && pack.role_conjunctions[tok[1]]) || " ";
        resolved.forEach(function (rp, i) {
          if (rp.role !== tok[1]) return;
          if (parts.length && parts[parts.length - 1].type === "phrase") {
            parts.push({ type: "text", text: joiner, frame: joiner !== " " });
          }
          parts.push({ type: "phrase", phrase: rp });
        });
      });
    });
    // Normalise: merge adjacent text, collapse whitespace left by empty roles.
    var norm = [];
    parts.forEach(function (p) {
      if (p.type === "text" && norm.length && norm[norm.length - 1].type === "text") {
        norm[norm.length - 1].text += p.text;
        norm[norm.length - 1].frame = norm[norm.length - 1].frame || p.frame;
      } else {
        norm.push(Object.assign({}, p));
      }
    });
    norm.forEach(function (p) {
      if (p.type !== "text") return;
      p.text = p.text.replace(/\s+/g, " ");
      /* An elided optional group leaves the whitespace that separated it from
         the previous role, so punctuation opening the NEXT group arrives as
         " , ". Fixed here rather than in the assembled string, because the DOM
         renders these parts individually. */
      p.text = p.text.replace(/\s+([,;.])/g, "$1");
    });
    while (norm.length && norm[0].type === "text" && !norm[0].text.trim()) norm.shift();
    if (norm.length && norm[0].type === "text") norm[0].text = norm[0].text.replace(/^\s+/, "");

    var sentence = norm.map(function (p) {
      return p.type === "phrase" ? p.phrase.text : p.text;
    }).join("").replace(/\s+/g, " ").trim();
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);

    var errors = resolved.reduce(function (acc, r) { return acc.concat(r.errors || []); }, []);
    return { phrases: resolved, parts: norm, sentence: sentence, errors: errors, lang: lang };
  }

  // ---------- SAP → model: the constructed instance view ------------------

  function bindingConceptId(instance, phraseOid, phName) {
    var pi = instance.phrases.find(function (p) { return p.phrase === phraseOid; });
    if (!pi || !pi.bindings[phName]) return null;
    return pi.bindings[phName].concept || pi.bindings[phName].method ||
           pi.bindings[phName].value || pi.bindings[phName].output || null;
  }

  /*
   * Every concept the instance binds, as { slot, id, c, role }, ordered by the
   * library's role order so the endpoint-role binding wins when two phrases
   * bind the same slot name (e.g. SP_CFB_ENDPOINT and SP_COVARIATE_BASELINE
   * both bind `parameter`). Slot NAMES are the join to template tokens —
   * {parameter}, {visit}, {population}, {event} — so no phrase OID is
   * hardcoded and a new endpoint phrase works with no engine change.
   */
  function boundConcepts(ctx, instance) {
    var order = ctx.lib.roleDefinitions.order;
    var out = [];
    instance.phrases.forEach(function (pi) {
      var def = phraseDef(ctx, pi.phrase);
      var role = def ? def.role : null;
      Object.keys(pi.bindings || {}).forEach(function (slot) {
        var b = pi.bindings[slot];
        if (!b || !b.concept) return;
        var c = concept(ctx, b.concept);
        if (c) out.push({ slot: slot, id: b.concept, c: c, role: role });
      });
    });
    out.sort(function (a, b) {
      return order.indexOf(a.role) - order.indexOf(b.role);
    });
    return out;
  }

  /*
   * The estimand this analysis addresses, resolved from the study's registry.
   * Instances reference it by id (`estimand: "EST.PRIMARY"`) so several analyses
   * of one estimand cannot drift out of step — the estimand's identity,
   * including its intercurrent-event scope, is stated once.
   */
  function estimandOf(ctx, instance) {
    var reg = ctx.graph.estimands || {};
    var id = typeof instance.estimand === "string"
      ? instance.estimand
      : instance.estimand && instance.estimand.id;
    if (!id || !reg[id]) return null;
    return Object.assign({ id: id }, reg[id]);
  }

  /*
   * The reified (Estimand, IntercurrentEvent, Strategy) triples for this
   * analysis — eSAP IceHandling.
   *
   * The ESTIMAND owns which events are in scope (`intercurrentEvents[]`, per
   * usdm Estimand.intercurrentEvents): they are part of the question being
   * asked. The ANALYSIS supplies the strategy, via an `ice_handling` phrase; an
   * analysis that states none inherits the event's own study-default
   * `icheStrategy`. So one event always yields exactly one handling per
   * analysis, and an analysis with no ICE prose reads as "handled as standard"
   * rather than "handles nothing".
   *
   * Strategy is never stored twice: the phrase is the only author of a
   * non-default strategy, and this projection reads it back. Model→SAP is the
   * reverse lookup — find the phrase whose anchors.icheStrategy matches.
   */
  function iceHandlings(ctx, instance) {
    var est = estimandOf(ctx, instance);
    var declared = (est && est.intercurrentEvents) || [];

    var byPhrase = {};
    instance.phrases.forEach(function (pi) {
      var def = phraseDef(ctx, pi.phrase);
      if (!def || def.role !== "ice_handling") return;
      var b = (pi.bindings || {}).ice;
      if (b && b.concept) byPhrase[b.concept] = def;
    });

    var out = [];
    declared.forEach(function (iceId) {
      var c = concept(ctx, iceId);
      if (!c) return;
      var def = byPhrase[iceId] || null;
      var strat = def ? def.anchors.icheStrategy : c.icheStrategy;
      out.push({
        forIntercurrentEvent: iceId,
        label: c.name,
        icheStrategy: strat || null,
        studyDefaultStrategy: c.icheStrategy || null,
        /* An analysis applying a strategy other than the event's study default
           is an override — stated, not silently divergent. */
        isOverride: !!c.icheStrategy && !!strat && c.icheStrategy !== strat,
        source: def ? "phrase" : "studyDefault",
        implementedBy: ((c.implementedBy || {})[strat] || []).map(function (tid) {
          return { transformationId: tid };
        }),
        fromPhrase: def ? def.oid : null
      });
    });
    return out;
  }

  /* Display value for a bound concept: populations read as names, everything
     else as short labels. Matches the pre-generalisation behaviour exactly. */
  function conceptDisplay(c) {
    return c.kind === "Population" ? c.name : c.label;
  }

  /*
   * Study-variable expression per method. The method's own
   * formula.default_expression is input-name shaped ("response ~ covariate +
   * fixed_effect"); rendering it in study variables needs the template's
   * measure→variable mapping, which the library does not yet carry, so this
   * dispatches on method and falls back to the generic expression.
   * TODO(upstream): replace with a formula resolver once measures declare
   * their ADaM variable, per DESIGN.md "deliberately out of scope".
   */
  var EXPRESSION_BUILDERS = {
    "M.ANCOVA": function (ctx, instance) {
      var terms = ["TRTP"];
      if (instance.phrases.some(function (p) { return p.phrase === "SP_COVARIATE_BASELINE"; })) terms.push("BASE");
      if (instance.phrases.some(function (p) { return p.phrase === "SP_COVARIATE_SITE"; })) terms.push("SITEGR1");
      return "CHG ~ " + terms.join(" + ");
    },
    "M.KaplanMeier": function () {
      return "Surv(AVAL, 1-CNSR) ~ TRTP";
    }
  };

  function resolvedExpressionFor(ctx, instance, tpl, m) {
    var builder = EXPRESSION_BUILDERS[tpl.usesMethod];
    if (builder) return builder(ctx, instance, tpl);
    return (m && m.formula && m.formula.default_expression) || null;
  }

  /*
   * Construct the study-model view of the instance, eSAP-style: the template
   * is copied, its sliceKeys get study-resolved values, its slice constraint
   * {placeholder} tokens are substituted, and the method formula is resolved
   * to study variables. This is the "SAP → model" direction made concrete.
   */
  function constructModelView(ctx, instance) {
    var tpl = templateDef(ctx, instance.template);
    if (!tpl) return { errors: ["unknown template '" + instance.template + "'"] };
    var m = method(ctx, tpl.usesMethod);

    var bound = boundConcepts(ctx, instance);

    /* Slot-name-keyed substitution for slice constraint tokens. */
    var subst = {};
    bound.forEach(function (bc) {
      var tok = "{" + bc.slot + "}";
      if (subst[tok] === undefined) subst[tok] = conceptDisplay(bc.c);
    });
    if (instance.baselineVisit) {
      var baseVisit = concept(ctx, instance.baselineVisit);
      subst["{baseline_visit}"] = baseVisit ? baseVisit.label : "⟨baseline_visit⟩";
    }
    function fill(s) {
      return Object.keys(subst).reduce(function (acc, k) { return acc.split(k).join(subst[k]); }, s);
    }

    /* A sliceKey dimension is matched by the bound concept's conceptCategory
       (ParameterDimension, VisitDimension, EventDimension) or its kind
       (Population, Treatment). */
    var sliceKeys = (tpl.sliceKeys || []).map(function (sk) {
      var hit = bound.find(function (bc) {
        return bc.c.conceptCategory === sk.dimension || bc.c.kind === sk.dimension;
      });
      return {
        dimension: sk.dimension,
        source: sk.source,
        value: hit ? { concept: hit.id, label: conceptDisplay(hit.c), iri: hit.c.iri } : null
      };
    });

    var slices = ((tpl.inputDataStructure || {}).slices || []).map(function (sl) {
      return {
        name: sl.name,
        constraints: sl.constraints.map(function (c) {
          return { dimension: c.dimension, value: fill(c.value) };
        })
      };
    });

    var confLevel = bindingConceptId(instance, "SP_CONFIDENCE_LEVEL", "conf_level");

    var configurationValues = (tpl.methodConfigurations || []).map(function (mc) {
      return { configurationName: mc.configurationName, value: mc.value, from: "template" };
    });
    if (confLevel) {
      /* Round: 1 - 90/100 is 0.09999999999999998 in IEEE 754. */
      var alpha = Math.round((1 - Number(confLevel) / 100) * 1000) / 1000;
      configurationValues.push({
        configurationName: "alpha",
        value: String(alpha),
        from: "SP_CONFIDENCE_LEVEL"
      });
    }

    var resolvedExpression = resolvedExpressionFor(ctx, instance, tpl, m);

    return {
      instance: instance.id,
      iri: instance.iri,
      /* eSAP: the Analysis sits under Estimand.hasTransformation and states its
         role for that estimand via Analysis.analysisRole. */
      estimand: estimandOf(ctx, instance),
      analysisRole: instance.analysisRole || null,
      handlesIntercurrentEvent: iceHandlings(ctx, instance),
      /*
       * Document provenance: this analysis's own anchor, and every reference
       * resolved for each phrase use — one entry per reference, not per use,
       * since a use can rest on several passages (issue #13); `head` marks
       * which one the engine ranked first. EMITTING it is the point — an
       * anchor no projection carries is inert, which is how three of four
       * binding kinds went unanchored unnoticed (issue #12). Now it is pinned
       * in goldens and can regress detectably.
       */
      sapRefs: refsOf(instance),
      documentAnchors: resolveInstance(ctx, instance).phrases
        .reduce(function (acc, rp) {
          (rp.anchors || []).forEach(function (a, i) {
            acc.push({
              phrase: rp.oid, role: rp.role,
              section: a.section, quote: a.quote || null,
              relation: a.relation || null,
              from: a.from, proximity: a.proximity,
              head: i === 0,
              basis: i === 0 ? rp.anchorBasis : null
            });
          });
          return acc;
        }, []),
      /*
       * Uses that declare "nothing in the document grounds this" rather than
       * resolving to a reference. documentAnchors above has no row for them —
       * an empty anchors[] contributes nothing to a reduce — so without this
       * sibling field noAnchorReason would reach no projection at all, the
       * exact failure mode DESIGN.md D18 names (a field no projection carries
       * is inert and cannot regress detectably), reintroduced for a new field.
       */
      declaredEmptyUses: resolveInstance(ctx, instance).phrases
        .filter(function (rp) { return rp.anchorDeclaredEmpty; })
        .map(function (rp) {
          return { phrase: rp.oid, role: rp.role, noAnchorReason: rp.noAnchorReason };
        }),
      template: {
        conceptId: tpl.conceptId, label: tpl.label,
        transformationType: tpl.transformationType,
        copiedFrom: "Transformation Library v" + ctx.lib.library_version + " (methods_02)"
      },
      usesMethod: m && { conceptId: m.conceptId, label: m.label, iri: m.iri, ars: m.ars,
                         genericExpression: m.formula && m.formula.generic_expression },
      configurationValues: configurationValues,
      sliceKeys: sliceKeys,
      slices: slices,
      outputMeasures: ((tpl.outputDataStructure || {}).measures || []).map(function (om) {
        return { output: om.output, concept: om.concept };
      }),
      resolvedExpression: resolvedExpression,
      usdmObjective: instance.usdmObjective,
      arsAnalysis: instance.arsAnalysis,
      validSmartPhrases: tpl.validSmartPhrases
    };
  }

  // ---------- trace: phrase → physical data --------------------------------

  /*
   * `focusConceptId` puts one bound concept at the head of the token precedence
   * order. Required for repeating roles: two ICE phrases in one instance must
   * each trace to their OWN ascertainment, and without a focus the endpoint
   * concept's {dataset} would shadow both, since role order puts endpoint first
   * and the token fill below is first-wins.
   */
  function buildTrace(ctx, instance, role, focusConceptId) {
    var tplChain = ctx.graph.traceTemplates[role];
    if (!tplChain) return null;

    var bound = boundConcepts(ctx, instance);
    if (focusConceptId) {
      bound = bound.filter(function (bc) { return bc.id === focusConceptId; })
        .concat(bound.filter(function (bc) { return bc.id !== focusConceptId; }));
    }

    /* Each bound concept contributes its `data` keys as tokens — {dataset},
       {file}, {paramcd}, {avisitn}, {flag}, {aval}, {cnsr}, … — in role order,
       so the endpoint concept's data wins on any key collision. Label tokens
       are derived from the concept's position in the model, not its phrase. */
    var tokens = {};
    bound.forEach(function (bc) {
      Object.keys(bc.c.data || {}).forEach(function (k) {
        var tok = "{" + k + "}";
        if (tokens[tok] === undefined) tokens[tok] = String(bc.c.data[k]);
      });
    });
    bound.forEach(function (bc) {
      if (bc.role === "endpoint" || bc.role === "parameter") {
        if (tokens["{paramLabel}"] === undefined) tokens["{paramLabel}"] = bc.c.label;
        if (tokens["{eventLabel}"] === undefined) tokens["{eventLabel}"] = bc.c.label;
      }
      if (bc.c.conceptCategory === "VisitDimension" && tokens["{visitLabel}"] === undefined) {
        tokens["{visitLabel}"] = bc.c.label;
      }
      if (bc.c.kind === "Population" && tokens["{popName}"] === undefined) {
        tokens["{popName}"] = bc.c.name;
      }
      if (bc.c.kind === "IntercurrentEvent") {
        if (tokens["{iceLabel}"] === undefined) tokens["{iceLabel}"] = bc.c.label;
        if (tokens["{iceName}"] === undefined) tokens["{iceName}"] = bc.c.name;
        /* The executable form of the ascertainment condition, rendered from the
           OccurrenceCriterion shape. Presence operators take no value. */
        var crit = ((bc.c.ascertainedBy || {}).criteria || [])[0];
        if (crit && tokens["{criterion}"] === undefined) {
          tokens["{criterion}"] = crit.property + " " + crit.operator +
            (crit.responseCode ? " '" + crit.responseCode + "'" : "");
        }
      }
    });

    function fill(s) {
      if (typeof s !== "string") return s;
      return Object.keys(tokens).reduce(function (acc, k) { return acc.split(k).join(tokens[k]); }, s);
    }
    return tplChain.map(function (step) {
      var out = {};
      Object.keys(step).forEach(function (k) { out[k] = fill(step[k]); });
      return out;
    });
  }

  // ---------- tag-dialect source: emit + parse ------------------------------

  /*
   * The authoring tag dialect (acdc:macro shape, per methods_02):
   *   <acdc:macro id="phrase" ref="SP_..." instance="p1"
   *               <slotName>="<value>" ... render="<slot>:<mode>,..."/>
   * One self-closing tag per phrase instance; order is not significant
   * (assembly order comes from the library role order).
   */
  function toMacroText(ctx, instance) {
    var lines = [
      '<acdc:macro id="analysis" ref="' + instance.template + '" instance="' + instance.id + '">'
    ];
    instance.phrases.forEach(function (pi, i) {
      var attrs = ['id="phrase"', 'ref="' + pi.phrase + '"', 'instance="p' + (i + 1) + '"'];
      var renders = [];
      Object.keys(pi.bindings).forEach(function (slot) {
        var b = pi.bindings[slot];
        attrs.push(slot + '="' + (b.concept || b.method || b.value || b.output) + '"');
        if (b.render) renders.push(slot + ":" + b.render);
      });
      if (renders.length) attrs.push('render="' + renders.join(",") + '"');
      lines.push('  <acdc:macro ' + attrs.join(" ") + "/>");
    });
    lines.push("</acdc:macro>");
    return lines.join("\n");
  }

  /*
   * Parse the dialect back to instance state. Two passes, like the methods_02
   * authoring demo: pass 1 syntax + reference resolution, pass 2 semantic
   * validation against the template (validSmartPhrases, required slots,
   * constraint kinds). Returns { instancePatch, findings[] }.
   */
  function parseMacroText(ctx, text, baseInstance) {
    var findings = [];
    var phrases = [];
    var analysisRef = null;

    var openRe = /<acdc:macro\s+([^>/]*?)>/g;
    var selfRe = /<acdc:macro\s+([^>]*?)\/>/g;
    var attrRe = /([\w:-]+)="([^"]*)"/g;

    function attrsOf(s) {
      var out = {}; var m;
      attrRe.lastIndex = 0;
      while ((m = attrRe.exec(s))) out[m[1]] = m[2];
      return out;
    }

    var m = openRe.exec(text);
    if (m) {
      var a = attrsOf(m[1]);
      if (a.id === "analysis") analysisRef = a.ref;
    }
    if (!analysisRef) {
      findings.push({ level: "error", message: 'no <acdc:macro id="analysis" ref="T..."> wrapper found' });
    } else if (!templateDef(ctx, analysisRef)) {
      findings.push({ level: "error", message: "unknown transformation template '" + analysisRef + "'" });
    }

    var tpl = analysisRef ? templateDef(ctx, analysisRef) : null;
    var sm;
    while ((sm = selfRe.exec(text))) {
      var attrs = attrsOf(sm[1]);
      if (attrs.id !== "phrase") continue;
      var def = phraseDef(ctx, attrs.ref);
      if (!def) {
        findings.push({ level: "error", message: "unknown smartphrase ref '" + attrs.ref + "'" });
        continue;
      }
      if (tpl && tpl.validSmartPhrases && tpl.validSmartPhrases.indexOf(def.oid) === -1) {
        findings.push({ level: "error", message: def.oid + " is not a valid smartphrase for template " + tpl.conceptId });
      }
      var renders = {};
      (attrs.render || "").split(",").forEach(function (r) {
        var kv = r.split(":");
        if (kv.length === 2) renders[kv[0].trim()] = kv[1].trim();
      });
      var bindings = {};
      (def.placeholders || []).forEach(function (ph) {
        var raw = attrs[ph.name];
        if (raw === undefined) {
          if (ph.required) findings.push({ level: "error", message: def.oid + ": required slot '" + ph.name + "' is not bound" });
          return;
        }
        var b;
        if (ph.kind === "value") b = { value: raw };
        else if (ph.kind === "method_ref") b = { method: raw };
        else if (ph.kind === "output_ref") b = { output: raw };
        else b = { concept: raw };
        if (renders[ph.name]) {
          if (ph.render_options && ph.render_options.indexOf(renders[ph.name]) === -1) {
            findings.push({ level: "error", message: def.oid + ": render mode '" + renders[ph.name] + "' not in " + JSON.stringify(ph.render_options) });
          } else {
            b.render = renders[ph.name];
          }
        }
        var check = resolveBinding(ctx, ph, b, "en", tpl, def);
        if (check.error) findings.push({ level: "error", message: def.oid + ": " + check.error });
        bindings[ph.name] = b;
      });
      Object.keys(attrs).forEach(function (k) {
        if (["id", "ref", "instance", "of", "render"].indexOf(k) !== -1) return;
        if (!(def.placeholders || []).some(function (ph) { return ph.name === k; })) {
          findings.push({ level: "warning", message: def.oid + ": unknown slot '" + k + "' ignored" });
        }
      });
      phrases.push({ phrase: def.oid, bindings: bindings });
    }

    if (phrases.length === 0) {
      findings.push({ level: "error", message: "no phrase tags found" });
    }

    /*
     * The tag dialect does NOT serialise document anchors — a quotation is not
     * an attribute value, and inventing syntax for one would make the authoring
     * surface worse. So anchors are carried across from the base instance by
     * matching phrase oid + bindings, which survives reordering: an edit through
     * the text surface must not silently strip provenance. A genuinely new
     * phrase has no anchor to carry, which is correct.
     */
    function bindingSig(p) {
      var b = p.bindings || {};
      return p.phrase + "|" + Object.keys(b).sort().map(function (k) {
        var v = b[k];
        return k + "=" + (v.concept || v.method || v.output || v.value);
      }).join(",");
    }
    var anchorsBySig = {};
    (baseInstance && baseInstance.phrases || []).forEach(function (p) {
      if (refsOf(p).length) {
        (anchorsBySig[bindingSig(p)] = anchorsBySig[bindingSig(p)] || []).push(p.sapRefs);
      }
    });
    phrases.forEach(function (p) {
      var pool = anchorsBySig[bindingSig(p)];
      if (pool && pool.length) p.sapRefs = pool.shift();
    });

    var patch = null;
    if (!findings.some(function (f) { return f.level === "error"; })) {
      patch = Object.assign({}, baseInstance, { template: analysisRef, phrases: phrases });
    }
    return { instancePatch: patch, findings: findings };
  }

  // ---------- JSON-LD projection -------------------------------------------

  /*
   * prov:wasQuotedFrom takes a list now that a use can rest on several passages.
   * An array of quotation nodes is better JSON-LD than the single node it
   * replaces — the relation was always many-valued in PROV.
   */
  function quotationNodes(refs, docIri) {
    if (!docIri || !refs.length) return null;
    return refs.map(function (r) {
      return { "@id": docIri + "#" + r.section, "rdfs:comment": r.quote || null };
    });
  }

  function toJSONLD(ctx, instance) {
    var tpl = templateDef(ctx, instance.template);
    var m = tpl ? method(ctx, tpl.usesMethod) : null;
    var est = estimandOf(ctx, instance);
    // The rendered sentence per available language, as language-tagged
    // literals — the RDF-native localisation mechanism.
    var resolvesTo = ctx.i18n
      ? availableLangs(ctx).map(function (l) {
          return { "@value": resolveInstance(ctx, instance, l).sentence, "@language": l };
        })
      : resolveInstance(ctx, instance).sentence;

    var docIri = (ctx.graph.sourceDocument && ctx.graph.sourceDocument.iri) || null;

    var phraseNodes = instance.phrases.map(function (pi, i) {
      var def = phraseDef(ctx, pi.phrase);
      var node = {
        "@id": "#p" + (i + 1),
        "@type": "acdc:SmartPhraseInstance",
        "sp:phrase": pi.phrase,
        "sp:role": def ? def.role : null
      };
      /*
       * prov:wasQuotedFrom is the W3C term for exactly this relation — an entity
       * derived by quoting another — so the identifier policy (ground into
       * existing standards wherever one covers the entity) is satisfied rather
       * than an AC/DC term invented.
       */
      var quoted = quotationNodes(anchorForPhrase(ctx, pi, def, instance).anchors, docIri);
      if (quoted) node["prov:wasQuotedFrom"] = quoted;
      var bnodes = [];
      Object.keys(pi.bindings).forEach(function (slot) {
        var b = pi.bindings[slot];
        if (b.value !== undefined) {
          bnodes.push({ "sp:slot": slot, "sp:value": b.value });
        } else if (b.output) {
          /* ICH E9(R1) attribute 5. The model hook is
             Analysis.summarizedByOutputClass. */
          bnodes.push({ "sp:slot": slot, "acdc:outputClass": b.output,
                        "esap:summarizedByOutputClass": b.output });
        } else if (b.method) {
          var mm = method(ctx, b.method);
          bnodes.push({ "sp:slot": slot, "@id": mm && mm.ars, "acdc:alignedTo": mm && { "@id": mm.iri } });
        } else {
          var c = concept(ctx, b.concept);
          bnodes.push({ "sp:slot": slot, "@id": c && c.iri, "rdfs:label": c && c.label,
                        "sp:render": b.render || null });
        }
      });
      node["sp:binding"] = bnodes;
      return node;
    });

    var instanceNode = {
      "@context": Object.assign({
        sp: "https://w3id.org/cdisc/ac-dc/smartphrase/",
        rdfs: "http://www.w3.org/2000/01/rdf-schema#",
        prov: "http://www.w3.org/ns/prov#"
      }, ctx.graph.prefixes),
      "@id": instance.iri,
      "@type": "acdc:AnalysisConcept",
      "rdfs:label": instance.label,
      "acdc:instantiates": { "@id": "acdc:template/" + instance.template },
      "acdc:usesMethod": m && {
        "@id": m.ars, "rdfs:label": m.label,
        "acdc:alignedTo": { "@id": m.iri }
      },
      "usdm:objective": instance.usdmObjective && {
        "@id": instance.usdmObjective.iri, "rdfs:comment": instance.usdmObjective.text
      },
      "usdm:estimand": est && {
        "@id": est.iri, "rdfs:label": est.label,
        /* Estimand.intercurrentEvents — the scope of the question, distinct from
           the per-analysis handling emitted in the model view. */
        "usdm:intercurrentEvent": (est.intercurrentEvents || []).map(function (id) {
          var ic = concept(ctx, id);
          return { "@id": ic && ic.iri, "rdfs:label": ic && ic.name };
        })
      },
      "esap:analysisRole": instance.analysisRole || null
    };
    /* Assigned conditionally, the way the phrase node above already does: the
       anchor type means "here is the text that grounds this" and must not be
       overloaded to mean "there is none" by emitting the key with a null value
       (study-graph.js's own stated principle). Set in its original key
       position (between analysisRole and ars:analysis) rather than appended
       at the end, so a study that DOES carry the key sees no reordering —
       only a study with nothing to quote loses the key entirely. */
    var quotedInstance = quotationNodes(refsOf(instance), docIri);
    if (quotedInstance) instanceNode["prov:wasQuotedFrom"] = quotedInstance;
    instanceNode["ars:analysis"] = instance.arsAnalysis && { "@id": instance.arsAnalysis.iri };
    instanceNode["sp:hasPhraseInstance"] = phraseNodes;
    instanceNode["sp:resolvesTo"] = resolvesTo;
    return instanceNode;
  }

  g.SP_ENGINE = {
    availableLangs: availableLangs,
    langPack: langPack,
    ctxOf: ctxOf,
    phraseDef: phraseDef,
    templateDef: templateDef,
    concept: concept,
    method: method,
    resolvePhrase: resolvePhrase,
    anchorForPhrase: anchorForPhrase,
    resolveInstance: resolveInstance,
    estimandOf: estimandOf,
    iceHandlings: iceHandlings,
    constructModelView: constructModelView,
    buildTrace: buildTrace,
    toMacroText: toMacroText,
    parseMacroText: parseMacroText,
    toJSONLD: toJSONLD
  };
})(typeof window !== "undefined" ? window : globalThis);
