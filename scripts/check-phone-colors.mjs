// Local browser regression: Vite on 5180 and isolated Chrome CDP on 9331.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin = process.env.ENQUIRY_CHECK_ORIGIN || 'http://localhost:5180'
if (!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local origin required')
const source = await fs.readFile('scripts/check-workspace-theme.mjs','utf8')
const browser = await new Function('debug',source.slice(source.indexOf('async function connect()'),source.indexOf('// Composite foreground'))+'\nreturn connect')('http://localhost:9331')()
function inspect(selector) {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Missing ${selector}`)
  const rgb = value => value.match(/[0-9.]+/g).slice(0,3).map(n=>Number(n)*(value.startsWith('color(srgb')?255:1))
  const style = getComputedStyle(el), color = rgb(style.color), bg = rgb(style.backgroundColor), border = rgb(style.borderTopColor)
  const lum = a => a.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
  const contrast = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05)
  return {color,bg,border,contrast:contrast(color,bg),boundary:contrast(border,bg),neutral:Math.max(...color)-Math.min(...color)<=20}
}
const check = async (selector, {bg, neutral=true, contrast=true}={}) => {
  const result = await browser.evaluate(`(${inspect.toString()})(${JSON.stringify(selector)})`)
  if(bg) assert.deepEqual(result.bg,bg,`${selector}: inconsistent background`)
  if(neutral) assert.ok(result.neutral,`${selector}: text must use a neutral shade`)
  if(contrast) assert.ok(result.contrast>=4.5,`${selector}: contrast ${result.contrast} below 4.5`)
  return result
}
async function capture(name) {
  const output=process.env.PHONE_COLOR_OUTPUT
  if(!output) return
  await fs.mkdir(output,{recursive:true})
  await fs.writeFile(`${output}/${name}.png`,Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
}
async function checkSearch(selector, width) {
  const result = await browser.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e),i=e.querySelector('input'),r=e.getBoundingClientRect();return {height:r.height,width:r.width,x:r.x,radius:s.borderRadius,font:getComputedStyle(i).fontSize,placeholder:getComputedStyle(i,'::placeholder').fontSize,overflow:document.documentElement.scrollWidth>innerWidth}})()`)
  assert.equal(result.height,48,`${selector}: search row height`)
  assert.equal(result.radius,'12px',`${selector}: search corners`)
  assert.equal(result.font,'16px',`${selector}: input text`)
  assert.equal(result.placeholder,'16px',`${selector}: placeholder text`)
  assert.equal(result.x,16,`${selector}: page edge`)
  assert.equal(result.width,width-32,`${selector}: available width`)
  assert.equal(result.overflow,false,`${selector}: horizontal overflow`)
  if(selector.includes('tracker-grid-shell')) {
    const inner=await browser.evaluate(`(()=>{const e=document.querySelector('.tracker-search'),s=getComputedStyle(e),a=document.querySelector('.tracker-toolbar-actions');return {border:s.borderTopWidth,actions:a.getBoundingClientRect().width}})()`)
    assert.equal(inner.border,'0px','Opportunity search must not have an inner box')
    assert.equal(inner.actions,44,'Opportunity menu must not reserve unused space')
  }
}
try {
  await browser.send('Page.navigate',{url:origin})
  await browser.wait('document.querySelector(".login-bg,.shell")')
  const fixture = await browser.evaluate(`(async()=>{const {seedState,KEY}=await import('/src/appState.js');const {DEPLOYMENT_ID}=await import('/src/deployment.js');const state=seedState();state.auth={source:'local-demo',user:{id:'U-004',name:'Color QA',email:'rs@modae.demo',role:'RS',roles:['RS']}};state.role='RS';state.viewMode='tablet';state.viewModePinned=true;state.opportunities[0].owner='RS';state.opportunities[0].orderDate='2026-10-01';state.opportunities[0].proposalDate='2026-09-01';return {state:JSON.stringify(state),key:KEY,deployment:DEPLOYMENT_ID}})()`)
  const fixtureState=JSON.parse(fixture.state)
  fixtureState.demoData=false
  fixtureState.viewModePinned=false
  fixtureState.leads[0].status='Converted'
  fixtureState.leads[0].owner='RS'
  fixtureState.leads[0].oppId=fixtureState.opportunities[0].id
  const boot=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.clear();localStorage.setItem(${JSON.stringify(fixture.key)},${JSON.stringify(JSON.stringify(fixtureState))});localStorage.setItem('wintrack-modae-deployment-id',${JSON.stringify(fixture.deployment)});localStorage.setItem('modae_theme','dark');`})
  for(const width of [320,390,440]) {
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true})
    await browser.send('Page.navigate',{url:origin+'/opportunities?tab=create&view=all'})
    await browser.wait('document.querySelector(".opportunity-create-modal .pill-opt")')
    const pill=await check('.opportunity-create-modal .pill-opt',{bg:[35,37,43]})
    assert.ok(pill.boundary>=3,'Unselected pill boundary needs 3:1 contrast')
    await browser.evaluate(`document.querySelector('.pill-opt input').click()`)
    await browser.wait('document.querySelector(".pill-opt.on")')
    await browser.wait(`getComputedStyle(document.querySelector('.pill-opt.on')).backgroundColor === 'rgb(59, 33, 24)'`)
    await check('.pill-opt.on',{bg:[59,33,24]})
    await check('.opportunity-create-modal .submit:disabled',{bg:[35,37,43]})
    await browser.evaluate(`document.querySelector('.pill-opt.on').scrollIntoView({block:'center'})`)
    await capture(`classification-${width}`)
    await browser.evaluate('document.querySelector(".opportunity-create-modal .modal-close").click()')
    await check('.tracker-create-logo',{bg:[232,93,53]})
    await check('.tab-bottom a.active',{bg:[35,37,43]})
    await browser.wait('document.querySelector(".phone-opportunity-row")')
    await check('.phone-opportunity-overdue',{contrast:false})
    await browser.send('Page.navigate',{url:origin+'/inbox'})
    await browser.wait('document.querySelector(".phone-inbox-new")')
    if(await browser.evaluate(`document.querySelector('.workspace-view-switch').getAttribute('aria-checked') === 'false'`)) await browser.evaluate(`document.querySelector('.workspace-view-switch').click()`)
    await browser.wait('document.querySelector(".phone-lead-status[data-status=Converted]")')
    await check('.phone-inbox-new',{bg:[232,93,53]})
    await check('.phone-inbox-views button[aria-pressed="true"]',{bg:[232,93,53]})
    await check('.phone-lead-status[data-status="Converted"]',{bg:[13,51,39]})
    await capture(`inbox-${width}`)
    await browser.send('Page.navigate',{url:origin+'/my-dashboard'})
    await browser.wait('document.querySelector(".mobile-kpi")')
    await check('.mobile-filter-chip.is-active',{bg:[232,93,53]})
    await check('.mobile-stage-badge[data-tone="danger"]',{bg:[114,28,36]})
    await check('.mobile-card-action',{bg:[232,93,53]})
    await check('.tab-bottom a.active',{bg:[35,37,43]})
    await capture(`dashboard-${width}`)
    await checkSearch('.mobile-search',width)
    for(const [route,selector] of [['/inbox','.phone-inbox-search'],['/opportunities','.tracker-grid-shell > .toolbar'],['/approvals','.approval-filters'],['/more','.mobile-menu-search-field']]) {
      await browser.send('Page.navigate',{url:origin+route})
      await browser.wait(`document.querySelector(${JSON.stringify(selector === '.mobile-menu-search-field' ? '.mobile-menu-search' : selector)})`)
      await checkSearch(selector,width)
      await capture(`consistent-${route.slice(1)}-${width}`)
      const filter={'/inbox':'.phone-inbox-search button','/opportunities':'.tracker-search-filter','/approvals':'.approval-phone-filter'}[route]
      if(filter) {
        await browser.evaluate(`document.querySelector(${JSON.stringify(filter)}).click()`)
        await browser.wait('document.querySelector(".phone-filter-sheet")')
        await browser.evaluate(`document.querySelector('.phone-filter-actions .primary').click()`)
        await browser.wait('!document.querySelector(".phone-filter-sheet")')
        await checkSearch(selector,width)
      }
      if(route==='/more') {
        await browser.evaluate(`document.querySelector('.mobile-menu-search input').focus()`)
        await browser.send('Input.insertText',{text:'zz-no-matching-page'})
        await browser.wait('!document.querySelector(".mobile-destination-group")')
        await browser.evaluate(`document.querySelector('.mobile-menu-search input').select()`)
        await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8})
        await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8})
        await browser.wait('document.querySelector(".mobile-destination-group")')
      }
    }
  }
  await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:boot.identifier})
  await browser.evaluate(`document.querySelector('.mobile-theme-toggle').click()`)
  await browser.wait(`document.documentElement.dataset.theme === 'light'`)
  for(const width of [320,390,440]) {
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true})
    for(const [route,selector] of [['/my-dashboard','.mobile-search'],['/inbox','.phone-inbox-search'],['/opportunities','.tracker-grid-shell > .toolbar'],['/approvals','.approval-filters'],['/more','.mobile-menu-search-field']]) {
      await browser.send('Page.navigate',{url:origin+route})
      await browser.wait(`document.querySelector(${JSON.stringify(selector)}) && document.documentElement.dataset.theme==='light'`)
      await checkSearch(selector,width)
      await capture(`light-${route.slice(1)}-${width}`)
      const filter={'/inbox':'.phone-inbox-search button','/opportunities':'.tracker-search-filter','/approvals':'.approval-phone-filter'}[route]
      if(filter) {
        await browser.evaluate(`document.querySelector(${JSON.stringify(filter)}).click()`)
        await browser.wait('document.querySelector(".phone-filter-sheet")')
        await browser.evaluate(`document.querySelector('.phone-filter-actions .primary').click()`)
        await browser.wait('!document.querySelector(".phone-filter-sheet")')
      }
    }
  }
  await browser.send('Page.navigate',{url:origin+'/opportunities?tab=create'})
  await browser.wait('document.querySelector(".pill-opt")')
  const light=await browser.evaluate(`(${inspect.toString()})('.pill-opt')`)
  assert.deepEqual(light.bg,[255,255,255],'Light-mode pill styling must remain unchanged')
  await browser.evaluate(`document.querySelector('.opportunity-create-modal .mobile-theme-toggle').click()`)
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1024,height:900,deviceScaleFactor:1,mobile:false})
  await browser.wait(`!document.querySelector('.opportunity-create-modal .phone-workspace-header')`)
  const tablet=await browser.evaluate(`(${inspect.toString()})('.pill-opt')`)
  assert.deepEqual(tablet.bg,[255,255,255],'Wider-layout pill styling must remain unchanged')
  assert.deepEqual(browser.errors,[])
  console.log('Phone colors and matching five-tab search sizing/filter controls passed in both themes at 320/390/440px; wider layouts preserved.')
} finally {await browser.close()}
