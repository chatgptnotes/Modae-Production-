import React,{useContext,useEffect,useRef,useState} from 'react'
import {UNSAFE_NavigationContext} from 'react-router-dom'

// BrowserRouter has no data-router blocker. Intercept its navigation methods;
// native document exits get the browser's unsaved-input warning as well.
export function WorkspaceNavigationGuard({enabled,pending,onSave,onDiscard}) {
  const {navigator}=useContext(UNSAFE_NavigationContext)
  const current=useRef();current.current={enabled,pending,onSave,onDiscard}
  const [next,setNext]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  useEffect(()=>{
    if(!enabled)return
    let index=window.history.state?.idx??0,restoring=false,replaying=false
    const originals={push:navigator.push,replace:navigator.replace,go:navigator.go}
    for(const key of Object.keys(originals))navigator[key]=function(...args){
      if(current.current.pending){setMessage('');setNext(()=>()=>{originals[key].apply(navigator,args);index=window.history.state?.idx??index});return}
      const result=originals[key].apply(navigator,args);index=window.history.state?.idx??index;return result
    }
    const pop=e=>{
      const target=e.state?.idx
      if(restoring){restoring=false;e.stopImmediatePropagation();return}
      if(replaying){replaying=false;index=target??index;return}
      if(!current.current.pending||!Number.isInteger(target)){index=target??index;return}
      const delta=target-index
      if(!delta)return
      e.stopImmediatePropagation();restoring=true;window.history.go(-delta)
      setMessage('');setNext(()=>()=>{replaying=true;window.history.go(delta)})
    }
    window.addEventListener('popstate',pop,true)
    const unload=e=>{if(current.current.pending){e.preventDefault();e.returnValue=''}}
    window.addEventListener('beforeunload',unload)
    return()=>{window.removeEventListener('popstate',pop,true);Object.assign(navigator,originals);window.removeEventListener('beforeunload',unload)}
  },[enabled,navigator])
  if(!next)return null
  return <div className="workspace-sync-overlay"><section className="workspace-sync-review" role="dialog" aria-modal="true" aria-label="Unsaved changes">
    <h2>Keep your unsaved inputs</h2><p>Save applied changes, discard these drafts, or stay on this screen. Form-only inputs must first be applied using the form’s own Save action.</p>
    <button disabled={busy} onClick={async()=>{setBusy(true);try{if(await current.current.onSave()){const go=next;setNext(null);go()}else setMessage('Changes remain unsaved. Apply form inputs or review conflicts before leaving.')}finally{setBusy(false)}}}>Save and continue</button>
    <button disabled={busy} onClick={()=>{current.current.onDiscard();const go=next;setNext(null);go()}}>Discard and continue</button>
    <button disabled={busy} onClick={()=>setNext(null)}>Stay</button>
    {message&&<p role="alert">{message}</p>}
  </section></div>
}
