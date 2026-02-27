"""Library loader and query functions for AC/DC Framework metadata.

Loads all JSON files from the metadata folder and provides query functions.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .models import (
    ACInstance,
    ACInstanceFile,
    ADAMMappingFile,
    DCInstance,
    DCInstanceFile,
    ImplementationMapping,
    Method,
    MethodFile,
    ParameterizedPhrase,
    PhrasesFile,
    SDTMMappingFile,
    Sentence,
    STC,
    STCFile,
    StaticPhrase,
    Template,
    TemplateExtended,
    TemplateFile,
)

# Default path: relative to acdc-workbench folder (up to parent, then metadata)
DEFAULT_METADATA_PATH = Path(__file__).parent.parent.parent / "metadata"


@dataclass
class Library:
    """Container for all AC/DC Framework metadata."""

    # Concepts
    observation_concepts: List[STC] = field(default_factory=list)
    inference_concepts: List[STC] = field(default_factory=list)

    # Methods
    derivation_methods: List[Method] = field(default_factory=list)
    analysis_methods: List[Method] = field(default_factory=list)

    # Templates (using TemplateExtended to support cube/slice fields)
    dc_templates: List[TemplateExtended] = field(default_factory=list)
    ac_templates: List[TemplateExtended] = field(default_factory=list)

    # Instances
    dc_instances: List[DCInstance] = field(default_factory=list)
    ac_instances: List[ACInstance] = field(default_factory=list)

    # Phrases
    static_phrases: List[StaticPhrase] = field(default_factory=list)
    parameterized_phrases: List[ParameterizedPhrase] = field(default_factory=list)
    sentences: List[Sentence] = field(default_factory=list)

    # Implementation mapping (data_concept -> variable)
    implementation_mapping: Optional[ImplementationMapping] = None

    # Legacy mappings (raw dicts for backwards compatibility)
    sdtm_mappings: Optional[Dict[str, Any]] = None
    adam_mappings: Optional[Dict[str, Any]] = None

    # ----- Query Methods -----

    @property
    def all_concepts(self) -> List[STC]:
        """Get all concepts (observation + inference)."""
        return self.observation_concepts + self.inference_concepts

    @property
    def all_methods(self) -> List[Method]:
        """Get all methods (derivation + analysis)."""
        return self.derivation_methods + self.analysis_methods

    @property
    def all_templates(self) -> List[Template]:
        """Get all templates (DC + AC)."""
        return self.dc_templates + self.ac_templates

    @property
    def all_instances(self) -> List[Union[DCInstance, ACInstance]]:
        """Get all instances (DC + AC)."""
        return self.dc_instances + self.ac_instances

    @property
    def all_phrases(self) -> List[Union[StaticPhrase, ParameterizedPhrase]]:
        """Get all phrases (static + parameterized)."""
        return self.static_phrases + self.parameterized_phrases

    def get_concept_by_name(self, name: str) -> Optional[STC]:
        """Get a concept by name."""
        for concept in self.all_concepts:
            if concept.name == name:
                return concept
        return None

    def get_method_by_name(self, name: str) -> Optional[Method]:
        """Get a method by name."""
        for method in self.all_methods:
            if method.name == name:
                return method
        return None

    def get_template_by_id(self, template_id: str) -> Optional[Template]:
        """Get a template by ID."""
        for template in self.all_templates:
            if template.id == template_id:
                return template
        return None

    def get_template_by_name(self, name: str) -> Optional[Template]:
        """Get a template by name."""
        for template in self.all_templates:
            if template.name == name:
                return template
        return None

    def get_instance_by_id(
        self, instance_id: str
    ) -> Optional[Union[DCInstance, ACInstance]]:
        """Get an instance by ID."""
        for instance in self.all_instances:
            if instance.id == instance_id:
                return instance
        return None

    def get_phrase_by_id(
        self, phrase_id: str
    ) -> Optional[Union[StaticPhrase, ParameterizedPhrase]]:
        """Get a phrase by ID."""
        for phrase in self.all_phrases:
            if phrase.id == phrase_id:
                return phrase
        return None

    def get_sentence_by_id(self, sentence_id: str) -> Optional[Sentence]:
        """Get a sentence by ID."""
        for sentence in self.sentences:
            if sentence.id == sentence_id:
                return sentence
        return None

    def search_concepts(self, query: str) -> List[STC]:
        """Search concepts by name or description."""
        query_lower = query.lower()
        return [
            c
            for c in self.all_concepts
            if query_lower in c.name.lower() or query_lower in c.description.lower()
        ]

    def search_methods(self, query: str) -> List[Method]:
        """Search methods by name or description."""
        query_lower = query.lower()
        return [
            m
            for m in self.all_methods
            if query_lower in m.name.lower() or query_lower in m.description.lower()
        ]

    def search_templates(self, query: str) -> List[Template]:
        """Search templates by name, ID, or clinical intent."""
        query_lower = query.lower()
        return [
            t
            for t in self.all_templates
            if query_lower in t.name.lower()
            or query_lower in t.id.lower()
            or query_lower in t.clinical_intent.lower()
        ]

    def get_template_for_instance(
        self, instance: Union[DCInstance, ACInstance]
    ) -> Optional[Template]:
        """Get the template that an instance is based on."""
        return self.get_template_by_id(instance.instance_of)

    def get_method_for_template(self, template: Template) -> Optional[Method]:
        """Get the method that a template uses."""
        return self.get_method_by_name(template.uses_method)

    def get_concepts_for_template(self, template: Template) -> List[STC]:
        """Get all concepts referenced by a template's role bindings."""
        concepts = []
        for binding in template.role_bindings:
            concept = self.get_concept_by_name(binding.semantic_transformation_concept)
            if concept:
                concepts.append(concept)
        return concepts

    def get_dc_instances_for_ac(self, ac_instance: ACInstance) -> List[DCInstance]:
        """Get DC instances that an AC instance depends on."""
        if not ac_instance.depends_on:
            return []
        return [
            inst
            for inst in self.dc_instances
            if inst.id in ac_instance.depends_on
        ]

    def resolve_data_concept_to_adam(self, data_concept: str) -> Optional[str]:
        """Resolve a data concept to an ADaM variable name."""
        if self.implementation_mapping:
            return self.implementation_mapping.data_concept_to_adam.get(data_concept)
        return None

    def resolve_data_concept_to_sdtm(self, data_concept: str) -> Optional[str]:
        """Resolve a data concept to an SDTM variable name."""
        if self.implementation_mapping:
            return self.implementation_mapping.data_concept_to_sdtm.get(data_concept)
        return None


def load_library(base_path: Path = DEFAULT_METADATA_PATH) -> Library:
    """Load all JSON files from the metadata folder.

    Args:
        base_path: Path to the metadata folder

    Returns:
        Library object containing all loaded metadata
    """
    library = Library()

    # Ensure path exists
    if not base_path.exists():
        raise FileNotFoundError(f"Metadata path not found: {base_path}")

    # Load concepts
    concepts_path = base_path / "concepts" / "semantic_transformation_concepts.json"
    if concepts_path.exists():
        with open(concepts_path) as f:
            data = json.load(f)
            stc_file = STCFile(**data)
            library.observation_concepts = stc_file.concepts.get(
                "observation_level", []
            )
            library.inference_concepts = stc_file.concepts.get("inference_level", [])

    # Load derivation methods
    deriv_methods_path = base_path / "methods" / "derivation_methods.json"
    if deriv_methods_path.exists():
        with open(deriv_methods_path) as f:
            data = json.load(f)
            method_file = MethodFile(**data)
            library.derivation_methods = method_file.methods

    # Load analysis methods
    analysis_methods_path = base_path / "methods" / "analysis_methods.json"
    if analysis_methods_path.exists():
        with open(analysis_methods_path) as f:
            data = json.load(f)
            method_file = MethodFile(**data)
            library.analysis_methods = method_file.methods

    # Load DC templates (convert Template to TemplateExtended)
    dc_templates_path = base_path / "templates" / "dc"
    if dc_templates_path.exists():
        for template_file in dc_templates_path.glob("*.json"):
            with open(template_file) as f:
                data = json.load(f)
                tf = TemplateFile(**data)
                # Convert Template to TemplateExtended
                library.dc_templates.append(TemplateExtended(**tf.template.model_dump()))

    # Load AC templates (convert Template to TemplateExtended)
    ac_templates_path = base_path / "templates" / "ac"
    if ac_templates_path.exists():
        for template_file in ac_templates_path.glob("*.json"):
            with open(template_file) as f:
                data = json.load(f)
                tf = TemplateFile(**data)
                # Convert Template to TemplateExtended
                library.ac_templates.append(TemplateExtended(**tf.template.model_dump()))

    # Load DC instances
    dc_instances_path = base_path / "instances" / "dc"
    if dc_instances_path.exists():
        for instance_file in dc_instances_path.glob("*.json"):
            with open(instance_file) as f:
                data = json.load(f)
                inst_file = DCInstanceFile(**data)
                library.dc_instances.append(inst_file.instance)

    # Load AC instances
    ac_instances_path = base_path / "instances" / "ac"
    if ac_instances_path.exists():
        for instance_file in ac_instances_path.glob("*.json"):
            with open(instance_file) as f:
                data = json.load(f)
                inst_file = ACInstanceFile(**data)
                library.ac_instances.append(inst_file.instance)

    # Load phrases
    phrases_path = base_path / "phrases" / "primary_analysis_phrases.json"
    if phrases_path.exists():
        with open(phrases_path) as f:
            data = json.load(f)
            phrases_file = PhrasesFile(**data)
            library.static_phrases = phrases_file.static_phrases
            library.parameterized_phrases = phrases_file.parameterized_phrases
            library.sentences = phrases_file.sentences

    # Load implementation mapping (new consolidated format)
    impl_mapping_path = base_path / "mappings" / "implementation_to_stc.json"
    if impl_mapping_path.exists():
        with open(impl_mapping_path) as f:
            data = json.load(f)
            library.implementation_mapping = ImplementationMapping(**data)

    # Load legacy mappings (as raw dicts for backwards compatibility)
    sdtm_mapping_path = base_path / "mappings" / "sdtm_to_stc.json"
    if sdtm_mapping_path.exists():
        with open(sdtm_mapping_path) as f:
            library.sdtm_mappings = json.load(f)

    adam_mapping_path = base_path / "mappings" / "stc_to_adam.json"
    if adam_mapping_path.exists():
        with open(adam_mapping_path) as f:
            library.adam_mappings = json.load(f)

    return library


def get_entity_as_dict(entity: Any) -> Dict[str, Any]:
    """Convert a Pydantic model to a dictionary for JSON display."""
    if hasattr(entity, "model_dump"):
        return entity.model_dump(exclude_none=True)
    elif hasattr(entity, "dict"):
        return entity.dict(exclude_none=True)
    return {}


# =============================================================================
# Library CRUD Operations (for the new library-centric app)
# =============================================================================

# Path to the library.json file
DEFAULT_LIBRARY_JSON = Path(__file__).parent.parent / "data" / "library.json"


def save_library_to_json(
    library: Library,
    path: Path = DEFAULT_LIBRARY_JSON,
    default_methods: Optional[Dict[str, Optional[str]]] = None,
) -> None:
    """Save the library to a single JSON file.

    Args:
        library: The Library object to save
        path: Path to save the library.json file
        default_methods: Optional dict with default method names by type
    """
    # Ensure directory exists
    path.parent.mkdir(parents=True, exist_ok=True)

    # Convert to the LibraryData format
    data = {
        "version": "1.0.0",
        "description": "AC/DC Standards Library",
        "methods": {
            "derivation": [get_entity_as_dict(m) for m in library.derivation_methods],
            "analysis": [get_entity_as_dict(m) for m in library.analysis_methods],
        },
        "concepts": {
            "observation": [get_entity_as_dict(c) for c in library.observation_concepts],
            "inference": [get_entity_as_dict(c) for c in library.inference_concepts],
        },
        "templates": {
            "dc": [get_entity_as_dict(t) for t in library.dc_templates],
            "ac": [get_entity_as_dict(t) for t in library.ac_templates],
        },
        "phrases": {
            "static_phrases": [get_entity_as_dict(p) for p in library.static_phrases],
            "parameterized_phrases": [get_entity_as_dict(p) for p in library.parameterized_phrases],
            # NOTE: Sentences are study-level, not library-level - not saved here
        },
    }

    # Add default method settings if provided
    if default_methods:
        if default_methods.get("derivation"):
            data["default_derivation_method"] = default_methods["derivation"]
        if default_methods.get("analysis"):
            data["default_analysis_method"] = default_methods["analysis"]

    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def load_library_from_json(
    path: Path = DEFAULT_LIBRARY_JSON,
) -> tuple[Optional[Library], Dict[str, Optional[str]]]:
    """Load the library from a single JSON file.

    Args:
        path: Path to the library.json file

    Returns:
        Tuple of (Library object or None, default_methods dict)
    """
    if not path.exists():
        return None, {}

    with open(path) as f:
        data = json.load(f)

    library = Library()

    # Load methods
    methods_data = data.get("methods", {})
    for m_data in methods_data.get("derivation", []):
        library.derivation_methods.append(Method(**m_data))
    for m_data in methods_data.get("analysis", []):
        library.analysis_methods.append(Method(**m_data))

    # Load concepts
    concepts_data = data.get("concepts", {})
    for c_data in concepts_data.get("observation", []):
        library.observation_concepts.append(STC(**c_data))
    for c_data in concepts_data.get("inference", []):
        library.inference_concepts.append(STC(**c_data))

    # Load templates (using TemplateExtended to support cube/slice fields)
    templates_data = data.get("templates", {})
    for t_data in templates_data.get("dc", []):
        library.dc_templates.append(TemplateExtended(**t_data))
    for t_data in templates_data.get("ac", []):
        library.ac_templates.append(TemplateExtended(**t_data))

    # Load phrases (sentences are study-level, not loaded from library)
    phrases_data = data.get("phrases", {})
    for p_data in phrases_data.get("static_phrases", []):
        library.static_phrases.append(StaticPhrase(**p_data))
    for p_data in phrases_data.get("parameterized_phrases", []):
        library.parameterized_phrases.append(ParameterizedPhrase(**p_data))

    # Load default method settings
    default_methods = {
        "derivation": data.get("default_derivation_method"),
        "analysis": data.get("default_analysis_method"),
    }

    return library, default_methods


def get_or_create_library(
    metadata_path: Path = DEFAULT_METADATA_PATH,
    library_json_path: Path = DEFAULT_LIBRARY_JSON,
    prefer_json: bool = True,
) -> tuple[Library, Dict[str, Optional[str]]]:
    """Get library from JSON file, or load from metadata and create JSON.

    Args:
        metadata_path: Path to metadata folder (for initial load)
        library_json_path: Path to library.json file
        prefer_json: If True, use JSON file if it exists; if False, always load from metadata

    Returns:
        Tuple of (Library object, default_methods dict)
    """
    if prefer_json and library_json_path.exists():
        library, default_methods = load_library_from_json(library_json_path)
        if library:
            return library, default_methods

    # Load from metadata files
    library = load_library(metadata_path)

    # Save to JSON for future use
    save_library_to_json(library, library_json_path)

    return library, {}


# =============================================================================
# CRUD Methods for Library entities
# =============================================================================

class LibraryCRUD:
    """CRUD operations for library entities with explicit save."""

    def __init__(
        self,
        metadata_path: Path = DEFAULT_METADATA_PATH,
        library_json_path: Path = DEFAULT_LIBRARY_JSON,
    ):
        self.metadata_path = metadata_path
        self.library_json_path = library_json_path
        self._library: Optional[Library] = None
        self._dirty = False
        self._default_derivation_method: Optional[str] = None
        self._default_analysis_method: Optional[str] = None

    @property
    def library(self) -> Library:
        """Get the library, loading if necessary."""
        if self._library is None:
            self._library, default_methods = get_or_create_library(
                self.metadata_path,
                self.library_json_path,
                prefer_json=True,
            )
            # Load default methods
            self._default_derivation_method = default_methods.get("derivation")
            self._default_analysis_method = default_methods.get("analysis")
        return self._library

    @property
    def is_dirty(self) -> bool:
        """Check if there are unsaved changes."""
        return self._dirty

    def mark_dirty(self) -> None:
        """Mark the library as having unsaved changes."""
        self._dirty = True

    def save(self) -> None:
        """Save the library to JSON file."""
        if self._library:
            save_library_to_json(
                self._library,
                self.library_json_path,
                default_methods=self.get_all_default_methods(),
            )
            self._dirty = False

    def reload_from_metadata(self) -> None:
        """Reload library from metadata files (discards changes)."""
        self._library = load_library(self.metadata_path)
        self._default_derivation_method = None
        self._default_analysis_method = None
        save_library_to_json(self._library, self.library_json_path)
        self._dirty = False

    # --- Method CRUD ---

    def add_method(self, method: Method) -> None:
        """Add a new method."""
        if method.type == "derivation":
            self.library.derivation_methods.append(method)
        else:
            self.library.analysis_methods.append(method)
        self.mark_dirty()

    def update_method(self, name: str, method: Method) -> bool:
        """Update an existing method by name."""
        methods_list = (
            self.library.derivation_methods
            if method.type == "derivation"
            else self.library.analysis_methods
        )
        for i, m in enumerate(methods_list):
            if m.name == name:
                methods_list[i] = method
                self.mark_dirty()
                return True
        return False

    def delete_method(self, name: str) -> bool:
        """Delete a method by name."""
        for methods_list in [self.library.derivation_methods, self.library.analysis_methods]:
            for i, m in enumerate(methods_list):
                if m.name == name:
                    methods_list.pop(i)
                    self.mark_dirty()
                    return True
        return False

    # --- Concept CRUD ---

    def add_concept(self, concept: STC) -> None:
        """Add a new concept."""
        if concept.level == "observation":
            self.library.observation_concepts.append(concept)
        else:
            self.library.inference_concepts.append(concept)
        self.mark_dirty()

    def update_concept(self, name: str, concept: STC) -> bool:
        """Update an existing concept by name."""
        concepts_list = (
            self.library.observation_concepts
            if concept.level == "observation"
            else self.library.inference_concepts
        )
        for i, c in enumerate(concepts_list):
            if c.name == name:
                concepts_list[i] = concept
                self.mark_dirty()
                return True
        return False

    def delete_concept(self, name: str) -> bool:
        """Delete a concept by name."""
        for concepts_list in [self.library.observation_concepts, self.library.inference_concepts]:
            for i, c in enumerate(concepts_list):
                if c.name == name:
                    concepts_list.pop(i)
                    self.mark_dirty()
                    return True
        return False

    # --- Template CRUD ---

    def add_template(self, template: Union[Template, TemplateExtended]) -> None:
        """Add a new template."""
        # Convert Template to TemplateExtended if needed
        if isinstance(template, Template) and not isinstance(template, TemplateExtended):
            template = TemplateExtended(**template.model_dump())
        if template.type == "derivation":
            self.library.dc_templates.append(template)
        else:
            self.library.ac_templates.append(template)
        self.mark_dirty()

    def update_template(self, template_id: str, template: Union[Template, TemplateExtended]) -> bool:
        """Update an existing template by ID."""
        # Convert Template to TemplateExtended if needed
        if isinstance(template, Template) and not isinstance(template, TemplateExtended):
            template = TemplateExtended(**template.model_dump())
        templates_list = (
            self.library.dc_templates
            if template.type == "derivation"
            else self.library.ac_templates
        )
        for i, t in enumerate(templates_list):
            if t.id == template_id:
                templates_list[i] = template
                self.mark_dirty()
                return True
        return False

    def delete_template(self, template_id: str) -> bool:
        """Delete a template by ID."""
        for templates_list in [self.library.dc_templates, self.library.ac_templates]:
            for i, t in enumerate(templates_list):
                if t.id == template_id:
                    templates_list.pop(i)
                    self.mark_dirty()
                    return True
        return False

    # --- Phrase CRUD ---

    def add_static_phrase(self, phrase: StaticPhrase) -> None:
        """Add a new static phrase."""
        self.library.static_phrases.append(phrase)
        self.mark_dirty()

    def add_parameterized_phrase(self, phrase: ParameterizedPhrase) -> None:
        """Add a new parameterized phrase."""
        self.library.parameterized_phrases.append(phrase)
        self.mark_dirty()

    def update_static_phrase(self, phrase_id: str, phrase: StaticPhrase) -> bool:
        """Update an existing static phrase by ID."""
        for i, p in enumerate(self.library.static_phrases):
            if p.id == phrase_id:
                self.library.static_phrases[i] = phrase
                self.mark_dirty()
                return True
        return False

    def update_parameterized_phrase(self, phrase_id: str, phrase: ParameterizedPhrase) -> bool:
        """Update an existing parameterized phrase by ID."""
        for i, p in enumerate(self.library.parameterized_phrases):
            if p.id == phrase_id:
                self.library.parameterized_phrases[i] = phrase
                self.mark_dirty()
                return True
        return False

    def get_static_phrase_by_id(self, phrase_id: str) -> Optional[StaticPhrase]:
        """Get a static phrase by ID."""
        for p in self.library.static_phrases:
            if p.id == phrase_id:
                return p
        return None

    def get_parameterized_phrase_by_id(self, phrase_id: str) -> Optional[ParameterizedPhrase]:
        """Get a parameterized phrase by ID."""
        for p in self.library.parameterized_phrases:
            if p.id == phrase_id:
                return p
        return None

    def delete_phrase(self, phrase_id: str) -> bool:
        """Delete a phrase by ID."""
        for i, p in enumerate(self.library.static_phrases):
            if p.id == phrase_id:
                self.library.static_phrases.pop(i)
                self.mark_dirty()
                return True
        for i, p in enumerate(self.library.parameterized_phrases):
            if p.id == phrase_id:
                self.library.parameterized_phrases.pop(i)
                self.mark_dirty()
                return True
        return False

    # --- Default Method Settings ---

    def get_default_method(self, method_type: str) -> Optional[str]:
        """Get the default method name for a given type.

        Args:
            method_type: 'derivation' or 'analysis'

        Returns:
            Method name or None if not set
        """
        return getattr(self, f"_default_{method_type}_method", None)

    def set_default_method(self, method_type: str, method_name: Optional[str]) -> None:
        """Set the default method for a given type.

        Args:
            method_type: 'derivation' or 'analysis'
            method_name: Method name or None to clear
        """
        setattr(self, f"_default_{method_type}_method", method_name)
        self.mark_dirty()

    def get_all_default_methods(self) -> Dict[str, Optional[str]]:
        """Get all default method settings."""
        return {
            "derivation": getattr(self, "_default_derivation_method", None),
            "analysis": getattr(self, "_default_analysis_method", None),
        }
