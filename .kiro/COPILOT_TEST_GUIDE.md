# 🧪 Microsoft Copilot 테스트 가이드

## ✅ 완료된 작업

### 1. 근본 원인 파악
- **문제**: `/turing/conversation/create` API 폐기로 인한 404 에러
- **해결**: 새로운 API `/c/api/start` + WebSocket으로 전환

### 2. 구현 완료
- **파일**: [copilot-web/index.ts](../src/app/bots/copilot-web/index.ts)
- **API 구조**:
  1. POST `/c/api/start` → conversationId 획득
  2. WebSocket `wss://copilot.microsoft.com/c/api/chat?api-version=2` → 메시지 송수신

### 3. 권한 추가
- `manifest.config.ts`:
  - WebSocket 권한: `wss://copilot.microsoft.com/*`, `wss://*.bing.com/*`
  - web_accessible_resources에 copilot.microsoft.com 추가

---

## 🚀 테스트 방법

### 1단계: Chrome 확장 프로그램 로드

```bash
# 1. 기존 확장 프로그램 완전 제거
# Chrome → 확장 프로그램 관리 → ChatHub 제거

# 2. Chrome 완전히 종료 후 재시작

# 3. dist 폴더 로드
# Chrome → 확장 프로그램 관리 → 개발자 모드 활성화
# → "압축 해제된 확장 프로그램을 로드합니다" 클릭
# → /Users/dj20014920/Desktop/model-dock/dist 선택
```

### 2단계: Copilot 테스트

```bash
# 1. https://copilot.microsoft.com 열기

# 2. Microsoft 계정으로 로그인 (필수!)
#    - 로그인하지 않으면 쿠키 기반 인증 실패

# 3. ChatHub 사이드패널 열기 (Cmd+J 또는 확장 아이콘 클릭)

# 4. Copilot 선택 후 메시지 전송
#    - 예: "안녕하세요"

# 5. 콘솔 로그 확인 (F12 → Console)
```

### 3단계: 예상 로그 확인

#### ✅ 성공 시 로그:
```
[Copilot] 🚀 Creating conversation via /c/api/start
[Copilot] ✅ Conversation created: cBRigFoz6m8cyr4ZpYXrv
[Copilot] 🔌 Connecting to WebSocket...
[Copilot] ✅ WebSocket connected
[Copilot] 📨 Message received: oH2tEdL6rGi5GYHVUigAS
[Copilot] 📥 WS Event: update
[Copilot] ✅ Message completed
[Copilot] 🔌 WebSocket closed
```

#### ❌ 실패 시 체크리스트:

**1. 404 에러가 여전히 발생:**
```
[Copilot] Error: Failed to create conversation: 404
```
→ **원인**: 빌드가 제대로 안 됨 또는 캐시 문제
→ **해결**: Chrome 완전 재시작, 확장 프로그램 다시 로드

**2. WebSocket 연결 실패:**
```
[Copilot] ❌ Failed to connect WebSocket: ...
```
→ **원인**: 권한 문제 또는 로그인 안 됨
→ **해결**: copilot.microsoft.com에서 로그인 확인

**3. Content script 에러:**
```
[PROXY-FETCH] ⚠️ Content script ping failed after all retries
```
→ **원인**: 이 에러는 이제 **무시해도 됨** (WebSocket은 content script 불필요)

**4. 응답이 안 옴:**
```
[Copilot] 🔌 WebSocket closed before receiving response
```
→ **원인**: WebSocket 메시지 형식 오류 또는 서버 측 문제
→ **해결**: 로그에서 `📥 WS Event:` 메시지 확인, HAR 파일과 비교

---

## 🐛 디버깅 팁

### 1. 전체 로그 확인
```javascript
// Console에서 실행
localStorage.debug = '*'
// 페이지 새로고침 후 다시 테스트
```

### 2. WebSocket 메시지 모니터링
```
F12 → Network 탭 → WS 필터 → copilot.microsoft.com 클릭
→ Messages 탭에서 송수신 데이터 확인
```

### 3. HAR 파일과 비교
```bash
# 실제 작동하는 브라우저의 HAR 파일과 비교
python3 .kiro/analyze_copilot_har.py har/copilot.microsoft.com비로그인대화.txt
```

---

## 📊 성공 기준

✅ **완전 성공**:
- Conversation 생성 성공 (200 OK)
- WebSocket 연결 성공 (101 Switching Protocols)
- 메시지 전송 및 응답 수신 성공
- UI에 답변 표시됨

⚠️ **부분 성공**:
- Conversation 생성 성공하지만 WebSocket 연결 실패
- 메시지 전송은 되지만 응답이 안 옴

❌ **실패**:
- 404 에러 (API 엔드포인트 오류)
- 401/403 에러 (인증 실패)
- WebSocket 연결 자체가 안 됨

---

## 🔄 추가 개선 사항 (선택)

### 1. 에러 메시지 개선
현재는 일반적인 에러만 표시. 사용자 친화적인 메시지로 개선 가능:
```typescript
if (error.message.includes('401')) {
  return '로그인이 필요합니다. copilot.microsoft.com에서 로그인해주세요.'
}
```

### 2. 재시도 로직 추가
WebSocket 연결 실패 시 자동 재시도:
```typescript
for (let i = 0; i < 3; i++) {
  try {
    await this.wsp.open()
    break
  } catch (error) {
    if (i === 2) throw error
    await sleep(1000 * (i + 1))
  }
}
```

### 3. 스트리밍 응답 개선
현재는 `update` 이벤트만 처리. 다른 이벤트 타입도 처리 가능:
- `appendContent`: 증분 업데이트
- `partialUpdate`: 부분 업데이트
- `contentUpdate`: 콘텐츠 변경

---

## 📚 참고 문서

- [API 분석 결과](.kiro/COPILOT_API_ANALYSIS.md)
- [구현 코드](../src/app/bots/copilot-web/index.ts)
- [HAR 분석 스크립트](.kiro/analyze_copilot_har.py)

---

## 💬 문의 및 피드백

테스트 중 문제가 발생하면:
1. 콘솔 로그 전체 복사
2. Network 탭의 WebSocket 메시지 캡처
3. 재현 단계 기록
