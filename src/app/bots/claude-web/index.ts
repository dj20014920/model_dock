import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { createConversation, fetchOrganizationId, generateChatTitle } from './api'
import { requestHostPermission } from '~app/utils/permissions'
import { ChatError, ErrorCode } from '~utils/errors'
import { getUserConfig } from '~services/user-config'
import { ProxyRequester } from '~app/utils/proxy-requester'
import { hybridFetch } from '~app/utils/hybrid-requester'

interface ConversationContext {
  conversationId: string
}

export class ClaudeWebBot extends AbstractBot {
  private organizationId?: string
  private conversationContext?: ConversationContext
  private model: string
  private requester = new ProxyRequester({ homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' })

  constructor() {
    super()
    this.model = 'claude-2.1'
  }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    if (!(await requestHostPermission('https://*.claude.ai/'))) {
      throw new ChatError('Missing claude.ai permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    if (!this.organizationId) {
      this.organizationId = await fetchOrganizationId((i, init) =>
        hybridFetch(i as string, init as any, { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' }),
      )
    }

    if (!this.conversationContext) {
      const conversationId = await createConversation(this.organizationId, (i, init) =>
        hybridFetch(i as string, init as any, { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' }),
      )
      this.conversationContext = { conversationId }
      generateChatTitle(this.organizationId, conversationId, params.prompt, (i, init) =>
        hybridFetch(i as string, init as any, { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' }),
      ).catch(console.error)
    }

    // allow optional custom model override
    try {
      const cfg = await getUserConfig()
      const custom = (cfg as any).claudeWebappCustomModel
      if (custom && typeof custom === 'string' && custom.trim()) {
        this.model = custom.trim()
      }
    } catch {}

    // try legacy append_message first with credentials via pinned tab
    let resp = await hybridFetch('https://claude.ai/api/append_message', {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_uuid: this.organizationId,
        conversation_uuid: this.conversationContext.conversationId,
        text: params.prompt,
        completion: {
          prompt: params.prompt,
          model: this.model,
        },
        attachments: [],
      }),
    }, { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' })

    if (resp.status === 404) {
      // fallback: newer endpoint shape (best-effort, credentials included)
      resp = await hybridFetch(
        `https://claude.ai/api/organizations/${this.organizationId}/chat_conversations/${this.conversationContext!.conversationId}/completion`,
        {
          method: 'POST',
          signal: params.signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: params.prompt,
            model: this.model,
            attachments: [],
          }),
        },
        { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' },
      )
    }

    // different models are available for different accounts
    if (!resp.ok && resp.status === 403 && this.model === 'claude-2.1') {
      if ((await resp.text()).includes('model_not_allowed')) {
        this.model = 'claude-2.0'
        return this.doSendMessage(params)
      }
    }

    let result = ''

    await parseSSEResponse(resp, (message) => {
      console.debug('claude sse message', message)
      const payload = JSON.parse(message)
      if (payload.completion) {
        result += payload.completion
        params.onEvent({
          type: 'UPDATE_ANSWER',
          data: { text: result.trimStart() },
        })
      } else if (payload.error) {
        throw new Error(JSON.stringify(payload.error))
      }
    })

    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  get name() {
    return 'Claude (webapp/claude-2)'
  }
}
