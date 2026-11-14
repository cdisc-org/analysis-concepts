"""Build the SmartPhrase library (decisions D9 and D12).

Reads:
  origin/methods_02   lib/transformations/ACDC_Transformation_Library_v07.json
                      (smartPhrases, roleDefinitions, configurationOptions)
  origin/estimands_01 smartphrase/demo/data/acdc-library-proposed.js  (proposed roles and phrases)
                      smartphrase/demo/data/lang-overlay.js           (language packs)

and writes v1/lib/smartphrases/smartphrases.json.

Usage:  python v1/tools/migrate_smartphrases.py
(run dump_smartphrase_sources.mjs and migrate_concepts.py first)
"""
from __future__ import annotations

from common import LIB, METHODS_REF, SMARTPHRASE_REF, V1, clean, git_json, git_rev, read_json, write_json

ESTIMAND_ATTRIBUTE = {
    "grouping": "Treatment",
    "population": "Population",
    "endpoint": "Variable",
    "parameter": "Variable",
    "timepoint": "Variable",
    "ice_handling": "IntercurrentEvent",
    "summary_measure": "PopulationLevelSummary",
}
ROLE_NOTE = {
    "population": "Binds an analysis population (analysis set). The target population of an estimand is a "
                  "USDM matter; a production model may need to distinguish the two.",
}


def phrase(p: dict, concepts: set[str], status: str) -> dict:
    anchors = p.get("anchors") or {}
    produced = anchors.get("produced_concept")
    if produced and f"C.{produced}" not in concepts:
        raise ValueError(f"{p['oid']}: produced concept {produced} is not in the concept library")
    placeholders = []
    for ph in p.get("placeholders", []):
        placeholders.append({
            "name": ph["name"],
            "kind": ph["kind"],
            "description": ph.get("description"),
            "required": ph.get("required"),
            "conceptConstraint": ph.get("concept_constraint"),
            "conceptCategory": f"C.{ph['concept_category']}" if ph.get("concept_category") else None,
            "conceptClass": ph.get("concept_class"),
            "intentConstraint": ph.get("intent_constraint"),
            "valueSource": ph.get("value_source"),
            "datatype": ph.get("datatype"),
            "constraint": ph.get("constraint"),
            "renderOptions": ph.get("render_options"),
            "defaultRender": ph.get("default_render"),
        })
    return clean({
        "conceptId": p["oid"],
        "name": p["name"],
        "status": status,
        "role": p["role"],
        "phraseTemplate": p["phrase_template"],
        "anchors": {
            "producedConcept": f"C.{produced}" if produced else None,
            "usesMethod": anchors.get("uses_method"),
            "icheStrategy": anchors.get("icheStrategy"),
            "implementation": anchors.get("implementation"),
            "estimandAttribute": anchors.get("estimandAttribute"),
        },
        "placeholders": placeholders,
    })


def texts(d: dict, field: str = "text") -> list[dict]:
    out = []
    for key, v in (d or {}).items():
        out.append(clean({"key": key, **(v if isinstance(v, dict) else {field: v})}))
    return out


def build():
    src = git_json(METHODS_REF, "lib/transformations/ACDC_Transformation_Library_v07.json")
    cache = read_json(V1 / "tools" / ".cache" / "smartphrase_sources.json")
    proposed, overlay = cache["ACDC_LIBRARY_PROPOSED"], cache["LANG_OVERLAY"]
    concepts = {c["conceptId"] for c in read_json(LIB / "concepts" / "concepts.json")["entries"]}

    order = list(src["roleDefinitions"]["order"])
    roles = {}
    for name, r in src["roleDefinitions"]["roles"].items():
        roles[name] = {"name": name, "label": r["label"], "description": ROLE_NOTE.get(name),
                       "contextSource": r.get("contextSource"), "repeating": r.get("repeating"),
                       "estimandAttribute": ESTIMAND_ATTRIBUTE.get(name), "status": "released"}
    for name, r in proposed["roleDefinitions"]["roles"].items():
        roles[name] = {"name": name, "label": r["label"], "description": r.get("description"),
                       "contextSource": r.get("contextSource"), "repeating": r.get("repeating"),
                       "estimandAttribute": ESTIMAND_ATTRIBUTE.get(name), "status": "provisional"}
        after = r.get("order_after")
        if after == "last" or after not in order:
            order.append(name)
        else:
            order.insert(order.index(after) + 1, name)
    # Covariate and method-qualifier phrases are used several at a time in the
    # worked studies (baseline and site covariates; confidence level, censoring
    # rule and display), so both roles repeat. The source library did not flag them.
    for name in ("covariate", "method_qualifier"):
        roles[name]["repeating"] = True

    phrases = [phrase(p, concepts, "released") for p in src["smartPhrases"]]
    phrases += [phrase(p, concepts, "provisional") for p in proposed["smartPhrases"]]

    packs = []
    for lang, v in overlay.items():
        packs.append(clean({
            "language": lang,
            "name": v.get("name"),
            "sentenceTemplate": v["sentence_template"],
            "roleConjunctions": texts(v.get("role_conjunctions")),
            "phraseTemplates": texts(v.get("phrases")),
            "methodNames": texts(v.get("methods")),
            "outputNames": [{**t, "key": f"OC.{t['key']}"} for t in texts(v.get("outputClasses"))],
            "sentenceRoles": texts(v.get("sentenceRoles")),
            "validated": None if lang == "en" else False,
        }))

    write_json(LIB / "smartphrases" / "smartphrases.json", clean({
        "libraryVersion": "1.0.0-candidate",
        "description": (f"SmartPhrase library. {len(src['smartPhrases'])} phrases from the Transformation Library "
                        f"v{src['version']} on methods_02 ({git_rev(METHODS_REF)}); {len(proposed['smartPhrases'])} "
                        f"phrases, two roles and the language packs from estimands_01 ({git_rev(SMARTPHRASE_REF)}), "
                        "marked provisional."),
        "roleOrder": order,
        "roles": list(roles.values()),
        "configurationOptions": [{"name": k, "values": v["values"], "default": v.get("default")}
                                 for k, v in src["configurationOptions"].items()],
        "phrases": phrases,
        "languagePacks": packs,
    }))
    return phrases, order


if __name__ == "__main__":
    p, order = build()
    print(len(p), "phrases; role order:", " · ".join(order))
