import { motion } from 'framer-motion'
import { FC, ReactNode, useCallback, useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import clearIcon from '~/assets/icons/clear.svg'
import historyIcon from '~/assets/icons/history.svg'
import shareIcon from '~/assets/icons/share.svg'
import refreshIcon from '~/assets/icons/refresh.svg'
import { cx } from '~/utils'
import { CHATBOTS } from '~app/consts'
import { ConversationContext, ConversationContextValue } from '~app/context'
import { trackEvent } from '~app/plausible'
import { ChatMessageModel } from '~types'
import { BotId, BotInstance } from '../../bots'
import Button from '../Button'
import HistoryDialog from '../History/Dialog'
import ShareDialog from '../Share/Dialog'
import Tooltip from '../Tooltip'
import ChatMessageInput from './ChatMessageInput'
import ChatMessageList from './ChatMessageList'
import ChatbotName from './ChatbotName'
import WebAccessCheckbox from './WebAccessCheckbox'
import MainBrainToggle from '~app/components/MainBrain/Toggle'
import Browser from 'webextension-polyfill'
import { getUserConfig } from '~services/user-config'
import UsageBadge from '~app/components/Usage/Badge'
import GrokNoticeModal from '~app/components/Modals/GrokNoticeModal'
import LMArenaModelSelector from './LMArenaModelSelector'
import PersistentIframe from '~app/components/PersistentIframe'

interface Props {
  botId: BotId
  bot: BotInstance
  messages: ChatMessageModel[]
  onUserSendMessage: (input: string, image?: File) => void
  resetConversation: () => void
  reloadBot?: () => Promise<boolean>
  generating: boolean
  stopGenerating: () => void
  mode?: 'full' | 'compact'
  onSwitchBot?: (botId: BotId) => void
  className?: string
}

const ConversationPanel: FC<Props> = (props) => {
  const { t } = useTranslation()
  const botInfo = CHATBOTS[props.botId]
  const mode = props.mode || 'full'
  const marginClass = 'mx-5'

  // 🎨 mode에 따라 아이콘 크기 동적 설정
  const iconSize = mode === 'full' ? 'w-5 h-5' : 'w-4 h-4'
  const avatarSize = mode === 'full' ? 'w-5 h-5' : 'w-4 h-4'

  // 🛡️ 안전성 검증: botInfo가 없으면 에러 방지
  if (!botInfo) {
    console.error(`[ConversationPanel] ❌ Invalid botId: ${props.botId}`)
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Error: Invalid bot configuration
      </div>
    )
  }
  const [showHistory, setShowHistory] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showGrokNotice, setShowGrokNotice] = useState(false)
  const [isMainBrain, setIsMainBrain] = useState(false)

  // Grok 전용: 배율 조절 상태 (localStorage에서 불러오기)
  const [grokZoom, setGrokZoom] = useState(() => {
    try {
      const saved = localStorage.getItem('grok-zoom')
      return saved ? Number(saved) : 1.25
    } catch {
      return 1.25
    }
  })

  // observe mainBrain changes to highlight panel
  // ⚠️ CRITICAL: hooks는 항상 최상위에서 호출되어야 함 (조건문보다 먼저)
  useEffect(() => {
    let mounted = true
    getUserConfig().then((c) => mounted && setIsMainBrain(c.mainBrainBotId === props.botId))
    const onChanged = (changes: Record<string, Browser.Storage.StorageChange>, area: string) => {
      if (area !== 'sync') return
      if (Object.prototype.hasOwnProperty.call(changes, 'mainBrainBotId')) {
        setIsMainBrain(changes['mainBrainBotId'].newValue === props.botId)
      }
    }
    Browser.storage.onChanged.addListener(onChanged)
    return () => {
      mounted = false
      Browser.storage.onChanged.removeListener(onChanged)
    }
  }, [props.botId])

  const context: ConversationContextValue = useMemo(() => {
    return {
      reset: props.resetConversation,
    }
  }, [props.resetConversation])

  const onSubmit = useCallback(
    async (input: string, image?: File) => {
      // 개별 패널 입력은 항상 해당 봇으로 전송
      props.onUserSendMessage(input as string, image)
    },
    [props],
  )

  const resetConversation = useCallback(() => {
    if (!props.generating) {
      props.resetConversation()
    }
  }, [props])

  const openHistoryDialog = useCallback(() => {
    setShowHistory(true)
    trackEvent('open_history_dialog', { botId: props.botId })
  }, [props.botId])

  const openShareDialog = useCallback(() => {
    setShowShareDialog(true)
    trackEvent('open_share_dialog', { botId: props.botId })
  }, [props.botId])

  const [draft, setDraft] = useState('')
  let inputActionButton: ReactNode = null
  if (props.generating) {
    inputActionButton = (
      <Button text={t('Stop')} color="flat" size={mode === 'full' ? 'normal' : 'tiny'} onClick={props.stopGenerating} />
    )
  } else if (mode === 'full') {
    inputActionButton = (
      <div className="flex flex-row items-center gap-[10px] shrink-0">
        <UsageBadge text={draft} botIds={[props.botId]} />
        <Button text={t('Send')} color="primary" type="submit" />
      </div>
    )
  }

  // LM Arena 전용: 배율 조절 상태
  const [lmarenaZoom, setLmarenaZoom] = useState(() => {
    try {
      const saved = localStorage.getItem('lmarena-zoom')
      return saved ? Number(saved) : 1.0
    } catch {
      return 1.0
    }
  })

  // Qwen 전용: 배율 조절 상태 (localStorage에서 불러오기)
  const [qwenZoom, setQwenZoom] = useState(() => {
    try {
      const saved = localStorage.getItem('qwen-zoom')
      return saved ? Number(saved) : 1.0
    } catch {
      return 1.0
    }
  })

  // ChatGPT 전용: 배율 조절 상태
  const [chatgptZoom, setChatgptZoom] = useState(() => {
    try {
      const saved = localStorage.getItem('chatgpt-zoom')
      return saved ? Number(saved) : 1.0
    } catch {
      return 1.0
    }
  })

  // Grok 전용: 자동 라우팅 모드일 때만 모달 표시
  useEffect(() => {
    if (props.botId !== 'grok') return
    
    let mounted = true
    getUserConfig().then((config) => {
      if (mounted && config.messageDispatchMode === 'auto') {
        // 자동 라우팅 모드에서 Grok 사용 시 안내 모달 표시
        Browser.storage.local.get('grokNoticeShown').then((result) => {
          if (mounted && !result.grokNoticeShown) {
            console.log('[GROK-PANEL] ⚠️ Auto routing mode - showing notice modal')
            setShowGrokNotice(true)
            Browser.storage.local.set({ grokNoticeShown: true })
          }
        })
      }
    })
    return () => { mounted = false }
  }, [props.botId])
  
  // iframe 기반 모델 여부 확인
  const isIframeBot = ['chatgpt', 'qwen', 'grok', 'lmarena'].includes(props.botId)
  
  // 디버깅 로그
  useEffect(() => {
    console.log('[ConversationPanel] 🎯 Render State:', {
      botId: props.botId,
      mode,
      isIframeBot,
      isMainBrain,
    })
  }, [props.botId, mode, isIframeBot, isMainBrain])
  
  // iframe URL 결정
  const getIframeUrl = () => {
    switch (props.botId) {
      case 'chatgpt':
        return 'https://chat.openai.com'
      case 'qwen':
        return 'https://chat.qwen.ai'
      case 'grok':
        return 'https://grok.com'
      case 'lmarena':
        return 'https://lmarena.ai/c/new?mode=direct'
      default:
        return ''
    }
  }

  // iframe 배율 상태
  const getZoomState = () => {
    switch (props.botId) {
      case 'chatgpt':
        return [chatgptZoom, setChatgptZoom, 'chatgpt-zoom', 1.0] as const
      case 'qwen':
        return [qwenZoom, setQwenZoom, 'qwen-zoom', 1.0] as const
      case 'grok':
        return [grokZoom, setGrokZoom, 'grok-zoom', 1.25] as const
      case 'lmarena':
        return [lmarenaZoom, setLmarenaZoom, 'lmarena-zoom', 1.0] as const
      default:
        return [1.0, () => {}, '', 1.0] as const
    }
  }

  // iframe 렌더링
  if (isIframeBot) {
    const [zoom, setZoom, storageKey, defaultZoom] = getZoomState()
    const iframeUrl = getIframeUrl()
    const maxZoom = props.botId === 'grok' ? 3.0 : 2.0

    console.log('[ConversationPanel] 👑 Rendering iframe bot:', {
      botId: props.botId,
      mode,
      isMainBrain,
      hasToggle: true,
    })

    return (
      <ConversationContext.Provider value={context}>
        <div className={cx('flex flex-col overflow-hidden bg-primary-background h-full rounded-[20px]', isMainBrain && 'ring-2 ring-amber-400', props.className)}>
          {/* 헤더 */}
          <div className={cx('flex flex-row items-center justify-between border-b border-solid border-primary-border', mode === 'full' ? 'py-3 mx-5' : 'py-[10px] mx-3')}>
            {/* 왼쪽: 타이틀 + 왕관 */}
            <div className="flex flex-row items-center gap-2">
              <img src={botInfo.avatar} className={cx(avatarSize, 'object-contain rounded-full')} />
              <ChatbotName botId={props.botId} name={botInfo.name} onSwitchBot={props.onSwitchBot} />
              {mode === 'compact' && (
                <div className="inline-block">
                  <MainBrainToggle botId={props.botId} />
                </div>
              )}
            </div>

            {/* 중앙: full 모드일 때 왕관 */}
            {mode === 'full' && (
              <div className="flex flex-row items-center gap-2">
                <MainBrainToggle botId={props.botId} />
              </div>
            )}

            {/* 오른쪽: 배율 조절 */}
            <div className="flex flex-row items-center gap-2">
              <span className="text-[10px] text-light-text whitespace-nowrap">배율</span>
              <input
                type="range"
                min="0.5"
                max={maxZoom}
                step="0.05"
                value={zoom}
                onChange={(e) => {
                  const newZoom = Number(e.target.value)
                  setZoom(newZoom)
                  localStorage.setItem(storageKey, String(newZoom))
                }}
                className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                style={{ accentColor: '#10a37f' }}
                title="드래그하여 배율 조절"
              />
              <input
                type="text"
                value={Math.round(zoom * 100)}
                onChange={(e) => {
                  const sanitized = e.target.value.replace(/[^\d]/g, '')
                  if (sanitized === '') return
                  const numValue = Math.max(50, Math.min(maxZoom * 100, parseInt(sanitized, 10)))
                  const newZoom = numValue / 100
                  setZoom(newZoom)
                  localStorage.setItem(storageKey, String(newZoom))
                }}
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    setZoom(defaultZoom)
                    localStorage.setItem(storageKey, String(defaultZoom))
                  }
                }}
                className="w-12 px-1.5 py-0.5 text-[10px] text-center border border-primary-border rounded bg-secondary text-primary-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="100"
                title={`직접 입력 (50-${maxZoom * 100})`}
                maxLength={3}
                pattern="[0-9]*"
                inputMode="numeric"
              />
              <span className="text-[10px] text-light-text">%</span>
            </div>
          </div>

          {/* iframe 내장 */}
          <div className="flex-1 relative overflow-auto">
            <PersistentIframe
              botId={props.botId}
              src={iframeUrl}
              zoom={zoom}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
              allow="clipboard-read; clipboard-write"
              title={`${botInfo.name} Chat`}
            />
          </div>

          {/* Grok 안내 모달 */}
          {props.botId === 'grok' && showGrokNotice && (
            <GrokNoticeModal open={showGrokNotice} onClose={() => setShowGrokNotice(false)} />
          )}
        </div>
      </ConversationContext.Provider>
    )
  }


  return (
    <ConversationContext.Provider value={context}>
      <div className={cx('flex flex-col overflow-hidden bg-primary-background h-full rounded-2xl', isMainBrain && 'ring-2 ring-amber-400', props.className)}>
        <div
          className={cx(
            'border-b border-solid border-primary-border flex flex-row items-center justify-between gap-2 py-[10px]',
            marginClass,
          )}
        >
          <div className="flex flex-row items-center gap-2">
            <motion.img
              src={botInfo.avatar}
              className={cx(avatarSize, 'object-contain rounded-sm')}
              whileHover={{ rotate: 180 }}
            />
            <ChatbotName
              botId={props.botId}
              name={botInfo.name}
              fullName={props.bot.name}
              onSwitchBot={mode === 'compact' ? props.onSwitchBot : undefined}
            />
            {/* 올인원 모드에서만 왕관 이모지 표시 */}
            {mode === 'compact' && <MainBrainToggle botId={props.botId} />}
            {/* LMArena 모델 선택 드롭다운 */}
            {props.botId === 'lmarena' && (
              <LMArenaModelSelector botId={props.botId} bot={props.bot} />
            )}
          </div>
          <div className="flex flex-row items-center gap-2">
            {mode === 'full' && <MainBrainToggle botId={props.botId} />}
          <WebAccessCheckbox botId={props.botId} />
          </div>
          <div className="flex flex-row items-center gap-2">
            {/* 초기화 버튼 - 가장 자주 사용 */}
            <Tooltip content={t('Clear conversation')}>
              <motion.img
                src={clearIcon}
                className={cx(iconSize, props.generating ? 'cursor-not-allowed' : 'cursor-pointer')}
                onClick={resetConversation}
                whileHover={{ scale: 1.1 }}
              />
            </Tooltip>
            {/* 🔄 새로고침 버튼 (로그인 후 세션 갱신용) */}
            {props.reloadBot && (
              <Tooltip content="세션 새로고침 (로그인 후 사용)">
                <motion.img
                  src={refreshIcon}
                  className={cx(iconSize, props.generating ? 'cursor-not-allowed' : 'cursor-pointer')}
                  onClick={async () => {
                    if (!props.generating && props.reloadBot) {
                      try {
                        await props.reloadBot()
                        console.log('[ConversationPanel] ✅ Bot reloaded')
                      } catch (error) {
                        console.error('[ConversationPanel] ❌ Reload failed:', error)
                      }
                    }
                  }}
                  whileHover={{ scale: 1.15, rotate: 360 }}
                  transition={{ duration: 0.5 }}
                />
              </Tooltip>
            )}
            {/* 히스토리 버튼 */}
            <Tooltip content={t('View history')}>
              <motion.img
                src={historyIcon}
                className={cx(iconSize, 'cursor-pointer')}
                onClick={openHistoryDialog}
                whileHover={{ scale: 1.1 }}
              />
            </Tooltip>
            {/* 공유 버튼 - 마지막 */}
            <Tooltip content={t('Share conversation')}>
              <motion.img
                src={shareIcon}
                className={cx(iconSize, 'cursor-pointer')}
                onClick={openShareDialog}
                whileHover={{ scale: 1.1 }}
              />
            </Tooltip>
          </div>
        </div>
        <ChatMessageList botId={props.botId} messages={props.messages} className={marginClass} />
        <div className={cx('mt-3 flex flex-col ', marginClass, mode === 'full' ? 'mb-3' : 'mb-[5px]')}>
          <div className={cx('flex flex-row items-center gap-[5px]', mode === 'full' ? 'mb-3' : 'mb-0')}>
            {mode === 'compact' && (
              <span className="font-medium text-xs text-light-text cursor-default">Send to {botInfo.name}</span>
            )}
            <hr className="grow border-primary-border" />
          </div>
          <ChatMessageInput
            mode={mode}
            disabled={props.generating}
            placeholder={mode === 'compact' ? '' : undefined}
            onSubmit={onSubmit}
            autoFocus={mode === 'full'}
            supportImageInput={mode === 'full' && props.bot.supportsImageInput}
            botId={props.botId}
            onDraftChange={setDraft}
            actionButton={inputActionButton}
          />
        </div>
      </div>
      {showShareDialog && (
        <ShareDialog open={true} onClose={() => setShowShareDialog(false)} messages={props.messages} />
      )}
      {showHistory && <HistoryDialog botId={props.botId} open={true} onClose={() => setShowHistory(false)} />}
    </ConversationContext.Provider>
  )
}

export default ConversationPanel
