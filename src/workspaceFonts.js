import { FONT_CHOICES } from './fontChoices.js'

const timeoutAfter = (promise, milliseconds = 8000) => {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Font loading timed out.')), milliseconds) })]).finally(() => clearTimeout(timer))
}
export async function fontAvailable(font, fonts = globalThis.document?.fonts) {
  if (font === 'system') return true
  const choice = FONT_CHOICES.find(choice => choice.id === font)
  if (!fonts || !choice?.face) return false
  try { return (await timeoutAfter(fonts.load(`16px "${choice.face}"`, 'ModAE Sales ₹ 0123456789'))).length > 0 }
  catch { return false }
}
export async function requireDocumentFont(fonts = globalThis.document?.fonts) {
  if (!fonts) throw new Error('Candara could not be checked. Use a supported browser to print this proposal.')
  try {
    const faces = await timeoutAfter(Promise.all(['normal 400', 'normal 700', 'italic 400', 'italic 700']
      .map(face => fonts.load(`${face} 16px "WinTrack Candara"`, 'ModAE Sales 0123456789'))))
    if (faces.some(face => !face.length)) throw new Error('Missing Candara face')
    await timeoutAfter(fonts.ready)
  } catch {
    throw new Error('Candara is unavailable or could not load. This proposal has not been printed. Ask your administrator to provide the company font, then retry.')
  }
}
