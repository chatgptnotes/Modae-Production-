// Local rendered-order regression; isolated Chrome CDP on 9331, Vite on 5180.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin=process.env.ENQUIRY_CHECK_ORIGIN || 'http://localhost:5180'
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local origin required')
const source=await fs.readFile('scripts/check-workspace-theme.mjs','utf8')
const browser=await new Function('debug',source.slice(source.indexOf('async function connect()'),source.indexOf('// Composite foreground'))+'\nreturn connect')('http://localhost:9331')()
try {
  await browser.send('Page.navigate',{url:origin})
  await browser.wait('document.querySelector(".login-bg,.shell")')
  const fixture=await browser.evaluate(`(async()=>{const {seedState,KEY}=await import('/src/appState.js');const {DEPLOYMENT_ID}=await import('/src/deployment.js');return {state:seedState(),key:KEY,deployment:DEPLOYMENT_ID}})()`)
  for(const role of ['RS','LJS']) {
    const state=structuredClone(fixture.state)
    state.demoData=false;state.role=role;state.roles=[role];state.viewMode='tablet';state.viewModePinned=false
    state.auth={source:'local-demo',user:{id:role==='RS'?'U-004':'U-002',name:'Approval QA',email:role.toLowerCase()+'@modae.demo',role,roles:[role]}}
    const boot=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.clear();localStorage.setItem(${JSON.stringify(fixture.key)},${JSON.stringify(JSON.stringify(state))});localStorage.setItem('wintrack-modae-deployment-id',${JSON.stringify(fixture.deployment)});localStorage.setItem('modae_theme','dark');`})
    for(const width of [320,390,440,1024]) {
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height:956,deviceScaleFactor:1,mobile:width<=600})
      const marker=role+'-'+width
      const navigation=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__approvalCheckNavigation=${JSON.stringify(marker)}`})
      await browser.send('Page.navigate',{url:origin+'/approvals'})
      await browser.wait(`window.__approvalCheckNavigation===${JSON.stringify(marker)} && document.querySelector('.approval-summary') && innerWidth===${width} && ${width<=600 ? '!!' : '!'}document.querySelector('.phone-workspace-header')`)
      await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:navigation.identifier})
      const order=await browser.evaluate(`(()=>{const p=document.querySelector('.approvals-page'),f=p.querySelector('.approval-filters'),k=p.querySelector('.approval-summary');return {searchBeforeKpi:!!(f.compareDocumentPosition(k)&Node.DOCUMENT_POSITION_FOLLOWING),visual:f.getBoundingClientRect().bottom<=k.getBoundingClientRect().top,noticesAfterKpi:[...p.querySelectorAll(':scope > .workspace-insights,:scope > .approval-notice')].every(e=>!!(k.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING))}})()`)
      assert.equal(order.searchBeforeKpi,width<=600,`${role} ${width}: rendered search/KPI order`)
      if(width<=600) {
        assert.equal(order.visual,true,`${role} ${width}: visual search/KPI order`)
        assert.equal(order.noticesAfterKpi,true,`${role} ${width}: warnings follow KPIs`)
        await browser.evaluate(`document.querySelector('.approval-phone-filter').click()`)
        await browser.wait('document.querySelector(".phone-filter-sheet")')
        await browser.evaluate(`document.querySelector('.phone-filter-actions .primary').click()`)
        await browser.wait('!document.querySelector(".phone-filter-sheet")')
      }
    }
    await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:boot.identifier})
  }
  assert.deepEqual(browser.errors,[])
  console.log('Approval search precedes KPIs and warnings for both phone role views at 320/390/440px; tablet order and filters preserved.')
} finally {await browser.close()}
