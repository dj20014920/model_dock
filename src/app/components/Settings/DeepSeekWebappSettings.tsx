import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { UserConfig } from '~services/user-config'
import Blockquote from './Blockquote'
import Button from '~app/components/Button'
import Browser from 'webextension-polyfill'
import { requestHostPermission } from '~app/utils/permissions'
import { Input } from '~app/components/Input'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

const DeepSeekWebappSettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <Blockquote className="mb-1">{t('Webapp mode uses your login session in current browser')}</Blockquote>
      <div className="flex flex-row gap-2 items-center">
        <Button
          text={t('Open DeepSeek tab')}
          size="small"
          onClick={async () => {
            try {
              await requestHostPermission('https://chat.deepseek.com/*')
            } catch (e) {
              console.error(e)
            }
            await Browser.tabs.create({ url: 'https://chat.deepseek.com', pinned: true })
          }}
        />
        <span className="text-xs text-secondary-text">{t('Keep the pinned tab open to keep session active')}</span>
      </div>
      <p className="font-medium text-sm">{t('Custom model slug (optional)')}</p>
      <Input
        className="w-[320px]"
        placeholder="e.g. deepseek-chat, deepseek-reasoner"
        value={(userConfig as any).deepseekWebappCustomModel || ''}
        onChange={(e) => updateConfigValue({ deepseekWebappCustomModel: e.currentTarget.value } as any)}
      />
    </div>
  )
}

export default DeepSeekWebappSettings

