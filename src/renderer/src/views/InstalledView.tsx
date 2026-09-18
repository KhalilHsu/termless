import { useMemo, useState } from 'react'
import type { InstalledPackage } from '../../../shared/types'
import type { InventoryState } from '../App'
import { useI18n } from '../i18n'
import { ArrowUpRightIcon, BoxIcon, CheckIcon, SearchIcon, TerminalIcon } from '../icons'
import { ViewHeader } from './ViewHeader'

type Filter = 'all' | 'formula' | 'cask' | 'updates'

export function InstalledView({ state, onRetry }: { state: InventoryState; onRetry: () => void }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const packages = state.status === 'done' && state.inventory.ok ? state.inventory.packages : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return packages.filter((p) => {
      if (filter === 'formula' && p.kind !== 'formula') return false
      if (filter === 'cask' && p.kind !== 'cask') return false
      if (filter === 'updates' && !p.outdated) return false
      if (!q) return true
      return [p.name, p.displayName, p.description ?? ''].some((s) => s.toLowerCase().includes(q))
    })
  }, [packages, query, filter])

  const selected = packages.find((p) => p.id === selectedId) ?? visible[0] ?? null
  const updates = packages.filter((p) => p.outdated).length

  const selectByName = (name: string) => {
    const target = packages.find((p) => p.name === name)
    if (!target) return
    setQuery('')
    setFilter('all')
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
          disabled={packages.length === 0}
        />
      </label>
    </ViewHeader>
  )

  if (state.status === 'loading') {
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

  if (!state.inventory.ok) {
    const notInstalled = state.inventory.reason === 'not-installed'
    return (
      <div className="view">
        {header}
        <div className="empty-state">
          <h2>{notInstalled ? t('installed.noBrew.title') : t('status.error')}</h2>
          <p>{notInstalled ? t('installed.noBrew.body') : state.inventory.message}</p>
          {!notInstalled && (
            <button className="button" onClick={onRetry}>
              {t('installed.retry')}
            </button>
          )}
        </div>
      </div>
    )
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('installed.filter.all') },
    { id: 'formula', label: t('installed.filter.formula') },
    { id: 'cask', label: t('installed.filter.cask') },
    { id: 'updates', label: `${t('installed.filter.updates')} ${updates}` }
  ]

  return (
    <div className="view">
      {header}
      <div className="split">
        <section className="list-pane">
          <div className="list-head">
            <h2>{t('installed.heading')}</h2>
            <p className="muted">{t('installed.count', { count: packages.length })}</p>
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
          </div>
          <ul className="package-list">
            {visible.length === 0 && <li className="list-empty muted">{t('installed.empty')}</li>}
            {visible.map((p) => (
              <li key={p.id}>
                <button
                  className={`package-row ${selected?.id === p.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <PackageIcon kind={p.kind} />
                  <div className="package-row-body">
                    <div className="package-row-title">
                      <span className="package-name">{p.displayName}</span>
                      <KindBadge pkg={p} />
                      {p.outdated ? (
                        <span className="badge badge-outline">{t('badge.outdated')}</span>
                      ) : (
                        <span className="badge-check" title={t('badge.upToDate')}>
                          <CheckIcon size={12} />
                        </span>
                      )}
                    </div>
                    <p className="package-desc">{p.description ?? t('detail.noDescription')}</p>
                    <p className="package-version">
                      v{p.installedVersion}
                      {p.outdated && p.latestVersion ? (
                        <>
                          {' → '}
                          <span className="accent">v{p.latestVersion}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="detail-pane">
          {selected ? (
            <PackageDetail pkg={selected} onSelectName={selectByName} />
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

function PackageIcon({ kind, large }: { kind: InstalledPackage['kind']; large?: boolean }) {
  return (
    <span className={`package-icon is-${kind} ${large ? 'is-large' : ''}`}>
      <BoxIcon size={large ? 26 : 18} />
    </span>
  )
}

function KindBadge({ pkg }: { pkg: InstalledPackage }) {
  const { t } = useI18n()
  return <span className={`badge badge-${pkg.kind}`}>{t(pkg.kind === 'formula' ? 'kind.formula' : 'kind.cask')}</span>
}

function PackageDetail({ pkg, onSelectName }: { pkg: InstalledPackage; onSelectName: (name: string) => void }) {
  const { t } = useI18n()

  return (
    <div className="detail" key={pkg.id}>
      <div className="detail-head">
        <PackageIcon kind={pkg.kind} large />
        <div>
          <div className="detail-title">
            <h2>{pkg.displayName}</h2>
            <KindBadge pkg={pkg} />
            {pkg.outdated && <span className="badge badge-outline">{t('badge.outdated')}</span>}
            {!pkg.installedOnRequest && <span className="badge badge-outline">{t('badge.dependency')}</span>}
          </div>
          <p className="muted">{pkg.description ?? t('detail.noDescription')}</p>
        </div>
      </div>

      <DetailSection title={t('detail.details')}>
        <dl className="facts">
          <dt>{t('detail.installed')}</dt>
          <dd className={pkg.outdated ? 'accent strong' : ''}>{pkg.installedVersion}</dd>
          {pkg.latestVersion && (
            <>
              <dt>{t('detail.latest')}</dt>
              <dd>{pkg.latestVersion}</dd>
            </>
          )}
          {pkg.tap && (
            <>
              <dt>{t('detail.source')}</dt>
              <dd>{pkg.tap}</dd>
            </>
          )}
          {pkg.homepage && (
            <>
              <dt>{t('detail.homepage')}</dt>
              <dd>
                <button className="link" onClick={() => window.termless.openExternal(pkg.homepage!)}>
                  {hostOf(pkg.homepage)}
                  <ArrowUpRightIcon size={13} />
                </button>
              </dd>
            </>
          )}
        </dl>
      </DetailSection>

      <DetailSection title={t('detail.dependencies')}>
        <NameChips names={pkg.dependencies} empty={t('detail.noDependencies')} onSelect={onSelectName} />
      </DetailSection>

      <DetailSection title={t('detail.dependents')}>
        <NameChips names={pkg.dependents} empty={t('detail.noDependents')} onSelect={onSelectName} />
      </DetailSection>

      <DetailSection title={t('detail.actions')}>
        <div className="actions">
          {pkg.outdated && pkg.latestVersion && (
            <button className="button button-primary" disabled>
              {t('detail.upgrade', { version: pkg.latestVersion })}
            </button>
          )}
          <button className="button" disabled>
            {t('detail.uninstall')}
          </button>
        </div>
        <p className="muted small">{t('detail.actionsSoon')}</p>
        <CommandDisclosure
          command={pkg.outdated ? upgradeCommand(pkg) : uninstallCommand(pkg)}
        />
      </DetailSection>
    </div>
  )
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

function upgradeCommand(pkg: InstalledPackage): string {
  return pkg.kind === 'cask' ? `brew upgrade --cask ${pkg.name}` : `brew upgrade ${pkg.name}`
}

function uninstallCommand(pkg: InstalledPackage): string {
  return pkg.kind === 'cask' ? `brew uninstall --cask ${pkg.name}` : `brew uninstall ${pkg.name}`
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}
