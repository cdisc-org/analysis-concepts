import { composeFullSentence, findMatchingTransformations, ENDPOINT_CONTEXT_ROLES } from './phrase-engine.js';
import { getOutputMapping } from './transformation-linker.js';
import { buildResolvedExpressionObject } from '../views/transformation-config.js';
import { buildSyntaxTemplatePlainText } from '../views/endpoint-spec.js';
import { displayConcept } from './concept-display.js';

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

  // 4. Analysis template contributions
  if (analysisTransform) {
    for (const b of (analysisTransform.bindings || [])) {
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

    // Analysis-defined slices
    for (const s of (analysisTransform.slices || [])) {
      const measureBinding = (analysisTransform.bindings || [])
        .find(b => b.slice === s.name && b.dataStructureRole === 'measure');
      slices.push({
        name: s.name,
        appliesTo: measureBinding ? [measureBinding.concept] : [],
        fixedDimensions: { [s.dimension]: s.constraint },
        source: 'analysis'
      });
    }
  }

  return { measures, dimensions, slices };
}

/**
 * Render a W3C QB-aligned data structure card as HTML.
 */
export function renderMergedDSD(dataStructure) {
  if (!dataStructure) return '';
  const { measures, dimensions, slices, sliceKeys } = dataStructure;

  const sourceBadge = (src) => `<span style="font-size:9px; color:var(--cdisc-text-secondary); margin-left:auto;">&larr; ${src}</span>`;

  const measureRows = measures.map(m => `
    <tr>
      <td style="padding:4px 10px;"><code style="font-weight:600;">${displayConcept(m.concept)}</code></td>
      <td style="padding:4px 10px;"><span class="badge badge-blue" style="font-size:10px;">${m.role}</span></td>
      <td style="padding:4px 10px;">${m.slice ? `<span style="font-size:10px; color:var(--cdisc-accent2);">@ ${m.slice}</span>` : ''}</td>
      <td style="padding:4px 10px; text-align:right;">${sourceBadge(m.source)}</td>
    </tr>
  `).join('');

  const dimRows = dimensions.map(d => `
    <tr>
      <td style="padding:4px 10px;"><code>${displayConcept(d.concept)}</code></td>
      <td style="padding:4px 10px;"><span class="badge badge-teal" style="font-size:10px;">${d.role}</span></td>
      <td style="padding:4px 10px;">${d.qualifier ? `<span style="font-size:10px; color:var(--cdisc-text-secondary);">${d.qualifier.type}: ${d.qualifier.value}</span>` : ''}</td>
      <td style="padding:4px 10px; text-align:right;">${sourceBadge(d.source)}</td>
    </tr>
  `).join('');

  const sliceCards = slices.map(s => {
    const fixedEntries = Object.entries(s.fixedDimensions || {}).map(([dim, val]) =>
      `<div style="display:flex; gap:6px; align-items:center; font-size:12px;">
        <span class="badge badge-teal" style="font-size:10px; padding:1px 6px;">${dim}</span>
        <span>=</span>
        <strong>${val}</strong>
      </div>`
    ).join('');
    const appliesLabel = (s.appliesTo || []).map(c => `<code>${displayConcept(c)}</code>`).join(', ');

    return `
      <div style="padding:8px 12px; border:1px solid var(--cdisc-border); border-radius:var(--radius); margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <span style="font-weight:600; font-size:12px;">"${s.name}"</span>
          <span style="font-size:10px; color:var(--cdisc-text-secondary);">applies to ${appliesLabel}</span>
          ${sourceBadge(s.source)}
        </div>
        ${fixedEntries}
      </div>`;
  }).join('');

  return `
    <div style="border:1px solid var(--cdisc-border); border-radius:var(--radius); overflow:hidden; margin-top:16px;">
      <div style="padding:8px 14px; background:var(--cdisc-background); border-bottom:1px solid var(--cdisc-border);">
        <span style="font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-text-secondary);">Data Structure Definition</span>
        <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-left:8px;">(W3C QB)</span>
      </div>
      <div style="padding:14px;">
        <div style="font-weight:600; font-size:11px; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Measures</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
          <tbody>${measureRows}</tbody>
        </table>

        <div style="font-weight:600; font-size:11px; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Dimensions</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
          <tbody>${dimRows}</tbody>
        </table>

        ${sliceKeys?.length > 0 ? `
        <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-bottom:8px;">
          Slice keys: ${sliceKeys.map(sk => `<span class="badge badge-secondary" style="font-size:10px;">${sk.dimensions.join(', ')}</span>`).join(' ')}
        </div>
        ` : ''}

        ${slices.length > 0 ? `
        <div style="font-weight:600; font-size:11px; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Slices</div>
        ${sliceCards}
        ` : ''}
      </div>
    </div>`;
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

    // Build analyses
    const analysisSpecs = analyses.map(analysis => {
      const transform = (lib?.analysisTransformations || []).find(t => t.oid === analysis.transformationOid);
      if (!transform) return null;
      const methodObj = appState.methodsCache?.[transform.usesMethod] || null;
      const customBindings = analysis.customInputBindings || [];

      // Bindings — include all schema-defined fields
      const bindings = customBindings.map(b => ({
        role: b.methodRole,
        concept: b.concept,
        direction: b.direction || 'input',
        dataStructureRole: b.dataStructureRole,
        ...(b.requiredValueType ? { requiredValueType: b.requiredValueType } : {}),
        ...(b.slice ? { slice: b.slice } : {}),
        ...(b.qualifierType ? { qualifierType: b.qualifierType, qualifierValue: b.qualifierValue } : {}),
        ...(b.note ? { note: b.note } : {}),
        ...(b.description ? { description: b.description } : {})
      }));

      // Outputs
      let outputs = [];
      if (appState.acModel && methodObj) {
        const outputMapping = getOutputMapping(transform, appState.acModel, methodObj, customBindings, analysis.activeInteractions || []);
        outputs = outputMapping.map(slot => ({
          pattern: slot.patternName,
          statistics: slot.constituents,
          dimensions: slot.dimensions
        }));
      }

      // Build resolved expression
      const resolvedExpression = methodObj
        ? buildResolvedExpressionObject(customBindings, methodObj, analysis.activeInteractions || [])
        : null;

      // Nest method-related properties under a method object
      return {
        transformationOid: transform.oid,
        name: transform.name,
        method: {
          oid: transform.usesMethod,
          category: transform.acCategory || null,
          configurationValues: analysis.methodConfigOverrides || {},
          ...(resolvedExpression ? { resolvedExpression } : {})
        },
        bindings,
        outputs
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

    // Variable description — use formalized endpoint from Step 3
    const syntax = buildSyntaxTemplatePlainText(ep, spec, study);
    if (syntax) {
      estimand.variable = syntax.charAt(0).toUpperCase() + syntax.slice(1);
    } else {
      const paramValue = spec.parameterValue || dimValues.Parameter || null;
      if (paramValue) estimand.variable = paramValue;
    }

    // W3C QB-aligned merged data structure
    const analysisTransform = spec.selectedTransformationOid
      ? (lib?.analysisTransformations || []).find(t => t.oid === spec.selectedTransformationOid)
      : null;
    const mergedDSD = buildMergedDataStructure(spec, analysisTransform);

    return {
      id: ep.id,
      name: ep.name,
      level: ep.level,
      originalText: ep.text || '',
      targetDataset: spec.targetDataset || null,
      dataStructureDefinition: {
        measures: mergedDSD.measures,
        dimensions: mergedDSD.dimensions,
        ...(mergedDSD.sliceKeys?.length > 0 ? { sliceKeys: mergedDSD.sliceKeys } : {})
      },
      slices: mergedDSD.slices,
      estimand,
      derivationPipeline: pipeline,
      analyses: analysisSpecs
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
