import React, { useState } from 'react'
import DetailTabs from '../DetailTabs.jsx'

const FIELD_LIST = [
  'Owner', 'Opp Type', 'BU', 'Solution', 'Product', 'Stage', 'Prob (%)',
  'Customer Category', 'Close Reason', 'Customer Status', 'Forecast', 'Segment',
]

const PIPELINE_COLUMNS = [
  ['id', 'Opp ID'], ['sellTo', 'Sell To Customer'], ['category', 'Category'],
  ['location', 'Location'], ['customerStatus', 'Customer Status'],
  ['oppName', 'Opportunity Name / Description'], ['owner', 'Owner'],
  ['oppType', 'Opp Type'], ['bu', 'BU'], ['stage', 'Stage'], ['status', 'Status'],
]

const valueFor = (row, key) => row[key] ?? (key === 'oppName' ? row.oppName : '—')

export default function InputsWorkbook({ store }) {
  const [tab, setTab] = useState('Pipeline Explanation')
  const customers = store.customers || []
  const rows = store.opportunities || []
  const table = tab === 'Customers' ? (
    <table className="sheet workbook-table"><thead><tr><th>#</th><th>Customer</th><th>Category</th><th>Status</th><th>Location</th><th>Contact</th></tr></thead><tbody>
      {customers.map((c, i) => <tr key={c.id || i}><td className="rowhead">{i + 1}</td><td>{c.name}</td><td>{c.category || '—'}</td><td>{c.status || '—'}</td><td>{c.location || c.address || '—'}</td><td>{c.email || c.contactPerson || '—'}</td></tr>)}
    </tbody></table>
  ) : tab === 'Field List' ? (
    <table className="sheet workbook-table"><thead><tr><th>#</th><th>Field</th><th>Available values</th></tr></thead><tbody>
      {FIELD_LIST.map((name, i) => <tr key={name}><td className="rowhead">{i + 1}</td><td><b>{name}</b></td><td>Use the configured application values</td></tr>)}
    </tbody></table>
  ) : tab === 'Rows With Different Colour Code' ? (
    <table className="sheet workbook-table"><thead><tr><th>Colour</th><th>Meaning</th><th>Application use</th></tr></thead><tbody>
      {['Green — healthy / won', 'Amber — attention required', 'Red — blocked / lost', 'Blue — active / neutral'].map((row, i) => <tr key={row}><td className={`workbook-colour c${i}`}>{row.split(' — ')[0]}</td><td>{row.split(' — ')[1]}</td><td>Matches the pipeline status treatment</td></tr>)}
    </tbody></table>
  ) : (
    <table className="sheet workbook-table"><thead><tr>{PIPELINE_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {rows.map((o, i) => <tr key={o.id || i}>{PIPELINE_COLUMNS.map(([key]) => <td key={key}>{valueFor(o, key)}</td>)}</tr>)}
    </tbody></table>
  )

  return <div className="inputs-workbook">
    <div className="proposal-sheet-head">
      <div><h3>Inputs Workbook</h3><p className="hint">Reference workbook structure from Further Inputs, backed by live application data.</p></div>
      <span className="pill Blue">Reference data</span>
    </div>
    <div className="sheet-wrap workbook-scroll">{table}</div>
    <DetailTabs ariaLabel="Input workbook views" activeId={tab}
      items={['Pipeline Explanation', 'Rows With Different Colour Code', 'Customers', 'Field List'].map(name => ({ id: name, label: name }))}
      onChange={setTab} />
  </div>
}
