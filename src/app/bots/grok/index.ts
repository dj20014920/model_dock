import { GrokMode, getUserConfig } from '~/services/user-config'
import { ChatError, ErrorCode } from '~utils/errors'
import { AsyncAbstractBot, MessageParams } from '../abstract-bot'
import { GrokApiBot } from './api'
import { GrokWebAppBot } from './webapp'
import * as agent from '~services/agent'

/**
 * Grok Bot Facade
 * 사용자 설정에 따라 Webapp 또는 API 모드 선택
 */
export class GrokBot extends AsyncAbstractBot {
  async initializeBot() {
    const config = await getUserConfig()

    if (config.grokMode === GrokMode.API) {
      if (!config.grokApiKey) {
        throw new ChatError('Grok API key not set', ErrorCode.GROK_API_KEY_NOT_SET)
      }
      return new GrokApiBot({
        grokApiKey: config.grokApiKey,
        grokApiModel: config.grokApiModel,
        grokApiCustomModel: config.grokApiCustomModel,
      })
    }

    // 기본값: Webapp 모드
    return new GrokWebAppBot()
  }

  async sendMessage(params: MessageParams) {
    const { grokWebAccess } = await getUserConfig() as any
    if (grokWebAccess) {
      return agent.execute(params.prompt, (prompt) => this.doSendMessageGenerator({ ...params, prompt }), params.signal)
    }
    return this.doSendMessageGenerator(params)
  }
}
