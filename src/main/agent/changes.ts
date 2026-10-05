import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { diffInventories, shellQuote, type InventoryDiff } from '../../hostkit'
import type { ChangeRecord, InstalledItem, Inventory, UndoStep } from '../../shared/types'

// Principle: every change can be undone. Instead of trusting the agent to
// report what it changed, Termless looks for itself: before the first
// change of a turn it takes a snapshot of what is installed and of common
// settings files; after the turn it compares, records each change with the
// steps to undo it, and keeps a backup of every file it saw change.

const MAX_FILE_BYTES = 1024 * 1024

/** Settings files tutorials and installers commonly edit. TERMLESS_WATCHED_FILES (colon-separated) replaces the list, for tests. */
export function watchedFiles(home = homedir()): string[] {
  const override = process.env.TERMLESS_WATCHED_FILES
  if (override) return override.split(':').filter(Boolean)
  return [
    '.zshrc',
    '.zprofile',
    '.zshenv',
    '.bashrc',
    '.bash_profile',
    '.profile',
    '.gitconfig',
    '.npmrc',
    '.condarc',
    '.ssh/config',
    '.config/pip/pip.conf',
    '.pip/pip.conf'
  ].map((f) => join(home, f))
}

interface FileState {
  existed: boolean
  /** null when the file was too large or unreadable: then it can't be restored. */
  content: Buffer | null
}

function readState(path: string): FileState {
  try {
    if (!existsSync(path)) return { existed: false, content: null }
    if (statSync(path).size > MAX_FILE_BYTES) return { existed: true, content: null }
    return { existed: true, content: readFileSync(path) }
  } catch {
    return { existed: true, content: null }
  }
}

const sameContent = (a: FileState, b: FileState) => a.existed === b.existed && (!a.existed || (a.content !== null && b.content !== null && a.content.equals(b.content)))

export class ChangeTracker {
  private inventory: Promise<Inventory | null> | null = null
  private files = new Map<string, FileState>()

  constructor(
    private readonly deps: {
      /** Inventory without update checks (fast). */
      snapshotInventory: () => Promise<Inventory>
      backupDir: (conversationId: string) => string
    }
  ) {}

  get active(): boolean {
    return this.inventory !== null
  }

  /**
   * Takes the "before" snapshot, once per turn, before the first change is
   * allowed. Resolves when it is complete, so the change can go ahead.
   */
  begin(): Promise<unknown> {
    if (!this.inventory) {
      this.inventory = this.deps.snapshotInventory().catch(() => null)
      for (const path of watchedFiles()) this.files.set(path, readState(path))
    }
    return this.inventory
  }

  /** A file the agent is about to edit directly. */
  watchFile(path: string): void {
    if (!this.files.has(path)) this.files.set(path, readState(path))
  }

  /** Clears the snapshot without recording anything (e.g. the conversation was left). */
  reset(): void {
    this.inventory = null
    this.files.clear()
  }

  /**
   * Compares with the snapshot. Returns the new changes, and the ids of
   * earlier changes that this turn undid (they get marked, not re-recorded).
   */
  async finish(conversationId: string, earlier: ChangeRecord[]): Promise<{ records: ChangeRecord[]; undoneIds: string[] }> {
    const before = await this.inventory
    const files = new Map(this.files)
    this.reset()
    const records: ChangeRecord[] = []
    const undoneIds: string[] = []
    const open = earlier.filter((r) => !r.undone)
    const at = new Date().toISOString()

    // --- Software ---
    if (before) {
      const after = await this.deps.snapshotInventory().catch(() => null)
      if (after) {
        const diff = diffInventories(before, after)
        for (const r of open) {
          if (r.kind === 'installed' && diff.removed.some((i) => i.id === r.target)) undoneIds.push(r.id)
          if (r.kind === 'removed' && diff.added.some((i) => i.id === r.target)) undoneIds.push(r.id)
        }
        const undoneTargets = new Set(open.filter((r) => undoneIds.includes(r.id)).map((r) => r.target))
        records.push(...softwareRecords(diff, undoneTargets, at))
      }
    }

    // --- Settings files ---
    const backupDir = this.deps.backupDir(conversationId)
    for (const [path, was] of files) {
      const now = readState(path)
      if (sameContent(was, now)) continue
      // Back to how it was before an earlier change? Then that change was undone.
      const restored = open.find((r) => r.target === path && r.kind.startsWith('file-') && matchesBackup(r, now))
      if (restored) {
        undoneIds.push(restored.id)
        continue
      }
      const id = randomUUID()
      let undo: UndoStep[] | null = null
      let undoNote: string | null = null
      if (!was.existed) undo = [{ kind: 'remove-file', path }]
      else if (was.content === null) undoNote = 'The file was too large to back up.'
      else {
        mkdirSync(backupDir, { recursive: true })
        const backup = join(backupDir, `${id}-${basename(path)}`)
        writeFileSync(backup, was.content)
        undo = [{ kind: 'restore-file', path, backup }]
      }
      records.push({
        id,
        at,
        kind: !was.existed ? 'file-created' : !now.existed ? 'file-deleted' : 'file-changed',
        title: `${!was.existed ? 'Created' : !now.existed ? 'Deleted' : 'Changed'} ${path.replace(homedir(), '~')}`,
        target: path,
        undo,
        undoNote,
        undone: false
      })
    }
    return { records, undoneIds }
  }
}

function matchesBackup(record: ChangeRecord, now: FileState): boolean {
  const step = record.undo?.[0]
  if (step?.kind === 'remove-file') return !now.existed
  if (step?.kind === 'restore-file' && now.content) {
    try {
      return readFileSync(step.backup).equals(now.content)
    } catch {
      return false
    }
  }
  return false
}

function softwareRecords(diff: InventoryDiff, skip: Set<string>, at: string): ChangeRecord[] {
  const records: ChangeRecord[] = []
  const added = diff.added.filter((i) => !skip.has(i.id))
  // Dependencies that came along are folded into what was asked for.
  const requested = added.filter((i) => i.installedOnRequest)
  const pulledIn = added.filter((i) => !i.installedOnRequest)
  const main = requested.length ? requested : pulledIn

  for (const item of main) {
    const deps = requested.length ? pulledIn.filter((d) => d.source === item.source) : []
    const undo: UndoStep[] = []
    if (item.commands.uninstall) undo.push({ kind: 'command', command: item.commands.uninstall })
    // Homebrew leaves dependencies behind after an uninstall; autoremove clears the ones nothing else needs.
    if (undo.length && deps.length && item.source === 'homebrew' && item.commands.uninstall) {
      undo.push({ kind: 'command', command: { argv: [item.commands.uninstall.argv[0], 'autoremove'], display: 'brew autoremove' } })
    }
    records.push({
      id: randomUUID(),
      at,
      kind: 'installed',
      title: `Installed ${item.displayName} (${item.sourceLabel})${deps.length ? `, plus ${deps.length} package${deps.length > 1 ? 's' : ''} it needs` : ''}`,
      target: item.id,
      undo: undo.length ? undo : null,
      undoNote: undo.length ? null : `${item.sourceLabel} has no command to remove it.`,
      undone: false
    })
  }

  for (const item of diff.removed.filter((i) => !skip.has(i.id) && i.installedOnRequest)) {
    const undo = reinstallSteps(item)
    records.push({
      id: randomUUID(),
      at,
      kind: 'removed',
      title: `Removed ${item.displayName} (${item.sourceLabel})`,
      target: item.id,
      undo,
      undoNote: undo ? null : `There is no way to reinstall it automatically.`,
      undone: false
    })
  }

  for (const { before, after } of diff.updated) {
    records.push({
      id: randomUUID(),
      at,
      kind: 'updated',
      title: `Updated ${after.displayName} (${after.sourceLabel}) from ${before.version} to ${after.version}`,
      target: after.id,
      undo: null,
      undoNote: 'Updates can’t be rolled back automatically.',
      undone: false
    })
  }
  return records
}

function reinstallSteps(item: InstalledItem): UndoStep[] | null {
  // Apps are moved to the Trash when removed; put them back from there.
  if ((item.source === 'apps' || item.source === 'appstore') && item.location) {
    return [{ kind: 'put-back', name: basename(item.location), folder: dirname(item.location) }]
  }
  return item.commands.install ? [{ kind: 'command', command: item.commands.install }] : null
}

/** The shell command for an undo step, as the agent runs it (through a confirmation card). */
export function undoStepCommand(step: UndoStep): string {
  const finder = (script: string) => `osascript -e ${shellQuote(script)}`
  const asAppleScript = (s: string) => `"${s.replace(/(["\\])/g, '\\$1')}"`
  switch (step.kind) {
    case 'command':
      return step.command.display
    case 'restore-file':
      return `cp ${shellQuote(step.backup)} ${shellQuote(step.path)}`
    case 'remove-file':
      return finder(`tell application "Finder" to delete POSIX file ${asAppleScript(step.path)}`)
    case 'put-back':
      return finder(`tell application "Finder" to move (first item of trash whose name is ${asAppleScript(step.name)}) to (POSIX file ${asAppleScript(step.folder)} as alias)`)
  }
}

/** Removes the backups of a deleted conversation. */
export function deleteBackups(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
