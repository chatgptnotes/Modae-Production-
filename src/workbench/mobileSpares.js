import { isConfirmableSparesLine, isMissingSparesDescription, MAX_MARKUP_PCT, normalizePriceFields, sparesLineFinancials } from '../pricing.js'
import { convertCurrency } from '../currency.js'
import { unitCostINR } from '../utils.js'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const labelFor = line => line?.pn || line?.custRef || line?.id || 'Missing part'
const numeric = value => String(value ?? '').trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : NaN

export function sparesMobileStatus(line) {
  if (line.removedFromSourcing) return { key: 'removed', label: 'Removed', action: 'Restore line' }
  if (!(Number(line.qty) > 0)) return { key: 'attention', label: 'Quantity needed', action: 'Enter quantity' }
  if (isMissingSparesDescription(line)) return { key: 'attention', label: 'Description needed', action: 'Enter description' }
  if (line.priceState === 'Expired') return { key: 'attention', label: 'Source expired', action: 'Review source' }
  if (!(Number(line.listUnitPrice ?? line.listPrice) > 0) || line.priceState === 'Needs pricing') return { key: 'attention', label: 'Price needed', action: 'Enter price' }
  if (!isConfirmableSparesLine(line)) return { key: 'attention', label: 'Needs review', action: 'Review part' }
  return line.confirmed ? { key: 'confirmed', label: 'Confirmed' } : { key: 'ready', label: 'Ready to confirm', action: 'Confirm match' }
}

export function sparesBatchTotals(lines, costing) {
  const totals = { revenue: 0, cogs: 0, quantity: 0, parts: 0 }
  for (const line of lines) {
    if (line.removedFromSourcing) continue
    const row = sparesLineFinancials(line, costing)
    totals.parts += 1
    totals.quantity += row.qty
    if (row.qty <= 0 || row.listUnitPrice <= 0) continue
    totals.revenue += row.lineTotalINR
    totals.cogs += row.cogsINR
  }
  return { ...totals, profit: totals.revenue - totals.cogs, margin: totals.revenue > 0 ? (totals.revenue - totals.cogs) / totals.revenue * 100 : 0 }
}

export function buildSparesBatchReview({ lines, oppId, mode, drafts = {}, baselines = {}, selectedIds = [], markupPct, discountPct, costing = {}, displayCurrency = 'INR', actor = '', now = new Date().toISOString() }) {
  const scoped = lines.filter(line => line.oppId === oppId)
  const byId = new Map(scoped.map(line => [line.id, line]))
  const ids = [...new Set(['adjust', 'confirm'].includes(mode) ? selectedIds : Object.keys(drafts))]
  const changes = [], excluded = [], invalid = []
  const reject = (id, reason, errors = invalid) => errors.push({ id, label: labelFor(byId.get(id) || { id }), reason })
  for (const id of ids) {
    const line = byId.get(id)
    if (!line || line.removedFromSourcing) { reject(id, line ? 'Removed from sourcing' : 'Part is no longer in this opportunity', excluded); continue }
    if (baselines[id] && !same(baselines[id], line)) { reject(id, 'This part changed while you were editing. Discard its draft and review the latest values.'); continue }
    const status = sparesMobileStatus(line)
    let patch = {}
    const value = numeric(drafts[id])
    if (mode === 'qty') {
      if (!(value > 0) || !Number.isInteger(value)) { reject(id, 'Enter a positive whole quantity. Use Remove line to exclude a part.'); continue }
      patch.qty = value
    } else if (mode === 'supplier') {
      if (!(value > 0)) { reject(id, 'Enter a positive supplier unit cost.'); continue }
      const inr = convertCurrency(value, displayCurrency, 'INR', costing.currencyRates)
      patch = { listUnitPrice: inr, listPrice: inr, currency: 'INR', baseCost: unitCostINR(inr, costing, 'INR', false), priceSource: 'manual', priceSourceName: 'Manual pricing', priceList: 'Manual pricing', priceState: 'Current', addedBy: actor, addedByName: actor, addedAt: now, priceSourceDate: now.slice(0, 10) }
      patch.confirmed = isConfirmableSparesLine({ ...line, ...patch })
    } else if (mode === 'customer') {
      if (!['ready', 'confirmed'].includes(status.key)) { reject(id, status.label); continue }
      const inr = convertCurrency(value, displayCurrency, 'INR', costing.currencyRates)
      const landed = sparesLineFinancials(line, costing).landedUnitCostINR
      const markup = (inr / landed - 1) * 100
      if (!(value > 0) || !(landed > 0) || !Number.isFinite(markup) || markup < -0.000001 || markup > MAX_MARKUP_PCT + 0.000001) { reject(id, `Customer price must be between landed cost and ${1 + MAX_MARKUP_PCT / 100}× landed cost. Review supplier cost or discount to change that basis.`); continue }
      patch.markupPct = Math.max(0, Math.min(MAX_MARKUP_PCT, markup))
    } else if (mode === 'adjust') {
      if (!['ready', 'confirmed'].includes(status.key)) { reject(id, status.label, excluded); continue }
      if (String(markupPct ?? '').trim() !== '') patch.markupPct = numeric(markupPct)
      if (String(discountPct ?? '').trim() !== '') patch.discountPct = numeric(discountPct)
      if (!Object.keys(patch).length || Object.values(patch).some(v => !Number.isFinite(v) || v < 0 || v > 100)) { reject(id, 'Enter a markup or discount between 0% and 100%. Blank fields stay unchanged.'); continue }
    } else if (mode === 'confirm') {
      if (!['ready', 'confirmed'].includes(status.key)) { reject(id, status.label, excluded); continue }
      patch = { confirmed: true, match: line.priceSourceSuggested ? 'Confirmed equivalent' : (line.match || 'Exact'), priceSourceSuggested: false, priceSourceSuggestedPart: '', priceSourceSuggestedDescription: '', priceSourceSuggestedList: '', priceSourceSuggestedVersion: '' }
    } else { reject(id, 'Unsupported edit operation'); continue }
    if (Object.entries(patch).some(([field, next]) => !same(line[field], next))) changes.push({ id, before: { ...line }, patch })
  }
  const patches = new Map(changes.map(change => [change.id, change.patch]))
  const after = scoped.map(line => patches.has(line.id) ? normalizePriceFields({ ...line, ...patches.get(line.id) }) : line)
  return { mode, changes, excluded, invalid, totalsBefore: sparesBatchTotals(scoped, costing), totalsAfter: sparesBatchTotals(after, costing) }
}

// A stale preview is rejected as a whole; never apply only half of a reviewed batch.
export function applySparesBatch(lines, oppId, changes) {
  const byId = new Map(lines.map(line => [line.id, line]))
  const seen = new Set()
  for (const change of changes) {
    const current = byId.get(change.id)
    if (seen.has(change.id) || !current || current.oppId !== oppId || current.removedFromSourcing || !same(current, change.before)) return { ok: false, error: 'Parts changed since this preview. Review the latest values before applying.' }
    seen.add(change.id)
  }
  const patches = new Map(changes.map(change => [change.id, change.patch]))
  return { ok: true, lines: lines.map(line => patches.has(line.id) ? normalizePriceFields({ ...line, ...patches.get(line.id) }) : line) }
}
