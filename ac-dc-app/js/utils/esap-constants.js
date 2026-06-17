/**
 * Shared eSAP section constants — used by both esap-builder (rendering)
 * and instance-serializer (JSON export).
 */

export const ESAP_SECTION_PREFIXES = {
  abbreviations:   ['13'],
  introduction:    ['0', '1'],
  objectives:      ['2'],
  studyDesign:     ['3.1', '3.2', '3.3', '3.5', '3.6', '3.7'],
  protocolChanges: [],
  estimands:       [],
  endpoints:       ['3.9'],
  analysisSets:    ['3.4'],
  statMethods:     ['4'],
  statAnalysis:    [],
  software:        [],
  references:      ['14'],
  shells:          [],
  appendices:      ['12']
};

export const ESAP_SECTION_LABELS = {
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
