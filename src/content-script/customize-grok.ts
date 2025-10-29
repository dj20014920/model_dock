/**
 * Grok.com UI Theming Content Script
 * 
 * DOM 기반 커스터마이징을 통해 Grok 인터페이스에 브랜딩 추가
 * - CSS 스타일 주입
 * - 워터마크 추가
 * - 시각적 개선
 */

// 중복 실행 방지
if (!(window as any).__GROK_CUSTOMIZED__) {
  ;(window as any).__GROK_CUSTOMIZED__ = true

  console.log('[GROK-CUSTOMIZE] 🎨 Initializing Grok UI theme...')

  /**
   * CSS 스타일 주입
   */
  function injectStyles() {
    const style = document.createElement('style')
    style.id = 'model-dock-grok-theme'
    style.textContent = `
      /* Model Dock Grok Theme */
      
      /* 전체 배경 그라데이션 */
      body {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important;
      }

      /* 채팅 컨테이너 배경 */
      [class*="chat"], [class*="conversation"], [class*="messages"] {
        background: rgba(22, 33, 62, 0.6) !important;
        backdrop-filter: blur(10px) !important;
      }

      /* 메시지 박스 스타일링 */
      [class*="message"] {
        border-radius: 12px !important;
        padding: 16px !important;
        margin: 8px 0 !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
      }

      /* 사용자 메시지 */
      [class*="user"], [class*="human"] {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: white !important;
      }

      /* AI 응답 */
      [class*="assistant"], [class*="ai"], [class*="bot"] {
        background: rgba(255, 255, 255, 0.05) !important;
        border-left: 3px solid #667eea !important;
      }

      /* 입력창 스타일 */
      textarea, input[type="text"] {
        background: rgba(255, 255, 255, 0.08) !important;
        border: 1px solid rgba(102, 126, 234, 0.3) !important;
        border-radius: 8px !important;
        color: white !important;
        padding: 12px !important;
      }

      textarea:focus, input[type="text"]:focus {
        border-color: #667eea !important;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
        outline: none !important;
      }

      /* 버튼 스타일 */
      button {
        border-radius: 8px !important;
        transition: all 0.3s ease !important;
      }

      button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3) !important;
      }

      /* 스크롤바 커스터마이징 */
      ::-webkit-scrollbar {
        width: 8px !important;
      }

      ::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05) !important;
        border-radius: 4px !important;
      }

      ::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        border-radius: 4px !important;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%) !important;
      }

      /* Model Dock 워터마크 */
      .model-dock-watermark {
        position: fixed !important;
        bottom: 16px !important;
        right: 16px !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: white !important;
        padding: 8px 16px !important;
        border-radius: 20px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        z-index: 9999 !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
        cursor: pointer !important;
        user-select: none !important;
        transition: all 0.3s ease !important;
      }

      .model-dock-watermark:hover {
        transform: translateY(-2px) scale(1.05) !important;
        box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4) !important;
      }

      /* 로딩 애니메이션 */
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      [class*="loading"], [class*="typing"] {
        animation: pulse 1.5s ease-in-out infinite !important;
      }

      /* 다크모드 텍스트 가독성 개선 */
      * {
        text-shadow: none !important;
      }

      p, span, div {
        color: rgba(255, 255, 255, 0.9) !important;
      }

      /* 코드 블록 스타일 */
      pre, code {
        background: rgba(0, 0, 0, 0.3) !important;
        border: 1px solid rgba(102, 126, 234, 0.3) !important;
        border-radius: 6px !important;
      }
    `
    
    // Head 또는 Body에 스타일 주입
    const target = document.head || document.documentElement
    target.appendChild(style)
    
    console.log('[GROK-CUSTOMIZE] ✅ Styles injected')
  }

  /**
   * 워터마크 추가
   */
  function addWatermark() {
    // 기존 워터마크 제거
    const existing = document.querySelector('.model-dock-watermark')
    if (existing) existing.remove()

    const watermark = document.createElement('div')
    watermark.className = 'model-dock-watermark'
    watermark.textContent = '⚡ Powered by Model Dock'
    watermark.title = 'Click to open Model Dock settings'
    
    // 클릭 시 설정 페이지 열기 (선택사항)
    watermark.addEventListener('click', () => {
      console.log('[GROK-CUSTOMIZE] 🔧 Opening Model Dock settings...')
      // chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' }) // 필요시 활성화
    })

    document.body.appendChild(watermark)
    console.log('[GROK-CUSTOMIZE] ✅ Watermark added')
  }

  /**
   * 초기화 - DOM이 준비되면 실행
   */
  function initialize() {
    // 스타일 즉시 주입 (깜빡임 방지)
    injectStyles()

    // DOM 로드 후 워터마크 추가
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(addWatermark, 500) // 약간의 지연으로 페이지 안정화 대기
      })
    } else {
      setTimeout(addWatermark, 500)
    }

    // SPA 네비게이션 감지 (URL 변경 시 워터마크 재추가)
    let lastUrl = location.href
    new MutationObserver(() => {
      const currentUrl = location.href
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl
        console.log('[GROK-CUSTOMIZE] 🔄 URL changed, re-applying watermark...')
        setTimeout(addWatermark, 1000)
      }
    }).observe(document.body, { childList: true, subtree: true })

    console.log('[GROK-CUSTOMIZE] 🎉 Initialization complete')
  }

  // 실행
  initialize()

  /**
   * ========================================
   * AUTO DISPATCH: 자동 입력 및 전송 기능
   * ========================================
   */

  /**
   * Grok 입력창 찾기
   * Grok.com의 DOM 구조에서 입력창을 찾는 다양한 시도
   * 
   * 전략:
   * 1. 구체적인 셀렉터부터 시도
   * 2. 일반적인 셀렉터로 폴백
   * 3. 모든 textarea/input을 검사하여 가장 적합한 것 선택
   */
  function findGrokInput(): HTMLTextAreaElement | HTMLInputElement | null {
    console.log('[GROK-AUTO] 🔍 Searching for input field...')
    
    // Phase 1: 구체적인 셀렉터
    const specificSelectors = [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Type"]',
      'textarea[placeholder*="grok"]',
      'textarea[data-testid*="input"]',
      'textarea[data-testid*="prompt"]',
      'textarea[aria-label*="input"]',
      'textarea[aria-label*="message"]',
      'input[type="text"][placeholder*="Ask"]',
      'input[type="text"][placeholder*="Message"]',
    ]

    for (const selector of specificSelectors) {
      const elements = document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(selector)
      if (elements.length > 0) {
        // 마지막 요소 (보통 최신/활성 요소)
        const input = elements[elements.length - 1]
        if (input.offsetParent !== null && !input.disabled && !input.readOnly) {
          console.log(`[GROK-AUTO] ✅ Found input via specific selector: ${selector}`)
          console.log(`[GROK-AUTO] 📝 Input details - Tag: ${input.tagName}, Placeholder: "${input.placeholder}", Class: "${input.className}"`)
          return input
        }
      }
    }

    // Phase 2: 일반적인 textarea/input 검색 + 휴리스틱
    console.log('[GROK-AUTO] 🔄 Specific selectors failed, trying heuristic search...')
    
    const allTextareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'))
    const allInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]'))
    const allElements = [...allTextareas, ...allInputs]
    
    console.log(`[GROK-AUTO] 📊 Found ${allTextareas.length} textareas and ${allInputs.length} text inputs`)
    
    // 휴리스틱: 보이고, 활성화되고, 크기가 있는 요소 찾기
    const candidates = allElements.filter(el => {
      const visible = el.offsetParent !== null
      const enabled = !el.disabled && !el.readOnly
      const hasSize = el.offsetWidth > 50 && el.offsetHeight > 20
      
      if (visible && enabled && hasSize) {
        console.log(`[GROK-AUTO] 🎯 Candidate found - Tag: ${el.tagName}, Size: ${el.offsetWidth}x${el.offsetHeight}, Placeholder: "${el.placeholder}"`)
      }
      
      return visible && enabled && hasSize
    })
    
    if (candidates.length > 0) {
      // 가장 큰 요소 선택 (보통 메인 입력창)
      const best = candidates.reduce((largest, current) => {
        const currentArea = current.offsetWidth * current.offsetHeight
        const largestArea = largest.offsetWidth * largest.offsetHeight
        return currentArea > largestArea ? current : largest
      })
      
      console.log(`[GROK-AUTO] ✅ Selected best candidate - ${best.tagName}, Size: ${best.offsetWidth}x${best.offsetHeight}`)
      return best
    }

    console.warn('[GROK-AUTO] ❌ No suitable input field found after exhaustive search')
    return null
  }

  /**
   * Grok 전송 버튼 찾기
   * 
   * 전략:
   * 1. 명시적인 submit 버튼 찾기
   * 2. aria-label로 찾기
   * 3. 아이콘(SVG) 기반 버튼 찾기
   * 4. 입력창 근처 버튼 찾기 (위치 기반)
   */
  function findGrokSubmitButton(): HTMLButtonElement | null {
    console.log('[GROK-AUTO] 🔍 Searching for submit button...')
    
    // Phase 1: 명시적 셀렉터
    const explicitSelectors = [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Submit"]',
      'button[data-testid*="send"]',
      'button[data-testid*="submit"]',
    ]

    for (const selector of explicitSelectors) {
      const elements = document.querySelectorAll<HTMLButtonElement>(selector)
      for (const btn of elements) {
        if (btn.offsetParent !== null && !btn.disabled) {
          console.log(`[GROK-AUTO] ✅ Found submit button via explicit selector: ${selector}`)
          return btn
        }
      }
    }

    // Phase 2: 클래스 기반 검색
    console.log('[GROK-AUTO] 🔄 Trying class-based search...')
    const classCandidates = [
      'button[class*="send"]',
      'button[class*="submit"]',
      'button[class*="Send"]',
      'button[class*="Submit"]',
    ]

    for (const selector of classCandidates) {
      const elements = document.querySelectorAll<HTMLButtonElement>(selector)
      for (const btn of elements) {
        if (btn.offsetParent !== null && !btn.disabled) {
          console.log(`[GROK-AUTO] ✅ Found submit button via class: ${selector}`)
          return btn
        }
      }
    }

    // Phase 3: SVG 아이콘 버튼 (모든 버튼 검사)
    console.log('[GROK-AUTO] 🔄 Trying SVG icon search...')
    const allButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    
    for (const btn of allButtons) {
      if (btn.offsetParent === null || btn.disabled) continue
      
      // SVG 포함 확인
      const hasSvg = btn.querySelector('svg') !== null
      
      // "Send", "Submit" 텍스트 포함 확인 (대소문자 무시)
      const text = btn.textContent?.toLowerCase() || ''
      const isSendButton = text.includes('send') || text.includes('submit')
      
      if (hasSvg || isSendButton) {
        console.log(`[GROK-AUTO] ✅ Found submit button via heuristic - Has SVG: ${hasSvg}, Text: "${btn.textContent?.trim()}"`)
        return btn
      }
    }

    // Phase 4: 입력창 근처 버튼 찾기 (최후의 수단)
    console.log('[GROK-AUTO] 🔄 Trying proximity-based search...')
    const input = findGrokInput()
    if (input) {
      const inputRect = input.getBoundingClientRect()
      
      for (const btn of allButtons) {
        if (btn.offsetParent === null || btn.disabled) continue
        
        const btnRect = btn.getBoundingClientRect()
        
        // 입력창과 같은 높이 또는 바로 아래에 있는 버튼
        const isNearby = Math.abs(btnRect.top - inputRect.top) < 100 &&
                        Math.abs(btnRect.left - inputRect.right) < 200
        
        if (isNearby) {
          console.log(`[GROK-AUTO] ✅ Found submit button via proximity to input field`)
          return btn
        }
      }
    }

    console.warn('[GROK-AUTO] ❌ No submit button found after exhaustive search')
    return null
  }

  /**
   * 텍스트 입력 시뮬레이션 (사용자 타이핑처럼)
   */
  function simulateUserInput(element: HTMLTextAreaElement | HTMLInputElement, text: string) {
    // 1. 포커스
    element.focus()

    // 2. 기존 값 클리어
    element.value = ''

    // 3. Native setter를 사용하여 React 우회
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, text)
    } else {
      element.value = text
    }

    // 4. 다양한 이벤트 발생 (React/Vue/Angular 모두 호환)
    const events = [
      new Event('input', { bubbles: true }),
      new Event('change', { bubbles: true }),
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }),
      new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 }),
      new Event('blur', { bubbles: true }),
    ]

    events.forEach(event => element.dispatchEvent(event))

    console.log(`[GROK-AUTO] ✅ Simulated user input: "${text.substring(0, 50)}..."`)
  }

  /**
   * 전송 버튼 클릭 시뮬레이션
   */
  function simulateSubmitClick(button: HTMLButtonElement) {
    // 마우스 이벤트 시뮬레이션 (가장 자연스러운 방식)
    const events = [
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    ]

    events.forEach(event => button.dispatchEvent(event))
    
    // Fallback: 직접 클릭
    button.click()

    console.log('[GROK-AUTO] ✅ Simulated submit button click')
  }

  /**
   * AUTO DISPATCH 메인 함수
   * Extension에서 메시지를 받아 자동으로 입력 및 전송
   * 
   * 재시도 전략:
   * - 입력창: 최대 10초 대기 (0.5초 간격, 20회 시도)
   * - 전송 버튼: 최대 2초 대기 (0.2초 간격, 10회 시도)
   */
  async function handleAutoDispatch(text: string) {
    console.log('[GROK-AUTO] 🚀 Starting auto dispatch...')
    console.log(`[GROK-AUTO] 📝 Text to send: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`)
    
    try {
      // 1. 입력창 찾기 (최대 10초 대기)
      console.log('[GROK-AUTO] 🔍 Step 1: Finding input field...')
      let input = findGrokInput()
      let retries = 0
      const MAX_INPUT_RETRIES = 20
      
      while (!input && retries < MAX_INPUT_RETRIES) {
        console.log(`[GROK-AUTO] ⏳ Input not found, retry ${retries + 1}/${MAX_INPUT_RETRIES}...`)
        await new Promise(resolve => setTimeout(resolve, 500))
        input = findGrokInput()
        retries++
      }

      if (!input) {
        const errorMsg = `Input field not found after ${MAX_INPUT_RETRIES * 0.5} seconds`
        console.error(`[GROK-AUTO] ❌ ${errorMsg}`)
        throw new Error(errorMsg)
      }

      console.log('[GROK-AUTO] ✅ Step 1 complete: Input field found')

      // 2. 텍스트 입력
      console.log('[GROK-AUTO] ⌨️ Step 2: Simulating user input...')
      simulateUserInput(input, text)
      console.log('[GROK-AUTO] ✅ Step 2 complete: Text input simulated')

      // 3. 입력 후 UI 업데이트 대기
      console.log('[GROK-AUTO] ⏳ Step 3: Waiting for UI update (500ms)...')
      await new Promise(resolve => setTimeout(resolve, 500))
      console.log('[GROK-AUTO] ✅ Step 3 complete: UI should be updated')

      // 4. 전송 버튼 찾기 (최대 2초 대기)
      console.log('[GROK-AUTO] 🔍 Step 4: Finding submit button...')
      let submitBtn = findGrokSubmitButton()
      retries = 0
      const MAX_BUTTON_RETRIES = 10
      
      while (!submitBtn && retries < MAX_BUTTON_RETRIES) {
        console.log(`[GROK-AUTO] ⏳ Submit button not found, retry ${retries + 1}/${MAX_BUTTON_RETRIES}...`)
        await new Promise(resolve => setTimeout(resolve, 200))
        submitBtn = findGrokSubmitButton()
        retries++
      }

      if (!submitBtn) {
        const errorMsg = `Submit button not found after ${MAX_BUTTON_RETRIES * 0.2} seconds`
        console.error(`[GROK-AUTO] ❌ ${errorMsg}`)
        throw new Error(errorMsg)
      }

      console.log('[GROK-AUTO] ✅ Step 4 complete: Submit button found')

      // 5. 전송 버튼 클릭
      console.log('[GROK-AUTO] 🖱️ Step 5: Clicking submit button...')
      simulateSubmitClick(submitBtn)
      console.log('[GROK-AUTO] ✅ Step 5 complete: Submit button clicked')

      console.log('[GROK-AUTO] 🎉 Auto dispatch completed successfully!')
      return { success: true }

    } catch (error) {
      console.error('[GROK-AUTO] ❌ Auto dispatch failed:', error)
      console.error('[GROK-AUTO] 📊 Error details:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
      })
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Extension postMessage 리스너 (iframe 내부에서 실행)
   * Model Dock 확장 프로그램이 보낸 메시지 수신
   */
  window.addEventListener('message', (event) => {
    console.log('[GROK-AUTO] 📬 Received message event:', {
      origin: event.origin,
      type: event.data?.type,
      source: event.data?.source,
      hasText: !!event.data?.text
    })

    // 보안: 신뢰할 수 있는 출처만 허용
    // Chrome 확장 프로그램은 chrome-extension:// 프로토콜 사용
    // IMPORTANT: iframe 내부에서는 부모 extension origin도 허용해야 함
    const isExtensionOrigin = event.origin.startsWith('chrome-extension://')
    const isTrustedMessage = event.data?.source === 'model-dock-extension'
    
    if (!isExtensionOrigin || !isTrustedMessage) {
      console.log('[GROK-AUTO] 🚫 Ignored message - not from extension or untrusted source')
      console.log(`[GROK-AUTO]    Origin: ${event.origin}, isExtension: ${isExtensionOrigin}, trusted: ${isTrustedMessage}`)
      return
    }

    const message = event.data
    
    if (message.type === 'GROK_AUTO_DISPATCH' && message.text) {
      console.log('[GROK-AUTO] 📨 ✅ Accepted auto dispatch message!')
      console.log(`[GROK-AUTO] 📝 Text preview: "${message.text.substring(0, 100)}..."`)
      console.log(`[GROK-AUTO] 🚀 Starting DOM manipulation...`)
      
      handleAutoDispatch(message.text).then((result: any) => {
        console.log('[GROK-AUTO] ✅ Auto dispatch completed successfully, result:', result)
        
        // 결과를 부모 window에 다시 전송
        if (event.source && event.source !== window) {
          try {
            (event.source as Window).postMessage(
              {
                type: 'GROK_AUTO_DISPATCH_RESULT',
                result: result,
                source: 'grok-content-script',
                timestamp: Date.now()
              },
              event.origin
            )
            console.log('[GROK-AUTO] 📤 Result sent back to extension')
          } catch (err) {
            console.warn('[GROK-AUTO] ⚠️ Could not send result back:', err)
          }
        }
      }).catch((error: any) => {
        console.error('[GROK-AUTO] ❌ Auto dispatch failed:', error)
      })
    } else {
      console.log('[GROK-AUTO] ⚠️ Message received but invalid type or missing text')
    }
  })

  console.log('[GROK-AUTO] 🎧 PostMessage listener registered for auto-dispatch')
  console.log('[GROK-AUTO] 🌐 Current location:', window.location.href)
  console.log('[GROK-AUTO] 📍 Ready to receive messages from chrome-extension:// origins')

  /**
   * Extension chrome.runtime 메시지 리스너 (탭에서 실행될 때 사용)
   * 이제는 사용되지 않지만 호환성을 위해 유지
   */
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
      if (message.type === 'GROK_AUTO_DISPATCH' && message.text) {
        console.log('[GROK-AUTO] 📨 Received auto dispatch message via chrome.runtime:', message.text.substring(0, 50))
        
        handleAutoDispatch(message.text).then((result: any) => {
          sendResponse(result)
        })

        // 비동기 응답을 위해 true 반환
        return true
      }
    })

    console.log('[GROK-AUTO] 🎧 Chrome runtime listener registered (legacy)')
  }
}
