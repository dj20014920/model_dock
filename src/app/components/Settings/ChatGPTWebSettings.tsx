import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatGPTWebModel, UserConfig } from '~services/user-config'
import Select from '../Select'
import { Input } from '~app/components/Input'
import Blockquote from './Blockquote'
import Browser from 'webextension-polyfill'
import { CHATGPT_HOME_URL } from '~app/consts'
import { requestHostPermission } from '~app/utils/permissions'
import Button from '~app/components/Button'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

const ChatGPWebSettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <Blockquote className="mb-1">{t('Webapp mode uses your login session in current browser')}</Blockquote>
      <div className="flex flex-row gap-2 items-center mb-2">
        <Button
          text={t('Open pinned ChatGPT tab')}
          size="small"
          onClick={async () => {
            try {
              await requestHostPermission('https://*.openai.com/')
            } catch (e) {
              console.error(e)
            }
            await Browser.tabs.create({ url: CHATGPT_HOME_URL, pinned: true })
          }}
        />
        <span className="text-xs text-secondary-text">
          {t('Keep the pinned tab open to pass Cloudflare and keep session active')}
        </span>
      </div>
      <p className="font-medium text-sm">{t('Model')}</p>
      <div className="w-[250px] mb-1">
        <Select
          options={Object.entries(ChatGPTWebModel).map(([k, v]) => ({ name: k, value: v }))}
          value={userConfig.chatgptWebappModelName}
          onChange={(v) => updateConfigValue({ chatgptWebappModelName: v })}
        />
      </div>
      <p className="font-medium text-sm mt-1">{t('Custom model slug (optional)')}</p>
      <Input
        className="w-[320px]"
        placeholder="e.g. gpt-4.1-mini or gpt-5"
        value={(userConfig as any).chatgptWebappCustomModel || ''}
        onChange={(e) => updateConfigValue({ chatgptWebappCustomModel: e.currentTarget.value } as any)}
      />
      <p className="text-xs text-secondary-text">
        Auto를 권장합니다. 로그인 계정에서 사용 가능한 최신 모델을 자동 선택합니다.
      </p>
    </div>
  )
}

export default ChatGPWebSettings
