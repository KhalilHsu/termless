import { useEffect, useState } from 'react'
import type { CodexStatus } from '../../../shared/types'
import { useI18n } from '../i18n'
import { ViewHeader } from './ViewHeader'

export function AssistantView() {
  const { t } = useI18n()
  const [codex, setCodex] = useState<CodexStatus | null>(null)

  useEffect(() => {
    window.termless.getCodexStatus().then(setCodex)
  }, [])

  let tone = 'busy'
  let message = t('assistant.codex.checking')
  if (codex) {
    if (!codex.installed) {
      tone = 'warn'
      message = t('assistant.codex.missing')
    } else if (codex.error) {
      tone = 'error'
      message = t('assistant.codex.broken')
    } else {
      tone = 'ok'
      message = t('assistant.codex.ready', { version: codex.version ?? '' })
    }
  }

  return (
    <div className="view">
      <ViewHeader title={t('assistant.title')} subtitle={t('assistant.subtitle')} />
      <div className="assistant">
        <div className="assistant-body">
          <div className={`agent-card is-${tone}`}>
            <span className="status-dot" />
            <div>
              <div className="agent-card-label">{t('assistant.agent')}</div>
              <div>{message}</div>
            </div>
          </div>
          <p className="assistant-soon">{t('assistant.comingSoon')}</p>
        </div>
        <div className="composer">
          <textarea placeholder={t('assistant.placeholder')} rows={3} disabled />
        </div>
      </div>
    </div>
  )
}
