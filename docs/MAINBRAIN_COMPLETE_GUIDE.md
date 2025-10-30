# 메인 브레인 시스템 완벽 가이드

## 📋 목차
1. [개요](#개요)
2. [핵심 기능](#핵심-기능)
3. [아키텍처](#아키텍처)
4. [구현된 기능들](#구현된-기능들)
5. [해결한 문제들](#해결한-문제들)
6. [사용 방법](#사용-방법)
7. [기술 상세](#기술-상세)

---

## 개요

### 메인 브레인이란?

메인 브레인은 올인원 모드에서 여러 AI 모델의 응답을 비교하고 정리하는 **중심 역할**을 하는 모델입니다.

**핵심 컨셉**:
- 여러 모델 중 하나를 "메인 브레인"으로 지정
- 메인 브레인은 우측에 세로로 크게 표시
- 나머지 모델들은 좌측에 그리드로 배치
- 메인 브레인은 항상 그리드에 포함되어 표시

### 왜 필요한가?

1. **비교 분석**: 여러 모델의 응답을 한눈에 비교
2. **중심 역할**: 메인 브레인이 다른 응답들을 종합 정리
3. **효율성**: 중요한 모델을 크게 보면서 작업 가능
4. **유연성**: 언제든지 다른 모델로 변경 가능

---

## 핵심 기능

### 1. 메인 브레인 선택 및 해제

**선택 방법**:
- 우측 상태창에서 추천 모델 선택
- 개별 패널의 왕관 이모지 클릭

**해제 방법**:
- 상태창의 "메인 브레인 해제" 버튼 클릭
- 왕관 이모지 다시 클릭

### 2. 동적 레이아웃

**메인 브레인 없을 때**:
```
┌─────────┬─────────┬─────────┐
│ Model A │ Model B │ Model C │
├─────────┼─────────┼─────────┤
│ Model D │ Model E │ Model F │
└─────────┴─────────┴─────────┘
```

**메인 브레인 있을 때** (Model A 선택):
```
┌─────────┬─────────┐  ┌───────────┐
│ Model B │ Model C │  │           │
├─────────┼─────────┤  │  Model A  │
│ Model D │ Model E │  │ (메인브레인)│
├─────────┴─────────┤  │           │
│     Model F       │  │           │
└───────────────────┘  └───────────┘
```

### 3. 모델 변경 시 자동 승계

메인 브레인 패널에서 다른 모델로 변경하면:
- 새 모델이 자동으로 메인 브레인 역할 승계
- 그리드 봇과 자동 스왑
- 모든 상태 완벽 동기화

### 4. 레이아웃 전환 시 자동 포함

어떤 레이아웃(2/3/4/6개)으로 전환해도:
- 메인 브레인이 항상 그리드에 포함
- 마지막 봇 자리를 메인 브레인으로 교체
- 레이아웃 일관성 유지

---

## 아키텍처

### 컴포넌트 구조

```
MultiBotChatPanel (메인 컨테이너)
├── GeneralChatPanel (레이아웃 관리)
│   ├── ConversationPanel (개별 봇 패널) × N
│   │   ├── ChatbotName (드롭다운)
│   │   └── MainBrainToggle (왕관 이모지)
│   └── MainBrainPanel (상태창)
│       ├── 추천 모델 리스트
│       └── 해제 버튼
└── Layout Components
    ├── TwoBotChatPanel
    ├── ThreeBotChatPanel
    ├── FourBotChatPanel
    └── SixBotChatPanel
```

### 데이터 흐름

```
User Action
    ↓
Browser.storage.sync (mainBrainBotId)
    ↓
storage.onChanged Event
    ↓
├─→ MultiBotChatPanel (그리드 스왑)
├─→ ConversationPanel (왕관 표시)
└─→ MainBrainPanel (상태창 업데이트)
```

### 상태 관리

**Storage 키**:
- `mainBrainBotId`: 현재 메인 브레인 모델 ID
- `multiPanelBots:2/3/4/6`: 각 레이아웃의 봇 배열

**동기화 메커니즘**:
1. `useMainBrain` hook으로 storage 감지
2. `storage.onChanged` 리스너로 실시간 동기화
3. Race condition 방지 로직

---

## 구현된 기능들

### 1. 메인 브레인 상태창 (Panel.tsx)

**위치**: 우측 고정, 드래그 이동 가능

**기능**:
- ✅ LM Arena 리더보드 기반 11개 카테고리별 추천
- ✅ 접기/펼치기 (우측 버튼)
- ✅ 드래그로 위치 이동
- ✅ 메인 브레인 해제 버튼
- ✅ 실시간 동기화

**추천 카테고리**:
```typescript
{
  general: '🌐 범용성',
  search: '🔍 정보탐색',
  coding: '💻 코딩',
  reasoning: '🧠 추론/분석',
  speed: '⚡ 빠른응답',
  factcheck: '✅ 팩트체크',
  academic: '🎓 학술연구',
  creative: '🎨 창작/글쓰기',
  cost: '💰 비용효율',
  vision: '📷 사진인식',
  arena: '🎯 최신모델'
}
```

### 2. 왕관 이모지 토글 (Toggle.tsx)

**표시 위치**:
- Compact 모드: 모델 이름 옆
- Full 모드: 헤더 중앙

**애니메이션**:
- 클릭 시 회전 효과
- 선택/해제 시 부드러운 전환

**지원 모델**:
- ✅ 일반 모델 (Claude, Gemini, Perplexity 등)
- ✅ iframe 모델 (ChatGPT, Qwen, Grok, LMArena)

### 3. 모델 변경 시 승계 (ConversationPanel.tsx)

**핵심 로직**:
```typescript
const handleSwitchBot = useCallback(
  async (newBotId: BotId) => {
    // 메인브레인이면 새 모델로 승계
    if (isMainBrain) {
      await Browser.storage.sync.set({ mainBrainBotId: newBotId })
    }
    // 그리드 봇 교체
    props.onSwitchBot?.(newBotId)
  },
  [isMainBrain, props],
)
```

**동작 과정**:
1. 사용자가 드롭다운에서 새 모델 선택
2. 메인브레인 여부 확인
3. 메인브레인이면 storage 업데이트
4. 그리드 봇 교체
5. 모든 컴포넌트 자동 동기화

### 4. 그리드 스왑 로직 (MultiBotChatPanel.tsx)

**모든 경우의 수 처리**:

```typescript
// Case 1: 메인브레인 해제
if (!newBrainId && oldBrainId) {
  // 그리드는 그대로 유지
  return newBots
}

// Case 2: 메인브레인 스왑 (둘 다 그리드에 있음)
if (oldBrainId && newBrainId && newBrainIndex !== -1) {
  newBots[newBrainIndex] = oldBrainId
}

// Case 3: 첫 메인브레인 설정 (그리드에 있음)
else if (!oldBrainId && newBrainId && newBrainIndex !== -1) {
  // 대체 봇으로 교체 또는 제거
  const availableBots = getAvailableBots()
  if (availableBots.length > 0) {
    newBots[newBrainIndex] = availableBots[0]
  } else {
    newBots.splice(newBrainIndex, 1)
  }
}

// Case 4: 새 메인브레인이 그리드에 없음
else if (newBrainId) {
  // 그리드 유지
}
```

### 5. 레이아웃 전환 시 강제 포함

**각 레이아웃 컴포넌트에 추가**:
```typescript
useEffect(() => {
  getUserConfig().then((config) => {
    const mainBrain = config.mainBrainBotId as BotId | ''
    if (mainBrain && !bots.includes(mainBrain)) {
      setBots((current) => {
        const newBots = [...current]
        newBots[newBots.length - 1] = mainBrain
        return newBots
      })
    }
  })
}, []) // 마운트 시 한 번만 실행
```

**적용 컴포넌트**:
- TwoBotChatPanel
- ThreeBotChatPanel
- FourBotChatPanel
- SixBotChatPanel

---

## 해결한 문제들

### 문제 1: 상태창 동기화 실패

**증상**: 메인브레인이 없는데 상태창에는 표시됨

**원인**: 메인브레인 해제 기능이 없었음

**해결책**:
- Panel.tsx에 "메인 브레인 해제" 버튼 추가
- `setMainBrain('')` 호출로 완전 해제
- storage 이벤트를 통해 즉시 반영

### 문제 2: 모델 변경 시 승계 안됨

**증상**: 메인브레인 패널에서 모델 변경 시 승계되지 않음

**원인**: `onSwitchBot`이 단순히 그리드 봇만 교체

**해결책**:
- `handleSwitchBot` 함수 추가
- 메인브레인 여부 확인 후 승계 처리
- mainBrainBotId 업데이트 로직 추가

### 문제 3: 레이아웃 전환 시 메인브레인 사라짐

**증상**: 6개 그리드에서 4개로 전환 시 메인브레인 미포함

**원인**: 각 레이아웃마다 별도의 atom 사용

**해결책**:
- 각 레이아웃 컴포넌트 마운트 시 메인브레인 확인
- 없으면 마지막 봇을 메인브레인으로 교체
- 모든 레이아웃 전환 시 자동 적용

### 문제 4: Gemini Pro 드롭다운 안뜸

**증상**: "Gemini Pro" 클릭 시 드롭다운 미표시

**원인**: 긴 이름으로 인한 레이아웃 오버플로우

**해결책**:
- Flexbox 레이아웃 개선
- `min-w-0`, `flex-shrink` 속성 추가
- 클릭 영역 확보

---

## 사용 방법

### 메인 브레인 설정하기

**방법 1: 상태창에서 선택**
1. 우측 상태창 열기 (접혀있으면 ◀ 버튼 클릭)
2. 상황별 추천 카테고리 선택 (예: 💻 코딩)
3. Top 3 모델 중 "선택" 버튼 클릭

**방법 2: 개별 패널에서 선택**
1. 원하는 모델 패널의 왕관 이모지 클릭
2. 즉시 메인 브레인으로 설정

### 메인 브레인 변경하기

**방법 1: 다른 모델 선택**
- 상태창이나 다른 패널의 왕관 클릭

**방법 2: 모델 드롭다운 사용**
- 메인 브레인 패널의 모델 이름 클릭
- 드롭다운에서 다른 모델 선택
- 자동으로 새 모델이 메인 브레인 승계

### 메인 브레인 해제하기

**방법 1: 상태창에서 해제**
1. 우측 상태창 열기
2. 하단의 "메인 브레인 해제" 버튼 클릭

**방법 2: 왕관 이모지 클릭**
- 현재 메인 브레인의 왕관 이모지 다시 클릭

### 레이아웃 전환하기

1. 하단의 레이아웃 버튼 클릭 (2/3/4/6개)
2. 메인 브레인이 자동으로 새 레이아웃에 포함됨
3. 나머지 봇들은 기존 설정 유지

---

## 기술 상세

### 핵심 Hook: useMainBrain

**위치**: `src/app/hooks/use-main-brain.ts`

**기능**:
```typescript
export function useMainBrain() {
  const [mainBrainBotId, setMainBrainBotId] = useState<BotId | ''>('')

  useEffect(() => {
    // 초기 로드
    getUserConfig().then((c) => {
      setMainBrainBotId(c.mainBrainBotId || '')
    })
    
    // storage 변경 감지
    const onChanged = (changes, area) => {
      if (area === 'sync' && changes.mainBrainBotId) {
        setMainBrainBotId(changes.mainBrainBotId.newValue || '')
      }
    }
    Browser.storage.onChanged.addListener(onChanged)
    
    return () => {
      Browser.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  const setMainBrain = useCallback(async (botId: BotId | '') => {
    await updateUserConfig({ mainBrainBotId: botId })
  }, [])

  return { mainBrainBotId, setMainBrain }
}
```

### Storage 구조

**mainBrainBotId**:
```typescript
type MainBrainBotId = BotId | '' // 빈 문자열 = 해제됨

// 예시
mainBrainBotId: 'chatgpt'  // ChatGPT가 메인브레인
mainBrainBotId: ''         // 메인브레인 없음
```

**multiPanelBots**:
```typescript
// 각 레이아웃마다 별도 저장
'multiPanelBots:2': ['chatgpt', 'claude']
'multiPanelBots:3': ['chatgpt', 'claude', 'gemini']
'multiPanelBots:4': ['chatgpt', 'claude', 'gemini', 'perplexity']
'multiPanelBots:6': ['chatgpt', 'claude', 'gemini', 'perplexity', 'bing', 'deepseek']
```

### Race Condition 방지

**문제**: 동시에 여러 곳에서 메인브레인 변경 시 충돌

**해결책**:
```typescript
const onChanged = (changes, area) => {
  if (area !== 'sync') return
  if (changes.mainBrainBotId) {
    const oldBrainId = changes.mainBrainBotId.oldValue || ''
    const newBrainId = changes.mainBrainBotId.newValue || ''
    
    // 동일한 값이면 무시
    if (oldBrainId === newBrainId) {
      console.log('⏭️ Duplicate event ignored')
      return
    }
    
    // 처리 로직...
  }
}
```

### 레이아웃 계산

**5개 남은 경우** (6개 중 1개가 메인브레인):
```css
.grid {
  grid-template-columns: repeat(2, 1fr);
  grid-auto-flow: dense;
}

.first-item {
  grid-row: span 2; /* 세로 2칸 차지 */
}
```

**결과**:
```
┌─────────┬─────────┐
│         │ Model 2 │
│ Model 1 ├─────────┤
│         │ Model 3 │
├─────────┼─────────┤
│ Model 4 │ Model 5 │
└─────────┴─────────┘
```

### Flexbox 레이아웃 (Gemini Pro 문제 해결)

**Before**:
```tsx
<div className="flex flex-row items-center gap-2">
  <img />
  <ChatbotName /> {/* 긴 이름 시 오버플로우 */}
  <MainBrainToggle />
</div>
```

**After**:
```tsx
<div className="flex flex-row items-center gap-2 min-w-0 flex-1">
  <img className="flex-shrink-0" />
  <div className="min-w-0 flex-shrink">
    <ChatbotName /> {/* 필요시 축소 가능 */}
  </div>
  <div className="flex-shrink-0">
    <MainBrainToggle /> {/* 항상 고정 크기 */}
  </div>
</div>
```

### 그리드/메인브레인 불변식과 렌더링 전략

메인브레인이 보이지 않거나 그리드 수가 변동되는 모든 케이스를 막기 위해 다음 불변식을 적용합니다.

- 불변식: "메인브레인은 항상 좌측 그리드에 포함" + "우측 고정 패널은 항상 표시"
- 초기 로드: 그리드에 메인브레인이 없으면 마지막 슬롯을 메인브레인으로 교체
- 변경 이벤트: 새 메인브레인이 그리드에 없으면 (1) 이전 메인브레인 위치를 교체, 없으면 (2) 마지막 슬롯 교체. 이미 있으면 변경 없음

코드 스니펫(요지):
```ts
// 초기 로드 보정 (MultiBotChatPanel.tsx)
if (setBots && brainId) {
  setBots((current) => {
    const next = [...current]
    if (!next.includes(brainId)) {
      next[next.length - 1] = brainId // 마지막 슬롯 교체
    }
    return next
  })
}

// storage.onChanged 보정 (새 메인브레인 포함 보장)
if (setBots) {
  setBots((current) => {
    const next = [...current]
    if (newBrainId) {
      if (!next.includes(newBrainId)) {
        const oldIdx = oldBrainId ? next.indexOf(oldBrainId) : -1
        const idx = oldIdx !== -1 ? oldIdx : next.length - 1
        if (idx >= 0) next[idx] = newBrainId
      }
      // 이미 포함되어 있으면 변경 없음
    }
    return next
  })
}
```

### 모델 변경/승계 흐름(패널 드롭다운)

메인브레인 패널에서 모델을 바꾸면, 먼저 `mainBrainBotId`를 새 모델로 승계한 뒤 그리드 교체를 수행합니다.

```ts
// ConversationPanel.tsx
const handleSwitchBot = useCallback(async (newBotId: BotId) => {
  try {
    if (isMainBrain) {
      await Browser.storage.sync.set({ mainBrainBotId: newBotId }) // 승계
    }
  } finally {
    props.onSwitchBot?.(newBotId) // 그리드 교체(중복 시 스왑)
  }
}, [isMainBrain, props.onSwitchBot])
```

또한 그리드 안에서 이미 존재하는 모델을 선택하면 중복을 만들지 않고 두 위치를 스왑해 정합성을 유지합니다.

```ts
// MultiBotChatPanel.tsx
setBots((bots) => {
  const next = [...bots]
  const existsAt = next.indexOf(botId)
  if (existsAt !== -1 && existsAt !== index) {
    const tmp = next[index]
    next[index] = next[existsAt]
    next[existsAt] = tmp
  } else {
    next[index] = botId
  }
  return next
})
```

### 우측 메인브레인 패널 Fallback(깜빡임 제거)

storage 동기화 타이밍에 1프레임 정도 메인브레인이 그리드에 아직 반영되지 않아도 우측 패널이 사라지지 않도록, 모든 봇에 대한 `useChat` 캐시에서 메인브레인 Chat을 보조로 가져와 표시합니다.

```ts
// MultiBotChatPanel.tsx
const allBotIds = useMemo(() => Object.keys(CHATBOTS) as BotId[], [])
const allChats = allBotIds.map((id) => ({ id, chat: useChat(id) }))
const chatMap = useMemo(() => new Map(allChats.map(({id, chat}) => [id as BotId, chat])), [allChats])

const mainBrainChat = useMemo(() => {
  const found = chats.find((c) => c.botId === mainBrainBotId)
  if (found) return found
  if (!mainBrainBotId) return undefined
  return chatMap.get(mainBrainBotId) // fallback
}, [chats, mainBrainBotId, chatMap])
```

### 키/레이아웃 안정화

- 리스트 키: `key=\`${botId}-${index}\`` → 중복 BotId 시에도 안정
- 좌측 그리드: `min-w-0` 추가로 폭이 좁을 때도 우측 패널을 침범하지 않음
- 우측 패널: `w-[400px] flex-shrink-0` 고정 폭 유지

### iframe 세션 안정화

- 프리로드: 현재 저장된 모든 레이아웃(사이드패널 포함)의 iframe 봇을 `iframeManager.preload`로 미리 생성해 stash에 보관
- 렌더 시 stash↔container로 DOM 이동만 수행(appendChild) → iframe reload 없이 세션 유지
- Claude는 iframe에서 제거되어 웹앱 경로로만 동작(레지스트리에서 제외)

```ts
// 예시(MultiBot/SidePanel)
const union = Array.from(new Set([...bots2, ...bots3, ...bots4, ...bots6]))
  .filter(isIframeBot)
iframeManager.preload(union)
```

### 관련 파일 포인터

- `src/app/pages/MultiBotChatPanel.tsx` (포함 보정, 스왑, fallback, 프리로드, 레이아웃)
- `src/app/components/Chat/ConversationPanel.tsx` (승계 handleSwitchBot)
- `src/app/pages/SidePanelPage.tsx` (프리로드)
- `src/app/bots/iframe-registry.ts` (Claude 웹앱 복원)

---

## 테스트 시나리오

### 기본 기능 테스트

- [ ] 메인브레인 선택 → 상태창 표시
- [ ] 메인브레인 해제 → 상태창 사라짐
- [ ] 메인브레인 모델 변경 → 새 모델로 승계
- [ ] 왕관 이모지 클릭 → 선택/해제 토글

### 그리드 스왑 테스트

- [ ] 그리드 봇을 메인브레인으로 → 대체 봇으로 교체
- [ ] 메인브레인을 그리드 봇으로 → 스왑
- [ ] 메인브레인 해제 → 그리드 유지

### 레이아웃 전환 테스트

- [ ] 6개 → 4개 전환 → 메인브레인 포함
- [ ] 4개 → 2개 전환 → 메인브레인 포함
- [ ] 2개 → 6개 전환 → 메인브레인 유지

### iframe 모델 테스트

- [ ] ChatGPT 모델 변경 → 승계
- [ ] Qwen 모델 변경 → 승계
- [ ] Grok 모델 변경 → 승계
- [ ] LMArena 모델 변경 → 승계

### UI/UX 테스트

- [ ] Gemini Pro 드롭다운 → 정상 작동
- [ ] 긴 모델 이름 → 레이아웃 깨지지 않음
- [ ] 상태창 드래그 → 위치 이동
- [ ] 상태창 접기/펼치기 → 부드러운 애니메이션

### 엣지 케이스 테스트

- [ ] 연속 모델 변경 → 정상 작동
- [ ] 빠른 연속 클릭 → Race condition 없음
- [ ] 대체 봇 부족 → 그리드 축소
- [ ] 잘못된 BotId → 무시

---

## 파일 구조

```
src/app/
├── components/
│   ├── MainBrain/
│   │   ├── Panel.tsx          # 메인브레인 상태창
│   │   └── Toggle.tsx         # 왕관 이모지 토글
│   └── Chat/
│       └── ConversationPanel.tsx  # 개별 봇 패널
├── pages/
│   └── MultiBotChatPanel.tsx  # 메인 컨테이너
├── hooks/
│   └── use-main-brain.ts      # 메인브레인 hook
└── consts.ts                  # CHATBOTS 설정

docs/
├── MAINBRAIN_COMPLETE_GUIDE.md    # 이 문서
└── MAINBRAIN_SYNC_FIX.md          # 동기화 문제 해결 문서
```

---

## 디버깅 로그

### 로그 확인 방법

브라우저 개발자 도구 콘솔에서 다음 키워드로 필터링:

- `[MultiBotPanel]`: 그리드 스왑 로직
- `[ConversationPanel]`: 모델 변경 및 승계
- `[MainBrainPanel]`: 상태창 업데이트
- `[TwoBotPanel]` 등: 레이아웃 전환

### 주요 로그 메시지

```
🧠 Main Brain loaded: chatgpt
🔄 Main Brain swap: { from: 'chatgpt', to: 'claude' }
↔️ Swapping bots: { oldBrainIndex: 0, newBrainIndex: 1 }
✅ Final bots: ['claude', 'chatgpt', 'gemini', 'perplexity']
👑 Main Brain succession: claude
🔧 Adding main brain to grid: gemini
```

---

## 성능 최적화

### 1. React.memo 사용

```typescript
export default memo(ChatbotName)
export default memo(MainBrainToggle)
```

### 2. useCallback 최적화

```typescript
const handleSwitchBot = useCallback(
  async (newBotId: BotId) => {
    // ...
  },
  [isMainBrain, props], // 의존성 최소화
)
```

### 3. 조건부 렌더링

```typescript
{bot && (
  <MainBrainPanel />
)}
```

### 4. 이벤트 리스너 정리

```typescript
useEffect(() => {
  Browser.storage.onChanged.addListener(onChanged)
  return () => {
    Browser.storage.onChanged.removeListener(onChanged)
  }
}, [])
```

---

## 향후 개선 사항

### 단기 (1-2주)

- [ ] 메인브레인 히스토리 기능
- [ ] 즐겨찾기 모델 설정
- [ ] 키보드 단축키 지원

### 중기 (1-2개월)

- [ ] 메인브레인 프리셋 저장/불러오기
- [ ] 상황별 자동 추천 개선
- [ ] 다국어 지원 확대

### 장기 (3개월+)

- [ ] AI 기반 자동 메인브레인 선택
- [ ] 사용 패턴 분석 및 추천
- [ ] 팀 공유 기능

---

## 문의 및 지원

### 버그 리포트

문제 발생 시 다음 정보 포함:
1. 재현 단계
2. 예상 동작
3. 실제 동작
4. 콘솔 로그
5. 스크린샷

### 기능 제안

새로운 기능 제안 시:
1. 사용 사례
2. 기대 효과
3. 우선순위

---

## 라이선스 및 크레딧

**개발**: ChatHub Extension Team
**기반 기술**: React, TypeScript, Jotai, Tailwind CSS
**참고**: LM Arena Leaderboard

---

**마지막 업데이트**: 2025-01-30
**버전**: 1.0.0
**상태**: ✅ 프로덕션 준비 완료
