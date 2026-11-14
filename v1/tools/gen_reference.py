"""Generate v1/docs/model-reference.md from the LinkML schemas.

One section per schema, one table per class, so the reference cannot drift
from the model. Run after changing any schema:

  python v1/tools/gen_reference.py
"""
from __future__ import annotations

import json

from linkml_runtime.utils.schemaview import SchemaView

from common import SCHEMA_DIR, V1

LAYERS = [
    ("SmartPhrase layer", ["ac_smartphrase"]),
    ("Method layer", ["ac_method", "ac_statistic", "ac_statistic_set", "ac_output_class"]),
    ("Transformation layer", ["ac_transformation"]),
    ("Concept layer", ["ac_concept"]),
    ("Implementation layer", ["ac_binding", "ac_implementation"]),
    ("Study side (Transformation and SmartPhrase layers as used in a study)", ["ac_study"]),
    ("Shared", ["ac_common"]),
]


def one_line(text: str | None) -> str:
    return " ".join((text or "").split()).replace("|", "\\|")


def main():
    importmap = {k: str(SCHEMA_DIR / v) for k, v in json.load(open(SCHEMA_DIR / "import_map.json")).items()}
    out = [
        "# Model reference",
        "",
        "Generated from the LinkML schemas in `v1/schema/` by `v1/tools/gen_reference.py`. Do not edit by hand.",
        "",
        "Each table lists the properties a class declares or refines itself; a class also has the properties of",
        "the class it specialises. `*` marks a required property and `[]` a list.",
        "",
    ]
    for layer, names in LAYERS:
        out += [f"## {layer}", ""]
        for name in names:
            sv = SchemaView(str(SCHEMA_DIR / f"{name}.yaml"), importmap=importmap)
            schema = sv.schema
            out += [f"### `{name}` — {schema.title or name}", "", one_line(schema.description), ""]
            own_classes = [c for c in sv.all_classes(imports=False).values()]
            for cls in own_classes:
                if cls.name == "Any":
                    continue
                head = f"#### {cls.name}"
                if cls.is_a:
                    head += f" (a kind of {cls.is_a})"
                if cls.abstract:
                    head += " — abstract"
                out += [head, "", one_line(cls.description), ""]
                rows = []
                for slot_name in sv.class_slots(cls.name, direct=True):
                    slot = sv.induced_slot(slot_name, cls.name)
                    rng = slot.range or schema.default_range or "string"
                    flags = ("*" if slot.required or slot.identifier else "") + ("[]" if slot.multivalued else "")
                    rows.append(f"| `{slot.name}`{flags} | {rng} | {one_line(slot.description)} |")
                if rows:
                    out += ["| Property | Type | Meaning |", "| --- | --- | --- |", *rows, ""]
            enums = sv.all_enums(imports=False)
            if enums:
                out += ["#### Enumerations", "", "| Enumeration | Values |", "| --- | --- |"]
                for e in enums.values():
                    out.append(f"| {e.name} | {', '.join(e.permissible_values)} |")
                out.append("")
    (V1 / "docs" / "model-reference.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print("wrote docs/model-reference.md")


if __name__ == "__main__":
    main()
