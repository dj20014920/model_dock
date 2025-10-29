/**
 * Copilot WebSocket Interceptor
 *
 * copilot.microsoft.com 페이지 내에서 WebSocket 생성을 가로채서
 * Extension과 통신할 수 있도록 하는 스크립트
 *
 * 참고: StackOverflow에서 검증된 패턴
 * https://stackoverflow.com/questions/62798510/
 */

;(function () {
  const OrigWebSocket = window.WebSocket
  const wsAddListener = OrigWebSocket.prototype.addEventListener
  const wsSend = OrigWebSocket.prototype.send

  // WebSocket 생성 가로채기
  window.WebSocket = function WebSocket(
    url: string | URL,
    protocols?: string | string[]
  ) {
    let ws: WebSocket

    if (arguments.length === 1) {
      ws = new OrigWebSocket(url)
    } else if (arguments.length >= 2) {
      ws = new OrigWebSocket(url, protocols!)
    } else {
      ws = new OrigWebSocket(url)
    }

    const urlString = typeof url === 'string' ? url : url.toString()

    // copilot.microsoft.com WebSocket만 intercept
    if (urlString.includes('copilot.microsoft.com')) {
      console.log('[Copilot Interceptor] 🔌 WebSocket detected:', urlString)

      // 메시지 수신 감지
      wsAddListener.call(ws, 'message', function (event: MessageEvent) {
        console.log('[Copilot Interceptor] 📥 Message received:', event.data)

        // Extension으로 메시지 전달
        window.postMessage(
          {
            type: 'COPILOT_WS_MESSAGE',
            data: event.data,
          },
          '*'
        )
      })

      // 연결 완료 감지
      wsAddListener.call(ws, 'open', function () {
        console.log('[Copilot Interceptor] ✅ WebSocket opened')

        window.postMessage(
          {
            type: 'COPILOT_WS_OPEN',
          },
          '*'
        )
      })

      // 에러 감지
      wsAddListener.call(ws, 'error', function (event: Event) {
        console.error('[Copilot Interceptor] ❌ WebSocket error:', event)

        window.postMessage(
          {
            type: 'COPILOT_WS_ERROR',
            error: 'WebSocket error occurred',
          },
          '*'
        )
      })

      // 연결 종료 감지
      wsAddListener.call(ws, 'close', function (event: CloseEvent) {
        console.log('[Copilot Interceptor] 🔌 WebSocket closed:', event.code, event.reason)

        window.postMessage(
          {
            type: 'COPILOT_WS_CLOSE',
            code: event.code,
            reason: event.reason,
          },
          '*'
        )
      })

      // Extension에서 보낸 메시지를 WebSocket으로 전송
      window.addEventListener('message', function (event: MessageEvent) {
        if (event.source === window && event.data.type === 'EXTENSION_TO_COPILOT') {
          console.log('[Copilot Interceptor] 📤 Sending message to WebSocket:', event.data.message)
          try {
            wsSend.call(ws, JSON.stringify(event.data.message))
          } catch (error) {
            console.error('[Copilot Interceptor] ❌ Failed to send message:', error)
          }
        }
      })
    }

    return ws
  } as any

  // Prototype 유지
  window.WebSocket.prototype = OrigWebSocket.prototype
  window.WebSocket.prototype.constructor = window.WebSocket

  console.log('[Copilot Interceptor] ✅ Installed successfully')
})()
