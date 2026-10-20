import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { connectApp, createFixtures } from './app.mjs'

const scenarios = [
  { name: 'single-md', files: ['a.md'], expected: [['a.md', '']] },
  { name: 'md-and-txt', files: ['a.md', 'b.MD', 'c.txt'],
    expected: [['a.md', ''], ['b.MD', ''], ['c.txt', '']] },
  { name: 'single-folder', files: ['folder1'],
    expected: [['folder1/x.md', ''], ['folder1/y.md', ''], ['folder1/sub/z.md', 'sub']],
    books: ['sub'] },
  { name: 'two-folders', files: ['folder1', 'folder2'],
    expected: [['folder1/x.md', 'folder1'], ['folder1/y.md', 'folder1'],
      ['folder1/sub/z.md', 'folder1/sub'], ['folder2/w.md', 'folder2']],
    books: ['folder1', 'folder1/sub', 'folder2'] },
  { name: 'folder-and-files', files: ['folder2', 'a.md'],
    expected: [['folder2/w.md', 'folder2'], ['a.md', '']], books: ['folder2'] },
  { name: 'empty-folder', files: ['empty-folder'], expected: [] },
  { name: 'html-alone', files: ['page.html'], kind: 'html', expected: [['page.html', '']] },
  { name: 'md-then-html', files: ['a.md', 'page.html'], dropOnly: true },
  { name: 'unsupported-only', files: ['skip.pdf'], dropOnly: true },
  { name: 'editor-drop', files: ['a.md'], dropOnly: true },
  { name: 'note-list', files: ['a.md'], expected: [['a.md', '']],
    target: '.note-list-bar', dropOnly: true },
  { name: 'cancel', files: ['a.md'] },
  { name: 'oversized', skip: 'The >maxAttachmentFileSize case is not covered' }
]

async function runScenario(app, scenario, mode, fixtures, marker) {
  const kind = scenario.kind || 'markdown'
  if (scenario.name === 'editor-drop') {
    await app.openScratchNote(marker)
    await app.trigger(mode, fixtures, scenario.files, kind, '.editor')
    await app.observeNoWizard()
    const notes = await app.getNotes()
    assert.equal(notes.length, 1, 'Only the scratch note should exist')
    assert.equal(notes[0]._id, app.scratchNoteId)
    return 'scratch note verified active before drop; no wizard for 3 s'
  }
  if (scenario.name === 'unsupported-only') {
    const startedAt = await app.evaluate('Date.now()')
    const matchingNotifications = `inkdrop.notifications.getNotifications().filter(notification =>
      +notification.getTimestamp() >= ${startedAt} &&
      (notification.getMessage() + ' ' + (notification.getDetail() || '')).includes('skip.pdf'))`
    try {
      await app.trigger(mode, fixtures, scenario.files)
      await app.poll(() => app.evaluate(
        `${matchingNotifications}.length > 0 &&
         document.querySelector('.notification-bar')?.textContent.includes('skip.pdf')`
      ), 'notification naming skip.pdf', 5000)
      await app.observeNoWizard()
      await app.assertContents(fixtures, [])
      return 'new notification names skip.pdf; no wizard for 3 s; 0 notes'
    } finally {
      await app.evaluate(`${matchingNotifications}.forEach(notification => notification.dismiss())`)
    }
  }
  if (scenario.name === 'cancel') {
    const summaries = []
    for (const [format, names] of [['markdown', ['a.md']], ['html', ['page.html']]]) {
      await app.trigger(mode, fixtures, names, format)
      summaries.push(await app.waitWizard(format))
      await app.clickButton(format, 'Cancel')
      await app.waitWizardClosed(format)
      await app.assertContents(fixtures, [])
    }
    return `Markdown and HTML Cancel removed dialogs; 0 notes; summaries: ${summaries.join(' | ')}`
  }
  await app.trigger(mode, fixtures, scenario.files, kind, scenario.target)
  if (scenario.name === 'md-then-html') {
    const first = await app.waitWizard('markdown')
    assert.equal(await app.evaluate(
      `!!document.querySelector('.modal-layout .import-html-wizard-dialog')`
    ), false, 'HTML wizard must wait for Markdown closure')
    await app.importWizard('markdown')
    const second = await app.importWizard('html')
    const detail = await app.assertContents(fixtures, [['a.md', ''], ['page.html', '']])
    return `${detail}; Markdown then HTML; summaries: ${first} | ${second}`
  }
  const summary = await app.waitWizard(kind)
  if (scenario.name === 'empty-folder') {
    assert.match(summary, /Going to import 0 Markdown files/, 'Empty folder summary')
  }
  await app.importWizard(kind)
  const detail = await app.assertContents(fixtures, scenario.expected, scenario.books)
  return `${detail}; summary: ${summary}`
}

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'direct' },
      only: { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    }
  })
  if (values.help) {
    console.log('Usage: node e2e/run.mjs [--mode direct|drop] [--only <scenario>]')
    console.log(`Scenarios: ${scenarios.map(scenario => scenario.name).join(', ')}`)
    return
  }
  assert.ok(['direct', 'drop'].includes(values.mode), '--mode must be direct or drop')
  const selected = scenarios.filter(scenario => !values.only || scenario.name === values.only)
  assert.ok(selected.length, `Unknown scenario: ${values.only}`)
  if (values.only && selected[0].dropOnly) {
    assert.equal(values.mode, 'drop', `${values.only} requires --mode drop`)
  }
  const { marker, fixtures } = await createFixtures()
  let app
  let passed = 0
  let failed = 0
  let skipped = 0
  console.log(`MODE ${values.mode}; marker=${marker}`)
  try {
    app = await connectApp()
    await app.showWindow()
    await app.createNotebook()
    console.log(`NOTEBOOK ${app.bookId} (E2E Drop Import)`)
    for (const scenario of selected) {
      if (scenario.skip || (scenario.dropOnly && values.mode === 'direct')) {
        console.log(`SKIP ${scenario.name} — ${scenario.skip || 'drop mode only'}`)
        skipped++
        continue
      }
      let detail
      let failure
      try {
        app.startScenario(scenario.name)
        await app.showWindow()
        await app.dismissNotifications()
        detail = await runScenario(app, scenario, values.mode, fixtures, marker)
        if (values.mode === 'drop') {
          const picker = await app.evaluate(`({
            isOwnProperty: Object.prototype.hasOwnProperty.call(inkdrop.dialog, 'showOpenDialog'),
            type: typeof inkdrop.dialog.showOpenDialog
          })`)
          assert.deepEqual(picker, { isOwnProperty: false, type: 'function' },
            'Plugin must restore the inherited picker function')
          detail += '; picker restored'
        }
      } catch (error) {
        failure = error.message
      } finally {
        try {
          const removed = await app.cleanup()
          assert.equal((await app.getNotes()).length, 0, 'Scenario cleanup left notes')
          assert.equal((await app.getTree()).books.length, 0, 'Scenario cleanup left child notebooks')
          detail = `${detail || ''}; cleanup: ${removed.notes} notes, ${removed.books} child notebooks`
        } catch (error) {
          failure = `${failure ? `${failure}; ` : ''}cleanup failed: ${error.message}`
        }
      }
      if (failure) {
        console.log(`FAIL ${scenario.name} — ${failure}${detail || ''}`)
        failed++
        if (failure.includes('cleanup failed:')) break
      } else {
        console.log(`PASS ${scenario.name} — ${detail}`)
        passed++
      }
    }
  } catch (error) {
    console.log(`FAIL setup — ${error.message}`)
    failed++
  } finally {
    if (app) {
      try {
        if (app.bookId) {
          app.startScenario('final-cleanup')
          await app.cleanup({ removeRoot: true })
          console.log(`CLEANUP removed ${app.removedNotes} notes and ${app.removedBooks} notebooks (including root)`)
          console.log(`VERIFY ${await app.verifyCleanup(marker, fixtures)}`)
        }
      } catch (error) {
        console.log(`FAIL final-cleanup — ${error.message}`)
        failed++
      } finally {
        app.cdp.close()
      }
    }
  }
  console.log(`RESULT ${passed} passed, ${failed} failed, ${skipped} skipped`)
  if (failed) process.exitCode = 1
}

await main().catch(error => {
  console.error(`FAIL arguments — ${error.message}`)
  process.exitCode = 1
})
