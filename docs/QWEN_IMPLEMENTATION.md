# Qwen 모델 통합 구현 완료

## 개요
chat.qwen.ai 기반의 사용자 계정 방식 Qwen 모델을 성공적으로 추가했습니다.

## 구현 내역

### 1. 핵심 봇 구현
- **src/app/bots/qwen/index.ts**: 메인 Qwen 봇 클래스
  - Claude, Gemini, Perplexity와 동일한 패턴 적용
  - 웹 액세스 기능 지원
  - AsyncAbstractBot 상속

- **src/app/bots/qwen-web/index.ts**: Qwen 웹 봇 구현
  - API 엔드포인트: `https://chat.qwen.ai/api/v2/chat/completions`
  - SSE(Server-Sent Events) 스트리밍 지원
  - 대화 컨텍스트 유지 (chatId, parentId)
  - 모델: qwen3-max

### 2. 타입 및 설정 업데이트
- **src/app/bots/index.ts**
  - BotId 타입에 'qwen' 추가
  - createBotInstance에 qwen 케이스 추가
  - QwenBot import 추가

- **src/app/consts.ts**
  - CHATBOTS 레코드에 qwen 추가
  - 기존 qianwen 로고 재사용

- **src/services/user-config.ts**
  - qwenWebAccess 설정 추가

### 3. UI 컴포넌트 업데이트
- **src/app/components/Chat/WebAccessCheckbox.tsx**
  - qwen: 'qwenWebAccess' 매핑 추가

### 4. 권한 설정
- **manifest.config.ts**
  - host_permissions에 'https://chat.qwen.ai/*' 추가

## API 구조 분석

### 요청 형식
```json
{
  "stream": true,
  "incremental_output": true,
  "chat_id": "uuid",
  "chat_mode": "guest",
  "model": "qwen3-max",
  "parent_id": null,
  "messages": [{
    "fid": "message-uuid",
    "role": "user",
    "content": "사용자 메시지",
    "timestamp": 1761719002,
    "chat_type": "t2t",
    "feature_config": {
      "thinking_enabled": false,
      "output_schema": "phase"
    }
  }],
  "timestamp": 1761719002
}
```

### 응답 형식 (SSE)
```
data: {"response.created":{"chat_id":"...","parent_id":"...","response_id":"..."}}

data: {"choices":[{"delta":{"role":"assistant","content":"안녕","phase":"answer","status":"typing"}}],"usage":{...}}

data: {"choices":[{"delta":{"role":"assistant","content":"","phase":"answer","status":"finished"}}]}
```

## 기존 모델과의 차이점

### Qianwen (구버전) vs Qwen (신버전)
- **Qianwen**: qianwen.aliyun.com 사용, 구 API
- **Qwen**: chat.qwen.ai 사용, 최신 API (qwen3-max)
- 두 모델 모두 유지하여 하위 호환성 보장

## 테스트 체크리스트
- [x] 타입 에러 없음 (getDiagnostics 통과)
- [x] 봇 인스턴스 생성 로직 추가
- [x] 웹 액세스 설정 UI 연동
- [x] 권한 설정 추가
- [ ] 실제 대화 테스트 필요
- [ ] 대화 컨텍스트 유지 테스트 필요
- [ ] 에러 핸들링 테스트 필요

## 다음 단계
1. 빌드 및 로컬 테스트
2. chat.qwen.ai 로그인 후 실제 대화 테스트
3. 에러 케이스 처리 보완
4. 다국어 지원 추가 (필요시)

## 참고사항
- Qwen은 사용자 계정 기반으로 동작 (guest 모드 지원)
- API Key 방식은 현재 미지원 (추후 확장 가능)
- 기존 qianwen 봇과 별도로 유지되어 사용자 선택 가능
