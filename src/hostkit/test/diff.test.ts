import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffInventories, isEmptyDiff } from '../diff.ts'
import type { InstalledItem, Inventory, SourceReport } from '../types.ts'

const item = (source: string, name: string, version: string): InstalledItem => ({
  id: `${source}:${name}`,
  source,
  sourceLabel: source,
  name,
  displayName: name,
  kind: 'cli',
  version,
  latestVersion: null,
  outdated: false,
  description: null,
  homepage: null,
  location: null,
  executables: [],
  dependencies: [],
  dependents: [],
  installedOnRequest: true,
  extra: {},
  commands: { upgrade: null, uninstall: null, install: null },
  claims: []
})
const report = (id: string, status: SourceReport['status'] = 'ok'): SourceReport => ({
  id,
  label: id,
  status,
  version: null,
  path: null,
  count: 0,
  error: null,
  durationMs: 0
})
const inventory = (items: InstalledItem[], sources: SourceReport[]): Inventory => ({ items, sources, loadedAt: '' })

test('added, removed and updated items', () => {
  const before = inventory([item('npm', 'a', '1'), item('npm', 'b', '1'), item('homebrew', 'wget', '1.24')], [report('npm'), report('homebrew')])
  const after = inventory([item('npm', 'a', '2'), item('npm', 'c', '1'), item('homebrew', 'wget', '1.24')], [report('npm'), report('homebrew')])
  const diff = diffInventories(before, after)
  assert.deepEqual(diff.added.map((i) => i.id), ['npm:c'])
  assert.deepEqual(diff.removed.map((i) => i.id), ['npm:b'])
  assert.deepEqual(diff.updated.map((u) => [u.before.version, u.after.version]), [['1', '2']])
  assert.equal(isEmptyDiff(diffInventories(before, before)), true)
})

test('a source that failed to load never looks like everything was removed', () => {
  const before = inventory([item('npm', 'a', '1'), item('pipx', 'yt-dlp', '1')], [report('npm'), report('pipx')])
  const after = inventory([item('npm', 'a', '1')], [report('npm'), report('pipx', 'error')])
  assert.equal(isEmptyDiff(diffInventories(before, after)), true)
})
