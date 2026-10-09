// Run against local Vite and isolated Chrome CDP on 9331. Uses browser-only
// demo authentication; never runs against deployed workspaces.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'

const origin = process.env.PHONE_CHECK_ORIGIN || 'http://127.0.0.1:5182'
const debug = process.env.PHONE_CHECK_DEBUG || 'http://localhost:9331'
if (![origin, debug].every(url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname))) throw new Error('Local test endpoints required')
const source = await fs.readFile('scripts/check-workspace-theme.mjs', 'utf8')
const browser = await new Function('debug', source.slice(source.indexOf('async function connect()'), source.indexOf('// Composite foreground')) + '\nreturn connect')(debug)()
const output = '.local/generated/phone-mode-check'
await fs.mkdir(output, { recursive: true })

function tenderPdf() {
  const lines = ['Tender No: QA/2026/42 dated 09-10-2026', 'Example Power Company Limited', 'Subject: Supply of vibration sensors and cables', 'Material Schedule', '1 Sensor cable P/N QA-CABLE EA 2', '2 Vibration sensor P/N QA-SENSOR EA 3', 'Special Terms & Conditions', '1. Payment: 100 percent payment within 30 days of delivery.', '2. Delivery: Material required within four weeks after purchase order.', 'Chief Procurement Engineer']
  const stream = `BT /F1 12 Tf ${lines.map((line, index) => `1 0 0 1 40 ${780 - index * 28} Tm (${line}) Tj`).join('\n')} ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf).toString('base64')
}

async function navigate(route) {
  await browser.send('Page.navigate', { url: origin + route })
  await browser.wait('document.querySelector(".shell")')
  await browser.wait('document.querySelector(".phone-workspace-header, .sidebar-mode-switch, .tablet-bar")')
}
async function geometry(route, width) {
  const result = await browser.evaluate(`(() => {
    const shell = document.querySelector('.phone-workspace').getBoundingClientRect();
    const bottom = document.querySelector('.tab-bottom').getBoundingClientRect();
    const visible = selector => [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const outside = visible('.phone-inbox-new, .tracker-toolbar-actions .tracker-create-logo, .phone-workspace-header .mobile-dashboard-header > *').filter(el => {const r=el.getBoundingClientRect();return r.left < shell.left-1 || r.right > shell.right+1}).map(el=>el.className);
    return {width:shell.width,left:shell.left,right:shell.right,bottomWidth:bottom.width,bottomLeft:bottom.left,outside,overflow:document.documentElement.scrollWidth>innerWidth,headers:document.querySelectorAll('.shell > .phone-workspace-header').length};
  })()`)
  assert.ok(Math.abs(result.width - Math.min(width, 440)) < 1, `${route}: phone workspace width ${JSON.stringify(result)}`)
  assert.ok(Math.abs(result.bottomWidth - result.width) < 1 && Math.abs(result.bottomLeft - result.left) < 1, `${route}: bottom navigation bounds ${JSON.stringify(result)}`)
  assert.equal(result.headers, 1, `${route}: shared phone header`)
  assert.equal(result.overflow, false, `${route}: page overflow`)
  assert.deepEqual(result.outside, [], `${route}: controls outside workspace`)
}

try {
  await browser.send('Page.navigate', { url: origin })
  await browser.wait('document.querySelector(".login-bg, .shell")')
  const fixture = await browser.evaluate(`(async () => {
    const {seedState,KEY,VIEW_MODE_PREFERENCE_REV}=await import('/src/appState.js');
    const {DEPLOYMENT_ID}=await import('/src/deployment.js');
    const state=seedState(); state.auth={source:'local-demo',user:{id:'U-004',name:'Phone QA',email:'rs@modae.demo',role:'RS',roles:['RS','ADMIN','LJS']}};
    state.role='RS';state.roles=['RS','ADMIN','LJS'];state.demoData=false;state.viewMode='full';state.viewModePinned=true;state.viewModePreferenceRev=VIEW_MODE_PREFERENCE_REV;
    const target=state.opportunities.find(opp=>opp.status==='Open');state.proposals[target.id]={bom:[{pn:'QA-EXISTING',qty:1}],terms:[]};
    state.config.aiModel.provider='Built-in fallback';return {state:JSON.stringify(state),key:KEY,deployment:DEPLOYMENT_ID};
  })()`)
  // Install the fixture after the old document's pagehide persistence, so a
  // previously open test app cannot overwrite it while navigation unloads.
  const bootstrap = await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `sessionStorage.clear();localStorage.setItem(${JSON.stringify(fixture.key)},${JSON.stringify(fixture.state)});localStorage.setItem('wintrack-modae-deployment-id',${JSON.stringify(fixture.deployment)});localStorage.setItem('modae_theme','light')` })
  await navigate('/my-dashboard')
  await browser.wait('document.querySelector(".sidebar-mode-switch")')
  await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier })
  await browser.evaluate('document.querySelector(".sidebar-mode-switch").click()')
  await browser.wait('document.querySelector(".phone-workspace-header")')
  await geometry('/my-dashboard', 1440)
  assert.equal(await browser.evaluate('location.pathname'), '/my-dashboard', 'Mode switch retains route')
  await browser.wait(`JSON.parse(localStorage.getItem(${JSON.stringify(fixture.key)})).viewMode === 'tablet'`)
  await browser.send('Page.reload')
  await browser.wait('document.querySelector(".phone-workspace-header")')
  await geometry('reload', 1440)

  const routes = ['/more','/my','/tender','/proposal-sent','/order','/folders','/customers','/pricelists','/analytics','/voice','/aimap','/admin','/admin/workflow','/audit','/users','/home','/new','/inbox','/opportunities','/approvals']
  for (const theme of ['light', 'dark']) {
    await browser.evaluate(`localStorage.setItem('modae_theme',${JSON.stringify(theme)})`)
    for (const width of [1440, 768, 440, 390]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width <= 440 })
      for (const route of routes) {
        await navigate(route)
        assert.equal(await browser.evaluate('location.pathname'), route, `${route}: destination must open rather than redirect`)
        await geometry(route, width)
        if (route === '/more') {
          assert.equal(await browser.evaluate('!!document.querySelector(\'.mobile-destinations a[href="/launcher"]\')'), false)
          assert.equal(await browser.evaluate('document.querySelectorAll(".mobile-settings .workspace-theme-toggle").length'), 0)
          assert.match(await browser.evaluate('document.querySelector(".mobile-sync").textContent'), /Local only.*This device/)
          assert.equal(await browser.evaluate('!!document.querySelector(".mobile-refresh-button")'), false)
          if (width === 1440 || width === 390) {
            const screenshot = await browser.send('Page.captureScreenshot')
            await fs.writeFile(`${output}/more-${theme}-${width}.png`, Buffer.from(screenshot.data, 'base64'))
          }
        }
        if (route === '/my') {
          await browser.wait('document.querySelector(".status-update-page .phone-record")')
          assert.equal(await browser.evaluate('!!document.querySelector(".status-update-page table")'), false)
          await browser.evaluate('document.querySelector(".status-update-page .phone-record").click()')
          await browser.wait('document.querySelector(".drawer.open")')
          await browser.wait('Math.abs(document.querySelector(".drawer.open").getBoundingClientRect().left - document.querySelector(".phone-workspace").getBoundingClientRect().left) < 1')
          const bounds = await browser.evaluate('JSON.stringify(document.querySelector(".drawer.open").getBoundingClientRect().toJSON())')
          assert.ok(JSON.parse(bounds).width <= Math.min(width, 440) + 1, `Drawer too wide: ${bounds}`)
          await browser.evaluate('document.querySelector(".drawer-x").click()')
          await browser.evaluate('[...document.querySelectorAll(".status-update-page button")].find(el=>el.textContent==="Edit in table").click()')
          await browser.wait('document.querySelector(".status-update-page table")')
          await browser.evaluate('[...document.querySelectorAll(".status-update-page button")].find(el=>el.textContent==="Show list").click()')
          await browser.wait('document.querySelector(".status-update-page .phone-record")')
        }
      }
      console.log(`${theme}: ${width}px destinations passed`)
    }
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await navigate('/inbox')
  await browser.wait('document.querySelector(".phone-inbox-new")')
  await browser.evaluate('document.querySelector(".phone-inbox-new").click()')
  await browser.wait('document.querySelector(".lead-paste-modal")')
  await browser.wait('document.querySelector(".lead-paste-modal .phone-workspace-header")')
  assert.equal(await browser.evaluate('Math.round(document.querySelector(".lead-paste-modal").getBoundingClientRect().width)'), 440, 'Portal follows workspace width')
  await browser.evaluate('document.querySelector(".lead-paste-modal .modal-close").click()')
  await navigate('/inbox/LD-207')
  await browser.wait('document.querySelector(".phone-lead-action")')
  assert.equal(await browser.evaluate('Math.round(document.querySelector(".phone-lead-action").getBoundingClientRect().width)'), 440, 'Lead detail footer stays inside Phone mode')
  assert.equal(await browser.evaluate('Math.round(document.querySelector(".phone-lead-action").getBoundingClientRect().left)'), 500, 'Lead detail footer is centered with workspace')
  await navigate('/opportunities')
  await browser.evaluate('document.querySelector(".tracker-more-trigger").click()')
  await browser.wait('[...document.querySelectorAll("button")].some(el=>el.textContent==="Open editable table")')
  await browser.evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent==="Open editable table").click()')
  await browser.wait('document.querySelector(".phone-table-workspace")')
  assert.equal(await browser.evaluate('Math.round(document.querySelector(".phone-table-workspace").getBoundingClientRect().width)'), 440, 'Expanded tracker table stays inside Phone mode')
  assert.equal(await browser.evaluate('Math.round(document.querySelector(".phone-table-workspace").getBoundingClientRect().left)'), 500, 'Expanded tracker table is centered with workspace')
  await browser.evaluate('document.querySelector(".phone-table-close").click()')
  await navigate('/more')
  await browser.evaluate('[...document.querySelectorAll(".mobile-settings button")].find(el=>el.textContent.includes("Full site")).click()')
  await browser.wait('document.querySelector(".sidebar-mode-switch")')
  assert.equal(await browser.evaluate('!!document.documentElement.dataset.phoneMode'), false, 'Full site clears phone CSS')

  await browser.evaluate('document.querySelector(".sidebar-mode-switch").click()')
  await browser.wait('document.querySelector(".phone-workspace-header")')
  await navigate('/tender')
  await browser.evaluate('document.querySelector(".upload-section-toggle").click()')
  await browser.evaluate(`(() => { const input=document.querySelector('.tender-drop input');const transfer=new DataTransfer();transfer.items.add(new File(['not a PDF'],'invalid.txt',{type:'text/plain'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await browser.wait('document.querySelector(".restricted")?.textContent.includes("not a PDF")')
  await browser.evaluate(`(() => { const input=document.querySelector('.tender-drop input');const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(${JSON.stringify(tenderPdf())}),c=>c.charCodeAt(0))],'phone-review.pdf',{type:'application/pdf'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await browser.wait('document.querySelectorAll(".phone-tender-line").length === 2')
  await browser.wait('document.querySelector(".phone-tender-term")')
  assert.equal(await browser.evaluate('!!document.querySelector(".tender-intake-page table")'), false, 'Tender uses phone editors')
  await browser.evaluate(`(() => {
    const set=(el,value)=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
    set(document.querySelector('.phone-tender-line textarea'),'Edited sensor cable');set(document.querySelector('.phone-tender-line input[type=number]'),'7');set(document.querySelector('.phone-tender-term input'),'Reviewed commercial response');
  })()`)
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.equal(await browser.evaluate('document.querySelector(".phone-tender-line textarea").value'), 'Edited sensor cable', 'Description draft survives resize')
  assert.equal(await browser.evaluate('document.querySelector(".phone-tender-line input[type=number]").value'), '7', 'Quantity draft survives resize')
  assert.equal(await browser.evaluate('document.querySelector(".phone-tender-term input").value'), 'Reviewed commercial response', 'Commercial draft survives resize')
  await browser.evaluate('[...document.querySelectorAll(".phone-tender-line input[type=checkbox]")].forEach(el=>el.click())')
  assert.equal(await browser.evaluate('[...document.querySelectorAll(".tender-intake-page button")].find(el=>el.textContent.includes("Confirm & Generate")).disabled'), true, 'No included lines blocks confirmation')
  const screenshot = await browser.send('Page.captureScreenshot')
  await fs.writeFile(`${output}/tender-review-390.png`, Buffer.from(screenshot.data, 'base64'))

  // Automatic layouts still follow actual device width when unpinned.
  const automatic = JSON.parse(fixture.state)
  automatic.viewMode = 'tablet'; automatic.viewModePinned = false
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 900, deviceScaleFactor: 1, mobile: false })
  const autoBootstrap = await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem(${JSON.stringify(fixture.key)},${JSON.stringify(JSON.stringify(automatic))});window.phoneAutoBoot=true;` })
  await navigate('/more')
  await browser.wait('window.phoneAutoBoot && document.querySelector(".phone-workspace")?.getBoundingClientRect().width > 600')
  await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: autoBootstrap.identifier })
  assert.equal(await browser.evaluate('!!document.querySelector(".phone-workspace-header")'), false, 'Automatic tablet keeps its wider layout')
  assert.equal(await browser.evaluate('!!document.documentElement.dataset.phoneMode'), false, 'Automatic tablet does not force phone CSS')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await browser.wait('document.querySelector(".phone-workspace-header")')
  await geometry('automatic phone', 390)
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await browser.wait('document.querySelector(".sidebar-mode-switch")')
  assert.deepEqual(browser.errors, [], 'No browser runtime exceptions')
  console.log('Phone mode: 160 destination/theme/width checks, mode persistence, drawers, table option, portals, tender PDF editing and automatic layouts passed.')
} finally { await browser.close() }
