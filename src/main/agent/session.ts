import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import type {
  AgentState,
  ApprovalDecision,
  BrewInventory,
  ConversationSummary,
  Lang,
  TimelineItem
} from '../../shared/types'
import { AppServerClient, type Notification, type ServerRequest } from '../codex/appServer'
import { codexEnv, getCodexStatus } from '../codex/detect'
import { classifyCommand, displayCommand } from './commands'
import { AGENT_EFFORT, AGENT_MODEL, EPHEMERAL_THREADS } from './config'
import type { Conversation, ConversationStore } from './conversations'
import { collectEnvironment } from './environment'
import { buildInstructions, MEMORY_EXTRACTION_INSTRUCTIONS } from './instructions'
import type { MemoryStore } from './memory'
import { describeToolCall, runTool, TOOL_SPECS } from './tools'

const MAX_OUTPUT_CHARS = 20_000
const MEMORY_TIMEOUT_MS = 90_000
const PERSIST_DELAY_MS = 400

interface Deps {
  memory: MemoryStore
  conversations: ConversationStore
  getInventory: () => Promise<BrewInventory>
  workspaceDir: string
  appVersion: string
}

type PendingAnswer =
  | { type: 'tool'; requestId: number | string }
  | { type: 'userInput'; requestId: number | string; questionId: string; group: string }

const EMPTY_STATE: AgentState = {
  conversationId: null,
  conversationTitle: null,
  phase: 'idle',
  error: null,
  model: null,
  timeline: [],
  savingMemory: false
}

/**
 * Owns the conversation with Codex: starts `codex app-server`, feeds it
 * Termless's instructions and tools, turns its events into a timeline the UI
 * can render, routes confirmation cards back to it, and saves every
 * conversation so it can be reopened and continued later.
 *
 * Emits:
 * - 'state' (AgentState) on every change
 * - 'conversations' (ConversationSummary[]) when the history list changes
 * - 'turn-completed' after each turn that ran at least one command
 */
export class AgentSession extends EventEmitter {
  private state: AgentState = EMPTY_STATE
  private current: Conversation | null = null
  private client: AppServerClient | null = null
  /** Threads that are live in the running app-server (started or resumed). */
  private loadedThreads = new Set<string>()
  private turnId: string | null = null
  private lang: Lang = 'en'

  private approvals = new Map<string, { requestId: number | string }>()
  private answers = new Map<string, PendingAnswer>()
  private userInputGroups = new Map<string, { requestId: number | string; answers: Record<string, { answers: string[] }>; remaining: number }>()

  // Per-turn bookkeeping for the automatic change log.
  private lastUserMessage = ''
  private commandsThisTurn: string[] = []
  private loggedThisTurn = false

  private sideThreads = new Map<string, (text: string | null) => void>()
  private sideThreadText = new Map<string, string>()
  private extractionsRunning = 0

  private emitTimer: NodeJS.Timeout | null = null
  private persistTimer: NodeJS.Timeout | null = null
  private turnWaiters: (() => void)[] = []
  private lastExtraction: Promise<void> = Promise.resolve()

  constructor(private readonly deps: Deps) {
    super()
    mkdirSync(deps.workspaceDir, { recursive: true })
  }

  getState(): AgentState {
    return this.state
  }

  listConversations(): ConversationSummary[] {
    return this.deps.conversations.list()
  }

  private get threadId(): string | null {
    return this.current?.threadId ?? null
  }

  // -------------------------------------------------------------------------
  // Public actions

  async send(text: string, lang: Lang): Promise<void> {
    const message = text.trim()
    if (!message || this.isBusy()) return
    this.lang = lang

    if (!this.current) {
      this.current = this.deps.conversations.create(message)
      this.state = { ...this.state, conversationId: this.current.id, conversationTitle: this.current.title }
    }
    this.push({ kind: 'user', id: `user-${Date.now()}`, text: message })
    this.current.transcript.push(`User: ${message}`)
    this.lastUserMessage = message
    this.commandsThisTurn = []
    this.loggedThisTurn = false
    this.setPhase('starting')
    this.emitConversations()

    try {
      const client = await this.ensureClient()
      await this.ensureThread(client)
      this.setPhase('working')
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
    if (decision === 'decline') this.current?.transcript.push('(User declined a command.)')
  }

  answerQuestion(itemId: string, answer: string): void {
    const pending = this.answers.get(itemId)
    if (!pending || !this.client) return
    this.answers.delete(itemId)
    this.updateItem(itemId, (item) => (item.kind === 'question' ? { ...item, answer } : item))
    this.current?.transcript.push(`User chose: ${answer}`)

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
    await this.leaveCurrent()
    this.state = { ...EMPTY_STATE, model: this.state.model, phase: this.client?.running ? 'ready' : 'idle', savingMemory: this.extractionsRunning > 0 }
    this.emitNow()
  }

  /** Shows a saved conversation; the next message continues it. */
  async openConversation(id: string): Promise<void> {
    if (this.current?.id === id) return
    const target = this.deps.conversations.get(id)
    if (!target) return
    await this.leaveCurrent()

    // Anything left waiting when the conversation was last open can't be
    // acted on any more.
    target.timeline = target.timeline.map((item) => {
      if (item.kind === 'command' && (item.status === 'awaiting-approval' || item.status === 'running')) return { ...item, status: 'stopped' }
      if (item.kind === 'question' && item.answer === null) return { ...item, expired: true }
      if (item.kind === 'agent' && item.streaming) return { ...item, streaming: false }
      return item
    })

    this.current = target
    this.state = {
      ...EMPTY_STATE,
      conversationId: target.id,
      conversationTitle: target.title,
      model: this.state.model,
      phase: this.client?.running ? 'ready' : 'idle',
      timeline: target.timeline,
      savingMemory: this.extractionsRunning > 0
    }
    this.emitNow()
  }

  async deleteConversation(id: string): Promise<void> {
    if (this.current?.id === id) {
      if (this.isBusy()) await this.stopAndWait()
      this.cancelPersist()
      this.current = null
      this.state = { ...EMPTY_STATE, model: this.state.model, phase: this.client?.running ? 'ready' : 'idle', savingMemory: this.extractionsRunning > 0 }
      this.emitNow()
    }
    const removed = this.deps.conversations.delete(id)
    this.emitConversations()
    if (removed?.threadId) await this.deleteThread(removed.threadId)
  }

  async clearConversations(): Promise<void> {
    for (const conversation of this.deps.conversations.all()) await this.deleteConversation(conversation.id)
  }

  /** Called when the app quits: saves memories (bounded by the caller) and stops Codex. */
  async shutdown(): Promise<void> {
    await this.leaveCurrent()
    await this.lastExtraction
    this.client?.stop()
  }

  // -------------------------------------------------------------------------
  // Leaving a conversation

  private isBusy(): boolean {
    return this.state.phase === 'working' || this.state.phase === 'starting'
  }

  /** Stops the running turn (if any) and waits briefly for Codex to confirm. */
  private async stopAndWait(): Promise<void> {
    const done = new Promise<void>((resolve) => {
      this.turnWaiters.push(resolve)
      setTimeout(resolve, 5000)
    })
    await this.interrupt()
    if (this.isBusy()) await done
  }

  /** Saves the open conversation and mines it for memories in the background. */
  private async leaveCurrent(): Promise<void> {
    if (this.isBusy()) await this.stopAndWait()
    const conversation = this.current
    if (conversation) this.flushPersist(conversation)
    this.current = null
    this.approvals.clear()
    this.answers.clear()
    this.userInputGroups.clear()
    this.turnId = null
    if (conversation) this.lastExtraction = this.extractMemories(conversation)
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
      this.loadedThreads.clear()
      this.turnId = null
      for (const resolve of this.sideThreads.values()) resolve(null)
      this.sideThreads.clear()
      if (this.isBusy()) this.fail(new Error(message))
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

  /** Makes sure the open conversation has a live Codex thread. */
  private async ensureThread(client: AppServerClient): Promise<void> {
    const conversation = this.current!
    if (conversation.threadId && this.loadedThreads.has(conversation.threadId)) return

    const instructions = await this.freshInstructions()

    if (conversation.threadId) {
      try {
        // Continue the original thread: Codex still remembers everything,
        // and the facts about the Mac and the user are refreshed.
        const result = await client.request('thread/resume', {
          threadId: conversation.threadId,
          excludeTurns: true,
          cwd: this.deps.workspaceDir,
          model: AGENT_MODEL,
          approvalPolicy: 'untrusted',
          sandbox: 'danger-full-access',
          developerInstructions: instructions
        })
        this.loadedThreads.add(conversation.threadId)
        this.state = { ...this.state, model: result.model ?? AGENT_MODEL }
        return
      } catch {
        // The saved thread is gone (e.g. Codex was reset); fall back below.
      }
    }

    const earlier = conversation.transcript.slice(0, -1)
    const summary =
      earlier.length > 0
        ? `\n\nThis conversation is being continued. What was said before, for context (you cannot see the details any more):\n${earlier.join('\n').slice(-12_000)}`
        : ''

    const result = await client.request('thread/start', {
      cwd: this.deps.workspaceDir,
      model: AGENT_MODEL,
      // Threads are kept (in Termless's own Codex home) so conversations can
      // be continued later; deleting a conversation deletes its thread.
      ephemeral: EPHEMERAL_THREADS,
      // Every command that is not plainly read-only needs the user's OK via
      // a confirmation card. Approved commands run with the user's normal
      // permissions so installs through Homebrew can work.
      approvalPolicy: 'untrusted',
      sandbox: 'danger-full-access',
      developerInstructions: instructions + summary,
      dynamicTools: TOOL_SPECS
    })
    if (conversation.threadId) {
      this.pushNotice('info', this.lang === 'zh' ? '原来的对话无法恢复，已根据之前的内容继续。' : 'The original session could not be restored, so I picked up from a summary of it.')
    }
    conversation.threadId = result.thread.id
    this.loadedThreads.add(result.thread.id)
    this.state = { ...this.state, model: result.model ?? AGENT_MODEL }
    this.schedulePersist()
  }

  private async freshInstructions(): Promise<string> {
    const inventory = await this.deps.getInventory().catch(() => null)
    const snapshot = this.deps.memory.snapshot()
    return buildInstructions({
      lang: this.lang,
      environment: await collectEnvironment(inventory),
      facts: snapshot.facts,
      actions: snapshot.actions
    })
  }

  private async deleteThread(threadId: string): Promise<void> {
    try {
      const client = await this.ensureClient()
      await client.request('thread/delete', { threadId })
      this.loadedThreads.delete(threadId)
    } catch {
      // Best effort: if Codex isn't available the thread is simply orphaned.
    }
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

      case 'turn/completed':
        this.onTurnCompleted(params.turn)
        break
    }
  }

  private onTurnCompleted(turn: any): void {
    this.turnId = null
    for (const [itemId] of this.approvals) {
      this.updateItem(itemId, (item) => (item.kind === 'command' ? { ...item, status: 'stopped' } : item))
    }
    this.approvals.clear()
    for (const item of this.state.timeline) {
      if (item.kind === 'command' && item.status === 'running') this.updateItem(item.id, (i) => (i.kind === 'command' ? { ...i, status: 'stopped' } : i))
      if (item.kind === 'question' && item.answer === null) this.updateItem(item.id, (i) => (i.kind === 'question' ? { ...i, expired: true } : i))
    }
    this.answers.clear()

    if (turn?.status === 'failed' && turn.error?.message) this.pushNotice('error', turn.error.message)
    if (turn?.status === 'interrupted') this.pushNotice('info', this.lang === 'zh' ? '已停止。' : 'Stopped.')

    // Keep a record of every change, even if the agent forgot to log it.
    if (this.commandsThisTurn.length > 0 && !this.loggedThisTurn) {
      const request = this.lastUserMessage.replace(/\s+/g, ' ').slice(0, 80)
      this.deps.memory.logAction(`For "${request}": ran ${this.commandsThisTurn.slice(0, 3).join('; ')}`.slice(0, 300), null)
    }

    this.setPhase('ready')
    if (this.commandsThisTurn.length > 0) this.emit('turn-completed')
    for (const resolve of this.turnWaiters.splice(0)) resolve()
    this.emitConversations()
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
        if (item.text) this.current?.transcript.push(`Assistant: ${item.text}`)
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
        const command = displayCommand(item.command)
        if (status !== 'declined') this.commandsThisTurn.push(command)
        this.current?.transcript.push(`Ran command (${status}): ${command}`)
        break
      }

      case 'fileChange': {
        const status = item.status === 'completed' ? 'done' : item.status === 'declined' ? 'declined' : 'failed'
        this.updateItem(item.id, (prev) => (prev.kind === 'command' ? { ...prev, status } : prev))
        const description = describeFileChanges(item.changes, 'en')
        if (status !== 'declined') this.commandsThisTurn.push(description)
        this.current?.transcript.push(`${description} (${status})`)
        break
      }

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

    // Requests for threads the user isn't looking at (e.g. a turn that was
    // stopped while switching) are declined rather than left hanging.
    if (params?.threadId && params.threadId !== this.threadId && !this.sideThreads.has(params.threadId)) {
      if (method.endsWith('requestApproval')) client.respond(id, { decision: 'decline' })
      else client.respondError(id, 'This conversation is no longer open.')
      return
    }

    switch (method) {
      case 'item/commandExecution/requestApproval':
      case 'item/fileChange/requestApproval': {
        const itemId: string = params.itemId
        if (!this.findItem(itemId)) {
          const command = method.startsWith('item/fileChange') ? describeFileChanges([], this.lang) : displayCommand(params.command ?? '')
          this.push({ kind: 'command', id: itemId, command, status: 'running', risk: method.startsWith('item/fileChange') ? 'change' : classifyCommand(command), output: null, exitCode: null })
        }
        this.approvals.set(itemId, { requestId: id })
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
        if (params.tool === 'termless_log_action') this.loggedThisTurn = true
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
        // Requests Termless does not support are refused rather than left hanging.
        client.respondError(id, `Termless does not support ${method}`)
    }
  }

  // -------------------------------------------------------------------------
  // Long-term memory and titles

  private async extractMemories(conversation: Conversation): Promise<void> {
    const fresh = conversation.transcript.slice(conversation.memoryExtractedUpTo)
    if (!fresh.some((line) => line.startsWith('User:'))) return
    const upTo = conversation.transcript.length

    this.extractionsRunning++
    this.state = { ...this.state, savingMemory: true }
    this.emitNow()
    try {
      const client = await this.ensureClient()
      const known = this.deps.memory.snapshot().facts.map((f) => `- ${f.text}`).join('\n') || '(none)'
      const context = conversation.transcript.slice(Math.max(0, conversation.memoryExtractedUpTo - 6), upTo)

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
        input: [
          {
            type: 'text',
            text: `Title language: ${this.lang === 'zh' ? 'Simplified Chinese' : 'English'}\n\nFacts already stored:\n${known}\n\nConversation:\n${context.join('\n').slice(-30_000)}`,
            text_elements: []
          }
        ]
      })

      const text = await answer
      this.sideThreads.delete(thread.id)
      this.sideThreadText.delete(thread.id)
      const parsed = parseExtraction(text)
      for (const fact of parsed.facts) this.deps.memory.remember(fact, 'summary')

      // The conversation may have been deleted meanwhile.
      const stored = this.deps.conversations.get(conversation.id)
      if (stored) {
        stored.memoryExtractedUpTo = Math.max(stored.memoryExtractedUpTo, upTo)
        if (parsed.title && !stored.titled) {
          stored.title = parsed.title
          stored.titled = true
          if (this.current?.id === stored.id) this.state = { ...this.state, conversationTitle: stored.title }
        }
        this.deps.conversations.save(stored)
        this.emitConversations()
      }
    } catch {
      // Memory is a nice-to-have; never block the user on it.
    } finally {
      this.extractionsRunning--
      this.state = { ...this.state, savingMemory: this.extractionsRunning > 0 }
      this.emitNow()
    }
  }

  private handleSideThread(threadId: string, method: string, params: any): void {
    if (method === 'item/completed' && params.item?.type === 'agentMessage') {
      this.sideThreadText.set(threadId, params.item.text ?? '')
    } else if (method === 'turn/completed') {
      this.sideThreads.get(threadId)?.(this.sideThreadText.get(threadId) ?? null)
    }
  }

  // -------------------------------------------------------------------------
  // State and persistence

  private setPhase(phase: AgentState['phase']): void {
    this.state = { ...this.state, phase, error: phase === 'error' ? this.state.error : null }
    this.emitNow()
  }

  private fail(error: unknown): void {
    const code = error instanceof UserFacingError ? error.code : null
    const message = code ? code : error instanceof Error ? error.message : String(error)
    this.state = { ...this.state, phase: code ? 'error' : this.client?.running ? 'ready' : 'error', error: message }
    if (!code) this.pushNotice('error', message)
    for (const resolve of this.turnWaiters.splice(0)) resolve()
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
    this.schedulePersist()
  }

  private emitSoon(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit('state', this.state)
      this.schedulePersist()
    }, 40)
  }

  private emitConversations(): void {
    this.emit('conversations', this.deps.conversations.list())
  }

  private schedulePersist(): void {
    if (!this.current || this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      if (this.current) this.flushPersist(this.current)
    }, PERSIST_DELAY_MS)
  }

  private cancelPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = null
  }

  private flushPersist(conversation: Conversation): void {
    this.cancelPersist()
    if (conversation === this.current) conversation.timeline = this.state.timeline
    if (conversation.timeline.length === 0) return
    this.deps.conversations.save(conversation)
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

function parseExtraction(text: string | null): { title: string | null; facts: string[] } {
  if (!text) return { title: null, facts: [] }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return { title: null, facts: [] }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    const facts = Array.isArray(parsed.facts)
      ? parsed.facts.filter((f: unknown) => typeof f === 'string' && f.trim()).slice(0, 20)
      : []
    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 60) : null
    return { title, facts }
  } catch {
    return { title: null, facts: [] }
  }
}
