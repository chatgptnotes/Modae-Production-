import XLSX from 'xlsx-js-style'

export function parseProposalWorkbook(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true })
  return {
    filename,
    sheets: workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name]
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
      const rows = []
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row = []
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })]
          row.push(cell?.w ?? (cell?.v == null ? '' : String(cell.v)))
        }
        rows.push(row)
      }
      const rawWidths = sheet['!cols'] || []
      const merges = (sheet['!merges'] || []).map(merge => ({
        s: { r: merge.s.r - range.s.r, c: merge.s.c - range.s.c },
        e: { r: merge.e.r - range.s.r, c: merge.e.c - range.s.c },
      }))
      const rawRows = sheet['!rows'] || []
      const dropFirstRow = rows.length > 1 && rows[0].every(value => String(value ?? '').trim() === '')
      const visibleRows = dropFirstRow ? rows.slice(1) : rows
      const visibleMerges = dropFirstRow
        ? merges.filter(merge => merge.e.r > 0).map(merge => ({
          s: { ...merge.s, r: Math.max(0, merge.s.r - 1) },
          e: { ...merge.e, r: merge.e.r - 1 },
        }))
        : merges
      return {
        name,
        rows: visibleRows,
        merges: visibleMerges,
        heights: Array.from({ length: range.e.r - range.s.r + 1 }, (_, i) => rawRows[range.s.r + i]?.hpx || rawRows[range.s.r + i]?.hpt || 24).slice(dropFirstRow ? 1 : 0),
        widths: Array.from({ length: range.e.c - range.s.c + 1 }, (_, i) => rawWidths[range.s.c + i]?.wpx || 110),
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
    worksheet['!merges'] = (sheet.merges || []).map(merge => ({
      s: { ...merge.s }, e: { ...merge.e },
    }))
    worksheet['!cols'] = (sheet.widths || []).map(width => ({ wpx: Number(width) || 110 }))
    XLSX.utils.book_append_sheet(output, worksheet, String(sheet.name || 'Sheet').slice(0, 31) || 'Sheet')
  }
  return XLSX.write(output, { bookType: /\.xlsm$/i.test(workbook?.filename || '') ? 'xlsm' : 'xlsx', type: 'array' })
}
