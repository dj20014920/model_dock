# ChatHub HAR 분석 결과 (chathubgpt대화.har)

## 🎯 핵심 발견사항

### 1. **Turnstile 관련**
- ❌ **Turnstile 관련 요청 없음!**
- HAR 파일에서 `turnstile` 또는 `challenges.cloudflare.com` 관련 요청이 **0개**
- ChatHub는 Turnstile을 **사용하지 않음**

### 2. **인증 방식**

#### A. Authorization 헤더
- ❌ **Authorization 헤더 없음**
- Bearer 토큰 사용하지 않음

#### B. 사용하는 헤더들
ChatHub는 다음 **3개의 OpenAI 전용 헤더**를 사용:

```javascript
{
  // 1. 디바이스 ID
  "oai-device-id": "ea580ef4-f52d-4556-b0e7-e69a8df7e7c1",

  // 2. 언어 설정
  "oai-language": "en-US",

  // 3. Chat Requirements 토큰 (중요!)
  "openai-sentinel-chat-requirements-token": "gAAAAABo9322oYuaqF9U7otU...",

  // 4. Proof 토큰 (중요!)
  "openai-sentinel-proof-token": "gAAAAABWzI3MzgsIlR1ZSBPY3Qg..."
}
```

### 3. **인증 플로우**

#### Step 1: Chat Requirements 요청
```http
POST /backend-api/sentinel/chat-requirements
Content-Type: application/json

{
  "p": "gAAAAACWzI3MzgsIlR1ZSBPY3Qg..." // Base64 인코딩된 proof
}
```

#### Step 2: Chat Requirements 응답
```json
{
  "persona": "chatgpt-paid",
  "token": "gAAAAABo9322oYuaqF9U7otU...",  // 이 토큰을 다음 요청에 사용
  "expire_after": 540,
  "expire_at": 1761050578,
  "turnstile": {
    "required": true,  // ⚠️ 서버는 turnstile required라고 하지만
    "dx": "PBp5bWFxbWRJZRN1J0tT..."  // 실제로는 사용하지 않음!
  }
}
```

#### Step 3: Conversation 요청
위에서 받은 토큰들을 헤더에 넣어서 요청:

```http
POST /backend-api/conversation
Accept: text/event-stream
Content-Type: application/json

Headers:
- oai-device-id: ea580ef4-f52d-4556-b0e7-e69a8df7e7c1
- oai-language: en-US
- openai-sentinel-chat-requirements-token: gAAAAABo9322... (Step 2에서 받은 토큰)
- openai-sentinel-proof-token: gAAAAABWzI3MzgsIlR1ZSB... (Step 1에서 보낸 proof)
```

### 4. **cf_clearance 쿠키**
- ❌ **cf_clearance 쿠키 없음!**
- Cookie 헤더 자체가 요청에 포함되지 않음
- CloudFlare 우회 필요 없음

### 5. **Accept 헤더**
```http
Accept: text/event-stream  // SSE 스트리밍 응답 받기 위해
```

### 6. **요청 바디**
```json
{
  "action": "next",
  "conversation_mode": {
    "kind": "primary_assistant"
  },
  "force_nulligen": false,
  "force_paragen": false,
  "force_paragen_model_slug": "",
  "force_rate_limit": false,
  "force_use_sse": true,
  "history_and_training_disabled": false,
  "messages": [{
    "id": "becce22d-d5bd-45d3-93d9-5ff67da7320e",
    "author": {
      "role": "user"
    },
    "content": {
      "content_type": "text",
      "parts": ["gpgp"]
    }
  }],
  "model": "auto",
  "parent_message_id": "19c017ce-59ec-4d4a-bdb7-0b97e0761267",
  "suggestions": []
}
```

---

## 🔍 우리 구현과의 비교

### ❌ 우리가 잘못한 점

1. **Authorization 헤더 사용**
   - 우리: `Authorization: Bearer sess-xxx`
   - ChatHub: Authorization 헤더 없음 ❌

2. **cf_clearance 쿠키 추가**
   - 우리: `Cookie: cf_clearance=xxx`
   - ChatHub: 쿠키 헤더 자체가 없음 ❌

3. **Turnstile 토큰 추가 시도**
   - 우리: `openai-sentinel-turnstile-token` 헤더 추가 시도
   - ChatHub: Turnstile 관련 헤더/요청 전혀 없음 ❌

### ✅ 올바른 구현 방법

1. **Chat Requirements 먼저 호출**
   ```typescript
   const reqData = {
     p: generateProofToken() // Base64 인코딩된 proof
   }

   const response = await fetch('/backend-api/sentinel/chat-requirements', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'oai-device-id': deviceId,
       'oai-language': 'en-US'
     },
     body: JSON.stringify(reqData)
   })

   const { token } = await response.json()
   ```

2. **받은 토큰으로 Conversation 호출**
   ```typescript
   const response = await fetch('/backend-api/conversation', {
     method: 'POST',
     headers: {
       'Accept': 'text/event-stream',
       'Content-Type': 'application/json',
       'oai-device-id': deviceId,
       'oai-language': 'en-US',
       'openai-sentinel-chat-requirements-token': token,
       'openai-sentinel-proof-token': proofToken,
       // ❌ Authorization 헤더 없음!
       // ❌ Cookie 헤더 없음!
     },
     body: JSON.stringify(conversationData)
   })
   ```

---

## 📋 수정 필요 사항

### src/app/bots/chatgpt-webapp/index.ts
1. `buildHeaders()` 메서드 수정:
   - ❌ Authorization 헤더 제거
   - ❌ cf_clearance 쿠키 제거
   - ✅ openai-sentinel-* 헤더만 사용

2. Chat Requirements API 호출 로직 검증:
   - Proof 토큰 생성 방식 확인
   - 응답에서 토큰 제대로 추출하는지 확인

### src/app/utils/hybrid-requester.ts
- Authorization 헤더 관련 로직 제거

### src/app/utils/proxy-requester.ts
- cf_clearance 쿠키 관련 로직 제거

---

## 🎯 결론

**ChatHub는 Turnstile을 우회하는 것이 아니라, 애초에 사용하지 않습니다!**

OpenAI의 새로운 Sentinel 시스템을 사용:
1. Chat Requirements API로 토큰 받기
2. 받은 토큰을 헤더에 넣어서 Conversation API 호출
3. Authorization 헤더도, cf_clearance 쿠키도 필요 없음

우리가 403 에러를 받는 이유는:
- ❌ 불필요한 Authorization 헤더 때문
- ❌ 불필요한 cf_clearance 쿠키 때문
- ❌ Turnstile 관련 불필요한 처리 때문

**해결책**: 모든 불필요한 인증 로직을 제거하고, **오직 Sentinel 토큰만 사용**하면 됩니다!
