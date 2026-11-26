import { Fragment, useState, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'

function renderInline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*)/g
  const parts = text.split(pattern)
  return parts.map((part, index) => {
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}

function TextBlocks({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let key = 0

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push(
      <p key={`p-${key++}`} className="whitespace-pre-wrap">
        {renderInline(paragraph.join('\n'))}
      </p>,
    )
    paragraph = []
  }

  const flushList = () => {
    if (!list) return
    const items = list.items.map((item, index) => (
      <li key={index} className="whitespace-pre-wrap">
        {renderInline(item)}
      </li>
    ))
    blocks.push(
      list.ordered ? (
        <ol key={`ol-${key++}`} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${key++}`} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    )
    list = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1].length
      const content = renderInline(heading[2])
      if (level === 1) {
        blocks.push(<h3 key={`h-${key++}`}>{content}</h3>)
      } else if (level === 2) {
        blocks.push(<h4 key={`h-${key++}`}>{content}</h4>)
      } else {
        blocks.push(<h5 key={`h-${key++}`}>{content}</h5>)
      }
      continue
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushParagraph()
      flushList()
      blocks.push(<hr key={`hr-${key++}`} />)
      continue
    }

    const bullet = trimmed.match(/^[-*•]\s+(.*)$/)
    if (bullet) {
      flushParagraph()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(bullet[1])
      continue
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/)
    if (numbered) {
      flushParagraph()
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(numbered[1])
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return <>{blocks}</>
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked by the browser.
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[var(--text-muted)] transition hover:bg-white/5 hover:text-[var(--text)]"
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="scrollbar-thin overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function RichText({ text }: { text: string }) {
  if (!text) return null

  const parts = text.split(/```/)
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          const lines = part.replace(/^\n/, '').split('\n')
          const language = lines[0]?.trim() ?? ''
          const looksLikeLanguage = /^[a-zA-Z0-9+#._-]{0,20}$/.test(language)
          const code = (looksLikeLanguage ? lines.slice(1) : lines).join('\n').replace(/\n$/, '')
          return <CodeBlock key={index} code={code} language={looksLikeLanguage ? language : ''} />
        }
        return <TextBlocks key={index} text={part} />
      })}
    </div>
  )
}
