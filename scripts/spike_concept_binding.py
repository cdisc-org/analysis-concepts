"""Concept<->method binding probe for the LinkML spike.

DC: unify a concept's algebraic `identity` with a method's `generic_expression`
to DERIVE the operand->method-input map (instead of hand-authoring it in a
transformation).  AC: check interface satisfaction (a method's output statistics
cover a concept's estimand `constituents`).

Pure-stdlib: a ~40-line recursive-descent parser over the restricted identity
grammar (+ - * / log, scalars, parens, variable tokens). No sympy.
"""
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Node:
    op: Optional[str] = None         # '+','-','*','/','log', or None for a leaf
    args: list = field(default_factory=list)
    name: Optional[str] = None       # variable leaf, e.g. 'value' / 'minuend'
    const: Optional[float] = None     # numeric literal leaf


_TOKEN = re.compile(r"\s*(log|[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|[()+\-*/=])")


def _rhs(expr: str) -> str:
    # accept "result = ..." or "result := ..." and strip method <token> brackets
    expr = expr.replace(":=", "=")
    expr = re.sub(r"[<>]", "", expr)
    return expr.split("=", 1)[1] if "=" in expr else expr


def _tokens(s):
    pos, out = 0, []
    while pos < len(s):
        m = _TOKEN.match(s, pos)
        if not m:
            raise ValueError(f"bad token at {s[pos:]!r}")
        pos = m.end()
        out.append(m.group(1))
    return out


def parse_expr(expr: str) -> Node:
    toks = _tokens(_rhs(expr))
    i = 0

    def peek():
        return toks[i] if i < len(toks) else None

    def eat():
        nonlocal i
        t = toks[i]
        i += 1
        return t

    def atom():
        t = eat()
        if t == "(":
            n = addsub()
            assert eat() == ")"
            return n
        if t == "log":
            assert eat() == "("
            n = addsub()
            assert eat() == ")"
            return Node(op="log", args=[n])
        if re.fullmatch(r"\d+\.?\d*", t):
            return Node(const=float(t))
        return Node(name=t)

    def muldiv():
        n = atom()
        while peek() in ("*", "/"):
            n = Node(op=eat(), args=[n, atom()])
        return n

    def addsub():
        n = muldiv()
        while peek() in ("+", "-"):
            n = Node(op=eat(), args=[n, muldiv()])
        return n

    return addsub()


def _unify(a: Node, b: Node, mapping: dict):
    if a.const is not None or b.const is not None:
        if a.const != b.const:
            raise ValueError("constant mismatch")
        return
    if a.name is not None and b.name is not None:
        if a.name in mapping and mapping[a.name] != b.name:
            raise ValueError(f"conflicting bind {a.name}")
        mapping[a.name] = b.name
        return
    if a.op != b.op or len(a.args) != len(b.args):
        raise ValueError(f"shape mismatch {a.op} vs {b.op}")
    for x, y in zip(a.args, b.args):
        _unify(x, y, mapping)


def unify(concept_identity: str, method_generic_expression: str) -> dict:
    """Return {concept_operand_name: method_input_name}."""
    mapping = {}
    _unify(parse_expr(concept_identity), parse_expr(method_generic_expression), mapping)
    return mapping


# ---- AC interface satisfaction --------------------------------------------
def method_output_statistics(method: dict, templates: dict, stat_sets: dict) -> set:
    """Term-side statistics a method actually produces.

    An output's `output_type` -> a template whose `statistics_set` entries are
    statistic-SET ids; each set expands (via stat_sets) to its member terms.
    """
    provided = set()
    for out in method.get("outputs", []):
        tpl = templates.get(out.get("output_type"), {})
        for set_id in tpl.get("statistics_set", []):
            provided |= set(stat_sets.get(set_id, {}).get("statistics", []))
        provided |= set(tpl.get("additional_statistics", []))
    return provided


# FINDING (open question #5): AC binding needs a concept-side -> term-side map.
# Estimand constituents are concept names (Estimate, ConfidenceInterval, ...);
# statistic-set members are term ids (estimate, CI_lower/CI_upper, df, ...).
# Note ConfidenceInterval is multi-leaf -> two terms.
_CONCEPT_TO_TERMS = {
    "Estimate": {"estimate"},
    "SE": {"SE"},
    "DF": {"df"},
    "ConfidenceInterval": {"CI_lower", "CI_upper"},
}


def normalize_constituents(constituents) -> set:
    """Map estimand constituent names to the term ids a method emits."""
    out = set()
    for c in constituents:
        out |= _CONCEPT_TO_TERMS.get(c, {c})
    return out


def satisfies(needed: set, provided: set) -> bool:
    return set(needed).issubset(set(provided))
