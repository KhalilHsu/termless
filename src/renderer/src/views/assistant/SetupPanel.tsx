import { useState } from 'react'
import type { SetupStatus } from '../../../../shared/types'
import { useI18n } from '../../i18n'
import { CheckIcon } from '../../icons'

export function isSetupComplete(status: SetupStatus | null): boolean {
  return Boolean(status && status.codex.installed && !status.codex.error && status.signedIn)
}

export function SetupPanel({
  status,
  onRefresh,
  onDone
}: {
  status: SetupStatus | null
  onRefresh: () => Promise<void>
  onDone: () => void
}) {
  const { t, lang } = useI18n()
  const [busy, setBusy] = useState<'install' | 'signin' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'install' | 'signin') => {
    setBusy(kind)
    setError(null)
    const result = kind === 'install' ? await window.termless.installCodex(lang) : await window.termless.signInToCodex()
    if (!result.ok && !result.cancelled) setError(result.message)
    setBusy(null)
    await onRefresh()
  }

  if (!status) {
    return (
      <div className="setup">
        <div className="spinner" />
        <p className="muted">{t('setup.checking')}</p>
      </div>
    )
  }

  const codexOk = status.codex.installed && !status.codex.error
  const complete = isSetupComplete(status)

  return (
    <div className="setup">
      <h2>{t('setup.title')}</h2>
      <p className="muted">{t('setup.body')}</p>

      <ol className="setup-steps">
        <Step done={status.homebrew.installed} title={t('setup.brew.title')}>
          {status.homebrew.installed ? (
            t('setup.brew.ok', { version: status.homebrew.version ?? '?' })
          ) : (
            <>
              {t('setup.brew.missing')}{' '}
              <button className="link" onClick={() => window.termless.openExternal('https://brew.sh')}>
                {t('setup.brew.open')}
              </button>
            </>
          )}
        </Step>

        <Step done={codexOk} title={t('setup.codex.title')}>
          {codexOk ? (
            t('setup.codex.ok', { version: status.codex.version ?? '?' })
          ) : busy === 'install' ? (
            t('setup.codex.installing')
          ) : (
            <>
              <span>{status.codex.installed ? t('setup.codex.broken') : t('setup.codex.missing')}</span>
              {status.codexInstallMethod ? (
                <button className="button button-primary step-button" onClick={() => run('install')} disabled={busy !== null}>
                  {status.codex.installed ? t('setup.codex.reinstall') : t('setup.codex.install')}
                </button>
              ) : (
                <span className="muted"> {t('setup.codex.noInstaller')}</span>
              )}
            </>
          )}
        </Step>

        <Step done={Boolean(status.signedIn)} title={t('setup.signin.title')}>
          {status.signedIn ? (
            t('setup.signin.ok', { account: status.accountLabel ?? 'ChatGPT' })
          ) : !codexOk ? (
            t('setup.signin.needsCodex')
          ) : busy === 'signin' ? (
            t('setup.signin.pending')
          ) : (
            <>
              <span>{t('setup.signin.missing')}</span>
              <button className="button button-primary step-button" onClick={() => run('signin')} disabled={busy !== null}>
                {t('setup.signin.button')}
              </button>
            </>
          )}
        </Step>
      </ol>

      {error && <p className="notice is-error">{t('setup.failed', { message: error })}</p>}

      <div className="setup-footer">
        <button className="button" onClick={() => void onRefresh()} disabled={busy !== null}>
          {t('setup.refresh')}
        </button>
        <button className="button button-primary" onClick={onDone} disabled={!complete}>
          {t('setup.start')}
        </button>
      </div>
    </div>
  )
}

function Step({ done, title, children }: { done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className={`setup-step ${done ? 'is-done' : ''}`}>
      <span className="setup-step-mark">{done ? <CheckIcon size={12} /> : null}</span>
      <div>
        <div className="setup-step-title">{title}</div>
        <div className="setup-step-body">{children}</div>
      </div>
    </li>
  )
}
