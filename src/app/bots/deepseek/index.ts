import { AsyncAbstractBot, MessageParams } from '../abstract-bot'
import { DeepSeekApiBot } from '../deepseek-api'
import { DeepSeekWebBot } from '../deepseek-web'
import { getUserConfig } from '~services/user-config'
import * as agent from '~services/agent'

export class DeepSeekBot extends AsyncAbstractBot {
  async initializeBot() {
    const cfg = await getUserConfig()
    const mode = (cfg as any).deepseekMode || 'webapp'
    if (mode === 'webapp') {
      return new DeepSeekWebBot()
    }
    const apiKey = (cfg as any).deepseekApiKey
    if (!apiKey) throw new Error('DeepSeek API key missing')
    const model = (cfg as any).deepseekApiModel || 'deepseek-chat'
    return new DeepSeekApiBot({ apiKey, model })
  }

  async sendMessage(params: MessageParams) {
    const { deepseekWebAccess } = await getUserConfig() as any
    if (deepseekWebAccess) {
      return agent.execute(params.prompt, (prompt) => this.doSendMessageGenerator({ ...params, prompt }), params.signal)
    }
    return this.doSendMessageGenerator(params)
  }
}

