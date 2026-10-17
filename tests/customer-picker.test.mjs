import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import CustomerPicker, { customerPickerPosition } from '../src/CustomerPicker.jsx'

test('customer search retains an unmatched typed company and exposes an accessible combobox', () => {
  const html = renderToStaticMarkup(React.createElement(CustomerPicker, {
    label: '', ariaLabel: 'EUC name', value: 'Demo Coastal Marine Services Pvt. Ltd.',
    customers: [{ id: 'existing', name: 'Another company' }],
  }))
  assert.match(html, /role="combobox"/)
  assert.match(html, /aria-label="EUC name"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /value="Demo Coastal Marine Services Pvt. Ltd\."/)
  assert.doesNotMatch(html, /<label|Create new customer/)
})

test('customer popup widens a narrow field and stays inside the viewport', () => {
  const popup = customerPickerPosition({ left: 830, top: 100, bottom: 140, width: 170 }, 1024, 800)
  assert.equal(popup.width, 300)
  assert.equal(popup.top, 144)
  assert.ok(popup.left >= 8)
  assert.ok(popup.left + popup.width <= 1016)
  assert.equal(popup.maxHeight, 300)
})

test('customer popup opens above a low field instead of clipping off screen', () => {
  const popup = customerPickerPosition({ left: 20, top: 630, bottom: 670, width: 400 }, 1024, 720)
  assert.equal(popup.top, 326)
  assert.equal(popup.top + popup.maxHeight, 626)
  assert.equal(popup.width, 400)
})

test('customer popup constrains both dimensions on a small phone viewport', () => {
  const popup = customerPickerPosition({ left: 12, top: 90, bottom: 130, width: 420 }, 280, 240)
  assert.equal(popup.width, 264)
  assert.equal(popup.left, 8)
  assert.ok(popup.top >= 8)
  assert.ok(popup.top + popup.maxHeight <= 232)
})


test('a short popup above the field stays next to its input', () => {
  const popup = customerPickerPosition({ left: 20, top: 630, bottom: 670, width: 400 }, 1024, 720, 54)
  assert.equal(popup.top, 572)
  assert.equal(popup.top + 54, 626)
})


test('transient customer popup cannot be adopted as the persistent shared modal host', () => {
  const picker = readFileSync(new URL('../src/CustomerPicker.jsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../src/CustomerPicker.css', import.meta.url), 'utf8')
  assert.match(picker, /data-customer-picker-portal="true"/)
  assert.doesNotMatch(picker, /data-modae-portal-root/)
  assert.match(styles, /html\[data-workspace-theme="dark"\] \[data-customer-picker-portal\]/)
})
