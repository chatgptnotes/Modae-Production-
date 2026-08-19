const enc = new TextEncoder()
const dec = new TextDecoder()

const bytesToB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const b64ToBytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))

async function keyFromSecret(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptAiSecret(value: string, serverSecret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFromSecret(serverSecret)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(value))
  return { ciphertext: bytesToB64(new Uint8Array(cipher)), iv: bytesToB64(iv) }
}

export async function decryptAiSecret(ciphertext: string, iv: string, serverSecret: string) {
  const key = await keyFromSecret(serverSecret)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(iv) }, key, b64ToBytes(ciphertext))
  return dec.decode(plain)
}
