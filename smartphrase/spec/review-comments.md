# Spec Review: `sap-tags.md` and `smartphrase-spec.md`

> Reviewer: Claude Code (pre-human-expert review)  
> Date: 2026-06-09  
> Specs reviewed: `sap-tags.md` (Draft v0.1), `smartphrase-spec.md` (Draft v0.1)

---

## Summary

Both specs are coherent and well-structured for a v0.1 draft. The two-namespace model (structural `sap:` layer + additive `smartphrase:` layer) is clean in principle. The issues below range from hard blockers (missing children table entry, unresolvable cross-spec inconsistencies) to questions that experts will certainly raise (namespace governance, validation strategy, fallback behaviour). All items include a recommendation.

---

## 1. Cross-cutting architectural issues

### 1.1 No companion XML Schema (XSD or RELAX NG)

Neither spec references a companion schema. Without one:
- Document validity is unenforceable by standard XML tooling.
- The several "one-of-required" and "mutually exclusive" constraints described in prose cannot be machine-validated.
- Authoring tools have no normative source to validate against.

**Recommendation:** Commit to producing at least a RELAX NG Compact schema alongside v0.2. Note it as a deliverable in the spec status line. In the interim, add a section "Validation" that lists the constraints that a schema will eventually enforce, so reviewers know what is intended to be normative.

---

### 1.2 Namespace URI governance

Both namespaces use the `urn:cdisc:ac-dc:…` prefix:

```
urn:cdisc:ac-dc:sap:1.0
urn:cdisc:ac-dc:smartphrase:1.0
```

This implies CDISC ownership. URN namespaces under `urn:cdisc:` are registered by CDISC; using them for a project that is not yet a formal CDISC standard may cause naming conflicts or governance objections.

**Recommendation:** Use a resolvable project-owned URI while the spec is in draft (e.g. `https://ac-dc.cdisc.org/ns/sap/1.0`). If the project is not yet CDISC-official, use a placeholder URI that clearly signals provenance (e.g. `urn:ac-dc:sap:1.0`). Either way, document the governance process for URI allocation.

---

### 1.3 DOCTYPE mismatch

The document root in `sap-tags.md` uses:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
```

`<!DOCTYPE html>` is the HTML5 doctype. Combined with `<?xml version="1.0"?>` and namespace declarations, the document is being served as XHTML5 (polyglot). This creates an ambiguity:

- Served as `text/html`: namespace declarations are ignored by HTML parsers; `sap:` and `smartphrase:` elements are treated as HTML custom elements and the colon in the element name will cause parse errors in all current HTML parsers.
- Served as `application/xhtml+xml`: namespaces work correctly, but `<!DOCTYPE html>` provides no DTD-level validation.

**Recommendation:** Add a section "Serving and MIME type" to the spec. Define `application/xhtml+xml` as the required content type. Clarify that the `<!DOCTYPE html>` is present solely for XHTML5 compatibility (no DTD validation) and that schema validation is handled separately (see §1.1).

---

### 1.4 CSS fallback is the only rendering contract

The spec states "including the companion stylesheet (`sap.css`) promotes block-level `sap:` elements to `display: block` so the document renders correctly without any tooling." There is no other rendering specification.

Issues:
- The CSS path is hard-coded as a relative path `../demo/sap.css`, which breaks when documents are placed in directories other than the anticipated structure.
- Mathematical formulae (common in SAPs — MMRM models, ANCOVA specifications) are not addressed. MathML or `<code>` conventions should be noted.
- Print layout (regulatory submissions are often printed) is not addressed.
- Accessibility (ARIA roles, landmark regions) is not addressed.

**Recommendation:** Move the stylesheet reference out of the document root example and document it as a convention, not a hard dependency. Specify a canonical CSS class scheme so the stylesheet location can vary. Add a note on MathML, formula rendering, and print CSS as future work items.

---

### 1.5 No versioning or backward-compatibility strategy

Both specs are v0.1 but there is no statement about:
- What constitutes a breaking vs non-breaking change.
- How existing documents will be validated against future schema versions.
- Whether the `1.0` in the namespace URI will increment with breaking changes.

**Recommendation:** Add a brief "Versioning policy" section. At minimum, state the intent (e.g. namespace URI changes on breaking schema revision; additive attribute additions are non-breaking). This is a question expert reviewers will certainly ask.

---

## 2. `sap-tags.md` — specific issues

### 2.1 `sap:document` has no metadata attributes

`sap:document` is the root analytical content element but carries no attributes (no `study-id`, `protocol-version`, `sap-version`, `date`, `sponsor`). Structural metadata that the rendering model or authoring tools would need to identify and route the document is absent.

**Recommendation:** Define at minimum the following attributes: `study-id` (required), `version` (required), `status` (e.g. `draft`, `final`). Cross-reference with any external document management metadata to avoid duplication.

---

### 2.2 `sap:classification` child used but not defined

In the Section 5 example (`sap:secondary-analyses`), `sap:endpoint-analysis` contains a `sap:classification` child:

```xml
<sap:endpoint-analysis type="secondary">
  <sap:classification>
    <sap:choice options="key,confirmatory" selected="key">key</sap:choice>
  </sap:classification>
  ...
</sap:endpoint-analysis>
```

`sap:classification` does not appear in the `sap:endpoint-analysis` children table (§ "Analytical section tags — Sections 4–6") and is not listed in the Complete Tag Index.

**Recommendation:** Either add `sap:classification` to the children table with its cardinality and description, or remove it from the example. If it is intentionally omitted for primary analyses (only relevant for secondary), the children table should note this conditionality.

---

### 2.3 `for-objective` references undefined IDs

`sap:estimand` has a `for-objective` attribute that "links to the objective this estimand addresses". However, `sap:objectives-table` wraps a plain HTML `<table>` with no mechanism to assign IDs to individual objective rows.

**Recommendation:** Either (a) define an `sap:objective` child element within `sap:objectives-table` that carries an `id` attribute, making the linkage resolvable; or (b) document that objective IDs are assigned by convention (e.g. `obj-1`, `obj-2`) with a note that this is a validation concern for tooling.

---

### 2.4 `sap:sensitivity-analysis` and `sap:supplementary-analysis` attributes not defined

These elements appear in the children table of `sap:endpoint-analysis` and in examples, but neither has its own attribute/content model table. The same omission applies to `sap:interim-analysis` (Section 9) and `sap:subgroup-analysis` (Section 8.2) — the examples show `id` and `label` attributes but these are not formally defined.

**Recommendation:** Add a brief attribute table for each of these four leaf-level elements, even if the only attributes are `id` and `label`. Consistency with `sap:analysis-set` (which has a complete table) is expected.

---

### 2.5 `sap:other-analyses` optionality is ambiguous

In the tag index, `sap:other-analyses` (Section 8) is listed as "Optional — yes". But the example in that section does not wrap it in `sap:optional`:

```xml
<sap:other-analyses>
  <h1>8. Other Analyses</h1>
  <sap:optional name="other-variables">...</sap:optional>
  <sap:optional name="subgroup-analyses">...</sap:optional>
</sap:other-analyses>
```

If the container itself is optional, a containing `sap:optional` wrapper should be shown (as is done for `sap:other-objective-analyses` and `sap:interim-analyses`). If only the sub-sections are optional but the container is mandatory, the tag index should not mark the container as optional.

**Recommendation:** Add an `sap:optional` wrapper around the `sap:other-analyses` example to match the tag index, or correct the tag index. Clarify the rule: is Section 8 as a whole optional, or is it always present but always empty of mandatory content?

---

### 2.6 `sap:choice` encodes options as a comma-separated attribute string

```xml
<sap:choice options="key,confirmatory" selected="key">key</sap:choice>
```

This pattern has several problems:
- Option values cannot contain commas.
- Whitespace handling around commas is unspecified.
- XML validators cannot enumerate valid `selected` values without parsing the `options` attribute.
- The element content duplicates `selected` — this redundancy is unexplained and creates a consistency hazard.

**Recommendation:** Replace the comma-separated string with child elements:

```xml
<sap:choice selected="key">
  <sap:option value="key">key</sap:option>
  <sap:option value="confirmatory">confirmatory</sap:option>
</sap:choice>
```

This is XSD-validatable, eliminates duplication, and allows option labels to differ from machine values.

---

### 2.7 Section heading numbering jumps from `h2` to `h4`

The `sap:endpoint-analysis` example uses `h4` headings:

```xml
<h4>4.1.1 Definition of Endpoint(s)</h4>
```

But the containing section uses `h1` (`sap:primary-analyses`) or `h2` for sub-sections. There is no `h3` in the illustrated hierarchy. This means heading levels are not semantically consistent with their depth, which breaks accessibility (screen readers, document outlines) and may confuse the CSS cascade.

**Recommendation:** Define the intended heading level for each element in the spec (a single table: element → heading level). Ensure the depth hierarchy is consistent: document → section → sub-section → endpoint group → endpoint sub-section should map to `h1` → `h2` → `h3` → `h4` without gaps.

---

### 2.8 `sap:choice` used to control grammatical number (Section 9)

```xml
<sap:choice options="analysis,analyses" selected="analyses">Analyses</sap:choice>
```

This usage selects between singular and plural for the section heading. It is unlikely that this represents meaningful machine-readable data — the correct plural/singular form should be derivable from the count of `sap:interim-analysis` elements.

**Recommendation:** Remove this `sap:choice` instance and instead specify that the heading text is generated by tooling based on the count of child elements. If retaining `sap:choice` for heading text is a deliberate design decision, document the rationale clearly.

---

### 2.9 `sap:repeat` example is misleading

The spec states: "Its single child element type is the repeating unit; multiple instances of that child appear in a completed document." The example then shows two `sap:analysis-set` children inside one `sap:repeat`, which is correct for a completed document but contradicts the phrase "single child element type" (which could be read as one child only). The Section 5 nesting (two sibling `sap:repeat` elements inside `sap:secondary-objective`) reinforces the potential for confusion.

**Recommendation:** Revise the description to: "A `sap:repeat` element contains one or more instances of its repeating unit element type. In a template, it typically contains one placeholder instance; in a completed document, it contains as many instances as the study requires." Also define the types of `min` and `max` attributes explicitly (non-negative integer; `max` can be the string `"unbounded"` or omitted).

---

### 2.10 Content model for prose-only section elements is unspecified

`sap:study-design`, `sap:multiplicity`, `sap:intercurrent-events`, `sap:missing-data`, and `sap:decision-criteria` are all described as section containers but have no content model defined — no example showing valid children, no statement of whether `sap:p`, `sap:table`, `sap:repeat`, `sap:optional`, or plain XHTML block elements are permitted.

**Recommendation:** Add at least a one-line content model statement for each (e.g. "Mixed content: `sap:p`, `sap:table`, `sap:optional`, `sap:repeat`, and standard XHTML block elements").

---

### 2.11 `sap:type` attribute value `"tertiary"` appears on `sap:endpoint-analysis` but not on `sap:other-objective-analyses`

`sap:endpoint-analysis` `type` allows `tertiary`. The Section 6 container is `sap:other-objective-analyses`, whose `sap:choice` options are `"tertiary,exploratory,other"`. If a tertiary analysis is the same as a Section 6 "tertiary" objective, this is consistent — but it is not stated explicitly. If `type="tertiary"` on `sap:endpoint-analysis` can appear inside `sap:primary-analyses` or `sap:secondary-analyses`, that would be a content model error.

**Recommendation:** Add a note stating which `type` values are valid in which containing section. A simple matrix (rows: containing section; columns: allowed `type` values) would suffice.

---

### 2.12 Sections 10–13 classified as plain XHTML with insufficient rationale

Section 11 (Sample Size) routinely contains calculations, assumptions, power tables, and references to analysis sets — all of which are analytically relevant and linkable to the AC/DC model. The exclusion rationale ("no AC/DC-linkable analytical content") is therefore debatable for Section 11.

**Recommendation:** Either (a) provide an explicit rationale for excluding Section 11 from `sap:` markup, or (b) promote Section 11 to a defined `sap:sample-size` element. If the exclusion is a scope decision for v0.1, state "out of scope for this version" rather than implying there is nothing to link.

---

## 3. `smartphrase-spec.md` — specific issues

### 3.1 `smartphrase:analysis` omitted from `sap:endpoint-analysis` children table

`smartphrase:analysis` is described as appearing inside `sap:endpoint-analysis` (and illustrated in the worked example), but it does not appear in the children table for `sap:endpoint-analysis` in `sap-tags.md`. The two specs are inconsistent on this point.

**Recommendation:** Add `smartphrase:analysis` to the `sap:endpoint-analysis` children table in `sap-tags.md` with cardinality `0–1` and a description such as "Declares the AC/DC instance this analysis section corresponds to (see `smartphrase-spec.md`)".

---

### 3.2 `smartphrase:analysis` void-element constraint is unenforceable as stated

The spec describes `smartphrase:analysis` as a "void element (no content)". In HTML, void elements (like `<br/>`, `<img/>`) are a parser-defined set. In XML namespaces there is no such intrinsic concept — "void" is a content model constraint that must be enforced by schema (empty content model) or tooling.

**Recommendation:** Replace "void element" with "empty element (no child content permitted)" and add a note that the schema will enforce an empty content model for this element. Use self-closing syntax in all examples (`<smartphrase:analysis … />`), which already appears to be the case.

---

### 3.3 `ac-id` / `dc-id` "one of required" is not XML-expressible as written

The attribute table lists both `ac-id` and `dc-id` with the description "one of `ac-id` / `dc-id` required". This is a co-occurrence constraint. Standard XSD 1.0 cannot express "exactly one of these two attributes is required"; XSD 1.1 can (via `assert`), as can RELAX NG (via `interleave` + `choice`). Without a schema, this constraint is informative only.

**Recommendation:** (a) Promote to a named validation rule in the spec (e.g. "Rule SP-01: A `smartphrase:analysis` element MUST carry exactly one of `ac-id` or `dc-id`"). (b) In the companion schema, use XSD 1.1 assertions or RELAX NG to enforce it.

---

### 3.4 Conflict between `value` and `concept-id` on `smartphrase:binding`

The spec says "at least one of `value` or `concept-id` must be present" but does not define what happens when both are present. The resolution algorithm (step 3) says "use `value` for a literal string, or look up `concept-id`" — the `or` is ambiguous when both are supplied.

**Recommendation:** Add an explicit precedence rule (e.g. "If both `value` and `concept-id` are present, `concept-id` takes precedence and the `value` attribute is used as a fallback if concept resolution fails"). Document the fallback behaviour explicitly.

---

### 3.5 Fallback behaviour on resolution failure not defined

No part of the resolution algorithm defines what a renderer should do when:
- A `sp-oid` is not found in the transformation library.
- A `concept-id` cannot be resolved to a label.
- An `element` sub-path on `smartphrase:ref` does not exist in the referenced model instance.

Without this, different implementations will diverge (silent empty string, error, original attribute value displayed, placeholder text).

**Recommendation:** Add a section "Error handling and fallbacks" specifying behaviour for each failure case. A reasonable default: render the raw attribute value wrapped in a visually distinct error marker, and log a structured warning.

---

### 3.6 `smartphrase:type` vs `sap:endpoint-analysis type` — overlapping but divergent enumerations

`smartphrase:analysis` has a `type` attribute with values: `primary`, `secondary`, `sensitivity`, `supplementary`, `safety`, `subgroup`, `interim`, `derivation`.

`sap:endpoint-analysis` also has a `type` attribute with values: `primary`, `secondary`, `supportive-secondary`, `exploratory`, `tertiary`, `other`.

The two sets overlap but neither is a subset of the other. `supportive-secondary`, `exploratory`, `tertiary`, `other` appear in the `sap:` set but not `smartphrase:`. `sensitivity`, `supplementary`, `safety`, `subgroup`, `interim`, `derivation` appear in the `smartphrase:` set but not `sap:`. When a `smartphrase:analysis` is a child of `sap:endpoint-analysis`, an authoring tool must manage two `type` attributes that may not map to each other clearly.

**Recommendation:** Document the mapping between the two `type` enumerations explicitly (a table showing which `sap:endpoint-analysis type` corresponds to which `smartphrase:analysis type`). Alternatively, consider removing `type` from `smartphrase:analysis` and having the renderer derive it from the containing `sap:` element.

---

### 3.7 `render` attribute on `smartphrase:ref` does not include `long_with_short`

`smartphrase:binding` supports `render` values: `short`, `long`, `long_with_short`.  
`smartphrase:ref` supports only: `short`, `long`.

The asymmetry is unexplained. `long_with_short` is the most verbose and human-readable form, and is often useful when a term is first introduced in flowing prose.

**Recommendation:** Either add `long_with_short` to `smartphrase:ref` `render` values, or document explicitly why it is excluded (e.g. "ref resolution does not produce abbreviation metadata").

---

### 3.8 `smartphrase:ref element` sub-path enumeration is open-ended and undocumented

The `element` attribute on `smartphrase:ref` accepts a "sub-element path" (e.g. `parameter`, `population`, `formula`, `label`). The complete set of valid paths is not defined anywhere in the spec. Different `type` values will have different valid sub-paths.

**Recommendation:** Add a table per `smartphrase:ref type` value listing valid `element` paths and their descriptions. For the `analysis` type: `timepoint`, `population`, `method`, `label`; for `method`: `formula`, `label`; etc. This is critical information for implementors of the renderer.

---

### 3.9 `new:` prefix convention for `ac-id` is undocumented

The SAP → Model section states: "If absent or prefixed with `new:`, the tool creates a new instance." The `new:` prefix convention is stated but not defined:

- Is the syntax `new:S_AC_001` (prefix + proposed ID) or `new:` alone?
- If a proposed ID is included, who validates uniqueness?
- If the tool assigns the ID, what naming convention is used?
- What is the behaviour if `new:` is present but the instance already exists?

**Recommendation:** Formally define the `new:` prefix convention in its own sub-section, including syntax, uniqueness rules, and the expected behaviour when an instance is later assigned a permanent ID (i.e. the `new:` prefix is removed and the `ac-id` is updated).

---

### 3.10 Transformation library referenced by a specific filename/version

The spec references `ACDC_Transformation_Library_v06.json` by filename. This creates a brittle coupling:
- The spec will become stale every time the library version changes.
- It is unclear whether the spec is normative against v06 specifically, or against "the current version of the library".

**Recommendation:** Remove the specific filename. Reference the library by its logical name ("the AC/DC Transformation Library") and define the pairing between spec version and minimum library version in a separate compatibility matrix or in the spec's status block.

---

### 3.11 `roles` attribute validation semantics are not defined

`smartphrase:sentence` carries a `roles` attribute ("space-separated list of phrase roles included in this sentence"). The spec does not define:
- Whether `roles` is normative (a renderer MUST verify completeness) or informative (for tooling hints only).
- What happens if a role listed in `roles` has no corresponding `smartphrase:phrase` child.
- What happens if a `smartphrase:phrase` child has a `role` not listed in `roles`.

**Recommendation:** Promote to a named validation rule (e.g. "Rule SP-02: Every role listed in `smartphrase:sentence roles` MUST have at least one child `smartphrase:phrase` with a matching `role` attribute"). State whether this is a schema-level constraint, a renderer warning, or an authoring-tool error.

---

### 3.12 Worked example omits `grouping` role for a comparative analysis

The worked example builds a sentence for an ANCOVA comparing treatment groups but the `roles` attribute omits `grouping` (`roles="endpoint timepoint population method covariate"`). A treatment comparison without an explicit grouping statement is analytically incomplete for the primary endpoint of a confirmatory trial.

**Recommendation:** Add a `grouping` phrase to the worked example (e.g. `<smartphrase:phrase sp-oid="SP_GROUPING" role="grouping">`) and include `grouping` in the `roles` attribute. This will also demonstrate the full sentence structure and show that `grouping` is not always the same as `population`.

---

## 4. Minor and editorial issues

| # | Location | Issue | Recommendation |
|---|----------|-------|----------------|
| M1 | `sap-tags.md` §Rendering model | "stripping all `smartphrase:*` elements leaves a valid, human-readable SAP document" — this is only true if `sap:` elements also render correctly, which depends on the CSS being loaded. | Add "when the companion stylesheet is applied". |
| M2 | `sap-tags.md` §`sap:p` | No example with `smartphrase:sentence` or `smartphrase:ref` shown for `sap:p` in the content elements section — the cross-namespace usage is only illustrated in much later sections. | Add a cross-reference to the smartphrase spec or a brief inline example in `sap:p`. |
| M3 | `sap-tags.md` §Sections 4–6 | The statement "the same `sap:endpoint-analysis` element is reused at all three levels" is true, but `sap:primary-analyses` requires `min="1"` while the others are less constrained. The reuse statement may mislead reviewers into thinking the element is fully generic across all contexts. | Qualify: "the same element is used in all three sections; context-specific constraints on `type` and `sap:classification` are described per section". |
| M4 | `sap-tags.md` §Complete tag index | `sap:classification` is missing (see §2.2 above). `sap:sentence` from `smartphrase:` is of course a different namespace, but `sap:objectives-table` could be confused with a structural control element — clarify its role is purely a content wrapper. | Fix the tag index per §2.2. Add a note to `sap:objectives-table` clarifying it is a semantic wrapper for the HTML table, not a control element. |
| M5 | `smartphrase-spec.md` §Tag hierarchy | The hierarchy diagram shows `smartphrase:binding` as a child of `smartphrase:phrase`, but does not show `smartphrase:analysis` or `smartphrase:ref` relative to `sap:` elements. | Extend the diagram to show the cross-namespace containment relationships. |
| M6 | `smartphrase-spec.md` §`smartphrase:sentence` | Described as rendering "as an inline span" — this is a CSS/rendering detail that belongs in the rendering spec, not the tag spec, and is inconsistent with the principle that the `sap.css` file drives display properties. | Remove "renders as an inline span" and instead say "the element contributes its resolved text inline within its parent `sap:p`". |
| M7 | Both specs | No examples show XML special characters (`&amp;`, `&lt;`) in attribute values or text content. Endpoint names with `<` (e.g. `LS mean difference (95% CI)`) or `&` will break naive implementations. | Add a brief note on character encoding requirements and show one example using `&amp;` in a `value` attribute. |
| M8 | Both specs | The `xml:lang="en"` on the root element implies the entire document is English. Many sponsors produce SAPs in multiple languages. | Add a note acknowledging this limitation and stating whether multi-language support is a future scope item. |

---

## 5. Questions for the authors

The following items require clarification before the spec can be considered complete. Raising them now will allow the team to arrive at the expert review with consistent answers.

1. **Schema deliverable**: Is a formal XSD or RELAX NG schema within scope for v0.1? If not, what is the target version?

2. **Serving context**: Will SAP XHTML documents be served by a web server (requiring correct MIME type), or used only as file-system documents opened in a browser? The answer affects the DOCTYPE and namespace-handling recommendations above.

3. **`sap:classification` scope**: Is `sap:classification` intentionally absent from the `sap:endpoint-analysis` children table, or is this an oversight? (§2.2)

4. **Section 11 scope**: Is the exclusion of Section 11 (Sample Size) from `sap:` markup a deliberate scope decision for v0.1, or an oversight? (§2.12)

5. **Transformation library versioning**: Should the spec be pinned to a specific library version, or is it intended to be library-version-agnostic? (§3.10)

6. **`new:` prefix**: Is the `new:` prefix convention already defined in a separate design document, or does it need to be specified here? (§3.9)
