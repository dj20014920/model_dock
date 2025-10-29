import { BotId } from '~app/bots'
import Browser from 'webextension-polyfill'

type FocusFn = () => void
type SetValueFn = (value: string) => void
type SubmitFn = () => void

interface BotInputHandlers {
  focus: FocusFn
  setValue?: SetValueFn
  submit?: SubmitFn
}

// Registered input handlers per bot
const registry = new Map<BotId, BotInputHandlers>()

// Current dispatch sequence and index (for manual mode)
let currentOrder: BotId[] = []
let currentIndex = -1

/**
 * 봇 입력 핸들러 등록
 * @param botId 봇 ID
 * @param focus 포커스 함수
 * @param setValue 값 설정 함수 (auto routing용)
 * @param submit 전송 함수 (auto routing용)
 */
export function registerInput(
  botId: BotId,
  focus: FocusFn,
  setValue?: SetValueFn,
  submit?: SubmitFn,
) {
  registry.set(botId, { focus, setValue, submit })
}

export function unregisterInput(botId: BotId) {
  registry.delete(botId)
}

function focusByBotId(botId: BotId) {
  const handlers = registry.get(botId)
  if (handlers?.focus) handlers.focus()
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (e) {
    console.warn('clipboard write failed', e)
    return false
  }
}

/**
 * Manual 모드: 클립보드 복사 후 순차적으로 포커스 이동
 */
export async function startManualDispatch(
  text: string,
  order: BotId[],
  excludeBotId?: BotId | '',
) {
  currentOrder = excludeBotId ? order.filter((b) => b !== excludeBotId) : [...order]
  currentIndex = -1
  await copyToClipboard(text)
  focusNext()
}

/**
 * Grok은 iframe으로 내장되어 있어 브라우저 보안 정책으로 인해 Auto 모드 불가능
 * 
 * 기술적 제약:
 * 1. Cross-Origin Policy: chrome-extension:// → https://grok.com iframe 접근 차단
 * 2. Content Script 미주입: Extension의 iframe에는 content script가 로드되지 않음
 * 3. CSP (Content Security Policy): Grok.com이 inline script 실행 차단
 * 
 * 해결책:
 * - Manual 모드 사용 (클립보드 복사 후 수동 붙여넣기)
 * - 향후: Chrome Debugger API를 사용해 새 탭으로 제어 가능 (독립 브라우저처럼)
 */

/**
 * Auto 모드: 사용자 입력처럼 보이도록 텍스트 복사-붙여넣기 시뮬레이션 후 자동 전송
 * 
 * 봇 감지 우회 전략:
 * 1. 각 봇의 실제 textarea에 값 설정
 * 2. Input/Change 이벤트 발생시켜 사용자 입력처럼 보이게 함
 * 3. 약간의 랜덤 딜레이로 자연스러운 타이핑 시뮬레이션
 * 4. 각 봇의 폼을 프로그래밍 방식으로 submit
 * 
 * ✅ Grok Webapp 지원:
 * - iframe 내부 DOM을 Content Script로 직접 제어
 * - chrome.tabs.sendMessage로 Grok.com 탭에 메시지 전송
 * - Content Script가 실제 입력창에 텍스트 입력 + 전송 버튼 클릭
 */
export async function startAutoDispatch(
  text: string,
  order: BotId[],
  excludeBotId?: BotId | '',
  image?: File,
) {
  const targetBots = excludeBotId ? order.filter((b) => b !== excludeBotId) : [...order]
  
  let successCount = 0
  let skippedBots: BotId[] = []
  
  for (let i = 0; i < targetBots.length; i++) {
    const botId = targetBots[i]
    
    // Grok 특수 처리: 브라우저 보안 제약으로 Auto 모드 미지원
    if (botId === 'grok') {
      console.log('[AUTO-DISPATCH] ⚠️ Grok detected - skipping (iframe cross-origin restrictions)')
      console.log('[AUTO-DISPATCH] 💡 Tip: Use Manual mode (Ctrl+Shift+V) to send to Grok')
      console.log('[AUTO-DISPATCH] 📘 Why: Extension cannot control cross-origin iframe (chrome-extension:// → https://grok.com)')
      skippedBots.push(botId)
      continue
    }
    
    // 일반 봇 처리
    const handlers = registry.get(botId)
    
    if (!handlers) {
      console.warn(`[AUTO-DISPATCH] ⏭️ No handlers registered for bot: ${botId}`)
      skippedBots.push(botId)
      continue
    }

    console.log(`[AUTO-DISPATCH] 📤 Sending to ${botId}...`)

    // 1. 포커스 (선택사항이지만 더 자연스러움)
    handlers.focus()

    // 2. 짧은 딜레이 (10-30ms 랜덤) - 자연스러운 UI 업데이트
    await delay(10 + Math.random() * 20)

    // 3. setValue를 통해 텍스트 입력 (사용자 입력처럼 이벤트 발생)
    if (handlers.setValue) {
      handlers.setValue(text)
    }

    // 4. 입력 후 약간의 딜레이 (20-50ms)
    await delay(20 + Math.random() * 30)

    // 5. 전송 (form submit)
    if (handlers.submit) {
      handlers.submit()
      successCount++
    }

    // 6. 다음 봇으로 넘어가기 전 딜레이 (50-100ms)
    if (i < targetBots.length - 1) {
      await delay(50 + Math.random() * 50)
    }
  }
  
  console.log(`[AUTO-DISPATCH] ✅ Completed: ${successCount} sent, ${skippedBots.length} skipped`, skippedBots)
  return { successCount, skippedBots }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function onSubmitted(botId: BotId) {
  if (!currentOrder.length) return
  const expected = currentOrder[currentIndex]
  if (expected && expected === botId) {
    focusNext()
  }
}

function focusNext() {
  if (!currentOrder.length) return
  currentIndex += 1
  if (currentIndex >= currentOrder.length) {
    // done
    currentOrder = []
    currentIndex = -1
    return
  }
  const next = currentOrder[currentIndex]
  focusByBotId(next)
}

export function isManualActive() {
  return currentOrder.length > 0
}
