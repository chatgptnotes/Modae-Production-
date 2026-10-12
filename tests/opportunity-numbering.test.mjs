import test from 'node:test'
import assert from 'node:assert/strict'
import { formatOpportunityNumber, validateOpportunityNumbering, previewOpportunityNumber, opportunityNumberParts } from '../src/opportunityNumbering.js'

test('default format changes month at midnight IST', () => {
 assert.equal(formatOpportunityNumber(1, undefined, new Date('2026-09-30T18:29:59Z')), '2609001')
 assert.equal(formatOpportunityNumber(1, undefined, new Date('2026-09-30T18:30:00Z')), '2610001')
})
test('formats separators, prefixes, yearly and continuous counters without truncation', () => {
 const c = { prefix:'MODAE', dateFormat:'YYYY', separator:'-', sequenceWidth:4, reset:'yearly' }
 assert.equal(formatOpportunityNumber(12, c, new Date('2026-10-01')), 'MODAE-2026-0012')
 assert.equal(opportunityNumberParts(c,new Date('2026-10-01')).period,'2026')
 assert.equal(formatOpportunityNumber(12345,c,new Date('2026-10-01')), 'MODAE-2026-12345')
 assert.equal(formatOpportunityNumber(1,{dateFormat:'none',reset:'continuous'}), '001')
})
test('rejects ambiguous reset formats and unsafe characters', () => {
 for (const c of [{prefix:'bad'}, {prefix:'A/B'}, {separator:'/'}, {sequenceWidth:2}, {dateFormat:'YYYY'}, {dateFormat:'none',reset:'yearly'}, {version:2}]) assert.throws(()=>validateOpportunityNumbering(c))
})
test('preview recognizes imported legacy owner suffixes and complete sequence values', () => {
 assert.equal(previewOpportunityNumber([{id:'2610999-AH'},{id:'26101001RS'},{id:'2610ABC'}],undefined,new Date('2026-10-01')),'26101002')
})
