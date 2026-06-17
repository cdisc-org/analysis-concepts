# eSAP Builder — SAP ToC Alignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the eSAP builder (Step 7) to align with the standard 14-section SAP Table of Contents, auto-populating from configured endpoint/analysis/derivation metadata while preserving the existing endpoint→analysis specification workflow and USDM narrative linking.

**Architecture:** The existing `esap-builder.js` is rewritten with a new SAP ToC section structure. Each section is collapsible with a "Link USDM Content" button (existing mechanism preserved). Sections 6-10 auto-populate from `appState.endpointSpecs`, the transformation library, loaded methods, and the estimand framework. The existing 5-section `ESAP_SECTION_PREFIXES` mapping expands to 14 SAP sections. Navigation buttons allow jumping back to the relevant configuration step (endpoint-what, endpoint-how, derivation pipeline) so the user can refine their specifications without losing context.

**Tech Stack:** Vanilla JS (ES modules), inline HTML templating (matching existing patterns), existing CSS classes (`.collapsible`, `.data-table`, `.card`, `.badge`)

---

## Proposed User Flow

```
Steps 1-6 (unchanged):
  1. Select Study
  2. Study Overview (select endpoints)
  3. Endpoint What (BC, derivation, parameter)
  4. Endpoint How (analysis, bindings, model, estimand)
  5. Endpoint Summary
  6. Derivation Pipeline

Step 7 → eSAP Document View (restructured):
  - Presents ALL configured metadata in SAP document order
  - 14 collapsible sections matching standard SAP ToC
  - Sections 1-5: USDM-sourced (study info, design, objectives)
  - Section 6: Estimands — auto-generated from estimand framework
  - Section 7: Endpoints — grouped by level, formalized descriptions
  - Section 8: Analysis Sets — populations from USDM
  - Section 9: Statistical Methods — method details, assumptions
  - Section 10: Statistical Analysis — per-endpoint analysis detail
            with expandable derivation chains, output specs, indexed_by
  - Sections 11-14: Static/USDM-linked (software, references, shells)
  - Each section has "Link USDM Content" button (existing mechanism)
  - "Edit" buttons on sections 6-10 navigate back to the relevant step
```

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `ac-dc-app/js/views/esap-builder.js` | **Rewrite** | Main eSAP render with 14 SAP ToC sections, section renderers, event wiring |
| `ac-dc-app/js/app.js` | **Modify** (lines 37-43) | Expand `esapLinkedNarratives` to include new section keys |
| `ac-dc-app/js/utils/instance-serializer.js` | **Modify** | Serialize/restore new section keys |

No new files needed — the existing architecture handles everything.

---

## Chunk 1: Expand State & Section Mapping

### Task 1: Expand appState and section mapping constants

**Files:**
- Modify: `ac-dc-app/js/app.js:37-43`
- Modify: `ac-dc-app/js/views/esap-builder.js:7-21`

- [ ] **Step 1: Update `esapLinkedNarratives` in appState**

In `ac-dc-app/js/app.js`, expand the section keys to match the 14-section SAP ToC:

```javascript
esapLinkedNarratives: {
  abbreviations: [],
  introduction: [],
  objectives: [],
  studyDesign: [],
  protocolChanges: [],
  estimands: [],
  endpoints: [],
  analysisSets: [],
  statMethods: [],
  statAnalysis: [],
  software: [],
  references: [],
  shells: [],
  appendices: []
},
```

- [ ] **Step 2: Update ESAP_SECTION_PREFIXES and LABELS in esap-builder.js**

Replace lines 7-21 with new mapping that covers all 14 SAP sections. The prefixes map USDM protocol section numbers to eSAP sections for the narrative picker:

```javascript
const ESAP_SECTION_PREFIXES = {
  abbreviations: ['13'],           // APPENDIX: Glossary/Abbreviations
  introduction: ['1'],             // Introduction
  objectives:   ['2'],             // Objectives
  studyDesign:  ['3.1', '3.2', '3.3', '3.5', '3.6', '3.7'],  // Design sections
  protocolChanges: [],             // Manual/USDM-linked
  estimands:    [],                // Auto-generated from endpoint specs
  endpoints:    ['3.9'],           // Efficacy/Safety evaluations
  analysisSets: ['3.4'],           // Study Population / Analysis sets
  statMethods:  ['4'],             // Statistical methods (if protocol has them)
  statAnalysis: [],                // Auto-generated from analysis configs
  software:     [],                // Manual
  references:   ['14'],            // References
  shells:       [],                // Manual
  appendices:   ['12']             // Appendices
};

const ESAP_SECTION_LABELS = {
  abbreviations:   '1. List of Abbreviations',
  introduction:    '2. Introduction',
  objectives:      '3. Study Objectives',
  studyDesign:     '4. Study Design',
  protocolChanges: '5. Changes in the Protocol',
  estimands:       '6. Estimands',
  endpoints:       '7. Study Endpoints',
  analysisSets:    '8. Analysis Sets',
  statMethods:     '9. Statistical Methods',
  statAnalysis:    '10. Statistical Analysis',
  software:        '11. Computer Software',
  references:      '12. References',
  shells:          '13. Table/Figure/Listing Shells',
  appendices:      '14. Appendices'
};
```

- [ ] **Step 3: Update instance-serializer.js**

In the serialization/restore code, ensure all new section keys are handled. Search for `esapLinkedNarratives` in `instance-serializer.js` and update accordingly.

- [ ] **Step 4: Verify no breakage**

Open the app, navigate to eSAP step — should render (even if sections are empty). The narrative picker should still work with the expanded section keys.

- [ ] **Step 5: Commit**

```bash
git add ac-dc-app/js/app.js ac-dc-app/js/views/esap-builder.js ac-dc-app/js/utils/instance-serializer.js
git commit -m "feat: expand eSAP section mapping to 14-section SAP ToC"
```

---

## Chunk 2: Rewrite Main Render with SAP ToC Structure

### Task 2: Restructure renderEsapBuilder with 14 sections

**Files:**
- Modify: `ac-dc-app/js/views/esap-builder.js:85-205`

The main `renderEsapBuilder()` function is rewritten to render all 14 sections. Each section uses the existing `renderEsapSection()` wrapper (collapsible + USDM link button). Sections that are auto-generated call dedicated render functions (Tasks 3-5).

- [ ] **Step 1: Rewrite the container.innerHTML template**

Replace lines 108-148 with the 14-section structure. Key design decisions:

- Sections 1-5 (front matter): Primarily USDM-sourced, rendered with existing helpers
- Section 6 (Estimands): Auto-generated using `buildEstimandFrameworkHtml()` per endpoint
- Section 7 (Endpoints): Grouped by level (Primary/Secondary/Safety), with subsections
- Section 8 (Analysis Sets): Populations from USDM study data
- Section 9 (Statistical Methods): Method details from loaded methods
- Section 10 (Statistical Analysis): Per-endpoint analysis cards with derivation chain, output spec
- Sections 11-14 (back matter): USDM-linked placeholders

Each auto-generated section includes an "Edit in Step N" button that calls `navigateTo(N)`.

```javascript
container.innerHTML = `
  <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
    <div>
      <h2 style="font-size:22px; font-weight:700;">Electronic Statistical Analysis Plan</h2>
      <p style="color:var(--cdisc-gray); font-size:13px; margin-top:4px;">${study.name}</p>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-secondary" id="btn-back-pipeline">&larr; Back to Pipeline</button>
    </div>
  </div>

  <div class="esap-doc">
    ${renderEsapSection('abbreviations', ESAP_SECTION_LABELS.abbreviations, renderAbbreviationsSection())}
    ${renderEsapSection('introduction', ESAP_SECTION_LABELS.introduction, renderIntroductionSection(study))}
    ${renderEsapSection('objectives', ESAP_SECTION_LABELS.objectives, renderObjectivesSection(selectedEps, byObjective))}
    ${renderEsapSection('studyDesign', ESAP_SECTION_LABELS.studyDesign, renderStudyDesignSection(study))}
    ${renderEsapSection('protocolChanges', ESAP_SECTION_LABELS.protocolChanges, renderPlaceholderSection('Link USDM content describing protocol amendments and their impact on planned analyses.'))}
    ${renderEsapSection('estimands', ESAP_SECTION_LABELS.estimands, renderEstimandsSection(selectedEps, study))}
    ${renderEsapSection('endpoints', ESAP_SECTION_LABELS.endpoints, renderEndpointsSection(selectedEps, study))}
    ${renderEsapSection('analysisSets', ESAP_SECTION_LABELS.analysisSets, renderAnalysisSetsSection(study))}
    ${renderEsapSection('statMethods', ESAP_SECTION_LABELS.statMethods, renderStatMethodsSection(selectedEps, study, loadedMethods))}
    ${renderEsapSection('statAnalysis', ESAP_SECTION_LABELS.statAnalysis, renderStatAnalysisSection(selectedEps, study))}
    ${renderEsapSection('software', ESAP_SECTION_LABELS.software, renderPlaceholderSection('Specify statistical software (e.g., SAS 9.4, R 4.3).'))}
    ${renderEsapSection('references', ESAP_SECTION_LABELS.references, renderPlaceholderSection('Add references to ICH E9(R1), protocol, and relevant literature.'))}
    ${renderEsapSection('shells', ESAP_SECTION_LABELS.shells, renderPlaceholderSection('Table, figure, and listing shells will be appended.'))}
    ${renderEsapSection('appendices', ESAP_SECTION_LABELS.appendices, renderPlaceholderSection('Supplementary material.'))}
  </div>
`;
```

- [ ] **Step 2: Add method loading**

Before rendering, the function needs to load methods for all configured analyses so section 9 and 10 can display method details. Add at the top of `renderEsapBuilder()`:

```javascript
// Collect unique method OIDs from all configured analyses
const methodOids = new Set();
for (const ep of selectedEps) {
  const spec = appState.endpointSpecs?.[ep.id];
  for (const analysis of spec?.selectedAnalyses || []) {
    const transform = getTransformationByOid(analysis.transformationOid);
    if (transform?.usesMethod) methodOids.add(transform.usesMethod);
  }
}
// Load all methods (async)
const loadedMethods = {};
for (const oid of methodOids) {
  if (!appState.loadedMethods?.[oid]) {
    await loadMethod(oid);
  }
  loadedMethods[oid] = appState.loadedMethods?.[oid] || null;
}
```

Note: `renderEsapBuilder` must become `async` (it may already be — check).

- [ ] **Step 3: Update event wiring**

Keep existing event wiring for:
- Collapsible toggle (unchanged)
- USDM link buttons (unchanged)
- Remove linked narrative buttons (unchanged)

Add new wiring for:
- "Edit in Step N" buttons → `navigateTo(N)` with appropriate endpoint context
- Back button → `navigateTo(6)` (back to derivation pipeline)

- [ ] **Step 4: Add helper imports**

Add imports at top of esap-builder.js:

```javascript
import { buildEstimandFrameworkHtml, buildEstimandDescription, getTransformationByOid,
         getDerivationTransformationByOid, getSpecParameterValue,
         buildFormalizedDescription, getFormalizedDescription } from './endpoint-spec.js';
import { getOutputMapping, buildDependencyChain } from '../utils/transformation-linker.js';
import { displayConcept } from '../utils/concept-display.js';
import { loadMethod } from '../data-loader.js';
import { renderFormulaExpression } from './transformation-config.js';
```

- [ ] **Step 5: Commit**

```bash
git add ac-dc-app/js/views/esap-builder.js
git commit -m "feat: restructure eSAP main render with 14-section SAP ToC"
```

---

## Chunk 3: Section Renderers — Front Matter (Sections 1-5)

### Task 3: Implement front matter section renderers

**Files:**
- Modify: `ac-dc-app/js/views/esap-builder.js`

These sections are primarily USDM-sourced. The existing `renderStudyInfoSection` and `renderStudyDesignSection` are adapted. New lightweight renderers are added.

- [ ] **Step 1: Implement section renderers**

```javascript
// Section 1: Abbreviations — placeholder for USDM linking
function renderAbbreviationsSection() {
  return '<p style="font-size:12px; color:var(--cdisc-gray);">Link protocol abbreviations from USDM, or add manually.</p>';
}

// Section 2: Introduction — study info table + USDM narrative
function renderIntroductionSection(study) {
  // Reuse existing renderStudyInfoSection content
  return renderStudyInfoSection(study);
}

// Section 3: Objectives — grouped by level with endpoints
function renderObjectivesSection(selectedEps, byObjective) {
  // Reuse existing objectives rendering (lines 128-138)
  // Add subsections: 3.1 Primary, 3.2 Secondary, 3.3 Exploratory
  let html = '';
  const levels = ['Primary', 'Secondary', 'Exploratory'];
  for (const level of levels) {
    const objs = Object.entries(byObjective).filter(([, obj]) => obj.objectiveLevel.includes(level));
    if (objs.length === 0) continue;
    html += `<div style="margin-bottom:16px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:8px;">${level} Objective(s)</div>
      ${objs.map(([objId, obj]) => `
        <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-light-gray); border-radius:var(--radius);">
          <strong>${obj.objectiveName}</strong>
          <p style="font-size:12px; margin-top:4px; line-height:1.5;">${obj.objectiveText || ''}</p>
          ${obj.endpoints.map(ep => `<div style="font-size:12px; margin-top:4px;"><span class="badge badge-blue">${ep.name}</span> ${ep.text || ''}</div>`).join('')}
        </div>
      `).join('')}
    </div>`;
  }
  return html || '<p style="color:var(--cdisc-gray);">No objectives configured.</p>';
}

// Section 4: Study Design — reuse existing renderStudyDesignSection

// Section 5: Protocol Changes — USDM-link placeholder
// Uses renderPlaceholderSection() (generic helper)

function renderPlaceholderSection(text) {
  return `<p style="font-size:12px; color:var(--cdisc-gray); font-style:italic;">${text}</p>`;
}
```

- [ ] **Step 2: Verify sections 1-5 render correctly**

Navigate to eSAP step. Sections 1-5 should show study metadata and USDM link buttons.

- [ ] **Step 3: Commit**

```bash
git add ac-dc-app/js/views/esap-builder.js
git commit -m "feat: add eSAP front matter section renderers (sections 1-5)"
```

---

## Chunk 4: Section Renderers — Core Analysis Sections (6-10)

### Task 4: Implement Estimands section (Section 6)

**Files:**
- Modify: `ac-dc-app/js/views/esap-builder.js`

- [ ] **Step 1: Implement renderEstimandsSection**

Auto-generates estimand framework for each endpoint using the existing `buildEstimandFrameworkHtml()`:

```javascript
function renderEstimandsSection(selectedEps, study) {
  const primaryEps = selectedEps.filter(ep => ep.level.includes('Primary'));
  const secondaryEps = selectedEps.filter(ep => ep.level.includes('Secondary'));
  const otherEps = selectedEps.filter(ep => !ep.level.includes('Primary') && !ep.level.includes('Secondary'));

  function renderEstimandGroup(label, eps) {
    if (eps.length === 0) return '';
    return `
      <div style="margin-bottom:16px;">
        <div style="font-weight:600; font-size:13px; margin-bottom:8px;">${label}</div>
        ${eps.map(ep => {
          const spec = appState.endpointSpecs?.[ep.id] || {};
          const estimandDesc = buildEstimandDescription(ep, spec, study);
          return `
            <div style="margin-bottom:12px;">
              <div style="font-size:12px; font-weight:600; margin-bottom:4px;">${ep.name}</div>
              ${buildEstimandFrameworkHtml(ep, spec, study, estimandDesc)}
            </div>`;
        }).join('')}
      </div>`;
  }

  let html = renderEstimandGroup('6.1 Primary Estimand(s)', primaryEps);
  html += renderEstimandGroup('6.2 Secondary Estimand(s)', secondaryEps);
  if (otherEps.length > 0) html += renderEstimandGroup('6.3 Other Estimand(s)', otherEps);

  if (!html) html = '<p style="color:var(--cdisc-gray);">Configure endpoints and analyses to auto-generate estimands.</p>';

  html += `<div style="margin-top:8px;"><button class="btn btn-sm btn-secondary esap-edit-btn" data-step="4">Edit in Endpoint How &rarr;</button></div>`;
  return html;
}
```

- [ ] **Step 2: Commit**

```bash
git add ac-dc-app/js/views/esap-builder.js
git commit -m "feat: add eSAP estimands section (section 6)"
```

### Task 5: Implement Endpoints section (Section 7)

- [ ] **Step 1: Implement renderEndpointsSection**

Groups endpoints by level with subsections matching SAP ToC 7.7-7.10. Includes formalized descriptions, derivation info, and BC linkage:

```javascript
function renderEndpointsSection(selectedEps, study) {
  // 7.1 Schedule of Assessments — USDM link placeholder
  // 7.2 Timepoint Definitions — from visit labels
  // 7.5 Demographics — placeholder
  // 7.7-7.9 Primary/Secondary/Exploratory endpoints
  // 7.10 Safety endpoints

  const visitLabels = getVisitLabels(study);

  let html = `
    <div style="margin-bottom:16px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:8px;">7.2 Timepoint Definitions</div>
      <div style="font-size:12px;">
        ${visitLabels.length > 0
          ? `<div style="display:flex; flex-wrap:wrap; gap:4px;">${visitLabels.map(v => `<span class="badge badge-teal">${v}</span>`).join('')}</div>`
          : '<span style="color:var(--cdisc-gray);">No timepoints defined in study.</span>'}
      </div>
    </div>`;

  // Group and render by level
  const groups = [
    { label: '7.7 Primary Endpoint(s)', filter: ep => ep.level.includes('Primary') },
    { label: '7.8 Secondary Endpoint(s)', filter: ep => ep.level.includes('Secondary') },
    { label: '7.9 Exploratory Endpoint(s)', filter: ep => ep.level.includes('Exploratory') },
    { label: '7.10 Safety Endpoints', filter: ep => ep.level.includes('Safety') }
  ];

  for (const group of groups) {
    const eps = selectedEps.filter(group.filter);
    if (eps.length === 0) continue;
    html += `<div style="margin-bottom:16px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:8px;">${group.label}</div>
      ${eps.map(ep => renderEndpointCard(ep)).join('')}
    </div>`;
  }

  html += `<div style="margin-top:8px;"><button class="btn btn-sm btn-secondary esap-edit-btn" data-step="3">Edit in Endpoint What &rarr;</button></div>`;
  return html;
}
```

- [ ] **Step 2: Commit**

```bash
git add ac-dc-app/js/views/esap-builder.js
git commit -m "feat: add eSAP endpoints section (section 7)"
```

### Task 6: Implement Analysis Sets section (Section 8)

- [ ] **Step 1: Implement renderAnalysisSetsSection**

Renders populations from USDM study data:

```javascript
function renderAnalysisSetsSection(study) {
  const analysisPopulations = study.analysisPopulations || [];
  const studyPopulations = study.populations || [];

  if (analysisPopulations.length === 0 && studyPopulations.length === 0) {
    return '<p style="color:var(--cdisc-gray);">No analysis sets defined in study.</p>';
  }

  return `
    <table class="data-table">
      <thead><tr><th>Analysis Set</th><th>Description</th></tr></thead>
      <tbody>
        ${analysisPopulations.map(ap => `
          <tr>
            <td style="font-weight:600;">${ap.name}</td>
            <td>${ap.text || ap.description || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add ac-dc-app/js/views/esap-builder.js
git commit -m "feat: add eSAP analysis sets section (section 8)"
```

### Task 7: Implement Statistical Methods section (Section 9)

- [ ] **Step 1: Implement renderStatMethodsSection**

Lists all unique methods used across configured analyses with their details:

```javascript
function renderStatMethodsSection(selectedEps, study, loadedMethods) {
  // Collect unique methods with their usage context
  const methodUsage = new Map(); // methodOid → { method, transforms[], endpoints[] }

  for (const ep of selectedEps) {
    const spec = appState.endpointSpecs?.[ep.id];
    for (const analysis of spec?.selectedAnalyses || []) {
      const transform = getTransformationByOid(analysis.transformationOid);
      if (!transform?.usesMethod) continue;
      const methodOid = transform.usesMethod;
      if (!methodUsage.has(methodOid)) {
        methodUsage.set(methodOid, {
          method: loadedMethods[methodOid] || null,
          methodOid,
          transforms: [],
          endpoints: []
        });
      }
      const entry = methodUsage.get(methodOid);
      if (!entry.transforms.find(t => t.oid === transform.oid)) entry.transforms.push(transform);
      if (!entry.endpoints.find(e => e.id === ep.id)) entry.endpoints.push(ep);
    }
  }

  if (methodUsage.size === 0) {
    return '<p style="color:var(--cdisc-gray);">No statistical methods configured. Select analyses in the Endpoint How step.</p>';
  }

  let html = '<div style="font-weight:600; font-size:13px; margin-bottom:12px;">9.1 General Methodology</div>';

  for (const [oid, usage] of methodUsage) {
    const m = usage.method;
    html += `
      <div class="card" style="margin-bottom:12px; padding:12px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <strong>${m?.name || oid}</strong>
          <span class="badge badge-blue">${m?.type || ''}</span>
          <span class="badge badge-secondary">${m?.class || ''}</span>
        </div>
        ${m?.description ? `<p style="font-size:12px; margin-bottom:8px;">${m.description}</p>` : ''}
        ${m?.formula ? `<div style="font-size:11px; color:var(--cdisc-gray); margin-bottom:4px;">Formula: <code>${m.formula.default_expression || ''}</code></div>` : ''}
        <div style="font-size:11px; color:var(--cdisc-text-secondary);">
          Used by: ${usage.endpoints.map(ep => `<span class="badge badge-teal">${ep.name}</span>`).join(' ')}
        </div>
        ${m?.input_roles ? `
        <div style="margin-top:8px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-gray); text-transform:uppercase; margin-bottom:4px;">Input Roles</div>
          <table class="data-table" style="font-size:11px;">
            <thead><tr><th>Role</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
            <tbody>
              ${m.input_roles.map(r => `<tr><td style="font-weight:600;">${r.name}</td><td>${r.dataType}</td><td>${r.required ? 'Yes' : 'No'}</td><td>${r.description || ''}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
        ${m?.assumptions?.length > 0 ? `
        <div style="margin-top:8px; font-size:11px;">
          <strong>Assumptions:</strong> ${m.assumptions.join('; ')}
        </div>` : ''}
      </div>`;
  }

  // 9.2 Adjustments for Covariates — list covariate bindings
  // 9.3 Handling of Dropouts — placeholder
  // 9.5 Multiple Comparisons — placeholder
  html += `
    <div style="font-weight:600; font-size:13px; margin-top:16px; margin-bottom:8px;">9.3 Handling of Dropouts or Missing Data</div>
    <p style="font-size:12px; color:var(--cdisc-gray); font-style:italic;">Link USDM content or describe imputation methods.</p>
    <div style="font-weight:600; font-size:13px; margin-top:16px; margin-bottom:8px;">9.5 Multiple Comparisons/Multiplicity</div>
    <p style="font-size:12px; color:var(--cdisc-gray); font-style:italic;">Link USDM content describing multiplicity adjustments.</p>
  `;

  html += `<div style="margin-top:8px;"><button class="btn btn-sm btn-secondary esap-edit-btn" data-step="4">Edit in Endpoint How &rarr;</button></div>`;
  return html;
}
```

- [ ] **Step 2: Commit**

```bash
git add ac-dc-app/js/views/esap-builder.js
git commit -m "feat: add eSAP statistical methods section (section 9)"
```

### Task 8: Implement Statistical Analysis section (Section 10)

This is the richest section — it presents per-endpoint analysis cards with expandable details.

- [ ] **Step 1: Implement renderStatAnalysisSection**

Each endpoint gets a card showing: derivation chain → analysis → outputs. Expandable for full detail.

```javascript
function renderStatAnalysisSection(selectedEps, study) {
  const lib = appState.transformationLibrary;

  // Group by level for subsections 10.5-10.8
  const groups = [
    { label: '10.5 Analysis of Primary Endpoint(s)', filter: ep => ep.level.includes('Primary') },
    { label: '10.6 Analysis of Secondary Endpoint(s)', filter: ep => ep.level.includes('Secondary') },
    { label: '10.7 Analysis of Exploratory Endpoint(s)', filter: ep => ep.level.includes('Exploratory') },
    { label: '10.8 Analysis of Safety Endpoint(s)', filter: ep => ep.level.includes('Safety') }
  ];

  let html = '';

  for (const group of groups) {
    const eps = selectedEps.filter(group.filter);
    if (eps.length === 0) continue;

    html += `<div style="margin-bottom:20px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:12px;">${group.label}</div>
      ${eps.map(ep => renderStatAnalysisCard(ep, study, lib)).join('')}
    </div>`;
  }

  if (!html) {
    html = '<p style="color:var(--cdisc-gray);">No analyses configured. Use the Endpoint How step to add analyses.</p>';
  }

  html += `<div style="margin-top:8px; display:flex; gap:8px;">
    <button class="btn btn-sm btn-secondary esap-edit-btn" data-step="4">Edit in Endpoint How &rarr;</button>
    <button class="btn btn-sm btn-secondary esap-edit-btn" data-step="6">Edit Derivation Pipeline &rarr;</button>
  </div>`;
  return html;
}
```

- [ ] **Step 2: Implement renderStatAnalysisCard per endpoint**

Each card is a `<details>` element that expands to show full analysis configuration:

```javascript
function renderStatAnalysisCard(ep, study, lib) {
  const spec = appState.endpointSpecs?.[ep.id] || {};
  const analyses = spec.selectedAnalyses || [];
  const formalized = buildFormalizedDescription(ep, spec, study);
  const derivChain = spec.derivationChain || [];

  // Build dependency chain visualization
  let derivHtml = '';
  if (derivChain.length > 0) {
    const derivations = lib?.derivationTransformations || [];
    derivHtml = `<div style="margin-top:8px;">
      <div style="font-size:10px; font-weight:600; color:var(--cdisc-gray); text-transform:uppercase; margin-bottom:4px;">Derivation Chain</div>
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:4px;">
        ${derivChain.map(entry => {
          const d = derivations.find(x => x.oid === entry.derivationOid);
          return d ? `<span class="badge badge-teal">${d.name}</span><span style="color:var(--cdisc-gray);">&#9654;</span>` : '';
        }).join('')}
      </div>
    </div>`;
  }

  // Build per-analysis detail
  const analysisHtml = analyses.map(analysis => {
    const transform = getTransformationByOid(analysis.transformationOid);
    if (!transform) return '';

    const method = appState.loadedMethods?.[transform.usesMethod] || null;
    const customBindings = analysis.customInputBindings || [];
    const outputSlots = getOutputMapping(transform, appState.acModel, method, customBindings, analysis.activeInteractions || []);

    // Formula
    const formulaHtml = method?.formula ? renderFormulaExpression(customBindings, method, analysis.activeInteractions || []) : '';

    return `
      <div style="margin-top:8px; padding:8px 12px; border:1px solid var(--cdisc-border); border-radius:var(--radius);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <strong style="font-size:12px;">${transform.name}</strong>
          <span class="badge badge-blue">${transform.usesMethod}</span>
        </div>
        ${formulaHtml ? `<div class="formula-display" style="margin-bottom:8px;">${formulaHtml}</div>` : ''}
        ${outputSlots.length > 0 ? `
        <div style="margin-top:8px;">
          <div style="font-size:10px; font-weight:600; color:var(--cdisc-gray); text-transform:uppercase; margin-bottom:4px;">Outputs</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${outputSlots.map(slot => `
              <div style="padding:4px 8px; border:1px solid var(--cdisc-border); border-radius:var(--radius); font-size:11px;">
                <strong>${slot.patternName}</strong>
                <div style="font-size:9px; color:var(--cdisc-text-secondary);">${slot.constituents.slice(0, 3).join(', ')}</div>
                ${slot.identifiedBy.length > 0 ? `<div style="font-size:9px; color:var(--cdisc-blue);">Indexed by: ${slot.identifiedBy.join(', ')}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>`;
  }).join('');

  return `
    <details style="margin-bottom:12px; border:1px solid var(--cdisc-border); border-radius:var(--radius); overflow:hidden;">
      <summary style="padding:10px 14px; cursor:pointer; background:var(--cdisc-light-gray); font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px;">
        ${ep.name}
        <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}">${ep.level}</span>
        ${analyses.length > 0 ? `<span class="badge badge-blue">${analyses.length} analysis${analyses.length > 1 ? 'es' : ''}</span>` : '<span class="badge" style="background:var(--cdisc-light-gray); color:var(--cdisc-gray);">not configured</span>'}
      </summary>
      <div style="padding:12px 14px;">
        ${formalized ? `<div style="font-size:12px; margin-bottom:8px; padding:8px 12px; background:var(--cdisc-light-blue); border-left:3px solid var(--cdisc-blue); border-radius:var(--radius);">${formalized}</div>` : ''}
        ${derivHtml}
        ${analysisHtml || '<p style="color:var(--cdisc-gray); font-size:12px;">No analysis configured for this endpoint.</p>'}
      </div>
    </details>`;
}
```

- [ ] **Step 3: Verify sections 6-10 render with real data**

Navigate through the app: select study, configure endpoints, add analyses, then go to eSAP. Verify:
- Section 6 shows estimand framework per endpoint
- Section 7 shows endpoints grouped by level
- Section 8 shows analysis populations
- Section 9 shows method details
- Section 10 shows per-endpoint analysis cards with expandable detail

- [ ] **Step 4: Commit**

```bash
git add ac-dc-app/js/views/esap-builder.js
git commit -m "feat: add eSAP core analysis sections (sections 6-10)"
```

---

## Chunk 5: Event Wiring & Navigation

### Task 9: Wire edit buttons and navigation

**Files:**
- Modify: `ac-dc-app/js/views/esap-builder.js`

- [ ] **Step 1: Wire "Edit in Step N" buttons**

Add to the event wiring section:

```javascript
// Edit buttons — navigate to the relevant configuration step
container.querySelectorAll('.esap-edit-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const step = parseInt(btn.dataset.step, 10);
    if (!isNaN(step)) navigateTo(step);
  });
});
```

- [ ] **Step 2: Wire back button to derivation pipeline**

```javascript
container.querySelector('#btn-back-pipeline')?.addEventListener('click', () => navigateTo(6));
```

- [ ] **Step 3: Verify round-trip navigation**

- Click "Edit in Endpoint How" from section 6 → should go to step 4
- Click "Edit in Endpoint What" from section 7 → should go to step 3
- Click "Edit Derivation Pipeline" from section 10 → should go to step 6
- Click "Back to Pipeline" → should go to step 6
- After editing, navigate back to eSAP (step 7) → all sections should reflect updated data

- [ ] **Step 4: Commit**

```bash
git add ac-dc-app/js/views/esap-builder.js
git commit -m "feat: wire eSAP edit buttons and navigation"
```

---

## Verification Checklist

After all tasks:

1. [ ] eSAP renders 14 collapsible sections matching standard SAP ToC
2. [ ] Sections 1-5 show study metadata from USDM
3. [ ] Section 6 shows estimand framework per endpoint with all ICH E9(R1) attributes
4. [ ] Section 7 groups endpoints by level (Primary/Secondary/Safety)
5. [ ] Section 8 shows analysis populations
6. [ ] Section 9 shows all unique statistical methods with input roles and formulas
7. [ ] Section 10 shows per-endpoint analysis cards with derivation chain, formula, output spec, indexed_by
8. [ ] "Link USDM Content" button works on every section
9. [ ] "Edit in Step N" buttons navigate to correct configuration step
10. [ ] Round-trip navigation preserves all state
11. [ ] Existing endpoint→analysis specification workflow is unchanged (steps 1-6)
