import type { BrewInventory } from '../../shared/types'
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
      'List software installed with Homebrew on this Mac: name, type (command-line tool or app), installed version, whether an update is available, and a short description. Optionally filter by a search word.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Optional word to filter by name or description.' } },
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

/** Handles every tool except termless_ask_user, which needs the UI. */
export async function runTool(
  tool: string,
  args: any,
  deps: { memory: MemoryStore; getInventory: () => Promise<BrewInventory> }
): Promise<ToolResult> {
  switch (tool) {
    case 'termless_get_inventory': {
      const inventory = await deps.getInventory()
      if (!inventory.ok) {
        return { success: true, text: inventory.reason === 'not-installed' ? 'Homebrew is not installed.' : inventory.message }
      }
      const q = String(args?.query ?? '').toLowerCase().trim()
      const matches = inventory.packages.filter(
        (p) => !q || [p.name, p.displayName, p.description ?? ''].some((s) => s.toLowerCase().includes(q))
      )
      const lines = matches.slice(0, 120).map((p) => {
        const kind = p.kind === 'cask' ? 'app' : 'command-line tool'
        const update = p.outdated && p.latestVersion ? `, update available: ${p.latestVersion}` : ''
        return `- ${p.name} (${kind}, ${p.installedVersion}${update})${p.description ? `: ${p.description}` : ''}`
      })
      const more = matches.length > 120 ? `\n…and ${matches.length - 120} more. Use a query to narrow down.` : ''
      const header = `Homebrew ${inventory.brewVersion}. ${matches.length} of ${inventory.packages.length} packages${q ? ` matching "${q}"` : ''}:`
      return { success: true, text: matches.length ? `${header}\n${lines.join('\n')}${more}` : `No installed package matches "${q}".` }
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
