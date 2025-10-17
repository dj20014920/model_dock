import { FC, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AiOutlineCrown, AiFillCrown } from 'react-icons/ai'
import { BotId } from '~app/bots'
import Tooltip from '~app/components/Tooltip'
import { useMainBrain } from '~app/hooks/use-main-brain'

const MainBrainToggle: FC<{ botId: BotId }>
  = ({ botId }) => {
  const { t } = useTranslation()
  const { mainBrainBotId, setMainBrain } = useMainBrain()
  const active = useMemo(() => mainBrainBotId === botId, [mainBrainBotId, botId])

  const toggle = useCallback(() => {
    setMainBrain(active ? '' : botId)
  }, [active, botId, setMainBrain])

  return (
    <Tooltip content={active ? t('Unset Main Brain') : t('Set as Main Brain')}>
      <span className="cursor-pointer inline-flex items-center" onClick={toggle}>
        {active ? <AiFillCrown size={18} color="#f59e0b" /> : <AiOutlineCrown size={18} className="opacity-80" />}
      </span>
    </Tooltip>
  )
}

export default MainBrainToggle

