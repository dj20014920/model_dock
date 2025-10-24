# 🔧 Troubleshooting Guide

## ❌ ChatGPT: "로그인 세션이 없습니다" 에러

### 증상
```
[PROXY-FETCH] ⚠️ Script injection failed
Could not load file: 'assets/chatgpt-inpage-proxy.ts-loader-xxxxx.js'
[PROXY-FETCH] 💔 Port disconnected prematurely after 1ms
```

### 원인
Chrome이 이전 빌드의 manifest.json을 캐시하여, 존재하지 않는 파일을 찾으려 시도

### ✅ 해결 방법

#### **방법 1: 확장 프로그램 완전 재설치 (권장)**
```bash
# 1. Chrome에서 확장 프로그램 완전 제거
chrome://extensions → 제거 버튼 클릭

# 2. Chrome 재시작 (중요!)

# 3. 프로젝트 재빌드
cd /Users/dj20014920/Desktop/model-dock
yarn build

# 4. Chrome에서 다시 로드
chrome://extensions → 개발자 모드 → "압축해제된 확장 프로그램을 로드합니다"
→ dist/ 폴더 선택
```

#### **방법 2: 하드 리로드**
```bash
# 1. Chrome 확장 프로그램 페이지
chrome://extensions

# 2. 해당 확장의 "새로고침" 버튼 클릭

# 3. ChatGPT 탭 완전히 닫기 (모든 탭)

# 4. Chrome 재시작

# 5. 다시 시도
```

#### **방법 3: 빌드 캐시 클리어**
```bash
# 프로젝트 루트에서
rm -rf dist/
rm -rf node_modules/.vite/
yarn build
```

### ✅ 정상 작동 확인
성공 시 다음 로그가 표시됩니다:
```
[PROXY-FETCH] ✅ Port connected successfully
[PROXY-FETCH] 📊 Metadata received
[GPT-WEB] ✅ Access token received
```

---

## ❌ Grok Webapp: 403 Forbidden

### 증상
```
403 Forbidden
🔐 Grok 인증 필요
```

### 원인
Grok.com은 x-challenge, x-signature 같은 동적 헤더를 요구하여 자동화 방지

### ✅ 해결 방법 1: Grok.com에서 한 번 대화하기 (권장)

**Model Dock가 자동으로 헤더를 캡처합니다:**

```
1. 새 탭에서 https://grok.com 방문
2. 로그인
3. 아무 메시지나 1번 보내기 (예: "안녕")
4. 다시 Model Dock에서 Grok 사용 시도
```

**작동 원리:**
- Model Dock의 fetch 인터셉터가 실제 Grok.com 요청의 헤더를 자동 캡처
- x-challenge, x-signature, x-statsig-id 등 필수 헤더를 추출
- 이후 요청에서 자동으로 사용

**장점:**
- ✅ UI에 직접 렌더링 (ChatGPT, Claude처럼)
- ✅ 무료
- ✅ 설정 불필요
- ✅ 한 번만 하면 됨

### ✅ 해결 방법 2: API 모드 사용

```
1. console.x.ai에서 API 키 발급 (월 $25 무료 크레딧)
2. 설정 → Grok → API 모드로 전환
3. API 키 입력
4. 정상 작동 ✅
```

**장점:**
- ✅ 법적으로 안전
- ✅ 안정적
- ✅ 빠름

---

## 🆘 추가 도움이 필요하신가요?

GitHub Issues: https://github.com/[your-repo]/issues
