import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { CHATGPT_API_MODELS, DEFAULT_CHATGPT_SYSTEM_MESSAGE } from '~app/consts'
import { UserConfig } from '~services/user-config'
import { Input, Textarea } from '../Input'
import Select from '../Select'
import Blockquote from './Blockquote'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

const ChatGPTAPISettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 w-[400px]">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">API Key</p>
        <Input
          placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          value={userConfig.openaiApiKey}
          onChange={(e) => updateConfigValue({ openaiApiKey: e.currentTarget.value })}
          type="password"
        />
        <Blockquote className="mt-1">{t('Your keys are stored locally')}</Blockquote>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">API Host</p>
        <Input
          placeholder="https://api.openai.com"
          value={userConfig.openaiApiHost}
          onChange={(e) => updateConfigValue({ openaiApiHost: e.currentTarget.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">API Model</p>
        <Select
          options={CHATGPT_API_MODELS.map((m) => ({ name: m, value: m }))}
          value={userConfig.chatgptApiModel}
          onChange={(v) => updateConfigValue({ chatgptApiModel: v })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">Custom API model slug (optional)</p>
        <Input
          placeholder="e.g. gpt-4.1, gpt-4o, gpt-5"
          value={(userConfig as any).chatgptApiCustomModel || ''}
          onChange={(e) => updateConfigValue({ chatgptApiCustomModel: e.currentTarget.value } as any)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">System Message</p>
        <Textarea
          maxRows={3}
          value={userConfig.chatgptApiSystemMessage || DEFAULT_CHATGPT_SYSTEM_MESSAGE}
          onChange={(e) => updateConfigValue({ chatgptApiSystemMessage: e.currentTarget.value })}
        />
        <span className="text-xs text-secondary-text mt-1">
          비용 안내: 아래 추정 배지는 입력 토큰 기준의 대략적 비용을 표시합니다(응답 토큰 제외). 실제 과금은 OpenAI 공식 정책에 따르며 모델/지역/할인에 따라 달라질 수 있습니다.
        </span>
      </div>
    </div>
  )
}

export default ChatGPTAPISettings
