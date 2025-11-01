# 🧪 Model Dock - iframe 세션 보존 시스템 수동 테스트 가이드

## 📋 목차
1. [테스트 환경 설정](#1-테스트-환경-설정)
2. [테스트 시나리오](#2-테스트-시나리오)
3. [예상 결과](#3-예상-결과)
4. [문제 발견 시 디버깅](#4-문제-발견-시-디버깅)
5. [성공 기준](#5-성공-기준)

---

## 1. 테스트 환경 설정

### 1.1 확장 프로그램 로드

1. **Chrome 브라우저 열기**
2. **주소창에 입력**: `chrome://extensions/`
3. **우측 상단 "개발자 모드" 활성화** (토글 스위치)
4. **"압축해제된 확장 프로그램을 로드합니다" 클릭**
5. **폴더 선택**: `/Users/dj20014920/Desktop/model-dock/dist`
6. **확장 프로그램 아이콘 확인**: 툴바에 Model Dock 아이콘 표시됨

### 1.2 개발자 도구 열기

테스트 중 콘솔 로그를 확인하기 위해:
1. **확장 프로그램 아이콘 클릭** → Model Dock 창 열림
2. **우클릭** → **검사** 클릭 (또는 `Cmd+Option+I`)
3. **Console 탭** 선택
4. **필터 설정**: 상단 필터에서 `Verbose` 체크 (모든 로그 표시)

### 1.3 초기 상태 확인

테스트 시작 전:
```
✅ 확장 프로그램 로드 성공
✅ 개발자 도구 Console 탭 열림
✅ 아무 모델도 선택되지 않은 상태
✅ 메인브레인 설정 안 됨
```

---

## 2. 테스트 시나리오

### 시나리오 1: 그리드 순회 테스트 (2→3→4→6→2)
**목적**: 그리드 변경 시 iframe 세션이 보존되는지 확인

#### 단계별 절차:

**Step 1: 2개 모델 선택 (2-grid)**
1. 모델 선택: `ChatGPT` + `Claude`
2. ChatGPT에 메시지 입력: "안녕하세요, 저는 테스트 중입니다"
3. Claude에 메시지 입력: "Hello, I am testing"
4. **콘솔 확인**:
   ```
   [MultiBotChatPanel] Active bots: ["chatgpt", "claude"]
   [MultiBotChatPanel] Grid bots: ["chatgpt", "claude"]
   [MultiBotChatPanel] Inactive iframe bots: [qwen, grok, ...]
   ```

**Step 2: 3개 모델로 확장 (3-grid)**
5. 모델 추가 선택: `Gemini`
6. Gemini에 메시지 입력: "Testing 3-grid"
7. **중요**: ChatGPT와 Claude의 이전 메시지가 그대로 보이는지 확인
8. **콘솔 확인**:
   ```
   [MultiBotChatPanel] Active bots: ["chatgpt", "claude", "gemini"]
   [MultiBotChatPanel] Grid bots: ["chatgpt", "claude", "gemini"]
   ```

**Step 3: 4개 모델로 확장 (4-grid)**
9. 모델 추가 선택: `Perplexity`
10. Perplexity에 메시지 입력: "Testing 4-grid"
11. **세션 확인**: ChatGPT, Claude, Gemini의 이전 대화 내용 유지 확인
12. **레이아웃 확인**: 2x2 그리드로 정확히 배치되는지 확인

**Step 4: 6개 모델로 확장 (6-grid)**
13. 모델 추가 선택: `Qwen` + `Grok`
14. Qwen에 메시지 입력: "你好，测试中" (중국어)
15. Grok에 메시지 입력: "Testing 6-grid"
16. **전체 세션 확인**: 6개 모델 모두 이전 대화 내용 보존되는지 확인
17. **레이아웃 확인**: 3x2 그리드로 정확히 배치되는지 확인

**Step 5: 다시 2개 모델로 축소 (2-grid)**
18. 모델 선택 해제: Gemini, Perplexity, Qwen, Grok 제거
19. **세션 확인**: ChatGPT와 Claude의 **최초 Step 1 메시지**가 그대로 보이는지 확인
20. **콘솔 확인**:
    ```
    [MultiBotChatPanel] Inactive iframe bots: ["qwen", "grok"]
    ```
    → Qwen과 Grok이 inactive container에 숨겨져 있어야 함

**Step 6: 다시 6개 모델로 복귀 (6-grid)**
21. 다시 6개 모델 모두 선택
22. **세션 확인**: Qwen의 "你好，测试中" 메시지가 그대로 보이는지 확인
23. **세션 확인**: Grok의 "Testing 6-grid" 메시지가 그대로 보이는지 확인

**예상 결과**:
```
✅ 모든 그리드 변경 시 세션 100% 보존
✅ 2→6→2→6 순회 후에도 모든 메시지 유지
✅ iframe 재로드 없음 (콘솔에 iframe load 로그 없음)
```

---

### 시나리오 2: 메인브레인 설정/해제 테스트
**목적**: 메인브레인 설정 시 레이아웃 변경이 세션에 영향을 주지 않는지 확인

#### 단계별 절차:

**Step 1: 4개 모델 선택 (4-grid)**
1. 모델 선택: `ChatGPT`, `Claude`, `Gemini`, `Perplexity`
2. 각 모델에 테스트 메시지 입력:
   - ChatGPT: "Test A"
   - Claude: "Test B"
   - Gemini: "Test C"
   - Perplexity: "Test D"

**Step 2: 메인브레인 설정**
3. **ChatGPT 우측 상단 ⚙️ 아이콘 클릭** → "Set as Main Brain" 선택
4. **레이아웃 변경 확인**:
   - 좌측: Claude, Gemini, Perplexity (3-grid)
   - 우측: ChatGPT (독립 패널, 400px 너비)
5. **세션 확인**: 4개 모델 모두 이전 메시지 그대로 보이는지 확인
6. **콘솔 확인**:
   ```
   [MultiBotChatPanel] Main brain: chatgpt
   [MultiBotChatPanel] Grid bots: ["claude", "gemini", "perplexity"]
   [MultiBotChatPanel] Active chats: 4
   ```

**Step 3: 메인브레인에 추가 메시지**
7. ChatGPT (메인브레인)에 새 메시지 입력: "I am main brain now"
8. Claude에 새 메시지 입력: "Test B2"

**Step 4: 메인브레인 해제**
9. **ChatGPT 설정 메뉴** → "Unset Main Brain" 선택
10. **레이아웃 확인**: 4개 모델 모두 2x2 그리드로 복귀
11. **세션 확인**:
    - ChatGPT: "Test A" + "I am main brain now" 모두 보임
    - Claude: "Test B" + "Test B2" 모두 보임
    - Gemini: "Test C" 그대로 보임
    - Perplexity: "Test D" 그대로 보임

**Step 5: 다른 모델을 메인브레인으로 설정**
12. **Gemini를 메인브레인으로 설정**
13. **레이아웃 확인**:
    - 좌측: ChatGPT, Claude, Perplexity
    - 우측: Gemini (메인브레인)
14. **세션 확인**: 모든 이전 메시지 유지

**예상 결과**:
```
✅ 메인브레인 설정 시 레이아웃만 변경, 세션 유지
✅ 메인브레인 해제 시 그리드로 복귀, 세션 유지
✅ 메인브레인 변경 시 세션 유지
✅ activeBotIds 불변 (콘솔 로그 확인)
```

---

### 시나리오 3: 메인브레인 변경 테스트
**목적**: 메인브레인을 A → B로 변경해도 세션이 보존되는지 확인

#### 단계별 절차:

**Step 1: ChatGPT를 메인브레인으로**
1. 4개 모델 선택 후 ChatGPT 메인브레인 설정
2. ChatGPT에 메시지: "I am brain A"
3. Claude에 메시지: "Supporting A"

**Step 2: Qwen으로 메인브레인 변경**
4. **Qwen 추가 선택** (5개 모델로 확장)
5. Qwen에 메시지: "你好，我是新的主脑"
6. **Qwen을 메인브레인으로 설정**
7. **ChatGPT 메인브레인 자동 해제 확인**
8. **레이아웃 확인**:
   - 좌측: ChatGPT, Claude, Gemini, Perplexity (4-grid)
   - 우측: Qwen (메인브레인)

**Step 3: 세션 확인**
9. **ChatGPT 확인**: "I am brain A" 메시지 그대로 보임
10. **Qwen 확인**: "你好，我是新的主脑" 메시지 그대로 보임
11. **콘솔 확인**:
    ```
    [MultiBotChatPanel] Main brain changed: chatgpt → qwen
    [MultiBotChatPanel] Active bots: ["chatgpt", "claude", "gemini", "perplexity", "qwen"]
    [MultiBotChatPanel] Grid bots: ["chatgpt", "claude", "gemini", "perplexity"]
    ```

**예상 결과**:
```
✅ 메인브레인 A → B 변경 시 두 모델 모두 세션 유지
✅ 레이아웃 올바르게 재구성
✅ 기존 메인브레인이 그리드로 이동하면서 세션 유지
```

---

### 시나리오 4: 2-grid 메인브레인 레이아웃 테스트
**목적**: 2개 모델에서 메인브레인 설정 시 레이아웃이 올바른지 확인

#### 단계별 절차:

**Step 1: 2개 모델만 선택**
1. 모델 선택: `ChatGPT` + `Claude`
2. 각각 메시지 입력

**Step 2: 메인브레인 설정**
3. **ChatGPT를 메인브레인으로 설정**
4. **레이아웃 확인**:
   - 좌측: Claude (단독, `flex-1` 적용되어 넓게 확장)
   - 우측: ChatGPT (메인브레인, 400px 고정 너비)
5. **Grid 계산 확인**:
   - gridBotIds = ["claude"] (1개)
   - gridLayout = "grid-cols-1" (1열)

**Step 3: 레이아웃 깨짐 확인**
6. **화면 확인**:
   - Claude가 좌측 공간을 꽉 채우는지 확인
   - ChatGPT가 우측에 고정 너비로 표시되는지 확인
   - 빈 공간이나 겹침 없는지 확인

**이전 버그 (v2.0)**:
```
❌ 2-grid에서 메인브레인 설정 시:
   - gridBotIds에 mainBrain도 포함됨 (잘못된 계산)
   - grid-cols-2 적용되어 레이아웃 깨짐
   - 빈 공간 발생 또는 요소 겹침
```

**현재 수정 (v3.0)**:
```
✅ gridBotIds = activeBotIds - mainBrainBotId (정확한 계산)
✅ grid-cols-1 적용 (Claude만 그리드에 표시)
✅ 레이아웃 정상
```

**예상 결과**:
```
✅ 2-grid + 메인브레인 설정 시 레이아웃 정상
✅ 좌측 1개, 우측 1개로 깔끔하게 분리
✅ 세션 유지
```

---

## 3. 예상 결과

### 3.1 모든 시나리오 통합 결과

| 시나리오 | 세션 보존 | 레이아웃 | 콘솔 에러 |
|---------|----------|---------|----------|
| 그리드 순회 (2→6→2) | ✅ 100% | ✅ 정상 | ❌ 없음 |
| 메인브레인 설정/해제 | ✅ 100% | ✅ 정상 | ❌ 없음 |
| 메인브레인 변경 | ✅ 100% | ✅ 정상 | ❌ 없음 |
| 2-grid 메인브레인 | ✅ 100% | ✅ 정상 | ❌ 없음 |

### 3.2 핵심 성공 지표

**세션 보존 확인**:
```
✅ 이전 대화 내용이 그대로 보임
✅ iframe 재로드 없음 (깜빡임 없음)
✅ 입력 중인 텍스트 유지 (테스트 가능)
✅ 스크롤 위치 유지
```

**레이아웃 확인**:
```
✅ 그리드 계산 정확 (grid-cols-N)
✅ 메인브레인 우측 400px 고정
✅ 그리드 영역 flex-1 또는 w-full
✅ 빈 공간 또는 겹침 없음
```

**아키텍처 확인 (콘솔)**:
```
✅ chatMap: 모든 봇의 단일 chat 인스턴스
✅ activeBotIds: 불변 유지
✅ gridBotIds: 정확한 계산 (activeBotIds - mainBrain)
✅ inactiveIframeBotIds: 숨겨진 봇들 관리
```

---

## 4. 문제 발견 시 디버깅

### 4.1 세션이 초기화되는 경우

**증상**:
```
❌ 그리드 변경 후 이전 메시지가 사라짐
❌ iframe이 깜빡이며 재로드됨
```

**디버깅 절차**:

1. **콘솔에서 useChat 호출 확인**:
   ```javascript
   // 검색: "useChat("
   // 예상: MultiBotChatPanel에서만 1회 호출
   // 만약 여러 번 보인다면: 중복 호출 문제
   ```

2. **chatMap 일관성 확인**:
   ```javascript
   // 콘솔에서 실행:
   console.log(chatMap.get('chatgpt') === chatMap.get('chatgpt'))
   // 예상: true (같은 인스턴스)
   ```

3. **activeBotIds 불변성 확인**:
   ```javascript
   // 콘솔 로그 검색: "[MultiBotChatPanel] Active bots:"
   // 메인브레인 설정 시 activeBotIds가 변경되면 안 됨
   ```

4. **iframe DOM 위치 확인**:
   ```javascript
   // 콘솔에서 실행:
   document.querySelectorAll('iframe').length
   // 예상: 모든 iframe 봇 수 (active + inactive)
   ```

### 4.2 레이아웃이 깨지는 경우

**증상**:
```
❌ 빈 공간 발생
❌ 요소가 겹침
❌ 메인브레인이 그리드에 포함됨
```

**디버깅 절차**:

1. **gridBotIds 계산 확인**:
   ```javascript
   // 콘솔 로그 검색: "[MultiBotChatPanel] Grid bots:"
   // 예상: mainBrainBotId가 포함되지 않아야 함
   ```

2. **CSS 클래스 확인**:
   ```javascript
   // 요소 검사 (Inspect)로 확인:
   // - 좌측 컨테이너: "flex-1" 또는 "w-full"
   // - 우측 컨테이너: "w-[400px]", "hidden" (메인브레인 없을 때)
   // - 그리드: "grid-cols-N" (N = gridBotIds.length에 따라)
   ```

3. **activeChats 배열 확인**:
   ```javascript
   // 콘솔 로그 검색: "[MultiBotChatPanel] Active chats:"
   // 예상: gridChats.length + (mainBrainChat ? 1 : 0)
   ```

### 4.3 메인브레인 설정이 안 되는 경우

**증상**:
```
❌ 메인브레인 설정했는데 레이아웃이 안 바뀜
❌ 메인브레인 해제가 안 됨
```

**디버깅 절차**:

1. **chrome.storage 확인**:
   ```javascript
   // 콘솔에서 실행:
   chrome.storage.local.get('mainBrainBotId', (result) => {
     console.log('Stored mainBrainBotId:', result.mainBrainBotId)
   })
   ```

2. **useEffect 실행 확인**:
   ```javascript
   // 콘솔 로그 검색: "[MultiBotChatPanel] Main brain changed:"
   // 이 로그가 안 보이면 useEffect가 실행 안 된 것
   ```

3. **mainBrainBotId 상태 확인**:
   ```javascript
   // React DevTools로 확인:
   // MultiBotChatPanel 컴포넌트의 mainBrainBotId 상태값
   ```

---

## 5. 성공 기준

### 5.1 필수 통과 조건

**🟢 Level 1: 기본 기능**
```
✅ 그리드 2/3/4/6 모두 정상 작동
✅ 메인브레인 설정/해제 가능
✅ 레이아웃 정상 (빈 공간/겹침 없음)
```

**🟢 Level 2: 세션 보존**
```
✅ 그리드 변경 시 세션 100% 유지
✅ 메인브레인 설정/해제 시 세션 유지
✅ iframe 재로드 없음
```

**🟢 Level 3: 엣지 케이스**
```
✅ 2-grid + 메인브레인 레이아웃 정상
✅ 6-grid 전용 모델이 2/3/4 순회 후 세션 유지
✅ 메인브레인 A → B 변경 시 두 모델 모두 세션 유지
```

**🟢 Level 4: 코드 품질**
```
✅ TypeScript 빌드 에러 없음
✅ 콘솔에 경고/에러 없음
✅ 메모리 누수 없음 (장시간 테스트)
```

### 5.2 최종 체크리스트

테스트 완료 후 아래 항목을 모두 체크하세요:

- [ ] **시나리오 1**: 그리드 순회 (2→3→4→6→2→6) 모두 통과
- [ ] **시나리오 2**: 메인브레인 설정/해제 3회 반복 통과
- [ ] **시나리오 3**: 메인브레인 변경 (A→B→C) 통과
- [ ] **시나리오 4**: 2-grid 메인브레인 레이아웃 통과
- [ ] **세션 보존**: 모든 iframe 모델 세션 유지 확인
- [ ] **레이아웃**: 모든 그리드 조합에서 정상 확인
- [ ] **콘솔**: 에러/경고 없음 확인
- [ ] **빌드**: TypeScript 에러 없음 확인
- [ ] **장시간 테스트**: 30분 사용 후 메모리 누수 없음

---

## 📊 테스트 결과 리포트 양식

```markdown
# Model Dock v3.0 테스트 결과

**테스트 일시**: 2025-XX-XX XX:XX
**테스트 환경**: Chrome XXX / macOS XXX

## 시나리오별 결과

### 1. 그리드 순회 테스트
- [ ] PASS / [ ] FAIL
- 문제점: (있을 경우 기술)

### 2. 메인브레인 설정/해제
- [ ] PASS / [ ] FAIL
- 문제점:

### 3. 메인브레인 변경
- [ ] PASS / [ ] FAIL
- 문제점:

### 4. 2-grid 메인브레인 레이아웃
- [ ] PASS / [ ] FAIL
- 문제점:

## 추가 발견 사항
- (기타 버그나 개선점)

## 최종 평가
- [ ] 프로덕션 배포 가능
- [ ] 수정 필요
```

---

## 🎯 결론

이 가이드를 따라 테스트를 진행하면:
1. **모든 엣지 케이스를 커버**하여 숨겨진 버그 발견 가능
2. **단계별 절차**로 정확한 재현 및 검증 가능
3. **디버깅 가이드**로 문제 발생 시 빠른 원인 파악 가능

**테스트 성공 시**:
```
✅ iframe 세션 보존 시스템 완벽 작동
✅ 모든 그리드 조합에서 레이아웃 정상
✅ 메인브레인 기능 완벽 작동
✅ 프로덕션 배포 준비 완료
```

**테스트 실패 시**:
```
❌ 위 디버깅 절차 따라 원인 파악
❌ 콘솔 로그 및 스크린샷 첨부
❌ 개발자에게 리포트 제출
```

---

**문서 버전**: v3.0
**작성일**: 2025-10-31
**작성자**: Claude (SuperClaude v2.0.1)
