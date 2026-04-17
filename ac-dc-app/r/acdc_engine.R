# ===========================================================================
# AC/DC Generic Execution Engine  —  Concept-Keyed Architecture
#
# A fully metadata-driven R engine. Internally, all data uses concept keys
# as column names (e.g., Observation.Result.Value, Subject, Treatment).
# Store-specific column names (SDTM, ADaM, OMOP, FHIR) appear only at
# the load boundary (ingest_to_concepts) and the display boundary
# (present_as_store).
#
# It reads:
#   - Specification JSON (what to analyze: bindings, slices, formula)
#   - Concept-variable mappings (concept → store column, for boundaries)
#   - Method definition (formula notation, output_specification)
#   - R implementation catalog (callTemplate, outputMapping)
#
# NO method-specific logic is hardcoded. Adding a new method requires
# only a method JSON + r_implementations.json entry — zero engine changes.
# ===========================================================================

`%||%` <- function(x, y) if (is.null(x)) y else x

# ---------------------------------------------------------------------------
# Facet case normalization: "result.value" → "Result.Value"
# Ensures concept keys from bindings match the canonical form from ingest.
# ---------------------------------------------------------------------------

normalize_facet_case <- function(facet_value) {
  parts <- strsplit(facet_value, "\\.")[[1]]
  parts <- paste0(toupper(substring(parts, 1, 1)), substring(parts, 2))
  paste(parts, collapse = ".")
}

# ---------------------------------------------------------------------------
# Store auto-detection: find which store's mappings best match the dataset
# ---------------------------------------------------------------------------

#' Detect the correct store (sdtm, adam, omop, fhir) by counting how many
#' dataset columns match each store's mappings. Returns the best-matching
#' store name, its mappings, and the domain_code (for SDTM).
detect_store <- function(dataset, all_mappings, spec) {
  if (is.null(all_mappings)) return(list(store = "adam", mappings = NULL,
                                          domain_code = NULL, match_count = 0))
  ds_cols <- colnames(dataset)
  best <- list(store = NULL, count = 0, mappings = NULL, domain = NULL)

  for (store_name in names(all_mappings)) {
    sm <- all_mappings[[store_name]]
    if (is.null(sm)) next

    # For SDTM: detect domain code from column prefixes.
    # SDTM mappings use "--" placeholders (--ORRES, --TESTCD).
    # If dataset has "VSORRES" and mapping has "--ORRES", domain = "VS".
    domain_code <- NULL
    if (identical(store_name, "sdtm")) {
      domain_code <- .detect_sdtm_domain(ds_cols, sm)
    }

    count <- .count_column_matches(ds_cols, sm, domain_code)
    if (count > best$count) {
      best <- list(store = store_name, count = count, mappings = sm, domain = domain_code)
    }
  }

  list(store = best$store %||% "adam",
       mappings = best$mappings %||% all_mappings$adam,
       domain_code = best$domain,
       match_count = best$count)
}

# Detect SDTM domain code by matching "--" suffixes against dataset column prefixes.
# E.g., mapping "--ORRES" + column "VSORRES" → domain "VS".
.detect_sdtm_domain <- function(ds_cols, store_mappings) {
  suffixes <- character(0)
  if (!is.null(store_mappings$concepts)) {
    for (entry in store_mappings$concepts) {
      if (is.null(entry$facets)) next
      for (col in entry$facets) {
        if (grepl("^--", col)) suffixes <- c(suffixes, sub("^--", "", col))
      }
    }
  }
  if (!is.null(store_mappings$dimensions)) {
    for (entry in store_mappings$dimensions) {
      if (is.null(entry$byDataType)) next
      for (col in entry$byDataType) {
        if (grepl("^--", col)) suffixes <- c(suffixes, sub("^--", "", col))
      }
    }
  }
  # Try each suffix against dataset columns to find the 2-char domain prefix.
  # SDTM domain codes are exactly 2 characters (VS, LB, EG, AE, DM, etc.).
  for (suffix in unique(suffixes)) {
    pattern <- paste0("^([A-Z]{2})", suffix, "$")
    for (ds_col in ds_cols) {
      m <- regmatches(ds_col, regexec(pattern, ds_col))[[1]]
      if (length(m) == 2) return(m[2])
    }
  }
  NULL
}

# Count how many dataset columns match a store's mappings.
.count_column_matches <- function(ds_cols, store_mappings, domain_code) {
  count <- 0L
  if (!is.null(store_mappings$dimensions)) {
    for (dim_entry in store_mappings$dimensions) {
      if (is.null(dim_entry$byDataType)) next
      for (col in dim_entry$byDataType) {
        if (!is.null(domain_code) && grepl("^--", col)) col <- sub("^--", domain_code, col)
        if (col %in% ds_cols) count <- count + 1L
      }
    }
  }
  if (!is.null(store_mappings$concepts)) {
    for (concept_entry in store_mappings$concepts) {
      if (!is.null(concept_entry$facets)) {
        for (col in concept_entry$facets) {
          if (!is.null(domain_code) && grepl("^--", col)) col <- sub("^--", domain_code, col)
          if (col %in% ds_cols) count <- count + 1L
        }
      } else if (!is.null(concept_entry$byDataType)) {
        for (col in concept_entry$byDataType) {
          if (!is.null(domain_code) && grepl("^--", col)) col <- sub("^--", domain_code, col)
          if (col %in% ds_cols) count <- count + 1L
        }
      }
    }
  }
  count
}

# ---------------------------------------------------------------------------
# Load boundary: store-specific columns → concept keys
# ---------------------------------------------------------------------------

#' Rename dataset columns from store-specific names to concept keys.
#' Dimensions get primary naming (e.g., VSTESTCD → Parameter).
#' Concept facets get secondary naming (e.g., VSORRES → Observation.Result.Value).
#' When a column maps to both a dimension and a facet, the dimension name is
#' primary and the facet is added as an alias (column copy).
ingest_to_concepts <- function(dataset, store_mappings, domain_code = NULL) {
  rename_map <- list()   # store_col → concept_key
  alias_map  <- list()   # concept_key → source concept_key (for dual-identity)

  # 1. Process dimensions — primary naming
  #    String-first priority matches constraint filtering: cube constraints
  #    use label values (e.g., "Height (cm)") which live in string columns
  #    (PARAM, TRTA), not code columns (PARAMCD, TRTP).
  if (!is.null(store_mappings$dimensions)) {
    for (dim_name in names(store_mappings$dimensions)) {
      dim_entry <- store_mappings$dimensions[[dim_name]]
      if (is.null(dim_entry$byDataType)) next

      # Pick primary variable: string > code > id > decimal > integer
      primary_types <- c("string", "code", "id", "decimal", "integer")
      for (dtype in primary_types) {
        store_col <- dim_entry$byDataType[[dtype]]
        if (!is.null(store_col)) {
          if (!is.null(domain_code) && grepl("^--", store_col)) {
            store_col <- sub("^--", domain_code, store_col)
          }
          if (is.null(rename_map[[store_col]])) {
            rename_map[[store_col]] <- dim_name
          }
          break
        }
      }
    }
  }

  # 2. Process concept facets — secondary naming
  if (!is.null(store_mappings$concepts)) {
    for (concept_name in names(store_mappings$concepts)) {
      concept_entry <- store_mappings$concepts[[concept_name]]
      if (is.null(concept_entry$facets)) next

      for (facet_name in names(concept_entry$facets)) {
        store_col <- concept_entry$facets[[facet_name]]
        if (is.null(store_col)) next

        if (!is.null(domain_code) && grepl("^--", store_col)) {
          store_col <- sub("^--", domain_code, store_col)
        }

        concept_key <- paste0(concept_name, ".", facet_name)

        if (!is.null(rename_map[[store_col]])) {
          # Column already claimed by a dimension — add as alias
          alias_map[[concept_key]] <- rename_map[[store_col]]
        } else {
          rename_map[[store_col]] <- concept_key
        }
      }
    }
  }

  # 2b. Process concepts without facets but with byDataType
  #     Simple concepts like Change, PercentChange map a single column to
  #     the concept name (e.g., CHG → Change).
  if (!is.null(store_mappings$concepts)) {
    for (concept_name in names(store_mappings$concepts)) {
      concept_entry <- store_mappings$concepts[[concept_name]]
      if (!is.null(concept_entry$facets)) next
      if (is.null(concept_entry$byDataType)) next

      primary_types <- c("decimal", "integer", "string", "code", "id")
      for (dtype in primary_types) {
        store_col <- concept_entry$byDataType[[dtype]]
        if (!is.null(store_col)) {
          if (!is.null(domain_code) && grepl("^--", store_col)) {
            store_col <- sub("^--", domain_code, store_col)
          }
          if (!is.null(rename_map[[store_col]])) {
            alias_map[[concept_name]] <- rename_map[[store_col]]
          } else {
            rename_map[[store_col]] <- concept_name
          }
          break
        }
      }
    }
  }

  # 3. Rename columns
  col_names <- colnames(dataset)
  for (i in seq_along(col_names)) {
    new_name <- rename_map[[col_names[i]]]
    if (!is.null(new_name)) {
      col_names[i] <- new_name
    }
  }
  colnames(dataset) <- col_names

  # 4. Create alias columns for dual-identity entries
  for (alias_key in names(alias_map)) {
    source_key <- alias_map[[alias_key]]
    if (source_key %in% colnames(dataset)) {
      dataset[[alias_key]] <- dataset[[source_key]]
    }
  }

  cat("  Ingest column mapping:\n")
  for (store_col in names(rename_map)) {
    cat("    ", store_col, "→", rename_map[[store_col]], "\n")
  }
  if (length(alias_map) > 0) {
    cat("  Aliases (dual-identity):\n")
    for (ak in names(alias_map)) {
      cat("    ", ak, "← copy of", alias_map[[ak]], "\n")
    }
  }

  return(dataset)
}

# ---------------------------------------------------------------------------
# Present boundary: concept keys → store-specific columns
# ---------------------------------------------------------------------------

#' Rename concept-keyed columns back to store-specific names for display.
#' Inverse of ingest_to_concepts.
present_as_store <- function(dataset, store_mappings, domain_code = NULL) {
  forward_map <- list()

  # Dimensions (string-first priority, matching ingest_to_concepts)
  if (!is.null(store_mappings$dimensions)) {
    for (dim_name in names(store_mappings$dimensions)) {
      dim_entry <- store_mappings$dimensions[[dim_name]]
      if (is.null(dim_entry$byDataType)) next
      primary_types <- c("string", "code", "id", "decimal", "integer")
      for (dtype in primary_types) {
        store_col <- dim_entry$byDataType[[dtype]]
        if (!is.null(store_col)) {
          if (!is.null(domain_code) && grepl("^--", store_col)) {
            store_col <- sub("^--", domain_code, store_col)
          }
          forward_map[[dim_name]] <- store_col
          break
        }
      }
    }
  }

  # Concept facets
  if (!is.null(store_mappings$concepts)) {
    for (concept_name in names(store_mappings$concepts)) {
      concept_entry <- store_mappings$concepts[[concept_name]]
      if (is.null(concept_entry$facets)) next
      for (facet_name in names(concept_entry$facets)) {
        store_col <- concept_entry$facets[[facet_name]]
        if (is.null(store_col)) next
        if (!is.null(domain_code) && grepl("^--", store_col)) {
          store_col <- sub("^--", domain_code, store_col)
        }
        concept_key <- paste0(concept_name, ".", facet_name)
        forward_map[[concept_key]] <- store_col
      }
    }
  }

  # Concepts without facets (Change → CHG, PercentChange → PCHG, etc.)
  if (!is.null(store_mappings$concepts)) {
    for (concept_name in names(store_mappings$concepts)) {
      concept_entry <- store_mappings$concepts[[concept_name]]
      if (!is.null(concept_entry$facets)) next
      if (is.null(concept_entry$byDataType)) next
      primary_types <- c("decimal", "integer", "string", "code", "id")
      for (dtype in primary_types) {
        store_col <- concept_entry$byDataType[[dtype]]
        if (!is.null(store_col)) {
          if (!is.null(domain_code) && grepl("^--", store_col)) {
            store_col <- sub("^--", domain_code, store_col)
          }
          forward_map[[concept_name]] <- store_col
          break
        }
      }
    }
  }

  # Rename columns
  col_names <- colnames(dataset)
  for (i in seq_along(col_names)) {
    new_name <- forward_map[[col_names[i]]]
    if (!is.null(new_name)) {
      col_names[i] <- new_name
    }
  }
  colnames(dataset) <- col_names

  return(dataset)
}

# ---------------------------------------------------------------------------
# Derivation-only execution (diagnostic mode)
# Runs ingest + derivation chain without the analysis method.
# Returns column diagnostics so you can see what the derivation produced.
# ---------------------------------------------------------------------------

acdc_derive_only <- function(spec, mappings, dataset,
                              derivations = NULL, unit_conversions = NULL, r_impls = NULL,
                              all_mappings = NULL, available_datasets = NULL) {
  # Strip haven labels
  dataset <- as.data.frame(lapply(dataset, function(col) {
    if (inherits(col, "haven_labelled")) as.vector(col) else col
  }))

  original_cols <- colnames(dataset)

  # Ingest — auto-detect store from dataset columns
  detected <- detect_store(dataset, all_mappings, spec)
  source_mappings <- detected$mappings %||% mappings
  domain_code <- detected$domain_code

  dataset <- ingest_to_concepts(dataset, source_mappings, domain_code)
  ingested_cols <- colnames(dataset)

  # Run derivation chain
  derived_cols <- ingested_cols
  deriv_log <- list()
  if (!is.null(derivations) && length(derivations) > 0) {
    for (i in seq_along(derivations)) {
      deriv <- derivations[[i]]
      method_oid <- deriv$method$oid %||% deriv$usesMethod

      # Apply derivation-specific constraints (BC Topic decode from JS)
      if (!is.null(deriv$constraintValues) && length(deriv$constraintValues) > 0) {
        for (cv in deriv$constraintValues) {
          col <- cv$dimension; val <- cv$value
          if (!is.null(col) && !is.null(val) && col %in% colnames(dataset)) {
            dataset <- dataset[dataset[[col]] == val, , drop = FALSE]
          }
        }
      }

      var_map <- build_concept_var_map(deriv$resolvedBindings, include_outputs = TRUE)
      configs <- list()
      if (!is.null(deriv$configurationValues)) {
        for (cv in deriv$configurationValues) {
          val <- cv$value
          num_val <- suppressWarnings(as.numeric(val))
          if (!is.na(num_val)) val <- num_val
          configs[[cv$name]] <- val
        }
      }
      impl <- NULL
      for (ri in r_impls) {
        if (identical(ri$methodOid, method_oid) && identical(ri$language, "R")) {
          impl <- ri; break
        }
      }
      if (is.null(impl)) {
        deriv_log[[i]] <- list(method = method_oid, status = "ERROR: no R impl found")
        next
      }
      resolved_code <- resolve_call_template(impl$callTemplate, var_map$by_role, configs)

      env <- new.env(parent = globalenv())
      env$concept_data <- dataset
      env$unit_conversions <- unit_conversions
      tryCatch({
        eval(parse(text = resolved_code), envir = env)
        dataset <- env$concept_data
        new_cols <- setdiff(colnames(dataset), derived_cols)
        deriv_log[[i]] <- list(method = method_oid, status = "OK",
          roles = var_map$by_role, configs = configs,
          new_columns = new_cols,
          sample = if (length(new_cols) > 0)
            lapply(new_cols, function(c) utils::head(dataset[[c]], 5)) else list())
        derived_cols <- colnames(dataset)
      }, error = function(e) {
        deriv_log[[i]] <<- list(method = method_oid, status = paste("ERROR:", e$message),
          roles = var_map$by_role, configs = configs,
          columns_at_failure = colnames(dataset))
      })
    }
  }

  # Dimension enrichment — merge missing dimensions from other loaded datasets
  enriched_dims <- character(0)
  if (!is.null(available_datasets) && length(available_datasets) > 0 &&
      !is.null(derivations) && length(derivations) > 0) {
    # Gather all dimension bindings from all derivations
    all_bindings <- list()
    for (deriv in derivations) {
      all_bindings <- c(all_bindings, deriv$resolvedBindings)
    }
    pre_enrich_cols <- colnames(dataset)
    primary_name <- tolower(spec$targetDataset %||% "")
    dataset <- enrich_dimensions(dataset, all_bindings, all_mappings,
                                  available_datasets, primary_name)
    enriched_dims <- setdiff(colnames(dataset), pre_enrich_cols)
  }

  # Build a data preview (first 10 rows, all columns as character for JSON safety)
  preview_rows <- min(10L, nrow(dataset))
  preview <- as.data.frame(lapply(utils::head(dataset, preview_rows), function(col) {
    if (is.numeric(col)) round(col, 4) else as.character(col)
  }), stringsAsFactors = FALSE)

  list(
    detected_store = detected$store,
    domain_code = detected$domain_code,
    match_count = detected$match_count,
    original_columns = original_cols,
    ingested_columns = ingested_cols,
    final_columns = colnames(dataset),
    nrow = nrow(dataset),
    derivation_log = deriv_log,
    enriched_dimensions = enriched_dims,
    data_preview = preview
  )
}

# ---------------------------------------------------------------------------
# Dimension enrichment: merge missing dimensions from other loaded datasets
# ---------------------------------------------------------------------------

#' When the primary dataset is missing required dimensions (e.g., Treatment
#' not in VS), scan other loaded datasets (e.g., DM) and merge by Subject.
enrich_dimensions <- function(dataset, bindings, all_mappings, available_datasets,
                               primary_ds_name = NULL) {
  # Find which dimension concepts are needed but missing
  # Skip constraint bindings — those filter, not enrich
  needed_dims <- character(0)
  for (b in bindings) {
    if (identical(b$direction, "output")) next
    if (!identical(b$dataStructureRole, "dimension")) next
    if (identical(b$methodRole, "constraint")) next
    concept <- b$concept
    if (is.null(concept) || concept == "") next
    # Use bare concept name for dimensions (not facet-qualified)
    if (!(concept %in% colnames(dataset))) {
      needed_dims <- c(needed_dims, concept)
    }
  }
  needed_dims <- unique(needed_dims)
  if (length(needed_dims) == 0) return(dataset)
  cat("  Missing dimensions:", paste(needed_dims, collapse = ", "), "\n")

  # Scan other loaded datasets for matching dimensions
  for (ds_name in available_datasets) {
    if (identical(ds_name, primary_ds_name)) next
    aux <- tryCatch(get(ds_name, envir = globalenv()), error = function(e) NULL)
    if (is.null(aux) || !is.data.frame(aux)) next

    # Strip haven labels
    aux <- as.data.frame(lapply(aux, function(col) {
      if (inherits(col, "haven_labelled")) as.vector(col) else col
    }))

    # Auto-detect store and ingest to concept keys
    detected <- detect_store(aux, all_mappings, list(targetDataset = ds_name))
    if (is.null(detected$mappings)) next
    aux <- ingest_to_concepts(aux, detected$mappings, detected$domain_code)

    # Check if any needed dimension is now in this auxiliary dataset
    found <- intersect(needed_dims, colnames(aux))
    if (length(found) > 0 && "Subject" %in% colnames(aux) && "Subject" %in% colnames(dataset)) {
      merge_cols <- unique(c("Subject", found))
      aux_subset <- unique(aux[, merge_cols, drop = FALSE])
      dataset <- merge(dataset, aux_subset, by = "Subject", all.x = TRUE)
      cat("  Enriched from '", ds_name, "':", paste(found, collapse = ", "), "\n")
      needed_dims <- setdiff(needed_dims, found)
    }
    if (length(needed_dims) == 0) break
  }

  if (length(needed_dims) > 0) {
    cat("  Warning: dimensions still missing:", paste(needed_dims, collapse = ", "), "\n")
  }
  dataset
}

# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

acdc_execute <- function(spec, mappings, dataset, overrides = NULL,
                         method_def = NULL, r_impl = NULL,
                         derivations = NULL, unit_conversions = NULL, r_impls = NULL,
                         all_mappings = NULL, available_datasets = NULL) {
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

  # 1. INGEST — rename store-specific columns to concept keys
  #    Auto-detect the store from dataset columns (SDTM vs ADaM vs OMOP vs FHIR).
  detected <- detect_store(dataset, all_mappings, spec)
  source_store <- detected$store
  source_mappings <- detected$mappings %||% mappings
  domain_code <- detected$domain_code
  cat("  Detected store:", source_store, "(", detected$match_count, "column matches)\n")
  dataset <- ingest_to_concepts(dataset, source_mappings, domain_code)

  cat("  Post-ingest columns:", paste(colnames(dataset), collapse = ", "), "\n")

  # 2. Apply derivation chain FIRST (each derivation has its own concept-level
  #    input cube via constraintValues). Derivations transform the full dataset
  #    before the analysis cube filters it.
  if (!is.null(derivations) && length(derivations) > 0) {
    cat("  Applying", length(derivations), "derivation(s) before analysis cube...\n")
    dataset <- tryCatch(
      apply_derivations(dataset, derivations, r_impls, unit_conversions),
      error = function(e) stop(paste0("[Step 2 apply_derivations] ", e$message,
        "\n  Columns before: ", paste(colnames(dataset), collapse=", ")))
    )
    cat("  Post-derivation:", nrow(dataset), "rows x", ncol(dataset), "cols\n")
  }

  # 3. Enrich missing dimensions from other loaded datasets (e.g., Treatment from DM)
  if (!is.null(available_datasets) && length(available_datasets) > 0) {
    primary_name <- tolower(spec$targetDataset %||% "")
    dataset <- enrich_dimensions(
      dataset, analysis$resolvedBindings, all_mappings,
      available_datasets, primary_name
    )
  }

  # 4. Resolve analysis bindings to concept keys
  concept_vars <- build_concept_var_map(analysis$resolvedBindings, source_mappings, overrides)
  cat("  Concept → Column:\n")
  for (nm in names(concept_vars$by_concept)) {
    cat("    ", nm, "→", concept_vars$by_concept[[nm]], "\n")
  }
  cat("  Role → Column:\n")
  for (nm in names(concept_vars$by_role)) {
    cat("    ", nm, "→", paste(concept_vars$by_role[[nm]], collapse = ", "), "\n")
  }

  # 5. Execute analysis cube: query each slice, join by common dimensions
  analysis_data <- tryCatch(
    execute_cube(dataset, analysis$resolvedBindings, analysis$resolvedSlices,
                 concept_vars, overrides),
    error = function(e) stop(paste0("[Step 5 execute_cube] ", e$message,
      "\n  Columns: ", paste(colnames(dataset), collapse=", ")))
  )
  cat("  Analysis data:", nrow(analysis_data), "rows x", ncol(analysis_data), "cols\n")

  # 6. Coerce column types based on dataStructureRole (measure → numeric, dimension → factor)
  analysis_data <- tryCatch(
    coerce_types(analysis_data, analysis$resolvedBindings, concept_vars$by_concept),
    error = function(e) stop(paste0("[Step 6 coerce_types] ", e$message,
      "\n  Columns: ", paste(colnames(analysis_data), collapse=", "),
      "\n  by_concept keys: ", paste(names(concept_vars$by_concept), collapse=", ")))
  )

  # 7. Parse method configurations (defaults from method_def, overridden by user values)
  configs <- parse_configs(analysis$configurationValues, method_def)

  # 8. Pre-process callTemplate for output dimension selection
  narrowed_impl <- r_impl
  narrowed_impl$callTemplate <- narrow_template_for_output_config(
    r_impl$callTemplate, analysis$outputConfiguration, concept_vars
  )

  # 9. Execute method using r_implementations.json metadata
  result <- tryCatch(
    execute_method(analysis_data, concept_vars$by_role, configs, narrowed_impl),
    error = function(e) stop(paste0("[Step 9 execute_method] ", e$message,
      "\n  Columns: ", paste(colnames(analysis_data), collapse=", "),
      "\n  Roles: ", paste(names(concept_vars$by_role), "→",
        sapply(concept_vars$by_role, paste, collapse="+"), collapse=", ")))
  )

  # 10. Build resolved R code from what was actually executed
  result$resolved_code <- build_resolved_code(
    narrowed_impl, concept_vars, configs,
    analysis$resolvedSlices, analysis$resolvedBindings
  )

  return(result)
}

# ---------------------------------------------------------------------------
# Variable resolution: method role → concept key
# In concept-keyed mode, the concept key IS the column name in the dataframe.
# ---------------------------------------------------------------------------

build_concept_var_map <- function(bindings, mappings = NULL, overrides = NULL,
                                  include_outputs = FALSE) {
  by_concept <- list()
  by_role <- list()

  for (b in bindings) {
    if (identical(b$direction, "output") && !include_outputs) next
    role <- b$methodRole
    concept <- b$concept
    if (is.null(concept) || concept == "") next

    # Build concept key from concept + qualifier
    if (identical(b$qualifierType, "facet") && !is.null(b$qualifierValue)) {
      concept_key <- paste0(concept, ".", normalize_facet_case(b$qualifierValue))
    } else if (!is.null(mappings) && !is.null(mappings$concepts[[concept]])) {
      # No facet qualifier, but concept has facets in mappings —
      # resolve to the appropriate facet based on dataStructureRole.
      # Analysis bindings often say just "Measure" without specifying the facet;
      # we infer Result.Value for measures, Result.Unit for attributes.
      entry <- mappings$concepts[[concept]]
      if (!is.null(entry$facets)) {
        target_facet <- NULL
        if (identical(b$dataStructureRole, "measure")) {
          target_facet <- "Result.Value"
        } else if (identical(b$dataStructureRole, "attribute")) {
          target_facet <- "Result.Unit"
        }
        if (!is.null(target_facet) && !is.null(entry$facets[[target_facet]])) {
          concept_key <- paste0(concept, ".", target_facet)
        } else {
          concept_key <- concept
        }
      } else {
        concept_key <- concept
      }
    } else {
      concept_key <- concept
    }

    # Strip @ suffix for storage key
    storage_key <- sub("@.*", "", concept_key)

    # User override takes precedence over concept key
    if (!is.null(overrides) && !is.null(overrides[[concept_key]])) {
      var_name <- overrides[[concept_key]]
    } else if (!is.null(overrides) && !is.null(overrides[[concept]])) {
      var_name <- overrides[[concept]]
    } else {
      var_name <- concept_key
    }

    # Key by full concept key (e.g., Measure.Result.Value) not just concept name
    by_concept[[storage_key]] <- var_name

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
# Derivation chain execution (pre-analysis dataset mutation)
# ---------------------------------------------------------------------------

#' Apply a chain of derivation transformations to the dataset.
#' Each derivation mutates the dataset in place (adds/modifies columns).
#' Derivations run BEFORE the analysis method, in the order specified.
#' Data is concept-keyed — no store-specific resolution needed.
apply_derivations <- function(dataset, derivations, r_impls, unit_conversions) {
  if (is.null(derivations) || length(derivations) == 0) return(dataset)

  for (deriv in derivations) {
    method_oid <- deriv$method$oid %||% deriv$usesMethod
    cat("  Derivation:", method_oid, "\n")

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

    # Apply derivation-specific constraints from JS (BC-derived)
    # Uses tolerant matching: exact → case-insensitive → partial (startsWith)
    if (!is.null(deriv$constraintValues) && length(deriv$constraintValues) > 0) {
      for (cv in deriv$constraintValues) {
        col <- cv$dimension
        val <- cv$value
        if (!is.null(col) && !is.null(val) && col %in% colnames(dataset)) {
          pre_n <- nrow(dataset)
          filtered <- dataset[dataset[[col]] == val, , drop = FALSE]
          if (nrow(filtered) > 0) {
            dataset <- filtered
          } else {
            # Case-insensitive fallback
            filtered <- dataset[tolower(dataset[[col]]) == tolower(val), , drop = FALSE]
            if (nrow(filtered) > 0) {
              dataset <- filtered
              cat("    Constraint:", col, "~=", val, "(case-insensitive)")
            } else {
              # Partial match: "Weight" matches "Weight (kg)" etc.
              lv <- tolower(val)
              lc <- tolower(dataset[[col]])
              filtered <- dataset[startsWith(lc, lv) | startsWith(lv, lc), , drop = FALSE]
              if (nrow(filtered) > 0) {
                dataset <- filtered
                cat("    Constraint:", col, "~", val, "(partial)")
              }
            }
          }
          cat("    Constraint:", col, "==", val, "→", nrow(dataset), "of", pre_n, "rows\n")
        }
      }
    }

    # Resolve bindings to concept keys (including outputs)
    var_map <- build_concept_var_map(deriv$resolvedBindings, include_outputs = TRUE)
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
    tryCatch(
      eval(parse(text = resolved_code), envir = env),
      error = function(e) {
        stop(paste0("Derivation ", method_oid, " failed: ", e$message,
          "\n  concept_data columns: ", paste(colnames(dataset), collapse=", "),
          "\n  concept_data nrow: ", nrow(dataset),
          "\n  Roles resolved: ", paste(names(var_map$by_role), "→",
            sapply(var_map$by_role, paste, collapse="+"), collapse="; ")))
      }
    )
    dataset <- env$concept_data
  }

  return(dataset)
}

# ---------------------------------------------------------------------------
# Cube execution: query each slice, join by common dimensions
# ---------------------------------------------------------------------------

execute_cube <- function(dataset, bindings, slices, concept_vars, overrides = NULL) {
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

  # Query default slice — dimension names are column names in concept-keyed data
  default_constraints <- slice_lookup[[default_slice_name]]
  main_data <- filter_by_constraints(dataset, default_constraints, overrides)
  cat("  Default slice '", default_slice_name, "':", nrow(main_data), "rows\n")

  # For each binding with a different slice, query and join
  for (b in bindings) {
    slice_name <- b$slice
    if (is.null(slice_name) || slice_name == "" || slice_name == default_slice_name) next
    if (identical(b$direction, "output")) next

    # Build full concept key for lookup in by_concept map
    raw_concept <- sub("@.*", "", b$concept %||% "")
    if (identical(b$qualifierType, "facet") && !is.null(b$qualifierValue)) {
      concept_key <- paste0(raw_concept, ".", normalize_facet_case(b$qualifierValue))
    } else {
      concept_key <- raw_concept
    }
    concept_col <- concept_vars$by_concept[[concept_key]]
    if (is.null(concept_col)) next

    constraints <- slice_lookup[[slice_name]]
    if (is.null(constraints)) next

    slice_data <- filter_by_constraints(dataset, constraints, overrides)
    cat("  Slice '", slice_name, "':", nrow(slice_data), "rows → column", concept_col, "\n")

    col_name <- paste0(concept_col, "_", slice_name)
    if (concept_col %in% colnames(slice_data)) {
      common_cols <- intersect(colnames(main_data), colnames(slice_data))
      join_keys <- setdiff(common_cols, concept_col)

      if (length(join_keys) > 0) {
        keep_cols <- unique(c(join_keys, concept_col))
        slice_subset <- slice_data[, keep_cols, drop = FALSE]
        slice_subset <- slice_subset[!duplicated(slice_subset[, join_keys, drop = FALSE]), , drop = FALSE]
        colnames(slice_subset)[colnames(slice_subset) == concept_col] <- col_name
        cat("    Join keys:", paste(join_keys, collapse = ", "), "\n")
        main_data <- merge(main_data, slice_subset, by = join_keys, all.x = TRUE)
      }
    }

    # Update concept variable map to use joined column name
    concept_vars$by_concept[[concept_key]] <- col_name
    role <- b$methodRole
    if (!is.null(role) && !is.null(concept_vars$by_role[[role]])) {
      concept_vars$by_role[[role]] <- col_name
    }
  }

  return(main_data)
}

#' Filter dataset by constraint values.
#' In concept-keyed mode, dimension names ARE column names — no store resolution needed.
#' If a constraint reduces data to 0 rows, it is rolled back with a warning
#' (e.g., when SDTM label values don't match ADaM-style constraint values).
filter_by_constraints <- function(dataset, constraints, overrides = NULL) {
  if (is.null(constraints) || length(constraints) == 0) return(dataset)

  for (dim_name in names(constraints)) {
    value <- constraints[[dim_name]]
    if (is.null(value) || value == "") next

    # User override takes precedence, otherwise dimension name is the column name
    col_name <- if (!is.null(overrides) && !is.null(overrides[[dim_name]])) {
      overrides[[dim_name]]
    } else {
      dim_name
    }

    if (col_name %in% colnames(dataset)) {
      # Try exact match first
      filtered <- dataset[dataset[[col_name]] == value, , drop = FALSE]
      if (nrow(filtered) > 0) {
        cat("    Filter:", col_name, "==", value, "→", nrow(filtered), "rows\n")
        dataset <- filtered
      } else {
        # Fallback: case-insensitive match (handles SDTM/ADaM casing differences)
        filtered <- dataset[tolower(dataset[[col_name]]) == tolower(value), , drop = FALSE]
        if (nrow(filtered) > 0) {
          cat("    Filter:", col_name, "~=", value, "(case-insensitive) →", nrow(filtered), "rows\n")
          dataset <- filtered
        } else {
          # Fallback: partial match — value starts with constraint or vice versa
          # Handles "Weight" matching "Weight (kg)" across SDTM/ADaM boundaries
          lower_val <- tolower(value)
          col_lower <- tolower(dataset[[col_name]])
          filtered <- dataset[startsWith(col_lower, lower_val) | startsWith(lower_val, col_lower), , drop = FALSE]
          if (nrow(filtered) > 0) {
            cat("    Filter:", col_name, "~", value, "(partial match) →", nrow(filtered), "rows\n")
            dataset <- filtered
          } else {
            cat("    Warning:", col_name, '== "', value, '" matched 0 rows — skipping constraint\n')
          }
        }
      }
    } else {
      cat("    Warning: column", col_name, "not found for constraint", dim_name, "\n")
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
    concept <- b$concept
    if (is.null(concept) || concept == "") next

    # Build full concept key to match by_concept map
    if (identical(b$qualifierType, "facet") && !is.null(b$qualifierValue)) {
      lookup_key <- paste0(sub("@.*", "", concept), ".", normalize_facet_case(b$qualifierValue))
    } else {
      lookup_key <- sub("@.*", "", concept)
    }

    col_name <- concept_map[[lookup_key]]
    if (is.null(col_name) || !(col_name %in% colnames(data))) next

    dsr <- b$dataStructureRole
    if (identical(dsr, "dimension")) {
      data[[col_name]] <- factor(data[[col_name]])
      cat("  factor():", col_name, "→", nlevels(data[[col_name]]), "levels\n")
    } else if (identical(dsr, "measure")) {
      data[[col_name]] <- as.numeric(data[[col_name]])
      cat("  numeric():", col_name, "\n")
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
#' Role placeholders (<response>, <covariate>, etc.) → concept key column names.
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

  # Resolve selected concept names → concept key column names
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
                                 slices, bindings) {
  lines <- c(
    "# ═══════════════════════════════════════════════════════════════",
    "# Resolved R Program (standalone, concept-keyed)",
    paste0("# Generated from AC/DC specification + r_implementations.json"),
    "# ═══════════════════════════════════════════════════════════════",
    ""
  )

  # Variable mapping
  lines <- c(lines, "# --- Concept → Column mapping ---")
  for (concept in names(concept_vars$by_concept)) {
    lines <- c(lines, paste0("# ", concept, " → ", concept_vars$by_concept[[concept]]))
  }
  lines <- c(lines, "")

  # Filters from slices — dimension names are column names
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
        filter_parts <- c(filter_parts, paste0("  ", dim_name, ' == "', value, '"'))
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
    raw_concept <- sub("@.*", "", b$concept %||% "")
    if (identical(b$qualifierType, "facet") && !is.null(b$qualifierValue)) {
      lookup_key <- paste0(raw_concept, ".", normalize_facet_case(b$qualifierValue))
    } else {
      lookup_key <- raw_concept
    }
    col_name <- concept_vars$by_concept[[lookup_key]]
    if (is.null(col_name)) next
    dsr <- b$dataStructureRole
    if (identical(dsr, "dimension")) {
      lines <- c(lines, paste0("analysis_data$", col_name, " <- factor(analysis_data$", col_name, ")"))
    } else if (identical(dsr, "measure")) {
      lines <- c(lines, paste0("analysis_data$", col_name, " <- as.numeric(analysis_data$", col_name, ")"))
    }
  }
  lines <- c(lines, "")

  # Resolved call template (already narrowed by output config if applicable)
  lines <- c(lines, "# --- Execute (from r_implementations.json callTemplate) ---")
  resolved_call <- resolve_call_template(r_impl$callTemplate, concept_vars$by_role, configs)
  lines <- c(lines, strsplit(resolved_call, "\n")[[1]])

  return(paste(lines, collapse = "\n"))
}
