import { createParser } from 'eventsource-parser'
import { isEmpty } from 'lodash-es'
import { ChatError, ErrorCode } from './errors'
import { streamAsyncIterable } from './stream-async-iterable'

const statusTextMap = new Map([
  [400, 'Bad Request'],
  [401, 'Unauthorized'],
  [403, 'Forbidden'],
  [429, 'Too Many Requests'],
])

export async function parseSSEResponse(resp: Response, onMessage: (message: string) => void) {
  console.log('[SSE] 🔄 begin parse', { status: resp.status, ok: resp.ok, hasBody: !!resp.body })
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({} as any))
    // Claude webapp rate limit → provide user-friendly message
    try {
      const errType = error?.error?.type || error?.type
      if (resp.status === 429 && errType === 'rate_limit_error') {
        let resetsAt: number | undefined
        let windowHint: string | undefined
        try {
          const inner = JSON.parse(error?.error?.message || '{}')
          resetsAt = typeof inner?.resetsAt === 'number' ? inner.resetsAt : undefined
          if (inner?.windows && typeof inner.windows === 'object') {
            // pick the window with exceeded_limit
            for (const [k, v] of Object.entries(inner.windows as any)) {
              if ((v as any)?.status === 'exceeded_limit') {
                windowHint = k
                break
              }
            }
          }
        } catch {}
        const dateStr = resetsAt ? new Date(resetsAt * 1000).toLocaleString() : ''
        const hint = windowHint ? `(${windowHint})` : ''
        const msg = dateStr
          ? `Claude 사용량 제한을 초과했습니다 ${hint}. 재시도 가능 시각: ${dateStr}`
          : `Claude 사용량 제한을 초과했습니다 ${hint}. 잠시 후 다시 시도하세요.`
        throw new ChatError(msg, ErrorCode.CLAUDE_WEB_RATE_LIMIT)
      }
    } catch {}
    if (!isEmpty(error)) {
      throw new Error(JSON.stringify(error))
    }
    const statusText = resp.statusText || statusTextMap.get(resp.status) || ''
    throw new ChatError(`${resp.status} ${statusText}`, ErrorCode.NETWORK_ERROR)
  }
  if (!resp.body) {
    // CORS/Origin 정책으로 본문을 읽지 못하는 경우가 있습니다.
    // 이때는 동일-도메인 프록시(핀 탭)를 사용해야 합니다.
    throw new ChatError('Stream body not readable (CORS/origin). Please use webapp proxy tab.', ErrorCode.NETWORK_ERROR)
  }

  let sawDone = false
  const parser = createParser((event) => {
    if (event.type === 'event') {
      console.log('[SSE] 📨 Event received:', { data: event.data.substring(0, 100) })
      try {
        if (event.data === '[DONE]') sawDone = true
        onMessage(event.data)
      } catch {
        // swallow handler exceptions to keep stream consuming
      }
    }
  })
  const decoder = new TextDecoder()

  // 초반 무응답 방지: 첫 청크가 일정 시간 내 도착하지 않으면 프록시 탭 유도 에러로 전환
  const reader = resp.body.getReader()
  let firstChunk: Uint8Array | undefined
  const firstChunkTimeoutMs = 8000
  const firstChunkPromise = reader.read()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(
        new ChatError(
          'Stream not received in time (CORS/origin). Please open ChatGPT tab and retry.',
          ErrorCode.NETWORK_ERROR,
        ),
      ),
      firstChunkTimeoutMs,
    )
  })

  const firstResult = (await Promise.race([firstChunkPromise, timeoutPromise]).catch((e) => {
    // reader lock 해제 시도
    try { reader.releaseLock() } catch {}
    console.warn('[SSE] first chunk timeout or error', e)
    throw e
  })) as ReadableStreamReadResult<Uint8Array>

  // 첫 결과를 받았으므로 타임아웃 정리
  if (timeoutHandle) clearTimeout(timeoutHandle)

  if (firstResult.done) {
    // 서버가 즉시 종료한 경우에도 상위로 완료 신호를 보낸다
    try { onMessage('[DONE]') } catch {}
    console.log('[SSE] ⚠️ stream ended immediately (first chunk done)')
    return
  }
  firstChunk = firstResult.value
  console.log('[SSE] ✅ first chunk received', { bytes: firstChunk?.byteLength || 0 })
  parser.feed(decoder.decode(firstChunk))

  // 이후 나머지 스트림 처리 (이미 생성된 reader를 계속 사용)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      const str = decoder.decode(value)
      // log small preview to avoid noisy console
      try {
        const preview = str.length > 120 ? str.slice(0, 120) + '…' : str
        console.log('[SSE] 📦 chunk', { len: str.length, preview })
      } catch {}
      parser.feed(str)
    }
  } finally {
    reader.releaseLock()
  }
  // 스트림이 자연 종료되었고 [DONE] 이벤트를 못 받았다면 명시적으로 완료 신호 전달
  if (!sawDone) {
    try { onMessage('[DONE]') } catch {}
    console.log('[SSE] ⚠️ stream completed without explicit [DONE]')
  }
}
