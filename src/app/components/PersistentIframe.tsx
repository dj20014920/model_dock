import React, { CSSProperties, useEffect, useRef } from 'react'
import { BotId } from '~app/bots'
import { iframeManager } from '~app/services/iframe-manager'

type Props = {
  botId: BotId | string
  src: string
  zoom?: number
  sandbox?: string
  allow?: string
  title?: string
  className?: string
  style?: CSSProperties
}

/**
 * PersistentIframe (v2 - IframeManager 기반)
 *
 * 개선 사항:
 * - IframeManager를 통한 전역 iframe 관리
 * - React lifecycle과 완전히 독립적인 세션 관리
 * - 조건부 렌더링에도 안전한 세션 유지
 *
 * 작동 원리:
 * 1. mount 시: IframeManager에서 iframe 가져와서 컨테이너에 부착
 * 2. unmount 시: iframe을 숨김 컨테이너로 이동 (파괴 안 함!)
 * 3. 재mount 시: 같은 iframe을 다시 가져와서 부착 → 세션 유지!
 *
 * PERF-WARNING: iframe이 많아지면 메모리 사용량 증가
 * - 확인 방법: Instruments > Allocations
 * - 완화: iframeManager.cleanup() 호출 (단, 세션은 손실됨)
 */
export default function PersistentIframe({
  botId,
  src,
  zoom = 1,
  sandbox,
  allow,
  title,
  className,
  style
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  // iframe 부착 및 스타일 적용
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      console.warn('[PersistentIframe] ⚠️ 컨테이너 없음:', botId)
      return
    }

    // 🔗 IframeManager에서 iframe 가져와서 부착
    // ✅ appendChild는 같은 document 내 이동이므로 reload 없음!
    console.log('[PersistentIframe] 🔧 attachOverlay begin', { botId, containerId: (container as any).id })
    const success = iframeManager.attachOverlay(botId, container)

    if (!success) {
      console.error('[PersistentIframe] ❌ iframe 부착 실패:', botId)
      return
    }

    // 🎨 zoom 스타일 적용
    iframeManager.applyZoom(botId, zoom)

    console.log('[PersistentIframe] ✅ 마운트 완료', { botId, zoom })

    // 🧹 cleanup: unmount 시 iframe을 stash로 이동하여 세션 보존
    // ✅ appendChild로 stash 이동도 reload 없음!
    return () => {
      console.log('[PersistentIframe] 🧹 hide begin', { botId })
      iframeManager.hide(botId)
      console.log('[PersistentIframe] 📦 언마운트 → overlay hidden (세션 보존)', { botId })
    }
  }, [botId]) // botId 변경 시에만 재부착

  // zoom 변경 시에만 스타일 업데이트
  useEffect(() => {
    iframeManager.applyZoom(botId, zoom)
  }, [botId, zoom])

  // 📦 컨테이너만 렌더링 (iframe은 IframeManager가 삽입)
  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      data-iframe-bot={botId}
    />
  )
}
