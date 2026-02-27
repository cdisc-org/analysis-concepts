"""Sentence builder - compose analysis sentences from phrases.

Provides functions to assemble sentences from static and parameterized phrases.
"""

import re
from typing import Any, Dict, List, Optional, Tuple, Union

from .library import Library
from .models import ComposedPhrase, ParameterizedPhrase, Sentence, StaticPhrase


def get_phrase_text(
    phrase: Union[StaticPhrase, ParameterizedPhrase],
    bound_value: Optional[str] = None,
    bound_values: Optional[Dict[str, str]] = None,
) -> str:
    """Get the text for a phrase, substituting any parameters.

    Args:
        phrase: The phrase to render
        bound_value: Single bound value (for simple parameterized phrases)
        bound_values: Dictionary of bound values (for multi-parameter phrases)

    Returns:
        The rendered phrase text
    """
    text = phrase.phrase_template

    if isinstance(phrase, ParameterizedPhrase):
        if bound_values:
            for param, value in bound_values.items():
                text = text.replace(f"{{{param}}}", value)
        elif bound_value and phrase.parameters:
            # Single value for first parameter
            text = text.replace(f"{{{phrase.parameters[0]}}}", bound_value)

    return text


def compose_sentence(
    library: Library, sentence: Sentence
) -> Tuple[str, List[Dict[str, Any]]]:
    """Compose a full sentence from its constituent phrases.

    Args:
        library: The loaded library
        sentence: The sentence to compose

    Returns:
        Tuple of (composed text, list of phrase details)
    """
    phrase_details = []

    # Sort by order
    ordered_phrases = sorted(sentence.composed_of, key=lambda p: p.order)

    for cp in ordered_phrases:
        phrase = library.get_phrase_by_id(cp.phrase_id)
        if phrase:
            text = get_phrase_text(phrase, cp.bound_value, cp.bound_values)
            phrase_details.append(
                {
                    "phrase_id": cp.phrase_id,
                    "order": cp.order,
                    "role": phrase.role,
                    "text": text,
                    "references": phrase.references,
                    "bound_value": cp.bound_value,
                    "bound_values": cp.bound_values,
                }
            )

    # The sentence already has composed text, but we can regenerate it
    # For now, return the pre-composed text
    return sentence.text, phrase_details


def get_available_phrase_slots(sentence: Sentence) -> List[Dict[str, Any]]:
    """Get the available phrase slots for a sentence with their current values.

    Args:
        sentence: The sentence to analyze

    Returns:
        List of slot dictionaries with phrase info and current values
    """
    slots = []
    for cp in sorted(sentence.composed_of, key=lambda p: p.order):
        slots.append(
            {
                "phrase_id": cp.phrase_id,
                "order": cp.order,
                "bound_value": cp.bound_value,
                "bound_values": cp.bound_values,
            }
        )
    return slots


def update_sentence_binding(
    sentence: Sentence,
    phrase_id: str,
    new_value: Optional[str] = None,
    new_values: Optional[Dict[str, str]] = None,
) -> Sentence:
    """Create a new sentence with updated binding values.

    Args:
        sentence: Original sentence
        phrase_id: ID of phrase to update
        new_value: New single bound value
        new_values: New dictionary of bound values

    Returns:
        New Sentence with updated bindings
    """
    new_composed = []
    for cp in sentence.composed_of:
        if cp.phrase_id == phrase_id:
            new_cp = ComposedPhrase(
                phrase_id=cp.phrase_id,
                order=cp.order,
                bound_value=new_value if new_value else cp.bound_value,
                bound_values=new_values if new_values else cp.bound_values,
            )
            new_composed.append(new_cp)
        else:
            new_composed.append(cp)

    # Create new sentence with updated text (simplified - just update bindings)
    return Sentence(
        id=sentence.id,
        name=sentence.name,
        describes=sentence.describes,
        text=sentence.text,  # Would need to regenerate
        composed_of=new_composed,
        traceability=sentence.traceability,
    )


def regenerate_sentence_text(library: Library, sentence: Sentence) -> str:
    """Regenerate the full sentence text from phrases.

    Args:
        library: The loaded library
        sentence: The sentence to regenerate

    Returns:
        New composed text
    """
    parts = []
    ordered = sorted(sentence.composed_of, key=lambda p: p.order)

    for cp in ordered:
        phrase = library.get_phrase_by_id(cp.phrase_id)
        if phrase:
            text = get_phrase_text(phrase, cp.bound_value, cp.bound_values)
            parts.append(text)

    # Simple join - in reality would need more sophisticated assembly
    return " ".join(parts)


def get_stcs_from_sentence(library: Library, sentence: Sentence) -> List[str]:
    """Get all STCs referenced by a sentence's phrases.

    Args:
        library: The loaded library
        sentence: The sentence to analyze

    Returns:
        List of STC names referenced
    """
    stcs = set()
    for cp in sentence.composed_of:
        phrase = library.get_phrase_by_id(cp.phrase_id)
        if phrase and phrase.references:
            stcs.update(phrase.references)
    return list(stcs)


def get_templates_from_stcs(library: Library, stc_names: List[str]) -> List[str]:
    """Get templates that use the given STCs.

    Args:
        library: The loaded library
        stc_names: List of STC names

    Returns:
        List of template IDs that use these STCs
    """
    templates = []
    stc_set = set(stc_names)

    for template in library.all_templates:
        template_stcs = {
            rb.semantic_transformation_concept for rb in template.role_bindings
        }
        if template_stcs & stc_set:
            templates.append(template.id)

    return templates
