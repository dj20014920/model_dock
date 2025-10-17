import { BotId } from '~app/bots'

type FocusFn = () => void

// Registered input focus functions per bot
const registry = new Map<BotId, FocusFn>()

// Current dispatch sequence and index
let currentOrder: BotId[] = []
let currentIndex = -1

export function registerInput(botId: BotId, focus: FocusFn) {
  registry.set(botId, focus)
}

export function unregisterInput(botId: BotId) {
  registry.delete(botId)
}

function focusByBotId(botId: BotId) {
  const fn = registry.get(botId)
  if (fn) fn()
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
  // helper in case we later persist runtime state
  return currentOrder.length > 0
}
