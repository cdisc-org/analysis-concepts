"""Tests for the AC/DC Framework Workbench models and library."""

import sys
from pathlib import Path

# Add lib to path for testing
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.library import load_library
from lib.models import STC, Method, Template, DCInstance, ACInstance


def test_load_library():
    """Test that the library loads all metadata correctly."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    # Check concepts loaded
    assert len(lib.observation_concepts) == 17
    assert len(lib.inference_concepts) == 8

    # Check methods loaded
    assert len(lib.derivation_methods) == 6
    assert len(lib.analysis_methods) == 2

    # Check templates loaded
    assert len(lib.dc_templates) == 4
    assert len(lib.ac_templates) == 1

    # Check instances loaded
    assert len(lib.dc_instances) == 4
    assert len(lib.ac_instances) == 1

    # Check phrases loaded
    assert len(lib.static_phrases) == 6
    assert len(lib.parameterized_phrases) == 4
    assert len(lib.sentences) == 1


def test_get_concept_by_name():
    """Test getting a concept by name."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    concept = lib.get_concept_by_name("change_value")
    assert concept is not None
    assert concept.level == "observation"
    assert concept.category == "Value"


def test_get_method_by_name():
    """Test getting a method by name."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    method = lib.get_method_by_name("Subtraction")
    assert method is not None
    assert method.type == "derivation"


def test_get_template_by_id():
    """Test getting a template by ID."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    template = lib.get_template_by_id("T_DC_Baseline")
    assert template is not None
    assert template.uses_method == "Aggregation"


def test_get_instance_by_id():
    """Test getting an instance by ID."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    instance = lib.get_instance_by_id("S_AC_CDISCPILOT01_ADAS_WK24")
    assert instance is not None
    assert isinstance(instance, ACInstance)
    assert instance.study == "CDISCPILOT01"


def test_ac_depends_on():
    """Test getting DC instances that an AC depends on."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    ac_instance = lib.ac_instances[0]
    dc_instances = lib.get_dc_instances_for_ac(ac_instance)

    assert len(dc_instances) == 4
    dc_ids = [dc.id for dc in dc_instances]
    assert "S_DC_ADAS_Baseline" in dc_ids


def test_template_method_relationship():
    """Test getting the method for a template."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    template = lib.get_template_by_id("T_AC_ANCOVA_DoseResponse")
    assert template is not None

    method = lib.get_method_for_template(template)
    assert method is not None
    assert method.name == "ancova_dose_response"


def test_implementation_mapping():
    """Test the new implementation mapping structure."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    # Check implementation mapping loaded
    assert lib.implementation_mapping is not None

    # Test data concept to ADaM resolution
    adam_var = lib.resolve_data_concept_to_adam("change_value")
    assert adam_var == "CHG"

    adam_var = lib.resolve_data_concept_to_adam("baseline_value")
    assert adam_var == "BASE"

    adam_var = lib.resolve_data_concept_to_adam("subject")
    assert adam_var == "USUBJID"

    # Test data concept to SDTM resolution
    sdtm_var = lib.resolve_data_concept_to_sdtm("subject")
    assert sdtm_var == "USUBJID"

    sdtm_var = lib.resolve_data_concept_to_sdtm("observation_value")
    assert sdtm_var == "QSSTRESN"


def test_dc_instance_cube_structure():
    """Test DC instance has cube-based structure."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    instance = lib.get_instance_by_id("S_DC_ADAS_Change")
    assert instance is not None

    # Check new structure fields exist
    assert instance.method is not None
    assert instance.method.name == "Subtraction"
    assert "change_value" in instance.method.formula

    assert instance.input_cube is not None
    assert instance.output_cube is not None
    assert instance.slice is not None


def test_ac_instance_cube_structure():
    """Test AC instance has cube-based structure."""
    metadata_path = Path(__file__).parent.parent.parent / "metadata"
    lib = load_library(metadata_path)

    instance = lib.get_instance_by_id("S_AC_CDISCPILOT01_ADAS_WK24")
    assert instance is not None

    # Check new structure fields exist
    assert instance.method is not None
    assert instance.method.name == "FitANCOVAModel"

    assert instance.input_cube is not None
    assert instance.output_cubes is not None
    assert len(instance.output_cubes) == 2
    assert instance.slice is not None

    # Check model specification
    assert instance.model_specification is not None
    assert instance.hypothesis is not None


if __name__ == "__main__":
    # Run tests
    test_load_library()
    print("✓ test_load_library passed")

    test_get_concept_by_name()
    print("✓ test_get_concept_by_name passed")

    test_get_method_by_name()
    print("✓ test_get_method_by_name passed")

    test_get_template_by_id()
    print("✓ test_get_template_by_id passed")

    test_get_instance_by_id()
    print("✓ test_get_instance_by_id passed")

    test_ac_depends_on()
    print("✓ test_ac_depends_on passed")

    test_template_method_relationship()
    print("✓ test_template_method_relationship passed")

    test_implementation_mapping()
    print("✓ test_implementation_mapping passed")

    test_dc_instance_cube_structure()
    print("✓ test_dc_instance_cube_structure passed")

    test_ac_instance_cube_structure()
    print("✓ test_ac_instance_cube_structure passed")

    print("\n✅ All tests passed!")
