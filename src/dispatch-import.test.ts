import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dispatchImportSequence, dispatchImportWithPaths } from './dispatch-import.ts'
import type { ImportOptions } from './dispatch-import.ts'
import { IMPORT_COMMANDS, MARKDOWN_WIZARD_SELECTOR } from './types.ts'
import type { ClassifiedPaths } from './types.ts'

function createImportFixture() {
  const commands: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
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
      addWarning: message => { warnings.push(message); return undefined! },
      addError: message => { errors.push(message); return undefined! }
    },
    waitForWizardClose: async () => {}
  }
  const paths: ClassifiedPaths = {
    markdown: [], html: [], unsupported: [], isFolderOnly: false
  }
  return { options, paths, commands, warnings, errors, selections, originalPicker }
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

test('an uncalled picker raises one error and skips the wait and HTML', async () => {
  const fixture = createImportFixture()
  fixture.options.dispatchCommand = command => { fixture.commands.push(command) }
  fixture.options.waitForWizardClose = async () => { assert.fail('must not wait') }
  await dispatchImportSequence({
    ...fixture.paths, markdown: ['/one.md'], html: ['/two.html']
  }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles])
  assert.equal(fixture.errors.length, 1)
  assert.match(fixture.errors[0], /built-in importer is not available.*disabled or missing/)
  assert.equal(Object.hasOwn(fixture.options.dialog, 'showOpenDialog'), false)
})

test('Markdown precedes HTML and waits for the wizard to close between dispatches', async () => {
  const fixture = createImportFixture()
  const wizardClose = Promise.withResolvers<void>()
  fixture.options.waitForWizardClose = selector => {
    assert.equal(selector, MARKDOWN_WIZARD_SELECTOR)
    return wizardClose.promise
  }
  const sequence = dispatchImportSequence({
    ...fixture.paths, markdown: ['/one.md'], html: ['/two.html']
  }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles])
  await Promise.resolve()
  assert.equal(fixture.commands.length, 1)
  wizardClose.resolve()
  await sequence
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles, IMPORT_COMMANDS.htmlFiles])
  assert.deepEqual(await Promise.all(fixture.selections), [
    { canceled: false, filePaths: ['/one.md'] },
    { canceled: false, filePaths: ['/two.html'] }
  ])
})

test('folder-only drops use the Markdown folders command', async () => {
  const fixture = createImportFixture()
  await dispatchImportSequence({
    ...fixture.paths, markdown: ['/folder'], isFolderOnly: true
  }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFolders])
})

test('unsupported-only drops produce exactly one basename notification and no dispatch', async () => {
  const fixture = createImportFixture()
  await dispatchImportSequence({
    ...fixture.paths, unsupported: ['/private/one.pdf', '/private/two.png']
  }, fixture.options)
  assert.deepEqual(fixture.warnings, ['drop-import: unsupported items: one.pdf, two.png'])
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

test('HTML-only drops dispatch without waiting for a Markdown wizard', async () => {
  const fixture = createImportFixture()
  fixture.options.waitForWizardClose = async () => { assert.fail('must not wait') }
  await dispatchImportSequence({ ...fixture.paths, html: ['/one.html'] }, fixture.options)
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.htmlFiles])
})

test('deactivation during the Markdown wait prevents HTML dispatch', async () => {
  const fixture = createImportFixture()
  const controller = new AbortController()
  const wizardClose = Promise.withResolvers<void>()
  fixture.options.signal = controller.signal
  fixture.options.waitForWizardClose = () => wizardClose.promise
  const sequence = dispatchImportSequence({
    ...fixture.paths, markdown: ['/one.md'], html: ['/two.html']
  }, fixture.options)
  controller.abort()
  wizardClose.resolve()
  await sequence
  assert.deepEqual(fixture.commands, [IMPORT_COMMANDS.markdownFiles])
})
