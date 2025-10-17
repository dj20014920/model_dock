import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { UserConfig } from '~services/user-config'
import { Input } from '../Input'
import Select from '../Select'
import Blockquote from './Blockquote'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

const DEEPSEEK_MODELS = [
  { name: 'deepseek-chat', value: 'deepseek-chat' },
  { name: 'deepseek-reasoner', value: 'deepseek-reasoner' },
]

const DeepSeekAPISettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-sm">API Key</p>
      <Input
        className="w-[400px]"
        placeholder="sk-..."
        value={(userConfig as any).deepseekApiKey || ''}
        onChange={(e) => updateConfigValue({ deepseekApiKey: e.currentTarget.value } as any)}
        type="password"
      />
      <Blockquote className="mt-1">{t('Your keys are stored locally')}</Blockquote>
      <p className="font-medium text-sm mt-2">{t('Model')}</p>
      <div className="w-[250px] mb-1">
        <Select
          options={DEEPSEEK_MODELS}
          value={(userConfig as any).deepseekApiModel || 'deepseek-chat'}
          onChange={(v) => updateConfigValue({ deepseekApiModel: v } as any)}
        />
      </div>
    </div>
  )
}

export default DeepSeekAPISettings

