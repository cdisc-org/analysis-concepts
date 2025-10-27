// ============================================================================
// SCHEMA CREATION FOR ANALYSIS CONCEPTS NEO4J DATABASE
// ============================================================================
// This file creates the database schema including constraints and indexes
// for the Analysis Concepts graph model.
//
// Node Types:
//   - ACTemplate: Reusable analysis concept templates
//   - ACStudyInstance: Study-specific analysis concept instances
//   - SponsorADaMModel: Container for sponsor's ADaM implementation
//   - ADaMVariableClass: ADaM IG class variable definitions
//   - ADaMIGVariable: Sponsor-specific variable implementations
//   - DataNode: Actual data records (SDTM or derived)
//   - Subject: Study subjects
//   - AnalysisInput: Input specifications for ACs
//   - AnalysisOutput: Output specifications for ACs
//   - AnalysisMethod: Method specifications for ACs
// ============================================================================

// ============================================================================
// SECTION 1: DROP EXISTING CONSTRAINTS AND INDEXES (for clean setup)
// ============================================================================

// Drop existing constraints if they exist
DROP CONSTRAINT ac_template_id IF EXISTS;
DROP CONSTRAINT ac_study_instance_id IF EXISTS;
DROP CONSTRAINT sponsor_model_id IF EXISTS;
DROP CONSTRAINT adam_var_class_name IF EXISTS;
DROP CONSTRAINT subject_id IF EXISTS;
DROP CONSTRAINT data_node_id IF EXISTS;
DROP CONSTRAINT analysis_input_id IF EXISTS;
DROP CONSTRAINT analysis_output_id IF EXISTS;
DROP CONSTRAINT analysis_method_id IF EXISTS;

// Drop existing indexes if they exist
DROP INDEX ac_template_name_idx IF EXISTS;
DROP INDEX ac_study_instance_name_idx IF EXISTS;
DROP INDEX adam_var_class_label_idx IF EXISTS;
DROP INDEX adam_ig_variable_name_idx IF EXISTS;
DROP INDEX subject_usubjid_idx IF EXISTS;
DROP INDEX data_node_subject_idx IF EXISTS;
DROP INDEX data_node_type_idx IF EXISTS;

// ============================================================================
// SECTION 2: CREATE CONSTRAINTS (Uniqueness and Existence)
// ============================================================================

// ACTemplate: Unique template ID
CREATE CONSTRAINT ac_template_id IF NOT EXISTS
FOR (t:ACTemplate) REQUIRE t.id IS UNIQUE;

// ACStudyInstance: Unique study instance ID
CREATE CONSTRAINT ac_study_instance_id IF NOT EXISTS
FOR (s:ACStudyInstance) REQUIRE s.id IS UNIQUE;

// SponsorADaMModel: Unique sponsor model ID
CREATE CONSTRAINT sponsor_model_id IF NOT EXISTS
FOR (m:SponsorADaMModel) REQUIRE m.id IS UNIQUE;

// ADaMVariableClass: Unique variable name
CREATE CONSTRAINT adam_var_class_name IF NOT EXISTS
FOR (v:ADaMVariableClass) REQUIRE v.variableName IS UNIQUE;

// Subject: Unique subject ID
CREATE CONSTRAINT subject_id IF NOT EXISTS
FOR (s:Subject) REQUIRE s.usubjid IS UNIQUE;

// DataNode: Unique data node ID
CREATE CONSTRAINT data_node_id IF NOT EXISTS
FOR (d:DataNode) REQUIRE d.id IS UNIQUE;

// AnalysisInput: Unique input ID within context
CREATE CONSTRAINT analysis_input_id IF NOT EXISTS
FOR (i:AnalysisInput) REQUIRE i.id IS UNIQUE;

// AnalysisOutput: Unique output ID within context
CREATE CONSTRAINT analysis_output_id IF NOT EXISTS
FOR (o:AnalysisOutput) REQUIRE o.id IS UNIQUE;

// AnalysisMethod: Unique method ID
CREATE CONSTRAINT analysis_method_id IF NOT EXISTS
FOR (m:AnalysisMethod) REQUIRE m.id IS UNIQUE;

// ============================================================================
// SECTION 3: CREATE INDEXES (Performance Optimization)
// ============================================================================

// ACTemplate: Index on name for filtering/searching
CREATE INDEX ac_template_name_idx IF NOT EXISTS
FOR (t:ACTemplate) ON (t.name);

// ACStudyInstance: Index on name for filtering/searching
CREATE INDEX ac_study_instance_name_idx IF NOT EXISTS
FOR (s:ACStudyInstance) ON (s.name);

// ADaMVariableClass: Index on variable label for searching
CREATE INDEX adam_var_class_label_idx IF NOT EXISTS
FOR (v:ADaMVariableClass) ON (v.variableLabel);

// ADaMIGVariable: Index on variable name for lookups
CREATE INDEX adam_ig_variable_name_idx IF NOT EXISTS
FOR (v:ADaMIGVariable) ON (v.variableName);

// Subject: Index on USUBJID for quick lookups
CREATE INDEX subject_usubjid_idx IF NOT EXISTS
FOR (s:Subject) ON (s.usubjid);

// DataNode: Index on subject reference for filtering
CREATE INDEX data_node_subject_idx IF NOT EXISTS
FOR (d:DataNode) ON (d.subjectId);

// DataNode: Index on source type (SDTM vs Derived)
CREATE INDEX data_node_type_idx IF NOT EXISTS
FOR (d:DataNode) ON (d.sourceType);

// ============================================================================
// SECTION 4: VERIFY SCHEMA CREATION
// ============================================================================

// Show all constraints
SHOW CONSTRAINTS;

// Show all indexes
SHOW INDEXES;
