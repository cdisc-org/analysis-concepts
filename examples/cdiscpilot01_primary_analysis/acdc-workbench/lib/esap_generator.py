"""eSAP text generator - generate electronic SAP text from sentences.

Provides functions to assemble eSAP text from sentences and instances.
Updated to work with the new cube-based instance structure.
"""

from typing import Any, Dict, List, Optional

from .library import Library
from .models import ACInstance, Sentence
from .sentence_builder import compose_sentence, get_stcs_from_sentence


def generate_esap_text(library: Library, sentence: Sentence) -> str:
    """Generate eSAP text from a sentence.

    Args:
        library: The loaded library
        sentence: The sentence to render

    Returns:
        eSAP text string
    """
    return sentence.text


def generate_esap_from_instance(library: Library, instance: ACInstance) -> str:
    """Generate eSAP text from an AC instance.

    Args:
        library: The loaded library
        instance: The AC instance

    Returns:
        eSAP text string
    """
    if instance.described_by:
        sentence = library.get_sentence_by_id(instance.described_by)
        if sentence:
            return generate_esap_text(library, sentence)

    # Fallback to instance description
    return instance.description


def _get_slice_value(instance: ACInstance, data_concept: str) -> Optional[Any]:
    """Get a value from the instance slice constraints.

    Args:
        instance: The AC instance
        data_concept: The data concept to look for

    Returns:
        The value or None
    """
    if instance.slice:
        for constraint in instance.slice.constraints:
            if constraint.data_concept == data_concept:
                return constraint.value or constraint.values
    # Fallback to legacy slice_bindings
    if instance.slice_bindings and data_concept in instance.slice_bindings:
        binding = instance.slice_bindings[data_concept]
        if isinstance(binding, dict):
            return binding.get("value") or binding.get("values")
        return binding
    return None


def _get_slice_label(instance: ACInstance, data_concept: str) -> Optional[str]:
    """Get a label from the instance slice constraints.

    Args:
        instance: The AC instance
        data_concept: The data concept to look for

    Returns:
        The label or None
    """
    if instance.slice:
        for constraint in instance.slice.constraints:
            if constraint.data_concept == data_concept:
                return constraint.label
    # Fallback to legacy slice_bindings
    if instance.slice_bindings and data_concept in instance.slice_bindings:
        binding = instance.slice_bindings[data_concept]
        if isinstance(binding, dict):
            return binding.get("label")
    return None


def generate_analysis_summary(library: Library, instance: ACInstance) -> Dict[str, Any]:
    """Generate a structured analysis summary from an AC instance.

    Args:
        library: The loaded library
        instance: The AC instance

    Returns:
        Dictionary with analysis summary
    """
    summary = {
        "title": instance.name,
        "study": instance.study,
        "description": instance.description,
        "esap_text": generate_esap_from_instance(library, instance),
        "endpoint": None,
        "population": None,
        "timepoint": None,
        "model": None,
        "outputs": [],
    }

    # Extract from new slice structure
    summary["endpoint"] = _get_slice_label(instance, "parameter") or _get_slice_value(instance, "parameter")
    summary["timepoint"] = _get_slice_value(instance, "visit")

    # Check efficacy_flag or population_flag
    pop_value = _get_slice_value(instance, "efficacy_flag") or _get_slice_value(instance, "population_flag")
    if pop_value:
        pop_label = _get_slice_label(instance, "efficacy_flag") or _get_slice_label(instance, "population_flag")
        summary["population"] = pop_label or "Efficacy" if pop_value == "Y" else pop_value

    # Model info - use new structure first, fallback to legacy
    if instance.method:
        formula = instance.method.formula
        # Resolve to implementation variables if possible
        if library.implementation_mapping:
            for concept, var in library.implementation_mapping.data_concept_to_adam.items():
                formula = formula.replace(concept, var)

        hypothesis_info = None
        if instance.hypothesis:
            hypothesis_info = {
                "null": instance.hypothesis.null,
                "alternative": instance.hypothesis.alternative,
                "alpha": instance.hypothesis.alpha,
            }

        summary["model"] = {
            "formula": formula,
            "hypothesis": hypothesis_info,
        }
    elif instance.model:
        summary["model"] = {
            "formula": instance.model.get("formula_resolved") or instance.model.get("formula_semantic"),
            "hypothesis": instance.model.get("hypothesis"),
        }

    # Outputs
    if instance.outputs:
        for name, spec in instance.outputs.items():
            summary["outputs"].append(
                {
                    "name": name,
                    "description": spec.get("description") if isinstance(spec, dict) else spec,
                }
            )

    return summary


def generate_adam_spec(library: Library, instance: ACInstance) -> List[Dict[str, Any]]:
    """Generate ADaM variable specifications from an AC instance and its DC dependencies.

    Args:
        library: The loaded library
        instance: The AC instance

    Returns:
        List of variable specification dictionaries
    """
    specs = []

    # Get DC instances
    dc_instances = library.get_dc_instances_for_ac(instance)

    for dc_inst in dc_instances:
        template = library.get_template_for_instance(dc_inst)

        spec = {
            "source": dc_inst.id,
            "template": template.name if template else dc_inst.instance_of,
            "clinical_intent": template.clinical_intent if template else "",
            "variables": [],
        }

        # Get output variables from the new output_cube structure
        if dc_inst.output_cube:
            for measure in dc_inst.output_cube.measures:
                adam_var = library.resolve_data_concept_to_adam(measure.data_concept)
                if adam_var:
                    spec["variables"].append(
                        {
                            "adam_variable": adam_var,
                            "stc": measure.data_concept,
                            "derivation": dc_inst.description,
                        }
                    )
        # Fallback to legacy target_mapping
        elif dc_inst.target_mapping:
            target = dc_inst.target_mapping
            for stc, adam_var in target.get("variables", {}).items():
                spec["variables"].append(
                    {
                        "adam_variable": adam_var,
                        "stc": stc,
                        "derivation": dc_inst.description,
                    }
                )

        if spec["variables"]:
            specs.append(spec)

    return specs


def format_esap_for_export(
    library: Library, instance: ACInstance, include_traceability: bool = True
) -> str:
    """Format eSAP text for document export.

    Args:
        library: The loaded library
        instance: The AC instance
        include_traceability: Whether to include traceability info

    Returns:
        Formatted eSAP text
    """
    summary = generate_analysis_summary(library, instance)

    lines = [
        f"## {summary['title']}",
        "",
        summary["esap_text"],
        "",
    ]

    if include_traceability:
        lines.extend(
            [
                "### Analysis Details",
                "",
                f"- **Endpoint**: {summary['endpoint'] or 'Not specified'}",
                f"- **Timepoint**: {summary['timepoint'] or 'Not specified'}",
                f"- **Population**: {summary['population'] or 'Not specified'}",
                "",
            ]
        )

        if summary["model"]:
            lines.extend(
                [
                    "### Model Specification",
                    "",
                    f"- **Formula**: `{summary['model'].get('formula', 'N/A')}`",
                ]
            )
            if summary["model"].get("hypothesis"):
                hyp = summary["model"]["hypothesis"]
                lines.append(f"- **Null Hypothesis**: {hyp.get('null', 'N/A')}")
                lines.append(
                    f"- **Alternative Hypothesis**: {hyp.get('alternative', 'N/A')}"
                )
            lines.append("")

        if summary["outputs"]:
            lines.extend(["### Outputs", ""])
            for output in summary["outputs"]:
                lines.append(f"- **{output['name']}**: {output['description']}")
            lines.append("")

    return "\n".join(lines)
