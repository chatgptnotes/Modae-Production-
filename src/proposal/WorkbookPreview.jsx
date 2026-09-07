import React, { useEffect, useRef, useState } from 'react'
import { ModaeImageLogo } from '../icons.jsx'
import { MODAE_DOCUMENT_STANDARDS } from '../branding/modae.js'

const cellsForRow = (sheet, rowIndex) => {
  const columnCount = sheet.widths.length || Math.max(1, ...sheet.rows.map(row => row.length))
  const cells = []
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
    const merge = (sheet.merges || []).find(item => item.s.r <= rowIndex && item.e.r >= rowIndex && item.s.c <= columnIndex && item.e.c >= columnIndex)
    if (merge && (merge.s.r !== rowIndex || merge.s.c !== columnIndex)) continue
    let colSpan = merge ? merge.e.c - merge.s.c + 1 : 1
    const value = sheet.rows[rowIndex]?.[columnIndex] ?? ''
    if (!merge && String(value).length > 35) {
      let end = columnIndex
      while (end + 1 < columnCount
        && !(sheet.rows[rowIndex]?.[end + 1])
        && !(sheet.merges || []).some(item => item.s.r <= rowIndex && item.e.r >= rowIndex && item.s.c <= end + 1 && item.e.c >= end + 1)) end++
      colSpan = end - columnIndex + 1
    }
    const rowSpan = merge ? merge.e.r - merge.s.r + 1 : 1
    const width = (sheet.widths || []).slice(columnIndex, columnIndex + colSpan).reduce((sum, item) => sum + item, 0)
    const name = String(sheet.name || '')
    const portrait = /cover letter|scope of work|^sow$|issues/i.test(name)
    const wideSheet = /firm|pricing|proposal/i.test(name)
    const previewWidth = portrait ? 820 : wideSheet ? 1400 : 1180
    const totalWidth = (sheet.widths || []).reduce((sum, item) => sum + Math.max(1, Number(item) || 1), 0) || 1
    const renderedWidth = Math.max(24, (width / totalWidth) * previewWidth)
    const rows = Math.max(1, Math.ceil(String(value).length / Math.max(12, Math.floor(renderedWidth / 7))))
    cells.push({ columnIndex, colSpan, rowSpan, value, rows, style: sheet.styles?.[rowIndex]?.[columnIndex] || null, kind: sheet.kinds?.[rowIndex]?.[columnIndex] || (value ? 'text' : 'empty') })
    columnIndex += colSpan - 1
  }
  return cells
}

const colorValue = color => {
  if (!color) return ''
  if (color.rgb) return `#${String(color.rgb).replace(/^FF/i, '')}`
  if (color.indexed === 64 || color.theme != null) return ''
  return ''
}

const cellStyle = cell => {
  const source = cell.style || {}
  const empty = String(cell.value ?? '').trim() === ''
  const style = {}
  const fontColor = colorValue(source.color)
  const borderColor = colorValue(source.border?.color) || 'var(--grid-line)'
  // The viewer uses a clean white document surface; source workbook fills
  // such as yellow/red review blocks are not part of the customer preview.
  if (fontColor) style.color = fontColor
  if (source.font?.bold) style.fontWeight = 700
  if (source.font?.italic) style.fontStyle = 'italic'
  if (source.font?.sz) style.fontSize = `${source.font.sz}pt`
  if (source.font?.name) style.fontFamily = `'${source.font.name}', var(--font-document)`
  if (source.alignment?.horizontal) style.textAlign = source.alignment.horizontal
  if (source.alignment?.vertical) style.verticalAlign = source.alignment.vertical
  if (source.alignment?.wrapText) style.whiteSpace = 'pre-wrap'
  if (source.border) style.borderColor = borderColor
  if (empty) {
    style.backgroundColor = 'transparent'
    style.borderColor = 'transparent'
  }
  return style
}

const isEditableTextCell = (sheet, cell) => {
  const value = String(cell.value ?? '').trim()
  if (!value || cell.kind === 'formula' || cell.kind === 'number') return false
  if (/^\s*[₹$€£]?[-+\d.,%]+\s*$/.test(value)) return false
  if (/^[A-Z0-9][A-Z0-9._\-/]{10,}$/i.test(value.replace(/\s+/g, ''))) return false
  if (/^(our ref|bid stage|bid type|revision|sl\.?\s*no\.?|item description|proposed model|part no\.?|qty|quantity|unit price|total price|unit cost|total cost|computed|list price|total for|terms\s*&?\s*conditions?)\s*:?$/i.test(value)) return false
  if (/^(binding|priced|unpriced|read-only|editable)$/i.test(value)) return false
  if (/firm|pricing|proposal/i.test(String(sheet.name || '')) && cell.columnIndex <= 1 && value.length < 32) return false
  return true
}

const pageClass = sheet => {
  const name = String(sheet.name || '').toLowerCase()
  const portrait = name.includes('cover letter') || name.includes('scope of work') || name === 'sow' || name.includes('issues')
  const wide = !portrait && /firm|pricing|proposal/i.test(name)
  return `${portrait ? 'template-page-portrait' : 'template-page-landscape'}${wide ? ' template-page-wide' : ''}`
}

const customerFacingSheet = sheet => {
  if (!/firm|pricing|proposal/i.test(String(sheet.name || ''))) return sheet
  // B:G are the six customer-facing commercial columns. H is only a
  // template spacer before the internal costing block begins at J.
  const customerColumnCount = Math.min(6, sheet.widths?.length || 6)
  return {
    ...sheet,
    rows: (sheet.rows || []).map(row => row.slice(0, customerColumnCount)),
    styles: (sheet.styles || []).map(row => row.slice(0, customerColumnCount)),
    kinds: (sheet.kinds || []).map(row => row.slice(0, customerColumnCount)),
    widths: (sheet.widths || []).slice(0, customerColumnCount),
    merges: (sheet.merges || []).flatMap(merge => {
      if (merge.s.c >= customerColumnCount) return []
      return [{ ...merge, e: { ...merge.e, c: Math.min(merge.e.c, customerColumnCount - 1) } }]
    }),
  }
}

const cellClass = (sheet, cell) => {
  const value = String(cell.value ?? '')
  const name = String(sheet.name || '').toLowerCase()
  const numeric = /^\s*[₹$€£]?[-+\d.,%]+\s*$/.test(value)
  const code = /^[A-Z0-9][A-Z0-9._\-/]{10,}$/i.test(value.replace(/\s+/g, ''))
  const wideText = value.length >= 42 || /description|terms|conditions|address|subject|project|paragraph|letter/i.test(value)
  const label = /:\s*$/.test(value)
  const heading = /firm|pricing|proposal/i.test(name) && cell.columnIndex <= 2 && value.length > 0 && !numeric
  return [
    'template-workbook-cell', value ? '' : 'template-workbook-empty', wideText ? 'template-cell-description' : '',
    code ? 'template-cell-code' : '', numeric ? 'template-cell-number' : '', label ? 'template-cell-label' : '', heading ? 'template-cell-heading' : '',
    !wideText && !code && !numeric && /firm|pricing|proposal/i.test(name) && value.length <= 14 ? 'template-cell-compact' : '',
  ].filter(Boolean).join(' ')
}

export default function WorkbookPreview({ workbook, editable = false, onChange, loading = false, error = '' }) {
  const [activeSheet, setActiveSheet] = useState(0)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const previewScrollRef = useRef(null)
  const sourceSheet = workbook?.sheets?.[activeSheet] || workbook?.sheets?.[0]
  const sheet = sourceSheet ? customerFacingSheet(sourceSheet) : sourceSheet
  const workbookSignature = (workbook?.sheets || []).map(item => item.name).join('|')

  useEffect(() => {
    const preview = previewScrollRef.current
    if (!preview) return
    preview.scrollTop = 0
    preview.scrollLeft = 0
  }, [activeSheet, workbookSignature])

  const beginEdit = (sheetName, rowIndex, columnIndex, value) => {
    if (!editable) return
    setEditing({ sheetName, rowIndex, columnIndex })
    setDraft(String(value ?? ''))
  }
  const finishEdit = (cancel = false) => {
    if (!editing) return
    if (!cancel) onChange?.(editing.sheetName, editing.rowIndex, editing.columnIndex, draft)
    setEditing(null)
  }

  return (
    <>
      {loading && <div className="hint">Loading proposal workbook…</div>}
      {error && <div className="errbox" role="alert">{error}</div>}
      {!!workbook?.sheets?.length && <>
        <nav className="template-workbook-page-nav template-workbook-page-nav-top" aria-label="Workbook pages">
          <div className="template-workbook-page-tabs">
            {workbook.sheets.map((item, index) => <button type="button" key={item.name} className={index === activeSheet ? 'active' : ''}
              onClick={() => { setEditing(null); setActiveSheet(index) }}>Page {index + 1} - {item.name.trim() || 'Sheet'}</button>)}
          </div>
        </nav>
        {!!sheet && <div ref={previewScrollRef} className="proposal-preview-scroll template-workbook-preview">
          <section className={`template-workbook-page ${pageClass(sheet)}`}>
            <div className="template-workbook-page-title">Page {activeSheet + 1} - {sheet.name.trim() || 'Sheet'}{editable ? ' · editable' : ' · read-only'}</div>
            <header className="template-workbook-sheet-header">
              <ModaeImageLogo height={34} />
              <div className="template-workbook-sheet-header-copy">
                <strong>{MODAE_DOCUMENT_STANDARDS.header.tagline}</strong>
              </div>
            </header>
            <div className="template-workbook-page-scroll">
              <table className="sheet template-workbook-table">
                <colgroup>{(sheet.widths || []).map((width, i) => <col key={i} style={{ width: `${Math.max(90, Number(width) || 110)}px` }} />)}</colgroup>
                <tbody>{sheet.rows.map((row, rowIndex) => <tr key={rowIndex} style={{ minHeight: sheet.heights?.[rowIndex] || 24 }}>
                  {cellsForRow(sheet, rowIndex).map(cell => {
                    const isEditing = editing?.sheetName === sheet.name && editing.rowIndex === rowIndex && editing.columnIndex === cell.columnIndex
                    const editableCell = editable && isEditableTextCell(sheet, cell)
                    return <td key={cell.columnIndex} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={cellStyle(cell)}
                      className={`${cellClass(sheet, cell)}${editableCell ? ' template-cell-editable' : ' template-cell-locked'}${isEditing ? ' is-editing' : ''}`} tabIndex={editableCell && !isEditing ? 0 : -1}
                      onClick={() => { if (editableCell) beginEdit(sheet.name, rowIndex, cell.columnIndex, cell.value) }}
                      onDoubleClick={() => { if (editableCell) beginEdit(sheet.name, rowIndex, cell.columnIndex, cell.value) }}
                      onKeyDown={event => { if (editableCell && (event.key === 'Enter' || event.key === 'F2')) { event.preventDefault(); beginEdit(sheet.name, rowIndex, cell.columnIndex, cell.value) } }}>
                      {isEditing ? <textarea autoFocus className="template-cell-editor" aria-label={`${sheet.name} row ${rowIndex + 1} column ${cell.columnIndex + 1}`} value={draft}
                        onChange={event => setDraft(event.target.value)} onBlur={() => finishEdit()}
                        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); finishEdit(true) } if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishEdit() } }} />
                        : <span className="template-cell-value">{cell.value || '\u00a0'}</span>}
                    </td>
                  })}
                </tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>}
      </>}
    </>
  )
}
