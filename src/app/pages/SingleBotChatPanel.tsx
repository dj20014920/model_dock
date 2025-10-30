import React, { FC } from 'react'
import { useChat } from '~app/hooks/use-chat'
import { BotId } from '../bots'
import ConversationPanel from '../components/Chat/ConversationPanel'

interface Props {
  botId: BotId
}

const SingleBotChatPanel: FC<Props> = ({ botId }) => {
  const chat = useChat(botId)
  console.log('[SingleBot] 🧭 mount', { botId })
  // 언마운트 로깅
  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useEffect(() => {
    return () => {
      console.log('[SingleBot] 🧹 unmount', { botId })
    }
  }, [botId])

  // Grok은 GrokWebAppBot에서 탭을 자동으로 열고, UI는 ConversationPanel에서 처리
  return (
    <div className="overflow-hidden h-full">
      <ConversationPanel
        botId={botId}
        bot={chat.bot}
        messages={chat.messages}
        onUserSendMessage={chat.sendMessage}
        generating={chat.generating}
        stopGenerating={chat.stopGenerating}
        resetConversation={chat.resetConversation}
        reloadBot={chat.reloadBot}
        mode="full"
      />
    </div>
  )
}

export default SingleBotChatPanel
