// Shared by the preference API and interface so supported IDs stay in sync.
export const FONT_CHOICES = Object.freeze([
  { id: 'candara', label: 'Candara', face: 'WinTrack Candara', family: '"WinTrack Candara", Candara, "Segoe UI", system-ui, sans-serif' },
  { id: 'inter', label: 'Inter', face: 'WinTrack Inter', family: '"WinTrack Inter", Inter, system-ui, sans-serif' },
  { id: 'roboto', label: 'Roboto', face: 'WinTrack Roboto', family: '"WinTrack Roboto", system-ui, sans-serif' },
  { id: 'open-sans', label: 'Open Sans', face: 'WinTrack Open Sans', family: '"WinTrack Open Sans", "WinTrack Roboto", system-ui, sans-serif' },
  { id: 'merriweather', label: 'Merriweather', face: 'WinTrack Merriweather', family: '"WinTrack Merriweather", Georgia, serif' },
  { id: 'lora', label: 'Lora', face: 'WinTrack Lora', family: '"WinTrack Lora", "WinTrack Merriweather", Georgia, serif' },
  { id: 'system', label: 'System default', family: 'system-ui, sans-serif' },
])
export const validFont = value => FONT_CHOICES.some(font => font.id === value)
