# 🚀 Grok Webapp 최종 설정 가이드 (HAR 분석 기반)

## ⚠️ 중요: 반드시 이 순서대로 진행하세요!

---

## 📊 HAR 분석으로 밝혀진 진실

### ❌ 잘못된 정보 (이전)
- x-challenge, x-signature 헤더 필요 → **거짓!**
- Turnstile CAPTCHA 우회 필요 → **거짓!**
- 특별한 인증 토큰 필요 → **거짓!**

### ✅ 실제 원인
```json
{
  "error": {
    "code": 7,
    "message": "Request rejected by anti-bot rules."
  }
}
```

**Cloudflare Bot Management**가 Model Dock을 봇으로 감지하여 차단.

**이유**: Model Dock이 `x-anonuserid` 헤더를 추가했는데, 실제 Grok.com은 이 헤더를 보내지 않음!

---

## Step 1: Chrome 확장 프로그램 재로드

### 1-1. 확장 프로그램 다시 로드
```
1. Chrome 주소창에 입력: chrome://extensions
2. "Model Dock" 찾기
3. "다시 로드" (🔄) 버튼 클릭
4. 확장 프로그램 아이콘 확인
```

**중요**: 제거하고 재설치할 필요 없습니다! 단순 reload만으로 충분합니다.

---

## Step 2: Grok.com에서 헤더 캡처

### 2-1. Grok.com 탭 열기
```
1. 새 탭: https://grok.com
2. 로그인 (X/Twitter 계정)
3. F12 키 눌러서 개발자 도구 열기
4. "Console" 탭 클릭
```

### 2-2. 인터셉터 설치 확인
Console에서 다음 로그를 확인하세요:
```
✅ [GROK-INTERCEPT] 🔍 Script loaded! Location: grok.com https://grok.com/
✅ [GROK-INTERCEPT] 🌐 Is Grok site? true
✅ [GROK-INTERCEPT] ✅ Fetch interceptor installed successfully
```

**👉 이 로그가 보이지 않으면:**
- 페이지 새로고침 (Cmd+R 또는 Ctrl+R)
- 다시 F12 → Console 확인
- 여전히 안 보이면 Step 1로 돌아가서 확장 프로그램 재로드

### 2-3. 헤더 캡처 트리거
```
1. Grok.com 채팅창에 아무 메시지나 입력 (예: "안녕")
2. 전송 버튼 클릭
3. Console에서 다음 로그 확인:
```

**✅ 성공 시 로그 (올바른 헤더 - 최소 8개 이상!):**
```
[GROK-INTERCEPT] 🎯 Captured Grok API request headers
[GROK-INTERCEPT] 📍 URL: https://grok.com/rest/app-chat/conversations/new
[GROK-INTERCEPT] 📝 Saved headers: content-type, origin, referer, x-xai-request-id, x-statsig-id, baggage, sentry-trace, traceparent
```

**⚠️ 중요 확인사항:**
1. **헤더가 최소 8개 이상** 캡처되어야 합니다!
2. 다음 3개의 **표준 헤더가 반드시 포함**되어야 합니다:
   - ✅ `content-type` (application/json)
   - ✅ `origin` (https://grok.com)
   - ✅ `referer` (https://grok.com/)
3. `x-anonuserid`가 **없어야** 정상입니다!

**❌ 문제가 있는 경우:**
- 헤더가 2-3개만 캡처되면 → Step 1로 돌아가 확장 프로그램 재로드
- `x-anonuserid`가 보이면 → 알려주세요
- `content-type`, `origin`, `referer`가 없으면 → 알려주세요

---

## Step 3: Model Dock에서 테스트

### 3-1. Model Dock 실행
```
1. Alt+J (또는 Cmd+J) → Model Dock 사이드패널 열기
2. 봇 선택: Grok
3. 모드 선택: Webapp
4. 테스트 메시지 입력 (예: "테스트")
5. 전송
```

### 3-2. 예상 결과

**✅ 성공 시:**
```
[INPAGE-GROK] 🔍 Grok request detected, using intercepted headers...
[INPAGE-GROK] ✅ Using intercepted headers from real Grok request
[INPAGE-GROK] 📤 Headers: content-type, origin, referer, x-xai-request-id, x-statsig-id, baggage, sentry-trace, traceparent
[GROK-WEB] 📡 Response status: 200 OK
[GROK-WEB] ✅ Message sent successfully
```

→ **Grok의 응답이 정상적으로 표시됩니다!** 🎉

**핵심 성공 지표:**
- ✅ 헤더 8개 이상 캡처됨
- ✅ content-type, origin, referer 포함
- ✅ 200 OK 응답
- ✅ Cloudflare 봇 감지 통과!

**❌ 실패 시:**
```
[INPAGE-GROK] ⚠️ No intercepted headers found, using fallback
[INPAGE-GROK] 💡 Tip: Send a message on grok.com first to capture headers!
[GROK-WEB] 📡 Response status: 403
```

→ **해결**: Step 2로 돌아가서 Grok.com에서 다시 메시지 보내기

---

## 🔍 문제 해결 (Troubleshooting)

### ❌ "Console에 [GROK-INTERCEPT] 로그가 안 보여요"

**원인**: inpage-fetch-bridge.js가 주입되지 않음

**해결**:
```
1. grok.com 탭 완전히 닫기
2. 새 탭으로 https://grok.com 다시 열기
3. F12 → Console → "Clear console" 버튼 클릭
4. [GROK-INTERCEPT] ✅ Fetch interceptor installed 로그 확인
```

### ❌ "헤더 캡처 로그에 x-anonuserid가 보여요"

**원인**: 이전 버전의 코드가 실행 중

**해결**:
```
1. chrome://extensions 가서 확장 프로그램 재로드
2. grok.com 탭 새로고침
3. 다시 메시지 보내기
4. x-anonuserid가 없는지 확인
```

### ❌ "Model Dock에서 여전히 403 에러"

**원인**: 캡처된 헤더가 없거나 만료됨

**해결**:
```
1. grok.com 탭으로 이동
2. F12 → Console 확인
3. 새 메시지 1개 보내기
4. "🎯 Captured Grok API request headers" 로그 확인
5. Model Dock에서 다시 시도
```

### ❌ "Grok.com 자체는 잘 되는데 Model Dock만 안 돼요"

**원인**: 헤더 캡처는 되었지만 Model Dock이 읽지 못함

**확인**:
```
1. grok.com 탭 Console에서 실행:
   console.log(window.__GROK_LAST_HEADERS__)

2. 결과가 Object {...}로 나와야 정상
3. undefined면 → 다시 메시지 보내기
```

---

## 📸 스크린샷 요청 (문제 발생 시)

문제가 계속되면 다음 스크린샷을 찍어주세요:

1. **Grok.com 탭 Console** (전체 로그)
   - [GROK-INTERCEPT] 로그들
   - 헤더 캡처 로그

2. **Model Dock 테스트 결과**
   - 에러 메시지
   - Console 로그

3. **Chrome Extensions 페이지**
   - Model Dock 확장 프로그램 상태
   - 버전 정보

---

## 💡 작동 원리 (기술적 설명)

### 왜 이 방법이 작동하는가?

1. **Cloudflare Bot Management**는 요청 패턴을 분석합니다
2. **비정상적인 헤더**(예: x-anonuserid)를 감지하면 봇으로 판단
3. **실제 Grok.com 페이지**에서 메시지를 보내면:
   - 정상적인 브라우저 요청으로 인식
   - Cloudflare가 통과시킴
   - 정확한 헤더를 캡처
4. **Model Dock**이 캡처된 헤더를 그대로 사용:
   - Cloudflare가 "정상적인" 요청으로 인식
   - 403 에러 없이 통과

### Fetch 인터셉터 동작 방식

```javascript
// MAIN world에서 실행 (페이지 컨텍스트)
window.fetch = function(...args) {
  const [url, options] = args;
  if (url.includes('/rest/app-chat')) {
    // 실제 Grok.com이 보내는 헤더를 그대로 저장
    window.__GROK_LAST_HEADERS__ = options.headers;
  }
  return originalFetch.apply(this, args);
};
```

Model Dock 요청 시:
```javascript
// 캡처된 헤더를 그대로 사용
if (window.__GROK_LAST_HEADERS__) {
  mergedOptions.headers = Object.assign({}, window.__GROK_LAST_HEADERS__);
  // Cloudflare: "이건 정상적인 요청이네!" ✅
}
```

---

## 🔄 대안: API 모드

Webapp 모드가 계속 문제되면 API 모드 사용:

```
1. https://console.x.ai 방문
2. API 키 생성
3. Model Dock → 설정 → Grok → API 모드 전환
4. API 키 입력
```

**장점**:
- ✅ Cloudflare 우회 불필요
- ✅ 안정적인 연결
- ✅ 더 빠른 응답

**단점**:
- ❌ $25/월 무료 크레딧 후 유료

---

**작성일**: 2025-10-22
**기반**: HAR 로그 분석 결과
**상태**: 테스트 대기 중
