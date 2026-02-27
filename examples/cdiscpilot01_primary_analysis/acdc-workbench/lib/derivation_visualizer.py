"""Derivation chain visualization using Graphviz.

Creates a visual representation of the SDTM → DC → ADaM → AC → Analysis chain.
"""

from typing import Optional

import graphviz

from .branding import CDISC_COLORS
from .library import Library
from .models import ACInstance, DCInstance


def create_derivation_chain(
    library: Library, ac_instance: Optional[ACInstance] = None
) -> graphviz.Digraph:
    """Create a Graphviz diagram showing the derivation chain.

    Args:
        library: The loaded library
        ac_instance: Optional specific AC instance to visualize (uses first if not specified)

    Returns:
        Graphviz Digraph object
    """
    # Create the graph
    dot = graphviz.Digraph(comment="AC/DC Derivation Chain")
    dot.attr(rankdir="TB", splines="ortho", nodesep="0.5", ranksep="0.8")

    # Define node styles
    sdtm_style = {
        "shape": "box",
        "style": "filled",
        "fillcolor": "#E8E8E8",
        "fontcolor": CDISC_COLORS["dark_2"],
        "fontname": "Arial",
    }
    dc_template_style = {
        "shape": "box",
        "style": "filled,rounded",
        "fillcolor": CDISC_COLORS["accent_3"],
        "fontcolor": "white",
        "fontname": "Arial Bold",
    }
    dc_instance_style = {
        "shape": "box",
        "style": "filled",
        "fillcolor": "#F5D0CE",
        "fontcolor": CDISC_COLORS["dark_2"],
        "fontname": "Arial",
    }
    ac_template_style = {
        "shape": "box",
        "style": "filled,rounded",
        "fillcolor": CDISC_COLORS["accent_5"],
        "fontcolor": "white",
        "fontname": "Arial Bold",
    }
    ac_instance_style = {
        "shape": "box",
        "style": "filled",
        "fillcolor": "#D4C5E0",
        "fontcolor": CDISC_COLORS["dark_2"],
        "fontname": "Arial",
    }
    output_style = {
        "shape": "ellipse",
        "style": "filled",
        "fillcolor": CDISC_COLORS["accent_2"],
        "fontcolor": CDISC_COLORS["dark_2"],
        "fontname": "Arial",
    }

    # Get the AC instance to visualize
    if ac_instance is None and library.ac_instances:
        ac_instance = library.ac_instances[0]

    if ac_instance is None:
        # No AC instance, just show structure
        dot.node("no_data", "No AC Instance Found", shape="box")
        return dot

    # Add SDTM source node - derive filter from slice constraints
    sdtm_domain = "QS"
    sdtm_filter = ""

    # Build filter from slice constraints (new structure)
    if ac_instance.slice and ac_instance.slice.constraints:
        filter_parts = []
        for constraint in ac_instance.slice.constraints:
            if constraint.value:
                filter_parts.append(f"{constraint.data_concept}={constraint.value}")
            elif constraint.values:
                filter_parts.append(f"{constraint.data_concept} IN ({', '.join(str(v) for v in constraint.values)})")
        sdtm_filter = " & ".join(filter_parts)
    # Fallback to legacy slice_bindings
    elif ac_instance.slice_bindings:
        filter_parts = []
        for key, binding in ac_instance.slice_bindings.items():
            if isinstance(binding, dict):
                val = binding.get("value") or binding.get("values")
                if val:
                    filter_parts.append(f"{key}={val}")
            else:
                filter_parts.append(f"{key}={binding}")
        sdtm_filter = " & ".join(filter_parts)

    sdtm_label = f"SDTM {sdtm_domain}\\n{sdtm_filter[:40]}..." if len(sdtm_filter) > 40 else f"SDTM {sdtm_domain}\\n{sdtm_filter}"
    dot.node("sdtm", sdtm_label, **sdtm_style)

    # Get DC instances this AC depends on
    dc_instances = library.get_dc_instances_for_ac(ac_instance)

    # Add DC template/instance nodes
    prev_node = "sdtm"
    for i, dc_inst in enumerate(dc_instances):
        template = library.get_template_for_instance(dc_inst)

        # Template node
        template_id = f"dc_template_{i}"
        template_label = template.name if template else dc_inst.instance_of
        dot.node(template_id, template_label, **dc_template_style)

        # Instance node
        instance_id = f"dc_instance_{i}"
        instance_label = f"{dc_inst.id}\\n{dc_inst.name[:30]}..."
        dot.node(instance_id, instance_label, **dc_instance_style)

        # Edges
        dot.edge(prev_node, template_id)
        dot.edge(template_id, instance_id, style="dashed", label="instantiates")

        prev_node = instance_id

    # Add AC template node
    ac_template = library.get_template_for_instance(ac_instance)
    ac_template_label = ac_template.name if ac_template else ac_instance.instance_of
    dot.node("ac_template", ac_template_label, **ac_template_style)

    # Add AC instance node
    ac_instance_label = f"{ac_instance.id}\\n{ac_instance.name[:30]}..."
    dot.node("ac_instance", ac_instance_label, **ac_instance_style)

    # Edges to AC
    dot.edge(prev_node, "ac_template")
    dot.edge("ac_template", "ac_instance", style="dashed", label="instantiates")

    # Add output node
    outputs = []
    if ac_instance.outputs:
        outputs = list(ac_instance.outputs.keys())[:4]  # Limit to 4
    output_label = "Analysis Output\\n" + ", ".join(outputs)
    dot.node("output", output_label, **output_style)
    dot.edge("ac_instance", "output")

    return dot


def create_simple_chain(library: Library) -> graphviz.Digraph:
    """Create a simplified derivation chain showing the main flow.

    Args:
        library: The loaded library

    Returns:
        Graphviz Digraph object
    """
    dot = graphviz.Digraph(comment="Simplified Derivation Chain")
    dot.attr(rankdir="TB", splines="polyline", nodesep="0.6", ranksep="0.5")

    # Simplified styles
    source_style = {
        "shape": "cylinder",
        "style": "filled",
        "fillcolor": "#E8E8E8",
        "fontname": "Arial",
    }
    dc_style = {
        "shape": "box",
        "style": "filled,rounded",
        "fillcolor": CDISC_COLORS["accent_3"],
        "fontcolor": "white",
        "fontname": "Arial Bold",
    }
    adam_style = {
        "shape": "cylinder",
        "style": "filled",
        "fillcolor": CDISC_COLORS["accent_2"],
        "fontname": "Arial",
    }
    ac_style = {
        "shape": "box",
        "style": "filled,rounded",
        "fillcolor": CDISC_COLORS["accent_5"],
        "fontcolor": "white",
        "fontname": "Arial Bold",
    }
    result_style = {
        "shape": "note",
        "style": "filled",
        "fillcolor": CDISC_COLORS["accent_4"],
        "fontname": "Arial",
    }

    # Add nodes
    dot.node("sdtm", "SDTM QS\\n(Source Data)", **source_style)

    # DC Templates
    with dot.subgraph(name="cluster_dc") as dc:
        dc.attr(label="Derivation Concepts", style="dashed", color=CDISC_COLORS["accent_3"])
        dc.node("dc_baseline", "T_DC_Baseline\\n(Derive BASE)", **dc_style)
        dc.node("dc_cfb", "T_DC_ChangeFromBaseline\\n(Derive CHG)", **dc_style)
        dc.node("dc_locf", "T_DC_LOCF\\n(Imputation)", **dc_style)

    dot.node("adam", "ADaM ADQSADAS\\n(Analysis Dataset)", **adam_style)

    # AC Template
    dot.node("ac", "T_AC_ANCOVA_DoseResponse\\n(Analysis)", **ac_style)

    dot.node("result", "Analysis Results\\n(slope, p-value, CI)", **result_style)

    # Edges
    dot.edge("sdtm", "dc_baseline")
    dot.edge("dc_baseline", "dc_cfb")
    dot.edge("dc_cfb", "dc_locf")
    dot.edge("dc_locf", "adam")
    dot.edge("adam", "ac")
    dot.edge("ac", "result")

    return dot


def get_chain_legend() -> str:
    """Get HTML legend for the derivation chain colors."""
    return f"""
<div style="display: flex; gap: 16px; flex-wrap: wrap; padding: 8px; background: white; border-radius: 4px; margin-top: 8px;">
    <div style="display: flex; align-items: center; gap: 4px;">
        <div style="width: 16px; height: 16px; background: #E8E8E8; border-radius: 2px;"></div>
        <span style="font-size: 0.85em;">Source Data</span>
    </div>
    <div style="display: flex; align-items: center; gap: 4px;">
        <div style="width: 16px; height: 16px; background: {CDISC_COLORS["accent_3"]}; border-radius: 4px;"></div>
        <span style="font-size: 0.85em;">DC Template</span>
    </div>
    <div style="display: flex; align-items: center; gap: 4px;">
        <div style="width: 16px; height: 16px; background: {CDISC_COLORS["accent_5"]}; border-radius: 4px;"></div>
        <span style="font-size: 0.85em;">AC Template</span>
    </div>
    <div style="display: flex; align-items: center; gap: 4px;">
        <div style="width: 16px; height: 16px; background: {CDISC_COLORS["accent_2"]}; border-radius: 4px;"></div>
        <span style="font-size: 0.85em;">Output</span>
    </div>
</div>
"""
