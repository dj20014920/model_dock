# 🎯 iframe 세션 완벽 보존 시스템 - 테스트 가이드

## 📋 구현 완료 내용

### ✅ 핵심 변경사항
1. **MultiBotChatPanel 완전 재구성**
   - 사용되지 않는 5개 레거시 컴포넌트 제거 (TwoBotChatPanel, ThreeBotChatPanel, etc.)
   - 새로운 UnifiedChatPanel 아키텍처 도입
   - 모든 iframe 봇(chatgpt, grok, qwen, lmarena)을 항상 렌더링
   - CSS `display:none`으로만 표시/숨김 제어

2. **CSS 기반 가시성 제어**
   - iframe 봇: 항상 DOM에 존재, `hidden` 클래스로만 제어
   - 메인브레인 영역: 항상 렌더링, `hidden` 클래스로만 제어
   - 비-iframe 봇: 조건부 렌더링 유지 (Jotai가 세션 보존)

3. **안정적인 Key 전략**
   - `${botId}-${index}` → `botId`로 변경
   - React Reconciliation 최적화

### 🔧 기술적 원리

#### Before (문제 상황):
```tsx
// hasMainBrain 변경 시 완전히 다른 JSX 구조 반환
if (hasMainBrain) {
  return <div className="flex-row">...</div>  // 구조 A
} else {
  return <div className="w-full">...</div>    // 구조 B
}
// → React가 unmount/mount 감지 → PersistentIframe unmount → iframe reload
```

#### After (해결 방법):
```tsx
// 항상 같은 구조, CSS로만 제어
return (
  <div className="flex flex-row">
    <div className={hasMainBrain ? 'flex-1' : 'w-full'}>
      {/* iframe 봇들 항상 렌더링 */}
      {otherChats.map(chat => (
        <div className={isIframe && !isVisible && 'hidden'}>
          <ConversationPanel ... />
        </div>
      ))}
    </div>
    <div className={!hasMainBrain && 'hidden'}>
      {/* 메인브레인 영역 항상 렌더링 */}
    </div>
  </div>
)
// → React가 같은 컴포넌트로 인식 → PersistentIframe 유지 → 세션 보존!
```

## 🧪 테스트 시나리오

### 준비 단계
```bash
# 1. 빌드 완료 확인
yarn build
# ✅ 이미 성공적으로 빌드됨!

# 2. 개발 서버 실행
yarn dev
```

### 시나리오 1: 그리드 레이아웃 전환
**목표**: 2 → 3 → 4 → 6 그리드 전환 시 모든 iframe 봇의 세션 유지

1. ChatGPT 탭에서 "안녕하세요"라고 입력하고 대화 시작
2. 좌측 하단 레이아웃 스위치에서 2 → 3 → 4 → 6 순서로 변경
3. **예상 결과**: 각 전환마다 ChatGPT iframe이 reload되지 않고 대화 내역 유지

**콘솔 로그 확인**:
```
[PersistentIframe] 🔧 attach (embedded) begin { botId: 'chatgpt', containerId: ... }
[PersistentIframe] ✅ 마운트 완료 { botId: 'chatgpt', zoom: 1 }

// 레이아웃 변경 시
[Layout] 🔁 switch_all_in_one_layout { prev: 2, next: 3 }
[UnifiedChatPanel] 🎨 Render: { layout: 3, ... }

// ❌ 다음 로그가 나오면 안 됨:
[PersistentIframe] 🧹 detach (embedded) begin
[PersistentIframe] 🔧 attach (embedded) begin  (재부착)
```

### 시나리오 2: 메인브레인 등록/해제
**목표**: 메인브레인 설정/해제 시 iframe 세션 유지

1. Grok iframe에서 대화 시작 (로그인 필요)
2. 우측 상단 메인브레인 패널에서 Grok을 메인브레인으로 등록
3. **예상 결과**: Grok iframe이 우측으로 이동하지만 reload 없음 (세션 유지)
4. 메인브레인 해제
5. **예상 결과**: Grok iframe이 좌측 그리드로 돌아가지만 reload 없음

**콘솔 로그 확인**:
```
[MultiBotPanel] 🔄 Main Brain change: { from: '', to: 'grok' }
[MultiBotPanel] 📊 Layout State: { hasMainBrain: true, mainBrainChat: 'grok', ... }

// ❌ PersistentIframe의 detach/attach 로그가 나오면 안 됨
```

### 시나리오 3: 메인브레인 변경
**목표**: 메인브레인을 다른 봇으로 변경 시 두 봇 모두 세션 유지

1. ChatGPT를 메인브레인으로 등록하고 대화 시작
2. Qwen iframe에서도 대화 시작
3. 메인브레인을 ChatGPT → Qwen으로 변경
4. **예상 결과**:
   - ChatGPT가 좌측 그리드로 이동하지만 대화 내역 유지
   - Qwen이 우측으로 이동하지만 대화 내역 유지

### 시나리오 4: 대화모드 전환 (만약 구현되어 있다면)
**목표**: 올인원 모드 ↔ 개별 모드 전환 시 세션 유지

1. 올인원 모드에서 ChatGPT, Grok 대화 시작
2. 개별 모드로 전환
3. **예상 결과**: 각 봇의 대화 내역 유지
4. 다시 올인원 모드로 전환
5. **예상 결과**: 모든 대화 내역 유지

## 🔍 디버깅 체크리스트

### 정상 작동 신호 ✅
- [ ] `[UnifiedChatPanel] 🎨 Render` 로그가 레이아웃 변경 시마다 출력
- [ ] `[MultiBotPanel] 📊 Layout State` 로그가 상태 변화를 추적
- [ ] `[PersistentIframe] 🔧 attach` 로그가 최초 1회만 출력
- [ ] iframe 내부 URL이 변경되지 않음 (개발자 도구 > Elements 탭 확인)

### 문제 신호 ❌
- [ ] `[PersistentIframe] 🧹 detach` 로그가 레이아웃 변경 시 출력
- [ ] `[PersistentIframe] 🔧 attach` 로그가 반복 출력
- [ ] iframe이 깜빡이거나 새로고침됨
- [ ] 대화 내역이 사라짐

## 📊 성능 체크

### 메모리 사용량 모니터링
```bash
# Chrome DevTools > Performance > Memory
1. 프로파일링 시작
2. 모든 시나리오 실행
3. 프로파일링 종료
4. 메모리 증가량 확인

# 예상 메모리 증가: ~200MB (iframe 4개 상시 렌더링)
```

### PERF-WARNING 확인
파일: `src/app/pages/MultiBotChatPanel.tsx:556-557`
```typescript
// PERF-WARNING: iframe 봇 4개 상시 렌더링으로 메모리 +200MB 예상
// 확인: Instruments > Allocations로 메모리 사용량 모니터링
```

## 🎉 성공 기준

### ✅ 모든 시나리오에서:
1. iframe이 reload되지 않음
2. 대화 내역이 유지됨
3. 로그인 상태가 유지됨
4. 콘솔에 detach/attach 로그가 반복되지 않음

### ✅ 코드 품질:
1. TypeScript 빌드 에러 없음 (✅ 이미 확인됨)
2. React Hooks 규칙 준수 (✅ 모든 봇에 대해 항상 같은 순서로 useChat 호출)
3. KISS, DRY, YAGNI, SOLID 원칙 준수 (✅ 최소 코드로 최대 효과)

## 🛠 문제 발생 시 조치

### 문제: iframe이 여전히 reload됨
**원인 분석**:
1. `visibilityMap` 생성 로직 확인
2. `isIframeBot()` 함수 동작 확인
3. React DevTools > Components에서 ConversationPanel의 props 변화 추적

**해결 방안**:
```typescript
// UnifiedChatPanel에서 visibilityMap 로깅 추가
console.log('[UnifiedChatPanel] visibilityMap:', Array.from(visibilityMap.entries()))
```

### 문제: 특정 봇만 세션이 유지되지 않음
**원인**: iframe-registry.ts에 등록되지 않았거나 잘못 등록됨

**확인**:
```bash
# iframe 봇 목록 확인
cat src/app/bots/iframe-registry.ts
```

### 문제: 메모리 누수 발생
**원인**: iframeManager의 stash에 iframe이 계속 쌓임

**해결**:
```typescript
// 필요 시 cleanup 호출 (단, 세션은 손실됨)
iframeManager.cleanup()
```

## 📝 다음 단계

### 추가 최적화 고려사항
1. **Lazy Loading**: 사용자가 실제로 클릭할 때까지 iframe 로드 지연
2. **Virtual Scrolling**: 많은 봇이 추가될 경우 성능 최적화
3. **Service Worker Caching**: iframe 리소스 캐싱으로 초기 로드 속도 개선

### 문서화
- [x] 테스트 가이드 작성
- [ ] 아키텍처 다이어그램 추가
- [ ] API 문서 업데이트

---

**작성일**: 2025-10-31
**작성자**: Claude Code (Sonnet 4.5)
**구현 원칙**: KISS, DRY, YAGNI, SOLID
**검증 상태**: TypeScript 빌드 성공 ✅
