// Scheduled lead deadline processor.
// Deploy with: supabase functions deploy lead-deadlines --no-verify-jwt
// Invoke from Supabase Cron or an external scheduler with the function secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const client = createClient(url, serviceKey)

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

const getSlice = async (key: string, fallback: any) => {
  const { data, error } = await client.from('records').select('data').eq('entity', 'state').eq('id', key).is('deleted_at', null).maybeSingle()
  if (error) throw error
  return data?.data ?? fallback
}

const saveSlice = async (key: string, value: unknown) => {
  const { error } = await client.from('records').upsert({ entity: 'state', id: key, data: value, updated_at: new Date().toISOString() })
  if (error) throw error
}

const due = (lead: any, cfg: any, now: number) => {
  const base = new Date(lead.deadlineStartedAt || lead.ts || now).getTime()
  const checks = [
    ['kyc', lead.customerStatus === 'Blue' && !lead.kycCompletedAt, cfg.kycDays, 'KYC documents not received'],
    ['amberFee', lead.customerStatus === 'Amber' && lead.amberFeePaid !== true, cfg.amberFeeDays, 'Amber processing fee not received'],
    ['clarification', (lead.ai?.missing || []).length > 0 && !lead.clarificationCompletedAt, cfg.clarificationDays, 'Required clarification not received'],
  ]
  return checks.find(([, active, days]) => active && base + Number(days || 7) * 86400000 <= now)
}

Deno.serve(async req => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  try {
    const [leads, config, archive, deadlines, audit] = await Promise.all([
      getSlice('leads', []), getSlice('config', {}), getSlice('leadArchive', []),
      getSlice('leadDeadlines', []), getSlice('audit', []),
    ])
    const now = Date.now()
    const rules = { kycDays: 7, amberFeeDays: 7, clarificationDays: 7, ...(config.leadDeadlines || {}) }
    const nextLeads = [...leads]
    const nextArchive = [...archive]
    const nextDeadlines = [...deadlines]
    const changed = []
    for (const lead of leads) {
      if (['Dropped', 'Converted'].includes(lead.status)) continue
      const hit = due(lead, rules, now)
      if (!hit) continue
      const [type, , days, reason] = hit
      const key = `${lead.id}:${type}`
      if (nextDeadlines.some(row => row.key === key && row.status === 'Expired')) continue
      const updated = { ...lead, status: 'Dropped', droppedReason: `${reason} after ${Number(days || 7)} days`, expiredDeadline: type }
      const index = nextLeads.findIndex(row => row.id === lead.id)
      if (index >= 0) nextLeads[index] = updated
      nextArchive.unshift({ ...updated, archivedAt: new Date(now).toISOString(), archiveReason: updated.droppedReason })
      nextDeadlines.push({ key, leadId: lead.id, type, dueAt: new Date(new Date(lead.deadlineStartedAt || lead.ts).getTime() + Number(days || 7) * 86400000).toISOString(), status: 'Expired', expiredAt: new Date(now).toISOString() })
      changed.push(lead.id)
    }
    if (changed.length) {
      const entry = { ts: new Date(now).toISOString(), role: 'SYSTEM', action: 'Lead deadlines processed', objectId: changed.join(','), detail: `${changed.length} lead(s) discarded` }
      await Promise.all([
        saveSlice('leads', nextLeads), saveSlice('leadArchive', nextArchive),
        saveSlice('leadDeadlines', nextDeadlines), saveSlice('audit', [entry, ...audit].slice(0, 500)),
      ])
    }
    return json({ ok: true, discarded: changed })
  } catch (error) {
    return json({ ok: false, error: error?.message || String(error) }, 500)
  }
})
