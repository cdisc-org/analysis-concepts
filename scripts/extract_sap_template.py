#!/usr/bin/env python3
"""Extract structure from a TransCelerate Core TEE SAP .docx into a JSON tree.

Usage:
  python scripts/extract_sap_template.py <input.docx> <output.json>

The output JSON drives the eSAP renderer in ac-dc-app/js/views/esap-builder.js,
replacing the hardcoded 14-section structure with the actual template.
"""

from __future__ import annotations

import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

HEADING_STYLE_TO_LEVEL = {
    "heading 1": 1,
    "heading 2": 2,
    "heading 3": 3,
    "heading 4": 4,
    "heading 5": 5,
    "heading 6": 6,
}

WIZARD_START_RE = re.compile(r"<\s*Start of (?:example|suggested) text\s*>", re.I)
WIZARD_END_RE = re.compile(r"<\s*End of (?:example|suggested) text\s*>", re.I)
BRACKET_RE = re.compile(r"\[([^\[\]/]+(?:/[^\[\]/]+)+)\]")
TITLE_NUMBER_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)\.?\s*(.*)$")


def style_id_to_name(doc) -> dict[str, str]:
    out: dict[str, str] = {}
    for st in doc.styles.element.iter(qn("w:style")):
        sid = st.get(qn("w:styleId"))
        nm_el = st.find(qn("w:name"))
        if sid and nm_el is not None:
            out[sid] = nm_el.get(qn("w:val")) or sid
    return out


def style_of(p_el) -> str | None:
    pPr = p_el.find(qn("w:pPr"))
    if pPr is None:
        return None
    pStyle = pPr.find(qn("w:pStyle"))
    if pStyle is None:
        return None
    return pStyle.get(qn("w:val"))


def text_of(p_el) -> str:
    return "".join(t.text or "" for t in p_el.iter(qn("w:t"))).strip()


def parse_alternatives(title: str) -> list[dict]:
    """Find all [A/B] or [A/B/C] tokens in a section title and return them."""
    out: list[dict] = []
    for m in BRACKET_RE.finditer(title):
        token = m.group(0)
        options = [opt.strip() for opt in m.group(1).split("/") if opt.strip()]
        out.append({"token": token, "options": options})
    return out


def make_node(level: int, number: str, title: str) -> dict:
    return OrderedDict(
        id=number,
        number=number,
        level=level,
        title=title,
        alternatives=parse_alternatives(title),
        wizardPrompts=[],  # blocks of suggested/example text
        placeholders=[],   # short "Enter X" / "Click or tap..." prompts
        children=[],
    )


def next_section_number(parent_number: str | None, siblings: list[dict], target_level: int) -> str:
    """Compute next section number under given parent at target_level."""
    n = len(siblings) + 1
    if parent_number is None:
        return str(n)
    return f"{parent_number}.{n}"


def extract(docx_path: Path) -> dict:
    doc = Document(str(docx_path))
    body = doc.element.body
    sid2name = style_id_to_name(doc)

    root = OrderedDict(
        templateId="sap_core_tee_v005",
        title="TransCelerate Core TEE SAP Template v005",
        source="https://www.transceleratebiopharmainc.com/assets/clinical-content-reuse-solutions/",
        description=(
            "Extracted from SAP_CoreTEE_v005.docx via scripts/extract_sap_template.py. "
            "Drives the eSAP renderer; CPT-style wizard prose is preserved for demo callouts "
            "while USDM narrative + AC/DC metadata fills the actual section bodies."
        ),
        sections=[],
    )

    # heading_stack: list of (level, node) tracking the current heading path
    heading_stack: list[tuple[int, dict]] = []
    in_wizard = False
    wizard_kind = "suggested"  # 'suggested' or 'example'
    wizard_buf: list[str] = []

    def current_section() -> dict | None:
        return heading_stack[-1][1] if heading_stack else None

    def push_heading(level: int, title: str) -> dict:
        # pop deeper or equal levels off the stack
        while heading_stack and heading_stack[-1][0] >= level:
            heading_stack.pop()

        # parent siblings list and parent number
        if heading_stack:
            parent_node = heading_stack[-1][1]
            parent_siblings = parent_node["children"]
            parent_number = parent_node["number"]
        else:
            parent_siblings = root["sections"]
            parent_number = None

        # only auto-number if we're in the expected hierarchy
        # all top-level sections in this template are level 1
        # all sub-sections are level 2 (parent must be level 1), etc.
        number = next_section_number(parent_number, parent_siblings, level)
        node = make_node(level, number, title)
        parent_siblings.append(node)
        heading_stack.append((level, node))
        return node

    for p_el in body.iter(qn("w:p")):
        sid = style_of(p_el)
        sname = (sid2name.get(sid) if sid else None) or (sid or "")
        sname_norm = sname.lower()
        text = text_of(p_el)
        if not text:
            continue

        # Skip the table-of-contents region
        if sname_norm.startswith("toc "):
            continue

        # Wizard markers — bound the prompt block
        if WIZARD_START_RE.search(text):
            in_wizard = True
            wizard_kind = "example" if "example" in text.lower() else "suggested"
            wizard_buf = []
            continue
        if WIZARD_END_RE.search(text):
            if in_wizard and wizard_buf:
                sec = current_section()
                if sec is not None:
                    sec["wizardPrompts"].append({
                        "kind": wizard_kind,
                        "lines": wizard_buf[:],
                    })
            in_wizard = False
            wizard_buf = []
            continue

        # Inside a wizard block — collect all lines verbatim
        if in_wizard:
            wizard_buf.append(text)
            continue

        # Numbered heading (the lowercase 'heading N' styles)
        if sname_norm in HEADING_STYLE_TO_LEVEL:
            level = HEADING_STYLE_TO_LEVEL[sname_norm]
            push_heading(level, text)
            continue

        # Other unnumbered headings — keep as in-section subheadings
        # (skip front-matter 'Title Page', 'Table of Contents', 'Version History',
        #  'List of Abbreviations [...]' before any numbered section starts)
        if "heading" in sname_norm and "no toc" in sname_norm:
            sec = current_section()
            if sec is not None:
                sec["placeholders"].append({"kind": "subheading", "text": text})
            continue

        # Regular body paragraph — placeholder text the user will replace
        sec = current_section()
        if sec is not None:
            kind = "placeholder" if (
                text.startswith("Enter ")
                or text.startswith("Click or tap")
                or text.startswith("- ")
                or text.startswith("[")
            ) else "body"
            sec["placeholders"].append({"kind": kind, "text": text})
        # If there's no current section yet, we're in front matter — skip silently

    return root


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    inp = Path(argv[1])
    outp = Path(argv[2])
    if not inp.is_file():
        print(f"Input not found: {inp}", file=sys.stderr)
        return 1
    tree = extract(inp)
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(tree, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    n_top = len(tree["sections"])

    def count(nodes):
        n = 0
        for s in nodes:
            n += 1 + count(s["children"])
        return n
    print(f"Wrote {outp} — {n_top} top-level sections, {count(tree['sections'])} total nodes.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
