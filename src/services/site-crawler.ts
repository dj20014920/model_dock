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
  console.log('[SITE-CRAWLER] 🏠 Home URL:', home)

  // 403 이후 과도한 리로드 방지(쿨다운)
  const reloadCooldownMs = 2 * 60 * 1000 // 2분
  const now = Date.now()
  ;(globalThis as any).__SITE_RELOAD_AT__ = (globalThis as any).__SITE_RELOAD_AT__ || new Map<string, number>()
  const lastReloadAt: Map<string, number> = (globalThis as any).__SITE_RELOAD_AT__
  
  // 호스트 권한 요청 (MV3: optional_host_permissions 사용)
  const granted = await requestHostPermissions([`${home}*`]).catch(() => false)
  if (!granted) {
    console.error('[SITE-CRAWLER] ❌ Permission denied for:', home)
    throw new Error(`Site access not granted for ${home}`)
  }
  console.log('[SITE-CRAWLER] ✅ Permission granted for:', home)

  // 탭 확보 후, inpage-bridge + content-script는 proxyFetch 내부에서 강제 주입됨
  const tab = await ensureSiteTab(home)
  console.log('[SITE-CRAWLER] 📑 Tab ensured, ID:', tab.id, 'URL:', tab.url)
  
  // SPA 초기화 및 페이지 스크립트가 자체 API 콜을 발사하여 헤더를 채울 시간을 약간 부여
  try { await new Promise((r) => setTimeout(r, 800)) } catch {}
  
  const merged: any = { credentials: 'include', ...(options as any) }

  // 1차 시도
  console.log('[SITE-CRAWLER] 🔄 First fetch attempt...')
  let resp = await proxyFetch(tab.id!, url, merged)
  console.log('[SITE-CRAWLER] 📡 First response status:', resp.status)
  if (resp.status !== 403) return resp

  // 403(챌린지 미통과) → 탭 리로드 후 재시도 (Turnstile 재평가 유도)
  const lastAt = lastReloadAt.get(home) || 0
  if (now - lastAt < reloadCooldownMs) {
    console.warn('[SITE-CRAWLER] ⏳ Skipping reload due to cooldown. Returning 403 response as-is')
    return resp
  }
  console.log('[SITE-CRAWLER] 🔄 Got 403, reloading tab and retrying...')
  try {
    await Browser.tabs.reload(tab.id!)
    await waitTabComplete(tab.id!)
    console.log('[SITE-CRAWLER] ✅ Tab reloaded successfully')
    lastReloadAt.set(home, Date.now())
    // 리로드 후에도 페이지 초기화 대기 (Grok 앱이 대화 목록 등을 먼저 호출하도록 유도)
    try { await new Promise((r) => setTimeout(r, 800)) } catch {}
  } catch (e) {
    console.error('[SITE-CRAWLER] ⚠️ Tab reload failed:', (e as Error)?.message)
  }
  console.log('[SITE-CRAWLER] 🔄 Second fetch attempt...')
  resp = await proxyFetch(tab.id!, url, merged)
  console.log('[SITE-CRAWLER] 📡 Second response status:', resp.status)
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

