import { PerplexityMode, getUserConfig } from '~/services/user-config'
import { AsyncAbstractBot, MessageParams } from '../abstract-bot'
import { PerplexityApiBot } from '../perplexity-api'
import { PerplexityLabsBot } from '../perplexity-web'
import * as agent from '~services/agent'

export class PerplexityBot extends AsyncAbstractBot {
  async initializeBot() {
    const { perplexityMode, ...config } = await getUserConfig()
    if (perplexityMode === PerplexityMode.API) {
      if (!config.perplexityApiKey) {
        throw new Error('Perplexity API key missing')
      }
      const model = (config as any).perplexityApiModel || 'pplx-70b-online'
      return new PerplexityApiBot(config.perplexityApiKey, model)
    }
    return new PerplexityLabsBot('pplx-70b-online')
  }

  async sendMessage(params: MessageParams) {
    const { perplexityWebAccess } = await getUserConfig() as any
    if (perplexityWebAccess) {
      return agent.execute(params.prompt, (prompt) => this.doSendMessageGenerator({ ...params, prompt }), params.signal)
    }
    return this.doSendMessageGenerator(params)
  }
}
