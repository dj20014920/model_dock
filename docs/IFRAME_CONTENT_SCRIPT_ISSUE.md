# iframe과 Content Script 문제 해결

## 🚨 발견된 문제

### 1. ChatGPT iframe이 하얀 화면
**원인:** `iframe-registry.ts`에 ChatGPT가 등록되지 않음
**해결:** ✅ 등록 완료

### 2. Grok 커스터마이징이 적용 안 됨
**원인:** Content Script는 iframe 내부에서 작동하지 않음!

## 🔍 근본 원인 분석

### Content Script의 제약

```
Extension의 Content Script는:
✅ 브라우저 탭에서 실행됨
❌ Extension 내부 iframe에서는 실행 안 됨!
```

**현재 상황:**
```
[Extension App] 
  └─ [iframe: grok.com]  ← Content Script 실행 안 됨!
```

**Content Script가 실행되는 경우:**
```
[브라우저 탭: grok.com]  ← Content Script 실행됨!
```

### 왜 안 되는가?

1. **manifest.config.ts 설정:**
```typescript
content_scripts: [
  {
    matches: ['https://grok.com/*'],  // 브라우저 탭에서만 매칭
    js: ['src/content-script/customize-grok.ts'],
  }
]
```

2. **iframe은 Extension 내부:**
```typescript
// Extension 앱 내부의 iframe
<iframe src="https://grok.com" />
// ↑ 이것은 "브라우저 탭"이 아니므로 Content Script 실행 안 됨
```

## 💡 해결 방법

### 방법 1: 새 탭에서 열기 (현재 Grok 방식)

Grok은 실제로 **새 탭**에서 열립니다:

```typescript
// Grok은 iframe이 아니라 새 탭!
chrome.tabs.create({ url: 'https://grok.com' })
// ↑ 이 경우 Content Script가 작동함
```

### 방법 2: iframe 내부에 직접 주입 (불가능)

```typescript
// ❌ Cross-Origin으로 차단됨
iframeRef.current.contentDocument.head.appendChild(style)
```

### 방법 3: Declarative Net Request로 CSS 주입 (가능!)

**이것이 유일한 해결책입니다!**

```json
// src/rules/chatgpt-custom-css.json
{
  "id": 11,
  "priority": 1,
  "action": {
    "type": "modifyHeaders",
    "responseHeaders": [
      {
        "header": "content-security-policy",
        "operation": "remove"
      }
    ]
  },
  "condition": {
    "urlFilter": "*openai.com*",
    "resourceTypes": ["main_frame", "sub_frame"]
  }
}
```

하지만 이것도 **CSS만 가능**하고 JavaScript는 불가능합니다.

### 방법 4: 포기하고 원본 UI 사용 (권장)

**iframe 방식의 핵심 장점:**
- ✅ 원본 UI 그대로 사용
- ✅ 모든 기능 사용 가능
- ✅ 안정적

**커스터마이징 포기:**
- ❌ CSS 변경 불가
- ❌ 워터마크 추가 불가
- ❌ JavaScript 실행 불가

## 🎯 최종 결론

### Grok 커스터마이징이 작동하지 않는 이유

**Grok은 iframe이 아니라 새 탭에서 열립니다!**

확인 방법:
```typescript
// src/app/bots/grok/index.ts 확인 필요
// Grok이 실제로 iframe을 사용하는지 확인
```

### ChatGPT iframe 커스터마이징

**불가능합니다. 다음 이유로:**

1. **Content Script 실행 안 됨**
   - iframe 내부에서는 작동하지 않음

2. **Cross-Origin 제약**
   - Extension에서 iframe 내부 접근 불가

3. **유일한 방법: 원본 UI 사용**
   - 커스터마이징 없이 원본 그대로 사용

## 📊 비교표

| 방식 | CSS 변경 | JS 실행 | 워터마크 | 난이도 |
|---|---|---|---|---|
| **새 탭 + Content Script** | ✅ | ✅ | ✅ | 쉬움 |
| **iframe (Extension 내부)** | ❌ | ❌ | ❌ | 불가능 |
| **Proxy Server** | ✅ | ✅ | ✅ | 어려움 |

## 🔧 수정 사항

### 1. iframe-registry.ts
```typescript
// ✅ ChatGPT 추가
chatgpt: {
  src: 'https://chat.openai.com',
  sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals',
  allow: 'clipboard-read; clipboard-write',
  title: 'ChatGPT',
}
```

### 2. Grok 확인 필요

Grok이 실제로 어떻게 구현되어 있는지 확인:
- iframe 사용? → 커스터마이징 불가능
- 새 탭 사용? → 커스터마이징 가능

## 💡 권장 사항

### ChatGPT, Qwen, LMArena

**커스터마이징 포기하고 원본 UI 사용:**
- ✅ 안정적
- ✅ 모든 기능 사용 가능
- ✅ 유지보수 간단
- ❌ 브랜딩 불가

### Grok

**새 탭 방식으로 변경 고려:**
```typescript
// 새 탭에서 열기
chrome.tabs.create({ 
  url: 'https://grok.com',
  active: true 
})
// ↑ 이 경우 Content Script 작동
```

## 🎨 대안: Extension 레벨 커스터마이징

iframe 내부는 커스터마이징 불가능하지만, **Extension UI는 커스터마이징 가능:**

```typescript
// ConversationPanel.tsx
<div className="custom-header">
  <img src="custom-logo.png" />
  <span>Powered by Model Dock</span>
</div>

<PersistentIframe src="https://chat.openai.com" />

<div className="custom-footer">
  <button>Custom Action</button>
</div>
```

**가능한 것:**
- ✅ iframe 주변 UI 커스터마이징
- ✅ 헤더/푸터 추가
- ✅ 버튼/컨트롤 추가
- ✅ 배율 조절 UI
- ❌ iframe 내부 변경 불가

## 🚀 다음 단계

1. **빌드 및 테스트**
   ```bash
   npm run build
   ```

2. **ChatGPT iframe 확인**
   - 하얀 화면 → 정상 로딩으로 변경되어야 함

3. **Grok 구현 확인**
   - iframe인지 새 탭인지 확인
   - 커스터마이징 작동 여부 확인

4. **커스터마이징 포기 결정**
   - iframe 방식은 원본 UI 사용이 최선
   - Extension UI만 커스터마이징
