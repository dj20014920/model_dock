import { cx } from '~/utils'
import { FC, memo, useEffect, useMemo, useState } from 'react'
import { IoCheckmarkSharp, IoCopyOutline } from 'react-icons/io5'
import { BeatLoader } from 'react-spinners'
import { ChatMessageModel } from '~/types'
import Markdown from '../Markdown'
import ErrorAction from './ErrorAction'
import MessageBubble from './MessageBubble'

const COPY_ICON_CLASS = 'self-top cursor-pointer invisible group-hover:visible mt-[12px] text-primary-text'

interface Props {
  message: ChatMessageModel
  className?: string
}

const ChatMessageCard: FC<Props> = ({ message, className }) => {
  const [copied, setCopied] = useState(false)

  const imageUrl = useMemo(() => {
    return message.image ? URL.createObjectURL(message.image) : ''
  }, [message.image])

  const copyText = useMemo(() => {
    if (message.text) {
      return message.text
    }
    if (message.error) {
      return message.error.message
    }
  }, [message.error, message.text])

  async function onCopy() {
    try {
      if (!copyText) return
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText)
      } else {
        const ta = document.createElement('textarea')
        ta.value = copyText
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
    } catch {}
  }

  useEffect(() => {
    if (copied) {
      setTimeout(() => setCopied(false), 1000)
    }
  }, [copied])

  return (
    <div
      className={cx('group flex gap-3 w-full', message.author === 'user' ? 'flex-row-reverse' : 'flex-row', className)}
    >
      <div className="flex flex-col w-11/12  max-w-fit items-start gap-2">
        <MessageBubble color={message.author === 'user' ? 'primary' : 'flat'}>
          {!!imageUrl && <img src={imageUrl} className="max-w-xs my-2" />}
          {message.text ? (
            <Markdown>{message.text}</Markdown>
          ) : (
            !message.error && <BeatLoader size={10} className="leading-tight" color="rgb(var(--primary-text))" />
          )}
          {!!message.error && <p className="text-[#cc0000] dark:text-[#ff0033]">{message.error.message}</p>}
        </MessageBubble>
        {!!message.error && <ErrorAction error={message.error} />}
      </div>
      {!!copyText && (
        <button onClick={onCopy} aria-label="Copy message" title="Copy" className="bg-transparent border-0 p-0">
          {copied ? <IoCheckmarkSharp className={COPY_ICON_CLASS} /> : <IoCopyOutline className={COPY_ICON_CLASS} />}
        </button>
      )}
    </div>
  )
}

export default memo(ChatMessageCard)
