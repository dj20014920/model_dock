import { BotId } from '~app/bots'

type IframeConfig = {
  src: string
  sandbox: string
  allow: string
  title: string
}

const REGISTRY: Record<string, IframeConfig> = {
  chatgpt: {
    src: 'https://chat.openai.com',
    sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals',
    allow: 'clipboard-read; clipboard-write',
    title: 'ChatGPT',
  },
  lmarena: {
    src: 'https://lmarena.ai/c/new?mode=direct',
    sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals',
    allow: 'clipboard-read; clipboard-write',
    title: 'LM Arena Chat',
  },
  qwen: {
    src: 'https://chat.qwen.ai',
    sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals',
    allow: 'clipboard-read; clipboard-write',
    title: 'Qwen Chat',
  },
  grok: {
    src: 'https://grok.com',
    sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals',
    allow: 'clipboard-read; clipboard-write',
    title: 'Grok Chat',
  },
  claude: {
    src: 'https://claude.ai',
    sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals',
    allow: 'clipboard-read; clipboard-write',
    title: 'Claude',
  },
}

export function getIframeConfig(botId: BotId | string): IframeConfig | null {
  return REGISTRY[String(botId)] ?? null
}

export function isIframeBot(botId: BotId | string): boolean {
  return Boolean(getIframeConfig(botId))
}

export const iframeBotIds = Object.keys(REGISTRY) as BotId[]

