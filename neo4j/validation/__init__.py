"""
Validation module for Define-JSON Analysis Concept extensions.

This module provides Pydantic models for type-safe validation and generation
of Define-JSON library files with analysis concept extensions.

Main exports:
    - ReifiedConcept: Base class for all concepts
    - AnalysisConcept: Statistical analysis pattern specification
    - DataConcept: Abstract data semantic specification
    - BuildingBlock: Reusable phrase template
    - validate_json_file: Utility function for file validation
"""

from .pydantic_models import (
    # Main concept classes
    ReifiedConcept,
    AnalysisConcept,
    DataConcept,
    BuildingBlock,

    # Component classes
    TemplateParameter,
    ConceptInput,
    ConceptOutput,
    BuildingBlockReference,
    DerivationMethod,

    # Container classes
    MetaDataVersion,
    DefineJSONLibrary,

    # Enumerations
    ConceptType,
    DataType,
    AdamClass,
    MethodCategory,

    # Utility functions
    validate_json_file,
    concept_factory,
)

__all__ = [
    # Main concept classes
    "ReifiedConcept",
    "AnalysisConcept",
    "DataConcept",
    "BuildingBlock",

    # Component classes
    "TemplateParameter",
    "ConceptInput",
    "ConceptOutput",
    "BuildingBlockReference",
    "DerivationMethod",

    # Container classes
    "MetaDataVersion",
    "DefineJSONLibrary",

    # Enumerations
    "ConceptType",
    "DataType",
    "AdamClass",
    "MethodCategory",

    # Utility functions
    "validate_json_file",
    "concept_factory",
]
