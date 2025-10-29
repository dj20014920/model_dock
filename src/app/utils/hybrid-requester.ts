import { RequestInitSubset } from '~types/messaging'
import { ProxyRequester } from './proxy-requester'
import { backgroundFetch } from '~services/proxy-fetch'

/**
 * ProxyRequester를 사용하여 동일 출처 탭에서 요청 실행
 *
 * Extension context에서 직접 fetch 시도 시 발생하는 문제들:
 * 1. CORS 정책으로 인한 쿠키 전달 불가 (credentials: 'include' 무시됨)
 * 2. 일부 API는 HTTP 200으로 에러 반환 (예: DeepSeek {"code":40002})
 * 3. 불안정한 폴백 로직으로 인한 예측 불가능한 동작
 *
 * 해결: 모든 요청을 ProxyRequester로 통일하여 안정성 및 일관성 확보
 */
export async function hybridFetch(
  url: string,
  options: RequestInitSubset | undefined,
  opts: { homeUrl: string; hostStartsWith: string },
  extra?: { reuseOnly?: boolean },
): Promise<Response> {
  // Copilot은 엄격한 CSP/nonce 정책이므로 배경 경로를 우선 시도
  if (opts.hostStartsWith.includes('copilot.microsoft.com')) {
    try {
      console.log('[HYBRID-FETCH] 🚀 Background-first for Copilot:', url)
      const bg = await backgroundFetch(url, options)
      console.log('[HYBRID-FETCH] 📡 Background result:', bg.status, bg.statusText)
      if (bg.ok) return bg
      if (bg.status !== 401 && bg.status !== 403) return bg
      // 401/403이면 동일 출처로 폴백
    } catch (e) {
      console.warn('[HYBRID-FETCH] ⚠️ Background path failed, falling back to proxy:', (e as Error)?.message)
    }
  }

  console.log('[HYBRID-FETCH] 🔄 Using ProxyRequester for:', url)

  // ProxyRequester를 통해 동일 출처 탭에서 요청 실행 (쿠키 자동 포함)
  const requester = new ProxyRequester({ ...opts, reuseOnly: !!extra?.reuseOnly })
  const proxyResp = await requester.fetch(url, options as any)

  console.log('[HYBRID-FETCH] 📡 ProxyRequester result:', proxyResp.status, proxyResp.statusText)
  return proxyResp
}
