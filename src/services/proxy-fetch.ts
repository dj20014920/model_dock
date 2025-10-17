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
    const abortController = new AbortController()
    port.onDisconnect.addListener(() => {
      abortController.abort()
    })
    port.onMessage.addListener(async (message: ProxyFetchRequestMessage) => {
      console.debug('proxy fetch', message.url, message.options)
      const resp = await fetch(message.url, {
        ...message.options,
        signal: abortController.signal,
      })
      port.postMessage({
        type: 'PROXY_RESPONSE_METADATA',
        metadata: {
          status: resp.status,
          statusText: resp.statusText,
          headers: Object.fromEntries(resp.headers.entries()),
        },
      } as ProxyFetchResponseMetadataMessage)
      for await (const chunk of streamAsyncIterable(resp.body!)) {
        port.postMessage({
          type: 'PROXY_RESPONSE_BODY_CHUNK',
          value: uint8Array2String(chunk),
          done: false,
        } as ProxyFetchResponseBodyChunkMessage)
      }
      port.postMessage({ type: 'PROXY_RESPONSE_BODY_CHUNK', done: true } as ProxyFetchResponseBodyChunkMessage)
    })
  })
}

export async function proxyFetch(tabId: number, url: string, options?: RequestInitSubset): Promise<Response> {
  console.debug('proxyFetch', tabId, url, options)
  return new Promise((resolve) => {
    // 강제 주입: content-script가 로드되지 않은 탭에서도 확실히 연결되도록 한다
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
        // @ts-ignore chrome global
        chrome.scripting?.executeScript?.({ target: { tabId }, files })
      }
    } catch (e) {
      console.warn('scripting.executeScript (manifest-based) failed (non-fatal)', e)
    }

    const port = Browser.tabs.connect(tabId, { name: uuid() })
    port.onDisconnect.addListener(() => {
      throw new DOMException('proxy fetch aborted', 'AbortError')
    })
    options?.signal?.addEventListener('abort', () => port.disconnect())
    const body = new ReadableStream({
      start(controller) {
        port.onMessage.addListener(function onMessage(
          message: ProxyFetchResponseMetadataMessage | ProxyFetchResponseBodyChunkMessage,
        ) {
          if (message.type === 'PROXY_RESPONSE_METADATA') {
            const response = new Response(body, message.metadata)
            resolve(response)
          } else if (message.type === 'PROXY_RESPONSE_BODY_CHUNK') {
            if (message.done) {
              controller.close()
              port.onMessage.removeListener(onMessage)
              port.disconnect()
            } else {
              const chunk = string2Uint8Array(message.value)
              controller.enqueue(chunk)
            }
          }
        })
        port.postMessage({ url, options } as ProxyFetchRequestMessage)
      },
      cancel(_reason: string) {
        port.disconnect()
      },
    })
  })
}
