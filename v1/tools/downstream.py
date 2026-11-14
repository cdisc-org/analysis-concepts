"""Derive downstream artefacts from a study analysis set.

A reference implementation of what the model makes possible for a statistical
programmer. From one study file it produces, as Markdown:

  adam      the analysis-dataset variables the analyses need, and which
            derivation produces each (the start of an ADaM specification);
  arm       analysis results metadata for each analysis, in the shape of
            Define-XML's analysis results metadata: dataset, where clause,
            analysis variables, documentation and programming code;
  shell     the statistics each analysis produces, by output (the content
            of a table shell).

Usage:  python v1/tools/downstream.py <study-folder> [adam|arm|shell] [analysis-id]
        e.g. python v1/tools/downstream.py cdiscpilot01 arm AC.PRIMARY.ADASCOG

It reads only the committed library and study files. The programming code
comes from the informative implementation catalogues; any token the model
cannot fill is left in angle brackets and listed.
"""
from __future__ import annotations

import glob
import re
import sys

from common import LIB, STUDIES, read_json
from render import Renderer
from resolve import data_requirements, derivation_order


class Libraries:
    def __init__(self):
        self.templates = {t["conceptId"]: t for t in
                          read_json(LIB / "transformations" / "transformations.json")["transformations"]}
        self.methods = {m["conceptId"]: m for m in
                        (read_json(f) for f in glob.glob(str(LIB / "methods" / "*" / "M.*.json")))}
        self.statistics = {s["conceptId"]: s for s in read_json(LIB / "statistics" / "statistics.json")["entries"]}
        self.sets = {s["conceptId"]: s for s in read_json(LIB / "statistics" / "statistic_sets.json")["entries"]}
        self.class_bindings = read_json(LIB / "bindings" / "adam_bindings.json")["bindings"]
        self.code = {lang: {i["method"]: i for i in
                            read_json(LIB / "implementations" / f"{lang}_implementations.json")["implementations"]}
                     for lang in ("sas", "r")}

    def output_statistics(self, spec: dict) -> list[str]:
        """Statistic identifiers of an output, required ones first, without repeats."""
        out = []
        for s in spec.get("statisticSets", []):
            out += self.sets[s]["statistics"]
        out += spec.get("statistics", [])
        optional = set(spec.get("optionalStatistics", []))
        ordered = [x for x in dict.fromkeys(out) if x not in optional]
        return ordered + [x for x in dict.fromkeys(spec.get("optionalStatistics", []))]

    def producer(self, producer_id: str) -> tuple[str, dict]:
        method = self.methods["M." + producer_id.split(".")[1]]
        if producer_id == method["conceptId"]:
            return method.get("label") or method["name"], method["output"]
        sm = next(s for s in method["subMethods"] if s["conceptId"] == producer_id)
        return sm["name"], sm["output"]


def _conditions_variables(where: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"\b([A-Z][A-Z0-9_]*)\s*(?:=|<>|<=|>=|<|>|IN|NOT IN)", where)))


def adam_requirements(study: dict, lib: Libraries) -> list[dict]:
    """One row per dataset variable the study's analyses need."""
    derivations = {d["id"]: d for d in study.get("derivations", [])}
    concepts = {c["id"]: c for c in study.get("studyConcepts", [])}
    rows: dict[tuple, dict] = {}

    def row(dataset, variable, carries, use, needed_by, produced_by=None):
        key = (dataset or "(any)", variable)
        r = rows.setdefault(key, {"dataset": dataset or "(any)", "variable": variable, "carries": [],
                                  "use": [], "neededBy": [], "producedBy": []})
        for field, value in (("carries", carries), ("use", use), ("neededBy", needed_by), ("producedBy", produced_by)):
            if value and value not in r[field]:
                r[field].append(value)

    for a in study["analyses"]:
        subject_dataset = None
        for q in data_requirements(study, a["id"]):
            if q["dataset"]:
                subject_dataset = q["dataset"]
        for q in data_requirements(study, a["id"]):
            if not q["variable"]:
                continue
            dataset = q["dataset"] or subject_dataset
            row(dataset, q["variable"], q["concept"], f"analysis input ({q['input']})", a["id"])
            for v in _conditions_variables(q["where"]):
                row(dataset, v, None, "record selection", a["id"])
        for did in derivation_order(study, a["id"]):
            d = derivations[did]
            t = lib.templates[d["template"]]
            param = next((v["studyConcept"] for v in d.get("placeholderValues", []) if v["name"] == "parameter"), None)
            dataset = concepts.get(param, {}).get("dataSelection", {}).get("dataset")
            for m in t["outputDataStructure"].get("measures", []):
                concept = m["concept"]
                value = next((b for b in study.get("dataBindings", [])
                              if b["concept"] == concept and b.get("studyConcept") == param
                              and not b.get("qualifiers")), None)
                cls = next((b for b in lib.class_bindings
                            if b["concept"] == concept and not b.get("parameterDependent")), None)
                variable = (value or cls or {}).get("locator", {}).get("variable")
                if variable and re.search(r"[a-z]", variable):  # a naming pattern such as xxxFL, not a variable
                    variable = None
                if variable and not (concept == "C.Measure" and t["conceptId"] != "T.ChangeFromBaseline" and value):
                    row(dataset, variable, concept, None, None, f"{did} ({t['conceptId']})")
                else:
                    row(dataset, "(study to assign)", concept, None, None, f"{did} ({t['conceptId']})")
    return sorted(rows.values(), key=lambda r: (r["dataset"], r["variable"]))


def filled_code(lib: Libraries, study: dict, analysis: dict, lang: str) -> tuple[str, list[str]] | None:
    """The catalogue's call template with roles and configurations filled in."""
    template = lib.templates[analysis["template"]]
    impl = lib.code[lang].get(template["usesMethod"])
    if not impl:
        return None
    reqs = data_requirements(study, analysis["id"])
    values = {q["input"]: q["variable"] for q in reqs if q["variable"]}
    dataset = next((q["dataset"] for q in reqs if q["dataset"]), None)
    where = next((q["where"] for q in reqs if q["where"]), "")
    if lang == "r" and where:
        r_where = re.sub(r"(?<![<>!=])=(?!=)", "==", where).replace(" AND ", " & ").replace("'", '"')
        values["dataset"] = f"subset({dataset}, {r_where})"
    else:
        values["dataset"] = dataset or ""
    mappings = impl.get("configurationMappings") or {}
    for c in analysis.get("configurationValues", []):
        mapped = (mappings.get(f"{c['name']}_mapping") or {}).get(str(c.get("value")))
        values[c["name"]] = str(mapped if mapped is not None else c.get("value"))
    unresolved = []

    def repl(m):
        if m.group(1) in values:
            return values[m.group(1)]
        unresolved.append(m.group(1))
        return m.group(0)

    code = re.sub(r"<(\w+)>", repl, impl["callTemplate"]).replace("`", "")
    if lang == "sas" and where:
        code = code.replace(";\n", f";\n  where {where.replace(' AND ', ' and ')};\n", 1)
    return code, sorted(set(unresolved))


def analysis_results_metadata(study: dict, lib: Libraries, analysis_id: str) -> dict:
    """What Define-XML's analysis results metadata records for one analysis."""
    a = next(x for x in study["analyses"] if x["id"] == analysis_id)
    t = lib.templates[a["template"]]
    reqs = data_requirements(study, analysis_id)
    measures = [q for q in reqs if q["dataset"]]
    summary = a.get("summaryOutput")
    return {
        "id": a["id"],
        "description": a.get("label"),
        "reason": {"MainEstimator": "SPECIFIED IN SAP (main estimator)",
                   "SensitivityAnalysis": "SPECIFIED IN SAP (sensitivity analysis)",
                   "SupplementaryAnalysis": "SPECIFIED IN SAP (supplementary analysis)"}.get(a.get("analysisRole"), ""),
        "purpose": a.get("sentenceRole"),
        "dataset": ", ".join(dict.fromkeys(q["dataset"] for q in measures)),
        "where": next((q["where"] for q in measures if q["where"]), ""),
        "variables": ", ".join(dict.fromkeys(q["variable"] for q in measures)),
        "method": f"{t['usesMethod']} via {t['conceptId']}",
        "summary": lib.producer(summary)[0] if summary else "",
        "documentation": Renderer(study).sentence(a, "en"),
        "code": {lang: filled_code(lib, study, a, lang) for lang in ("sas", "r")},
    }


def shell_content(study: dict, lib: Libraries, analysis_id: str) -> list[dict]:
    """The outputs of an analysis and the statistics each carries."""
    a = next(x for x in study["analyses"] if x["id"] == analysis_id)
    t = lib.templates[a["template"]]
    rows = []
    for m in t["outputDataStructure"].get("measures", []):
        name, spec = lib.producer(m["output"])
        optional = set(spec.get("optionalStatistics", []))
        rows.append({
            "producer": m["output"],
            "name": name,
            "concept": m.get("concept"),
            "summary": m["output"] == a.get("summaryOutput"),
            "statistics": [{"id": s, "description": lib.statistics[s]["description"], "optional": s in optional}
                           for s in lib.output_statistics(spec)],
        })
    return rows


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    study = read_json(STUDIES / argv[0] / "analysis_set.json")
    what = argv[1] if len(argv) > 1 else "adam"
    wanted = argv[2:] or [a["id"] for a in study["analyses"]]
    lib = Libraries()
    if what == "adam":
        print("| Dataset | Variable | Carries | Used as | Needed by | Produced by |")
        print("| --- | --- | --- | --- | --- | --- |")
        for r in adam_requirements(study, lib):
            print(f"| {r['dataset']} | {r['variable']} | {', '.join(r['carries'])} | {'; '.join(r['use'])} | "
                  f"{', '.join(r['neededBy'])} | {'; '.join(r['producedBy'])} |")
    elif what == "arm":
        for aid in wanted:
            m = analysis_results_metadata(study, lib, aid)
            print(f"### {m['id']} — {m['description']}\n")
            print("| Item | Value |\n| --- | --- |")
            for label, key in (("Analysis reason", "reason"), ("Analysis purpose", "purpose"),
                               ("Analysis dataset", "dataset"), ("Where clause", "where"),
                               ("Analysis variable(s)", "variables"), ("Method", "method"),
                               ("Summary output", "summary"), ("Documentation", "documentation")):
                print(f"| {label} | {m[key]} |")
            for lang, result in m["code"].items():
                if result:
                    code, unresolved = result
                    print(f"\nProgramming code ({lang.upper()}, from the informative catalogue):\n\n```{lang}\n{code}\n```")
                    if unresolved:
                        print(f"\nNot filled by the model: {', '.join('<' + u + '>' for u in unresolved)}")
            print()
    elif what == "shell":
        for aid in wanted:
            print(f"### {aid}\n")
            print("| Output | Concept | Statistics |\n| --- | --- | --- |")
            for r in shell_content(study, lib, aid):
                stats = ", ".join(s["id"][2:] + (" (optional)" if s["optional"] else "") for s in r["statistics"])
                star = " **(summary measure)**" if r["summary"] else ""
                print(f"| {r['name']}{star} | {r['concept']} | {stats} |")
            print()
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
