# ChatGPT 브라우저 테스트 가이드

## 1단계: 브라우저에서 ChatGPT 직접 테스트

### A. 새 시크릿 창 열기
```
Cmd + Shift + N (Chrome)
```

### B. ChatGPT 접속
```
https://chatgpt.com
```

### C. 테스트 시나리오

1. **로그인 확인**
   - 로그인되어 있나요? ✅ / ❌
   - 계정 유형: Free / Plus / Team

2. **새 대화 시작**
   - "New chat" 버튼 클릭
   - 간단한 메시지 입력: "Hello"
   - 응답이 오나요? ✅ / ❌

3. **만약 응답이 안 온다면**
   - 어떤 에러 메시지가 보이나요?
   - 스크린샷 찍어주세요

4. **Network 탭 확인**
   - F12 → Network 탭
   - "Hello" 메시지 전송
   - `backend-api/conversation` 요청 찾기
   - 상태 코드: ___
   - Response 탭에서 에러 메시지: ___

---

## 2단계: 쿠키 확인

### Chrome DevTools
```
F12 → Application → Cookies → https://chatgpt.com
```

### 확인할 쿠키
- `__Secure-next-auth.session-token` - 있나요? ✅ / ❌
- 만료일: ___

---

## 3단계: 결과 보고

다음 정보를 알려주세요:

1. 브라우저에서 ChatGPT 정상 작동: ✅ / ❌
2. 에러 메시지 (있다면): ___
3. Network 응답 상태 코드: ___
4. 세션 쿠키 존재 여부: ✅ / ❌

---

## 예상 시나리오

### 시나리오 A: 브라우저에서도 403 에러
→ **ChatGPT 계정/IP 문제**
- 해결: 24시간 대기 또는 VPN 사용

### 시나리오 B: 브라우저에서는 정상
→ **확장 프로그램 헤더/쿠키 문제**
- 해결: 코드 수정 필요

### 시나리오 C: 쿠키가 없음
→ **로그인 문제**
- 해결: 재로그인 필요
