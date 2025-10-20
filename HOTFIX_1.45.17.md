# HOTFIX v1.45.17 - ChatHub 방식 단순화

## 날짜
2025-10-20

## 문제
- v1.45.16에서 추가한 브라우저 시뮬레이션 헤더가 오히려 ChatGPT의 봇 감지를 유발
- 너무 많은 헤더(User-Agent, sec-ch-ua, Origin, Referer 등)가 역효과

## 근본 원인
ChatGPT for Google (ChatHub의 이전 버전) 소스코드 분석 결과:
- ChatHub도 **Background Fetch를 사용함**
- 하지만 **최소한의 헤더만 사용** (Content-Type, Authorization)
- 불필요한 브라우저 시뮬레이션 헤더는 오히려 "조작된 요청"으로 감지될 수 있음

## 해결 방법
### 1. ChatHub 방식 적용
```typescript
// ChatHub (wong2/chatgpt-google-extension)
await fetchSSE('https://chat.openai.com/backend-api/conversation', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  // 단순하고 깔끔한 헤더만 사용
})
```

### 2. 변경 사항

**client.ts - fetch() 메서드**
```typescript
// BEFORE (v1.45.16)
const merged: any = { 
  credentials: 'include', 
  ...(options as any),
  headers: {
    'User-Agent': '...',
    'sec-ch-ua': '...',
    'sec-ch-ua-mobile': '?0',
    // ... 많은 헤더
  }
}

// AFTER (v1.45.17)
const merged: any = { 
  credentials: 'include', 
  ...(options as any)
}
// 헤더는 필요한 경우에만 options로 전달
```

**client.ts - requestBackendAPIWithToken()**
```typescript
// BEFORE (v1.45.16)
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
  'Origin': base,
  'Referer': `${base}/`,
  'User-Agent': '...',
  'sec-ch-ua': '...',
  // ... 더 많은 헤더
}

// AFTER (v1.45.17)
headers: {
  'Content-Type': 'application/json',
  ...(isSSE ? { Accept: 'text/event-stream' } : {}),
  'Authorization': `Bearer ${token}`,
  ...(extraHeaders || {}),
}
// 필수 헤더만 사용
```

### 3. 코드 정리
- `useProxy` 플래그 제거 (불필요)
- `switchRequester()` 메서드 제거 (기존에 이미 있었음)
- `fixAuthState()` 단순화

## 기대 효과
1. **자연스러운 요청**: 최소한의 헤더로 일반 확장 프로그램처럼 동작
2. **봇 감지 우회**: 과도한 시뮬레이션으로 인한 역효과 제거
3. **ChatHub 호환**: 검증된 방식 적용

## 테스트 방법
1. Chrome 확장 재로드
2. ChatGPT 봇 선택
3. 대화 시도
4. 콘솔에서 403 에러 없이 정상 응답 확인

## 참고
- ChatHub 소스: https://github.com/wong2/chatgpt-google-extension
- Background Fetch는 Chrome Extension의 정상 기능
- 핵심은 "얼마나 헤더를 추가하느냐"가 아니라 "얼마나 자연스럽게 보이느냐"
