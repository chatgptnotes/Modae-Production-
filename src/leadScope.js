const clean = value => String(value ?? '').trim()

export function deriveOpportunityScope(lineItems = [], fallback = '') {
  const lines = (lineItems || [])
    .map(item => {
      const description = clean(item?.description || item?.desc)
      const partNumber = clean(item?.partNumber || item?.pn || item?.customerRef)
      const qty = Number(item?.qty)
      const uom = clean(item?.uom || item?.unit || 'EA') || 'EA'
      if (!description && !partNumber) return ''
      const label = [description, partNumber && `(${partNumber})`].filter(Boolean).join(' ')
      return `${label} — Qty ${Number.isFinite(qty) && qty > 0 ? qty : 1} ${uom}`
    })
    .filter(Boolean)
  if (lines.length) return `Supply of ${lines.join('; ')}`
  return clean(fallback)
}
