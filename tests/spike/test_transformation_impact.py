import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import spike_transformation_impact as sti

CONCEPTS = ROOT / "lib_alternative" / "concepts" / "ACDC_Concept_Library_v01.json"
SLIM = ROOT / "lib_alternative" / "transformations" / "slimmed.json"


def _change():
    return next(c for c in json.loads(CONCEPTS.read_text())["concepts"] if c["conceptId"] == "Change")


def _method():
    return json.loads((ROOT / "lib_alternative/methods/M_Subtraction.json").read_text())


def _v07_tx():
    lib = json.loads((ROOT / "lib/transformations/ACDC_Transformation_Library_v07.json").read_text())
    return next(t for t in lib["transformations"] if t["conceptId"] == "T.ChangeFromBaseline")


def _v07_change_binding():
    return {m["input"]: m["slice"] for m in _v07_tx()["inputDataStructure"]["measures"]}


def test_slim_form_reconstructs_v07_binding():
    slim = json.loads(SLIM.read_text())["transformations"][0]
    derived = sti.reconstruct(slim, _change(), _method())   # {method_input: slice}
    assert derived == _v07_change_binding(), "slim form must losslessly recover the v07 binding"


def test_impact_metric_shows_reduction_and_decoupling():
    slim = json.loads(SLIM.read_text())["transformations"][0]
    m = sti.impact_metric(_v07_tx()["inputDataStructure"]["measures"], slim)
    assert m["slim_binding_fields"] < m["v07_binding_fields"]                 # it shrinks
    assert m["v07_names_method_slots"] and not m["slim_names_method_slots"]    # decoupled
