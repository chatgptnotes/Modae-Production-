import { useEffect } from 'react'
import usePhoneLayout from './usePhoneLayout.js'

// Keep full-screen phone dialogs inside the visible area above the keyboard.
export default function usePhoneDialogViewport(selector, open = true) {
  const phone = usePhoneLayout()
  useEffect(() => {
    if (!phone || !open || !window.visualViewport) return undefined
    const viewport = window.visualViewport
    const modal = document.querySelector(selector)
    const resize = () => {
      modal?.style.setProperty('--phone-dialog-height', `${viewport.height}px`)
      modal?.style.setProperty('--phone-dialog-top', `${viewport.offsetTop}px`)
    }
    resize()
    viewport.addEventListener('resize', resize)
    viewport.addEventListener('scroll', resize)
    return () => {
      viewport.removeEventListener('resize', resize)
      viewport.removeEventListener('scroll', resize)
      modal?.style.removeProperty('--phone-dialog-height')
      modal?.style.removeProperty('--phone-dialog-top')
    }
  }, [phone, open, selector])
}
