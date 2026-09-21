// Shared aliases used when turning AI/document fields into lead decisions.
// Human-edited lead properties are checked before these extracted values.
const LABELS = {
  sellTo: [/^sell[ -]?to(?: customer)?$/, /^customer(?: name)?$/, /^buyer$/],
  eucName: [
    /^euc(?: name)?$/, /^eun(?: name)?$/, /^end user(?: name)?$/,
    /^ultimate customer(?: name)?$/, /^beneficiary(?: name)?$/,
    /^(?:project )?site(?: name)?$/, /^plant(?: name)?$/,
    /^station(?: name)?$/, /^installation(?: site| name)?$/,
  ],
  eucLocation: [
    /^(?:euc|eun|end user)(?: site)? location$/,
    /^(?:site|plant|station|project site|installation) (?:location|address)$/,
    /^delivery (?:location|address|site)$/, /^site address$/,
    /^location$/, /^region$/, /^city(?: and state)?$/, /^state$/, /^country$/,
  ],
  contactPerson: [/^contact person$/, /^signatory$/, /^(?:kind )?attn?$/, /^contact$/],
  contactPhone: [/^contact phone(?: number| #)?$/, /^(?:phone|mobile|telephone)(?: number| #)?$/],
  oppName: [/^(?:opportunity|opp) name$/, /^opportunity description$/, /^description$/, /^subject$/],
  scope: [/^(?:opportunity )?scope$/, /^requirement$/, /^requested scope$/],
  category: [/^category$/, /^customer category$/],
  oppType: [/^(?:opportunity|opp) type$/],
  bu: [/^bu$/, /^business unit$/],
  segment: [/^segment$/],
  product: [/^product$/, /^products$/],
}

export const normalizeLeadLabel = value => String(value || '')
  .toLowerCase()
  .replace(/[：:;/|_\-]+/g, ' ')
  .replace(/[()]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const labelText = normalizeLeadLabel

export const leadFieldValue = (fields = [], key) => {
  const matchers = LABELS[key] || []
  const field = (fields || []).find(item => item.state !== 'rejected' && matchers.some(re => re.test(labelText(item.k))))
  return field?.v == null ? '' : String(field.v).trim()
}

// A plain email often describes the end user in prose instead of using an
// explicit "EUC Name" / "EUC Location" label. Recover the common plant/site
// pattern as a suggestion, while keeping explicit or human-entered values as
// the stronger source below.
export const inferEucFromText = (text = '') => {
  const source = String(text || '').replace(/\s+/g, ' ').trim()
  const match = source.match(/(?:existing\s+)?(?:installation|plant|station|site)\s+(?:at|in)\s+([^,.;]+),\s*([^,.;]+),\s*([^,.;]+)/i)
  if (match) {
    return {
      eucName: match[1].trim(),
      eucLocation: `${match[2].trim()}, ${match[3].trim()}`,
    }
  }

  // Common RFQ wording puts the customer/site after "at" without an
  // explicit field label, for example: "... at Tata Power, Mumbai:".
  const inline = source.match(/(?:^|[\s,:])at\s+([^,\n;:]+),\s*([^,\n;:]+)(?:,\s*([^,\n;:]+))?(?=[:.;\n]|$)/i)
  if (!inline) return { eucName: '', eucLocation: '' }
  return {
    eucName: inline[1].trim(),
    eucLocation: [inline[2], inline[3]].filter(Boolean).map(value => value.trim()).join(', '),
  }
}

// Recover an explicit location label from the original enquiry when the AI
// response omitted the corresponding structured field. This is deliberately
// narrower than prose inference: a labelled site/location line is direct
// evidence and should be safe to carry into the mandatory EUC Location field.
export const labeledEucLocationFromText = (text = '') => {
  const source = String(text || '')
  const label = '(?:(?:euc|eun|end\\s+user)\\s+(?:site\\s+)?(?:location|address)|(?:site|plant|station|project\\s+site|installation)\\s+(?:location|address)|(?:required\\s+)?delivery\\s+(?:location|address|site)|site\\s+address)'
  const inline = source.match(new RegExp(`(?:^|\\n)[ \\t]*${label}[ \\t]*:[ \\t]*([^\\n;]+)`, 'i'))
  if (inline?.[1]) return inline[1].trim().replace(/[.,]+$/, '').replace(/,\\s*India$/i, '')

  // RFQs commonly put the delivery heading on one line and the company/site
  // address on the following lines. Prefer the city/state line when the first
  // line is only the delivery customer's name.
  const lines = source.split(/\r?\n/)
  const heading = new RegExp(`^\\s*${label}\\s*:?\\s*$`, 'i')
  for (let i = 0; i < lines.length; i += 1) {
    if (!heading.test(lines[i])) continue
    const following = lines.slice(i + 1, i + 4).map(line => line.trim()).filter(Boolean)
    const locationLine = following.find(line => /,/.test(line)) || following[0]
    if (locationLine) return locationLine.replace(/[.,]+$/, '').replace(/,\s*India$/i, '')
  }
  return ''
}

export const splitBuSegment = (fields = []) => {
  const combined = (fields || []).find(item => item.state !== 'rejected' && /^bu\s+(?:and\s+)?segment$/i.test(labelText(item.k)))
  if (!combined?.v) return { bu: leadFieldValue(fields, 'bu'), segment: leadFieldValue(fields, 'segment') }
  const [bu, ...rest] = String(combined.v).split(/\s*\/\s*/)
  return { bu: bu.trim(), segment: rest.join(' / ').trim() }
}

export const leadIdentity = (lead, fields = []) => {
  const sourceText = [
    lead?.subject,
    lead?.body,
    lead?.opportunityScope,
    lead?.ai?.summary,
  ].filter(Boolean).join('\n')
  const inferred = inferEucFromText(sourceText)
  const labeledLocation = labeledEucLocationFromText(sourceText)
  const sellTo = String(lead?.sellTo || leadFieldValue(fields, 'sellTo') || lead?.parse?.sellTo || '').trim()
  const extractedEucName = leadFieldValue(fields, 'eucName')
  const eucName = String(
    extractedEucName && lead?.eucName && lead?.contactPerson
      && String(lead.eucName).trim() === String(lead.contactPerson).trim()
      ? extractedEucName
      : lead?.eucName || extractedEucName || lead?.parse?.eucName || inferred.eucName || sellTo,
  ).trim()
  const eucLocation = String(
    lead?.eucLocation || leadFieldValue(fields, 'eucLocation') || lead?.parse?.eucLocation
      || lead?.location || labeledLocation || inferred.eucLocation || '',
  ).trim()
  return {
    sellTo,
    // Repair the old fallback that copied Contact Person into EUC Name. A
    // confirmed Site/Plant extraction is the stronger source in that exact case.
    eucName,
    eucLocation,
    contactPerson: String(lead?.contactPerson || leadFieldValue(fields, 'contactPerson') || lead?.parse?.contactPerson || '').trim(),
    contactPhone: String(lead?.contactPhone || leadFieldValue(fields, 'contactPhone') || lead?.parse?.contactPhone || '').trim(),
  }
}
