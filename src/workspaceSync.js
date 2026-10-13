// Event-driven only. Local messages never cause a fetch; focus/reconnect and
// explicit wake requests share one bounded check. There is no polling fallback.
export function createWorkspaceCoordinator({scope,interests,check,receive,error,env=globalThis}) {
  const tabId=env.crypto.randomUUID()
  let channel=null,stopped=false,timer=null,abort=null,epoch=0,retryAt=0
  try{channel=env.BroadcastChannel?new env.BroadcastChannel(`wintrack-sync:${scope}`):null}catch{/* Tabs revalidate independently on focus. */}
  const visible=()=>env.document.visibilityState==='visible'&&env.navigator.onLine!==false
  const post=data=>{try{channel?.postMessage({...data,scope,tabId})}catch{/* Local transport is optional. */}}
  async function run(){
    timer=null
    if(stopped||!visible()||abort||Date.now()<retryAt)return
    const captured=new AbortController(),started=epoch;abort=captured
    const timeout=env.setTimeout(()=>captured.abort(),8000)
    try{
      const own=interests()
      const result=await check({records:(own.records||[]).slice(0,100),views:(own.views||[]).slice(0,2),tabId},captured.signal)
      if(!stopped&&visible()&&epoch===started&&!captured.signal.aborted)receive(result)
    }catch(e){if(!stopped&&!captured.signal.aborted){retryAt=Date.now()+(e.retryAfterMs||0);error(e)}}
    finally{env.clearTimeout(timeout);if(abort===captured)abort=null}
  }
  function wake(){
    if(stopped)return
    if(!visible()){epoch++;env.clearTimeout(timer);timer=null;abort?.abort();return}
    if(abort||timer!==null||Date.now()<retryAt)return
    timer=env.setTimeout(run,100)
  }
  if(channel)channel.onmessage=({data})=>{
    if(!data||data.scope!==scope||data.tabId===tabId)return
    if(data.type==='committed'&&Array.isArray(data.records)&&data.records.length<=100)receive({kind:'committed',records:data.records})
    if(data.type==='editing'&&Array.isArray(data.records)&&data.records.length<=10)receive({kind:'editing',records:data.records,tabId:data.tabId})
  }
  env.document.addEventListener('visibilitychange',wake)
  for(const event of ['online','offline','focus'])env.addEventListener(event,wake)
  wake()
  return {wake,committed(records){post({type:'committed',records:records.slice(0,100)})},editing(records){post({type:'editing',records:records.slice(0,10)})},dispose(){stopped=true;epoch++;env.clearTimeout(timer);abort?.abort();channel?.close();env.document.removeEventListener('visibilitychange',wake);for(const event of ['online','offline','focus'])env.removeEventListener(event,wake)}}
}
