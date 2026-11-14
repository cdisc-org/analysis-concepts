# Conformance

`python v1/tools/validate.py` checks every library and study file. A finding
has a rule identifier, a severity (error or warning), a location and a message.
`python -m pytest v1/tests -q` runs the same checks as tests, and also breaks
the model on purpose to confirm that each rule marked † below fires.

Errors that are accepted for the time being are listed, each with a reason, in
`v1/tests/known_findings.json`. The list is empty. A known finding that stops
occurring fails the build, so the list cannot go stale.

## Layer rules

These are the architecture, stated so that they can be checked.

| Rule | Statement |
| --- | --- |
| L1 † | A Method references no Concept, no Transformation and no physical variable |
| L2 † | A Concept holds no mapping to a variable and names no Method or Transformation |
| L3 † | A Transformation names no physical variable |
| L4 † | A Data Binding maps to Concepts only |
| L5 | A SmartPhrase names no physical variable |

## Schema

| Rule | Statement |
| --- | --- |
| S1 † | Every file conforms to its class in the JSON Schema generated from the LinkML model. A polymorphic entry (a method, an input) is checked against the class it names |

## Vocabularies

| Rule | Statement |
| --- | --- |
| V1 | A statistic set names existing statistics |
| V2 | An output class names existing statistic sets and statistics |
| V3 | An output class's `broader` is an existing output class |

## Methods

| Rule | Statement |
| --- | --- |
| M1 | Input roles are unique within a method |
| M2 | A method has a formula. Each `<token>` in it is an input role or a configuration (warning otherwise) |
| M3 † | The statistical model names existing roles, factor levels and inputs |
| M4 | An output names existing output classes, statistic sets, statistics, model terms and parameters; a sub-method input names an existing sub-method and statistic |
| M5 | A configuration names existing sub-methods; its default is one of its allowed values |
| M6 † | An output carries exactly the statistics of its output class |

## Concepts

| Rule | Statement |
| --- | --- |
| C1 | `broader` names an existing abstract concept; `partOf` and `inheritsFrom` name existing concepts |
| C2 † | The definition given matches the definition form; a collected concept has none |
| C3 | A method-bound definition names existing statistics, statistic sets and output classes |
| C4 † | Every output class listed as satisfying a concept carries the concept's statistics. An analysis concept that no output class satisfies is a warning |
| C5 | Every operand of an algebraic identity is used in it |

## Transformations

| Rule | Statement |
| --- | --- |
| T1 † | `usesMethod` names an existing Method |
| T2 † | Every `input` is a role of the Method; every `output` is the Method or one of its sub-methods |
| T3 † | A method configuration exists on the Method and takes an allowed value |
| T4 | A measure's `slice` is a slice of the same data structure |
| T5 | Slice constraints and slice keys name a dimension of the input data structure |
| T6 | A single-valued input is bound once. A required input left unbound is a warning |
| T7 † | `concept` names a concrete Concept and `conceptCategory` an abstract one |
| T8 † | Each operand of a model interaction matches an input binding, and the Method's formula allows the interaction |
| T9 † | An output measure's analysis Concept is satisfied by the output it is bound to. A closed-form Concept whose identity does not unify with the Method's formula is a warning |
| T10 | `validSmartPhrases` names existing phrases |

## SmartPhrases

| Rule | Statement |
| --- | --- |
| P1 | Every role is defined and appears in the role order |
| P2 † | The tokens of a phrase template are exactly its placeholders |
| P3 | Anchors name an existing Concept and Method |
| P4 | A placeholder's concept category is an abstract Concept |
| P5 † | A language pack translates existing phrases, methods, output classes and roles, and keeps each phrase's placeholders |

## Data bindings and implementations

| Rule | Statement |
| --- | --- |
| B1 | A binding names an existing, concrete Concept |
| B2 | Binding identifiers are unique |
| B3 † | A variable that carries several Concepts is marked parameter-dependent on each |
| B4 | The locator is tabular |
| I1–I3 | An implementation names an existing Method, producer and statistics |
| I4 | A token of a call template that is not a role or configuration of the Method is a warning |

## Studies

| Rule | Statement |
| --- | --- |
| Y1 † | Each library pin matches the library's version |
| Y2 † | The template exists; an Analysis Concept instantiates an analysis template and a Derivation Concept a derivation template |
| Y3 † | Every placeholder of the template has a value |
| Y4 | Study concepts exist and are instances of concrete library Concepts |
| Y5 † | A phrase is one the template accepts; required placeholders are bound; each binding is of the placeholder's kind; a bound study concept is of the required kind; a bound output is an output of the template and its Method; a value lies within its constraint |
| Y6 | A role that does not repeat is filled once |
| Y7 † | An analysis that addresses an estimand states its role; each estimand has exactly one main estimator |
| Y8 † | An Analysis Concept states a handling for every intercurrent event in its estimand's scope and for no other. A strategy other than treatment policy names an implementing Transformation. A handling stated by a phrase agrees with the phrase |
| Y9 | A configuration value names a configuration of the Method and takes an allowed value. Stating a confidence level for a Method with no configuration to carry it is a warning |
| Y10 † | Dependencies exist. Every input measure is produced by a derivation the instance depends on, or is bound to data |
| Y11 † | Where the study has a source document, every analysis and every phrase use is anchored to it (directly or through a bound study concept) or says why not |
| Y12 | A study's data bindings are value-level and name existing concepts |
| Y13 † | The summary output is an output of the template |
| Y14 | A method grounding names an existing Method |

## Warnings on the committed model

`python v1/tools/validate.py --all` lists them. They are of four kinds:

- **I4 (33).** The R and SAS catalogues were written against earlier role
  names (`response` where the method now has `value`, `difference` for an
  output). They are informative and need bringing into line.
- **M2 (1).** `M.RecordSelection` writes its output as a `<flag>` token.
- **T6 (1), T1 (1).** `T.BaselineSelection` leaves the required `time_order`
  input unbound; `T.PeakConcentration` is a derivation that uses an aggregation
  method.
- **Y9 (4).** PrE0102 states 90% confidence intervals for Kaplan-Meier
  estimates, but `M.KaplanMeier` has no confidence-level configuration.
