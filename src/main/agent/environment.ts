import { arch, homedir, userInfo } from 'node:os'
import { runText } from '../../hostkit'
import type { Inventory, SourceReport } from '../../shared/types'

// Layer 2 of the agent's context: a short, factual picture of this Mac,
// gathered fresh at the start of every conversation.

export interface MacEnvironment {
  macosVersion: string
  chip: string
  shell: string
  home: string
  homebrew: string
  /** One line per other package manager that is installed. */
  otherSources: string[]
  network: string
}

export async function collectEnvironment(inventory: Inventory | null): Promise<MacEnvironment> {
  const [macosVersion, network] = await Promise.all([
    runText('/usr/bin/sw_vers', ['-productVersion'], { timeoutMs: 5000 })
      .then((v) => v.trim())
      .catch(() => 'unknown'),
    checkNetwork()
  ])

  let homebrew = 'not installed'
  const otherSources: string[] = []
  for (const source of inventory?.sources ?? []) {
    if (source.status === 'missing') continue
    const line = describeSource(source, inventory!)
    if (source.id === 'homebrew') homebrew = line
    else otherSources.push(line)
  }

  return {
    macosVersion,
    chip: arch() === 'arm64' ? 'Apple silicon (arm64)' : `Intel (${arch()})`,
    shell: userInfo().shell ?? '/bin/zsh',
    home: homedir(),
    homebrew,
    otherSources,
    network
  }
}

/** e.g. "npm 11.12.1 at /opt/homebrew/bin/npm: 4 packages, 2 with updates available" */
function describeSource(source: SourceReport, inventory: Inventory): string {
  const isApps = source.id === 'apps' || source.id === 'appstore'
  const name = `${source.label}${source.version ? ` ${source.version}` : ''}${source.path && !isApps ? ` at ${source.path}` : ''}`
  if (source.status === 'error') return `${name}: installed, but its list could not be read`
  const items = inventory.items.filter((i) => i.source === source.id)
  const outdated = items.filter((i) => i.outdated).length
  return `${name}: ${items.length} ${isApps ? 'apps' : 'packages'}${outdated ? `, ${outdated} with updates available` : ''}`
}

async function checkNetwork(): Promise<string> {
  const targets = [
    ['GitHub', 'https://github.com'],
    ['Homebrew', 'https://formulae.brew.sh'],
    ['OpenAI', 'https://api.openai.com']
  ] as const

  const results = await Promise.all(
    targets.map(async ([name, url]) => {
      try {
        await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
        return [name, true] as const
      } catch {
        return [name, false] as const
      }
    })
  )

  const unreachable = results.filter(([, ok]) => !ok).map(([name]) => name)
  if (unreachable.length === 0) return 'online; GitHub, Homebrew and OpenAI are reachable'
  if (unreachable.length === results.length) return 'appears to be offline (GitHub, Homebrew and OpenAI all unreachable)'
  return `online, but these could not be reached: ${unreachable.join(', ')}`
}
