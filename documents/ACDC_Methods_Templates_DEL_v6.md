**AC/DC Framework**

Methods, Templates, and the

Derivation Expression Language (DEL)

*Draft Specification v0.3*

# 1. Introduction

This document defines the core building blocks of the AC/DC Framework: Methods, Templates, and the Derivation Expression Language (DEL). These components work together to enable machine-executable, standard-independent specifications for both data derivations and statistical analyses.

-   Methods: Pure operations with named roles - both computational (Section 2) and statistical (Section 2)

-   Templates: Clinical patterns that bind Semantic Transformation Concepts to Methods (Section 3)

-   DEL: The formal expression language for derivations and model specifications (Section 5)

```{=html}
<!-- -->
```
-   Smart Phrases: User-facing phrases for eSAP composition that carry formal specifications (Section 6)

Methods and Templates are developed and maintained by CDISC as part of the AC/DC Framework standard library.

## 1.1 Framework Architecture

The framework follows a three-layer architecture for both derivation and analysis:

  ---------------- ------------------------------------------------------------ --------------------------------------------
  **Layer**        **Derivation**                                               **Analysis**

  METHOD           Subtraction, Division, DateDifference, Aggregation, \...     t-test, ANOVA, ANCOVA, MMRM, Cox PH, \...

  TEMPLATE         ChangeFromBaseline, PercentChange, TreatmentEmergent, \...   CFB_ANCOVA, TTE_CoxPH, Responder_CMH, \...

  IMPLEMENTATION   ADaM / SDTM / OMOP variables                                 R / SAS / Python code
  ---------------- ------------------------------------------------------------ --------------------------------------------

**Flow:**

-   Methods define operations with named roles (standard-independent)

-   Templates bind Semantic Transformation Concepts to method roles (clinical intent)

-   Implementation binds to physical variables and generates executable code

Both derivation and analysis follow the same pattern: a Method defines the operation with named roles, a Template binds Semantic Transformation Concepts to those roles for a clinical purpose, and Implementation binds to physical variables and generates executable code.

# 2. Methods

A Method is a reusable operation specification. It defines what computation or analysis is performed, using named roles for inputs, outputs, and parameters. Methods are standard-independent - they reference roles, not physical variables.

## 2.1 Method Properties

  ---------------- ------------------------------------------------------------------------
  **Property**     **Description**

  name             Unique identifier for the method (e.g., \'Subtraction\', \'ANCOVA\')

  type             Either \'derivation\' (computational) or \'analysis\' (statistical)

  description      Human-readable explanation of what the method computes

  del_expression   DEL formula for derivations, or Wilkinson-Rogers notation for analyses

  roles            Named placeholders with direction (input/output) and type constraints

  parameters       Configuration options with types, allowed values, and defaults

  outputs          For analysis methods: the statistical outputs produced

  assumptions      For analysis methods: statistical assumptions underlying the method
  ---------------- ------------------------------------------------------------------------

## 2.2 Derivation Methods

*Derivation methods perform computational operations to create derived values.*

+------------------+----------------------------------+-------------------------------------------+---------------------+
| **Method**       | **Description**                  | **DEL Expression**                        | **Roles**           |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| Subtraction      | Difference between two values    | difference := minuend - subtrahend        | minuend (in)        |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | subtrahend (in)     |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | difference (out)    |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| Division         | Ratio of two values              | quotient := dividend / divisor            | dividend (in)       |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | divisor (in)        |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | quotient (out)      |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| PercentChange    | Percentage change between values | result := 100 \* (num - denom) / denom    | numerator (in)      |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | denominator (in)    |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | result (out)        |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| DateDifference   | Elapsed time between dates       | result := DATEDIFF(from, to, unit)        | date_from (in)      |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | date_to (in)        |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | unit (param)        |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | result (out)        |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| ThresholdCompare | Compare value to threshold       | result := IF(value \>= threshold, T, F)   | value (in)          |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | threshold (in)      |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | true_val (param)    |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | false_val (param)   |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | result (out)        |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| Aggregation      | Aggregate over partition         | result := AGG(value) OVER partition       | value (in)          |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | agg_func (param)    |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | partition (in)      |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | result (out)        |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| WindowLookup     | Value from another row           | result := WINDOW(value, offset) OVER part | value (in)          |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | window_func (param) |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | offset (param)      |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | partition (in)      |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | result (out)        |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| Imputation       | Replace missing values           | result := COALESCE(value, imputed)        | value (in)          |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | imputed_value (in)  |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | result (out)        |
+------------------+----------------------------------+-------------------------------------------+---------------------+
| Categorization   | Map to categories                | result := CASE WHEN cond THEN cat END     | value (in)          |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | conditions (param)  |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | categories (param)  |
|                  |                                  |                                           |                     |
|                  |                                  |                                           | result (out)        |
+------------------+----------------------------------+-------------------------------------------+---------------------+

## 2.3 Analysis Methods

*Analysis methods perform statistical procedures. They use Wilkinson-Rogers notation for model specification.*

### 2.3.1 Continuous Outcome Methods

**Method: t_test**

Compares means between two groups or against a reference value.

  ------------------ -------------------------------------------------------------------------
  **Variants**       one_sample \| two_sample \| paired

  **W-R Notation**   response \~ group (two-sample) or response \~ 1 (one-sample)

  **Mathematical**   Two-sample: H₀: μ₁ = μ₂ \| One-sample: H₀: μ = μ₀ \| Paired: H₀: μd = 0

  **Assumptions**    Normality, independence, equal variances (if pooled)
  ------------------ -------------------------------------------------------------------------

  ------------------ ------------ ------------------------------ -----------------------------------------
  **Parameter**      **Type**     **Values**                     **Description**

  alternative        enum         two_sided \| greater \| less   Direction of alternative hypothesis

  var_equal          boolean      true \| false                  Assume equal variances (Welch if false)

  alpha              numeric      0.05 (default)                 Significance level

  mu                 numeric      0 (default)                    Reference value (one-sample)
  ------------------ ------------ ------------------------------ -----------------------------------------

  ---------------------- ------------------------------------------------
  **Output**             **Description**

  t_statistic            Test statistic value

  p_value                P-value for the test

  degrees_of_freedom     Degrees of freedom

  mean_difference        Difference in means (point estimate)

  confidence_interval    CI for mean difference
  ---------------------- ------------------------------------------------

**Method: anova**

Analysis of variance - compares means across multiple groups.

  ------------------ ---------------------------------------------------------------------------------------------
  **Variants**       one_way \| two_way \| multiway

  **W-R Notation**   response \~ factor (one-way) or response \~ factor_a \* factor_b (two-way with interaction)

  **Mathematical**   One-way: Yᵢⱼ = μ + αᵢ + εᵢⱼ \| Two-way: Yᵢⱼₖ = μ + αᵢ + βⱼ + (αβ)ᵢⱼ + εᵢⱼₖ

  **Assumptions**    Normality, homogeneity of variances, independence
  ------------------ ---------------------------------------------------------------------------------------------

  ------------------ ------------ ------------------ ------------------------
  **Parameter**      **Type**     **Values**         **Description**

  ss_type            enum         I \| II \| III     Type of sum of squares

  alpha              numeric      0.05 (default)     Significance level
  ------------------ ------------ ------------------ ------------------------

**Method: ancova**

Analysis of covariance - compares group means controlling for continuous covariates.

  ------------------ ----------------------------------------------------------------------------------------------------------
  **W-R Notation**   response \~ covariate + group (or with interaction: response \~ covariate \* group)

  **Mathematical**   Without interaction: Yᵢⱼ = μ + τᵢ + β·Xᵢⱼ + εᵢⱼ \| With interaction: Yᵢⱼ = μ + τᵢ + β·Xᵢⱼ + γᵢ·Xᵢⱼ + εᵢⱼ

  **Assumptions**    Linearity, homogeneity of regression slopes, normality, homoscedasticity, independence
  ------------------ ----------------------------------------------------------------------------------------------------------

  ------------------ ------------ ------------------ ------------------------------------------
  **Parameter**      **Type**     **Values**         **Description**

  ss_type            enum         I \| II \| III     Type of sum of squares (III most common)

  alpha              numeric      0.05 (default)     Significance level

  interaction        boolean      false (default)    Include covariate×group interaction
  ------------------ ------------ ------------------ ------------------------------------------

  ---------------------- ------------------------------------------------
  **Output**             **Description**

  ls_means               Least-squares means per group

  ls_mean_difference     Difference in LS means

  confidence_interval    CI for LS mean difference

  p_value                P-value for treatment effect

  f_statistic            F-statistic for each effect
  ---------------------- ------------------------------------------------

**Method: mmrm**

Mixed Model for Repeated Measures - primary method for longitudinal continuous outcomes.

  ------------------ ----------------------------------------------------------------
  **W-R Notation**   response \~ covariate + time + group + time:group

  **Mathematical**   Yᵢⱼ = μ + β·Xᵢ + τⱼ + γₖ + (τγ)ⱼₖ + εᵢⱼ, where εᵢ \~ MVN(0, R)

  **Assumptions**    Missing at Random (MAR), multivariate normality of residuals
  ------------------ ----------------------------------------------------------------

  ---------------------- ---------- -------------------------------------------- ------------------------------------
  **Parameter**          **Type**   **Values**                                   **Description**

  covariance_structure   enum       UN \| CS \| AR(1) \| TOEP \| CSH \| ARH(1)   Within-subject covariance

  estimation_method      enum       REML \| ML                                   Estimation method

  df_method              enum       KR \| Satterthwaite \| Containment           Degrees of freedom method

  baseline_interaction   boolean    false (default)                              Include covariate×time interaction
  ---------------------- ---------- -------------------------------------------- ------------------------------------

*Covariance Structure Options:*

  ------------- ---------------------- -------------------------------------------------------
  **Code**      **Name**               **Use When**

  UN            Unstructured           Default; most flexible; requires adequate sample size

  CS            Compound Symmetry      Constant correlation between all timepoints

  AR(1)         Autoregressive(1)      Correlation decays with time lag

  TOEP          Toeplitz               Correlation depends only on lag (banded)

  CSH           Heterogeneous CS       CS with different variances per timepoint

  ARH(1)        Heterogeneous AR(1)    AR(1) with different variances per timepoint
  ------------- ---------------------- -------------------------------------------------------

### 2.3.2 Categorical Outcome Methods

**Method: chi_squared_test**

Tests association between categorical variables.

  ------------------ --------------------------------------------------------------
  **Variants**       pearson \| fisher_exact (when expected counts \< 5)

  **Assumptions**    Independence, adequate expected cell counts (≥5 for Pearson)
  ------------------ --------------------------------------------------------------

  ------------------ ------------ ------------------ ----------------------------------
  **Parameter**      **Type**     **Values**         **Description**

  correction         enum         none \| yates      Continuity correction (2×2 only)

  alpha              numeric      0.05 (default)     Significance level
  ------------------ ------------ ------------------ ----------------------------------

**Method: cochran_mantel_haenszel**

Stratified analysis for 2×2×K tables; tests association controlling for stratification.

  ------------------ ------------ ---------------------------- -------------------------
  **Parameter**      **Type**     **Values**                   **Description**

  strata             role         (TE reference)               Stratification variable

  or_type            enum         common \| stratum_specific   Odds ratio reporting
  ------------------ ------------ ---------------------------- -------------------------

  ---------------------- ------------------------------------------------
  **Output**             **Description**

  cmh_statistic          CMH test statistic

  p_value                P-value for test of association

  common_odds_ratio      Mantel-Haenszel common OR estimate

  confidence_interval    CI for common odds ratio
  ---------------------- ------------------------------------------------

### 2.3.3 Time-to-Event Methods

**Method: kaplan_meier**

Non-parametric estimation of survival function.

  ------------------ ----------------------------------------------------
  **Estimator**      Ŝ(t) = Π(tᵢ≤t) \[(nᵢ - dᵢ)/nᵢ\]

  ------------------ ----------------------------------------------------

  ------------------ ------------ ----------------------------------- ----------------------------------------
  **Parameter**      **Type**     **Values**                          **Description**

  ci_method          enum         log \| log-log \| plain \| arcsin   CI transformation

  quantiles          array        \[0.25, 0.50, 0.75\]                Survival quantiles to estimate

  timepoints         array        \[6, 12, 24\]                       Landmark timepoints for survival rates
  ------------------ ------------ ----------------------------------- ----------------------------------------

**Method: log_rank_test**

Compares survival distributions between groups.

  ------------------ ------------ ------------------ -------------------------------------------
  **Parameter**      **Type**     **Values**         **Description**

  rho                numeric      0 (default)        Weight parameter (0=log-rank, 1=Wilcoxon)

  strata             role         (TE reference)     Optional stratification variable
  ------------------ ------------ ------------------ -------------------------------------------

**Method: cox_proportional_hazards**

Semi-parametric regression for time-to-event data.

  ------------------ --------------------------------------------------------------------------------
  **W-R Notation**   Surv(time, event) \~ group + covariate

  **Mathematical**   h(t\|X) = h₀(t) × exp(β₁X₁ + β₂X₂ + \...)

  **Assumptions**    Proportional hazards, non-informative censoring, linearity on log-hazard scale
  ------------------ --------------------------------------------------------------------------------

  ------------------ ------------ --------------------------- -----------------------------------------------
  **Parameter**      **Type**     **Values**                  **Description**

  ties               enum         efron \| breslow \| exact   Tie-handling method

  strata             role         (TE reference)              Stratification variable (sep baseline hazard)

  robust_se          boolean      false (default)             Use robust (sandwich) standard errors
  ------------------ ------------ --------------------------- -----------------------------------------------

  ---------------------- ----------------------------------------------------
  **Output**             **Description**

  hazard_ratio           exp(β) for each covariate

  confidence_interval    CI for hazard ratio

  p_value                P-value for each coefficient (Wald test)

  global_test            Overall model test (likelihood ratio, Wald, score)

  concordance            C-statistic (model discrimination)
  ---------------------- ----------------------------------------------------

### 2.3.4 Non-Parametric Methods

**Method: wilcoxon_rank_sum (Mann-Whitney U)**

Non-parametric comparison of two independent groups.

  ----------------------- ------------ ------------------------------ ------------------------------------
  **Parameter**           **Type**     **Values**                     **Description**

  alternative             enum         two_sided \| greater \| less   Direction of alternative

  exact                   boolean      auto \| true \| false          Use exact vs. normal approximation

  continuity_correction   boolean      true (default)                 Apply continuity correction
  ----------------------- ------------ ------------------------------ ------------------------------------

**Method: wilcoxon_signed_rank**

Non-parametric comparison of paired observations.

**Method: kruskal_wallis**

Non-parametric comparison across multiple groups (non-parametric ANOVA).

# 3. Templates

A Template binds Semantic Transformation Concepts to Method roles for a specific clinical purpose. Templates capture the \'why\' - the clinical intent - while Methods capture the \'how\'.

## 3.1 Template Properties

  ------------------ ------------------------------------------------------------------
  **Property**       **Description**

  name               Unique identifier (e.g., \'ChangeFromBaseline\', \'CFB_ANCOVA\')

  type               Either \'derivation\' or \'analysis\'

  clinical_intent    Description of the clinical question this template answers

  uses_method        Reference to the Method this template uses

  parameters         Fixed values for method parameters

  role_bindings      Mapping of method roles to Semantic Transformation Concepts
  ------------------ ------------------------------------------------------------------

**Role Binding Properties:**

  --------------------------------- ----------------------------------------------------------
  **Property**                      **Description**

  semantic_transformation_concept   Name of the STC bound to this role (from CTM)

  method_role                       The role name from the Method

  direction                         Whether this is an input or output

  cube_role                         Role in data cube context: measure, dimension, or filter
  --------------------------------- ----------------------------------------------------------

## 3.2 Derivation Template Catalogue

*Derivation Templates produce derived data for analysis.*

**Template: ChangeFromBaseline**

Clinical Intent: Calculate the absolute change from baseline.

  -------------------- ----------------------------------------------------
  **Method**           Subtraction

  **DEL Expression**   difference := minuend - subtrahend

  **Parameters**       (none)
  -------------------- ----------------------------------------------------

  ------------------------------------- ----------------- --------------- --------------- ---------------
  **Semantic Transformation Concept**   **Method Role**   **Direction**   **Cube Role**   **Data Type**

  analysis_value                        minuend           input           measure         numeric

  baseline_value                        subtrahend        input           measure         numeric

  change_value                          difference        output          measure         numeric
  ------------------------------------- ----------------- --------------- --------------- ---------------

**Template: PercentChangeFromBaseline**

Clinical Intent: Calculate proportional change from baseline.

  -------------------- ----------------------------------------------------------
  **Method**           PercentChange

  **DEL Expression**   result := 100 \* (numerator - denominator) / denominator

  **Parameters**       (none)
  -------------------- ----------------------------------------------------------

  ------------------------------------- ----------------- --------------- --------------- ---------------
  **Semantic Transformation Concept**   **Method Role**   **Direction**   **Cube Role**   **Data Type**

  analysis_value                        numerator         input           measure         numeric

  baseline_value                        denominator       input           measure         numeric

  percent_change                        result            output          measure         numeric
  ------------------------------------- ----------------- --------------- --------------- ---------------

## 3.3 Analysis Template Catalogue

*Analysis Templates produce statistical outputs for reporting.*

**Template: CFB_ANCOVA**

Clinical Intent: Compare treatment effect on change from baseline, adjusting for baseline value.

  ------------------ ----------------------------------------------------
  **Method**         ancova

  **W-R Notation**   response \~ covariate + group

  **Parameters**     ss_type=III, alpha=0.05
  ------------------ ----------------------------------------------------

  ------------------------------------- ----------------- --------------- --------------- ---------------
  **Semantic Transformation Concept**   **Method Role**   **Direction**   **Cube Role**   **Data Type**

  change_value                          response          input           measure         numeric

  baseline_value                        covariate         input           measure         numeric

  treatment_planned                     group             input           dimension       string

  population_flag                       filter            input           filter          boolean
  ------------------------------------- ----------------- --------------- --------------- ---------------

**Template: TTE_CoxPH**

Clinical Intent: Compare time-to-event between treatment groups with covariate adjustment.

  ------------------ ----------------------------------------------------
  **Method**         cox_proportional_hazards

  **W-R Notation**   Surv(time, event) \~ group

  **Parameters**     ties=efron, alpha=0.05
  ------------------ ----------------------------------------------------

  ------------------------------------- ----------------- --------------- --------------- ---------------
  **Semantic Transformation Concept**   **Method Role**   **Direction**   **Cube Role**   **Data Type**

  time_to_event                         time              input           measure         numeric

  censor_indicator                      event             input           measure         integer

  treatment_planned                     group             input           dimension       string

  population_flag                       filter            input           filter          boolean
  ------------------------------------- ----------------- --------------- --------------- ---------------

# 4. Data Cube Role Assignments

AC/DC uses a multi-dimensional data model to structure analysis specifications. The role definitions---measure, dimension, attribute, and slice---are inspired by the W3C Data Cube Vocabulary and SDMX (ISO 17369) concepts, adapted for clinical trial analysis.

## 4.1 Cube Role Definitions

The following roles define how Transformation Elements participate in analysis specifications:

  --------------- -------------------------------------------- --------------------------------
  **Cube Role**   **Definition**                               **Statistical Purpose**

  Measure         The observed/computed value being analyzed   Response/dependent variable

  Dimension       Variables that slice or stratify the data    Grouping/independent variables

  Attribute       Metadata qualifying the observation          Covariates, qualifiers
  --------------- -------------------------------------------- --------------------------------

Additionally, a Filter role specifies subset criteria. While related to the SDMX slice concept (which fixes dimension values), filter operates at the data level as a boolean condition:

  --------------- ----------------------------------------------------------------------------------------------------------------------------------------
  **Role**        **Definition**

  Filter          Boolean condition restricting which observations are included (e.g., population_flag = TRUE). Applied before aggregation/analysis.

  Slice           SDMX concept that fixes one or more dimensions to specific values (e.g., visit = \'Week 24\'). Defines a subset of the cube structure.
  --------------- ----------------------------------------------------------------------------------------------------------------------------------------

In practice, filter is used for population and record selection criteria (WHERE clauses), while slice is used to define specific cross-sections of results for reporting.

## 4.2 Role Binding in Templates

When a Template binds a Semantic Transformation Concept to a Method role, it also assigns a cube_role. This dual binding captures both the operational role (in the method formula) and the structural role (in the output data cube).

**Derivation Template Example: ChangeFromBaseline**

  ------------------ ------------------ --------------- -------------------
  **TE**             **Method Role**    **Direction**   **Cube Role**

  analysis_value     minuend            input           measure

  baseline_value     subtrahend         input           attribute

  subject            scope              input           dimension

  visit              scope              input           dimension

  parameter          scope              input           dimension

  change_value       difference         output          measure
  ------------------ ------------------ --------------- -------------------

**Analysis Template Example: CFB_ANCOVA**

  ------------------- ------------------ --------------- -------------------
  **TE**              **Method Role**    **Direction**   **Cube Role**

  change_value        response           input           measure

  baseline_value      covariate          input           attribute

  treatment_planned   group              input           dimension

  population_flag     filter             input           filter

  ls_mean             estimate           output          measure

  p_value             significance       output          measure
  ------------------- ------------------ --------------- -------------------

## 4.3 Why Data Cube over Pseudo-code

Traditional analysis specifications often use pseudo-code descriptions that require human interpretation. The data cube approach offers significant advantages:

  ------------------ ----------------------------- --------------------------------
  **Aspect**         **Pseudo-code Approach**      **Data Cube Approach**

  Interpretation     Requires human reading        Machine-parseable structure

  Ambiguity          Natural language variations   Precise role definitions

  Code generation    Manual programming            Automated translation

  Validation         Review-based                  Structural validation possible

  Reusability        Copy and modify text          Parameterized templates
  ------------------ ----------------------------- --------------------------------

## 4.4 Cube Structure and Output

The cube role assignments determine the structure of the analysis output. For an ANCOVA analysis:

-   Dimensions define the axes: one cell per unique combination of dimension values (e.g., treatment × visit × parameter)

-   Measures populate the cells: each cell contains the computed measures (ls_mean, p_value, etc.)

-   Attributes qualify the measures: confidence level, degrees of freedom, etc.

-   Filters determine which observations contribute: only records where filter conditions are true

This structure maps directly to Analysis Results Datasets (ARDs) and supports automated table generation.

**Note:** AC/DC does not implement full SDMX data structures or W3C RDF vocabularies. We adopt these concepts to provide a consistent vocabulary for specifying the role of Transformation Elements in analyses. See: W3C Data Cube Vocabulary (https://www.w3.org/TR/vocab-data-cube/) and SDMX (https://sdmx.org/).

# 5. Derivation Expression Language (DEL)

DEL is the formal language for specifying derivations and model specifications. It supports two expression types: arithmetic expressions for derivation methods, and Wilkinson-Rogers notation for analysis methods.

## 5.1 Arithmetic Expressions

Arithmetic expressions define computational derivations using standard operators and functions.

**Operators:**

  ------------------------- --------------- ---------------------------------------------
  **Operator**              **Name**        **Example**

  :=                        Assignment      result := expression

  +, -, \*, /               Arithmetic      difference := minuend - subtrahend

  =, !=, \<, \>, \<=, \>=   Comparison      flag := value \>= threshold

  AND, OR, NOT              Logical         combined := flag1 AND flag2
  ------------------------- --------------- ---------------------------------------------

**Functions:**

  ------------------------------ ----------------------------------------------------
  **Function**                   **Description**

  IF(cond, true, false)          Conditional expression

  COALESCE(a, b, \...)           First non-null value

  DATEDIFF(from, to, unit)       Date difference in specified units

  MIN, MAX, SUM, AVG             Aggregate functions (with OVER clause)

  FIRST, LAST, LAG, LEAD         Window functions (with OVER clause)

  CASE WHEN \... THEN \... END   Multi-way conditional
  ------------------------------ ----------------------------------------------------

*Note: DEL arithmetic operators and functions are based on VTL 2.1 (Validation and Transformation Language), the expression language standardized by SDMX for statistical data transformations. See: https://sdmx.org/wp-content/uploads/VTL-2.1-User-Manual-20230808.pdf*

## 5.2 Wilkinson-Rogers Notation

Wilkinson-Rogers notation specifies statistical models in a compact, symbolic form. This notation can be translated to multiple implementation languages and to mathematical expressions.

**Basic Syntax:**

  --------------- ------------------------------ -----------------------------
  **Symbol**      **Meaning**                    **Example**

  \~              Response is modeled by         Y \~ X

  \+              Include term (main effect)     Y \~ A + B

  :               Interaction only               Y \~ A:B

  \*              Main effects + interaction     Y \~ A \* B (= A + B + A:B)

  \|              Nested / conditional           Y \~ A \| B (A nested in B)

  \- 1            Remove intercept               Y \~ X - 1

  (1 \| group)    Random intercept               Y \~ X + (1 \| subject)
  --------------- ------------------------------ -----------------------------

**Survival Extension:**

> Surv(time, event) \~ TRT + COVAR1 + strata(SITE)

The Surv() function wraps time and event indicator for time-to-event models. The strata() function specifies stratification variables.

## 5.3 Translation to Implementations

Templates bind TEs to method roles, and implementation bindings map TEs to physical variables. This enables automatic code generation:

**Example: ANCOVA for Change from Baseline**

*Method (roles): response \~ covariate + group*

*Template binding: response ← change_value, covariate ← baseline_value, group ← treatment_planned*

*Implementation (ADaM): CHG → change_value, BASE → baseline_value, TRT01P → treatment_planned*

  -------------- ------------------------------------------------------------
  **Language**   **Generated Code**

  R              lm(CHG \~ BASE + TRT01P, data = adlb)

  SAS            PROC GLM; CLASS TRT01P; MODEL CHG = BASE TRT01P / SS3;

  Python         smf.ols(\'CHG \~ BASE + C(TRT01P)\', data=adlb).fit()
  -------------- ------------------------------------------------------------

**Example: MMRM**

*Method (roles): response \~ covariate + time + group + time:group*

*Template binding: response ← change_value, covariate ← baseline_value, time ← visit, group ← treatment_planned*

*Implementation (ADaM): CHG → change_value, BASE → baseline_value, AVISIT → visit, TRT01P → treatment_planned*

  -------------- ------------------------------------------------------------------------------------------------------------------------------------
  **Language**   **Generated Code**

  R              mmrm(CHG \~ BASE + AVISIT + TRT01P + AVISIT:TRT01P + us(AVISIT \| USUBJID))

  SAS            PROC MIXED; CLASS TRT01P AVISIT USUBJID; MODEL CHG = BASE TRT01P AVISIT TRT01P\*AVISIT; REPEATED AVISIT / SUBJECT=USUBJID TYPE=UN;
  -------------- ------------------------------------------------------------------------------------------------------------------------------------

**Example: Cox Proportional Hazards**

*Method (roles): Surv(time, event) \~ group + strata*

*Template binding: time ← time_to_event, event ← censor_indicator, group ← treatment_planned, strata ← site*

*Implementation (ADaM): AVAL → time_to_event, CNSR → censor_indicator, TRT01P → treatment_planned, SITEID → site*

  -------------- ------------------------------------------------------------------------
  **Language**   **Generated Code**

  R              coxph(Surv(AVAL, CNSR) \~ TRT01P + strata(SITEID), data = adtte)

  SAS            PROC PHREG; CLASS TRT01P; MODEL AVAL\*CNSR(1) = TRT01P; STRATA SITEID;
  -------------- ------------------------------------------------------------------------

## 5.4 DEL Formal Grammar (BNF)

The formal grammar for DEL arithmetic expressions is defined using BNF (Backus-Naur Form), a standard notation for describing context-free grammars. This formal specification enables unambiguous parsing and translation to target languages.

**Simplified BNF Grammar:**

> \<derivation\> ::= \<output_te\> ':=' \<expression\>
>
> \<expression\> ::= \<term\> \| \<expression\> \<arith_op\> \<term\>
>
> \<term\> ::= \<factor\> \| \<term\> \<comp_op\> \<factor\>
>
> \<factor\> ::= \<te_ref\> \| \<literal\> \| \<function_call\> \| '(' \<expression\> ')'
>
> \<te_ref\> ::= \<identifier\> /\* Semantic Transformation Concept name \*/
>
> \<function_call\> ::= \<func_name\> '(' \<arg_list\> ')' \[\<over_clause\>\] \[\<where_clause\>\]
>
> \<over_clause\> ::= 'OVER' \<te_ref\> {',' \<te_ref\>}
>
> \<where_clause\> ::= 'WHERE' \<condition\>
>
> \<conditional\> ::= 'IF' \<condition\> 'THEN' \<expression\> 'ELSE' \<expression\>
>
> \<arith_op\> ::= '+' \| '-' \| '\*' \| '/' \| '\^'
>
> \<comp_op\> ::= '\<' \| '\>' \| '\<=' \| '\>=' \| '=' \| '!='
>
> \<logic_op\> ::= 'AND' \| 'OR' \| 'NOT'

**BNF Notation Key:**

  -------------- ---------------------------------------------------------
  **Symbol**     **Meaning**

  ::=            "is defined as"

  \|             Alternative ("or")

  \<name\>       Non-terminal symbol (rule name to be expanded)

  'text'         Terminal symbol (literal text)

  \[\...\]       Optional (zero or one occurrence)

  {\...}         Repetition (zero or more occurrences)

  /\* \... \*/   Comment (explanatory note)
  -------------- ---------------------------------------------------------

# 6. Smart Phrases and eSAP Generation

## 6.1 Introduction

Smart Phrases are the user-facing entry point to the AC/DC Framework. They serve a dual purpose: composing human-readable eSAP (electronic Statistical Analysis Plan) text AND capturing machine-executable specifications. Through intelligent linking to the AC/DC Framework, Smart Phrases enable automatic generation of both documentation and formal specifications.

**Core principle: Selecting a phrase = Selecting an STC**

Each Smart Phrase is bound to one or more Semantic Transformation Concepts (STCs). When a user selects a phrase like "change from baseline in {parameter}", they are implicitly selecting the change_value STC and a parameter slot to fill. This binding enables the system to generate both natural language text and formal specifications from the same user selections.

**Note on terminology:** The term "Smart Phrase" draws on established healthcare terminology. Epic Systems, the leading Electronic Health Record (EHR) vendor, uses "SmartPhrase" for templated text that auto-populates with patient data. AC/DC Smart Phrases extend this concept: they are not just text templates, but carry formal bindings to Semantic Transformation Concepts, enabling automatic generation of both documentation and executable specifications.

## 6.2 Smart Phrase Structure

A Smart Phrase consists of the following properties:

  -----------------------------------------------------------------------------------------------
  **Property**      **Description**                       **Example**
  ----------------- ------------------------------------- ---------------------------------------
  id                Unique identifier                     SP_CFB_ENDPOINT

  role              Phrase category (see Section 6.3)     endpoint

  phrase_template   Parameterized natural language text   "change from baseline in {parameter}"

  parameters        Slots to fill at study time           \[parameter\]

  references        Bound STCs (the 'smart' link)         \[change_value, parameter\]
  -----------------------------------------------------------------------------------------------

## 6.3 Smart Phrase Roles

Smart Phrases are organized by role, which determines their function in the analysis specification and maps to cube roles:

  -----------------------------------------------------------------------------------------------------------------
  **Role**     **What it captures**             **Maps to Cube**      **Typical STCs**
  ------------ -------------------------------- --------------------- ---------------------------------------------
  endpoint     What's being measured/analyzed   measure (response)    change_value, percent_change, time_to_event

  covariate    Adjustment factors               measure (covariate)   baseline_value

  grouping     Treatment groups                 dimension (group)     treatment_planned

  population   Who's included                   dimension (slice)     population_flag

  timepoint    When                             dimension (slice)     visit

  parameter    Which measurement                dimension (slice)     parameter

  method       How it's analyzed                ---                   References Method directly
  -----------------------------------------------------------------------------------------------------------------

## 6.4 Multiple Phrases per Role

Different phrases with the same role reference different STCs. This is the key to how phrase selection drives specification:

**Endpoint phrases:**

  -----------------------------------------------------------------------
  **Phrase Template**                                **References STC**
  -------------------------------------------------- --------------------
  "change from baseline in {parameter}"              change_value

  "percent change from baseline in {parameter}"      percent_change

  "time to {event}"                                  time_to_event

  "{parameter} value"                                analysis_value
  -----------------------------------------------------------------------

**Method phrases:**

  ------------------------------------------------------------------------------
  **Phrase Template**                                 **References Method**
  --------------------------------------------------- --------------------------
  "will be analyzed using ANCOVA"                     ancova

  "will be summarized using descriptive statistics"   descriptive_stats

  "will be compared using Cox proportional hazards"   cox_proportional_hazards
  ------------------------------------------------------------------------------

## 6.5 Analysis Concept Requirements

Analysis Concepts declare which Smart Phrase roles they require. This enables the system to validate user selections and identify matching Analysis Concepts:

**Analysis Concept: CFB_ANCOVA**\
required_roles:\
- endpoint (must reference: change_value)\
- covariate (must reference: baseline_value)\
- grouping (must reference: treatment_planned)\
- population (slice)\
- timepoint (slice)\
- parameter (slice)\
- method (must be: ancova)

## 6.6 Study Workflow

The following workflow shows how a user composes an analysis specification using Smart Phrases:

  -------------------------------------------------------------------------------------------
  **Step**   **User Action**                                   **System Captures**
  ---------- ------------------------------------------------- ------------------------------
  1          Select "change from baseline in {parameter}"      endpoint → change_value

  2          Select "will be analyzed using ANCOVA"            method → ancova

  3          Select "with baseline as covariate"               covariate → baseline_value

  4          Select "and treatment as classification factor"   grouping → treatment_planned

  5          Fill in "ADAS-Cog(11)"                            parameter slice = ACTOT11

  6          Fill in "Week 24"                                 visit slice = Week 24

  7          Fill in "ITT population"                          population_flag slice = true

  ---        System validates selections                       Matches to CFB_ANCOVA

  ---        System generates outputs                          Cube + eSAP text + code
  -------------------------------------------------------------------------------------------

## 6.7 Generated Outputs

From the same Smart Phrase selections, the system generates multiple outputs:

**eSAP Text:**

*"Change from baseline in ADAS-Cog(11) at Week 24 will be analyzed using ANCOVA with baseline as covariate and treatment as classification factor for the ITT population."*

**Cube Definition:**

dimensions: \[subject, treatment_planned, parameter, visit, population_flag\]\
measures: \[change_value, baseline_value, ls_mean, p_value\]\
slices:\
parameter: "ACTOT11"\
visit: "Week 24"\
population_flag: true

**Implementation (SAS):**

proc mixed data=adam.adqs;\
where PARAMCD="ACTOT11" and AVISIT="Week 24" and ITTFL="Y";\
class TRT01P;\
model CHG = BASE TRT01P;\
lsmeans TRT01P / diff cl;\
run;

## 6.8 Traceability

Every element in the generated outputs traces back to Smart Phrase selections, enabling full traceability from eSAP text to executable code:

  -----------------------------------------------------------------------------------------------------
  **eSAP Word**            **Smart Phrase**   **STC**               **Cube Role**   **Code Variable**
  ------------------------ ------------------ --------------------- --------------- -------------------
  "Change from baseline"   endpoint           change_value          measure         CHG

  "ADAS-Cog(11)"           parameter value    parameter (ACTOT11)   slice           PARAMCD

  "ANCOVA"                 method             ancova                ---             proc mixed

  "baseline"               covariate          baseline_value        measure         BASE

  "ITT population"         population value   population_flag       slice           ITTFL
  -----------------------------------------------------------------------------------------------------

## 6.9 Diagram References

-   *analysis_concept_cube.drawio* --- Library and Study Smart Phrase structures

-   *workflow-diagram.drawio* --- End-to-end workflow from Smart Phrases to implementation

# 7. Summary

## 7.1 Document Components

  ---------------------- -----------------------------------------------------------------------------
  **Component**          **Purpose**

  Derivation Methods     Computational operations (Subtraction, Division, Aggregation, etc.)

  Analysis Methods       Statistical procedures (t-test, ANOVA, ANCOVA, MMRM, Cox, etc.)

  Derivation Templates   Clinical patterns that produce derived TEs

  Analysis Templates     Clinical patterns that produce statistical outputs

  Data Cube              Structural framework for cube roles (measure, dimension, attribute, filter)

  DEL Arithmetic         Expression language for derivation formulas

  DEL Wilkinson-Rogers   Notation for statistical model specification
  ---------------------- -----------------------------------------------------------------------------

## 7.2 Key Principles

-   Unified pattern: Both derivation and analysis follow Method → Template → Implementation

-   Standard-independent: Methods use roles, not physical variables

-   Machine-executable: DEL, W-R notation, and Data Cube roles translate to multiple languages

-   CTM integration: Templates bind Semantic Transformation Concepts from the Clinical Semantic Transformation Model

-   Data Cube Roles: W3C/SDMX-inspired role assignments (measure/dimension/attribute/slice) enable structured output

-   CDISC-maintained: Methods and Templates are part of the AC/DC standard library

-   Extensible: Organizations can create custom templates while maintaining compatibility

```{=html}
<!-- -->
```
-   Smart Phrases: Selecting a phrase = Selecting an STC; enables dual output of eSAP text and executable code
