import test from 'node:test'
import assert from 'node:assert/strict'
import postcss from 'postcss'
import * as state from '../src/appState.js'

test('explicit Phone mode remains selected when the viewport changes', () => {
  assert.equal(typeof state.followViewportMode, 'function', 'view mode needs a testable viewport transition')
  const pinned = { viewMode: 'tablet', viewModePinned: true, viewModePinnedAt: 'full' }
  assert.equal(state.followViewportMode(pinned, 'tablet'), pinned)
  assert.equal(state.followViewportMode(pinned, 'full'), pinned)
  assert.equal(state.followViewportMode({ viewMode: 'full', viewModePinned: false }, 'tablet').viewMode, 'tablet')
})

test('workspace CSS uses container width without activating desktop media rules in Phone mode', async () => {
  const { default: plugin } = await import('../scripts/phone-workspace-css.js')
  const css = (await postcss([plugin()]).process('@media screen and (max-width:600px){.page{width:100vw}} @media(min-width:1025px){.page{display:grid}} @media print{.page{color:black}}', { from: 'src/tablet/phone.css' })).css
  assert.match(css, /@container phone-workspace \(max-width:600px\)/)
  assert.match(css, /width:100cqw/)
  assert.match(css, /:where\(html:not\(\[data-phone-mode\]\)\) \.page/)
  assert.match(css, /@container phone-workspace \(min-width:1025px\)/)
  assert.match(css, /@media print\{\.page\{color:black\}\}/)
})

test('workspace CSS preserves non-width media conditions and query alternatives', async () => {
  const { default: plugin } = await import('../scripts/phone-workspace-css.js')
  const css = (await postcss([plugin()]).process('@media (max-width:600px) and (prefers-reduced-motion:reduce){.page{animation:none}} @media(max-width:390px),(max-width:24em){.page{padding:0}}', { from: 'src/styles.css' })).css
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/)
  assert.match(css, /@container phone-workspace \(max-width:390px\)/)
  assert.match(css, /@container phone-workspace \(max-width:24em\)/)
})

test('workspace CSS keeps root selectors valid outside Phone mode', async () => {
  const { default: plugin } = await import('../scripts/phone-workspace-css.js')
  const css = (await postcss([plugin()]).process('@media(max-width:600px){html{overflow:clip}:root{color:red}}', { from: 'src/styles.css' })).css
  assert.match(css, /html:where\(:not\(\[data-phone-mode\]\)\)/)
  assert.match(css, /:root:where\(:not\(\[data-phone-mode\]\)\)/)
})

test('screen-only phone styles cannot change printed output', async () => {
  const { default: plugin } = await import('../scripts/phone-workspace-css.js')
  const result = await postcss([plugin()]).process('@media screen and (max-width:600px){.header{position:sticky}}', { from: 'src/tablet/phone.css' })
  let container
  result.root.walkAtRules('container', rule => { container = rule })
  assert.equal(container.parent.name, 'media')
  assert.equal(container.parent.params, 'screen')
})
