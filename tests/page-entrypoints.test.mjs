import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const routeFiles = source => [...source.matchAll(/(?:import\(['"]|from\s+['"])((?:\.\.\/|\.\/)(?:pages|tablet)\/[^'"]+\.jsx)['"]\)?/g)]
  .map(match => match[1].replace(/^\.\.\//, 'src/').replace(/^\.\//, 'src/'))

const desktopRoutes = routeFiles(read('src/App.jsx'))
const tabletRoutes = routeFiles(read('src/tablet/TabletApp.jsx'))
const allRoutes = [...new Set([...desktopRoutes, ...tabletRoutes])]

const reactHooks = [
  'useCallback', 'useContext', 'useDeferredValue', 'useEffect', 'useId',
  'useImperativeHandle', 'useLayoutEffect', 'useMemo', 'useReducer', 'useRef',
  'useState', 'useSyncExternalStore', 'useTransition',
]
const routerHooks = ['useLocation', 'useMatch', 'useNavigate', 'useParams', 'useSearchParams']

const importedNames = (source, moduleName) => {
  const names = new Set()
  const importPattern = new RegExp(`import\\s+(?:[^'\\n]+?\\s+from\\s+)?['"]${moduleName.replace('/', '\\/')}['"]`, 'g')
  for (const match of source.matchAll(importPattern)) {
    const clause = match[0].replace(/^[\s\S]*?import\s+/, '').replace(/\s+from\s+['"][^'"]+['"]$/, '').trim()
    if (clause.startsWith('{')) {
      clause.slice(1, -1).split(',').forEach(part => names.add(part.trim().split(/\s+as\s+/)[0]))
    } else if (clause) {
      const named = clause.match(/\{([\s\S]*)\}/)
      if (named) named[1].split(',').forEach(part => names.add(part.trim().split(/\s+as\s+/)[0]))
    }
  }
  return names
}

const bareCalls = (source, name) => new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(source)

test('desktop and tablet route entrypoints exist', () => {
  assert.ok(desktopRoutes.length > 0)
  assert.ok(tabletRoutes.length > 0)
  for (const file of allRoutes) assert.equal(fs.existsSync(path.join(root, file)), true, file)
})

test('route entrypoints import every React hook they call', () => {
  const failures = []
  for (const file of allRoutes) {
    const source = read(file)
    const imported = importedNames(source, 'react')
    for (const hook of reactHooks) {
      if (bareCalls(source, hook) && !imported.has(hook) && !new RegExp(`React\\.${hook}\\s*\\(`).test(source)) {
        failures.push(`${file}: missing React import for ${hook}`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('route entrypoints import every router hook they call', () => {
  const failures = []
  for (const file of allRoutes) {
    const source = read(file)
    const imported = importedNames(source, 'react-router-dom')
    for (const hook of routerHooks) {
      if (bareCalls(source, hook) && !imported.has(hook)) failures.push(`${file}: missing router import for ${hook}`)
    }
  }
  assert.deepEqual(failures, [])
})

test('runtime route sources do not reference the retired theme module', () => {
  const failures = allRoutes.filter(file => /theme\.jsx|useTheme|ThemeToggle/.test(read(file)))
  assert.deepEqual(failures, [])
})
