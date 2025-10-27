// ============================================================================
// ANALYSIS CONCEPT STUDY INSTANCES DATA LOADING
// ============================================================================
// This file creates study-specific AC instances that instantiate AC templates
// and map them to sponsor-specific variables.
//
// Source: model/adam-ac/ac-examples/
// Study Instances:
//   - D_AC_001: Baseline Systolic BP Flag (instantiates T_AC_001)
//   - D_AC_002: Change from Baseline Systolic BP (instantiates T_AC_002)
// ============================================================================

// ============================================================================
// SECTION 1: AC STUDY INSTANCE D_AC_001 - BASELINE SYSBP FLAG
// ============================================================================

// Create the ACStudyInstance node
CREATE (s1:ACStudyInstance {
  id: 'D_AC_001',
  name: 'Baseline Systolic Blood Pressure Flag',
  purpose: 'Identify and flag baseline systolic BP assessment for each subject',
  studyId: 'ACME-2024-001',
  parameterCode: 'SYSBP',
  parameterLabel: 'Systolic Blood Pressure (mmHg)',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000474',
  statoLabel: 'baseline value identification datum',
  implementation: 'custom_function.flag_baseline',
  selectionRule: 'last',
  temporalConstraint: 'ADT <= TRTSDT',
  grouping: 'USUBJID',
  flagValue: 'Y',
  missingHandling: 'exclude',
  population: 'Full Analysis Set',
  timing: ['Pre-dose']
});

// Link to template
MATCH (s:ACStudyInstance {id: 'D_AC_001'})
MATCH (t:ACTemplate {id: 'T_AC_001'})
CREATE (s)-[:INSTANTIATES {
  instantiatedDate: '2024-10-24',
  instantiatedBy: 'Lead Statistician'
}]->(t);

// Link to dataset
MATCH (s:ACStudyInstance {id: 'D_AC_001'})
MATCH (ds:ADaMDataset {id: 'ACME_ADVS'})
CREATE (ds)-[:CONTAINS_AC]->(s);

// Create inputs for D_AC_001 (mapping to sponsor variables)
MATCH (s:ACStudyInstance {id: 'D_AC_001'})
MATCH (v1:ADaMIGVariable {id: 'ACME_ADVS_AVAL'})
MATCH (v2:ADaMIGVariable {id: 'ACME_ADVS_ADT'})
MATCH (v3:ADaMIGVariable {id: 'ACME_ADSL_TRTSDT'})
MATCH (v4:ADaMIGVariable {id: 'ACME_ADVS_USUBJID'})
MATCH (vc1:ADaMVariableClass {variableName: 'AVAL'})
MATCH (vc2:ADaMVariableClass {variableName: 'ADT'})
MATCH (vc3:ADaMVariableClass {variableName: 'TRTSDT'})
MATCH (vc4:ADaMVariableClass {variableName: 'USUBJID'})
CREATE (i1:AnalysisInput {
  id: 'D_AC_001_IN_001',
  inputId: 'IN_001',
  sourceAC: null,
  sourceACTemplate: null,
  sourceVariable: 'AVAL',
  sourceClassVariable: 'AVAL',
  role: 'measurement_value',
  required: true,
  dataType: 'Numeric',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000251'
})
CREATE (i2:AnalysisInput {
  id: 'D_AC_001_IN_002',
  inputId: 'IN_002',
  sourceAC: null,
  sourceACTemplate: null,
  sourceVariable: 'ADT',
  sourceClassVariable: 'ADT',
  role: 'measurement_date',
  required: true,
  dataType: 'Date',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000093'
})
CREATE (i3:AnalysisInput {
  id: 'D_AC_001_IN_003',
  inputId: 'IN_003',
  sourceAC: null,
  sourceACTemplate: null,
  sourceVariable: 'TRTSDT',
  sourceClassVariable: 'TRTSDT',
  role: 'reference_date',
  required: true,
  dataType: 'Date',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000093'
})
CREATE (i4:AnalysisInput {
  id: 'D_AC_001_IN_004',
  inputId: 'IN_004',
  sourceAC: null,
  sourceACTemplate: null,
  sourceVariable: 'USUBJID',
  sourceClassVariable: 'USUBJID',
  role: 'subject_identifier',
  required: true,
  dataType: 'Character',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000001'
})
CREATE (s)-[:HAS_INPUT]->(i1)
CREATE (s)-[:HAS_INPUT]->(i2)
CREATE (s)-[:HAS_INPUT]->(i3)
CREATE (s)-[:HAS_INPUT]->(i4)
CREATE (i1)-[:MAPS_TO_VARIABLE]->(v1)
CREATE (i2)-[:MAPS_TO_VARIABLE]->(v2)
CREATE (i3)-[:MAPS_TO_VARIABLE]->(v3)
CREATE (i4)-[:MAPS_TO_VARIABLE]->(v4)
CREATE (i1)-[:OF_CLASS]->(vc1)
CREATE (i2)-[:OF_CLASS]->(vc2)
CREATE (i3)-[:OF_CLASS]->(vc3)
CREATE (i4)-[:OF_CLASS]->(vc4);

// Create output for D_AC_001
MATCH (s:ACStudyInstance {id: 'D_AC_001'})
MATCH (v:ADaMIGVariable {id: 'ACME_ADVS_ABLFL'})
MATCH (vc:ADaMVariableClass {variableName: 'ABLFL'})
CREATE (o:AnalysisOutput {
  id: 'D_AC_001_OUT_001',
  outputId: 'OUT_001',
  variableName: 'ABLFL',
  classVariableName: 'ABLFL',
  description: 'Baseline flag for Systolic BP (Y for baseline observation, null otherwise)',
  dataType: 'Character',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000474'
})
CREATE (s)-[:HAS_OUTPUT]->(o)
CREATE (o)-[:MAPS_TO_VARIABLE]->(v)
CREATE (o)-[:OF_CLASS]->(vc);

// Create method for D_AC_001
MATCH (s:ACStudyInstance {id: 'D_AC_001'})
CREATE (m:AnalysisMethod {
  id: 'D_AC_001_METHOD',
  implementation: 'custom_function.flag_baseline',
  operation: 'baseline_identification',
  parameterFilter: 'PARAMCD = "SYSBP"'
})
CREATE (s)-[:HAS_METHOD]->(m);

// ============================================================================
// SECTION 2: AC STUDY INSTANCE D_AC_002 - CHANGE FROM BASELINE SYSBP
// ============================================================================

// Create the ACStudyInstance node
CREATE (s2:ACStudyInstance {
  id: 'D_AC_002',
  name: 'Change from Baseline Systolic Blood Pressure',
  purpose: 'Calculate change from baseline in systolic BP',
  studyId: 'ACME-2024-001',
  parameterCode: 'SYSBP',
  parameterLabel: 'Systolic Blood Pressure (mmHg)',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000175',
  statoLabel: 'difference',
  additionalIRIs: ['http://purl.obolibrary.org/obo/STATO_0000002'],
  implementation: 'base::subtract',
  operation: 'subtract',
  formula: 'AVAL - BASE',
  missingHandling: 'propagate',
  population: 'Full Analysis Set',
  timing: ['All post-baseline visits']
});

// Link to template
MATCH (s:ACStudyInstance {id: 'D_AC_002'})
MATCH (t:ACTemplate {id: 'T_AC_002'})
CREATE (s)-[:INSTANTIATES {
  instantiatedDate: '2024-10-24',
  instantiatedBy: 'Lead Statistician'
}]->(t);

// Link to dataset
MATCH (s:ACStudyInstance {id: 'D_AC_002'})
MATCH (ds:ADaMDataset {id: 'ACME_ADVS'})
CREATE (ds)-[:CONTAINS_AC]->(s);

// Create inputs for D_AC_002
MATCH (s:ACStudyInstance {id: 'D_AC_002'})
MATCH (v1:ADaMIGVariable {id: 'ACME_ADVS_AVAL'})
MATCH (v2:ADaMIGVariable {id: 'ACME_ADVS_BASE'})
MATCH (vc1:ADaMVariableClass {variableName: 'AVAL'})
MATCH (vc2:ADaMVariableClass {variableName: 'BASE'})
CREATE (i1:AnalysisInput {
  id: 'D_AC_002_IN_001',
  inputId: 'IN_001',
  sourceAC: null,
  sourceACTemplate: null,
  sourceVariable: 'AVAL',
  sourceClassVariable: 'AVAL',
  role: 'post_baseline_value',
  required: true,
  dataType: 'Numeric',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000251'
})
CREATE (i2:AnalysisInput {
  id: 'D_AC_002_OUT_001',
  inputId: 'OUT_001',
  sourceAC: 'D_AC_001',
  sourceACTemplate: 'T_AC_001',
  sourceVariable: 'BASE',
  sourceClassVariable: 'BASE',
  role: 'baseline_value',
  required: true,
  dataType: 'Numeric',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000474'
})
CREATE (s)-[:HAS_INPUT]->(i1)
CREATE (s)-[:HAS_INPUT]->(i2)
CREATE (i1)-[:MAPS_TO_VARIABLE]->(v1)
CREATE (i2)-[:MAPS_TO_VARIABLE]->(v2)
CREATE (i1)-[:OF_CLASS]->(vc1)
CREATE (i2)-[:OF_CLASS]->(vc2);

// Create output for D_AC_002
MATCH (s:ACStudyInstance {id: 'D_AC_002'})
MATCH (v:ADaMIGVariable {id: 'ACME_ADVS_CHG'})
MATCH (vc:ADaMVariableClass {variableName: 'CHG'})
CREATE (o:AnalysisOutput {
  id: 'D_AC_002_OUT_002',
  outputId: 'OUT_002',
  variableName: 'CHG',
  classVariableName: 'CHG',
  description: 'Change from baseline in Systolic BP (AVAL - BASE)',
  dataType: 'Numeric',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000175'
})
CREATE (s)-[:HAS_OUTPUT]->(o)
CREATE (o)-[:MAPS_TO_VARIABLE]->(v)
CREATE (o)-[:OF_CLASS]->(vc);

// Create method for D_AC_002
MATCH (s:ACStudyInstance {id: 'D_AC_002'})
CREATE (m:AnalysisMethod {
  id: 'D_AC_002_METHOD',
  implementation: 'base::subtract',
  operation: 'subtract',
  parameterFilter: 'PARAMCD = "SYSBP"'
})
CREATE (s)-[:HAS_METHOD]->(m);

// ============================================================================
// SECTION 3: CREATE DEPENDENCIES BETWEEN STUDY INSTANCES
// ============================================================================

// D_AC_002 depends on D_AC_001
MATCH (s1:ACStudyInstance {id: 'D_AC_001'})
MATCH (s2:ACStudyInstance {id: 'D_AC_002'})
CREATE (s2)-[:DEPENDS_ON {reason: 'Requires baseline value output'}]->(s1);

// Link D_AC_002 input to D_AC_001 output (chaining)
MATCH (o:AnalysisOutput {id: 'D_AC_001_OUT_001'})
MATCH (i:AnalysisInput {id: 'D_AC_002_OUT_001'})
CREATE (o)-[:AS_INPUT {note: 'Baseline output feeds into change calculation'}]->(i);

// ============================================================================
// SECTION 4: VERIFICATION
// ============================================================================

// Return summary of created study instances
MATCH (s:ACStudyInstance)
OPTIONAL MATCH (s)-[:INSTANTIATES]->(t:ACTemplate)
OPTIONAL MATCH (s)-[:HAS_INPUT]->(i:AnalysisInput)
OPTIONAL MATCH (s)-[:HAS_OUTPUT]->(o:AnalysisOutput)
OPTIONAL MATCH (s)-[:DEPENDS_ON]->(dep:ACStudyInstance)
OPTIONAL MATCH (ds:ADaMDataset)-[:CONTAINS_AC]->(s)
RETURN s.id as InstanceID,
       s.name as InstanceName,
       t.id as TemplateID,
       ds.datasetName as Dataset,
       COUNT(DISTINCT i) as InputCount,
       COUNT(DISTINCT o) as OutputCount,
       COLLECT(DISTINCT dep.id) as Dependencies
ORDER BY s.id;
