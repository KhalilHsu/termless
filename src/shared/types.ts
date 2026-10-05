// Types shared by the main process, the preload bridge and the renderer.

// What is installed on this Mac comes from hostkit (src/hostkit), Termless's
// standalone module for package managers; its types are plain data.
import type { HomebrewInstallStep, HomebrewSupport, Inventory, NetworkReport, ScriptReport } from '../hostkit/types'

export type {
  CommandSpec,
  HomebrewInstallStep,
  InstalledItem,
  Inventory,
  ItemKind,
  NetworkProbe,
  NetworkReport,
  ScriptFinding,
  ScriptFindingId,
  ScriptReport,
  SourceReport
} from '../hostkit/types'

export interface CodexStatus {
  installed: boolean
  path: string | null
  version: string | null
  /** Set when a codex binary exists but could not be run. */
  error: string | null
}

// ---------------------------------------------------------------------------
// Setup (first-run checklist)

export interface SetupStatus {
  homebrew: {
    installed: boolean
    version: string | null
    /** Whether Termless can install it here (Apple silicon, macOS 15+). */
    canInstall: boolean
    cannotInstallReason: Exclude<HomebrewSupport, { ok: true }>['reason'] | null
  }
  /** Apple's Command Line Tools (git, compilers), which Homebrew needs. */
  commandLineTools: boolean
  codex: CodexStatus
  /** null while unknown (e.g. Codex missing or not reachable). */
  signedIn: boolean | null
  accountLabel: string | null
  /** How Termless would install Codex, if it can. */
  codexInstallMethod: 'brew' | 'npm' | null
}

export type SetupActionResult = { ok: true } | { ok: false; message: string; cancelled?: boolean }

/** Progress of a long setup task, pushed to the UI while it runs. */
export type SetupProgress = { task: 'homebrew'; step: HomebrewInstallStep; fraction?: number } | null

// ---------------------------------------------------------------------------
// Assistant

/** How much a command could change the Mac, shown on the confirmation card. */
export type CommandRisk = 'change' | 'install' | 'remove' | 'admin' | 'internet-script'

export type TimelineItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string; streaming: boolean; final: boolean }
  | {
      kind: 'command'
      id: string
      command: string
      /** checking: a script from the internet is being downloaded and looked at. blocked: Termless refused it. */
      status: 'checking' | 'awaiting-approval' | 'running' | 'done' | 'failed' | 'declined' | 'stopped' | 'blocked'
      risk: CommandRisk
      /** Why it is needed, when the agent said so (administrator requests). */
      reason?: string
      /** What Termless found in the script a command would download and run. */
      script?: ScriptReport
      output: string | null
      exitCode: number | null
    }
  | { kind: 'activity'; id: string; tool: string; summary: string; status: 'running' | 'done' | 'failed' }
  /** A network check the agent ran; report is null while it runs. */
  | { kind: 'network'; id: string; report: NetworkReport | null }
  | {
      kind: 'question'
      id: string
      question: string
      options: { label: string; description?: string }[]
      allowOther: boolean
      answer: string | null
      /** The conversation moved on before this was answered. */
      expired?: boolean
    }
  | { kind: 'notice'; id: string; tone: 'info' | 'error'; text: string }

export type AgentPhase = 'idle' | 'starting' | 'ready' | 'working' | 'error'

export interface AgentState {
  /** null until the first message of a new conversation. */
  conversationId: string | null
  conversationTitle: string | null
  phase: AgentPhase
  /** Plain-language explanation when phase is 'error'. */
  error: string | null
  model: string | null
  timeline: TimelineItem[]
  /** True while Termless is saving what it learned from a finished conversation. */
  savingMemory: boolean
}

export type ApprovalDecision = 'accept' | 'decline'

// ---------------------------------------------------------------------------
// Conversation history

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** First user message, for search and preview. */
  preview: string
}

// ---------------------------------------------------------------------------
// Memory

export interface MemoryFact {
  id: string
  text: string
  createdAt: string
  source: 'agent' | 'summary'
}

export interface ActionRecord {
  id: string
  at: string
  summary: string
  undo: string | null
}

export interface MemorySnapshot {
  facts: MemoryFact[]
  /** Changes Termless made; used as agent context, not shown as its own screen. */
  actions: ActionRecord[]
}

export type Lang = 'en' | 'zh'

// ---------------------------------------------------------------------------

export interface TermlessApi {
  getInventory(): Promise<Inventory>
  /** Disk space used by an installed item, in bytes (measured on demand). */
  getItemSize(id: string): Promise<number | null>
  /** Shows the item in Finder. */
  revealItem(id: string): Promise<void>
  getCodexStatus(): Promise<CodexStatus>
  openExternal(url: string): Promise<void>

  getSetupStatus(): Promise<SetupStatus>
  installCodex(lang: Lang): Promise<SetupActionResult>
  signInToCodex(): Promise<SetupActionResult>
  installHomebrew(lang: Lang): Promise<SetupActionResult>
  openCommandLineToolsInstaller(): Promise<void>
  onSetupProgress(listener: (progress: SetupProgress) => void): () => void

  getAgentState(): Promise<AgentState>
  onAgentState(listener: (state: AgentState) => void): () => void
  sendMessage(text: string, lang: Lang): Promise<void>
  respondToApproval(itemId: string, decision: ApprovalDecision): Promise<void>
  answerQuestion(itemId: string, answer: string): Promise<void>
  interrupt(): Promise<void>
  newConversation(): Promise<void>

  listConversations(): Promise<ConversationSummary[]>
  onConversationsChanged(listener: (list: ConversationSummary[]) => void): () => void
  openConversation(id: string): Promise<void>
  deleteConversation(id: string): Promise<void>
  clearConversations(): Promise<void>

  getMemory(): Promise<MemorySnapshot>
  forgetFact(id: string): Promise<MemorySnapshot>
  clearMemory(): Promise<MemorySnapshot>
}
