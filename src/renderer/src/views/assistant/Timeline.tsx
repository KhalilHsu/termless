import { useState } from 'react'
import type { NetworkReport, ScriptReport, TimelineItem } from '../../../../shared/types'
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
          case 'network':
            return <NetworkCard key={item.id} report={item.report} />
          case 'plan':
            return <PlanCard key={item.id} item={item} />
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
    case 'checking':
      statusLine = (
        <>
          <span className="spinner spinner-small" /> {t('card.checkingScript')}
        </>
      )
      break
    case 'running':
      statusLine = (
        <>
          <span className="spinner spinner-small" /> {t('card.running')}
        </>
      )
      break
    case 'blocked':
      statusLine = t('card.blocked')
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
    case 'stopped':
      statusLine = t('card.stopped')
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
      {item.reason && <p className="card-reason">{item.reason}</p>}
      {item.script && <ScriptCheck report={item.script} />}
      {awaiting && item.risk === 'admin' && <p className="card-reason muted">{t('card.adminHint')}</p>}
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

type PlanItem = Extract<TimelineItem, { kind: 'plan' }>

/** The steps the agent proposes for a bigger job, with Start / Not now, then the progress. */
function PlanCard({ item }: { item: PlanItem }) {
  const { t } = useI18n()
  const done = item.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  let status: string
  if (item.decision === null) status = item.expired ? t('plan.expired') : t('plan.proposed')
  else if (item.decision === 'declined') status = t('plan.declined')
  else if (item.stoppedAt !== null) status = t('plan.stoppedAt', { step: item.stoppedAt + 1 })
  else if (done === item.steps.length) status = t('plan.finished')
  else status = t('plan.progress', { done, total: item.steps.length })
  return (
    <div className={`card plan-card ${item.decision === null && !item.expired ? 'is-waiting' : ''}`}>
      <div className="plan-head">
        <div className="plan-title">{item.title}</div>
        <div className="card-status muted">{status}</div>
      </div>
      {item.summary && <p className="plan-summary">{item.summary}</p>}
      <ol className="plan-steps">
        {item.steps.map((step, i) => (
          <li key={i} className={`is-${step.status} ${item.stoppedAt === i ? 'is-stopped' : ''}`}>
            <span className="plan-step-mark">
              {step.status === 'running' ? <span className="spinner spinner-small" /> : step.status === 'done' ? <CheckIcon size={11} /> : step.status === 'failed' ? '✕' : i + 1}
            </span>
            <span>
              <span className="plan-step-title">{step.title}</span>
              {step.detail && <span className="plan-step-detail">{step.detail}</span>}
              {step.note && <span className="plan-step-note">{step.note}</span>}
            </span>
          </li>
        ))}
      </ol>
      {item.decision === null && !item.expired && (
        <div className="card-actions">
          <button className="button button-primary" onClick={() => window.termless.answerPlan(item.id, 'accepted')}>
            {t('plan.start')}
          </button>
          <button className="button" onClick={() => window.termless.answerPlan(item.id, 'declined')}>
            {t('plan.notNow')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Result of a network check: what can be reached, why not, speed, proxies. */
function NetworkCard({ report }: { report: NetworkReport | null }) {
  const { t } = useI18n()
  if (!report) {
    return (
      <div className="card network-card">
        <div className="card-head">
          <span className="spinner spinner-small" />
          <span className="card-status">{t('network.checking')}</span>
        </div>
      </div>
    )
  }
  const { system, environment, shell } = report.proxy
  return (
    <div className={`card network-card is-${report.verdict}`}>
      <div className="card-head">
        <span className={`network-dot is-${report.verdict === 'ok' ? 'ok' : 'bad'}`} />
        <span className="card-status">{t(`network.verdict.${report.verdict}`)}</span>
      </div>
      <ul className="network-probes">
        {report.probes.map((p) => (
          <li key={p.id} className={p.ok ? 'is-ok' : 'is-bad'}>
            <span className="network-mark">{p.ok ? '✓' : '✕'}</span>
            <span>{p.label}</span>
            {!p.ok && p.problem && <span className="muted"> · {t(`network.problem.${p.problem}`)}</span>}
          </li>
        ))}
      </ul>
      {report.bytesPerSecond !== null && <p className="network-line">{t('network.speed', { speed: formatSpeed(report.bytesPerSecond) })}</p>}
      {system.length > 0 && <p className="network-line">{t('network.systemProxy', { proxy: system.join(', ') })}</p>}
      {environment.length > 0 ? (
        <p className="network-line">{t('network.toolsProxy', { proxy: environment.join('; ') })}</p>
      ) : system.length > 0 ? (
        <p className="network-line">{t('network.toolsNoProxy')}</p>
      ) : null}
      {shell.length > 0 && environment.length === 0 && <p className="network-line">{t('network.shellProxy', { proxy: shell.join('; ') })}</p>}
    </div>
  )
}

function formatSpeed(bytesPerSecond: number): string {
  return bytesPerSecond >= 1024 * 1024 ? `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s` : `${Math.round(bytesPerSecond / 1024)} KB/s`
}

/** Where a script from the internet comes from and what Termless found in it. */
function ScriptCheck({ report }: { report: ScriptReport }) {
  const { t } = useI18n()
  const [showScript, setShowScript] = useState(false)
  const source = report.source
  return (
    <div className={`script-check is-${report.verdict}`}>
      <div className="script-source">
        <span className="card-label">{t('script.source')}</span>
        {source ? (
          <span>
            <span className="mono">{source.host}</span>
            {' · '}
            {source.knownAs ? t('script.known', { name: source.knownAs }) : <strong>{t('script.unknown')}</strong>}
            {!source.https && <strong> · {t('script.http')}</strong>}
          </span>
        ) : (
          <span>{t('script.embedded')}</span>
        )}
      </div>
      {report.redirectedTo && (
        <div className="script-source">
          <span className="card-label">{t('script.redirected')}</span>
          <span className="mono">{report.redirectedTo.host}</span>
        </div>
      )}
      {report.error ? (
        <p className="script-note">{t('script.downloadFailed', { error: report.error })}</p>
      ) : report.findings.length === 0 ? (
        <p className="script-note">{t('script.nothingFound')}</p>
      ) : (
        <ul className="script-findings">
          {report.findings.map((f) => (
            <li key={f.id} className={`is-${f.severity}`} title={f.evidence}>
              {t(`finding.${f.id}`)}
            </li>
          ))}
        </ul>
      )}
      {report.verdict === 'blocked' && <p className="script-note is-blocked">{t('script.blockedNote')}</p>}
      {report.text && (
        <>
          <button className="command-toggle" onClick={() => setShowScript(!showScript)} aria-expanded={showScript}>
            {showScript ? t('script.hide') : t('script.show')}
          </button>
          {showScript && (
            <pre className="md-code card-output">
              <code>{report.text}</code>
            </pre>
          )}
        </>
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
      ) : item.expired ? (
        <div className="muted">{t('card.expired')}</div>
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
