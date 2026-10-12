// Reservations are minted only for the authenticated actor by the server RPC.
// Call for genuinely new opportunity rows, never existing rows or reviewed imports.
export async function assertReservedOpportunityIds(client, ids, authId) {
  const unique = [...new Set((ids || []).map(id => String(id || '')))]
  if (!unique.length) return
  const forbidden = () => { throw Object.assign(new Error('Reserve each new opportunity number from this signed-in session before saving.'), { status: 403 }) }
  if (!authId || unique.some(id => !id || id !== id.trim())) forbidden()
  // Bound PostgREST URL size and response limits without relaxing all-or-nothing validation.
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100)
    const { data, error } = await client.from('settings').select('id,data')
      .in('id', batch.map(id => `opportunity_reserved_${id}`)).is('deleted_at', null)
    if (error) throw error
    const found = new Map((data || []).map(row => [row.id, row.data]))
    if (batch.some(id => {
      const reservation = found.get(`opportunity_reserved_${id}`)
      return reservation?.id !== id || reservation?.actor !== authId
    })) forbidden()
  }
}
