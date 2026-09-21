// Preview one lead attachment.
//
// Two sources, in order: the stored blob (IndexedDB — the document itself), or
// the text the extraction kept on the lead. The second is what seeded demo
// leads and pre-existing attachments have, and the modal says so plainly rather
// than implying you are looking at the original.
import { useEffect, useRef, useState } from 'react'
import XLSX from 'xlsx-js-style'
import { Modal } from './ui.jsx'
import { Icon } from './icons.jsx'
import { getFile } from './leadBlobs.js'
import { extractDocxText } from './docText.js'
import WorkbookPreview from './proposal/WorkbookPreview.jsx'

const isImage = (name, type) => (type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
const isPdf = (name, type) => type === 'application/pdf' || /\.pdf$/i.test(name)
const isSpreadsheet = (name, type) => /spreadsheet|excel|sheet/i.test(type || '') || /\.(xlsx?|xlsm|csv)$/i.test(name)
const isDocx = (name, type) => /wordprocessingml\.document|msword/i.test(type || '') || /\.docx?$/i.test(name)
const isText = (name, type) => (type || '').startsWith('text/') || /\.(txt|md|json|eml|log)$/i.test(name)

function TextPreview({ text, label = 'Document text' }) {
  return (
    <div className="att-view-document">
      <div className="att-view-document-label">{label}</div>
      <pre className="att-view-text">{text}</pre>
    </div>
  )
}

function DocxPreview({ blob, fallback = '' }) {
  const [text, setText] = useState(fallback)
  const [error, setError] = useState('')

  useEffect(() => {
    let dead = false
    if (!blob) return undefined
    blob.arrayBuffer().then(buffer => extractDocxText(buffer)).then(value => {
      if (!dead) setText(value)
    }).catch(e => {
      if (!dead) setError(e?.message || 'The Word document could not be read.')
    })
    return () => { dead = true }
  }, [blob])

  if (error && !text) return <p className="hint att-view-note"><Icon name="alert" size={12} /> {error}</p>
  return <TextPreview text={text || 'This Word document has no readable text.'} label="Word document preview" />
}

function SpreadsheetPreview({ blob, fallback = '' }) {
  const [workbook, setWorkbook] = useState(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let dead = false
    if (!blob) return undefined
    blob.arrayBuffer().then(buffer => {
      const parsed = XLSX.read(buffer, { type: 'array', cellDates: true })
      const sheets = parsed.SheetNames.map(name => ({
        name,
        rows: XLSX.utils.sheet_to_json(parsed.Sheets[name], { header: 1, defval: '' }),
      }))
      if (!dead) { setWorkbook({ sheets }); setActiveSheet(0) }
    }).catch(e => {
      if (!dead) setError(e?.message || 'The spreadsheet could not be read.')
    })
    return () => { dead = true }
  }, [blob])

  if (error && !fallback) return <p className="hint att-view-note"><Icon name="alert" size={12} /> {error}</p>
  if (!workbook) return fallback ? <TextPreview text={fallback} label="Extracted spreadsheet text" /> : <p className="hint att-view-note">Loading spreadsheet…</p>
  const sheet = workbook.sheets[activeSheet] || workbook.sheets[0]
  const width = Math.max(1, ...sheet.rows.map(row => row.length))
  return (
    <div className="att-view-spreadsheet">
      {workbook.sheets.length > 1 && <div className="att-view-sheet-tabs" role="tablist" aria-label="Spreadsheet sheets">
        {workbook.sheets.map((item, index) => <button key={item.name} type="button" role="tab" aria-selected={activeSheet === index}
          className={activeSheet === index ? 'active' : ''} onClick={() => setActiveSheet(index)}>{item.name}</button>)}
      </div>}
      <div className="att-view-table-wrap">
        <table className="att-view-table"><tbody>
          {sheet.rows.map((row, rowIndex) => <tr key={rowIndex}>{Array.from({ length: width }, (_, columnIndex) => <td key={columnIndex}>{String(row[columnIndex] ?? '')}</td>)}</tr>)}
        </tbody></table>
      </div>
    </div>
  )
}

// Renders the PDF itself, one page at a time, via the same lazy pdfjs path
// tenderParse uses for text.
function PdfPreview({ blob }) {
  const canvasRef = useRef(null)
  const docRef = useRef(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [pdfjs, workerUrl] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs'),
          import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ])
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
        const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise
        if (dead) return
        docRef.current = doc
        setPages(doc.numPages)
      } catch (e) {
        if (!dead) setErr('Could not render this PDF: ' + (e?.message || e?.code || 'unknown'))
      }
    })()
    return () => { dead = true; docRef.current?.destroy?.(); docRef.current = null }
  }, [blob])

  useEffect(() => {
    let dead = false
    ;(async () => {
      const doc = docRef.current
      const canvas = canvasRef.current
      if (!doc || !canvas) return
      try {
        const pg = await doc.getPage(page)
        if (dead) return
        // Fit the modal's content width, then honour the device pixel ratio so
        // the text stays sharp on a retina screen.
        const base = pg.getViewport({ scale: 1 })
        const ratio = window.devicePixelRatio || 1
        const viewport = pg.getViewport({ scale: Math.min(1.6, (canvas.parentElement.clientWidth - 4) / base.width) * ratio })
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = viewport.width / ratio + 'px'
        canvas.style.height = viewport.height / ratio + 'px'
        await pg.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      } catch (e) {
        if (!dead) setErr('Could not render page ' + page + '.')
      }
    })()
    return () => { dead = true }
  }, [page, pages])

  if (err) return <p className="hint att-view-note"><Icon name="alert" size={12} /> {err}</p>
  return (
    <>
      <div className="att-view-canvas"><canvas ref={canvasRef} /></div>
      {pages > 1 && (
        <div className="att-view-pager">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Previous</button>
          <span className="hint">Page {page} of {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}>Next</button>
        </div>
      )}
    </>
  )
}

export default function AttachmentViewer({ leadId, attachment, onClose }) {
  const [blob, setBlob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [url, setUrl] = useState('')
  const filename = attachment?.name || attachment?.filename || 'attachment'

  useEffect(() => {
    let dead = false
    setLoading(true)
    setLoadError('')
    getFile(leadId, filename).then(found => {
      if (dead) return
      setBlob(found)
      setLoading(false)
    }).catch(error => {
      if (dead) return
      setBlob(null)
      setLoading(false)
      setLoadError(error?.message || 'The stored file could not be loaded.')
    })
    return () => { dead = true }
  }, [leadId, filename])

  // One object URL for the download link and the image preview, revoked on close.
  useEffect(() => {
    if (!blob) return undefined
    const made = URL.createObjectURL(blob)
    setUrl(made)
    return () => { URL.revokeObjectURL(made); setUrl('') }
  }, [blob])

  const body = () => {
    if (loading) return <p className="hint att-view-note">Loading…</p>
    const type = attachment.type || attachment.mimeType || blob?.type || ''
    if (loadError && !blob && !attachment.text) return <p className="hint att-view-note"><Icon name="alert" size={12} /> {loadError}</p>
    if (blob && isPdf(filename, type)) return <PdfPreview blob={blob} />
    if (blob && isImage(filename, type) && url) {
      return <div className="att-view-canvas"><img src={url} alt={filename} /></div>
    }
    if (blob && isDocx(filename, type)) return <DocxPreview blob={blob} fallback={attachment.text || ''} />
    if (blob && isSpreadsheet(filename, type)) return <SpreadsheetPreview blob={blob} fallback={attachment.text || ''} />
    if (blob && isText(filename, type)) {
      return <TextFilePreview blob={blob} fallback={attachment.text || ''} />
    }
    if (attachment.workbook?.sheets?.length) {
      return (
        <>
          <p className="hint att-view-note"><Icon name="fileText" size={12} /> Showing the saved workbook preview. The original file copy is not available in this browser.</p>
          <WorkbookPreview workbook={attachment.workbook} />
        </>
      )
    }
    if (attachment.text) {
      return (
        <>
          <p className="hint att-view-note"><Icon name="bot" size={12} /> {blob ? 'Showing extracted text from this file.' : 'No stored copy — showing extracted text.'}</p>
          <TextPreview text={attachment.text} />
        </>
      )
    }
    return (
      <p className="hint att-view-note">
        <Icon name="alert" size={12} />{' '}
          {attachment.err || loadError || (blob
          ? 'No inline preview for this file type. Download it to open the original.'
          : 'No stored copy of this file and no extracted text — only the file name was recorded.')}
      </p>
    )
  }

  const metadata = [attachment.pages ? `${attachment.pages} pages` : '', attachment.size || ''].filter(Boolean).join(' · ')
  const workbookAttachment = !!attachment.workbook?.sheets?.length || isSpreadsheet(filename, attachment.type || attachment.mimeType || '')

  return (
    <Modal title="Attachment preview" onClose={onClose} wide className={`attachment-viewer-modal ${workbookAttachment ? 'workbook-preview-modal' : ''}`}>
      <header className="att-view-file-head">
        <div className="att-view-file-icon"><Icon name="fileText" size={18} /></div>
        <div className="att-view-file-copy">
          <strong title={filename}>{filename}</strong>
          <span>{metadata || 'Attachment'}</span>
        </div>
      </header>
      <div className="att-view-body">{body()}</div>
      <footer className="att-view-foot">
        {url && <a className="btn" href={url} download={filename}><Icon name="download" size={13} /> Download</a>}
        <button className="primary" onClick={onClose}>Close</button>
      </footer>
    </Modal>
  )
}

function TextFilePreview({ blob, fallback }) {
  const [text, setText] = useState(fallback)
  useEffect(() => {
    let dead = false
    blob.text().then(value => { if (!dead) setText(value) })
    return () => { dead = true }
  }, [blob])
  return <TextPreview text={text} label="Text preview" />
}
