# LM Arena 테스트 가이드

## 빠른 시작

### 1. 기본 테스트

```bash
# 프로젝트 빌드
npm run build

# 개발 서버 실행
npm run dev
```

### 2. Direct Chat 모드 테스트

1. 브라우저에서 애플리케이션 열기
2. 봇 선택에서 "LM Arena (Direct)" 선택
3. 설정 패널에서 모델 선택 (예: GPT-4o)
4. 메시지 입력 및 전송
5. 실시간 스트리밍 응답 확인

**예상 결과:**
- 선택한 모델의 응답이 실시간으로 표시됨
- 응답이 완료되면 "DONE" 상태로 전환
- 추가 메시지 전송 가능

### 3. Battle 모드 테스트

1. 봇 선택에서 "LM Arena (Battle)" 선택
2. 메시지 입력 및 전송
3. 두 익명 모델의 응답 확인
4. 응답 비교 후 투표 (향후 구현)

**예상 결과:**
- 두 모델의 응답이 동시에 표시됨
- 모델 이름은 숨겨짐 (익명)
- 응답 완료 후 모델 공개 옵션

### 4. Side-by-Side 모드 테스트

1. 봇 선택에서 "LM Arena (Side-by-Side)" 선택
2. 설정에서 두 모델 선택 (예: GPT-4o vs Claude 3.5 Sonnet)
3. 메시지 입력 및 전송
4. 두 모델의 응답을 나란히 비교

**예상 결과:**
- 두 모델의 응답이 동시에 표시됨
- 각 모델의 이름이 명확히 표시됨
- 응답 속도 및 품질 비교 가능

## 상세 테스트 시나리오

### 시나리오 1: 모델 전환

1. Direct 모드에서 GPT-4o 선택
2. 메시지 전송 및 응답 확인
3. 모델을 Claude 3.5 Sonnet으로 변경
4. 같은 메시지 재전송
5. 응답 차이 확인

**검증 포인트:**
- [ ] 모델 전환이 즉시 반영됨
- [ ] 대화 히스토리가 유지됨
- [ ] 새 모델의 응답이 올바르게 표시됨

### 시나리오 2: 긴 대화

1. 모델 선택 (GPT-4o 권장)
2. 5개 이상의 메시지 연속 전송
3. 각 응답 확인
4. 대화 컨텍스트 유지 확인

**검증 포인트:**
- [ ] 모든 메시지가 순서대로 처리됨
- [ ] 이전 대화 내용을 참조한 응답
- [ ] 메모리 누수 없음

### 시나리오 3: 에러 처리

1. 네트워크 연결 끊기
2. 메시지 전송 시도
3. 에러 메시지 확인
4. 네트워크 복구 후 재시도

**검증 포인트:**
- [ ] 명확한 에러 메시지 표시
- [ ] 애플리케이션이 크래시하지 않음
- [ ] 재시도 시 정상 작동

### 시나리오 4: 스트리밍 중단

1. 메시지 전송
2. 응답 스트리밍 중 취소 버튼 클릭
3. 새 메시지 전송
4. 정상 작동 확인

**검증 포인트:**
- [ ] 스트리밍이 즉시 중단됨
- [ ] 부분 응답이 표시됨
- [ ] 다음 메시지가 정상 처리됨

## 성능 테스트

### 응답 시간 측정

```typescript
const startTime = Date.now()
await bot.sendMessage({ prompt: 'Hello' })
const endTime = Date.now()
console.log(`Response time: ${endTime - startTime}ms`)
```

**목표:**
- 첫 토큰: < 2초
- 전체 응답: < 10초 (짧은 응답 기준)

### 동시 요청 테스트

```typescript
// Side-by-Side 모드에서 자동으로 테스트됨
const bot = createSideBySideBot('gpt-4o', 'claude-3-5-sonnet')
await bot.sendMessage({ prompt: 'Test' })
```

**검증:**
- [ ] 두 응답이 동시에 시작됨
- [ ] 서로 간섭하지 않음
- [ ] 모두 정상 완료됨

## 브라우저 호환성 테스트

### Chrome/Edge
- [x] 기본 기능
- [x] 스트리밍
- [x] UI 렌더링

### Firefox
- [ ] 기본 기능
- [ ] 스트리밍
- [ ] UI 렌더링

### Safari
- [ ] 기본 기능
- [ ] 스트리밍
- [ ] UI 렌더링

## 디버깅 팁

### 콘솔 로그 활성화

```typescript
// src/app/bots/lmarena/index.ts
console.log('[LMArena] Request:', payload)
console.log('[LMArena] Response:', response)
```

### 네트워크 탭 확인

1. 브라우저 개발자 도구 열기 (F12)
2. Network 탭 선택
3. 필터: `lmarena.ai`
4. 요청/응답 상세 확인

**확인 사항:**
- Status Code: 200
- Content-Type: text/event-stream
- Response 내용

### HAR 파일 분석

```bash
# HAR 파일에서 API 호출 추출
grep -A 50 "nextjs-api/stream" har/lmarena*.txt
```

## 자동화 테스트 (향후)

### 단위 테스트

```typescript
describe('LMArenaBot', () => {
  it('should create conversation', async () => {
    const bot = createDirectChatBot('gpt-4o')
    // 테스트 로직
  })

  it('should stream response', async () => {
    // 테스트 로직
  })
})
```

### 통합 테스트

```typescript
describe('LMArena Integration', () => {
  it('should complete full conversation', async () => {
    // 전체 대화 플로우 테스트
  })
})
```

## 문제 해결 체크리스트

### 응답이 오지 않을 때
- [ ] 네트워크 연결 확인
- [ ] 콘솔 에러 확인
- [ ] 대화 ID 유효성 확인
- [ ] 모델 ID 정확성 확인

### 스트리밍이 끊길 때
- [ ] 브라우저 콘솔 확인
- [ ] 네트워크 안정성 확인
- [ ] 타임아웃 설정 확인
- [ ] 메모리 사용량 확인

### UI가 업데이트되지 않을 때
- [ ] React 상태 업데이트 확인
- [ ] 이벤트 핸들러 연결 확인
- [ ] 컴포넌트 리렌더링 확인

## 보고서 작성

테스트 완료 후 다음 정보를 포함한 보고서 작성:

1. **테스트 환경**
   - OS 및 버전
   - 브라우저 및 버전
   - 네트워크 환경

2. **테스트 결과**
   - 성공한 시나리오
   - 실패한 시나리오
   - 발견된 버그

3. **성능 메트릭**
   - 평균 응답 시간
   - 메모리 사용량
   - CPU 사용량

4. **개선 제안**
   - UX 개선 사항
   - 성능 최적화 아이디어
   - 추가 기능 제안

## 다음 단계

1. 모든 테스트 시나리오 완료
2. 발견된 이슈 수정
3. 성능 최적화
4. 사용자 피드백 수집
5. 추가 기능 구현
