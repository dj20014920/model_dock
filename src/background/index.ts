import Browser from 'webextension-polyfill'
import { ALL_IN_ONE_PAGE_ID } from '~app/consts'
import { getUserConfig } from '~services/user-config'
// import { trackInstallSource } from './source'
import { readTwitterCsrfToken } from './twitter-cookie'

// expose storage.session to content scripts
// using `chrome.*` API because `setAccessLevel` is not supported by `Browser.*` API
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

async function openAppPage() {
  console.log('[EXTENSION] 📱 Opening app page...')
  const tabs = await Browser.tabs.query({})
  const url = Browser.runtime.getURL('app.html')
  const tab = tabs.find((tab) => tab.url?.startsWith(url))
  if (tab) {
    console.log('[EXTENSION] ✅ Found existing app tab:', tab.id)
    await Browser.tabs.update(tab.id, { active: true })
    return
  }
  const { startupPage } = await getUserConfig()
  const hash = startupPage === ALL_IN_ONE_PAGE_ID ? '' : `#/chat/${startupPage}`
  console.log('[EXTENSION] 🆕 Creating new app tab with hash:', hash)
  await Browser.tabs.create({ url: `app.html${hash}` })
}

Browser.action.onClicked.addListener(() => {
  openAppPage()
})

Browser.runtime.onInstalled.addListener((details) => {
  console.log('[EXTENSION] 🚀 Extension installed/updated', {
    reason: details.reason,
    version: Browser.runtime.getManifest().version
  })
  if (details.reason === 'install') {
    Browser.tabs.create({ url: 'app.html#/setting' })
    // install source tracking disabled
  }
})

Browser.commands.onCommand.addListener(async (command) => {
  console.debug(`Command: ${command}`)
  if (command === 'open-app') {
    openAppPage()
  }
})

Browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    console.debug('onMessage', message, sender)
    if (message.target !== 'background') {
      return
    }
    if (message.type === 'read-twitter-csrf-token') {
      return readTwitterCsrfToken(message.data)
    }
  } catch (e) {
    console.error('[BG] onMessage handler error', e)
    // Swallow to avoid "Error in event handler: Uncaught" without details
    return undefined
  }
})

// Background streaming fetch (extension-origin). Used to bypass CORS via host_permissions.
// Port protocol:
//  - client connects with name starting with 'BG_FETCH'
//  - first message: { type: 'BG_FETCH_START', url, options }
//  - background replies:
//      { type: 'BG_FETCH_META', meta: { status, statusText, headers } }
//      { type: 'BG_FETCH_CHUNK', value, done: boolean } ...
//      { type: 'BG_FETCH_ERROR', message } (rare; meta will still be sent with status:0)
Browser.runtime.onConnect.addListener((port) => {
  if (!port.name || !port.name.startsWith('BG_FETCH')) return
  let aborted = false
  let controller: AbortController | null = null

  const headersToObject = (headers: Headers | undefined) => {
    const obj: Record<string, string> = {}
    try {
      if (headers) {
        for (const [k, v] of headers.entries()) obj[k] = v
      }
    } catch {}
    return obj
  }

  const onMessage = async (msg: any) => {
    if (!msg || msg.type !== 'BG_FETCH_START') return
    controller = new AbortController()
    const { url, options } = msg as { url: string; options?: RequestInit }
    try {
      const resp = await fetch(url, {
        ...(options || {}),
        credentials: 'include',
        signal: controller.signal,
      })
      port.postMessage({
        type: 'BG_FETCH_META',
        meta: {
          status: resp.status,
          statusText: resp.statusText,
          headers: headersToObject(resp.headers),
        },
      })
      if (!resp.body) {
        const text = await resp.text().catch(() => '')
        port.postMessage({ type: 'BG_FETCH_CHUNK', value: text, done: true })
        try { port.disconnect() } catch {}
        return
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          port.postMessage({ type: 'BG_FETCH_CHUNK', done: true })
          break
        }
        port.postMessage({ type: 'BG_FETCH_CHUNK', value: decoder.decode(value), done: false })
      }
      try { port.disconnect() } catch {}
    } catch (e: any) {
      // Ensure client resolves Response: send a synthetic META when fetch failed early
      try {
        port.postMessage({
          type: 'BG_FETCH_META',
          meta: { status: 0, statusText: '', headers: {} },
        })
      } catch {}
      try {
        port.postMessage({ type: 'BG_FETCH_CHUNK', value: String(e?.message || e), done: true })
      } catch {}
      try { port.postMessage({ type: 'BG_FETCH_ERROR', message: String(e?.message || e) }) } catch {}
      try { port.disconnect() } catch {}
    }
  }

  port.onMessage.addListener(onMessage)
  port.onDisconnect.addListener(() => {
    if (aborted) return
    aborted = true
    try { controller?.abort() } catch {}
    try { port.onMessage.removeListener(onMessage) } catch {}
  })
})
