import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('approval notifications route to the approvals list when no opportunity exists', () => {
  assert.match(app, /export const approvalNotificationPath = approval => approval\?\.oppId/)
  assert.match(app, /\? `\/opp\/\$\{approval\.oppId\}\/approvals`\s*:\s*'\/approvals'/)
  assert.match(app, /to: approvalNotificationPath\(a\)/)
})
