import { ofetch } from 'ofetch'

const plausibleApiHost = import.meta.env.VITE_PLAUSIBLE_API_HOST || 'https://plausible.io'

async function trackEvent(name: string, props: object) {
  await ofetch(`${plausibleApiHost}/api/event`, {
    method: 'POST',
    body: {
      domain: 'chathub.gg',
      name,
      url: location.href,
      props,
    },
    mode: 'no-cors',
  })
}

export async function trackInstallSource() {
  // disabled – do not call remote API in this fork
  trackEvent('install', { source: 'local', language: navigator.language })
}
