import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import spike_concept_binding as scb

CONCEPTS = ROOT / "lib_alternative" / "concepts" / "ACDC_Concept_Library_v01.json"


def _concept(cid):
    data = json.loads(CONCEPTS.read_text())
    return next(c for c in data["concepts"] if c["conceptId"] == cid)


def _method():
    return json.loads((ROOT / "lib_alternative/methods/M_Subtraction.json").read_text())


def _v07_change_inputs():
    """The hand-authored ground truth: method inputs bound by the real v07 transformation."""
    lib = json.loads((ROOT / "lib/transformations/ACDC_Transformation_Library_v07.json").read_text())
    tx = next(t for t in lib["transformations"] if t["conceptId"] == "T.ChangeFromBaseline")
    return {m["input"] for m in tx["inputDataStructure"]["measures"]}


def test_change_unifies_with_subtraction():
    mapping = scb.unify(_concept("Change")["algebraicDefinition"]["identity"],
                        _method()["formula"]["generic_expression"])
    assert mapping == {"value": "minuend", "reference": "subtrahend"}


def test_derived_binding_covers_v07_inputs():
    mapping = scb.unify(_concept("Change")["algebraicDefinition"]["identity"],
                        _method()["formula"]["generic_expression"])
    # the DERIVED binding must cover exactly the method inputs the real v07 transformation binds
    assert set(mapping.values()) == _v07_change_inputs()
