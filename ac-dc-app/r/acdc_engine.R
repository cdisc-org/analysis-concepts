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
                         method_def = NULL, r_impl = NULL,
                         derivations = NULL, unit_conversions = NULL, r_impls = NULL,
                         all_mappings = NULL) {
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
  deriv_count <- if (is.null(derivations)) 0L else length(derivations)
  cat("  Derivations:", deriv_count, "\n")

  # 1. Resolve concept → ADaM variable names via the binding chain:
  #    method role → transformation binding → concept → ADaM mapping
  # Derive domain code from dataset name for SDTM -- prefix substitution
  domain_code <- NULL
  target_store <- spec$targetStore
  if (!is.null(target_store) && target_store == "sdtm") {
    ds_name <- toupper(spec$targetDataset %||% "")
    if (nchar(ds_name) >= 2) domain_code <- ds_name
  }
  concept_vars <- build_concept_var_map(analysis$resolvedBindings, mappings, overrides, domain_code)
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

  # 3b. Apply derivation chain (if any) — mutates dataset before analysis
  #      Derivations use SDTM mappings (Observation lives in sdtm, not adam)
  if (!is.null(derivations) && length(derivations) > 0) {
    cat("  Applying", length(derivations), "derivation(s)...\n")
    analysis_data <- apply_derivations(
      analysis_data, derivations, r_impls, unit_conversions, all_mappings
    )
    cat("  Post-derivation:", nrow(analysis_data), "rows x", ncol(analysis_data), "cols\n")

    # 3c. Present derivation outputs: map source store columns to ADaM aliases
    #      Uses per-derivation sourceStore/sourceDomain to resolve source columns
    if (!is.null(all_mappings$adam)) {
      analysis_data <- present_derivation_outputs(
        analysis_data, derivations, all_mappings, all_mappings$adam
      )
    }
  }

  # 4. Parse method configurations (defaults from method_def, overridden by user values)
  configs <- parse_configs(analysis$configurationValues, method_def)

  # 5. Pre-process callTemplate for output dimension selection
  #    Narrow <fixed_effect> in emmeans/pairs lines to only selected dimensions,
  #    while keeping the full set in the model formula (for correct estimation).
  narrowed_impl <- r_impl
  narrowed_impl$callTemplate <- narrow_template_for_output_config(
    r_impl$callTemplate, analysis$outputConfiguration, concept_vars
  )

  # 6. Execute method using r_implementations.json metadata
  #    - Resolve callTemplate placeholders via the binding chain
  #    - Evaluate the call in a sandbox environment
  #    - Extract results using outputMapping expressions
  result <- execute_method(analysis_data, concept_vars$by_role, configs, narrowed_impl)

  # 7. Build resolved R code from what was actually executed
  result$resolved_code <- build_resolved_code(
    narrowed_impl, concept_vars, configs,
    analysis$resolvedSlices, analysis$resolvedBindings, mappings$dimensions
  )

  return(result)
}

# ---------------------------------------------------------------------------
# Variable resolution: method role → binding concept → ADaM variable
# ---------------------------------------------------------------------------

build_concept_var_map <- function(bindings, mappings, overrides = NULL,
                                  domain_code = NULL, include_outputs = FALSE) {
  by_concept <- list()
  by_role <- list()
  concepts_map <- mappings$concepts
  dims_map <- mappings$dimensions

  for (b in bindings) {
    if (identical(b$direction, "output") && !include_outputs) next
    role <- b$methodRole
    concept <- b$concept
    if (is.null(concept) || concept == "") next

    var_name <- NULL

    # User override takes precedence
    if (!is.null(overrides) && !is.null(overrides[[concept]])) {
      var_name <- overrides[[concept]]
    } else if (identical(b$qualifierType, "facet") && !is.null(b$qualifierValue)) {
      # Facet-qualified binding: look up concept.facets[qualifierValue]
      entry <- concepts_map[[concept]]
      if (is.null(entry)) entry <- dims_map[[concept]]
      if (!is.null(entry$facets)) {
        # Try exact match first, then case-insensitive fallback
        fval <- entry$facets[[b$qualifierValue]]
        if (is.null(fval)) {
          facet_names <- names(entry$facets)
          match_idx <- match(tolower(b$qualifierValue), tolower(facet_names))
          if (!is.na(match_idx)) fval <- entry$facets[[facet_names[match_idx]]]
        }
        if (!is.null(fval)) var_name <- fval
      }
      if (is.null(var_name)) {
        var_name <- resolve_by_data_type(entry, b$dataStructureRole)
      }
    } else {
      # Standard resolution via byDataType
      entry <- concepts_map[[concept]]
      if (is.null(entry)) entry <- dims_map[[concept]]
      var_name <- resolve_by_data_type(entry, b$dataStructureRole)
    }

    if (is.null(var_name)) var_name <- toupper(concept)

    # Domain prefix substitution: --ORRES → VSORRES
    if (!is.null(domain_code) && grepl("^--", var_name)) {
      var_name <- sub("^--", domain_code, var_name)
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

# Extract variable name from a mapping entry using byDataType priority chain
resolve_by_data_type <- function(entry, data_structure_role) {
  if (is.null(entry) || is.null(entry$byDataType)) return(NULL)
  by_type <- entry$byDataType
  if (identical(data_structure_role, "measure")) {
    by_type$decimal %||% by_type$baseline %||% by_type$code %||% by_type$string
  } else {
    by_type$code %||% by_type$string %||% by_type$decimal
  }
}

# ---------------------------------------------------------------------------
# Derivation chain execution (pre-analysis dataset mutation)
# ---------------------------------------------------------------------------

#' Apply a chain of derivation transformations to the dataset.
#' Each derivation mutates the dataset in place (adds/modifies columns).
#' Derivations run BEFORE the analysis method, in the order specified.
apply_derivations <- function(dataset, derivations, r_impls, unit_conversions,
                              all_mappings) {
  if (is.null(derivations) || length(derivations) == 0) return(dataset)

  for (deriv in derivations) {
    method_oid <- deriv$method$oid %||% deriv$usesMethod
    cat("  Derivation:", method_oid, "\n")

    # Per-derivation store and domain — user-specified in Step 6
    deriv_store <- deriv$sourceStore
    deriv_domain <- deriv$sourceDomain
    if (is.null(deriv_store)) stop("Derivation missing sourceStore - configure in Step 6")
    deriv_mappings <- all_mappings[[deriv_store]]
    if (is.null(deriv_mappings)) stop(paste0("No mappings found for store '", deriv_store, "'"))
    cat("    Store:", deriv_store, " Domain:", deriv_domain %||% "(none)", "\n")

    # Find R implementation for this derivation method
    impl <- NULL
    for (ri in r_impls) {
      if (identical(ri$methodOid, method_oid) && identical(ri$language, "R")) {
        impl <- ri; break
      }
    }
    if (is.null(impl)) {
      avail <- paste(sapply(r_impls, function(ri) paste0(ri$methodOid, "/", ri$language)), collapse = ", ")
      stop(paste0("No R implementation found for '", method_oid, "'. Available: [", avail, "]"))
    }

    # Resolve ALL bindings (including outputs) for column name mapping
    var_map <- build_concept_var_map(
      deriv$resolvedBindings, deriv_mappings, NULL, deriv_domain, include_outputs = TRUE
    )
    cat("    Bindings:\n")
    for (nm in names(var_map$by_role)) {
      cat("      ", nm, "->", var_map$by_role[[nm]], "\n")
    }

    # Parse derivation configs (target_unit, precision, etc.)
    configs <- list()
    if (!is.null(deriv$configurationValues)) {
      for (cv in deriv$configurationValues) {
        val <- cv$value
        num_val <- suppressWarnings(as.numeric(val))
        if (!is.na(num_val)) val <- num_val
        configs[[cv$name]] <- val
      }
    }

    # Resolve placeholders in callTemplate
    resolved_code <- resolve_call_template(impl$callTemplate, var_map$by_role, configs)
    cat("    Resolved derivation code:\n")
    cat(paste0("      ", strsplit(resolved_code, "\n")[[1]]), sep = "\n")

    # Execute in sandbox with concept_data + unit_conversions bound
    env <- new.env(parent = globalenv())
    env$concept_data <- dataset
    env$unit_conversions <- unit_conversions
    eval(parse(text = resolved_code), envir = env)
    dataset <- env$concept_data
  }

  return(dataset)
}

#' Map derivation output columns from source store to ADaM aliases.
#' For each output binding (direction=output, qualifierType=facet), resolves
#' the source column name (using per-derivation sourceStore/sourceDomain)
#' and the ADaM column name (where the analysis expects to read), then creates the alias.
present_derivation_outputs <- function(dataset, derivations, all_mappings, adam_mappings) {
  if (is.null(adam_mappings)) return(dataset)

  for (deriv in derivations) {
    deriv_store <- deriv$sourceStore
    deriv_domain <- deriv$sourceDomain
    source_mappings <- if (!is.null(deriv_store)) all_mappings[[deriv_store]] else adam_mappings

    for (b in deriv$resolvedBindings) {
      if (!identical(b$direction, "output")) next
      if (!identical(b$qualifierType, "facet") || is.null(b$qualifierValue)) next

      concept <- b$concept
      facet <- b$qualifierValue

      # Resolve source column name (where derivation wrote)
      src_entry <- source_mappings$concepts[[concept]]
      if (is.null(src_entry) || is.null(src_entry$facets)) next
      src_col <- NULL
      for (fn in names(src_entry$facets)) {
        if (tolower(fn) == tolower(facet)) { src_col <- src_entry$facets[[fn]]; break }
      }
      if (is.null(src_col)) next
      if (!is.null(deriv_domain) && grepl("^--", src_col)) {
        src_col <- sub("^--", deriv_domain, src_col)
      }

      # Resolve ADaM column name (where analysis expects to read)
      adam_entry <- adam_mappings$concepts[[concept]]
      if (is.null(adam_entry) || is.null(adam_entry$facets)) next
      adam_col <- NULL
      for (fn in names(adam_entry$facets)) {
        if (tolower(fn) == tolower(facet)) { adam_col <- adam_entry$facets[[fn]]; break }
      }
      if (is.null(adam_col)) next

      # Create ADaM alias if source column exists
      if (src_col %in% colnames(dataset) && !(adam_col %in% colnames(dataset))) {
        dataset[[adam_col]] <- dataset[[src_col]]
        cat("    Present:", src_col, "->", adam_col, "\n")
      }
    }
  }

  return(dataset)
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
  # 1. Load defaults from method-level configurations
  if (!is.null(method_def) && !is.null(method_def$configurations)) {
    for (cfg in method_def$configurations) {
      if (!is.null(cfg$defaultValue)) {
        configs[[cfg$name]] <- cfg$defaultValue
      }
    }
  }
  # 1b. Load defaults from output_class-level configurations (e.g., multiplicity_adjustment)
  if (!is.null(method_def$output_specification) &&
      !is.null(method_def$output_specification$output_classes)) {
    for (oc in method_def$output_specification$output_classes) {
      if (!is.null(oc$configurations)) {
        for (cfg in oc$configurations) {
          if (!is.null(cfg$defaultValue) && is.null(configs[[cfg$name]])) {
            configs[[cfg$name]] <- cfg$defaultValue
          }
        }
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
# Output configuration — pre-process callTemplate for dimension selection
# ---------------------------------------------------------------------------

#' Narrow <fixed_effect> in post-hoc lines of a callTemplate based on
#' outputConfiguration.  The model formula keeps ALL fixed effects (correct
#' for estimation), but post-hoc lines use only the selected ones.
#'
#' Identification is metadata-driven: the model formula line is the one
#' containing <response> (the dependent variable placeholder).  All other
#' lines with <fixed_effect> are post-hoc lines whose factors should be
#' narrowed to the user's selection.
narrow_template_for_output_config <- function(template, output_config, concept_vars) {
  if (is.null(output_config) || length(output_config) == 0) return(template)

  # Find the first output class with a dimension selection
  # (ls_means/contrasts share the same factors in current templates)
  oc <- Find(function(x) !is.null(x$selectedDimensions) && length(x$selectedDimensions) > 0,
             output_config)
  if (is.null(oc)) return(template)

  selected <- oc$selectedDimensions

  # Resolve selected concept names → ADaM variable names
  concept_to_var <- concept_vars$by_concept
  main_vars <- character(0)
  for (s in selected) {
    if (grepl(":", s)) next  # Skip interaction concepts for emmeans formula
    var <- concept_to_var[[s]]
    if (!is.null(var)) main_vars <- c(main_vars, var)
  }
  if (length(main_vars) == 0) return(template)

  narrowed_value <- paste(main_vars, collapse = " + ")

  # Narrow <fixed_effect> only in POST-HOC lines (after the model formula).
  # The model formula line contains <response> — everything before and including
  # it is model-related (e.g., SAS CLASS, R lm(), MODEL statements).
  # Everything after is post-hoc (emmeans, LSMEANS, pairs, ESTIMATE, etc.).
  lines <- strsplit(template, "\n")[[1]]
  model_line <- which(grepl("<response>", lines, fixed = TRUE))[1]
  if (is.na(model_line)) model_line <- 0L
  for (i in seq_along(lines)) {
    if (i > model_line && grepl("<fixed_effect>", lines[i], fixed = TRUE)) {
      lines[i] <- gsub("<fixed_effect>", narrowed_value, lines[i], fixed = TRUE)
    }
  }

  return(paste(lines, collapse = "\n"))
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

  # Resolved call template (already narrowed by output config if applicable)
  lines <- c(lines, "# --- Execute (from r_implementations.json callTemplate) ---")
  resolved_call <- resolve_call_template(r_impl$callTemplate, concept_vars$by_role, configs)
  lines <- c(lines, strsplit(resolved_call, "\n")[[1]])

  return(paste(lines, collapse = "\n"))
}
