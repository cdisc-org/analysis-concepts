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

  function ctxOf(lib, graph) {
    return { lib: lib, graph: graph };
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
  function resolveBinding(ctx, ph, binding) {
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
    return { text: renderEntity(c, cmode),
             detail: { kind: "concept", id: binding.concept, render: cmode,
                       iri: c.iri, iri_status: c.iri_status } };
  }

  /* Resolve one phrase instance → { oid, role, text, bindings[], errors[] } */
  function resolvePhrase(ctx, pi) {
    var def = phraseDef(ctx, pi.phrase);
    if (!def) return { oid: pi.phrase, errors: ["unknown smartphrase '" + pi.phrase + "'"], text: "⟨" + pi.phrase + "?⟩" };
    var text = def.phrase_template;
    var errors = [];
    var bindings = [];
    (def.placeholders || []).forEach(function (ph) {
      var b = (pi.bindings || {})[ph.name];
      if (!b && !ph.required) return;
      var r = resolveBinding(ctx, ph, b);
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
             text: text, bindings: bindings, errors: errors };
  }

  /*
   * Resolve a whole instance → ordered phrases + assembled sentence.
   * Phrase order comes from the library's roleDefinitions.order.
   */
  function resolveInstance(ctx, instance) {
    var order = ctx.lib.roleDefinitions.order;
    var resolved = instance.phrases.map(function (pi) { return resolvePhrase(ctx, pi); });
    resolved.sort(function (a, b) {
      return order.indexOf(a.role) - order.indexOf(b.role);
    });
    var body = resolved.map(function (r) { return r.text; }).join(" ");
    var sentence = body.charAt(0).toUpperCase() + body.slice(1) +
      " will be assessed as " + (instance.sentenceRole || "an analysis") + ".";
    var errors = resolved.reduce(function (acc, r) { return acc.concat(r.errors || []); }, []);
    return { phrases: resolved, sentence: sentence, errors: errors };
  }

  // ---------- SAP → model: the constructed instance view ------------------

  function bindingConceptId(instance, phraseOid, phName) {
    var pi = instance.phrases.find(function (p) { return p.phrase === phraseOid; });
    if (!pi || !pi.bindings[phName]) return null;
    return pi.bindings[phName].concept || pi.bindings[phName].method || pi.bindings[phName].value || null;
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

    var paramId = bindingConceptId(instance, "SP_CFB_ENDPOINT", "parameter");
    var visitId = bindingConceptId(instance, "SP_TIMEPOINT", "visit");
    var popId = bindingConceptId(instance, "SP_POPULATION", "population");
    var param = paramId ? concept(ctx, paramId) : null;
    var visit = visitId ? concept(ctx, visitId) : null;
    var pop = popId ? concept(ctx, popId) : null;
    var baseVisit = concept(ctx, instance.baselineVisit);

    var subst = {
      "{parameter}": param ? param.label : "⟨parameter⟩",
      "{visit}": visit ? visit.label : "⟨visit⟩",
      "{baseline_visit}": baseVisit ? baseVisit.label : "⟨baseline_visit⟩",
      "{population}": pop ? pop.name : "⟨population⟩"
    };
    function fill(s) {
      return Object.keys(subst).reduce(function (acc, k) { return acc.split(k).join(subst[k]); }, s);
    }

    var sliceKeys = (tpl.sliceKeys || []).map(function (sk) {
      var value =
        sk.dimension === "ParameterDimension" ? (param && { concept: paramId, label: param.label, iri: param.iri }) :
        sk.dimension === "VisitDimension" ? (visit && { concept: visitId, label: visit.label, iri: visit.iri }) :
        sk.dimension === "Population" ? (pop && { concept: popId, label: pop.name, iri: pop.iri }) : null;
      return { dimension: sk.dimension, source: sk.source, value: value };
    });

    var slices = ((tpl.inputDataStructure || {}).slices || []).map(function (sl) {
      return {
        name: sl.name,
        constraints: sl.constraints.map(function (c) {
          return { dimension: c.dimension, value: fill(c.value) };
        })
      };
    });

    var hasConf = instance.phrases.some(function (p) { return p.phrase === "SP_CONFIDENCE_LEVEL"; });
    var confLevel = hasConf ? bindingConceptId(instance, "SP_CONFIDENCE_LEVEL", "conf_level") : null;
    var hasSite = instance.phrases.some(function (p) { return p.phrase === "SP_COVARIATE_SITE"; });
    var hasBaseCov = instance.phrases.some(function (p) { return p.phrase === "SP_COVARIATE_BASELINE"; });

    var configurationValues = (tpl.methodConfigurations || []).map(function (mc) {
      return { configurationName: mc.configurationName, value: mc.value, from: "template" };
    });
    if (confLevel) {
      configurationValues.push({ configurationName: "alpha", value: String(1 - Number(confLevel) / 100), from: "SP_CONFIDENCE_LEVEL" });
    }

    var terms = ["TRTP"];
    if (hasBaseCov) terms.push("BASE");
    if (hasSite) terms.push("SITEGR1");
    var resolvedExpression = "CHG ~ " + terms.join(" + ");

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

    var paramId = bindingConceptId(instance, "SP_CFB_ENDPOINT", "parameter");
    var visitId = bindingConceptId(instance, "SP_TIMEPOINT", "visit");
    var popId = bindingConceptId(instance, "SP_POPULATION", "population");
    var param = paramId ? concept(ctx, paramId) : null;
    var visit = visitId ? concept(ctx, visitId) : null;
    var pop = popId ? concept(ctx, popId) : null;

    var tokens = {
      "{dataset}": param && param.data ? param.data.dataset : "⟨dataset⟩",
      "{datasetLabel}": param && param.data ? param.data.datasetLabel : "⟨dataset⟩",
      "{file}": param && param.data ? param.data.file : "⟨file⟩",
      "{paramcd}": param && param.data ? param.data.paramcd : "⟨paramcd⟩",
      "{paramLabel}": param ? param.label : "⟨parameter⟩",
      "{avisitn}": visit && visit.data ? String(visit.data.avisitn) : "⟨avisitn⟩",
      "{visitLabel}": visit ? visit.label : "⟨visit⟩",
      "{flag}": pop && pop.data ? pop.data.flag : "⟨flag⟩",
      "{popName}": pop ? pop.name : "⟨population⟩"
    };
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
    var resolved = resolveInstance(ctx, instance);

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
      "sp:resolvesTo": resolved.sentence
    };
  }

  g.SP_ENGINE = {
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
})(typeof window !== "undefined" ? window : globalThis);
