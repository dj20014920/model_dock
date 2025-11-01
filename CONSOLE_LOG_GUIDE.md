# 🔍 Model Dock - 콘솔 로그 완벽 가이드

## 📋 목차
1. [로그 시스템 개요](#1-로그-시스템-개요)
2. [로그 카테고리별 분석](#2-로그-카테고리별-분석)
3. [시나리오별 로그 패턴](#3-시나리오별-로그-패턴)
4. [문제 진단 방법](#4-문제-진단-방법)
5. [로그 필터링 팁](#5-로그-필터링-팁)

---

## 1. 로그 시스템 개요

### 1.1 로그 레벨 및 색상 코딩

| 컴포넌트 | 색상 | 용도 |
|---------|------|------|
| **렌더링** | 🟢 초록색 (`#00ff00`) | 컴포넌트 mount/render |
| **State 변경** | 🟠 주황색 (`#ff9500`) | layout, bots, mainBrain 변경 |
| **useChat** | 🔵 청록색 (`#00d4ff`) | useChat 호출 및 chatMap 생성 |
| **메인브레인** | 🟣 보라색 (`#ff00ff`) | 메인브레인 설정/변경 |
| **IframeManager** | 🟡 노란색 (`#ffaa00`) | iframe 생명주기 관리 |
| **에러/경고** | 🔴 빨간색 (`#ff0000`) | iframe reload 감지, 에러 |

### 1.2 로그 포맷 구조

```javascript
// 표준 로그 포맷
console.log(
  '%c[Component] 🎬 ACTION: botId',
  'color: #00ff00; font-weight: bold',
  { key: 'value', timestamp: '2025-10-31...' }
)
```

**해석:**
- `[Component]`: 로그를 출력한 컴포넌트명
- `🎬 ACTION`: 수행된 동작 (이모지로 시각화)
- `botId`: 대상 봇 ID
- 세 번째 인자: 상세 정보 객체

---

## 2. 로그 카테고리별 분석

### 2.1 MultiBotChatPanel - 렌더링 추적

#### 🔄 렌더링 카운터
```javascript
%c[MultiBotPanel] 🔄 RENDER #5
```
**의미**: MultiBotChatPanel이 5번째로 렌더링됨
**확인사항**:
- 그리드 변경 시마다 +1 증가 (정상)
- 메인브레인 설정 시 +1 증가 (정상)
- **⚠️ 짧은 시간에 여러 번 렌더링되면 성능 문제 가능성**

---

### 2.2 State 변경 추적

#### 📐 Layout 변경
```javascript
%c[MultiBotPanel] 📐 Layout Changed: sixGrid
```
**발생 시점**: 사용자가 2/3/4/6 그리드 버튼 클릭
**확인사항**: layout 값이 올바르게 변경되었는지

#### 🔢 Bots 배열 변경
```javascript
%c[MultiBotPanel] 🔢 Bots2 Changed: ["chatgpt", "claude"]
%c[MultiBotPanel] 🔢 Bots3 Changed: ["chatgpt", "claude", "gemini"]
```
**발생 시점**: 활성 봇 목록 변경
**확인사항**:
- 배열에 올바른 봇들이 포함되었는지
- **⚠️ 메인브레인 설정 시에는 이 배열이 변경되면 안 됨!**

#### 🧠 MainBrain 변경
```javascript
%c[MultiBotPanel] 🧠 MainBrainBotId Changed: "chatgpt"
```
**발생 시점**: 메인브레인 설정/해제/변경
**확인사항**:
- 설정: `""` → `"chatgpt"`
- 해제: `"chatgpt"` → `""`
- 변경: `"chatgpt"` → `"qwen"`

---

### 2.3 useChat 호출 및 ChatMap

#### 📋 AllBotIds
```javascript
%c[MultiBotPanel] 📋 All BotIds (15):
["chatgpt", "bing", "bard", "claude", ...]
```
**의미**: 시스템에 등록된 모든 봇 ID 목록
**확인사항**: 총 개수가 CHATBOTS 객체의 키 개수와 일치하는지

#### 🔌 useChat 호출 로그
```javascript
%c[MultiBotPanel] 🔌 useChat("chatgpt") called
{
  botId: "chatgpt",
  generating: false,
  messageCount: 3
}
```
**발생 시점**: 매 렌더링마다 모든 봇에 대해 호출됨
**확인사항**:
- **⚠️ 같은 botId에 대해 여러 번 호출되면 안 됨!**
- 각 봇당 정확히 1회만 호출되어야 함

#### 🗺️ ChatMap 생성
```javascript
%c[MultiBotPanel] 🗺️ ChatMap Created (15 entries)
```
**의미**: 모든 봇의 chat 인스턴스를 담은 Map 생성
**확인사항**: entries 개수 = AllBotIds 개수

---

### 2.4 Active Bots 계산

#### ✅ Active Bots
```javascript
%c[MultiBotPanel] ✅ Active Bots Calculated for layout="sixGrid":
{
  layout: "sixGrid",
  activeBotIds: ["chatgpt", "claude", "gemini", ...],
  count: 6
}
```
**확인사항**:
- `layout="2"` → count=2
- `layout="3"` → count=3
- `layout="sixGrid"` → count=6

---

### 2.5 메인브레인 로직

#### 🧠 메인브레인 초기 로드
```javascript
%c[MultiBotPanel] 🧠 Main Brain loaded from config: "chatgpt"
```
**발생 시점**: 앱 최초 로드 시 chrome.storage에서 읽어옴
**확인사항**: 이전에 설정한 메인브레인이 올바르게 로드되는지

#### 🔄 메인브레인 변경 이벤트
```javascript
%c[MultiBotPanel] 🔄 Main Brain CHANGED:
{
  from: "chatgpt",
  to: "qwen",
  timestamp: "2025-10-31T10:30:00.000Z"
}
```
**발생 시점**: chrome.storage.sync 변경 감지
**확인사항**:
- from/to 값이 정확한지
- **⚠️ 이 로그가 나왔는데 activeBotIds가 변경되면 버그!**

#### 🧠 메인브레인 상태
```javascript
%c[MultiBotPanel] 🧠 Main Brain Status:
{
  mainBrainBotId: "chatgpt",
  hasMainBrain: true,
  chatInstance: "EXISTS",
  inActiveBotIds: true
}
```
**확인사항**:
- `hasMainBrain: true` → 메인브레인 설정됨
- `chatInstance: "EXISTS"` → chatMap에서 chat 찾음
- `inActiveBotIds: true` → 메인브레인이 활성 봇 목록에 있음

---

### 2.6 봇 분류 로직

#### 📦 All Iframe Bots
```javascript
%c[MultiBotPanel] 📦 All Iframe Bots (5):
["qwen", "grok", "lmarena", ...]
```
**의미**: iframe 기반 봇들의 전체 목록
**확인사항**: iframe-registry에 등록된 봇들만 포함

#### 📐 Grid BotIds 계산
```javascript
%c[MultiBotPanel] 📐 Grid BotIds Calculated:
{
  activeBotIds: ["chatgpt", "claude", "gemini", "qwen"],
  mainBrainBotId: "chatgpt",
  gridBotIds: ["claude", "gemini", "qwen"],
  filtered: 1
}
```
**핵심 로직**: `gridBotIds = activeBotIds - mainBrainBotId`
**확인사항**:
- `filtered` = 메인브레인이 활성 봇에 있으면 1, 아니면 0
- **⚠️ gridBotIds에 mainBrainBotId가 포함되면 안 됨!**

#### 🎯 Grid Chats
```javascript
%c[MultiBotPanel] 🎯 Grid Chats (3):
[
  { botId: "claude", messages: 5 },
  { botId: "gemini", messages: 2 },
  { botId: "qwen", messages: 0 }
]
```
**확인사항**: gridBotIds의 각 봇에 대한 chat 인스턴스 존재

#### ✅ ChatMap 일관성 검증
```javascript
%c[MultiBotPanel] ✅ ChatMap consistency verified for grid chats
```
**의미**: gridChats의 각 chat이 chatMap에서 가져온 것과 동일한 인스턴스임
**⚠️ 만약 이 로그 대신 아래 로그가 나온다면 심각한 버그!**
```javascript
%c[MultiBotPanel] ❌ CHAT INSTANCE INCONSISTENCY DETECTED!
```

#### 🙈 Inactive Iframe Bots
```javascript
%c[MultiBotPanel] 🙈 Inactive Iframe Bots (2):
{
  allIframeBots: ["qwen", "grok", "lmarena"],
  activeBots: ["chatgpt", "claude", "qwen"],
  inactiveBots: ["grok", "lmarena"]
}
```
**핵심 로직**: `inactiveBots = allIframeBots - activeBotIds`
**의미**: 화면에 표시되지 않지만 세션 유지를 위해 숨겨둘 봇들

#### 💤 Inactive Iframe Chats
```javascript
%c[MultiBotPanel] 💤 Inactive Iframe Chats (2):
[
  { botId: "grok", messages: 10, generating: false },
  { botId: "lmarena", messages: 0, generating: false }
]
```
**확인사항**: inactiveIframeBotIds의 각 봇이 chat 인스턴스를 가지고 있음

---

### 2.7 Active Chats (메시지 전송 대상)

#### 🎯 Active Chats (WITH MainBrain)
```javascript
%c[MultiBotPanel] 🎯 Active Chats (WITH MainBrain):
{
  gridCount: 3,
  mainBrain: "chatgpt",
  total: 4,
  botIds: ["claude", "gemini", "qwen", "chatgpt"]
}
```
**핵심**: `activeChats = gridChats + mainBrainChat`

#### 🎯 Active Chats (NO MainBrain)
```javascript
%c[MultiBotPanel] 🎯 Active Chats (NO MainBrain):
{
  total: 4,
  botIds: ["chatgpt", "claude", "gemini", "qwen"]
}
```
**핵심**: `activeChats = gridChats`

#### ✅ 불변성 검증
```javascript
%c[MultiBotPanel] ✅ New array created for activeChats (immutability preserved)
```
**의미**: mainBrainChat이 있을 때 `[...gridChats, mainBrainChat]`로 새 배열 생성
**⚠️ React 불변성 원칙 준수 확인**

---

### 2.8 State Snapshot (통합 상태)

```javascript
%c[MultiBotPanel] 📊 === STATE SNAPSHOT #12 ===

1️⃣ Layout & Active Bots:
{
  layout: "sixGrid",
  activeBotIds: ["chatgpt", "claude", ...],
  activeCount: 6
}

2️⃣ Main Brain:
{
  mainBrainBotId: "chatgpt",
  hasMainBrain: true,
  isInActiveBots: true
}

3️⃣ Grid Configuration:
{
  gridBotIds: ["claude", "gemini", ...],
  gridCount: 5,
  gridCols: 2
}

4️⃣ Inactive Iframes:
{
  inactiveIframeBotIds: [],
  inactiveCount: 0
}

5️⃣ Rendering Summary:
{
  gridChatsRendered: 5,
  mainBrainRendered: 1,
  inactiveIframesRendered: 0,
  totalRendered: 6
}

6️⃣ ChatMap Integrity:
{
  chatMapSize: 15,
  allBotsCount: 15,
  integrity: "✅ OK"
}
```

**확인사항**:
- `totalRendered` = `gridChatsRendered` + `mainBrainRendered` + `inactiveIframesRendered`
- `integrity: "✅ OK"` → chatMap 크기 = 전체 봇 개수

---

### 2.9 ConversationPanel - 생명주기

#### 🎬 MOUNTED
```javascript
%c[ConversationPanel] 🎬 MOUNTED: chatgpt
{
  botId: "chatgpt",
  mode: "compact",
  isIframeBot: false,
  messagesCount: 3,
  generating: false,
  timestamp: "2025-10-31T10:30:00.000Z"
}
```
**발생 시점**: ConversationPanel 컴포넌트가 DOM에 마운트됨
**확인사항**:
- iframe 봇의 경우 배경색이 초록색 (`background: #003300`)
- **⚠️ 같은 botId가 짧은 시간에 MOUNTED → UNMOUNTED → MOUNTED 반복되면 버그!**

#### 💀 UNMOUNTED
```javascript
%c[ConversationPanel] 💀 UNMOUNTED: qwen
{
  botId: "qwen",
  isIframeBot: true,
  timestamp: "2025-10-31T10:30:05.000Z",
  WARNING: "⚠️ IFRAME UNMOUNT = SESSION LOSS!"
}
```
**발생 시점**: ConversationPanel 컴포넌트가 DOM에서 제거됨
**⚠️ 치명적 경고**:
- iframe 봇이 unmount되면 **세션이 초기화됨!**
- **이 로그가 나오면 안 되는 상황:**
  - 그리드 변경 (2→3→4→6)
  - 메인브레인 설정/해제
  - 봇 교체

#### 💬 Messages 업데이트
```javascript
%c[ConversationPanel] 💬 Messages updated: chatgpt
{
  botId: "chatgpt",
  count: 5,
  lastMessage: "Hello, how can I help you today?"
}
```
**발생 시점**: 새 메시지 수신 또는 전송
**확인사항**: count가 증가하는지

---

### 2.10 PersistentIframe - iframe 생명주기

#### 🔌 MOUNT EFFECT START
```javascript
%c[PersistentIframe] 🔌 MOUNT EFFECT START: qwen
{
  botId: "qwen",
  timestamp: "2025-10-31T10:30:00.000Z",
  containerExists: true
}
```
**발생 시점**: PersistentIframe useEffect 시작
**확인사항**: containerExists가 true여야 함

#### 🔧 Attaching iframe
```javascript
%c[PersistentIframe] 🔧 Attaching iframe: qwen
{
  botId: "qwen",
  src: "https://chat.qwenlm.ai",
  containerElement: "DIV",
  timestamp: "..."
}
```
**의미**: IframeManager에서 iframe 가져와서 컨테이너에 부착 시작

#### ✅ ATTACHED & READY
```javascript
%c[PersistentIframe] ✅ ATTACHED & READY: qwen
{
  botId: "qwen",
  zoom: 1,
  sessionPreserved: true,
  timestamp: "..."
}
```
**의미**: iframe 부착 완료, 세션 유지됨

#### 🧹 UNMOUNT CLEANUP START
```javascript
%c[PersistentIframe] 🧹 UNMOUNT CLEANUP START: qwen
{
  botId: "qwen",
  unmountTime: "2025-10-31T10:30:05.000Z"
}
```
**발생 시점**: PersistentIframe 컴포넌트 unmount
**확인사항**: 다음 로그로 STASH 이동 확인

#### 📦 DETACHED → STASH
```javascript
%c[PersistentIframe] 📦 DETACHED → STASH: qwen
{
  botId: "qwen",
  sessionPreserved: true,
  movedToStash: true,
  unmountTime: "..."
}
```
**의미**: iframe을 stash로 이동하여 세션 보존

---

### 2.11 IframeManager - 캐시 관리

#### ✅ CACHE HIT
```javascript
%c[IframeManager] ✅ CACHE HIT: qwen
{
  botId: "qwen",
  mountCount: 3,
  createdAgo: "120s ago",
  lastUsedAgo: "5s ago",
  currentUrl: "https://chat.qwenlm.ai...",
  parentElement: "md-iframe-stash",
  reloadCount: 1
}
```
**의미**: 이미 생성된 iframe을 캐시에서 가져옴 (세션 유지!)
**확인사항**:
- `reloadCount: 1` → 정상 (최초 로드만 1회)
- **⚠️ reloadCount가 2 이상이면 reload 발생했다는 뜻!**

#### 🆕 CACHE MISS - Creating new iframe
```javascript
%c[IframeManager] 🆕 CACHE MISS: qwen - Creating new iframe...
```
**발생 시점**: 해당 봇의 iframe이 처음 요청됨
**확인사항**: 각 봇당 최초 1회만 발생해야 함

#### 🎉 INITIAL LOAD
```javascript
%c[IframeManager] 🎉 INITIAL LOAD: qwen
{
  botId: "qwen",
  src: "https://chat.qwenlm.ai...",
  loadTime: "2025-10-31T10:30:00.000Z",
  ageSeconds: 0
}
```
**의미**: iframe의 최초 로드 완료 (정상!)

#### 🔄 RELOAD DETECTED ⚠️
```javascript
%c[IframeManager] 🔄 RELOAD DETECTED: qwen ⚠️
{
  botId: "qwen",
  reloadCount: 2,
  src: "https://chat.qwenlm.ai...",
  loadTime: "2025-10-31T10:30:10.000Z",
  ageSeconds: 10,
  WARNING: "⚠️ SESSION MAY BE LOST!",
  parentElement: "DIV"
}
```
**⚠️ 치명적 경고**: iframe이 재로드됨! 세션 손실 가능성!
**원인 분석 필요**:
1. iframe이 DOM에서 제거되었다가 다시 추가됨 (reparent)
2. iframe.src가 변경됨
3. 브라우저 캐시 문제

#### ✅ NEW IFRAME CREATED
```javascript
%c[IframeManager] ✅ NEW IFRAME CREATED: qwen
{
  botId: "qwen",
  src: "https://chat.qwenlm.ai",
  title: "Qwen Chat",
  initialParent: "md-iframe-stash",
  cacheSize: 5
}
```
**의미**: 새 iframe 생성 완료, stash에 보관됨

#### 🔗 ATTACH START
```javascript
%c[IframeManager] 🔗 ATTACH START: qwen
{
  botId: "qwen",
  timestamp: "...",
  containerTag: "DIV"
}
```
**의미**: iframe을 컨테이너에 부착 시작

#### 📦 Moving iframe
```javascript
%c[IframeManager] 📦 Moving iframe: qwen
{
  from: "STASH",
  to: "DIV",
  iframeSrc: "https://chat.qwenlm.ai..."
}
```
**확인사항**:
- `from: "STASH"` → 정상 (stash에서 가져옴)
- **⚠️ from이 다른 container ID라면 reparent 발생 가능성**

#### ✅ ATTACHED SUCCESSFULLY
```javascript
%c[IframeManager] ✅ ATTACHED SUCCESSFULLY: qwen
{
  botId: "qwen",
  from: "STASH",
  to: "unknown-container",
  reloadCount: 1,
  sessionPreserved: true,
  timestamp: "..."
}
```
**의미**: iframe 부착 완료, 세션 유지

#### 🧹 DETACH START
```javascript
%c[IframeManager] 🧹 DETACH START: qwen
{
  botId: "qwen",
  timestamp: "..."
}
```
**의미**: iframe을 stash로 이동 시작

#### 📦 Moving to STASH
```javascript
%c[IframeManager] 📦 Moving to STASH: qwen
{
  from: "DIV",
  to: "md-iframe-stash",
  sessionWillBePreserved: true
}
```
**확인사항**: `sessionWillBePreserved: true`

#### ✅ DETACHED → STASH
```javascript
%c[IframeManager] ✅ DETACHED → STASH: qwen
{
  botId: "qwen",
  from: "DIV",
  reloadCount: 1,
  sessionPreserved: true,
  inStash: true,
  timestamp: "..."
}
```
**의미**: stash 이동 완료, 세션 보존됨

---

### 2.12 DOM 렌더링 추적

#### 🎨 GRID RENDERED
```javascript
%c[MultiBotPanel] 🎨 GRID RENDERED (4 bots)
{
  count: 4,
  botIds: ["claude", "gemini", "perplexity", "qwen"],
  gridCols: 2,
  hasMainBrain: true,
  containerClass: "flex-1"
}
```
**의미**: 좌측 그리드 영역 렌더링 완료
**확인사항**:
- `gridCols: 2` → 2열 그리드
- `gridCols: 3` → 3열 그리드
- `hasMainBrain: true` → 그리드는 flex-1 (우측에 메인브레인 공간 확보)

#### 🔲 Rendering grid bot
```javascript
%c[MultiBotPanel] 🔲 Rendering grid bot [0]: claude
{
  index: 0,
  botId: "claude",
  messages: 5
}
```
**의미**: 그리드의 각 봇을 렌더링
**확인사항**: index 순서대로 렌더링되는지

#### 🧠 MAIN BRAIN RENDERED
```javascript
%c[MultiBotPanel] 🧠 MAIN BRAIN RENDERED: chatgpt
{
  mainBrainBotId: "chatgpt",
  visible: true,
  cssClass: "visible",
  containerExists: true
}
```
**의미**: 메인브레인 컨테이너 렌더링 완료
**확인사항**: `visible: true`

#### 🙈 MAIN BRAIN HIDDEN (CSS only)
```javascript
%c[MultiBotPanel] 🙈 MAIN BRAIN HIDDEN (CSS only)
{
  mainBrainBotId: "(none)",
  visible: false,
  cssClass: "hidden",
  containerExists: false
}
```
**의미**: 메인브레인이 없어서 CSS `hidden` 클래스로 숨김
**중요**: 컴포넌트는 렌더링되지만 CSS로만 숨겨짐 (unmount 아님)

#### 💤 INACTIVE IFRAME CONTAINER
```javascript
%c[MultiBotPanel] 💤 INACTIVE IFRAME CONTAINER (2 bots)
{
  count: 2,
  botIds: ["grok", "lmarena"],
  position: "off-screen (left: -9999px)",
  purpose: "SESSION PRESERVATION"
}
```
**의미**: 비활성 iframe 봇들을 화면 밖에 렌더링 (세션 보존용)
**확인사항**: 여기에 있는 봇들은 화면에 보이지 않지만 세션 유지됨

#### 💤 Rendering INACTIVE iframe
```javascript
%c[MultiBotPanel] 💤 Rendering INACTIVE iframe: grok
{
  botId: "grok",
  messages: 10,
  offScreen: true,
  sessionPreserved: true
}
```
**의미**: 각 비활성 iframe 봇 렌더링
**확인사항**: `sessionPreserved: true`

---

## 3. 시나리오별 로그 패턴

### 시나리오 1: 그리드 변경 (2 → 3)

**예상 로그 순서:**

```javascript
// 1. 렌더링 시작
%c[MultiBotPanel] 🔄 RENDER #10

// 2. Layout 변경 감지
%c[MultiBotPanel] 📐 Layout Changed: 3

// 3. Bots3 배열 변경
%c[MultiBotPanel] 🔢 Bots3 Changed: ["chatgpt", "claude", "gemini"]

// 4. Active Bots 재계산
%c[MultiBotPanel] ✅ Active Bots Calculated for layout="3":
{
  layout: "3",
  activeBotIds: ["chatgpt", "claude", "gemini"],
  count: 3
}

// 5. Grid BotIds 재계산 (메인브레인 없으면 그대로)
%c[MultiBotPanel] 📐 Grid BotIds Calculated:
{
  activeBotIds: ["chatgpt", "claude", "gemini"],
  mainBrainBotId: "(none)",
  gridBotIds: ["chatgpt", "claude", "gemini"],
  filtered: 0
}

// 6. Grid Chats
%c[MultiBotPanel] 🎯 Grid Chats (3):

// 7. Inactive Iframe Bots (qwen, grok가 비활성화됨)
%c[MultiBotPanel] 🙈 Inactive Iframe Bots (2):
{
  inactiveBots: ["qwen", "grok"]
}

// 8. State Snapshot
%c[MultiBotPanel] 📊 === STATE SNAPSHOT #10 ===

// 9. Grid 렌더링
%c[MultiBotPanel] 🎨 GRID RENDERED (3 bots)

// 10. Gemini 새로 마운트 (2-grid에서는 없었음)
%c[ConversationPanel] 🎬 MOUNTED: gemini

// 11. Qwen, Grok 비활성 컨테이너로 이동
%c[PersistentIframe] 🧹 UNMOUNT CLEANUP START: qwen
%c[IframeManager] 🧹 DETACH START: qwen
%c[IframeManager] 📦 Moving to STASH: qwen
%c[IframeManager] ✅ DETACHED → STASH: qwen
```

**✅ 성공 지표:**
- Qwen, Grok의 `UNMOUNTED` 로그 없음 (비활성 컨테이너로 이동만)
- IframeManager의 `RELOAD DETECTED` 로그 없음
- ChatMap 일관성 유지

**❌ 실패 시그널:**
```javascript
// ⚠️ 이 로그가 나오면 세션 손실!
%c[ConversationPanel] 💀 UNMOUNTED: qwen
{
  WARNING: "⚠️ IFRAME UNMOUNT = SESSION LOSS!"
}

// ⚠️ iframe reload 발생!
%c[IframeManager] 🔄 RELOAD DETECTED: qwen ⚠️
{
  reloadCount: 2,
  WARNING: "⚠️ SESSION MAY BE LOST!"
}
```

---

### 시나리오 2: 메인브레인 설정 (ChatGPT)

**예상 로그 순서:**

```javascript
// 1. chrome.storage 변경 이벤트
%c[MultiBotPanel] 📡 Storage changed event:
{
  changes: { mainBrainBotId: { oldValue: "", newValue: "chatgpt" } },
  area: "sync"
}

// 2. 메인브레인 변경 감지
%c[MultiBotPanel] 🔄 Main Brain CHANGED:
{
  from: "(none)",
  to: "chatgpt",
  timestamp: "2025-10-31T10:30:00.000Z"
}

// 3. mainBrainBotId state 변경
%c[MultiBotPanel] 🧠 MainBrainBotId Changed: "chatgpt"

// 4. 렌더링 (activeBotIds는 변경 없음!)
%c[MultiBotPanel] 🔄 RENDER #15

// 5. 메인브레인 상태 확인
%c[MultiBotPanel] 🧠 Main Brain Status:
{
  mainBrainBotId: "chatgpt",
  hasMainBrain: true,
  chatInstance: "EXISTS",
  inActiveBotIds: true
}

// 6. Grid BotIds 재계산 (ChatGPT 제외)
%c[MultiBotPanel] 📐 Grid BotIds Calculated:
{
  activeBotIds: ["chatgpt", "claude", "gemini", "perplexity"],
  mainBrainBotId: "chatgpt",
  gridBotIds: ["claude", "gemini", "perplexity"],
  filtered: 1
}

// 7. Active Chats (메인브레인 포함)
%c[MultiBotPanel] 🎯 Active Chats (WITH MainBrain):
{
  gridCount: 3,
  mainBrain: "chatgpt",
  total: 4
}

// 8. Grid 렌더링 (3개)
%c[MultiBotPanel] 🎨 GRID RENDERED (3 bots)
{
  count: 3,
  botIds: ["claude", "gemini", "perplexity"],
  hasMainBrain: true,
  containerClass: "flex-1"
}

// 9. 메인브레인 렌더링
%c[MultiBotPanel] 🧠 MAIN BRAIN RENDERED: chatgpt
{
  visible: true,
  cssClass: "visible"
}
```

**✅ 성공 지표:**
- `activeBotIds` 변경 로그 없음 (Bots2/3/4/6 변경 로그 없음)
- ChatGPT의 `UNMOUNTED` → `MOUNTED` 로그 없음 (이미 렌더링된 상태)
- IframeManager의 `RELOAD DETECTED` 로그 없음

**❌ 실패 시그널:**
```javascript
// ⚠️ activeBotIds가 변경되면 안 됨!
%c[MultiBotPanel] 🔢 Bots4 Changed: [...]

// ⚠️ ChatGPT가 unmount/mount 되면 안 됨!
%c[ConversationPanel] 💀 UNMOUNTED: chatgpt
%c[ConversationPanel] 🎬 MOUNTED: chatgpt
```

---

### 시나리오 3: 메인브레인 해제

**예상 로그 순서:**

```javascript
// 1. chrome.storage 변경
%c[MultiBotPanel] 🔄 Main Brain CHANGED:
{
  from: "chatgpt",
  to: "(none)"
}

// 2. mainBrainBotId state 변경
%c[MultiBotPanel] 🧠 MainBrainBotId Changed: ""

// 3. 렌더링
%c[MultiBotPanel] 🔄 RENDER #20

// 4. 메인브레인 상태
%c[MultiBotPanel] 🧠 Main Brain Status:
{
  mainBrainBotId: "(none)",
  hasMainBrain: false,
  chatInstance: "NULL"
}

// 5. Grid BotIds (모든 활성 봇 포함)
%c[MultiBotPanel] 📐 Grid BotIds Calculated:
{
  activeBotIds: ["chatgpt", "claude", "gemini", "perplexity"],
  mainBrainBotId: "(none)",
  gridBotIds: ["chatgpt", "claude", "gemini", "perplexity"],
  filtered: 0
}

// 6. Active Chats (메인브레인 없음)
%c[MultiBotPanel] 🎯 Active Chats (NO MainBrain):
{
  total: 4,
  botIds: ["chatgpt", "claude", "gemini", "perplexity"]
}

// 7. Grid 렌더링 (4개 모두)
%c[MultiBotPanel] 🎨 GRID RENDERED (4 bots)
{
  count: 4,
  botIds: ["chatgpt", "claude", "gemini", "perplexity"],
  hasMainBrain: false,
  containerClass: "w-full"
}

// 8. 메인브레인 컨테이너 숨김 (CSS only)
%c[MultiBotPanel] 🙈 MAIN BRAIN HIDDEN (CSS only)
{
  visible: false,
  cssClass: "hidden"
}
```

**✅ 성공 지표:**
- ChatGPT의 `UNMOUNTED` 로그 없음 (CSS hidden만 적용)
- `containerClass: "w-full"` → 그리드가 전체 너비 차지

---

### 시나리오 4: 메인브레인 변경 (ChatGPT → Qwen)

**예상 로그 순서:**

```javascript
// 1. 메인브레인 변경
%c[MultiBotPanel] 🔄 Main Brain CHANGED:
{
  from: "chatgpt",
  to: "qwen"
}

// 2. 렌더링
%c[MultiBotPanel] 🔄 RENDER #25

// 3. Grid BotIds (Qwen 제외, ChatGPT 포함)
%c[MultiBotPanel] 📐 Grid BotIds Calculated:
{
  activeBotIds: ["chatgpt", "claude", "gemini", "qwen"],
  mainBrainBotId: "qwen",
  gridBotIds: ["chatgpt", "claude", "gemini"],
  filtered: 1
}

// 4. Qwen이 비활성 컨테이너에서 메인브레인으로 이동
%c[PersistentIframe] 🔌 MOUNT EFFECT START: qwen
%c[IframeManager] 🔗 ATTACH START: qwen
%c[IframeManager] ✅ CACHE HIT: qwen
{
  reloadCount: 1  // ✅ 여전히 1 (reload 없음!)
}
%c[IframeManager] 📦 Moving iframe: qwen
{
  from: "STASH",
  to: "DIV"
}
%c[IframeManager] ✅ ATTACHED SUCCESSFULLY: qwen
{
  sessionPreserved: true
}

// 5. 메인브레인 렌더링
%c[MultiBotPanel] 🧠 MAIN BRAIN RENDERED: qwen
```

**✅ 성공 지표:**
- Qwen의 `reloadCount: 1` 유지 (증가하지 않음)
- ChatGPT와 Qwen 모두 `UNMOUNTED` 로그 없음
- Qwen의 이전 메시지 유지됨

---

## 4. 문제 진단 방법

### 4.1 세션 초기화 문제

**증상**: 그리드 변경 후 이전 대화 내용 사라짐

**진단 체크리스트:**

1. **ConversationPanel UNMOUNT 확인**
   ```javascript
   // 콘솔에서 검색: "💀 UNMOUNTED"
   ```
   - iframe 봇의 UNMOUNTED 로그가 있으면 → **컴포넌트 unmount 발생**
   - 원인: 조건부 렌더링 또는 key 변경

2. **IframeManager RELOAD 확인**
   ```javascript
   // 콘솔에서 검색: "🔄 RELOAD DETECTED"
   ```
   - RELOAD DETECTED 로그가 있으면 → **iframe 재로드 발생**
   - 원인: DOM reparent 또는 src 변경

3. **ChatMap 일관성 확인**
   ```javascript
   // 콘솔에서 검색: "❌ CHAT INSTANCE INCONSISTENCY"
   ```
   - 일관성 에러가 있으면 → **useChat 중복 호출 문제**

---

### 4.2 레이아웃 깨짐 문제

**증상**: 메인브레인 설정 시 그리드 배열이 이상함

**진단 체크리스트:**

1. **gridBotIds 계산 확인**
   ```javascript
   // 콘솔에서 검색: "📐 Grid BotIds Calculated"
   ```
   - `filtered: 1`이어야 함 (메인브레인이 있을 때)
   - `gridBotIds`에 `mainBrainBotId`가 포함되어 있으면 → **버그!**

2. **Grid 렌더링 확인**
   ```javascript
   // 콘솔에서 검색: "🎨 GRID RENDERED"
   ```
   - `hasMainBrain: true` → `containerClass: "flex-1"`
   - `hasMainBrain: false` → `containerClass: "w-full"`

3. **gridCols 계산 확인**
   - `gridCount % 3 === 0` → `gridCols: 3`
   - 그 외 → `gridCols: 2`

---

### 4.3 메인브레인 설정 시 activeBotIds 변경 문제

**증상**: 메인브레인 설정 시 봇들이 재렌더링됨

**진단 체크리스트:**

1. **activeBotIds 변경 확인**
   ```javascript
   // 콘솔에서 검색: "🔢 Bots"
   ```
   - 메인브레인 설정 시 이 로그가 나오면 → **버그!**
   - activeBotIds는 불변이어야 함

2. **State Snapshot 비교**
   ```javascript
   // 메인브레인 설정 전후 비교
   // Before:
   activeBotIds: ["chatgpt", "claude", "gemini", "perplexity"]

   // After (정상):
   activeBotIds: ["chatgpt", "claude", "gemini", "perplexity"]  // 동일!
   mainBrainBotId: "chatgpt"
   gridBotIds: ["claude", "gemini", "perplexity"]  // chatgpt 제외
   ```

---

## 5. 로그 필터링 팁

### 5.1 Chrome DevTools 필터 사용법

#### 특정 컴포넌트만 보기
```
[MultiBotPanel]
```

#### 특정 봇만 추적
```
chatgpt
```

#### 에러/경고만 보기
```
ERROR|WARNING|RELOAD DETECTED|UNMOUNTED|INCONSISTENCY
```

#### iframe 관련만 보기
```
IframeManager|PersistentIframe
```

#### 세션 보존 관련만 보기
```
STASH|sessionPreserved|RELOAD
```

---

### 5.2 정규표현식 필터

#### 모든 mount/unmount 이벤트
```
/(MOUNTED|UNMOUNTED|ATTACH|DETACH)/
```

#### 모든 state 변경
```
/(Changed|CHANGED)/
```

#### 모든 성공/실패
```
/(✅|❌|⚠️)/
```

---

### 5.3 시간순 이벤트 추적

1. **Timestamp 활성화**
   - DevTools → Settings → Console → Show timestamps

2. **로그 레벨 설정**
   - Verbose 체크 (모든 로그 표시)

3. **Preserve log 활성화**
   - 페이지 리로드 시에도 로그 유지

---

## 6. 로그 분석 예시

### 예시 1: 정상 동작 (2-grid → 3-grid)

```javascript
[10:30:00.000] %c[MultiBotPanel] 🔄 RENDER #8
[10:30:00.010] %c[MultiBotPanel] 📐 Layout Changed: 3
[10:30:00.020] %c[MultiBotPanel] 🔢 Bots3 Changed: ["chatgpt", "claude", "gemini"]
[10:30:00.030] %c[MultiBotPanel] ✅ Active Bots Calculated for layout="3": {count: 3}
[10:30:00.040] %c[MultiBotPanel] 📐 Grid BotIds Calculated: {filtered: 0}
[10:30:00.050] %c[MultiBotPanel] 🎯 Grid Chats (3)
[10:30:00.060] %c[MultiBotPanel] 🙈 Inactive Iframe Bots (2): ["qwen", "grok"]
[10:30:00.070] %c[ConversationPanel] 🎬 MOUNTED: gemini
[10:30:00.080] %c[IframeManager] 🧹 DETACH START: qwen
[10:30:00.090] %c[IframeManager] 📦 Moving to STASH: qwen
[10:30:00.100] %c[IframeManager] ✅ DETACHED → STASH: qwen {sessionPreserved: true}
```

**분석**: ✅ 완벽! Qwen이 UNMOUNT 없이 STASH로 이동, 세션 보존됨

---

### 예시 2: 버그 발생 (세션 손실)

```javascript
[10:35:00.000] %c[MultiBotPanel] 🔄 RENDER #15
[10:35:00.010] %c[MultiBotPanel] 📐 Layout Changed: 3
[10:35:00.020] %c[ConversationPanel] 💀 UNMOUNTED: qwen
[10:35:00.020] {
  WARNING: "⚠️ IFRAME UNMOUNT = SESSION LOSS!"
}
[10:35:00.030] %c[IframeManager] 🔄 RELOAD DETECTED: qwen ⚠️
[10:35:00.030] {
  reloadCount: 2,
  WARNING: "⚠️ SESSION MAY BE LOST!"
}
```

**분석**: ❌ 버그! Qwen이 UNMOUNT됨 → iframe reload 발생 → 세션 손실

**원인 추정**:
1. `inactiveIframeChats`가 렌더링되지 않음
2. 조건부 렌더링으로 컴포넌트가 DOM에서 제거됨
3. React key가 변경되어 리마운트됨

---

## 7. 추가 디버깅 커맨드

### 7.1 콘솔에서 직접 실행

```javascript
// IframeManager 상태 확인
iframeManager.stats()

// 특정 봇의 iframe 확인
const iframe = document.getElementById('md-iframe-qwen')
console.log('Qwen iframe:', {
  exists: !!iframe,
  src: iframe?.src,
  parent: iframe?.parentElement?.id
})

// Stash 컨테이너 확인
const stash = document.getElementById('md-iframe-stash')
console.log('Stash container:', {
  exists: !!stash,
  childCount: stash?.children.length,
  children: Array.from(stash?.children || []).map(c => c.id)
})

// 활성 봇 확인 (React DevTools 필요)
// MultiBotChatPanel 컴포넌트의 state 확인
```

---

## 8. 결론

이 로그 시스템을 통해 다음을 정확히 파악할 수 있습니다:

✅ **렌더링 흐름**: 어떤 컴포넌트가 언제 렌더링되는지
✅ **State 변경**: 모든 state 변경 이력 추적
✅ **useChat 일관성**: chat 인스턴스 중복 생성 감지
✅ **메인브레인 로직**: 메인브레인 설정/변경 시 동작 확인
✅ **iframe 생명주기**: iframe의 mount/unmount/reload 추적
✅ **세션 보존**: iframe이 stash로 이동하여 세션 유지되는지 확인

**문제 발생 시 체크리스트:**
1. `💀 UNMOUNTED` (iframe 봇) → 세션 손실 원인
2. `🔄 RELOAD DETECTED` → iframe 재로드 발생
3. `❌ CHAT INSTANCE INCONSISTENCY` → useChat 중복 호출
4. `activeBotIds` 변경 (메인브레인 설정 시) → 불필요한 리렌더링

---

**문서 버전**: v1.0
**작성일**: 2025-10-31
**작성자**: Claude (SuperClaude v2.0.1)
