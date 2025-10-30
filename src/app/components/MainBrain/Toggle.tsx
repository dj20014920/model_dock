import { FC, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { BotId } from '~app/bots'
import Tooltip from '~app/components/Tooltip'
import { useMainBrain } from '~app/hooks/use-main-brain'

const MainBrainToggle: FC<{ botId: BotId }> = ({ botId }) => {
  const { t } = useTranslation()
  const { mainBrainBotId, setMainBrain } = useMainBrain()
  const active = useMemo(() => mainBrainBotId === botId, [mainBrainBotId, botId])

  const toggle = useCallback(() => {
    setMainBrain(active ? '' : botId)
  }, [active, botId, setMainBrain])

  return (
    <Tooltip content={active ? '메인 브레인 해제' : '메인 브레인으로 설정'}>
      <motion.span
        className="cursor-pointer inline-flex items-center text-xl select-none"
        onClick={toggle}
        whileHover={{ scale: 1.2, rotate: active ? 0 : 15 }}
        whileTap={{ scale: 0.9 }}
        animate={active ? { rotate: [0, -10, 10, -10, 0] } : {}}
        transition={{ duration: 0.5 }}
      >
        {active ? '👑' : '♔'}
      </motion.span>
    </Tooltip>
  )
}

export default MainBrainToggle

