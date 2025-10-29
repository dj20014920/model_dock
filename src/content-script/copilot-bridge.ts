/**
 * Copilot Bridge
 *
 * copilot.microsoft.com 페이지와 Extension background 간의
 * 메시지를 중계하는 Content Script
 *
 * Message Flow:
 * 1. Page (interceptor) → window.postMessage → Bridge → chrome.runtime.sendMessage → Background
 * 2. Background → chrome.tabs.sendMessage → Bridge → window.postMessage → Page (interceptor)
 */

console.log('[Copilot Bridge] 🌉 Bridge initialized')

// Inject WebSocket interceptor into the page (MAIN world)
// Content scripts run in an isolated world and cannot override page's window.WebSocket directly.
// We inject a <script> with inline code at document_start so that Copilot's WS is actually hooked.
;(function injectInterceptor() {
  try {
    const INJECT_ID = 'chathub-copilot-ws-interceptor'
    if (document.getElementById(INJECT_ID)) return
    const script = document.createElement('script')
    script.id = INJECT_ID
    script.type = 'text/javascript'
    script.textContent = `
      (function () {
        try {
          var OrigWebSocket = window.WebSocket;
          var wsAddListener = OrigWebSocket && OrigWebSocket.prototype && OrigWebSocket.prototype.addEventListener;
          var wsSend = OrigWebSocket && OrigWebSocket.prototype && OrigWebSocket.prototype.send;
          if (!OrigWebSocket || !wsAddListener || !wsSend) return;

          var EXT_WS = null; // WS instance created on demand by extension
          function attachHandlers(ws) {
            // Forward incoming messages to extension via window.postMessage
            wsAddListener.call(ws, 'message', function (event) {
              try { console.log('[Copilot Interceptor] 📥 Message received:', event && event.data) } catch (_) {}
              window.postMessage({ type: 'COPILOT_WS_MESSAGE', data: event ? event.data : null }, '*');
            });
            // Open
            wsAddListener.call(ws, 'open', function () {
              try { console.log('[Copilot Interceptor] ✅ WebSocket opened') } catch (_) {}
              window.postMessage({ type: 'COPILOT_WS_OPEN' }, '*');
            });
            // Error
            wsAddListener.call(ws, 'error', function (event) {
              try { console.error('[Copilot Interceptor] ❌ WebSocket error:', event) } catch (_) {}
              window.postMessage({ type: 'COPILOT_WS_ERROR', error: 'WebSocket error occurred' }, '*');
            });
            // Close
            wsAddListener.call(ws, 'close', function (event) {
              try { console.log('[Copilot Interceptor] 🔌 WebSocket closed:', event && event.code, event && event.reason) } catch (_) {}
              window.postMessage({ type: 'COPILOT_WS_CLOSE', code: event ? event.code : 0, reason: event ? event.reason : '' }, '*');
            });
          }

          // Allow extension to force-create a WS if page hasn't created one yet
          window.addEventListener('message', function (ev) {
            try {
              if (!ev || ev.source !== window || !ev.data || ev.data.type !== 'EXTENSION_TO_COPILOT') return;
              var msg = ev.data.message || {};
              if (msg && msg.event === 'connect') {
                if (!EXT_WS || EXT_WS.readyState === 3 /* CLOSED */) {
                  try {
                    EXT_WS = new OrigWebSocket('wss://copilot.microsoft.com/c/api/chat?api-version=2');
                    attachHandlers(EXT_WS);
                  } catch (e) {
                    try { console.error('[Copilot Interceptor] ❌ Failed to create WS:', e) } catch (_) {}
                  }
                }
                return;
              }
              if (msg && msg.event === 'send') {
                var target = EXT_WS;
                try {
                  if (target) {
                    wsSend.call(target, JSON.stringify(msg));
                  } else {
                    // no EXT_WS yet; attempt to create and then send
                    EXT_WS = new OrigWebSocket('wss://copilot.microsoft.com/c/api/chat?api-version=2');
                    attachHandlers(EXT_WS);
                    EXT_WS.addEventListener('open', function () {
                      try { wsSend.call(EXT_WS, JSON.stringify(msg)); } catch (_) {}
                    });
                  }
                } catch (err) {
                  try { console.error('[Copilot Interceptor] ❌ Failed to send (ext ws):', err) } catch (_) {}
                }
                return;
              }
            } catch (_) {}
          });

          // Hook constructor in page context so that if page creates its own WS, we still intercept
          window.WebSocket = function WebSocket(url, protocols) {
            var ws;
            try {
              // Keep native construction behavior
              if (arguments.length === 1) {
                ws = new OrigWebSocket(url);
              } else if (arguments.length >= 2) {
                ws = new OrigWebSocket(url, protocols);
              } else {
                ws = new OrigWebSocket(url);
              }
            } catch (e) {
              return new OrigWebSocket(url, protocols);
            }

            var urlString = (typeof url === 'string') ? url : (url && url.toString ? url.toString() : '');
            if (urlString && urlString.indexOf('wss://') === 0 && (urlString.indexOf('copilot.microsoft.com') !== -1 || (location && location.host && location.host.indexOf('copilot.microsoft.com') !== -1))) {
              try { console.log('[Copilot Interceptor] 🔌 WebSocket detected:', urlString) } catch (_) {}
              attachHandlers(ws);
            }
            return ws;
          };
          // Preserve prototype chain
          try { window.WebSocket.prototype = OrigWebSocket.prototype } catch (_) {}
          try { window.WebSocket.prototype.constructor = window.WebSocket } catch (_) {}
          try { console.log('[Copilot Interceptor] ✅ Installed successfully') } catch (_) {}
        } catch (_) {}
      })();
    `;
    // Use documentElement for earliest injection
    (document.documentElement || document.head || document.body).appendChild(script)
  } catch (e) {
    console.debug('[Copilot Bridge] Injection skipped:', (e as Error)?.message)
  }
  // expose a callable for forced reinjection from extension
  ;(window as any).__chathubInjectCopilotWs = injectInterceptor
})()

// 페이지에서 Extension으로 메시지 전달
window.addEventListener('message', (event: MessageEvent) => {
  // 같은 window에서 온 메시지만 처리
  if (event.source !== window) {
    return
  }

  // Copilot WebSocket 관련 메시지만 전달
  if (event.data.type?.startsWith('COPILOT_WS_')) {
    console.log('[Copilot Bridge] 📨 Page → Extension:', event.data.type)

    // Extension background로 전달
    chrome.runtime.sendMessage({
      type: 'FROM_COPILOT_PAGE',
      data: event.data,
    }).catch((error) => {
      // Extension context가 없을 수 있음 (정상 상황)
      console.debug('[Copilot Bridge] Extension not listening:', error.message)
    })
  }
})

// Extension에서 페이지로 메시지 전달
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COPILOT_INJECT') {
    try {
      ;(window as any).__chathubInjectCopilotWs?.()
      console.log('[Copilot Bridge] ♻️ Reinjected interceptor')
    } catch (e) {
      console.debug('[Copilot Bridge] Reinjection failed:', (e as Error)?.message)
    }
    return true
  }
  if (message.type === 'TO_COPILOT_PAGE') {
    console.log('[Copilot Bridge] 📤 Extension → Page:', message.data?.event)

    // 페이지로 메시지 전달
    window.postMessage(
      {
        type: 'EXTENSION_TO_COPILOT',
        message: message.data,
      },
      '*'
    )

    return true // Message handled successfully
  }
})

console.log('[Copilot Bridge] ✅ Bridge ready')
