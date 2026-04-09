# ===========================================================================
# AC/DC Generic Execution Engine
#
# A fully metadata-driven R engine. It reads:
#   - Specification JSON (what to analyze: bindings, slices, formula)
#   - Concept-variable mappings (concept → ADaM variable)
#   - Method definition (formula notation, output_specification)
#   - R implementation catalog (callTemplate, outputMapping)
#
# NO method-specific logic is hardcoded. Adding a new method requires
# only a method JSON + r_implementations.json entry — zero engine changes.
# ===========================================================================

`%||%` <- function(x, y) if (is.null(x)) y else x

# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

acdc_execute <- function(spec, mappings, dataset, overrides = NULL,
                         method_def = NULL, r_impl = NULL) {
  analysis <- spec$analyses[[1]]
  if (is.null(analysis)) stop("No analysis found in specification")
  if (is.null(r_impl)) stop("No R implementation provided for this method")

  # Strip haven labels — XPT files import as haven_labelled
  dataset <- as.data.frame(lapply(dataset, function(col) {
    if (inherits(col, "haven_labelled")) as.vector(col)
    else col
  }))

  cat("AC/DC Engine: Executing analysis\n")
  cat("  Method:", analysis$method$oid, "\n")

  # 1. Resolve concept → ADaM variable names via the binding chain:
  #    method role → transformation binding → concept → ADaM mapping
  concept_vars <- build_concept_var_map(analysis$resolvedBindings, mappings, overrides)
  cat("  Concept → ADaM:\n")
  for (nm in names(concept_vars$by_concept)) {
    cat("    ", nm, "→", concept_vars$by_concept[[nm]], "\n")
  }

  # 2. Execute cube: query each slice, join by common dimensions
  analysis_data <- execute_cube(
    dataset, analysis$resolvedBindings, analysis$resolvedSlices,
    mappings, concept_vars, overrides
  )
  cat("  Analysis data:", nrow(analysis_data), "rows x", ncol(analysis_data), "cols\n")

  # 3. Coerce column types based on dataStructureRole (measure → numeric, dimension → factor)
  analysis_data <- coerce_types(analysis_data, analysis$resolvedBindings, concept_vars$by_concept)

  # 4. Parse method configurations (defaults from method_def, overridden by user values)
  configs <- parse_configs(analysis$configurationValues, method_def)

  # 5. Execute method using r_implementations.json metadata
  #    - Resolve callTemplate placeholders via the binding chain
  #    - Evaluate the call in a sandbox environment
  #    - Extract results using outputMapping expressions
  result <- execute_method(analysis_data, concept_vars$by_role, configs, r_impl)

  # 6. Build resolved R code from what was actually executed
  result$resolved_code <- build_resolved_code(
    r_impl, concept_vars, configs,
    analysis$resolvedSlices, analysis$resolvedBindings, mappings$dimensions
  )

  return(result)
}

# ---------------------------------------------------------------------------
# Variable resolution: method role → binding concept → ADaM variable
# ---------------------------------------------------------------------------

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

    # User override takes precedence
    if (!is.null(overrides) && !is.null(overrides[[concept]])) {
      var_name <- overrides[[concept]]
    } else {
      entry <- concepts_map[[concept]]
      if (is.null(entry)) entry <- dims_map[[concept]]

      if (!is.null(entry) && !is.null(entry$byDataType)) {
        by_type <- entry$byDataType
        if (identical(b$dataStructureRole, "measure")) {
          var_name <- by_type$decimal %||% by_type$baseline %||% by_type$code %||% by_type$string
        } else {
          var_name <- by_type$code %||% by_type$string %||% by_type$decimal
        }
        if (is.null(var_name)) var_name <- strsplit(entry$variable, "/")[[1]][1]
      } else {
        var_name <- toupper(concept)
      }
    }

    concept_key <- sub("@.*", "", concept)
    by_concept[[concept_key]] <- var_name

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
# Cube execution: query each slice, join by common dimensions
# ---------------------------------------------------------------------------

execute_cube <- function(dataset, bindings, slices, mappings, concept_vars, overrides = NULL) {
  dim_map <- mappings$dimensions

  # Build slice lookup
  slice_lookup <- list()
  for (s in slices) {
    name <- s$name %||% "endpoint"
    slice_lookup[[name]] <- s$resolvedValues
  }

  # Identify binding-referenced slices
  binding_slice_names <- character(0)
  for (b in bindings) {
    if (!is.null(b$slice) && b$slice != "") {
      binding_slice_names <- c(binding_slice_names, b$slice)
    }
  }
  default_slice_name <- setdiff(names(slice_lookup), binding_slice_names)[1]
  if (is.na(default_slice_name)) default_slice_name <- names(slice_lookup)[1]

  # Query default slice
  default_constraints <- slice_lookup[[default_slice_name]]
  main_data <- filter_by_constraints(dataset, default_constraints, dim_map, overrides)
  cat("  Default slice '", default_slice_name, "':", nrow(main_data), "rows\n")

  # For each binding with a different slice, query and join
  for (b in bindings) {
    slice_name <- b$slice
    if (is.null(slice_name) || slice_name == "" || slice_name == default_slice_name) next
    if (identical(b$direction, "output")) next

    concept <- sub("@.*", "", b$concept)
    adam_var <- concept_vars$by_concept[[concept]]
    if (is.null(adam_var)) next

    constraints <- slice_lookup[[slice_name]]
    if (is.null(constraints)) next

    slice_data <- filter_by_constraints(dataset, constraints, dim_map, overrides)
    cat("  Slice '", slice_name, "':", nrow(slice_data), "rows → column", adam_var, "\n")

    col_name <- paste0(adam_var, "_", slice_name)
    if (adam_var %in% colnames(slice_data)) {
      common_cols <- intersect(colnames(main_data), colnames(slice_data))
      join_keys <- setdiff(common_cols, adam_var)

      if (length(join_keys) > 0) {
        keep_cols <- unique(c(join_keys, adam_var))
        slice_subset <- slice_data[, keep_cols, drop = FALSE]
        slice_subset <- slice_subset[!duplicated(slice_subset[, join_keys, drop = FALSE]), , drop = FALSE]
        colnames(slice_subset)[colnames(slice_subset) == adam_var] <- col_name
        cat("    Join keys:", paste(join_keys, collapse = ", "), "\n")
        main_data <- merge(main_data, slice_subset, by = join_keys, all.x = TRUE)
      }
    }

    # Update concept variable map to use joined column name
    concept_vars$by_concept[[concept]] <- col_name
    role <- b$methodRole
    if (!is.null(role) && !is.null(concept_vars$by_role[[role]])) {
      concept_vars$by_role[[role]] <- col_name
    }
  }

  return(main_data)
}

filter_by_constraints <- function(dataset, constraints, dim_map, overrides = NULL) {
  if (is.null(constraints) || length(constraints) == 0) return(dataset)

  for (dim_name in names(constraints)) {
    value <- constraints[[dim_name]]
    if (is.null(value) || value == "") next

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
# Type coercion: dataStructureRole → R type
# ---------------------------------------------------------------------------

coerce_types <- function(data, bindings, concept_map) {
  for (b in bindings) {
    if (identical(b$direction, "output")) next
    concept <- sub("@.*", "", b$concept)
    adam_var <- concept_map[[concept]]
    if (is.null(adam_var) || !(adam_var %in% colnames(data))) next

    dsr <- b$dataStructureRole
    if (identical(dsr, "dimension")) {
      data[[adam_var]] <- factor(data[[adam_var]])
      cat("  factor():", adam_var, "→", nlevels(data[[adam_var]]), "levels\n")
    } else if (identical(dsr, "measure")) {
      data[[adam_var]] <- as.numeric(data[[adam_var]])
      cat("  numeric():", adam_var, "\n")
    }
  }
  return(data)
}

# ---------------------------------------------------------------------------
# Generic method execution — driven by r_implementations.json
# ---------------------------------------------------------------------------

#' Execute a method using its R implementation metadata.
#' Reads callTemplate (with role placeholders) and outputMapping (with R expressions).
#' NO method-specific logic — everything comes from the implementation catalog.
execute_method <- function(data, var_map, configs, r_impl) {
  # 1. Resolve placeholders in callTemplate
  call_code <- resolve_call_template(r_impl$callTemplate, var_map, configs)
  cat("  Resolved call template:\n")
  cat(paste0("    ", strsplit(call_code, "\n")[[1]]), sep = "\n")

  # 2. Execute in a sandbox environment
  env <- new.env(parent = globalenv())
  env$analysis_data <- data
  tryCatch(
    eval(parse(text = call_code), envir = env),
    error = function(e) {
      stop(paste0("Method execution failed: ", e$message,
                  "\nResolved call:\n", call_code,
                  "\nData: ", nrow(data), " rows, columns: ",
                  paste(colnames(data), collapse = ", ")))
    }
  )

  # 3. Extract results using outputMapping
  results <- list()
  for (om in r_impl$outputMapping) {
    class_name <- om$outputClass
    tryCatch({
      results[[class_name]] <- extract_from_mapping(env, om$resultColumns)
      cat("  Output class '", class_name, "': OK\n")
    }, error = function(e) {
      cat("  Output class '", class_name, "': FAILED -", e$message, "\n")
    })
  }

  return(results)
}

#' Substitute placeholders in callTemplate via the binding chain.
#' Role placeholders (<response>, <covariate>, etc.) → resolved ADaM variables.
#' Config placeholders (<ss_type>, <alpha>, etc.) → configuration values.
resolve_call_template <- function(template, var_map, configs) {
  resolved <- template

  # Substitute role placeholders (longest first to avoid partial matches)
  roles <- names(var_map)
  roles <- roles[order(nchar(roles), decreasing = TRUE)]
  for (role in roles) {
    placeholder <- paste0("<", role, ">")
    value <- paste(var_map[[role]], collapse = " + ")
    resolved <- gsub(placeholder, value, resolved, fixed = TRUE)
  }

  # Substitute config placeholders
  for (cfg in names(configs)) {
    placeholder <- paste0("<", cfg, ">")
    resolved <- gsub(placeholder, as.character(configs[[cfg]]), resolved, fixed = TRUE)
  }

  # Substitute <dataset>
  resolved <- gsub("<dataset>", "analysis_data", resolved, fixed = TRUE)
  return(resolved)
}

#' Evaluate R expressions from outputMapping to extract results.
#' Each resultColumns entry maps a statistic name to an R expression.
extract_from_mapping <- function(env, result_columns) {
  result <- list()
  for (stat_name in names(result_columns)) {
    r_expr <- result_columns[[stat_name]]
    tryCatch({
      result[[stat_name]] <- eval(parse(text = r_expr), envir = env)
    }, error = function(e) {
      result[[stat_name]] <<- NA
    })
  }

  # Scalars → return as list; vectors → return as data.frame
  lengths <- sapply(result, length)
  if (all(lengths <= 1)) return(result)
  return(as.data.frame(result, row.names = NULL, stringsAsFactors = FALSE))
}

# ---------------------------------------------------------------------------
# Configuration parsing
# ---------------------------------------------------------------------------

parse_configs <- function(config_values, method_def = NULL) {
  configs <- list()
  # 1. Load defaults from method definition
  if (!is.null(method_def) && !is.null(method_def$configurations)) {
    for (cfg in method_def$configurations) {
      if (!is.null(cfg$defaultValue)) {
        configs[[cfg$name]] <- cfg$defaultValue
      }
    }
  }
  # 2. Override with user-specified values from analysis spec
  if (!is.null(config_values)) {
    for (cv in config_values) {
      val <- cv$value
      num_val <- suppressWarnings(as.numeric(val))
      if (!is.na(num_val)) val <- num_val
      configs[[cv$name]] <- val
    }
  }
  return(configs)
}

# ---------------------------------------------------------------------------
# Build resolved R code from metadata (for display)
# ---------------------------------------------------------------------------

build_resolved_code <- function(r_impl, concept_vars, configs,
                                 slices, bindings, dim_map) {
  lines <- c(
    "# ═══════════════════════════════════════════════════════════════",
    "# Resolved R Program (standalone)",
    paste0("# Generated from AC/DC specification + r_implementations.json"),
    "# ═══════════════════════════════════════════════════════════════",
    ""
  )

  # Variable mapping
  lines <- c(lines, "# --- Concept → ADaM variable mapping ---")
  for (concept in names(concept_vars$by_concept)) {
    lines <- c(lines, paste0("# ", concept, " → ", concept_vars$by_concept[[concept]]))
  }
  lines <- c(lines, "")

  # Filters from slices
  binding_slice_names <- character(0)
  for (b in bindings) {
    if (!is.null(b$slice) && b$slice != "") {
      binding_slice_names <- c(binding_slice_names, b$slice)
    }
  }

  filter_parts <- c()
  if (!is.null(slices)) {
    for (s in slices) {
      if ((s$name %||% "") %in% binding_slice_names) next
      resolved <- s$resolvedValues
      if (is.null(resolved)) next
      for (dim_name in names(resolved)) {
        value <- resolved[[dim_name]]
        if (is.null(value) || value == "") next
        dim_entry <- dim_map[[dim_name]]
        adam_var <- if (!is.null(dim_entry) && !is.null(dim_entry$byDataType)) {
          dim_entry$byDataType$string %||% dim_entry$byDataType$code %||% toupper(dim_name)
        } else toupper(dim_name)
        filter_parts <- c(filter_parts, paste0("  ", adam_var, ' == "', value, '"'))
      }
    }
  }

  lines <- c(lines, "# --- Filter data ---")
  if (length(filter_parts) > 0) {
    lines <- c(lines, "analysis_data <- subset(dataset,")
    lines <- c(lines, paste(filter_parts, collapse = " &\n"))
    lines <- c(lines, ")")
  } else {
    lines <- c(lines, "analysis_data <- dataset")
  }
  lines <- c(lines, "")

  # Type coercion
  lines <- c(lines, "# --- Coerce types (from dataStructureRole) ---")
  for (b in bindings) {
    if (identical(b$direction, "output")) next
    concept <- sub("@.*", "", b$concept)
    adam_var <- concept_vars$by_concept[[concept]]
    if (is.null(adam_var)) next
    dsr <- b$dataStructureRole
    if (identical(dsr, "dimension")) {
      lines <- c(lines, paste0("analysis_data$", adam_var, " <- factor(analysis_data$", adam_var, ")"))
    } else if (identical(dsr, "measure")) {
      lines <- c(lines, paste0("analysis_data$", adam_var, " <- as.numeric(analysis_data$", adam_var, ")"))
    }
  }
  lines <- c(lines, "")

  # Resolved call template
  lines <- c(lines, "# --- Execute (from r_implementations.json callTemplate) ---")
  resolved_call <- resolve_call_template(r_impl$callTemplate, concept_vars$by_role, configs)
  lines <- c(lines, strsplit(resolved_call, "\n")[[1]])

  return(paste(lines, collapse = "\n"))
}
