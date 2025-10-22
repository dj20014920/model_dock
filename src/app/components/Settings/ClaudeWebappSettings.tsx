import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { UserConfig } from '~services/user-config'
import Blockquote from './Blockquote'
import Browser from 'webextension-polyfill'
import Button from '~app/components/Button'
import { requestHostPermission } from '~app/utils/permissions'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

const ClaudeWebappSettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <Blockquote className="mb-1">{t('Webapp mode uses your login session in current browser')}</Blockquote>
      <div className="flex flex-row gap-2 items-center mb-2">
        <Button
          text={t('Open Claude login page')}
          size="small"
          onClick={async () => {
            try {
              await requestHostPermission('https://*.claude.ai/')
            } catch (e) {
              console.error(e)
            }
            await Browser.tabs.create({ url: 'https://claude.ai', pinned: true })
          }}
        />
        <span className="text-xs text-secondary-text">{t('Sign in first, then come back')}</span>
      </div>
      <p className="font-medium text-sm">{t('Model')}</p>
      <div className="text-xs text-secondary-text mb-1">Auto (recommended) — 계정이 지원하는 최신 모델을 자동 선택합니다.</div>
    </div>
  )
}

export default ClaudeWebappSettings
