import { composeFullSentence, findMatchingTransformations, ENDPOINT_CONTEXT_ROLES } from './phrase-engine.js';
import { getOutputMapping } from './transformation-linker.js';

/**
 * Compute the delta between template input bindings and user-customized bindings.
 * Returns { added: [], removed: [] } where each entry is a binding object.
 */
export function computeBindingEdits(templateBindings, customBindings) {
  const key = (b) => `${b.methodRole}|${b.concept}|${b.dataStructureRole || (b.type === 'dimensional' ? 'dimension' : 'measure')}`;
  const templateKeys = new Set((templateBindings || []).map(key));
  const customKeys = new Set((customBindings || []).map(key));

  const added = (customBindings || []).filter(b => !templateKeys.has(key(b)));
  const removed = (templateBindings || []).filter(b => !customKeys.has(key(b)));

  return { added, removed };
}

/**
 * Validate that $references versions match the currently loaded libraries.
 * Returns an array of warning strings (empty if all match).
 */
export function validateReferences(refs, appState) {
  const warnings = [];
  if (!refs) return warnings;

  const checks = [
    {
      refKey: 'transformationLibrary',
      loaded: appState.transformationLibrary,
      versionPath: 'version',
      label: 'Transformation Library'
    },
    {
      refKey: 'acConceptModel',
      loaded: appState.acModel,
      versionPath: 'version',
      label: 'AC Concept Model'
    },
    {
      refKey: 'dcConceptModel',
      loaded: appState.dcModel,
      versionPath: 'version',
      label: 'DC Concept Model'
    }
  ];

  for (const check of checks) {
    const ref = refs[check.refKey];
    if (!ref) continue;
    const loadedVersion = check.loaded?.[check.versionPath];
    if (loadedVersion && ref.version && loadedVersion !== ref.version) {
      warnings.push(
        `${check.label} version mismatch: instance expects ${ref.version}, loaded ${loadedVersion}`
      );
    }
  }

  return warnings;
}

/**
 * Serialize the current appState into a study instance JSON object.
 * Stores only OIDs, user-selected values, and binding deltas — no template metadata.
 */
export function serializeStudyInstance(appState) {
  const now = new Date().toISOString();
  const lib = appState.transformationLibrary;
  const study = appState.selectedStudy;
  const studyName = study?.name || study?.studyTitle || 'Untitled Study';

  const instance = {
    $schema: 'acdc-study-instance.schema.json',
    instanceId: `SI_${studyName.replace(/[^a-zA-Z0-9]+/g, '-')}_${now.slice(0, 10)}`,
    formatVersion: '1.0',
    createdAt: now,
    updatedAt: now,

    $references: {
      transformationLibrary: {
        file: 'lib/transformations/ACDC_Transformation_Library_v06.json',
        version: lib?.version || null
      },
      acConceptModel: {
        file: 'model/concept/AC_Concept_Model_v016.json',
        version: appState.acModel?.version || null
      },
      dcConceptModel: {
        file: 'model/concept/Option_D_Clinical_with_Dimensions.json',
        version: appState.dcModel?.version || null
      }
    },

    studyRef: {
      usdmFile: 'ac-dc-app/data/CDISC_Pilot_Study_usdm.json',
      studyName
    },

    selectedEndpointIds: appState.selectedEndpoints?.map(ep => ep.id) || [],

    esapLinkedNarratives: appState.esapLinkedNarratives || {},

    endpointAnalyses: {},

    endpointSpecs: appState.endpointSpecs || {},

    preferences: {
      modelViewMode: appState.modelViewMode || 'concepts'
    }
  };

  // Serialize each endpoint analysis
  for (const [epId, analysis] of Object.entries(appState.esapAnalyses || {})) {
    const transformation = analysis.transformation;
    if (!transformation) continue;

    // Look up the original template bindings from the library
    const originalTransform = (lib?.analysisTransformations || [])
      .find(t => t.oid === transformation.oid);
    const allBindings = originalTransform?.bindings || transformation.bindings || [];
    const templateBindings = allBindings.filter(b => b.direction !== 'output');

    // Compute binding delta
    const bindingEdits = computeBindingEdits(templateBindings, analysis.customInputBindings);

    // Extract method config overrides (only non-default values)
    const methodConfigOverrides = analysis.methodConfig || {};

    instance.endpointAnalyses[epId] = {
      composedPhrases: (analysis.phrases || []).map(p => ({
        oid: p.oid,
        config: p.config
      })),
      transformationOid: transformation.oid,
      dimensionalSliceValues: analysis.dimensionalSliceValues || null,
      inputBindingEdits: bindingEdits,
      activeInteractions: analysis.activeInteractions || [],
      methodConfigOverrides,
      derivationChain: (analysis.derivationChain || []).map(entry => ({
        slotKey: entry.slotKey,
        concept: entry.concept,
        derivationOid: entry.derivationOid
      })),
      confirmedTerminals: (analysis.confirmedTerminals || []).map(t => ({
        slotKey: t.slotKey,
        concept: t.concept,
        roleLabel: t.roleLabel || ''
      }))
    };
  }

  return instance;
}

/**
 * Build a fully-resolved analysis specification JSON for export/display.
 * Unlike serializeStudyInstance (which stores OIDs + deltas for restoration),
 * this produces a self-describing document with all choices resolved.
 */
export function buildResolvedSpecification(appState, selectedEps, study) {
  const lib = appState.transformationLibrary;
  const conceptMappings = appState.conceptMappings;
  const modelViewMode = appState.modelViewMode || 'concepts';

  // Resolve ADaM mapping for a concept
  function adamVar(conceptName) {
    const entry = conceptMappings?.adam?.concepts?.[conceptName]
      || conceptMappings?.adam?.dimensions?.[conceptName];
    return entry?.variable || null;
  }

  const endpoints = selectedEps.map(ep => {
    const spec = appState.endpointSpecs?.[ep.id] || {};
    const dimValues = spec.dimensionValues || {};
    const analyses = spec.selectedAnalyses || [];
    const derivChain = spec.derivationChain || [];
    const derivations = lib?.derivationTransformations || [];

    // Build derivation pipeline
    const pipeline = derivChain.map(entry => {
      const d = derivations.find(x => x.oid === entry.derivationOid);
      if (!d) return null;
      const inputs = (d.bindings || []).filter(b => b.direction !== 'output').map(b => ({
        concept: b.concept,
        role: b.methodRole,
        adam: adamVar(b.concept),
        ...(b.slice ? { slice: b.slice } : {})
      }));
      const output = (d.bindings || []).find(b => b.direction === 'output');
      return {
        transformationOid: d.oid,
        name: d.name,
        method: d.usesMethod,
        inputs,
        output: output ? { concept: output.concept, adam: adamVar(output.concept) } : null
      };
    }).filter(Boolean);

    // Build analyses
    const analysisSpecs = analyses.map(analysis => {
      const transform = (lib?.analysisTransformations || []).find(t => t.oid === analysis.transformationOid);
      if (!transform) return null;
      const method = appState.methodsCache?.[transform.usesMethod] || null;
      const customBindings = analysis.customInputBindings || [];

      // Bindings
      const bindings = customBindings.map(b => ({
        role: b.methodRole,
        concept: b.concept,
        adam: adamVar(b.concept),
        direction: b.direction || 'input',
        dataStructureRole: b.dataStructureRole,
        ...(b.slice ? { slice: b.slice } : {}),
        ...(b.qualifierType ? { qualifierType: b.qualifierType, qualifierValue: b.qualifierValue } : {}),
        ...(b._custom ? { custom: true } : {})
      }));

      // Outputs
      let outputs = [];
      if (appState.acModel && method) {
        const outputMapping = getOutputMapping(transform, appState.acModel, method, customBindings, analysis.activeInteractions || []);
        outputs = outputMapping.map(slot => ({
          pattern: slot.patternName,
          statistics: slot.constituents,
          indexedBy: slot.identifiedBy
        }));
      }

      return {
        transformationOid: transform.oid,
        name: transform.name,
        method: transform.usesMethod,
        category: transform.acCategory || null,
        bindings,
        interactions: analysis.activeInteractions || [],
        outputs,
        methodConfig: analysis.methodConfigOverrides || {}
      };
    }).filter(Boolean);

    // Estimand attributes
    const estimand = {
      population: dimValues.Population || null,
      treatment: dimValues.Treatment || null,
      variable: null,
      populationLevelSummary: null,
      intercurrentEvents: null
    };

    // Variable description
    const derivation = spec.selectedDerivationOid
      ? derivations.find(d => d.oid === spec.selectedDerivationOid) : null;
    const paramValue = spec.parameterValue || null;
    if (derivation && paramValue) {
      estimand.variable = `${derivation.name} of ${paramValue}`;
    } else if (derivation) {
      estimand.variable = derivation.name;
    } else if (paramValue) {
      estimand.variable = paramValue;
    }
    const visitVal = dimValues.AnalysisVisit || dimValues.Timing || null;
    if (estimand.variable && visitVal) estimand.variable += ` at ${visitVal}`;

    // ADaM variable mapping for all concepts used
    const adamMapping = {};
    const allConcepts = new Set();
    for (const b of (analyses.flatMap(a => a.customInputBindings || []))) {
      allConcepts.add(b.concept);
    }
    for (const entry of derivChain) {
      const d = derivations.find(x => x.oid === entry.derivationOid);
      if (d) for (const b of d.bindings || []) allConcepts.add(b.concept);
    }
    for (const c of allConcepts) {
      const v = adamVar(c);
      if (v) adamMapping[c] = v;
    }

    return {
      id: ep.id,
      name: ep.name,
      level: ep.level,
      originalText: ep.text || '',
      targetDataset: spec.targetDataset || null,
      estimand,
      derivationPipeline: pipeline,
      analyses: analysisSpecs,
      adamMapping
    };
  });

  return {
    $schema: 'acdc-analysis-specification.schema.json',
    generatedAt: new Date().toISOString(),
    study: {
      name: study.name,
      protocol: study.identifiers?.map(i => i.text).join(', ') || '',
      phase: study.phase
    },
    $references: {
      transformationLibrary: { version: lib?.version || null },
      acConceptModel: { version: appState.acModel?.version || null },
      dcConceptModel: { version: appState.dcModel?.version || null }
    },
    endpoints
  };
}

/**
 * Deserialize a study instance JSON into appState, restoring full objects from library references.
 * Returns an array of warning strings.
 */
export function deserializeStudyInstance(json, appState) {
  const warnings = validateReferences(json.$references, appState);
  const lib = appState.transformationLibrary;

  // Restore preferences
  if (json.preferences?.modelViewMode) {
    appState.modelViewMode = json.preferences.modelViewMode;
  }

  // Restore selected endpoints
  if (json.selectedEndpointIds) {
    appState.selectedEndpoints = json.selectedEndpointIds.map(id => ({ id }));
  }

  // Restore endpoint specs
  if (json.endpointSpecs) {
    appState.endpointSpecs = json.endpointSpecs;
  }

  // Restore eSAP linked narratives
  if (json.esapLinkedNarratives) {
    appState.esapLinkedNarratives = json.esapLinkedNarratives;
  }

  // Restore endpoint analyses
  appState.esapAnalyses = {};

  for (const [epId, saved] of Object.entries(json.endpointAnalyses || {})) {
    // Resolve transformation from library by OID
    const transformation = (lib?.analysisTransformations || [])
      .find(t => t.oid === saved.transformationOid);

    if (!transformation) {
      warnings.push(`Transformation ${saved.transformationOid} not found in loaded library`);
      continue;
    }

    // Reconstruct customInputBindings from template + edits
    const templateBindings = JSON.parse(JSON.stringify(
      (transformation.bindings || []).filter(b => b.direction !== 'output')
    ));
    let customBindings = templateBindings;

    if (saved.inputBindingEdits) {
      const removedKeys = new Set(
        (saved.inputBindingEdits.removed || [])
          .map(b => `${b.methodRole}|${b.concept}|${b.dataStructureRole || (b.type === 'dimensional' ? 'dimension' : 'measure')}`)
      );
      customBindings = templateBindings.filter(
        b => !removedKeys.has(`${b.methodRole}|${b.concept}|${b.dataStructureRole || (b.type === 'dimensional' ? 'dimension' : 'measure')}`)
      );
      customBindings.push(...(saved.inputBindingEdits.added || []));
    }

    // Filter out endpoint-context-role phrases from old saves (backward compatibility)
    // These are now implicitly derived from the endpoint spec rather than stored.
    const cleanedPhrases = (saved.composedPhrases || []).filter(p => {
      const sp = lib?.smartPhrases?.find(s => s.oid === p.oid);
      return !sp || !ENDPOINT_CONTEXT_ROLES.has(sp.role);
    });

    // Re-find matching transformations from phrase OIDs
    const phraseOids = cleanedPhrases.map(p => p.oid);
    const matchedTransformations = findMatchingTransformations(phraseOids, lib);

    appState.esapAnalyses[epId] = {
      phrases: cleanedPhrases,
      transformation: transformation,
      matchedTransformations,
      methodConfig: saved.methodConfigOverrides || {},
      resolvedSentence: null, // caller recomputes via composeFullSentence
      selectedDerivations: {},
      derivationChain: saved.derivationChain || [],
      confirmedTerminals: saved.confirmedTerminals || [],
      customInputBindings: customBindings,
      activeInteractions: saved.activeInteractions || [],
      dimensionalSliceValues: saved.dimensionalSliceValues || null
    };

    // Rebuild selectedDerivations lookup from derivationChain
    for (const entry of saved.derivationChain || []) {
      appState.esapAnalyses[epId].selectedDerivations[entry.slotKey] = entry.derivationOid;
    }
  }

  // Reset transient state
  appState.currentEndpointId = null;
  appState.composedPhrases = [];
  appState.matchedTransformations = [];
  appState.selectedTransformation = null;
  appState.selectedDerivations = {};
  appState.derivationChain = [];
  appState.confirmedTerminals = [];
  appState.customInputBindings = null;
  appState.activeInteractions = [];
  appState.dimensionalSliceValues = null;

  return warnings;
}
