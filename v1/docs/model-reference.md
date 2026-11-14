# Model reference

Generated from the LinkML schemas in `v1/schema/` by `v1/tools/gen_reference.py`. Do not edit by hand.

Each table lists the properties a class declares or refines itself; a class also has the properties of
the class it specialises. `*` marks a required property and `[]` a list.

## SmartPhrase layer

### `ac_smartphrase` — AC SmartPhrase Model

Schema for the SmartPhrase library. A SmartPhrase is a reusable fragment of statistical analysis plan text with typed placeholders. Each plays one role in a sentence. Choosing a phrase and filling its placeholders selects Concepts and Methods, so the plan text and the executable specification come from the same choices: text is generated from the model and never parsed. A phrase binds to Concepts, Methods, method outputs and values, never to a physical variable. This schema covers the library side; the study side (phrase instances) is in ac_study.

#### RoleDefinition

A role a phrase plays in an analysis sentence.

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string | Role identifier, e.g., endpoint, method, covariate. |
| `label`* | string |  |
| `description` | string |  |
| `contextSource` | ContextSourceEnum |  |
| `repeating` | boolean | True when the role may be filled more than once in one analysis. |
| `estimandAttribute` | EstimandAttributeEnum | The estimand attribute this role expresses, if any. |
| `definedBy` | uri | For a role added by a model that extends AC, the namespace IRI of that model. Absent for roles of the AC library (decision D13). |
| `status` | EntryStatus |  |

#### ConfigurationOption

The values offered for a value placeholder of a given name, across phrases.

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string |  |
| `values`*[] | string |  |
| `default` | string |  |

#### ValueConstraint

The range a numeric value must lie in.

| Property | Type | Meaning |
| --- | --- | --- |
| `min` | float |  |
| `max` | float |  |

#### Placeholder

A typed slot in a phrase template.

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string | The token in the template, written there as {name}. |
| `kind`* | PlaceholderKindEnum |  |
| `description` | string |  |
| `required` | boolean |  |
| `conceptConstraint` | string | The kind of study concept that may be bound (Parameter, Timepoint, Population, Treatment, Event, IntercurrentEvent). |
| `conceptCategory` | string | The abstract Concept the bound study concept must belong to (a Concept identifier, e.g. C.VisitDimension). |
| `conceptClass` | string | Informative grouping of the concepts offered to the author. |
| `intentConstraint` | string | The analytical intent a bound Method must serve (informative). |
| `valueSource` | string | Where candidate values are drawn from (informative). |
| `datatype` | string |  |
| `constraint` | ValueConstraint |  |
| `renderOptions`[] | RenderModeEnum |  |
| `defaultRender` | RenderModeEnum |  |
| `extensionType` | uri | For an extension_ref, the IRI of the entity type in the extending model. |

#### PhraseAnchors

What a phrase means in the model, independent of its bindings.

| Property | Type | Meaning |
| --- | --- | --- |
| `producedConcept` | string | The Concept the phrase is about (a Concept identifier). |
| `usesMethod` | string | The Method the phrase implies (a Method identifier). |
| `icheStrategy` | IchE9R1StrategyEnum | The intercurrent-event strategy the phrase asserts. |
| `implementation` | string | The kind of implementation the strategy needs (none, imputation, derivation, censoring, population_subsetting). |
| `estimandAttribute` | EstimandAttributeEnum |  |

#### SmartPhrase

A reusable fragment of analysis plan text with typed placeholders.

| Property | Type | Meaning |
| --- | --- | --- |
| `conceptId`* | string | Unique phrase identifier, e.g., SP_CFB_ENDPOINT. Study phrase instances bind by it. |
| `name`* | string | Human-readable name |
| `description` | string | Free-text explanation or description |
| `status` | EntryStatus | Lifecycle status of a library entry. `provisional` marks content that was proposed during the candidate v1 build and has not been reviewed. |
| `role`* | RoleDefinition | The role the phrase plays (a RoleDefinition name). |
| `phraseTemplate`* | string | The text, with {placeholder} tokens. English is the library's base language. |
| `anchors` | PhraseAnchors |  |
| `placeholders`[] | Placeholder |  |

#### LocalisedText

A piece of text for one key in one language.

| Property | Type | Meaning |
| --- | --- | --- |
| `key`* | string | The identifier of what is translated (a phrase, method, output class or analysis role). |
| `text` | string |  |
| `label` | string |  |
| `name` | string |  |

#### LanguagePack

What is needed to write analysis sentences in one language. The sentence template owns word order, because concatenating phrases in role order is correct only for some languages.

| Property | Type | Meaning |
| --- | --- | --- |
| `language`* | string | BCP 47 language tag. |
| `name` | string |  |
| `sentenceTemplate`* | string | The sentence frame: role tokens in the language's word order, literal text, and optional groups in square brackets that are dropped when none of their roles is filled. |
| `roleConjunctions`[] | LocalisedText | The text placed between repeated phrases of one role. |
| `phraseTemplates`[] | LocalisedText | Phrase templates in this language, by phrase identifier. A phrase without one falls back to the library's base text. |
| `methodNames`[] | LocalisedText |  |
| `outputNames`[] | LocalisedText | Reader-facing names for method outputs, by output class. |
| `sentenceRoles`[] | LocalisedText | Translations of the words that say what kind of analysis it is (the primary analysis, a sensitivity analysis). |
| `validated` | boolean | False when the translation is illustrative and has not been reviewed by a qualified translator. |

#### SmartPhraseLibrary

The SmartPhrase library.

| Property | Type | Meaning |
| --- | --- | --- |
| `libraryVersion`* | string | Semantic version of a library file. |
| `description` | string | Free-text explanation or description |
| `roleOrder`*[] | RoleDefinition | The order of roles: the fallback order of phrases in a sentence, and the precedence when two phrases fill a placeholder of the same name. |
| `roles`*[] | RoleDefinition |  |
| `configurationOptions`[] | ConfigurationOption |  |
| `phrases`*[] | SmartPhrase |  |
| `languagePacks`[] | LanguagePack |  |

#### Enumerations

| Enumeration | Values |
| --- | --- |
| ContextSourceEnum | endpoint, manual |
| PlaceholderKindEnum | concept_ref, method_ref, output_ref, value, extension_ref |
| RenderModeEnum | label, name, name_with_label |
| IchE9R1StrategyEnum | TreatmentPolicy, Hypothetical, Composite, WhileOnTreatment, PrincipalStratum |
| EstimandAttributeEnum | Treatment, Population, Variable, IntercurrentEvent, PopulationLevelSummary |

## Method layer

### `ac_method` — AC Method Model

Schema for AC (Analysis Concepts) method definitions. Covers statistical analysis methods (e.g., ANCOVA, Cox PH) and derivation methods (e.g., Subtraction, LOCF imputation). Methods are the reusable building blocks that AC and DC definitions reference.

#### NameAsIdentifier

A mixin class for any named method component that is referenced by name.

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string | Human-readable name |

#### Method

A reusable statistical or derivation method definition.

| Property | Type | Meaning |
| --- | --- | --- |
| `conceptId`* | string | Unique method identifier, e.g., M.ANCOVA, M.Subtraction |
| `name`* | string | Human-readable method name |
| `label` | string | Short label for display |
| `description` | string | Free-text explanation of what the method does |
| `ncitCode` | string | NCIt code |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `methodType`* | string | Indicates whether this is a model-based, aggregation or derivation method |
| `configurations`[] | Configuration | Configurable parameters for the method. |
| `inputs`[] | Input | Input data specifications for roles defined in the formula for the method. |
| `subMethods`[] | SubMethod | Sub-methods that are part of this method. |
| `output` | OutputSpec | Specification of the output of a single method or sub-method. |
| `status` | EntryStatus | Lifecycle status of a library entry. `provisional` marks content that was proposed during the candidate v1 build and has not been reviewed. |

#### SubMethod (a kind of Method)

A method that is part of a composite method

#### CompositeMethod (a kind of Method)

A method that is composed of multiple sub-methods.

| Property | Type | Meaning |
| --- | --- | --- |
| `subMethods`*[] | SubMethod | Sub-methods that are part of this method. |

#### ModelBasedMethod (a kind of CompositeMethod)

A method that is based on a statistical model, such as ANCOVA or Cox PH.

| Property | Type | Meaning |
| --- | --- | --- |
| `statisticalModel`* | StatisticalModelSpec | The statistical model associated with this method, if applicable. |

#### AggregationMethod (a kind of Method)

A method that aggregates or summarizes data, such as mean, median, or sum.

| Property | Type | Meaning |
| --- | --- | --- |
| `formula`* | AggregationFormulaSpec | Formula specification including notation and expressions. |

#### DerivationMethod (a kind of Method)

A method that derives new variables from existing data, such as subtraction, imputation, or transformation.

| Property | Type | Meaning |
| --- | --- | --- |
| `formula`* | DerivationFormulaSpec | Formula specification including notation and expressions. |

#### Configuration

A configurable parameter for a method

| Property | Type | Meaning |
| --- | --- | --- |
| `description` | string | Explanation of this configuration parameter |
| `dataType`* | DataTypeEnum | Data type of the configuration value |
| `defaultValue` | Any | Default value if not specified. |
| `enumValues`[] | string | Allowed values for the configuration parameter or input value. |
| `configuredSubMethods`[] | SubMethod | The specific sub-method(s) that are configured by this configuration parameter. |
| `conformsTo` | string | The shared configuration concept this parameter is an instance of (for example `alpha`), so that the same setting is recognised across methods. |

#### StatisticalModelSpec

A statistical model that describes the relationship between variables. Examples include linear regression, logistic regression, and Cox proportional hazards models.

| Property | Type | Meaning |
| --- | --- | --- |
| `description` | string | Free-text explanation or description |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `formula`* | ModelBasedFormulaSpec | Formula specification including notation and expressions. |
| `isModelFor`*[] | InputVariable | The input study design dependent variable that this model is intended to describe. |
| `modelTerms`*[] | ModelTerm | The terms (variables) used in the statistical model, if applicable. |

#### ModelTerm

A term (variable) used in a statistical model.

| Property | Type | Meaning |
| --- | --- | --- |
| `description` | string | Free-text explanation or description |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `forInputs`[] | Input | The input study design independent variable(s) or value(s) that this model term is intended to describe. |
| `parameters`*[] | ModelParameter | The parameters associated with the model term. |

#### ModelParameter

A parameter associated with a model term.

| Property | Type | Meaning |
| --- | --- | --- |
| `description` | string | Free-text explanation or description |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `forInputVariables`[] | InputVariable | The input variable(s) with which this model parameter is associated. |
| `forFactorLevels`[] | FactorLevel | The factor level(s) with which this model parameter is associated. |
| `forFactorLevelCombination` | FactorLevelCombinationSpec | The factor level combination with which the model parameter is associated. |

#### FormulaSpec — abstract

Specifies the formula notation and text for a method

| Property | Type | Meaning |
| --- | --- | --- |
| `notation`* | string | The formula notation system used |
| `text`* | string | Template formula expression with role-tagged placeholders, e.g., <response> ~ <covariate> |
| `defaultExpression` | string | The formula in its most common form, without repetition markers, e.g., response ~ covariate + fixed_effect. |
| `notes` | string | Guidance on using or extending the formula. |

#### ModelBasedFormulaSpec (a kind of FormulaSpec)

Specifies the formula notation and text for a model-based method

#### AggregationFormulaSpec (a kind of FormulaSpec)

Specifies the formula notation and text for an aggregation method

#### DerivationFormulaSpec (a kind of FormulaSpec)

Specifies the formula notation and text for a derivation method

#### Input — abstract

Specification of one input variable or value referenced by name in the formula for the method.

| Property | Type | Meaning |
| --- | --- | --- |
| `inputType`* | string | The type of input, either a variable or a value. |
| `role`* | string | The role specified in the formula for the method that is performed by this input. |
| `label` | string | Short label for display |
| `description` | string | Free-text explanation or description |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `dataType`* | DataTypeEnum | The data type of the input variable or value. |
| `required`* | boolean | Indicates whether this input is mandatory |
| `multivalued`* | boolean | Indicates whether there can be multiple occurrences of the input. |

#### InputValue (a kind of Input)

An input value that performs one of the roles defined in the formula for the method.

| Property | Type | Meaning |
| --- | --- | --- |
| `defaultValue` | Any | Default value if not specified. |
| `enumValues`[] | string | Allowed values for the configuration parameter or input value. |

#### InputVariable (a kind of Input)

An input variable that performs one of the roles defined in the formula for the method.

#### ContinuousVariable (a kind of InputVariable)

An input variable that is continuous (numeric)

#### CategoricalVariable (a kind of InputVariable)

An input variable that is categorical.

| Property | Type | Meaning |
| --- | --- | --- |
| `levels`[] | FactorLevel | The levels of a categorical input variable (factor). |

#### FactorLevel

A level of a categorical input variable (factor).

| Property | Type | Meaning |
| --- | --- | --- |
| `description` | string | Free-text explanation or description |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |

#### FactorLevelCombinationSpec

A combination of levels of one or more categorical input variables (factors).

| Property | Type | Meaning |
| --- | --- | --- |
| `description` | string | Free-text explanation or description |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `factors`*[] | CategoricalVariable | The role(s) of the input categorical variable (factor) whose levels are combined in this factor level combination. |
| `combinedLevels`[] | FactorLevel | The factor levels that are combined in this factor level combination. |

#### StudyGroupPopulation

A study group population that is denoted by a combination of input categorical variable values (factor levels).

| Property | Type | Meaning |
| --- | --- | --- |
| `description` | string | Free-text explanation or description |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `factorLevelCombination`* | FactorLevelCombinationSpec | The combination of factor levels that denote the study group population. |

#### InputStatistic

An input statistic that performs one of the roles defined in the formula for the sub-method.

| Property | Type | Meaning |
| --- | --- | --- |
| `role`* | string | The role specified in the formula for the method that is performed by this input. |
| `description` | string | Free-text explanation or description |
| `subMethodId`* | SubMethod | The sub-method that produces the referenced output statistic. |
| `statisticId`* | Statistic | The statistic produced by the referenced sub-method that performs the input role. |

#### OutputSpec

A set of statistics produced by a method or sub-method that is associated with one or more components of the method.

| Property | Type | Meaning |
| --- | --- | --- |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `outputClass` | OutputClass | The output class this output is an instance of. |
| `statisticSets`[] | StatisticSet | The predefined set of statistics produced by this method, referencing the statistic set vocabulary. |
| `statistics`[] | Statistic | The statistics produced by this method, referencing the statistics vocabulary. |
| `optionalStatistics`[] | Statistic | Statistics an output of this kind may carry, depending on configuration (for example an adjusted p-value). |
| `dataType` | DataTypeEnum | Data type of the produced value, for an output that is a single value. |
| `forInputVariables`[] | InputVariable | The input variable(s) with which this model component is associated. |
| `forModelTerms`[] | ModelTerm | The model term(s) with which the output is associated. |
| `forModelParameters`[] | ModelParameter | The model parameter(s) with which the output is associated. |
| `forStudyGroupPopulation` | StudyGroupPopulation | The study group population with which this model component is associated. |

#### Enumerations

| Enumeration | Values |
| --- | --- |
| ModelBasedFormulaNotation | wilkinson_rogers, survival |
| AggregationFormulaNotation | aggregation |
| DerivationFormulaNotation | derivation |
| DataTypeEnum | decimal, integer, code, string, boolean, date, datetime, id, object |

### `ac_statistic` — AC Statistic Model

Schema for AC (Analysis Concepts) statistic definitions.

#### Statistic

A reusable statistic/measure definition in the vocabulary

| Property | Type | Meaning |
| --- | --- | --- |
| `conceptId`* | string | Unique statistic identifier, e.g., S.AIC, S.BIC |
| `name`* | string | Statistic identifier, e.g., estimate, p_value, F_statistic |
| `label` | string | Short label for display |
| `description` | string | What this statistic measures |
| `ncitCode` | string | NCIt code |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `valueType` | ValueTypeEnum | The kind of value produced, using FHIR datatype names. |
| `unitRule` | UnitRuleEnum | How the unit of the value is determined. |
| `status` | EntryStatus | Lifecycle status of a library entry. `provisional` marks content that was proposed during the candidate v1 build and has not been reviewed. |

#### StatisticLibrary

The vocabulary of statistics that methods produce and analysis concepts are made of.

| Property | Type | Meaning |
| --- | --- | --- |
| `libraryVersion`* | string | Semantic version of a library file. |
| `description` | string | Free-text explanation or description |
| `entries`*[] | Statistic | The statistics in the vocabulary. |

### `ac_statistic_set` — AC Statistic Set Model

Schema for AC (Analysis Concepts) predefined statistic set definitions.

#### StatisticSet

A predefined set of statistics produced by a method or sub-method.

| Property | Type | Meaning |
| --- | --- | --- |
| `conceptId`* | string | Unique statistic set identifier. |
| `name`* | string | The Statistic set identifier. |
| `label` | string | Short label for display |
| `description` | string | What this statistic set contains. |
| `ncitCode` | string | NCIt code |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `statistics`[] | Statistic | The statistics produced by this method, referencing the statistics vocabulary. |
| `status` | EntryStatus | Lifecycle status of a library entry. `provisional` marks content that was proposed during the candidate v1 build and has not been reviewed. |

#### StatisticSetLibrary

The predefined sets of statistics that are produced and interpreted together.

| Property | Type | Meaning |
| --- | --- | --- |
| `libraryVersion`* | string | Semantic version of a library file. |
| `description` | string | Free-text explanation or description |
| `entries`*[] | StatisticSet | The statistic sets. |

### `ac_output_class` — AC Output Class Model

Schema for output classes: named kinds of method output (LS means, contrasts, type III tests, a survival table). An output class says which statistics an output of that kind carries. A method's output or sub-method output names its output class; an analysis concept is satisfied by an output class.

#### OutputClass

A named kind of method output and the statistics it carries.

| Property | Type | Meaning |
| --- | --- | --- |
| `conceptId`* | string | Unique output class identifier, e.g., OC.ls_means. |
| `name`* | string | Human-readable name |
| `label` | string | Short label for display |
| `description` | string | Free-text explanation or description |
| `ncitCode` | string | NCIt code |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `broader` | string | The abstract family this output class belongs to (an OutputClass identifier). |
| `abstract` | boolean | True for a grouping entry that is never used directly. |
| `statisticSets`[] | StatisticSet | The predefined set of statistics produced by this method, referencing the statistic set vocabulary. |
| `statistics`[] | Statistic | Statistics carried in addition to those of the statistic sets. |
| `optionalStatistics`[] | Statistic | Statistics an output of this kind may carry, depending on configuration (for example an adjusted p-value). |
| `status` | EntryStatus | Lifecycle status of a library entry. `provisional` marks content that was proposed during the candidate v1 build and has not been reviewed. |

#### OutputClassLibrary

The vocabulary of output classes.

| Property | Type | Meaning |
| --- | --- | --- |
| `libraryVersion`* | string | Semantic version of a library file. |
| `description` | string | Free-text explanation or description |
| `entries`*[] | OutputClass | The output classes. |

## Transformation layer

### `ac_transformation` — AC Transformation Model

Schema for the Transformation library. A Transformation applies one Method for a stated clinical purpose: it binds Concepts to the Method's input roles and outputs, and declares the data structures (W3C Data Cube qb:DataStructureDefinitions) the Method reads and produces, with the slices that subset them. A Transformation is either a derivation (subject-level output) or an analysis (aggregate output). It references Methods, Concepts and SmartPhrases by identifier and never names a physical variable.

#### TransformationLibrary

Top-level container for one or more transformations.

| Property | Type | Meaning |
| --- | --- | --- |
| `libraryVersion`* | string | Semantic version of the library. A study pins the version it uses (decision D6). |
| `description` | string |  |
| `transformations`[] | Transformation | unified array (analyses + derivations merged with a discriminator). |

#### Transformation

a single transformation entry.

| Property | Type | Meaning |
| --- | --- | --- |
| `conceptId`* | string | canonical identifier (e.g. T.CFB_ANCOVA). |
| `status` | EntryStatus | Lifecycle status; `provisional` marks a template proposed during the candidate v1 build. |
| `label`* | string | SmartPhrase-rendering label. |
| `shortLabel` | string | Optional compact label. |
| `transformationType`* | TransformationType |  |
| `description` | string |  |
| `usesMethod`* | string | The Method this transformation applies (a Method identifier). |
| `methodConfigurations`[] | MethodConfigurationOverride | Values for the method's configuration options. |
| `inputDataStructure`* | InputDataStructure | the qb:DataStructureDefinition for the cube this transformation consumes. |
| `outputDataStructure`* | OutputDataStructure | the qb:DataStructureDefinition for the cube this transformation produces. |
| `sliceKeys`[] | SliceKey | declares how slice-template placeholders bind to the endpoint spec at study time. |
| `validSmartPhrases`[] | string | SmartPhrase OIDs compatible with this transformation. |

#### MethodConfigurationOverride

A configuration value supplied to the named method's `configurations[].name` slot.

| Property | Type | Meaning |
| --- | --- | --- |
| `configurationName`* | string | FK to Method.configurations[].name (validated cross-file). |
| `value` | Any | Configuration value (type matches the configuration's dataType). |
| `valueList`[] | Any | The value of a list-valued configuration (for example a set of visit windows). |
| `description` | string | Why this value is set. |

#### DataStructureDefinition — abstract

abstract base for the input and output DSDs. Each instance IS a qb:DataStructureDefinition. Subclasses (InputDataStructure / OutputDataStructure) constrain which kinds of bindings are permitted.

| Property | Type | Meaning |
| --- | --- | --- |
| `dimensions`[] | string | qb:dimension components of this DSD. |
| `measures`[] | string | qb:measure components of this DSD. |
| `attributes_`[] | string | qb:attribute components of this DSD. Reserved; typically absent. |
| `slices`[] | Slice | slice templates that pre-filter cubes derived from this DSD. |

#### InputDataStructure (a kind of DataStructureDefinition)

DSD for the cube the transformation consumes. dimensions[] and measures[] items may carry `input` FKs; measures[] items may carry `slice`. Output-only fields are rejected.

| Property | Type | Meaning |
| --- | --- | --- |
| `modelInteractions`[] | ModelInteraction | interaction terms selected into the model RHS for this use (e.g. a treatment-by-visit interaction). Each interaction references already-bound input roles via its operands; it binds no new data. Main effects are NOT listed here — they are implied by the dimensions[]/measures[] input bindings. Empty/absent = main effects only. Validated against usesMethod's formula grammar (an interaction's operand-role multiset must match an allowed interaction production in the method's generic_expression). Input-side only (model specification is about the RHS the cube feeds), so it lives here and not on OutputDataStructure. |

#### OutputDataStructure (a kind of DataStructureDefinition)

DSD for the cube the transformation produces. dimensions[] items list the output cube's qb:dimension components (no input FK on this side). measures[] items carry `output` FKs. slice is rejected on output measures.

#### ConceptReference — abstract

Abstract base for any binding that references a clinical/analysis concept OR a concept category. Enforces "concept XOR conceptCategory".

| Property | Type | Meaning |
| --- | --- | --- |
| `concept` | string | A concrete Concept in the concept library (a Concept identifier, e.g. C.Change). Checked across files by the validator. |
| `conceptCategory` | string | An abstract Concept that stands for a group (e.g. C.ParameterDimension, C.VisitDimension). A concrete member is chosen when a study uses the transformation. |

#### DimensionBinding (a kind of ConceptReference) — abstract

Abstract base for an entry in a DSD's dimensions[]. Subclasses constrain whether input is permitted.

| Property | Type | Meaning |
| --- | --- | --- |
| `input` | string | when present, this dim fills a specific method input slot (bound dim). When absent, the dim is pure cube context. |

#### InputDimensionBinding (a kind of DimensionBinding)

a dimension on the input cube. input is optional.

#### OutputDimensionBinding (a kind of DimensionBinding)

a dimension on the output cube. input is rejected here. May instead be a derived contrast dimension carrying a contrastSpecification; in that case it is named "contrast" and bound to the Contrasts concept.

| Property | Type | Meaning |
| --- | --- | --- |
| `name` | string | Dimension name; "contrast" for a derived contrast dimension. |
| `contrastSpecification` | ContrastSpecification | The coefficient-matrix recipe defining the contrast dimension's members. |

#### MeasureBinding (a kind of ConceptReference) — abstract

Abstract base for an entry in a DSD's measures[]. Subclasses constrain direction: input measures carry input + optional slice; output measures carry output.

| Property | Type | Meaning |
| --- | --- | --- |
| `requiredValueType` | FHIRValueType | optional FHIR value-type constraint on the input measure. |
| `description` | string | Free-text note on the binding (e.g. "Baseline value of the endpoint parameter"). |

#### InputMeasureBinding (a kind of MeasureBinding)

a measure on the input cube. Carries input; may carry slice.

| Property | Type | Meaning |
| --- | --- | --- |
| `input`* | string | The Method input role this measure fills (Method.inputs[].role). |
| `slice` | string | name of a Slice in inputDataStructure.slices[] that pre-filters this measure's cube before the method sees it. |

#### OutputMeasureBinding (a kind of MeasureBinding)

a measure on the output cube. Carries output; slice is rejected.

| Property | Type | Meaning |
| --- | --- | --- |
| `output`* | string | The producer of this measure: the identifier of the Method (when it has a single output) or of the SubMethod whose output it is. |

#### InputAttributeBinding (a kind of ConceptReference)

Reserved (Attributes). qb:attribute on the input cube.

#### OutputAttributeBinding (a kind of ConceptReference)

Reserved (Attributes). qb:attribute on the output cube.

#### ModelInteraction

one interaction term on the model RHS, selected for this use and composed from already-bound input roles (its operands). The interaction (the `:` operator) is the only composite term selectable across the current method library; nesting/stratification (the `\|` partition) is method-intrinsic, not a per-use choice, so it is not modelled here. There is therefore no `kind` discriminator: a ModelInteraction IS an interaction. If the formula grammar later gains a second selectable composition production (e.g. random effects `(slope \| group)`), that is a new, separately-named construct — not a `kind` added here. The eSAP renders the model statement from these structured interactions rather than parsing a formula string.

| Property | Type | Meaning |
| --- | --- | --- |
| `operands`*[] | InteractionOperand | The two-or-more interacting factors/covariates, each a reference to an existing dimensions[]/measures[] input binding. Order is not significant (a:b == b:a). |
| `label` | string | Optional human-readable label (e.g. "Treatment × AnalysisVisit"). |
| `role` | string | Optional role marker for the interaction, e.g. "primary" for the treatment-by-visit term of primary interest in an MMRM. |

#### InteractionOperand (a kind of ConceptReference)

one operand of a ModelInteraction. Identifies an existing input binding by the SAME identity it uses in dimensions[]/measures[]: its input role plus its concept (or conceptCategory). `input` alone is insufficient because `multiple`-cardinality roles (e.g. fixed_effect bound to both Treatment and Region) would be ambiguous — so the concept disambiguates which binding the operand refers to.

| Property | Type | Meaning |
| --- | --- | --- |
| `input`* | string | The Method input role this operand fills (Method.inputs[].role). |

#### Slice

a named, parameterized slice TEMPLATE. Instantiated to a real qb:Slice at execution time when sliceKey placeholders bind to endpoint values. Lives inside a DSD's slices[] array.

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string | Slice identifier within slices[]. Referenced by InputMeasureBinding.slice. |
| `description` | string |  |
| `constraints`*[] | SliceConstraint | One constraint per fixed dimension. Values may be literal or {placeholder}. |

#### SliceConstraint

one fixed dimension within a slice template.

| Property | Type | Meaning |
| --- | --- | --- |
| `dimension`* | string | References a dimension name in the parent DSD's dimensions[] (concept or conceptCategory). |
| `value`* | string | Literal value OR a {placeholder} that resolves via sliceKeys at study-spec time. Recognized placeholders include {parameter}, {visit}, {baseline_visit}, {population}. |

#### SliceKey

qb:SliceKey extended with `source` to declare where the fixed-dimension value comes from at study-spec time. Lives at the transformation top level.

| Property | Type | Meaning |
| --- | --- | --- |
| `dimension`* | string | References a dimension in inputDataStructure.dimensions[]. |
| `source`* | SliceKeySource | Endpoint-spec attribute name supplying the value. |

#### ContrastSpecification

The coefficient matrix L defining a contrast dimension's members. `over` is expressed in concept terms (e.g. Treatment). estimated_means is the portable default; model_coefficients additionally pins coding (+reference)

| Property | Type | Meaning |
| --- | --- | --- |
| `over`* | string | The factor/dimension contrasted, in concept terms (e.g. "Treatment"). |
| `basis`* | ContrastBasis | Column space of L. |
| `at` | string | Optional second factor; single-factor members are replicated across its levels. |
| `coding` | ContrastCoding | Required when basis = model_coefficients — the model parameterization. |
| `reference` | string | Required when basis = model_coefficients and coding = reference — the reference level. |
| `members`* | ContrastMembers | Either a generator (template) or a resolved list of member rows. |

#### ContrastMembers

A contrast member-set — exactly one of generator (unresolved) or memberList (resolved).

| Property | Type | Meaning |
| --- | --- | --- |
| `generator` | ContrastGenerator |  |
| `memberList`[] | ContrastMember |  |

#### ContrastGenerator

Study-time generator resolved against `over`'s levels into explicit members.

| Property | Type | Meaning |
| --- | --- | --- |
| `kind`* | ContrastGeneratorKind |  |
| `reference` | string | Comparator level (often the {control_arm} sliceKey), for vs_reference. |

#### ContrastMember

One row of L — a labelled set of weights (single-factor) or cells (multi-factor).

| Property | Type | Meaning |
| --- | --- | --- |
| `label`* | string |  |
| `weights`[] | float | Single-factor shorthand — map of level -> weight (omitted = 0). |
| `cells`[] | ContrastCell | General multi-factor cells (interaction / difference-in-differences). |

#### ContrastCell

A weighted cell mapping each relevant factor to a level.

| Property | Type | Meaning |
| --- | --- | --- |
| `cell`[] | string | Map of factor (concept term) -> level. |
| `weight`* | float |  |

#### Enumerations

| Enumeration | Values |
| --- | --- |
| TransformationType | derivation, analysis |
| FHIRValueType | Quantity, CodeableConcept, Identifier, string, decimal, integer, boolean, NumericValue, CharacterValue, CodedResponse |
| SliceKeySource | biomedicalConcept, visit, population, event, treatment |
| ContrastBasis | estimated_means, model_coefficients |
| ContrastCoding | reference, cell_means |
| ContrastGeneratorKind | pairwise, vs_reference, trend, custom |

## Concept layer

### `ac_concept` — AC Concept Model

Schema for the unified concept library. A Concept is a standard-agnostic meaning that Transformations reference and Data Bindings map physical variables to. One library spans collected (observation), derived and analysis concepts. A Concept owns its meaning, never its mechanism: it is defined by nothing (collected), by a closed-form identity (closed-form), or by a contract that a method output satisfies (method-bound). A Concept holds no mapping to a variable; that is the Data Binding's job.

#### ResultContract

What a concept produces; the structural type that an operand or a method output is matched against.

| Property | Type | Meaning |
| --- | --- | --- |
| `valueTypes`*[] | ValueTypeEnum | The kind(s) of value produced. |
| `unitRule` | UnitRuleEnum |  |
| `inputUnitRelation` | string | Whether the inputs must share a unit (uniform) or may differ (heterogeneous). |
| `inheritsFrom` | Concept | A concept whose unit and value type this result takes (for example a time concept). |

#### Operand

A named operand of a definition, typed by what it must produce.

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string |  |
| `description` | string |  |
| `produces` | ResultContract |  |

#### AlgebraicIdentity

A closed-form definition; pure algebra over operands.

| Property | Type | Meaning |
| --- | --- | --- |
| `operands`*[] | Operand |  |
| `identity`* | string | The identity, for example `result = value - reference`. |

#### MethodBoundDefinition

A definition by contract. The concept says what a method must deliver; it never names how. A derived concept states the operation and its operands. An analysis concept states the statistics it is made of. A Transformation chooses the method, and the binding is valid when the method output satisfies the contract.

| Property | Type | Meaning |
| --- | --- | --- |
| `operation` | string | The kind of operation, for example SequenceIntegral or Count. |
| `operands`[] | Operand |  |
| `constituents`[] | Statistic | The statistics a satisfying output must carry. |
| `statisticSets`[] | StatisticSet | The statistic sets the constituents are drawn from. |
| `optionalConstituents`[] | Statistic | Statistics a satisfying output may also carry. |
| `resultDimensions`[] | string | The dimensions that index the result (for example term, level, contrast). |
| `satisfiedBy`[] | OutputClass | Output classes known to satisfy the contract. |

#### Concept

A node in the unified concept library.

| Property | Type | Meaning |
| --- | --- | --- |
| `conceptId`* | string | Unique concept identifier, e.g., C.Change, C.Treatment, C.LSMeans. |
| `name`* | string | Human-readable name |
| `label` | string | Short label for display |
| `description` | string | Free-text explanation or description |
| `ncitCode` | string | NCIt code |
| `codings`[] | Coding | Mappings to external terminology or ontology codes |
| `abstract` | boolean | True for a grouping entry that is never used directly. |
| `status` | EntryStatus | Lifecycle status of a library entry. `provisional` marks content that was proposed during the candidate v1 build and has not been reviewed. |
| `shortLabel` | string | A compact label for displays and generated text. |
| `broader`[] | Concept | The abstract concept(s) this concept is a member of (a category or a dimension group). |
| `partOf`[] | Concept | The concept this one is a part or a qualifier of (a topic's code, a result's reference range, a dose's unit). Unlike `broader`, the target is an ordinary concept, not a grouping. |
| `conceptRole`* | ConceptRoleEnum |  |
| `axis` | ConceptAxisEnum |  |
| `definitionForm`* | DefinitionFormEnum |  |
| `result` | ResultContract |  |
| `algebraicDefinition` | AlgebraicIdentity |  |
| `methodBoundDefinition` | MethodBoundDefinition |  |
| `mathText` | string | The definition in mathematical notation, for human readers. |
| `examples`[] | string |  |
| `cardinality` | string | For a dimension concept, how many values apply to one observation. |

#### ConceptLibrary

The unified concept library.

| Property | Type | Meaning |
| --- | --- | --- |
| `libraryVersion`* | string | Semantic version of a library file. |
| `description` | string | Free-text explanation or description |
| `entries`*[] | Concept |  |

#### Enumerations

| Enumeration | Values |
| --- | --- |
| ConceptRoleEnum | collected, derived, analysis |
| ConceptAxisEnum | measure, dimension, attribute |
| DefinitionFormEnum | none, closedForm, methodBound |

## Implementation layer

### `ac_binding` — AC Data Binding Model

Schema for Data Bindings. A Data Binding says which physical variable of a data standard carries a Concept, and under what conditions. It is the only place where the model names a variable: Concepts, Methods, Transformations and SmartPhrases never do. Bindings point at Concepts, not the other way round, so supporting another standard adds bindings and changes nothing else. Bindings come at two levels. A class-level binding is published in a library and holds for a standard as a whole (Change is carried by CHG in an ADaM basic data structure). A value-level binding belongs to a study or a therapeutic-area package and holds for one parameter or condition (time to progression is AVAL where PARAMCD is PFS). Where one variable carries several Concepts, the class-level binding is marked parameter-dependent and a value-level binding resolves it. Candidate v1 covers CDISC standards. The locator is typed so that standards that are not tabular can be added later without changing the model.

#### Locator

Where the data is.

| Property | Type | Meaning |
| --- | --- | --- |
| `locatorType`* | LocatorTypeEnum |  |
| `datasetClass` | string | The class of dataset in the standard (for example BasicDataStructure, SubjectLevel, Findings). |
| `dataset` | string | The dataset name, for a study-level binding (for example ADQSADAS). |
| `variable`* | string | The variable name. A leading `--` stands for the two-letter domain prefix of an SDTM variable (`--ORRES`). |

#### BindingCondition

A condition on another variable of the same dataset that must hold for the binding to apply.

| Property | Type | Meaning |
| --- | --- | --- |
| `variable`* | string |  |
| `comparator`* | ComparatorEnum |  |
| `values`*[] | string |  |

#### BindingQualifier

A named qualification of what the variable carries (for example intent = Planned for a treatment variable).

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string |  |
| `value`* | string |  |

#### SpecialisationReference

The CDISC Dataset Specialisation element this binding corresponds to. SDTM bindings are held by reference: the specialisation is the source of truth, and this records which data element concept the variable carries.

| Property | Type | Meaning |
| --- | --- | --- |
| `dataElementConceptId`[] | string | NCIt code of the data element concept (the `dec_id` of the specialisation variable). |
| `note` | string |  |

#### DataBinding

One variable carrying one Concept (or one part of it).

| Property | Type | Meaning |
| --- | --- | --- |
| `id`* | string |  |
| `concept`* | string | The Concept carried (a Concept identifier). |
| `studyConcept` | string | For a value-level binding in a study, the study concept it applies to (for example PARAM.ADASCOG11). |
| `level`* | BindingLevelEnum |  |
| `locator`* | Locator |  |
| `facet` | FacetEnum |  |
| `facetName` | string | The name of the sub-part carried, when `facet` is `qualifier`. |
| `dataType` | string | The data type of the variable's values. |
| `qualifiers`[] | BindingQualifier |  |
| `conditions`[] | BindingCondition |  |
| `parameterDependent` | boolean | True when this variable carries the Concept only for some parameters, so that a value-level binding is needed to apply it. |
| `alternativeVariables`[] | string | Other variables of the standard that may carry the Concept, depending on the study's design. |
| `specialisation` | SpecialisationReference |  |
| `description` | string |  |
| `status` | EntryStatus |  |

#### DataBindingLibrary

The Data Bindings for one data standard.

| Property | Type | Meaning |
| --- | --- | --- |
| `libraryVersion`* | string | Semantic version of a library file. |
| `description` | string | Free-text explanation or description |
| `standard`* | string | The data standard bound to, for example ADaM or SDTM. |
| `standardVersions`[] | string | The versions of the standard the bindings were written against. |
| `bindings`*[] | DataBinding |  |

#### Enumerations

| Enumeration | Values |
| --- | --- |
| BindingLevelEnum | classLevel, valueLevel |
| LocatorTypeEnum | tabular, path |
| ComparatorEnum | EQ, NE, IN, NOTIN, LT, LE, GT, GE |
| FacetEnum | value, unit, code, decode, number, qualifier |

### `ac_implementation` — AC Method Implementation Model (informative)

Schema for method implementation catalogues: how a Method is run in a given language, and where each statistic of its outputs is found in what the code returns. This part of the implementation layer is informative (decision D8). A standard that mandated code would tie itself to language and package versions; the catalogues are examples that tools may use.

#### ResultColumn

Where one value of an output is found in what the code returns.

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string | The name the catalogue gives the value. |
| `statistic` | string | The statistic the value is (a Statistic identifier), when it is one. |
| `column`* | string | The element of the returned object that holds it. |

#### OutputMapping

How one output of the method is read from what the code returns.

| Property | Type | Meaning |
| --- | --- | --- |
| `producer`* | string | The Method or SubMethod whose output this is. |
| `sourceName` | string | The name the source catalogue used for this output. |
| `resultColumns`[] | ResultColumn |  |
| `extractionCode` | string |  |

#### MethodImplementation

One way of running a Method in one language.

| Property | Type | Meaning |
| --- | --- | --- |
| `method`* | string | The Method implemented (a Method identifier). |
| `language`* | string |  |
| `package` | string |  |
| `packages`[] | string |  |
| `procedure` | string |  |
| `function` | string |  |
| `callTemplate`* | string | The call, with the Method's input roles and configurations as <placeholders>. |
| `roleSeparator` | string |  |
| `derivationKind` | string |  |
| `outputMapping`[] | OutputMapping |  |
| `configurationMappings` | Any | How configuration values are written in this language. |
| `documentation` | string |  |
| `notes` | string |  |

#### MethodImplementationCatalogue



| Property | Type | Meaning |
| --- | --- | --- |
| `libraryVersion`* | string | Semantic version of a library file. |
| `description` | string | Free-text explanation or description |
| `language`* | string |  |
| `implementations`*[] | MethodImplementation |  |

## Study side (Transformation and SmartPhrase layers as used in a study)

### `ac_study` — AC Study Analysis Model

Schema for a study's use of the Analysis Concepts libraries. A study analysis set holds the study's Analysis Concepts and Derivation Concepts. Each is one library Transformation as used in the study: the template it instantiates, the values that fill the template's placeholders, the configuration values, the SmartPhrases that describe it, and, for an analysis, the estimand it addresses and how each intercurrent event is handled. This is the study side of the Transformation and SmartPhrase layers. It is not an electronic statistical analysis plan (eSAP): document structure, free text, reporting events, hypotheses, multiplicity and the detection of intercurrent events belong to an eSAP model, which builds on this one by referencing its entities by identifier (decision D13). The study definition itself (objectives, endpoints, estimands, arms, visits, populations) belongs to USDM. This model points at it and never changes it.

#### ExternalReference

A pointer to an entity defined in another standard.

| Property | Type | Meaning |
| --- | --- | --- |
| `iri`* | string |  |
| `iriStatus`* | IriStatusEnum |  |
| `text` | string | The text of the referenced entity, for readers. |

#### DocumentAnchor

A passage of the source document that licenses a statement in the model.

| Property | Type | Meaning |
| --- | --- | --- |
| `section`* | string |  |
| `quote` | string | The passage, word for word. |
| `relation` | DocumentRelationEnum |  |

#### SourceDocument

The document the study's anchors quote from.

| Property | Type | Meaning |
| --- | --- | --- |
| `id`* | string |  |
| `title` | string |  |
| `date` | string |  |
| `iri` | string |  |
| `iriStatus` | IriStatusEnum |  |

#### LibraryPin

The exact version of a library the study uses (decision D6).

| Property | Type | Meaning |
| --- | --- | --- |
| `library`* | string | The library, by the name of its folder under lib/ (methods, concepts, transformations, smartphrases, statistics, bindings). |
| `version`* | string |  |

#### Translation

The label and name of a study concept in another language.

| Property | Type | Meaning |
| --- | --- | --- |
| `language`* | string |  |
| `label` | string |  |
| `name` | string |  |

#### DataSelection

How the records for a study concept are found in the study's data.

| Property | Type | Meaning |
| --- | --- | --- |
| `dataset` | string |  |
| `datasetLabel` | string |  |
| `file` | string |  |
| `variable` | string | The variable that carries the concept, when it is a variable rather than a condition (a treatment variable). |
| `conditions`[] | BindingCondition |  |

#### StudyConcept

A concept of this study that SmartPhrases and placeholders are bound to: a parameter, a visit, an analysis population, a treatment comparison, an event of interest or an intercurrent event. Each is an instance of a library Concept and points at its definition in USDM, a terminology or a Biomedical Concept.

| Property | Type | Meaning |
| --- | --- | --- |
| `id`* | string |  |
| `kind`* | StudyConceptKindEnum |  |
| `concept`* | string | The library Concept this is an instance of (a Concept identifier). |
| `label`* | string | Short display form. |
| `name`* | string | Full name, as written in generated text. |
| `reference` | ExternalReference |  |
| `sapRefs`[] | DocumentAnchor |  |
| `note` | string |  |
| `translations`[] | Translation |  |
| `dataSelection` | DataSelection |  |

#### EstimandReference

An estimand of the study, defined in USDM. Held here by reference, with the intercurrent events in its scope, so that analyses can be checked against it.

| Property | Type | Meaning |
| --- | --- | --- |
| `id`* | string |  |
| `reference`* | ExternalReference |  |
| `label` | string |  |
| `rank` | string | primary, secondary or sensitivity. |
| `intercurrentEvents`[] | StudyConcept | The intercurrent events in the estimand's scope (study concept identifiers). An empty list is a valid, explicit answer. |
| `sapRefs`[] | DocumentAnchor |  |

#### PlaceholderValue

The value that fills one placeholder of the template ({parameter}, {visit}, {population} …).

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string | The placeholder name, without braces. |
| `studyConcept` | StudyConcept | The study concept that fills it. |
| `value` | string | A literal value, when the placeholder is not filled by a study concept. |

#### ConfigurationValue

The value of one configuration of the template's Method, as used in the study.

| Property | Type | Meaning |
| --- | --- | --- |
| `name`* | string |  |
| `value` | Any |  |
| `valueList`[] | Any |  |
| `fixedByTemplate` | boolean | True when the library template fixes the value. |

#### PhraseBinding

What fills one placeholder of a phrase. Exactly one of the four targets is given.

| Property | Type | Meaning |
| --- | --- | --- |
| `slot`* | string | The placeholder name in the phrase. |
| `studyConcept` | StudyConcept |  |
| `method` | string | A Method identifier. |
| `output` | string | The Method or SubMethod whose output is meant. |
| `value` | string |  |
| `extension` | string | An identifier in a model that extends AC (for an extension_ref placeholder). |
| `render` | RenderModeEnum |  |

#### PhraseInstance

One use of a library SmartPhrase in an analysis.

| Property | Type | Meaning |
| --- | --- | --- |
| `phrase`* | string | The phrase used (a SmartPhrase identifier). |
| `bindings`[] | PhraseBinding |  |
| `sapRefs`[] | DocumentAnchor |  |
| `noAnchorReason` | string | Why this use has no document anchor, when the study has a source document. |

#### IceHandling

How one intercurrent event is handled in one analysis (decision D4).

| Property | Type | Meaning |
| --- | --- | --- |
| `intercurrentEvent`* | StudyConcept |  |
| `strategy`* | IchE9R1StrategyEnum |  |
| `basis`* | HandlingBasisEnum |  |
| `fromPhrase` | string | The phrase that states the strategy, when the basis is statedByPhrase. |
| `implementedBy`[] | string | The library Transformations that implement the strategy. Empty for a treatment-policy strategy, where data are used as observed. |

#### TransformationInstance — abstract

A library Transformation as used in a study.

| Property | Type | Meaning |
| --- | --- | --- |
| `id`* | string |  |
| `label` | string |  |
| `template`* | string | The library Transformation instantiated (a Transformation identifier). Its version is pinned by the set's library pins. |
| `placeholderValues`[] | PlaceholderValue |  |
| `configurationValues`[] | ConfigurationValue |  |
| `dependsOn`[] | DerivationConcept | The derivations whose results this instance reads. |
| `sapRefs`[] | DocumentAnchor |  |

#### DerivationConcept (a kind of TransformationInstance)

A derivation-type Transformation as used in a study (decision D11).

| Property | Type | Meaning |
| --- | --- | --- |
| `purpose` | string | Why the study needs this derivation. |

#### AnalysisConcept (a kind of TransformationInstance)

An analysis-type Transformation as used in a study, with the estimand it addresses, how intercurrent events are handled, and the SmartPhrases that describe it (decision D11).

| Property | Type | Meaning |
| --- | --- | --- |
| `reference` | ExternalReference | An identifier for this analysis in the AC namespace. |
| `addressesEstimand` | EstimandReference | The estimand the analysis addresses (decision D5). |
| `addressesObjective` | ExternalReference | The USDM objective the analysis serves. |
| `arsAnalysis` | ExternalReference | The ARS analysis this corresponds to. |
| `analysisRole` | AnalysisRoleEnum |  |
| `sentenceRole` | string | The words that say what kind of analysis this is in generated text (the primary analysis). |
| `phrases`[] | PhraseInstance |  |
| `iceHandlings`[] | IceHandling | One entry for every intercurrent event in the addressed estimand's scope. |
| `summaryOutput` | string | The output that carries the population-level summary (the Method or SubMethod that produces it). |

#### MethodGrounding

External identifiers for a Method as used in the study, and how the study names it in text.

| Property | Type | Meaning |
| --- | --- | --- |
| `method`* | string |  |
| `label` | string | The short form of the method's name, as the study writes it. |
| `name` | string | The full form of the method's name, as the study writes it. |
| `reference` | ExternalReference |  |
| `arsMethod` | ExternalReference |  |

#### ExtensionDeclaration

A model that extends this study analysis set (decision D13).

| Property | Type | Meaning |
| --- | --- | --- |
| `namespace`* | uri | The IRI under which the extending model mints its identifiers. |
| `description` | string |  |
| `location` | string | Where the extension's content for this study is held. |

#### StudyAnalysisSet

A study's Analysis Concepts and Derivation Concepts.

| Property | Type | Meaning |
| --- | --- | --- |
| `id`* | string |  |
| `description` | string |  |
| `study`* | ExternalReference | The USDM study this set belongs to. |
| `studyTitle` | string |  |
| `libraryPins`*[] | LibraryPin |  |
| `sourceDocument` | SourceDocument |  |
| `sourceDocumentNote` | string | Why the study has no source document, when it has none. |
| `studyConcepts`[] | StudyConcept |  |
| `estimands`[] | EstimandReference |  |
| `methodGroundings`[] | MethodGrounding |  |
| `derivations`[] | DerivationConcept |  |
| `analyses`[] | AnalysisConcept |  |
| `dataBindings`[] | DataBinding | Value-level data bindings for this study (decision D8). |
| `extensions`[] | ExtensionDeclaration |  |

#### Enumerations

| Enumeration | Values |
| --- | --- |
| IriStatusEnum | authoritative, illustrative |
| StudyConceptKindEnum | Parameter, Timepoint, Population, Treatment, Event, IntercurrentEvent |
| AnalysisRoleEnum | MainEstimator, SensitivityAnalysis, SupplementaryAnalysis |
| HandlingBasisEnum | statedByPhrase, studyDefault |
| DocumentRelationEnum | specification, qualification, definition |

## Shared

### `ac_common` — AC Common Slots

Schema for AC (Analysis Concepts) shared slot definitions.

#### Coding

A reference to a code in a terminology or ontology

| Property | Type | Meaning |
| --- | --- | --- |
| `system`* | uri | URI identifying the coding system (e.g., http://purl.obolibrary.org/obo/) |
| `code`* | string | The code value within the system (e.g., STATO_0000179) |
| `display` | string | Human-readable label for the code |

#### Enumerations

| Enumeration | Values |
| --- | --- |
| EntryStatus | released, provisional, deprecated |
| ValueTypeEnum | Quantity, CodeableConcept, Identifier, Range, Ratio, Count, Period, decimal, integer, boolean, string, code, date, dateTime |
| UnitRuleEnum | inherited, derived, fixed, unitless, none |

