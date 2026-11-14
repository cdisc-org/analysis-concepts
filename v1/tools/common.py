"""Shared helpers for the candidate v1 migration and validation tools.

Sources are read straight from git refs (nothing is checked out), so the
migration can be re-run from any checkout of the candidate_v1 branch.
"""
from __future__ import annotations

import json
import subprocess
from functools import lru_cache
from pathlib import Path

V1 = Path(__file__).resolve().parents[1]
REPO = V1.parent
SCHEMA_DIR = V1 / "schema"
JSON_SCHEMA_DIR = V1 / "json_schema"
LIB = V1 / "lib"
STUDIES = V1 / "studies"

METHODS_REF = "origin/methods_02"
SMARTPHRASE_REF = "origin/estimands_01"
BASE_REF = "origin/model-schema"


def git_show(ref: str, path: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(REPO), "show", f"{ref}:{path}"], text=True
    )


def git_json(ref: str, path: str):
    return json.loads(git_show(ref, path))


def git_ls(ref: str, path: str) -> list[str]:
    out = subprocess.check_output(
        ["git", "-C", str(REPO), "ls-tree", "-r", "--name-only", ref, path], text=True
    )
    return [p for p in out.split("\n") if p]


def git_rev(ref: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(REPO), "rev-parse", "--short", ref], text=True
    ).strip()


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def clean(d):
    """Drop keys whose value is None, an empty list or an empty dict (recursively)."""
    if isinstance(d, dict):
        out = {}
        for k, v in d.items():
            v = clean(v)
            if v is None or v == [] or v == {}:
                continue
            out[k] = v
        return out
    if isinstance(d, list):
        return [clean(x) for x in d]
    return d


def pascal(name: str) -> str:
    return "".join(part[:1].upper() + part[1:] for part in name.replace("-", "_").split("_") if part)


@lru_cache(maxsize=None)
def json_schema(name: str) -> dict:
    return read_json(JSON_SCHEMA_DIR / f"{name}.schema.json")


def schema_errors(instance, schema_name: str, class_name: str) -> list[str]:
    """Validate an instance against one class of a generated JSON Schema.

    LinkML's JSON Schema generator roots the schema at the tree-root class, so a
    polymorphic instance (a ModelBasedMethod, say) is checked here against the
    definition of its own class instead.
    """
    from jsonschema import validators

    schema = json_schema(schema_name)
    defs = schema.get("$defs", {})
    if class_name not in defs:
        return [f"class {class_name} is not defined in {schema_name}"]
    wrapper = {"$schema": schema.get("$schema"), "$defs": defs, "$ref": f"#/$defs/{class_name}"}
    validator = validators.validator_for(wrapper)(wrapper)
    errors = []
    for e in sorted(validator.iter_errors(instance), key=lambda e: list(e.path)):
        where = "/".join(str(p) for p in e.path) or "(root)"
        errors.append(f"{where}: {e.message[:200]}")
    return errors
