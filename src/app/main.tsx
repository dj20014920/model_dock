import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import '../services/sentry'
import './base.scss'
import './i18n'
import { plausible } from './plausible'
import { router } from './router'

// Surface hidden errors in event handlers/unhandled promises
window.addEventListener('error', (e) => {
  try {
    // Avoid noisy logs when extension reloads
    console.error('[APP] window.error', e?.error || e?.message || e)
  } catch {}
})
window.addEventListener('unhandledrejection', (e) => {
  try {
    console.error('[APP] unhandledrejection', e?.reason || e)
  } catch {}
})

const container = document.getElementById('app')!
const root = createRoot(container)
root.render(<RouterProvider router={router} />)

plausible.enableAutoPageviews()
