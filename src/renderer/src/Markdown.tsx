import type { ReactNode } from 'react'

// A deliberately tiny Markdown renderer for agent replies: paragraphs, lists,
// fenced code, `inline code`, **bold** and [links](https://…). Everything goes
// through React, so no HTML from the model is ever injected.

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(
        <pre key={blocks.length} className="md-code">
          <code>{code.join('\n')}</code>
        </pre>
      )
      continue
    }

    const listMatch = line.match(/^\s*([-*•]|\d+[.)])\s+/)
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1])
      const items: string[] = []
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))
        i++
      }
      const children = items.map((item, n) => <li key={n}>{inline(item)}</li>)
      blocks.push(ordered ? <ol key={blocks.length}>{children}</ol> : <ul key={blocks.length}>{children}</ul>)
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('```') && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
      para.push(lines[i].replace(/^#+\s*/, ''))
      i++
    }
    blocks.push(<p key={blocks.length}>{inline(para.join('\n'))}</p>)
  }

  return <div className="md">{blocks}</div>
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    const key = parts.length
    if (token.startsWith('`')) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      const [, label, url] = token.match(/^\[([^\]]+)\]\((.+)\)$/)!
      parts.push(
        <button key={key} className="link" onClick={() => window.termless.openExternal(url)}>
          {label}
        </button>
      )
    }
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
