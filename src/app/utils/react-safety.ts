/**
 * React 렌더링 안전성 유틸리티
 * React 에러 #300 및 기타 렌더링 에러 방지
 */

/**
 * 값이 React에서 안전하게 렌더링 가능한지 확인
 * @returns true if safe to render, false otherwise
 */
export function isSafeToRender(value: unknown): boolean {
  // null과 undefined는 안전 (React가 처리)
  if (value === null || value === undefined) {
    return true
  }

  // 원시 타입은 안전
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return true
  }

  // React 엘리먼트는 안전
  if (isReactElement(value)) {
    return true
  }

  // 배열은 재귀적으로 확인
  if (Array.isArray(value)) {
    return value.every(isSafeToRender)
  }

  // 객체, Promise, Function 등은 위험
  console.warn('[React Safety] ⚠️ Unsafe value detected:', value)
  return false
}

/**
 * React 엘리먼트인지 확인
 */
export function isReactElement(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    (value as any).$$typeof === Symbol.for('react.element')
  )
}

/**
 * 안전하지 않은 값을 안전한 문자열로 변환
 */
export function makeSafeForRender(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return String(value)
  }

  if (isReactElement(value)) {
    return null // React 엘리먼트는 그대로 반환하지 않음
  }

  // 객체나 배열은 JSON으로 변환 (디버깅용)
  try {
    return JSON.stringify(value)
  } catch {
    return '[Unserializable Object]'
  }
}

/**
 * 컴포넌트 props 검증
 */
export function validateProps<T extends Record<string, unknown>>(
  componentName: string,
  props: T,
  requiredProps: (keyof T)[],
): boolean {
  for (const prop of requiredProps) {
    if (props[prop] === undefined) {
      console.error(`[${componentName}] ❌ Missing required prop: ${String(prop)}`)
      return false
    }
  }
  return true
}

/**
 * Hooks 호출 순서 검증 (개발 모드 전용)
 */
let hooksCallCount = 0
let componentRenderCount = 0

export function trackHookCall(hookName: string, componentName: string) {
  // 개발 모드에서만 추적 (import.meta.env 사용)
  if (import.meta.env.MODE === 'production') return

  hooksCallCount++
  console.debug(`[Hooks Tracker] ${componentName}.${hookName} - Call #${hooksCallCount}`)
}

export function resetHooksTracker() {
  // 개발 모드에서만 추적
  if (import.meta.env.MODE === 'production') return

  componentRenderCount++
  console.debug(`[Hooks Tracker] Component render #${componentRenderCount} - Resetting hooks count`)
  hooksCallCount = 0
}

/**
 * 조건부 return 이전에 모든 hooks가 호출되었는지 검증
 */
export function validateHooksBeforeReturn(
  componentName: string,
  expectedHooksCount: number,
  actualHooksCount: number,
) {
  // 개발 모드에서만 검증
  if (import.meta.env.MODE === 'production') return

  if (expectedHooksCount !== actualHooksCount) {
    console.error(
      `[${componentName}] 🚨 Hooks Rules Violation!`,
      `Expected ${expectedHooksCount} hooks, but ${actualHooksCount} were called.`,
      'This may cause React Error #300.',
    )
  }
}
