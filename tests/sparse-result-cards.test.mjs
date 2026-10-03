import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { OpportunitySummaryCard, LeadSummaryCard, shouldShowSparseCards } from '../src/sparseResultCards.jsx'
import { findLeadById } from '../src/leadInboxSelection.js'

test('sparse cards appear only for one to three results unless table view was chosen', () => {
  assert.equal(shouldShowSparseCards(0, false), false)
  assert.equal(shouldShowSparseCards(1, false), true)
  assert.equal(shouldShowSparseCards(3, false), true)
  assert.equal(shouldShowSparseCards(4, false), false)
  assert.equal(shouldShowSparseCards(1, true), false)
})

test('opportunity card shows key information and links to its workspace', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(OpportunitySummaryCard, {
      opportunity: { id: '2609001', sellTo: 'NTPC', oppName: 'Vibration sensors', oppType: 'Spares', prob: 'Low', valueK: 250, proposalDate: '2026-09-01', orderDate: '2026-11-01', status: 'Open' },
      stage: 'Requirement Validation', nextAction: 'P. Prakash',
    })))
  for (const value of ['2609001', 'NTPC', 'Vibration sensors', 'Spares', 'Low', 'Requirement Validation', 'P. Prakash']) {
    assert.ok(html.includes(value), `${value} should be visible`)
  }
  assert.match(html, /href="\/opp\/2609001"/)
  assert.match(html, /Open opportunity/)
})

test('lead card keeps selection, star, summary, and workspace navigation', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(LeadSummaryCard, {
      lead: { id: 'L-1', subject: 'New RFQ', sender: 'NTPC', from: 'ntpc@example.com', source: 'Email', status: 'New', urgency: 'Urgent', duplicateRisk: 'Low', suggestedOwner: 'LJS', ai: { summary: 'Requested sensors' }, ts: '2026-10-02', starred: false },
      selected: false, onSelect: () => {}, onStar: () => {}, completeness: 84, route: 'Spares', age: 'Today',
    })))
  for (const value of ['New RFQ', 'NTPC', 'Requested sensors', 'Urgent', 'Spares', '84%', 'LJS']) {
    assert.ok(html.includes(value), `${value} should be visible`)
  }
  assert.match(html, /href="\/inbox\/L-1"/)
  assert.match(html, /type="checkbox"/)
  assert.match(html, /aria-label="Star lead New RFQ"/)
})

test('archived lead cards can resolve their detail route without active inbox membership', () => {
  const archived = { id: 'L-ARCHIVED', subject: 'Old enquiry' }
  assert.equal(findLeadById([{ id: 'L-ACTIVE' }], [archived], 'L-ARCHIVED'), archived)
  assert.equal(findLeadById([{ id: 'L-ACTIVE' }], [archived], 'MISSING'), null)
})
