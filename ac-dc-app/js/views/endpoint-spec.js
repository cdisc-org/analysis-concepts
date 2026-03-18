import { appState, navigateTo } from '../app.js';
import {
  getAllEndpoints, getBiomedicalConcepts,
  getVisitLabels, getPopulationNames, getArmNames,
  getEndpointParameterOptions
} from '../utils/usdm-parser.js';

export const DATA_TYPES = ['Quantity', 'CodeableConcept', 'Ordinal', 'Boolean', 'DateTime', 'Duration'];

/**
 * Dimensions that are handled as their own dedicated section (Parameter)
 * or are implicit and never shown in the dimension grid (Subject).
 */
export const SKIP_IN_DIM_GRID = new Set(['Subject', 'Parameter']);

/**
 * Shared dimensions for Observation concepts from the OC Instance Model.
 * These mirror the DC model's dimensionalRelationships structure so that
 * the same dimension grid rendering code works for both paths.
 */
export const OBSERVATION_DIMENSIONS = {
  AnalysisVisit: { role: 'context', cardinality: '0..*' },
  Population:    { role: 'scope',   cardinality: '0..1' },
  Treatment:     { role: 'scope',   cardinality: '0..1' }
};

/**
 * Maps derivation placeholder names to analysis dimension names.
 * Used to sync derivation config values to analysis dimensional slices.
 */
export const PLACEHOLDER_DIM_MAP = {
  visit: 'AnalysisVisit',
  population: 'Population',
  treatment: 'Treatment'
};

/**
 * Maps result pattern names (optionally qualified by method suffix) to
 * natural-language summary measure phrases for ICH E9(R1) estimand sentences.
 *
 * Key format: "PatternName" or "PatternName:MethodSuffix" for disambiguation.
 * Lookup order: try qualified key first, then fall back to unqualified.
 */
export const SUMMARY_MEASURE_PHRASES = {
  'Contrasts':              'difference in adjusted mean',
  'HazardRatioEstimates':   'hazard ratio for',
  'TestResult:LogRankTest':  'comparison of survival distributions for',
  'TestResult:ChiSquaredTest': 'comparison of proportions of',
  'TestResult':             'test of',
  'ComputedValue':          'descriptive summary of',
  'MedianSurvival':         'median survival time for',
  'LSMeans':                'adjusted mean',
  'OddsRatioEstimates':     'odds ratio for',
  'SurvivalTable':          'survival probability for'
};

/**
 * Auto-inference rules: maps acCategory to the preferred summary measure
 * result pattern name. Used when the user first selects an analysis
 * transformation to pre-tag the most likely estimand summary measure.
 */
const SUMMARY_MEASURE_DEFAULTS = {
  'TreatmentComparison':  'Contrasts',
  'SurvivalAnalysis':     'HazardRatioEstimates',
  'DescriptiveSummary':   'ComputedValue'
};

/**
 * Infer the default summary measure pattern for an analysis transformation.
 * Checks the transformation's acCategory against SUMMARY_MEASURE_DEFAULTS,
 * then verifies the pattern actually exists in methodOutputSlotMapping.
 */
export function inferDefaultSummaryPattern(transform) {
  if (!transform?.methodOutputSlotMapping) return null;
  const outputPatterns = Object.values(transform.methodOutputSlotMapping);
  const preferred = SUMMARY_MEASURE_DEFAULTS[transform.acCategory];
  if (preferred && outputPatterns.includes(preferred)) return preferred;
  // Fallback: if only one output pattern, use it
  if (outputPatterns.length === 1) return outputPatterns[0];
  return null;
}

/**
 * Build concept category options from the DC model.
 */
export function getConceptCategoryOptions() {
  const dcModel = appState.dcModel;
  if (!dcModel?.categories) return [];

  const options = [];
  // Observation (OC) — direct observation, no derivation
  options.push({ value: 'Observation', label: 'Observation (OC)', category: 'Observation' });
  for (const [catName, cat] of Object.entries(dcModel.categories)) {
    for (const conceptName of Object.keys(cat.concepts || {})) {
      const prefixed = `C.${conceptName}`;
      options.push({ value: prefixed, label: `${prefixed} (${catName})`, category: catName });
    }
  }
  return options;
}

/**
 * Get the category name and info for a concept from the DC model.
 * Returns { categoryName, category, concept } or null.
 */
export function getCategoryInfo(conceptCategory) {
  const dcModel = appState.dcModel;
  if (!dcModel?.categories || !conceptCategory) return null;

  const bare = conceptCategory.startsWith('C.') ? conceptCategory.slice(2) : conceptCategory;
  for (const [catName, cat] of Object.entries(dcModel.categories)) {
    if (cat.concepts?.[bare]) {
      return { categoryName: catName, category: cat, concept: cat.concepts[bare] };
    }
  }
  return null;
}

/**
 * Get dimensional relationships for a concept category from the DC model.
 */
export function getDimensionalRelationships(conceptCategory) {
  const info = getCategoryInfo(conceptCategory);
  return info?.category?.dimensionalRelationships || null;
}

/**
 * Get dropdown options for a dimension from USDM study data.
 * Returns an array of strings, or null if the dimension is manual-only.
 */
export function getDimensionOptions(dimName, study) {
  switch (dimName) {
    case 'AnalysisVisit':
    case 'Timing':
      return getVisitLabels(study);
    case 'Treatment': {
      const arms = getArmNames(study);
      const combos = [];
      for (let i = 0; i < arms.length; i++) {
        for (let j = i + 1; j < arms.length; j++) {
          combos.push(`${arms[i]} vs ${arms[j]}`);
        }
      }
      if (arms.length > 2) combos.push(arms.join(' vs '));
      return [...arms, ...combos];
    }
    case 'Population':
      return getPopulationNames(study);
    default:
      return null;
  }
}

/**
 * Get the parameter value from the spec only — linked BCs or manual name.
 * Does NOT fall back to endpoint text.
 */
export function getSpecParameterValue(epId, spec, study) {
  if (!spec) return null;
  if (spec.linkedBCIds?.length > 0) {
    const bcIndex = new Map((study.biomedicalConcepts || []).map(bc => [bc.id, bc]));
    const names = spec.linkedBCIds.map(id => bcIndex.get(id)?.name).filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }
  if (spec.parameterName) return spec.parameterName;
  return null;
}

/**
 * Build the syntax template string from the endpoint spec.
 *
 * When a transformation is selected (spec.selectedTransformationOid), uses the
 * transformation's endpoint SmartPhrase as the base template. Otherwise falls
 * back to DC model category-aware structure:
 *
 *   PointComputation:    {Concept} of {Parameter} at {Visit} ...
 *   Comparison:          {Concept} in {Parameter} at {Visit} ...
 *   SequenceAggregate:   {Concept} of {Parameter} over {Timing} ...
 *   EventAggregate:      {Concept} of {Parameter} ...
 *   Classification:      {Concept} of {Parameter} ...
 *
 * Optional dimensions (cardinality 0..1) only appear when they have a value.
 */
export function buildSyntaxTemplate(ep, spec, study) {
  if (!spec?.conceptCategory) return null;

  // === Transformation-driven mode (derivation + analysis) ===
  if (spec.selectedTransformationOid || spec.selectedDerivationOid) {
    const analysisTransform = spec.selectedTransformationOid
      ? getTransformationByOid(spec.selectedTransformationOid)
      : null;
    const derivTransform = spec.selectedDerivationOid
      ? getDerivationTransformationByOid(spec.selectedDerivationOid)
      : null;
    // Use derivation-aware builder when we have either piece
    if (analysisTransform || derivTransform) {
      return buildTransformationSyntaxTemplate(ep, spec, study, analysisTransform, derivTransform);
    }
  }

  // === Fallback: DC model category-based mode ===
  const catInfo = getCategoryInfo(spec.conceptCategory);
  if (!catInfo) {
    // Observation concept — include dimensional context when present
    if (spec.conceptCategory === 'Observation') {
      const paramValue = getSpecParameterValue(ep.id, spec, study);
      const conceptLabel = 'Observation';
      const dimValues = spec.dimensionValues || {};

      let template = `${conceptLabel} of {Parameter}`;
      let resolved = paramValue
        ? `<span class="badge badge-teal" style="font-size:12px; vertical-align:middle;">${conceptLabel}</span> of <strong>${paramValue}</strong>`
        : `<span class="badge badge-teal" style="font-size:12px; vertical-align:middle;">${conceptLabel}</span> of <span class="placeholder">{Parameter}</span>`;

      // Append dimensional parts when values are set
      if (dimValues.AnalysisVisit) {
        template += ` at {AnalysisVisit}`;
        resolved += ` at <strong>${dimValues.AnalysisVisit}</strong>`;
      }
      if (dimValues.Population) {
        template += ` in the {Population} population`;
        resolved += ` in the <strong>${dimValues.Population}</strong> population`;
      }
      if (dimValues.Treatment) {
        template += ` comparing {Treatment}`;
        resolved += ` comparing <strong>${dimValues.Treatment}</strong>`;
      }

      return { template, resolved };
    }
    return null;
  }

  const dimRels = catInfo.category.dimensionalRelationships;
  if (!dimRels) return null;

  const dimValues = spec.dimensionValues || {};
  const paramValue = getSpecParameterValue(ep.id, spec, study);
  const categoryName = catInfo.categoryName;

  // Category-specific structural parts come first
  const templateParts = [];
  const resolvedParts = [];

  function addPart(prep, key, suffix, value) {
    const fullTemplate = `${prep} {${key}}${suffix ? ' ' + suffix : ''}`;
    templateParts.push(fullTemplate);
    if (value) {
      resolvedParts.push(`${prep} <strong>${value}</strong>${suffix ? ' ' + suffix : ''}`);
    } else {
      resolvedParts.push(`${prep} <span class="placeholder">{${key}}</span>${suffix ? ' ' + suffix : ''}`);
    }
  }

  function addOptionalPart(prep, key, suffix, value) {
    if (!value) return; // Optional: skip entirely when empty
    addPart(prep, key, suffix, value);
  }

  // === Category-specific structure ===

  if (categoryName === 'Comparison') {
    // "Change in {Parameter} at {AnalysisVisit} ..."
    addPart('in', 'Parameter', '', paramValue);
  } else if (categoryName === 'SequenceAggregate') {
    // "PeakValue of {Parameter} over {Timing} ..."
    addPart('of', 'Parameter', '', paramValue);
    // Timing has role "order" in SequenceAggregate — use "over" not "at"
    if (dimRels.Timing) {
      const timingVal = dimValues.Timing || dimValues.AnalysisVisit || null;
      const isOptional = dimRels.Timing.cardinality === '0..1';
      if (isOptional) {
        addOptionalPart('over', 'Timing', '', timingVal);
      } else {
        addPart('over', 'Timing', '', timingVal);
      }
    }
  } else {
    // PointComputation, EventAggregate, Classification:
    // "{Concept} of {Parameter} ..."
    addPart('of', 'Parameter', '', paramValue);
  }

  // === Remaining dimensions (skip already-handled ones) ===
  const handledDims = new Set(['Subject', 'Parameter']);
  if (categoryName === 'SequenceAggregate') {
    handledDims.add('Timing');
  }

  const dimOrder = ['AnalysisVisit', 'Timing', 'Population', 'Treatment', 'Period'];
  const dimPrep = {
    AnalysisVisit: 'at',
    Timing:        'at',
    Population:    'in the',
    Treatment:     'comparing',
    Period:        'during'
  };
  const dimSuffix = { Population: 'population' };

  for (const dim of dimOrder) {
    if (handledDims.has(dim)) continue;
    const rel = dimRels[dim];
    if (!rel) continue;
    if (rel.cardinality === '0') continue;
    // Skip Timing when AnalysisVisit is also present (redundant source)
    if (dim === 'Timing' && dimRels['AnalysisVisit']) continue;

    const isOptional = rel.cardinality === '0..1';
    const value = dimValues[dim] || null;
    const prep = dimPrep[dim] || '';
    const suffix = dimSuffix[dim] || '';

    if (isOptional) {
      addOptionalPart(prep, dim, suffix, value);
    } else {
      addPart(prep, dim, suffix, value);
    }
  }

  const conceptLabel = spec.conceptCategory;
  const template = `${conceptLabel} ${templateParts.join(' ')}`;
  const resolved = `<span class="badge badge-teal" style="font-size:12px; vertical-align:middle;">${conceptLabel}</span> ${resolvedParts.join(' ')}`;

  return { template, resolved };
}

/**
 * Build syntax template driven by selected derivation and/or analysis transformation.
 * The "What" comes from the derivation's endpoint SmartPhrase.
 * The "How" comes from the analysis transformation's dimensional slices.
 * Falls back to the analysis transformation's endpoint SmartPhrase if no derivation.
 */
function buildTransformationSyntaxTemplate(ep, spec, study, analysisTransform, derivTransform) {
  const lib = appState.transformationLibrary;
  const dimValues = spec.dimensionValues || {};
  const configVals = spec.derivationConfigValues || {};
  const paramValue = getSpecParameterValue(ep.id, spec, study);

  // Find the endpoint-context SmartPhrase — prefer derivation, fall back to analysis
  let endpointPhrase = getDerivationEndpointPhrase(derivTransform);
  if (!endpointPhrase && analysisTransform) {
    endpointPhrase = (lib?.smartPhrases || []).find(sp =>
      sp.role === 'endpoint' && (analysisTransform.validSmartPhrases || []).includes(sp.oid)
    );
  }

  const templateParts = [];
  const resolvedParts = [];

  if (endpointPhrase) {
    // Use the SmartPhrase's phrase_template as the base
    let tpl = endpointPhrase.phrase_template;
    let resolved = endpointPhrase.phrase_template;

    // Resolve {parameter} placeholder
    if (tpl.includes('{parameter}')) {
      tpl = tpl.replace('{parameter}', '{Parameter}');
      resolved = paramValue
        ? resolved.replace('{parameter}', `<strong>${paramValue}</strong>`)
        : resolved.replace('{parameter}', '<span class="placeholder">{Parameter}</span>');
    }

    // Resolve {event} placeholder
    if (tpl.includes('{event}')) {
      const eventVal = configVals.event || dimValues.event || dimValues.Event || null;
      tpl = tpl.replace('{event}', '{Event}');
      resolved = eventVal
        ? resolved.replace('{event}', `<strong>${eventVal}</strong>`)
        : resolved.replace('{event}', '<span class="placeholder">{Event}</span>');
    }

    // Resolve all remaining derivation config placeholders
    for (const [key, val] of Object.entries(configVals)) {
      if (key === 'parameter' || key === 'event') continue;
      const ph = `{${key}}`;
      if (tpl.includes(ph)) {
        tpl = tpl.replace(ph, `{${key.charAt(0).toUpperCase() + key.slice(1)}}`);
        resolved = val
          ? resolved.replace(ph, `<strong>${val}</strong>`)
          : resolved.replace(ph, `<span class="placeholder">${ph}</span>`);
      }
    }

    templateParts.push(tpl);
    resolvedParts.push(resolved);
  } else {
    // No endpoint SmartPhrase — use concept category and parameter
    templateParts.push('of {Parameter}');
    resolvedParts.push(paramValue
      ? `of <strong>${paramValue}</strong>`
      : 'of <span class="placeholder">{Parameter}</span>'
    );
  }

  // Append configurable dimensional slices from the analysis transformation
  const dimPrep = {
    AnalysisVisit: 'at',
    Timing:        'at',
    Population:    'in the',
    Treatment:     'comparing',
    Period:        'during'
  };
  const dimSuffix = { Population: 'population' };

  const sliceKeys = analysisTransform?.sliceKeys || [];
  for (const sk of sliceKeys) {
    const dim = sk.dimension;
    if (SKIP_IN_DIM_GRID.has(dim)) continue;

    const value = dimValues[dim] || null;
    const prep = dimPrep[dim] || '';
    const suffix = dimSuffix[dim] || '';

    if (!value) continue;

    const fullTemplate = `${prep} {${dim}}${suffix ? ' ' + suffix : ''}`;
    templateParts.push(fullTemplate);
    resolvedParts.push(`${prep} <strong>${value}</strong>${suffix ? ' ' + suffix : ''}`);
  }

  const conceptLabel = spec.conceptCategory;
  const template = `${conceptLabel} ${templateParts.join(' ')}`;
  const resolved = `<span class="badge badge-teal" style="font-size:12px; vertical-align:middle;">${conceptLabel}</span> ${resolvedParts.join(' ')}`;

  return { template, resolved };
}

/**
 * Build a plain-text version of the syntax template (no HTML).
 * Used by SmartPhrase builder for composing the full analysis sentence.
 */
export function buildSyntaxTemplatePlainText(ep, spec, study) {
  const result = buildSyntaxTemplate(ep, spec, study);
  if (!result) return '';
  return result.resolved.replace(/<[^>]+>/g, '').trim();
}


// ===== Main render =====

export function renderEndpointSpec(container) {
  const study = appState.selectedStudy;
  if (!study) { navigateTo(1); return; }

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));
  if (selectedEps.length === 0) { navigateTo(2); return; }

  if (!appState.endpointSpecs) appState.endpointSpecs = {};

  const conceptOptions = getConceptCategoryOptions();
  const hasAnySpec = selectedEps.some(ep => appState.endpointSpecs[ep.id]?.conceptCategory);

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Endpoint Specification</h2>
        <p style="color:var(--cdisc-gray); font-size:13px; margin-top:4px;">
          Decompose protocol endpoints into concept structure and dimensional values
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-overview">&larr; Back to Overview</button>
        <button class="btn btn-primary" id="btn-proceed-esap" ${!hasAnySpec ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
          Proceed to eSAP &rarr;
        </button>
      </div>
    </div>

    ${selectedEps.map((ep, i) => renderEndpointCard(ep, i === 0, conceptOptions, study)).join('')}

    <style>
      .ep-spec-card.open .ep-spec-body { display: block !important; }
      .ep-spec-card.open .ep-spec-arrow { transform: rotate(90deg); }
      .ep-syntax-template {
        font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 12px;
        background: var(--cdisc-light-gray);
        padding: 10px 14px;
        border-radius: var(--radius);
        color: var(--cdisc-text-secondary);
        letter-spacing: 0.2px;
        line-height: 1.6;
        margin-bottom: 4px;
      }
      .ep-syntax-resolved {
        font-size: 13px;
        padding: 12px 16px;
        border: 1px solid var(--cdisc-border);
        border-radius: var(--radius);
        line-height: 1.8;
        color: var(--cdisc-text);
      }
      .ep-syntax-resolved .placeholder {
        color: var(--cdisc-gray);
        font-style: italic;
        background: var(--cdisc-light-gray);
        padding: 1px 6px;
        border-radius: 3px;
      }
      .ep-syntax-resolved strong {
        color: var(--cdisc-blue);
      }
      .ep-dim-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
      }
      .ep-derivation-card:hover, .ep-transform-card:hover {
        border-color: var(--cdisc-blue) !important;
      }
      .ep-output-pattern-card:hover {
        border-color: var(--cdisc-teal, #00857c) !important;
        background: rgba(0,133,124,0.03) !important;
      }
      .ep-oc-facet-card { transition: border-color 0.15s, background 0.15s; }
      .ep-oc-facet-card:hover { border-color: var(--cdisc-blue) !important; }
      .ep-derivation-config { margin-top: 12px; }
      .ep-composed-phrase {
        font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 12px;
        background: var(--cdisc-light-blue);
        padding: 10px 14px;
        border-radius: var(--radius);
        line-height: 1.6;
        border-left: 3px solid var(--cdisc-blue);
        margin-bottom: 12px;
      }
      .ep-composed-phrase .placeholder {
        color: var(--cdisc-gray);
        font-style: italic;
        background: var(--cdisc-light-gray);
        padding: 1px 6px;
        border-radius: 3px;
      }
      .ep-composed-phrase strong {
        color: var(--cdisc-blue);
      }
      .ep-placeholder-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
        margin-bottom: 12px;
      }
    </style>
  `;

  wireEventHandlers(container, study);
}

function wireEventHandlers(container, study) {
  // Accordion toggles
  container.querySelectorAll('.ep-spec-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('open');
    });
  });

  // Concept category
  container.querySelectorAll('.ep-concept-category').forEach(select => {
    select.addEventListener('change', () => {
      const epId = select.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].conceptCategory = select.value;
      // Reset all downstream selections when category changes
      appState.endpointSpecs[epId].selectedDerivationOid = null;
      appState.endpointSpecs[epId].selectedTransformationOid = null;
      appState.endpointSpecs[epId].selectedAnalyses = [];
      appState.endpointSpecs[epId].estimandSummaryPattern = null;
      appState.endpointSpecs[epId].customInputBindings = null;
      appState.endpointSpecs[epId].activeInteractions = [];
      appState.endpointSpecs[epId].dimensionValues = {};
      appState.endpointSpecs[epId].selectedOcFacet = null;
      appState.endpointSpecs[epId].derivationConfigValues = {};
      appState.endpointSpecs[epId].derivationDimensionValues = {};
      renderEndpointSpec(container);
    });
  });

  // Data type
  container.querySelectorAll('.ep-data-type').forEach(select => {
    select.addEventListener('change', () => {
      const epId = select.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].dataType = select.value;
    });
  });

  // Parameter source radios
  container.querySelectorAll('.ep-param-source').forEach(radio => {
    radio.addEventListener('change', () => {
      const epId = radio.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].parameterSource = radio.value;
      renderEndpointSpec(container);
    });
  });

  // BC checkboxes
  container.querySelectorAll('.ep-bc-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = cb.dataset.epId;
      const bcId = cb.dataset.bcId;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      if (cb.checked) {
        if (!spec.linkedBCIds.includes(bcId)) spec.linkedBCIds.push(bcId);
      } else {
        spec.linkedBCIds = spec.linkedBCIds.filter(id => id !== bcId);
      }
      updateSyntaxPreview(container, epId, study);
    });
  });

  // BC toggle all
  container.querySelectorAll('.ep-bc-select-all').forEach(btn => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.epId;
      ensureSpec(epId);
      const spec = appState.endpointSpecs[epId];
      const checkboxes = container.querySelectorAll(`.ep-bc-checkbox[data-ep-id="${epId}"]`);
      const allChecked = [...checkboxes].every(cb => cb.checked);
      checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        const bcId = cb.dataset.bcId;
        if (!allChecked) {
          if (!spec.linkedBCIds.includes(bcId)) spec.linkedBCIds.push(bcId);
        } else {
          spec.linkedBCIds = spec.linkedBCIds.filter(id => id !== bcId);
        }
      });
      updateSyntaxPreview(container, epId, study);
    });
  });

  // Manual parameter name
  container.querySelectorAll('.ep-param-name').forEach(input => {
    input.addEventListener('input', () => {
      const epId = input.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].parameterName = input.value;
      updateSyntaxPreview(container, epId, study);
    });
  });

  // Derivation transformation selection
  container.querySelectorAll('.ep-derivation-card').forEach(card => {
    card.addEventListener('click', () => {
      const epId = card.dataset.epId;
      const oid = card.dataset.derivationOid;
      ensureSpec(epId);
      appState.endpointSpecs[epId].selectedDerivationOid = oid;
      // Reset analysis selection — available analysis methods may differ
      appState.endpointSpecs[epId].selectedTransformationOid = null;
      appState.endpointSpecs[epId].selectedAnalyses = [];
      appState.endpointSpecs[epId].estimandSummaryPattern = null;
      appState.endpointSpecs[epId].customInputBindings = null;
      appState.endpointSpecs[epId].activeInteractions = [];
      appState.endpointSpecs[epId].dimensionValues = {};
      appState.endpointSpecs[epId].derivationConfigValues = {};
      appState.endpointSpecs[epId].derivationDimensionValues = {};
      renderEndpointSpec(container);
    });
  });

  // Analysis transformation selection
  container.querySelectorAll('.ep-transform-card').forEach(card => {
    card.addEventListener('click', () => {
      const epId = card.dataset.epId;
      const oid = card.dataset.transformOid;
      ensureSpec(epId);
      appState.endpointSpecs[epId].selectedTransformationOid = oid;
      // Also populate selectedAnalyses for multi-analysis support
      const selectedTransform = getTransformationByOid(oid);
      appState.endpointSpecs[epId].selectedAnalyses = [{
        transformationOid: oid,
        customInputBindings: selectedTransform ? JSON.parse(JSON.stringify(
          (selectedTransform.bindings || []).filter(b => b.direction !== 'output')
        )) : null,
        activeInteractions: [],
        estimandSummaryPattern: null
      }];
      appState.endpointSpecs[epId].customInputBindings = appState.endpointSpecs[epId].selectedAnalyses[0].customInputBindings;
      appState.endpointSpecs[epId].activeInteractions = [];
      // Reset dimension values and summary measure — slice structure may differ
      appState.endpointSpecs[epId].estimandSummaryPattern = null;
      appState.endpointSpecs[epId].dimensionValues = {};
      renderEndpointSpec(container);
    });
  });

  // Dimension value dropdowns and inputs
  container.querySelectorAll('.ep-dim-value').forEach(el => {
    const handler = () => {
      const epId = el.dataset.epId;
      const dim = el.dataset.dim;
      ensureSpec(epId);
      appState.endpointSpecs[epId].dimensionValues[dim] = el.value;
      updateSyntaxPreview(container, epId, study);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });

  // Output pattern cards — estimand summary measure selection
  container.querySelectorAll('.ep-output-pattern-card').forEach(card => {
    card.addEventListener('click', () => {
      const epId = card.dataset.epId;
      const patternName = card.dataset.patternName;
      ensureSpec(epId);
      appState.endpointSpecs[epId].estimandSummaryPattern = patternName;
      updateSyntaxPreview(container, epId, study);
      // Update card highlights without full re-render
      const allCards = container.querySelectorAll(`.ep-output-pattern-card[data-ep-id="${epId}"]`);
      allCards.forEach(c => {
        const isSel = c.dataset.patternName === patternName;
        c.style.borderColor = isSel ? 'var(--cdisc-teal, #00857c)' : 'var(--cdisc-border)';
        c.style.background = isSel ? 'rgba(0,133,124,0.06)' : 'white';
        const badge = c.querySelector('.ep-summary-badge');
        if (badge) badge.style.display = isSel ? 'inline-block' : 'none';
      });
    });
  });

  // OC facet card click — sets analysis target
  container.querySelectorAll('.ep-oc-facet-card').forEach(card => {
    card.addEventListener('click', () => {
      const epId = card.dataset.epId;
      const facet = card.dataset.facet;
      ensureSpec(epId);
      appState.endpointSpecs[epId].selectedOcFacet = facet;
      // Update card highlights inline
      const allCards = container.querySelectorAll(`.ep-oc-facet-card[data-ep-id="${epId}"]`);
      allCards.forEach(c => {
        const isSel = c.dataset.facet === facet;
        c.style.borderColor = isSel ? 'var(--cdisc-blue)' : 'var(--cdisc-border)';
        c.style.background = isSel ? 'var(--cdisc-light-blue)' : 'white';
        // Update star
        const starSpan = c.querySelector('strong')?.previousElementSibling;
        if (starSpan && starSpan.textContent.includes('★')) {
          starSpan.remove();
        }
        if (isSel) {
          const strong = c.querySelector('strong');
          if (strong && !strong.previousElementSibling?.textContent?.includes('★')) {
            const star = document.createElement('span');
            star.style.cssText = 'font-size:12px; color:var(--cdisc-blue);';
            star.innerHTML = '&#9733;';
            strong.parentElement.insertBefore(star, strong);
          }
        }
      });
      updateSyntaxPreview(container, epId, study);
    });
  });

  // Derivation config placeholder inputs
  container.querySelectorAll('.ep-deriv-config-value').forEach(el => {
    const handler = () => {
      const epId = el.dataset.epId;
      const key = el.dataset.configKey;
      ensureSpec(epId);
      appState.endpointSpecs[epId].derivationConfigValues[key] = el.value;
      // Sync to analysis dimensions if mapped
      const dimName = PLACEHOLDER_DIM_MAP[key];
      if (dimName && el.value) {
        appState.endpointSpecs[epId].dimensionValues[dimName] = el.value;
      }
      updateSyntaxPreview(container, epId, study);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });

  // Derivation dimension inputs
  container.querySelectorAll('.ep-deriv-dim-value').forEach(el => {
    const handler = () => {
      const epId = el.dataset.epId;
      const dim = el.dataset.dim;
      ensureSpec(epId);
      appState.endpointSpecs[epId].derivationDimensionValues[dim] = el.value;
      // Also sync to main dimension values
      appState.endpointSpecs[epId].dimensionValues[dim] = el.value;
      updateSyntaxPreview(container, epId, study);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });

  // Derivation notes
  container.querySelectorAll('.ep-deriv-note').forEach(input => {
    input.addEventListener('input', () => {
      const epId = input.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].derivationNote = input.value;
    });
  });

  // Use in eSAP checkbox
  container.querySelectorAll('.ep-use-esap').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = cb.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].useInEsap = cb.checked;
    });
  });

  // Write back to USDM checkbox
  container.querySelectorAll('.ep-write-usdm').forEach(cb => {
    cb.addEventListener('change', () => {
      const epId = cb.dataset.epId;
      ensureSpec(epId);
      appState.endpointSpecs[epId].writeBackToUsdm = cb.checked;

      if (cb.checked) {
        // Write formalized description back to the USDM endpoint object
        const ep = getAllEndpoints(study).find(e => e.id === epId);
        const spec = appState.endpointSpecs[epId];
        if (ep && spec) {
          const formalized = buildFormalizedDescription(ep, spec, study);
          if (formalized) {
            ep.text = formalized;
          }
        }
      }
      renderEndpointSpec(container);
    });
  });

  // Navigation
  const hasAnySpec = [...container.querySelectorAll('.ep-concept-category')]
    .some(s => s.value);
  container.querySelector('#btn-back-overview').addEventListener('click', () => navigateTo(2));
  container.querySelector('#btn-proceed-esap').addEventListener('click', () => {
    if (hasAnySpec) navigateTo(4);
  });
}

/**
 * Update just the syntax preview without full re-render.
 */
// ===== Estimand Framework HTML builder =====

export function buildEstimandFrameworkHtml(ep, spec, study, estimandDesc) {
  const dimValues = spec?.dimensionValues || {};
  const paramValue = getSpecParameterValue(ep.id, spec, study);

  // Derive variable/endpoint description (includes timing — ICH E9(R1) Variable attribute)
  const derivation = spec?.selectedDerivationOid
    ? getDerivationTransformationByOid(spec.selectedDerivationOid) : null;
  const derivName = derivation?.name || null;
  const visitVal = dimValues.AnalysisVisit || dimValues.Timing || null;
  let variableDesc = '';
  if (derivName && paramValue) {
    variableDesc = `${derivName} of ${paramValue}`;
  } else if (derivName) {
    variableDesc = derivName;
  } else if (paramValue) {
    variableDesc = paramValue;
  }
  if (variableDesc && visitVal) {
    variableDesc += ` at ${visitVal}`;
  }

  // Population
  const popVal = dimValues.Population || null;

  // Treatment — check dimValues first, then fall back to analysis bindings
  let treatmentVal = dimValues.Treatment || null;
  if (!treatmentVal) {
    // Look for treatment in per-analysis bindings (it's a fixed_effect, not a sliceKey)
    const analyses = spec?.selectedAnalyses || [];
    for (const analysis of analyses) {
      const bindings = analysis.customInputBindings || [];
      const treatBinding = bindings.find(b =>
        b.concept === 'Treatment' && b.dataStructureRole === 'dimension'
      );
      if (treatBinding?.qualifierValue) {
        treatmentVal = `${treatBinding.concept} (${treatBinding.qualifierValue})`;
        break;
      } else if (treatBinding) {
        treatmentVal = treatBinding.concept;
        break;
      }
    }
  }

  // Summary measure
  const transform = spec?.selectedTransformationOid
    ? getTransformationByOid(spec.selectedTransformationOid) : null;
  let summaryPhrase = null;
  if (spec?.estimandSummaryPattern && transform) {
    summaryPhrase = getSummaryMeasurePhrase(spec.estimandSummaryPattern, transform.usesMethod);
  }

  // Estimator (the method)
  const estimatorMethod = transform?.usesMethod || null;

  const unspecified = '<span style="color:var(--cdisc-gray); font-style:italic;">not specified</span>';
  const notAddressed = '<span style="color:var(--cdisc-warning, #d97706); font-style:italic;">not yet addressed</span>';

  const attrRow = (label, value, icon) => `
    <tr>
      <td style="width:180px; padding:6px 10px; font-weight:600; font-size:11px; color:var(--cdisc-text-secondary); vertical-align:top;">${icon} ${label}</td>
      <td style="padding:6px 10px; font-size:12px;">${value || unspecified}</td>
    </tr>`;

  return `
    <div style="border:1px solid rgba(0,133,124,0.2); border-radius:var(--radius); overflow:hidden;">
      ${estimandDesc ? `
      <div style="padding:10px 14px; background:rgba(0,133,124,0.06); border-bottom:1px solid rgba(0,133,124,0.15); font-size:12px; line-height:1.5; font-weight:500; border-left:3px solid var(--cdisc-teal);">
        ${estimandDesc}
      </div>` : ''}
      <table style="width:100%; border-collapse:collapse;">
        <tbody>
          ${attrRow('Population', popVal ? `<code>${popVal}</code>` : null, '&#9632;')}
          ${attrRow('Treatment', treatmentVal ? `<code>${treatmentVal}</code>` : null, '&#9632;')}
          ${attrRow('Variable (Endpoint)', variableDesc ? `<code>${variableDesc}</code>` : null, '&#9632;')}
          ${attrRow('Population-level Summary', summaryPhrase || null, '&#9632;')}
          ${attrRow('Intercurrent Events', notAddressed, '&#9633;')}
        </tbody>
      </table>
      <div style="padding:6px 14px; background:var(--cdisc-light-gray); border-top:1px solid var(--cdisc-border); display:flex; align-items:center; gap:8px;">
        <span style="font-size:10px; font-weight:600; color:var(--cdisc-gray); text-transform:uppercase; letter-spacing:0.5px;">Estimator</span>
        <span style="font-size:11px;">${estimatorMethod ? `<code>${estimatorMethod}</code>` : unspecified}</span>
      </div>
    </div>`;
}

export function updateSyntaxPreview(container, epId, study) {
  const ep = getAllEndpoints(study).find(e => e.id === epId);
  const spec = appState.endpointSpecs[epId];
  if (!ep || !spec) return;

  // Update syntax template
  const el = container.querySelector(`#syntax-preview-${CSS.escape(epId)}`);
  if (el) {
    const syntax = buildSyntaxTemplate(ep, spec, study);
    if (syntax) {
      el.innerHTML = `
        <div class="ep-syntax-template">${syntax.template}</div>
        <div class="ep-syntax-resolved">${syntax.resolved}</div>
      `;
    }
  }

  // Update formalized description and write-back
  const formalized = buildFormalizedDescription(ep, spec, study);
  const formalEl = container.querySelector(`#formalized-${CSS.escape(epId)}`);
  if (formalEl) {
    formalEl.innerHTML = formalized || '<span style="color:var(--cdisc-gray); font-style:italic;">Complete the What + How sections above</span>';
  }
  if (spec.writeBackToUsdm && formalized) {
    ep.text = formalized;
  }

  // Update estimand framework
  const estimandDesc = buildEstimandDescription(ep, spec, study);
  const estimandEl = container.querySelector(`#estimand-${CSS.escape(epId)}`);
  if (estimandEl) {
    estimandEl.innerHTML = buildEstimandFrameworkHtml(ep, spec, study, estimandDesc);
  }
}

/**
 * Classify BC properties into OC facets using the oc_bc_property_mapping.
 * Returns an array of property objects augmented with ocFacet and ocRole.
 */
export function classifyBcProperties(bc) {
  const mapping = appState.ocBcMapping?.mappings || {};
  const eventFacets = appState.ocBcMapping?.eventObservationFacets || {};
  const classified = [];

  for (const prop of bc.properties || []) {
    const code = prop.code?.standardCode?.code;
    let facet = 'Identification.Topic'; // default
    let role = 'identity';

    for (const [facetPath, facetDef] of Object.entries(mapping)) {
      if (facetDef.matchesCodes?.includes(code)) {
        facet = facetPath;
        role = facetDef.role;
        break;
      }
    }
    // Also check event facets
    if (facet === 'Identification.Topic' && role === 'identity') {
      for (const [facetName, facetDef] of Object.entries(eventFacets)) {
        if (facetDef.matchesCodes?.includes(code)) {
          facet = facetName;
          role = facetDef.role;
          break;
        }
      }
    }

    classified.push({ ...prop, ocFacet: facet, ocRole: role });
  }
  return classified;
}

export function ensureSpec(epId) {
  if (!appState.endpointSpecs[epId]) {
    appState.endpointSpecs[epId] = {
      conceptCategory: '',
      dataType: 'Quantity',
      parameterSource: 'bc',
      parameterName: '',
      linkedBCIds: [],
      dimensionValues: {},
      derivationNote: '',
      selectedTransformationOid: null,
      selectedDerivationOid: null,
      useInEsap: true,
      writeBackToUsdm: false
    };
  }
  if (!appState.endpointSpecs[epId].dimensionValues) {
    appState.endpointSpecs[epId].dimensionValues = {};
  }
  // Backfill new fields for specs created before this version
  if (appState.endpointSpecs[epId].selectedDerivationOid === undefined) {
    appState.endpointSpecs[epId].selectedDerivationOid = null;
  }
  if (appState.endpointSpecs[epId].useInEsap === undefined) {
    appState.endpointSpecs[epId].useInEsap = true;
  }
  if (appState.endpointSpecs[epId].writeBackToUsdm === undefined) {
    appState.endpointSpecs[epId].writeBackToUsdm = false;
  }
  if (appState.endpointSpecs[epId].estimandSummaryPattern === undefined) {
    appState.endpointSpecs[epId].estimandSummaryPattern = null;
  }
  // New fields for OC facet and derivation config
  if (appState.endpointSpecs[epId].selectedOcFacet === undefined) {
    appState.endpointSpecs[epId].selectedOcFacet = null;
  }
  if (!appState.endpointSpecs[epId].derivationConfigValues) {
    appState.endpointSpecs[epId].derivationConfigValues = {};
  }
  if (!appState.endpointSpecs[epId].derivationDimensionValues) {
    appState.endpointSpecs[epId].derivationDimensionValues = {};
  }
  // Multi-analysis support: migrate from single selectedTransformationOid to selectedAnalyses array
  if (!appState.endpointSpecs[epId].selectedAnalyses) {
    const spec = appState.endpointSpecs[epId];
    if (spec.selectedTransformationOid) {
      // Migrate existing single selection
      appState.endpointSpecs[epId].selectedAnalyses = [{
        transformationOid: spec.selectedTransformationOid,
        customInputBindings: spec.customInputBindings || null,
        activeInteractions: spec.activeInteractions || [],
        estimandSummaryPattern: spec.estimandSummaryPattern || null
      }];
    } else {
      appState.endpointSpecs[epId].selectedAnalyses = [];
    }
  }
}

/**
 * Sync the legacy selectedTransformationOid field from selectedAnalyses[0].
 * Call after any mutation to selectedAnalyses to keep other views working.
 */
export function syncLegacyTransformationOid(epId) {
  const spec = appState.endpointSpecs[epId];
  if (!spec) return;
  const analyses = spec.selectedAnalyses || [];
  spec.selectedTransformationOid = analyses.length > 0 ? analyses[0].transformationOid : null;
  // Also sync top-level fields from first analysis for backward compat
  if (analyses.length > 0) {
    spec.customInputBindings = analyses[0].customInputBindings;
    spec.activeInteractions = analyses[0].activeInteractions || [];
    spec.estimandSummaryPattern = analyses[0].estimandSummaryPattern;
  } else {
    spec.customInputBindings = null;
    spec.activeInteractions = [];
    spec.estimandSummaryPattern = null;
  }
}

/**
 * Find analysis transformations matching a concept category.
 * Filters on non-dimensional inputBindings whose concept matches.
 */
export function getMatchingAnalysisTransformations(conceptCategory) {
  const transforms = appState.transformationLibrary?.analysisTransformations || [];
  if (!conceptCategory) return [];
  // Observation maps to C.Measure as proxy — observation results and C.Measure
  // outputs are the same type (Quantity), so the same analysis methods apply.
  const matchConcept = conceptCategory === 'Observation' ? 'C.Measure' : conceptCategory;
  return transforms.filter(t =>
    (t.bindings || []).some(b =>
      b.direction !== 'output' && b.dataStructureRole !== 'dimension' && b.concept === matchConcept
    )
  );
}

/**
 * Look up an analysis transformation by OID from the library.
 */
export function getTransformationByOid(oid) {
  const transforms = appState.transformationLibrary?.analysisTransformations || [];
  return transforms.find(t => t.oid === oid) || null;
}

/**
 * Find endpoint-level derivation transformations matching a concept category.
 * Filters derivations where outputConcept matches AND at least one validSmartPhrase
 * has role === 'endpoint' in the SmartPhrases library. This excludes utility
 * derivations (imputation, population flags) that have no endpoint SmartPhrase.
 */
export function getMatchingDerivationTransformations(conceptCategory) {
  const lib = appState.transformationLibrary;
  const derivations = lib?.derivationTransformations || [];
  const smartPhrases = lib?.smartPhrases || [];
  if (!conceptCategory) return [];

  // Build set of endpoint-role SmartPhrase OIDs
  const endpointPhraseOids = new Set(
    smartPhrases.filter(sp => sp.role === 'endpoint').map(sp => sp.oid)
  );

  return derivations.filter(d => {
    const outputConcept = (d.bindings || []).find(b => b.direction === 'output')?.concept || d.outputConcept;
    return outputConcept === conceptCategory &&
      (d.validSmartPhrases || []).some(spOid => endpointPhraseOids.has(spOid));
  });
}

/**
 * Look up a derivation transformation by OID from the library.
 */
export function getDerivationTransformationByOid(oid) {
  const derivations = appState.transformationLibrary?.derivationTransformations || [];
  return derivations.find(d => d.oid === oid) || null;
}

/**
 * Get the endpoint SmartPhrase for a derivation transformation.
 * Returns the SmartPhrase object or null.
 */
export function getDerivationEndpointPhrase(derivation) {
  if (!derivation) return null;
  const lib = appState.transformationLibrary;
  return (lib?.smartPhrases || []).find(sp =>
    sp.role === 'endpoint' && (derivation.validSmartPhrases || []).includes(sp.oid)
  ) || null;
}

/**
 * Build a plain-English formalized endpoint description from What + How.
 * Produces a readable sentence suitable for protocol text repair.
 *
 * Structure: "{What phrase}, analyzed by {method} {dimensional context}"
 * e.g.: "Change from baseline in ADAS-Cog Total Score, analyzed by MMRM
 *        in the ITT population"
 */
export function buildFormalizedDescription(ep, spec, study) {
  if (!spec?.conceptCategory) return null;

  const paramValue = getSpecParameterValue(ep.id, spec, study);
  const dimValues = spec.dimensionValues || {};
  const parts = [];

  // === WHAT part ===
  const derivation = spec.selectedDerivationOid
    ? getDerivationTransformationByOid(spec.selectedDerivationOid)
    : null;
  const derivPhrase = getDerivationEndpointPhrase(derivation);

  const configVals = spec.derivationConfigValues || {};

  if (derivPhrase) {
    let what = derivPhrase.phrase_template;
    if (what.includes('{parameter}')) {
      what = what.replace('{parameter}', paramValue || '{parameter}');
    }
    if (what.includes('{event}')) {
      what = what.replace('{event}', configVals.event || dimValues.event || dimValues.Event || '{event}');
    }
    // Resolve all remaining derivation config placeholders
    for (const [key, val] of Object.entries(configVals)) {
      if (key === 'parameter' || key === 'event') continue;
      const ph = `{${key}}`;
      if (what.includes(ph)) {
        what = what.replace(ph, val || ph);
      }
    }
    // Capitalize first letter
    what = what.charAt(0).toUpperCase() + what.slice(1);
    parts.push(what);
  } else if (spec.conceptCategory === 'Observation' && paramValue) {
    // Observation — simple direct phrasing
    parts.push(paramValue);
  } else if (paramValue) {
    // No derivation phrase — use concept + parameter
    const bare = spec.conceptCategory.startsWith('C.') ? spec.conceptCategory.slice(2) : spec.conceptCategory;
    parts.push(`${bare} of ${paramValue}`);
  } else {
    return null; // Not enough info for a formalized description
  }

  // === HOW part ===
  const analysisTransform = spec.selectedTransformationOid
    ? getTransformationByOid(spec.selectedTransformationOid)
    : null;

  if (analysisTransform) {
    const methodName = analysisTransform.usesMethod
      ? analysisTransform.usesMethod.replace(/^M\./, '')
      : analysisTransform.name;
    parts.push(`analyzed by ${methodName}`);
  }

  // === Dimensional context ===
  const dimPrep = {
    AnalysisVisit: 'at',
    Timing:        'at',
    Population:    'in the',
    Treatment:     'comparing',
    Period:        'during'
  };
  const dimSuffix = { Population: 'population' };
  const dimOrder = ['AnalysisVisit', 'Timing', 'Population', 'Treatment', 'Period'];

  for (const dim of dimOrder) {
    const value = dimValues[dim];
    if (!value) continue;
    const prep = dimPrep[dim] || '';
    const suffix = dimSuffix[dim] || '';
    parts.push(`${prep} ${value}${suffix ? ' ' + suffix : ''}`);
  }

  return parts.join(', ').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
}

/**
 * Look up the natural-language summary measure phrase for a result pattern.
 * Tries qualified key (PatternName:MethodSuffix) first, then unqualified.
 */
export function getSummaryMeasurePhrase(patternName, methodId) {
  if (!patternName) return null;
  // Try qualified key: e.g. "TestResult:LogRankTest"
  if (methodId) {
    const suffix = methodId.replace(/^M\./, '');
    const qualified = `${patternName}:${suffix}`;
    if (SUMMARY_MEASURE_PHRASES[qualified]) return SUMMARY_MEASURE_PHRASES[qualified];
  }
  return SUMMARY_MEASURE_PHRASES[patternName] || null;
}

/**
 * Build an ICH E9(R1) estimand-style sentence from the spec.
 * Pattern: "The {summary_measure_phrase} {what_part} {treatment_context} {population_context}"
 *
 * Returns null if summary measure is not tagged.
 */
export function buildEstimandDescription(ep, spec, study) {
  if (!spec?.estimandSummaryPattern) return null;

  const analysisTransform = spec.selectedTransformationOid
    ? getTransformationByOid(spec.selectedTransformationOid)
    : null;
  if (!analysisTransform) return null;

  const phrase = getSummaryMeasurePhrase(
    spec.estimandSummaryPattern,
    analysisTransform.usesMethod
  );
  if (!phrase) return null;

  // Build the WHAT part (variable attribute)
  const paramValue = getSpecParameterValue(ep.id, spec, study);
  const dimValues = spec.dimensionValues || {};
  const derivation = spec.selectedDerivationOid
    ? getDerivationTransformationByOid(spec.selectedDerivationOid)
    : null;
  const derivPhrase = getDerivationEndpointPhrase(derivation);

  const configVals = spec.derivationConfigValues || {};

  let whatPart = '';
  if (derivPhrase) {
    whatPart = derivPhrase.phrase_template;
    if (whatPart.includes('{parameter}')) {
      whatPart = whatPart.replace('{parameter}', paramValue || '{parameter}');
    }
    if (whatPart.includes('{event}')) {
      whatPart = whatPart.replace('{event}', configVals.event || dimValues.event || dimValues.Event || '{event}');
    }
    // Resolve all remaining derivation config placeholders
    for (const [key, val] of Object.entries(configVals)) {
      if (key === 'parameter' || key === 'event') continue;
      const ph = `{${key}}`;
      if (whatPart.includes(ph)) {
        whatPart = whatPart.replace(ph, val || ph);
      }
    }
  } else if (spec.conceptCategory === 'Observation' && paramValue) {
    whatPart = paramValue;
  } else if (paramValue) {
    const bare = spec.conceptCategory?.startsWith('C.') ? spec.conceptCategory.slice(2) : spec.conceptCategory;
    whatPart = `${bare} of ${paramValue}`;
  } else {
    return null;
  }

  // Build dimensional context parts
  const contextParts = [];

  // Timing (AnalysisVisit)
  const visitVal = dimValues.AnalysisVisit || dimValues.Timing || null;
  if (visitVal) contextParts.push(`at ${visitVal}`);

  // Treatment — use "between" for comparison phrasing
  const treatmentVal = dimValues.Treatment || null;
  if (treatmentVal) {
    // If it contains "vs", rephrase to "between X and Y"
    if (treatmentVal.includes(' vs ')) {
      const groups = treatmentVal.split(' vs ');
      contextParts.push(`between ${groups.join(' and ')}`);
    } else {
      contextParts.push(`for ${treatmentVal}`);
    }
  }

  // Population
  const popVal = dimValues.Population || null;
  if (popVal) contextParts.push(`in the ${popVal} population`);

  // Compose: "The {phrase} {what} {context}"
  let sentence = `The ${phrase} ${whatPart}`;

  if (contextParts.length > 0) {
    sentence += ' ' + contextParts.join(' ');
  }

  return sentence;
}

/**
 * Get the formalized description for an endpoint, for use by eSAP builder.
 * Prefers the estimand-style description when a summary measure is tagged;
 * falls back to the standard formalized description.
 * Returns null if useInEsap is false.
 */
export function getFormalizedDescription(epId, study) {
  const spec = appState.endpointSpecs?.[epId];
  if (!spec?.useInEsap) return null;
  const ep = getAllEndpoints(study).find(e => e.id === epId);
  if (!ep) return null;
  // Prefer estimand-style sentence when summary measure is tagged
  return buildEstimandDescription(ep, spec, study)
    || buildFormalizedDescription(ep, spec, study);
}

/**
 * Get dropdown options for a dimensional slice based on its source field.
 */
export function getDimensionOptionsForSlice(dimName, sliceDef, study, epId) {
  const source = sliceDef?.source;
  switch (source) {
    case 'biomedicalConcept':
    case 'endpoint':
      return getEndpointParameterOptions(study, epId, appState.endpointSpecs);
    case 'visit':
      return getVisitLabels(study);
    case 'population':
      return getPopulationNames(study);
    default:
      if (source) console.warn(`getDimensionOptionsForSlice: unrecognized source "${source}" for ${dimName}`);
      return getDimensionOptions(dimName, study);
  }
}


// ===== Rendering helpers =====

/**
 * Render the parameter picker (BC/manual radio + BC checkboxes or text input).
 * Extracted so it can be used in both Observation and DC paths.
 */
export function renderParameterPicker(ep, spec, bcs, allBCs, hasBCs, paramSource) {
  return `
    <div style="margin-bottom:12px;">
      <div style="font-weight:600; font-size:12px; margin-bottom:8px; color:var(--cdisc-text-secondary);">Parameter</div>
      <div style="display:flex; gap:16px; margin-bottom:12px;">
        <label style="font-size:13px; display:flex; align-items:center; gap:4px; cursor:pointer;">
          <input type="radio" class="ep-param-source" name="param-source-${ep.id}" data-ep-id="${ep.id}" value="bc" ${paramSource === 'bc' ? 'checked' : ''}>
          From Biomedical Concepts
        </label>
        <label style="font-size:13px; display:flex; align-items:center; gap:4px; cursor:pointer;">
          <input type="radio" class="ep-param-source" name="param-source-${ep.id}" data-ep-id="${ep.id}" value="manual" ${paramSource === 'manual' ? 'checked' : ''}>
          Manual
        </label>
      </div>

      ${paramSource === 'bc' ? `
        ${hasBCs ? `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:12px; color:var(--cdisc-gray);">${bcs.length > 0 ? `${bcs.length} linked BCs` : 'All study BCs'}</span>
            <button class="btn btn-sm btn-secondary ep-bc-select-all" data-ep-id="${ep.id}" style="font-size:11px; padding:2px 8px;">Toggle All</button>
          </div>
          <div style="max-height:200px; overflow-y:auto; border:1px solid var(--cdisc-border); border-radius:var(--radius); padding:8px;">
            ${(bcs.length > 0 ? bcs : allBCs).map(bc => {
              const isLinked = (spec.linkedBCIds || []).includes(bc.id);
              return `
                <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:12px; cursor:pointer;">
                  <input type="checkbox" class="ep-bc-checkbox" data-ep-id="${ep.id}" data-bc-id="${bc.id}" ${isLinked ? 'checked' : ''}>
                  ${bc.name}
                </label>`;
            }).join('')}
          </div>
        ` : `
          <div style="font-size:12px; color:var(--cdisc-gray); font-style:italic;">
            No biomedical concepts linked to this endpoint. Switch to Manual mode.
          </div>
        `}
      ` : `
        <div class="config-field">
          <label class="config-label">Parameter Name</label>
          <input class="config-input ep-param-name" data-ep-id="${ep.id}" value="${spec.parameterName || ''}" placeholder="Enter parameter name">
        </div>
      `}
    </div>`;
}

/**
 * Render OC facet cards for an observation concept.
 * Groups classified properties by facet, shows each as a clickable card.
 */
export function renderOcFacetCards(classifiedProps, spec, epId) {
  // Group by facet
  const facetGroups = {};
  for (const prop of classifiedProps) {
    if (!facetGroups[prop.ocFacet]) {
      facetGroups[prop.ocFacet] = { role: prop.ocRole, props: [] };
    }
    facetGroups[prop.ocFacet].props.push(prop);
  }

  const roleColors = {
    result: 'var(--cdisc-blue)',
    unit: '#6b7280',
    qualifier: '#8b5cf6',
    context: '#059669',
    condition: '#d97706',
    identity: '#6b7280'
  };

  const facetEntries = Object.entries(facetGroups);

  return `
    <div style="margin-bottom:12px;">
      <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Observation Structure</div>
      <div style="font-size:11px; color:var(--cdisc-gray); margin-bottom:8px;">
        Click a facet to tag it as the analysis target. <strong>&#9733;</strong> = current target.
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${facetEntries.map(([facet, group]) => {
          const isTarget = spec.selectedOcFacet === facet;
          const borderColor = isTarget ? 'var(--cdisc-blue)' : 'var(--cdisc-border)';
          const bg = isTarget ? 'var(--cdisc-light-blue)' : 'white';
          const roleBadgeColor = roleColors[group.role] || '#6b7280';
          const propNames = group.props.map(p => p.name).join(', ');
          const firstProp = group.props[0];
          const dtype = firstProp?.datatype || '';
          const responseCodes = firstProp?.responseCodes?.filter(rc => rc.isEnabled !== false) || [];
          const responsePreview = responseCodes.length > 0
            ? responseCodes.slice(0, 3).map(rc => rc.decode || rc.code).join(', ') + (responseCodes.length > 3 ? ', ...' : '')
            : '';

          return `
            <div class="ep-oc-facet-card" data-ep-id="${epId}" data-facet="${facet}"
              style="padding:8px 12px; border:2px solid ${borderColor}; border-radius:var(--radius); cursor:pointer; background:${bg}; min-width:140px; max-width:200px; transition:border-color 0.15s, background 0.15s;">
              <div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
                ${isTarget ? '<span style="font-size:12px; color:var(--cdisc-blue);">&#9733;</span>' : ''}
                <strong style="font-size:12px;">${facet}</strong>
              </div>
              <div style="font-size:10px; color:${roleBadgeColor}; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">${group.role}</div>
              <div style="font-size:10px; color:var(--cdisc-text-secondary); margin-bottom:2px;">${propNames}</div>
              ${dtype ? `<div style="font-size:10px; color:var(--cdisc-gray);">${dtype}</div>` : ''}
              ${responsePreview ? `<div style="font-size:9px; color:var(--cdisc-gray); margin-top:2px; font-style:italic;">${responsePreview}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

/**
 * Render derivation config panel with composed phrase preview, placeholder inputs,
 * dimension grid, and method configurations.
 */
export function renderDerivationConfigPanel(derivation, spec, study, ep) {
  const lib = appState.transformationLibrary;
  const derivPhrase = getDerivationEndpointPhrase(derivation);
  const configValues = spec.derivationConfigValues || {};
  const dimValues = spec.derivationDimensionValues || {};
  const paramValue = getSpecParameterValue(ep.id, spec, study);

  // Extract placeholders from composedPhrase or phrase_template
  const phraseSource = derivation.composedPhrase || derivPhrase?.phrase_template || '';
  const placeholders = [];
  const phRegex = /\{(\w+)\}/g;
  let match;
  while ((match = phRegex.exec(phraseSource)) !== null) {
    if (!placeholders.includes(match[1])) placeholders.push(match[1]);
  }

  // Build resolved phrase preview
  let resolvedPhrase = phraseSource;
  for (const ph of placeholders) {
    const token = `{${ph}}`;
    let val = null;
    if (ph === 'parameter') {
      val = paramValue;
    } else {
      val = configValues[ph] || null;
    }
    resolvedPhrase = resolvedPhrase.replace(token, val
      ? `<strong>${val}</strong>`
      : `<span class="placeholder">${token}</span>`
    );
  }

  // Collect dimensions from derivation (inherited + added, excluding Subject)
  const inheritedDims = derivation.inheritedDimensions || {};
  const addedDims = derivation.addedDimensions || {};
  const allDims = { ...inheritedDims, ...addedDims };
  // Filter out dimensions already covered by a placeholder
  const placeholderDimSet = new Set(
    placeholders.map(ph => PLACEHOLDER_DIM_MAP[ph]).filter(Boolean)
  );

  return `
    <div class="ep-derivation-config" style="margin-top:12px;">
      ${phraseSource ? `
      <!-- Composed Phrase Preview -->
      <div class="ep-composed-phrase">
        ${resolvedPhrase}
      </div>
      ` : ''}

      ${placeholders.length > 0 ? `
      <!-- Placeholder Inputs (excluding visit/imputation — handled in analysis step) -->
      <div style="margin-bottom:12px;">
        <div style="font-weight:600; font-size:12px; margin-bottom:8px; color:var(--cdisc-text-secondary);">Configuration</div>
        <div class="ep-placeholder-grid">
          ${placeholders.map(ph => {
            // Skip visit/imputation — these are analysis/pipeline concerns
            if (ph === 'visit' || ph === 'imputation') return '';
            if (ph === 'parameter') {
              // Parameter is handled by the parameter picker (rendered inline)
              return `
                <div class="config-field">
                  <label class="config-label" style="display:flex; align-items:center; gap:6px;">
                    <span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">parameter</span>
                  </label>
                  <div style="padding:6px 10px; background:var(--cdisc-light-gray); border:1px solid var(--cdisc-border); border-radius:var(--radius); font-size:12px; color:${paramValue ? 'var(--cdisc-text)' : 'var(--cdisc-gray)'}; font-style:${paramValue ? 'normal' : 'italic'};">
                    ${paramValue || 'Set via Parameter section below'}
                  </div>
                </div>`;
            }

            const currentVal = configValues[ph] || '';

            // Determine if we have dropdown options
            let options = null;
            if (ph === 'visit') {
              options = getVisitLabels(study);
            } else if (ph === 'population') {
              options = getPopulationNames(study);
            } else {
              // Check library-level configurationOptions
              const configOpts = appState.transformationLibrary?.configurationOptions?.[ph];
              if (Array.isArray(configOpts) && configOpts.length > 0) {
                options = configOpts;
              }
            }

            return `
              <div class="config-field">
                <label class="config-label" style="display:flex; align-items:center; gap:6px;">
                  <span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">${ph}</span>
                </label>
                ${options && options.length > 0 ? `
                  <select class="config-select ep-deriv-config-value" data-ep-id="${ep.id}" data-config-key="${ph}">
                    <option value="">-- Select --</option>
                    ${options.map(opt => {
                      const v = typeof opt === 'object' ? opt.value : opt;
                      const l = typeof opt === 'object' ? opt.label : opt;
                      const tip = typeof opt === 'object' && opt.label !== opt.value ? ` title="${l}"` : '';
                      return `<option value="${v}"${tip} ${v === currentVal ? 'selected' : ''}>${v}</option>`;
                    }).join('')}
                  </select>
                ` : `
                  <input class="config-input ep-deriv-config-value" data-ep-id="${ep.id}" data-config-key="${ph}" value="${currentVal}" placeholder="Enter ${ph}">
                `}
              </div>`;
          }).join('')}
        </div>
      </div>
      ` : ''}

      ${Object.keys(allDims).length > 0 ? `
      <!-- Derivation Dimensions (excluding visit/imputation — those are analysis concerns) -->
      <div style="margin-bottom:12px;">
        <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Derivation Dimensions</div>
        <div class="ep-dim-grid">
          ${Object.entries(allDims).map(([dim, dimDef]) => {
            if (SKIP_IN_DIM_GRID.has(dim)) return '';
            if (placeholderDimSet.has(dim)) return ''; // covered by placeholder
            // Skip visit/imputation — these are analysis/pipeline concerns, not endpoint-intrinsic
            if (dim === 'AnalysisVisit' || dim === 'Timing') return '';
            const currentVal = dimValues[dim] || '';
            const options = getDimensionOptions(dim, study);
            const role = dimDef?.role || '';

            return `
              <div class="config-field">
                <label class="config-label" style="display:flex; align-items:center; gap:6px;">
                  <span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">${dim}</span>
                  ${role ? `<span style="font-size:10px; color:var(--cdisc-gray);">${role}</span>` : ''}
                </label>
                ${options && options.length > 0 ? `
                  <select class="config-select ep-deriv-dim-value" data-ep-id="${ep.id}" data-dim="${dim}">
                    <option value="">-- Select --</option>
                    ${options.map(opt => {
                      const v = typeof opt === 'object' ? opt.value : opt;
                      const l = typeof opt === 'object' ? opt.label : opt;
                      const tip = typeof opt === 'object' && opt.label !== opt.value ? ` title="${l}"` : '';
                      return `<option value="${v}"${tip} ${v === currentVal ? 'selected' : ''}>${v}</option>`;
                    }).join('')}
                  </select>
                ` : `
                  <input class="config-input ep-deriv-dim-value" data-ep-id="${ep.id}" data-dim="${dim}" value="${currentVal}" placeholder="Enter ${dim.toLowerCase()} value">
                `}
              </div>`;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Endpoint Data Structure (Cube Summary) -->
      ${renderCubeSummary(derivation, paramValue)}

      <!-- Parameter Picker (inline for derived concepts) -->
      ${renderParameterPicker(ep, spec, getBiomedicalConcepts(study, ep.id), study.biomedicalConcepts || [], (getBiomedicalConcepts(study, ep.id).length > 0 || (study.biomedicalConcepts || []).length > 0), spec.parameterSource || 'bc')}
    </div>`;
}

/**
 * Render a cube summary card showing the derivation's dimensional structure
 * as a set of input cubes being combined into an output cube.
 *
 * Each input binding with a different dimensional context (sliced vs unsliced)
 * gets its own cube card showing its free dimensions, making cross-cube joins
 * visually explicit.
 */
function renderCubeSummary(derivation, paramValue) {
  if (!derivation) return '';

  const namedSlices = derivation.namedSlices || {};
  const outputBinding = (derivation.bindings || []).find(b => b.direction === 'output');
  const inputBindings = (derivation.bindings || []).filter(b => b.direction !== 'output');
  const outputConcept = outputBinding?.concept || derivation.instanceOf || '?';

  const inheritedDims = derivation.inheritedDimensions || {};
  const addedDims = derivation.addedDimensions || {};

  // Build the full set of dimensions for this derivation
  const allDimEntries = [
    ...Object.entries(inheritedDims).map(([d, r]) => ({ dim: d, role: r, source: 'inherited' })),
    ...Object.entries(addedDims).map(([d, r]) => ({ dim: d, role: r, source: 'added' }))
  ];

  // Group input bindings by their dimensional context (slice key or 'full')
  // Bindings with no slice share the full dimensional context;
  // Bindings with a slice have some dimensions pinned.
  const cubeGroups = {};
  for (const b of inputBindings) {
    const key = b.slice || '_full';
    if (!cubeGroups[key]) cubeGroups[key] = { bindings: [], slice: b.slice || null };
    cubeGroups[key].bindings.push(b);
  }

  // Build per-cube cards
  const cubeCards = Object.entries(cubeGroups).map(([key, group]) => {
    const sliceDef = group.slice ? namedSlices[group.slice] : null;
    const fixedDims = sliceDef?.fixedDimensions || {};
    const fixedDimNames = new Set(Object.keys(fixedDims));

    // Free dimensions = all dims minus the ones pinned by the slice
    const freeDims = allDimEntries.filter(d => !fixedDimNames.has(d.dim));
    const freeDimStr = freeDims.map(d => d.dim).join(' \u00d7 ');

    const conceptList = group.bindings.map(b => {
      const label = b.concept + (b.slice ? ` @ ${b.slice}` : '');
      return `<code style="font-size:11px;">${label}</code> <span style="font-size:10px; color:var(--cdisc-gray);">${b.methodRole}</span>`;
    }).join('<br>');

    const isSliced = !!group.slice;
    const borderColor = isSliced ? 'rgba(0,133,124,0.3)' : 'rgba(0,100,200,0.2)';
    const bgColor = isSliced ? 'rgba(0,133,124,0.04)' : 'rgba(0,100,200,0.03)';

    // Fixed-dimension annotation
    const fixedAnnotation = Object.entries(fixedDims).map(([k, v]) =>
      `<span style="font-size:10px; color:var(--cdisc-teal);">${k} = <strong>${v}</strong></span>`
    ).join(', ');

    return `
      <div style="flex:1; min-width:160px; padding:8px 10px; border:1px solid ${borderColor}; border-radius:var(--radius); background:${bgColor};">
        <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">
          Input${isSliced ? ' (sliced)' : ''}
        </div>
        <div style="margin-bottom:4px;">${conceptList}</div>
        <div style="font-size:10px; color:var(--cdisc-gray); margin-bottom:2px;">
          Dims: ${freeDimStr || 'scalar'}
        </div>
        ${fixedAnnotation ? `<div style="margin-top:2px;">${fixedAnnotation}</div>` : ''}
      </div>`;
  });

  // Output cube card
  const outputFreeDims = allDimEntries.map(d => d.dim).join(' \u00d7 ');
  const outputCard = `
    <div style="flex:1; min-width:160px; padding:8px 10px; border:1px solid rgba(0,100,200,0.3); border-radius:var(--radius); background:rgba(0,100,200,0.05);">
      <div style="font-size:10px; font-weight:600; color:var(--cdisc-blue); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">Output</div>
      <div style="margin-bottom:4px;"><code style="font-size:11px;">${outputConcept}</code> <span style="font-size:10px; color:var(--cdisc-gray);">${outputBinding?.methodRole || ''}</span></div>
      <div style="font-size:10px; color:var(--cdisc-gray);">Dims: ${outputFreeDims}</div>
    </div>`;

  // Build the per-combination description for the output
  const nonSubjectDims = allDimEntries.filter(d => d.dim !== 'Subject');
  const perParts = ['Subject', ...nonSubjectDims.map(d => d.dim)];
  const perDesc = perParts.join(' \u00d7 ');
  const hasCrossJoin = Object.keys(cubeGroups).length > 1 || Object.values(cubeGroups).some(g => g.slice);

  return `
    <div style="margin-top:12px; margin-bottom:12px; padding:12px 16px; background:rgba(0,133,124,0.04); border:1px solid rgba(0,133,124,0.15); border-radius:var(--radius);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <span style="font-size:11px; font-weight:600; color:var(--cdisc-teal); text-transform:uppercase; letter-spacing:0.5px;">Endpoint Data Structure</span>
        <span class="badge badge-secondary" style="font-size:10px;">${derivation.usesMethod}</span>
      </div>

      <!-- Cube flow: inputs → derivation → output -->
      <div style="display:flex; align-items:stretch; gap:0; flex-wrap:wrap;">
        <!-- Input cubes -->
        <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
          ${cubeCards.join('')}
        </div>

        <!-- Arrow -->
        <div style="display:flex; align-items:center; padding:0 10px; font-size:18px; color:var(--cdisc-gray);">\u2192</div>

        <!-- Output cube -->
        ${outputCard}
      </div>

      <div style="margin-top:10px; font-size:11px; color:var(--cdisc-text-secondary); line-height:1.5;">
        ${hasCrossJoin
          ? `Joins inputs on shared dimensions (${allDimEntries.filter(d => d.dim !== 'Subject').map(d => d.dim).join(', ') || 'none'}). `
          : ''}
        Produces one <code>${outputConcept}</code> value per ${perDesc} combination.
      </div>
    </div>`;
}

// ===== Card rendering =====

function renderEndpointCard(ep, expanded, conceptOptions, study) {
  let spec = appState.endpointSpecs[ep.id] || {};
  const bcs = getBiomedicalConcepts(study, ep.id);
  const allBCs = study.biomedicalConcepts || [];
  const hasBCs = bcs.length > 0 || allBCs.length > 0;
  const paramSource = spec.parameterSource || 'bc';
  const dimRels = getDimensionalRelationships(spec.conceptCategory);
  const catInfo = getCategoryInfo(spec.conceptCategory);
  const categoryName = catInfo?.categoryName || '';
  const syntax = buildSyntaxTemplate(ep, spec, study);
  const formalized = buildFormalizedDescription(ep, spec, study);
  const estimandDesc = buildEstimandDescription(ep, spec, study);
  const originalText = ep.text || ep.description || ep.name;

  const isObservation = spec.conceptCategory === 'Observation';

  // Get matching derivation transformations and auto-select if only one
  const matchingDerivations = isObservation ? [] : getMatchingDerivationTransformations(spec.conceptCategory);
  const derivationAutoSelected = matchingDerivations.length === 1;

  // Auto-select the only derivation if none is selected yet (persist to appState)
  if (derivationAutoSelected && !spec.selectedDerivationOid && spec.conceptCategory) {
    ensureSpec(ep.id);
    appState.endpointSpecs[ep.id].selectedDerivationOid = matchingDerivations[0].oid;
    spec = appState.endpointSpecs[ep.id]; // re-bind to persisted spec
  }

  const selectedDerivation = spec.selectedDerivationOid
    ? getDerivationTransformationByOid(spec.selectedDerivationOid)
    : null;

  // Get the derivation's endpoint SmartPhrase for the "What" preview
  const derivPhrase = getDerivationEndpointPhrase(selectedDerivation || (derivationAutoSelected ? matchingDerivations[0] : null));
  const paramValue = getSpecParameterValue(ep.id, spec, study);

  // Build "What" preview text
  let whatPreview = null;
  if (derivPhrase) {
    let whatTpl = derivPhrase.phrase_template;
    if (whatTpl.includes('{parameter}')) {
      whatTpl = paramValue
        ? whatTpl.replace('{parameter}', `<strong>${paramValue}</strong>`)
        : whatTpl.replace('{parameter}', '<span class="placeholder">{parameter}</span>');
    }
    if (whatTpl.includes('{event}')) {
      const eventVal = (spec.derivationConfigValues || {}).event || (spec.dimensionValues || {}).event || (spec.dimensionValues || {}).Event || null;
      whatTpl = eventVal
        ? whatTpl.replace('{event}', `<strong>${eventVal}</strong>`)
        : whatTpl.replace('{event}', '<span class="placeholder">{event}</span>');
    }
    // Resolve additional derivation config placeholders
    for (const [key, val] of Object.entries(spec.derivationConfigValues || {})) {
      if (key === 'parameter' || key === 'event') continue;
      const ph = `{${key}}`;
      if (whatTpl.includes(ph)) {
        whatTpl = val
          ? whatTpl.replace(ph, `<strong>${val}</strong>`)
          : whatTpl;
      }
    }
    whatPreview = whatTpl;
  }

  // Classify BC properties for OC facet cards (observation concepts)
  const linkedBcs = getBiomedicalConcepts(study, ep.id);
  const primaryBc = (spec.linkedBCIds?.length > 0)
    ? (study.biomedicalConcepts || []).find(bc => spec.linkedBCIds.includes(bc.id))
    : linkedBcs[0] || null;
  const classifiedProps = (isObservation && primaryBc) ? classifyBcProperties(primaryBc) : [];

  // Auto-select Result.Value as OC facet if not yet set
  if (isObservation && classifiedProps.length > 0 && !spec.selectedOcFacet) {
    const hasResult = classifiedProps.some(p => p.ocFacet === 'Result.Value');
    if (hasResult) {
      ensureSpec(ep.id);
      appState.endpointSpecs[ep.id].selectedOcFacet = 'Result.Value';
      spec = appState.endpointSpecs[ep.id];
    }
  }

  // Get matching analysis transformations and selected one
  const matchingTransforms = getMatchingAnalysisTransformations(spec.conceptCategory);
  const selectedTransform = spec.selectedTransformationOid
    ? getTransformationByOid(spec.selectedTransformationOid)
    : null;

  return `
    <div class="card ep-spec-card ${expanded ? 'open' : ''}" style="margin-bottom:12px;">
      <div class="ep-spec-header" style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
        <span class="ep-spec-arrow" style="transition:transform 0.2s; font-size:10px;">&#9654;</span>
        <strong style="font-size:14px;">${ep.name}</strong>
        <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:4px;">${ep.level}</span>
        ${spec.conceptCategory ? `<span class="badge badge-teal" style="margin-left:auto;">${spec.conceptCategory}</span>` : ''}
      </div>

      <div class="ep-spec-body" style="display:none; margin-top:16px;">
        <!-- Protocol Endpoint Text (Original) -->
        <div style="margin-bottom:16px; padding:10px 14px; background:var(--cdisc-light-blue); border-radius:var(--radius); border-left:3px solid var(--cdisc-blue);">
          <div style="font-size:11px; font-weight:600; color:var(--cdisc-blue); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Protocol Endpoint (Original)</div>
          <div style="font-size:13px; line-height:1.5; color:var(--cdisc-text);">${originalText}</div>
        </div>

        <!-- Concept Category + Data Type -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
          <div class="config-field">
            <label class="config-label">Concept Category</label>
            <select class="config-select ep-concept-category" data-ep-id="${ep.id}">
              <option value="">-- Select --</option>
              ${conceptOptions.map(opt =>
                `<option value="${opt.value}" ${opt.value === spec.conceptCategory ? 'selected' : ''}>${opt.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="config-field">
            <label class="config-label">Data Type</label>
            <select class="config-select ep-data-type" data-ep-id="${ep.id}">
              ${DATA_TYPES.map(dt =>
                `<option value="${dt}" ${dt === (spec.dataType || 'Quantity') ? 'selected' : ''}>${dt}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        ${spec.conceptCategory ? `
        <!-- ═══ WHAT ═══ -->
        <div style="margin-bottom:16px; border-top:2px solid var(--cdisc-blue); padding-top:12px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <span style="font-weight:700; font-size:13px; color:var(--cdisc-blue); letter-spacing:0.5px;">WHAT</span>
            <span style="font-size:12px; color:var(--cdisc-gray);">${isObservation ? 'Observation &mdash; direct measured/observed value' : 'Derivation &mdash; what quantity is being measured or computed'}</span>
          </div>

          ${isObservation ? `
          <!-- ── Observation (OC) Path ── -->
          ${renderParameterPicker(ep, spec, bcs, allBCs, hasBCs, paramSource)}

          ${primaryBc && classifiedProps.length > 0 ? `
          <!-- OC Facet Cards -->
          ${renderOcFacetCards(classifiedProps, spec, ep.id)}
          ` : `
          <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-light-gray); border-radius:var(--radius); font-size:11px; color:var(--cdisc-gray);">
            Link a Biomedical Concept above to see its observation structure.
          </div>
          `}
          ` : `
          <!-- ── Derived Concept (DC) Path ── -->
          ${matchingDerivations.length > 0 ? `
          <!-- Derivation Transformation Selection -->
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Derivation Transformation</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${matchingDerivations.map(d => {
                const isAuto = derivationAutoSelected && matchingDerivations[0].oid === d.oid;
                const isSelected = spec.selectedDerivationOid === d.oid || isAuto;
                return `
                  <div class="ep-derivation-card" data-ep-id="${ep.id}" data-derivation-oid="${d.oid}"
                    style="padding:10px 14px; border:2px solid ${isSelected ? 'var(--cdisc-blue)' : 'var(--cdisc-border)'}; border-radius:var(--radius); cursor:pointer; background:${isSelected ? 'var(--cdisc-light-blue)' : 'white'}; transition:border-color 0.15s, background 0.15s;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:16px; color:${isSelected ? 'var(--cdisc-blue)' : 'var(--cdisc-gray)'};">${isSelected ? '●' : '○'}</span>
                      <strong style="font-size:13px;">${d.name}</strong>
                      ${d.usesMethod ? `<span class="badge badge-secondary" style="font-size:10px;">${d.usesMethod}</span>` : ''}
                      ${isAuto ? `<span style="font-size:10px; color:var(--cdisc-gray); font-style:italic; margin-left:auto;">auto-selected</span>` : ''}
                    </div>
                    ${d.description ? `<div style="font-size:11px; color:var(--cdisc-gray); margin-top:4px; margin-left:24px;">${d.description.length > 120 ? d.description.slice(0, 120) + '...' : d.description}</div>` : ''}
                  </div>`;
              }).join('')}
            </div>
          </div>

          ${selectedDerivation ? renderDerivationConfigPanel(selectedDerivation, spec, study, ep) : `
          <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-light-gray); border-radius:var(--radius); font-size:11px; color:var(--cdisc-gray);">
            Select a derivation transformation above to configure its parameters.
          </div>
          `}
          ` : `
          <!-- No derivation — source data endpoint, show parameter picker directly -->
          <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-light-gray); border-radius:var(--radius); font-size:11px; color:var(--cdisc-gray);">
            No endpoint-level derivation for <strong>${spec.conceptCategory}</strong> &mdash; source data endpoint.
          </div>
          ${renderParameterPicker(ep, spec, bcs, allBCs, hasBCs, paramSource)}
          `}
          `}

          ${whatPreview ? `
          <!-- What Template Preview -->
          <div style="margin-bottom:4px; padding:8px 12px; background:var(--cdisc-light-gray); border-radius:var(--radius); font-size:12px; line-height:1.6;">
            <span style="font-size:10px; font-weight:600; color:var(--cdisc-gray); text-transform:uppercase; letter-spacing:0.5px;">What: </span>
            ${whatPreview}
          </div>
          ` : ''}
        </div>
        ` : ''}

        ${spec.conceptCategory ? `
        <!-- ═══ HOW: Analysis ═══ -->
        <div style="margin-bottom:16px; border-top:2px solid var(--cdisc-teal, #00857c); padding-top:12px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <span style="font-weight:700; font-size:13px; color:var(--cdisc-teal, #00857c); letter-spacing:0.5px;">HOW</span>
            <span style="font-size:12px; color:var(--cdisc-gray);">Analysis &mdash; how the quantity is statistically evaluated</span>
          </div>

          ${matchingTransforms.length > 0 ? `
          <!-- Analysis Transformation Selection -->
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Analysis Transformation</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${matchingTransforms.map(t => {
                const isSelected = spec.selectedTransformationOid === t.oid;
                return `
                  <div class="ep-transform-card" data-ep-id="${ep.id}" data-transform-oid="${t.oid}"
                    style="padding:10px 14px; border:2px solid ${isSelected ? 'var(--cdisc-teal, #00857c)' : 'var(--cdisc-border)'}; border-radius:var(--radius); cursor:pointer; background:${isSelected ? 'rgba(0,133,124,0.06)' : 'white'}; transition:border-color 0.15s, background 0.15s;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:16px; color:${isSelected ? 'var(--cdisc-teal, #00857c)' : 'var(--cdisc-gray)'};">${isSelected ? '●' : '○'}</span>
                      <strong style="font-size:13px;">${t.name}</strong>
                      <span class="badge badge-secondary" style="font-size:10px;">${t.acCategory || ''}</span>
                      ${t.usesMethod ? `<span style="font-size:11px; color:var(--cdisc-gray);">${t.usesMethod}</span>` : ''}
                    </div>
                    ${t.description ? `<div style="font-size:11px; color:var(--cdisc-gray); margin-top:4px; margin-left:24px;">${t.description.length > 120 ? t.description.slice(0, 120) + '...' : t.description}</div>` : ''}
                  </div>`;
              }).join('')}
            </div>
          </div>
          ` : `
          <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-light-gray); border-radius:var(--radius); font-size:11px; color:var(--cdisc-gray);">
            No analysis transformations found for <strong>${spec.conceptCategory}</strong>. Analysis method to be defined in SAP.
          </div>
          `}

          ${selectedTransform?.sliceKeys?.length > 0 ? `
          <!-- Slice-Driven Dimensional Values -->
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Dimensional Slices</div>
            <div style="font-size:11px; color:var(--cdisc-gray); margin-bottom:12px;">
              Dimensions configured by <strong>${selectedTransform.name}</strong>.
            </div>
            <div class="ep-dim-grid">
              ${selectedTransform.sliceKeys.map(sk => {
                const dim = sk.dimension;
                if (SKIP_IN_DIM_GRID.has(dim)) return '';
                const currentVal = (spec.dimensionValues || {})[dim] || '';

                const options = getDimensionOptionsForSlice(dim, sk, study, ep.id);
                return `
                    <div class="config-field">
                      <label class="config-label" style="display:flex; align-items:center; gap:6px;">
                        <span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">${dim}</span>
                        ${sk.source ? `<span style="font-size:10px; color:var(--cdisc-gray);">from ${sk.source}</span>` : ''}
                      </label>
                      ${options && options.length > 0 ? `
                        <select class="config-select ep-dim-value" data-ep-id="${ep.id}" data-dim="${dim}">
                          <option value="">-- Select --</option>
                          ${options.map(opt => {
                            const v = typeof opt === 'object' ? opt.value : opt;
                            const l = typeof opt === 'object' ? opt.label : opt;
                            const tip = typeof opt === 'object' && opt.label !== opt.value ? ` title="${l}"` : '';
                            return `<option value="${v}"${tip} ${v === currentVal ? 'selected' : ''}>${v}</option>`;
                          }).join('')}
                        </select>
                      ` : `
                        <input class="config-input ep-dim-value" data-ep-id="${ep.id}" data-dim="${dim}" value="${currentVal}" placeholder="Enter ${dim.toLowerCase()} value">
                      `}
                    </div>`;
              }).join('')}
            </div>
          </div>
          ` : dimRels && !spec.selectedTransformationOid ? `
          <!-- Fallback: DC Model Dimension Values -->
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Dimensional Values</div>
            <div style="font-size:11px; color:var(--cdisc-gray); margin-bottom:12px;">
              Set values for each dimension inherited from <strong>${spec.conceptCategory}</strong>.
              Select an analysis transformation above for a more precise configuration.
            </div>
            <div class="ep-dim-grid">
              ${Object.entries(dimRels).map(([dim, info]) => {
                if (SKIP_IN_DIM_GRID.has(dim)) return '';
                if (dim === 'Timing' && dimRels['AnalysisVisit']) return '';
                const options = getDimensionOptions(dim, study);
                const currentVal = (spec.dimensionValues || {})[dim] || '';
                const roleBadge = info.role || '';
                const isOptional = info.cardinality === '0..1' || info.cardinality === '0';

                return `
                  <div class="config-field">
                    <label class="config-label" style="display:flex; align-items:center; gap:6px;">
                      <span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">${dim}</span>
                      <span style="font-size:10px; color:var(--cdisc-gray);">${roleBadge}${isOptional ? ' (optional)' : ''}</span>
                    </label>
                    ${options && options.length > 0 ? `
                      <select class="config-select ep-dim-value" data-ep-id="${ep.id}" data-dim="${dim}">
                        <option value="">-- Select --</option>
                        ${options.map(opt => {
                          const v = typeof opt === 'object' ? opt.value : opt;
                          const l = typeof opt === 'object' ? opt.label : opt;
                          const tip = typeof opt === 'object' && opt.label !== opt.value ? ` title="${l}"` : '';
                          return `<option value="${v}"${tip} ${v === currentVal ? 'selected' : ''}>${v}</option>`;
                        }).join('')}
                      </select>
                    ` : `
                      <input class="config-input ep-dim-value" data-ep-id="${ep.id}" data-dim="${dim}" value="${currentVal}" placeholder="Enter ${dim.toLowerCase()} value">
                    `}
                  </div>`;
              }).join('')}
            </div>
          </div>
          ` : ''}

          ${selectedTransform?.methodOutputSlotMapping ? (() => {
            // Auto-infer summary measure if not yet set
            if (!spec.estimandSummaryPattern) {
              const inferred = inferDefaultSummaryPattern(selectedTransform);
              if (inferred) {
                ensureSpec(ep.id);
                appState.endpointSpecs[ep.id].estimandSummaryPattern = inferred;
                spec = appState.endpointSpecs[ep.id];
              }
            }
            const resultPatterns = appState.acModel?.resultPatterns || {};
            const mapping = selectedTransform.methodOutputSlotMapping;
            const patternEntries = Object.entries(mapping);
            return `
          <!-- Result Output Patterns -->
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Result Outputs</div>
            <div style="font-size:11px; color:var(--cdisc-gray); margin-bottom:8px;">
              Click a result pattern to tag it as the estimand summary measure.
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${patternEntries.map(([slot, patternName]) => {
                const isSummary = spec.estimandSummaryPattern === patternName;
                const patternDef = resultPatterns[patternName];
                const constituents = patternDef?.constituents || [];
                return `
                <div class="ep-output-pattern-card" data-ep-id="${ep.id}" data-pattern-name="${patternName}"
                  style="padding:8px 12px; border:2px solid ${isSummary ? 'var(--cdisc-teal, #00857c)' : 'var(--cdisc-border)'}; border-radius:var(--radius); cursor:pointer; background:${isSummary ? 'rgba(0,133,124,0.06)' : 'white'}; min-width:140px; max-width:200px; transition:border-color 0.15s, background 0.15s;">
                  <div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
                    ${isSummary ? '<span style="font-size:12px;">&#9733;</span>' : ''}
                    <strong style="font-size:12px;">${patternName}</strong>
                  </div>
                  <span class="ep-summary-badge" style="display:${isSummary ? 'inline-block' : 'none'}; font-size:9px; font-weight:600; color:var(--cdisc-teal, #00857c); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">Summary Measure</span>
                  ${patternDef?.definition ? `<div style="font-size:10px; color:var(--cdisc-gray); margin-bottom:4px; line-height:1.3;">${patternDef.definition.length > 60 ? patternDef.definition.slice(0, 60) + '...' : patternDef.definition}</div>` : ''}
                  <div style="font-size:10px; color:var(--cdisc-text-secondary);">
                    ${constituents.slice(0, 4).join(', ')}${constituents.length > 4 ? ', ...' : ''}
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
          })() : ''}
        </div>
        ` : ''}

        ${syntax || formalized ? `
        <!-- Formalized Endpoint Description -->
        <div style="margin-bottom:16px; border-top:2px solid var(--cdisc-border); padding-top:12px;">
          <div style="font-weight:700; font-size:13px; margin-bottom:4px;">Formalized Endpoint Description</div>
          <div style="font-size:11px; color:var(--cdisc-gray); margin-bottom:12px;">
            Structured decomposition that makes implicit aspects of the protocol text explicit.
            ${estimandDesc ? ' Includes ICH E9(R1) estimand-style statement.' : ''}
          </div>

          <!-- Before / After / Estimand comparison -->
          <div style="display:grid; grid-template-columns:${estimandDesc ? '1fr 1fr 1fr' : '1fr 1fr'}; gap:12px; margin-bottom:12px;">
            <div>
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-gray); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Original (Protocol)</div>
              <div style="padding:10px 14px; background:var(--cdisc-light-gray); border-radius:var(--radius); font-size:12px; line-height:1.5; color:var(--cdisc-text-secondary); border-left:3px solid var(--cdisc-gray);">
                ${originalText}
              </div>
            </div>
            <div>
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-blue); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Formalized (Repaired)</div>
              <div id="formalized-${ep.id}" style="padding:10px 14px; background:var(--cdisc-light-blue); border-radius:var(--radius); font-size:12px; line-height:1.5; color:var(--cdisc-text); border-left:3px solid var(--cdisc-blue); font-weight:500;">
                ${formalized || '<span style="color:var(--cdisc-gray); font-style:italic;">Complete the What + How sections above</span>'}
              </div>
            </div>
            ${estimandDesc ? `
            <div>
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-teal, #00857c); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Estimand (ICH E9(R1))</div>
              <div id="estimand-${ep.id}" style="padding:10px 14px; background:rgba(0,133,124,0.06); border-radius:var(--radius); font-size:12px; line-height:1.5; color:var(--cdisc-text); border-left:3px solid var(--cdisc-teal, #00857c); font-weight:500;">
                ${estimandDesc}
              </div>
            </div>
            ` : ''}
          </div>

          ${syntax ? `
          <div id="syntax-preview-${ep.id}" style="margin-bottom:12px;">
            <div class="ep-syntax-template">${syntax.template}</div>
            <div class="ep-syntax-resolved">${syntax.resolved}</div>
          </div>
          ` : ''}

          <!-- Write-back options -->
          <div style="display:flex; gap:20px; padding:8px 12px; background:var(--cdisc-light-gray); border-radius:var(--radius);">
            <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" class="ep-use-esap" data-ep-id="${ep.id}" ${spec.useInEsap !== false ? 'checked' : ''}>
              Use in eSAP
            </label>
            <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" class="ep-write-usdm" data-ep-id="${ep.id}" ${spec.writeBackToUsdm ? 'checked' : ''}>
              Write back to USDM
            </label>
            <span style="font-size:10px; color:var(--cdisc-gray); margin-left:auto; align-self:center;">
              ${spec.writeBackToUsdm ? 'Protocol text will be updated with formalized description' : ''}
            </span>
          </div>
        </div>
        ` : ''}

        <div class="config-field">
          <label class="config-label">Derivation Notes (optional)</label>
          <input class="config-input ep-deriv-note" data-ep-id="${ep.id}" value="${spec.derivationNote || ''}" placeholder="e.g., Sum of 11 items, prorated if 1-3 missing">
        </div>
      </div>
    </div>`;
}
