import { motion } from 'framer-motion'
import { FC, ReactNode, useCallback, useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import clearIcon from '~/assets/icons/clear.svg'
import historyIcon from '~/assets/icons/history.svg'
import shareIcon from '~/assets/icons/share.svg'
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
import { startManualDispatch } from '~app/utils/manual-dispatch'
import toast from 'react-hot-toast'
import UsageBadge from '~app/components/Usage/Badge'

interface Props {
  botId: BotId
  bot: BotInstance
  messages: ChatMessageModel[]
  onUserSendMessage: (input: string, image?: File) => void
  resetConversation: () => void
  generating: boolean
  stopGenerating: () => void
  mode?: 'full' | 'compact'
  onSwitchBot?: (botId: BotId) => void
}

const ConversationPanel: FC<Props> = (props) => {
  const { t } = useTranslation()
  const botInfo = CHATBOTS[props.botId]
  const mode = props.mode || 'full'
  const marginClass = 'mx-5'
  const [showHistory, setShowHistory] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
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

  // Grok 전용 렌더링 (모든 hooks 호출 후에 처리)
  if (props.botId === 'grok') {
    return (
      <ConversationContext.Provider value={context}>
        <div className="flex flex-col overflow-hidden bg-primary-background h-full rounded-[20px]">
          {/* 헤더 */}
          <div className={cx('flex flex-row items-center justify-between border-b border-solid border-primary-border', mode === 'full' ? 'py-3 mx-5' : 'py-[10px] mx-3')}>
            {/* 왼쪽: 타이틀 */}
            <div className="flex flex-row items-center gap-2">
              <img src={botInfo.avatar} className="w-5 h-5 object-contain rounded-full" />
              <ChatbotName botId={props.botId} name={botInfo.name} onSwitchBot={props.onSwitchBot} />
            </div>

            {/* 오른쪽: 배율 조절 (슬라이더 + 텍스트 입력) */}
            <div className="flex flex-row items-center gap-2">
              <span className="text-[10px] text-light-text whitespace-nowrap">배율</span>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.05"
                value={grokZoom}
                onChange={(e) => {
                  const newZoom = Number(e.target.value)
                  setGrokZoom(newZoom)
                  localStorage.setItem('grok-zoom', String(newZoom))
                }}
                className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                style={{ accentColor: '#10a37f' }}
                title="드래그하여 배율 조절"
              />
              <input
                type="text"
                value={Math.round(grokZoom * 100)}
                onChange={(e) => {
                  // 입력값 정제: 숫자만 허용
                  const sanitized = e.target.value.replace(/[^\d]/g, '')
                  if (sanitized === '') return

                  // 범위 제한: 50 ~ 300
                  const numValue = Math.max(50, Math.min(300, parseInt(sanitized, 10)))
                  const newZoom = numValue / 100

                  setGrokZoom(newZoom)
                  localStorage.setItem('grok-zoom', String(newZoom))
                }}
                onBlur={(e) => {
                  // blur 시 빈 값이면 기본값으로 복원
                  if (!e.target.value.trim()) {
                    setGrokZoom(1.25)
                    localStorage.setItem('grok-zoom', '1.25')
                  }
                }}
                className="w-12 px-1.5 py-0.5 text-[10px] text-center border border-primary-border rounded bg-secondary text-primary-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="100"
                title="직접 입력 (50-300)"
                maxLength={3}
                pattern="[0-9]*"
                inputMode="numeric"
              />
              <span className="text-[10px] text-light-text">%</span>
            </div>
          </div>

          {/* Grok.com iframe 내장 - 동적 배율 조절 */}
          <div className="flex-1 relative overflow-auto">
            <iframe
              src="https://grok.com"
              className="w-full h-full border-0"
              style={{
                minHeight: '100%',
                minWidth: '100%',
                transform: `scale(${grokZoom})`,
                transformOrigin: 'top left',
                width: `${100 / grokZoom}%`,
                height: `${100 / grokZoom}%`
              }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
              allow="clipboard-read; clipboard-write"
              title="Grok Chat"
            />
          </div>
        </div>
      </ConversationContext.Provider>
    )
  }

  return (
    <ConversationContext.Provider value={context}>
      <div className={cx('flex flex-col overflow-hidden bg-primary-background h-full rounded-2xl', isMainBrain && 'ring-2 ring-amber-400')}>
        <div
          className={cx(
            'border-b border-solid border-primary-border flex flex-row items-center justify-between gap-2 py-[10px]',
            marginClass,
          )}
        >
          <div className="flex flex-row items-center">
            <motion.img
              src={botInfo.avatar}
              className="w-[18px] h-[18px] object-contain rounded-sm mr-2"
              whileHover={{ rotate: 180 }}
            />
            <ChatbotName
              botId={props.botId}
              name={botInfo.name}
              fullName={props.bot.name}
              onSwitchBot={mode === 'compact' ? props.onSwitchBot : undefined}
            />
          </div>
          <div className="flex flex-row items-center gap-2">
            <MainBrainToggle botId={props.botId} />
          <WebAccessCheckbox botId={props.botId} />
          </div>
          <div className="flex flex-row items-center gap-3">
            <Tooltip content={t('Share conversation')}>
              <motion.img
                src={shareIcon}
                className="w-5 h-5 cursor-pointer"
                onClick={openShareDialog}
                whileHover={{ scale: 1.1 }}
              />
            </Tooltip>
            <Tooltip content={t('Clear conversation')}>
              <motion.img
                src={clearIcon}
                className={cx('w-5 h-5', props.generating ? 'cursor-not-allowed' : 'cursor-pointer')}
                onClick={resetConversation}
                whileHover={{ scale: 1.1 }}
              />
            </Tooltip>
            <Tooltip content={t('View history')}>
              <motion.img
                src={historyIcon}
                className="w-5 h-5 cursor-pointer"
                onClick={openHistoryDialog}
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
