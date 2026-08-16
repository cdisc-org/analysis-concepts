# Working-group walkthrough — smartphrase PoC

> ~15 minutes · one browser tab: `smartphrase/demo/index.html` (double-click; nothing is server-backed —
> if anything misbehaves, reload). Keep issues #9 and #11 open in spare tabs for the close.
> Drop the PrE0102 beat (7:45) for ~13 min, or the estimand beat (9:45) for ~12.

**Headline:** the SAP and the AC/DC model are two views of *one* thing — and this page holds exactly one
copy of that thing.

**Worked examples.** Stops 1–3 run on CDISC Pilot primary efficacy — change from baseline in
ADAS-Cog(11) at Week 24, ANCOVA, efficacy population — driven by transformation template
`T.CFB_ANCOVA` and method `M.ANCOVA` from the Transformation Library **v0.7 on `methods_02`**, loaded
verbatim. The 7:45 beat switches to a second study, PrECOG **PrE0102** (metastatic breast cancer,
progression-free survival, Kaplan-Meier), to show the same mechanism across therapeutic areas and
endpoint types. The 9:45 beat covers **estimands and intercurrent events** (issue #11) — the same
architecture carrying all five ICH E9(R1) attributes.

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

- **On PrE0102, hover "using Kaplan-Meier estimation"** → the popover shows a **Source** row: SAP 7.7.2,
  and the sentence itself. Then hover "censoring subjects lost to follow-up" — a phrase with *no
  bindings at all* — and it cites the SAP too.

> "That is the other half of traceability, and we only added it last week. Anchoring used to hang off the
> concept a phrase binds — but a method, a confidence level and a summary measure all resolve into the
> *library*, which is study-agnostic and must never contain SAP text. So those spans had no path back to
> the document at all; about half of every sentence was unciteable. The anchor now sits on the phrase
> *use*, which covers all of them, and the quotes are **verified** — the build fails if a quote is not in
> the section it cites. It caught a paraphrase of ours on the first run."

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

## 9:45 — Estimands and intercurrent events (2m)

**Action:** switch back to **CDISCPILOT01**. The primary passage is longer than it was at Stop 1.

> "This is the same object you edited at Stop 2, now carrying a full ICH E9(R1) estimand. Four of the five
> attributes were *already* in the sentence — treatment is the grouping phrase, the variable is the
> endpoint and timepoint, the population is the population phrase. Nobody designed them for E9(R1); they
> just happen to line up. What was missing was attribute 4, intercurrent-event handling, and attribute 5,
> the summary measure."

- Hover **"as if discontinuation of study treatment had not occurred"** → `SP_ICE_HYPOTHETICAL`, and note
  its anchor: `icheStrategy: Hypothetical`, a typed value from the model's own enum, not a string in prose.
- Hover **"summarised as the difference in least-squares means"** → the popover shows the *library's* own
  label alongside: **"T-based contrasts"**. Worth naming out loud.

> "That gap is a finding. The library's output vocabulary is written for analysts; SAP prose needs a
> different register. So the document wording lives in the language pack — English is a rendering pack like
> any other — and the library label stays visible so nobody thinks we renamed anything."

- **Click** the ICE phrase → the trace goes somewhere new: **an occurrence criterion**, not an ADaM class
  variable. `BC_DS_001/Disposition Event → (occurred, when) → ADSL.DCSREAS → adsl.xpt`.
- **Click the second ICE chip** ("regardless of use of concomitant AD medication") → `adcm.xpt`.

> "Two different chains from one sentence. This is a *different trace axis* from Stop 1: there we followed
> an analysis value, here we follow *did this event happen, and when*. And notice the ascertainment is
> strategy-independent — you recognise a discontinuation the same way regardless of how you then handle it,
> which is exactly how the eSAP model splits `ascertainedBy` from `implementedBy`."

**The load-bearing beat — Stop 3, the reuse grid:**

> "Look at the ADAS-Cog cards. `EST.PRIMARY` handles discontinuation as **Hypothetical**; `EST.SENS.TP`
> handles the *same event* as **TreatmentPolicy (override)**. One event, two handlings, with no second copy
> of the event anywhere — `IceHandling` is a reified (estimand, event, strategy) triple, so the strategy is
> a property of the *pairing*, not of the event.
>
> And note it is a sensitivity **estimand**, not a sensitivity analysis. Intercurrent-event handling is
> E9(R1) attribute 4 — change it and you have changed the question, so you have a different estimand. We
> had this wrong first time and the model corrected us: `IceHandling`'s own documentation gives exactly
> this example. Contrast the PrE0102 ITT case, which varies the *analysis set* — not an estimand attribute
> — and so is genuinely a sensitivity analysis of one estimand."

> "One more thing on that card: the Week 16 supporting analysis states no ICE clause at all, yet its
> estimand panel lists both events, marked *(inherited)*. Scope belongs to the estimand; strategy belongs
> to the analysis. Silence means 'handled as standard' — it must never be readable as 'no intercurrent
> events', and that distinction is enforced by the gate."

**Be straight about what it cost:**

> "This one needed two new **roles**, which is a library minor version, not a study addition — and because
> each language owns its word order explicitly, all three sentence templates had to change. That is the
> honest price. The strategy that had to *do* something, Hypothetical, resolves to `T.LOCF_Imputation` —
> real v0.7 content, not something we invented. TreatmentPolicy resolves to *nothing*, which is correct:
> data used as observed. The engine refuses a strategy the event declares no handling for, so the prose
> cannot promise something the model can't deliver."

> "Two of the five strategies are exercised. Composite, WhileOnTreatment and PrincipalStratum are written
> but not bound, because each needs library content v0.7 doesn't have — a folding derivation, a censoring
> derivation, counterfactual subsetting. We'd rather say that than imply coverage."

## 11:45 — Stop 4 · Standards grounding (1m15)

- The identifier table: USDM for study structure, ARS for analyses, STATO for methods, NCIt for
  terminology; AC/DC ids only where nothing exists yet, and unregistered ids are flagged *illustrative*.
- Provenance line: the library data is a generated verbatim subset of `methods_02@ffee5df`.
- The volatility card: the semantics are standoff — the SAP-structure initiative (M11-analogue) can land
  on any structure and this layer attaches unchanged.
- Note the honest gaps, both flagged *illustrative* because we would not invent an identifier:
  **no STATO or NCIt term for Kaplan-Meier estimation** was found (the upstream method file carries
  `ncitCode: null`), and **no resolvable term for the ICH E9(R1) strategies** — the enum is eSAP-owned and
  a guideline is not a registry. Both are listed rather than omitted, so the gap is visible.

## 13:00 — The ask (1m30)

> "Issue #9 now states requirements only; `smartphrase/DESIGN.md` records this design and why.
> The steer we need:
> 1. Does the working group accept **one-state / many-projections** as the smartphrase architecture?
> 2. Is **structured authoring** (phrases + typed placeholders, not free-text parsing) the right SAP→model story?
> 3. Should the identifier policy — *resolve into USDM/ARS/STATO/NCIt wherever they cover the entity* — become an AC/DC principle?
> 4. Who owns registering the currently-illustrative ids as the sister SAP-structure project spins up —
>    including finding or minting a term for Kaplan-Meier estimation?
> 5. **Who accepts contributions into the library, and what does that review look like?** Encoding one
>    real SAP produced a template (`T.PFS_KaplanMeier`). The estimand work produced two new **roles**,
>    six phrases, and a widened valid-phrase set on an existing released template — a library *minor
>    version*. That is a bigger ask than a template and needs an owner and a process.
> 6. **Should a released library require an anchor for phrases whose text is a claim about a document?**
>    A fixed-text phrase like "adjusting for period" asserts something the SAP says, by construction. We
>    kept the library untouched and put the anchor on the study side — but arguably such a phrase should
>    be unusable without a citation. That is a governance question, next to the ownership one above.
> 7. **Is `T.LOCF_Imputation` the right implementer for a Hypothetical strategy?** It is the only
>    imputation derivation v0.7 affords, but LOCF is a missing-data method and a hypothetical estimand
>    strictly wants imputation under a stated alternative assumption. The mechanism is right; we are
>    asking whether the content is."

---

### Pocket facts

- Sentence produced: *"Change from baseline in Alzheimer's Disease Assessment Scale - Cognitive Subscale
  (11 items) (ADAS-Cog(11)) at Week 24 in the efficacy (intent-to-treat) population comparing treatment
  groups using ANCOVA with 95% confidence intervals adjusting for baseline ADAS-Cog(11) will be assessed
  as the primary analysis."*
- PrE0102 sentence produced: *"Time to disease progression or death (PFS) in the eligible, treated
  population comparing treatment groups using Kaplan-Meier estimation with 90% confidence intervals will
  be assessed as the primary analysis."* Source: SAP §3.1, §5.3, §7.7.2 (converted in `smartphrase/SAP/`).
- Library: **23 smartphrases and 8 roles** verbatim from v0.7, plus **6 proposed phrases and 2 proposed
  roles** for the estimand work — 29 phrases and 10 roles merged. Generated subset holds 4 upstream
  templates and 9 output classes; one **proposed** template (`T.PFS_KaplanMeier`) makes 5.
  `T.CFB_ANCOVA`'s valid-phrase set is 9 upstream + 3 proposed = 12.
- Estimand facts: 8 analysis instances across 2 studies, **6 estimands**, 5 strategy phrases
  (2 exercised), 1 sensitivity estimand overriding a strategy on a shared event. The Hypothetical implementer is `T.LOCF_Imputation`, real v0.7 content.
- Languages: EN/FR/DE via language packs; DE headline: *"… wird im Vergleich der Behandlungsgruppen
  mittels ANCOVA … als primäre Analyse untersucht."* Tag source/model/graph identical across languages.
- Document anchoring: **33 of 33** PrE0102 phrase uses cite the source SAP, every quote verified verbatim
  against the converted text. The CDISC Pilot declares no source document and is exempt by declaration.
- Verified, and re-runnable: `tools/verify.mjs` (**86** pinned outputs across both studies),
  `tools/build-library-subset.mjs --check` (generated file unmodified), `tools/verify-ui.mjs` (headless
  DOM walkthrough of both studies, including per-ICE trace focus; fails on any console error). All green.
  `tools/diff-goldens.mjs` reviews a recapture leaf-by-leaf — a review aid, not a gate.
- If time-pressed: drop the estimand beat first, then PrE0102, then compress Stop 4 to the provenance line
  and the volatility sentence, then drop the i18n beat (just say it); **never cut Stop 2.**
- If asked "does German really work?": the estimand sentence keeps the *wird … untersucht* bracket with the
  ICE clause inside it, and the hypothetical uses Konjunktiv II (*als ob … nicht aufgetreten wäre*). The
  real limit found was **case**: German declines the ICE noun phrase differently per strategy, and one
  concept name cannot be both nominative and dative. All five *strategy phrase templates* were built
  nominative-compatible;
  a language with richer case marking would strain this.
