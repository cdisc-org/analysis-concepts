"""Build the unified concept library (decision D3).

Reads, from origin/methods_02:
  lib/concepts/OC_Recording_Model_v017.json  observation (collected) concepts
  lib/concepts/Option_B_Clinical.json        derivation concepts and shared dimensions
  lib/concepts/AC_Concept_Model_v017.json    analysis result patterns and categories

and writes v1/lib/concepts/concepts.json, one library with three definition
forms: none (collected facts and abstract groupings), closedForm (an algebraic
identity) and methodBound (a contract a method output satisfies).

Usage:  python v1/tools/migrate_concepts.py
"""
from __future__ import annotations

from common import LIB, METHODS_REF, clean, git_json, git_rev, read_json, write_json

NCIT = "http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl"
STATUS = "released"


def cid(name: str) -> str:
    return f"C.{name}"


# Observation-model node names that clash with another concept or layer.
OC_RENAME = {
    "Category": "ObservationCategory",
    "Subcategory": "ObservationSubcategory",
    "Method": "CollectionMethod",
    "Frequency": "DoseFrequency",
}
# FHIR datatype leaves and value-pattern scaffolding: structure, not concepts.
OC_SKIP = {"value", "code", "code(units)", "effective", "instant", "period", "start", "end",
           "Quantity", "Coded", "ResultValue"}

# Closed-form identities (decision D3). Everything else that is derived is method-bound.
IDENTITIES = {
    "Measure": ("result = source", ["source"]),
    "Change": ("result = value - reference", ["value", "reference"]),
    "PercentChange": ("result = 100 * (value - reference) / reference", ["value", "reference"]),
    "Ratio": ("result = value / reference", ["value", "reference"]),
    "LogRatio": ("result = ln(value / reference)", ["value", "reference"]),
}
CATEGORY_OPERANDS = {
    "Comparison": [("value", "Quantity"), ("reference", "Quantity")],
    "SequenceAggregate": [("series", "Quantity")],
    "EventAggregate": [("events", "boolean")],
    "Classification": [("value", None)],
    "PointComputation": [("source", "Quantity")],
}
# Output classes of the same kind as each analysis concept. Only those whose
# statistics satisfy the concept's contract are recorded as `satisfiedBy`.
CANDIDATE_CLASSES = {
    "LSMeans": ["ls_means"],
    "Contrasts": ["contrasts_t", "contrasts_z"],
    "Type3Tests": ["type3_tests_f", "type3_tests_mixed", "type3_tests_chi_squared"],
    "ParameterEstimates": ["parameter_estimates_linear", "parameter_estimates_glm", "parameter_estimates_cox"],
    "FitStatistics": ["fit_statistics_basic", "fit_statistics_linear", "fit_statistics_concordance"],
    "CovarianceParameters": ["covariance_parameters"],
    "TestResult": ["chi_squared_test_result", "t_test_result", "exact_test_result", "homogeneity_test"],
    "SurvivalTable": ["survival_table"],
    "MedianSurvival": ["median_survival"],
    "EventSummary": ["event_summary"],
    "HazardRatioEstimates": ["hazard_ratio_estimates"],
    "OddsRatioEstimates": ["odds_ratio_estimates", "odds_ratio_measures"],
}
PROVISIONAL_ANALYSIS = {
    "LandmarkEstimates": ("Estimated survival probability at stated landmark times, per group.",
                          "landmark_estimates", ["SurvivalAnalysis"], ["group", "time"]),
}
DIMENSION_GROUPS = {
    "ParameterDimension": ("Parameter dimension", "Any concept that says which measurement an observation is of.", ["Parameter"]),
    "VisitDimension": ("Visit dimension", "Any concept that says at which visit or timepoint an observation applies.",
                       ["Visit", "AnalysisVisit", "Timepoint"]),
    "EventDimension": ("Event dimension", "Any concept that says which clinical event an observation is about.", ["Event"]),
}


def value_types(v):
    if v is None:
        return None
    return v if isinstance(v, list) else [v]


def result_of(src: dict | None):
    if not src or not src.get("valueType"):
        return None
    return clean({
        "valueTypes": value_types(src["valueType"]),
        "unitRule": src.get("unitRule"),
        "inputUnitRelation": src.get("inputUnitRelation"),
        "inheritsFrom": cid(src["inheritsFrom"]) if src.get("inheritsFrom") else None,
    })


def codings(dec):
    return [{"system": NCIT, "code": c} for c in dec or []]


def build():
    rev = git_rev(METHODS_REF)
    oc = git_json(METHODS_REF, "lib/concepts/OC_Recording_Model_v017.json")
    dc = git_json(METHODS_REF, "lib/concepts/Option_B_Clinical.json")
    ac = git_json(METHODS_REF, "lib/concepts/AC_Concept_Model_v017.json")
    concepts: dict[str, dict] = {}

    def add(key: str, /, **fields):
        if key in concepts:
            raise ValueError(f"duplicate concept {key}")
        concepts[key] = clean({"conceptId": cid(key), **{"status": STATUS, **fields}})

    # ---- abstract roots and groupings -----------------------------------
    add("Observation", name="Observation", conceptRole="collected", definitionForm="none", abstract=True,
        description=oc["Recording"]["definition"])
    for cls, v in oc["observationClasses"].items():
        if isinstance(v, dict):
            add(f"{cls}Observation", name=f"{cls} observation", conceptRole="collected", definitionForm="none",
                abstract=True, broader=[cid("Observation")], description=v.get("definition"))
    for cat, v in dc["categories"].items():
        add(cat, name=cat, conceptRole="derived", definitionForm="none", abstract=True,
            description=f"{v['definition']} Input pattern: {v['inputPattern']}")
    for cat, v in ac["categories"].items():
        if isinstance(v, dict):
            add(cat, name=cat, conceptRole="analysis", definitionForm="none", abstract=True,
                description=v.get("definition"))
    for grp, (label, desc, _) in DIMENSION_GROUPS.items():
        add(grp, name=label, conceptRole="collected", axis="dimension", definitionForm="none", abstract=True,
            description=desc)
    member_of = {m: g for g, (_, _, members) in DIMENSION_GROUPS.items() for m in members}

    # ---- shared dimensions ------------------------------------------------
    oc_dims = {k: v for k, v in oc["sharedDimensions"].items() if isinstance(v, dict)}
    dc_dims = {k: v for k, v in dc["sharedDimensions"].items() if isinstance(v, dict)}
    dim_text = {
        "Subject": "The individual the observation is about.",
        "Study": "The study the observation belongs to.",
        "Site": "The investigational site, or a pooled group of sites.",
        "Visit": "The protocol-defined visit at which the observation was made.",
        "Timepoint": "A planned time point within a visit.",
        "Treatment": "The treatment, planned or actual, that the subject is assigned to or receives.",
        "Population": "Membership of an analysis population (analysis set).",
        "Parameter": "The measurement, test or question an observation is of.",
        "Period": "The study period an observation falls in.",
    }
    for name in ["Subject", "Study", "Site", "Visit", "Timepoint", "Treatment", "Population", "Parameter", "Period"]:
        o, d = oc_dims.get(name, {}), dc_dims.get(name, {})
        vt = o.get("valueType") or {"Parameter": "CodeableConcept", "Period": "CodeableConcept"}.get(name)
        add(name, name=name, conceptRole="derived" if name == "Population" else "collected", axis="dimension",
            definitionForm="none", description=dim_text[name], cardinality=d.get("cardinality") or o.get("cardinality"),
            result={"valueTypes": [vt]} if vt else None,
            broader=[cid(member_of[name])] if name in member_of else None)
    add("Event", name="Event", conceptRole="collected", axis="dimension", definitionForm="none",
        description="The clinical event of interest that a time-to-event or event-count concept refers to "
                    "(for example death or disease progression).",
        result={"valueTypes": ["CodeableConcept"]}, broader=[cid("EventDimension")])

    # ---- collected concepts from the observation (Recording) model ---------
    def walk(node, parent: str, cls_parent: str | None):
        if isinstance(node, dict):
            here = parent
            if "conceptId" in node and "definition" in node and node["conceptId"] not in OC_SKIP:
                raw = node["conceptId"]
                name = OC_RENAME.get(raw, raw)
                here = name
                if name == "Timing":
                    add("Timing", name="Timing", conceptRole="collected", axis="dimension", definitionForm="none",
                        description=node["definition"], codings=codings(node.get("decConcepts")),
                        cardinality=dc_dims.get("Timing", {}).get("cardinality"),
                        broader=[cid("Observation")])
                elif name not in concepts:
                    dec = node.get("decConcepts") or []
                    add(name, name=raw, conceptRole="collected", definitionForm="none",
                        axis="measure" if name in ("Result", "Dose") else "attribute",
                        description=node["definition"],
                        ncitCode=dec[0] if len(dec) == 1 else None,
                        codings=codings(dec),
                        result=result_of(node),
                        broader=[cid(parent or cls_parent or "Observation")])
            for k, v in node.items():
                walk(v, here, cls_parent)
        elif isinstance(node, list):
            for v in node:
                walk(v, parent, cls_parent)

    walk(oc["Recording"]["spine"], "", None)
    for cls, v in oc["observationClasses"].items():
        if isinstance(v, dict):
            walk(v.get("characterizingNodes", {}), "", f"{cls}Observation")

    # ---- derived concepts ---------------------------------------------------
    for cat, v in dc["categories"].items():
        for name, c in v["concepts"].items():
            common = dict(
                name=name, label=c.get("label"), shortLabel=c.get("shortLabel"), conceptRole="derived",
                description=c.get("definition"), mathText=c.get("math"), examples=c.get("examples"),
                result=result_of(c.get("result")),
            )
            axis = "dimension" if name == "AnalysisVisit" else "measure"
            broader = [cid(cat)] + ([cid(member_of[name])] if name in member_of else [])
            if name in IDENTITIES:
                identity, operand_names = IDENTITIES[name]
                add(name, **common, axis=axis, broader=broader, definitionForm="closedForm",
                    algebraicDefinition={
                        "operands": [{"name": n, "produces": {"valueTypes": ["Quantity"]}} for n in operand_names],
                        "identity": identity,
                    })
            else:
                operands = [clean({"name": n, "produces": {"valueTypes": [t]} if t else None})
                            for n, t in CATEGORY_OPERANDS[cat]]
                add(name, **common, axis=axis, broader=broader, definitionForm="methodBound",
                    methodBoundDefinition={"operation": c.get("mathematicalEquivalent"), "operands": operands})

    # ---- analysis concepts (result patterns) --------------------------------
    stat_concepts = ac["sharedStatisticsVocabulary"]["concepts"]

    def terms(concept_name: str) -> list[str]:
        c = stat_concepts[concept_name]
        return [c["term"]] if c.get("term") else [leaf["term"] for leaf in c.get("leaves", [])]

    sets = {s["conceptId"]: set(s["statistics"]) for s in read_json(LIB / "statistics" / "statistic_sets.json")["entries"]}
    classes = read_json(LIB / "statistics" / "output_classes.json")["entries"]

    def class_stats(oc_entry: dict) -> set[str]:
        out = set(oc_entry.get("statistics", [])) | set(oc_entry.get("optionalStatistics", []))
        for s in oc_entry.get("statisticSets", []):
            out |= sets[s]
        return out

    in_category = {}
    for cat, v in ac["categories"].items():
        if isinstance(v, dict):
            for p in v.get("typicallyInvolves", []):
                in_category.setdefault(p, []).append(cat)

    for name, p in ac["resultPatterns"].items():
        if not isinstance(p, dict):
            continue
        # v0.18 of the analysis concept model made the statistic sets (plus any
        # additional statistics) the definition of a result pattern; the older
        # `constituents` list is a parallel rendering and is not used.
        constituents = []
        for s in p.get("statistics_set", []):
            for t in sorted(sets[f"SS.{s}"], key=str.lower):
                if t not in constituents:
                    constituents.append(t)
        for c in p.get("additional_statistics", []):
            for t in terms(c):
                if f"S.{t}" not in constituents:
                    constituents.append(f"S.{t}")
        by_id = {e["conceptId"]: e for e in classes}
        satisfied = [f"OC.{c}" for c in CANDIDATE_CLASSES.get(name, [])
                     if set(constituents) <= class_stats(by_id[f"OC.{c}"])]
        add(name, name=name, conceptRole="analysis", axis="measure", definitionForm="methodBound",
            description=p.get("definition"), broader=[cid(c) for c in in_category.get(name, [])],
            methodBoundDefinition={
                "constituents": constituents,
                "statisticSets": [f"SS.{s}" for s in p.get("statistics_set", [])],
                "optionalConstituents": [f"S.{s}" for s in p.get("optional_statistics", [])],
                "resultDimensions": p.get("dimensions"),
                "satisfiedBy": satisfied,
            })

    # ---- provisional analysis concepts -------------------------------------
    # Needed by the Kaplan-Meier template proposed on estimands_01, which bound
    # a landmark output to a concept the analysis model does not have.
    by_id = {e["conceptId"]: e for e in classes}
    for name, (desc, oc_name, cats, dims) in PROVISIONAL_ANALYSIS.items():
        entry = by_id[f"OC.{oc_name}"]
        constituents = list(entry.get("statistics", []))
        for s in entry.get("statisticSets", []):
            constituents += [t for t in sorted(sets[s], key=str.lower) if t not in constituents]
        add(name, name=name, conceptRole="analysis", axis="measure", definitionForm="methodBound",
            description=desc, broader=[cid(c) for c in cats], status="provisional",
            methodBoundDefinition={
                "constituents": constituents,
                "statisticSets": entry.get("statisticSets"),
                "resultDimensions": dims,
                "satisfiedBy": [entry["conceptId"]],
            })

    write_json(LIB / "concepts" / "concepts.json", {
        "libraryVersion": "1.0.0-candidate",
        "description": ("Unified concept library. Built from OC_Recording_Model v0.17, Option_B_Clinical "
                        f"v{dc['version']} and AC_Concept_Model v{ac['version']} on methods_02 ({rev})."),
        "entries": list(concepts.values()),
    })
    return concepts


if __name__ == "__main__":
    c = build()
    from collections import Counter
    print(len(c), "concepts", dict(Counter((v["conceptRole"], v["definitionForm"]) for v in c.values())))
