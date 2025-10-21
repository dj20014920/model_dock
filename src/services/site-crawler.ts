import Browser from 'webextension-polyfill'
import { proxyFetch } from '~services/proxy-fetch'
import { requestHostPermissions } from '~app/utils/permissions'
import { RequestInitSubset } from '~types/messaging'

function originOf(u: string) {
  const url = new URL(u)
  return `${url.protocol}//${url.host}/`
}

async function waitTabComplete(tabId: number, timeoutMs = 15000) {
  const started = Date.now()
  return new Promise<void>((resolve, reject) => {
    let timer: any
    const listener = (id: number, info: Browser.Tabs.OnUpdatedChangeInfoType) => {
      if (id !== tabId) return
      if (info.status === 'complete') {
        try { Browser.tabs.onUpdated.removeListener(listener) } catch {}
        try { clearTimeout(timer) } catch {}
        resolve()
      }
    }
    Browser.tabs.onUpdated.addListener(listener)
    timer = setTimeout(() => {
      try { Browser.tabs.onUpdated.removeListener(listener) } catch {}
      reject(new Error(`Tab load timeout after ${Date.now() - started}ms`))
    }, timeoutMs)
  })
}

async function ensureSiteTab(homeUrl: string): Promise<Browser.Tabs.Tab> {
  // 기존 탭 재사용
  const tabs = await Browser.tabs.query({})
  for (const t of tabs) {
    const url = t.url
    if (url && url.startsWith(homeUrl)) return t
  }
  // 신규 탭 생성 (비활성/pinned)
  const tab = await Browser.tabs.create({ url: homeUrl, pinned: true, active: false })
  try { await waitTabComplete(tab.id!) } catch {}
  return tab
}

/**
 * Cloudflare Turnstile 방어가 있는 사이트를 크롤링할 때,
 * 실제 브라우저 탭 컨텍스트에서 same‑origin fetch를 실행하여
 * 쿠키/헤더/환경 점수로 우회하는 범용 크롤러.
 */
export async function fetchWithSiteProxy(url: string, options?: RequestInitSubset): Promise<Response> {
  const home = originOf(url)
  // 호스트 권한 요청 (MV3: optional_host_permissions 사용)
  const granted = await requestHostPermissions([`${home}*`]).catch(() => false)
  if (!granted) {
    throw new Error(`Site access not granted for ${home}`)
  }

  // 탭 확보 후, inpage-bridge + content-script는 proxyFetch 내부에서 강제 주입됨
  const tab = await ensureSiteTab(home)
  const merged: any = { credentials: 'include', ...(options as any) }

  // 1차 시도
  let resp = await proxyFetch(tab.id!, url, merged)
  if (resp.status !== 403) return resp

  // 403(챌린지 미통과) → 탭 리로드 후 재시도 (Turnstile 재평가 유도)
  try {
    await Browser.tabs.reload(tab.id!)
    await waitTabComplete(tab.id!)
  } catch {}
  resp = await proxyFetch(tab.id!, url, merged)
  return resp
}

export async function fetchTextWithSiteProxy(url: string, options?: RequestInitSubset): Promise<string> {
  const resp = await fetchWithSiteProxy(url, options)
  return await resp.text()
}

export async function fetchJsonWithSiteProxy<T = any>(url: string, options?: RequestInitSubset): Promise<T> {
  const resp = await fetchWithSiteProxy(url, options)
  return await resp.json()
}

