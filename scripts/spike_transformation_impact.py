"""Transformation impact probe: show that the slim (operand-keyed) transformation
losslessly reconstructs the hand-authored v07 binding, and quantify the shrink.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from spike_concept_binding import unify


def reconstruct(slimmed_tx, concept, method):
    """Recover {method_input: slice} from the slim, operand-keyed form."""
    op_to_input = unify(concept["algebraicDefinition"]["identity"],
                        method["formula"]["generic_expression"])   # {operand: input}
    out = {}
    for os in slimmed_tx["operandSlices"]:
        out[op_to_input[os["operand"]]] = os["slice"]
    return out


def impact_metric(v07_measures, slimmed_tx):
    """Quantify what the slim form drops vs the v07 measure bindings."""
    v07_fields = sum(len(m) for m in v07_measures)
    slim_fields = sum(len(os) for os in slimmed_tx["operandSlices"])
    names_method_slots = any("input" in m for m in v07_measures)
    return {"v07_binding_fields": v07_fields,
            "slim_binding_fields": slim_fields,
            "v07_names_method_slots": names_method_slots,
            "slim_names_method_slots": False}
