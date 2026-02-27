#!/usr/bin/env python3
"""
Validate the decomposed ACDC method library:
  1. Every statistic referenced by a method exists in statistics_vocabulary.json
  2. Every output class referenced by a method exists in output_class_templates.json
  3. Every method in _index.json has a corresponding file (and vice versa)
  4. Method OID matches the filename
  5. Method type matches its directory (derivations/ vs analyses/)
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "model" / "method"
LIB_DIR = ROOT / "lib" / "methods"

errors = []
warnings = []


def error(msg):
    errors.append(msg)
    print(f"  ERROR: {msg}")


def warn(msg):
    warnings.append(msg)
    print(f"  WARN:  {msg}")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def validate_statistics_references(method, vocab_stats, filepath):
    """Check all statistic references in a method resolve to the vocabulary."""
    for oc in method.get("output_specification", {}).get("output_classes", []):
        for stat in oc.get("statistics", []):
            if stat not in vocab_stats:
                error(f"{filepath}: statistic '{stat}' not in statistics_vocabulary")
        # Check sub_types too
        for st in oc.get("sub_types", []):
            for stat in st.get("statistics", []):
                if stat not in vocab_stats:
                    error(f"{filepath}: sub_type statistic '{stat}' not in statistics_vocabulary")


def validate_output_class_references(method, template_names, filepath):
    """Check all output class references resolve to templates."""
    for oc in method.get("output_specification", {}).get("output_classes", []):
        cls = oc.get("class", "")
        if cls not in template_names:
            warn(f"{filepath}: output class '{cls}' not in output_class_templates (may be inline)")


def validate_oid_matches_filename(method, filepath):
    """Check that the OID matches the filename."""
    oid = method.get("oid", "")
    expected_filename = f"{oid}.json"
    actual_filename = filepath.name
    if actual_filename != expected_filename:
        error(f"{filepath}: OID '{oid}' does not match filename '{actual_filename}'")


def validate_type_matches_directory(method, filepath):
    """Check that method type matches its directory."""
    method_type = method.get("type", "")
    parent_dir = filepath.parent.name
    expected_dir = "derivations" if method_type == "derivation" else "analyses"
    if parent_dir != expected_dir:
        error(f"{filepath}: type '{method_type}' does not match directory '{parent_dir}'")


def validate_schema_version(method, filepath):
    """Check that schema_version is present."""
    if "schema_version" not in method:
        error(f"{filepath}: missing 'schema_version' field")


def main():
    print("=== ACDC Method Library Validation ===\n")

    # Load vocabularies
    print("Loading vocabularies...")
    vocab = load_json(MODEL_DIR / "statistics_vocabulary.json")
    vocab_stats = set(vocab["statistics"].keys())
    print(f"  {len(vocab_stats)} statistics in vocabulary")

    templates = load_json(MODEL_DIR / "output_class_templates.json")
    template_names = set(templates["output_class_templates"].keys())
    print(f"  {len(template_names)} output class templates")

    # Load index
    print("\nLoading index...")
    index = load_json(LIB_DIR / "_index.json")
    index_methods = {m["oid"]: m for m in index["methods"]}
    print(f"  {len(index_methods)} methods in index")

    # Discover method files on disk
    method_files = {}
    for subdir in ["derivations", "analyses"]:
        dir_path = LIB_DIR / subdir
        if dir_path.exists():
            for f in sorted(dir_path.glob("M.*.json")):
                method_files[f.stem] = f

    print(f"  {len(method_files)} method files on disk")

    # Validate index ↔ files consistency
    print("\nChecking index ↔ file consistency...")
    for oid, entry in index_methods.items():
        expected_path = LIB_DIR / entry["path"]
        if not expected_path.exists():
            error(f"Index entry '{oid}' points to missing file: {entry['path']}")

    for oid, filepath in method_files.items():
        if oid not in index_methods:
            error(f"File '{filepath.name}' not listed in _index.json")

    # Validate each method file
    print("\nValidating individual methods...")
    for oid, filepath in sorted(method_files.items()):
        method = load_json(filepath)
        validate_oid_matches_filename(method, filepath)
        validate_type_matches_directory(method, filepath)
        validate_schema_version(method, filepath)
        validate_statistics_references(method, vocab_stats, filepath)
        validate_output_class_references(method, template_names, filepath)

    # Summary
    print(f"\n{'=' * 50}")
    print(f"Validation complete:")
    print(f"  Methods validated: {len(method_files)}")
    print(f"  Errors:   {len(errors)}")
    print(f"  Warnings: {len(warnings)}")

    if errors:
        print("\nERRORS (must fix):")
        for e in errors:
            print(f"  - {e}")

    if warnings:
        print("\nWARNINGS (review):")
        for w in warnings:
            print(f"  - {w}")

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
