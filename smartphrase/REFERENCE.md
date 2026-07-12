# Smartphrase layer — reference guide

> Normative for the issue #9 PoC as implemented on this branch. Library structures are those of the
> **AC/DC Transformation Library v0.7** (`methods_02`); engine behaviour is that of
> [`demo/engine.js`](demo/engine.js). Sections marked *(PoC)* describe choices local to this
> implementation that a production version may generalise.

## Contents

1. [Terminology](#1-terminology)
2. [Library layer](#2-library-layer)
3. [Study layer](#3-study-layer)
4. [Render modes](#4-render-modes)
5. [Resolution: model → SAP](#5-resolution-model--sap)
6. [Instantiation: SAP → model](#6-instantiation-sap--model)
7. [Data trace](#7-data-trace)
8. [The `acdc:macro` tag dialect](#8-the-acdcmacro-tag-dialect)
9. [JSON-LD projection](#9-json-ld-projection)
10. [Engine API](#10-engine-api)
11. [Identifier policy](#11-identifier-policy)
12. [Errors and findings](#12-errors-and-findings)

---

## 1. Terminology

| Term | Meaning |
|---|---|
| **smartphrase** | A library-owned, reusable sentence fragment with typed placeholders, playing one *role* (e.g. `SP_CFB_ENDPOINT`, "change from baseline in {parameter}"). |
| **role** | The linguistic/semantic function of a phrase within an analysis sentence (`endpoint`, `timepoint`, `population`, …). Roles define assembly order. |
| **placeholder** | A typed hole in a phrase template (`{parameter}`), bound per instance. |
| **binding** | A study-specific value for one placeholder: a concept reference, a method reference, or a literal value, optionally with a render mode. |
| **phrase instance** | One use of a smartphrase inside an analysis instance: `{ phrase: <oid>, bindings: {...} }`. |
| **analysis instance** | The single stored state object for one analysis passage: which transformation template, plus its phrase instances. Everything else is a projection of it. |
| **transformation template** | A library analysis/derivation building block (`T.CFB_ANCOVA`). Declares `validSmartPhrases` and how bindings resolve its data cube (`sliceKeys`, slices). |
| **concept registry** | The study's bindable entities (parameters, visits, populations, treatments), each with display labels, a grounding IRI, and data-trace hooks. |
| **anchors** | A phrase's links into the model (`produced_concept`, `uses_method`) — what connects prose to derivations, methods and the trace. |
| **sentence frame** | Document text around the assembled phrases ("… will be assessed as the primary analysis."). Owned by the renderer/document, **not** a smartphrase. |

## 2. Library layer

Source of truth: `methods_02` — `lib/transformations/ACDC_Transformation_Library_v07.json`,
`lib/methods/**/M_*.json`. The demo carries a generated verbatim subset
(`demo/data/acdc-library.js`, provenance in-file).

### 2.1 SmartPhrase definition

```jsonc
{
  "oid": "SP_CFB_ENDPOINT",              // stable identifier; instances bind by oid
  "name": "Change from baseline endpoint",
  "role": "endpoint",                    // must be a key of roleDefinitions.roles
  "phrase_template": "change from baseline in {parameter}",
  "anchors": {                           // model linkage (both optional)
    "produced_concept": "Change",        //   data concept the phrase is about
    "uses_method": "M.ANCOVA"            //   method the phrase implies (method phrases)
  },
  "placeholders": [ /* see 2.2 */ ]
}
```

### 2.2 Placeholder definition

Common fields:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | The `{token}` in the template. |
| `kind` | `"concept_ref"` \| `"method_ref"` \| `"value"` | What a binding must supply. |
| `required` | boolean | Unbound required placeholders are resolution errors. |
| `render_options` | string[] | Legal render modes (§4). Absent for `value` kinds. |
| `default_render` | string | Used when a binding has no `render`. |

Kind-specific fields:

| Kind | Fields | Validation applied to a binding |
|---|---|---|
| `concept_ref` | `concept_class`, `concept_constraint` (registry `kind` must equal it), `concept_category` (registry `conceptCategory` must equal it), `value_source` | concept must exist in the registry and satisfy constraint/category |
| `method_ref` | `intent_constraint`, `value_source` | method must exist in the library |
| `value` | `datatype`, `constraint: { min, max }` | numeric value must lie within `[min, max]` |

### 2.3 Role definitions

```jsonc
"roleDefinitions": {
  "order": ["endpoint","parameter","timepoint","population",
            "grouping","method","method_qualifier","covariate"],
  "roles": { "endpoint": { "label": "Endpoint Type", "contextSource": "endpoint" }, ... }
}
```

`order` is the sentence-assembly order (§5). `contextSource` classifies whether the role's value
typically comes from an endpoint specification (`"endpoint"`) or a direct user choice (`"manual"`).

### 2.4 Transformation template (fields the smartphrase layer uses)

| Field | Use in this layer |
|---|---|
| `conceptId` | Referenced by `instance.template`. |
| `usesMethod` | Resolved to the method definition (formula, configurations). |
| `validSmartPhrases` | The complete legal phrase set for instances of this template — enforced by editors and by the dialect validator. |
| `sliceKeys` | `[{ dimension, source }]` — which bound concepts key the analysis cube (§6). |
| `inputDataStructure.slices[].constraints[].value` | May contain `{placeholder}` tokens (`{parameter}`, `{visit}`, `{baseline_visit}`, `{population}`) substituted at instantiation (§6). |
| `methodConfigurations` | Template-fixed method configuration, merged into `configurationValues` (§6). |
| `outputDataStructure.measures` | Reported as the instance's output measures (§6). |

### 2.5 configurationOptions

Library-level enumerations for `value`-kind placeholders sharing a name, e.g.
`configurationOptions.conf_level = { values: ["90","95","97.5","99"], default: "95" }`.
*(PoC)* editors use these to populate pickers; the engine validates only against the placeholder's
own `constraint`.

## 3. Study layer

Source in the demo: `demo/data/study-graph.js` (illustrative). In production this layer comes from
study metadata (USDM study design, ARS analysis set).

### 3.1 Concept registry entry

```jsonc
"PARAM.ADASCOG11": {
  "kind": "Parameter",                    // matched against concept_constraint
  "conceptCategory": "ParameterDimension",// matched against concept_category
  "label": "ADAS-Cog(11)",                // short display form
  "name": "Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items)",
  "iri": "ncit:C168804",                  // grounding IRI (CURIE against §11 prefixes)
  "iri_status": "illustrative",           // "authoritative" | "illustrative"
  "data": {                               // trace hooks (§7) — shape varies by kind:
    "dataset": "ADQSADAS", "file": "adqsadas.xpt", "paramcd": "ACTOT",
    "datasetLabel": "ADaM ADAS-Cog analysis dataset"
  }
}
```

`data` hooks by kind: Parameter → `dataset`, `datasetLabel`, `file`, `paramcd`; Timepoint →
`avisitn`; Population → `flag`; Treatment → `variable`.

### 3.2 Analysis instance (the shared state)

```jsonc
{
  "id": "AC.PRIMARY.ADASCOG",
  "iri": "acdc:instance/AC-PRIMARY-ADASCOG",
  "label": "Primary efficacy analysis",
  "template": "T.CFB_ANCOVA",
  "usdmObjective": { "iri": "...", "iri_status": "...", "text": "..." },
  "arsAnalysis":   { "iri": "...", "iri_status": "..." },
  "sentenceRole": "the primary analysis",   // consumed by the sentence frame, not by a phrase
  "baselineVisit": "VISIT.BASELINE",        // feeds the {baseline_visit} slice token
  "phrases": [
    { "phrase": "SP_CFB_ENDPOINT",
      "bindings": { "parameter": { "concept": "PARAM.ADASCOG11", "render": "name_with_label" } } },
    { "phrase": "SP_CONFIDENCE_LEVEL",
      "bindings": { "conf_level": { "value": "95" } } },
    { "phrase": "SP_METHOD_ANCOVA",
      "bindings": { "method": { "method": "M.ANCOVA", "render": "label" } } }
  ]
}
```

A binding object has exactly one of `concept` / `method` / `value`, plus optional `render`.
Phrase array order is irrelevant (§5 orders by role).

## 4. Render modes

Render modes select the display form of a bound entity (registry concept or method):

| Mode | Output | Example (`PARAM.ADASCOG11`) |
|---|---|---|
| `label` | `entity.label` | ADAS-Cog(11) |
| `name` | `entity.name` | Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items) |
| `name_with_label` | `name + " (" + label + ")"` | Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items) (ADAS-Cog(11)) |

Precedence: `binding.render` → `placeholder.default_render` → `"label"` (concepts) / `"name"`
(methods). A `render` not listed in the placeholder's `render_options` is rejected by the dialect
validator; *(PoC)* direct state edits are not re-checked against `render_options`.

## 5. Resolution: model → SAP

`resolveInstance(ctx, instance)` performs, per phrase instance:

1. Look up the phrase definition by oid. Unknown oid → error, placeholder text `⟨OID?⟩`.
2. For each placeholder: find the binding by name.
   - Missing + required → error; the token renders as `⟨name?⟩`.
   - Missing + optional → the token is left unsubstituted *(v0.7 defines no optional placeholders;
     this path is theoretical)*.
   - Present → validate (§2.2) and substitute the rendered text (§4).
3. Sort resolved phrases by `roleDefinitions.order` (stable within a role).
4. Join phrase texts with single spaces; capitalise the first character; append the sentence frame:
   `" will be assessed as " + (instance.sentenceRole || "an analysis") + "."`.

Returns `{ phrases, sentence, errors }`; `phrases[i]` = `{ oid, role, name, template, anchors, text,
bindings[], errors[] }` where `bindings[i].detail` carries `{ kind, id, render, iri, iri_status }`
(and `formula` for methods) — everything an inspection UI needs.

The sentence frame and capitalisation are **renderer concerns**: phrase templates are lower-case,
position-independent fragments by design.

## 6. Instantiation: SAP → model

`constructModelView(ctx, instance)` builds the eSAP-style study model view:

1. Copy identity from the template: `conceptId`, `label`, `transformationType`, library provenance.
2. Resolve the method (`usesMethod`) with its generic formula expression.
3. Read the key bindings *(PoC: keyed by well-known phrase oids — `SP_CFB_ENDPOINT.parameter`,
   `SP_TIMEPOINT.visit`, `SP_POPULATION.population`; a production version would key by
   `sliceKeys[].source`)*.
4. Fill `sliceKeys[].value` with `{ concept, label, iri }` per dimension
   (ParameterDimension ← parameter, VisitDimension ← visit, Population ← population).
5. Substitute slice-constraint tokens: `{parameter}` → parameter label, `{visit}` → visit label,
   `{baseline_visit}` → label of `instance.baselineVisit`, `{population}` → population name.
6. Collect `configurationValues`: template `methodConfigurations` (tagged `from: "template"`), plus
   `alpha = 1 − conf_level/100` when `SP_CONFIDENCE_LEVEL` is present (tagged
   `from: "SP_CONFIDENCE_LEVEL"`).
7. Build `resolvedExpression` from phrase presence: `CHG ~ TRTP` (+ ` + BASE` if
   `SP_COVARIATE_BASELINE`) (+ ` + SITEGR1` if `SP_COVARIATE_SITE`) *(PoC: study-variable names are
   fixed for the CFB/ANCOVA family)*.
8. Report `outputMeasures`, `usdmObjective`, `arsAnalysis`, and the template's `validSmartPhrases`.

## 7. Data trace

`buildTrace(ctx, instance, role)` returns a four-tier chain for a phrase role, or `null` for roles
without a chain. Chains are defined per role in `STUDY_GRAPH.traceTemplates`
(roles: `endpoint`, `covariate`, `timepoint`, `grouping`, `population`); tiers:

```
DataConcept → ADaM Class Variable → Study variable (with where-clause) → Physical dataset (.xpt)
```

Every string field of every tier may contain tokens, substituted from the **live instance**
(the trace follows edits):

| Token | Source |
|---|---|
| `{dataset}` `{datasetLabel}` `{file}` `{paramcd}` | endpoint parameter concept's `data` |
| `{paramLabel}` | endpoint parameter concept's `label` |
| `{avisitn}` `{visitLabel}` | timepoint concept's `data.avisitn` / `label` |
| `{flag}` `{popName}` | population concept's `data.flag` / `name` |

Example (primary instance, `endpoint`):
`DC.CHG → CHG (BDS) → ADQSADAS.CHG where PARAMCD = 'ACTOT' AND AVISITN = 24 → adqsadas.xpt`.

## 8. The `acdc:macro` tag dialect

The text-shaped authoring surface (adopted from the `methods_02` authoring experiment; revisable).
One analysis wrapper, one self-closing tag per phrase instance:

```xml
<acdc:macro id="analysis" ref="T.CFB_ANCOVA" instance="AC.PRIMARY.ADASCOG">
  <acdc:macro id="phrase" ref="SP_CFB_ENDPOINT" instance="p1"
              parameter="PARAM.ADASCOG11" render="parameter:name_with_label"/>
  <acdc:macro id="phrase" ref="SP_CONFIDENCE_LEVEL" instance="p6" conf_level="95"/>
</acdc:macro>
```

### 8.1 Grammar (attributes)

| Attribute | On | Meaning |
|---|---|---|
| `id` | both | `"analysis"` (wrapper) or `"phrase"`. |
| `ref` | both | Template `conceptId` / phrase `oid`. |
| `instance` | both | Local identifier; informational — not used by the parser. |
| `of` | phrase | Reserved (cross-reference to another instance); accepted and ignored *(PoC)*. |
| *`<slotName>`* | phrase | One attribute per placeholder, value = concept id, method id, or literal. |
| `render` | phrase | Comma-separated `slot:mode` pairs, e.g. `render="parameter:label,visit:name"`. |

Tag order is not significant (§5 orders by role). Emission (`toMacroText`) is deterministic:
wrapper, then phrases in state order, `p1…pn` instance numbering.

### 8.2 Validation (two passes)

Pass 1 — syntax and reference resolution; pass 2 — semantic validation against the template.
All findings are collected (not fail-fast):

| Check | Level |
|---|---|
| Wrapper present; wrapper `ref` is a known template | error |
| Phrase `ref` is a known smartphrase | error |
| Phrase oid ∈ template `validSmartPhrases` | error |
| Every `required` placeholder has an attribute | error |
| Concept/method references resolve; constraint kind/category match; value in range | error |
| `render` mode listed in the placeholder's `render_options` | error |
| Attribute matches no placeholder (and is not `id`/`ref`/`instance`/`of`/`render`) | warning |
| No phrase tags found | error |

**Apply semantics:** `parseMacroText` returns `{ instancePatch, findings }`. `instancePatch` is
non-null **only when no error-level findings exist** (warnings alone do not block); it preserves the
base instance's identity fields (`id`, `iri`, `label`, `sentenceRole`, `baselineVisit`, objective,
ARS ref) and replaces `template` and `phrases`. On error the caller keeps its state untouched.

## 9. JSON-LD projection

`toJSONLD(ctx, instance)` emits one graph fragment:

```jsonc
{
  "@context": { /* §11 prefixes + sp: + rdfs: */ },
  "@id": "acdc:instance/AC-PRIMARY-ADASCOG",
  "@type": "acdc:AnalysisConcept",
  "rdfs:label": "Primary efficacy analysis",
  "acdc:instantiates": { "@id": "acdc:template/T.CFB_ANCOVA" },
  "acdc:usesMethod": { "@id": "ars:method/MTH-ANCOVA-CFB", "rdfs:label": "ANCOVA",
                       "acdc:alignedTo": { "@id": "stato:STATO_0000176" } },
  "usdm:objective": { "@id": "usdm:Objective/OBJ-PRIMARY-1", "rdfs:comment": "..." },
  "ars:analysis": { "@id": "ars:analysis/AN-3.02.01" },
  "sp:hasPhraseInstance": [{
    "@id": "#p1", "@type": "acdc:SmartPhraseInstance",
    "sp:phrase": "SP_CFB_ENDPOINT", "sp:role": "endpoint",
    "sp:binding": [{ "sp:slot": "parameter", "@id": "ncit:C168804",
                     "rdfs:label": "ADAS-Cog(11)", "sp:render": "name_with_label" }]
  }],
  "sp:resolvesTo": "Change from baseline in … will be assessed as the primary analysis."
}
```

Phrase-instance node ids (`#p1`…) double as the **span anchors**: a carrier document marks each
phrase span with a reference to its node (the standoff link). `sp:resolvesTo` records the rendered
sentence for round-trip checking; it is derived data, never an input. *(PoC)* the `@context` is
hand-written; the intended source is the context emitted by the AC/DC LinkML model.

## 10. Engine API

All functions are pure; `ctx = SP_ENGINE.ctxOf(library, studyGraph)` is the first argument
throughout. Loading `engine.js` defines `SP_ENGINE` on `window`/`globalThis`.

| Function | Returns |
|---|---|
| `ctxOf(lib, graph)` | Context object for all other calls. |
| `phraseDef(ctx, oid)` | SmartPhrase definition or `null`. |
| `templateDef(ctx, conceptId)` | Transformation template or `null`. |
| `concept(ctx, id)` | Registry entry or `null`. |
| `method(ctx, id)` | Merged method view `{ conceptId, label, name, formula, configurations, iri, iri_status, ars, ars_status }` or `null`. |
| `resolvePhrase(ctx, phraseInstance)` | `{ oid, role, name, template, anchors, text, bindings[], errors[] }` (§5). |
| `resolveInstance(ctx, instance)` | `{ phrases[], sentence, errors[] }` (§5). |
| `constructModelView(ctx, instance)` | eSAP-style study model view (§6). |
| `buildTrace(ctx, instance, role)` | Array of trace tiers, or `null` (§7). |
| `toMacroText(ctx, instance)` | Dialect text (§8). |
| `parseMacroText(ctx, text, baseInstance)` | `{ instancePatch \| null, findings[] }` (§8.2). |
| `toJSONLD(ctx, instance)` | JSON-LD graph fragment (§9). |

## 11. Identifier policy

Identifiers resolve into an existing standard wherever one covers the entity; AC/DC ids cover only
what is genuinely new. Every IRI carries a status (`authoritative` — registered in the target
standard; `illustrative` — the intended grounding, id not yet registered), and UIs must surface it.

| Prefix | Expansion | Used for |
|---|---|---|
| `usdm:` | `https://ddf.cdisc.org/usdm/v4/` | Study structure: objectives, populations, visits, arms |
| `ars:` | `https://www.cdisc.org/standards/foundational/ars/1-0/` | Analysis and method definitions |
| `stato:` | `http://purl.obolibrary.org/obo/` | Statistical methods (e.g. `STATO_0000176` = ANCOVA) |
| `ncit:` | `http://purl.obolibrary.org/obo/NCIT_` | Terminology (endpoints, parameters) |
| `qb:` | `http://purl.org/linked-data/cube#` | Data-cube vocabulary (via the library's DSDs) |
| `acdc:` | `https://w3id.org/cdisc/ac-dc/` | Templates, phrase library, instances, data concepts |

## 12. Errors and findings

Resolution errors (strings, in `errors[]`):

| Condition | Message shape |
|---|---|
| Unknown phrase oid | `unknown smartphrase 'X'` |
| Required placeholder unbound | `no binding for required placeholder 'name'` |
| Unknown concept / method | `unknown concept 'X'` / `unknown method 'X'` |
| Constraint-kind mismatch | `concept 'X' has kind K, placeholder 'name' requires C` |
| Category mismatch | `concept 'X' is not in category C` |
| Value out of range | `value V outside constraint [min, max] for 'name'` |

Erroneous tokens render as `⟨name?⟩` in prose, so incompleteness is visible, never silent.

Dialect findings (objects `{ level: "error" | "warning", message }`) are listed in §8.2; parsing is
collect-all, and any error-level finding prevents the instance patch from being produced.
