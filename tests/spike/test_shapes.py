import json, subprocess, pathlib, sys
import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
VENV = ROOT / ".venv" / "bin"
CONCEPT_SCHEMA = ROOT / "model_alternative" / "linkML" / "acdc_concept.yaml"
LIBALT = ROOT / "lib_alternative" / "concepts"
LIBRARY = LIBALT / "ACDC_Concept_Library_v01.json"


def run_linkml_validate(schema, root_class, instance):
    r = subprocess.run([str(VENV / "linkml-validate"), "-s", str(schema),
                        "-C", root_class, str(instance)],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def test_empty_library_validates(tmp_path):
    inst = tmp_path / "empty.json"
    inst.write_text(json.dumps({"concepts": []}))
    rc, out = run_linkml_validate(CONCEPT_SCHEMA, "ConceptLibrary", inst)
    assert rc == 0, out


def _validate(tmp_path, concept):
    inst = tmp_path / "one.json"
    inst.write_text(json.dumps({"concepts": [concept]}))
    return run_linkml_validate(CONCEPT_SCHEMA, "ConceptLibrary", inst)


def test_derived_requires_algebraic_definition(tmp_path):
    bad = {"conceptId": "X", "role": "derived"}  # missing algebraicDefinition
    rc, out = _validate(tmp_path, bad)
    assert rc != 0, "derived concept without algebraic identity should fail"


def test_concepts_library_validates():
    rc, out = run_linkml_validate(CONCEPT_SCHEMA, "ConceptLibrary", LIBRARY)
    assert rc == 0, out


# ---- coverage gate (Task 6) ------------------------------------------------
sys.path.insert(0, str(ROOT / "scripts"))


def test_dc_categories_each_have_a_slice_concept():
    import spike_build_slice as sbs
    declared = sbs.categories(ROOT / "lib" / "concepts" / "Option_B_Clinical.json")
    covered = sbs.covered_categories(LIBALT)
    missing = declared - covered
    assert not missing, f"DC categories with no sandbox concept: {sorted(missing)}"


def test_ac_categories_each_have_a_slice_concept():
    import spike_build_slice as sbs
    declared = sbs.categories(ROOT / "lib" / "concepts" / "AC_Concept_Model_v017.json")
    covered = sbs.covered_categories(LIBALT)
    missing = declared - covered
    assert not missing, f"uncovered AC categories: {sorted(missing)}"
