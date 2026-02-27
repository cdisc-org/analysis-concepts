#!/usr/bin/env python3
"""
Enrich ACDC method library and statistics vocabulary with STATO ontology data from Neo4j.

Requires: Neo4j running locally with STATO loaded (via load_stato_owl.py).

Operations:
  1. Add stato_id to statistics in statistics_vocabulary.json
  2. Validate existing + fill missing stato_mapping on methods
  3. Add stato_hierarchy (IS_A ancestry) to each mapped method
  4. Add stato_r_implementation (R command) to each mapped method

Usage:
  python scripts/enrich_from_stato.py              # dry-run (report only)
  python scripts/enrich_from_stato.py --write       # apply changes to files
"""

import argparse
import json
import sys
from pathlib import Path

from neo4j import GraphDatabase
from dotenv import load_dotenv
import os

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "model" / "method"
LIB_DIR = ROOT / "lib" / "methods"

# Load .env from repo root
load_dotenv(ROOT / ".env")


def get_driver():
    uri = os.getenv("NEO4J_URI", "").strip("'\"")
    username = os.getenv("NEO4J_USERNAME", "").strip("'\"")
    password = os.getenv("NEO4J_PASSWORD", "").strip("'\"")
    return GraphDatabase.driver(uri, auth=(username, password))


def get_database():
    return os.getenv("NEO4J_DATABASE", "neo4j").strip("'\"")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


# Preferred key order for method JSON files.
# Keys not listed here appear in their original order at the end.
METHOD_KEY_ORDER = [
    "$schema", "schema_version", "$vocabulary",
    "oid", "name", "type", "class", "intent",
    "stato_mapping", "stato_class", "stato_r_implementation",
    "description", "formula", "configurations",
    "output_specification", "assumptions", "input_roles",
]


def ordered_method(method):
    """Return method dict with keys in the preferred display order."""
    ordered = {}
    for key in METHOD_KEY_ORDER:
        if key in method:
            ordered[key] = method[key]
    # Append any remaining keys not in the preferred order
    for key in method:
        if key not in ordered:
            ordered[key] = method[key]
    return ordered


def detect_schema(session):
    """Detect which Neo4j schema is present (OWLClass/SUBCLASS_OF)."""
    result = session.run(
        "MATCH (n:OWLClass) WHERE n.uri CONTAINS 'STATO' RETURN count(n) AS cnt"
    )
    cnt = result.single()["cnt"]
    if cnt > 0:
        print(f"  Detected OWLClass schema with {cnt} STATO classes")
        return "OWLClass", "SUBCLASS_OF"

    print("  ERROR: No STATO classes found in Neo4j")
    sys.exit(1)


def validate_stato_id(session, stato_id, node_label):
    """Check if a STATO ID exists in Neo4j and return its label + r_command."""
    result = session.run(f"""
        MATCH (n:{node_label})
        WHERE n.stato_id = $stato_id
        RETURN n.label AS label, n.definition AS definition,
               n.r_command AS r_command, n.python_command AS python_command,
               n.math_notation AS math_notation
    """, stato_id=stato_id)
    record = result.single()
    if record:
        return dict(record)
    return None


def get_stato_parent(session, stato_id, node_label, rel_type):
    """Get the immediate STATO parent class (skipping OBI/BFO/IAO ancestors)."""
    result = session.run(f"""
        MATCH (n:{node_label} {{stato_id: $stato_id}})-[:{rel_type}]->(parent:{node_label})
        WHERE parent.uri STARTS WITH 'http://purl.obolibrary.org/obo/STATO_'
        RETURN parent.stato_id AS id, parent.label AS name
    """, stato_id=stato_id)
    record = result.single()
    if record and record["id"] and record["name"]:
        return {"id": record["id"], "name": record["name"]}
    return None


def search_stato_term(session, search_terms, node_label):
    """Search for STATO terms matching any of the given search terms."""
    results = []
    for term in search_terms:
        result = session.run(f"""
            MATCH (n:{node_label})
            WHERE n.uri STARTS WITH 'http://purl.obolibrary.org/obo/STATO_'
              AND (toLower(n.label) CONTAINS toLower($term)
                   OR toLower(n.definition) CONTAINS toLower($term)
                   OR toLower(n.alternative_term) CONTAINS toLower($term))
            RETURN n.stato_id AS id, n.label AS label, n.definition AS definition
            LIMIT 5
        """, term=term)
        for record in result:
            results.append(dict(record))
    # Deduplicate
    seen = set()
    unique = []
    for r in results:
        if r["id"] not in seen:
            seen.add(r["id"])
            unique.append(r)
    return unique


# ──────────────────────────────────────────────
# Enrichment operations
# ──────────────────────────────────────────────

def find_stato_for_statistic(session, stat_name, stat_description, node_label):
    """Search Neo4j for the best STATO match for a statistic.

    Uses the statistic's description as primary search text, which naturally
    finds specific child terms (e.g., "numerator degrees of freedom") rather
    than generic parents (e.g., "number of degrees of freedom").
    """
    # Build search terms from description and name
    # Normalize stat_name: underscores → spaces, handle abbreviations
    name_readable = stat_name.replace("_", " ")

    # Strategy 1: Exact label match on description
    result = session.run(f"""
        MATCH (n:{node_label})
        WHERE n.uri STARTS WITH 'http://purl.obolibrary.org/obo/STATO_'
          AND toLower(n.label) = toLower($desc)
        RETURN n.stato_id AS id, n.label AS label, n.definition AS definition
    """, desc=stat_description)
    exact = [dict(r) for r in result]
    if len(exact) == 1:
        return exact[0], "exact_label"

    # Strategy 2: Label contains the full description
    result = session.run(f"""
        MATCH (n:{node_label})
        WHERE n.uri STARTS WITH 'http://purl.obolibrary.org/obo/STATO_'
          AND toLower(n.label) CONTAINS toLower($desc)
        RETURN n.stato_id AS id, n.label AS label, n.definition AS definition
    """, desc=stat_description)
    contains = [dict(r) for r in result]
    if len(contains) == 1:
        return contains[0], "label_contains_desc"

    # Strategy 3: Search label and alternative_term for readable name
    result = session.run(f"""
        MATCH (n:{node_label})
        WHERE n.uri STARTS WITH 'http://purl.obolibrary.org/obo/STATO_'
          AND (toLower(n.label) CONTAINS toLower($term)
               OR toLower(n.alternative_term) CONTAINS toLower($term))
        RETURN n.stato_id AS id, n.label AS label, n.definition AS definition
    """, term=name_readable)
    by_name = [dict(r) for r in result]
    if len(by_name) == 1:
        return by_name[0], "label_or_alt_term"

    # Strategy 4: Search description keywords in STATO definitions
    result = session.run(f"""
        MATCH (n:{node_label})
        WHERE n.uri STARTS WITH 'http://purl.obolibrary.org/obo/STATO_'
          AND toLower(n.definition) CONTAINS toLower($desc)
        RETURN n.stato_id AS id, n.label AS label, n.definition AS definition
        LIMIT 5
    """, desc=stat_description)
    by_def = [dict(r) for r in result]
    if len(by_def) == 1:
        return by_def[0], "definition_match"

    # Collect all unique candidates for reporting
    all_candidates = {}
    for c in exact + contains + by_name + by_def:
        if c["id"] not in all_candidates:
            all_candidates[c["id"]] = c
    return list(all_candidates.values()), "ambiguous" if all_candidates else "no_match"


def enrich_statistics(session, node_label, write_mode):
    """Add stato_id to statistics_vocabulary.json by querying Neo4j."""
    print("\n=== Enriching Statistics Vocabulary ===\n")

    vocab_path = MODEL_DIR / "statistics_vocabulary.json"
    vocab = load_json(vocab_path)
    stats = vocab["statistics"]
    changes = 0
    skipped = 0

    for stat_name, stat_data in stats.items():
        description = stat_data.get("description", "")
        existing_id = stat_data.get("stato_id")

        # If already has a stato_id, validate it
        if existing_id:
            info = validate_stato_id(session, existing_id, node_label)
            if info:
                print(f"  {stat_name}: {existing_id} -> \"{info['label']}\" [existing, OK]")
            else:
                print(f"  {stat_name}: {existing_id} NOT FOUND — will re-search")
                del stat_data["stato_id"]
                existing_id = None

        if existing_id:
            continue

        # Search Neo4j for a match
        result, match_type = find_stato_for_statistic(session, stat_name, description, node_label)

        if match_type in ("exact_label", "label_contains_desc", "label_or_alt_term", "definition_match"):
            # Unambiguous match
            print(f"  {stat_name}: {result['id']} -> \"{result['label']}\" [{match_type}]")
            stat_data["stato_id"] = result["id"]
            changes += 1
        elif match_type == "ambiguous":
            print(f"  {stat_name}: AMBIGUOUS — {len(result)} candidates (skipping):")
            for c in result[:5]:
                print(f"    {c['id']}: {c['label']}")
            skipped += 1
        else:
            print(f"  {stat_name}: no STATO match found")

    print(f"\n  {changes} statistics enriched with STATO IDs")
    if skipped:
        print(f"  {skipped} skipped (ambiguous — review manually)")

    if write_mode and changes > 0:
        write_json(vocab_path, vocab)
        print(f"  Wrote {vocab_path.relative_to(ROOT)}")


def enrich_methods(session, node_label, rel_type, write_mode):
    """Validate/add stato_mapping, add stato_class and stato_r_implementation."""
    print("\n=== Enriching Methods ===\n")

    index = load_json(LIB_DIR / "_index.json")
    index_changes = 0

    for entry in index["methods"]:
        oid = entry["oid"]
        filepath = LIB_DIR / entry["path"]
        method = load_json(filepath)
        stato_mapping = method.get("stato_mapping")
        method_changed = False

        print(f"\n  {oid} ({entry['name']}):")

        # --- Validate or search for STATO mapping ---
        if stato_mapping and stato_mapping != "UNMAPPED":
            info = validate_stato_id(session, stato_mapping, node_label)
            if info:
                print(f"    stato_mapping: {stato_mapping} -> \"{info['label']}\" [OK]")
            else:
                print(f"    stato_mapping: {stato_mapping} NOT FOUND in Neo4j!")
                continue
        elif stato_mapping == "UNMAPPED":
            # Try to find a match
            search_terms = [entry["name"], method.get("description", "")]
            candidates = search_stato_term(session, search_terms, node_label)
            if candidates:
                print(f"    UNMAPPED — candidates found:")
                for c in candidates[:3]:
                    print(f"      {c['id']}: {c['label']}")
            else:
                print(f"    UNMAPPED — no STATO candidates found")
            continue
        else:
            # No stato_mapping at all (derivation methods)
            search_terms = [entry["name"]]
            if method.get("description"):
                search_terms.append(method["description"])
            candidates = search_stato_term(session, search_terms, node_label)
            if candidates:
                print(f"    No mapping — candidates found:")
                for c in candidates[:3]:
                    print(f"      {c['id']}: {c['label']}")
            else:
                print(f"    No mapping — no STATO candidates")
            continue

        # --- At this point we have a valid stato_mapping. Enrich. ---

        # Remove old stato_hierarchy if present (replaced by stato_class)
        if "stato_hierarchy" in method:
            del method["stato_hierarchy"]
            method_changed = True

        # Add stato_class (immediate STATO parent, skipping OBI/BFO)
        parent = get_stato_parent(session, stato_mapping, node_label, rel_type)
        if parent:
            method["stato_class"] = parent
            method_changed = True
            print(f"    stato_class: {parent['id']} -> \"{parent['name']}\"")
        else:
            print(f"    stato_class: no STATO parent found")

        # Add stato_r_implementation
        if info and info.get("r_command"):
            method["stato_r_implementation"] = info["r_command"]
            method_changed = True
            print(f"    r_command: {info['r_command'][:60]}")
        else:
            print(f"    r_command: none in STATO")

        # Write method file (with preferred key ordering)
        if write_mode and method_changed:
            write_json(filepath, ordered_method(method))
            print(f"    Wrote {filepath.relative_to(ROOT)}")

        # Update index stato_mapping if needed
        if stato_mapping and stato_mapping != entry.get("stato_mapping"):
            entry["stato_mapping"] = stato_mapping
            index_changes += 1

    if write_mode and index_changes > 0:
        write_json(LIB_DIR / "_index.json", index)
        print(f"\n  Updated _index.json with {index_changes} stato_mapping entries")


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Enrich ACDC methods with STATO data from Neo4j")
    parser.add_argument("--write", action="store_true", help="Write changes to files (default: dry-run)")
    args = parser.parse_args()

    if not args.write:
        print("DRY RUN — pass --write to apply changes\n")

    print("=== ACDC STATO Enrichment ===\n")

    driver = get_driver()
    database = get_database()
    print(f"Connecting to Neo4j database: {database}")

    try:
        with driver.session(database=database) as session:
            # Detect schema
            print("\nDetecting Neo4j schema...")
            node_label, rel_type = detect_schema(session)

            # Enrich statistics
            enrich_statistics(session, node_label, args.write)

            # Enrich methods
            enrich_methods(session, node_label, rel_type, args.write)

    finally:
        driver.close()

    print("\n=== Done ===")
    if not args.write:
        print("(dry run — no files modified)")


if __name__ == "__main__":
    main()
