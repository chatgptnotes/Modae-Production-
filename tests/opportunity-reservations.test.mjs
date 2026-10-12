import test from 'node:test'
import assert from 'node:assert/strict'
import { assertReservedOpportunityIds } from '../api/_opportunity-reservations.js'
const client = rows => ({from(){const q={select(){return q},in(){return q},async is(){return {data:rows}}};return q}})
test('new IDs require reservation bound to the authenticated actor',async()=>{
 const c=client([{id:'opportunity_reserved_2610001',data:{id:'2610001',actor:'auth-a'}}])
 await assertReservedOpportunityIds(c,['2610001'],'auth-a')
 for(const [ids,actor] of [[['2610001'],'auth-b'],[['2610002'],'auth-a'],[['2610001'],''],[[''],'auth-a'],[[' 2610001 '],'auth-a']]) await assert.rejects(()=>assertReservedOpportunityIds(c,ids,actor),{status:403})
 await assertReservedOpportunityIds(c,[],'')
})
test('imported historical ledgers without an actor cannot authorize new creates',async()=>{
 await assert.rejects(()=>assertReservedOpportunityIds(client([{id:'opportunity_reserved_old',data:{id:'old'}}]),['old'],'auth-a'),{status:403})
})
