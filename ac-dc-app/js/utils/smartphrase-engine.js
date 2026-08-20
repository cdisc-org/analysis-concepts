/*
 * Smartphrase engine — the single set of functions every surface of the demo
 * uses. One analysis-instance object is the shared state; the SAP prose, the
 * constructed model view, the tag source and the JSON-LD graph are all
 * projections computed here from that one object.
 *
 * Pure functions, no DOM: runs in the browser and under Node (verification).
 */
const __ns = {};

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
      if (pro.smartPhrases && pro.smartPhrases.length) {
        merged.smartPhrases = lib.smartPhrases.concat(
          pro.smartPhrases.map(function (p) {
            return Object.assign({}, p, { proposed: true });
          })
        );
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

  /* Resolve one placeholder binding → { text, detail } or { error } */
  function resolveBinding(ctx, ph, binding, lang) {
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
    var cmode = binding.render || ph.default_render || "label";
    var cl = localiseEntity(ctx, lang, "concepts", binding.concept, c);
    return { text: renderEntity(cl, cmode),
             detail: { kind: "concept", id: binding.concept, render: cmode,
                       iri: c.iri, iri_status: c.iri_status } };
  }

  /* Resolve one phrase instance → { oid, role, text, bindings[], errors[] } */
  function resolvePhrase(ctx, pi, lang) {
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
      var r = resolveBinding(ctx, ph, b, lang);
      if (r.error) {
        errors.push(r.error);
        text = text.replace("{" + ph.name + "}", "⟨" + ph.name + "?⟩");
      } else {
        text = text.replace("{" + ph.name + "}", r.text);
        bindings.push({ placeholder: ph.name, text: r.text, detail: r.detail });
      }
    });
    return { oid: def.oid, role: def.role, name: def.name,
             template: def.phrase_template, anchors: def.anchors,
             text: text, bindings: bindings, errors: errors,
             langFallback: langFallback };
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
    var resolved = instance.phrases.map(function (pi) { return resolvePhrase(ctx, pi, lang); });
    resolved.sort(function (a, b) {
      return order.indexOf(a.role) - order.indexOf(b.role);
    });

    var pack = langPack(ctx, lang) || langPack(ctx, "en");
    var tmpl = (pack && pack.sentence_template) ||
      "{" + order.join("} {") + "} will be assessed as {sentenceRole}.";
    var roleText = (pack && pack.sentenceRoles && pack.sentenceRoles[instance.sentenceRole]) ||
      instance.sentenceRole || "an analysis";

    // Build the render sequence from the sentence template.
    var parts = [];
    tmpl.split(/(\{[a-zA-Z_]+\})/).forEach(function (seg) {
      if (!seg) return;
      var tok = seg.match(/^\{([a-zA-Z_]+)\}$/);
      if (!tok) { parts.push({ type: "text", text: seg, frame: true }); return; }
      if (tok[1] === "sentenceRole") { parts.push({ type: "text", text: roleText, frame: true }); return; }
      if (order.indexOf(tok[1]) === -1) { parts.push({ type: "text", text: seg, frame: true }); return; }
      resolved.forEach(function (rp, i) {
        if (rp.role !== tok[1]) return;
        if (parts.length && parts[parts.length - 1].type === "phrase") {
          parts.push({ type: "text", text: " ", frame: false });
        }
        parts.push({ type: "phrase", phrase: rp });
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
    norm.forEach(function (p) { if (p.type === "text") p.text = p.text.replace(/\s+/g, " "); });
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
    return pi.bindings[phName].concept || pi.bindings[phName].method || pi.bindings[phName].value || null;
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

  function buildTrace(ctx, instance, role) {
    var tplChain = ctx.graph.traceTemplates[role];
    if (!tplChain) return null;

    var bound = boundConcepts(ctx, instance);

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
        attrs.push(slot + '="' + (b.concept || b.method || b.value) + '"');
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
        else b = { concept: raw };
        if (renders[ph.name]) {
          if (ph.render_options && ph.render_options.indexOf(renders[ph.name]) === -1) {
            findings.push({ level: "error", message: def.oid + ": render mode '" + renders[ph.name] + "' not in " + JSON.stringify(ph.render_options) });
          } else {
            b.render = renders[ph.name];
          }
        }
        var check = resolveBinding(ctx, ph, b);
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

    var patch = null;
    if (!findings.some(function (f) { return f.level === "error"; })) {
      patch = Object.assign({}, baseInstance, { template: analysisRef, phrases: phrases });
    }
    return { instancePatch: patch, findings: findings };
  }

  // ---------- JSON-LD projection -------------------------------------------

  function toJSONLD(ctx, instance) {
    var tpl = templateDef(ctx, instance.template);
    var m = tpl ? method(ctx, tpl.usesMethod) : null;
    // The rendered sentence per available language, as language-tagged
    // literals — the RDF-native localisation mechanism.
    var resolvesTo = ctx.i18n
      ? availableLangs(ctx).map(function (l) {
          return { "@value": resolveInstance(ctx, instance, l).sentence, "@language": l };
        })
      : resolveInstance(ctx, instance).sentence;

    var phraseNodes = instance.phrases.map(function (pi, i) {
      var def = phraseDef(ctx, pi.phrase);
      var node = {
        "@id": "#p" + (i + 1),
        "@type": "acdc:SmartPhraseInstance",
        "sp:phrase": pi.phrase,
        "sp:role": def ? def.role : null
      };
      var bnodes = [];
      Object.keys(pi.bindings).forEach(function (slot) {
        var b = pi.bindings[slot];
        if (b.value !== undefined) {
          bnodes.push({ "sp:slot": slot, "sp:value": b.value });
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

    return {
      "@context": Object.assign({
        sp: "https://w3id.org/cdisc/ac-dc/smartphrase/",
        rdfs: "http://www.w3.org/2000/01/rdf-schema#"
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
      "ars:analysis": instance.arsAnalysis && { "@id": instance.arsAnalysis.iri },
      "sp:hasPhraseInstance": phraseNodes,
      "sp:resolvesTo": resolvesTo
    };
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
    resolveInstance: resolveInstance,
    constructModelView: constructModelView,
    buildTrace: buildTrace,
    toMacroText: toMacroText,
    parseMacroText: parseMacroText,
    toJSONLD: toJSONLD
  };
})(__ns);

/* ES-module surface. The engine body above is a verbatim copy of
   smartphrase/demo/engine.js. The wrapper differs: g is bound to the private
   namespace __ns instead of window/globalThis, which stops the module
   polluting the global scope.

   This creates one deliberate divergence: ctxOf(lib, graph, i18n, proposed)
   has a fallback `proposed || g.ACDC_LIBRARY_PROPOSED || null;`. In the
   browser IIFE, g.ACDC_LIBRARY_PROPOSED is available. In this module, g is
   __ns and will never carry that global — the fallback is unreachable.

   Consequence: callers omitting the 4th argument silently receive a context
   with no proposed entities and no error. Always pass proposed explicitly:
   ctxOf(lib, graph, i18n, ACDC_LIBRARY_PROPOSED).

   scripts/verify_smartphrase_engine.mjs reproduces all 69 goldens, passing
   proposed explicitly to exercise the intended call signature. */
export default __ns.SP_ENGINE;
export const {
  availableLangs, langPack, ctxOf, phraseDef, templateDef, concept, method,
  resolvePhrase, resolveInstance, constructModelView, buildTrace,
  toMacroText, parseMacroText, toJSONLD
} = __ns.SP_ENGINE;
