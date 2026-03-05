#!/usr/bin/env python3
"""One-time migration: convert stato_id/stato_mapping/stato_class to codings arrays."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "model" / "method"
LIB_DIR = ROOT / "lib" / "methods"

STATO_SYSTEM = "http://purl.obolibrary.org/obo/stato"

# Preferred key order for method JSON files
METHOD_KEY_ORDER = [
    "$schema", "schema_version", "$vocabulary",
    "oid", "name", "type", "class", "intent",
    "codings", "stato_r_implementation",
    "description", "formula", "configurations",
    "output_specification", "assumptions", "input_roles",
]


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def ordered_method(method):
    """Return method dict with keys in the preferred display order."""
    ordered = {}
    for key in METHOD_KEY_ORDER:
        if key in method:
            ordered[key] = method[key]
    for key in method:
        if key not in ordered:
            ordered[key] = method[key]
    return ordered


def migrate_statistics_vocabulary():
    path = MODEL_DIR / "statistics_vocabulary.json"
    vocab = load_json(path)
    vocab["version"] = "0.5.0"

    for stat_name, stat_data in vocab["statistics"].items():
        stato_id = stat_data.pop("stato_id", None)
        if stato_id:
            stat_data["codings"] = [{
                "system": STATO_SYSTEM,
                "code": stato_id,
            }]

    write_json(path, vocab)
    print(f"Migrated {path.relative_to(ROOT)}")


def migrate_method_file(filepath):
    method = load_json(filepath)
    method["schema_version"] = "0.5.0"

    codings = []

    # Convert stato_mapping
    stato_mapping = method.pop("stato_mapping", None)
    if stato_mapping and stato_mapping != "UNMAPPED":
        codings.append({
            "system": STATO_SYSTEM,
            "code": stato_mapping,
            "relationship": "equivalent",
        })

    # Convert stato_class
    stato_class = method.pop("stato_class", None)
    if stato_class:
        codings.append({
            "system": STATO_SYSTEM,
            "code": stato_class["id"],
            "display": stato_class["name"],
            "relationship": "parent",
        })

    if codings:
        method["codings"] = codings

    write_json(filepath, ordered_method(method))
    print(f"  Migrated {filepath.relative_to(ROOT)}")


def migrate_index():
    path = LIB_DIR / "_index.json"
    index = load_json(path)

    for entry in index.get("methods", []):
        stato_mapping = entry.pop("stato_mapping", None)
        if stato_mapping and stato_mapping != "UNMAPPED":
            entry["codings"] = [{
                "system": STATO_SYSTEM,
                "code": stato_mapping,
            }]

    write_json(path, index)
    print(f"Migrated {path.relative_to(ROOT)}")


def main():
    print("=== Migrating statistics vocabulary ===")
    migrate_statistics_vocabulary()

    print("\n=== Migrating method files ===")
    for subdir in ["analyses", "derivations"]:
        dirpath = LIB_DIR / subdir
        if dirpath.exists():
            for f in sorted(dirpath.glob("*.json")):
                migrate_method_file(f)

    print("\n=== Migrating _index.json ===")
    migrate_index()

    print("\nDone!")


if __name__ == "__main__":
    main()
