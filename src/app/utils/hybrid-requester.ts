import { RequestInitSubset } from '~types/messaging'
import { ProxyRequester } from './proxy-requester'

export async function hybridFetch(
  url: string,
  options: RequestInitSubset | undefined,
  opts: { homeUrl: string; hostStartsWith: string },
): Promise<Response> {
  const merged: any = { credentials: 'include', ...(options as any) }
  try {
    const resp = await fetch(url as any, merged)
    if (resp.ok) return resp
    if (resp.status === 401 || resp.status === 403) {
      const requester = new ProxyRequester(opts)
      return requester.fetch(url, options as any)
    }
    // 그 외 상태는 그대로 반환하여 호출자가 처리
    return resp
  } catch (e) {
    // 네트워크/CORS 오류는 탭을 생성하지 않는다(사용자 정책).
    throw e
  }
}

