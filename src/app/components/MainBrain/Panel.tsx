import { AnimatePresence, motion } from 'framer-motion'
import { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CHATBOTS } from '~app/consts'
import Button from '~app/components/Button'
import { BotId } from '~app/bots'
import { useMainBrain } from '~app/hooks/use-main-brain'

const RECOMMENDED: BotId[] = ['chatgpt', 'claude', 'perplexity', 'gemini'].filter(
  (id) => CHATBOTS[id as BotId],
) as BotId[]

const MainBrainPanel: FC = () => {
  const { t } = useTranslation()
  const { mainBrainBotId, setMainBrain } = useMainBrain()

  const bot = useMemo(() => (mainBrainBotId ? CHATBOTS[mainBrainBotId] : null), [mainBrainBotId])

  return (
    <AnimatePresence>
      {bot && (
        <motion.div
          key="main-brain-panel"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'tween', duration: 0.25 }}
          className="fixed right-4 top-20 w-80 bg-primary-background border border-primary-border rounded-xl shadow-lg p-4 z-40"
        >
          <div className="flex flex-row items-center gap-2 mb-3">
            <img src={bot.avatar} className="w-5 h-5 rounded-sm" />
            <span className="text-sm font-bold">{bot.name}</span>
            <span className="ml-auto text-[11px] px-2 py-[2px] rounded-full bg-amber-100 text-amber-700 font-semibold">
              {t('Main Brain')}
            </span>
          </div>
          <div className="text-xs text-secondary-text mb-3 leading-5">
            {t('Use Main Brain as your coordinator to compare, organize, or guide prompts across models. You can switch anytime below.')}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold text-primary-text">{t('Recommended models')}</span>
            {RECOMMENDED.map((id) => (
              <div key={id} className="flex flex-row items-center gap-2 p-2 rounded-lg border border-primary-border">
                <img src={CHATBOTS[id].avatar} className="w-4 h-4" />
                <span className="text-sm grow">{CHATBOTS[id].name}</span>
                <Button text={t('Select')} size="tiny" onClick={() => setMainBrain(id)} />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default MainBrainPanel

