import type { PackageSource } from '../types.ts'
import { applications, appStore } from './applications.ts'
import { cargo, goInstall } from './compiled.ts'
import { homebrew } from './homebrew.ts'
import { npm, pnpm } from './node.ts'
import { pipx, uvTool } from './python.ts'

export { applications, appStore, parseMasOutdated } from './applications.ts'
export { cargo, goInstall, parseCargoList, parseGoVersionM } from './compiled.ts'
export { findHomebrew, homebrew, homebrewPrefix, HOMEBREW_CANDIDATES } from './homebrew.ts'
export { npm, parsePnpmList, pnpm } from './node.ts'
export { parsePipx, parseUvToolList, pipx, uvTool } from './python.ts'

/**
 * Every source hostkit ships, in display order. Homebrew comes before the
 * app folders so its casks claim their apps first.
 */
export function defaultSources(): PackageSource[] {
  return [homebrew, appStore, applications, npm, pnpm, pipx, uvTool, cargo, goInstall]
}
