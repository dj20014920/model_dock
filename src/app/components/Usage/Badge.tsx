import { FC, useEffect, useMemo, useState } from 'react'
import { BotId } from '~app/bots'
import { formatAmount } from '~utils/format'
import { getUserConfig } from '~services/user-config'
import { estimateForBots } from '~services/usage'

const UsageBadge: FC<{ botIds: BotId[]; text: string }>
  = ({ botIds, text }) => {
  const [label, setLabel] = useState('')

  useEffect(() => {
    let mounted = true
    getUserConfig().then((config) => {
      const items = estimateForBots(botIds, text, config)
      const totalTokens = items.reduce((s, x) => s + x.tokens, 0)
      const totalUsd = items.reduce((s, x) => s + (x.usd || 0), 0)
      const parts = [`≈ ${totalTokens.toLocaleString()} tok`]
      if (totalUsd > 0) parts.push(formatAmount(totalUsd))
      const value = parts.join(' · ')
      if (mounted) setLabel(value)
    })
    return () => { mounted = false }
  }, [botIds, text])

  if (!text.trim()) return null
  const title = '입력 토큰 기준의 대략적 추정치입니다(응답 토큰 비용 제외). Perplexity/Gemini 등 일부 모델은 비용을 표시하지 않습니다.'
  return (
    <span
      className="px-2 py-[2px] text-[11px] rounded-lg bg-secondary text-light-text whitespace-nowrap"
      title={title}
    >
      {label}
    </span>
  )
}

export default UsageBadge
