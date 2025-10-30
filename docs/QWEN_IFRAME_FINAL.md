# Qwen iframe 최종 구현 완료

## 구현 내용

Grok과 LMArena의 모든 기능을 그대로 승계하여 Qwen에 적용했습니다.

### 1. Declarative Net Request 규칙
**파일:** `src/rules/qwen-iframe.json`
```json
{
  "id": 3,
  "priority": 1,
  "action": {
    "type": "modifyHeaders",
    "responseHeaders": [
      { "header": "x-frame-options", "operation": "remove" },
      { "header": "content-security-policy", "operation": "remove" },
      { "header": "x-content-type-options", "operation": "remove" }
    ]
  },
  "condition": {
    "urlFilter": "*qwen.ai*",
    "resourceTypes": ["main_frame", "sub_frame"]
  }
}
```

### 2. manifest.config.ts
```typescript
{
  id: 'ruleset_qwen_iframe',
  enabled: true,
  path: 'src/rules/qwen-iframe.json',
}
```

### 3. QwenWebBot (간소화)
**파일:** `src/app/bots/qwen-web/index.ts`
```typescript
export class QwenWebBot extends AbstractBot {
  async doSendMessage(params: SendMessageParams): Promise<void> {
    params.onEvent({
      type: 'UPDATE_ANSWER',
      data: {
        text: '💬 Qwen은 위의 내장된 화면에서 직접 사용하세요.\n\n' +
              '💡 문제가 있다면 chat.qwen.ai에 로그인 후 다시 시도해주세요.'
      }
    })
    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {
    console.log('[QWEN-WEBAPP] 🔄 Conversation managed in Qwen.ai tab')
  }

  get name() {
    return 'Qwen'
  }
}
```

### 4. ConversationPanel (Grok과 동일한 기능)
**파일:** `src/app/components/Chat/ConversationPanel.tsx`

#### 추가된 기능:
1. **iframe ref**: `qwenIframeRef`
2. **배율 조절 상태**: `qwenZoom` (localStorage 저장)
3. **배율 슬라이더**: 0.5x ~ 2.0x (50% ~ 200%)
4. **배율 텍스트 입력**: 직접 입력 가능
5. **동적 transform**: `scale()` + `transformOrigin`
6. **sandbox 속성**: 보안 설정
7. **allow 속성**: 클립보드 접근

#### 구현 코드:
```typescript
// Qwen iframe ref
const qwenIframeRef = useRef<HTMLIFrameElement>(null)

// Qwen 전용: 배율 조절 상태
const [qwenZoom, setQwenZoom] = useState(() => {
  try {
    const saved = localStorage.getItem('qwen-zoom')
    return saved ? Number(saved) : 1.0
  } catch {
    return 1.0
  }
})

// Qwen 전용 렌더링
if (props.botId === 'qwen') {
  return (
    <ConversationContext.Provider value={context}>
      <div className="flex flex-col overflow-hidden bg-primary-background h-full rounded-[20px]">
        {/* 헤더 + 배율 조절 UI */}
        <div className={cx('flex flex-row items-center justify-between border-b border-solid border-primary-border', mode === 'full' ? 'py-3 mx-5' : 'py-[10px] mx-3')}>
          <div className="flex flex-row items-center gap-2">
            <img src={botInfo.avatar} className="w-5 h-5 object-contain rounded-full" />
            <ChatbotName botId={props.botId} name={botInfo.name} onSwitchBot={props.onSwitchBot} />
          </div>

          {/* 배율 조절: 슬라이더 + 텍스트 입력 */}
          <div className="flex flex-row items-center gap-2">
            <span className="text-[10px] text-light-text whitespace-nowrap">배율</span>
            <input type="range" min="0.5" max="2.0" step="0.05" value={qwenZoom}
              onChange={(e) => {
                const newZoom = Number(e.target.value)
                setQwenZoom(newZoom)
                localStorage.setItem('qwen-zoom', String(newZoom))
              }}
              className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              style={{ accentColor: '#10a37f' }}
            />
            <input type="text" value={Math.round(qwenZoom * 100)}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/[^\d]/g, '')
                if (sanitized === '') return
                const numValue = Math.max(50, Math.min(200, parseInt(sanitized, 10)))
                const newZoom = numValue / 100
                setQwenZoom(newZoom)
                localStorage.setItem('qwen-zoom', String(newZoom))
              }}
              className="w-12 px-1.5 py-0.5 text-[10px] text-center border border-primary-border rounded bg-secondary text-primary-text focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-[10px] text-light-text">%</span>
          </div>
        </div>

        {/* Qwen iframe - 동적 배율 조절 */}
        <div className="flex-1 relative overflow-auto">
          <iframe
            ref={qwenIframeRef}
            src="https://chat.qwen.ai"
            className="w-full h-full border-0"
            style={{
              minHeight: '100%',
              minWidth: '100%',
              transform: `scale(${qwenZoom})`,
              transformOrigin: 'top left',
              width: `${100 / qwenZoom}%`,
              height: `${100 / qwenZoom}%`
            }}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            allow="clipboard-read; clipboard-write"
            title="Qwen Chat"
          />
        </div>
      </div>
    </ConversationContext.Provider>
  )
}
```

## 기능 비교

| 기능 | Grok | LMArena | Qwen |
|---|---|---|---|
| iframe ref | ✅ | ✅ | ✅ |
| 배율 조절 | ✅ (50-300%) | ✅ (50-200%) | ✅ (50-200%) |
| 슬라이더 | ✅ | ✅ | ✅ |
| 텍스트 입력 | ✅ | ✅ | ✅ |
| localStorage 저장 | ✅ | ✅ | ✅ |
| transform scale | ✅ | ✅ | ✅ |
| sandbox 속성 | ✅ | ✅ | ✅ |
| 클립보드 접근 | ✅ | ✅ | ✅ |

## 사용 방법

1. **확장 프로그램 다시 로드**
   - `chrome://extensions/`
   - "다시 로드" 버튼 클릭

2. **Qwen 봇 선택**
   - 확장 프로그램에서 Qwen 선택

3. **iframe에서 직접 사용**
   - 내장된 Qwen 화면에서 직접 채팅
   - 배율 조절: 슬라이더 또는 텍스트 입력
   - 로그인 필요 시 iframe 내에서 로그인

## 빌드 완료
- ✅ TypeScript 컴파일 성공
- ✅ Vite 빌드 성공
- ✅ 진단 오류 없음
- ✅ 파일 크기: 1,381.55 kB (gzip: 453.65 kB)

## 결론

Qwen은 이제 Grok, LMArena와 **완전히 동일한 방식**으로 작동합니다:
- ✅ iframe 내장
- ✅ 배율 조절 (슬라이더 + 텍스트 입력)
- ✅ localStorage 저장
- ✅ ref를 통한 iframe 접근 가능
- ✅ 모든 Qwen 기능 사용 가능

확장 프로그램을 다시 로드하면 즉시 사용 가능합니다!
