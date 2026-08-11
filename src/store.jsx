import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  seedOpportunities, seedFiles, seedPriceLists, seedAdhocParts,
  seedRateSheet, seedCustomers, seedUsers, ROLES, SUBFOLDERS, newProposal,
} from './seed.js'

// v3: schema updated after the Aug 10 meeting review (prob column, Partner Docs
// key, corrected products, costing.usdBase/financeCostK) — bump forces a reseed.
const KEY = 'wintrack-modae-v3'
const StoreCtx = createContext(null)

function initialState() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) {
      const s = JSON.parse(saved)
      // An empty opportunities array is a legitimate state (everything deleted),
      // not a corrupt one — don't silently reseed over the user's data.
      if (s && Array.isArray(s.opportunities) && (s.opportunities.length === 0 || s.opportunities[0].sellTo !== undefined)) {
        // Backfill fields added after the v3 key (users/role) without reseeding.
        if (!Array.isArray(s.users)) s.users = seedUsers
        if (!ROLES[s.role]) s.role = 'SUPER'
        return s
      }
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
    users: seedUsers,
    role: 'SUPER',
  }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(initialState)
  // Ref mirror so read APIs (getProposal) see same-tick mutations, not the render closure.
  const stateRef = useRef(state)
  stateRef.current = state

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

    // Folder-wall delete: removes the opportunity everywhere (tracker row,
    // folder tree, proposal). The real sheet never deletes rows — this exists
    // for cleaning up mistakes/demo data, so callers must confirm first.
    deleteOpportunity(id) {
      setState(s => {
        const { [id]: _f, ...files } = s.files
        const { [id]: _p, ...proposals } = s.proposals
        return { ...s, opportunities: s.opportunities.filter(o => o.id !== id), files, proposals }
      })
    },

    addSubfolder(oppId, name) {
      setState(s => {
        const oppFiles = s.files[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
        if (oppFiles[name]) return s
        return { ...s, files: { ...s.files, [oppId]: { ...oppFiles, [name]: [] } } }
      })
    },

    deleteSubfolder(oppId, name) {
      setState(s => {
        // Materialize the standard subfolders first — otherwise deleting one
        // folder on an opp with no files record wipes all three from view.
        const oppFiles = s.files[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
        const { [name]: _, ...rest } = oppFiles
        return { ...s, files: { ...s.files, [oppId]: rest } }
      })
    },

    deleteFile(oppId, folder, fileName) {
      setState(s => {
        const oppFiles = s.files[oppId] || {}
        return {
          ...s,
          files: {
            ...s.files,
            [oppId]: { ...oppFiles, [folder]: (oppFiles[folder] || []).filter(f => f.name !== fileName) },
          },
        }
      })
    },

    addFile(oppId, folder, file) {
      setState(s => {
        const oppFiles = s.files[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
        // Re-uploading a name overwrites (matches the storage bucket's upsert).
        const rest = (oppFiles[folder] || []).filter(f => f.name !== file.name)
        return {
          ...s,
          files: {
            ...s.files,
            [oppId]: { ...oppFiles, [folder]: [...rest, file] },
          },
        }
      })
    },

    getProposal(oppId) {
      const s = stateRef.current
      if (s.proposals[oppId]) return s.proposals[oppId]
      const opp = s.opportunities.find(o => o.id === oppId)
      return newProposal(oppId, opp)
    },

    saveProposal(oppId, proposal) {
      setState(s => ({ ...s, proposals: { ...s.proposals, [oppId]: proposal } }))
    },

    addAdhocPart(part) {
      setState(s => ({ ...s, adhocParts: [part, ...s.adhocParts] }))
    },

    // New customers land in the master Blue (pending admin verification).
    addCustomer(cust) {
      setState(s => s.customers.some(c => c.name.toLowerCase() === cust.name.toLowerCase())
        ? s
        : { ...s, customers: [...s.customers, cust] })
    },

    setRole(role) {
      setState(s => (ROLES[role] ? { ...s, role } : s))
    },

    addUser(user) {
      setState(s => s.users.some(u => u.email.toLowerCase() === user.email.toLowerCase())
        ? s
        : { ...s, users: [...s.users, user] })
    },

    updateUser(id, patch) {
      setState(s => ({ ...s, users: s.users.map(u => (u.id === id ? { ...u, ...patch } : u)) }))
    },

    // Only used to reject a pending registration — active accounts are
    // suspended, never deleted.
    deleteUser(id) {
      setState(s => ({ ...s, users: s.users.filter(u => u.id !== id) }))
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
