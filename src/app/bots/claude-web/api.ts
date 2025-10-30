import { FetchError } from 'ofetch'
import { uuid } from '~utils'
import { ChatError, ErrorCode } from '~utils/errors'

type DoFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export async function fetchOrganizationId(doFetch: DoFetch = fetch): Promise<string> {
  let resp: Response
  try {
    resp = await doFetch('https://claude.ai/api/organizations', {
      redirect: 'error',
      cache: 'no-cache',
      credentials: 'include',
    })
  } catch (err) {
    console.error('[Claude API] ❌ Network error:', err)
    throw new ChatError('Claude webapp network error', ErrorCode.NETWORK_ERROR)
  }

  // 401/403: 로그인 필요
  if (resp.status === 401 || resp.status === 403) {
    throw new ChatError('There is no logged-in Claude account in this browser.', ErrorCode.CLAUDE_WEB_UNAUTHORIZED)
  }

  // 2xx가 아닌 경우: JSON 파싱 시도하지 않음
  if (!resp.ok) {
    console.error('[Claude API] ❌ Non-OK response:', resp.status, resp.statusText)
    throw new ChatError(`Claude API error: ${resp.status} ${resp.statusText}`.trim(), ErrorCode.NETWORK_ERROR)
  }

  // 정상 응답: JSON 파싱
  const text = await resp.text()
  if (!text || !text.trim()) {
    throw new ChatError('Empty response from Claude API', ErrorCode.NETWORK_ERROR)
  }

  let orgs: any
  try {
    orgs = JSON.parse(text)
  } catch (e) {
    console.error('[Claude API] ❌ JSON parse error:', e)
    throw new ChatError('Invalid JSON from Claude API', ErrorCode.NETWORK_ERROR)
  }

  if (!orgs || !Array.isArray(orgs) || !orgs[0]?.uuid) {
    throw new ChatError('Invalid organizations data from Claude API', ErrorCode.NETWORK_ERROR)
  }

  return orgs[0].uuid
}

export async function createConversation(organizationId: string, doFetch: DoFetch = fetch): Promise<string> {
  const id = uuid()
  try {
    const resp = await doFetch(`https://claude.ai/api/organizations/${organizationId}/chat_conversations`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', uuid: id }),
    })
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new ChatError('There is no logged-in Claude account in this browser.', ErrorCode.CLAUDE_WEB_UNAUTHORIZED)
      }
      throw new Error('Failed to create conversation')
    }
  } catch (err) {
    if (err instanceof FetchError && (err.status === 401 || err.status === 403)) {
      throw new ChatError('There is no logged-in Claude account in this browser.', ErrorCode.CLAUDE_WEB_UNAUTHORIZED)
    }
    throw err
  }
  return id
}

export async function generateChatTitle(
  organizationId: string,
  conversationId: string,
  content: string,
  doFetch: DoFetch = fetch,
) {
  // Align with current Claude webapp endpoint observed in HAR:
  // POST /api/organizations/:org/chat_conversations/:id/title
  const resp = await doFetch(
    `https://claude.ai/api/organizations/${organizationId}/chat_conversations/${conversationId}/title`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_content: content, recent_titles: [] }),
    },
  )
  if (!resp.ok) throw new Error('Failed to generate title')
}
