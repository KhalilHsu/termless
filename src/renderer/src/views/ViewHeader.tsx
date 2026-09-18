import type { ReactNode } from 'react'

export function ViewHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="view-header titlebar-drag">
      <div>
        <h1 className="view-title">{title}</h1>
        <p className="view-subtitle">{subtitle}</p>
      </div>
      {children ? <div className="view-header-tools no-drag">{children}</div> : null}
    </header>
  )
}
