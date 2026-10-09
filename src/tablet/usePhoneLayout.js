import { useContext, useEffect, useState } from 'react'
import { PhoneLayoutContext } from './PhoneLayoutContext.jsx'

export default function usePhoneLayout() {
  const layout = useContext(PhoneLayoutContext)
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)')
    const update = () => setPhone(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return layout ?? phone
}
