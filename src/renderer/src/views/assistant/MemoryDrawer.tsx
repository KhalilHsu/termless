import { useEffect, useState } from 'react'
import type { MemorySnapshot } from '../../../../shared/types'
import { useI18n } from '../../i18n'

// Principle: memory is visible and deletable. Nothing is remembered in secret.
export function MemoryDrawer({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n()
  const [memory, setMemory] = useState<MemorySnapshot | null>(null)

  useEffect(() => {
    window.termless.getMemory().then(setMemory)
  }, [])

  const dateFormat = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' })

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>{t('memory.title')}</h2>
          <button className="button" onClick={onClose}>
            {t('memory.close')}
          </button>
        </div>
        <p className="muted">{t('memory.body')}</p>

        <ul className="memory-list">
          {memory && memory.facts.length === 0 && <li className="muted">{t('memory.empty')}</li>}
          {memory?.facts
            .slice()
            .reverse()
            .map((fact) => (
              <li key={fact.id} className="memory-item">
                <span>{fact.text}</span>
                <button className="link" onClick={() => window.termless.forgetFact(fact.id).then(setMemory)}>
                  {t('memory.forget')}
                </button>
              </li>
            ))}
        </ul>

        <h3>{t('memory.actions')}</h3>
        <ul className="memory-list">
          {memory && memory.actions.length === 0 && <li className="muted">{t('memory.noActions')}</li>}
          {memory?.actions
            .slice(-20)
            .reverse()
            .map((action) => (
              <li key={action.id} className="memory-item">
                <span>{action.summary}</span>
                <span className="muted small">{dateFormat.format(new Date(action.at))}</span>
              </li>
            ))}
        </ul>

        {memory && memory.facts.length > 0 && (
          <button
            className="button drawer-danger"
            onClick={() => {
              if (window.confirm(t('memory.clearConfirm'))) window.termless.clearMemory().then(setMemory)
            }}
          >
            {t('memory.clear')}
          </button>
        )}
      </aside>
    </div>
  )
}
