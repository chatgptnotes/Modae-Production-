import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const execFile = promisify(nodeExecFile)
const CONVERTIBLE = new Set(['doc', 'docx', 'docm', 'odt', 'rtf', 'xls', 'xlsx', 'xlsm', 'ods', 'ppt', 'pptx', 'pptm', 'odp'])
const MAX_INPUT_BYTES = 900 * 1024
const MAX_PDF_BYTES = 1024 * 1024
export const MAX_CONVERTED_TOTAL_BYTES = 1536 * 1024

export async function convertOfficeToPdf(input, originalName, { execFileImpl = execFile, maxInputBytes = MAX_INPUT_BYTES, maxPdfBytes = MAX_PDF_BYTES } = {}) {
  const extension = path.extname(String(originalName || '')).slice(1).toLowerCase()
  if (!CONVERTIBLE.has(extension)) throw new Error('This file type is not supported for conversion.')
  const bytes = Buffer.from(input || [])
  if (!bytes.length) throw new Error('This file is empty.')
  if (bytes.length > maxInputBytes) throw new Error('This file is too large to convert.')

  const directory = await mkdtemp(path.join(os.tmpdir(), 'wintrack-office-'))
  const inputPath = path.join(directory, `attachment.${extension}`)
  const outputPath = path.join(directory, 'attachment.pdf')
  const profilePath = path.join(directory, 'profile')
  try {
    await writeFile(inputPath, bytes, { flag: 'wx', mode: 0o600 })
    try {
      await execFileImpl(process.env.LIBREOFFICE_BIN || 'soffice', [
        `-env:UserInstallation=${pathToFileURL(profilePath).href}`, '--headless', '--nologo', '--nodefault', '--nolockcheck', '--convert-to', 'pdf', '--outdir', directory, inputPath,
      ], { timeout: 20000, maxBuffer: 1024 * 1024 })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        const unavailable = new Error('Office-to-PDF conversion is unavailable on this server. Install LibreOffice and retry.')
        unavailable.code = 'OFFICE_CONVERSION_UNAVAILABLE'
        throw unavailable
      }
      const conversion = new Error('This Office file could not be converted. It may be damaged or password-protected.')
      conversion.code = 'OFFICE_CONVERSION_FAILED'
      throw conversion
    }
    const pdf = await readFile(outputPath).catch(() => null)
    if (!pdf?.subarray(0, 5).equals(Buffer.from([37, 80, 68, 70, 45]))) {
      const conversion = new Error('This Office file did not produce a readable PDF. It may be damaged or password-protected.')
      conversion.code = 'OFFICE_CONVERSION_FAILED'
      throw conversion
    }
    if (pdf.length > maxPdfBytes) throw new Error('The converted PDF exceeds the size limit.')
    return { bytes: pdf, filename: `${path.basename(String(originalName), path.extname(String(originalName))).slice(0, 100) || 'attachment'}.pdf` }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
