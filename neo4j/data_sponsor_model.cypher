// ============================================================================
// SPONSOR ADAM MODEL DATA LOADING
// ============================================================================
// This file creates a sponsor-specific ADaM implementation model.
// The SponsorADaMModel acts as a container for sponsor-specific variable
// implementations that are linked to ADaM class variables.
//
// Example Sponsor: "Acme Pharmaceuticals"
// Datasets: ADSL (Subject-Level), ADVS (Vital Signs)
// ============================================================================

// ============================================================================
// SECTION 1: CREATE SPONSOR ADAM MODEL CONTAINER
// ============================================================================

CREATE (sponsor:SponsorADaMModel {
  id: 'ACME_ADAM_V1',
  sponsor: 'Acme Pharmaceuticals',
  modelVersion: '1.0',
  adamigVersion: 'ADaMIG v1.3',
  createdDate: '2024-10-24',
  description: 'Acme Pharmaceuticals ADaM implementation based on ADaMIG v1.3'
});

// ============================================================================
// SECTION 2: CREATE ADSL DATASET (Subject-Level Analysis Dataset)
// ============================================================================

// ADSL Dataset Container
CREATE (adsl:ADaMDataset {
  id: 'ACME_ADSL',
  datasetName: 'ADSL',
  datasetLabel: 'Subject-Level Analysis Dataset',
  dataStructure: 'Subject-Level',
  sponsor: 'Acme Pharmaceuticals'
});

// Link ADSL to Sponsor Model
MATCH (sponsor:SponsorADaMModel {id: 'ACME_ADAM_V1'})
MATCH (adsl:ADaMDataset {id: 'ACME_ADSL'})
CREATE (sponsor)-[:CONTAINS_DATASET]->(adsl);

// Create ADSL Variables and link to class variables
MATCH (sponsor:SponsorADaMModel {id: 'ACME_ADAM_V1'})
MATCH (adsl:ADaMDataset {id: 'ACME_ADSL'})
MATCH (v1:ADaMVariableClass {variableName: 'STUDYID'})
MATCH (v2:ADaMVariableClass {variableName: 'USUBJID'})
MATCH (v3:ADaMVariableClass {variableName: 'TRTSDT'})
MATCH (v4:ADaMVariableClass {variableName: 'TRT01P'})
MATCH (v5:ADaMVariableClass {variableName: 'TRT01A'})
CREATE (var1:ADaMIGVariable {
  id: 'ACME_ADSL_STUDYID',
  variableName: 'STUDYID',
  variableLabel: 'Study Identifier',
  datasetName: 'ADSL',
  type: 'Char',
  length: 20,
  core: 'Req'
})
CREATE (var2:ADaMIGVariable {
  id: 'ACME_ADSL_USUBJID',
  variableName: 'USUBJID',
  variableLabel: 'Unique Subject Identifier',
  datasetName: 'ADSL',
  type: 'Char',
  length: 40,
  core: 'Req'
})
CREATE (var3:ADaMIGVariable {
  id: 'ACME_ADSL_TRTSDT',
  variableName: 'TRTSDT',
  variableLabel: 'Date of First Exposure to Treatment',
  datasetName: 'ADSL',
  type: 'Num',
  core: 'Perm'
})
CREATE (var4:ADaMIGVariable {
  id: 'ACME_ADSL_TRT01P',
  variableName: 'TRT01P',
  variableLabel: 'Planned Treatment for Period 01',
  datasetName: 'ADSL',
  type: 'Char',
  length: 200,
  core: 'Perm'
})
CREATE (var5:ADaMIGVariable {
  id: 'ACME_ADSL_TRT01A',
  variableName: 'TRT01A',
  variableLabel: 'Actual Treatment for Period 01',
  datasetName: 'ADSL',
  type: 'Char',
  length: 200,
  core: 'Perm'
})
CREATE (sponsor)-[:DEFINES]->(var1)
CREATE (sponsor)-[:DEFINES]->(var2)
CREATE (sponsor)-[:DEFINES]->(var3)
CREATE (sponsor)-[:DEFINES]->(var4)
CREATE (sponsor)-[:DEFINES]->(var5)
CREATE (adsl)-[:CONTAINS]->(var1)
CREATE (adsl)-[:CONTAINS]->(var2)
CREATE (adsl)-[:CONTAINS]->(var3)
CREATE (adsl)-[:CONTAINS]->(var4)
CREATE (adsl)-[:CONTAINS]->(var5)
CREATE (var1)-[:OF_CLASS]->(v1)
CREATE (var2)-[:OF_CLASS]->(v2)
CREATE (var3)-[:OF_CLASS]->(v3)
CREATE (var4)-[:OF_CLASS]->(v4)
CREATE (var5)-[:OF_CLASS]->(v5);

// ============================================================================
// SECTION 3: CREATE ADVS DATASET (Vital Signs Analysis Dataset - BDS)
// ============================================================================

// ADVS Dataset Container
CREATE (advs:ADaMDataset {
  id: 'ACME_ADVS',
  datasetName: 'ADVS',
  datasetLabel: 'Vital Signs Analysis Dataset',
  dataStructure: 'Basic Data Structure',
  sponsor: 'Acme Pharmaceuticals'
});

// Link ADVS to Sponsor Model
MATCH (sponsor:SponsorADaMModel {id: 'ACME_ADAM_V1'})
MATCH (advs:ADaMDataset {id: 'ACME_ADVS'})
CREATE (sponsor)-[:CONTAINS_DATASET]->(advs);

// Create ADVS Variables and link to class variables
MATCH (sponsor:SponsorADaMModel {id: 'ACME_ADAM_V1'})
MATCH (advs:ADaMDataset {id: 'ACME_ADVS'})
MATCH (v1:ADaMVariableClass {variableName: 'USUBJID'})
MATCH (v2:ADaMVariableClass {variableName: 'PARAMCD'})
MATCH (v3:ADaMVariableClass {variableName: 'PARAM'})
MATCH (v4:ADaMVariableClass {variableName: 'AVAL'})
MATCH (v5:ADaMVariableClass {variableName: 'ADT'})
MATCH (v6:ADaMVariableClass {variableName: 'BASE'})
MATCH (v7:ADaMVariableClass {variableName: 'CHG'})
MATCH (v8:ADaMVariableClass {variableName: 'ABLFL'})
CREATE (var1:ADaMIGVariable {
  id: 'ACME_ADVS_USUBJID',
  variableName: 'USUBJID',
  variableLabel: 'Unique Subject Identifier',
  datasetName: 'ADVS',
  type: 'Char',
  length: 40,
  core: 'Req'
})
CREATE (var2:ADaMIGVariable {
  id: 'ACME_ADVS_PARAMCD',
  variableName: 'PARAMCD',
  variableLabel: 'Parameter Code',
  datasetName: 'ADVS',
  type: 'Char',
  length: 8,
  core: 'Req'
})
CREATE (var3:ADaMIGVariable {
  id: 'ACME_ADVS_PARAM',
  variableName: 'PARAM',
  variableLabel: 'Parameter',
  datasetName: 'ADVS',
  type: 'Char',
  length: 200,
  core: 'Req'
})
CREATE (var4:ADaMIGVariable {
  id: 'ACME_ADVS_AVAL',
  variableName: 'AVAL',
  variableLabel: 'Analysis Value',
  datasetName: 'ADVS',
  type: 'Num',
  core: 'Req'
})
CREATE (var5:ADaMIGVariable {
  id: 'ACME_ADVS_ADT',
  variableName: 'ADT',
  variableLabel: 'Analysis Date',
  datasetName: 'ADVS',
  type: 'Num',
  core: 'Exp'
})
CREATE (var6:ADaMIGVariable {
  id: 'ACME_ADVS_BASE',
  variableName: 'BASE',
  variableLabel: 'Baseline Value',
  datasetName: 'ADVS',
  type: 'Num',
  core: 'Cond'
})
CREATE (var7:ADaMIGVariable {
  id: 'ACME_ADVS_CHG',
  variableName: 'CHG',
  variableLabel: 'Change from Baseline',
  datasetName: 'ADVS',
  type: 'Num',
  core: 'Perm'
})
CREATE (var8:ADaMIGVariable {
  id: 'ACME_ADVS_ABLFL',
  variableName: 'ABLFL',
  variableLabel: 'Baseline Record Flag',
  datasetName: 'ADVS',
  type: 'Char',
  length: 1,
  core: 'Cond'
})
CREATE (sponsor)-[:DEFINES]->(var1)
CREATE (sponsor)-[:DEFINES]->(var2)
CREATE (sponsor)-[:DEFINES]->(var3)
CREATE (sponsor)-[:DEFINES]->(var4)
CREATE (sponsor)-[:DEFINES]->(var5)
CREATE (sponsor)-[:DEFINES]->(var6)
CREATE (sponsor)-[:DEFINES]->(var7)
CREATE (sponsor)-[:DEFINES]->(var8)
CREATE (advs)-[:CONTAINS]->(var1)
CREATE (advs)-[:CONTAINS]->(var2)
CREATE (advs)-[:CONTAINS]->(var3)
CREATE (advs)-[:CONTAINS]->(var4)
CREATE (advs)-[:CONTAINS]->(var5)
CREATE (advs)-[:CONTAINS]->(var6)
CREATE (advs)-[:CONTAINS]->(var7)
CREATE (advs)-[:CONTAINS]->(var8)
CREATE (var1)-[:OF_CLASS]->(v1)
CREATE (var2)-[:OF_CLASS]->(v2)
CREATE (var3)-[:OF_CLASS]->(v3)
CREATE (var4)-[:OF_CLASS]->(v4)
CREATE (var5)-[:OF_CLASS]->(v5)
CREATE (var6)-[:OF_CLASS]->(v6)
CREATE (var7)-[:OF_CLASS]->(v7)
CREATE (var8)-[:OF_CLASS]->(v8);

// ============================================================================
// SECTION 4: VERIFICATION
// ============================================================================

// Return summary of sponsor model
MATCH (sponsor:SponsorADaMModel {id: 'ACME_ADAM_V1'})
OPTIONAL MATCH (sponsor)-[:CONTAINS_DATASET]->(ds:ADaMDataset)
OPTIONAL MATCH (sponsor)-[:DEFINES]->(var:ADaMIGVariable)
RETURN sponsor.sponsor as Sponsor,
       sponsor.modelVersion as Version,
       COUNT(DISTINCT ds) as DatasetCount,
       COUNT(DISTINCT var) as VariableCount,
       COLLECT(DISTINCT ds.datasetName) as Datasets;
