// Rendered appearance regression check against Vite and an isolated Chrome
// debugging session. Run: node scripts/check-workspace-theme.mjs
// Chrome must use a temporary user-data-dir and --remote-debugging-port=9331.
import fs from 'node:fs/promises'
import path from 'node:path'

const origin = process.env.THEME_CHECK_ORIGIN || 'http://127.0.0.1:5173'
const debug = process.env.THEME_CHECK_DEBUG || 'http://localhost:9331'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Use a local development origin only')
const output = path.resolve('.local/generated/dark-mode-check')
await fs.mkdir(output, { recursive: true })

async function connect() {
  const target = await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json())
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let seq = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(message.error) : request.resolve(message.result) }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 60000)
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const wait = async expression => {
    const until = Date.now() + 60000
    while (Date.now() < until) {
      if (await evaluate(`Boolean(${expression})`).catch(() => false)) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Page never became ready: ${expression}\n${await evaluate('JSON.stringify({ url: location.href, theme: document.documentElement.dataset.theme, shell: document.querySelector(".shell")?.className })')}\n${await evaluate('document.body.innerText.slice(0, 1600)')}\n${JSON.stringify(errors)}`)
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  await send('Network.setBypassServiceWorker', { bypass: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  return { send, evaluate, wait, errors, close: async () => { ws.close(); await fetch(`${debug}/json/close/${target.id}`) } }
}

// Composite foreground and ancestor backgrounds to check what the user sees,
// including transparent cells. Gradients/complex images are reviewed in PNGs.
function inspect(selectors, dark) {
  const rgba = value => { const a = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0]; return [...a.slice(0, 3).map(v => value.startsWith('color(srgb ') ? v * 255 : v), a[3] ?? 1] }
  const over = (top, bottom) => [...top.slice(0, 3).map((v, i) => v * top[3] + bottom[i] * (1 - top[3])), 1]
  const background = el => {
    const layers = []
    for (let node = el; node; node = node.parentElement) layers.push(rgba(getComputedStyle(node).backgroundColor))
    return layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255, 1])
  }
  const lum = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
  return selectors.flatMap(selector => {
    const audit = selector === ':audit'
    const nodes = [...document.querySelectorAll(audit ? '.shell *, [data-modae-portal-root] *' : selector)].filter(el => {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return false
      if (!audit) return true
      const rect = el.getBoundingClientRect()
      return rect.width > 2 && rect.height > 2 && !el.closest('[aria-hidden="true"], .propdoc, .template-workbook-page, .att-view-document, .att-view-table-wrap') && !el.matches(':disabled') && [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())
    })
    if (!nodes.length) return [{ selector, failure: 'missing visible fixture' }]
    return nodes.map(el => {
      const style = getComputedStyle(el), bg = background(el), fg = over(rgba(style.color), bg)
      const a = lum(fg), b = lum(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
      return { selector: audit ? el.tagName.toLowerCase() + '.' + String(el.className).trim().replaceAll(' ', '.') : selector, text: el.textContent.trim().slice(0, 65), foreground: style.color, background: bg.slice(0, 3), contrast: +ratio.toFixed(2),
        failure: ratio < 4.5 ? 'text contrast below 4.5' : dark && bg.slice(0, 3).every(v => v > 190) ? 'unexpected light surface' : null }
    })
  })
}

const routes = {
  '/my-dashboard': ['.reference-kpi h2', '.reference-kpi strong', '.reference-kpi p', '.reference-section h2', '.reference-bar > span', '.reference-bar strong', '.reference-gap strong', '.reference-table th', '.reference-performance-actions button'],
  '/inbox': ['.mail-head-filter', '.mail-new-enquiry', '.mail-subject-title', '.mailbox-preview-field b', '.mailbox-preview-field small', '.mailbox-preview section > p'],
  '/opportunities': ['.opportunity-stage-strip button', '.opportunity-stage-strip button b', 'table.sheet thead th', 'table.sheet thead th button', '.sheet-tabs .tab'],
  '/approvals': ['.approval-summary-card b', '.approval-notice-info', '.approval-summary-card span'],
  '/proposal-sent': ['.proposal-sent-priority-row', '.proposal-sent-priority-main b', '.proposal-sent-view-toggle button', '.proposal-sent-stat-value'],
}

const browser = await connect()
const report = { checks: [], audit: [], runtimeErrors: browser.errors }
const capture = async (name, selectors, dark = true) => {
  const checks = await browser.evaluate(`(${inspect.toString()})(${JSON.stringify(selectors)}, ${dark})`)
  report.checks.push({ route: name, theme: dark ? 'dark' : 'light', checks })
  const png = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(png.data, 'base64'))
  console.log(name, JSON.stringify(checks.filter(check => check.failure)))
}
try {
  await browser.send('Page.navigate', { url: origin })
  await browser.wait('document.querySelector(".login-bg, .shell")')
  const fixture = await browser.evaluate(`(async () => {
    const { seedState, KEY } = await import('/src/appState.js');
    const { DEPLOYMENT_ID } = await import('/src/deployment.js');
    const state = seedState();
    state.auth = { source: 'local-demo', user: { id: 'U-004', name: 'Theme QA', email: 'rs@modae.demo', role: 'RS', roles: ['RS'] } };
    state.demoData = false; state.role = 'RS'; state.viewMode = 'full'; state.viewModePinned = true;
    return { state: JSON.stringify(state), key: KEY, deployment: DEPLOYMENT_ID };
  })()`)
  const bootstrap = await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem(${JSON.stringify(fixture.key)}, ${JSON.stringify(fixture.state)});
    localStorage.setItem('wintrack-modae-deployment-id', ${JSON.stringify(fixture.deployment)});
    localStorage.setItem('modae_theme', 'dark');
  ` })
  await browser.send('Page.navigate', { url: origin + '/my-dashboard' })
  await browser.wait(`document.querySelector('.shell[data-theme="dark"]') && !document.querySelector('.auth-loading')`)
  await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier })
  for (const theme of ['dark', 'light']) {
    await browser.evaluate(`localStorage.setItem('modae_theme', '${theme}')`)
    for (const [route, selectors] of Object.entries(routes)) {
      await browser.send('Page.navigate', { url: origin + route })
      await browser.wait(`document.querySelector('.shell[data-theme="${theme}"]') && !document.querySelector('.auth-loading')`)
      await browser.wait(`document.querySelector(${JSON.stringify(selectors[0])})`)
      // The inbox's Global View is a UI-only preference in this isolated demo.
      if (route === '/inbox') {
        await browser.evaluate(`document.querySelector('.workspace-view-switch[aria-checked="false"]')?.click()`)
        await browser.wait(`document.querySelector('.mail-row')`)
      }
      const checks = await browser.evaluate(`(${inspect.toString()})(${JSON.stringify([...selectors, '.workspace-view-switch__label'])}, ${theme === 'dark'})`)
      report.checks.push({ route, theme, checks })
      if (theme === 'dark') report.audit.push({ route, checks: await browser.evaluate(`(${inspect.toString()})([':audit'], true)`) })
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await fs.writeFile(path.join(output, `${route.slice(1)}-${theme}.png`), Buffer.from(screenshot.data, 'base64'))
      console.log(theme, route, JSON.stringify(checks.filter(check => check.failure)))
    }
  }
  // Exercise real controls rather than setting React theme state directly.
  await browser.evaluate(`document.querySelector('.workspace-theme-toggle').click()`)
  await browser.wait(`document.documentElement.dataset.theme === 'dark'`)
  const opportunityId = JSON.parse(fixture.state).opportunities[0]?.id
  for (const route of ['/customers', '/folders', '/pricelists', '/admin', '/users', '/audit', ...(opportunityId ? ['/opp/' + opportunityId] : [])]) {
    await browser.send('Page.navigate', { url: origin + route })
    await browser.wait(`document.querySelector('.shell .page') && !document.querySelector('.auth-loading')`)
    const checks = await browser.evaluate(`(${inspect.toString()})([':audit'], true)`)
    report.audit.push({ route, checks })
    console.log('audit', route, JSON.stringify(checks.filter(check => check.failure)))
    const png = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await fs.writeFile(path.join(output, `audit-${route.slice(1).replaceAll('/', '-')}.png`), Buffer.from(png.data, 'base64'))
  }
  await browser.send('Page.navigate', { url: origin + '/inbox' })
  await browser.wait(`document.querySelector('.mail-head-filter')`)
  await browser.evaluate(`document.querySelector('.mail-head-filter').click()`)
  await browser.wait(`document.querySelector('.mail-header-filter-menu')`)
  await capture('inbox-filter-dark', ['.mail-header-filter-title', '.mail-header-filter-option'])
  await browser.evaluate(`document.querySelector('.filter-overlay').click(); document.querySelector('.mail-new-enquiry').click()`)
  await browser.wait(`document.querySelector('[role="dialog"]')`)
  await capture('inbox-dialog-dark', ['.modal', '.modal .section-title', '.modal button'])
  await browser.evaluate(`document.querySelector('.modal-close').click()`)
  await browser.evaluate(`(() => { const input = document.querySelector('.mail-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'no-theme-fixture-matches'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await browser.wait(`document.querySelector('.mail-empty')`)
  await capture('inbox-empty-dark', ['.mail-empty', '.workspace-view-switch__label'])
  const other = await connect()
  try {
    await other.send('Page.navigate', { url: origin + '/my-dashboard' })
    await other.wait(`document.querySelector('.shell[data-theme="dark"]')`)
    await browser.wait(`document.querySelector('.workspace-theme-toggle')`)
    await browser.evaluate(`document.querySelector('.workspace-theme-toggle').click()`)
    await other.wait(`document.querySelector('.shell[data-theme="light"]')`)
    await browser.evaluate(`document.querySelector('.workspace-theme-toggle').click()`)
    await other.wait(`document.querySelector('.shell[data-theme="dark"]')`)
    console.log('cross-tab control synchronization passed')
  } finally { await other.close() }
  await browser.evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Switch to tablet view')).click()`)
  await browser.wait(`document.querySelector('.tablet-mode[data-theme="dark"]')`)
  for (const width of [1024, 390]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
    await browser.send('Page.navigate', { url: origin + '/my-dashboard' })
    await browser.wait(`document.querySelector('.reference-kpi')`)
    await capture(`dashboard-${width}-dark`, ['.reference-kpi h2', '.reference-kpi strong', '.reference-section h2', '.workspace-view-switch__label'])
    await browser.send('Page.navigate', { url: origin + '/more' })
    await browser.wait(`document.querySelector('.workspace-theme-toggle')`)
    await browser.evaluate(`document.querySelector('.workspace-theme-toggle').click()`)
    await browser.wait(`document.querySelector('.tablet-mode[data-theme="light"]')`)
    await browser.send('Page.navigate', { url: origin + '/my-dashboard' })
    await browser.wait(`document.querySelector('.reference-kpi')`)
    await capture(`dashboard-${width}-light`, ['.reference-kpi h2', '.reference-kpi strong', '.reference-section h2', '.workspace-view-switch__label'], false)
    await browser.send('Page.navigate', { url: origin + '/more' })
    await browser.wait(`document.querySelector('.workspace-theme-toggle')`)
    await browser.evaluate(`document.querySelector('.workspace-theme-toggle').click()`)
    await browser.wait(`document.querySelector('.tablet-mode[data-theme="dark"]')`)
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: origin + '/showcase' })
  await browser.wait(`document.documentElement.dataset.theme === 'light' && !document.querySelector('.auth-loading')`)
  console.log('public showcase stays light')
  const signedOut = JSON.parse(fixture.state)
  signedOut.auth = { source: 'local-demo', user: null }
  const logoutFixture = await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem(${JSON.stringify(fixture.key)}, ${JSON.stringify(JSON.stringify(signedOut))}); localStorage.setItem('modae_theme', 'dark');` })
  await browser.send('Page.navigate', { url: origin + '/my-dashboard' })
  await browser.wait(`document.querySelector('.login-bg') && document.documentElement.dataset.theme === 'light'`)
  await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: logoutFixture.identifier })
  console.log('sign-in stays light with a saved dark preference')
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
if ([...report.checks, ...report.audit].some(group => group.checks.some(check => check.failure)) || report.runtimeErrors.length) process.exitCode = 1
