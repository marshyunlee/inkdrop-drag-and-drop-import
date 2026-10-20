import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Environment } from '@inkdropapp/types'
import { DropImportPlugin } from './index.ts'
import type { PluginDependencies } from './index.ts'
import type { ClassifiedPaths } from './types.ts'

for (const [name, value] of Object.entries({ window: {}, document: { body: {} } })) {
  if (!(name in globalThis)) Object.defineProperty(globalThis, name, { configurable: true, value })
}

const droppedPaths: ClassifiedPaths ={ markdown: ['/one.md'], html: [], unsupported: [], isFolderOnly: false }

function createHarness(sequence: PluginDependencies['dispatchImportSequence']) {
  const notifications: string[] = []
  const app = {
    dialog: {},
    commands: { dispatch: () => true },
    notifications: {
      addInfo: (message: string) => notifications.push(`info:${message}`),
      addError: (message: string) => notifications.push(`error:${message}`)
    }
  } as unknown as Environment
  let attachCount = 0
  let disposeCount = 0
  let importPaths: ((paths: ClassifiedPaths) => Promise<void>) | null = null
  const plugin = new DropImportPlugin({
    attachDropListener: (_windowRoot, options) => {
      attachCount++
      importPaths = options.importPaths
      return () => { disposeCount++ }
    },
    dispatchImportSequence: sequence
  })
  return { app, plugin, notifications, importPaths: () => importPaths!, counts: () => ({ attachCount, disposeCount }) }
}

test('activating twice replaces the listener and deactivate disposes it and aborts the signal', async () => {
  const signals: AbortSignal[] = []
  const harness = createHarness(async (_paths, options) => { signals.push(options.signal!) })
  harness.plugin.activate(harness.app)
  harness.plugin.activate(harness.app)
  assert.deepEqual(harness.counts(), { attachCount: 2, disposeCount: 1 })
  await harness.importPaths()(droppedPaths)
  harness.plugin.deactivate()
  assert.deepEqual(harness.counts(), { attachCount: 2, disposeCount: 2 })
  assert.equal(signals[0].aborted, true)
})

test('a drop during an in-flight import is refused with one notification', async () => {
  let finishSequence!: () => void
  const sequenceCalls: ClassifiedPaths[] = []
  const harness = createHarness(paths => {
    sequenceCalls.push(paths)
    return new Promise<void>(resolve => { finishSequence = resolve })
  })
  harness.plugin.activate(harness.app)
  const firstImport = harness.importPaths()(droppedPaths)
  await harness.importPaths()(droppedPaths)
  assert.equal(sequenceCalls.length, 1)
  assert.deepEqual(harness.notifications, ['info:drop-import: an import is already in progress'])
  finishSequence()
  await firstImport
  const secondImport = harness.importPaths()(droppedPaths)
  assert.equal(sequenceCalls.length, 2)
  finishSequence()
  await secondImport
})
