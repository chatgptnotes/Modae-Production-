import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AccountActionMenu, { accountMenuPosition } from '../src/ui/AccountActionMenu.jsx'

test('closed account actions render only the compact accessible trigger', () => {
  const html = renderToStaticMarkup(React.createElement(AccountActionMenu, {
    name: 'Ruthvik Satish', open: false, onOpenChange() {},
  }, React.createElement('button', { role: 'menuitem' }, 'Reset password')))
  assert.match(html, /aria-haspopup="menu"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /Actions for Ruthvik Satish/)
  assert.doesNotMatch(html, /Reset password|<details/)
})

test('account dropdown aligns below its trigger with sufficient room', () => {
  const result = accountMenuPosition({ right: 1000, top: 100, bottom: 140 }, 220, 1200, 800)
  assert.equal(result.left, 780)
  assert.equal(result.top, 144)
  assert.equal(result.width, 220)
})

test('account dropdown opens above a bottom row and stays inside narrow screens', () => {
  const result = accountMenuPosition({ right: 315, top: 650, bottom: 690 }, 220, 320, 720)
  assert.equal(result.top, 426)
  assert.ok(result.left >= 8)
  assert.ok(result.left + result.width <= 312)
})

test('oversized account menus scroll inside the viewport', () => {
  const result = accountMenuPosition({ right: 140, top: 70, bottom: 110 }, 500, 200, 180)
  assert.equal(result.width, 184)
  assert.equal(result.top, 8)
  assert.equal(result.maxHeight, 164)
})
