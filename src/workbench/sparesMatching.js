// Generic catalogue words are useful for search, but are not evidence that
// two industrial parts are interchangeable.
export const MATCH_STOPWORDS = new Set(['and', 'the', 'for', 'with', 'w', 'a', 'of', 'to'])
export const GENERIC_PRODUCT_WORDS = new Set([
  'card', 'module', 'unit', 'assembly', 'system', 'monitor', 'monitoring',
  'part', 'spare', 'replacement', 'kit', 'set', 'type', 'version',
])

export const wordsOf = text => String(text || '').toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(word => word.length > 2 && !MATCH_STOPWORDS.has(word))

const meaningfulWordsOf = text => wordsOf(text).filter(word => !GENERIC_PRODUCT_WORDS.has(word))
const isSpecificIdentifier = word => /\d/.test(word) && word.length >= 3

export function descriptionMatch(targetDescription, candidateDescription) {
  const target = new Set(meaningfulWordsOf(targetDescription))
  const candidate = new Set(meaningfulWordsOf(candidateDescription))
  if (!target.size || !candidate.size) return null

  const overlap = [...candidate].filter(word => target.has(word))
  const hasSpecificIdentifier = overlap.some(isSpecificIdentifier)
  if (overlap.length < 2 && !hasSpecificIdentifier) return null

  const score = overlap.length / Math.max(target.size, candidate.size)
  if (!hasSpecificIdentifier && score <= 0.5) return null
  return {
    words: overlap.slice(0, 4),
    confidence: Math.round(Math.min(95, Math.max(hasSpecificIdentifier ? 70 : 0, score * 100))),
  }
}

export const familyOf = pn => String(pn || '').split(/[./]/)[0]
