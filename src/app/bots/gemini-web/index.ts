import { requestHostPermission } from '~app/utils/permissions'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { ProxyRequester } from '~app/utils/proxy-requester'
import { hybridFetch } from '~app/utils/hybrid-requester'
import { parseBardResponse } from '../bard/api'

function extractFromHTML(variableName: string, html: string) {
  const regex = new RegExp(`"${variableName}":"([^"]+)"`)
  const match = regex.exec(html)
  return match?.[1]
}

function generateReqId() {
  return Math.floor(Math.random() * 900000) + 100000
}

interface ConversationContext {
  requestParams: { atValue?: string; blValue?: string }
  contextIds: [string, string, string]
}

export class GeminiWebBot extends AbstractBot {
  private requester = new ProxyRequester({ homeUrl: 'https://gemini.google.com/app', hostStartsWith: 'https://gemini.google.com' })
  private conversationContext?: ConversationContext

  async doSendMessage(params: SendMessageParams) {
    if (!(await requestHostPermission('https://gemini.google.com/*'))) {
      throw new ChatError('Missing gemini.google.com permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    // 1) pinned tab 준비 + SNlM0e / cfb2h 추출
    if (!this.conversationContext) {
      const htmlResp = await hybridFetch(
        'https://gemini.google.com/',
        undefined,
        { homeUrl: 'https://gemini.google.com/app', hostStartsWith: 'https://gemini.google.com' },
      )
      const html = await htmlResp.text()
      const atValue = extractFromHTML('SNlM0e', html)
      const blValue = extractFromHTML('cfb2h', html)
      if (!atValue) {
        throw new ChatError('Gemini web session not available', ErrorCode.UNKOWN_ERROR)
      }
      this.conversationContext = { requestParams: { atValue, blValue }, contextIds: ['', '', ''] }
    }

    const { requestParams, contextIds } = this.conversationContext

    // 2) 요청 페이로드 구성(대화 맥락 유지)
    const payload = [
      null,
      JSON.stringify([[params.prompt, 0, null, []], null, contextIds]),
    ]

    const url = 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate'
    const query = `?bl=${encodeURIComponent(requestParams.blValue || '')}&_reqid=${generateReqId()}&rt=c`
    const resp = await hybridFetch(url + query, {
      method: 'POST',
      signal: params.signal as any,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `at=${encodeURIComponent(requestParams.atValue || '')}&f.req=${encodeURIComponent(JSON.stringify(payload))}`,
    }, { homeUrl: 'https://gemini.google.com/app', hostStartsWith: 'https://gemini.google.com' })
    const textRaw = await resp.text()
    const { text, ids } = parseBardResponse(textRaw)
    this.conversationContext.contextIds = ids
    params.onEvent({ type: 'UPDATE_ANSWER', data: { text } })
    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {}

  get name() {
    return 'Gemini (webapp)'
  }
}
