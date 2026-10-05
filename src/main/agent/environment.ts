import { arch, homedir, userInfo } from 'node:os'
import { runText } from '../../hostkit'
import { quickNetworkCheck } from '../network'
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
    networkFacts()
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

/** First line of the quick network check, plus the proxy situation when it matters. */
async function networkFacts(): Promise<string> {
  try {
    const report = await quickNetworkCheck()
    const lines = report.summary.split('\n')
    const proxy = lines.filter((l) => /proxy/i.test(l) && !l.startsWith('- '))
    return [lines[0], ...proxy].join(' ')
  } catch {
    return 'unknown (the check failed)'
  }
}
