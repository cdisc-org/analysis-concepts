# Hybrid Phrase-Based Approach: Building Blocks with Bindings

## Executive Summary

This document demonstrates a **hybrid approach** to analysis specification that balances human readability with machine executability. The approach has three layers:

1. **Human-Facing Layer**: Natural language phrases composed from building blocks
2. **Machine Binding Layer**: Structured mappings to datasets, variables, and parameters
3. **Execution Layer**: Generated code (SAS, R, Python)

This example uses **M_AC_021 (ADAS-Cog Dose Response Analysis)** to show how complex statistical analyses can be expressed as phrases while remaining fully executable.

---

## 1. Building Block Library

Building blocks are atomic, reusable units that capture common analysis concepts. Each block has:
- A human-readable phrase template
- Typed slots that accept specific inputs
- Binding requirements (what data elements are needed)

### 1.1 Core Building Blocks

```yaml
# ============================================
# BUILDING BLOCK LIBRARY
# ============================================

BUILDING_BLOCKS:

  # -------------------- OUTCOME BLOCKS --------------------

  - BLOCK_ID: BB_OUTCOME_001
    BLOCK_NAME: "change_from_baseline"
    PHRASE_TEMPLATE: "change in {parameter} from baseline to {timepoint}"
    SLOTS:
      - parameter:
          type: "continuous_measure"
          description: "The measurement being assessed"
          required: true
      - timepoint:
          type: "temporal_reference"
          description: "The analysis timepoint"
          required: true
    BINDING_REQUIREMENTS:
      - variable:
          class: "CHG"
          data_type: "Numeric"
          description: "Change from baseline variable"
      - baseline_variable:
          class: "BASE"
          data_type: "Numeric"
      - analysis_value:
          class: "AVAL"
          data_type: "Numeric"
      - timepoint_variable:
          class: "AVISIT"
          data_type: "Character"
    STATISTICAL_ROLE: "dependent_variable"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000175"

  - BLOCK_ID: BB_OUTCOME_002
    BLOCK_NAME: "absolute_value"
    PHRASE_TEMPLATE: "{parameter} at {timepoint}"
    SLOTS:
      - parameter:
          type: "continuous_measure"
          required: true
      - timepoint:
          type: "temporal_reference"
          required: true
    BINDING_REQUIREMENTS:
      - variable:
          class: "AVAL"
          data_type: "Numeric"
    STATISTICAL_ROLE: "dependent_variable"

  # -------------------- PREDICTOR BLOCKS --------------------

  - BLOCK_ID: BB_PREDICTOR_001
    BLOCK_NAME: "dose_continuous"
    PHRASE_TEMPLATE: "dose as continuous predictor"
    SLOTS: {}
    BINDING_REQUIREMENTS:
      - variable:
          class: "TRTPN"
          data_type: "Numeric"
          description: "Numeric treatment/dose variable"
    STATISTICAL_ROLE: "fixed_effect"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000468"

  - BLOCK_ID: BB_PREDICTOR_002
    BLOCK_NAME: "treatment_categorical"
    PHRASE_TEMPLATE: "treatment groups"
    SLOTS: {}
    BINDING_REQUIREMENTS:
      - variable:
          class: "TRT01A"
          data_type: "Character"
    STATISTICAL_ROLE: "fixed_effect"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000474"

  - BLOCK_ID: BB_PREDICTOR_003
    BLOCK_NAME: "covariate_categorical"
    PHRASE_TEMPLATE: "adjusting for {covariate}"
    SLOTS:
      - covariate:
          type: "categorical_variable"
          description: "Stratification or adjustment variable"
          required: true
    BINDING_REQUIREMENTS:
      - variable:
          class: "SITEGRy"
          data_type: "Character"
    STATISTICAL_ROLE: "fixed_effect"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000468"

  # -------------------- POPULATION BLOCKS --------------------

  - BLOCK_ID: BB_POPULATION_001
    BLOCK_NAME: "analysis_population"
    PHRASE_TEMPLATE: "in {population_name} population"
    SLOTS:
      - population_name:
          type: "population_descriptor"
          required: true
          examples: ["efficacy", "safety", "intent-to-treat", "per-protocol"]
    BINDING_REQUIREMENTS:
      - flag_variable:
          role: "population_flag"
          data_type: "Character"
          values: ["Y", "N"]
      - selection_criterion:
          type: "equality_filter"
          format: "{flag_variable} = 'Y'"
    STATISTICAL_ROLE: "population_filter"

  - BLOCK_ID: BB_POPULATION_002
    BLOCK_NAME: "record_selection"
    PHRASE_TEMPLATE: "where {condition}"
    SLOTS:
      - condition:
          type: "logical_expression"
          required: true
    BINDING_REQUIREMENTS:
      - filter_variable:
          data_type: "Any"
      - comparison_operator:
          values: ["=", "!=", "<", ">", "<=", ">=", "IN"]
      - comparison_value:
          type: "literal_or_list"
    STATISTICAL_ROLE: "record_filter"

  # -------------------- TEMPORAL BLOCKS --------------------

  - BLOCK_ID: BB_TEMPORAL_001
    BLOCK_NAME: "at_timepoint"
    PHRASE_TEMPLATE: "at {timepoint}"
    SLOTS:
      - timepoint:
          type: "temporal_reference"
          required: true
          examples: ["Week 24", "Month 6", "End of Treatment", "Baseline"]
    BINDING_REQUIREMENTS:
      - timepoint_variable:
          class: "AVISIT"
          data_type: "Character"
      - selection_criterion:
          type: "equality_filter"
          format: "{timepoint_variable} = '{timepoint}'"
    STATISTICAL_ROLE: "temporal_filter"

  # -------------------- STATISTICAL METHOD BLOCKS --------------------

  - BLOCK_ID: BB_METHOD_001
    BLOCK_NAME: "linear_model"
    PHRASE_TEMPLATE: "using linear model"
    SLOTS: {}
    BINDING_REQUIREMENTS:
      - method_type:
          value: "linear_model"
      - formula_pattern:
          format: "OUTCOME ~ PREDICTOR1 + PREDICTOR2 + ..."
      - test_type:
          values: ["type3_ss", "type1_ss", "type2_ss"]
    STATISTICAL_ROLE: "analysis_method"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000464"

  - BLOCK_ID: BB_METHOD_002
    BLOCK_NAME: "mixed_model"
    PHRASE_TEMPLATE: "using mixed model with {random_effects}"
    SLOTS:
      - random_effects:
          type: "variable_list"
          required: true
    BINDING_REQUIREMENTS:
      - method_type:
          value: "mixed_model"
      - random_structure:
          format: "RANDOM {variable_list}"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000464"

  - BLOCK_ID: BB_METHOD_003
    BLOCK_NAME: "ancova"
    PHRASE_TEMPLATE: "using ANCOVA with baseline as covariate"
    SLOTS: {}
    BINDING_REQUIREMENTS:
      - method_type:
          value: "ancova"
      - baseline_covariate:
          class: "BASE"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000039"

  # -------------------- OUTPUT/RESULT BLOCKS --------------------

  - BLOCK_ID: BB_RESULT_001
    BLOCK_NAME: "treatment_effect_estimate"
    PHRASE_TEMPLATE: "estimate of {effect_type} with standard error"
    SLOTS:
      - effect_type:
          type: "effect_descriptor"
          required: true
          examples: ["treatment effect", "dose effect", "time effect"]
    BINDING_REQUIREMENTS:
      - estimate_variable:
          role: "model parameter estimate"
          data_type: "Numeric"
      - se_variable:
          role: "standard error of estimate"
          data_type: "Numeric"
    OUTPUT_CARDINALITY: "multiple"  # estimate + SE
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000144"

  - BLOCK_ID: BB_RESULT_002
    BLOCK_NAME: "hypothesis_test"
    PHRASE_TEMPLATE: "test for {null_hypothesis} reporting {test_statistic} and p-value"
    SLOTS:
      - null_hypothesis:
          type: "hypothesis_statement"
          required: true
          examples: ["no treatment effect", "no dose-response", "equality of means"]
      - test_statistic:
          type: "statistic_type"
          required: true
          values: ["F-statistic", "t-statistic", "chi-square", "z-score"]
    BINDING_REQUIREMENTS:
      - test_stat_variable:
          role: "test statistic"
          data_type: "Numeric"
      - pvalue_variable:
          role: "p-value"
          data_type: "Numeric"
    OUTPUT_CARDINALITY: "multiple"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000282"

  - BLOCK_ID: BB_RESULT_003
    BLOCK_NAME: "model_fit"
    PHRASE_TEMPLATE: "report model fit using {fit_measure}"
    SLOTS:
      - fit_measure:
          type: "goodness_of_fit_measure"
          required: true
          values: ["R-squared", "adjusted R-squared", "AIC", "BIC"]
    BINDING_REQUIREMENTS:
      - fit_variable:
          role: "goodness of fit measure"
          data_type: "Numeric"
    STATO_IRI: "http://purl.obolibrary.org/obo/STATO_0000564"
```

---

## 2. Phrase Composition Patterns

Building blocks compose into complete analysis phrases using standard patterns:

```yaml
# ============================================
# COMPOSITION PATTERNS
# ============================================

COMPOSITION_PATTERNS:

  - PATTERN_ID: COMP_001
    PATTERN_NAME: "Simple Analysis"
    STRUCTURE: "{METHOD} for {OUTCOME} in {POPULATION}"
    EXAMPLE: "Using linear model for change in ADAS-Cog from baseline to Week 24 in efficacy population"
    REQUIRED_BLOCKS:
      - BB_METHOD_*
      - BB_OUTCOME_*
      - BB_POPULATION_*

  - PATTERN_ID: COMP_002
    PATTERN_NAME: "Comparative Analysis"
    STRUCTURE: "{METHOD} comparing {OUTCOME} across {PREDICTOR} in {POPULATION}"
    EXAMPLE: "Using ANCOVA comparing change in weight across treatment groups in safety population"
    REQUIRED_BLOCKS:
      - BB_METHOD_*
      - BB_OUTCOME_*
      - BB_PREDICTOR_*
      - BB_POPULATION_*

  - PATTERN_ID: COMP_003
    PATTERN_NAME: "Adjusted Analysis"
    STRUCTURE: "{METHOD} for {OUTCOME} with {PREDICTOR} {COVARIATE} in {POPULATION} {TEMPORAL}"
    EXAMPLE: "Using linear model for change in ADAS-Cog with dose as continuous predictor adjusting for site group in efficacy population at Week 24"
    REQUIRED_BLOCKS:
      - BB_METHOD_*
      - BB_OUTCOME_*
      - BB_PREDICTOR_*
      - BB_PREDICTOR_003  # covariate
      - BB_POPULATION_*
      - BB_TEMPORAL_*

  - PATTERN_ID: COMP_004
    PATTERN_NAME: "Complete Specification"
    STRUCTURE: "{METHOD} for {OUTCOME} with {PREDICTOR} {COVARIATE} in {POPULATION} {TEMPORAL} {RECORD_FILTERS} reporting {RESULTS}"
    EXAMPLE: "Full statistical analysis specification with all components"
    REQUIRED_BLOCKS:
      - BB_METHOD_*
      - BB_OUTCOME_*
      - BB_PREDICTOR_*
      - BB_POPULATION_*
      - BB_TEMPORAL_*
      - BB_POPULATION_002  # record filters
      - BB_RESULT_*
```

---

## 3. M_AC_021 in Phrase-Based Format

Here's how the M_AC_021 dose-response analysis looks using the phrase-based approach:

```yaml
# ============================================
# M_AC_021: ADAS-Cog Dose Response Analysis
# PHRASE-BASED SPECIFICATION
# ============================================

AC_ID: "M_AC_021"
AC_TEMPLATE: "T_AC_007"
AC_NAME: "ADAS-Cog Dose Response Analysis - Linear Model"

# -------------------- HUMAN-FACING LAYER --------------------

ANALYSIS_DESCRIPTION:
  PRIMARY_PHRASE: |
    Test for dose-response relationship **using linear model** for
    **change in ADAS-Cog (11) Total Score from baseline to Week 24**
    with **dose as continuous predictor** **adjusting for site group**
    **in efficacy population** **at Week 24** **where ADAS-Cog total score
    records are analyzed**, reporting **dose effect estimate with
    standard error**, **F-statistic, p-value**, and **R-squared**.

  DECOMPOSED_PHRASES:
    OUTCOME:
      block: BB_OUTCOME_001
      phrase: "change in ADAS-Cog (11) Total Score from baseline to Week 24"
      slots:
        parameter: "ADAS-Cog (11) Total Score"
        timepoint: "Week 24"

    PREDICTOR:
      block: BB_PREDICTOR_001
      phrase: "dose as continuous predictor"

    COVARIATE:
      block: BB_PREDICTOR_003
      phrase: "adjusting for site group"
      slots:
        covariate: "site group"

    POPULATION:
      block: BB_POPULATION_001
      phrase: "in efficacy population"
      slots:
        population_name: "efficacy"

    TEMPORAL:
      block: BB_TEMPORAL_001
      phrase: "at Week 24"
      slots:
        timepoint: "Week 24"

    PARAMETER_FILTER:
      block: BB_POPULATION_002
      phrase: "where PARAMCD = 'ATOT'"
      slots:
        condition: "PARAMCD = 'ATOT'"

    ANALYSIS_FLAG:
      block: BB_POPULATION_002
      phrase: "where ANL01FL = 'Y'"
      slots:
        condition: "ANL01FL = 'Y'"

    METHOD:
      block: BB_METHOD_001
      phrase: "using linear model"

    RESULTS:
      - block: BB_RESULT_001
        phrase: "estimate of dose effect with standard error"
        slots:
          effect_type: "dose effect"

      - block: BB_RESULT_002
        phrase: "test for no dose-response reporting F-statistic and p-value"
        slots:
          null_hypothesis: "no dose-response"
          test_statistic: "F-statistic"

      - block: BB_RESULT_003
        phrase: "report model fit using R-squared"
        slots:
          fit_measure: "R-squared"

# -------------------- MACHINE BINDING LAYER --------------------

BINDINGS:

  # Outcome binding
  OUTCOME_BINDING:
    phrase_block: BB_OUTCOME_001
    phrase_text: "change in ADAS-Cog (11) Total Score from baseline to Week 24"
    source_analysis: D_AC_003
    source_analysis_name: "Change from Baseline ADAS-Cog (11)"
    dataset: ADQSADAS
    variable: CHG
    variable_class: CHG
    data_type: Numeric
    measurement_scale: continuous
    role: dependent_variable
    stato_iri: "http://purl.obolibrary.org/obo/STATO_0000175"
    description: "Change from baseline in ADAS-Cog (11) Total Score"
    dependencies:
      - variable: AVAL
        description: "ADAS-Cog (11) analysis value at post-baseline visit"
      - variable: BASE
        description: "ADAS-Cog (11) baseline value"
      - variable: AVISIT
        filter: "AVISIT = 'Week 24'"

  # Dose predictor binding
  DOSE_BINDING:
    phrase_block: BB_PREDICTOR_001
    phrase_text: "dose as continuous predictor"
    dataset: ADQSADAS
    variable: TRTPN
    variable_class: TRTPN
    data_type: Numeric
    measurement_scale: continuous
    role: fixed_effect
    stato_iri: "http://purl.obolibrary.org/obo/STATO_0000468"
    description: "Dose as continuous variable (0 for placebo; 54 for low dose; 81 for high dose)"
    coding:
      placebo: 0
      low_dose: 54
      high_dose: 81

  # Site group covariate binding
  COVARIATE_BINDING:
    phrase_block: BB_PREDICTOR_003
    phrase_text: "adjusting for site group"
    dataset: ADQSADAS
    variable: SITEGR1
    variable_class: SITEGRy
    data_type: Character
    measurement_scale: categorical
    role: fixed_effect
    stato_iri: "http://purl.obolibrary.org/obo/STATO_0000468"
    description: "Site group"

  # Population binding
  POPULATION_BINDING:
    phrase_block: BB_POPULATION_001
    phrase_text: "in efficacy population"
    dataset: ADQSADAS
    variable: EFFFL
    data_type: Character
    measurement_scale: nominal
    role: population_flag
    selection_criteria: "EFFFL = 'Y'"
    description: "Efficacy Population Flag"

  # Analysis flag binding
  ANALYSIS_FLAG_BINDING:
    phrase_block: BB_POPULATION_002
    phrase_text: "where ANL01FL = 'Y'"
    dataset: ADQSADAS
    variable: ANL01FL
    variable_class: ANLzzFL
    data_type: Character
    measurement_scale: nominal
    role: population_flag
    selection_criteria: "ANL01FL = 'Y'"
    description: "Analysis Flag 01"

  # Parameter filter binding
  PARAMETER_BINDING:
    phrase_block: BB_POPULATION_002
    phrase_text: "where PARAMCD = 'ATOT'"
    dataset: ADQSADAS
    variable: PARAMCD
    variable_class: PARAMCD
    data_type: Character
    measurement_scale: nominal
    role: parameter
    selection_criteria: "PARAMCD = 'ATOT'"
    description: "Parameter Code"

  # Temporal binding
  TEMPORAL_BINDING:
    phrase_block: BB_TEMPORAL_001
    phrase_text: "at Week 24"
    dataset: ADQSADAS
    variable: AVISIT
    variable_class: AVISIT
    data_type: Character
    measurement_scale: nominal
    role: grouping_variable
    selection_criteria: "AVISIT = 'Week 24'"
    description: "Analysis Visit for filtering"

  # Method binding
  METHOD_BINDING:
    phrase_block: BB_METHOD_001
    phrase_text: "using linear model"
    analysis_method: linear_model
    model_formula: "CHG ~ TRTPN + SITEGR1"
    stato_iri: "http://purl.obolibrary.org/obo/STATO_0000464"
    stato_label: "linear mixed model"
    parameters:
      type3_ss: true
      estimation_method: "REML"

  # Result bindings
  RESULT_BINDINGS:
    - phrase_block: BB_RESULT_001
      phrase_text: "estimate of dose effect with standard error"
      outputs:
        - variable_name: DOSE_EFFECT
          description: "Dose coefficient (slope) - linear effect of dose on CHG"
          data_type: Numeric
          measurement_scale: continuous
          role: "model parameter estimate"
          stato_iri: "http://purl.obolibrary.org/obo/STATO_0000144"
          cardinality: single

        - variable_name: DOSE_EFFECT_SE
          description: "Standard error of dose coefficient"
          data_type: Numeric
          measurement_scale: continuous
          role: "standard error of estimate"
          stato_iri: "http://purl.obolibrary.org/obo/STATO_0000562"
          cardinality: single

    - phrase_block: BB_RESULT_002
      phrase_text: "test for no dose-response reporting F-statistic and p-value"
      outputs:
        - variable_name: F_STAT
          description: "F-statistic for dose effect"
          data_type: Numeric
          measurement_scale: continuous
          role: "F-statistic"
          stato_iri: "http://purl.obolibrary.org/obo/STATO_0000282"
          cardinality: single

        - variable_name: PVAL
          description: "P-value for dose effect (Type III SS for treatment dose)"
          data_type: Numeric
          measurement_scale: continuous
          role: "p-value for two-sided test"
          stato_iri: "http://purl.obolibrary.org/obo/STATO_0000662"
          cardinality: single

    - phrase_block: BB_RESULT_003
      phrase_text: "report model fit using R-squared"
      outputs:
        - variable_name: R_SQUARED
          description: "R-squared for model fit"
          data_type: Numeric
          measurement_scale: continuous
          role: "coefficient of determination"
          stato_iri: "http://purl.obolibrary.org/obo/STATO_0000564"
          cardinality: single

# -------------------- EXECUTION LAYER --------------------

EXECUTION_SPECIFICATION:

  # Data preparation steps (derived from bindings)
  DATA_PREPARATION:
    source_dataset: ADQSADAS
    filters:
      - condition: "EFFFL = 'Y'"
        description: "Select efficacy population"
      - condition: "ANL01FL = 'Y'"
        description: "Select analysis records"
      - condition: "PARAMCD = 'ATOT'"
        description: "Select ADAS-Cog total score parameter"
      - condition: "AVISIT = 'Week 24'"
        description: "Select Week 24 visit"

    required_variables:
      - CHG          # Outcome from D_AC_003
      - TRTPN        # Dose predictor
      - SITEGR1      # Covariate
      - EFFFL        # Population flag
      - ANL01FL      # Analysis flag
      - PARAMCD      # Parameter code
      - AVISIT       # Visit

  # Statistical model (derived from method binding)
  STATISTICAL_MODEL:
    procedure: "LINEAR_MODEL"
    formula: "CHG ~ TRTPN + SITEGR1"
    components:
      dependent_variable: CHG
      predictors:
        - variable: TRTPN
          type: continuous
          role: primary_predictor
        - variable: SITEGR1
          type: categorical
          role: covariate
      test_specification:
        type: "Type III Sum of Squares"
        test_variable: TRTPN
        null_hypothesis: "H0: beta_TRTPN = 0 (no linear dose effect)"
        alternative_hypothesis: "HA: beta_TRTPN != 0 (linear dose effect exists)"

    outputs:
      parameter_estimates:
        - name: DOSE_EFFECT
          parameter: "TRTPN coefficient"
          extract: "beta_TRTPN"
        - name: DOSE_EFFECT_SE
          parameter: "TRTPN standard error"
          extract: "se_TRTPN"

      hypothesis_test:
        - name: F_STAT
          test: "Type III F-test for TRTPN"
          extract: "F_value_TRTPN"
        - name: PVAL
          test: "Type III F-test for TRTPN"
          extract: "p_value_TRTPN"

      model_fit:
        - name: R_SQUARED
          statistic: "R-squared"
          extract: "R2"

  # Code generation template
  CODE_GENERATION:
    target_language: "SAS"
    template: |
      /* ========================================== */
      /* M_AC_021: ADAS-Cog Dose Response Analysis */
      /* Generated from phrase-based specification */
      /* ========================================== */

      /* Data preparation */
      DATA analysis_data;
        SET adqsadas;
        WHERE EFFFL = 'Y'
          AND ANL01FL = 'Y'
          AND PARAMCD = 'ATOT'
          AND AVISIT = 'Week 24';
      RUN;

      /* Linear model analysis */
      PROC GLM DATA=analysis_data;
        CLASS SITEGR1;
        MODEL CHG = TRTPN SITEGR1 / SOLUTION SS3;
        ODS OUTPUT
          ParameterEstimates=param_est
          FitStatistics=fit_stats
          ModelANOVA=anova_results;
      RUN;

      /* Extract results */
      DATA results;
        SET param_est;
        IF Parameter = 'TRTPN' THEN DO;
          DOSE_EFFECT = Estimate;
          DOSE_EFFECT_SE = StdErr;
          OUTPUT;
        END;
      RUN;

      DATA test_results;
        SET anova_results;
        IF Source = 'TRTPN' THEN DO;
          F_STAT = FValue;
          PVAL = ProbF;
          OUTPUT;
        END;
      RUN;

      DATA model_fit;
        SET fit_stats;
        IF _STAT_ = 'R-SQUARE' THEN DO;
          R_SQUARED = _VALUE_;
          OUTPUT;
        END;
      RUN;

      /* Combine all results */
      DATA M_AC_021_results;
        MERGE results test_results model_fit;
      RUN;

---

## 4. Template-Level Phrase Specification

The template (T_AC_007) can also be expressed in phrase form with placeholders:

```yaml
# ============================================
# T_AC_007: Linear Model Template
# PHRASE-BASED SPECIFICATION
# ============================================

AC_ID: "T_AC_007"
AC_NAME: "Linear Model"

# -------------------- HUMAN-FACING LAYER (TEMPLATE) --------------------

TEMPLATE_PHRASE_PATTERN: |
  Test for linear relationship using linear model for
  {outcome_measure} with {continuous_predictor}
  [{optional: adjusting for {covariate}}]
  in {population} [{optional: at {timepoint}}]
  [{optional: where {additional_filters}}]
  reporting {effect_type} estimate with standard error,
  F-statistic, p-value, and R-squared.

TEMPLATE_BUILDING_BLOCKS:
  OUTCOME:
    block: BB_OUTCOME_001
    required: true
    placeholder: "{outcome_measure}"
    description: "Change from baseline or other continuous outcome"

  PREDICTOR:
    block: BB_PREDICTOR_001
    required: true
    placeholder: "{continuous_predictor}"
    description: "Treatment dose or other continuous predictor"

  COVARIATE:
    block: BB_PREDICTOR_003
    required: false
    placeholder: "{covariate}"
    description: "Stratification or adjustment variable"

  POPULATION:
    block: BB_POPULATION_001
    required: true
    placeholder: "{population}"
    description: "Analysis population"

  TEMPORAL:
    block: BB_TEMPORAL_001
    required: false
    placeholder: "{timepoint}"
    description: "Analysis timepoint"

  METHOD:
    block: BB_METHOD_001
    required: true
    fixed: true  # Not a placeholder - always "linear model"

  RESULTS:
    blocks:
      - BB_RESULT_001  # Effect estimate + SE
      - BB_RESULT_002  # Hypothesis test
      - BB_RESULT_003  # Model fit
    required: true
    fixed: true  # Standard output set

# -------------------- BINDING LAYER (TEMPLATE) --------------------

TEMPLATE_BINDING_REQUIREMENTS:

  OUTCOME_REQUIREMENTS:
    variable_class: CHG
    data_type: Numeric
    measurement_scale: continuous
    role: dependent_variable
    must_provide:
      - dataset
      - variable
      - description

  PREDICTOR_REQUIREMENTS:
    variable_class: TRTPN
    data_type: Numeric
    measurement_scale: continuous
    role: fixed_effect
    must_provide:
      - dataset
      - variable
      - description
      - coding_scheme  # How doses are coded numerically

  COVARIATE_REQUIREMENTS:
    variable_class: SITEGRy
    data_type: Character
    measurement_scale: categorical
    role: fixed_effect
    must_provide:
      - dataset
      - variable
      - description

  METHOD_REQUIREMENTS:
    model_type: linear_model
    formula_pattern: "OUTCOME ~ PREDICTOR + [COVARIATE]"
    test_specification:
      type: type3_ss
      test_variable: PREDICTOR

# -------------------- EXECUTION LAYER (TEMPLATE) --------------------

TEMPLATE_EXECUTION_PATTERN:
  code_generation_strategy: "template_substitution"

  sas_template: |
    /* Linear Model: {{AC_NAME}} */

    /* Data preparation */
    DATA analysis_data;
      SET {{dataset}};
      WHERE {{population_filter}}
        {{#temporal_filter}}AND {{temporal_filter}}{{/temporal_filter}}
        {{#additional_filters}}AND {{additional_filters}}{{/additional_filters}};
    RUN;

    /* Linear model */
    PROC GLM DATA=analysis_data;
      {{#has_categorical_covariate}}CLASS {{covariate_variable}};{{/has_categorical_covariate}}
      MODEL {{outcome_variable}} = {{predictor_variable}} {{#covariate}}{{covariate_variable}}{{/covariate}} / SOLUTION SS3;
      ODS OUTPUT ParameterEstimates=param_est FitStatistics=fit_stats ModelANOVA=anova;
    RUN;

    /* Extract results */
    {{results_extraction}}

  r_template: |
    # Linear Model: {{AC_NAME}}

    # Data preparation
    analysis_data <- {{dataset}} %>%
      filter({{population_filter}}
             {{#temporal_filter}}, {{temporal_filter}}{{/temporal_filter}}
             {{#additional_filters}}, {{additional_filters}}{{/additional_filters}})

    # Fit linear model
    model <- lm({{outcome_variable}} ~ {{predictor_variable}} {{#covariate}}+ {{covariate_variable}}{{/covariate}},
                data = analysis_data)

    # Extract results
    summary_model <- summary(model)
    anova_model <- anova(model)

    results <- tibble(
      DOSE_EFFECT = coef(model)["{{predictor_variable}}"],
      DOSE_EFFECT_SE = summary_model$coefficients["{{predictor_variable}}", "Std. Error"],
      F_STAT = anova_model["{{predictor_variable}}", "F value"],
      PVAL = anova_model["{{predictor_variable}}", "Pr(>F)"],
      R_SQUARED = summary_model$r.squared
    )
```

---

## 5. Advantages of the Hybrid Approach

### 5.1 Human-Facing Layer Benefits

**Readability**:
```
"Test for dose-response relationship using linear model for change in
ADAS-Cog (11) Total Score from baseline to Week 24 with dose as
continuous predictor adjusting for site group in efficacy population"
```

vs. traditional YAML:
```yaml
INPUTS:
  - INPUT_ID: M_AC_021_IN_001
    SOURCE_AC: D_AC_003
    ROLE: dependent_variable
  # ... 6 more inputs
```

**Composability**: Building blocks can be mixed and matched:
- "change in {parameter} from baseline to {timepoint}"
- "{parameter} at {timepoint}"
- "percent change in {parameter} from baseline to {timepoint}"

**Domain Alignment**: Phrases match how statisticians think and communicate

### 5.2 Machine Binding Layer Benefits

**Traceability**: Each phrase element maps to specific data elements:
```yaml
OUTCOME_BINDING:
  phrase_text: "change in ADAS-Cog (11) Total Score from baseline to Week 24"
  source_analysis: D_AC_003  # ← Traces to derivation
  variable: CHG
  dataset: ADQSADAS
```

**Validation**: Bindings specify requirements that can be checked:
- Does the dataset exist?
- Is the variable the right data type?
- Are selection criteria syntactically valid?
- Does the source analysis (D_AC_003) exist?

**Type Safety**: Slots have type constraints:
```yaml
slots:
  timepoint:
    type: "temporal_reference"
    examples: ["Week 24", "Month 6", "End of Treatment"]
```

### 5.3 Execution Layer Benefits

**Code Generation**: Bindings contain all information needed for code:
```yaml
DATA_PREPARATION:
  source_dataset: ADQSADAS
  filters:
    - condition: "EFFFL = 'Y'"
    - condition: "AVISIT = 'Week 24'"
```
→ Generates: `WHERE EFFFL = 'Y' AND AVISIT = 'Week 24'`

**Multi-Language Support**: Same bindings can generate SAS, R, Python

**Consistency**: Template ensures all instances follow same analysis pattern

---

## 6. Implementation Roadmap

### Phase 1: Core Building Block Library
- Define 20-30 essential building blocks covering:
  - Common outcomes (change from baseline, absolute value, percent change)
  - Common predictors (treatment groups, dose, time)
  - Common methods (linear model, mixed model, ANCOVA, logistic regression)
  - Common populations and filters
- Document each block with examples

### Phase 2: Binding Specifications
- Create binding schemas for each block
- Define validation rules
- Build binding validation engine

### Phase 3: Code Generation
- Develop template-based code generators for SAS and R
- Create unit tests using existing analyses as gold standards
- Validate generated code produces identical results

### Phase 4: Authoring Tools
- Build GUI for composing analyses from building blocks
- Implement auto-complete for phrase composition
- Add real-time validation of bindings

### Phase 5: Library Expansion
- Add domain-specific building blocks (oncology, cardiology, etc.)
- Support more complex patterns (repeated measures, survival, dose-finding)
- Community contributions and review

---

## 7. Discussion Points for Working Group

1. **Building Block Granularity**: Are these blocks at the right level? Too coarse? Too fine?

2. **Phrase vs. Structure**: Should we support BOTH phrase-based and structured YAML, or migrate fully to phrases?

3. **Template Flexibility**: Should templates allow arbitrary building block combinations, or enforce specific patterns?

4. **Validation Depth**: How much validation at authoring time vs. execution time?

5. **Executability vs. Abstraction**: Have we found the right balance? The phrase layer adds abstraction but bindings ensure executability.

6. **Learning Curve**: Is this easier for statisticians to learn than current YAML? What training is needed?

7. **Versioning**: How do we handle building block evolution? What if BB_OUTCOME_001 definition changes?

8. **Extension Mechanism**: How should organizations add custom building blocks?

9. **Regulatory Acceptance**: Will regulators accept phrase-based specifications, or do they need to see the bindings?

10. **Tooling Requirements**: What tools are essential for this to be practical? (editors, validators, code generators)
