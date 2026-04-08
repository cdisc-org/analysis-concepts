# ===========================================================================
# AC/DC Generic Execution Engine
#
# A metadata-driven R engine that executes analysis specifications.
# The specification JSON (from the AC/DC app) describes WHAT to analyze;
# the concept-variable mapping describes HOW concepts map to ADaM variables.
# This engine is generic — the same code works for any study.
# ===========================================================================

# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

#' Execute an AC/DC analysis specification.
#'
#' @param spec       Named list — the endpoint's resolved analysis specification
#' @param mappings   Named list — concept-to-variable mappings (adam section)
#' @param dataset    data.frame — the ADaM dataset to analyze
#' @param overrides  Optional named list — user variable overrides { concept: adam_var }
#' @return Named list of result tables (ARD structure)
acdc_execute <- function(spec, mappings, dataset, overrides = NULL) {
  analysis <- spec$analyses[[1]]
  if (is.null(analysis)) stop("No analysis found in specification")

  # Strip haven labels — XPT files import as haven_labelled which breaks lm() contrasts
  dataset <- as.data.frame(lapply(dataset, function(col) {
    if (inherits(col, "haven_labelled")) as.vector(col)
    else col
  }))

  cat("AC/DC Engine: Executing analysis\n")
  cat("  Method:", analysis$method$oid, "\n")

  # 1. Build concept -> ADaM variable map from mappings JSON
  concept_vars <- build_concept_var_map(analysis$resolvedBindings, mappings, overrides)
  cat("  Concept -> ADaM:\n")
  for (nm in names(concept_vars$by_concept)) {
    cat("    ", nm, "->", concept_vars$by_concept[[nm]], "\n")
  }

  # 2. Execute cube: query each slice separately, then join
  #    Each binding references a slice — extract that concept's data from the slice's subset
  #    Bindings without a slice use the endpoint (default) slice
  analysis_data <- execute_cube(
    dataset, analysis$resolvedBindings, analysis$resolvedSlices,
    mappings, concept_vars, overrides
  )
  cat("  Analysis data:", nrow(analysis_data), "rows x", ncol(analysis_data), "cols\n")

  # 3. Coerce column types based on dataStructureRole
  analysis_data <- coerce_types(analysis_data, analysis$resolvedBindings, concept_vars$by_concept)

  # 4. Resolve formula — substitute concept names with ADaM variable names
  formula_obj <- resolve_formula(
    analysis$resolvedExpression,
    concept_vars$by_concept,
    concept_vars$by_role
  )
  cat("  Formula:", deparse(formula_obj), "\n")

  # 5. Parse method configurations
  configs <- parse_configs(analysis$configurationValues)

  # 6. Dispatch to method-specific runner
  method_oid <- analysis$method$oid
  result <- dispatch_method(method_oid, analysis_data, formula_obj, concept_vars$by_role, configs)

  return(result)
}

# ---------------------------------------------------------------------------
# Variable resolution: concept -> ADaM variable (using mappings JSON)
# ---------------------------------------------------------------------------

#' Build two maps:
#'   by_concept: concept_name -> ADaM variable (for formula substitution)
#'   by_role:    method_role  -> ADaM variable (for method dispatch)
#'
#' Uses concept-variable-mappings.json to resolve each concept.
#' User overrides take precedence when provided.
build_concept_var_map <- function(bindings, mappings, overrides = NULL) {
  by_concept <- list()
  by_role <- list()
  concepts_map <- mappings$concepts
  dims_map <- mappings$dimensions

  for (b in bindings) {
    if (identical(b$direction, "output")) next
    role <- b$methodRole
    concept <- b$concept
    if (is.null(concept) || concept == "") next

    # Check for user override first
    if (!is.null(overrides) && !is.null(overrides[[concept]])) {
      var_name <- overrides[[concept]]
    } else {
      # Look up in concept-variable-mappings.json
      entry <- concepts_map[[concept]]
      if (is.null(entry)) entry <- dims_map[[concept]]

      if (!is.null(entry) && !is.null(entry$byDataType)) {
        by_type <- entry$byDataType
        if (identical(b$dataStructureRole, "measure")) {
          var_name <- by_type$decimal %||% by_type$code %||% by_type$string
        } else {
          var_name <- by_type$code %||% by_type$string %||% by_type$decimal
        }
        if (is.null(var_name)) var_name <- strsplit(entry$variable, "/")[[1]][1]
      } else {
        var_name <- toupper(concept)
      }
    }

    # Note: bindings with slices (e.g., covariate at baseline) will be
    # resolved by execute_cube() which queries the slice subset and renames
    # the column. No ADaM-specific assumptions here.

    # Store by concept name (for formula substitution)
    # Handle slice suffix: "Measure@Parameter_baseline" -> strip @suffix for lookup
    concept_key <- sub("@.*", "", concept)
    by_concept[[concept_key]] <- var_name

    # Store by role (for method dispatch) — accumulate for multi-binding roles
    if (!is.null(role) && role != "") {
      if (!is.null(by_role[[role]])) {
        by_role[[role]] <- c(by_role[[role]], var_name)
      } else {
        by_role[[role]] <- var_name
      }
    }
  }

  return(list(by_concept = by_concept, by_role = by_role))
}

# ---------------------------------------------------------------------------
# Cube execution: query each slice, then join
# ---------------------------------------------------------------------------

#' Execute the data cube: each binding gets its data from its slice's subset.
#' Bindings without a slice use the default (endpoint) slice.
#' Multiple slice subsets are joined by key dimensions (Subject).
#'
#' @param dataset    The full ADaM dataset
#' @param bindings   resolvedBindings from the analysis spec
#' @param slices     resolvedSlices from the analysis spec
#' @param mappings   concept-variable mappings (adam section)
#' @param concept_vars  resolved concept->variable maps
#' @param overrides  user variable overrides
#' @return data.frame with one column per binding, joined by key dimensions
execute_cube <- function(dataset, bindings, slices, mappings, concept_vars, overrides = NULL) {
  dim_map <- mappings$dimensions

  # Build a lookup: slice_name -> resolvedValues
  slice_lookup <- list()
  for (s in slices) {
    name <- s$name %||% "endpoint"
    slice_lookup[[name]] <- s$resolvedValues
  }

  # Identify the default (endpoint) slice — the one not referenced by any binding
  binding_slice_names <- character(0)
  for (b in bindings) {
    if (!is.null(b$slice) && b$slice != "") {
      binding_slice_names <- c(binding_slice_names, b$slice)
    }
  }
  default_slice_name <- setdiff(names(slice_lookup), binding_slice_names)[1]
  if (is.na(default_slice_name)) default_slice_name <- names(slice_lookup)[1]

  # Join keys are determined dynamically when merging slice subsets
  # (common columns between main data and slice data, excluding the value column)

  # Query the default slice subset (main analysis data)
  default_constraints <- slice_lookup[[default_slice_name]]
  main_data <- filter_by_constraints(dataset, default_constraints, dim_map, overrides)
  cat("  Default slice '", default_slice_name, "':", nrow(main_data), "rows\n")

  # For each binding with a different slice, query that slice and join the column
  for (b in bindings) {
    slice_name <- b$slice
    if (is.null(slice_name) || slice_name == "" || slice_name == default_slice_name) next
    if (identical(b$direction, "output")) next

    concept <- sub("@.*", "", b$concept)
    adam_var <- concept_vars$by_concept[[concept]]
    if (is.null(adam_var)) next

    # Query this slice's subset
    constraints <- slice_lookup[[slice_name]]
    if (is.null(constraints)) next

    slice_data <- filter_by_constraints(dataset, constraints, dim_map, overrides)
    cat("  Slice '", slice_name, "':", nrow(slice_data), "rows -> column", adam_var, "\n")

    # Find common columns between main data and slice data for joining
    # Exclude the value column itself to avoid conflicts
    col_name <- paste0(adam_var, "_", slice_name)
    if (adam_var %in% colnames(slice_data)) {
      common_cols <- intersect(colnames(main_data), colnames(slice_data))
      join_keys <- setdiff(common_cols, adam_var)  # don't join on the value column

      if (length(join_keys) > 0) {
        keep_cols <- unique(c(join_keys, adam_var))
        slice_subset <- slice_data[, keep_cols, drop = FALSE]
        # Deduplicate by join keys
        slice_subset <- slice_subset[!duplicated(slice_subset[, join_keys, drop = FALSE]), , drop = FALSE]
        colnames(slice_subset)[colnames(slice_subset) == adam_var] <- col_name

        cat("    Join keys:", paste(join_keys, collapse = ", "), "\n")
        main_data <- merge(main_data, slice_subset, by = join_keys, all.x = TRUE)
      } else {
        cat("    Warning: no common columns for join\n")
      }

      # Update the concept variable map to use the joined column name
      concept_vars$by_concept[[concept]] <- col_name
      # Update role map too
      role <- b$methodRole
      if (!is.null(role) && !is.null(concept_vars$by_role[[role]])) {
        concept_vars$by_role[[role]] <- col_name
      }
    }
  }

  return(main_data)
}

#' Filter a dataset by a set of dimensional constraints.
filter_by_constraints <- function(dataset, constraints, dim_map, overrides = NULL) {
  if (is.null(constraints) || length(constraints) == 0) return(dataset)

  for (dim_name in names(constraints)) {
    value <- constraints[[dim_name]]
    if (is.null(value) || value == "") next

    # Resolve dimension -> ADaM variable
    if (!is.null(overrides) && !is.null(overrides[[dim_name]])) {
      adam_var <- overrides[[dim_name]]
    } else {
      dim_entry <- dim_map[[dim_name]]
      if (!is.null(dim_entry) && !is.null(dim_entry$byDataType)) {
        adam_var <- dim_entry$byDataType$string %||%
                    dim_entry$byDataType$code %||%
                    strsplit(dim_entry$variable, "/")[[1]][1]
      } else {
        adam_var <- toupper(dim_name)
      }
    }

    if (adam_var %in% colnames(dataset)) {
      cat("    Filter:", adam_var, "==", value, "\n")
      dataset <- dataset[dataset[[adam_var]] == value, , drop = FALSE]
    } else {
      cat("    Warning: column", adam_var, "not found\n")
    }
  }

  return(dataset)
}

# ---------------------------------------------------------------------------
# Type coercion: dataStructureRole -> R type
# ---------------------------------------------------------------------------

#' Coerce dataset columns to the correct R types based on binding roles.
#' Uses the AC/DC dataStructureRole: measure -> numeric, dimension -> factor.
#' This is generic — works for any method without hardcoding role names.
coerce_types <- function(data, bindings, concept_map) {
  for (b in bindings) {
    if (identical(b$direction, "output")) next
    concept <- sub("@.*", "", b$concept)
    adam_var <- concept_map[[concept]]
    if (is.null(adam_var) || !(adam_var %in% colnames(data))) next

    dsr <- b$dataStructureRole
    if (identical(dsr, "dimension")) {
      data[[adam_var]] <- factor(data[[adam_var]])
      cat("  factor():", adam_var, "->", nlevels(data[[adam_var]]), "levels\n")
    } else if (identical(dsr, "measure")) {
      data[[adam_var]] <- as.numeric(data[[adam_var]])
      cat("  numeric():", adam_var, "\n")
    }
  }
  return(data)
}

# ---------------------------------------------------------------------------
# Formula resolution: concept names -> ADaM variable names
# ---------------------------------------------------------------------------

#' Substitute concept names in the formula with ADaM variable names.
#' The formula from resolvedExpression uses concept names (Change, Measure, Treatment).
#' We replace each with the resolved ADaM variable from the mappings.
resolve_formula <- function(expr, concept_map, role_map) {
  if (is.null(expr) || is.null(expr$resolved)) {
    # Fallback: build from role_map
    response <- role_map$response[1]
    predictors <- c(role_map$covariate, role_map$fixed_effect)
    formula_str <- paste(response, "~", paste(predictors, collapse = " + "))
    return(as.formula(formula_str))
  }

  formula_str <- expr$resolved

  # Build combined substitution map: concept names + role names -> ADaM vars
  sub_map <- c(concept_map, role_map)

  # Sort keys by length (longest first) to avoid partial matches
  keys <- names(sub_map)
  keys <- keys[order(nchar(keys), decreasing = TRUE)]

  for (key in keys) {
    vars <- sub_map[[key]]
    if (is.null(vars)) next
    replacement <- paste(vars, collapse = " + ")
    # Replace as whole word, also handle @suffix variants (e.g., Measure@Parameter_baseline)
    formula_str <- gsub(paste0("\\b", key, "(\\b|@\\w+)"), replacement, formula_str)
  }

  return(as.formula(formula_str))
}

# ---------------------------------------------------------------------------
# Configuration parsing
# ---------------------------------------------------------------------------

parse_configs <- function(config_values) {
  configs <- list()
  if (is.null(config_values)) return(configs)
  for (cv in config_values) {
    val <- cv$value
    num_val <- suppressWarnings(as.numeric(val))
    if (!is.na(num_val)) val <- num_val
    configs[[cv$name]] <- val
  }
  return(configs)
}

# ---------------------------------------------------------------------------
# Method dispatch
# ---------------------------------------------------------------------------

dispatch_method <- function(method_oid, data, formula_obj, var_map, configs) {
  switch(method_oid,
    "M.ANCOVA" = run_ancova(data, formula_obj, var_map, configs),
    "M.ANOVA"  = run_ancova(data, formula_obj, var_map, configs),
    stop(paste("Unsupported method:", method_oid,
               "- add a runner in acdc_engine.R"))
  )
}

# ---------------------------------------------------------------------------
# Method runners
# ---------------------------------------------------------------------------

run_ancova <- function(data, formula_obj, var_map, configs) {
  ss_type <- configs$ss_type %||% "III"
  alpha <- configs$alpha %||% 0.05
  conf_level <- 1 - alpha

  # Diagnostics: check data and formula variables before fitting
  cat("  run_ancova diagnostics:\n")
  cat("    Rows:", nrow(data), " Cols:", ncol(data), "\n")
  cat("    Formula:", deparse(formula_obj), "\n")
  formula_vars <- all.vars(formula_obj)
  for (v in formula_vars) {
    if (v %in% colnames(data)) {
      col <- data[[v]]
      if (is.factor(col)) {
        cat("    ", v, "-> factor,", nlevels(col), "levels:", paste(head(levels(col), 5), collapse=", "), "\n")
      } else {
        cat("    ", v, "-> ", class(col)[1], ", range:", min(col, na.rm=TRUE), "-", max(col, na.rm=TRUE), "\n")
      }
    } else {
      cat("    ", v, "-> NOT FOUND in data!\n")
    }
  }

  model <- tryCatch(
    lm(formula_obj, data = data),
    error = function(e) {
      # Return diagnostics as the error
      diag <- paste0("lm() failed: ", e$message, "\n",
                     "Data has ", nrow(data), " rows\n",
                     "Formula: ", deparse(formula_obj), "\n",
                     "Columns: ", paste(colnames(data), collapse=", "))
      stop(diag)
    }
  )
  model_summary <- summary(model)

  results <- list()

  results$fit_statistics <- list(
    R_squared     = model_summary$r.squared,
    Adj_R_squared = model_summary$adj.r.squared,
    AIC           = AIC(model),
    BIC           = BIC(model)
  )

  anova_result <- car::Anova(model, type = ss_type)
  results$type3_tests <- data.frame(
    Term        = rownames(anova_result),
    SS          = anova_result[["Sum Sq"]],
    df          = anova_result[["Df"]],
    F_statistic = anova_result[["F value"]],
    p_value     = anova_result[["Pr(>F)"]],
    row.names   = NULL
  )

  group_var <- var_map$fixed_effect[1]
  if (!is.null(group_var)) {
    lsm <- emmeans::emmeans(model, as.formula(paste("~", group_var)))
    lsm_df <- as.data.frame(summary(lsm, level = conf_level))
    results$ls_means <- data.frame(
      Group    = lsm_df[[1]],
      estimate = lsm_df$emmean,
      SE       = lsm_df$SE,
      df       = lsm_df$df,
      CI_lower = lsm_df$lower.CL,
      CI_upper = lsm_df$upper.CL,
      row.names = NULL
    )

    contr <- pairs(lsm)
    contr_df <- as.data.frame(summary(contr, infer = TRUE, level = conf_level))
    results$contrasts <- data.frame(
      Contrast    = as.character(contr_df$contrast),
      estimate    = contr_df$estimate,
      SE          = contr_df$SE,
      df          = contr_df$df,
      CI_lower    = contr_df$lower.CL,
      CI_upper    = contr_df$upper.CL,
      t_statistic = contr_df$t.ratio,
      p_value     = contr_df$p.value,
      row.names   = NULL
    )
  }

  results$covariance_parameters <- list(
    residual_variance = sum(model$residuals^2) / model$df.residual
  )

  return(results)
}

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------
`%||%` <- function(x, y) if (is.null(x)) y else x
