import { composeFullSentence, findMatchingTransformations, ENDPOINT_CONTEXT_ROLES } from './phrase-engine.js';
import { getOutputMapping, getMethodConfigurations } from './transformation-linker.js';
import { buildResolvedExpressionObject } from '../views/transformation-config.js';
import {
  buildSyntaxTemplatePlainText, buildSyntaxTemplate, buildFormalizedDescription,
  buildEstimandDescription, getSpecParameterValue, getSummaryMeasurePhrase,
  getTransformationByOid, getDerivationTransformationByOid
} from '../views/endpoint-spec.js';
import { ESAP_SECTION_LABELS } from './esap-constants.js';

/**
 * Build a W3C Data Cube-aligned merged data structure from endpoint spec + analysis template.
 * The DSD (measures + dimensions) is structural. Slices declare constraints.
 */
export function buildMergedDataStructure(spec, analysisTransform) {
  const measures = [];
  const dimensions = [];
  const slices = [];
  const cubeDims = spec?.cubeDimensions || [];

  // 1. Endpoint measure (from Step 3 concept category)
  if (spec?.conceptCategory) {
    measures.push({
      concept: spec.conceptCategory,
      role: 'response',
      source: 'endpoint'
    });
  }

  // 2. Endpoint dimensions (from Step 3 cube — structure only, no values)
  for (const d of cubeDims) {
    dimensions.push({
      concept: d.dimension,
      role: d.isSliceKey ? 'sliceKey' : 'constraint',
      source: 'endpoint'
    });
  }

  // 3. Endpoint slices — use pre-computed resolved slices (cross-product of BC slices × dimension values)
  const sliceKeys = [];
  if (spec?.resolvedSlices?.length > 0) {
    for (const s of spec.resolvedSlices) {
      slices.push({
        name: s.name || 'endpoint',
        appliesTo: [spec.conceptCategory],
        fixedDimensions: s.fixedDimensions || {},
        source: 'endpoint',
        ...(s.linkedBCId ? { linkedBCId: s.linkedBCId } : {})
      });
    }
    if (spec.sliceKeyDimensions?.length > 0) {
      sliceKeys.push({ dimensions: spec.sliceKeyDimensions });
    }
  } else {
    // Fallback: derived concept path — single slice from dimension values
    const endpointFixed = {};
    for (const d of cubeDims) {
      if (d.sliceValue) endpointFixed[d.dimension] = d.sliceValue;
    }
    if (Object.keys(endpointFixed).length > 0) {
      slices.push({
        name: 'endpoint',
        appliesTo: [spec.conceptCategory],
        fixedDimensions: endpointFixed,
        source: 'endpoint'
      });
      sliceKeys.push({ dimensions: Object.keys(endpointFixed) });
    }
  }

  // 4. Analysis contributions — use resolvedBindings (user's actual config) if available
  const analyses = spec?.selectedAnalyses || [];
  const analysisBindings = analyses[0]?.resolvedBindings || analysisTransform?.bindings || [];
  if (analysisTransform || analysisBindings.length > 0) {
    for (const b of analysisBindings) {
      if (b.direction === 'output') continue;

      if (b.dataStructureRole === 'measure') {
        if (measures.some(m => m.concept === b.concept && m.role === (b.methodRole || 'response'))) continue;
        measures.push({
          concept: b.concept,
          role: b.methodRole || 'measure',
          source: 'analysis',
          ...(b.slice ? { slice: b.slice } : {})
        });
      } else {
        if (!dimensions.some(d => d.concept === b.concept)) {
          dimensions.push({
            concept: b.concept,
            role: b.methodRole || 'dimension',
            source: 'analysis',
            ...(b.qualifierType ? {
              qualifier: { type: b.qualifierType, value: b.qualifierValue }
            } : {})
          });
        }
      }
    }

    // Analysis-defined slices (W3C QB multi-dimension)
    for (const s of (analysisTransform.slices || [])) {
      const measureBinding = (analysisTransform.bindings || [])
        .find(b => b.slice === s.name && b.dataStructureRole === 'measure');
      const fixedDimensions = {};
      // New format: constraints[] array
      for (const c of (s.constraints || [])) {
        fixedDimensions[c.dimension] = c.value;
      }
      // Backward compat: old single-dimension format
      if (s.dimension && s.constraint) {
        fixedDimensions[s.dimension] = s.constraint;
      }
      slices.push({
        name: s.name,
        appliesTo: measureBinding ? [measureBinding.concept] : [],
        fixedDimensions,
        source: 'analysis'
      });
    }
  }

  // Resolve {placeholder} tokens in slice values using endpoint dimension values
  const dimValues = spec?.dimensionValues || {};
  for (const slice of slices) {
    for (const [dim, val] of Object.entries(slice.fixedDimensions)) {
      if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
        const key = val.slice(1, -1);
        const dimKey = key.charAt(0).toUpperCase() + key.slice(1);
        if (dimValues[dimKey]) slice.fixedDimensions[dim] = dimValues[dimKey];
      }
    }
  }

  return { measures, dimensions, slices };
}

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
    const bindingEdits = computeBindingEdits(templateBindings, analysis.resolvedBindings);

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
        dataStructureRole: b.dataStructureRole,
        ...(b.slice ? { slice: b.slice } : {})
      }));
      const output = (d.bindings || []).find(b => b.direction === 'output');
      return {
        transformationOid: d.oid,
        name: d.name,
        method: d.usesMethod,
        inputs,
        output: output ? { concept: output.concept } : null
      };
    }).filter(Boolean);

    // Build analyses — StudyAnalysis shape (study_esap.schema.json)
    const analysisSpecs = analyses.map((analysis, i) => {
      const transform = (lib?.analysisTransformations || []).find(t => t.oid === analysis.transformationOid);
      if (!transform) return null;
      const methodObj = appState.methodsCache?.[transform.usesMethod] || null;
      const studyBindings = analysis.resolvedBindings || [];

      // Resolved bindings — study-level copies of template bindings (Binding shape)
      const resolvedBindings = studyBindings.map(b => ({
        concept: b.concept,
        methodRole: b.methodRole,
        direction: b.direction || 'input',
        dataStructureRole: b.dataStructureRole,
        ...(b.requiredValueType ? { requiredValueType: b.requiredValueType } : {}),
        ...(b.slice ? { slice: b.slice } : {}),
        ...(b.qualifierType ? { qualifierType: b.qualifierType, qualifierValue: b.qualifierValue } : {}),
        ...(b.note ? { note: b.note } : {}),
        ...(b.description ? { description: b.description } : {})
      }));

      // Configuration values — StudyConfigurationValue shape
      const configValues = Object.entries(analysis.methodConfigOverrides || {})
        .map(([name, value]) => ({ name, value: String(value) }));

      // Resolved slices — StudySlice shape from merged data structure
      const mergedDSD = buildMergedDataStructure(spec, transform);
      const resolvedSlices = (mergedDSD.slices || []).map(s => ({
        name: s.name,
        resolvedValues: s.fixedDimensions || {}
      }));

      // Resolved phrases
      const esapAnalysis = appState.esapAnalyses?.[ep.id];
      const resolvedPhrases = (esapAnalysis?.phrases || []).map(p => {
        const resolvedText = composeFullSentence([p], lib);
        if (!resolvedText) return null;
        return { basedOn: { smartPhraseId: p.oid }, resolvedText };
      }).filter(Boolean);

      // Resolved expression
      const resolvedExpression = methodObj
        ? buildResolvedExpressionObject(studyBindings, methodObj, analysis.activeInteractions || [])
        : null;

      // Outputs (additional property — useful for detail view)
      let outputs = [];
      if (appState.acModel && methodObj) {
        const outputMapping = getOutputMapping(transform, appState.acModel, methodObj, studyBindings, analysis.activeInteractions || [], analysis.outputConfig);
        outputs = outputMapping.map(slot => ({
          pattern: slot.patternName,
          statistics: slot.constituents,
          dimensions: slot.dimensions,
          ...(slot.outputClassName ? { outputClass: slot.outputClassName } : {})
        }));
      }

      // Output configuration — StudyOutputClassConfig[] (only when user has customised)
      const outputConfiguration = analysis.outputConfig
        ? Object.entries(analysis.outputConfig).map(([cls, cfg]) => ({
            outputClass: cls,
            selectedDimensions: cfg.selectedDimensions
          }))
        : null;

      return {
        // StudyStep fields (study_esap.schema.json)
        sequence: i + 1,
        basedOn: { transformationId: transform.oid },
        resolvedBindings,
        ...(configValues.length > 0 ? { configurationValues: configValues } : {}),
        ...(resolvedSlices.length > 0 ? { resolvedSlices } : {}),
        ...(resolvedPhrases.length > 0 ? { resolvedPhrases } : {}),
        ...(resolvedExpression ? { resolvedExpression } : {}),
        ...(outputConfiguration ? { outputConfiguration } : {}),
        // StudyAnalysis extension
        arsAnalysis: { analysisId: `ARS_${transform.oid}_${ep.id}` },
        // Additional properties (transformation-level detail, useful for display)
        method: { oid: transform.usesMethod, category: transform.acCategory || null },
        outputs
      };
    }).filter(Boolean);

    // Treatment — check dimValues first, then fall back to analysis bindings
    let treatmentVal = dimValues.Treatment || null;
    if (!treatmentVal) {
      for (const analysis of analyses) {
        const treatBinding = (analysis.resolvedBindings || []).find(
          b => b.concept === 'Treatment' && b.dataStructureRole === 'dimension'
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

    // Population-level summary — derive from selected estimand summary pattern + method
    let populationLevelSummary = null;
    const primaryAnalysis = analyses[0];
    if (primaryAnalysis && spec.estimandSummaryPattern) {
      const transform = (lib?.analysisTransformations || [])
        .find(t => t.oid === primaryAnalysis.transformationOid);
      if (transform) {
        populationLevelSummary = getSummaryMeasurePhrase(
          spec.estimandSummaryPattern, transform.usesMethod
        );
      }
    }

    // Estimand attributes
    const estimand = {
      population: dimValues.Population || null,
      treatment: treatmentVal,
      variable: null,
      populationLevelSummary,
      intercurrentEvents: null
    };

    // Variable description — use formalized endpoint text, strip concept code prefix
    const syntax = buildSyntaxTemplatePlainText(ep, spec, study);
    if (syntax) {
      // Remove leading concept name (e.g. "Change ") from the syntax if present
      const cleaned = syntax;
      estimand.variable = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    } else {
      const paramValue = spec.parameterValue || dimValues.Parameter || null;
      if (paramValue) estimand.variable = paramValue;
    }

    // --- UI-enrichment fields (for JSON-driven rendering) ---
    const primaryTransform = primaryAnalysis
      ? (lib?.analysisTransformations || []).find(t => t.oid === primaryAnalysis.transformationOid)
      : null;
    const primaryMethod = primaryTransform?.usesMethod ? appState.methodsCache?.[primaryTransform.usesMethod] : null;
    const primaryBindings = primaryAnalysis?.resolvedBindings || primaryTransform?.bindings?.filter(b => b.direction !== 'output') || [];
    const primaryResolvedExpr = primaryMethod
      ? buildResolvedExpressionObject(primaryBindings, primaryMethod, primaryAnalysis?.activeInteractions || [])
      : null;
    const primaryMergedDSD = primaryTransform ? buildMergedDataStructure(spec, primaryTransform) : { slices: [] };
    const primarySlices = (primaryMergedDSD.slices || []).map(s => ({
      name: s.name,
      resolvedValues: s.fixedDimensions || {}
    }));
    const primaryMethodConfigs = primaryMethod && primaryTransform
      ? getMethodConfigurations(primaryMethod, primaryTransform, spec.methodConfigOverrides || {})
      : [];
    const derivTransform = spec.selectedDerivationOid
      ? getDerivationTransformationByOid(spec.selectedDerivationOid)
      : null;

    return {
      id: ep.id,
      name: ep.name,
      level: ep.level,
      originalText: ep.text || '',
      targetDataset: spec.targetDataset || null,
      estimand,
      derivationPipeline: pipeline,
      analyses: analysisSpecs,
      // UI enrichment — pre-computed display values
      $ui: {
        conceptCategory: spec.conceptCategory || null,
        dataType: spec.dataType || null,
        parameterValue: getSpecParameterValue(ep.id, spec, study),
        formalized: buildFormalizedDescription(ep, spec, study) || null,
        estimandDescription: buildEstimandDescription(ep, spec, study) || null,
        syntax: buildSyntaxTemplate(ep, spec, study) || null,
        selectedTransformationOid: spec.selectedTransformationOid || null,
        selectedDerivationOid: spec.selectedDerivationOid || null,
        derivationName: derivTransform?.name || null,
        transformName: primaryTransform?.name || null,
        transformMethod: primaryTransform?.usesMethod || null,
        transformCategory: primaryTransform?.acCategory || null,
        resolvedBindings: primaryBindings,
        resolvedExpression: primaryResolvedExpr,
        resolvedSlices: primarySlices,
        methodConfigs: primaryMethodConfigs,
        derivationChain: spec.derivationChain || [],
        activeInteractions: primaryAnalysis?.activeInteractions || [],
        useInEsap: spec.useInEsap !== false,
        estimandSummaryPattern: spec.estimandSummaryPattern || null
      }
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

// ═══════════════════════════════════════════════════════════════════════
// eSAP Schema-Aligned Specification (study_esap.schema.json)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a schema-aligned eSAP specification following study_esap.schema.json.
 * Produces USDM-style hierarchy: Study → StudyVersion → StudyDesign → Objectives → Endpoints,
 * with Estimands at the Study level containing StudyAnalysis steps.
 */
export function buildEsapSpecification(appState) {
  const study = appState.selectedStudy;
  const rawStudy = appState.rawUsdm?.study;
  const studyName = study?.name || rawStudy?.name || 'Untitled Study';

  return {
    model: 'eSAP',
    version: '0.1.0',
    description: `Study eSAP for ${studyName}`,
    $provenance: buildProvenance(appState),
    study: buildStudyEntity(appState)
  };
}

/** Build $provenance declaring external model dependencies. */
function buildProvenance(appState) {
  const lib = appState.transformationLibrary;
  return {
    usdm: {
      model: 'CDISC Unified Study Definitions Model',
      version: '4.0',
      uri: 'https://www.cdisc.org/usdm',
      entities: [
        'Study', 'StudyVersion', 'StudyDesign', 'Objective', 'Endpoint',
        'AnalysisPopulation', 'StudyIntervention', 'IntercurrentEvent',
        'StudyDefinitionDocument', 'NarrativeContent', 'StudyTitle'
      ]
    },
    acdc_transformation: {
      model: 'AC/DC Transformation & Method Model',
      schemaRef: 'https://cdisc.org/acdc/transformation',
      entities: ['Transformation', 'SmartPhrase'],
      ...(lib?.version ? { version: lib.version } : {})
    },
    ars: {
      model: 'Analysis Results Standard',
      uri: 'https://www.cdisc.org/ars',
      entities: ['Analysis']
    }
  };
}

/** Build the root Study entity with USDM hierarchy. */
function buildStudyEntity(appState) {
  const study = appState.selectedStudy;
  const raw = appState.rawUsdm?.study;

  return {
    id: raw?.id || 'Study_1',
    name: raw?.name || study?.name || 'Untitled Study',
    ...(raw?.label ? { label: raw.label } : {}),
    ...(raw?.description ? { description: raw.description } : {}),
    versions: [buildStudyVersion(appState)],
    estimands: buildEstimands(appState),
    documentedBy: buildDocumentedBy(appState)
  };
}

/** Build StudyVersion with titles and nested StudyDesign. */
function buildStudyVersion(appState) {
  const raw = appState.rawUsdm?.study;
  const rawVersion = raw?.versions?.[0];
  const study = appState.selectedStudy;

  // Titles — carry through from raw USDM or synthesize
  const titles = rawVersion?.titles?.map(t => ({
    id: t.id,
    text: t.text,
    ...(t.type?.decode ? { type: t.type.decode } : {})
  })) || [{ id: 'StudyTitle_1', text: study?.name || 'Untitled' }];

  return {
    id: rawVersion?.id || 'StudyVersion_1',
    versionIdentifier: rawVersion?.versionIdentifier || '1',
    ...(rawVersion?.rationale ? { rationale: rawVersion.rationale } : {}),
    titles,
    studyDesigns: [buildStudyDesign(appState)]
  };
}

/** Build StudyDesign with filtered objectives containing only selected endpoints. */
function buildStudyDesign(appState) {
  const raw = appState.rawUsdm?.study;
  const rawDesign = raw?.versions?.[0]?.studyDesigns?.[0];

  return {
    id: rawDesign?.id || 'StudyDesign_1',
    name: rawDesign?.name || 'Study Design 1',
    ...(rawDesign?.description ? { description: rawDesign.description } : {}),
    objectives: buildObjectives(appState)
  };
}

/** Build Objective[] filtered to only those containing selected endpoints. */
function buildObjectives(appState) {
  const study = appState.selectedStudy;
  // selectedEndpoints may be string IDs or objects with .id
  const selectedIds = new Set(
    (appState.selectedEndpoints || []).map(ref => typeof ref === 'string' ? ref : ref.id)
  );
  if (!study?.objectives || selectedIds.size === 0) return [];

  return study.objectives
    .map(obj => {
      const selectedEps = obj.endpoints.filter(ep => selectedIds.has(ep.id));
      if (selectedEps.length === 0) return null;
      return {
        id: obj.id,
        name: obj.name,
        ...(obj.level ? { level: obj.level.toLowerCase().includes('primary') ? 'primary' : 'secondary' } : {}),
        endpoints: selectedEps.map(ep => buildEndpointEntity(appState, ep))
      };
    })
    .filter(Boolean);
}

/** Build a single Endpoint entity with derivationSteps. */
function buildEndpointEntity(appState, ep) {
  const result = {
    id: ep.id,
    name: ep.name,
    ...(ep.text ? { text: ep.text } : {}),
    ...(ep.level ? { level: ep.level.toLowerCase().includes('primary') ? 'primary' : 'secondary' } : {})
  };

  const derivSteps = buildDerivationSteps(appState, ep.id);
  if (derivSteps.length > 0) {
    result.derivationSteps = derivSteps;
  }

  return result;
}

/** Build StudyDerivation[] from the endpoint's derivation chain. */
function buildDerivationSteps(appState, epId) {
  const spec = appState.endpointSpecs?.[epId];
  const chain = spec?.derivationChain || [];
  const lib = appState.transformationLibrary;
  if (chain.length === 0) return [];

  return chain.map((entry, i) => {
    const template = (lib?.derivationTransformations || [])
      .find(d => d.oid === entry.derivationOid);
    const outputBinding = template?.bindings?.find(b => b.direction === 'output');

    // Resolved bindings — from derivation template bindings (Binding shape)
    const resolvedBindings = (template?.bindings || []).map(b => ({
      concept: b.concept,
      methodRole: b.methodRole,
      direction: b.direction || 'input',
      dataStructureRole: b.dataStructureRole,
      ...(b.slice ? { slice: b.slice } : {}),
      ...(b.requiredValueType ? { requiredValueType: b.requiredValueType } : {})
    }));

    return {
      sequence: i + 1,
      basedOn: { transformationId: entry.derivationOid },
      resolvedBindings: resolvedBindings.length > 0
        ? resolvedBindings
        : [{ concept: entry.concept, methodRole: 'output', direction: 'output', dataStructureRole: 'measure' }],
      resolvedSlices: [],
      resolvedPhrases: []
    };
  });
}

/** Build Estimand[] — one per configured endpoint that has analysis steps. */
function buildEstimands(appState) {
  const study = appState.selectedStudy;
  const selectedEps = appState.selectedEndpoints || [];
  const allEndpoints = getAllEndpointsFlat(study);

  // selectedEndpoints may be string IDs or objects with .id
  const selectedIds = selectedEps.map(ref => typeof ref === 'string' ? ref : ref.id);

  return selectedIds
    .map(epId => {
      const ep = allEndpoints.find(e => e.id === epId);
      if (!ep) return null;

      const spec = appState.endpointSpecs?.[ep.id] || {};
      const analyses = spec.selectedAnalyses || [];
      if (analyses.length === 0) return null;

      const dimValues = spec.dimensionValues || {};
      const analysisSteps = buildAnalysisSteps(appState, ep.id);
      if (analysisSteps.length === 0) return null;

      // Resolve USDM entity references
      const populationRef = resolveAnalysisPopulation(appState, dimValues.Population);
      const interventionRefs = resolveInterventions(appState, dimValues.Treatment);

      // Build variable description from formalized endpoint, strip concept code prefix
      let variableDescription = null;
      const syntax = buildSyntaxTemplatePlainText(ep, spec, study);
      if (syntax) {
        const cleaned = syntax.replace(/^[A-Z]\.\w+\s+/i, '');
        variableDescription = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }

      // Population-level summary from USDM estimand
      const rawDesign = appState.rawUsdm?.study?.versions?.[0]?.studyDesigns?.[0];
      const rawEstimand = (rawDesign?.estimands || [])
        .find(est => est.variableOfInterestId === ep.id);
      const populationSummary = rawEstimand?.populationSummary || dimValues.Population || null;

      return {
        id: `Estimand_${ep.id}`,
        name: `Estimand for ${ep.name}`,
        ...(variableDescription ? { label: variableDescription } : {}),
        ...(populationSummary ? { populationSummary } : {}),
        // Schema inline refs
        variableOfInterest: { id: ep.id, name: ep.name },
        analysisPopulation: populationRef,
        interventions: interventionRefs,
        intercurrentEvents: resolveIntercurrentEvents(appState, ep.id),
        analysisSteps
      };
    })
    .filter(Boolean);
}

/** Resolve analysis population by matching dimension value to USDM AnalysisPopulation. */
function resolveAnalysisPopulation(appState, populationName) {
  if (!populationName) return { id: 'AnalysisPopulation_unknown', name: 'Unknown' };

  const study = appState.selectedStudy;
  const pops = study?.analysisPopulations || [];
  const normalised = populationName.toLowerCase().trim();

  // Try exact name match, then text match, then substring
  const match = pops.find(p => p.name?.toLowerCase().trim() === normalised)
    || pops.find(p => p.text?.toLowerCase().trim() === normalised)
    || pops.find(p => p.text?.toLowerCase().includes(normalised) || normalised.includes(p.text?.toLowerCase()));

  if (match) return { id: match.id, name: match.name };
  return { id: 'AnalysisPopulation_unresolved', name: populationName };
}

/** Resolve interventions by parsing the Treatment dimension value against USDM arms. */
function resolveInterventions(appState, treatmentValue) {
  if (!treatmentValue) {
    // Schema requires minItems: 1 — fall back to USDM interventions or placeholder
    const rawVersion = appState.rawUsdm?.study?.versions?.[0];
    const fallbackInterventions = rawVersion?.studyInterventions || [];
    if (fallbackInterventions.length > 0) {
      return fallbackInterventions.map(si => ({
        id: si.id, name: si.name,
        ...(si.label ? { description: si.label } : {})
      }));
    }
    return [{ id: 'Intervention_unspecified', name: 'Unspecified' }];
  }

  const study = appState.selectedStudy;
  const arms = study?.arms || [];

  // Also check raw USDM for StudyIntervention entities
  const rawVersion = appState.rawUsdm?.study?.versions?.[0];
  const interventions = rawVersion?.studyInterventions || [];

  // Split on " vs " or " versus "
  const parts = treatmentValue.split(/\s+(?:vs\.?|versus)\s+/i).map(s => s.trim()).filter(Boolean);

  // Match each part against arms
  const matched = [];
  for (const part of parts) {
    const partLower = part.toLowerCase();
    const arm = arms.find(a =>
      a.name?.toLowerCase() === partLower
      || a.label?.toLowerCase() === partLower
      || a.name?.toLowerCase().includes(partLower)
      || partLower.includes(a.name?.toLowerCase())
    );
    if (arm) {
      matched.push({
        id: arm.id,
        name: arm.name,
        ...(arm.type ? { type: arm.type } : {})
      });
    } else {
      matched.push({ id: `Intervention_${part.replace(/[^a-zA-Z0-9]+/g, '_')}`, name: part });
    }
  }

  // If nothing matched from splitting, try using the full value
  if (matched.length === 0) {
    // Fall back: use the USDM StudyIntervention if only one exists
    if (interventions.length > 0) {
      return interventions.map(si => ({
        id: si.id,
        name: si.name,
        ...(si.label ? { description: si.label } : {})
      }));
    }
    return [{ id: 'Intervention_unresolved', name: treatmentValue }];
  }

  return matched;
}

/** Resolve intercurrent events for an endpoint. Currently placeholder — ICE not yet captured in wizard. */
function resolveIntercurrentEvents(appState, epId) {
  // Check raw USDM for estimand ICEs
  const rawDesign = appState.rawUsdm?.study?.versions?.[0]?.studyDesigns?.[0];
  const rawEstimands = rawDesign?.estimands || [];

  // If there's a matching USDM estimand referencing this endpoint, use its ICEs
  for (const est of rawEstimands) {
    if (est.variableOfInterestId === epId && est.intercurrentEvents?.length > 0) {
      return est.intercurrentEvents.map(ice => ({
        id: ice.id,
        name: ice.name,
        ...(ice.strategy ? { strategy: ice.strategy } : {})
      }));
    }
  }

  return [];
}

/** Build StudyAnalysis[] for an endpoint's selected analyses. */
function buildAnalysisSteps(appState, epId) {
  const spec = appState.endpointSpecs?.[epId] || {};
  const analyses = spec.selectedAnalyses || [];
  const lib = appState.transformationLibrary;

  return analyses.map((analysis, i) => {
    const transform = (lib?.analysisTransformations || [])
      .find(t => t.oid === analysis.transformationOid);
    if (!transform) return null;

    const studyBindings = analysis.resolvedBindings || [];
    const methodObj = appState.methodsCache?.[transform.usesMethod] || null;
    const interactions = analysis.activeInteractions || [];

    // Configuration values — StudyConfigurationValue shape
    const configValues = Object.entries(analysis.methodConfigOverrides || {})
      .map(([name, value]) => ({ name, value: String(value) }));

    // Resolved bindings — study-level copies of template bindings (Binding shape)
    const resolvedBindings = studyBindings.map(b => ({
      concept: b.concept,
      methodRole: b.methodRole,
      direction: b.direction || 'input',
      dataStructureRole: b.dataStructureRole,
      ...(b.requiredValueType ? { requiredValueType: b.requiredValueType } : {}),
      ...(b.slice ? { slice: b.slice } : {}),
      ...(b.qualifierType ? { qualifierType: b.qualifierType, qualifierValue: b.qualifierValue } : {}),
      ...(b.note ? { note: b.note } : {}),
      ...(b.description ? { description: b.description } : {})
    }));

    // Resolved slices — StudySlice shape
    const mergedDSD = buildMergedDataStructure(spec, transform);
    const resolvedSlices = (mergedDSD.slices || []).map(s => ({
      name: s.name,
      resolvedValues: s.fixedDimensions || {}
    }));

    // Resolved phrases
    const resolvedPhrases = buildResolvedPhrases(appState, epId);

    // Resolved expression
    const resolvedExpression = methodObj
      ? buildResolvedExpressionObject(studyBindings, methodObj, interactions)
      : undefined;

    return {
      sequence: i + 1,
      basedOn: { transformationId: analysis.transformationOid },
      resolvedBindings,
      ...(configValues.length > 0 ? { configurationValues: configValues } : {}),
      ...(resolvedSlices.length > 0 ? { resolvedSlices } : {}),
      ...(resolvedPhrases.length > 0 ? { resolvedPhrases } : {}),
      ...(resolvedExpression ? { resolvedExpression } : {}),
      arsAnalysis: { analysisId: `ARS_${analysis.transformationOid}_${epId}` }
    };
  }).filter(Boolean);
}

/** Build StudySmartPhrase[] from the endpoint's composed phrases. */
function buildResolvedPhrases(appState, epId) {
  const esapAnalysis = appState.esapAnalyses?.[epId];
  const phrases = esapAnalysis?.phrases || [];
  const lib = appState.transformationLibrary;
  if (phrases.length === 0 || !lib) return [];

  return phrases.map(p => {
    const sp = lib.smartPhrases?.find(s => s.oid === p.oid);
    if (!sp) return null;

    // Resolve the phrase text
    const resolvedText = composeFullSentence([p], lib);
    if (!resolvedText) return null;

    return {
      basedOn: { smartPhraseId: p.oid },
      resolvedText
    };
  }).filter(Boolean);
}

/** Build Study.documentedBy with eSAP document and linked narrative content. */
function buildDocumentedBy(appState) {
  const linked = appState.esapLinkedNarratives;
  if (!linked) return [];

  const contents = buildEsapNarrativeContents(appState);

  return [{
    id: 'eSAP_Document',
    name: 'electronic Statistical Analysis Plan',
    type: 'eSAP',
    versions: [{
      id: 'eSAP_DocVersion_1',
      contents
    }]
  }];
}

/** Build NarrativeContent[] for each eSAP section. */
function buildEsapNarrativeContents(appState) {
  const linked = appState.esapLinkedNarratives || {};
  const study = appState.selectedStudy;
  const narrativeItems = study?.narrativeContent || [];
  const nciMap = new Map(narrativeItems.map(nc => [nc.id, nc]));

  let sectionIndex = 1;
  return Object.entries(ESAP_SECTION_LABELS).map(([key, label]) => {
    const linkedIds = linked[key] || [];
    const section = {
      id: `eSAP_Section_${key}`,
      name: key,
      sectionNumber: String(sectionIndex++),
      sectionTitle: label
    };

    // Resolve linked content items
    if (linkedIds.length === 1) {
      const nci = nciMap.get(linkedIds[0]);
      if (nci) {
        section.contentItem = { id: nci.id, name: nci.name, ...(nci.text ? { text: nci.text } : {}) };
      }
    } else if (linkedIds.length > 1) {
      section.children = linkedIds.map(id => {
        const nci = nciMap.get(id);
        if (!nci) return null;
        return {
          id: nci.id,
          name: nci.name,
          ...(nci.text ? { contentItem: { id: nci.id, text: nci.text } } : {})
        };
      }).filter(Boolean);
    }

    return section;
  });
}

/** Get all endpoints flat across all objectives (local helper). */
function getAllEndpointsFlat(study) {
  if (!study?.objectives) return [];
  const eps = [];
  for (const obj of study.objectives) {
    for (const ep of (obj.endpoints || [])) {
      eps.push(ep);
    }
  }
  return eps;
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

    // Reconstruct resolvedBindings from template + edits
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
      resolvedBindings: customBindings,
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
  appState.resolvedBindings = null;
  appState.activeInteractions = [];
  appState.dimensionalSliceValues = null;

  return warnings;
}
