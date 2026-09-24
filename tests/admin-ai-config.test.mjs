import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const admin = fs.readFileSync('src/pages/Admin.jsx', 'utf8')

test('Admin AI model configuration is marked Coming soon and read-only', () => {
  assert.match(admin, /AI model configuration[\s\S]*Coming soon/)
  assert.match(admin, /value="gemini-3\.1-flash-lite" disabled readOnly/)
  assert.match(admin, /value="gemini-2\.5-flash" disabled readOnly/)
  assert.match(admin, /<button className="primary" disabled>Save configuration<\/button>/)
  assert.match(admin, /<button disabled><Icon name="play" size=\{11\} \/> Test connection<\/button>/)
  assert.match(admin, /Manual model selection is coming soon/)
})

