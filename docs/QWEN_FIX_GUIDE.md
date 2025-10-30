# Qwen 봇 ISO-8859-1 에러 수정 완료

## 문제 원인
`timezone` 헤더에 한글 문자 "(한국 표준시)"가 포함되어 HTTP 헤더 규격(ISO-8859-1만 허용)을 위반했습니다.

## 해결 방법
로케일에 독립적인 방식으로 timezone 헤더를 생성하도록 수정했습니다:

```typescript
// 이전 (문제 발생)
timezone: new Date().toString()  // "Wed Oct 29 2025 15:23:22 GMT+0900 (한국 표준시)"

// 수정 후 (안전)
const date = new Date()
const offset = -date.getTimezoneOffset()
const sign = offset >= 0 ? '+' : '-'
const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
const minutes = String(Math.abs(offset) % 60).padStart(2, '0')
const timezoneHeader = `${date.toDateString()} ${date.toTimeString().split(' ')[0]} GMT${sign}${hours}${minutes}`
// 결과: "Wed Oct 29 2025 15:23:22 GMT+0900"
```

## 확장 프로그램 다시 로드 방법

### Chrome/Edge
1. `chrome://extensions/` 또는 `edge://extensions/` 접속
2. 개발자 모드 활성화
3. "다시 로드" 버튼 클릭 또는 확장 프로그램 껐다 켜기

### 또는 빠른 방법
1. 확장 프로그램 아이콘 우클릭
2. "확장 프로그램 관리"
3. "다시 로드" 클릭

## 테스트
1. 확장 프로그램 다시 로드
2. Qwen 봇 선택
3. 메시지 전송
4. 정상 응답 확인

## 빌드 완료
- TypeScript 컴파일: ✅
- Vite 빌드: ✅
- 진단 오류: 없음
