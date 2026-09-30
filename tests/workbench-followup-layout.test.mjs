import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const workbench = fs.readFileSync(new URL('../src/pages/Workbench.jsx', import.meta.url), 'utf8')

test('follow-up workbench contains long labels within the page grid', () => {
  assert.match(css, /\.page \.opp-summary-title h1[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(css, /\.page \.opp-summary-grid\.clean-summary-grid[\s\S]*?minmax\(0, 1fr\)/)
  assert.match(css, /\.page \.progress-controls[\s\S]*?flex-wrap: wrap;/)
  assert.match(css, /\.page \.progress-step \.progress-label[\s\S]*?text-wrap: balance;/)
})

test('follow-up cards use contained responsive controls and wrapping rows', () => {
  assert.match(css, /\.page \.follow-up-grid[\s\S]*?align-items: start;/)
  assert.match(css, /\.page \.follow-up-panel[\s\S]*?height: 100%;[\s\S]*?box-sizing: border-box;/)
  assert.match(css, /\.page \.follow-up-panel \.check-row[\s\S]*?min-width: 0;/)
  assert.match(css, /\.page \.close-outcome-form[\s\S]*?display: grid;/)
  assert.match(css, /\.page \.competitor-control-row[\s\S]*?display: grid;/)
  assert.match(css, /\.page \.follow-up-control-row[\s\S]*?min-width: 0;/)
  assert.match(css, /\.revision-control-row select\s*\{[\s\S]*?flex: 1 1 280px;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/)
})

test('follow-up page keeps the existing four functional cards', () => {
  for (const title of ['Revisions', 'Follow-up & reminders', 'Close-out', 'Competitors']) {
    assert.match(workbench, new RegExp(`>${title.replace(/[&]/g, '\\&')}<`))
  }
})

test('follow-up emails open as reviewed Gmail drafts and escalation is gated', () => {
  assert.match(workbench, /gmailComposeHref\(\{ to: mailTo, cc: mailCc, subject: mailSubject, body: fuDraft \}\)/)
  assert.match(workbench, /status: 'draft'/)
  assert.match(workbench, /updateCommunication\(opp\.id, draftCommunicationId, \{ status: 'sent' \}/)
  assert.match(workbench, /age >= 14 && !customerReplied/)
  assert.match(workbench, /disabled={!canEscalate}/)
  assert.match(workbench, /escalationUser\?\.email/)
})
