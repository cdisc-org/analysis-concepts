import csv
import json

csv_file = '/Users/kwl/repos/Github/CDISC/analysis-concepts/model/adam-ac/source-files/ADaMIG_v1.3.csv'
json_file = '/Users/kwl/repos/Github/CDISC/analysis-concepts/model/adam-ac/adam-class-variables.json'

variables = []

with open(csv_file, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        variable = {
            "version": row["Version"],
            "dataStructureName": row["Data Structure Name"],
            "variableSet": row["Variable Set"],
            "variableName": row["Variable Name"],
            "variableLabel": row["Variable Label"],
            "type": row["Type"],
            "cdiscCtCodelistCodes": row["CDISC CT Codelist Code(s)"],
            "cdiscCtCodelistSubmissionValues": row["CDISC CT Codelist Submission Value(s)"],
            "describedValueDomains": row["Described Value Domain(s)"],
            "valueListValue": row["Value List Value"],
            "core": row["Core"],
            "cdiscNotes": row["CDISC Notes"]
        }
        variables.append(variable)

output = {"variables": variables}

with open(json_file, 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"Successfully converted {len(variables)} variables to {json_file}")
