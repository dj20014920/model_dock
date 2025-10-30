# Hybrid iframe 아키텍처 - Claude 스타일 구현

## 🎯 목표

**왼쪽 Grok (현재):**
```
┌─────────────────┐
│  [iframe 그대로] │
│  grok.com 화면  │
│  전체 표시      │
└─────────────────┘
```

**오른쪽 Claude (목표):**
```
┌─────────────────┐
│ 깔끔한 채팅 UI  │
│ ┌─────────────┐ │
│ │ 사용자: 안녕 │ │
│ │ Claude: 반가워│ │
│ └─────────────┘ │
│ [입력창]        │
└─────────────────┘
     ↕ (숨김)
[iframe: claude.ai]
```

## 🔍 핵심 아이디어

### Hybrid 방식
```
1. iframe을 화면 밖에 숨김 (display: none 또는 position: absolute; left: -9999px)
2. Extension에서 자체 채팅 UI 렌더링
3. 사용자 입력 → iframe에 postMessage로 전달
4. iframe에서 응답 → postMessage로 받아서 UI에 표시
```

## 🚀 구현 방법

### 1단계: iframe 숨기기

```typescript
// ConversationPanel.tsx
if (props.botId === 'chatgpt') {
  return (
    <div className="flex flex-col h-full">
      {/* 자체 채팅 UI */}
      <ChatMessageList messages={messages} />
      <ChatMessageInput onSend={handleSend} />
      
      {/* 숨겨진 iframe */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <PersistentIframe
          botId="chatgpt"
          src="https://chat.openai.com"
        />
      </div>
    </div>
  )
}
```

### 2단계: iframe과 통신

```typescript
// 메시지 전송
function handleSend(text: string) {
  const iframe = document.querySelector('#md-iframe-chatgpt') as HTMLIFrameElement
  
  // iframe에 메시지 전달
  iframe.contentWindow?.postMessage({
    type: 'SEND_MESSAGE',
    text: text,
    source: 'model-dock'
  }, 'https://chat.openai.com')
}

// iframe에서 응답 받기
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://chat.openai.com') return
  
  if (event.data.type === 'RESPONSE') {
    // UI에 응답 표시
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: event.data.text
    }])
  }
})
```

### 3단계: Content Script로 iframe 제어

```typescript
// src/content-script/chatgpt-bridge.ts
// (chat.openai.com 내부에서 실행)

// Extension에서 메시지 받기
window.addEventListener('message', async (event) => {
  if (event.data.type === 'SEND_MESSAGE') {
    const text = event.data.text
    
    // 1. 입력창 찾기
    const input = document.querySelector('textarea')
    
    // 2. 텍스트 입력
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
    
    // 3. 전송 버튼 클릭
    const sendBtn = document.querySelector('button[type="submit"]')
    sendBtn?.click()
    
    // 4. 응답 감지
    const observer = new MutationObserver(() => {
      const lastMessage = document.querySelector('[data-message-author-role="assistant"]:last-child')
      if (lastMessage) {
        // Extension에 응답 전달
        window.parent.postMessage({
          type: 'RESPONSE',
          text: lastMessage.textContent
        }, '*')
      }
    })
    
    observer.observe(document.body, { childList: true, subtree: true })
  }
})
```

## ⚠️ 문제점 및 해결

### 문제 1: Cross-Origin 제약

```
Extension → iframe.contentWindow.postMessage()
           ↓
         ❌ Cross-Origin 차단!
```

**해결:** Content Script를 중간 다리로 사용

```
Extension → Content Script (chat.openai.com 내부)
                ↓
           DOM 직접 조작 ✅
```

### 문제 2: 응답 감지의 어려움

ChatGPT는 스트리밍 방식으로 응답:
```
"안" → "안녕" → "안녕하" → "안녕하세요"
```

**해결:** MutationObserver로 실시간 감지

```typescript
const observer = new MutationObserver((mutations) => {
  const assistantMsg = document.querySelector('[data-message-author-role="assistant"]:last-child')
  
  if (assistantMsg) {
    // 실시간으로 Extension에 전달
    window.parent.postMessage({
      type: 'RESPONSE_CHUNK',
      text: assistantMsg.textContent
    }, '*')
  }
})
```

### 문제 3: 로그인 상태 유지

iframe이 숨겨져 있어도 쿠키는 유지됨:
```
✅ 로그인 상태 유지
✅ 세션 유지
✅ 대화 히스토리 유지
```

## 📊 구현 복잡도

### 방식 비교

| 방식 | 복잡도 | 안정성 | 기능 완전성 |
|---|---|---|---|
| **iframe 그대로** | ⭐ | ⭐⭐⭐⭐⭐ | 100% |
| **Hybrid (숨김 iframe)** | ⭐⭐⭐⭐ | ⭐⭐⭐ | 80% |
| **완전 자체 구현** | ⭐⭐⭐⭐⭐ | ⭐⭐ | 60% |

### 필요한 작업

1. **Content Script 작성** (⭐⭐⭐⭐)
   - 입력창 찾기 (DOM 구조 분석 필요)
   - 텍스트 입력 시뮬레이션
   - 전송 버튼 클릭
   - 응답 감지 (MutationObserver)

2. **postMessage 통신** (⭐⭐⭐)
   - Extension ↔ Content Script 통신
   - 보안 검증 (origin 체크)
   - 에러 처리

3. **자체 UI 구현** (⭐⭐)
   - 채팅 메시지 리스트
   - 입력창
   - 로딩 상태
   - 에러 표시

4. **상태 동기화** (⭐⭐⭐⭐⭐)
   - Extension UI ↔ iframe 상태 동기화
   - 대화 히스토리 관리
   - 에러 복구

## 🎯 실제 구현 예시

### 파일 구조

```
src/
├── content-script/
│   └── chatgpt-bridge.ts        # iframe 내부에서 실행
├── app/
│   ├── components/
│   │   └── HybridChatPanel.tsx  # 자체 UI
│   └── services/
│       └── iframe-bridge.ts     # postMessage 통신
```

### HybridChatPanel.tsx

```typescript
export function HybridChatPanel({ botId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // iframe과 통신 설정
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://chat.openai.com') return
      
      if (event.data.type === 'RESPONSE_CHUNK') {
        // 스트리밍 응답 업데이트
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), {
              ...last,
              content: event.data.text
            }]
          }
          return [...prev, {
            role: 'assistant',
            content: event.data.text
          }]
        })
      }
      
      if (event.data.type === 'RESPONSE_DONE') {
        setLoading(false)
      }
    }
    
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleSend = (text: string) => {
    // 사용자 메시지 추가
    setMessages(prev => [...prev, {
      role: 'user',
      content: text
    }])
    
    setLoading(true)
    
    // iframe에 전달
    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'SEND_MESSAGE',
        text: text,
        source: 'model-dock'
      }, 'https://chat.openai.com')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 자체 채팅 UI */}
      <div className="flex-1 overflow-auto">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'user-message' : 'assistant-message'}>
            {msg.content}
          </div>
        ))}
        {loading && <div>Loading...</div>}
      </div>
      
      {/* 입력창 */}
      <ChatInput onSend={handleSend} disabled={loading} />
      
      {/* 숨겨진 iframe */}
      <div style={{ position: 'absolute', left: '-9999px' }}>
        <iframe
          ref={iframeRef}
          src="https://chat.openai.com"
          sandbox="allow-same-origin allow-scripts allow-forms"
        />
      </div>
    </div>
  )
}
```

### chatgpt-bridge.ts (Content Script)

```typescript
// chat.openai.com 내부에서 실행

if (!(window as any).__CHATGPT_BRIDGE__) {
  ;(window as any).__CHATGPT_BRIDGE__ = true

  console.log('[ChatGPT-Bridge] 🌉 초기화')

  // Extension에서 메시지 받기
  window.addEventListener('message', async (event) => {
    // 보안: Extension origin만 허용
    if (!event.origin.startsWith('chrome-extension://')) return
    
    if (event.data.type === 'SEND_MESSAGE') {
      const text = event.data.text
      console.log('[ChatGPT-Bridge] 📨 메시지 받음:', text)
      
      try {
        // 1. 입력창 찾기
        const input = document.querySelector('textarea[placeholder*="Message"]') as HTMLTextAreaElement
        if (!input) throw new Error('입력창 없음')
        
        // 2. 텍스트 입력
        input.value = text
        input.dispatchEvent(new Event('input', { bubbles: true }))
        
        // 3. 전송 버튼 클릭
        await new Promise(resolve => setTimeout(resolve, 100))
        const sendBtn = document.querySelector('button[data-testid="send-button"]') as HTMLButtonElement
        if (!sendBtn) throw new Error('전송 버튼 없음')
        sendBtn.click()
        
        // 4. 응답 감지
        let lastText = ''
        const observer = new MutationObserver(() => {
          const assistantMsg = document.querySelector('[data-message-author-role="assistant"]:last-child')
          if (assistantMsg) {
            const currentText = assistantMsg.textContent || ''
            if (currentText !== lastText) {
              lastText = currentText
              
              // Extension에 스트리밍 응답 전달
              window.parent.postMessage({
                type: 'RESPONSE_CHUNK',
                text: currentText
              }, '*')
            }
          }
        })
        
        observer.observe(document.body, { childList: true, subtree: true })
        
        // 10초 후 observer 정리
        setTimeout(() => {
          observer.disconnect()
          window.parent.postMessage({
            type: 'RESPONSE_DONE'
          }, '*')
        }, 10000)
        
      } catch (error) {
        console.error('[ChatGPT-Bridge] ❌ 에러:', error)
        window.parent.postMessage({
          type: 'ERROR',
          error: (error as Error).message
        }, '*')
      }
    }
  })
  
  console.log('[ChatGPT-Bridge] ✅ 준비 완료')
}
```

## 🎊 결론

### 가능합니다!

**Hybrid 방식으로 Claude처럼 구현 가능:**
- ✅ iframe 숨기기
- ✅ 자체 UI로 채팅
- ✅ Content Script로 iframe 제어
- ✅ postMessage로 통신

### 하지만...

**복잡도가 매우 높습니다:**
- ⚠️ DOM 구조 분석 필요 (사이트마다 다름)
- ⚠️ 사이트 업데이트 시 깨질 수 있음
- ⚠️ 에러 처리 복잡
- ⚠️ 유지보수 어려움

### 권장 사항

**단계적 접근:**
1. **1단계:** iframe 그대로 사용 (현재) ← 안정적
2. **2단계:** Hybrid 방식 시도 (실험적)
3. **3단계:** 완전 자체 구현 (장기 목표)

**구현하시겠습니까?**
