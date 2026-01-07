#!/usr/bin/env python3
"""Extract ADaM variables and datasets from define.xml to CSV files."""

import csv
import xml.etree.ElementTree as ET
from pathlib import Path

# Namespaces used in define.xml
NS = {
    'odm': 'http://www.cdisc.org/ns/odm/v1.2',
    'def': 'http://www.cdisc.org/ns/def/v1.0',
}

def parse_define_xml(xml_path: Path):
    """Parse define.xml and extract datasets and variables."""
    tree = ET.parse(xml_path)
    root = tree.getroot()

    datasets = []
    variables = []

    # Find all ItemGroupDef elements (datasets)
    for item_group in root.iter('{http://www.cdisc.org/ns/odm/v1.2}ItemGroupDef'):
        dataset_name = item_group.get('OID')
        dataset_label = item_group.get('{http://www.cdisc.org/ns/def/v1.0}Label', '')
        dataset_class = item_group.get('{http://www.cdisc.org/ns/def/v1.0}Class', '')
        dataset_structure = item_group.get('{http://www.cdisc.org/ns/def/v1.0}Structure', '')
        dataset_keys = item_group.get('{http://www.cdisc.org/ns/def/v1.0}DomainKeys', '')

        datasets.append({
            'Dataset': dataset_name,
            'Dataset Description': dataset_label,
            'Class': dataset_class,
            'Structure': dataset_structure,
            'Keys': dataset_keys,
        })

    # Find all ItemDef elements (variables)
    for item_def in root.iter('{http://www.cdisc.org/ns/odm/v1.2}ItemDef'):
        oid = item_def.get('OID', '')

        # Skip value-level metadata (OIDs with 3+ parts like ADLBC.AVAL.ALB)
        oid_parts = oid.split('.')
        if len(oid_parts) != 2:
            continue

        dataset_name = oid_parts[0]
        var_name = item_def.get('Name', '')
        var_label = item_def.get('{http://www.cdisc.org/ns/def/v1.0}Label', '')
        data_type = item_def.get('DataType', '')
        length = item_def.get('Length', '')
        display_format = item_def.get('{http://www.cdisc.org/ns/def/v1.0}DisplayFormat', '')

        # Map DataType to Char/Num
        if data_type == 'text':
            type_mapped = 'Char'
        elif data_type in ('integer', 'float'):
            type_mapped = 'Num'
        else:
            type_mapped = data_type

        # Get CodeListRef (Controlled Terms)
        codelist_ref = item_def.find('{http://www.cdisc.org/ns/odm/v1.2}CodeListRef')
        controlled_terms = ''
        if codelist_ref is not None:
            controlled_terms = codelist_ref.get('CodeListOID', '')

        variables.append({
            'Dataset': dataset_name,
            'Variable': var_name,
            'Variable Label': var_label,
            'Type': type_mapped,
            'Length': length,
            'Display Format': display_format,
            'Controlled Terms': controlled_terms,
        })

    return datasets, variables


def write_datasets_csv(datasets: list, output_path: Path):
    """Write datasets to CSV file."""
    fieldnames = ['Dataset', 'Dataset Description', 'Class', 'Structure', 'Keys']
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(datasets)


def write_variables_csv(variables: list, output_path: Path):
    """Write variables to CSV file."""
    fieldnames = ['Dataset', 'Variable', 'Variable Label', 'Type', 'Length', 'Display Format', 'Controlled Terms']
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(variables)


def main():
    script_dir = Path(__file__).parent
    define_xml_path = script_dir / 'define.xml'

    datasets, variables = parse_define_xml(define_xml_path)

    # Write output files
    write_datasets_csv(datasets, script_dir / 'adam-dataset.csv')
    write_variables_csv(variables, script_dir / 'adam-var.csv')

    print(f"Extracted {len(datasets)} datasets to adam-dataset.csv")
    print(f"Extracted {len(variables)} variables to adam-var.csv")


if __name__ == '__main__':
    main()
