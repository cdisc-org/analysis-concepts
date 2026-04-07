import { appState, navigateTo } from '../app.js';
import {
  getAllEndpoints, getBiomedicalConcepts, getBCScheduledTimings,
  getVisitLabels, getPopulationNames, getArmNames,
  getEndpointParameterOptions
} from '../utils/usdm-parser.js';
import { buildSliceLookup } from '../utils/concept-display.js';

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
      options.push({ value: conceptName, label: `${conceptName} (${catName})`, category: catName });
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

  for (const [catName, cat] of Object.entries(dcModel.categories)) {
    if (cat.concepts?.[conceptCategory]) {
      return { categoryName: catName, category: cat, concept: cat.concepts[conceptCategory] };
    }
  }
  return null;
}

/**
 * Get dimensional relationships for a concept category from the DC model.
 * NOTE: DC model Option_B (atomic concepts) no longer uses dimensionalRelationships.
 * This function is retained for backward compatibility but always returns null.
 */
export function getDimensionalRelationships(conceptCategory) {
  // Option_B atomic concepts have no dimensionalRelationships field
  return null;
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
  // Priority 1: cubeDimensions Parameter slice
  const paramDim = (spec.cubeDimensions || []).find(d => d.dimension === 'Parameter');
  if (paramDim?.sliceValue) return paramDim.sliceValue;
  // Priority 2: linked BCs
  if (spec.linkedBCIds?.length > 0) {
    const bcIndex = new Map(((study?.biomedicalConcepts || study?.versions?.[0]?.biomedicalConcepts) || []).map(bc => [bc.id, bc]));
    const names = spec.linkedBCIds.map(id => bcIndex.get(id)?.name).filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }
  // Priority 3: manual parameter name
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

  // === Fallback: Smart-phrase-based mode (from selected phrases + cube dimensions) ===
  const lib = appState.transformationLibrary;
  const smartPhrases = lib?.smartPhrases || [];
  const conceptCategory = spec.conceptCategory;
  const cubeDims = spec.cubeDimensions || [];

  // Find cube slice value for a dimension
  function getCubeSliceValue(dimName) {
    const entry = cubeDims.find(d => d.dimension === dimName);
    return entry?.sliceValue || spec.dimensionValues?.[dimName] || '';
  }

  // Find the selected endpoint phrase (or first match)
  const selectedEpOid = spec.selectedEndpointPhrase;
  const endpointPhrase = selectedEpOid
    ? smartPhrases.find(sp => sp.oid === selectedEpOid)
    : smartPhrases.find(sp => sp.role === 'endpoint' && sp.references?.includes(conceptCategory));

  // Build base template from endpoint phrase
  let templateBase = endpointPhrase?.phrase_template || `${conceptCategory}`;
  let resolvedBase = templateBase;

  // Resolve placeholders in the endpoint phrase
  for (const cfg of (endpointPhrase?.configurations || [])) {
    const token = `{${cfg}}`;
    if (!templateBase.includes(token)) continue;

    // Map config name to dimension/value
    let val = '';
    if (cfg === 'parameter') val = getSpecParameterValue(ep.id, spec, study) || '';
    else if (cfg === 'event') val = getSpecParameterValue(ep.id, spec, study) || '';
    else val = getCubeSliceValue(cfg.charAt(0).toUpperCase() + cfg.slice(1)) || '';

    resolvedBase = val
      ? resolvedBase.replace(token, `<strong>${val}</strong>`)
      : resolvedBase.replace(token, `<span class="placeholder">${token}</span>`);
  }

  // Append selected dimension phrases
  const selectedDimOids = spec.selectedDimPhrases || [];
  let templateSuffix = '';
  let resolvedSuffix = '';

  for (const oid of selectedDimOids) {
    const sp = smartPhrases.find(s => s.oid === oid);
    if (!sp) continue;

    const phTpl = sp.phrase_template;
    templateSuffix += ` ${phTpl}`;

    // Resolve this phrase's placeholders from cube values
    let resolvedPh = phTpl;
    for (const cfg of (sp.configurations || [])) {
      const token = `{${cfg}}`;
      if (!resolvedPh.includes(token)) continue;

      // Map config name to dimension name and get cube value
      const dimRef = sp.references?.[0] || '';
      const val = getCubeSliceValue(dimRef) || '';

      resolvedPh = val
        ? resolvedPh.replace(token, `<strong>${val}</strong>`)
        : resolvedPh.replace(token, `<span class="placeholder">${token}</span>`);
    }
    resolvedSuffix += ` ${resolvedPh}`;
  }

  const template = `${conceptCategory} ${templateBase}${templateSuffix}`;
  const resolved = `${resolvedBase}${resolvedSuffix}`;

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
  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study in Step 1 first.</p></div>';
    return;
  }

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));
  if (selectedEps.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No endpoints selected</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select endpoints in Step 2 first.</p></div>';
    return;
  }

  if (!appState.endpointSpecs) appState.endpointSpecs = {};

  const conceptOptions = getConceptCategoryOptions();
  const hasAnySpec = selectedEps.some(ep => appState.endpointSpecs[ep.id]?.conceptCategory);

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Endpoint Specification</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
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
        background: var(--cdisc-background);
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
        color: var(--cdisc-text-secondary);
        font-style: italic;
        background: var(--cdisc-background);
        padding: 1px 6px;
        border-radius: 3px;
      }
      .ep-syntax-resolved strong {
        color: var(--cdisc-primary);
      }
      .ep-dim-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
      }
      .ep-derivation-card:hover, .ep-transform-card:hover {
        border-color: var(--cdisc-primary) !important;
      }
      .ep-output-pattern-card:hover {
        border-color: var(--cdisc-accent2) !important;
        background: rgba(0,133,124,0.03) !important;
      }
      .ep-oc-facet-card { transition: border-color 0.15s, background 0.15s; }
      .ep-oc-facet-card:hover { border-color: var(--cdisc-primary) !important; }
      .ep-derivation-config { margin-top: 12px; }
      .ep-composed-phrase {
        font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 12px;
        background: var(--cdisc-primary-light);
        padding: 10px 14px;
        border-radius: var(--radius);
        line-height: 1.6;
        border-left: 3px solid var(--cdisc-primary);
        margin-bottom: 12px;
      }
      .ep-composed-phrase .placeholder {
        color: var(--cdisc-text-secondary);
        font-style: italic;
        background: var(--cdisc-background);
        padding: 1px 6px;
        border-radius: 3px;
      }
      .ep-composed-phrase strong {
        color: var(--cdisc-primary);
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
      appState.endpointSpecs[epId].resolvedBindings = null;
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
      appState.endpointSpecs[epId].resolvedBindings = null;
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
        resolvedBindings: selectedTransform ? JSON.parse(JSON.stringify(
          (selectedTransform.bindings || []).filter(b => b.direction !== 'output')
        )) : null,
        activeInteractions: [],
        estimandSummaryPattern: null
      }];
      appState.endpointSpecs[epId].resolvedBindings = appState.endpointSpecs[epId].selectedAnalyses[0].resolvedBindings;
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
        c.style.borderColor = isSel ? 'var(--cdisc-accent2)' : 'var(--cdisc-border)';
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
        c.style.borderColor = isSel ? 'var(--cdisc-primary)' : 'var(--cdisc-border)';
        c.style.background = isSel ? 'var(--cdisc-primary-light)' : 'white';
        // Update star
        const starSpan = c.querySelector('strong')?.previousElementSibling;
        if (starSpan && starSpan.textContent.includes('★')) {
          starSpan.remove();
        }
        if (isSel) {
          const strong = c.querySelector('strong');
          if (strong && !strong.previousElementSibling?.textContent?.includes('★')) {
            const star = document.createElement('span');
            star.style.cssText = 'font-size:12px; color:var(--cdisc-primary);';
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

  // Derive variable/endpoint description from formalized endpoint (Step 3 syntax template)
  const variableDesc = buildFormalizedDescription(ep, spec, study) || paramValue || '';

  // Population
  const popVal = dimValues.Population || null;

  // Treatment — check dimValues first, then fall back to analysis bindings
  let treatmentVal = dimValues.Treatment || null;
  if (!treatmentVal) {
    // Look for treatment in per-analysis bindings (it's a fixed_effect, not a sliceKey)
    const analyses = spec?.selectedAnalyses || [];
    for (const analysis of analyses) {
      const bindings = analysis.resolvedBindings || [];
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

  const unspecified = '<span style="color:var(--cdisc-text-secondary); font-style:italic;">not specified</span>';
  const notAddressed = '<span style="color:var(--cdisc-warning, #d97706); font-style:italic;">not yet addressed</span>';

  const attrRow = (label, value, icon) => `
    <tr>
      <td style="width:180px; padding:6px 10px; font-weight:600; font-size:11px; color:var(--cdisc-text-secondary); vertical-align:top;">${icon} ${label}</td>
      <td style="padding:6px 10px; font-size:12px;">${value || unspecified}</td>
    </tr>`;

  return `
    <div style="border:1px solid rgba(0,133,124,0.2); border-radius:var(--radius); overflow:hidden;">
      ${estimandDesc ? `
      <div style="padding:10px 14px; background:rgba(0,133,124,0.06); border-bottom:1px solid rgba(0,133,124,0.15); font-size:12px; line-height:1.5; font-weight:500; border-left:3px solid var(--cdisc-accent2);">
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
      <div style="padding:6px 14px; background:var(--cdisc-background); border-top:1px solid var(--cdisc-border); display:flex; align-items:center; gap:8px;">
        <span style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Estimator</span>
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
    formalEl.innerHTML = formalized || '<span style="color:var(--cdisc-text-secondary); font-style:italic;">Complete the What + How sections above</span>';
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
        resolvedBindings: spec.resolvedBindings || null,
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
    spec.resolvedBindings = analyses[0].resolvedBindings;
    spec.activeInteractions = analyses[0].activeInteractions || [];
    spec.estimandSummaryPattern = analyses[0].estimandSummaryPattern;
  } else {
    spec.resolvedBindings = null;
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
  const matchConcept = conceptCategory === 'Observation' ? 'Measure' : conceptCategory;
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

  // The formalized endpoint is the VARIABLE description only.
  // No concept prefix (C.Change), no estimand attributes (Population, Treatment).
  const lib = appState.transformationLibrary;
  const smartPhrases = lib?.smartPhrases || [];
  const cubeDims = spec.cubeDimensions || [];
  const paramValue = getSpecParameterValue(ep.id, spec, study);

  // Find the endpoint phrase
  const epPhrase = spec.selectedEndpointPhrase
    ? smartPhrases.find(sp => sp.oid === spec.selectedEndpointPhrase)
    : smartPhrases.find(sp => sp.role === 'endpoint' && sp.references?.includes(spec.conceptCategory));

  if (!epPhrase) {
    if (paramValue) {
      return `${spec.conceptCategory} of ${paramValue}`;
    }
    return null;
  }

  // Resolve the base phrase
  let desc = epPhrase.phrase_template;
  if (desc.includes('{parameter}')) desc = desc.replace('{parameter}', paramValue || '{parameter}');
  if (desc.includes('{event}')) desc = desc.replace('{event}', paramValue || '{event}');

  // Append only variable-relevant dimension phrases (AnalysisVisit/Timing, NOT Population/Treatment)
  const variableDimRefs = new Set(['AnalysisVisit', 'Timing']);
  for (const oid of (spec.selectedDimPhrases || [])) {
    const sp = smartPhrases.find(s => s.oid === oid);
    if (!sp?.references?.[0]) continue;
    if (!variableDimRefs.has(sp.references[0])) continue; // skip non-variable dims
    let phrase = sp.phrase_template;
    const dimEntry = cubeDims.find(d => d.dimension === sp.references[0]);
    const val = dimEntry?.sliceValue || spec.dimensionValues?.[sp.references[0]] || '';
    for (const cfg of (sp.configurations || [])) {
      phrase = phrase.replace(`{${cfg}}`, val || `{${cfg}}`);
    }
    desc += ` ${phrase}`;
  }

  return desc.charAt(0).toUpperCase() + desc.slice(1);
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
    whatPart = `${spec.conceptCategory} of ${paramValue}`;
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
 * Render the endpoint data cube: measure (from concept), dimension checkboxes,
 * and slice value inputs. The cube defines the data shape the analysis will consume.
 */
export function renderDataCube(ep, spec, study) {
  if (!spec.conceptCategory) return '';

  const concept = spec.conceptCategory;
  const dataType = spec.dataType || 'Quantity';

  /**
   * Build grouped BC options for the Parameter picker.
   * Filters BCs by OC Result.Value compatibility with the selected concept.
   */
  function buildBCParameterOptions(conceptCat, study) {
    const mapping = appState.bcOcInstanceMapping;
    if (!mapping) return [];

    const studyVersion = study?.versions?.[0] || study;
    const studyBCs = studyVersion?.biomedicalConcepts || [];
    if (studyBCs.length === 0) return [];

    const isNumeric = conceptCat !== 'Observation'; // Derived concepts need Quantity
    const compatibleBCs = [];

    for (const bcMap of (mapping.bcMappings || [])) {
      const hasValue = bcMap.propertyMappings?.some(p =>
        p.ocFacet === 'Result.Value' && (isNumeric ? p.ocValueType === 'Quantity' : true)
      );
      if (!hasValue) continue;
      const studyBC = studyBCs.find(bc => bc.id === bcMap.bcId || bc.name === bcMap.bcName);
      if (studyBC) compatibleBCs.push({ id: studyBC.id, name: studyBC.name, code: bcMap.bcCode });
    }

    // Group by domain
    const groups = {};
    for (const bc of compatibleBCs) {
      let group = 'Other';
      const n = bc.name || '';
      if (n.includes('ADAS-Cog')) group = 'ADAS-Cog Items';
      else if (n.includes('Blood Pressure') || n.includes('Heart Rate') || n.includes('Temperature') || n.includes('Weight') || n.includes('Height') || n.includes('Pulse')) group = 'Vital Signs';
      else if (n.includes('Concentration') || n.includes('Presence') || n.includes('Glucose') || n.includes('Aminotransferase') || n.includes('Phosphatase') || n.includes('Albumin') || n.includes('Creatinine') || n.includes('Sodium') || n.includes('Potassium') || n.includes('HbA1c')) group = 'Laboratory';
      else if (n.includes('ECG') || n.includes('Electrocardiogram')) group = 'ECG';
      else if (n.includes('MMSE') || n.includes('CDR') || n.includes('NPI') || n.includes('DAD')) group = 'Efficacy Scales';
      if (!groups[group]) groups[group] = [];
      groups[group].push(bc);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))
      .map(([group, bcs]) => ({ group, bcs }));
  }

  // Available dimensions from DC model (filter non-dimension entries)
  const sharedDims = appState.dcModel?.sharedDimensions || {};
  const allDimNames = Object.entries(sharedDims)
    .filter(([, def]) => typeof def === 'object' && def.cardinality)
    .map(([dim]) => dim);

  // Cube dimensions: array of { dimension, sliceValue }
  if (!spec.cubeDimensions || !Array.isArray(spec.cubeDimensions) || (spec.cubeDimensions.length > 0 && typeof spec.cubeDimensions[0] === 'string')) {
    spec.cubeDimensions = [];
  }

  // Auto-add dimensions implied by selected smart phrases
  const lib = appState.transformationLibrary;
  const allSmartPhrases = lib?.smartPhrases || [];

  // From endpoint phrase
  const epPhraseOid = spec.selectedEndpointPhrase
    || allSmartPhrases.find(sp => sp.role === 'endpoint' && sp.references?.includes(concept))?.oid
    || null;
  if (epPhraseOid && !spec.selectedEndpointPhrase) {
    spec.selectedEndpointPhrase = epPhraseOid;
  }
  const epPhrase = epPhraseOid ? allSmartPhrases.find(sp => sp.oid === epPhraseOid) : null;
  // Build set of known concept names from DC model to distinguish concepts from dimensions
  const knownConcepts = new Set();
  const dcModel = appState.dcModel;
  if (dcModel?.categories) {
    for (const cat of Object.values(dcModel.categories)) {
      for (const name of Object.keys(cat.concepts || {})) knownConcepts.add(name);
    }
  }

  if (epPhrase?.references) {
    for (const ref of epPhrase.references) {
      if (knownConcepts.has(ref) || ref.startsWith('M.')) continue;
      if (!spec.cubeDimensions.some(d => d.dimension === ref)) {
        spec.cubeDimensions.push({ dimension: ref, sliceValue: '' });
      }
    }
  }

  // From selected dimension phrases
  for (const oid of (spec.selectedDimPhrases || [])) {
    const sp = allSmartPhrases.find(s => s.oid === oid);
    if (!sp?.references) continue;
    for (const ref of sp.references) {
      if (knownConcepts.has(ref) || ref.startsWith('M.')) continue;
      if (!spec.cubeDimensions.some(d => d.dimension === ref)) {
        spec.cubeDimensions.push({ dimension: ref, sliceValue: '' });
      }
    }
  }

  const dims = spec.cubeDimensions;

  // Sync cube dimensions to dimensionValues for downstream consumers (eSAP, estimand, etc.)
  if (!spec.dimensionValues) spec.dimensionValues = {};
  for (const d of dims) {
    if (d.sliceValue) spec.dimensionValues[d.dimension] = d.sliceValue;
  }

  // Which dimensions are already added
  const addedDimNames = new Set(dims.map(d => d.dimension));
  const availableDims = allDimNames.filter(d => !addedDimNames.has(d));

  // Build BC options for Parameter dimension (grouped by domain)
  // Is this an observation concept?
  const isObservation = concept === 'Observation';

  // No BC picker for Parameter slice — for Observation, BCs are selected via OC facet section above
  // For DC concepts, parameter is a plain text input
  const bcParameterOptions = [];

  // Dimension rows — for observations, skip slice key dims (Parameter shown as QB slices above)
  const dimRows = dims.filter(d => !(isObservation && d.isSliceKey) && d.dimension !== 'Subject').map((d, i) => {
    const origIdx = dims.indexOf(d); // preserve original index for data-idx
    const options = getDimensionOptions(d.dimension, study);
    const val = d.sliceValue || '';
    const isParameter = d.dimension === 'Parameter';

    let sliceInput;
    if (options && options.length > 0) {
      sliceInput = `
        <select class="config-select ep-cube-slice-value" data-ep-id="${ep.id}" data-idx="${origIdx}" style="width:100%;">
          <option value="">(all values)</option>
          ${options.map(opt => {
            const v = typeof opt === 'object' ? opt.value : opt;
            return `<option value="${v}" ${v === val ? 'selected' : ''}>${v}</option>`;
          }).join('')}
        </select>`;
    } else {
      sliceInput = `
        <input class="config-input ep-cube-slice-value" data-ep-id="${ep.id}" data-idx="${origIdx}"
          value="${val}" placeholder="Enter value or leave empty for all" style="width:100%;">`;
    }

    return `
      <tr style="border-bottom:1px solid var(--cdisc-border);">
        <td style="padding:6px 10px; width:140px; vertical-align:middle;">
          <span class="badge badge-teal" style="font-size:11px; padding:2px 8px;">${d.dimension}</span>
        </td>
        <td style="padding:6px 10px;">${sliceInput}</td>
        <td style="padding:6px 4px; width:32px; text-align:center; vertical-align:middle;">
          <button class="ep-cube-remove-dim" data-ep-id="${ep.id}" data-idx="${origIdx}"
            style="border:none; background:none; color:var(--cdisc-error); cursor:pointer; font-size:14px; padding:2px 6px;">&times;</button>
        </td>
      </tr>`;
  }).join('');

  // Smart phrase for this concept (reuse lib and allSmartPhrases from above)
  const conceptPhrases = allSmartPhrases.filter(sp =>
    sp.role === 'endpoint' && sp.references?.includes(concept)
  );
  const selectedPhrase = spec.selectedEndpointPhrase
    ? allSmartPhrases.find(sp => sp.oid === spec.selectedEndpointPhrase)
    : conceptPhrases[0] || null;
  const phraseInfo = selectedPhrase
    ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:10px; padding:6px 10px; background:var(--cdisc-background); border-radius:var(--radius);">
        Smart phrase: <em>${selectedPhrase.phrase_template}</em>
       </div>`
    : '';

  // Observation-specific: OC facet selection and BC picker
  let observationSection = '';
  if (isObservation) {
    const ocModel = appState.ocModel;
    const instanceFacets = ocModel?.Observation?.instanceStructure || {};
    const mapping = appState.bcOcInstanceMapping;
    const studyVersion = study?.versions?.[0] || study;
    const studyBCs = studyVersion?.biomedicalConcepts || [];

    // Data type compatibility from OC model (no hardcoded map)
    const complexType = ocModel?.valueTypes?.complexTypes?.[dataType];
    const compatPrimitives = new Set(complexType?.compatiblePrimitives || []);
    function isTypeCompatible(facetValueType) {
      if (!facetValueType) return true; // container facets (no valueType) always shown
      const types = facetValueType.split(' | ').map(t => t.trim());
      return types.some(t => t === dataType || compatPrimitives.has(t));
    }

    // Collect OC facets filtered by data type compatibility
    const facetOptions = [];
    function collectFacets(obj, prefix) {
      for (const [key, def] of Object.entries(obj)) {
        if (typeof def !== 'object' || !def.definition) continue;
        if (isTypeCompatible(def.valueType)) {
          facetOptions.push({ path: prefix ? `${prefix}.${key}` : key, definition: def.definition, valueType: def.valueType || '' });
        }
        if (def.dataDefinitions) collectFacets(def.dataDefinitions, prefix ? `${prefix}.${key}` : key);
      }
    }
    collectFacets(instanceFacets, '');

    const selectedFacet = spec.selectedOcFacet || 'Result.Value';

    // Find DISTINCT BCs matching the selected facet + data type
    const seenBCNames = new Set();
    const matchingBCs = [];
    if (mapping?.bcMappings) {
      for (const bcMap of mapping.bcMappings) {
        const matchingProp = bcMap.propertyMappings?.find(p => p.ocFacet === selectedFacet);
        if (!matchingProp) continue;
        // Filter by valueType compatibility using OC model
        if (!isTypeCompatible(matchingProp.ocValueType)) continue;
        // Deduplicate by BC name
        if (seenBCNames.has(bcMap.bcName)) continue;
        seenBCNames.add(bcMap.bcName);

        const studyBC = studyBCs.find(bc => bc.id === bcMap.bcId || bc.name === bcMap.bcName);
        if (studyBC) matchingBCs.push({ id: studyBC.id, name: studyBC.name, code: bcMap.bcCode });
      }
    }

    const linkedBCIds = new Set(spec.linkedBCIds || []);

    observationSection = `
      <!-- OC Facet Selection -->
      <div style="margin-bottom:14px;">
        <div style="font-weight:600; font-size:12px; margin-bottom:6px; color:var(--cdisc-text-secondary);">Observation Concept (OC Facet)</div>
        <select class="config-select ep-oc-facet-select" data-ep-id="${ep.id}" style="width:100%; margin-bottom:8px;">
          ${facetOptions.map(f => `<option value="${f.path}" ${f.path === selectedFacet ? 'selected' : ''}>${f.path}${f.valueType ? ' (' + f.valueType + ')' : ''}</option>`).join('')}
        </select>
        <div style="font-size:11px; color:var(--cdisc-text-secondary);">
          ${facetOptions.find(f => f.path === selectedFacet)?.definition || ''}
        </div>
      </div>

      <!-- BC Selection for this facet -->
      <div style="margin-bottom:14px;">
        <div style="font-weight:600; font-size:12px; margin-bottom:6px; color:var(--cdisc-text-secondary);">
          Biomedical Concepts with ${selectedFacet} <span class="badge badge-secondary" style="font-size:10px;">${matchingBCs.length}</span>
        </div>
        <div style="max-height:280px; overflow-y:auto; border:1px solid var(--cdisc-border); border-radius:var(--radius); padding:4px;">
          ${matchingBCs.length > 0 ? matchingBCs.map(bc => {
            const timings = getBCScheduledTimings(bc.id, study);
            const mainVisits = timings.filter(t => t.isMainTimeline).map(t => t.instanceName);
            const subTimings = timings.filter(t => !t.isMainTimeline);
            const subByTimeline = {};
            for (const st of subTimings) {
              if (!subByTimeline[st.timelineName]) subByTimeline[st.timelineName] = [];
              subByTimeline[st.timelineName].push(st.instanceName);
            }
            return `
              <div style="padding:4px 8px; ${linkedBCIds.has(bc.id) ? 'background:var(--cdisc-primary-light);' : ''} border-bottom:1px solid var(--cdisc-border);">
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                  <input type="checkbox" class="ep-obs-bc-checkbox" data-ep-id="${ep.id}" data-bc-id="${bc.id}" ${linkedBCIds.has(bc.id) ? 'checked' : ''}>
                  <strong>${bc.name}</strong>
                  <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-left:auto;">${bc.code || ''}</span>
                </label>
                ${mainVisits.length > 0 ? `<div style="font-size:10px; color:var(--cdisc-text-secondary); margin:2px 0 0 22px;">Visits: ${mainVisits.join(', ')}</div>` : ''}
                ${Object.entries(subByTimeline).map(([tlName, insts]) =>
                  `<div style="font-size:10px; color:var(--cdisc-accent2); margin:1px 0 0 22px;">${tlName}: ${insts.join(', ')}</div>`
                ).join('')}
              </div>`;
          }).join('') : '<div style="padding:8px; font-size:11px; color:var(--cdisc-text-secondary); font-style:italic; text-align:center;">No BCs found with this facet and data type.</div>'}
        </div>
      </div>`;

    // Auto-build QB-compliant cube from selected BCs
    const selectedBCs = matchingBCs.filter(bc => linkedBCIds.has(bc.id));
    if (selectedBCs.length > 0) {
      // Structural dimensions: Subject (always), Parameter (slice key), Timing
      if (!dims.some(d => d.dimension === 'Subject')) {
        dims.push({ dimension: 'Subject', sliceValue: '' });
      }
      if (!dims.some(d => d.dimension === 'Parameter')) {
        dims.push({ dimension: 'Parameter', sliceValue: '', isSliceKey: true });
      }
      // Don't force isSliceKey if Parameter already exists — user may have toggled it off
      if (!dims.some(d => d.dimension === 'Timing') && !dims.some(d => d.dimension === 'AnalysisVisit')) {
        dims.push({ dimension: 'Timing', sliceValue: '' });
      }

      // Discover additional dimensions from BC properties
      if (mapping?.bcMappings) {
        for (const bc of selectedBCs) {
          const bcMap = mapping.bcMappings.find(m => m.bcId === bc.id || m.bcName === bc.name);
          if (!bcMap) continue;
          for (const prop of (bcMap.propertyMappings || [])) {
            if (prop.ocFacet !== selectedFacet && !dims.some(d => d.dimension === prop.ocFacet)) {
              dims.push({ dimension: prop.ocFacet, sliceValue: '', source: 'bc_property' });
            }
          }
        }
      }

      // Build QB slices: one per selected BC (Parameter = BC name)
      if (!spec.cubeSlices) spec.cubeSlices = [];
      spec.cubeSlices = selectedBCs.map(bc => {
        const timings = getBCScheduledTimings(bc.id, study);
        const mainVisits = timings.filter(t => t.isMainTimeline).map(t => t.instanceName);
        const subTimings = timings.filter(t => !t.isMainTimeline);
        return {
          name: bc.name,
          fixedDimensions: { Parameter: bc.name },
          linkedBCId: bc.id,
          scheduledVisits: mainVisits,
          scheduledSubTimings: subTimings
        };
      });

      // Sync first BC name to dimensionValues for syntax resolution
      if (!spec.dimensionValues) spec.dimensionValues = {};
      spec.dimensionValues.Parameter = selectedBCs.length === 1 ? selectedBCs[0].name : '';
    }
  }

  // Build cross-product resolved slices: merge BC slices × user dimension slices
  // Collect user-set dimension values (non-sliceKey, non-Subject, non-empty)
  const userFixedDims = {};
  for (const d of dims) {
    if (d.sliceValue && !d.isSliceKey && d.dimension !== 'Subject') {
      userFixedDims[d.dimension] = d.sliceValue;
    }
  }
  const baseSlices = spec.cubeSlices || [];
  // Cross-product: merge user fixed dims into each base slice
  const resolvedSlices = baseSlices.length > 0
    ? baseSlices.map(s => ({
        ...s,
        fixedDimensions: { ...s.fixedDimensions, ...userFixedDims }
      }))
    : Object.keys(userFixedDims).length > 0
      ? [{ name: 'endpoint', fixedDimensions: userFixedDims }]
      : [];
  // Build slice key: union of all fixed dimension names
  const sliceKeyDims = [...new Set(resolvedSlices.flatMap(s => Object.keys(s.fixedDimensions || {})))];
  // Store for JSON output
  spec.resolvedSlices = resolvedSlices;
  spec.sliceKeyDimensions = sliceKeyDims;

  return `
    <div style="margin-top:16px; border:1px solid var(--cdisc-border); border-radius:var(--radius); overflow:hidden;">
      <div style="padding:8px 14px; background:var(--cdisc-background); border-bottom:1px solid var(--cdisc-border);">
        <span style="font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-text-secondary);">Endpoint Data Cube</span>
      </div>
      <div style="padding:14px;">
        <!-- Measure -->
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px; padding:8px 12px; background:var(--cdisc-primary-light); border-radius:var(--radius);">
          <span class="badge badge-blue">measure</span>
          <code style="font-size:13px; font-weight:600;">${isObservation ? (spec.selectedOcFacet || 'Result.Value') : concept}</code>
          <span style="font-size:11px; color:var(--cdisc-text-secondary);">(${dataType})</span>
        </div>

        ${observationSection}

        <!-- Dimensions -->
        <div style="margin-bottom:14px;">
          <div style="font-weight:600; font-size:12px; margin-bottom:6px; color:var(--cdisc-text-secondary);">Dimensions</div>
          ${dims.length > 0 ? `
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            ${dims.map((d, i) => `
              <span class="ep-cube-dim-tag" data-ep-id="${ep.id}" data-idx="${i}"
                style="display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border:1px solid ${d.isSliceKey ? 'var(--cdisc-primary)' : 'var(--cdisc-border)'}; border-radius:var(--radius); font-size:12px; cursor:pointer; ${d.isSliceKey ? 'background:var(--cdisc-primary-light);' : ''}"
                title="Click to toggle slice key">
                ${d.dimension}
                ${d.isSliceKey ? '<span style="font-size:9px; color:var(--cdisc-primary);">&#128273;</span>' : ''}
                <button class="ep-cube-remove-dim" data-ep-id="${ep.id}" data-idx="${i}" style="border:none; background:none; color:var(--cdisc-error); cursor:pointer; font-size:12px; padding:0 2px;">&times;</button>
              </span>
            `).join('')}
          </div>
          ` : `
          <div style="padding:12px; font-size:12px; color:var(--cdisc-text-secondary); font-style:italic; border:1px dashed var(--cdisc-border); border-radius:var(--radius); text-align:center;">
            No dimensions yet.
          </div>
          `}
          ${availableDims.length > 0 ? `
          <select class="config-select ep-cube-add-dim" data-ep-id="${ep.id}" style="font-size:12px; padding:4px 8px; border:1px dashed var(--cdisc-border);">
            <option value="">+ Add dimension...</option>
            ${availableDims.map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
          ` : ''}
        </div>

        <!-- Slice inputs (for setting dimension values) -->
        ${dimRows ? `
        <div style="margin-bottom:14px;">
          <div style="font-weight:600; font-size:12px; margin-bottom:6px; color:var(--cdisc-text-secondary);">Dimension Values</div>
          <table style="width:100%; border-collapse:collapse; border:1px solid var(--cdisc-border); border-radius:var(--radius); overflow:hidden;">
            <tbody>${dimRows}</tbody>
          </table>
        </div>
        ` : ''}

        <!-- Resolved slices (cross-product of BC slices × dimension values) -->
        ${resolvedSlices.length > 0 ? `
        <div>
          <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">
            Slices <span style="font-size:10px; font-weight:400;">(${resolvedSlices.length})</span>
          </div>
          ${sliceKeyDims.length > 0 ? `<div style="font-size:10px; color:var(--cdisc-text-secondary); margin-bottom:6px;">Slice key: ${sliceKeyDims.map(d => `<span class="badge badge-secondary" style="font-size:9px;">${d}</span>`).join(' × ')}</div>` : ''}
          ${resolvedSlices.map(s => `
            <div style="padding:6px 10px; border:1px solid var(--cdisc-border); border-radius:var(--radius); margin-bottom:4px; font-size:12px;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                ${Object.entries(s.fixedDimensions || {}).map(([dim, val]) =>
                  `<span><span class="badge badge-teal" style="font-size:10px;">${dim}</span> = <strong>${val}</strong></span>`
                ).join('<span style="color:var(--cdisc-text-secondary);">&middot;</span>')}
              </div>
            </div>
          `).join('')}
        </div>
        ` : ''}

        ${phraseInfo}
      </div>
    </div>`;
}

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
            <span style="font-size:12px; color:var(--cdisc-text-secondary);">${bcs.length > 0 ? `${bcs.length} linked BCs` : 'All study BCs'}</span>
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
          <div style="font-size:12px; color:var(--cdisc-text-secondary); font-style:italic;">
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
    result: 'var(--cdisc-primary)',
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
      <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:8px;">
        Click a facet to tag it as the analysis target. <strong>&#9733;</strong> = current target.
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${facetEntries.map(([facet, group]) => {
          const isTarget = spec.selectedOcFacet === facet;
          const borderColor = isTarget ? 'var(--cdisc-primary)' : 'var(--cdisc-border)';
          const bg = isTarget ? 'var(--cdisc-primary-light)' : 'white';
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
                ${isTarget ? '<span style="font-size:12px; color:var(--cdisc-primary);">&#9733;</span>' : ''}
                <strong style="font-size:12px;">${facet}</strong>
              </div>
              <div style="font-size:10px; color:${roleBadgeColor}; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">${group.role}</div>
              <div style="font-size:10px; color:var(--cdisc-text-secondary); margin-bottom:2px;">${propNames}</div>
              ${dtype ? `<div style="font-size:10px; color:var(--cdisc-text-secondary);">${dtype}</div>` : ''}
              ${responsePreview ? `<div style="font-size:9px; color:var(--cdisc-text-secondary); margin-top:2px; font-style:italic;">${responsePreview}</div>` : ''}
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

  // With Option_B atomic concepts, dimensions are expressed through bindings
  // with dataStructureRole: "dimension", not via separate dimension fields.
  // Fall back to legacy fields if no dimension-role bindings exist (unmigrated library).
  const dimBindings = (derivation.bindings || []).filter(b => b.dataStructureRole === 'dimension');
  const allDims = dimBindings.length > 0
    ? Object.fromEntries(dimBindings.map(b => [b.concept, b.methodRole || 'dimension']))
    : { ...(derivation.inheritedDimensions || {}), ...(derivation.addedDimensions || {}) };
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
                  <div style="padding:6px 10px; background:var(--cdisc-background); border:1px solid var(--cdisc-border); border-radius:var(--radius); font-size:12px; color:${paramValue ? 'var(--cdisc-text)' : 'var(--cdisc-text-secondary)'}; font-style:${paramValue ? 'normal' : 'italic'};">
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
                  ${role ? `<span style="font-size:10px; color:var(--cdisc-text-secondary);">${role}</span>` : ''}
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

  const namedSlices = buildSliceLookup(derivation);
  const outputBinding = (derivation.bindings || []).find(b => b.direction === 'output');
  const inputBindings = (derivation.bindings || []).filter(b => b.direction !== 'output');
  const outputConcept = outputBinding?.concept || derivation.instanceOf || '?';

  // With Option_B, dimensions come from bindings with dataStructureRole: "dimension".
  // Fall back to legacy inheritedDimensions/addedDimensions if no dimension bindings exist.
  const dimBindings = (derivation.bindings || []).filter(b => b.dataStructureRole === 'dimension');
  const allDimEntries = dimBindings.length > 0
    ? dimBindings.map(b => ({ dim: b.concept, role: b.methodRole || 'dimension', source: 'binding' }))
    : [
        ...Object.entries(derivation.inheritedDimensions || {}).map(([d, r]) => ({ dim: d, role: r, source: 'inherited' })),
        ...Object.entries(derivation.addedDimensions || {}).map(([d, r]) => ({ dim: d, role: r, source: 'added' }))
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
      return `<code style="font-size:11px;">${label}</code> <span style="font-size:10px; color:var(--cdisc-text-secondary);">${b.methodRole}</span>`;
    }).join('<br>');

    const isSliced = !!group.slice;
    const borderColor = isSliced ? 'rgba(0,133,124,0.3)' : 'rgba(0,100,200,0.2)';
    const bgColor = isSliced ? 'rgba(0,133,124,0.04)' : 'rgba(0,100,200,0.03)';

    // Fixed-dimension annotation
    const fixedAnnotation = Object.entries(fixedDims).map(([k, v]) =>
      `<span style="font-size:10px; color:var(--cdisc-accent2);">${k} = <strong>${v}</strong></span>`
    ).join(', ');

    return `
      <div style="flex:1; min-width:160px; padding:8px 10px; border:1px solid ${borderColor}; border-radius:var(--radius); background:${bgColor};">
        <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">
          Input${isSliced ? ' (sliced)' : ''}
        </div>
        <div style="margin-bottom:4px;">${conceptList}</div>
        <div style="font-size:10px; color:var(--cdisc-text-secondary); margin-bottom:2px;">
          Dims: ${freeDimStr || 'scalar'}
        </div>
        ${fixedAnnotation ? `<div style="margin-top:2px;">${fixedAnnotation}</div>` : ''}
      </div>`;
  });

  // Output cube card
  const outputFreeDims = allDimEntries.map(d => d.dim).join(' \u00d7 ');
  const outputCard = `
    <div style="flex:1; min-width:160px; padding:8px 10px; border:1px solid rgba(0,100,200,0.3); border-radius:var(--radius); background:rgba(0,100,200,0.05);">
      <div style="font-size:10px; font-weight:600; color:var(--cdisc-primary); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">Output</div>
      <div style="margin-bottom:4px;"><code style="font-size:11px;">${outputConcept}</code> <span style="font-size:10px; color:var(--cdisc-text-secondary);">${outputBinding?.methodRole || ''}</span></div>
      <div style="font-size:10px; color:var(--cdisc-text-secondary);">Dims: ${outputFreeDims}</div>
    </div>`;

  // Build the per-combination description for the output
  const nonSubjectDims = allDimEntries.filter(d => d.dim !== 'Subject');
  const perParts = ['Subject', ...nonSubjectDims.map(d => d.dim)];
  const perDesc = perParts.join(' \u00d7 ');
  const hasCrossJoin = Object.keys(cubeGroups).length > 1 || Object.values(cubeGroups).some(g => g.slice);

  return `
    <div style="margin-top:12px; margin-bottom:12px; padding:12px 16px; background:rgba(0,133,124,0.04); border:1px solid rgba(0,133,124,0.15); border-radius:var(--radius);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <span style="font-size:11px; font-weight:600; color:var(--cdisc-accent2); text-transform:uppercase; letter-spacing:0.5px;">Endpoint Data Structure</span>
        <span class="badge badge-secondary" style="font-size:10px;">${derivation.usesMethod}</span>
      </div>

      <!-- Cube flow: inputs → derivation → output -->
      <div style="display:flex; align-items:stretch; gap:0; flex-wrap:wrap;">
        <!-- Input cubes -->
        <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
          ${cubeCards.join('')}
        </div>

        <!-- Arrow -->
        <div style="display:flex; align-items:center; padding:0 10px; font-size:18px; color:var(--cdisc-text-secondary);">\u2192</div>

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
        <div style="margin-bottom:16px; padding:10px 14px; background:var(--cdisc-primary-light); border-radius:var(--radius); border-left:3px solid var(--cdisc-primary);">
          <div style="font-size:11px; font-weight:600; color:var(--cdisc-primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Protocol Endpoint (Original)</div>
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
        <div style="margin-bottom:16px; border-top:2px solid var(--cdisc-primary); padding-top:12px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <span style="font-weight:700; font-size:13px; color:var(--cdisc-primary); letter-spacing:0.5px;">WHAT</span>
            <span style="font-size:12px; color:var(--cdisc-text-secondary);">${isObservation ? 'Observation &mdash; direct measured/observed value' : 'Derivation &mdash; what quantity is being measured or computed'}</span>
          </div>

          ${isObservation ? `
          <!-- ── Observation (OC) Path ── -->
          ${renderParameterPicker(ep, spec, bcs, allBCs, hasBCs, paramSource)}

          ${primaryBc && classifiedProps.length > 0 ? `
          <!-- OC Facet Cards -->
          ${renderOcFacetCards(classifiedProps, spec, ep.id)}
          ` : `
          <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:11px; color:var(--cdisc-text-secondary);">
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
                    style="padding:10px 14px; border:2px solid ${isSelected ? 'var(--cdisc-primary)' : 'var(--cdisc-border)'}; border-radius:var(--radius); cursor:pointer; background:${isSelected ? 'var(--cdisc-primary-light)' : 'white'}; transition:border-color 0.15s, background 0.15s;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:16px; color:${isSelected ? 'var(--cdisc-primary)' : 'var(--cdisc-text-secondary)'};">${isSelected ? '●' : '○'}</span>
                      <strong style="font-size:13px;">${d.name}</strong>
                      ${d.usesMethod ? `<span class="badge badge-secondary" style="font-size:10px;">${d.usesMethod}</span>` : ''}
                      ${isAuto ? `<span style="font-size:10px; color:var(--cdisc-text-secondary); font-style:italic; margin-left:auto;">auto-selected</span>` : ''}
                    </div>
                    ${d.description ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px; margin-left:24px;">${d.description.length > 120 ? d.description.slice(0, 120) + '...' : d.description}</div>` : ''}
                  </div>`;
              }).join('')}
            </div>
          </div>

          ${selectedDerivation ? renderDerivationConfigPanel(selectedDerivation, spec, study, ep) : `
          <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:11px; color:var(--cdisc-text-secondary);">
            Select a derivation transformation above to configure its parameters.
          </div>
          `}
          ` : `
          <!-- No derivation — source data endpoint, show parameter picker directly -->
          <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:11px; color:var(--cdisc-text-secondary);">
            No endpoint-level derivation for <strong>${spec.conceptCategory}</strong> &mdash; source data endpoint.
          </div>
          ${renderParameterPicker(ep, spec, bcs, allBCs, hasBCs, paramSource)}
          `}
          `}

          ${whatPreview ? `
          <!-- What Template Preview -->
          <div style="margin-bottom:4px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:12px; line-height:1.6;">
            <span style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px;">What: </span>
            ${whatPreview}
          </div>
          ` : ''}
        </div>
        ` : ''}

        ${spec.conceptCategory ? `
        <!-- ═══ HOW: Analysis ═══ -->
        <div style="margin-bottom:16px; border-top:2px solid var(--cdisc-accent2); padding-top:12px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <span style="font-weight:700; font-size:13px; color:var(--cdisc-accent2); letter-spacing:0.5px;">HOW</span>
            <span style="font-size:12px; color:var(--cdisc-text-secondary);">Analysis &mdash; how the quantity is statistically evaluated</span>
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
                    style="padding:10px 14px; border:2px solid ${isSelected ? 'var(--cdisc-accent2)' : 'var(--cdisc-border)'}; border-radius:var(--radius); cursor:pointer; background:${isSelected ? 'rgba(0,133,124,0.06)' : 'white'}; transition:border-color 0.15s, background 0.15s;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:16px; color:${isSelected ? 'var(--cdisc-accent2)' : 'var(--cdisc-text-secondary)'};">${isSelected ? '●' : '○'}</span>
                      <strong style="font-size:13px;">${t.name}</strong>
                      <span class="badge badge-secondary" style="font-size:10px;">${t.acCategory || ''}</span>
                      ${t.usesMethod ? `<span style="font-size:11px; color:var(--cdisc-text-secondary);">${t.usesMethod}</span>` : ''}
                    </div>
                    ${t.description ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px; margin-left:24px;">${t.description.length > 120 ? t.description.slice(0, 120) + '...' : t.description}</div>` : ''}
                  </div>`;
              }).join('')}
            </div>
          </div>
          ` : `
          <div style="margin-bottom:12px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius); font-size:11px; color:var(--cdisc-text-secondary);">
            No analysis transformations found for <strong>${spec.conceptCategory}</strong>. Analysis method to be defined in SAP.
          </div>
          `}

          ${selectedTransform?.sliceKeys?.length > 0 ? `
          <!-- Slice-Driven Dimensional Values -->
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--cdisc-text-secondary);">Dimensional Slices</div>
            <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:12px;">
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
                        ${sk.source ? `<span style="font-size:10px; color:var(--cdisc-text-secondary);">from ${sk.source}</span>` : ''}
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
            <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:12px;">
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
                      <span style="font-size:10px; color:var(--cdisc-text-secondary);">${roleBadge}${isOptional ? ' (optional)' : ''}</span>
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
            <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:8px;">
              Click a result pattern to tag it as the estimand summary measure.
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${patternEntries.map(([slot, patternName]) => {
                const isSummary = spec.estimandSummaryPattern === patternName;
                const patternDef = resultPatterns[patternName];
                const constituents = patternDef?.constituents || [];
                return `
                <div class="ep-output-pattern-card" data-ep-id="${ep.id}" data-pattern-name="${patternName}"
                  style="padding:8px 12px; border:2px solid ${isSummary ? 'var(--cdisc-accent2)' : 'var(--cdisc-border)'}; border-radius:var(--radius); cursor:pointer; background:${isSummary ? 'rgba(0,133,124,0.06)' : 'white'}; min-width:140px; max-width:200px; transition:border-color 0.15s, background 0.15s;">
                  <div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
                    ${isSummary ? '<span style="font-size:12px;">&#9733;</span>' : ''}
                    <strong style="font-size:12px;">${patternName}</strong>
                  </div>
                  <span class="ep-summary-badge" style="display:${isSummary ? 'inline-block' : 'none'}; font-size:9px; font-weight:600; color:var(--cdisc-accent2); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:4px;">Summary Measure</span>
                  ${patternDef?.definition ? `<div style="font-size:10px; color:var(--cdisc-text-secondary); margin-bottom:4px; line-height:1.3;">${patternDef.definition.length > 60 ? patternDef.definition.slice(0, 60) + '...' : patternDef.definition}</div>` : ''}
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
          <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:12px;">
            Structured decomposition that makes implicit aspects of the protocol text explicit.
            ${estimandDesc ? ' Includes ICH E9(R1) estimand-style statement.' : ''}
          </div>

          <!-- Before / After / Estimand comparison -->
          <div style="display:grid; grid-template-columns:${estimandDesc ? '1fr 1fr 1fr' : '1fr 1fr'}; gap:12px; margin-bottom:12px;">
            <div>
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Original (Protocol)</div>
              <div style="padding:10px 14px; background:var(--cdisc-background); border-radius:var(--radius); font-size:12px; line-height:1.5; color:var(--cdisc-text-secondary); border-left:3px solid var(--cdisc-text-secondary);">
                ${originalText}
              </div>
            </div>
            <div>
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Formalized (Repaired)</div>
              <div id="formalized-${ep.id}" style="padding:10px 14px; background:var(--cdisc-primary-light); border-radius:var(--radius); font-size:12px; line-height:1.5; color:var(--cdisc-text); border-left:3px solid var(--cdisc-primary); font-weight:500;">
                ${formalized || '<span style="color:var(--cdisc-text-secondary); font-style:italic;">Complete the What + How sections above</span>'}
              </div>
            </div>
            ${estimandDesc ? `
            <div>
              <div style="font-size:10px; font-weight:600; color:var(--cdisc-accent2); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Estimand (ICH E9(R1))</div>
              <div id="estimand-${ep.id}" style="padding:10px 14px; background:rgba(0,133,124,0.06); border-radius:var(--radius); font-size:12px; line-height:1.5; color:var(--cdisc-text); border-left:3px solid var(--cdisc-accent2); font-weight:500;">
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
          <div style="display:flex; gap:20px; padding:8px 12px; background:var(--cdisc-background); border-radius:var(--radius);">
            <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" class="ep-use-esap" data-ep-id="${ep.id}" ${spec.useInEsap !== false ? 'checked' : ''}>
              Use in eSAP
            </label>
            <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" class="ep-write-usdm" data-ep-id="${ep.id}" ${spec.writeBackToUsdm ? 'checked' : ''}>
              Write back to USDM
            </label>
            <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-left:auto; align-self:center;">
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
