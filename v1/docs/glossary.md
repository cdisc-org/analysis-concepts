# Glossary

Current term first. Earlier names, which appear in presentations and on other
branches, are in brackets.

| Term | Meaning |
| --- | --- |
| Analysis Concepts (AC) [AC/DC, ACDC] | The model as a whole |
| Layer | One of the five parts of the model: SmartPhrase, Method, Transformation, Concept, Implementation |
| Method | A pure operation with named input roles, configurations and outputs. It knows nothing of Concepts or variables |
| Sub-method | A part of a model-based method that produces one output (LS means, contrasts, type III tests) |
| Statistic | One value a method can produce (an estimate, a standard error, a p-value). Identifier `S.*` |
| Statistic set | Statistics produced and read together (an estimate with its confidence interval). Identifier `SS.*` |
| Output class | A named kind of method output and the statistics it carries. Identifier `OC.*` |
| Transformation [Template, recipe] | One Method applied to Concepts for a stated purpose, with the data structures it reads and produces. Identifier `T.*` |
| Derivation transformation | A Transformation whose output is subject-level data |
| Analysis transformation | A Transformation whose output is aggregate results |
| Data structure | The dimensions and measures of a Transformation's input or output, after the W3C Data Cube vocabulary |
| Slice; slice key | A subset that fixes dimension values; a dimension that a study fixes, and where its value comes from |
| Placeholder | A `{name}` a library template leaves for a study to fill (`{parameter}`, `{visit}`) |
| Concept [Semantic Transformation Concept, Transformation Element, DataConcept] | A standard-agnostic meaning. Identifier `C.*` |
| Collected concept [Observation Concept] | A recorded fact; it has no definition |
| Closed-form concept | A derived Concept defined by an algebraic identity (Change = value − reference) |
| Method-bound concept | A Concept defined by a contract that a method output must satisfy: an operation and operands (derived) or a set of statistics (analysis) |
| Analysis concept (library) [result pattern] | A method-bound Concept for an aggregate result, such as LS means or contrasts |
| SmartPhrase [Smart Phrase, Building Block] | A reusable fragment of analysis plan text with typed placeholders. Identifier `SP_*` |
| Role | The part a phrase plays in a sentence (endpoint, population, method, covariate …) |
| Language pack | The sentence template and translations needed to write analysis sentences in one language |
| Data Binding | Which variable of a data standard carries a Concept, and under what conditions |
| Class-level binding | A binding that holds for a standard as a whole; published in a library |
| Value-level binding | A binding that holds for one parameter or condition; belongs to a study |
| Implementation catalogue | How Methods are run in a programming language (informative) |
| Study analysis set | A study's Analysis Concepts and Derivation Concepts, with its study concepts and value-level bindings |
| Analysis Concept (study) | An analysis Transformation as used in a study: template, placeholder values, estimand, intercurrent-event handling, phrases |
| Derivation Concept (study) | A derivation Transformation as used in a study |
| Study concept | A parameter, visit, population, treatment, event or intercurrent event of a study; an instance of a library Concept |
| Library pin | The exact version of a library that a study uses |
| Estimand | The ICH E9(R1) estimand, defined in USDM. The word is used in no other sense |
| Intercurrent event handling | The strategy applied to an intercurrent event in one analysis, and the Transformations that implement it |
| Document anchor | A quoted passage of a source document that licenses a statement in the model |
| eSAP | An electronic statistical analysis plan. Outside AC; it builds on the study analysis set and the SmartPhrase layer |
| Provisional | Content proposed during the candidate v1 build and not yet reviewed |
