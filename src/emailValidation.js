export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const splitRecipients = value => String(value || '').split(',').map(s => s.trim()).filter(Boolean)
export const recipientsValid = value => {
  const list = splitRecipients(value)
  return list.length > 0 && list.every(a => EMAIL_RE.test(a))
}
