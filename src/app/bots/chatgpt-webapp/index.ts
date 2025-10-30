import { AbstractBot, SendMessageParams } from '../abstract-bot'

/**
 * ChatGPT WebApp Bot (iframe 내장 방식)
 *
 * 🎯 Declarative Net Request로 X-Frame-Options 헤더 제거
 * ✅ ConversationPanel에서 iframe으로 chat.openai.com 직접 내장
 *
 * 이 봇은 실제로 메시지를 전송하지 않음 (iframe 내에서 직접 동작)
 */
export class ChatGPTWebBot extends AbstractBot {
  async doSendMessage(params: SendMessageParams): Promise<void> {
    // iframe 내에서 직접 동작하므로 여기는 도달하지 않음
    // 혹시 도달하면 안내 메시지
    params.onEvent({
      type: 'UPDATE_ANSWER',
      data: {
        text: '💬 ChatGPT는 위의 내장된 화면에서 직접 사용하세요.\n\n' +
              '💡 문제가 있다면 chat.openai.com에 로그인 후 다시 시도해주세요.'
      }
    })
    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {
    // No-op: ChatGPT 탭에서 사용자가 직접 관리
    console.log('[CHATGPT-WEBAPP] 🔄 Conversation managed in ChatGPT tab')
  }

  get name() {
    return 'ChatGPT'
  }
}
