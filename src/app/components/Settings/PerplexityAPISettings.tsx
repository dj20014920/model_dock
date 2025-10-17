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

const PerplexityAPISettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">
          API Key (
          <a
            href="https://docs.perplexity.ai/docs/getting-started"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            how to create key
          </a>
          )
        </p>
        <Input
          className="w-[300px]"
          placeholder="pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          value={userConfig.perplexityApiKey}
          onChange={(e) => updateConfigValue({ perplexityApiKey: e.currentTarget.value })}
          type="password"
        />
        <Blockquote className="mt-1">{t('Your keys are stored locally')}</Blockquote>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">{t('Model')}</p>
        <div className="w-[300px]">
          <Select
            options={[
              { name: 'pplx-70b-online', value: 'pplx-70b-online' },
              { name: 'pplx-7b-online', value: 'pplx-7b-online' },
            ]}
            value={(userConfig as any).perplexityApiModel || 'pplx-70b-online'}
            onChange={(v) => updateConfigValue({ perplexityApiModel: v } as any)}
          />
        </div>
      </div>
    </div>
  )
}

export default PerplexityAPISettings
