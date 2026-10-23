const fieldsAllowed = ['eucLocation', 'sellToCustomerLocation']
const failed = () => ({ status: 'Needs Clarification', standardizedAddress: '', confidence: 'Low', source: '', canApply: false,
  issues: ['Address validation is unavailable. You can keep your address and continue.'] })

// Session memory only: never serialize Google results into lead state or backups.
export function createLeadAddressValidation(request) {
  let account
  const attempts = new Map(), listeners = new Set()
  const emit = () => { for (const listener of listeners) listener() }
  const setAccount = next => {
    if (next === account) return
    for (const item of attempts.values()) for (const controller of item.controllers) controller.abort()
    attempts.clear(); account = next; emit()
  }
  return {
    setAccount,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    read(user, lead, field, value) {
      if (user !== account) return null
      const item = attempts.get(lead)
      const check = item?.fields[field]
      return check?.value === value && Date.now() - check.created <= 30 * 60000 ? check : null
    },
    invalidate(user, lead, field) {
      if (user !== account) return
      const item = attempts.get(lead)
      if (item && !field) { for (const controller of item.controllers) controller.abort(); attempts.delete(lead); emit(); return }
      if (item?.fields[field]) { delete item.fields[field]; emit() }
    },
    start(user, lead, fields, attempt, { preserveOtherFields = false } = {}) {
      if (account === undefined) setAccount(user)
      if (!user || user !== account || !lead || attempts.get(lead)?.attempt === attempt) return
      const previous = attempts.get(lead)
      const input = Object.fromEntries(fieldsAllowed.filter(k => typeof fields[k] === 'string' && fields[k].trim()
        && !(preserveOtherFields && previous?.fields[k]?.pending && previous.fields[k].value === fields[k])).map(k => [k, fields[k]]))
      if (preserveOtherFields && !Object.keys(input).length) return
      if (!preserveOtherFields && previous) for (const controller of previous.controllers) controller.abort()
      const entry = preserveOtherFields && previous ? previous : { fields: {}, controllers: new Set() }
      entry.attempt = attempt
      const pending = Object.fromEntries(Object.entries(input).map(([k, value]) => [k, { value, pending: true, created: Date.now() }]))
      Object.assign(entry.fields, pending)
      const controller = new AbortController()
      entry.controllers.add(controller)
      attempts.set(lead, entry)
      while (attempts.size > 20) { const oldest = attempts.keys().next().value; for (const controller of attempts.get(oldest).controllers) controller.abort(); attempts.delete(oldest) }
      emit()
      if (!Object.keys(input).length) { entry.controllers.delete(controller); return }
      // Do not return the promise: callers must never await this before saving/opening a lead.
      void (async () => {
        let results
        try { results = await request(input, controller.signal) } catch { results = {} }
        entry.controllers.delete(controller)
        if (account !== user || attempts.get(lead) !== entry || controller.signal.aborted) return
        for (const [key, check] of Object.entries(pending)) {
          if (entry.fields[key] === check) entry.fields[key] = { ...check, pending: false, result: results?.[key] || failed() }
        }
        emit()
      })()
    },
  }
}
