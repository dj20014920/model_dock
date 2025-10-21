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
    const cfg = await getUserConfig().catch(() => ({} as any))
    const trySession = async () => {
      // chatgpt.com 우선 시도(최근 기본 호스트)
      console.debug('[GPT-WEB] session try chatgpt.com')
      let resp: Response
      if ((cfg as any).chatgptWebappAlwaysProxy === true) {
        // same-origin로 세션 확인(권한/탭 자동 생성은 downstream 경로에서 처리)
        let tabId = await this.findExistingChatGPTTabId().catch(() => undefined)
        if (!tabId) {
          try { await Browser.tabs.create({ url: 'https://chatgpt.com', pinned: true, active: false }); await new Promise(r=>setTimeout(r,1000)) } catch {}
          tabId = await this.findExistingChatGPTTabId().catch(() => undefined)
        }
        if (tabId) {
          try {
            // inpage-bridge는 기본적으로 credentials:'include'로 호출하므로 옵션 없이 호출
            resp = await proxyFetch(tabId, 'https://chatgpt.com/api/auth/session')
          } catch {
            resp = await this.fetch('https://chatgpt.com/api/auth/session')
          }
        } else {
          resp = await this.fetch('https://chatgpt.com/api/auth/session')
        }
      } else {
        resp = await this.fetch('https://chatgpt.com/api/auth/session')
      }
      if (resp.ok) {
        this.baseHost = 'https://chatgpt.com'
        console.debug('[GPT-WEB] session ok @ chatgpt.com')
        return resp
      }
      // 구 버전/지역에서 chat.openai.com이 유효할 수 있음 → 폴백
      console.debug('[GPT-WEB] session try chat.openai.com')
      resp = await this.fetch('https://chat.openai.com/api/auth/session')
      if (resp.ok) {
        this.baseHost = 'https://chat.openai.com'
        console.debug('[GPT-WEB] session ok @ chat.openai.com')
        return resp
      }
      return resp
    }

    const resp = await trySession()

    if (resp.status === 403) {
      throw new ChatError(
        'Cloudflare 보안 확인이 필요합니다.\n\n해결 방법:\n1. 브라우저에서 chatgpt.com을 직접 엽니다\n2. Cloudflare 챌린지를 완료합니다\n3. ChatGPT에 로그인합니다\n4. 5-10분 후 다시 시도합니다',
        ErrorCode.CHATGPT_CLOUDFLARE,
      )
    }

    if (resp.status === 401) {
      throw new ChatError(
        'ChatGPT 로그인이 필요합니다.\n\n해결 방법:\n1. 브라우저에서 chatgpt.com을 엽니다\n2. ChatGPT 계정으로 로그인합니다\n3. 다시 시도합니다',
        ErrorCode.CHATGPT_UNAUTHORIZED,
      )
    }

    const data = await resp.json().catch(() => ({}))
    console.debug('[GPT-WEB] session response', {
      status: resp.status,
      hasAccessToken: !!data.accessToken,
      hasUser: !!data.user,
    })

    if (!data.accessToken) {
      throw new ChatError(
        'No logged-in ChatGPT session found. Please open chatgpt.com and login, then retry.',
        ErrorCode.CHATGPT_UNAUTHORIZED
      )
    }
    console.debug('[GPT-WEB] accessToken obtained')
    return data.accessToken
  }

  private async requestBackendAPIWithToken(
    token: string,
    method: 'GET' | 'POST',
    path: string,
    data?: unknown,
    extraHeaders?: Record<string, string>,
  ) {
    // ✅ ChatHub 방식: 최소한의 헤더만 사용
    const base = this.baseHost || 'https://chatgpt.com'
    const isSSE = path.startsWith('/conversation')
    const isSentinel = path.startsWith('/sentinel')
    const cfg = await getUserConfig().catch(() => ({} as any))
    const headerMode: 'minimal' | 'browserlike' = (cfg as any).chatgptWebappHeaderMode || 'browserlike'
    const cookieOnly = (cfg as any).chatgptWebappCookieOnly === true
    console.debug('[GPT-WEB] backend request', { base, path, method, isSSE, isSentinel, headerMode, cookieOnly })
    
    // 공통 헤더: Sentinel/Conversation 모두에 디바이스/언어 헤더 포함 (HAR 패턴 모방)
    const deviceId = await this.getConsistentDeviceId()
    const commonHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headerMode === 'browserlike' ? (isSSE ? { Accept: 'text/event-stream' } : { Accept: 'application/json' }) : {}),
      ...(cookieOnly ? {} : { 'Authorization': `Bearer ${token}` }),
      'oai-device-id': deviceId,
      'oai-language': navigator.language || 'en-US',
    }
    
    // 🔥 CRITICAL: Sentinel proof token을 헤더로 추가 (ChatHub HAR 패턴)
    // conversation 요청 시에만 proof token 헤더 추가
    if (isSSE && extraHeaders?.['openai-sentinel-proof-token']) {
      commonHeaders['openai-sentinel-proof-token'] = extraHeaders['openai-sentinel-proof-token']
    }
    
    // 🔥 CRITICAL: Sentinel requirements token을 헤더로 추가 (ChatHub HAR 패턴)
    if (isSSE && extraHeaders?.['openai-sentinel-chat-requirements-token']) {
      commonHeaders['openai-sentinel-chat-requirements-token'] = extraHeaders['openai-sentinel-chat-requirements-token']
    }
    
    // extraHeaders 병합 (위의 특별 헤더 제외)
    const filteredExtraHeaders = { ...extraHeaders }
    delete filteredExtraHeaders['openai-sentinel-proof-token']
    delete filteredExtraHeaders['openai-sentinel-chat-requirements-token']
    Object.assign(commonHeaders, filteredExtraHeaders)

    return this.fetch(`${base}/backend-api${path}`, {
      method,
      headers: commonHeaders,
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  }

  async getSentinel(
    token: string,
  ): Promise<{
    requirementsToken?: string
    proofToken?: string
    powProof?: string
    powRequired?: boolean
    turnstileRequired?: boolean
    // for future offscreen Turnstile solver
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
    // Prefer same-origin path for Sentinel when possible to unify context (or when alwaysProxy enabled)
    let existingTabId = await this.findExistingChatGPTTabId().catch(() => undefined)
    try {
      const cfg = await getUserConfig().catch(() => ({} as any))
      if (!existingTabId && (cfg as any).chatgptWebappAlwaysProxy === true) {
        await Browser.tabs.create({ url: 'https://chatgpt.com', pinned: true, active: false })
        await new Promise((r) => setTimeout(r, 1000))
        existingTabId = await this.findExistingChatGPTTabId().catch(() => undefined)
      }
    } catch {}
    if (existingTabId) {
      try {
        const base = this.baseHost || 'https://chatgpt.com'
        const deviceId = await this.getConsistentDeviceId()
        const url = `${base}/backend-api/sentinel/chat-requirements`
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'oai-device-id': deviceId,
          'oai-language': navigator.language || 'en-US',
        }
        resp = await proxyFetch(existingTabId, url, { method: 'POST', headers, body: JSON.stringify({ p: proofToken }) })
      } catch (e) {
        resp = await this.requestBackendAPIWithToken(token, 'POST', '/sentinel/chat-requirements', { p: proofToken })
      }
    } else {
      resp = await this.requestBackendAPIWithToken(token, 'POST', '/sentinel/chat-requirements', { p: proofToken })
    }
    console.log(`[GPT-WEB][SENTINEL] Response status: ${resp.status}`)
    
    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '')
      console.error(`[GPT-WEB][SENTINEL] ❌ Error ${resp.status}:`, errorText.substring(0, 300))
      throw new Error(`HTTP ${resp.status}`)
    }
    
    let data: any = {}
    try {
      data = await resp.json()
      // Log full response for debugging
      console.log('[GPT-WEB][SENTINEL] 📦 Full response:', JSON.stringify(data, null, 2))
    } catch (err) {
      console.error('[GPT-WEB][SENTINEL] Failed to parse JSON:', err)
    }
    
    // 다양한 응답 형태를 관용적으로 수용
    const requirementsToken = data?.token || data?.sentinel_token || data?.requirementsToken
    
    const powRequired = data?.proofofwork?.required === true
    const turnstileRequired = data?.turnstile?.required === true
    
    // 🔥 CRITICAL: POW 계산 필수 - Base64 proof와 별도로 POW 답안 생성
    let powProof: string | undefined = undefined
    
    if (powRequired && data?.proofofwork?.seed && data?.proofofwork?.difficulty) {
      console.log('[GPT-WEB][SENTINEL] 🔨 POW required - calculating proof...')
      
      try {
        const { calculateProofOfWorkWithTimeout } = await import('~services/pow-calculator')
        
        const powResult = await calculateProofOfWorkWithTimeout(
          data.proofofwork.seed,
          data.proofofwork.difficulty,
          proofToken, // Base64 브라우저 지문을 proof data로 사용
          30000 // 30초 타임아웃
        )
        
        powProof = powResult.proof
        console.log('[GPT-WEB][SENTINEL] ✅ POW calculated successfully')
        console.log(`[POW] Nonce: ${powResult.nonce}`)
        console.log(`[POW] Hash: ${powResult.hash}`)
        console.log(`[POW] Attempts: ${powResult.attempts}`)
        console.log(`[POW] Time: ${powResult.timeMs}ms`)
      } catch (err) {
        console.error('[GPT-WEB][SENTINEL] ❌ POW calculation failed:', err)
        console.warn('[GPT-WEB][SENTINEL] ⚠️ Continuing without POW - request will likely fail')
      }
    }
    
    // Log what we found
    console.log('[GPT-WEB][SENTINEL] ✅ Parsed response:', {
      hasReqToken: !!requirementsToken,
      reqTokenPreview: requirementsToken?.substring(0, 30) + '...',
      hasProofToken: !!proofToken,
      proofTokenPreview: proofToken?.substring(0, 30) + '...',
      hasPowProof: !!powProof,
      powProofPreview: powProof?.substring(0, 30) + '...',
      powRequired,
      powDifficulty: data?.proofofwork?.difficulty,
      powSeed: data?.proofofwork?.seed,
      turnstileRequired,
      turnstileDx: data?.turnstile?.dx?.substring?.(0, 30) + '...'
    })
    
    // ⚠️ Log warnings if additional challenges are required
    if (turnstileRequired) {
      console.warn(
        `[GPT-WEB][SENTINEL] ⚠️ Turnstile challenge required (dx available: ${!!data?.turnstile?.dx})`,
      )
    }
    
    // 🎯 2개의 proof 반환:
    // 1. proofToken: Base64 브라우저 지문 (openai-sentinel-proof-token 헤더용)
    // 2. powProof: POW 계산 결과 (body의 proof_token 필드용 또는 별도 헤더)
    return {
      requirementsToken,
      proofToken,
      powProof,
      powRequired,
      turnstileRequired,
      turnstileDx: data?.turnstile?.dx,
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

  // Proxy-free variant: no-op
  async fixAuthState(_forceProxy = false) {}
}

export const chatGPTClient = new ChatGPTClient()
