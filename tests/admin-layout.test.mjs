import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const styles = fs.readFileSync('src/styles.css', 'utf8')

test('Admin cards use content height instead of stretched minimum heights', () => {
  assert.match(styles, /\.admin-setting-grid,\s*\.admin-wide-grid,\s*\.admin-bottom-grid \{[\s\S]*?align-items: start;/)
  assert.match(styles, /\.admin-page \.admin-card \{[\s\S]*?min-height: 0;/)
  assert.match(styles, /\.admin-page \.admin-card--featured \{[\s\S]*?min-height: 0;/)
})

test('Admin text keeps natural word wrapping', () => {
  assert.match(styles, /\.admin-page \.admin-card,[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/)
  assert.match(styles, /\.admin-page \.admin-card \.arow > span,[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/)
})
