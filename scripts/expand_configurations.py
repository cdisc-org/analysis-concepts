#!/usr/bin/env python3
"""
Load-time expander for method Configurations that declare conforms_to.

Library method files can write compact Configurations that reference concepts in
model/method/configuration_concepts.json. The expander walks each method's
configurations[] list, finds any Configuration with conforms_to set, and fills
in missing fields (name, dataType, description, defaultValue, enumValues,
codings) from the registry concept. For enum concepts with per-value scope
metadata, the Configuration's applicable_scopes list filters the catalog.

Local Configuration fields always override inherited ones.

Entry points:
    expand_configuration(config_dict, registry_dict) -> expanded_config_dict
    expand_method(method_dict, registry_dict) -> method_dict (mutated)
    load_registry(path) -> registry_dict
    expand_all_methods(methods_dir, registry_path) -> iterator of (path, expanded_method)

CLI usage (dry-run validation):
    python scripts/expand_configurations.py
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from typing import Any, Iterator


ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = ROOT / "model" / "method" / "configuration_concepts.json"
LIB_DIR = ROOT / "lib" / "methods"


class ExpansionError(Exception):
    """Raised when a Configuration cannot be expanded (unknown concept, unknown scope, etc.)."""


def load_registry(path: Path = REGISTRY_PATH) -> dict[str, Any]:
    """Load the configuration_concepts registry."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _inherit(local: dict, key: str, registry_value: Any) -> None:
    """Fill in local[key] from registry_value IF local doesn't already have it."""
    if key not in local or local[key] is None:
        local[key] = registry_value


def _filter_enum_values_by_scope(
    concept: dict,
    applicable_scopes: list[str],
    concept_id: str,
) -> tuple[list[str], list[dict]]:
    """
    For an enum concept with a 'values' catalog, return (enumValues, codings) filtered by scope.

    enumValues preserves the order declared in concept['values'].
    codings is the union (in catalog order) of each filtered value's codings[].
    """
    values_catalog = concept.get("values")
    if not isinstance(values_catalog, dict):
        return [], []

    scopes_dict = concept.get("scopes", {})

    # Validate every declared applicable_scope exists in the concept's scopes dictionary
    for scope_id in applicable_scopes:
        if scope_id not in scopes_dict:
            raise ExpansionError(
                f"conforms_to '{concept_id}': applicable_scopes references unknown "
                f"scope '{scope_id}'. Known scopes: {sorted(scopes_dict.keys())}"
            )

    enum_values: list[str] = []
    codings: list[dict] = []
    for value_name, value_def in values_catalog.items():
        value_scope = value_def.get("scope")
        if value_scope in applicable_scopes:
            enum_values.append(value_name)
            for c in value_def.get("codings") or []:
                codings.append(c)
    return enum_values, codings


def expand_configuration(
    config: dict,
    registry: dict,
    placement: str = "method",
) -> dict:
    """
    Expand a single Configuration dictionary. Returns a NEW dict (does not mutate input).

    If config does not declare conforms_to, returns a deep copy unchanged.

    Args:
        config: the Configuration dictionary to expand.
        registry: the full configuration_concepts registry (loaded via load_registry).
        placement: where this Configuration appears in the method structure. One of
                   "method" (top-level configurations[]) or "output_class" (inside
                   an output_class.configurations[]). Used to enforce the concept's
                   valid_placement policy if declared in the registry.

    Raises ExpansionError on unknown concept, unknown scope, placement mismatch, or
    missing required applicable_scopes for an enum concept with a values catalog.
    """
    expanded = copy.deepcopy(config)

    concept_id = expanded.get("conforms_to")
    if not concept_id:
        return expanded

    concepts = registry.get("concepts", {})
    if concept_id not in concepts:
        raise ExpansionError(
            f"Configuration.conforms_to references unknown concept '{concept_id}'. "
            f"Known concepts: {sorted(concepts.keys())}"
        )
    concept = concepts[concept_id]

    # Enforce valid_placement if declared on the concept.
    valid_placement = concept.get("valid_placement")
    if valid_placement is not None and placement not in valid_placement:
        raise ExpansionError(
            f"Concept '{concept_id}' cannot be used at placement '{placement}'; "
            f"valid_placement is {valid_placement}. Move this Configuration to a "
            f"{' or '.join(valid_placement)}-level location."
        )

    # Fill in scalar fields from the registry if not locally overridden.
    _inherit(expanded, "name", concept_id)
    _inherit(expanded, "dataType", concept.get("dataType"))
    _inherit(expanded, "description", concept.get("description"))
    if concept.get("typical_default") is not None:
        _inherit(expanded, "defaultValue", concept["typical_default"])

    # If this is an enum concept with a values catalog, resolve enumValues + codings by scope.
    if concept.get("dataType") == "enum" and isinstance(concept.get("values"), dict):
        applicable_scopes = expanded.get("applicable_scopes")
        if applicable_scopes is None:
            # Default to ['universal'] if the concept has a 'universal' scope, else error.
            if "universal" in concept.get("scopes", {}):
                applicable_scopes = ["universal"]
            else:
                raise ExpansionError(
                    f"conforms_to '{concept_id}': applicable_scopes is required because "
                    f"this concept is an enum with per-value scope metadata and has no "
                    f"'universal' scope to default to. Declare applicable_scopes explicitly."
                )

        enum_values, codings = _filter_enum_values_by_scope(
            concept, applicable_scopes, concept_id
        )

        # Local enumValues/codings always win over inherited ones.
        if "enumValues" not in expanded or expanded["enumValues"] is None:
            expanded["enumValues"] = enum_values
        if "codings" not in expanded or expanded["codings"] is None:
            expanded["codings"] = codings if codings else None

    return expanded


def expand_method(method: dict, registry: dict) -> dict:
    """
    Expand all conforms_to references in a method's configurations[] AND in every
    output_class's configurations[]. Method-level Configurations are expanded with
    placement='method'; output-class-level Configurations with placement='output_class'.
    The expander uses placement to enforce each concept's valid_placement policy.

    Returns a NEW dict (does not mutate input). Raises ExpansionError on any
    problem; error message includes the method OID and position for traceability.
    """
    expanded = copy.deepcopy(method)
    oid = expanded.get("oid", "<unknown>")

    # Method-level configurations
    configs = expanded.get("configurations")
    if configs:
        new_configs = []
        for i, cfg in enumerate(configs):
            try:
                new_configs.append(expand_configuration(cfg, registry, placement="method"))
            except ExpansionError as e:
                raise ExpansionError(f"{oid}::configurations[{i}]: {e}") from None
        expanded["configurations"] = new_configs

    # Output-class-level configurations
    output_classes = (
        expanded.get("output_specification", {}).get("output_classes") or []
    )
    for oc_idx, oc in enumerate(output_classes):
        oc_configs = oc.get("configurations")
        if not oc_configs:
            continue
        new_oc_configs = []
        for cfg_idx, cfg in enumerate(oc_configs):
            try:
                new_oc_configs.append(
                    expand_configuration(cfg, registry, placement="output_class")
                )
            except ExpansionError as e:
                raise ExpansionError(
                    f"{oid}::output_classes[{oc_idx}]"
                    f" (class={oc.get('class', '?')!r})"
                    f".configurations[{cfg_idx}]: {e}"
                ) from None
        oc["configurations"] = new_oc_configs

    return expanded


def expand_all_methods(
    methods_dir: Path = LIB_DIR,
    registry_path: Path = REGISTRY_PATH,
) -> Iterator[tuple[Path, dict]]:
    """
    Walk every method file under methods_dir and yield (path, expanded_method).
    """
    registry = load_registry(registry_path)
    for subdir in ("analyses", "derivations"):
        dir_path = methods_dir / subdir
        if not dir_path.exists():
            continue
        for filepath in sorted(dir_path.glob("M.*.json")):
            with open(filepath, encoding="utf-8") as f:
                method = json.load(f)
            yield filepath, expand_method(method, registry)


def main() -> int:
    """CLI: dry-run expand every method and report any errors."""
    registry = load_registry()
    print(f"Loaded registry v{registry.get('version')} "
          f"({len(registry.get('concepts', {}))} concepts)")

    errors: list[tuple[Path, str]] = []
    total = 0
    expanded_with_conforms_to = 0

    for filepath, expanded in expand_all_methods():
        total += 1
        for cfg in expanded.get("configurations") or []:
            if cfg.get("conforms_to"):
                expanded_with_conforms_to += 1
                break

    # Second pass to surface any errors with line-by-line detail
    for filepath, expanded in expand_all_methods():
        try:
            for i, cfg in enumerate(expanded.get("configurations") or []):
                if cfg.get("conforms_to"):
                    # Verify required fields made it in
                    if not cfg.get("name"):
                        raise ExpansionError(f"configurations[{i}]: expanded config has no name")
                    if not cfg.get("dataType"):
                        raise ExpansionError(f"configurations[{i}]: expanded config has no dataType")
        except ExpansionError as e:
            errors.append((filepath, str(e)))

    print(f"Expanded {total} methods; "
          f"{expanded_with_conforms_to} methods had configurations with conforms_to.")
    if errors:
        print(f"\nExpansion errors ({len(errors)}):")
        for f, msg in errors:
            print(f"  {f.relative_to(ROOT)}: {msg}")
        return 1
    print("All configurations expanded cleanly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
