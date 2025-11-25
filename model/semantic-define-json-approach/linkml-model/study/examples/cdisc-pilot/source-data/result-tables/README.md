# Result Tables Directory

Place result table files here. These files will NOT be committed to git.

## Supported Formats

- **PDF files**: Screenshots or exports of result tables
- **CSV files**: Tabular result data
- **Excel files**: Result tables with formatting
- **Screenshots**: PNG/JPG of tables from documents

## Naming Convention

Use descriptive names that indicate the analysis:

```
table-14-2-01-efficacy-ancova.pdf
table-14-3-01-safety-adverse-events.csv
figure-14-1-01-efficacy-plot.png
```

## What to Include

For each analysis, provide:

1. **The result table** showing the actual analysis results
2. **Dimensions**: What are the row/column groupings?
3. **Measures**: What statistics are displayed?
   - Means, differences, p-values, confidence intervals, etc.
   - Display formats (e.g., "8.2f", "p<0.001")

## Example Structure

If you have a result table showing:

```
Treatment    | N   | LS Mean | Diff vs Placebo | 95% CI        | P-value
-------------|-----|---------|-----------------|---------------|--------
Placebo      | 50  | -0.5    | -               | -             | -
Drug 10mg    | 48  | -1.2    | -0.7            | (-1.1, -0.3)  | 0.002
Drug 20mg    | 52  | -1.8    | -1.3            | (-1.7, -0.9)  | <0.001
```

This helps me create the CUBE structure with appropriate dimensions and measures.

## Privacy Note

These files are git-ignored to avoid committing potentially sensitive or large files to the repository.
