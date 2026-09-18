import type { CommandRisk } from '../../shared/types'

/**
 * Codex runs every command as `/bin/zsh -lc '<command>'`. People only need to
 * see the part inside.
 */
export function displayCommand(raw: string): string {
  const match = raw.match(/^\S*\/(?:zsh|bash|sh) -l?c (.*)$/s)
  if (!match) return raw
  const inner = match[1].trim()
  if (inner.startsWith("'") && inner.endsWith("'")) {
    return inner.slice(1, -1).replace(/'\\''/g, "'")
  }
  if (inner.startsWith('"') && inner.endsWith('"')) {
    return inner.slice(1, -1).replace(/\\"/g, '"')
  }
  return inner
}

/** Rough risk level used to colour the confirmation card. Most serious wins. */
export function classifyCommand(command: string): CommandRisk {
  const c = command.toLowerCase()
  if (/\bsudo\b/.test(c)) return 'admin'
  if (/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(c) || /\b(ba|z)?sh\s+-c\s+["']?\$\((curl|wget)/.test(c)) {
    return 'internet-script'
  }
  if (/\b(rm|rmdir|uninstall|remove|unlink|trash)\b/.test(c) || /\bbrew\s+(uninstall|rm|remove|cleanup)\b/.test(c)) {
    return 'remove'
  }
  if (/\b(install|upgrade|update|add|tap|clone)\b/.test(c)) return 'install'
  return 'change'
}
