import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { fmt, exportCSV, canViewCommercial, canManagePriceLists } from '../utils.js'
import { Modal } from '../ui.jsx'
import { buildPriceListInspectionPayload, downloadPriceListTemplate, parsePriceListFile } from '../priceListImport.js'
import { normalizedCurrencyRates } from '../currency.js'
import { roleRates, normalizeSheet } from '../serviceRates.js'
import { runTaskResult } from '../ai.js'

export default function PriceLists() {
  const store = useStore()
  const canEdit = canViewCommercial(store.role)
  const canUpload = canManagePriceLists(store.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedList = searchParams.get('list') || ''
  const requestedPart = searchParams.get('part') || ''
  const firstList = Object.keys(store.priceLists || {})[0] || 'BNK'
  const initialList = store.priceLists?.[requestedList] ? requestedList : firstList
  const [list, setList] = useState(initialList)
  const [highlightedPart, setHighlightedPart] = useState('')
  const [rateSheetName, setRateSheetName] = useState('India')
  const rateSheet = store.rateSheets?.[normalizeSheet(rateSheetName)] || {}
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadVersion, setUploadVersion] = useState('')
  const [uploadCurrency, setUploadCurrency] = useState('')
  const [uploadPreview, setUploadPreview] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [versionId, setVersionId] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editRows, setEditRows] = useState([])
  const [editVersion, setEditVersion] = useState('')
  const [rateDraft, setRateDraft] = useState({})
  const [partQuery, setPartQuery] = useState('')
  const [versionLoading, setVersionLoading] = useState(false)
  const rowRefs = useRef({})
  const pl = store.priceLists[list]
  // Archived versions are an administrator/commercial-manager concern. Keep
  // regular users pinned to the active catalogue even if this component was
  // previously mounted under a manager account.
  const selectedVersion = canUpload ? pl?.versions?.find(item => item.id === versionId) : null
  const displayList = selectedVersion || pl
  const currencies = [...new Set(['EUR', 'USD', ...Object.values(store.priceLists || {}).map(item => item.currency), ...Object.keys(store.config?.currencyRates || {})].filter(currency => currency && currency !== 'GBP'))]
  const currencyRates = normalizedCurrencyRates(store.config?.currencyRates)
  const requestedPartMatch = (displayList?.parts || []).find(part => String(part.pn).trim().toUpperCase() === requestedPart.trim().toUpperCase())
  const partFilter = partQuery.trim().toLowerCase()
  const numberedParts = (displayList?.parts || []).map((part, index) => ({ ...part, srNo: index + 1 }))
  const visibleParts = !partFilter ? numberedParts : numberedParts.filter(part =>
    String(part.srNo).includes(partFilter) || String(part.pn).toLowerCase().includes(partFilter) || String(part.desc || '').toLowerCase().includes(partFilter))
  const requestedListAvailable = !requestedList || !!store.priceLists?.[requestedList]

  useEffect(() => {
    if (store.priceLists?.[requestedList] && requestedList !== list) setList(requestedList)
  }, [list, requestedList, store.priceLists])

  useEffect(() => {
    const selected = canUpload ? pl?.versions?.find(item => item.id === versionId) : null
    if (!selected || selected.parts?.length || selected.id === pl?.activeVersionId || !store.loadPriceListVersion) return
    let mounted = true
    setVersionLoading(true)
    store.loadPriceListVersion(list, selected.version)
      .catch(error => console.warn('Archived price-list version load failed:', error?.message || error))
      .finally(() => { if (mounted) setVersionLoading(false) })
    return () => { mounted = false }
  }, [canUpload, list, pl, versionId])

  useEffect(() => {
    if (!requestedPart || !pl) return
    const match = (displayList.parts || []).find(part => String(part.pn).trim().toUpperCase() === requestedPart.trim().toUpperCase())
    setHighlightedPart(match?.pn || '')
    if (!match) return
    const timer = window.setTimeout(() => rowRefs.current[match.pn]?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0)
    return () => window.clearTimeout(timer)
  }, [list, displayList, requestedPart])

  const addAdhoc = e => {
    e.preventDefault()
    const f = new FormData(e.target)
    if (!f.get('pn')) return
    store.addAdhocPart({
      pn: f.get('pn'), supplier: f.get('supplier'), price: +f.get('price') || 0,
      currency: f.get('currency'), date: new Date().toISOString().slice(0, 10), note: f.get('note'),
    })
    e.target.reset()
  }

  const openUpload = () => {
    setUploadFile(null); setUploadPreview(null); setUploadVersion(`${displayList?.version || 'Current'} revised`)
    setUploadCurrency(displayList?.currency || 'EUR'); setUploadOpen(true)
  }

  const inspectUpload = async file => {
    setUploadFile(file); setUploadPreview(null)
    setAiBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      const fallback = parsePriceListFile(buffer, uploadCurrency || displayList.currency)
      setUploadPreview({ ...fallback, aiReview: { status: 'reviewing', message: 'AI is checking the workbook structure…' } })
      const aiResult = await runTaskResult('price-list.inspect', {
        filename: file.name,
        selectedList: list,
        workbook: buildPriceListInspectionPayload(buffer, file.name, list),
      }, { timeoutMs: 60000 })
      const review = aiResult.data
      if (!review?.data || !Array.isArray(review.data.sheets)) {
        if (fallback.currency) setUploadCurrency(fallback.currency)
        setUploadPreview({ ...fallback, aiReview: { status: 'fallback', message: aiResult.error || 'AI review was unavailable. Local parser result shown.' } })
        return
      }
      const aiReview = review.data
      const mapped = parsePriceListFile(buffer, aiReview.currency && aiReview.currency !== 'UNKNOWN' ? aiReview.currency : (fallback.currency || displayList.currency), aiReview)
      const detectedCurrency = aiReview.currency && aiReview.currency !== 'UNKNOWN' ? aiReview.currency : mapped.currency
      const confidence = Number(aiReview.confidence) || 0
      const blocked = !mapped.parts.length || confidence < 50 || aiReview.sheets.some(sheet => Number(sheet.confidence) < 40 && sheet.headerRow >= 0)
      setUploadCurrency(detectedCurrency)
      setUploadPreview({ ...mapped, currency: detectedCurrency, aiReview: {
        status: 'reviewed', supplier: aiReview.supplier, confidence, summary: aiReview.summary,
        issues: [...(aiReview.issues || []), ...(aiReview.sheets || []).flatMap(sheet => sheet.issues || [])],
        blocked,
      } })
    } catch (error) {
      setUploadPreview({ parts: [], errors: [`The workbook could not be read: ${error.message || error}`] })
    } finally {
      setAiBusy(false)
    }
  }

  const confirmUpload = () => {
    if (!uploadPreview || uploadPreview.errors.length || uploadPreview.aiReview?.blocked || !uploadFile || aiBusy) return
    store.replacePriceList(list, uploadPreview, { filename: uploadFile.name, version: uploadVersion.trim(), currency: uploadPreview.currency || uploadCurrency })
    setVersionId(null)
    setUploadOpen(false); setUploadFile(null); setUploadPreview(null)
  }

  const openEditor = () => {
    setEditRows(JSON.parse(JSON.stringify(displayList.parts || [])))
    setEditVersion(`${displayList.version || 'Current'} revised`)
    setEditOpen(true)
  }

  const updateEditRow = (index, field, value) => setEditRows(rows => rows.map((row, i) => i === index ? { ...row, [field]: field === 'price' ? (value === '' ? '' : Number(value)) : value } : row))
  const updateEditAdder = (index, value) => setEditRows(rows => rows.map((row, i) => i === index ? {
    ...row,
    adders: value.split(';').map(item => {
      const [code = '', desc = '', price = ''] = item.split('|').map(x => x.trim())
      return { code, desc, price: price === '' ? '' : Number(price) }
    }).filter(item => item.code || item.desc || item.price !== ''),
  } : row))
  const adderText = row => (row.adders || []).map(adder => `${adder.code}|${adder.desc}|${adder.price}`).join('; ')
  const aliasText = row => (row.aliases || []).join(', ')
  const saveEditedVersion = () => {
    const parts = editRows.map(row => ({ ...row, price: Number(row.price) || 0, adders: (row.adders || []).map(a => ({ ...a, price: Number(a.price) || 0 })) }))
    store.savePriceListVersion(list, versionId || pl.activeVersionId, parts, { version: editVersion.trim(), currency: displayList.currency })
    setEditOpen(false); setVersionId(null)
  }

  if (!pl) {
    return (
      <div className="page">
        <h2>Price Lists</h2>
        {store.priceListsStatus === 'loading' || store.priceListsStatus === 'refreshing'
          ? <p className="hint price-list-loading" role="status"><span className="auth-loading__spinner" aria-hidden="true" /> Loading approved price lists…</p>
          : store.priceListsStatus === 'error'
            ? <div className="errbox" role="alert">Approved price lists could not be loaded. <button onClick={store.reloadPriceLists}>Retry</button></div>
            : <p className="hint">No approved price lists are configured in the shared workspace.{canUpload ? ' Ask an administrator to upload a supplier price list.' : ''}</p>}
      </div>
    )
  }

  return (
    <div className="page">
      <h2>Price Lists</h2>
      <div className="toolbar">
        {Object.keys(store.priceLists).map(k => (
          <button key={k} className={list === k ? 'primary' : ''} onClick={() => {
            setList(k)
            setVersionId(null)
            setHighlightedPart('')
            setSearchParams({ list: k })
          }}>{k}</button>
        ))}
        <span className="hint">Current version {pl.version} · uploaded {pl.uploaded} · {pl.currency}. Current approved pricing reference.{store.priceListsStatus === 'degraded' ? ' Shared catalogue refresh is unavailable; showing the last cached copy.' : ''}</span>
        <span className="spacer" />
        <button onClick={() => exportCSV(`${list}_${displayList.version}_pricelist.csv`, ['Part Number','Description',`Price (${displayList.currency})`,'Adders'], (displayList.parts || []).map(x => [x.pn, x.desc, x.price, (x.adders || []).map(a => `${a.desc} +${a.price}`).join('; ')]))}>Extract to Excel</button>
        {canEdit && <button onClick={() => downloadPriceListTemplate(list, displayList.currency)}>Download template</button>}
        {canUpload && <>
          <button onClick={openUpload}>Upload new version</button>
        </>}
      </div>

      <div className="price-list-rates-card">
        <div><b>Currency conversion rates</b><span className="hint"> Rates are INR per one unit of foreign currency. Source prices are not changed.</span></div>
        <div className="price-list-rates-grid">
          {currencies.filter(currency => currency !== 'INR').map(currency => <label key={currency} className="afield">1 {currency} = ₹
            <input type="number" min="0.0001" step="0.0001" disabled={!canUpload} value={rateDraft[currency] ?? currencyRates[currency] ?? ''} onChange={e => setRateDraft({ ...rateDraft, [currency]: e.target.value })} />
            <button type="button" className="primary" disabled={!canUpload} onClick={() => { const rate = rateDraft[currency] ?? currencyRates[currency]; store.updateCurrencyRate(currency, rate); setRateDraft({ ...rateDraft, [currency]: String(rate) }) }}>Save</button>
          </label>)}
        </div>
      </div>

      {canUpload && <div className="toolbar price-list-version-bar">
        <label className="hint">View saved version</label>
        <select value={versionId || pl.activeVersionId || ''} onChange={e => setVersionId(e.target.value || null)}>
          {(pl.versions || []).slice().reverse().map(version => <option key={version.id} value={version.id}>{version.version}{version.id === pl.activeVersionId ? ' · Current' : ''} · {version.uploaded || '—'}</option>)}
        </select>
        <>
          <button onClick={openEditor}>Edit selected version</button>
          {versionId && versionId !== pl.activeVersionId && <button onClick={() => { store.restorePriceListVersion(list, versionId); setVersionId(null) }}>Restore selected version</button>}
        </>
        {selectedVersion && selectedVersion.id !== pl.activeVersionId && <span className="hint">Viewing an archived version. It is not used for new proposal pricing.</span>}
        {versionLoading && <span className="hint price-list-loading"><span className="auth-loading__spinner" aria-hidden="true" /> Loading version…</span>}
      </div>}

      {uploadOpen && (
        <Modal title={`Upload ${list} price list`} wide onClose={() => setUploadOpen(false)}>
          <p className="hint">Upload the filled template, or the supplier's own price file — every sheet is read and as much as possible is extracted. This creates a new saved version; older versions remain available.</p>
          <div className="admin-field-grid">
            <label className="afield">Version<input value={uploadVersion} placeholder="e.g. 2026-Q3" onChange={e => setUploadVersion(e.target.value)} /></label>
            <label className="afield">Currency<select value={uploadCurrency} onChange={e => setUploadCurrency(e.target.value)}><option>EUR</option><option>INR</option><option>USD</option></select></label>
          </div>
          <div className="admin-actions" style={{ marginTop: 12 }}>
            <input type="file" accept=".xlsx,.xls,.csv" disabled={aiBusy} onChange={e => e.target.files?.[0] && inspectUpload(e.target.files[0])} />
            <button onClick={() => downloadPriceListTemplate(list, uploadCurrency)}>Download blank template</button>
          </div>
          {uploadFile && <div className="hint" style={{ marginTop: 8 }}>{uploadFile.name}</div>}
          {aiBusy && <div className="hint" style={{ marginTop: 10 }}>AI is reviewing sheet headers and sample rows. Please wait…</div>}
          {uploadPreview && (
            <div style={{ marginTop: 12 }}>
              {uploadPreview.aiReview?.status === 'reviewed' && (
                <div className={uploadPreview.aiReview.blocked ? 'errbox' : 'okbox'}>
                  <b>AI review:</b> {uploadPreview.aiReview.supplier || 'Supplier not identified'} · {uploadPreview.currency || 'Currency not identified'} · confidence {uploadPreview.aiReview.confidence}%.
                  {uploadPreview.aiReview.summary && <div>{uploadPreview.aiReview.summary}</div>}
                  {uploadPreview.aiReview.blocked && <div><b>Import is blocked until the workbook mapping is reviewed.</b></div>}
                </div>
              )}
              {uploadPreview.aiReview?.status === 'fallback' && <div className="warnbox"><b>AI review unavailable.</b> {uploadPreview.aiReview.message}</div>}
              {uploadPreview.aiReview?.issues?.length > 0 && (
                <div className="warnbox" style={{ marginTop: 8 }}><ul>{uploadPreview.aiReview.issues.slice(0, 8).map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>
              )}
              {uploadPreview.errors.length > 0 && (
                <div className="errbox"><b>Fix these errors before importing:</b><ul>{uploadPreview.errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>
              )}
              {uploadPreview.parts.length > 0 && (
                <div className="okbox">
                  Ready to import <b>{uploadPreview.parts.length}</b> part{uploadPreview.parts.length === 1 ? '' : 's'}
                  {uploadPreview.report?.adders ? <> and <b>{uploadPreview.report.adders}</b> configurable adder{uploadPreview.report.adders === 1 ? '' : 's'}</> : null}
                  {uploadPreview.currency ? <> in {uploadPreview.currency}</> : null}.
                </div>
              )}
              {/* What came from where, so a partial read is visible rather than silent. */}
              {uploadPreview.report?.sheets?.length > 1 && (
                <div className="sheet-wrap" style={{ marginTop: 8 }}>
                  <table className="sheet">
                    <thead><tr><th>Sheet</th><th>Parts</th><th>Adders</th><th>Rows skipped</th></tr></thead>
                    <tbody>
                      {uploadPreview.report.sheets.map(sheet => (
                        <tr key={sheet.name}>
                          <td>{sheet.name}</td><td className="num">{sheet.parts}</td>
                          <td className="num">{sheet.adders}</td><td className="num">{sheet.skipped}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {uploadPreview.warnings?.length > 0 && (
                <div className="warnbox" style={{ marginTop: 8 }}>
                  <ul>{uploadPreview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 16 }}><button onClick={() => setUploadOpen(false)}>Cancel</button><button className="primary" disabled={aiBusy || !uploadPreview || uploadPreview.errors.length > 0 || uploadPreview.aiReview?.blocked || !uploadPreview.parts.length || !uploadFile} onClick={confirmUpload}>{aiBusy ? 'Reviewing…' : 'Import and make current'}</button></div>
        </Modal>
      )}

      {editOpen && (
        <Modal title={`Edit ${list} version`} wide onClose={() => setEditOpen(false)}>
          <p className="hint">Changes are saved as a new version. Add approved customer references as comma-separated aliases; these are reused by enquiry matching. Use the Adders format <b>CODE|Description|Price</b>; separate multiple adders with semicolons.</p>
          <label className="afield">New version name<input value={editVersion} onChange={e => setEditVersion(e.target.value)} /></label>
          <div className="sheet-wrap" style={{ marginTop: 12, maxHeight: 420 }}><table className="sheet"><thead><tr><th>Part Number</th><th>Description</th><th>Price</th><th>Customer aliases</th><th>Adders</th></tr></thead><tbody>
            {editRows.map((row, index) => <tr key={index}>
              <td><input value={row.pn} onChange={e => updateEditRow(index, 'pn', e.target.value)} /></td>
              <td><input value={row.desc} onChange={e => updateEditRow(index, 'desc', e.target.value)} /></td>
              <td><input type="number" value={row.price} onChange={e => updateEditRow(index, 'price', e.target.value)} /></td>
              <td><input value={aliasText(row)} placeholder="e.g. MPC4, MPC 4" onChange={e => updateEditRow(index, 'aliases', e.target.value.split(',').map(value => value.trim()).filter(Boolean))} /></td>
              <td><input value={adderText(row)} placeholder="CODE|Description|Price" onChange={e => updateEditAdder(index, e.target.value)} /></td>
            </tr>)}
          </tbody></table></div>
          <div className="form-actions" style={{ marginTop: 16 }}><button onClick={() => setEditOpen(false)}>Cancel</button><button className="primary" disabled={!editVersion.trim() || !editRows.length} onClick={saveEditedVersion}>Save as new version</button></div>
        </Modal>
      )}

      {requestedPart && (!requestedListAvailable || !requestedPartMatch) && (
        <div className="warnbox" role="status" style={{ maxWidth: 900, marginBottom: 10 }}>
          {!requestedListAvailable
            ? <>The original source list <b>{requestedList}</b> is not available. Showing <b>{list}</b>; part <b>{requestedPart}</b> was not found there.</>
            : <>Part <b>{requestedPart}</b> was not found in the <b>{list}</b> price list. Search the selected list or choose another list above.</>}
        </div>
      )}

      {/* The imported supplier catalogues run to well over a thousand rows, so
          the list needs a way in other than the ?part= deep link. */}
      <div className="toolbar" style={{ marginBottom: 6 }}>
        <input type="search" value={partQuery} onChange={e => setPartQuery(e.target.value)}
          placeholder="Search part number or description" aria-label="Search this price list"
          style={{ minWidth: 280 }} />
        <span className="hint">
          {partQuery.trim()
            ? `Showing ${visibleParts.length} of ${displayList.parts.length} parts`
            : `${displayList.parts.length} parts`}
        </span>
      </div>
      <div className="sheet-wrap sheet-wrap-fill price-list-sheet">
        <table className="sheet">
          <thead><tr><th className="pl-sr-no">Sr. No.</th><th>Part Number</th><th>Description</th><th>Price ({displayList.currency})</th><th>Configurable Adders</th></tr></thead>
          <tbody>
            {visibleParts.map(x => {
              // Supplier catalogues carry long text — descriptions of several
              // hundred characters and parts with a dozen options. Summarise the
              // options so the row stays readable and the price column stays on
              // screen; the full list is on the cell's tooltip.
              const adders = (x.adders || []).map(a => `${a.desc} (+${a.price})`)
              return (
                <tr key={x.pn} ref={row => { rowRefs.current[x.pn] = row }} className={highlightedPart === x.pn ? 'price-list-highlight' : undefined}>
                  <td className="pl-sr-no">{x.srNo}</td>
                  <td>{x.pn}</td>
                  <td className="pl-desc">{x.desc}</td>
                  <td className="num">{fmt(x.price)}</td>
                  <td className="pl-adders" title={adders.join('\n')}>
                    {adders.length
                      ? <>{adders.slice(0, 2).join(' · ')}{adders.length > 2 ? ` · +${adders.length - 2} more` : ''}</>
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="section-title">Ad-hoc / Non-B&amp;K parts — last referred price grows over time</div>
      <div className="hint" style={{ marginBottom: 6 }}>
        Every trader quote for a non-price-list part is captured here with its date; the latest entry becomes the reference price for future quotes.
      </div>
      <div className="sheet-wrap sheet-wrap-fill">
        <table className="sheet">
          <thead><tr><th>Part Number</th><th>Supplier</th><th>Price</th><th>Currency</th><th>Quoted On</th><th>Note</th></tr></thead>
          <tbody>
            {(store.adhocParts || []).map((x, i) => (
              <tr key={i}><td>{x.pn}</td><td>{x.supplier}</td><td className="num">{fmt(x.price)}</td><td>{x.currency}</td><td>{x.date}</td><td>{x.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form className="toolbar" onSubmit={addAdhoc} style={{ marginTop: 8 }}>
          <input name="pn" type="text" placeholder="Part number" />
          <input name="supplier" type="text" placeholder="Supplier" />
          <input name="price" type="number" placeholder="Price" style={{ width: 90 }} />
          <select name="currency"><option>INR</option><option>USD</option><option>EUR</option></select>
          <input name="note" type="text" placeholder="Note" />
          <button className="primary" type="submit">+ Capture quote</button>
        </form>
      )}

      <div className="section-title">Service Rate Sheet</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        {['India', 'International'].map(name => (
          <button key={name} className={rateSheetName === name ? 'primary' : ''} onClick={() => setRateSheetName(name)}>{name}</button>
        ))}
        <span className="hint">{rateSheet.currency}, GST {rateSheet.gst}%</span>
      </div>
      <div className="sheet-wrap" style={{ maxWidth: 560 }}>
        <table className="sheet">
          <thead><tr><th>Role</th><th>Rate / day ({rateSheetName === 'India' ? 'K₹' : 'USD'})</th></tr></thead>
          <tbody>
            {roleRates(rateSheet).map(r => (
              <tr key={r.role}>
                <td>{r.role}</td>
                <td className="num">{fmt(r.ratePerDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="costing-note">
        Service quotes = rate sheet × number of days; this is the same sheet the service
        workbench prices from and the invoice bills against. Rates are edited in Admin.
      </div>
    </div>
  )
}
