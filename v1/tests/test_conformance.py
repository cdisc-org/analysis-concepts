"""Conformance tests for the candidate v1 model.

Run from the repository root:  python -m pytest v1/tests -q

Three kinds of test:
  * the libraries and studies as committed pass every check;
  * each rule fires when the model is deliberately broken (so a clean run
    means something);
  * the reference tools reproduce known results: the analysis sentences of
    the SmartPhrase proof of concept, and the derivation and data
    requirements of the worked studies.
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import build  # noqa: E402
import validate  # noqa: E402
from common import STUDIES, V1, read_json  # noqa: E402
from render import Renderer  # noqa: E402
from resolve import data_requirements, derivation_order  # noqa: E402
import downstream  # noqa: E402


@pytest.fixture(scope="module")
def model():
    return validate.Model()


@pytest.fixture()
def broken(model):
    """A private copy of the model that a test may damage."""
    return copy.deepcopy(model)


def findings(m, *checks):
    out = []
    for check in checks or validate.CHECKS:
        check(m, out)
    return out


def rules(found, severity="error"):
    return {f.rule for f in found if f.severity == severity}


# --------------------------------------------------------------------------
# The model as committed
# --------------------------------------------------------------------------

def test_every_file_conforms_to_its_schema(model):
    assert [f for f in findings(model, validate.check_schema)] == []


def test_no_errors_beyond_the_known_findings(model):
    known = validate.known_findings()
    errors = [f for f in findings(model) if f.severity == "error" and f.key() not in known]
    assert errors == [], "\n".join(f"{f.rule} {f.where}: {f.message}" for f in errors)


def test_known_findings_still_occur(model):
    occurring = {f.key() for f in findings(model)}
    stale = sorted(set(validate.known_findings()) - occurring)
    assert stale == [], f"remove from known_findings.json: {stale}"


def test_inventory(model):
    assert len(model.methods) == 60
    assert len(model.statistics) == 57
    assert len(model.sets) == 13
    assert len(model.classes) == 43
    assert len(model.concepts) == 108
    assert len(model.transformations) == 26
    assert len(model.phrases) == 31
    assert len(model.roles) == 10
    assert set(model.studies) == {"cdiscpilot01", "pre0102"}
    by_type = {}
    for m in model.methods.values():
        by_type[m["methodType"]] = by_type.get(m["methodType"], 0) + 1
    assert by_type == {"ModelBasedMethod": 14, "AggregationMethod": 25, "DerivationMethod": 21}


def test_generated_json_schema_is_up_to_date():
    for name in build.SCHEMAS:
        committed = (V1 / "json_schema" / f"{name}.schema.json").read_text(encoding="utf-8")
        assert build.generate(name) == committed, f"run `python v1/tools/build.py`: {name} is out of date"


def test_every_library_entry_has_a_status(model):
    entries = list(model.statistics.values()) + list(model.sets.values()) + list(model.classes.values()) \
        + list(model.methods.values()) + list(model.concepts.values()) \
        + list(model.transformations.values()) + list(model.phrases.values())
    assert all(e.get("status") in ("released", "provisional", "deprecated") for e in entries)


def test_provisional_content_is_what_the_build_added(model):
    provisional = {e["conceptId"] for group in (model.concepts, model.transformations, model.phrases)
                   for e in group.values() if e.get("status") == "provisional"}
    assert provisional == {
        "C.IntercurrentEvent", "C.LandmarkEstimates", "T.PFS_KaplanMeier",
        "SP_ICE_TREATMENT_POLICY", "SP_ICE_HYPOTHETICAL", "SP_ICE_COMPOSITE", "SP_ICE_WHILE_ON_TREATMENT",
        "SP_ICE_PRINCIPAL_STRATUM", "SP_CENSOR_LTFU", "SP_KM_CURVES", "SP_SUMMARY_MEASURE",
    }


# --------------------------------------------------------------------------
# Each rule fires when the model is broken
# --------------------------------------------------------------------------

def _analysis(m, study="cdiscpilot01", aid="AC.PRIMARY.ADASCOG"):
    return next(a for a in m.studies[study]["analyses"] if a["id"] == aid)


def break_method_names_a_concept(m):
    m.methods["M.Subtraction"]["inputs"][0]["description"] = "C.Change"


def break_concept_holds_a_variable(m):
    m.concepts["C.Change"]["variable"] = "CHG"


def break_concept_names_a_method(m):
    m.concepts["C.LSMeans"]["description"] = "M.ANCOVA"


def break_transformation_names_a_variable(m):
    m.transformations["T.CFB_ANCOVA"]["inputDataStructure"]["measures"][0]["variable"] = "CHG"


def break_binding_points_at_a_method(m):
    m.bindings["adam"]["bindings"][0]["description"] = "M.ANCOVA"


def break_unknown_method(m):
    m.transformations["T.CFB_ANCOVA"]["usesMethod"] = "M.NoSuchMethod"


def break_unknown_input_role(m):
    m.transformations["T.CFB_ANCOVA"]["inputDataStructure"]["measures"][0]["input"] = "outcome"


def break_output_does_not_satisfy_concept(m):
    measures = m.transformations["T.CFB_ANCOVA"]["outputDataStructure"]["measures"]
    next(x for x in measures if x["concept"] == "C.Contrasts")["output"] = "SM.ANCOVA.FitStatisticsLinear"


def break_concrete_concept_used_as_category(m):
    dims = m.transformations["T.CFB_ANCOVA"]["inputDataStructure"]["dimensions"]
    next(d for d in dims if d.get("conceptCategory") == "C.VisitDimension")["conceptCategory"] = "C.Visit"


def break_unknown_configuration(m):
    m.transformations["T.CFB_ANCOVA"]["methodConfigurations"][0]["value"] = "V"


def break_interaction_not_in_formula(m):
    ids = m.transformations["T.CFB_ANCOVA"]["inputDataStructure"]
    ids["modelInteractions"] = [{"operands": [
        {"input": "response", "concept": "C.Change"}, {"input": "covariate", "concept": "C.Measure"}]}]


def break_output_statistics_differ_from_class(m):
    m.methods["M.ANCOVA"]["subMethods"][0]["output"]["statistics"].append("S.p_value")


def break_model_term_names_unknown_role(m):
    m.methods["M.ANCOVA"]["statisticalModel"]["modelTerms"][0]["forInputs"] = ["nonesuch"]


def break_closed_form_without_identity(m):
    del m.concepts["C.Change"]["algebraicDefinition"]


def break_satisfying_class_lacks_statistics(m):
    m.concepts["C.Contrasts"]["methodBoundDefinition"]["satisfiedBy"].append("OC.contrasts_z")


def break_phrase_tokens(m):
    m.phrases["SP_CFB_ENDPOINT"]["phraseTemplate"] = "change from baseline in {param}"


def break_translation_placeholders(m):
    pack = next(p for p in m.phrase_lib["languagePacks"] if p["language"] == "fr")
    pack["phraseTemplates"][0]["text"] = "la variation"


def break_parameter_dependence_not_flagged(m):
    b = next(x for x in m.bindings["adam"]["bindings"] if x["id"] == "ADaM.TimeToEvent.AVAL")
    del b["parameterDependent"]


def break_library_pin(m):
    m.studies["cdiscpilot01"]["libraryPins"][0]["version"] = "0.7.0"


def break_missing_placeholder_value(m):
    a = _analysis(m)
    a["placeholderValues"] = [v for v in a["placeholderValues"] if v["name"] != "control_arm"]


def break_phrase_not_accepted_by_template(m):
    _analysis(m)["phrases"].append({"phrase": "SP_METHOD_KM", "bindings": [{"slot": "method", "method": "M.KaplanMeier"}]})


def break_two_main_estimators(m):
    _analysis(m, aid="AC.SUPP.ADASCOG.WK16")["analysisRole"] = "MainEstimator"


def break_ice_not_handled(m):
    _analysis(m)["iceHandlings"].pop()


def break_strategy_without_implementation(m):
    _analysis(m)["iceHandlings"][0]["implementedBy"] = []


def break_summary_output_not_of_template(m):
    _analysis(m)["summaryOutput"] = "SM.MMRM.ContrastsT"


def break_bound_output_not_produced(m):
    a = _analysis(m)
    pi = next(p for p in a["phrases"] if p["phrase"] == "SP_SUMMARY_MEASURE")
    pi["bindings"][0]["output"] = "SM.KaplanMeier.MedianSurvival"


def break_value_outside_constraint(m):
    a = _analysis(m)
    pi = next(p for p in a["phrases"] if p["phrase"] == "SP_CONFIDENCE_LEVEL")
    pi["bindings"][0]["value"] = "150"


def break_wrong_kind_of_study_concept(m):
    a = _analysis(m)
    pi = next(p for p in a["phrases"] if p["phrase"] == "SP_POPULATION")
    pi["bindings"][0]["studyConcept"] = "TRT.ALL"


def break_input_neither_derived_nor_bound(m):
    m.studies["pre0102"]["dataBindings"] = []


def break_unknown_dependency(m):
    _analysis(m)["dependsOn"] = ["DC.NOPE"]


def break_analysis_uses_derivation_template(m):
    _analysis(m)["template"] = "T.ChangeFromBaseline"


def break_no_document_anchor(m):
    a = _analysis(m, "pre0102", "AC.PRIMARY.PFS")
    pi = next(p for p in a["phrases"] if p["phrase"] == "SP_METHOD_KM")
    pi.pop("sapRefs", None)


BREAKAGES = [
    (break_method_names_a_concept, validate.check_methods, "L1"),
    (break_concept_holds_a_variable, validate.check_concepts, "L2"),
    (break_concept_names_a_method, validate.check_concepts, "L2"),
    (break_transformation_names_a_variable, validate.check_transformations, "L3"),
    (break_binding_points_at_a_method, validate.check_bindings, "L4"),
    (break_unknown_method, validate.check_transformations, "T1"),
    (break_unknown_input_role, validate.check_transformations, "T2"),
    (break_unknown_configuration, validate.check_transformations, "T3"),
    (break_concrete_concept_used_as_category, validate.check_transformations, "T7"),
    (break_interaction_not_in_formula, validate.check_transformations, "T8"),
    (break_output_does_not_satisfy_concept, validate.check_transformations, "T9"),
    (break_model_term_names_unknown_role, validate.check_methods, "M3"),
    (break_output_statistics_differ_from_class, validate.check_methods, "M6"),
    (break_closed_form_without_identity, validate.check_concepts, "C2"),
    (break_satisfying_class_lacks_statistics, validate.check_concepts, "C4"),
    (break_phrase_tokens, validate.check_smartphrases, "P2"),
    (break_translation_placeholders, validate.check_smartphrases, "P5"),
    (break_parameter_dependence_not_flagged, validate.check_bindings, "B3"),
    (break_library_pin, validate.check_studies, "Y1"),
    (break_analysis_uses_derivation_template, validate.check_studies, "Y2"),
    (break_missing_placeholder_value, validate.check_studies, "Y3"),
    (break_phrase_not_accepted_by_template, validate.check_studies, "Y5"),
    (break_bound_output_not_produced, validate.check_studies, "Y5"),
    (break_value_outside_constraint, validate.check_studies, "Y5"),
    (break_wrong_kind_of_study_concept, validate.check_studies, "Y5"),
    (break_two_main_estimators, validate.check_studies, "Y7"),
    (break_ice_not_handled, validate.check_studies, "Y8"),
    (break_strategy_without_implementation, validate.check_studies, "Y8"),
    (break_unknown_dependency, validate.check_studies, "Y10"),
    (break_input_neither_derived_nor_bound, validate.check_studies, "Y10"),
    (break_no_document_anchor, validate.check_studies, "Y11"),
    (break_summary_output_not_of_template, validate.check_studies, "Y13"),
]


@pytest.mark.parametrize("breakage,check,rule", BREAKAGES, ids=[b[0].__name__[6:] for b in BREAKAGES])
def test_rule_fires_when_the_model_is_broken(model, broken, breakage, check, rule):
    assert rule not in rules(findings(model, check)), f"{rule} already fires on the committed model"
    breakage(broken)
    assert rule in rules(findings(broken, check))


def test_schema_rejects_a_malformed_file(broken):
    path, schema, cls, data = next(f for f in broken.files if f[0].endswith("M.ANCOVA.json"))
    data["inputs"][0]["inputType"] = "NotAKindOfInput"
    del data["name"]
    assert "S1" in rules(findings(broken, validate.check_schema))


# --------------------------------------------------------------------------
# Reference tools reproduce known results
# --------------------------------------------------------------------------

def _sentence_cases():
    goldens = read_json(V1 / "tests" / "data" / "sentence_goldens.json")["sentences"]
    return [(study, aid, lang, text) for study, analyses in goldens.items()
            for aid, langs in analyses.items() for lang, text in langs.items()]


@pytest.mark.parametrize("study,aid,lang,expected", _sentence_cases(),
                         ids=[f"{s}-{a}-{lang}" for s, a, lang, _ in _sentence_cases()])
def test_sentence_matches_the_proof_of_concept(study, aid, lang, expected):
    data = read_json(STUDIES / study / "analysis_set.json")
    analysis = next(a for a in data["analyses"] if a["id"] == aid)
    assert Renderer(data).sentence(analysis, lang) == expected


def test_all_eight_analyses_have_sentences_in_three_languages():
    assert len(_sentence_cases()) == 24


def test_derivations_run_in_dependency_order():
    study = read_json(STUDIES / "cdiscpilot01" / "analysis_set.json")
    assert derivation_order(study, "AC.PRIMARY.ADASCOG") == [
        "DC.BASELINE.ADASCOG11", "DC.LOCF.ADASCOG11", "DC.CHG.ADASCOG11.WK24.LOCF"]
    # The treatment-policy sensitivity analysis must not read LOCF-imputed data.
    assert derivation_order(study, "AC.SENS.ADASCOG.TP") == ["DC.BASELINE.ADASCOG11", "DC.CHG.ADASCOG11.WK24"]


def test_analysis_resolves_to_study_variables():
    study = read_json(STUDIES / "cdiscpilot01" / "analysis_set.json")
    rows = {r["input"]: r for r in data_requirements(study, "AC.PRIMARY.ADASCOG")}
    assert (rows["response"]["dataset"], rows["response"]["variable"]) == ("ADQSADAS", "CHG")
    assert rows["response"]["where"] == "PARAMCD = 'ACTOT' AND AVISITN = 24 AND ITTFL = 'Y'"
    assert rows["covariate"]["variable"] == "BASE"
    assert rows["fixed_effect"]["variable"] == "TRTP"


def test_time_to_event_analysis_resolves_through_value_level_bindings():
    study = read_json(STUDIES / "pre0102" / "analysis_set.json")
    rows = {r["input"]: r for r in data_requirements(study, "AC.PRIMARY.PFS")}
    assert (rows["time"]["dataset"], rows["time"]["variable"]) == ("ADTTE", "AVAL")
    assert rows["time"]["where"] == "PARAMCD = 'PFS' AND EFFIFL = 'Y'"
    assert rows["event"]["variable"] == "CNSR"


def test_same_template_serves_several_analyses():
    study = read_json(STUDIES / "pre0102" / "analysis_set.json")
    assert {a["template"] for a in study["analyses"]} == {"T.PFS_KaplanMeier"}
    events = {next(v["studyConcept"] for v in a["placeholderValues"] if v["name"] == "event") for a in study["analyses"]}
    assert events == {"EVENT.PFS", "EVENT.OS", "EVENT.TTP"}


# --------------------------------------------------------------------------
# Downstream artefacts
# --------------------------------------------------------------------------

def test_adam_requirements_name_the_variables_the_analyses_read():
    study = read_json(STUDIES / "cdiscpilot01" / "analysis_set.json")
    rows = {(r["dataset"], r["variable"]): r for r in downstream.adam_requirements(study, downstream.Libraries())}
    chg = rows[("ADQSADAS", "CHG")]
    assert chg["carries"] == ["C.Change"]
    assert "AC.PRIMARY.ADASCOG" in chg["neededBy"]
    assert any(p.startswith("DC.CHG.ADASCOG11.WK24") for p in chg["producedBy"])
    for selection in ("PARAMCD", "AVISITN", "ITTFL"):
        assert rows[("ADQSADAS", selection)]["use"] == ["record selection"]


def test_analysis_results_metadata_for_the_primary_analysis():
    study = read_json(STUDIES / "cdiscpilot01" / "analysis_set.json")
    m = downstream.analysis_results_metadata(study, downstream.Libraries(), "AC.PRIMARY.ADASCOG")
    assert m["dataset"] == "ADQSADAS"
    assert m["where"] == "PARAMCD = 'ACTOT' AND AVISITN = 24 AND ITTFL = 'Y'"
    assert m["variables"] == "CHG, BASE"
    code, unresolved = m["code"]["sas"]
    assert "model CHG = BASE TRTP / ss3 solution;" in code
    assert "where PARAMCD = 'ACTOT' and AVISITN = 24 and ITTFL = 'Y';" in code
    assert unresolved == ["multiplicity_adjustment"]


def test_shell_content_lists_the_statistics_of_each_output():
    study = read_json(STUDIES / "pre0102" / "analysis_set.json")
    rows = {r["producer"]: r for r in downstream.shell_content(study, downstream.Libraries(), "AC.PRIMARY.PFS")}
    median = rows["SM.KaplanMeier.MedianSurvival"]
    assert median["summary"] is True
    assert [s["id"] for s in median["statistics"]] == ["S.estimate", "S.CI_lower", "S.CI_upper"]
