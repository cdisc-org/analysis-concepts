import { appState } from '../app.js';

/**
 * Convert the new slices array format to the old namedSlices lookup format.
 * Handles both new (slices array) and legacy (namedSlices object) formats.
 */
export function buildSliceLookup(transformation) {
  const slices = transformation?.slices || [];
  if (slices.length > 0) {
    const lookup = {};
    for (const s of slices) {
      if (!lookup[s.name]) lookup[s.name] = { fixedDimensions: {} };
      lookup[s.name].fixedDimensions[s.dimension] = s.constraint;
    }
    return lookup;
  }
  // Legacy fallback
  return transformation?.namedSlices || {};
}

/**
 * Normalize an inputConcept entry that may be either a plain string
 * ("C.Measure") or an object ({ concept: "C.Measure", note: "..." }).
 * Returns the bare concept string in all cases.
 */
export function normalizeConcept(ic) {
  if (ic == null) return '';
  if (typeof ic === 'string') return ic;
  if (typeof ic === 'object' && ic.concept) return ic.concept;
  return String(ic);
}

/**
 * Resolve the implementation-layer variable name for a concept using
 * the CDDM qualifier system as the primary resolution path.
 *
 * Resolution order:
 * 1. Qualifier-based: concept + qualifierType + qualifierValue → implementationMapping
 * 2. DataType-based: concept + dataType → byDataType in concept-variable-mappings
 * 3. Fallback: concept → generic variable string from concept-variable-mappings
 *
 * @param {string} conceptName - Canonical concept name (e.g., "C.Measure", "Treatment")
 * @param {Object} [options] - Resolution hints
 * @param {string} [options.dataType] - Method dataType (e.g., "decimal", "code")
 * @param {string} [options.qualifierType] - Qualifier type (e.g., "IntentType", "DerivationStatus", "ReferenceFrame")
 * @param {string} [options.qualifierValue] - Qualifier value (e.g., "Planned", "Standardised")
 * @param {string} [options.slice] - Named slice reference (e.g., "baseline")
 * @param {Object} [options.namedSlices] - Named slices map from the transformation
 * @param {Object} [options.dimensionConstraints] - Legacy: inline dimension constraints
 */
export function displayConcept(conceptName, options) {
  // Normalize options: accept string (legacy dataType) or object
  const opts = typeof options === 'string' ? { dataType: options } : (options || {});

  // Build dimensional constraint suffix — prefer slice resolution, fall back to legacy
  // Skip if the concept name already contains an @suffix (formula renderer bakes it in)
  let dimSuffix = '';
  const hasInlineSuffix = conceptName.includes('@');
  if (!hasInlineSuffix) {
    if (opts.slice && opts.namedSlices) {
      dimSuffix = formatSliceDisplay(opts.slice, opts.namedSlices);
    } else if (opts.dimensionConstraints) {
      dimSuffix = formatDimensionConstraints(opts.dimensionConstraints);
    }
  }

  const mode = appState.modelViewMode;
  if (!mode || mode === 'concepts') return conceptName + dimSuffix;

  const combined = mode.startsWith('concepts_');
  const modelKey = combined ? mode.slice(9) : mode;
  if (!modelKey || !appState.conceptMappings?.[modelKey]) return conceptName + dimSuffix;

  // Strip @suffix (e.g., "C.Measure@Baseline" → "C.Measure") for mapping lookup;
  // the suffix is a formula display artefact, not part of the concept identifier
  const lookupName = conceptName.includes('@') ? conceptName.split('@')[0] : conceptName;

  let variable = null;

  // === Path 1: Qualifier-based resolution (authoritative) ===
  if (opts.qualifierType && opts.qualifierValue && appState.qualifierTypes) {
    const qt = appState.qualifierTypes?.qualifierTypes?.[opts.qualifierType];
    if (qt?.implementationMapping?.[modelKey]) {
      // The concept name in the qualifier mapping is the bare name (e.g., "Treatment", "Measure")
      // Strip "C." prefix for lookup
      const bareName = lookupName.startsWith('C.') ? lookupName.slice(2) : lookupName;
      const implMap = qt.implementationMapping[modelKey][bareName];
      if (implMap?.[opts.qualifierValue]) {
        variable = implMap[opts.qualifierValue];
      }
    }
  }

  // === Path 2: DataType-based resolution ===
  if (!variable && opts.dataType) {
    const mappings = appState.conceptMappings?.[modelKey];
    if (mappings) {
      const entry = mappings.concepts?.[lookupName] || mappings.dimensions?.[lookupName];
      if (entry?.byDataType?.[opts.dataType]) {
        variable = entry.byDataType[opts.dataType];
      }
    }
  }

  // === Path 3: Fallback to generic variable ===
  if (!variable) {
    const mappings = appState.conceptMappings?.[modelKey];
    if (mappings) {
      const entry = mappings.concepts?.[lookupName] || mappings.dimensions?.[lookupName];
      variable = entry?.variable;
    }
  }

  // Preserve inline @suffix for display (e.g., C.Measure@Baseline → AVAL@Baseline)
  const inlineSuffix = hasInlineSuffix ? conceptName.slice(conceptName.indexOf('@')) : '';

  if (!variable) return conceptName + dimSuffix;

  if (combined) {
    return `${conceptName}${dimSuffix} [${variable}${inlineSuffix}]`;
  }
  return variable + inlineSuffix + dimSuffix;
}

/**
 * Format dimensionConstraints into a human-readable suffix.
 * Single constraint: " @ Baseline" (value only, since AnalysisVisit is implied).
 * Multiple constraints: " @ AnalysisVisit=Baseline, Population=ITT".
 */
export function formatDimensionConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object') return '';
  const entries = Object.entries(constraints);
  if (entries.length === 0) return '';
  if (entries.length === 1) {
    return ` @ ${entries[0][1]}`;
  }
  return ' @ ' + entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

/**
 * Resolve a named slice to a human-readable display suffix.
 * Accepts a namedSlices lookup object (either legacy namedSlices or the
 * result of buildSliceLookup()) and formats fixedDimensions.
 * e.g., formatSliceDisplay("baseline", { baseline: { fixedDimensions: { AnalysisVisit: "Baseline" } } })
 *       → " @ Baseline"
 */
export function formatSliceDisplay(sliceName, namedSlices) {
  if (!sliceName || !namedSlices) return '';
  const slice = namedSlices[sliceName];
  if (!slice) return ` @ ${sliceName}`;
  const dims = slice.fixedDimensions || slice;
  return formatDimensionConstraints(dims);
}

/**
 * Resolve the dimensional shape and model provenance for a binding.
 *
 * Resolution order:
 * 1. C.* concept → find category in DC model → get dimensionalRelationships
 *    → compute free/fixed dimensions based on slice
 * 2. DC dimensionalConcept (Treatment, Population, etc.) → lookup in DC + OC
 * 3. OC sharedDimension only (Site, Age) → lookup in OC sharedDimensions
 *
 * @param {string} conceptName - Canonical concept name
 * @param {Object} binding - The binding object (with slice, dimensionConstraints, qualifierType, etc.)
 * @param {Object} dcModel - The DC (derivation concept) model
 * @param {Object} ocModel - The OC (observation concept) model
 * @param {Object} [namedSlices] - Named slices lookup object (legacy namedSlices or result of buildSliceLookup())
 * @returns {Object|null} Shape info or null if unresolvable
 */
export function resolveBindingShape(conceptName, binding, dcModel, ocModel, namedSlices) {
  if (!conceptName) return null;

  const result = {
    layer: null,
    source: null,
    categoryName: null,
    freeDimensions: [],
    fixedDimensions: {},
    valueType: null,
    cardinality: null,
    relationship: null,
    qualifierType: null,
    qualifierValue: null
  };

  // === Path 1: C.* concept → DC category lookup ===
  if (conceptName.startsWith('C.') && dcModel) {
    const bareName = conceptName.slice(2);
    const categories = dcModel.categories || {};

    for (const [catName, cat] of Object.entries(categories)) {
      const concepts = cat.concepts || {};
      if (concepts[bareName]) {
        result.layer = 'DC';
        result.source = 'category';
        result.categoryName = catName;

        // Get value type from the concept's result definition
        const conceptDef = concepts[bareName];
        const vt = conceptDef.result?.valueType;
        result.valueType = Array.isArray(vt) ? vt[0] : (vt || null);

        // Get dimensional relationships for this category
        const dimRels = (cat && cat.dimensionalRelationships) ? cat.dimensionalRelationships : {};

        // Compute fixed dimensions from slice
        let fixedDimNames = {};
        if (binding?.slice && namedSlices?.[binding.slice]) {
          const sliceDef = namedSlices[binding.slice];
          fixedDimNames = sliceDef.fixedDimensions || sliceDef;
        } else if (binding?.dimensionConstraints) {
          fixedDimNames = binding.dimensionConstraints;
        }
        result.fixedDimensions = { ...fixedDimNames };

        // Free dimensions = all category dimensions minus fixed ones
        for (const [dimName, dimInfo] of Object.entries(dimRels)) {
          if (fixedDimNames[dimName]) continue;
          result.freeDimensions.push(dimName);
        }

        break;
      }
    }

    if (result.layer) return result;
  }

  // === Path 2: DC dimensionalConcept ===
  if (dcModel) {
    const dimConcepts = dcModel.dimensionalConcepts || {};
    if (dimConcepts[conceptName]) {
      const dcDim = dimConcepts[conceptName];
      result.layer = 'DC';
      result.source = 'dimensionalConcept';

      // Check qualifiers on this dimensional concept
      if (dcDim.qualifiers) {
        result.qualifierType = dcDim.qualifiers.type || null;
        result.qualifierValue = binding?.qualifierValue || null;
      }

      // Look up in OC sharedDimensions for valueType/cardinality/relationship
      const ocDim = ocModel?.sharedDimensions?.[conceptName];
      if (ocDim) {
        result.valueType = ocDim.valueType || null;
        result.cardinality = ocDim.cardinality || null;
        result.relationship = ocDim.relationship || null;
      }

      return result;
    }
  }

  // === Path 3: OC sharedDimension only ===
  if (ocModel) {
    const sharedDims = ocModel.sharedDimensions || {};
    if (sharedDims[conceptName]) {
      const ocDim = sharedDims[conceptName];
      result.layer = 'OC';
      result.source = 'sharedDimension';
      result.valueType = ocDim.valueType || null;
      result.cardinality = ocDim.cardinality || null;
      result.relationship = ocDim.relationship || null;

      if (ocDim.qualifiers) {
        result.qualifierType = ocDim.qualifiers.type || null;
        result.qualifierValue = binding?.qualifierValue || null;
      }

      return result;
    }
  }

  return null;
}
