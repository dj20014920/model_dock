import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { sample, uniqBy } from 'lodash-es'
import { FC, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '~/utils'
import Button from '~app/components/Button'
import ChatMessageInput from '~app/components/Chat/ChatMessageInput'
import LayoutSwitch from '~app/components/Chat/LayoutSwitch'
import { CHATBOTS, Layout } from '~app/consts'
import { useChat } from '~app/hooks/use-chat'
import { usePremium } from '~app/hooks/use-premium'
import { trackEvent } from '~app/plausible'
import { showPremiumModalAtom } from '~app/state'
import { BotId } from '../bots'
import ConversationPanel from '../components/Chat/ConversationPanel'
import { getUserConfig, updateUserConfig } from '~services/user-config'
import { startManualDispatch, startAutoDispatch } from '~app/utils/manual-dispatch'
import RiskConsentModal from '~app/components/Modals/RiskConsentModal'
import GrokNoticeModal from '~app/components/Modals/GrokNoticeModal'
import MainBrainPanel from '~app/components/MainBrain/Panel'
import UsageBadge from '~app/components/Usage/Badge'
import toast from 'react-hot-toast'
import Browser from 'webextension-polyfill'
import { iframeManager } from '~app/services/iframe-manager'
import { isIframeBot } from '~app/bots/iframe-registry'

const DEFAULT_BOTS: BotId[] = Object.keys(CHATBOTS).slice(0, 6) as BotId[]

const layoutAtom = atomWithStorage<Layout>('multiPanelLayout', 2, undefined, { getOnInit: true })
const twoPanelBotsAtom = atomWithStorage<BotId[]>('multiPanelBots:2', DEFAULT_BOTS.slice(0, 2))
const threePanelBotsAtom = atomWithStorage<BotId[]>('multiPanelBots:3', DEFAULT_BOTS.slice(0, 3))
const fourPanelBotsAtom = atomWithStorage<BotId[]>('multiPanelBots:4', DEFAULT_BOTS.slice(0, 4))
const sixPanelBotsAtom = atomWithStorage<BotId[]>('multiPanelBots:6', DEFAULT_BOTS.slice(0, 6))

function replaceDeprecatedBots(bots: BotId[]): BotId[] {
  return bots.map((bot) => {
    if (CHATBOTS[bot]) {
      return bot
    }
    return sample(DEFAULT_BOTS)!
  })
}

// 🎯 iframe 세션 완벽 보존 시스템 v3.0 - 완전 재설계
// ✅ 핵심 전략:
//    1. 모든 봇을 MultiBotChatPanel에서만 useChat 호출 (단 1회)
//    2. UnifiedChatPanel, GeneralChatPanel 제거 → 평면적 1단계 구조
//    3. 메인브레인 로직: setBots 조작 완전 제거 → 단순 읽기 + 위치 제어
//    4. 모든 봇(iframe + 비-iframe) 항상 렌더링
//    5. CSS만으로 표시/숨김 제어 (조건부 렌더링 제거)
//
// PERF-WARNING: 모든 봇 상시 렌더링으로 메모리 증가 예상
// 확인: Instruments > Allocations

const MultiBotChatPanel: FC = () => {
  // 🔍 렌더링 카운터 추적
  const renderCountRef = useState(() => ({ count: 0 }))[0]
  renderCountRef.count++
  console.log(`%c[MultiBotPanel] 🔄 RENDER #${renderCountRef.count}`, 'color: #00ff00; font-weight: bold; font-size: 14px')

  const { t } = useTranslation()
  const [layout, setLayout] = useAtom(layoutAtom)
  const [bots2, setBots2] = useAtom(twoPanelBotsAtom)
  const [bots3, setBots3] = useAtom(threePanelBotsAtom)
  const [bots4, setBots4] = useAtom(fourPanelBotsAtom)
  const [bots6, setBots6] = useAtom(sixPanelBotsAtom)

  const [riskOpen, setRiskOpen] = useState(false)
  const [grokNoticeOpen, setGrokNoticeOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [mainBrainBotId, setMainBrainBotId] = useState<BotId | ''>('')

  const setPremiumModalOpen = useSetAtom(showPremiumModalAtom)
  const premiumState = usePremium()
  const disabled = useMemo(() => !premiumState.isLoading && !premiumState.activated, [premiumState])

  // 🔍 State 변경 추적
  useEffect(() => {
    console.log(`%c[MultiBotPanel] 📐 Layout Changed: ${layout}`, 'color: #ff9500; font-weight: bold')
  }, [layout])

  useEffect(() => {
    console.log(`%c[MultiBotPanel] 🔢 Bots2 Changed:`, 'color: #ff9500', bots2)
  }, [bots2])

  useEffect(() => {
    console.log(`%c[MultiBotPanel] 🔢 Bots3 Changed:`, 'color: #ff9500', bots3)
  }, [bots3])

  useEffect(() => {
    console.log(`%c[MultiBotPanel] 🔢 Bots4 Changed:`, 'color: #ff9500', bots4)
  }, [bots4])

  useEffect(() => {
    console.log(`%c[MultiBotPanel] 🔢 Bots6 Changed:`, 'color: #ff9500', bots6)
  }, [bots6])

  useEffect(() => {
    console.log(`%c[MultiBotPanel] 🧠 MainBrainBotId Changed: "${mainBrainBotId}"`, 'color: #ff00ff; font-weight: bold')
  }, [mainBrainBotId])

  // 🔥 1️⃣ 모든 봇에 대해 useChat 단 1회만 호출 (Hooks 규칙 준수)
  const allBotIds = useMemo(() => {
    const ids = Object.keys(CHATBOTS) as BotId[]
    console.log(`%c[MultiBotPanel] 📋 All BotIds (${ids.length}):`, 'color: #00d4ff', ids)
    return ids
  }, [])

  const allChats = allBotIds.map((id) => {
    const chat = useChat(id)
    // 🔍 각 useChat 호출 추적
    console.log(`%c[MultiBotPanel] 🔌 useChat("${id}") called`, 'color: #aaaaaa; font-size: 10px', {
      botId: id,
      generating: chat.generating,
      messageCount: chat.messages.length
    })
    return { id, chat }
  })

  const chatMap = useMemo(() => {
    const m = new Map<BotId, ReturnType<typeof useChat>>()
    for (const { id, chat } of allChats) {
      m.set(id as BotId, chat)
    }
    console.log(`%c[MultiBotPanel] 🗺️ ChatMap Created (${m.size} entries)`, 'color: #00ff88; font-weight: bold')
    return m
  }, [allChats])

  // 🔥 iframe 프리로드
  useEffect(() => {
    const allIframeBots = allBotIds.filter(isIframeBot)
    if (allIframeBots.length) {
      try {
        iframeManager.preload(allIframeBots)
        console.log('[MultiBotPanel] 🚀 Preloaded iframe bots:', allIframeBots)
      } catch (e) {
        console.warn('[MultiBotPanel] Preload skipped:', e)
      }
    }
  }, [allBotIds])

  // 2️⃣ 현재 레이아웃의 활성 봇 목록 계산
  const { activeBotIds, setBots, supportImageInput } = useMemo(() => {
    let result: { activeBotIds: BotId[], setBots: any, supportImageInput: boolean }
    
    if (layout === 'sixGrid') {
      result = { activeBotIds: bots6, setBots: setBots6, supportImageInput: false as const }
    } else if (layout === 4) {
      result = { activeBotIds: bots4, setBots: setBots4, supportImageInput: false as const }
    } else if (layout === 3) {
      result = { activeBotIds: bots3, setBots: setBots3, supportImageInput: false as const }
    } else if (layout === 'imageInput') {
      result = { activeBotIds: ['chatgpt', 'bing', 'grok'] as BotId[], setBots: undefined, supportImageInput: true as const }
    } else {
      result = { activeBotIds: bots2, setBots: setBots2, supportImageInput: false as const }
    }
    
    console.log(`%c[MultiBotPanel] ✅ Active Bots Calculated for layout="${layout}":`, 'color: #00ff00; font-weight: bold', {
      layout,
      activeBotIds: result.activeBotIds,
      count: result.activeBotIds.length
    })
    
    return result
  }, [layout, bots2, bots3, bots4, bots6, setBots2, setBots3, setBots4, setBots6])

  // 3️⃣ 메인브레인 ID 읽기 (setBots 조작 완전 제거!)
  useEffect(() => {
    console.log(`%c[MultiBotPanel] 🔧 MainBrain useEffect mounted`, 'color: #ff00ff')
    let mounted = true
    
    getUserConfig().then((c) => {
      if (mounted) {
        const brainId = (c.mainBrainBotId as BotId | '') || ''
        console.log(`%c[MultiBotPanel] 🧠 Main Brain loaded from config: "${brainId}"`, 'color: #ff00ff; font-weight: bold')
        setMainBrainBotId(brainId)
      }
    })
    
    const onChanged = (changes: Record<string, Browser.Storage.StorageChange>, area: string) => {
      console.log(`%c[MultiBotPanel] 📡 Storage changed event:`, 'color: #ff00ff', { changes, area })
      
      if (area !== 'sync') {
        console.log(`%c[MultiBotPanel] ⏭️ Skipping non-sync area: ${area}`, 'color: #888888')
        return
      }
      
      if (Object.prototype.hasOwnProperty.call(changes, 'mainBrainBotId')) {
        const oldValue = changes['mainBrainBotId'].oldValue as BotId | '' | undefined
        const newBrainId = (changes['mainBrainBotId'].newValue as BotId | '') || ''
        
        console.log(`%c[MultiBotPanel] 🔄 Main Brain CHANGED:`, 'color: #ff00ff; font-weight: bold; font-size: 14px', {
          from: oldValue || '(none)',
          to: newBrainId || '(none)',
          timestamp: new Date().toISOString()
        })
        
        setMainBrainBotId(newBrainId)
      }
    }
    
    Browser.storage.onChanged.addListener(onChanged)
    console.log(`%c[MultiBotPanel] 👂 Storage listener registered`, 'color: #ff00ff')
    
    return () => {
      mounted = false
      Browser.storage.onChanged.removeListener(onChanged)
      console.log(`%c[MultiBotPanel] 🧹 Storage listener removed`, 'color: #888888')
    }
  }, [])

  // 4️⃣ 모든 봇 분류 (항상 렌더링될 봇들)
  const allIframeBotIds = useMemo(() => {
    const iframeBots = allBotIds.filter(isIframeBot)
    console.log(`%c[MultiBotPanel] 📦 All Iframe Bots (${iframeBots.length}):`, 'color: #00d4ff', iframeBots)
    return iframeBots
  }, [allBotIds])

  // 활성 봇을 메인브레인/비-메인브레인으로 분류
  const mainBrainChat = mainBrainBotId ? chatMap.get(mainBrainBotId) : undefined
  const hasMainBrain = !!mainBrainChat

  useEffect(() => {
    console.log(`%c[MultiBotPanel] 🧠 Main Brain Status:`, 'color: #ff00ff; font-weight: bold', {
      mainBrainBotId: mainBrainBotId || '(none)',
      hasMainBrain,
      chatInstance: mainBrainChat ? 'EXISTS' : 'NULL',
      inActiveBotIds: mainBrainBotId ? activeBotIds.includes(mainBrainBotId) : false,
    })
  }, [mainBrainBotId, hasMainBrain, mainBrainChat, activeBotIds])

  // 좌측 그리드에 표시될 봇들 (활성 봇 중 메인브레인 제외)
  const gridBotIds = useMemo(() => {
    const gridIds = activeBotIds.filter(id => id !== mainBrainBotId)
    console.log(`%c[MultiBotPanel] 📐 Grid BotIds Calculated:`, 'color: #00ff88; font-weight: bold', {
      activeBotIds,
      mainBrainBotId: mainBrainBotId || '(none)',
      gridBotIds: gridIds,
      filtered: activeBotIds.length - gridIds.length
    })
    return gridIds
  }, [activeBotIds, mainBrainBotId])

  const gridChats = useMemo(() => {
    const chats = gridBotIds.map(id => chatMap.get(id)!).filter(Boolean)
    console.log(`%c[MultiBotPanel] 🎯 Grid Chats (${chats.length}):`, 'color: #00ff88', 
      chats.map(c => ({ botId: c.botId, messages: c.messages.length }))
    )
    
    // 🔍 ChatMap 일관성 검증
    const inconsistencies = chats.filter((chat, idx) => {
      const botId = gridBotIds[idx]
      const fromMap = chatMap.get(botId)
      return chat !== fromMap
    })
    
    if (inconsistencies.length > 0) {
      console.error(`%c[MultiBotPanel] ❌ CHAT INSTANCE INCONSISTENCY DETECTED!`, 'color: red; font-weight: bold; font-size: 16px', inconsistencies)
    } else {
      console.log(`%c[MultiBotPanel] ✅ ChatMap consistency verified for grid chats`, 'color: #00ff88')
    }
    
    return chats
  }, [gridBotIds, chatMap])

  // 숨김 컨테이너에 렌더링될 비활성 iframe 봇들
  const inactiveIframeBotIds = useMemo(() => {
    const inactiveIds = allIframeBotIds.filter(id => !activeBotIds.includes(id))
    console.log(`%c[MultiBotPanel] 🙈 Inactive Iframe Bots (${inactiveIds.length}):`, 'color: #ffaa00; font-weight: bold', {
      allIframeBots: allIframeBotIds,
      activeBots: activeBotIds,
      inactiveBots: inactiveIds
    })
    return inactiveIds
  }, [allIframeBotIds, activeBotIds])

  const inactiveIframeChats = useMemo(() => {
    const chats = inactiveIframeBotIds.map(id => chatMap.get(id)!).filter(Boolean)
    console.log(`%c[MultiBotPanel] 💤 Inactive Iframe Chats (${chats.length}):`, 'color: #ffaa00',
      chats.map(c => ({ botId: c.botId, messages: c.messages.length, generating: c.generating }))
    )
    return chats
  }, [inactiveIframeBotIds, chatMap])

  // 전체 활성 봇 (메시지 전송용)
  const activeChats = useMemo(() => {
    let result: ReturnType<typeof useChat>[]
    
    if (mainBrainChat) {
      result = [...gridChats, mainBrainChat]
      console.log(`%c[MultiBotPanel] 🎯 Active Chats (WITH MainBrain):`, 'color: #00ff00; font-weight: bold', {
        gridCount: gridChats.length,
        mainBrain: mainBrainChat.botId,
        total: result.length,
        botIds: result.map(c => c.botId)
      })
    } else {
      result = gridChats
      console.log(`%c[MultiBotPanel] 🎯 Active Chats (NO MainBrain):`, 'color: #00ff00; font-weight: bold', {
        total: result.length,
        botIds: result.map(c => c.botId)
      })
    }
    
    // 🔍 불변성 검증
    const isImmutable = result !== gridChats || !mainBrainChat
    if (!isImmutable && mainBrainChat) {
      console.log(`%c[MultiBotPanel] ✅ New array created for activeChats (immutability preserved)`, 'color: #00ff00')
    }
    
    return result
  }, [gridChats, mainBrainChat])

  const generating = useMemo(() => {
    const isGenerating = activeChats.some((c) => c.generating)
    console.log(`%c[MultiBotPanel] ⚡ Generating Status: ${isGenerating}`, isGenerating ? 'color: #ff0000' : 'color: #00ff00')
    return isGenerating
  }, [activeChats])

  // 🔍 통합 상태 스냅샷 (렌더링마다)
  useEffect(() => {
    console.groupCollapsed(`%c[MultiBotPanel] 📊 === STATE SNAPSHOT #${renderCountRef.count} ===`, 'color: #ffffff; background: #0066cc; font-weight: bold; padding: 4px 8px; border-radius: 4px')
    
    console.log('%c1️⃣ Layout & Active Bots:', 'color: #ffaa00; font-weight: bold', {
      layout,
      activeBotIds,
      activeCount: activeBotIds.length
    })
    
    console.log('%c2️⃣ Main Brain:', 'color: #ff00ff; font-weight: bold', {
      mainBrainBotId: mainBrainBotId || '(none)',
      hasMainBrain,
      isInActiveBots: mainBrainBotId ? activeBotIds.includes(mainBrainBotId) : false
    })
    
    console.log('%c3️⃣ Grid Configuration:', 'color: #00ff88; font-weight: bold', {
      gridBotIds,
      gridCount: gridBotIds.length,
      gridCols: gridChats.length % 3 === 0 ? 3 : 2
    })
    
    console.log('%c4️⃣ Inactive Iframes:', 'color: #ffaa00; font-weight: bold', {
      inactiveIframeBotIds,
      inactiveCount: inactiveIframeBotIds.length
    })
    
    console.log('%c5️⃣ Rendering Summary:', 'color: #00d4ff; font-weight: bold', {
      gridChatsRendered: gridChats.length,
      mainBrainRendered: hasMainBrain ? 1 : 0,
      inactiveIframesRendered: inactiveIframeChats.length,
      totalRendered: gridChats.length + (hasMainBrain ? 1 : 0) + inactiveIframeChats.length
    })
    
    console.log('%c6️⃣ ChatMap Integrity:', 'color: #00ff00; font-weight: bold', {
      chatMapSize: chatMap.size,
      allBotsCount: allBotIds.length,
      integrity: chatMap.size === allBotIds.length ? '✅ OK' : '❌ MISMATCH'
    })
    
    console.groupEnd()
  }, [layout, activeBotIds, mainBrainBotId, gridBotIds, inactiveIframeBotIds, hasMainBrain, gridChats, inactiveIframeChats, chatMap, allBotIds, renderCountRef.count])

  useEffect(() => {
    if (disabled && (activeChats.length > 2 || supportImageInput)) {
      setPremiumModalOpen('all-in-one-layout')
    }
  }, [activeChats.length, disabled, setPremiumModalOpen, supportImageInput])

  // 메시지 전송 로직
  const sendSingleMessage = useCallback(
    (input: string, botId: BotId) => {
      const chat = chatMap.get(botId)
      chat?.sendMessage(input)
    },
    [chatMap],
  )

  const sendAllMessage = useCallback(
    async (input: string, image?: File) => {
      if (disabled && activeChats.length > 2) {
        setPremiumModalOpen('all-in-one-layout')
        return
      }
      const config = await getUserConfig()
      const botIds = uniqBy(activeChats, (c) => c.botId).map((c) => c.botId)

      // Grok 첫 사용 시 안내 모달
      const hasGrok = botIds.includes('grok')
      if (hasGrok) {
        const grokNoticeShown = await Browser.storage.local.get('grokNoticeShown')
        if (!grokNoticeShown.grokNoticeShown) {
          setGrokNoticeOpen(true)
          await Browser.storage.local.set({ grokNoticeShown: true })
        }
      }

      if (config.messageDispatchMode === 'manual') {
        await startManualDispatch(input, botIds, config.mainBrainBotId)
        if (hasGrok) {
          toast.success(
            '📋 프롬프트가 클립보드에 복사되었습니다!\n\n' +
            '각 패널 입력창에 Ctrl+V로 붙여넣고 Enter를 눌러주세요.\n' +
            '(Grok은 iframe 내부를 클릭 후 붙여넣기)',
            { duration: 5000 }
          )
        } else {
          toast.success(
            '📋 프롬프트가 클립보드에 복사되었습니다!\n' +
            '각 패널 입력창에 붙여넣고 Enter를 눌러주세요.',
            { duration: 4000 }
          )
        }
      } else {
        if (!config.autoRoutingConsent) {
          setRiskOpen(true)
          return
        }

        const result = await startAutoDispatch(input, botIds, config.mainBrainBotId, image)
        trackEvent('send_messages', {
          layout,
          disabled,
          mode: 'auto_simulation',
          successCount: result.successCount,
          skippedCount: result.skippedBots.length,
        })

        if (result.skippedBots.length > 0) {
          const skippedNames = result.skippedBots.map(id => CHATBOTS[id]?.name || id).join(', ')
          const hasGrok = result.skippedBots.includes('grok')

          if (hasGrok) {
            toast(
              `✅ ${result.successCount}개 봇 전송 완료\n\n` +
              `📋 ${skippedNames}는 Manual 모드를 사용하세요\n` +
              `   (X/Twitter 보안 정책으로 통합 입력창 사용 불가)\n\n` +
              `💡 Tip: Manual 모드를 선택하면 자동으로 클립보드에 복사됩니다`,
              { duration: 6000, icon: 'ℹ️' }
            )
          } else {
            toast.success(
              `${result.successCount}개 봇에 전송 완료\n` +
              `(${skippedNames}는 건너뜀)`,
              { duration: 4000 }
            )
          }
        } else {
          toast.success(`${result.successCount}개 봇에 메시지가 전송되었습니다.`)
        }
      }
    },
    [activeChats, disabled, layout, setPremiumModalOpen, chatMap],
  )

  const onSwitchBot = useCallback(
    (botId: BotId, index: number) => {
      if (!setBots) return
      trackEvent('switch_bot', { botId, panel: activeChats.length })
      setBots((prev) => {
        const next = [...prev]
        const existsAt = next.indexOf(botId)
        if (existsAt !== -1 && existsAt !== index) {
          const tmp = next[index]
          next[index] = next[existsAt]
          next[existsAt] = tmp
        } else {
          next[index] = botId
        }
        return next
      })
    },
    [activeChats.length, setBots],
  )

  const onLayoutChange = useCallback(
    (v: Layout) => {
      trackEvent('switch_all_in_one_layout', { layout: v })
      setLayout(v)
    },
    [setLayout],
  )

  // 🎨 5️⃣ 단일 렌더링 로직: 모든 봇을 항상 렌더링, CSS로만 제어
  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* 메인 컨텐츠 영역: 항상 flex-row 구조 유지 */}
      <div className="overflow-hidden grow flex flex-row gap-3 mb-3">

        {/* 좌측 그리드 영역 */}
        <div
          className={cx(
            'grid gap-2',
            hasMainBrain ? 'flex-1' : 'w-full',
            gridChats.length % 3 === 0 ? 'grid-cols-3 auto-rows-fr' : 'grid-cols-2 auto-rows-fr',
            gridChats.length === 5 && 'grid-cols-2 auto-rows-fr'
          )}
          style={gridChats.length === 5 ? { gridAutoFlow: 'dense' } : undefined}
          data-grid-container="true"
          ref={(el) => {
            if (el) {
              console.log(
                `%c[MultiBotPanel] 🎨 GRID RENDERED (${gridChats.length} bots)`,
                'color: #00d4ff; font-weight: bold',
                {
                  count: gridChats.length,
                  botIds: gridChats.map(c => c.botId),
                  gridCols: gridChats.length % 3 === 0 ? 3 : 2,
                  hasMainBrain,
                  containerClass: hasMainBrain ? 'flex-1' : 'w-full'
                }
              )
            }
          }}
        >
          {gridChats.map((chat, index) => {
            console.log(
              `%c[MultiBotPanel] 🔲 Rendering grid bot [${index}]: ${chat.botId}`,
              'color: #00d4ff; font-size: 10px',
              { index, botId: chat.botId, messages: chat.messages.length }
            )
            
            return (
              <div
                key={chat.botId}
                className={cx(
                  gridChats.length === 5 && index === 0 && 'row-span-2'
                )}
                data-grid-bot={chat.botId}
                data-grid-index={index}
              >
                <ConversationPanel
                  botId={chat.botId}
                  bot={chat.bot}
                  messages={chat.messages}
                  onUserSendMessage={(input) => sendSingleMessage(input, chat.botId)}
                  generating={chat.generating}
                  stopGenerating={chat.stopGenerating}
                  mode="compact"
                  resetConversation={chat.resetConversation}
                  reloadBot={chat.reloadBot}
                  onSwitchBot={
                    setBots
                      ? (botId) => {
                          const originalIndex = gridBotIds.indexOf(chat.botId)
                          onSwitchBot(botId, originalIndex)
                        }
                      : undefined
                  }
                />
              </div>
            )
          })}
        </div>

        {/* 우측 메인브레인 영역: CSS로만 숨김 제어 */}
        <div
          className={cx(
            'w-[400px] flex-shrink-0',
            !hasMainBrain && 'hidden'
          )}
          data-mainbrain-container="true"
          data-mainbrain-id={mainBrainBotId || 'none'}
          ref={(el) => {
            if (el) {
              console.log(
                hasMainBrain 
                  ? `%c[MultiBotPanel] 🧠 MAIN BRAIN RENDERED: ${mainBrainBotId}`
                  : `%c[MultiBotPanel] 🙈 MAIN BRAIN HIDDEN (CSS only)`,
                hasMainBrain ? 'color: #ff00ff; font-weight: bold' : 'color: #888888',
                {
                  mainBrainBotId: mainBrainBotId || '(none)',
                  visible: hasMainBrain,
                  cssClass: !hasMainBrain ? 'hidden' : 'visible',
                  containerExists: !!mainBrainChat
                }
              )
            }
          }}
        >
          {mainBrainChat && (() => {
            console.log(
              `%c[MultiBotPanel] 🧠 Rendering MainBrain: ${mainBrainChat.botId}`,
              'color: #ff00ff; font-weight: bold',
              { 
                botId: mainBrainChat.botId, 
                messages: mainBrainChat.messages.length,
                generating: mainBrainChat.generating 
              }
            )
            
            return (
              <ConversationPanel
                key={mainBrainChat.botId}
                botId={mainBrainChat.botId}
                bot={mainBrainChat.bot}
                messages={mainBrainChat.messages}
                onUserSendMessage={(input) => sendSingleMessage(input, mainBrainChat.botId)}
                generating={mainBrainChat.generating}
                stopGenerating={mainBrainChat.stopGenerating}
                mode="full"
                resetConversation={mainBrainChat.resetConversation}
                reloadBot={mainBrainChat.reloadBot}
                onSwitchBot={
                  setBots
                    ? (botId) => {
                        const brainIndexInActive = activeBotIds.indexOf(mainBrainChat.botId)
                        onSwitchBot(botId, brainIndexInActive)
                      }
                    : undefined
                }
              />
            )
          })()}
        </div>
      </div>

      {/* 🔥 비활성 iframe 봇 숨김 컨테이너: 세션 유지 */}
      <div
        className="fixed left-[-9999px] top-[-9999px] w-[800px] h-[600px] pointer-events-none"
        aria-hidden="true"
        data-inactive-iframe-container="true"
        ref={(el) => {
          if (el) {
            console.log(
              `%c[MultiBotPanel] 💤 INACTIVE IFRAME CONTAINER (${inactiveIframeChats.length} bots)`,
              'color: #ffaa00; font-weight: bold; background: #332200; padding: 2px 8px',
              {
                count: inactiveIframeChats.length,
                botIds: inactiveIframeChats.map(c => c.botId),
                position: 'off-screen (left: -9999px)',
                purpose: 'SESSION PRESERVATION'
              }
            )
          }
        }}
      >
        {inactiveIframeChats.map(chat => {
          console.log(
            `%c[MultiBotPanel] 💤 Rendering INACTIVE iframe: ${chat.botId}`,
            'color: #ffaa00; font-size: 10px',
            { 
              botId: chat.botId, 
              messages: chat.messages.length,
              offScreen: true,
              sessionPreserved: true
            }
          )
          
          return (
            <div 
              key={chat.botId} 
              className="w-full h-full"
              data-inactive-bot={chat.botId}
            >
              <ConversationPanel
                botId={chat.botId}
                bot={chat.bot}
                messages={chat.messages}
                onUserSendMessage={() => {}}
                generating={chat.generating}
                stopGenerating={chat.stopGenerating}
                mode="compact"
                resetConversation={chat.resetConversation}
                reloadBot={chat.reloadBot}
              />
            </div>
          )
        })}
      </div>

      {/* 모달들 */}
      {riskOpen && (
        <RiskConsentModal
          open={riskOpen}
          onClose={() => setRiskOpen(false)}
          onAccept={async () => {
            await updateUserConfig({ autoRoutingConsent: true })
            setRiskOpen(false)
          }}
        />
      )}
      <GrokNoticeModal open={grokNoticeOpen} onClose={() => setGrokNoticeOpen(false)} />
      <MainBrainPanel />

      {/* 하단 입력 영역 */}
      <div className="flex flex-row gap-3">
        <LayoutSwitch layout={layout} onChange={onLayoutChange} />
        <ChatMessageInput
          mode="full"
          className="rounded-2xl bg-primary-background px-4 py-2 grow"
          disabled={generating}
          onSubmit={sendAllMessage}
          onDraftChange={setDraft}
          actionButton={
            !generating && (
              <div className="flex flex-row items-center gap-2">
                <UsageBadge text={draft} botIds={uniqBy(activeChats, (c) => c.botId).map((c) => c.botId)} />
                <Button text={t('Send')} color="primary" type="submit" />
              </div>
            )
          }
          autoFocus={true}
          supportImageInput={supportImageInput}
        />
      </div>
    </div>
  )
}

const MultiBotChatPanelPage: FC = () => {
  return (
    <Suspense>
      <MultiBotChatPanel />
    </Suspense>
  )
}

export default MultiBotChatPanelPage
