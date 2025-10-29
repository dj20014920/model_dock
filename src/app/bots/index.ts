import { BingWebBot } from './bing'
import { CopilotBot } from './copilot'
import { ChatGPTBot } from './chatgpt'
import { ClaudeBot } from './claude'
import { GeminiBot } from './gemini'
import { DeepSeekBot } from './deepseek'
import { GrokBot } from './grok'
import { LMArenaBot, createDirectChatBot, createBattleBot, createSideBySideBot, LMARENA_MODELS, type LMArenaModel } from './lmarena'
import { PerplexityBot } from './perplexity'
import { QwenBot } from './qwen'

export type BotId =
  | 'chatgpt'
  | 'bing'
  | 'grok'
  | 'claude'
  | 'perplexity'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'lmarena'

export function createBotInstance(botId: BotId) {
  console.log('[BOT] 🤖 Creating bot instance:', botId)
  switch (botId) {
    case 'chatgpt':
      const bot = new ChatGPTBot()
      console.log('[BOT] ✅ ChatGPT bot created')
      return bot
    case 'bing':
      console.log('[BOT] ✅ Copilot bot created')
      return new CopilotBot()
    case 'grok':
      return new GrokBot()
    case 'claude':
      return new ClaudeBot()
    case 'perplexity':
      return new PerplexityBot()
    case 'gemini':
      return new GeminiBot()
    case 'deepseek':
      return new DeepSeekBot()
    case 'qwen':
      return new QwenBot()
    case 'lmarena':
      return createDirectChatBot('gpt-4.5-preview-2025-02-27')
  }
}

// LM Arena 관련 export
export { LMArenaBot, createDirectChatBot, createBattleBot, createSideBySideBot, LMARENA_MODELS, type LMArenaModel }

export type BotInstance = ReturnType<typeof createBotInstance>
