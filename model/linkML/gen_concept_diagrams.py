#!/usr/bin/env python3
"""Generate a 3-tab draw.io diagram from the OC / DC / AC concept-model JSON files.

Idiom mirrors model/linkML/esap_diagram.drawio:
  * each concept/class is a round ellipse node of uniform size
  * relationships are labelled edges (composition = open arrow, is-a = hollow block)
  * a concept's scalar properties are listed in a dashed (dotted) box, linked by a
    dashed connector -- exactly like the AnalysisRole enum box in the reference.

Nodes/edges/properties are DERIVED from the JSON metadata, not hardcoded.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CONCEPTS = os.path.join(HERE, "..", "..", "lib", "concepts")
OUT = os.path.join(HERE, "concept_models_diagram.drawio")

# ---- geometry -------------------------------------------------------------
NODE_W, NODE_H = 120, 84
SLOT_W = 380          # horizontal slot per leaf (node + property box + gap)
ROW_H = 200           # vertical distance between layers
MARGIN_X, MARGIN_Y = 80, 80
BOX_W = 165
PROP_GAP = 14         # gap between node and its property box

# ---- styles ---------------------------------------------------------------
NODE_STYLE = ("ellipse;whiteSpace=wrap;html=1;fillColor={fill};strokeColor=#222222;"
              "fontSize=10;fontColor=#000000;verticalAlign=middle;align=center;")
COMPOSE_STYLE = "rounded=0;endArrow=open;endSize=12;html=1;strokeColor=#555555;fontSize=9;"
ISA_STYLE = "rounded=0;endArrow=block;endFill=0;endSize=14;html=1;strokeColor=#555555;fontSize=9;"
BOX_STYLE = ("rounded=0;dashed=1;dashPattern=4 4;whiteSpace=wrap;html=1;fillColor=#FFFFFF;"
             "strokeColor=#222222;fontSize=8;align=left;verticalAlign=top;spacingLeft=5;"
             "spacingTop=3;fontColor=#000000;")
BOX_LINK_STYLE = "endArrow=none;dashed=1;dashPattern=4 4;html=1;strokeColor=#888888;"


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


class Node:
    __slots__ = ("id", "label", "fill", "props", "parent", "kind")

    def __init__(self, nid, label, fill, props=None, parent=None, kind="compose"):
        self.id = nid
        self.label = label
        self.fill = fill
        self.props = props or []      # list of "k: v" strings
        self.parent = parent          # primary-parent id for tidy-tree layout
        self.kind = kind              # edge kind from parent: compose | isa


class Edge:
    __slots__ = ("src", "dst", "label", "kind")

    def __init__(self, src, dst, label="", kind="compose"):
        self.src, self.dst, self.label, self.kind = src, dst, label, kind


class Diagram:
    def __init__(self, name):
        self.name = name
        self.nodes = {}
        self.order = []           # node ids in insertion order (DFS-ish)
        self.edges = []
        self.free_boxes = []      # (id, label-lines, x, y, w, h)
        self._n = 0

    def add(self, node):
        if node.id in self.nodes:
            return node.id
        self.nodes[node.id] = node
        self.order.append(node.id)
        return node.id

    def edge(self, src, dst, label="", kind="compose"):
        self.edges.append(Edge(src, dst, label, kind))

    def uid(self, prefix="x"):
        self._n += 1
        return f"{prefix}{self._n}"


# ---- tidy top-down tree layout -------------------------------------------
def layout(diag, extra_roots=None):
    children = {nid: [] for nid in diag.nodes}
    roots = []
    for nid in diag.order:
        p = diag.nodes[nid].parent
        if p and p in children:
            children[p].append(nid)
        else:
            roots.append(nid)
    if extra_roots:
        roots = [r for r in roots if r in extra_roots] + [r for r in roots if r not in extra_roots]

    pos = {}
    counter = [0]

    def assign(nid, depth):
        ch = children[nid]
        if not ch:
            x = counter[0]
            counter[0] += 1
        else:
            xs = [assign(c, depth + 1) for c in ch]
            x = sum(xs) / len(xs)
        pos[nid] = (x, depth)
        return x

    for r in roots:
        assign(r, 0)

    px = {}
    for nid, (x, depth) in pos.items():
        px[nid] = (MARGIN_X + x * SLOT_W, MARGIN_Y + depth * ROW_H)
    return px


# ---- force-directed "cloud" layout ---------------------------------------
def box_h(node):
    return 16 + 11 * len(node.props)


def layout_force(diag, iterations=900, k=155):
    """Fruchterman-Reingold. Property boxes are particles tethered to their
    node by a short stiff spring, so they spread out instead of overlapping."""
    parts = list(diag.order)              # particle ids: real nodes ...
    radius = {nid: 62.0 for nid in diag.order}
    springs = [[e.src, e.dst, 1.0] for e in diag.edges]
    for nid in diag.order:
        n = diag.nodes[nid]
        if n.props:
            bid = nid + "__props"
            parts.append(bid)
            radius[bid] = max(BOX_W, box_h(n)) * 0.5
            springs.append([nid, bid, 3.0])   # stiff, short tether

    n = len(parts)
    pos = {}
    R = 55 * math.sqrt(n)
    for i, p in enumerate(parts):           # deterministic golden-angle seed
        ang = i * 2.399963229
        r = R * math.sqrt((i + 1) / n)
        pos[p] = [r * math.cos(ang), r * math.sin(ang)]

    temp = R * 0.55
    for _ in range(iterations):
        disp = {p: [0.0, 0.0] for p in parts}
        for i in range(n):
            pi = parts[i]
            xi, yi = pos[pi]
            for j in range(i + 1, n):
                pj = parts[j]
                dx = xi - pos[pj][0]
                dy = yi - pos[pj][1]
                d = math.hypot(dx, dy) or 0.01
                f = (k * k) / d                       # repulsion
                mind = radius[pi] + radius[pj] + 30
                if d < mind:
                    f += (mind - d) * 16.0            # hard anti-overlap
                ux, uy = dx / d, dy / d
                disp[pi][0] += ux * f
                disp[pi][1] += uy * f
                disp[pj][0] -= ux * f
                disp[pj][1] -= uy * f
        for u, v, w in springs:
            dx = pos[u][0] - pos[v][0]
            dy = pos[u][1] - pos[v][1]
            d = math.hypot(dx, dy) or 0.01
            f = (d * d) / k * w                        # attraction
            ux, uy = dx / d, dy / d
            disp[u][0] -= ux * f
            disp[u][1] -= uy * f
            disp[v][0] += ux * f
            disp[v][1] += uy * f
        for p in parts:
            dx, dy = disp[p]
            d = math.hypot(dx, dy) or 0.01
            step = min(d, temp)
            pos[p][0] += dx / d * step
            pos[p][1] += dy / d * step
        temp = max(temp * 0.975, 2.0)

    # normalise to positive top-left coords
    minx = min(pos[p][0] - radius[p] for p in parts)
    miny = min(pos[p][1] - radius[p] for p in parts)
    px, box_pos = {}, {}
    for nid in diag.order:
        cx = pos[nid][0] - minx + MARGIN_X
        cy = pos[nid][1] - miny + MARGIN_Y
        px[nid] = (cx - NODE_W / 2, cy - NODE_H / 2)
        n = diag.nodes[nid]
        if n.props:
            bid = nid + "__props"
            bcx = pos[bid][0] - minx + MARGIN_X
            bcy = pos[bid][1] - miny + MARGIN_Y
            box_pos[bid] = (bcx - BOX_W / 2, bcy - box_h(n) / 2)
    return px, box_pos


# ---- XML emit -------------------------------------------------------------
def emit(diag, px, box_pos=None):
    cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']

    # title
    cells.append(
        f'<mxCell id="title_{diag.name}" parent="1" '
        f'style="text;align=left;fontSize=16;fontStyle=1;fontColor=#000000;" '
        f'value="{esc(diag.name)}" vertex="1">'
        f'<mxGeometry x="40" y="24" width="900" height="30" as="geometry"/></mxCell>')

    for nid in diag.order:
        n = diag.nodes[nid]
        x, y = px[nid]
        style = NODE_STYLE.format(fill=n.fill)
        cells.append(
            f'<mxCell id="{esc(nid)}" parent="1" style="{style}" '
            f'value="&lt;b&gt;{esc(n.label)}&lt;/b&gt;" vertex="1">'
            f'<mxGeometry x="{x:.0f}" y="{y:.0f}" width="{NODE_W}" height="{NODE_H}" as="geometry"/></mxCell>')

        # property box (dashed) -- positioned by force sim, else right of node
        if n.props:
            bh = box_h(n)
            bid_pos = (box_pos or {}).get(nid + "__props")
            if bid_pos:
                bx, by = bid_pos
            else:
                bx = x + NODE_W + PROP_GAP
                by = y + NODE_H / 2 - bh / 2
            lines = "&#xa;".join(esc(p) for p in n.props)
            box_val = f"&lt;b&gt;{esc(n.label)}&lt;/b&gt;&#xa;{lines}"
            bid = nid + "__props"
            cells.append(
                f'<mxCell id="{esc(bid)}" parent="1" style="{BOX_STYLE}" '
                f'value="{box_val}" vertex="1">'
                f'<mxGeometry x="{bx:.0f}" y="{by:.0f}" width="{BOX_W}" height="{bh:.0f}" as="geometry"/></mxCell>')
            cells.append(
                f'<mxCell id="{esc(bid)}_l" parent="1" style="{BOX_LINK_STYLE}" '
                f'edge="1" source="{esc(nid)}" target="{esc(bid)}"><mxGeometry relative="1" as="geometry"/></mxCell>')

    for e in diag.edges:
        style = ISA_STYLE if e.kind == "isa" else COMPOSE_STYLE
        eid = diag.uid("e")
        cells.append(
            f'<mxCell id="{eid}" parent="1" style="{style}" edge="1" '
            f'source="{esc(e.src)}" target="{esc(e.dst)}" value="{esc(e.label)}">'
            f'<mxGeometry relative="1" as="geometry"/></mxCell>')

    for bid, lines, x, y, w, h in diag.free_boxes:
        val = "&#xa;".join(esc(l) for l in lines)
        cells.append(
            f'<mxCell id="{esc(bid)}" parent="1" style="{BOX_STYLE}" value="{val}" vertex="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')

    body = "\n        ".join(cells)
    return (f'  <diagram name="{esc(diag.name)}" id="{esc(diag.name).replace(" ", "_")}">\n'
            f'    <mxGraphModel dx="1400" dy="900" grid="0" gridSize="10" guides="1" '
            f'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
            f'pageWidth="3370" pageHeight="2384" background="#FFFFFF" math="0" shadow="0">\n'
            f'      <root>\n        {body}\n      </root>\n'
            f'    </mxGraphModel>\n  </diagram>')


# =========================================================================
# OC -- Observation Model
# =========================================================================
OC_FILL_ROOT = "#BFFFBF"
OC_FILL_STRUCT = "#D5F5E3"
OC_FILL_DIM = "#FFE5B4"
OC_FILL_CAT = "#A9DFBF"


def card_label(spec):
    rel = spec.get("relationship", "")
    card = spec.get("cardinality", "")
    if rel and card:
        return f"{rel}  [{card}]"
    return rel or (f"[{card}]" if card else "")


def oc_props(spec):
    props = []
    vt = spec.get("valueType")
    if vt:
        props.append(f"valueType: {vt}")
    q = spec.get("qualifiers")
    if q:
        props.append(f"qualifier: {q.get('type','')}")
        for k in q.get("values", {}):
            props.append(f"  • {k}")
    return props


def build_oc(data):
    d = Diagram("Observation Model")
    obs = data["Observation"]
    root_id = "OC:Observation"
    d.add(Node(root_id, "Observation", OC_FILL_ROOT))

    def walk(defs, parent_id, fill):
        for name, spec in defs.items():
            if not isinstance(spec, dict):
                continue
            nid = f"{parent_id}/{name}"
            d.add(Node(nid, name, fill, props=oc_props(spec), parent=parent_id))
            d.edge(parent_id, nid, card_label(spec))
            sub = spec.get("dataDefinitions")
            if sub:
                walk(sub, nid, fill)

    walk(obs["instanceStructure"], root_id, OC_FILL_STRUCT)

    # shared dimensions hang off Observation
    for name, spec in obs.get("sharedDimensions", {}).items():
        nid = f"OC:dim/{name}"
        d.add(Node(nid, name, OC_FILL_DIM, props=oc_props(spec), parent=root_id))
        d.edge(root_id, nid, card_label(spec))
        sub = spec.get("dataDefinitions")
        if sub:
            walk(sub, nid, OC_FILL_DIM)

    # observation categories (is-a Observation)
    for name, spec in obs.get("observationCategories", {}).items():
        nid = f"OC:cat/{name}"
        d.add(Node(nid, name, OC_FILL_CAT, parent=root_id, kind="isa"))
        d.edge(nid, root_id, "is-a", kind="isa")
        addl = spec.get("additionalDefinitions")
        if addl:
            walk(addl, nid, OC_FILL_CAT)

    # value-type vocabulary as a dashed reference box (free-floating)
    vt = data.get("valueTypes", {})
    lines = ["Value Type Vocabulary (FHIR R5)", "complexTypes:"]
    lines += [f"  • {k}" for k in vt.get("complexTypes", {})]
    lines.append("primitiveTypes:")
    lines += [f"  • {k}" for k in vt.get("primitiveTypes", {})]
    d.free_boxes.append(("OC:valuetypes", lines, 40, 1900, 240, 18 + 13 * len(lines)))
    return d


# =========================================================================
# DC -- Derivation Model
# =========================================================================
DC_FILL_ROOT = "#E5E5FF"
DC_FILL_CAT = "#C9C9FF"
DC_FILL_CONCEPT = "#ECECFF"
DC_FILL_DIM = "#FFE5B4"


def build_dc(data):
    d = Diagram("Derivation Model")
    root_id = "DC:root"
    d.add(Node(root_id, f"DC Model v{data.get('version','')}", DC_FILL_ROOT))

    for cat, cspec in data.get("categories", {}).items():
        cid = f"DC:cat/{cat}"
        d.add(Node(cid, cat, DC_FILL_CAT, parent=root_id))
        d.edge(root_id, cid, "category")
        for con, conspec in cspec.get("concepts", {}).items():
            coid = f"DC:concept/{con}"
            res = conspec.get("result", {})
            vt = res.get("valueType")
            vt = ", ".join(vt) if isinstance(vt, list) else vt
            props = []
            if conspec.get("math"):
                props.append(f"math: {conspec['math']}")
            if vt:
                props.append(f"valueType: {vt}")
            if res.get("unitRule"):
                props.append(f"unitRule: {res['unitRule']}")
            d.add(Node(coid, con, DC_FILL_CONCEPT, props=props, parent=cid))
            d.edge(cid, coid, "")

    # shared dimensions cluster
    dim_root = "DC:dims"
    d.add(Node(dim_root, "Shared Dimensions", DC_FILL_DIM, parent=root_id))
    d.edge(root_id, dim_root, "context")
    for dim, dspec in data.get("sharedDimensions", {}).items():
        if not isinstance(dspec, dict) or "cardinality" not in dspec:
            continue
        did = f"DC:dim/{dim}"
        props = [f"cardinality: {dspec.get('cardinality','')}",
                 f"autoConfirm: {dspec.get('autoConfirm', False)}"]
        d.add(Node(did, dim, DC_FILL_DIM, props=props, parent=dim_root))
        d.edge(dim_root, did, "")
    return d


# =========================================================================
# AC -- Analysis Model
# =========================================================================
AC_FILL_CAT = "#FFD9B3"        # level 3 categories
AC_FILL_PATTERN = "#FFE5B4"    # level 2 result patterns
AC_FILL_STAT = "#BFFFBF"       # level 1 statistical concepts
AC_FILL_METHOD = "#E5E5FF"     # methods (cross-ref)
AC_FILL_OTHER = "#F0D9B5"


def build_ac(data):
    d = Diagram("Analysis Model")
    patterns = data.get("resultPatterns", {})
    stats = data.get("sharedStatisticsVocabulary", {}).get("concepts", {})

    def add_stat(name):
        sid = f"AC:stat/{name}"
        if sid in d.nodes:
            return sid
        spec = stats.get(name, {})
        props = []
        if spec.get("valueType"):
            props.append(f"valueType: {spec['valueType']}")
        if spec.get("unitRule"):
            props.append(f"unitRule: {spec['unitRule']}")
        if spec.get("term"):
            props.append(f"term: {spec['term']}")
        d.add(Node(sid, name, AC_FILL_STAT, props=props))   # parent set on first link
        return sid

    def add_pattern(name, parent_id):
        pid = f"AC:pat/{name}"
        spec = patterns.get(name, {})
        if pid not in d.nodes:
            props = []
            dims = spec.get("dimensions", [])
            if dims:
                props.append("dims: " + ", ".join(dims))
            ss = spec.get("statistics_set", [])
            if ss:
                props.append("stat_set: " + ", ".join(ss))
            node = Node(pid, name, AC_FILL_PATTERN, props=props, parent=parent_id)
            d.add(node)
            for c in spec.get("constituents", []):
                sid = add_stat(c)
                if d.nodes[sid].parent is None:
                    d.nodes[sid].parent = pid
                d.edge(pid, sid, "")
        d.edge(parent_id, pid, "involves")
        return pid

    referenced = set()
    for cat, cspec in data.get("categories", {}).items():
        if not isinstance(cspec, dict):
            continue
        cid = f"AC:cat/{cat}"
        methods = cspec.get("typicalMethods", [])
        props = ["methods:"] + [f"  • {m}" for m in methods] if methods else []
        d.add(Node(cid, cat, AC_FILL_CAT, props=props))
        for p in cspec.get("typicallyInvolves", []):
            add_pattern(p, cid)
            referenced.add(p)

    # patterns not referenced by any category
    orphans = [p for p in patterns if p not in referenced and isinstance(patterns[p], dict)]
    if orphans:
        oid = "AC:other"
        d.add(Node(oid, "Other Result Patterns", AC_FILL_OTHER))
        for p in orphans:
            add_pattern(p, oid)

    return d


# =========================================================================
def main():
    with open(os.path.join(CONCEPTS, "OC_Instance_Model_v016.json")) as f:
        oc = build_oc(json.load(f))
    with open(os.path.join(CONCEPTS, "Option_B_Clinical.json")) as f:
        dc = build_dc(json.load(f))
    with open(os.path.join(CONCEPTS, "AC_Concept_Model_v017.json")) as f:
        ac = build_ac(json.load(f))

    diagrams = []
    for d in (oc, dc, ac):
        px, box_pos = layout_force(d)
        diagrams.append(emit(d, px, box_pos))
    xml = ('<mxfile host="Electron" background="#FFFFFF">\n'
           + "\n".join(diagrams) + "\n</mxfile>\n")
    with open(OUT, "w") as f:
        f.write(xml)
    counts = {d.name: (len(d.nodes), len(d.edges)) for d in (oc, dc, ac)}
    print("wrote", OUT)
    for name, (nn, ne) in counts.items():
        print(f"  {name}: {nn} nodes, {ne} edges")


if __name__ == "__main__":
    main()
