import Browser from 'webextension-polyfill'
import { setupProxyExecutor } from '~services/proxy-fetch'

// 상수 정의
const MAX_RETRY_ATTEMPTS = 5
const RETRY_INTERVAL_MS = 1000
const ARKOSE_WAIT_MS = 2000

// tip banner disabled (no-op)
function injectTip() {}

function injectInpageFetchBridge() {
  const inject = () => {
    try {
      // Extension context 경고만 (orphaned 상태일 수 있음)
      if (!Browser.runtime?.id) {
        console.warn('[GPT-PROXY] ⚠️ Extension context may be invalid - attempting injection anyway')
      }

      // ⚠️ CRITICAL: CSP 'strict-dynamic' 우회를 위해
      // fetch()로 내용을 가져와서 inline script로 주입
      // (script.src는 CSP에 의해 차단되므로)

      const bridgeURL = Browser.runtime.getURL('js/inpage-fetch-bridge.js')

      fetch(bridgeURL)
        .then(response => response.text())
        .then(scriptContent => {
          const script = document.createElement('script')
          script.textContent = scriptContent
          // Note: async/defer not needed for inline scripts

          // Inject into page context (MAIN world)
          ;(document.head || document.documentElement).appendChild(script)
          script.remove() // Cleanup

          console.debug('[GPT-PROXY] ✅ inpage-fetch-bridge.js injected as inline script (CSP bypass)')
        })
        .catch(e => {
          console.error('[GPT-PROXY] ❌ Failed to fetch/inject inpage-fetch-bridge.js', e)
        })

      return true
    } catch (e) {
      console.error('[GPT-PROXY] ❌ injectInpageFetchBridge failed', e)
      return false
    }
  }

  // Document 상태에 따른 조건부 주입
  if (document.documentElement) {
    inject()
  } else {
    // documentElement가 준비될 때까지 대기
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        observer.disconnect()
        inject()
      }
    })
    observer.observe(document, { childList: true, subtree: true })
  }
}

async function main() {
  console.debug('[GPT-PROXY] 🚀 Content script initializing', location.href)

  // ⚠️ CRITICAL FIX: Grok.com의 CSP 'strict-dynamic' 때문에
  // proxy-fetch.ts의 executeScript가 차단됨!
  // Content script (ISOLATED world)는 CSP 영향을 안 받으므로 여기서 주입
  injectInpageFetchBridge()

  // URL 요청 리스너
  Browser.runtime.onMessage.addListener(async (message) => {
    if (message === 'url') {
      return location.href
    }
    if (message === 'read-oai-did') {
      try {
        const match = document.cookie.match(/(?:^|; )oai-did=([^;]+)/)
        return match ? decodeURIComponent(match[1]) : undefined
      } catch {
        return undefined
      }
    }
    if (message && typeof message === 'object' && message.type === 'read-cookie' && message.name) {
      try {
        const re = new RegExp(`(?:^|; )${String(message.name).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}=([^;]+)`) // escape name
        const m = document.cookie.match(re)
        return m ? decodeURIComponent(m[1]) : undefined
      } catch {
        return undefined
      }
    }

  })
  
  // PROXY_TAB_READY 신호 전송 함수 (재시도 로직 포함)
  const sendReadySignal = async (): Promise<boolean> => {
    try {
      // Extension context 유효성 경고 (orphaned content script 감지)
      if (!Browser.runtime?.id) {
        console.warn('[GPT-PROXY] ⚠️ Extension context may be invalid (orphaned) - will retry anyway')
        // 계속 시도 - 페이지 리로드 후 복구될 수 있음
      }
      
      await Browser.runtime.sendMessage({ event: 'PROXY_TAB_READY' })
      console.debug('[GPT-PROXY] ✅ PROXY_TAB_READY signal sent successfully')
      return true
    } catch (e) {
      console.error('[GPT-PROXY] ❌ Failed to send ready signal:', (e as Error)?.message)
      return false
    }
  }
  
  // 다중 시그널 전송으로 안정성 향상 (재시도 로직 강화)
  const ensureReadySignal = async () => {
    console.debug('[GPT-PROXY] 📡 Starting signal broadcast sequence...')
    
    // 1차 시도: 즉시 전송
    let success = await sendReadySignal()
    
    // 실패 시 재시도 (최대 MAX_RETRY_ATTEMPTS회, RETRY_INTERVAL_MS 간격)
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS && !success; attempt++) {
      console.debug(`[GPT-PROXY] 🔄 Retry attempt ${attempt}/${MAX_RETRY_ATTEMPTS}...`)
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS))
      success = await sendReadySignal()
    }
    
    // 2차 시도: DOM 완전 로드 후
    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        window.addEventListener('load', resolve, { once: true })
      })
      console.debug('[GPT-PROXY] 📄 Page fully loaded, sending ready signal again')
      await sendReadySignal()
    }
    
    // 3차 시도: Arkose iframe 로드 대기 (ARKOSE_WAIT_MS 후)
    setTimeout(async () => {
      console.debug('[GPT-PROXY] ⏰ Final ready signal after Arkose timeout')
      await sendReadySignal()
    }, ARKOSE_WAIT_MS)
  }
  
  // 페이지 로드 상태에 따른 시그널 전송
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', ensureReadySignal, { once: true })
  } else {
    await ensureReadySignal()
  }
  

}

// 중요: setupProxyExecutor()를 먼저 동기적으로 실행하여 port listener 등록
setupProxyExecutor()

// main() 비동기 실행
main().catch((error) => {
  console.error('[GPT-PROXY] ❌ Main initialization failed:', error)
})

// Turnstile solver removed (minimal policy).