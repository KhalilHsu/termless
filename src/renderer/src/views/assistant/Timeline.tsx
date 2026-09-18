import { useState } from 'react'
import type { TimelineItem } from '../../../../shared/types'
import { useI18n } from '../../i18n'
import { CheckIcon, TerminalIcon } from '../../icons'
import { Markdown } from '../../Markdown'

type CommandItem = Extract<TimelineItem, { kind: 'command' }>
type QuestionItem = Extract<TimelineItem, { kind: 'question' }>

export function TimelineView({ items }: { items: TimelineItem[] }) {
  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case 'user':
            return (
              <div key={item.id} className="msg msg-user">
                <div className="bubble">{item.text}</div>
              </div>
            )
          case 'agent':
            if (!item.text.trim()) return null
            return (
              <div key={item.id} className="msg msg-agent">
                <Markdown text={item.text} />
              </div>
            )
          case 'command':
            return <CommandCard key={item.id} item={item} />
          case 'question':
            return <QuestionCard key={item.id} item={item} />
          case 'activity':
            return (
              <div key={item.id} className={`activity is-${item.status}`}>
                <span className="activity-dot" />
                <span>{item.summary}</span>
              </div>
            )
          case 'notice':
            return (
              <div key={item.id} className={`notice is-${item.tone}`}>
                {item.text}
              </div>
            )
        }
      })}
    </>
  )
}

function CommandCard({ item }: { item: CommandItem }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const awaiting = item.status === 'awaiting-approval'

  let statusLine: React.ReactNode
  switch (item.status) {
    case 'awaiting-approval':
      statusLine = t(`card.risk.${item.risk}`)
      break
    case 'running':
      statusLine = (
        <>
          <span className="spinner spinner-small" /> {t('card.running')}
        </>
      )
      break
    case 'done':
      statusLine = (
        <>
          <span className="card-check">
            <CheckIcon size={11} />
          </span>
          {t('card.done')}
        </>
      )
      break
    case 'failed':
      statusLine = t('card.failed')
      break
    case 'declined':
      statusLine = t('card.declined')
      break
  }

  return (
    <div className={`card command-card is-${item.status} risk-${item.risk}`}>
      <div className="card-head">
        <TerminalIcon size={16} />
        <span className="card-status">{statusLine}</span>
        <button className="command-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? t('card.hideDetails') : t('card.showDetails')}
        </button>
      </div>
      {open && (
        <div className="card-details">
          <div className="card-label">{t('card.command')}</div>
          <pre className="md-code">
            <code>{item.command}</code>
          </pre>
          {item.output ? (
            <>
              <div className="card-label">{t('card.output')}</div>
              <pre className="md-code card-output">
                <code>{item.output.trimEnd()}</code>
              </pre>
            </>
          ) : null}
        </div>
      )}
      {awaiting && (
        <div className="card-actions">
          <button className="button button-primary" onClick={() => window.termless.respondToApproval(item.id, 'accept')}>
            {t('card.allow')}
          </button>
          <button className="button" onClick={() => window.termless.respondToApproval(item.id, 'decline')}>
            {t('card.deny')}
          </button>
        </div>
      )}
    </div>
  )
}

function QuestionCard({ item }: { item: QuestionItem }) {
  const { t } = useI18n()
  const [other, setOther] = useState('')
  const [showOther, setShowOther] = useState(item.options.length === 0)
  const answer = (value: string) => window.termless.answerQuestion(item.id, value)

  return (
    <div className="card question-card">
      <div className="question-text">{item.question}</div>
      {item.answer !== null ? (
        <div className="muted">{t('card.answered', { answer: item.answer })}</div>
      ) : (
        <>
          <div className="question-options">
            {item.options.map((option) => (
              <button key={option.label} className="option" onClick={() => answer(option.label)}>
                <span className="option-label">{option.label}</span>
                {option.description ? <span className="option-desc">{option.description}</span> : null}
              </button>
            ))}
            {item.allowOther && item.options.length > 0 && !showOther && (
              <button className="option option-other" onClick={() => setShowOther(true)}>
                <span className="option-label">{t('card.other')}</span>
              </button>
            )}
          </div>
          {showOther && (
            <form
              className="question-other"
              onSubmit={(e) => {
                e.preventDefault()
                if (other.trim()) answer(other.trim())
              }}
            >
              <input value={other} onChange={(e) => setOther(e.target.value)} placeholder={t('card.otherPlaceholder')} autoFocus />
              <button className="button button-primary" type="submit" disabled={!other.trim()}>
                {t('card.answer')}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
