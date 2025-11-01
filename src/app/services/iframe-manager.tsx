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
  __mdIframeOverlayMap?: WeakMap<HTMLElement, HTMLDivElement>
}

// 📦 iframe 메타데이터
interface IframeMetadata {
  botId: BotId | string
  iframe: HTMLIFrameElement
  createdAt: number
  lastUsedAt: number
  mountCount: number
  reloadCount?: number
  lastLoadAt?: number
  lastAttachAt?: number
  lastDetachAt?: number
  lastContainerId?: string
  // overlay 모드 보조 정보
  zoom?: number
  containerEl?: HTMLElement
  positionUpdater?: () => void
  resizeObserver?: ResizeObserver
  scrollParents?: (Element | Window)[]
  rafId?: number
  overlayRoot?: HTMLElement
}

class IframeManager {
  private cache: Map<string, HTMLIFrameElement>
  private metadata: Map<string, IframeMetadata> = new Map()
  private stash: HTMLDivElement
  private overlayMap: WeakMap<HTMLElement, HTMLDivElement>

  constructor() {
    this.cache = this.ensureCache()
    this.stash = this.ensureStash()
    this.overlayMap = this.ensureOverlayMap()

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
   * 전역 고정 컨테이너 (절대 이동하지 않는 iframe 저장소)
   *
   * ✅ 새로운 접근: iframe을 절대 appendChild로 이동시키지 않음!
   * - 모든 iframe은 이 컨테이너에 생성 후 평생 유지
   * - CSS 클래스로만 표시/숨김 제어
   * - appendChild 호출 없음 → reload 절대 발생 안 함!
   */
  private ensureStash(): HTMLDivElement {
    let stashEl = document.getElementById('md-iframe-global-container') as HTMLDivElement | null
    if (!stashEl) {
      stashEl = document.createElement('div')
      stashEl.id = 'md-iframe-global-container'
      // 화면 전체를 덮는 고정 레이어 (모든 iframe의 영구 부모)
      stashEl.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
        overflow: hidden;
      `.trim().replace(/\n\s+/g, ' ')
      document.body.appendChild(stashEl)
      console.log(
        '%c[IframeManager] 🏗️ 전역 고정 컨테이너 생성 (CSS 기반 시스템)',
        'color: #00ff00; font-weight: bold; background: #003300; padding: 2px 8px'
      )
    }
    return stashEl
  }

  /**
   * 전역 오버레이 루트 컨테이너 (고정 위치 레이어)
   * - iframe을 실제 컨테이너에 reparent하지 않고, viewport 좌표에 맞춰 고정 배치
   * - 장점: reparent로 인한 reload 가능성 최소화
   */
  private ensureOverlayMap(): WeakMap<HTMLElement, HTMLDivElement> {
    const w = window as any as GlobalIframeCache
    if (!w.__mdIframeOverlayMap) {
      w.__mdIframeOverlayMap = new WeakMap()
    }
    return w.__mdIframeOverlayMap
  }

  private ensureOverlayForRoot(rootEl: HTMLElement): HTMLDivElement {
    let overlay = this.overlayMap.get(rootEl)
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.style.cssText = 'position:absolute; left:0; top:0; pointer-events:none; z-index:100;'
      // root 기준 배치가 가능하도록 root가 static이면 relative 지정
      const cs = getComputedStyle(rootEl)
      if (cs.position === 'static') {
        rootEl.style.position = 'relative'
      }
      rootEl.appendChild(overlay)
      this.overlayMap.set(rootEl, overlay)
      console.log('[IframeManager] 🧪 Overlay 컨테이너 생성(for root)')
    }
    return overlay
  }

  private isOverlayMode(iframe: HTMLIFrameElement): boolean {
    return !!iframe.parentElement && (iframe.parentElement as HTMLElement).style.pointerEvents === 'none'
  }

  private updateOverlayFrame(key: string): void {
    const meta = this.metadata.get(key)
    const iframe = this.cache.get(key)
    if (!meta || !iframe || !meta.containerEl) return
    const rect = meta.containerEl.getBoundingClientRect()
    const overlayRoot = meta.overlayRoot || meta.containerEl.offsetParent || document.body
    const baseRect = (overlayRoot as HTMLElement).getBoundingClientRect()
    const z = meta.zoom || 1
    iframe.style.left = rect.left - baseRect.left + 'px'
    iframe.style.top = rect.top - baseRect.top + 'px'
    iframe.style.width = rect.width / z + 'px'
    iframe.style.height = rect.height / z + 'px'
    iframe.style.transform = `scale(${z})`
    iframe.style.transformOrigin = 'top left'
  }

  private getScrollParents(el: HTMLElement): (Element | Window)[] {
    const res: (Element | Window)[] = []
    let node: HTMLElement | null = el
    while (node && node !== document.body) {
      try {
        const cs = getComputedStyle(node)
        const overflowY = cs.overflowY
        const overflowX = cs.overflowX
        if (/(auto|scroll|overlay)/.test(overflowY) || /(auto|scroll|overlay)/.test(overflowX)) {
          res.push(node)
        }
      } catch {}
      node = node.parentElement
    }
    res.push(window)
    return res
  }

  private attachScrollSync(key: string) {
    const meta = this.metadata.get(key)
    if (!meta || !meta.containerEl || !meta.positionUpdater) return

    const parents = this.getScrollParents(meta.containerEl)
    const userUpdater = meta.positionUpdater

    const onScroll = () => {
      if (meta!.rafId) return
      meta!.rafId = requestAnimationFrame(() => {
        meta!.rafId = undefined
        // ✅ 사용자가 정의한 positionUpdater 사용 (overlay 또는 CSS 모드)
        if (userUpdater) {
          userUpdater()
        }
      })
    }

    parents.forEach((p) => p.addEventListener('scroll', onScroll, { passive: true, capture: true }))
    window.addEventListener('resize', onScroll, { passive: true })
    meta.scrollParents = parents
    // positionUpdater는 이미 외부에서 설정됨 (덮어쓰지 않음)
  }

  private detachScrollSync(key: string) {
    const meta = this.metadata.get(key)
    if (!meta) return
    const onScroll = meta.positionUpdater
    if (onScroll) {
      window.removeEventListener('resize', onScroll as any)
      meta.scrollParents?.forEach((p) => p.removeEventListener('scroll', onScroll as any, true))
    }
    if (meta.rafId) cancelAnimationFrame(meta.rafId)
    meta.rafId = undefined
    meta.scrollParents = undefined
    meta.positionUpdater = undefined
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

      console.log(
        `%c[IframeManager] ✅ CACHE HIT: ${botId}`,
        'color: #00ff00; font-weight: bold; background: #003300; padding: 2px 8px',
        {
          botId,
          mountCount: meta.mountCount,
          createdAgo: `${Math.round((Date.now() - meta.createdAt) / 1000)}s ago`,
          lastUsedAgo: meta.lastUsedAt !== Date.now() ? `${Math.round((Date.now() - meta.lastUsedAt) / 1000)}s ago` : 'now',
          currentUrl: iframe.src.substring(0, 50) + '...',
          parentElement: iframe.parentElement?.id || iframe.parentElement?.tagName || 'DETACHED',
          reloadCount: meta.reloadCount || 0,
        }
      )

      return iframe
    }

    // 🆕 캐시 MISS - 새로 생성
    console.log(
      `%c[IframeManager] 🆕 CACHE MISS: ${botId} - Creating new iframe...`,
      'color: #ffaa00; font-weight: bold; background: #332200; padding: 2px 8px'
    )
    
    const config = getIframeConfig(botId)
    if (!config) {
      console.warn(
        `%c[IframeManager] ⚠️ Unsupported bot: ${botId}`,
        'color: #ff9500; font-weight: bold',
        { botId }
      )
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
      reloadCount: 0,
    })

    // 🔍 LOAD 이벤트로 (재)로딩 탐지
    iframe.addEventListener('load', () => {
      const meta = this.metadata.get(key)
      const loadTime = new Date().toISOString()
      
      if (meta) {
        const prevReloadCount = meta.reloadCount || 0
        meta.reloadCount = prevReloadCount + 1
        meta.lastLoadAt = Date.now()
        
        const isInitialLoad = meta.reloadCount === 1
        const ageSeconds = Math.round((Date.now() - meta.createdAt) / 1000)
        
        if (isInitialLoad) {
          console.log(
            `%c[IframeManager] 🎉 INITIAL LOAD: ${botId}`,
            'color: #00ff00; font-weight: bold; background: #003300; padding: 2px 8px',
            {
              botId,
              src: iframe.src.substring(0, 60) + '...',
              loadTime,
              ageSeconds,
            }
          )
        } else {
          console.log(
            `%c[IframeManager] 🔄 RELOAD DETECTED: ${botId} ⚠️`,
            'color: #ff0000; font-weight: bold; background: #330000; padding: 4px 12px; font-size: 14px',
            {
              botId,
              reloadCount: meta.reloadCount,
              src: iframe.src.substring(0, 60) + '...',
              loadTime,
              ageSeconds,
              WARNING: '⚠️ SESSION MAY BE LOST!',
              parentElement: iframe.parentElement?.id || iframe.parentElement?.tagName || 'DETACHED',
            }
          )
        }
      } else {
        console.log(
          `%c[IframeManager] 🔄 LOAD event (no meta): ${botId}`,
          'color: #888888',
          { botId, loadTime }
        )
      }
    })

    // 🗄️ 전역 고정 컨테이너에 추가 (최초 1회, 이후 절대 이동 안 함!)
    // ✅ 초기에는 숨김 상태로 생성
    iframe.style.position = 'absolute'
    iframe.style.left = '-9999px'
    iframe.style.top = '0'
    iframe.style.visibility = 'hidden'
    iframe.style.pointerEvents = 'none'
    iframe.style.zIndex = '1'

    this.stash.appendChild(iframe)
    this.cache.set(key, iframe)

    console.log(
      `%c[IframeManager] ✅ NEW IFRAME CREATED: ${botId}`,
      'color: #00ff00; font-weight: bold; background: #003300; padding: 2px 8px',
      {
        botId,
        src: config.src,
        title: config.title,
        initialParent: 'md-iframe-stash',
        cacheSize: this.cache.size,
      }
    )

    return iframe
  }

  /**
   * iframe 표시 (CSS만 변경, appendChild 절대 안 함!)
   *
   * ✅ 새로운 접근: appendChild 완전 제거!
   * - iframe은 고정 컨테이너에서 절대 이동하지 않음
   * - container의 위치/크기에 맞춰 CSS만 동적 변경
   * - DOM 위치 변경 없음 → reload 절대 발생 안 함!
   *
   * @param botId - 봇 ID
   * @param container - 표시할 영역의 참조 컨테이너
   * @returns 성공 여부
   */
  attachIframe(botId: BotId | string, container: HTMLElement): boolean {
    const timestamp = new Date().toISOString()
    const key = String(botId)

    console.log(
      `%c[IframeManager] 🎨 CSS ATTACH START: ${botId}`,
      'color: #00ffff; font-weight: bold',
      { botId, timestamp, containerTag: container.tagName }
    )

    const iframe = this.getOrCreateIframe(botId)
    if (!iframe) {
      console.error(
        `%c[IframeManager] ❌ ATTACH FAILED: iframe not found for ${botId}`,
        'color: #ff0000; font-weight: bold',
        { botId, timestamp }
      )
      return false
    }

    // 🎨 CSS로 위치/크기 동기화 (appendChild 없음!)
    const rect = container.getBoundingClientRect()

    iframe.style.position = 'absolute'
    iframe.style.left = `${rect.left}px`
    iframe.style.top = `${rect.top}px`
    iframe.style.width = `${rect.width}px`
    iframe.style.height = `${rect.height}px`
    iframe.style.visibility = 'visible'
    iframe.style.pointerEvents = 'auto'
    iframe.style.display = 'block'
    iframe.style.zIndex = '10'
    iframe.className = 'w-full h-full border-0 md-iframe-visible'

    // 📍 ResizeObserver로 container 크기 변화 추적
    const meta = this.metadata.get(key)
    if (meta) {
      meta.lastAttachAt = Date.now()
      meta.lastContainerId = (container as any).id || (container as any).dataset?.iframeContainer || 'css-positioned'
      meta.containerEl = container

      // 이전 observer 정리
      if (meta.resizeObserver) {
        meta.resizeObserver.disconnect()
      }

      // 새 observer 생성
      const updatePosition = () => {
        const newRect = container.getBoundingClientRect()
        iframe.style.left = `${newRect.left}px`
        iframe.style.top = `${newRect.top}px`
        iframe.style.width = `${newRect.width}px`
        iframe.style.height = `${newRect.height}px`
      }

      if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(updatePosition)
        ro.observe(container)
        meta.resizeObserver = ro as any
      }

      // 스크롤 동기화도 추가 (positionUpdater 먼저 설정!)
      meta.positionUpdater = updatePosition
      this.attachScrollSync(key)
    }

    console.log(
      `%c[IframeManager] ✅ CSS ATTACHED (NO DOM MOVE!): ${botId}`,
      'color: #00ff00; font-weight: bold; background: #003300; padding: 2px 8px',
      {
        botId,
        method: 'CSS_ONLY',
        position: `${Math.round(rect.left)},${Math.round(rect.top)}`,
        size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        reloadCount: meta?.reloadCount,
        noReloadRisk: true,
        timestamp
      }
    )

    return true
  }

  /**
   * iframe을 overlay 레이어에 고정 배치하여 지정 컨테이너 영역을 시뮬레이션
   * - 부모는 overlay로 고정 → 컨테이너 변경 시 reparent 없음
   * - 위치/크기는 컨테이너의 boundingClientRect로 계산
   */
  attachOverlay(botId: BotId | string, container: HTMLElement): boolean {
    const iframe = this.getOrCreateIframe(botId)
    if (!iframe) return false

    // overlay root를 컨테이너의 스크롤 루트(첫 번째 스크롤 부모)로 지정
    const parents = this.getScrollParents(container)
    const rootEl = (parents.find((p) => p instanceof Element) as HTMLElement) || container
    const overlayRoot = this.ensureOverlayForRoot(rootEl)

    // 부모가 현재 overlayRoot가 아니면 이동
    if (iframe.parentElement !== overlayRoot) {
      overlayRoot.appendChild(iframe)
    }

    // 포인터 이벤트 허용(오버레이 루트는 none)
    iframe.style.pointerEvents = 'auto'
    iframe.style.border = '0'
    iframe.style.visibility = 'visible'
    iframe.style.display = 'block'
    iframe.style.position = 'fixed'
    iframe.style.transform = ''
    iframe.style.transformOrigin = ''
    iframe.style.minWidth = ''
    iframe.style.minHeight = ''
    iframe.style.width = ''
    iframe.style.height = ''
    // 컨테이너의 border-radius를 그대로 적용해 경계 일치
    try {
      const cs = getComputedStyle(container)
      const br = cs.borderRadius
      if (br) iframe.style.borderRadius = br
    } catch {}

    // 최초 위치 계산(zoom 반영 포함)
    const key = String(botId)
    const meta2 = this.metadata.get(key)
    if (meta2) {
      meta2.containerEl = container
      if (typeof meta2.zoom !== 'number') meta2.zoom = 1
      ;(meta2 as any).overlayRoot = overlayRoot
      this.updateOverlayFrame(key)
      this.detachScrollSync(key)
      this.attachScrollSync(key)
    }

    // 리사이즈/스크롤 동기화
    const boundUpdate = () => this.updateOverlayFrame(key)
    // resize/scroll 동기화는 attachScrollSync에서 처리

    // ResizeObserver로 컨테이너 크기 변화 추적
    let ro: ResizeObserver | null = null
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => this.updateOverlayFrame(key))
      ro.observe(container)
    }

    const meta = this.metadata.get(String(botId))
    if (meta) {
      meta.lastAttachAt = Date.now()
      meta.lastContainerId = (container as any).id || (container as any).dataset?.iframeContainer || 'overlay-target'
      meta.containerEl = container
      meta.positionUpdater = () => this.updateOverlayFrame(String(botId))
      meta.resizeObserver = ro as any
    }

    console.log('[IframeManager] 🎯 overlay 부착', {
      botId,
      to: meta?.lastContainerId,
      reloadCount: meta?.reloadCount,
    })
    return true
  }

  /** 숨김(overlay에 남겨두고 가시성만 Off) */
  hide(botId: BotId | string): void {
    const key = String(botId)
    const iframe = this.cache.get(key)
    if (!iframe) return
    iframe.style.visibility = 'hidden'
    iframe.style.pointerEvents = 'none'
    const meta = this.metadata.get(key)
    if (meta) {
      const ro = meta.resizeObserver
      this.detachScrollSync(key)
      if (ro) {
        try { ro.disconnect() } catch {}
        meta.resizeObserver = undefined
      }
    }
    console.log('[IframeManager] 🙈 overlay 숨김', { botId })
  }

  /**
   * iframe 숨김 (CSS만 변경, appendChild 절대 안 함!)
   *
   * ✅ 새로운 접근: appendChild 완전 제거!
   * - iframe은 고정 컨테이너에 그대로 유지
   * - CSS만 변경하여 화면 밖으로 숨김
   * - DOM 위치 변경 없음 → reload 절대 발생 안 함!
   *
   * @param botId - 봇 ID
   */
  detachIframe(botId: BotId | string): void {
    const key = String(botId)
    const timestamp = new Date().toISOString()

    console.log(
      `%c[IframeManager] 🎨 CSS DETACH START: ${botId}`,
      'color: #ffaa00; font-weight: bold',
      { botId, timestamp }
    )

    const iframe = this.cache.get(key)

    if (!iframe) {
      console.warn(
        `%c[IframeManager] ⚠️ DETACH SKIPPED: iframe not found for ${botId}`,
        'color: #ff9500',
        { botId, timestamp }
      )
      return
    }

    // 🎨 CSS로 숨김 (appendChild 없음!)
    iframe.style.position = 'absolute'
    iframe.style.left = '-9999px'
    iframe.style.top = '0'
    iframe.style.visibility = 'hidden'
    iframe.style.pointerEvents = 'none'
    iframe.style.zIndex = '1'
    iframe.className = 'w-full h-full border-0 md-iframe-hidden'

    // 🧹 Observer 정리
    const meta = this.metadata.get(key)
    if (meta) {
      // ResizeObserver 정리
      if (meta.resizeObserver) {
        meta.resizeObserver.disconnect()
        meta.resizeObserver = undefined
      }

      // Scroll 동기화 해제
      this.detachScrollSync(key)

      meta.lastDetachAt = Date.now()
      meta.lastContainerId = 'css-hidden'
      meta.containerEl = undefined
      meta.positionUpdater = undefined
    }

    console.log(
      `%c[IframeManager] ✅ CSS DETACHED (NO DOM MOVE!): ${botId}`,
      'color: #00ff00; font-weight: bold; background: #003300; padding: 2px 8px',
      {
        botId,
        method: 'CSS_ONLY',
        reloadCount: meta?.reloadCount,
        sessionPreserved: true,
        noReloadRisk: true,
        timestamp
      }
    )
  }

  /**
   * iframe 스타일 업데이트 (zoom 등)
   *
   * @param botId - 봇 ID
   * @param zoom - 배율
   */
  applyZoom(botId: BotId | string, zoom: number): void {
    const key = String(botId)
    const iframe = this.cache.get(key)
    if (!iframe) return

    const z = zoom || 1
    const meta = this.metadata.get(key)
    if (meta) meta.zoom = z

    if (this.isOverlayMode(iframe)) {
      this.updateOverlayFrame(key)
      console.log('[IframeManager] 🔍 applyZoom(overlay)', { botId, zoom: z })
    } else {
      // Embedded: scale 대신 100% 고정(부모 컨테이너에 꽉 차게 표현)
      iframe.style.minHeight = '100%'
      iframe.style.minWidth = '100%'
      iframe.style.transform = ''
      iframe.style.transformOrigin = ''
      iframe.style.width = '100%'
      iframe.style.height = '100%'
      console.log('[IframeManager] 🔍 applyZoom(embedded passthrough)', { botId, zoom: z })
    }
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
  attachOverlay: (botId: BotId | string, container: HTMLElement) =>
    getIframeManager().attachOverlay(botId, container),
  hide: (botId: BotId | string) =>
    getIframeManager().hide(botId),
  applyZoom: (botId: BotId | string, zoom: number) =>
    getIframeManager().applyZoom(botId, zoom),
  reset: (botId: BotId | string) =>
    getIframeManager().resetIframe(botId),
  preload: (botIds: (BotId | string)[]) =>
    getIframeManager().preload(botIds),
  stats: () =>
    getIframeManager().printStats(),
}
