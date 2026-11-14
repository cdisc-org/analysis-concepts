"""Migrate the method layer into the candidate v1 method schema.

Reads, from origin/methods_02:
  lib/vocabulary/statistics_vocabulary.json   -> lib/statistics/statistics.json
  lib/vocabulary/statistic_sets.json          -> lib/statistics/statistic_sets.json
  lib/vocabulary/output_class_templates.json  -> lib/statistics/output_classes.json
  lib/methods/{analyses,derivations}/M_*.json -> lib/methods/{analyses,derivations}/M.*.json

The target is the method schema from model-schema (Method, SubMethod,
ModelBasedMethod, AggregationMethod, DerivationMethod), as extended in
v1/schema/ac_method.yaml. How each source feature is carried is described in
v1/docs/migration-notes.md.

Usage:  python v1/tools/migrate_methods.py [M.ANCOVA M.MMRM ...]
With no arguments every method is migrated.
"""
from __future__ import annotations

import re
import sys

from common import LIB, METHODS_REF, clean, git_json, git_ls, git_rev, pascal, write_json

STATUS = "released"

DATATYPE = {"enum": "code", "object[]": "object", None: "string"}
CONTINUOUS = {"decimal", "integer"}
CATEGORICAL = {"code", "boolean", "string", "id"}


def sid(term: str) -> str:
    return f"S.{term}"


def ssid(name: str) -> str:
    return f"SS.{name}"


def ocid(name: str) -> str:
    return f"OC.{name}"


# --------------------------------------------------------------------------
# Vocabularies
# --------------------------------------------------------------------------

def migrate_vocabularies():
    rev = git_rev(METHODS_REF)
    stats_src = git_json(METHODS_REF, "lib/vocabulary/statistics_vocabulary.json")
    sets_src = git_json(METHODS_REF, "lib/vocabulary/statistic_sets.json")
    oct_src = git_json(METHODS_REF, "lib/vocabulary/output_class_templates.json")

    stats = []
    for key, s in stats_src["statistics"].items():
        stats.append(clean({
            "conceptId": sid(key),
            "name": key,
            "label": s.get("label"),
            "description": s.get("description") or s.get("name"),
            "ncitCode": s.get("ncitCode"),
            "codings": s.get("codings"),
            "status": STATUS,
        }))
    write_json(LIB / "statistics" / "statistics.json", {
        "libraryVersion": "1.0.0-candidate",
        "description": f"Statistics vocabulary. Migrated from statistics_vocabulary.json v{stats_src['version']} on methods_02 ({rev}).",
        "entries": stats,
    })

    sets = []
    for key, s in sets_src["statistic_sets"].items():
        sets.append(clean({
            "conceptId": ssid(key),
            "name": key,
            "label": s.get("label"),
            "description": s.get("description") or s.get("name"),
            "ncitCode": s.get("ncitCode"),
            "codings": s.get("codings"),
            "statistics": [sid(t) for t in s.get("statistics", [])],
            "status": STATUS,
        }))
    write_json(LIB / "statistics" / "statistic_sets.json", {
        "libraryVersion": "1.0.0-candidate",
        "description": f"Statistic sets. Migrated from statistic_sets.json v{sets_src['version']} on methods_02 ({rev}).",
        "entries": sets,
    })

    classes = []
    for key, c in oct_src["output_class_templates"].items():
        classes.append(clean({
            "conceptId": ocid(key),
            "name": key,
            "label": c.get("label"),
            "description": c.get("description") or c.get("name"),
            "ncitCode": c.get("ncitCode"),
            "codings": c.get("codings"),
            "broader": ocid(c["broader"]) if c.get("broader") else None,
            "abstract": True if c.get("abstract") else None,
            "statisticSets": [ssid(x) for x in c.get("statistics_set", [])],
            "statistics": [sid(x) for x in c.get("additional_statistics", [])],
            "optionalStatistics": [sid(x) for x in c.get("optional_statistics", [])],
            "status": STATUS,
        }))
    write_json(LIB / "statistics" / "output_classes.json", {
        "libraryVersion": "1.0.0-candidate",
        "description": f"Output classes. Migrated from output_class_templates.json v{oct_src['version']} on methods_02 ({rev}).",
        "entries": classes,
    })
    return oct_src["output_class_templates"], sets_src["statistic_sets"]


# --------------------------------------------------------------------------
# Methods
# --------------------------------------------------------------------------

def family(oc: dict, name: str) -> str:
    """The root (abstract) family of an output class."""
    seen = set()
    while oc[name].get("broader") and name not in seen:
        seen.add(name)
        name = oc[name]["broader"]
    return name


def migrate_input(i: dict) -> dict:
    dt = DATATYPE.get(i.get("dataType"), i.get("dataType"))
    if dt in CONTINUOUS:
        kind = "ContinuousVariable"
    elif dt in CATEGORICAL:
        kind = "CategoricalVariable"
    else:
        kind = "InputVariable"
    out = {
        "inputType": kind,
        "role": i["name"],
        "description": i.get("description"),
        "dataType": dt,
        "required": bool(i.get("required")),
        "multivalued": i.get("cardinality") == "multiple",
    }
    if kind == "CategoricalVariable":
        out["levels"] = [{"name": f"{i['name']}_level", "description": f"A level of the {i['name']} variable"}]
    return out


def migrate_configuration(c: dict) -> dict:
    default = c.get("defaultValue")
    if isinstance(default, (list, dict)):
        default = None
    return {
        "name": c["name"],
        "description": c.get("description"),
        "dataType": DATATYPE.get(c.get("dataType"), c.get("dataType")),
        "defaultValue": default,
        "enumValues": c.get("enumValues"),
        "conformsTo": c.get("conforms_to"),
    }


def output_spec(out: dict, oc: dict) -> dict:
    cls = oc[out["output_type"]]
    return {
        "outputClass": ocid(out["output_type"]),
        "statisticSets": [ssid(x) for x in cls.get("statistics_set", [])],
        "statistics": [sid(x) for x in cls.get("additional_statistics", [])],
        "optionalStatistics": [sid(x) for x in cls.get("optional_statistics", [])],
        "dataType": DATATYPE.get(out["dataType"], out["dataType"]) if out.get("dataType") else None,
    }


ROLE = re.compile(r"<(\w+)>")
INTERACTION = re.compile(r"\(\s*<(\w+)>\s*:\s*<(\w+)>\s*\)")


def build_model(method: dict, inputs: list[dict], out_families: set[str]):
    """Derive the statistical model (terms and parameters) from the formula."""
    expr = method["formula"]["generic_expression"]
    lhs, rhs = expr.split("~", 1)
    kind = {i["role"]: i["inputType"] for i in inputs}
    is_model_for = [r for r in ROLE.findall(lhs) if r in kind]

    # Roles after a top-level "|" or inside strata(...) condition the model
    # (strata, repeated subject); they are not effects that are estimated.
    fixed_part, _, conditioning_part = rhs.partition("|")
    conditioning = [r for r in ROLE.findall(conditioning_part) if r in kind]
    strata_roles = [r for r in re.findall(r"strata\(\s*<(\w+)>", fixed_part) if r in kind]
    conditioning += strata_roles

    interactions = INTERACTION.findall(fixed_part)
    rhs_main = INTERACTION.sub(" ", fixed_part)
    mains = []
    for r in ROLE.findall(rhs_main):
        if r in kind and r not in mains and r not in is_model_for and r not in strata_roles:
            mains.append(r)
    has_intercept_only = not mains and not interactions

    terms = []
    for r in mains:
        params = []
        if kind[r] == "CategoricalVariable":
            params.append({"name": f"{r}_effect", "description": f"Effect of a level of {r}",
                           "forFactorLevels": [f"{r}_level"]})
            if "marginal_estimates" in out_families:
                params.append({"name": f"{r}_ls_mean", "description": f"Estimated marginal mean for a level of {r}",
                               "forFactorLevels": [f"{r}_level"]})
            if "contrasts" in out_families:
                params.append({"name": f"{r}_contrast", "description": f"Contrast between levels of {r}",
                               "forFactorLevels": [f"{r}_level"]})
        else:
            params.append({"name": f"{r}_coefficient", "description": f"Regression coefficient for {r}",
                           "forInputVariables": [r]})
        terms.append({"name": r, "description": f"Main effect of {r}", "forInputs": [r], "parameters": params})

    seen = set()
    for a, b in interactions:
        if a not in kind or b not in kind or (a, b) in seen:
            continue
        seen.add((a, b))
        factors = [x for x in dict.fromkeys([a, b]) if kind[x] == "CategoricalVariable"]
        pname = f"{a}_{b}_interaction_effect"
        param = {"name": pname, "description": f"Effect of the interaction between {a} and {b}"}
        if factors:
            param["forFactorLevelCombination"] = {
                "name": f"{a}_{b}_combination",
                "description": f"A combination of levels of the interacting factors of {a}:{b}",
                "factors": factors,
            }
        else:
            param["forInputVariables"] = list(dict.fromkeys([a, b]))
        terms.append({"name": f"{a}:{b}", "description": f"Interaction between {a} and {b}",
                      "forInputs": list(dict.fromkeys([a, b])), "parameters": [param]})

    for r in dict.fromkeys(conditioning):
        if r in mains:
            continue
        terms.append({"name": r, "description": f"Conditioning structure defined by {r} (strata or repeated subject)",
                      "forInputs": [r],
                      "parameters": [{"name": f"{r}_grouping", "description": f"The grouping of observations by {r}",
                                      "forInputVariables": [r]}]})

    if has_intercept_only:
        terms.append({"name": "intercept", "description": "The overall level of the response",
                      "parameters": [{"name": "intercept", "description": "Overall mean of the response"}]})

    label = method.get("label") or method["name"]
    model = {
        "name": f"{label} model",
        "description": method["formula"].get("notes"),
        "formula": {
            "notation": method["formula"]["notation"],
            "text": expr,
            "defaultExpression": method["formula"].get("default_expression"),
        },
        "isModelFor": is_model_for,
        "modelTerms": terms,
    }
    return model, terms


def sub_method(method_short: str, out: dict, oc: dict, terms: list[dict]) -> dict:
    cls = oc[out["output_type"]]
    fam = family(oc, out["output_type"])
    spec = output_spec(out, oc)
    all_params = [p["name"] for t in terms for p in t["parameters"]]
    term_names = [t["name"] for t in terms]

    if fam == "type3_tests":
        grouping = {t["name"] for t in terms if t["parameters"][0]["name"].endswith("_grouping")}
        spec["forModelTerms"] = [t for t in term_names if t != "intercept" and t not in grouping] or term_names
    elif fam in ("parameter_estimates", "exponentiated_estimates") and out["output_type"] != "covariance_parameters":
        spec["forModelParameters"] = [p for p in all_params
                                      if p.endswith(("_effect", "_coefficient")) or p == "intercept"]
    elif fam == "marginal_estimates":
        spec["forModelParameters"] = [p for p in all_params if p.endswith("_ls_mean")] or \
                                     [p for p in all_params if p == "intercept"]
    elif fam == "contrasts":
        spec["forModelParameters"] = [p for p in all_params if p.endswith("_contrast")]

    description = cls.get("description") or cls.get("name")
    extras = []
    for st in out.get("sub_types", []) or []:
        extras.append(f"{st['name']} ({st.get('description', '').rstrip('.')})")
        kinds = st.get("formula_term_kinds") or []
        if kinds:
            candidates = [":".join(kinds), ":".join(reversed(kinds))] if len(kinds) > 1 else kinds
            for c in candidates:
                if c in term_names:
                    spec.setdefault("forModelTerms", [])
                    if c not in spec["forModelTerms"]:
                        spec["forModelTerms"].append(c)
    if extras:
        description = f"{description.rstrip('.')}. Forms: " + "; ".join(extras) + "."
    if out.get("test_types"):
        description = f"{description.rstrip('.')}. Tests: " + ", ".join(out["test_types"]) + "."

    return {
        "conceptId": f"SM.{method_short}.{pascal(out['name'])}",
        "name": cls.get("label") or out["name"],
        "description": description,
        "methodType": "SubMethod",
        "output": spec,
    }


def migrate_method(src: dict, folder: str, oc: dict, sets: dict) -> dict:
    notation = src["formula"]["notation"]
    inputs = [migrate_input(i) for i in src.get("inputs", [])]
    configurations = [migrate_configuration(c) for c in src.get("configurations", []) or []]
    short = src["conceptId"].split(".", 1)[1]

    base = {
        "conceptId": src["conceptId"],
        "name": src["name"],
        "label": src.get("label"),
        "description": src.get("description"),
        "ncitCode": src.get("ncitCode"),
        "codings": src.get("codings"),
        "status": STATUS,
    }

    if notation in ("wilkinson_rogers", "survival"):
        fams = {family(oc, o["output_type"]) for o in src["outputs"]}
        model, terms = build_model(src, inputs, fams)
        subs = [sub_method(short, o, oc, terms) for o in src["outputs"]]

        # D2: a contrast is computed from the estimated marginal means of the same model.
        by_family = {family(oc, o["output_type"]): s for o, s in zip(src["outputs"], subs)}
        if "contrasts" in by_family and "marginal_estimates" in by_family:
            by_family["contrasts"]["inputs"] = [{
                "role": "estimated_means",
                "description": "The estimated marginal means the contrast is formed from",
                "subMethodId": by_family["marginal_estimates"]["conceptId"],
                "statisticId": sid("estimate"),
            }]

        def stats_of(spec):
            terms_ = set(x[2:] for x in spec.get("statistics", []))
            for s in spec.get("statisticSets", []):
                terms_ |= set(sets[s[3:]].get("statistics", []))
            return terms_

        for c in configurations:
            targets = []
            if c["name"] == "ss_type":
                targets = [s["conceptId"] for o, s in zip(src["outputs"], subs)
                           if family(oc, o["output_type"]) == "type3_tests"]
            elif c.get("conformsTo") in ("alpha", "conf_level") or c["name"] in ("alpha", "conf_level"):
                targets = [s["conceptId"] for s in subs if "CI_lower" in stats_of(s["output"])]
            if targets:
                c["configuredSubMethods"] = targets

        method = {**base, "methodType": "ModelBasedMethod", "configurations": configurations,
                  "inputs": inputs, "statisticalModel": model, "subMethods": subs}
    else:
        is_derivation = folder == "derivations"
        if len(src["outputs"]) != 1:
            raise ValueError(f"{src['conceptId']}: expected one output, found {len(src['outputs'])}")
        method = {
            **base,
            "methodType": "DerivationMethod" if is_derivation else "AggregationMethod",
            "configurations": configurations,
            "inputs": inputs,
            "formula": {
                "notation": "derivation" if is_derivation else "aggregation",
                "text": src["formula"]["generic_expression"],
                "defaultExpression": src["formula"].get("default_expression"),
                "notes": src["formula"].get("notes"),
            },
            "output": output_spec(src["outputs"][0], oc),
        }
    return clean(method)


def main(argv):
    wanted = set(argv)
    oc, sets = migrate_vocabularies()
    index = []
    for path in git_ls(METHODS_REF, "lib/methods/"):
        name = path.rsplit("/", 1)[-1]
        if not name.startswith("M_") or not name.endswith(".json"):
            continue
        folder = path.split("/")[-2]
        src = git_json(METHODS_REF, path)
        if wanted and src["conceptId"] not in wanted:
            continue
        method = migrate_method(src, folder, oc, sets)
        rel = f"methods/{folder}/{method['conceptId']}.json"
        write_json(LIB / rel, method)
        index.append({"conceptId": method["conceptId"], "methodType": method["methodType"], "file": rel})
    if not wanted:
        write_json(LIB / "methods" / "_index.json", {
            "description": "Index of method files. Generated by v1/tools/migrate_methods.py.",
            "methods": sorted(index, key=lambda m: m["conceptId"]),
        })
    print(f"migrated {len(index)} methods")


if __name__ == "__main__":
    main(sys.argv[1:])
