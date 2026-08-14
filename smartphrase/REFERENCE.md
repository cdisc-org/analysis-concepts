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
12. [Tooling](#12-tooling-poc)
13. [Errors and findings](#13-errors-and-findings)

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
| **sentence frame** | Literal text around and between the assembled phrases ("… will be assessed as the primary analysis."). Owned by the language's sentence template, **not** a smartphrase. |
| **language pack** | Per-language rendering assets: a sentence template (word order), phrase-template translations, and label overlays (§5.1). The instance itself is language-neutral. |

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
| `kind` | `"concept_ref"` \| `"method_ref"` \| `"output_ref"` \| `"value"` | What a binding must supply. |
| `required` | boolean | Unbound required placeholders are resolution errors. |
| `render_options` | string[] | Legal render modes (§4). Absent for `value` kinds. |
| `default_render` | string | Used when a binding has no `render`. |

Kind-specific fields:

| Kind | Fields | Validation applied to a binding |
|---|---|---|
| `concept_ref` | `concept_class`, `concept_constraint` (registry `kind` must equal it), `concept_category` (registry `conceptCategory` must equal it), `value_source` | concept must exist in the registry and satisfy constraint/category |
| `method_ref` | `intent_constraint`, `value_source` | method must exist in the library |
| `output_ref` | `value_source` | the named output class must exist in `lib.outputClasses` **and** appear in both the active template's `outputDataStructure.measures` and the bound method's `outputs[]` |
| `value` | `datatype`, `constraint: { min, max }` | numeric value must lie within `[min, max]` |

`output_ref` is how ICH E9(R1) attribute 5 stays verifiable: a summary measure the bound method cannot
produce is a resolution error, not a mismatch nobody notices. Both lists are checked because neither alone
is authoritative — a template may declare a subset of what its method emits. Validation needs the active
template, so `resolvePhrase`/`resolveBinding` take it as an optional trailing argument (§10).

A `concept_ref` bound to an `IntercurrentEvent` gets one further check, driven by the phrase's
`anchors.icheStrategy`: the event must declare an `implementedBy` entry for that strategy (§3.1).

### 2.3 Role definitions

```jsonc
"roleDefinitions": {
  "order": ["endpoint","parameter","timepoint","population",
            "grouping","method","method_qualifier","covariate"],
  "roles": { "endpoint": { "label": "Endpoint Type", "contextSource": "endpoint" }, ... }
}
```

`order` is the tie-break order for phrases sharing a role, and the fallback assembly order when no
language pack exists (§5); actual word order is owned by the pack's `sentence_template`. Role order also
sets **token precedence** for slice-constraint substitution and trace fill (§7), which is why an
endpoint-role binding wins over a covariate binding on the same slot name.

`contextSource` classifies whether the role's value typically comes from an endpoint specification
(`"endpoint"`) or a direct user choice (`"manual"`). `repeating: true` marks a role that may appear more
than once in one instance (`covariate`, `ice_handling`).

**Proposed roles arrive through the overlay** (§12), which must declare `order_after` — the existing role
the new one follows, or `"last"`. `ctxOf` splices rather than appends, and appending would be wrong:
`ice_handling` must precede `method`. The merged order is:

```
endpoint · parameter · timepoint · population · grouping · ice_handling
        · method · method_qualifier · covariate · summary_measure
```

`ice_handling` (ICH E9(R1) attribute 4) and `summary_measure` (attribute 5) are **proposed**, not upstream
v0.7 — read them off `ctx.lib`, never the raw `ACDC_LIBRARY` global, or the merge is invisible.

### 2.4 Transformation template (fields the smartphrase layer uses)

| Field | Use in this layer |
|---|---|
| `conceptId` | Referenced by `instance.template`. |
| `usesMethod` | Resolved to the method definition (formula, configurations). |
| `validSmartPhrases` | The complete legal phrase set for instances of this template — enforced by editors and by the dialect validator. |
| `sliceKeys` | `[{ dimension, source }]` — which bound concepts key the analysis cube (§6). |
| `inputDataStructure.slices[].constraints[].value` | May contain `{placeholder}` tokens substituted at instantiation (§6). The token set is **open**: any placeholder slot name bound by any of the instance's phrases resolves (`{parameter}`, `{visit}`, `{population}`, `{event}`, …), plus `{baseline_visit}` from `instance.baselineVisit`. |
| `methodConfigurations` | Template-fixed method configuration, merged into `configurationValues` (§6). |
| `outputDataStructure.measures` | Reported as the instance's output measures (§6). Each `output` MUST name a declared output of `usesMethod` — this is the `summarizedByOutputClass` hook, and the verification harness asserts it. |
| `proposed` | *(PoC)* `true` on templates merged from `acdc-library-proposed.js` — additions not yet upstream on `methods_02`. Set by `ctxOf`, never authored by hand. Surfaced as a badge in the demo. |

### 2.5 configurationOptions

Library-level enumerations for `value`-kind placeholders sharing a name, e.g.
`configurationOptions.conf_level = { values: ["90","95","97.5","99"], default: "95" }`.
*(PoC)* editors use these to populate pickers; the engine validates only against the placeholder's
own `constraint`.

## 3. Study layer

Source in the demo: one file per study, each registering itself into `window.STUDY_GRAPHS`
(`demo/data/study-graph.js` → `CDISCPILOT01`, `demo/data/study-graph-pre0102.js` → `PRE0102`); all
illustrative. In production this layer comes from study metadata (USDM study design, ARS analysis set).

A graph is self-contained — `prefixes`, `study`, `concepts`, `methodGrounding`, `instances`,
`traceTemplates` — so switching study is just passing a different graph to `ctxOf`. `window.STUDY_GRAPH`
remains an alias to the first registered study.

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

`data` hooks by kind: Parameter → `dataset`, `datasetLabel`, `file`, `paramcd`; **Event** →
`dataset`, `datasetLabel`, `file`, `paramcd`, `aval`, `cnsr`; Timepoint → `avisitn`; Population →
`flag`; Treatment → `variable`; **IntercurrentEvent** → `dataset`, `datasetLabel`, `file`, `flag`,
`timing`, `bc`, `property`. The set is not fixed — every key becomes a trace token (§7).

`kind: "Event"` with `conceptCategory: "EventDimension"` is what `SP_TTE_ENDPOINT` binds
(`concept_constraint: "Event"`), for time-to-event endpoints.

`kind: "IntercurrentEvent"` is what the five strategy phrases bind. It carries three fields no other kind
has:

```jsonc
"ICE.TRT_DISCONT": {
  "kind": "IntercurrentEvent",
  "label": "treatment discontinuation",
  "name": "discontinuation of study treatment",
  "icheStrategy": "Hypothetical",          // the STUDY-DEFAULT strategy (IntercurrentEvent.icheStrategy)
  "ascertainedBy": {                       // strategy-INDEPENDENT; drives the ICE trace axis (§7)
    "arm": "collected",                    // "collected" | "derived"
    "criteria": [{ "property": "BC_DS_001/Disposition Event",   // BC ▸ property path, BC is the head
                   "operator": "equals",                        // OccurrenceCriterion operator
                   "responseCode": "Treatment Discontinued" }]
  },
  "implementedBy": {                       // keyed by STRATEGY, so a per-estimand override resolves
    "Hypothetical": ["T.LOCF_Imputation"], //   correctly without duplicating the event
    "TreatmentPolicy": []                  // empty is VALID — data used as observed
  }
}
```

An **absent** `implementedBy` key for an asserted strategy is a resolution error: that is prose claiming a
handling the model cannot deliver. An **empty list** is valid only where the phrase's
`anchors.implementation` is `"none"` (TreatmentPolicy).

*(PoC)* concepts may also carry `sapRef`, a quotation of the source SAP sentence the concept was
derived from — provenance for hand-crafted study data, not consumed by the engine.

### 3.2 Analysis instance (the shared state)

```jsonc
{
  "id": "AC.PRIMARY.ADASCOG",
  "iri": "acdc:instance/AC-PRIMARY-ADASCOG",
  "label": "Primary efficacy analysis",
  "template": "T.CFB_ANCOVA",
  "usdmObjective": { "iri": "...", "iri_status": "...", "text": "..." },
  "arsAnalysis":   { "iri": "...", "iri_status": "..." },
  "estimand": {                             // ICH E9(R1); instance-level, NOT a phrase
    "id": "EST.PRIMARY", "iri": "usdm:Estimand/...", "iri_status": "illustrative",
    "label": "Primary estimand — ADAS-Cog(11) change at Week 24",
    "rank": "primary"                       // needed to RENDER sentenceRole — see below
  },
  "analysisRole": "MainEstimator",          // Analysis.analysisRole; exactly one per estimand
  "sentenceRole": "the primary analysis",   // consumed by the sentence frame, not by a phrase
  "baselineVisit": "VISIT.BASELINE",        // feeds the {baseline_visit} slice token
  "phrases": [
    { "phrase": "SP_CFB_ENDPOINT",
      "bindings": { "parameter": { "concept": "PARAM.ADASCOG11", "render": "name_with_label" } } },
    { "phrase": "SP_CONFIDENCE_LEVEL",
      "bindings": { "conf_level": { "value": "95" } } },
    { "phrase": "SP_METHOD_ANCOVA",
      "bindings": { "method": { "method": "M.ANCOVA", "render": "label" } } },
    { "phrase": "SP_ICE_HYPOTHETICAL",
      "bindings": { "ice": { "concept": "ICE.TRT_DISCONT", "render": "name" } } },
    { "phrase": "SP_SUMMARY_MEASURE",
      "bindings": { "summary": { "output": "contrasts_t" } } }
  ]
}
```

A binding object has exactly one of `concept` / `method` / `value` / `output`, plus optional `render`.
Phrase array order is irrelevant (§5 orders by role). The **same phrase OID may appear more than once**
in one instance when its role is `repeating` — two `SP_ICE_TREATMENT_POLICY` entries bound to different
events is the normal way to handle two ICEs the same way.

`analysisRole` is **additional to** `sentenceRole`, not a replacement for it. `AnalysisRole` is defined per
estimand, so *"a secondary analysis"* is the `MainEstimator` **of a secondary estimand** — the display
string needs `estimand.rank` as well as the role, and so cannot be derived from the enum alone. The engine
validates the pair instead (exactly one `MainEstimator` per estimand) rather than deriving one from the
other. See DESIGN.md D15.

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

`resolveInstance(ctx, instance, lang="en")` performs, per phrase instance:

1. Look up the phrase definition by oid. Unknown oid → error, placeholder text `⟨OID?⟩`.
2. Select the phrase template: the language pack's `phrases[oid]` if present, else the library's
   English `phrase_template` (the result carries `langFallback: true` when a non-English render fell
   back).
3. For each placeholder: find the binding by name.
   - Missing + required → error; the token renders as `⟨name?⟩`.
   - Missing + optional → the token is left unsubstituted *(v0.7 defines no optional placeholders;
     this path is theoretical)*.
   - Present → validate (§2.2) and substitute the rendered text (§4), using language-overlaid
     labels/names where the pack provides them (§5.1).
4. Sort resolved phrases by `roleDefinitions.order` (stable within a role).
5. Assemble the sentence through the language's **sentence template** (§5.1): each `{role}` token is
   filled with that role's resolved phrase texts, `{sentenceRole}` with the localised sentence role,
   literal segments pass through as frame text. Phrases sharing a role are joined by the pack's
   `role_conjunctions[role]` if it declares one, else a single space. `[ … ]` marks an **optional
   group**, emitted only if at least one role token inside it resolves to a phrase — so punctuation
   belonging to an optional clause vanishes with the clause instead of stranding a comma. Empty roles
   collapse (whitespace normalised, and whitespace before `,` `;` `.` removed); the first character is
   capitalised. With no language packs at all, a default template concatenating every role in
   `roleDefinitions.order` plus the English frame is used — reproducing plain-English assembly exactly.

Returns `{ phrases, parts, sentence, errors, lang }`:

- `phrases[i]` = `{ oid, role, name, template, anchors, text, bindings[], errors[], langFallback }`
  where `bindings[i].detail` carries `{ kind, id, render, iri, iri_status }` (plus `formula` for
  methods, and `statistics` + `libraryLabel` for outputs) — everything an inspection UI needs.
  `libraryLabel` is the **upstream** output-class label, kept alongside the localised prose so a UI can
  show both: the library's labels are analyst-facing (*"T-based contrasts"*) where document prose needs a
  different register (*"the difference in least-squares means"*). See DESIGN.md D14.
- `parts` is the ordered render sequence a prose surface should consume:
  `{ type: "phrase", phrase: <resolved> }` for chips and `{ type: "text", text, frame }` for
  inter-phrase spacing (`frame: false`) and sentence-template literals (`frame: true`). This matters
  for languages where frame text sits *between* phrases (the German verb bracket), where a
  chips-then-suffix rendering would be wrong.

Sentence frames, word order and capitalisation are **renderer concerns**, owned by the language's
sentence template: phrase templates are lower-case, position-independent fragments by design.

### 5.1 Language packs

Localisation assets live outside both the library and the instance (demo:
`demo/data/lang-overlay.js`, passed as `ctxOf`'s third argument). The analysis instance is
language-neutral; the prose language is a renderer setting. Pack structure, per language code:

| Field | Meaning |
|---|---|
| `name` | Display name of the language. |
| `sentence_template` | The word-order owner: literal frame text + `{role}` tokens + `{sentenceRole}`, with `[ … ]` optional groups. Required for correct assembly in that language. |
| `role_conjunctions` | Per-role joiner for repeating roles, e.g. `{ "ice_handling": " and " }`. Roles with no entry join with a single space, so adding one cannot disturb an existing role. |
| `phrases` | Per-language phrase templates keyed by smartphrase oid. Missing oids fall back to the library's English template (`langFallback: true`). |
| `concepts` / `methods` / `outputClasses` | Per-entity `{ label?, name? }` overlays merged onto the registry / method / output-class entity at render time. In production, largely inherited from CDISC/NCIt terminology translations. **English is a pack like any other** and uses `outputClasses` for exactly this reason (D14). |
| `sentenceRoles` | Localised sentence-role strings *(PoC: keyed by the canonical English value in the instance)*. |

Language-invariant by construction: the instance, the tag dialect (§8), `constructModelView` (§6)
and `buildTrace` (§7) — model artefacts always render canonical (English) labels, so switching
language changes prose projections only.

## 6. Instantiation: SAP → model

`constructModelView(ctx, instance)` builds the eSAP-style study model view:

1. Copy identity from the template: `conceptId`, `label`, `transformationType`, library provenance.
2. Resolve the method (`usesMethod`) with its generic formula expression.
3. Carry the instance's **estimand** and typed `analysisRole` through unchanged (§3.2) — these are
   instance-level, so they are not derived from any phrase.
4. Collect every bound concept as `{ slot, id, concept, role }`, ordered by `roleDefinitions.order` so an
   endpoint-role binding wins over a covariate binding on the same slot name. **The join to the template
   is on placeholder slot name, never on phrase OID** (DESIGN.md D10).
5. Fill `sliceKeys[].value` with `{ concept, label, iri }`, matching each declared dimension against a
   bound concept's `conceptCategory` (ParameterDimension, VisitDimension, EventDimension) or `kind`
   (Population, Treatment).
6. Substitute slice-constraint tokens by slot name — `{parameter}`, `{visit}`, `{event}`, `{population}`
   — plus `{baseline_visit}` from `instance.baselineVisit`. Populations substitute their `name`,
   everything else its `label`.
7. Collect `configurationValues`: template `methodConfigurations` (tagged `from: "template"`), plus
   `alpha = 1 − conf_level/100` when `SP_CONFIDENCE_LEVEL` is present (tagged
   `from: "SP_CONFIDENCE_LEVEL"`, rounded to 3dp — IEEE 754 makes the naïve subtraction
   `0.050000000000000044`).
8. Emit `handlesIntercurrentEvent[]` — the eSAP `IceHandling` triples — one per `ice_handling` phrase:
   `{ forIntercurrentEvent, label, icheStrategy, studyDefaultStrategy, isOverride, implementedBy[], fromPhrase }`.
   The strategy comes from the phrase's `anchors.icheStrategy`, the event from its binding, and
   `implementedBy` from the event's strategy-keyed map (§3.1). `isOverride` is true when the estimand
   applies a strategy other than the event's own `icheStrategy`, so a divergence is stated, not silent.
9. Build `resolvedExpression`, which dispatches on `usesMethod` — the one method-specific piece, because
   the library declares no measure→ADaM-variable mapping *(PoC)*.
10. Report `outputMeasures`, `usdmObjective`, `arsAnalysis`, and the template's `validSmartPhrases`
    (including any the proposed overlay added, §12).

## 7. Data trace

`buildTrace(ctx, instance, role, focusConceptId?)` returns a four-tier chain for a phrase role, or `null`
for roles without a chain. Chains are defined per role in the **active study graph's** `traceTemplates`, so
each study supplies its own — the CDISC Pilot defines `endpoint`, `covariate`, `timepoint`, `grouping`,
`population`, `ice_handling`; PrE0102 defines `endpoint`, `grouping`, `population`, `ice_handling` (there
is no analysis visit in a time-to-event analysis). Tiers, for an analysis-value chain:

```
DataConcept → ADaM Class Variable → Study variable (with where-clause) → Physical dataset (.xpt)
```

**`focusConceptId` is required for repeating roles.** Tokens are filled first-wins in role order, so with
two `ice_handling` phrases in one instance both would otherwise resolve to whichever concept came first —
and the endpoint concept's `{dataset}` would shadow both regardless. Passing the clicked phrase's own bound
concept heads the precedence order with it. Callers that trace a singular role may omit it.

**The ICE axis is shaped differently**, because what is traced is not an analysis value but *"did this event
occur, and when"* — a per-subject (boolean, `Timing`) pair:

```
Occurrence criterion → Ascertained fact → Study variable → Physical dataset (.xpt)
```

The first tier is the executable `OccurrenceCriterion` (a BC ▸ property ▸ code path, BC as the head), not
an ADaM class variable. The chain is **strategy-independent**, so one definition serves every estimand that
declares the event — which is exactly what `ascertainedBy` being separate from `implementedBy` buys.

Every string field of every tier may contain tokens, substituted from the **live instance**
(the trace follows edits):

The token set is **open and data-driven**: every concept the instance binds contributes each key of
its `data` map as `{key}`, walked in library role order so the endpoint concept wins any collision.
Four label tokens are derived rather than read from `data`:

| Token | Source |
|---|---|
| `{dataset}` `{datasetLabel}` `{file}` `{paramcd}` `{avisitn}` `{flag}` `{aval}` `{cnsr}` … | any bound concept's `data` keys, endpoint-first |
| `{paramLabel}` `{eventLabel}` | the endpoint-or-parameter-role concept's `label` |
| `{visitLabel}` | the `VisitDimension` concept's `label` |
| `{popName}` | the `Population` concept's `name` |
| `{iceLabel}` `{iceName}` | the `IntercurrentEvent` concept's `label` / `name` |
| `{criterion}` | the first `ascertainedBy.criteria` entry rendered as `property operator 'responseCode'` |

Adding a `data` key therefore makes a new token available with no engine change.

A chain that leaves a `{token}` unfilled is a **defect**, not a soft failure — `verify.mjs` asserts against
both `⟨name⟩` (phrase resolution) and a surviving `{token}` (trace fill). The second check was added after
an unfocused ICE chain silently produced `ADQSADAS.ITTFL`: the endpoint's dataset crossed with the
population's flag.

Examples:
- CDISC Pilot primary, `endpoint`:
  `DC.CHG → CHG (BDS) → ADQSADAS.CHG where PARAMCD = 'ACTOT' AND AVISITN = 24 → adqsadas.xpt`
- PrE0102 primary, `endpoint`:
  `DC.TTE → AVAL (BDS time-to-event) → ADTTE.AVAL where PARAMCD = 'PFS' → adtte.xpt` (with `CNSR`
  carrying the censoring indicator)
- CDISC Pilot primary, `ice_handling` focused on `ICE.TRT_DISCONT`:
  `BC_DS_001/Disposition Event where … equals 'Treatment Discontinued' → (occurred, when) →
  ADSL.DCSREAS → adsl.xpt`

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
  "sp:resolvesTo": [
    { "@value": "Change from baseline in … as the primary analysis.", "@language": "en" },
    { "@value": "La variation de … comme analyse principale.", "@language": "fr" },
    { "@value": "Die Veränderung von … als primäre Analyse untersucht.", "@language": "de" }
  ]
}
```

Phrase-instance node ids (`#p1`…) double as the **span anchors**: a carrier document marks each
phrase span with a reference to its node (the standoff link). `sp:resolvesTo` records the rendered
sentence — as **language-tagged literals**, one per available language pack (a plain string when no
packs are configured); it is derived data, never an input. *(PoC)* the `@context` is hand-written;
the intended source is the context emitted by the AC/DC LinkML model.

## 10. Engine API

All functions are pure; `ctx = SP_ENGINE.ctxOf(library, studyGraph, i18n)` is the first argument
throughout. Loading `engine.js` defines `SP_ENGINE` on `window`/`globalThis`.

Neither `constructModelView` nor `buildTrace` references any phrase OID: both collect the instance's
bound concepts in library role order and join to the template on **placeholder slot name**, matching
sliceKey dimensions against each concept's `conceptCategory` or `kind`. A new endpoint phrase or
dimension therefore needs no engine change. The one method-specific piece is the study-variable
expression in `constructModelView`, which dispatches on `usesMethod` because the library does not yet
declare a measure→ADaM-variable mapping.

| Function | Returns |
|---|---|
| `ctxOf(lib, graph, i18n?, proposed?)` | Context object for all other calls. `i18n` is the language-pack map (§5.1). `proposed` is the proposed-additions overlay, defaulting to `window.ACDC_LIBRARY_PROPOSED`; it may contribute `transformations`, `smartPhrases`, `roleDefinitions.roles` (spliced at `order_after`, §2.3) and `validSmartPhrasesAdded` (widening an existing upstream template, which then carries `proposedPhrasesAdded`). Merged entities are tagged `proposed: true` and the overlay's `provenance` is exposed as `ctx.lib.proposedProvenance`. The passed-in `lib` is never mutated — **read merged content from `ctx.lib`, never from the raw global**, or proposed content is invisible. |
| `availableLangs(ctx)` | Configured language codes (`["en"]` when no packs). |
| `langPack(ctx, lang)` | The language pack or `null`. |
| `phraseDef(ctx, oid)` | SmartPhrase definition or `null`. |
| `templateDef(ctx, conceptId)` | Transformation template or `null`. |
| `concept(ctx, id)` | Registry entry or `null`. |
| `method(ctx, id)` | Merged method view `{ conceptId, label, name, formula, configurations, iri, iri_status, ars, ars_status }` or `null`. |
| `resolvePhrase(ctx, phraseInstance, lang?, tpl?)` | `{ oid, role, name, template, anchors, text, bindings[], errors[], langFallback }` (§5). `tpl` (the active template) enables `output_ref` validation (§2.2); omit it and that check is skipped. |
| `resolveInstance(ctx, instance, lang?)` | `{ phrases[], parts[], sentence, errors[], lang }` (§5). |
| `constructModelView(ctx, instance)` | eSAP-style study model view (§6). |
| `buildTrace(ctx, instance, role, focusConceptId?)` | Array of trace tiers, or `null` (§7). Pass `focusConceptId` for repeating roles. |
| `iceHandlings(ctx, instance)` | The eSAP `IceHandling` triples the instance asserts (§6 step 8). |
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

## 12. Tooling *(PoC)*

Dev-time only; the demo itself needs none of it and stays zero-install.

| Command | Purpose |
|---|---|
| `node tools/build-library-subset.mjs` | Regenerate `demo/data/acdc-library.js` from `methods_02` at the pinned commit, via `git show`. Entities are copied verbatim; the selection (`SELECT_TRANSFORMATIONS`, `SELECT_METHODS`, `SELECT_OUTPUT_CLASSES`) is declared in the script. Widening a selection is the **only** legitimate way to add upstream content to the demo. |
| `node tools/build-library-subset.mjs --check` | Assert the file on disk equals generator output — enforces "do not hand-edit". |
| `node tools/verify.mjs` | Engine gate: every instance of every registered study, plus planted faults, overlay integrity and localisation completeness. Compares against `tools/goldens.json`. |
| `node tools/verify.mjs --update-goldens` | Re-pin goldens. Only after reviewing the diff. |
| `node tools/diff-goldens.mjs [rev] [--summary]` | Structural diff of `goldens.json` against its committed version: one line per changed **leaf**, so an intended addition reads as *N × ADDED* and an accidental edit cannot hide in a large JSON blob. A review aid, not a gate — always exits 0. |
| `NODE_PATH=<dir>/node_modules node tools/verify-ui.mjs` | Headless DOM walkthrough of `demo/index.html` in jsdom, both studies, all four stops; fails on any console error. Exit 2 if jsdom is absent. |

Goldens are **captured from behaviour, not hand-written**, so they answer "did this change anything?"
rather than "is this correct?" — correctness lives in the assertions alongside them.

## 13. Errors and findings

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
