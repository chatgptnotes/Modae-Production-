import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { StoreProvider } from './store.jsx'
import { FormulaBarProvider } from './formulabar.jsx'
import { DrawerProvider } from './drawer.jsx'
import { registerSW } from './pwa.js'
import './styles.css'

registerSW()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <FormulaBarProvider>
          <DrawerProvider>
            <App />
          </DrawerProvider>
        </FormulaBarProvider>
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>,
)
