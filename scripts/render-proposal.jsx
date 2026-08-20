// Renders the customer proposal for every route to static HTML and checks what
// came out. The unit tests assert against source text; this actually executes
// the components, which is how the rack-layout crash was caught.
//
//   npm run render:proposal
//
// JSX, so it is bundled by esbuild first — node:test cannot parse it, which is
// why this is a script rather than a test.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PrintDoc from '../src/proposal/PrintDoc.jsx'
import { docModel } from '../src/proposalDoc.js'
import { normalizeProposal } from '../src/proposal/docProps.js'
import { newProposal } from '../src/seed.js'

const cases = [
  ['Spares', { id: 'X1', oppType: 'Spares', sellTo: 'BHEL Haridwar', oppName: 'Turbine test bed' }, {}],
  ['Project', { id: 'X2', oppType: 'Project', sellTo: 'Andritz', oppName: 'VMS for U-1' }, {}],
  ['Service', { id: 'X3', oppType: 'Service', sellTo: 'JSW', oppName: 'Major outage' }, {}],
  ['Spares+annexes', { id: 'X4', oppType: 'Spares', sellTo: 'KSB', oppName: 'Meggitt spares' },
    { printAnnexes: ['clarifications', 'sensorComparison'] }],
  ['Project+compliance', { id: 'X5', oppType: 'Project', sellTo: 'NTPC', oppName: 'Air gap monitoring' },
    { printAnnexes: ['compliance'] }],
  ['Unpriced', { id: 'X6', oppType: 'Spares', sellTo: 'KSB', oppName: 'Technical bid' },
    { bidType: 'Unpriced (Technical)' }],
]

// Nothing on this list appears in any of the client's sample proposals, and the
// last two would put our own margin in front of the customer.
const MUST_NOT = ['Contents', 'About ModAE', 'Executive summary', 'Yours faithfully',
  'Encl:', 'Net GM', 'Target Price']
const MUST = ['Our Ref:', 'Bid Stage:', 'Bid Type:', 'Subject:', 'Best Regards', 'Regd. Office:']

let bad = 0
for (const [label, opp, extra] of cases) {
  const p = normalizeProposal({ ...newProposal(opp.id, opp), ...extra }, opp)
  const doc = docModel(p, opp, { files: [] })
  const priced = p.bidType !== 'Unpriced (Technical)'
  const html = renderToStaticMarkup(
    <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={{ cost: 0, target: 0 }} lineQuoted={() => 0} />)
  const sheets = (html.match(/<h3 class="doc-h">([^<]*)<\/h3>/g) || []).map(s => s.replace(/<[^>]+>/g, ''))
  console.log(`${label.padEnd(20)} ${String(html.length).padStart(6)}b  cover + ${sheets.join(' | ') || '(none)'}`)
  for (const leak of MUST_NOT) if (html.includes(leak)) { console.log(`  !! LEAK: ${leak}`); bad++ }
  for (const want of MUST) if (!html.includes(want)) { console.log(`  !! MISSING: ${want}`); bad++ }
  if (!priced && /₹\s*[1-9]/.test(html)) { console.log('  !! LEAK: prices on an unpriced bid'); bad++ }
}

console.log(bad ? `\nFAILED — ${bad} problem(s)` : '\nOK')
process.exit(bad ? 1 : 0)
