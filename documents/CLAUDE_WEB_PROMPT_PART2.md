# PowerPoint Creation Prompt - Part 2 (Slides 19-30)

**INSTRUCTIONS FOR CLAUDE PROJECT:**

This is Part 2 of the AC/DC Framework presentation. You should have already created slides 1-18 from Part 1. Now create slides 19-30 to complete the deck.

**Background Context:**
The documents are already in Project Knowledge:
- ACDC_Framework_Overview.docx
- CTM_Draft_v3.docx
- ACDC_Methods_Templates_DEL_v3.docx
- statistical_methods_reference.docx

**Target Audience:** Mixed audience of statistical programmers, statisticians, and standards administrators in pharma/biotech

**Presentation Goals:**
- Duration: 45-60 minutes total (Part 2 covers final 30 minutes)
- Dual focus: (1) Awareness - what is AC/DC and why it matters, (2) Understanding - how it works technically
- Format: Static code examples (no live demos)

**Continuation Context:** The audience now understands:
- The problem (hardcoded analyses, language-dependent syntax)
- The "What/How/Where" separation
- The function mental model (INPUT → Method → OUTPUT)
- Clinical Transformation Model (CTM) as the formal model
- Semantic Transformation Elements (TEs) as CTM entities
- SDMX Data Cube structure (Dimension, Measure, Attribute)
- How CTM and SDMX connect via Templates

**What's Next:** Now we show how Methods and Templates work, then put everything together with complete examples.

## Slides to Create: 19-30

### Part 5: Methods and Templates (Slides 19-22) - 10 minutes

#### Slide 19: Methods - Pure Operations with Named Roles
- Title: "Methods: Pure Operations with Named Roles"
- Definition box: "Reusable operation specification using named roles (not physical variables)"
- Two-column layout:

**Derivation Methods** (Computational operations)
- Example: **Subtraction**
- DEL expression: `difference := minuend - subtrahend`
- Roles: minuend (input), subtrahend (input), difference (output)

**Analysis Methods** (Statistical procedures)
- Example: **ANCOVA**
- Wilkinson-Rogers notation: `response ~ covariate + group`
- Roles: response (dependent), covariate (input), group (factor)

- Bottom emphasis box: "Key: Methods use ROLES, not variable names"

#### Slide 20: Templates - Bind Semantic TEs to Method Roles
- Title: "Templates: Bind Semantic TEs to Method Roles"
- Definition: "Clinical pattern that binds Semantic Transformation Elements (CTM entities) to Method roles"
- Two examples side by side:

**Derivation Template: ChangeFromBaseline**
- Method: Subtraction
- Bindings:
  - analysis_value → minuend
  - baseline_value → subtrahend
  - change_value → difference
- Cube roles assigned:
  - analysis_value (measure)
  - baseline_value (measure)
  - change_value (measure)

**Analysis Template: CFB_ANCOVA**
- Method: ANCOVA
- Bindings:
  - change_value → response
  - baseline_value → covariate
  - treatment_planned → group
- Cube roles assigned:
  - change_value (dependent/measure)
  - baseline_value (covariate/measure)
  - treatment_planned (factor/dimension)

#### Slide 21: The Key Insight
- Title: "The Key Insight"
- Large text with visual callouts (use colored boxes matching layer colors):
  - "**Semantic Concepts (TEs)** come from CTM (Layer 2)" - Blue box
  - "**Cube Roles** come from Templates (Layer 1)" - Green box
  - "**Physical Variables** come from Implementation (Layer 3)" - Orange box
- Central diagram showing the flow between these three
- Bottom: "This separation enables reusability and standard-independence"

#### Slide 22: Template Catalogue
- Title: "Template Catalogue"
- Subtitle: "CDISC-maintained standard library"
- Two sections:

**Derivation Templates:**
- ChangeFromBaseline
- PercentChangeFromBaseline
- TreatmentEmergent
- [... more examples]

**Analysis Templates:**
- CFB_ANCOVA (Change from baseline ANCOVA)
- TTE_CoxPH (Time-to-event Cox Proportional Hazards)
- Responder_CMH (Responder analysis Cochran-Mantel-Haenszel)
- CFB_MMRM (Mixed Model Repeated Measures)

- Bottom: "Organizations can extend with custom templates"

### Part 6: Putting It Together (Slides 23-27) - 12 minutes

#### Slide 23: The Three-Layer Architecture (Full Visual)
- Title: "The Three-Layer Architecture"
- Comprehensive diagram showing:
  - **Layer 1 (green):** AC/DC Instance
    - Uses Template
    - Creates Slice (fixed values)
    - References concepts via is_a
  - **Layer 2 (blue):** Clinical Transformation Model (CTM)
    - Semantic Transformation Elements (CTM entities)
    - Relationships between Semantic TEs
    - Semantic definitions
  - **Layer 3 (orange):** Implementation
    - ADaM Standard mapping
    - Study-specific datasets
    - Physical variables
- Arrows showing connections:
  - is_a relationships
  - method references
  - cube role assignments
  - implementation bindings

#### Slide 24: Walk-through Example 1 - Derivation Concept
- Title: "Derivation Concept: S_DC_004 ChangeFromBaseline"
- Show progression with numbered steps and visual flow:

1. **Template:** T_DC_ChangeFromBaseline specifies Subtraction method
2. **Instance:** S_DC_004 references Semantic TEs from CTM:
   - analysis_value, baseline_value → change_value
3. **Layer 2 (ADaM Standard):**
   - analysis_value → AVAL
   - baseline_value → BASE
   - change_value → CHG
4. **Layer 3 (Study):**
   - AVAL → ADQSADAS.AVAL
   - BASE → ADQSADAS.BASE
5. **Generated code:**
```sas
CHG = AVAL - BASE;
```

- Dependency note: "S_DC_004 depends on S_DC_001 (AVAL) and S_DC_003 (BASE)"

#### Slide 25: Walk-through Example 2 - Analysis Concept
- Title: "Analysis Concept: S_AC_001 ANCOVA"
- Based on T_AC_ANCOVA template
- Show cube roles mapping to statistical operations:

**Step 1: Template binds Semantic TEs (CTM entities) with cube roles**
- change_value → response (measure)
- baseline_value → covariate (measure)
- treatment_planned → group (dimension)
- site → factor (dimension)
- population_flag → filter (attribute)

**Step 2: Slice fixes values**
- parameter = "ADAS-Cog(11)"
- visit = "Week 24"
- population_flag = "Y"

**Step 3: Layer 2 mapping**
- Semantic TEs → ADaM variables (CHG, BASE, TRT01P, SITEID, EFFFL)

**Step 4: Layer 3**
- ADaM → Study dataset (ADQSADAS)

#### Slide 26: Resolution - The Complete Chain
- Title: "Resolution: Concept → ADaM → Study → Code"
- Three-column transformation showing:

**Layer 1 (Semantic)**
```
formula: change_value ~ baseline_value + site + treatment
filter: parameter="ADAS-Cog(11)", population_flag="Y"
```

**Layer 2 (ADaM Standard)**
```
change_value → CHG
baseline_value → BASE
treatment → TRT01P
site → SITEID
parameter → PARAMCD
population_flag → EFFFL
```

**Layer 3 (Generated Code)**
```sas
proc mixed data=adqsadas;
  where PARAMCD="ACTOT11" and EFFFL="Y";
  class SITEID TRT01P;
  model CHG = BASE SITEID TRT01P / solution;
run;
```

**Also generates R:**
```r
lm(CHG ~ BASE + SITEID + TRT01P,
   data = adqsadas %>%
     filter(PARAMCD=="ACTOT11", EFFFL=="Y"))
```

#### Slide 27: Derivation and Analysis Together
- Title: "Derivation and Analysis Together"
- Visual: Dependency graph showing:
  - S_AC_001 (ANCOVA) depends on change_value (Semantic TE)
  - change_value produced by S_DC_004 (ChangeFromBaseline)
  - S_DC_004 depends on S_DC_001 (AVAL) and S_DC_003 (BASE)
- Use arrow diagram showing flow from base concepts through derivations to analysis
- Bottom: "Benefits: Automatic traceability, reusable across studies"

### Part 7: The Payoff (Slides 28-30) - 8 minutes

#### Slide 28: Bidirectional Traceability
- Title: "Bidirectional Traceability"
- Split layout showing two directions:

**Top-Down (SAP Writing Time)**
1. Author defines: "ANCOVA of change from baseline in ADAS-Cog(11)"
2. System identifies required concepts: change_value, baseline_value
3. System surfaces DC requirements: CHG needs BASE needs ABLFL
4. ADaM specs generated from dependency graph

**Bottom-Up (Submission/Review Time)**
1. Reviewer: "How was LS Mean difference of -3.2 calculated?"
2. System traces: Result → S_AC_001 (ANCOVA) → ADQSADAS.CHG → S_DC_004 → AVAL, BASE

- Central message: "Same metadata supports both directions"

#### Slide 29: Benefits Summary
- Title: "Benefits by Persona"
- Four sections with icons:

🔧 **For Programmers:**
- Automatic code generation
- Explicit dependencies
- No copy-paste programming

📊 **For Statisticians:**
- Precise method specification
- Reproducibility
- Statistical integrity maintained

🎯 **For Standards Teams:**
- Standard-independence (ADaM/SDTM/OMOP)
- Interoperability
- Governance

🚀 **For Leadership:**
- Accelerates study start-up
- Enables automation
- Reduces errors

#### Slide 30: Before vs. After Comparison
- Title: "Before vs. After"
- Table format:

| Aspect | Before (Current State) | After (With AC/DC) |
|--------|------------------------|---------------------|
| **Specification** | Word document (prose) | Machine-executable metadata |
| **Reusability** | Copy-paste, modify | Template instantiation |
| **Validation** | Manual review | Structural validation |
| **Traceability** | Documentation | Explicit dependency graph |
| **Portability** | SAS-only (or R-only) | SAS, R, Python from same spec |
| **Standard-independence** | Tied to ADaM | ADaM, SDTM, OMOP, FHIR |

## Backup Slides (31-33) - For Q&A

#### Slide 31: Integration with CDISC Ecosystem
- Title: "Integration with CDISC Ecosystem"
- Diagram showing AC/DC in context:
  - **Upstream:** USDM (study design), Biomedical Concepts (collected data)
  - **AC/DC:** Analysis & Derivation Concepts (CTM + Templates + Methods)
  - **Downstream:** ARS (analysis results), Define-XML
- Arrows showing data flow
- Text: "Enables digital SAP: machine-readable, executable, version-controlled"
- Bottom: "Part of broader CDISC vision for end-to-end automation"

#### Slide 32: The Document Suite
- Title: "The Document Suite"
- Four document boxes with descriptions:

1. **ACDC_Framework_Overview**
   - Start here
   - Architecture and document relationships

2. **CTM Specification**
   - The vocabulary - Clinical Transformation Model
   - Semantic Transformation Elements (TEs)

3. **Methods, Templates & DEL**
   - The operations and patterns
   - SDMX Data Cube integration

4. **Statistical Methods Reference**
   - Comprehensive catalog
   - Parameters and options

- Reading order arrow: Overview → CTM → Methods → Reference

#### Slide 33: Next Steps / Call to Action
- Title: "Next Steps"
- Three sections:

**For Everyone:**
- Review the document suite [QR code or link]
- Identify one analysis from your current study
- Try mapping it to the AC/DC model

**Get Involved:**
- Join CDISC Analysis Concepts working group
- Pilot on a simple use case
- Provide feedback to shape the standard

**Contact Information:**
[Space for presenter contact details]

- Bottom: "Questions?"

---

## Design Guidelines (Consistent with Part 1):

**Visual Style:**
- Maintain consistent color scheme from Part 1:
  - Green for Layer 1 concepts
  - Blue for Layer 2 concepts
  - Orange for Layer 3 concepts
- Professional icons (no clipart)
- Code blocks: monospace with syntax highlighting
- Tables: clean, alternating row colors

**Typography:**
- Consistent with Part 1
- Clear hierarchy
- Readable font sizes

**Key Visuals:**
- Slide 20: Comprehensive three-layer diagram
- Slide 23: Side-by-side transformation
- Slide 24: Dependency graph
- Slide 28: CDISC ecosystem diagram

**Running Example:**
- ADAS-Cog ANCOVA continues throughout (slides 24-27)
- Shows complete end-to-end flow from Semantic TEs through implementation

**Progressive Disclosure:**
- Slide 23: Build the three-layer diagram step by step
- Slide 24-25: Reveal steps sequentially
- Slide 26: Show transformation columns one at a time

## Output Format:

Please create slides 19-30 (main presentation) plus backup slides 31-33 to complete the PowerPoint presentation. These slides should be consistent in style with slides 1-18 from Part 1.

If you cannot create .pptx directly, please provide detailed slide descriptions including:
1. Exact text for each element
2. Description of visuals/diagrams
3. Layout suggestions
4. Color coding
5. Build/animation sequences

## Key Terminology Consistency:

Throughout Part 2, maintain consistent terminology from Part 1:
- Use "Semantic Transformation Elements (TEs)" or "Semantic TEs" (not just "TEs")
- Reference "Clinical Transformation Model (CTM)" when discussing the formal model
- Emphasize that Semantic TEs are "CTM entities" not just abstract concepts
- Show the connection: CTM defines concepts → Templates assign SDMX roles → Implementation binds to variables

This completes the 30-slide main presentation deck plus 3 backup slides.
