import { useI18n } from '../i18n'
import { ViewHeader } from './ViewHeader'

export function ComingSoonView({ title, body }: { title: string; body: string }) {
  const { t } = useI18n()
  return (
    <div className="view">
      <ViewHeader title={title} subtitle={t('soon.title')} />
      <div className="empty-state">
        <span className="pill">{t('soon.title')}</span>
        <p>{body}</p>
      </div>
    </div>
  )
}
