import Browser, { Runtime } from 'webextension-polyfill'
import { proxyFetch } from '~services/proxy-fetch'
import { RequestInitSubset } from '~types/messaging'

export class ProxyRequester {
  constructor(private opts: { homeUrl: string; hostStartsWith: string; reuseOnly?: boolean }) {}

  private async findExistingProxyTab() {
    const tabs = await Browser.tabs.query({})
    const results: (string | undefined)[] = await Promise.all(
      tabs.map(async (tab) => {
        if (tab.url) return tab.url
        return Browser.tabs.sendMessage(tab.id!, 'url').catch(() => undefined)
      }),
    )
    for (let i = 0; i < results.length; i++) {
      const u = results[i]
      if (u?.startsWith(this.opts.hostStartsWith)) return tabs[i]
    }
  }

  private waitForProxyTabReady(): Promise<Browser.Tabs.Tab> {
    return new Promise((resolve, reject) => {
      let resolved = false
      const listener = async (message: any, sender: Runtime.MessageSender) => {
        if (message && message.event === 'PROXY_TAB_READY' && sender.tab) {
          cleanup(); resolved = true; resolve(sender.tab)
          return true
        }
      }
      const cleanup = () => {
        try { Browser.runtime.onMessage.removeListener(listener) } catch {}
        try { clearTimeout(timer) } catch {}
        try { clearInterval(poll) } catch {}
      }
      // Fallback: PROXY_TAB_READY 미수신 시, content-script ping 성공까지 폴링
      const poll = setInterval(async () => {
        const tab = await this.findExistingProxyTab().catch(() => undefined as any)
        if (!tab || resolved) return
        try {
          const url = await Browser.tabs.sendMessage(tab.id!, 'url')
          if (typeof url === 'string' && url.startsWith(this.opts.hostStartsWith)) {
            cleanup(); resolved = true; resolve(tab)
          }
        } catch {
          // content-script 미주입 상태일 수 있음 → 대기
        }
      }, 500)
      const timer = setTimeout(() => {
        cleanup(); if (!resolved) reject(new Error('Timeout waiting for proxy tab'))
      }, 15 * 1000)
      Browser.runtime.onMessage.addListener(listener)
    })
  }

  private async createProxyTab() {
    console.log('[ProxyRequester] 🌐 Creating new proxy tab:', this.opts.homeUrl)

    // 탭 생성 및 로딩 완료 대기를 동시에 시작
    const readyPromise = this.waitForProxyTabReady()
    const newTab = await Browser.tabs.create({
      url: this.opts.homeUrl,
      pinned: true,
      active: false
    })

    console.log('[ProxyRequester] ⏳ Waiting for tab to load...', { tabId: newTab.id })

    // 탭 로딩 완료 대기 (최대 15초)
    await new Promise<void>((resolve, reject) => {
      let resolved = false
      const listener = (tabId: number, changeInfo: any, tab: Browser.Tabs.Tab) => {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
          resolved = true
          Browser.tabs.onUpdated.removeListener(listener)

          // 에러 페이지 감지
          const url = tab.url || ''
          if (url.startsWith('chrome-error://') || url === '' || !url.startsWith(this.opts.hostStartsWith)) {
            console.error('[ProxyRequester] ❌ Tab loaded error page or wrong URL:', {
              tabId: newTab.id,
              url,
              expected: this.opts.hostStartsWith
            })
            reject(new Error(`Tab loaded error page: ${url || '(empty)'}`))
          } else {
            console.log('[ProxyRequester] ✅ Tab loaded successfully:', { tabId: newTab.id, url: url.substring(0, 50) })
            resolve()
          }
        }
      }

      Browser.tabs.onUpdated.addListener(listener)

      // 타임아웃 (15초)
      setTimeout(() => {
        if (!resolved) {
          Browser.tabs.onUpdated.removeListener(listener)
          console.warn('[ProxyRequester] ⏱️ Tab loading timeout (15s)')
          resolve() // 타임아웃이어도 계속 진행 (waitForProxyTabReady가 재시도)
        }
      }, 15000)
    })

    return readyPromise
  }

  private async getProxyTab() {
    let tab = await this.findExistingProxyTab()
    if (!tab) {
      if (this.opts.reuseOnly) return null as unknown as Browser.Tabs.Tab
      tab = await this.createProxyTab()
    }
    return tab
  }

  private async refreshProxyTab() {
    const tab = await this.findExistingProxyTab()
    if (!tab) {
      await this.createProxyTab()
      return
    }
    const ready = this.waitForProxyTabReady()
    await Browser.tabs.reload(tab.id!)
    return ready
  }

  async fetch(url: string, options?: RequestInitSubset) {
    try {
      const tab = await this.getProxyTab()
      if (!tab) {
        const empty = new ReadableStream({ start(c) { try { c.close() } catch {} } })
        return new Response(empty, { status: 401, statusText: 'NO_PROXY_TAB' })
      }

      const merged: any = { credentials: 'include', ...(options as any) }
      let resp = await proxyFetch(tab.id!, url, merged)

      // 403/499: 탭 리프레시 후 재시도
      if (resp.status === 403 || resp.status === 499) {
        console.log('[ProxyRequester] 🔄 Refreshing proxy tab due to:', resp.status, resp.statusText)
        await this.refreshProxyTab()
        
        // 재시도
        const retryTab = await this.findExistingProxyTab()
        if (retryTab) {
          resp = await proxyFetch(retryTab.id!, url, merged)
          console.log('[ProxyRequester] ✅ Retry result:', resp.status, resp.statusText)
        }
      }
      return resp
    } catch (error) {
      console.error('[ProxyRequester] ❌ Fetch failed:', (error as Error)?.message)

      // 에러 페이지 로드 에러 감지
      if ((error as Error)?.message?.includes('error page')) {
        const errorMsg =
          'DeepSeek 탭 로딩 실패\n\n' +
          '가능한 원인:\n' +
          '1. DeepSeek 로그인이 필요합니다\n' +
          '2. 네트워크 연결 문제\n' +
          '3. DeepSeek 서비스 장애\n\n' +
          '해결 방법:\n' +
          '1. https://chat.deepseek.com을 새 탭에서 열어 로그인하세요\n' +
          '2. 로그인 후 다시 시도하세요'

        const empty = new ReadableStream({ start(c) { try { c.close() } catch {} } })
        return new Response(empty, {
          status: 500,
          statusText: errorMsg
        })
      }

      // 기타 에러
      const empty = new ReadableStream({ start(c) { try { c.close() } catch {} } })
      return new Response(empty, {
        status: 500,
        statusText: `PROXY_TAB_ERROR: ${(error as Error)?.message || 'Unknown error'}`
      })
    }
  }
}
