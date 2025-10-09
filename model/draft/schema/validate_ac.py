import json
import jsonschema
from jsonschema import validate, ValidationError

def validate_ac(ac_file, schema_file):
    """
    Validate an AC JSON file against the schema
    """
    # Load schema
    with open(schema_file, 'r') as f:
        schema = json.load(f)
    
    # Load AC
    with open(ac_file, 'r') as f:
        ac = json.load(f)
    
    # Validate
    try:
        validate(instance=ac, schema=schema)
        print(f"✅ {ac_file} is VALID")
        return True
    except ValidationError as e:
        print(f"❌ {ac_file} is INVALID")
        print(f"Error: {e.message}")
        print(f"Path: {' -> '.join(str(p) for p in e.path)}")
        return False

# Validate all example ACs
acs_to_validate = [
    "d_ac_001_baseline_madrs.json",
    "d_ac_002_change_from_baseline.json",
    "a_ac_003_descriptive_statistics.json",
    "m_ac_015_mmrm_primary.json",
    "m_ac_020_ancova_sbp.json"
]

schema_file = "ac_schema.json"

print("Validating ACs against schema...")
print("=" * 60)

all_valid = True
for ac_file in acs_to_validate:
    valid = validate_ac(ac_file, schema_file)
    all_valid = all_valid and valid
    print()

if all_valid:
    print("✅ All ACs are valid!")
else:
    print("❌ Some ACs failed validation")