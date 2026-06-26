import subprocess, pathlib, xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
GEN = ROOT / "model_alternative" / "linkML" / "gen_unified_diagrams.py"
CONCEPT_DRAWIO = ROOT / "model_alternative" / "linkML" / "unified_concept_diagram.drawio"
SCHEMA_DRAWIO = ROOT / "model_alternative" / "linkML" / "unified_schema_map.drawio"


def _gen():
    r = subprocess.run([str(ROOT / ".venv/bin/python"), str(GEN)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout


def _cells(path):
    return list(ET.parse(path).getroot().iter("mxCell"))


def test_concept_diagram_shows_cross_layer_change():
    _gen()
    assert CONCEPT_DRAWIO.exists()
    edges = [(c.get("source"), c.get("target"), c.get("value") or "")
             for c in _cells(CONCEPT_DRAWIO) if c.get("edge") == "1"]
    sources_into_change = {s for s, t, v in edges if t == "Change" and "satisfies" in v}
    # the headline: Change is fed by BOTH an OC leaf and a DC measure
    assert "ObservationResult" in sources_into_change
    assert "Measure" in sources_into_change


def test_schema_map_links_the_three_files():
    _gen()
    assert SCHEMA_DRAWIO.exists()
    cells = _cells(SCHEMA_DRAWIO)
    nodes = {c.get("id") for c in cells if c.get("vertex") == "1"}
    assert {"Method", "Transformation", "Concept"} <= nodes
    edges = [(c.get("source"), c.get("target"), c.get("value") or "")
             for c in cells if c.get("edge") == "1"]
    assert any(s == "Transformation" and t == "Method" for s, t, v in edges)
    assert any(t == "Concept" for s, t, v in edges)
