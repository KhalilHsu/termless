import { inspectRemoteScript } from '../../hostkit'
import type { InstalledItem, Inventory, ScriptFindingId, ScriptReport } from '../../shared/types'
import type { MemoryStore } from './memory'

// Tools Termless gives the agent (Codex "dynamic tools"). They are handled
// here in the app, so memory and UI stay under Termless's control no matter
// which agent is used.

const noArgs = { type: 'object', properties: {}, additionalProperties: false }

export const TOOL_SPECS = [
  {
    type: 'function',
    name: 'termless_get_inventory',
    description:
      'List software installed on this Mac, from every source Termless knows: Homebrew, App Store, apps in Applications, npm, pnpm, pipx, uv, cargo and go. For each item: which tool installed it, type (app or command-line tool), version, whether an update is available, a short description, and the exact commands to update or remove it. Filter by a search word and/or a source.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional word to filter by name or description.' },
        source: {
          type: 'string',
          enum: ['homebrew', 'appstore', 'apps', 'npm', 'pnpm', 'pipx', 'uv', 'cargo', 'go'],
          description: 'Optional: only items installed by this tool.'
        }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'termless_inspect_script',
    description:
      'Download (never run) the script that a command like `curl … | sh`, `bash -c "$(curl …)"` or `bash <(curl …)` would run, and report where it comes from, whether the publisher is well known, what risky things it does (administrator rights, deleting files, editing shell settings, background services, reading passwords…), and its text. Use it before running any script from the internet, then explain it to the user in plain words.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The full command, or just the script URL.' }
      },
      required: ['command'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'termless_run_as_admin',
    description:
      'Run one command as administrator (root). The user first approves a card, then macOS asks for their password in its own dialog. Use only when administrator rights are truly needed, never for brew, pipx, uv or cargo. Returns the command output.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command, without sudo.' },
        reason: { type: 'string', description: 'One plain sentence saying why administrator rights are needed, shown to the user.' }
      },
      required: ['command', 'reason'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'termless_ask_user',
    description:
      'Ask the user to choose between a few options. The app shows the question as a card with one button per option and waits for the answer. Use this instead of asking multiple-choice questions in text.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question, in plain words.' },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Short button text.' },
              description: { type: 'string', description: 'Optional one-line explanation.' }
            },
            required: ['label'],
            additionalProperties: false
          }
        },
        allow_other: { type: 'boolean', description: 'Also let the user type their own answer.' }
      },
      required: ['question', 'options'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'termless_remember',
    description:
      'Save a lasting fact about the user for future conversations (preferences, where they keep things, what was installed for them and why). One short sentence. Never store secrets.',
    inputSchema: {
      type: 'object',
      properties: { fact: { type: 'string' } },
      required: ['fact'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'termless_recall',
    description: 'Search the facts remembered about the user. Leave query empty to get all of them.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'termless_forget',
    description: 'Delete a remembered fact that turned out to be wrong or that the user asked you to forget.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Fact id from termless_recall.' } },
      required: ['id'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'termless_log_action',
    description:
      'Record a change you made on this Mac (installed, updated, removed or configured something) so it shows up in the user\'s history. Include how to undo it when possible.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Plain one-line summary, e.g. "Installed yt-dlp to download videos".' },
        undo: { type: 'string', description: 'How to undo it, e.g. "brew uninstall yt-dlp".' }
      },
      required: ['summary'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'termless_get_recent_actions',
    description: 'List changes Termless made on this Mac recently, newest last.',
    inputSchema: noArgs
  }
]

/** Short, user-facing description of a tool call for the activity line. */
export function describeToolCall(tool: string, args: any, lang: 'en' | 'zh'): string {
  const zh = lang === 'zh'
  switch (tool) {
    case 'termless_get_inventory':
      return zh ? '查看了已安装的软件' : 'Checked installed software'
    case 'termless_inspect_script':
      return zh ? '下载并检查了网上的脚本（没有运行）' : 'Downloaded and checked the script (did not run it)'
    case 'termless_remember':
      return (zh ? '记住了：' : 'Remembered: ') + String(args?.fact ?? '')
    case 'termless_recall':
      return zh ? '回想了之前记住的内容' : 'Looked through what it remembers'
    case 'termless_forget':
      return zh ? '忘掉了一条记忆' : 'Forgot a remembered fact'
    case 'termless_log_action':
      return (zh ? '记入历史：' : 'Added to history: ') + String(args?.summary ?? '')
    case 'termless_get_recent_actions':
      return zh ? '查看了最近的操作' : 'Checked recent changes'
    default:
      return tool
  }
}

export type ToolResult = { success: boolean; text: string }

/** Handles every tool except termless_ask_user and termless_run_as_admin, which need the UI. */
export async function runTool(
  tool: string,
  args: any,
  deps: { memory: MemoryStore; getInventory: () => Promise<Inventory> }
): Promise<ToolResult> {
  switch (tool) {
    case 'termless_get_inventory': {
      const inventory = await deps.getInventory()
      const q = String(args?.query ?? '').toLowerCase().trim()
      const source = args?.source ? String(args.source) : null
      const matches = inventory.items.filter(
        (i) =>
          (!source || i.source === source) &&
          (!q || [i.name, i.displayName, i.description ?? ''].some((s) => s.toLowerCase().includes(q)))
      )
      const sources = inventory.sources
        .map((s) => (s.status === 'ok' ? `${s.label} (${s.count})` : s.status === 'error' ? `${s.label} (could not be read: ${s.error})` : `${s.label} (not installed)`))
        .join(', ')
      const lines = matches.slice(0, 120).map(describeItem)
      const more = matches.length > 120 ? `\n…and ${matches.length - 120} more. Use a query or source to narrow down.` : ''
      const filter = [q && `matching "${q}"`, source && `from ${source}`].filter(Boolean).join(' ')
      const header = `Sources: ${sources}.\n${matches.length} of ${inventory.items.length} items${filter ? ` ${filter}` : ''}:`
      return { success: true, text: matches.length ? `${header}\n${lines.join('\n')}${more}` : `Sources: ${sources}.\nNothing installed ${filter || 'yet'}.` }
    }

    case 'termless_inspect_script': {
      const report = await inspectRemoteScript(String(args?.command ?? ''))
      if (!report) return { success: false, text: 'That is not a command that runs a script from the internet, and not a script URL.' }
      return { success: true, text: describeScriptReport(report) }
    }

    case 'termless_remember': {
      const fact = String(args?.fact ?? '').trim()
      if (!fact) return { success: false, text: 'fact is empty' }
      const stored = deps.memory.remember(fact, 'agent')
      return { success: true, text: `Saved (id ${stored.id}).` }
    }

    case 'termless_recall': {
      const facts = deps.memory.recall(args?.query)
      if (facts.length === 0) return { success: true, text: 'Nothing remembered that matches.' }
      return { success: true, text: facts.map((f) => `- [${f.id}] ${f.text}`).join('\n') }
    }

    case 'termless_forget': {
      const ok = deps.memory.forget(String(args?.id ?? ''))
      return { success: ok, text: ok ? 'Forgotten.' : 'No fact with that id.' }
    }

    case 'termless_log_action': {
      const summary = String(args?.summary ?? '').trim()
      if (!summary) return { success: false, text: 'summary is empty' }
      deps.memory.logAction(summary, args?.undo ? String(args.undo) : null)
      return { success: true, text: 'Recorded.' }
    }

    case 'termless_get_recent_actions': {
      const actions = deps.memory.recentActions(20)
      if (actions.length === 0) return { success: true, text: 'No recorded changes yet.' }
      return {
        success: true,
        text: actions.map((a) => `- ${a.at}: ${a.summary}${a.undo ? ` (undo: ${a.undo})` : ''}`).join('\n')
      }
    }

    default:
      return { success: false, text: `Unknown tool ${tool}` }
  }
}

/** One line per item for the agent, e.g. "- wget [Homebrew, command-line tool, 1.24.5, update available: 1.25.0]: … update: `brew upgrade wget`". */
function describeItem(item: InstalledItem): string {
  const kind = item.kind === 'app' ? 'app' : item.kind === 'cli' ? 'command-line tool' : 'package'
  const facts = [item.sourceLabel, kind, item.version ?? 'version unknown']
  if (item.outdated && item.latestVersion) facts.push(`update available: ${item.latestVersion}`)
  if (!item.installedOnRequest) facts.push('installed as a dependency')
  const name = item.displayName !== item.name ? `${item.displayName} ("${item.name}")` : item.name
  const commands = [
    item.executables.length ? `commands: ${item.executables.slice(0, 6).join(', ')}` : '',
    item.commands.upgrade ? `update: \`${item.commands.upgrade.display}\`` : '',
    item.commands.uninstall ? `remove: \`${item.commands.uninstall.display}\`${item.commands.uninstall.needsAdmin ? ' (needs administrator)' : ''}` : ''
  ].filter(Boolean)
  return `- ${name} [${facts.join(', ')}]${item.description ? `: ${item.description}` : ''}${commands.length ? `; ${commands.join('; ')}` : ''}`
}

/** What each finding means, for the agent. The app shows its own translated wording. */
export const FINDING_DESCRIPTIONS: Record<ScriptFindingId, string> = {
  admin: 'asks for administrator rights (sudo)',
  'delete-files': 'deletes files or folders',
  'delete-home': "deletes the user's home folder or the whole disk",
  'shell-profile': "changes the user's shell settings (e.g. ~/.zshrc)",
  'background-service': 'installs something that keeps running in the background or starts at login',
  'downloads-more': 'downloads more files from the internet',
  keychain: 'reads saved passwords from the macOS keychain',
  'uploads-private-files': 'sends private files (SSH keys, keychain, browser data…) to a server',
  'uploads-data': 'sends data to a server',
  'disables-protection': 'turns off macOS security protections',
  'removes-quarantine': "removes macOS's safety check from downloaded apps",
  'password-prompt': 'shows a fake password dialog',
  'remote-shell': 'gives someone else remote control of this Mac',
  obfuscated: 'hides what it does (encoded code)',
  'hosts-file': 'changes /etc/hosts (which websites addresses point to)',
  'insecure-download': 'is downloaded over plain http, which can be tampered with'
}

/** The agent's view of a script report. */
export function describeScriptReport(report: ScriptReport): string {
  const source = report.source
    ? `${report.source.host} — ${report.source.knownAs ? `well-known publisher: ${report.source.knownAs}` : 'NOT a publisher Termless recognizes'}${report.source.https ? '' : ' (plain http!)'}`
    : 'embedded in the command (base64)'
  const lines = [
    `Source: ${source}`,
    report.redirectedTo ? `Redirected to: ${report.redirectedTo.host}${report.redirectedTo.knownAs ? ` (${report.redirectedTo.knownAs})` : ''}` : '',
    report.error ? `Could not download it: ${report.error}` : `Size: ${report.bytes} bytes${report.truncated ? ' (only the start was checked)' : ''}`,
    `Verdict: ${
      report.verdict === 'blocked'
        ? 'BLOCKED — clearly malicious; Termless will refuse to run it. Warn the user and do not try to run it another way.'
        : report.verdict === 'caution'
          ? 'caution — explain the points below before the user decides'
          : 'nothing unusual found'
    }`,
    report.findings.length ? 'What it does:' : 'No risky actions found.',
    ...report.findings.map((f) => `- [${f.severity}] ${FINDING_DESCRIPTIONS[f.id]} — e.g. \`${f.evidence}\``),
    report.text ? `\nScript${report.text.length > 12_000 ? ' (first 12,000 characters)' : ''}:\n${report.text.slice(0, 12_000)}` : ''
  ]
  return lines.filter(Boolean).join('\n')
}
