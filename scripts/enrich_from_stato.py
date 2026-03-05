#!/usr/bin/env python3
"""
Enrich ACDC method library and statistics vocabulary with STATO ontology data from Neo4j.

Requires: Neo4j running locally with STATO loaded (via load_stato_owl.py).

Operations:
  1. Add STATO codings to statistics in statistics_vocabulary.json
  2. Validate existing + fill missing STATO codings on methods
  3. Add parent class coding to each mapped method
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
STATO_SYSTEM = "http://purl.obolibrary.org/obo/stato"

METHOD_KEY_ORDER = [
    "$schema", "schema_version", "$vocabulary",
    "oid", "name", "type", "class", "intent",
    "codings", "stato_r_implementation",
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


def to_neo4j_id(code):
    """Convert file code (STATO_0000179) to Neo4j stato_id (STATO:0000179)."""
    return code.replace("STATO_", "STATO:") if code else code


def to_file_code(neo4j_id):
    """Convert Neo4j stato_id (STATO:0000179) to file code (STATO_0000179)."""
    return neo4j_id.replace("STATO:", "STATO_") if neo4j_id else neo4j_id


def get_stato_coding(codings):
    """Extract the STATO coding from a codings array, if present."""
    for c in (codings or []):
        if c.get("system") == STATO_SYSTEM:
            return c.get("code")
    return None


def enrich_statistics(session, node_label, write_mode):
    """Add STATO codings to statistics_vocabulary.json by querying Neo4j."""
    print("\n=== Enriching Statistics Vocabulary ===\n")

    vocab_path = MODEL_DIR / "statistics_vocabulary.json"
    vocab = load_json(vocab_path)
    stats = vocab["statistics"]
    changes = 0
    skipped = 0

    for stat_name, stat_data in stats.items():
        description = stat_data.get("description", "")
        existing_code = get_stato_coding(stat_data.get("codings"))

        # If already has a STATO coding, validate it
        if existing_code:
            info = validate_stato_id(session, to_neo4j_id(existing_code), node_label)
            if info:
                print(f"  {stat_name}: {existing_code} -> \"{info['label']}\" [existing, OK]")
            else:
                print(f"  {stat_name}: {existing_code} NOT FOUND — will re-search")
                stat_data["codings"] = [c for c in stat_data["codings"]
                                        if c.get("system") != STATO_SYSTEM]
                existing_code = None

        if existing_code:
            continue

        # Search Neo4j for a match
        result, match_type = find_stato_for_statistic(session, stat_name, description, node_label)

        if match_type in ("exact_label", "label_contains_desc", "label_or_alt_term", "definition_match"):
            # Unambiguous match
            print(f"  {stat_name}: {result['id']} -> \"{result['label']}\" [{match_type}]")
            codings = stat_data.get("codings", []) or []
            codings.append({
                "system": STATO_SYSTEM,
                "code": to_file_code(result["id"]),
                "display": result["label"],
            })
            stat_data["codings"] = codings
            changes += 1
        elif match_type == "ambiguous":
            print(f"  {stat_name}: AMBIGUOUS — {len(result)} candidates (skipping):")
            for c in result[:5]:
                print(f"    {c['id']}: {c['label']}")
            skipped += 1
        else:
            print(f"  {stat_name}: no STATO match found")

    print(f"\n  {changes} statistics enriched with STATO codings")
    if skipped:
        print(f"  {skipped} skipped (ambiguous — review manually)")

    if write_mode and changes > 0:
        write_json(vocab_path, vocab)
        print(f"  Wrote {vocab_path.relative_to(ROOT)}")


def enrich_methods(session, node_label, rel_type, write_mode):
    """Validate/add STATO codings and stato_r_implementation on methods."""
    print("\n=== Enriching Methods ===\n")

    index = load_json(LIB_DIR / "_index.json")
    index_changes = 0

    for entry in index["methods"]:
        oid = entry["oid"]
        filepath = LIB_DIR / entry["path"]
        method = load_json(filepath)
        codings = method.get("codings", []) or []
        stato_code = get_stato_coding(codings)
        method_changed = False

        print(f"\n  {oid} ({entry['name']}):")

        # --- Validate or search for STATO mapping ---
        if stato_code:
            info = validate_stato_id(session, to_neo4j_id(stato_code), node_label)
            if info:
                print(f"    coding: {stato_code} -> \"{info['label']}\" [OK]")
            else:
                print(f"    coding: {stato_code} NOT FOUND in Neo4j!")
                continue
        else:
            # No STATO coding — try to find a match
            search_terms = [entry["name"]]
            if method.get("description"):
                search_terms.append(method["description"])
            candidates = search_stato_term(session, search_terms, node_label)
            if candidates:
                print(f"    No coding — candidates found:")
                for c in candidates[:3]:
                    print(f"      {c['id']}: {c['label']}")
            else:
                print(f"    No coding — no STATO candidates")
            continue

        # --- At this point we have a valid STATO coding. Enrich. ---

        # Remove old fields if present (migration cleanup)
        for old_field in ("stato_hierarchy", "stato_mapping", "stato_class"):
            if old_field in method:
                del method[old_field]
                method_changed = True

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

        # Update index codings if needed
        entry_code = get_stato_coding(entry.get("codings"))
        if stato_code and stato_code != entry_code:
            entry["codings"] = [{"system": STATO_SYSTEM, "code": to_file_code(stato_code)}]
            index_changes += 1

    if write_mode and index_changes > 0:
        write_json(LIB_DIR / "_index.json", index)
        print(f"\n  Updated _index.json with {index_changes} coding entries")


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
