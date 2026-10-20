import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dispatchImportSequence, dispatchImportWithPaths } from './dispatch-import.ts'
import type { ImportOptions } from './dispatch-import.ts'
import { HTML_WIZARD_SELECTOR, IMPORT_COMMANDS, MARKDOWN_WIZARD_SELECTOR } from './types.ts'
import type { ClassifiedPaths, WizardWaitOutcome } from './types.ts'

function createImportFixture() {
  const commands: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
  const notificationOptions: unknown[] = []
  const waitedSelectors: string[] = []
  const selections: Promise<{ canceled: boolean; filePaths: string[] }>[] = []
  const originalPicker = async () => ({ canceled: true, filePaths: [] as string[] })
  const dialog = Object.create({ showOpenDialog: originalPicker }) as ImportOptions['dialog']
  const options: ImportOptions = {
    dialog,
    dispatchCommand: command => {
      commands.push(command)
      selections.push(dialog.showOpenDialog({}))
    },
    notifications: {
      addWarning: (message, opts) => { warnings.push(message); notificationOptions.push(opts); return undefined! },
      addError: (message, opts) => { errors.push(message); notificationOptions.push(opts); return undefined! }
    },
    waitForWizardClose: async selector => { waitedSelectors.push(selector); return 'closed' }
  }
  const paths: ClassifiedPaths = {
    markdown: [], html: [], unsupported: [], isFolderOnly: false
  }
  return {
    options, paths, commands, warnings, errors, notificationOptions, waitedSelectors, selections, originalPicker
  }
}

test('restores the inherited picker after successful dispatch and supplies dropped paths', async () => {
  const fixture = createImportFixture()
  assert.equal(dispatchImportWithPaths(fixture.options, IMPORT_COMMANDS.markdownFiles, ['/one.md']), true)
  assert.equal(Object.hasOwn(fixture.options.dialog, 'showOpenDialog'), false)
  assert.equal(fixture.options.dialog.showOpenDialog, fixture.originalPicker)
  assert.deepEqual(await fixture.selections[0], { canceled: false, filePaths: ['/one.md'] })
  assert.deepEqual(fixture.errors, [])
})

test('restores the inherited picker when dispatch throws', () => {
  const fixture = createImportFixture()
  const failure = new Error('dispatch failed')
  fixture.options.dispatchCommand = () => { throw failure }
  assert.throws(() => dispatchImportWithPaths(fixture.options, 'import', []), failure)
  assert.equal(Object.hasOwn(fixture.options.dialog, 'showOpenDialog'), false)
  assert.equal(fixture.options.dialog.showOpenDialog, fixture.originalPicker)
})

test('restores an existing own picker descriptor after success and throw', () => {
  for (const isThrowing of [false, true]) {
    const fixture = createImportFixture()
    const descriptor = {
      value: fixture.originalPicker, writable: false, configurable: true, enumerable: true
    }
    Object.defineProperty(fixture.options.dialog, 'showOpenDialog', descriptor)
    if (isThrowing) {
      fixture.options.dispatchCommand = () => { throw new Error('dispatch failed') }
      assert.throws(() => dispatchImportWithPaths(fixture.options, 'import', []))
    } else {
      dispatchImportWithPaths(fixture.options, 'import', [])
    }
    assert.deepEqual(Object.getOwnPropertyDescriptor(fixture.options.dialog, 'showOpenDialog'), descriptor)
  }
})

test('an uncalled picker raises one dismissable error and skips the wait and HTML', async () => {
  const fixture = createImportFixture()
  fixture.options.dispatchCommand = command => { fixture.commands.push(command) }
  fixture.options.waitForWizardClose = async () => { assert.fail('must not wait') }
  await dispatchImportSequence({
    ...fixture.paths, markdown: ['/one.md'], html: ['/two.html']
  }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles])
  assert.equal(fixture.errors.length, 1)
  assert.match(fixture.errors[0], /built-in importer is not available.*disabled or missing/)
  assert.deepEqual(fixture.notificationOptions, [{ dismissable: true }])
  assert.equal(Object.hasOwn(fixture.options.dialog, 'showOpenDialog'), false)
})

test('Markdown precedes HTML, waits for each wizard to close, and stays pending until the HTML wizard closes', async () => {
  const fixture = createImportFixture()
  const closes = new Map<string, PromiseWithResolvers<WizardWaitOutcome>>()
  fixture.options.waitForWizardClose = selector => {
    const close = Promise.withResolvers<WizardWaitOutcome>()
    closes.set(selector, close)
    return close.promise
  }
  let isSettled = false
  const sequence = dispatchImportSequence({
    ...fixture.paths, markdown: ['/one.md'], html: ['/two.html']
  }, fixture.options).then(() => { isSettled = true })
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles])
  await Promise.resolve()
  assert.equal(fixture.commands.length, 1)
  closes.get(MARKDOWN_WIZARD_SELECTOR)!.resolve('closed')
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles, IMPORT_COMMANDS.htmlFiles])
  assert.equal(isSettled, false)
  closes.get(HTML_WIZARD_SELECTOR)!.resolve('closed')
  await sequence
  assert.equal(isSettled, true)
  assert.deepEqual(await Promise.all(fixture.selections), [
    { canceled: false, filePaths: ['/one.md'] },
    { canceled: false, filePaths: ['/two.html'] }
  ])
})

test('an absent Markdown wizard skips HTML and warns once, dismissably', async () => {
  const fixture = createImportFixture()
  fixture.options.waitForWizardClose = async () => 'absent'
  await dispatchImportSequence({
    ...fixture.paths, markdown: ['/one.md'], html: ['/two.html']
  }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles])
  assert.equal(fixture.warnings.length, 1)
  assert.match(fixture.warnings[0], /did not open; the HTML files were not imported/)
  assert.deepEqual(fixture.notificationOptions, [{ dismissable: true }])
})

test('an absent Markdown wizard on a Markdown-only drop warns without mentioning HTML', async () => {
  const fixture = createImportFixture()
  fixture.options.waitForWizardClose = async () => 'absent'
  await dispatchImportSequence({ ...fixture.paths, markdown: ['/one.md'] }, fixture.options)
  assert.equal(fixture.warnings.length, 1)
  assert.doesNotMatch(fixture.warnings[0], /HTML/)
})

test('folder-only drops use the Markdown folders command', async () => {
  const fixture = createImportFixture()
  await dispatchImportSequence({
    ...fixture.paths, markdown: ['/folder'], isFolderOnly: true
  }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFolders])
})

test('unsupported-only drops produce exactly one dismissable basename notification and no dispatch', async () => {
  const fixture = createImportFixture()
  await dispatchImportSequence({
    ...fixture.paths, unsupported: ['/private/one.pdf', '/private/two.png']
  }, fixture.options)
  assert.deepEqual(fixture.warnings, ['drop-import: unsupported items: one.pdf, two.png'])
  assert.deepEqual(fixture.notificationOptions, [{ dismissable: true }])
  assert.deepEqual(fixture.commands, [])
  assert.deepEqual(fixture.errors, [])
})

test('mixed drops notify once and pass only supported paths to the importers', async () => {
  const fixture = createImportFixture()
  await dispatchImportSequence({
    ...fixture.paths, markdown: ['/one.md'], html: ['/two.html'], unsupported: ['/three.pdf']
  }, fixture.options)
  assert.equal(fixture.warnings.length, 1)
  assert.deepEqual((await Promise.all(fixture.selections)).flatMap(result => result.filePaths), [
    '/one.md', '/two.html'
  ])
})

test('an absent HTML wizard warns once, dismissably', async () => {
  const fixture = createImportFixture()
  fixture.options.waitForWizardClose = async () => 'absent'
  await dispatchImportSequence({ ...fixture.paths, html: ['/one.html'] }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.htmlFiles])
  assert.equal(fixture.warnings.length, 1)
  assert.match(fixture.warnings[0], /HTML import dialog did not open/)
  assert.deepEqual(fixture.notificationOptions, [{ dismissable: true }])
})

test('HTML-only drops wait for the HTML wizard and never for a Markdown wizard', async () => {
  const fixture = createImportFixture()
  await dispatchImportSequence({ ...fixture.paths, html: ['/one.html'] }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.htmlFiles])
  assert.deepEqual(fixture.waitedSelectors, [HTML_WIZARD_SELECTOR])
})

test('deactivation during the Markdown wait prevents HTML dispatch', async () => {
  const fixture = createImportFixture()
  const controller = new AbortController()
  const wizardClose = Promise.withResolvers<WizardWaitOutcome>()
  fixture.options.signal = controller.signal
  fixture.options.waitForWizardClose = () => wizardClose.promise
  const sequence = dispatchImportSequence({
    ...fixture.paths, markdown: ['/one.md'], html: ['/two.html']
  }, fixture.options)
  controller.abort()
  wizardClose.resolve('aborted')
  await sequence
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles])
  assert.deepEqual(fixture.warnings, [])
})
