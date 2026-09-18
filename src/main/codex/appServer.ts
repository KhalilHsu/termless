import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import readline from 'node:readline'

// A minimal JSON-RPC client for `codex app-server` (newline-delimited JSON
// over stdio). Types for the protocol can be regenerated with
// `codex app-server generate-ts --experimental --out <dir>`.

type Json = unknown

interface Pending {
  resolve: (value: Json) => void
  reject: (error: Error) => void
}

export interface ServerRequest {
  id: number | string
  method: string
  params: any
}

export interface Notification {
  method: string
  params: any
}

export class AppServerError extends Error {
  constructor(
    message: string,
    readonly code?: number
  ) {
    super(message)
  }
}

/**
 * Events:
 * - 'notification' (Notification)
 * - 'request' (ServerRequest) – must be answered with respond()/respondError()
 * - 'exit' (message: string)
 */
export class AppServerClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private stderrTail: string[] = []

  constructor(
    private readonly codexPath: string,
    private readonly env: NodeJS.ProcessEnv
  ) {
    super()
  }

  get running(): boolean {
    return this.proc !== null
  }

  async start(clientVersion: string): Promise<void> {
    if (this.proc) return

    const proc = spawn(this.codexPath, ['app-server'], { env: this.env, stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc = proc

    readline.createInterface({ input: proc.stdout }).on('line', (line) => this.handleLine(line))
    readline.createInterface({ input: proc.stderr }).on('line', (line) => {
      this.stderrTail.push(line)
      if (this.stderrTail.length > 20) this.stderrTail.shift()
    })

    const onGone = (reason: string) => {
      if (this.proc !== proc) return
      this.proc = null
      const detail = this.stderrTail.slice(-3).join('\n')
      const message = detail ? `${reason}: ${detail}` : reason
      for (const p of this.pending.values()) p.reject(new AppServerError(message))
      this.pending.clear()
      this.emit('exit', message)
    }
    proc.on('error', (error) => onGone(`Codex could not start (${error.message})`))
    proc.on('exit', (code, signal) => onGone(`Codex stopped (${signal ?? `exit code ${code}`})`))

    await this.request('initialize', {
      clientInfo: { name: 'termless', title: 'Termless', version: clientVersion },
      capabilities: { experimentalApi: true, requestAttestation: false }
    })
    this.notify('initialized')
  }

  stop(): void {
    this.proc?.kill()
  }

  request<T = any>(method: string, params?: Json): Promise<T> {
    if (!this.proc) return Promise.reject(new AppServerError('Codex is not running'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: Json) => void, reject })
      this.write({ id, method, params })
    })
  }

  notify(method: string, params?: Json): void {
    this.write(params === undefined ? { method } : { method, params })
  }

  respond(id: number | string, result: Json): void {
    this.write({ id, result })
  }

  respondError(id: number | string, message: string): void {
    this.write({ id, error: { code: -32601, message } })
  }

  private write(message: object): void {
    this.proc?.stdin.write(JSON.stringify(message) + '\n')
  }

  private handleLine(line: string): void {
    let message: any
    try {
      message = JSON.parse(line)
    } catch {
      return
    }

    const isResponse = message.id !== undefined && message.method === undefined
    if (isResponse) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new AppServerError(message.error.message ?? 'Request failed', message.error.code))
      else pending.resolve(message.result)
      return
    }

    if (message.id !== undefined) {
      this.emit('request', { id: message.id, method: message.method, params: message.params } satisfies ServerRequest)
    } else if (message.method) {
      this.emit('notification', { method: message.method, params: message.params } satisfies Notification)
    }
  }
}
