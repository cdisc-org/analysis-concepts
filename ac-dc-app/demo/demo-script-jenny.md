# eSAP PFS demo — voiceover script (line-level cues)

Every line carries the exact second it begins in `esap-pfs-demo.mp4`.
The video was **cut to this narration** — each line's on-screen moment is
held for as long as the line takes — so reading to these marks stays in
sync without drifting inside a beat.

`esap-pfs-demo-vo.mp4` has a synthesised guide track at these same marks:
robotic, but exactly on time. Read along with it to find the pace.

| Cue | Line | Says |
|---|---|---|
| | **Beat 1 — Select the study** | *2–10s* |
| `00:01.883` | 1_1 | This is eSAP — an editor for building a statistical analysis plan a machine can actually run. |
| `00:08.220` | 1_2 | We start with a study: a phase two breast cancer trial. |
| | **Beat 2 — What the USDM already tells us** | *10–40s* |
| `00:11.831` | 2_1 | Nothing here was typed by hand. Every tab is read from the study's USDM — the CDISC Unified Study Definition Model. |
| `00:21.138` | 2_2 | The arms. |
| `00:23.555` | 2_3 | The objectives, and the endpoints they declare. |
| `00:27.955` | 2_4 | The schedule of activities. |
| `00:31.124` | 2_5 | The protocol narrative. |
| `00:34.134` | 2_6 | This is the protocol as structured data, and the plan extends it rather than restating it. |
| | **Beat 3 — Choose the endpoint** | *40–52s* |
| `00:41.253` | 3_1 | The primary objective is progression-free survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer. |
| `00:50.330` | 3_2 | We take the primary endpoint it declares. |
| | **Beat 4 — Author the endpoint** | *52–104s* |
| `00:54.394` | 4_1 | The protocol text is precise English — but it is still prose. |
| `00:58.603` | 4_2 | To make it computable we say what kind of thing the endpoint is: a time-to-event, measured as a duration. |
| `01:05.092` | 4_3 | Now the sentence. We choose the fuller time-to-event phrase — the one naming an origin, an event and a censoring rule — and watch. |
| `01:12.660` | 4_4 | Three definition slots appear. We don't add them; the phrase asks for them. |
| `01:17.351` | 4_5 | The clock starts when the subject is randomised. |
| `01:20.252` | 4_6 | The event is disease progression or death — two concepts, not one, so the slot takes both. |
| `01:26.197` | 4_7 | And we censor at the last tumour assessment. |
| `01:29.064` | 4_8 | Then the dimensions the analysis will cut by: the population, and the treatment groups compared. |
| `01:38.089` | 4_9 | Notice the sentence rewriting itself as we go. It is not a caption. It is the specification. |
| | **Beat 5 — The analysis specification** | *104–167s* |
| `01:45.764` | 5_1 | An endpoint says what is measured. An analysis says what is done with it. |
| `01:50.547` | 5_2 | The library offers only methods that fit a time-to-event endpoint — here, the log-rank test. |
| `01:56.316` | 5_3 | The specification reads in three parts. First, what goes in. |
| `02:01.305` | 5_4 | The bindings resolve themselves: time, event, treatment, subject — each a concept, with its role in the method, and whether it is a measure or a dimension. |
| `02:11.623` | 5_5 | Second, what is done. The model expression, written in concepts and shown against the variables that implement them. |
| `02:18.402` | 5_6 | And the method's own configuration: the weight that makes this a log-rank rather than a Wilcoxon. |
| `02:25.001` | 5_7 | Third, what comes out. The outputs are declared by the method itself: chi-squared, p-value, degrees of freedom. |
| `02:32.703` | 5_8 | And from those three, the estimand assembles itself. |
| `02:36.556` | 5_9 | Population. Treatment. The endpoint variable. A comparison of survival distributions. |
| `02:42.315` | 5_10 | The attributes ICH E9 asks for — none of them typed in. |
| | **Beat 6 — Review** | *167–179s* |
| `02:48.790` | 6_1 | Everything specified so far, in one place — endpoint, method, slices, and every concept the analysis binds to. |
| `02:57.635` | 6_2 | Nothing written twice. |
| | **Beat 7 — The eSAP, and its links back** | *179–249s* |
| `03:01.368` | 7_1 | Now the plan assembles itself, section by section. And each section can reach back into the protocol. |
| `03:07.893` | 7_2 | This is the study's own USDM narrative. |
| `03:11.387` | 7_3 | We want the protocol's primary objective against the section on objectives, endpoints and estimands. |
| `03:20.078` | 7_4 | There it is — the text as the protocol wrote it, with the identifier it carries in the USDM. |
| `03:27.610` | 7_5 | Link it. |
| `03:30.115` | 7_6 | The section now carries the protocol's own words, by reference. Not copied — linked. If the protocol changes, this points at the change. |
| `03:40.075` | 7_7 | And the analysis is not attached to the document — it is embedded in it. |
| `03:44.775` | 7_8 | The formalised endpoint. The method. The model expression, in concepts and in variables. The outputs it will produce. |
| `03:52.019` | 7_9 | Which means the plan is machine-readable too. |
| `03:55.431` | 7_10 | The same document as JSON, with its provenance: the USDM, the AC/DC transformation model, the Analysis Results Standard. |
| `04:04.743` | 7_11 | A human reads the document; a system reads this. One source. |
| | **Beat 8 — The derivation pipeline** | *249–292s* |
| `04:11.017` | 8_1 | Progression-free survival is not collected. It is derived. |
| `04:14.815` | 8_2 | And a derivation is rarely one step — it is a pipeline. |
| `04:20.332` | 8_3 | Eleven steps, in the order they must run. |
| `04:23.772` | 8_4 | First progression date, first death date, the earliest of the two. The last tumour assessment. Time to first event. The censoring indicator. |
| `04:32.410` | 8_5 | Each names the concept it produces, not the column it writes. |
| `04:37.152` | 8_6 | And they are not a list — they are a graph. |
| `04:40.763` | 8_7 | The analysis at the top, its inputs beneath, and beneath those the observations they resolve from. |
| `04:46.883` | 8_8 | Every dependency declared, so the chain can be checked before anything runs. |
| | **Beat 9 — Execute** | *292–354s* |
| `04:53.870` | 9_1 | A specification that cannot run is just a document. So let us run it. |
| `04:58.594` | 9_2 | The R engine starts inside the browser — no server, no install. |
| `05:10.063` | 9_3 | We give it the collected data: demographics, the event records, and the subject-level dataset carrying the population flags. |
| `05:17.784` | 9_3b | One primary dataset, because the engine reads one — the others join to it. |
| `05:22.389` | 9_4 | The population is bound to the data here, at execution: the plan names the population, the run decides which column expresses it. |
| `05:30.681` | 9_5 | The derivation pipeline runs first, then the analysis. |
| `05:35.867` | 9_6 | Progression-free survival, derived from collected data, compared between arms: chi-squared eighteen point six, one degree of freedom, p equals one point six times ten to the minus five. |
| `05:48.833` | 9_7 | And the R that produced it was generated from the specification — not written by hand. |

## Reading it

- **Numbers:** chi-squared "eighteen point six" (screen reads 18.5776);
  p "one point six times ten to the minus five".
- **Pronunciation:** USDM as letters; ADaM as "AY-dam"; eSAP as "e-SAP";
  WebR as "web R"; ICH E9 written out as "I C H E nine" in the lines below
  so the synthesiser says it correctly — read it naturally.
- **Tone:** explanatory, unhurried. The strongest moments are 4_9 (the
  sentence rewriting itself), 5_8-5_10 (the estimand assembling itself),
  7_6 (the protocol text linked by reference) and 9_6 (it ran).

## Notes

- 58 lines, 5m41s of speech in 6m54s (80% talking).
- No two lines overlap; the recorder enforces that narration is serial.
- The one long silence is at the WebR engine start — that pause is real
  and line 9_2 covers it.
- Changing any wording means re-running `synth`, `record_demo.py`,
  `convert.sh`, `mux` and `script` — the timings come from the audio.
