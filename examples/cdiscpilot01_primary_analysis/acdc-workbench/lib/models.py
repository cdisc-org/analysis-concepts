"""Pydantic models for the AC/DC Framework domain objects.

These models match the structure of the JSON files in the metadata folder.
"""

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field


# =============================================================================
# Semantic Transformation Concepts (STCs)
# =============================================================================

class STC(BaseModel):
    """Semantic Transformation Concept - abstract data concept."""

    name: str
    description: str
    level: Literal["observation", "inference"]
    category: str
    data_type: str
    stato_uri: Optional[str] = None
    derived_from: Optional[List[str]] = None
    derivation_method: Optional[str] = None


class STCFile(BaseModel):
    """Container for the semantic_transformation_concepts.json file."""

    schema_: Optional[str] = Field(None, alias="$schema")
    version: str
    description: str
    concepts: Dict[str, List[STC]]  # observation_level and inference_level


# =============================================================================
# Methods (Derivation and Analysis)
# =============================================================================

class MethodRole(BaseModel):
    """A role in a method (input or output)."""

    name: str
    direction: Literal["input", "output"]
    data_type: str
    description: Optional[str] = None


class MethodParameter(BaseModel):
    """A parameter for a method."""

    name: str
    type: str
    default: Optional[Any] = None
    values: Optional[List[str]] = None
    description: Optional[str] = None


class Method(BaseModel):
    """A derivation or analysis method."""

    name: str
    type: Literal["derivation", "analysis"]
    description: str
    del_expression: str
    mathematical_notation: Optional[str] = None
    roles: List[MethodRole]
    parameters: Optional[List[MethodParameter]] = None
    outputs: Optional[List[str]] = None
    assumptions: Optional[List[str]] = None


class MethodFile(BaseModel):
    """Container for method JSON files."""

    schema_: Optional[str] = Field(None, alias="$schema")
    version: str
    description: str
    methods: List[Method]


# =============================================================================
# Templates (DC and AC)
# =============================================================================

class RoleBinding(BaseModel):
    """Binding between an STC and a method role."""

    semantic_transformation_concept: str
    method_role: str
    direction: Literal["input", "output"]
    cube_role: str
    data_type: Optional[str] = None
    description: Optional[str] = None
    # Phrase support (hybrid approach)
    phrase: Optional[str] = None  # Custom inline phrase text
    phrase_ref: Optional[str] = None  # OR reference to library phrase ID
    parameter_overrides: Optional[Dict[str, Any]] = None  # Override phrase parameter bindings


class RequiredPhrase(BaseModel):
    """A required phrase specification for a template."""

    role: str
    must_reference: Optional[Union[str, List[str]]] = None
    must_be: Optional[str] = None


class ModelSpecification(BaseModel):
    """Model specification for analysis templates."""

    family: Optional[str] = None
    link: Optional[str] = None
    estimation: Optional[str] = None
    hypothesis_test: Optional[Dict[str, str]] = None


class Template(BaseModel):
    """A derivation or analysis template."""

    id: str
    name: str
    type: Literal["derivation", "analysis"]
    version: str
    clinical_intent: str
    uses_method: str
    parameters: Optional[Dict[str, Any]] = None
    role_bindings: List[RoleBinding]
    del_expression: Optional[str] = None
    model_specification: Optional[ModelSpecification] = None
    required_phrases: Optional[List[RequiredPhrase]] = None


class TemplateFile(BaseModel):
    """Container for template JSON files."""

    schema_: Optional[str] = Field(None, alias="$schema")
    template: Template


# =============================================================================
# Instances (DC and AC) - Cube-based structure
# =============================================================================

class CubeDimension(BaseModel):
    """A dimension in a data cube."""

    data_concept: str
    role: str  # identifier, factor, etc.
    note: Optional[str] = None


class CubeMeasure(BaseModel):
    """A measure in a data cube."""

    data_concept: str
    role: str  # value, qualifier, dependent, covariate, etc.
    note: Optional[str] = None


class Cube(BaseModel):
    """A data cube definition."""

    name: str
    description: Optional[str] = None
    dimensions: Optional[List[CubeDimension]] = None  # Optional for scalar results
    measures: List[CubeMeasure]


class SliceConstraint(BaseModel):
    """A constraint in a slice.

    Supports both fixed values and parameterized filters:
    - Fixed: data_concept="visit", value="Week 24"
    - Parameterized: data_concept="visit", parameter="analysis_visit" (links to a concept)
    - With operator: data_concept="age", operator=">=", value=18
    """

    data_concept: str
    value: Optional[Any] = None
    values: Optional[List[Any]] = None
    operator: Optional[str] = None  # "=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN"
    parameter: Optional[str] = None  # Reference to a concept that provides the value
    label: Optional[str] = None
    description: Optional[str] = None


class Slice(BaseModel):
    """A slice definition constraining a cube."""

    name: str
    constraints: List[SliceConstraint]


class InstanceMethod(BaseModel):
    """Method reference in an instance."""

    name: str
    formula: str


class OutputQualifier(BaseModel):
    """Output qualifier for derivation instances."""

    data_concept: str
    value: str
    condition: Optional[str] = None


class Criterion(BaseModel):
    """A criterion for population derivation."""

    name: str
    description: str
    data_concept_condition: str


class DCInstance(BaseModel):
    """A derivation concept instance - cube-based structure."""

    id: str
    name: str
    type: Literal["derivation_instance"]
    version: str
    instance_of: str
    study: str
    description: str
    depends_on: Optional[List[str]] = None
    method: Optional[InstanceMethod] = None
    input_cube: Optional[Cube] = None
    output_cube: Optional[Cube] = None
    slice: Optional[Slice] = None
    output_qualifier: Optional[OutputQualifier] = None
    criteria: Optional[List[Criterion]] = None
    # Legacy fields (for backwards compatibility during migration)
    slice_bindings: Optional[Dict[str, Any]] = None
    source_mapping: Optional[Dict[str, Any]] = None
    target_mapping: Optional[Dict[str, Any]] = None
    execution: Optional[Dict[str, str]] = None


class DCInstanceFile(BaseModel):
    """Container for DC instance JSON files."""

    schema_: Optional[str] = Field(None, alias="$schema")
    instance: DCInstance


class TreatmentValue(BaseModel):
    """A treatment value specification."""

    label: str
    dose_mg: int


class TreatmentSpecification(BaseModel):
    """Treatment specification for AC instances."""

    values: List[TreatmentValue]
    use_actual_dose: Optional[bool] = None
    description: Optional[str] = None


class ModelSpecificationAC(BaseModel):
    """Model specification for AC instances."""

    formula_notation: Optional[str] = None
    family: Optional[str] = None
    link: Optional[str] = None
    ss_type: Optional[str] = None


class Hypothesis(BaseModel):
    """Hypothesis specification."""

    null: str
    alternative: str
    alpha: float


class OutputSpec(BaseModel):
    """Output specification for AC instances."""

    description: str
    interpretation: Optional[str] = None
    level: Optional[float] = None


class ACInstance(BaseModel):
    """An analysis concept instance - cube-based structure."""

    id: str
    name: str
    type: Literal["analysis_instance"]
    version: str
    instance_of: str
    study: str
    description: str
    described_by: Optional[str] = None
    depends_on: Optional[List[str]] = None
    method: Optional[InstanceMethod] = None
    input_cube: Optional[Cube] = None
    output_cubes: Optional[List[Cube]] = None
    slice: Optional[Slice] = None
    treatment_specification: Optional[TreatmentSpecification] = None
    model_specification: Optional[ModelSpecificationAC] = None
    hypothesis: Optional[Hypothesis] = None
    outputs: Optional[Dict[str, Any]] = None
    # Legacy fields (for backwards compatibility during migration)
    slice_bindings: Optional[Dict[str, Any]] = None
    treatment_dose_mapping: Optional[Dict[str, Any]] = None
    source_mapping: Optional[Dict[str, Any]] = None
    model: Optional[Dict[str, Any]] = None
    execution: Optional[Dict[str, Any]] = None


class ACInstanceFile(BaseModel):
    """Container for AC instance JSON files."""

    schema_: Optional[str] = Field(None, alias="$schema")
    instance: ACInstance


# =============================================================================
# Phrases and Sentences
# =============================================================================

class StaticPhrase(BaseModel):
    """A static (non-parameterized) phrase."""

    id: str
    role: str
    phrase_template: str
    references: List[str]
    description: str


class PhraseParameter(BaseModel):
    """A parameter in a parameterized phrase with binding information.

    Supports "suggested + override" approach:
    - Library phrase defines default bindings
    - Template can override bindings
    - Study/instance resolves to actual values
    """

    name: str  # Parameter name (e.g., "parameter", "timepoint")
    binds_to: Literal["concept", "method", "literal"] = "concept"  # Default binding type
    concept_ref: Optional[str] = None  # If binds_to="concept", which concept
    method_ref: Optional[str] = None  # If binds_to="method", which method
    default_value: Optional[str] = None  # If binds_to="literal", default text
    description: Optional[str] = None  # Help text for user


class ParameterizedPhrase(BaseModel):
    """A parameterized phrase with placeholders.

    Supports both legacy (List[str]) and new (List[PhraseParameter]) parameter formats.
    """

    id: str
    role: str
    phrase_template: str
    # Support both old format (List[str]) and new format (List[PhraseParameter])
    parameters: Union[List[str], List[PhraseParameter]]
    references: List[str]
    description: str

    def get_parameter_names(self) -> List[str]:
        """Get list of parameter names regardless of format."""
        if not self.parameters:
            return []
        if isinstance(self.parameters[0], str):
            return self.parameters  # type: ignore
        return [p.name for p in self.parameters]  # type: ignore

    def get_parameter_binding(self, name: str) -> Optional[PhraseParameter]:
        """Get parameter binding by name (returns None for legacy format)."""
        if not self.parameters or isinstance(self.parameters[0], str):
            return None
        for p in self.parameters:
            if isinstance(p, PhraseParameter) and p.name == name:
                return p
        return None


class ComposedPhrase(BaseModel):
    """A phrase as used in a sentence composition."""

    phrase_id: str
    order: int
    bound_value: Optional[str] = None
    bound_values: Optional[Dict[str, str]] = None


class Sentence(BaseModel):
    """A composed sentence from phrases."""

    id: str
    name: str
    describes: str
    text: str
    composed_of: List[ComposedPhrase]
    traceability: Optional[Dict[str, Any]] = None


class PhrasesFile(BaseModel):
    """Container for the phrases JSON file."""

    schema_: Optional[str] = Field(None, alias="$schema")
    version: str
    description: str
    static_phrases: List[StaticPhrase]
    parameterized_phrases: List[ParameterizedPhrase]
    sentences: List[Sentence]


# =============================================================================
# Mappings - Simple data_concept to implementation variable mappings
# =============================================================================

class ImplementationMapping(BaseModel):
    """Consolidated mapping file - data concept to implementation variables."""

    schema_: Optional[str] = Field(None, alias="$schema")
    version: str
    description: str
    data_concept_to_adam: Dict[str, str]  # data_concept -> ADaM variable
    data_concept_to_sdtm: Dict[str, str]  # data_concept -> SDTM variable
    adam_variable_to_dataset: Dict[str, List[str]]  # variable -> datasets


# Legacy mapping models (for backwards compatibility)
class SDTMMapping(BaseModel):
    """A single SDTM to STC mapping (legacy)."""

    sdtm_variable: str
    stc: str
    data_type: str
    note: Optional[str] = None
    filter: Optional[str] = None


class SDTMDomainMapping(BaseModel):
    """Mappings for an SDTM domain (legacy)."""

    domain: str
    description: str
    dataset: str
    mappings: List[Dict[str, Any]]
    key_visits: Optional[Dict[str, Any]] = None
    dose_mapping: Optional[Dict[str, Any]] = None


class SDTMMappingFile(BaseModel):
    """Container for the SDTM to STC mapping file (legacy)."""

    schema_: Optional[str] = Field(None, alias="$schema")
    version: str
    description: str
    standard: Dict[str, str]
    domain_mappings: List[SDTMDomainMapping]
    parameter_mapping: Optional[Dict[str, Any]] = None


class ADAMMapping(BaseModel):
    """A single STC to ADaM mapping (legacy)."""

    stc: str
    adam_variable: str
    data_type: str
    label: Optional[str] = None
    note: Optional[str] = None
    derived: Optional[bool] = None
    values: Optional[List[str]] = None


class ADAMClassMapping(BaseModel):
    """Mappings for an ADaM class (legacy)."""

    adam_class: str
    description: str
    dataset: Optional[str] = None
    mappings: List[Dict[str, Any]]


class ADAMMappingFile(BaseModel):
    """Container for the STC to ADaM mapping file (legacy)."""

    schema_: Optional[str] = Field(None, alias="$schema")
    version: str
    description: str
    standard: Dict[str, str]
    class_mappings: List[ADAMClassMapping]
    parameter_value_mapping: Optional[Dict[str, Any]] = None
    visit_value_mapping: Optional[Dict[str, Any]] = None
    treatment_dose_mapping: Optional[Dict[str, Any]] = None


# =============================================================================
# Extended Template Models (for multiple method support)
# =============================================================================

class MethodBinding(BaseModel):
    """A method used by a template with its role bindings.

    Supports templates that reference multiple methods (e.g.,
    ChangeFromBaseline can use Subtraction + LOCF).
    """
    method_ref: str = Field(..., description="Reference to method name")
    role_bindings: List[RoleBinding] = []
    parameters: Dict[str, Any] = {}
    optional: bool = False  # For alternative methods


class TemplateExtended(BaseModel):
    """Extended template model supporting multiple methods.

    This extends the basic Template to allow templates to reference
    multiple methods with separate role bindings for each.
    """
    id: str
    name: str
    type: Literal["derivation", "analysis"]
    version: str = "1.0.0"
    clinical_intent: str = ""

    # Support both single method (legacy) and multiple methods (new)
    uses_method: Optional[str] = None  # Legacy single method
    methods: List[MethodBinding] = []  # New: multiple methods

    # Legacy role_bindings (when uses_method is set)
    role_bindings: List[RoleBinding] = []

    parameters: Dict[str, Any] = {}
    del_expression: Optional[str] = None
    model_specification: Optional[ModelSpecification] = None
    required_phrases: Optional[List[RequiredPhrase]] = None

    # Smart phrase association
    smart_phrase: Optional[str] = None

    # Cube definitions for template (optional - can be defined at template level)
    input_cube: Optional[Cube] = None
    output_cube: Optional[Cube] = None
    slice: Optional[Slice] = None

    def get_all_methods(self) -> List[str]:
        """Get all method names this template uses."""
        methods = []
        if self.uses_method:
            methods.append(self.uses_method)
        for mb in self.methods:
            if mb.method_ref not in methods:
                methods.append(mb.method_ref)
        return methods

    def get_role_bindings_for_method(self, method_name: str) -> List[RoleBinding]:
        """Get role bindings for a specific method."""
        # Check new structure first
        for mb in self.methods:
            if mb.method_ref == method_name:
                return mb.role_bindings
        # Fall back to legacy structure
        if self.uses_method == method_name:
            return self.role_bindings
        return []


# =============================================================================
# Library Data Model (for library.json persistence)
# =============================================================================

class LibraryData(BaseModel):
    """Complete library data structure for persistence.

    This is the root model for the library.json file.
    """
    version: str = "1.0.0"
    description: str = "AC/DC Standards Library"

    methods: Dict[str, List[Method]] = Field(
        default_factory=lambda: {"derivation": [], "analysis": []}
    )
    concepts: Dict[str, List[STC]] = Field(
        default_factory=lambda: {"observation": [], "inference": []}
    )
    templates: Dict[str, List[TemplateExtended]] = Field(
        default_factory=lambda: {"dc": [], "ac": []}
    )
    phrases: Dict[str, Any] = Field(
        default_factory=lambda: {
            "static_phrases": [],
            "parameterized_phrases": [],
            "sentences": []
        }
    )

    # Default methods (library-level settings)
    default_derivation_method: Optional[str] = None
    default_analysis_method: Optional[str] = None
