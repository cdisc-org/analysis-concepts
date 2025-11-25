# Makefile for Define-JSON Study Implementation LinkML Schema
# Automates validation, code generation, and documentation

.PHONY: all validate json-schema python rdf docs uml clean help

# Directories
SCHEMA_DIR = schema
EXAMPLES_DIR = examples
DOCS_DIR = docs
GENERATED_DIR = generated

# Files
SCHEMA_FILE = $(SCHEMA_DIR)/define_json_study_implementation.yaml
JSON_SCHEMA_FILE = $(SCHEMA_DIR)/define_json_study_implementation.schema.json
PYTHON_FILE = $(GENERATED_DIR)/define_json_study_implementation.py
RDF_FILE = $(SCHEMA_DIR)/define_json_study_implementation.ttl
PLANTUML_FILE = $(DOCS_DIR)/class_diagram.puml
YUML_FILE = $(DOCS_DIR)/class_diagram.yuml

# Python virtual environment paths
VENV_BIN = ../../../../.venv/bin

# Example files (including subdirectories)
EXAMPLE_FILES = $(wildcard $(EXAMPLES_DIR)/*.yaml) $(wildcard $(EXAMPLES_DIR)/*/*.yaml)

# ============================================================================
# Main Targets
# ============================================================================

all: validate json-schema python rdf docs uml ## Generate all artifacts

help: ## Show this help message
	@echo "Define-JSON Study Implementation LinkML Build Targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ============================================================================
# Validation
# ============================================================================

validate: ## Validate all example files against schema
	@echo "==> Validating examples against schema..."
	@for file in $(EXAMPLE_FILES); do \
		echo "  Validating $$file..."; \
		$(VENV_BIN)/linkml-validate -s $(SCHEMA_FILE) $$file || exit 1; \
	done
	@echo "==> All examples validated successfully!"

validate-schema: ## Validate schema itself
	@echo "==> Validating schema..."
	@$(VENV_BIN)/linkml-lint $(SCHEMA_FILE)
	@echo "==> Schema is valid!"

# ============================================================================
# Code Generation
# ============================================================================

json-schema: $(JSON_SCHEMA_FILE) ## Generate JSON Schema

$(JSON_SCHEMA_FILE): $(SCHEMA_FILE)
	@echo "==> Generating JSON Schema..."
	@mkdir -p $(SCHEMA_DIR)
	@gen-json-schema $(SCHEMA_FILE) > $(JSON_SCHEMA_FILE)
	@echo "==> JSON Schema generated: $(JSON_SCHEMA_FILE)"

python: $(PYTHON_FILE) ## Generate Python dataclasses

$(PYTHON_FILE): $(SCHEMA_FILE)
	@echo "==> Generating Python dataclasses..."
	@mkdir -p $(GENERATED_DIR)
	@gen-python $(SCHEMA_FILE) > $(PYTHON_FILE)
	@echo "==> Python classes generated: $(PYTHON_FILE)"

rdf: $(RDF_FILE) ## Generate RDF/Turtle

$(RDF_FILE): $(SCHEMA_FILE)
	@echo "==> Generating RDF/Turtle..."
	@gen-rdf $(SCHEMA_FILE) > $(RDF_FILE)
	@echo "==> RDF generated: $(RDF_FILE)"

# ============================================================================
# Documentation
# ============================================================================

docs: ## Generate markdown documentation
	@echo "==> Generating documentation..."
	@mkdir -p $(DOCS_DIR)
	@gen-markdown $(SCHEMA_FILE) -d $(DOCS_DIR)/
	@echo "==> Documentation generated in $(DOCS_DIR)/"

docs-html: ## Generate HTML documentation (requires linkml-doc)
	@echo "==> Generating HTML documentation..."
	@mkdir -p $(DOCS_DIR)/html
	@gen-html $(SCHEMA_FILE) -d $(DOCS_DIR)/html/
	@echo "==> HTML documentation generated in $(DOCS_DIR)/html/"

# ============================================================================
# UML Diagram Generation
# ============================================================================

uml: $(PLANTUML_FILE) $(YUML_FILE) ## Generate UML diagrams (PlantUML and yUML)

$(PLANTUML_FILE): $(SCHEMA_FILE)
	@echo "==> Generating PlantUML diagram..."
	@mkdir -p $(DOCS_DIR)
	@$(VENV_BIN)/gen-plantuml $(SCHEMA_FILE) > $(PLANTUML_FILE)
	@echo "==> Fixing PlantUML duplicates..."
	@python3 ../fix_plantuml_duplicates.py $(PLANTUML_FILE)
	@echo "==> PlantUML diagram generated: $(PLANTUML_FILE)"

$(YUML_FILE): $(SCHEMA_FILE)
	@echo "==> Generating yUML diagram..."
	@mkdir -p $(DOCS_DIR)
	@$(VENV_BIN)/gen-yuml $(SCHEMA_FILE) > $(YUML_FILE)
	@echo "==> yUML diagram generated: $(YUML_FILE)"

plantuml: $(PLANTUML_FILE) ## Generate only PlantUML diagram

yuml: $(YUML_FILE) ## Generate only yUML diagram

# ============================================================================
# Testing
# ============================================================================

test: validate validate-schema ## Run all validation tests
	@echo "==> All tests passed!"

# ============================================================================
# Cleaning
# ============================================================================

clean: ## Remove all generated files
	@echo "==> Cleaning generated files..."
	@rm -f $(JSON_SCHEMA_FILE)
	@rm -f $(PYTHON_FILE)
	@rm -f $(RDF_FILE)
	@rm -f $(PLANTUML_FILE)
	@rm -f $(YUML_FILE)
	@rm -rf $(DOCS_DIR)
	@rm -rf $(GENERATED_DIR)
	@echo "==> Clean complete!"

# ============================================================================
# Development Targets
# ============================================================================

watch: ## Watch for changes and regenerate (requires entr)
	@echo "==> Watching for changes (requires 'entr' command)..."
	@find $(SCHEMA_DIR) $(EXAMPLES_DIR) -name "*.yaml" | entr -c make all

install-tools: ## Install LinkML and related tools
	@echo "==> Installing LinkML tools..."
	@pip install linkml linkml-runtime
	@echo "==> LinkML tools installed!"

check-tools: ## Check if required tools are installed
	@echo "==> Checking for required tools..."
	@command -v linkml-validate >/dev/null 2>&1 || { echo "linkml-validate not found. Run 'make install-tools'"; exit 1; }
	@command -v gen-json-schema >/dev/null 2>&1 || { echo "gen-json-schema not found. Run 'make install-tools'"; exit 1; }
	@command -v gen-python >/dev/null 2>&1 || { echo "gen-python not found. Run 'make install-tools'"; exit 1; }
	@echo "==> All required tools are installed!"

# ============================================================================
# Utility Targets
# ============================================================================

show-schema: ## Display schema file
	@cat $(SCHEMA_FILE)

show-examples: ## List all example files
	@echo "Example files:"
	@for file in $(EXAMPLE_FILES); do \
		echo "  - $$file"; \
	done

validate-one: ## Validate a single example (use FILE=path/to/file.yaml)
	@if [ -z "$(FILE)" ]; then \
		echo "Error: FILE not specified. Usage: make validate-one FILE=examples/study_example.yaml"; \
		exit 1; \
	fi
	@echo "==> Validating $(FILE)..."
	@$(VENV_BIN)/linkml-validate -s $(SCHEMA_FILE) $(FILE)
	@echo "==> $(FILE) is valid!"

# ============================================================================
# Info
# ============================================================================

info: ## Show schema information
	@echo "==> Schema Information:"
	@echo "  Schema file: $(SCHEMA_FILE)"
	@echo "  Example files: $(words $(EXAMPLE_FILES)) files"
	@echo "  JSON Schema: $(JSON_SCHEMA_FILE)"
	@echo "  Python output: $(PYTHON_FILE)"
	@echo "  RDF output: $(RDF_FILE)"
	@echo "  Docs directory: $(DOCS_DIR)/"

# Default target when no target is specified
.DEFAULT_GOAL := help
