import Browser from 'webextension-polyfill'
import { setupProxyExecutor } from '~services/proxy-fetch'

// 상수 정의
const MAX_RETRY_ATTEMPTS = 5
const RETRY_INTERVAL_MS = 1000
const ARKOSE_WAIT_MS = 2000

function injectTip() {
  const div = document.createElement('div')
  div.innerText = '⚠️ 이 탭을 열어두세요! ChatHub로 돌아가도 됩니다. Please keep this tab open, now you can go back to ChatHub'
  div.style.position = 'fixed'
  div.style.top = '0'
  div.style.right = '0'
  div.style.zIndex = '999999'
  div.style.padding = '12px 16px'
  div.style.margin = '10px'
  div.style.border = '2px solid #ef4444'
  div.style.borderRadius = '8px'
  div.style.backgroundColor = '#fee2e2'
  div.style.color = '#991b1b'
  div.style.fontWeight = 'bold'
  div.style.fontSize = '14px'
  div.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
  document.body.appendChild(div)
}

function injectInpageFetchBridge() {
  const inject = () => {
    try {
      // Extension context 경고만 (orphaned 상태일 수 있음)
      if (!Browser.runtime?.id) {
        console.warn('[GPT-PROXY] ⚠️ Extension context may be invalid - attempting injection anyway')
      }

      const script = document.createElement('script')
      script.src = Browser.runtime.getURL('js/inpage-fetch-bridge.js')
      script.async = true
      script.defer = true
      
      // 에러 핸들링 강화
      script.onerror = (e) => {
        console.error('[GPT-PROXY] ❌ Failed to load inpage-fetch-bridge.js', e)
      }
      script.onload = () => {
        console.debug('[GPT-PROXY] ✅ inpage-fetch-bridge.js loaded successfully')
      }
      
      document.documentElement.appendChild(script)
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
  
  // Bridge 주입 (비동기, 실패해도 계속 진행)
  injectInpageFetchBridge()
  
  // URL 요청 리스너
  Browser.runtime.onMessage.addListener(async (message) => {
    if (message === 'url') {
      return location.href
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
  
  // ChatGPT 페이지에서만 안내 팁 표시
  if ((location.host.includes('chat.openai.com') || location.host.includes('chatgpt.com'))) {
    // Next.js 앱 로딩 대기
    let attempts = 0
    const maxAttempts = 50 // 5초
    const waitForNextApp = setInterval(() => {
      attempts++
      if ((window as any).__NEXT_DATA__) {
        clearInterval(waitForNextApp)
        injectTip()
        console.debug('[GPT-PROXY] ✅ Tip injected (Next.js ready)')
      } else if (attempts >= maxAttempts) {
        clearInterval(waitForNextApp)
        // Next.js 로딩 실패해도 팁 표시
        injectTip()
        console.warn('[GPT-PROXY] ⚠️ Tip injected (timeout - Next.js not detected)')
      }
    }, 100)
  }
}

// 중요: setupProxyExecutor()를 먼저 동기적으로 실행하여 port listener 등록
setupProxyExecutor()

// main() 비동기 실행
main().catch((error) => {
  console.error('[GPT-PROXY] ❌ Main initialization failed:', error)
})
