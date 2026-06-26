"""Slice coverage helpers for the concept-model LinkML spike.

Coverage is DERIVED from the live production concept libraries' category lists,
never hardcoded. A category is a key under `categories` whose value is a dict
(documentation keys such as `note` map to strings and are excluded).
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]


def categories(model_path):
    """Real category names declared in a production concept library."""
    data = json.loads(pathlib.Path(model_path).read_text())
    cats = data.get("categories", {})
    return {k for k, v in cats.items() if isinstance(v, dict)}


def covered_categories(libalt_dir):
    """Category names that the sandbox library actually carries a concept for."""
    out = set()
    for f in pathlib.Path(libalt_dir).glob("*.json"):
        for c in json.loads(f.read_text()).get("concepts", []):
            if c.get("category"):
                out.add(c["category"])
    return out
