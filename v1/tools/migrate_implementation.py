"""Build the implementation layer (decision D8).

Data bindings (normative), modelled on Dataset Specialisations:
  v1/lib/bindings/adam_bindings.json   class-level ADaM bindings, from
      lib/concepts/concept-variable-mappings.json on origin/methods_02
  v1/lib/bindings/sdtm_bindings.json   class-level SDTM bindings, from the
      observation model's variable aliases and data-element-concept codes
      (which it took from the SDTM Dataset Specialisations)

Method implementation catalogues (informative):
  v1/lib/implementations/{r,sas}_implementations.json, from
      lib/method_implementations/ on the model-schema lineage (this branch)

Usage:  python v1/tools/migrate_implementation.py
(run migrate_methods.py and migrate_concepts.py first)
"""
from __future__ import annotations

import glob

from common import LIB, METHODS_REF, REPO, clean, git_json, git_rev, read_json, write_json
from migrate_concepts import OC_RENAME, OC_SKIP

# Names in the mapping file that differ from the concept library.
CONCEPT_ALIAS = {"OccurrenceTerm": "Topic", "Observation": "Result", "EventTerm": "Topic", "Intervention": "Topic"}
FACETS = {"Result.Value": "value", "Result.Unit": "unit"}
SDTM_CLASS = {"Finding": "Findings", "Event": "Events", "Intervention": "Interventions"}


def adam_dataset_class(variable: str, std: dict) -> str | None:
    for cls, groups in std.items():
        for items in groups.values():
            if any(v["name"] == variable for v in items):
                return cls
    if variable.startswith("--"):
        return "OccurrenceDataStructure"
    if variable.endswith("FL"):
        return "SubjectLevel"
    return None


def adam_bindings(mappings: dict, concepts: set[str]):
    adam = mappings["adam"]
    std = adam["standardVariables"]
    rows, skipped = [], []

    def emit(concept, variable, **extra):
        rows.append({"concept": concept, "variable": variable, **extra})

    for section in ("concepts", "dimensions"):
        for name, m in adam.get(section, {}).items():
            cname = f"C.{CONCEPT_ALIAS.get(name, name)}"
            if cname not in concepts:
                skipped.append(name)
                continue
            seen = set()
            facet_of = {v: k for k, v in (m.get("facets") or {}).items()}
            for key, var in (m.get("byDataType") or {}).items():
                if var in seen:
                    continue
                seen.add(var)
                extra = {}
                if name == "Population":
                    extra["qualifiers"] = [{"name": "population", "value": key}]
                    extra["dataType"] = "code"
                elif key == "baseline":
                    extra["qualifiers"] = [{"name": "reference", "value": "baseline"}]
                    extra["dataType"] = "decimal"
                else:
                    extra["dataType"] = key
                if name == "Parameter":
                    extra["facet"] = "code" if var.endswith("CD") else "decode"
                elif var in facet_of:
                    f = facet_of[var]
                    extra["facet"] = FACETS.get(f, "qualifier")
                    if f not in FACETS:
                        extra["facetName"] = f
                emit(cname, var, **extra)
            for f, var in (m.get("facets") or {}).items():
                if var in seen:
                    continue
                seen.add(var)
                extra = {"facet": FACETS.get(f, "qualifier")}
                if f not in FACETS:
                    extra["facetName"] = f
                emit(cname, var, **extra)
            for intent, by_type in (m.get("intentType") or {}).items():
                for key, var in by_type.items():
                    if (var, intent) in seen:
                        continue
                    seen.add((var, intent))
                    rows[:] = [r for r in rows if not (r["concept"] == cname and r["variable"] == var
                                                       and not r.get("qualifiers"))]
                    emit(cname, var, dataType=key, qualifiers=[{"name": "intent", "value": intent}],
                         facet="number" if key in ("integer", "decimal") else None)
            if m.get("alternativeVariables"):
                first = next((r for r in rows if r["concept"] == cname), None)
                if first:
                    first["alternativeVariables"] = m["alternativeVariables"]
            for r in rows:
                if r["concept"] == cname and "description" not in r:
                    r["description"] = m.get("notes")

    carriers = {}
    for r in rows:
        carriers.setdefault(r["variable"], set()).add(r["concept"])
    out = []
    for r in rows:
        q = "".join(f".{x['value']}" for x in r.get("qualifiers", []))
        out.append(clean({
            "id": f"ADaM.{r['concept'][2:]}.{r['variable']}{q}",
            "concept": r["concept"],
            "level": "classLevel",
            "locator": {"locatorType": "tabular", "datasetClass": adam_dataset_class(r["variable"], std),
                        "variable": r["variable"]},
            "facet": r.get("facet"),
            "facetName": r.get("facetName"),
            "dataType": r.get("dataType"),
            "qualifiers": r.get("qualifiers"),
            "parameterDependent": True if len(carriers[r["variable"]]) > 1 else None,
            "alternativeVariables": r.get("alternativeVariables"),
            "description": r.get("description"),
            "status": "released",
        }))
    return out, sorted(set(skipped))


def sdtm_bindings(mappings: dict, oc: dict, concepts: set[str]):
    out, seen = [], set()

    def emit(concept, variable, cls=None, dec=None, facet=None, data_type=None, description=None):
        key = (concept, variable)
        if key in seen or concept not in concepts:
            return
        seen.add(key)
        out.append(clean({
            "id": f"SDTM.{concept[2:]}.{variable}",
            "concept": concept,
            "level": "classLevel",
            "locator": {"locatorType": "tabular", "datasetClass": cls, "variable": variable},
            "facet": facet,
            "dataType": data_type,
            "specialisation": {"dataElementConceptId": dec} if dec else None,
            "description": description,
            "status": "released",
        }))

    def walk(node, cls):
        if isinstance(node, dict):
            if "conceptId" in node and "definition" in node and node["conceptId"] not in OC_SKIP:
                name = OC_RENAME.get(node["conceptId"], node["conceptId"])
                applies = node.get("appliesToClass") or []
                dataset_class = cls or (SDTM_CLASS.get(applies[0]) if len(applies) == 1 else "General Observations")
                for alias in node.get("aliases") or []:
                    emit(f"C.{name}", alias, dataset_class, node.get("decConcepts"),
                         data_type=node.get("valueType") if isinstance(node.get("valueType"), str) else None)
            for v in node.values():
                walk(v, cls)
        elif isinstance(node, list):
            for v in node:
                walk(v, cls)

    walk(oc["Recording"]["spine"], None)
    for cls, v in oc["observationClasses"].items():
        if isinstance(v, dict):
            walk(v.get("characterizingNodes", {}), SDTM_CLASS.get(cls))
    for name, d in oc["sharedDimensions"].items():
        if isinstance(d, dict):
            for alias in d.get("aliases") or []:
                emit(f"C.{name}", alias, "General Observations", data_type=d.get("valueType"))

    sdtm = mappings["sdtm"]
    for section in ("concepts", "dimensions"):
        for name, m in (sdtm.get(section) or {}).items():
            cname = f"C.{CONCEPT_ALIAS.get(name, name)}"
            for key, var in (m.get("byDataType") or {}).items():
                emit(cname, var, "Findings" if section == "concepts" else "General Observations",
                     data_type=key, description=m.get("notes"))
            for f, var in (m.get("facets") or {}).items():
                if f in FACETS:
                    emit(cname, var, "Findings", facet=FACETS[f])
    return out


def implementations(lang: str, methods: dict, statistics: set[str], classes: dict):
    src = read_json(REPO / "lib" / "method_implementations" / f"{lang}_implementations.json")

    def root(oc_id):
        while classes[oc_id].get("broader"):
            oc_id = classes[oc_id]["broader"]
        return oc_id

    out, unmatched = [], []
    for method_id, impls in src["implementations"].items():
        method = methods.get(method_id)
        if not method:
            unmatched.append(f"{method_id} (no such method)")
            continue
        for i in impls:
            mappings = []
            for om in i.get("outputMapping", []):
                name = om.get("outputClass")
                producer = None
                for sm in method.get("subMethods", []):
                    oc_id = sm["output"].get("outputClass")
                    if oc_id and (oc_id == f"OC.{name}" or root(oc_id) == f"OC.{name}"):
                        producer = sm["conceptId"]
                        break
                if producer is None:
                    if method.get("subMethods"):
                        unmatched.append(f"{method_id}: output '{name}' has no sub-method")
                    producer = method_id
                mappings.append(clean({
                    "producer": producer,
                    "sourceName": name,
                    "resultColumns": [
                        clean({"name": k, "statistic": f"S.{k}" if f"S.{k}" in statistics else None, "column": v})
                        for k, v in (om.get("resultColumns") or {}).items()
                    ],
                    "extractionCode": om.get("extractionCode"),
                }))
            out.append(clean({
                "method": method_id,
                "language": i.get("language"),
                "package": i.get("package"),
                "packages": i.get("packages"),
                "procedure": i.get("procedure"),
                "function": i.get("function"),
                "callTemplate": i["callTemplate"],
                "roleSeparator": i.get("roleSeparator") if (i.get("roleSeparator") or "").strip() else None,
                "derivationKind": i.get("derivationKind"),
                "outputMapping": mappings,
                "configurationMappings": i.get("configurations"),
                "documentation": i.get("documentation"),
                "notes": i.get("notes"),
            }))
    write_json(LIB / "implementations" / f"{lang}_implementations.json", {
        "libraryVersion": "1.0.0-candidate",
        "description": (f"Informative {lang.upper()} implementations of methods. Migrated from "
                        f"lib/method_implementations/{lang}_implementations.json v{src.get('version')} "
                        "(model-schema lineage)."),
        "language": lang.upper(),
        "implementations": out,
    })
    return len(out), unmatched


def build():
    rev = git_rev(METHODS_REF)
    mappings = git_json(METHODS_REF, "lib/concepts/concept-variable-mappings.json")
    oc = git_json(METHODS_REF, "lib/concepts/OC_Recording_Model_v017.json")
    concepts = {c["conceptId"] for c in read_json(LIB / "concepts" / "concepts.json")["entries"]}

    adam, skipped = adam_bindings(mappings, concepts)
    write_json(LIB / "bindings" / "adam_bindings.json", {
        "libraryVersion": "1.0.0-candidate",
        "description": ("Class-level ADaM data bindings. Migrated from concept-variable-mappings.json on "
                        f"methods_02 ({rev}). A variable that carries more than one Concept is marked "
                        "parameterDependent; a value-level binding in the study resolves it."),
        "standard": "ADaM",
        "standardVersions": [f"ADaMIG {mappings['adam']['_meta'].get('igVersion')}",
                             f"ADaM OCCDS {mappings['adam']['_meta'].get('occdsVersion')}"],
        "bindings": adam,
    })
    sdtm = sdtm_bindings(mappings, oc, concepts)
    write_json(LIB / "bindings" / "sdtm_bindings.json", {
        "libraryVersion": "1.0.0-candidate",
        "description": ("Class-level SDTM data bindings, held by reference to the CDISC SDTM Dataset "
                        "Specialisations: each records the data element concept code(s) its variable carries "
                        f"there. Built from the observation model and concept-variable-mappings.json on methods_02 ({rev})."),
        "standard": "SDTM",
        "standardVersions": [f"SDTM {mappings['sdtm']['_meta'].get('modelVersion')}",
                             f"SDTMIG {mappings['sdtm']['_meta'].get('igVersion')}"],
        "bindings": sdtm,
    })

    methods = {m["conceptId"]: m for m in (read_json(f) for f in glob.glob(str(LIB / "methods" / "*" / "M.*.json")))}
    statistics = {s["conceptId"] for s in read_json(LIB / "statistics" / "statistics.json")["entries"]}
    classes = {c["conceptId"]: c for c in read_json(LIB / "statistics" / "output_classes.json")["entries"]}
    report = {"adam": len(adam), "adam_skipped": skipped, "sdtm": len(sdtm)}
    for lang in ("r", "sas"):
        n, unmatched = implementations(lang, methods, statistics, classes)
        report[lang] = n
        report[f"{lang}_unmatched"] = unmatched
    return report


if __name__ == "__main__":
    for k, v in build().items():
        print(k, v)
