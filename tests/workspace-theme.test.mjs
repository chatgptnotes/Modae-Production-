import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = new URL('../src/ui/workspaceTheme.js', import.meta.url)

test('theme preferences default safely and remain usable with blocked browser storage', async () => {
  assert.ok(fs.existsSync(source), 'shared theme preference helper is required')
  const { readTheme, saveTheme, storageTheme } = await import(source)
  assert.equal(readTheme({ localStorage: { getItem: () => null } }), 'light')
  assert.equal(readTheme({ localStorage: { getItem: () => 'system' } }), 'light')
  assert.equal(readTheme({ localStorage: { getItem: () => 'dark' } }), 'dark')
  const blocked = { get localStorage() { throw new Error('Storage blocked') } }
  assert.equal(readTheme(blocked), 'light')
  assert.doesNotThrow(() => saveTheme('dark', blocked))
  const values = new Map()
  const browser = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } }
  saveTheme('dark', browser)
  assert.equal(readTheme(browser), 'dark')
  assert.equal(storageTheme({ key: 'modae_theme', newValue: 'dark', storageArea: browser.localStorage }, browser), 'dark')
  assert.equal(storageTheme({ key: 'modae_theme', newValue: 'unknown', storageArea: browser.localStorage }, browser), 'light')
  assert.equal(storageTheme({ key: null, newValue: null, storageArea: browser.localStorage }, browser), 'light')
  assert.equal(storageTheme({ key: 'other', newValue: 'dark', storageArea: browser.localStorage }, browser), null)
  assert.equal(storageTheme({ key: 'modae_theme', newValue: 'dark', storageArea: {} }, browser), null)
})

test('early theme initialization honours saved appearance and keeps public pages light', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const script = html.match(/<script id="workspace-theme-init">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, 'saved appearance must be applied before React loads')
  for (const [pathname, saved, expected] of [
    ['/my-dashboard', 'dark', 'dark'], ['/opportunities', 'light', 'light'],
    ['/my-dashboard', 'invalid', 'light'], ['/showcase', 'dark', 'light'],
  ]) {
    const document = { documentElement: { dataset: {} } }
    vm.runInNewContext(script, { document, location: { pathname }, localStorage: { getItem: () => saved } })
    assert.equal(document.documentElement.dataset.workspaceTheme, expected)
  }
  const document = { documentElement: { dataset: {} } }
  vm.runInNewContext(script, { document, location: { pathname: '/my-dashboard' }, get localStorage() { throw new Error('blocked') } })
  assert.equal(document.documentElement.dataset.workspaceTheme, 'light')
})

test('dark theme provides accessible text, status pairs, buttons, and control boundaries', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const block = css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]
  const tokens = Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]))
  const resolve = name => {
    const value = tokens[name]
    return value?.startsWith('var(') ? resolve(value.slice(4, -1)) : value
  }
  const luminance = hex => {
    assert.match(hex, /^#[\da-f]{6}$/i)
    const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
  }
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
  for (const background of ['--surface-canvas', '--surface-default', '--surface-raised', '--action-secondary-hover', '--status-neutral-soft', '--status-warning-bg', '--status-danger-bg']) {
    for (const text of ['--text-primary', '--text-secondary', '--text-muted']) {
      assert.ok(contrast(resolve(text), resolve(background)) >= 4.5, `${text} must be readable on ${background}`)
    }
  }
  for (const state of ['success', 'warning', 'danger', 'info']) {
    assert.ok(contrast(resolve(`--status-${state}-text`), resolve(`--status-${state}-bg`)) >= 4.5, `${state} contrast`)
  }
  for (const button of ['--action-primary', '--action-primary-hover', '--action-primary-active']) {
    assert.ok(contrast(resolve('--text-on-accent'), resolve(button)) >= 4.5, `${button} text contrast`)
  }
  assert.ok(contrast(resolve('--border-control'), resolve('--surface-raised')) >= 3, 'input boundary contrast')
  assert.ok(contrast(resolve('--focus-ring'), resolve('--surface-raised')) >= 3, 'focus indicator contrast')
})
