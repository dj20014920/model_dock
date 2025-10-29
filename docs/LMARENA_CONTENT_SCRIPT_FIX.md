# LM Arena Content Script 오류 수정

## 문제 상황
```
[PROXY-FETCH] ❌ Content script 초기화 실패!
[PROXY-FETCH] 💔 Port disconnected prematurely
[LMArena] Error: Failed to create conversation
```

## 근본 원인
**LM Arena가 manifest.config.ts의 content_scripts에 등록되지 않음**

hybridFetch는 사용자 쿠키를 포함하기 위해 content script를 통해 요청을 보내는데, LM Arena 도메인에 content script가 주입되지 않아서 실패했습니다.

## 해결 방법

### 1. content_scripts에 LM Arena 추가
```typescript
content_scripts: [
  {
    matches: [
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
      'https://claude.ai/*',
      'https://gemini.google.com/*',
      'https://chat.deepseek.com/*',
      'https://perplexity.ai/*',
      'https://www.perplexity.ai/*',
      'https://lmarena.ai/*',        // ✅ 추가
      'https://*.lmarena.ai/*',      // ✅ 추가
    ],
    js: ['src/content-script/chatgpt-inpage-proxy.ts'],
    run_at: 'document_start',
  },
]
```

### 2. web_accessible_resources에 LM Arena 추가
```typescript
{
  resources: [
    'assets/browser-polyfill-*.js',
    'assets/proxy-fetch-*.js',
    'assets/chatgpt-inpage-proxy.ts-*.js',
  ],
  matches: [
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*',
    'https://chat.deepseek.com/*',
    'https://perplexity.ai/*',
    'https://www.perplexity.ai/*',
    'https://copilot.microsoft.com/*',
    'https://lmarena.ai/*',        // ✅ 추가
    'https://*.lmarena.ai/*',      // ✅ 추가
  ],
  use_dynamic_url: false,
}
```

## hybridFetch 작동 원리

### 1. Content Script 주입
```
확장 프로그램 → content script 주입 → lmarena.ai 페이지
```

### 2. 쿠키 포함 요청
```
확장 프로그램 → content script → fetch (쿠키 자동 포함) → LM Arena API
```

### 3. 응답 전달
```
LM Arena API → content script → 확장 프로그램 → UI 업데이트
```

## 다른 WebApp 봇과의 일관성

모든 WebApp 봇은 동일한 패턴을 사용합니다:

### Gemini Web
```typescript
matches: ['https://gemini.google.com/*']
```

### Claude Web
```typescript
matches: ['https://claude.ai/*']
```

### Perplexity Web
```typescript
matches: [
  'https://perplexity.ai/*',
  'https://www.perplexity.ai/*'
]
```

### LM Arena (수정 후)
```typescript
matches: [
  'https://lmarena.ai/*',
  'https://*.lmarena.ai/*'
]
```

## 테스트 절차

1. **확장 프로그램 재빌드**
   ```bash
   npm run build
   ```

2. **Chrome에서 확장 프로그램 다시 로드**
   - chrome://extensions/
   - 새로고침 버튼 클릭

3. **LM Arena 탭 새로고침**
   - 기존 lmarena.ai 탭 닫기
   - 새 탭에서 lmarena.ai 열기
   - 로그인 확인

4. **대화 테스트**
   - 확장 프로그램에서 LM Arena 봇 선택
   - 모델 선택 (예: GPT-4.5 Preview)
   - 메시지 입력: "안녕하세요"
   - 실시간 응답 확인

## 예상 결과

### 성공 시
```
[PROXY-FETCH] ✅ Content script initialized
[PROXY-FETCH] ✅ Port connected successfully
[LMArena] 🚀 Starting message send
[LMArena] 💬 Conversation ID: 019a...
[LMArena] 📝 Streaming response...
```

### 실패 시 (이전)
```
[PROXY-FETCH] ❌ Content script 초기화 실패!
[PROXY-FETCH] 💔 Port disconnected prematurely
[LMArena] Error: Failed to create conversation
```

## 주의사항

### Chrome 캐시 문제
Chrome이 이전 manifest.json을 캐시할 수 있습니다:

1. **확장 프로그램 완전 제거**
   - chrome://extensions/
   - 확장 프로그램 제거

2. **Chrome 재시작**

3. **확장 프로그램 재설치**
   - dist 폴더 로드

### Content Script 디버깅
```javascript
// lmarena.ai 페이지 콘솔에서 확인
console.log('Content script loaded:', window.__PROXY_FETCH_BRIDGE__)
```

## 관련 파일
- `manifest.config.ts` - Content script 등록
- `src/content-script/chatgpt-inpage-proxy.ts` - Proxy fetch 브리지
- `src/app/utils/hybrid-requester.ts` - hybridFetch 구현
- `src/app/bots/lmarena/index.ts` - LM Arena 봇 구현

## 참고
이 패턴은 모든 WebApp 봇(Gemini, Claude, Perplexity, DeepSeek)에서 동일하게 사용됩니다. 새로운 WebApp 봇을 추가할 때는 반드시 manifest.config.ts에 도메인을 등록해야 합니다.
