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
      // 헤더 구성: 모드에 따라 최소/브라우저스러운 헤더 적용
      const headers = new Headers(options?.headers || {})
      let headerMode: 'minimal' | 'browserlike' = 'browserlike'
      try {
        const cfg = await getUserConfig()
        headerMode = (cfg as any).chatgptWebappHeaderMode || 'browserlike'
      } catch {}
      
      // 필수 헤더: 실제 브라우저처럼 보이게
      if (headerMode === 'browserlike') {
        if (!headers.has('User-Agent')) {
          try { headers.set('User-Agent', navigator.userAgent) } catch {}
        }
        if (!headers.has('Accept')) {
          // SSE 요청인 경우 text/event-stream, 일반 요청은 JSON
          if (url.includes('/conversation')) {
            headers.set('Accept', 'text/event-stream')
          } else {
            headers.set('Accept', 'application/json, text/plain, */*')
          }
        }
        if (!headers.has('Accept-Language')) {
          headers.set('Accept-Language', navigator.language || 'en-US,en;q=0.9')
        }
        if (!headers.has('Accept-Encoding')) {
          headers.set('Accept-Encoding', 'gzip, deflate, br')
        }
        if (!headers.has('Origin')) {
          headers.set('Origin', 'https://chatgpt.com')
        }
        if (!headers.has('Referer')) {
          headers.set('Referer', 'https://chatgpt.com/')
        }
        if (!headers.has('Sec-Fetch-Dest')) {
          headers.set('Sec-Fetch-Dest', 'empty')
        }
        if (!headers.has('Sec-Fetch-Mode')) {
          headers.set('Sec-Fetch-Mode', 'cors')
        }
        if (!headers.has('Sec-Fetch-Site')) {
          headers.set('Sec-Fetch-Site', 'same-origin')
        }
        // UA-CH client hints (best-effort)
        try {
          const uaData: any = (navigator as any).userAgentData
          if (uaData && Array.isArray(uaData.brands)) {
            const brands = uaData.brands.map((b: any) => `"${b.brand}";v="${b.version}"`).join(', ')
            if (!headers.has('Sec-CH-UA')) headers.set('Sec-CH-UA', brands)
          }
          if (uaData && typeof uaData.mobile === 'boolean' && !headers.has('Sec-CH-UA-Mobile')) {
            headers.set('Sec-CH-UA-Mobile', uaData.mobile ? '?1' : '?0')
          }
          if (uaData && uaData.platform && !headers.has('Sec-CH-UA-Platform')) {
            headers.set('Sec-CH-UA-Platform', `"${uaData.platform}"`)
          }
        } catch {}
      }

      
      const resp = await fetch(url, {
        ...(options || {}),
        headers,
        credentials: 'include', // ✅ 쿠키 포함 필수
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
