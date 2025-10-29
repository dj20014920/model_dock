# LM Arena API 차단 문제

## 문제 상황
LM Arena API가 확장 프로그램의 요청을 차단하여 HTTP 500 에러 발생

```
POST https://lmarena.ai/nextjs-api/stream/create-evaluation
Status: 500 Internal Server Error
```

## 시도한 방법

### 1. hybridFetch + Content Script (실패)
- manifest.config.ts에 content script 등록
- hybridFetch로 쿠키 포함 요청
- 결과: API가 요청을 거부 (500 에러)

### 2. 직접 fetch (실패)
- 일반 fetch로 요청
- 결과: CORS 에러 또는 500 에러

## 근본 원인

**LM Arena는 자체 웹사이트에서만 API 사용을 허용**

HAR 파일 분석 결과:
```json
{
  "conversationId": "019a1836-3af4-4d82-8770-61ffc008cc35",
  "message": "안녕",
  "mode": "direct",
  "model": "gpt-4.5-preview-2025-02-27"
}
```

동일한 요청을 보내도:
- ✅ lmarena.ai 웹사이트에서: 정상 작동
- ❌ 확장 프로그램에서: 500 에러

## 다른 봇과의 차이점

### Gemini, Claude, Perplexity (성공)
- 공식 웹사이트 API 사용
- 사용자 쿠키 기반 인증
- 확장 프로그램 요청 허용

### LM Arena (실패)
- 자체 Next.js API
- 확장 프로그램 요청 차단
- 웹사이트에서만 작동

## 최종 해결책

**새 탭 열기 방식 유지**

```typescript
async doSendMessage(params: SendMessageParams): Promise<void> {
  // URL 생성
  const url = `${this.baseUrl}/c/new?mode=${mode}&model=${model}`
  
  // 안내 메시지
  params.onEvent({
    type: 'UPDATE_ANSWER',
    data: { text: '🚀 LM Arena 웹사이트로 이동합니다...' }
  })
  
  // 새 탭 열기
  window.open(url, '_blank')
  
  params.onEvent({ type: 'DONE' })
}
```

## PRD 요구사항 재검토

### 원래 요구사항
> "Gemini, Claude, Perplexity처럼 사용자 계정 기반 직접 대화"

### 현실
- LM Arena는 API 접근을 차단
- 직접 통합 불가능
- 새 탭 방식만 가능

### 대안
1. **수동 복사/붙여넣기** (현재 구현)
   - 새 탭에서 LM Arena 열기
   - 메시지 복사하여 사용

2. **자동 입력 (리스크)**
   - Content script로 DOM 조작
   - 봇 감지 위험
   - PRD에서 명시적으로 금지

## 모델 동기화는 유지

**api.ts의 모델 동기화 시스템은 정상 작동**

- ✅ 실시간 리더보드 HTML 파싱
- ✅ GPT-5, Claude 4.5, Gemini 2.5 지원
- ✅ 5단계 폴백 시스템

## 결론

LM Arena는 **새 탭 열기 방식**으로만 사용 가능합니다.

**장점:**
- 법적 리스크 없음
- 봇 감지 위험 없음
- 안정적 작동

**단점:**
- 자동 대화 불가
- 수동 복사/붙여넣기 필요

이는 LM Arena의 정책이므로 우리가 제어할 수 없습니다.
