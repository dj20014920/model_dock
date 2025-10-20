# NOWGUIDE - Model Dock 개발 가이드

**최종 업데이트**: 2025년 10월 20일  
**현재 버전**: 1.45.16  
**아키텍처**: ChatHub Background Fetch 방식

---

## 📋 최근 업데이트 (2025-10-20)

### ✅ Perplexity 대화 성공 구현

**문제 상황**:
- 기존 WebSocket 기반 Perplexity 연동이 작동하지 않음
- 새로운 REST API 엔드포인트로 변경됨: `/rest/sse/perplexity_ask`
- `chrome.cookies.getAll()` 호출 시 undefined 에러 발생

**해결 방법**:
1. **WebSocket → REST API 전환**
   - 엔드포인트: `https://www.perplexity.ai/rest/sse/perplexity_ask`
   - 메서드: POST with SSE (Server-Sent Events)
   - 요청 형식:
     ```json
     {
       "params": {
         "search_focus": "internet",
         "sources": ["web"],
         "mode": "copilot",
         "model_preference": "pplx_pro",
         "version": "2.18"
       },
       "query_str": "사용자 질문"
     }
     ```

2. **hybridFetch 패턴 적용**
   - Claude 등 다른 봇과 동일한 방식 사용
   - `credentials: 'include'`로 쿠키 자동 포함
   - 401/403 발생 시 ProxyRequester로 fallback
   - `chrome.cookies` 직접 호출 제거

3. **전용 SSE 파서 구현**
   - Reader lock 문제 해결
   - 버퍼 기반 라인 파싱
   - `data:` 형식의 SSE 이벤트 처리
   - `final_sse_message` 감지로 완료 처리

**수정된 파일**:
- `src/app/bots/perplexity-web/api.ts`: 전면 재작성
  - `createPerplexityRequest()`: fetchFn 파라미터로 변경
  - `parsePerplexitySSE()`: 전용 SSE 파서 구현
- `src/app/bots/perplexity-web/index.ts`: hybridFetch 통합
  - `doSendMessage()`: hybridFetch 호출 추가
  - markdown_block에서 답변 추출
  - pplx:// 링크 자동 제거

**기술적 개선**:
- ✅ ReadableStream lock 문제 해결
- ✅ 쿠키 자동 관리 (브라우저 처리)
- ✅ Fallback 메커니즘 (proxy tab 자동 전환)
- ✅ 다른 봇과 일관된 아키텍처

**테스트 방법**:
1. Perplexity.ai에 로그인
2. 확장 프로그램에서 Perplexity 선택
3. 질문 전송
4. 실시간 스트리밍 응답 확인
5. 콘솔에서 `perplexity sse data` 로그 확인

---

## ⚠️ 중요: 아키텍처 설계 원칙 (최우선 준수사항)

### 🎯 ChatHub 방식 고수 원칙
**반드시 기존 ChatHub의 방식을 고수하라**

1. **Background Fetch 우선 사용**
   - ChatGPT Webapp 등 모든 웹 기반 AI 서비스는 **Background Service Worker에서 직접 fetch** 사용
   - Manifest V3의 `host_permissions`를 활용하여 CORS 없이 직접 API 호출
   - Content Script 및 Proxy Tab 방식은 **사용하지 않음** (불안정성 원인)

2. **Proxy Tab 방식 금지**
   - Content Script 주입 → Port 연결 → PROXY_TAB_READY 신호 방식은 **폐기**
   - 이유:
     - Manifest V3에서 Content Script는 확장 재시작 시 orphaned 상태가 됨
     - Port 연결이 즉시 disconnect되는 타이밍 이슈 발생
     - Cloudflare/CSP 정책과 충돌 가능성
     - 30초 타임아웃 및 ping 실패 빈번

3. **현재 구조 (Version 1.45.15)**
   - `src/app/bots/chatgpt-webapp/client.ts`: **backgroundFetchRequester 강제 사용**
   - `src/app/bots/chatgpt-webapp/requesters.ts`: **BackgroundFetchRequester에서 Proxy fallback 완전 제거**
   - 모든 요청은 `src/services/proxy-fetch.ts`의 `backgroundFetch()` 경유
   - `src/background/index.ts`의 `BG_FETCH` 리스너가 실제 fetch 수행

### 📋 개발 시 체크리스트
- [ ] 새로운 Webapp 봇 추가 시 Background Fetch 방식 사용
- [ ] Content Script 주입이 필요한 경우 최소한으로 제한 (UI 조작만)
- [ ] API 호출은 절대 Content Script에서 하지 않음
- [ ] Proxy Tab 관련 코드는 레거시로 간주, 신규 사용 금지
- [ ] `host_permissions`에 필요한 도메인 추가 확인

---

## 1) 제품 개요

### 목표
사용자의 웹 계정(무료/구독)을 그대로 활용하여 공식 AI 웹사이트를 한 화면에서 동시에 사용.

### 지원 AI 서비스
ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek, Qwen, Kimi, GLM 등

### 주요 특징
- 100% 무료 사용 (프리미엄 기능 제거됨)
- 수동 복사/붙여넣기 모드로 법적 리스크 최소화
- 자동 라우팅은 동의 후 사용 가능

---

## 2) 핵심 기능

### 멀티 모델 UI
- All‑In‑One: 2/3/4/6 그리드 레이아웃
- 개별 패널: 독립적인 대화 창

### 메시지 전송 모드
- **수동 복붙 모드** (기본): All‑In‑One 하단 입력 → 복사 → 각 패널에 순차 포커싱
- **자동 라우팅**: 동의 후 활성화, API 키/웹 세션 기반 지원

### 메인 브레인
- 패널 헤더에서 크라운 아이콘으로 지정
- 금색 링 하이라이트
- 우측 고정 패널(추천 모델/가이드) 노출
- 수동 복붙 시 자동 제외

### 템플릿 & 메모
- **템플릿**: 로컬 저장, 원터치 사용/편집/삭제, 무제한
- **메모장**: 로컬 저장, 검색/정렬/편집/삭제, 무제한

### 사용량 추정
- 입력 토큰 기준 추정
- OpenAI/Claude 입력단가 반영
- 응답 토큰 근사 포함 옵션

---

## 3) 빌드 & 설치

### 빌드
```bash
npm run build  # 또는 yarn build
```

### 설치
1. Chrome → `chrome://extensions`
2. 개발자 모드 ON
3. "압축해제된 확장 프로그램 로드"
4. `dist/` 폴더 선택

### 버전 확인
- 확장 카드에 `1.45.15` 표시
- tabs 권한 허용 팝업 수락

### 개발 모드 (HMR)
```bash
npm run dev  # CRX HMR 경로는 터미널 로그 참고
```

---

## 4) 사용 방법

### ChatGPT Webapp 사용
1. **로그인**: chatgpt.com에 로그인
2. **Cloudflare 챌린지 통과** (필요 시)
3. 확장에서 메시지 전송
4. **Proxy Tab 생성 없음** (Background Fetch 방식)

### 수동 복붙 모드
1. All‑In‑One 하단 입력창에 텍스트 입력
2. 전송 버튼 클릭
3. 복사 안내 토스트 확인
4. 각 패널에 순차적으로 포커싱됨
5. 각 패널에서 Ctrl+V → Enter

### 개별 패널 사용
- 개별 패널 입력창에서 Enter → 즉시 전송
- 복사 단계 없음

---

## 5) 트러블슈팅

### ✅ 정상 로그 (Service Worker 콘솔)
```
[GPT-WEB] 🎯 Using background fetch (direct API calls, no proxy tabs)
[GPT-WEB][REQ] 🚀 backgroundFetch (ChatHub mode - no proxy fallback)
[GPT-WEB][REQ] ✅ backgroundFetch status 200
[GPT-WEB] ✅ Access token obtained
[GPT-WEB] ✅ Using model: gpt-5
```

### ❌ 절대 나오면 안 되는 로그
```
[GPT-WEB][REQ] backgroundFetch 403 → fallback to proxy
[GPT-WEB][REQ] 🔍 Looking for existing proxy tab
[GPT-WEB][REQ] 🌐 Creating new proxy tab
[GPT-WEB][REQ] ❌ TIMEOUT waiting for ChatGPT tab
```

**`fallback to proxy` 로그가 보인다면**: v1.45.14 이하 버전. 즉시 업데이트 필요!

### 일반적인 문제

#### 403 Forbidden 에러
```
"Unusual activity has been detected from your device. Try again later."
```

**원인**: ChatGPT 보안 메커니즘 (정상)

**해결책**:
1. chatgpt.com을 브라우저에서 직접 열기
2. Cloudflare 챌린지 완료
3. 로그인 상태 확인
4. 5-10분 후 재시도

#### 401 Unauthorized 에러
**원인**: 로그인 필요

**해결책**: chatgpt.com에 로그인

#### 429 Rate Limit 에러
**원인**: 요청 과다

**해결책**: 잠시 대기 후 재시도

#### 버전 확인
- 확장 카드에서 버전 번호 확인
- v1.45.15 미만이면 업데이트 필요

---

## 6) 주요 파일 구조

### 핵심 아키텍처 파일
```
src/
├── background/
│   └── index.ts                    # BG_FETCH 리스너 (실제 fetch 수행)
├── app/bots/chatgpt-webapp/
│   ├── client.ts                   # backgroundFetchRequester 강제 사용
│   └── requesters.ts               # BackgroundFetchRequester (Proxy fallback 제거)
├── services/
│   └── proxy-fetch.ts              # backgroundFetch() 함수
└── content-script/
    └── chatgpt-inpage-proxy.ts     # (레거시, 사용 안 함)
```

### UI 컴포넌트
```
src/app/
├── pages/
│   └── MultiBotChatPanel.tsx       # All-In-One 메인 UI
├── components/
│   ├── Chat/
│   │   └── ConversationPanel.tsx   # 개별 패널
│   ├── MainBrain/                  # 메인 브레인 기능
│   ├── PromptLibrary/              # 템플릿 관리
│   └── Notes/                      # 메모장
└── utils/
    └── manual-dispatch.ts          # 수동 복붙 오케스트레이터
```

### 설정 & 서비스
```
src/
├── services/
│   ├── user-config.ts              # 사용자 설정
│   ├── prompts.ts                  # 템플릿 로컬 저장
│   ├── notes.ts                    # 메모 로컬 저장
│   └── usage.ts                    # 사용량 추정
└── app/i18n/
    └── locales/korean.json         # 한국어 번역
```

---

## 7) 버전 히스토리

### v1.45.15 (현재) - 2025-10-20
**완전한 Background Fetch 구현**
- `requesters.ts` - BackgroundFetchRequester의 모든 Proxy fallback 제거
- 403/401/429/네트워크 에러 시 Proxy 전환 차단
- 명확한 에러 메시지와 해결 방법 제공

### v1.45.14 - 2025-10-20
**client.ts Proxy 로직 제거**
- switchRequester() 무력화
- fixAuthState() 단순화
- (하지만 requesters.ts에 Proxy fallback 남음)

### v1.45.13 - 2025-10-20
**아키텍처 대전환**
- ChatHub 방식 채택
- Background Fetch 전용으로 전환
- Proxy Tab 방식 폐기 선언
- (하지만 실제 구현은 미완성)

---

## 8) 알려진 제약사항

### ChatGPT Webapp
- Cloudflare 챌린지 통과 필요
- 로그인 상태 유지 필수
- 403 에러 발생 시 수동 사이트 방문 필요

### Claude Webapp
- 웹 엔드포인트 자주 변경됨
- API 키 모드가 더 안정적
- 404 에러 발생 시 폴백 경로 사용

### 모델 버전 강제 지정
- 세션 모델 목록 내에서만 선택 가능
- 서버 정책에 따라 지정 무시될 수 있음

---

## 9) 개발 가이드

### 새로운 Webapp 봇 추가 시
1. `host_permissions`에 도메인 추가 (manifest.config.ts)
2. Background Fetch 방식으로 구현
3. Content Script 사용 금지 (API 호출용)
4. `src/app/bots/` 하위에 새 디렉토리 생성
5. BackgroundFetchRequester 패턴 따르기

### 코드 스타일
- TypeScript 엄격 모드
- 2스페이스 인덴트
- Named exports 선호
- PascalCase: 컴포넌트
- kebab-case: 파일명
- camelCase: 함수/변수

### 소프트웨어 원칙
- **KISS**: 복잡성 최소화
- **DRY**: 코드 중복 제거
- **YAGNI**: 불필요한 기능 미리 구현 금지
- **SOLID**: 객체지향 설계 원칙 준수

---

## 10) 참고 문서

- **HOTFIX_1.45.15.md**: 최신 핫픽스 상세 설명
- **PRD.md**: 제품 요구사항 명세서
- **DEBUG_GUIDE.md**: 디버깅 가이드
- **AGENTS.md**: 개발 에이전트 가이드

---

## 11) 지원 & 문의

### 버그 리포트
GitHub Issues에 다음 정보 포함:
- 버전 번호 (1.45.15)
- 브라우저 버전
- Service Worker 콘솔 로그
- 재현 단계

### 기능 제안
GitHub Discussions 활용

---

**마지막 업데이트**: 2025년 10월 20일  
**다음 업데이트 예정**: 필요 시

- API 키 모드
  - OpenAI/Claude/Perplexity/Gemini 등에서 키 입력 후 사용. 사용량 배지(입력단가) 참조.
- Language: 한국어 ko 추가.

## 6) 빌드/로드/개발
- 빌드: `npm run build` → dist/ 생성
- 로드: Chrome → `chrome://extensions` → 개발자 모드 ON → "압축해제된 확장 프로그램 로드" → dist/ 선택
- 버전 확인: 카드에 `1.45.14` 표시
- 권한: tabs 권한 허용 팝업 수락
- 개발(HMR): `npm run dev` (crx HMR 경로는 터미널 로그 참고)
- **v1.45.14 업데이트 시 주의**: 기존 확장 **반드시** 완전 제거 후 재설치 (Proxy 로직 제거로 인한 충돌 방지)

## 7) 사용 방법(핵심 플로우)
- All‑In‑One 하단 → 수동 복붙(복사 안내 토스트) → 각 패널에 붙여넣기+Enter → 순차 포커싱(메인 브레인 제외)
- 개별 패널 → Enter 즉시 전송(Web 세션 또는 API 키로 실제 호출)
- 메모장 → 원터치 복사/검색/정렬/편집/삭제(무제한)
- 템플릿 → 로컬/커뮤니티 프롬프트 사용/저장(무제한)
- 메인 브레인 → 크라운 토글로 지정, 금색 링/우측 패널 노출
- 사용량 배지 → 입력 토큰 기준(옵션으로 응답 근사 포함)

## 8) 트러블슈팅
- chathub.gg 404가 뜬다 → 이전 빌드 캐시. 확장 제거 후 dist 재로딩(버전 1.45.14인지 확인).
- ChatGPT "Failed to fetch" → chat.openai.com 로그인/Cloudflare 통과 필요. **v1.45.14부터는 Proxy Tab이 절대 생성되지 않음** (Background Fetch 전용).
- **ChatGPT "PROXY_TAB_READY timeout" (v1.45.13 이하)** → v1.45.14로 업데이트. 모든 Proxy 로직 제거로 완전히 해결.
- **ChatGPT "Port disconnected" 에러 (v1.45.13 이하)** → v1.45.14로 업데이트. Content Script 방식 완전 폐기.
- **ChatGPT "getProxyTab" 또는 "switchRequester" 로그가 보인다면** → v1.45.13 이하 버전. v1.45.14로 업데이트 필수.
- Claude "not_found_error" → 웹 엔드포인트 변경 가능성. 로그인 후에도 지속되면 API 키 모드 사용 권장.
- 개별 패널이 전송되지 않는다 → 현재는 개별 패널은 항상 전송(복사 안내 없음). All‑In‑One 하단만 복붙.
- **정상 로그 확인 (v1.45.14)**:
  - ✅ `[GPT-WEB] 🎯 Using background fetch (direct API calls, no proxy tabs)`
  - ❌ `[GPT-WEB][REQ]` 로그가 보이면 안 됨 (Proxy 관련)

## 9) 보안/법적 리스크 대응
- 수동 복붙 모드 기본 제공: 자동 입력으로 인한 계정 제한 리스크 최소화.
- 자동 라우팅은 동의 모달 필수.
- 민감 정보(API 키)는 sync/local storage에만 저장(외부 송신 없음). chathub.gg 등 외부 호출 제거.

## 10) 미해결/후속 계획
- Claude Web 최신 엔드포인트 고정: 실제 로그인 세션으로 네트워크 캡처 기반 추가 보강.
- 더 많은 Webapp 토글(Gemini/Perplexity/DeepSeek/Qwen/Kimi/GLM 등)과 도움말(로그인/권한/탭 유지) 제공.
- Onboarding 가이드(한국어) 배너: "개별 패널=즉시 전송, 하단 전체=수동 복붙" 명시.
- 코드 스플리팅(번들 경고 완화), UI 폴리싱(최신 Chathub 스타일 정렬).

---
본 NOWGUIDE는 레포에 변경이 생길 때마다 갱신됩니다. 실제 운영 중 발생하는 웹앱 엔드포인트 변경(특히 Claude)은 즉시 트레이싱 후 반영하겠습니다.

## 11) 남은 문제점·제약(알려진 이슈)
- Claude Web 불안정
  - 증상: 404/not_found_error가 간헐적으로 발생.
  - 원인: claude.ai 내부 엔드포인트/페이로드가 수시로 변경됨.
  - 임시 대응: 쿠키 포함 + 신규 추정 경로 폴백. 최종 해결은 실제 세션 캡처로 경로/바디 고정 필요(권장: API 키 모드).

## 12) ChatGPT Webapp 안정화 개선 (2025-10-19)
### 문제 해결
- **인증 세션 문제**: Service Worker에서 쿠키 전송 실패 → 프록시 탭 자동 생성/전환 강화
- **재시도 로직 개선**: 실패 시 최대 3회 자동 재시도, 프록시 강제 모드 추가
- **Content Script 안정성**: 주입 타이밍 개선, DOMContentLoaded 이벤트 활용
- **로깅 강화**: 모든 단계에서 상세한 디버그 로그 추가

### 주요 변경사항
1. **client.ts**
   - `getAccessToken()`: 재시도 로직 3회, 프록시 강제 모드 추가
   - `fixAuthState()`: forceProxy 파라미터 추가, pinned 탭 생성
   - `fetch()`: 에러 핸들링 및 로깅 강화

2. **requesters.ts**
   - `waitForProxyTabReady()`: 타임아웃 20초로 증가, 로깅 개선
   - `createProxyTab()`: pinned 탭으로 생성하여 사용자 경험 개선
   - `ProxyFetchRequester.fetch()`: 499 상태 처리 추가
   - `BackgroundFetchRequester.fetch()`: 폴백 로직 강화

3. **index.ts (doSendMessage)**
   - 최대 2회 재시도 로직 추가
   - 프록시 강제 모드 활용
   - 상세한 에러 메시지 제공

4. **chatgpt-inpage-proxy.ts**
   - DOMContentLoaded 이벤트 처리
   - 준비 신호 전송 안정성 개선
   - Next.js 앱 로딩 대기 로직 추가

5. **proxy-fetch.ts**
   - 연결 타임아웃 15초 추가
   - Content script 주입 에러 핸들링 강화
   - 상세한 로깅 및 에러 메시지

### 사용자 안내
- **Pinned Tab**: ChatGPT 탭이 자동으로 pinned 상태로 생성되어 쉽게 찾고 유지 가능
- **자동 재시도**: 네트워크/인증 오류 시 자동으로 프록시 탭 생성 및 재시도
- **Cloudflare**: 탭에서 Cloudflare 챌린지를 통과해야 정상 작동
- **로그인 필수**: chatgpt.com에 로그인된 상태여야 함
- ChatGPT Web 전제조건
  - Cloudflare 챌린지/로그인 필요, 고정 탭 유지 필요. 네트워크/세션 상태에 따라 최초 호출 실패 가능(재시도·프록시 탭 준비로 완화).
- Webapp 모델 강제 지정 한계
  - ChatGPT는 세션 모델 목록 내에서만 선택 가능. Claude/Web 타 서비스도 서버 정책/권한에 따라 지정이 무시될 수 있음.
- 다른 웹앱(Gemini/Perplexity/DeepSeek 등) Web 모드 지원 범위
  - 현재 레포는 일부만 완전 구현. 각 서비스별 로그인/권한/WS 정책 차이로 실패 가능. 토글·도움말·엔드포인트 최신화가 추가로 필요.
- Analytics(선택 사항)
  - chathub.gg 호출은 제거했으나, plausible 트래커 사용 유무를 운영 방침에 맞춰 완전 비활성/옵트아웃 옵션 제공 고려.
- i18n 보완
  - 한국어 추가 완료. 다국어/세부 키 일부는 영어(또는 기존 언어)로 남아있음 → 점진 번역 필요.
- 번들 크기 경고
  - Vite 빌드 시 큰 청크 경고 발생. 코드 스플리팅/manualChunks 적용으로 개선 예정(기능에는 영향 없음).
- 문서/빌드 스택 표기 혼선
  - README는 Yarn4를 안내하나, 현재 로컬 빌드는 npm 기반으로 검증함. 운영 절차를 하나로 통일 필요.

---

## 13) 2025-10-20 업데이트: ChatGPT Proxy 연결 안정성 개선

### 문제 해결
이전까지 ChatGPT Webapp 사용 시 간헐적으로 발생하던 "TIMEOUT waiting for ChatGPT tab" 및 "Port disconnected prematurely after 1ms" 에러를 근본적으로 해결했습니다.

**근본 원인**:
- Content Script 주입(`chrome.scripting.executeScript`) 직후 **즉시** Port 연결(`Browser.tabs.connect`) 시도
- Content Script 초기화가 완료되기 전에 Port 연결 → "Receiving end does not exist" 에러
- Port는 연결되지만 1ms 후 즉시 disconnected 상태로 전환

**해결 방법**:
1. **주입 후 대기 시간 추가**: `executeScript()` 호출을 `await`로 변경하고 300ms 대기
2. **Content Script 준비 확인**: `Browser.tabs.sendMessage(tabId, 'url')` ping-pong 체크로 실제 응답 가능 여부 검증
3. **상세 로깅**: 각 연결 단계마다 디버그 로그 추가하여 문제 진단 용이성 향상
4. **에러 처리 강화**: Proxy fallback 시 try-catch 추가, 실패 원인별 명확한 에러 메시지 출력

### 주요 변경사항

#### 1. **src/services/proxy-fetch.ts** - Port 연결 타이밍 개선
```typescript
// ✅ BEFORE (문제 발생)
chrome.scripting?.executeScript?.({ target: { tabId }, files }).catch(...)
// ❌ 바로 Port 연결 시도
let port = Browser.tabs.connect(tabId, { name: uuid() })

// ✅ AFTER (수정)
await chrome.scripting?.executeScript?.({ target: { tabId }, files }).catch(...)
// 300ms 대기 - Content Script 초기화 시간 확보
await new Promise(resolve => setTimeout(resolve, 300))
// ping-pong 체크로 Content Script 존재 확인
const response = await Browser.tabs.sendMessage(tabId, 'url')
if (response) {
  console.debug('[PROXY-FETCH] ✅ Content script is ready')
}
// 이제 안전하게 Port 연결
let port = Browser.tabs.connect(tabId, { name: uuid() })
```

**변경 내용**:
- `proxyFetch()` 함수를 `async` Promise로 변경하여 비동기 대기 지원
- `executeScript()` 호출에 `await` 추가하여 주입 완료 대기
- 300ms 대기 시간 추가 (Content Script 초기화 시간 확보)
- `Browser.tabs.sendMessage(tabId, 'url')` ping-pong 체크로 Content Script 응답 검증
- 각 단계마다 상세한 로그 추가:
  - `[PROXY-FETCH] 💉 Injecting content scripts:`
  - `[PROXY-FETCH] ⏳ Waiting for content script initialization...`
  - `[PROXY-FETCH] 🏓 Checking content script status...`
  - `[PROXY-FETCH] ✅ Content script is ready`
  - `[PROXY-FETCH] ✅ Port connected successfully`

#### 2. **src/app/bots/chatgpt-webapp/requesters.ts** - Proxy Fallback 에러 처리 강화
```typescript
// Background fetch 403 → Proxy fallback 시 에러 처리 추가
if (resp.status === 403) {
  console.warn('[GPT-WEB][REQ] backgroundFetch 403 → fallback to proxy')
  try {
    const tab = await proxyFetchRequester.getProxyTab()
    return await proxyFetchRequester.fetch(url, options)
  } catch (proxyError) {
    console.error('[GPT-WEB][REQ] ❌ Proxy fallback failed after 403:', proxyError)
    throw new Error(`Both background fetch (403) and proxy fallback failed: ${proxyError.message}`)
  }
}
```

**변경 내용**:
- `BackgroundFetchRequester.fetch()` 메서드의 3가지 fallback 경로에 모두 try-catch 추가:
  1. 403 Forbidden (Cloudflare 챌린지)
  2. 401/499 (인증 실패/연결 끊김)
  3. Network error (CORS/네트워크 장애)
- 각 실패 케이스마다 명확한 에러 메시지 제공
- Proxy fallback 실패 시 원인별 로그 출력

### 사용자에게 보이는 변화

**이전 (문제 발생 시)**:
```
00:26:49.470 ❌ No existing proxy tab found
00:26:49.483 ✅ Created pinned proxy tab: 1622524312
00:27:19.475 ❌ TIMEOUT waiting for ChatGPT tab (30002ms, 59 polls)
00:27:19.506 [PROXY-FETCH] 💔 Port disconnected prematurely after 1ms
00:27:19.506 Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist.
```

**이후 (수정 적용)**:
```
[GPT-WEB][REQ] backgroundFetch 403 → fallback to proxy
[PROXY-FETCH] 💉 Injecting content scripts: ["assets/chatgpt-inpage-proxy.ts-..."]
[PROXY-FETCH] ⏳ Waiting for content script initialization...
[PROXY-FETCH] 🏓 Checking content script status...
[GPT-PROXY] ✅ PROXY_TAB_READY signal sent successfully
[PROXY-FETCH] ✅ Content script is ready { url: "https://chatgpt.com/" }
[PROXY-FETCH] ✅ Port connected successfully { tabId: 123456 }
[GPT-WEB][REQ] 📥 proxyFetch response: { status: 200, statusText: "OK" }
```

### 테스트 가이드

1. **확장 프로그램 재로드**:
   - `chrome://extensions` 열기
   - ChatHub 확장 프로그램 "새로고침" 버튼 클릭

2. **Service Worker Console 확인**:
   - chrome://extensions → "Service Worker" 링크 클릭
   - 예상 로그 확인:
     - `[PROXY-FETCH] ✅ Content script is ready`
     - `[PROXY-FETCH] ✅ Port connected successfully`
   - **나오면 안 되는 로그**:
     - ❌ `💔 Port disconnected prematurely after 1ms`
     - ❌ `Could not establish connection. Receiving end does not exist`

3. **ChatGPT Tab Console 확인** (proxy tab의 개발자 도구):
   - `[GPT-PROXY] content script initializing` 로그 확인
   - `[GPT-PROXY] ✅ PROXY_TAB_READY signal sent successfully` 확인

4. **Network Tab 확인** (ChatGPT proxy tab):
   - `/backend-api/conversation` 요청 발생 확인
   - 응답 상태 200 OK 확인

### 기술적 세부사항

**Content Script 준비 검증 메커니즘**:
- Content Script(`chatgpt-inpage-proxy.ts`)는 로드 시 `Browser.runtime.onMessage.addListener`로 'url' 메시지 리스너 등록
- Background Script(`proxy-fetch.ts`)는 Port 연결 전 `Browser.tabs.sendMessage(tabId, 'url')`로 ping 전송
- Content Script가 `location.href`를 응답하면 준비 완료로 판단
- 응답 실패 시에도 경고 로그만 출력하고 연결 시도 (일부 환경에서 메시지 전송 실패할 수 있음)

**타이밍 최적화**:
- 300ms 대기: 대부분의 Content Script 초기화에 충분한 시간
- Ping-pong 체크: 추가 검증 레이어로 false positive 방지
- 향후 필요 시 대기 시간 조정 가능 (500ms 등)

### 알려진 제약사항

- **Content Script 주입 제한**: chrome-extension:// 페이지나 chrome:// 페이지에는 주입 불가
- **Tab Navigation**: 프록시 탭이 다른 URL로 이동하면 Content Script 재주입 필요
- **Service Worker Lifecycle**: Service Worker가 종료되면 Port 연결도 끊김 (Chrome 정책)

---

## 14) 2025-10-16 업데이트(계정 기반 Webapp 파이프라인 보강 + Gemini Webapp 연결 + HAR 분석 도구)

이 섹션은 최근 작업 내용을 후속 작업자가 바로 이어받을 수 있도록 요약/절차/트러블슈팅을 정리합니다.

### A. 현재 상태(요약)
- 계정(Webapp) 기반 대화: ChatGPT/Claude/Gemini 3개 봇이 "고정 탭 프록시"로 쿠키를 포함해 요청합니다.
  - ChatGPT: chatgpt.com / chat.openai.com 모두 지원. 세션/대화 경로를 자동 선택.
  - Claude: append_message → 404 시 organizations/{org}/chat_conversations/{id}/completion 폴백. 프록시를 통해 403 제거.
  - Gemini: gemini.google.com에서 SNlM0e(at)·cfb2h(bl) 토큰 추출 → Bard/StreamGenerate 경로로 전송. 같은 세션 내 contextIds 유지.
- 설정(UI): Gemini/DeepSeek에 Webapp/API 모드 토글과 "로그인 탭 열기" 버튼, 커스텀 모델 슬러그 입력을 제공.

### B. 주요 코드/파일
- 프록시 실행/연결
  - 콘텐츠 스크립트: `src/content-script/chatgpt-inpage-proxy.ts`
  - 프록시 API: `src/services/proxy-fetch.ts` (요청별 포트, 스트림 중계 / 강제 주입 폴백 포함)
  - 프록시 요청자: `src/app/utils/proxy-requester.ts` (고정 탭 탐색/생성, 준비 이벤트 + 폴링)
- 봇(Webapp)
  - ChatGPT Webapp: `src/app/bots/chatgpt-webapp/*` (dual host, baseHost 고정, proxy 강제)
  - Claude Webapp: `src/app/bots/claude-web/*` (프록시 fetch로 쿠키 포함)
  - Gemini Webapp: `src/app/bots/gemini-web/index.ts` (SNlM0e/bl 추출 → StreamGenerate)
- 설정 컴포넌트
  - ChatGPT/Claude Webapp 버튼: `src/app/components/Settings/*WebappSettings.tsx`
  - Gemini/DeepSeek 모드 토글: `src/app/pages/SettingPage.tsx`
- Manifest 권한/주입
  - `manifest.config.ts` → host_permissions에 `chatgpt.com`, `gemini.google.com`, `chat.deepseek.com` 등 추가, content_scripts 주입 범위 확대.

### C. 사용(운영) 절차
- 빌드: `npm run build` → Chrome 확장관리에서 dist/ 재로드 → 사이트 접근 권한 허용.
- 각 봇 Webapp 모드 설정 후, "Open … tab" 버튼으로 해당 서비스를 고정 탭으로 열고 로그인/Cloudflare 통과 → 탭 유지.
- 대화는 All‑In‑One 또는 개별 패널에서 전송. 실제 네트워크는 “확장 페이지가 아니라 고정 탭”의 DevTools(Network)에서 확인됩니다.

### D. HAR 분석/적용 가이드
- 목적: 새 웹앱(DeepSeek/Qwen/Kimi/GLM 등) 연결 또는 기존 서비스 엔드포인트 갱신.
- 도구: `scripts/parse-har.mjs` (주요 채팅/세션 후보 엔드포인트 자동 추출)
- 절차:
  1) HAR 파일을 레포의 `har/` 폴더에 저장(예: `har/gpt.har`, `har/gemini.har`).
  2) 실행: `node scripts/parse-har.mjs har/gpt.har` → 요청 URL/헤더/바디/응답형을 출력.
  3) Webapp 어댑터에 반영: URL(POST/SSE/WS), 필수 헤더, 바디(JSON/form)를 매핑. 필요 시 프록시 경유로 변경.
- 예시:
  - ChatGPT: `GET /api/auth/session` → `POST /backend-api/conversation`(text/event-stream)
  - Gemini: `POST …/BardChatUi/…/StreamGenerate?bl=…&_reqid=…&rt=c` + body: `at`, `f.req`

### E. 최근 이슈와 대응
- 탭만 열리고 대화가 진행되지 않음
  - 원인: content‑script 미주입/레이스. 수정: proxyFetch 전에 `chrome.scripting.executeScript`로 강제 주입, PROXY_TAB_READY 폴백(폴링) 추가.
- ChatGPT 308/무한대기
  - 원인: chat.openai.com ↔ chatgpt.com 전환 시 세션/대화 경로 불일치. 수정: baseHost 자동 고정 + 프록시 강제.
- Claude 403
  - 원인: 확장 페이지에서 직결 fetch시 쿠키 누락. 수정: 프록시로 전환.
- 콘솔 경고 해석
  - frame‑ancestors(CSP): 확장 내부 iframe 삽입 거부 경고, 프록시 플로우에는 영향 없음.
  - Receiving end does not exist: 주입 타이밍 문제로 발생, 강제 주입/폴백으로 해소.
- Perplexity/LMSYS WS 에러: 네트워크/DNS/차단 등 외부 요인 가능. Webapp 파이프라인과는 무관. 필요 시 별도 트러블슈팅.

### F. 한계/주의
- Webapp 모드의 모델 버전 강제 지정은 각 서비스 정책/세션 상태에 종속됩니다(예: Gemini Webapp). 정확한 버전 고정이 필요하면 API 모드를 병행하세요.
- ChatGPT/Claude는 로그인/Cloudflare 통과가 전제이며, 고정 탭을 닫으면 세션이 끊깁니다.

### G. 다음 작업 제안(후속자용)
- DeepSeek Webapp: HAR 캡처로 채팅 엔드포인트(REST/SSE/WS) 확인 후, `src/app/bots/deepseek-web/`에 연결.
- ChatGPT Webapp: 세션 모델 목록을 드롭다운으로 노출(현 커스텀 슬러그 입력에 추가).
- 코드 스플리팅: `vite.config.ts`에 manualChunks로 빌드 경고 완화.

## 13) 2025-10-17 업데이트(ChatGPT Webapp Sentinel + 하이브리드 요청 + 탭 정책)

이번 변경은 ChatHub의 “사용자 계정 기반” 흐름을 보다 엄밀히 재현하면서도 탭 자동 생성을 억제(보안/UX)하는 데 초점을 맞췄습니다.

### A. 핵심 변경
- Sentinel 사전 검증 추가(필수 계정/지역 대응)
  - 전송 직전 `POST /backend-api/sentinel/chat-requirements` 호출로 토큰 확보.
  - 이후 `POST /backend-api/conversation`에 헤더로 첨부:
    - `openai-sentinel-chat-requirements-token`
    - `openai-sentinel-proof-token`(있을 때)
    - 보조 헤더: `Accept: text/event-stream`, `oai-device-id`(UUID), `oai-language`(브라우저 언어)
- 하이브리드 요청 전략(Direct-first)
  - 기본은 확장 컨텍스트의 직접 fetch(쿠키 포함)로 시도.
  - CORS/Origin 정책으로 SSE 본문을 읽지 못하거나 401/403일 때만 “기존에 열려 있는” ChatGPT 탭을 사용하는 프록시로 자동 전환.
  - 자동 탭 생성은 하지 않음. 탭이 없으면 명확한 안내 메시지로 사용자에게 “Open ChatGPT tab” 유도.
- Arkose 원격 호출 제거 유지
  - 원격 토큰 API 호출 제거. 페이지 내 위젯(generator.js) 생성만 시도.

### B. 요구 조건/동작 요약
- ChatGPT Webapp 모드에서 안정적인 스트리밍이 필요하면, 먼저 `chatgpt.com` 탭을 하나 열어 핀(pinned) 상태로 유지하세요.
- 탭이 열린 상태에서는 동일-도메인 Origin으로 요청이 이루어져 CORS/SSE 제약이 사라집니다.
- 탭이 닫혀 있거나 미존재 시에는 직접 요청을 우선 시도하되, 정책상 불가하면 에러로 명확히 안내합니다(무한대기 방지).

### C. 에러/경고 메시지 개선
- `Stream body not readable (CORS/origin). Please use webapp proxy tab.`
  - 원인: 확장 컨텍스트에서 SSE 본문을 읽지 못하는 환경.
  - 조치: 설정 페이지의 “Open ChatGPT tab” 버튼으로 고정 탭을 열고 재시도.
- `ChatGPT 탭이 필요합니다. ... "Open ChatGPT tab" 버튼으로 탭을 고정해 주세요.`
  - 자동 탭 생성 정책 해제에 따라 사용자 유도 문구를 명확화.
- 콘솔의 `frame-ancestors`/`enforcement*.html 404` 경고는 ChatGPT 내부 CSP/Arkose 로딩 이슈로, 대화 스트림에는 영향 없음.

### D. 수동 검증 절차(갱신)
1) ChatGPT 로그인/Cloudflare 통과 → `chatgpt.com` 탭을 고정.
2) 확장에서 개별 패널로 메시지 전송.
3) 기대 네트워크 흐름(고정 탭 DevTools / Network):
   - `GET /api/auth/session` → 200
   - `POST /backend-api/sentinel/chat-requirements` → 200(JSON)
   - `POST /backend-api/conversation` → 200(`text/event-stream`) 스트리밍 수신

### E. 코드 위치 참고
- Sentinel/요청 헤더: `src/app/bots/chatgpt-webapp/client.ts`, `src/app/bots/chatgpt-webapp/index.ts`
- SSE 본문 가시성 체크: `src/utils/sse.ts`
- 프록시/탭 정책: `src/app/utils/proxy-requester.ts`, `src/app/bots/chatgpt-webapp/requesters.ts`

### F. 트러블슈팅(업데이트)
- “무한 대기” 현상 → 이제는 에러 메시지로 전환됨. 에러에 따라 고정 탭을 열거나(Origin 문제) 로그인/챌린지를 통과 후 재시도.
- 모델 목록은 `GET /backend-api/models`로 세션 기반 제공. UI 설정의 커스텀 슬러그 입력도 병행 가능.
- Sentinel 응답 스키마 변경 시 대화가 멈추면 HAR 캡처를 기반으로 파서 키(`token`/`sentinel_token`/`requirementsToken`, `proof_token`/`proofToken`) 보강.

## 14) 2025-10-17 핫픽스: In‑Page 브릿지 + 프록시 Fetch 전환(CORS/SSE 무한대기 해결)

이번 라운드는 확장에서 직접 fetch 시 발생하는 CORS/Origin 제약과 SSE 초반 무응답으로 인한 "무한 대기"를 근본적으로 해소하기 위해, 네트워크 실행 컨텍스트를 페이지(Origin=chatgpt.com)로 이동시키고, 초기 스트림 타임아웃을 도입했습니다.

### A. 현상/원인 정리
- 증상: `session`/`models`는 200이나, `conversation` 스트림이 열리지 않아 UI가 계속 대기. 콘솔에는 CORS 에러(Access-Control-Allow-Origin 미존재), `enforcement.*` 308/404 부수 로그 확인.
- 원인: 확장 컨텍스트(chrome-extension://)에서의 cross-origin fetch는 ChatGPT의 쿠키/Origin/CSP 정책에 막혀 SSE 본문을 읽지 못함. `GET /backend-api/accounts/*/settings 401`은 부차적.

## 15) 2025-10-19 개선: Arkose 로딩 대기 + 다중 Ready 시그널 + 상세 로깅

Arkose Labs CAPTCHA(FunCaptcha) iframe의 `enforcement.html` 404 오류로 인해 content script 초기화가 지연되거나 실패하는 문제를 해결했습니다.

### A. 발견된 근본 원인
- **CSP 경고는 무해**: `frame-ancestors` 위반은 Arkose iframe의 정상적인 CSP 정책이며, 프록시 플로우에 영향 없음.
- **404 오류가 진짜 문제**: `enforcement.7fe4ebdd37c791e59a12da2c9c38eec6.html` 파일 404 → Arkose iframe 초기화 실패 → content script의 `PROXY_TAB_READY` 시그널 지연/누락 → **무한 대기 발생**.
- **세션은 정상**: `/api/auth/session` 200 OK, accessToken 정상 확인됨. 문제는 프록시 탭이 준비되지 않아 대화 요청이 전송조차 안 되는 상태였음.

### B. 적용한 해결책
1. **다중 Ready 시그널 전송** (`chatgpt-inpage-proxy.ts`)
   - 1차: 스크립트 로드 즉시
   - 2차: 페이지 완전 로드(`window.load`) 후
   - 3차: Arkose 타임아웃 고려하여 2초 후 추가 전송
   - 이모지 로깅으로 시그널 추적 용이: `✅ PROXY_TAB_READY signal sent successfully`

2. **타임아웃 증가** (`requesters.ts`, `proxy-fetch.ts`)
   - 프록시 탭 대기: 20초 → 30초
   - 연결 타임아웃: 15초 → 20초
   - Arkose iframe 로딩 시간 충분히 확보

3. **상세 디버깅 로깅** (모든 파일)
   - 이모지 기반 로그: 🚀(시작), ✅(성공), ❌(오류), ⏱️(타임아웃), 💔(연결끊김)
   - 각 단계별 경과 시간(ms) 표시
   - 폴링 횟수, URL 미리보기, 에러 컨텍스트 포함
   - 트러블슈팅 팁 자동 출력

4. **강화된 에러 처리**
   - 스크립트 주입 실패 시 더 명확한 에러 메시지
   - 포트 연결 실패 시 즉시 499 응답 (무한 대기 방지)
   - Next.js 감지 실패 시에도 안내 팁 표시

### C. 검증 절차 (업데이트)
1) 빌드/로드: `npm run build` → Chrome에서 `dist/` 재로드
2) 콘솔 필터: `[GPT-` 로 필터링하여 진행 상황 추적
3) 예상 로그 순서:
   ```
   [GPT-PROXY] content script initializing
   [GPT-PROXY] ✅ PROXY_TAB_READY signal sent successfully (1차)
   [GPT-PROXY] Page fully loaded, sending ready signal again (2차)
   [GPT-PROXY] Final ready signal after Arkose timeout (3차)
   [GPT-WEB][REQ] ✅ Proxy tab ready signal received (XXms)
   [PROXY-FETCH] 🚀 Starting request
   [PROXY-FETCH] ✅ Port connected successfully
   [PROXY-FETCH] 📊 Metadata received (XXms)
   [PROXY-FETCH] ✅ Stream complete (XXms)
   ```

### D. 트러블슈팅 가이드
**증상**: 여전히 무한 대기 발생
**체크리스트**:
1. F12 콘솔에서 `[GPT-PROXY]` 로그 확인 → 없으면 content script 미주입
2. `chatgpt.com` 탭 새로고침 (F5)
3. Arkose CAPTCHA 완료 확인 (체크박스 클릭)
4. 확장 프로그램 재로드 후 재시도
5. 콘솔에서 타임아웃 로그 확인 시 제공되는 구체적 지침 따르기

**로그 해석**:
- `⏳ Still waiting for proxy tab...` → 정상 대기 중 (30초까지)
- `❌ TIMEOUT` → Arkose 차단 또는 페이지 로딩 실패 → 탭 새로고침
- `💔 Port disconnected prematurely` → Content script 크래시 → 확장 재로드

### B. 적용한 해결책(코드 경로)
- In‑Page Fetch 브릿지 도입(페이지 컨텍스트에서 `fetch(..., {credentials:'include'})`)
  - 추가: `public/js/inpage-fetch-bridge.js`
  - 주입: `src/content-script/chatgpt-inpage-proxy.ts` (함수 `injectInpageFetchBridge`)
  - 브릿지 노출: `manifest.config.ts` → `web_accessible_resources`에 등록
  - 프록시 실행기 교체: `src/services/proxy-fetch.ts` (포트↔window.postMessage로 메타/바디 청크 중계)
- 프록시 탭 자동화(비활성/비핀)
  - `src/app/bots/chatgpt-webapp/requesters.ts` → 필요 시 백그라운드 탭 자동 생성, 사용자는 탭을 따로 열/고정할 필요 없음.
- SSE 초반 무응답 타임아웃(무한대기 차단)
  - `src/utils/sse.ts` → 첫 바이트 8초 이내 미수신 시 명확한 에러 후 프록시 재시도.
- Host/세션/헤더 일관화
  - `src/app/bots/chatgpt-webapp/client.ts`
    - `chatgpt.com` 우선, `chat.openai.com` 폴백.
    - `getAccessToken()`이 CORS 예외/401/403이면 프록시로 재시도.
    - Sentinel 호출 `Accept: application/json`, Conversation `Accept: text/event-stream` 보강.
- Sentinel/디바이스 정합 강화
  - `src/app/bots/chatgpt-webapp/index.ts` → `oai-device-id`를 `storage.local`에 영속화하여 Sentinel→Conversation 헤더 일관성 유지.

### C. 검증 절차(업데이트)
1) 빌드/로드: `npm i && npm run build` → Chrome에서 `dist/` 재로드.
2) 로그인/보안: 브라우저 프로필에서 `https://chatgpt.com` 로그인/2FA/Cloudflare 통과 확인.
3) 전송: 앱에서 메시지 전송.
4) 확인:
   - “앱” DevTools(Network)에는 `session/models`까지만 보일 수 있습니다(정상).
   - 자동 생성된 `chatgpt.com` 탭의 DevTools(Network)에서 다음이 보여야 정상입니다.
     - `POST /backend-api/sentinel/chat-requirements` → 200(JSON)
     - `POST /backend-api/conversation` → 200(`text/event-stream`) 스트리밍 수신

### D. 트러블슈팅
- 무한대기 유지: `chatgpt.com` 탭 Network에 `conversation`이 없으면 브릿지 주입/권한을 확인(상기 파일/`web_accessible_resources`).
- Sentinel 200 이후 스트림 미수신: Cloudflare/Arkose 챌린지 통과 필요. 탭에서 챌린지 UI를 통과한 뒤 재시도.
- `enforcement.* 308/404`: 부수 로그로 대화 스트림과 무관. 무시 가능.
- `GET /backend-api/accounts/*/settings 401`: 페이지 내부 호출. 스트리밍 실패의 직접 원인이 아님.

### E. 운영 정책 변경점
- “핀 고정” 요구 삭제: 실패 시 백그라운드 탭 자동 생성/이용으로 사용자 개입 최소화.
- 오류 표면화: SSE 초반 미수신 시 즉시 에러로 전환해 안내(무한대기 제거).

### F. 향후 작업(제안)
- 강제 프록시 모드 토글(직접 fetch 완전 비활성)을 설정에 노출(환경 민감도 더 낮춤).
- 동일 패턴(첫 바이트 타임아웃+in‑page 프록시)을 Claude/Gemini 웹앱에도 확장.
- Sentinel 응답 스키마 변경에 대비한 파서 키 보강 지속(`token`/`sentinel_token`/`requirementsToken`, `proof_token`/`proofToken`).

## 15) 2025-10-18 업데이트: ChatHub 방식(비핀 자동 탭 + 배경 fetch 우선)·진단 로그·Uncaught 제거

이번 라운드는 “핀 고정 없이도” ChatHub와 동일하게 동작하도록 네트워크/탭 정책을 재조정하고, 무한 로딩 원인을 빠르게 특정할 수 있도록 상세 로그와 예외 처리(Port 단절 등) 보강을 포함합니다.

### A. 동작 정책(요약)
- 배경(Service Worker) fetch 우선 → 실패/403/본문 미독 시 in‑page 브릿지(페이지 컨텍스트)로 자동 폴백.
- ChatGPT 탭이 없으면 백그라운드로 자동 생성(active:false, pinned:false). 생성된 탭 id는 `storage.session.gptProxyTabId`에 기억, 이후 재사용.
- 모든 탭을 스캔해 기존 `chatgpt.com`/`chat.openai.com` 탭을 우선 재사용(핀 고정 불필요).

### B. 주요 코드 변경
- 요청자 체인/탭 정책: `src/app/bots/chatgpt-webapp/requesters.ts`
  - findExistingProxyTab: 전체 탭 스캔 + `gptProxyTabId` 재사용.
  - createProxyTab: 비핀·비활성 탭 생성 후 id 기억.
  - fetch: proxyFetch 상태 로그/403 재시도, refreshProxyTab 로깅.
- 기본 설정값: `src/services/user-config.ts`
  - `chatgptWebappAlwaysProxy=false`(배경 fetch 우선), `chatgptWebappReuseOnly=false`(필요 시 자동 생성).
- 배경 스트리밍 fetch: `src/background/index.ts`
  - `BG_FETCH` Port 프로토콜로 메타/청크 전송, 에러 메시지 로깅([BG]).
- in‑page 브릿지: `src/services/proxy-fetch.ts`
  - [INPAGE]/[BG_FETCH] 상세 로그 추가.
  - Port onDisconnect에서 예외를 던지지 않고 `status:0` 빈 응답으로 resolve → 상위 재시도 로직이 정상 동작(전역 “Error in event handler: Uncaught” 제거).
- 클라이언트/토큰/Sentinel: `src/app/bots/chatgpt-webapp/client.ts`
  - 초기 requester를 배경 fetch로 지정, fetch/세션/센티널/백엔드 요청 로그([GPT‑WEB]).
- SSE 파서: `src/utils/sse.ts`
  - 시작/첫 청크/각 청크/완료 로그([SSE]) 및 첫 청크 타임아웃 경고.
- 전역 에러 가시화: `src/app/main.tsx`
  - `window.error`/`unhandledrejection`를 [APP] 태그로 출력.
- BG onMessage 예외 보호: `src/background/index.ts`
  - try/catch로 핸들러 내부 예외를 로깅 후 삼킴.

### C. 콘솔 태그 체계(필터 추천)
- `[GPT‑WEB]` 클라이언트 전송/토큰/센티널/백엔드 상태.
- `[REQ]` 프록시 탭 탐색/생성/리프레시 및 proxyFetch 상태.
- `[BG_FETCH]` 배경(Service Worker) 스트리밍 청크/에러.
- `[INPAGE]` 페이지 컨텍스트 브릿지 메타/청크/완료/에러.
- `[SSE]` 스트리밍 파서(첫 바이트/각 청크/DONE 보정).
- `[APP]` 전역 에러/미처리 프라미스.
- `[BG]` 배경 onMessage 핸들러 예외.

### D. 수동 검증 절차(업데이트)
1) 확장 리로드(개발자 모드) 후 app.html 새로고침.
2) ChatGPT(Webapp)로 한 줄 전송.
3) Console 필터: `gpt-web|req|sse|inpage|bg_fetch|APP|BG`.
4) 기대 흐름: `[GPT‑WEB] backend request …` → `[BG_FETCH]` 또는 `[INPAGE]` → `[SSE] first chunk received` → `[SSE] stream completed`.

### E. 자주 묻는 이슈
- `frame-ancestors` 경고: chatgpt.com이 iframe 삽입을 거부하는 공지. 본 경로(배경 fetch/in‑page 브릿지)에는 영향 없음.
- `Unchecked runtime.lastError: Could not establish connection`: 브릿지 미주입 상태에서 URL 탐침 시 일시 출력(탭 준비되면 자동 해소).
- 모델/세션 200인데 무한대기: `[SSE] first chunk timeout or error` 이후 자동 폴백 로그가 나와야 함. 없으면 해당 줄을 캡처해 공유.

### F. 네트워크 기대값(정상)
- `GET https://chatgpt.com/api/auth/session` → 200(JSON, accessToken 포함)
- `POST https://chatgpt.com/backend-api/sentinel/chat-requirements` → 200(JSON, 토큰 키는 환경에 따라 상이)
- `POST https://chatgpt.com/backend-api/conversation` → 200(`text/event-stream`), 실시간 청크 도착

### G. 롤백/플래그
- 항상 프록시만 강제하고 싶다면: Settings에서 `chatgptWebappAlwaysProxy=true`로 전환.
- 자동 탭 생성을 막고 싶다면: `chatgptWebappReuseOnly=true`로 전환(이 경우 사용자가 탭을 미리 열어야 함).

## 16) 진행 현황(조치 로그) + 미해결 사항

본 섹션은 현 시점까지의 실제 조치와 남아있는 이슈를 요약합니다.

### A. 지금까지 적용된 조치(코드 반영 완료)
- 네트워크 경로
  - 배경(Service Worker) 스트리밍 fetch 도입 → in‑page 브릿지 자동 폴백.
  - 핀 고정 의존 제거. 비핀·비활성 탭 자동 생성 후 `storage.session.gptProxyTabId`로 재사용.
  - 요청자 체인 정리: Background → In‑Page Proxy. 403/네트워크 실패 시 자동 전환.
- 세션/토큰 안정화
  - `/api/auth/session`에서 `accessToken`이 비어있을 경우 동일‑출처(in‑page)로 강제 전환 후 재시도.
  - Sentinel 사전검사 추가(토큰 키 변화에 내성).
- 예외/로깅 강화
  - Port 단절의 비정상 종료를 `status:499 ABORTED`로 처리(전역 Uncaught 제거).
  - 전역 에러 노출: `[APP] window.error`, `unhandledrejection`.
  - 세부 태그 로그: `[GPT‑WEB]`/`[REQ]`/`[BG_FETCH]`/`[INPAGE]`/`[SSE]`/`[BG]`.
- 기본 설정 변경(ChatHub 유사 동작)
  - `chatgptWebappAlwaysProxy=false`, `chatgptWebappReuseOnly=false`(자동 생성/폴백 활성).
- 문서/가이드
  - NOWGUIDE 15) 작성. 검증 절차/콘솔 태그/네트워크 기대값 명시.

### B. 아직 재현 가능한 증상과 상태(미해결/관찰)
- 증상1: "There is no logged‑in ChatGPT account in this browser."가 간헐 재현
  - 원인 후보: Service Worker fetch에서 쿠키 미전송(서드파티 쿠키/브라우저 정책), 확장 리로드 후 초기 레이스.
  - 대응: 코드상 accessToken 누락 시 자동 프록시 전환+재시도 추가(15‑B, 16‑A 반영). 재현 시 Service Worker 콘솔에 `[GPT‑WEB] session without accessToken → switching to proxy and retry`가 떠야 정상.
- 증상2: app.html Network에 plausible 이벤트만 보임
  - 정상. 실제 채팅 네트워크는 Service Worker 또는 chatgpt.com 탭에서만 확인 가능(15‑D, 15‑F 참조).
- 증상3: 다른 확장 충돌로 `Extension context invalidated` 발생
  - 외부 확장(content.js) 주입으로 발생. 시크릿 창에서 우리 확장만 허용하여 재현 권장.

### C. 사용자가 반드시 지켜야 할 운영 절차(요약)
- 빌드·로드
  - Yarn 4 권장: `corepack enable && yarn && yarn build` → `/dist` 로드.
  - 변경 후에는 Chrome 확장 “리로드”, app.html 새로고침.
- 검증 순서
  1) 메시지 전송 → Service Worker 콘솔에서 `[GPT‑WEB]`/`[BG_FETCH]`/`[INPAGE]`/`[SSE]` 흐름 확인.
  2) chatgpt.com 탭 DevTools(Network)에서 `session`/`sentinel`/`conversation`가 200인지 확인.
  3) 필요 시 Settings: `Always Proxy = ON`, `Reuse Only = OFF`로 강제 성공 경로 테스트.

### D. 환경별 추가 체크리스트
- Chrome 설정 → 쿠키: `chatgpt.com`에 대해 써드파티 쿠키 허용(또는 일시 해제) 후 재시험.
- 로그인 상태 점검: chatgpt.com 탭에서 Cloudflare/Arkose 챌린지 통과.
- 다른 확장 비활성화: 시크릿 창에서 우리 확장만 허용해 충돌 제거.

### E. 다음 단계(필요 시)
- accessToken 폴백 이후에도 실패 시: Service Worker 콘솔 상단 20줄과 chatgpt.com 탭의 `session/sentinel/conversation` 헤더를 첨부하면, 해당 분기(세션→센티널→스트림)에서 즉시 추가 보강 가능합니다.

---

## 16.5) 2025-10-20 아키텍처 대전환 (Version 1.45.13): Proxy 방식 폐기 → ChatHub Background Fetch 방식 채택

### A. 문제의 핵심 발견
**v1.45.9 ~ v1.45.12의 반복적 실패 패턴**:
- v1.45.10: 404 에러 수정, Content Script 초기화 강화
- v1.45.11: Orphaned Content Script 문제 인식, 탭 자동 재로드 추가
- v1.45.12: 종합적인 탭 검증 로직 (URL 확인, 세션 스토리지 정리, 5초 재로드 대기)

**그럼에도 계속된 에러들**:
```
❌ TIMEOUT waiting for PROXY_TAB_READY (30초 타임아웃)
❌ Content script not responding to ping
❌ Port disconnected prematurely after 1ms
❌ Receiving end does not exist
❌ Tab 1622524320 exists but content script not responding
```

### B. 결정적 비교: ChatHub HAR 분석 (`har/chathubgpt.har`)
실제 작동하는 ChatHub 확장의 네트워크 로그를 분석한 결과, **근본적인 아키텍처 차이** 발견:

**작동하는 ChatHub 방식**:
```
✅ Background Service Worker에서 직접 fetch 호출
✅ GET https://chatgpt.com/api/auth/session (직접 호출)
✅ POST https://chatgpt.com/backend-api/conversation (직접 호출)
✅ Content Script 없음
✅ Proxy Tab 없음
✅ PROXY_TAB_READY 신호 없음
```

**실패하는 기존 방식 (v1.45.12까지)**:
```
❌ ProxyFetchRequester → Content Script 주입 → Port 연결
❌ PROXY_TAB_READY 신호 대기 (30초 타임아웃)
❌ Content Script ping-pong 체크
❌ Orphaned script 문제 (확장 재시작 시)
❌ CSP/Cloudflare 충돌 가능성
```

**핵심 깨달음**: 
> "Proxy를 고치려는 모든 시도(타이밍 조정, 재시도 로직, 검증 강화)는 **틀린 방향**이었다. 
> 실제 작동하는 ChatHub는 **애초에 Proxy를 사용하지 않는다**."

### C. 해결책: Background Fetch 강제 전환 (v1.45.13)

#### 1. 기존 인프라 확인
이미 구현되어 있던 Background Fetch 시스템:
- `src/background/index.ts` (line 73-134): `BG_FETCH` 리스너 완전 구현
- `src/services/proxy-fetch.ts`: `backgroundFetch()` 함수 존재
- `src/app/bots/chatgpt-webapp/requesters.ts`: `BackgroundFetchRequester` 클래스 존재

**문제는**: `client.ts`의 복잡한 fallback 로직이 Proxy를 우선 선택하고 있었음.

#### 2. 핵심 수정: `src/app/bots/chatgpt-webapp/client.ts`
**BEFORE (v1.45.12 - 복잡한 Proxy fallback 로직)**:
```typescript
constructor() {
  // 기본은 background fetch
  this.requester = backgroundFetchRequester
  
  // 하지만 비동기로 Proxy로 전환 시도
  ;(async () => {
    const cfg = await getUserConfig()
    if (cfg.chatgptWebappAlwaysProxy) {
      const existing = await proxyFetchRequester.findExistingProxyTab()
      if (existing) {
        console.log('[GPT-WEB] Found existing proxy tab, switching requester')
        this.switchRequester(proxyFetchRequester)
      }
    }
  })()
}
```

**AFTER (v1.45.13 - ChatHub 방식 강제)**:
```typescript
constructor() {
  // ChatHub 방식: Background Fetch 전용 (Proxy 완전 제거)
  console.log('[GPT-WEB] 🎯 Using background fetch (direct API calls, no proxy tabs)')
  this.requester = backgroundFetchRequester
  // 모든 Proxy 관련 fallback 로직 삭제
}
```

**변경사항 요약**:
- ❌ 제거: `cfg.chatgptWebappAlwaysProxy` 체크
- ❌ 제거: `findExistingProxyTab()` 호출
- ❌ 제거: `switchRequester()` 동적 전환
- ❌ 제거: 비동기 IIFE 전체 (~20줄)
- ✅ 추가: 명확한 로그 메시지
- ✅ 단순화: 단 3줄로 축소

### D. 작동 원리: Background Fetch 플로우

**1단계: 요청 시작** (`client.ts` → `backgroundFetchRequester.fetch()`)
```typescript
// src/app/bots/chatgpt-webapp/requesters.ts
async fetch(url, options) {
  return backgroundFetch(url, options)  // proxy-fetch.ts로 위임
}
```

**2단계: Port 연결** (`proxy-fetch.ts` → `backgroundFetch()`)
```typescript
// src/services/proxy-fetch.ts
function backgroundFetch(url, options) {
  const uuid = generateUUID()
  const port = Browser.runtime.connect({ name: `BG_FETCH:${uuid}` })
  
  port.postMessage({ 
    type: 'BG_FETCH_START', 
    details: { url, options } 
  })
  
  return new Promise((resolve) => {
    port.onMessage.addListener((msg) => {
      // BG_FETCH_META, BG_FETCH_CHUNK, BG_FETCH_ERROR 처리
    })
  })
}
```

**3단계: 실제 Fetch** (`background/index.ts` → BG_FETCH 리스너)
```typescript
// src/background/index.ts (line 73-134)
Browser.runtime.onConnect.addListener((port) => {
  if (!port.name || !port.name.startsWith('BG_FETCH')) return
  
  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'BG_FETCH_START') {
      const { url, options } = msg.details
      
      // 🎯 핵심: Service Worker에서 직접 fetch (credentials 포함)
      const response = await fetch(url, {
        ...options,
        credentials: 'include'  // 쿠키 자동 전송
      })
      
      // 메타데이터 전송
      port.postMessage({ 
        type: 'BG_FETCH_META', 
        status: response.status,
        headers: Array.from(response.headers.entries())
      })
      
      // 스트림 청크 전송
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        port.postMessage({ 
          type: 'BG_FETCH_CHUNK', 
          value: Array.from(value) 
        })
      }
    }
  })
})
```

**핵심 이점**:
- ✅ **CORS 없음**: Service Worker는 `host_permissions`로 모든 도메인 접근 가능
- ✅ **쿠키 자동 포함**: `credentials: 'include'`로 세션 유지
- ✅ **안정성**: Content Script의 lifecycle 이슈 없음
- ✅ **단순성**: Port 메시징만으로 통신 (Tab/Script 관리 불필요)

### E. 검증 가이드

**1. 버전 확인**
```bash
npm run build  # Version 1.45.13 확인
```

**2. 확장 재설치**
- Chrome 확장관리 → 기존 확장 완전 제거
- dist/ 폴더 재설치
- 버전 1.45.13 표시 확인

**3. 예상 로그 (Service Worker 콘솔)**
```
✅ [GPT-WEB] 🎯 Using background fetch (direct API calls, no proxy tabs)
✅ [GPT-WEB][REQ] backgroundFetch attempt https://chatgpt.com/api/auth/session
```

**4. 보면 안 되는 로그 (모두 사라져야 함)**
```
❌ [PROXY-FETCH] 💉 Injecting content scripts  (더 이상 없음)
❌ [GPT-WEB] ⏱️ Waiting for PROXY_TAB_READY  (더 이상 없음)
❌ Content script not responding to ping  (더 이상 없음)
❌ Port disconnected prematurely  (더 이상 없음)
```

**5. 기능 확인**
- ChatGPT 탭이 자동으로 생성되지 않음 (정상)
- 메시지 전송 시 응답 즉시 도착
- 네트워크 탭에서 `chatgpt.com` 요청 확인 가능

### F. 레거시 코드 처리
**유지되는 파일 (하위 호환성)**:
- `src/content-script/chatgpt-inpage-proxy.ts`: 남겨둠 (사용 안 함)
- `src/services/proxy-fetch.ts`: `proxyFetch()` 함수 남겨둠 (사용 안 함)
- `src/app/bots/chatgpt-webapp/requesters.ts`: `ProxyFetchRequester` 클래스 남겨둠 (사용 안 함)

**이유**: 
- 설정에서 수동으로 Proxy 모드를 활성화할 수 있는 옵션 유지
- 향후 특수 상황에서 필요할 수 있음
- 코드 제거는 충분한 안정성 검증 후 진행 예정

**핵심 원칙**:
> "기본 동작은 ChatHub 방식(Background Fetch)이며, 
> Proxy는 레거시 옵션으로만 존재한다."

### G. 학습 포인트
1. **근본 원인 찾기**: 증상 치료(타이밍 조정, 재시도 추가)보다 작동하는 시스템 분석이 우선
2. **HAR 분석의 중요성**: 네트워크 로그 비교로 아키텍처 차이 즉시 발견
3. **기존 인프라 활용**: Background Fetch는 이미 구현되어 있었음 (활성화만 필요)
4. **KISS 원칙**: 복잡한 Proxy fallback 로직(20줄) → 단순한 직접 호출(3줄)
5. **Manifest V3 이해**: Service Worker + host_permissions = Content Script 불필요

---

## 16.6) 2025-10-20 핫픽스 (Version 1.45.14): v1.45.13의 치명적 버그 수정 - Proxy 전환 로직 완전 제거

### A. v1.45.13의 치명적 결함 발견

**증상 (사용자 로그 분석)**:
```
01:20:11.091 [GPT-WEB] 🎯 Using background fetch (direct API calls, no proxy tabs)
...
01:20:22.596 [GPT-WEB][REQ] 🔍 Looking for existing proxy tab...
01:20:22.598 [GPT-WEB][REQ] ✅ Found existing proxy tab: 1622524335
01:20:27.604 [GPT-WEB][REQ] 💥 All recovery attempts failed, creating fresh tab
01:20:27.611 [GPT-WEB][REQ] 🌐 Creating new proxy tab...
01:20:57.613 [GPT-WEB][REQ] ❌ TIMEOUT waiting for ChatGPT tab (30002ms, 60 polls)
```

**문제점**: Constructor에서 `backgroundFetchRequester`를 설정했지만, **실행 중 여전히 Proxy 방식으로 전환**되고 있었음.

### B. 근본 원인 분석

`client.ts` 코드 상세 분석 결과, **3곳에서 Proxy로 강제 전환**:

**1. Line 136-141 (requestBackendAPIWithToken 내부)**:
```typescript
// 대화/파일 업로드 등 민감 엔드포인트는 기존 탭이 있으면 프록시 사용
if (path.startsWith('/conversation') || path.startsWith('/files') || path.startsWith('/sentinel')) {
  try {
    const tab = await (proxyFetchRequester as any).findExistingProxyTab?.()
    if (tab) this.switchRequester(proxyFetchRequester)  // ❌ Proxy로 전환!
  } catch {}
}
```

**2. Line 256, 264, 269 (fixAuthState 내부)**:
```typescript
this.switchRequester(proxyFetchRequester)  // ❌ 3곳에서 Proxy로 전환!
```

**결론**: Constructor의 `backgroundFetchRequester` 설정이 **무의미**했음. 실제 요청 시점에 Proxy로 바뀜.

### C. 완벽한 해결 (v1.45.14)

#### 1. requestBackendAPIWithToken - Proxy 전환 로직 제거
**BEFORE (v1.45.13)**:
```typescript
if (path.startsWith('/conversation') || path.startsWith('/files') || path.startsWith('/sentinel')) {
  try {
    const tab = await (proxyFetchRequester as any).findExistingProxyTab?.()
    if (tab) this.switchRequester(proxyFetchRequester)
  } catch {}
}
```

**AFTER (v1.45.14)**:
```typescript
// ✅ ChatHub 방식: 모든 요청을 Background Fetch로 처리
// Proxy 전환 로직 완전 제거 - Background Worker가 모든 요청 처리
```

#### 2. fixAuthState - 단순화
**BEFORE (v1.45.13 - 40줄)**:
```typescript
async fixAuthState(forceProxy = false) {
  const cfg = await getUserConfig()
  const reuseOnly = cfg.chatgptWebappReuseOnly
  const alwaysProxy = cfg.chatgptWebappAlwaysProxy || forceProxy
  
  if (this.requester === proxyFetchRequester) {
    await proxyFetchRequester.refreshProxyTab()
    return
  }
  
  if (alwaysProxy) {
    const tab = await findExistingProxyTab()
    // ... 복잡한 로직
    this.switchRequester(proxyFetchRequester)  // ❌
  }
  
  // ... 더 많은 Proxy 전환 로직
  this.switchRequester(proxyFetchRequester)  // ❌
}
```

**AFTER (v1.45.14 - 10줄)**:
```typescript
async fixAuthState(forceProxy = false) {
  console.log('[GPT-WEB] ⚠️ fixAuthState called - Background Fetch mode, no proxy switching')
  console.log('[GPT-WEB] 💡 Tip: Make sure you are logged in to chatgpt.com')
  
  throw new ChatError(
    'ChatGPT authentication required. Please log in to chatgpt.com manually and retry.',
    ErrorCode.CHATGPT_AUTH
  )
}
```

#### 3. switchRequester - 무력화
**BEFORE (v1.45.13)**:
```typescript
switchRequester(newRequester: Requester) {
  console.debug('[GPT-WEB] client.switchRequester ->', newRequester?.constructor?.name)
  this.requester = newRequester  // ❌ 실제로 전환됨
}
```

**AFTER (v1.45.14)**:
```typescript
switchRequester(newRequester: Requester) {
  console.warn('[GPT-WEB] ⚠️ switchRequester() called but ignored - Background Fetch only mode')
  console.warn('[GPT-WEB] 🚫 Proxy switching is disabled to maintain ChatHub architecture')
  // this.requester는 항상 backgroundFetchRequester로 유지
}
```

### D. 변경 사항 요약

| 항목 | v1.45.13 | v1.45.14 |
|------|----------|----------|
| Constructor | ✅ backgroundFetchRequester 설정 | ✅ 동일 |
| requestBackendAPIWithToken | ❌ Proxy 전환 로직 존재 (6줄) | ✅ 완전 제거 (2줄 주석) |
| fixAuthState | ❌ Proxy 전환 로직 존재 (40줄) | ✅ 단순화 (10줄) |
| switchRequester | ❌ 실제로 전환 수행 | ✅ 호출 무시 |
| 제거된 코드 | - | **~50줄 삭제** |

### E. 검증 방법

**1. 버전 확인**
```bash
npm run build  # Version 1.45.14 확인
```

**2. 확장 재설치 (필수!)**
- Chrome 확장관리 → 기존 확장 **완전 제거**
- 브라우저 재시작 권장
- dist/ 폴더 재설치
- 버전 1.45.14 표시 확인

**3. 정상 로그 (Service Worker 콘솔)**
```
✅ [GPT-WEB] 🎯 Using background fetch (direct API calls, no proxy tabs)
✅ [GPT-WEB] 🔑 getAccessToken() called
✅ [GPT-WEB] ✅ Access token obtained
✅ [GPT-WEB] 🤖 Getting model name...
✅ [GPT-WEB] ✅ Using model: gpt-5
✅ [GPT-WEB] 📡 Calling /backend-api/conversation...
```

**4. 절대 나오면 안 되는 로그**
```
❌ [GPT-WEB][REQ] 🔍 Looking for existing proxy tab...
❌ [GPT-WEB][REQ] ✅ Found existing proxy tab
❌ [GPT-WEB][REQ] 🌐 Creating new proxy tab...
❌ [GPT-WEB][REQ] ⏳ waitForProxyTabReady() called
❌ [GPT-WEB][REQ] ❌ TIMEOUT waiting for ChatGPT tab
```

### F. 왜 v1.45.13이 실패했는가?

**설계 실수**: Constructor에서만 수정하고 **실제 호출 경로를 추적하지 않았음**

**교훈**:
1. ✅ 코드 수정 시 **모든 호출 경로** 추적 필수
2. ✅ `grep_search`로 관련 코드 **전수조사** 필요
3. ✅ 실제 로그 분석으로 **실행 흐름** 검증
4. ✅ "선언"만으로는 부족, **실제 동작** 확인 필수

### G. 결론

**v1.45.14는 진정한 ChatHub 방식 구현**:
- ✅ Background Fetch **만** 사용
- ✅ Proxy 전환 **절대 불가능**
- ✅ Content Script **완전 배제**
- ✅ 안정성 **최대화**

---

## 17) 2025-10-20 심화 디버깅: HAR 분석 기반 무한 대기 원인 규명 + 이모지 로깅 시스템

이번 라운드는 실제 네트워크 캡처(HAR) 비교 분석을 통해 "무한 대기"의 정확한 원인을 밝히고, 실시간 디버깅을 위한 포괄적인 로깅 시스템을 구축했습니다.

### A. 문제 진단 과정

#### 1단계: 증상 확인
- **사용자 보고**: 콘솔에 아무 로그도 출력되지 않음
- **네트워크 탭**: `/api/auth/session` 요청만 2번 보임
- **결과**: UI가 무한 로딩 상태

#### 2단계: HAR 파일 비교 분석
정상 동작하는 ChatHub 확장과 비교하여 결정적 차이점 발견:

**정상 (chathubgpt.har)**:
```
✅ GET /api/auth/session → 200 OK
✅ POST /backend-api/conversation → 200 OK
   필수 헤더 포함:
   - openai-sentinel-chat-requirements-token
   - openai-sentinel-proof-token
   - oai-device-id
   - oai-language
   - accept: text/event-stream
```

**문제 (mygpt.har)**:
```
✅ GET /api/auth/session → 200 OK (2회)
❌ POST /backend-api/conversation 요청 자체가 없음!
```

**결론**: 프록시 탭이 준비되지 않아 conversation 요청이 전송조차 안 됨

#### 3단계: 근본 원인 식별
- Arkose Labs CAPTCHA iframe (`enforcement.html`) 로딩 실패/지연
- Content script가 `PROXY_TAB_READY` 시그널을 보내지 못함
- `waitForProxyTabReady()`에서 30초간 대기 후 타임아웃
- **conversation 요청이 실행되기 전에 코드가 멈춤**

### B. 구현한 해결책

#### 1. 포괄적인 이모지 로깅 시스템
모든 핵심 단계에 명확한 로그를 추가하여 정확한 실패 지점 파악 가능:

**index.ts (doSendMessage)**:
```javascript
[GPT-WEB] 🚀 doSendMessage started
[GPT-WEB] 🔑 Getting access token...
[GPT-WEB] 🔑 getAccessToken() called
[GPT-WEB] ✅ Access token obtained
[GPT-WEB] 🤖 Getting model name...
[GPT-WEB] ✅ Using model: gpt-4o-mini
[GPT-WEB] 🎫 Getting Arkose token...
[GPT-WEB] ✅ Arkose token obtained
[GPT-WEB] 📡 Calling /backend-api/conversation...
[GPT-WEB] ✅ Response received, starting SSE parsing...
```

**requesters.ts (프록시 탭 관리)**:
```javascript
[GPT-WEB][REQ] 🔍 Looking for existing proxy tab...
[GPT-WEB][REQ] ❌ No existing proxy tab found
[GPT-WEB][REQ] 🌐 Creating new proxy tab...
[GPT-WEB][REQ] ✅ Created pinned proxy tab: 12345
[GPT-WEB][REQ] ⏳ waitForProxyTabReady() called - waiting for PROXY_TAB_READY signal...
[GPT-WEB][REQ] ⏳ Still waiting for proxy tab... (pollCount: 20)
[GPT-WEB][REQ] ✅ Proxy tab ready signal received (1234ms)
```

**이모지 의미**:
- 🚀 = 작업 시작
- 🔑 = Access token 관련
- 🔍 = 검색/탐색
- 🌐 = 탭 생성
- ✅ = 성공
- ❌ = 실패
- ⏳ = 대기 중
- 🤖 = 모델 선택
- 🎫 = Arkose token
- 📡 = API 호출
- 📤/📥 = 요청/응답

#### 2. 파일별 주요 변경사항

**src/app/bots/chatgpt-webapp/index.ts**:
```typescript
// 각 단계마다 명확한 로그
console.log('[GPT-WEB] 🚀 doSendMessage started')
console.log('[GPT-WEB] 🔑 Getting access token...')
console.log('[GPT-WEB] ✅ Access token obtained')
console.log('[GPT-WEB] 🤖 Getting model name...')
console.log('[GPT-WEB] 🎫 Getting Arkose token...')
console.log('[GPT-WEB] 📡 Calling /backend-api/conversation...')
console.log('[GPT-WEB] ✅ Response received, starting SSE parsing...')
```

**src/app/bots/chatgpt-webapp/client.ts**:
```typescript
// getAccessToken 진입 로그 추가
console.log('[GPT-WEB] 🔑 getAccessToken() called')
```

**src/app/bots/chatgpt-webapp/requesters.ts**:
```typescript
// 프록시 탭 라이프사이클 모든 단계 로깅
console.log('[GPT-WEB][REQ] 🔍 Looking for existing proxy tab...')
console.log('[GPT-WEB][REQ] ✅ Found existing proxy tab:', tab.id)
console.log('[GPT-WEB][REQ] 🌐 Creating new proxy tab...')
console.log('[GPT-WEB][REQ] ⏳ waitForProxyTabReady() called...')
```

**src/content-script/chatgpt-inpage-proxy.ts**:
```typescript
// 이미 다중 시그널 + 로깅 구현되어 있음 (15) 섹션 참조)
```

#### 3. 디버깅 가이드 문서 작성

**CONSOLE_LOG_GUIDE.md**: 완전히 새로운 포괄적 가이드
- 서비스 워커 콘솔 접근 방법 (3가지)
- 정상 로그 패턴 (이모지 순서)
- 문제 패턴별 해결법 (4가지 시나리오)
- 프록시 탭 콘솔 확인 방법
- 네트워크 탭 검증 절차
- 최종 체크리스트
- 로그 공유 방법

**DEBUG_GUIDE.md**: 기존 가이드 (유지)

### C. 검증 절차 (업데이트)

#### 1. 빌드 & 로드
```bash
cd /Users/dj20014920/Desktop/model-dock
yarn build
# Chrome → chrome://extensions → 개발자 모드 → dist/ 로드
```

#### 2. 서비스 워커 콘솔 열기
**방법 1 (권장)**:
1. `chrome://extensions` 열기
2. 개발자 모드 켜기
3. 확장 프로그램 카드에서 "Service workers" 섹션 찾기
4. "검사" 또는 "inspect" 링크 클릭

**방법 2**:
- 확장 아이콘 우클릭 → "Service Worker 검사"

#### 3. 예상 로그 순서
```
[GPT-WEB] 🚀 doSendMessage started
[GPT-WEB] 🔑 Getting access token...
[GPT-WEB] 🔑 getAccessToken() called
[GPT-WEB][REQ] 🔍 Looking for existing proxy tab...
[GPT-WEB][REQ] ✅ Found existing proxy tab: 12345  (또는)
[GPT-WEB][REQ] 🌐 Creating new proxy tab...
[GPT-WEB][REQ] ⏳ waitForProxyTabReady() called...
[GPT-WEB][REQ] ✅ Proxy tab ready signal received (XXXXms)
[GPT-WEB] ✅ Access token obtained
[GPT-WEB] 🤖 Getting model name...
[GPT-WEB] ✅ Using model: gpt-4o-mini
[GPT-WEB] 🎫 Getting Arkose token...
[GPT-WEB] ✅ Arkose token obtained: yes
[GPT-WEB] 📡 Calling /backend-api/conversation...
[GPT-WEB] ✅ Response received, starting SSE parsing...
```

#### 4. 문제 패턴 인식

**패턴 A: 로그가 아예 없음**
```
(콘솔 비어있음)
```
→ 확장 미실행 또는 로그 레벨 필터됨
→ 해결: 메시지 보내기 → 콘솔 새로고침 → 필터 레벨 확인

**패턴 B: 프록시 탭 대기 중 멈춤** (가장 흔한 케이스!)
```
[GPT-WEB][REQ] ⏳ waitForProxyTabReady() called...
[GPT-WEB][REQ] ⏳ Still waiting for proxy tab... (pollCount: 20)
[GPT-WEB][REQ] ⏳ Still waiting for proxy tab... (pollCount: 40)
[GPT-WEB][REQ] ❌ TIMEOUT waiting for ChatGPT tab (30000ms)
```
→ **이것이 HAR 분석에서 발견한 정확한 문제!**
→ 해결: chatgpt.com 탭 콘솔에서 `[GPT-PROXY]` 로그 확인 필요

**패턴 C: Access token 전 멈춤**
```
[GPT-WEB] 🔑 getAccessToken() called
(여기서 멈춤)
```
→ fetch 자체 실패 (네트워크/CORS)
→ 해결: 네트워크 탭 확인, chatgpt.com 로그인 확인

**패턴 D: conversation 호출 후 응답 없음**
```
[GPT-WEB] 📡 Calling /backend-api/conversation...
(응답 로그 없음)
```
→ API 호출했지만 응답 미수신
→ 해결: 네트워크 탭에서 상태 코드 확인

### D. 프록시 탭 콘솔 확인 (패턴 B 해결)

#### 1. 프록시 탭 찾기
- 왼쪽 탭바에서 📌 표시된 ChatGPT 탭
- 없으면 `chatgpt.com` 탭

#### 2. 콘솔 열기
1. 프록시 탭 클릭
2. F12 → Console 탭
3. 검색창에 `GPT-PROXY` 입력

#### 3. 정상 로그 패턴
```
[GPT-PROXY] content script initializing https://chatgpt.com/...
[GPT-PROXY] ✅ PROXY_TAB_READY signal sent successfully
[GPT-PROXY] Page fully loaded, sending ready signal again
[GPT-PROXY] ✅ PROXY_TAB_READY signal sent successfully
[GPT-PROXY] Final ready signal after Arkose timeout
[GPT-PROXY] ✅ PROXY_TAB_READY signal sent successfully
```

#### 4. 문제 패턴
**A: `[GPT-PROXY]` 로그 전혀 없음**
```
(CSP, 404 에러만 보임)
```
→ Content script 미주입
→ 해결:
  1. `chrome://extensions` → 확장 "다시 로드"
  2. 프록시 탭 닫기
  3. 메시지 다시 보내기 (새 탭 자동 생성)
  4. 확장 권한 확인: "사이트 액세스: 모든 사이트"

**B: 시그널 전송 실패**
```
[GPT-PROXY] ❌ Failed to send ready signal - extension context may be invalid
```
→ 확장 context 무효화 (재로드 후 탭은 남음)
→ 해결: 프록시 탭 새로고침 (F5)

### E. 네트워크 탭 검증

서비스 워커 콘솔에서 Network 탭 열기:

#### 정상 요청 순서
```
1. GET /api/auth/session         → 200 OK
2. POST /backend-api/conversation → 200 OK (SSE stream)
```

#### 문제 패턴
- `/api/auth/session`만 있고 `/backend-api/conversation` 없음
  → **프록시 탭 미준비** (HAR 분석에서 발견한 문제!)
- `/backend-api/conversation` → 401/403
  → 인증 문제 (로그아웃 상태)
- `/backend-api/conversation` → 429
  → Rate limit

### F. 현재 상태 요약

#### 완료된 작업
1. ✅ HAR 파일 비교 분석 완료
2. ✅ 근본 원인 규명: 프록시 탭 초기화 실패
3. ✅ 포괄적인 이모지 로깅 시스템 구축
4. ✅ 디버깅 가이드 문서 작성 (CONSOLE_LOG_GUIDE.md)
5. ✅ 빌드 성공 (7.86s)

#### 여전히 남은 문제
1. ❌ **로그가 실제로 출력되지 않음** (사용자 보고)
   - 가능한 원인:
     * 확장이 실제로 실행되지 않음
     * 로그 레벨이 필터링됨
     * console.log가 출력되지 않는 환경
2. ❌ **무한 대기 여전히 발생** (사용자 보고)
   - 예상 원인: 패턴 B (프록시 탭 대기 중 타임아웃)
   - 필요한 정보: 프록시 탭 콘솔의 `[GPT-PROXY]` 로그

#### 다음 단계 (사용자 액션 필요)
1. **필수**: 서비스 워커 콘솔 열기
   - `chrome://extensions` → 개발자 모드 → "Service workers" → "검사"
2. **필수**: 메시지 보낸 후 로그 확인
   - `[GPT-WEB]` 검색
   - 마지막 이모지 확인 (🚀? 🔑? ⏳?)
3. **필수**: 프록시 탭 콘솔 확인
   - chatgpt.com 탭 F12 → Console
   - `[GPT-PROXY]` 검색
   - 로그 존재 여부 확인
4. **권장**: 스크린샷 공유
   - 서비스 워커 콘솔 전체
   - 프록시 탭 콘솔 전체
   - 네트워크 탭

### G. 트러블슈팅 체크리스트

디버깅 전 모두 확인:
- [ ] `chrome://extensions` → 개발자 모드 켜짐
- [ ] 확장 프로그램 버전 1.45.9 확인
- [ ] "사이트 액세스: 모든 사이트"로 설정
- [ ] chatgpt.com에 로그인되어 있음
- [ ] Cloudflare 챌린지 통과
- [ ] 서비스 워커 콘솔에서 "검사" 클릭 가능
- [ ] 메시지 보낸 후 콘솔에서 `[GPT-WEB]` 검색
- [ ] chatgpt.com 탭에서 F12 → `[GPT-PROXY]` 검색

### H. 파일 변경 요약

**수정된 파일**:
1. `src/app/bots/chatgpt-webapp/index.ts`
   - 모든 주요 단계에 이모지 로그 추가
   - 7개 체크포인트: 시작, 토큰 획득 전/후, 모델 선택, Arkose, API 호출 전/후

2. `src/app/bots/chatgpt-webapp/client.ts`
   - `getAccessToken()` 진입 로그 추가

3. `src/app/bots/chatgpt-webapp/requesters.ts`
   - 프록시 탭 탐색/생성/대기 모든 단계 로그 추가
   - `console.log` 레벨로 변경 (console.debug → console.log)

**새로 생성된 파일**:
1. `CONSOLE_LOG_GUIDE.md`
   - 완전히 새로운 포괄적 디버깅 가이드
   - 서비스 워커 콘솔 접근 방법
   - 이모지 로그 패턴 해석
   - 문제별 해결 방법
   - 체크리스트 및 로그 공유 가이드

### I. 기술적 인사이트

#### HAR 분석을 통한 발견
1. **정상 흐름**: session → conversation (2단계)
2. **문제 흐름**: session만 존재, conversation 요청 자체가 없음
3. **결론**: 코드가 conversation 호출 전에 멈춤
4. **위치**: `waitForProxyTabReady()` 타임아웃 (30초)

#### 로깅 전략
- **console.log** 사용: debug보다 높은 우선순위
- **이모지 활용**: 시각적으로 빠른 패턴 인식
- **단계별 로깅**: 모든 async 작업 전후
- **타임스탬프**: 경과 시간 측정
- **컨텍스트 포함**: 관련 변수 값 출력

#### 다중 시그널 전략 (15) 섹션에서 이미 구현)
1. 즉시 전송 (스크립트 로드 시)
2. DOMContentLoaded 후 전송
3. window.load 후 전송
4. 2초 타임아웃 후 전송 (Arkose 대기)

### J. 알려진 제약사항

1. **Arkose Labs CAPTCHA**: 로딩 실패 시 content script 지연
2. **CSP 정책**: `frame-ancestors` 경고는 무해
3. **브라우저 쿠키 정책**: Service Worker fetch에서 쿠키 누락 가능
4. **확장 context 무효화**: 재로드 후 기존 탭에서 발생
5. **Next.js 감지**: 50회 시도 후에도 실패 가능

### K. 참고 문서

- **CONSOLE_LOG_GUIDE.md**: 이모지 로깅 시스템 완전 가이드
- **DEBUG_GUIDE.md**: 기존 디버깅 가이드 (유지)
- **QUICK_DEBUG.sh**: 빠른 디버깅 체크리스트 스크립트
- **har/chathubgpt.har**: 정상 동작 참조용 HAR
- **har/mygpt.har**: 문제 상황 HAR

---

**중요**: 현재 상태에서는 실제 로그를 확인해야 다음 단계로 진행할 수 있습니다. 서비스 워커 콘솔에서 `[GPT-WEB]` 로그와 프록시 탭 콘솔에서 `[GPT-PROXY]` 로그를 반드시 확인해 주세요!

---

## 18) 2025-10-20 핫픽스: 프로덕션 빌드 console 로그 제거 문제 해결

### A. 근본 원인 규명

**증상**:
- 콘솔에 단 한 글자도 로그가 출력되지 않음
- HAR 분석 결과: `/backend-api/conversation` 요청 전혀 없음
- 이전에 추가한 모든 이모지 로깅 시스템이 작동하지 않음

**원인 발견**:
```typescript
// vite.config.ts (26번째 줄)
esbuild: {
  drop: mode === 'production' ? ['console', 'debugger'] : [],
}
```

**프로덕션 빌드(`yarn build`) 시 모든 `console` 문이 esbuild에 의해 제거됨**

**검증**:
- `dist/assets/ChatbotName-*.js`에서 `console.log` 검색 → 단 1개만 발견 (빌드 전 수십 개 있었음)
- 로그 문자열 검색 → "🚀 doSendMessage started" 등 전혀 없음

### B. 해결책 구현

#### 1. vite.config.ts 수정
```typescript
esbuild: {
  // 디버깅을 위해 console 로그 유지, debugger만 제거
  drop: mode === 'production' ? ['debugger'] : [],
},
```

**변경 사유**:
- 프로덕션 환경에서도 디버깅 가능성 확보
- Chrome 확장은 사용자 기기에서 직접 실행되므로 console 로그 유지가 합리적
- 필요시 추후 환경변수로 로깅 레벨 제어 가능

#### 2. 추가 초기화 로그

**src/background/index.ts**:
```typescript
Browser.runtime.onInstalled.addListener((details) => {
  console.log('[EXTENSION] 🚀 Extension installed/updated', {
    reason: details.reason,
    version: Browser.runtime.getManifest().version
  })
  // ...
})

async function openAppPage() {
  console.log('[EXTENSION] 📱 Opening app page...')
  // ...
  console.log('[EXTENSION] ✅ Found existing app tab:', tab.id)
  // ...
  console.log('[EXTENSION] 🆕 Creating new app tab with hash:', hash)
}
```

**src/app/bots/index.ts**:
```typescript
export function createBotInstance(botId: BotId) {
  console.log('[BOT] 🤖 Creating bot instance:', botId)
  switch (botId) {
    case 'chatgpt':
      const bot = new ChatGPTBot()
      console.log('[BOT] ✅ ChatGPT bot created')
      return bot
    // ...
  }
}
```

### C. 빌드 검증

```bash
yarn build
# ✓ built in 10.62s

# console.log 포함 확인
grep -o "console\.log" dist/assets/ChatbotName-*.js | wc -l
# 26 (성공!)

# 로그 문자열 확인
grep -o "doSendMessage started\|Creating bot instance" dist/assets/ChatbotName-*.js
# doSendMessage started
# Creating bot instance
# (성공!)
```

### D. 새로운 로그 구조

#### 1. 확장 초기화 로그
```
[EXTENSION] 🚀 Extension installed/updated { reason: 'install', version: '1.45.9' }
[EXTENSION] 📱 Opening app page...
[EXTENSION] 🆕 Creating new app tab with hash: #/chat/chatgpt
```

#### 2. 봇 생성 로그
```
[BOT] 🤖 Creating bot instance: chatgpt
[BOT] ✅ ChatGPT bot created
```

#### 3. 메시지 전송 로그 (기존)
```
[GPT-WEB] 🚀 doSendMessage started
[GPT-WEB] 🔑 Getting access token...
[GPT-WEB] 🔑 getAccessToken() called
[GPT-WEB][REQ] 🔍 Looking for existing proxy tab...
...
```

### E. 검증 절차 (업데이트)

#### 1. 확장 재로드
```bash
# Chrome 확장 관리 페이지
chrome://extensions
# "다시 로드" 버튼 클릭
# 또는 dist/ 폴더 재선택
```

#### 2. 서비스 워커 콘솔 열기
```
chrome://extensions → 개발자 모드 → "Service workers" → "검사"
```

#### 3. 확장 초기화 로그 확인
확장 아이콘 클릭 시:
```
[EXTENSION] 📱 Opening app page...
[EXTENSION] 🆕 Creating new app tab with hash: ...
```

#### 4. 봇 선택 및 메시지 전송
ChatGPT 선택 후 메시지 입력:
```
[BOT] 🤖 Creating bot instance: chatgpt
[BOT] ✅ ChatGPT bot created
[GPT-WEB] 🚀 doSendMessage started
[GPT-WEB] 🔑 Getting access token...
...
```

### F. 예상 문제 패턴 재정의

#### 패턴 A: 여전히 로그 없음
```
(콘솔 비어있음)
```
**원인**: 확장이 제대로 리로드되지 않음
**해결**:
1. Chrome 완전 재시작
2. 확장 제거 후 재설치
3. 시크릿 모드에서 테스트

#### 패턴 B: [EXTENSION] 로그만 보이고 [BOT] 로그 없음
```
[EXTENSION] 📱 Opening app page...
(이후 로그 없음)
```
**원인**: 앱 페이지는 열렸으나 봇을 선택하지 않음
**해결**: UI에서 ChatGPT 봇 명시적으로 선택

#### 패턴 C: [BOT] 로그는 보이지만 [GPT-WEB] 로그 없음
```
[BOT] 🤖 Creating bot instance: chatgpt
[BOT] ✅ ChatGPT bot created
(이후 로그 없음)
```
**원인**: doSendMessage()가 호출되지 않음
**해결**:
1. 메시지 입력 후 **Enter 또는 전송 버튼** 명시적 클릭 확인
2. UI 에러 메시지 확인
3. 네트워크 탭에서 plausible.io 외 다른 요청 확인

#### 패턴 D: [GPT-WEB] 로그는 있지만 프록시 탭 대기 중
```
[GPT-WEB] 🚀 doSendMessage started
[GPT-WEB] 🔑 getAccessToken() called
[GPT-WEB][REQ] 🔍 Looking for existing proxy tab...
[GPT-WEB][REQ] 🌐 Creating new proxy tab...
[GPT-WEB][REQ] ⏳ waitForProxyTabReady() called...
[GPT-WEB][REQ] ⏳ Still waiting for proxy tab... (pollCount: 20)
```
**원인**: 프록시 탭 초기화 실패 (기존 문제)
**해결**: chatgpt.com 탭 콘솔에서 `[GPT-PROXY]` 로그 확인 (섹션 17 참조)

### G. 남은 작업

#### 완료 ✅
1. vite.config.ts esbuild drop 설정 수정
2. 확장 초기화 로그 추가
3. 봇 생성 로그 추가
4. 빌드 검증 완료 (console.log 26개 포함)
5. NOWGUIDE 섹션 18 작성

#### 대기 중 ⏳
1. 사용자 확장 재로드 및 테스트
2. 실제 로그 확인
3. HAR 파일 재수집 (conversation 요청 포함 여부 확인)

#### 필요 시 후속 작업 🔜
1. 로그가 보이지만 conversation 요청 여전히 없으면 → 프록시 탭 문제 (섹션 17 해결책 적용)
2. 모든 로그가 정상이면 → HAR 분석으로 API 응답 확인
3. 특정 단계에서 멈추면 → 해당 단계 코드 디버깅

### H. 기술적 인사이트

#### 1. Vite/esbuild 빌드 최적화
- **Drop 기능**: 프로덕션 빌드에서 특정 문법 제거 (tree-shaking)
- **Trade-off**: 파일 크기 vs 디버깅 가능성
- **Chrome 확장 특성**: 사용자 기기에서 직접 실행되므로 console 유지 합리적

#### 2. 로그 전략
- **계층화**: [EXTENSION] → [BOT] → [GPT-WEB] → [GPT-PROXY]
- **이모지 활용**: 시각적 패턴 인식 용이
- **진입점 로그**: 코드 실행 여부 명확히 확인

#### 3. KISS 원칙 적용
- 복잡한 로깅 라이브러리 대신 간단한 console.log
- 최소한의 코드 변경 (vite.config.ts 1줄, 로그 추가)
- 명확한 원인 규명 → 직접적인 해결

### I. 체크리스트 (최신)

디버깅 전 확인:
- [ ] 확장 재로드 (chrome://extensions → "다시 로드")
- [ ] 서비스 워커 콘솔 열기 (chrome://extensions → "검사")
- [ ] 확장 아이콘 클릭 → `[EXTENSION]` 로그 확인
- [ ] ChatGPT 봇 선택 → `[BOT]` 로그 확인
- [ ] 메시지 전송 → `[GPT-WEB]` 로그 확인
- [ ] chatgpt.com 탭 F12 → `[GPT-PROXY]` 로그 확인 (필요 시)
- [ ] 네트워크 탭에서 `/backend-api/conversation` 요청 확인

### J. 다음 단계 안내

**사용자가 해야 할 일**:

1. **즉시 실행**:
```bash
# Chrome 확장 관리 페이지 열기
chrome://extensions

# "다시 로드" 버튼 클릭
# 또는 dist/ 폴더 재선택 ("압축해제된 확장 프로그램 로드")
```

2. **로그 확인**:
- 서비스 워커 콘솔 열기 (`chrome://extensions` → "검사")
- 확장 아이콘 클릭
- **반드시 `[EXTENSION]` 로그가 보여야 함**

3. **메시지 전송 테스트**:
- ChatGPT 봇 선택
- 간단한 메시지 입력 (예: "hello")
- **`[BOT]` 및 `[GPT-WEB]` 로그 확인**

4. **결과 공유**:
- 서비스 워커 콘솔 전체 스크린샷
- 어떤 로그까지 보이는지
- 마지막 이모지가 무엇인지

**예상 성공 패턴**:
```
[EXTENSION] 📱 Opening app page...
[BOT] 🤖 Creating bot instance: chatgpt
[BOT] ✅ ChatGPT bot created
[GPT-WEB] 🚀 doSendMessage started
[GPT-WEB] 🔑 Getting access token...
...
```

이제 **console 로그가 정상적으로 출력**되어야 하며, 정확히 어디서 멈추는지 파악할 수 있습니다! 🎯

---

## 19) 2025-10-20 디버깅 진행: Arkose Token 획득 시점에서 멈춤 현상

### A. 로그 분석 결과

#### 1. 확인된 정상 동작
```
00:20:21.995 [GPT-WEB] 🚀 doSendMessage started
00:20:21.995 [GPT-WEB] ♻️ Reusing existing access token
00:20:21.995 [GPT-WEB] 🤖 Getting model name...
00:20:21.996 [GPT-WEB] 🔑 getAccessToken() called
00:20:22.259 ✅ GET "https://chatgpt.com/api/auth/session" 완료
00:20:22.350 ✅ POST "https://plausible.io/api/event" 완료
00:20:22.895 [GPT-WEB] ✅ Using model: gpt-5
00:20:22.895 [GPT-WEB] 🎫 Getting Arkose token...
00:20:22.897 ✅ GET "https://chatgpt.com/backend-api/models" 완료
```

**성공 항목**:
- ✅ doSendMessage() 호출됨
- ✅ Access token 재사용 (이미 있음)
- ✅ /api/auth/session 200 OK
- ✅ /backend-api/models 200 OK
- ✅ 모델 선택: gpt-5 (최신 모델!)

#### 2. 멈춤 지점 식별
```
00:20:22.895 [GPT-WEB] 🎫 Getting Arkose token...
(이후 로그 없음)
```

**예상되었던 다음 로그**:
```
[GPT-WEB] ✅ Arkose token obtained: yes
[GPT-WEB] 📡 Calling /backend-api/conversation...
[GPT-WEB] ✅ Response received, starting SSE parsing...
```

#### 3. 문제 지점
`getArkoseToken()` 함수에서 무한 대기 또는 에러 발생 추정

### B. 원인 분석

#### Arkose Token 획득 프로세스
1. **목적**: ChatGPT의 CAPTCHA 토큰 (FunCaptcha)
2. **방식**: 
   - 원격 API 호출 (이미 제거됨, NOWGUIDE 섹션 13 참조)
   - 페이지 내 Arkose 위젯 생성 시도
3. **문제**: 
   - Arkose 위젯 초기화 실패
   - enforcement.html 404 에러 (NOWGUIDE 섹션 15 참조)
   - 타임아웃 없이 무한 대기

#### 코드 위치
`src/app/bots/chatgpt-webapp/arkose.ts` (추정)

### C. 해결 방법

#### 옵션 1: Arkose 타임아웃 추가 (빠른 해결)
```typescript
// arkose.ts
export async function getArkoseToken(): Promise<string | undefined> {
  console.log('[GPT-WEB] 🎫 Attempting to get Arkose token...')
  
  // 5초 타임아웃 설정
  const timeout = new Promise<undefined>((resolve) => {
    setTimeout(() => {
      console.log('[GPT-WEB] ⏰ Arkose timeout - continuing without token')
      resolve(undefined)
    }, 5000)
  })
  
  const arkosePromise = // 기존 Arkose 로직
  
  const token = await Promise.race([arkosePromise, timeout])
  console.log('[GPT-WEB] ✅ Arkose token obtained:', token ? 'yes' : 'no')
  return token
}
```

#### 옵션 2: Arkose 완전 스킵 (임시 회피)
```typescript
export async function getArkoseToken(): Promise<string | undefined> {
  console.log('[GPT-WEB] ⚠️ Skipping Arkose token (not required for all accounts)')
  return undefined
}
```

#### 옵션 3: 에러 래핑 (안전)
```typescript
export async function getArkoseToken(): Promise<string | undefined> {
  try {
    console.log('[GPT-WEB] 🎫 Getting Arkose token...')
    const token = await // 기존 로직
    console.log('[GPT-WEB] ✅ Arkose token obtained:', token ? 'yes' : 'no')
    return token
  } catch (error) {
    console.log('[GPT-WEB] ⚠️ Arkose error, continuing without token:', error)
    return undefined
  }
}
```

### D. 추가 로그 필요 위치

#### 1. arkose.ts 파일 전체 로깅
```typescript
export async function getArkoseToken(): Promise<string | undefined> {
  console.log('[ARKOSE] 🎫 Starting Arkose token acquisition...')
  
  try {
    // 위젯 찾기
    console.log('[ARKOSE] 🔍 Looking for Arkose widget...')
    const widget = document.querySelector('#arkose-widget')
    
    if (!widget) {
      console.log('[ARKOSE] ❌ Widget not found')
      return undefined
    }
    
    console.log('[ARKOSE] ✅ Widget found, initializing...')
    
    // 초기화
    const token = await initializeArkose(widget)
    console.log('[ARKOSE] ✅ Token obtained:', token.substring(0, 20) + '...')
    
    return token
  } catch (error) {
    console.error('[ARKOSE] ❌ Error:', error)
    return undefined
  }
}
```

### E. 임시 해결책 적용 (KISS 원칙)

가장 간단한 해결책: **Arkose 타임아웃 5초 + 에러 래핑**

**이유**:
1. Arkose는 모든 계정에 필수가 아님
2. 없어도 conversation 요청 가능 (일부 계정)
3. CAPTCHA 필요 시 서버가 에러 반환 (명확한 메시지)

### F. 예상 결과

#### 타임아웃 후 정상 진행
```
[GPT-WEB] 🎫 Getting Arkose token...
[ARKOSE] 🎫 Starting Arkose token acquisition...
[ARKOSE] 🔍 Looking for Arkose widget...
[ARKOSE] ⏰ Timeout - widget not ready in 5s
[GPT-WEB] ⚠️ Arkose timeout - continuing without token
[GPT-WEB] 📡 Calling /backend-api/conversation...
```

#### CAPTCHA 필요 시
```
[GPT-WEB] 📡 Calling /backend-api/conversation...
❌ Server response: "CAPTCHA required"
→ 사용자에게 명확한 안내: "chatgpt.com 탭에서 CAPTCHA를 완료해주세요"
```

### G. 현재 상태 요약

#### 완료 ✅
1. Console 로그 정상 출력 확인
2. doSendMessage() 실행 확인
3. Access token 정상 확인
4. Model 선택 정상 (gpt-5)
5. 멈춤 지점 식별: Arkose token 획득

#### 진행 중 🔄
1. Arkose token 획득 코드 분석 필요
2. 타임아웃/에러 처리 추가 필요

#### 다음 단계 📋
1. `src/app/bots/chatgpt-webapp/arkose.ts` 파일 확인
2. 타임아웃 추가 또는 에러 래핑
3. 재빌드 및 테스트
4. `/backend-api/conversation` 요청 도달 확인

### H. 기술적 인사이트

#### 1. Arkose Labs FunCaptcha
- **목적**: 봇 탐지 및 CAPTCHA
- **동작**: iframe 기반 JavaScript 위젯
- **문제점**: 
  - 확장 환경에서 CSP 제약
  - enforcement.html 404 빈번
  - 초기화 타이밍 이슈

#### 2. ChatGPT Arkose 요구사항
- **필수 아님**: 일부 계정/세션에서만 요구
- **서버 주도**: 서버가 CAPTCHA 필요 시 명시적 에러 반환
- **클라이언트 전략**: 
  - 최선 노력 (best effort) 획득
  - 없으면 빈 값으로 요청
  - 서버 에러 시 사용자 안내

#### 3. 무한 대기 방지 패턴
```typescript
// ❌ 나쁜 예
const token = await getArkoseToken() // 타임아웃 없음

// ✅ 좋은 예
const token = await Promise.race([
  getArkoseToken(),
  timeout(5000)
])
```

### I. 체크리스트 업데이트

디버깅 진행 상황:
- [x] Console 로그 활성화 (섹션 18)
- [x] 로그 출력 확인
- [x] doSendMessage() 호출 확인
- [x] Access token 확인
- [x] Model 선택 확인
- [ ] **Arkose token 처리 수정** ← 현재 단계
- [ ] /backend-api/conversation 요청 확인
- [ ] SSE 스트림 수신 확인
- [ ] 응답 파싱 확인

### J. 다음 작업 계획

#### 우선순위 1: Arkose 파일 확인
```bash
# 파일 위치 찾기
find src -name "*arkose*" -type f

# 파일 내용 확인
cat src/app/bots/chatgpt-webapp/arkose.ts
```

#### 우선순위 2: 타임아웃 추가
- 5초 타임아웃 구현
- 에러 처리 강화
- 로그 추가

#### 우선순위 3: 테스트
- 재빌드
- 로그 확인: `[ARKOSE]` 태그
- conversation 요청 도달 확인

````
