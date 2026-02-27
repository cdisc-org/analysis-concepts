"""CDISC 360i branding constants and CSS styles."""

# Official CDISC Color Palette
CDISC_COLORS = {
    # Core colors
    "dark_1": "#134678",  # Primary navy - headers, navigation, primary actions
    "light_1": "#FFFFFF",  # White - backgrounds, cards
    "dark_2": "#515349",  # Dark gray - secondary text, borders
    "light_2": "#F5F5F5",  # Light gray - page background, disabled states
    # Accent colors
    "accent_1": "#134678",  # Navy (same as dark_1) - primary accent
    "accent_2": "#A1D0CA",  # Teal/mint - success, observation-level STCs
    "accent_3": "#C94543",  # Red/coral - alerts, important actions, derivations
    "accent_4": "#EDAA00",  # Gold/yellow - warnings, inference-level STCs
    "accent_5": "#553278",  # Purple - special highlights, AC templates
    "accent_6": "#40B3E5",  # Light blue - info, phrases
    # Links
    "hyperlink": "#0563C1",  # Standard links
    "followed_link": "#954F72",  # Visited links
}

# Entity type colors
ENTITY_COLORS = {
    "stc_observation": CDISC_COLORS["accent_2"],  # Teal
    "stc_inference": CDISC_COLORS["accent_4"],  # Gold
    "method": CDISC_COLORS["dark_1"],  # Navy
    "template_dc": CDISC_COLORS["accent_3"],  # Coral
    "template_ac": CDISC_COLORS["accent_5"],  # Purple
    "phrase": CDISC_COLORS["accent_6"],  # Light blue
    "instance": CDISC_COLORS["accent_2"],  # Teal
    "mapping": CDISC_COLORS["dark_2"],  # Dark gray
}


def get_cdisc_css() -> str:
    """Get the CDISC custom CSS for Streamlit."""
    return f"""
<style>
/* Global font and background */
.main {{
    background-color: {CDISC_COLORS["light_2"]};
}}

/* Headers */
h1, h2, h3 {{
    color: {CDISC_COLORS["dark_1"]} !important;
    font-weight: 700;
}}

/* Primary buttons */
.stButton > button[kind="primary"] {{
    background-color: {CDISC_COLORS["dark_1"]};
    color: white;
    border: none;
    border-radius: 4px;
}}
.stButton > button[kind="primary"]:hover {{
    background-color: #0d3456;
}}

/* Secondary/action buttons */
.stButton > button[kind="secondary"] {{
    background-color: {CDISC_COLORS["accent_3"]};
    color: white;
}}

/* Tabs */
.stTabs [data-baseweb="tab-list"] {{
    gap: 8px;
}}
.stTabs [data-baseweb="tab"] {{
    color: {CDISC_COLORS["dark_2"]};
    border-bottom: 2px solid transparent;
}}
.stTabs [aria-selected="true"] {{
    color: {CDISC_COLORS["dark_1"]};
    border-bottom: 2px solid {CDISC_COLORS["dark_1"]};
}}

/* Cards/Expanders */
.stExpander {{
    border: 1px solid {CDISC_COLORS["accent_2"]};
    border-radius: 8px;
    margin-bottom: 8px;
}}

/* Sidebar */
[data-testid="stSidebar"] {{
    background-color: {CDISC_COLORS["dark_1"]};
}}
[data-testid="stSidebar"] .stMarkdown,
[data-testid="stSidebar"] .stMarkdown p,
[data-testid="stSidebar"] .stMarkdown span,
[data-testid="stSidebar"] .stMarkdown strong {{
    color: white !important;
}}
[data-testid="stSidebar"] h1,
[data-testid="stSidebar"] h2,
[data-testid="stSidebar"] h3,
[data-testid="stSidebar"] h4 {{
    color: white !important;
}}
[data-testid="stSidebar"] label {{
    color: white !important;
}}
[data-testid="stSidebar"] .stRadio label,
[data-testid="stSidebar"] .stRadio > div > label,
[data-testid="stSidebar"] .stRadio [data-testid="stMarkdownContainer"] {{
    color: white !important;
}}
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {{
    color: white !important;
}}
[data-testid="stSidebar"] .stSelectbox label {{
    color: white !important;
}}
/* Section headers in sidebar */
[data-testid="stSidebar"] .sidebar-section-header {{
    color: {CDISC_COLORS["accent_2"]} !important;
    font-weight: 600;
    font-size: 0.9em;
    margin-top: 12px;
    margin-bottom: 8px;
}}

/* Links */
a {{
    color: {CDISC_COLORS["hyperlink"]};
}}
a:visited {{
    color: {CDISC_COLORS["followed_link"]};
}}

/* Badge styles */
.badge {{
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    font-weight: 500;
    margin-right: 4px;
}}
.badge-stc-obs {{
    background-color: {CDISC_COLORS["accent_2"]};
    color: {CDISC_COLORS["dark_2"]};
}}
.badge-stc-inf {{
    background-color: {CDISC_COLORS["accent_4"]};
    color: {CDISC_COLORS["dark_2"]};
}}
.badge-method {{
    background-color: {CDISC_COLORS["dark_1"]};
    color: white;
}}
.badge-template-dc {{
    background-color: {CDISC_COLORS["accent_3"]};
    color: white;
}}
.badge-template-ac {{
    background-color: {CDISC_COLORS["accent_5"]};
    color: white;
}}
.badge-phrase {{
    background-color: {CDISC_COLORS["accent_6"]};
    color: white;
}}
.badge-instance {{
    background-color: {CDISC_COLORS["accent_2"]};
    color: {CDISC_COLORS["dark_2"]};
}}

/* JSON display */
.json-display {{
    background-color: #2d2d2d;
    border-radius: 4px;
    padding: 8px;
}}

/* Compact sidebar navigation - radio buttons as list */
[data-testid="stSidebar"] .stRadio > div {{
    gap: 0px !important;
}}
[data-testid="stSidebar"] .stRadio > div > label {{
    padding: 4px 8px !important;
    margin: 0 !important;
    font-size: 0.85em !important;
    background: transparent !important;
    cursor: pointer;
}}
[data-testid="stSidebar"] .stRadio > div > label:hover {{
    background-color: rgba(255,255,255,0.1) !important;
    border-radius: 4px;
}}
/* Hide radio circles for cleaner list look */
[data-testid="stSidebar"] .stRadio > div > label > div:first-child {{
    display: none !important;
}}
/* Compact expanders in sidebar */
[data-testid="stSidebar"] .streamlit-expanderHeader {{
    padding: 0.4rem 0.5rem !important;
    font-size: 0.9em !important;
}}
[data-testid="stSidebar"] .streamlit-expanderContent {{
    padding: 0 0.5rem 0.5rem 0.5rem !important;
}}
</style>
"""


def get_badge_html(text: str, badge_type: str) -> str:
    """Get HTML for a colored badge.

    Args:
        text: Badge text
        badge_type: One of: stc-obs, stc-inf, method, template-dc, template-ac, phrase, instance

    Returns:
        HTML string for the badge
    """
    return f'<span class="badge badge-{badge_type}">{text}</span>'


def get_entity_badge(entity_type: str, subtype: str = "") -> str:
    """Get a badge for an entity type.

    Args:
        entity_type: Type of entity (stc, method, template, phrase, instance)
        subtype: Subtype (observation/inference for stc, dc/ac for template)

    Returns:
        HTML badge string
    """
    if entity_type == "stc":
        if subtype == "observation":
            return get_badge_html("Observation", "stc-obs")
        else:
            return get_badge_html("Inference", "stc-inf")
    elif entity_type == "method":
        return get_badge_html("Method", "method")
    elif entity_type == "template":
        if subtype == "dc" or subtype == "derivation":
            return get_badge_html("DC Template", "template-dc")
        else:
            return get_badge_html("AC Template", "template-ac")
    elif entity_type == "phrase":
        return get_badge_html("Phrase", "phrase")
    elif entity_type == "instance":
        return get_badge_html("Instance", "instance")
    return ""
