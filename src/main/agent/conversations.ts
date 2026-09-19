import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConversationSummary, TimelineItem } from '../../shared/types'

// Every conversation is saved as it happens (one JSON file each), so nothing
// is lost when the user switches to another one or quits.

export interface Conversation {
  id: string
  title: string
  /** True once the title came from the model rather than the first message. */
  titled: boolean
  createdAt: string
  updatedAt: string
  /** Codex thread backing this conversation, used to resume it. */
  threadId: string | null
  timeline: TimelineItem[]
  /** Plain-text log used for memory extraction and as a fallback summary. */
  transcript: string[]
  /** How much of the transcript has already been mined for memories. */
  memoryExtractedUpTo: number
}

const TITLE_LENGTH = 48

export class ConversationStore {
  private cache = new Map<string, Conversation>()

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      try {
        const conversation = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Conversation
        if (conversation.id) this.cache.set(conversation.id, conversation)
      } catch {
        // skip unreadable files
      }
    }
  }

  create(firstMessage: string): Conversation {
    const now = new Date().toISOString()
    const conversation: Conversation = {
      id: randomUUID(),
      title: titleFrom(firstMessage),
      titled: false,
      createdAt: now,
      updatedAt: now,
      threadId: null,
      timeline: [],
      transcript: [],
      memoryExtractedUpTo: 0
    }
    this.cache.set(conversation.id, conversation)
    return conversation
  }

  get(id: string): Conversation | undefined {
    return this.cache.get(id)
  }

  save(conversation: Conversation): void {
    conversation.updatedAt = new Date().toISOString()
    this.cache.set(conversation.id, conversation)
    const file = join(this.dir, `${conversation.id}.json`)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(conversation))
    renameSync(tmp, file)
  }

  delete(id: string): Conversation | undefined {
    const conversation = this.cache.get(id)
    this.cache.delete(id)
    rmSync(join(this.dir, `${id}.json`), { force: true })
    return conversation
  }

  all(): Conversation[] {
    return [...this.cache.values()]
  }

  list(): ConversationSummary[] {
    return this.all()
      .map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        preview: firstUserText(c)
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > TITLE_LENGTH ? `${oneLine.slice(0, TITLE_LENGTH - 1)}…` : oneLine
}

function firstUserText(conversation: Conversation): string {
  const first = conversation.timeline.find((item) => item.kind === 'user')
  return first && first.kind === 'user' ? first.text.slice(0, 200) : ''
}
