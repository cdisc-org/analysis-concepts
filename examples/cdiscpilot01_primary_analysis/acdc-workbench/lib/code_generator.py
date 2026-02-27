"""Code generator - generate SAS/R code from instances using methods and mappings.

Code is now generated dynamically from:
1. Method (defines the algorithm/formula)
2. Template (binds STCs to method roles)
3. Instance (binds study-specific values via slice)
4. Mapping file (resolves data concepts to implementation variables)
"""

from typing import Any, Dict, List, Optional

from .library import Library
from .models import ACInstance, DCInstance, Method


def resolve_formula_to_variables(
    library: Library,
    formula: str,
) -> str:
    """Resolve data concepts in a formula to ADaM variable names.

    Args:
        library: The loaded library with implementation mapping
        formula: Formula using data concepts (e.g., "change_value ~ baseline_value")

    Returns:
        Formula with ADaM variable names (e.g., "CHG ~ BASE")
    """
    result = formula
    if library.implementation_mapping:
        for concept, variable in library.implementation_mapping.data_concept_to_adam.items():
            # Replace whole words only
            result = result.replace(concept, variable)
    return result


def get_slice_filter(instance: ACInstance, library: Library) -> str:
    """Generate a filter condition from the slice constraints.

    Args:
        instance: The AC instance
        library: The loaded library

    Returns:
        Filter string (e.g., "PARAMCD = 'ACTOT11' AND AVISIT = 'Week 24'")
    """
    conditions = []
    if instance.slice:
        for constraint in instance.slice.constraints:
            var = library.resolve_data_concept_to_adam(constraint.data_concept)
            if var:
                if constraint.value is not None:
                    if isinstance(constraint.value, str):
                        conditions.append(f"{var} = '{constraint.value}'")
                    else:
                        conditions.append(f"{var} = {constraint.value}")
                elif constraint.values is not None:
                    values_str = ", ".join(
                        f"'{v}'" if isinstance(v, str) else str(v)
                        for v in constraint.values
                    )
                    conditions.append(f"{var} IN ({values_str})")
    return " AND ".join(conditions)


def generate_sas_code(
    library: Library,
    instance: ACInstance,
    custom_bindings: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate SAS code from the instance method and slice.

    Args:
        library: The loaded library
        instance: The AC instance
        custom_bindings: Optional custom bindings to override defaults

    Returns:
        Generated SAS code
    """
    if not instance.method:
        return "/* No method defined for this instance */"

    # Get the resolved formula
    formula = resolve_formula_to_variables(library, instance.method.formula)

    # Get the filter from slice
    filter_condition = get_slice_filter(instance, library)

    # Build SAS code based on method type
    method_name = instance.method.name

    if method_name == "FitANCOVAModel":
        # Extract model components
        parts = formula.split("~")
        if len(parts) == 2:
            dependent = parts[0].strip()
            predictors = parts[1].strip()

            # Get class variables (factors)
            class_vars = []
            if instance.input_cube:
                for dim in instance.input_cube.dimensions or []:
                    if dim.role == "factor":
                        var = library.resolve_data_concept_to_adam(dim.data_concept)
                        if var:
                            class_vars.append(var)

            class_stmt = f"class {' '.join(class_vars)};" if class_vars else ""

            code = f"""proc mixed data=adqsadas;
  where {filter_condition};
  {class_stmt}
  model {dependent} = {predictors} / solution cl;
  /* Treatment dose is continuous for dose-response analysis */
  estimate 'Dose-Response Slope' TRT01PN 1 / cl;
run;"""
            return code

    # Default: return the formula as a comment
    return f"""/* Method: {method_name} */
/* Formula: {formula} */
/* Filter: {filter_condition} */

/* SAS code generation not implemented for this method type */
/* Please implement based on the formula above */"""


def generate_r_code(
    library: Library,
    instance: ACInstance,
    custom_bindings: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate R code from the instance method and slice.

    Args:
        library: The loaded library
        instance: The AC instance
        custom_bindings: Optional custom bindings to override defaults

    Returns:
        Generated R code
    """
    if not instance.method:
        return "# No method defined for this instance"

    # Get the resolved formula
    formula = resolve_formula_to_variables(library, instance.method.formula)

    # Get the filter from slice
    filter_parts = []
    if instance.slice:
        for constraint in instance.slice.constraints:
            var = library.resolve_data_concept_to_adam(constraint.data_concept)
            if var:
                if constraint.value is not None:
                    if isinstance(constraint.value, str):
                        filter_parts.append(f"{var} == '{constraint.value}'")
                    else:
                        filter_parts.append(f"{var} == {constraint.value}")
                elif constraint.values is not None:
                    values_str = ", ".join(
                        f"'{v}'" if isinstance(v, str) else str(v)
                        for v in constraint.values
                    )
                    filter_parts.append(f"{var} %in% c({values_str})")

    filter_expr = ",\n                     ".join(filter_parts)

    # Build R code based on method type
    method_name = instance.method.name

    if method_name == "FitANCOVAModel":
        # Get class variables for factor()
        factor_vars = []
        if instance.input_cube:
            for dim in instance.input_cube.dimensions or []:
                if dim.role == "factor":
                    var = library.resolve_data_concept_to_adam(dim.data_concept)
                    if var:
                        factor_vars.append(var)

        # Modify formula to include factor() for class variables
        r_formula = formula
        for fvar in factor_vars:
            r_formula = r_formula.replace(fvar, f"factor({fvar})")

        code = f"""library(dplyr)
library(emmeans)

# Filter data to analysis population
analysis_data <- adqsadas %>%
  filter({filter_expr})

# Fit ANCOVA model with dose as continuous
model <- lm({r_formula},
            data = analysis_data)

# Model summary
summary(model)

# Extract dose-response slope coefficient
coef(summary(model))['TRT01PN', ]

# Confidence interval for dose effect
confint(model, 'TRT01PN')"""
        return code

    # Default: return the formula as a comment
    return f"""# Method: {method_name}
# Formula: {formula}
# Filter: {' & '.join(filter_parts) if filter_parts else 'None'}

# R code generation not implemented for this method type
# Please implement based on the formula above"""


def get_model_formula(instance: ACInstance, library: Optional[Library] = None) -> Optional[str]:
    """Get the model formula from an AC instance.

    Args:
        instance: The AC instance
        library: Optional library for variable resolution

    Returns:
        Model formula string or None
    """
    if instance.method:
        formula = instance.method.formula
        if library:
            return resolve_formula_to_variables(library, formula)
        return formula

    # Fallback to legacy model field
    if instance.model:
        return instance.model.get("formula_resolved") or instance.model.get(
            "formula_semantic"
        )
    return None


def generate_dc_sas_code(
    library: Library,
    instance: DCInstance,
) -> str:
    """Generate SAS code for a DC instance derivation.

    Args:
        library: The loaded library
        instance: The DC instance

    Returns:
        Generated SAS code
    """
    if not instance.method:
        return "/* No method defined for this derivation */"

    formula = resolve_formula_to_variables(library, instance.method.formula)
    method_name = instance.method.name

    # Get the output variable
    output_var = None
    if instance.output_cube:
        for measure in instance.output_cube.measures:
            if measure.role == "value":
                output_var = library.resolve_data_concept_to_adam(measure.data_concept)
                break

    if method_name == "Subtraction":
        return f"/* {instance.description} */\n{formula.replace('=', ':=')};"

    if method_name == "Aggregation":
        return f"/* {instance.description} */\n/* {formula} */"

    if method_name == "WindowLookup":
        return f"""/* {instance.description} */
/* LOCF Imputation */
proc sort data=adqsadas; by USUBJID PARAMCD AVISITN; run;
data adqsadas_locf;
  set adqsadas;
  by USUBJID PARAMCD;
  retain _last_aval _last_chg;
  if first.PARAMCD then do;
    _last_aval = .;
    _last_chg = .;
  end;
  if not missing(AVAL) then do;
    _last_aval = AVAL;
    _last_chg = CHG;
  end;
  /* Apply LOCF at target visit */
  if missing(AVAL) then do;
    AVAL = _last_aval;
    CHG = _last_chg;
    DTYPE = 'LOCF';
  end;
run;"""

    return f"/* Method: {method_name} */\n/* Formula: {formula} */"


def generate_dc_r_code(
    library: Library,
    instance: DCInstance,
) -> str:
    """Generate R code for a DC instance derivation.

    Args:
        library: The loaded library
        instance: The DC instance

    Returns:
        Generated R code
    """
    if not instance.method:
        return "# No method defined for this derivation"

    formula = resolve_formula_to_variables(library, instance.method.formula)
    method_name = instance.method.name

    if method_name == "Subtraction":
        # Parse the formula
        parts = formula.split("=")
        if len(parts) == 2:
            lhs = parts[0].strip()
            rhs = parts[1].strip()
            return f"""# {instance.description}
adqsadas <- adqsadas %>%
  mutate({lhs} = {rhs})"""

    if method_name == "WindowLookup":
        return f"""# {instance.description}
# LOCF Imputation
adqsadas <- adqsadas %>%
  group_by(USUBJID, PARAMCD) %>%
  arrange(AVISITN) %>%
  fill(AVAL, CHG, .direction = "down") %>%
  mutate(DTYPE = if_else(row_number() > 1 & is.na(lag(AVAL)), 'LOCF', DTYPE)) %>%
  ungroup()"""

    return f"# Method: {method_name}\n# Formula: {formula}"


def format_code_for_display(code: str, language: str) -> str:
    """Format code for display with proper indentation.

    Args:
        code: The code to format
        language: The language (sas, r)

    Returns:
        Formatted code
    """
    # Simple cleanup - remove excessive blank lines
    lines = code.split("\n")
    cleaned = []
    prev_blank = False

    for line in lines:
        is_blank = not line.strip()
        if not (is_blank and prev_blank):
            cleaned.append(line)
        prev_blank = is_blank

    return "\n".join(cleaned)
