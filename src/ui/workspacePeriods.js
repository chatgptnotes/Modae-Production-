// April–March financial quarters, evaluated on the workspace's IST day.
export function currentFiscalQuarter(now = new Date()) {
  const month = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', month: 'numeric' }).format(now))
  return `q${Math.floor(((month + 8) % 12) / 3) + 1}`
}
