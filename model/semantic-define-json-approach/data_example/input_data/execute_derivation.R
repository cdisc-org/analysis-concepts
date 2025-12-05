# execute_derivation.R
# Metadata-driven derivation execution
# Reads metadata from 3 CSV files and executes derivations dynamically

library(dplyr)
library(tidyr)

# Set working directory to script location (if running interactively)
setwd(dirname(rstudioapi::getActiveDocumentContext()$path))

# ============================================================================
# 1. Load Metadata
# ============================================================================

load_metadata <- function(metadata_path = ".") {
  list(
    study_instance = read.csv(file.path(metadata_path, "study_instance_metadata.csv"),
                               stringsAsFactors = FALSE, row.names = NULL),
    adam_class_mapping = read.csv(file.path(metadata_path, "adam_class_variable_mapping.csv"),
                                   stringsAsFactors = FALSE, row.names = NULL),
    derivation_dataset = read.csv(file.path(metadata_path, "derivation_adam_dataset.csv"),
                                   stringsAsFactors = FALSE, row.names = NULL)
  )
}

# ============================================================================
# 2. Parse Derivation Formula from Metadata
# ============================================================================

get_derivation_info <- function(metadata) {
  # Get the method row which contains the formula
  method_row <- metadata$study_instance %>%
    filter(entity_type == "Method")

  # The formula is in the 'label' column (e.g., "change_value = analysis_value - baseline_value")
  formula_str <- method_row$label[1]

  # Parse the formula: split by '='
  parts <- strsplit(formula_str, "=")[[1]]
  output_var <- trimws(parts[1])
  expression <- trimws(parts[2])

  list(
    method_name = method_row$name[1],
    output_variable = output_var,
    expression = expression,
    formula_string = formula_str
  )
}

# ============================================================================
# 3. Get Slice Filters from Metadata
# ============================================================================

get_slice_filters <- function(metadata) {
  # Get attributes with 'fix' relationship (these are the slice constraints)
  # Use adam_class_variable for the actual ADaM variable name to filter on
  filters <- metadata$study_instance %>%
    filter(entity_type == "Attribute", relationship == "fix") %>%
    select(adam_class_variable, value)

  # Convert to named list for filtering
  filter_list <- setNames(as.list(filters$value), filters$adam_class_variable)
  filter_list
}

# ============================================================================
# 4. Get Cube to ADaM Variable Mapping from study_instance_metadata
# ============================================================================

get_cube_adam_mapping <- function(metadata) {
  # Extract mapping from Dimensions and Measures that have adam_class_variable
  mapping <- metadata$study_instance %>%
    filter(entity_type %in% c("Dimension", "Measure", "Attribute"),
           !is.na(adam_class_variable) & adam_class_variable != "") %>%
    select(name, adam_class_variable) %>%
    distinct()

  # Create named vector: cube_name -> adam_variable
  setNames(mapping$adam_class_variable, mapping$name)
}

# ============================================================================
# 5. Build Dynamic Expression with ADaM Variable Names
# ============================================================================

build_adam_expression <- function(derivation_info, metadata) {
  expr <- derivation_info$expression
  output_var <- derivation_info$output_variable

  # Get cube to ADaM mapping
  cube_adam_map <- get_cube_adam_mapping(metadata)

  # Replace cube variable names with ADaM variable names in expression
  adam_expr <- expr
  for (cube_var in names(cube_adam_map)) {
    adam_var <- cube_adam_map[[cube_var]]
    # Use word boundaries to avoid partial replacements
    adam_expr <- gsub(paste0("\\b", cube_var, "\\b"), adam_var, adam_expr)
  }

  # Map output variable
  adam_output <- if (output_var %in% names(cube_adam_map)) {
    cube_adam_map[[output_var]]
  } else {
    output_var
  }

  list(
    cube_expression = expr,
    adam_expression = adam_expr,
    cube_output = output_var,
    adam_output = adam_output
  )
}

# ============================================================================
# 6. Get Dimension Variables (for joining back to full dataset)
# ============================================================================

get_dimension_variables <- function(metadata) {
  # Get ADaM variables that are dimensions (identifiers)
  dims <- metadata$study_instance %>%
    filter(entity_type == "Dimension",
           !is.na(adam_class_variable) & adam_class_variable != "") %>%
    select(adam_class_variable) %>%
    distinct()

  dims$adam_class_variable
}

# ============================================================================
# 7. Execute Derivation
# ============================================================================

execute_derivation <- function(input_data, metadata, derivation_id = NULL) {

  # Get derivation info
  derivation_info <- get_derivation_info(metadata)
  cat("Method:", derivation_info$method_name, "\n")
  cat("Formula (cube):", derivation_info$formula_string, "\n")

  # Build ADaM expression
  adam_expr <- build_adam_expression(derivation_info, metadata)
  cat("Formula (ADaM):", adam_expr$adam_output, "=", adam_expr$adam_expression, "\n\n")

  # Get slice filters
  filters <- get_slice_filters(metadata)
  cat("Applying slice filters:\n")
  for (name in names(filters)) {
    cat("  ", name, "=", filters[[name]], "\n")
  }
  cat("\n")

  # Build filter condition for slice
  slice_condition <- rep(TRUE, nrow(input_data))
  for (filter_var in names(filters)) {
    filter_value <- filters[[filter_var]]
    slice_condition <- slice_condition & (input_data[[filter_var]] == filter_value)
  }

  cat("Records matching slice:", sum(slice_condition), "of", nrow(input_data), "\n\n")

  # Initialize output variable as NA for all records
  output_var_name <- adam_expr$adam_output
  input_data[[output_var_name]] <- NA_real_

  # Calculate derivation only for sliced records
  sliced_rows <- which(slice_condition)
  if (length(sliced_rows) > 0) {
    # Evaluate expression for sliced records
    input_data[sliced_rows, output_var_name] <- with(
      input_data[sliced_rows, ],
      eval(parse(text = adam_expr$adam_expression))
    )
  }

  cat("Derivation applied to", length(sliced_rows), "records\n")
  cat("Output variable:", output_var_name, "\n\n")

  input_data
}

# ============================================================================
# 8. Main Execution
# ============================================================================

run_derivation <- function(adam_data, metadata_path = ".", output_name = "ADQSADAS_updated") {

  cat("=== Metadata-Driven Derivation Execution ===\n\n")

  # Load metadata
  metadata <- load_metadata(metadata_path)

  # Get dataset name from metadata
  dataset_info <- metadata$derivation_dataset
  cat("Derivation ID:", dataset_info$derivation_id[1], "\n")
  cat("Source Dataset:", dataset_info$adam_dataset[1], "\n")
  cat("Output Dataset:", output_name, "\n\n")

  # Execute derivation
  result <- execute_derivation(adam_data, metadata)

  # Assign result to output name in global environment for testing
  assign(output_name, result, envir = .GlobalEnv)

  cat("=== Derivation Complete ===\n")
  cat("Result saved to:", output_name, "\n")

  result
}

# ============================================================================
# Example Usage (uncomment to run)
# ============================================================================

# # Load your ADQSADAS dataset
adqsadas <- read.csv("adqsadas.csv")
#
# # Or create sample data for testing:
# adqsadas <- data.frame(
#   USUBJID = c("SUBJ001", "SUBJ001", "SUBJ001", "SUBJ002", "SUBJ002", "SUBJ002"),
#   PARAM = c("Adas-Cog(11) Subscore", "Adas-Cog(11) Subscore", "Other Param",
#             "Adas-Cog(11) Subscore", "Adas-Cog(11) Subscore", "Other Param"),
#   PARAMCD = c("ACTOT", "ACTOT", "OTHER", "ACTOT", "ACTOT", "OTHER"),
#   AVISIT = c("Baseline", "Week 12", "Week 12", "Baseline", "Week 12", "Week 12"),
#   AVISITN = c(0, 12, 12, 0, 12, 12),
#   AVAL = c(25, 22, 100, 30, 28, 200),
#   BASE = c(25, 25, 100, 30, 30, 200),
#   ITTFL = c("Y", "Y", "Y", "Y", "Y", "N")
# )
#
# # Run the derivation - CHG will only be calculated for sliced records
result <- run_derivation(adqsadas, metadata_path = ".", output_name = "ADQSADAS_updated")
#
# # View results - CHG should be NA for non-sliced records
# print(ADQSADAS_updated)
