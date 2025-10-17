import Browser, { Runtime } from 'webextension-polyfill'
import { CHATGPT_HOME_URL } from '~app/consts'
import { proxyFetch } from '~services/proxy-fetch'
import { RequestInitSubset } from '~types/messaging'

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
    const tabs = await Browser.tabs.query({ pinned: true })
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
          console.debug('new proxy tab ready')
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
            cleanup(); resolved = true; resolve(tab)
          }
        } catch {
          // content-script 미주입 → 계속 대기
        }
      }, 500)
      const timer = setTimeout(() => {
        cleanup(); if (!resolved) reject(new Error('Timeout waiting for ChatGPT tab'))
      }, 15 * 1000)
      Browser.runtime.onMessage.addListener(listener)
    })
  }

  async createProxyTab() {
    const readyPromise = this.waitForProxyTabReady()
    Browser.tabs.create({ url: CHATGPT_HOME_URL, pinned: true })
    return readyPromise
  }

  async getProxyTab() {
    let tab = await this.findExistingProxyTab()
    if (!tab) {
      tab = await this.createProxyTab()
    }
    return tab
  }

  async refreshProxyTab() {
    const tab = await this.findExistingProxyTab()
    if (!tab) {
      await this.createProxyTab()
      return
    }
    const readyPromise = this.waitForProxyTabReady()
    Browser.tabs.reload(tab.id!)
    return readyPromise
  }

  async fetch(url: string, options?: RequestInitSubset) {
    const tab = await this.getProxyTab()
    const resp = await proxyFetch(tab.id!, url, options)
    if (resp.status === 403) {
      await this.refreshProxyTab()
      return proxyFetch(tab.id!, url, options)
    }
    return resp
  }
}

export const globalFetchRequester = new GlobalFetchRequester()
export const proxyFetchRequester = new ProxyFetchRequester()
