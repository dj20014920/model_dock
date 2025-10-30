/**
 * LM Arena 모델 선택 드롭다운
 * 채팅 헤더에 표시되는 간단한 모델 선택기
 */

import { FC, useState, useEffect } from 'react'
import { BotId, BotInstance } from '~app/bots'
import { LMArenaBot } from '~app/bots/lmarena'
import { fetchAvailableModels, groupModelsByOrganization } from '~app/bots/lmarena/api'
import type { ModelInfo } from '~app/bots/lmarena/api'

interface Props {
  botId: BotId
  bot: BotInstance
}

export const LMArenaModelSelector: FC<Props> = ({ botId, bot }) => {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [currentModel, setCurrentModel] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  // 🛡️ 안전성 검증: bot이 LMArenaBot이 아니면 렌더링하지 않음
  if (!(bot instanceof LMArenaBot)) {
    console.warn('[LMArenaModelSelector] ⚠️ Bot is not LMArenaBot instance')
    return null
  }

  // 모델 목록 로드
  useEffect(() => {
    loadModels()
  }, [])

  // 현재 선택된 모델 가져오기
  useEffect(() => {
    if (bot instanceof LMArenaBot) {
      const config = (bot as any).config
      if (config && config.model) {
        setCurrentModel(config.model)
      }
    }
  }, [bot, botId])

  const loadModels = async () => {
    setIsLoading(true)
    try {
      const availableModels = await fetchAvailableModels()
      console.log('[LMArena Selector] ✅ Loaded models:', availableModels.length)
      console.log('[LMArena Selector] 📋 Sample models:', availableModels.slice(0, 10).map(m => m.name))
      
      // Claude 4, GPT-5 등 최신 모델 확인
      const latestModels = availableModels.filter(m => 
        m.name.includes('Claude 4') || 
        m.name.includes('GPT-5') || 
        m.name.includes('Gemini 2.5') ||
        m.name.includes('Opus 4')
      )
      console.log('[LMArena Selector] 🆕 Latest models found:', latestModels.map(m => m.name))
      
      setModels(availableModels)
    } catch (error) {
      console.error('[LMArena Selector] ❌ Failed to load models:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleModelChange = (newModel: string) => {
    setCurrentModel(newModel)
    
    // 봇 설정 업데이트
    if (bot instanceof LMArenaBot) {
      const config = (bot as any).config
      if (config) {
        config.model = newModel
      }
    }
  }

  const groupedModels = groupModelsByOrganization(models)
  const sortedOrgs = Object.keys(groupedModels).sort((a, b) => 
    groupedModels[b].length - groupedModels[a].length
  )

  return (
    <div className="flex items-center gap-1">
      <select
        value={currentModel}
        onChange={(e) => handleModelChange(e.target.value)}
        disabled={isLoading}
        className="text-xs px-2 py-1 border border-primary-border rounded bg-secondary text-primary-text focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed max-w-[200px]"
        title="모델 선택"
      >
        {isLoading ? (
          <option>Loading...</option>
        ) : (
          <>
            {sortedOrgs.map(org => (
              <optgroup key={org} label={org}>
                {groupedModels[org].map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </>
        )}
      </select>
      
      {isLoading && (
        <span className="text-xs text-light-text">⏳</span>
      )}
    </div>
  )
}

export default LMArenaModelSelector
