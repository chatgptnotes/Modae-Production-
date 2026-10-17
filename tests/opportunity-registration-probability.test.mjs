import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('both opportunity creation paths collect optional independent percentage, band and expected date', () => {
  for (const path of ['src/pages/Register.jsx', 'src/pages/IntakeForm.jsx']) {
    const source = read(path)
    assert.match(source, /Probability band/)
    assert.match(source, /Win probability \(%\)/)
    assert.match(source, /Expected order date/)
    assert.match(source, /Fiscal quarter \/ year/)
    assert.match(source, /parseProbabilityPct\(/)
    assert.match(source, /step="any"/)
    assert.match(source, /probabilityPct/)
    assert.match(source, /orderDate[, :]/)
    assert.match(source, /fiscalQuarter\(/)
  }
})

test('later opportunity editing keeps explicit zero and exposes percentage without deriving a band', () => {
  const source = read('src/OpportunityDetailsEditor.jsx')
  assert.match(source, /Win probability \(%\)/)
  assert.match(source, /opp\.probabilityPct == null \? '—' : `\$\{opp\.probabilityPct\}%`/)
  assert.match(source, /'probabilityPct'/)
  assert.match(source, /validateOpportunityEdit\('probabilityPct'/)
})

test('cleared registration email stays empty and the edited notes populate opportunity remarks', () => {
  const registration = read('src/pages/Register.jsx')
  const intake = read('src/pages/IntakeForm.jsx')
  assert.match(registration, /contactEmail:lead\?\.contactEmail \?\? lead\?\.from \?\? ''/)
  assert.match(registration, /remarks: details\.notes/)
  assert.match(intake, /remarks: f\.notes/)
})

test('carried lead source remains editable through the scoped opportunity detail patch', () => {
  const editor = read('src/OpportunityDetailsEditor.jsx')
  assert.match(editor, /'source'/)
  assert.match(editor, /source: opp\.source/)
  assert.match(editor, /<ReadOnlyField label="Source" value=\{opp\.source\}/)
  assert.match(editor, /value=\{draft\.source\} onChange=\{e => set\('source', e\.target\.value\)\}/)
})
