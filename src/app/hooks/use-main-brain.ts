import { useEffect, useState, useCallback } from 'react'
import Browser from 'webextension-polyfill'
import { BotId } from '~app/bots'
import { getUserConfig, updateUserConfig } from '~services/user-config'

export function useMainBrain() {
  const [mainBrainBotId, setMainBrainBotId] = useState<BotId | ''>('')

  useEffect(() => {
    let mounted = true
    getUserConfig().then((c) => {
      if (mounted) setMainBrainBotId((c.mainBrainBotId as BotId | '') || '')
    })
    const onChanged = (changes: Record<string, Browser.Storage.StorageChange>, area: string) => {
      if (area !== 'sync') return
      if (Object.prototype.hasOwnProperty.call(changes, 'mainBrainBotId')) {
        setMainBrainBotId((changes['mainBrainBotId'].newValue as BotId | '') || '')
      }
    }
    Browser.storage.onChanged.addListener(onChanged)
    return () => {
      mounted = false
      Browser.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  const setMainBrain = useCallback(async (botId: BotId | '') => {
    await updateUserConfig({ mainBrainBotId: botId as any })
  }, [])

  return { mainBrainBotId, setMainBrain }
}

