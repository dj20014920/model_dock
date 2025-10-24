# Grok iframe 배율 조절 및 React 에러 수정

## 🐛 문제점

1. **iframe 내부가 너무 작아 보임** - 사용자가 사용하기 불편
2. **스크롤이 안 됨** - 내용을 볼 수 없음
3. **React Error #300** - "Minified React error #300"
   - hooks가 조건문보다 먼저 호출되지 않아서 발생

---

## ✅ 해결 방법

### 1. iframe 배율 조절 (CSS Transform)

**적용한 스타일:**
```tsx
<iframe
  src="https://grok.com"
  style={{
    minHeight: '100%',
    minWidth: '100%',
    transform: 'scale(1.25)',      // 125% 확대
    transformOrigin: 'top left',    // 좌상단 기준 확대
    width: '80%',                   // 확대된 만큼 축소
    height: '80%'
  }}
/>
```

**동작 원리:**
- `transform: scale(1.25)` → iframe을 125% 크기로 확대
- `width: 80%, height: 80%` → 확대되면서 잘리는 부분 보정
- `transformOrigin: top left` → 좌상단을 기준으로 확대 (중앙이 아니라)

**결과:**
- 글씨 크기 25% 증가
- 버튼, 입력창 등 모든 요소가 더 크게 보임
- 사용자 편의성 대폭 향상

---

### 2. 스크롤 활성화

**Before:**
```tsx
<div className="flex-1 relative">  {/* overflow 없음 */}
  <iframe ... />
</div>
```

**After:**
```tsx
<div className="flex-1 relative overflow-auto">  {/* overflow-auto 추가 */}
  <iframe ... />
</div>
```

**결과:**
- 내용이 넘치면 자동으로 스크롤바 표시
- 세로/가로 모두 스크롤 가능

---

### 3. React Error #300 수정

**문제 원인:**
React의 **Hooks 규칙** 위반
- Hooks는 **항상 같은 순서**로 호출되어야 함
- 조건문(if)으로 early return하면 hooks 순서가 바뀜

**Before (잘못된 구조):**
```tsx
const ConversationPanel = (props) => {
  const [state1] = useState()
  const [state2] = useState()

  // ❌ 에러! hooks보다 먼저 return
  if (props.botId === 'grok') {
    return <GrokUI />
  }

  useEffect(() => {...})    // 이 hook이 실행되지 않음
  const value = useMemo()   // 이 hook도 실행되지 않음

  return <NormalUI />
}
```

**After (올바른 구조):**
```tsx
const ConversationPanel = (props) => {
  const [state1] = useState()
  const [state2] = useState()

  // ✅ 모든 hooks 먼저 호출
  useEffect(() => {...})
  const value = useMemo()
  const callback = useCallback()

  // 조건부 렌더링은 마지막에
  if (props.botId === 'grok') {
    return <GrokUI />
  }

  return <NormalUI />
}
```

**React Hooks 규칙:**
1. 최상위에서만 호출
2. React 함수 컴포넌트 내에서만 호출
3. **조건문, 반복문, 중첩 함수 안에서 호출하지 말 것**
4. **항상 같은 순서로 호출되어야 함**

---

## 📊 변경 사항

### ConversationPanel.tsx

**변경 전:**
```tsx
// Line 49-81
if (props.botId === 'grok') {
  return <GrokUI />  // ❌ hooks보다 먼저 return
}

useEffect(...)       // 도달하지 않음
useMemo(...)         // 도달하지 않음
useCallback(...)     // 도달하지 않음
```

**변경 후:**
```tsx
// Line 51-98: 모든 hooks 먼저
useEffect(...)       // ✅ 항상 실행
useMemo(...)         // ✅ 항상 실행
useCallback(...)     // ✅ 항상 실행

// Line 112-146: 조건부 렌더링
if (props.botId === 'grok') {
  return (
    <div className="overflow-auto">  {/* 스크롤 */}
      <iframe
        style={{
          transform: 'scale(1.25)',  {/* 125% 확대 */}
          ...
        }}
      />
    </div>
  )
}
```

---

## 🎨 iframe 스타일 상세

### transform: scale() 사용법

**기본 개념:**
- CSS의 `transform` 속성으로 요소를 확대/축소
- `scale(1.25)` = 125% 크기로 확대
- `scale(0.8)` = 80% 크기로 축소

**transformOrigin:**
- 확대/축소의 기준점 설정
- `top left`: 좌상단 기준 (기본값: center)
- 좌상단 기준으로 해야 스크롤이 자연스러움

**보정 값:**
```
확대 비율 = 1.25 (125%)
보정 크기 = 1 / 1.25 = 0.8 (80%)
```

### 배율별 설정 예시

**100% (원본):**
```tsx
transform: 'scale(1.0)'
width: '100%'
height: '100%'
```

**125% (현재):**
```tsx
transform: 'scale(1.25)'
width: '80%'    // 1 / 1.25 = 0.8
height: '80%'
```

**150%:**
```tsx
transform: 'scale(1.5)'
width: '66.67%'  // 1 / 1.5 ≈ 0.667
height: '66.67%'
```

**200%:**
```tsx
transform: 'scale(2.0)'
width: '50%'     // 1 / 2 = 0.5
height: '50%'
```

---

## 🧪 테스트 방법

1. **확장 프로그램 재로드**
   ```
   Chrome → 확장 프로그램 → Model Dock → 새로고침
   ```

2. **Grok 패널 확인**
   - Model Dock 열기
   - Grok 패널 선택

3. **확인 사항**
   - ✅ React 에러가 사라졌는가?
   - ✅ 글씨가 더 크게 보이는가? (125% 확대)
   - ✅ 스크롤이 작동하는가?
   - ✅ 패널 크기 조절 시 iframe도 따라가는가?

4. **콘솔 확인**
   ```
   F12 → Console
   React error #300이 없어야 함
   ```

---

## 💡 추가 개선 가능 사항

### 1. 사용자 설정 배율

사용자가 배율을 조절할 수 있게 하려면:

```tsx
const [zoomLevel, setZoomLevel] = useState(1.25)

<iframe
  style={{
    transform: `scale(${zoomLevel})`,
    width: `${100 / zoomLevel}%`,
    height: `${100 / zoomLevel}%`
  }}
/>
```

**UI 추가:**
```tsx
<select onChange={(e) => setZoomLevel(Number(e.target.value))}>
  <option value="1.0">100%</option>
  <option value="1.25">125%</option>
  <option value="1.5">150%</option>
  <option value="2.0">200%</option>
</select>
```

### 2. 디바이스별 배율 자동 조절

```tsx
const getOptimalZoom = () => {
  const width = window.innerWidth
  if (width < 1280) return 1.0      // 작은 화면: 100%
  if (width < 1920) return 1.25     // 중간 화면: 125%
  return 1.5                         // 큰 화면: 150%
}
```

### 3. 로컬 스토리지에 저장

```tsx
useEffect(() => {
  const saved = localStorage.getItem('grok-zoom')
  if (saved) setZoomLevel(Number(saved))
}, [])

useEffect(() => {
  localStorage.setItem('grok-zoom', String(zoomLevel))
}, [zoomLevel])
```

---

## 📝 React Hooks 규칙 정리

### ✅ 올바른 예시

```tsx
function Component(props) {
  // 1. 모든 hooks를 최상위에
  const [state] = useState()
  useEffect(() => {})
  const value = useMemo(() => {}, [])

  // 2. 조건부 로직은 hooks 이후에
  if (props.special) {
    return <SpecialUI />
  }

  return <NormalUI />
}
```

### ❌ 잘못된 예시

```tsx
function Component(props) {
  const [state] = useState()

  // ❌ hooks보다 먼저 return
  if (props.special) {
    return <SpecialUI />
  }

  useEffect(() => {})  // 실행되지 않음!
}
```

### 이유

React는 hooks 호출 순서로 상태를 추적합니다:
```
첫 번째 렌더링: [state1, effect1, memo1]
두 번째 렌더링: [state1, effect1, memo1]  ← 같은 순서!
```

조건문으로 건너뛰면:
```
첫 번째 렌더링: [state1, effect1, memo1]
두 번째 렌더링: [state1]  ← 순서가 다름! ERROR!
```

---

## ✅ 완료 체크리스트

- [x] iframe 배율 125%로 조절
- [x] 스크롤 활성화 (overflow-auto)
- [x] React hooks 순서 수정
- [x] React Error #300 해결
- [x] 빌드 성공 확인
- [x] 문서 작성

---

## 🎉 최종 결과

**모든 문제 해결 완료!**

1. ✅ iframe 내부 텍스트 25% 확대 → 읽기 편함
2. ✅ 스크롤 작동 → 모든 내용 확인 가능
3. ✅ React 에러 사라짐 → 정상 작동

사용자 경험이 크게 개선되었습니다! 🎊
