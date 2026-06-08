# SAP Tag Specification (`sap:` namespace)

> Status: Draft v0.1 — part of issue #9

This document defines the XHTML tag vocabulary for the `sap:` namespace. Together with the `smartphrase:` namespace (see `smartphrase-spec.md`), it provides a structured markup language for Statistical Analysis Plans grounded in the TransCelerate Common SAP Template.

---

## Namespace

```
xmlns:sap="urn:cdisc:ac-dc:sap:1.0"
```

---

## Rendering model

A SAP XHTML document is a valid XHTML file that includes `sap:` and `smartphrase:` elements as XML namespace extensions. Browsers treat unknown namespace elements as inline elements by default; including the companion stylesheet (`sap.css`) promotes block-level `sap:` elements to `display: block` so the document renders correctly without any tooling.

The `smartphrase:` layer is additive — stripping all `smartphrase:*` elements leaves a valid, human-readable SAP document.

---

## Document root

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:sap="urn:cdisc:ac-dc:sap:1.0"
      xmlns:smartphrase="urn:cdisc:ac-dc:smartphrase:1.0"
      xml:lang="en">
  <head>
    <meta charset="UTF-8"/>
    <link rel="stylesheet" href="../demo/sap.css"/>
    <title>Study XXX — Statistical Analysis Plan</title>
  </head>
  <body>
    <sap:document>
      <!-- front-matter and analytical sections -->
    </sap:document>
  </body>
</html>
```

---

## Structural / control tags

These tags govern document structure and can appear within any section.

### `sap:optional`

Wraps content that may or may not be present in a given SAP (pick-all-that-apply).

| Attribute | Required | Description |
|-----------|----------|-------------|
| `name` | yes | Machine-readable identifier for this optional block |
| `label` | no | Human-readable description shown in authoring tools |

```xml
<sap:optional name="decision-criteria" label="Decision Criteria / Statistical Hypotheses">
  <sap:decision-criteria>...</sap:decision-criteria>
</sap:optional>
```

### `sap:choice`

Wraps a set of mutually exclusive alternatives (pick-one). The `selected` attribute records which option was chosen.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `options` | yes | Comma-separated list of valid option values |
| `selected` | yes | The chosen option value |

```xml
<sap:choice options="key,confirmatory" selected="key">key</sap:choice>
```

### `sap:repeat`

Marks a repeating section. Its single child element type is the repeating unit; multiple instances of that child appear in a completed document.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `min` | no | Minimum occurrences (default: 0) |
| `max` | no | Maximum occurrences (default: unbounded) |

```xml
<sap:repeat min="1">
  <sap:analysis-set id="fas" label="Full Analysis Set">...</sap:analysis-set>
  <sap:analysis-set id="sas" label="Safety Analysis Set">...</sap:analysis-set>
</sap:repeat>
```

---

## Content elements

### `sap:p`

A paragraph of prose within any analytical section. May contain inline `smartphrase:` tags.

```xml
<sap:p>The primary endpoint is <smartphrase:phrase sp-oid="SP_CFB_ENDPOINT" role="endpoint">...</smartphrase:phrase>.</sap:p>
```

### `sap:table`

A structured table. Wraps a standard HTML `<table>` element.

```xml
<sap:table>
  <table>...</table>
</sap:table>
```

---

## Analytical section tags

The sections below map directly to the TransCelerate Common SAP Template. Sections that carry no AC/DC-linkable analytical content (Title Page, Table of Contents, Version History, List of Abbreviations, Supporting Documentation, References) are written as plain XHTML without `sap:` tags.

---

### Section 1 — Introduction

#### `sap:introduction`

Container for Section 1.

```xml
<sap:introduction>
  <h1>1. Introduction</h1>
  <sap:objectives-endpoints-estimands>...</sap:objectives-endpoints-estimands>
  <sap:study-design>...</sap:study-design>
</sap:introduction>
```

#### `sap:objectives-endpoints-estimands`

Section 1.1. Contains the objectives/endpoints table and estimand descriptions.

```xml
<sap:objectives-endpoints-estimands>
  <h2>1.1 Objectives, Endpoints, and Estimands</h2>
  <sap:objectives-table>
    <sap:table>
      <table>
        <thead><tr><th>Objectives</th><th>Endpoints</th></tr></thead>
        <tbody>...</tbody>
      </table>
    </sap:table>
  </sap:objectives-table>
  <sap:estimands>
    <sap:repeat>
      <sap:estimand type="primary" for-objective="obj-1">...</sap:estimand>
    </sap:repeat>
  </sap:estimands>
</sap:objectives-endpoints-estimands>
```

**`sap:estimand` attributes:**

| Attribute | Required | Values | Description |
|-----------|----------|--------|-------------|
| `type` | yes | `primary`, `secondary`, `supplementary`, `other` | Estimand type |
| `for-objective` | no | objective ID | Links to the objective this estimand addresses |

#### `sap:study-design`

Section 1.2. Free prose describing the study design.

---

### Section 2 — General Considerations

#### `sap:general-considerations`

Container for Section 2.

```xml
<sap:general-considerations>
  <h1>2. General Considerations</h1>
  <sap:optional name="decision-criteria">
    <sap:decision-criteria>...</sap:decision-criteria>
  </sap:optional>
  <sap:multiplicity>...</sap:multiplicity>
  <sap:intercurrent-events>...</sap:intercurrent-events>
  <sap:missing-data>...</sap:missing-data>
</sap:general-considerations>
```

#### `sap:decision-criteria`

Section 2.1 (optional). Decision criteria or statistical hypotheses.

#### `sap:multiplicity`

Section 2.2. Multiplicity adjustment strategy.

#### `sap:intercurrent-events`

Section 2.3. Impact of intercurrent events strategies.

#### `sap:missing-data`

Section 2.4. Handling of missing data.

---

### Section 3 — Analysis Sets

#### `sap:analysis-sets`

Contains one or more `sap:analysis-set` elements within a `sap:repeat`.

```xml
<sap:analysis-sets>
  <h1>3. Analysis Sets</h1>
  <sap:repeat min="1">
    <sap:analysis-set id="fas" label="Full Analysis Set (FAS)">
      <sap:p>All randomised participants.</sap:p>
    </sap:analysis-set>
  </sap:repeat>
</sap:analysis-sets>
```

**`sap:analysis-set` attributes:**

| Attribute | Required | Description |
|-----------|----------|-------------|
| `id` | yes | Machine-readable identifier (e.g. `fas`, `sas`) |
| `label` | yes | Full human-readable name |

---

### Sections 4–6 — Efficacy Analyses

The same `sap:endpoint-analysis` element is reused at all three levels (primary, secondary, other objective). The containing section element determines the context.

#### `sap:primary-analyses`

Section 4.

```xml
<sap:primary-analyses>
  <h1>4. Analyses Supporting Primary Objective(s)</h1>
  <sap:repeat min="1">
    <sap:endpoint-analysis type="primary">...</sap:endpoint-analysis>
  </sap:repeat>
</sap:primary-analyses>
```

#### `sap:secondary-analyses`

Section 5. Repeats per secondary objective; within each objective, endpoint analyses are grouped by classification.

```xml
<sap:secondary-analyses>
  <h1>5. Analyses Supporting Secondary Objective(s)</h1>
  <sap:repeat>
    <sap:secondary-objective label="[label]">
      <sap:repeat>
        <sap:endpoint-analysis type="secondary">
          <sap:classification>
            <sap:choice options="key,confirmatory" selected="key">key</sap:choice>
          </sap:classification>
          ...
        </sap:endpoint-analysis>
      </sap:repeat>
      <sap:repeat>
        <sap:endpoint-analysis type="supportive-secondary">...</sap:endpoint-analysis>
      </sap:repeat>
    </sap:secondary-objective>
  </sap:repeat>
</sap:secondary-analyses>
```

**`sap:secondary-objective` attributes:**

| Attribute | Required | Description |
|-----------|----------|-------------|
| `label` | yes | Short label identifying this secondary objective |

#### `sap:other-objective-analyses`

Section 6 (optional). Repeats per other objective; the section title is determined by `sap:choice`.

```xml
<sap:optional name="other-objective-analyses">
  <sap:other-objective-analyses>
    <h1>6. Analyses Supporting
      <sap:choice options="tertiary,exploratory,other" selected="exploratory">Exploratory</sap:choice>
      Objective(s)
    </h1>
    <sap:repeat>
      <sap:endpoint-analysis type="exploratory">...</sap:endpoint-analysis>
    </sap:repeat>
  </sap:other-objective-analyses>
</sap:optional>
```

#### `sap:endpoint-analysis`

Reusable element describing a single endpoint analysis. Used within Sections 4, 5, and 6.

**Attributes:**

| Attribute | Required | Values | Description |
|-----------|----------|--------|-------------|
| `type` | yes | `primary`, `secondary`, `supportive-secondary`, `exploratory`, `tertiary`, `other` | Analysis classification |
| `id` | no | string | Study-specific analysis identifier |

**Children:**

| Element | Cardinality | Description |
|---------|-------------|-------------|
| `sap:endpoint-definition` | 1 | Definition of the endpoint |
| `sap:main-approach` | 1 | Main analytical approach |
| `sap:sensitivity-analyses` | 0–1 | Contains `sap:repeat` of `sap:sensitivity-analysis` |
| `sap:supplementary-analyses` | 0–1 | Contains `sap:repeat` of `sap:supplementary-analysis` |

```xml
<sap:endpoint-analysis type="primary" id="primary-efficacy-1">
  <smartphrase:analysis ac-id="S_AC_001" template="T_AC_ANCOVA" type="primary"/>
  <sap:endpoint-definition>
    <h4>4.1.1 Definition of Endpoint(s)</h4>
    <sap:p>...</sap:p>
  </sap:endpoint-definition>
  <sap:main-approach>
    <h4>4.1.2 Main Analytical Approach</h4>
    <sap:p>...</sap:p>
  </sap:main-approach>
  <sap:sensitivity-analyses>
    <h4>4.1.3 Sensitivity Analyses</h4>
    <sap:repeat>
      <sap:sensitivity-analysis id="sa-1">...</sap:sensitivity-analysis>
    </sap:repeat>
  </sap:sensitivity-analyses>
  <sap:supplementary-analyses>
    <h4>4.1.4 Supplementary Analyses</h4>
    <sap:repeat>
      <sap:supplementary-analysis id="sup-1">...</sap:supplementary-analysis>
    </sap:repeat>
  </sap:supplementary-analyses>
</sap:endpoint-analysis>
```

---

### Section 7 — Safety Analyses

#### `sap:safety-analyses`

```xml
<sap:safety-analyses>
  <h1>7. Safety Analyses</h1>
  <sap:extent-of-exposure>
    <h2>7.1 Extent of Exposure</h2>
    ...
  </sap:extent-of-exposure>
  <sap:adverse-events>
    <h2>7.2 Adverse Events</h2>
    ...
  </sap:adverse-events>
  <sap:optional name="additional-safety-assessments">
    <sap:repeat>
      <sap:additional-safety-assessment label="[label]">
        <h2>7.3 Additional Safety Assessment: [label]</h2>
        ...
      </sap:additional-safety-assessment>
    </sap:repeat>
  </sap:optional>
</sap:safety-analyses>
```

**`sap:additional-safety-assessment` attributes:**

| Attribute | Required | Description |
|-----------|----------|-------------|
| `label` | yes | Name of the additional assessment |

---

### Section 8 — Other Analyses

#### `sap:other-analyses`

```xml
<sap:other-analyses>
  <h1>8. Other Analyses</h1>
  <sap:optional name="other-variables">
    <sap:other-variables>
      <h2>8.1 Other Variables and/or Parameters</h2>
      ...
    </sap:other-variables>
  </sap:optional>
  <sap:optional name="subgroup-analyses">
    <sap:subgroup-analyses>
      <h2>8.2 Subgroup Analyses</h2>
      <sap:repeat>
        <sap:subgroup-analysis id="[id]" label="[label]">...</sap:subgroup-analysis>
      </sap:repeat>
    </sap:subgroup-analyses>
  </sap:optional>
</sap:other-analyses>
```

---

### Section 9 — Interim Analyses

#### `sap:interim-analyses`

```xml
<sap:optional name="interim-analyses">
  <sap:interim-analyses>
    <h1>9. Interim
      <sap:choice options="analysis,analyses" selected="analyses">Analyses</sap:choice>
    </h1>
    <sap:repeat>
      <sap:interim-analysis id="[id]" label="[label]">...</sap:interim-analysis>
    </sap:repeat>
  </sap:interim-analyses>
</sap:optional>
```

---

### Sections 10–13 — Administrative

Sections 10 (Protocol Changes), 11 (Sample Size), 12 (Supporting Documentation), and 13 (References) are written as plain XHTML without `sap:` or `smartphrase:` tags.

---

## Complete tag index

| Tag | Section | Repeatable | Optional |
|-----|---------|------------|----------|
| `sap:document` | root | — | — |
| `sap:introduction` | 1 | — | — |
| `sap:objectives-endpoints-estimands` | 1.1 | — | — |
| `sap:objectives-table` | 1.1 | — | — |
| `sap:estimands` | 1.1 | — | — |
| `sap:estimand` | 1.1 | yes | — |
| `sap:study-design` | 1.2 | — | — |
| `sap:general-considerations` | 2 | — | — |
| `sap:decision-criteria` | 2.1 | — | yes |
| `sap:multiplicity` | 2.2 | — | — |
| `sap:intercurrent-events` | 2.3 | — | — |
| `sap:missing-data` | 2.4 | — | — |
| `sap:analysis-sets` | 3 | — | — |
| `sap:analysis-set` | 3 | yes | — |
| `sap:primary-analyses` | 4 | — | — |
| `sap:secondary-analyses` | 5 | — | — |
| `sap:secondary-objective` | 5 | yes | — |
| `sap:other-objective-analyses` | 6 | — | yes |
| `sap:endpoint-analysis` | 4/5/6 | yes | — |
| `sap:endpoint-definition` | 4/5/6 | — | — |
| `sap:main-approach` | 4/5/6 | — | — |
| `sap:sensitivity-analyses` | 4/5/6 | — | yes |
| `sap:sensitivity-analysis` | 4/5/6 | yes | — |
| `sap:supplementary-analyses` | 4/5/6 | — | yes |
| `sap:supplementary-analysis` | 4/5/6 | yes | — |
| `sap:safety-analyses` | 7 | — | — |
| `sap:extent-of-exposure` | 7.1 | — | — |
| `sap:adverse-events` | 7.2 | — | — |
| `sap:additional-safety-assessment` | 7.3 | yes | yes |
| `sap:other-analyses` | 8 | — | yes |
| `sap:other-variables` | 8.1 | — | yes |
| `sap:subgroup-analyses` | 8.2 | — | yes |
| `sap:subgroup-analysis` | 8.2 | yes | — |
| `sap:interim-analyses` | 9 | — | yes |
| `sap:interim-analysis` | 9 | yes | — |
| `sap:optional` | any | — | — |
| `sap:choice` | any | — | — |
| `sap:repeat` | any | — | — |
| `sap:p` | any | yes | — |
| `sap:table` | any | yes | — |
