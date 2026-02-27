#!/usr/bin/env python3
"""
Extract the monolithic acdc_methods_library_v0_3.json into:
  - model/method/statistics_vocabulary.json
  - model/method/output_class_templates.json
  - model/method/formula_grammar.json
  - lib/methods/derivations/M.<Name>.json (one per derivation method)
  - lib/methods/analyses/M.<Name>.json    (one per analysis method)
  - lib/methods/_index.json
"""

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MONOLITH = ROOT / "model" / "method" / "acdc_methods_library_v0_3.json"
MODEL_DIR = ROOT / "model" / "method"
LIB_DIR = ROOT / "lib" / "methods"

SCHEMA_VERSION = "0.4.0"


def load_monolith():
    with open(MONOLITH, "r") as f:
        return json.load(f)


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  wrote {path.relative_to(ROOT)}")


def extract_statistics_vocabulary(monolith):
    vocab = dict(monolith["statistics_vocabulary"])
    # Remove internal _description key
    vocab.pop("_description", None)

    out = {
        "version": SCHEMA_VERSION,
        "description": "Reusable statistic definitions referenced by output classes across ACDC methods",
        "statistics": vocab
    }
    write_json(MODEL_DIR / "statistics_vocabulary.json", out)


def extract_output_class_templates(monolith):
    templates = dict(monolith["output_class_templates"])
    # Remove internal _description key
    templates.pop("_description", None)

    # Promote inline-only output classes from methods into templates
    inline_classes = {}
    for method in monolith["methods"]:
        for oc in method.get("output_specification", {}).get("output_classes", []):
            cls_name = oc["class"]
            if cls_name not in templates and cls_name not in inline_classes:
                # Build a template from the inline definition
                template = {"description": oc.get("description", "")}
                if "cardinality" in oc:
                    template["cardinality"] = oc["cardinality"]
                template["indexed_by"] = oc.get("indexed_by")
                template["statistics"] = oc.get("statistics", [])
                inline_classes[cls_name] = template

    if inline_classes:
        print(f"  promoted {len(inline_classes)} inline classes to templates: {list(inline_classes.keys())}")
        templates.update(inline_classes)

    out = {
        "version": SCHEMA_VERSION,
        "$vocabulary": {
            "statistics": "./statistics_vocabulary.json"
        },
        "description": "Reusable output class patterns referenced by methods",
        "output_class_templates": templates
    }
    write_json(MODEL_DIR / "output_class_templates.json", out)


def extract_formula_grammar(monolith):
    grammar = monolith["formula_grammar"]
    out = {
        "version": SCHEMA_VERSION,
        "description": grammar.get("description", "BNF grammar for method expressions"),
        "bnf": grammar["bnf"],
        "cardinality_notation": grammar["cardinality_notation"]
    }
    write_json(MODEL_DIR / "formula_grammar.json", out)


def extract_methods(monolith):
    index_entries = []

    for method in monolith["methods"]:
        oid = method["oid"]
        method_type = method["type"]
        subdir = "derivations" if method_type == "derivation" else "analyses"
        filename = f"{oid}.json"
        rel_path = f"{subdir}/{filename}"

        # Determine $vocabulary relative path
        vocab_prefix = "../../model/method"

        # Build the method file with schema metadata
        method_file = {
            "$schema": "../../model/method/acdc_methods.schema.json",
            "schema_version": SCHEMA_VERSION,
            "$vocabulary": {
                "statistics": f"{vocab_prefix}/statistics_vocabulary.json",
                "output_classes": f"{vocab_prefix}/output_class_templates.json",
                "formula_grammar": f"{vocab_prefix}/formula_grammar.json"
            }
        }
        # Copy all method fields
        for key, value in method.items():
            method_file[key] = value

        write_json(LIB_DIR / subdir / filename, method_file)

        # Build index entry
        index_entry = {
            "oid": oid,
            "name": method["name"],
            "type": method_type,
            "class": method["class"],
            "path": rel_path
        }
        if "stato_mapping" in method:
            index_entry["stato_mapping"] = method["stato_mapping"]
        index_entries.append(index_entry)

    # Write index
    index = {
        "schema_version": SCHEMA_VERSION,
        "description": "Registry of all ACDC method definitions",
        "methods": index_entries
    }
    write_json(LIB_DIR / "_index.json", index)

    return index_entries


def main():
    print("Loading monolith...")
    monolith = load_monolith()

    print(f"\nFound {len(monolith['methods'])} methods")
    derivations = [m for m in monolith["methods"] if m["type"] == "derivation"]
    analyses = [m for m in monolith["methods"] if m["type"] == "analysis"]
    print(f"  {len(derivations)} derivations, {len(analyses)} analyses")

    print("\nExtracting statistics vocabulary...")
    extract_statistics_vocabulary(monolith)

    print("\nExtracting output class templates...")
    extract_output_class_templates(monolith)

    print("\nExtracting formula grammar...")
    extract_formula_grammar(monolith)

    print("\nExtracting individual methods...")
    entries = extract_methods(monolith)

    print(f"\nDone! Created {len(entries)} method files + _index.json")
    print(f"  Derivations: lib/methods/derivations/ ({len(derivations)} files)")
    print(f"  Analyses:    lib/methods/analyses/ ({len(analyses)} files)")


if __name__ == "__main__":
    main()
