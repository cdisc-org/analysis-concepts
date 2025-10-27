// ============================================================================
// COMMON QUERIES FOR ANALYSIS CONCEPTS APPLICATION
// ============================================================================
// This file contains common queries that the application will use to:
// 1. List and filter AC templates
// 2. Determine execution order based on dependencies
// 3. Trace data lineage
// 4. Configure AC instances
// 5. Retrieve sponsor models
// ============================================================================

// ============================================================================
// QUERY 1: LIST ALL AC TEMPLATES
// ============================================================================
// Returns all available AC templates with their basic information
// Use Case: Populate template library dropdown in the application

MATCH (t:ACTemplate)
OPTIONAL MATCH (t)-[:HAS_INPUT]->(i:AnalysisInput)
OPTIONAL MATCH (t)-[:HAS_OUTPUT]->(o:AnalysisOutput)
OPTIONAL MATCH (t)-[:DEPENDS_ON]->(dep:ACTemplate)
RETURN t.id as TemplateID,
       t.name as TemplateName,
       t.purpose as Purpose,
       t.statoLabel as StatisticalConcept,
       COLLECT(DISTINCT i.sourceClassVariable) as RequiredInputs,
       COLLECT(DISTINCT o.classVariableName) as Outputs,
       COLLECT(DISTINCT dep.id) as Dependencies,
       t.population as Population,
       t.timing as Timing
ORDER BY t.id;

// ============================================================================
// QUERY 2: FILTER AC TEMPLATES BY DATASET
// ============================================================================
// Filters templates that are applicable to a specific ADaM dataset structure
// Parameters: $dataStructure (e.g., 'Basic Data Structure', 'Subject-Level Analysis Dataset')
// Use Case: Show only relevant templates when user selects a dataset

MATCH (t:ACTemplate)-[:HAS_INPUT]->(i:AnalysisInput)-[:OF_CLASS]->(vc:ADaMVariableClass)
WHERE vc.dataStructureName = $dataStructure
WITH DISTINCT t
OPTIONAL MATCH (t)-[:DEPENDS_ON]->(dep:ACTemplate)
RETURN t.id as TemplateID,
       t.name as TemplateName,
       t.purpose as Purpose,
       COLLECT(DISTINCT dep.id) as Dependencies
ORDER BY t.id;

// Example usage with parameter:
// :param dataStructure => 'Basic Data Structure'

// ============================================================================
// QUERY 3: GET EXECUTION ORDER FOR SELECTED ACS (TOPOLOGICAL SORT)
// ============================================================================
// Determines the correct execution order for a set of AC instances
// based on their dependencies
// Parameters: $acIds (list of AC IDs, e.g., ['D_AC_001', 'D_AC_002'])
// Use Case: Show user the order in which ACs will be executed

MATCH (ac:ACStudyInstance)
WHERE ac.id IN $acIds
WITH COLLECT(ac) as selectedACs
UNWIND selectedACs as ac
OPTIONAL MATCH path = (ac)-[:DEPENDS_ON*]->(dep:ACStudyInstance)
WHERE dep IN selectedACs
WITH ac, COLLECT(DISTINCT dep) as dependencies,
     CASE WHEN path IS NULL THEN 0 ELSE length(path) END as depth
RETURN ac.id as AC_ID,
       ac.name as AC_Name,
       COLLECT(DISTINCT d.id) as DependsOn,
       MAX(depth) as ExecutionLevel
ORDER BY ExecutionLevel, ac.id;

// Example usage with parameter:
// :param acIds => ['D_AC_001', 'D_AC_002']

// ============================================================================
// QUERY 4: GET ALL DEPENDENCIES FOR A SPECIFIC AC
// ============================================================================
// Returns all direct and transitive dependencies for an AC
// Parameters: $acId (e.g., 'D_AC_002')
// Use Case: Show user what other ACs must be executed first

MATCH path = (ac:ACStudyInstance {id: $acId})-[:DEPENDS_ON*]->(dep)
RETURN dep.id as DependencyID,
       dep.name as DependencyName,
       length(path) as DependencyLevel,
       [node in nodes(path) | node.id] as DependencyPath
ORDER BY DependencyLevel, DependencyID;

// Example usage with parameter:
// :param acId => 'D_AC_002'

// ============================================================================
// QUERY 5: FIND STUDY INSTANCES THAT INSTANTIATE A TEMPLATE
// ============================================================================
// Returns all study instances created from a specific template
// Parameters: $templateId (e.g., 'T_AC_001')
// Use Case: Show examples of how a template has been used

MATCH (s:ACStudyInstance)-[r:INSTANTIATES]->(t:ACTemplate {id: $templateId})
OPTIONAL MATCH (ds:ADaMDataset)-[:CONTAINS_AC]->(s)
RETURN s.id as InstanceID,
       s.name as InstanceName,
       s.studyId as StudyID,
       s.parameterCode as ParameterCode,
       ds.datasetName as Dataset,
       r.instantiatedDate as InstantiatedDate,
       r.instantiatedBy as InstantiatedBy
ORDER BY s.id;

// Example usage with parameter:
// :param templateId => 'T_AC_001'

// ============================================================================
// QUERY 6: TRACE DATA LINEAGE FOR A SUBJECT/VARIABLE
// ============================================================================
// Traces the complete data lineage from SDTM to final derived value
// Parameters: $usubjid, $paramcd, $visitnum
// Use Case: Show data provenance and transformations

MATCH path = (sdtm:DataNode {sourceType: 'SDTM'})-[:DERIVED_FROM*0..5]-(derived:DataNode)
WHERE derived.usubjid = $usubjid
  AND derived.paramcd = $paramcd
  AND derived.visitnum = $visitnum
MATCH (derived)-[:DERIVED_BY_AC]->(ac)
RETURN nodes(path) as DataLineage,
       [rel in relationships(path) | type(rel)] as Transformations,
       COLLECT(DISTINCT ac.id) as AppliedACs,
       derived.aval as FinalValue,
       derived.chg as ChangeFromBaseline
LIMIT 1;

// Example usage with parameters:
// :param usubjid => 'ACME-001'
// :param paramcd => 'SYSBP'
// :param visitnum => 2

// ============================================================================
// QUERY 7: GET AVAILABLE INPUTS FOR CONFIGURING AN AC
// ============================================================================
// Returns inputs that need to be configured (not dependent on other ACs)
// Parameters: $acId
// Use Case: Show user which inputs they need to map to source data

MATCH (ac:ACStudyInstance {id: $acId})-[:HAS_INPUT]->(i:AnalysisInput)
WHERE i.sourceAC IS NULL AND i.sourceACTemplate IS NULL
MATCH (i)-[:OF_CLASS]->(vc:ADaMVariableClass)
RETURN i.inputId as InputID,
       i.sourceClassVariable as ClassVariable,
       i.role as Role,
       i.required as Required,
       i.dataType as DataType,
       vc.variableLabel as VariableDescription
ORDER BY i.inputId;

// Example usage with parameter:
// :param acId => 'D_AC_001'

// ============================================================================
// QUERY 8: GET SPONSOR ADAM MODEL DETAILS
// ============================================================================
// Returns details of a sponsor's ADaM implementation
// Parameters: $sponsorId (e.g., 'ACME_ADAM_V1')
// Use Case: Load sponsor model when user selects a sponsor

MATCH (sponsor:SponsorADaMModel {id: $sponsorId})
OPTIONAL MATCH (sponsor)-[:CONTAINS_DATASET]->(ds:ADaMDataset)
OPTIONAL MATCH (ds)-[:CONTAINS]->(var:ADaMIGVariable)
OPTIONAL MATCH (var)-[:OF_CLASS]->(vc:ADaMVariableClass)
RETURN sponsor.sponsor as SponsorName,
       sponsor.modelVersion as ModelVersion,
       sponsor.adamigVersion as ADaMIGVersion,
       COLLECT(DISTINCT {
         dataset: ds.datasetName,
         datasetLabel: ds.datasetLabel,
         dataStructure: ds.dataStructure,
         variables: COLLECT(DISTINCT {
           name: var.variableName,
           label: var.variableLabel,
           type: var.type,
           classVariable: vc.variableName
         })
       }) as Datasets;

// Example usage with parameter:
// :param sponsorId => 'ACME_ADAM_V1'

// ============================================================================
// QUERY 9: LIST AVAILABLE SPONSOR MODELS
// ============================================================================
// Returns all available sponsor ADaM models
// Use Case: Populate sponsor selection dropdown

MATCH (sponsor:SponsorADaMModel)
OPTIONAL MATCH (sponsor)-[:CONTAINS_DATASET]->(ds:ADaMDataset)
RETURN sponsor.id as SponsorID,
       sponsor.sponsor as SponsorName,
       sponsor.modelVersion as ModelVersion,
       sponsor.adamigVersion as ADaMIGVersion,
       sponsor.createdDate as CreatedDate,
       COUNT(DISTINCT ds) as DatasetCount
ORDER BY sponsor.sponsor;

// ============================================================================
// QUERY 10: GET AC TEMPLATES WITH COMPATIBLE SPONSOR VARIABLES
// ============================================================================
// Finds templates compatible with a sponsor's ADaM implementation
// Parameters: $sponsorId, $datasetName
// Use Case: Filter templates based on available sponsor variables

MATCH (sponsor:SponsorADaMModel {id: $sponsorId})-[:CONTAINS_DATASET]->(ds:ADaMDataset {datasetName: $datasetName})
MATCH (ds)-[:CONTAINS]->(var:ADaMIGVariable)-[:OF_CLASS]->(vc:ADaMVariableClass)
MATCH (t:ACTemplate)-[:HAS_INPUT]->(i:AnalysisInput)-[:OF_CLASS]->(vc)
WHERE i.required = true
WITH t, COLLECT(DISTINCT vc.variableName) as requiredVars,
     COLLECT(DISTINCT var.variableName) as availableVars
WHERE ALL(reqVar IN requiredVars WHERE reqVar IN availableVars)
RETURN t.id as TemplateID,
       t.name as TemplateName,
       t.purpose as Purpose,
       requiredVars as RequiredVariables
ORDER BY t.id;

// Example usage with parameters:
// :param sponsorId => 'ACME_ADAM_V1'
// :param datasetName => 'ADVS'

// ============================================================================
// QUERY 11: GET EXECUTION STATISTICS
// ============================================================================
// Returns statistics about AC executions and derived data
// Use Case: Dashboard showing data processing summary

MATCH (ac:ACStudyInstance)
OPTIONAL MATCH (derived:DataNode)-[:DERIVED_BY_AC]->(ac)
OPTIONAL MATCH (s:Subject)<-[:FOR_SUBJECT]-(derived)
RETURN ac.id as AC_ID,
       ac.name as AC_Name,
       COUNT(DISTINCT derived) as RecordsCreated,
       COUNT(DISTINCT s) as SubjectsProcessed,
       MIN(derived.visitnum) as MinVisit,
       MAX(derived.visitnum) as MaxVisit
ORDER BY ac.id;

// ============================================================================
// QUERY 12: VALIDATE AC CONFIGURATION
// ============================================================================
// Validates that all required inputs for an AC are available
// Parameters: $acId
// Use Case: Pre-execution validation

MATCH (ac:ACStudyInstance {id: $acId})-[:HAS_INPUT]->(i:AnalysisInput)
WHERE i.required = true
OPTIONAL MATCH (i)-[:MAPS_TO_VARIABLE]->(var:ADaMIGVariable)
OPTIONAL MATCH (sourceAC:ACStudyInstance {id: i.sourceAC})
RETURN i.inputId as InputID,
       i.sourceClassVariable as RequiredVariable,
       i.role as Role,
       CASE
         WHEN var IS NOT NULL THEN 'Mapped to ' + var.variableName
         WHEN sourceAC IS NOT NULL THEN 'Depends on ' + sourceAC.id
         ELSE 'NOT CONFIGURED'
       END as Status,
       CASE
         WHEN var IS NULL AND sourceAC IS NULL THEN false
         ELSE true
       END as IsConfigured
ORDER BY i.inputId;

// Example usage with parameter:
// :param acId => 'D_AC_001'

// ============================================================================
// QUERY 13: FIND AC TEMPLATES BY STATISTICAL METHOD
// ============================================================================
// Searches templates by STATO ontology classification
// Parameters: $statoLabel (e.g., 'difference', 'baseline value identification')
// Use Case: Search templates by statistical concept

MATCH (t:ACTemplate)
WHERE toLower(t.statoLabel) CONTAINS toLower($statoLabel)
RETURN t.id as TemplateID,
       t.name as TemplateName,
       t.statoLabel as StatisticalConcept,
       t.statoIRI as StatoIRI,
       t.implementation as Implementation
ORDER BY t.name;

// Example usage with parameter:
// :param statoLabel => 'baseline'

// ============================================================================
// END OF QUERIES
// ============================================================================
