import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ActionRecord, MemoryFact, MemorySnapshot } from '../../shared/types'

// Long-term memory lives in the app's own data folder, not inside any agent,
// so it survives switching agents and the user can always see and delete it.

const MAX_FACTS = 200
const MAX_ACTIONS = 200

export class MemoryStore {
  private data: MemorySnapshot

  constructor(private readonly file: string) {
    this.data = this.load()
  }

  snapshot(): MemorySnapshot {
    return { facts: [...this.data.facts], actions: [...this.data.actions] }
  }

  /** Adds a fact unless an equivalent one is already stored. Returns the stored fact. */
  remember(text: string, source: MemoryFact['source']): MemoryFact {
    const clean = text.trim().replace(/\s+/g, ' ')
    const existing = this.data.facts.find((f) => normalize(f.text) === normalize(clean))
    if (existing) return existing

    const fact: MemoryFact = { id: randomUUID(), text: clean, createdAt: new Date().toISOString(), source }
    this.data.facts.push(fact)
    if (this.data.facts.length > MAX_FACTS) this.data.facts.splice(0, this.data.facts.length - MAX_FACTS)
    this.save()
    return fact
  }

  forget(id: string): boolean {
    const before = this.data.facts.length
    this.data.facts = this.data.facts.filter((f) => f.id !== id)
    if (this.data.facts.length === before) return false
    this.save()
    return true
  }

  clear(): void {
    this.data = { facts: [], actions: [] }
    this.save()
  }

  recall(query?: string): MemoryFact[] {
    const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return [...this.data.facts]
    return this.data.facts.filter((f) => words.some((w) => f.text.toLowerCase().includes(w)))
  }

  logAction(summary: string, undo: string | null): ActionRecord {
    const record: ActionRecord = { id: randomUUID(), at: new Date().toISOString(), summary: summary.trim(), undo }
    this.data.actions.push(record)
    if (this.data.actions.length > MAX_ACTIONS) this.data.actions.splice(0, this.data.actions.length - MAX_ACTIONS)
    this.save()
    return record
  }

  recentActions(limit: number): ActionRecord[] {
    return this.data.actions.slice(-limit)
  }

  private load(): MemorySnapshot {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<MemorySnapshot>
      return { facts: parsed.facts ?? [], actions: parsed.actions ?? [] }
    } catch {
      return { facts: [], actions: [] }
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s.。!！]+$/g, '').replace(/\s+/g, ' ')
}
