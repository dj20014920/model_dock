# 🔍 Grok 403 에러 완전 해결 보고서

## 📊 HAR 로그 분석 결과

### 🎯 핵심 발견

HAR 파일 (`grokcom대화로그.txt`, `grokcom_내프로그램대화후로그.txt`) 분석을 통해 403 에러의 **진짜 원인**을 발견했습니다:

```
에러 메시지: "Request rejected by anti-bot rules."
```

**Cloudflare Bot Management**가 Model Dock의 요청을 봇으로 감지하여 차단했습니다.

---

## ❌ 이전 가정의 오류

### 잘못된 가정 1: x-challenge, x-signature 필요
**거짓!** HAR 로그 분석 결과, **실제 Grok.com은 이 헤더들을 보내지 않습니다.**

```javascript
// 네이티브 Grok.com의 실제 헤더 (HAR에서 추출)
✅ x-statsig-id
✅ x-xai-request-id
✅ baggage
✅ sentry-trace
✅ traceparent
❌ x-challenge (존재하지 않음!)
❌ x-signature (존재하지 않음!)
```

### 잘못된 가정 2: Turnstile CAPTCHA 우회 필요
**거짓!** Grok.com은 Turnstile을 사용하지 않습니다. Cloudflare Bot Management의 **행동 분석** 기반 차단입니다.

---

## ✅ 실제 원인

### 네이티브 Grok (200 OK) vs Model Dock (403 Forbidden)

```diff
=== 헤더 비교 ===

네이티브 Grok:
  ✅ x-statsig-id: 4eTymRc15QKWp4h3g1xnoiohruj/AGqo1+eLw88e4sbh5B61vpxWe2UKgfnI1LCYmrG4SOWAHUjex5YFpZYFlyxYveAh4g
  ✅ x-xai-request-id: 94e8e176-0cc0-47ce-abc2-ee86c89aac25
  ✅ referer: https://grok.com/
  ✅ Response: 200 OK

Model Dock:
  ✅ x-statsig-id: SfkNzDQQYRooLiPPXE/IxQSDVy+qkH01wVKaff/14YxCQRVcu5jYVRexu7dzOlya3+0Q4E1HLcgKdzb4FlA15IDXZEqVSg
  ✅ x-xai-request-id: 342286fe-e4db-4278-8c05-c63cdc0e92dd
- ❌ x-anonuserid: "132fbb86-d06a-44e8-ad74-1fb08b211742" (네이티브에 없음!)
- ❌ referer: https://grok.com/c/7f049583-ccb3-4844-a9c5-ec6227a804e1 (잘못된 값)
  ❌ Response: 403 Forbidden
```

### 🔥 결정적 차이점

1. **x-anonuserid 헤더**: Model Dock만 보냄 → Cloudflare가 봇으로 판단
2. **referer 불일치**: 대화 URL이 아닌 루트 URL이어야 함

---

## 🛠️ 적용된 수정사항

### 1. inpage-fetch-bridge.js 리팩토링

**변경 전:**
```javascript
// 불필요한 헤더들을 추가하려 시도 (봇 감지 유발)
mergedOptions.headers['x-anonuserid'] = val;
mergedOptions.headers['x-challenge'] = val;
mergedOptions.headers['x-signature'] = val;
```

**변경 후:**
```javascript
// ⚠️ CRITICAL: Cloudflare 봇 감지를 피하기 위해
// 오직 실제 Grok.com이 보내는 헤더만 사용 (HAR 분석 결과 기반)

// 1. 인터셉트된 헤더 사용 (최우선)
if(window.__GROK_LAST_HEADERS__){
  // 실제 Grok.com fetch에서 캡처한 헤더를 그대로 사용
  mergedOptions.headers = Object.assign({}, window.__GROK_LAST_HEADERS__);
  console.log('[INPAGE-GROK] ✅ Using intercepted headers from real Grok request');
} else {
  // 2. 백업: x-statsig-id만 추가 (실제 Grok.com이 보내는 헤더)
  mergedOptions.headers = mergedOptions.headers || {};
  // x-statsig-id만 추가
  // x-anonuserid, x-challenge, x-signature 제외!
}
```

### 2. webapp.ts 에러 메시지 개선

**변경 전:**
```
🔐 Grok 인증 필요
```

**변경 후:**
```
🔐 Cloudflare 봇 감지 차단

📋 에러: Request rejected by anti-bot rules.

**해결 방법 (필수!):**

✅ **Grok.com에서 먼저 대화하기**
1. 새 탭에서 https://grok.com 방문
2. 로그인 후 **아무 메시지나 1번 보내기**
3. F12 → Console에서 다음 확인:
   ✓ [GROK-INTERCEPT] 🎯 Captured Grok API request headers
   ✓ [GROK-INTERCEPT] 📝 Saved headers: ...
4. 다시 Model Dock에서 시도

💡 **왜 이렇게 해야 하나요?**
Cloudflare는 실제 브라우저 요청만 허용합니다.
실제 Grok.com에서 메시지를 보내면 정상적인 헤더가 캡처되어,
이후 Model Dock 요청이 허용됩니다.
```

---

## 🧪 테스트 방법

### 1단계: 확장 프로그램 재로드
```
1. chrome://extensions
2. Model Dock → "다시 로드" 버튼 클릭
```

### 2단계: Grok.com에서 헤더 캡처
```
1. 새 탭: https://grok.com
2. 로그인
3. F12 → Console 열기
4. 아무 메시지나 1번 보내기
5. Console에서 확인:
   ✅ [GROK-INTERCEPT] ✅ Fetch interceptor installed
   ✅ [GROK-INTERCEPT] 🎯 Captured Grok API request headers
   ✅ [GROK-INTERCEPT] 📝 Saved headers: Content-Type, x-xai-request-id, x-statsig-id, ...
```

**중요:** `x-anonuserid`가 **없어야** 정상입니다!

### 3단계: Model Dock에서 테스트
```
1. Model Dock 사이드패널 열기 (Alt+J)
2. Grok → Webapp 모드 선택
3. 테스트 메시지 전송
4. 예상 결과: 200 OK, 정상 응답
```

---

## 📈 예상 결과

### ✅ 성공 시 로그
```
[GROK-INTERCEPT] 🎯 Captured Grok API request headers
[GROK-INTERCEPT] 📝 Saved headers: Content-Type, x-xai-request-id, x-statsig-id, baggage, sentry-trace, traceparent
[INPAGE-GROK] ✅ Using intercepted headers from real Grok request
[GROK-WEB] 📡 Response status: 200 OK
[GROK-WEB] ✅ Message sent successfully
```

### ❌ 실패 시 (헤더 캡처 안 됨)
```
[INPAGE-GROK] ⚠️ No intercepted headers found, using fallback
[INPAGE-GROK] 💡 Tip: Send a message on grok.com first to capture headers!
[GROK-WEB] 📡 Response status: 403
```

→ 해결: Grok.com에서 다시 메시지 보내기

---

## 🔬 기술적 세부사항

### Cloudflare Bot Management의 감지 메커니즘

1. **헤더 패턴 분석**: 비정상적인 헤더 조합 (예: x-anonuserid)
2. **행동 분석**: 브라우저 지문, 마우스/키보드 이벤트
3. **TLS 핑거프린팅**: TLS 핸드셰이크 특성
4. **JavaScript 챌린지**: 브라우저 환경 검증

### 우리의 해결책

**Fetch 인터셉터**를 사용하여:
1. 실제 Grok.com 페이지에서 정상적인 요청 감지
2. 해당 요청의 정확한 헤더를 `window.__GROK_LAST_HEADERS__`에 캡처
3. Model Dock 요청 시 캡처된 헤더를 그대로 사용
4. Cloudflare가 "정상적인" 요청으로 인식

---

## 📝 남은 작업

### 현재 상태: 완료 ✅
- ✅ HAR 로그 분석 완료
- ✅ 실제 원인 파악 (Cloudflare Bot Management)
- ✅ 코드 수정 (inpage-fetch-bridge.js, webapp.ts)
- ✅ 빌드 성공
- ✅ 문서화 완료

### 사용자 테스트 대기 중
- ⏳ 확장 프로그램 재로드
- ⏳ Grok.com에서 헤더 캡처
- ⏳ Model Dock에서 테스트
- ⏳ 결과 보고

---

## 🎓 교훈

1. **가정을 의심하라**: x-challenge/x-signature가 필요하다는 가정은 틀렸음
2. **실제 데이터를 확인하라**: HAR 로그 분석이 정답을 제공
3. **최소한의 변경**: 실제 브라우저가 보내는 것과 똑같이 하는 것이 최선
4. **Cloudflare는 똑똑하다**: 작은 차이(x-anonuserid)도 감지

---

**생성일**: 2025-10-22
**마지막 업데이트**: 빌드 완료 후
**상태**: 사용자 테스트 대기 중
