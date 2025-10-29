import { BotId } from '~app/bots'
import { ChatGPTMode, ClaudeMode, UserConfig } from '~services/user-config'

// Very rough token estimator (English ~ 4 chars/token, CJK ~ 1 char/token)
export function estimateTokens(text: string) {
  const cjk = (text.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length
  const nonCjk = text.length - cjk
  const tokens = Math.max(1, Math.round(cjk + nonCjk / 4))
  return tokens
}

// Input-side pricing per 1K tokens (USD)
const OPENAI_INPUT_PRICE: Record<string, number> = {
  'gpt-3.5-turbo': 0.0005,
  'gpt-4': 0.03,
  'gpt-4-turbo': 0.01,
}

const CLAUDE_INPUT_PRICE: Record<string, number> = {
  'claude-2': 0.008,
  'claude-instant-v1': 0.0008,
}

export type UsageEstimation = {
  tokens: number
  usd?: number // undefined when pricing unknown or not in API mode
  model?: string
  provider?: 'openai' | 'anthropic' | 'perplexity' | 'gemini' | 'deepseek' | 'qwen'
}

export function estimateForBot(botId: BotId, text: string, config: UserConfig): UsageEstimation {
  const includeResp = !!(config as any).usageIncludeResponseTokens
  const factor = includeResp ? 2 : 1
  const tokens = estimateTokens(text) * factor

  if (botId === 'chatgpt' && config.chatgptMode === ChatGPTMode.API) {
    const model = config.chatgptApiModel
    const price = OPENAI_INPUT_PRICE[model]
    const usd = price ? (tokens / 1000) * price : undefined
    return { tokens, usd, model, provider: 'openai' }
  }

  if (botId === 'claude' && config.claudeMode === ClaudeMode.API) {
    const model = config.claudeApiModel
    const price = CLAUDE_INPUT_PRICE[model]
    const usd = price ? (tokens / 1000) * price : undefined
    return { tokens, usd, model, provider: 'anthropic' }
  }

  if (botId === 'perplexity') {
    // Pricing varies by plan; omit cost to avoid inaccuracy
    return { tokens, provider: 'perplexity' }
  }

  if (botId === 'gemini' && config.geminiApiKey) {
    // Pricing varies by model; omit cost for simplicity
    return { tokens, provider: 'gemini' }
  }

  if ((botId as any) === 'deepseek' && (config as any).deepseekApiKey) {
    // Pricing varies by model; omit cost
    return { tokens, provider: 'deepseek' }
  }

  if ((botId as any) === 'qwen') {
    // Qwen webapp mode - no cost tracking
    return { tokens, provider: 'qwen' }
  }

  return { tokens }
}

export function estimateForBots(botIds: BotId[], text: string, config: UserConfig) {
  return botIds.map((id) => estimateForBot(id, text, config))
}
