import { BaichuanWebBot } from './baichuan'
import { BingWebBot } from './bing'
import { CopilotBot } from './copilot'
import { ChatGPTBot } from './chatgpt'
import { ClaudeBot } from './claude'
import { GeminiBot } from './gemini'
import { DeepSeekBot } from './deepseek'
import { GrokBot } from './grok'
import { LMSYSBot } from './lmsys'
import { LMArenaBot, createDirectChatBot, createBattleBot, createSideBySideBot, LMARENA_MODELS, type LMArenaModel } from './lmarena'
import { PerplexityBot } from './perplexity'
import { PiBot } from './pi'
import { QianwenWebBot } from './qianwen'
import { QwenBot } from './qwen'
import { XunfeiBot } from './xunfei'

export type BotId =
  | 'chatgpt'
  | 'bing'
  | 'grok'
  | 'claude'
  | 'perplexity'
  | 'xunfei'
  | 'vicuna'
  | 'falcon'
  | 'mistral'
  | 'chatglm'
  | 'llama'
  | 'pi'
  | 'wizardlm'
  | 'qianwen'
  | 'qwen'
  | 'baichuan'
  | 'yi'
  | 'gemini'
  | 'deepseek'
  | 'lmarena-direct'
  | 'lmarena-battle'
  | 'lmarena-sidebyside'

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
    case 'xunfei':
      return new XunfeiBot()
    case 'vicuna':
      return new LMSYSBot('vicuna-33b')
    case 'chatglm':
      return new LMSYSBot('chatglm2-6b')
    case 'llama':
      return new LMSYSBot('llama-2-70b-chat')
    case 'wizardlm':
      return new LMSYSBot('wizardlm-13b')
    case 'falcon':
      return new LMSYSBot('falcon-180b-chat')
    case 'mistral':
      return new LMSYSBot('mixtral-8x7b-instruct-v0.1')
    case 'yi':
      return new LMSYSBot('yi-34b-chat')
    case 'pi':
      return new PiBot()
    case 'qianwen':
      return new QianwenWebBot()
    case 'qwen':
      return new QwenBot()
    case 'baichuan':
      return new BaichuanWebBot()
    case 'perplexity':
      return new PerplexityBot()
    case 'gemini':
      return new GeminiBot()
    case 'deepseek':
      return new DeepSeekBot()
    case 'lmarena-direct':
      // 기본 모델: GPT-4.5 Preview (2025년 최신)
      return createDirectChatBot('gpt-4.5-preview-2025-02-27')
    case 'lmarena-battle':
      return createBattleBot()
    case 'lmarena-sidebyside':
      // 기본: GPT-4.5 vs Claude Opus 4.1 (2025년 최신)
      return createSideBySideBot('gpt-4.5-preview-2025-02-27', 'claude-opus-4-1-20250805')
  }
}

// LM Arena 관련 export
export { LMArenaBot, createDirectChatBot, createBattleBot, createSideBySideBot, LMARENA_MODELS, type LMArenaModel }

export type BotInstance = ReturnType<typeof createBotInstance>
