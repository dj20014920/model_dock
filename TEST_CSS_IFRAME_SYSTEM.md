# CSS 기반 iframe 시스템 테스트 가이드

## 🎯 주요 변경 사항

### ✅ appendChild 완전 제거!
- **이전**: iframe을 stash ↔ container 사이에서 appendChild로 이동
- **현재**: iframe은 고정 위치에 유지, CSS로만 표시/숨김

### 핵심 개선
1. **전역 고정 컨테이너 생성**: `md-iframe-global-container`
   - 모든 iframe의 영구 부모
   - 한 번 appendChild 후 절대 이동 안 함

2. **CSS 기반 표시/숨김**:
   - 표시: position absolute, left/top 동적 계산, pointer-events auto
   - 숨김: left: -9999px, visibility hidden, pointer-events none

3. **위치/크기 동기화**:
   - ResizeObserver로 container 크기 변화 추적
   - Scroll sync로 스크롤 시 위치 업데이트
   - requestAnimationFrame으로 성능 최적화

## 🧪 테스트 절차

### 1. Chrome 확장 프로그램 새로고침
```
1. Chrome에서 chrome://extensions/ 열기
2. "Model Dock" 확장 프로그램 찾기
3. 새로고침 버튼 클릭 🔄
```

### 2. 앱 열기 및 콘솔 확인
```
1. 확장 프로그램 아이콘 클릭하여 앱 열기
2. F12로 개발자 도구 열기
3. 콘솔에서 다음 로그 확인:
```

**예상 로그:**
```javascript
[IframeManager] 🏗️ 전역 고정 컨테이너 생성 (CSS 기반 시스템)
[IframeManager] 🆕 CACHE MISS: chatgpt - Creating new iframe...
[IframeManager] ✅ NEW IFRAME CREATED: chatgpt
[IframeManager] 🎨 CSS ATTACH START: chatgpt
[IframeManager] ✅ CSS ATTACHED (NO DOM MOVE!): chatgpt
  {
    botId: "chatgpt",
    method: "CSS_ONLY",
    position: "123,456",
    size: "800x600",
    reloadCount: 1,
    noReloadRisk: true
  }
```

### 3. reloadCount 모니터링
```javascript
// 콘솔에서 실행하여 reloadCount 추적
window.checkReload = setInterval(() => {
  const manager = (window as any).__mdIframeCache
  if (manager) {
    for (const [botId, iframe] of manager) {
      console.log(`${botId}: reloadCount = ${iframe.__reloadCount || 'N/A'}`)
    }
  }
}, 3000)

// 중지
clearInterval(window.checkReload)
```

### 4. 메인브레인 변경 테스트
```
1. 초기 상태에서 reloadCount 확인 (모두 1이어야 함)
2. ChatGPT를 메인브레인으로 설정
3. 콘솔에서 reloadCount 확인 → 여전히 1
4. Qwen으로 메인브레인 변경
5. 콘솔에서 reloadCount 확인 → 여전히 1
6. 여러 번 메인브레인 변경
7. ✅ reloadCount가 증가하지 않으면 성공!
```

**예상 로그:**
```javascript
[IframeManager] 🎨 CSS DETACH START: chatgpt
[IframeManager] ✅ CSS DETACHED (NO DOM MOVE!): chatgpt
  { method: "CSS_ONLY", reloadCount: 1, noReloadRisk: true }

[IframeManager] 🎨 CSS ATTACH START: qwen
[IframeManager] ✅ CSS ATTACHED (NO DOM MOVE!): qwen
  { method: "CSS_ONLY", reloadCount: 1, noReloadRisk: true }
```

### 5. 그리드 변경 테스트
```
1. 2-grid 선택
2. reloadCount 확인 → 모두 1
3. 3-grid 선택
4. reloadCount 확인 → 모두 1
5. 6-grid 선택
6. reloadCount 확인 → 모두 1
7. ✅ reloadCount가 증가하지 않으면 성공!
```

### 6. 위치/크기 동기화 테스트
```
1. iframe이 정상적으로 표시되는지 확인
2. 브라우저 창 크기 조정
3. iframe이 container에 맞춰 자동 조정되는지 확인
4. 스크롤 시 iframe 위치가 동기화되는지 확인
```

## ✅ 성공 기준

1. **초기 로드**: reloadCount = 1 (모든 봇)
2. **메인브레인 변경**: reloadCount 변화 없음
3. **그리드 변경**: reloadCount 변화 없음
4. **10분 테스트**: 다양한 조작 후에도 reloadCount = 1 유지
5. **UI**: iframe이 정상 표시, 위치/크기 동기화 정상

## 🔴 실패 시 확인 사항

reloadCount가 증가하면:
```javascript
1. 콘솔에서 RELOAD DETECTED 로그 확인
2. 어떤 동작에서 reload가 발생했는지 파악
3. 로그의 parentElement 확인 (appendChild 호출 여부)
4. 해당 코드 섹션 디버깅
```

## 📊 디버깅 명령어

```javascript
// IframeManager 통계 확인
iframeManager.stats()

// 특정 iframe 메타데이터 확인
const manager = (window as any).__mdIframeCache
const chatgptIframe = manager.get('chatgpt')
console.log(chatgptIframe)

// DOM 구조 확인
const container = document.getElementById('md-iframe-global-container')
console.log('Container:', container)
console.log('Children:', container?.children)
```

## 🎉 예상 결과

**BEFORE (appendChild 방식):**
- 메인브레인 변경 1회: reloadCount +1
- 그리드 변경 1회: 모든 봇 reloadCount +1
- 10분 테스트: reloadCount 10+

**AFTER (CSS 방식):**
- 메인브레인 변경 10회: reloadCount = 1 유지
- 그리드 변경 10회: reloadCount = 1 유지
- 1시간 테스트: reloadCount = 1 유지 ✅

---

**테스트 완료 후 이 파일 삭제 예정**
