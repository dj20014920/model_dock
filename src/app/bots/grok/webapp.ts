import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { ChatError, ErrorCode } from '~utils/errors'
import { requestHostPermission } from '~app/utils/permissions'
import { proxyFetch } from '~services/proxy-fetch'
import Browser from 'webextension-polyfill'

/**
 * Grok WebApp Bot (Background Fetch + Complete Headers)
 * 
 * ⚠️ 중요: Cloudflare anti-bot 방어를 우회하기 위해 
 * 실제 브라우저와 동일한 모든 헤더 포함
 * 
 * ✅ HAR 파일 분석 기반 실제 API 구현
 * - 엔드포인트: POST /rest/app-chat/conversations/new  
 * - 모델: grok-4-auto (2025 최신)
 * - Response: Base64 인코딩된 NDJSON 스트림
 * - 인증: 브라우저 쿠키 (credentials: 'include')
 * - 헤더: 실제 브라우저 모방 (User-Agent, Referer, sec-fetch-*)
 */
export class GrokWebAppBot extends AbstractBot {
  private conversationId?: string

  /**
   * grok.com 탭 찾기 또는 생성
   */
  private async findOrCreateGrokTab(): Promise<number> {
    let tabs = await Browser.tabs.query({ url: 'https://grok.com/*' })
    
    if (tabs.length > 0 && tabs[0].id) {
      const tabId = tabs[0].id
      console.log('[GROK-WEB] ✅ Found existing grok.com tab:', tabId)
      
      // 탭 새로고침하여 content script가 확실히 로드되도록 함
      console.log('[GROK-WEB] 🔄 Reloading tab to ensure content script loads...')
      await Browser.tabs.reload(tabId)
      
      // 로드 완료 대기
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      return tabId
    }

    // 탭이 없으면 새로 생성
    console.log('[GROK-WEB] 📌 Creating new grok.com tab...')
    const tab = await Browser.tabs.create({ url: 'https://grok.com', active: false })
    
    if (!tab.id) {
      throw new ChatError('Failed to create grok.com tab', ErrorCode.UNKOWN_ERROR)
    }

    // 탭이 로드될 때까지 대기
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    console.log('[GROK-WEB] ✅ Created new grok.com tab:', tab.id)
    return tab.id
  }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    console.log('[GROK-WEB] 🚀 Starting message send (grok-4-auto + Complete Headers)...')
    
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
      
      // 인증 오류 시 친절한 메시지
      if (error instanceof ChatError && error.code === ErrorCode.TWITTER_UNAUTHORIZED) {
        throw new ChatError(
          'Grok requires an X (Twitter) account.\n\n' +
          'Please:\n' +
          '1. Open https://grok.com in a new tab\n' +
          '2. Log in with your X/Twitter account\n' +
          '3. Return here and try again\n\n' +
          'ℹ️ All X users get free Grok access (with daily limits).',
          ErrorCode.TWITTER_UNAUTHORIZED
        )
      }
      
      throw error
    }
  }

  /**
   * 새 대화 생성 (Complete Headers for Cloudflare bypass)
   */
  private async sendConversationMessage(params: SendMessageParams) {
    console.log('[GROK-WEB] 📤 Sending with complete browser headers...')
    
    // grok.com 탭 찾기
    const tabId = await this.findOrCreateGrokTab()
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    
    try {
      const resp = await proxyFetch(tabId, 'https://grok.com/rest/app-chat/conversations/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Accept-Language': 'ko,en-US;q=0.9,en;q=0.8',
          'Referer': 'https://grok.com/',
          'Origin': 'https://grok.com',
          'Sec-Ch-Ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'User-Agent': navigator.userAgent,
        },
        body: JSON.stringify({
          temporary: false,
          modelName: 'grok-4-auto', // ✅ 2025 최신 모델 (auto 모드)
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
      })

      clearTimeout(timeoutId)

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          throw new ChatError(
            'Please log in to grok.com first',
            ErrorCode.TWITTER_UNAUTHORIZED
          )
        }
        if (resp.status === 429) {
          throw new ChatError(
            'Daily Grok limit reached.\n\n' +
            'ℹ️ Free users: Limited daily messages\n' +
            'ℹ️ Premium users: Higher limits\n\n' +
            'Please wait until tomorrow or upgrade for more access.',
            ErrorCode.CONVERSATION_LIMIT
          )
        }
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      }

      const responseText = await resp.text()
      
      // Base64 디코딩
      const decoded = atob(responseText)
      
      await this.parseNDJSONStream(decoded, params)
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
