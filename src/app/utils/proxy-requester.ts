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
    const ready = this.waitForProxyTabReady()
    await Browser.tabs.create({ url: this.opts.homeUrl, pinned: true, active: false })
    return ready
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
    const tab = await this.getProxyTab()
    if (!tab) {
      // 재사용만 허용되고 탭이 없다면 자동 생성 금지 → 401 반환
      const empty = new ReadableStream({ start(c) { try { c.close() } catch {} } })
      return new Response(empty, { status: 401, statusText: 'NO_PROXY_TAB' })
    }
    // Webapp 계정 기반 호출은 항상 쿠키 포함(redirect 등에서도 안전)
    const merged: any = { credentials: 'include', ...(options as any) }
    const resp = await proxyFetch(tab.id!, url, merged)
    if (resp.status === 403) {
      await this.refreshProxyTab()
      return proxyFetch(tab.id!, url, merged)
    }
    return resp
  }
}
