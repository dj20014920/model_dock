import { requestHostPermission } from '~app/utils/permissions'
import { hybridFetch } from '~app/utils/hybrid-requester'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams } from '../abstract-bot'

interface ConversationContext {
  conversationId: string
  clientId?: string
  isNewUser: boolean
  remainingTurns: number
}

/**
 * CopilotWebBot - WebSocket Intercept 방식
 *
 * Content Script를 통한 WebSocket 연결:
 * 1. copilot.microsoft.com 탭 찾기/생성
 * 2. Content script가 페이지 내에서 WebSocket 생성 (Same-Origin)
 * 3. Message passing으로 Extension과 통신
 *
 * Message Flow:
 * Extension → chrome.tabs.sendMessage → Bridge → window.postMessage → Interceptor → WebSocket
 * WebSocket → Interceptor → window.postMessage → Bridge → chrome.runtime.sendMessage → Extension
 */
export class CopilotWebBot extends AbstractBot {
  private conversationContext?: ConversationContext
  private messageListener?: (message: any, sender: any, sendResponse: any) => boolean | undefined
  private currentTabId?: number

  async doSendMessage(params: SendMessageParams) {
    if (!(await requestHostPermission('https://copilot.microsoft.com/*'))) {
      throw new ChatError('Missing copilot.microsoft.com permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    try {
      // 1. Conversation 생성 (HTTP API)
      if (!this.conversationContext) {
        this.conversationContext = await this.createConversation()
      }

      // 2. copilot.microsoft.com 탭 찾기/생성
      const tabId = await this.findOrCreateCopilotTab()
      this.currentTabId = tabId

      // 3. Message passing으로 WebSocket 통신
      await this.sendMessageViaContentScript(params, tabId)
    } catch (error) {
      console.error('[Copilot] Error:', error)
      params.onEvent({
        type: 'ERROR',
        error:
          error instanceof ChatError
            ? error
            : new ChatError(error instanceof Error ? error.message : 'Unknown error', ErrorCode.UNKOWN_ERROR),
      })
    }
  }

  private async createConversation(): Promise<ConversationContext> {
    console.log('[Copilot] 🚀 Creating conversation via /c/api/start')

    const response = await hybridFetch(
      'https://copilot.microsoft.com/c/api/start',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: '*/*',
        },
        body: JSON.stringify({
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
          startNewConversation: true,
          teenSupportEnabled: true,
          correctPersonalizationSetting: true,
          performUserMerge: true,
          deferredDataUseCapable: true,
        }),
      },
      { homeUrl: 'https://copilot.microsoft.com', hostStartsWith: 'https://copilot.microsoft.com' },
      { reuseOnly: false }
    )

    if (!response.ok) {
      throw new ChatError(
        `Failed to create conversation: ${response.status} ${response.statusText}`,
        ErrorCode.NETWORK_ERROR
      )
    }

    const data = await response.json()
    console.log('[Copilot] ✅ Conversation created:', data.currentConversationId)

    return {
      conversationId: data.currentConversationId,
      clientId: data.clientId,
      isNewUser: data.isNewUser || false,
      remainingTurns: data.remainingTurns || 1000,
    }
  }

  private async findOrCreateCopilotTab(): Promise<number> {
    console.log('[Copilot] 🔍 Looking for copilot.microsoft.com tab...')

    // 기존 탭 찾기
    const tabs = await chrome.tabs.query({
      url: 'https://copilot.microsoft.com/*',
    })

    if (tabs.length > 0 && tabs[0].id) {
      console.log('[Copilot] ✅ Found existing tab:', tabs[0].id)
      // 2-1) Try reinjection; if receiving end not ready, reload to guarantee injection at document_start
      let reinjected = false
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'COPILOT_INJECT' })
        reinjected = true
      } catch (e) {
        console.debug('[Copilot] Reinjection message failed (content script not ready):', (e as Error)?.message)
      }
      if (!reinjected) {
        console.log('[Copilot] ♻️ Reloading Copilot tab to ensure early injection')
        try { await chrome.tabs.reload(tabs[0].id) } catch {}
        await new Promise((r) => setTimeout(r, 2000))
      }
      return tabs[0].id
    }

    // 새 탭 생성 (백그라운드)
    console.log('[Copilot] 📝 Creating new background tab...')
    const newTab = await chrome.tabs.create({
      url: 'https://copilot.microsoft.com',
      active: false, // 백그라운드에서 생성
    })

    if (!newTab.id) {
      throw new ChatError('Failed to create Copilot tab', ErrorCode.UNKOWN_ERROR)
    }

    // Content script가 로드될 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 2000))

    console.log('[Copilot] ✅ Created new tab:', newTab.id)
    return newTab.id
  }

  private async sendMessageViaContentScript(params: SendMessageParams, tabId: number) {
    const { conversationId } = this.conversationContext!

    console.log('[Copilot] 📤 Sending message via content script...')

    let fullText = ''

    // Message listener 설정
    this.messageListener = (message: any): boolean | undefined => {
      if (message.type === 'FROM_COPILOT_PAGE') {
        const data = message.data

        switch (data.type) {
          case 'COPILOT_WS_OPEN':
            console.log('[Copilot] ✅ WebSocket connected')
            // WebSocket 연결 후 메시지 전송
            chrome.tabs.sendMessage(tabId, {
              type: 'TO_COPILOT_PAGE',
              data: {
                event: 'send',
                conversationId,
                content: [{ type: 'text', text: params.prompt }],
                mode: 'chat',
                context: {},
              },
            })
            break

          case 'COPILOT_WS_MESSAGE':
            try {
              const event = typeof data.data === 'string' ? JSON.parse(data.data) : data.data

              console.debug('[Copilot] 📥 WS Event:', event.event)

              switch (event.event) {
                case 'received':
                  console.log('[Copilot] 📨 Message received')
                  break

                case 'update':
                  if (event.content) {
                    fullText = event.content
                    params.onEvent({
                      type: 'UPDATE_ANSWER',
                      data: { text: fullText },
                    })
                  }
                  break

                case 'appendContent':
                  if (event.text) {
                    fullText += event.text
                    params.onEvent({
                      type: 'UPDATE_ANSWER',
                      data: { text: fullText },
                    })
                  }
                  break

                case 'done':
                case 'completed':
                  console.log('[Copilot] ✅ Message completed')
                  params.onEvent({ type: 'DONE' })
                  this.cleanup()
                  break

                case 'error':
                  console.error('[Copilot] ❌ Error event:', event)
                  params.onEvent({
                    type: 'ERROR',
                    error: new ChatError(event.message || 'WebSocket error', ErrorCode.NETWORK_ERROR),
                  })
                  this.cleanup()
                  break
              }
            } catch (e) {
              console.error('[Copilot] Failed to parse message:', e)
            }
            break

          case 'COPILOT_WS_ERROR':
            console.error('[Copilot] WebSocket error:', data.error)
            params.onEvent({
              type: 'ERROR',
              error: new ChatError(data.error || 'WebSocket error', ErrorCode.NETWORK_ERROR),
            })
            this.cleanup()
            break

          case 'COPILOT_WS_CLOSE':
            console.log('[Copilot] WebSocket closed:', data.code, data.reason)
            this.cleanup()
            break
        }
        return true // Message handled
      }
      return undefined
    }

    chrome.runtime.onMessage.addListener(this.messageListener)

    // Ensure WS connection is created from page context (explicit connect)
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'TO_COPILOT_PAGE',
        data: { event: 'connect' },
      })
    } catch (e) {
      console.debug('[Copilot] Connect request failed (will rely on page auto-connect):', (e as Error)?.message)
    }

    // Content script에 WebSocket 연결 트리거
    // copilot.microsoft.com 페이지가 로드되면 자동으로 WebSocket을 생성하므로
    // 우리는 기다리기만 하면 됨. 하지만 명시적으로 페이지를 리로드하거나
    // 페이지가 이미 로드되어 있는 경우를 위해 더미 메시지를 보낼 수도 있음

    // Abort signal 처리
    if (params.signal) {
      params.signal.addEventListener('abort', () => {
        console.log('[Copilot] 🛑 Request aborted')
        this.cleanup()
      })
    }
  }

  private cleanup() {
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener)
      this.messageListener = undefined
    }
  }

  resetConversation() {
    this.cleanup()
    this.conversationContext = undefined
    this.currentTabId = undefined
    console.log('[Copilot] 🔄 Conversation reset')
  }

  get name() {
    return 'Copilot (webapp)'
  }
}
