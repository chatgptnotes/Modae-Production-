// Preview one lead attachment.
//
// Two sources, in order: the stored blob (IndexedDB — the document itself), or
// the text the extraction kept on the lead. The second is what seeded demo
// leads and pre-existing attachments have, and the modal says so plainly rather
// than implying you are looking at the original.
import { useEffect, useRef, useState } from 'react'
import { Modal } from './ui.jsx'
import { Icon } from './icons.jsx'
import { getFile } from './leadBlobs.js'

const isImage = (name, type) => (type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
const isPdf = (name, type) => type === 'application/pdf' || /\.pdf$/i.test(name)

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
  const [url, setUrl] = useState('')

  useEffect(() => {
    let dead = false
    getFile(leadId, attachment.name).then(found => {
      if (dead) return
      setBlob(found)
      setLoading(false)
    })
    return () => { dead = true }
  }, [leadId, attachment.name])

  // One object URL for the download link and the image preview, revoked on close.
  useEffect(() => {
    if (!blob) return undefined
    const made = URL.createObjectURL(blob)
    setUrl(made)
    return () => { URL.revokeObjectURL(made); setUrl('') }
  }, [blob])

  const body = () => {
    if (loading) return <p className="hint att-view-note">Loading…</p>
    if (blob && isPdf(attachment.name, blob.type)) return <PdfPreview blob={blob} />
    if (blob && isImage(attachment.name, blob.type) && url) {
      return <div className="att-view-canvas"><img src={url} alt={attachment.name} /></div>
    }
    if (attachment.text) {
      return (
        <>
          <p className="hint att-view-note">
            <Icon name="bot" size={12} />{' '}
            {blob
              ? 'No inline preview for this file type — this is the text extracted from it. Download to open the original.'
              : 'No stored copy of this file — this is the text the extraction kept from it.'}
          </p>
          <pre className="att-view-text">{attachment.text}</pre>
        </>
      )
    }
    return (
      <p className="hint att-view-note">
        <Icon name="alert" size={12} />{' '}
        {attachment.err || (blob
          ? 'No inline preview for this file type. Download it to open the original.'
          : 'No stored copy of this file and no extracted text — only the file name was recorded.')}
      </p>
    )
  }

  return (
    <Modal title={attachment.name} onClose={onClose} wide className="attachment-viewer-modal">
      <p className="hint att-view-sub">
        {[attachment.pages ? attachment.pages + ' pages' : '', attachment.size || ''].filter(Boolean).join(' · ') || 'Attachment'}
      </p>
      <div className="att-view-body">{body()}</div>
      <div className="att-view-foot">
        {url && <a className="btn" href={url} download={attachment.name}><Icon name="download" size={13} /> Download</a>}
        <button className="primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
