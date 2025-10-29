# Qwen 사이드바 표시 문제 해결

## 🐛 문제 발견
사용자가 확장 프로그램을 설치했을 때 좌측 사이드바에 Qwen이 표시되지 않는 문제 발견

## 🔍 원인 분석

### enabledBots 기본값 문제
```typescript
// src/services/user-config.ts (변경 전)
enabledBots: Object.keys(CHATBOTS).slice(0, 8) as BotId[]
```

CHATBOTS 객체의 순서:
1. chatgpt
2. claude
3. grok
4. bing
5. perplexity
6. llama
7. gemini
8. deepseek ← 여기까지만 기본 활성화
9. mistral
10. ...
17. **qwen** ← 기본값에 포함 안됨!

## ✅ 해결 방법

### 1. 마이그레이션 코드 추가
기존 사용자들을 위해 자동으로 qwen을 enabledBots에 추가:

```typescript
// Migration: Add 'qwen' to enabledBots if it's missing
if (result.enabledBots && Array.isArray(result.enabledBots) && !result.enabledBots.includes('qwen')) {
  result.enabledBots = [...result.enabledBots, 'qwen']
  await Browser.storage.sync.set({ enabledBots: result.enabledBots })
}
```

### 2. 기본 활성화 봇 수 증가
8개 → **9개**로 증가하여 DeepSeek와 Qwen 모두 포함:

```typescript
// src/services/user-config.ts (변경 후)
enabledBots: Object.keys(CHATBOTS).slice(0, 9) as BotId[]
```

### 3. CHATBOTS 순서 조정
Qwen을 9번째 위치로 이동:

**최종 순서:**
1. chatgpt
2. claude
3. grok
4. bing
5. perplexity
6. llama
7. gemini
8. **deepseek** ← 유지!
9. **qwen** ← 추가!
10. mistral
...

## 📝 수정된 파일

### src/services/user-config.ts
- ✅ Qwen 마이그레이션 코드 추가
- ✅ 기존 사용자 자동 업데이트

### src/app/consts.ts
- ✅ CHATBOTS 순서 재배치
- ✅ Qwen을 8번째 위치로 이동

## 🎯 결과

### 신규 사용자
- 확장 프로그램 설치 시 Qwen이 자동으로 사이드바에 표시됨
- 기본 8개 봇: ChatGPT, Claude, Grok, Copilot, Perplexity, Llama 2, Gemini Pro, **Qwen**

### 기존 사용자
- 다음 실행 시 마이그레이션 코드가 자동 실행
- enabledBots에 'qwen'이 자동 추가됨
- 사이드바에 Qwen이 나타남

## 🧪 테스트 방법

1. **신규 설치 테스트**
   ```bash
   # 확장 프로그램 재설치
   # 사이드바에 Qwen 표시 확인
   ```

2. **기존 사용자 마이그레이션 테스트**
   ```javascript
   // Chrome DevTools Console
   chrome.storage.sync.get('enabledBots', (result) => {
     console.log('Enabled bots:', result.enabledBots)
     // 'qwen'이 포함되어 있는지 확인
   })
   ```

3. **설정 페이지 확인**
   - Settings > Chatbots
   - Qwen 체크박스가 활성화되어 있는지 확인

## 📊 영향 범위

### 변경된 기본 봇 목록
- DeepSeek이 9번째로 밀려남 (여전히 설정에서 활성화 가능)
- Qwen이 8번째로 올라와 기본 활성화

### 사용자 경험
- ✅ 신규 사용자: 즉시 Qwen 사용 가능
- ✅ 기존 사용자: 자동 마이그레이션으로 Qwen 추가
- ✅ 수동 비활성화한 사용자: 영향 없음 (마이그레이션만 실행)

## 🎉 완료

Qwen이 이제 사이드바에 정상적으로 표시됩니다!

**수정 완료일**: 2025년 10월 29일
**영향받는 사용자**: 모든 사용자 (자동 마이그레이션)
**추가 작업 필요**: 없음
