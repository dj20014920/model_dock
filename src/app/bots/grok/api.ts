import { requestHostPermission } from '~app/utils/permissions'
import { GrokAPIModel, UserConfig } from '~/services/user-config'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'

interface ConversationContext {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
}

const CONTEXT_SIZE = 9

/**
 * Grok API Bot - xAI 공식 API 사용
 * OpenAI 호환 API (api.x.ai/v1/chat/completions)
 */
export class GrokApiBot extends AbstractBot {
  private conversationContext?: ConversationContext

  constructor(private config: Pick<UserConfig, 'grokApiKey' | 'grokApiModel' | 'grokApiCustomModel'>) {
    super()
  }

  private buildMessages(prompt: string): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: 'You are Grok, a chatbot inspired by the Hitchhiker\'s Guide to the Galaxy.',
      },
    ]

    if (this.conversationContext) {
      messages.push(...this.conversationContext.messages.slice(-CONTEXT_SIZE))
    }

    messages.push({ role: 'user', content: prompt })
    return messages
  }

  private getModelName(): string {
    const custom = this.config.grokApiCustomModel
    if (custom && typeof custom === 'string' && custom.trim()) {
      return custom.trim()
    }
    return this.config.grokApiModel || GrokAPIModel['grok-beta']
  }

  async doSendMessage(params: SendMessageParams) {
    if (!(await requestHostPermission('https://*.x.ai/'))) {
      throw new ChatError('Missing x.ai permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    if (!this.config.grokApiKey) {
      throw new ChatError('Grok API key not set', ErrorCode.GROK_API_KEY_NOT_SET)
    }

    if (!this.conversationContext) {
      this.conversationContext = { messages: [] }
    }

    const messages = this.buildMessages(params.prompt)

    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.grokApiKey}`,
      },
      body: JSON.stringify({
        model: this.getModelName(),
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      if (resp.status === 401) {
        throw new ChatError('Invalid Grok API key', ErrorCode.GROK_API_KEY_NOT_SET)
      }
      throw new ChatError(`Grok API error: ${resp.status} ${errorText}`, ErrorCode.UNKOWN_ERROR)
    }

    // 사용자 메시지 추가 (fetch 성공 후)
    this.conversationContext.messages.push({ role: 'user', content: params.prompt })

    let result = ''
    let done = false

    const finish = () => {
      done = true
      params.onEvent({ type: 'DONE' })
      if (this.conversationContext) {
        this.conversationContext.messages.push({ role: 'assistant', content: result })
      }
    }

    await parseSSEResponse(resp, (message) => {
      console.debug('grok api sse message', message)
      if (message === '[DONE]') {
        finish()
        return
      }

      try {
        const data = JSON.parse(message)
        if (data?.choices?.length) {
          const delta = data.choices[0].delta
          if (delta?.content) {
            result += delta.content
            params.onEvent({
              type: 'UPDATE_ANSWER',
              data: { text: result },
            })
          }
        }
      } catch (err) {
        console.error('Failed to parse Grok API response:', err)
      }
    })

    if (!done) {
      finish()
    }
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  get name() {
    const model = this.getModelName()
    return `Grok (API/${model})`
  }
}
