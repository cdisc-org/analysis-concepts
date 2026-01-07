#!/usr/bin/env python3
"""
Update ADaM Class CSV files with OCCDS data from Excel.

This script reads the ADaM_OCCDS_v1.1.xlsx file and appends:
1. Data Structures to adam-class-dataset.csv
2. Variables to adam-class-var.csv
"""

import pandas as pd
from pathlib import Path


def update_datasets(excel_path: Path, csv_path: Path):
    """Append OCCDS data structures to adam-class-dataset.csv."""
    print(f"Reading Data Structures from {excel_path}...")

    # Read Excel
    df_excel = pd.read_excel(excel_path, sheet_name="Data Structures")

    # Read existing CSV
    df_existing = pd.read_csv(csv_path, delimiter=";")

    # Check what's already in CSV
    existing_names = set(df_existing["Data Structure Name"].unique())
    print(f"  Existing datasets: {existing_names}")

    # Filter to new datasets only
    df_new = df_excel[~df_excel["Data Structure Name"].isin(existing_names)]
    print(f"  New datasets to add: {list(df_new['Data Structure Name'].unique())}")

    if len(df_new) == 0:
        print("  No new datasets to add.")
        return

    # Ensure column order matches existing CSV
    columns = list(df_existing.columns)
    df_new = df_new[columns]

    # Append to CSV
    df_combined = pd.concat([df_existing, df_new], ignore_index=True)
    df_combined.to_csv(csv_path, sep=";", index=False)
    print(f"  Added {len(df_new)} datasets to {csv_path}")


def update_variables(excel_path: Path, csv_path: Path):
    """Append OCCDS variables to adam-class-var.csv."""
    print(f"Reading Variables from {excel_path}...")

    # Read Excel
    df_excel = pd.read_excel(excel_path, sheet_name="Variables")

    # Read existing CSV
    df_existing = pd.read_csv(csv_path, delimiter=";")

    # Create composite key for deduplication (Variable Name + Data Structure Name)
    df_existing["_key"] = (
        df_existing["Variable Name"] + "|" + df_existing["Data Structure Name"]
    )
    existing_keys = set(df_existing["_key"].unique())

    df_excel["_key"] = (
        df_excel["Variable Name"] + "|" + df_excel["Data Structure Name"]
    )

    # Filter to new variables only
    df_new = df_excel[~df_excel["_key"].isin(existing_keys)]
    print(f"  Variables in Excel: {len(df_excel)}")
    print(f"  Existing variables: {len(existing_keys)}")
    print(f"  New variables to add: {len(df_new)}")

    if len(df_new) == 0:
        print("  No new variables to add.")
        return

    # Drop the helper column
    df_existing = df_existing.drop(columns=["_key"])
    df_new = df_new.drop(columns=["_key"])

    # Ensure column order matches existing CSV
    columns = list(df_existing.columns)

    # Handle any NaN values - convert to empty strings
    df_new = df_new[columns].fillna("")

    # Append to CSV
    df_combined = pd.concat([df_existing, df_new], ignore_index=True)
    df_combined.to_csv(csv_path, sep=";", index=False)
    print(f"  Added {len(df_new)} variables to {csv_path}")


def main():
    script_dir = Path(__file__).parent
    adam_model_dir = script_dir / "data" / "metadata" / "adam-model"

    excel_path = adam_model_dir / "ADaM_OCCDS_v1.1.xlsx"
    dataset_csv_path = adam_model_dir / "adam-class-dataset.csv"
    var_csv_path = adam_model_dir / "adam-class-var.csv"

    # Update datasets
    update_datasets(excel_path, dataset_csv_path)

    # Update variables
    update_variables(excel_path, var_csv_path)

    print("\nDone!")


if __name__ == "__main__":
    main()
