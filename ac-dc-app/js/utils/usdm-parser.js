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
 * Get the scheduled visits/timepoints where a BC is collected.
 * Searches ALL timelines (main + sub-timelines like VS blood pressure timeline).
 * Returns array of { timeline, timelineName, instance, instanceName }.
 */
export function getBCScheduledTimings(bcId, parsedStudy) {
  const design = parsedStudy?.versions?.[0]?.studyDesigns?.[0]
    || parsedStudy?.studyDesigns?.[0]
    || {};
  const activities = design.activities || [];
  const timelines = design.scheduleTimelines || [];

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
