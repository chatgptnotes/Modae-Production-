import React from 'react'
import { fmt, ddMmmYY } from '../utils.js'
import { Icon, ModaeImageLogo } from '../icons.jsx'
import {
  MODAE_COMPANY, docLayout, addDays, amountInWords, lineQty, standardFor, customerResponse,
} from '../proposalDoc.js'

// The customer-facing document. Pure presentation, no form controls anywhere —
// what renders here is exactly what lands on paper.
//
// One <Page> per printed sheet: the covering letter, a contents page, a company
// page, then one numbered section per page. Page furniture (letterhead strip,
// footer) is rendered per page rather than with `position: fixed`, which Chrome
// only paints on some sheets.

const paras = text => String(text || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)

const Lines = ({ text }) => String(text || '').split('\n').map((line, j, arr) => (
  <React.Fragment key={j}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
))

const Body = ({ text }) => paras(text).map((s, i) => <p key={i}><Lines text={s} /></p>)

// Paragraphs whose first line is an ALL-CAPS lead-in render that line as a
// sub-heading — how the executive summary is drafted.
const HeadedBody = ({ text }) => paras(text).map((s, i) => {
  const nl = s.indexOf('\n')
  const head = nl > 0 ? s.slice(0, nl) : ''
  if (head && head === head.toUpperCase() && head.length < 60) {
    return (
      <div key={i} className="doc-block">
        <div className="doc-block-h">{head}</div>
        <p><Lines text={s.slice(nl + 1)} /></p>
      </div>
    )
  }
  return <p key={i}><Lines text={s} /></p>
})

const Bullets = ({ items }) => (
  <ul className="doc-list">{(items || []).filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}</ul>
)

const StatusChip = ({ status }) => (
  status === 'Deviation'
    ? <span className="doc-chip deviation"><Icon name="alert" size={11} /> Deviation</span>
    : <span className="doc-chip comply"><Icon name="checkCircle" size={11} /> Comply</span>
)

// Compact identity strip on every page after the covering letter.
const PageHead = ({ p }) => (
  <div className="doc-pagehead">
    <span className="ph-brand"><ModaeImageLogo height={20} /></span>
    <span>{p.ourRef} · Rev {p.revision}</span>
  </div>
)

const PageFoot = ({ text }) => (
  <div className="doc-pagefoot"><span>{text}</span><span>Confidential</span></div>
)

// Sections a route renames rather than drops — a services proposal quotes a
// scope of work and a schedule of charges, not a scope of supply and a BoQ.
const TITLE_KEY = { 'Scope of supply': 'scopeTitle', 'Bill of quantities': 'boqTitle' }

// `n` prints the section number badge; omit it for front matter.
function Page({ p, foot, head = true, title, n, last, children }) {
  return (
    <section className={`doc-page${last ? ' last' : ''}`}>
      {head && <PageHead p={p} />}
      <div className="doc-page-body">
        {title && (
          <h3 className="doc-h">
            {n != null && <span className="doc-h-n">{n}</span>}
            {title}
          </h3>
        )}
        {children}
      </div>
      <PageFoot text={foot} />
    </section>
  )
}

export default function PrintDoc({ p, opp, doc, priced, totals, lineQuoted }) {
  const bom = p.bom || []
  const gst = Math.round(totals.target * (doc.gstPct / 100))
  const validUntil = addDays(p.revisionDate, doc.validityDays)
  const foot = [
    MODAE_COMPANY.name,
    `${p.ourRef} Rev ${p.revision}`,
    (p.project || '').slice(0, 55),
  ].filter(Boolean).join('  ·  ')

  // The route decides which sections the document carries: the full project set,
  // or the shorter spares / services set. Everything downstream — the section
  // numbers, the contents listing and which pages render at all — comes from
  // this one array, so the three can never disagree.
  const layout = docLayout(p, opp)
  const sections = layout.sections
  const S = Object.fromEntries(sections.map((t, i) => [t, i + 1]))
  // A section not in this route's set simply does not print. `last` follows
  // whichever section actually ends the document once the drops are applied, and
  // that page carries the sign-off — on a spares quote the document ends at
  // Validity, not at the project template's Attachments page.
  const page = (title, children) => {
    if (!S[title]) return null
    const isLast = S[title] === sections.length
    return (
      <Page key={title} p={p} foot={foot} title={layout[TITLE_KEY[title]] || title}
        n={S[title]} last={isLast}>
        {children}
        {isLast && (
          <div className="doc-endnote">
            <div className="doc-block-h">For any clarification</div>
            <p>
              {doc.preparedBy.name ? <><b>{doc.preparedBy.name}</b>, </> : null}
              {doc.preparedBy.title} · {MODAE_COMPANY.name}<br />
              {[doc.preparedBy.email, doc.preparedBy.phone].filter(Boolean).join(' · ')}<br />
              {MODAE_COMPANY.web} · CIN {MODAE_COMPANY.cin}
            </p>
            <p className="doc-muted">— End of proposal {p.ourRef} Rev {p.revision} —</p>
          </div>
        )}
      </Page>
    )
  }

  const addressLines = [
    opp.eucName && opp.eucName !== opp.sellTo ? opp.eucName : '',
    opp.eucLocation || opp.location || '',
  ].filter(Boolean)

  return (
    <div className="propdoc">

      {/* ============================================ page 1 — covering letter */}
      <section className="doc-page doc-letter">
        <header className="doc-letterhead">
          <span className="doc-lh-brand">
            <ModaeImageLogo height={34} />
            <span><i>{MODAE_COMPANY.tagline}</i></span>
          </span>
          <span className="doc-lh-right">
            <b>{MODAE_COMPANY.name}</b>
            {MODAE_COMPANY.addr.map(l => <span key={l}>{l}<br /></span>)}
            {MODAE_COMPANY.phone} · {MODAE_COMPANY.email}<br />
            GSTIN {MODAE_COMPANY.gstin}
          </span>
        </header>
        <div className="doc-rule" />

        <div className="doc-page-body">
          <div className="doc-letter-refline">
            <span><b>Ref:</b> {p.ourRef} · Rev {p.revision}</span>
            <span><b>Date:</b> {ddMmmYY(p.revisionDate)}</span>
          </div>

          <div className="doc-letter-to">
            <div className="lbl">To</div>
            <b>{p.addressee || `M/s. ${opp.sellTo}`}</b>
            {addressLines.map(l => <div key={l}>{l}</div>)}
          </div>

          <div className="doc-letter-attn">
            <b>Kind Attn:</b> {p.kindAttn || opp.contactPerson || '—'}
            {p.attnPhone && <> · {p.attnPhone}</>}
          </div>

          {p.rfqNumber && (
            <div className="doc-letter-attn"><b>Your Ref:</b> {p.rfqNumber}</div>
          )}

          <p className="doc-letter-subject">
            {/* nbsp, not a plain space: the anonymous table box `display:table`
                creates on this <p> collapses a space at the inline boundary. */}
            <b>Sub:</b>&nbsp;{p.project || p.subject || opp.oppName}
          </p>

          <p className="doc-letter-salutation">{doc.letterSalutation}</p>

          <div className="doc-letter-body"><Body text={doc.letterBody} /></div>

          <div className="doc-letter-close">
            <div>{doc.letterClose}</div>
            <div className="close-for">For <b>{MODAE_COMPANY.name}</b></div>
            <div className="sign-line">
              <b>{doc.preparedBy.name || ' '}</b>
              <span>{doc.preparedBy.title}</span>
              <span>{[doc.preparedBy.email, doc.preparedBy.phone].filter(Boolean).join(' · ')}</span>
            </div>
          </div>

          {doc.attachments.length > 0 && (
            <div className="doc-letter-encl">
              <b>Encl:</b>
              <ol>{doc.attachments.map((a, i) => <li key={i}>{a}</li>)}</ol>
            </div>
          )}

          {doc.letterCc.trim() && (
            <div className="doc-letter-encl"><b>CC:</b> {doc.letterCc}</div>
          )}
        </div>

        <PageFoot text={foot} />
      </section>

      {/* ============================ page 2 — contents (project/services only) */}
      {layout.contents && (
      <Page p={p} foot={foot} title="Contents">
        <p className="doc-lead">
          Techno-Commercial Proposal {p.ourRef} Rev {p.revision}, {priced ? 'priced bid' : 'unpriced technical bid'},
          submitted against {p.rfqNumber || 'your enquiry'} and valid up to {ddMmmYY(validUntil)}.
        </p>
        <ol className="doc-toc">
          {sections.map((t, i) => (
            <li key={t}><span className="toc-n">{i + 1}</span><span className="toc-t">{layout[TITLE_KEY[t]] || t}</span></li>
          ))}
        </ol>
        <div className="doc-callout">
          This document is submitted in confidence for the purpose of evaluating the referenced enquiry, and remains
          the property of {MODAE_COMPANY.name}.
        </div>
      </Page>
      )}

      {/* ================================= page 3 — about ModAE (project only) */}
      {layout.about && (
      <Page p={p} foot={foot} title={`About ${MODAE_COMPANY.name}`}>
        <p>{doc.about.intro}</p>
        <div className="doc-block-h">Capability relevant to this enquiry</div>
        <Bullets items={doc.about.capabilities} />
        <p>{doc.about.closing}</p>
      </Page>
      )}

      {/* ------------------------------------------------ 1 executive summary */}
      {page('Executive summary', <HeadedBody text={doc.execSummary} />)}

      {/* --------------------------------------------------- 2 scope of supply */}
      {page('Scope of supply', (
        <>
          <p className="doc-lead">
            The following items are offered against your enquiry. The specification shown under each item is the
            specification tendered by you, against which the offered model is confirmed compliant.
          </p>
          {doc.scope.map((it, i) => (
            <div key={i} className="doc-item-card">
              <div className="ic-head">
                <span className="ic-n">{i + 1}</span>
                <span className="ic-cat">{it.category}</span>
                <span className="ic-qty">{it.qty} {it.uom}</span>
              </div>
              <div className="ic-grid">
                <div><span className="k">Offered model</span><span className="pn">{it.pn || '—'}</span></div>
                {/* The customer's own SAP code is deliberately NOT printed —
                    it stays on the workbench and in the Excel extract. */}
              </div>
              {it.specs.length > 0 && (
                <>
                  <div className="ic-spec-h">Tendered specification</div>
                  <ul className="doc-spec-list">{it.specs.map((s, j) => <li key={j}>{s}</li>)}</ul>
                </>
              )}
              {!it.specs.length && <p className="doc-muted">{it.desc}</p>}
            </div>
          ))}
          {!doc.scope.length && <p className="doc-muted">No items listed.</p>}
          <div className="doc-block-h">Supplied with every item</div>
          <Bullets items={doc.scopeIncludes} />
          {doc.scopeNote && <Body text={doc.scopeNote} />}
        </>
      ))}

      {/* --------------------------------------------------- 3 bill of quantities */}
      {page('Bill of quantities', (
        <>
          <table className="doc-table">
            <thead>
              <tr>
                <th className="sl">#</th>
                <th>Item / scope description</th>
                <th>Proposed model &amp; part no.</th>
                <th className="num">Qty</th>
                {priced && <th className="num">Unit price ₹</th>}
                {priced && <th className="num">Amount ₹</th>}
              </tr>
            </thead>
            <tbody>
              {bom.map((l, i) => {
                const q = lineQty(l, p.units)
                return (
                  <tr key={i}>
                    <td className="sl">{i + 1}</td>
                    <td>
                      {l.itemCategory && <b>{l.itemCategory}</b>}
                      <div>{l.desc}</div>
                    </td>
                    <td>
                      <span className="pn">{l.pn || '—'}</span>
                    </td>
                    <td className="num">{q} {l.uom}</td>
                    {priced && <td className="num">{fmt(lineQuoted(l))}</td>}
                    {priced && <td className="num">{fmt(lineQuoted(l) * q)}</td>}
                  </tr>
                )
              })}
              {!bom.length && (
                <tr><td colSpan={priced ? 6 : 4} className="doc-muted">No line items.</td></tr>
              )}
            </tbody>
            {priced && bom.length > 0 && (
              <tbody>
                <tr className="doc-subtotal">
                  <td colSpan={5}>Total ex-works, ₹</td>
                  <td className="num">{fmt(totals.target)}</td>
                </tr>
              </tbody>
            )}
          </table>
          {priced
            ? <div className="doc-words">{amountInWords(totals.target)} (excluding GST)</div>
            : (
              <div className="doc-callout">
                This is the technical part of the bid. Prices are submitted separately in the price bid,
                as required by the enquiry.
              </div>
            )}
        </>
      ))}

      {/* ------------------------------------------------ 4 commercial summary */}
      {page('Commercial summary', (
        <>
          <div className="doc-block-h">Basis of the quoted prices</div>
          <table className="doc-table doc-kv">
            <tbody>
              {doc.priceBasis.map(([k, v]) => (
                <tr key={k}><td className="k">{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>

          {priced ? (
            <>
              <div className="doc-block-h">Offer value</div>
              <div className="doc-total">
                <div><span>Total ex-works, ₹</span><span>{fmt(totals.target)}</span></div>
                <div><span>GST @ {doc.gstPct}% (extra at actuals)</span><span>{fmt(gst)}</span></div>
                <div><span>Total including GST, ₹</span><span>{fmt(totals.target + gst)}</span></div>
              </div>
              <div className="doc-words">{amountInWords(totals.target + gst)}</div>
            </>
          ) : (
            <p className="doc-muted">Prices are submitted separately in the price bid.</p>
          )}

          <div className="doc-block-h">Payment</div>
          <table className="doc-table">
            <thead><tr><th>Stage</th><th>Amount / term</th></tr></thead>
            <tbody>
              {doc.paymentMilestones.map((m, i) => (
                <tr key={i}><td>{m.stage}</td><td>{m.pct}</td></tr>
              ))}
            </tbody>
          </table>

          <Body text={doc.commercialNote} />
        </>
      ))}

      {/* -------------------------------------------------- 5 delivery schedule */}
      {page('Delivery schedule', (
        <>
          <table className="doc-table">
            <thead><tr><th className="sl">#</th><th>Milestone</th><th style={{ width: '30%' }}>Timeline</th></tr></thead>
            <tbody>
              {doc.deliveryMilestones.map((m, i) => (
                <tr key={i}>
                  <td className="sl">{i + 1}</td>
                  <td>{m.milestone}</td>
                  <td><b>{m.timeline}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Body text={doc.deliveryNote} />
        </>
      ))}

      {/* ---------------------------------------------------------- 6 assumptions */}
      {page('Assumptions', (
        <>
          <p className="doc-lead">This offer is made on the following assumptions. Where any of them does not hold,
            we would ask to review the affected part of the offer with you.</p>
          <Bullets items={doc.assumptions} />
        </>
      ))}

      {/* ----------------------------------------------------------- 7 exclusions */}
      {page('Exclusions', (
        <>
          <p className="doc-lead">The following are outside the scope of this offer. Any of them can be quoted
            separately on request.</p>
          <Bullets items={doc.exclusions} />
        </>
      ))}

      {/* ----------------------------------------------------------- 8 deviations */}
      {page('Deviations', (
        doc.deviations.length === 0 ? (
          <div className="doc-callout">
            We confirm full compliance with the technical specification and with every commercial term and condition
            of your enquiry. No deviations are taken.
          </div>
        ) : (
          <>
            <p className="doc-lead">
              Our offer is technically compliant in full. The following {doc.deviations.length} commercial{' '}
              {doc.deviations.length === 1 ? 'point is' : 'points are'} placed before you for consideration. For each
              we have set out your requirement, our position, the reasoning behind it, what accepting it as written
              would mean, and the alternative we propose.
            </p>
            {doc.deviations.map((t, i) => (
              <div key={i} className="doc-dev">
                <div className="dev-head">
                  <span className="ic-n">{i + 1}</span>
                  <span className="dev-term">{t.term}</span>
                  {t.clauseRef && <span className="dev-clause">{t.clauseRef}</span>}
                  <StatusChip status="Deviation" />
                </div>
                <div className="dev-row"><span className="k">Your requirement</span><span>{t.customerAsk}</span></div>
                <div className="dev-row"><span className="k">Our offer</span><span>{customerResponse(t.ourResponse, t.key)}</span></div>
                <div className="dev-row"><span className="k">Why</span><span>{t.rationale.why}</span></div>
                <div className="dev-row"><span className="k">Impact</span><span>{t.rationale.impact}</span></div>
                <div className="dev-row proposal">
                  <span className="k">We propose</span><span>{t.rationale.proposal}</span>
                </div>
              </div>
            ))}
          </>
        )
      ))}

      {/* ------------------------------------------------------ 9 terms & conditions */}
      {page('Terms & conditions', (
        <>
          {doc.offerTerms.length > 0 && (
            <>
              <div className="doc-block-h">Terms offered</div>
              <table className="doc-table">
                <thead><tr><th style={{ width: '26%' }}>Term</th><th>Our offer</th></tr></thead>
                <tbody>
                  {doc.offerTerms.map((t, i) => (
                    <tr key={i}><td><b>{t.term}</b></td><td>{t.ourResponse}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {(p.terms || []).length > 0 && (
            <>
              <div className="doc-block-h">Clause-by-clause compliance</div>
              <p className="doc-lead">
                Our response to every commercial clause of your enquiry. Clauses not listed below are accepted
                as written.
              </p>
              <table className="doc-table">
                <thead>
                  <tr>
                    <th className="sl">#</th>
                    <th>Term</th>
                    <th>Your requirement</th>
                    <th>Our response</th>
                    <th style={{ width: '11%' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {p.terms.map((t, i) => (
                    <tr key={i}>
                      <td className="sl">{i + 1}</td>
                      <td>
                        <b>{t.term}</b>
                        {t.clauseRef && <span className="cust-ref">{t.clauseRef}</span>}
                      </td>
                      <td>{t.customerAsk}</td>
                      <td>
                        {customerResponse(t.ourResponse, t.key, t.status === 'Deviation')}
                        {standardFor(t.key) && (
                          <span className="cust-ref">ModAE standard: {standardFor(t.key)}</span>
                        )}
                      </td>
                      <td><StatusChip status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ))}

      {/* -------------------------------------------------------- 10 validity */}
      {page('Validity of offer', (
        <>
          <table className="doc-table doc-kv">
            <tbody>
              <tr><td className="k">Offer date</td><td>{ddMmmYY(p.revisionDate)}</td></tr>
              <tr><td className="k">Validity</td><td>{doc.validityDays} days from the date of this offer</td></tr>
              <tr><td className="k">Valid up to and including</td><td><b>{ddMmmYY(validUntil)}</b></td></tr>
              <tr><td className="k">Our reference</td><td>{p.ourRef} · Revision {p.revision}</td></tr>
              <tr><td className="k">Your reference</td><td>{p.rfqNumber || '—'}</td></tr>
            </tbody>
          </table>
          <Body text={doc.validityNote} />
        </>
      ))}

      {/* ------------------------------------------ 11 attachments (project only) */}
      {page('Attachments & enclosures', (
        <>
          <p className="doc-lead">The following documents accompany this offer. The same list appears as the
            enclosures to our covering letter.</p>
          <ol className="doc-encl-list">
            {doc.attachments.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
          {!doc.attachments.length && <p className="doc-muted">No enclosures.</p>}
        </>
      ))}
    </div>
  )
}
