import { createContext } from 'react'

// Portals retain React context even though their CSS host lives under body.
export const PhoneLayoutContext = createContext(null)
