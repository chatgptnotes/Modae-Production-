import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ACCESS_ACTIONS, ACCESS_PAGES, defaultAccessPolicy } from '../src/accessPolicy.js'

const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({ entryPoints: ['src/admin/AccessRulesEditor.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' } })
const module = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
const render = (config = {}, canEdit = true) => renderToStaticMarkup(React.createElement(module.exports.default, { store: { config, opportunities: [] }, canEdit }))

test('access matrix exposes each configurable grant for both roles while protecting administrators', () => {
  const html = render()
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2 * (ACCESS_ACTIONS.length + ACCESS_PAGES.length))
  for (const { label } of [...ACCESS_ACTIONS, ...ACCESS_PAGES]) {
    assert.ok(html.includes(`aria-label="Standard user: ${label}"`), label)
    assert.ok(html.includes(`aria-label="Management: ${label}"`), label)
  }
  assert.match(html, /Administrator access is always protected/)
  assert.doesNotMatch(html, /aria-label="Administrator:/)
})

test('authoritative load gates editing and non-administrators cannot submit', () => {
  for (const canEdit of [true, false]) {
    const html = render({}, canEdit)
    assert.equal((html.match(/<fieldset disabled=""/g) || []).length, 3)
    assert.match(html, /disabled="">Save access rules/)
  }
  assert.match(render({}, false), /Only administrators can load and change these rules/)
})

test('number preview follows draft format and saved grants render checked', () => {
  const policy = defaultAccessPolicy()
  policy.roles.STANDARD_USER.pages = []
  policy.roles.STANDARD_USER.actions = []
  const html = render({ accessPolicy: policy, opportunityNumbering: { prefix: 'OPP', dateFormat: 'none', separator: '-', sequenceWidth: 5, reset: 'continuous' } })
  assert.match(html, /aria-live="polite">OPP-00001/)
  assert.doesNotMatch(html, /aria-label="Standard user: [^"]+" checked/)
  assert.match(html, /Reason for change/)
  assert.match(html, /Existing IDs stay unchanged/)
})
