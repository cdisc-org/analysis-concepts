// ============================================================================
// ANALYSIS CONCEPT TEMPLATES DATA LOADING
// ============================================================================
// This file loads AC templates - reusable analysis concept patterns that
// reference ADaM class variables and can be instantiated for specific studies.
//
// Source: model/adam-ac/ac-template/
// Templates:
//   - T_AC_001: Baseline Record Flag
//   - T_AC_002: Change from Baseline
// ============================================================================

// ============================================================================
// SECTION 1: AC TEMPLATE T_AC_001 - BASELINE RECORD FLAG
// ============================================================================

// Create the ACTemplate node
CREATE (t1:ACTemplate {
  id: 'T_AC_001',
  name: 'Baseline Record Flag',
  purpose: 'Identify and flag baseline observation for each subject and parameter',
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

// Create inputs for T_AC_001
MATCH (t:ACTemplate {id: 'T_AC_001'})
MATCH (v1:ADaMVariableClass {variableName: 'AVAL'})
MATCH (v2:ADaMVariableClass {variableName: 'ADT'})
MATCH (v3:ADaMVariableClass {variableName: 'TRTSDT'})
MATCH (v4:ADaMVariableClass {variableName: 'USUBJID'})
CREATE (i1:AnalysisInput {
  id: 'T_AC_001_IN_001',
  inputId: 'IN_001',
  sourceACTemplate: null,
  sourceClassVariable: 'AVAL',
  role: 'measurement_value',
  required: true,
  dataType: 'Numeric',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000251'
})
CREATE (i2:AnalysisInput {
  id: 'T_AC_001_IN_002',
  inputId: 'IN_002',
  sourceACTemplate: null,
  sourceClassVariable: 'ADT',
  role: 'measurement_date',
  required: true,
  dataType: 'Date',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000093'
})
CREATE (i3:AnalysisInput {
  id: 'T_AC_001_IN_003',
  inputId: 'IN_003',
  sourceACTemplate: null,
  sourceClassVariable: 'TRTSDT',
  role: 'reference_date',
  required: true,
  dataType: 'Date',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000093'
})
CREATE (i4:AnalysisInput {
  id: 'T_AC_001_IN_004',
  inputId: 'IN_004',
  sourceACTemplate: null,
  sourceClassVariable: 'USUBJID',
  role: 'subject_identifier',
  required: true,
  dataType: 'Character',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000001'
})
CREATE (t)-[:HAS_INPUT]->(i1)
CREATE (t)-[:HAS_INPUT]->(i2)
CREATE (t)-[:HAS_INPUT]->(i3)
CREATE (t)-[:HAS_INPUT]->(i4)
CREATE (i1)-[:OF_CLASS]->(v1)
CREATE (i2)-[:OF_CLASS]->(v2)
CREATE (i3)-[:OF_CLASS]->(v3)
CREATE (i4)-[:OF_CLASS]->(v4);

// Create output for T_AC_001
MATCH (t:ACTemplate {id: 'T_AC_001'})
MATCH (v:ADaMVariableClass {variableName: 'ABLFL'})
CREATE (o:AnalysisOutput {
  id: 'T_AC_001_OUT_001',
  outputId: 'OUT_001',
  classVariableName: 'ABLFL',
  description: 'Baseline Record Flag (Y for baseline observation, null otherwise)',
  dataType: 'Character',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000474'
})
CREATE (t)-[:HAS_OUTPUT]->(o)
CREATE (o)-[:OF_CLASS]->(v);

// Create method for T_AC_001
MATCH (t:ACTemplate {id: 'T_AC_001'})
CREATE (m:AnalysisMethod {
  id: 'T_AC_001_METHOD',
  implementation: 'custom_function.flag_baseline',
  operation: 'baseline_identification'
})
CREATE (t)-[:HAS_METHOD]->(m);

// ============================================================================
// SECTION 2: AC TEMPLATE T_AC_002 - CHANGE FROM BASELINE
// ============================================================================

// Create the ACTemplate node
CREATE (t2:ACTemplate {
  id: 'T_AC_002',
  name: 'Change from Baseline',
  purpose: 'Calculate change from baseline for analysis parameter',
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

// Create inputs for T_AC_002
MATCH (t:ACTemplate {id: 'T_AC_002'})
MATCH (v1:ADaMVariableClass {variableName: 'AVAL'})
MATCH (v2:ADaMVariableClass {variableName: 'BASE'})
CREATE (i1:AnalysisInput {
  id: 'T_AC_002_IN_001',
  inputId: 'IN_001',
  sourceACTemplate: null,
  sourceClassVariable: 'AVAL',
  role: 'post_baseline_value',
  required: true,
  dataType: 'Numeric',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000251'
})
CREATE (i2:AnalysisInput {
  id: 'T_AC_002_OUT_001',
  inputId: 'OUT_001',
  sourceACTemplate: 'T_AC_001',
  sourceClassVariable: 'BASE',
  role: 'baseline_value',
  required: true,
  dataType: 'Numeric',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000474'
})
CREATE (t)-[:HAS_INPUT]->(i1)
CREATE (t)-[:HAS_INPUT]->(i2)
CREATE (i1)-[:OF_CLASS]->(v1)
CREATE (i2)-[:OF_CLASS]->(v2);

// Create output for T_AC_002
MATCH (t:ACTemplate {id: 'T_AC_002'})
MATCH (v:ADaMVariableClass {variableName: 'CHG'})
CREATE (o:AnalysisOutput {
  id: 'T_AC_002_OUT_002',
  outputId: 'OUT_002',
  classVariableName: 'CHG',
  description: 'Change from baseline (AVAL - BASE)',
  dataType: 'Numeric',
  statoIRI: 'http://purl.obolibrary.org/obo/STATO_0000175'
})
CREATE (t)-[:HAS_OUTPUT]->(o)
CREATE (o)-[:OF_CLASS]->(v);

// Create method for T_AC_002
MATCH (t:ACTemplate {id: 'T_AC_002'})
CREATE (m:AnalysisMethod {
  id: 'T_AC_002_METHOD',
  implementation: 'base::subtract',
  operation: 'subtract'
})
CREATE (t)-[:HAS_METHOD]->(m);

// ============================================================================
// SECTION 3: CREATE DEPENDENCIES BETWEEN TEMPLATES
// ============================================================================

// T_AC_002 depends on T_AC_001 (needs baseline value)
MATCH (t1:ACTemplate {id: 'T_AC_001'})
MATCH (t2:ACTemplate {id: 'T_AC_002'})
CREATE (t2)-[:DEPENDS_ON {reason: 'Requires baseline value output'}]->(t1);

// Link T_AC_002 input to T_AC_001 output (chaining)
MATCH (o:AnalysisOutput {id: 'T_AC_001_OUT_001'})
MATCH (i:AnalysisInput {id: 'T_AC_002_OUT_001'})
CREATE (o)-[:AS_INPUT {note: 'Baseline output feeds into change calculation'}]->(i);

// ============================================================================
// SECTION 4: VERIFICATION
// ============================================================================

// Return summary of created templates
MATCH (t:ACTemplate)
OPTIONAL MATCH (t)-[:HAS_INPUT]->(i:AnalysisInput)
OPTIONAL MATCH (t)-[:HAS_OUTPUT]->(o:AnalysisOutput)
OPTIONAL MATCH (t)-[:DEPENDS_ON]->(dep:ACTemplate)
RETURN t.id as TemplateID,
       t.name as TemplateName,
       COUNT(DISTINCT i) as InputCount,
       COUNT(DISTINCT o) as OutputCount,
       COLLECT(DISTINCT dep.id) as Dependencies
ORDER BY t.id;
