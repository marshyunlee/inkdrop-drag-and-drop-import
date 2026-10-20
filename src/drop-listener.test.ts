import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attachDropListener } from './drop-listener.ts'
import { EDITOR_PANE_SELECTOR } from './types.ts'
import type { ClassifiedPaths } from './types.ts'

if (!('Element' in globalThis)) {
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: class {} })
}

test('capture listeners preserve editor and non-file drags, import outside drops, and dispose', () => {
  const originalElement = Object.getOwnPropertyDescriptor(globalThis, 'Element')
  class TargetElement {
    isEditor = false
    closest(selector: string) {
      assert.equal(selector, EDITOR_PANE_SELECTOR)
      return this.isEditor ? this : null
    }
  }
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: TargetElement })
  try {
    const listeners = new Map<string, (event: DragEvent) => void>()
    const windowRoot = {
      addEventListener(type: string, listener: (event: DragEvent) => void, isCapture: boolean) {
        assert.equal(isCapture, true)
        listeners.set(type, listener)
      },
      removeEventListener(type: string, listener: (event: DragEvent) => void, isCapture: boolean) {
        assert.equal(isCapture, true)
        assert.equal(listeners.get(type), listener)
        listeners.delete(type)
      }
    } as unknown as Window
    const target = new TargetElement()
    const calls: string[] = []
    const importedPaths: ClassifiedPaths[] = []
    const classifiedPaths: ClassifiedPaths = {
      markdown: ['/one.md'], html: [], unsupported: [], isFolderOnly: false
    }
    const files = [{ name: 'one.md' }] as File[]
    const disposeListener = attachDropListener(windowRoot, {
      resolvePaths: droppedFiles => {
        assert.equal(droppedFiles, files)
        calls.push('resolve')
        return { paths: ['/one.md'], virtualFileNames: [] }
      },
      classifyPaths: (paths, stat) => {
        assert.deepEqual(paths, ['/one.md'])
        assert.equal(typeof stat, 'function')
        calls.push('classify')
        return classifiedPaths
      },
      importPaths: async paths => {
        calls.push('import')
        importedPaths.push(paths)
      },
      reportError: error => { throw error }
    })
    function emitDrag(type: string, types = ['Files']) {
      const transfer = { types, files, dropEffect: 'none' }
      const event = {
        type, target, dataTransfer: transfer,
        preventDefault: () => calls.push('prevent'),
        stopPropagation: () => calls.push('stop')
      } as unknown as DragEvent
      listeners.get(type)!(event)
      return transfer
    }

    target.isEditor = true
    assert.equal(emitDrag('dragover').dropEffect, 'none')
    emitDrag('drop')
    assert.deepEqual(calls, [])
    target.isEditor = false
    emitDrag('dragover', ['text/plain'])
    emitDrag('drop', ['text/plain'])
    assert.deepEqual(calls, [])
    assert.equal(emitDrag('dragover').dropEffect, 'copy')
    assert.deepEqual(calls, ['prevent', 'stop'])
    calls.length = 0
    emitDrag('drop')
    assert.deepEqual(calls, ['prevent', 'stop', 'resolve', 'classify', 'import'])
    assert.deepEqual(importedPaths, [classifiedPaths])
    disposeListener()
    assert.equal(listeners.size, 0)
  } finally {
    if (originalElement) {
      Object.defineProperty(globalThis, 'Element', originalElement)
    } else {
      Reflect.deleteProperty(globalThis, 'Element')
    }
  }
})

function attachWithFakes(options: {
  resolvePaths?: Parameters<typeof attachDropListener>[1]['resolvePaths']
  classifyPaths?: Parameters<typeof attachDropListener>[1]['classifyPaths']
  importPaths: Parameters<typeof attachDropListener>[1]['importPaths']
}) {
  const listeners = new Map<string, (event: DragEvent) => void>()
  const reportedErrors: unknown[] = []
  attachDropListener(
    {
      addEventListener: (type: string, listener: (event: DragEvent) => void) => listeners.set(type, listener),
      removeEventListener: () => {}
    } as unknown as Window,
    { ...options, reportError: error => reportedErrors.push(error) }
  )
  const drop = () =>
    listeners.get('drop')!({
      type: 'drop',
      target: null,
      dataTransfer: { types: ['Files'], files: [] },
      preventDefault: () => {},
      stopPropagation: () => {}
    } as unknown as DragEvent)
  return { drop, reportedErrors }
}

test('path-less dropped files are reported as unsupported by name', () => {
  const importedPaths: ClassifiedPaths[] = []
  const { drop, reportedErrors } = attachWithFakes({
    resolvePaths: () => ({ paths: ['/one.md'], virtualFileNames: ['pasted.png'] }),
    classifyPaths: () => ({ markdown: ['/one.md'], html: [], unsupported: [], isFolderOnly: false }),
    importPaths: async paths => { importedPaths.push(paths) }
  })
  drop()
  assert.deepEqual(importedPaths, [
    { markdown: ['/one.md'], html: [], unsupported: ['pasted.png'], isFolderOnly: false }
  ])
  assert.deepEqual(reportedErrors, [])
})

test('a synchronous resolve failure is reported once and nothing is imported', () => {
  const failure = new Error('no electron')
  let importCount = 0
  const { drop, reportedErrors } = attachWithFakes({
    resolvePaths: () => { throw failure },
    importPaths: async () => { importCount++ }
  })
  drop()
  assert.deepEqual(reportedErrors, [failure])
  assert.equal(importCount, 0)
})

test('a rejected import sequence is reported once', async () => {
  const failure = new Error('dispatch failed')
  const { drop, reportedErrors } = attachWithFakes({
    resolvePaths: () => ({ paths: [], virtualFileNames: [] }),
    classifyPaths: () => ({ markdown: [], html: [], unsupported: [], isFolderOnly: false }),
    importPaths: () => Promise.reject(failure)
  })
  drop()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(reportedErrors, [failure])
})
