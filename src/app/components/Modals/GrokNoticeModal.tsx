import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import Dialog from '../Dialog'
import Button from '../Button'

interface Props {
  open: boolean
  onClose: () => void
}

const GrokNoticeModal: FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation()

  // 디버그 로그
  console.log('🎭 GrokNoticeModal 렌더링:', { open })
  
  const handleClose = () => {
    console.log('🚪 GrokNoticeModal 닫기 호출')
    onClose()
  }

  return (
    <Dialog title="ℹ️ Grok" open={open} onClose={handleClose} className="rounded-2xl w-[500px]">
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-primary-text leading-relaxed text-[15px]">
          {t('Grok security notice')}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button text={t('OK')} color="primary" onClick={handleClose} />
        </div>
      </div>
    </Dialog>
  )
}

export default GrokNoticeModal
