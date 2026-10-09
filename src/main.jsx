import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { StoreProvider } from './store.jsx'
import { FormulaBarProvider } from './formulabar.jsx'
import { DrawerProvider } from './drawer.jsx'
import { registerSW } from './pwa.js'
import { deploymentNeedsReset, resetAndReload, watchDeployment } from './deployment.js'
import './styles.css'
import './ui/workspaceHeadings.css'
import './tablet/phoneDarkTheme.css'
import './tablet/phonePageConsistency.css'

async function boot() {
  if (deploymentNeedsReset()) {
    await resetAndReload()
    return
  }
  registerSW()
  watchDeployment()

// Migrate links created by the previous hash-routing implementation. A route
// hash starts with "#/"; ordinary in-page anchors such as "#forecast-details"
// are intentionally left alone.
const legacyRoute = window.location.hash.match(/^#(\/.*)$/)?.[1]
if (legacyRoute) window.history.replaceState(null, '', legacyRoute)

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <StoreProvider>
            <FormulaBarProvider>
              <DrawerProvider>
                <App />
              </DrawerProvider>
            </FormulaBarProvider>
          </StoreProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>,
  )
}

void boot()
