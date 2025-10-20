import { ofetch } from 'ofetch'
import { RequestInitSubset } from '~types/messaging'
import { ChatError, ErrorCode } from '~utils/errors'
import { getUserConfig } from '~services/user-config'
import { Requester, globalFetchRequester, backgroundFetchRequester, proxyFetchRequester } from './requesters'

class ChatGPTClient {
  requester: Requester
  private baseHost?: string

  constructor() {
    // ✅ ChatHub 방식: Background Fetch 전용 (Proxy fallback 완전 제거)
    // Service Worker에서 직접 API 호출, Content Script/Proxy 탭 사용 안 함
    console.log('[GPT-WEB] 🎯 Using background fetch (direct API calls, no proxy tabs)')
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
    
    const trySession = async () => {
      // chatgpt.com 우선 시도(최근 기본 호스트)
      console.debug('[GPT-WEB] session try chatgpt.com')
      let resp = await this.fetch('https://chatgpt.com/api/auth/session')
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
    console.debug('[GPT-WEB] backend request', { base, path, method, isSSE, isSentinel })
    
    return this.fetch(`${base}/backend-api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(isSSE ? { Accept: 'text/event-stream' } : {}),
        'Authorization': `Bearer ${token}`,
        ...(extraHeaders || {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  }

  async getSentinel(token: string): Promise<{ requirementsToken?: string; proofToken?: string }> {
    // 일부 계정/지역에서 대화 전에 Sentinel 토큰이 필요
    let resp: Response
    resp = await this.requestBackendAPIWithToken(token, 'POST', '/sentinel/chat-requirements', {})
    console.debug('[GPT-WEB] sentinel status', resp.status)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    let data: any = {}
    try {
      data = await resp.json()
    } catch {}
    // 다양한 응답 형태를 관용적으로 수용
    const requirementsToken = data?.token || data?.sentinel_token || data?.requirementsToken
    const proofToken = data?.proof_token || data?.proofToken
    console.debug('[GPT-WEB] sentinel tokens', { reqTok: !!requirementsToken, proofTok: !!proofToken })
    return { requirementsToken, proofToken }
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
