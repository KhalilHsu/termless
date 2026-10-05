import { useEffect, useMemo, useState } from 'react'
import type { InstalledItem, Inventory, ItemKind } from '../../../shared/types'
import type { InventoryState } from '../App'
import { useI18n, type Key, type Translate } from '../i18n'
import { AppIcon, ArrowUpRightIcon, BoxIcon, CheckIcon, SearchIcon, TerminalIcon } from '../icons'
import { useHomebrewInstall } from '../useHomebrewInstall'
import { ViewHeader } from './ViewHeader'

type Filter = 'all' | 'app' | 'cli' | 'updates'

/** Source-specific facts worth showing, in this order. */
const EXTRA_FACTS: { key: string; label: Key }[] = [
  { key: 'tap', label: 'detail.tap' },
  { key: 'origin', label: 'detail.origin' },
  { key: 'module', label: 'detail.module' },
  { key: 'python', label: 'detail.python' },
  { key: 'category', label: 'detail.category' },
  { key: 'bundleId', label: 'detail.bundleId' }
]

export function InstalledView({
  state,
  onRetry,
  onAsk,
  assistantBusy
}: {
  state: InventoryState
  onRetry: () => void
  onAsk: (prompt: string) => void
  assistantBusy: boolean
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [source, setSource] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const inventory = state.status === 'done' ? state.inventory : null
  const items = inventory?.items ?? []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (source !== 'all' && i.source !== source) return false
      if (filter === 'app' && i.kind !== 'app') return false
      if (filter === 'cli' && i.kind !== 'cli') return false
      if (filter === 'updates' && !i.outdated) return false
      if (!q) return true
      return [i.name, i.displayName, i.description ?? '', i.sourceLabel].some((s) => s.toLowerCase().includes(q))
    })
  }, [items, query, filter, source])

  const selected = items.find((i) => i.id === selectedId) ?? visible[0] ?? null
  const updates = items.filter((i) => i.outdated).length

  const selectByName = (name: string, fromSource: string) => {
    const target = items.find((i) => i.name === name && i.source === fromSource)
    if (!target) return
    setQuery('')
    setFilter('all')
    setSource('all')
    setSelectedId(target.id)
  }

  const header = (
    <ViewHeader title={t('installed.title')} subtitle={t('installed.subtitle')}>
      <label className="search">
        <SearchIcon size={16} />
        <input
          type="search"
          value={query}
          placeholder={t('installed.search')}
          onChange={(e) => setQuery(e.target.value)}
          disabled={items.length === 0}
        />
      </label>
    </ViewHeader>
  )

  if (!inventory) {
    return (
      <div className="view">
        {header}
        <div className="empty-state">
          <div className="spinner" />
          <p>{t('status.loading')}</p>
        </div>
      </div>
    )
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('installed.filter.all') },
    { id: 'app', label: t('installed.filter.app') },
    { id: 'cli', label: t('installed.filter.cli') },
    { id: 'updates', label: `${t('installed.filter.updates')} ${updates}` }
  ]
  const shownSources = inventory.sources.filter((s) => s.status === 'ok' && s.count > 0)

  return (
    <div className="view">
      {header}
      <div className="split">
        <section className="list-pane">
          <div className="list-head">
            <div className="list-head-row">
              <h2>{t('installed.heading')}</h2>
              <select className="source-select" value={source} onChange={(e) => setSource(e.target.value)} aria-label={t('installed.source')}>
                <option value="all">{t('installed.allSources', { count: shownSources.length })}</option>
                {shownSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sourceName(t, s.id, s.label)} ({s.count})
                  </option>
                ))}
              </select>
            </div>
            <p className="muted">{t('installed.count', { count: items.length })}</p>
            <div className="segmented" role="tablist">
              {filters.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  className={filter === f.id ? 'is-active' : ''}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <SourceNotices inventory={inventory} onRetry={onRetry} />
          </div>
          <ul className="package-list">
            {visible.length === 0 && <li className="list-empty muted">{t(items.length ? 'installed.empty' : 'installed.nothing')}</li>}
            {visible.map((item) => (
              <li key={item.id}>
                <button className={`package-row ${selected?.id === item.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(item.id)}>
                  <KindIcon kind={item.kind} />
                  <div className="package-row-body">
                    <div className="package-row-title">
                      <span className="package-name">{item.displayName}</span>
                      <SourceBadge item={item} />
                      {item.outdated ? (
                        <span className="badge badge-outline">{t('badge.outdated')}</span>
                      ) : item.latestVersion ? (
                        <span className="badge-check" title={t('badge.upToDate')}>
                          <CheckIcon size={12} />
                        </span>
                      ) : null}
                    </div>
                    <p className="package-desc">{item.description ?? t(`kind.${item.kind}`)}</p>
                    {item.version && (
                      <p className="package-version">
                        v{item.version}
                        {item.outdated && item.latestVersion ? (
                          <>
                            {' → '}
                            <span className="accent">v{item.latestVersion}</span>
                          </>
                        ) : null}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="detail-pane">
          {selected ? (
            <ItemDetail item={selected} onSelectName={selectByName} onAsk={onAsk} assistantBusy={assistantBusy} />
          ) : (
            <div className="empty-state">
              <p>{t('installed.select')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** Problems with individual sources, and an offer to install Homebrew when it is missing. */
function SourceNotices({ inventory, onRetry }: { inventory: Inventory; onRetry: () => void }) {
  const { t } = useI18n()
  const homebrew = inventory.sources.find((s) => s.id === 'homebrew')
  const failed = inventory.sources.filter((s) => s.status === 'error')
  const install = useHomebrewInstall(onRetry)

  return (
    <>
      {failed.map((s) => (
        <p key={s.id} className="notice is-error source-notice">
          {t('installed.sourceFailed', { source: s.label })}
          <span className="source-notice-detail">{s.error}</span>
          <button className="link" onClick={onRetry}>
            {t('installed.retry')}
          </button>
        </p>
      ))}
      {homebrew?.status === 'missing' && (
        <div className="notice source-notice">
          {install.status ?? t('installed.noBrew')}
          {!install.busy && (
            <button className="link" onClick={() => void install.start()}>
              {t('brewInstall.button')}
            </button>
          )}
          {install.error && <span className="source-notice-detail">{t('setup.failed', { message: install.error })}</span>}
        </div>
      )}
    </>
  )
}

function KindIcon({ kind, large }: { kind: ItemKind; large?: boolean }) {
  const size = large ? 26 : 18
  return (
    <span className={`package-icon is-${kind} ${large ? 'is-large' : ''}`}>
      {kind === 'app' ? <AppIcon size={size} /> : kind === 'cli' ? <TerminalIcon size={size} /> : <BoxIcon size={size} />}
    </span>
  )
}

function SourceBadge({ item }: { item: InstalledItem }) {
  const { t } = useI18n()
  return <span className={`badge badge-source is-${item.kind}`}>{sourceName(t, item.source, item.sourceLabel)}</span>
}

function sourceName(t: Translate, id: string, label: string): string {
  return id === 'apps' ? t('source.apps') : label
}

function ItemDetail({
  item,
  onSelectName,
  onAsk,
  assistantBusy
}: {
  item: InstalledItem
  onSelectName: (name: string, source: string) => void
  onAsk: (prompt: string) => void
  assistantBusy: boolean
}) {
  const { t } = useI18n()
  const source = sourceName(t, item.source, item.sourceLabel)
  const promptVars = { name: item.displayName, kind: t(`kind.${item.kind}`), id: item.name, source }
  const hasDependencyInfo = item.source === 'homebrew' || item.dependencies.length > 0 || item.dependents.length > 0
  const shownCommand = item.outdated && item.commands.upgrade ? item.commands.upgrade : item.commands.uninstall

  return (
    <div className="detail" key={item.id}>
      <div className="detail-head">
        <KindIcon kind={item.kind} large />
        <div>
          <div className="detail-title">
            <h2>{item.displayName}</h2>
            <SourceBadge item={item} />
            {item.outdated && <span className="badge badge-outline">{t('badge.outdated')}</span>}
            {!item.installedOnRequest && <span className="badge badge-outline">{t('badge.dependency')}</span>}
          </div>
          <p className="muted">{item.description ?? t('detail.noDescription')}</p>
        </div>
      </div>

      <DetailSection title={t('detail.details')}>
        <dl className="facts">
          <dt>{t('detail.kind')}</dt>
          <dd>{t(`kind.${item.kind}`)}</dd>
          <dt>{t('detail.installedWith')}</dt>
          <dd>{source}</dd>
          {item.version && (
            <>
              <dt>{t('detail.installed')}</dt>
              <dd className={item.outdated ? 'accent strong' : ''}>{item.version}</dd>
            </>
          )}
          {item.latestVersion && (
            <>
              <dt>{t('detail.latest')}</dt>
              <dd>{item.latestVersion}</dd>
            </>
          )}
          {item.location && (
            <>
              <dt>{t('detail.size')}</dt>
              <dd>
                <ItemSize id={item.id} />
              </dd>
            </>
          )}
          {item.executables.length > 0 && (
            <>
              <dt>{t('detail.commands')}</dt>
              <dd className="mono">{item.executables.join(', ')}</dd>
            </>
          )}
          {EXTRA_FACTS.filter((f) => item.extra[f.key]).map((f) => (
            <FactRow key={f.key} label={t(f.label)} value={item.extra[f.key]} />
          ))}
          {item.homepage && (
            <>
              <dt>{t('detail.homepage')}</dt>
              <dd>
                <button className="link" onClick={() => window.termless.openExternal(item.homepage!)}>
                  {hostOf(item.homepage)}
                  <ArrowUpRightIcon size={13} />
                </button>
              </dd>
            </>
          )}
          {item.location && (
            <>
              <dt>{t('detail.location')}</dt>
              <dd>
                <button className="link" onClick={() => void window.termless.revealItem(item.id)}>
                  {t('detail.showInFinder')}
                </button>
              </dd>
            </>
          )}
        </dl>
      </DetailSection>

      {hasDependencyInfo && (
        <>
          <DetailSection title={t('detail.dependencies')}>
            <NameChips names={item.dependencies} empty={t('detail.noDependencies')} onSelect={(n) => onSelectName(n, item.source)} />
          </DetailSection>
          <DetailSection title={t('detail.dependents')}>
            <NameChips names={item.dependents} empty={t('detail.noDependents')} onSelect={(n) => onSelectName(n, item.source)} />
          </DetailSection>
        </>
      )}

      <DetailSection title={t('detail.actions')}>
        <div className="actions">
          {item.outdated && item.commands.upgrade && (
            <button className="button button-primary" disabled={assistantBusy} onClick={() => onAsk(t('prompt.upgrade', promptVars))}>
              {item.latestVersion ? t('detail.upgrade', { version: item.latestVersion }) : t('detail.upgradeNoVersion')}
            </button>
          )}
          {item.commands.uninstall && (
            <button className="button" disabled={assistantBusy} onClick={() => onAsk(t('prompt.uninstall', promptVars))}>
              {item.kind === 'app' ? t('detail.moveToTrash') : t('detail.uninstall')}
            </button>
          )}
          <button className="button" disabled={assistantBusy} onClick={() => onAsk(t('prompt.useIt', promptVars))}>
            {t('detail.useIt')}
          </button>
        </div>
        <p className="muted small">{t('detail.actionsHint')}</p>
        {shownCommand && <CommandDisclosure command={shownCommand.display} />}
      </DetailSection>
    </div>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

/** Measured when the item is opened; big apps take a moment. */
function ItemSize({ id }: { id: string }) {
  const { t, lang } = useI18n()
  const [size, setSize] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    let current = true
    setSize(undefined)
    window.termless.getItemSize(id).then((bytes) => current && setSize(bytes))
    return () => {
      current = false
    }
  }, [id])
  if (size === undefined) return <span className="muted">{t('detail.measuring')}</span>
  if (size === null) return <span className="muted">{t('detail.unknown')}</span>
  return <>{formatBytes(size, lang)}</>
}

function formatBytes(bytes: number, lang: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1
  return `${value.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: digits })} ${units[unit]}`
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function NameChips({ names, empty, onSelect }: { names: string[]; empty: string; onSelect: (name: string) => void }) {
  if (names.length === 0) return <p className="muted">{empty}</p>
  return (
    <div className="chips">
      {names.map((name) => (
        <button key={name} className="chip" onClick={() => onSelect(name)}>
          {name}
        </button>
      ))}
    </div>
  )
}

// Principle: commands stay folded away by default; people who want to see
// exactly what runs can open them.
function CommandDisclosure({ command }: { command: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable; nothing else to do
    }
  }

  return (
    <div className="command">
      <button className="command-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <TerminalIcon size={15} />
        {open ? t('detail.hideCommand') : t('detail.showCommand')}
      </button>
      {open && (
        <div className="command-box">
          <code>{command}</code>
          <button className="link" onClick={copy}>
            {copied ? t('detail.copied') : t('detail.copy')}
          </button>
        </div>
      )}
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}
