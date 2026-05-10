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
#' Collect every binding that carries a qualifier (concept + qualifierType +
#' qualifierValue triple). Fed to ingest_to_concepts so it can resolve
#' qualifier-keyed sub-maps (e.g. Treatment.intentType.Planned → TRTP)
#' instead of only consulting byDataType (which would resolve to TRTA only).
collect_qualified_bindings <- function(spec, derivations = NULL) {
  found <- list()
  walk <- function(node) {
    if (is.null(node)) return()
    if (is.list(node)) {
      c <- node$concept; qt <- node$qualifierType; qv <- node$qualifierValue
      if (!is.null(c) && is.character(c) && length(c) == 1
          && !is.null(qt) && is.character(qt) && length(qt) == 1
          && !is.null(qv) && is.character(qv) && length(qv) == 1) {
        found[[length(found) + 1L]] <<- list(concept = c, qualifierType = qt, qualifierValue = qv)
      }
      for (item in node) walk(item)
    }
  }
  walk(spec)
  if (!is.null(derivations)) for (d in derivations) walk(d)
  # Dedup by (concept, qualifierType, qualifierValue) triple
  seen <- character(0)
  out <- list()
  for (qb in found) {
    key <- paste(qb$concept, qb$qualifierType, qb$qualifierValue, sep = "|")
    if (key %in% seen) next
    seen <- c(seen, key)
    out[[length(out) + 1L]] <- qb
  }
  out
}

#' Collect every concept name a spec/derivation chain references.
#' Walks bindings (`concept`), slice constraints (resolvedValues / fixedDimensions
#' keys), cube dimensions (`dimension`), and recurses into nested lists. The
#' result is fed to ingest_to_concepts so unrelated alias columns
#' (PeakValue, AreaUnderCurve, …) don't get materialized when the spec
#' doesn't reference them.
collect_used_concepts <- function(spec, derivations = NULL) {
  found <- character(0)
  walk <- function(node) {
    if (is.null(node)) return()
    if (is.list(node)) {
      # Bindings: concept field is the canonical anchor
      if (!is.null(node$concept) && is.character(node$concept) && length(node$concept) == 1) {
        found <<- c(found, node$concept)
      }
      # Slice constraint shapes — keys are concrete concept names
      if (!is.null(node$resolvedValues) && is.list(node$resolvedValues)) {
        found <<- c(found, names(node$resolvedValues))
      }
      if (!is.null(node$fixedDimensions) && is.list(node$fixedDimensions)) {
        found <<- c(found, names(node$fixedDimensions))
      }
      # cubeDimensions[].dimension
      if (!is.null(node$dimension) && is.character(node$dimension) && length(node$dimension) == 1) {
        found <<- c(found, node$dimension)
      }
      for (item in node) walk(item)
    }
  }
  walk(spec)
  if (!is.null(derivations)) for (d in derivations) walk(d)
  unique(found[nzchar(found)])
}

ingest_to_concepts <- function(dataset, store_mappings, domain_code = NULL,
                                used_concepts = NULL, qualified_bindings = NULL) {
  rename_map <- list()   # store_col → concept_key
  alias_map  <- list()   # concept_key → source concept_key (for dual-identity)
  # `used_concepts`: optional character vector of concept names the spec
  # actually references (bindings, slice constraints, cube dims). When
  # supplied, alias columns are only created for concepts in this set —
  # otherwise mappings like PeakValue/AreaUnderCurve/EventCount/TimeToEvent
  # all aliasing AVAL would clutter `final_columns` with duplicates the
  # analysis never reads. NULL preserves the legacy "alias everything"
  # behaviour for callers that don't yet supply the set.
  # `qualified_bindings`: optional list of (concept, qualifierType,
  # qualifierValue) triples extracted from the spec's bindings. When
  # supplied, the engine consults the mapping's qualifier sub-map (e.g.
  # `Treatment$intentType$Planned`) to resolve the right column for that
  # concept — otherwise only `byDataType` (the primary variant) is read,
  # which silently drops binding qualifiers like IntentType=Planned and
  # leaves the concept column missing post-ingest.

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

  # 4. Create alias columns for dual-identity entries — but only for concepts
  #    the spec actually uses (when `used_concepts` is supplied). This drops
  #    the long tail of unrelated aliases (PeakValue, AreaUnderCurve, …) that
  #    get bundled because the ADaM mapping declares them all sharing AVAL.
  alias_keys <- names(alias_map)
  if (!is.null(used_concepts) && length(used_concepts) > 0) {
    skipped <- setdiff(alias_keys, used_concepts)
    alias_keys <- intersect(alias_keys, used_concepts)
    if (length(skipped) > 0) {
      cat("  Aliases skipped (not referenced by spec):", paste(skipped, collapse = ", "), "\n")
    }
  }
  for (alias_key in alias_keys) {
    source_key <- alias_map[[alias_key]]
    if (source_key %in% colnames(dataset)) {
      dataset[[alias_key]] <- dataset[[source_key]]
    }
  }

  # 5. Qualifier-aware resolution. When a binding declares a qualifier
  #    (e.g. Treatment with IntentType=Planned), the mapping has both a
  #    primary column under byDataType (e.g. TRTA, the Actual variant)
  #    AND a qualifier sub-map (intentType.Planned.code = TRTP). The
  #    main rename loop only reads byDataType — so if the dataset has
  #    TRTP but not TRTA, no rename happens and the Treatment column
  #    is missing post-ingest. Walk qualified_bindings, resolve each
  #    binding's qualified variant from the mapping, and alias the
  #    qualified column to the concept name. Pure metadata lookup —
  #    binding declares the qualifier, mapping declares the variant.
  if (!is.null(qualified_bindings) && length(qualified_bindings) > 0
      && !is.null(store_mappings$dimensions)) {
    qualifier_aliases <- list()
    for (qb in qualified_bindings) {
      concept <- qb$concept
      qtype <- qb$qualifierType
      qvalue <- qb$qualifierValue
      if (is.null(concept) || is.null(qtype) || is.null(qvalue)) next
      if (concept %in% colnames(dataset)) next  # already present
      dim_entry <- store_mappings$dimensions[[concept]]
      if (is.null(dim_entry)) next
      # Mapping uses lowercase first-letter for qualifier keys
      # ("IntentType" → "intentType").
      qkey <- paste0(tolower(substr(qtype, 1, 1)), substr(qtype, 2, nchar(qtype)))
      qsubmap <- dim_entry[[qkey]]
      if (is.null(qsubmap)) next
      variant <- qsubmap[[qvalue]]
      if (is.null(variant)) next
      # Variant has type-keyed columns: prefer string > code > id > decimal > integer
      qvar <- NULL
      for (dtype in c("string", "code", "id", "decimal", "integer")) {
        v <- variant[[dtype]]
        if (!is.null(v)) {
          if (!is.null(domain_code) && grepl("^--", v)) v <- sub("^--", domain_code, v)
          if (v %in% colnames(dataset)) { qvar <- v; break }
        }
      }
      # Fallback: variant-scoped alternativeVariables. When the primary
      # variant column isn't in the dataset (e.g. ADaM Treatment.intentType.
      # Planned primary is TRTP, but the dataset is ADSL with ARM only),
      # walk the per-variant alternatives. Variant-scoped (not concept-
      # scoped) so Planned alternatives can't accidentally resolve to an
      # Actual-side variable.
      if (is.null(qvar) && !is.null(variant$alternativeVariables)) {
        for (alt in variant$alternativeVariables) {
          if (!is.null(domain_code) && grepl("^--", alt)) alt <- sub("^--", domain_code, alt)
          if (alt %in% colnames(dataset)) { qvar <- alt; break }
        }
      }
      if (!is.null(qvar)) {
        dataset[[concept]] <- dataset[[qvar]]
        qualifier_aliases[[concept]] <- sprintf("%s (%s=%s)", qvar, qtype, qvalue)
      }
    }
    if (length(qualifier_aliases) > 0) {
      cat("  Qualifier-resolved columns:\n")
      for (k in names(qualifier_aliases)) {
        cat("    ", k, "← copy of", qualifier_aliases[[k]], "\n")
      }
    }
  }

  cat("  Ingest column mapping:\n")
  for (store_col in names(rename_map)) {
    cat("    ", store_col, "→", rename_map[[store_col]], "\n")
  }
  if (length(alias_keys) > 0) {
    cat("  Aliases (dual-identity):\n")
    for (ak in alias_keys) {
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
                              all_mappings = NULL, available_datasets = NULL,
                              concept_categories = NULL) {
  # Strip haven labels
  dataset <- as.data.frame(lapply(dataset, function(col) {
    if (inherits(col, "haven_labelled")) as.vector(col) else col
  }))

  original_cols <- colnames(dataset)

  # Ingest — auto-detect store from dataset columns
  detected <- detect_store(dataset, all_mappings, spec)
  source_mappings <- detected$mappings %||% mappings
  domain_code <- detected$domain_code

  used_concepts <- collect_used_concepts(spec, derivations)
  qualified_bindings <- collect_qualified_bindings(spec, derivations)
  dataset <- ingest_to_concepts(dataset, source_mappings, domain_code,
                                 used_concepts, qualified_bindings)
  ingested_cols <- colnames(dataset)

  # Run derivation chain
  derived_cols <- ingested_cols
  deriv_log <- list()
  # Snapshot the leaf-level dataset before any derivation rollups.
  # Sibling aggregations downstream of a rollup need leaf cardinality each time.
  dataset_leaf_master <- dataset
  if (!is.null(derivations) && length(derivations) > 0) {
    for (i in seq_along(derivations)) {
      deriv <- derivations[[i]]
      method_oid <- deriv$method$oid %||% deriv$usesMethod

      # Per-step leaf view: fresh copy from master, filtered by THIS step's
      # constraints. Mirrors the running-cube filter below so an aggregation
      # over leaf cardinality respects the same Topic IN [...] etc.
      step_leaf <- dataset_leaf_master

      # Apply derivation-specific constraints (BC Topic decode from JS).
      # When a derivation leaf links MULTIPLE BCs (e.g. ADaS-Cog 11 = 11 item BCs
      # all feeding T.ADAS_SumAvailableScores), the JS emits cv$value as a
      # character vector. Use %in% (R's IN-operator) to filter by the full set
      # rather than == (which would silently degrade to single-value comparison).
      if (!is.null(deriv$constraintValues) && length(deriv$constraintValues) > 0) {
        for (cv in deriv$constraintValues) {
          col <- cv$dimension; val <- cv$value
          if (!is.null(col) && !is.null(val) && col %in% colnames(step_leaf)) {
            if (length(val) > 1) {
              step_leaf <- step_leaf[step_leaf[[col]] %in% val, , drop = FALSE]
            } else {
              step_leaf <- step_leaf[step_leaf[[col]] == val, , drop = FALSE]
            }
          }
          if (!is.null(col) && !is.null(val) && col %in% colnames(dataset)) {
            if (length(val) > 1) {
              dataset <- dataset[dataset[[col]] %in% val, , drop = FALSE]
            } else {
              dataset <- dataset[dataset[[col]] == val, , drop = FALSE]
            }
          }
        }
      }

      var_map <- build_concept_var_map(deriv$resolvedBindings, source_mappings, include_outputs = TRUE)

      # Chain-lookup identity (§3) + reference resolution (§3.6): JS layer
      # assigns each chain entry a unique outputColumn and a per-role
      # inputColumns map. Override var_map$by_role so sibling derivations
      # producing the same concept (e.g. multiple Measure outputs) don't
      # collide on merge, and so derivations that consume another
      # derivation's output via pipelineReferences resolve to the correct
      # __col_ column.
      # Chain-lookup outputColumn renames the derivation's PRIMARY (measure)
      # output to a unique __col_* name that downstream chain steps consume.
      # Companion outputs of dataStructureRole "attribute" (units) and
      # "dimension" (parameter labels) keep their natural concept-keyed names
      # so they don't all collide on the same destination column. Without this
      # filter, T.UnitConversion's result_value (numeric) gets clobbered by
      # result_unit ("kg") and parameter_label, leaving the chain column with
      # a non-numeric value and aggregate(... , FUN=mean) → NA.
      if (!is.null(deriv$outputColumn) && nzchar(deriv$outputColumn)) {
        for (b in deriv$resolvedBindings) {
          if (identical(b$direction, "output") && !is.null(b$methodRole) && nzchar(b$methodRole)
              && identical(b$dataStructureRole, "measure")) {
            var_map$by_role[[b$methodRole]] <- deriv$outputColumn
          }
        }
      }
      if (!is.null(deriv$inputColumns) && length(deriv$inputColumns) > 0) {
        for (role in names(deriv$inputColumns)) {
          col <- deriv$inputColumns[[role]]
          if (!is.null(col) && nzchar(col)) var_map$by_role[[role]] <- col
        }
      }

      configs <- list()
      if (!is.null(deriv$configurationValues)) {
        for (cv in deriv$configurationValues) {
          val <- cv$value
          if (is.atomic(val) && length(val) == 1) {
            num_val <- suppressWarnings(as.numeric(val))
            if (!is.na(num_val)) val <- num_val
          }
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

      # Expose endpoint slices to the callTemplate so methods that collapse
      # a dimension (rollups) can stamp the new identity from the slice
      # value. Cube-orthodox: a slice is the projection target for a
      # collapsed dimension, not just a read filter. Each slice resolves to
      # a name → value list of dimension constraints (e.g.
      # slices$endpoint$Parameter == "Adas-Cog(11) Subscore").
      slices <- list()
      if (!is.null(deriv$resolvedSlices)) {
        for (s in deriv$resolvedSlices) {
          nm <- s$name %||% ""
          if (nzchar(nm)) slices[[nm]] <- s$resolvedValues
        }
      }
      env <- new.env(parent = globalenv())
      env$concept_data <- dataset
      env$concept_data_leaf <- step_leaf
      env$unit_conversions <- unit_conversions
      env$configs <- configs
      env$slices <- slices
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

  # Cube-orthodox post-chain rollup. After all derivations broadcast their
  # per-group aggregates onto leaf rows, collapse the running cube to the
  # analysis-level partition (the broadest aggregation the chain performed)
  # and stamp the endpoint slice values onto any dimension being collapsed.
  # This is the slice-as-projection-target step: leaf-row identity becomes
  # the aggregate identity declared by the endpoint.
  if (!is.null(derivations) && length(derivations) > 0) {
    # Collect the analysis partition: union of all M.Aggregation partition
    # bindings across the chain, restricted to columns that actually exist
    # in the running cube.
    analysis_partition <- character(0)
    for (deriv in derivations) {
      method_oid <- deriv$method$oid %||% deriv$usesMethod
      if (!identical(method_oid, "M.Aggregation")) next
      for (b in deriv$resolvedBindings) {
        if (identical(b$direction, "input") && identical(b$methodRole, "partition")
            && !is.null(b$concept) && nzchar(b$concept) && b$concept %in% colnames(dataset)) {
          analysis_partition <- c(analysis_partition, b$concept)
        }
      }
    }
    analysis_partition <- unique(analysis_partition)
    # Endpoint slice: dimensions to stamp onto the collapsed cube.
    # Search all derivations for the endpoint slice (typically named
    # "endpoint"); fall back to the first slice with non-empty resolved
    # values if no slice is named that way.
    endpoint_slice <- NULL
    seen_slice_names <- character(0)
    for (deriv in derivations) {
      if (!is.null(deriv$resolvedSlices)) {
        for (s in deriv$resolvedSlices) {
          nm <- s$name %||% ""
          seen_slice_names <- c(seen_slice_names, nm)
          if (identical(nm, "endpoint") && !is.null(s$resolvedValues) && length(s$resolvedValues) > 0) {
            endpoint_slice <- s$resolvedValues; break
          }
        }
        if (!is.null(endpoint_slice)) break
      }
    }
    if (is.null(endpoint_slice)) {
      for (deriv in derivations) {
        if (!is.null(deriv$resolvedSlices)) {
          for (s in deriv$resolvedSlices) {
            if (!is.null(s$resolvedValues) && length(s$resolvedValues) > 0) {
              endpoint_slice <- s$resolvedValues; break
            }
          }
          if (!is.null(endpoint_slice)) break
        }
      }
    }
    message(sprintf("[post-chain rollup] slices seen: [%s]", paste(unique(seen_slice_names), collapse=", ")))
    # Subtract slice-fixed dimensions from the dedup key. Slice dims are
    # single-valued (the endpoint nailed them down), so they're projection
    # targets, not partition keys. What's left is the cube's analysis level.
    # QB slice realization: also subtract category-siblings of slice dims —
    # rows differing only in an OC-side column when the DC-side is pinned
    # represent the leaf-level decomposition of the rolled-up identity
    # (W3C QB §8.2 hierarchical code lists).
    slice_dims <- if (!is.null(endpoint_slice)) names(endpoint_slice) else character(0)
    slice_dims_expanded <- expand_rollup_dims_by_category(slice_dims, concept_categories)
    effective_partition <- setdiff(analysis_partition, slice_dims_expanded)
    if (length(effective_partition) > 0) {
      pre_n <- nrow(dataset)
      # First stamp slice values onto leaf rows (so dedup collapses
      # leaf-duplicate rows into a single representative row carrying the
      # endpoint's identity), then dedup on the effective partition.
      # Stamp category-siblings too so OC-side columns inherit the slice
      # value rather than retaining stale leaf labels post-dedup.
      if (!is.null(endpoint_slice)) {
        for (dim in names(endpoint_slice)) {
          sval <- endpoint_slice[[dim]]
          if (is.null(sval) || length(sval) != 1 || !nzchar(as.character(sval))) next
          sibling_dims <- expand_rollup_dims_by_category(dim, concept_categories)
          for (target_dim in sibling_dims) {
            if (!(target_dim %in% effective_partition) && (target_dim %in% colnames(dataset))) {
              dataset[[target_dim]] <- sval
            }
          }
        }
      }
      dataset <- dataset[!duplicated(dataset[, effective_partition, drop = FALSE]), , drop = FALSE]
      message(sprintf("[post-chain rollup] all-agg-partitions=%s effective-partition=%s slice-dims=%s rows: %d -> %d",
        paste(analysis_partition, collapse=","),
        paste(effective_partition, collapse=","),
        if (is.null(endpoint_slice)) "<none>" else paste(names(endpoint_slice), collapse=","),
        pre_n, nrow(dataset)))
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

#' When the primary dataset is missing a required dimension (e.g. Treatment
#' not in QS), the spec must declare `analysis$auxiliarySources[[concept]]`
#' — `{dataset, joinKey}` — saying which loaded dataset provides it. The
#' engine reads that declaration explicitly and joins by the declared key.
#' No auto-scan: if a needed dim has no auxiliarySource entry, the engine
#' errors loudly so the spec author picks at the Execute panel rather than
#' the engine guessing.
enrich_dimensions <- function(dataset, bindings, all_mappings, available_datasets,
                               primary_ds_name = NULL, auxiliary_sources = NULL,
                               overrides = NULL) {
  # Find which dimension concepts are needed but missing
  # Skip constraint bindings — those filter, not enrich
  needed_dims <- character(0)
  for (b in bindings) {
    if (identical(b$direction, "output")) next
    if (!identical(b$dataStructureRole, "dimension")) next
    if (identical(b$methodRole, "constraint")) next
    concept <- b$concept
    if (is.null(concept) || concept == "") next
    if (!(concept %in% colnames(dataset))) {
      needed_dims <- c(needed_dims, concept)
    }
  }
  needed_dims <- unique(needed_dims)
  if (length(needed_dims) == 0) return(dataset)

  # Treat auxiliary_sources as an empty named list when missing so the
  # error-path below is uniform.
  aux_decls <- if (is.null(auxiliary_sources)) list() else auxiliary_sources
  cat("  Missing dimensions (need enrichment):", paste(needed_dims, collapse = ", "), "\n")

  aux_qb <- collect_qualified_bindings(list(resolvedBindings = bindings))

  for (concept in needed_dims) {
    decl <- aux_decls[[concept]]
    if (is.null(decl) || is.null(decl$dataset) || !nzchar(decl$dataset)) {
      stop(sprintf(
        "Dimension '%s' is missing from the primary dataset and no auxiliarySource is declared for it.\n  Pick a source dataset for '%s' in the Execute panel (Resolved Bindings → source dataset).",
        concept, concept))
    }
    aux_name <- decl$dataset
    if (is.null(decl$joinKey) || !nzchar(decl$joinKey)) {
      stop(sprintf(
        "Dimension '%s' has an auxiliarySource for dataset '%s' but no joinKey.\n  The UI should derive the join key from the OC instance model (sharedDimension with relationship='aboutSubject').",
        concept, decl$dataset))
    }
    join_key <- decl$joinKey

    aux <- tryCatch(get(aux_name, envir = globalenv()), error = function(e) NULL)
    if (is.null(aux) || !is.data.frame(aux)) {
      stop(sprintf("Auxiliary dataset '%s' (for dimension '%s') is not loaded.",
                   aux_name, concept))
    }
    aux <- as.data.frame(lapply(aux, function(col) {
      if (inherits(col, "haven_labelled")) as.vector(col) else col
    }))
    detected <- detect_store(aux, all_mappings, list(targetDataset = aux_name))
    if (is.null(detected$mappings)) {
      stop(sprintf("Could not detect concept-mapping store for auxiliary dataset '%s'.",
                   aux_name))
    }
    aux <- ingest_to_concepts(aux, detected$mappings, detected$domain_code, NULL, aux_qb)

    if (!(join_key %in% colnames(dataset))) {
      stop(sprintf("Join key '%s' is missing from primary dataset (cannot enrich '%s' from '%s').",
                   join_key, concept, aux_name))
    }
    if (!(join_key %in% colnames(aux))) {
      stop(sprintf("Join key '%s' is missing from auxiliary dataset '%s' (cannot enrich '%s').",
                   join_key, aux_name, concept))
    }
    if (!(concept %in% colnames(aux))) {
      stop(sprintf("Auxiliary dataset '%s' does not provide column '%s' after ingest. Check the concept-variable mapping.",
                   aux_name, concept))
    }

    # Keep the concept-keyed column AND any column the user's override
    # names. When the user picks TRT01P in the dropdown for Treatment, the
    # formula will reference TRT01P — if we only merge the concept-keyed
    # 'Treatment' column, R can't resolve the formula. The qualifier walk
    # in ingest_to_concepts has already copied TRT01P → Treatment inside
    # the aux dataset; we just need to retain the source variant column
    # too so both names survive the merge.
    keep_cols <- unique(c(join_key, concept))
    override_var <- if (!is.null(overrides) && !is.null(overrides[[concept]])) overrides[[concept]] else NULL
    if (!is.null(override_var) && nzchar(override_var)
        && override_var != concept && override_var %in% colnames(aux)) {
      keep_cols <- unique(c(keep_cols, override_var))
    }
    aux_subset <- unique(aux[, keep_cols, drop = FALSE])
    dataset <- merge(dataset, aux_subset, by = join_key, all.x = TRUE)
    cat(sprintf("  [enrich] '%s' joined from '%s' (key=%s%s)\n",
                concept, aux_name, join_key,
                if (length(keep_cols) > 2) paste0(" +var=", override_var) else ""))
  }
  dataset
}

# ---------------------------------------------------------------------------
# Category-sibling expansion for rollup dimensions
# ---------------------------------------------------------------------------

#' W3C QB slice realization, applied to the silent-skip gate.
#'
#' When a derivation chain rolls up over one category-member (e.g. OC-side
#' `Observation.Identification.Topic`), the analysis-level slice typically
#' speaks the sibling category-member's language (DC-side `Parameter` =
#' "Adas-Cog(11) Subscore"). Both are members of the same conceptCategory
#' (`ParameterDimension`) and are structurally the same dimension at
#' different code-list levels — see W3C Data Cube §5.3 + §7.2 on slice
#' attachment and §8.2 on hierarchical code lists.
#'
#' The cube doesn't materialize the rolled-up label on each row mid-chain
#' (the M.Aggregation impl preserves per-leaf rows); the post-cube rollup
#' (acdc_engine.R near line 996) does that stamping AFTER the cube
#' completes. For the cube to complete, the silent-skip gate must
#' recognize the sibling DC concept as a legitimate rollup target. This
#' helper expands the chain's rollup-dim list to include every
#' category-sibling of each entry.
#'
#' Pure metadata lookup. No hardcoded concept names.
expand_rollup_dims_by_category <- function(rollup_dims, concept_categories) {
  if (length(rollup_dims) == 0) return(rollup_dims)
  cats <- concept_categories$categories
  if (is.null(cats) || length(cats) == 0) return(rollup_dims)
  expanded <- rollup_dims
  for (cat_name in names(cats)) {
    members <- cats[[cat_name]]$members
    if (is.null(members) || length(members) == 0) next
    member_concepts <- vapply(members, function(m) m$concept %||% NA_character_, character(1))
    member_concepts <- member_concepts[!is.na(member_concepts)]
    if (any(member_concepts %in% rollup_dims)) {
      expanded <- c(expanded, member_concepts)
    }
  }
  unique(expanded)
}

# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

acdc_execute <- function(spec, mappings, dataset, overrides = NULL,
                         method_def = NULL, r_impl = NULL,
                         derivations = NULL, unit_conversions = NULL, r_impls = NULL,
                         all_mappings = NULL, available_datasets = NULL,
                         concept_categories = NULL) {
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
  used_concepts <- collect_used_concepts(spec, derivations)
  qualified_bindings <- collect_qualified_bindings(spec, derivations)
  dataset <- ingest_to_concepts(dataset, source_mappings, domain_code,
                                 used_concepts, qualified_bindings)

  cat("  Post-ingest columns:", paste(colnames(dataset), collapse = ", "), "\n")

  # 2. Apply derivation chain FIRST (each derivation has its own concept-level
  #    input cube via constraintValues). Derivations transform the full dataset
  #    before the analysis cube filters it.
  if (!is.null(derivations) && length(derivations) > 0) {
    cat("  Applying", length(derivations), "derivation(s) before analysis cube...\n")
    dataset <- tryCatch(
      apply_derivations(dataset, derivations, r_impls, unit_conversions, source_mappings),
      error = function(e) stop(paste0("[Step 2 apply_derivations] ", e$message,
        "\n  Columns before: ", paste(colnames(dataset), collapse=", ")))
    )
    cat("  Post-derivation:", nrow(dataset), "rows x", ncol(dataset), "cols\n")
  }

  # 3. Enrich missing dimensions from explicitly-declared auxiliary sources
  #    (e.g., Treatment from ADSL). The spec author picks the source dataset
  #    per-concept in the Execute panel; the engine reads the declaration
  #    and joins by the declared key. No auto-scan.
  if (!is.null(available_datasets) && length(available_datasets) > 0) {
    primary_name <- tolower(spec$targetDataset %||% "")
    dataset <- enrich_dimensions(
      dataset, analysis$resolvedBindings, all_mappings,
      available_datasets, primary_name,
      analysis$auxiliarySources,
      overrides
    )
  }

  # 4. Resolve analysis bindings to concept keys
  concept_vars <- build_concept_var_map(analysis$resolvedBindings, source_mappings, overrides)

  # Analysis-level chain-lookup: JS computed a role → column map for the
  # analysis transform's own input roles by walking the pipeline graph and
  # resolving each root slot to either a chain entry's outputColumn or a
  # pipelineReferences referent. Override concept_vars$by_role so roles like
  # `response` point at `__col_T_CFB_ANCOVA_Change_0` instead of the bare
  # concept name `Change` (which isn't a column after derivations run).
  if (!is.null(analysis$analysisInputColumns) && length(analysis$analysisInputColumns) > 0) {
    for (role in names(analysis$analysisInputColumns)) {
      col <- analysis$analysisInputColumns[[role]]
      if (!is.null(col) && nzchar(col)) {
        concept_vars$by_role[[role]] <- col
        cat("  [analysis chain-lookup] override role", role, "->", col, "\n")
      }
    }
  }

  cat("  Concept → Column:\n")
  for (nm in names(concept_vars$by_concept)) {
    cat("    ", nm, "→", concept_vars$by_concept[[nm]], "\n")
  }
  cat("  Role → Column:\n")
  for (nm in names(concept_vars$by_role)) {
    cat("    ", nm, "→", paste(concept_vars$by_role[[nm]], collapse = ", "), "\n")
  }

  # Compute the set of dimensions the chain ROLLS UP over (M.Aggregation
  # partitions). These are legitimate projection targets for slices: a 0-row
  # match on them is OK because the chain rolls up TO that slice value, not
  # FROM it (e.g. leaf-Parameter rows aggregated up to a single endpoint
  # Parameter label). For non-rollup dims, a 0-row match is a config error
  # (e.g. wrong variable mapping like PARAMCD vs PARAM) and should fail loud.
  chain_rollup_dims <- character(0)
  if (!is.null(derivations) && length(derivations) > 0) {
    for (deriv in derivations) {
      method_oid <- deriv$method$oid %||% deriv$usesMethod
      if (!identical(method_oid, "M.Aggregation")) next
      for (b in deriv$resolvedBindings) {
        if (identical(b$direction, "input") && identical(b$methodRole, "partition")
            && !is.null(b$concept) && nzchar(b$concept)) {
          chain_rollup_dims <- c(chain_rollup_dims, b$concept)
        }
      }
    }
    chain_rollup_dims <- unique(chain_rollup_dims)
  }
  # QB slice realization: expand each rollup dim by its conceptCategory
  # siblings. An aggregation that partitions on the OC member (e.g.
  # Observation.Identification.Topic) also legitimizes silent-skip on the
  # DC member (Parameter) when the analysis slice fixes the DC value —
  # both members address the same dimension at different code-list levels
  # (W3C QB §8.2). Without this expansion, the slice fails loud against
  # leaf values that the cube's post-rollup would otherwise stamp.
  pre_expand <- chain_rollup_dims
  chain_rollup_dims <- expand_rollup_dims_by_category(chain_rollup_dims, concept_categories)
  if (length(chain_rollup_dims) > 0) {
    cat("  Chain rollup dims (silent-skip allowed):", paste(chain_rollup_dims, collapse=", "), "\n")
    added <- setdiff(chain_rollup_dims, pre_expand)
    if (length(added) > 0) {
      cat("    (category-sibling expansion added:", paste(added, collapse=", "), ")\n")
    }
  }

  # 5. Execute analysis cube: query each slice, join by common dimensions
  analysis_data <- tryCatch(
    execute_cube(dataset, analysis$resolvedBindings, analysis$resolvedSlices,
                 concept_vars, overrides, chain_rollup_dims),
    error = function(e) stop(paste0("[Step 5 execute_cube] ", e$message,
      "\n  Columns: ", paste(colnames(dataset), collapse=", ")))
  )
  cat("  Analysis data:", nrow(analysis_data), "rows x", ncol(analysis_data), "cols\n")

  # 5b. Cube-orthodox post-cube rollup. After execute_cube has done all its
  # slice queries (default slice + per-binding slice joins like the
  # baseline-AVAL covariate), collapse the analysis_data to the analysis
  # partition (Subject, typically) and stamp endpoint-slice values onto any
  # collapsed dimension. The slice IS the projection target — what was a
  # filter on a leaf dimension becomes the new aggregate identity.
  # Without this step, analysis_data has N rows per subject (one per leaf
  # parameter that survived the silent-skip on Parameter), with the
  # downstream lm() fit on duplicated rows → contrast errors / SS=0.
  if (!is.null(derivations) && length(derivations) > 0 && nrow(analysis_data) > 0) {
    analysis_partition <- character(0)
    for (deriv in derivations) {
      method_oid <- deriv$method$oid %||% deriv$usesMethod
      if (!identical(method_oid, "M.Aggregation")) next
      for (b in deriv$resolvedBindings) {
        if (identical(b$direction, "input") && identical(b$methodRole, "partition")
            && !is.null(b$concept) && nzchar(b$concept) && b$concept %in% colnames(analysis_data)) {
          analysis_partition <- c(analysis_partition, b$concept)
        }
      }
    }
    analysis_partition <- unique(analysis_partition)
    endpoint_slice <- NULL
    if (!is.null(analysis$resolvedSlices)) {
      for (s in analysis$resolvedSlices) {
        nm <- s$name %||% ""
        if (identical(nm, "endpoint") && !is.null(s$resolvedValues) && length(s$resolvedValues) > 0) {
          endpoint_slice <- s$resolvedValues; break
        }
      }
    }
    # QB slice realization (partition side): the slice fixes Parameter (DC).
    # Topic (OC) is its category-sibling — same dimension at a different
    # code-list level (W3C QB §8.2). Both are "fixed by the slice" for the
    # purpose of partition collapse: rows differing only in Topic represent
    # the leaf-level decomposition of the rolled-up identity, not distinct
    # analysis units. Expand slice-dim names by category-siblings before
    # subtracting from the partition so dedup collapses to true subject
    # cardinality, not subject × leaf-Topic.
    slice_dims <- if (!is.null(endpoint_slice)) names(endpoint_slice) else character(0)
    slice_dims_expanded <- expand_rollup_dims_by_category(slice_dims, concept_categories)
    effective_partition <- setdiff(analysis_partition, slice_dims_expanded)
    if (length(effective_partition) > 0) {
      pre_n <- nrow(analysis_data)
      # Stamp endpoint slice values onto dimensions that were silently
      # skipped by filter_by_constraints (e.g. Parameter still holds leaf
      # labels because no leaf row's Parameter equals the rolled-up label).
      # Also stamp category-siblings of slice dims (e.g. Topic when slice
      # fixes Parameter) to the slice value so the surviving rows don't
      # carry stale leaf labels on the OC-side column.
      if (!is.null(endpoint_slice)) {
        for (dim in names(endpoint_slice)) {
          sval <- endpoint_slice[[dim]]
          if (is.null(sval) || length(sval) != 1 || !nzchar(as.character(sval))) next
          # Stamp the slice dim itself + every category-sibling present as a column.
          sibling_dims <- expand_rollup_dims_by_category(dim, concept_categories)
          for (target_dim in sibling_dims) {
            if (!(target_dim %in% colnames(analysis_data)) || (target_dim %in% effective_partition)) next
            matched <- as.character(analysis_data[[target_dim]]) == as.character(sval)
            matched[is.na(matched)] <- FALSE
            if (!any(matched)) {
              analysis_data[[target_dim]] <- sval
              cat("  [post-cube rollup] stamp  ", target_dim, "<-\"", sval, "\"",
                  if (target_dim != dim) sprintf(" (category-sibling of '%s')", dim) else "",
                  " (no rows matched)\n", sep="")
            }
          }
        }
      }
      analysis_data <- analysis_data[!duplicated(analysis_data[, effective_partition, drop = FALSE]), , drop = FALSE]
      cat("  [post-cube rollup] effective-partition=", paste(effective_partition, collapse=","),
          " rows: ", pre_n, " -> ", nrow(analysis_data), "\n", sep="")
      # Diagnostic: dump factor-distribution summaries for the model variables
      # so we can see why the contrast error fires (typically: a factor that
      # had 2+ levels at coerce time goes to 1 level after lm's na.action).
      for (cn in c("Treatment","Site","Subject")) {
        if (cn %in% colnames(analysis_data)) {
          v <- analysis_data[[cn]]
          uv <- unique(as.character(v))
          cat("  [post-cube rollup] ", cn, " unique=", length(uv), " na=", sum(is.na(v)),
              " values=[", paste(utils::head(uv, 5), collapse=","), "...]\n", sep="")
        }
      }
      # Look for the analysis input columns and check NA distribution
      for (role in c("response","covariate")) {
        col <- concept_vars$by_role[[role]]
        if (!is.null(col) && col %in% colnames(analysis_data)) {
          v <- analysis_data[[col]]
          cat("  [post-cube rollup] role=", role, " col=", col, " na=", sum(is.na(v)),
              " unique=", length(unique(v)),
              " range=[", suppressWarnings(min(as.numeric(v), na.rm=TRUE)), ",",
              suppressWarnings(max(as.numeric(v), na.rm=TRUE)), "]\n", sep="")
        }
      }
    }
  }

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
apply_derivations <- function(dataset, derivations, r_impls, unit_conversions, mappings = NULL) {
  if (is.null(derivations) || length(derivations) == 0) return(dataset)

  # Snapshot the original leaf-level dataset before any rollups happen.
  # M.Aggregation reads from concept_data_leaf so each aggregation sees full
  # leaf cardinality. Sibling aggregations would otherwise have nothing left
  # to aggregate after the first one collapses the running cube.
  dataset_leaf_master <- dataset

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

    # Build a fresh leaf-level view from the master snapshot, filtered by THIS
    # derivation's constraints. Sibling aggregations downstream of a rollup
    # need leaf-cardinality input each time they run.
    step_leaf <- dataset_leaf_master

    # Apply derivation-specific constraints from JS (BC-derived).
    # Single-value path uses tolerant matching (exact → case-insensitive → partial).
    # Multi-value path (length(val) > 1) uses %in% for IN-clause filtering, exact
    # match only — multi-BC linkages emit array values when a leaf binds multiple
    # BCs (e.g. ADaS-Cog 11 items all feeding T.ADAS_SumAvailableScores).
    if (!is.null(deriv$constraintValues) && length(deriv$constraintValues) > 0) {
      for (cv in deriv$constraintValues) {
        col <- cv$dimension
        val <- cv$value
        # Mirror filter onto step_leaf so sibling-aggregation reads see only
        # the rows matching this derivation's constraints.
        if (!is.null(col) && !is.null(val) && col %in% colnames(step_leaf)) {
          if (length(val) > 1) {
            step_leaf <- step_leaf[step_leaf[[col]] %in% val, , drop = FALSE]
          } else {
            f <- step_leaf[step_leaf[[col]] == val, , drop = FALSE]
            if (nrow(f) == 0) f <- step_leaf[tolower(step_leaf[[col]]) == tolower(val), , drop = FALSE]
            if (nrow(f) > 0) step_leaf <- f
          }
        }
        if (!is.null(col) && !is.null(val) && col %in% colnames(dataset)) {
          pre_n <- nrow(dataset)
          if (length(val) > 1) {
            # IN-clause: exact match only (case-insensitive fallback would mask CT errors).
            dataset <- dataset[dataset[[col]] %in% val, , drop = FALSE]
            cat("    Constraint:", col, "IN [", paste(val, collapse=","), "] →", nrow(dataset), "of", pre_n, "rows\n")
          } else {
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
    }

    # Resolve bindings to concept keys (including outputs). Pass mappings so
    # bare concept names with facets (e.g. "Measure" + dataStructureRole="measure")
    # resolve to the correct facet column ("Measure.Result.Value").
    var_map <- build_concept_var_map(deriv$resolvedBindings, mappings, include_outputs = TRUE)

    # Chain-lookup identity: when the JS layer has computed per-slot unique
    # column names (outputColumn / inputColumns), override the concept-keyed
    # resolution so sibling derivations producing the same concept (e.g. two
    # aggregations emitting 'Measure') don't collide on merge. inputColumns
    # entries that are missing fall through to concept-keyed names for
    # terminal (raw-data) inputs.
    cat("    [chain-lookup] slotKey:", deriv$slotKey %||% "(none)",
        "outputColumn:", deriv$outputColumn %||% "(null)",
        "inputColumns keys:", paste(names(deriv$inputColumns) %||% character(0), collapse=","), "\n")
    if (!is.null(deriv$outputColumn) && nzchar(deriv$outputColumn)) {
      # Find the PRIMARY output methodRole and remap it. Only the measure-typed
      # output gets the chain's __col_* destination; companion outputs of
      # dataStructureRole "attribute" (units) or "dimension" (parameter labels)
      # keep their natural concept-keyed columns so they don't all clobber the
      # same destination — see acdc_derive_only above for the same pattern.
      for (b in deriv$resolvedBindings) {
        if (identical(b$direction, "output") && !is.null(b$methodRole) && nzchar(b$methodRole)
            && identical(b$dataStructureRole, "measure")) {
          var_map$by_role[[b$methodRole]] <- deriv$outputColumn
          cat("    [chain-lookup] override output role", b$methodRole, "->", deriv$outputColumn, "\n")
        }
      }
    }
    if (!is.null(deriv$inputColumns) && length(deriv$inputColumns) > 0) {
      for (role in names(deriv$inputColumns)) {
        col <- deriv$inputColumns[[role]]
        if (!is.null(col) && nzchar(col)) {
          var_map$by_role[[role]] <- col
          cat("    [chain-lookup] override input role", role, "->", col, "\n")
        }
      }
    }

    cat("    Bindings:\n")
    for (nm in names(var_map$by_role)) {
      cat("      ", nm, "->", var_map$by_role[[nm]], "\n")
    }

    # Slice-based pre-join. When an input binding declares a slice
    # (e.g. M.Subtraction's subtrahend has slice: parameter_baseline), the
    # row-wise template needs the slice value broadcast onto every row. We
    # filter the dataset by the slice's resolvedValues, project Subject +
    # the source column, rename to a slice-suffixed name, and left-merge
    # back to the unfiltered dataset. The role then points at the new
    # joined column. Without this, M.Subtraction's minuend and subtrahend
    # both resolve to the same column → Change = 0 → ANCOVA residual SS = 0.
    if (!is.null(deriv$resolvedBindings) && length(deriv$resolvedBindings) > 0
        && !is.null(deriv$resolvedSlices) && length(deriv$resolvedSlices) > 0) {
      # Build a slice name → resolvedValues lookup
      slice_lookup <- list()
      for (s in deriv$resolvedSlices) {
        nm <- s$name %||% ""
        if (nzchar(nm)) slice_lookup[[nm]] <- s$resolvedValues
      }
      # Find a partition column that exists in the data (typically Subject)
      partition_cols <- character(0)
      for (b in deriv$resolvedBindings) {
        if (identical(b$direction, "input") && identical(b$methodRole, "partition")) {
          col <- var_map$by_role[["partition"]] %||% b$concept
          if (!is.null(col)) {
            ks <- if (length(col) > 1) col else strsplit(col, " \\+ ")[[1]]
            partition_cols <- c(partition_cols, ks[ks %in% colnames(dataset)])
          }
        }
      }
      partition_cols <- unique(partition_cols)
      for (b in deriv$resolvedBindings) {
        if (!identical(b$direction, "input")) next
        slice_name <- b$slice
        if (is.null(slice_name) || !nzchar(slice_name)) next
        constraints <- slice_lookup[[slice_name]]
        if (is.null(constraints) || length(constraints) == 0) next
        role <- b$methodRole
        if (is.null(role) || !nzchar(role)) next
        base_col <- var_map$by_role[[role]]
        if (is.null(base_col) || !(base_col %in% colnames(dataset))) {
          cat("    [slice] role", role, "base col", base_col, "not in data — skipping pre-join\n")
          next
        }
        if (length(partition_cols) == 0) {
          cat("    [slice] no partition columns to join on — skipping pre-join for", slice_name, "\n")
          next
        }
        # Filter dataset by the slice constraints (case-insensitive fallback
        # mirrors apply_derivations constraintValues handling). Each
        # constraint is best-effort: a constraint that matches zero rows is
        # skipped with a warning rather than aborting the whole pre-join.
        # Why: after upstream aggregations roll many per-item rows up to one
        # per Subject×Visit, the per-item Parameter label is still on each
        # row — a slice constraint Parameter == "<endpoint label>" would
        # match nothing even though the partition (Subject) and Visit
        # constraints can still pick out the baseline row correctly.
        slice_data <- dataset
        skipped_any <- FALSE
        for (dim_name in names(constraints)) {
          val <- constraints[[dim_name]]
          if (is.null(val) || (is.character(val) && nchar(val) == 0)) next
          if (!(dim_name %in% colnames(slice_data))) {
            cat("    [slice] dim", dim_name, "not in data — skipping constraint\n")
            next
          }
          filtered <- slice_data[slice_data[[dim_name]] == val, , drop = FALSE]
          if (nrow(filtered) == 0) {
            filtered <- slice_data[tolower(slice_data[[dim_name]]) == tolower(val), , drop = FALSE]
          }
          if (nrow(filtered) == 0) {
            cat("    [slice] no rows match", dim_name, "==", val, "— skipping THIS constraint (other constraints still apply)\n")
            skipped_any <- TRUE
            next
          }
          slice_data <- filtered
        }
        if (nrow(slice_data) == 0) {
          cat("    [slice] all constraints together produce 0 rows — skipping pre-join for", slice_name, "\n")
          next
        }
        if (skipped_any) {
          cat("    [slice] WARN: pre-join used", nrow(slice_data), "rows with one or more constraints skipped\n")
        }
        # Project partition + value, rename, merge.
        # CRITICAL: exclude any partition column that's a SLICE-FILTER
        # dimension. The slice has narrowed `slice_data` to rows where
        # those dims have a fixed value (e.g. Visit=Baseline), so leaving
        # them in the join key would only attach the baseline value to
        # rows whose Visit is Baseline — defeating the purpose of the
        # pre-join, which is to broadcast the baseline value across other
        # visits. Join by the partition's *non-filter* dimensions only
        # (typically Subject).
        slice_filter_dims <- names(constraints)
        join_cols <- partition_cols[!partition_cols %in% slice_filter_dims]
        if (length(join_cols) == 0) {
          # Fall back to full partition_cols if subtraction left nothing —
          # shouldn't happen in practice but avoid crashing.
          join_cols <- partition_cols
        }
        keep <- unique(c(join_cols, base_col))
        keep <- keep[keep %in% colnames(slice_data)]
        slice_subset <- slice_data[, keep, drop = FALSE]
        slice_subset <- slice_subset[!duplicated(slice_subset[, join_cols, drop = FALSE]), , drop = FALSE]
        joined_col <- paste0(base_col, "__", slice_name)
        colnames(slice_subset)[colnames(slice_subset) == base_col] <- joined_col
        dataset <- merge(dataset, slice_subset, by = join_cols, all.x = TRUE)
        var_map$by_role[[role]] <- joined_col
        cat("    [slice] role", role, "→", joined_col, "(slice", slice_name, ", joined by",
            paste(join_cols, collapse=", "), "; filter-dims excluded: ",
            paste(intersect(partition_cols, slice_filter_dims), collapse=", "), ")\n")
        # Diagnostic: how many rows now have a non-NA joined value, and what's
        # the value distribution? If subtrahend ends up all-NA the row-wise
        # subtract produces all-NA Change.
        jv <- dataset[[joined_col]]
        cat("    [slice] joined col '", joined_col, "': nrow=", length(jv),
            " na=", sum(is.na(jv)),
            " unique-non-NA=", length(unique(jv[!is.na(jv)])),
            " sample=[", paste(utils::head(unique(jv[!is.na(jv)]), 5), collapse=","), "]\n", sep="")
      }
    }

    # Parse derivation configs (target_unit, precision, etc.). Scalars
    # auto-convert to numeric when possible; list/array values (e.g.
    # a windowed-visit schedule) pass through as-is.
    configs <- list()
    if (!is.null(deriv$configurationValues)) {
      for (cv in deriv$configurationValues) {
        val <- cv$value
        if (is.atomic(val) && length(val) == 1) {
          num_val <- suppressWarnings(as.numeric(val))
          if (!is.na(num_val)) val <- num_val
        }
        configs[[cv$name]] <- val
      }
    }

    # Resolve placeholders in callTemplate
    resolved_code <- resolve_call_template(impl$callTemplate, var_map$by_role, configs)
    cat("    Resolved derivation code:\n")
    cat(paste0("      ", strsplit(resolved_code, "\n")[[1]]), sep = "\n")

    # Execute in sandbox with concept_data + unit_conversions + configs + slices bound.
    # Binding `slices` exposes the resolved-slice lookup (name → dimension/value
    # map) to callTemplates so an aggregation can use the endpoint slice as a
    # *projection target*: stamp the slice value onto a dimension being
    # collapsed by the rollup. (Filter-time use of slices happens above.)
    slices <- list()
    if (!is.null(deriv$resolvedSlices)) {
      for (s in deriv$resolvedSlices) {
        nm <- s$name %||% ""
        if (nzchar(nm)) slices[[nm]] <- s$resolvedValues
      }
    }
    env <- new.env(parent = globalenv())
    env$concept_data <- dataset
    env$concept_data_leaf <- step_leaf
    env$unit_conversions <- unit_conversions
    env$configs <- configs
    env$slices <- slices
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

execute_cube <- function(dataset, bindings, slices, concept_vars, overrides = NULL, rollup_dims = character(0)) {
  # Build slice lookup — values AND per-slice variable overrides.
  # Per-slice variables (e.g. Population → EFFFL chosen in the slices table)
  # let us point a constraint at a specific store column when the dimension
  # name itself isn't a column (Population's byDataType uses domain-specific
  # keys like "efficacy", so ingest_to_concepts doesn't rename any column to
  # "Population" — without the override, the filter is silently skipped).
  slice_lookup <- list()
  slice_var_lookup <- list()
  for (s in slices) {
    name <- s$name %||% "endpoint"
    slice_lookup[[name]] <- s$resolvedValues
    slice_var_lookup[[name]] <- s$resolvedVariables  # may be NULL
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

  # Merge slice-level variable overrides into the global override map.
  # Slice variables take precedence (most specific wins).
  merge_overrides <- function(global, slice_vars) {
    if (is.null(slice_vars) || length(slice_vars) == 0) return(global)
    out <- if (is.null(global)) list() else as.list(global)
    for (k in names(slice_vars)) out[[k]] <- slice_vars[[k]]
    out
  }

  # Query default slice — dimension names are column names in concept-keyed data
  default_constraints <- slice_lookup[[default_slice_name]]
  default_overrides <- merge_overrides(overrides, slice_var_lookup[[default_slice_name]])
  main_data <- filter_by_constraints(dataset, default_constraints, default_overrides, rollup_dims)
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

    # Direct-column shortcut: when the user's override resolves to a column
    # that's already on each row of main_data (e.g. ADaM BDS BASE column,
    # which carries the baseline value for every post-baseline record), the
    # slice query + LEFT JOIN is redundant AND introduces NAs for subjects
    # without a separate baseline visit row — making lm() drop them. Honor
    # the explicit override and skip the join.
    # Check both full concept key (Measure.Result.Value) and bare name
    # (Measure) — JS varOverrides can be keyed by either, mirroring the
    # lookup chain in build_concept_var_map.
    user_override <- NULL
    if (!is.null(overrides)) {
      if (!is.null(overrides[[concept_key]])) user_override <- overrides[[concept_key]]
      else if (!is.null(overrides[[raw_concept]])) user_override <- overrides[[raw_concept]]
    }
    if (!is.null(user_override) && user_override %in% colnames(main_data)) {
      cat("  Slice '", slice_name, "' for role", b$methodRole, ": skipping join —",
          user_override, "already on main_data rows\n")
      role <- b$methodRole
      if (!is.null(role)) concept_vars$by_role[[role]] <- user_override
      next
    }

    raw_constraints <- slice_lookup[[slice_name]]
    if (is.null(raw_constraints)) next

    # Inherit Population (and any other non-overlapping dimension) from the
    # default slice. Without this, baseline values get pulled from rows
    # outside the analysis population (e.g. EFFFL=N), then LEFT-joined into
    # an EFFFL=Y main_data — producing NAs that lm() drops, which understates
    # the model DF vs. a manual standalone subset.
    constraints <- as.list(raw_constraints)
    if (!is.null(default_constraints)) {
      for (dn in names(default_constraints)) {
        if (is.null(constraints[[dn]])) constraints[[dn]] <- default_constraints[[dn]]
      }
    }

    # Variable overrides also need to be inherited from the default slice,
    # since the inherited Population constraint needs its EFFFL column choice.
    inherited_vars <- slice_var_lookup[[slice_name]]
    if (!is.null(slice_var_lookup[[default_slice_name]])) {
      base_vars <- as.list(slice_var_lookup[[default_slice_name]])
      if (!is.null(inherited_vars)) {
        for (k in names(inherited_vars)) base_vars[[k]] <- inherited_vars[[k]]
      }
      inherited_vars <- base_vars
    }
    slice_overrides <- merge_overrides(overrides, inherited_vars)
    slice_data <- filter_by_constraints(dataset, constraints, slice_overrides, rollup_dims)
    cat("  Slice '", slice_name, "' (with inherited constraints):", nrow(slice_data), "rows → column", concept_col, "\n")

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
filter_by_constraints <- function(dataset, constraints, overrides = NULL, rollup_dims = character(0)) {
  if (is.null(constraints) || length(constraints) == 0) return(dataset)

  for (dim_name in names(constraints)) {
    value <- constraints[[dim_name]]
    if (is.null(value) || value == "") next

    # Resolve the actual column to filter on:
    #   1. User override (e.g. EFFFL for Population) IF the column still exists
    #      post-ingest (some store columns survive ingest because they're not
    #      the canonical primary for any concept).
    #   2. The dimension/concept name itself (e.g. Parameter, Treatment) which
    #      is what ingest_to_concepts renamed the canonical column to.
    #   3. Skip with warning.
    override_col <- if (!is.null(overrides) && !is.null(overrides[[dim_name]])) overrides[[dim_name]] else NULL
    col_name <- if (!is.null(override_col) && override_col %in% colnames(dataset)) {
      override_col
    } else if (dim_name %in% colnames(dataset)) {
      if (!is.null(override_col)) {
        cat("    Note: override column", override_col, "not in dataset (renamed by ingest); using concept key", dim_name, "\n")
      }
      dim_name
    } else {
      override_col %||% dim_name  # for the warning message below
    }

    is_rollup_target <- dim_name %in% rollup_dims

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
          } else if (is_rollup_target) {
            # Legitimate projection target: chain rolls up TO this slice value;
            # leaf rows can't match it. Post-cube rollup will stamp the dim.
            cat("    [rollup-stamp]", col_name, "==", value,
                "matched 0 rows — chain rolls up '", dim_name,
                "', will be stamped post-cube\n")
          } else {
            # Config error — surface it loudly. The slice constraint targets a
            # dimension the chain doesn't roll up over, so a 0-row match means
            # the user's variable mapping or slice value is wrong (e.g.
            # Parameter mapped to PARAMCD codes vs slice value being a PARAM
            # label).
            sample_vals <- utils::head(unique(as.character(dataset[[col_name]])), 5)
            stop(sprintf(
              "Slice constraint '%s == \"%s\"' matched 0 rows in column '%s'.\n  This dimension is not rolled up by the derivation chain%s, so this looks like a configuration mismatch.\n  Sample values in '%s': %s\n  Likely fixes:\n    - Change the variable mapping for '%s' (label vs code form?)\n    - Pick a slice value that exists in the data\n    - Add a derivation that rolls up to this dimension",
              dim_name, value, col_name,
              if (length(rollup_dims) > 0) paste0(" (chain rolls up: ", paste(rollup_dims, collapse=", "), ")") else " (no derivations in this analysis)",
              col_name, paste(sample_vals, collapse=", "),
              dim_name
            ))
          }
        }
      }
    } else {
      # Missing-column case: column genuinely isn't in the cube. This is
      # legitimate when the dimension simply doesn't apply to the loaded data
      # store (e.g. AnalysisVisit absent from raw SDTM until a windowing step
      # produces it; Population absent until a flag mapping override is given).
      # Keep the existing soft-warn behavior for these — the user-facing
      # diagnostic is the runtime symptom, not this filter call.
      cat("    Warning: column", col_name, "not found for constraint", dim_name,
          if (is_rollup_target) " (chain rollup target)" else "", "\n")
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

  # Substitute role placeholders (longest first to avoid partial matches).
  # Backticking strategy: the template author marks identifier-position
  # placeholders by wrapping them in backticks (e.g. `lm(\`<response>\` ~
  # \`<covariate>\`, data = ...)`). String-position placeholders stay bare
  # (e.g. `concept_data[["<x>"]]`).
  # For multi-term roles we detect the wrapping backticks at substitution
  # time and use the inner separator "\` + \`" so each term gets its own
  # backticks (the template's outer backticks frame the first/last terms).
  # Bare (string-position) placeholders use the plain separator " + ".
  roles <- names(var_map)
  roles <- roles[order(nchar(roles), decreasing = TRUE)]
  for (role in roles) {
    placeholder <- paste0("<", role, ">")
    terms <- var_map[[role]]
    # Backticked-context substitution: each occurrence wrapped in `…`
    backticked_ph <- paste0("`", placeholder, "`")
    if (grepl(backticked_ph, resolved, fixed = TRUE)) {
      backticked_value <- paste0("`", paste(terms, collapse = "` + `"), "`")
      resolved <- gsub(backticked_ph, backticked_value, resolved, fixed = TRUE)
    }
    # Plain (string-position or single-name) substitution — no backticks added.
    if (grepl(placeholder, resolved, fixed = TRUE)) {
      plain_value <- paste(terms, collapse = " + ")
      resolved <- gsub(placeholder, plain_value, resolved, fixed = TRUE)
    }
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
