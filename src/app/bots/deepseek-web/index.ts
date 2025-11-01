import { AbstractBot, SendMessageParams } from '../abstract-bot'

/**
 * DeepSeek WebApp Bot (iframe 내장 방식)
 *
 * 🎯 Declarative Net Request로 X-Frame-Options 헤더 제거
 * ✅ ConversationPanel에서 iframe으로 chat.deepseek.com 직접 내장
 * ✅ PoW 챌린지가 iframe 내에서 자동 처리됨
 *
 * 이 봇은 실제로 메시지를 전송하지 않음 (iframe 내에서 직접 동작)
 */
export class DeepSeekWebBot extends AbstractBot {

  async doSendMessage(params: SendMessageParams): Promise<void> {
    // iframe 내에서 직접 동작하므로 여기는 도달하지 않음
    // 혹시 도달하면 안내 메시지
    params.onEvent({
      type: 'UPDATE_ANSWER',
      data: {
        text: '💬 DeepSeek은 위의 내장된 화면에서 직접 사용하세요.\n\n' +
              '💡 문제가 있다면 chat.deepseek.com에 로그인 후 다시 시도해주세요.\n\n' +
              '✨ PoW 챌린지는 iframe 내에서 자동으로 처리됩니다.'
      }
    })
    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {
    // No-op: DeepSeek 탭에서 사용자가 직접 관리
    console.log('[DEEPSEEK-WEBAPP] 🔄 Conversation managed in DeepSeek tab')
  }

  get name() {
    return 'DeepSeek'
  }
}
