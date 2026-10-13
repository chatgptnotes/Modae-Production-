export const workspaceSlice = entity => entity==='spares_lines'?'sparesLines':entity
export const recordFrom = (state,entity,id) => entity==='proposals'?state.proposals?.[id]:(state[workspaceSlice(entity)]||[]).find(r=>r.id===id)
// Reconcile before rendering inputs: an effect would leave a window in which a
// user could edit an old buffer after the persistence revision has advanced.
export function reconcileEditorBuffer(buffer,{id,source,dirty,resolution},normalize) {
  if (buffer.id===id && buffer.resolution===resolution && (dirty || buffer.source===source)) return buffer
  return {id,source,value:normalize(source),resolution}
}
export function replaceRecord(state,row) {
  const {entity,id,data,available}=row
  if(entity==='proposals') {const next={...state.proposals};if(available)next[id]=data;else delete next[id];return {...state,proposals:next}}
  const slice=workspaceSlice(entity)
  const rows=state[slice]||[],found=rows.some(r=>r.id===id)
  return {...state,[slice]:available?(found?rows.map(r=>r.id===id?data:r):[data,...rows]):rows.filter(r=>r.id!==id)}
}
export function reviewedRecord(base,local,remote,choices) {
  const next=structuredClone(remote)
  for(const key of new Set([...Object.keys(base||{}),...Object.keys(local||{})])) {
    if(JSON.stringify(base?.[key])===JSON.stringify(local?.[key])||choices[key]!=='mine')continue
    if(Object.hasOwn(local,key)) next[key]=structuredClone(local[key]);else delete next[key]
  }
  return next
}
