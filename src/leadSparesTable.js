const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const tableHeader = text => /\bitem\b/i.test(text) && /equipment\s*ref/i.test(text) && /part\s*(?:number|no)/i.test(text) && /description/i.test(text) && /\bqty\b|\bquantity\b/i.test(text) && /\bunit\b/i.test(text)
const item = cells => ({ serial: clean(cells[0]), equipmentRef: clean(cells[1]), partNumber: clean(cells[2]), description: clean(cells[3]), qty: Number(cells[4]) > 0 ? Number(cells[4]) : 0, uom: clean(cells[5]), confidence: 94, evidence: cells.map(clean).join(' | '), source: 'deterministic' })

export function extractSparesTable(text, structPages = []) {
  const found = []
  let columns = null
  let current = null
  const flush = () => { if (current && current[2] && current[3]) found.push(item(current)); current = null }
  for (const page of structPages || []) {
    for (const line of page) {
      if (tableHeader(line.text || '')) {
        flush()
        const patterns = [/^item$/i, /^equipment/i, /^part/i, /^description/i, /^(qty|quantity)$/i, /^unit$/i]
        const starts = patterns.map(pattern => line.items?.find(it => pattern.test(it.str))?.x)
        columns = starts.every(Number.isFinite) ? starts : null
        continue
      }
      if (!columns) continue
      const cells = Array(6).fill('')
      for (const it of line.items || []) {
        let col = 0
        for (let n = 1; n < columns.length; n++) if (it.x >= columns[n] - 2) col = n
        cells[col] += ` ${it.str}`
      }
      const values = cells.map(clean)
      if (/^\d{1,3}$/.test(values[0])) { flush(); current = values }
      else if (current && !values[0]) current = current.map((v, n) => clean(`${v} ${values[n]}`))
      else { flush(); columns = null }
    }
  }
  flush()
  if (found.length) return uniqueTableRows(found)

  const lines = String(text || '').replace(/\r/g, '').split('\n').map(clean)
  const start = lines.findIndex(tableHeader)
  if (start < 0) return []
  let buffer = ''
  for (const line of lines.slice(start + 1)) {
    if (!line) continue
    if (/^\d{1,3}(?:\s|$)/.test(line)) buffer = line
    else if (buffer) buffer += ` ${line}`
    const match = buffer.match(/^(\d{1,3})\s+(.+?)\s+([A-Z][A-Z0-9]*(?:[-/][A-Z0-9]+){2,})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(sets?|nos?\.?|ea|pcs?\.?)$/i)
    if (match) { found.push(item(match.slice(1))); buffer = '' }
    else if (/^(?:please|kindly|delivery|regards)\b/i.test(line)) break
  }
  return uniqueTableRows(found)
}

export function uniqueTableRows(rows) {
  const seen = new Set()
  return rows.filter(row => {
    const key = JSON.stringify([row.equipmentRef || '', row.partNumber, row.description, row.qty, row.uom])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
