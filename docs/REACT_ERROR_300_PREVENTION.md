# React 에러 #300 완벽 방지 가이드

## 문제 개요

React 에러 #300: "Objects are not valid as a React child"는 React가 렌더링할 수 없는 값을 렌더링하려고 할 때 발생합니다.

## 발생 원인

### 1. **Hooks Rules 위반** ⚠️ 가장 흔한 원인
```typescript
// ❌ 잘못된 예: 조건부 return 이후 hooks 선언
const Component = (props) => {
  const [state1, setState1] = useState(0)
  
  if (props.condition) {
    return <div>Early return</div>
  }
  
  const [state2, setState2] = useState(0) // ❌ 에러!
  // ...
}

// ✅ 올바른 예: 모든 hooks를 최상단에 선언
const Component = (props) => {
  const [state1, setState1] = useState(0)
  const [state2, setState2] = useState(0) // ✅ 조건문 이전에 선언
  
  if (props.condition) {
    return <div>Early return</div>
  }
  // ...
}
```

### 2. **객체를 직접 렌더링**
```typescript
// ❌ 잘못된 예
const user = { name: 'John', age: 30 }
return <div>{user}</div> // ❌ 에러!

// ✅ 올바른 예
return <div>{user.name}</div> // ✅ 문자열 렌더링
return <div>{JSON.stringify(user)}</div> // ✅ JSON 문자열로 변환
```

### 3. **Promise를 렌더링**
```typescript
// ❌ 잘못된 예
const data = fetchData() // Promise 반환
return <div>{data}</div> // ❌ 에러!

// ✅ 올바른 예
const [data, setData] = useState(null)
useEffect(() => {
  fetchData().then(setData)
}, [])
return <div>{data}</div> // ✅ 해결된 값 렌더링
```

### 4. **undefined를 반환하는 컴포넌트**
```typescript
// ❌ 잘못된 예
const Component = () => {
  // return 문 없음
} // ❌ undefined 반환

// ✅ 올바른 예
const Component = () => {
  return <div>Content</div> // ✅ JSX 반환
}
```

### 5. **배열이 아닌 것을 map으로 처리**
```typescript
// ❌ 잘못된 예
const items = undefined
return <div>{items.map(item => <div>{item}</div>)}</div> // ❌ 에러!

// ✅ 올바른 예
const items = data?.items || []
return <div>{items.map(item => <div key={item.id}>{item}</div>)}</div>
```

## 구현된 방어 조치

### 1. **ErrorBoundary 컴포넌트**
위치: `src/app/components/ErrorBoundary.tsx`

모든 React 에러를 catch하여 앱 전체가 크래시되는 것을 방지합니다.

```typescript
import ErrorBoundary from '~app/components/ErrorBoundary'

<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### 2. **React Safety 유틸리티**
위치: `src/app/utils/react-safety.ts`

렌더링 전 값의 안전성을 검증하는 유틸리티 함수들:

```typescript
import { isSafeToRender, makeSafeForRender } from '~app/utils/react-safety'

// 렌더링 전 검증
if (!isSafeToRender(value)) {
  value = makeSafeForRender(value)
}
```

### 3. **ConversationPanel 안전장치**
- botInfo 유효성 검증
- 모든 hooks를 조건부 return 이전에 배치
- props 검증

### 4. **LMArenaModelSelector 안전장치**
- bot 인스턴스 타입 검증
- 잘못된 타입일 경우 null 반환

### 5. **SidePanelPage 안전장치**
- chat 객체 유효성 검증
- messages 배열 기본값 제공
- generating 불리언 기본값 제공

## 체크리스트

새로운 컴포넌트를 작성할 때 다음을 확인하세요:

- [ ] 모든 hooks가 조건문/반복문 이전에 선언되었는가?
- [ ] 조건부 return이 있다면, 그 이전에 모든 hooks가 호출되는가?
- [ ] 객체를 직접 렌더링하지 않는가?
- [ ] Promise를 렌더링하지 않는가?
- [ ] 컴포넌트가 항상 JSX 또는 null을 반환하는가?
- [ ] 배열을 map하기 전에 null/undefined 체크를 하는가?
- [ ] props가 undefined일 가능성을 고려했는가?

## 디버깅 팁

### 에러 발생 시 확인 사항

1. **브라우저 콘솔 확인**
   - React 에러 메시지
   - 컴포넌트 스택 트레이스

2. **Hooks 호출 순서 확인**
   ```typescript
   // 개발 모드에서 hooks 추적
   console.log('Hook 1 called')
   const [state1] = useState()
   
   console.log('Hook 2 called')
   const [state2] = useState()
   ```

3. **렌더링 값 검증**
   ```typescript
   console.log('Rendering value:', typeof value, value)
   ```

4. **ErrorBoundary 로그 확인**
   - ErrorBoundary가 catch한 에러 정보
   - 컴포넌트 스택

## 추가 리소스

- [React Hooks Rules](https://react.dev/reference/rules/rules-of-hooks)
- [React Error Decoder](https://reactjs.org/docs/error-decoder.html?invariant=300)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)

## 업데이트 이력

- 2025-01-XX: 초기 문서 작성
- ConversationPanel hooks 순서 수정
- ErrorBoundary 컴포넌트 추가
- React Safety 유틸리티 추가
- 모든 주요 컴포넌트에 안전장치 적용
