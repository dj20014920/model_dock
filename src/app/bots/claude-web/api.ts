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
      // Ensure logged-in cookies are sent from the browser session
      credentials: 'include',
    })
  } catch (err) {
    console.error(err)
    throw new ChatError('Claude webapp not avaiable in your country', ErrorCode.CLAUDE_WEB_UNAVAILABLE)
  }
  if (resp.status === 403) {
    throw new ChatError('There is no logged-in Claude account in this browser.', ErrorCode.CLAUDE_WEB_UNAUTHORIZED)
  }
  const orgs = await resp.json()
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
    if (!resp.ok) throw new Error('Failed to create conversation')
  } catch (err) {
    if (err instanceof FetchError && err.status === 403) {
      throw new ChatError('There is no logged-in Claude account in this browser.', ErrorCode.CLAUDE_WEB_UNAUTHORIZED)
    }
    throw err
  }
  return id
}

export async function generateChatTitle(organizationId: string, conversationId: string, content: string, doFetch: DoFetch = fetch) {
  const resp = await doFetch('https://claude.ai/api/generate_chat_title', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_uuid: organizationId,
      conversation_uuid: conversationId,
      recent_titles: [],
      message_content: content,
    }),
  })
  if (!resp.ok) throw new Error('Failed to generate title')
}
