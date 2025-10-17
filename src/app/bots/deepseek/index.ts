import { AsyncAbstractBot } from '../abstract-bot'
import { DeepSeekApiBot } from '../deepseek-api'
import { DeepSeekWebBot } from '../deepseek-web'
import { getUserConfig } from '~services/user-config'

export class DeepSeekBot extends AsyncAbstractBot {
  async initializeBot() {
    const cfg = await getUserConfig()
    const mode = (cfg as any).deepseekMode || 'api'
    if (mode === 'webapp') {
      return new DeepSeekWebBot()
    }
    const apiKey = (cfg as any).deepseekApiKey
    if (!apiKey) throw new Error('DeepSeek API key missing')
    const model = (cfg as any).deepseekApiModel || 'deepseek-chat'
    return new DeepSeekApiBot({ apiKey, model })
  }
}

