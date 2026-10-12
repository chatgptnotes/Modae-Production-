import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSearchResult, matchesOpportunitySearch, searchSummary, requiredSearchClarification } from '../src/opportunitySearch.js'
const clause = (field, op, ...values) => ({ field, op, values })
const ready = (...all) => ({ status: 'ready', groups: [{ all }], sort: null })

test('won-date requests require choosing a real recorded date', () => {
  const query = 'i won opp after 14 sep 2025 but before march 26'
  assert.match(requiredSearchClarification({ query }).question, /date/i)
  assert.equal(requiredSearchClarification({ query, answers: [{ question: 'Which date should “won” use?', answer: 'Verified booking date' }] }), null)
  assert.equal(requiredSearchClarification({ query: 'Won with booking date after 2025-09-14' }), null)
})
test('example search applies personal ownership, won stage and exclusive dates', () => {
  const result = validateSearchResult(ready(clause('owner','eq','@me'), clause('stage','eq','Won'), clause('bookingDate','gt','2025-09-14'), clause('bookingDate','lt','2026-03-01')))
  const match = (owner, bookingDate, stage='Won') => matchesOpportunitySearch({ owner, stage }, result, { me: 'LJS', valueOf: (row, key) => key === 'bookingDate' ? bookingDate : row[key] })
  assert.equal(match('LJS','2025-09-14'),false)
  assert.equal(match('LJS','2025-09-15'),true)
  assert.equal(match('LJS','2026-02-28'),true)
  assert.equal(match('LJS','2026-03-01'),false)
  assert.equal(match('LJS',''),false)
  assert.equal(match('AH','2025-10-01'),false)
  assert.equal(match('LJS','2025-10-01','Lost'),false)
  assert.match(searchSummary(result), /2025-09-14/)
})
test('combines OR groups and case-insensitive text without executing code', () => {
  const result = validateSearchResult({status:'ready',sort:null,groups:[{all:[clause('sellTo','contains','hydro'),clause('valueK','gte','100')]},{all:[clause('oppType','eq','Spares')]}]})
  assert.equal(matchesOpportunitySearch({sellTo:'Andritz Hydro',valueK:100},result),true)
  assert.equal(matchesOpportunitySearch({sellTo:'Andritz Hydro',valueK:99},result),false)
  assert.equal(matchesOpportunitySearch({oppType:'Spares'},result),true)
})
test('rejects unknown fields, invalid dates, incompatible operators and partial filters', () => {
  for (const bad of [clause('__proto__','eq','x'),clause('orderDate','gte','2025-02-30'),clause('valueK','contains','2'),clause('valueK','gte',''),clause('orderDate','between','2026-03-01','2025-01-01')]) assert.throws(()=>validateSearchResult(ready(bad)))
  assert.throws(()=>validateSearchResult({...ready(clause('stage','eq','Won')),sort:{key:'secret',dir:1}}))
  assert.throws(()=>validateSearchResult({status:'ready',groups:[],sort:null}))
  assert.throws(()=>validateSearchResult(ready(...Array.from({length:25},()=>clause('stage','eq','Won')))))
})
test('clarifications and unsupported requests never carry executable filters', () => {
  assert.deepEqual(validateSearchResult({status:'clarify',question:'Which owner?',choices:['LJS','AH']}),{status:'clarify',question:'Which owner?',choices:['LJS','AH']})
  assert.throws(()=>validateSearchResult({status:'clarify',question:'',choices:[]}))
  assert.deepEqual(validateSearchResult({status:'unsupported',message:'Search cannot modify records.'}),{status:'unsupported',message:'Search cannot modify records.'})
})
test('free-text date answers proceed to the model instead of repeating the question',()=>{
  assert.equal(requiredSearchClarification({query:'I won after September 2025',answers:[{question:'Which date should “won” use?',answer:'booking date'}]}),null)
})
test('missing forecast matches the unchecked state shown in the table',()=>{
  const plan=validateSearchResult(ready(clause('forecast','eq','false')))
  assert.equal(matchesOpportunitySearch({},plan),true)
  assert.equal(matchesOpportunitySearch({forecast:true},plan),false)
})
