import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({ stdin: { contents: "export { default } from './src/tablet/PhoneWorkspaceHeader.jsx'; export { ThemeProvider } from './src/ui/WorkspaceThemeContext.jsx'", resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-router-dom'], loader: { '.css': 'empty' }, define: { 'import.meta.url': JSON.stringify(new URL('../src/branding/modae.js', import.meta.url).href) } })
const module = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
const render = (store, compact = false) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(module.exports.ThemeProvider, { active: true }, React.createElement(module.exports.default, { store, compact }))))
test('initials expose an accessible account menu button in page and form headers', () => {
 for (const compact of [false, true]) {
  const html = render({ role: 'LJS', auth: { user: { name: 'Ruby Sales' } } }, compact)
  assert.match(html, /<button[^>]+aria-haspopup="dialog"[^>]+aria-expanded="false"/)
  assert.match(html, /aria-controls="[^"]+"/)
  assert.match(html, /Signed in as Ruby Sales/)
  assert.doesNotMatch(html, /role="dialog"/)
 }
})
test('shared phone header displays the original logo, view switch, theme and real user initials', () => {
 const html = render({ role: 'LJS', auth: { user: { name: 'Ruby Sales' } }, liveSyncStatus: 'live' })
 assert.match(html, /official-logo\.png/)
 assert.match(html, /role="switch"/)
 assert.match(html, /Switch to dark theme/)
 assert.match(html, /Signed in as Ruby Sales/)
 assert.match(html, />RS</)
 assert.match(html, />Live</)
 assert.match(html, /Refresh workspace/)
})
test('shared phone header reports unavailable sync honestly and falls back to role', () => {
 const html = render({ role: 'LJS', liveSyncStatus: 'error' })
 assert.match(html, /Sync unavailable/)
 assert.match(html, /Signed in as LJS/)
 assert.doesNotMatch(html, />Live</)
})
test('local-only phone workspace does not offer a database refresh', () => {
 const html = render({ role: 'RS', liveSyncStatus: 'local-only' })
 assert.match(html, /Local only/)
 assert.doesNotMatch(html, /Refresh workspace|Shared workspace|Your workspace|Sync unavailable/)
 assert.match(html, /This device/)
})
test('full-screen form header retains workspace controls without adding a second sync row', () => {
 const html = render({ role: 'RS', liveSyncStatus: 'live' }, true)
 assert.match(html, /official-logo\.png/)
 assert.match(html, /role="switch"/)
 assert.match(html, /Switch to dark theme/)
 assert.match(html, /Signed in as RS/)
 assert.doesNotMatch(html, /Refresh workspace|mobile-sync-row/)
})
