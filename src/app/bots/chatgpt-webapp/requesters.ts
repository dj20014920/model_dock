import Browser, { Runtime } from 'webextension-polyfill'
import { CHATGPT_HOME_URL } from '~app/consts'
import { backgroundFetch, proxyFetch } from '~services/proxy-fetch'
import { RequestInitSubset } from '~types/messaging'
import { getUserConfig } from '~services/user-config'
import { requestHostPermissions } from '~app/utils/permissions'

export interface Requester {
  fetch(url: string, options?: RequestInitSubset): Promise<Response>
}

class GlobalFetchRequester implements Requester {
  fetch(url: string, options?: RequestInitSubset) {
    return fetch(url, options)
  }
}

class ProxyFetchRequester implements Requester {
  async findExistingProxyTab() {
    // 핀 탭으로 제한하지 않고, 전체 탭 중에서 대상 호스트를 우선 탐색
    const tabs = await Browser.tabs.query({})
    const results: (string | undefined)[] = await Promise.all(
      tabs.map(async (tab) => {
        if (tab.url) {
          return tab.url
        }
        return Browser.tabs.sendMessage(tab.id!, 'url').catch(() => undefined)
      }),
    )
    const hosts = ['https://chat.openai.com', 'https://chatgpt.com']
    for (let i = 0; i < results.length; i++) {
      const u = results[i]
      if (!u) continue
      if (hosts.some((h) => u.startsWith(h))) return tabs[i]
    }
  }

  waitForProxyTabReady(): Promise<Browser.Tabs.Tab> {
    return new Promise((resolve, reject) => {
      let resolved = false
      const listener = async function (message: any, sender: Runtime.MessageSender) {
        if (message.event === 'PROXY_TAB_READY' && sender.tab) {
          console.log('[GPT-PROXY] ✅ PROXY_TAB_READY signal received from tab', sender.tab.id)
          cleanup()
          resolved = true
          resolve(sender.tab!)
          return true
        }
      }
      const cleanup = () => {
        try { Browser.runtime.onMessage.removeListener(listener) } catch {}
        try { clearTimeout(timer) } catch {}
        try { clearInterval(poll) } catch {}
      }
      const poll = setInterval(async () => {
        const tab = await this.findExistingProxyTab().catch(() => undefined as any)
        if (!tab || resolved) return
        try {
          const url = await Browser.tabs.sendMessage(tab.id!, 'url')
          if (typeof url === 'string' && ['https://chat.openai.com', 'https://chatgpt.com'].some(h => url.startsWith(h))) {
            console.log('[GPT-PROXY] ✅ Content script responded, tab ready', tab.id)
            cleanup(); resolved = true; resolve(tab)
          }
        } catch {
          // content-script 미주입 → 계속 대기
        }
      }, 500)
      const timer = setTimeout(() => {
        cleanup()
        if (!resolved) {
          console.error('[GPT-PROXY] ❌ Timeout waiting for ChatGPT tab (30s)')
          reject(new Error('Timeout waiting for ChatGPT tab'))
        }
      }, 30 * 1000) // 15초 → 30초로 증가
      Browser.runtime.onMessage.addListener(listener)
    })
  }

  async createProxyTab() {
    console.log('[GPT-PROXY] 🆕 Creating new ChatGPT tab (unpinned, inactive)...')
    try {
      // 동일 출처 통신을 위해 사이트 접근 권한을 먼저 확보
      await requestHostPermissions(['https://chatgpt.com/*', 'https://chat.openai.com/*']).catch(() => false)
    } catch {}
    const readyPromise = this.waitForProxyTabReady()
    // 활성화하지 않고 일반 탭으로 생성 (핀 해제)
    await Browser.tabs.create({ url: CHATGPT_HOME_URL, active: false })
    console.log('[GPT-PROXY] ⏳ Waiting for tab to be ready...')
    return readyPromise
  }

  async getProxyTab() {
    console.log('[GPT-PROXY] 🔍 Looking for existing proxy tab...')
    const tab = await this.findExistingProxyTab()
    if (!tab) {
      // 설정에 따라 자동 생성 허용 (기본: 허용)
      let reuseOnly = false
      try {
        const cfg = await getUserConfig()
        reuseOnly = (cfg as any).chatgptWebappReuseOnly === true
      } catch {}
      if (reuseOnly) {
        console.log('[GPT-PROXY] 🚫 No existing tab; creation disabled by setting (reuseOnly=true)')
        throw new Error('NO_PROXY_TAB_AVAILABLE')
      }
      const created = await this.createProxyTab()
      return created
    }
    console.log('[GPT-PROXY] ✅ Found existing proxy tab:', tab.id)
    return tab
  }

  async refreshProxyTab() {
    const tab = await this.findExistingProxyTab()
    if (!tab) {
      // 탭이 사라졌다면 재생성 시도(설정이 허용하는 경우)
      return this.createProxyTab()
    }
    const readyPromise = this.waitForProxyTabReady()
    Browser.tabs.reload(tab.id!)
    return readyPromise
  }

  async fetch(url: string, options?: RequestInitSubset) {
    console.log('[GPT-PROXY] 🚀 Fetching via proxy tab:', url.substring(0, 80))
    const tab = await this.getProxyTab()
    console.log('[GPT-PROXY] 📡 Using tab:', tab.id)
    
    const resp = await proxyFetch(tab.id!, url, options)
    console.log('[GPT-PROXY] 📥 Response status:', resp.status, resp.statusText)
    
    // 499: Port disconnected (content script 문제)
    if (resp.status === 499) {
      console.warn('[GPT-PROXY] 💔 Port disconnected (499), refreshing tab and retrying...')
      await this.refreshProxyTab()
      return proxyFetch(tab.id!, url, options)
    }
    
    // 403: Cloudflare 차단
    if (resp.status === 403) {
      console.warn('[GPT-PROXY] 🔒 403 Cloudflare detected, refreshing tab...')
      await this.refreshProxyTab()
      return proxyFetch(tab.id!, url, options)
    }

    return resp
  }
}

class BackgroundFetchRequester implements Requester {
  async fetch(url: string, options?: RequestInitSubset) {
    console.debug('[GPT-WEB][REQ] 🚀 backgroundFetch (ChatHub mode - no proxy fallback)', url.substring(0, 80))
    
    try {
      const resp = await backgroundFetch(url, options)
      console.debug('[GPT-WEB][REQ] ✅ backgroundFetch status', resp.status)
      
      // 403: Cloudflare 보안 체크 필요
      if (resp.status === 403) {
        const body = await resp.text().catch(() => '')
        console.error('[GPT-WEB][REQ] ❌ 403 Forbidden - Cloudflare challenge required')
        console.error('[GPT-WEB][REQ] 📄 Response preview:', body.substring(0, 200))
        throw new Error('CHATGPT_CLOUDFLARE: Please complete Cloudflare challenge at chatgpt.com')
      }
      
      // 401: 로그인 필요
      if (resp.status === 401) {
        const body = await resp.text().catch(() => '')
        console.error('[GPT-WEB][REQ] ❌ 401 Unauthorized - Login required')
        console.error('[GPT-WEB][REQ] 📄 Response preview:', body.substring(0, 200))
        console.error('[GPT-WEB][REQ] 💡 Solution: Log in to chatgpt.com in your browser')
        throw new Error('CHATGPT_UNAUTHORIZED: Please log in to chatgpt.com')
      }
      
      // 429: Rate limit
      if (resp.status === 429) {
        const body = await resp.text().catch(() => '')
        console.error('[GPT-WEB][REQ] ❌ 429 Too Many Requests - Rate limited')
        console.error('[GPT-WEB][REQ] 📄 Response preview:', body.substring(0, 200))
        console.error('[GPT-WEB][REQ] 💡 Solution: Wait a few minutes and try again')
        throw new Error('CHATGPT_RATE_LIMIT: Too many requests, please wait')
      }

      // 기타 HTTP 에러
      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        console.error('[GPT-WEB][REQ] ❌ HTTP Error:', resp.status, resp.statusText)
        console.error('[GPT-WEB][REQ] 📄 Response preview:', body.substring(0, 200))
        throw new Error(`ChatGPT API error (${resp.status}): ${resp.statusText}`)
      }
      
      return resp
    } catch (error) {
      // 네트워크 에러 또는 위에서 throw한 에러
      const errorMsg = error instanceof Error ? error.message : String(error)
      
      // 이미 처리한 에러는 그대로 throw
      if (errorMsg.startsWith('CHATGPT_') || errorMsg.startsWith('ChatGPT API error')) {
        throw error
      }
      
      // 예상치 못한 네트워크 에러
      console.error('[GPT-WEB][REQ] ❌ Network error:', errorMsg)
      console.error('[GPT-WEB][REQ] 💡 Troubleshooting:')
      console.error('[GPT-WEB][REQ]   1. Check your internet connection')
      console.error('[GPT-WEB][REQ]   2. Make sure you are logged in to chatgpt.com')
      console.error('[GPT-WEB][REQ]   3. Try refreshing the ChatGPT page')
      console.error('[GPT-WEB][REQ]   4. Check if ChatGPT service is available')
      throw new Error(`Network error: ${errorMsg}`)
    }
  }
}

export const globalFetchRequester = new GlobalFetchRequester()
export const proxyFetchRequester = new ProxyFetchRequester()
export const backgroundFetchRequester = new BackgroundFetchRequester()
