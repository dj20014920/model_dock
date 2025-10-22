import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { ChatError, ErrorCode } from '~utils/errors'
import { requestHostPermission } from '~app/utils/permissions'
import { hybridFetch } from '~app/utils/hybrid-requester'

/**
 * Grok WebApp Bot (Hybrid Fetch Pattern)
 * 
 * ✅ Gemini/Claude와 동일한 패턴 사용
 * - 먼저 일반 fetch 시도 (credentials: 'include')
 * - 401/403 시 자동으로 ProxyRequester 사용
 * - 별도의 로그인 체크 불필요
 */
export class GrokWebAppBot extends AbstractBot {
  private conversationId?: string

  async doSendMessage(params: SendMessageParams): Promise<void> {
    console.log('[GROK-WEB] 🚀 Starting message send...')
    
    // 권한 체크
    if (!(await requestHostPermission('https://grok.com/*'))) {
      throw new ChatError('Missing grok.com permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    try {
      // 메시지 전송
      await this.sendConversationMessage(params)
      
      console.log('[GROK-WEB] ✅ Message sent successfully')
    } catch (error) {
      console.error('[GROK-WEB] ❌ Failed to send message:', error)
      throw error
    }
  }

  /**
   * 새 대화 생성 (Hybrid Fetch 사용)
   */
  private async sendConversationMessage(params: SendMessageParams) {
    console.log('[GROK-WEB] 📤 Sending message...')
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    
    try {
      // hybridFetch: 자동으로 credentials 처리 + 401/403 시 탭 생성
      console.log('[GROK-WEB] 🔄 Attempting hybrid fetch...')
      const resp = await hybridFetch(
        'https://grok.com/rest/app-chat/conversations/new',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            temporary: false,
            modelName: 'grok-4-auto',
            message: params.prompt,
            fileAttachments: [],
            imageAttachments: [],
            disableSearch: false,
            enableImageGeneration: true,
            returnImageBytes: false,
            returnRawGrokInXaiRequest: false,
            enableImageStreaming: true,
            imageGenerationCount: 2,
            forceConcise: false,
            toolOverrides: {},
            enableSideBySide: true,
            sendFinalMetadata: true,
            isReasoning: false,
            webpageUrls: [],
            disableTextFollowUps: false,
            responseMetadata: {
              modelConfigOverride: { modelMap: {} },
              requestModelDetails: { modelId: 'grok-4-auto' },
            },
            disableMemory: false,
            forceSideBySide: false,
            modelMode: 'MODEL_MODE_AUTO',
            isAsyncChat: false,
            disableSelfHarmShortCircuit: false,
          }),
          signal: params.signal || controller.signal,
        },
        { homeUrl: 'https://grok.com', hostStartsWith: 'https://grok.com' },
      )
      
      console.log('[GROK-WEB] 📡 Response status:', resp.status, resp.statusText)

      clearTimeout(timeoutId)

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          throw new ChatError(
            'Grok requires X (Twitter) login.\n\n' +
            'Please:\n' +
            '1. Open https://grok.com in a browser tab\n' +
            '2. Log in with your X/Twitter account\n' +
            '3. Try again\n\n' +
            'ℹ️ Free X users get daily Grok access.',
            ErrorCode.TWITTER_UNAUTHORIZED
          )
        }
        if (resp.status === 429) {
          throw new ChatError(
            'Daily Grok limit reached.\n\n' +
            'ℹ️ Free users: Limited daily messages\n' +
            'ℹ️ Premium users: Higher limits\n\n' +
            'Please wait until tomorrow or upgrade.',
            ErrorCode.CONVERSATION_LIMIT
          )
        }
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      }

      const responseText = await resp.text()
      
      // NDJSON 파싱
      await this.parseNDJSONStream(responseText, params)
    } catch (error) {
      clearTimeout(timeoutId)
      
      if ((error as Error).name === 'AbortError') {
        throw new ChatError('Request timeout (60s)', ErrorCode.NETWORK_ERROR)
      }
      
      throw error
    }
  }

  /**
   * NDJSON 스트림 파싱
   */
  private async parseNDJSONStream(streamData: string, params: SendMessageParams) {
    console.log('[GROK-WEB] 📡 Parsing NDJSON stream...')
    
    let fullResponse = ''
    const lines = streamData.split('\n').filter(line => line.trim())

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        const result = parsed?.result
        
        if (!result) continue

        // conversationId 저장
        if (result.conversation?.conversationId) {
          this.conversationId = result.conversation.conversationId
          console.log('[GROK-WEB] ✅ Conversation ID:', this.conversationId)
        }

        // 토큰 스트리밍
        if (result.response?.token) {
          const token = result.response.token
          if (token) {
            fullResponse += token
            params.onEvent({
              type: 'UPDATE_ANSWER',
              data: { text: fullResponse },
            })
          }
        }
        
        // 최종 응답 (modelResponse)
        if (result.response?.modelResponse?.message) {
          fullResponse = result.response.modelResponse.message
          console.log('[GROK-WEB] ✅ Final response received, length:', fullResponse.length)
        }

        // 대화 제목
        if (result.title?.newTitle) {
          console.log('[GROK-WEB] 📝 Title:', result.title.newTitle)
        }
      } catch (parseError) {
        console.warn('[GROK-WEB] ⚠️ Failed to parse line:', line.substring(0, 100), parseError)
      }
    }

    // 최종 업데이트
    params.onEvent({
      type: 'UPDATE_ANSWER',
      data: { text: fullResponse },
    })
    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {
    console.log('[GROK-WEB] 🔄 Resetting conversation')
    this.conversationId = undefined
  }

  get name() {
    return 'Grok'
  }
}
