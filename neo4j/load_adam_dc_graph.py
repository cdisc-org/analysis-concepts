#!/usr/bin/env python3
"""
Load ADaM and DataConcept model data into Neo4j.

This script loads:
1. ADaM Class Datasets and Variables from adam-class-var.csv
2. DataConcepts from dc-model.json
3. ADaM Datasets and Variables from adam-dataset.csv and adam-var.csv

And creates relationships:
- (ADaM Class Dataset)-[:CONTAINS]->(ADaM Class Variable)
- (ADaM Class Variable)-[:IS_A]->(DataConcept)
- (ADaM Dataset)-[:CONTAINS]->(ADaM Variable)
- (ADaM Variable)-[:OF_CLASS]->(ADaM Class Variable)
"""

import csv
import json
import re
from pathlib import Path

from dotenv import load_dotenv
import os

from neo4j import GraphDatabase


def get_driver():
    """Create Neo4j driver from environment variables."""
    load_dotenv()
    uri = os.getenv("NEO4J_URI", "").strip("'\"")
    username = os.getenv("NEO4J_USERNAME", "").strip("'\"")
    password = os.getenv("NEO4J_PASSWORD", "").strip("'\"")
    return GraphDatabase.driver(uri, auth=(username, password))


def get_database():
    """Get database name from environment."""
    load_dotenv()
    return os.getenv("NEO4J_DATABASE", "neo4j").strip("'\"")


def clear_graph(session):
    """Clear all nodes and relationships from the graph."""
    print("Clearing existing graph data...")
    session.run("MATCH (n) DETACH DELETE n")


def load_adam_class_datasets(session, csv_path: Path):
    """Load ADaM Class Dataset nodes from adam-class-dataset.csv."""
    print(f"Loading ADaM Class Datasets from {csv_path}...")

    datasets = []

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ds_name = row.get("Data Structure Name", "").strip()
            if ds_name:
                datasets.append({
                    "name": ds_name,
                    "description": row.get("Data Structure Description", "").strip(),
                    "class": row.get("Class", "").strip(),
                    "subclass": row.get("Subclass", "").strip(),
                    "version": row.get("Version", "").strip(),
                })

    # Create ADaM Class Dataset nodes
    print(f"  Creating {len(datasets)} ADaM Class Dataset nodes...")
    for ds in datasets:
        session.run(
            """
            MERGE (d:`ADaM Class Dataset` {name: $name})
            SET d.description = $description,
                d.class = $class,
                d.subclass = $subclass,
                d.version = $version
            """,
            name=ds["name"],
            description=ds["description"],
            **{"class": ds["class"]},
            subclass=ds["subclass"],
            version=ds["version"],
        )

    return datasets


def load_adam_class_data(session, csv_path: Path):
    """Load ADaM Class Variables from adam-class-var.csv."""
    print(f"Loading ADaM Class Variables from {csv_path}...")

    variables = []

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ds_name = row.get("Data Structure Name", "").strip()
            var_name = row.get("Variable Name", "").strip()

            if var_name:
                variables.append({
                    "dataset": ds_name,
                    "name": var_name,
                    "label": row.get("Variable Label", "").strip(),
                    "type": row.get("Type", "").strip(),
                    "core": row.get("Core", "").strip(),
                    "variable_set": row.get("Variable Set", "").strip(),
                })

    # Create ADaM Class Variable nodes
    print(f"  Creating {len(variables)} ADaM Class Variable nodes...")
    for var in variables:
        session.run(
            """
            MERGE (v:`ADaM Class Variable` {name: $name})
            SET v.label = $label,
                v.type = $type,
                v.core = $core,
                v.variable_set = $variable_set,
                v.dataset = $dataset
            """,
            name=var["name"],
            label=var["label"],
            type=var["type"],
            core=var["core"],
            variable_set=var["variable_set"],
            dataset=var["dataset"],
        )

    # Create CONTAINS relationships (ADaM Class Dataset -> ADaM Class Variable)
    print("  Creating CONTAINS relationships (Class Dataset -> Class Variable)...")
    for var in variables:
        if var["dataset"]:
            session.run(
                """
                MATCH (d:`ADaM Class Dataset` {name: $ds_name})
                MATCH (v:`ADaM Class Variable` {name: $var_name})
                MERGE (d)-[:CONTAINS]->(v)
                """,
                ds_name=var["dataset"],
                var_name=var["name"],
            )

    return variables


def load_data_concepts_and_categories(session, json_path: Path):
    """Load Category and DataConcept nodes from dc-model.json (JSONL format)."""
    print(f"Loading Categories and DataConcepts from {json_path}...")

    categories = []
    concepts = []

    with open(json_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)

            if obj.get("type") != "node":
                continue

            labels = obj.get("labels", [])
            props = obj.get("properties", {})

            # Check for Category nodes
            if "Category" in labels and "DataConcept" not in labels:
                categories.append({
                    "name": props.get("name", ""),
                    "description": props.get("description", ""),
                    "color": props.get("color", ""),
                })

            # Check for DataConcept nodes
            if "DataConcept" in labels:
                concepts.append({
                    "name": props.get("name", ""),
                    "description": props.get("description", ""),
                    "data_type": props.get("data_type", ""),
                    "category": props.get("category", ""),
                    "pattern": props.get("pattern", ""),
                    "adam_variables": props.get("adam_variables", []),
                })

    # Create Category nodes
    print(f"  Creating {len(categories)} Category nodes...")
    for cat in categories:
        session.run(
            """
            MERGE (c:Category {name: $name})
            SET c.description = $description,
                c.color = $color
            """,
            name=cat["name"],
            description=cat["description"],
            color=cat["color"],
        )

    # Create DataConcept nodes
    print(f"  Creating {len(concepts)} DataConcept nodes...")
    for dc in concepts:
        session.run(
            """
            MERGE (c:DataConcept {name: $name})
            SET c.description = $description,
                c.data_type = $data_type,
                c.category = $category,
                c.pattern = $pattern,
                c.adam_variables = $adam_variables
            """,
            name=dc["name"],
            description=dc["description"],
            data_type=dc["data_type"],
            category=dc["category"],
            pattern=dc["pattern"],
            adam_variables=dc["adam_variables"],
        )

    return concepts


def load_data_concept_relationships(session, json_path: Path):
    """Load relationships between DataConcept/Category nodes from dc-model.json."""
    print(f"Loading DataConcept relationships from {json_path}...")

    relationships = []

    with open(json_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)

            if obj.get("type") != "relationship":
                continue

            label = obj.get("label", "")
            start_props = obj.get("start", {}).get("properties", {})
            end_props = obj.get("end", {}).get("properties", {})
            rel_props = obj.get("properties", {})

            # Determine start/end node types based on labels
            start_labels = obj.get("start", {}).get("labels", [])
            end_labels = obj.get("end", {}).get("labels", [])

            relationships.append({
                "label": label,
                "start_name": start_props.get("name", ""),
                "start_labels": start_labels,
                "end_name": end_props.get("name", ""),
                "end_labels": end_labels,
                "properties": rel_props,
            })

    print(f"  Creating {len(relationships)} DataConcept relationships...")
    count = 0
    for rel in relationships:
        # Determine start node label for MATCH
        if "Category" in rel["start_labels"] and "DataConcept" not in rel["start_labels"]:
            start_label = "Category"
        else:
            start_label = "DataConcept"

        # Determine end node label for MATCH
        if "Category" in rel["end_labels"] and "DataConcept" not in rel["end_labels"]:
            end_label = "Category"
        else:
            end_label = "DataConcept"

        # Build properties string for Cypher
        props_str = ""
        if rel["properties"]:
            props_items = []
            for k, v in rel["properties"].items():
                if isinstance(v, str):
                    props_items.append(f'{k}: "{v}"')
                else:
                    props_items.append(f'{k}: {json.dumps(v)}')
            props_str = " {" + ", ".join(props_items) + "}"

        # Use dynamic relationship type with APOC or raw Cypher
        # Since relationship type is dynamic, we need to handle each type
        query = f"""
        MATCH (s:{start_label} {{name: $start_name}})
        MATCH (e:{end_label} {{name: $end_name}})
        MERGE (s)-[r:`{rel['label']}`]->(e)
        """

        # Set properties if any
        if rel["properties"]:
            query += "\nSET r += $props"
            session.run(query, start_name=rel["start_name"], end_name=rel["end_name"], props=rel["properties"])
        else:
            session.run(query, start_name=rel["start_name"], end_name=rel["end_name"])

        count += 1

    print(f"  Created {count} relationships")


def create_is_a_relationships(session, concepts: list):
    """Create IS_A relationships from ADaM Class Variable to DataConcept."""
    print("Creating IS_A relationships (ADaM Class Variable -> DataConcept)...")

    count = 0
    for dc in concepts:
        adam_vars = dc.get("adam_variables", [])
        for var_name in adam_vars:
            # Skip SDTM references
            if var_name.startswith("SDTM."):
                continue

            result = session.run(
                """
                MATCH (v:`ADaM Class Variable` {name: $var_name})
                MATCH (c:DataConcept {name: $dc_name})
                MERGE (v)-[:IS_A]->(c)
                RETURN count(*) as cnt
                """,
                var_name=var_name,
                dc_name=dc["name"],
            )
            record = result.single()
            if record and record["cnt"] > 0:
                count += 1

    print(f"  Created {count} IS_A relationships")


def load_adam_datasets(session, csv_path: Path):
    """Load ADaM Dataset nodes from adam-dataset.csv."""
    print(f"Loading ADaM Datasets from {csv_path}...")

    datasets = []

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ds_name = row.get("Dataset", "").strip()
            if ds_name:
                datasets.append({
                    "name": ds_name,
                    "description": row.get("Dataset Description", "").strip(),
                    "class": row.get("Class", "").strip(),
                    "structure": row.get("Structure", "").strip(),
                    "keys": row.get("Keys", "").strip(),
                })

    # Create ADaM Dataset nodes
    print(f"  Creating {len(datasets)} ADaM Dataset nodes...")
    for ds in datasets:
        session.run(
            """
            MERGE (d:`ADaM Dataset` {name: $name})
            SET d.description = $description,
                d.class = $class,
                d.structure = $structure,
                d.keys = $keys
            """,
            name=ds["name"],
            description=ds["description"],
            **{"class": ds["class"]},
            structure=ds["structure"],
            keys=ds["keys"],
        )

    return datasets


def load_adam_variables(session, csv_path: Path):
    """Load ADaM Variable nodes from adam-var.csv."""
    print(f"Loading ADaM Variables from {csv_path}...")

    variables = []

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            var_name = row.get("Variable", "").strip()
            ds_name = row.get("Dataset", "").strip()
            if var_name and ds_name:
                variables.append({
                    "name": var_name,
                    "dataset": ds_name,
                    "label": row.get("Variable Label", "").strip(),
                    "type": row.get("Type", "").strip(),
                    "length": row.get("Length", "").strip(),
                    "display_format": row.get("Display Format", "").strip(),
                    "controlled_terms": row.get("Controlled Terms", "").strip(),
                })

    # Create ADaM Variable nodes (unique by name + dataset)
    print(f"  Creating {len(variables)} ADaM Variable nodes...")
    for var in variables:
        session.run(
            """
            MERGE (v:`ADaM Variable` {name: $name, dataset: $dataset})
            SET v.label = $label,
                v.type = $type,
                v.length = $length,
                v.display_format = $display_format,
                v.controlled_terms = $controlled_terms
            """,
            name=var["name"],
            dataset=var["dataset"],
            label=var["label"],
            type=var["type"],
            length=var["length"],
            display_format=var["display_format"],
            controlled_terms=var["controlled_terms"],
        )

    # Create CONTAINS relationships (ADaM Dataset -> ADaM Variable)
    print("  Creating CONTAINS relationships (ADaM Dataset -> ADaM Variable)...")
    for var in variables:
        session.run(
            """
            MATCH (d:`ADaM Dataset` {name: $ds_name})
            MATCH (v:`ADaM Variable` {name: $var_name, dataset: $ds_name})
            MERGE (d)-[:CONTAINS]->(v)
            """,
            ds_name=var["dataset"],
            var_name=var["name"],
        )

    return variables


def build_pattern_lookup(class_variables: list):
    """
    Build a lookup from regex patterns to ADaM Class Variable names.

    Scans ALL ADaM Class Variables for lowercase placeholders:
    - y: one or more digits (e.g., AGEGRy -> AGEGR1, AGEGR2)
    - xx: two digits (e.g., TRTxxP -> TRT01P, TRT02P)
    - zz: two digits (e.g., ANLzzFL -> ANL01FL)
    - w: one or more digits (e.g., STRATwR -> STRAT1R)
    - x: single digit (must be processed last)
    """
    pattern_lookup = {}  # regex_pattern -> class variable name

    # Create a set of all class variable names for exact matching
    class_var_names = {v["name"] for v in class_variables}

    # Build patterns from ALL class variables that contain lowercase letters
    for var in class_variables:
        var_name = var["name"]

        # Skip variables starting with -- (handled by suffix matching)
        if var_name.startswith("--"):
            continue

        # Check if variable name contains any lowercase letters (placeholders)
        if re.search(r"[a-z]", var_name):
            # Convert template to regex
            # Order matters: xx before x, zz before z
            regex = var_name
            regex = regex.replace("xx", r"(\d{2})")
            regex = regex.replace("zz", r"(\d{2})")
            regex = regex.replace("y", r"(\d+)")
            regex = regex.replace("w", r"(\d+)")
            regex = regex.replace("x", r"(\d)")
            regex = f"^{regex}$"

            pattern_lookup[regex] = var_name

    return pattern_lookup, class_var_names


def build_suffix_lookup(class_variables: list):
    """
    Build a lookup from suffixes to ADaM Class Variable names starting with --.

    For example: {"SEQ": "--SEQ", "TERM": "--TERM", "DECOD": "--DECOD"}
    This allows matching ADaM Variables like AESEQ, AETERM, AEDECOD to their class variables.
    """
    suffix_lookup = {}
    for var in class_variables:
        var_name = var["name"]
        if var_name.startswith("--"):
            suffix = var_name[2:]  # Remove the -- prefix
            suffix_lookup[suffix] = var_name
    return suffix_lookup


def create_of_class_relationships(session, adam_variables: list, class_variables: list):
    """Create OF_CLASS relationships from ADaM Variable to ADaM Class Variable."""
    print("Creating OF_CLASS relationships (ADaM Variable -> ADaM Class Variable)...")

    pattern_lookup, class_var_names = build_pattern_lookup(class_variables)
    suffix_lookup = build_suffix_lookup(class_variables)

    # Compile regex patterns
    compiled_patterns = {re.compile(p): var_name for p, var_name in pattern_lookup.items()}

    # Sort suffixes by length (longest first) to match most specific suffix
    sorted_suffixes = sorted(suffix_lookup.keys(), key=len, reverse=True)

    count = 0
    for var in adam_variables:
        var_name = var["name"]
        matched = False

        # 1. First try exact match with class variable name
        if var_name in class_var_names:
            result = session.run(
                """
                MATCH (v:`ADaM Variable` {name: $var_name, dataset: $dataset})
                MATCH (cv:`ADaM Class Variable` {name: $class_var_name})
                MERGE (v)-[:OF_CLASS]->(cv)
                RETURN count(*) as cnt
                """,
                var_name=var_name,
                dataset=var["dataset"],
                class_var_name=var_name,
            )
            record = result.single()
            if record and record["cnt"] > 0:
                count += 1
                matched = True

        # 2. If no exact match, try suffix matching (for --<suffix> class variables)
        if not matched:
            for suffix in sorted_suffixes:
                if var_name.endswith(suffix):
                    class_var_name = suffix_lookup[suffix]
                    result = session.run(
                        """
                        MATCH (v:`ADaM Variable` {name: $var_name, dataset: $dataset})
                        MATCH (cv:`ADaM Class Variable` {name: $class_var_name})
                        MERGE (v)-[:OF_CLASS]->(cv)
                        RETURN count(*) as cnt
                        """,
                        var_name=var_name,
                        dataset=var["dataset"],
                        class_var_name=class_var_name,
                    )
                    record = result.single()
                    if record and record["cnt"] > 0:
                        count += 1
                        matched = True
                    break

        # 3. If no exact or suffix match, try placeholder pattern matching
        if not matched:
            for pattern, class_var_name in compiled_patterns.items():
                if pattern.match(var_name):
                    result = session.run(
                        """
                        MATCH (v:`ADaM Variable` {name: $var_name, dataset: $dataset})
                        MATCH (cv:`ADaM Class Variable` {name: $class_var_name})
                        MERGE (v)-[:OF_CLASS]->(cv)
                        RETURN count(*) as cnt
                        """,
                        var_name=var_name,
                        dataset=var["dataset"],
                        class_var_name=class_var_name,
                    )
                    record = result.single()
                    if record and record["cnt"] > 0:
                        count += 1
                        matched = True
                    break

    print(f"  Created {count} OF_CLASS relationships")


def main():
    script_dir = Path(__file__).parent
    adam_model_dir = script_dir / "data" / "metadata" / "adam-model"
    concept_model_dir = script_dir / "data" / "metadata" / "concept-model"

    # Load environment from neo4j/.env
    env_path = script_dir / ".env"
    load_dotenv(env_path)

    driver = get_driver()
    database = get_database()

    print(f"Connecting to Neo4j database: {database}")

    with driver.session(database=database) as session:
        # Clear existing data
        clear_graph(session)

        # Load ADaM Class data (datasets from adam-class-dataset.csv, variables from adam-class-var.csv)
        load_adam_class_datasets(session, adam_model_dir / "adam-class-dataset.csv")
        class_variables = load_adam_class_data(
            session, adam_model_dir / "adam-class-var.csv"
        )

        # Load Categories and DataConcepts
        concepts = load_data_concepts_and_categories(
            session, concept_model_dir / "dc-model.json"
        )

        # Load DataConcept relationships
        load_data_concept_relationships(session, concept_model_dir / "dc-model.json")

        # Create IS_A relationships (ADaM Class Variable -> DataConcept)
        create_is_a_relationships(session, concepts)

        # Load ADaM Datasets
        load_adam_datasets(session, adam_model_dir / "adam-dataset.csv")

        # Load ADaM Variables
        adam_variables = load_adam_variables(session, adam_model_dir / "adam-var.csv")

        # Create OF_CLASS relationships (ADaM Variable -> ADaM Class Variable)
        create_of_class_relationships(session, adam_variables, class_variables)

    driver.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
