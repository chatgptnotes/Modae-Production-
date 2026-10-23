import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const styles = fs.readFileSync('src/styles.css', 'utf8')
const mailStyles = fs.readFileSync('src/pages/mail.css', 'utf8')

function darkThemeBlock() {
  const start = styles.indexOf(':root[data-theme="dark"], html[data-workspace-theme="dark"], .shell[data-theme="dark"]')
  const end = styles.indexOf('\n}', start) + 2
  assert.ok(start >= 0, 'dark theme token block must exist')
  return styles.slice(start, end)
}

test('dark mode uses the approved charcoal, neutral text, and semantic accent palette', () => {
  const dark = darkThemeBlock()
  const expected = {
    '--surface-canvas': '#121316',
    '--surface-default': '#1B1C20',
    '--surface-raised': '#23252B',
    '--surface-sunken': '#1B1C20',
    '--text-primary': '#FFFFFF',
    '--text-secondary': '#D1D5DB',
    '--text-tertiary': '#8E939D',
    '--border-default': '#2D2F36',
    '--border-subtle': '#2D2F36',
    '--border-control': '#8E939D',
    '--brand-red': '#E85D35',
    '--brand-red-hover': '#E5A93C',
    '--brand-red-active': '#E85D35',
    '--action-secondary-bg': '#23252B',
    '--action-secondary-text': '#D1D5DB',
    '--action-secondary-hover': '#2D2F36',
    '--status-success': '#10B981',
    '--status-warning': '#F59E0B',
    '--status-danger': '#EF4444',
    '--status-danger-bg': '#721C24',
    '--status-danger-text': '#F5C6CB',
  }

  for (const [token, value] of Object.entries(expected)) {
    assert.match(dark, new RegExp(`${token}:\\s*${value.replace('#', '\\#')}`, 'i'), `${token} should be ${value}`)
  }
})

test('dark mode does not introduce arbitrary blue or purple UI text', () => {
  const dark = darkThemeBlock()
  assert.doesNotMatch(dark, /#(?:175CD3|93C5FD|5925DC|007A78)/i)
})

test('dark mode keeps enquiry uploads and the centered mail composer on theme surfaces', () => {
  assert.match(styles, /\.lead-paste-modal \.tender-drop \{[^}]*background: var\(--surface-raised\) !important;[^}]*color: var\(--text-primary\)/)
  assert.match(styles, /\.lead-paste-modal \.tender-drop:is\(:hover, \.drag\)[^}]*background: var\(--selected-state\) !important/)
  assert.match(mailStyles, /\.microsoft-mail-compose-backdrop \{[^}]*inset: 0;[^}]*place-items: center/)
  assert.match(mailStyles, /\.microsoft-mail-compose \{[^}]*background: var\(--surface-default\);[^}]*color: var\(--text-primary\)/)
  assert.match(mailStyles, /microsoft-mail-compose form footer button[^}]*background: var\(--action-accent\) !important;[^}]*color: var\(--text-on-accent\) !important/)
})
