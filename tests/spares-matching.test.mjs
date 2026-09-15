import test from 'node:test'
import assert from 'node:assert/strict'
import { descriptionMatch } from '../src/workbench/sparesMatching.js'

test('generic card overlap is not an alternative match', () => {
  assert.equal(descriptionMatch('MPC4 monitoring card', 'AC-7201/16GB SD Card'), null)
})

test('specific model identifiers can support a match', () => {
  const match = descriptionMatch('MPC4 monitoring card', 'MPC4 replacement monitoring module')
  assert.ok(match)
  assert.deepEqual(match.words, ['mpc4'])
  assert.ok(match.confidence >= 70)
})

test('two specific technical terms support a description match', () => {
  const match = descriptionMatch('VM600 rack 19 inch', 'VM600 rack 19 inch with power supply')
  assert.ok(match)
  assert.deepEqual(match.words, ['vm600', 'rack', 'inch'])
})
