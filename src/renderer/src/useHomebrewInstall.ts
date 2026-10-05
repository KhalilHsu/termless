import { useEffect, useState } from 'react'
import type { SetupProgress } from '../../shared/types'
import { useI18n } from './i18n'

/**
 * Installing Homebrew from the UI: Termless explains and asks first, then
 * macOS asks for the password in its own window. Used by the setup checklist
 * and the Installed tab.
 */
export function useHomebrewInstall(onFinished: () => void | Promise<void>) {
  const { t, lang } = useI18n()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<SetupProgress>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.termless.onSetupProgress(setProgress), [])

  const start = async () => {
    setBusy(true)
    setError(null)
    const result = await window.termless.installHomebrew(lang)
    if (!result.ok && !result.cancelled) setError(result.message)
    setBusy(false)
    setProgress(null)
    await onFinished()
  }

  let status: string | null = null
  if (busy) {
    switch (progress?.step) {
      case 'downloading':
        status = t('brewInstall.downloading', { percent: Math.round((progress.fraction ?? 0) * 100) })
        break
      case 'verifying':
        status = t('brewInstall.verifying')
        break
      case 'waiting-for-password':
        status = t('brewInstall.password')
        break
      case 'installing-command-line-tools':
        status = t('brewInstall.clt')
        break
      case 'installing-homebrew':
        status = t('brewInstall.installing')
        break
      default:
        status = t('brewInstall.starting')
    }
  }

  return { busy, status, error, start }
}
