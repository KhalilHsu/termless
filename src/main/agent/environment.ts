import { arch, homedir, userInfo } from 'node:os'
import type { BrewInventory } from '../../shared/types'
import { run } from '../env'

// Layer 2 of the agent's context: a short, factual picture of this Mac,
// gathered fresh at the start of every conversation.

export interface MacEnvironment {
  macosVersion: string
  chip: string
  shell: string
  home: string
  homebrew: string
  network: string
}

export async function collectEnvironment(inventory: BrewInventory | null): Promise<MacEnvironment> {
  const [macosVersion, network] = await Promise.all([
    run('/usr/bin/sw_vers', ['-productVersion'], { timeoutMs: 5000 })
      .then((v) => v.trim())
      .catch(() => 'unknown'),
    checkNetwork()
  ])

  let homebrew = 'not installed'
  if (inventory?.ok) {
    const outdated = inventory.packages.filter((p) => p.outdated).length
    homebrew = `Homebrew ${inventory.brewVersion} at ${inventory.brewPath}; ${inventory.packages.length} packages installed, ${outdated} with updates available`
  } else if (inventory && inventory.reason === 'failed') {
    homebrew = 'installed, but its package list could not be read'
  }

  return {
    macosVersion,
    chip: arch() === 'arm64' ? 'Apple silicon (arm64)' : `Intel (${arch()})`,
    shell: userInfo().shell ?? '/bin/zsh',
    home: homedir(),
    homebrew,
    network
  }
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
