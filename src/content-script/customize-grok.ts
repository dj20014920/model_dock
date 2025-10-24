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
}
