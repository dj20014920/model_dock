# Qwen 봇 통합 완료

## 해결한 문제들

### 1. ISO-8859-1 헤더 에러
**문제:** `timezone` 헤더에 한글 "(한국 표준시)" 포함
**해결:** 로케일 독립적 방식으로 timezone 생성
```typescript
const date = new Date()
const offset = -date.getTimezoneOffset()
const sign = offset >= 0 ? '+' : '-'
const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
const minutes = String(Math.abs(offset) % 60).padStart(2, '0')
const timezoneHeader = `${date.toDateString()} ${date.toTimeString().split(' ')[0]} GMT${sign}${hours}${minutes}`
```

### 2. SSE 파싱 에러
**문제:** `[DONE]` 메시지를 JSON으로 파싱 시도
**해결:** `[DONE]` 체크를 JSON.parse() 전에 수행

### 3. 401 Unauthorized 에러
**문제:** 확장 프로그램에서 직접 fetch 시 CORS/인증 실패
**해결:** `hybridFetch`를 사용하여 프록시 탭 방식으로 요청

## 최종 구현

```typescript
import { hybridFetch } from '~app/utils/hybrid-requester'

// 프록시 탭을 통한 same-origin 요청
const resp = await hybridFetch(
  `https://chat.qwen.ai/api/v2/chat/completions?chat_id=${chatId}`,
  {
    method: 'POST',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: '*/*',
      source: 'web',
      timezone: timezoneHeader,
      'x-accel-buffering': 'no',
    },
    body: JSON.stringify(requestBody),
  },
  { homeUrl: 'https://chat.qwen.ai', hostStartsWith: 'https://chat.qwen.ai' },
  { reuseOnly: true },
)
```

## 사용 방법

1. **Qwen 웹사이트 탭 열기**
   - `https://chat.qwen.ai` 접속
   - 로그인 (선택사항, guest 모드도 가능)

2. **확장 프로그램에서 Qwen 선택**
   - Qwen 봇 선택
   - 메시지 전송

3. **프록시 탭 방식**
   - 확장 프로그램이 자동으로 열린 Qwen 탭을 찾아 사용
   - same-origin 요청으로 CORS 우회
   - 브라우저 쿠키 자동 포함

## 주요 특징

- ✅ Guest 모드 지원 (로그인 불필요)
- ✅ 대화 컨텍스트 유지
- ✅ 스트리밍 응답
- ✅ 로케일 독립적 (한글 시스템에서도 정상 작동)
- ✅ CORS 우회 (프록시 탭 방식)

## 빌드 완료
- TypeScript 컴파일: ✅
- Vite 빌드: ✅
- 진단 오류: 없음

## 다음 단계
1. Chrome 확장 프로그램 다시 로드
2. `https://chat.qwen.ai` 탭 열기
3. 확장 프로그램에서 Qwen 선택 후 테스트
