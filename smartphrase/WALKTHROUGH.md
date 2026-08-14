# Working-group walkthrough — smartphrase PoC

> ~12 minutes · one browser tab: `smartphrase/demo/index.html` (double-click; nothing is server-backed —
> if anything misbehaves, reload). Keep issue #9 open in a spare tab for the close.
> Drop the PrE0102 beat (7:45) to bring this back to ~10 minutes if time is tight.

**Headline:** the SAP and the AC/DC model are two views of *one* thing — and this page holds exactly one
copy of that thing.

**Worked examples.** Stops 1–3 run on CDISC Pilot primary efficacy — change from baseline in
ADAS-Cog(11) at Week 24, ANCOVA, efficacy population — driven by transformation template
`T.CFB_ANCOVA` and method `M.ANCOVA` from the Transformation Library **v0.7 on `methods_02`**, loaded
verbatim. The 7:45 beat then switches to a second study, PrECOG **PrE0102** (metastatic breast cancer,
progression-free survival, Kaplan-Meier), to show the same mechanism across therapeutic areas and
endpoint types.

---

## 0:00 — Framing (45s)

> "A SAP is prose for humans; the AC/DC model is metadata for machines. Written separately, they drift.
> The smartphrase layer makes them the *same source of truth*. Since the last round we've regrounded the
> requirements (issue #9 is rewritten): no XHTML namespaces, no TransCelerate coupling — carrier-neutral
> requirements, and everything binds to the v0.7 library on `methods_02`."

## 0:45 — Stop 1 · The passage (2m)

- Hover **"change from baseline in …ADAS-Cog(11)"** → phrase `SP_CFB_ENDPOINT`, its template, the bound
  concept with a real grounding IRI.
- Hover **"using ANCOVA"** → the method with its STATO IRI (that one is authoritative, not illustrative).
- Click the endpoint phrase → the trace drawer: **DataConcept → ADaM class variable CHG → ADQSADAS.CHG
  where `PARAMCD='ACTOT' AND AVISITN=24` → `adqsadas.xpt`**. Click the population phrase → `ADSL.ITTFL`.

> "Ordinary-looking prose; every highlight is interrogable down to the column the number comes from."

## 2:45 — Stop 2 · Two views, one thing (3m30) — *the heart*

- **model → SAP:** change the analysis visit Week 24 → Week 16; the prose rewrites. Flip the endpoint
  render mode; toggle the confidence-interval phrase off and on.
- **SAP → model:** click a phrase chip and change its binding — point at the *Constructed model instance*
  tab: sliceKeys, slice constraints and the resolved formula update from the same edit.
- **Tag source tab:** edit `POP.EFFICACY` → `POP.PP` in the text, *Apply* — everything follows. Then break
  it deliberately (`conf_level="150"`) — the validator rejects it and the model is untouched.

> "There is no synchronisation here, because there is no second copy. Every panel is a projection of one
> object. That's the co-equal bidirectionality the issue asks for."

- **Optional 30s — i18n:** click **DE** (top right). Same object, German prose — and note the verb
  bracket (*wird … untersucht*): word order is owned by a per-language sentence template, not by
  concatenating fragments. Point at the tag source: **it did not change**. Click **FR**, then back to
  **EN**. *(Translations illustrative.)*

> "Multilingual SAPs fall out of the architecture: a new language is a rendering pack, not a
> re-authored document — and the graph carries every language as tagged literals."

## 6:15 — Stop 3 · Template reuse (1m30)

- CDISC Pilot group: primary ADAS-Cog(11)/Week 24, secondary NPI-X, supporting Week 16 — **same
  template**, only the highlighted bindings differ.
- Click *Open in editor* on the NPI-X card, then trace its endpoint at Stop 1: the chain now ends at
  `adnpix.xpt` — the trace follows the instance too.

> "Write the building block once in the library; every study analysis is bindings."

## 7:45 — Switch study · PrE0102, metastatic breast cancer (2m)

**Action:** click **PRE0102** in the study switch at Stop 1.

> "Same page, same library, same engine — but a real published SAP from a different therapeutic area.
> This is the PFS primary analysis from PrECOG PrE0102. Every claim you have just seen still holds.
>
> Hover the endpoint: it is `SP_TTE_ENDPOINT`, a *time-to-event* phrase, not the change-from-baseline
> one. Click it and the trace goes somewhere else entirely — `DC.TTE → AVAL → ADTTE.AVAL where
> PARAMCD='PFS' → adtte.xpt`, with the censoring flag alongside, and no analysis-visit tier at all."

**Be straight about what it cost:**

> "This needed a new library building block. The SAP asks for Kaplan-Meier medians with 90% confidence
> intervals by arm — descriptive, no test — and v0.7 has no template for that; the nearest thing,
> `T.OS_LogRank`, is a hypothesis test. So we wrote one. It is badged **proposed** because it is not
> upstream yet, and that badge is the point: this is what a library contribution looks like from the
> outside. Worth noting the *phrase* layer needed nothing new — `SP_TTE_ENDPOINT` and `SP_METHOD_KM` were
> already in v0.7, unused. It was the template layer that was missing."

**Back at Stop 3:** the grid now has two study groups.

> "So reuse is two-dimensional. Within this study, four analyses share that one block — PFS, PFS on the
> ITT population, which is the SAP's *own* sensitivity analysis rather than something we invented, plus
> OS and TTP. Across studies, two blocks from one library. Write once, apply many — and the 'many'
> crosses therapeutic areas and endpoint types."

## 9:45 — Stop 4 · Standards grounding (1m)

- The identifier table: USDM for study structure, ARS for analyses, STATO for methods, NCIt for
  terminology; AC/DC ids only where nothing exists yet, and unregistered ids are flagged *illustrative*.
- Provenance line: the library data is a generated verbatim subset of `methods_02@ffee5df`.
- The volatility card: the semantics are standoff — the SAP-structure initiative (M11-analogue) can land
  on any structure and this layer attaches unchanged.
- Note the honest gap: ANCOVA grounds authoritatively in STATO, but **no STATO or NCIt term for
  Kaplan-Meier estimation** was found, and the upstream method file carries `ncitCode: null`. We did not
  invent one — it is flagged *illustrative*.

## 10:45 — The ask (1m15)

> "Issue #9 now states requirements only; `smartphrase/DESIGN.md` records this design and why.
> The steer we need:
> 1. Does the working group accept **one-state / many-projections** as the smartphrase architecture?
> 2. Is **structured authoring** (phrases + typed placeholders, not free-text parsing) the right SAP→model story?
> 3. Should the identifier policy — *resolve into USDM/ARS/STATO/NCIt wherever they cover the entity* — become an AC/DC principle?
> 4. Who owns registering the currently-illustrative ids as the sister SAP-structure project spins up —
>    including finding or minting a term for Kaplan-Meier estimation?
> 5. **Who accepts phrase and template contributions into the library, and what does that review look
>    like?** We have produced one (`T.PFS_KaplanMeier`) by encoding a single real SAP, so this is no
>    longer hypothetical — and a library that grows one therapeutic area at a time needs an owner."

---

### Pocket facts

- Sentence produced: *"Change from baseline in Alzheimer's Disease Assessment Scale - Cognitive Subscale
  (11 items) (ADAS-Cog(11)) at Week 24 in the efficacy (intent-to-treat) population comparing treatment
  groups using ANCOVA with 95% confidence intervals adjusting for baseline ADAS-Cog(11) will be assessed
  as the primary analysis."*
- PrE0102 sentence produced: *"Time to disease progression or death (PFS) in the eligible, treated
  population comparing treatment groups using Kaplan-Meier estimation with 90% confidence intervals will
  be assessed as the primary analysis."* Source: SAP §3.1, §5.3, §7.7.2 (converted in `smartphrase/SAP/`).
- Library: 23 smartphrases, 8 roles, `T.CFB_ANCOVA` valid-phrase set of 9 — all v0.7, verbatim. Plus one
  **proposed** template, `T.PFS_KaplanMeier`, authored here and not yet upstream.
- Languages: EN/FR/DE via language packs; DE headline: *"… wird im Vergleich der Behandlungsgruppen
  mittels ANCOVA … als primäre Analyse untersucht."* Tag source/model/graph identical across languages.
- Verified, and re-runnable: `tools/verify.mjs` (69 pinned outputs across both studies),
  `tools/build-library-subset.mjs --check` (generated file unmodified), `tools/verify-ui.mjs` (headless
  DOM walkthrough of both studies, fails on any console error). All green.
- If time-pressed: drop the PrE0102 beat, compress Stop 4 to the provenance line and the volatility
  sentence, and drop the i18n beat (just say it); never cut Stop 2.
