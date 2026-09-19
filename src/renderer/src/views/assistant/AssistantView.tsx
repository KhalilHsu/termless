import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AgentState, SetupStatus } from '../../../../shared/types'
import { useI18n, type Key } from '../../i18n'
import { ViewHeader } from '../ViewHeader'
import { MemoryDrawer } from './MemoryDrawer'
import { isSetupComplete, SetupPanel } from './SetupPanel'
import { TimelineView } from './Timeline'

const SETUP_DONE_KEY = 'termless.setupDone'

function readSetupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === '1'
  } catch {
    return false
  }
}

const EXAMPLES: Key[] = ['assistant.example.1', 'assistant.example.2', 'assistant.example.3']

export function AssistantView({
  agent,
  setup,
  refreshSetup
}: {
  agent: AgentState
  setup: SetupStatus | null
  refreshSetup: () => Promise<void>
}) {
  const { t, lang } = useI18n()
  const [draft, setDraft] = useState('')
  const [setupDone, setSetupDone] = useState(readSetupDone)
  const [showMemory, setShowMemory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  const busy = agent.phase === 'working' || agent.phase === 'starting'
  const agentError = agent.phase === 'error' && agent.error && ['codex-missing', 'codex-broken', 'signed-out'].includes(agent.error)
  const showSetup = !setupDone || (setup !== null && !isSetupComplete(setup)) || agentError

  // If sending failed because Codex isn't ready, re-check so the setup panel is accurate.
  useEffect(() => {
    if (agentError) void refreshSetup()
  }, [agentError, refreshSetup])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [agent.timeline])

  const send = (text: string) => {
    if (!text.trim() || busy) return
    stickToBottom.current = true
    void window.termless.sendMessage(text, lang)
    setDraft('')
  }

  const finishSetup = () => {
    try {
      localStorage.setItem(SETUP_DONE_KEY, '1')
    } catch {
      // not critical
    }
    setSetupDone(true)
  }

  const last = agent.timeline[agent.timeline.length - 1]
  const waitingOnUser = agent.timeline.some(
    (item) => (item.kind === 'command' && item.status === 'awaiting-approval') || (item.kind === 'question' && item.answer === null && !item.expired)
  )
  const showThinking =
    busy && !waitingOnUser && !(last?.kind === 'agent' && last.streaming && last.text) && !(last?.kind === 'command' && last.status === 'running')

  return (
    <div className="view">
      <ViewHeader
        title={agent.conversationTitle ?? t('assistant.title')}
        subtitle={agent.model ? t('assistant.model', { model: agent.model }) : t('assistant.subtitle')}
      >
        {agent.savingMemory && <span className="muted small saving">{t('assistant.savingMemory')}</span>}
        <button className="button" onClick={() => setShowMemory(true)}>
          {t('assistant.memory')}
        </button>
        <button className="button" onClick={() => void window.termless.newConversation()} disabled={agent.timeline.length === 0}>
          {t('assistant.newChat')}
        </button>
      </ViewHeader>

      {showSetup ? (
        <div className="assistant-scroll">
          <SetupPanel status={setup} onRefresh={refreshSetup} onDone={finishSetup} />
        </div>
      ) : (
        <>
          <div
            className="assistant-scroll"
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}
          >
            {agent.timeline.length === 0 ? (
              <div className="welcome">
                <h2>{t('assistant.welcome.title')}</h2>
                <p className="muted">{t('assistant.welcome.body')}</p>
                <div className="examples">
                  {EXAMPLES.map((key) => (
                    <button key={key} className="example" onClick={() => send(t(key))}>
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="timeline">
                <TimelineView items={agent.timeline} />
                {showThinking && (
                  <div className="thinking">
                    <span className="spinner spinner-small" />
                    {agent.phase === 'starting' ? t('assistant.starting') : t('assistant.thinking')}
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            <textarea
              value={draft}
              placeholder={t('assistant.placeholder')}
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Don't send while an input method (e.g. Chinese pinyin) is composing.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send(draft)
                }
              }}
            />
            <div className="composer-bar">
              <span className="muted small">{t('assistant.hint')}</span>
              {busy ? (
                <button type="button" className="button" onClick={() => void window.termless.interrupt()}>
                  {t('assistant.stop')}
                </button>
              ) : (
                <button type="submit" className="button button-primary" disabled={!draft.trim()}>
                  {t('assistant.send')}
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {showMemory && <MemoryDrawer onClose={() => setShowMemory(false)} />}
    </div>
  )
}
