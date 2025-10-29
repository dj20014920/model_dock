# 🔍 Microsoft Copilot API 분석 결과

## 📋 요약

**404 에러의 근본 원인**: Microsoft가 Copilot API를 **완전히 재설계**했습니다.
- 기존 API: `/turing/conversation/create` (폐기됨 ❌)
- 새 API: `/c/api/start` + WebSocket (현재 사용 중 ✅)

## 🚨 중요: CSP 문제는 존재하지 않습니다!

제안된 해결책(`document_idle` 등)은 **불필요**합니다. 단순히 **구식 API를 사용해서 404**가 발생한 것입니다.

---

## 🆕 새로운 Copilot API 구조

### 1️⃣ Conversation 시작
```http
POST https://copilot.microsoft.com/c/api/start
Content-Type: application/json

{
  "timeZone": "Asia/Seoul",
  "startNewConversation": true,
  "teenSupportEnabled": true,
  "correctPersonalizationSetting": true,
  "performUserMerge": true,
  "deferredDataUseCapable": true
}
```

**응답**:
```json
{
  "currentConversationId": "cBRigFoz6m8cyr4ZpYXrv",
  "isNewUser": false,
  "allowBeta": false,
  "remainingTurns": 1000,
  "features": [...]
}
```

### 2️⃣ WebSocket 연결
```http
GET wss://copilot.microsoft.com/c/api/chat?api-version=2
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Version: 13
```

**응답**: `101 Switching Protocols`

### 3️⃣ 옵션 설정 (WebSocket send)
```json
{
  "event": "setOptions",
  "supportedFeatures": ["partial-generated-images"],
  "supportedCards": ["weather", "local", "image", "sports", "video", ...]
}
```

### 4️⃣ 메시지 전송 (WebSocket send)
```json
{
  "event": "send",
  "conversationId": "cBRigFoz6m8cyr4ZpYXrv",
  "content": [
    {
      "type": "text",
      "text": "안녕하세요"
    }
  ],
  "mode": "chat",
  "context": {}
}
```

### 5️⃣ 응답 수신 (WebSocket receive)

**연결 확인**:
```json
{
  "event": "connected",
  "requestId": "69018ca896854ef9a1c04c52e256d9c6",
  "id": "0"
}
```

**메시지 수신**:
```json
{
  "event": "received",
  "conversationId": "cBRigFoz6m8cyr4ZpYXrv",
  "messageId": "oH2tEdL6rGi5GYHVUigAS",
  "createdAt": "2025-10-29T03:40:24.7035229+00:00",
  "id": "1"
}
```

**스트리밍 응답** (예상):
```json
{
  "event": "update",
  "conversationId": "...",
  "messageId": "...",
  "content": "안녕하세요! 무엇을 도와드릴까요?"
}
```

**완료 시그널**:
```json
{
  "event": "done",
  "conversationId": "...",
  "messageId": "..."
}
```

---

## 🔄 기존 API vs 새 API 비교

| 구분 | 기존 API (폐기) | 새 API (현재) |
|------|----------------|--------------|
| **Conversation 생성** | `GET /turing/conversation/create` | `POST /c/api/start` |
| **메시지 전송** | `POST /turing/conversation/chathub` (SSE) | WebSocket (`wss://.../c/api/chat`) |
| **응답 형식** | Server-Sent Events (SSE) | WebSocket bidirectional |
| **상태** | ❌ 404 에러 | ✅ 작동 중 |

---

## ✅ 구현 방향

1. **`CopilotWebBot` 완전 재작성** 필요
2. **WebSocket 라이브러리** 사용 (예: native `WebSocket` API)
3. **hybridFetch는 `/c/api/start`에만 사용**, 이후는 WebSocket
4. **Gemini/Claude 패턴 불가**: WebSocket은 본질적으로 다른 구조

---

## 🚧 구현 시 고려사항

### 보안
- WebSocket은 Extension context에서 직접 연결 가능
- 하지만 쿠키 기반 인증이 필요하므로 **content script를 통한 연결 필요**

### 에러 처리
- WebSocket 연결 실패 시 재시도 로직
- 타임아웃 처리
- 연결 끊김 감지

### 성능
- 메시지 순서 보장
- 스트리밍 응답 처리
- 메모리 관리 (연결 유지 시)

---

## 📝 결론

**CSP 해결책은 불필요합니다.** 단순히 **새 API로 교체**하면 됩니다.

구현 난이도: **중상** (WebSocket 처리 필요)
