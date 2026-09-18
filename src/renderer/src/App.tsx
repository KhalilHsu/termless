import { useCallback, useEffect, useState } from 'react'
import type { BrewInventory } from '../../shared/types'
import { useI18n } from './i18n'
import { BoxIcon, ChatIcon, ClockIcon, CompassIcon } from './icons'
import { AssistantView } from './views/AssistantView'
import { ComingSoonView } from './views/ComingSoonView'
import { InstalledView } from './views/InstalledView'

export type ViewId = 'assistant' | 'installed' | 'discover' | 'history'

const VIEWS: ViewId[] = ['assistant', 'installed', 'discover', 'history']

function initialView(): ViewId {
  const requested = new URLSearchParams(window.location.search).get('view')
  return VIEWS.includes(requested as ViewId) ? (requested as ViewId) : 'assistant'
}

export type InventoryState = { status: 'loading' } | { status: 'done'; inventory: BrewInventory }

export function App() {
  const { t, lang, setLang } = useI18n()
  const [view, setView] = useState<ViewId>(initialView)
  const [inventory, setInventory] = useState<InventoryState>({ status: 'loading' })

  const loadInventory = useCallback(() => {
    setInventory({ status: 'loading' })
    window.termless.getInventory().then((result) => setInventory({ status: 'done', inventory: result }))
  }, [])

  useEffect(loadInventory, [loadInventory])

  const updates =
    inventory.status === 'done' && inventory.inventory.ok
      ? inventory.inventory.packages.filter((p) => p.outdated).length
      : 0

  const nav: { id: ViewId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'assistant', label: t('nav.assistant'), icon: <ChatIcon /> },
    { id: 'installed', label: t('nav.installed'), icon: <BoxIcon />, badge: updates || undefined },
    { id: 'discover', label: t('nav.discover'), icon: <CompassIcon /> },
    { id: 'history', label: t('nav.history'), icon: <ClockIcon /> }
  ]

  let statusText = t('status.ready')
  let statusTone: 'idle' | 'busy' | 'error' = 'idle'
  if (inventory.status === 'loading') {
    statusText = t('status.loading')
    statusTone = 'busy'
  } else if (inventory.inventory.ok) {
    statusText = `${t('status.ready')} · ${t('status.summary', {
      version: inventory.inventory.brewVersion,
      count: inventory.inventory.packages.length
    })}`
  } else if (inventory.inventory.reason === 'failed') {
    statusText = t('status.error')
    statusTone = 'error'
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="titlebar-drag sidebar-top" />
        <nav className="nav">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'is-active' : ''}`}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-footer-label">{t('nav.language')}</span>
          <div className="lang-switch" role="group" aria-label={t('nav.language')}>
            <button className={lang === 'en' ? 'is-active' : ''} onClick={() => setLang('en')}>
              EN
            </button>
            <button className={lang === 'zh' ? 'is-active' : ''} onClick={() => setLang('zh')}>
              中文
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="main-content">
          {view === 'assistant' && <AssistantView />}
          {view === 'installed' && <InstalledView state={inventory} onRetry={loadInventory} />}
          {view === 'discover' && <ComingSoonView title={t('nav.discover')} body={t('discover.body')} />}
          {view === 'history' && <ComingSoonView title={t('nav.history')} body={t('history.body')} />}
        </div>
        <footer className={`statusbar is-${statusTone}`}>
          <span className="status-dot" />
          <span>{statusText}</span>
        </footer>
      </main>
    </div>
  )
}
