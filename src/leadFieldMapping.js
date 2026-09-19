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
  if (!match) return { eucName: '', eucLocation: '' }
  return {
    eucName: match[1].trim(),
    eucLocation: `${match[2].trim()}, ${match[3].trim()}`,
  }
}

export const splitBuSegment = (fields = []) => {
  const combined = (fields || []).find(item => item.state !== 'rejected' && /^bu\s+(?:and\s+)?segment$/i.test(labelText(item.k)))
  if (!combined?.v) return { bu: leadFieldValue(fields, 'bu'), segment: leadFieldValue(fields, 'segment') }
  const [bu, ...rest] = String(combined.v).split(/\s*\/\s*/)
  return { bu: bu.trim(), segment: rest.join(' / ').trim() }
}

export const leadIdentity = (lead, fields = []) => {
  const inferred = inferEucFromText([
    lead?.subject,
    lead?.body,
    lead?.opportunityScope,
    lead?.ai?.summary,
  ].filter(Boolean).join(' '))
  const extractedEucName = leadFieldValue(fields, 'eucName')
  return {
    sellTo: String(lead?.sellTo || leadFieldValue(fields, 'sellTo') || lead?.parse?.sellTo || '').trim(),
    // Repair the old fallback that copied Contact Person into EUC Name. A
    // confirmed Site/Plant extraction is the stronger source in that exact case.
    eucName: String(
      extractedEucName && lead?.eucName && lead?.contactPerson
        && String(lead.eucName).trim() === String(lead.contactPerson).trim()
        ? extractedEucName
        : lead?.eucName || extractedEucName || lead?.parse?.eucName || inferred.eucName || '',
    ).trim(),
    eucLocation: String(lead?.eucLocation || leadFieldValue(fields, 'eucLocation') || lead?.parse?.eucLocation || inferred.eucLocation || '').trim(),
    contactPerson: String(lead?.contactPerson || leadFieldValue(fields, 'contactPerson') || lead?.parse?.contactPerson || '').trim(),
    contactPhone: String(lead?.contactPhone || leadFieldValue(fields, 'contactPhone') || lead?.parse?.contactPhone || '').trim(),
  }
}
