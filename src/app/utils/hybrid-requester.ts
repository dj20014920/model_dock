import { RequestInitSubset } from '~types/messaging'
import { ProxyRequester } from './proxy-requester'

export async function hybridFetch(
  url: string,
  options: RequestInitSubset | undefined,
  opts: { homeUrl: string; hostStartsWith: string },
  extra?: { reuseOnly?: boolean },
): Promise<Response> {
  const merged: any = { credentials: 'include', ...(options as any) }
  try {
    console.log('[HYBRID-FETCH] 🔄 Trying direct fetch to:', url)
    const resp = await fetch(url as any, merged)
    console.log('[HYBRID-FETCH] 📡 Direct fetch result:', resp.status, resp.statusText)
    
    if (resp.ok) {
      console.log('[HYBRID-FETCH] ✅ Direct fetch succeeded')
      return resp
    }
    
    if (resp.status === 401 || resp.status === 403) {
      console.log('[HYBRID-FETCH] 🔄 Auth error, trying ProxyRequester...')
      const requester = new ProxyRequester({ ...opts, reuseOnly: !!extra?.reuseOnly })
      const proxyResp = await requester.fetch(url, options as any)
      console.log('[HYBRID-FETCH] 📡 ProxyRequester result:', proxyResp.status, proxyResp.statusText)
      return proxyResp
    }
    
    // 그 외 상태는 그대로 반환하여 호출자가 처리
    console.log('[HYBRID-FETCH] ⚠️ Other error, returning as-is')
    return resp
  } catch (e) {
    console.error('[HYBRID-FETCH] ❌ Network error:', e)
    // 네트워크/CORS 오류는 탭을 생성하지 않는다(사용자 정책).
    throw e
  }
}

