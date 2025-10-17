import { AsyncAbstractBot } from '../abstract-bot'
import { GeminiApiBot } from '../gemini-api'
import { GeminiWebBot } from '../gemini-web'
import { getUserConfig } from '~services/user-config'

export class GeminiBot extends AsyncAbstractBot {
  async initializeBot() {
    const cfg = await getUserConfig()
    const mode = (cfg as any).geminiMode || 'api'
    if (mode === 'webapp') {
      return new GeminiWebBot()
    }
    if (!cfg.geminiApiKey) throw new Error('Gemini API key missing')
    return new GeminiApiBot(cfg.geminiApiKey)
  }
}

