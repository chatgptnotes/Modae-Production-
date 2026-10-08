import { useEffect, useState } from 'react'

export default function usePhoneLayout() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)')
    const update = () => setPhone(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return phone
}
