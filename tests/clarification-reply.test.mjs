import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('clarification reply flow has one reply upload action and AI matching', () => {
  const source = read('src/pages/Workbench.jsx')
  assert.match(source, /Add customer reply/)
  assert.match(source, /runTaskResult\('clarification\.answer'/)
  assert.match(source, /extractDocText\(file\)/)
  assert.match(source, /store\.answerClarification\(row\.id/)
  assert.match(source, /store\.addCommunication\(opp\.id/)
})

test('AI endpoints expose clarification answer mapping', () => {
  assert.match(read('api/ai.js'), /clarification\.answer/)
  assert.match(read('api/ai.js'), /clarificationAnswerSchema/)
  assert.match(read('supabase/functions/ai/index.ts'), /'clarification\.answer'/)
})
