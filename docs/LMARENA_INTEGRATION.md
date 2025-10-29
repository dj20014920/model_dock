# LM Arena 통합 가이드

## 개요

LM Arena (lmarena.ai)는 다양한 AI 모델을 비교하고 평가할 수 있는 플랫폼입니다. 이 통합을 통해 사용자는 세 가지 모드로 LM Arena의 모델들과 대화할 수 있습니다.

## 지원 모드

### 1. Direct Chat (직접 대화)
- 특정 모델을 선택하여 직접 대화
- 30개 이상의 최신 AI 모델 지원
- 실시간 스트리밍 응답

### 2. Battle (배틀)
- 두 익명 모델이 무작위로 선택됨
- 대화 후 어느 모델이 더 나은지 투표
- 모델 성능 비교 및 평가에 유용

### 3. Side-by-Side (나란히 비교)
- 두 모델을 동시에 선택하여 비교
- 같은 질문에 대한 두 모델의 응답을 동시에 확인
- 모델 간 차이점 분석에 최적

## 지원 모델 (2025년 최신 - 200개 이상)

### OpenAI (최신 GPT-5 시리즈 포함)
- **GPT-5 Series**: GPT-5 High, GPT-5 Chat, GPT-5 Mini High, GPT-5 Nano High
- **GPT-4.5 Series**: GPT-4.5 Preview
- **GPT-4.1 Series**: GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano
- **GPT-4o Series**: ChatGPT-4o Latest, GPT-4o
- **o Series**: o3, o4 Mini, o1, o1 Preview, o1 Mini
- 기타 GPT-4, GPT-3.5 시리즈

### Anthropic (Claude 4 시리즈 포함)
- **Claude 4 Thinking**: Opus 4.1 Thinking 16K, Sonnet 4.5 Thinking 32K
- **Claude 4**: Opus 4.1, Sonnet 4.5, Opus 4, Sonnet 4, Haiku 4.5
- **Claude 3**: 3.7 Sonnet Thinking, 3.5 Haiku, 3 Opus, 3 Sonnet, 3 Haiku

### Google (Gemini 2.5 시리즈)
- **Gemini 2.5**: Pro, Flash Preview, Flash Lite
- **Gemini 1.5**: Pro, Flash, Flash 8B
- Gemini Advanced, Gemini Pro

### Meta (Llama 4 시리즈 포함)
- **Llama 4**: Maverick 17B, Scout 17B
- **Llama 3.3**: 70B, Nemotron 49B
- **Llama 3.1**: 405B (BF16/FP8), 70B, Nemotron 70B/51B, Tulu 3, 8B
- **Llama 3**: 70B, 8B, 3.2 (3B/1B)
- Llama 2 시리즈

### DeepSeek (V3.2 최신 버전)
- **V3 Series**: V3.2 Exp Thinking, V3.1, V3.1 Terminus, V3
- **V2 Series**: V2.5
- **R1 Series**: R1 0528, R1
- DeepSeek Coder V2

### Alibaba (Qwen 3 시리즈)
- **Qwen 3**: Max Preview, 235B A22B (Thinking/No-Thinking), VL 235B, Next 80B, 30B, Coder 480B
- **Qwen 2.5**: Max, Plus, 72B, Coder 32B
- **Qwen 2**: 72B
- Qwen 1.5 시리즈, QwQ 32B

### Zhipu AI (GLM 4.6)
- GLM-4.6, GLM-4.5, GLM-4.5 Air, GLM-4 Plus
- ChatGLM 시리즈

### xAI (Grok 4)
- Grok 4 Fast, Grok 4, Grok 3 Preview, Grok 2, Grok 2 Mini

### Mistral AI
- Mistral Large (2411/2407/2402)
- Mistral Medium (2508/2505)
- Mistral Small 3.1 24B
- Mixtral 8x22B, 8x7B
- Ministral 8B

### 기타 주요 모델
- **Moonshot AI**: Kimi K2
- **Tencent**: Hunyuan T1, Hunyuan Large/Standard
- **01.AI**: Yi Lightning, Yi 1.5 34B
- **Amazon**: Nova Pro/Lite/Micro
- **Cohere**: Command R+, Command R
- **Reka AI**: Reka Core, Reka Flash
- **Google Gemma**: Gemma 3, Gemma 2 시리즈
- **NVIDIA**: Nemotron 4 340B
- **IBM**: Granite 3.1/3.0
- **Microsoft**: Phi-4, Phi-3 시리즈
- 그 외 100개 이상의 오픈소스 모델

## 사용 방법

### 기본 사용

```typescript
import { createDirectChatBot, createBattleBot, createSideBySideBot } from '~app/bots/lmarena'

// Direct Chat
const directBot = createDirectChatBot('gpt-4o')

// Battle
const battleBot = createBattleBot()

// Side-by-Side
const sideBySideBot = createSideBySideBot('gpt-4o', 'claude-3-5-sonnet')
```

### UI 컴포넌트 사용

```tsx
import { LMArenaSettings } from '~app/components/Chat/LMArenaSettings'

function ChatInterface() {
  const [mode, setMode] = useState<LMArenaMode>('direct')
  const [model, setModel] = useState<LMArenaModel>('gpt-4o')
  
  return (
    <LMArenaSettings
      currentMode={mode}
      currentModel={model}
      onModeChange={setMode}
      onModelChange={setModel}
      // ... 기타 props
    />
  )
}
```

### 동적 모델 목록 가져오기

```typescript
import { fetchAvailableModels, groupModelsByOrganization } from '~app/bots/lmarena/api'

// 사용 가능한 모델 목록
const models = await fetchAvailableModels()

// 조직별로 그룹화
const grouped = groupModelsByOrganization(models)
```

## 기술 구현

### API 엔드포인트

1. **대화 생성**: `GET https://lmarena.ai/c/{conversationId}`
2. **메시지 스트리밍**: `POST https://lmarena.ai/nextjs-api/stream/create-evaluation`

### 요청 형식

```json
{
  "conversationId": "019a2ebf-f103-7b6f-aae7-da84fbc9c978",
  "message": "사용자 메시지",
  "mode": "direct",
  "model": "gpt-4o"
}
```

### 응답 형식 (Server-Sent Events)

```
a0:"Hello! "
a0:"How "
a0:"can "
a0:"I "
a0:"help "
a0:"you "
a0:"today?"
ad:{"finishReason":"stop"}
```

## 아키텍처

```
src/app/bots/lmarena/
├── index.ts          # 메인 봇 구현
├── api.ts            # API 유틸리티
└── types.ts          # 타입 정의 (선택사항)

src/app/components/Chat/
└── LMArenaSettings.tsx  # UI 설정 컴포넌트
```

## 주요 클래스

### LMArenaBot

```typescript
class LMArenaBot extends AbstractBot {
  constructor(config: LMArenaConfig)
  doSendMessage(params: SendMessageParams): Promise<void>
  resetConversation(): void
}
```

### 설정 인터페이스

```typescript
interface LMArenaConfig {
  mode: 'direct' | 'battle' | 'side-by-side'
  model?: LMArenaModel        // direct 모드
  modelA?: LMArenaModel       // side-by-side 모드
  modelB?: LMArenaModel       // side-by-side 모드
}
```

## 에러 처리

- `NETWORK_ERROR`: 네트워크 연결 실패
- `UNKOWN_ERROR`: 알 수 없는 오류
- 사용자 중단 시 자동으로 스트림 취소

## 성능 최적화

1. **스트리밍 응답**: 실시간으로 텍스트 수신
2. **연결 재사용**: 같은 대화 ID로 여러 메시지 전송
3. **자동 재시도**: 네트워크 오류 시 재시도 로직 (선택사항)

## 향후 개선 사항

- [ ] 모델 목록 자동 업데이트
- [ ] 투표 기능 구현 (Battle 모드)
- [ ] 대화 히스토리 저장
- [ ] 이미지 입력 지원
- [ ] 멀티모달 모델 지원
- [ ] 성능 메트릭 수집 (응답 시간, 토큰 수 등)

## 문제 해결

### 연결 실패
- 네트워크 연결 확인
- CORS 설정 확인
- 방화벽 설정 확인

### 스트리밍 중단
- 브라우저 콘솔에서 에러 확인
- 대화 ID 재생성 시도
- 봇 인스턴스 재생성

### 모델 선택 오류
- 모델 ID가 올바른지 확인
- 모델이 현재 사용 가능한지 확인
- 최신 모델 목록 업데이트

## 참고 자료

- [LM Arena 공식 사이트](https://lmarena.ai)
- [LMSYS Chatbot Arena](https://chat.lmsys.org)
- [Hugging Face Leaderboard](https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard)

## 라이선스

이 통합은 프로젝트의 메인 라이선스를 따릅니다.
