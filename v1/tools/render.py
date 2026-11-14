"""Write the analysis sentences of a study from its analysis set.

This is a reference implementation of the model -> text direction of the
SmartPhrase layer, working on the candidate v1 structures. It is a port of
`resolveInstance` in the proof of concept (smartphrase/demo/engine.js on
estimands_01), and is tested against the sentences that engine produces.

Usage:  python v1/tools/render.py <study-folder> [language]
        e.g. python v1/tools/render.py cdiscpilot01 fr
"""
from __future__ import annotations

import glob
import re
import sys

from common import LIB, STUDIES, read_json


def render_entity(entity: dict, mode: str | None) -> str:
    if mode == "name":
        return entity["name"]
    if mode == "name_with_label":
        return f"{entity['name']} ({entity['label']})"
    return entity["label"]


class Renderer:
    def __init__(self, study: dict):
        lib = read_json(LIB / "smartphrases" / "smartphrases.json")
        self.phrases = {p["conceptId"]: p for p in lib["phrases"]}
        self.order = lib["roleOrder"]
        self.packs = {p["language"]: p for p in lib.get("languagePacks", [])}
        self.methods = {m["conceptId"]: m for m in
                        (read_json(f) for f in glob.glob(str(LIB / "methods" / "*" / "M.*.json")))}
        self.classes = {c["conceptId"]: c for c in read_json(LIB / "statistics" / "output_classes.json")["entries"]}
        self.study = study
        self.concepts = {c["id"]: c for c in study.get("studyConcepts", [])}
        self.groundings = {g["method"]: g for g in study.get("methodGroundings", [])}

    @staticmethod
    def _lookup(items, key):
        return next((t for t in items or [] if t["key"] == key), None)

    def _method(self, method_id: str, pack: dict) -> dict:
        definition = self.methods[method_id]
        g = self.groundings.get(method_id, {})
        entity = {"label": g.get("label") or definition.get("label"),
                  "name": g.get("name") or definition["name"].lower()}
        over = self._lookup(pack.get("methodNames"), method_id) or {}
        return {**entity, **{k: v for k, v in over.items() if k in ("label", "name")}}

    def _output(self, producer: str, pack: dict) -> dict:
        method = self.methods["M." + producer.split(".")[1]]
        spec = method["output"] if producer == method["conceptId"] else \
            next(s["output"] for s in method["subMethods"] if s["conceptId"] == producer)
        cls = self.classes[spec["outputClass"]]
        entity = {"label": cls.get("label"), "name": cls["name"]}
        over = self._lookup(pack.get("outputNames"), cls["conceptId"]) or {}
        return {**entity, **{k: v for k, v in over.items() if k in ("label", "name")}}

    def _concept(self, concept_id: str, lang: str) -> dict:
        c = self.concepts[concept_id]
        over = next((t for t in c.get("translations", []) if t["language"] == lang), {})
        return {"label": over.get("label") or c["label"], "name": over.get("name") or c["name"]}

    def phrase_text(self, instance: dict, lang: str) -> tuple[str, str]:
        definition = self.phrases[instance["phrase"]]
        pack = self.packs.get(lang, {})
        translated = self._lookup(pack.get("phraseTemplates"), definition["conceptId"])
        text = translated["text"] if translated else definition["phraseTemplate"]
        given = {b["slot"]: b for b in instance.get("bindings", [])}
        for ph in definition.get("placeholders", []):
            b = given.get(ph["name"])
            if not b:
                if ph.get("required"):
                    raise ValueError(f"{definition['conceptId']}: required placeholder {ph['name']} is not bound")
                continue
            mode = b.get("render") or ph.get("defaultRender")
            if "value" in b:
                value = str(b["value"])
            elif "output" in b:
                value = render_entity(self._output(b["output"], pack), mode or "name")
            elif "method" in b:
                value = render_entity(self._method(b["method"], pack), mode or "name")
            else:
                value = render_entity(self._concept(b["studyConcept"], lang), mode or "label")
            text = text.replace("{" + ph["name"] + "}", value, 1)
        return definition["role"], text

    def sentence(self, analysis: dict, lang: str = "en") -> str:
        resolved = [self.phrase_text(pi, lang) for pi in analysis.get("phrases", [])]
        resolved.sort(key=lambda rt: self.order.index(rt[0]))  # stable: ties keep the study's order
        pack = self.packs.get(lang) or self.packs["en"]
        template = pack["sentenceTemplate"]
        role_text = analysis.get("sentenceRole") or "an analysis"
        translated = self._lookup(pack.get("sentenceRoles"), role_text)
        if translated:
            role_text = translated["text"]
        conjunctions = {t["key"]: t["text"] for t in pack.get("roleConjunctions", [])}
        filled = {r for r, _ in resolved}

        segments, last = [], 0
        for m in re.finditer(r"\[([^\]]*)\]", template):
            if m.start() > last:
                segments.append((template[last:m.start()], False))
            segments.append((m.group(1), True))
            last = m.end()
        if last < len(template):
            segments.append((template[last:], False))

        parts: list[tuple[str, str]] = []  # (kind, text)
        for text, optional in segments:
            tokens = re.findall(r"\{([a-zA-Z_]+)\}", text)
            if optional and not any(t in filled for t in tokens):
                continue
            for seg in re.split(r"(\{[a-zA-Z_]+\})", text):
                if not seg:
                    continue
                tok = re.fullmatch(r"\{([a-zA-Z_]+)\}", seg)
                if not tok:
                    parts.append(("text", seg))
                elif tok.group(1) == "sentenceRole":
                    parts.append(("text", role_text))
                elif tok.group(1) not in self.order:
                    parts.append(("text", seg))
                else:
                    joiner = conjunctions.get(tok.group(1), " ")
                    for role, phrase in resolved:
                        if role != tok.group(1):
                            continue
                        if parts and parts[-1][0] == "phrase":
                            parts.append(("text", joiner))
                        parts.append(("phrase", phrase))

        merged: list[list[str]] = []
        for kind, text in parts:
            if kind == "text" and merged and merged[-1][0] == "text":
                merged[-1][1] += text
            else:
                merged.append([kind, text])
        for p in merged:
            if p[0] == "text":
                p[1] = re.sub(r"\s+([,;.])", r"\1", re.sub(r"\s+", " ", p[1]))
        while merged and merged[0][0] == "text" and not merged[0][1].strip():
            merged.pop(0)
        if merged and merged[0][0] == "text":
            merged[0][1] = merged[0][1].lstrip()
        out = re.sub(r"\s+", " ", "".join(t for _, t in merged)).strip()
        return out[:1].upper() + out[1:]


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    study = read_json(STUDIES / argv[0] / "analysis_set.json")
    lang = argv[1] if len(argv) > 1 else "en"
    r = Renderer(study)
    for a in study["analyses"]:
        print(f"{a['id']}: {r.sentence(a, lang)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
