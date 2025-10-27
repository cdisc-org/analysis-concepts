// ============================================================================
// DERIVED ADAM DATA LOADING - EXECUTION CHAIN DEMONSTRATION
// ============================================================================
// This file creates derived ADaM data nodes that result from executing
// Analysis Concepts, demonstrating the full data lineage:
//
// SDTM (VS domain) → D_AC_001 (Baseline Flag) → D_AC_002 (Change from Baseline)
//
// For each subject:
// 1. Baseline identification (ABLFL='Y') via D_AC_001
// 2. Baseline value population (BASE) from flagged record
// 3. Change from baseline calculation (CHG) via D_AC_002
// ============================================================================

// ============================================================================
// SECTION 1: D_AC_001 EXECUTION - BASELINE FLAG DERIVATION
// ============================================================================
// Identifies baseline records for each subject (last measurement before TRTSDT)

// Subject ACME-001: Baseline is 2023-12-30 (vsdt=22642, TRTSDT=22645)
MATCH (s:Subject {usubjid: 'ACME-001'})
MATCH (ac:ACStudyInstance {id: 'D_AC_001'})
MATCH (vsBaseline:DataNode {id: 'VS_ACME-001_SYSBP_BASELINE'})
CREATE (derived:DataNode {
  id: 'ADVS_ACME-001_SYSBP_BASELINE_ABLFL',
  usubjid: 'ACME-001',
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: 130.0,
  adt: 22642,
  ablfl: 'Y',
  base: 130.0,
  visitnum: 1,
  visit: 'Screening',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Baseline Identification'
})
CREATE (derived)-[:DERIVED_BY_AC]->(ac)
CREATE (derived)-[:FOR_SUBJECT]->(s)
CREATE (derived)-[:DERIVED_FROM {transformation: 'baseline_flag'}]->(vsBaseline);

// Subject ACME-002
MATCH (s:Subject {usubjid: 'ACME-002'})
MATCH (ac:ACStudyInstance {id: 'D_AC_001'})
MATCH (vsBaseline:DataNode {id: 'VS_ACME-002_SYSBP_BASELINE'})
CREATE (derived:DataNode {
  id: 'ADVS_ACME-002_SYSBP_BASELINE_ABLFL',
  usubjid: 'ACME-002',
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: 135.0,
  adt: 22642,
  ablfl: 'Y',
  base: 135.0,
  visitnum: 1,
  visit: 'Screening',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Baseline Identification'
})
CREATE (derived)-[:DERIVED_BY_AC]->(ac)
CREATE (derived)-[:FOR_SUBJECT]->(s)
CREATE (derived)-[:DERIVED_FROM {transformation: 'baseline_flag'}]->(vsBaseline);

// Continue for all 10 subjects (ACME-003 through ACME-010)
MATCH (s:Subject) WHERE s.usubjid IN ['ACME-003', 'ACME-004', 'ACME-005', 'ACME-006', 'ACME-007', 'ACME-008', 'ACME-009', 'ACME-010']
MATCH (ac:ACStudyInstance {id: 'D_AC_001'})
WITH s, ac
MATCH (vsBaseline:DataNode {usubjid: s.usubjid, domain: 'VS', visitnum: 1})
CREATE (derived:DataNode {
  id: 'ADVS_' + s.usubjid + '_SYSBP_BASELINE_ABLFL',
  usubjid: s.usubjid,
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: vsBaseline.vsstresn,
  adt: vsBaseline.vsdt,
  ablfl: 'Y',
  base: vsBaseline.vsstresn,
  visitnum: 1,
  visit: 'Screening',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Baseline Identification'
})
CREATE (derived)-[:DERIVED_BY_AC]->(ac)
CREATE (derived)-[:FOR_SUBJECT]->(s)
CREATE (derived)-[:DERIVED_FROM {transformation: 'baseline_flag'}]->(vsBaseline);

// ============================================================================
// SECTION 2: D_AC_002 EXECUTION - CHANGE FROM BASELINE CALCULATION
// ============================================================================
// Calculates CHG (AVAL - BASE) for all post-baseline visits

// Subject ACME-001: Week 2 and Week 4
MATCH (s:Subject {usubjid: 'ACME-001'})
MATCH (ac:ACStudyInstance {id: 'D_AC_002'})
MATCH (vsWeek2:DataNode {id: 'VS_ACME-001_SYSBP_WEEK2'})
MATCH (vsWeek4:DataNode {id: 'VS_ACME-001_SYSBP_WEEK4'})
MATCH (baseline:DataNode {id: 'ADVS_ACME-001_SYSBP_BASELINE_ABLFL'})
CREATE (derived1:DataNode {
  id: 'ADVS_ACME-001_SYSBP_WEEK2_CHG',
  usubjid: 'ACME-001',
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: 125.0,
  adt: 22659,
  base: 130.0,
  chg: -5.0,
  visitnum: 2,
  visit: 'Week 2',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Change from Baseline'
})
CREATE (derived2:DataNode {
  id: 'ADVS_ACME-001_SYSBP_WEEK4_CHG',
  usubjid: 'ACME-001',
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: 122.0,
  adt: 22673,
  base: 130.0,
  chg: -8.0,
  visitnum: 3,
  visit: 'Week 4',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Change from Baseline'
})
CREATE (derived1)-[:DERIVED_BY_AC]->(ac)
CREATE (derived2)-[:DERIVED_BY_AC]->(ac)
CREATE (derived1)-[:FOR_SUBJECT]->(s)
CREATE (derived2)-[:FOR_SUBJECT]->(s)
CREATE (derived1)-[:DERIVED_FROM {transformation: 'change_calculation'}]->(vsWeek2)
CREATE (derived2)-[:DERIVED_FROM {transformation: 'change_calculation'}]->(vsWeek4)
CREATE (derived1)-[:USES_BASELINE]->(baseline)
CREATE (derived2)-[:USES_BASELINE]->(baseline);

// Subject ACME-002: Week 2 and Week 4
MATCH (s:Subject {usubjid: 'ACME-002'})
MATCH (ac:ACStudyInstance {id: 'D_AC_002'})
MATCH (vsWeek2:DataNode {id: 'VS_ACME-002_SYSBP_WEEK2'})
MATCH (vsWeek4:DataNode {id: 'VS_ACME-002_SYSBP_WEEK4'})
MATCH (baseline:DataNode {id: 'ADVS_ACME-002_SYSBP_BASELINE_ABLFL'})
CREATE (derived1:DataNode {
  id: 'ADVS_ACME-002_SYSBP_WEEK2_CHG',
  usubjid: 'ACME-002',
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: 130.0,
  adt: 22659,
  base: 135.0,
  chg: -5.0,
  visitnum: 2,
  visit: 'Week 2',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Change from Baseline'
})
CREATE (derived2:DataNode {
  id: 'ADVS_ACME-002_SYSBP_WEEK4_CHG',
  usubjid: 'ACME-002',
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: 128.0,
  adt: 22673,
  base: 135.0,
  chg: -7.0,
  visitnum: 3,
  visit: 'Week 4',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Change from Baseline'
})
CREATE (derived1)-[:DERIVED_BY_AC]->(ac)
CREATE (derived2)-[:DERIVED_BY_AC]->(ac)
CREATE (derived1)-[:FOR_SUBJECT]->(s)
CREATE (derived2)-[:FOR_SUBJECT]->(s)
CREATE (derived1)-[:DERIVED_FROM {transformation: 'change_calculation'}]->(vsWeek2)
CREATE (derived2)-[:DERIVED_FROM {transformation: 'change_calculation'}]->(vsWeek4)
CREATE (derived1)-[:USES_BASELINE]->(baseline)
CREATE (derived2)-[:USES_BASELINE]->(baseline);

// Continue for remaining subjects (ACME-003 through ACME-010) - Week 2
MATCH (s:Subject) WHERE s.usubjid IN ['ACME-003', 'ACME-004', 'ACME-005', 'ACME-006', 'ACME-007', 'ACME-008', 'ACME-009', 'ACME-010']
MATCH (ac:ACStudyInstance {id: 'D_AC_002'})
WITH s, ac
MATCH (vsWeek2:DataNode {usubjid: s.usubjid, domain: 'VS', visitnum: 2})
MATCH (baseline:DataNode {id: 'ADVS_' + s.usubjid + '_SYSBP_BASELINE_ABLFL'})
CREATE (derived:DataNode {
  id: 'ADVS_' + s.usubjid + '_SYSBP_WEEK2_CHG',
  usubjid: s.usubjid,
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: vsWeek2.vsstresn,
  adt: vsWeek2.vsdt,
  base: baseline.base,
  chg: vsWeek2.vsstresn - baseline.base,
  visitnum: 2,
  visit: 'Week 2',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Change from Baseline'
})
CREATE (derived)-[:DERIVED_BY_AC]->(ac)
CREATE (derived)-[:FOR_SUBJECT]->(s)
CREATE (derived)-[:DERIVED_FROM {transformation: 'change_calculation'}]->(vsWeek2)
CREATE (derived)-[:USES_BASELINE]->(baseline);

// Continue for remaining subjects (ACME-003 through ACME-010) - Week 4
MATCH (s:Subject) WHERE s.usubjid IN ['ACME-003', 'ACME-004', 'ACME-005', 'ACME-006', 'ACME-007', 'ACME-008', 'ACME-009', 'ACME-010']
MATCH (ac:ACStudyInstance {id: 'D_AC_002'})
WITH s, ac
MATCH (vsWeek4:DataNode {usubjid: s.usubjid, domain: 'VS', visitnum: 3})
MATCH (baseline:DataNode {id: 'ADVS_' + s.usubjid + '_SYSBP_BASELINE_ABLFL'})
CREATE (derived:DataNode {
  id: 'ADVS_' + s.usubjid + '_SYSBP_WEEK4_CHG',
  usubjid: s.usubjid,
  paramcd: 'SYSBP',
  param: 'Systolic Blood Pressure (mmHg)',
  aval: vsWeek4.vsstresn,
  adt: vsWeek4.vsdt,
  base: baseline.base,
  chg: vsWeek4.vsstresn - baseline.base,
  visitnum: 3,
  visit: 'Week 4',
  sourceType: 'Derived',
  derivedDataset: 'ADVS',
  derivationStep: 'Change from Baseline'
})
CREATE (derived)-[:DERIVED_BY_AC]->(ac)
CREATE (derived)-[:FOR_SUBJECT]->(s)
CREATE (derived)-[:DERIVED_FROM {transformation: 'change_calculation'}]->(vsWeek4)
CREATE (derived)-[:USES_BASELINE]->(baseline);

// ============================================================================
// SECTION 3: VERIFICATION AND DATA LINEAGE EXAMPLES
// ============================================================================

// Count derived records by AC
MATCH (d:DataNode {sourceType: 'Derived'})-[:DERIVED_BY_AC]->(ac)
RETURN ac.id as AnalysisConceptID,
       ac.name as AnalysisConceptName,
       COUNT(d) as DerivedRecords
ORDER BY ac.id;

// Show complete data lineage for one subject (ACME-001)
MATCH path = (sdtm:DataNode {domain: 'VS', usubjid: 'ACME-001'})-[:DERIVED_FROM*0..5]-(derived:DataNode {sourceType: 'Derived'})
RETURN path
LIMIT 10;

// Show execution chain summary
MATCH (s:Subject)
OPTIONAL MATCH (baseline:DataNode {usubjid: s.usubjid, ablfl: 'Y'})-[:DERIVED_BY_AC]->(ac1:ACStudyInstance)
OPTIONAL MATCH (chg:DataNode {usubjid: s.usubjid, visitnum: 2})-[:DERIVED_BY_AC]->(ac2:ACStudyInstance {id: 'D_AC_002'})
WHERE chg.chg IS NOT NULL
RETURN s.usubjid as Subject,
       baseline.aval as BaselineValue,
       chg.aval as Week2Value,
       chg.chg as ChangeFromBaseline,
       ac1.id as BaselineAC,
       ac2.id as ChangeAC
ORDER BY s.usubjid
LIMIT 10;
