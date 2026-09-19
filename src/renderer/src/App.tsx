import { useCallback, useEffect, useState } from 'react'
import type { AgentState, BrewInventory, ConversationSummary, SetupStatus } from '../../shared/types'
import { useI18n } from './i18n'
import { BoxIcon, ChatIcon, ClockIcon, CompassIcon } from './icons'
import { AssistantView } from './views/assistant/AssistantView'
import { ComingSoonView } from './views/ComingSoonView'
import { HistoryView } from './views/HistoryView'
import { InstalledView } from './views/InstalledView'

export type ViewId = 'assistant' | 'installed' | 'discover' | 'history'

const VIEWS: ViewId[] = ['assistant', 'installed', 'discover', 'history']

function initialView(): ViewId {
  const requested = new URLSearchParams(window.location.search).get('view')
  return VIEWS.includes(requested as ViewId) ? (requested as ViewId) : 'assistant'
}

const EMPTY_AGENT: AgentState = {
  conversationId: null,
  conversationTitle: null,
  phase: 'idle',
  error: null,
  model: null,
  timeline: [],
  savingMemory: false
}

export type InventoryState = { status: 'loading' } | { status: 'done'; inventory: BrewInventory }

export function App() {
  const { t, lang, setLang } = useI18n()
  const [view, setView] = useState<ViewId>(initialView)
  const [inventory, setInventory] = useState<InventoryState>({ status: 'loading' })
  const [agent, setAgent] = useState<AgentState>(EMPTY_AGENT)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])

  const loadInventory = useCallback((quiet = false) => {
    if (!quiet) setInventory({ status: 'loading' })
    window.termless.getInventory().then((result) => setInventory({ status: 'done', inventory: result }))
  }, [])

  const refreshSetup = useCallback(async () => {
    setSetup(await window.termless.getSetupStatus())
  }, [])

  useEffect(() => {
    loadInventory()
    void refreshSetup()
    window.termless.getAgentState().then(setAgent)
    const offAgent = window.termless.onAgentState(setAgent)
    window.termless.listConversations().then(setConversations)
    const offConversations = window.termless.onConversationsChanged(setConversations)
    // After the assistant installs or removes something, refresh quietly.
    const offInventory = window.termless.onInventoryChanged(() => loadInventory(true))
    return () => {
      offAgent()
      offConversations()
      offInventory()
    }
  }, [loadInventory, refreshSetup])

  const assistantBusy = agent.phase === 'working' || agent.phase === 'starting'

  // Talking always happens in the Assistant; History only picks which
  // conversation it shows.
  const openConversation = async (id: string) => {
    if (id !== agent.conversationId && assistantBusy && !window.confirm(t('history.switchConfirm'))) return
    await window.termless.openConversation(id)
    setView('assistant')
  }

  const askAssistant = (prompt: string) => {
    setView('assistant')
    void window.termless.sendMessage(prompt, lang)
  }

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
          {view === 'assistant' && <AssistantView agent={agent} setup={setup} refreshSetup={refreshSetup} />}
          {view === 'installed' && (
            <InstalledView
              state={inventory}
              onRetry={() => loadInventory()}
              onAsk={askAssistant}
              assistantBusy={assistantBusy}
            />
          )}
          {view === 'discover' && <ComingSoonView title={t('nav.discover')} body={t('discover.body')} />}
          {view === 'history' && (
            <HistoryView conversations={conversations} currentId={agent.conversationId} onOpen={(id) => void openConversation(id)} />
          )}
        </div>
        <footer className={`statusbar is-${statusTone}`}>
          <span className="status-dot" />
          <span>{statusText}</span>
        </footer>
      </main>
    </div>
  )
}
