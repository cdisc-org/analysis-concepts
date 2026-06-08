# Smartphrase Specification (`smartphrase:` namespace)

> Status: Draft v0.1 — part of issue #9

This document defines the `smartphrase:` XML namespace, which provides bidirectional linkage between SAP document text and all layers of the AC/DC model.

---

## Namespace

```
xmlns:smartphrase="urn:cdisc:ac-dc:smartphrase:1.0"
```

---

## Relationship to the AC/DC model

The smartphrase layer is grounded in the SmartPhrase definitions in the AC/DC Transformation Library (`ACDC_Transformation_Library_v06.json`). That library defines 22 smartphrase templates across 8 roles:

| Role | Description | Example phrase template |
|------|-------------|------------------------|
| `endpoint` | The type of endpoint being analysed | `"change from baseline in {parameter}"` |
| `parameter` | The parameter qualifier | `"for {parameter}"` |
| `timepoint` | The analysis visit or timepoint | `"at {visit}"` |
| `population` | The analysis population | `"in the {population} population"` |
| `grouping` | Treatment group comparison or stratification | `"comparing {treatment} groups"` |
| `method` | The statistical method | `"using {method}"` |
| `method_qualifier` | Method modifiers (imputation, confidence level) | `"with {imputation} imputation for missing data"` |
| `covariate` | Model covariates | `"adjusting for baseline {parameter}"` |

These roles compose into a full analysis description sentence. For example:

> *Change from baseline in ADAS-Cog(11) at Week 24 in the efficacy population comparing treatment groups using ANCOVA adjusting for baseline ADAS-Cog(11).*

The `smartphrase:` tags in a SAP XHTML document reference these library definitions and bind their placeholders to study-specific values.

---

## Bidirectional semantics

### Model → SAP (resolution)

A smartphrase-aware renderer resolves tags as follows:

1. For each `smartphrase:phrase`, look up `sp-oid` in the transformation library to retrieve the `phrase_template`.
2. For each `{placeholder}` token in the template, find the matching `smartphrase:binding` child element.
3. Resolve the binding value: use `value` for a literal string, or look up `concept-id` in the AC/DC model to retrieve the concept label.
4. Apply the `render` mode (`short`, `long`, or `long_with_short`) according to the binding or phrase default.
5. For `smartphrase:ref`, fetch the named sub-element from the referenced AC/DC model instance and render it.
6. Replace the tag with the resolved text in the rendered output.

### SAP → Model (instantiation)

A smartphrase-aware authoring tool creates or updates AC/DC instances as follows:

1. Locate `smartphrase:analysis` elements to identify which AC/DC concept instance a section describes.
2. If `ac-id` is present, the section references or updates an existing instance. If absent or prefixed with `new:`, the tool creates a new instance.
3. Collect all child `smartphrase:phrase` → `smartphrase:binding` elements within the section.
4. Map each binding to the corresponding AC/DC Attribute or Slice value using the role and placeholder name as the mapping key.
5. Construct or update the AC/DC instance metadata from the collected bindings.

---

## Tag hierarchy

Smartphrase tags operate at three levels, matching the granularity agreed for this PoC.

```
smartphrase:analysis      ← section level  (which AC/DC concept does this section describe?)
  smartphrase:sentence    ← block level    (a composed analysis description sentence)
    smartphrase:phrase    ← inline level   (a single role-phrase from the library)
      smartphrase:binding ← placeholder binding within a phrase
smartphrase:ref           ← inline level   (direct reference to any AC/DC model element)
```

---

## Tag reference

### `smartphrase:analysis`

Marks a `sap:endpoint-analysis`, `sap:analysis-set`, or other `sap:` section as corresponding to a specific AC/DC concept instance. This is a **void element** (no content); it acts as a metadata annotation on its parent section.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `ac-id` | one of `ac-id` / `dc-id` required | Analysis Concept instance ID (e.g. `S_AC_001`) |
| `dc-id` | one of `ac-id` / `dc-id` required | Derivation Concept instance ID (e.g. `S_DC_001`) |
| `template` | no | Template ID this instance is derived from (e.g. `T_AC_ANCOVA`) |
| `type` | no | `primary`, `secondary`, `sensitivity`, `supplementary`, `safety`, `subgroup`, `interim`, `derivation` |

```xml
<sap:endpoint-analysis type="primary" id="primary-efficacy-1">
  <smartphrase:analysis ac-id="S_AC_001" template="T_AC_ANCOVA" type="primary"/>
  ...
</sap:endpoint-analysis>
```

---

### `smartphrase:sentence`

A composed analysis description sentence assembled from one or more `smartphrase:phrase` children. Renders as an inline span; typically placed inside a `sap:p`.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `ac-id` | no | The AC instance this sentence describes |
| `roles` | no | Space-separated list of phrase roles included in this sentence (used by tooling to validate completeness) |

```xml
<sap:p>
  <smartphrase:sentence ac-id="S_AC_001" roles="endpoint timepoint population method covariate">
    <smartphrase:phrase sp-oid="SP_CFB_ENDPOINT" role="endpoint">
      <smartphrase:binding name="parameter" concept-id="PARAM_ADASCOG11" render="long"/>
    </smartphrase:phrase>
    <smartphrase:phrase sp-oid="SP_TIMEPOINT" role="timepoint">
      <smartphrase:binding name="visit" value="Week 24"/>
    </smartphrase:phrase>
    <smartphrase:phrase sp-oid="SP_POPULATION" role="population">
      <smartphrase:binding name="population" value="efficacy"/>
    </smartphrase:phrase>
    <smartphrase:phrase sp-oid="SP_METHOD_ANCOVA" role="method">
      <smartphrase:binding name="method" concept-id="M_ANCOVA"/>
    </smartphrase:phrase>
    <smartphrase:phrase sp-oid="SP_COVARIATE_BASELINE" role="covariate">
      <smartphrase:binding name="parameter" concept-id="PARAM_ADASCOG11" render="short"/>
    </smartphrase:phrase>
  </smartphrase:sentence>
  will be the primary analysis.
</sap:p>
```

Resolves to:

> *Change from baseline in ADAS-Cog(11) at Week 24 in the efficacy population using ANCOVA adjusting for baseline ADAS-Cog(11) will be the primary analysis.*

---

### `smartphrase:phrase`

A single smartphrase token corresponding to one role-entry in the transformation library. Renders as the resolved `phrase_template` with all `{placeholder}` tokens filled.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `sp-oid` | yes | SmartPhrase OID from the transformation library (e.g. `SP_CFB_ENDPOINT`) |
| `role` | yes | The phrase role (`endpoint`, `parameter`, `timepoint`, `population`, `grouping`, `method`, `method_qualifier`, `covariate`) |

Children: one `smartphrase:binding` per placeholder defined in the referenced `sp-oid`.

---

### `smartphrase:binding`

Binds a single placeholder within a `smartphrase:phrase` to a concrete value. At least one of `value` or `concept-id` must be present.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `name` | yes | Placeholder name; must match a placeholder defined in the parent phrase's `sp-oid` |
| `value` | one of `value` / `concept-id` | Literal string value |
| `concept-id` | one of `value` / `concept-id` | AC/DC concept, codelist item, or method ID; the renderer resolves this to a label |
| `render` | no | `short`, `long`, `long_with_short` (default: phrase definition default) |

```xml
<!-- Literal value -->
<smartphrase:binding name="visit" value="Week 24"/>

<!-- Model-linked value -->
<smartphrase:binding name="parameter" concept-id="PARAM_ADASCOG11" render="long_with_short"/>
```

---

### `smartphrase:ref`

A direct inline reference to any AC/DC model element. Used for references that do not fit the phrase/role pattern — e.g. naming a derivation concept inline, citing a method formula, or referencing an analysis set definition.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `type` | yes | Element type: `analysis`, `derivation`, `method`, `cube`, `slice`, `data-concept`, `analysis-set`, `estimand` |
| `id` | yes | Element ID in the AC/DC model |
| `element` | no | Sub-element path to render (e.g. `parameter`, `population`, `formula`, `label`) |
| `render` | no | `short` or `long` (default: `long`) |

```xml
<!-- Inline reference to an analysis concept -->
The primary analysis is defined in
<smartphrase:ref type="analysis" id="S_AC_001" render="short"/>.

<!-- Inline reference to a method formula -->
The model formula is:
<smartphrase:ref type="method" id="M_ANCOVA" element="formula"/>.

<!-- Inline reference to an analysis set -->
The
<smartphrase:ref type="analysis-set" id="fas" render="long"/>
will be used for all primary analyses.
```

---

## Render modes

| Mode | Description | Example |
|------|-------------|---------|
| `short` | Abbreviation or code | `ADAS-Cog(11)` |
| `long` | Full label | `Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items)` |
| `long_with_short` | Full label followed by abbreviation in parentheses | `Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items) (ADAS-Cog(11))` |

---

## Complete worked example

The following shows a complete `sap:main-approach` block for a primary ANCOVA analysis, with all three levels of smartphrase tagging.

```xml
<sap:endpoint-analysis type="primary" id="primary-adas-cog">

  <!-- Section-level: declares which AC/DC instance this section describes -->
  <smartphrase:analysis ac-id="S_AC_001" template="T_AC_ANCOVA" type="primary"/>

  <sap:endpoint-definition>
    <h4>4.1.1 Definition of Endpoint(s)</h4>
    <sap:p>
      The primary endpoint is
      <!-- Inline ref to a derivation concept -->
      <smartphrase:ref type="derivation" id="S_DC_002" render="long"/>
      at
      <!-- Inline ref to a sub-element -->
      <smartphrase:ref type="analysis" id="S_AC_001" element="timepoint"/>.
    </sap:p>
  </sap:endpoint-definition>

  <sap:main-approach>
    <h4>4.1.2 Main Analytical Approach</h4>

    <!-- Block-level: a composed sentence describing the analysis -->
    <sap:p>
      <smartphrase:sentence ac-id="S_AC_001"
                            roles="endpoint timepoint population method covariate">
        <smartphrase:phrase sp-oid="SP_CFB_ENDPOINT" role="endpoint">
          <smartphrase:binding name="parameter" concept-id="PARAM_ADASCOG11"
                               render="long_with_short"/>
        </smartphrase:phrase>
        <smartphrase:phrase sp-oid="SP_TIMEPOINT" role="timepoint">
          <smartphrase:binding name="visit" value="Week 24"/>
        </smartphrase:phrase>
        <smartphrase:phrase sp-oid="SP_POPULATION" role="population">
          <smartphrase:binding name="population" value="efficacy"/>
        </smartphrase:phrase>
        <smartphrase:phrase sp-oid="SP_METHOD_ANCOVA" role="method">
          <smartphrase:binding name="method" concept-id="M_ANCOVA"/>
        </smartphrase:phrase>
        <smartphrase:phrase sp-oid="SP_COVARIATE_BASELINE" role="covariate">
          <smartphrase:binding name="parameter" concept-id="PARAM_ADASCOG11"
                               render="short"/>
        </smartphrase:phrase>
      </smartphrase:sentence>
      will be assessed as the primary analysis.
    </sap:p>

    <sap:p>
      The model formula is:
      <!-- Inline ref to method formula sub-element -->
      <smartphrase:ref type="method" id="M_ANCOVA" element="formula"/>.
      Treatment comparisons will be made using least squares means.
    </sap:p>

  </sap:main-approach>

</sap:endpoint-analysis>
```

**Resolved output (model → SAP):**

> The primary endpoint is change from baseline in ADAS-Cog(11) at Week 24. Change from baseline in Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items) (ADAS-Cog(11)) at Week 24 in the efficacy population using ANCOVA adjusting for baseline ADAS-Cog(11) will be assessed as the primary analysis. The model formula is: `CHG ~ BASE + SITEID + TRTP`. Treatment comparisons will be made using least squares means.
