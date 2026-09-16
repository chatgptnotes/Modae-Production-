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
  assert.match(source, /store\.stageClarificationAnswer\(row\.id/)
  assert.match(source, /store\.confirmClarificationField/)
  assert.match(source, /AI suggests updating/)
  assert.match(source, /\['additionalCustomerInformation', 'Additional customer information'\]/)
  assert.match(source, /currentFields: \{ oppName: opp\.oppName/)
  assert.match(source, /store\.addCommunication\(opp\.id/)
})

test('answered clarification responses use the green success treatment', () => {
  const source = read('src/pages/Workbench.jsx')
  const styles = read('src/styles.css')
  assert.match(source, /clarification-answer-box \$\{c\.status === 'Needs review' \? 'needs-review' : 'answered'\}/)
  assert.match(styles, /\.clarification-answer-box\.answered[\s\S]*var\(--status-success-soft\)/)
  assert.match(styles, /\.clarification-answer-box\.needs-review[\s\S]*var\(--status-warning-soft\)/)
})

test('AI endpoints expose clarification answer mapping', () => {
  assert.match(read('api/ai.js'), /clarification\.answer/)
  assert.match(read('api/ai.js'), /clarificationAnswerSchema/)
  assert.match(read('api/ai.js'), /missing: \{ type: 'STRING' \}/)
  assert.match(read('api/ai.js'), /fieldKey: \{ type: 'STRING' \}/)
  assert.match(read('api/ai.js'), /ALLOWED OPPORTUNITY FIELDS/)
  assert.match(read('api/ai.js'), /CURRENT OPPORTUNITY FIELDS \(already known; do not ask for these again\)/)
  assert.match(read('api/ai.js'), /Needs review/)
  assert.match(read('supabase/functions/ai/index.ts'), /'clarification\.answer'/)
  assert.match(read('supabase/functions/ai/index.ts'), /missing: STR/)
  assert.match(read('supabase/functions/ai/index.ts'), /fieldKey: STR/)
  assert.match(read('api/ai.js'), /additionalCustomerInformation only for explicit/)
  assert.match(read('supabase/functions/ai/index.ts'), /additionalCustomerInformation only for explicit/)
})

test('partial customer answers remain reviewable and blocking', () => {
  assert.match(read('src/store.jsx'), /status === 'Needs review'/)
  assert.match(read('src/pages/Workbench.jsx'), /row\.status === 'Needs review'/)
  assert.match(read('src/gates.js'), /'Needs review'/)
})
