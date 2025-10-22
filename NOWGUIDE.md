# NOWGUIDE - Model Dock (간단 요약)

업데이트: 2025-10-22 · 버전: 1.45.26

—

**목표**
- MV3 Service Worker 중심으로 사용자의 ChatGPT 웹 계정으로 대화
- 프록시(숨김) 탭 자동 생성 금지(사용자가 열어둔 탭이 있을 때만 선택적 사용)
- Sentinel 기반(Authorization·쿠키 직접 주입 없이) 통신 유지

**빠른 시작**
- 설치: `yarn` → `yarn build` → Chrome `chrome://extensions` → 개발자 모드 → `dist/` 로드
- 필수: 브라우저에서 `https://chatgpt.com` 로그인 후 사용
- 사용: 확장 실행 → ChatGPT(Webapp) 선택 → 프롬프트 전송

**아키텍처 요약**
- 기본 경로: Service Worker의 background fetch로 SSE 스트리밍 수신(쿠키 자동 포함)
- same-origin(인페이지) 경로: 사용자가 이미 연 `chatgpt.com` 탭이 있을 때만 선택적으로 사용(자동 생성 안 함)
- Content Script는 브리지 역할만 수행(요청 포워딩/쿠키 읽기 등), 핵심 로직은 SW에서 처리

**네트워크 흐름**
1) 세션 확인: `GET /api/auth/session` (로그인/플랜 확인)
2) Sentinel: `POST /backend-api/sentinel/chat-requirements`
   - Body: `{ p: <Base64 브라우저 지문> }`
   - Headers: `oai-device-id`, `oai-language`
   - 응답: `token`(requirements), `turnstile.required`, `proofofwork` 등
3) 대화: `POST /backend-api/conversation` (SSE)
   - Headers: `Accept: text/event-stream`, `oai-device-id`, `oai-language`,
              `openai-sentinel-chat-requirements-token`, `openai-sentinel-proof-token`
   - Body: `action: "next"`, `messages`, `model`, `parent_message_id`, `conversation_id`
   - Authorization 헤더·명시 쿠키 주입 없음(브라우저가 자동 처리)

**브라우저 지문(Proof) 생성**
- Base64(JSON 배열): `[dateUTC, hardwareConcurrency, screenSize, userAgent, '', '', language, languagesCSV, 10]`
- POW 필요 시 내장 계산기로 처리(없어도 동작하는 케이스 다수)
- Turnstile 플래그는 보수적으로 무시(Cloudflare 상황에 따라 페이지에서 한 번 통과 필요)

**설정(요지)**
- `chatgptMode`: `webapp`(기본) / `api`
- `chatgptWebappAlwaysProxy`: 기본 `false`(BG 우선). `true`여도 “이미 열린 탭”만 사용
- `chatgptWebappHeaderMode`: `minimal`(기본) / `browserlike`
- `chatgptWebappCookieOnly`: `true`(Authorization 제거)
- `chatgptWebappCustomModel`: 빈 값이면 세션 모델 목록에서 자동 선택(가능 시 `auto` 선호)

**주요 파일**
- `src/background/index.ts` — BG_FETCH 스트리밍 처리, 헤더 보강(옵션)
- `src/services/proxy-fetch.ts` — `backgroundFetch`, `proxyFetch` 구현
- `src/app/bots/chatgpt-webapp/client.ts` — 세션, Sentinel, Proof/POW
- `src/app/bots/chatgpt-webapp/index.ts` — SSE 파싱·대화 컨텍스트 관리
- `src/app/bots/chatgpt-webapp/requesters.ts` — BG 기본, 프록시 탭 "재사용만" 허용
- `src/content-script/chatgpt-inpage-proxy.ts` — 인페이지 브리지(쿠키 읽기·턴스타일 시도)
- **`src/app/bots/claude-web/index.ts`** — Claude Webapp SSE 파싱·대화 관리
- **`src/app/bots/claude-web/api.ts`** — Claude API 호출 (org, conversation, title)
- **`src/utils/sse.ts`** — SSE 스트림 파싱 (eventsource-parser 기반, ReadableStream 처리)

**권한/매니페스트**
- `host_permissions`: `https://*.openai.com/*`, `https://chatgpt.com/*`(CORS 회피)
- `permissions`: `cookies`, `tabs`, `scripting`, `storage` 등
- `content_scripts`: `chatgpt.com`, `chat.openai.com`에 브리지 스크립트 주입

**문제 해결(요약)**
- **ChatGPT**:
  - 401 Unauthorized: `chatgpt.com` 로그인 필요
  - 403 Forbidden: Cloudflare 챌린지 통과 → 페이지에서 1회 대화 성공 후 재시도(프록시 탭 자동 생성 없음)
  - 429 Rate limit: 잠시 대기 후 재시도
  - SSE 끊김: BG 콘솔 확인, 네트워크 상태 점검, 잠시 후 재시도
- **Claude**:
  - 401/403 Unauthorized: `claude.ai` 로그인 필요
  - 빈 응답 문제: SSE 이벤트 형식 확인 (`content_block_delta` 사용)
  - ReadableStream locked 에러: `getReader()` 중복 호출 방지
  - `message_limit` 이벤트: 사용량 정보 (5h/7d 윈도우), `within_limit` 정상
  - 403 model_not_allowed: 모델 자동 폴백 루프로 대체 모델 시도

**보안/정책**
- Authorization 헤더·민감 쿠키 수집/보관 없음(브라우저가 쿠키를 자동 포함)
- 서버리스(프록시 서버 없음), 사용자 로컬 스토리지만 사용
- OpenAI 내부 API 변경 시 영향 가능 → 최소 헤더·Sentinel 토큰으로 호환성 우선

**변경 요약(1.45.26)**
- **Claude Webapp 통합 수정 완료**:
  - SSE 이벤트 형식 수정: `content_block_delta` 이벤트에서 `delta.text` 추출
  - 요청 body 개선: `timezone`, `rendering_mode: "messages"` 추가
  - ReadableStream lock 문제 해결: reader 재사용 로직 수정
  - Agent 시스템 제거: 불필요한 프롬프트 래핑 제거
  - `/models` API 호출 제거: 하드코딩된 모델 리스트 사용 (403 에러 회피)
- **Claude Web API 흐름**:
  1. Organization ID 조회: `GET /api/organizations`
  2. Conversation 생성: `POST /api/organizations/{org_id}/chat_conversations`
  3. Completion 요청: `POST /api/organizations/{org_id}/chat_conversations/{conv_id}/completion` (SSE)
  4. Title 생성: `PUT /api/organizations/{org_id}/chat_conversations/{conv_id}/title`
- **Claude SSE 이벤트 처리**:
  - `message_start`: 메시지 시작
  - `content_block_start`: 콘텐츠 블록 시작
  - `content_block_delta`: **실제 텍스트 조각** (`delta.text` 필드)
  - `content_block_stop`: 콘텐츠 블록 종료
  - `message_delta`: 메시지 델타 (stop_reason 등)
  - `message_limit`: 사용량 제한 정보 (5h/7d 윈도우)
  - `message_stop`: 메시지 종료
- 프록시 탭 자동 생성 제거(사용자 열어둔 탭만 재사용)
- BG fetch 우선 구조 확정, same-origin은 선택적
- Sentinel JSON 파싱 안정화(`resp.text()`→`JSON.parse()`)
- 모델 선택 시 `auto` 우선, 그 외 최신 슬러그 우선순위 적용

**수동 테스트 체크리스트**
- `yarn dev` 또는 `yarn build` 후 로드
- **ChatGPT**: 브라우저에서 `chatgpt.com` 로그인 → 확장에서 질문 전송 → 스트리밍 수신 확인
- **Claude**: 브라우저에서 `claude.ai` 로그인 → 확장에서 질문 전송 → SSE 이벤트 수신 확인
- 필요 시 사용자가 직접 해당 서비스 탭을 열어 둠(자동 생성 없음)
- 콘솔 로그 확인:
  - `[Claude] 📝 Updated answer (+N chars)` — 텍스트 수신 성공
  - `[Claude] 🛑 Message stop event received` — 정상 종료
  - `[SSE] ✅ first chunk received` — 첫 응답 수신

**제한/알림**
- OpenAI의 Sentinel/Cloudflare 정책 변경 시 동작이 달라질 수 있음
- 계정 기반 웹 접근이 막힐 경우 BYOK(API Key) 모드로 전환 권장
