/**
 * LM Arena 모델 목록 자동 동기화 시스템
 * 
 * 주기적으로 GitHub arena-catalog에서 최신 모델 목록을 가져와
 * 로컬 캐시를 업데이트합니다.
 */

import { fetchAvailableModels, cacheModels } from './api'

// 동기화 간격 (3시간)
const SYNC_INTERVAL = 3 * 60 * 60 * 1000

// 마지막 동기화 시간 키
const LAST_SYNC_KEY = 'lmarena_last_sync'

/**
 * 모델 목록 동기화
 */
export async function syncModels(): Promise<void> {
  try {
    console.log('[LMArena Sync] Starting model sync...')
    
    const models = await fetchAvailableModels()
    
    if (models.length > 0) {
      cacheModels(models)
      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString())
      console.log(`[LMArena Sync] Successfully synced ${models.length} models`)
    } else {
      console.warn('[LMArena Sync] No models fetched')
    }
  } catch (error) {
    console.error('[LMArena Sync] Sync failed:', error)
  }
}

/**
 * 동기화가 필요한지 확인
 */
export function needsSync(): boolean {
  try {
    const lastSync = localStorage.getItem(LAST_SYNC_KEY)
    if (!lastSync) return true

    const age = Date.now() - parseInt(lastSync, 10)
    return age > SYNC_INTERVAL
  } catch {
    return true
  }
}

/**
 * 자동 동기화 시작
 */
export function startAutoSync(): void {
  // 초기 동기화 (필요한 경우)
  if (needsSync()) {
    syncModels()
  }

  // 주기적 동기화
  setInterval(() => {
    if (needsSync()) {
      syncModels()
    }
  }, SYNC_INTERVAL)

  console.log('[LMArena Sync] Auto-sync started (interval: 3 hours)')
}

/**
 * 수동 강제 동기화
 */
export async function forceSyncModels(): Promise<number> {
  await syncModels()
  
  // 캐시된 모델 수 반환
  try {
    const cached = localStorage.getItem('lmarena_models_cache')
    if (cached) {
      const data = JSON.parse(cached)
      return data.models?.length || 0
    }
  } catch {
    // ignore
  }
  
  return 0
}

/**
 * 마지막 동기화 시간 가져오기
 */
export function getLastSyncTime(): Date | null {
  try {
    const lastSync = localStorage.getItem(LAST_SYNC_KEY)
    if (lastSync) {
      return new Date(parseInt(lastSync, 10))
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * 다음 동기화까지 남은 시간 (밀리초)
 */
export function getTimeUntilNextSync(): number {
  const lastSync = getLastSyncTime()
  if (!lastSync) return 0

  const nextSync = lastSync.getTime() + SYNC_INTERVAL
  const remaining = nextSync - Date.now()
  
  return Math.max(0, remaining)
}

/**
 * 동기화 상태 정보
 */
export interface SyncStatus {
  lastSync: Date | null
  nextSync: Date | null
  needsSync: boolean
  cachedModels: number
}

/**
 * 현재 동기화 상태 가져오기
 */
export function getSyncStatus(): SyncStatus {
  const lastSync = getLastSyncTime()
  const nextSync = lastSync ? new Date(lastSync.getTime() + SYNC_INTERVAL) : null
  
  let cachedModels = 0
  try {
    const cached = localStorage.getItem('lmarena_models_cache')
    if (cached) {
      const data = JSON.parse(cached)
      cachedModels = data.models?.length || 0
    }
  } catch {
    // ignore
  }

  return {
    lastSync,
    nextSync,
    needsSync: needsSync(),
    cachedModels,
  }
}
