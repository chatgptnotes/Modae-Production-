import ExcelJS from 'exceljs'

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const clean = value => value == null ? '' : value

const contentWidths = (headers, rows) => headers.map((header, index) => {
  const longest = [headers, ...rows].reduce((max, row) => {
    const values = String(clean(row[index])).split('\n')
    return Math.max(max, ...values.map(value => value.length))
  }, 0)
  return Math.max(10, Math.min(42, longest + 2))
})

const columnLetter = index => {
  let value = index + 1
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

const cellValue = value => value == null ? '' : value

export function buildTableWorkbook(sheetName, headers, rows) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(String(sheetName || 'Sheet').slice(0, 31) || 'Sheet')
  const widths = contentWidths(headers, rows)

  worksheet.columns = headers.map((header, index) => ({
    header: cellValue(header),
    key: `column${index + 1}`,
    width: widths[index],
  }))
  worksheet.addRows(rows.map(row => headers.map((_, index) => cellValue(row[index]))))
  worksheet.autoFilter = `${columnLetter(0)}1:${columnLetter(Math.max(headers.length - 1, 0))}${Math.max(rows.length + 1, 1)}`
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  const header = worksheet.getRow(1)
  header.height = 24
  header.eachCell(cell => {
    cell.font = { name: 'Candara', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE84B36' } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB7C1CC' } } }
  })

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: 'Candara', size: 11, color: { argb: 'FF1F2937' } }
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }
    })
  })

  return workbook
}

export async function downloadTableXlsx(filename, sheetName, headers, rows) {
  const workbook = buildTableWorkbook(sheetName, headers, rows)
  const bytes = await workbook.xlsx.writeBuffer()
  const blob = new Blob([bytes], { type: MIME_XLSX })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
