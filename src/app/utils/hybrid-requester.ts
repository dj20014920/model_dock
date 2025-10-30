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
  // 1단계: Background context에서 쿠키 기반 직접 요청 시도
  // (Copilot 외에도 Claude, Gemini, Perplexity 등 모든 사용자 계정 기반 봇에 적용)
  try {
    console.log('[HYBRID-FETCH] 🚀 Trying background fetch first:', url)
    const bg = await backgroundFetch(url, options)
    console.log('[HYBRID-FETCH] 📡 Background result:', bg.status, bg.statusText)
    
    // 성공하면 바로 반환
    if (bg.ok) return bg
    
    // 401/403이 아닌 다른 오류도 반환 (네트워크 오류 등)
    if (bg.status !== 401 && bg.status !== 403) return bg
    
    // 401/403: 로그인 필요 → 프록시 탭으로 폴백
    console.log('[HYBRID-FETCH] 🔑 Authentication required, falling back to proxy tab')
  } catch (e) {
    console.warn('[HYBRID-FETCH] ⚠️ Background fetch failed, falling back to proxy:', (e as Error)?.message)
  }

  // 2단계: 프록시 탭을 통한 요청 (쿠키 자동 포함)
  console.log('[HYBRID-FETCH] 🔄 Using ProxyRequester for:', url)
  const requester = new ProxyRequester({ ...opts, reuseOnly: !!extra?.reuseOnly })
  const proxyResp = await requester.fetch(url, options as any)

  console.log('[HYBRID-FETCH] 📡 ProxyRequester result:', proxyResp.status, proxyResp.statusText)
  return proxyResp
}
