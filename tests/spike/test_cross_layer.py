import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONCEPTS = ROOT / "lib_alternative" / "concepts" / "ACDC_Concept_Library_v01.json"


def _load():
    return {c["conceptId"]: c for c in json.loads(CONCEPTS.read_text())["concepts"]}


def _produces(c):  # the result contract a concept exposes to consumers
    return c["result"]["valueType"]


def test_change_operands_accept_oc_or_dc():
    cs = _load()
    change = cs["Change"]
    needed = {op["produces"]["valueType"] for op in change["algebraicDefinition"]["operands"]}
    assert needed == {"Quantity"}
    # The SAME operand contract is satisfied by an OC leaf AND a DC measure, in one library:
    assert _produces(cs["ObservationResult"]) == "Quantity"   # 2 observation results
    assert _produces(cs["Measure"]) == "Quantity"             # 2 measures


def test_parameter_has_dual_provenance():
    cs = _load()
    layers = {p["layer"]: p["variable"] for p in cs["Parameter"]["provenance"]}
    assert layers["OC"] == "--TEST"   # SDTM TEST
    assert layers["DC"] == "PARAM"    # ADaM PARAM
