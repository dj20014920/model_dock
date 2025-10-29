/**
 * Grok 안내 모달 관리 헬퍼 함수
 */
import Browser from 'webextension-polyfill'

const STORAGE_KEY = 'grokNoticeShown'

/**
 * Grok 안내를 표시했는지 확인
 */
export async function hasShownGrokNotice(): Promise<boolean> {
  const result = await Browser.storage.local.get(STORAGE_KEY)
  return !!result[STORAGE_KEY]
}

/**
 * Grok 안내 표시 기록
 */
export async function markGrokNoticeAsShown(): Promise<void> {
  await Browser.storage.local.set({ [STORAGE_KEY]: true })
}

/**
 * Grok 안내 초기화 (테스트용)
 */
export async function resetGrokNotice(): Promise<void> {
  await Browser.storage.local.remove(STORAGE_KEY)
}

/**
 * Grok 안내 표시 여부 확인 및 표시 필요 여부 반환
 */
export async function shouldShowGrokNotice(botIds: string[]): Promise<boolean> {
  const hasGrok = botIds.includes('grok')
  if (!hasGrok) {
    return false
  }

  const alreadyShown = await hasShownGrokNotice()
  return !alreadyShown
}
