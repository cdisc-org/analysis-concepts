# Sprint Demo Script — Smartphrase PoC (issue #9)

> **Duration:** 10 minutes · **Format:** screen-share walkthrough of the three demos
> **Headline:** the SAP and the AC/DC model are now two views of *one* thing — and the link runs both ways.

---

## Before you start (2-min prep)

- [ ] Open all four pages in browser tabs, in this order:
      `demo/index.html` · `demo/hover-demo.html` · `demo/resolve-demo.html` · `demo/trace-demo.html`
- [ ] Browser zoom to ~125–150% so text is legible on the share.
- [ ] On **resolve-demo**, click back to the *Resolved prose* tab so it's the first thing shown.
- [ ] Have the GitHub issue #9 open in a spare tab (for the "what's next" ask).
- [ ] One-line reminder of the worked example: *change from baseline in ADAS-Cog(11) at Week 24, ANCOVA, efficacy population* (CDISC Pilot).

**If a demo misbehaves:** they're static files — just reload the tab. Nothing is server-backed.

---

## Timeline at a glance

| Time | Segment | Tab |
|------|---------|-----|
| 0:00–1:15 | The problem + what we built | index.html |
| 1:15–3:00 | **Hover** — inspect the link | hover-demo.html |
| 3:00–6:00 | **Resolve** — the bidirectional headline | resolve-demo.html |
| 6:00–8:00 | **Trace** — provenance to the data | trace-demo.html |
| 8:00–9:00 | How it's built / standards alignment | (resolve or slide) |
| 9:00–10:00 | What's next + the ask | issue #9 |

---

## 0:00 — The problem (45s) · *index.html*

> "A Statistical Analysis Plan is prose written for humans. The AC/DC model is metadata written for machines. Today those two live in separate worlds — someone writes the SAP, and *separately* someone encodes the analyses as model metadata, and the two drift.
>
> The smartphrase layer closes that gap: it links spans of SAP text to the AC/DC model so the prose and the metadata are the *same source of truth*. This PoC shows that working three ways."

**Action:** point at the three cards on the landing page — Hover / Resolve / Trace — and read the one-liner under each:
> "Inspect what a phrase is linked to · author it in both directions · trace where the number comes from."

---

## 1:15 — Hover: inspect the link (1m45s) · *hover-demo.html*

> "Here's a finished SAP sentence — section 4.1.2, the main analytical approach. Looks like ordinary prose. But every highlighted span is a *smartphrase* bound to the model."

**Action:** hover **"change from baseline in ADAS-Cog(11)"**. Let the inspector populate.

> "Hovering reveals what's underneath: this is `SP_CFB_ENDPOINT`, role *endpoint*, with the template `change from baseline in {parameter}`. The `{parameter}` placeholder is bound to a concept — ADAS-Cog(11) — and crucially it carries a **grounding IRI** into a real standard, not a private ID."

**Action:** hover **"using ANCOVA"**.

> "Same idea for the method — bound to `M.ANCOVA`, with the model formula and a STATO IRI."

**Action:** hover the dashed **`smartphrase:analysis`** chip at the top.

> "And at the section level, the whole analysis is tied to its template `T.CFB_ANCOVA`, its method, the **USDM objective** it addresses, and the **ARS analysis** it corresponds to. So a reader — or a tool — can interrogate the model behind any sentence without leaving the document."

---

## 3:00 — Resolve: the bidirectional headline (3m) · *resolve-demo.html*

> "This is the heart of it. The screen is split: on the **left, the AC/DC model instance**; on the **right, the SAP prose**. The link is co-equal — change either side and the other follows."

**Action:** make sure *Resolved prose* tab is showing. Read the resolved sentence aloud once:

> *"Change from baseline in Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items) (ADAS-Cog(11)) at Week 24 in the efficacy (intent-to-treat) population comparing treatment groups using ANCOVA with 95% confidence intervals adjusting for baseline ADAS-Cog(11) will be assessed as the primary analysis."*

> "Every coloured span was generated from the model — none of it was typed by hand."

### Model → SAP (90s)
**Action:** on the left, change the **parameter** dropdown from ADAS-Cog(11) to **CIBIC+**.
> "Change the bound concept on the model side — and the prose rewrites itself."

**Action:** change the **render mode** on the endpoint from `long_with_short` to `short`.
> "Render modes control how a concept appears — full label, abbreviation, or both. Same model, different prose."

**Action:** change **visit** to Week 8, then back; toggle the **confidence-level** phrase off and on.
> "Optional phrases — confidence intervals, covariates — flip in and out. This is *model → SAP*: the document is a view of the model."

### SAP → Model (60s)
**Action:** switch to the **Constructed AC instance** tab.
> "Now the other direction. This panel is *rebuilt from the same bindings* — it's the model metadata you'd instantiate by authoring this passage. Watch what happens when I change the prose-side bindings."

**Action:** change a binding (e.g. population to **safety**) and point at the JSON updating, including the IRI.
> "Editing the prose *is* editing the model. Bound roles, concept IDs, grounding IRIs — all reconstructed. That's the bidirectionality: authoring and generating are the same operation from two ends."

**Action:** briefly show the **Tagged source** tab.
> "And this is the actual `sap:` / `smartphrase:` XML that carries it — the namespaces from the spec, live."

---

## 6:00 — Trace: provenance to the data (2m) · *trace-demo.html*

> "Last mode answers the question a reviewer always asks: *where does this number actually come from?*"

**Action:** the endpoint chain is pre-loaded. Walk down the four tiers with your cursor.

> "Click the endpoint phrase and you get the full resolution chain, four tiers:
> 1. **DataConcept** — *Change from Baseline*, the model element.
> 2. **ADaM Class Variable** — `CHG` in the BDS structure, the standard variable.
> 3. **Study variable** — `CHG` in `ADQSADAS`, *where PARAMCD = ACTOT and AVISITN = 24* — the specific ADAS-Cog Week-24 record.
> 4. **Physical dataset** — `adqsadas.xpt`, keyed by USUBJID / PARAMCD / AVISIT."

**Action:** click the **"in the efficacy population"** phrase.
> "Different phrase, different chain — the population traces down to the `ITTFL = 'Y'` flag in `ADSL`."

**Action:** click the **treatment grouping** phrase.
> "And treatment groups trace to `TRTP` in the subject-level dataset. So from one sentence in the SAP, we can follow any concept all the way to the column it lives in. That's traceability regulators and reviewers can actually use."

---

## 8:00 — How it's built (1m) · *stay on a demo*

> "A few things worth noting for the team:
> - **Self-contained** — these are static HTML files. No server, no build. You can email them, they run from `file://`.
> - **One source of truth** — all three demos read a single model fragment (`acdc-data.js`); the JSON export is auto-derived from it so they can't drift. The smartphrase and role definitions are lifted straight from the **Transformation Library v0.6**.
> - **Standards-aligned identifiers** — bindings resolve into **USDM** (objectives, populations), **ARS** (analyses, methods), **STATO** and the **AC/DC LinkML** model — not a bespoke ID space. Anything not yet authoritative is flagged *illustrative*, so we're honest about what's real."

---

## 9:00 — What's next + the ask (1m) · *issue #9*

> "Where this goes from here:
> - Encode the **full CDISC Pilot SAP** as one `sap:` + `smartphrase:` document — these demos exercise the primary analysis; next is a whole document end-to-end.
> - A second study (breast cancer) once we have a source SAP.
> - Longer term, the spec review flags the bigger architectural questions — schema, governance, whether the carrier stays XHTML — captured in `spec/format-evaluation.md`."

**The ask (close on this):**
> "What I'd like from the group: does the **bidirectional model⇄SAP framing** land? And should smartphrase identifiers resolve into **USDM/ARS** wherever those standards already cover the entity? Those two answers shape the next sprint."

---

## Pocket cheat-sheet (glance during the demo)

- **Study:** CDISC Pilot (CDISCPILOT01) · Alzheimer's / Xanomeline
- **Analysis:** primary efficacy — CFB in ADAS-Cog(11) @ Week 24, ANCOVA, efficacy (ITT) pop
- **Template / method:** `T.CFB_ANCOVA` / `M.ANCOVA` · formula `CHG ~ TRTP + BASE + SITEGR1`
- **Trace bottom:** `adqsadas.xpt`, `PARAMCD='ACTOT'`, `AVISITN=24`
- **Three modes in one breath:** *inspect · author both ways · trace to data*
- **One-sentence pitch:** "The SAP and the model become two views of one thing, and the link runs both ways."
