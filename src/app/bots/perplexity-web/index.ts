import { requestHostPermissions } from '~app/utils/permissions'
import { hybridFetch } from '~app/utils/hybrid-requester'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { createPerplexityRequest, parsePerplexitySSE } from './api'

/**
 * Perplexity REST API 기반 봇
 * SSE(Server-Sent Events)를 통해 스트리밍 응답 처리
 * hybridFetch를 사용하여 쿠키 자동 처리
 */
export class PerplexityLabsBot extends AbstractBot {
  constructor(public model: string) {
    super()
  }

  async doSendMessage(params: SendMessageParams) {
  if (!(await requestHostPermissions(['https://*.perplexity.ai/*']))) {
      throw new ChatError('Missing perplexity.ai permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    try {
      // hybridFetch를 사용하여 쿠키 자동 포함
      const response = await createPerplexityRequest(
        params.prompt,
        (url, init) => hybridFetch(url, init, {
          homeUrl: 'https://www.perplexity.ai',
          hostStartsWith: 'https://www.perplexity.ai',
        }),
        params.signal,
      )

      let fullAnswer = ''
      let isCompleted = false

      await parsePerplexitySSE(
        response,
        (data) => {
          console.debug('perplexity sse data', data)
          
          try {
            // markdown_block에서 답변 추출
            if (data.blocks && Array.isArray(data.blocks)) {
              for (const block of data.blocks) {
                if (block.markdown_block && block.markdown_block.answer) {
                  // pplx:// 링크 제거 (번역 링크 등)
                  const cleanAnswer = block.markdown_block.answer.replace(/\[([^\]]+)\]\(pplx:\/\/[^)]+\)/g, '$1')
                  if (cleanAnswer !== fullAnswer) {
                    fullAnswer = cleanAnswer
                    params.onEvent({ type: 'UPDATE_ANSWER', data: { text: fullAnswer } })
                  }
                }
              }
            }

            // 최종 메시지 확인
            if (data.final_sse_message === true || data.status === 'COMPLETED') {
              if (!isCompleted) {
                isCompleted = true
              }
            }

            // 에러 상태 체크
            if (data.status === 'FAILED') {
              throw new ChatError('Perplexity request failed', ErrorCode.UNKOWN_ERROR)
            }
          } catch (err) {
            if (err instanceof ChatError) {
              throw err
            }
            console.debug('Failed to process Perplexity message:', err)
          }
        },
        () => {
          // 완료 콜백
          if (!isCompleted) {
            params.onEvent({ type: 'DONE' })
          }
        }
      )

      // 스트림 완료 후 아직 완료 이벤트가 없었다면 전송
      if (!isCompleted) {
        params.onEvent({ type: 'DONE' })
      }
    } catch (error) {
      console.error('Perplexity error:', error)
      params.onEvent({
        type: 'ERROR',
        error: error instanceof ChatError ? error : new ChatError(
          error instanceof Error ? error.message : 'Unknown error',
          ErrorCode.UNKOWN_ERROR
        ),
      })
    }
  }

  resetConversation() {
    // REST API는 세션 상태를 유지하지 않으므로 특별한 리셋 불필요
  }

  get name() {
    return 'Perplexity (webapp)'
  }
}
