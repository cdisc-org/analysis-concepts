# Document Anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every assertion the generated prose makes about the study is traceable to the document text that
grounds it, with the same fidelity `sapRef` gives concepts today — and the quotes are *verified* against
the source, not merely stored.

**Architecture:** Document anchoring moves from being a property of one entity class (the concept) to a
property of the **study-side use**. One anchor type, four homes (concept, phrase instance, estimand,
analysis instance), resolved with a stated precedence and — crucially — **projected**, so it participates
in the one-state/many-projections architecture instead of sitting inert.

**Tech Stack:** ES5-style browser JS in `demo/`; Node ESM `.mjs` for tooling; zero-install demo.

**Spec:** Issue [#12](https://github.com/cdisc-org/analysis-concepts/issues/12). Requirement quoted there;
the candidate direction is design input and is followed with one simplification (see D17 below).

## Global Constraints

- **Branch:** `estimands_01`, on top of the #11 work. Baseline `eddd5a6`, all gates green first.
- **The library wall holds.** Library entities (methods, output classes, transformation templates) are
  study-agnostic and must never carry study text. Anchors go only on study-side entities. This is the
  boundary #12 says is right in principle; the fix must not weaken it.
- **Never invent a quote.** Every `quote` must appear verbatim in the cited section of the converted SAP.
  Task 3 makes this a gate, so a paraphrase is a build failure, not a reviewer's problem.
- **Zero-install** demo; generated `acdc-library.js` never hand-edited; British English.
- **Gates green at the end of every task:**
  ```
  node smartphrase/tools/verify.mjs
  node smartphrase/tools/build-library-subset.mjs --check
  NODE_PATH=<scratchpad>/domtest/node_modules node smartphrase/tools/verify-ui.mjs
  node smartphrase/tools/diff-goldens.mjs --summary     # review aid after any recapture
  ```

---

## The diagnosis, restated

#12's audit reproduces exactly on this repo:

| Binding kind | Uses | Anchored |
|---|---|---|
| `concept` | 38 | 18 |
| `method` | 8 | **0** |
| `value` | 7 | **0** |
| `output` | 6 | **0** |

Plus 0 of 6 estimands and 0 of 8 analysis instances. Two additions to the issue's analysis:

**`sapRef` appears in zero pinned outputs.** It is not emitted by `constructModelView`, `toJSONLD` or any
other projection. So it is inert data: nothing consumes it, nothing displays it, and no gate can detect it
regressing. That is a deeper statement of the root cause than "attached to the wrong entity" — anchoring
was never wired into the architecture at all, which is *why* nobody noticed three of four binding kinds
had no path.

**The label-embedded convention #12 objects to is ours.** `"Primary estimand — progression-free survival
(SAP 3.1, 7.7.2)"` was written into `study-graph-pre0102.js` during #11. It must go.

---

## Task 1: The anchor type, and migrate concepts onto it

**Files:**
- Modify: `smartphrase/demo/data/study-graph-pre0102.js` (7 concept `sapRef`s)
- Modify: `smartphrase/demo/data/study-graph.js` (2 concept `sapRef`s)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Produces: the anchor type `{ section: string, quote?: string }`, used everywhere an anchor appears.

- [ ] **Step 1: Write the failing assertions**

```js
/* ---- document anchors are structured, not prose strings ---- */
{
  const ANCHORED = ["concepts"];
  for (const [studyKey, graph] of Object.entries(graphs)) {
    Object.keys(graph.concepts).forEach((id) => {
      const a = graph.concepts[id].sapRef;
      if (a === undefined) return;
      check(`${studyKey}/${id} sapRef is a structured anchor`,
        a !== null && typeof a === "object" && typeof a.section === "string",
        JSON.stringify(a));
      check(`${studyKey}/${id} sapRef section looks like a section number`,
        /^[0-9]+(\.[0-9]+)*$/.test(a.section || ""), String(a && a.section));
    });
  }
}
```

- [ ] **Step 2: Run — expect one failure per concept carrying a prose `sapRef`**

Run: `node smartphrase/tools/verify.mjs`
Expected: FAIL, 9 concepts reported as unstructured.

- [ ] **Step 3: Migrate the PrE0102 concept anchors**

Split each prose string into its parts. `EVENT.PFS` becomes:

```js
        sapRef: {
          section: "5.3",
          quote: "the duration of time from time of randomization to time of progression or death, whichever occurs first"
        },
```

Do the same for `EVENT.OS` (5.3), `EVENT.TTP` (5.3), `POP.EVAL_EFFICACY` (7.2), `POP.ITT` (7.2),
`TRT.PRE0102` (4.1) and `ICE.TOX_DISCONT` (4.3). **`TRT.PRE0102`'s current `sapRef` is a paraphrase**
("randomized 1:1 to everolimus or placebo, both with fulvestrant"), not a quotation — replace it with real
text from §4.1 or drop the quote and keep the section alone. Task 3's gate will reject a paraphrase, which
is the point.

- [ ] **Step 4: Handle the Pilot's two ICE concepts**

Their `sapRef` is not an anchor at all — it reads `"ILLUSTRATIVE — not from a source SAP; constructed for
issue #11"`. An anchor type must not be overloaded to mean "there is no anchor". Replace with:

```js
        /* No sapRef: this study declares no source document (see sourceDocument
           below). The note records why the concept exists at all. */
        note: "Constructed for issue #11; the CDISC Pilot has no protocol-defined ICE list.",
```

- [ ] **Step 5: Run the gate; commit**

Expected: PASS, 86 outputs, **no golden change** — `sapRef` is projected nowhere yet.

```bash
git commit -m "Structure document anchors as {section, quote}; migrate concept sapRefs"
```

---

## Task 2: The study declares its source document

**Files:**
- Modify: both study graphs
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Produces: `graph.sourceDocument` — an object, or `null` with `sourceDocumentNote` giving the reason.

- [ ] **Step 1: Write the failing assertions**

```js
/* ---- every study states whether it has a source document ---- */
for (const [studyKey, graph] of Object.entries(graphs)) {
  check(`${studyKey} declares sourceDocument (object or explicit null)`,
    "sourceDocument" in graph, "field absent — exemption must be declared, not implied");
  if (graph.sourceDocument === null) {
    check(`${studyKey} explains why it has no source document`,
      typeof graph.sourceDocumentNote === "string" && graph.sourceDocumentNote.length > 20,
      String(graph.sourceDocumentNote));
  } else if (graph.sourceDocument) {
    const sd = graph.sourceDocument;
    check(`${studyKey} source document identifies itself`,
      !!sd.id && !!sd.title && !!sd.date, JSON.stringify(sd));
    check(`${studyKey} source document maps top-level sections to files`,
      sd.sectionFiles && Object.keys(sd.sectionFiles).length > 0);
  }
}
```

- [ ] **Step 2: Run — expect both studies to fail**

- [ ] **Step 3: Declare PrE0102's source document**

```js
    /*
     * The converted source SAP. `sectionFiles` maps a TOP-LEVEL section number
     * to its converted file — the conversion is split by the SAP's own section
     * numbering, so "7.7.2" resolves through its head, "7". That keeps the map
     * to a handful of entries instead of one per subsection.
     *
     * This declaration is what makes anchoring coverage gateable for this study
     * (tools/verify.mjs): quotes are checked to exist in the file they cite.
     */
    sourceDocument: {
      id: "PRE0102-SAP-001",
      title: "PrE0102 Final Statistical Analysis Plan",
      date: "2014-03-24",
      root: "SAP",
      iri: "acdc:document/PRE0102-SAP-001", iri_status: "illustrative",
      sectionFiles: {
        "1": "01-list-of-abbreviations.md",
        "2": "02-introduction.md",
        "3": "03-study-objectives.md",
        "4": "04-study-design.md",
        "5": "05-measurement-of-effect.md",
        "6": "06-safety-measurements.md",
        "7": "07-general-statistical-considerations.md",
        "8": "08-reporting-conventions.md"
      }
    },
```

- [ ] **Step 4: Declare the Pilot's exemption**

```js
    /*
     * No source document. The CDISC Pilot study layer is constructed to
     * demonstrate the mechanism; there is no SAP behind it to quote. Declaring
     * the absence explicitly is what lets the anchoring gate hold PrE0102 to a
     * hard coverage requirement without either failing this study forever or
     * silently exempting it.
     */
    sourceDocument: null,
    sourceDocumentNote: "Illustrative study layer with no source SAP; anchoring coverage is not gated for this study.",
```

- [ ] **Step 5: Run all gates; commit**

---

## Task 3: Verify every quote against the source

The load-bearing task. Without it, an anchor is an unchecked claim.

**Files:**
- Create: `smartphrase/tools/lib-anchors.mjs` (shared resolver, used by the gate)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Produces: `resolveSection(graph, section)` → absolute file path or `null`;
  `quoteAppearsIn(text, quote)` → boolean, whitespace- and punctuation-normalised.

- [ ] **Step 1: Write the failing assertions**

```js
/* ---- every quote must actually appear in the section it cites ---- */
{
  for (const [studyKey, graph] of Object.entries(graphs)) {
    if (!graph.sourceDocument) continue;
    for (const a of allAnchors(graph)) {          // {where, section, quote}
      const file = resolveSection(graph, a.section);
      check(`${studyKey}/${a.where} cites a resolvable section (${a.section})`, !!file, a.section);
      if (!file || !a.quote) continue;
      const body = fs.readFileSync(file, "utf8");
      check(`${studyKey}/${a.where} quote appears verbatim in section ${a.section}`,
        quoteAppearsIn(body, a.quote),
        JSON.stringify(a.quote.slice(0, 90)));
    }
  }
}
```

`allAnchors(graph)` walks concepts now, and gains phrase instances / estimands / instances as later tasks
add them — write it to walk whatever exists so no task has to revisit it.

- [ ] **Step 2: Run — expect the `TRT.PRE0102` paraphrase to fail**

This is the check earning its place: the paraphrase introduced in #9 is caught automatically.

- [ ] **Step 3: Implement the resolver**

```js
/*
 * Normalise before comparing: the converted SAP is hard-wrapped, so a quote
 * spanning lines contains newlines the author never typed. Also fold the
 * typographic punctuation the PDF conversion produced (’ “ ” – —) onto ASCII,
 * because a quote copied from a rendered view and one copied from the markdown
 * differ only in those characters.
 */
export function normalise(s) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
export function quoteAppearsIn(body, quote) {
  return normalise(body).includes(normalise(quote));
}
/* "7.7.2" resolves through its head "7" — the conversion is split by top-level
   section, so subsections live in their parent's file. */
export function resolveSection(graph, section) {
  const sd = graph.sourceDocument;
  if (!sd) return null;
  const head = String(section).split(".")[0];
  const rel = sd.sectionFiles[head];
  return rel ? path.join(repoSmartphrase, sd.root, rel) : null;
}
```

- [ ] **Step 4: Fix the paraphrase, re-run, commit**

Replace `TRT.PRE0102`'s quote with real §4.1 text (read the file; do not compose it from memory).

---

## Task 4: `sapRef` on the phrase instance, with resolution and precedence

**Files:**
- Modify: `smartphrase/demo/engine.js` (`resolvePhrase`)
- Modify: `smartphrase/tools/verify.mjs`

**Interfaces:**
- Produces: `rp.anchor` = `{ section, quote }` or `null`; `rp.anchorSource` =
  `"phraseInstance"` | `"concept:<ID>"` | `null`.

- [ ] **Step 1: Write the failing assertions**

```js
/* ---- anchor resolution and precedence ---- */
{
  const ctx = E.ctxOf(LIB, graphs.PRE0102, I18N);
  const inst = graphs.PRE0102.instances.find((i) => i.id === "AC.PRIMARY.PFS");

  const method = E.resolveInstance(ctx, inst, "en").phrases.find((p) => p.role === "method");
  check("a method phrase can carry its own anchor", !!method.anchor, JSON.stringify(method));
  check("its anchor is attributed to the phrase instance",
    method.anchorSource === "phraseInstance", String(method.anchorSource));

  /* A concept-bound phrase with no instance anchor falls back to the concept. */
  const endpoint = E.resolveInstance(ctx, inst, "en").phrases.find((p) => p.role === "endpoint");
  check("a concept-bound phrase inherits the concept's anchor",
    !!endpoint.anchor && /^concept:/.test(endpoint.anchorSource), String(endpoint.anchorSource));

  /* Instance-level wins, and does not destroy the concept's. */
  const probe = JSON.parse(JSON.stringify(inst));
  probe.phrases[0].sapRef = { section: "9.9", quote: "probe" };
  const rp = E.resolveInstance(ctx, probe, "en").phrases.find((p) => p.role === "endpoint");
  check("instance-level anchor takes precedence",
    rp.anchor.section === "9.9" && rp.anchorSource === "phraseInstance", JSON.stringify(rp.anchor));
  check("the concept's own anchor is still reachable",
    !!E.concept(ctx, "EVENT.PFS").sapRef);
}
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Resolve the anchor in `resolvePhrase`**

```js
    /*
     * Document anchor for THIS use. The phrase instance's own sapRef wins,
     * because it answers "why is this here?"; a bound concept's answers "what is
     * this?" and is the fallback. Both survive — the concept keeps its anchor —
     * so a use-specific quote never erases the definitional one.
     *
     * This is what closes issue #12: method, value and output bindings resolve
     * into the LIBRARY, which correctly forbids study text, so before this the
     * only anchorable binding kind was `concept`.
     */
    var anchor = pi.sapRef || null;
    var anchorSource = anchor ? "phraseInstance" : null;
    if (!anchor) {
      (def.placeholders || []).some(function (ph) {
        var b = (pi.bindings || {})[ph.name];
        var c = b && b.concept && concept(ctx, b.concept);
        if (c && c.sapRef) { anchor = c.sapRef; anchorSource = "concept:" + b.concept; return true; }
        return false;
      });
    }
```

Return `anchor` and `anchorSource` on the resolved phrase.

- [ ] **Step 4: Carry `sapRef` through the tag dialect**

`toMacroText`/`parseMacroText` round-trip the instance byte-equal, and the gate asserts it. A phrase-level
`sapRef` must therefore either be serialised or be explicitly out of scope for the dialect. **Decision:
out of scope, and asserted as such** — the dialect is a phrase-authoring surface, not a provenance one,
and inventing attribute syntax for a quotation is worse than stating the limit. Add to `parseMacroText`
the preservation of `sapRef` from `baseInstance` so a round-trip does not silently drop anchors:

```js
      /* The tag dialect does not serialise document anchors (a quotation is not
         an attribute value). Preserve them from the base instance so an edit
         through the tag surface cannot silently strip provenance. */
```

Assert that a round-trip preserves anchors.

- [ ] **Step 5: Run, commit**

---

## Task 5: Anchors on estimands and analysis instances

**Files:**
- Modify: both study graphs
- Modify: `smartphrase/tools/verify.mjs`

- [ ] **Step 1: Write the failing assertions**

```js
check(`${studyKey}/${eid} estimand carries a document anchor`,
  !graph.sourceDocument || !!graph.estimands[eid].sapRef);
check(`${studyKey}/${inst.id} instance carries a document anchor`,
  !graph.sourceDocument || !!inst.sapRef);
/* The label-embedded convention #12 objects to must be gone. */
check(`${studyKey}/${eid} label does not embed a section reference`,
  !/\(SAP\s*[0-9]/.test(graph.estimands[eid].label), graph.estimands[eid].label);
```

- [ ] **Step 2: Run — expect the three PrE0102 estimand labels to fail**

- [ ] **Step 3: Add estimand anchors and strip the labels**

```js
      "EST.PFS": {
        iri: "usdm:Estimand/PRE0102-EST-PFS", iri_status: "illustrative",
        label: "Primary estimand — progression-free survival",
        rank: "primary",
        sapRef: { section: "3.1", quote: "To assess progression-free survival" },
        intercurrentEvents: ["ICE.TOX_DISCONT"]
      },
```

Read §3.1 and §7.7.2 for the exact wording — do not compose it.

- [ ] **Step 4: Add instance anchors**

Each analysis instance cites the section defining its methodology (§7.7.2 for all four PrE0102 analyses;
the ITT sensitivity analysis cites the sensitivity sentence specifically). This replaces the untyped
`"(SAP n.n)"` convention #12 names.

- [ ] **Step 5: Run, recapture if goldens moved, review with `diff-goldens`, commit**

---

## Task 6: Anchors become projections

Until this task the anchor is still inert. This is what wires it into the architecture.

**Files:**
- Modify: `smartphrase/demo/engine.js` (`constructModelView`, `toJSONLD`)
- Modify: both study graphs (add the `prov` prefix)

**Interfaces:**
- Produces: `mv.sapRef`, `mv.estimand.sapRef`, `mv.documentAnchors[]`;
  JSON-LD `prov:wasQuotedFrom` per phrase node.

- [ ] **Step 1: Write the failing assertions**

```js
check(`${studyKey}/${inst.id} model view carries document anchors`,
  !graph.sourceDocument || (mv.documentAnchors || []).length > 0);
check(`${studyKey}/${inst.id} JSON-LD quotes its source`,
  !graph.sourceDocument || JSON.stringify(ld).includes("prov:wasQuotedFrom"));
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Emit in the model view**

```js
      /* Document provenance for this analysis: the instance's own anchor, and
         one per phrase use with the source of each resolved anchor recorded.
         Emitting it is the point — an anchor nothing projects is inert, which is
         how three of four binding kinds went unanchored unnoticed (issue #12). */
      sapRef: instance.sapRef || null,
      documentAnchors: resolveInstance(ctx, instance).phrases
        .filter(function (rp) { return rp.anchor; })
        .map(function (rp) {
          return { phrase: rp.oid, role: rp.role, section: rp.anchor.section,
                   quote: rp.anchor.quote || null, from: rp.anchorSource };
        }),
```

- [ ] **Step 4: Emit in JSON-LD, using PROV**

`prov:wasQuotedFrom` is the W3C term for exactly this relation, so the identifier policy (ground into
existing standards) is satisfied rather than an AC/DC term invented. Add `prov:
"http://www.w3.org/ns/prov#"` to both graphs' `prefixes`, and on each phrase node:

```js
      if (rp.anchor) {
        node["prov:wasQuotedFrom"] = {
          "@id": docIri + "#" + rp.anchor.section,
          "rdfs:comment": rp.anchor.quote || null
        };
      }
```

- [ ] **Step 5: Run — goldens WILL move. Review with `diff-goldens --summary`, recapture, commit**

---

## Task 7: The coverage gate

**Files:**
- Modify: `smartphrase/tools/verify.mjs`

- [ ] **Step 1: Write the assertion**

```js
/* ---- anchoring coverage, for studies that HAVE a source document ---- */
if (graph.sourceDocument) {
  const res = E.resolveInstance(ctx, inst, "en");
  const unanchored = res.phrases.filter((p) => !p.anchor).map((p) => p.oid);
  check(`${studyKey}/${inst.id} every phrase use is anchored to the document`,
    unanchored.length === 0, unanchored.join(", "));
}
```

- [ ] **Step 2: Run — expect the method, value, output and fixed-text uses to fail**

This is #12's finding reproduced as a failing test before it is fixed. Record the count in the commit
message.

- [ ] **Step 3: Leave it failing — Task 8 supplies the anchors**

Commit the gate with the failure named, or defer the commit to Task 8. **Prefer deferring**, so no red
gate is committed.

---

## Task 8: Anchor PrE0102 completely, including two fixed-text phrases

**Files:**
- Modify: `smartphrase/demo/data/study-graph-pre0102.js`
- Modify: `smartphrase/demo/data/acdc-library-proposed.js` (two new fixed-text phrases)
- Modify: `smartphrase/demo/data/lang-overlay.js` (FR/DE for them)

**Source basis** — SAP §7.7.2, quoted exactly:

> *"Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible,
> treated subjects by treatment arm using Kaplan-Meier estimates."*

One sentence grounding the method binding, the value binding (`90`), and the output binding
(`median_survival`) — all three currently unanchored.

> *"Subjects who are lost to follow-up are censored at the time of last tumor assessment for TTP and PFS
> and at the time of the last known contact for OS."*

> *"In addition to the summary table, PFS and OS will be displayed by treatment arm using Kaplan-Meier
> survival curves."*

- [ ] **Step 1: Add the two fixed-text phrases to the proposed overlay**

Both have **no placeholders** — the class #12 says can never anchor, because there is no binding to route
through. Role `method_qualifier`, so no new role is needed (a new role would be another library minor
version, and these are qualifiers on how the analysis is reported).

```js
      {
        oid: "SP_CENSOR_LTFU",
        name: "Censoring rule — lost to follow-up",
        role: "method_qualifier",
        /* Fixed text: no placeholders. Its whole content is a claim about what
           the SAP says, which is exactly the class issue #12 identified as
           unanchorable — it becomes anchorable only because a phrase INSTANCE
           can carry sapRef. */
        phrase_template: "censoring subjects lost to follow-up",
        anchors: {},
        placeholders: []
      },
      {
        oid: "SP_KM_CURVES",
        name: "Reporting qualifier — Kaplan-Meier survival curves",
        role: "method_qualifier",
        phrase_template: "displayed as Kaplan-Meier survival curves by treatment arm",
        anchors: {},
        placeholders: []
      }
```

Add both to `T.PFS_KaplanMeier.validSmartPhrases`.

- [ ] **Step 2: Bind them, with per-instance anchors**

`SP_CENSOR_LTFU` goes on all three time-to-event instances — and **each cites a different clause of the
same sentence**, because the rule differs by endpoint:

- PFS and TTP → *"censored at the time of last tumor assessment for TTP and PFS"*
- OS → *"at the time of the last known contact for OS"*

This is the sharpest available demonstration of *why the anchor belongs on the use*: one phrase, one
library definition, identical rendered text, three instances, three different justifying quotes. A
concept-level anchor could not express it, and there is no concept to hang it on anyway.

`SP_KM_CURVES` goes on the PFS and OS instances only — the SAP names those two, not TTP. Getting that
right is itself a check that the encoding follows the document rather than the pattern.

- [ ] **Step 3: Anchor the method, value and output bindings**

Add `sapRef` to those phrase instances, all citing §7.7.2 with the summarisation sentence.

- [ ] **Step 4: Localise the two new phrases (FR/DE)**

The localisation gate fails otherwise. Suggested:
- FR: `"en censurant les participants perdus de vue"` / `"présenté sous forme de courbes de survie de Kaplan-Meier par bras de traitement"`
- DE: `"unter Zensierung der Teilnehmenden, die für die Nachbeobachtung verloren gingen"` /
  `"dargestellt als Kaplan-Meier-Überlebenskurven nach Behandlungsarm"`

**Read the rendered sentences in all three languages before accepting them** — this is the step that
caught two defects in #11.

- [ ] **Step 5: Run — coverage gate should now pass; recapture; commit**

---

## Task 9: Show the source in the demo

**Files:**
- Modify: `smartphrase/demo/index.html`
- Modify: `smartphrase/tools/verify-ui.mjs`

- [ ] **Step 1: Write the failing UI assertions**

```js
check("inspect popover shows the source quote",
  pop.includes("SAP 7.7.2") || pop.includes("Source"), pop.slice(0, 300));
check("the method phrase — unanchorable before #12 — now cites the SAP",
  methodPop.includes("Kaplan-Meier estimates"), methodPop.slice(0, 300));
```

- [ ] **Step 2: Add a Source row to `inspectHTML`**

```js
    /* The row issue #12 exists for: before this, hovering a method, value or
       output phrase showed no path back to the document at all. */
    var src = rp.anchor
      ? "<tr><td class='k'>source</td><td><b>SAP " + rp.anchor.section + "</b>" +
        (rp.anchor.quote ? "<div class='quote'>“" + rp.anchor.quote + "”</div>" : "") +
        "<div class='anchorfrom'>" + rp.anchorSource + "</div></td></tr>"
      : "";
```

with a muted `.quote` style. For a study with no source document, show nothing rather than an empty row.

- [ ] **Step 3: Add a coverage line to stop 4**

Next to the provenance line: *"Document anchoring: N of N phrase uses in this study cite the source SAP"*,
or the exemption note for the Pilot. This makes the claim visible and self-reporting.

- [ ] **Step 4: Run all three gates; commit**

---

## Task 10: Library-wall cleanup, docs, completion

**Files:**
- Modify: `smartphrase/demo/data/acdc-library-proposed.js`
- Modify: `DESIGN.md`, `REFERENCE.md`, `GETTING-STARTED.md`, `WALKTHROUGH.md`, `README.md`
- Modify: `smartphrase/PLAN-anchoring.md`

- [ ] **Step 1: Contain the study text in the proposed overlay**

`provenance.rationale` carries study text (*"The SAP's PFS analysis is descriptive…"*). It is defensible
where it is — provenance is metadata about why the proposal exists, not a library semantic field — but it
must not travel upstream with the entity. Mark it:

```js
      /* NOT FOR UPSTREAM: this block explains why these entities were proposed
         and cites the study that motivated them. Library entities must not carry
         study text (acdc_method.yaml: "Methods MUST NOT reference clinical or
         analysis concepts"), so this provenance stays behind when the entities
         are contributed to methods_02. */
```

- [ ] **Step 2: Record D17 and D18 in `DESIGN.md`**

- **D17** — anchoring is a property of the study-side *use*, not of one entity class. One anchor type
  `{section, quote}`, four homes, stated precedence, `sectionRef` folded into it rather than added
  separately (the simplification of #12's candidate direction). Include the finding that `sapRef` was
  projected nowhere, and that this is why the gap survived.
- **D18** — quotes are verified against the converted source, so an anchor is a checked fact. Note that
  the gate immediately caught a paraphrase that had been in the repo since #9.

- [ ] **Step 3: Update `REFERENCE.md`**

New §3.4 (source document), the anchor type in §3.1/§3.2/§3.3, `anchor`/`anchorSource` in §5's return
shape, `documentAnchors` in §6, `prov:wasQuotedFrom` in §9, the new tool in §12.

- [ ] **Step 4: Walkthrough beat**

Fold into stop 1 rather than adding a stop: hover the method phrase, show the SAP sentence. Add the ask
about whether document anchoring should be a required property of a released smartphrase library.

- [ ] **Step 5: Stale-claim sweep with loose patterns; final gate run; completion note; commit; push**

- [ ] **Step 6: Comment on #12 with the outcome and the open questions**

---

## Open questions to resolve during execution

1. **Is `method_qualifier` the right role for `SP_KM_CURVES`?** It is a *reporting* qualifier, not a
   methodological one. The alternative is a new `reporting` role — another library minor version. Flag
   rather than decide unilaterally.
2. **Should the tag dialect serialise anchors?** This plan says no and preserves them across a round-trip
   instead. If the working group wants the text surface to be provenance-complete, that changes.
3. **Does a released library owe every phrase an anchor *slot*?** The fix puts `sapRef` on the study-side
   instance, so the library is untouched. But a phrase whose text asserts something about a document
   arguably ought to *require* an anchor when used. That is a library-governance question.
