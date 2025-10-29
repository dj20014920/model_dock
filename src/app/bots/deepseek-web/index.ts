import { requestHostPermission } from '~app/utils/permissions'
import { hybridFetch } from '~app/utils/hybrid-requester'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { parseSSEResponse } from '~utils/sse'

interface ConversationContext {
  chatSessionId: string
  parentMessageId: string | null
}

/**
 * DeepSeek Webapp Bot
 *
 * 실제 API 구조:
 * 1. POST /api/v0/chat_session/create - 새 채팅 세션 생성
 * 2. POST /api/v0/chat/completion - 메시지 전송 (SSE 스트림)
 *
 * 요청 형식:
 * {
 *   "chat_session_id": "uuid",
 *   "parent_message_id": "uuid | null",
 *   "prompt": "사용자 메시지",
 *   "ref_file_ids": [],
 *   "thinking_enabled": false,
 *   "search_enabled": false
 * }
 */
export class DeepSeekWebBot extends AbstractBot {
  private conversationContext?: ConversationContext

  constructor() {
    super()
  }

  /**
   * 새로운 채팅 세션을 생성합니다
   */
  private async createChatSession(signal?: AbortSignal): Promise<string> {
    console.log('[DeepSeek] 💬 Creating new chat session...')

    const resp = await hybridFetch(
      'https://chat.deepseek.com/api/v0/chat_session/create',
      {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      { homeUrl: 'https://chat.deepseek.com', hostStartsWith: 'https://chat.deepseek.com' },
      { reuseOnly: true },
    )

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '')

      if (resp.status === 401 || resp.status === 403) {
        throw new ChatError(
          'DeepSeek 로그인이 필요합니다. 설정에서 "DeepSeek 웹 열기"를 클릭하여 로그인하세요.',
          ErrorCode.MISSING_HOST_PERMISSION
        )
      }

      throw new ChatError(
        `DeepSeek 세션 생성 실패: ${resp.status} ${errorText}`,
        ErrorCode.NETWORK_ERROR
      )
    }

    const data = await resp.json()
    const chatSessionId = data?.data?.chat_session_id

    if (!chatSessionId) {
      throw new ChatError('채팅 세션 ID를 받지 못했습니다', ErrorCode.UNKOWN_ERROR)
    }

    console.log('[DeepSeek] ✅ Chat session created:', chatSessionId)
    return chatSessionId
  }

  async doSendMessage(params: SendMessageParams) {
    console.log('[DeepSeek] 🚀 Starting message send')
    console.log('[DeepSeek] 📝 Prompt:', params.prompt)

    if (!(await requestHostPermission('https://chat.deepseek.com/*'))) {
      throw new ChatError('chat.deepseek.com 권한이 필요합니다', ErrorCode.MISSING_HOST_PERMISSION)
    }

    // 대화 세션 초기화 (첫 요청 시에만)
    if (!this.conversationContext) {
      try {
        const chatSessionId = await this.createChatSession(params.signal)
        this.conversationContext = {
          chatSessionId,
          parentMessageId: null,
        }
      } catch (error) {
        if (error instanceof ChatError) throw error
        throw new ChatError(
          error instanceof Error ? error.message : 'Unknown error',
          ErrorCode.UNKOWN_ERROR
        )
      }
    }

    // DeepSeek 실제 API 요청 구성
    const requestBody = {
      chat_session_id: this.conversationContext.chatSessionId,
      parent_message_id: this.conversationContext.parentMessageId,
      prompt: params.prompt,
      ref_file_ids: [],
      thinking_enabled: false,
      search_enabled: false,
    }

    console.log('[DeepSeek] 📤 Sending request to /api/v0/chat/completion')
    console.log('[DeepSeek] 📦 Request body:', JSON.stringify(requestBody).substring(0, 200))

    try {
      const resp = await hybridFetch(
        'https://chat.deepseek.com/api/v0/chat/completion',
        {
          method: 'POST',
          signal: params.signal,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        },
        { homeUrl: 'https://chat.deepseek.com', hostStartsWith: 'https://chat.deepseek.com' },
        { reuseOnly: true },
      )

      if (!resp.ok) {
        console.error('[DeepSeek] ❌ Request failed:', resp.status, resp.statusText)
        const errorText = await resp.text().catch(() => '')

        if (resp.status === 401 || resp.status === 403) {
          throw new ChatError(
            'DeepSeek 로그인이 필요합니다. 설정에서 "DeepSeek 웹 열기"를 클릭하여 로그인하세요.',
            ErrorCode.MISSING_HOST_PERMISSION
          )
        }

        throw new ChatError(
          `DeepSeek 요청 실패: ${resp.status} ${errorText}`,
          ErrorCode.NETWORK_ERROR
        )
      }

      let result = ''
      let lastMessageId: string | null = null

      // SSE 스트림 파싱
      await parseSSEResponse(resp, (message) => {
        if (message === '[DONE]') {
          console.log('[DeepSeek] ✅ SSE stream completed')
          return
        }

        console.log('[DeepSeek] 📨 SSE message:', message.substring(0, 150))

        try {
          const payload = JSON.parse(message)

          // DeepSeek SSE 응답 형식: { choices: [{ delta: { content: "..." }, message_id: "..." }] }
          if (payload.choices && payload.choices[0]) {
            const choice = payload.choices[0]

            // 메시지 ID 저장 (다음 메시지의 parent로 사용)
            if (choice.message_id) {
              lastMessageId = choice.message_id
            }

            // 텍스트 업데이트
            if (choice.delta?.content) {
              const text = choice.delta.content
              result += text
              params.onEvent({
                type: 'UPDATE_ANSWER',
                data: { text: result.trimStart() },
              })
              console.log('[DeepSeek] 📝 Updated (+%d chars), total: %d', text.length, result.length)
            }
          }
          // 에러 처리
          else if (payload.error) {
            console.error('[DeepSeek] ❌ Error in response:', payload.error)
            throw new Error(JSON.stringify(payload.error))
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            console.error('[DeepSeek] ❌ JSON parse failed:', e.message)
            console.error('[DeepSeek] 📄 Raw message:', message.substring(0, 300))
          } else {
            throw e
          }
        }
      })

      // 다음 메시지를 위해 parent_message_id 업데이트
      if (lastMessageId) {
        this.conversationContext.parentMessageId = lastMessageId
        console.log('[DeepSeek] 🔗 Updated parent message ID:', lastMessageId)
      }

      params.onEvent({ type: 'DONE' })
      console.log('[DeepSeek] ✅ Message send completed, final length:', result.length)
    } catch (error) {
      console.error('[DeepSeek] ❌ Error:', error)
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
    console.log('[DeepSeek] 🔄 Resetting conversation')
    this.conversationContext = undefined
  }

  get name() {
    return 'DeepSeek (webapp)'
  }
}
