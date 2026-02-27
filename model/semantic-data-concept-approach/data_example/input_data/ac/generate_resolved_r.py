"""
Generate resolved R program from analysis metadata.
Reads metadata CSVs and outputs traditional ADaM-style R code.

This demonstrates the "code generation" approach where semantic metadata
is compiled into a traditional programming artifact that looks like
what a programmer would write directly using ADaM conventions.

Usage:
    python generate_resolved_r.py

Output:
    ancova_resolved.R - Traditional R program with hardcoded ADaM variables
"""

import pandas as pd
import os


def load_metadata(metadata_path="."):
    """Load all metadata CSV files."""
    return {
        'analysis_instance': pd.read_csv(f"{metadata_path}/analysis_instance_metadata.csv"),
        'data_concept_mapping': pd.read_csv(f"{metadata_path}/data_concept_adam_standard.csv"),
        'analysis_dataset': pd.read_csv(f"{metadata_path}/analysis_adam_dataset.csv")
    }


def get_adam_var(concept, mapping_df):
    """Convert data concept to ADaM variable name."""
    row = mapping_df[mapping_df['data_concept'] == concept]
    return row['ADaM_standard_var'].values[0] if len(row) > 0 else concept


def convert_formula(concept_formula, mapping_df):
    """Convert concept formula to ADaM formula."""
    adam_formula = concept_formula
    for _, row in mapping_df.iterrows():
        # Use word boundary replacement to avoid partial matches
        import re
        adam_formula = re.sub(
            r'\b' + re.escape(row['data_concept']) + r'\b',
            row['ADaM_standard_var'],
            adam_formula
        )
    return adam_formula


def generate_r_code(metadata):
    """Generate resolved R code from metadata."""

    # Get analysis info
    analysis = metadata['analysis_instance']
    mapping = metadata['data_concept_mapping']
    dataset = metadata['analysis_dataset']

    analysis_row = analysis[analysis['entity_type'] == 'Analysis'].iloc[0]
    method_row = analysis[analysis['entity_type'] == 'Method'].iloc[0]

    # Get formula and convert
    concept_formula = method_row['formula']
    adam_formula = convert_formula(concept_formula, mapping)

    # Get filters (Attributes with relationship='fix')
    filters = analysis[(analysis['entity_type'] == 'Attribute') &
                       (analysis['relationship'] == 'fix')]

    # Get factors
    factors = analysis[(analysis['entity_type'] == 'Dimension') &
                       (analysis['role'] == 'factor')]

    # Get dataset name
    dataset_name = dataset.iloc[0]['adam_dataset'].lower()

    # Build R code
    code = f'''# =============================================================================
# {analysis_row['name']}
# {analysis_row['label']}
# Generated from: {analysis_row['entity_id']}
# =============================================================================

library(dplyr)
library(emmeans)

# Load data
{dataset_name} <- read.csv("{dataset_name}_ac.csv")

# Apply population filters
analysis_data <- {dataset_name}'''

    # Add filters
    for _, f in filters.iterrows():
        adam_var = get_adam_var(f['data_concept'], mapping)
        code += f''' %>%
  filter({adam_var} == "{f['value']}")'''

    code += '''

# Remove incomplete cases
analysis_data <- analysis_data[complete.cases(analysis_data[, c("'''

    # Add model variables
    model_vars = adam_formula.replace('~', ',').replace('+', ',').split(',')
    model_vars = [v.strip() for v in model_vars]
    code += '", "'.join(model_vars)
    code += '''")]), ]

# Convert factors'''

    for _, f in factors.iterrows():
        adam_var = get_adam_var(f['data_concept'], mapping)
        code += f'''
analysis_data${adam_var} <- as.factor(analysis_data${adam_var})'''

    # Get treatment variable (first factor)
    treatment_var = get_adam_var(factors.iloc[0]['data_concept'], mapping) if len(factors) > 0 else 'TRTP'

    code += f'''

# Fit ANCOVA model
model <- lm({adam_formula}, data = analysis_data)
cat("\\n=== Model Summary ===\\n")
print(summary(model))

# Calculate LS Means by treatment
cat("\\n=== LS Means ===\\n")
emm <- emmeans(model, specs = "{treatment_var}")
print(summary(emm))

# Pairwise comparisons
cat("\\n=== Pairwise Comparisons ===\\n")
print(pairs(emm))

# Save results
write.csv(as.data.frame(summary(emm)), "treatment_results.csv", row.names = FALSE)
write.csv(as.data.frame(summary(pairs(emm))), "comparison_results.csv", row.names = FALSE)

cat("\\n=== Results saved ===\\n")
'''

    return code


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    metadata = load_metadata(script_dir)
    r_code = generate_r_code(metadata)

    output_file = os.path.join(script_dir, "ancova_resolved.R")
    with open(output_file, 'w') as f:
        f.write(r_code)

    print(f"Generated: {output_file}")
    print("\n--- Generated R Code ---\n")
    print(r_code)
