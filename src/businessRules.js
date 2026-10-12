// Safe, editable rules; defaults preserve the existing registration and health model.
export const REGISTRATION_FIELDS = [
  ['sellTo', 'Sell-to customer'], ['sellToCustomerLocation', 'Sell-to customer location'],
  ['eucName', 'EUC Name'], ['eucLocation', 'EUC Location'],
  ['contactPerson', 'Contact Person'], ['contactPhone', 'Contact Phone'],
]
export const DEFAULT_HEALTH_SCORE = {
  classBase: { Green: 82, Blue: 60, Amber: 48, Red: 22 },
  kycValid: 6, kycRenewal: -6, kycMissing: -12,
  paymentOverdue: -22, paymentOnTime: 8, payment90: -10, payment60: -4,
  closedWeight: 20, idlePenalty: -8, healthyAt: 70, watchAt: 45,
}
export const registrationFields = config => REGISTRATION_FIELDS.filter(([key]) =>
  key === 'sellTo' || !Array.isArray(config?.registrationRequiredFields) || config.registrationRequiredFields.includes(key))
export const healthScoreRules = config => ({
  ...DEFAULT_HEALTH_SCORE, ...config?.healthScore,
  classBase: { ...DEFAULT_HEALTH_SCORE.classBase, ...config?.healthScore?.classBase },
})
export function validateBusinessRules(config = {}) {
  const errors = []
  const fields = config.registrationRequiredFields
  if (fields !== undefined && (!Array.isArray(fields) || !fields.includes('sellTo')
    || fields.some(key => !REGISTRATION_FIELDS.some(([id]) => id === key))
    || new Set(fields).size !== fields.length)) errors.push('Required fields must use supported fields and include Sell-to customer.')
  const rules = healthScoreRules(config)
  for (const [key, value] of Object.entries(rules)) {
    if (key === 'classBase') continue
    if (!Object.hasOwn(DEFAULT_HEALTH_SCORE, key) || typeof value !== 'number' || !Number.isFinite(value) || value < -100 || value > 100) errors.push(`${key}: enter a number between -100 and 100.`)
  }
  for (const [key, value] of Object.entries(rules.classBase)) {
    if (!Object.hasOwn(DEFAULT_HEALTH_SCORE.classBase, key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) errors.push(`${key}: starting health score must be between 0 and 100.`)
  }
  if (rules.watchAt < 0 || rules.healthyAt <= rules.watchAt || rules.healthyAt > 100) errors.push('Healthy threshold must be above Watch, within 0–100.')
  if (rules.closedWeight < 0) errors.push('Win/loss influence cannot be negative.')
  return errors
}
