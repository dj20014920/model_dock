# 🔴 Copilot WebSocket 1006 에러 분석

## 📊 **근본 원인**

### **실패한 연결 (Extension context)**
```
Origin: chrome-extension://dfggekbfidjflnakchdeglldplmgdoep
Cookie: (없음)
Status: 0 (연결 실패)
Error: 1006 (비정상 종료)
```

### **성공한 연결 (Browser context)**
```
Origin: https://copilot.microsoft.com
Cookie: (자동 포함)
Status: 101 (Switching Protocols)
```

---

## 🔍 **WebSocket 인증 방식 비교**

| Bot | WebSocket URL | 인증 방식 | Extension 직접 연결 |
|-----|--------------|----------|-------------------|
| **Bing** | `wss://sydney.bing.com/sydney/ChatHub?sec_access_token=...` | 토큰 기반 | ✅ 가능 |
| **Perplexity** | (사용 안 함, SSE 사용) | 쿠키 (HTTP) | ✅ hybridFetch로 가능 |
| **Copilot** | `wss://copilot.microsoft.com/c/api/chat?api-version=2` | 쿠키 (WebSocket) | ❌ 불가능 |

### **핵심 차이**

1. **Bing**: `createConversation()` API가 `encryptedConversationSignature` 토큰을 반환 → WebSocket URL에 포함 → 쿠키 불필요
2. **Copilot**: `/c/api/start` API가 토큰을 반환하지 않음 → 순수 쿠키 기반 → Same-Origin 필수

---

## 🛠 **해결 방안 (3가지)**

### **방안 1: Content Script를 통한 WebSocket 연결** ⭐ 권장
**장점**:
- 사용자 계정 기반 작동 (원래 목표 달성)
- Copilot 최신 API 사용
- 정석적인 방법

**단점**:
- 구현 복잡도 높음
- Message passing 오버헤드

**구현 방법**:
```typescript
// 1. content-script/copilot-websocket.ts 생성
// copilot.microsoft.com 페이지 내에서 WebSocket 생성

const ws = new WebSocket('wss://copilot.microsoft.com/c/api/chat?api-version=2')

ws.addEventListener('open', () => {
  // Extension으로 연결 성공 알림
  chrome.runtime.sendMessage({ type: 'WS_OPEN' })
})

ws.addEventListener('message', (event) => {
  // Extension으로 메시지 전달
  chrome.runtime.sendMessage({ type: 'WS_MESSAGE', data: event.data })
})

// Extension에서 메시지 받아서 WebSocket으로 전송
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WS_SEND') {
    ws.send(JSON.stringify(msg.data))
  }
})
```

```typescript
// 2. copilot-web/index.ts에서 content script와 통신
private async sendMessageViaWebSocket(params: SendMessageParams) {
  // Content script에 WebSocket 연결 요청
  await chrome.tabs.sendMessage(tabId, {
    type: 'CONNECT_WS',
    url: 'wss://copilot.microsoft.com/c/api/chat?api-version=2'
  })

  // 메시지 리스너 설정
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'WS_MESSAGE') {
      // 응답 처리
      const event = JSON.parse(msg.data)
      // ...
    }
  })

  // 메시지 전송
  await chrome.tabs.sendMessage(tabId, {
    type: 'WS_SEND',
    data: {
      event: 'send',
      conversationId,
      content: [{ type: 'text', text: params.prompt }],
      mode: 'chat',
      context: {},
    }
  })
}
```

---

### **방안 2: 레거시 Bing 방식으로 폴백** 🔄 간단
**장점**:
- 이미 작동하는 코드
- 구현 불필요
- 안정적

**단점**:
- 사용자 계정 사용 불가
- 제한적인 기능
- Microsoft가 언제든지 폐기 가능

**구현 방법**:
```typescript
// copilot/index.ts는 이미 폴백 로직 포함
export class CopilotBot extends AsyncAbstractBot {
  async initializeBot() {
    const { copilotMode } = await getUserConfig()

    // 설정에 관계없이 BingWebBot 사용
    return new BingWebBot()
  }
}
```

---

### **방안 3: iframe 기반 통합** 🖼️ 실험적
**장점**:
- Same-Origin 문제 우회
- 사용자 계정 사용 가능
- 구현 상대적으로 간단

**단점**:
- UI/UX 제한
- Cross-origin iframe 보안 제약
- Microsoft의 X-Frame-Options 정책에 막힐 수 있음

**구현 방법**:
```typescript
// Grok 패턴과 유사하게 iframe 내장
<iframe
  src="https://copilot.microsoft.com"
  sandbox="allow-scripts allow-same-origin allow-forms"
/>

// postMessage로 통신
iframe.contentWindow.postMessage({
  type: 'SEND_MESSAGE',
  text: 'Hello'
}, 'https://copilot.microsoft.com')
```

⚠️ **주의**: Copilot이 `X-Frame-Options: DENY`를 설정했다면 불가능

---

## 🎯 **추천 방안**

### **단기 (즉시 작동 필요)**
→ **방안 2: 레거시 Bing 방식**
- 사용자에게 "현재 Copilot은 레거시 모드로 작동합니다" 안내
- CopilotMode.Webapp을 선택해도 BingWebBot으로 폴백

### **중기 (정석적 구현)**
→ **방안 1: Content Script WebSocket**
- 시간을 들여서 제대로 구현
- 다른 봇들(Gemini, Claude)의 ProxyRequester 패턴 참고
- WebSocket 전용 message passing 구현

### **장기 (Microsoft API 변경 대응)**
- Microsoft가 토큰 기반 인증으로 변경할 수도 있음
- 주기적으로 HAR 파일 분석하여 API 변경 감지

---

## 📝 **즉시 적용 가능한 임시 해결책**

```typescript
// src/app/bots/copilot-web/index.ts

export class CopilotWebBot extends AbstractBot {
  async doSendMessage(params: SendMessageParams) {
    // 임시: 사용자에게 알림 후 에러 표시
    params.onEvent({
      type: 'ERROR',
      error: new ChatError(
        '⚠️ Copilot 웹앱 모드는 현재 기술적 제약으로 작동하지 않습니다.\n\n' +
        '해결 방법:\n' +
        '1. 설정 → Copilot Mode → "Bing (Legacy)" 선택\n' +
        '2. 또는 copilot.microsoft.com에서 직접 사용\n\n' +
        '자세한 내용: WebSocket 쿠키 인증 문제 (Error 1006)',
        ErrorCode.NETWORK_ERROR
      )
    })
  }

  get name() {
    return 'Copilot (webapp - unavailable)'
  }
}
```

---

## 🔬 **기술적 세부사항**

### WebSocket Origin 정책
```
Extension context:
  Origin: chrome-extension://xxxxx
  → 쿠키 전달 안 됨
  → WebSocket 1006 에러

Browser context (Same-Origin):
  Origin: https://copilot.microsoft.com
  → 쿠키 자동 포함
  → WebSocket 101 성공
```

### 브라우저 보안 정책
- WebSocket은 HTTP와 달리 Origin 검증이 엄격
- `credentials: 'include'` 옵션 없음
- Content script 또는 iframe만 쿠키 전달 가능

---

## 📚 참고 자료

- [WebSocket API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Chrome Extension Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Same-Origin Policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)

---

**작성일**: 2025-10-29
**상태**: WebSocket 1006 에러 원인 파악 완료, 해결 방안 3가지 제시
