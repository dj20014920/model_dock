import { requestHostPermission } from '~app/utils/permissions'
import { hybridFetch } from '~app/utils/hybrid-requester'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { parseSSEResponse } from '~utils/sse'
import Browser from 'webextension-polyfill'

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
   * PoW 챌린지는 inpage-fetch-bridge.js에서 자동으로 처리됩니다
   * hybridFetch를 통해 ProxyRequester가 deepseek.com 탭에서 요청을 실행하여 쿠키를 자동 포함합니다
   */
  private async createChatSession(signal?: AbortSignal): Promise<string> {
    console.log('[DeepSeek] 💬 Creating new chat session...')

    const buildRequestOptions = () => ({
      method: 'POST',
      signal,
      credentials: 'include' as RequestCredentials,
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Origin': 'https://chat.deepseek.com',
        'Referer': 'https://chat.deepseek.com/',
        // DeepSeek 웹앱이 항상 포함하는 클라이언트 식별 헤더
        'x-app-version': '20241129.1',
        'x-client-locale': 'en_US',
        'x-client-platform': 'web',
        'x-client-version': '1.5.0',
      },
      body: JSON.stringify({}),
    })

    // ProxyRequester가 자동으로 deepseek.com 탭을 찾거나 생성합니다
    console.log('[DeepSeek] 📡 Requesting chat session via ProxyRequester...')
    const resp = await hybridFetch(
      'https://chat.deepseek.com/api/v0/chat_session/create',
      buildRequestOptions(),
      {
        homeUrl: 'https://chat.deepseek.com',
        hostStartsWith: 'https://chat.deepseek.com',
      },
      { reuseOnly: false }
    )

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '')

      // ProxyRequester의 탭 로딩 실패 에러 처리
      if (resp.status === 500 && resp.statusText?.includes('DeepSeek 탭 로딩 실패')) {
        // 자동으로 로그인 페이지 열기
        await this.ensureDeepSeekLogin()
        // ensureDeepSeekLogin()이 에러를 던지므로 아래 코드는 실행되지 않음
      }

      throw new ChatError(
        `DeepSeek 요청 실패: ${resp.status} ${resp.statusText || errorText}`,
        ErrorCode.NETWORK_ERROR
      )
    }

    const data = await resp.json().catch(() => ({}))
    console.log('[DeepSeek] 📦 API Response:', JSON.stringify(data).substring(0, 200))

    // DeepSeek API는 HTTP 200이지만 body에 error code를 포함
    if (data.code !== 0) {
      console.error('[DeepSeek] ❌ API error:', data.code, data.msg)

      if (data.code === 40002 || data.msg?.includes('Token')) {
        // 사용자 정보를 찾을 수 없을 때 (40002) 자동으로 로그인 페이지 열기
        await this.ensureDeepSeekLogin()
        // ensureDeepSeekLogin()이 항상 에러를 throw하므로 아래 코드는 실행되지 않음
      }

      throw new ChatError(`DeepSeek API 오류: ${data.msg || data.code}`, ErrorCode.NETWORK_ERROR)
    }

    // DeepSeek API 응답 구조: data.data.biz_data.id
    const chatSessionId = data?.data?.biz_data?.id

    if (!chatSessionId) {
      console.error('[DeepSeek] ❌ Invalid response structure:', JSON.stringify(data))
      throw new ChatError(
        '채팅 세션 ID를 받지 못했습니다.',
        ErrorCode.UNKOWN_ERROR
      )
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
    const clientStreamId = `${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.random().toString(36).substring(2, 18)}`
    const requestBody = {
      chat_session_id: this.conversationContext.chatSessionId,
      parent_message_id: this.conversationContext.parentMessageId,
      prompt: params.prompt,
      ref_file_ids: [],
      thinking_enabled: false,
      search_enabled: false,
      client_stream_id: clientStreamId, // 웹사이트와 동일하게 추가
    }

    console.log('[DeepSeek] 📤 Sending request to /api/v0/chat/completion')
    console.log('[DeepSeek] 📦 Request body:', JSON.stringify(requestBody).substring(0, 200))

    const completionOptions = {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Origin': 'https://chat.deepseek.com',
        'Referer': 'https://chat.deepseek.com/',
        // 웹앱과 동일한 식별 헤더(ProxyRequester 경유 시에도 명시)
        'x-app-version': '20241129.1',
        'x-client-locale': 'en_US',
        'x-client-platform': 'web',
        'x-client-version': '1.5.0',
      },
      credentials: 'include' as RequestCredentials,
      body: JSON.stringify(requestBody),
    }

    try {
      console.log('[DeepSeek] 🔄 Using ProxyRequester for SSE stream...')
      let resp = await hybridFetch(
        'https://chat.deepseek.com/api/v0/chat/completion',
        completionOptions,
        {
          homeUrl: 'https://chat.deepseek.com',
          hostStartsWith: 'https://chat.deepseek.com',
        },
        { reuseOnly: true }
      )

      if (resp.status === 401 && resp.statusText === 'NO_PROXY_TAB') {
        console.warn('[DeepSeek] ⚠️ No active deepseek.com tab detected for SSE. Creating one now...')
        resp = await hybridFetch(
          'https://chat.deepseek.com/api/v0/chat/completion',
          completionOptions,
          {
            homeUrl: 'https://chat.deepseek.com',
            hostStartsWith: 'https://chat.deepseek.com',
          },
          { reuseOnly: false }  // 탭이 없으면 자동 생성
        )
      }

      if (!resp.ok) {
        console.error('[DeepSeek] ❌ Request failed:', resp.status, resp.statusText)
        const errorText = await resp.text().catch(() => '')

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

  /**
   * 쿠키 확인 및 로그인 필요 시 자동으로 pinned tab 열기
   *
   * DeepSeek 공식 인증 쿠키 (출처: https://cdn.deepseek.com/policies/en-US/cookies-policy.html):
   * - ds_session_id: 필수 세션 쿠키 (chat.deepseek.com)
   * - cf_clearance: Cloudflare 보안 쿠키 (.deepseek.com, 1년)
   * - __cf_bm: Cloudflare bot 관리 (.deepseek.com, 30분)
   */
  private async ensureDeepSeekLogin() {
    console.log('[DeepSeek] 🔍 Checking login status...')

    const cookies = await Browser.cookies.getAll({ domain: '.deepseek.com' })

    // DeepSeek 공식 세션 쿠키 확인 (정확한 이름 매칭)
    const hasSessionCookie = cookies.some(c => c.name === 'ds_session_id')

    console.log('[DeepSeek] 🍪 ds_session_id cookie:', hasSessionCookie)
    console.log('[DeepSeek] 📋 All cookies:', cookies.map(c => c.name).join(', '))

    if (!hasSessionCookie) {
      console.log('[DeepSeek] 🌐 Opening deepseek.com in pinned tab for login...')

      // 자동으로 pinned tab으로 deepseek.com 열기
      await Browser.tabs.create({
        url: 'https://chat.deepseek.com/',
        pinned: true,
        active: true  // 로그인을 위해 활성 탭으로 열기
      })

      throw new ChatError(
        'DeepSeek 로그인이 필요합니다.\n\n' +
        '✅ 로그인 페이지가 열렸습니다.\n' +
        '1. 열린 탭에서 DeepSeek 계정으로 로그인하세요\n' +
        '2. 로그인 후 이 탭을 닫지 마세요 (pinned tab으로 고정됩니다)\n' +
        '3. 로그인 완료 후 다시 시도하세요',
        ErrorCode.MISSING_HOST_PERMISSION
      )
    }
  }

  /**
   * @deprecated ProxyRequester가 자동으로 탭 관리를 처리합니다
   * 하위 호환성을 위해 메서드는 유지하지만 아무 작업도 하지 않습니다
   */
  private async ensureDeepSeekTab() {
    // ProxyRequester가 모든 탭 관리를 담당
    return
  }
}
