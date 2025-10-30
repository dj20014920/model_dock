# Claude 사용자 계정 기반 인증 개선

## 문제 상황

Claude가 Gemini, Perplexity와 달리 **무조건 프록시 탭을 사용**하여 불필요한 탭 생성 발생:
1. 비로그인 상태에서 채팅 시도 → **401 NO_PROXY_TAB** 오류
2. 사용자가 새로고침 이모지 클릭
3. 재 채팅 시도 → **499 PORT_DISCONNECTED** 오류

### 로그 분석
```
[HYBRID-FETCH] 🔄 Using ProxyRequester for: https://claude.ai/api/organizations
[HYBRID-FETCH] 📡 ProxyRequester result: 401 NO_PROXY_TAB
```

## 근본 원인

1. **Background fetch 미사용**: Extension의 background context에서 쿠키를 활용한 직접 요청을 시도하지 않음
2. **무조건 프록시 탭 사용**: Copilot만 background-first 정책을 적용하고, Claude는 처음부터 프록시 탭 사용
3. **Gemini/Perplexity와 불일치**: 다른 봇들은 쿠키 우선 → 실패 시 프록시 탭 생성 방식인데, Claude만 다름

## 해결 방안

### 1. hybridFetch를 Background-First로 전환 (`src/app/utils/hybrid-requester.ts`)

**핵심 원칙**: 모든 사용자 계정 기반 봇에 대해 쿠키 우선 → 실패 시 프록시 탭

**변경 전:**
```typescript
export async function hybridFetch(...) {
  // Copilot만 background-first
  if (opts.hostStartsWith.includes('copilot.microsoft.com')) {
    // background fetch 시도
  }
  
  // ❌ Claude는 바로 프록시 탭 사용
  const requester = new ProxyRequester({ ...opts, reuseOnly: !!extra?.reuseOnly })
  return await requester.fetch(url, options)
}
```

**변경 후:**
```typescript
export async function hybridFetch(...) {
  // ✅ 1단계: 모든 봇에 대해 background fetch 우선 시도
  try {
    console.log('[HYBRID-FETCH] 🚀 Trying background fetch first:', url)
    const bg = await backgroundFetch(url, options)
    
    if (bg.ok) return bg  // 성공하면 바로 반환
    if (bg.status !== 401 && bg.status !== 403) return bg  // 다른 오류도 반환
    
    // 401/403: 로그인 필요 → 프록시 탭으로 폴백
    console.log('[HYBRID-FETCH] 🔑 Authentication required, falling back to proxy tab')
  } catch (e) {
    console.warn('[HYBRID-FETCH] ⚠️ Background fetch failed, falling back to proxy')
  }

  // ✅ 2단계: 프록시 탭을 통한 요청 (필요 시 자동 생성)
  const requester = new ProxyRequester({ ...opts, reuseOnly: !!extra?.reuseOnly })
  return await requester.fetch(url, options)
}
```

### 2. Claude에서 reuseOnly 옵션 제거 (`src/app/bots/claude-web/index.ts`)

**변경 전:**
```typescript
this.organizationId = await fetchOrganizationId((i, init) =>
  hybridFetch(i as string, init as any, 
    { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' }, 
    { reuseOnly: true }  // ❌ 복잡한 try-catch 필요
  ),
)
```

**변경 후:**
```typescript
// ✅ hybridFetch가 자동으로 처리:
// 1. 먼저 background context에서 쿠키로 시도
// 2. 401/403이면 프록시 탭 생성하여 로그인 유도
this.organizationId = await fetchOrganizationId((i, init) =>
  hybridFetch(i as string, init as any, 
    { homeUrl: 'https://claude.ai', hostStartsWith: 'https://claude.ai' }
  ),
)
```

### 3. ProxyRequester 재시도 로직 개선 (`src/app/utils/proxy-requester.ts`)

**변경 전:**
```typescript
if (resp.status === 403 || resp.status === 499) {
  await this.refreshProxyTab()
  resp = await proxyFetch(tab.id!, url, merged)  // ❌ 기존 탭 ID 재사용
}
```

**변경 후:**
```typescript
if (resp.status === 403 || resp.status === 499) {
  console.log('[ProxyRequester] 🔄 Refreshing proxy tab due to:', resp.status, resp.statusText)
  await this.refreshProxyTab()
  
  // ✅ 리프레시된 탭을 다시 찾아서 재시도
  const retryTab = await this.findExistingProxyTab()
  if (retryTab) {
    resp = await proxyFetch(retryTab.id!, url, merged)
    console.log('[ProxyRequester] ✅ Retry result:', resp.status, resp.statusText)
  }
}
```

### 2. Claude API 안전 파싱 강화 (`src/app/bots/claude-web/api.ts`)

**핵심 원칙**: 2xx가 아닌 응답은 절대 JSON 파싱하지 않음

```typescript
// 401/403: 로그인 필요
if (resp.status === 401 || resp.status === 403) {
  throw new ChatError('There is no logged-in Claude account in this browser.', ErrorCode.CLAUDE_WEB_UNAUTHORIZED)
}

// ✅ 2xx가 아닌 경우: JSON 파싱 시도하지 않음
if (!resp.ok) {
  console.error('[Claude API] ❌ Non-OK response:', resp.status, resp.statusText)
  throw new ChatError(`Claude API error: ${resp.status} ${resp.statusText}`.trim(), ErrorCode.NETWORK_ERROR)
}

// 정상 응답만 JSON 파싱
const text = await resp.text()
if (!text || !text.trim()) {
  throw new ChatError('Empty response from Claude API', ErrorCode.NETWORK_ERROR)
}

let orgs: any
try {
  orgs = JSON.parse(text)
} catch (e) {
  console.error('[Claude API] ❌ JSON parse error:', e)
  throw new ChatError('Invalid JSON from Claude API', ErrorCode.NETWORK_ERROR)
}

// ✅ 데이터 유효성 검증 추가
if (!orgs || !Array.isArray(orgs) || !orgs[0]?.uuid) {
  throw new ChatError('Invalid organizations data from Claude API', ErrorCode.NETWORK_ERROR)
}
```

## 설계 원칙 준수

### KISS (Keep It Simple, Stupid)
- 복잡한 상태 관리나 전역 플래그 추가 없음
- 기존 로직의 최소 수정으로 문제 해결

### DRY (Don't Repeat Yourself)
- 재시도 로직은 ProxyRequester 한 곳에만 존재
- API 파싱 로직은 각 API 함수에서 일관되게 적용

### 근본 원인 해결
- "두더지 잡기"식 개별 오류 수정이 아님
- 프록시 탭 준비 상태와 응답 파싱의 근본 문제 해결

## 사용자 경험 개선

### 변경 전
1. 비로그인 상태에서 채팅 시도
2. ❌ 무조건 프록시 탭 생성 시도 → 401 NO_PROXY_TAB
3. 불필요한 프록시 탭 생성

### 변경 후 (Gemini/Perplexity와 동일)
1. 비로그인 상태에서 채팅 시도
2. ✅ **먼저 background context에서 쿠키로 시도**
3. 쿠키가 있으면 → 즉시 대화 시작 (프록시 탭 불필요)
4. 쿠키가 없으면 (401/403) → 프록시 탭 생성하여 로그인 유도
5. 로그인 후 → 쿠키 기반으로 대화 (프록시 탭은 백그라운드에서 유지)

## 테스트 시나리오

1. **비로그인 → 로그인 → 새로고침 → 채팅**
   - 비로그인 상태에서 Claude 채팅 시도
   - 로그인 유도 메시지 확인
   - Claude.ai에 로그인
   - 앱으로 돌아와서 Claude 새로고침 이모지 클릭
   - 메시지 전송
   - ✅ 정상적으로 응답 수신

2. **장시간 방치 후 재사용**
   - Claude 로그인 상태로 앱 사용
   - 장시간 방치 (세션 만료 가능)
   - 메시지 전송
   - ✅ 자동으로 세션 갱신 후 정상 응답

3. **네트워크 불안정 상황**
   - 네트워크가 불안정한 환경
   - Claude 메시지 전송
   - ✅ CONNECTION_TIMEOUT 발생 시 자동 재시도

## 핵심 원칙

### Background-First 정책
1. **1단계**: Extension background context에서 쿠키로 직접 요청
2. **2단계**: 401/403 발생 시에만 프록시 탭 생성하여 로그인 유도
3. **3단계**: 로그인 후에는 다시 쿠키 기반 요청 (프록시 탭은 백그라운드 유지)

### Gemini, Perplexity와 완전 동일
- 사용자 계정 기반 API 호출
- 쿠키 우선 → 실패 시 프록시 탭
- 불필요한 프록시 탭 생성 최소화

### iframe 방식과의 차이
- **ChatGPT, Grok, Qwen, LMArena**: iframe 내장 방식 (사용자가 iframe 내에서 직접 입력)
- **Claude, Gemini, Perplexity, DeepSeek**: 사용자 계정 기반 API 호출 (쿠키 우선)

## 변경 파일

1. `src/app/utils/hybrid-requester.ts` - Background-first 정책을 모든 봇에 적용
2. `src/app/bots/claude-web/index.ts` - reuseOnly 옵션 제거, 단순화
3. `src/app/utils/proxy-requester.ts` - 재시도 로직 개선
4. `src/app/bots/claude-web/api.ts` - 안전 파싱 강화

## 결론

Claude를 Gemini, Perplexity와 동일한 방식으로 전환하여:
- ✅ 쿠키가 있으면 프록시 탭 없이 즉시 대화 가능
- ✅ 쿠키가 없을 때만 프록시 탭 생성하여 로그인 유도
- ✅ 불필요한 프록시 탭 생성 최소화
- ✅ 사용자 경험 대폭 개선
