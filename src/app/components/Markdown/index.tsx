/* eslint-disable react/prop-types */

import { cx } from '~/utils'
import 'github-markdown-css'
import { FC, ReactNode, useEffect, useMemo, useState } from 'react'
// Inline copy logic to avoid type conflicts with react-copy-to-clipboard
import { BsClipboard } from 'react-icons/bs'
import ReactMarkdown from 'react-markdown'
import reactNodeToString from 'react-node-to-string'
import rehypeHighlight from 'rehype-highlight'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import supersub from 'remark-supersub'
import Tooltip from '../Tooltip'
import './markdown.css'

function CustomCode(props: { children: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)

  const code = useMemo(() => reactNodeToString(props.children), [props.children])

  useEffect(() => {
    if (copied) {
      setTimeout(() => setCopied(false), 1000)
    }
  }, [copied])

  return (
    <div className="flex flex-col">
      <div className="bg-[#e6e7e8] dark:bg-[#444a5354] text-xs p-2">
        <button
          type="button"
          className="flex flex-row items-center gap-2 cursor-pointer w-fit ml-1 bg-transparent border-0 p-0"
          aria-label="Copy code"
          onClick={async () => {
            try {
              if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(code)
              } else {
                const ta = document.createElement('textarea')
                ta.value = code
                ta.style.position = 'fixed'
                ta.style.opacity = '0'
                document.body.appendChild(ta)
                ta.select()
                document.execCommand('copy')
                document.body.removeChild(ta)
              }
              setCopied(true)
            } catch {}
          }}
        >
          <BsClipboard />
          <span>{copied ? 'copied' : 'copy code'}</span>
        </button>
      </div>
      <code className={cx(props.className, 'px-4')}>{props.children}</code>
    </div>
  )
}

const Markdown: FC<{ children: string }> = ({ children }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, supersub, remarkBreaks, remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      className={`markdown-body markdown-custom-styles !text-base font-normal`}
      linkTarget="_blank"
      components={{
        a: ({ node, ...props }) => {
          if (!props.title) {
            return <a {...props} />
          }
          return (
            <Tooltip content={props.title}>
              <a {...props} title={undefined} />
            </Tooltip>
          )
        },
        code: ({ node, inline, className, children, ...props }) => {
          if (inline) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          }
          return <CustomCode className={className}>{children}</CustomCode>
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

export default Markdown
