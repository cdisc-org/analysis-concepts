# SmartPhrase Tag — authoring demo

A self-contained demo of the smartPhrase authoring tag dialect decided in
`~/.claude/plans/ok-the-smartphrase-now-stateless-fountain.md`:

```
<acdc:macro id="phrase"
            ref="SP_<OID>"
            instance="<local-id>"
            of="<other-instance>"
            <slotName>="<bound-value>" …
            render="<slot>:<mode>,…"/>
```

## Run

The demo fetches the smartPhrase library from a relative path, so it needs to be
served over HTTP. From the **repo root**:

```sh
python3 -m http.server 8000
```

then open <http://localhost:8000/examples/smartphrase-tag-demo/>.

## What it does

- Loads `lib/transformations/ACDC_Transformation_Library_v07.json` (23 phrases).
- Provides an editor (left) and a rendered preview (right) with inline chips.
- Slash-command picker — type `/sp` in the editor, or click *Insert phrase tag*,
  or press <kbd>Ctrl/⌘ + Space</kbd>.
- Picker has two tabs:
  - **Phrase instances (study spec)** — bare cross-references to a mock study's
    resolved instances (Affordance 2 in the plan).
  - **Library templates** — full skeleton with required slot stubs to fill
    (Affordance 3 fallback).
- Two-pass validator runs on every keystroke; findings appear under the editor.
- **Analysis concepts — detailed spec (the next step):** each authored
  *endpoint + method* pair resolves to its analysis transformation and detailed
  spec. See below.

## Analysis concepts — the next step

Below the validation panel, the demo shows what the authored tags resolve *into*
at the analysis-concept level. It separates two passes, by design:

- **AUTHORED** (solid block) — the analysis transformation, found by intersecting
  `validSmartPhrases[]` with the endpoint + method phrase oids (e.g.
  `SP_CFB_ENDPOINT` + `SP_METHOD_MMRM` → `T.CFB_MMRM_Primary`). Renders the twin
  cube (input DataStructureDefinition → method + configs → output DSD), the
  output measures, and the slice bindings (`{parameter}` ← the endpoint's BC
  identifier, via the transformation's `sliceKeys`).
- **INFERRED** (dashed block) — the derivation pipeline, which is **not in the
  narrative**. It is reconstructed by a concept-production matcher: for each input
  measure the analysis consumes, find the derivation whose output produces that
  concept (`Change` → `T.ChangeFromBaseline`), recurse, treat raw `Measure` as a
  collected-data leaf, attach `T.BaselineSelection` for baseline-sliced inputs,
  and insert the authored imputation. Each node expands to its own mini-DSD.

The two genuine seams are **marked, not hidden** (⚠): the imputation insertion
point ("inferred from method qualifier") and slice/binding propagation into the
subtree ("open"). Where the library has no producer for a combination (e.g.
Kaplan-Meier has no analysis transformation in v07), the analysis row honestly
shows "no matching transformation".

## Two kinds of tag

The demo distinguishes — and this is the core of the spec-authoritative model:

- **Spec-bound reference** — `instance=` points at a study-spec phrase instance
  (`Transformation.hasPhraseInstance[]`). The tag is *bare*: `ref` + `instance`,
  no slots. Slots, role and composition (`of=`) are inherited from the spec; the
  narrative just renders them. If the author *does* re-state a slot and it
  diverges from the spec, that's a **spec-drift warning** — and the renderer
  follows the spec, not the prose (matching the "spec is authoritative;
  narrative is a rendering" direction).
- **Free-prose literal** — `instance=` is *not* in the spec (a passing mention
  not part of any analysis). It must carry its own required slots and validates
  standalone. It never creates a spec entry.

The picker's two tabs map onto this: **Phrase instances** inserts spec-bound
references; **Library templates** inserts literal skeletons to fill.

## What's mocked

The "study spec" is a fixed set of mock phrase instances (`E1` CFB-PCR,
`A1` MMRM, `A1q1` LOCF, `E2` TTE-DEATH, `A2` KM) in `MOCK_STUDY_INSTANCES`. In a
real eSAP this comes from `Transformation.hasPhraseInstance[]`.

Slot-value resolution is stubbed — the renderer just strips the source-namespace
prefix for chip readability:

- `BC.*` — a `{parameter}`/`{event}` value is the **identifier of a Biomedical
  Concept** (collected data) drawn from the study's parameter codelist. A
  parameter is *not* a concept-model concept; it identifies a BC (the same thing
  USDM references via `<usdm:macro id="bc" .../>`).
- `M.*` — a method id from the internal method catalogue.
- `V.*` — an AnalysisVisit (timepoint) dimension member.

Resolving these identifiers to BC/method names+labels, and checking codelist
membership, is deferred to the study-config step per the plan.
