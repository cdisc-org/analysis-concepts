/**
 * The Population dimension is a CONCEPT, not a literal.
 *
 * A population's identity lives in which flag variable represents it
 * (ITTFL vs SAFFL), never in that flag's value — every population flag is
 * Y/N, so "Y" identifies nothing. concept-variable-mappings.json already
 * says this: adam.dimensions.Population.byDataType maps identity keys
 * (intent_to_treat, safety, ...) onto the flag columns.
 *
 * These tests pin that contract so the spec layer stops storing "Y".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  populationLabel,
  populationVariable,
  normalizePopulation,
  populationWhereClause,
} from '../js/utils/population-concept.js';

const mappings = JSON.parse(readFileSync(
  fileURLToPath(new URL('../data/concept-variable-mappings.json', import.meta.url)), 'utf8'));

test('population labels are derived from model metadata, not a built-in list', () => {
  // populationFlags[].label is the mapping file's own wording, down to its
  // casing ("Intent-To-Treat Population Flag"). Asserting that spelling is
  // what distinguishes derivation from a hardcoded lookup table.
  assert.equal(populationLabel('intent_to_treat', mappings, 'adam'), 'Intent-To-Treat');
  assert.equal(populationLabel('per_protocol', mappings, 'adam'), 'Per-Protocol');
});

test('an unmapped population still renders readably', () => {
  assert.equal(populationLabel('intent_to_treat'), 'Intent To Treat');
});

test('populationVariable resolves the identity to its ADaM flag column', () => {
  assert.equal(populationVariable('intent_to_treat', mappings, 'adam'), 'ITTFL');
  assert.equal(populationVariable('safety', mappings, 'adam'), 'SAFFL');
});

test('a legacy bare flag value is not an identity, so it normalizes to unresolved', () => {
  // "Y" is what every population flag holds; it says nothing about WHICH
  // population was meant. Guessing one here would launder a data gap into
  // a confident-looking answer, so it resolves to null and the caller
  // surfaces it.
  assert.equal(normalizePopulation('Y'), null);
  assert.equal(normalizePopulation('N'), null);
});

test('an identity key passes through normalization unchanged', () => {
  assert.equal(normalizePopulation('intent_to_treat'), 'intent_to_treat');
});

test('a population slice becomes a flag-column equality check', () => {
  // The identity picks the COLUMN; "Y" is the codelist constant the
  // projection supplies. define-xml previously hardcoded the first token of
  // "ITTFL/SAFFL/FASFL", so every population produced ITTFL.
  assert.deepEqual(
    populationWhereClause('safety', mappings.adam),
    { variable: 'SAFFL', value: 'Y', assumed: false });
});

test('a USDM population projects onto the model default column, flagged as assumed', () => {
  // The spec names the study's own population ("Population_1"); which flag
  // implements it is an execution-layer choice. The projection still has to
  // emit a where-clause, so it falls back to the dimension's declared default
  // and marks the choice assumed rather than passing it off as specified.
  assert.deepEqual(
    populationWhereClause('Population_1', mappings.adam),
    { variable: 'ITTFL', value: 'Y', assumed: true });
});

test('an execution-layer variable choice beats the default', () => {
  assert.deepEqual(
    populationWhereClause('Population_1', mappings.adam, 'SAFFL'),
    { variable: 'SAFFL', value: 'Y', assumed: false });
});

test('an unresolved population yields no where-clause rather than a wrong one', () => {
  assert.equal(populationWhereClause(normalizePopulation('Y'), mappings.adam), null);
});

test('a USDM population identifier is shown verbatim, never humanised', () => {
  // "Population_1" and "AP_1" are USDM ids, not byDataType identity keys.
  // Humanising them produced "Population 1" / "Ap 1" — corrupting an
  // identifier the study itself minted.
  assert.equal(populationLabel('Population_1', mappings, 'adam'), 'Population_1');
  assert.equal(populationLabel('AP_1', mappings, 'adam'), 'AP_1');
});
