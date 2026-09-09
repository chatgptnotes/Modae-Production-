const safeDownloadName = value => String(value || 'document').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')
const INDIA_KYC_FORM_URL = new URL('../modae doc/Sample Docs/Sample Docs/KYC FORM TEMPLATE-India.docx', import.meta.url).href

export function downloadKycTemplate(customerName, recordId, itemName, configuredTemplate = null) {
  const link = document.createElement('a')
  link.href = configuredTemplate?.url || INDIA_KYC_FORM_URL
  const extension = configuredTemplate?.name?.match(/\.[^.]+$/)?.[0] || '.docx'
  const baseName = configuredTemplate?.name?.replace(/\.[^.]+$/, '') || 'KYC_FORM_TEMPLATE-India'
  link.download = `${safeDownloadName(customerName)}_${safeDownloadName(itemName || recordId)}_${safeDownloadName(baseName)}${extension}`
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
