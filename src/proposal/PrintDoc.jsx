import React from 'react'
import { ddMmmYY } from '../utils.js'
import { ModaeImageLogo } from '../icons.jsx'
import { MODAE_COMPANY, docLayout, docSheets } from '../proposalDoc.js'
import { MODAE_DOCUMENT_STANDARDS } from '../branding/modae.js'
import { rackLayout, countSignals } from '../rack.js'
import { customerLocationValue } from '../locations.js'
import BoqSheet from './sheets/BoqSheet.jsx'
import {
  SignalListSheet, RackLayoutSheet, ComplianceSheet, ClarificationsSheet,
  SensorComparisonSheet, SowSheet, IssuesSheet,
} from './sheets/Annexes.jsx'

// The customer-facing document. Pure presentation, no form controls anywhere —
// what renders here is exactly what lands on paper.
//
// One <Page> per printed sheet, and the sheets are the ones the client's own
// proposals carry: a covering letter, one commercial sheet, and the technical
// annexes that belong to the route. Page furniture (letterhead strip, footer)
// is rendered per page rather than with `position: fixed`, which Chrome only
// paints on some sheets.

const paras = text => String(text || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)

const Lines = ({ text }) => String(text || '').split('\n').map((line, j, arr) => (
  <React.Fragment key={j}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
))

const Body = ({ text }) => paras(text).map((s, i) => <p key={i}><Lines text={s} /></p>)

// Compact identity strip on every page after the covering letter.
const PageHead = ({ p }) => (
  <div className="doc-pagehead">
    <span className="ph-brand"><ModaeImageLogo height={20} /></span>
    <span className="ph-meta">
      <span className="ph-tagline">{MODAE_COMPANY.tagline}</span>
      <span>{p.ourRef} · Rev {p.revision}</span>
    </span>
  </div>
)

// The footer the 18 Aug branding-guideline email prescribes: legal name, the
// Commerce Mantri address, then CIN | GST. The web address stays on the last
// line — ModAE's own Standard Terms document carries it there too.
const OfficialLetterheadFooter = () => (
  <div className="doc-official-footer">
    <b>{MODAE_DOCUMENT_STANDARDS.footerLines[0]}</b>
    <span>{MODAE_DOCUMENT_STANDARDS.footerLines[1]}</span>
    <span>{MODAE_DOCUMENT_STANDARDS.footerLines[2]}</span>
  </div>
)

const PageFoot = ({ text }) => (
  <>
    <OfficialLetterheadFooter />
    <div className="doc-pagefoot"><span>{text}</span><span>ModAE</span></div>
  </>
)

// One printed sheet. Sheets carry their own name — the samples number item
// groups inside the pricing sheet, never the sheets themselves.
function Page({ p, foot, head = true, title, last, landscape = false, children }) {
  return (
    <section className={`doc-page${last ? ' last' : ''}${landscape ? ' doc-page--landscape' : ''}`}>
      {head && <PageHead p={p} />}
      <div className="doc-page-body">
        {title && <h3 className="doc-h">{title}</h3>}
        {children}
      </div>
      <PageFoot text={foot} />
    </section>
  )
}
export default function PrintDoc({ p, opp, doc, priced, totals, lineQuoted }) {
  const foot = [
    MODAE_COMPANY.name,
    `${p.ourRef} Rev ${p.revision}`,
    (p.project || '').slice(0, 55),
  ].filter(Boolean).join('  ·  ')

  // The route decides which SHEETS the document carries — the client's own
  // proposals are a covering letter plus one pricing sheet, with technical
  // annexes beside it, not a run of numbered sections. `docSheets` folds in
  // whichever hidden annexes this proposal has opted into.
  const layout = docLayout(p, opp)
  const sheets = docSheets(p, opp)
  const rack = rackLayout(countSignals(p.signals))

  // The last sheet carries the sign-off, whichever sheet that turns out to be.
  const sheet = (kind, title, node, landscape = false) => {
    const i = sheets.indexOf(kind)
    if (i < 0) return null
    const isLast = i === sheets.length - 1
    return (
      <Page key={kind} p={p} foot={foot} title={title} last={isLast} landscape={landscape}>
        {node}
        {isLast && (
          <div className="doc-endnote">
            <div className="doc-block-h">For any clarification</div>
            <p>
              {doc.preparedBy.name ? <><b>{doc.preparedBy.name}</b>, </> : null}
              {doc.preparedBy.title} · {MODAE_COMPANY.name}<br />
              {[doc.preparedBy.email, doc.preparedBy.phone].filter(Boolean).join(' · ')}<br />
              {MODAE_COMPANY.web}{MODAE_COMPANY.cin ? ` · CIN ${MODAE_COMPANY.cin}` : ''}
            </p>
            <p className="doc-muted">— End of proposal {p.ourRef} Rev {p.revision} —</p>
          </div>
        )}
      </Page>
    )
  }

  const boqVariant = layout.boqVariant(p)

  const addressLines = [
    opp.eucName && opp.eucName !== opp.sellTo ? opp.eucName : '',
    customerLocationValue(opp.eucLocation || opp.location),
  ].filter(Boolean)
  return (
    <div className="propdoc">

      {/* ============================================ page 1 — covering letter */}
      <section className="doc-page doc-letter">
        <header className="doc-letterhead">
          <span className="doc-lh-brand"><ModaeImageLogo height={34} /></span>
          <span className="doc-lh-right">
            <i>{MODAE_COMPANY.tagline}</i><br />
            <b>{MODAE_COMPANY.name}</b>
            {MODAE_COMPANY.officialAddress}<br />
            {MODAE_COMPANY.phone} · {MODAE_COMPANY.email}<br />
            {MODAE_COMPANY.gstin ? <>GST {MODAE_COMPANY.gstin}</> : null}
          </span>
        </header>
        <div className="doc-rule" />

        {/* Field order, labels and omissions all come from the client's own
            supplied sample proposals (five workbooks, one identical
            Cover Letter sheet). Date stands alone; Our Ref / Bid Stage / Bid
            Type / Revision stack under it; the addressee block carries no "To"
            label; and there is no Encl:, no CC:, no "Yours faithfully" and no
            "For <company>" line in any real letter. */}
        <div className="doc-page-body">
          <div className="doc-letter-date"><b>Date:</b> {ddMmmYY(p.revisionDate)}</div>

          <div className="doc-letter-meta">
            <div><b>Our Ref:</b> {p.ourRef}</div>
            <div><b>Bid Stage:</b> {p.bidStage}</div>
            <div><b>Bid Type:</b> {p.bidType}</div>
            <div><b>Revision</b> {p.revision}</div>
          </div>

          <div className="doc-letter-to">
            <b>{p.addressee || `M/s. ${opp.sellTo}`}</b>
            {addressLines.map(l => <div key={l}>{l}</div>)}
          </div>

          {/* One cell in the samples: name, department, email and phone. */}
          <div className="doc-letter-attn">
            <b>Kind Attn:</b> {[
              p.kindAttn || opp.contactPerson || '—',
              p.attnDept, p.attnEmail || opp.contactEmail, p.attnPhone,
            ].filter(Boolean).join(' · ')}
          </div>

          <p className="doc-letter-subject">
            {/* nbsp, not a plain space: the anonymous table box `display:table`
                creates on this <p> collapses a space at the inline boundary. */}
            <b>Subject:</b>&nbsp;{[p.rfqNumber && `RFQ ${p.rfqNumber}`, p.subject || opp.oppName]
              .filter(Boolean).join(' — ')}
          </p>

          {/* Only four of the five samples carry a Project line — the services
              rate-schedule offer is not raised against one. */}
          {(p.project || '').trim() && (
            <p className="doc-letter-subject"><b>Project:</b>&nbsp;{p.project}</p>
          )}

          <p className="doc-letter-salutation">{doc.letterSalutation}</p>

          <div className="doc-letter-body"><Body text={doc.letterBody} /></div>

          <div className="doc-letter-close">
            <div>{doc.letterClose}</div>
            <div className="sign-line">
              <b>{doc.preparedBy.name || ' '}</b>
              <span>{doc.preparedBy.title}</span>
              <span>{doc.preparedBy.division}</span>
              <span>{MODAE_COMPANY.name}</span>
              <span>{[doc.preparedBy.phone && `Ph: ${doc.preparedBy.phone}`, doc.preparedBy.email]
                .filter(Boolean).join(' · ')}</span>
            </div>
          </div>
        </div>

        <PageFoot text={foot} />
      </section>

      {sheet('signalList', 'Signal List', <SignalListSheet p={p} />, true)}

      {sheet('rackLayout', 'Rack Layout', <RackLayoutSheet rack={rack} p={p} />, true)}

      {sheet('boq', layout.boqTitle(p), (
        <BoqSheet p={p} doc={doc} priced={priced} variant={boqVariant} lineQuoted={lineQuoted} />
      ), true)}

      {sheet('compliance', 'Technical Compliance & Clarification Table',
        <ComplianceSheet rows={doc.compliance} />, true)}

      {sheet('clarifications', 'Clarifications',
        <ClarificationsSheet rows={doc.clarifications} />)}

      {sheet('sensorComparison', 'Sensor Comparison',
        <SensorComparisonSheet compare={doc.sensorCompare} />)}

      {sheet('sow', 'Scope of Work', <SowSheet sow={doc.sow} />)}

      {sheet('issues', 'Issues List', <IssuesSheet rows={doc.issues} />, true)}

    </div>
  )
}
