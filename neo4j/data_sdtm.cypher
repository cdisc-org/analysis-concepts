// ============================================================================
// SDTM SOURCE DATA LOADING
// ============================================================================
// This file creates SDTM source data nodes for 10 subjects.
// Domains: DM (Demographics), VS (Vital Signs)
//
// This represents the raw source data that will be processed by
// Analysis Concepts to create derived ADaM datasets.
// ============================================================================

// ============================================================================
// SECTION 1: CREATE SUBJECTS
// ============================================================================

// Create 10 subjects
CREATE (:Subject {usubjid: 'ACME-001', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-002', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-003', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-004', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-005', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-006', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-007', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-008', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-009', studyid: 'ACME-2024-001'});
CREATE (:Subject {usubjid: 'ACME-010', studyid: 'ACME-2024-001'});

// ============================================================================
// SECTION 2: DM (DEMOGRAPHICS) DOMAIN DATA
// ============================================================================

// Create DM records with treatment start dates
MATCH (s:Subject {usubjid: 'ACME-001'})
CREATE (dm:DataNode {
  id: 'DM_ACME-001',
  domain: 'DM',
  usubjid: 'ACME-001',
  studyid: 'ACME-2024-001',
  trtsdt: 22645,  // 2024-01-01
  trt01p: 'Treatment A',
  trt01a: 'Treatment A',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-002'})
CREATE (dm:DataNode {
  id: 'DM_ACME-002',
  domain: 'DM',
  usubjid: 'ACME-002',
  studyid: 'ACME-2024-001',
  trtsdt: 22645,  // 2024-01-01
  trt01p: 'Treatment B',
  trt01a: 'Treatment B',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-003'})
CREATE (dm:DataNode {
  id: 'DM_ACME-003',
  domain: 'DM',
  usubjid: 'ACME-003',
  studyid: 'ACME-2024-001',
  trtsdt: 22646,  // 2024-01-02
  trt01p: 'Treatment A',
  trt01a: 'Treatment A',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-004'})
CREATE (dm:DataNode {
  id: 'DM_ACME-004',
  domain: 'DM',
  usubjid: 'ACME-004',
  studyid: 'ACME-2024-001',
  trtsdt: 22646,  // 2024-01-02
  trt01p: 'Treatment B',
  trt01a: 'Treatment B',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-005'})
CREATE (dm:DataNode {
  id: 'DM_ACME-005',
  domain: 'DM',
  usubjid: 'ACME-005',
  studyid: 'ACME-2024-001',
  trtsdt: 22647,  // 2024-01-03
  trt01p: 'Treatment A',
  trt01a: 'Treatment A',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-006'})
CREATE (dm:DataNode {
  id: 'DM_ACME-006',
  domain: 'DM',
  usubjid: 'ACME-006',
  studyid: 'ACME-2024-001',
  trtsdt: 22647,  // 2024-01-03
  trt01p: 'Treatment B',
  trt01a: 'Treatment B',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-007'})
CREATE (dm:DataNode {
  id: 'DM_ACME-007',
  domain: 'DM',
  usubjid: 'ACME-007',
  studyid: 'ACME-2024-001',
  trtsdt: 22648,  // 2024-01-04
  trt01p: 'Treatment A',
  trt01a: 'Treatment A',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-008'})
CREATE (dm:DataNode {
  id: 'DM_ACME-008',
  domain: 'DM',
  usubjid: 'ACME-008',
  studyid: 'ACME-2024-001',
  trtsdt: 22648,  // 2024-01-04
  trt01p: 'Treatment B',
  trt01a: 'Treatment B',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-009'})
CREATE (dm:DataNode {
  id: 'DM_ACME-009',
  domain: 'DM',
  usubjid: 'ACME-009',
  studyid: 'ACME-2024-001',
  trtsdt: 22649,  // 2024-01-05
  trt01p: 'Treatment A',
  trt01a: 'Treatment A',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

MATCH (s:Subject {usubjid: 'ACME-010'})
CREATE (dm:DataNode {
  id: 'DM_ACME-010',
  domain: 'DM',
  usubjid: 'ACME-010',
  studyid: 'ACME-2024-001',
  trtsdt: 22649,  // 2024-01-05
  trt01p: 'Treatment B',
  trt01a: 'Treatment B',
  sourceType: 'SDTM',
  sourceDataset: 'DM'
})
CREATE (dm)-[:FOR_SUBJECT]->(s);

// ============================================================================
// SECTION 3: VS (VITAL SIGNS) DOMAIN DATA - SYSTOLIC BP
// ============================================================================

// Subject ACME-001: Baseline + 2 post-baseline visits
MATCH (s:Subject {usubjid: 'ACME-001'})
CREATE (vs1:DataNode {
  id: 'VS_ACME-001_SYSBP_BASELINE',
  domain: 'VS',
  usubjid: 'ACME-001',
  vstestcd: 'SYSBP',
  vstest: 'Systolic Blood Pressure',
  vsorres: '130',
  vsstresn: 130.0,
  vsstresu: 'mmHg',
  vsdtc: '2023-12-30T10:00',
  vsdt: 22642,  // 2023-12-30 (pre-treatment)
  visitnum: 1,
  visit: 'Screening',
  sourceType: 'SDTM',
  sourceDataset: 'VS'
})
CREATE (vs2:DataNode {
  id: 'VS_ACME-001_SYSBP_WEEK2',
  domain: 'VS',
  usubjid: 'ACME-001',
  vstestcd: 'SYSBP',
  vstest: 'Systolic Blood Pressure',
  vsorres: '125',
  vsstresn: 125.0,
  vsstresu: 'mmHg',
  vsdtc: '2024-01-15T10:00',
  vsdt: 22659,  // 2024-01-15
  visitnum: 2,
  visit: 'Week 2',
  sourceType: 'SDTM',
  sourceDataset: 'VS'
})
CREATE (vs3:DataNode {
  id: 'VS_ACME-001_SYSBP_WEEK4',
  domain: 'VS',
  usubjid: 'ACME-001',
  vstestcd: 'SYSBP',
  vstest: 'Systolic Blood Pressure',
  vsorres: '122',
  vsstresn: 122.0,
  vsstresu: 'mmHg',
  vsdtc: '2024-01-29T10:00',
  vsdt: 22673,  // 2024-01-29
  visitnum: 3,
  visit: 'Week 4',
  sourceType: 'SDTM',
  sourceDataset: 'VS'
})
CREATE (vs1)-[:FOR_SUBJECT]->(s)
CREATE (vs2)-[:FOR_SUBJECT]->(s)
CREATE (vs3)-[:FOR_SUBJECT]->(s);

// Subject ACME-002: Baseline + 2 post-baseline visits
MATCH (s:Subject {usubjid: 'ACME-002'})
CREATE (vs1:DataNode {
  id: 'VS_ACME-002_SYSBP_BASELINE',
  domain: 'VS',
  usubjid: 'ACME-002',
  vstestcd: 'SYSBP',
  vstest: 'Systolic Blood Pressure',
  vsorres: '135',
  vsstresn: 135.0,
  vsstresu: 'mmHg',
  vsdtc: '2023-12-30T11:00',
  vsdt: 22642,
  visitnum: 1,
  visit: 'Screening',
  sourceType: 'SDTM',
  sourceDataset: 'VS'
})
CREATE (vs2:DataNode {
  id: 'VS_ACME-002_SYSBP_WEEK2',
  domain: 'VS',
  usubjid: 'ACME-002',
  vstestcd: 'SYSBP',
  vstest: 'Systolic Blood Pressure',
  vsorres: '130',
  vsstresn: 130.0,
  vsstresu: 'mmHg',
  vsdtc: '2024-01-15T11:00',
  vsdt: 22659,
  visitnum: 2,
  visit: 'Week 2',
  sourceType: 'SDTM',
  sourceDataset: 'VS'
})
CREATE (vs3:DataNode {
  id: 'VS_ACME-002_SYSBP_WEEK4',
  domain: 'VS',
  usubjid: 'ACME-002',
  vstestcd: 'SYSBP',
  vstest: 'Systolic Blood Pressure',
  vsorres: '128',
  vsstresn: 128.0,
  vsstresu: 'mmHg',
  vsdtc: '2024-01-29T11:00',
  vsdt: 22673,
  visitnum: 3,
  visit: 'Week 4',
  sourceType: 'SDTM',
  sourceDataset: 'VS'
})
CREATE (vs1)-[:FOR_SUBJECT]->(s)
CREATE (vs2)-[:FOR_SUBJECT]->(s)
CREATE (vs3)-[:FOR_SUBJECT]->(s);

// Continue for remaining 8 subjects (ACME-003 through ACME-010)
// Each with baseline + 2 post-baseline visits

MATCH (s:Subject) WHERE s.usubjid IN ['ACME-003', 'ACME-004', 'ACME-005', 'ACME-006', 'ACME-007', 'ACME-008', 'ACME-009', 'ACME-010']
FOREACH (subj IN CASE WHEN s.usubjid = 'ACME-003' THEN [1] ELSE [] END |
  CREATE (vs1:DataNode {id: 'VS_ACME-003_SYSBP_BASELINE', domain: 'VS', usubjid: 'ACME-003', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 128.0, vsdt: 22643, visitnum: 1, visit: 'Screening', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs2:DataNode {id: 'VS_ACME-003_SYSBP_WEEK2', domain: 'VS', usubjid: 'ACME-003', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 124.0, vsdt: 22660, visitnum: 2, visit: 'Week 2', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs3:DataNode {id: 'VS_ACME-003_SYSBP_WEEK4', domain: 'VS', usubjid: 'ACME-003', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 120.0, vsdt: 22674, visitnum: 3, visit: 'Week 4', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs1)-[:FOR_SUBJECT]->(s)
  CREATE (vs2)-[:FOR_SUBJECT]->(s)
  CREATE (vs3)-[:FOR_SUBJECT]->(s)
)
FOREACH (subj IN CASE WHEN s.usubjid = 'ACME-004' THEN [1] ELSE [] END |
  CREATE (vs1:DataNode {id: 'VS_ACME-004_SYSBP_BASELINE', domain: 'VS', usubjid: 'ACME-004', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 140.0, vsdt: 22643, visitnum: 1, visit: 'Screening', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs2:DataNode {id: 'VS_ACME-004_SYSBP_WEEK2', domain: 'VS', usubjid: 'ACME-004', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 135.0, vsdt: 22660, visitnum: 2, visit: 'Week 2', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs3:DataNode {id: 'VS_ACME-004_SYSBP_WEEK4', domain: 'VS', usubjid: 'ACME-004', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 132.0, vsdt: 22674, visitnum: 3, visit: 'Week 4', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs1)-[:FOR_SUBJECT]->(s)
  CREATE (vs2)-[:FOR_SUBJECT]->(s)
  CREATE (vs3)-[:FOR_SUBJECT]->(s)
)
FOREACH (subj IN CASE WHEN s.usubjid = 'ACME-005' THEN [1] ELSE [] END |
  CREATE (vs1:DataNode {id: 'VS_ACME-005_SYSBP_BASELINE', domain: 'VS', usubjid: 'ACME-005', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 132.0, vsdt: 22644, visitnum: 1, visit: 'Screening', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs2:DataNode {id: 'VS_ACME-005_SYSBP_WEEK2', domain: 'VS', usubjid: 'ACME-005', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 127.0, vsdt: 22661, visitnum: 2, visit: 'Week 2', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs3:DataNode {id: 'VS_ACME-005_SYSBP_WEEK4', domain: 'VS', usubjid: 'ACME-005', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 125.0, vsdt: 22675, visitnum: 3, visit: 'Week 4', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs1)-[:FOR_SUBJECT]->(s)
  CREATE (vs2)-[:FOR_SUBJECT]->(s)
  CREATE (vs3)-[:FOR_SUBJECT]->(s)
)
FOREACH (subj IN CASE WHEN s.usubjid = 'ACME-006' THEN [1] ELSE [] END |
  CREATE (vs1:DataNode {id: 'VS_ACME-006_SYSBP_BASELINE', domain: 'VS', usubjid: 'ACME-006', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 138.0, vsdt: 22644, visitnum: 1, visit: 'Screening', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs2:DataNode {id: 'VS_ACME-006_SYSBP_WEEK2', domain: 'VS', usubjid: 'ACME-006', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 132.0, vsdt: 22661, visitnum: 2, visit: 'Week 2', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs3:DataNode {id: 'VS_ACME-006_SYSBP_WEEK4', domain: 'VS', usubjid: 'ACME-006', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 129.0, vsdt: 22675, visitnum: 3, visit: 'Week 4', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs1)-[:FOR_SUBJECT]->(s)
  CREATE (vs2)-[:FOR_SUBJECT]->(s)
  CREATE (vs3)-[:FOR_SUBJECT]->(s)
)
FOREACH (subj IN CASE WHEN s.usubjid = 'ACME-007' THEN [1] ELSE [] END |
  CREATE (vs1:DataNode {id: 'VS_ACME-007_SYSBP_BASELINE', domain: 'VS', usubjid: 'ACME-007', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 142.0, vsdt: 22645, visitnum: 1, visit: 'Screening', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs2:DataNode {id: 'VS_ACME-007_SYSBP_WEEK2', domain: 'VS', usubjid: 'ACME-007', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 138.0, vsdt: 22662, visitnum: 2, visit: 'Week 2', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs3:DataNode {id: 'VS_ACME-007_SYSBP_WEEK4', domain: 'VS', usubjid: 'ACME-007', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 135.0, vsdt: 22676, visitnum: 3, visit: 'Week 4', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs1)-[:FOR_SUBJECT]->(s)
  CREATE (vs2)-[:FOR_SUBJECT]->(s)
  CREATE (vs3)-[:FOR_SUBJECT]->(s)
)
FOREACH (subj IN CASE WHEN s.usubjid = 'ACME-008' THEN [1] ELSE [] END |
  CREATE (vs1:DataNode {id: 'VS_ACME-008_SYSBP_BASELINE', domain: 'VS', usubjid: 'ACME-008', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 136.0, vsdt: 22645, visitnum: 1, visit: 'Screening', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs2:DataNode {id: 'VS_ACME-008_SYSBP_WEEK2', domain: 'VS', usubjid: 'ACME-008', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 131.0, vsdt: 22662, visitnum: 2, visit: 'Week 2', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs3:DataNode {id: 'VS_ACME-008_SYSBP_WEEK4', domain: 'VS', usubjid: 'ACME-008', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 128.0, vsdt: 22676, visitnum: 3, visit: 'Week 4', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs1)-[:FOR_SUBJECT]->(s)
  CREATE (vs2)-[:FOR_SUBJECT]->(s)
  CREATE (vs3)-[:FOR_SUBJECT]->(s)
)
FOREACH (subj IN CASE WHEN s.usubjid = 'ACME-009' THEN [1] ELSE [] END |
  CREATE (vs1:DataNode {id: 'VS_ACME-009_SYSBP_BASELINE', domain: 'VS', usubjid: 'ACME-009', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 144.0, vsdt: 22646, visitnum: 1, visit: 'Screening', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs2:DataNode {id: 'VS_ACME-009_SYSBP_WEEK2', domain: 'VS', usubjid: 'ACME-009', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 140.0, vsdt: 22663, visitnum: 2, visit: 'Week 2', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs3:DataNode {id: 'VS_ACME-009_SYSBP_WEEK4', domain: 'VS', usubjid: 'ACME-009', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 137.0, vsdt: 22677, visitnum: 3, visit: 'Week 4', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs1)-[:FOR_SUBJECT]->(s)
  CREATE (vs2)-[:FOR_SUBJECT]->(s)
  CREATE (vs3)-[:FOR_SUBJECT]->(s)
)
FOREACH (subj IN CASE WHEN s.usubjid = 'ACME-010' THEN [1] ELSE [] END |
  CREATE (vs1:DataNode {id: 'VS_ACME-010_SYSBP_BASELINE', domain: 'VS', usubjid: 'ACME-010', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 134.0, vsdt: 22646, visitnum: 1, visit: 'Screening', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs2:DataNode {id: 'VS_ACME-010_SYSBP_WEEK2', domain: 'VS', usubjid: 'ACME-010', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 129.0, vsdt: 22663, visitnum: 2, visit: 'Week 2', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs3:DataNode {id: 'VS_ACME-010_SYSBP_WEEK4', domain: 'VS', usubjid: 'ACME-010', vstestcd: 'SYSBP', vstest: 'Systolic Blood Pressure', vsstresn: 126.0, vsdt: 22677, visitnum: 3, visit: 'Week 4', sourceType: 'SDTM', sourceDataset: 'VS'})
  CREATE (vs1)-[:FOR_SUBJECT]->(s)
  CREATE (vs2)-[:FOR_SUBJECT]->(s)
  CREATE (vs3)-[:FOR_SUBJECT]->(s)
);

// ============================================================================
// SECTION 4: VERIFICATION
// ============================================================================

// Return summary of SDTM data
MATCH (s:Subject)
OPTIONAL MATCH (dm:DataNode {domain: 'DM'})-[:FOR_SUBJECT]->(s)
OPTIONAL MATCH (vs:DataNode {domain: 'VS'})-[:FOR_SUBJECT]->(s)
RETURN COUNT(DISTINCT s) as TotalSubjects,
       COUNT(DISTINCT dm) as DMRecords,
       COUNT(DISTINCT vs) as VSRecords;
