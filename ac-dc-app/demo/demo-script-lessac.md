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
| `00:01.880` | 1_1 | This is eSAP — an editor for building a statistical analysis plan a machine can actually run. |
| `00:07.803` | 1_2 | We start with a study: a phase two breast cancer trial. |
| | **Beat 2 — What the USDM already tells us** | *10–40s* |
| `00:11.611` | 2_1 | Nothing here was typed by hand. Every tab is read from the study's USDM — the CDISC Unified Study Definition Model. |
| `00:20.942` | 2_2 | The arms. |
| `00:23.597` | 2_3 | The objectives, and the endpoints they declare. |
| `00:28.182` | 2_4 | The schedule of activities. |
| `00:31.716` | 2_5 | The protocol narrative. |
| `00:34.790` | 2_6 | This is the protocol as structured data, and the plan extends it rather than restating it. |
| | **Beat 3 — Choose the endpoint** | *40–52s* |
| `00:41.541` | 3_1 | The primary objective is progression-free survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer. |
| `00:49.517` | 3_2 | We take the primary endpoint it declares. |
| | **Beat 4 — Author the endpoint** | *52–105s* |
| `00:53.654` | 4_1 | The protocol text is precise English — but it is still prose. |
| `00:57.973` | 4_2 | To make it computable we say what kind of thing the endpoint is: a time-to-event, measured as a duration. |
| `01:04.860` | 4_3 | Now the sentence. We choose the fuller time-to-event phrase — the one naming an origin, an event and a censoring rule — and watch. |
| `01:13.068` | 4_4 | Three definition slots appear. We don't add them; the phrase asks for them. |
| `01:17.994` | 4_5 | The clock starts when the subject is randomised. |
| `01:21.337` | 4_6 | The event is disease progression or death — two concepts, not one, so the slot takes both. |
| `01:27.525` | 4_7 | And we censor at the last tumour assessment. |
| `01:30.206` | 4_8 | Then the dimensions the analysis will cut by: the population, and the treatment groups compared. |
| `01:39.245` | 4_9 | Notice the sentence rewriting itself as we go. It is not a caption. It is the specification. |
| | **Beat 5 — The analysis specification** | *105–168s* |
| `01:46.961` | 5_1 | An endpoint says what is measured. An analysis says what is done with it. |
| `01:51.563` | 5_2 | The library offers only methods that fit a time-to-event endpoint — here, the log-rank test. |
| `01:57.634` | 5_3 | The specification reads in three parts. First, what goes in. |
| `02:02.584` | 5_4 | The bindings resolve themselves: time, event, treatment, subject — each a concept, with its role in the method, and whether it is a measure or a dimension. |
| `02:13.276` | 5_5 | Second, what is done. The model expression, written in concepts and shown against the variables that implement them. |
| `02:20.279` | 5_6 | And the method's own configuration: the weight that makes this a log-rank rather than a Wilcoxon. |
| `02:26.394` | 5_7 | Third, what comes out. The outputs are declared by the method itself: chi-squared, p-value, degrees of freedom. |
| `02:34.517` | 5_8 | And from those three, the estimand assembles itself. |
| `02:38.106` | 5_9 | Population. Treatment. The endpoint variable. A comparison of survival distributions. |
| `02:43.830` | 5_10 | The attributes ICH E9 asks for — none of them typed in. |
| | **Beat 6 — Review** | *168–181s* |
| `02:50.312` | 6_1 | Everything specified so far, in one place — endpoint, method, slices, and every concept the analysis binds to. |
| `02:59.541` | 6_2 | Nothing written twice. |
| | **Beat 7 — The eSAP, and its links back** | *181–250s* |
| `03:03.598` | 7_1 | Now the plan assembles itself, section by section. And each section can reach back into the protocol. |
| `03:09.936` | 7_2 | This is the study's own USDM narrative. |
| `03:12.907` | 7_3 | We want the protocol's primary objective against the section on objectives, endpoints and estimands. |
| `03:21.200` | 7_4 | There it is — the text as the protocol wrote it, with the identifier it carries in the USDM. |
| `03:28.716` | 7_5 | Link it. |
| `03:31.217` | 7_6 | The section now carries the protocol's own words, by reference. Not copied — linked. If the protocol changes, this points at the change. |
| `03:41.612` | 7_7 | And the analysis is not attached to the document — it is embedded in it. |
| `03:46.093` | 7_8 | The formalised endpoint. The method. The model expression, in concepts and in variables. The outputs it will produce. |
| `03:53.593` | 7_9 | Which means the plan is machine-readable too. |
| `03:57.003` | 7_10 | The same document as JSON, with its provenance: the USDM, the AC/DC transformation model, the Analysis Results Standard. |
| `04:05.885` | 7_11 | A human reads the document; a system reads this. One source. |
| | **Beat 8 — The derivation pipeline** | *250–294s* |
| `04:12.224` | 8_1 | Progression-free survival is not collected. It is derived. |
| `04:16.207` | 8_2 | And a derivation is rarely one step — it is a pipeline. |
| `04:21.742` | 8_3 | Eleven steps, in the order they must run. |
| `04:25.537` | 8_4 | First progression date, first death date, the earliest of the two. The last tumour assessment. Time to first event. The censoring indicator. |
| `04:34.032` | 8_5 | Each names the concept it produces, not the column it writes. |
| `04:38.991` | 8_6 | And they are not a list — they are a graph. |
| `04:42.289` | 8_7 | The analysis at the top, its inputs beneath, and beneath those the observations they resolve from. |
| `04:48.568` | 8_8 | Every dependency declared, so the chain can be checked before anything runs. |
| | **Beat 9 — Execute** | *294–354s* |
| `04:55.448` | 9_1 | A specification that cannot run is just a document. So let us run it. |
| `04:59.852` | 9_2 | The R engine starts inside the browser — no server, no install. |
| `05:10.984` | 9_3 | We give it the collected data: demographics, the event records, and the subject-level dataset carrying the population flags. |
| `05:18.878` | 9_3b | One primary dataset, because the engine reads one — the others join to it. |
| `05:23.765` | 9_4 | The population is bound to the data here, at execution: the plan names the population, the run decides which column expresses it. |
| `05:31.497` | 9_5 | The derivation pipeline runs first, then the analysis. |
| `05:36.658` | 9_6 | Progression-free survival, derived from collected data, compared between arms: chi-squared eighteen point six, one degree of freedom, p equals one point six times ten to the minus five. |
| `05:48.705` | 9_7 | And the R that produced it was generated from the specification — not written by hand. |

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

- 58 lines, 5m41s of speech in 6m53s (80% talking).
- No two lines overlap; the recorder enforces that narration is serial.
- The one long silence is at the WebR engine start — that pause is real
  and line 9_2 covers it.
- Changing any wording means re-running `synth`, `record_demo.py`,
  `convert.sh`, `mux` and `script` — the timings come from the audio.
