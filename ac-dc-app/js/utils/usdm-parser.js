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
        levelCode: ep.level?.code
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
  for (const obj of parsedStudy.objectives) {
    for (const ep of obj.endpoints) {
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
