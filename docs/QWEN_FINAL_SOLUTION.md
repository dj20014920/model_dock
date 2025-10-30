# Qwen 봇 최종 해결 방안

## 문제 분석

### 에러 메시지
```
[HYBRID-FETCH] 📡 ProxyRequester result: 401 NO_PROXY_TAB
Qwen API error: 401
```

### 근본 원인
`reuseOnly: true` 옵션 사용 시, 기존 Qwen 탭이 없으면 새 탭을 생성하지 않고 에러 반환

```typescript
// ProxyRequester.ts
if (this.opts.reuseOnly) return null as unknown as Browser.Tabs.Tab
// → 401 NO_PROXY_TAB 에러 발생
```

## 해결 방법

### 옵션 1: 자동 탭 생성 (채택)
```typescript
hybridFetch(
  url,
  options,
  { homeUrl: 'https://chat.qwen.ai', hostStartsWith: 'https://chat.qwen.ai' },
  { reuseOnly: false }, // ← 자동으로 탭 생성
)
```

**장점:**
- 사용자가 별도로 탭을 열 필요 없음
- 즉시 사용 가능
- 사용자 경험 향상

**단점:**
- 탭이 자동으로 생성됨 (핀 고정됨)

### 옵션 2: 수동 탭 열기 (Claude/DeepSeek 방식)
```typescript
{ reuseOnly: true } // ← 기존 탭만 사용
```

**장점:**
- 탭 생성 제어 가능
- 명시적인 사용자 동작 필요

**단점:**
- 사용자가 먼저 chat.qwen.ai를 열어야 함
- 초보자에게 불편

## 다른 봇들과의 비교

| 봇 | 방식 | reuseOnly | 탭 생성 |
|---|---|---|---|
| **ChatGPT** | hybridFetch | 설정 가능 | 자동/수동 선택 |
| **Claude** | hybridFetch | true | 수동 (사용자가 열어야 함) |
| **DeepSeek** | hybridFetch | true | 수동 (사용자가 열어야 함) |
| **Qwen** | hybridFetch | **false** | **자동 생성** |
| **Grok** | iframe | N/A | iframe 내장 |
| **LMArena** | iframe | N/A | iframe 내장 |

## 왜 iframe이 아닌가?

### iframe이 필요한 경우
1. **API가 완전히 차단됨** (LMArena, Grok)
2. **복잡한 인증 플로우** (OAuth, 2FA 등)
3. **UI 상호작용 필수** (버튼 클릭, 폼 입력 등)

### Qwen은 API 방식이 가능
1. ✅ **Guest 모드 지원** - 로그인 불필요
2. ✅ **단순한 REST API** - JSON 요청/응답
3. ✅ **SSE 스트리밍** - 표준 프로토콜
4. ✅ **CORS 우회 가능** - 프록시 탭 방식

### iframe의 단점
- 복잡한 구현 (Declarative Net Request 규칙 필요)
- 제한된 제어 (iframe 내부 접근 불가)
- 성능 오버헤드
- 유지보수 어려움

## 최종 구현

```typescript
export class QwenWebBot extends AbstractBot {
  async doSendMessage(params: SendMessageParams) {
    // 권한 확인
    if (!(await requestHostPermission('https://chat.qwen.ai/*'))) {
      throw new ChatError('Missing chat.qwen.ai permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    // 대화 컨텍스트 초기화
    if (!this.conversationContext) {
      const chatId = uuid()
      this.conversationContext = { chatId, parentId: null }
    }

    // API 요청 (자동 탭 생성)
    const resp = await hybridFetch(
      `https://chat.qwen.ai/api/v2/chat/completions?chat_id=${this.conversationContext.chatId}`,
      {
        method: 'POST',
        signal: params.signal,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          Accept: '*/*',
          source: 'web',
          timezone: timezoneHeader,
          'x-accel-buffering': 'no',
        },
        body: JSON.stringify(requestBody),
      },
      { homeUrl: 'https://chat.qwen.ai', hostStartsWith: 'https://chat.qwen.ai' },
      { reuseOnly: false }, // 자동 탭 생성
    )

    // SSE 스트리밍 처리
    await parseSSEResponse(resp, (message) => {
      if (message === '[DONE]') {
        params.onEvent({ type: 'DONE' })
        return
      }
      // ... 메시지 파싱
    })
  }
}
```

## 사용 방법

1. **확장 프로그램 다시 로드**
   - `chrome://extensions/`
   - "다시 로드" 버튼 클릭

2. **Qwen 봇 선택**
   - 확장 프로그램에서 Qwen 선택

3. **메시지 전송**
   - 자동으로 chat.qwen.ai 탭이 생성됨 (핀 고정)
   - 메시지 전송 및 응답 수신

## 빌드 완료
- ✅ TypeScript 컴파일 성공
- ✅ Vite 빌드 성공
- ✅ 진단 오류 없음
- ✅ 파일 크기: 1,381.26 kB (gzip: 454.04 kB)

## 결론

**Qwen은 iframe이 아닌 API 방식으로 충분히 구현 가능합니다.**

- 간단하고 명확한 구현
- 표준 프로토콜 사용 (REST API + SSE)
- 자동 탭 생성으로 사용자 편의성 향상
- 유지보수 용이

iframe 방식은 API가 완전히 차단된 경우에만 사용하는 최후의 수단입니다.
