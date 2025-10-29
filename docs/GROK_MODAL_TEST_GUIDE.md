# Grok 모달 테스트 가이드

## 문제 진단

현재 Grok 안내 모달이 표시되지 않는 이유는 **이미 한 번 표시되어 저장소에 기록되었기 때문**입니다.

## 모달 구조 확인

### 1. Dialog 컴포넌트 (기본 제공)
```typescript
// src/app/components/Dialog.tsx
- ✅ X 버튼: 우측 상단에 closeIcon 이미지로 구현됨
- ✅ 배경 클릭: HeadlessDialog의 onClose로 자동 처리
- ✅ ESC 키: HeadlessDialog 기본 기능
```

### 2. GrokNoticeModal 컴포넌트
```typescript
// src/app/components/Modals/GrokNoticeModal.tsx
- ✅ 확인 버튼: 하단에 Button 컴포넌트로 구현됨
- ✅ 다국어 지원: i18n으로 "Grok security notice" 및 "OK" 번역
```

### 3. 렌더링 위치
```typescript
// MultiBotChatPanel.tsx (라인 222)
<GrokNoticeModal open={grokNoticeOpen} onClose={() => setGrokNoticeOpen(false)} />

// SidePanelPage.tsx (라인 182)
<GrokNoticeModal open={grokNoticeOpen} onClose={() => setGrokNoticeOpen(false)} />
```

## 모달이 표시되지 않는 이유

### 저장소 확인
```typescript
// 첫 사용 시 체크
const grokNoticeShown = await Browser.storage.local.get('grokNoticeShown')
if (!grokNoticeShown.grokNoticeShown) {
  setGrokNoticeOpen(true) // ← 모달 표시
  await Browser.storage.local.set({ grokNoticeShown: true }) // ← 저장
}
```

**이미 한 번 표시되었다면 `grokNoticeShown: true`가 저장되어 있어 다시 표시되지 않습니다.**

## 테스트 방법

### 방법 1: 브라우저 개발자 도구 사용 (권장)

1. Chrome 확장 프로그램 페이지 열기
   ```
   chrome://extensions/
   ```

2. 확장 프로그램의 "서비스 워커" 또는 "백그라운드 페이지" 클릭

3. Console 탭에서 실행:
   ```javascript
   // 저장소 초기화
   chrome.storage.local.remove('grokNoticeShown', () => {
     console.log('Grok notice reset - 모달이 다시 표시됩니다')
   })
   ```

4. 페이지 새로고침 후 Grok을 포함한 봇으로 메시지 전송

### 방법 2: 코드에 디버그 로그 추가

```typescript
// MultiBotChatPanel.tsx의 sendAllMessage 함수에 추가
const hasGrok = botIds.includes('grok')
console.log('🔍 Grok 체크:', { hasGrok, botIds })

if (hasGrok) {
  const grokNoticeShown = await Browser.storage.local.get('grokNoticeShown')
  console.log('📦 저장소 상태:', grokNoticeShown)
  
  if (!grokNoticeShown.grokNoticeShown) {
    console.log('✅ 모달 표시!')
    setGrokNoticeOpen(true)
    await Browser.storage.local.set({ grokNoticeShown: true })
  } else {
    console.log('⏭️ 이미 표시됨 - 건너뜀')
  }
}
```

### 방법 3: 임시로 강제 표시 (테스트용)

```typescript
// 테스트를 위해 임시로 조건 제거
const hasGrok = botIds.includes('grok')
if (hasGrok) {
  // 조건 없이 항상 표시
  setGrokNoticeOpen(true)
}
```

## 모달 UI 확인 사항

### X 버튼 (우측 상단)
```typescript
// Dialog.tsx 라인 51
<img 
  src={closeIcon} 
  className="w-4 h-4 ml-auto mr-[10px] cursor-pointer" 
  onClick={props.onClose} 
/>
```
- ✅ 클릭 이벤트: `onClick={props.onClose}`
- ✅ 커서 스타일: `cursor-pointer`
- ✅ 아이콘: `~/assets/icons/close.svg`

### 확인 버튼 (하단 중앙)
```typescript
// GrokNoticeModal.tsx 라인 19
<Button 
  text={t('OK')} 
  color="primary" 
  onClick={onClose} 
/>
```
- ✅ 클릭 이벤트: `onClick={onClose}`
- ✅ 프라이머리 색상: `color="primary"`
- ✅ 다국어: `t('OK')`

### 배경 클릭
```typescript
// Dialog.tsx 라인 17
<HeadlessDialog as="div" onClose={props.onClose}>
```
- ✅ HeadlessUI 기본 기능으로 자동 처리

## 실제 사용 시나리오

### 첫 사용자
```
1. Grok을 포함한 봇 선택
2. 메시지 입력 후 전송
3. 🎉 모달 표시됨
4. X 버튼 / 확인 버튼 / 배경 클릭으로 닫기
5. 저장소에 기록됨
```

### 재방문 사용자
```
1. Grok을 포함한 봇 선택
2. 메시지 입력 후 전송
3. ⏭️ 모달 표시 안 됨 (이미 본 적 있음)
4. 바로 메시지 전송 진행
```

## 문제 해결

### 모달이 전혀 표시되지 않는 경우

1. **저장소 확인**
   ```javascript
   chrome.storage.local.get('grokNoticeShown', (result) => {
     console.log(result)
   })
   ```

2. **Grok 봇 포함 여부 확인**
   - 선택한 봇 목록에 'grok'이 있는지 확인
   - `botIds.includes('grok')` 결과 확인

3. **모달 상태 확인**
   - React DevTools로 `grokNoticeOpen` 상태 확인
   - `true`로 설정되는지 확인

### X 버튼이 보이지 않는 경우

1. **아이콘 파일 확인**
   ```bash
   ls -la src/assets/icons/close.svg
   ```

2. **CSS 확인**
   - `cursor-pointer` 클래스 적용 확인
   - `w-4 h-4` 크기 확인

3. **브라우저 개발자 도구**
   - Elements 탭에서 img 태그 확인
   - 이미지 로드 실패 여부 확인

### 확인 버튼이 작동하지 않는 경우

1. **Button 컴포넌트 확인**
   ```typescript
   // src/app/components/Button.tsx 확인
   ```

2. **onClick 이벤트 확인**
   - 콘솔에 로그 추가
   - 이벤트 전파 확인

## 강제 재표시 방법

### 개발 중 테스트
```typescript
// 개발 환경에서만 사용
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    // 매번 초기화
    Browser.storage.local.remove('grokNoticeShown')
  }
}, [])
```

### 설정 페이지에 리셋 버튼 추가 (선택사항)
```typescript
// SettingPage.tsx에 추가
<Button 
  text="Grok 안내 다시 보기"
  onClick={async () => {
    await Browser.storage.local.remove('grokNoticeShown')
    toast.success('Grok 안내가 초기화되었습니다')
  }}
/>
```

## 빌드 확인

```bash
npm run build
```

- ✅ 빌드 성공: 9.64초
- ✅ GrokNoticeModal 번들 포함
- ✅ 다국어 파일 정상

## 결론

**모달은 정상적으로 구현되어 있습니다.**

- ✅ X 버튼 (Dialog 컴포넌트 내장)
- ✅ 확인 버튼 (GrokNoticeModal)
- ✅ 배경 클릭 (HeadlessUI 기본 기능)
- ✅ 1회성 표시 로직
- ✅ 전역 저장소 관리

**표시되지 않는 이유는 이미 한 번 표시되어 저장소에 기록되었기 때문입니다.**

테스트를 위해서는 위의 "테스트 방법"을 참고하여 저장소를 초기화하세요.
