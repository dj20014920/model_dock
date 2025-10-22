import { ofetch } from 'ofetch'
import Browser from 'webextension-polyfill'
import { proxyFetch } from '~services/proxy-fetch'
import { RequestInitSubset } from '~types/messaging'
import { ChatError, ErrorCode } from '~utils/errors'
import { getUserConfig } from '~services/user-config'
import { Requester, globalFetchRequester, backgroundFetchRequester, proxyFetchRequester } from './requesters'

class ChatGPTClient {
  requester: Requester
  private baseHost?: string
  private deviceId?: string

  constructor() {
    // 기본 Requester는 background로 두되,
    // Sentinel/Conversation은 same-origin 경로를 별도로 사용한다(코드 내 우선 경로 존재).
    // 설정(alwaysProxy)에 따라 이후 런타임에서 프록시 경로가 더 많이 사용될 수 있다.
    console.log('[GPT-WEB] 🧭 Default requester: background (sentinel/conversation may use same-origin per settings)')
    this.requester = backgroundFetchRequester
  }

  async fetch(url: string, options?: RequestInitSubset): Promise<Response> {
    // Ensure cookies are sent for ChatGPT web endpoints
    const merged: any = { 
      credentials: 'include', 
      ...(options as any)
    }
    
    console.debug('[GPT-WEB] fetch', url.substring(0, 80), {
      hasBody: !!merged?.body,
      method: merged?.method || 'GET',
    })
    
    const resp = await this.requester.fetch(url, merged)
    console.debug('[GPT-WEB] fetch status', resp.status, resp.statusText)
    
    return resp
  }

  async getAccessToken(): Promise<string> {
    console.log('[GPT-WEB] 🔑 getAccessToken() called')
    // 동일출처(Main world) 경로만 허용: 이미 열린 chatgpt.com 탭이 필요
    const tabId = await this.findExistingChatGPTTabId().catch(() => undefined)
    if (!tabId) {
      throw new ChatError(
        'chatgpt.com 탭이 필요합니다.\n\n해결:\n1) 브라우저에서 chatgpt.com을 열어 로그인\n2) 페이지에서 1회 대화를 보낸 뒤 확장에서 다시 시도',
        ErrorCode.CHATGPT_AUTH,
      )
    }
    const base = 'https://chatgpt.com'
    let resp: Response
    try {
      resp = await proxyFetch(tabId, `${base}/api/auth/session`)
    } catch (e) {
      throw new ChatError('세션 확인 실패: chatgpt.com 탭을 새로고침 후 다시 시도하세요.', ErrorCode.NETWORK_ERROR)
    }
    if (resp.status === 403) {
      throw new ChatError('Cloudflare 보안 확인 필요: chatgpt.com 탭에서 보안 검증 통과 후 재시도', ErrorCode.CHATGPT_CLOUDFLARE)
    }
    if (resp.status === 401) {
      throw new ChatError('ChatGPT 로그인이 필요합니다. chatgpt.com에서 로그인 후 재시도', ErrorCode.CHATGPT_UNAUTHORIZED)
    }
    const data = await resp.json().catch(() => ({}))
    if (!data.accessToken) {
      throw new ChatError('로그인 세션이 없습니다. chatgpt.com에서 로그인 후 재시도', ErrorCode.CHATGPT_UNAUTHORIZED)
    }
    this.baseHost = base
    console.debug('[GPT-WEB] accessToken obtained')
    return data.accessToken
  }

  private async requestBackendAPIWithToken(
    _token: string,
    method: 'GET' | 'POST',
    path: string,
    data?: unknown,
    extraHeaders?: Record<string, string>,
  ) {
    // 동일출처(Main world) 경로만 허용: 이미 열린 chatgpt.com 탭 필요
    const tabId = await this.findExistingChatGPTTabId().catch(() => undefined)
    if (!tabId) {
      throw new ChatError('chatgpt.com 탭이 필요합니다. 페이지를 열고 다시 시도하세요.', ErrorCode.CHATGPT_AUTH)
    }
    const base = this.baseHost || 'https://chatgpt.com'
    const isSSE = path.startsWith('/conversation')
    const deviceId = await this.getConsistentDeviceId()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(isSSE ? { Accept: 'text/event-stream' } : { Accept: 'application/json' }),
      'oai-device-id': deviceId,
      'oai-language': navigator.language || 'en-US',
      ...(extraHeaders || {}),
    }
    const body = data === undefined ? undefined : JSON.stringify(data)
    return proxyFetch(tabId, `${base}/backend-api${path}`, { method, headers, body })
  }

  async getSentinel(
    _token: string,
  ): Promise<{
    requirementsToken?: string
    proofToken?: string
    powProof?: string
    powRequired?: boolean
    turnstileRequired?: boolean
    turnstileDx?: string
  }> {
    // 일부 계정/지역에서 대화 전에 Sentinel 토큰이 필요
    // 🔥 CRITICAL: Sentinel 응답에 POW(Proof of Work)와 Turnstile 요구사항 포함됨
    
    // 🎯 BASE64 방식: 브라우저 지문을 Base64로 인코딩하여 proof token으로 사용
    // ChatHub HAR 분석 결과: openai-sentinel-proof-token 헤더에 브라우저 지문 전송
    const proofToken = this.generateBrowserProof()
    console.log('[GPT-WEB][SENTINEL] 🔐 Generated proof token (Base64 browser fingerprint)')
    console.log(`[GPT-WEB][SENTINEL] Proof token length: ${proofToken.length} chars`)
    
    // Sentinel 요청 시 proof data도 body에 포함
    let resp: Response
    // 동일출처(Main world) 필수: 탭 없으면 중단
    const existingTabId = await this.findExistingChatGPTTabId().catch(() => undefined)
    if (!existingTabId) {
      throw new ChatError('chatgpt.com 탭이 필요합니다. 페이지를 열고 다시 시도하세요.', ErrorCode.CHATGPT_AUTH)
    }
    try {
      const base = this.baseHost || 'https://chatgpt.com'
      const deviceId = await this.getConsistentDeviceId()
      const url = `${base}/backend-api/sentinel/chat-requirements`
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'oai-device-id': deviceId,
        'oai-language': navigator.language || 'en-US',
      }
      resp = await proxyFetch(existingTabId, url, { method: 'POST', headers, body: JSON.stringify({ p: proofToken }) })
    } catch (e) {
      throw new ChatError('Sentinel 요청 실패(동일출처). chatgpt.com 탭을 새로고침 후 재시도', ErrorCode.NETWORK_ERROR)
    }
    console.log(`[GPT-WEB][SENTINEL] Response status: ${resp.status}`)

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '')
      console.error(`[GPT-WEB][SENTINEL] ❌ Error ${resp.status}:`, errorText.substring(0, 300))
      throw new Error(`HTTP ${resp.status}`)
    }

    // 강건한 JSON 파싱(XSSI/HTML 방어) + 토큰 필수 게이트
    const parseSentinelJson = async (r: Response) => {
      const ctype = (r.headers?.get('content-type') || '').toLowerCase()
      const raw = await r.text()
      console.log('[GPT-WEB][SENTINEL] 📦 Raw response length:', raw.length)
      if (!ctype.includes('application/json')) {
        throw new Error('NON_JSON')
      }
      const cleaned = raw
        .replace(/^\)\]\}',?\s*/, '')
        .replace(/^for\s*\(\s*;;\s*\);\s*/, '')
        .replace(/^\uFEFF/, '')
      let json: any
      try { json = JSON.parse(cleaned) } catch { throw new Error('BAD_JSON') }
      const token = json?.token || json?.sentinel_token || json?.requirementsToken
      if (!token) throw new Error('NO_REQ_TOKEN')
      return json
    }

    let data: any
    try {
      data = await parseSentinelJson(resp)
      console.log('[GPT-WEB][SENTINEL] ✅ JSON parsed successfully')
      console.log('[GPT-WEB][SENTINEL] 📦 Full response:', JSON.stringify(data, null, 2))
    } catch (err) {
      console.error('[GPT-WEB][SENTINEL] ❌ Sentinel parse/token error:', (err as Error)?.message)
      throw new ChatError(
        'Sentinel 토큰을 획득하지 못했습니다.\n\n해결:\n1) chatgpt.com 탭에서 보안 확인을 통과\n2) 로그인 후 1회 대화 전송\n3) 확장에서 다시 시도',
        ErrorCode.CHATGPT_CLOUDFLARE,
      )
    }
    
    // 다양한 응답 형태를 관용적으로 수용
    const requirementsToken = data?.token || data?.sentinel_token || data?.requirementsToken

    console.log('[GPT-WEB][SENTINEL] ✅ Parsed response:', {
      hasReqToken: !!requirementsToken,
      reqTokenPreview: requirementsToken?.substring(0, 30) + '...',
      hasProofToken: !!proofToken,
      proofTokenPreview: proofToken?.substring(0, 30) + '...',
    })

    return {
      requirementsToken,
      proofToken,
    }
  }

  private generateBrowserProof(): string {
    // ✅ HAR 분석 결과: Service Worker에서도 정확한 브라우저 프로필 사용
    // HAR 성공 패턴: ["Mon, 20 Oct 2025 08:05:25 GMT","8","1680x1050","Mozilla/5.0...","","","ko","ko,en-US,en",10]
    
    // 실제 navigator 값 사용 (Service Worker에서도 접근 가능)
    const hardwareConcurrency = (navigator as any).hardwareConcurrency || 8
    const userAgent = (navigator as any).userAgent || ''
    const language = (navigator as any).language || 'en-US'
    
    // languages 배열 처리
    let languagesStr = language + ',en-US,en'
    if (Array.isArray((navigator as any).languages) && (navigator as any).languages.length > 0) {
      languagesStr = (navigator as any).languages.join(',')
    }
    
    // 화면 해상도: 실제 브라우저 값을 우선 사용 (하드코딩 제거)
    const scr: any = (globalThis as any).screen
    const iw = (globalThis as any).innerWidth
    const ih = (globalThis as any).innerHeight
    const screenSize = (scr && typeof scr.width === 'number' && typeof scr.height === 'number')
      ? `${scr.width}x${scr.height}`
      : (iw && ih ? `${iw}x${ih}` : '1920x1080')
    
    const proofArray = [
      new Date().toUTCString(),        // 0: 현재 시간 (GMT)
      String(hardwareConcurrency),     // 1: CPU 코어 수
      screenSize,                       // 2: 화면 해상도
      userAgent,                        // 3: User-Agent
      '',                               // 4: 플러그인 지문 (deprecated)
      '',                               // 5: Canvas 지문 (optional)
      language,                         // 6: 기본 언어
      languagesStr,                     // 7: 지원 언어 목록
      10                                // 8: 상수 (HAR에서 확인)
    ]
    
    const proofJson = JSON.stringify(proofArray)
    const proofBase64 = btoa(proofJson)
    
    console.log('[GPT-WEB][PROOF] Generated browser proof:', {
      arrayLength: proofArray.length,
      hardwareConcurrency,
      screenSize,
      language,
      languagesStr: languagesStr.substring(0, 30) + '...',
      base64Length: proofBase64.length,
      preview: proofBase64.substring(0, 50) + '...'
    })
    
    return proofBase64
  }

  private async getPersistentDeviceId(): Promise<string> {
    // 저장된 디바이스 ID를 우선 사용하여 Cloudflare/세션 점수를 안정화
    if (this.deviceId) return this.deviceId
    try {
      const got = await Browser.storage.local.get('oaiDeviceId')
      const existing = got?.oaiDeviceId as string | undefined
      if (existing && typeof existing === 'string') {
        this.deviceId = existing
        return existing
      }
    } catch {}
    // 생성 후 저장
    const uuid = (crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })) as string
    this.deviceId = uuid
    try { await Browser.storage.local.set({ oaiDeviceId: uuid }) } catch {}
    console.debug('[GPT-WEB] Generated device id (persisted)', uuid)
    return uuid
  }

  // 동일 출처 탭이 있으면 페이지 쿠키(oai-did)를 우선 사용하여 헤더 정합성 강화
  private async getConsistentDeviceId(): Promise<string> {
    try {
      const tabId = await this.findExistingChatGPTTabId()
      if (tabId) {
        try {
          const did = await Browser.tabs.sendMessage(tabId, { type: 'read-cookie', name: 'oai-did' })
          if (did && typeof did === 'string') return did
        } catch {}
      }
    } catch {}
    return this.getPersistentDeviceId()
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

  async getModels(token: string): Promise<{ slug: string; title: string; description: string; max_tokens: number }[]> {
    const resp = await this.requestBackendAPIWithToken(token, 'GET', '/models').then((r) => r.json())
    return resp.models
  }

  async generateChatTitle(token: string, conversationId: string, messageId: string) {
    await this.requestBackendAPIWithToken(token, 'POST', `/conversation/gen_title/${conversationId}`, {
      message_id: messageId,
    })
  }

  async createFileUpload(token: string, file: File): Promise<{ fileId: string; uploadUrl: string }> {
    const resp = await this.requestBackendAPIWithToken(token, 'POST', '/files', {
      file_name: file.name,
      file_size: file.size,
      use_case: 'multimodal',
    })
    const data = await resp.json()
    if (data.status !== 'success') {
      throw new Error('Failed to init ChatGPT file upload')
    }
    return {
      fileId: data.file_id,
      uploadUrl: data.upload_url,
    }
  }

  async completeFileUpload(token: string, fileId: string) {
    await this.requestBackendAPIWithToken(token, 'POST', `/files/${fileId}/uploaded`, {})
  }

  async uploadFile(token: string, file: File) {
    const { fileId, uploadUrl } = await this.createFileUpload(token, file)
    await ofetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-version': '2020-04-08',
        'Content-Type': file.type,
      },
    })
    await this.completeFileUpload(token, fileId)
    return fileId
  }

  // 사용자 클릭에 의해 호출됨: chatgpt.com 탭 열기/포커스 + 세션 확인
  async fixAuthState(): Promise<boolean> {
    try {
      const tabId = await this.findExistingChatGPTTabId().catch(() => undefined)
      let targetTabId = tabId
      if (!targetTabId) {
        try {
          const tab = await Browser.tabs.create({ url: 'https://chatgpt.com', active: true })
          targetTabId = tab.id
        } catch (e) {
          console.error('[GPT-WEB] fixAuthState: failed to create tab', (e as Error)?.message)
          return false
        }
      } else {
        try { await Browser.tabs.update(targetTabId, { active: true }) } catch {}
      }
      // 초기화 대기
      await new Promise((r) => setTimeout(r, 1200))
      if (!targetTabId) return false
      // 세션 확인 시도
      try {
        const resp = await proxyFetch(targetTabId, 'https://chatgpt.com/api/auth/session')
        if (!resp.ok) return false
        const data = await resp.json().catch(() => ({}))
        return !!(data && (data.user || data.accessToken))
      } catch (e) {
        return false
      }
    } catch (e) {
      return false
    }
  }
}

export const chatGPTClient = new ChatGPTClient()
