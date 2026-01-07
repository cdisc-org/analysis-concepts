# execute_analysis.R
# Metadata-driven ANCOVA analysis execution
# Reads metadata from CSV files and executes ANCOVA dynamically
#
# This follows the same pattern as execute_derivation.R but for
# Analysis Concepts (AC) rather than Derivation Concepts (DC).
#
# Key differences from derivation:
# - Derivation: Subject-level transformation (CHG = AVAL - BASE)
# - Analysis: Aggregated results (LS Means, pairwise comparisons)

library(dplyr)
library(emmeans)

# Set working directory to script location (if running interactively)
# setwd(dirname(rstudioapi::getActiveDocumentContext()$path))

# ============================================================================
# 1. Load Metadata
# ============================================================================

load_analysis_metadata <- function(metadata_path = ".") {
  list(
    analysis_instance = read.csv(file.path(metadata_path, "analysis_instance_metadata.csv"),
                                  stringsAsFactors = FALSE, row.names = NULL),
    adam_class_mapping = read.csv(file.path(metadata_path, "adam_class_variable_mapping_ac.csv"),
                                   stringsAsFactors = FALSE, row.names = NULL),
    analysis_dataset = read.csv(file.path(metadata_path, "analysis_adam_dataset.csv"),
                                 stringsAsFactors = FALSE, row.names = NULL),
    data_concept_mapping = read.csv(file.path(metadata_path, "data_concept_adam_standard.csv"),
                                     stringsAsFactors = FALSE, row.names = NULL)
  )
}

# ============================================================================
# 2. Parse Analysis Formula from Metadata
# ============================================================================

get_analysis_info <- function(metadata) {
  # Get the method row which contains the formula
  method_row <- metadata$analysis_instance %>%
    filter(entity_type == "Method")

  # The formula is in the 'formula' column using data concept names
  # e.g., "change_value ~ baseline_value + site + treatment"
  concept_formula_str <- method_row$formula[1]

  # Get the analysis name and ID
  analysis_row <- metadata$analysis_instance %>%
    filter(entity_type == "Analysis")

  list(
    analysis_id = analysis_row$entity_id[1],
    analysis_name = analysis_row$name[1],
    analysis_description = analysis_row$label[1],
    method_name = method_row$name[1],
    method_label = method_row$label[1],
    concept_formula_string = concept_formula_str
  )
}

# ============================================================================
# 3. Convert Data Concept Formula to ADaM Formula
# ============================================================================

convert_formula_to_adam <- function(concept_formula_str, metadata) {
  # Get data concept to ADaM mapping
  mapping <- metadata$data_concept_mapping

  # Replace data concept names with ADaM variable names in formula
  adam_formula_str <- concept_formula_str
  for (i in seq_len(nrow(mapping))) {
    concept <- mapping$data_concept[i]
    adam_var <- mapping$ADaM_standard_var[i]
    # Use word boundaries to avoid partial replacements
    adam_formula_str <- gsub(paste0("\\b", concept, "\\b"), adam_var, adam_formula_str)
  }

  list(
    concept_formula = concept_formula_str,
    adam_formula = adam_formula_str,
    formula = as.formula(adam_formula_str)
  )
}

# ============================================================================
# 4. Get Slice Filters from Metadata
# ============================================================================

get_slice_filters <- function(metadata) {
  # Get attributes with 'fix' relationship (these are the slice constraints)
  # Join with data_concept_mapping to get ADaM_standard_var
  filters <- metadata$analysis_instance %>%
    filter(entity_type == "Attribute", relationship == "fix") %>%
    select(data_concept, value) %>%
    left_join(metadata$data_concept_mapping, by = "data_concept") %>%
    select(ADaM_standard_var, value)

  # Convert to named list for filtering
  filter_list <- setNames(as.list(filters$value), filters$ADaM_standard_var)
  filter_list
}

# ============================================================================
# 5. Get Model Variables from Metadata
# ============================================================================

get_model_variables <- function(metadata) {
  # Get dimensions and measures with their roles
  # Join with data_concept_mapping to get ADaM_standard_var
  vars <- metadata$analysis_instance %>%
    filter(entity_type %in% c("Dimension", "Measure"),
           !is.na(data_concept) & data_concept != "") %>%
    select(name, role, data_concept) %>%
    left_join(metadata$data_concept_mapping, by = "data_concept") %>%
    select(name, role, ADaM_standard_var)

  # Identify dependent variable, covariates, and factors
  list(
    dependent = vars %>% filter(role == "dependent") %>% pull(ADaM_standard_var),
    covariates = vars %>% filter(role == "covariate") %>% pull(ADaM_standard_var),
    factors = vars %>% filter(role == "factor") %>% pull(ADaM_standard_var),
    identifier = vars %>% filter(role == "identifier") %>% pull(ADaM_standard_var)
  )
}

# ============================================================================
# 6. Get Output Cube Definitions
# ============================================================================

get_output_cubes <- function(metadata) {
  # Get output cubes from method
  outputs <- metadata$analysis_instance %>%
    filter(entity_type == "Cube", relationship == "output") %>%
    select(entity_id, name, label)

  outputs
}

# ============================================================================
# 7. Execute ANCOVA Analysis
# ============================================================================

execute_ancova <- function(input_data, metadata) {

  # Get analysis info
  analysis_info <- get_analysis_info(metadata)
  cat("Analysis ID:", analysis_info$analysis_id, "\n")
  cat("Analysis Name:", analysis_info$analysis_name, "\n")
  cat("Method:", analysis_info$method_name, "\n")
  cat("Method Label:", analysis_info$method_label, "\n")
  cat("Formula (concepts):", analysis_info$concept_formula_string, "\n")

  # Convert concept formula to ADaM formula
  formula_info <- convert_formula_to_adam(analysis_info$concept_formula_string, metadata)
  cat("Formula (ADaM):", formula_info$adam_formula, "\n\n")

  # Get model variables
  model_vars <- get_model_variables(metadata)
  cat("Dependent variable:", model_vars$dependent, "\n")
  cat("Covariates:", paste(model_vars$covariates, collapse = ", "), "\n")
  cat("Factors:", paste(model_vars$factors, collapse = ", "), "\n\n")

  # Get slice filters
  filters <- get_slice_filters(metadata)
  cat("Applying slice filters:\n")
  for (name in names(filters)) {
    cat("  ", name, "=", filters[[name]], "\n")
  }
  cat("\n")

  # Apply slice filters to data
  filtered_data <- input_data
  for (filter_var in names(filters)) {
    filter_value <- filters[[filter_var]]
    filtered_data <- filtered_data %>%
      filter(.data[[filter_var]] == filter_value)
  }

  cat("Records after filtering:", nrow(filtered_data), "of", nrow(input_data), "\n\n")

  # Check for missing values in model variables
  all_model_vars <- c(model_vars$dependent, model_vars$covariates, model_vars$factors)
  complete_cases <- complete.cases(filtered_data[, all_model_vars])
  analysis_data <- filtered_data[complete_cases, ]
  cat("Complete cases for analysis:", nrow(analysis_data), "\n\n")

  if (nrow(analysis_data) == 0) {
    stop("No complete cases available for analysis after filtering")
  }

  # Convert factors to factor type
  for (factor_var in model_vars$factors) {
    analysis_data[[factor_var]] <- as.factor(analysis_data[[factor_var]])
  }

  # Fit ANCOVA model using ADaM formula
  cat("Fitting ANCOVA model...\n")
  model <- lm(formula_info$formula, data = analysis_data)

  cat("\nModel Summary:\n")
  print(summary(model))

  # Get the treatment variable (first factor in the model)
  treatment_var <- model_vars$factors[1]  # TRTP

  # Calculate LS Means using emmeans
  cat("\nCalculating LS Means for", treatment_var, "...\n")
  emm <- emmeans(model, specs = treatment_var)
  emm_summary <- as.data.frame(summary(emm))

  # Find confidence interval column names (varies by emmeans version)
  emm_cols <- names(emm_summary)
  ci_lower_col <- emm_cols[grep("lower|LCL", emm_cols, ignore.case = TRUE)][1]
  ci_upper_col <- emm_cols[grep("upper|UCL", emm_cols, ignore.case = TRUE)][1]

  # Rename columns to match output cube structure
  treatment_results <- emm_summary
  names(treatment_results)[names(treatment_results) == treatment_var] <- "treatment"
  names(treatment_results)[names(treatment_results) == "emmean"] <- "lsmean"
  names(treatment_results)[names(treatment_results) == "SE"] <- "lsmean_se"
  names(treatment_results)[names(treatment_results) == ci_lower_col] <- "ci_lower"
  names(treatment_results)[names(treatment_results) == ci_upper_col] <- "ci_upper"

  treatment_results <- treatment_results %>%
    select(treatment, lsmean, lsmean_se, ci_lower, ci_upper)

  # Add context from slice
  treatment_results$parameter <- filters$PARAM

  treatment_results$timepoint <- filters$AVISIT
  treatment_results$population_flag <- filters$EFFFL

  cat("\nTreatment Results (LS Means):\n")
  print(treatment_results)

  # Calculate pairwise comparisons
  cat("\nCalculating pairwise comparisons...\n")
  pairs_result <- pairs(emm)
  pairs_summary <- as.data.frame(summary(pairs_result))

  # Find confidence interval column names (varies by emmeans version)
  pairs_cols <- names(pairs_summary)
  pairs_ci_lower_col <- pairs_cols[grep("lower|LCL", pairs_cols, ignore.case = TRUE)][1]
  pairs_ci_upper_col <- pairs_cols[grep("upper|UCL", pairs_cols, ignore.case = TRUE)][1]

  # Parse contrast names to get treatment and comparison_group
  comparison_results <- pairs_summary
  comparison_results$contrast_parts <- strsplit(as.character(comparison_results$contrast), " - ")
  comparison_results$treatment <- sapply(comparison_results$contrast_parts, `[`, 1)
  comparison_results$comparison_group <- sapply(comparison_results$contrast_parts, `[`, 2)

  # Rename columns
  names(comparison_results)[names(comparison_results) == "estimate"] <- "lsmean_diff"
  names(comparison_results)[names(comparison_results) == "p.value"] <- "p_value"
  if (!is.na(pairs_ci_lower_col)) {
    names(comparison_results)[names(comparison_results) == pairs_ci_lower_col] <- "ci_lower"
  }
  if (!is.na(pairs_ci_upper_col)) {
    names(comparison_results)[names(comparison_results) == pairs_ci_upper_col] <- "ci_upper"
  }

  # Select columns (handle case where CI columns may not exist)
  select_cols <- c("treatment", "comparison_group", "lsmean_diff", "p_value")
  if ("ci_lower" %in% names(comparison_results)) select_cols <- c(select_cols, "ci_lower")
  if ("ci_upper" %in% names(comparison_results)) select_cols <- c(select_cols, "ci_upper")
  comparison_results <- comparison_results[, select_cols]

  # Add context from slice
  comparison_results$parameter <- filters$PARAM
  comparison_results$timepoint <- filters$AVISIT
  comparison_results$population_flag <- filters$EFFFL

  cat("\nComparison Results (Pairwise Differences):\n")
  print(comparison_results)

  # Return results
  list(
    analysis_info = analysis_info,
    formula_info = formula_info,
    model = model,
    treatment_results = treatment_results,
    comparison_results = comparison_results,
    n_subjects = nrow(analysis_data),
    filters_applied = filters
  )
}

# ============================================================================
# 8. Main Execution
# ============================================================================

run_analysis <- function(adam_data, metadata_path = ".", output_path = ".") {

  cat("=== Metadata-Driven ANCOVA Analysis Execution ===\n\n")

  # Load metadata
  metadata <- load_analysis_metadata(metadata_path)

  # Get dataset name from metadata
  dataset_info <- metadata$analysis_dataset
  cat("Analysis ID:", dataset_info$analysis_id[1], "\n")
  cat("Source Dataset:", dataset_info$adam_dataset[1], "\n\n")

  # Execute analysis
  results <- execute_ancova(adam_data, metadata)

  # Save output cubes to CSV
  treatment_output_file <- file.path(output_path, "treatment_results.csv")
  comparison_output_file <- file.path(output_path, "comparison_results.csv")

  write.csv(results$treatment_results, treatment_output_file, row.names = FALSE)
  write.csv(results$comparison_results, comparison_output_file, row.names = FALSE)

  cat("\n=== Analysis Complete ===\n")
  cat("Treatment results saved to:", treatment_output_file, "\n")
  cat("Comparison results saved to:", comparison_output_file, "\n")
  cat("Number of subjects analyzed:", results$n_subjects, "\n")

  # Return results for programmatic use
  invisible(results)
}

# ============================================================================
# Example Usage
# ============================================================================

# # Load your ADQSADAS dataset with ANCOVA-required columns
# # Required columns: USUBJID, PARAM, AVISIT, CHG, BASE, TRTP, SITEID, EFFFL
# adqsadas_ac <- read.csv("adqsadas_ac.csv")
#
# # Run the analysis
# results <- run_analysis(adqsadas_ac, metadata_path = ".", output_path = ".")
#
# # Access results programmatically
# print(results$treatment_results)
# print(results$comparison_results)
# summary(results$model)

# ============================================================================
# Sample Data for Testing (uncomment to test without real data)
# ============================================================================

# Create sample data for testing
create_sample_data <- function(n_per_group = 30) {
  set.seed(42)

  treatments <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
  sites <- c("Site01", "Site02", "Site03", "Site04", "Site05")

  data <- expand.grid(
    TRTP = treatments,
    SITEID = sample(sites, n_per_group * length(treatments), replace = TRUE)
  )

  # Generate subject IDs
  data$USUBJID <- paste0("SUBJ", sprintf("%03d", 1:nrow(data)))

  # Generate baseline values (higher is worse for ADAS-Cog)
  data$BASE <- rnorm(nrow(data), mean = 25, sd = 8)

  # Generate change from baseline with treatment effect
  treatment_effects <- c(Placebo = 2, `Xanomeline Low Dose` = -1, `Xanomeline High Dose` = -3)
  data$CHG <- rnorm(nrow(data), mean = 0, sd = 5) +
    treatment_effects[data$TRTP] +
    0.1 * (data$BASE - 25)  # Baseline adjustment

  # Add required columns
  data$PARAM <- "ADAS-Cog (11)"
  data$PARAMCD <- "ACTOT11"
  data$AVISIT <- "Week 24"
  data$AVISITN <- 24
  data$AVAL <- data$BASE + data$CHG
  data$EFFFL <- "Y"
  data$ITTFL <- "Y"

  data
}

# Uncomment to run with sample data:
# adqsadas_ac <- create_sample_data(n_per_group = 30)
# write.csv(adqsadas_ac, "adqsadas_ac.csv", row.names = FALSE)
# results <- run_analysis(adqsadas_ac, metadata_path = ".", output_path = ".")
