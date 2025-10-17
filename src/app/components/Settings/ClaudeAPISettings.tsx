import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { ClaudeAPIModel, UserConfig } from '~services/user-config'
import { Input } from '../Input'
import Select from '../Select'
import Blockquote from './Blockquote'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

const ClaudeAPISettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 w-[400px]">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">API Key</p>
        <Input
          placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          value={userConfig.claudeApiKey}
          onChange={(e) => updateConfigValue({ claudeApiKey: e.currentTarget.value })}
          type="password"
        />
        <Blockquote className="mt-1">{t('Your keys are stored locally')}</Blockquote>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">{t('API Model')}</p>
        <Select
          options={Object.entries(ClaudeAPIModel).map(([k, v]) => ({ name: k, value: v }))}
          value={userConfig.claudeApiModel}
          onChange={(v) => updateConfigValue({ claudeApiModel: v })}
        />
        <span className="text-xs text-secondary-text mt-1">
          비용 안내: 추정 배지는 입력 토큰 기준의 대략적 비용을 표시합니다(응답 토큰 제외). 실제 과금은 Anthropic 공식 문서를 참고하세요.
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">Custom API model slug (optional)</p>
        <Input
          placeholder="e.g. claude-3-opus, claude-3.5-sonnet"
          value={(userConfig as any).claudeApiCustomModel || ''}
          onChange={(e) => updateConfigValue({ claudeApiCustomModel: e.currentTarget.value } as any)}
        />
      </div>
    </div>
  )
}

export default ClaudeAPISettings
