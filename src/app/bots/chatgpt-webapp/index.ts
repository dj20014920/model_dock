import { get as getPath } from 'lodash-es'
import Browser from 'webextension-polyfill'
import { v4 as uuidv4 } from 'uuid'
import { getImageSize } from '~app/utils/image-size'
import { ChatGPTWebModel } from '~services/user-config'
import { getUserConfig } from '~services/user-config'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { getArkoseToken } from './arkose'
import { chatGPTClient } from './client'
import { proxyFetch } from '~services/proxy-fetch'
import { proxyFetchRequester } from './requesters'
import { requestHostPermissions } from '~app/utils/permissions'
import { ImageContent, ResponseContent, ResponsePayload } from './types'

function removeCitations(text: string) {
  return text.replaceAll(/\u3010\d+\u2020source\u3011/g, '')
}

function parseResponseContent(content: ResponseContent): { text?: string; image?: ImageContent } {
  if (content.content_type === 'text') {
    return { text: removeCitations(content.parts[0]) }
  }
  if (content.content_type === 'code') {
    return { text: '_' + content.text + '_' }
  }
  if (content.content_type === 'multimodal_text') {
    for (const part of content.parts) {
      if (part.content_type === 'image_asset_pointer') {
        return { image: part }
      }
    }
  }
  return {}
}

interface ConversationContext {
  conversationId: string
  lastMessageId: string
}

export class ChatGPTWebBot extends AbstractBot {
  private accessToken?: string
  private conversationContext?: ConversationContext

  constructor(public model: ChatGPTWebModel) {
    super()
  }

  private async getModelName(): Promise<string> {
    // User override (custom slug) takes highest priority when provided
    try {
      const cfg = await getUserConfig()
      const custom = (cfg as any).chatgptWebappCustomModel
      if (custom && typeof custom === 'string' && custom.trim()) {
        return custom.trim()
      }
    } catch {}
    // Auto: 최소 통신 정책. 토큰/모델 목록 조회 없이 'auto'로 고정해 초기 대기/주입을 제거
    if (this.model === ChatGPTWebModel.Auto) {
      return 'auto'
    }
    // Explicit picks
    return this.model
  }

  private async uploadImage(image: File): Promise<ImageContent> {
    const fileId = await chatGPTClient.uploadFile(this.accessToken!, image)
    const size = await getImageSize(image)
    return {
      asset_pointer: `file-service://${fileId}`,
      width: size.width,
      height: size.height,
      size_bytes: image.size,
    }
  }

  private buildMessage(prompt: string, image?: ImageContent) {
    return {
      id: uuidv4(),
      author: { role: 'user' },
      content: image
        ? { content_type: 'multimodal_text', parts: [image, prompt] }
        : { content_type: 'text', parts: [prompt] },
    }
  }

  async doSendMessage(params: SendMessageParams) {
    console.log('[GPT-WEB] 🚀 doSendMessage started')
    // 초기 단계에서 accessToken 강제 획득 불필요: 동일 출처 쿠키/센티넬로 우선 진행
    // 필요한 경우(파일 업로드/제목 생성 등)에 한해 지연 획득

    console.log('[GPT-WEB] 🤖 Getting model name...')
    const modelName = await this.getModelName()
    console.log('[GPT-WEB] ✅ Using model:', modelName)

    // 🔥 CRITICAL: ChatHub는 Sentinel을 먼저 호출하여 proof token을 획득합니다
    // 너무 기계적인 연속 요청을 피하기 위해 소량의 지터를 삽입
    await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 250)))
    console.log('[GPT-WEB] 🛡️ Getting Sentinel tokens (chat-requirements)...')
    const sentinelTokens = await chatGPTClient.getSentinel(this.accessToken).catch((err) => {
      console.warn('[GPT-WEB] ⚠️ Sentinel request failed (continuing):', err.message)
      return { requirementsToken: undefined, proofToken: undefined, powProof: undefined, powRequired: false, turnstileRequired: false }
    })
    console.log('[GPT-WEB] ✅ Sentinel response:', { 
      hasReqToken: !!sentinelTokens.requirementsToken, 
      hasProofToken: !!sentinelTokens.proofToken,
      hasPowProof: !!sentinelTokens.powProof,
      powRequired: sentinelTokens.powRequired,
      turnstileRequired: sentinelTokens.turnstileRequired
    })

    // Turnstile이 필요한 경우, 가능한 범위 내에서 in-page solver로 토큰을 확보
    let turnstileToken: string | undefined
    if (sentinelTokens.turnstileRequired) {
      try {
        const turnstileDx = (sentinelTokens as any).turnstileDx
        if (turnstileDx) {
          const proof = await this.prepareTurnstileProof(turnstileDx, { reuseOnly: true })
          turnstileToken = proof?.token
          if (turnstileToken) {
            console.log('[GPT-WEB] ✅ Turnstile token acquired (preview):', turnstileToken.substring(0, 20) + '...')
          } else {
            console.warn('[GPT-WEB] ⚠️ Turnstile token not available (reuseOnly). You may need to open chatgpt.com tab and pass the challenge.')
          }
        }
      } catch (e) {
        console.warn('[GPT-WEB] ⚠️ Turnstile solver failed:', (e as Error)?.message)
      }
    }
    
    // Log additional challenges if present
    if (sentinelTokens.powRequired && !sentinelTokens.powProof) {
      console.warn('[GPT-WEB] ⚠️ Proof of Work required but calculation failed - request will likely fail')
    } else if (sentinelTokens.powProof) {
      console.log('[GPT-WEB] ✅ POW proof calculated successfully')
    }
    // 🔥 ChatHub 방식: Turnstile 완전 무시! (HAR 분석 결과)
    // ChatHub는 Turnstile required 플래그를 무시하고 Sentinel 토큰만 사용
    // Authorization 헤더 없이, Cookie 없이, Turnstile 토큰 없이 성공

    // 📌 핵심: Sentinel 토큰 + same-origin proxyFetch = 성공!
    console.log('[GPT-WEB] 💡 Using ChatHub strategy: Sentinel tokens only, no Turnstile, no Authorization')

    let turnstileContext: { token?: string; tabId?: number } = {}

    // Turnstile required 플래그를 무시하고, 기존 탭이 있으면 same-origin 사용
    const existingTabId = await this.findExistingChatGPTTabId()
    if (existingTabId) {
      turnstileContext.tabId = existingTabId
      console.log('[GPT-WEB] ✅ Using existing chatgpt.com tab for same-origin request:', existingTabId)
    } else {
      console.log('[GPT-WEB] ℹ️ No chatgpt.com tab found - will use background fetch (may fail if Cloudflare blocks)')
    }

    // Arkose/Turnstile 비활성: 토큰 획득 시도하지 않음
    const arkoseToken: string | undefined = undefined

    let image: ImageContent | undefined = undefined
    if (params.image) {
      console.log('[GPT-WEB] 🖼️ Uploading image...')
      image = await this.uploadImage(params.image)
      console.log('[GPT-WEB] ✅ Image uploaded')
    }

    console.log('[GPT-WEB] 📡 Calling /backend-api/conversation...')
    // 동일한 이유로 소량의 지터 삽입
    await new Promise((r) => setTimeout(r, 120 + Math.floor(Math.random() * 200)))
    const requestBody: any = {
      action: 'next',
      messages: [this.buildMessage(params.prompt, image)],
      model: modelName,
      conversation_id: this.conversationContext?.conversationId || undefined,
      parent_message_id: this.conversationContext?.lastMessageId || uuidv4(),
      conversation_mode: { kind: 'primary_assistant' },
    }
    
    // 🔥 CRITICAL: Sentinel tokens를 헤더로 전달 (ChatHub HAR 패턴)
    const conversationHeaders: Record<string, string> = {}

    if (sentinelTokens.requirementsToken) {
      console.log('[GPT-WEB] 🛡️ Including Sentinel requirements token in header')
      conversationHeaders['openai-sentinel-chat-requirements-token'] = sentinelTokens.requirementsToken
    } else {
      throw new ChatError(
        'Sentinel 토큰이 없어 대화 요청이 거부됩니다.\n\n해결:\n1) chatgpt.com 탭을 열어 보안 확인(Cloudflare)을 통과\n2) 로그인 상태에서 웹에서 1회 대화 후 다시 시도',
        ErrorCode.CHATGPT_CLOUDFLARE,
      )
    }
    
    if (sentinelTokens.proofToken) {
      console.log('[GPT-WEB] 🛡️ Including Sentinel proof token (Base64 fingerprint) in header')
      conversationHeaders['openai-sentinel-proof-token'] = sentinelTokens.proofToken
    } else {
      console.warn('[GPT-WEB] ⚠️ No proof token - this may affect request success rate')
    }

    // POW proof를 헤더에 추가 (있을 경우)
    if (sentinelTokens.powProof) {
      console.log('[GPT-WEB] 🔨 Including POW proof in header')
      conversationHeaders['openai-sentinel-pow-proof'] = sentinelTokens.powProof
    } else if (sentinelTokens.powRequired) {
      console.warn('[GPT-WEB] ⚠️ POW was required but proof missing - request may fail')
    }

    // Turnstile 토큰이 확보된 경우 헤더에 포함
    if (turnstileToken) {
      console.log('[GPT-WEB] 🎫 Including Turnstile token in header')
      conversationHeaders['openai-sentinel-turnstile-token'] = turnstileToken
    }

    // 🔥 ChatHub 방식: Turnstile 토큰 헤더 제거!
    // ChatHub HAR 분석 결과, openai-sentinel-turnstile-token 헤더가 없음
    // Sentinel 토큰만으로 충분

    // Arkose token은 body에 포함 (있을 때만)
    if (arkoseToken) {
      requestBody.arkose_token = arkoseToken
    }

    // Turnstile이 필요한데 토큰을 확보하지 못한 경우에도 시도는 진행(동일 출처 쿠키/클리어런스에 기대)
    if (sentinelTokens.turnstileRequired && !turnstileToken) {
      console.warn('[GPT-WEB] ⚠️ Turnstile required but no token; proceeding with same-origin attempt')
    }
    
    // 우선순위: 탭이 있거나 설정(alwaysProxy) 시 동일 출처 요청을 우선
    let resp: Response | undefined
    const cfg2 = await getUserConfig().catch(() => ({} as any))
    let tabIdCandidate = turnstileContext.tabId || (await this.findExistingChatGPTTabId())
    // 🔥 ChatHub 방식: Turnstile required 플래그 무시
    const preferProxy = (cfg2 as any).chatgptWebappAlwaysProxy === true || !!tabIdCandidate
    if (preferProxy) {
      // 런타임 권한 확인/요청: content-script 주입 허용 필요
      const granted = await requestHostPermissions(['https://chatgpt.com/*', 'https://chat.openai.com/*']).catch(() => false)
      if (!granted) {
        console.warn('[GPT-WEB] ⚠️ Site access not granted for chatgpt.com; cannot use same-origin path')
      }
      // 프록시 탭 자동 생성 금지: 이미 열린 탭만 사용
      const tabId = tabIdCandidate || await this.findExistingChatGPTTabId()
      if (tabId) {
        console.log('[GPT-WEB] 🌐 Using existing ChatGPT tab for same-origin request')
        // 열린 탭의 호스트에 맞춰 base 선택 (chat.openai.com 지원)
        let base = 'https://chatgpt.com'
        try {
          const tab = await Browser.tabs.get(tabId)
          const u = tab?.url || ''
          if (typeof u === 'string') {
            if (u.startsWith('https://chat.openai.com')) base = 'https://chat.openai.com'
            else if (u.startsWith('https://chatgpt.com')) base = 'https://chatgpt.com'
          }
        } catch {}
        const url = `${base}/backend-api/conversation`
        try {
          // 가능하면 페이지 쿠키의 oai-did를 읽어 헤더와 정합을 맞춘다
          let oaiDid: string | undefined
          try { oaiDid = await Browser.tabs.sendMessage(tabId, 'read-oai-did') } catch {}
          const deviceId = oaiDid || (chatGPTClient as any).getPersistentDeviceId?.() || '00000000-0000-4000-8000-000000000000'
          const cfg = await getUserConfig().catch(() => ({} as any))
          const cookieOnly = (cfg as any).chatgptWebappCookieOnly === true
          // 🔥 핵심: same-origin proxyFetch에서는 Authorization 헤더를 보내지 않음!
          // 브라우저가 자동으로 Cookie를 포함시키므로, Authorization 헤더는 오히려 봇으로 감지될 수 있음
          resp = await proxyFetch(tabId, url, {
            method: 'POST',
            headers: {
              'Accept': 'text/event-stream',
              'Content-Type': 'application/json',
              'oai-device-id': deviceId,
              'oai-language': navigator.language || 'en-US',
              ...conversationHeaders,
              // ❌ Authorization 헤더 제거 - Cookie 기반 인증 사용
            },
            body: JSON.stringify(requestBody),
          })
        } catch (e) {
          console.warn('[GPT-WEB] ⚠️ Proxy (same-origin) request failed, falling back to background', (e as Error)?.message)
        }
      }
    }
    if (!resp) {
      // 기본: background fetch (쿠키 정책으로 Turnstile이 필요하면 403이 날 수 있음)
      const bgResp = await (chatGPTClient as any).requestBackendAPIWithToken(
        this.accessToken,
        'POST',
        '/conversation',
        requestBody,
        conversationHeaders,
      ).catch(async (err: Error) => {
        // 403 Cloudflare 시에도 열린 탭이 있으면 한번 더 same-origin로 재시도
        if (err.message?.includes('CHATGPT_CLOUDFLARE')) {
          const tabId = turnstileContext.tabId || (await this.findExistingChatGPTTabId())
          if (tabId) {
            console.warn('[GPT-WEB] 🔁 Retrying via same-origin (existing tab) due to Cloudflare 403')
            // 열린 탭의 호스트에 맞춰 base 선택 (chat.openai.com 지원)
            let base = 'https://chatgpt.com'
            try {
              const tab = await Browser.tabs.get(tabId)
              const u = tab?.url || ''
              if (typeof u === 'string') {
                if (u.startsWith('https://chat.openai.com')) base = 'https://chat.openai.com'
                else if (u.startsWith('https://chatgpt.com')) base = 'https://chatgpt.com'
              }
            } catch {}
            const url = `${base}/backend-api/conversation`
            let oaiDid: string | undefined
            try { oaiDid = await Browser.tabs.sendMessage(tabId, 'read-oai-did') } catch {}
            const deviceId = oaiDid || (chatGPTClient as any).getPersistentDeviceId?.() || '00000000-0000-4000-8000-000000000000'
            // 🔥 Cloudflare 재시도: Cookie 기반 인증 (Authorization 헤더 제거)
            return proxyFetch(tabId, url, {
              method: 'POST',
              headers: {
                'Accept': 'text/event-stream',
                'Content-Type': 'application/json',
                'oai-device-id': deviceId,
                'oai-language': navigator.language || 'en-US',
                ...conversationHeaders,
                // ❌ Authorization 헤더 제거 - Cookie로만 인증
              },
              body: JSON.stringify(requestBody),
            })
          }
        }
        throw err
      })
      resp = bgResp
    }
    if (!resp) {
      throw new ChatError('Failed to obtain response', ErrorCode.NETWORK_ERROR)
    }
    console.log('[GPT-WEB] ✅ Response received, starting SSE parsing...')
    const isFirstMessage = !this.conversationContext

    await parseSSEResponse(resp, (message) => {
      console.debug('chatgpt sse message', message)
      if (message === '[DONE]') {
        params.onEvent({ type: 'DONE' })
        return
      }
      let parsed: ResponsePayload | { message: null; error: string }
      try {
        parsed = JSON.parse(message)
      } catch (err) {
        console.error(err)
        return
      }
      if (!parsed.message && parsed.error) {
        const msg = String(parsed.error || '')
        if (msg.includes('Unusual activity')) {
          params.onEvent({
            type: 'ERROR',
            error: new ChatError(
              'Cloudflare Turnstile 검증이 필요합니다.\n\n해결: chatgpt.com 탭에서 보안 챌린지를 통과하고 메시지를 1회 전송한 뒤 다시 시도하세요.',
              ErrorCode.CHATGPT_CLOUDFLARE,
            ),
          })
        } else {
          params.onEvent({
            type: 'ERROR',
            error: new ChatError(msg, ErrorCode.UNKOWN_ERROR),
          })
        }
        return
      }

      const payload = parsed as ResponsePayload

      const role = getPath(payload, 'message.author.role')
      if (role !== 'assistant' && role !== 'tool') {
        return
      }

      const content = payload.message?.content as ResponseContent | undefined
      if (!content) {
        return
      }

      const { text } = parseResponseContent(content)
      if (text) {
        this.conversationContext = { conversationId: payload.conversation_id, lastMessageId: payload.message.id }
        params.onEvent({ type: 'UPDATE_ANSWER', data: { text } })
      }
    }).catch((err: Error) => {
      if (err.message.includes('token_expired')) {
        throw new ChatError(err.message, ErrorCode.CHATGPT_AUTH)
      }
      throw err
    })

    // auto generate title on first response
    if (isFirstMessage && this.conversationContext) {
      const c = this.conversationContext
      chatGPTClient.generateChatTitle(this.accessToken as any, c.conversationId, c.lastMessageId)
    }
  }

  private async readCookieFromTab(tabId: number | undefined, name: string): Promise<string | undefined> {
    if (!tabId) return undefined

    // 🔥 Chrome cookies API 사용 (HTTPOnly 쿠키 읽기 가능)
    try {
      // 1. 먼저 Chrome cookies API로 시도 (HTTPOnly 쿠키 지원)
      const tab = await Browser.tabs.get(tabId)
      if (!tab?.url) return undefined

      // chatgpt.com 또는 .chatgpt.com 도메인에서 쿠키 검색
      let cookies = await Browser.cookies.getAll({
        name,
        url: tab.url,
      })

      // url 기반 검색 실패 시 도메인 직접 지정 (서브도메인 포함)
      if (!cookies || cookies.length === 0) {
        cookies = await Browser.cookies.getAll({
          name,
          domain: 'chatgpt.com',
        })
      }

      // 여전히 없으면 .chatgpt.com (서브도메인 포함) 시도
      if (!cookies || cookies.length === 0) {
        cookies = await Browser.cookies.getAll({
          name,
          domain: '.chatgpt.com',
        })
      }

      // 가장 최근 쿠키 사용
      if (cookies && cookies.length > 0) {
        const cookie = cookies[0]
        console.log(`[GPT-WEB] ✅ Cookie '${name}' found via Chrome API (HTTPOnly: ${cookie.httpOnly})`)
        return cookie.value
      }

      // 2. Chrome API 실패 시 fallback: Content Script의 document.cookie 시도
      console.log(`[GPT-WEB] ℹ️ Cookie '${name}' not found via Chrome API, trying document.cookie...`)
      const value = await Browser.tabs.sendMessage(tabId, { type: 'read-cookie', name })
      if (typeof value === 'string' && value) {
        console.log(`[GPT-WEB] ✅ Cookie '${name}' found via document.cookie`)
        return value
      }

      console.log(`[GPT-WEB] ⚠️ Cookie '${name}' not found in either Chrome API or document.cookie`)
      return undefined
    } catch (err) {
      console.warn('[GPT-WEB] ⚠️ Error reading cookie:', (err as Error)?.message)
      return undefined
    }
  }

  private async prepareTurnstileProof(
    dx?: string,
    options?: { reuseOnly?: boolean },
  ): Promise<{ token?: string; tabId?: number; cfClearance?: string }> {
    const reuseOnly = options?.reuseOnly === true
    let tabId: number | undefined

    if (reuseOnly) {
      tabId = await this.findExistingChatGPTTabId()
    } else {
      try {
        const proxyTab = await proxyFetchRequester.getProxyTab()
        tabId = proxyTab?.id ?? undefined
      } catch (err) {
        console.warn('[GPT-WEB] ⚠️ Failed to ensure proxy tab for Turnstile:', (err as Error)?.message)
      }
      if (!tabId) {
        tabId = await this.findExistingChatGPTTabId()
      }
    }

    let cfClearance = await this.readCookieFromTab(tabId, 'cf_clearance')
    let token: string | undefined

    if (dx && tabId) {
      try {
        console.log('[GPT-WEB] 🎯 Attempting auto-solve Turnstile via tab', tabId)
        const solved = await Browser.tabs.sendMessage(tabId, { type: 'TURNSTILE_SOLVE', dx })
        if (typeof solved === 'string' && solved) {
          token = solved
          console.log('[GPT-WEB] ✅ Turnstile token obtained (preview):', solved.substring(0, 20) + '...')
        } else if (solved && typeof solved === 'object' && typeof (solved as any).token === 'string') {
          token = (solved as any).token
          console.log('[GPT-WEB] ✅ Turnstile token obtained (preview):', (solved as any).token.substring(0, 20) + '...')
        } else {
          console.log('[GPT-WEB] ℹ️ Turnstile solver did not return a token (will rely on cf_clearance)')
        }
      } catch (err) {
        console.log('[GPT-WEB] ℹ️ Turnstile solve attempt failed (expected if sitekey not found):', (err as Error)?.message)
      }
      const updated = await this.readCookieFromTab(tabId, 'cf_clearance')
      if (updated) cfClearance = updated
    }

    return { token, tabId, cfClearance }
  }

  private async findExistingChatGPTTabId(): Promise<number | undefined> {
    try {
      const tabs = await Browser.tabs.query({})
      const hostMatch = (u?: string) => !!u && (u.startsWith('https://chatgpt.com') || u.startsWith('https://chat.openai.com'))
      const tab = tabs.find((t) => hostMatch(t.url))
      return tab?.id
    } catch {
      return undefined
    }
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  get name() {
    return `ChatGPT (webapp/${this.model})`
  }

  get supportsImageInput() {
    return true
  }
}
