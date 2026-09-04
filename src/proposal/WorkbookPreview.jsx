import React, { useState } from 'react'

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
    cells.push({ columnIndex, colSpan, rowSpan, value, rows })
    columnIndex += colSpan - 1
  }
  return cells
}

const pageClass = sheet => {
  const name = String(sheet.name || '').toLowerCase()
  const portrait = name.includes('cover letter') || name.includes('scope of work') || name === 'sow' || name.includes('issues')
  const wide = !portrait && /firm|pricing|proposal/i.test(name)
  return `${portrait ? 'template-page-portrait' : 'template-page-landscape'}${wide ? ' template-page-wide' : ''}`
}

const cellClass = (sheet, cell) => {
  const value = String(cell.value ?? '')
  const name = String(sheet.name || '').toLowerCase()
  const numeric = /^\s*[₹$€£]?[-+\d.,%]+\s*$/.test(value)
  const code = /^[A-Z0-9][A-Z0-9._\-/]{10,}$/i.test(value.replace(/\s+/g, ''))
  const wideText = value.length >= 42 || /description|terms|conditions|address|subject|project|paragraph|letter/i.test(value)
  return [
    'template-workbook-cell', value ? '' : 'template-workbook-empty', wideText ? 'template-cell-description' : '',
    code ? 'template-cell-code' : '', numeric ? 'template-cell-number' : '',
    !wideText && !code && !numeric && /firm|pricing|proposal/i.test(name) && value.length <= 14 ? 'template-cell-compact' : '',
  ].filter(Boolean).join(' ')
}

export default function WorkbookPreview({ workbook, editable = false, onChange, loading = false, error = '' }) {
  const [activeSheet, setActiveSheet] = useState(0)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const sheet = workbook?.sheets?.[activeSheet] || workbook?.sheets?.[0]

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
          <button type="button" onClick={() => setActiveSheet(index => Math.max(0, index - 1))} disabled={activeSheet <= 0}>Previous page</button>
          <div className="template-workbook-page-tabs">
            {workbook.sheets.map((item, index) => <button type="button" key={item.name} className={index === activeSheet ? 'active' : ''}
              onClick={() => { setEditing(null); setActiveSheet(index) }}>Page {index + 1} - {item.name.trim() || 'Sheet'}</button>)}
          </div>
          <button type="button" onClick={() => setActiveSheet(index => Math.min(workbook.sheets.length - 1, index + 1))} disabled={activeSheet >= workbook.sheets.length - 1}>Next page</button>
        </nav>
        {!!sheet && <div className="proposal-preview-scroll template-workbook-preview">
          <section className={`template-workbook-page ${pageClass(sheet)}`}>
            <div className="template-workbook-page-title">Page {activeSheet + 1} - {sheet.name.trim() || 'Sheet'}{editable ? ' · editable' : ' · read-only'}</div>
            <div className="template-workbook-page-scroll">
              <table className="sheet template-workbook-table">
                <colgroup>{(sheet.widths || []).map((width, i) => <col key={i} style={{ width: `${Math.max(90, Number(width) || 110)}px` }} />)}</colgroup>
                <tbody>{sheet.rows.map((row, rowIndex) => <tr key={rowIndex} style={{ minHeight: sheet.heights?.[rowIndex] || 24 }}>
                  {cellsForRow(sheet, rowIndex).map(cell => {
                    const isEditing = editing?.sheetName === sheet.name && editing.rowIndex === rowIndex && editing.columnIndex === cell.columnIndex
                    return <td key={cell.columnIndex} rowSpan={cell.rowSpan} colSpan={cell.colSpan}
                      className={`${cellClass(sheet, cell)}${isEditing ? ' is-editing' : ''}`} tabIndex={editable && !isEditing ? 0 : -1}
                      onClick={() => beginEdit(sheet.name, rowIndex, cell.columnIndex, cell.value)}
                      onDoubleClick={() => beginEdit(sheet.name, rowIndex, cell.columnIndex, cell.value)}
                      onKeyDown={event => { if (editable && (event.key === 'Enter' || event.key === 'F2')) { event.preventDefault(); beginEdit(sheet.name, rowIndex, cell.columnIndex, cell.value) } }}>
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
