# Working-group walkthrough — smartphrase PoC

> ~10 minutes · one browser tab: `smartphrase/demo/index.html` (double-click; nothing is server-backed —
> if anything misbehaves, reload). Keep issue #9 open in a spare tab for the close.

**Headline:** the SAP and the AC/DC model are two views of *one* thing — and this page holds exactly one
copy of that thing.

**Worked example** (all four stops): CDISC Pilot primary efficacy — change from baseline in ADAS-Cog(11)
at Week 24, ANCOVA, efficacy population — driven by transformation template `T.CFB_ANCOVA` and method
`M.ANCOVA` from the Transformation Library **v0.7 on `methods_02`**, loaded verbatim.

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

- Three cards: primary ADAS-Cog(11)/Week 24, secondary NPI-X, supporting Week 16 — **same template**,
  only the highlighted bindings differ.
- Click *Open in editor* on the NPI-X card, then trace its endpoint at Stop 1: the chain now ends at
  `adnpix.xpt` — the trace follows the instance too.

> "Write the building block once in the library; every study analysis is bindings."

## 7:45 — Stop 4 · Standards grounding (1m)

- The identifier table: USDM for study structure, ARS for analyses, STATO for methods, NCIt for
  terminology; AC/DC ids only where nothing exists yet, and unregistered ids are flagged *illustrative*.
- Provenance line: the library data is a generated verbatim subset of `methods_02@ffee5df`.
- The volatility card: the semantics are standoff — the SAP-structure initiative (M11-analogue) can land
  on any structure and this layer attaches unchanged.

## 8:45 — The ask (1m)

> "Issue #9 now states requirements only; `smartphrase/DESIGN.md` records this design and why.
> The steer we need:
> 1. Does the working group accept **one-state / many-projections** as the smartphrase architecture?
> 2. Is **structured authoring** (phrases + typed placeholders, not free-text parsing) the right SAP→model story?
> 3. Should the identifier policy — *resolve into USDM/ARS/STATO/NCIt wherever they cover the entity* — become an AC/DC principle?
> 4. Who owns registering the currently-illustrative ids as the sister SAP-structure project spins up?"

---

### Pocket facts

- Sentence produced: *"Change from baseline in Alzheimer's Disease Assessment Scale - Cognitive Subscale
  (11 items) (ADAS-Cog(11)) at Week 24 in the efficacy (intent-to-treat) population comparing treatment
  groups using ANCOVA with 95% confidence intervals adjusting for baseline ADAS-Cog(11) will be assessed
  as the primary analysis."*
- Library: 23 smartphrases, 8 roles, `T.CFB_ANCOVA` valid-phrase set of 9 — all v0.7, verbatim.
- Languages: EN/FR/DE via language packs; DE headline: *"… wird im Vergleich der Behandlungsgruppen
  mittels ANCOVA … als primäre Analyse untersucht."* Tag source/model/graph identical across languages.
- Verified: engine round-trip byte-equal; 21 + 15 headless-browser end-to-end checks pass, no console errors.
- If time-pressed: compress Stop 4 to the provenance line and the volatility sentence, and drop the
  i18n beat (just say it); never cut Stop 2.
