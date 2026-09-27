import fs from 'node:fs'

const out = new URL('../ModAE_Application_Page_Map_A3.pdf', import.meta.url)
const W = 1190.55
const H = 841.89

const color = {
  ink: [0.08, 0.12, 0.16],
  muted: [0.34, 0.40, 0.45],
  line: [0.78, 0.82, 0.85],
  navy: [0.05, 0.18, 0.31],
  blue: [0.12, 0.39, 0.61],
  teal: [0.05, 0.48, 0.48],
  green: [0.13, 0.48, 0.29],
  amber: [0.84, 0.49, 0.08],
  red: [0.70, 0.16, 0.12],
  paleBlue: [0.91, 0.96, 0.99],
  paleTeal: [0.90, 0.97, 0.96],
  paleGreen: [0.91, 0.97, 0.92],
  paleAmber: [1, 0.96, 0.88],
  paleRed: [0.99, 0.92, 0.91],
  white: [1, 1, 1],
}

const esc = value => String(value)
  .replaceAll('\\', '\\\\')
  .replaceAll('(', '\\(')
  .replaceAll(')', '\\)')
  .replaceAll('→', '->')
  .replaceAll('–', '-')
  .replaceAll('—', '-')
  .replaceAll('•', '-')

const rgb = c => `${c.map(v => v.toFixed(3)).join(' ')} rg`
const stroke = c => `${c.map(v => v.toFixed(3)).join(' ')} RG`
const ops = []
const y = top => H - top
const text = (x, top, value, size = 9, fill = color.ink, font = 'F1') => {
  ops.push(`${rgb(fill)} BT /${font} ${size} Tf ${x.toFixed(2)} ${y(top).toFixed(2)} Td (${esc(value)}) Tj ET`)
}
const rect = (x, top, width, height, fill = null, border = null, lineWidth = 0.8, radius = 0) => {
  const bottom = H - top - height
  if (radius) {
    const r = Math.min(radius, width / 2, height / 2)
    const k = 0.5522847498
    const path = `${x + r} ${bottom} m ${x + width - r} ${bottom} l ${x + width - r + k * r} ${bottom} ${x + width} ${bottom + r - k * r} ${x + width} ${bottom + r} c ${x + width} ${bottom + height - r} l ${x + width} ${bottom + height - r + k * r} ${x + width - r + k * r} ${bottom + height} ${x + width - r} ${bottom + height} c ${x + r} ${bottom + height} l ${x + r - k * r} ${bottom + height} ${x} ${bottom + height - r + k * r} ${x} ${bottom + height - r} c ${x} ${bottom + r} l ${x} ${bottom + r - k * r} ${x + r - k * r} ${bottom} ${x + r} ${bottom} c`
    ops.push(`${fill ? rgb(fill) : ''} ${border ? stroke(border) : ''} ${lineWidth} w ${path} ${fill && border ? 'B' : fill ? 'f' : 'S'}`)
    return
  }
  ops.push(`${fill ? rgb(fill) : ''} ${border ? stroke(border) : ''} ${lineWidth} w ${x} ${bottom} ${width} ${height} re ${fill && border ? 'B' : fill ? 'f' : 'S'}`)
}
const line = (x1, top1, x2, top2, c = color.line, width = 1) => {
  ops.push(`${stroke(c)} ${width} w ${x1} ${y(top1)} m ${x2} ${y(top2)} l S`)
}
const arrow = (x1, top1, x2, top2, c = color.blue) => {
  line(x1, top1, x2, top2, c, 1.15)
  const angle = Math.atan2(-(top2 - top1), x2 - x1)
  const s = 5
  const a1 = angle + Math.PI * 0.82
  const a2 = angle - Math.PI * 0.82
  const xA = x2 + Math.cos(a1) * s, topA = top2 - Math.sin(a1) * s
  const xB = x2 + Math.cos(a2) * s, topB = top2 - Math.sin(a2) * s
  ops.push(`${rgb(c)} ${x2} ${y(top2)} m ${xA} ${y(topA)} l ${xB} ${y(topB)} l h f`)
}
const node = (x, top, width, title, subtitle, fill, border) => {
  const h = subtitle ? 48 : 33
  rect(x, top, width, h, fill, border, 0.8, 7)
  const titleSize = Math.min(9.6, Math.max(6.2, (width - 18) / Math.max(1, title.length * 0.52)))
  text(x + 9, top + 19, title, titleSize, color.ink, 'F2')
  if (subtitle) text(x + 10, top + 34, subtitle, 7.2, color.muted)
  return { x, top, width, h, midX: x + width / 2, midY: top + h / 2, right: x + width, bottom: top + h }
}
const group = (x, top, width, height, title, tint, accent) => {
  rect(x, top, width, height, tint, accent, 0.9, 12)
  text(x + 13, top + 20, title.toUpperCase(), 8.2, accent, 'F2')
}

rect(0, 0, W, H, color.white)
rect(0, 0, W, 76, color.navy)
text(38, 34, 'ModAE application tree diagram', 25, color.white, 'F2')
text(38, 56, 'Internal routes, major tabs, and primary navigation connections', 9.5, [0.80, 0.89, 0.95])
text(947, 34, 'A3 LANDSCAPE', 8.5, color.white, 'F2')
text(947, 55, 'Reference map - September 2026', 8, [0.80, 0.89, 0.95])

group(28, 104, 146, 531, 'Navigation', color.paleBlue, color.blue)
group(194, 104, 238, 531, 'Daily workspace', color.paleTeal, color.teal)
group(452, 104, 265, 531, 'Opportunity workspace', color.paleGreen, color.green)
group(737, 104, 196, 531, 'Reporting and records', color.paleAmber, color.amber)
group(953, 104, 209, 531, 'Admin and tools', color.paleRed, color.red)

const treeRoot = node(585, 15, 260, 'ModAE internal site', 'tree diagram: pages, tabs, and routes', color.white, color.white)
arrow(treeRoot.x + 18, treeRoot.bottom, 101, 104, color.white)
arrow(treeRoot.x + 66, treeRoot.bottom, 313, 104, color.white)
arrow(treeRoot.midX, treeRoot.bottom, 584, 104, color.white)
arrow(treeRoot.right - 66, treeRoot.bottom, 835, 104, color.white)
arrow(treeRoot.right - 18, treeRoot.bottom, 1057, 104, color.white)

const desktop = node(44, 147, 114, 'Desktop sidebar', 'role-based navigation', color.white, color.blue)
const tablet = node(44, 222, 114, 'Tablet navigation', 'home + bottom bar', color.white, color.blue)
const portal = node(44, 297, 114, 'Customer Portal', 'customer-only endpoint', color.white, color.blue)
const redirect = node(44, 372, 114, 'Redirects', 'Dashboard -> My Dashboard\nPO -> Proposal Sent', color.white, color.blue)
const legend = node(44, 464, 114, 'Role legend', 'Sales | Approver\nAdmin | Technical', color.white, color.blue)

const dashboard = node(210, 147, 198, 'My Dashboard', 'daily priority queues + reporting', color.white, color.teal)
const inbox = node(210, 214, 198, 'Lead Inbox', 'lead review and qualification', color.white, color.teal)
const opportunities = node(210, 281, 198, 'Opportunities', 'company pipeline tracker', color.white, color.teal)
const myOpps = node(210, 348, 198, 'My Opportunities', 'owner-scoped work list', color.white, color.teal)
const approvals = node(210, 415, 198, 'Approvals', 'pending decisions and gates', color.white, color.teal)
const sent = node(210, 482, 198, 'Proposal Sent', 'follow-up + Purchase Orders', color.white, color.teal)
const newLead = node(210, 549, 60, 'New', 'manual', color.white, color.teal)
const register = node(279, 549, 60, 'Register', 'lead', color.white, color.teal)
const tender = node(348, 549, 60, 'Tender Intake', 'RFQ', color.white, color.teal)

const workbench = node(469, 147, 231, 'Opportunity Workspace', 'record-specific lifecycle workspace', color.white, color.green)
const coreTabs = node(469, 214, 231, 'Core tabs', 'Overview | Requirement | Customer / KYC', color.white, color.green)
const buildTabs = node(469, 281, 231, 'Build tabs', 'Registration | Clarifications | Sourcing', color.white, color.green)
const commercialTabs = node(469, 348, 231, 'Commercial tabs', 'Proposal | Approval | Submitted', color.white, color.green)
const followUp = node(469, 415, 231, 'Follow-up tab', 'revisions, customer action, handover', color.white, color.green)
const proposal = node(469, 497, 108, 'Proposal', 'document', color.white, color.green)
const folder = node(592, 497, 108, 'Folder', 'records', color.white, color.green)
const workflow = node(469, 564, 231, 'Service / Spares workflow', 'route-specific lifecycle steps', color.white, color.green)

const analytics = node(753, 147, 164, 'Analytics', 'detailed reporting', color.white, color.amber)
const customers = node(753, 214, 164, 'Customers', 'customer master', color.white, color.amber)
const prices = node(753, 281, 164, 'Price Lists', 'approved catalogues', color.white, color.amber)
const folders = node(753, 348, 164, 'Folders', 'opportunity records', color.white, color.amber)
const forecast = node(753, 415, 164, 'Forecast report', 'customer and month pivot', color.white, color.amber)
const audit = node(753, 482, 164, 'Audit trail', 'record history', color.white, color.amber)

const admin = node(969, 147, 177, 'Admin', 'configuration home', color.white, color.red)
const users = node(969, 214, 177, 'Users and roles', 'accounts and access', color.white, color.red)
const workflowAdmin = node(969, 281, 177, 'Workflow Settings', 'lifecycle configuration', color.white, color.red)
const aiMap = node(969, 348, 177, 'AI Map', 'automation directory', color.white, color.red)
const voice = node(969, 415, 177, 'Voice Update', 'create/update by voice', color.white, color.red)
const adminAudit = node(969, 482, 177, 'Audit trail', 'admin access', color.white, color.red)
const launcher = node(969, 549, 177, 'Launcher', 'tablet utility route', color.white, color.red)

arrow(desktop.right, desktop.midY, dashboard.x, dashboard.midY, color.blue)
arrow(desktop.right, desktop.midY + 8, opportunities.x, opportunities.midY, color.blue)
arrow(tablet.right, tablet.midY, dashboard.x, dashboard.midY + 8, color.blue)
arrow(tablet.right, tablet.midY + 7, inbox.x, inbox.midY, color.blue)
arrow(tablet.right, tablet.midY + 14, approvals.x, approvals.midY, color.blue)

arrow(dashboard.right, dashboard.midY, analytics.x, analytics.midY, color.teal)
arrow(inbox.right, inbox.midY, workbench.x, workbench.midY, color.teal)
arrow(newLead.right, newLead.midY, workbench.x, workbench.midY + 8, color.teal)
arrow(register.right, register.midY, workbench.x, workbench.midY + 12, color.teal)
arrow(tender.right, tender.midY, workbench.x, workbench.midY + 16, color.teal)
arrow(opportunities.right, opportunities.midY, workbench.x, workbench.midY + 24, color.teal)
arrow(myOpps.right, myOpps.midY, workbench.x, workbench.midY + 32, color.teal)
arrow(approvals.right, approvals.midY, workbench.x, commercialTabs.midY, color.teal)
arrow(sent.right, sent.midY, followUp.x, followUp.midY, color.teal)

arrow(workbench.midX, workbench.bottom, coreTabs.midX, coreTabs.top, color.green)
arrow(coreTabs.midX, coreTabs.bottom, buildTabs.midX, buildTabs.top, color.green)
arrow(buildTabs.midX, buildTabs.bottom, commercialTabs.midX, commercialTabs.top, color.green)
arrow(commercialTabs.midX, commercialTabs.bottom, followUp.midX, followUp.top, color.green)
arrow(commercialTabs.midX - 30, commercialTabs.bottom, proposal.midX, proposal.top, color.green)
arrow(commercialTabs.midX + 30, commercialTabs.bottom, folder.midX, folder.top, color.green)
arrow(followUp.midX, followUp.bottom, workflow.midX, workflow.top, color.green)
arrow(proposal.right, proposal.midY, folders.x, folders.midY, color.green)
arrow(folder.right, folder.midY, folders.x, folders.midY + 8, color.green)

arrow(analytics.right, analytics.midY, forecast.x, forecast.midY, color.amber)
arrow(customers.left, customers.midY, workbench.right, coreTabs.midY, color.amber)
arrow(prices.left, prices.midY, workbench.right, buildTabs.midY, color.amber)
arrow(folders.left, folders.midY, workbench.right, folder.midY, color.amber)
arrow(audit.right, audit.midY, adminAudit.x, adminAudit.midY, color.amber)

arrow(admin.midX, admin.bottom, users.midX, users.top, color.red)
arrow(admin.midX, admin.bottom, workflowAdmin.midX, workflowAdmin.top, color.red)
arrow(admin.midX, admin.bottom, adminAudit.midX, adminAudit.top, color.red)
arrow(aiMap.left, aiMap.midY, workbench.right, buildTabs.midY + 8, color.red)
arrow(voice.left, voice.midY, newLead.right, newLead.midY, color.red)

rect(28, 666, 1134, 109, [0.97, 0.98, 0.99], color.line, 0.8, 10)
text(44, 690, 'How to read this map', 10, color.navy, 'F2')
text(44, 710, 'Solid arrows show the primary route a user takes. Boxes with pale colour are page groups; white boxes are individual pages or tab groups.', 8.2, color.muted)
text(44, 728, 'Role access: Sales use daily workspace and their own reporting; Approvers and Admins additionally see company controls; Technical users focus on review work.', 8.2, color.muted)
text(44, 746, 'Customer Portal is separate from internal navigation. The PDF records main page connections, not every modal, field action, or contextual shortcut.', 8.2, color.muted)
text(44, 790, 'ModAE internal information architecture reference', 7.5, color.muted)
text(987, 790, 'Generated from desktop and tablet route definitions', 7.5, color.muted)

const objects = [null, null, null, null]
const add = body => { objects.push(`<< /Length ${Buffer.byteLength(body, 'binary')} >>\nstream\n${body}\nendstream`); return objects.length }
const catalog = 1
const pages = 2
const regular = 3
const bold = 4
const content = add(ops.join('\n'))
const page = objects.length + 1
objects.push(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`)
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`
objects[pages - 1] = `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`
objects[regular - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
objects[bold - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'

let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
const offsets = [0]
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(pdf, 'binary'))
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
}
const xref = Buffer.byteLength(pdf, 'binary')
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info << /Title (ModAE Application Page Map - A3 Landscape) /Author (ModAE) >> >>\nstartxref\n${xref}\n%%EOF\n`

fs.writeFileSync(out, pdf, 'binary')
console.log(`Wrote ${out.pathname}`)
