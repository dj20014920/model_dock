import { ClaudeMode, getUserConfig } from '~/services/user-config'
import { AsyncAbstractBot, MessageParams } from '../abstract-bot'
import { ClaudeApiBot } from '../claude-api'
import { ClaudeWebBot } from '../claude-web'
import { PoeWebBot } from '../poe'
import { ChatError, ErrorCode } from '~utils/errors'
import { OpenRouterBot } from '../openrouter'

export class ClaudeBot extends AsyncAbstractBot {
  async initializeBot() {
    const { claudeMode, ...config } = await getUserConfig()
    if (claudeMode === ClaudeMode.API) {
      if (!config.claudeApiKey) {
        throw new Error('Claude API key missing')
      }
      return new ClaudeApiBot({
        claudeApiKey: config.claudeApiKey,
        claudeApiModel: config.claudeApiModel,
      })
    }
    if (claudeMode === ClaudeMode.Webapp) {
      return new ClaudeWebBot()
    }
    if (claudeMode === ClaudeMode.OpenRouter) {
      if (!config.openrouterApiKey) {
        throw new ChatError('OpenRouter API key not set', ErrorCode.API_KEY_NOT_SET)
      }
      const model = `anthropic/${config.openrouterClaudeModel}`
      return new OpenRouterBot({ apiKey: config.openrouterApiKey, model })
    }
    return new PoeWebBot(config.poeModel)
  }

  /**
   * Claude 메시지 전송
   * 
   * PRD: Agent/Web Search 기능은 요구사항에 없으므로 비활성화
   * - 더 안정적이고 예측 가능한 동작
   * - 복잡한 프롬프트 래핑 제거
   * - 에러 발생 가능성 감소
   */
  async sendMessage(params: MessageParams) {
    // Agent 기능 완전히 비활성화 (PRD 요구사항 없음)
    return this.doSendMessageGenerator(params)
  }
}
