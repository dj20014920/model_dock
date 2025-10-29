/**
 * LM Arena Bot Implementation
 * 
 * 지원 모드:
 * - Direct Chat: 특정 모델과 직접 대화
 * - Battle: 두 익명 모델 간 비교
 * - Side-by-Side: 두 모델 동시 비교
 */

import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { ChatError, ErrorCode } from '~utils/errors'
import { v4 as uuidv4 } from 'uuid'

// LM Arena 모드 타입
export type LMArenaMode = 'direct' | 'battle' | 'side-by-side'

// 사용 가능한 모델 목록 (2025년 최신 - LM Arena 리더보드 기준)
export const LMARENA_MODELS = {
  // OpenAI - GPT-5 Series
  'gpt-5-high': 'GPT-5 High',
  'gpt-5-chat': 'GPT-5 Chat',
  'gpt-5-mini-high': 'GPT-5 Mini High',
  'gpt-5-nano-high': 'GPT-5 Nano High',
  
  // OpenAI - GPT-4.5 Series
  'gpt-4.5-preview-2025-02-27': 'GPT-4.5 Preview',
  
  // OpenAI - GPT-4.1 Series
  'gpt-4.1-2025-04-14': 'GPT-4.1',
  'gpt-4.1-mini-2025-04-14': 'GPT-4.1 Mini',
  'gpt-4.1-nano-2025-04-14': 'GPT-4.1 Nano',
  
  // OpenAI - GPT-4o Series
  'chatgpt-4o-latest-20250326': 'ChatGPT-4o Latest',
  'gpt-4o-2024-05-13': 'GPT-4o',
  
  // OpenAI - GPT-4 Series
  'gpt-4-turbo-2024-04-09': 'GPT-4 Turbo',
  'gpt-4-1106-preview': 'GPT-4 1106',
  'gpt-4-0125-preview': 'GPT-4 0125',
  'gpt-4-0613': 'GPT-4 0613',
  'gpt-4-0314': 'GPT-4 0314',
  
  // OpenAI - GPT-3.5 Series
  'gpt-3.5-turbo-0125': 'GPT-3.5 Turbo 0125',
  'gpt-3.5-turbo-1106': 'GPT-3.5 Turbo 1106',
  
  // OpenAI - o Series
  'o3-2025-04-16': 'o3',
  'o4-mini-2025-04-16': 'o4 Mini',
  'o1-2024-12-17': 'o1',
  'o1-preview': 'o1 Preview',
  'o1-mini': 'o1 Mini',
  
  // Anthropic - Claude 4 Series (Thinking)
  'claude-opus-4-1-20250805-thinking-16k': 'Claude Opus 4.1 Thinking 16K',
  'claude-sonnet-4-5-20250929-thinking-32k': 'Claude Sonnet 4.5 Thinking 32K',
  'claude-opus-4-20250514-thinking-16k': 'Claude Opus 4 Thinking 16K',
  'claude-sonnet-4-20250514-thinking-32k': 'Claude Sonnet 4 Thinking 32K',
  
  // Anthropic - Claude 4 Series
  'claude-opus-4-1-20250805': 'Claude Opus 4.1',
  'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
  'claude-opus-4-20250514': 'Claude Opus 4',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  
  // Anthropic - Claude 3 Series
  'claude-3-7-sonnet-20250219-thinking-32k': 'Claude 3.7 Sonnet Thinking',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
  'claude-3-haiku-20240307': 'Claude 3 Haiku',
  
  // Google - Gemini 2.5 Series
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash-preview-09-2025': 'Gemini 2.5 Flash Preview',
  'gemini-2.5-flash-lite-preview-09-2025-no-thinking': 'Gemini 2.5 Flash Lite',
  'gemini-2.5-flash-lite-preview-06-17-thinking': 'Gemini 2.5 Flash Lite Thinking',
  
  // Google - Gemini 1.5 Series
  'gemini-1.5-pro-001': 'Gemini 1.5 Pro',
  'gemini-1.5-flash-002': 'Gemini 1.5 Flash',
  'gemini-1.5-flash-001': 'Gemini 1.5 Flash 001',
  'gemini-1.5-flash-8b-001': 'Gemini 1.5 Flash 8B',
  
  // Google - Other
  'gemini-advanced-0514': 'Gemini Advanced',
  'gemini-pro-dev-api': 'Gemini Pro Dev',
  'gemini-pro': 'Gemini Pro',
  
  // Meta - Llama 4 Series
  'llama-4-maverick-17b-128e-instruct': 'Llama 4 Maverick 17B',
  'llama-4-scout-17b-16e-instruct': 'Llama 4 Scout 17B',
  
  // Meta - Llama 3 Series
  'llama-3.3-70b-instruct': 'Llama 3.3 70B',
  'llama-3.3-nemotron-49b-super-v1': 'Llama 3.3 Nemotron 49B',
  'llama-3.1-405b-instruct-bf16': 'Llama 3.1 405B BF16',
  'llama-3.1-405b-instruct-fp8': 'Llama 3.1 405B FP8',
  'Meta-Llama-3.1-70B-Instruct': 'Llama 3.1 70B',
  'llama-3.1-nemotron-70b-instruct': 'Llama 3.1 Nemotron 70B',
  'llama-3.1-nemotron-51b-instruct': 'Llama 3.1 Nemotron 51B',
  'llama-3.1-tulu-3-70b': 'Llama 3.1 Tulu 3 70B',
  'llama-3.1-tulu-3-8b': 'Llama 3.1 Tulu 3 8B',
  'llama-3.1-8b-instruct': 'Llama 3.1 8B',
  'llama-3-70b-instruct': 'Llama 3 70B',
  'llama-3-8b-instruct': 'Llama 3 8B',
  'llama-3.2-3b-instruct': 'Llama 3.2 3B',
  'llama-3.2-1b-instruct': 'Llama 3.2 1B',
  
  // Meta - Llama 2 Series
  'llama-2-70b-chat': 'Llama 2 70B',
  'llama2-70b-steerlm-chat': 'Llama 2 70B SteerLM',
  'llama-2-13b-chat': 'Llama 2 13B',
  'llama-2-7b-chat': 'Llama 2 7B',
  'llama-13b': 'Llama 13B',
  
  // DeepSeek - V3 Series
  'deepseek-v3.2-exp-thinking': 'DeepSeek V3.2 Exp Thinking',
  'deepseek-v3.2-exp': 'DeepSeek V3.2 Exp',
  'deepseek-v3.1': 'DeepSeek V3.1',
  'deepseek-v3.1-terminus': 'DeepSeek V3.1 Terminus',
  'deepseek-v3.1-terminus-thinking': 'DeepSeek V3.1 Terminus Thinking',
  'deepseek-v3.1-thinking': 'DeepSeek V3.1 Thinking',
  'deepseek-v3-0324': 'DeepSeek V3',
  
  // DeepSeek - V2 Series
  'deepseek-v2.5-1210': 'DeepSeek V2.5',
  'deepseek-v2.5': 'DeepSeek V2.5',
  
  // DeepSeek - R1 Series
  'deepseek-r1-0528': 'DeepSeek R1 0528',
  'deepseek-r1': 'DeepSeek R1',
  
  // DeepSeek - Other
  'deepseek-coder-v2': 'DeepSeek Coder V2',
  'deepseek-llm-67b-chat': 'DeepSeek LLM 67B',
  
  // Alibaba - Qwen 3 Series
  'qwen3-max-preview': 'Qwen 3 Max Preview',
  'qwen3-max-2025-09-23': 'Qwen 3 Max',
  'qwen3-235b-a22b-instruct-2507': 'Qwen 3 235B A22B',
  'qwen3-235b-a22b-thinking-2507': 'Qwen 3 235B A22B Thinking',
  'qwen3-235b-a22b-no-thinking': 'Qwen 3 235B A22B No Thinking',
  'qwen3-235b-a22b': 'Qwen 3 235B',
  'qwen3-vl-235b-a22b-instruct': 'Qwen 3 VL 235B',
  'qwen3-vl-235b-a22b-thinking': 'Qwen 3 VL 235B Thinking',
  'qwen3-next-80b-a3b-instruct': 'Qwen 3 Next 80B',
  'qwen3-30b-a3b-instruct-2507': 'Qwen 3 30B A3B',
  'qwen3-30b-a3b': 'Qwen 3 30B',
  'qwen3-coder-480b-a35b-instruct': 'Qwen 3 Coder 480B',
  
  // Alibaba - Qwen 2.5 Series
  'qwen2.5-max': 'Qwen 2.5 Max',
  'qwen2.5-plus-1127': 'Qwen 2.5 Plus',
  'qwen2.5-72b-instruct': 'Qwen 2.5 72B',
  'qwen2.5-coder-32b-instruct': 'Qwen 2.5 Coder 32B',
  
  // Alibaba - Qwen 2 Series
  'qwen2-72b-instruct': 'Qwen 2 72B',
  
  // Alibaba - Qwen 1.5 Series
  'qwen1.5-110b-chat': 'Qwen 1.5 110B',
  'qwen1.5-72b-chat': 'Qwen 1.5 72B',
  'qwen1.5-32b-chat': 'Qwen 1.5 32B',
  'qwen1.5-14b-chat': 'Qwen 1.5 14B',
  'qwen1.5-7b-chat': 'Qwen 1.5 7B',
  'qwen1.5-4b-chat': 'Qwen 1.5 4B',
  
  // Alibaba - Other
  'qwen-max-0919': 'Qwen Max',
  'qwen-14b-chat': 'Qwen 14B',
  'qwq-32b-preview': 'QwQ 32B Preview',
  'qwq-32b': 'QwQ 32B',
  
  // Zhipu AI - GLM Series
  'glm-4.6': 'GLM-4.6',
  'glm-4.5': 'GLM-4.5',
  'glm-4.5-air': 'GLM-4.5 Air',
  'glm-4-plus': 'GLM-4 Plus',
  'glm-4-0520': 'GLM-4 0520',
  'chatglm3-6b': 'ChatGLM3 6B',
  'chatglm2-6b': 'ChatGLM2 6B',
  'chatglm-6b': 'ChatGLM 6B',
  
  // xAI - Grok Series
  'grok-4-fast': 'Grok 4 Fast',
  'grok-4-0709': 'Grok 4',
  'grok-3-preview-02-24': 'Grok 3 Preview',
  'grok-2-2024-08-13': 'Grok 2',
  'grok-2-mini-2024-08-13': 'Grok 2 Mini',
  
  // Mistral AI
  'mistral-large-2411': 'Mistral Large 2411',
  'mistral-large-2407': 'Mistral Large 2407',
  'mistral-large-2402': 'Mistral Large 2402',
  'mistral-medium-2508': 'Mistral Medium 2508',
  'mistral-medium-2505': 'Mistral Medium 2505',
  'mistral-medium': 'Mistral Medium',
  'mistral-small-3.1-24b-instruct-2503': 'Mistral Small 3.1 24B',
  'mistral-small-24b-instruct-2501': 'Mistral Small 24B',
  'mixtral-8x22b-instruct-v0.1': 'Mixtral 8x22B',
  'mixtral-8x7b-instruct-v0.1': 'Mixtral 8x7B',
  'mistral-7b-instruct-v0.2': 'Mistral 7B v0.2',
  'mistral-7b-instruct': 'Mistral 7B',
  'ministral-8b-2410': 'Ministral 8B',
  
  // Moonshot AI - Kimi
  'kimi-k2-0711-preview': 'Kimi K2 0711',
  'kimi-k2-0905-preview': 'Kimi K2 0905',
  
  // Tencent - Hunyuan
  'hunyuan-t1-20250711': 'Hunyuan T1',
  'hunyuan-turbos-20250416': 'Hunyuan Turbos',
  'hunyuan-large-2025-02-10': 'Hunyuan Large',
  'hunyuan-large-vision': 'Hunyuan Large Vision',
  'hunyuan-standard-2025-02-10': 'Hunyuan Standard',
  'hunyuan-standard-256k': 'Hunyuan Standard 256K',
  
  // 01.AI - Yi Series
  'yi-lightning': 'Yi Lightning',
  'yi-1.5-34b-chat': 'Yi 1.5 34B',
  'yi-34b-chat': 'Yi 34B',
  
  // Amazon - Nova Series
  'amazon-nova-pro-v1.0': 'Amazon Nova Pro',
  'amazon-nova-lite-v1.0': 'Amazon Nova Lite',
  'amazon-nova-micro-v1.0': 'Amazon Nova Micro',
  
  // Cohere
  'command-r-plus-08-2024': 'Command R+ 08-2024',
  'command-r-plus': 'Command R+',
  'command-r-08-2024': 'Command R 08-2024',
  'command-r': 'Command R',
  
  // Reka AI
  'reka-core-20240904': 'Reka Core',
  'reka-flash-20240904': 'Reka Flash',
  'reka-flash-21b-20240226-online': 'Reka Flash 21B Online',
  'reka-flash-21b-20240226': 'Reka Flash 21B',
  
  // AI21 Labs - Jamba
  'jamba-1.5-large': 'Jamba 1.5 Large',
  'jamba-1.5-mini': 'Jamba 1.5 Mini',
  
  // Google - Gemma Series
  'gemma-3n-e4b-it': 'Gemma 3N E4B',
  'gemma-3-4b-it': 'Gemma 3 4B',
  'gemma-2-27b-it': 'Gemma 2 27B',
  'gemma-2-9b-it-simpo': 'Gemma 2 9B Simpo',
  'gemma-2-9b-it': 'Gemma 2 9B',
  'gemma-2-2b-it': 'Gemma 2 2B',
  'gemma-1.1-7b-it': 'Gemma 1.1 7B',
  'gemma-1.1-2b-it': 'Gemma 1.1 2B',
  'gemma-7b-it': 'Gemma 7B',
  'gemma-2b-it': 'Gemma 2B',
  
  // NVIDIA - Nemotron
  'nemotron-4-340b-instruct': 'Nemotron 4 340B',
  
  // IBM - Granite
  'granite-3.1-8b-instruct': 'Granite 3.1 8B',
  'granite-3.1-2b-instruct': 'Granite 3.1 2B',
  'granite-3.0-8b-instruct': 'Granite 3.0 8B',
  'granite-3.0-2b-instruct': 'Granite 3.0 2B',
  
  // Microsoft - Phi Series
  'phi-4': 'Phi-4',
  'phi-3-medium-4k-instruct': 'Phi-3 Medium 4K',
  'phi-3-small-8k-instruct': 'Phi-3 Small 8K',
  'phi-3-mini-128k-instruct': 'Phi-3 Mini 128K',
  'phi-3-mini-4k-instruct-june-2024': 'Phi-3 Mini 4K June',
  'phi-3-mini-4k-instruct': 'Phi-3 Mini 4K',
  
  // Allen AI - OLMo
  'olmo-2-0325-32b-instruct': 'OLMo 2 32B',
  'olmo-7b-instruct': 'OLMo 7B',
  
  // Colossal AI - C4AI Aya
  'c4ai-aya-expanse-32b': 'C4AI Aya Expanse 32B',
  'c4ai-aya-expanse-8b': 'C4AI Aya Expanse 8B',
  
  // Other Notable Models
  'mai-1-preview': 'MAI-1 Preview',
  'magistral-medium-2506': 'Magistral Medium',
  'athene-v2-chat': 'Athene V2 Chat',
  'athene-70b-0725': 'Athene 70B',
  'longcat-flash-chat': 'LongCat Flash',
  'ring-flash-2.0': 'Ring Flash 2.0',
  'step-2-16k-exp-202412': 'Step 2 16K Exp',
  'step-1o-turbo-202506': 'Step 1o Turbo',
  'gpt-oss-20b': 'GPT OSS 20B',
  
  // Open Source Community Models
  'vicuna-33b': 'Vicuna 33B',
  'vicuna-13b': 'Vicuna 13B',
  'vicuna-7b': 'Vicuna 7B',
  'wizardlm-70b': 'WizardLM 70B',
  'wizardlm-13b': 'WizardLM 13B',
  'openchat-3.5': 'OpenChat 3.5',
  'openchat-3.5-0106': 'OpenChat 3.5 0106',
  'starling-lm-7b-beta': 'Starling LM 7B Beta',
  'starling-lm-7b-alpha': 'Starling LM 7B Alpha',
  'zephyr-orpo-141b-A35b-v0.1': 'Zephyr ORPO 141B',
  'zephyr-7b-beta': 'Zephyr 7B Beta',
  'zephyr-7b-alpha': 'Zephyr 7B Alpha',
  'tulu-2-dpo-70b': 'Tulu 2 DPO 70B',
  'nous-hermes-2-mixtral-8x7b-dpo': 'Nous Hermes 2 Mixtral',
  'openhermes-2.5-mistral-7b': 'OpenHermes 2.5 Mistral',
  'dolphin-2.2.1-mistral-7b': 'Dolphin 2.2.1 Mistral',
  'solar-10.7b-instruct-v1.0': 'Solar 10.7B',
  'falcon-180b-chat': 'Falcon 180B',
  'mpt-30b-chat': 'MPT 30B',
  'mpt-7b-chat': 'MPT 7B',
  'dbrx-instruct-preview': 'DBRX Instruct',
  'codellama-70b-instruct': 'CodeLlama 70B',
  'codellama-34b-instruct': 'CodeLlama 34B',
  'internlm2_5-20b-chat': 'InternLM2.5 20B',
  'snowflake-arctic-instruct': 'Snowflake Arctic',
  'stripedhyena-nous-7b': 'StripedHyena Nous 7B',
  'smollm2-1.7b-instruct': 'SmolLM2 1.7B',
  'guanaco-33b': 'Guanaco 33B',
  'koala-13b': 'Koala 13B',
  'alpaca-13b': 'Alpaca 13B',
  'gpt4all-13b-snoozy': 'GPT4All 13B Snoozy',
  'oasst-pythia-12b': 'OASST Pythia 12B',
  'dolly-v2-12b': 'Dolly v2 12B',
  'fastchat-t5-3b': 'FastChat T5 3B',
  'stablelm-tuned-alpha-7b': 'StableLM Tuned Alpha 7B',
  'RWKV-4-Raven-14B': 'RWKV-4 Raven 14B',
  'palm-2': 'PaLM 2',
} as const

export type LMArenaModel = keyof typeof LMARENA_MODELS

interface LMArenaConfig {
  mode: LMArenaMode
  model?: LMArenaModel // direct 모드에서만 사용
  modelA?: LMArenaModel // side-by-side 모드에서만 사용
  modelB?: LMArenaModel // side-by-side 모드에서만 사용
}

export class LMArenaBot extends AbstractBot {
  private conversationId: string | null = null
  private config: LMArenaConfig
  private baseUrl = 'https://lmarena.ai'

  constructor(config: LMArenaConfig) {
    super()
    this.config = config
    this.validateConfig()
  }

  private validateConfig() {
    if (this.config.mode === 'direct' && !this.config.model) {
      throw new Error('Direct mode requires a model to be specified')
    }
    if (this.config.mode === 'side-by-side' && (!this.config.modelA || !this.config.modelB)) {
      throw new Error('Side-by-side mode requires both modelA and modelB')
    }
  }

  get name(): string {
    switch (this.config.mode) {
      case 'direct':
        return `LM Arena (${LMARENA_MODELS[this.config.model!]})`
      case 'battle':
        return 'LM Arena (Battle)'
      case 'side-by-side':
        return `LM Arena (${LMARENA_MODELS[this.config.modelA!]} vs ${LMARENA_MODELS[this.config.modelB!]})`
    }
  }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    // iframe 내에서 직접 동작하므로 여기는 도달하지 않음
    // 혹시 도달하면 안내 메시지
    params.onEvent({
      type: 'UPDATE_ANSWER',
      data: {
        text: '💬 LM Arena는 위의 내장된 화면에서 직접 사용하세요.\n\n' +
              '💡 문제가 있다면 lmarena.ai에 로그인 후 다시 시도해주세요.'
      }
    })
    params.onEvent({ type: 'DONE' })
  }



  resetConversation(): void {
    this.conversationId = null
  }
}

// 편의 팩토리 함수들
export function createDirectChatBot(model: LMArenaModel): LMArenaBot {
  return new LMArenaBot({ mode: 'direct', model })
}

export function createBattleBot(): LMArenaBot {
  return new LMArenaBot({ mode: 'battle' })
}

export function createSideBySideBot(modelA: LMArenaModel, modelB: LMArenaModel): LMArenaBot {
  return new LMArenaBot({ mode: 'side-by-side', modelA, modelB })
}
