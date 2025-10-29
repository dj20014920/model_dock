import { AsyncAbstractBot, MessageParams } from '../abstract-bot'
import { GeminiApiBot } from '../gemini-api'
import { GeminiWebBot } from '../gemini-web'
import { getUserConfig } from '~services/user-config'
import * as agent from '~services/agent'

export class GeminiBot extends AsyncAbstractBot {
  async initializeBot() {
    const cfg = await getUserConfig()
    const mode = (cfg as any).geminiMode || 'webapp'
    if (mode === 'webapp') {
      return new GeminiWebBot()
    }
    if (!cfg.geminiApiKey) throw new Error('Gemini API key missing')
    return new GeminiApiBot(cfg.geminiApiKey)
  }

  async sendMessage(params: MessageParams) {
    const { geminiWebAccess } = await getUserConfig() as any
    if (geminiWebAccess) {
      return agent.execute(params.prompt, (prompt) => this.doSendMessageGenerator({ ...params, prompt }), params.signal)
    }
    return this.doSendMessageGenerator(params)
  }
}

