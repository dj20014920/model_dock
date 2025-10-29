import { AsyncAbstractBot, MessageParams } from '../abstract-bot'
import { QwenWebBot } from '../qwen-web'
import { getUserConfig } from '~/services/user-config'
import * as agent from '~services/agent'

export class QwenBot extends AsyncAbstractBot {
  async initializeBot() {
    // 현재는 Webapp 모드만 지원
    return new QwenWebBot()
  }

  async sendMessage(params: MessageParams) {
    const { qwenWebAccess } = (await getUserConfig()) as any
    if (qwenWebAccess) {
      return agent.execute(
        params.prompt,
        (prompt) => this.doSendMessageGenerator({ ...params, prompt }),
        params.signal,
      )
    }
    return this.doSendMessageGenerator(params)
  }
}
