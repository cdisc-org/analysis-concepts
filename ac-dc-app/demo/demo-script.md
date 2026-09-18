# eSAP PFS demo — voiceover script

**Video:** `esap-pfs-demo.mp4` — 6 min 34 s, 1440×900, silent
**Study:** Breast Cancer Study PrE0102 (NCT01797120), primary endpoint progression-free survival
**Pace:** ~128 words per minute; no beat exceeds 135 (table in Production notes).

*Italics* are direction, not narration. `‖` marks a pause where the picture is
doing the talking.

---

## Beat 1 — Select the study · 0:02–0:16 (14 s)

*Landing page; two study cards; the breast cancer study is clicked.*

> This is eSAP — an editor for building a statistical analysis plan a machine can
> actually run. ‖ We start with a study: a phase two breast cancer trial.

---

## Beat 2 — What the USDM already tells us · 0:16–0:42 (26 s)

*Arms, Objectives & Endpoints, Schedule of Activities, Narrative, Summary.*

> Nothing here was typed by hand. Every tab is read from the study's USDM — the
> CDISC Unified Study Definition Model. ‖ Arms. Objectives and endpoints. The
> schedule of activities. The protocol narrative. ‖ This is the protocol as
> structured data, and the plan extends it rather than restating it.

---

## Beat 3 — Choose the endpoint · 0:42–1:00 (18 s)

*Objectives & Endpoints; the primary endpoint is ticked.*

> The primary objective is progression-free survival in post-menopausal patients
> with hormone-receptor positive metastatic breast cancer. ‖ We take the primary
> endpoint it declares.

---

## Beat 4 — Author the endpoint · 1:00–2:02 (62 s)

*Concept category and data type; the fuller time-to-event phrase; three slots
appear and are filled; population and treatment phrases; the parameter typed in.*

> The protocol text is precise English — but it is still prose. ‖ To make it
> computable we say what kind of thing the endpoint is: a time-to-event, measured
> as a duration.
>
> Now the sentence. ‖ We choose the fuller time-to-event phrase — the one naming
> an origin, an event and a censoring rule — and watch. Three definition slots
> appear. We don't add them; the phrase asks for them.
>
> The clock starts when the subject is randomised. ‖ The event is disease
> progression or death — two concepts, not one, so the slot takes both. ‖ And we
> censor at the last tumour assessment.
>
> Then the dimensions the analysis will cut by: the population, and the treatment
> groups compared. ‖ Notice the sentence rewriting itself as we go. It is not a
> caption. It *is* the specification.

---

## Beat 5 — The analysis specification · 2:02–3:12 (70 s)

*The log-rank template is chosen; the page walks down through resolved bindings,
the model expression and method configuration, the declared outputs, and finally
the estimand.*

> An endpoint says what is measured. An analysis says what is done with it. ‖ The
> library offers only methods that fit a time-to-event endpoint — here, the
> log-rank test.
>
> The specification reads in three parts. ‖ First, what goes in. The bindings
> resolve themselves: time, event, treatment, subject — each a concept, with its
> role in the method and whether it is a measure or a dimension.
>
> *(scrolling)*
>
> Second, what is done. ‖ The model expression, written in concepts and shown
> against the variables that implement them — and the method's own configuration:
> the weight that makes this a log-rank rather than a Wilcoxon.
>
> *(scrolling)*
>
> Third, what comes out. ‖ The outputs are declared by the method itself:
> chi-squared, p-value, degrees of freedom.
>
> *(scrolling to the estimand)*
>
> And from those three, the estimand assembles itself. ‖ Population. Treatment.
> The endpoint variable. A comparison of survival distributions. ‖ The attributes
> ICH E9 asks for — none of them typed in.

---

## Beat 6 — Review · 3:12–3:28 (16 s)

*The Summary step.*

> Everything specified so far, in one place — endpoint, method, slices, and every
> concept the analysis binds to. ‖ Nothing written twice.

---

## Beat 7 — The eSAP, and its links back · 3:28–4:54 (86 s)

*The assembled plan; the USDM narrative picker is opened on section 1.1, the
protocol's primary objective is linked; then section 4's analysis is expanded;
then the JSON view.*

> Now the plan assembles itself, section by section. ‖ And each section can reach
> back into the protocol.
>
> *(opening the picker)*
>
> This is the study's own USDM narrative. ‖ We want the protocol's primary
> objective against the section on objectives, endpoints and estimands. ‖ There it
> is — the text as the protocol wrote it, with the identifier it carries in the
> USDM. ‖ Link it.
>
> *(applied)*
>
> The section now carries the protocol's own words, by reference. ‖ Not copied —
> linked. If the protocol changes, this points at the change.
>
> *(opening the analysis under section four)*
>
> And the analysis is not attached to the document — it is embedded in it. ‖ The
> formalised endpoint. The method. The model expression, in concepts and in
> variables. The outputs it will produce.
>
> *(switching to JSON)*
>
> Which means the plan is machine-readable too. ‖ The same document as JSON, with
> its provenance: the USDM, the AC/DC transformation model, the Analysis Results
> Standard. ‖ A human reads the document; a system reads this. One source.

---

## Beat 8 — The derivation pipeline · 4:54–5:40 (46 s)

*The Derivations step; the loaded chain; the execution order; then the dependency
graph.*

> Progression-free survival is not collected. It is derived. ‖ And a derivation is
> rarely one step — it is a pipeline.
>
> Eleven steps, in the order they must run. ‖ First progression date, first death
> date, the earliest of the two. The last tumour assessment. Time to first event.
> The censoring indicator. ‖ Each names the concept it produces, not the column it
> writes.
>
> *(the graph)*
>
> And they are not a list — they are a graph. ‖ The analysis at the top, its inputs
> beneath, and beneath those the observations they resolve from. ‖ Every dependency
> declared, so the chain can be checked before anything runs.

---

## Beat 9 — Execute · 5:40–6:34 (54 s)

*The Execute step; WebR initialises; DM, ZE and ADSL load; the population is
joined and set; Run all; results.*

> A specification that cannot run is just a document. ‖ So let us run it.
>
> The R engine starts inside the browser — no server, no install. ‖ We give it the
> collected data: demographics, the event records, and the subject-level dataset
> carrying the population flags. ‖ The population is bound to the data here, at
> execution: the plan names the population, the run decides which column
> expresses it.
>
> *(pause while it runs)*
>
> The derivation pipeline runs first, then the analysis. ‖ Progression-free
> survival, derived from collected data, compared between arms: chi-squared
> eighteen point six, one degree of freedom, p equals one point six times ten to
> the minus five. ‖ And the R that produced it was generated from the
> specification — not written by hand.

---

## Closing option (if an outro card is added)

> One specification. Readable as a document, executable as code, traceable to the
> protocol it came from.

---

## Production notes

- **Numbers:** chi-squared "eighteen point six" (screen reads 18.5776 — round it);
  p "one point six times ten to the minus five".
- **Pronunciation:** USDM as letters; ADaM as "AY-dam"; eSAP as "e-SAP"; WebR as
  "web R"; ICH E9 as "I-C-H E-nine".
- **Tone:** explanatory, unhurried. The four strongest moments are beat 4 (the
  sentence rewriting itself), beat 5 (the estimand assembling itself), beat 7 (the
  protocol text linked in by reference) and beat 9 (it runs). Slow down for all four.
- **Beats 5, 7 and 8 each contain scrolls or dialogs.** The `‖` pauses and the
  italic cues mark where the picture moves; if the read runs ahead, hold rather
  than fill.
- **Re-cutting:** `beats.json` holds the boundaries, `BUDGET` in `record_demo.py`
  sets them. Change a number and re-record rather than trimming in an editor.
  `convert.sh` refuses to overwrite a good mp4 with a short or truncated one.

- **Measured pace per beat:**

  | Beat | Window | Words | Pace |
  |---|---:|---:|---:|
  | 1 Select the study | 14 s | 28 | 120 wpm |
  | 2 What the USDM already tells us | 26 s | 48 | 111 wpm |
  | 3 Choose the endpoint | 18 s | 22 | 73 wpm |
  | 4 Author the endpoint | 62 s | 133 | 129 wpm |
  | 5 The analysis specification | 70 s | 148 | 127 wpm |
  | 6 Review | 16 s | 21 | 79 wpm |
  | 7 The eSAP, and its links back | 86 s | 151 | 105 wpm |
  | 8 The derivation pipeline | 46 s | 100 | 130 wpm |
  | 9 Execute | 54 s | 118 | 131 wpm |
