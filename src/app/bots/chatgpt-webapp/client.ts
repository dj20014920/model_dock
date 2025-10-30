import { ofetch } from 'ofetch'
import Browser from 'webextension-polyfill'
import { ChatError, ErrorCode } from '~utils/errors'

/**
 * ChatGPT Web Client - 챗허브 방식 구현
 * 
 * 핵심 원칙:
 * - 확장 프로그램에서 직접 fetch 요청
 * - origin/referer 헤더를 chatgpt.com으로 설정
 * - credentials: 'include'로 쿠키 자동 포함
 * - 탭 관리 불필요
 */
class ChatGPTClient {
  private baseHost = 'https://chatgpt.com'
  private deviceId?: string

  /**
   * 챗허브 방식: 직접 fetch with 완전한 브라우저 헤더 + 수동 쿠키 추가
   * 
   * 중요: Service Worker에서 credentials: 'include'는 작동하지 않음
   * chrome.cookies API로 쿠키를 수동으로 읽어서 Cookie 헤더에 추가해야 함
   * 
   * 봇 감지 방지: 실제 브라우저와 동일한 헤더 전송
   */
  private async directFetch(url: string, options?: RequestInit): Promise<Response> {
    const headers = new Headers(options?.headers || {})
    
    // 챗허브 HAR 패턴: 완전한 브라우저 헤더
    headers.set('accept-language', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7')
    headers.set('origin', 'https://chatgpt.com')
    headers.set('referer', 'https://chatgpt.com/')
    headers.set('sec-ch-ua', '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"')
    headers.set('sec-ch-ua-mobile', '?0')
    headers.set('sec-ch-ua-platform', '"macOS"')
    headers.set('sec-fetch-dest', 'empty')
    headers.set('sec-fetch-mode', 'cors')
    headers.set('sec-fetch-site', 'none')
    headers.set('user-agent', navigator.userAgent)
    
    // 🔥 핵심: chrome.cookies API로 쿠키 수동 추가
    try {
      console.log('[GPT-WEB] 🔍 Attempting to read cookies from chatgpt.com...')
      const cookies = await Browser.cookies.getAll({ url: 'https://chatgpt.com' })
      console.log('[GPT-WEB] 📊 Cookies retrieved:', cookies?.length || 0)
      
      if (cookies && cookies.length > 0) {
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
        headers.set('Cookie', cookieHeader)
        console.log('[GPT-WEB] 🍪 Added cookies:', cookies.length, 'cookies')
        console.log('[GPT-WEB] 🍪 Cookie names:', cookies.map(c => c.name).join(', '))
        
        // 🔥 중요: cf_clearance 쿠키 확인 (Cloudflare 검증)
        const hasCfClearance = cookies.some(c => c.name === 'cf_clearance')
        const hasSessionToken = cookies.some(c => c.name === '__Secure-next-auth.session-token')
        const hasOaiSc = cookies.some(c => c.name === 'oai-sc')
        
        console.log('[GPT-WEB] 🔐 Critical cookies check:', {
          cf_clearance: hasCfClearance ? '✅' : '❌ MISSING',
          session_token: hasSessionToken ? '✅' : '❌ MISSING',
          oai_sc: hasOaiSc ? '✅' : '❌ MISSING',
        })
        
        if (!hasCfClearance) {
          console.warn('[GPT-WEB] ⚠️ cf_clearance cookie missing!')
          console.warn('[GPT-WEB] ⚠️ Please visit chatgpt.com in browser to pass Cloudflare check')
        }
      } else {
        console.error('[GPT-WEB] ❌ No cookies found for chatgpt.com - user may not be logged in')
        console.error('[GPT-WEB] ❌ Please login at chatgpt.com first')
      }
    } catch (err) {
      console.error('[GPT-WEB] ❌ Failed to read cookies:', (err as Error)?.message)
      console.error('[GPT-WEB] ❌ Error stack:', (err as Error)?.stack)
    }
    
    const merged: RequestInit = {
      ...options,
      headers,
      credentials: 'include',
    }
    
    console.debug('[GPT-WEB] directFetch', url.substring(0, 80), {
      hasBody: !!merged?.body,
      method: merged?.method || 'GET',
      hasCookies: headers.has('Cookie'),
    })
    
    const resp = await fetch(url, merged)
    console.log('[GPT-WEB] 📡 Response:', {
      status: resp.status,
      statusText: resp.statusText,
      ok: resp.ok,
      headers: Object.fromEntries(resp.headers.entries()),
    })
    
    return resp
  }

  async getAccessToken(): Promise<string> {
    console.log('[GPT-WEB] 🔑 getAccessToken() - 챗허브 방식')
    
    const tryHosts = ['https://chatgpt.com', 'https://chat.openai.com']
    for (const host of tryHosts) {
      try {
        const resp = await this.directFetch(`${host}/api/auth/session`)
        
        if (resp.status === 200) {
          const data = await resp.json().catch(() => ({}))
          if (data?.accessToken) {
            this.baseHost = host
            console.log('[GPT-WEB] ✅ accessToken obtained:', host)
            return data.accessToken
          }
        } else if (resp.status === 401) {
          continue // 다음 호스트 시도
        } else if (resp.status === 403) {
          throw new ChatError(
            'Cloudflare 보안 확인 필요\n\n해결: chatgpt.com에서 로그인 후 보안 검증 통과',
            ErrorCode.CHATGPT_CLOUDFLARE
          )
        }
      } catch (e) {
        if (e instanceof ChatError) throw e
        continue
      }
    }
    
    throw new ChatError(
      'ChatGPT 로그인 필요\n\n해결: chatgpt.com에서 로그인 후 재시도',
      ErrorCode.CHATGPT_UNAUTHORIZED
    )
  }

  async getSentinel(
    _token: string | undefined,
  ): Promise<{
    requirementsToken?: string
    proofToken?: string
  }> {
    console.log('[GPT-WEB] 🛡️ getSentinel() - 챗허브 방식')
    
    // 브라우저 지문 생성
    const proofToken = this.generateBrowserProof()
    console.log('[GPT-WEB] 🔐 Generated proof token')
    
    const deviceId = await this.getPersistentDeviceId()
    const url = `${this.baseHost}/backend-api/sentinel/chat-requirements`
    
    const resp = await this.directFetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'oai-device-id': deviceId,
        'oai-language': navigator.language || 'en-US',
      },
      body: JSON.stringify({ p: proofToken }),
    })
    
    if (resp.status === 401) {
      throw new ChatError(
        'ChatGPT 로그인 필요',
        ErrorCode.CHATGPT_UNAUTHORIZED
      )
    }
    
    if (resp.status === 403) {
      throw new ChatError(
        'Cloudflare Turnstile 검증 필요\n\n해결: chatgpt.com에서 보안 챌린지 통과',
        ErrorCode.CHATGPT_CLOUDFLARE
      )
    }
    
    if (!resp.ok) {
      const preview = await resp.text().catch(() => '')
      throw new Error(`Sentinel failed: HTTP ${resp.status}: ${preview.slice(0, 200)}`)
    }
    
    // JSON 파싱
    const raw = await resp.text()
    const cleaned = raw
      .replace(/^\)\]\}',?\s*/, '')
      .replace(/^for\s*\(\s*;;\s*\);\s*/, '')
      .replace(/^\uFEFF/, '')
    
    let data: any
    try {
      data = JSON.parse(cleaned)
    } catch {
      throw new ChatError(
        'Sentinel 응답 파싱 실패',
        ErrorCode.CHATGPT_CLOUDFLARE
      )
    }
    
    const requirementsToken = data?.token || data?.sentinel_token || data?.requirementsToken
    
    if (!requirementsToken) {
      throw new ChatError(
        'Sentinel 토큰 없음\n\n해결: chatgpt.com에서 로그인 후 1회 대화 전송',
        ErrorCode.CHATGPT_CLOUDFLARE
      )
    }
    
    console.log('[GPT-WEB] ✅ Sentinel tokens obtained')
    
    return {
      requirementsToken,
      proofToken,
    }
  }

  /**
   * 챗허브 방식: conversation 요청
   */
  async requestConversation(
    requestBody: any,
    sentinelHeaders: Record<string, string>
  ): Promise<Response> {
    const deviceId = await this.getPersistentDeviceId()
    const url = `${this.baseHost}/backend-api/conversation`
    
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      'Content-Type': 'application/json',
      'oai-device-id': deviceId,
      'oai-language': navigator.language || 'en-US',
      ...sentinelHeaders,
    }
    
    console.log('[GPT-WEB] 📡 requestConversation - 챗허브 방식')
    
    const resp = await this.directFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })
    
    if (resp.status === 401) {
      throw new ChatError(
        'ChatGPT 로그인 필요',
        ErrorCode.CHATGPT_UNAUTHORIZED
      )
    }
    
    if (resp.status === 403) {
      throw new ChatError(
        'Cloudflare 검증 필요\n\n해결: chatgpt.com에서 보안 챌린지 통과',
        ErrorCode.CHATGPT_CLOUDFLARE
      )
    }
    
    if (!resp.ok) {
      const preview = await resp.text().catch(() => '')
      throw new Error(`Conversation failed: HTTP ${resp.status}: ${preview.slice(0, 200)}`)
    }
    
    return resp
  }

  private generateBrowserProof(): string {
    // 챗허브 HAR 패턴: 브라우저 지문을 Base64로 인코딩
    const hardwareConcurrency = (navigator as any).hardwareConcurrency || 8
    const userAgent = (navigator as any).userAgent || ''
    const language = (navigator as any).language || 'en-US'
    
    let languagesStr = language + ',en-US,en'
    if (Array.isArray((navigator as any).languages) && (navigator as any).languages.length > 0) {
      languagesStr = (navigator as any).languages.join(',')
    }
    
    const scr: any = (globalThis as any).screen
    const iw = (globalThis as any).innerWidth
    const ih = (globalThis as any).innerHeight
    const screenSize = (scr && typeof scr.width === 'number' && typeof scr.height === 'number')
      ? `${scr.width}x${scr.height}`
      : (iw && ih ? `${iw}x${ih}` : '1920x1080')
    
    const proofArray = [
      new Date().toUTCString(),
      String(hardwareConcurrency),
      screenSize,
      userAgent,
      '',
      '',
      language,
      languagesStr,
      10
    ]
    
    const proofJson = JSON.stringify(proofArray)
    const proofBase64 = btoa(proofJson)
    
    return proofBase64
  }

  private async getPersistentDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId
    
    try {
      const got = await Browser.storage.local.get('oaiDeviceId')
      const existing = got?.oaiDeviceId as string | undefined
      if (existing && typeof existing === 'string') {
        this.deviceId = existing
        return existing
      }
    } catch {}
    
    const uuid = crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
    
    this.deviceId = uuid
    try {
      await Browser.storage.local.set({ oaiDeviceId: uuid })
    } catch {}
    
    console.debug('[GPT-WEB] Generated device id:', uuid)
    return uuid
  }

  async getModels(token: string): Promise<{ slug: string; title: string; description: string; max_tokens: number }[]> {
    const resp = await this.directFetch(`${this.baseHost}/backend-api/models`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    
    const data = await resp.json()
    return data.models
  }

  async generateChatTitle(token: string | undefined, conversationId: string, messageId: string) {
    await this.directFetch(`${this.baseHost}/backend-api/conversation/gen_title/${conversationId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message_id: messageId }),
    })
  }

  async uploadFile(token: string, file: File): Promise<string> {
    // 1. 파일 업로드 초기화
    const initResp = await this.directFetch(`${this.baseHost}/backend-api/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        file_name: file.name,
        file_size: file.size,
        use_case: 'multimodal',
      }),
    })
    
    const initData = await initResp.json()
    if (initData.status !== 'success') {
      throw new Error('Failed to init ChatGPT file upload')
    }
    
    const { file_id: fileId, upload_url: uploadUrl } = initData
    
    // 2. Azure Blob Storage에 업로드
    await ofetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-version': '2020-04-08',
        'Content-Type': file.type,
      },
    })
    
    // 3. 업로드 완료 알림
    await this.directFetch(`${this.baseHost}/backend-api/files/${fileId}/uploaded`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    })
    
    return fileId
  }

  async fixAuthState(): Promise<boolean> {
    try {
      // chatgpt.com 탭 열기
      await Browser.tabs.create({ url: 'https://chatgpt.com', active: true })
      return true
    } catch {
      return false
    }
  }
}

export const chatGPTClient = new ChatGPTClient()
