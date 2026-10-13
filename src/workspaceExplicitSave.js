// A command is a frozen selection, never the whole browser snapshot. Partial
// success is retained and no revision conflict is retried against a newer rev.
export async function commitWorkspaceRecords(records,rpc,isCurrent=()=>true) {
  const committed=[],conflicts=[]
  try {
  for(const entity of [...new Set(records.map(r=>r.entity))]){
    if(!isCurrent())throw new Error('The workspace session changed. Review before saving again.')
    const batch=records.filter(r=>r.entity===entity)
    const result=await rpc('save_rows',{p_entity:entity,p_rows:batch.map(({id,data,rev,deleted})=>({id,data,rev,...(deleted?{deleted:true}:{})}))})
    if(!isCurrent())throw new Error('The workspace session changed. Review before saving again.')
    if(result.error)throw result.error
    if(!Array.isArray(result.data?.committed))throw new Error('The server did not confirm saved records. Refresh before retrying.')
    committed.push(...result.data.committed)
    conflicts.push(...(result.data.conflicts||[]).map(r=>({...r,entity})))
  }
  } catch(error) { return {committed,conflicts,error} }
  return {committed,conflicts}
}
