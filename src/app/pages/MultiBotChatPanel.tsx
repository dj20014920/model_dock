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

const GeneralChatPanel: FC<{
  chats: ReturnType<typeof useChat>[]
  setBots?: ReturnType<typeof useSetAtom<typeof twoPanelBotsAtom>>
  supportImageInput?: boolean
}> = ({ chats, setBots, supportImageInput }) => {
  const { t } = useTranslation()
  const generating = useMemo(() => chats.some((c) => c.generating), [chats])
  const [layout, setLayout] = useAtom(layoutAtom)

  const [riskOpen, setRiskOpen] = useState(false)
  const [grokNoticeOpen, setGrokNoticeOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const setPremiumModalOpen = useSetAtom(showPremiumModalAtom)
  const premiumState = usePremium()
  const disabled = useMemo(() => !premiumState.isLoading && !premiumState.activated, [premiumState])

  useEffect(() => {
    if (disabled && (chats.length > 2 || supportImageInput)) {
      setPremiumModalOpen('all-in-one-layout')
    }
  }, [chats.length, disabled, setPremiumModalOpen, supportImageInput])

  const sendSingleMessage = useCallback(
    (input: string, botId: BotId) => {
      const chat = chats.find((c) => c.botId === botId)
      chat?.sendMessage(input)
    },
    [chats],
  )

  const sendAllMessage = useCallback(
    async (input: string, image?: File) => {
      if (disabled && chats.length > 2) {
        setPremiumModalOpen('all-in-one-layout')
        return
      }
      const config = await getUserConfig()
      const botIds = uniqBy(chats, (c) => c.botId).map((c) => c.botId)
      
      // Grok 첫 사용 시 안내 모달 표시
      const hasGrok = botIds.includes('grok')
      if (hasGrok) {
        const grokNoticeShown = await Browser.storage.local.get('grokNoticeShown')
        console.log('🔍 Grok 안내 체크:', { 
          hasGrok, 
          alreadyShown: grokNoticeShown.grokNoticeShown,
          willShow: !grokNoticeShown.grokNoticeShown 
        })
        
        if (!grokNoticeShown.grokNoticeShown) {
          console.log('✅ Grok 안내 모달 표시!')
          setGrokNoticeOpen(true)
          await Browser.storage.local.set({ grokNoticeShown: true })
        } else {
          console.log('⏭️ Grok 안내 이미 표시됨 - 건너뜀')
        }
      }
      
      if (config.messageDispatchMode === 'manual') {
        // Manual 모드: 클립보드 복사 후 사용자가 직접 붙여넣기
        await startManualDispatch(input, botIds, config.mainBrainBotId)

        // Grok이 포함되어 있는지 확인
        const hasGrok = botIds.includes('grok')

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
        // Auto 모드
        if (!config.autoRoutingConsent) {
          setRiskOpen(true)
          return
        }
        
        // 개선된 Auto Routing: 사용자 입력처럼 보이도록 텍스트 복사-붙여넣기 시뮬레이션
        // 봇 감지 우회를 위해 실제 DOM에 값을 설정하고 이벤트를 발생시킴
        const result = await startAutoDispatch(input, botIds, config.mainBrainBotId, image)
        trackEvent('send_messages', { 
          layout, 
          disabled, 
          mode: 'auto_simulation',
          successCount: result.successCount,
          skippedCount: result.skippedBots.length,
        })
        
        // 결과 메시지 표시
        if (result.skippedBots.length > 0) {
          const skippedNames = result.skippedBots.map(id => CHATBOTS[id]?.name || id).join(', ')

          // Grok이 포함되어 있는지 확인
          const hasGrok = result.skippedBots.includes('grok')

          if (hasGrok) {
            toast(
              `✅ ${result.successCount}개 봇 전송 완료\n\n` +
              `📋 ${skippedNames}는 Manual 모드를 사용하세요\n` +
              `   (X/Twitter 보안 정책으로 통합 입력창 사용 불가)\n\n` +
              `💡 Tip: Manual 모드를 선택하면 자동으로 클립보드에 복사됩니다`,
              {
                duration: 6000,
                icon: 'ℹ️'
              }
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
    [chats, disabled, layout, setPremiumModalOpen],
  )

  const onSwitchBot = useCallback(
    (botId: BotId, index: number) => {
      if (!setBots) {
        return
      }
      trackEvent('switch_bot', { botId, panel: chats.length })
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
      trackEvent('switch_all_in_one_layout', { layout: v })
      setLayout(v)
    },
    [setLayout],
  )

  // 메인 브레인 상태 추적
  const [mainBrainBotId, setMainBrainBotId] = useState<BotId | ''>('')
  const [previousMainBrainId, setPreviousMainBrainId] = useState<BotId | ''>('')

  useEffect(() => {
    let mounted = true
    getUserConfig().then((c) => {
      if (mounted) {
        const brainId = (c.mainBrainBotId as BotId | '') || ''
        setMainBrainBotId(brainId)
        setPreviousMainBrainId(brainId)
        console.log('[MultiBotPanel] 🧠 Main Brain loaded:', brainId)
      }
    })
    const onChanged = (changes: Record<string, Browser.Storage.StorageChange>, area: string) => {
      if (area !== 'sync') return
      if (Object.prototype.hasOwnProperty.call(changes, 'mainBrainBotId')) {
        const oldBrainId = (changes['mainBrainBotId'].oldValue as BotId | '') || ''
        const newBrainId = (changes['mainBrainBotId'].newValue as BotId | '') || ''
        
        console.log('[MultiBotPanel] 🔄 Main Brain swap:', { from: oldBrainId, to: newBrainId })
        
        // 봇 스왑 로직 (완전 동기화)
        if (setBots && newBrainId) {
          setBots((currentBots) => {
            const newBots = [...currentBots]
            const newBrainIndex = newBots.indexOf(newBrainId)
            
            console.log('[MultiBotPanel] 📊 Swap state:', {
              currentBots,
              oldBrainId,
              newBrainId,
              newBrainIndex,
              hasOldBrain: !!oldBrainId,
            })
            
            // Case 1: 이전 메인 브레인이 있고, 새 메인 브레인이 그리드에 있음 → 스왑
            if (oldBrainId && newBrainIndex !== -1) {
              console.log('[MultiBotPanel] ↔️ Swapping bots at index:', newBrainIndex)
              newBots[newBrainIndex] = oldBrainId
            }
            // Case 2: 이전 메인 브레인이 없고, 새 메인 브레인이 그리드에 있음 → 그리드에서 제거
            else if (!oldBrainId && newBrainIndex !== -1) {
              console.log('[MultiBotPanel] 🎯 First time main brain from grid')
              // 그리드에서 제거하고 랜덤 봇으로 교체
              const availableBots = (Object.keys(CHATBOTS) as BotId[]).filter(
                (id) => !newBots.includes(id) && id !== newBrainId
              )
              const randomBot = availableBots.length > 0 ? availableBots[0] : 'bing'
              newBots[newBrainIndex] = randomBot
              console.log('[MultiBotPanel] 🔄 Replaced with:', randomBot)
            }
            // Case 3: 새 메인 브레인이 그리드에 없음 → 그리드 유지
            else {
              console.log('[MultiBotPanel] ✨ New brain not in grid, keeping grid unchanged')
            }
            
            console.log('[MultiBotPanel] ✅ Final bots:', newBots)
            return newBots
          })
        }
        
        setPreviousMainBrainId(oldBrainId)
        setMainBrainBotId(newBrainId)
        console.log('[MultiBotPanel] ✅ Main Brain changed:', newBrainId)
      }
    }
    Browser.storage.onChanged.addListener(onChanged)
    return () => {
      mounted = false
      Browser.storage.onChanged.removeListener(onChanged)
    }
  }, [setBots])

  // 메인 브레인이 현재 chats에 포함되어 있는지 확인
  const mainBrainChat = useMemo(
    () => chats.find((c) => c.botId === mainBrainBotId),
    [chats, mainBrainBotId],
  )
  const otherChats = useMemo(
    () => chats.filter((c) => c.botId !== mainBrainBotId),
    [chats, mainBrainBotId],
  )

  // 메인 브레인이 있을 때 레이아웃 변경
  const hasMainBrain = !!mainBrainChat

  // 디버깅 로그
  useEffect(() => {
    console.log('[MultiBotPanel] 📊 Layout State:', {
      mainBrainBotId,
      hasMainBrain,
      mainBrainChat: mainBrainChat?.botId,
      otherChatsCount: otherChats.length,
      totalChats: chats.length,
    })
  }, [mainBrainBotId, hasMainBrain, mainBrainChat, otherChats.length, chats.length])

  return (
    <div className="flex flex-col overflow-hidden h-full">
      <div
        className={cx(
          'overflow-hidden grow',
          hasMainBrain ? 'flex flex-row gap-3 mb-3' : 'grid auto-rows-fr',
          !hasMainBrain && (chats.length % 3 === 0 ? 'grid-cols-3' : 'grid-cols-2'),
          !hasMainBrain && (chats.length > 3 ? 'gap-2 mb-2' : 'gap-3 mb-3'),
        )}
      >
        {/* 메인 브레인이 없을 때: 기존 그리드 레이아웃 */}
        {!hasMainBrain &&
          chats.map((chat, index) => (
            <ConversationPanel
              key={`${chat.botId}-${index}`}
              botId={chat.botId}
              bot={chat.bot}
              messages={chat.messages}
              onUserSendMessage={(input) => sendSingleMessage(input, chat.botId)}
              generating={chat.generating}
              stopGenerating={chat.stopGenerating}
              mode="compact"
              resetConversation={chat.resetConversation}
              reloadBot={chat.reloadBot}
              onSwitchBot={setBots ? (botId) => onSwitchBot(botId, index) : undefined}
            />
          ))}

        {/* 메인 브레인이 있을 때: 좌측 그리드 + 우측 메인 브레인 */}
        {hasMainBrain && (
          <>
            {/* 좌측: 나머지 모델들 */}
            <div
              className={cx(
                'grid gap-2 flex-1',
                // 5개 남은 경우 (6개 중 1개가 메인 브레인): 2열 자동 배치 + dense로 빈 공간 채우기
                otherChats.length === 5
                  ? 'grid-cols-2 auto-rows-fr'
                  : otherChats.length === 1
                    ? 'grid-cols-1 auto-rows-fr'
                    : otherChats.length === 2
                      ? 'grid-cols-2 auto-rows-fr'
                      : otherChats.length === 3
                        ? 'grid-cols-3 auto-rows-fr'
                        : otherChats.length === 4
                          ? 'grid-cols-2 auto-rows-fr'
                          : 'grid-cols-2 auto-rows-fr',
              )}
              style={otherChats.length === 5 ? { gridAutoFlow: 'dense' } : undefined}
            >
              {otherChats.map((chat, index) => (
                <ConversationPanel
                  key={`${chat.botId}-${index}`}
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
                          const originalIndex = chats.findIndex((c) => c.botId === chat.botId)
                          onSwitchBot(botId, originalIndex)
                        }
                      : undefined
                  }
                  // 5개 남은 경우: 첫 번째 아이템만 row-span-2로 세로 전체 차지
                  className={
                    otherChats.length === 5 && index === 0 ? 'row-span-2' : undefined
                  }
                />
              ))}
            </div>

            {/* 우측: 메인 브레인 (세로 전체) */}
            <div className="w-[400px] flex-shrink-0">
              <ConversationPanel
                key={`main-brain-${mainBrainChat.botId}`}
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
                        const originalIndex = chats.findIndex((c) => c.botId === mainBrainChat.botId)
                        onSwitchBot(botId, originalIndex)
                      }
                    : undefined
                }
              />
            </div>
          </>
        )}
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
      <MainBrainPanel />
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
                <UsageBadge text={draft} botIds={uniqBy(chats, (c) => c.botId).map((c) => c.botId)} />
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

const TwoBotChatPanel = () => {
  const [bots, setBots] = useAtom(twoPanelBotsAtom)
  const multiPanelBotIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(multiPanelBotIds[0])
  const chat2 = useChat(multiPanelBotIds[1])
  const chats = useMemo(() => [chat1, chat2], [chat1, chat2])
  return <GeneralChatPanel chats={chats} setBots={setBots} />
}

const ThreeBotChatPanel = () => {
  const [bots, setBots] = useAtom(threePanelBotsAtom)
  const multiPanelBotIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(multiPanelBotIds[0])
  const chat2 = useChat(multiPanelBotIds[1])
  const chat3 = useChat(multiPanelBotIds[2])
  const chats = useMemo(() => [chat1, chat2, chat3], [chat1, chat2, chat3])
  return <GeneralChatPanel chats={chats} setBots={setBots} />
}

const FourBotChatPanel = () => {
  const [bots, setBots] = useAtom(fourPanelBotsAtom)
  const multiPanelBotIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(multiPanelBotIds[0])
  const chat2 = useChat(multiPanelBotIds[1])
  const chat3 = useChat(multiPanelBotIds[2])
  const chat4 = useChat(multiPanelBotIds[3])
  const chats = useMemo(() => [chat1, chat2, chat3, chat4], [chat1, chat2, chat3, chat4])
  return <GeneralChatPanel chats={chats} setBots={setBots} />
}

const SixBotChatPanel = () => {
  const [bots, setBots] = useAtom(sixPanelBotsAtom)
  const multiPanelBotIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(multiPanelBotIds[0])
  const chat2 = useChat(multiPanelBotIds[1])
  const chat3 = useChat(multiPanelBotIds[2])
  const chat4 = useChat(multiPanelBotIds[3])
  const chat5 = useChat(multiPanelBotIds[4])
  const chat6 = useChat(multiPanelBotIds[5])
  const chats = useMemo(() => [chat1, chat2, chat3, chat4, chat5, chat6], [chat1, chat2, chat3, chat4, chat5, chat6])
  return <GeneralChatPanel chats={chats} setBots={setBots} />
}

const ImageInputPanel = () => {
  const chat1 = useChat('chatgpt')
  const chat2 = useChat('bing')
  const chat3 = useChat('grok')
  const chats = useMemo(() => [chat1, chat2, chat3], [chat1, chat2, chat3])
  return <GeneralChatPanel chats={chats} supportImageInput={true} />
}

const MultiBotChatPanel: FC = () => {
  const layout = useAtomValue(layoutAtom)
  if (layout === 'sixGrid') {
    return <SixBotChatPanel />
  }
  if (layout === 4) {
    return <FourBotChatPanel />
  }
  if (layout === 3) {
    return <ThreeBotChatPanel />
  }
  if (layout === 'imageInput') {
    return <ImageInputPanel />
  }
  return <TwoBotChatPanel />
}

const MultiBotChatPanelPage: FC = () => {
  return (
    <Suspense>
      <MultiBotChatPanel />
    </Suspense>
  )
}

export default MultiBotChatPanelPage
