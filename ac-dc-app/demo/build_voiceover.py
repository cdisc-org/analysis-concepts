"""Synthesise the narration, then assemble it against the recorder's cue log.

Two phases, because the video is cut to the voice:

    build_voiceover.py synth   -- render every line, measure it, write durations.json
                                  (run BEFORE recording; record_demo.py reads the
                                   durations so each line gets the time it needs)

    build_voiceover.py mux     -- place each rendered line at the timestamp the
                                  recorder logged in cues.json, then mux the
                                  resulting track into the mp4

The guide voice is a macOS system voice. It is exactly on time but obviously
synthetic -- a temp track and a timing reference, not a finished narration.
"""

import json
import os
import subprocess
import sys

from narration import LINES, VOICE, LABEL, LENGTH_SCALE, GAP, spoken

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "voices")
CLIPS = os.path.join(HERE, f"vo-clips-{LABEL}")
DURATIONS = os.path.join(HERE, f"durations-{LABEL}.json")
CUES = os.path.join(HERE, f"cues-{LABEL}.json")
VIDEO = os.path.join(HERE, f"esap-pfs-demo-{LABEL}.mp4")
OUT = os.path.join(HERE, f"esap-pfs-demo-{LABEL}-vo.mp4")
TRACK = os.path.join(HERE, f"voiceover-{LABEL}.m4a")
PYBIN = sys.executable


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def synth():
    os.makedirs(CLIPS, exist_ok=True)
    durations = {}
    model = os.path.join(MODELS, f"{VOICE}.onnx")
    if not os.path.exists(model):
        sys.exit(f"missing voice model {model}\n"
                 f"  {PYBIN} -m piper.download_voices --download-dir {MODELS} {VOICE}")
    for key, text in LINES.items():
        wav = os.path.join(CLIPS, f"{key}.wav")
        subprocess.run(
            [PYBIN, "-m", "piper", "-m", model, "-f", wav,
             "--length-scale", str(LENGTH_SCALE)],
            input=spoken(text, LABEL), text=True, check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        durations[key] = round(duration(wav), 3)
    json.dump(durations, open(DURATIONS, "w"), indent=2, sort_keys=True)

    total = sum(durations.values()) + GAP * len(durations)
    print(f"{len(durations)} lines rendered with {VOICE} -> {CLIPS}")
    print(f"speech {total/60:.0f}m{total%60:04.1f}s including {GAP}s gaps")
    longest = sorted(durations.items(), key=lambda kv: -kv[1])[:3]
    for k, v in longest:
        print(f"   longest  {k:<5} {v:5.1f}s  {LINES[k][:60]}...")


def mux():
    for path, what in ((CUES, "cue log"), (DURATIONS, "durations"), (VIDEO, "video")):
        if not os.path.exists(path):
            sys.exit(f"missing {what}: {path}")

    cues = json.load(open(CUES))          # {key: start_seconds}
    vid_len = duration(VIDEO)

    # Build one filter graph: every clip delayed to its cue, all mixed together.
    inputs, filters, labels = [], [], []
    for i, (key, start) in enumerate(sorted(cues.items(), key=lambda kv: kv[1])):
        clip = os.path.join(CLIPS, f"{key}.wav")
        if not os.path.exists(clip):
            print(f"  skip {key}: no clip"); continue
        if start + duration(clip) > vid_len:
            print(f"  WARNING {key} runs past the end of the video")
        inputs += ["-i", clip]
        filters.append(f"[{i}:a]adelay={int(start*1000)}|{int(start*1000)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a{i}]")
        labels.append(f"[a{i}]")

    graph = ";".join(filters) + f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0[out]"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *inputs,
         "-filter_complex", graph, "-map", "[out]",
         "-c:a", "aac", "-b:a", "128k", TRACK], check=True)
    print(f"track: {TRACK}  ({duration(TRACK):.1f}s)")

    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", VIDEO, "-i", TRACK,
         "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
         "-map", "0:v:0", "-map", "1:a:0", "-shortest",
         "-movflags", "+faststart", OUT], check=True)
    print(f"muxed: {OUT}  ({duration(OUT):.1f}s)")


def _ts(sec, comma=True):
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    frac = f"{s:06.3f}".replace(".", "," if comma else ".")
    return f"{int(h):02d}:{int(m):02d}:{frac}"


def script():
    """Emit demo.srt and a line-level script from the recorder's cue log."""
    cues = json.load(open(CUES))
    durs = json.load(open(DURATIONS))
    beats = {b["beat"]: b for b in json.load(open(os.path.join(HERE, f"beats-{LABEL}.json")))}
    order = sorted(cues.items(), key=lambda kv: kv[1])

    # --- subtitles --------------------------------------------------------
    srt = []
    for i, (key, start) in enumerate(order, 1):
        srt.append(f"{i}\n{_ts(start)} --> {_ts(start + durs[key])}\n{LINES[key]}\n")
    open(os.path.join(HERE, f"demo-{LABEL}.srt"), "w").write("\n".join(srt))

    # --- line-level script -------------------------------------------------
    names = {1: "Select the study", 2: "What the USDM already tells us",
             3: "Choose the endpoint", 4: "Author the endpoint",
             5: "The analysis specification", 6: "Review",
             7: "The eSAP, and its links back", 8: "The derivation pipeline",
             9: "Execute"}
    out = ["# eSAP PFS demo — voiceover script (line-level cues)", "",
           "Every line carries the exact second it begins in `esap-pfs-demo.mp4`.",
           "The video was **cut to this narration** — each line's on-screen moment is",
           "held for as long as the line takes — so reading to these marks stays in",
           "sync without drifting inside a beat.", "",
           "`esap-pfs-demo-vo.mp4` has a synthesised guide track at these same marks:",
           "robotic, but exactly on time. Read along with it to find the pace.", "",
           "| Cue | Line | Says |", "|---|---|---|"]
    last_beat = None
    for key, start in order:
        beat = int(key.split("_")[0])
        if beat != last_beat:
            b = beats.get(beat, {})
            out.append(f'| | **Beat {beat} — {names[beat]}** | *{b.get("start",0):.0f}–{b.get("end",0):.0f}s* |')
            last_beat = beat
        out.append(f"| `{_ts(start, comma=False)[3:]}` | {key} | {LINES[key]} |")
    total = order[-1][1] + durs[order[-1][0]]
    speech = sum(durs[k] for k in cues)
    out += ["", "## Reading it", "",
            "- **Numbers:** chi-squared \"eighteen point six\" (screen reads 18.5776);",
            "  p \"one point six times ten to the minus five\".",
            "- **Pronunciation:** USDM as letters; ADaM as \"AY-dam\"; eSAP as \"e-SAP\";",
            "  WebR as \"web R\"; ICH E9 written out as \"I C H E nine\" in the lines below",
            "  so the synthesiser says it correctly — read it naturally.",
            "- **Tone:** explanatory, unhurried. The strongest moments are 4_9 (the",
            "  sentence rewriting itself), 5_8-5_10 (the estimand assembling itself),",
            "  7_6 (the protocol text linked by reference) and 9_6 (it ran).",
            "", "## Notes", "",
            f"- {len(order)} lines, {speech/60:.0f}m{speech%60:02.0f}s of speech in {total/60:.0f}m{total%60:02.0f}s "
            f"({speech/total*100:.0f}% talking).",
            "- No two lines overlap; the recorder enforces that narration is serial.",
            "- The one long silence is at the WebR engine start — that pause is real",
            "  and line 9_2 covers it.",
            "- Changing any wording means re-running `synth`, `record_demo.py`,",
            "  `convert.sh`, `mux` and `script` — the timings come from the audio."]
    open(os.path.join(HERE, f"demo-script-{LABEL}.md"), "w").write("\n".join(out) + "\n")
    print(f"demo-{LABEL}.srt        {len(order)} subtitles")
    print(f"demo-script-{LABEL}.md  line-level cue sheet")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "synth"
    {"synth": synth, "mux": mux, "script": script}.get(
        cmd, lambda: sys.exit("usage: synth | mux | script"))()
