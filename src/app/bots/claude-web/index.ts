import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { createConversation, fetchOrganizationId, generateChatTitle } from './api'
import { requestHostPermission } from '~app/utils/permissions'
import { ChatError, ErrorCode } from '~utils/errors'
import { hybridFetch } from '~app/utils/hybrid-requester'
import { CLAUDE_WEB_PREFERRED_MODEL_SLUGS } from './models'

interface ConversationContext {
  conversationId: string
}

export class ClaudeWebBot extends AbstractBot {
  private organizationId?: string
  private conversationContext?: ConversationContext
  private model: string

  constructor() {
    super()
    // 'auto' → 가용 모델 자동 선택 (최신 우선)
    this.model = 'auto'
  }

  private preferredModels = CLAUDE_WEB_PREFERRED_MODEL_SLUGS

  /**
   * 사용 가능한 Claude 모델을 결정합니다.
   * 
   * PRD 요구사항: "프록시 탭 모드는 죽어도 사용하지 말것"
   * - /models 엔드포인트는 일부 계정에서 403 permission_error 발생
   * - API 호출 없이 하드코딩된 선호 모델 리스트를 직접 사용
   * - doSendMessage의 폴백 루프가 실제 모델 가용성을 검증
   */
  private async resolveModel(signal?: AbortSignal): Promise<string> {
    // 디버깅/테스트용: window.__CLAUDE_MODEL_CANDIDATES__ 오버라이드 지원
    try {
      const cfg = (window as any).__CLAUDE_MODEL_CANDIDATES__ as string[] | undefined
      if (Array.isArray(cfg) && cfg.length) {
        console.debug('[ClaudeWebBot] Using custom model candidates:', cfg)
        return cfg[0]
      }
    } catch {}

    // 최신 선호 모델 반환 (completion 요청 시 폴백 루프가 가용성 검증)
    return this.preferredModels[0]
  }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    console.log('[Claude] 🚀 Starting message send')
    console.log('[Claude] 📝 Prompt:', params.prompt)
    console.log('[Claude] 📝 Raw user input:', params.rawUserInput)
    
    if (!(await requestHostPermission('https://*.claude.ai/'))) {
      throw new ChatError('Missing claude.ai permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    if (!this.organizationId) {
      this.organizationId = await fetchOrganizationId((i, init) =>
        hybridFetch(i as string, init as any, { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' }, { reuseOnly: true }),
      )
      console.log('[Claude] 🏢 Organization ID:', this.organizationId)
    }

    if (!this.conversationContext) {
      const conversationId = await createConversation(this.organizationId, (i, init) =>
        hybridFetch(i as string, init as any, { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' }, { reuseOnly: true }),
      )
      this.conversationContext = { conversationId }
      console.log('[Claude] 💬 Conversation ID:', conversationId)
      generateChatTitle(this.organizationId, conversationId, params.prompt, (i, init) =>
        hybridFetch(i as string, init as any, { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' }, { reuseOnly: true }),
      ).catch(console.error)
    }

    // 모델 결정: 사용자 지정(slug) → 가용 목록 → 선호 순서
    this.model = await this.resolveModel(params.signal)
    console.log('[Claude] 🤖 Selected model:', this.model)

    // 모델 자동 폴백 루프 (model_not_allowed 시 다음 후보 시도)
    const candidates = (() => {
      try {
        const cfg = (window as any).__CLAUDE_MODEL_CANDIDATES__ as string[] | undefined
        if (Array.isArray(cfg) && cfg.length) return cfg
      } catch {}
      // 사용자가 지정했다면 단일 후보, 아니면 선호 목록 기반
      const custom = this.model && this.model.toLowerCase() !== 'auto' ? [this.model] : []
      return custom.length ? custom : this.preferredModels.slice()
    })()

    let resp: Response | undefined
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i]
      const requestBody = {
        prompt: params.prompt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        model,
        rendering_mode: 'messages',
        attachments: [],
        files: [],
      }
      
      console.log('[Claude] 📤 Sending completion request with body:', JSON.stringify(requestBody).substring(0, 200))
      
      resp = await hybridFetch(
        `https://claude.ai/api/organizations/${this.organizationId}/chat_conversations/${this.conversationContext!.conversationId}/completion`,
        {
          method: 'POST',
          signal: params.signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
        { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' },
        { reuseOnly: true },
      )
      if (resp.ok) {
        this.model = model
        break
      }
      if (resp.status === 403) {
        const txt = await resp.text().catch(() => '')
        if (txt.includes('model_not_allowed') || txt.includes('forbidden')) {
          // 다음 후보 시도
          continue
        }
      }
      // 기타 오류는 루프 중단
      break
    }
    if (!resp) {
      throw new ChatError('Failed to request Claude completion', ErrorCode.NETWORK_ERROR)
    }

    // different models are available for different accounts
    // (상단 루프에서 대부분 처리됨)

    let result = ''

    await parseSSEResponse(resp, (message) => {
      // SSE 스트림 종료 이벤트 처리
      if (message === '[DONE]') {
        console.log('[Claude] ✅ SSE stream completed')
        return
      }

      // 디버깅을 위한 상세 로깅
      console.log('[Claude] 📨 SSE message received:', message.substring(0, 150))

      try {
        const payload = JSON.parse(message)
        
        // Claude Web API는 content_block_delta 이벤트로 텍스트를 전송
        if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
          const text = payload.delta.text || ''
          result += text
          params.onEvent({
            type: 'UPDATE_ANSWER',
            data: { text: result.trimStart() },
          })
          console.log('[Claude] 📝 Updated answer (+%d chars), total length: %d', text.length, result.length)
        } 
        // 에러 처리
        else if (payload.error) {
          console.error('[Claude] ❌ Error in response:', payload.error)
          throw new Error(JSON.stringify(payload.error))
        }
        // message_stop 이벤트로 스트림 종료 확인
        else if (payload.type === 'message_stop') {
          console.log('[Claude] 🛑 Message stop event received')
        }
        // 기타 이벤트는 로그만 (message_start, content_block_start 등)
        else if (payload.type) {
          console.log('[Claude] 📋 Event type:', payload.type)
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          console.error('[Claude] ❌ JSON parse failed:', e.message)
          console.error('[Claude] 📄 Raw message:', message.substring(0, 300))
        } else {
          throw e
        }
      }
    })

    params.onEvent({ type: 'DONE' })
    console.log('[Claude] ✅ Message send completed, final length:', result.length)
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  get name() {
    return `Claude (webapp/${this.model || 'auto'})`
  }
}
