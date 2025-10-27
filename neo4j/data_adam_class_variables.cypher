// ============================================================================
// ADAM CLASS VARIABLES DATA LOADING
// ============================================================================
// This file loads ADaM Implementation Guide class variable definitions
// These are the standard variable definitions from ADaMIG v1.3 that serve
// as the foundation for sponsor-specific implementations.
//
// Source: model/adam-ac/adam-class-variables.json
// ============================================================================

// ============================================================================
// SECTION 1: IDENTIFIER VARIABLES
// ============================================================================

// USUBJID - Unique Subject Identifier
CREATE (:ADaMVariableClass {
  variableName: 'USUBJID',
  variableLabel: 'Unique Subject Identifier',
  type: 'Char',
  dataStructureName: 'Subject-Level Analysis Dataset',
  variableSet: 'Identifier',
  core: 'Req',
  cdiscNotes: 'DM.USUBJID'
});

// STUDYID - Study Identifier
CREATE (:ADaMVariableClass {
  variableName: 'STUDYID',
  variableLabel: 'Study Identifier',
  type: 'Char',
  dataStructureName: 'Subject-Level Analysis Dataset',
  variableSet: 'Identifier',
  core: 'Req',
  cdiscNotes: 'DM.STUDYID'
});

// ============================================================================
// SECTION 2: TREATMENT TIMING VARIABLES
// ============================================================================

// TRTSDT - Date of First Exposure to Treatment
CREATE (:ADaMVariableClass {
  variableName: 'TRTSDT',
  variableLabel: 'Date of First Exposure to Treatment',
  type: 'Num',
  dataStructureName: 'Subject-Level Analysis Dataset',
  variableSet: 'Treatment Timing',
  core: 'Perm',
  cdiscNotes: 'Numeric date of first exposure to treatment'
});

// ============================================================================
// SECTION 3: TIMING VARIABLES (BDS - Basic Data Structure)
// ============================================================================

// ADT - Analysis Date
CREATE (:ADaMVariableClass {
  variableName: 'ADT',
  variableLabel: 'Analysis Date',
  type: 'Num',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Timing',
  core: 'Exp',
  cdiscNotes: 'Analysis date. Numeric date'
});

// ADTM - Analysis Datetime
CREATE (:ADaMVariableClass {
  variableName: 'ADTM',
  variableLabel: 'Analysis Datetime',
  type: 'Num',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Timing',
  core: 'Perm',
  cdiscNotes: 'Analysis datetime. Numeric datetime'
});

// ============================================================================
// SECTION 4: ANALYSIS PARAMETER VARIABLES (BDS)
// ============================================================================

// AVAL - Analysis Value
CREATE (:ADaMVariableClass {
  variableName: 'AVAL',
  variableLabel: 'Analysis Value',
  type: 'Num',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Analysis Parameter',
  core: 'Req',
  cdiscNotes: 'Analysis value'
});

// BASE - Baseline Value
CREATE (:ADaMVariableClass {
  variableName: 'BASE',
  variableLabel: 'Baseline Value',
  type: 'Num',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Analysis Parameter',
  core: 'Cond',
  cdiscNotes: 'Baseline value. Required if CHG or PCHG are present'
});

// CHG - Change from Baseline
CREATE (:ADaMVariableClass {
  variableName: 'CHG',
  variableLabel: 'Change from Baseline',
  type: 'Num',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Analysis Parameter',
  core: 'Perm',
  cdiscNotes: 'Change from baseline (AVAL - BASE)'
});

// PCHG - Percent Change from Baseline
CREATE (:ADaMVariableClass {
  variableName: 'PCHG',
  variableLabel: 'Percent Change from Baseline',
  type: 'Num',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Analysis Parameter',
  core: 'Perm',
  cdiscNotes: 'Percent change from baseline ((AVAL - BASE) / BASE * 100)'
});

// ============================================================================
// SECTION 5: FLAG VARIABLES (BDS)
// ============================================================================

// ABLFL - Baseline Record Flag
CREATE (:ADaMVariableClass {
  variableName: 'ABLFL',
  variableLabel: 'Baseline Record Flag',
  type: 'Char',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Flag',
  core: 'Cond',
  valueListValue: 'Y',
  cdiscNotes: 'Character indicator to identify the baseline record for each subject, parameter, and baseline type (BASETYPE) combination. ABLFL is required if BASE is present in the dataset.'
});

// ANLzzFL - Analysis Flag zz
CREATE (:ADaMVariableClass {
  variableName: 'ANLzzFL',
  variableLabel: 'Analysis Flag zz',
  type: 'Char',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Flag',
  core: 'Perm',
  valueListValue: 'Y',
  cdiscNotes: 'Denotes records included in a particular analysis. For example, ANL01FL might flag the records to be included in the primary efficacy analysis.'
});

// ============================================================================
// SECTION 6: PARAMETER VARIABLES (BDS)
// ============================================================================

// PARAM - Parameter
CREATE (:ADaMVariableClass {
  variableName: 'PARAM',
  variableLabel: 'Parameter',
  type: 'Char',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Parameter',
  core: 'Req',
  cdiscNotes: 'Parameter. Description of the parameter'
});

// PARAMCD - Parameter Code
CREATE (:ADaMVariableClass {
  variableName: 'PARAMCD',
  variableLabel: 'Parameter Code',
  type: 'Char',
  dataStructureName: 'Basic Data Structure',
  variableSet: 'Parameter',
  core: 'Req',
  cdiscNotes: 'Parameter code'
});

// ============================================================================
// SECTION 7: TREATMENT VARIABLES
// ============================================================================

// TRT01P - Planned Treatment for Period 01
CREATE (:ADaMVariableClass {
  variableName: 'TRT01P',
  variableLabel: 'Planned Treatment for Period 01',
  type: 'Char',
  dataStructureName: 'Subject-Level Analysis Dataset',
  variableSet: 'Treatment',
  core: 'Perm',
  cdiscNotes: 'Planned treatment for period 01'
});

// TRT01A - Actual Treatment for Period 01
CREATE (:ADaMVariableClass {
  variableName: 'TRT01A',
  variableLabel: 'Actual Treatment for Period 01',
  type: 'Char',
  dataStructureName: 'Subject-Level Analysis Dataset',
  variableSet: 'Treatment',
  core: 'Perm',
  cdiscNotes: 'Actual treatment for period 01'
});

// ============================================================================
// SECTION 8: VERIFICATION
// ============================================================================

// Return count of created ADaM class variables
MATCH (v:ADaMVariableClass)
RETURN COUNT(v) as totalClassVariables,
       COLLECT(DISTINCT v.variableSet) as variableSets;
