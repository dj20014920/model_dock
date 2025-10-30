import { BotId } from '~app/bots'
import { getIframeConfig } from '~app/bots/iframe-registry'

/**
 * 🎯 IframeManager - 전역 iframe 세션 관리자
 *
 * 핵심 원칙:
 * 1. iframe DOM 노드는 절대 파괴하지 않음 (앱 종료 전까지 유지)
 * 2. React lifecycle과 독립적으로 작동
 * 3. show/hide만으로 제어 (unmount 없음)
 * 4. 메모리 효율: 실제 사용된 봇만 생성
 *
 * 작동 방식:
 * - 컴포넌트가 iframe을 요청하면 전역 캐시에서 가져옴
 * - 없으면 새로 생성하고 숨김 컨테이너에 보관
 * - 컴포넌트 unmount 시에도 iframe은 유지
 * - 재mount 시 같은 iframe 재사용 → 세션 유지!
 */

// 🗂️ 전역 iframe 캐시 (window 객체에 저장)
interface GlobalIframeCache {
  __mdIframeCache?: Map<string, HTMLIFrameElement>
  __mdIframeStash?: HTMLDivElement
}

// 📦 iframe 메타데이터
interface IframeMetadata {
  botId: BotId | string
  iframe: HTMLIFrameElement
  createdAt: number
  lastUsedAt: number
  mountCount: number
}

class IframeManager {
  private cache: Map<string, HTMLIFrameElement>
  private metadata: Map<string, IframeMetadata> = new Map()
  private stash: HTMLDivElement

  constructor() {
    this.cache = this.ensureCache()
    this.stash = this.ensureStash()

    console.log('[IframeManager] 🚀 초기화 완료')
  }

  /**
   * 전역 캐시 초기화 (싱글톤 패턴)
   */
  private ensureCache(): Map<string, HTMLIFrameElement> {
    const w = window as any as GlobalIframeCache
    if (!w.__mdIframeCache) {
      w.__mdIframeCache = new Map<string, HTMLIFrameElement>()
      console.log('[IframeManager] 📦 전역 캐시 생성')
    }
    return w.__mdIframeCache
  }

  /**
   * 전역 보관 컨테이너 (숨김용)
   *
   * 핵심: appendChild는 같은 document 내에서 iframe reload 안 함!
   * → stash ↔ container 이동은 안전
   */
  private ensureStash(): HTMLDivElement {
    let stashEl = document.getElementById('md-iframe-stash') as HTMLDivElement | null
    if (!stashEl) {
      stashEl = document.createElement('div')
      stashEl.id = 'md-iframe-stash'
      // 화면에 보이지 않지만 iframe은 정상 렌더링되도록
      stashEl.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 100vw; height: 100vh; pointer-events: none; visibility: hidden;'
      document.body.appendChild(stashEl)
      console.log('[IframeManager] 🗄️ Stash 컨테이너 생성')
    }
    return stashEl
  }

  /**
   * iframe 가져오기 (없으면 생성)
   *
   * @param botId - 봇 ID
   * @returns iframe 엘리먼트 또는 null
   */
  getOrCreateIframe(botId: BotId | string): HTMLIFrameElement | null {
    const key = String(botId)

    // 🎯 캐시 확인
    let iframe = this.cache.get(key)

    if (iframe) {
      // ✅ 캐시 HIT
      const meta = this.metadata.get(key)!
      meta.lastUsedAt = Date.now()
      meta.mountCount++

      console.log(`[IframeManager] ✅ 캐시 HIT: ${botId}`, {
        mountCount: meta.mountCount,
        ageSeconds: Math.round((Date.now() - meta.createdAt) / 1000),
        currentUrl: iframe.src,
      })

      return iframe
    }

    // 🆕 캐시 MISS - 새로 생성
    const config = getIframeConfig(botId)
    if (!config) {
      console.warn(`[IframeManager] ⚠️ 지원하지 않는 봇: ${botId}`)
      return null
    }

    iframe = document.createElement('iframe')
    iframe.src = config.src
    iframe.className = 'w-full h-full border-0'
    iframe.setAttribute('sandbox', config.sandbox)
    iframe.setAttribute('allow', config.allow)
    iframe.title = config.title
    iframe.id = `md-iframe-${botId}`

    // 📊 메타데이터 저장
    const now = Date.now()
    this.metadata.set(key, {
      botId,
      iframe,
      createdAt: now,
      lastUsedAt: now,
      mountCount: 1,
    })

    // 🗄️ 스태시에 보관 (화면에 보이지 않음)
    this.stash.appendChild(iframe)
    this.cache.set(key, iframe)

    console.log(`[IframeManager] 🆕 새 iframe 생성: ${botId}`, {
      src: config.src,
      title: config.title,
    })

    return iframe
  }

  /**
   * iframe을 container에 부착 (appendChild 사용)
   *
   * 핵심: appendChild는 같은 document 내 이동 시 iframe reload 안 함!
   * → stash에서 container로 이동해도 세션 유지 ✅
   *
   * @param botId - 봇 ID
   * @param container - 부착할 컨테이너
   * @returns 성공 여부
   */
  attachIframe(botId: BotId | string, container: HTMLElement): boolean {
    const iframe = this.getOrCreateIframe(botId)
    if (!iframe) return false

    // 🔗 container로 이동 (appendChild는 자동으로 이전 위치에서 제거)
    // ✅ 같은 document 내 이동이므로 iframe reload 없음!
    container.appendChild(iframe)

    // 🎨 스타일 초기화 (stash에서 설정된 visibility 제거)
    iframe.style.position = ''
    iframe.style.visibility = 'visible'
    iframe.style.pointerEvents = 'auto'
    iframe.style.display = 'block'

    console.log(`[IframeManager] 🔗 iframe 부착: ${botId} → container`)
    return true
  }

  /**
   * iframe을 stash로 이동 (숨김)
   *
   * 핵심: stash로 appendChild해도 같은 document 내 이동이므로 reload 없음!
   * → 세션 유지 ✅
   *
   * @param botId - 봇 ID
   */
  detachIframe(botId: BotId | string): void {
    const key = String(botId)
    const iframe = this.cache.get(key)

    if (!iframe) return

    // 🗄️ stash로 이동 (appendChild는 reload 안 일으킴)
    this.stash.appendChild(iframe)

    console.log(`[IframeManager] 📤 iframe 분리: ${botId} → stash (세션 보존)`)
  }

  /**
   * iframe 스타일 업데이트 (zoom 등)
   *
   * @param botId - 봇 ID
   * @param zoom - 배율
   */
  applyZoom(botId: BotId | string, zoom: number): void {
    const iframe = this.cache.get(String(botId))
    if (!iframe) return

    const z = zoom || 1

    iframe.style.minHeight = '100%'
    iframe.style.minWidth = '100%'
    iframe.style.transform = `scale(${z})`
    iframe.style.transformOrigin = 'top left'
    iframe.style.width = `${100 / z}%`
    iframe.style.height = `${100 / z}%`

    // PERF-NOTE: transform: scale()은 GPU 가속 활용
    // Instruments > Core Animation으로 확인 가능
  }

  /**
   * 디버깅: 현재 캐시 상태 출력
   */
  printStats(): void {
    console.log('[IframeManager] 📊 통계:')
    console.log('  전체 iframe 수:', this.cache.size)

    for (const [botId, meta] of this.metadata.entries()) {
      console.log(`  - ${botId}:`, {
        mountCount: meta.mountCount,
        age: `${Math.round((Date.now() - meta.createdAt) / 1000)}초`,
        lastUsed: `${Math.round((Date.now() - meta.lastUsedAt) / 1000)}초 전`,
      })
    }
  }

  /**
   * 특정 봇의 iframe 초기화 (세션 리셋)
   * 주의: 이 메서드는 명시적으로 호출할 때만 사용!
   */
  resetIframe(botId: BotId | string): void {
    const key = String(botId)
    const iframe = this.cache.get(key)

    if (!iframe) return

    const config = getIframeConfig(botId)
    if (!config) return

    // 🔄 iframe 완전 재생성
    iframe.remove()
    this.cache.delete(key)
    this.metadata.delete(key)

    console.log(`[IframeManager] 🔄 iframe 리셋: ${botId}`)

    // 새로 생성
    this.getOrCreateIframe(botId)
  }

  /**
   * 프리로드: 미리 iframe 생성 (성능 최적화)
   */
  preload(botIds: (BotId | string)[]): void {
    console.log('[IframeManager] 🚀 프리로드 시작:', botIds)

    for (const botId of botIds) {
      this.getOrCreateIframe(botId)
    }
  }

  /**
   * 메모리 정리: 오래 사용하지 않은 iframe 제거
   * (기본적으로 사용하지 않음 - 세션 유지가 우선)
   */
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now()
    const toRemove: string[] = []

    for (const [botId, meta] of this.metadata.entries()) {
      if (now - meta.lastUsedAt > maxAge) {
        toRemove.push(botId)
      }
    }

    for (const botId of toRemove) {
      this.resetIframe(botId)
    }

    if (toRemove.length > 0) {
      console.log(`[IframeManager] 🧹 정리 완료: ${toRemove.length}개 제거`)
    }
  }
}

// 🌐 전역 싱글톤 인스턴스
let managerInstance: IframeManager | null = null

export function getIframeManager(): IframeManager {
  if (!managerInstance) {
    managerInstance = new IframeManager()
  }
  return managerInstance
}

// 편의 함수들
export const iframeManager = {
  get: () => getIframeManager(),
  attach: (botId: BotId | string, container: HTMLElement) =>
    getIframeManager().attachIframe(botId, container),
  detach: (botId: BotId | string) =>
    getIframeManager().detachIframe(botId),
  applyZoom: (botId: BotId | string, zoom: number) =>
    getIframeManager().applyZoom(botId, zoom),
  reset: (botId: BotId | string) =>
    getIframeManager().resetIframe(botId),
  preload: (botIds: (BotId | string)[]) =>
    getIframeManager().preload(botIds),
  stats: () =>
    getIframeManager().printStats(),
}
