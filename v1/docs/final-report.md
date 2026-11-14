# Candidate v1 — final report

Tracking issue: [#15](https://github.com/cdisc-org/analysis-concepts/issues/15).
Built on 14 November 2026 on the `candidate_v1` branch, without review. It is a
proposal.

## Outcome

The candidate is complete against its definition of done. One LinkML model
covers the five layers and the study side. All libraries are migrated into it,
two studies are carried end to end, and a conformance suite checks the result.

| Definition of done | Result |
| --- | --- |
| Build plan and decisions log | [build-plan.md](build-plan.md), [decisions.md](decisions.md): 13 design decisions, 20 build decisions |
| Trial migration | Seven methods converted into the `model-schema` method schema. No fallback needed |
| LinkML schemas for all five layers, generating JSON Schema | 11 schema files in `v1/schema/`; 10 generated JSON Schemas |
| Libraries migrated and validating | 60 methods, 57 statistics, 13 statistic sets, 43 output classes, 108 concepts, 26 transformations, 31 SmartPhrases, 121 data bindings |
| Study analysis instance, with two worked studies | CDISC Pilot (4 Analysis Concepts, 7 Derivation Concepts); PrE0102 (4 Analysis Concepts) |
| Conformance tests, run by one command | `python -m pytest v1/tests -q`: 69 tests pass. Validator: 0 errors, 40 warnings |
| Documentation | Overview, generated model reference, worked examples, conformance rules, glossary, gaps |
| Final report | This file |

## The method schema decision (D1)

The `model-schema` method schema is the base of the method layer, as decided.
All 60 methods of `methods_02` were migrated into it.

- **Fallbacks to the `methods_02` method form: none.**
- **Extensions to the base schema: five**, all additive: an output class on an
  output (with optional statistics and a data type); `conformsTo` on a
  configuration; a default expression and notes on a formula; an `object` data
  type; and library containers with a status on every entry.
- **Contrasts are sub-methods** (D2). Where a method produces marginal means
  and contrasts, the contrast sub-method takes the means as its input.

Two things about the result need the group's attention. Hypothesis tests have
no natural class and are carried as model-based methods. The model terms and
parameters of the 14 model-based methods were generated from their formulas and
have not been reviewed by a statistician.

## What the conformance suite shows

- **The layer rules hold and are checked.** No Method references a Concept; no
  Concept holds a variable mapping or names a Method; no Transformation or
  SmartPhrase names a variable; Data Bindings map only to Concepts.
- **Bindings are satisfied, not just declared.** Where a Transformation binds an
  analysis Concept to a method output, the output carries the statistics the
  Concept is made of.
- **The checks mean something.** 32 tests break the model in a specific way and
  confirm that the matching rule fires.
- **The SmartPhrase layer works on the new structures.** A reference renderer
  reproduces all 24 analysis sentences of the proof of concept (8 analyses in
  English, French and German), word for word.
- **The traceability paths work.** A reference resolver gives, for each
  analysis, the derivations it depends on in order, and the study variable and
  conditions for each input.

## What was not done

- **No review.** Not by the working group and not by a statistician.
- **No fallbacks tested in anger.** The fallback rule of D1 was never needed, so
  it is untested.
- **No port of the existing tools.** The demo application and the SmartPhrase
  proof of concept do not read the candidate files.
- **No registered codes.** NCIt, STATO and estimand-strategy identifiers are
  mostly absent or illustrative.
- **No removal of legacy content.** Everything outside `v1/` is left as it was.
- **No migration of OMOP and FHIR mappings** (D8).
- **Nothing merged.** The work is on `candidate_v1` only; no pull request was
  opened.

## Findings

Twenty-four findings are recorded in [migration-notes.md](migration-notes.md),
and the open questions and gaps in [gaps.md](gaps.md). The ones most likely to
change the model:

1. Hypothesis tests need a class of their own (finding 1).
2. Analysis concepts are tied to one test distribution, so several kinds of
   output have no concept to bind to (finding 7).
3. Conditional analyses, analyses with no method, and treatment as a continuous
   dose cannot yet be expressed. The CDISC Pilot's primary analysis, the
   group's own running example, needs the first and the third.
4. Three of the five intercurrent-event strategies have no implementation, and
   the one used for the hypothetical strategy is doubtful (finding 23).
5. The library has no derivations for time-to-event data (finding 20).

## Suggested next steps

1. The working group reviews the thirteen design decisions and the provisional
   content.
2. A statistician reviews the model-based methods.
3. Close the modelling gaps in the list above, starting with the hypothesis-test
   class and the distribution-specific concepts.
4. Request the missing NCIt and STATO terms.
5. Port one of the existing tools to the candidate files, to test them against
   a real consumer.
6. Remove or archive the legacy content, and open a pull request.
