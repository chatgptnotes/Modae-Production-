// Local browser regression check. Requires Vite and isolated Chrome CDP on 9331.
// Run: node scripts/check-phone-enquiry.mjs
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin = process.env.ENQUIRY_CHECK_ORIGIN || 'http://localhost:5180'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local origin required')
const source = await fs.readFile('scripts/check-workspace-theme.mjs', 'utf8')
const helper = source.slice(source.indexOf('async function connect()'), source.indexOf('// Composite foreground'))
const browser = await new Function('debug', helper + '\nreturn connect')('http://localhost:9331')()
try {
  await browser.send('Page.navigate', {url:origin})
  await browser.wait('document.querySelector(".login-bg, .shell")')
  const fixture = await browser.evaluate(`(async () => {
    const {seedState,KEY}=await import('/src/appState.js');const {DEPLOYMENT_ID}=await import('/src/deployment.js');
    const state=seedState();state.auth={source:'local-demo',user:{id:'U-004',name:'Enquiry QA',email:'rs@modae.demo',role:'RS',roles:['RS']}};
    state.role='RS';state.viewMode='tablet';state.viewModePinned=true;state.demoData=false;
    state.config.aiModel.provider='Built-in fallback';return {state:JSON.stringify(state),key:KEY,deployment:DEPLOYMENT_ID};
  })()`)
  for(const theme of ['light','dark']) {
    const boot=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.clear();localStorage.setItem(${JSON.stringify(fixture.key)},${JSON.stringify(fixture.state)});localStorage.setItem('wintrack-modae-deployment-id',${JSON.stringify(fixture.deployment)});localStorage.setItem('modae_theme','${theme}');`})
    await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    for (const route of ['/my-dashboard','/inbox','/opportunities','/approvals','/folders','/customers','/pricelists','/new','/more', '/inbox/LD-101']) {
      await browser.send('Page.navigate',{url:origin+route})
      await browser.wait('document.querySelector(".shell")')
      await browser.wait('document.querySelectorAll(".shell .phone-workspace-header").length === 1')
      assert.ok(await browser.evaluate(`(() => {const logo=document.querySelector('.phone-workspace-header .modae-official-logo');return !!logo && logo.getBoundingClientRect().top >= 0 && logo.getBoundingClientRect().bottom < 100})()`), `${route}: logo must be visible at the top`)
      if (theme === 'dark') assert.ok(await browser.evaluate(`getComputedStyle(document.querySelector('.mobile-dashboard-header')).backgroundColor.match(/[0-9.]+/g).slice(0,3).map(Number).every(n=>n<80)`), `${route}: dark header must not have a white background`)
      for (const width of [320,440]) {
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true})
        assert.ok(await browser.evaluate(`Array.from(document.querySelectorAll('.shell > .phone-workspace-header .mobile-dashboard-header > *')).every(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth})`), `${route}: all header controls must fit at ${width}px`)
      }
      await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
      await browser.evaluate('window.scrollTo(0,500)')
      assert.ok(await browser.evaluate(`document.querySelector('.phone-workspace-header .modae-official-logo').getBoundingClientRect().top >= 0`), `${route}: logo must remain pinned`)
      if (route === '/approvals') {
        await browser.evaluate('window.scrollTo(0,0)')
        if (await browser.evaluate('!!document.querySelector("button.phone-record")')) {
          await browser.evaluate('document.querySelector("button.phone-record").click()')
          await browser.wait('document.querySelector(".approval-decision-drawer")')
          assert.equal(await browser.evaluate('document.querySelectorAll(".approval-decision-drawer .phone-workspace-header").length'),1,'Approval full-screen details must retain the header')
        }
      }
    }
    await browser.send('Page.navigate',{url:origin+'/inbox'})
    await browser.wait('document.querySelector(".phone-inbox-new")')
    await browser.evaluate('document.querySelector(".phone-inbox-new").focus();document.querySelector(".phone-inbox-new").click()')
    await browser.wait('document.querySelector(".lead-paste-modal")')
    assert.equal(await browser.evaluate('document.querySelectorAll(".lead-paste-modal .phone-workspace-header").length'),1,'New enquiry must contain its own shared header inside the dialog')
    await browser.evaluate(`(() => {const el=document.querySelector('.lead-paste-modal input:not([type=file])');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'qa@example.com');el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.lead-paste-modal .mobile-theme-toggle').click()})()`)
    assert.equal(await browser.evaluate(`document.querySelector('.lead-paste-modal input:not([type=file])').value`),'qa@example.com','Theme changes must preserve the enquiry draft')
    await browser.evaluate(`document.querySelector('.lead-paste-modal .mobile-theme-toggle').click()`)
    const field=await browser.evaluate(`(() => {const el=document.querySelector('.lead-paste-modal input:not([type=file])');return {height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize),label:el.labels.length}})()`)
    assert.ok(field.height>=44,`Phone field height ${field.height} is below touch size`)
    assert.ok(field.font>=16,`Phone field font ${field.font} is too small`)
    assert.ok(field.label>0,'Sender input needs an associated label')
    await browser.evaluate(`(() => {const el=document.querySelector('.lead-paste-modal select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'Internal / Non-sales Enquiry');el.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await browser.wait(`document.querySelector('input[placeholder="e.g. Service, Projects, Finance"]')`)
    assert.ok(await browser.evaluate(`document.querySelector('input[placeholder="Name or email"]').labels.length>0`))
    await browser.evaluate('document.querySelector(".lead-paste-actions .primary").click()')
    await browser.wait('document.querySelector(".lead-paste-modal [role=alert]")')
    assert.match(await browser.evaluate('document.querySelector(".lead-paste-modal [role=alert]").textContent'),/Paste the email body/)
    await browser.evaluate(`(() => {
      const input=document.querySelector('.lead-paste-modal input[type=file]'),transfer=new DataTransfer();
      transfer.items.add(new File(['Monitoring RFQ details'],'RFQ-condition-monitoring-spares-with-a-long-filename-for-mobile-review.txt',{type:'text/plain'}));
      transfer.items.add(new File(['Cable specifications'],'cable-spec.txt',{type:'text/plain'}));
      input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`)
    await browser.wait('document.querySelectorAll(".lead-paste-modal .attach-row").length === 2')
    assert.ok(await browser.evaluate('document.querySelector(".lead-paste-add-files").disabled === false'))
    await browser.evaluate('document.querySelector(\'button[aria-label="Remove cable-spec.txt"]\').click()')
    await browser.wait('document.querySelectorAll(".lead-paste-modal .attach-row").length === 1')
    for(const [width,height] of [[320,640],[440,844],[390,360]]) {
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true})
      await browser.evaluate('document.querySelector(".lead-paste-modal textarea").focus()')
      await browser.wait(`document.querySelector('.lead-paste-actions .primary').getBoundingClientRect().bottom <= innerHeight + 1`)
      assert.equal(await browser.evaluate('document.documentElement.scrollWidth > innerWidth'),false)
      const fits=await browser.evaluate(`(() => {const m=document.querySelector('.lead-paste-modal'),s=document.querySelector('.lead-paste-fields');return m.scrollWidth<=m.clientWidth && s.scrollWidth<=s.clientWidth})()`)
      assert.equal(fits,true,'Modal content must not overflow horizontally')
    }
    await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    await browser.evaluate('document.activeElement.blur();document.querySelector(".lead-paste-fields").scrollTop=0')
    const output=process.env.ENQUIRY_CHECK_OUTPUT
    if(output) {await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/new-enquiry-${theme}.png`,Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
    await browser.evaluate('document.querySelector(".lead-paste-modal .modal-close").click()')
    await browser.wait('!document.querySelector(".lead-paste-modal")')
    assert.equal(await browser.evaluate('document.activeElement.classList.contains("phone-inbox-new")'),true)
    await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    await browser.send('Page.navigate',{url:origin+'/opportunities?tab=create'})
    await browser.wait('document.querySelector(".opportunity-create-modal .forms-grid")')
    assert.equal(await browser.evaluate('document.querySelectorAll(".opportunity-create-modal .phone-workspace-header").length'),1,'New opportunity must contain its own shared header inside the dialog')
    await browser.evaluate(`document.querySelector('.opportunity-create-modal').scrollTop=600`)
    await browser.wait(`document.querySelector('.opportunity-create-modal .mobile-dashboard-header').getBoundingClientRect().top >= 0`)
    await browser.evaluate(`document.querySelector('.opportunity-create-modal').scrollTop=0`)
    const opportunityFields=await browser.evaluate(`Array.from(document.querySelectorAll('.opportunity-create-modal .q input:not([type=radio]):not([type=checkbox]),.opportunity-create-modal .q select')).map(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)}))`)
    assert.ok(opportunityFields.length>5)
    assert.ok(opportunityFields.every(field=>field.height>=44&&field.font>=16),'Opportunity fields need phone touch sizing')
    assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('.opportunity-create-modal .modal-header .section-title,.opportunity-create-modal h1')).filter(el=>el.getClientRects().length>0).length`),1,'Show one opportunity heading')
    assert.equal(await browser.evaluate('parseFloat(getComputedStyle(document.querySelector(".opportunity-create-modal .section-title")).fontSize)'),20)
    if(theme==='dark') assert.ok(await browser.evaluate(`(() => {const value=getComputedStyle(document.querySelector('.opportunity-intake-form')).backgroundColor;const rgb=value.match(/[0-9.]+/g).slice(0,3).map(Number);return rgb.every(channel=>(value.startsWith('color(srgb')?channel*255:channel)<80)})()`),'Dark opportunity form must use a dark surface')
    assert.ok(await browser.evaluate(`document.querySelector('.opportunity-create-modal .forms-actions').getBoundingClientRect().bottom <= innerHeight + 1`),'Opportunity actions should be reachable without scrolling through every field')
    if(output) await fs.writeFile(`${output}/new-opportunity-${theme}.png`,Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    for(const width of [320,440]) {
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height:640,deviceScaleFactor:1,mobile:true})
      assert.equal(await browser.evaluate('document.documentElement.scrollWidth>innerWidth'),false)
      assert.ok(await browser.evaluate(`(() => {const m=document.querySelector('.opportunity-create-modal');return m.scrollWidth<=m.clientWidth})()`))
    }
    await browser.evaluate('document.querySelector(".opportunity-create-modal .modal-close").click()')
    await browser.evaluate(`document.querySelector('button[aria-label="Opportunity actions"]').click()`)
    await browser.wait(`Array.from(document.querySelectorAll('button')).some(el=>el.textContent.trim()==='Open editable table')`)
    await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()==='Open editable table').click()`)
    await browser.wait('document.querySelector(".phone-table-workspace")')
    assert.equal(await browser.evaluate('document.querySelectorAll(".phone-table-workspace .phone-workspace-header").length'),1)
    await browser.evaluate(`const table=document.querySelector('.phone-table-workspace');table.scrollTop=300;table.scrollLeft=300`)
    assert.ok(await browser.evaluate(`(()=>{const r=document.querySelector('.phone-table-workspace .modae-official-logo').getBoundingClientRect();return r.top>=0 && r.left>=0 && r.right<=innerWidth})()`),'Editable table header must stay visible when scrolling both directions')
    await browser.evaluate('document.querySelector(".phone-table-close").click()')
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1024,height:1000,deviceScaleFactor:1,mobile:false})
    await browser.send('Page.navigate',{url:origin+'/inbox'})
    await browser.wait('document.querySelector(".inbox-toolbar-new")')
    await browser.evaluate('document.querySelector(".inbox-toolbar-new").click()')
    await browser.wait('document.querySelector(".lead-paste-modal")')
    assert.equal(await browser.evaluate('document.querySelector(".lead-paste-modal .modal-header").textContent.includes("paste the email")'),true)
    assert.equal(await browser.evaluate('document.querySelector(".lead-paste-add-files")'),null)
    assert.ok(await browser.evaluate('document.querySelector(".lead-paste-modal").getBoundingClientRect().width < 650'))
    await browser.evaluate('document.querySelector(".lead-paste-modal .modal-close").click()')
    await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:boot.identifier})
  }
  assert.deepEqual(browser.errors,[])
  console.log('Phone enquiry and opportunity sizing, headings, attachments, validation, focus and short-viewport checks passed in both themes.')
} finally {await browser.close()}
