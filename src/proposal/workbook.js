import XLSX from 'xlsx-js-style'

export function parseProposalWorkbook(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true })
  return {
    filename,
    sheets: workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name]
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
      const sourceMerges = sheet['!merges'] || []
      const lastValueColumn = (() => {
        let last = range.s.c
        for (let c = range.s.c; c <= range.e.c; c++) {
          for (let r = range.s.r; r <= range.e.r; r++) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })]
            if (String(cell?.v ?? cell?.w ?? '').trim() !== '') last = c
          }
        }
        return last
      })()
      const lastMergeColumn = sourceMerges.reduce((last, merge) => Math.max(last, merge.e.c), range.s.c)
      const effectiveEndColumn = Math.max(lastValueColumn, lastMergeColumn)
      const firstMeaningfulColumn = (() => {
        for (let c = range.s.c; c <= effectiveEndColumn; c++) {
          const hasValue = Array.from({ length: range.e.r - range.s.r + 1 }, (_, index) => sheet[XLSX.utils.encode_cell({ r: range.s.r + index, c })])
            .some(cell => String(cell?.v ?? cell?.w ?? '').trim() !== '')
          const hasMerge = sourceMerges.some(merge => merge.s.c <= c && merge.e.c >= c)
          if (hasValue || hasMerge) return c
        }
        return range.s.c
      })()
      const effectiveRange = { ...range, s: { ...range.s, c: firstMeaningfulColumn }, e: { ...range.e, c: effectiveEndColumn } }
      const rows = []
      const styles = []
      const kinds = []
      for (let r = effectiveRange.s.r; r <= effectiveRange.e.r; r++) {
        const row = []
        const styleRow = []
        const kindRow = []
        for (let c = effectiveRange.s.c; c <= effectiveRange.e.c; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })]
          row.push(cell?.w ?? (cell?.v == null ? '' : String(cell.v)))
          styleRow.push(cell?.s ? { ...cell.s } : null)
          kindRow.push(cell?.f ? 'formula' : cell?.v == null ? 'empty' : typeof cell.v === 'number' || cell.t === 'n' ? 'number' : 'text')
        }
        rows.push(row)
        styles.push(styleRow)
        kinds.push(kindRow)
      }
      const rawWidths = sheet['!cols'] || []
      const merges = sourceMerges.map(merge => ({
        s: { r: merge.s.r - effectiveRange.s.r, c: merge.s.c - effectiveRange.s.c },
        e: { r: merge.e.r - effectiveRange.s.r, c: merge.e.c - effectiveRange.s.c },
      }))
      const rawRows = sheet['!rows'] || []
      const dropFirstRow = rows.length > 1 && rows[0].every(value => String(value ?? '').trim() === '')
      const visibleRows = dropFirstRow ? rows.slice(1) : rows
      const visibleStyles = dropFirstRow ? styles.slice(1) : styles
      const visibleKinds = dropFirstRow ? kinds.slice(1) : kinds
      const visibleMerges = dropFirstRow
        ? merges.filter(merge => merge.e.r > 0).map(merge => ({
          s: { ...merge.s, r: Math.max(0, merge.s.r - 1) },
          e: { ...merge.e, r: merge.e.r - 1 },
        }))
        : merges
      return {
        name,
        rows: visibleRows,
        styles: visibleStyles,
        kinds: visibleKinds,
        merges: visibleMerges,
        heights: Array.from({ length: effectiveRange.e.r - effectiveRange.s.r + 1 }, (_, i) => rawRows[effectiveRange.s.r + i]?.hpx || rawRows[effectiveRange.s.r + i]?.hpt || 24).slice(dropFirstRow ? 1 : 0),
        widths: Array.from({ length: effectiveRange.e.c - effectiveRange.s.c + 1 }, (_, i) => rawWidths[effectiveRange.s.c + i]?.wpx || 110),
      }
    }),
  }
}

export function updateWorkbookCell(workbook, sheetName, rowIndex, columnIndex, value) {
  if (!workbook?.sheets?.some(sheet => sheet.name === sheetName)) return workbook
  return {
    ...workbook,
    sheets: workbook.sheets.map(sheet => sheet.name !== sheetName ? sheet : {
      ...sheet,
      rows: sheet.rows.map((row, r) => r !== rowIndex ? row : row.map((cell, c) => c !== columnIndex ? cell : value)),
    }),
  }
}

export function serializeProposalWorkbook(workbook) {
  const output = XLSX.utils.book_new()
  for (const sheet of workbook?.sheets || []) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows || [])
    for (let rowIndex = 0; rowIndex < (sheet.styles || []).length; rowIndex++) {
      for (let columnIndex = 0; columnIndex < (sheet.styles[rowIndex] || []).length; columnIndex++) {
        const style = sheet.styles[rowIndex][columnIndex]
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
        if (style && worksheet[address]) worksheet[address].s = { ...style }
      }
    }
    worksheet['!merges'] = (sheet.merges || []).map(merge => ({
      s: { ...merge.s }, e: { ...merge.e },
    }))
    worksheet['!cols'] = (sheet.widths || []).map(width => ({ wpx: Number(width) || 110 }))
    XLSX.utils.book_append_sheet(output, worksheet, String(sheet.name || 'Sheet').slice(0, 31) || 'Sheet')
  }
  return XLSX.write(output, { bookType: /\.xlsm$/i.test(workbook?.filename || '') ? 'xlsm' : 'xlsx', type: 'array' })
}
