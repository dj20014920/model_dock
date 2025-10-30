import { useAtom, useAtomValue } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { sample, uniqBy } from 'lodash-es'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { cx } from '~/utils'
import Button from '~app/components/Button'
import ChatMessageInput from '~app/components/Chat/ChatMessageInput'
import LayoutSwitch from '~app/components/Chat/LayoutSwitch'
import ConversationPanel from '~app/components/Chat/ConversationPanel'
import RiskConsentModal from '~app/components/Modals/RiskConsentModal'
import GrokNoticeModal from '~app/components/Modals/GrokNoticeModal'
import UsageBadge from '~app/components/Usage/Badge'
import Browser from 'webextension-polyfill'
import { iframeManager } from '~app/services/iframe-manager'
import { isIframeBot } from '~app/bots/iframe-registry'
import { CHATBOTS, Layout } from '~app/consts'
import { useChat } from '~app/hooks/use-chat'
import { BotId } from '~app/bots'
import { getUserConfig, updateUserConfig } from '~services/user-config'
import { startManualDispatch, startAutoDispatch } from '~app/utils/manual-dispatch'
import { trackEvent } from '~app/plausible'

const DEFAULT_BOTS: BotId[] = Object.keys(CHATBOTS).slice(0, 4) as BotId[]

// 사이드패널 전용 레이아웃 및 봇 설정
const sidePanelLayoutAtom = atomWithStorage<Layout>('sidePanelLayout', 2, undefined, { getOnInit: true })
const sidePanelTwoBotsAtom = atomWithStorage<BotId[]>('sidePanelBots:2', DEFAULT_BOTS.slice(0, 2))
const sidePanelThreeBotsAtom = atomWithStorage<BotId[]>('sidePanelBots:3', DEFAULT_BOTS.slice(0, 3))
const sidePanelFourBotsAtom = atomWithStorage<BotId[]>('sidePanelBots:4', DEFAULT_BOTS.slice(0, 4))

function replaceDeprecatedBots(bots: BotId[]): BotId[] {
  return bots.map((bot) => {
    if (CHATBOTS[bot]) {
      return bot
    }
    return sample(DEFAULT_BOTS)!
  })
}

// 사이드패널용 컴팩트 멀티봇 패널
function SidePanelMultiBotPanel({
  chats,
  setBots,
}: {
  chats: ReturnType<typeof useChat>[]
  setBots?: (fn: (prev: BotId[]) => BotId[]) => void
}) {
  const { t } = useTranslation()
  const generating = useMemo(() => chats.some((c) => c.generating), [chats])
  const [layout, setLayout] = useAtom(sidePanelLayoutAtom)
  const [riskOpen, setRiskOpen] = useState(false)
  const [grokNoticeOpen, setGrokNoticeOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const sendSingleMessage = useCallback(
    (input: string, botId: BotId) => {
      const chat = chats.find((c) => c.botId === botId)
      chat?.sendMessage(input)
    },
    [chats],
  )

  const sendAllMessage = useCallback(
    async (input: string, image?: File) => {
      const config = await getUserConfig()
      const botIds = uniqBy(chats, (c) => c.botId).map((c) => c.botId)

      // Grok 첫 사용 시 안내 모달 표시
      const hasGrok = botIds.includes('grok')
      if (hasGrok) {
        const grokNoticeShown = await Browser.storage.local.get('grokNoticeShown')
        console.log('🔍 [SidePanel] Grok 안내 체크:', { 
          hasGrok, 
          alreadyShown: grokNoticeShown.grokNoticeShown,
          willShow: !grokNoticeShown.grokNoticeShown 
        })
        
        if (!grokNoticeShown.grokNoticeShown) {
          console.log('✅ [SidePanel] Grok 안내 모달 표시!')
          setGrokNoticeOpen(true)
          await Browser.storage.local.set({ grokNoticeShown: true })
        } else {
          console.log('⏭️ [SidePanel] Grok 안내 이미 표시됨 - 건너뜀')
        }
      }

      if (config.messageDispatchMode === 'manual') {
        await startManualDispatch(input, botIds, config.mainBrainBotId)
        const hasGrok = botIds.includes('grok')
        
        if (hasGrok) {
          toast.success(
            '📋 클립보드에 복사됨!\n각 패널에 붙여넣기\n(Grok은 iframe 클릭 후)',
            { duration: 4000 }
          )
        } else {
          toast.success('📋 클립보드에 복사됨!\n각 패널에 붙여넣기', { duration: 3000 })
        }
      } else {
        if (!config.autoRoutingConsent) {
          setRiskOpen(true)
          return
        }

        const result = await startAutoDispatch(input, botIds, config.mainBrainBotId, image)
        trackEvent('send_messages_sidepanel', {
          layout,
          mode: 'auto_simulation',
          successCount: result.successCount,
          skippedCount: result.skippedBots.length,
        })

        if (result.skippedBots.length > 0) {
          const skippedNames = result.skippedBots.map((id) => CHATBOTS[id]?.name || id).join(', ')
          const hasGrok = result.skippedBots.includes('grok')

          if (hasGrok) {
            toast(
              `✅ ${result.successCount}개 전송\n📋 ${skippedNames}는 Manual 모드 사용`,
              { duration: 5000, icon: 'ℹ️' }
            )
          } else {
            toast.success(`${result.successCount}개 전송 (${skippedNames} 건너뜀)`, { duration: 3000 })
          }
        } else {
          toast.success(`${result.successCount}개 봇에 전송 완료`)
        }
      }
    },
    [chats, layout],
  )

  const onSwitchBot = useCallback(
    (botId: BotId, index: number) => {
      if (!setBots) return
      trackEvent('switch_bot_sidepanel', { botId, panel: chats.length })
      setBots((bots) => {
        const newBots = [...bots]
        newBots[index] = botId
        return newBots
      })
    },
    [chats.length, setBots],
  )

  const onLayoutChange = useCallback(
    (v: Layout) => {
      // 사이드패널은 2, 3, 4 레이아웃만 지원
      if (v === 2 || v === 3 || v === 4) {
        trackEvent('switch_sidepanel_layout', { layout: v })
        setLayout(v)
      }
    },
    [setLayout],
  )

  return (
    <div className="flex flex-col overflow-hidden h-full bg-primary-background">
      <div
        className={cx(
          'grid overflow-hidden grow auto-rows-fr gap-2 mb-2',
          chats.length === 2 ? 'grid-cols-1' : chats.length === 3 ? 'grid-cols-1' : 'grid-cols-2',
        )}
      >
        {chats.map((chat, index) => {
          // 🛡️ 안전성 검증: chat 객체가 유효한지 확인
          if (!chat || !chat.botId || !chat.bot) {
            console.error('[SidePanelPage] ❌ Invalid chat object at index', index, chat)
            return null
          }

          return (
            <ConversationPanel
              key={`${chat.botId}-${index}`}
              botId={chat.botId}
              bot={chat.bot}
              messages={chat.messages || []}
              onUserSendMessage={(input) => sendSingleMessage(input, chat.botId)}
              generating={chat.generating || false}
              stopGenerating={chat.stopGenerating}
              mode="compact"
              resetConversation={chat.resetConversation}
              reloadBot={chat.reloadBot}
              onSwitchBot={setBots ? (botId) => onSwitchBot(botId, index) : undefined}
            />
          )
        })}
      </div>

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

      <div className="flex flex-col gap-2 px-2 pb-2">
        <LayoutSwitch
          layout={layout}
          onChange={onLayoutChange}
          // 사이드패널은 2, 3, 4만 지원
          availableLayouts={[2, 3, 4]}
        />
        <ChatMessageInput
          mode="compact"
          className="rounded-xl bg-secondary-background px-3 py-2"
          disabled={generating}
          onSubmit={sendAllMessage}
          onDraftChange={setDraft}
          actionButton={
            !generating && (
              <div className="flex flex-row items-center gap-2">
                <UsageBadge text={draft} botIds={uniqBy(chats, (c) => c.botId).map((c) => c.botId)} />
                <Button text={t('Send')} color="primary" type="submit" size="small" />
              </div>
            )
          }
          autoFocus={true}
        />
      </div>
    </div>
  )
}

// 2봇 패널
function TwoBotPanel() {
  const [bots, setBots] = useAtom(sidePanelTwoBotsAtom)
  const botIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(botIds[0])
  const chat2 = useChat(botIds[1])
  const chats = useMemo(() => [chat1, chat2], [chat1, chat2])
  return <SidePanelMultiBotPanel chats={chats} setBots={setBots} />
}

// 3봇 패널
function ThreeBotPanel() {
  const [bots, setBots] = useAtom(sidePanelThreeBotsAtom)
  const botIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(botIds[0])
  const chat2 = useChat(botIds[1])
  const chat3 = useChat(botIds[2])
  const chats = useMemo(() => [chat1, chat2, chat3], [chat1, chat2, chat3])
  return <SidePanelMultiBotPanel chats={chats} setBots={setBots} />
}

// 4봇 패널
function FourBotPanel() {
  const [bots, setBots] = useAtom(sidePanelFourBotsAtom)
  const botIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(botIds[0])
  const chat2 = useChat(botIds[1])
  const chat3 = useChat(botIds[2])
  const chat4 = useChat(botIds[3])
  const chats = useMemo(() => [chat1, chat2, chat3, chat4], [chat1, chat2, chat3, chat4])
  return <SidePanelMultiBotPanel chats={chats} setBots={setBots} />
}

function SidePanelPage() {
  const layout = useAtomValue(sidePanelLayoutAtom)
  const [bots2, setBots2] = useAtom(sidePanelTwoBotsAtom)
  const [bots3, setBots3] = useAtom(sidePanelThreeBotsAtom)
  const [bots4, setBots4] = useAtom(sidePanelFourBotsAtom)

  // 프리로드: 사이드패널에서도 현재 저장된 모든 레이아웃의 iframe 봇 미리 생성
  useEffect(() => {
    const union = Array.from(new Set([...(bots2||[]), ...(bots3||[]), ...(bots4||[])]))
      .filter((b): b is BotId => Boolean(b))
      .filter(isIframeBot)
    if (union.length) {
      try {
        iframeManager.preload(union)
        console.log('[SidePanel] 🚀 Preloaded iframe bots:', union)
      } catch (e) {
        console.warn('[SidePanel] Preload skipped:', e)
      }
    }
  }, [bots2, bots3, bots4])

  // 모든 지원 봇에 대해 고정 순서로 훅 호출하여 Hooks 규칙 보장
  const allBotIds = useMemo(() => Object.keys(CHATBOTS) as BotId[], [])
  const allChats = allBotIds.map((id) => ({ id, chat: useChat(id) }))

  const { activeBotIds, setBots } = useMemo(() => {
    if (layout === 4) {
      return { activeBotIds: bots4, setBots: (fn: (prev: BotId[]) => BotId[]) => setBots4(fn) }
    }
    if (layout === 3) {
      return { activeBotIds: bots3, setBots: (fn: (prev: BotId[]) => BotId[]) => setBots3(fn) }
    }
    return { activeBotIds: bots2, setBots: (fn: (prev: BotId[]) => BotId[]) => setBots2(fn) }
  }, [layout, bots2, bots3, bots4, setBots2, setBots3, setBots4])

  const chatMap = useMemo(() => {
    const m = new Map<BotId, ReturnType<typeof useChat>>()
    for (const { id, chat } of allChats) {
      m.set(id as BotId, chat)
    }
    return m
  }, [allChats])

  const chats = useMemo(() => activeBotIds.map((id) => chatMap.get(id)!).filter(Boolean), [activeBotIds, chatMap])

  return <SidePanelMultiBotPanel chats={chats} setBots={setBots} />
}

export default SidePanelPage
