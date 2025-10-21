# Turnstile 토큰 생성 실패 문제 해결 계획

## 🔍 문제 진단 결과

### 현재 상황
- **증상**: `[GPT-WEB] ⚠️ Auto Turnstile solver did not return a token`
- **결과**: Cloudflare Turnstile 검증 실패로 대화 차단

### 근본 원인 분석

#### 1. Sitekey 탐지 실패 가능성
**문제점**:
```javascript
// inpage-fetch-bridge.js:74-86
let sitekey = null;
try{
  const el = document.querySelector('[data-sitekey]');
  if(el) sitekey = el.getAttribute('data-sitekey');
}catch(e){}
if(!sitekey && window.__TURNSTILE_SITEKEY){
  sitekey = window.__TURNSTILE_SITEKEY;
}
if(!sitekey){
  return reply({ error: 'SITEKEY_NOT_FOUND' });
}
```

**ChatGPT의 실제 Turnstile 구현**:
- 동적 렌더링: `window.turnstile.render(container, { sitekey: '...' })`
- Sitekey는 JavaScript 번들 내부에 하드코딩되어 있음
- DOM에 `[data-sitekey]` 속성이 없을 가능성 높음

**해결책**:
1. ChatGPT 페이지의 실제 Turnstile sitekey 추출
2. Fallback sitekey 하드코딩 옵션 제공
3. `window.turnstile` 객체에서 sitekey 동적 추출

#### 2. Turnstile 스크립트 로드 타이밍
**문제점**:
```javascript
// inpage-fetch-bridge.js:56-68
if(!window.turnstile){
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    // ...
    setTimeout(resolve, 4000); // 4초 타임아웃
  });
}
```

**개선 사항**:
- ChatGPT는 이미 자체 Turnstile 스크립트를 로드함
- 중복 로드 시도는 불필요하며 충돌 가능성
- 기존 `window.turnstile` 객체 활용 우선

#### 3. Content Script 메시지 전달 체인
**현재 흐름**:
```
[index.ts] prepareTurnstileProof()
    ↓ Browser.tabs.sendMessage(tabId, { type: 'TURNSTILE_SOLVE', dx })
[chatgpt-inpage-proxy.ts] message listener
    ↓ solveTurnstileViaInpage(dx)
    ↓ window.postMessage({ type: 'INPAGE_TURNSTILE_SOLVE', requestId, dx })
[inpage-fetch-bridge.js] message listener
    ↓ Turnstile solve
    ↓ window.postMessage({ type: 'INPAGE_TURNSTILE_SOLVE_RESULT', requestId, token })
[chatgpt-inpage-proxy.ts] result listener
    ↓ resolve(token)
[index.ts] ← token
```

**잠재적 문제**:
- Content Script 주입 타이밍 (DOM 로드 전 주입)
- Inpage Bridge 스크립트 미로드 (manifest 설정 누락?)
- Message origin 불일치

## ✅ 해결 방안

### 방안 1: 실제 ChatGPT Sitekey 하드코딩 (빠른 해결)
**장점**:
- 즉시 적용 가능
- 안정적인 작동

**단점**:
- ChatGPT가 sitekey 변경 시 업데이트 필요
- 유지보수 부담

**구현**:
```javascript
// ChatGPT의 실제 Turnstile sitekey (HAR 분석 필요)
const CHATGPT_TURNSTILE_SITEKEY = '0x4AAAAAAAxxxxxxxxxxx'; // 실제 값 필요
if(!sitekey) sitekey = CHATGPT_TURNSTILE_SITEKEY;
```

### 방안 2: window.turnstile에서 동적 추출 (권장)
**장점**:
- Sitekey 변경에도 자동 대응
- 유지보수 불필요

**구현**:
```javascript
// window.turnstile 객체에서 sitekey 추출
if(!sitekey && window.turnstile){
  try{
    // Turnstile 내부 상태에서 sitekey 찾기
    const widgets = window.turnstile.getState?.() || {};
    for(const wid in widgets){
      if(widgets[wid]?.sitekey){
        sitekey = widgets[wid].sitekey;
        break;
      }
    }
  }catch(e){}
}
```

### 방안 3: DOM 관찰로 동적 Turnstile 위젯 탐지
**구현**:
```javascript
// Turnstile iframe 또는 위젯 컨테이너 탐지
const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
if(iframe){
  // iframe의 부모 요소에서 sitekey 추출
  const container = iframe.closest('[data-sitekey]');
  if(container) sitekey = container.getAttribute('data-sitekey');
}
```

### 방안 4: 상세 로깅 추가 (디버깅용)
**목적**: 실제 실패 원인 파악

**구현**:
```javascript
console.log('[TURNSTILE-SOLVER] 🔍 Debugging info:', {
  hasTurnstileAPI: !!window.turnstile,
  sitekeyFound: !!sitekey,
  sitekeyValue: sitekey?.substring(0, 10) + '...',
  dx: dx?.substring(0, 20) + '...',
  domElements: {
    dataSitekey: !!document.querySelector('[data-sitekey]'),
    turnstileIframe: !!document.querySelector('iframe[src*="cloudflare"]'),
    metaTag: !!document.querySelector('meta[name="cf-turnstile-sitekey"]')
  }
});
```

## 📋 실행 계획

### 단계 1: 디버깅 로그 추가 (즉시 적용)
- `inpage-fetch-bridge.js`에 상세 로그 추가
- 실제 실패 원인 파악

### 단계 2: Sitekey 추출 로직 개선
- window.turnstile에서 동적 추출 우선
- Fallback 하드코딩 옵션

### 단계 3: 에러 핸들링 강화
- 각 단계별 실패 시 명확한 에러 메시지
- Timeout 시간 조정 (4초 → 8초)

### 단계 4: 테스트 및 검증
- Chrome DevTools Console 확인
- 실제 Turnstile 토큰 생성 여부 검증

## 🔧 수정 대상 파일

1. `/public/js/inpage-fetch-bridge.js` - Turnstile solver 핵심 로직
2. `/src/content-script/chatgpt-inpage-proxy.ts` - Content Script 메시지 전달
3. `/src/app/bots/chatgpt-webapp/index.ts` - 에러 처리 개선

## 🎯 성공 기준

✅ 로그 확인:
```
[TURNSTILE-SOLVER] 🔍 Sitekey found: 0x4AAAA...
[TURNSTILE-SOLVER] ✅ Token generated: 0.xxx...
[GPT-WEB] ✅ Turnstile token prepared automatically
```

✅ 대화 성공:
```
[GPT-WEB][REQ] ✅ backgroundFetch status 200
```

## 🚨 주의사항

1. **inpage-fetch-bridge.js는 빌드 후 dist/에 복사됨**
   - 수정 후 반드시 `npm run build` 실행

2. **Content Script 캐시 문제**
   - 확장 프로그램 완전 제거 후 재설치 권장

3. **ChatGPT 탭 상태**
   - Cloudflare 챌린지 통과 필요
   - 로그인 상태 유지 필수

## 📚 참고: HAR 분석 결과

성공 사례(chathubgpt2.txt) 분석:
- Sentinel 요청에서 Turnstile 관련 dx 파라미터 확인됨
- 실제 ChatGPT는 자체 Turnstile 구현 사용
- Sitekey는 JavaScript 번들에 하드코딩
