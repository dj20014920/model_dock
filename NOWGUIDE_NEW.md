# NOWGUIDE - Model Dock

**업데이트**: 2025년 10월 20일 | **버전**: 1.45.17

---

## 📋 최신 릴리스 (v1.45.17)

### ✅ ChatGPT 403 해결 - Sentinel 브라우저 지문 개선

**문제**: 403 Forbidden 오류 지속  
**원인**: Service Worker 환경에서 `window` 객체 없음 → 브라우저 지문 기본값 사용 → 봇으로 판단  
**해결**: `navigator` API 직접 사용 (CPU, UA, 언어 정보)

**변경 파일**: `src/app/bots/chatgpt-webapp/client.ts`

```typescript
private generateBrowserProof(): string {
  const hardwareConcurrency = navigator.hardwareConcurrency || 8
  const userAgent = navigator.userAgent || 'Mozilla/5.0...'
  const language = navigator.language || 'en-US'
  const languagesStr = navigator.languages?.join(',') || 'en-US,en'
  
  const proofArray = [
    new Date().toUTCString(),
    String(hardwareConcurrency),
    '1920x1080',
    userAgent,
    '', '',
    language,
    languagesStr,
    10
  ]
  
  return btoa(JSON.stringify(proofArray))
}
```

**검증**:
1. Chrome 확장 재로드 (`chrome://extensions`)
2. ChatGPT 메시지 전송
3. 콘솔 로그 확인:
   - `[GPT-WEB][PROOF] Generated browser proof`
   - `[GPT-WEB][SENTINEL] ✅ POW calculated`
4. 성공 기준: 200 OK 응답, 스트리밍 정상

---

## 🚀 빠른 시작

### 빌드 & 설치
```bash
npm run build
```

Chrome → `chrome://extensions` → 개발자 모드 ON → "압축해제된 확장 프로그램" → `dist/` 선택

### 사용 방법
1. **ChatGPT Webapp**: chatgpt.com 로그인 후 사용
2. **수동 복붙 모드** (기본): 입력 → 복사 → 각 패널에 붙여넣기
3. **개별 패널**: Enter로 즉시 전송

---

## 🛠️ 아키텍처

### Background Fetch 우선 사용
- Service Worker에서 직접 API 호출
- `host_permissions`로 CORS 없이 접근
- Content Script/Proxy Tab 방식 **사용 안 함**

### 핵심 파일
```
src/
├── background/index.ts          # BG_FETCH 리스너
├── app/bots/chatgpt-webapp/
│   ├── client.ts                # 브라우저 지문 생성
│   └── requesters.ts            # Background Fetch
├── services/proxy-fetch.ts      # backgroundFetch()
└── utils/sse.ts                 # 스트리밍 파서
```

---

## 🐛 트러블슈팅

### 정상 로그 (Service Worker 콘솔)
```
[GPT-WEB] 🎯 Using background fetch
[GPT-WEB] ✅ Access token obtained
[GPT-WEB] ✅ Using model: gpt-5
```

### 절대 나오면 안 되는 로그
```
[GPT-WEB][REQ] 🔍 Looking for proxy tab
[GPT-WEB][REQ] 🌐 Creating new proxy tab
[GPT-WEB][REQ] ❌ TIMEOUT
```

### 일반 문제

**403 Forbidden**:
- chatgpt.com 로그인 확인
- Cloudflare 챌린지 통과
- 5-10분 후 재시도

**401 Unauthorized**: chatgpt.com 로그인

**429 Rate Limit**: 잠시 대기

---

## 📚 참고

- **버전**: 1.45.17 미만이면 업데이트 필요
- **HAR 분석**: `har/mygpt4.har` (성공 패턴)
- **기술 결정**: Base64 브라우저 지문 (Fernet/Turnstile 기각)

**마지막 업데이트**: 2025년 10월 20일
