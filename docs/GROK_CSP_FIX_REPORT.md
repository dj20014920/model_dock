# 🔥 Grok 403 에러 진짜 원인 및 해결 (Ultra Deep Analysis)

## 📊 냉정한 현실 진단

### ❌ 이전 분석의 치명적 오류

**우리가 착각했던 것:**
1. HAR 분석에서 x-anonuserid가 문제라고 판단 → **일부만 맞음**
2. inpage-fetch-bridge.js가 실행될 것이라고 가정 → **완전히 틀림**
3. CSP 'strict-dynamic'을 우회할 수 있다고 생각 → **순진한 착각**

### 🎯 진짜 문제: CSP가 모든 것을 차단

#### HAR 분석 결과 (대화 전 로그)

```
=== 스크립트 리소스 검색 ===

❌ inpage-fetch-bridge.js NOT found in HAR!
```

**결정적 증거:**
- `[PROXY-FETCH] ✅ In-page bridge injected` 로그는 나옴
- **BUT HAR에 파일 자체가 없음!**
- **grok.com Console에 [GROK-INTERCEPT] 로그 전혀 없음!**

**결론:** executeScript는 "성공"했지만, **스크립트는 실행되지 않았다!**

---

## 🔬 Grok.com CSP 분석

### Content-Security-Policy

```
script-src 'self' 'nonce-...' 'strict-dynamic'
  https://*.googleapis.com
  https://*.google.com
  ...
```

**'strict-dynamic'의 동작:**
1. ✅ nonce가 있는 스크립트만 실행
2. ✅ 그 스크립트가 동적으로 생성한 스크립트만 추가로 실행
3. ❌ **chrome-extension:// URL은 무조건 차단!**
4. ❌ **외부 script.src는 무조건 차단!**

### 우리 코드의 문제

#### proxy-fetch.ts (Line 108)

```typescript
await chrome.scripting?.executeScript?.({
  target: { tabId },
  files: ['js/inpage-fetch-bridge.js'],
  world: 'MAIN' as any
})
console.log('[PROXY-FETCH] ✅ In-page bridge injected')  // ← 거짓말!
```

**문제:**
1. `executeScript`는 API 호출 성공만 체크
2. 실제 스크립트 실행 여부는 체크 안 함
3. CSP가 차단해도 에러가 안 남!

#### chatgpt-inpage-proxy.ts (Original)

```typescript
// Line 59
// inpage-fetch-bridge.js는 proxy-fetch.ts에서 MAIN world로 주입함 (CSP 우회)
// 여기서는 주입하지 않음 (중복 방지)
```

**문제:**
- Comment에는 "CSP 우회"라고 써있지만
- **실제로는 CSP가 전혀 우회되지 않음!**
- 따라서 아무것도 주입되지 않음!

#### 결과

```
1. proxy-fetch.ts: executeScript 시도 → CSP 차단
2. chatgpt-inpage-proxy.ts: 주입 안 함 (comment 때문)
3. inpage-fetch-bridge.js: 실행 안 됨
4. window.__GROK_LAST_HEADERS__: undefined
5. Model Dock: fallback 모드로 동작
6. Cloudflare: 봇으로 감지 → 403!
```

---

## 🛠️ 해결책: Inline Script 주입

### Content Script (ISOLATED world)의 특권

Content script는:
- ✅ CSP의 영향을 받지 않음!
- ✅ chrome.runtime.getURL() 사용 가능
- ✅ fetch()로 extension 리소스 읽기 가능
- ✅ MAIN world로 script 주입 가능

### 수정된 코드

#### chatgpt-inpage-proxy.ts (New)

```typescript
function injectInpageFetchBridge() {
  const inject = () => {
    try {
      // ⚠️ CRITICAL: CSP 'strict-dynamic' 우회를 위해
      // fetch()로 내용을 가져와서 inline script로 주입
      // (script.src는 CSP에 의해 차단되므로)

      const bridgeURL = Browser.runtime.getURL('js/inpage-fetch-bridge.js')

      fetch(bridgeURL)
        .then(response => response.text())
        .then(scriptContent => {
          const script = document.createElement('script')
          script.textContent = scriptContent  // ← Inline script!

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

  // ... 나머지 코드
}

async function main() {
  console.debug('[GPT-PROXY] 🚀 Content script initializing', location.href)

  // ⚠️ CRITICAL FIX: Grok.com의 CSP 'strict-dynamic' 때문에
  // proxy-fetch.ts의 executeScript가 차단됨!
  // Content script (ISOLATED world)는 CSP 영향을 안 받으므로 여기서 주입
  injectInpageFetchBridge()

  // ...
}
```

### 작동 원리

```
1. Content script (ISOLATED world) 로드
   ↓
2. fetch(chrome-extension://...inpage-fetch-bridge.js)
   → CSP 영향 없음! ✅
   ↓
3. response.text() → 스크립트 내용을 문자열로 가져옴
   ↓
4. script.textContent = scriptContent
   → Inline script 생성
   ↓
5. document.head.appendChild(script)
   → MAIN world로 주입
   ↓
6. CSP 'strict-dynamic' 체크:
   - Inline script? → Yes
   - nonce 있음? → No...
   → ⚠️ 여기서도 차단될 가능성 있음!
```

---

## ⚠️ 잠재적 문제

### 1. Inline Script도 CSP에 의해 차단될 수 있음

**'strict-dynamic'이 있으면:**
- Inline script도 nonce가 필요
- 우리는 nonce를 알 수 없음
- 따라서 차단될 수 있음

### 2. 대안: window.postMessage 사용

Content script (ISOLATED world)에서:
```typescript
// MAIN world로 메시지 전송
window.postMessage({
  type: 'GROK_INTERCEPT_SETUP',
  interceptorCode: scriptContent
}, '*')
```

MAIN world (페이지 스크립트)에서:
```javascript
// 이미 nonce가 있는 스크립트에서 실행
window.addEventListener('message', (e) => {
  if (e.data.type === 'GROK_INTERCEPT_SETUP') {
    eval(e.data.interceptorCode)  // ← nonce가 있는 컨텍스트에서 실행
  }
})
```

**문제:** 페이지에 우리 스크립트를 미리 심어둘 수 없음!

### 3. 최종 해결책: Manifest V3의 한계

**현실:**
- CSP 'strict-dynamic'을 완전히 우회하는 것은 **불가능**
- Chrome Extension의 보안 모델 자체가 이를 막음

**진짜 해결책:**
1. **API 모드 사용** (권장)
   - console.x.ai에서 API 키 발급
   - $25/월 무료 크레딧
   - CSP 우회 불필요

2. **Proxy 서버 사용**
   - 자체 서버에서 Grok API 호출
   - CORS + CSP 우회

3. **Grok.com이 CSP 완화할 때까지 대기**
   - 현실적으로 불가능

---

## 🧪 테스트 계획

### 테스트 1: Inline Script 주입 성공 여부

```
1. chrome://extensions → Model Dock 재로드
2. grok.com 새 탭 열기
3. F12 → Console 확인
4. 다음 로그가 나오는가?
   ✅ [GPT-PROXY] ✅ inpage-fetch-bridge.js injected as inline script (CSP bypass)
   ✅ [GROK-INTERCEPT] 🔍 Script loaded!
   ✅ [GROK-INTERCEPT] ✅ Fetch interceptor installed
```

**예상 결과:**
- **성공 가능성: 30%** (CSP가 inline도 차단할 수 있음)
- **실패 가능성: 70%**

### 테스트 2: CSP 차단 확인

**실패 시 예상 로그:**
```
❌ Refused to execute inline script because it violates the following
   Content Security Policy directive: "script-src 'self' 'nonce-...' 'strict-dynamic'"
```

### 테스트 3: 헤더 캡처 여부

```
1. grok.com에서 메시지 1개 보내기
2. Console 확인:
   ✅ [GROK-INTERCEPT] 🎯 Captured Grok API request headers?
```

---

## 📈 예상 시나리오

### 시나리오 A: 성공 (30% 확률)

**조건:**
- Grok.com의 CSP가 inline script를 허용
- 또는 nonce 체크를 안 함

**결과:**
```
✅ [GPT-PROXY] ✅ inpage-fetch-bridge.js injected as inline script
✅ [GROK-INTERCEPT] ✅ Fetch interceptor installed
✅ [GROK-INTERCEPT] 🎯 Captured Grok API request headers
✅ Model Dock → 200 OK
```

### 시나리오 B: 실패 - CSP 차단 (70% 확률)

**조건:**
- Grok.com의 CSP가 nonce 없는 inline script를 차단

**결과:**
```
❌ Refused to execute inline script (CSP violation)
❌ [GROK-INTERCEPT] 로그 전혀 없음
❌ Model Dock → 여전히 403
```

**다음 단계:**
- 방법 1: API 모드로 전환 (권장)
- 방법 2: Proxy 서버 구축
- 방법 3: Grok.com의 CSP 정책 변경 요청 (현실적으로 불가능)

---

## 💬 사용자에게 전달할 메시지

**정직한 현실:**

1. **Grok Webapp 모드는 근본적으로 어려울 수 있습니다**
   - Grok.com의 CSP 'strict-dynamic'이 매우 엄격함
   - Chrome Extension의 보안 모델과 충돌
   - 완전한 우회는 기술적으로 불가능할 수 있음

2. **이번 수정으로 시도할 수 있는 것:**
   - Content script에서 inline script로 주입
   - CSP가 허용하면 작동할 수 있음
   - 하지만 확률은 30% 정도

3. **권장 사항:**
   - **API 모드 사용** (가장 안정적)
   - $25/월 무료 크레딧
   - CSP, Cloudflare 우회 불필요

---

## 🎓 교훈

1. **"성공" 로그를 믿지 마라**
   - `executeScript` API 성공 ≠ 스크립트 실행 성공
   - 실제 결과를 확인해야 함 (HAR, Console 로그)

2. **CSP는 강력하다**
   - 'strict-dynamic'은 거의 모든 우회를 막음
   - Extension도 예외가 아님

3. **근본적 한계를 인정하라**
   - 모든 문제가 코드로 해결되는 것은 아님
   - 때로는 API 모드, Proxy 서버 등 대안이 필요

---

**작성일**: 2025-10-22
**마지막 빌드**: chatgpt-inpage-proxy.ts-175b218a.js
**상태**: 테스트 대기 중 (성공 확률 30%)
