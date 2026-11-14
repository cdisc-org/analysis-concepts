"""Migrate the Transformation library into the candidate v1 schema.

Reads:
  origin/methods_02  lib/transformations/ACDC_Transformation_Library_v07.json   (25 templates)
  origin/estimands_01 smartphrase/demo/data/acdc-library-proposed.js             (1 proposed template)

and writes v1/lib/transformations/transformations.json.

What changes: concept names become Concept identifiers (C.*); an output is
named by the Method or SubMethod that produces it; SmartPhrases and their
roles move to their own library (decision D9).

Usage:  python v1/tools/migrate_transformations.py
(run migrate_methods.py and migrate_concepts.py first)
"""
from __future__ import annotations

import glob

from common import (LIB, METHODS_REF, SMARTPHRASE_REF, V1, clean, git_json, git_rev, pascal,
                    read_json, write_json)

# Names used by the proposed overlay that differ from the analysis concept model.
CONCEPT_ALIAS = {"SurvivalFunction": "SurvivalTable", "LandmarkEstimate": "LandmarkEstimates"}


def load_methods() -> dict:
    return {m["conceptId"]: m for m in (read_json(f) for f in glob.glob(str(LIB / "methods" / "*" / "M.*.json")))}


def load_concepts() -> dict:
    return {c["conceptId"]: c for c in read_json(LIB / "concepts" / "concepts.json")["entries"]}


def proposed_sources() -> dict:
    return read_json(V1 / "tools" / ".cache" / "smartphrase_sources.json")


def migrate(t: dict, methods: dict, concepts: dict, status: str) -> dict:
    method = methods[t["usesMethod"]]
    short = method["conceptId"][2:]
    subs = {s["conceptId"] for s in method.get("subMethods", [])}

    def concept_ref(binding: dict) -> dict:
        """Rewrite concept / conceptCategory as Concept identifiers."""
        out = dict(binding)
        for key in ("concept", "conceptCategory"):
            if key in out:
                name = CONCEPT_ALIAS.get(out[key], out[key])
                out[key] = f"C.{name}"
        # An abstract concept can only be referenced as a category.
        if "concept" in out and concepts.get(out["concept"], {}).get("abstract"):
            out["conceptCategory"] = out.pop("concept")
        return out

    def producer(name: str) -> str:
        sm = f"SM.{short}.{pascal(name)}"
        return sm if sm in subs else method["conceptId"]

    def dsd(src: dict, side: str) -> dict:
        out = {}
        dims = []
        for d in src.get("dimensions", []):
            d2 = concept_ref(d)
            spec = d2.get("contrastSpecification")
            if spec:
                spec = dict(spec)
                for k in ("over", "at"):
                    if spec.get(k):
                        spec[k] = f"C.{spec[k]}"
                d2["contrastSpecification"] = spec
            dims.append(d2)
        out["dimensions"] = dims
        measures = []
        for m in src.get("measures", []):
            m2 = concept_ref(m)
            if side == "output":
                m2["output"] = producer(m2["output"])
            measures.append(m2)
        out["measures"] = measures
        if src.get("modelInteractions"):
            out["modelInteractions"] = [
                {**mi, "operands": [concept_ref(o) for o in mi["operands"]]} for mi in src["modelInteractions"]
            ]
        if src.get("slices"):
            out["slices"] = [
                {**s, "constraints": [{**c, "dimension": f"C.{c['dimension']}"} for c in s["constraints"]]}
                for s in src["slices"]
            ]
        return out

    return clean({
        "conceptId": t["conceptId"],
        "status": status,
        "label": t["label"],
        "shortLabel": t.get("shortLabel"),
        "transformationType": t["transformationType"],
        "description": t.get("description"),
        "usesMethod": t["usesMethod"],
        "methodConfigurations": [
            ({k: v for k, v in c.items() if k != "value"} | {"valueList": c["value"]})
            if isinstance(c.get("value"), list) else c
            for c in t.get("methodConfigurations", []) or []
        ],
        "inputDataStructure": dsd(t["inputDataStructure"], "input"),
        "outputDataStructure": dsd(t["outputDataStructure"], "output"),
        "sliceKeys": [{**k, "dimension": f"C.{k['dimension']}"} for k in t.get("sliceKeys", [])],
        "validSmartPhrases": t.get("validSmartPhrases"),
    })


def build():
    methods, concepts = load_methods(), load_concepts()
    src = git_json(METHODS_REF, "lib/transformations/ACDC_Transformation_Library_v07.json")
    proposed = proposed_sources()["ACDC_LIBRARY_PROPOSED"]
    out = [migrate(t, methods, concepts, "released") for t in src["transformations"]]
    added = proposed.get("validSmartPhrasesAdded", {})
    for t in out:
        for phrase in added.get(t["conceptId"], []):
            if phrase not in t.setdefault("validSmartPhrases", []):
                t["validSmartPhrases"].append(phrase)
    out += [migrate(t, methods, concepts, "provisional") for t in proposed["transformations"]]
    write_json(LIB / "transformations" / "transformations.json", {
        "libraryVersion": "1.0.0-candidate",
        "description": (f"Transformation library. Migrated from ACDC_Transformation_Library v{src['version']} on "
                        f"methods_02 ({git_rev(METHODS_REF)}), plus one template proposed on estimands_01 "
                        f"({git_rev(SMARTPHRASE_REF)}), marked provisional."),
        "transformations": out,
    })
    return out


if __name__ == "__main__":
    print(len(build()), "transformations")
