#!/usr/bin/env bash
# Generate JSON Schema from the LinkML schema, then apply post-processing fixes.
# Usage: ./scripts/generate_json_schema.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv/bin"
SCHEMA_YAML="$ROOT/model/method/acdc_methods.yaml"
SCHEMA_JSON="$ROOT/model/method/acdc_methods.schema.json"

echo "Generating JSON Schema from LinkML..."
"$VENV/gen-json-schema" "$SCHEMA_YAML" > "$SCHEMA_JSON"

echo "Applying post-processing fixes..."
"$VENV/python3" -c "
import json

with open('$SCHEMA_JSON') as f:
    schema = json.load(f)

fixes = 0

# Fix 1: defaultValue has both 'type' and 'anyOf' — remove conflicting 'type'
dv = schema.get('\$defs', {}).get('Configuration', {}).get('properties', {}).get('defaultValue', {})
if 'anyOf' in dv and 'type' in dv:
    del dv['type']
    fixes += 1

# Fix 2: OutputClass.examples may contain objects, not just strings
oc = schema.get('\$defs', {}).get('OutputClass', {}).get('properties', {})
if 'examples' in oc:
    oc['examples'] = {
        'description': 'Example values for the indexed_by dimensions',
        'items': {},
        'type': ['array', 'null']
    }
    fixes += 1

with open('$SCHEMA_JSON', 'w') as f:
    json.dump(schema, f, indent=4)
    f.write('\n')

print(f'  Applied {fixes} post-processing fix(es)')
"

echo "Done: $SCHEMA_JSON"
