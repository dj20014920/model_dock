import claudeLogo from '~/assets/logos/anthropic.png'
import bingLogo from '~/assets/logos/bing.svg'
import chatgptLogo from '~/assets/logos/chatgpt.svg'
import deepseekLogo from '~/assets/logos/deepseek.png'
import geminiLogo from '~/assets/logos/gemini.png'
import appIcon from '~/assets/icon.png'
import grokLogo from '~/assets/logos/grok.png'
import pplxLogo from '~/assets/logos/pplx.jpg'
import qianwenLogo from '~/assets/logos/qianwen.png'
import lmarenaLogo from '~/assets/logos/lmarena.png'
import { BotId } from './bots'

export const CHATBOTS: Record<BotId, { name: string; avatar: string }> = {
  chatgpt: {
    name: 'ChatGPT',
    avatar: chatgptLogo,
  },
  claude: {
    name: 'Claude',
    avatar: claudeLogo,
  },
  grok: {
    name: 'Grok',
    avatar: grokLogo,
  },
  bing: {
    name: 'Copilot',
    avatar: bingLogo,
  },
  perplexity: {
    name: 'Perplexity',
    avatar: pplxLogo,
  },
  gemini: {
    name: 'Gemini Pro',
    avatar: geminiLogo,
  },
  deepseek: {
    name: 'DeepSeek',
    avatar: deepseekLogo,
  },
  qwen: {
    name: 'Qwen',
    avatar: qianwenLogo,
  },
  lmarena: {
    name: 'LM Arena',
    avatar: lmarenaLogo,
  },
}

export const CHATGPT_HOME_URL = 'https://chatgpt.com'
export const CHATGPT_API_MODELS = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'] as const
export const ALL_IN_ONE_PAGE_ID = 'all'

export const DEFAULT_CHATGPT_SYSTEM_MESSAGE =
  'You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possible. Knowledge cutoff: 2021-09-01. Current date: {current_date}'

export type Layout = 2 | 3 | 4 | 'imageInput' | 'twoVertical' | 'sixGrid' // twoVertical is deprecated
