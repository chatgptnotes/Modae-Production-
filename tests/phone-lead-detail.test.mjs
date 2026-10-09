import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
let component
function render(overrides = {}) {
  if (!component) {
    const { outputFiles } = buildSync({ entryPoints: ['src/pages/PhoneLeadDetail.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader:{'.css':'empty'}, define:{'import.meta.url':JSON.stringify(new URL('../src/branding/modae.js',import.meta.url).href)} })
    const module = { exports: {} }
    new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
    component = module.exports.default
  }
  return renderToStaticMarkup(React.createElement(component, {
    lead: { id:'LD-1', subject:'RFQ for monitoring spares', status:'New', from:'buyer@example.com', ts:'2026-10-08T10:00:00Z' },
    summary: { customer:'Eastern Alloy Works', contact:'Ankit Verma', scope:'Monitoring spares', delivery:'Within 6 weeks', owner:'PJS' },
    issues:[{label:'Contact phone',note:'Required before registration'}], items:[{description:'Monitor',qty:0}],
    details:React.createElement('input',{defaultValue:'Draft survives', 'aria-label':'Contact person'}),
    email:React.createElement('p',null,'Original source'), action:{label:'Qualify lead', onClick:()=>{},disabled:false,note:'Qualifying does not create an opportunity.'},
    onBack:()=>{}, ...overrides,
  }))
}
test('new lead offers qualification without treating missing registration information as a qualification block', () => {
  const html = render()
  assert.match(html,/Contact phone/)
  assert.match(html,/Qualify lead/)
  assert.doesNotMatch(html,/phone-lead-primary[^>]*disabled/)
  assert.doesNotMatch(html,/Converted to opportunity|Open opportunity/)
})
test('tabs keep editable details and email mounted but hidden outside Overview', () => {
  const html=render()
  assert.match(html,/role="tab"[^>]*aria-selected="true"[^>]*>Overview/)
  assert.match(html,/role="tabpanel"[^>]*hidden=""[^>]*>[\s\S]*Draft survives/)
  assert.match(html,/Original source/)
})
test('converted and empty records do not invent opportunity links or requested items', () => {
  const html=render({lead:{id:'LD-2',status:'Converted'},summary:{},issues:[],items:[],action:null})
  assert.match(html,/Untitled enquiry/)
  assert.match(html,/No requested items extracted/)
  assert.doesNotMatch(html,/Open opportunity|2609006|Arjun|Eddy-current/)
})
test('registration blockers disable the provided next action and explain why', () => {
  const html=render({action:{label:'Continue registration',disabled:true,note:'Customer verification is not complete.'}})
  assert.match(html,/phone-lead-primary[^>]*disabled=""/)
  assert.match(html,/Customer verification is not complete/)
})
test('item quantities preserve zero rather than substituting a fabricated quantity', () => {
  assert.match(render(),/Qty 0/)
})
