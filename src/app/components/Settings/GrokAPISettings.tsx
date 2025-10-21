import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { GrokAPIModel, UserConfig } from '~services/user-config'
import { Input } from '../Input'
import Select from '../Select'
import Blockquote from './Blockquote'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

const GROK_MODELS = [
  { name: 'grok-beta', value: GrokAPIModel['grok-beta'] },
  { name: 'grok-2-latest', value: GrokAPIModel['grok-2-latest'] },
  { name: 'grok-3-latest', value: GrokAPIModel['grok-3-latest'] },
  { name: 'grok-4-latest', value: GrokAPIModel['grok-4-latest'] },
]

/**
 * Grok API 설정 컴포넌트
 * xAI API Key 및 모델 선택
 */
const GrokAPISettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  const config = userConfig as any

  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-sm">xAI API Key</p>
      <Input
        className="w-[400px]"
        placeholder="xai-..."
        value={config.grokApiKey || ''}
        onChange={(e) => updateConfigValue({ grokApiKey: e.currentTarget.value } as any)}
        type="password"
      />
      <Blockquote className="mt-1">
        {t('Your keys are stored locally')}
        <br />
        <a
          href="https://x.ai/api"
          target="_blank"
          rel="noreferrer"
          className="underline text-primary-blue"
        >
          Get your xAI API key here
        </a>
      </Blockquote>

      <p className="font-medium text-sm mt-2">{t('Model')}</p>
      <div className="w-[250px]">
        <Select
          options={GROK_MODELS}
          value={config.grokApiModel || GrokAPIModel['grok-beta']}
          onChange={(v) => updateConfigValue({ grokApiModel: v } as any)}
        />
      </div>

      <p className="font-medium text-sm mt-2">{t('Custom model name (optional)')}</p>
      <Input
        className="w-[250px]"
        placeholder="grok-custom-model"
        value={config.grokApiCustomModel || ''}
        onChange={(e) => updateConfigValue({ grokApiCustomModel: e.currentTarget.value } as any)}
      />
    </div>
  )
}

export default GrokAPISettings
