import { requestHostPermission } from '~app/utils/permissions'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { ProxyRequester } from '~app/utils/proxy-requester'
import { getUserConfig } from '~services/user-config'

export class DeepSeekWebBot extends AbstractBot {
  private requester = new ProxyRequester({ homeUrl: 'https://chat.deepseek.com', hostStartsWith: 'https://chat.deepseek.com' })

  async doSendMessage(params: SendMessageParams) {
    if (!(await requestHostPermission('https://chat.deepseek.com/*'))) {
      throw new ChatError('Missing chat.deepseek.com permission', ErrorCode.MISSING_HOST_PERMISSION)
    }
    // Ensure pinned tab & session readiness
    await this.requester.fetch('https://chat.deepseek.com').catch(() => {})

    const cfg = await getUserConfig()
    const model = (cfg as any).deepseekWebappCustomModel || (cfg as any).deepseekApiModel || 'deepseek-chat'

    throw new ChatError(`DeepSeek Webapp endpoint binding required (model: ${model}). Please keep the pinned tab open; we will capture and finalize.`, ErrorCode.UNKOWN_ERROR)
  }

  resetConversation() {}

  get name() {
    return 'DeepSeek (webapp)'
  }
}
