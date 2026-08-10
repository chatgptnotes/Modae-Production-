import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  seedOpportunities, seedFiles, seedPriceLists, seedAdhocParts,
  seedRateSheet, seedCustomers, SUBFOLDERS, newProposal,
} from './seed.js'

const KEY = 'wintrack-modae-v2'
const StoreCtx = createContext(null)

function initialState() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) {
      const s = JSON.parse(saved)
      if (s && Array.isArray(s.opportunities) && s.opportunities[0]?.sellTo !== undefined) return s
    }
  } catch { /* fall through to seed */ }
  return {
    opportunities: seedOpportunities,
    files: seedFiles,
    priceLists: seedPriceLists,
    adhocParts: seedAdhocParts,
    rateSheet: seedRateSheet,
    customers: seedCustomers,
    proposals: {},
  }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(initialState)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])

  const api = {
    ...state,

    addOpportunity(opp) {
      setState(s => ({
        ...s,
        opportunities: [...s.opportunities, opp],
        files: { ...s.files, [opp.id]: Object.fromEntries(SUBFOLDERS.map(f => [f, []])) },
      }))
    },

    updateOpportunity(id, patch) {
      const today = new Date().toISOString().slice(0, 10)
      setState(s => ({
        ...s,
        opportunities: s.opportunities.map(o =>
          o.id === id ? { ...o, ...patch, lastUpdated: today } : o),
      }))
    },

    addFile(oppId, folder, file) {
      setState(s => {
        const oppFiles = s.files[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
        return {
          ...s,
          files: {
            ...s.files,
            [oppId]: { ...oppFiles, [folder]: [...(oppFiles[folder] || []), file] },
          },
        }
      })
    },

    getProposal(oppId) {
      if (state.proposals[oppId]) return state.proposals[oppId]
      const opp = state.opportunities.find(o => o.id === oppId)
      return newProposal(oppId, opp)
    },

    saveProposal(oppId, proposal) {
      setState(s => ({ ...s, proposals: { ...s.proposals, [oppId]: proposal } }))
    },

    addAdhocPart(part) {
      setState(s => ({ ...s, adhocParts: [part, ...s.adhocParts] }))
    },

    resetDemo() {
      localStorage.removeItem(KEY)
      window.location.reload()
    },
  }

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>
}

export const useStore = () => useContext(StoreCtx)

// Opp ID = YYMM + 3-digit running sequence + owner initials (e.g. 2608222RS),
// per the Sales Pipeline Report sheet.
export function nextOppId(opportunities, owner) {
  const now = new Date()
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0')
  const seqs = opportunities
    .map(o => parseInt(String(o.id).slice(4, 7), 10))
    .filter(n => !isNaN(n))
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1
  return `${yymm}${String(next).padStart(3, '0')}${owner}`
}
