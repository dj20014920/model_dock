import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { UserConfig } from '~services/user-config'
import Blockquote from './Blockquote'
import Browser from 'webextension-polyfill'
import Button from '~app/components/Button'
import { requestHostPermission } from '~app/utils/permissions'
import { CLAUDE_WEB_KNOWN_MODELS } from '~app/bots/claude-web/models'
import Select from '~app/components/Select'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

const ClaudeWebappSettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  
  const modelOptions = [
    { name: 'Auto (권장)', value: 'auto' },
    ...CLAUDE_WEB_KNOWN_MODELS.map(m => ({
      name: m.name,
      value: m.slug
    }))
  ]

  return (
    <div className="flex flex-col gap-4">
      <Blockquote className="mb-1">{t('Webapp mode uses your login session in current browser')}</Blockquote>
      
      {/* 로그인 버튼 */}
      <div className="flex flex-row gap-2 items-center">
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

      {/* 모델 선택 */}
      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">{t('Model')}</p>
        <Select
          value={userConfig.claudeWebappCustomModel || 'auto'}
          onChange={(value) => updateConfigValue({ claudeWebappCustomModel: value === 'auto' ? '' : value })}
          options={modelOptions}
        />
        <div className="text-xs text-secondary-text">
          Auto는 계정이 지원하는 최신 모델을 자동 선택합니다.
        </div>
      </div>

      {/* 정보 메시지 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mt-2">
        <p className="text-sm font-medium mb-1">ℹ️ Claude Webapp 모드</p>
        <p className="text-xs text-secondary-text">
          현재 Claude API는 기본 대화 기능만 지원합니다. 
          Extended Thinking, Tools, Connectors 등의 고급 기능은 향후 지원 예정입니다.
        </p>
      </div>
    </div>
  )
}

export default ClaudeWebappSettings
