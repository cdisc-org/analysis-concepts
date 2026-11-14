"""Build the two worked study analysis sets (decisions D4, D5, D6, D11, D13).

Reads the study graphs of the SmartPhrase proof of concept on
origin/estimands_01 (smartphrase/demo/data/study-graph*.js) and writes

  v1/studies/<study>/analysis_set.json            the study's Analysis and Derivation Concepts
  v1/studies/<study>/esap-extension.example.json  what an eSAP model would add (non-normative)

Usage:  python v1/tools/migrate_studies.py
(run the library migrations first)
"""
from __future__ import annotations

import glob

from common import (LIB, SMARTPHRASE_REF, STUDIES, V1, clean, git_rev, pascal, read_json,
                    template_placeholders, write_json)

KIND_CONCEPT = {
    "Parameter": "C.Parameter",
    "Timepoint": "C.AnalysisVisit",
    "Population": "C.Population",
    "Treatment": "C.Treatment",
    "Event": "C.Event",
    "IntercurrentEvent": "C.IntercurrentEvent",
}
# Placeholder values the proof of concept did not carry. Recorded as literals.
LITERAL_PLACEHOLDERS = {"CDISCPILOT01": {"control_arm": "Placebo"}}
ESAP_NS = "https://example.org/esap/"


def anchors(refs):
    return [clean({"section": str(r["section"]), "quote": r.get("quote"), "relation": r.get("relation")})
            for r in refs or []]


def ext(iri, status, text=None):
    return clean({"iri": iri, "iriStatus": status, "text": text}) if iri else None


def study_concept(cid: str, c: dict, overlay: dict) -> dict:
    data = c.get("data") or {}
    kind = c["kind"]
    sel = {"dataset": data.get("dataset"), "datasetLabel": data.get("datasetLabel"), "file": data.get("file")}
    if kind in ("Parameter", "Event") and data.get("paramcd"):
        sel["conditions"] = [{"variable": "PARAMCD", "comparator": "EQ", "values": [data["paramcd"]]}]
    elif kind == "Timepoint" and "avisitn" in data:
        sel["conditions"] = [{"variable": "AVISITN", "comparator": "EQ", "values": [str(data["avisitn"])]}]
    elif kind == "Population" and data.get("flag"):
        sel["conditions"] = [{"variable": data["flag"], "comparator": "EQ", "values": ["Y"]}]
    elif kind == "Treatment":
        sel["variable"] = data.get("variable")
    elif kind == "IntercurrentEvent":
        sel["variable"] = data.get("flag")
    translations = []
    for lang, pack in overlay.items():
        t = (pack.get("concepts") or {}).get(cid)
        if t:
            translations.append(clean({"language": lang, "label": t.get("label"), "name": t.get("name")}))
    return clean({
        "id": cid,
        "kind": kind,
        "concept": KIND_CONCEPT[kind],
        "label": c["label"],
        "name": c["name"],
        "reference": ext(c.get("iri"), c.get("iri_status")),
        "sapRefs": anchors(c.get("sapRefs")),
        "note": c.get("note"),
        "translations": translations,
        "dataSelection": sel,
    })


def value_bindings(study_id: str, concepts: dict) -> list[dict]:
    out = []

    def add(suffix, concept, study_concept_id, dataset, variable, paramcd, qualifiers=None, description=None):
        out.append(clean({
            "id": f"{study_id}.{study_concept_id}.{suffix}",
            "concept": concept,
            "studyConcept": study_concept_id,
            "level": "valueLevel",
            "locator": {"locatorType": "tabular", "dataset": dataset, "variable": variable},
            "conditions": [{"variable": "PARAMCD", "comparator": "EQ", "values": [paramcd]}],
            "qualifiers": qualifiers,
            "description": description,
            "status": "released",
        }))

    for cid, c in concepts.items():
        data = c.get("data") or {}
        if c["kind"] == "Parameter" and data.get("paramcd"):
            add("Measure", "C.Measure", cid, data["dataset"], "AVAL", data["paramcd"])
            add("Baseline", "C.Measure", cid, data["dataset"], "BASE", data["paramcd"],
                qualifiers=[{"name": "reference", "value": "baseline"}])
            add("Change", "C.Change", cid, data["dataset"], "CHG", data["paramcd"])
        elif c["kind"] == "Event" and data.get("paramcd"):
            add("TimeToEvent", "C.TimeToEvent", cid, data["dataset"], data.get("aval", "AVAL"), data["paramcd"])
            add("EventIndicator", "C.Flag", cid, data["dataset"], data.get("cnsr", "CNSR"), data["paramcd"],
                qualifiers=[{"name": "meaning", "value": "censoring indicator"}],
                description="0 = event, 1 = censored; the event indicator is its complement.")
    return out


def build_study(study_id: str, g: dict, lib: dict, overlay: dict):
    phrases = lib["phrases"]
    role_index = {r: i for i, r in enumerate(lib["roleOrder"])}
    templates, methods = lib["templates"], lib["methods"]
    concepts = g["concepts"]

    def producer(method_id: str, output_name: str) -> str:
        method = methods[method_id]
        sm = f"SM.{method_id[2:]}.{pascal(output_name)}"
        return sm if any(s["conceptId"] == sm for s in method.get("subMethods", [])) else method_id

    derivations: dict[str, dict] = {}

    def derivation(did, template, label, purpose, values, depends=None):
        if did not in derivations:
            fixed = [clean({"name": c["configurationName"], "value": c.get("value"), "valueList": c.get("valueList"),
                            "fixedByTemplate": True})
                     for c in templates[template].get("methodConfigurations", [])]
            derivations[did] = clean({
                "id": did, "label": label, "template": template, "purpose": purpose,
                "placeholderValues": [{"name": k, "studyConcept": v} for k, v in values.items()],
                "configurationValues": fixed,
                "dependsOn": depends,
            })
        return did

    analyses = []
    for inst in g["instances"]:
        template = templates[inst["template"]]
        method_id = template["usesMethod"]
        method = methods[method_id]
        estimand = g["estimands"].get(inst.get("estimand"), {})

        ordered = sorted(inst["phrases"], key=lambda p: role_index[phrases[p["phrase"]]["role"]])
        values: dict[str, dict] = {}
        for pi in ordered:
            for slot, b in (pi.get("bindings") or {}).items():
                if "concept" in b and concepts[b["concept"]]["kind"] != "IntercurrentEvent" and slot not in values:
                    values[slot] = {"name": slot, "studyConcept": b["concept"]}
        if inst.get("baselineVisit"):
            values["baseline_visit"] = {"name": "baseline_visit", "studyConcept": inst["baselineVisit"]}
        for name in template_placeholders(template):
            literal = LITERAL_PLACEHOLDERS.get(study_id, {}).get(name)
            if name not in values and literal:
                values[name] = {"name": name, "value": literal}

        phrase_instances, stated, summary = [], {}, None
        for pi in inst["phrases"]:
            definition = phrases[pi["phrase"]]
            bindings = []
            for slot, b in (pi.get("bindings") or {}).items():
                entry = {"slot": slot, "render": b.get("render")}
                if "concept" in b:
                    entry["studyConcept"] = b["concept"]
                    strategy = (definition.get("anchors") or {}).get("icheStrategy")
                    if strategy and concepts[b["concept"]]["kind"] == "IntercurrentEvent":
                        stated[b["concept"]] = (strategy, pi["phrase"])
                elif "method" in b:
                    entry["method"] = b["method"]
                elif "output" in b:
                    entry["output"] = producer(method_id, b["output"])
                    if definition["role"] == "summary_measure":
                        summary = entry["output"]
                elif "value" in b:
                    entry["value"] = str(b["value"])
                bindings.append(clean(entry))
            phrase_instances.append(clean({
                "phrase": pi["phrase"], "bindings": bindings,
                "sapRefs": anchors(pi.get("sapRefs")), "noAnchorReason": pi.get("noAnchorReason"),
            }))

        handlings = []
        for ice in estimand.get("intercurrentEvents", []):
            c = concepts[ice]
            if ice in stated:
                strategy, phrase_id = stated[ice]
                basis = "statedByPhrase"
            else:
                strategy, phrase_id, basis = c.get("icheStrategy"), None, "studyDefault"
            implemented = (c.get("implementedBy") or {}).get(strategy, [])
            handlings.append(clean({
                "intercurrentEvent": ice, "strategy": strategy, "basis": basis, "fromPhrase": phrase_id,
                "implementedBy": implemented,
            }))

        configs = [clean({"name": c["configurationName"], "value": c.get("value"), "valueList": c.get("valueList"),
                          "fixedByTemplate": True}) for c in template.get("methodConfigurations", [])]
        config_names = {c["name"] for c in method.get("configurations", [])}
        for pi in inst["phrases"]:
            level = (pi.get("bindings") or {}).get("conf_level", {}).get("value")
            if level is not None and "alpha" in config_names:
                configs.append({"name": "alpha", "value": round(1 - float(level) / 100, 6)})

        depends = []
        param = values.get("parameter", {}).get("studyConcept")
        visit = values.get("visit", {}).get("studyConcept")
        baseline = values.get("baseline_visit", {}).get("studyConcept")
        needs_change = any(m.get("concept") == "C.Change" for m in template["inputDataStructure"]["measures"])
        if needs_change and param and visit and baseline:
            key = param.split(".", 1)[1]
            d0 = derivation(f"DC.BASELINE.{key}", "T.BaselineSelection",
                            f"Baseline record for {concepts[param]['label']}",
                            "Flags the baseline record that the change and the covariate are taken from.",
                            {"parameter": param})
            chain = [d0]
            if any("T.LOCF_Imputation" in h.get("implementedBy", []) for h in handlings):
                chain.append(derivation(f"DC.LOCF.{key}", "T.LOCF_Imputation",
                                        f"LOCF-imputed {concepts[param]['label']}",
                                        "Implements the hypothetical strategy for an intercurrent event by "
                                        "carrying the last observation forward.",
                                        {"parameter": param}))
            vkey = visit.split(".", 1)[1]
            imputed = len(chain) > 1
            depends = [derivation(f"DC.CHG.{key}.{vkey}" + (".LOCF" if imputed else ""), "T.ChangeFromBaseline",
                                  f"Change from baseline in {concepts[param]['label']} at {concepts[visit]['label']}"
                                  + (" (LOCF-imputed)" if imputed else ""),
                                  "The response analysed.",
                                  {"parameter": param, "visit": visit, "baseline_visit": baseline}, chain)]

        obj = inst.get("usdmObjective") or {}
        ars = inst.get("arsAnalysis") or {}
        analyses.append(clean({
            "id": inst["id"],
            "label": inst.get("label"),
            "template": inst["template"],
            "reference": ext(inst.get("iri"), "illustrative"),
            "addressesEstimand": inst.get("estimand"),
            "addressesObjective": ext(obj.get("iri"), obj.get("iri_status"), obj.get("text")),
            "arsAnalysis": ext(ars.get("iri"), ars.get("iri_status")),
            "analysisRole": inst.get("analysisRole"),
            "sentenceRole": inst.get("sentenceRole"),
            "placeholderValues": list(values.values()),
            "configurationValues": configs,
            "phrases": phrase_instances,
            "summaryOutput": summary,
            "dependsOn": depends,
            "sapRefs": anchors(inst.get("sapRefs")),
        }) | {"iceHandlings": handlings})

    doc = g.get("sourceDocument")
    study = g["study"]
    ice_ids = [k for k, c in concepts.items() if c["kind"] == "IntercurrentEvent"]
    analysis_set = clean({
        "id": f"{study_id}.analyses",
        "description": (f"Worked example. Built from the study graph of the SmartPhrase proof of concept on "
                        f"estimands_01 ({git_rev(SMARTPHRASE_REF)}). Identifiers marked illustrative are not registered."),
        "study": ext(study["iri"], study["iri_status"]),
        "studyTitle": study.get("title"),
        "libraryPins": [{"library": name, "version": version} for name, version in lib["pins"].items()],
        "sourceDocument": clean({"id": doc["id"], "title": doc.get("title"), "date": doc.get("date"),
                                 "iri": doc.get("iri"), "iriStatus": doc.get("iri_status")}) if doc else None,
        "sourceDocumentNote": g.get("sourceDocumentNote") if not doc else None,
        "studyConcepts": [study_concept(k, c, overlay) for k, c in concepts.items()],
        "estimands": [clean({"id": k, "reference": ext(e["iri"], e["iri_status"]), "label": e.get("label"),
                             "rank": e.get("rank"), "sapRefs": anchors(e.get("sapRefs"))})
                      | {"intercurrentEvents": e.get("intercurrentEvents", [])}
                      for k, e in g["estimands"].items()],
        "methodGroundings": [clean({"method": m, "reference": ext(v.get("iri"), v.get("iri_status")),
                                    "arsMethod": ext(v.get("ars"), v.get("ars_status"))})
                             for m, v in (g.get("methodGrounding") or {}).items()],
        "derivations": list(derivations.values()),
        "analyses": analyses,
        "dataBindings": value_bindings(study_id, concepts),
        "extensions": [{"namespace": ESAP_NS, "description": "Example of what an eSAP model would add for this study.",
                        "location": "esap-extension.example.json"}] if ice_ids else None,
    })
    folder = STUDIES / study_id.lower()
    write_json(folder / "analysis_set.json", analysis_set)

    # What an eSAP model would hold (decision D13): it references the entities
    # above by identifier and adds what AC leaves out. Non-normative.
    extension = {
        "_note": ("Non-normative example of an eSAP extension. AC defines none of this. It shows the two rules "
                  "an extending model follows: it refers to AC entities by identifier, and it mints its own "
                  "identifiers in its own namespace."),
        "namespace": ESAP_NS,
        "extends": f"{study_id}.analyses",
        "reportingEvents": [{
            "id": f"{ESAP_NS}{study_id}/reporting-event/final",
            "label": "Final analysis",
            "analyses": [a["id"] for a in analyses],
        }],
        "iceAscertainments": [{
            "id": f"{ESAP_NS}{study_id}/ice-ascertainment/{k}",
            "forIntercurrentEvent": k,
            "arm": (concepts[k].get("ascertainedBy") or {}).get("arm"),
            "criteria": (concepts[k].get("ascertainedBy") or {}).get("criteria"),
            "timingVariable": (concepts[k].get("data") or {}).get("timing"),
        } for k in ice_ids],
    }
    write_json(folder / "esap-extension.example.json", extension)
    return len(analyses), len(derivations)


def build():
    cache = read_json(V1 / "tools" / ".cache" / "smartphrase_sources.json")
    sp = read_json(LIB / "smartphrases" / "smartphrases.json")
    tl = read_json(LIB / "transformations" / "transformations.json")
    lib = {
        "phrases": {p["conceptId"]: p for p in sp["phrases"]},
        "roleOrder": sp["roleOrder"],
        "templates": {t["conceptId"]: t for t in tl["transformations"]},
        "methods": {m["conceptId"]: m for m in (read_json(f) for f in glob.glob(str(LIB / "methods" / "*" / "M.*.json")))},
        "pins": {
            "transformations": tl["libraryVersion"],
            "smartphrases": sp["libraryVersion"],
            "concepts": read_json(LIB / "concepts" / "concepts.json")["libraryVersion"],
            "statistics": read_json(LIB / "statistics" / "statistics.json")["libraryVersion"],
            "methods": "1.0.0-candidate",
            "bindings": read_json(LIB / "bindings" / "adam_bindings.json")["libraryVersion"],
        },
    }
    return {sid: build_study(sid, g, lib, cache["LANG_OVERLAY"]) for sid, g in cache["STUDY_GRAPHS"].items()}


if __name__ == "__main__":
    for sid, (n_a, n_d) in build().items():
        print(f"{sid}: {n_a} analysis concepts, {n_d} derivation concepts")
