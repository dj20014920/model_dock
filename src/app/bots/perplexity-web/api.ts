import { ChatError, ErrorCode } from '~utils/errors'
import { RequestInitSubset } from '~types/messaging'

/**
 * Perplexity REST API를 통한 SSE 요청 생성
 * hybridFetch 패턴 사용: 먼저 직접 요청, 실패시 proxy tab 사용
 */
export async function createPerplexityRequest(
  query: string,
  fetchFn: (url: string, init?: RequestInitSubset) => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  const requestBody = {
    params: {
      search_focus: 'internet',
      sources: ['web'],
      mode: 'copilot',
      model_preference: 'pplx_pro',
      supported_block_use_cases: [],
      version: '2.18',
    },
    query_str: query,
  }

  try {
    const response = await fetchFn('https://www.perplexity.ai/rest/sse/perplexity_ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
      },
      body: JSON.stringify(requestBody),
      signal,
    })

    if (!response.ok) {
      if (response.status === 452) {
        const guidance = await response.text().catch(() => '')
        throw new ChatError(
          guidance || 'Chrome blocked this extension on perplexity.ai. Allow site access in chrome://extensions and retry.',
          ErrorCode.NETWORK_ERROR,
        )
      }
      if (response.status === 403) {
        throw new ChatError('Please pass Perplexity security check', ErrorCode.PPLX_FORBIDDEN_ERROR)
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response
  } catch (err) {
    if (err instanceof ChatError) {
      throw err
    }
    throw new Error(`Failed to connect to Perplexity: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Perplexity SSE 스트림 파싱
 * Reader lock 문제를 피하기 위해 직접 구현
 */
export async function parsePerplexitySSE(
  response: Response,
  onMessage: (data: any) => void,
  onComplete: () => void,
) {
  if (!response.body) {
    throw new ChatError('Response body is empty', ErrorCode.NETWORK_ERROR)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        onComplete()
        break
      }

      // 청크 디코딩 후 버퍼에 추가
      buffer += decoder.decode(value, { stream: true })
      
      // 줄 단위로 분리
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 마지막 불완전한 줄은 버퍼에 보관

      for (const line of lines) {
        // SSE 형식: "event: message" 또는 "data: {...}"
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6).trim()
            if (jsonStr) {
              const data = JSON.parse(jsonStr)
              onMessage(data)
              
              // 최종 메시지 체크
              if (data.final_sse_message === true || data.status === 'COMPLETED') {
                onComplete()
                return
              }
            }
          } catch (e) {
            console.debug('Failed to parse SSE data:', line, e)
          }
        } else if (line.startsWith('event: end_of_stream')) {
          onComplete()
          return
        }
      }
    }
  } catch (error) {
    console.error('SSE parsing error:', error)
    throw error
  } finally {
    try {
      reader.releaseLock()
    } catch {}
  }
}
