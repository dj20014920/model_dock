# NOWGUIDE

본 문서는 PRD(최종 PRD: 크롬 확장 프로그램 및 SaaS 모델)를 기준으로 현재까지 구현/개선된 내용과 사용 방법, 트러블슈팅, 후속 계획을 한눈에 정리한 가이드입니다.

## 1) 제품 비전 요약 (PRD 기준)
- 목표: 사용자의 웹 계정(무료/구독)을 그대로 활용하여 공식 AI 웹사이트(ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek, Qwen, Kimi, GLM 등)를 한 화면에서 동시에 사용.
- 차별화: 100% 무료 사용 + 구독형 고급 옵션(현재는 전면 비활성화; 모든 기능 무료), 수동 복사/붙여넣기 모드로 법적 리스크 최소화, 자동 라우팅은 동의 후 사용.
- 프리미엄(구독) 관련: 현 시점에서는 전체 제거(모달/제한/결제/할인 네트워크 호출 모두 제거).

## 2) 구현 현황(요약)
- 멀티 모델 UI: All‑In‑One(2/3/4/6 그리드) + 개별 패널 동작.
- 수동 복붙 모드: All‑In‑One 하단 입력에서 전송 시 프롬프트를 복사하고 각 패널 입력창으로 순차 포커싱(메인 브레인 제외). 개별 패널 입력은 항상 해당 봇으로 직접 전송.
- 자동 라우팅(토글): 최초 활성화 시 리스크 경고/동의 모달. API 키 기반/웹 세션 기반 모두 지원.
- 템플릿: 로컬 저장(원터치 사용/편집/삭제), 커뮤니티 프롬프트 로컬 복사. 슬롯 제한 제거(무제한).
- 메모장: 로컬 저장(원터치 복사/검색/정렬/편집/삭제). 슬롯 제한 제거(무제한).
- 메인 브레인: 패널 헤더에서 크라운 토글로 지정, 금색 링 하이라이트, 우측 고정 패널(추천 모델/가이드) 노출. All‑In‑One 수동 복붙 시 자동 제외.
- 사용량 추정 배지: 입력 토큰 기준의 간략 추정(옵션으로 응답 토큰 근사 포함). OpenAI/Claude 입력단가 반영, Perplexity/Gemini는 토큰만.
- 한국어(i18n): UI 리소스/확장 메타 로케일(ko) 추가.
- 결제/프리미엄 제거: 모든 프리미엄/결제/할인 네트워크/모달/슬롯 제한 제거.
- 원격 호출 제거: chathub.gg API 일체 제거/스텁 처리.
- 권한/호스트: tabs 권한 추가, perplexity.ai 호스트 추가.
- 버전: MV3 manifest version 1.45.9.

## 3) 주요 변경 사항(파일 기준)
- 수동 복붙 UX
  - All‑In‑One 하단: `src/app/pages/MultiBotChatPanel.tsx` (manual-dispatch + 토스트)
  - 개별 패널: `src/app/components/Chat/ConversationPanel.tsx` (항상 실제 전송)
  - 오케스트레이터: `src/app/utils/manual-dispatch.ts`
- 자동 라우팅 동의 모달: `src/app/components/Modals/RiskConsentModal.tsx`, SettingPage 연동.
- 템플릿/메모
  - 템플릿: `src/app/components/PromptLibrary/*`, `src/services/prompts.ts`(로컬 저장)
  - 메모장: `src/app/components/Notes/*`, `src/services/notes.ts`
- 메인 브레인: `src/app/components/MainBrain/*`, `src/app/hooks/use-main-brain.ts`
- 사용량 추정: `src/services/usage.ts`, `src/app/components/Usage/Badge.tsx`
- 한국어: `src/app/i18n/locales/korean.json`, `_locales/ko/messages.json`, i18n 등록
- 프리미엄/결제 제거: `use-premium.ts`(항상 활성), PremiumModal null, slots 제한 no-op, Sidebar 할인 제거, background/source 비활성화, `src/services/server-api.ts` 스텁.
- 권한/호스트/버전: `manifest.config.ts` (tabs/perplexity, version 1.45.9)
- 전역 토스트: `src/app/components/Layout.tsx`

## 4) Webapp 모드 안정화(중요)
- ChatGPT(Web)
  - 모든 요청에 `credentials: 'include'` 적용 → 세션 쿠키 전송.
  - 최초 세션(`/api/auth/session`) 실패 시 고정(pinned) ChatGPT 탭을 띄우고 프록시 경유로 재시도.
  - 모델: Auto(기본) → `/backend-api/models` 목록 기반으로 4o/4.1/4o‑mini/o3‑mini/4/3.5 우선순위 선택.
- Claude(Web)
  - 쿠키 포함 요청으로 보완.
  - `append_message` 404 시 추정 신규 경로(`/organizations/{org}/chat_conversations/{id}/completion`) 폴백.
  - 주의: Claude 웹 엔드포인트는 자주 변경됨 → API 키 모드가 가장 안정적.

## 5) 설정 페이지 가이드
- Message Dispatch
  - Manual: All‑In‑One 하단 전송은 복사/포커싱. 개별 패널은 직접 전송.
  - Auto: 동의 후 활성화(법적 고지). API 키/웹 세션 기반 모두 가능.
- 사용자 계정(Webapp)
  - ChatGPT/Claude 등 토글로 사용. 각 서비스 웹사이트에 로그인 필요.
  - ChatGPT는 고정(pinned) 탭이 자동 열림(닫지 말 것), Cloudflare 챌린지 통과 필요.
- API 키 모드
  - OpenAI/Claude/Perplexity/Gemini 등에서 키 입력 후 사용. 사용량 배지(입력단가) 참조.
- Language: 한국어 ko 추가.

## 6) 빌드/로드/개발
- 빌드: `npm run build` → dist/ 생성
- 로드: Chrome → `chrome://extensions` → 개발자 모드 ON → "압축해제된 확장 프로그램 로드" → dist/ 선택
- 버전 확인: 카드에 `1.45.9` 표시
- 권한: tabs 권한 허용 팝업 수락
- 개발(HMR): `npm run dev` (crx HMR 경로는 터미널 로그 참고)

## 7) 사용 방법(핵심 플로우)
- All‑In‑One 하단 → 수동 복붙(복사 안내 토스트) → 각 패널에 붙여넣기+Enter → 순차 포커싱(메인 브레인 제외)
- 개별 패널 → Enter 즉시 전송(Web 세션 또는 API 키로 실제 호출)
- 메모장 → 원터치 복사/검색/정렬/편집/삭제(무제한)
- 템플릿 → 로컬/커뮤니티 프롬프트 사용/저장(무제한)
- 메인 브레인 → 크라운 토글로 지정, 금색 링/우측 패널 노출
- 사용량 배지 → 입력 토큰 기준(옵션으로 응답 근사 포함)

## 8) 트러블슈팅
- chathub.gg 404가 뜬다 → 이전 빌드 캐시. 확장 제거 후 dist 재로딩(버전 1.45.9인지 확인).
- ChatGPT "Failed to fetch" → chat.openai.com 로그인/Cloudflare 통과, 고정 탭 유지, tabs 권한 허용.
- Claude "not_found_error" → 웹 엔드포인트 변경 가능성. 로그인 후에도 지속되면 API 키 모드 사용 권장.
- 개별 패널이 전송되지 않는다 → 현재는 개별 패널은 항상 전송(복사 안내 없음). All‑In‑One 하단만 복붙.

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

## 12) 2025-10-16 업데이트(계정 기반 Webapp 파이프라인 보강 + Gemini Webapp 연결 + HAR 분석 도구)

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
