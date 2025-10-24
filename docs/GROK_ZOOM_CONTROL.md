# Grok 배율 조절 UI 추가 - 아키텍처 분석

## 🎯 요구사항
- Grok 타이틀 오른쪽에 배율 설정 드롭다운 추가
- **최소 수정으로 최대 효과**: ConversationPanel 1곳만 수정
- 왼쪽 사이드바 + 메인 6분할 화면 모두 자동 반영

---

## 🔍 아키텍처 심층 분석

### 컴포넌트 재사용 구조

```
ConversationPanel (핵심 컴포넌트)
    ├─ SidePanelPage (왼쪽 사이드바)
    │   └─ 단일 봇, onSwitchBot 있음
    │
    ├─ MultiBotChatPanel (메인 6분할)
    │   ├─ mode="compact"
    │   └─ onSwitchBot 전달 (드롭다운 활성화)
    │
    └─ SingleBotChatPanel (개별 봇 페이지)
        └─ 단일 봇
```

### 드롭다운 작동 원리

**ChatbotName 컴포넌트:**
```tsx
// onSwitchBot이 있으면 → 드롭다운 표시
// onSwitchBot이 없으면 → 단순 텍스트
<ChatbotName
  botId={props.botId}
  name={botInfo.name}
  onSwitchBot={props.onSwitchBot}  // 있으면 드롭다운 활성화
/>
```

**MultiBotChatPanel에서 전달:**
```tsx
// Line 138
onSwitchBot={setBots ? (botId) => onSwitchBot(botId, index) : undefined}
```

---

## 💡 최적 구현 전략

### 단 1곳만 수정: ConversationPanel.tsx

**위치:** Grok 전용 렌더링 블록 내부
**파일:** `src/app/components/Chat/ConversationPanel.tsx`
**라인:** 113-146

### 추가할 위치

```tsx
// Line 118-122 (헤더 부분)
<div className="flex flex-row items-center gap-2">
  <img src={botInfo.avatar} />
  <ChatbotName botId={props.botId} name={botInfo.name} />

  {/* ✅ 여기에 배율 드롭다운 추가! */}
  <ZoomControl />
</div>
```

---

## 🎨 구현 계획

### 1. useState로 배율 관리
```tsx
const [grokZoom, setGrokZoom] = useState(1.25)
```

### 2. 드롭다운 UI
```tsx
<select
  value={grokZoom}
  onChange={(e) => setGrokZoom(Number(e.target.value))}
  className="..."
>
  <option value="1.0">100%</option>
  <option value="1.25">125%</option>
  <option value="1.5">150%</option>
  <option value="2.0">200%</option>
</select>
```

### 3. iframe 스타일 동적 적용
```tsx
<iframe
  style={{
    transform: `scale(${grokZoom})`,
    width: `${100 / grokZoom}%`,
    height: `${100 / grokZoom}%`,
    ...
  }}
/>
```

### 4. localStorage 저장 (선택사항)
```tsx
useEffect(() => {
  const saved = localStorage.getItem('grok-zoom')
  if (saved) setGrokZoom(Number(saved))
}, [])

useEffect(() => {
  localStorage.setItem('grok-zoom', String(grokZoom))
}, [grokZoom])
```

---

## 🔄 자동 반영 범위

### ✅ 자동으로 적용되는 곳

1. **왼쪽 사이드바** (SidePanelPage)
   - ConversationPanel 직접 사용
   - ✅ 배율 드롭다운 자동 표시

2. **메인 6분할 화면** (MultiBotChatPanel)
   - ConversationPanel을 6개 렌더링
   - ✅ Grok 패널에만 배율 드롭다운 자동 표시

3. **단일 봇 페이지** (SingleBotChatPanel)
   - ConversationPanel 사용
   - ✅ 배율 드롭다운 자동 표시

### 추가 작업 불필요

- ❌ MultiBotChatPanel 수정 불필요
- ❌ SidePanelPage 수정 불필요
- ❌ SingleBotChatPanel 수정 불필요
- ✅ **ConversationPanel 1곳만 수정!**

---

## 📝 구현 세부사항

### Grok 전용 조건부 렌더링

```tsx
// ConversationPanel.tsx Line 113
if (props.botId === 'grok') {
  return (
    <ConversationContext.Provider value={context}>
      <div className="flex flex-col overflow-hidden bg-primary-background h-full rounded-[20px]">
        {/* 헤더 */}
        <div className="flex flex-row items-center justify-between border-b ...">
          <div className="flex flex-row items-center gap-2">
            <img src={botInfo.avatar} />
            <ChatbotName botId={props.botId} name={botInfo.name} />

            {/* ✅ 배율 드롭다운 추가 */}
            <select
              value={grokZoom}
              onChange={(e) => setGrokZoom(Number(e.target.value))}
              className="ml-2 px-2 py-1 text-xs border rounded"
            >
              <option value="1.0">100%</option>
              <option value="1.25">125%</option>
              <option value="1.5">150%</option>
              <option value="2.0">200%</option>
            </select>
          </div>
        </div>

        {/* iframe with dynamic zoom */}
        <div className="flex-1 relative overflow-auto">
          <iframe
            src="https://grok.com"
            style={{
              transform: `scale(${grokZoom})`,
              transformOrigin: 'top left',
              width: `${100 / grokZoom}%`,
              height: `${100 / grokZoom}%`,
              minHeight: '100%',
              minWidth: '100%'
            }}
            ...
          />
        </div>
      </div>
    </ConversationContext.Provider>
  )
}
```

---

## 🎯 왜 이 방법이 최적인가?

### DRY 원칙 준수
- 배율 로직이 1곳에만 존재
- 중복 코드 없음

### KISS 원칙 준수
- 단순하고 명확한 구조
- 복잡한 prop drilling 없음

### 최소 수정, 최대 효과
- 수정 파일: 1개 (ConversationPanel.tsx)
- 적용 범위: 3곳 (SidePanel, MultiBot, SingleBot)
- 코드 추가: 약 20줄

### 유지보수성
- 배율 변경 시 1곳만 수정
- 버그 발생 시 1곳만 확인
- 테스트 범위 최소화

---

## 🔍 검증 계획

### 테스트 시나리오

1. **왼쪽 사이드바에서 Grok 선택**
   - ✅ 배율 드롭다운 표시 확인
   - ✅ 100%, 125%, 150%, 200% 전환 확인

2. **메인 6분할 화면**
   - ✅ 6개 패널 중 Grok만 드롭다운 표시
   - ✅ 다른 봇(ChatGPT, Claude)은 드롭다운 없음
   - ✅ Grok 패널 배율 변경 확인

3. **localStorage 저장**
   - ✅ 배율 변경 후 새로고침
   - ✅ 설정 값 유지 확인

4. **반응형**
   - ✅ 패널 크기 조절 시 iframe도 조절
   - ✅ 스크롤 정상 작동

---

## 📊 Before vs After

### Before
```
ConversationPanel: Grok 전용 렌더링 (배율 고정 1.25)
  ↓
SidePanel, MultiBot, SingleBot 모두 125% 고정
```

### After
```
ConversationPanel: Grok 전용 렌더링 (배율 선택 가능)
  ↓
SidePanel, MultiBot, SingleBot 모두 배율 조절 가능!
```

---

## ✅ 구현 체크리스트

- [ ] ConversationPanel에 useState(grokZoom) 추가
- [ ] Grok 헤더에 select 드롭다운 추가
- [ ] iframe style을 동적 zoom으로 변경
- [ ] localStorage 저장/불러오기 추가
- [ ] 빌드 성공 확인
- [ ] 왼쪽 사이드바 테스트
- [ ] 메인 6분할 화면 테스트
- [ ] 단일 봇 페이지 테스트

---

## 🚀 예상 효과

1. **사용자 경험 대폭 향상**
   - 본인 취향에 맞는 배율 선택 가능
   - 작은 화면/큰 화면 모두 최적화

2. **코드 품질**
   - 단일 책임 원칙 준수
   - 중복 없는 깔끔한 코드

3. **유지보수성**
   - 수정이 필요하면 1곳만
   - 버그 추적 용이

---

## 💡 향후 확장 가능성

### 다른 봇에도 적용 가능
```tsx
// ChatGPT, Claude 등에도 동일한 패턴 적용
if (props.botId === 'chatgpt') {
  return <ChatGPTWithZoom />
}
if (props.botId === 'claude') {
  return <ClaudeWithZoom />
}
```

### 전역 설정으로 확장
```tsx
// 사용자 설정에 각 봇별 배율 저장
{
  grokZoom: 1.25,
  chatgptZoom: 1.0,
  claudeZoom: 1.5
}
```

---

## 📝 최종 결론

**최소 수정 = ConversationPanel.tsx 1개 파일**
**최대 효과 = 모든 화면에서 배율 조절 가능**

이것이 바로 **"최소의 코드로 최대의 효과"**를 내는 아키텍처입니다! 🎯
