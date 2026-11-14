"""Resolve a study analysis to what it needs: derivations in order, and data.

A reference implementation of two traceability paths:

  analysis -> derivation   the derivations an analysis depends on, in the order
                           they must run;
  specification -> data    for each input of the analysis, the Method role, the
                           Concept bound to it, and the study variable and
                           conditions that the data bindings resolve it to.

Usage:  python v1/tools/resolve.py <study-folder> [analysis-id]
        e.g. python v1/tools/resolve.py cdiscpilot01 AC.PRIMARY.ADASCOG
"""
from __future__ import annotations

import re
import sys

from common import LIB, STUDIES, read_json


def derivation_order(study: dict, analysis_id: str) -> list[str]:
    """Derivation identifiers in dependency order (a derivation after everything it reads)."""
    derivations = {d["id"]: d for d in study.get("derivations", [])}
    analysis = next(a for a in study["analyses"] if a["id"] == analysis_id)
    order: list[str] = []

    def visit(did: str, trail: tuple):
        if did in trail:
            raise ValueError(f"circular dependency through {did}")
        for dep in derivations[did].get("dependsOn", []):
            visit(dep, trail + (did,))
        if did not in order:
            order.append(did)

    for did in analysis.get("dependsOn", []):
        visit(did, ())
    return order


def _condition(c: dict) -> str:
    values = c["values"]
    quoted = [v if re.fullmatch(r"-?\d+(\.\d+)?", v) else f"'{v}'" for v in values]
    op = {"EQ": "=", "NE": "<>", "LT": "<", "LE": "<=", "GT": ">", "GE": ">="}.get(c["comparator"])
    if op:
        return f"{c['variable']} {op} {quoted[0]}"
    return f"{c['variable']} {'NOT IN' if c['comparator'] == 'NOTIN' else 'IN'} ({', '.join(quoted)})"


def data_requirements(study: dict, analysis_id: str) -> list[dict]:
    """One row per input of the analysis: role, concept, variable, where-clause."""
    templates = {t["conceptId"]: t for t in
                 read_json(LIB / "transformations" / "transformations.json")["transformations"]}
    class_bindings = read_json(LIB / "bindings" / "adam_bindings.json")["bindings"]
    analysis = next(a for a in study["analyses"] if a["id"] == analysis_id)
    template = templates[analysis["template"]]
    concepts = {c["id"]: c for c in study.get("studyConcepts", [])}
    values = {v["name"]: v for v in analysis.get("placeholderValues", [])}
    ids = template["inputDataStructure"]
    slices = {s["name"]: s for s in ids.get("slices", [])}
    study_bindings = study.get("dataBindings", [])

    def selection(placeholder: str) -> list[str]:
        sc = concepts.get(values.get(placeholder, {}).get("studyConcept"))
        return [_condition(c) for c in (sc or {}).get("dataSelection", {}).get("conditions", [])]

    rows = []
    for b in ids.get("measures", []):
        fixed = {}
        for c in slices.get(b.get("slice"), {}).get("constraints", []):
            token = re.fullmatch(r"\{(\w+)\}", c["value"])
            fixed[c["dimension"]] = token.group(1) if token else None
        subject = next((values[p]["studyConcept"] for p in ("parameter", "event")
                        if p in values and values[p].get("studyConcept")), None)
        candidates = [vb for vb in study_bindings if vb["concept"] == b["concept"] and vb.get("studyConcept") == subject]
        at_baseline = fixed.get("C.VisitDimension") == "baseline_visit"
        qualified = [vb for vb in candidates if any(q["value"] == "baseline" for q in vb.get("qualifiers", []))]
        plain = [vb for vb in candidates if not any(q["value"] == "baseline" for q in vb.get("qualifiers", []))]
        where, note = [], None
        if at_baseline and qualified:
            # ADaM carries the baseline value on the analysis record, so the row
            # is selected by the analysis visit, not the baseline visit.
            chosen = qualified[0]
            note = "baseline value carried on the analysis record"
            visit_placeholder = "visit"
        else:
            chosen = plain[0] if plain else None
            visit_placeholder = fixed.get("C.VisitDimension")
        if chosen:
            dataset, variable = chosen["locator"].get("dataset"), chosen["locator"]["variable"]
            where += [_condition(c) for c in chosen.get("conditions", [])]
        else:
            cb = next((x for x in class_bindings if x["concept"] == b["concept"] and not x.get("parameterDependent")), None)
            dataset = concepts.get(subject, {}).get("dataSelection", {}).get("dataset") if subject else None
            variable = cb["locator"]["variable"] if cb else None
            where += selection("parameter") + selection("event")
        if visit_placeholder:
            where += selection(visit_placeholder)
        if "C.Population" in fixed:
            where += selection(fixed["C.Population"] or "population")
        rows.append({"input": b["input"], "concept": b["concept"], "dataset": dataset, "variable": variable,
                     "where": " AND ".join(dict.fromkeys(where)), "note": note})
    for b in ids.get("dimensions", []):
        if not b.get("input"):
            continue
        ref = b.get("concept") or b.get("conceptCategory")
        sc = next((concepts[v["studyConcept"]] for v in values.values()
                   if v.get("studyConcept") and concepts[v["studyConcept"]]["concept"] == ref), None)
        rows.append({"input": b["input"], "concept": ref, "dataset": None,
                     "variable": (sc or {}).get("dataSelection", {}).get("variable"), "where": "", "note": None})
    return rows


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    study = read_json(STUDIES / argv[0] / "analysis_set.json")
    wanted = argv[1:] or [a["id"] for a in study["analyses"]]
    for aid in wanted:
        print(aid)
        order = derivation_order(study, aid)
        print("  derivations, in order:", " -> ".join(order) if order else "(none)")
        for r in data_requirements(study, aid):
            target = ".".join(x for x in (r["dataset"], r["variable"]) if x) or "(unbound)"
            where = f" WHERE {r['where']}" if r["where"] else ""
            note = f"   [{r['note']}]" if r["note"] else ""
            print(f"  {r['input']:13} {r['concept']:16} <- {target}{where}{note}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
