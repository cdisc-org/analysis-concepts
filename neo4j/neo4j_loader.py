#!/usr/bin/env python3
"""
Neo4j Analysis Concepts Loader

This script loads Analysis Concepts data into a Neo4j database by executing
Cypher scripts in the correct order.

Usage:
    python neo4j_loader.py --all              # Load all data (schema + data)
    python neo4j_loader.py --schema           # Load schema only
    python neo4j_loader.py --data             # Load data only
    python neo4j_loader.py --file <filename>  # Load specific file
    python neo4j_loader.py --clear --all      # Clear database and load all
    python neo4j_loader.py --query <query>    # Run a specific query from queries.cypher

Requirements:
    - Neo4j database running (local or remote)
    - .env file with connection credentials
    - neo4j Python driver
"""

import os
import sys
import argparse
import time
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv
from neo4j import GraphDatabase, Session
from neo4j.exceptions import ServiceUnavailable, ClientError


class Neo4jLoader:
    """Handles loading of Cypher scripts into Neo4j database."""

    def __init__(self, uri: str, username: str, password: str):
        """
        Initialize Neo4j connection.

        Args:
            uri: Neo4j connection URI
            username: Database username
            password: Database password
        """
        self.uri = uri
        self.username = username
        self.password = password
        self.driver = None

    def connect(self) -> bool:
        """
        Establish connection to Neo4j database.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.driver = GraphDatabase.driver(
                self.uri,
                auth=(self.username, self.password)
            )
            # Verify connectivity
            self.driver.verify_connectivity()
            print(f"✓ Connected to Neo4j at {self.uri}")
            return True
        except ServiceUnavailable as e:
            print(f"✗ Failed to connect to Neo4j: {e}")
            return False
        except Exception as e:
            print(f"✗ Unexpected error during connection: {e}")
            return False

    def close(self):
        """Close Neo4j driver connection."""
        if self.driver:
            self.driver.close()
            print("✓ Closed Neo4j connection")

    def clear_database(self) -> bool:
        """
        Clear all nodes and relationships from the database.
        WARNING: This will delete ALL data!

        Returns:
            True if successful, False otherwise
        """
        try:
            with self.driver.session() as session:
                print("⚠️  Clearing database...")

                # Delete all relationships first
                session.run("MATCH ()-[r]->() DELETE r")

                # Delete all nodes
                result = session.run("MATCH (n) DETACH DELETE n RETURN count(n) as deleted")
                deleted = result.single()["deleted"]

                print(f"✓ Cleared database ({deleted} nodes deleted)")
                return True
        except Exception as e:
            print(f"✗ Failed to clear database: {e}")
            return False

    def execute_cypher_file(self, filepath: Path) -> bool:
        """
        Execute a Cypher script file.

        Args:
            filepath: Path to the .cypher file

        Returns:
            True if successful, False otherwise
        """
        if not filepath.exists():
            print(f"✗ File not found: {filepath}")
            return False

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            # Split by semicolons and filter out comments and empty statements
            statements = []
            for stmt in content.split(';'):
                # Remove comments and whitespace
                lines = []
                for line in stmt.split('\n'):
                    # Remove single-line comments (but not :// in URLs)
                    if '//' in line:
                        # Find // that's not part of :// (URL)
                        idx = 0
                        while True:
                            idx = line.find('//', idx)
                            if idx == -1:
                                break
                            # Check if this is :// (URL protocol)
                            if idx > 0 and line[idx-1] == ':':
                                idx += 2
                                continue
                            # Found a real comment marker
                            line = line[:idx]
                            break
                    lines.append(line)

                stmt_clean = '\n'.join(lines).strip()
                if stmt_clean and not stmt_clean.startswith('//'):
                    statements.append(stmt_clean)

            print(f"📄 Executing {filepath.name} ({len(statements)} statements)...")

            with self.driver.session() as session:
                for i, statement in enumerate(statements, 1):
                    try:
                        result = session.run(statement)
                        # Consume result to ensure execution
                        summary = result.consume()

                        # Show progress for long files
                        if len(statements) > 10 and i % 5 == 0:
                            print(f"   Progress: {i}/{len(statements)} statements")
                    except ClientError as e:
                        # Some statements may fail (e.g., DROP IF EXISTS on first run)
                        # Only show error if it's not a "not found" error
                        if "not found" not in str(e).lower():
                            print(f"   ⚠️  Warning in statement {i}: {e.message}")
                    except Exception as e:
                        print(f"   ✗ Error in statement {i}: {e}")
                        return False

            print(f"✓ Completed {filepath.name}")
            return True

        except Exception as e:
            print(f"✗ Failed to execute {filepath}: {e}")
            return False

    def execute_query_by_name(self, query_name: str, params: Dict[str, Any] = None) -> List[Dict]:
        """
        Execute a named query from queries.cypher file.

        Args:
            query_name: Name or number of the query (e.g., "1" or "LIST ALL AC TEMPLATES")
            params: Optional parameters for the query

        Returns:
            List of result records as dictionaries
        """
        queries_file = Path(__file__).parent / "queries.cypher"

        if not queries_file.exists():
            print(f"✗ Queries file not found: {queries_file}")
            return []

        try:
            with open(queries_file, 'r', encoding='utf-8') as f:
                content = f.read()

            # Find the query section
            sections = content.split("// QUERY ")

            # Find matching query
            query_section = None
            for section in sections[1:]:  # Skip first split (header)
                if section.startswith(query_name) or query_name.upper() in section.split('\n')[0].upper():
                    query_section = section
                    break

            if not query_section:
                print(f"✗ Query not found: {query_name}")
                print("Available queries:")
                for section in sections[1:]:
                    title = section.split('\n')[0]
                    print(f"  - {title}")
                return []

            # Extract the actual query (skip comments, get first statement)
            lines = query_section.split('\n')
            query_lines = []
            in_query = False

            for line in lines[3:]:  # Skip title and separator
                if line.startswith('//'):
                    if in_query:
                        break  # End of query
                    continue
                if line.strip() and not line.startswith(':param'):
                    in_query = True
                    query_lines.append(line)
                elif in_query and not line.strip():
                    break

            query = '\n'.join(query_lines).strip()

            if not query:
                print(f"✗ Could not extract query: {query_name}")
                return []

            print(f"📊 Executing query: {query_name}")

            with self.driver.session() as session:
                result = session.run(query, params or {})
                records = [dict(record) for record in result]

                print(f"✓ Query returned {len(records)} results")
                return records

        except Exception as e:
            print(f"✗ Failed to execute query: {e}")
            return []


def load_env_variables() -> Dict[str, str]:
    """
    Load environment variables from .env file.

    Returns:
        Dictionary with connection parameters
    """
    # Load .env from parent directory
    env_path = Path(__file__).parent.parent / '.env'

    if not env_path.exists():
        print(f"✗ .env file not found at {env_path}")
        sys.exit(1)

    load_dotenv(env_path)

    return {
        'uri': os.getenv('NEO4J_URI', 'neo4j://127.0.0.1:7687'),
        'username': os.getenv('NEO4J_USERNAME', 'neo4j'),
        'password': os.getenv('NEO4J_PASSWORD', ''),
    }


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description='Load Analysis Concepts data into Neo4j database'
    )
    parser.add_argument('--all', action='store_true',
                       help='Load all data (schema + data)')
    parser.add_argument('--schema', action='store_true',
                       help='Load schema only')
    parser.add_argument('--data', action='store_true',
                       help='Load data only')
    parser.add_argument('--file', type=str,
                       help='Load specific Cypher file')
    parser.add_argument('--clear', action='store_true',
                       help='Clear database before loading')
    parser.add_argument('--query', type=str,
                       help='Execute a specific query by name or number')

    args = parser.parse_args()

    # Load environment variables
    env_vars = load_env_variables()

    # Initialize loader
    loader = Neo4jLoader(
        uri=env_vars['uri'],
        username=env_vars['username'],
        password=env_vars['password']
    )

    # Connect to database
    if not loader.connect():
        sys.exit(1)

    try:
        # Clear database if requested
        if args.clear:
            if not loader.clear_database():
                sys.exit(1)

        # Define file loading order
        schema_files = [
            'schema.cypher',
        ]

        data_files = [
            'data_adam_class_variables.cypher',
            'data_ac_templates.cypher',
            'data_sponsor_model.cypher',
            'data_ac_study_instances.cypher',
            'data_sdtm.cypher',
            'data_derived.cypher',
        ]

        script_dir = Path(__file__).parent
        success = True

        # Execute based on arguments
        if args.query:
            # Execute a specific query
            results = loader.execute_query_by_name(args.query)
            if results:
                print("\nResults:")
                for i, record in enumerate(results, 1):
                    print(f"\n{i}. {record}")
        elif args.file:
            # Load specific file
            filepath = script_dir / args.file
            success = loader.execute_cypher_file(filepath)
        elif args.schema:
            # Load schema only
            for filename in schema_files:
                filepath = script_dir / filename
                if not loader.execute_cypher_file(filepath):
                    success = False
                    break
        elif args.data:
            # Load data only
            for filename in data_files:
                filepath = script_dir / filename
                if not loader.execute_cypher_file(filepath):
                    success = False
                    break
        elif args.all:
            # Load everything
            print("\n=== Loading Schema ===")
            for filename in schema_files:
                filepath = script_dir / filename
                if not loader.execute_cypher_file(filepath):
                    success = False
                    break

            if success:
                print("\n=== Loading Data ===")
                for filename in data_files:
                    filepath = script_dir / filename
                    if not loader.execute_cypher_file(filepath):
                        success = False
                        break
        else:
            parser.print_help()
            sys.exit(0)

        if success:
            print("\n✓ All operations completed successfully!")
        else:
            print("\n✗ Some operations failed")
            sys.exit(1)

    finally:
        loader.close()


if __name__ == '__main__':
    main()
