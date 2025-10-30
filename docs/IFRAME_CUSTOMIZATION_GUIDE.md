# iframe 커스터마이징 완벽 가이드

## 🎨 Grok 커스터마이징 분석

### 핵심 원리

**Content Script를 사용하여 실제 웹페이지(grok.com)에 직접 코드를 주입합니다.**

```
[Extension] → [Content Script] → [grok.com 페이지]
                     ↓
              CSS + JavaScript 주입
              DOM 직접 조작 가능!
```

## 📁 구현 구조

### 1. manifest.config.ts 설정

```typescript
content_scripts: [
  {
    // Grok.com UI 테마링 (DOM 기반 커스터마이징)
    matches: ['https://grok.com/*'],
    js: ['src/content-script/customize-grok.ts'],
    run_at: 'document_start',  // 페이지 로드 전에 실행
  },
]
```

**핵심:**
- `matches`: 어떤 URL에서 실행할지 지정
- `run_at: 'document_start'`: 페이지가 로드되기 전에 실행 (깜빡임 방지)

### 2. Content Script 구조

```typescript
// src/content-script/customize-grok.ts

// 1. CSS 스타일 주입
function injectStyles() {
  const style = document.createElement('style')
  style.textContent = `
    /* 배경 그라데이션 */
    body {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important;
    }
    
    /* 메시지 박스 스타일 */
    [class*="message"] {
      border-radius: 12px !important;
      padding: 16px !important;
    }
    
    /* 사용자 메시지 */
    [class*="user"] {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    }
  `
  document.head.appendChild(style)
}

// 2. 워터마크 추가
function addWatermark() {
  const watermark = document.createElement('div')
  watermark.className = 'model-dock-watermark'
  watermark.textContent = '⚡ Powered by Model Dock'
  document.body.appendChild(watermark)
}

// 3. 초기화
injectStyles()
addWatermark()
```

## 🎯 iframe vs Content Script 차이

### iframe 내부 커스터마이징 (❌ 불가능)

```typescript
// ❌ 이렇게는 안 됨
<iframe ref={iframeRef} src="https://grok.com" />

// Extension에서 iframe 내부 접근 시도
iframeRef.current.contentDocument  // ❌ Cross-Origin 차단!
```

**문제:**
- Cross-Origin 보안 정책으로 차단
- iframe 내부 DOM 접근 불가
- CSS 주입 불가

### Content Script 방식 (✅ 가능)

```typescript
// ✅ Content Script는 페이지 내부에서 실행됨
// manifest.config.ts
content_scripts: [
  {
    matches: ['https://grok.com/*'],
    js: ['src/content-script/customize-grok.ts'],
  }
]

// customize-grok.ts (grok.com 내부에서 실행)
document.body.style.background = 'linear-gradient(...)'  // ✅ 작동!
```

**장점:**
- ✅ 페이지 내부에서 실행되므로 DOM 접근 가능
- ✅ CSS 주입 가능
- ✅ JavaScript 실행 가능
- ✅ 이벤트 리스너 추가 가능

## 🚀 ChatGPT 커스터마이징 구현 방법

### 1단계: Content Script 파일 생성

```typescript
// src/content-script/customize-chatgpt.ts

if (!(window as any).__CHATGPT_CUSTOMIZED__) {
  ;(window as any).__CHATGPT_CUSTOMIZED__ = true

  console.log('[CHATGPT-CUSTOMIZE] 🎨 Initializing ChatGPT theme...')

  // CSS 스타일 주입
  function injectStyles() {
    const style = document.createElement('style')
    style.id = 'model-dock-chatgpt-theme'
    style.textContent = `
      /* Model Dock ChatGPT Theme */
      
      /* 다크 테마 강화 */
      body {
        background: #1a1a1a !important;
      }

      /* 사이드바 커스터마이징 */
      nav {
        background: linear-gradient(180deg, #2d2d2d 0%, #1a1a1a 100%) !important;
      }

      /* 메시지 박스 */
      [data-message-author-role="user"] {
        background: linear-gradient(135deg, #10a37f 0%, #0d8a6a 100%) !important;
        border-radius: 12px !important;
        padding: 16px !important;
      }

      [data-message-author-role="assistant"] {
        background: rgba(255, 255, 255, 0.05) !important;
        border-left: 3px solid #10a37f !important;
        border-radius: 12px !important;
        padding: 16px !important;
      }

      /* 입력창 스타일 */
      textarea {
        background: rgba(255, 255, 255, 0.08) !important;
        border: 2px solid rgba(16, 163, 127, 0.3) !important;
        border-radius: 12px !important;
      }

      textarea:focus {
        border-color: #10a37f !important;
        box-shadow: 0 0 0 3px rgba(16, 163, 127, 0.1) !important;
      }

      /* 버튼 스타일 */
      button {
        border-radius: 8px !important;
        transition: all 0.3s ease !important;
      }

      button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 12px rgba(16, 163, 127, 0.3) !important;
      }

      /* 스크롤바 */
      ::-webkit-scrollbar {
        width: 10px !important;
      }

      ::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05) !important;
      }

      ::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #10a37f 0%, #0d8a6a 100%) !important;
        border-radius: 5px !important;
      }

      /* 워터마크 */
      .model-dock-watermark {
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        background: linear-gradient(135deg, #10a37f 0%, #0d8a6a 100%) !important;
        color: white !important;
        padding: 10px 20px !important;
        border-radius: 25px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        z-index: 9999 !important;
        box-shadow: 0 4px 15px rgba(16, 163, 127, 0.3) !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
      }

      .model-dock-watermark:hover {
        transform: translateY(-3px) scale(1.05) !important;
        box-shadow: 0 6px 20px rgba(16, 163, 127, 0.5) !important;
      }

      /* 코드 블록 */
      pre {
        background: rgba(0, 0, 0, 0.4) !important;
        border: 1px solid rgba(16, 163, 127, 0.3) !important;
        border-radius: 8px !important;
      }

      /* 로딩 애니메이션 */
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      [class*="loading"] {
        animation: pulse 1.5s ease-in-out infinite !important;
      }
    `
    
    document.head.appendChild(style)
    console.log('[CHATGPT-CUSTOMIZE] ✅ Styles injected')
  }

  // 워터마크 추가
  function addWatermark() {
    const existing = document.querySelector('.model-dock-watermark')
    if (existing) existing.remove()

    const watermark = document.createElement('div')
    watermark.className = 'model-dock-watermark'
    watermark.textContent = '🚀 Powered by Model Dock'
    watermark.title = 'Model Dock Extension'
    
    document.body.appendChild(watermark)
    console.log('[CHATGPT-CUSTOMIZE] ✅ Watermark added')
  }

  // 초기화
  function initialize() {
    injectStyles()

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(addWatermark, 500)
      })
    } else {
      setTimeout(addWatermark, 500)
    }

    // SPA 네비게이션 감지
    let lastUrl = location.href
    new MutationObserver(() => {
      const currentUrl = location.href
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl
        setTimeout(addWatermark, 1000)
      }
    }).observe(document.body, { childList: true, subtree: true })

    console.log('[CHATGPT-CUSTOMIZE] 🎉 Initialization complete')
  }

  initialize()
}
```

### 2단계: manifest.config.ts 업데이트

```typescript
content_scripts: [
  {
    // ChatGPT UI 커스터마이징
    matches: [
      'https://chat.openai.com/*',
      'https://chatgpt.com/*'
    ],
    js: ['src/content-script/customize-chatgpt.ts'],
    run_at: 'document_start',
  },
  // ... 기존 content scripts
]
```

## 🎨 커스터마이징 가능한 것들

### 1. CSS 스타일링
```css
✅ 배경색/그라데이션
✅ 메시지 박스 디자인
✅ 버튼 스타일
✅ 입력창 디자인
✅ 스크롤바
✅ 폰트/색상
✅ 애니메이션
```

### 2. DOM 조작
```javascript
✅ 워터마크 추가
✅ 로고 변경
✅ 버튼 추가/제거
✅ 레이아웃 변경
✅ 요소 숨기기/보이기
```

### 3. JavaScript 기능
```javascript
✅ 이벤트 리스너
✅ 자동 입력/전송
✅ 단축키 추가
✅ 알림 표시
✅ 데이터 수집
```

## ⚠️ 제약 사항

### 할 수 없는 것

```javascript
❌ API 요청 가로채기 (네트워크 레벨)
❌ 서버 응답 수정
❌ 인증 토큰 접근 (보안상 제한)
❌ 다른 도메인 접근
```

### 주의사항

1. **!important 사용 필수**
   - 원본 CSS를 덮어쓰려면 `!important` 필요

2. **클래스명 변경 대응**
   - 사이트가 업데이트되면 클래스명이 바뀔 수 있음
   - 일반적인 셀렉터 사용 (`[class*="message"]`)

3. **성능 고려**
   - MutationObserver 사용 시 성능 영향
   - 필요한 부분만 감시

## 📊 비교표

| 방식 | 접근 가능 | CSS 주입 | JS 실행 | 제약 |
|---|---|---|---|---|
| **iframe (Extension)** | ❌ | ❌ | ❌ | Cross-Origin |
| **Content Script** | ✅ | ✅ | ✅ | 페이지 내부 |
| **Proxy Server** | ✅ | ✅ | ✅ | 서버 비용 |

## 🚀 구현 순서

### ChatGPT 커스터마이징 추가

1. **파일 생성**
   ```bash
   src/content-script/customize-chatgpt.ts
   ```

2. **manifest 업데이트**
   ```typescript
   content_scripts에 ChatGPT 추가
   ```

3. **빌드 및 테스트**
   ```bash
   npm run build
   chrome://extensions/ → 다시 로드
   ```

4. **확인**
   - chat.openai.com 접속
   - 스타일 적용 확인
   - 워터마크 표시 확인

## 💡 실전 팁

### 1. 디버깅
```javascript
// 콘솔에서 확인
console.log('[CUSTOMIZE] 스타일 주입됨')

// 요소 검사
document.querySelector('.model-dock-watermark')
```

### 2. 동적 테마
```javascript
// 다크/라이트 모드 감지
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

if (isDark) {
  // 다크 테마 CSS
} else {
  // 라이트 테마 CSS
}
```

### 3. 사용자 설정
```javascript
// Extension storage에서 설정 불러오기
chrome.storage.sync.get(['theme'], (result) => {
  if (result.theme === 'custom') {
    applyCustomTheme()
  }
})
```

## 🎯 결론

**Content Script를 사용하면 iframe 내부를 완전히 커스터마이징할 수 있습니다!**

- ✅ CSS로 "포장지" 씌우기 가능
- ✅ JavaScript로 기능 추가 가능
- ✅ 워터마크, 로고 등 브랜딩 가능
- ✅ 사용자 경험 개선 가능

**Grok처럼 ChatGPT, Qwen, LMArena 모두 커스터마이징 가능합니다!**
