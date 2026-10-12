// A small query adapter for existing revision-aware datastore helpers. The server
// accepts only the operations below; it never accepts arbitrary SQL or RPC names.
export function createWorkspaceDataClient(client, getGeneration = () => '', fetcher = fetch) {
  if (!client) return null
  const request = async payload => {
    const { data } = await client.auth.getSession()
    if (!data?.session?.access_token) return { data: null, error: { message: 'Sign in before accessing workspace data.', code: '42501' } }
    const response = await fetcher('/api/workspace/data', { method: 'POST', headers: {
      Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json',
      'x-workspace-generation': getGeneration(),
    }, body: JSON.stringify(payload) })
    const body = await response.json()
    return response.ok ? body : { data: null, error: { ...body, message: body.error || 'Workspace data request failed.', code: body.code || String(response.status) } }
  }
  let pendingReads = []
  let readTimer = null
  const flushReads = async () => {
    const pending = pendingReads
    pendingReads = []
    readTimer = null
    for (let offset = 0; offset < pending.length; offset += 20) {
      const batch = pending.slice(offset, offset + 20)
      try {
        const result = await request(batch.length === 1 ? batch[0].payload : {
          operation: 'select_many', queries: batch.map(item => item.payload),
        })
        if (batch.length > 1 && !result.error && result.results?.length !== batch.length) throw new Error('Incomplete workspace read response.')
        batch.forEach((item, index) => item.resolve(batch.length === 1 || result.error ? result : result.results[index]))
      } catch (error) { batch.forEach(item => item.reject(error)) }
    }
  }
  // Group independent reads started in the same turn. Results and permissions
  // are never retained across requests; revision-aware writes remain separate.
  const read = payload => new Promise((resolve, reject) => {
    pendingReads.push({ payload, resolve, reject })
    if (readTimer === null) readTimer = setTimeout(flushReads, 0)
  })
  return {
    auth: client.auth,
    rpc: (name, args) => request({ operation: 'rpc', name, args }),
    from(table) {
      const payload = { operation: 'select', table, filters: [] }
      const query = {
        select(columns, options = {}) { payload.columns = columns; payload.options = options; return query },
        eq(column, value) { payload.filters.push(['eq', column, value]); return query },
        is(column, value) { payload.filters.push(['is', column, value]); return query },
        in(column, value) { payload.filters.push(['in', column, value]); return query },
        delete() { payload.operation = 'delete'; return query },
        maybeSingle() { payload.single = true; return query },
        then(resolve, reject) { return (payload.operation === 'select' ? read(payload) : request(payload)).then(resolve, reject) },
      }
      return query
    },
  }
}
