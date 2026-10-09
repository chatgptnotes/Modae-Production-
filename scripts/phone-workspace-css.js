import postcss from 'postcss'

// Reuse the app's responsive rules inside an explicitly selected phone-sized
// workspace. Ordinary viewport layouts and print rules keep their behavior.
export default function phoneWorkspaceCss() {
  return {
    postcssPlugin: 'modae-phone-workspace',
    Once(root) {
      const mediaRules = []
      root.walkAtRules('media', rule => mediaRules.push(rule))
      for (const media of mediaRules) {
        if (/\bprint\b/.test(media.params) || !/\((?:min-|max-)?width\s*:/.test(media.params)) continue
        const variants = media.params.split(',').map(value => value.trim())
        // A mixed width/non-width OR query cannot be gated as a single rule.
        if (variants.some(value => /^not\b/.test(value) || !/\((?:min-|max-)?width\s*:/.test(value))) continue
        for (const variant of variants) {
          const widths = variant.match(/\((?:min-|max-)?width\s*:[^)]+\)/g)
          const mediaType = variant.match(/^(?:only\s+)?(?:screen|all)\b/)?.[0]
          const remaining = [mediaType, ...(variant.match(/\([^()]+\)/g) || []).filter(condition => !/^\((?:min-|max-)?width\s*:/.test(condition))].filter(Boolean).join(' and ')
          const container = postcss.atRule({ name: 'container', params: `phone-workspace ${widths.join(' and ')}` })
          for (const node of media.nodes) container.append(node.clone())
          container.walkDecls(decl => { decl.value = decl.value.replace(/(-?[\d.]+)vw\b/g, '$1cqw') })
          if (remaining) {
            const conditions = postcss.atRule({ name: 'media', params: remaining })
            conditions.append(container)
            media.before(conditions)
          } else media.before(container)
        }
        // On a wide display, desktop viewport rules must not override the
        // phone container. :where keeps the existing selector specificity.
        media.walkRules(rule => {
          if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
          rule.selectors = rule.selectors.map(selector => /^(html|:root)(?=[\s.#[:>+~]|$)/.test(selector)
            ? selector.replace(/^(html|:root)/, '$1:where(:not([data-phone-mode]))')
            : `:where(html:not([data-phone-mode])) ${selector}`)
        })
      }
    },
  }
}
