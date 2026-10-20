import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitForWizardClose } from './wait-for-wizard-close.ts'

function createWizardFixture(visibilityState: DocumentVisibilityState = 'visible') {
  const body = {} as HTMLElement
  const parent = {} as Node
  let wizard: Element | null = null
  let callback: MutationCallback
  let isConnected = false
  const observations: { target: Node; options?: MutationObserverInit }[] = []
  const visibilityListeners = new Set<() => void>()
  class Observer {
    constructor(listener: MutationCallback) { callback = listener }
    observe(target: Node, options?: MutationObserverInit) {
      isConnected = true
      observations.push({ target, options })
    }
    disconnect() { isConnected = false }
    takeRecords() { return [] }
  }
  const documentRoot = {
    body,
    querySelector: () => wizard,
    get visibilityState() { return visibilityState },
    addEventListener: (_type: string, listener: () => void) => { visibilityListeners.add(listener) },
    removeEventListener: (_type: string, listener: () => void) => { visibilityListeners.delete(listener) }
  } as unknown as Document
  function showWizard() { wizard = { parentNode: parent } as Element }
  function hideWizard() { wizard = null }
  function emitMutation() { callback([], {} as MutationObserver) }
  function setVisibility(state: DocumentVisibilityState) {
    visibilityState = state
    for (const listener of visibilityListeners) listener()
  }
  return {
    body, parent, observations, showWizard, hideWizard, emitMutation, setVisibility,
    get isConnected() { return isConnected },
    get visibilityListenerCount() { return visibilityListeners.size },
    options: { document: documentRoot, MutationObserver: Observer as typeof MutationObserver }
  }
}

test('waits for a delayed wizard to appear and then for its removal', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = createWizardFixture()
  let outcome: string | null = null
  const waiting = waitForWizardClose('.wizard', fixture.options).then(result => { outcome = result })
  assert.deepEqual(fixture.observations[0], {
    target: fixture.body, options: { childList: true, subtree: true }
  })
  context.mock.timers.tick(1200)
  await Promise.resolve()
  assert.equal(outcome, null)
  fixture.showWizard()
  fixture.emitMutation()
  assert.deepEqual(fixture.observations[1], {
    target: fixture.parent, options: { childList: true }
  })
  context.mock.timers.tick(10000)
  await Promise.resolve()
  assert.equal(outcome, null)
  fixture.hideWizard()
  fixture.emitMutation()
  await waiting
  assert.equal(outcome, 'closed')
  assert.equal(fixture.isConnected, false)
  assert.equal(fixture.visibilityListenerCount, 0)
})

test('an already open wizard waits until removal', async () => {
  const fixture = createWizardFixture()
  fixture.showWizard()
  const waiting = waitForWizardClose('.wizard', fixture.options)
  fixture.hideWizard()
  fixture.emitMutation()
  assert.equal(await waiting, 'closed')
  assert.equal(fixture.isConnected, false)
})

test('a wizard that never appears while visible reports absent after five seconds', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = createWizardFixture()
  let outcome: string | null = null
  const waiting = waitForWizardClose('.wizard', fixture.options).then(result => { outcome = result })
  context.mock.timers.tick(4999)
  await Promise.resolve()
  assert.equal(outcome, null)
  context.mock.timers.tick(1)
  await waiting
  assert.equal(outcome, 'absent')
  assert.equal(fixture.isConnected, false)
  assert.equal(fixture.visibilityListenerCount, 0)
})

test('a hidden window does not count toward the appearance timeout', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = createWizardFixture('hidden')
  let outcome: string | null = null
  const waiting = waitForWizardClose('.wizard', fixture.options).then(result => { outcome = result })
  context.mock.timers.tick(60000)
  await Promise.resolve()
  assert.equal(outcome, null)
  fixture.setVisibility('visible')
  context.mock.timers.tick(4999)
  await Promise.resolve()
  assert.equal(outcome, null)
  fixture.showWizard()
  fixture.emitMutation()
  context.mock.timers.tick(60000)
  await Promise.resolve()
  assert.equal(outcome, null)
  fixture.hideWizard()
  fixture.emitMutation()
  await waiting
  assert.equal(outcome, 'closed')
})

test('hiding the window mid-wait pauses the timeout and showing it restarts the full timeout', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = createWizardFixture()
  let outcome: string | null = null
  const waiting = waitForWizardClose('.wizard', fixture.options).then(result => { outcome = result })
  context.mock.timers.tick(4000)
  fixture.setVisibility('hidden')
  context.mock.timers.tick(60000)
  await Promise.resolve()
  assert.equal(outcome, null)
  fixture.setVisibility('visible')
  context.mock.timers.tick(4999)
  await Promise.resolve()
  assert.equal(outcome, null)
  context.mock.timers.tick(1)
  await waiting
  assert.equal(outcome, 'absent')
})

test('abort reports aborted and disconnects before and after wizard appearance', async () => {
  for (const isWizardOpen of [false, true]) {
    const fixture = createWizardFixture()
    const controller = new AbortController()
    if (isWizardOpen) fixture.showWizard()
    const waiting = waitForWizardClose('.wizard', {
      ...fixture.options, signal: controller.signal
    })
    controller.abort()
    assert.equal(await waiting, 'aborted')
    assert.equal(fixture.isConnected, false)
    assert.equal(fixture.visibilityListenerCount, 0)
  }
})

test('an already aborted wait installs no observer', async () => {
  const fixture = createWizardFixture()
  assert.equal(await waitForWizardClose('.wizard', {
    ...fixture.options, signal: AbortSignal.abort()
  }), 'aborted')
  assert.deepEqual(fixture.observations, [])
})
