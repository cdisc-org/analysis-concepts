# Neo4j Analysis Concepts Database

This directory contains the Neo4j graph database implementation for the CDISC Analysis Concepts (AC) project. The graph model enables powerful queries for AC template libraries, execution ordering, data lineage tracking, and sponsor-specific ADaM implementations.

## 📋 Contents

### Cypher Scripts

1. **schema.cypher** - Database schema (constraints, indexes)
2. **data_adam_class_variables.cypher** - ADaM IG class variable definitions
3. **data_ac_templates.cypher** - Reusable AC templates (T_AC_001, T_AC_002)
4. **data_sponsor_model.cypher** - Sponsor-specific ADaM model (Acme Pharmaceuticals example)
5. **data_ac_study_instances.cypher** - Study-specific AC instances (D_AC_001, D_AC_002)
6. **data_sdtm.cypher** - Source SDTM data (10 subjects, DM and VS domains)
7. **data_derived.cypher** - Derived ADaM data showing execution chain
8. **queries.cypher** - Common application queries

### Python Tools

- **neo4j_loader.py** - Python script to load data into Neo4j
- **requirements_neo4j.txt** - Python dependencies

## 🚀 Quick Start

### 1. Prerequisites

- Neo4j database (local or remote) - see [.env configuration](#-environment-configuration)
- Python 3.8+
- pip

### 2. Install Python Dependencies

```bash
pip install -r requirements_neo4j.txt
```

### 3. Configure Environment

The loader uses the `.env` file in the parent directory. Ensure it contains:

```env
NEO4J_URI=neo4j://127.0.0.1:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=ADAM-AC-TEST
```

### 4. Load All Data

```bash
python neo4j_loader.py --all
```

This will:
1. Create the schema (constraints and indexes)
2. Load ADaM class variables
3. Load AC templates
4. Load sponsor model
5. Load AC study instances
6. Load SDTM source data (10 subjects)
7. Load derived ADaM data

### 5. Verify Data Load

```bash
python neo4j_loader.py --query "1"
```

This runs "Query 1: List All AC Templates" to verify the data loaded successfully.

## 📚 Usage Examples

### Load Schema Only

```bash
python neo4j_loader.py --schema
```

### Load Data Only (assumes schema exists)

```bash
python neo4j_loader.py --data
```

### Load Specific File

```bash
python neo4j_loader.py --file data_ac_templates.cypher
```

### Clear and Reload Everything

⚠️ **WARNING**: This deletes all existing data!

```bash
python neo4j_loader.py --clear --all
```

### Run Specific Query

```bash
# By query number
python neo4j_loader.py --query "1"

# By query name (partial match)
python neo4j_loader.py --query "LIST ALL AC TEMPLATES"
python neo4j_loader.py --query "EXECUTION ORDER"
```

## 🔍 Graph Model

### Node Types

- **ACTemplate** - Reusable AC patterns referencing ADaM class variables
- **ACStudyInstance** - Study-specific AC implementations
- **SponsorADaMModel** - Container for sponsor's ADaM implementation
- **ADaMVariableClass** - ADaM IG class variable definitions
- **ADaMIGVariable** - Sponsor-specific variable implementations
- **ADaMDataset** - ADaM dataset containers
- **DataNode** - Actual data records (SDTM or derived)
- **Subject** - Study subjects
- **AnalysisInput** - Input specifications
- **AnalysisOutput** - Output specifications
- **AnalysisMethod** - Method specifications

### Key Relationships

- `INSTANTIATES` - ACStudyInstance → ACTemplate
- `DEPENDS_ON` - AC → AC (execution dependencies)
- `HAS_INPUT` - AC → AnalysisInput
- `HAS_OUTPUT` - AC → AnalysisOutput
- `OF_CLASS` - ADaMIGVariable → ADaMVariableClass
- `DERIVED_BY_AC` - DataNode → AC
- `DERIVED_FROM` - DataNode → DataNode (lineage)
- `FOR_SUBJECT` - DataNode → Subject

## 📊 Example Queries

### 1. List All AC Templates

```cypher
MATCH (t:ACTemplate)
OPTIONAL MATCH (t)-[:HAS_INPUT]->(i:AnalysisInput)
OPTIONAL MATCH (t)-[:HAS_OUTPUT]->(o:AnalysisOutput)
RETURN t.id, t.name, t.purpose,
       COLLECT(DISTINCT i.sourceClassVariable) as inputs,
       COLLECT(DISTINCT o.classVariableName) as outputs
ORDER BY t.id;
```

### 2. Get Execution Order for ACs

```cypher
MATCH (ac:ACStudyInstance)
WHERE ac.id IN ['D_AC_001', 'D_AC_002']
OPTIONAL MATCH path = (ac)-[:DEPENDS_ON*]->(dep:ACStudyInstance)
WITH ac, length(path) as depth
RETURN ac.id, ac.name, MAX(depth) as executionLevel
ORDER BY executionLevel, ac.id;
```

### 3. Trace Data Lineage for a Subject

```cypher
MATCH path = (sdtm:DataNode {sourceType: 'SDTM'})-[:DERIVED_FROM*0..5]-(derived:DataNode)
WHERE derived.usubjid = 'ACME-001'
  AND derived.paramcd = 'SYSBP'
  AND derived.visitnum = 2
MATCH (derived)-[:DERIVED_BY_AC]->(ac)
RETURN nodes(path) as lineage, COLLECT(ac.id) as appliedACs;
```

## 🏗️ Sample Data

The database contains:

- **2 AC Templates**: Baseline Flag (T_AC_001), Change from Baseline (T_AC_002)
- **2 Study Instances**: Baseline SYSBP Flag (D_AC_001), Change from Baseline SYSBP (D_AC_002)
- **1 Sponsor Model**: Acme Pharmaceuticals with 2 datasets (ADSL, ADVS)
- **17 ADaM Class Variables**: USUBJID, AVAL, ADT, TRTSDT, BASE, CHG, ABLFL, etc.
- **10 Subjects**: ACME-001 through ACME-010
- **10 DM Records**: Demographics with treatment start dates
- **30 VS Records**: Systolic BP at Baseline, Week 2, and Week 4
- **30 Derived Records**: 10 baseline flags + 20 change from baseline values

## 🎯 Use Cases

### For Application Development

1. **Template Library**: Browse and filter available AC templates
2. **Execution Planning**: Determine correct order to execute ACs
3. **Data Mapping**: Map sponsor variables to AC inputs
4. **Validation**: Verify all required inputs are configured
5. **Lineage Tracking**: Trace data provenance from SDTM to final analysis

### For Analysis

1. **Template Discovery**: Search templates by statistical concept
2. **Impact Analysis**: Find all ACs that depend on a specific template
3. **Usage Patterns**: See how templates are instantiated across studies
4. **Data Quality**: Verify execution chain integrity

## 🔧 Environment Configuration

The `.env` file (in parent directory) supports both local and remote Neo4j:

### Local Neo4j

```env
NEO4J_URI=neo4j://127.0.0.1:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=ADAM-AC-TEST
```

### Neo4j Aura (Cloud)

```env
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-aura-password
```

## 🐛 Troubleshooting

### Connection Failed

```
✗ Failed to connect to Neo4j: Could not connect...
```

**Solution**:
- Verify Neo4j is running: `neo4j status`
- Check `.env` credentials are correct
- Ensure firewall allows port 7687

### Import Errors

```
ModuleNotFoundError: No module named 'neo4j'
```

**Solution**:
```bash
pip install -r requirements_neo4j.txt
```

### Constraint Violations

If you see constraint violation errors during data load, the database may contain conflicting data.

**Solution**:
```bash
python neo4j_loader.py --clear --all
```

## 📖 Additional Resources

- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/current/)
- [Neo4j Python Driver Documentation](https://neo4j.com/docs/python-manual/current/)
- [CDISC Analysis Concepts on GitHub](https://github.com/cdisc-org/analysis-concepts)

## 📝 License

This project follows the CDISC Analysis Concepts repository licenses:
- Code & Scripts: MIT License
- Content: CC-BY-4.0 License
