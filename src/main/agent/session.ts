import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import type {
  AgentState,
  ApprovalDecision,
  BrewInventory,
  Lang,
  TimelineItem
} from '../../shared/types'
import { AppServerClient, type Notification, type ServerRequest } from '../codex/appServer'
import { codexEnv, getCodexStatus } from '../codex/detect'
import { classifyCommand, displayCommand } from './commands'
import { AGENT_EFFORT, AGENT_MODEL } from './config'
import { collectEnvironment } from './environment'
import { buildInstructions, MEMORY_EXTRACTION_INSTRUCTIONS } from './instructions'
import type { MemoryStore } from './memory'
import { describeToolCall, runTool, TOOL_SPECS } from './tools'

const MAX_OUTPUT_CHARS = 20_000
const MEMORY_TIMEOUT_MS = 90_000

interface Deps {
  memory: MemoryStore
  getInventory: () => Promise<BrewInventory>
  workspaceDir: string
  appVersion: string
}

type PendingAnswer =
  | { type: 'tool'; requestId: number | string }
  | { type: 'userInput'; requestId: number | string; questionId: string; group: string }

/**
 * Owns the conversation with Codex: starts `codex app-server`, feeds it
 * Termless's instructions and tools, turns its events into a timeline the UI
 * can render, and routes confirmation cards back to it.
 *
 * Emits 'state' (AgentState) on every change and 'turn-completed' after each
 * turn that ran at least one command.
 */
export class AgentSession extends EventEmitter {
  private state: AgentState = { phase: 'idle', error: null, model: null, timeline: [], savingMemory: false }
  private client: AppServerClient | null = null
  private threadId: string | null = null
  private turnId: string | null = null
  private lang: Lang = 'en'
  private ranCommandThisTurn = false

  private approvals = new Map<string, { requestId: number | string; kind: 'command' | 'file' }>()
  private answers = new Map<string, PendingAnswer>()
  private userInputGroups = new Map<string, { requestId: number | string; answers: Record<string, { answers: string[] }>; remaining: number }>()

  /** Plain-text log of the conversation, used to extract long-term memories. */
  private transcript: string[] = []
  private sideThreads = new Map<string, (text: string | null) => void>()
  private sideThreadText = new Map<string, string>()

  private emitTimer: NodeJS.Timeout | null = null

  constructor(private readonly deps: Deps) {
    super()
    mkdirSync(deps.workspaceDir, { recursive: true })
  }

  getState(): AgentState {
    return this.state
  }

  // -------------------------------------------------------------------------
  // Public actions

  async send(text: string, lang: Lang): Promise<void> {
    const message = text.trim()
    if (!message || this.state.phase === 'working' || this.state.phase === 'starting') return
    this.lang = lang

    this.push({ kind: 'user', id: `user-${Date.now()}`, text: message })
    this.transcript.push(`User: ${message}`)
    this.setPhase('starting')

    try {
      const client = await this.ensureClient()
      if (!this.threadId) await this.startThread(client)
      this.setPhase('working')
      this.ranCommandThisTurn = false
      const { turn } = await client.request('turn/start', {
        threadId: this.threadId,
        effort: AGENT_EFFORT,
        input: [{ type: 'text', text: message, text_elements: [] }]
      })
      this.turnId = turn?.id ?? null
    } catch (error) {
      this.fail(error)
    }
  }

  respondToApproval(itemId: string, decision: ApprovalDecision): void {
    const pending = this.approvals.get(itemId)
    if (!pending || !this.client) return
    this.approvals.delete(itemId)
    this.client.respond(pending.requestId, { decision })
    this.updateItem(itemId, (item) =>
      item.kind === 'command' ? { ...item, status: decision === 'accept' ? 'running' : 'declined' } : item
    )
    if (decision === 'decline') this.transcript.push(`(User declined a command.)`)
  }

  answerQuestion(itemId: string, answer: string): void {
    const pending = this.answers.get(itemId)
    if (!pending || !this.client) return
    this.answers.delete(itemId)
    this.updateItem(itemId, (item) => (item.kind === 'question' ? { ...item, answer } : item))
    this.transcript.push(`User chose: ${answer}`)

    if (pending.type === 'tool') {
      this.client.respond(pending.requestId, {
        success: true,
        contentItems: [{ type: 'inputText', text: `The user answered: ${answer}` }]
      })
      return
    }

    const group = this.userInputGroups.get(pending.group)
    if (!group) return
    group.answers[pending.questionId] = { answers: [answer] }
    group.remaining -= 1
    if (group.remaining === 0) {
      this.userInputGroups.delete(pending.group)
      this.client.respond(group.requestId, { answers: group.answers })
    }
  }

  async interrupt(): Promise<void> {
    if (!this.client || !this.threadId || !this.turnId) return
    try {
      await this.client.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId })
    } catch {
      // the turn may already be over
    }
  }

  /** Starts a fresh conversation; what was learned is saved to memory in the background. */
  async newConversation(): Promise<void> {
    if (this.state.phase === 'working') await this.interrupt()
    const transcript = this.transcript
    this.transcript = []
    this.threadId = null
    this.turnId = null
    this.approvals.clear()
    this.answers.clear()
    this.userInputGroups.clear()
    this.state = { ...this.state, phase: this.client?.running ? 'ready' : 'idle', error: null, timeline: [] }
    this.emitNow()
    await this.saveMemories(transcript)
  }

  /** Called when the app quits: saves memories (bounded time) and stops Codex. */
  async shutdown(): Promise<void> {
    const transcript = this.transcript
    this.transcript = []
    await this.saveMemories(transcript)
    this.client?.stop()
  }

  // -------------------------------------------------------------------------
  // Codex process and thread

  private async ensureClient(): Promise<AppServerClient> {
    if (this.client?.running) return this.client

    const codex = await getCodexStatus()
    if (!codex.installed || !codex.path) throw new UserFacingError('codex-missing')
    if (codex.error) throw new UserFacingError('codex-broken')

    const client = new AppServerClient(codex.path, codexEnv())
    client.on('notification', (n: Notification) => this.handleNotification(n))
    client.on('request', (r: ServerRequest) => void this.handleRequest(r))
    client.on('exit', (message: string) => {
      if (this.client !== client) return
      this.client = null
      this.threadId = null
      this.turnId = null
      for (const resolve of this.sideThreads.values()) resolve(null)
      this.sideThreads.clear()
      if (this.state.phase === 'working' || this.state.phase === 'starting') this.fail(new Error(message))
      else this.setPhase('idle')
    })

    this.client = client
    await client.start(this.deps.appVersion)

    const account = await client.request('account/read', {})
    if (!account?.account) {
      this.client = null
      client.stop()
      throw new UserFacingError('signed-out')
    }
    return client
  }

  private async startThread(client: AppServerClient): Promise<void> {
    const inventory = await this.deps.getInventory().catch(() => null)
    const snapshot = this.deps.memory.snapshot()
    const instructions = buildInstructions({
      lang: this.lang,
      environment: await collectEnvironment(inventory),
      facts: snapshot.facts,
      actions: snapshot.actions
    })

    const result = await client.request('thread/start', {
      cwd: this.deps.workspaceDir,
      model: AGENT_MODEL,
      // Nothing is written to ~/.codex: Termless keeps its own memory.
      ephemeral: true,
      // Every command that is not plainly read-only needs the user's OK via
      // a confirmation card. Approved commands run with the user's normal
      // permissions so installs through Homebrew can work.
      approvalPolicy: 'untrusted',
      sandbox: 'danger-full-access',
      developerInstructions: instructions,
      dynamicTools: TOOL_SPECS
    })
    this.threadId = result.thread.id
    this.state = { ...this.state, model: result.model ?? AGENT_MODEL }
  }

  // -------------------------------------------------------------------------
  // Events from Codex

  private handleNotification({ method, params }: Notification): void {
    const threadId = params?.threadId
    if (threadId && this.sideThreads.has(threadId)) {
      this.handleSideThread(threadId, method, params)
      return
    }
    if (threadId && threadId !== this.threadId) return

    switch (method) {
      case 'turn/started':
        this.turnId = params.turn?.id ?? this.turnId
        break

      case 'item/started':
        this.onItemStarted(params.item)
        break

      case 'item/completed':
        this.onItemCompleted(params.item)
        break

      case 'item/agentMessage/delta':
        this.updateItem(params.itemId, (item) => (item.kind === 'agent' ? { ...item, text: item.text + params.delta } : item), true)
        break

      case 'item/commandExecution/outputDelta':
        this.updateItem(
          params.itemId,
          (item) =>
            item.kind === 'command'
              ? { ...item, output: ((item.output ?? '') + params.delta).slice(-MAX_OUTPUT_CHARS) }
              : item,
          true
        )
        break

      case 'error':
        if (!params.willRetry) this.pushNotice('error', params.error?.message ?? 'Something went wrong.')
        break

      case 'turn/completed': {
        const turn = params.turn
        this.turnId = null
        for (const [itemId] of this.approvals) {
          this.updateItem(itemId, (item) => (item.kind === 'command' ? { ...item, status: 'declined' } : item))
        }
        this.approvals.clear()
        if (turn?.status === 'failed' && turn.error?.message) this.pushNotice('error', turn.error.message)
        if (turn?.status === 'interrupted') this.pushNotice('info', this.lang === 'zh' ? '已停止。' : 'Stopped.')
        this.setPhase('ready')
        if (this.ranCommandThisTurn) this.emit('turn-completed')
        break
      }
    }
  }

  private onItemStarted(item: any): void {
    switch (item.type) {
      case 'agentMessage':
        this.push({ kind: 'agent', id: item.id, text: item.text ?? '', streaming: true, final: item.phase === 'final_answer' })
        break
      case 'commandExecution': {
        const command = displayCommand(item.command)
        this.push({ kind: 'command', id: item.id, command, status: 'running', risk: classifyCommand(command), output: null, exitCode: null })
        break
      }
      case 'fileChange':
        this.push({
          kind: 'command',
          id: item.id,
          command: describeFileChanges(item.changes, this.lang),
          status: 'running',
          risk: 'change',
          output: null,
          exitCode: null
        })
        break
      case 'dynamicToolCall':
        if (item.tool !== 'termless_ask_user') {
          this.push({ kind: 'activity', id: item.id, tool: item.tool, summary: describeToolCall(item.tool, item.arguments, this.lang), status: 'running' })
        }
        break
    }
  }

  private onItemCompleted(item: any): void {
    switch (item.type) {
      case 'agentMessage':
        this.updateItem(item.id, (prev) => (prev.kind === 'agent' ? { ...prev, text: item.text, streaming: false } : prev))
        if (item.text) this.transcript.push(`Assistant: ${item.text}`)
        break

      case 'commandExecution': {
        const status =
          item.status === 'declined'
            ? 'declined'
            : item.status === 'completed' && (item.exitCode ?? 0) === 0
              ? 'done'
              : 'failed'
        this.updateItem(item.id, (prev) =>
          prev.kind === 'command'
            ? { ...prev, status, exitCode: item.exitCode ?? null, output: (item.aggregatedOutput ?? prev.output)?.slice(-MAX_OUTPUT_CHARS) ?? null }
            : prev
        )
        if (status !== 'declined') this.ranCommandThisTurn = true
        this.transcript.push(`Ran command (${status}): ${displayCommand(item.command)}`)
        break
      }

      case 'fileChange':
        this.updateItem(item.id, (prev) =>
          prev.kind === 'command'
            ? { ...prev, status: item.status === 'completed' ? 'done' : item.status === 'declined' ? 'declined' : 'failed' }
            : prev
        )
        break

      case 'dynamicToolCall':
        if (item.tool !== 'termless_ask_user') {
          this.updateItem(item.id, (prev) => (prev.kind === 'activity' ? { ...prev, status: item.success === false ? 'failed' : 'done' } : prev))
        }
        break
    }
  }

  private async handleRequest(request: ServerRequest): Promise<void> {
    const client = this.client
    if (!client) return
    const { id, method, params } = request

    switch (method) {
      case 'item/commandExecution/requestApproval': {
        const itemId: string = params.itemId
        if (!this.findItem(itemId)) {
          const command = displayCommand(params.command ?? '')
          this.push({ kind: 'command', id: itemId, command, status: 'running', risk: classifyCommand(command), output: null, exitCode: null })
        }
        this.approvals.set(itemId, { requestId: id, kind: 'command' })
        this.updateItem(itemId, (item) => (item.kind === 'command' ? { ...item, status: 'awaiting-approval' } : item))
        return
      }

      case 'item/fileChange/requestApproval': {
        const itemId: string = params.itemId
        if (!this.findItem(itemId)) {
          this.push({ kind: 'command', id: itemId, command: describeFileChanges([], this.lang), status: 'running', risk: 'change', output: null, exitCode: null })
        }
        this.approvals.set(itemId, { requestId: id, kind: 'file' })
        this.updateItem(itemId, (item) => (item.kind === 'command' ? { ...item, status: 'awaiting-approval' } : item))
        return
      }

      case 'item/tool/call': {
        if (params.tool === 'termless_ask_user') {
          const args = params.arguments ?? {}
          const itemId = params.callId as string
          this.answers.set(itemId, { type: 'tool', requestId: id })
          this.push({
            kind: 'question',
            id: itemId,
            question: String(args.question ?? ''),
            options: Array.isArray(args.options) ? args.options.map((o: any) => ({ label: String(o.label), description: o.description ? String(o.description) : undefined })) : [],
            allowOther: Boolean(args.allow_other),
            answer: null
          })
          return
        }
        try {
          const result = await runTool(params.tool, params.arguments, { memory: this.deps.memory, getInventory: this.deps.getInventory })
          client.respond(id, { success: result.success, contentItems: [{ type: 'inputText', text: result.text }] })
        } catch (error) {
          client.respond(id, { success: false, contentItems: [{ type: 'inputText', text: String(error) }] })
        }
        return
      }

      case 'item/tool/requestUserInput': {
        const group = `input-${id}`
        const questions: any[] = params.questions ?? []
        if (questions.length === 0) {
          client.respond(id, { answers: {} })
          return
        }
        this.userInputGroups.set(group, { requestId: id, answers: {}, remaining: questions.length })
        for (const q of questions) {
          const itemId = `${group}-${q.id}`
          this.answers.set(itemId, { type: 'userInput', requestId: id, questionId: q.id, group })
          this.push({
            kind: 'question',
            id: itemId,
            question: q.question,
            options: (q.options ?? []).map((o: any) => ({ label: o.label, description: o.description })),
            allowOther: q.isOther || !q.options?.length,
            answer: null
          })
        }
        return
      }

      default:
        // Requests Termless does not support (e.g. MCP elicitation from the
        // user's own Codex setup) are refused rather than left hanging.
        client.respondError(id, `Termless does not support ${method}`)
    }
  }

  // -------------------------------------------------------------------------
  // Long-term memory extraction

  private async saveMemories(transcript: string[]): Promise<void> {
    if (!transcript.some((line) => line.startsWith('User:'))) return

    this.state = { ...this.state, savingMemory: true }
    this.emitNow()
    try {
      const client = await this.ensureClient()
      const known = this.deps.memory.snapshot().facts.map((f) => `- ${f.text}`).join('\n') || '(none)'
      const conversation = transcript.join('\n').slice(-30_000)

      const { thread } = await client.request('thread/start', {
        cwd: this.deps.workspaceDir,
        model: AGENT_MODEL,
        ephemeral: true,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        developerInstructions: MEMORY_EXTRACTION_INSTRUCTIONS
      })

      const answer = new Promise<string | null>((resolve) => {
        this.sideThreads.set(thread.id, resolve)
        setTimeout(() => resolve(null), MEMORY_TIMEOUT_MS)
      })
      await client.request('turn/start', {
        threadId: thread.id,
        effort: AGENT_EFFORT,
        input: [{ type: 'text', text: `Facts already stored:\n${known}\n\nConversation:\n${conversation}`, text_elements: [] }]
      })

      const text = await answer
      this.sideThreads.delete(thread.id)
      this.sideThreadText.delete(thread.id)
      for (const fact of parseFacts(text)) this.deps.memory.remember(fact, 'summary')
    } catch {
      // Memory is a nice-to-have; never block the user on it.
    } finally {
      this.state = { ...this.state, savingMemory: false }
      this.emitNow()
    }
  }

  private handleSideThread(threadId: string, method: string, params: any): void {
    if (method === 'item/completed' && params.item?.type === 'agentMessage') {
      this.sideThreadText.set(threadId, params.item.text ?? '')
    } else if (method === 'item/commandExecution/requestApproval' || method === 'item/tool/call') {
      // not expected on a read-only thread
    } else if (method === 'turn/completed') {
      this.sideThreads.get(threadId)?.(this.sideThreadText.get(threadId) ?? null)
    }
  }

  // -------------------------------------------------------------------------
  // State helpers

  private setPhase(phase: AgentState['phase']): void {
    this.state = { ...this.state, phase, error: phase === 'error' ? this.state.error : null }
    this.emitNow()
  }

  private fail(error: unknown): void {
    const code = error instanceof UserFacingError ? error.code : null
    const message = code ? code : error instanceof Error ? error.message : String(error)
    this.state = { ...this.state, phase: code ? 'error' : this.client?.running ? 'ready' : 'error', error: message }
    if (!code) this.pushNotice('error', message)
    this.emitNow()
  }

  private push(item: TimelineItem): void {
    if (this.findItem(item.id)) {
      this.updateItem(item.id, () => item)
      return
    }
    this.state = { ...this.state, timeline: [...this.state.timeline, item] }
    this.emitNow()
  }

  private pushNotice(tone: 'info' | 'error', text: string): void {
    this.push({ kind: 'notice', id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tone, text })
  }

  private findItem(id: string): TimelineItem | undefined {
    return this.state.timeline.find((item) => item.id === id)
  }

  private updateItem(id: string, update: (item: TimelineItem) => TimelineItem, throttle = false): void {
    let changed = false
    const timeline = this.state.timeline.map((item) => {
      if (item.id !== id) return item
      changed = true
      return update(item)
    })
    if (!changed) return
    this.state = { ...this.state, timeline }
    if (throttle) this.emitSoon()
    else this.emitNow()
  }

  private emitNow(): void {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
    this.emit('state', this.state)
  }

  private emitSoon(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit('state', this.state)
    }, 40)
  }
}

/** Errors the UI explains with its own words (see AssistantView). */
export class UserFacingError extends Error {
  constructor(readonly code: 'codex-missing' | 'codex-broken' | 'signed-out') {
    super(code)
  }
}

function describeFileChanges(changes: { path: string }[] | undefined, lang: Lang): string {
  // File names are enough for people; the full path is noise.
  const paths = (changes ?? []).map((c) => c.path.split('/').pop() || c.path)
  const prefix = lang === 'zh' ? '修改文件：' : 'Edit files: '
  return paths.length ? prefix + paths.join(', ') : prefix.replace(/[:：]\s*$/, '')
}

function parseFacts(text: string | null): string[] {
  if (!text) return []
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed.facts) ? parsed.facts.filter((f: unknown) => typeof f === 'string' && f.trim()).slice(0, 20) : []
  } catch {
    return []
  }
}
