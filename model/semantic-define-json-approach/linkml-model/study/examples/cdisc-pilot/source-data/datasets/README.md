# Datasets Directory

Place ADaM and SDTM dataset files here. These files will NOT be committed to git.

## Supported Formats

- **SAS XPT files**: Standard CDISC dataset format (`.xpt`)
- **CSV files**: Converted datasets (`.csv`)
- **Variable lists**: Text files listing variables and their properties

## What to Include

### ADaM Datasets
Place ADaM datasets here (e.g., ADSL, ADLBC, ADAE, ADTTE):

```
adsl.xpt
adlbc.xpt
adae.xpt
adtte.xpt
```

### SDTM Datasets (Optional)
If available, SDTM source datasets:

```
dm.xpt
lb.xpt
vs.xpt
ae.xpt
```

### Variable Lists (Alternative)
If you can't share actual data, provide variable lists:

```
adsl-variables.txt
adlbc-variables.txt
```

Example format:
```
Variable: USUBJID
Label: Unique Subject Identifier
Type: Char
Length: 50
Role: IDENTIFIER

Variable: CHG
Label: Change from Baseline
Type: Num
Format: 8.2
Derivation: AVAL - BASE
```

## What I Need

I primarily need to understand:

1. **Variable names**: What variables exist?
2. **Variable types**: Char, Num, Date, etc.
3. **Variable roles**: IDENTIFIER, TIMING, RESULT, etc.
4. **Derivations**: How were variables derived? (especially for analysis variables like CHG, PCHG)
5. **Relationships**: Which variables map to which concepts?

The Define-XML typically contains most of this information, so actual dataset files are optional.

## Privacy Note

These files are git-ignored to avoid committing potentially sensitive or large data files to the repository.
