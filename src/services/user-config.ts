import { defaults } from 'lodash-es'
import Browser from 'webextension-polyfill'
import { BotId } from '~app/bots'
import { ALL_IN_ONE_PAGE_ID, CHATBOTS, CHATGPT_API_MODELS, DEFAULT_CHATGPT_SYSTEM_MESSAGE } from '~app/consts'

export enum BingConversationStyle {
  Creative = 'creative',
  Balanced = 'balanced',
  Precise = 'precise',
}

export enum ChatGPTMode {
  Webapp = 'webapp',
  API = 'api',
  Azure = 'azure',
  Poe = 'poe',
  OpenRouter = 'openrouter',
}

export enum ChatGPTWebModel {
  Auto = 'auto',
  'GPT-4o' = 'gpt-4o',
  'GPT-4o-mini' = 'gpt-4o-mini',
  'GPT-4.1' = 'gpt-4.1',
  'o3-mini' = 'o3-mini',
  'GPT-3.5' = 'gpt-3.5',
}

export enum PoeGPTModel {
  'GPT-3.5' = 'chinchilla',
  'GPT-4' = 'beaver',
}

export enum PoeClaudeModel {
  'claude-instant' = 'a2',
  'claude-instant-100k' = 'a2_100k',
  'claude-2-100k' = 'a2_2',
}

export enum ClaudeMode {
  Webapp = 'webapp',
  API = 'api',
  Poe = 'poe',
  OpenRouter = 'openrouter',
}

export enum ClaudeAPIModel {
  'claude-2' = 'claude-2',
  'claude-instant-1' = 'claude-instant-v1',
}

export enum OpenRouterClaudeModel {
  'claude-2' = 'claude-2',
  'claude-instant-v1' = 'claude-instant-v1',
}

export enum PerplexityMode {
  Webapp = 'webapp',
  API = 'api',
}

export enum GeminiMode {
  Webapp = 'webapp',
  API = 'api',
}

export enum DeepSeekMode {
  Webapp = 'webapp',
  API = 'api',
}

export enum GrokMode {
  Webapp = 'webapp',
  API = 'api',
}

export enum GrokAPIModel {
  'grok-beta' = 'grok-beta',
  'grok-2-latest' = 'grok-2-latest',
  'grok-3-latest' = 'grok-3-latest',
  'grok-4-latest' = 'grok-4-latest',
}

const userConfigWithDefaultValue = {
  openaiApiKey: '',
  openaiApiHost: 'https://api.openai.com',
  chatgptApiModel: CHATGPT_API_MODELS[0] as (typeof CHATGPT_API_MODELS)[number],
  // optional: override OpenAI API model slug
  chatgptApiCustomModel: '',
  chatgptApiTemperature: 1,
  chatgptApiSystemMessage: DEFAULT_CHATGPT_SYSTEM_MESSAGE,
  chatgptMode: ChatGPTMode.Webapp,
  chatgptWebappModelName: ChatGPTWebModel.Auto,
  // optional: override Webapp model slug from session list
  chatgptWebappCustomModel: '',
  // Webapp 네트워크 실행 정책
  // - alwaysProxy: 항상 Same-Origin(In‑Page) 프록시만 사용(기본: false → background fetch 사용)
  // - reuseOnly: 프록시 탭 자동 생성 금지(기본: false → 필요 시 자동 생성)
  chatgptWebappAlwaysProxy: false, // Background fetch 기본, 필요 시 same-origin 강제
  chatgptWebappReuseOnly: false,
  // Webapp 요청 헤더 구성: 'minimal' | 'browserlike'
  // - minimal: ChatHub 스타일(쿠키 기반 + 최소 헤더)
  // - browserlike: 브라우저스러운 헤더 보강
  chatgptWebappHeaderMode: 'minimal' as 'minimal' | 'browserlike',
  // Webapp 인증: 쿠키만 사용(Authorization Bearer 제거)
  chatgptWebappCookieOnly: true,
  // Turnstile이 요구되면 기본적으로 중단하고 사용자 안내(403 회피)
  chatgptWebappForceWhenTurnstile: false,
  chatgptPoeModelName: PoeGPTModel['GPT-3.5'],
  startupPage: ALL_IN_ONE_PAGE_ID,
  bingConversationStyle: BingConversationStyle.Balanced,
  poeModel: PoeClaudeModel['claude-instant'],
  azureOpenAIApiKey: '',
  azureOpenAIApiInstanceName: '',
  azureOpenAIApiDeploymentName: '',
  enabledBots: Object.keys(CHATBOTS).slice(0, 8) as BotId[],
  claudeApiKey: '',
  claudeMode: ClaudeMode.Webapp,
  claudeApiModel: ClaudeAPIModel['claude-2'],
  // optional: override Claude API model slug
  claudeApiCustomModel: '',
  // optional: override Claude Webapp model slug when available
  claudeWebappCustomModel: '',
  // Claude Advanced Features
  claudeExtendedThinking: false, // 심층 사고 모드
  claudeExtendedThinkingLimit: 3, // 비결제자 제한 (7일간 3회)
  claudeExtendedThinkingUsed: 0, // 사용 횟수
  claudeExtendedThinkingResetDate: 0, // 다음 리셋 날짜 (timestamp)
  claudeResearchMode: false, // 연구 모드
  claudePersonalizedStyle: 'default' as 'default' | 'concise' | 'detailed' | 'technical' | 'friendly',
  // Claude Tools 설정
  claudeToolsEnabled: true, // Tools 전체 활성화
  claudeWebSearchEnabled: true, // 웹 검색
  claudeArtifactsEnabled: true, // 아티팩트
  claudeReplEnabled: true, // 코드 실행
  // Claude Connectors
  claudeConnectorsEnabled: false, // 커넥터 전체 활성화
  claudeGmailEnabled: false, // Gmail 연동
  claudeDriveEnabled: false, // Google Drive 연동
  claudeCalendarEnabled: false, // Google Calendar 연동
  chatgptWebAccess: false,
  claudeWebAccess: false,
  openrouterOpenAIModel: CHATGPT_API_MODELS[0] as (typeof CHATGPT_API_MODELS)[number],
  openrouterClaudeModel: OpenRouterClaudeModel['claude-2'],
  openrouterApiKey: '',
  perplexityMode: PerplexityMode.Webapp,
  perplexityApiKey: '',
  // optional: API model name (e.g., pplx-70b-online)
  perplexityApiModel: 'pplx-70b-online',
  geminiApiKey: '',
  geminiMode: GeminiMode.API,
  geminiApiModel: 'gemini-pro',
  // message dispatch mode: manual copy-paste vs auto routing
  messageDispatchMode: 'manual' as 'manual' | 'auto',
  // main brain bot id (exclude from manual dispatch sequence)
  mainBrainBotId: '' as '' | BotId,
  // user consent for auto routing risk
  autoRoutingConsent: false,
  usageIncludeResponseTokens: false,
  // DeepSeek (API)
  deepseekMode: DeepSeekMode.API,
  deepseekApiKey: '',
  deepseekApiModel: 'deepseek-chat',
  deepseekWebappCustomModel: '',
  geminiWebappCustomModel: '',
  // Grok (xAI API)
  grokMode: GrokMode.Webapp,
  grokApiKey: '',
  grokApiModel: GrokAPIModel['grok-beta'],
  grokApiCustomModel: '',
  // Optional override for Grok Web (twitter.com) Authorization header.
  // Leave empty to use the built-in default web bearer.
  grokWebAuthorization: '',
}

export type UserConfig = typeof userConfigWithDefaultValue

export async function getUserConfig(): Promise<UserConfig> {
  const result = await Browser.storage.sync.get(Object.keys(userConfigWithDefaultValue))
  if (!result.chatgptMode && result.openaiApiKey) {
    result.chatgptMode = ChatGPTMode.API
  }
  if (result.chatgptWebappModelName === 'default') {
    result.chatgptWebappModelName = ChatGPTWebModel.Auto
  } else if (result.chatgptWebappModelName === 'gpt-4-browsing') {
    result.chatgptWebappModelName = ChatGPTWebModel['GPT-4o']
  } else if (result.chatgptWebappModelName === 'gpt-3.5-mobile') {
    result.chatgptWebappModelName = ChatGPTWebModel['GPT-3.5']
  } else if (result.chatgptWebappModelName === 'gpt-4-mobile') {
    result.chatgptWebappModelName = ChatGPTWebModel['GPT-4o']
  }
  if (result.chatgptApiModel === 'gpt-3.5-turbo-16k') {
    result.chatgptApiModel = 'gpt-3.5-turbo'
  } else if (result.chatgptApiModel === 'gpt-4-32k') {
    result.chatgptApiModel = 'gpt-4'
  }
  if (
    result.claudeApiModel !== ClaudeAPIModel['claude-2'] ||
    result.claudeApiModel !== ClaudeAPIModel['claude-instant-1']
  ) {
    result.claudeApiModel = ClaudeAPIModel['claude-2']
  }
  
  // Migration: Add 'grok' to enabledBots if it's missing
  if (result.enabledBots && Array.isArray(result.enabledBots) && !result.enabledBots.includes('grok')) {
    result.enabledBots = [...result.enabledBots, 'grok']
    // Persist the update immediately
    await Browser.storage.sync.set({ enabledBots: result.enabledBots })
  }
  
  return defaults(result, userConfigWithDefaultValue)
}

export async function updateUserConfig(updates: Partial<UserConfig>) {
  console.debug('update configs', updates)
  await Browser.storage.sync.set(updates)
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      await Browser.storage.sync.remove(key)
    }
  }
}
