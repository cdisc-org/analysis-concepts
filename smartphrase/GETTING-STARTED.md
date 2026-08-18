# Getting started with smartphrases

> Audience: **integrators** who want smartphrase support in their own tooling (e.g. a SAP editor
> application), and **standards managers** who want to build libraries of reusable smartphrases
> (e.g. for a therapeutic area or a sponsor standard).
>
> Status: this accompanies the issue #9 proof of concept. The interfaces shown are those of the PoC
> engine ([`demo/engine.js`](demo/engine.js)) and the v0.7 library on `methods_02`; both are expected
> to evolve, but the *shape* of the approach — described in [`DESIGN.md`](DESIGN.md) — is the part to
> build against. Full structure definitions are in [`REFERENCE.md`](REFERENCE.md).

---

## The mental model (read this first, whichever audience you are)

A smartphrase system has three layers, with a strict dependency direction:

```
LIBRARY (reusable, versioned, study-independent)
  smartPhrases        phrase templates with typed placeholders   e.g. "change from baseline in {parameter}"
  transformations     analysis building blocks; each declares which phrases are valid for it
  methods             statistical method definitions the transformations use
        │
        ▼
STUDY LAYER (per study)
  concept registry    the study's bindable things (parameters, visits, populations…), each with a grounding IRI
  analysis instances  ONE object per analysis: which template + which phrases + which bindings
        │
        ▼
PROJECTIONS (computed, never stored)
  SAP prose · constructed model instance · tag source · JSON-LD graph · data trace
```

The single most important rule: **the analysis instance is the only stored artefact**. Prose is
*generated from* the instance; authoring prose means *editing* the instance through structured
surfaces. If you find yourself parsing rendered prose, or keeping a second copy of the sentence to
keep "in sync", you have left the architecture — there is nothing to synchronise, because there is
only one copy.

---

# Track A — Integrating smartphrases into an application

This track walks through embedding the layer in an editor, using the PoC engine as the worked
example. The engine is a single dependency-free script; it runs in a browser or under Node.

## A1. Load the inputs

```html
<script src="data/acdc-library.js"></script>          <!-- library layer  → window.ACDC_LIBRARY -->
<script src="data/acdc-library-proposed.js"></script> <!-- proposed additions (optional) -->
<script src="data/study-graph.js"></script>           <!-- a study layer  → window.STUDY_GRAPHS.<id> -->
<script src="data/lang-overlay.js"></script>          <!-- language packs → window.LANG_OVERLAY (optional) -->
<script src="engine.js"></script>                     <!-- the engine     → window.SP_ENGINE -->
<script>
  const E     = SP_ENGINE;
  const graph = STUDY_GRAPHS["CDISCPILOT01"];                     // one study layer at a time
  const ctx   = E.ctxOf(ACDC_LIBRARY, graph, LANG_OVERLAY);       // pass ctx to every engine call
</script>
```

`ctxOf` takes the study graph as a parameter, so **switching study is just rebuilding the context** —
there is no global to reassign. Each study registers itself into `window.STUDY_GRAPHS` from its own
file; `window.STUDY_GRAPH` is an alias to the first one for back-compatibility.

Treat the library as **read-only**: your application never mutates phrase or template definitions.
`ctxOf` honours that — it merges any proposed-additions overlay into a *new* library object exposed as
`ctx.lib`, leaving the object you passed untouched. Read merged content (including
`ctx.lib.proposedProvenance`) from `ctx.lib`, never from the raw global.

The study layer (concept registry, instances) is yours to manage — in the PoC it is a hand-written
file per study, in your application it would come from your study metadata store.

## A2. Hold one instance object as your document state

An analysis instance is small and serialisable — this is what your editor loads, edits and saves:

```js
let state = {
  id: "AC.PRIMARY.ADASCOG",
  iri: "acdc:instance/AC-PRIMARY-ADASCOG",
  template: "T.CFB_ANCOVA",                    // the library building block being instantiated
  sentenceRole: "the primary analysis",
  baselineVisit: "VISIT.BASELINE",
  phrases: [
    { phrase: "SP_CFB_ENDPOINT",
      bindings: { parameter: { concept: "PARAM.ADASCOG11", render: "name_with_label" } } },
    { phrase: "SP_TIMEPOINT",
      bindings: { visit: { concept: "VISIT.WK24", render: "label" } } },
    { phrase: "SP_METHOD_ANCOVA",
      bindings: { method: { method: "M.ANCOVA", render: "label" } } }
    // …
  ]
};
```

## A3. Render — model → SAP

```js
const res = E.resolveInstance(ctx, state, "en");   // third arg: prose language (renderer setting)
res.sentence   // "Change from baseline in … will be assessed as the primary analysis."
res.parts      // ordered render sequence: phrase chips + literal frame text — consume THIS for prose
res.phrases    // role-ordered per-phrase results: { oid, role, text, bindings[], errors[] }
res.errors     // aggregate resolution errors ([] when the instance is complete)
```

Render `res.parts` in order — the PoC wraps each phrase part in a `<span>` chip (hover-inspection,
click-to-trace) and frame-text parts in a muted span, but that is presentation. Word order comes from
the language's sentence template and phrase order from the library's `roleDefinitions.order`, so an
instance's phrase array order does not matter. Rendering in another language is the same call with a
different `lang` — the instance never changes (see REFERENCE §5.1 for language packs).

**Re-render everything from state after every edit.** The PoC's entire UI is one `renderAll()`
function; that discipline is what makes "two views of one thing" true rather than aspirational.

## A4. Edit — SAP → model

Authoring is structured: the user picks phrases and fills typed placeholders. Three surfaces the PoC
implements, in increasing text-likeness:

1. **Constrained pickers** — enumerate legal values and write the binding:
   ```js
   // what may the user pick for a placeholder? filter your registry by its constraints:
   //   placeholder.concept_constraint  → registry entry .kind must match  (e.g. "Population")
   //   placeholder.concept_category    → .conceptCategory must match      (e.g. "VisitDimension")
   pi.bindings.visit.concept = "VISIT.WK16";     // then re-render
   ```
2. **Add/remove phrases** — the template says what is allowed:
   ```js
   const tpl = E.templateDef(ctx, state.template);
   tpl.validSmartPhrases   // the complete legal phrase set for this analysis — your "insert phrase" menu
   ```
3. **A text serialisation** (the `acdc:macro` tag dialect) — emit it, let the user edit it, parse it
   back through validation. **Never apply an invalid parse**:
   ```js
   const src = E.toMacroText(ctx, state);              // state → text
   const r   = E.parseMacroText(ctx, edited, state);   // text → { instancePatch, findings[] }
   if (r.instancePatch) state = r.instancePatch;       // null whenever findings contain an error
   else showFindings(r.findings);                      // e.g. "SP_TTE_ENDPOINT is not a valid smartphrase for template T.CFB_ANCOVA"
   ```

## A5. Exchange and downstream use

- **Persist / exchange the instance** (or its JSON-LD projection) — never the prose:
  ```js
  const graph = E.toJSONLD(ctx, state);   // a graph fragment with IRIs into USDM/ARS/STATO/NCIt
  ```
- **The model view** for downstream statistical tooling (eSAP-style: template copied, sliceKeys
  study-resolved, method configuration collected, formula resolved to study variables):
  ```js
  const mv = E.constructModelView(ctx, state);
  mv.sliceKeys            // [{ dimension: "ParameterDimension", value: { concept, label, iri } }, …]
  mv.resolvedExpression   // "CHG ~ TRTP + BASE"
  ```
- **Traceability UI** — four tiers from a phrase's role down to the physical dataset:
  ```js
  E.buildTrace(ctx, state, "endpoint");
  // DataConcept → ADaM class variable → study variable (+ where-clause) → .xpt file
  ```

## A6. Integration checklist

- [ ] One instance object per analysis passage is your document state; every surface re-renders from it.
- [ ] The library is read-only; pin its version and record provenance (the PoC embeds branch + commit).
- [ ] Every edit path goes through placeholder constraints and template `validSmartPhrases` — including paste/import.
- [ ] Text-dialect input is applied only when validation returns no errors; findings are shown, state untouched otherwise.
- [ ] You persist instances/JSON-LD, never rendered prose; prose is disposable output.
- [ ] Grounding IRIs are displayed with their status — do not present `illustrative` ids as registered.
- [ ] The surrounding document structure is treated as replaceable: your anchors attach smartphrases to
      spans, not to a document schema (the SAP-structure initiative will change the schema under you).

---

# Track B — Building a library of reusable smartphrases

This track is for standards managers: curating the phrase and template library that studies
instantiate — organisation-wide, or specialised for a therapeutic area.

## B1. What a smartphrase is (and is not)

A smartphrase is a **reusable sentence fragment with typed holes**, owned by the library, playing
exactly one linguistic *role* in an analysis description:

```json
{
  "oid": "SP_CFB_ENDPOINT",
  "name": "Change from baseline endpoint",
  "role": "endpoint",
  "phrase_template": "change from baseline in {parameter}",
  "anchors": { "produced_concept": "Change" },
  "placeholders": [{
    "name": "parameter",
    "kind": "concept_ref",
    "concept_class": "SharedDimension",
    "concept_constraint": "Parameter",
    "value_source": "user_codelist",
    "render_options": ["label", "name", "name_with_label"],
    "default_render": "name_with_label",
    "required": true
  }]
}
```

Design tests for a good phrase:

- **One role.** If a candidate phrase covers both the endpoint and the timepoint, split it — roles
  are what let the engine assemble fragments into a sentence in a stable order, and what let a
  template say precisely which fragments it accepts.
- **Every study-varying word is a placeholder.** Fixed text belongs in `phrase_template`; anything a
  study chooses must be a typed hole. If you are tempted to write near-duplicate phrases differing
  only in a word, that word is a placeholder.
- **Placeholders are typed, not free text.** `concept_ref` with a `concept_constraint` /
  `concept_category`, `method_ref` with an intent constraint, or `value` with a datatype and range.
  A placeholder that accepts "any string" defeats both validation and traceability.
- **Anchors tie the phrase to the model.** `anchors.produced_concept` (what data concept the phrase
  talks about) and `anchors.uses_method` are what connect prose to derivations, methods and the trace —
  a phrase without anchors is decoration.

## B2. Phrases don't float free — templates bind them

A transformation template (the analysis building block) declares:

- `validSmartPhrases` — the complete set of phrase oids meaningful for that analysis type. This is
  the contract an editor enforces: an author of a `T.CFB_ANCOVA` passage can only insert those twelve
  phrases.
- `sliceKeys` and slice-constraint `{placeholder}` tokens — how the phrases' bindings become the
  study-resolved data cube (this is what makes the prose *computable*, not just tagged).

So "adding a smartphrase" is a two-sided act: define the phrase, **and** add its oid to
`validSmartPhrases` of every template where it is meaningful. A phrase no template references is
unreachable.

**And validity can be conditional on what the template can actually do.** `SP_ICE_HYPOTHETICAL` is valid
for `T.CFB_ANCOVA`, which has an imputation derivation available to implement a hypothetical strategy, but
deliberately *not* for `T.PFS_KaplanMeier`, which has neither an imputation nor a censoring derivation.
Listing it there would let an author write prose the model cannot honour. The same principle applies
whenever a phrase asserts something that has to be *operationalised* rather than merely stated — and the
engine enforces it, refusing an intercurrent-event phrase whose event declares no handling for the
strategy asserted.

## B3. Worked example — adding a subgroup phrase

Goal: SAPs in your area routinely say *"within the elderly subgroup"*.

1. **Role.** It qualifies the population being analysed — but it is not the population itself.
   Check `roleDefinitions`: no `subgroup` role exists, so either propose one (a library-versioning
   event — it changes sentence assembly order) or, pragmatically, use an existing role whose
   position fits. Propose the role: `subgroup`, ordered after `population`, `contextSource: "manual"`.
2. **Phrase definition:**
   ```json
   {
     "oid": "SP_SUBGROUP",
     "name": "Subgroup qualifier",
     "role": "subgroup",
     "phrase_template": "within the {subgroup} subgroup",
     "anchors": { "produced_concept": "Subgroup" },
     "placeholders": [{
       "name": "subgroup", "kind": "concept_ref",
       "concept_class": "SharedDimension", "concept_constraint": "Subgroup",
       "value_source": "user_codelist",
       "render_options": ["label", "name"], "default_render": "name", "required": true
     }]
   }
   ```
3. **Registry impact.** Studies now need `Subgroup`-kind concepts in their registry (e.g.
   `SUBGRP.ELDERLY` with a grounding IRI — NCIt if one exists, flagged `illustrative` otherwise).
4. **Template membership.** Add `"SP_SUBGROUP"` to `validSmartPhrases` of each template where a
   subgroup analysis is legitimate.
5. **Trace.** If the subgroup should be traceable to data, add a trace chain for the role (e.g.
   `DC.SUBGROUP → AGEGR1 → ADSL.AGEGR1 where AGEGR1='>80' → adsl.xpt`).
6. **Version.** Phrases are contracts: adding one is a minor version; changing an existing
   `phrase_template`'s meaning, a placeholder type, or a role is a major version, because existing
   instances bind to them by oid.

## B4. Therapeutic-area libraries

The layering that works is **core + overlay**, mirroring how the v0.7 library already splits
transformations from per-method files:

- **Core library** — cross-TA phrases and templates (change-from-baseline, descriptive stats,
  generic timepoint/population/grouping phrases). Owned centrally.
- **TA overlay** — a package that *adds* phrases, templates and role vocabulary specific to the
  area, and *never redefines* core oids. Oncology, for instance, would contribute time-to-event
  phrases (`SP_TTE_ENDPOINT` exists in core; the overlay adds e.g. response-criteria phrases around
  RECIST), templates like `T.OS_LogRank` parameterisations, and registry conventions (which NCIt
  codes ground the standard endpoints).
- **Study registry** — still per study; the TA overlay can ship *recommended* concept entries
  (standard endpoints with their authoritative NCIt IRIs) that studies copy in.

Conventions worth fixing early:

| Thing | Convention in the PoC |
|---|---|
| Phrase oids | `SP_<MEANING>` — stable forever once published |
| Template ids | `T.<Name>` · methods `M.<Name>` |
| Identifier policy | ground into USDM / ARS / STATO / NCIt wherever those standards cover the entity; AC/DC ids only for what is genuinely new; unregistered ids carry `iri_status: "illustrative"` |
| Provenance | consumers record library version + source commit (see the generated header of `demo/data/acdc-library.js`) |
| Document anchoring | study-side only. A phrase, template or method in the library must never carry SAP text; the citation belongs on the study's *use* of it (`sapRefs[]` on the phrase instance — a list, since one use may rest on several passages). See REFERENCE §3.4. |
| New **roles** vs new phrases | a phrase is additive within an existing role; a new *role* is a library **minor version**, because every language pack's sentence template enumerates role tokens explicitly and a role absent from a template is dropped from the rendered sentence entirely. Budget for touching every pack. |

## B5. Localisation is a library deliverable too

A language for the smartphrase layer is a **pack**, not a document translation (see REFERENCE §5.1):
one sentence template that owns word order in that language, phrase-template translations keyed by
oid, and label overlays for concepts/methods (much of which is inherited from CDISC/NCIt terminology
translations rather than authored). Packs version and govern like any other library overlay — and
because instances are language-neutral, shipping a new language re-renders every existing SAP passage
without touching a single instance. The demo's FR/DE packs (`demo/data/lang-overlay.js`) are the
worked example; treat their copy as illustrative.

One caveat worth knowing before you commission translations: a pack can own word order, optional clause
punctuation and per-role conjunctions, but it cannot own **inflection of the values it interpolates**.
Adding the ICH E9(R1) strategy phrases exposed this — German declines the intercurrent-event noun phrase
differently depending on the strategy (*"unabhängig von …"* wants the dative, *"als ob … wäre"* wants the
nominative), and a concept carries one `name`. The workaround is to write every template in that language
to take the same case; the real fix would be per-case declined forms in the registry, which is a
terminology-management question rather than an engine one.

## B6. What to keep out of the phrase library

- **Study-specific wording** — that is a binding or a registry label, not a phrase.
- **Document structure** — sections, numbering, boilerplate belong to the SAP structure (a sister
  initiative is standardising it, and it *will* change); the phrase library must not depend on it.
- **Prose style rules** (capitalisation, sentence frames like "…will be assessed as the primary
  analysis") — those are renderer concerns; keeping them out of phrases is what keeps phrases
  reusable across sentence positions and, eventually, languages.

---

## Where to go next

- [`REFERENCE.md`](REFERENCE.md) — every structure and engine function, precisely.
- [`DESIGN.md`](DESIGN.md) — why the architecture is shaped this way.
- [`demo/index.html`](demo/index.html) — all of the above, running; the demo source is deliberately
  small enough to read as an integration example.
