import { requestHostPermission } from '~app/utils/permissions'
import { hybridFetch } from '~app/utils/hybrid-requester'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { getUserConfig } from '~services/user-config'
import { parseSSEResponse } from '~utils/sse'

interface ConversationContext {
  chatId: string
}

/**
 * DeepSeek Webapp Bot
 * 사용자의 chat.deepseek.com 로그인 세션을 활용하여 대화 진행
 * Claude, Gemini, Perplexity와 동일한 hybridFetch 패턴 사용
 */
export class DeepSeekWebBot extends AbstractBot {
  private conversationContext?: ConversationContext
  private model: string

  constructor() {
    super()
    this.model = 'deepseek-chat'
  }

  async doSendMessage(params: SendMessageParams) {
    console.log('[DeepSeek] 🚀 Starting message send')
    console.log('[DeepSeek] 📝 Prompt:', params.prompt)
    
    if (!(await requestHostPermission('https://chat.deepseek.com/*'))) {
      throw new ChatError('Missing chat.deepseek.com permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    // 사용자 설정에서 모델 읽기
    const cfg = await getUserConfig()
    const customModel = (cfg as any).deepseekWebappCustomModel
    if (customModel && customModel !== '') {
      this.model = customModel
      console.log('[DeepSeek] ⚙️ Using custom model:', this.model)
    }

    // 대화 세션 초기화 (첫 요청 시에만)
    if (!this.conversationContext) {
      // 새로운 chat 생성
      const chatId = this.generateChatId()
      this.conversationContext = { chatId }
      console.log('[DeepSeek] 💬 New conversation ID:', chatId)
    }

    // DeepSeek API 요청 구성
    const requestBody = {
      message: params.prompt,
      stream: true,
      model: this.model,
      temperature: 0,
      max_tokens: 4096,
    }

    console.log('[DeepSeek] 📤 Sending chat request with body:', JSON.stringify(requestBody).substring(0, 300))

    try {
      // hybridFetch를 사용하여 직접 fetch 시도 후 실패 시 ProxyRequester로 폴백
      const resp = await hybridFetch(
        `https://chat.deepseek.com/api/v0/chat/completions`,
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
            'Please login to chat.deepseek.com in a pinned tab. Click "Open DeepSeek tab" in settings.',
            ErrorCode.MISSING_HOST_PERMISSION
          )
        }
        
        throw new ChatError(
          `DeepSeek request failed: ${resp.status} ${errorText}`,
          ErrorCode.NETWORK_ERROR
        )
      }

      let result = ''

      // SSE 스트림 파싱
      await parseSSEResponse(resp, (message) => {
        if (message === '[DONE]') {
          console.log('[DeepSeek] ✅ SSE stream completed')
          return
        }

        console.log('[DeepSeek] 📨 SSE message received:', message.substring(0, 150))

        try {
          const payload = JSON.parse(message)

          // DeepSeek은 choices[0].delta.content 형식으로 텍스트 전송
          if (payload.choices && payload.choices[0]?.delta?.content) {
            const text = payload.choices[0].delta.content
            result += text
            params.onEvent({
              type: 'UPDATE_ANSWER',
              data: { text: result.trimStart() },
            })
            console.log('[DeepSeek] 📝 Updated answer (+%d chars), total length: %d', text.length, result.length)
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

  /**
   * 고유한 chat ID 생성
   */
  private generateChatId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }

  resetConversation() {
    console.log('[DeepSeek] 🔄 Resetting conversation')
    this.conversationContext = undefined
  }

  get name() {
    return `DeepSeek (webapp/${this.model})`
  }
}
