# 🚀 Grok Webapp 설정 가이드

## ⚠️ 중요: 이 순서를 반드시 따라주세요!

### Step 1: Chrome 확장 프로그램 재설치

#### 1-1. 기존 확장 제거
```
1. Chrome 주소창에 입력: chrome://extensions
2. "Model Dock" 찾기
3. "제거" 버튼 클릭
4. Chrome 완전히 종료 (모든 창 닫기)
```

#### 1-2. Chrome 재시작 후 재설치
```
1. Chrome 다시 실행
2. chrome://extensions 열기
3. 우측 상단 "개발자 모드" ON
4. "압축해제된 확장 프로그램을 로드합니다" 클릭
5. 다음 폴더 선택: /Users/dj20014920/Desktop/model-dock/dist/
6. 확장 프로그램 로드 완료 확인
```

---

### Step 2: ChatGPT 준비

```
1. 새 탭 열기: https://chatgpt.com
2. 로그인 확인 (우측 상단 프로필 아이콘)
3. F12 키 눌러서 개발자 도구 열기
4. "Console" 탭 클릭
5. 다음 로그 확인:
   ✅ [GPT-PROXY] ... (content script가 로드되었다는 의미)
```

**이 탭은 열어둔 채로 유지하세요!**

---

### Step 3: Grok 헤더 캡처 (가장 중요!)

#### 3-1. Grok.com 탭 열기
```
1. 새 탭 열기: https://grok.com
2. 로그인 (X/Twitter 계정으로)
3. 로그인 완료 확인
```

#### 3-2. 개발자 콘솔 열기
```
1. F12 키 눌러서 개발자 도구 열기
2. "Console" 탭 클릭
3. 다음 로그가 보이는지 확인:
   ✅ [GROK-INTERCEPT] ✅ Fetch interceptor installed
```

**👉 이 로그가 보이지 않으면:**
- 페이지 새로고침 (Ctrl+R 또는 Cmd+R)
- 다시 F12 → Console 확인
- 여전히 안 보이면 알려주세요!

#### 3-3. 헤더 캡처 트리거
```
1. Grok.com 채팅창에서 아무 메시지나 입력 (예: "안녕")
2. 전송 버튼 클릭
3. Console에서 다음 로그 확인:
   ✅ [GROK-INTERCEPT] 🎯 Captured Grok API request headers
   ✅ [GROK-INTERCEPT] 📝 Saved headers: x-challenge, x-signature, x-statsig-id, ...
```

**👉 이 로그들이 보여야만 다음 단계로 진행 가능!**

---

### Step 4: Model Dock에서 테스트

```
1. Model Dock 사이드 패널 열기 (Alt+J)
2. 봇 선택: Grok
3. 모드 선택: Webapp
4. 테스트 메시지 입력
5. 전송
```

#### 예상 결과:
```
✅ [GROK-WEB] 🔄 Attempting site proxy fetch...
✅ [INPAGE-GROK] 🔍 Grok request detected, extracting headers...
✅ [INPAGE-GROK] ✅ Headers from intercepted request
✅ [GROK-WEB] 📡 Response status: 200
✅ [GROK-WEB] ✅ Message sent successfully
```

---

## 🔍 문제 해결

### ❌ "Console에 [GROK-INTERCEPT] 로그가 안 보여요"

**원인**: inpage-fetch-bridge.js가 주입되지 않음

**해결**:
```
1. grok.com 탭 새로고침
2. F12 → Console → "Clear console" 버튼 클릭
3. 페이지 다시 로드
4. [GROK-INTERCEPT] ✅ Fetch interceptor installed 로그 확인
```

### ❌ "메시지 보냈는데 헤더 캡처 로그가 안 나와요"

**원인**: fetch 인터셉터가 /rest/app-chat 요청을 감지하지 못함

**해결**:
```
1. F12 → Network 탭 클릭
2. 다시 메시지 보내기
3. Network 탭에서 "app-chat" 검색
4. 해당 요청 클릭 → Headers 탭 확인
5. Request Headers에 x-challenge, x-signature가 있는지 확인
6. 있다면 스크린샷 찍어서 보내주세요
```

### ❌ "Model Dock에서 여전히 403 에러"

**원인**: 캡처된 헤더가 만료됨

**해결**:
```
1. grok.com 탭에서 다시 메시지 1개 보내기
2. Console에서 헤더 캡처 로그 확인
3. Model Dock에서 다시 시도
```

---

## 📸 스크린샷 요청

만약 위 과정에서 문제가 생기면, 다음 스크린샷을 찍어주세요:

1. **grok.com 탭 Console** (F12 → Console)
2. **Model Dock 에러 메시지**
3. **chrome://extensions 페이지** (확장 프로그램 목록)

이 가이드를 따라하시고 결과를 알려주세요!
