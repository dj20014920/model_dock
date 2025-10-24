import Browser from 'webextension-polyfill'
import {
  ProxyFetchRequestMessage,
  ProxyFetchResponseBodyChunkMessage,
  ProxyFetchResponseMetadataMessage,
  RequestInitSubset,
} from '~types/messaging'
import { uuid } from '~utils'
import { string2Uint8Array, uint8Array2String } from '~utils/encoding'
import { streamAsyncIterable } from '~utils/stream-async-iterable'

export function setupProxyExecutor() {
  // one port for one fetch request
  Browser.runtime.onConnect.addListener((port) => {
    let reqId: string | null = null
    const onWindowMessage = (ev: MessageEvent) => {
      if (ev.source !== window || ev.origin !== location.origin) return
      const data: any = ev.data
      if (!data || !reqId || data.requestId !== reqId) return
      if (data.type === 'INPAGE_FETCH_META') {
        console.debug('[INPAGE] META', { status: data?.meta?.status })
        port.postMessage({ type: 'PROXY_RESPONSE_METADATA', metadata: data.meta } as ProxyFetchResponseMetadataMessage)
      } else if (data.type === 'INPAGE_FETCH_CHUNK') {
        const value = typeof data.value === 'string' ? data.value : ''
        if (value) {
          const preview = value.length > 100 ? value.slice(0, 100) + '…' : value
          console.debug('[INPAGE] CHUNK', { len: value.length, preview })
        } else if (data.done) {
          console.debug('[INPAGE] DONE')
        }
        port.postMessage({ type: 'PROXY_RESPONSE_BODY_CHUNK', value, done: !!data.done } as ProxyFetchResponseBodyChunkMessage)
        if (data.done) {
          window.removeEventListener('message', onWindowMessage as any)
          try { port.disconnect() } catch {}
        }
      } else if (data.type === 'INPAGE_FETCH_ERROR') {
        // Signal end-of-stream to consumer; consumer will surface error by missing metadata/body
        console.warn('[INPAGE] ERROR', data?.message)
        port.postMessage({ type: 'PROXY_RESPONSE_BODY_CHUNK', value: String(data.message || ''), done: true } as ProxyFetchResponseBodyChunkMessage)
        window.removeEventListener('message', onWindowMessage as any)
        try { port.disconnect() } catch {}
      }
    }
    port.onDisconnect.addListener(() => {
      if (reqId) {
        window.postMessage({ type: 'INPAGE_FETCH_ABORT', requestId: reqId }, location.origin)
      }
      window.removeEventListener('message', onWindowMessage as any)
    })
    port.onMessage.addListener(async (message: ProxyFetchRequestMessage) => {
      console.debug('[INPAGE] start', message.url, { method: message?.options?.method || 'GET' })
      reqId = uuid()
      window.addEventListener('message', onWindowMessage as any)
      // Forward to page context bridge
      const forwarded: any = { ...(message.options || {}) }
      // AbortController cannot be cloned; rely on port disconnect → abort
      delete forwarded.signal
      window.postMessage({ type: 'INPAGE_FETCH', requestId: reqId, url: message.url, options: forwarded }, location.origin)
    })
  })
}

export async function proxyFetch(tabId: number, url: string, options?: RequestInitSubset): Promise<Response> {
  console.log('[PROXY-FETCH] 🚀 Starting request', { tabId, url: url.substring(0, 80), method: options?.method || 'GET' })
  return new Promise(async (resolve, reject) => {
    // 강제 주입: content-script가 로드되지 않은 탭에서도 확실히 연결되도록 한다
    let injectionAttempted = false
    try {
      // 주입 파일 경로는 빌드 모드에서 해시가 붙은 에셋으로 변경된다.
      // 따라서 매니페스트의 content_scripts 항목에서 js 파일 목록을 수집하여 주입한다.
      // @ts-ignore chrome global
      const manifest = chrome.runtime?.getManifest?.()
      const files = Array.from(
        new Set(
          ((manifest?.content_scripts as any[]) || [])
            .flatMap((cs: any) => (Array.isArray(cs.js) ? cs.js : []))
            // 안전하게 프록시 실행기를 포함한 로더만 선택(여러 매치에 동일 파일 반복됨)
            .filter((p: string) => typeof p === 'string' && p.includes('chatgpt-inpage-proxy')),
        ),
      ) as string[]
      if (files.length) {
        injectionAttempted = true
        console.log('[PROXY-FETCH] 💉 Injecting content scripts:', files)
        // @ts-ignore chrome global
        await chrome.scripting?.executeScript?.({ target: { tabId }, files }).catch((err: any) => {
          const errorMsg = err?.message || ''
          console.warn('[PROXY-FETCH] ⚠️ Script injection failed (non-fatal - may already exist):', {
            error: errorMsg,
            tabId,
            attemptedFiles: files
          })

          // 파일 해시 불일치 감지 (Chrome 캐시 문제)
          if (errorMsg.includes('Could not load file') || errorMsg.includes('chatgpt-inpage-proxy')) {
            console.error('[PROXY-FETCH] ❌ MANIFEST CACHE ISSUE DETECTED!')
            console.error('[PROXY-FETCH] 💡 해결 방법:')
            console.error('  1. Chrome에서 이 확장 프로그램 완전 제거')
            console.error('  2. Chrome 재시작')
            console.error('  3. yarn build 재실행')
            console.error('  4. 확장 프로그램 다시 로드')
            console.error('  자세한 내용: TROUBLESHOOTING.md 참고')
          }
        })

        // 인페이지 브리지(js/inpage-fetch-bridge.js)를 MAIN world로 주입(CSP nonce 우회)
        try {
          // @ts-ignore chrome global
          await chrome.scripting?.executeScript?.({ target: { tabId }, files: ['js/inpage-fetch-bridge.js'], world: 'MAIN' as any })
          console.log('[PROXY-FETCH] ✅ In-page bridge injected via scripting.executeScript (MAIN world)')
        } catch (e: any) {
          console.warn('[PROXY-FETCH] ⚠️ In-page bridge inject failed (will rely on fallback if present):', e?.message)
        }
        
        // Content Script 초기화 대기 시간 증가 (300ms → 1000ms)
        // Arkose CAPTCHA 등 외부 리소스 로딩 대기
        console.log('[PROXY-FETCH] ⏳ Waiting for content script initialization (1000ms)...')
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else {
        console.warn('[PROXY-FETCH] ⚠️ No content scripts found in manifest to inject')
        // 그래도 브리지는 주입 시도(탭에 CS가 이미 있을 수 있음)
        try {
          // @ts-ignore chrome global
          await chrome.scripting?.executeScript?.({ target: { tabId }, files: ['js/inpage-fetch-bridge.js'], world: 'MAIN' as any })
          console.debug('[PROXY-FETCH] ✅ In-page bridge injected (without CS list)')
        } catch (e: any) {
          console.warn('[PROXY-FETCH] ⚠️ In-page bridge inject failed (no CS list):', e?.message)
        }
      }
    } catch (e) {
      console.error('[PROXY-FETCH] ❌ scripting.executeScript error:', {
        error: (e as Error)?.message,
        injectionAttempted,
        tabId
      })
    }
    
    // Content Script 존재 확인 (ping-pong 체크) - 재시도 로직 추가
    let contentScriptReady = false
    const maxPingRetries = 3
    for (let retry = 1; retry <= maxPingRetries; retry++) {
      try {
        console.log(`[PROXY-FETCH] 🏓 Checking content script status (attempt ${retry}/${maxPingRetries})...`)
        const response = await Browser.tabs.sendMessage(tabId, 'url')
        if (response && typeof response === 'string') {
          contentScriptReady = true
          console.log('[PROXY-FETCH] ✅ Content script is ready', { 
            url: response.substring(0, 50),
            attempt: retry
          })
          break
        }
      } catch (pingError) {
        if (retry === maxPingRetries) {
          const errorMsg = (pingError as Error)?.message || ''
          console.warn('[PROXY-FETCH] ⚠️ Content script ping failed after all retries', {
            error: errorMsg,
            tabId,
            attempts: maxPingRetries
          })

          // 파일 해시 불일치로 인한 실패 가능성 경고
          if (errorMsg.includes('Could not establish connection') || errorMsg.includes('Receiving end does not exist')) {
            console.error('[PROXY-FETCH] ❌ Content script 초기화 실패!')
            console.error('[PROXY-FETCH] 💡 가능한 원인:')
            console.error('  1. Chrome이 이전 빌드의 manifest.json을 캐시')
            console.error('  2. Content script 파일 해시 불일치')
            console.error('[PROXY-FETCH] 🔧 해결 방법: TROUBLESHOOTING.md 참고')
          }

          // 🔄 최후의 수단: 탭 리로드하여 content script 강제 재주입
          console.warn('[PROXY-FETCH] 🔄 Attempting tab reload to recover content script...')
          try {
            await Browser.tabs.reload(tabId)
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            // 리로드 후 재확인
            const recoveryResponse = await Browser.tabs.sendMessage(tabId, 'url')
            if (recoveryResponse && typeof recoveryResponse === 'string') {
              contentScriptReady = true
              console.debug('[PROXY-FETCH] ✅ Content script recovered after reload', {
                url: recoveryResponse.substring(0, 50)
              })
            }
          } catch (recoveryError) {
            console.error('[PROXY-FETCH] ❌ Tab reload recovery failed:', (recoveryError as Error)?.message)
          }
        } else {
          // 재시도 전 짧은 대기
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    }
    
    let port: Browser.Runtime.Port
    try {
      port = Browser.tabs.connect(tabId, { name: uuid() })
      console.log('[PROXY-FETCH] ✅ Port connected successfully', { tabId, portName: port.name })
    } catch (err) {
      console.error('[PROXY-FETCH] ❌ Failed to connect to tab', {
        tabId,
        error: (err as Error)?.message,
        reason: 'Content script may not be loaded or tab is invalid',
        contentScriptReady
      })
      const empty = new ReadableStream({ start(c) { try { c.close() } catch {} } })
      resolve(new Response(empty, { status: 499, statusText: 'TAB_CONNECT_FAILED' }))
      return
    }
    
    let settled = false
    const startTime = Date.now()
    const connectionTimeout = setTimeout(() => {
      if (!settled) {
        const elapsed = Date.now() - startTime
        console.error(`[PROXY-FETCH] ⏱️ Connection timeout after ${elapsed}ms`, {
          tabId,
          url: url.substring(0, 80),
          contentScriptReady,
          troubleshooting: [
            'Content script not responding',
            'Possible Arkose CAPTCHA blocking page load',
            'Try manually refreshing the ChatGPT tab',
            'Check browser console for [GPT-PROXY] logs'
          ].join(' | ')
        })
        settled = true
        const empty = new ReadableStream({ start(c) { try { c.close() } catch {} } })
        resolve(new Response(empty, { status: 499, statusText: 'CONNECTION_TIMEOUT' }))
        try { port.disconnect() } catch {}
      }
    }, 30000) // 타임아웃 30초로 증가 (Arkose 로딩 + 초기화 대기)
    
    port.onDisconnect.addListener(() => {
      clearTimeout(connectionTimeout)
      // Response 생성 규격상 status는 [200..599] 여야 하므로 499로 신호한다.
      // 상위 레벨에서는 ok=false로 감지되어 재시도(fixAuthState) 경로로 진입한다.
      if (!settled) {
        const elapsed = Date.now() - startTime
        console.warn(`[PROXY-FETCH] 💔 Port disconnected prematurely after ${elapsed}ms`, {
          tabId,
          url: url.substring(0, 80),
          reason: 'Content script may have crashed or tab closed'
        })
        settled = true
        const empty = new ReadableStream({ start(c) { try { c.close() } catch {} } })
        resolve(new Response(empty, { status: 499, statusText: 'PORT_DISCONNECTED' }))
      }
    })
    options?.signal?.addEventListener('abort', () => {
      clearTimeout(connectionTimeout)
      port.disconnect()
    })
    const body = new ReadableStream({
      start(controller) {
        port.onMessage.addListener(function onMessage(
          message: ProxyFetchResponseMetadataMessage | ProxyFetchResponseBodyChunkMessage,
        ) {
          if (message.type === 'PROXY_RESPONSE_METADATA') {
            clearTimeout(connectionTimeout)
            if (!settled) {
              const elapsed = Date.now() - startTime
              console.log(`[PROXY-FETCH] 📊 Metadata received (${elapsed}ms)`, {
                status: message.metadata?.status,
                statusText: message.metadata?.statusText,
                url: url.substring(0, 80)
              })
              settled = true
              const response = new Response(body, message.metadata)
              resolve(response)
            }
          } else if (message.type === 'PROXY_RESPONSE_BODY_CHUNK') {
            if (message.done) {
              const elapsed = Date.now() - startTime
              console.debug(`[PROXY-FETCH] ✅ Stream complete (${elapsed}ms)`, {
                url: url.substring(0, 80)
              })
              try { controller.close() } catch {}
              try { port.onMessage.removeListener(onMessage) } catch {}
              try { port.disconnect() } catch {}
            } else {
              // Narrowing for discriminated union { done: false; value: string }
              if ('value' in message) {
                const chunk = string2Uint8Array(message.value)
                controller.enqueue(chunk)
              }
            }
          }
        })
        console.log('[PROXY-FETCH] 📤 Sending request to content script via port')
        port.postMessage({ url, options } as ProxyFetchRequestMessage)
      },
      cancel(_reason: string) {
        clearTimeout(connectionTimeout)
        console.debug('[PROXY-FETCH] stream cancelled', _reason)
        try { port.disconnect() } catch {}
      },
    })
  })
}

// Background-origin streaming fetch over a runtime Port.
// Use when extension host_permissions allow direct CORS-less access.
export async function backgroundFetch(url: string, options?: RequestInitSubset): Promise<Response> {
  console.debug('backgroundFetch', url, options)
  return new Promise((resolve) => {
    const port = Browser.runtime.connect({ name: `BG_FETCH:${uuid()}` })
    port.onDisconnect.addListener(() => {
      // consumer holds the stream; disconnection signals end/abort
    })
    options?.signal?.addEventListener('abort', () => {
      try { port.disconnect() } catch {}
    })

    const body = new ReadableStream({
      start(controller) {
        function onMessage(message: any) {
          if (message?.type === 'BG_FETCH_META') {
            const resp = new Response(body, message.meta || {})
            resolve(resp)
          } else if (message?.type === 'BG_FETCH_CHUNK') {
            if (message.done) {
              try { controller.close() } catch {}
              try { port.onMessage.removeListener(onMessage) } catch {}
              try { port.disconnect() } catch {}
            } else if (typeof message.value === 'string') {
              const preview = message.value.length > 100 ? message.value.slice(0, 100) + '…' : message.value
              console.debug('[BG_FETCH] CHUNK', { len: message.value.length, preview })
              const chunk = string2Uint8Array(message.value)
              controller.enqueue(chunk)
            }
          } else if (message?.type === 'BG_FETCH_ERROR') {
            console.warn('[BG_FETCH] ERROR', message?.message)
            // no-op; stream already closed by CHUNK done
          }
        }
        port.onMessage.addListener(onMessage)
        port.postMessage({ type: 'BG_FETCH_START', url, options })
      },
      cancel() {
        try { port.disconnect() } catch {}
      },
    })
  })
}
