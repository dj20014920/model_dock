# LM Arena WebApp 방식 마이그레이션 완료

## 문제 상황
- **기존 구현**: `window.open()`으로 새 탭 열기 → 사용자가 수동으로 메시지 복사/붙여넣기
- **문제점**: PRD 요구사항과 다름. Gemini, Claude, Perplexity처럼 사용자 계정 기반 직접 대화 불가

## 해결 방법
LM Arena를 WebApp 방식으로 재구현하여 사용자 계정 기반 직접 대화 지원

### 핵심 변경사항

#### 1. hybridFetch 사용
```typescript
// 기존: fetch() - 쿠키 없음
const response = await fetch(url, { ... })

// 변경: hybridFetch - 쿠키 자동 포함
const { hybridFetch } = await import('~app/utils/hybrid-requester')
const response = await hybridFetch(url, options, {
  homeUrl: 'https://lmarena.ai',
  hostStartsWith: 'https://lmarena.ai',
})
```

#### 2. 권한 확인 추가
```typescript
const { requestHostPermission } = await import('~app/utils/permissions')
if (!(await requestHostPermission('https://*.lmarena.ai/*'))) {
  throw new ChatError('Missing lmarena.ai permission', ErrorCode.MISSING_HOST_PERMISSION)
}
```

#### 3. 대화 흐름
1. **대화 생성**: `GET /c/{conversationId}` - 대화 세션 초기화
2. **메시지 전송**: `POST /nextjs-api/stream/create-evaluation` - SSE 스트리밍
3. **응답 파싱**: Server-Sent Events 형식으로 실시간 응답 수신

### 구현 세부사항

#### createConversation()
- UUID 기반 대화 ID 생성
- hybridFetch로 세션 초기화
- 사용자 쿠키 자동 포함

#### streamMessage()
- SSE 스트리밍 요청
- 실시간 응답 업데이트
- 완료 신호 감지

#### parseSSEStream()
- `a0:"텍스트"` 형식 파싱
- `ad:{"finishReason":"stop"}` 완료 감지
- 점진적 텍스트 업데이트

## 다른 WebApp 봇과의 일관성

### Gemini Web
```typescript
const htmlResp = await hybridFetch('https://gemini.google.com/', ...)
const resp = await hybridFetch(url + query, { method: 'POST', ... }, ...)
```

### Claude Web
```typescript
const resp = await hybridFetch(
  `https://claude.ai/api/organizations/${orgId}/...`,
  { method: 'POST', ... },
  { homeUrl: 'https://claude.ai', ... }
)
```

### Perplexity Web
```typescript
const response = await createPerplexityRequest(
  prompt,
  (url, init) => hybridFetch(url, init, {
    homeUrl: 'https://www.perplexity.ai',
    ...
  })
)
```

## 테스트 방법

1. **사전 준비**
   - LM Arena 사이트(https://lmarena.ai)에 로그인
   - 확장 프로그램 빌드: `npm run build`

2. **테스트 시나리오**
   ```
   1. LM Arena 봇 선택 (Direct 모드)
   2. 모델 선택 (예: GPT-4.5 Preview)
   3. 메시지 입력: "안녕하세요"
   4. 응답 확인: 실시간 스트리밍 응답 표시
   ```

3. **확인 사항**
   - ✅ 새 탭이 열리지 않음
   - ✅ 사용자 계정 기반 대화
   - ✅ 실시간 스트리밍 응답
   - ✅ 대화 컨텍스트 유지

## PRD 준수 확인

✅ **"프록시 탭 모드는 죽어도 사용하지 말것"**
- window.open() 제거
- hybridFetch 사용

✅ **"사용자가 이미 구독/로그인한 계정을 이용"**
- 쿠키 기반 인증
- 사용자 세션 유지

✅ **"Gemini, Claude, Perplexity처럼 구성"**
- 동일한 hybridFetch 패턴
- 일관된 WebApp 구조

## 빌드 결과
```
✓ 3875 modules transformed
✓ No diagnostics found
✓ Build successful
```

## 다음 단계
- [ ] 실제 LM Arena 계정으로 테스트
- [ ] Battle/Side-by-Side 모드 테스트
- [ ] 에러 핸들링 개선
- [ ] 사용자 피드백 수집
