/**
 * Parse a USDM JSON file into a simplified study object for the app.
 */
export function parseUSDM(usdm) {
  const study = usdm.study;
  const version = study.versions?.[0];
  const design = version?.studyDesigns?.[0];

  return {
    name: study.name || 'Unnamed Study',
    description: study.description,
    rationale: version?.rationale || '',
    versionIdentifier: version?.versionIdentifier,

    // Identifiers
    identifiers: (version?.studyIdentifiers || []).map(si => ({
      id: si.id,
      text: si.text,
      scopeId: si.scopeId
    })),

    // Phase
    phase: design?.studyPhase?.standardCode?.decode || 'Unknown Phase',
    phaseCode: design?.studyPhase?.standardCode?.code,

    // Therapeutic areas
    therapeuticAreas: (design?.therapeuticAreas || []).map(ta => ({
      code: ta.code,
      system: ta.codeSystem,
      decode: ta.decode
    })),

    // Study design fields
    studyType: design?.studyType?.decode || '',
    studyModel: design?.model?.decode || '',
    blindingSchema: design?.blindingSchema?.standardCode?.decode || '',
    intentTypes: (design?.intentTypes || []).map(it => it.decode),

    // Arms
    arms: (design?.arms || []).map(arm => ({
      id: arm.id,
      name: arm.name,
      label: arm.label,
      description: arm.description,
      type: arm.type?.decode || ''
    })),

    // Objectives with nested endpoints
    objectives: (design?.objectives || []).map(obj => ({
      id: obj.id,
      name: obj.name,
      label: obj.label,
      text: obj.text,
      description: obj.description,
      level: obj.level?.decode || '',
      levelCode: obj.level?.code,
      endpoints: (obj.endpoints || []).map(ep => ({
        id: ep.id,
        name: ep.name,
        label: ep.label,
        text: ep.text,
        description: ep.description,
        purpose: ep.purpose,
        level: ep.level?.decode || '',
        levelCode: ep.level?.code,
        biomedicalConceptIds: ep.biomedicalConceptIds || []
      }))
    })),

    // Population (single object in USDM, wrapped as array for convenience)
    populations: (() => {
      const pop = design?.population;
      if (!pop) return [];
      return [{
        id: pop.id,
        name: pop.name,
        label: pop.label,
        description: pop.description,
        includesHealthySubjects: pop.includesHealthySubjects,
        plannedEnrollment: pop.plannedEnrollmentNumber?.value,
        plannedCompletion: pop.plannedCompletionNumber?.value,
        sex: (pop.plannedSex || []).map(s => s.decode).join(', ')
      }];
    })(),

    // Analysis populations
    analysisPopulations: (design?.analysisPopulations || []).map(ap => ({
      id: ap.id,
      name: ap.name,
      label: ap.label,
      description: ap.description,
      text: ap.text
    })),

    // Encounters (visits)
    encounters: (design?.encounters || []).map(enc => ({
      id: enc.id,
      name: enc.name,
      label: enc.label,
      description: enc.description,
      type: enc.type?.decode || '',
      setting: (enc.environmentalSettings || []).map(s => s.decode).join(', '),
      contactMode: (enc.contactModes || []).map(c => c.decode).join(', ')
    })),

    // Narrative content
    narrativeContent: (version?.narrativeContentItems || study.narrativeContentItems || []).map(nc => ({
      id: nc.id,
      name: nc.name,
      text: nc.text
    })),

    // Activities — passed through so BC pickers can group BCs by the
    // protocol activity that collects them. Each activity lists its
    // biomedicalConceptIds directly AND/OR bcCategoryIds that resolve
    // through bcCategories[*].memberIds.
    activities: (design?.activities || []).map(a => ({
      id: a.id,
      name: a.name,
      label: a.label,
      biomedicalConceptIds: a.biomedicalConceptIds || [],
      bcCategoryIds: a.bcCategoryIds || [],
      bcSurrogateIds: a.bcSurrogateIds || []
    })),

    // BC categories — lookup table for the indirect
    // activity.bcCategoryIds → bcCategory.memberIds path used by v4 USDM
    // to group BCs by clinical domain (Vital Signs, Chemistry, Urinalysis).
    bcCategories: (version?.bcCategories || design?.bcCategories || []).map(c => ({
      id: c.id,
      name: c.name,
      label: c.label,
      description: c.description,
      memberIds: c.memberIds || []
    })),

    // Schedule timelines — already consumed by getBCScheduledTimings via
    // the nested USDM path; passed through here so callers can read them
    // from the flat parsed shape too.
    scheduleTimelines: (design?.scheduleTimelines || []).map(t => ({
      id: t.id,
      name: t.name,
      mainTimeline: !!t.mainTimeline,
      instances: (t.instances || []).map(inst => ({
        id: inst.id,
        name: inst.name,
        activityIds: inst.activityIds || []
      }))
    })),

    // Biomedical Concepts (including properties for OC facet classification)
    biomedicalConcepts: (design?.biomedicalConcepts || version?.biomedicalConcepts || []).map(bc => ({
      id: bc.id,
      name: bc.name,
      label: bc.label,
      synonyms: bc.synonyms || [],
      reference: bc.reference || null,
      properties: (bc.properties || []).map(p => ({
        id: p.id,
        name: p.name,
        label: p.label,
        datatype: p.datatype || '',
        isRequired: p.isRequired,
        isEnabled: p.isEnabled,
        code: p.code ? {
          standardCode: p.code.standardCode ? {
            code: p.code.standardCode.code,
            decode: p.code.standardCode.decode,
            codeSystem: p.code.standardCode.codeSystem
          } : null
        } : null,
        responseCodes: (p.responseCodes || []).map(rc => ({
          code: rc.code?.code,
          decode: rc.code?.decode,
          isEnabled: rc.isEnabled
        }))
      }))
    })),

    // Document sections (protocol section → narrative content mapping)
    documentSections: (() => {
      const doc = study.documentedBy?.[0];
      const docVersion = doc?.versions?.[0];
      const contents = docVersion?.contents || [];
      return contents.map(nc => ({
        id: nc.id,
        name: nc.name,
        sectionNumber: nc.sectionNumber,
        sectionTitle: nc.sectionTitle,
        contentItemId: nc.contentItemId,
        childIds: nc.childIds || []
      }));
    })()
  };
}

/**
 * Get all endpoints across all objectives as a flat list.
 */
export function getAllEndpoints(parsedStudy) {
  const endpoints = [];
  const seen = new Set();
  for (const obj of parsedStudy.objectives) {
    for (const ep of obj.endpoints) {
      if (seen.has(ep.id)) continue;
      seen.add(ep.id);
      endpoints.push({
        ...ep,
        objectiveId: obj.id,
        objectiveName: obj.name,
        objectiveText: obj.text,
        objectiveLevel: obj.level
      });
    }
  }
  return endpoints;
}

/**
 * Get visit labels from encounters for dropdown population.
 */
export function getVisitLabels(parsedStudy) {
  return parsedStudy.encounters
    .filter(e => e.label)
    .map(e => e.label);
}

/**
 * Get population names for dropdown population.
 */
export function getPopulationNames(parsedStudy) {
  const items = [];
  for (const p of parsedStudy.populations) {
    if (p.name) items.push({ value: p.name, label: p.description || p.label || p.name });
  }
  for (const ap of parsedStudy.analysisPopulations) {
    if (ap.name) items.push({ value: ap.name, label: ap.text || ap.description || ap.label || ap.name });
  }
  return items;
}

/**
 * Get arm names for dropdown population.
 */
export function getArmNames(parsedStudy) {
  return parsedStudy.arms.map(a => a.name);
}

/**
 * Get the parameter options for an endpoint, respecting the endpoint spec.
 * Priority: spec linked BCs → spec manual name → endpoint BCs → endpoint text.
 */
export function getEndpointParameterOptions(parsedStudy, endpointId, endpointSpecs) {
  const spec = endpointSpecs?.[endpointId];
  if (spec) {
    // Spec with linked BCs
    if (spec.linkedBCIds?.length > 0) {
      const bcIndex = new Map((parsedStudy.biomedicalConcepts || []).map(bc => [bc.id, bc]));
      const names = spec.linkedBCIds.map(id => bcIndex.get(id)?.name).filter(Boolean);
      if (names.length > 0) return names;
    }
    // Spec with manual parameter name
    if (spec.parameterName) return [spec.parameterName];
  }
  // Fall back to BCs on endpoint
  const bcs = getBiomedicalConcepts(parsedStudy, endpointId);
  if (bcs.length > 0) return bcs.map(bc => bc.name);
  // Last resort: endpoint text
  const ep = getAllEndpoints(parsedStudy).find(e => e.id === endpointId);
  return ep ? [ep.text || ep.name] : [];
}

/**
 * Get biomedical concepts linked to a specific endpoint.
 * Falls back to an empty array if the endpoint has no BC references.
 */
export function getBiomedicalConcepts(parsedStudy, endpointId) {
  const endpoint = getAllEndpoints(parsedStudy).find(ep => ep.id === endpointId);
  if (!endpoint?.biomedicalConceptIds?.length) return [];
  const bcIndex = new Map((parsedStudy.biomedicalConcepts || []).map(bc => [bc.id, bc]));
  const bcs = endpoint.biomedicalConceptIds.map(id => bcIndex.get(id)).filter(Boolean);
  // Deduplicate by name — USDM may have multiple BC instances for different
  // activities (e.g. supine vs standing vital signs) that share the same name
  const seen = new Set();
  return bcs.filter(bc => {
    if (seen.has(bc.name)) return false;
    seen.add(bc.name);
    return true;
  });
}

/**
 * Resolve a derivation terminal's BC Topic identifier (e.g., "WEIGHT").
 *
 * Looks up the BC selected at the derivation terminal level (Step 6) first,
 * falling back to the endpoint-level BC (Step 5). Then finds the Topic
 * property of the BC (typically VSTESTCD/LBTESTCD) and returns its standard
 * code decode — this is the value used to filter SDTM observation rows
 * (e.g., VSTESTCD == "WEIGHT").
 *
 * @param {Object} endpointSpec - appState.endpointSpecs[epId]
 * @param {string} slotKey - derivation terminal slot key (from confirmedTerminals)
 * @param {Object} parsedStudy - appState.selectedStudy
 * @returns {{bcName: string, decode: string} | null}
 */
export function getDerivationBCTopicDecode(endpointSpec, slotKey, parsedStudy) {
  if (!endpointSpec || !parsedStudy) return null;

  // Terminal-level BC (Step 6) takes precedence; fall back to endpoint-level (Step 5)
  let bcId = null;
  if (slotKey && Array.isArray(endpointSpec.confirmedTerminals)) {
    const term = endpointSpec.confirmedTerminals.find(t => t.slotKey === slotKey);
    if (term?.linkedBCIds?.length) bcId = term.linkedBCIds[0];
  }
  if (!bcId && endpointSpec.linkedBCIds?.length) bcId = endpointSpec.linkedBCIds[0];
  if (!bcId) return null;

  const bc = (parsedStudy.biomedicalConcepts || []).find(b => b.id === bcId);
  if (!bc) return null;

  // Topic property: matches TESTCD (the SDTM code variable for the observation topic)
  const topicProp = (bc.properties || []).find(p =>
    /TESTCD/i.test(p.name || '') || /TESTCD/i.test(p.label || '')
  );
  const decode = topicProp?.code?.standardCode?.decode;
  if (!decode) return null;

  return { bcName: bc.label || bc.name || bcId, decode };
}

/**
 * Get an arbitrary BC property value by matching property name/label against a regex.
 * Generalizes getDerivationBCTopicDecode to work with any property (ORRESU, ORRES, etc.).
 *
 * @param {Object} endpointSpec - appState.endpointSpecs[epId]
 * @param {string} slotKey - derivation terminal slot key
 * @param {Object} parsedStudy - appState.selectedStudy
 * @param {RegExp|string} attrPattern - regex or string to match against property name/label
 * @returns {{bcName: string, bcId: string, propName: string, value: string, code: string|null, decode: string|null} | null}
 */
export function getDerivationBCAttribute(endpointSpec, slotKey, parsedStudy, attrPattern) {
  if (!endpointSpec || !parsedStudy) return null;

  let bcId = null;
  if (slotKey && Array.isArray(endpointSpec.confirmedTerminals)) {
    const term = endpointSpec.confirmedTerminals.find(t => t.slotKey === slotKey);
    if (term?.linkedBCIds?.length) bcId = term.linkedBCIds[0];
  }
  if (!bcId && endpointSpec.linkedBCIds?.length) bcId = endpointSpec.linkedBCIds[0];
  if (!bcId) return null;

  const bc = (parsedStudy.biomedicalConcepts || []).find(b => b.id === bcId);
  if (!bc) return null;

  const pattern = attrPattern instanceof RegExp ? attrPattern : new RegExp(attrPattern, 'i');
  const prop = (bc.properties || []).find(p =>
    pattern.test(p.name || '') || pattern.test(p.label || '')
  );
  if (!prop) return null;

  const sc = prop.code?.standardCode;
  return {
    bcName: bc.label || bc.name || bcId,
    bcId,
    propName: prop.label || prop.name,
    value: sc?.decode || sc?.code || null,
    code: sc?.code || null,
    decode: sc?.decode || null
  };
}

/**
 * Get the unit-related BC property (ORRESU/STRESU).
 * Returns the BC's unit decode and the BC label (used to determine unit dimension).
 */
export function getDerivationBCUnit(endpointSpec, slotKey, parsedStudy) {
  return getDerivationBCAttribute(endpointSpec, slotKey, parsedStudy, /ORRESU|STRESU|UNIT/i);
}

/**
 * Get the scheduled visits/timepoints where a BC is collected.
 * Searches ALL timelines (main + sub-timelines like VS blood pressure timeline).
 * Returns array of { timeline, timelineName, instance, instanceName }.
 */
export function getBCScheduledTimings(bcId, parsedStudy) {
  // Prefer the flat parsed shape; fall back to nested USDM for raw inputs.
  const activities = parsedStudy?.activities
    || parsedStudy?.versions?.[0]?.studyDesigns?.[0]?.activities
    || parsedStudy?.studyDesigns?.[0]?.activities
    || [];
  const timelines = parsedStudy?.scheduleTimelines
    || parsedStudy?.versions?.[0]?.studyDesigns?.[0]?.scheduleTimelines
    || parsedStudy?.studyDesigns?.[0]?.scheduleTimelines
    || [];

  // Find activity IDs that include this BC
  const actIdsWithBC = new Set(
    activities.filter(a => (a.biomedicalConceptIds || []).includes(bcId)).map(a => a.id)
  );
  if (actIdsWithBC.size === 0) return [];

  const results = [];
  for (const tl of timelines) {
    for (const inst of (tl.instances || [])) {
      if ((inst.activityIds || []).some(aid => actIdsWithBC.has(aid))) {
        results.push({
          timeline: tl.id,
          timelineName: tl.name || tl.id,
          isMainTimeline: !!tl.mainTimeline,
          instance: inst.id,
          instanceName: inst.name || inst.id
        });
      }
    }
  }
  return results;
}
