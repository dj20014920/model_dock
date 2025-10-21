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
    // Auto: pick best available model from session
    if (this.model === ChatGPTWebModel.Auto) {
      const token = await chatGPTClient.getAccessToken()
      const models = await chatGPTClient.getModels(token).catch(() => [] as any[])
      const slugs: string[] = models?.map((m: any) => m.slug) || []
      // Prefer newest if present; safe to include unknown entries as this filters by availability
      const priority = ['gpt-5', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4', 'gpt-3.5']
      for (const p of priority) {
        if (slugs.includes(p)) return p
      }
      // fallback to free tier default
      return 'gpt-4o-mini'
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
    
    if (!this.accessToken) {
      console.log('[GPT-WEB] 🔑 Getting access token...')
      this.accessToken = await chatGPTClient.getAccessToken()
      console.log('[GPT-WEB] ✅ Access token obtained')
    } else {
      console.log('[GPT-WEB] ♻️ Reusing existing access token')
    }

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
    
    // Log additional challenges if present
    if (sentinelTokens.powRequired && !sentinelTokens.powProof) {
      console.warn('[GPT-WEB] ⚠️ Proof of Work required but calculation failed - request will likely fail')
    } else if (sentinelTokens.powProof) {
      console.log('[GPT-WEB] ✅ POW proof calculated successfully')
    }
    // 🔥 Turnstile 우회: cf_clearance 쿠키만으로 진행 (ChatHub 방식)
    // Turnstile 토큰 생성이 실패하더라도 cf_clearance가 있으면 대부분 작동
    let turnstileContext: { token?: string; tabId?: number; cfClearance?: string } = {}
    if (sentinelTokens.turnstileRequired) {
      console.log('[GPT-WEB] 🔐 Turnstile required - attempting to bypass with cf_clearance cookie')
      const reuseOnly = true // 기존 탭만 사용 (새 탭 생성 방지)
      turnstileContext = await this.prepareTurnstileProof((sentinelTokens as any).turnstileDx, { reuseOnly })

      // Turnstile 토큰 생성 시도 (선택사항)
      if (turnstileContext.token) {
        console.log(
          '[GPT-WEB] ✅ Turnstile token prepared automatically (preview):',
          turnstileContext.token.substring(0, 12) + '...',
        )
      } else {
        console.log('[GPT-WEB] ℹ️ Turnstile token not available - will rely on cf_clearance cookie')
      }

      // cf_clearance 쿠키 확인
      if (!turnstileContext.cfClearance) {
        turnstileContext.cfClearance = await this.readCookieFromTab(turnstileContext.tabId, 'cf_clearance')
      }

      // 🔥 핵심 변경: cf_clearance가 있으면 Turnstile 토큰 없이도 진행
      if (!turnstileContext.cfClearance) {
        console.warn('[GPT-WEB] ⚠️ cf_clearance cookie not found - Cloudflare challenge required')
        throw new ChatError(
          'Cloudflare 보안 확인이 필요합니다.\n\n해결 방법:\n1) 브라우저에서 chatgpt.com을 여세요\n2) Cloudflare 챌린지를 완료하세요\n3) ChatGPT에 로그인하고 메시지를 1회 전송하세요\n4) 5-10분 후 다시 시도하세요',
          ErrorCode.CHATGPT_CLOUDFLARE,
        )
      }

      // cf_clearance 있으면 Turnstile 없어도 진행
      if (!turnstileContext.token) {
        console.log('[GPT-WEB] ✅ cf_clearance cookie found - proceeding without Turnstile token (ChatHub bypass)')
      } else {
        console.log('[GPT-WEB] ✅ Both Turnstile token and cf_clearance available - optimal security')
      }
    }

    console.log('[GPT-WEB] 🎫 Getting Arkose token...')
    const arkoseToken = await getArkoseToken()
    console.log('[GPT-WEB] ✅ Arkose token result:', arkoseToken ? `yes (${arkoseToken.substring(0, 15)}...)` : 'no (continuing without token)')

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
    }
    
    if (sentinelTokens.proofToken) {
      console.log('[GPT-WEB] 🛡️ Including Sentinel proof token (Base64 fingerprint) in header')
      conversationHeaders['openai-sentinel-proof-token'] = sentinelTokens.proofToken
    }
    
    // POW proof를 헤더에 추가 (있을 경우)
    if (sentinelTokens.powProof) {
      console.log('[GPT-WEB] 🔨 Including POW proof in header')
      conversationHeaders['openai-sentinel-pow-proof'] = sentinelTokens.powProof
    }
    
    if (turnstileContext.token) {
      conversationHeaders['openai-sentinel-turnstile-token'] = turnstileContext.token
    }
    
    // Arkose token은 body에 포함 (있을 때만)
    if (arkoseToken) {
      console.log('[GPT-WEB] 🎫 Including Arkose token in request body')
      requestBody.arkose_token = arkoseToken
    } else {
      console.log('[GPT-WEB] ⚠️ No Arkose token - proceeding without it (ChatHub style)')
    }
    
    // 우선순위: Turnstile 필요 시/설정(alwaysProxy) 시 동일 출처 요청을 우선
    let resp: Response | undefined
    const cfg2 = await getUserConfig().catch(() => ({} as any))
    let tabIdCandidate = turnstileContext.tabId || (await this.findExistingChatGPTTabId())
    const preferProxy = (cfg2 as any).chatgptWebappAlwaysProxy === true || sentinelTokens.turnstileRequired === true || !!tabIdCandidate
    if (preferProxy) {
      // 런타임 권한 확인/요청: content-script 주입 허용 필요
      const granted = await requestHostPermissions(['https://chatgpt.com/*', 'https://chat.openai.com/*']).catch(() => false)
      if (!granted) {
        console.warn('[GPT-WEB] ⚠️ Site access not granted for chatgpt.com; cannot use same-origin path')
      }
      if (!tabIdCandidate && (cfg2 as any).chatgptWebappAlwaysProxy === true) {
        try { await Browser.tabs.create({ url: 'https://chatgpt.com', pinned: true, active: false }); await new Promise(r=>setTimeout(r,1000)) } catch {}
        tabIdCandidate = await this.findExistingChatGPTTabId()
      }
      const tabId = tabIdCandidate || await this.findExistingChatGPTTabId()
      if (tabId) {
        console.log('[GPT-WEB] 🌐 Using existing ChatGPT tab for same-origin request')
        const url = `https://chatgpt.com/backend-api/conversation`
        try {
          // 가능하면 페이지 쿠키의 oai-did를 읽어 헤더와 정합을 맞춘다
          let oaiDid: string | undefined
          try { oaiDid = await Browser.tabs.sendMessage(tabId, 'read-oai-did') } catch {}
          const deviceId = oaiDid || (chatGPTClient as any).getPersistentDeviceId?.() || '00000000-0000-4000-8000-000000000000'
          const cfg = await getUserConfig().catch(() => ({} as any))
          const cookieOnly = (cfg as any).chatgptWebappCookieOnly === true
          resp = await proxyFetch(tabId, url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'oai-device-id': deviceId,
              'oai-language': navigator.language || 'en-US',
              ...conversationHeaders,
              ...(cookieOnly ? {} : { Authorization: `Bearer ${this.accessToken}` }),
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
            const url = `https://chatgpt.com/backend-api/conversation`
            let oaiDid: string | undefined
            try { oaiDid = await Browser.tabs.sendMessage(tabId, 'read-oai-did') } catch {}
            const deviceId = oaiDid || (chatGPTClient as any).getPersistentDeviceId?.() || '00000000-0000-4000-8000-000000000000'
            return proxyFetch(tabId, url, {
              method: 'POST',
              headers: {
                Accept: 'text/event-stream',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.accessToken}`,
                'oai-device-id': deviceId,
                'oai-language': navigator.language || 'en-US',
                ...conversationHeaders,
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
      chatGPTClient.generateChatTitle(this.accessToken, c.conversationId, c.lastMessageId)
    }
  }

  private async readCookieFromTab(tabId: number | undefined, name: string): Promise<string | undefined> {
    if (!tabId) return undefined
    try {
      const value = await Browser.tabs.sendMessage(tabId, { type: 'read-cookie', name })
      return typeof value === 'string' && value ? value : undefined
    } catch {
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
        const solved = await Browser.tabs.sendMessage(tabId, { type: 'TURNSTILE_SOLVE', dx })
        if (typeof solved === 'string' && solved) {
          token = solved
        } else if (solved && typeof solved === 'object' && typeof (solved as any).token === 'string') {
          token = (solved as any).token
        }
      } catch (err) {
        console.warn('[GPT-WEB] ⚠️ Turnstile solver error:', (err as Error)?.message)
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
