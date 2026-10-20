import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitForWizardClose } from './wait-for-wizard-close.ts'

function createWizardFixture() {
  const body = {} as HTMLElement
  const parent = {} as Node
  let wizard: Element | null = null
  let callback: MutationCallback
  let isConnected = false
  const observations: { target: Node; options?: MutationObserverInit }[] = []
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
    querySelector: () => wizard
  } as Pick<Document, 'body' | 'querySelector'>
  function showWizard() { wizard = { parentNode: parent } as Element }
  function hideWizard() { wizard = null }
  function emitMutation() { callback([], {} as MutationObserver) }
  return {
    body, parent, observations, showWizard, hideWizard, emitMutation,
    get isConnected() { return isConnected },
    options: { document: documentRoot, MutationObserver: Observer as typeof MutationObserver }
  }
}

test('waits for a delayed wizard to appear and then for its removal', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = createWizardFixture()
  let isResolved = false
  const waiting = waitForWizardClose('.wizard', fixture.options).then(() => { isResolved = true })
  assert.deepEqual(fixture.observations[0], {
    target: fixture.body, options: { childList: true, subtree: true }
  })
  context.mock.timers.tick(1200)
  await Promise.resolve()
  assert.equal(isResolved, false)
  fixture.showWizard()
  fixture.emitMutation()
  assert.deepEqual(fixture.observations[1], {
    target: fixture.parent, options: { childList: true }
  })
  context.mock.timers.tick(10000)
  await Promise.resolve()
  assert.equal(isResolved, false)
  fixture.hideWizard()
  fixture.emitMutation()
  await waiting
  assert.equal(fixture.isConnected, false)
})

test('an already open wizard waits until removal', async () => {
  const fixture = createWizardFixture()
  fixture.showWizard()
  const waiting = waitForWizardClose('.wizard', fixture.options)
  fixture.hideWizard()
  fixture.emitMutation()
  await waiting
  assert.equal(fixture.isConnected, false)
})

test('a wizard that never appears resolves at five seconds and disconnects', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = createWizardFixture()
  let isResolved = false
  const waiting = waitForWizardClose('.wizard', fixture.options).then(() => { isResolved = true })
  context.mock.timers.tick(4999)
  await Promise.resolve()
  assert.equal(isResolved, false)
  context.mock.timers.tick(1)
  await waiting
  assert.equal(fixture.isConnected, false)
})

test('abort disconnects observers before and after wizard appearance', async () => {
  for (const isWizardOpen of [false, true]) {
    const fixture = createWizardFixture()
    const controller = new AbortController()
    if (isWizardOpen) fixture.showWizard()
    const waiting = waitForWizardClose('.wizard', {
      ...fixture.options, signal: controller.signal
    })
    controller.abort()
    await waiting
    assert.equal(fixture.isConnected, false)
  }
})

test('an already aborted wait installs no observer', async () => {
  const fixture = createWizardFixture()
  await waitForWizardClose('.wizard', {
    ...fixture.options, signal: AbortSignal.abort()
  })
  assert.deepEqual(fixture.observations, [])
})
