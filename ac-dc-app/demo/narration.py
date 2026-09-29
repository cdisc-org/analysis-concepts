"""The narration, as data — one entry per spoken line.

This is the single source of truth for what is said and, because the recorder
waits for each line's measured audio duration, for how long the picture holds.
The video is cut to the voice rather than the other way round, which is what
keeps them in sync.

Keys are `<beat>_<n>`. `record_demo.py` calls `d.line("4_3")` at the moment that
line should begin; `build_voiceover.py` synthesises the same text and places it
at the timestamp the recorder logged.
"""

# Which voice renders the guide track. Piper is a neural synthesiser that runs
# offline; the models live in ./voices (gitignored -- see README for the download
# command). The macOS `say` voices it replaced were concatenative, which is what
# made them sound stitched together.
#
# Selected per run by the VOICE_LABEL environment variable so one script can
# build several versions without clobbering the others' artefacts.
VOICES = {
    "lessac": "en_US-lessac-high",          # US, the highest-quality model here
    "jenny":  "en_GB-jenny_dioco-medium",   # GB
}
import os as _os
LABEL = _os.environ.get("VOICE_LABEL", "lessac")
VOICE = VOICES[LABEL]

# Piper's pace control. 1.0 is the model's natural rate; higher is slower.
# Unlike `say -r`, this responds linearly and predictably.
LENGTH_SCALE = float(_os.environ.get("VOICE_PACE", "1.0"))

# Seconds of silence appended after each line, so sentences do not run together
# and the picture has a beat to settle.
GAP = 0.45

# Pronunciation fixes applied ONLY to the synthesised audio. LINES keeps the real
# spelling, so the written script and the subtitles read correctly -- otherwise
# the .srt would show viewers "ee SAP" and "U S D M".
# "ee SAP" came out as "ee-zap": an s between voiced sounds tends to voice into
# /z/, the same rule that makes "easy" a Z. Doubling the consonant forces the
# unvoiced /s/ back.
SAY_AS = {
    "eSAP":   "ee Sapp",
    "USDM":   "U,S,D,M",
    "ICH E9": "I C H E nine",
    "AC/DC":  "A C D C",
    "WebR":   "web R",
    "ADaM":   "AY dam",
}

# Voices differ on how they break an initialism apart -- chosen by ear per voice.
SAY_AS_BY_VOICE = {
    "jenny": {"USDM": "U-S-D-M"},
}


def spoken(text, label=None):
    """The text as the synthesiser should say it, for the active voice."""
    rules = dict(SAY_AS)
    rules.update(SAY_AS_BY_VOICE.get(label or LABEL, {}))
    for written, said in rules.items():
        text = text.replace(written, said)
    return text

LINES = {
    # ---- 1. Select the study ----------------------------------------------
    "1_1": "This is eSAP — an editor for building a statistical analysis plan a machine can actually run.",
    "1_2": "We start with a study: a phase two breast cancer trial.",

    # ---- 2. What the USDM already tells us ---------------------------------
    "2_1": "Nothing here was typed by hand. Every tab is read from the study's USDM — the CDISC Unified Study Definition Model.",
    "2_2": "The arms.",
    "2_3": "The objectives, and the endpoints they declare.",
    "2_4": "The schedule of activities.",
    "2_5": "The protocol narrative.",
    "2_6": "This is the protocol as structured data, and the plan extends it rather than restating it.",

    # ---- 3. Choose the endpoint --------------------------------------------
    "3_1": "The primary objective is progression-free survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer.",
    "3_2": "We take the primary endpoint it declares.",

    # ---- 4. Author the endpoint --------------------------------------------
    "4_1": "The protocol text is precise English — but it is still prose.",
    "4_2": "To make it computable we say what kind of thing the endpoint is: a time-to-event, measured as a duration.",
    "4_3": "Now the sentence. We choose the fuller time-to-event phrase — the one naming an origin, an event and a censoring rule — and watch.",
    "4_4": "Three definition slots appear. We don't add them; the phrase asks for them.",
    "4_5": "The clock starts when the subject is randomised.",
    "4_6": "The event is disease progression or death — two concepts, not one, so the slot takes both.",
    "4_7": "And we censor at the last tumour assessment.",
    "4_8": "Then the dimensions the analysis will cut by: the population, and the treatment groups compared.",
    "4_9": "Notice the sentence rewriting itself as we go. It is not a caption. It is the specification.",

    # ---- 5. The analysis specification --------------------------------------
    "5_1": "An endpoint says what is measured. An analysis says what is done with it.",
    "5_2": "The library offers only methods that fit a time-to-event endpoint — here, the log-rank test.",
    "5_3": "The specification reads in three parts. First, what goes in.",
    "5_4": "The bindings resolve themselves: time, event, treatment, subject — each a concept, with its role in the method, and whether it is a measure or a dimension.",
    "5_5": "Second, what is done. The model expression, written in concepts and shown against the variables that implement them.",
    "5_6": "And the method's own configuration: the weight that makes this a log-rank rather than a Wilcoxon.",
    "5_7": "Third, what comes out. The outputs are declared by the method itself: chi-squared, p-value, degrees of freedom.",
    "5_8": "And from those three, the estimand assembles itself.",
    "5_9": "Population. Treatment. The endpoint variable. A comparison of survival distributions.",
    "5_10": "The attributes ICH E9 asks for — none of them typed in.",

    # ---- 6. Review ----------------------------------------------------------
    "6_1": "Everything specified so far, in one place — endpoint, method, slices, and every concept the analysis binds to.",
    "6_2": "Nothing written twice.",

    # ---- 7. The eSAP, and its links back -------------------------------------
    "7_1": "Now the plan assembles itself, section by section. And each section can reach back into the protocol.",
    "7_2": "This is the study's own USDM narrative.",
    "7_3": "We want the protocol's primary objective against the section on objectives, endpoints and estimands.",
    "7_4": "There it is — the text as the protocol wrote it, with the identifier it carries in the USDM.",
    "7_5": "Link it.",
    "7_6": "The section now carries the protocol's own words, by reference. Not copied — linked. If the protocol changes, this points at the change.",
    "7_7": "And the analysis is not attached to the document — it is embedded in it.",
    "7_8": "The formalised endpoint. The method. The model expression, in concepts and in variables. The outputs it will produce.",
    "7_9": "Which means the plan is machine-readable too.",
    "7_10": "The same document as JSON, with its provenance: the USDM, the AC/DC transformation model, the Analysis Results Standard.",
    "7_11": "A human reads the document; a system reads this. One source.",

    # ---- 8. The derivation pipeline ------------------------------------------
    "8_1": "Progression-free survival is not collected. It is derived.",
    "8_2": "And a derivation is rarely one step — it is a pipeline.",
    "8_3": "Eleven steps, in the order they must run.",
    "8_4": "First progression date, first death date, the earliest of the two. The last tumour assessment. Time to first event. The censoring indicator.",
    "8_5": "Each names the concept it produces, not the column it writes.",
    "8_6": "And they are not a list — they are a graph.",
    "8_7": "The analysis at the top, its inputs beneath, and beneath those the observations they resolve from.",
    "8_8": "Every dependency declared, so the chain can be checked before anything runs.",

    # ---- 9. Execute -----------------------------------------------------------
    "9_1": "A specification that cannot run is just a document. So let us run it.",
    "9_2": "The R engine starts inside the browser — no server, no install.",
    "9_3": "We give it the collected data: demographics, the event records, and the subject-level dataset carrying the population flags.",
    "9_3b": "One primary dataset, because the engine reads one — the others join to it.",
    "9_4": "The population is bound to the data here, at execution: the plan names the population, the run decides which column expresses it.",
    "9_5": "The derivation pipeline runs first, then the analysis.",
    "9_6": "Progression-free survival, derived from collected data, compared between arms: chi-squared eighteen point six, one degree of freedom, p equals one point six times ten to the minus five.",
    "9_7": "And the R that produced it was generated from the specification — not written by hand.",
}


def beat_of(key):
    return int(key.split("_")[0])


def _order(key):
    """Sort key tolerant of lettered suffixes: 9_3 < 9_3b < 9_4."""
    tail = key.split("_")[1]
    digits = "".join(c for c in tail if c.isdigit())
    letters = "".join(c for c in tail if not c.isdigit())
    return (int(digits), letters)


def keys_for_beat(n):
    """Line keys for one beat, in spoken order."""
    return sorted((k for k in LINES if beat_of(k) == n), key=_order)
