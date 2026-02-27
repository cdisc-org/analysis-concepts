# PowerPoint Creation Prompt - Part 1 (Slides 1-18)

**INSTRUCTIONS FOR CLAUDE PROJECT:**

I need you to create a PowerPoint presentation (Part 1 of 2: slides 1-18) about the AC/DC Framework for clinical trial analysis. Please create this as a detailed artifact that I can use to build the slides.

**Background Context:**
Upload these documents to the Project Knowledge for reference:
- ACDC_Framework_Overview.docx
- CTM_Draft_v3.docx
- ACDC_Methods_Templates_DEL_v3.docx
- statistical_methods_reference.docx

**Target Audience:** Mixed audience of statistical programmers, statisticians, and standards administrators in pharma/biotech

**Presentation Goals:**
- Duration: 45-60 minutes total (Part 1 covers first 30 minutes)
- Dual focus: (1) Awareness - what is AC/DC and why it matters, (2) Understanding - how it works technically
- Format: Static code examples (no live demos)

**Key Improvements Based on Feedback:**
1. Add scaffolding between "functions" and "SDMX cubes" - show current state (SQL/R syntax) and why it's language-dependent
2. Introduce solution as SDMX cube structure before diving into details
3. Call TEs "Semantic Transformation Elements" throughout
4. Clearly explain CTM as a formal model containing these entities
5. Show relationship between CTM (defines concepts) and SDMX roles (determines usage)

## Slides to Create: 1-18

### Part 1: The Problem (Slides 1-4) - 8 minutes

#### Slide 1: Title Slide
- Title: "The AC/DC Framework"
- Subtitle: "Analysis Concepts & Derivation Concepts for Clinical Trial Analysis"
- Include space for: presenter name, affiliation, date, venue
- Visual: Clean, professional title slide with CDISC branding if possible

#### Slide 2: The Pain Point
- Title: "Everything is Hardcoded"
- Show this code example prominently:
```sas
proc mixed data=adam.adqsadas;
  where PARAMCD="ACTOT11" and EFFFL="Y";
  model CHG = BASE SITEID TRTP;
run;
```
- Call-out boxes pointing to what's embedded:
  - Dataset name: adqsadas
  - Variable names: CHG, BASE, TRTP, SITEID
  - Filter conditions: PARAMCD, EFFFL values
- Bottom text: "Different parameter? → Copy-paste, change values. Different study? → Rewrite everything."
- Include: "Show of hands - who has written the same ANCOVA program 10+ times?"

#### Slide 3: Current "Solutions" That Don't Scale
- Title: "An automated approach – tied to specific language"
- Split screen layout:

**Left side - YAML + R:**
```yaml
table:
  name: ADSL
  filter_domain:
    - dm: '!is.na(AGE)'  # R syntax
  column_action:
    AGE_GRP1:
      code_id: "age_group_01.R" # code file
```

**Right side - DSL:**
```
if DM.DTHFL = 'Y'
  and the latest of
    ([ADSL.LSTALVDT + 1 day, ADSL.DTHDTC])
  is not later than 2023-07-01,
then set to the latest of
    ([ADSL.LSTALVDT + 1 day, ADSL.DTHDTC]),
else set to blank.
```

- Bottom: "Common Problems" table:
  - Proprietary: Each company invents its own format
  - Platform-specific: Tied to R ecosystem or custom interpreters
  - Spec ≠ Code: Logic hidden in external files or requires custom parser
  - Not portable: Can't be shared across companies or tools
  - Missing intent: Tells us HOW to compute, but not the analytical purpose

#### Slide 4: What's Missing
- Title: "What's Missing"
- Large text with visual emphasis:
  - Current approaches tell us **HOW** to compute
  - But they don't capture **WHAT** we're really trying to do
  - Missing: Clinical intent, analytical purpose, the "why"
- Bottom: Preview box: "The AC/DC Framework provides this missing layer"

### Part 2: The Core Insight (Slides 5-7) - 8 minutes

#### Slide 5: Separating "What" from "How" from "Where"
- Title: "The Big Idea: Separating 'What' from 'How' from 'Where'"
- Visual: Three colored boxes with arrows between them:
  - **WHAT (green):** "Change from baseline for ADAS-Cog at Week 24" - Clinical intent
  - **HOW (blue):** "Subtraction: target = minuend - subtrahend" - Method
  - **WHERE (orange):** "CHG = AVAL - BASE in ADQSADAS dataset" - Implementation
- Key insight box: "Current approaches mix all three together → inflexible, not reusable"

#### Slide 6: Everything is a Function
- Title: "Everything is a Function"
- Central visual: Large formula **OUTPUT = f(INPUT)**
- Below: Flow diagram showing:
  - Input Cube → [Function (Method)] → Output Cube
- Examples with icons:
  - Derivations: AVAL, BASE → [Subtraction] → CHG
  - Analyses: CHG, BASE, TRT → [ANCOVA] → LS Means, p-values
- Bottom text: "This is how we already think about analysis - what's new is making it explicit and machine-executable"

#### Slide 7: How We Get Data Today (As-Is)
- Title: "How We Get Data Today (As-Is)"
- Subtitle: "Language-Dependent Syntax"
- Show three code examples side by side:

**SQL:**
```sql
SELECT subject, visit, AVG(value) as mean_value
FROM measurements
WHERE parameter = 'ADAS-Cog' AND population_flag = 'Y'
GROUP BY subject, visit;
```

**SAS:**
```sas
proc means data=measurements;
  where parameter='ADAS-Cog' and population_flag='Y';
  class subject visit;
  var value;
run;
```

**R:**
```r
measurements %>%
  filter(parameter == "ADAS-Cog", population_flag == "Y") %>%
  group_by(subject, visit) %>%
  summarize(mean_value = mean(value))
```

- Bottom text (large, emphasized): "**Problem:** Same analytical intent, but syntax is programming language dependent"
- Call-out box: "Can't share specifications across platforms. Each language needs its own code."

#### Slide 8: Solution - SDMX Data Cube Structure
- Title: "Solution: SDMX Data Cube Structure"
- Subtitle: "Language-Independent Specification"
- Content:
  - **SDMX:** Statistical Data and Metadata eXchange (ISO 17369)
  - Used by statistical agencies worldwide (OECD, Eurostat, IMF, World Bank)
  - **Key Benefit:** Roles carry computational semantics - no language-specific syntax needed
- Visual: Simple cube diagram with labeled axes
- Three-column comparison table:

| Aspect | Language-Dependent | SDMX Cube (Language-Independent) |
|--------|-------------------|----------------------------------|
| **Specification** | SQL/SAS/R syntax | Cube roles (Dimension, Measure, Attribute) |
| **Semantics** | Embedded in code | Explicit in structure |
| **Portability** | Rewrite for each language | Generate any language from same spec |

- Bottom (large text): "**The cube structure itself IS the specification** - generators produce SAS, R, Python, SQL from the same source"

#### Slide 9: Preview - The Three-Layer Architecture
- Title: "Preview: The Three-Layer Architecture"
- Simplified diagram showing three stacked layers:
  - **Layer 1 (green):** Analysis/Derivation Specification (Templates & Instances)
  - **Layer 2 (blue):** Clinical Transformation Model (CTM) - Semantic Concepts
  - **Layer 3 (orange):** Implementation (ADaM/SDTM/Study binding)
- Arrows showing connections between layers
- Call-out boxes:
  - Layer 2: "CTM defines the vocabulary of Semantic Transformation Elements"
  - Connection L1→L2: "Templates assign SDMX roles to CTM entities"
  - Connection L2→L3: "CTM entities bind to physical variables"
- Bottom text: "We'll build up to this. First, we need to understand the CTM vocabulary."

### Part 3: Building the Vocabulary (Slides 10-14) - 10 minutes

#### Slide 10: The Clinical Transformation Model (CTM)
- Title: "The Clinical Transformation Model (CTM)"
- Subtitle: "A Formal Model for Clinical Trial Data Transformations"
- Definition box (large, prominent): "The CTM is a formal semantic model that defines entities, properties, and relationships for clinical trial data transformations"
- Three sections with icons:

**📚 What the CTM Contains:**
- Semantic Transformation Elements (entities with properties)
- Relationships between elements (dependencies, derivations)
- Categories and hierarchies

**🎯 Purpose:**
- Provides standard-independent vocabulary for clinical concepts
- Separates semantic meaning from physical implementation
- Enables interoperability across data standards

**🔗 How It's Used:**
- Layer 1 (Templates) assign SDMX cube roles to CTM entities
- Layer 2 (CTM) defines what concepts mean
- Layer 3 (Implementation) binds CTM entities to physical variables

- Bottom text: "Think of CTM as the 'dictionary' - it defines concepts that can be used across ADaM, SDTM, OMOP, FHIR"

#### Slide 11: Semantic Transformation Elements (TEs)
- Title: "Semantic Transformation Elements (TEs)"
- Subtitle: "Entities in the Clinical Transformation Model"
- Definition box: "TEs are named entities in the CTM representing standard-independent data concepts"
- Key principle (highlighted): "TEs are abstract concepts - they work across ADaM, SDTM, OMOP, FHIR"
- Visual showing two levels:
  - **Observation-level:** subject/visit/timepoint data (granular)
  - **Inference-level:** statistical outputs (aggregate)
- Important distinction box:
  - "**Semantic TE** (CTM entity): `change_value` - the concept of change from baseline"
  - "**Physical Variable** (implementation): `CHG` in ADaM, derived in SDTM, computed in OMOP"
  - "**SDMX Role** (from template): `change_value` assigned as MEASURE in data cube"

#### Slide 12: Observation-level Semantic TEs
- Title: "Observation-level Semantic TEs"
- Subtitle: "CTM entities at the subject/visit/timepoint granularity"
- Table with categories and examples:

| Category | Examples |
|----------|----------|
| **Value** | analysis_value, baseline_value, change_value, percent_change |
| **Identity** | subject, site, region, sequence |
| **Timing** | visit, timepoint, period, phase |
| **Treatment** | treatment_planned, treatment_actual, dose |
| **Flag** | population_flag, baseline_flag, treatment_emergent_flag |

- Call-out box: "Concrete example mapping:"
  - analysis_value → AVAL (ADaM) or STRESN (SDTM) or value_as_number (OMOP)
  - "Same concept, different physical implementations"

#### Slide 13: Inference-level Semantic TEs
- Title: "Inference-level Semantic TEs"
- Subtitle: "CTM entities at the analysis/comparison granularity"
- Table with categories:

| Category | Examples |
|----------|----------|
| **Estimate** | ls_mean, ls_mean_difference, odds_ratio, hazard_ratio |
| **Interval** | confidence_interval_lower, confidence_interval_upper |
| **Test** | p_value, t_statistic, f_statistic, degrees_of_freedom |
| **Descriptive** | count, mean, median, standard_deviation |

- Bottom text: "These are statistical outputs produced by analysis methods - also defined as Semantic TEs in the CTM"

#### Slide 14: Implementation Binding - CTM to Standards
- Title: "Implementation Binding: CTM to Standards"
- Subtitle: "How Semantic TEs map to physical implementations"
- Implementation binding table:

| Semantic TE (CTM Entity) | ADaM | SDTM | OMOP CDM |
|--------------------------|------|------|----------|
| change_value | CHG | (derived) | (derived) |
| treatment_planned | TRTP | DM.ARM | drug_concept_id |
| analysis_value | AVAL | --STRESN | measurement.value_as_number |

- Key message box (large text): "Define the analysis once using Semantic TEs from CTM, bind to different standards at implementation"
- Bottom: "This is the foundation for standard-independence"
- Call-out: "Same CTM entity → Different physical variables → Same analytical meaning"

### Part 4: Connecting CTM to SDMX (Slides 15-18) - 10 minutes

#### Slide 15: Connecting CTM to SDMX Cubes
- Title: "Connecting CTM to SDMX Cubes"
- Subtitle: "Two complementary models working together"
- Two-column comparison:

**Clinical Transformation Model (CTM)**
- **What it is:** Vocabulary of semantic concepts
- **What it defines:** Transformation Elements (entities)
- **Purpose:** Standard-independent meaning
- **Example:** `change_value` is a Semantic TE

**SDMX Data Cube**
- **What it is:** Structural specification
- **What it defines:** Component roles (Dimension, Measure, Attribute)
- **Purpose:** Machine-executable operations
- **Example:** `change_value` assigned MEASURE role

- Center: Large diagram showing connection with arrow
- Arrow label: "**Templates bind CTM entities to SDMX roles**"
- Bottom box: "CTM provides the vocabulary (WHAT), SDMX provides the structure (HOW it's organized), Templates connect them"

#### Slide 16: SDMX Component Types
- Title: "SDMX Data Cube: Three Component Types"
- Three sections with icons:

**DIMENSION (coordinates icon)**
- Identifies the observation - the "coordinates"
- Examples: subject, visit, parameter, treatment
- Think: GROUP BY variables, stratification axes

**MEASURE (numeric icon)**
- The observed/computed value - numeric quantities
- Examples: analysis_value, change_value, lsmean, p_value
- Think: The numbers being analyzed or produced

**ATTRIBUTE (tag icon)**
- Metadata that qualifies - context and flags
- Examples: population_flag, baseline_flag, unit
- Think: Filters, qualifiers, annotations

- Bottom: "Why SDMX? ISO standard (17369) for statistical data exchange"

#### Slide 17: Slices - Subsetting the Cube
- Title: "Slices: Subsetting the Cube"
- Visual comparison:

**Full Cube (all data):**
- Dimensions: subject, visit, parameter, treatment
- Measures: analysis_value, baseline_value, change_value
- Attributes: population_flag, baseline_flag

**Slice (specific analysis context):**
- Fixed: parameter = "ADAS-Cog(11)"
- Fixed: visit = "Week 24"
- Fixed: population_flag = "Y"
- Result: Subset for one specific analysis

- Use cube visual showing slice cutting through the cube
- Bottom: "Slicing creates the specific data context for a single analysis"

#### Slide 18: Machine-Executable - Roles Define Operations
- Title: "Machine-Executable: Roles Define Operations"
- Mapping table (large, prominent):

| SDMX Role | Generated Code Operation |
|-----------|--------------------------|
| DIMENSION | GROUP BY / CLASS / stratification |
| MEASURE (input) | Function arguments / MODEL variables |
| MEASURE (output) | Return values / result columns |
| ATTRIBUTE (fixed) | WHERE clause / filter condition |

- Three bullet points "Why This Works:"
  - **Declarative, not procedural:** Specify structure, not steps
  - **Platform independent:** Same cube → SAS, R, Python
  - **Unambiguous semantics:** Generator knows exactly what to do

- Bottom (large text): "The cube structure IS the specification"
- Call-out: "This solves the language-dependency problem from Slide 7!"

---

## Design Guidelines for All Slides:

**Visual Style:**
- Clean, professional layout
- Consistent color scheme:
  - Green for Layer 1 / "What" concepts
  - Blue for Layer 2 / "How" concepts
  - Orange for Layer 3 / "Where" concepts
- Use icons where appropriate (avoid clipart, use professional icons)
- Code blocks: monospace font with syntax highlighting
- Tables: clean formatting, alternating row colors

**Typography:**
- Slide titles: Large, bold, declarative
- Body text: Clear, readable (not too small)
- Key messages: Larger text for emphasis
- Code: Monospace, properly formatted

**Layout:**
- Not too text-heavy (use visuals where possible)
- Adequate whitespace
- Progressive disclosure (build animations) for complex slides
- Consistent header/footer with slide numbers

**Running Example:**
- Use ADAS-Cog ANCOVA as the concrete example throughout
- This appears on slides 2, 7, and will continue through Part 2

## Output Format:

Please create a PowerPoint presentation with these 18 slides. If you cannot create .pptx directly, please create detailed slide descriptions that include:
1. Exact text for each element
2. Description of visuals/diagrams
3. Layout suggestions
4. Color coding
5. Any build/animation sequences

## Key Pedagogical Flow:

**Slides 1-6:** Establish the problem and the "function" mental model
**Slides 7-8:** Bridge from current state (language-dependent) to solution (SDMX cubes)
**Slide 9:** Preview the three-layer architecture with CTM explicitly named
**Slides 10-14:** Build vocabulary - introduce CTM, then Semantic TEs, then implementation bindings
**Slide 15:** Connect CTM (vocabulary) to SDMX (structure) via Templates
**Slides 16-18:** Deep dive into SDMX component types, slices, and machine executability

After completing Part 1, I will provide the prompt for Part 2 (slides 19-30).
