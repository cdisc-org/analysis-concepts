"""AC/DC Standards Library - Streamlit Application.

A library-centric application for managing Methods, Concepts, Templates,
and viewing dependencies in the AC/DC Framework.

Usage:
    cd examples/cdiscpilot01_primary_analysis
    streamlit run acdc-workbench/app.py
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import streamlit as st

from lib.branding import CDISC_COLORS, get_cdisc_css, get_entity_badge
from lib.library import LibraryCRUD, get_entity_as_dict
from lib.models import PhraseParameter

# Page config
st.set_page_config(
    page_title="AC/DC Standards Library",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Apply CDISC branding CSS
st.markdown(get_cdisc_css(), unsafe_allow_html=True)


# =============================================================================
# Session State and Library Management
# =============================================================================

def get_crud() -> LibraryCRUD:
    """Get or create the LibraryCRUD instance in session state."""
    if "crud" not in st.session_state:
        metadata_path = Path(__file__).parent.parent / "metadata"
        library_json_path = Path(__file__).parent / "data" / "library.json"
        st.session_state.crud = LibraryCRUD(metadata_path, library_json_path)
    return st.session_state.crud


def _clear_all_form_states():
    """Clear all form states to prevent interference between forms.

    This ensures that when opening one form (e.g., Method edit),
    other forms (e.g., Template edit) are properly closed.
    """
    # First, explicitly set all "show" flags to False
    st.session_state.show_method_form = False
    st.session_state.show_concept_form = False
    st.session_state.show_template_form = False
    st.session_state.show_static_phrase_form = False
    st.session_state.show_parameterized_phrase_form = False

    # Then delete all form-related state
    form_keys = [
        # Method form
        "editing_method",
        "method_form_roles", "method_form_params",
        # Concept form
        "editing_concept",
        "concept_form_derived_from",
        # Template form
        "editing_template",
        "template_methods", "template_role_bindings",
        "input_cube_dims", "input_cube_measures",
        "output_cube_dims", "output_cube_measures",
        "slice_constraints",
        # Phrase forms
        "editing_static_phrase",
        "editing_parameterized_phrase",
        "phrase_params",
    ]
    for key in form_keys:
        if key in st.session_state:
            del st.session_state[key]


# =============================================================================
# Sidebar Navigation
# =============================================================================

def render_sidebar() -> str:
    """Render the sidebar navigation with CDISC logo and menu."""
    with st.sidebar:
        # CDISC Logo
        logo_path = Path(__file__).parent / "assets" / "cdisc-logo.png"
        if logo_path.exists():
            st.image(str(logo_path), width=200)

        st.markdown(
            """
            <div style="text-align: center; padding: 8px 0;">
                <h3 style="color: white; margin: 0;">AC/DC Standards Library</h3>
                <p style="color: #A1D0CA; font-size: 0.85em; margin: 4px 0;">v1.0</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown("---")

        # Initialize screen in session state if not present
        if "current_screen" not in st.session_state:
            st.session_state.current_screen = "overview"

        # Helper function for compact radio navigation within expanders
        def nav_radio(options: List[str], screens: List[str], key: str):
            """Render a compact radio nav group, updating screen on change."""
            # Determine if current screen is in this group
            current_in_group = st.session_state.current_screen in screens

            # Set index: if current screen is in this group, select it; otherwise select first
            current_idx = screens.index(st.session_state.current_screen) if current_in_group else 0

            # Track previous selection to detect actual user clicks
            state_key = f"_prev_nav_{key}"
            prev_selection = st.session_state.get(state_key, options[current_idx])

            choice = st.radio(
                key,
                options,
                index=current_idx,
                key=f"nav_{key}",
                label_visibility="collapsed"
            )

            # Update tracking
            st.session_state[state_key] = choice

            # Only navigate if user actually changed selection in this group
            new_screen = screens[options.index(choice)]
            if choice != prev_selection and new_screen != st.session_state.current_screen:
                st.session_state.current_screen = new_screen
                st.rerun()

        # Overview button (standalone)
        if st.button("🏠 Overview", key="nav_overview", use_container_width=True,
                     type="primary" if st.session_state.current_screen == "overview" else "secondary"):
            st.session_state.current_screen = "overview"
            st.rerun()

        st.markdown("")

        # Methods section - compact radio nav
        with st.expander("📐 **Methods**", expanded=True):
            nav_radio(
                ["All Methods", "├─ Derivation", "└─ Analysis"],
                ["methods", "derivation_methods", "analysis_methods"],
                "methods"
            )

        # Concepts section - compact radio nav
        with st.expander("🧩 **Concepts**", expanded=True):
            nav_radio(
                ["All Concepts", "├─ Observation", "└─ Inference"],
                ["concepts", "observation_concepts", "inference_concepts"],
                "concepts"
            )

        # Templates section - compact radio nav
        with st.expander("📋 **Templates**", expanded=True):
            nav_radio(
                ["All Templates", "├─ DC (Derivation)", "└─ AC (Analysis)"],
                ["templates", "dc_templates", "ac_templates"],
                "templates"
            )

        # Phrases section - compact radio nav
        with st.expander("💬 **Phrases**", expanded=True):
            nav_radio(
                ["All Phrases", "├─ Static", "└─ Parameterized"],
                ["phrases", "static_phrases", "parameterized_phrases"],
                "phrases"
            )

        # Dependencies button (standalone)
        if st.button("🔗 Dependencies", key="nav_dependencies", use_container_width=True,
                     type="primary" if st.session_state.current_screen == "dependencies" else "secondary"):
            st.session_state.current_screen = "dependencies"
            st.rerun()

        st.markdown("---")

        # STUDY section header
        st.markdown(
            '<p style="color: #A1D0CA; font-weight: 600; margin-bottom: 8px; font-size: 0.9em;">📊 STUDY</p>',
            unsafe_allow_html=True,
        )

        # Study section (placeholder) - compact radio nav
        with st.expander("🔬 **Study Instances**", expanded=False):
            nav_radio(
                ["DC Instances", "AC Instances", "└─ Sentences"],
                ["dc_instances", "ac_instances", "sentences"],
                "study"
            )

        # Get the screen from session state
        screen = st.session_state.current_screen

        st.markdown("---")

        # Save indicator and button
        crud = get_crud()
        if crud.is_dirty:
            st.warning("⚠️ Unsaved changes")
            col1, col2 = st.columns(2)
            with col1:
                if st.button("💾 Save", use_container_width=True):
                    crud.save()
                    st.success("Saved!")
                    st.rerun()
            with col2:
                if st.button("↩️ Revert", use_container_width=True):
                    crud.reload_from_metadata()
                    st.rerun()
        else:
            st.info("✓ All changes saved")

        st.markdown("---")

        # Quick stats
        lib = crud.library
        phrase_count = len(lib.static_phrases) + len(lib.parameterized_phrases)
        st.markdown(
            f"""
            <div style="color: white; font-size: 0.8em;">
                <p style="margin: 2px 0;"><strong style="color: #A1D0CA;">Methods:</strong> {len(lib.all_methods)}</p>
                <p style="margin: 2px 0;"><strong style="color: #A1D0CA;">Concepts:</strong> {len(lib.all_concepts)}</p>
                <p style="margin: 2px 0;"><strong style="color: #A1D0CA;">Templates:</strong> {len(lib.all_templates)}</p>
                <p style="margin: 2px 0;"><strong style="color: #A1D0CA;">Phrases:</strong> {phrase_count}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        return screen


# =============================================================================
# Overview Screen
# =============================================================================

def render_overview():
    """Render the library overview screen."""
    st.header("📚 AC/DC Standards Library")
    st.markdown("Welcome to the AC/DC Framework Standards Library. This application allows you to:")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("""
        ### 📐 Methods
        Create and manage **derivation methods** (computational operations) and **analysis methods** (statistical procedures).
        - Define DEL expressions
        - Specify roles (input/output)
        - Configure parameters
        - Associate smart phrases

        ### 🧩 Concepts
        Manage **Semantic Transformation Concepts (STCs)** at observation and inference levels.
        - Define data concepts
        - Categorize by type
        - Link to smart phrases
        """)

    with col2:
        st.markdown("""
        ### 📋 Templates
        Create **DC templates** (derivation concepts) and **AC templates** (analysis concepts).
        - Bind methods to concepts
        - Support multiple methods per template
        - Auto-generate smart sentences

        ### 🔗 Dependencies
        Visualize relationships between templates, methods, and concepts.
        - Dependency graph
        - Upstream/downstream analysis
        """)

    st.markdown("---")

    # Library summary
    crud = get_crud()
    lib = crud.library

    st.subheader("Library Summary")

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Derivation Methods", len(lib.derivation_methods))
        st.metric("Analysis Methods", len(lib.analysis_methods))

    with col2:
        st.metric("Observation Concepts", len(lib.observation_concepts))
        st.metric("Inference Concepts", len(lib.inference_concepts))

    with col3:
        st.metric("DC Templates", len(lib.dc_templates))
        st.metric("AC Templates", len(lib.ac_templates))

    with col4:
        st.metric("Static Phrases", len(lib.static_phrases))
        st.metric("Parameterized Phrases", len(lib.parameterized_phrases))


# =============================================================================
# Methods Screen
# =============================================================================

def render_methods_view(method_type: str = "all"):
    """Render the methods view screen."""
    crud = get_crud()
    lib = crud.library

    if method_type == "derivation_methods":
        st.header("📐 Derivation Methods")
        methods = lib.derivation_methods
        target_type = "derivation"
    elif method_type == "analysis_methods":
        st.header("📐 Analysis Methods")
        methods = lib.analysis_methods
        target_type = "analysis"
    else:
        st.header("📐 Methods")
        methods = lib.all_methods
        target_type = None

    # Show default method info
    if target_type:
        default_method = crud.get_default_method(target_type)
        if default_method:
            st.info(f"⭐ Default {target_type} method: **{default_method}**")
        else:
            st.caption(f"_No default {target_type} method set. Click '⭐ Set Default' on a method to set one._")

    # Search
    search = st.text_input("🔍 Search methods", placeholder="Search by name or description...")
    if search:
        methods = [m for m in methods if search.lower() in m.name.lower() or search.lower() in m.description.lower()]

    # Action buttons
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ New Method", use_container_width=True):
            _clear_all_form_states()
            st.session_state.editing_method = None
            st.session_state.show_method_form = True

    # Show method form if requested
    if st.session_state.get("show_method_form"):
        render_method_form(target_type)
        return

    # List methods
    for method in methods:
        # Check if this is the default method
        is_default = crud.get_default_method(method.type) == method.name
        default_indicator = " ⭐" if is_default else ""

        with st.expander(f"**{method.name}**{default_indicator} - {method.type}"):
            st.markdown(f"_{method.description}_")

            # DEL Expression
            st.markdown("**DEL Expression:**")
            st.code(method.del_expression, language="text")

            # Mathematical notation (for analysis methods)
            if method.mathematical_notation:
                st.markdown("**Mathematical Notation:**")
                st.latex(method.mathematical_notation)

            # Roles
            st.markdown("**Roles:**")
            for role in method.roles:
                direction = "→ (input)" if role.direction == "input" else "← (output)"
                st.markdown(f"- `{role.name}` {direction}: {role.data_type} - {role.description or ''}")

            # Parameters
            if method.parameters:
                st.markdown("**Parameters:**")
                for param in method.parameters:
                    default = f" (default: {param.default})" if param.default is not None else ""
                    values = f" [{', '.join(param.values)}]" if param.values else ""
                    st.markdown(f"- `{param.name}`: {param.type}{values}{default} - {param.description or ''}")

            # Assumptions (for analysis methods)
            if method.assumptions:
                st.markdown("**Assumptions:**")
                for assumption in method.assumptions:
                    st.markdown(f"- {assumption}")

            # Associated Smart Phrases
            method_phrases = _get_phrases_for_method(method.name, lib)
            if method_phrases:
                st.markdown("**💬 Associated Phrases:**")
                for phrase in method_phrases:
                    st.markdown(f"- `{phrase.id}` ({phrase.role}): _{phrase.phrase_template}_")

            # Actions
            col1, col2, col3, col4 = st.columns([1, 1, 1, 3])
            with col1:
                if st.button("✏️ Edit", key=f"edit_{method.name}"):
                    _clear_all_form_states()
                    st.session_state.editing_method = method.name
                    st.session_state.show_method_form = True
                    st.rerun()
            with col2:
                if st.button("🗑️ Delete", key=f"del_{method.name}"):
                    crud.delete_method(method.name)
                    st.rerun()
            with col3:
                if is_default:
                    if st.button("☆ Clear Default", key=f"clear_default_{method.name}"):
                        crud.set_default_method(method.type, None)
                        st.rerun()
                else:
                    if st.button("⭐ Set Default", key=f"set_default_{method.name}"):
                        crud.set_default_method(method.type, method.name)
                        st.rerun()

            # Raw JSON
            with st.container():
                if st.checkbox("Show JSON", key=f"json_{method.name}"):
                    st.json(get_entity_as_dict(method))


def render_method_form(default_type: Optional[str] = None):
    """Render the form for creating/editing a method with rich UI."""
    crud = get_crud()
    editing_name = st.session_state.get("editing_method")
    existing = crud.library.get_method_by_name(editing_name) if editing_name else None

    st.subheader("✏️ Edit Method" if existing else "➕ New Method")

    # Initialize session state for dynamic form elements
    if "method_form_roles" not in st.session_state:
        if existing and existing.roles:
            st.session_state.method_form_roles = [
                {"name": r.name, "direction": r.direction, "data_type": r.data_type, "description": r.description or ""}
                for r in existing.roles
            ]
        else:
            st.session_state.method_form_roles = []

    if "method_form_params" not in st.session_state:
        if existing and existing.parameters:
            st.session_state.method_form_params = [
                {"name": p.name, "type": p.type, "default": p.default or "", "description": p.description or ""}
                for p in existing.parameters
            ]
        else:
            st.session_state.method_form_params = []

    # Basic Information Section
    st.markdown("### Basic Information")
    col1, col2 = st.columns(2)
    with col1:
        name = st.text_input("Name", value=existing.name if existing else "", key="method_name")
    with col2:
        method_type = st.selectbox(
            "Type",
            ["derivation", "analysis"],
            index=["derivation", "analysis"].index(existing.type if existing else (default_type or "derivation")),
            key="method_type",
        )

    description = st.text_area(
        "Description",
        value=existing.description if existing else "",
        key="method_description",
    )

    st.markdown("---")

    # DEL Expression Section
    st.markdown("### DEL Expression")
    st.markdown("_For derivation: `result := expression`. For analysis: Wilkinson-Rogers notation (e.g., `response ~ covariate + group`)_")
    del_expression = st.text_area(
        "Expression",
        value=existing.del_expression if existing else "",
        key="method_del_expression",
        height=80,
        label_visibility="collapsed",
    )

    st.markdown("---")

    # Roles Section
    st.markdown("### Roles")
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Role", key="add_role"):
            st.session_state.method_form_roles.append(
                {"name": "", "direction": "input", "data_type": "numeric", "description": ""}
            )
            st.rerun()

    # Role table headers
    if st.session_state.method_form_roles:
        header_cols = st.columns([2, 1.5, 1.5, 3, 0.5])
        with header_cols[0]:
            st.markdown("**Role Name**")
        with header_cols[1]:
            st.markdown("**Direction**")
        with header_cols[2]:
            st.markdown("**Data Type**")
        with header_cols[3]:
            st.markdown("**Description**")
        with header_cols[4]:
            st.markdown("")

    # Role rows
    directions = ["input", "output"]
    data_types = ["numeric", "string", "boolean", "any", "CodedValue"]
    roles_to_remove = []

    for idx, role in enumerate(st.session_state.method_form_roles):
        role_cols = st.columns([2, 1.5, 1.5, 3, 0.5])
        with role_cols[0]:
            role["name"] = st.text_input(
                "Name", value=role["name"], key=f"role_name_{idx}", label_visibility="collapsed"
            )
        with role_cols[1]:
            dir_idx = directions.index(role["direction"]) if role["direction"] in directions else 0
            role["direction"] = st.selectbox(
                "Direction", directions, index=dir_idx, key=f"role_dir_{idx}", label_visibility="collapsed"
            )
        with role_cols[2]:
            dt_idx = data_types.index(role["data_type"]) if role["data_type"] in data_types else 0
            role["data_type"] = st.selectbox(
                "Data Type", data_types, index=dt_idx, key=f"role_dt_{idx}", label_visibility="collapsed"
            )
        with role_cols[3]:
            role["description"] = st.text_input(
                "Description", value=role["description"], key=f"role_desc_{idx}", label_visibility="collapsed"
            )
        with role_cols[4]:
            if st.button("✕", key=f"remove_role_{idx}"):
                roles_to_remove.append(idx)

    # Remove roles marked for deletion
    for idx in reversed(roles_to_remove):
        st.session_state.method_form_roles.pop(idx)
        st.rerun()

    st.markdown("---")

    # Parameters Section (Optional)
    st.markdown("### Parameters (Optional)")
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Param", key="add_param"):
            st.session_state.method_form_params.append(
                {"name": "", "type": "numeric", "default": "", "description": ""}
            )
            st.rerun()

    # Parameter table headers
    if st.session_state.method_form_params:
        header_cols = st.columns([2, 1.5, 1.5, 3, 0.5])
        with header_cols[0]:
            st.markdown("**Name**")
        with header_cols[1]:
            st.markdown("**Type**")
        with header_cols[2]:
            st.markdown("**Default**")
        with header_cols[3]:
            st.markdown("**Description**")
        with header_cols[4]:
            st.markdown("")

    # Parameter rows
    param_types = ["numeric", "string", "boolean", "enum"]
    params_to_remove = []

    for idx, param in enumerate(st.session_state.method_form_params):
        param_cols = st.columns([2, 1.5, 1.5, 3, 0.5])
        with param_cols[0]:
            param["name"] = st.text_input(
                "Name", value=param["name"], key=f"param_name_{idx}", label_visibility="collapsed"
            )
        with param_cols[1]:
            pt_idx = param_types.index(param["type"]) if param["type"] in param_types else 0
            param["type"] = st.selectbox(
                "Type", param_types, index=pt_idx, key=f"param_type_{idx}", label_visibility="collapsed"
            )
        with param_cols[2]:
            param["default"] = st.text_input(
                "Default", value=param["default"], key=f"param_default_{idx}", label_visibility="collapsed"
            )
        with param_cols[3]:
            param["description"] = st.text_input(
                "Description", value=param["description"], key=f"param_desc_{idx}", label_visibility="collapsed"
            )
        with param_cols[4]:
            if st.button("✕", key=f"remove_param_{idx}"):
                params_to_remove.append(idx)

    # Remove params marked for deletion
    for idx in reversed(params_to_remove):
        st.session_state.method_form_params.pop(idx)
        st.rerun()

    st.markdown("---")

    # Action buttons
    col1, col2, col3 = st.columns([1, 1, 4])
    with col1:
        if st.button("💾 Save", key="save_method", use_container_width=True):
            # Validate
            if not name:
                st.error("Method name is required")
                return
            if not del_expression:
                st.error("DEL Expression is required")
                return
            if not st.session_state.method_form_roles:
                st.error("At least one role is required")
                return

            # Create method
            from lib.models import Method, MethodRole, MethodParameter
            roles = [
                MethodRole(
                    name=r["name"],
                    direction=r["direction"],
                    data_type=r["data_type"],
                    description=r["description"] if r["description"] else None,
                )
                for r in st.session_state.method_form_roles
                if r["name"]  # Skip empty role names
            ]
            params = [
                MethodParameter(
                    name=p["name"],
                    type=p["type"],
                    default=p["default"] if p["default"] else None,
                    description=p["description"] if p["description"] else None,
                )
                for p in st.session_state.method_form_params
                if p["name"]  # Skip empty param names
            ]

            method = Method(
                name=name,
                type=method_type,
                description=description,
                del_expression=del_expression,
                roles=roles,
                parameters=params if params else None,
            )

            if existing:
                crud.update_method(editing_name, method)
            else:
                crud.add_method(method)

            # Clear form state and close
            _clear_all_form_states()
            st.success("Method saved!")
            st.rerun()

    with col2:
        if st.button("❌ Cancel", key="cancel_method", use_container_width=True):
            _clear_all_form_states()
            st.rerun()


# =============================================================================
# Concepts Screen
# =============================================================================

def render_concepts_view(concept_level: str = "all"):
    """Render the concepts view screen."""
    crud = get_crud()
    lib = crud.library

    if concept_level == "observation_concepts":
        st.header("🧩 Observation-Level Concepts")
        concepts = lib.observation_concepts
        target_level = "observation"
    elif concept_level == "inference_concepts":
        st.header("🧩 Inference-Level Concepts")
        concepts = lib.inference_concepts
        target_level = "inference"
    else:
        st.header("🧩 Concepts (STCs)")
        concepts = lib.all_concepts
        target_level = None

    # Search
    search = st.text_input("🔍 Search concepts", placeholder="Search by name or description...")
    if search:
        concepts = [c for c in concepts if search.lower() in c.name.lower() or search.lower() in c.description.lower()]

    # Action buttons
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ New Concept", use_container_width=True):
            _clear_all_form_states()
            st.session_state.editing_concept = None
            st.session_state.show_concept_form = True

    # Show form if requested
    if st.session_state.get("show_concept_form"):
        render_concept_form(target_level)
        return

    # Group by category
    categories = {}
    for concept in concepts:
        cat = concept.category
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(concept)

    for category, cat_concepts in sorted(categories.items()):
        st.subheader(f"📁 {category}")
        for concept in cat_concepts:
            with st.expander(f"**{concept.name}** ({concept.level})"):
                st.markdown(f"_{concept.description}_")
                st.markdown(f"**Data Type:** `{concept.data_type}`")

                if concept.stato_uri:
                    st.markdown(f"**STATO URI:** [{concept.stato_uri}]({concept.stato_uri})")

                if concept.derived_from:
                    st.markdown(f"**Derived From:** {', '.join(concept.derived_from)}")

                if concept.derivation_method:
                    st.markdown(f"**Derivation Method:** `{concept.derivation_method}`")

                # Associated Smart Phrases
                concept_phrases = _get_phrases_for_concept(concept.name, lib)
                if concept_phrases:
                    st.markdown("**💬 Associated Phrases:**")
                    for phrase in concept_phrases:
                        st.markdown(f"- `{phrase.id}` ({phrase.role}): _{phrase.phrase_template}_")

                # Actions
                col1, col2, col3 = st.columns([1, 1, 4])
                with col1:
                    if st.button("✏️ Edit", key=f"edit_c_{concept.name}"):
                        _clear_all_form_states()
                        st.session_state.editing_concept = concept.name
                        st.session_state.show_concept_form = True
                        st.rerun()
                with col2:
                    if st.button("🗑️ Delete", key=f"del_c_{concept.name}"):
                        crud.delete_concept(concept.name)
                        st.rerun()


def render_concept_form(default_level: Optional[str] = None):
    """Render the form for creating/editing a concept with rich UI."""
    crud = get_crud()
    lib = crud.library
    editing_name = st.session_state.get("editing_concept")
    existing = crud.library.get_concept_by_name(editing_name) if editing_name else None

    st.subheader("✏️ Edit Concept" if existing else "➕ New Concept")

    categories = ["Value", "Identity", "Timing", "Treatment", "Flag", "Estimate", "Interval", "Test", "Descriptive", "Qualifier"]
    data_types = ["numeric", "string", "boolean", "any", "CodedValue"]

    # Initialize session state for derived_from list
    if "concept_form_derived_from" not in st.session_state:
        if existing and existing.derived_from:
            st.session_state.concept_form_derived_from = list(existing.derived_from)
        else:
            st.session_state.concept_form_derived_from = []

    # Basic Information Section
    st.markdown("### Basic Information")
    col1, col2 = st.columns(2)
    with col1:
        name = st.text_input("Name (snake_case)", value=existing.name if existing else "", key="concept_name")
    with col2:
        level = st.selectbox(
            "Level",
            ["observation", "inference"],
            index=["observation", "inference"].index(existing.level if existing else (default_level or "observation")),
            key="concept_level",
        )

    col1, col2 = st.columns(2)
    with col1:
        category = st.selectbox(
            "Category",
            categories,
            index=categories.index(existing.category) if existing and existing.category in categories else 0,
            key="concept_category",
        )
    with col2:
        data_type = st.selectbox(
            "Data Type",
            data_types,
            index=data_types.index(existing.data_type) if existing and existing.data_type in data_types else 0,
            key="concept_data_type",
        )

    description = st.text_area(
        "Description",
        value=existing.description if existing else "",
        key="concept_description",
    )

    st.markdown("---")

    # Derivation Section (Optional - for derived concepts)
    st.markdown("### Derivation (Optional)")
    st.markdown("_If this concept is derived from other concepts, specify them here._")

    # Derived From list
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Source", key="add_derived_from"):
            st.session_state.concept_form_derived_from.append("")
            st.rerun()

    # Get all concept names for dropdown
    concept_names = [c.name for c in lib.all_concepts]
    # Filter out current concept being edited
    if editing_name:
        concept_names = [c for c in concept_names if c != editing_name]

    derived_to_remove = []
    if st.session_state.concept_form_derived_from:
        st.markdown("**Derived From:**")
        for idx, derived in enumerate(st.session_state.concept_form_derived_from):
            cols = st.columns([4, 1])
            with cols[0]:
                concept_options = ["(select)"] + concept_names
                default_idx = concept_options.index(derived) if derived in concept_options else 0
                st.session_state.concept_form_derived_from[idx] = st.selectbox(
                    "Source Concept",
                    concept_options,
                    index=default_idx,
                    key=f"derived_from_{idx}",
                    label_visibility="collapsed",
                )
            with cols[1]:
                if st.button("✕", key=f"remove_derived_{idx}"):
                    derived_to_remove.append(idx)

    # Remove items marked for deletion
    for idx in reversed(derived_to_remove):
        st.session_state.concept_form_derived_from.pop(idx)
        st.rerun()

    # Derivation method
    method_names = [m.name for m in lib.derivation_methods]
    method_options = ["(none)"] + method_names
    default_method = existing.derivation_method if existing and existing.derivation_method else "(none)"
    method_idx = method_options.index(default_method) if default_method in method_options else 0
    derivation_method = st.selectbox(
        "Derivation Method",
        method_options,
        index=method_idx,
        key="concept_derivation_method",
    )

    st.markdown("---")

    # Semantic Links Section (Optional)
    st.markdown("### Semantic Links (Optional)")
    stato_uri = st.text_input(
        "STATO URI",
        value=existing.stato_uri if existing else "",
        key="concept_stato_uri",
        placeholder="http://purl.obolibrary.org/obo/...",
    )

    st.markdown("---")

    # Action buttons
    col1, col2, col3 = st.columns([1, 1, 4])
    with col1:
        if st.button("💾 Save", key="save_concept", use_container_width=True):
            # Validate
            if not name:
                st.error("Concept name is required")
                return
            if not description:
                st.error("Description is required")
                return

            # Process derived_from - filter out empty/none values
            derived_from = [
                d for d in st.session_state.concept_form_derived_from
                if d and d != "(select)"
            ]

            from lib.models import STC
            concept = STC(
                name=name,
                description=description,
                level=level,
                category=category,
                data_type=data_type,
                stato_uri=stato_uri if stato_uri else None,
                derived_from=derived_from if derived_from else None,
                derivation_method=derivation_method if derivation_method != "(none)" else None,
            )

            if existing:
                crud.update_concept(editing_name, concept)
            else:
                crud.add_concept(concept)

            # Clear form state and close
            _clear_all_form_states()
            st.success("Concept saved!")
            st.rerun()

    with col2:
        if st.button("❌ Cancel", key="cancel_concept", use_container_width=True):
            _clear_all_form_states()
            st.rerun()


# =============================================================================
# Templates Screen
# =============================================================================

def render_templates_view(template_type: str = "all"):
    """Render the templates view screen."""
    crud = get_crud()
    lib = crud.library

    if template_type == "dc_templates":
        st.header("📋 DC Templates (Derivation Concepts)")
        templates = lib.dc_templates
        target_type = "derivation"
    elif template_type == "ac_templates":
        st.header("📋 AC Templates (Analysis Concepts)")
        templates = lib.ac_templates
        target_type = "analysis"
    else:
        st.header("📋 Templates")
        templates = lib.all_templates
        target_type = None

    # Search
    search = st.text_input("🔍 Search templates", placeholder="Search by name or clinical intent...")
    if search:
        templates = [t for t in templates if search.lower() in t.name.lower() or search.lower() in t.clinical_intent.lower()]

    # Action buttons
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ New Template", use_container_width=True):
            _clear_all_form_states()
            st.session_state.editing_template = None
            st.session_state.show_template_form = True

    # Show form if requested
    if st.session_state.get("show_template_form"):
        render_template_form(target_type)
        return

    # List templates
    for template in templates:
        badge_type = "dc" if template.type == "derivation" else "ac"
        with st.expander(f"**{template.id}** - {template.name}"):
            st.markdown(get_entity_badge("template", badge_type), unsafe_allow_html=True)
            st.markdown(f"**Clinical Intent:** _{template.clinical_intent}_")

            # Methods used
            st.markdown(f"**Uses Method:** `{template.uses_method}`")

            # DEL Expression
            if template.del_expression:
                st.markdown("**DEL Expression:**")
                st.code(template.del_expression, language="text")

            # Role bindings
            st.markdown("**Role Bindings:**")
            for rb in template.role_bindings:
                direction = "→" if rb.direction == "input" else "←"
                phrase_info = ""
                if rb.phrase:
                    phrase_info = f" 💬 _{rb.phrase}_"
                elif rb.phrase_ref:
                    phrase_info = f" 💬 ref:`{rb.phrase_ref}`"
                st.markdown(
                    f"- {direction} `{rb.semantic_transformation_concept}` → `{rb.method_role}` ({rb.cube_role}){phrase_info}"
                )

            # Input Cube (if defined)
            if hasattr(template, "input_cube") and template.input_cube:
                st.markdown("**Input Cube:**")
                cube = template.input_cube
                st.markdown(f"  - Name: `{cube.name}`")
                if cube.dimensions:
                    dims = ", ".join([f"`{d.data_concept}` ({d.role})" for d in cube.dimensions])
                    st.markdown(f"  - Dimensions: {dims}")
                if cube.measures:
                    meas = ", ".join([f"`{m.data_concept}` ({m.role})" for m in cube.measures])
                    st.markdown(f"  - Measures: {meas}")

            # Output Cube (if defined)
            if hasattr(template, "output_cube") and template.output_cube:
                st.markdown("**Output Cube:**")
                cube = template.output_cube
                st.markdown(f"  - Name: `{cube.name}`")
                if cube.dimensions:
                    dims = ", ".join([f"`{d.data_concept}` ({d.role})" for d in cube.dimensions])
                    st.markdown(f"  - Dimensions: {dims}")
                if cube.measures:
                    meas = ", ".join([f"`{m.data_concept}` ({m.role})" for m in cube.measures])
                    st.markdown(f"  - Measures: {meas}")

            # Slice (if defined)
            if hasattr(template, "slice") and template.slice:
                st.markdown("**Slice Constraints:**")
                for c in template.slice.constraints:
                    op = c.operator or "="
                    if c.parameter:
                        # Parameterized filter
                        value_str = f" {op} `{{{c.parameter}}}`"
                    elif c.value:
                        value_str = f" {op} `{c.value}`"
                    else:
                        value_str = ""
                    label_str = f" ({c.label})" if c.label else ""
                    st.markdown(f"  - `{c.data_concept}`{value_str}{label_str}")

            # Model specification (for analysis templates)
            if template.model_specification:
                st.markdown("**Model Specification:**")
                spec = template.model_specification
                if spec.family:
                    st.markdown(f"- Family: {spec.family}")
                if spec.link:
                    st.markdown(f"- Link: {spec.link}")
                if spec.hypothesis_test:
                    st.markdown(f"- Hypothesis: {spec.hypothesis_test}")

            # Smart Phrases / Sentence Composition
            _render_template_phrases(template, lib)

            # Actions
            col1, col2, col3 = st.columns([1, 1, 4])
            with col1:
                if st.button("✏️ Edit", key=f"edit_t_{template.id}"):
                    _clear_all_form_states()
                    st.session_state.editing_template = template.id
                    st.session_state.show_template_form = True
                    st.rerun()
            with col2:
                if st.button("🗑️ Delete", key=f"del_t_{template.id}"):
                    crud.delete_template(template.id)
                    st.rerun()

            # Show Graph toggle
            if st.checkbox("📊 Show Graph", key=f"graph_t_{template.id}"):
                _render_template_view_graph(template, lib)

            # Raw JSON
            with st.container():
                if st.checkbox("Show JSON", key=f"json_t_{template.id}"):
                    st.json(get_entity_as_dict(template))


def _get_resolved_del_expression(method, role_bindings: dict) -> str:
    """Generate resolved DEL expression with concepts substituted for role names."""
    if not method or not method.del_expression:
        return ""

    resolved = method.del_expression
    for role in method.roles:
        binding_key = f"{method.name}_{role.name}"
        binding = role_bindings.get(binding_key, {})
        concept = binding.get("concept", "")
        if concept:
            # Replace role name with concept name in the expression
            resolved = resolved.replace(role.name, concept)
    return resolved


def _render_template_phrases(template, lib):
    """Render phrase composition and sentence for a template."""
    # First, check if role bindings have phrases attached
    binding_phrases = []
    for rb in template.role_bindings:
        if rb.phrase:
            binding_phrases.append({
                "type": "inline",
                "text": rb.phrase,
                "concept": rb.semantic_transformation_concept,
                "role": rb.method_role,
            })
        elif rb.phrase_ref:
            # Find the library phrase
            phrase_obj = None
            for p in lib.static_phrases + lib.parameterized_phrases:
                if p.id == rb.phrase_ref:
                    phrase_obj = p
                    break

            if phrase_obj:
                # Resolve parameterized phrases
                resolved_text = phrase_obj.phrase_template
                if hasattr(phrase_obj, "get_parameter_names"):
                    for param_name in phrase_obj.get_parameter_names():
                        # Check for overrides
                        if rb.parameter_overrides and param_name in rb.parameter_overrides:
                            resolved_text = resolved_text.replace(
                                f"{{{param_name}}}",
                                f"_{{{rb.parameter_overrides[param_name]}}}_"
                            )
                        else:
                            # Use default placeholder
                            resolved_text = resolved_text.replace(
                                f"{{{param_name}}}",
                                f"_{{{param_name}}}_"
                            )

                binding_phrases.append({
                    "type": "library",
                    "ref": rb.phrase_ref,
                    "text": resolved_text,
                    "concept": rb.semantic_transformation_concept,
                    "role": rb.method_role,
                })

    # Display phrase preview if we have binding phrases
    if binding_phrases:
        st.markdown("**💬 Composed Description:**")
        composed_parts = []
        for bp in binding_phrases:
            composed_parts.append(bp["text"])

        # Show as a composed preview
        if composed_parts:
            preview_text = " ".join(composed_parts)
            st.info(preview_text)

            # Show details
            with st.expander("Show phrase details"):
                for bp in binding_phrases:
                    icon = "✏️" if bp["type"] == "inline" else "📚"
                    source = "inline" if bp["type"] == "inline" else f"ref:`{bp['ref']}`"
                    st.markdown(f"- {icon} `{bp['concept']}` ({bp['role']}): _{bp['text']}_ [{source}]")
        return

    # Fall back to existing sentence display (from study instances)
    # Get concepts used in this template
    template_concepts = [rb.semantic_transformation_concept for rb in template.role_bindings]
    template_method = template.uses_method

    # Find related phrases
    related_phrases = []
    for concept_name in template_concepts:
        phrases = _get_phrases_for_concept(concept_name, lib)
        for p in phrases:
            if p not in related_phrases:
                related_phrases.append(p)

    # Also get method phrases
    method_phrases = _get_phrases_for_method(template_method, lib)
    for p in method_phrases:
        if p not in related_phrases:
            related_phrases.append(p)

    # Check for existing sentences describing this template
    describing_sentences = []
    for sentence in lib.sentences:
        if sentence.describes == template.id:
            describing_sentences.append(sentence)

    # Display
    if describing_sentences:
        st.markdown("**📝 Smart Sentence:**")
        for sentence in describing_sentences:
            st.info(sentence.text)
            with st.container():
                if st.checkbox("Show phrase composition", key=f"phrases_{template.id}_{sentence.id}"):
                    composed = sorted(sentence.composed_of, key=lambda x: x.order)
                    for cp in composed:
                        phrase = None
                        for p in lib.static_phrases:
                            if p.id == cp.phrase_id:
                                phrase = p
                                break
                        if not phrase:
                            for p in lib.parameterized_phrases:
                                if p.id == cp.phrase_id:
                                    phrase = p
                                    break

                        if phrase:
                            # Resolve parameterized phrases
                            resolved_text = phrase.phrase_template
                            if cp.bound_value and hasattr(phrase, 'parameters') and phrase.parameters:
                                resolved_text = resolved_text.replace(
                                    f"{{{phrase.parameters[0]}}}",
                                    f"**{cp.bound_value}**"
                                )
                            elif cp.bound_values:
                                for key, value in cp.bound_values.items():
                                    resolved_text = resolved_text.replace(f"{{{key}}}", f"**{value}**")
                            st.markdown(f"  {cp.order}. `{phrase.role}`: _{resolved_text}_")

    elif related_phrases:
        st.markdown("**💬 Available Phrases:**")
        st.caption("_These phrases are available based on the template's concepts and method. Assign phrases in the role bindings to compose a description._")
        # Group by role
        phrases_by_role: Dict[str, list] = {}
        for phrase in related_phrases:
            role = phrase.role
            if role not in phrases_by_role:
                phrases_by_role[role] = []
            phrases_by_role[role].append(phrase)

        for role in sorted(phrases_by_role.keys()):
            phrases = phrases_by_role[role]
            st.markdown(f"  - **{role}:** " + ", ".join([f"`{p.id}`" for p in phrases]))


def _collect_cube_items_from_bindings(lib, role_bindings: dict, template_methods: list) -> tuple:
    """Collect cube dimensions and measures from role bindings.

    Returns tuple of (input_measures, input_dimensions, output_measures, output_dimensions).
    Items are auto-populated based on cube_role assignments.
    """
    input_measures = []
    input_dimensions = []
    output_measures = []
    output_dimensions = []

    for method_name in template_methods:
        method = lib.get_method_by_name(method_name)
        if not method:
            continue

        for role in method.roles:
            binding_key = f"{method_name}_{role.name}"
            binding = role_bindings.get(binding_key, {})
            concept = binding.get("concept", "")
            cube_role = binding.get("cube_role", "measure")

            if not concept:
                continue

            # Route to appropriate cube based on direction and cube_role
            if role.direction == "input":
                if cube_role in ("measure", "attribute", "filter"):
                    # Map cube_role to measure role
                    measure_role = "value" if cube_role == "measure" else cube_role
                    input_measures.append({"concept": concept, "role": measure_role, "from_binding": True})
                elif cube_role in ("dimension", "identifier"):
                    input_dimensions.append({"concept": concept, "role": cube_role, "from_binding": True})
            else:  # output
                if cube_role in ("measure", "attribute"):
                    output_measures.append({"concept": concept, "role": "result", "from_binding": True})
                elif cube_role in ("dimension", "identifier"):
                    output_dimensions.append({"concept": concept, "role": cube_role, "from_binding": True})

    return input_measures, input_dimensions, output_measures, output_dimensions


def render_template_form(default_type: Optional[str] = None):
    """Render the form for creating/editing a template with multi-method support."""
    crud = get_crud()
    lib = crud.library
    editing_id = st.session_state.get("editing_template")
    existing = crud.library.get_template_by_id(editing_id) if editing_id else None

    st.subheader("✏️ Edit Template" if existing else "➕ New Template")

    # Get available methods and concepts for dropdowns
    derivation_methods = lib.derivation_methods
    analysis_methods = lib.analysis_methods
    concept_names = [c.name for c in lib.all_concepts]
    cube_roles = ["measure", "dimension", "attribute", "filter", "identifier"]

    # Initialize session state for dynamic form elements
    if "template_methods" not in st.session_state:
        if existing and existing.uses_method:
            st.session_state.template_methods = [existing.uses_method]
        else:
            # Get default method based on type
            template_type = default_type or "derivation"
            default_method = crud.get_default_method(template_type)
            if default_method:
                st.session_state.template_methods = [default_method]
            elif template_type == "derivation" and derivation_methods:
                st.session_state.template_methods = [derivation_methods[0].name]
            elif analysis_methods:
                st.session_state.template_methods = [analysis_methods[0].name]
            else:
                st.session_state.template_methods = []

    if "template_role_bindings" not in st.session_state:
        st.session_state.template_role_bindings = {}
        if existing and existing.role_bindings:
            # Initialize from existing bindings, including phrase data
            for rb in existing.role_bindings:
                key = f"{existing.uses_method}_{rb.method_role}"
                # Determine phrase mode from existing data
                phrase_mode = "none"
                if rb.phrase:
                    phrase_mode = "inline"
                elif rb.phrase_ref:
                    phrase_mode = "library"

                st.session_state.template_role_bindings[key] = {
                    "concept": rb.semantic_transformation_concept,
                    "cube_role": rb.cube_role,
                    "phrase_mode": phrase_mode,
                    "phrase": rb.phrase or "",
                    "phrase_ref": rb.phrase_ref or "",
                    "parameter_overrides": rb.parameter_overrides or {},
                }

    # Basic info section
    st.markdown("### Basic Information")
    col1, col2 = st.columns(2)
    with col1:
        template_id = st.text_input(
            "ID (T_DC_xxx or T_AC_xxx)",
            value=existing.id if existing else "",
            key="template_id",
        )
    with col2:
        name = st.text_input("Name", value=existing.name if existing else "", key="template_name")

    col1, col2 = st.columns(2)
    with col1:
        template_type = st.selectbox(
            "Type",
            ["derivation", "analysis"],
            index=["derivation", "analysis"].index(existing.type if existing else (default_type or "derivation")),
            key="template_type",
        )
    with col2:
        version = st.text_input("Version", value=existing.version if existing else "1.0.0", key="template_version")

    clinical_intent = st.text_area(
        "Clinical Intent",
        value=existing.clinical_intent if existing else "",
        key="template_clinical_intent",
    )

    st.markdown("---")

    # Methods Section
    st.markdown("### Methods")
    st.markdown("_Templates can reference one or more methods. The first method is the primary method._")

    # Filter methods by type
    available_methods = derivation_methods if template_type == "derivation" else analysis_methods
    method_names = [m.name for m in available_methods]

    # Add method button
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Method", use_container_width=True):
            if method_names:
                # Add the first available method not already selected
                for m_name in method_names:
                    if m_name not in st.session_state.template_methods:
                        st.session_state.template_methods.append(m_name)
                        break

    # Display each selected method with its role bindings
    methods_to_remove = []
    for idx, method_name in enumerate(st.session_state.template_methods):
        method = lib.get_method_by_name(method_name)
        if not method:
            continue

        with st.container():
            st.markdown(f"#### Method {idx + 1}: {method_name}" + (" ⭐ Primary" if idx == 0 else ""))

            col1, col2, col3 = st.columns([3, 1, 1])
            with col1:
                # Method selector
                new_method = st.selectbox(
                    "Select Method",
                    method_names,
                    index=method_names.index(method_name) if method_name in method_names else 0,
                    key=f"method_select_{idx}",
                )
                if new_method != method_name:
                    st.session_state.template_methods[idx] = new_method
                    st.rerun()
            with col2:
                if idx > 0:
                    st.checkbox("Optional", key=f"method_optional_{idx}")
            with col3:
                if len(st.session_state.template_methods) > 1:
                    if st.button("✕ Remove", key=f"remove_method_{idx}"):
                        methods_to_remove.append(idx)

            # Show DEL Expression (read-only)
            st.markdown("**DEL Expression:**")
            st.code(method.del_expression, language="text")

            # Role Bindings for this method
            st.markdown("**Role Bindings:**")

            # Get library phrases for reference
            all_phrases = lib.static_phrases + lib.parameterized_phrases
            phrase_options = ["(none)"] + [p.id for p in all_phrases]

            # Create a table-like layout for role bindings
            header_cols = st.columns([2, 1, 2, 2])
            with header_cols[0]:
                st.markdown("**Method Role**")
            with header_cols[1]:
                st.markdown("**Dir**")
            with header_cols[2]:
                st.markdown("**Concept (STC)**")
            with header_cols[3]:
                st.markdown("**Cube Role**")

            for role in method.roles:
                binding_key = f"{method_name}_{role.name}"
                existing_binding = st.session_state.template_role_bindings.get(binding_key, {})

                role_cols = st.columns([2, 1, 2, 2])
                with role_cols[0]:
                    st.text(role.name)
                with role_cols[1]:
                    direction_icon = "→" if role.direction == "input" else "←"
                    st.text(direction_icon)
                with role_cols[2]:
                    # Concept selector
                    concept_options = ["(none)"] + concept_names
                    default_concept = existing_binding.get("concept", "(none)")
                    concept_idx = concept_options.index(default_concept) if default_concept in concept_options else 0
                    selected_concept = st.selectbox(
                        "Concept",
                        concept_options,
                        index=concept_idx,
                        key=f"concept_{binding_key}",
                        label_visibility="collapsed",
                    )
                    # Preserve existing phrase data when updating
                    st.session_state.template_role_bindings[binding_key] = {
                        "concept": selected_concept if selected_concept != "(none)" else "",
                        "cube_role": existing_binding.get("cube_role", "measure"),
                        "phrase_mode": existing_binding.get("phrase_mode", "none"),
                        "phrase": existing_binding.get("phrase", ""),
                        "phrase_ref": existing_binding.get("phrase_ref", ""),
                        "parameter_overrides": existing_binding.get("parameter_overrides", {}),
                    }
                with role_cols[3]:
                    # Cube role selector
                    default_cube_role = existing_binding.get("cube_role", "measure")
                    cube_role_idx = cube_roles.index(default_cube_role) if default_cube_role in cube_roles else 0
                    selected_cube_role = st.selectbox(
                        "Cube Role",
                        cube_roles,
                        index=cube_role_idx,
                        key=f"cube_role_{binding_key}",
                        label_visibility="collapsed",
                    )
                    st.session_state.template_role_bindings[binding_key]["cube_role"] = selected_cube_role

                # Phrase section (collapsible)
                with st.expander(f"💬 Phrase for `{role.name}`", expanded=False):
                    phrase_modes = ["none", "inline", "library"]
                    current_mode = existing_binding.get("phrase_mode", "none")
                    mode_idx = phrase_modes.index(current_mode) if current_mode in phrase_modes else 0

                    phrase_mode = st.radio(
                        "Phrase type",
                        phrase_modes,
                        index=mode_idx,
                        key=f"phrase_mode_{binding_key}",
                        horizontal=True,
                        format_func=lambda x: {"none": "No phrase", "inline": "Inline text", "library": "Library ref"}[x],
                    )
                    st.session_state.template_role_bindings[binding_key]["phrase_mode"] = phrase_mode

                    if phrase_mode == "inline":
                        inline_phrase = st.text_input(
                            "Phrase text",
                            value=existing_binding.get("phrase", ""),
                            key=f"phrase_text_{binding_key}",
                            placeholder="e.g., 'change from baseline'",
                        )
                        st.session_state.template_role_bindings[binding_key]["phrase"] = inline_phrase
                        st.session_state.template_role_bindings[binding_key]["phrase_ref"] = ""

                    elif phrase_mode == "library":
                        # Create phrase options with preview text
                        def format_phrase_option(phrase_id):
                            if phrase_id == "(none)":
                                return "(none)"
                            for p in all_phrases:
                                if p.id == phrase_id:
                                    # Truncate long phrases
                                    text = p.phrase_template
                                    if len(text) > 40:
                                        text = text[:37] + "..."
                                    return f"{phrase_id}: {text}"
                            return phrase_id

                        default_ref = existing_binding.get("phrase_ref", "(none)")
                        ref_idx = phrase_options.index(default_ref) if default_ref in phrase_options else 0
                        selected_phrase_ref = st.selectbox(
                            "Library phrase",
                            phrase_options,
                            index=ref_idx,
                            key=f"phrase_ref_{binding_key}",
                            format_func=format_phrase_option,
                        )
                        st.session_state.template_role_bindings[binding_key]["phrase_ref"] = selected_phrase_ref if selected_phrase_ref != "(none)" else ""
                        st.session_state.template_role_bindings[binding_key]["phrase"] = ""

                        # Show phrase preview and parameter overrides if selected
                        if selected_phrase_ref and selected_phrase_ref != "(none)":
                            phrase_obj = None
                            for p in all_phrases:
                                if p.id == selected_phrase_ref:
                                    phrase_obj = p
                                    break

                            if phrase_obj:
                                # Show full phrase text in a highlighted box
                                st.info(f"📝 **Phrase:** _{phrase_obj.phrase_template}_")

                                # Check if it's a parameterized phrase
                                if hasattr(phrase_obj, "get_parameter_names"):
                                    param_names = phrase_obj.get_parameter_names()
                                    if param_names:
                                        st.markdown("**Parameter overrides:**")
                                        overrides = existing_binding.get("parameter_overrides", {})

                                        for param_name in param_names:
                                            binding_info = phrase_obj.get_parameter_binding(param_name)
                                            default_bind = ""
                                            if binding_info:
                                                if binding_info.binds_to == "concept":
                                                    default_bind = f"concept:{binding_info.concept_ref or param_name}"
                                                elif binding_info.binds_to == "method":
                                                    default_bind = f"method:{binding_info.method_ref or ''}"
                                                else:
                                                    default_bind = f"literal:{binding_info.default_value or ''}"

                                            override_val = st.text_input(
                                                f"`{{{param_name}}}`",
                                                value=overrides.get(param_name, ""),
                                                key=f"param_override_{binding_key}_{param_name}",
                                                placeholder=f"Default: {default_bind}",
                                            )
                                            if override_val:
                                                if "parameter_overrides" not in st.session_state.template_role_bindings[binding_key]:
                                                    st.session_state.template_role_bindings[binding_key]["parameter_overrides"] = {}
                                                st.session_state.template_role_bindings[binding_key]["parameter_overrides"][param_name] = override_val
                    else:
                        # Clear phrase data when mode is "none"
                        st.session_state.template_role_bindings[binding_key]["phrase"] = ""
                        st.session_state.template_role_bindings[binding_key]["phrase_ref"] = ""

            # Show Resolved DEL Expression AFTER role bindings are updated
            resolved_del = _get_resolved_del_expression(method, st.session_state.template_role_bindings)
            if resolved_del and resolved_del != method.del_expression:
                st.markdown("**Resolved DEL Expression** _(with concepts)_**:**")
                st.code(resolved_del, language="text")

            st.markdown("---")

    # Remove methods marked for removal
    for idx in reversed(methods_to_remove):
        st.session_state.template_methods.pop(idx)
        st.rerun()

    # Collect auto-populated cube items from role bindings
    auto_input_measures, auto_input_dims, auto_output_measures, auto_output_dims = _collect_cube_items_from_bindings(
        lib, st.session_state.template_role_bindings, st.session_state.template_methods
    )

    # =========================================================================
    # Input Cube Section (Required)
    # =========================================================================
    st.markdown("### Input Cube")
    st.markdown("_Define the structure of the input data cube. Measures from role bindings are shown automatically._")

    # Initialize cube state for additional items (user-added)
    if "input_cube_dims" not in st.session_state:
        st.session_state.input_cube_dims = []
        if existing and hasattr(existing, "input_cube") and existing.input_cube and existing.input_cube.dimensions:
            st.session_state.input_cube_dims = [
                {"concept": d.data_concept, "role": d.role}
                for d in existing.input_cube.dimensions
            ]

    if "input_cube_measures" not in st.session_state:
        st.session_state.input_cube_measures = []
        if existing and hasattr(existing, "input_cube") and existing.input_cube and existing.input_cube.measures:
            st.session_state.input_cube_measures = [
                {"concept": m.data_concept, "role": m.role}
                for m in existing.input_cube.measures
            ]

    input_cube_name = st.text_input(
        "Cube Name *",
        value=(existing.input_cube.name if existing and hasattr(existing, "input_cube") and existing.input_cube else "input_cube"),
        key="input_cube_name",
    )

    # Show auto-populated measures from role bindings (read-only)
    if auto_input_measures:
        st.markdown("**Measures** _(from role bindings - read only)_**:**")
        for item in auto_input_measures:
            st.markdown(f"  - `{item['concept']}` as **{item['role']}**")

    # Additional measures (user can add more)
    st.markdown("**Additional Measures:**")
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Measure", key="add_input_measure"):
            st.session_state.input_cube_measures.append({"concept": "", "role": "value"})

    for idx, measure in enumerate(st.session_state.input_cube_measures):
        # Skip if this measure is already in auto-populated list
        if any(m["concept"] == measure.get("concept") for m in auto_input_measures if measure.get("concept")):
            continue
        measure_cols = st.columns([3, 2, 1])
        with measure_cols[0]:
            concept_options = ["(select)"] + concept_names
            default_idx = concept_options.index(measure["concept"]) if measure["concept"] in concept_options else 0
            measure["concept"] = st.selectbox(
                "Concept",
                concept_options,
                index=default_idx,
                key=f"input_measure_concept_{idx}",
                label_visibility="collapsed",
            )
        with measure_cols[1]:
            measure_roles = ["value", "covariate", "dependent", "qualifier"]
            default_role_idx = measure_roles.index(measure["role"]) if measure["role"] in measure_roles else 0
            measure["role"] = st.selectbox(
                "Role",
                measure_roles,
                index=default_role_idx,
                key=f"input_measure_role_{idx}",
                label_visibility="collapsed",
            )
        with measure_cols[2]:
            if st.button("✕", key=f"remove_input_measure_{idx}"):
                st.session_state.input_cube_measures.pop(idx)
                st.rerun()

    # Show auto-populated dimensions from role bindings (read-only)
    if auto_input_dims:
        st.markdown("**Dimensions** _(from role bindings - read only)_**:**")
        for item in auto_input_dims:
            st.markdown(f"  - `{item['concept']}` as **{item['role']}**")

    # Additional dimensions (user can add more)
    st.markdown("**Additional Dimensions:**")
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Dim", key="add_input_dim"):
            st.session_state.input_cube_dims.append({"concept": "", "role": "identifier"})

    for idx, dim in enumerate(st.session_state.input_cube_dims):
        # Skip if this dim is already in auto-populated list
        if any(d["concept"] == dim.get("concept") for d in auto_input_dims if dim.get("concept")):
            continue
        dim_cols = st.columns([3, 2, 1])
        with dim_cols[0]:
            concept_options = ["(select)"] + concept_names
            default_idx = concept_options.index(dim["concept"]) if dim["concept"] in concept_options else 0
            dim["concept"] = st.selectbox(
                "Concept",
                concept_options,
                index=default_idx,
                key=f"input_dim_concept_{idx}",
                label_visibility="collapsed",
            )
        with dim_cols[1]:
            dim_roles = ["identifier", "factor", "dimension"]
            default_role_idx = dim_roles.index(dim["role"]) if dim["role"] in dim_roles else 0
            dim["role"] = st.selectbox(
                "Role",
                dim_roles,
                index=default_role_idx,
                key=f"input_dim_role_{idx}",
                label_visibility="collapsed",
            )
        with dim_cols[2]:
            if st.button("✕", key=f"remove_input_dim_{idx}"):
                st.session_state.input_cube_dims.pop(idx)
                st.rerun()

    st.markdown("---")

    # =========================================================================
    # Output Cube Section (Required)
    # =========================================================================
    st.markdown("### Output Cube")
    st.markdown("_Define the output cube. Output measures from role bindings are shown automatically._")

    if "output_cube_measures" not in st.session_state:
        st.session_state.output_cube_measures = []
        if existing and hasattr(existing, "output_cube") and existing.output_cube and existing.output_cube.measures:
            st.session_state.output_cube_measures = [
                {"concept": m.data_concept, "role": m.role}
                for m in existing.output_cube.measures
            ]

    output_cube_name = st.text_input(
        "Cube Name *",
        value=(existing.output_cube.name if existing and hasattr(existing, "output_cube") and existing.output_cube else "output_cube"),
        key="output_cube_name",
    )

    # Show auto-populated output measures from role bindings (read-only)
    if auto_output_measures:
        st.markdown("**Measures** _(from role bindings - read only)_**:**")
        for item in auto_output_measures:
            st.markdown(f"  - `{item['concept']}` as **{item['role']}**")

    # Additional output measures
    st.markdown("**Additional Measures:**")
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Measure", key="add_output_measure"):
            st.session_state.output_cube_measures.append({"concept": "", "role": "value"})

    for idx, measure in enumerate(st.session_state.output_cube_measures):
        # Skip if this measure is already in auto-populated list
        if any(m["concept"] == measure.get("concept") for m in auto_output_measures if measure.get("concept")):
            continue
        measure_cols = st.columns([3, 2, 1])
        with measure_cols[0]:
            concept_options = ["(select)"] + concept_names
            default_idx = concept_options.index(measure["concept"]) if measure["concept"] in concept_options else 0
            measure["concept"] = st.selectbox(
                "Concept",
                concept_options,
                index=default_idx,
                key=f"output_measure_concept_{idx}",
                label_visibility="collapsed",
            )
        with measure_cols[1]:
            measure_roles = ["value", "result", "estimate"]
            default_role_idx = measure_roles.index(measure["role"]) if measure["role"] in measure_roles else 0
            measure["role"] = st.selectbox(
                "Role",
                measure_roles,
                index=default_role_idx,
                key=f"output_measure_role_{idx}",
                label_visibility="collapsed",
            )
        with measure_cols[2]:
            if st.button("✕", key=f"remove_output_measure_{idx}"):
                st.session_state.output_cube_measures.pop(idx)
                st.rerun()

    # Initialize output cube dimensions state
    if "output_cube_dims" not in st.session_state:
        st.session_state.output_cube_dims = []
        if existing and hasattr(existing, "output_cube") and existing.output_cube and existing.output_cube.dimensions:
            st.session_state.output_cube_dims = [
                {"concept": d.data_concept, "role": d.role}
                for d in existing.output_cube.dimensions
            ]

    # Show auto-populated dimensions from role bindings (read-only)
    if auto_output_dims:
        st.markdown("**Dimensions** _(from role bindings - read only)_**:**")
        for item in auto_output_dims:
            st.markdown(f"  - `{item['concept']}` as **{item['role']}**")

    # Additional dimensions (user can add more)
    st.markdown("**Additional Dimensions:**")
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Dim", key="add_output_dim"):
            st.session_state.output_cube_dims.append({"concept": "", "role": "identifier"})

    for idx, dim in enumerate(st.session_state.output_cube_dims):
        # Skip if this dim is already in auto-populated list
        if any(d["concept"] == dim.get("concept") for d in auto_output_dims if dim.get("concept")):
            continue
        dim_cols = st.columns([3, 2, 1])
        with dim_cols[0]:
            concept_options = ["(select)"] + concept_names
            default_idx = concept_options.index(dim["concept"]) if dim["concept"] in concept_options else 0
            dim["concept"] = st.selectbox(
                "Concept",
                concept_options,
                index=default_idx,
                key=f"output_dim_concept_{idx}",
                label_visibility="collapsed",
            )
        with dim_cols[1]:
            dim_roles = ["identifier", "factor", "dimension"]
            default_role_idx = dim_roles.index(dim["role"]) if dim["role"] in dim_roles else 0
            dim["role"] = st.selectbox(
                "Role",
                dim_roles,
                index=default_role_idx,
                key=f"output_dim_role_{idx}",
                label_visibility="collapsed",
            )
        with dim_cols[2]:
            if st.button("✕", key=f"remove_output_dim_{idx}"):
                st.session_state.output_cube_dims.pop(idx)
                st.rerun()

    st.markdown("---")

    # =========================================================================
    # Slice Section (Optional)
    # =========================================================================
    st.markdown("### Slice Constraints (Optional)")
    st.markdown("_Define constraints that fix dimensions to specific values. Use **Parameter** to link to a concept instead of a fixed value._")

    if "slice_constraints" not in st.session_state:
        st.session_state.slice_constraints = []
        if existing and hasattr(existing, "slice") and existing.slice and existing.slice.constraints:
            st.session_state.slice_constraints = [
                {
                    "concept": c.data_concept,
                    "operator": c.operator or "=",
                    "value": c.value or "",
                    "parameter": getattr(c, "parameter", "") or "",
                    "label": c.label or "",
                }
                for c in existing.slice.constraints
            ]

    slice_name = st.text_input(
        "Slice Name",
        value=(existing.slice.name if existing and hasattr(existing, "slice") and existing.slice else ""),
        key="slice_name",
    )

    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ Add Constraint", key="add_slice_constraint"):
            st.session_state.slice_constraints.append({"concept": "", "operator": "=", "value": "", "parameter": "", "label": ""})

    # Header row
    header_cols = st.columns([2, 1, 2, 2, 2, 1])
    with header_cols[0]:
        st.markdown("**Concept**")
    with header_cols[1]:
        st.markdown("**Op**")
    with header_cols[2]:
        st.markdown("**Value** _(fixed)_")
    with header_cols[3]:
        st.markdown("**Parameter** _(concept link)_")
    with header_cols[4]:
        st.markdown("**Label**")
    with header_cols[5]:
        st.markdown("")

    operators = ["=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN"]

    for idx, constraint in enumerate(st.session_state.slice_constraints):
        constraint_cols = st.columns([2, 1, 2, 2, 2, 1])
        with constraint_cols[0]:
            concept_options = ["(select)"] + concept_names
            default_idx = concept_options.index(constraint["concept"]) if constraint["concept"] in concept_options else 0
            constraint["concept"] = st.selectbox(
                "Concept",
                concept_options,
                index=default_idx,
                key=f"slice_concept_{idx}",
                label_visibility="collapsed",
            )
        with constraint_cols[1]:
            default_op = constraint.get("operator", "=")
            op_idx = operators.index(default_op) if default_op in operators else 0
            constraint["operator"] = st.selectbox(
                "Op",
                operators,
                index=op_idx,
                key=f"slice_op_{idx}",
                label_visibility="collapsed",
            )
        with constraint_cols[2]:
            constraint["value"] = st.text_input(
                "Value",
                value=constraint.get("value", ""),
                key=f"slice_value_{idx}",
                label_visibility="collapsed",
                placeholder="Fixed value",
                disabled=bool(constraint.get("parameter")),  # Disable if parameter is set
            )
        with constraint_cols[3]:
            # Parameter links to a concept that provides the value
            param_options = ["(none)"] + concept_names
            default_param = constraint.get("parameter", "(none)") or "(none)"
            param_idx = param_options.index(default_param) if default_param in param_options else 0
            selected_param = st.selectbox(
                "Parameter",
                param_options,
                index=param_idx,
                key=f"slice_param_{idx}",
                label_visibility="collapsed",
            )
            constraint["parameter"] = selected_param if selected_param != "(none)" else ""
        with constraint_cols[4]:
            constraint["label"] = st.text_input(
                "Label",
                value=constraint.get("label", ""),
                key=f"slice_label_{idx}",
                label_visibility="collapsed",
                placeholder="Label (optional)",
            )
        with constraint_cols[5]:
            if st.button("✕", key=f"remove_slice_constraint_{idx}"):
                st.session_state.slice_constraints.pop(idx)
                st.rerun()

    st.markdown("---")

    # =========================================================================
    # Template Preview (Reactive Visualization)
    # =========================================================================
    st.markdown("### 📊 Template Preview")
    st.markdown("_Visual representation of the template structure. Updates as you make changes._")

    _render_template_preview(
        template_id=template_id or "(new template)",
        name=name or "(unnamed)",
        template_type=template_type,
        template_methods=st.session_state.template_methods,
        role_bindings=st.session_state.template_role_bindings,
        auto_input_measures=auto_input_measures,
        auto_input_dims=auto_input_dims,
        auto_output_measures=auto_output_measures,
        auto_output_dims=auto_output_dims,
        input_cube_name=st.session_state.get("input_cube_name", "input_cube"),
        output_cube_name=st.session_state.get("output_cube_name", "output_cube"),
        input_cube_dims=st.session_state.get("input_cube_dims", []),
        input_cube_measures=st.session_state.get("input_cube_measures", []),
        output_cube_dims=st.session_state.get("output_cube_dims", []),
        output_cube_measures=st.session_state.get("output_cube_measures", []),
        slice_name=st.session_state.get("slice_name", ""),
        slice_constraints=st.session_state.get("slice_constraints", []),
        lib=lib,
    )

    st.markdown("---")

    # Action buttons
    col1, col2, col3 = st.columns([1, 1, 4])
    with col1:
        if st.button("💾 Save Template", use_container_width=True):
            _save_template(crud, lib, existing, editing_id, template_id, name, template_type, version, clinical_intent)
    with col2:
        if st.button("❌ Cancel", use_container_width=True):
            _clear_template_form_state()
            st.rerun()


def _render_template_preview(
    template_id: str,
    name: str,
    template_type: str,
    template_methods: list,
    role_bindings: dict,
    auto_input_measures: list,
    auto_input_dims: list,
    auto_output_measures: list,
    auto_output_dims: list,
    input_cube_name: str,
    output_cube_name: str,
    input_cube_dims: list,
    input_cube_measures: list,
    output_cube_dims: list,
    output_cube_measures: list,
    slice_name: str,
    slice_constraints: list,
    lib,
):
    """Render a reactive graph preview of the template structure."""
    try:
        import graphviz
    except ImportError:
        st.warning("Install graphviz to see template preview: `pip install graphviz`")
        return

    # Create the graph
    dot = graphviz.Digraph(comment=f"Template: {name}")
    dot.attr(rankdir="TB", splines="ortho", nodesep="0.5", ranksep="0.8")

    # Color scheme matching CDISC branding
    template_color = "#6B4C9A" if template_type == "analysis" else "#E07850"  # Purple for AC, coral for DC
    method_color = "#4A90A4"  # Blue
    cube_color = "#2D8659"  # Green
    concept_color = "#3AAFA9"  # Teal
    slice_color = "#F9A825"  # Amber

    # Template node (center)
    template_label = f"{name}\\n({template_id})"
    dot.node("template", template_label, shape="box", style="filled,rounded", fillcolor=template_color, fontcolor="white", fontsize="12")

    # Methods cluster
    if template_methods:
        with dot.subgraph(name="cluster_methods") as c:
            c.attr(label="Methods", style="dashed", color=method_color)
            for idx, method_name in enumerate(template_methods):
                node_id = f"method_{idx}"
                is_primary = idx == 0
                label = f"⭐ {method_name}" if is_primary else method_name
                c.node(node_id, label, shape="ellipse", style="filled", fillcolor=method_color, fontcolor="white")
                dot.edge("template", node_id, label="uses" if is_primary else "also uses", color=method_color)

    # Input Cube cluster
    all_input_dims = auto_input_dims + [d for d in input_cube_dims if d.get("concept") and d["concept"] != "(select)"]
    all_input_measures = auto_input_measures + [m for m in input_cube_measures if m.get("concept") and m["concept"] != "(select)"]

    if all_input_dims or all_input_measures:
        with dot.subgraph(name="cluster_input_cube") as c:
            c.attr(label=f"Input Cube: {input_cube_name}", style="filled", color=cube_color, fillcolor="#E8F5E9")
            c.node("input_cube", input_cube_name, shape="box3d", style="filled", fillcolor=cube_color, fontcolor="white")

            # Dimensions
            for idx, dim in enumerate(all_input_dims):
                if dim.get("concept"):
                    node_id = f"in_dim_{idx}"
                    c.node(node_id, f"📐 {dim['concept']}\\n({dim['role']})", shape="box", style="filled", fillcolor=concept_color, fontcolor="white", fontsize="10")
                    c.edge("input_cube", node_id, label="dim", style="dashed", color=concept_color)

            # Measures
            for idx, measure in enumerate(all_input_measures):
                if measure.get("concept"):
                    node_id = f"in_meas_{idx}"
                    c.node(node_id, f"📊 {measure['concept']}\\n({measure['role']})", shape="box", style="filled", fillcolor=concept_color, fontcolor="white", fontsize="10")
                    c.edge("input_cube", node_id, label="meas", style="dashed", color=concept_color)

        dot.edge("input_cube", "template", label="input", color=cube_color)

    # Output Cube cluster
    all_output_dims = auto_output_dims + [d for d in output_cube_dims if d.get("concept") and d["concept"] != "(select)"]
    all_output_measures = auto_output_measures + [m for m in output_cube_measures if m.get("concept") and m["concept"] != "(select)"]

    if all_output_dims or all_output_measures:
        with dot.subgraph(name="cluster_output_cube") as c:
            c.attr(label=f"Output Cube: {output_cube_name}", style="filled", color=cube_color, fillcolor="#E3F2FD")
            c.node("output_cube", output_cube_name, shape="box3d", style="filled", fillcolor=cube_color, fontcolor="white")

            # Dimensions
            for idx, dim in enumerate(all_output_dims):
                if dim.get("concept"):
                    node_id = f"out_dim_{idx}"
                    c.node(node_id, f"📐 {dim['concept']}\\n({dim['role']})", shape="box", style="filled", fillcolor=concept_color, fontcolor="white", fontsize="10")
                    c.edge("output_cube", node_id, label="dim", style="dashed", color=concept_color)

            # Measures
            for idx, measure in enumerate(all_output_measures):
                if measure.get("concept"):
                    node_id = f"out_meas_{idx}"
                    c.node(node_id, f"📊 {measure['concept']}\\n({measure['role']})", shape="box", style="filled", fillcolor=concept_color, fontcolor="white", fontsize="10")
                    c.edge("output_cube", node_id, label="meas", style="dashed", color=concept_color)

        dot.edge("template", "output_cube", label="output", color=cube_color)

    # Slice cluster
    valid_constraints = [c for c in slice_constraints if c.get("concept") and c["concept"] != "(select)"]
    if valid_constraints:
        with dot.subgraph(name="cluster_slice") as c:
            c.attr(label=f"Slice: {slice_name or 'constraints'}", style="filled", color=slice_color, fillcolor="#FFF8E1")
            for idx, constraint in enumerate(valid_constraints):
                node_id = f"slice_{idx}"
                op = constraint.get("operator", "=")
                label = f"🔒 {constraint['concept']}"
                if constraint.get("parameter"):
                    label += f"\\n{op} {{{constraint['parameter']}}}"
                elif constraint.get("value"):
                    label += f"\\n{op} {constraint['value']}"
                c.node(node_id, label, shape="box", style="filled", fillcolor=slice_color, fontcolor="black", fontsize="10")

        dot.edge("template", f"slice_0", label="constrained by", color=slice_color, style="dashed")

    # Render the graph
    st.graphviz_chart(dot.source, use_container_width=True)


def _render_template_view_graph(template, lib):
    """Render a graph visualization for an existing template in the list view."""
    try:
        import graphviz
    except ImportError:
        st.warning("Install graphviz to see template graph: `pip install graphviz`")
        return

    # Create the graph
    dot = graphviz.Digraph(comment=f"Template: {template.name}")
    dot.attr(rankdir="TB", splines="ortho", nodesep="0.5", ranksep="0.8")

    # Color scheme matching CDISC branding
    template_color = "#6B4C9A" if template.type == "analysis" else "#E07850"
    method_color = "#4A90A4"
    cube_color = "#2D8659"
    concept_color = "#3AAFA9"
    slice_color = "#F9A825"

    # Template node
    template_label = f"{template.name}\\n({template.id})"
    dot.node("template", template_label, shape="box", style="filled,rounded", fillcolor=template_color, fontcolor="white", fontsize="12")

    # Method node
    if template.uses_method:
        dot.node("method", f"⭐ {template.uses_method}", shape="ellipse", style="filled", fillcolor=method_color, fontcolor="white")
        dot.edge("template", "method", label="uses", color=method_color)

    # Input Cube
    if hasattr(template, "input_cube") and template.input_cube:
        cube = template.input_cube
        with dot.subgraph(name="cluster_input_cube") as c:
            c.attr(label=f"Input Cube: {cube.name}", style="filled", color=cube_color, fillcolor="#E8F5E9")
            c.node("input_cube", cube.name, shape="box3d", style="filled", fillcolor=cube_color, fontcolor="white")

            if cube.dimensions:
                for idx, dim in enumerate(cube.dimensions):
                    node_id = f"in_dim_{idx}"
                    c.node(node_id, f"📐 {dim.data_concept}\\n({dim.role})", shape="box", style="filled", fillcolor=concept_color, fontcolor="white", fontsize="10")
                    c.edge("input_cube", node_id, label="dim", style="dashed", color=concept_color)

            if cube.measures:
                for idx, measure in enumerate(cube.measures):
                    node_id = f"in_meas_{idx}"
                    c.node(node_id, f"📊 {measure.data_concept}\\n({measure.role})", shape="box", style="filled", fillcolor=concept_color, fontcolor="white", fontsize="10")
                    c.edge("input_cube", node_id, label="meas", style="dashed", color=concept_color)

        dot.edge("input_cube", "template", label="input", color=cube_color)

    # Output Cube
    if hasattr(template, "output_cube") and template.output_cube:
        cube = template.output_cube
        with dot.subgraph(name="cluster_output_cube") as c:
            c.attr(label=f"Output Cube: {cube.name}", style="filled", color=cube_color, fillcolor="#E3F2FD")
            c.node("output_cube", cube.name, shape="box3d", style="filled", fillcolor=cube_color, fontcolor="white")

            if cube.dimensions:
                for idx, dim in enumerate(cube.dimensions):
                    node_id = f"out_dim_{idx}"
                    c.node(node_id, f"📐 {dim.data_concept}\\n({dim.role})", shape="box", style="filled", fillcolor=concept_color, fontcolor="white", fontsize="10")
                    c.edge("output_cube", node_id, label="dim", style="dashed", color=concept_color)

            if cube.measures:
                for idx, measure in enumerate(cube.measures):
                    node_id = f"out_meas_{idx}"
                    c.node(node_id, f"📊 {measure.data_concept}\\n({measure.role})", shape="box", style="filled", fillcolor=concept_color, fontcolor="white", fontsize="10")
                    c.edge("output_cube", node_id, label="meas", style="dashed", color=concept_color)

        dot.edge("template", "output_cube", label="output", color=cube_color)

    # Slice
    if hasattr(template, "slice") and template.slice and template.slice.constraints:
        with dot.subgraph(name="cluster_slice") as c:
            c.attr(label=f"Slice: {template.slice.name}", style="filled", color=slice_color, fillcolor="#FFF8E1")
            for idx, constraint in enumerate(template.slice.constraints):
                node_id = f"slice_{idx}"
                op = constraint.operator or "="
                label = f"🔒 {constraint.data_concept}"
                if hasattr(constraint, "parameter") and constraint.parameter:
                    label += f"\\n{op} {{{constraint.parameter}}}"
                elif constraint.value:
                    label += f"\\n{op} {constraint.value}"
                c.node(node_id, label, shape="box", style="filled", fillcolor=slice_color, fontcolor="black", fontsize="10")

        dot.edge("template", "slice_0", label="constrained by", color=slice_color, style="dashed")

    st.graphviz_chart(dot.source, use_container_width=True)


def _clear_template_form_state():
    """Clear template form session state."""
    keys_to_clear = [
        "template_methods", "template_role_bindings",
        "input_cube_dims", "input_cube_measures",
        "output_cube_dims", "output_cube_measures", "slice_constraints",
        "show_template_form", "editing_template",
    ]
    for key in keys_to_clear:
        if key in st.session_state:
            del st.session_state[key]


def _save_template(crud, lib, existing, editing_id, template_id, name, template_type, version, clinical_intent):
    """Save the template from form data."""
    from lib.models import TemplateExtended, RoleBinding, Cube, CubeDimension, CubeMeasure, Slice, SliceConstraint

    # Build role bindings from session state
    role_bindings = []
    primary_method = st.session_state.template_methods[0] if st.session_state.template_methods else ""

    for method_name in st.session_state.template_methods:
        method = lib.get_method_by_name(method_name)
        if not method:
            continue

        for role in method.roles:
            binding_key = f"{method_name}_{role.name}"
            binding_data = st.session_state.template_role_bindings.get(binding_key, {})
            concept = binding_data.get("concept", "")
            cube_role = binding_data.get("cube_role", "measure")

            # Get phrase data
            phrase_mode = binding_data.get("phrase_mode", "none")
            phrase = binding_data.get("phrase", "") if phrase_mode == "inline" else None
            phrase_ref = binding_data.get("phrase_ref", "") if phrase_mode == "library" else None
            parameter_overrides = binding_data.get("parameter_overrides", {}) if phrase_mode == "library" else None

            if concept:  # Only add bindings with concepts selected
                role_bindings.append(RoleBinding(
                    semantic_transformation_concept=concept,
                    method_role=role.name,
                    direction=role.direction,
                    cube_role=cube_role,
                    phrase=phrase if phrase else None,
                    phrase_ref=phrase_ref if phrase_ref else None,
                    parameter_overrides=parameter_overrides if parameter_overrides else None,
                ))

    # Collect auto-populated cube items from role bindings
    auto_input_measures, auto_input_dims, auto_output_measures, auto_output_dims = _collect_cube_items_from_bindings(
        lib, st.session_state.template_role_bindings, st.session_state.template_methods
    )

    # Build input cube (combine auto-populated + user-added)
    input_cube_name = st.session_state.get("input_cube_name", "input_cube")

    # Combine auto-populated dimensions with user-added
    all_input_dims = auto_input_dims + [
        d for d in st.session_state.input_cube_dims
        if d["concept"] and d["concept"] != "(select)"
        and not any(ad["concept"] == d["concept"] for ad in auto_input_dims)
    ]

    # Combine auto-populated measures with user-added
    all_input_measures = auto_input_measures + [
        m for m in st.session_state.input_cube_measures
        if m["concept"] and m["concept"] != "(select)"
        and not any(am["concept"] == m["concept"] for am in auto_input_measures)
    ]

    dimensions = [
        CubeDimension(data_concept=d["concept"], role=d["role"])
        for d in all_input_dims
    ]
    measures = [
        CubeMeasure(data_concept=m["concept"], role=m["role"])
        for m in all_input_measures
    ]

    input_cube = Cube(
        name=input_cube_name,
        dimensions=dimensions if dimensions else None,
        measures=measures if measures else [],
    )

    # Build output cube (combine auto-populated + user-added)
    output_cube_name = st.session_state.get("output_cube_name", "output_cube")

    # Combine auto-populated output dimensions with user-added
    all_output_dims = auto_output_dims + [
        d for d in st.session_state.get("output_cube_dims", [])
        if d["concept"] and d["concept"] != "(select)"
        and not any(ad["concept"] == d["concept"] for ad in auto_output_dims)
    ]

    all_output_measures = auto_output_measures + [
        m for m in st.session_state.output_cube_measures
        if m["concept"] and m["concept"] != "(select)"
        and not any(am["concept"] == m["concept"] for am in auto_output_measures)
    ]

    output_dimensions = [
        CubeDimension(data_concept=d["concept"], role=d["role"])
        for d in all_output_dims
    ]

    output_measures = [
        CubeMeasure(data_concept=m["concept"], role=m["role"])
        for m in all_output_measures
    ]

    output_cube = Cube(
        name=output_cube_name,
        dimensions=output_dimensions if output_dimensions else None,
        measures=output_measures if output_measures else [],
    )

    # Build slice
    slice_obj = None
    slice_name = st.session_state.get("slice_name", "")
    if slice_name or st.session_state.slice_constraints:
        constraints = [
            SliceConstraint(
                data_concept=c["concept"],
                operator=c.get("operator") if c.get("operator") and c.get("operator") != "=" else None,
                value=c["value"] if c.get("value") else None,
                parameter=c.get("parameter") if c.get("parameter") else None,
                label=c["label"] if c.get("label") else None,
            )
            for c in st.session_state.slice_constraints
            if c["concept"] and c["concept"] != "(select)"
        ]
        if constraints:
            slice_obj = Slice(name=slice_name or "default_slice", constraints=constraints)

    # Get resolved DEL expression from primary method
    del_expression = None
    if primary_method:
        method = lib.get_method_by_name(primary_method)
        if method:
            # Use resolved expression with concepts
            del_expression = _get_resolved_del_expression(method, st.session_state.template_role_bindings)

    # Create template using TemplateExtended which supports cube/slice fields
    template = TemplateExtended(
        id=template_id,
        name=name,
        type=template_type,
        version=version,
        clinical_intent=clinical_intent,
        uses_method=primary_method,
        role_bindings=role_bindings,
        del_expression=del_expression,
        input_cube=input_cube,
        output_cube=output_cube,
        slice=slice_obj,
    )

    if existing:
        crud.update_template(editing_id, template)
    else:
        crud.add_template(template)

    _clear_template_form_state()
    st.success("Template saved!")
    st.rerun()


# =============================================================================
# Phrases Screen
# =============================================================================

def render_phrases_view(filter_type: Optional[str] = None):
    """Render the Smart Phrases management screen."""
    crud = get_crud()
    lib = crud.library

    if filter_type == "static_phrases":
        st.header("💬 Static Phrases")
        st.markdown("Static phrases are fixed text elements that reference concepts.")
        _render_static_phrases(lib, crud)
    elif filter_type == "parameterized_phrases":
        st.header("💬 Parameterized Phrases")
        st.markdown("Parameterized phrases have placeholders that bind to concepts, methods, or literal values.")
        _render_parameterized_phrases(lib, crud)
    else:
        st.header("💬 Smart Phrases")
        st.markdown("""
        Smart Phrases are reusable text components that compose human-readable descriptions.
        They link natural language to semantic concepts, enabling traceability between
        documentation and formal specifications.

        **Note:** Sentences (composed from phrases) are study-specific and defined at the instance level,
        not in the library.
        """)

        # Overview stats
        col1, col2 = st.columns(2)
        with col1:
            st.metric("Static Phrases", len(lib.static_phrases))
        with col2:
            st.metric("Parameterized Phrases", len(lib.parameterized_phrases))

        st.markdown("---")

        # Show all phrase types (without sentences - they're study-level)
        tab1, tab2 = st.tabs(["Static Phrases", "Parameterized Phrases"])

        with tab1:
            _render_static_phrases(lib, crud)

        with tab2:
            _render_parameterized_phrases(lib, crud)


def _render_static_phrases(lib, crud):
    """Render the static phrases list with create/edit/delete functionality."""
    # Check if we should show the form
    if st.session_state.get("show_static_phrase_form"):
        _render_static_phrase_form(lib, crud)
        return

    # Action button
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ New Static Phrase", use_container_width=True):
            _clear_all_form_states()
            st.session_state.editing_static_phrase = None
            st.session_state.show_static_phrase_form = True
            st.rerun()

    # Group by role
    phrases_by_role: Dict[str, list] = {}
    for phrase in lib.static_phrases:
        role = phrase.role
        if role not in phrases_by_role:
            phrases_by_role[role] = []
        phrases_by_role[role].append(phrase)

    if not phrases_by_role:
        st.info("No static phrases defined yet. Click 'New Static Phrase' to create one.")
        return

    # Display grouped by role
    for role in sorted(phrases_by_role.keys()):
        phrases = phrases_by_role[role]
        st.markdown(f"### Role: `{role}` ({len(phrases)} phrases)")

        for phrase in phrases:
            with st.expander(f"**{phrase.id}** - _{phrase.phrase_template}_"):
                st.markdown(f"*{phrase.description}*")

                col1, col2 = st.columns(2)
                with col1:
                    st.markdown("**Phrase Template:**")
                    st.code(phrase.phrase_template, language="text")
                with col2:
                    st.markdown("**References (Concepts/Methods):**")
                    for ref in phrase.references:
                        # Check if reference is a concept or method
                        concept = lib.get_concept_by_name(ref)
                        method = lib.get_method_by_name(ref)
                        if concept:
                            st.markdown(f"- 🧩 `{ref}` (concept: {concept.category})")
                        elif method:
                            st.markdown(f"- 📐 `{ref}` (method: {method.type})")
                        else:
                            st.markdown(f"- `{ref}`")

                # Show which templates might use this phrase
                _show_phrase_usage(phrase, lib)

                # Action buttons
                action_cols = st.columns([1, 1, 4])
                with action_cols[0]:
                    if st.button("✏️ Edit", key=f"edit_sp_{phrase.id}"):
                        _clear_all_form_states()
                        st.session_state.editing_static_phrase = phrase.id
                        st.session_state.show_static_phrase_form = True
                        st.rerun()
                with action_cols[1]:
                    if st.button("🗑️ Delete", key=f"del_sp_{phrase.id}"):
                        crud.delete_phrase(phrase.id)
                        st.rerun()


def _render_static_phrase_form(lib, crud):
    """Render the static phrase create/edit form."""
    phrase_id = st.session_state.get("editing_static_phrase")
    existing = crud.get_static_phrase_by_id(phrase_id) if phrase_id else None

    st.markdown("### " + ("Edit Static Phrase" if existing else "New Static Phrase"))

    # Cancel button
    if st.button("← Back to List"):
        st.session_state.show_static_phrase_form = False
        st.session_state.editing_static_phrase = None
        st.rerun()

    # Phrase roles
    phrase_roles = ["endpoint", "covariate", "grouping", "population", "timepoint", "parameter", "method", "method_qualifier"]

    # Form fields
    with st.form("static_phrase_form"):
        phrase_id_input = st.text_input(
            "Phrase ID *",
            value=existing.id if existing else "SP_",
            help="Unique identifier (e.g., SP_CFB_ENDPOINT)",
            disabled=existing is not None,  # Cannot change ID when editing
        )

        phrase_role = st.selectbox(
            "Role *",
            phrase_roles,
            index=phrase_roles.index(existing.role) if existing and existing.role in phrase_roles else 0,
            help="The semantic role this phrase plays in a sentence",
        )

        phrase_template = st.text_input(
            "Phrase Template *",
            value=existing.phrase_template if existing else "",
            help="The static phrase text (e.g., 'change from baseline')",
        )

        # References - multi-select from concepts and methods
        all_references = [c.name for c in lib.all_concepts] + [m.name for m in lib.all_methods]
        phrase_references = st.multiselect(
            "References (Concepts/Methods)",
            all_references,
            default=existing.references if existing else [],
            help="Which concepts or methods this phrase references",
        )

        phrase_description = st.text_area(
            "Description",
            value=existing.description if existing else "",
            help="Human-readable description of this phrase",
        )

        submitted = st.form_submit_button("Save Phrase")

        if submitted:
            # Validation
            if not phrase_id_input or not phrase_id_input.startswith("SP_"):
                st.error("Phrase ID must start with 'SP_'")
            elif not phrase_template:
                st.error("Phrase template is required")
            else:
                from lib.models import StaticPhrase

                new_phrase = StaticPhrase(
                    id=phrase_id_input,
                    role=phrase_role,
                    phrase_template=phrase_template,
                    references=phrase_references,
                    description=phrase_description,
                )

                if existing:
                    crud.update_static_phrase(phrase_id, new_phrase)
                    st.success("Phrase updated!")
                else:
                    crud.add_static_phrase(new_phrase)
                    st.success("Phrase created!")

                st.session_state.show_static_phrase_form = False
                st.session_state.editing_static_phrase = None
                st.rerun()


def _render_parameterized_phrases(lib, crud):
    """Render the parameterized phrases list with create/edit/delete functionality."""
    # Check if we should show the form
    if st.session_state.get("show_parameterized_phrase_form"):
        _render_parameterized_phrase_form(lib, crud)
        return

    # Action button
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("➕ New Parameterized Phrase", use_container_width=True):
            _clear_all_form_states()
            st.session_state.editing_parameterized_phrase = None
            st.session_state.show_parameterized_phrase_form = True
            st.session_state.phrase_params = []  # Reset params
            st.rerun()

    # Group by role
    phrases_by_role: Dict[str, list] = {}
    for phrase in lib.parameterized_phrases:
        role = phrase.role
        if role not in phrases_by_role:
            phrases_by_role[role] = []
        phrases_by_role[role].append(phrase)

    if not phrases_by_role:
        st.info("No parameterized phrases defined yet. Click 'New Parameterized Phrase' to create one.")
        return

    # Display grouped by role
    for role in sorted(phrases_by_role.keys()):
        phrases = phrases_by_role[role]
        st.markdown(f"### Role: `{role}` ({len(phrases)} phrases)")

        for phrase in phrases:
            with st.expander(f"**{phrase.id}** - _{phrase.phrase_template}_"):
                st.markdown(f"*{phrase.description}*")

                col1, col2 = st.columns(2)
                with col1:
                    st.markdown("**Phrase Template:**")
                    st.code(phrase.phrase_template, language="text")

                    # Show parameters with bindings
                    st.markdown("**Parameters:**")
                    param_names = phrase.get_parameter_names()
                    for param_name in param_names:
                        binding = phrase.get_parameter_binding(param_name)
                        if binding:
                            # New format with PhraseParameter
                            bind_icon = "🧩" if binding.binds_to == "concept" else (
                                "📐" if binding.binds_to == "method" else "✏️"
                            )
                            bind_target = binding.concept_ref or binding.method_ref or binding.default_value or "(unbound)"
                            st.markdown(f"- `{{{param_name}}}` → {bind_icon} {binding.binds_to}: `{bind_target}`")
                            if binding.description:
                                st.caption(f"    _{binding.description}_")
                        else:
                            # Legacy format (just string names)
                            st.markdown(f"- `{{{param_name}}}`")

                with col2:
                    st.markdown("**References (Concepts/Methods):**")
                    for ref in phrase.references:
                        concept = lib.get_concept_by_name(ref)
                        method = lib.get_method_by_name(ref)
                        if concept:
                            st.markdown(f"- 🧩 `{ref}` (concept: {concept.category})")
                        elif method:
                            st.markdown(f"- 📐 `{ref}` (method: {method.type})")
                        else:
                            st.markdown(f"- `{ref}`")

                # Show which templates might use this phrase
                _show_phrase_usage(phrase, lib)

                # Action buttons
                action_cols = st.columns([1, 1, 4])
                with action_cols[0]:
                    if st.button("✏️ Edit", key=f"edit_pp_{phrase.id}"):
                        _clear_all_form_states()
                        st.session_state.editing_parameterized_phrase = phrase.id
                        st.session_state.show_parameterized_phrase_form = True
                        # Initialize params from existing phrase
                        st.session_state.phrase_params = []
                        for param_name in phrase.get_parameter_names():
                            binding = phrase.get_parameter_binding(param_name)
                            if binding:
                                st.session_state.phrase_params.append({
                                    "name": param_name,
                                    "binds_to": binding.binds_to,
                                    "concept_ref": binding.concept_ref or "",
                                    "method_ref": binding.method_ref or "",
                                    "default_value": binding.default_value or "",
                                    "description": binding.description or "",
                                })
                            else:
                                # Legacy format
                                st.session_state.phrase_params.append({
                                    "name": param_name,
                                    "binds_to": "concept",
                                    "concept_ref": param_name,
                                    "method_ref": "",
                                    "default_value": "",
                                    "description": "",
                                })
                        st.rerun()
                with action_cols[1]:
                    if st.button("🗑️ Delete", key=f"del_pp_{phrase.id}"):
                        crud.delete_phrase(phrase.id)
                        st.rerun()


def _extract_params_from_template(template: str) -> List[str]:
    """Extract parameter names from a phrase template."""
    import re
    return re.findall(r'\{(\w+)\}', template)


def _render_parameterized_phrase_form(lib, crud):
    """Render the parameterized phrase create/edit form with parameter binding editor."""
    phrase_id = st.session_state.get("editing_parameterized_phrase")
    existing = crud.get_parameterized_phrase_by_id(phrase_id) if phrase_id else None

    st.markdown("### " + ("Edit Parameterized Phrase" if existing else "New Parameterized Phrase"))

    # Cancel button
    if st.button("← Back to List"):
        st.session_state.show_parameterized_phrase_form = False
        st.session_state.editing_parameterized_phrase = None
        st.session_state.phrase_params = []
        st.rerun()

    # Phrase roles
    phrase_roles = ["endpoint", "covariate", "grouping", "population", "timepoint", "parameter", "method", "method_qualifier"]

    # Form fields (outside form for dynamic updates)
    phrase_id_input = st.text_input(
        "Phrase ID *",
        value=existing.id if existing else "SP_",
        help="Unique identifier (e.g., SP_TIMEPOINT)",
        disabled=existing is not None,
        key="pp_form_id",
    )

    phrase_role = st.selectbox(
        "Role *",
        phrase_roles,
        index=phrase_roles.index(existing.role) if existing and existing.role in phrase_roles else 0,
        help="The semantic role this phrase plays in a sentence",
        key="pp_form_role",
    )

    phrase_template = st.text_input(
        "Phrase Template *",
        value=existing.phrase_template if existing else "",
        help="Use {param_name} for placeholders (e.g., 'at {visit}')",
        key="pp_form_template",
    )

    # Extract parameters from template
    detected_params = _extract_params_from_template(phrase_template)

    # Initialize phrase_params in session state if needed
    if "phrase_params" not in st.session_state:
        st.session_state.phrase_params = []

    # Sync detected params with session state
    existing_param_names = {p["name"] for p in st.session_state.phrase_params}
    for param in detected_params:
        if param not in existing_param_names:
            st.session_state.phrase_params.append({
                "name": param,
                "binds_to": "concept",
                "concept_ref": param,  # Default to concept with same name
                "method_ref": "",
                "default_value": "",
                "description": "",
            })

    # Remove params no longer in template
    st.session_state.phrase_params = [
        p for p in st.session_state.phrase_params if p["name"] in detected_params
    ]

    # Parameter binding editor
    if detected_params:
        st.markdown("### Parameter Bindings")
        st.caption("Define how each parameter is bound (to a concept, method, or literal value).")

        concept_names = [""] + [c.name for c in lib.all_concepts]
        method_names = [""] + [m.name for m in lib.all_methods]
        bind_types = ["concept", "method", "literal"]

        for idx, param in enumerate(st.session_state.phrase_params):
            st.markdown(f"#### `{{{param['name']}}}`")

            cols = st.columns([2, 3, 3])
            with cols[0]:
                new_binds_to = st.selectbox(
                    "Binds to",
                    bind_types,
                    index=bind_types.index(param["binds_to"]),
                    key=f"pp_bind_type_{idx}",
                    label_visibility="collapsed",
                )
                param["binds_to"] = new_binds_to

            with cols[1]:
                if param["binds_to"] == "concept":
                    default_idx = concept_names.index(param["concept_ref"]) if param["concept_ref"] in concept_names else 0
                    param["concept_ref"] = st.selectbox(
                        "Concept",
                        concept_names,
                        index=default_idx,
                        key=f"pp_concept_{idx}",
                        label_visibility="collapsed",
                    )
                elif param["binds_to"] == "method":
                    default_idx = method_names.index(param["method_ref"]) if param["method_ref"] in method_names else 0
                    param["method_ref"] = st.selectbox(
                        "Method",
                        method_names,
                        index=default_idx,
                        key=f"pp_method_{idx}",
                        label_visibility="collapsed",
                    )
                else:  # literal
                    param["default_value"] = st.text_input(
                        "Default value",
                        value=param["default_value"],
                        key=f"pp_literal_{idx}",
                        label_visibility="collapsed",
                    )

            with cols[2]:
                param["description"] = st.text_input(
                    "Description",
                    value=param["description"],
                    key=f"pp_desc_{idx}",
                    placeholder="Help text...",
                    label_visibility="collapsed",
                )
    else:
        st.info("Add `{parameter}` placeholders to your phrase template to define parameters.")

    # References
    all_references = [c.name for c in lib.all_concepts] + [m.name for m in lib.all_methods]
    phrase_references = st.multiselect(
        "References (Concepts/Methods)",
        all_references,
        default=existing.references if existing else [],
        help="Which concepts or methods this phrase references",
        key="pp_form_refs",
    )

    phrase_description = st.text_area(
        "Description",
        value=existing.description if existing else "",
        help="Human-readable description of this phrase",
        key="pp_form_desc",
    )

    # Save button
    if st.button("Save Phrase", type="primary"):
        # Validation
        if not phrase_id_input or not phrase_id_input.startswith("SP_"):
            st.error("Phrase ID must start with 'SP_'")
        elif not phrase_template:
            st.error("Phrase template is required")
        elif not detected_params:
            st.error("Parameterized phrase must have at least one {parameter} placeholder")
        else:
            from lib.models import ParameterizedPhrase, PhraseParameter

            # Build parameter list
            params = []
            for p in st.session_state.phrase_params:
                params.append(PhraseParameter(
                    name=p["name"],
                    binds_to=p["binds_to"],
                    concept_ref=p["concept_ref"] if p["binds_to"] == "concept" and p["concept_ref"] else None,
                    method_ref=p["method_ref"] if p["binds_to"] == "method" and p["method_ref"] else None,
                    default_value=p["default_value"] if p["binds_to"] == "literal" else None,
                    description=p["description"] if p["description"] else None,
                ))

            new_phrase = ParameterizedPhrase(
                id=phrase_id_input,
                role=phrase_role,
                phrase_template=phrase_template,
                parameters=params,
                references=phrase_references,
                description=phrase_description,
            )

            if existing:
                crud.update_parameterized_phrase(phrase_id, new_phrase)
                st.success("Phrase updated!")
            else:
                crud.add_parameterized_phrase(new_phrase)
                st.success("Phrase created!")

            st.session_state.show_parameterized_phrase_form = False
            st.session_state.editing_parameterized_phrase = None
            st.session_state.phrase_params = []
            st.rerun()


def _render_sentences(lib, crud):
    """Render the sentences (composed phrases) list."""
    if not lib.sentences:
        st.info("No sentences defined yet.")
        return

    for sentence in lib.sentences:
        with st.expander(f"**{sentence.id}** - {sentence.name}", expanded=True):
            st.markdown(f"**Describes:** `{sentence.describes}`")

            # Show the composed text
            st.markdown("**Composed Text:**")
            st.info(sentence.text)

            # Show phrase composition
            st.markdown("**Composed Of:**")

            # Sort by order
            composed = sorted(sentence.composed_of, key=lambda x: x.order)

            for cp in composed:
                phrase_id = cp.phrase_id
                order = cp.order

                # Find the phrase
                phrase = None
                for p in lib.static_phrases:
                    if p.id == phrase_id:
                        phrase = p
                        break
                if not phrase:
                    for p in lib.parameterized_phrases:
                        if p.id == phrase_id:
                            phrase = p
                            break

                if phrase:
                    # Show the phrase with its binding
                    if cp.bound_value:
                        resolved = phrase.phrase_template.replace(
                            f"{{{phrase.parameters[0]}}}",
                            f"**{cp.bound_value}**"
                        ) if hasattr(phrase, 'parameters') and phrase.parameters else phrase.phrase_template
                        st.markdown(f"{order}. `{phrase_id}` ({phrase.role}): _{resolved}_")
                    elif cp.bound_values:
                        resolved = phrase.phrase_template
                        for key, value in cp.bound_values.items():
                            resolved = resolved.replace(f"{{{key}}}", f"**{value}**")
                        st.markdown(f"{order}. `{phrase_id}` ({phrase.role}): _{resolved}_")
                    else:
                        st.markdown(f"{order}. `{phrase_id}` ({phrase.role}): _{phrase.phrase_template}_")
                else:
                    st.markdown(f"{order}. `{phrase_id}` (not found)")

            # Show traceability if available
            if sentence.traceability:
                with st.container():
                    if st.checkbox("Show Traceability", key=f"trace_{sentence.id}"):
                        st.json(sentence.traceability)


def _show_phrase_usage(phrase, lib):
    """Show where a phrase is used in templates."""
    # Check templates that reference the same concepts
    referenced_concepts = phrase.references
    matching_templates = []
    for template in lib.all_templates:
        for rb in template.role_bindings:
            if rb.semantic_transformation_concept in referenced_concepts:
                matching_templates.append(template)
                break

    if matching_templates:
        st.markdown("**Related Templates** _(via concept references)_**:**")
        for template in matching_templates[:5]:  # Limit to 5
            st.markdown(f"- 📋 `{template.id}` - {template.name}")
        if len(matching_templates) > 5:
            st.caption(f"_...and {len(matching_templates) - 5} more_")


def _get_phrases_for_concept(concept_name: str, lib) -> List[Any]:
    """Get all phrases that reference a concept."""
    phrases = []
    for phrase in lib.static_phrases:
        if concept_name in phrase.references:
            phrases.append(phrase)
    for phrase in lib.parameterized_phrases:
        if concept_name in phrase.references:
            phrases.append(phrase)
    return phrases


def _get_phrases_for_method(method_name: str, lib) -> List[Any]:
    """Get all phrases that reference a method."""
    phrases = []
    for phrase in lib.static_phrases:
        if method_name in phrase.references:
            phrases.append(phrase)
    for phrase in lib.parameterized_phrases:
        if method_name in phrase.references:
            phrases.append(phrase)
    return phrases


# =============================================================================
# Dependencies Screen
# =============================================================================

def _get_upstream_chain(
    template,
    lib,
    visited: set = None,
    depth: int = 0,
    max_depth: int = 10
) -> List[Tuple[Any, str, int]]:
    """
    Recursively find all upstream templates (the full chain).

    Returns a list of (template, concept_produced, depth) tuples.
    """
    if visited is None:
        visited = set()

    if depth >= max_depth or template.id in visited:
        return []

    visited.add(template.id)
    results = []

    # Get input concepts for this template
    input_concepts = [
        rb.semantic_transformation_concept
        for rb in template.role_bindings
        if rb.direction == "input"
    ]

    # Find templates that produce these concepts
    for t in lib.all_templates:
        if t.id not in visited:
            t_outputs = [
                rb.semantic_transformation_concept
                for rb in t.role_bindings
                if rb.direction == "output"
            ]
            for concept_name in t_outputs:
                if concept_name in input_concepts:
                    results.append((t, concept_name, depth))
                    # Recursively get upstream of this template
                    upstream = _get_upstream_chain(t, lib, visited.copy(), depth + 1, max_depth)
                    results.extend(upstream)
                    break  # Avoid duplicate entries for same template

    return results


def _get_downstream_chain(
    template,
    lib,
    visited: set = None,
    depth: int = 0,
    max_depth: int = 10
) -> List[Tuple[Any, str, int]]:
    """
    Recursively find all downstream templates (the full chain).

    Returns a list of (template, concept_consumed, depth) tuples.
    """
    if visited is None:
        visited = set()

    if depth >= max_depth or template.id in visited:
        return []

    visited.add(template.id)
    results = []

    # Get output concepts for this template
    output_concepts = [
        rb.semantic_transformation_concept
        for rb in template.role_bindings
        if rb.direction == "output"
    ]

    # Find templates that consume these concepts
    for t in lib.all_templates:
        if t.id not in visited:
            for rb in t.role_bindings:
                if rb.direction == "input" and rb.semantic_transformation_concept in output_concepts:
                    results.append((t, rb.semantic_transformation_concept, depth))
                    # Recursively get downstream of this template
                    downstream = _get_downstream_chain(t, lib, visited.copy(), depth + 1, max_depth)
                    results.extend(downstream)
                    break  # Avoid duplicate entries for same template

    return results


def render_dependencies():
    """Render the dependencies visualization screen."""
    st.header("🔗 Dependencies")
    st.markdown("View relationships between templates, methods, and concepts.")

    crud = get_crud()
    lib = crud.library

    # Check if graphviz is available
    try:
        import graphviz

        # Create dependency graph
        dot = graphviz.Digraph(comment="AC/DC Dependencies")
        dot.attr(rankdir="TB", splines="ortho", nodesep="0.5", ranksep="0.8")

        # Add method nodes
        with dot.subgraph(name="cluster_methods") as methods:
            methods.attr(label="Methods", style="dashed", color=CDISC_COLORS["accent_1"])
            for m in lib.all_methods:
                color = CDISC_COLORS["accent_1"] if m.type == "derivation" else CDISC_COLORS["accent_5"]
                methods.node(
                    f"m_{m.name}",
                    m.name,
                    shape="box",
                    style="filled",
                    fillcolor=color,
                    fontcolor="white",
                )

        # Add template nodes
        with dot.subgraph(name="cluster_templates") as templates:
            templates.attr(label="Templates", style="dashed", color=CDISC_COLORS["accent_3"])
            for t in lib.all_templates:
                color = CDISC_COLORS["accent_3"] if t.type == "derivation" else CDISC_COLORS["accent_5"]
                templates.node(
                    f"t_{t.id}",
                    f"{t.id}\n{t.name}",
                    shape="box",
                    style="filled,rounded",
                    fillcolor=color,
                    fontcolor="white",
                )

        # Add edges: Template -> Method
        for t in lib.all_templates:
            dot.edge(f"t_{t.id}", f"m_{t.uses_method}", label="uses")

        # Render graph
        st.graphviz_chart(dot.source)

        # Legend
        st.markdown(f"""
        <div style="display: flex; gap: 16px; flex-wrap: wrap; padding: 8px; background: white; border-radius: 4px; margin-top: 8px;">
            <div style="display: flex; align-items: center; gap: 4px;">
                <div style="width: 16px; height: 16px; background: {CDISC_COLORS["accent_3"]}; border-radius: 4px;"></div>
                <span style="font-size: 0.85em;">DC Template</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
                <div style="width: 16px; height: 16px; background: {CDISC_COLORS["accent_5"]}; border-radius: 4px;"></div>
                <span style="font-size: 0.85em;">AC Template / Analysis Method</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
                <div style="width: 16px; height: 16px; background: {CDISC_COLORS["accent_1"]}; border-radius: 4px;"></div>
                <span style="font-size: 0.85em;">Derivation Method</span>
            </div>
        </div>
        """, unsafe_allow_html=True)

    except ImportError:
        st.warning("⚠️ Graphviz not available. Install with: `pip install graphviz` and `brew install graphviz` (macOS)")

    st.markdown("---")

    # Concept-to-Template Explorer
    st.subheader("🧩 Concept → Template Mapping")
    st.markdown("Expand concepts to see which templates use them.")

    # Build concept-to-template mapping
    concept_to_templates: Dict[str, List[Tuple[Any, str]]] = {}  # concept_name -> [(template, role_direction)]
    for t in lib.all_templates:
        for rb in t.role_bindings:
            concept_name = rb.semantic_transformation_concept
            if concept_name not in concept_to_templates:
                concept_to_templates[concept_name] = []
            concept_to_templates[concept_name].append((t, rb.direction, rb.cube_role))

    # Group concepts by level
    obs_concepts = [c for c in lib.all_concepts if c.level == "observation"]
    inf_concepts = [c for c in lib.all_concepts if c.level == "inference"]

    col1, col2 = st.columns(2)

    with col1:
        st.markdown(f"**📊 Observation-level Concepts** ({len(obs_concepts)})")
        for concept in sorted(obs_concepts, key=lambda c: c.name):
            templates_using = concept_to_templates.get(concept.name, [])
            badge = f" ({len(templates_using)} templates)" if templates_using else " (unused)"
            with st.expander(f"**{concept.name}**{badge}", expanded=False):
                st.markdown(f"*{concept.description}*")
                st.markdown(f"- **Category:** {concept.category}")
                st.markdown(f"- **Data Type:** {concept.data_type}")
                if templates_using:
                    st.markdown("**Used by:**")
                    for t, direction, cube_role in templates_using:
                        direction_icon = "⬅️" if direction == "input" else "➡️"
                        st.markdown(f"- {direction_icon} `{t.id}` as {cube_role} ({direction})")
                else:
                    st.info("Not used by any template")

    with col2:
        st.markdown(f"**📈 Inference-level Concepts** ({len(inf_concepts)})")
        for concept in sorted(inf_concepts, key=lambda c: c.name):
            templates_using = concept_to_templates.get(concept.name, [])
            badge = f" ({len(templates_using)} templates)" if templates_using else " (unused)"
            with st.expander(f"**{concept.name}**{badge}", expanded=False):
                st.markdown(f"*{concept.description}*")
                st.markdown(f"- **Category:** {concept.category}")
                st.markdown(f"- **Data Type:** {concept.data_type}")
                if templates_using:
                    st.markdown("**Used by:**")
                    for t, direction, cube_role in templates_using:
                        direction_icon = "⬅️" if direction == "input" else "➡️"
                        st.markdown(f"- {direction_icon} `{t.id}` as {cube_role} ({direction})")
                else:
                    st.info("Not used by any template")

    st.markdown("---")

    # Dependency explorer
    st.subheader("🔎 Template Dependency Explorer")
    st.markdown("Select a template to see its complete dependency chain (recursive).")

    template_options = [f"{t.id} - {t.name}" for t in lib.all_templates]
    if template_options:
        selected = st.selectbox("Select a template", template_options)
        selected_id = selected.split(" - ")[0]
        template = lib.get_template_by_id(selected_id)

        if template:
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("**⬆️ Upstream Dependency Chain**")
                st.markdown("_Complete chain of templates that must execute before this one_")

                # Method
                st.markdown(f"**Method:** `{template.uses_method}`")
                method = lib.get_method_by_name(template.uses_method)
                if method:
                    st.markdown(f"  - _{method.description}_")

                # Get full upstream chain recursively
                upstream_chain = _get_upstream_chain(template, lib)

                if upstream_chain:
                    st.markdown("**Upstream Template Chain:**")
                    # Group by depth for display
                    max_depth = max(depth for _, _, depth in upstream_chain)
                    for depth in range(max_depth + 1):
                        templates_at_depth = [(t, c) for t, c, d in upstream_chain if d == depth]
                        if templates_at_depth:
                            depth_label = "Direct" if depth == 0 else f"Level {depth + 1}"
                            st.markdown(f"**{depth_label}:**")
                            for t, concept in templates_at_depth:
                                t_type = "🔷 DC" if t.type == "derivation" else "🔶 AC"
                                indent = "&nbsp;&nbsp;&nbsp;&nbsp;" * (depth + 1)
                                st.markdown(f"{indent}↑ {t_type} `{t.id}` produces `{concept}`", unsafe_allow_html=True)
                else:
                    st.info("No upstream template dependencies")

                # Show input concepts
                st.markdown("**Input Concepts:**")
                input_concepts = [
                    rb.semantic_transformation_concept
                    for rb in template.role_bindings
                    if rb.direction == "input"
                ]
                # Get immediate upstream for markers
                immediate_upstream = [(t, c) for t, c, d in upstream_chain if d == 0]
                for rb in template.role_bindings:
                    if rb.direction == "input":
                        concept = lib.get_concept_by_name(rb.semantic_transformation_concept)
                        if concept:
                            has_upstream = any(c == concept.name for _, c in immediate_upstream)
                            upstream_marker = " ⬅️" if has_upstream else ""
                            st.markdown(f"  - `{concept.name}` ({concept.category}){upstream_marker}")

            with col2:
                st.markdown("**⬇️ Downstream Dependency Chain**")
                st.markdown("_Complete chain of templates that depend on this one_")

                # Get full downstream chain recursively
                downstream_chain = _get_downstream_chain(template, lib)

                if downstream_chain:
                    st.markdown("**Downstream Template Chain:**")
                    # Group by depth for display
                    max_depth = max(depth for _, _, depth in downstream_chain)
                    for depth in range(max_depth + 1):
                        templates_at_depth = [(t, c) for t, c, d in downstream_chain if d == depth]
                        if templates_at_depth:
                            depth_label = "Direct" if depth == 0 else f"Level {depth + 1}"
                            st.markdown(f"**{depth_label}:**")
                            for t, concept in templates_at_depth:
                                t_type = "🔶 AC" if t.type == "analysis" else "🔷 DC"
                                indent = "&nbsp;&nbsp;&nbsp;&nbsp;" * (depth + 1)
                                st.markdown(f"{indent}↓ {t_type} `{t.id}` needs `{concept}`", unsafe_allow_html=True)
                else:
                    st.info("No downstream template dependencies")

                # Find instances that are instance_of this template
                downstream_instances = []
                for inst in lib.dc_instances + lib.ac_instances:
                    if inst.instance_of == template.id:
                        downstream_instances.append(inst)

                # Find templates/instances with depends_on referencing this template
                downstream_depends_on = []
                for t in lib.all_templates:
                    if hasattr(t, 'depends_on') and t.depends_on and template.id in t.depends_on:
                        downstream_depends_on.append(t)
                for inst in lib.dc_instances + lib.ac_instances:
                    if hasattr(inst, 'depends_on') and inst.depends_on and template.id in inst.depends_on:
                        downstream_depends_on.append(inst)

                # Show instances of this template
                if downstream_instances:
                    st.markdown("**Instances of this template:**")
                    for inst in downstream_instances:
                        inst_type = "🔷" if hasattr(inst, 'type') and inst.type == "derivation_instance" else "🔶"
                        st.markdown(f"- {inst_type} `{inst.id}` - {inst.name}")

                # Show items with explicit depends_on
                if downstream_depends_on:
                    st.markdown("**Explicit dependencies (depends_on):**")
                    for item in downstream_depends_on:
                        if hasattr(item, 'type') and item.type in ("derivation", "analysis"):
                            st.markdown(f"- 📋 `{item.id}` - {item.name}")
                        else:
                            st.markdown(f"- 📦 `{item.id}` - {item.name}")

                # Show output concepts
                st.markdown("**Output Concepts:**")
                immediate_downstream = [(t, c) for t, c, d in downstream_chain if d == 0]
                for rb in template.role_bindings:
                    if rb.direction == "output":
                        concept = lib.get_concept_by_name(rb.semantic_transformation_concept)
                        if concept:
                            has_downstream = any(c == concept.name for _, c in immediate_downstream)
                            downstream_marker = " ➡️" if has_downstream else ""
                            st.markdown(f"  - `{concept.name}` ({concept.category}){downstream_marker}")


# =============================================================================
# Study Section (Placeholder)
# =============================================================================

def render_study_placeholder(section_name: str):
    """Render a placeholder for study-level features (to be developed)."""
    st.header(f"📊 {section_name}")

    st.info("""
    **To be developed**

    This section will support study-specific artifacts:

    - **DC Instances**: Study-specific derivation concept instances
      - Instantiate DC templates with study parameters
      - Define slice bindings (visit, population, parameter values)
      - Map to study-specific ADaM datasets

    - **AC Instances**: Study-specific analysis concept instances
      - Instantiate AC templates with study parameters
      - Define treatment specifications
      - Configure hypothesis tests

    - **Sentences**: Composed descriptions for study documentation
      - Combine phrases with bound values from instances
      - Generate human-readable analysis descriptions
      - Trace back to template and library phrases

    The library components (Methods, Concepts, Templates, Phrases) must be
    defined first before creating study instances.
    """)

    # Show existing instances if any
    crud = get_crud()
    lib = crud.library

    if section_name == "DC Instances" and lib.dc_instances:
        st.markdown("### Existing DC Instances (from metadata)")
        for inst in lib.dc_instances:
            with st.expander(f"**{inst.id}** - {inst.name}"):
                st.markdown(f"**Study:** {inst.study}")
                st.markdown(f"**Instance of:** `{inst.instance_of}`")
                st.markdown(f"**Description:** _{inst.description}_")

    elif section_name == "AC Instances" and lib.ac_instances:
        st.markdown("### Existing AC Instances (from metadata)")
        for inst in lib.ac_instances:
            with st.expander(f"**{inst.id}** - {inst.name}"):
                st.markdown(f"**Study:** {inst.study}")
                st.markdown(f"**Instance of:** `{inst.instance_of}`")
                st.markdown(f"**Description:** _{inst.description}_")

    elif section_name == "Sentences" and lib.sentences:
        st.markdown("### Existing Sentences (from metadata)")
        for sentence in lib.sentences:
            with st.expander(f"**{sentence.id}** - {sentence.name}"):
                st.markdown(f"**Describes:** `{sentence.describes}`")
                st.info(sentence.text)


# =============================================================================
# Main Application
# =============================================================================

def main():
    """Main application entry point."""
    # Get navigation from sidebar
    screen = render_sidebar()

    # Route to appropriate screen
    if screen == "overview":
        render_overview()
    elif screen == "methods":
        render_methods_view()
    elif screen == "derivation_methods":
        render_methods_view("derivation_methods")
    elif screen == "analysis_methods":
        render_methods_view("analysis_methods")
    elif screen == "concepts":
        render_concepts_view()
    elif screen == "observation_concepts":
        render_concepts_view("observation_concepts")
    elif screen == "inference_concepts":
        render_concepts_view("inference_concepts")
    elif screen == "templates":
        render_templates_view()
    elif screen == "dc_templates":
        render_templates_view("dc_templates")
    elif screen == "ac_templates":
        render_templates_view("ac_templates")
    elif screen == "phrases":
        render_phrases_view()
    elif screen == "static_phrases":
        render_phrases_view("static_phrases")
    elif screen == "parameterized_phrases":
        render_phrases_view("parameterized_phrases")
    elif screen == "dependencies":
        render_dependencies()
    # Study section (placeholder)
    elif screen == "dc_instances":
        render_study_placeholder("DC Instances")
    elif screen == "ac_instances":
        render_study_placeholder("AC Instances")
    elif screen == "sentences":
        render_study_placeholder("Sentences")
    else:
        render_overview()


if __name__ == "__main__":
    main()
