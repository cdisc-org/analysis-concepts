#!/usr/bin/env python3
"""Generate a draw.io diagram of the COMBINED DC + AC concept layer in the same
visual idiom as model_alternative/linkML/unified_concept_diagram.drawio:

  * each concept is a role-coloured ellipse node
  * its scalar facts (valueType / unitRule / dims) hang in a dashed property box
  * backbone edges: root -> category -> concept (is-a / member)
  * overlay edges: molecule -> constituent atom (composition)

Reflects the flattened design (2026-06-26 spec): one node type = concept;
a "molecule" is a concept that has constituents (former result pattern); DC
concepts are all atoms. Nodes/edges are DERIVED from the JSON, not hardcoded.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "model", "linkML"))
from gen_concept_diagrams import Node, Diagram, emit, layout_force  # reuse, don't copy

DC_PATH = os.path.join(ROOT, "lib", "concepts", "Option_B_Clinical.json")
AC_PATH = os.path.join(ROOT, "lib", "concepts", "AC_Concept_Model_v017.json")
OUT = os.path.join(ROOT, "docs", "superpowers", "specs", "2026-06-26-dc-ac-concept-layer.drawio")

ROOT_FILL = "#FFFFFF"
DC_CAT_FILL = "#D5D5FF"
AC_CAT_FILL = "#FFE0C2"
DC_FILL = "#ECECFF"      # derived atom
AC_ATOM_FILL = "#FFE5CC"  # analysis atom
AC_MOL_FILL = "#FFB266"   # analysis molecule (has constituents)

ROOT_ID = "model/root"


def _atom_props(a):
    p = []
    vt = a.get("valueType")
    ur = a.get("unitRule")
    if vt:
        p.append(f"valueType: {vt}" + (f" / {ur}" if ur else ""))
    if a.get("leaves"):
        p.append("leaves: " + ", ".join(l["term"] for l in a["leaves"]))
    return p


def _dc_props(c):
    res = c.get("result", {})
    vt = res.get("valueType")
    ur = res.get("unitRule")
    out = []
    if vt:
        out.append(f"valueType: {vt}" + (f" / {ur}" if ur else ""))
    return out


def _mol_props(p):
    out = ["molecule (has constituents)"]
    if p.get("constituents"):
        out.append("of: " + ", ".join(p["constituents"]))
    if p.get("dimensions"):
        out.append("dims: " + ", ".join(p["dimensions"]))
    return out


def build():
    dc = json.load(open(DC_PATH))
    ac = json.load(open(AC_PATH))
    d = Diagram("DC + AC Concept Layer (flattened)")
    d.add(Node(ROOT_ID, "Concept Layer", ROOT_FILL))

    # ---- DC: category -> concept (atoms) ----
    for cat, cv in dc.get("categories", {}).items():
        catid = f"dc/cat/{cat}"
        d.add(Node(catid, cat, DC_CAT_FILL))
        d.edge(ROOT_ID, catid, "DC")
        for cid, c in (cv.get("concepts") or {}).items():
            d.add(Node(f"dc/{cid}", cid, DC_FILL, props=_dc_props(c)))
            d.edge(f"dc/{cid}", catid, "is-a", kind="isa")

    # ---- AC atoms (shared pool) ----
    atoms = ac["sharedStatisticsVocabulary"]["concepts"]
    for aid, a in atoms.items():
        d.add(Node(f"ac/{aid}", aid, AC_ATOM_FILL, props=_atom_props(a)))

    # ---- AC categories + molecules (former result patterns) ----
    pat_cat = {}
    for cat, cv in ac.get("categories", {}).items():
        if cat == "note":
            continue
        for pid in cv.get("typicallyInvolves", []):
            pat_cat[pid] = cat
    for cat in {c for c in ac.get("categories", {}) if c != "note"}:
        catid = f"ac/cat/{cat}"
        d.add(Node(catid, cat, AC_CAT_FILL))
        d.edge(ROOT_ID, catid, "AC")

    for pid, p in ac.get("resultPatterns", {}).items():
        if pid == "note":
            continue
        d.add(Node(f"ac/mol/{pid}", pid, AC_MOL_FILL, props=_mol_props(p)))
        cat = pat_cat.get(pid)
        if cat:
            d.edge(f"ac/mol/{pid}", f"ac/cat/{cat}", "is-a", kind="isa")
        else:
            d.edge(ROOT_ID, f"ac/mol/{pid}", "AC")
        # composition overlay: molecule -> constituent atom
        for con in p.get("constituents", []):
            if f"ac/{con}" in d.nodes:
                d.edge(f"ac/mol/{pid}", f"ac/{con}", "constituent")

    # atoms used by no molecule stay as members of the root (descriptive atoms)
    used = {con for p in ac.get("resultPatterns", {}).values()
            if isinstance(p, dict) for con in p.get("constituents", [])}
    for aid in atoms:
        if aid not in used:
            d.edge(ROOT_ID, f"ac/{aid}", "atom")
    return d


LEGEND = [
    ("#FFFFFF", "Concept Layer (root)"),
    ("#D5D5FF", "DC category"),
    ("#ECECFF", "DC concept - atom (derived)"),
    ("#FFE0C2", "AC category"),
    ("#FFE5CC", "AC atom - statistic (analysis)"),
    ("#FFB266", "AC molecule - has constituents (former result pattern)"),
    (None, "(edge) backbone: root to category to concept (is-a / member)"),
    (None, "(edge) constituent: molecule to its atoms (composition)"),
]


def _legend_xml(rows, title, x0=40, y0=70):
    W, RH = 360, 20
    cells = [f'<mxCell id="legend_title" parent="1" style="rounded=0;whiteSpace=wrap;html=1;'
             f'fillColor=none;strokeColor=none;fontSize=11;fontStyle=1;align=left;fontColor=#000000;" '
             f'vertex="1" value="{title}"><mxGeometry x="{x0}" y="{y0-22}" width="{W}" height="18" as="geometry"/></mxCell>']
    for i, (color, label) in enumerate(rows):
        y = y0 + i * RH
        fill = color if color else "#FFFFFF"
        cells.append(f'<mxCell id="legend_{i}" parent="1" style="rounded=0;whiteSpace=wrap;html=1;'
                     f'fillColor={fill};strokeColor=#888888;fontSize=9;align=left;spacingLeft=6;fontColor=#000000;" '
                     f'vertex="1" value="{label}"><mxGeometry x="{x0}" y="{y}" width="{W}" height="{RH}" as="geometry"/></mxCell>')
    return "\n        ".join(cells)


def main():
    d = build()
    px, box_pos = layout_force(d)
    body = emit(d, px, box_pos)
    body = body.replace("</root>", _legend_xml(LEGEND, "Legend - node colour = layer / kind") + "\n      </root>")
    open(OUT, "w").write('<mxfile host="app.diagrams.net" background="#FFFFFF">\n' + body + "\n</mxfile>\n")
    print(f"wrote {OUT}: {len(d.nodes)} nodes, {len(d.edges)} edges")


if __name__ == "__main__":
    main()
