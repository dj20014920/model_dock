import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Browser from 'webextension-polyfill'
import Button from '../Button'

const GrokNoticePanel: FC = () => {
  const { t } = useTranslation()
  const [resetting, setResetting] = useState(false)

  const resetGrokNotice = async () => {
    setResetting(true)
    try {
      await Browser.storage.local.remove('grokNoticeShown')
      toast.success(t('Grok notice reset successfully'))
      console.log('✅ Grok 안내 초기화 완료')
    } catch (error) {
      console.error('❌ Grok 안내 초기화 실패:', error)
      toast.error(t('Failed to reset Grok notice'))
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-secondary-background rounded-xl p-4">
      <div className="font-medium text-primary-text">{t('Grok Notice Settings')}</div>
      <div className="text-secondary-text text-sm leading-relaxed">
        {t('Reset Grok security notice to show it again on next use')}
      </div>
      <div className="flex flex-row gap-2">
        <Button
          text={resetting ? t('Resetting...') : t('Reset Grok Notice')}
          color="flat"
          size="small"
          onClick={resetGrokNotice}
        />
      </div>
    </div>
  )
}

export default GrokNoticePanel
