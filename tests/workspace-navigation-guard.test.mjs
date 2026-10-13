import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
test('native Back is restored until the user chooses to continue',()=>{
 const source=fs.readFileSync('src/ui/WorkspaceNavigationGuard.jsx','utf8')
 const body=source.slice(source.indexOf('  useEffect(()=>{')+'  useEffect(()=>{'.length,source.indexOf('  },[enabled,navigator])'))
 const listeners=new Map(),moves=[];let next
 const window={history:{state:{idx:2},go:n=>moves.push(n)},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}
 const navigator={push(){},replace(){},go(){}}
 const cleanup=new Function('enabled','navigator','current','setNext','setMessage','window',body)(true,navigator,{current:{pending:true}},setter=>{next=setter()},()=>{},window)
 let stopped=0
 const pop=idx=>listeners.get('popstate')({state:{idx},stopImmediatePropagation:()=>stopped++})
 pop(1);assert.deepEqual(moves,[1]);assert.equal(stopped,1)
 pop(2);assert.equal(stopped,2)
 next();assert.deepEqual(moves,[1,-1]);pop(1);assert.equal(stopped,2)
 cleanup();assert.equal(listeners.size,0)
})
