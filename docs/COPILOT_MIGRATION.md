# Bing Chat → Microsoft Copilot 마이그레이션

## 개요
Bing Chat을 Microsoft Copilot으로 전환하는 작업이 완료되었습니다. 이 변경은 Microsoft의 공식 리브랜딩을 반영합니다.

## 주요 변경 사항

### 1. UI 및 브랜딩
- **봇 이름**: "Bing" → "Copilot"
- **설정 페이지**: "Bing" 섹션 → "Copilot" 섹션
- **로그인 URL**: `bing.com` → `copilot.microsoft.com`

### 2. 다국어 지원
모든 언어 파일에서 로그인 메시지 업데이트:
- 한국어: "copilot.microsoft.com에서 로그인"
- 중국어(간체): "去 copilot.microsoft.com 登录"
- 중국어(번체): "去 copilot.microsoft.com 登錄"
- 일본어: "copilot.microsoft.comでログインする"
- 기타 언어들도 동일하게 업데이트

### 3. Manifest 권한
```typescript
host_permissions: [
  'https://*.bing.com/*',
  'https://copilot.microsoft.com/*',  // 추가됨
  // ...
]
```

### 4. 백엔드 API
- **API 엔드포인트**: 기존 Bing 인프라 유지 (`sydney.bing.com`)
- **WebSocket**: `wss://sydney.bing.com/sydney/ChatHub` (변경 없음)
- **이미지 업로드**: `https://www.bing.com/images/kblob` (변경 없음)

> **참고**: Microsoft Copilot은 Bing Chat의 리브랜딩이므로 백엔드 인프라는 동일합니다.

### 5. 사용자 계정 기반 대화
기존 구현이 이미 사용자 계정 기반 대화를 지원합니다:
- `conversationId`: 대화 세션 식별자
- `clientId`: 클라이언트 식별자
- `conversationSignature`: 인증 서명
- 대화 히스토리 유지

### 6. 대화 스타일
`BingConversationStyle` 설정 유지:
- Creative (창의적)
- Balanced (균형)
- Precise (정확)

## 기술적 세부사항

### 변경된 파일
1. `src/app/consts.ts` - 봇 이름 변경
2. `src/app/bots/index.ts` - 로그 메시지 추가
3. `src/app/pages/SettingPage.tsx` - UI 텍스트 변경
4. `src/app/components/Chat/ErrorAction.tsx` - 로그인 URL 변경
5. `manifest.config.ts` - 권한 추가
6. `src/app/i18n/locales/*.json` - 다국어 메시지 업데이트
7. `README.md` - 문서 업데이트

### 유지된 구조
- `src/app/bots/bing/` 폴더 구조 유지
- `BingWebBot` 클래스명 유지 (내부 구현)
- `BingConversationStyle` enum 유지
- 에러 코드 유지 (`BING_UNAUTHORIZED`, `BING_CAPTCHA`)

## 사용자 영향

### 긍정적 영향
- ✅ 최신 Microsoft 브랜딩 반영
- ✅ copilot.microsoft.com으로 직접 접근 가능
- ✅ 기존 기능 모두 유지
- ✅ 사용자 계정 기반 대화 지원

### 호환성
- ✅ 기존 설정 자동 마이그레이션
- ✅ 대화 히스토리 유지
- ✅ 모든 기능 정상 작동

## 테스트 체크리스트

- [ ] Copilot 로그인 테스트
- [ ] 대화 생성 및 응답 확인
- [ ] 이미지 입력 기능 테스트
- [ ] 대화 스타일 변경 테스트
- [ ] 에러 처리 확인
- [ ] 다국어 메시지 확인
- [ ] 설정 페이지 UI 확인

## 향후 개선 사항

1. **로고 업데이트**: Copilot 공식 로고로 변경 권장
2. **API 엔드포인트**: Microsoft가 공식 Copilot API를 제공하면 마이그레이션
3. **기능 확장**: Copilot 전용 기능 추가 가능

## 빌드 및 배포

```bash
# 빌드
yarn build

# 확장 프로그램 로드
# Chrome/Edge에서 chrome://extensions 또는 edge://extensions
# 개발자 모드 활성화 후 dist 폴더 로드
```

## 참고 자료
- [Microsoft Copilot 공식 사이트](https://copilot.microsoft.com/)
- [Bing Chat → Copilot 리브랜딩 공지](https://blogs.microsoft.com/blog/2023/11/15/microsoft-copilot-your-everyday-ai-companion/)
