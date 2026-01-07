"""
Pydantic validation models for Define-JSON Analysis Concept extensions.

This module implements the ReifiedConcept inheritance hierarchy using Python class inheritance,
providing type-safe validation, generation, and manipulation of analysis concept metadata.

Usage:
    from validation.pydantic_models import AnalysisConcept, DataConcept, BuildingBlock

    # Validate JSON
    concept = AnalysisConcept.model_validate(json_data)

    # Generate JSON
    json_str = concept.model_dump_json(indent=2, exclude_none=True)
"""

from typing import List, Optional, Literal, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum


# ============================================================================
# Enumerations for controlled vocabularies
# ============================================================================

class ConceptType(str, Enum):
    """Type discriminator for reified concepts."""
    ANALYSIS_CONCEPT = "analysis_concept"
    DATA_CONCEPT = "data_concept"
    BUILDING_BLOCK = "building_block"


class DataType(str, Enum):
    """Standard data types for variables and parameters."""
    FLOAT = "float"
    INTEGER = "integer"
    TEXT = "text"
    DATE = "date"
    DATETIME = "datetime"
    BOOLEAN = "boolean"


class AdamClass(str, Enum):
    """Standard ADaM variable classes."""
    CHG = "CHG"  # Change from baseline
    BASE = "BASE"  # Baseline value
    AVAL = "AVAL"  # Analysis value
    PCHG = "PCHG"  # Percent change from baseline
    R2BASE = "R2BASE"  # Ratio to baseline


class MethodCategory(str, Enum):
    """Categories of statistical and derivation methods."""
    STATISTICAL_TEST = "statistical_test"
    ESTIMATION = "estimation"
    DERIVATION = "derivation"
    COMPARISON = "comparison"
    MODELING = "modeling"


# ============================================================================
# Base Classes
# ============================================================================

class ReifiedConcept(BaseModel):
    """
    Abstract base class for all reified concepts.

    This class defines the shared properties inherited by AnalysisConcept,
    DataConcept, and BuildingBlock. It uses type discriminator pattern
    via the conceptType field.

    Properties:
        OID: Unique identifier with type-specific prefix (AC., DC., BB.)
        name: Human-readable name
        description: Detailed description
        conceptType: Type discriminator enum
        semanticRole: Domain-specific role
        label: Optional short display label
        statoIRI: Optional STATO ontology IRI reference
    """
    model_config = ConfigDict(
        extra='allow',  # Allow additional fields for forward compatibility
        validate_assignment=True,
        use_enum_values=True
    )

    OID: str = Field(..., description="Unique identifier with type-specific prefix")
    name: str = Field(..., description="Human-readable name")
    description: Optional[str] = Field(None, description="Detailed description of the concept")
    conceptType: ConceptType = Field(..., description="Type discriminator")
    semanticRole: str = Field(..., description="Domain-specific semantic role")
    label: Optional[str] = Field(None, description="Short display label")
    statoIRI: Optional[str] = Field(None, description="STATO ontology IRI reference")


# ============================================================================
# Component Classes (used by multiple concept types)
# ============================================================================

class TemplateParameter(BaseModel):
    """
    Parameter definition for building block templates.

    Defines a placeholder in a phrase template that must be filled
    during sentence composition.
    """
    name: str = Field(..., description="Parameter name used in template placeholders")
    description: str = Field(..., description="Parameter description")
    semanticType: str = Field(..., description="Semantic type of the parameter value")
    required: bool = Field(True, description="Whether parameter is required")
    cardinality: Optional[str] = Field(None, description="Cardinality constraint (e.g., '1..*')")
    examples: Optional[List[str]] = Field(None, description="Example values for the parameter")


class ConceptInput(BaseModel):
    """
    Input specification for analysis or data concepts.

    Defines what data or information is required as input to an analysis
    or data derivation.
    """
    OID: str = Field(..., description="Unique identifier for this input")
    name: str = Field(..., description="Input name")
    semanticRole: str = Field(..., description="Role of this input in the analysis")
    description: Optional[str] = Field(None, description="Input description")
    dataType: Optional[DataType] = Field(None, description="Expected data type")
    required: bool = Field(True, description="Whether input is required")
    cardinality: Optional[str] = Field(None, description="Cardinality constraint")
    conceptRef: Optional[Union[str, List[str]]] = Field(
        None,
        description="Reference to DataConcept(s) that can fulfill this input"
    )


class ConceptOutput(BaseModel):
    """
    Output specification for analysis or data concepts.

    Defines what results or derived values are produced by an analysis
    or data derivation.
    """
    OID: str = Field(..., description="Unique identifier for this output")
    name: str = Field(..., description="Output name")
    semanticRole: str = Field(..., description="Role of this output")
    description: Optional[str] = Field(None, description="Output description")
    dataType: Optional[DataType] = Field(None, description="Output data type")
    interpretation: Optional[str] = Field(None, description="How to interpret this output")
    cardinality: Optional[str] = Field(None, description="Cardinality constraint")


class BuildingBlockReference(BaseModel):
    """
    Reference to a building block with semantic role.

    Used by AnalysisConcept to declare which building blocks are needed
    for sentence composition.
    """
    buildingBlockRef: str = Field(..., description="OID reference to BuildingBlock")
    semanticRole: str = Field(..., description="Role of this building block in the analysis")
    description: Optional[str] = Field(None, description="Why this building block is needed")
    required: bool = Field(True, description="Whether this building block is required")


class DerivationMethod(BaseModel):
    """
    Specification for how a data concept is derived.

    Used by DataConcept when the concept represents a derived value.
    """
    formula: Optional[str] = Field(None, description="Mathematical formula for derivation")
    methodRef: Optional[str] = Field(None, description="Reference to Method definition")
    description: Optional[str] = Field(None, description="Derivation description")


# ============================================================================
# Specialized Concept Classes (inherit from ReifiedConcept)
# ============================================================================

class AnalysisConcept(ReifiedConcept):
    """
    Statistical analysis pattern specification.

    Represents a reusable analysis concept that can be instantiated in
    specific studies. Contains statistical semantics including required
    inputs, expected outputs, and analysis methods.

    Example: AC.ANCOVA.TREATMENT.COMPARISON, AC.DOSE.RESPONSE.LINEAR
    """
    conceptType: Literal[ConceptType.ANALYSIS_CONCEPT] = ConceptType.ANALYSIS_CONCEPT

    purpose: str = Field(..., description="Analysis purpose (e.g., 'Hypothesis test for dose-response')")

    requiredBuildingBlocks: Optional[List[BuildingBlockReference]] = Field(
        None,
        description="Building blocks needed for sentence composition"
    )

    inputs: Optional[List[ConceptInput]] = Field(
        None,
        description="Typed input specifications with statistical semantics"
    )

    outputs: Optional[List[ConceptOutput]] = Field(
        None,
        description="Typed output specifications with statistical semantics"
    )

    methodRef: Optional[str] = Field(
        None,
        description="Reference to statistical method definition"
    )

    requiresPopulation: Optional[bool] = Field(
        None,
        description="Whether population specification is required"
    )

    allowedDataConcepts: Optional[List[str]] = Field(
        None,
        description="Data concepts compatible with this analysis"
    )

    def __init__(self, **data):
        """Validate OID prefix for AnalysisConcept."""
        if 'OID' in data and not data['OID'].startswith('AC.'):
            raise ValueError("AnalysisConcept OID must start with 'AC.'")
        super().__init__(**data)


class DataConcept(ReifiedConcept):
    """
    Abstract data semantic specification.

    Represents a reusable data concept that can be implemented by
    study-specific variables. Contains data semantics including
    data type, ADaM class, and optional derivation specifications.

    Example: DC.CHANGE.FROM.BASELINE, DC.DOSE.EXPOSURE
    """
    conceptType: Literal[ConceptType.DATA_CONCEPT] = ConceptType.DATA_CONCEPT

    adClass: Optional[AdamClass] = Field(
        None,
        description="ADaM variable class"
    )

    dataType: Optional[DataType] = Field(
        None,
        description="Expected data type"
    )

    derivationMethod: Optional[DerivationMethod] = Field(
        None,
        description="Derivation specification for computed concepts"
    )

    mapsToVariable: Optional[List[str]] = Field(
        None,
        description="SDTM/ADaM variable names implementing this concept"
    )

    inputs: Optional[List[ConceptInput]] = Field(
        None,
        description="Input specifications for derived concepts (data semantics)"
    )

    outputs: Optional[List[ConceptOutput]] = Field(
        None,
        description="Output specifications for derived concepts (data semantics)"
    )

    def __init__(self, **data):
        """Validate OID prefix for DataConcept."""
        if 'OID' in data and not data['OID'].startswith('DC.'):
            raise ValueError("DataConcept OID must start with 'DC.'")
        super().__init__(**data)


class BuildingBlock(ReifiedConcept):
    """
    Reusable phrase template for analysis sentence composition.

    Represents a template with parameter placeholders that can be filled
    during Step 1 of the workflow to compose human-readable analysis sentences.

    Example: BB.OUTCOME.CHANGE_PARAM_TIME, BB.METHOD.COMPARE_GROUPS
    """
    conceptType: Literal[ConceptType.BUILDING_BLOCK] = ConceptType.BUILDING_BLOCK

    template: str = Field(
        ...,
        description="Phrase template with parameter placeholders (e.g., '{parameter}')"
    )

    parameters: List[TemplateParameter] = Field(
        ...,
        description="Template parameter definitions"
    )

    mapsToDataConcept: Optional[Union[str, List[str]]] = Field(
        None,
        description="Data concepts required by this phrase"
    )

    requiresAnalysisConcept: Optional[List[str]] = Field(
        None,
        description="Analysis concepts that can use this building block"
    )

    examples: Optional[List[str]] = Field(
        None,
        description="Example instantiations of the template"
    )

    def __init__(self, **data):
        """Validate OID prefix for BuildingBlock."""
        if 'OID' in data and not data['OID'].startswith('BB.'):
            raise ValueError("BuildingBlock OID must start with 'BB.'")
        super().__init__(**data)

    def compose(self, bindings: Dict[str, Any]) -> str:
        """
        Compose a phrase from this template using parameter bindings.

        Args:
            bindings: Dictionary mapping parameter names to values

        Returns:
            Composed phrase string

        Raises:
            ValueError: If required parameters are missing

        Example:
            >>> bb = BuildingBlock(
            ...     OID="BB.OUTCOME.CHANGE",
            ...     template="change in {parameter} from baseline to {timepoint}",
            ...     parameters=[...]
            ... )
            >>> bb.compose({"parameter": "ADAS-Cog", "timepoint": "Week 24"})
            "change in ADAS-Cog from baseline to Week 24"
        """
        # Check required parameters
        required_params = [p.name for p in self.parameters if p.required]
        missing = set(required_params) - set(bindings.keys())
        if missing:
            raise ValueError(f"Missing required parameters: {missing}")

        # Compose phrase
        return self.template.format(**bindings)


# ============================================================================
# Container Classes for JSON file structure
# ============================================================================

class MetaDataVersion(BaseModel):
    """
    Container for reified concepts in a library or study file.

    This matches the Define-JSON MetaDataVersion structure.
    """
    OID: str = Field(..., description="Metadata version OID")
    name: str = Field(..., description="Metadata version name")
    description: Optional[str] = Field(None, description="Description")

    ReifiedConcepts: Optional[List[Union[AnalysisConcept, DataConcept, BuildingBlock]]] = Field(
        None,
        description="List of reified concepts (polymorphic)"
    )


class DefineJSONLibrary(BaseModel):
    """
    Root container for a Define-JSON library file.

    Example usage:
        >>> library = DefineJSONLibrary.model_validate_json(json_string)
        >>> concepts = library.MetaDataVersion.ReifiedConcepts
    """
    MetaDataVersion: MetaDataVersion


# ============================================================================
# Utility Functions
# ============================================================================

def validate_json_file(file_path: str) -> DefineJSONLibrary:
    """
    Validate a Define-JSON library file.

    Args:
        file_path: Path to JSON file

    Returns:
        Validated DefineJSONLibrary object

    Raises:
        ValidationError: If file does not conform to schema
    """
    import json
    with open(file_path, 'r') as f:
        data = json.load(f)
    return DefineJSONLibrary.model_validate(data)


def concept_factory(concept_data: Dict[str, Any]) -> ReifiedConcept:
    """
    Factory function to create appropriate concept type based on conceptType discriminator.

    Args:
        concept_data: Dictionary with concept data including conceptType field

    Returns:
        Appropriate ReifiedConcept subclass instance

    Raises:
        ValueError: If conceptType is unknown or missing
    """
    concept_type = concept_data.get('conceptType')

    if concept_type == ConceptType.ANALYSIS_CONCEPT:
        return AnalysisConcept.model_validate(concept_data)
    elif concept_type == ConceptType.DATA_CONCEPT:
        return DataConcept.model_validate(concept_data)
    elif concept_type == ConceptType.BUILDING_BLOCK:
        return BuildingBlock.model_validate(concept_data)
    else:
        raise ValueError(f"Unknown conceptType: {concept_type}")


if __name__ == "__main__":
    # Example usage
    print("Pydantic Models for Define-JSON Analysis Concepts")
    print("=" * 60)

    # Example 1: Create a BuildingBlock
    bb = BuildingBlock(
        OID="BB.OUTCOME.CHANGE",
        name="Change from Baseline",
        conceptType=ConceptType.BUILDING_BLOCK,
        semanticRole="outcome_specification",
        template="change in {parameter} from baseline to {timepoint}",
        parameters=[
            TemplateParameter(
                name="parameter",
                description="The clinical parameter",
                semanticType="clinical_parameter",
                required=True,
                examples=["ADAS-Cog", "blood pressure"]
            ),
            TemplateParameter(
                name="timepoint",
                description="Analysis timepoint",
                semanticType="temporal_reference",
                required=True,
                examples=["Week 24", "Month 6"]
            )
        ],
        examples=["change in ADAS-Cog from baseline to Week 24"]
    )

    print("\n1. BuildingBlock created successfully:")
    print(f"   OID: {bb.OID}")
    print(f"   Template: {bb.template}")

    # Example 2: Compose phrase from template
    phrase = bb.compose({"parameter": "ADAS-Cog", "timepoint": "Week 24"})
    print(f"\n2. Composed phrase: {phrase}")

    # Example 3: Generate JSON
    json_output = bb.model_dump_json(indent=2, exclude_none=True)
    print(f"\n3. JSON output:\n{json_output}")
