import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { UserConfig } from '~services/user-config'
import Select from '../Select'
import Blockquote from './Blockquote'
import Browser from 'webextension-polyfill'
import Button from '~app/components/Button'
import { requestHostPermission } from '~app/utils/permissions'
import { Input } from '~app/components/Input'

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
      <div className="w-[250px] mb-1">
        <Select options={[{ name: 'Claude 2', value: 'claude-2' }]} value="claude-2" onChange={console.log} />
      </div>
      <p className="font-medium text-sm mt-1">{t('Custom model slug (optional)')}</p>
      <Input
        className="w-[320px]"
        placeholder="e.g. claude-3-opus / claude-3.5-sonnet"
        value={(userConfig as any).claudeWebappCustomModel || ''}
        onChange={(e) => updateConfigValue({ claudeWebappCustomModel: e.currentTarget.value } as any)}
      />
    </div>
  )
}

export default ClaudeWebappSettings
