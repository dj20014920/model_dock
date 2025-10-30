# Qwen iframe 구현 완료

## 구현 내용

### 1. Declarative Net Request 규칙
**파일:** `src/rules/qwen-iframe.json`
- X-Frame-Options 헤더 제거
- Content-Security-Policy 헤더 제거
- X-Content-Type-Options 헤더 제거

### 2. manifest.config.ts 업데이트
```typescript
{
  id: 'ruleset_qwen_iframe',
  enabled: true,
  path: 'src/rules/qwen-iframe.json',
}
```

### 3. QwenWebBot 간소화
**파일:** `src/app/bots/qwen-web/index.ts`
- iframe 내에서 직접 동작
- API 호출 제거
- 안내 메시지만 표시

### 4. ConversationPanel iframe 추가
**파일:** `src/app/components/Chat/ConversationPanel.tsx`
- Grok, LMArena와 동일한 방식
- `https://chat.qwen.ai` iframe 내장
- 전체 화면 표시

## 구현 코드

### ConversationPanel.tsx
```typescript
// Qwen 전용 렌더링
if (props.botId === 'qwen') {
  return (
    <ConversationContext.Provider value={context}>
      <div className={cx('flex flex-col overflow-hidden bg-primary-background h-full rounded-2xl', isMainBrain && 'ring-2 ring-amber-400')}>
        <div className={cx('border-b border-solid border-primary-border flex flex-row items-center justify-between gap-2 py-[10px]', marginClass)}>
          <div className="flex flex-row items-center gap-2">
            <motion.img src={botInfo.avatar} className="w-[18px] h-[18px] object-contain rounded-sm" whileHover={{ rotate: 180 }} />
            <ChatbotName botId={props.botId} name={botInfo.name} fullName={props.bot.name} />
          </div>
          <div className="flex flex-row items-center gap-2">
            <MainBrainToggle botId={props.botId} />
            <Tooltip content={t('Clear conversation')}>
              <img src={clearIcon} className="w-5 h-5 cursor-pointer" onClick={resetConversation} />
            </Tooltip>
          </div>
        </div>

        {/* Qwen iframe 내장 */}
        <div className="flex-1 relative overflow-auto">
          <iframe
            src="https://chat.qwen.ai"
            className="w-full h-full border-0"
            style={{ minHeight: '100%', minWidth: '100%' }}
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

## 사용 방법

1. **확장 프로그램 다시 로드**
   ```
   chrome://extensions/
   "다시 로드" 버튼 클릭
   ```

2. **Qwen 봇 선택**
   - 확장 프로그램에서 Qwen 선택

3. **iframe에서 직접 사용**
   - 내장된 Qwen 화면에서 직접 채팅
   - 로그인 필요 시 iframe 내에서 로그인
   - 모든 Qwen 기능 사용 가능

## 다른 봇들과의 비교

| 봇 | 방식 | 구현 |
|---|---|---|
| **Grok** | iframe | ✅ 동일 |
| **LMArena** | iframe | ✅ 동일 |
| **Qwen** | iframe | ✅ 완료 |
| ChatGPT | API | hybridFetch |
| Claude | API | hybridFetch |
| DeepSeek | API | hybridFetch |

## 빌드 완료
- ✅ TypeScript 컴파일 성공
- ✅ Vite 빌드 성공
- ✅ Declarative Net Request 규칙 추가
- ✅ ConversationPanel iframe 추가
- ✅ 진단 오류 없음
- ✅ 파일 크기: 1,380.47 kB (gzip: 453.64 kB)

## 결론

Qwen은 이제 Grok, LMArena와 동일하게 iframe 방식으로 작동합니다.
- 완전한 Qwen 기능 사용 가능
- 로그인/로그아웃 지원
- 파일 업로드, 이미지 생성 등 모든 기능 지원
- 안정적이고 유지보수 용이

확장 프로그램을 다시 로드하면 즉시 사용 가능합니다!
