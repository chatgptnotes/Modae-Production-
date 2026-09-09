// Currency display and conversion helpers. Stored prices retain their source
// currency; INR remains the internal reporting currency.

export const DEFAULT_CURRENCY_RATES = Object.freeze({ INR: 1, EUR: 112, USD: 90 })

export const currencySymbol = currency => ({ INR: '₹', EUR: '€', USD: '$', GBP: '£' }[currency] || currency)

export function normalizedCurrencyRates(rates = {}) {
  const next = { ...DEFAULT_CURRENCY_RATES }
  for (const [currency, value] of Object.entries(rates || {})) {
    const code = String(currency || '').trim().toUpperCase()
    const rate = Number(value)
    if (code && code !== 'INR' && Number.isFinite(rate) && rate > 0) next[code] = rate
  }
  return next
}

export function rateToInr(currency = 'INR', rates = {}) {
  const code = String(currency || 'INR').toUpperCase()
  return normalizedCurrencyRates(rates)[code] || 1
}

export function toInr(amount, currency = 'INR', rates = {}) {
  return (Number(amount) || 0) * rateToInr(currency, rates)
}

export function fromInr(amount, currency = 'INR', rates = {}) {
  return (Number(amount) || 0) / rateToInr(currency, rates)
}

export function convertCurrency(amount, fromCurrency = 'INR', toCurrency = 'INR', rates = {}) {
  return fromInr(toInr(amount, fromCurrency, rates), toCurrency, rates)
}
