import { requestHostPermission } from '~app/utils/permissions'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { parseSSEResponse } from '~utils/sse'
import { uuid } from '~utils'

interface ConversationContext {
  chatId: string
  parentId: string | null
}

export class QwenWebBot extends AbstractBot {
  private conversationContext?: ConversationContext

  async doSendMessage(params: SendMessageParams) {
    if (!(await requestHostPermission('https://chat.qwen.ai/*'))) {
      throw new ChatError('Missing chat.qwen.ai permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    // 새 대화 시작 또는 기존 대화 이어가기
    if (!this.conversationContext) {
      const chatId = uuid()
      this.conversationContext = { chatId, parentId: null }
    }

    const messageId = uuid()
    const timestamp = Math.floor(Date.now() / 1000)

    const requestBody = {
      stream: true,
      incremental_output: true,
      chat_id: this.conversationContext.chatId,
      chat_mode: 'guest',
      model: 'qwen3-max',
      parent_id: this.conversationContext.parentId,
      messages: [
        {
          fid: messageId,
          parentId: this.conversationContext.parentId,
          childrenIds: [],
          role: 'user',
          content: params.prompt,
          user_action: 'chat',
          files: [],
          timestamp,
          models: ['qwen3-max'],
          chat_type: 't2t',
          feature_config: {
            thinking_enabled: false,
            output_schema: 'phase',
          },
          extra: {
            meta: {
              subChatType: 't2t',
            },
          },
          sub_chat_type: 't2t',
          parent_id: this.conversationContext.parentId,
        },
      ],
      timestamp,
    }

    const resp = await fetch(
      `https://chat.qwen.ai/api/v2/chat/completions?chat_id=${this.conversationContext.chatId}`,
      {
        method: 'POST',
        signal: params.signal,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          Accept: '*/*',
          Origin: 'https://chat.qwen.ai',
          Referer: 'https://chat.qwen.ai/',
          source: 'web',
          timezone: new Date().toString(),
          'x-accel-buffering': 'no',
        },
        body: JSON.stringify(requestBody),
      },
    )

    if (!resp.ok) {
      const error = await resp.text()
      console.error('Qwen API error:', error)
      throw new ChatError(`Qwen API error: ${resp.status}`, ErrorCode.UNKOWN_ERROR)
    }

    let responseId = ''
    let fullText = ''

    await parseSSEResponse(resp, (message) => {
      console.debug('qwen sse message:', message)
      try {
        const data = JSON.parse(message)

        // 응답 생성 이벤트
        if (data['response.created']) {
          responseId = data['response.created'].response_id
          this.conversationContext!.parentId = data['response.created'].parent_id
          return
        }

        // 텍스트 스트리밍
        if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0]
          if (choice.delta && choice.delta.content) {
            fullText += choice.delta.content
            params.onEvent({ type: 'UPDATE_ANSWER', data: { text: fullText } })
          }

          // 완료 상태 확인
          if (choice.delta && choice.delta.status === 'finished') {
            params.onEvent({ type: 'DONE' })
          }
        }
      } catch (e) {
        console.error('Failed to parse Qwen SSE message:', e)
      }
    })

    // SSE 파싱이 끝났는데 DONE 이벤트가 없었다면 전송
    if (fullText) {
      params.onEvent({ type: 'DONE' })
    }
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  get name() {
    return 'Qwen'
  }
}
