import { AbstractBot, AsyncAbstractBot, SendMessageParams } from '../abstract-bot'
import { getUserConfig } from '~services/user-config'

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class DeepSeekApiBot extends AbstractBot {
  private apiKey: string
  private model: string

  constructor(opts: { apiKey: string; model: string }) {
    super()
    this.apiKey = opts.apiKey
    this.model = opts.model
  }

  async doSendMessage(params: SendMessageParams) {
    const body = {
      model: this.model,
      messages: [{ role: 'user', content: params.prompt } as DeepSeekMessage],
      stream: false,
      // temperature, etc., can be exposed later if needed
    }

    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(errText || `DeepSeek request failed: ${resp.status}`)
    }

    const data: any = await resp.json()
    const text: string = data?.choices?.[0]?.message?.content || ''
    params.onEvent({ type: 'UPDATE_ANSWER', data: { text: text || 'Empty response' } })
    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {
    // stateless per request
  }

  get name() {
    return 'DeepSeek (API)'
  }
}

export class DeepSeekBot extends AsyncAbstractBot {
  async initializeBot() {
    const { deepseekApiKey, deepseekApiModel } = (await getUserConfig()) as any
    if (!deepseekApiKey) {
      throw new Error('DeepSeek API key missing')
    }
    const model = deepseekApiModel || 'deepseek-chat'
    return new DeepSeekApiBot({ apiKey: deepseekApiKey, model })
  }
}

