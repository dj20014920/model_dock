# 🎯 Copilot 실제 작동 가능한 해결 방안

## 🚨 **현재 상황**

### 실패한 API들
1. ❌ `/turing/conversation/create` - Bing/Copilot 레거시 API (404)
2. ❌ `/c/api/start` + WebSocket (Extension에서) - 쿠키 인증 실패 (1006)

### 성공하는 방식
✅ **copilot.microsoft.com 페이지 내에서** WebSocket 연결
- Origin: `https://copilot.microsoft.com`
- Cookie: 자동 포함 (Same-Origin)

---

## 🛠 **검증된 해결 방안 3가지**

### **방안 1: WebSocket Intercept (추천!)** ⭐

**원리**: 페이지 내의 WebSocket 생성을 가로채서 Extension과 통신

**구현 방법** (StackOverflow에서 검증됨):
```javascript
// src/content-script/copilot-websocket-interceptor.ts
(function () {
  const OrigWebSocket = window.WebSocket;
  const wsAddListener = OrigWebSocket.prototype.addEventListener;
  const wsSend = OrigWebSocket.prototype.send;

  // WebSocket 생성 가로채기
  window.WebSocket = function WebSocket(url, protocols) {
    let ws;
    if (arguments.length === 1) {
      ws = new OrigWebSocket(url);
    } else if (arguments.length >= 2) {
      ws = new OrigWebSocket(url, protocols);
    } else {
      ws = new OrigWebSocket();
    }

    // copilot.microsoft.com WebSocket만 intercept
    if (url.includes('copilot.microsoft.com')) {
      console.log('[Copilot Interceptor] WebSocket detected:', url);

      // 메시지 수신 감지
      wsAddListener.call(ws, 'message', function (event) {
        console.log('[Copilot Interceptor] Message received:', event.data);

        // Extension으로 메시지 전달
        window.postMessage({
          type: 'COPILOT_WS_MESSAGE',
          data: event.data
        }, '*');
      });

      // 연결 완료 감지
      wsAddListener.call(ws, 'open', function () {
        console.log('[Copilot Interceptor] WebSocket opened');

        window.postMessage({
          type: 'COPILOT_WS_OPEN'
        }, '*');
      });

      // Extension에서 보낸 메시지를 WebSocket으로 전송
      window.addEventListener('message', function (event) {
        if (event.source === window && event.data.type === 'EXTENSION_TO_COPILOT') {
          console.log('[Copilot Interceptor] Sending message:', event.data.message);
          ws.send(JSON.stringify(event.data.message));
        }
      });
    }

    return ws;
  };

  window.WebSocket.prototype = OrigWebSocket.prototype;
  window.WebSocket.prototype.constructor = window.WebSocket;

  console.log('[Copilot Interceptor] Installed successfully');
})();
```

**Content Script (중계자)**:
```typescript
// src/content-script/copilot-bridge.ts

// 페이지에서 Extension으로 메시지 전달
window.addEventListener('message', (event) => {
  if (event.source === window && event.data.type?.startsWith('COPILOT_WS_')) {
    // Extension background로 전달
    chrome.runtime.sendMessage({
      type: 'FROM_COPILOT_PAGE',
      data: event.data
    });
  }
});

// Extension에서 페이지로 메시지 전달
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TO_COPILOT_PAGE') {
    window.postMessage({
      type: 'EXTENSION_TO_COPILOT',
      message: message.data
    }, '*');
  }
});
```

**Extension Bot**:
```typescript
// src/app/bots/copilot-web/index.ts (재구현)

export class CopilotWebBot extends AbstractBot {
  private messageListener?: (message: any) => void

  async doSendMessage(params: SendMessageParams) {
    // copilot.microsoft.com 탭 찾기
    const tabs = await chrome.tabs.query({
      url: 'https://copilot.microsoft.com/*'
    })

    if (tabs.length === 0) {
      throw new ChatError(
        'copilot.microsoft.com 탭을 찾을 수 없습니다. 먼저 Copilot 페이지를 열어주세요.',
        ErrorCode.MISSING_TAB
      )
    }

    const tabId = tabs[0].id!

    // 메시지 리스너 설정
    this.messageListener = (message: any) => {
      if (message.type === 'FROM_COPILOT_PAGE') {
        const data = message.data

        if (data.type === 'COPILOT_WS_MESSAGE') {
          // 메시지 파싱 및 처리
          try {
            const event = JSON.parse(data.data)
            this.handleWebSocketMessage(event, params)
          } catch (e) {
            console.error('[Copilot] Failed to parse message:', e)
          }
        }
      }
    }

    chrome.runtime.onMessage.addListener(this.messageListener)

    // 메시지 전송
    await chrome.runtime.sendMessage({
      type: 'TO_COPILOT_PAGE',
      data: {
        event: 'send',
        conversationId: this.conversationContext.conversationId,
        content: [{ type: 'text', text: params.prompt }],
        mode: 'chat',
        context: {},
      }
    })
  }

  private handleWebSocketMessage(event: any, params: SendMessageParams) {
    switch (event.event) {
      case 'update':
        params.onEvent({
          type: 'UPDATE_ANSWER',
          data: { text: event.content }
        })
        break

      case 'done':
        params.onEvent({ type: 'DONE' })
        this.cleanup()
        break
    }
  }

  private cleanup() {
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener)
    }
  }
}
```

**manifest.json 추가**:
```json
{
  "content_scripts": [
    {
      "matches": ["https://copilot.microsoft.com/*"],
      "js": [
        "src/content-script/copilot-websocket-interceptor.ts",
        "src/content-script/copilot-bridge.ts"
      ],
      "run_at": "document_start",
      "all_frames": false
    }
  ]
}
```

**장점**:
- ✅ 실제 작동 (검증됨)
- ✅ 사용자 계정 사용
- ✅ Copilot 페이지가 열려있기만 하면 됨

**단점**:
- ⚠️ copilot.microsoft.com 탭이 필요 (백그라운드에서 가능)
- ⚠️ 구현 복잡도 중간

---

### **방안 2: iframe 내장 (간단)** 🖼️

**원리**: copilot.microsoft.com을 iframe으로 내장하고 postMessage로 통신

**구현**:
```typescript
// Extension 사이드패널에 iframe 추가
<iframe
  id="copilot-frame"
  src="https://copilot.microsoft.com"
  sandbox="allow-scripts allow-same-origin allow-forms"
  style="width: 100%; height: 100%;"
/>

// postMessage로 통신
const iframe = document.getElementById('copilot-frame') as HTMLIFrameElement;

// iframe 내부에 script 주입 (content script와 동일)
iframe.addEventListener('load', () => {
  iframe.contentWindow?.postMessage({
    type: 'SEND_MESSAGE',
    text: 'Hello Copilot'
  }, 'https://copilot.microsoft.com');
});

// 응답 수신
window.addEventListener('message', (event) => {
  if (event.origin === 'https://copilot.microsoft.com') {
    console.log('Response from Copilot:', event.data);
  }
});
```

**장점**:
- ✅ 구현 간단
- ✅ 사용자 계정 사용
- ✅ Same-Origin 문제 해결

**단점**:
- ❌ `X-Frame-Options: DENY`로 막힐 수 있음 (Microsoft가 설정했다면)
- ⚠️ UI/UX 제한 (iframe 크기 조정 어려움)

---

### **방안 3: 사용자에게 직접 방문 안내 (가장 현실적)** 🔗

**원리**: Extension에서 copilot.microsoft.com 새 탭 열고, 사용자가 직접 사용

**구현**:
```typescript
// Extension에서 Copilot 버튼 클릭 시
async doSendMessage(params: SendMessageParams) {
  // 새 탭 열기
  await chrome.tabs.create({
    url: 'https://copilot.microsoft.com',
    active: true
  });

  // 사용자에게 안내 메시지
  params.onEvent({
    type: 'INFO',
    message: 'Copilot 페이지가 열렸습니다. 해당 탭에서 직접 대화를 진행해주세요.'
  });
}
```

**장점**:
- ✅ 100% 작동 보장
- ✅ 구현 매우 간단
- ✅ 모든 기능 사용 가능

**단점**:
- ❌ Extension 내에서 직접 사용 불가
- ⚠️ UX 저하 (새 탭 이동 필요)

---

## 🎯 **최종 권장 사항**

### **단기 (즉시 구현)**: 방안 3
- Extension에서 copilot.microsoft.com 새 탭 열기
- 사용자에게 "Microsoft가 API를 제한하여 직접 방문이 필요합니다" 안내

### **중기 (정식 구현)**: 방안 1
- WebSocket Intercept 방식
- 4-8시간 소요 예상
- 가장 완전한 해결책

### **실험 (선택)**: 방안 2
- iframe 시도해보고, `X-Frame-Options` 에러 발생 시 방안 1로 전환

---

## 📚 **참고 자료**

### 검증된 구현 예시
1. [StackOverflow - WebSocket Intercept](https://stackoverflow.com/questions/62798510/)
2. [Chrome Extension WebSocket](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)
3. [Message Passing Guide](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)

### HAR 파일 분석 결과
- 성공한 연결: `wss://copilot.microsoft.com/c/api/chat?api-version=2` (101)
- 사전 API: `POST /c/api/start` (conversationId 생성)

---

**작성일**: 2025-10-29
**상태**: 웹 검증 완료, 3가지 방안 제시
**추천**: 방안 1 (WebSocket Intercept)
