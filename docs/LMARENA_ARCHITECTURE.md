# LM Arena 아키텍처 설계

## 핵심 원칙
**모델 동기화**와 **대화 기능**을 완전히 분리하여 각각 최적의 방식으로 구현

## 1. 모델 동기화 (api.ts)

### 목적
최신 모델 목록(GPT-5, Claude 4.5, Gemini 2.5 등)을 자동으로 가져오기

### 5단계 폴백 전략
```typescript
1. 실시간 리더보드 HTML 파싱 (최신)
   ↓ 실패시
2. Hugging Face CSV (공식 소스)
   ↓ 실패시
3. GitHub arena-catalog JSON
   ↓ 실패시
4. 커뮤니티 CSV (백업)
   ↓ 실패시
5. 로컬 캐시 → 기본 목록 (fallback)
```

### 주요 함수
- `fetchAvailableModels()` - 모델 목록 가져오기
- `fetchFromLiveLeaderboard()` - HTML 파싱
- `fetchFromHuggingFaceCSV()` - CSV 파싱
- `fetchFromArenaCatalog()` - JSON 파싱
- `getDefaultModels()` - 하드코딩된 기본 목록

### 특징
- ✅ 최신 모델 자동 감지
- ✅ 다중 소스 지원
- ✅ 오프라인 대응 (캐시/기본 목록)
- ✅ 조직별 그룹화

## 2. 대화 기능 (index.ts)

### 목적
사용자 계정 기반 직접 대화 (Gemini/Claude/Perplexity와 동일)

### WebApp 방식
```typescript
// hybridFetch 사용 - 쿠키 자동 포함
const response = await hybridFetch(url, options, {
  homeUrl: 'https://lmarena.ai',
  hostStartsWith: 'https://lmarena.ai',
})
```

### 대화 흐름
```
1. 권한 확인
   requestHostPermission('https://*.lmarena.ai/*')

2. 대화 생성
   GET /c/{conversationId}
   - UUID 기반 ID 생성
   - 세션 초기화

3. 메시지 전송
   POST /nextjs-api/stream/create-evaluation
   - SSE 스트리밍
   - 실시간 응답

4. 응답 파싱
   parseSSEStream()
   - a0:"텍스트" 형식
   - ad:{"finishReason":"stop"} 완료
```

### 주요 메서드
- `doSendMessage()` - 메시지 전송 진입점
- `createConversation()` - 대화 세션 생성
- `streamMessage()` - SSE 스트리밍 요청
- `parseSSEStream()` - 실시간 응답 파싱

### 특징
- ✅ 사용자 쿠키 기반 인증
- ✅ 새 탭 열기 없음
- ✅ 실시간 스트리밍
- ✅ 대화 컨텍스트 유지

## 3. 통합 구조

```
┌─────────────────────────────────────────┐
│         LMArenaBot (index.ts)           │
│  - doSendMessage()                      │
│  - createConversation()                 │
│  - streamMessage()                      │
│  - parseSSEStream()                     │
└─────────────────────────────────────────┘
                  │
                  │ 사용
                  ↓
┌─────────────────────────────────────────┐
│      hybridFetch (utils)                │
│  - 쿠키 자동 포함                        │
│  - 권한 관리                             │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│      모델 동기화 (api.ts)                │
│  - fetchAvailableModels()               │
│  - 5단계 폴백 시스템                     │
│  - 캐싱 & 기본 목록                      │
└─────────────────────────────────────────┘
                  │
                  │ 제공
                  ↓
┌─────────────────────────────────────────┐
│    UI 컴포넌트 (LMArenaSettings)        │
│  - 모델 선택 드롭다운                    │
│  - 조직별 그룹화                         │
└─────────────────────────────────────────┘
```

## 4. 에러 처리

### 모델 동기화 실패
```typescript
// 404, 429 등 → 다음 소스로 폴백
// 모든 소스 실패 → 기본 목록 사용
console.warn('[LMArena] Using fallback default models')
```

### 대화 실패
```typescript
// 권한 없음
throw new ChatError('Missing lmarena.ai permission', 
  ErrorCode.MISSING_HOST_PERMISSION)

// 네트워크 오류
throw new ChatError(`HTTP ${status}`, 
  ErrorCode.NETWORK_ERROR)
```

## 5. PRD 준수 확인

✅ **"프록시 탭 모드는 죽어도 사용하지 말것"**
- window.open() 제거
- hybridFetch 사용

✅ **"사용자가 이미 구독/로그인한 계정을 이용"**
- 쿠키 기반 인증
- 사용자 세션 유지

✅ **"Gemini, Claude, Perplexity처럼 구성"**
- 동일한 hybridFetch 패턴
- 일관된 WebApp 구조

✅ **"최신 모델 지원"**
- GPT-5, Claude 4.5, Gemini 2.5
- 자동 동기화 시스템

## 6. 테스트 시나리오

### 모델 동기화 테스트
```javascript
// 콘솔에서 실행
const { fetchAvailableModels } = await import('./src/app/bots/lmarena/api.ts')
const models = await fetchAvailableModels()
console.log(`Loaded ${models.length} models`)
console.log(models.slice(0, 10))
```

### 대화 테스트
```
1. LM Arena 사이트 로그인
2. 확장 프로그램에서 LM Arena 봇 선택
3. 모델 선택 (예: GPT-4.5 Preview)
4. 메시지 입력: "안녕하세요"
5. 확인: 실시간 스트리밍 응답
```

## 7. 향후 개선 사항

- [ ] Battle/Side-by-Side 모드 테스트
- [ ] 모델 동기화 주기 최적화
- [ ] 에러 메시지 다국어 지원
- [ ] 모델 필터링/검색 기능
- [ ] 사용 통계 수집
