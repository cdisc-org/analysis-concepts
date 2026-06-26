#!/usr/bin/env python3
"""Generate two one-page draw.io diagrams for the unified-concept spike, reusing
the machinery in model/linkML/gen_concept_diagrams.py:

  1. unified_concept_diagram.drawio  -- the OC+DC+AC concept DAG (one page),
     with operand-satisfaction edges showing cross-layer unification.
  2. unified_schema_map.drawio       -- the three LinkML schemas as one class
     map with cross-schema edges.

Nodes/edges are DERIVED from the sandbox JSON + the LinkML yamls, not hardcoded.
"""
import json, os, sys, glob
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "model", "linkML"))
from gen_concept_diagrams import Node, Diagram, emit, layout_force   # reuse, don't copy

CONCEPTS = os.path.join(ROOT, "lib_alternative", "concepts")
ROLE_FILL = {"collected": "#BFFFBF", "derived": "#ECECFF", "analysis": "#FFD9B3"}
DIM_FILL = "#FFE5B4"


# =========================================================================
# 1. Unified concept DAG
# =========================================================================
def _load_all():
    out = []
    for f in sorted(glob.glob(os.path.join(CONCEPTS, "*.json"))):
        out += json.load(open(f)).get("concepts", [])
    return {c["conceptId"]: c for c in out}


def _produces_vt(c):
    return (c.get("result") or {}).get("valueType")


def _props(c):
    p = [f"role: {c.get('role')}" + (f" / {c['axis']}" if c.get("axis") else "")]
    if c.get("algebraicDefinition"):
        p.append("identity: " + c["algebraicDefinition"]["identity"])
    if c.get("estimandDefinition"):
        p.append("estimand: " + ", ".join(c["estimandDefinition"]["constituents"]))
    if _produces_vt(c):
        p.append("produces: " + _produces_vt(c))
    prov = c.get("provenance") or []
    if prov:
        p.append("prov: " + " | ".join(f"{b['layer']} {b.get('variable','')}" for b in prov))
    return p


ROOT_ID = "model/root"


def build_unified_concepts(concepts):
    d = Diagram("Unified Concept Model (OC+DC+AC)")
    # single model spine — the node that makes it visibly ONE model
    d.add(Node(ROOT_ID, "Unified Concept Model", "#FFFFFF"))
    for cid, c in concepts.items():
        fill = DIM_FILL if c.get("axis") == "dimension" else ROLE_FILL.get(c.get("role"), "#EEEEEE")
        d.add(Node(cid, cid, fill, props=_props(c)))
    # backbone: root -> category -> concept (is-a); category-less concepts hang off root
    for cid, c in concepts.items():
        cat = c.get("category")
        if cat:
            catid = f"cat/{cat}"
            if catid not in d.nodes:
                d.add(Node(catid, cat, "#DDDDDD"))
                d.edge(ROOT_ID, catid, "category")
            d.edge(cid, catid, "is-a", kind="isa")
        else:
            d.edge(ROOT_ID, cid, "member")
    # cross-layer operand-satisfaction overlay: a concept whose result PRODUCES the
    # operand's required valueType is a valid source (this is the unification).
    # Analysis concepts sit atop the DAG, so they are not drawn as operand sources.
    for cid, c in concepts.items():
        for op in (c.get("algebraicDefinition") or {}).get("operands", []):
            need = op["produces"]["valueType"]
            for sid, cand in concepts.items():
                if sid != cid and cand.get("role") != "analysis" and _produces_vt(cand) == need:
                    d.edge(sid, cid, f"satisfies {op['name']}")
    return d


# =========================================================================
# 2. LinkML schema map
# =========================================================================
SCHEMA_FILL = {"acdc_method": "#E5E5FF", "acdc_transformation": "#D5F5E3", "acdc_concept": "#FFD9B3"}
# Known semantic FKs that LinkML string-typing can't express as a `range` today.
FK_BRIDGES = {"usesMethod": "Method", "outputConcept": "Concept", "concept": "Concept"}


def _schema_classes(path):
    doc = yaml.safe_load(open(path))
    name = doc.get("name")
    slots = doc.get("slots", {}) or {}
    slot_range = {s: (spec or {}).get("range") for s, spec in slots.items()}
    classes = doc.get("classes", {}) or {}
    return name, classes, slot_range


def build_schema_map(schema_paths):
    d = Diagram("Unified LinkML Schema Map")
    schema_of, class_specs, slot_ranges = {}, {}, {}
    for p in schema_paths:
        name, classes, sr = _schema_classes(p)
        slot_ranges.update(sr)
        for cls, spec in classes.items():
            schema_of[cls] = name
            class_specs[cls] = spec or {}
    for cls in class_specs:
        d.add(Node(cls, cls, SCHEMA_FILL.get(schema_of[cls], "#EEEEEE")))

    def _ranges(spec):
        out = []
        for s, a in (spec.get("attributes") or {}).items():
            out.append((s, (a or {}).get("range")))
        for s in (spec.get("slots") or []):
            out.append((s, slot_ranges.get(s)))
        return out

    for cls, spec in class_specs.items():
        for parent in [spec.get("is_a")] + (spec.get("mixins") or []):
            if parent in class_specs:
                d.edge(cls, parent, "is_a", kind="isa")
        for slot, rng in _ranges(spec):
            if rng in class_specs:
                d.edge(cls, rng, slot)
            elif slot in FK_BRIDGES and FK_BRIDGES[slot] in class_specs:
                d.edge(cls, FK_BRIDGES[slot], f"FK-> {slot}")
    return d


# ---- legend (injected post-emit; rows are filled rects w/ inline text;
#      ASCII only, no < > & so values need no escaping) ----------------------
LEGEND_CONCEPT = [
    ("#FFFFFF", "Unified Concept Model - the single library (root)"),
    ("#DDDDDD", "Category - groups concepts"),
    ("#BFFFBF", "Collected (OC) - observed leaf, no math"),
    ("#ECECFF", "Derived (DC) - owns an algebraic identity"),
    ("#FFD9B3", "Analysis (AC) - owns an estimand contract"),
    ("#FFE5B4", "Dimension - axis = dimension"),
    (None, "(edge) backbone: root to category to concept (is-a / member)"),
    (None, "(edge) satisfies(operand): cross-layer operand binding"),
]
LEGEND_SCHEMA = [
    ("#E5E5FF", "acdc_method.yaml class"),
    ("#D5F5E3", "acdc_transformation.yaml class"),
    ("#FFD9B3", "acdc_concept.yaml class"),
    (None, "(edge) label = slot; range points to another class"),
    (None, "(edge) is_a = inheritance;  FK = intended cross-schema FK"),
]


def _legend_xml(rows, title, x0=40, y0=70):
    """Each row is a filled rectangle WITH inline text (same render path as the
    graph nodes, which display their labels reliably)."""
    W, RH = 330, 20
    cells = [f'<mxCell id="legend_title" parent="1" '
             f'style="rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=none;'
             f'fontSize=11;fontStyle=1;align=left;fontColor=#000000;" vertex="1" value="{title}">'
             f'<mxGeometry x="{x0}" y="{y0-22}" width="{W}" height="18" as="geometry"/></mxCell>']
    for i, (color, label) in enumerate(rows):
        y = y0 + i * RH
        fill = color if color else "#FFFFFF"
        cells.append(f'<mxCell id="legend_{i}" parent="1" '
                     f'style="rounded=0;whiteSpace=wrap;html=1;fillColor={fill};strokeColor=#888888;'
                     f'fontSize=9;align=left;spacingLeft=6;fontColor=#000000;" vertex="1" value="{label}">'
                     f'<mxGeometry x="{x0}" y="{y}" width="{W}" height="{RH}" as="geometry"/></mxCell>')
    return "\n        ".join(cells)


def _write(path, diag, rows, legend_title):
    px, box_pos = layout_force(diag)
    body = emit(diag, px, box_pos)
    body = body.replace("</root>", _legend_xml(rows, legend_title) + "\n      </root>")
    open(path, "w").write('<mxfile host="Electron" background="#FFFFFF">\n' + body + "\n</mxfile>\n")
    print(f"wrote {path}: {len(diag.nodes)} nodes, {len(diag.edges)} edges")


def main():
    concepts = _load_all()
    _write(os.path.join(HERE, "unified_concept_diagram.drawio"),
           build_unified_concepts(concepts), LEGEND_CONCEPT, "Legend — node colour = role / layer")

    schemas = [os.path.join(HERE, f) for f in
               ("acdc_method.yaml", "acdc_transformation.yaml", "acdc_concept.yaml")]
    _write(os.path.join(HERE, "unified_schema_map.drawio"),
           build_schema_map(schemas), LEGEND_SCHEMA, "Legend — node colour = source schema")


if __name__ == "__main__":
    main()
