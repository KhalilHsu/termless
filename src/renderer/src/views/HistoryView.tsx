import { useMemo, useState } from 'react'
import type { ConversationSummary } from '../../../shared/types'
import { useI18n, type Key } from '../i18n'
import { SearchIcon } from '../icons'
import { ViewHeader } from './ViewHeader'

type Group = { key: Key | null; label: string; items: ConversationSummary[] }

// History is a list for finding conversations; talking always happens in the
// Assistant. Opening one here switches the Assistant to it.
export function HistoryView({
  conversations,
  currentId,
  onOpen
}: {
  conversations: ConversationSummary[]
  currentId: string | null
  onOpen: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q))
  }, [conversations, query])

  const groups = useMemo(() => groupByDay(visible, t), [visible, t])
  const time = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: 'numeric', minute: '2-digit' })
  const date = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })

  const remove = (id: string) => {
    if (window.confirm(t('history.deleteConfirm'))) void window.termless.deleteConversation(id)
  }

  return (
    <div className="view">
      <ViewHeader title={t('history.title')} subtitle={t('history.subtitle')}>
        <label className="search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={query}
            placeholder={t('history.search')}
            onChange={(e) => setQuery(e.target.value)}
            disabled={conversations.length === 0}
          />
        </label>
      </ViewHeader>

      {conversations.length === 0 ? (
        <div className="empty-state">
          <p>{t('history.empty')}</p>
        </div>
      ) : (
        <div className="history">
          <div className="history-inner">
            {visible.length === 0 && <p className="muted list-empty">{t('history.noMatch')}</p>}
            {groups.map((group) => (
              <section key={group.label} className="history-group">
                <h3>{group.label}</h3>
                <ul className="history-list">
                  {group.items.map((c) => {
                    const updated = new Date(c.updatedAt)
                    return (
                      <li key={c.id} className={`history-row ${c.id === currentId ? 'is-current' : ''}`}>
                        <button className="history-open" onClick={() => onOpen(c.id)}>
                          <span className="history-title">
                            <span>{c.title}</span>
                            {c.id === currentId && <span className="badge badge-cask">{t('history.current')}</span>}
                          </span>
                          {c.preview && c.preview !== c.title && <span className="history-preview">{c.preview}</span>}
                        </button>
                        <span className="history-time">{group.key === 'history.older' ? date.format(updated) : time.format(updated)}</span>
                        <button className="link history-delete" onClick={() => remove(c.id)}>
                          {t('history.delete')}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            <div className="history-footer">
              <button
                className="button"
                onClick={() => {
                  if (window.confirm(t('history.clearConfirm'))) void window.termless.clearConversations()
                }}
              >
                {t('history.clear')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function groupByDay(list: ConversationSummary[], t: (key: Key) => string): Group[] {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const day = 24 * 60 * 60 * 1000
  const buckets: { key: Key; from: number }[] = [
    { key: 'history.today', from: startOfToday.getTime() },
    { key: 'history.yesterday', from: startOfToday.getTime() - day },
    { key: 'history.thisWeek', from: startOfToday.getTime() - 6 * day },
    { key: 'history.older', from: -Infinity }
  ]
  const groups: Group[] = buckets.map((b) => ({ key: b.key, label: t(b.key), items: [] }))
  for (const c of list) {
    const at = new Date(c.updatedAt).getTime()
    const index = buckets.findIndex((b) => at >= b.from)
    groups[index].items.push(c)
  }
  return groups.filter((g) => g.items.length > 0)
}
