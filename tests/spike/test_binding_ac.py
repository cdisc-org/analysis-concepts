import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import spike_concept_binding as scb

CONCEPTS = ROOT / "lib_alternative" / "concepts" / "ACDC_Concept_Library_v01.json"


def _concept(cid):
    return next(c for c in json.loads(CONCEPTS.read_text())["concepts"] if c["conceptId"] == cid)


def test_lsmeans_satisfied_by_ancova_output():
    lsmeans = _concept("LSMeans")
    method = json.loads((ROOT / "lib_alternative/methods/M_ANCOVA.json").read_text())
    templates = json.loads((ROOT / "lib/vocabulary/output_class_templates.json").read_text())["output_class_templates"]
    stat_sets = json.loads((ROOT / "lib/vocabulary/statistic_sets.json").read_text())["statistic_sets"]

    provided = scb.method_output_statistics(method, templates, stat_sets)
    need = scb.normalize_constituents(lsmeans["estimandDefinition"]["constituents"])
    assert scb.satisfies(need, provided), f"missing: {sorted(need - provided)}; provided: {sorted(provided)}"
