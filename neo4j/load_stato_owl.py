#!/usr/bin/env python3
"""
OWL to Neo4j Loader for STATO Ontology.

Reads an OWL ontology file (STATO) and loads the class hierarchy into Neo4j.
Creates a Library node for STATO and links all classes to it.
"""

from owlready2 import get_ontology, Thing
from neo4j import GraphDatabase
from pathlib import Path
from dotenv import load_dotenv
import os


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


class OWLToNeo4jLoader:
    """Loads OWL ontology into Neo4j database."""

    # Ontology metadata for Library nodes
    ONTOLOGY_INFO = {
        "STATO": {
            "description": "STATO is the statistical methods ontology. It contains concepts and properties related to statistical methods, probability distributions and other concepts related to statistical analysis.",
            "homepage": "http://stato-ontology.org/",
        },
        "OBI": {
            "description": "Ontology for Biomedical Investigations. An integrated ontology for the description of biological and clinical investigations.",
            "homepage": "http://obi-ontology.org/",
        },
        "IAO": {
            "description": "Information Artifact Ontology. An ontology of information entities.",
            "homepage": "https://github.com/information-artifact-ontology/IAO",
        },
        "BFO": {
            "description": "Basic Formal Ontology. A small, upper level ontology designed for use in supporting information retrieval, analysis and integration in scientific and other domains.",
            "homepage": "https://basic-formal-ontology.org/",
        },
        "CHEBI": {
            "description": "Chemical Entities of Biological Interest. A dictionary of molecular entities focused on small chemical compounds.",
            "homepage": "https://www.ebi.ac.uk/chebi/",
        },
        "GO": {
            "description": "Gene Ontology. The world's largest source of information on the functions of genes.",
            "homepage": "http://geneontology.org/",
        },
        "UO": {
            "description": "Units of Measurement Ontology. Metrical units for use in conjunction with PATO.",
            "homepage": "https://github.com/bio-ontology-research-group/unit-ontology",
        },
        "CL": {
            "description": "Cell Ontology. An ontology of cell types.",
            "homepage": "https://obophenotype.github.io/cell-ontology/",
        },
        "UBERON": {
            "description": "Uberon Anatomy Ontology. An integrated cross-species anatomy ontology.",
            "homepage": "http://uberon.org/",
        },
        "REO": {
            "description": "Reagent Ontology. An ontology of reagents used in biomedical research.",
            "homepage": "https://github.com/OBOFoundry/purl.obolibrary.org/",
        },
        "PATO": {
            "description": "Phenotype And Trait Ontology. An ontology of phenotypic qualities.",
            "homepage": "https://github.com/pato-ontology/pato",
        },
        "SO": {
            "description": "Sequence Ontology. An ontology of sequence features.",
            "homepage": "http://www.sequenceontology.org/",
        },
        "PR": {
            "description": "Protein Ontology. An ontology of proteins and protein-related entities.",
            "homepage": "https://proconsortium.org/",
        },
        "OGMS": {
            "description": "Ontology for General Medical Science. An ontology of entities involved in a clinical encounter.",
            "homepage": "https://github.com/OGMS/ogms",
        },
    }

    def __init__(self, driver, database: str):
        self.driver = driver
        self.database = database
        self.ontology = None
        self.library_name = "STATO"

    def load_ontology(self, owl_path: Path):
        """Load the OWL file."""
        print(f"Loading ontology from: {owl_path}")
        # Convert to file URI for owlready2
        file_uri = f"file://{owl_path.absolute()}"
        self.ontology = get_ontology(file_uri).load()
        print(f"Loaded ontology: {self.ontology.base_iri}")

    def create_constraints(self, session):
        """Create constraints for unique URIs."""
        session.run("""
            CREATE CONSTRAINT owl_class_uri IF NOT EXISTS
            FOR (c:OWLClass) REQUIRE c.uri IS UNIQUE
        """)
        session.run("""
            CREATE CONSTRAINT owl_property_uri IF NOT EXISTS
            FOR (p:OWLProperty) REQUIRE p.uri IS UNIQUE
        """)
        session.run("""
            CREATE CONSTRAINT owl_individual_uri IF NOT EXISTS
            FOR (i:OWLIndividual) REQUIRE i.uri IS UNIQUE
        """)
        session.run("""
            CREATE CONSTRAINT library_name IF NOT EXISTS
            FOR (l:Library) REQUIRE l.name IS UNIQUE
        """)
        print("Created constraints")

    def extract_ontology_prefix(self, uri: str) -> str:
        """Extract the ontology prefix from an OBO URI (e.g., 'STATO' from 'http://purl.obolibrary.org/obo/STATO_0000001')."""
        if "purl.obolibrary.org/obo/" in uri:
            # Extract the part after /obo/ and before the underscore
            suffix = uri.split("/obo/")[-1]
            if "_" in suffix:
                return suffix.split("_")[0]
        return None

    def create_library_nodes(self, session):
        """Create Library nodes for STATO and all imported ontologies."""
        print("Creating Library nodes...")

        # Collect all ontology prefixes from loaded classes
        prefixes = set()
        for cls in self.ontology.classes():
            prefix = self.extract_ontology_prefix(str(cls.iri))
            if prefix:
                prefixes.add(prefix)

        # Create Library node for each ontology
        for prefix in prefixes:
            info = self.ONTOLOGY_INFO.get(prefix, {
                "description": f"Imported ontology: {prefix}",
                "homepage": f"http://purl.obolibrary.org/obo/{prefix.lower()}.owl",
            })

            session.run("""
                MERGE (l:Library {name: $name})
                SET l.description = $description,
                    l.homepage = $homepage,
                    l.source = $source
            """,
                name=prefix,
                description=info["description"],
                homepage=info["homepage"],
                source="OBO Foundry" if prefix != "STATO" else "STATO Ontology"
            )

        print(f"  Created {len(prefixes)} Library nodes: {sorted(prefixes)}")

        # Create IMPORTS relationships from STATO to other ontologies
        imported = prefixes - {"STATO"}
        for prefix in imported:
            session.run("""
                MATCH (stato:Library {name: 'STATO'})
                MATCH (imported:Library {name: $prefix})
                MERGE (stato)-[:IMPORTS]->(imported)
            """, prefix=prefix)

        print(f"  Created {len(imported)} IMPORTS relationships")

    def get_annotations(self, entity) -> dict:
        """Extract common annotations from an OWL entity."""
        annotations = {}

        # Label (rdfs:label)
        if hasattr(entity, 'label') and entity.label:
            labels = list(entity.label)
            annotations['label'] = labels[0] if labels else None

        # Comment (rdfs:comment)
        if hasattr(entity, 'comment') and entity.comment:
            comments = list(entity.comment)
            annotations['comment'] = comments[0] if comments else None

        # IAO definition (IAO_0000115 - common in OBO ontologies)
        if hasattr(entity, 'IAO_0000115'):
            defs = list(entity.IAO_0000115)
            annotations['definition'] = defs[0] if defs else None

        # Editor preferred label (IAO_0000111)
        if hasattr(entity, 'IAO_0000111'):
            pref_labels = list(entity.IAO_0000111)
            annotations['preferred_label'] = pref_labels[0] if pref_labels else None

        return annotations

    def import_classes(self, session):
        """Import all OWL classes."""
        print("Importing classes...")
        count = 0

        for cls in self.ontology.classes():
            annotations = self.get_annotations(cls)

            session.run("""
                MERGE (c:OWLClass {uri: $uri})
                SET c.name = $name,
                    c.label = $label,
                    c.comment = $comment,
                    c.definition = $definition,
                    c.preferred_label = $preferred_label,
                    c.namespace = $namespace
            """,
                uri=str(cls.iri),
                name=cls.name,
                label=annotations.get('label'),
                comment=annotations.get('comment'),
                definition=annotations.get('definition'),
                preferred_label=annotations.get('preferred_label'),
                namespace=str(cls.namespace.base_iri) if cls.namespace else None
            )
            count += 1

        print(f"  Imported {count} classes")
        return count

    def link_classes_to_library(self, session):
        """Link all OWL classes to their respective Library nodes."""
        print("Linking classes to Library nodes...")
        total_count = 0

        # Get all ontology prefixes that have Library nodes
        result = session.run("MATCH (l:Library) RETURN l.name as name")
        prefixes = [record["name"] for record in result]

        for prefix in prefixes:
            uri_pattern = f"http://purl.obolibrary.org/obo/{prefix}_"
            result = session.run("""
                MATCH (l:Library {name: $prefix})
                MATCH (c:OWLClass)
                WHERE c.uri STARTS WITH $uri_pattern
                MERGE (c)-[:BELONGS_TO]->(l)
                RETURN count(*) as cnt
            """, prefix=prefix, uri_pattern=uri_pattern)

            record = result.single()
            count = record['cnt'] if record else 0
            if count > 0:
                print(f"  Linked {count} {prefix} classes")
                total_count += count

        print(f"  Total: {total_count} classes linked to Library nodes")

    def import_class_hierarchy(self, session):
        """Import subClassOf relationships."""
        print("Importing class hierarchy...")
        count = 0

        for cls in self.ontology.classes():
            for parent in cls.is_a:
                # Skip Thing and restrictions (only handle named classes)
                if hasattr(parent, 'iri') and parent is not Thing:
                    session.run("""
                        MATCH (child:OWLClass {uri: $child_uri})
                        MATCH (parent:OWLClass {uri: $parent_uri})
                        MERGE (child)-[:SUBCLASS_OF]->(parent)
                    """,
                        child_uri=str(cls.iri),
                        parent_uri=str(parent.iri)
                    )
                    count += 1

        print(f"  Imported {count} subClassOf relationships")
        return count

    def import_object_properties(self, session):
        """Import OWL object properties."""
        print("Importing object properties...")
        count = 0

        for prop in self.ontology.object_properties():
            annotations = self.get_annotations(prop)

            # Get domain and range
            domains = [str(d.iri) for d in prop.domain if hasattr(d, 'iri')]
            ranges = [str(r.iri) for r in prop.range if hasattr(r, 'iri')]

            session.run("""
                MERGE (p:OWLProperty:ObjectProperty {uri: $uri})
                SET p.name = $name,
                    p.label = $label,
                    p.comment = $comment,
                    p.definition = $definition,
                    p.domains = $domains,
                    p.ranges = $ranges
            """,
                uri=str(prop.iri),
                name=prop.name,
                label=annotations.get('label'),
                comment=annotations.get('comment'),
                definition=annotations.get('definition'),
                domains=domains,
                ranges=ranges
            )
            count += 1

        print(f"  Imported {count} object properties")
        return count

    def import_data_properties(self, session):
        """Import OWL data properties."""
        print("Importing data properties...")
        count = 0

        for prop in self.ontology.data_properties():
            annotations = self.get_annotations(prop)

            domains = [str(d.iri) for d in prop.domain if hasattr(d, 'iri')]

            session.run("""
                MERGE (p:OWLProperty:DataProperty {uri: $uri})
                SET p.name = $name,
                    p.label = $label,
                    p.comment = $comment,
                    p.definition = $definition,
                    p.domains = $domains
            """,
                uri=str(prop.iri),
                name=prop.name,
                label=annotations.get('label'),
                comment=annotations.get('comment'),
                definition=annotations.get('definition'),
                domains=domains
            )
            count += 1

        print(f"  Imported {count} data properties")
        return count

    def link_properties_to_classes(self, session):
        """Create HAS_DOMAIN and HAS_RANGE relationships from properties to classes."""
        print("Linking properties to classes...")
        domain_count = 0
        range_count = 0

        # Link object properties to their domains and ranges
        for prop in self.ontology.object_properties():
            prop_uri = str(prop.iri)

            # Create HAS_DOMAIN relationships
            for domain in prop.domain:
                if hasattr(domain, 'iri'):
                    result = session.run("""
                        MATCH (p:OWLProperty {uri: $prop_uri})
                        MATCH (c:OWLClass {uri: $class_uri})
                        MERGE (p)-[:HAS_DOMAIN]->(c)
                        RETURN count(*) as cnt
                    """,
                        prop_uri=prop_uri,
                        class_uri=str(domain.iri)
                    )
                    if result.single()['cnt'] > 0:
                        domain_count += 1

            # Create HAS_RANGE relationships
            for range_cls in prop.range:
                if hasattr(range_cls, 'iri'):
                    result = session.run("""
                        MATCH (p:OWLProperty {uri: $prop_uri})
                        MATCH (c:OWLClass {uri: $class_uri})
                        MERGE (p)-[:HAS_RANGE]->(c)
                        RETURN count(*) as cnt
                    """,
                        prop_uri=prop_uri,
                        class_uri=str(range_cls.iri)
                    )
                    if result.single()['cnt'] > 0:
                        range_count += 1

        # Link data properties to their domains
        for prop in self.ontology.data_properties():
            prop_uri = str(prop.iri)

            for domain in prop.domain:
                if hasattr(domain, 'iri'):
                    result = session.run("""
                        MATCH (p:OWLProperty {uri: $prop_uri})
                        MATCH (c:OWLClass {uri: $class_uri})
                        MERGE (p)-[:HAS_DOMAIN]->(c)
                        RETURN count(*) as cnt
                    """,
                        prop_uri=prop_uri,
                        class_uri=str(domain.iri)
                    )
                    if result.single()['cnt'] > 0:
                        domain_count += 1

        print(f"  Created {domain_count} HAS_DOMAIN relationships")
        print(f"  Created {range_count} HAS_RANGE relationships")

    def import_individuals(self, session):
        """Import OWL individuals/instances."""
        print("Importing individuals...")
        count = 0

        for individual in self.ontology.individuals():
            annotations = self.get_annotations(individual)

            # Create individual node
            session.run("""
                MERGE (i:OWLIndividual {uri: $uri})
                SET i.name = $name,
                    i.label = $label,
                    i.comment = $comment
            """,
                uri=str(individual.iri),
                name=individual.name,
                label=annotations.get('label'),
                comment=annotations.get('comment')
            )

            # Link to classes (rdf:type)
            for cls in individual.is_a:
                if hasattr(cls, 'iri'):
                    session.run("""
                        MATCH (i:OWLIndividual {uri: $ind_uri})
                        MATCH (c:OWLClass {uri: $class_uri})
                        MERGE (i)-[:INSTANCE_OF]->(c)
                    """,
                        ind_uri=str(individual.iri),
                        class_uri=str(cls.iri)
                    )

            count += 1

        print(f"  Imported {count} individuals")
        return count

    def import_all(self):
        """Run full import."""
        with self.driver.session(database=self.database) as session:
            self.create_constraints(session)
            self.import_classes(session)
            self.create_library_nodes(session)
            self.link_classes_to_library(session)
            self.import_class_hierarchy(session)
            self.import_object_properties(session)
            self.import_data_properties(session)
            self.link_properties_to_classes(session)
            self.import_individuals(session)

        print("\nImport complete!")
        self.print_summary()

    def print_summary(self):
        """Print summary of imported data."""
        with self.driver.session(database=self.database) as session:
            result = session.run("""
                MATCH (l:Library {name: $library_name})
                OPTIONAL MATCH (c:OWLClass)-[:BELONGS_TO]->(l)
                WITH l, count(c) AS stato_classes
                MATCH (c:OWLClass)
                WITH stato_classes, count(c) AS total_classes
                OPTIONAL MATCH (:OWLClass)-[r:SUBCLASS_OF]->(:OWLClass)
                WITH stato_classes, total_classes, count(r) AS hierarchy
                OPTIONAL MATCH (p:OWLProperty)
                WITH stato_classes, total_classes, hierarchy, count(p) AS properties
                OPTIONAL MATCH (i:OWLIndividual)
                RETURN stato_classes, total_classes, hierarchy, properties, count(i) AS individuals
            """, library_name=self.library_name)
            record = result.single()

            print("\n--- Summary ---")
            print(f"STATO Classes:  {record['stato_classes']}")
            print(f"Total Classes:  {record['total_classes']}")
            print(f"Hierarchy rels: {record['hierarchy']}")
            print(f"Properties:     {record['properties']}")
            print(f"Individuals:    {record['individuals']}")


def main():
    script_dir = Path(__file__).parent
    stato_dir = script_dir / "data" / "metadata" / "stato"
    owl_path = stato_dir / "stato.owl"

    # Load environment from neo4j/.env
    env_path = script_dir / ".env"
    load_dotenv(env_path)

    driver = get_driver()
    database = get_database()

    print(f"Connecting to Neo4j database: {database}")

    loader = OWLToNeo4jLoader(driver, database)

    try:
        loader.load_ontology(owl_path)
        loader.import_all()
    finally:
        driver.close()

    print("\nDone!")


if __name__ == "__main__":
    main()
