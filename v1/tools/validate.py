"""Conformance checks for the candidate v1 model.

Checks every library and study file against its schema, then checks what a
schema cannot: references between files, the layer rules, and that bindings
are satisfied (a Concept bound to a Method output is made of statistics that
output carries).

Each finding has a rule identifier, a severity, a location and a message.
Rule identifiers are documented in v1/docs/conformance.md.

Usage:
  python v1/tools/validate.py            all checks; exit 1 if any error is not a known finding
  python v1/tools/validate.py --all      also list warnings and known findings
  python v1/tools/validate.py --json     findings as JSON
"""
from __future__ import annotations

import glob
import json
import re
import sys
from dataclasses import asdict, dataclass

from common import LIB, STUDIES, V1, read_json, schema_errors, template_placeholders

TOKEN = re.compile(r"<(\w+)>")
BRACE = re.compile(r"\{(\w+)\}")


@dataclass
class Finding:
    rule: str
    severity: str  # error | warning
    where: str
    message: str

    def key(self) -> str:
        return f"{self.rule}|{self.where}"


class Model:
    """Everything in v1/lib and v1/studies, loaded once."""

    def __init__(self):
        self.files: list[tuple[str, str, str, object]] = []  # (path, schema, class, data)

        def load(rel, schema, cls):
            data = read_json(V1 / rel)
            self.files.append((rel, schema, cls, data))
            return data

        self.statistics = {s["conceptId"]: s for s in
                           load("lib/statistics/statistics.json", "ac_statistic", "StatisticLibrary")["entries"]}
        self.sets = {s["conceptId"]: s for s in
                     load("lib/statistics/statistic_sets.json", "ac_statistic_set", "StatisticSetLibrary")["entries"]}
        self.classes = {s["conceptId"]: s for s in
                        load("lib/statistics/output_classes.json", "ac_output_class", "OutputClassLibrary")["entries"]}
        self.methods = {}
        for path in sorted(glob.glob(str(LIB / "methods" / "*" / "M.*.json"))):
            rel = str(path)[len(str(V1)) + 1:]
            m = read_json(path)
            self.files.append((rel, "ac_method", m.get("methodType", "Method"), m))
            self.methods[m["conceptId"]] = m
        self.concept_lib = load("lib/concepts/concepts.json", "ac_concept", "ConceptLibrary")
        self.concepts = {c["conceptId"]: c for c in self.concept_lib["entries"]}
        self.transformation_lib = load("lib/transformations/transformations.json", "ac_transformation",
                                       "TransformationLibrary")
        self.transformations = {t["conceptId"]: t for t in self.transformation_lib["transformations"]}
        self.phrase_lib = load("lib/smartphrases/smartphrases.json", "ac_smartphrase", "SmartPhraseLibrary")
        self.phrases = {p["conceptId"]: p for p in self.phrase_lib["phrases"]}
        self.roles = {r["name"]: r for r in self.phrase_lib["roles"]}
        self.bindings = {}
        for std in ("adam", "sdtm"):
            self.bindings[std] = load(f"lib/bindings/{std}_bindings.json", "ac_binding", "DataBindingLibrary")
        self.implementations = {}
        for lang in ("r", "sas"):
            self.implementations[lang] = load(f"lib/implementations/{lang}_implementations.json",
                                              "ac_implementation", "MethodImplementationCatalogue")
        self.studies = {}
        for path in sorted(glob.glob(str(STUDIES / "*" / "analysis_set.json"))):
            rel = str(path)[len(str(V1)) + 1:]
            s = read_json(path)
            self.files.append((rel, "ac_study", "StudyAnalysisSet", s))
            self.studies[rel.split("/")[1]] = s
        self.versions = {
            "statistics": read_json(LIB / "statistics" / "statistics.json")["libraryVersion"],
            "concepts": self.concept_lib["libraryVersion"],
            "transformations": self.transformation_lib["libraryVersion"],
            "smartphrases": self.phrase_lib["libraryVersion"],
            "bindings": self.bindings["adam"]["libraryVersion"],
            "methods": "1.0.0-candidate",
        }

    # ---- helpers ---------------------------------------------------------

    def set_statistics(self, set_ids) -> set[str]:
        out = set()
        for s in set_ids or []:
            out |= set(self.sets.get(s, {}).get("statistics", []))
        return out

    def output_statistics(self, spec: dict, with_optional=True) -> set[str]:
        out = set(spec.get("statistics", [])) | self.set_statistics(spec.get("statisticSets"))
        if with_optional:
            out |= set(spec.get("optionalStatistics", []))
        return out

    def producers(self, method: dict) -> dict[str, dict]:
        """Identifier -> output specification, for the method and its sub-methods."""
        out = {}
        if method.get("output"):
            out[method["conceptId"]] = method["output"]
        for sm in method.get("subMethods", []):
            if sm.get("output"):
                out[sm["conceptId"]] = sm["output"]
        return out

    def formula(self, method: dict) -> dict | None:
        return method.get("formula") or (method.get("statisticalModel") or {}).get("formula")


def strings(node):
    """Every string value in a JSON structure."""
    if isinstance(node, dict):
        for v in node.values():
            yield from strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v)
    elif isinstance(node, str):
        yield node


def keys(node):
    if isinstance(node, dict):
        for k, v in node.items():
            yield k
            yield from keys(v)
    elif isinstance(node, list):
        for v in node:
            yield from keys(v)


def skeleton(expr: str, names: list[str]) -> tuple[str, list[str]]:
    """An expression with its operand names replaced by positional markers."""
    rhs = re.split(r":?=", expr, maxsplit=1)[-1]
    order = []

    def repl(m):
        name = m.group(1) or m.group(2)
        if name not in names:
            return m.group(0)
        if name not in order:
            order.append(name)
        return f"${order.index(name)}"

    out = re.sub(r"<(\w+)>|\b([A-Za-z_]\w*)\b", repl, rhs)
    return re.sub(r"\s+", "", out), order


# --------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------

def check_schema(m: Model, out: list[Finding]):
    for rel, schema, cls, data in m.files:
        for e in schema_errors(data, schema, cls):
            out.append(Finding("S1", "error", rel, f"does not conform to {cls}: {e}"))


def check_vocabularies(m: Model, out):
    for sid, s in m.sets.items():
        for t in s.get("statistics", []):
            if t not in m.statistics:
                out.append(Finding("V1", "error", sid, f"unknown statistic {t}"))
    for cid, c in m.classes.items():
        for s in c.get("statisticSets", []):
            if s not in m.sets:
                out.append(Finding("V2", "error", cid, f"unknown statistic set {s}"))
        for t in c.get("statistics", []) + c.get("optionalStatistics", []):
            if t not in m.statistics:
                out.append(Finding("V2", "error", cid, f"unknown statistic {t}"))
        if c.get("broader") and c["broader"] not in m.classes:
            out.append(Finding("V3", "error", cid, f"unknown broader class {c['broader']}"))


def check_methods(m: Model, out):
    for mid, method in m.methods.items():
        roles = [i["role"] for i in method.get("inputs", [])]
        configs = {c["name"] for c in method.get("configurations", [])}
        if len(roles) != len(set(roles)):
            out.append(Finding("M1", "error", mid, "input roles are not unique"))
        formula = m.formula(method)
        if not formula:
            out.append(Finding("M2", "error", mid, "no formula"))
        else:
            for tok in TOKEN.findall(formula["text"]):
                if tok not in roles and tok not in configs:
                    out.append(Finding("M2", "warning", mid,
                                       f"formula token <{tok}> is neither an input role nor a configuration"))
        model = method.get("statisticalModel")
        levels = {lv["name"] for i in method.get("inputs", []) for lv in i.get("levels", [])}
        terms, params = set(), set()
        if model:
            for r in model.get("isModelFor", []):
                if r not in roles:
                    out.append(Finding("M3", "error", mid, f"isModelFor names unknown role {r}"))
            for t in model.get("modelTerms", []):
                terms.add(t["name"])
                for r in t.get("forInputs", []):
                    if r not in roles:
                        out.append(Finding("M3", "error", mid, f"model term {t['name']} names unknown role {r}"))
                for p in t.get("parameters", []):
                    params.add(p["name"])
                    for lv in p.get("forFactorLevels", []):
                        if lv not in levels:
                            out.append(Finding("M3", "error", mid, f"parameter {p['name']} names unknown level {lv}"))
                    for r in p.get("forInputVariables", []):
                        if r not in roles:
                            out.append(Finding("M3", "error", mid, f"parameter {p['name']} names unknown role {r}"))
                    for r in (p.get("forFactorLevelCombination") or {}).get("factors", []):
                        if r not in roles:
                            out.append(Finding("M3", "error", mid, f"parameter {p['name']} names unknown factor {r}"))
        subs = {s["conceptId"] for s in method.get("subMethods", [])}
        for pid, spec in m.producers(method).items():
            oc = spec.get("outputClass")
            if oc and oc not in m.classes:
                out.append(Finding("M4", "error", pid, f"unknown output class {oc}"))
            for s in spec.get("statisticSets", []):
                if s not in m.sets:
                    out.append(Finding("M4", "error", pid, f"unknown statistic set {s}"))
            for t in spec.get("statistics", []) + spec.get("optionalStatistics", []):
                if t not in m.statistics:
                    out.append(Finding("M4", "error", pid, f"unknown statistic {t}"))
            for t in spec.get("forModelTerms", []):
                if t not in terms:
                    out.append(Finding("M4", "error", pid, f"output names unknown model term {t}"))
            for p in spec.get("forModelParameters", []):
                if p not in params:
                    out.append(Finding("M4", "error", pid, f"output names unknown model parameter {p}"))
            if oc in m.classes:
                expected = m.output_statistics(m.classes[oc])
                if m.output_statistics(spec) != expected:
                    out.append(Finding("M6", "error", pid, f"statistics differ from those of output class {oc}"))
        for sm in method.get("subMethods", []):
            for i in sm.get("inputs", []):
                if i.get("subMethodId") not in subs:
                    out.append(Finding("M4", "error", sm["conceptId"], f"input names unknown sub-method {i.get('subMethodId')}"))
                if i.get("statisticId") not in m.statistics:
                    out.append(Finding("M4", "error", sm["conceptId"], f"input names unknown statistic {i.get('statisticId')}"))
        for c in method.get("configurations", []):
            for s in c.get("configuredSubMethods", []):
                if s not in subs:
                    out.append(Finding("M5", "error", mid, f"configuration {c['name']} names unknown sub-method {s}"))
            if c.get("enumValues") and c.get("defaultValue") is not None and c["defaultValue"] not in c["enumValues"]:
                out.append(Finding("M5", "error", mid, f"default of {c['name']} is not one of its allowed values"))
        # Layer rule L1: a Method references no Concept, Transformation or variable.
        for s in strings(method):
            if re.fullmatch(r"(C|T)\.[A-Za-z].*", s):
                out.append(Finding("L1", "error", mid, f"a Method must not reference {s}"))
        if {"concept", "conceptCategory", "variable", "dataset"} & set(keys(method)):
            out.append(Finding("L1", "error", mid, "a Method must not carry concept or variable bindings"))


def check_concepts(m: Model, out):
    for cid, c in m.concepts.items():
        for b in c.get("broader", []):
            if b not in m.concepts:
                out.append(Finding("C1", "error", cid, f"unknown broader concept {b}"))
            elif not m.concepts[b].get("abstract"):
                out.append(Finding("C1", "error", cid, f"broader concept {b} is not abstract"))
        for b in c.get("partOf", []):
            if b not in m.concepts:
                out.append(Finding("C1", "error", cid, f"is part of unknown concept {b}"))
        form = c["definitionForm"]
        has_a, has_m = "algebraicDefinition" in c, "methodBoundDefinition" in c
        if (form == "closedForm") != has_a or (form == "methodBound") != has_m:
            out.append(Finding("C2", "error", cid, f"definition form {form} does not match the definition given"))
        if c["conceptRole"] == "collected" and form != "none":
            out.append(Finding("C2", "error", cid, "a collected concept has no definition"))
        d = c.get("methodBoundDefinition") or {}
        for t in d.get("constituents", []) + d.get("optionalConstituents", []):
            if t not in m.statistics:
                out.append(Finding("C3", "error", cid, f"unknown statistic {t}"))
        for s in d.get("statisticSets", []):
            if s not in m.sets:
                out.append(Finding("C3", "error", cid, f"unknown statistic set {s}"))
        for oc in d.get("satisfiedBy", []):
            if oc not in m.classes:
                out.append(Finding("C3", "error", cid, f"unknown output class {oc}"))
            elif not set(d.get("constituents", [])) <= m.output_statistics(m.classes[oc]):
                out.append(Finding("C4", "error", cid, f"output class {oc} does not carry the concept's statistics"))
        if c["conceptRole"] == "analysis" and form == "methodBound" and not d.get("satisfiedBy"):
            out.append(Finding("C4", "warning", cid, "no output class satisfies this analysis concept"))
        if a := c.get("algebraicDefinition"):
            names = [o["name"] for o in a["operands"]]
            used = set(re.findall(r"\b[A-Za-z_]\w*\b", a["identity"].split("=", 1)[-1]))
            for n in names:
                if n not in used:
                    out.append(Finding("C5", "error", cid, f"operand {n} is not used in the identity"))
        inherits = (c.get("result") or {}).get("inheritsFrom")
        if inherits and inherits not in m.concepts:
            out.append(Finding("C1", "error", cid, f"result inherits from unknown concept {inherits}"))
        # Layer rule L2: a Concept holds no variable mapping and names no Method or Transformation.
        if {"variable", "dataset", "locator", "provenance"} & set(keys(c)):
            out.append(Finding("L2", "error", cid, "a Concept must not hold a mapping to a variable"))
        for s in strings(c):
            if re.fullmatch(r"(S?M|T)\.[A-Za-z].*", s):
                out.append(Finding("L2", "error", cid, f"a Concept must not reference {s}"))


def check_transformations(m: Model, out):
    for tid, t in m.transformations.items():
        method = m.methods.get(t["usesMethod"])
        if not method:
            out.append(Finding("T1", "error", tid, f"unknown method {t['usesMethod']}"))
            continue
        inputs = {i["role"]: i for i in method.get("inputs", [])}
        producers = m.producers(method)
        ids, ods = t["inputDataStructure"], t["outputDataStructure"]

        expected = "analysis" if method["methodType"] in ("ModelBasedMethod", "AggregationMethod", "CompositeMethod") \
            else "derivation"
        if t["transformationType"] != expected:
            out.append(Finding("T1", "warning", tid,
                               f"a {t['transformationType']} transformation uses a {method['methodType']}"))

        bound: dict[str, int] = {}
        dim_names = set()
        for kind in ("dimensions", "measures"):
            for b in ids.get(kind, []):
                ref = b.get("concept") or b.get("conceptCategory")
                if kind == "dimensions":
                    dim_names.add(ref)
                if b.get("input"):
                    if b["input"] not in inputs:
                        out.append(Finding("T2", "error", tid, f"input {b['input']} is not a role of {method['conceptId']}"))
                    bound[b["input"]] = bound.get(b["input"], 0) + 1
        for role, n in bound.items():
            if role in inputs and n > 1 and not inputs[role]["multivalued"]:
                out.append(Finding("T6", "error", tid, f"single-valued input {role} is bound {n} times"))
        for role, i in inputs.items():
            if i["required"] and role not in bound:
                out.append(Finding("T6", "warning", tid, f"required input {role} is not bound"))

        for side in (ids, ods):
            for kind in ("dimensions", "measures"):
                for b in side.get(kind, []):
                    for key in ("concept", "conceptCategory"):
                        ref = b.get(key)
                        if not ref:
                            continue
                        if ref not in m.concepts:
                            out.append(Finding("T7", "error", tid, f"unknown concept {ref}"))
                        elif key == "conceptCategory" and not m.concepts[ref].get("abstract"):
                            out.append(Finding("T7", "error", tid, f"{ref} is used as a category but is not abstract"))
                        elif key == "concept" and m.concepts[ref].get("abstract"):
                            out.append(Finding("T7", "error", tid, f"{ref} is abstract and can only be a category"))
        slices = {s["name"]: s for s in ids.get("slices", [])}
        for b in ids.get("measures", []):
            if b.get("slice") and b["slice"] not in slices:
                out.append(Finding("T4", "error", tid, f"unknown slice {b['slice']}"))
        for s in slices.values():
            for c in s["constraints"]:
                if c["dimension"] not in dim_names:
                    out.append(Finding("T5", "error", tid, f"slice {s['name']} constrains {c['dimension']}, not a dimension of the input"))
        for k in t.get("sliceKeys", []):
            if k["dimension"] not in dim_names:
                out.append(Finding("T5", "error", tid, f"slice key {k['dimension']} is not a dimension of the input"))

        configs = {c["name"]: c for c in method.get("configurations", [])}
        for c in t.get("methodConfigurations", []):
            definition = configs.get(c["configurationName"])
            if not definition:
                out.append(Finding("T3", "error", tid, f"{c['configurationName']} is not a configuration of {method['conceptId']}"))
            elif definition.get("enumValues") and "value" in c and c["value"] not in definition["enumValues"]:
                out.append(Finding("T3", "error", tid, f"{c['configurationName']} = {c['value']!r} is not an allowed value"))

        term_names = {tm["name"] for tm in (method.get("statisticalModel") or {}).get("modelTerms", [])}
        bindings = {(b.get("input"), b.get("concept") or b.get("conceptCategory"))
                    for kind in ("dimensions", "measures") for b in ids.get(kind, []) if b.get("input")}
        for mi in ids.get("modelInteractions", []):
            ops = mi["operands"]
            for o in ops:
                if (o["input"], o.get("concept") or o.get("conceptCategory")) not in bindings:
                    out.append(Finding("T8", "error", tid, f"interaction operand {o['input']} matches no input binding"))
            if len(ops) == 2:
                a, b = ops[0]["input"], ops[1]["input"]
                if f"{a}:{b}" not in term_names and f"{b}:{a}" not in term_names:
                    out.append(Finding("T8", "error", tid, f"the formula of {method['conceptId']} allows no {a}:{b} interaction"))

        for b in ods.get("measures", []):
            pid = b["output"]
            if pid not in producers:
                out.append(Finding("T2", "error", tid, f"output {pid} is not produced by {method['conceptId']}"))
                continue
            concept = m.concepts.get(b.get("concept") or "")
            if not concept:
                continue
            d = concept.get("methodBoundDefinition") or {}
            if concept["conceptRole"] == "analysis" and d.get("constituents"):
                missing = set(d["constituents"]) - m.output_statistics(producers[pid])
                if missing:
                    out.append(Finding("T9", "error", tid,
                                       f"{pid} does not satisfy {concept['conceptId']}: it lacks {', '.join(sorted(missing))}"))
            if concept.get("algebraicDefinition") and concept["conceptId"] != "C.Measure":
                a = concept["algebraicDefinition"]
                want, _ = skeleton(a["identity"], [o["name"] for o in a["operands"]])
                formula = m.formula(method) or {}
                have, _ = skeleton(formula.get("text", ""), list(inputs))
                if want != have:
                    out.append(Finding("T9", "warning", tid,
                                       f"the formula of {method['conceptId']} does not unify with the identity of {concept['conceptId']}"))

        for p in t.get("validSmartPhrases", []):
            if p not in m.phrases:
                out.append(Finding("T10", "error", tid, f"unknown SmartPhrase {p}"))
        # Layer rule L3: a Transformation names no physical variable.
        if {"variable", "dataset", "locator"} & set(keys(t)):
            out.append(Finding("L3", "error", tid, "a Transformation must not name a physical variable"))


def check_smartphrases(m: Model, out):
    lib = m.phrase_lib
    for r in lib["roleOrder"]:
        if r not in m.roles:
            out.append(Finding("P1", "error", "roleOrder", f"unknown role {r}"))
    for r in m.roles:
        if r not in lib["roleOrder"]:
            out.append(Finding("P1", "error", r, "role is missing from roleOrder"))
    for pid, p in m.phrases.items():
        if p["role"] not in m.roles:
            out.append(Finding("P1", "error", pid, f"unknown role {p['role']}"))
        tokens = set(BRACE.findall(p["phraseTemplate"]))
        names = {ph["name"] for ph in p.get("placeholders", [])}
        if tokens != names:
            out.append(Finding("P2", "error", pid, f"template tokens {sorted(tokens)} differ from placeholders {sorted(names)}"))
        a = p.get("anchors") or {}
        if a.get("producedConcept") and a["producedConcept"] not in m.concepts:
            out.append(Finding("P3", "error", pid, f"unknown concept {a['producedConcept']}"))
        if a.get("usesMethod") and a["usesMethod"] not in m.methods:
            out.append(Finding("P3", "error", pid, f"unknown method {a['usesMethod']}"))
        for ph in p.get("placeholders", []):
            cat = ph.get("conceptCategory")
            if cat and (cat not in m.concepts or not m.concepts[cat].get("abstract")):
                out.append(Finding("P4", "error", pid, f"{cat} is not an abstract concept"))
        # Layer rule L5: a SmartPhrase names no physical variable.
        if {"variable", "dataset", "locator"} & set(keys(p)):
            out.append(Finding("L5", "error", pid, "a SmartPhrase must not name a physical variable"))
    for pack in lib.get("languagePacks", []):
        where = f"languagePack/{pack['language']}"
        for tok in BRACE.findall(pack["sentenceTemplate"]):
            if tok not in m.roles and tok != "sentenceRole":
                out.append(Finding("P5", "error", where, f"sentence template token {{{tok}}} is not a role"))
        for t in pack.get("phraseTemplates", []):
            if t["key"] not in m.phrases:
                out.append(Finding("P5", "error", where, f"translation for unknown phrase {t['key']}"))
            elif set(BRACE.findall(t.get("text", ""))) != set(BRACE.findall(m.phrases[t["key"]]["phraseTemplate"])):
                out.append(Finding("P5", "error", where, f"translation of {t['key']} has different placeholders"))
        for t in pack.get("methodNames", []):
            if t["key"] not in m.methods:
                out.append(Finding("P5", "error", where, f"name for unknown method {t['key']}"))
        for t in pack.get("outputNames", []):
            if t["key"] not in m.classes:
                out.append(Finding("P5", "error", where, f"name for unknown output class {t['key']}"))
        for t in pack.get("roleConjunctions", []):
            if t["key"] not in m.roles:
                out.append(Finding("P5", "error", where, f"conjunction for unknown role {t['key']}"))


def check_bindings(m: Model, out):
    for std, lib in m.bindings.items():
        seen = set()
        carriers: dict[tuple, set] = {}
        for b in lib["bindings"]:
            if b["id"] in seen:
                out.append(Finding("B2", "error", b["id"], "duplicate binding identifier"))
            seen.add(b["id"])
            if b["concept"] not in m.concepts:
                out.append(Finding("B1", "error", b["id"], f"unknown concept {b['concept']}"))
            elif m.concepts[b["concept"]].get("abstract"):
                out.append(Finding("B1", "error", b["id"], f"{b['concept']} is abstract and cannot be bound"))
            if b["locator"]["locatorType"] != "tabular":
                out.append(Finding("B4", "error", b["id"], "only tabular locators are defined in candidate v1"))
            carriers.setdefault((b["locator"].get("datasetClass"), b["locator"]["variable"]), set()).add(b["concept"])
            for s in strings(b):
                if re.fullmatch(r"(S?M|T)\.[A-Za-z].*", s):
                    out.append(Finding("L4", "error", b["id"], f"a Data Binding maps to Concepts only, not {s}"))
        if std == "adam":
            for b in lib["bindings"]:
                many = len({c for (cls, var), cs in carriers.items() if var == b["locator"]["variable"] for c in cs}) > 1
                if many and not b.get("parameterDependent"):
                    out.append(Finding("B3", "error", b["id"],
                                       f"{b['locator']['variable']} carries several concepts but is not marked parameterDependent"))


def check_implementations(m: Model, out):
    for lang, cat in m.implementations.items():
        for i in cat["implementations"]:
            where = f"{lang}/{i['method']}"
            method = m.methods.get(i["method"])
            if not method:
                out.append(Finding("I1", "error", where, "unknown method"))
                continue
            producers = m.producers(method) or {method["conceptId"]: {}}
            for om in i.get("outputMapping", []):
                if om["producer"] not in producers and om["producer"] != method["conceptId"]:
                    out.append(Finding("I2", "error", where, f"{om['producer']} is not produced by the method"))
                for rc in om.get("resultColumns", []):
                    if rc.get("statistic") and rc["statistic"] not in m.statistics:
                        out.append(Finding("I3", "error", where, f"unknown statistic {rc['statistic']}"))
            known = {x["role"] for x in method.get("inputs", [])} | {c["name"] for c in method.get("configurations", [])}
            for tok in set(TOKEN.findall(i["callTemplate"])) - known - {"dataset"}:
                out.append(Finding("I4", "warning", where, f"call template token <{tok}> is not a role or configuration of the method"))


def check_studies(m: Model, out):
    all_class_bindings = m.bindings["adam"]["bindings"]
    for sid, s in m.studies.items():
        def f(rule, severity, where, msg):
            out.append(Finding(rule, severity, f"{sid}/{where}", msg))

        for pin in s["libraryPins"]:
            actual = m.versions.get(pin["library"])
            if actual is None:
                f("Y1", "error", "libraryPins", f"unknown library {pin['library']}")
            elif actual != pin["version"]:
                f("Y1", "error", "libraryPins", f"{pin['library']} is pinned at {pin['version']} but the library is {actual}")
        concepts = {c["id"]: c for c in s.get("studyConcepts", [])}
        for cid, c in concepts.items():
            lib_c = m.concepts.get(c["concept"])
            if not lib_c:
                f("Y4", "error", cid, f"unknown library concept {c['concept']}")
            elif lib_c.get("abstract"):
                f("Y4", "error", cid, f"{c['concept']} is abstract")
        estimands = {e["id"]: e for e in s.get("estimands", [])}
        for eid, e in estimands.items():
            for ice in e["intercurrentEvents"]:
                if ice not in concepts or concepts[ice]["kind"] != "IntercurrentEvent":
                    f("Y7", "error", eid, f"{ice} is not an intercurrent event of the study")
        for g in s.get("methodGroundings", []):
            if g["method"] not in m.methods:
                f("Y14", "error", "methodGroundings", f"unknown method {g['method']}")
        derivations = {d["id"]: d for d in s.get("derivations", [])}
        has_document = bool(s.get("sourceDocument"))
        value_bindings = s.get("dataBindings", [])
        for b in value_bindings:
            if b["concept"] not in m.concepts:
                f("Y12", "error", b["id"], f"unknown concept {b['concept']}")
            if b.get("studyConcept") and b["studyConcept"] not in concepts:
                f("Y12", "error", b["id"], f"unknown study concept {b['studyConcept']}")
            if b["level"] != "valueLevel":
                f("Y12", "error", b["id"], "a study holds value-level bindings")

        main: dict[str, int] = {}
        instances = [(d, "derivation") for d in derivations.values()] + [(a, "analysis") for a in s.get("analyses", [])]
        for inst, kind in instances:
            iid = inst["id"]
            t = m.transformations.get(inst["template"])
            if not t:
                f("Y2", "error", iid, f"unknown template {inst['template']}")
                continue
            if t["transformationType"] != kind:
                f("Y2", "error", iid, f"a {kind} concept instantiates {t['transformationType']} template {t['conceptId']}")
            method = m.methods[t["usesMethod"]]
            values = {v["name"]: v for v in inst.get("placeholderValues", [])}
            for name in template_placeholders(t):
                if name not in values:
                    f("Y3", "error", iid, f"no value for the template placeholder {{{name}}}")
            for v in values.values():
                sc = v.get("studyConcept")
                if sc and sc not in concepts:
                    f("Y4", "error", iid, f"unknown study concept {sc}")
                if not sc and "value" not in v:
                    f("Y3", "error", iid, f"placeholder {v['name']} has neither a study concept nor a value")
            configs = {c["name"]: c for c in method.get("configurations", [])}
            for cv in inst.get("configurationValues", []):
                definition = configs.get(cv["name"])
                if not definition:
                    f("Y9", "error", iid, f"{cv['name']} is not a configuration of {method['conceptId']}")
                elif definition.get("enumValues") and "value" in cv and cv["value"] not in definition["enumValues"]:
                    f("Y9", "error", iid, f"{cv['name']} = {cv['value']!r} is not an allowed value")
            if kind == "analysis" and not ({"alpha", "conf_level"} & set(configs)):
                for pi in inst.get("phrases", []):
                    if any(b["slot"] == "conf_level" for b in pi.get("bindings", [])):
                        f("Y9", "warning", iid, f"a confidence level is stated, but {method['conceptId']} has no "
                                                "configuration to carry it")
            for d in inst.get("dependsOn", []):
                if d not in derivations:
                    f("Y10", "error", iid, f"depends on unknown derivation {d}")

            # Y10: every input measure is produced by a derivation or bound to data.
            produced = set()
            stack = list(inst.get("dependsOn", []))
            while stack:
                d = derivations.get(stack.pop())
                if not d:
                    continue
                dt = m.transformations.get(d["template"])
                if dt:
                    produced |= {b.get("concept") for b in dt["outputDataStructure"].get("measures", [])}
                stack += d.get("dependsOn", [])
            used_concepts = {v.get("studyConcept") for v in values.values()}
            for b in t["inputDataStructure"].get("measures", []):
                c = b.get("concept")
                if not c or c in produced:
                    continue
                by_value = any(vb["concept"] == c and vb.get("studyConcept") in used_concepts for vb in value_bindings)
                by_class = any(cb["concept"] == c and not cb.get("parameterDependent") for cb in all_class_bindings)
                if not (by_value or by_class):
                    f("Y10", "error", iid, f"input {c} is neither derived nor bound to data")

            if kind != "analysis":
                continue
            a = inst
            est = a.get("addressesEstimand")
            if est:
                if est not in estimands:
                    f("Y7", "error", iid, f"unknown estimand {est}")
                elif a.get("analysisRole") == "MainEstimator":
                    main[est] = main.get(est, 0) + 1
                if not a.get("analysisRole"):
                    f("Y7", "error", iid, "an analysis that addresses an estimand states its role")
            scope = estimands.get(est, {}).get("intercurrentEvents", []) if est else []
            handled = {h["intercurrentEvent"]: h for h in a.get("iceHandlings", [])}
            for ice in scope:
                if ice not in handled:
                    f("Y8", "error", iid, f"no handling stated for intercurrent event {ice}")
            for ice, h in handled.items():
                if ice not in scope:
                    f("Y8", "error", iid, f"handles {ice}, which is not in the scope of {est}")
                for tid in h["implementedBy"]:
                    if tid not in m.transformations:
                        f("Y8", "error", iid, f"strategy implemented by unknown transformation {tid}")
                if h["strategy"] != "TreatmentPolicy" and not h["implementedBy"]:
                    f("Y8", "error", iid, f"{h['strategy']} handling of {ice} has no implementing transformation")
                if h["basis"] == "statedByPhrase":
                    p = m.phrases.get(h.get("fromPhrase") or "")
                    if not p or (p.get("anchors") or {}).get("icheStrategy") != h["strategy"]:
                        f("Y8", "error", iid, f"the phrase given does not state the {h['strategy']} strategy")

            producers = m.producers(method)
            template_outputs = {b["output"] for b in t["outputDataStructure"].get("measures", [])}
            if a.get("summaryOutput") and a["summaryOutput"] not in template_outputs:
                f("Y13", "error", iid, f"summary output {a['summaryOutput']} is not an output of {t['conceptId']}")
            valid = set(t.get("validSmartPhrases", []))
            role_count: dict[str, int] = {}
            for pi in a.get("phrases", []):
                p = m.phrases.get(pi["phrase"])
                where = f"{iid}/{pi['phrase']}"
                if not p:
                    f("Y5", "error", where, "unknown SmartPhrase")
                    continue
                if pi["phrase"] not in valid:
                    f("Y5", "error", where, f"not one of the SmartPhrases {t['conceptId']} accepts")
                role_count[p["role"]] = role_count.get(p["role"], 0) + 1
                slots = {ph["name"]: ph for ph in p.get("placeholders", [])}
                given = {b["slot"]: b for b in pi.get("bindings", [])}
                for name, ph in slots.items():
                    if ph.get("required") and name not in given:
                        f("Y5", "error", where, f"required placeholder {name} is not bound")
                for name, b in given.items():
                    ph = slots.get(name)
                    if not ph:
                        f("Y5", "error", where, f"binding for unknown placeholder {name}")
                        continue
                    kind_given = next((k for k in ("studyConcept", "method", "output", "value", "extension") if k in b), None)
                    want = {"concept_ref": "studyConcept", "method_ref": "method", "output_ref": "output",
                            "value": "value", "extension_ref": "extension"}[ph["kind"]]
                    if kind_given != want:
                        f("Y5", "error", where, f"placeholder {name} needs a {ph['kind']} binding")
                        continue
                    if want == "studyConcept":
                        sc = concepts.get(b["studyConcept"])
                        if not sc:
                            f("Y4", "error", where, f"unknown study concept {b['studyConcept']}")
                        elif ph.get("conceptConstraint") and sc["kind"] != ph["conceptConstraint"]:
                            # A timepoint is the one kind the library names differently from its category.
                            if not (ph.get("conceptCategory") and
                                    ph["conceptCategory"] in m.concepts.get(sc["concept"], {}).get("broader", [])):
                                f("Y5", "error", where, f"{b['studyConcept']} is a {sc['kind']}, not a {ph['conceptConstraint']}")
                    elif want == "method" and b["method"] not in m.methods:
                        f("Y5", "error", where, f"unknown method {b['method']}")
                    elif want == "output":
                        if b["output"] not in producers or b["output"] not in template_outputs:
                            f("Y5", "error", where, f"{b['output']} is not an output of {t['conceptId']} and its method")
                    elif want == "value" and ph.get("constraint"):
                        try:
                            x = float(b["value"])
                            lo, hi = ph["constraint"].get("min"), ph["constraint"].get("max")
                            if (lo is not None and x < lo) or (hi is not None and x > hi):
                                f("Y5", "error", where, f"value {b['value']} is outside {lo}–{hi}")
                        except ValueError:
                            f("Y5", "error", where, f"value {b['value']} is not a number")
                # A use is anchored by its own quote, or through a bound study
                # concept that carries one; otherwise it must say why it has none.
                via_concept = any(concepts.get(b.get("studyConcept"), {}).get("sapRefs") for b in pi.get("bindings", []))
                if has_document and not pi.get("sapRefs") and not via_concept and not pi.get("noAnchorReason"):
                    f("Y11", "error", where, "no document anchor and no reason given")
            for role, n in role_count.items():
                if n > 1 and not m.roles[role].get("repeating"):
                    f("Y6", "error", iid, f"role {role} is filled {n} times but does not repeat")
            if has_document and not a.get("sapRefs"):
                f("Y11", "error", iid, "the analysis has no document anchor")
        for eid in estimands:
            if main.get(eid, 0) != 1:
                f("Y7", "error", eid, f"an estimand has exactly one main estimator; found {main.get(eid, 0)}")


CHECKS = [check_schema, check_vocabularies, check_methods, check_concepts, check_transformations,
          check_smartphrases, check_bindings, check_implementations, check_studies]


def run() -> list[Finding]:
    m = Model()
    out: list[Finding] = []
    for check in CHECKS:
        check(m, out)
    return out


def known_findings() -> dict[str, str]:
    path = V1 / "tests" / "known_findings.json"
    return {k["key"]: k["reason"] for k in read_json(path)["known"]} if path.exists() else {}


def main(argv):
    findings = run()
    known = known_findings()
    if "--json" in argv:
        print(json.dumps([asdict(x) | {"known": x.key() in known} for x in findings], indent=2))
        return 0
    errors = [x for x in findings if x.severity == "error" and x.key() not in known]
    known_hit = [x for x in findings if x.key() in known]
    warnings = [x for x in findings if x.severity == "warning" and x.key() not in known]
    for x in errors:
        print(f"ERROR   {x.rule:4} {x.where}: {x.message}")
    if "--all" in argv:
        for x in warnings:
            print(f"warning {x.rule:4} {x.where}: {x.message}")
        for x in known_hit:
            print(f"known   {x.rule:4} {x.where}: {x.message}")
    stale = sorted(set(known) - {x.key() for x in findings})
    for k in stale:
        print(f"STALE   known finding no longer occurs: {k}")
    print(f"{len(errors)} errors, {len(warnings)} warnings, {len(known_hit)} known findings"
          + (f", {len(stale)} stale known findings" if stale else ""))
    return 1 if errors or stale else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
