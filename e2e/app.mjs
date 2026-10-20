import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connectToInkdrop } from '../probes/cdp.mjs'

export const root = fileURLToPath(new URL('./', import.meta.url))
export const notebookName = 'E2E Drop Import'
export const wizardSelector =
  '.modal-layout .import-markdown-wizard-dialog, .modal-layout .import-html-wizard-dialog'

async function withTimeout(operation, description, timeout = 15000) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${description} timed out; is Inkdrop still running?`)), timeout)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function createFixtures() {
  const marker = `dropimport${randomUUID().replaceAll('-', '')}`
  const files = [
    'a.md', 'b.MD', 'c.txt', 'page.html', 'page2.htm', 'skip.pdf',
    'folder1/x.md', 'folder1/y.md', 'folder1/sub/z.md', 'folder2/w.md'
  ]
  const fixtures = {}
  for (const [index, name] of files.entries()) {
    const filename = path.join(root, 'fixtures', name)
    const token = `${marker}file${index}`
    const title = `Fixture ${name}`
    const body = /\.html?$/i.test(name)
      ? `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>${token}</p></body></html>`
      : `# ${title}\n\n${token}\n`
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, body)
    fixtures[name] = { filename, token, title }
  }
  for (const name of ['folder1', 'folder2', 'empty-folder']) {
    const filename = path.join(root, 'fixtures', name)
    await fs.mkdir(filename, { recursive: true })
    fixtures[name] = { filename }
  }
  return { marker, fixtures }
}

export async function connectApp() {
  const source = await fs.readFile(path.join(root, '.env.local'), 'utf8')
  const env = {}
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) throw new Error('Expected KEY=VALUE in e2e/.env.local')
    let value = line.slice(separator + 1).trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    env[line.slice(0, separator).trim()] = value
  }
  for (const key of [
    'INKDROP_LOCAL_SERVER_URL', 'INKDROP_LOCAL_USERNAME',
    'INKDROP_LOCAL_PASSWORD', 'INKDROP_DEVTOOLS_PORT'
  ]) assert.ok(env[key], `Missing ${key} in e2e/.env.local`)
  const authorization = `Basic ${Buffer.from(`${env.INKDROP_LOCAL_USERNAME}:${env.INKDROP_LOCAL_PASSWORD}`).toString('base64')}`
  const api = async (route, body) => {
    let response
    try {
      response = await fetch(`${env.INKDROP_LOCAL_SERVER_URL.replace(/\/$/, '')}${route}`, {
        method: body ? 'POST' : 'GET',
        headers: { authorization, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000)
      })
    } catch (error) {
      const origin = new URL(env.INKDROP_LOCAL_SERVER_URL).origin
      throw new Error(`Local HTTP API unavailable at ${origin} (${error.cause?.code || error.name}); enable Inkdrop's local server before running the harness`)
    }
    if (!response.ok) throw new Error(`Local API ${body ? 'POST' : 'GET'} ${route}: HTTP ${response.status}`)
    return response.json()
  }
  await api('/books')
  const cdp = await withTimeout(connectToInkdrop(Number(env.INKDROP_DEVTOOLS_PORT)), 'CDP connection')
  return new App(cdp, api)
}

export class App {
  constructor(cdp, api) {
    this.cdp = cdp
    this.api = api
    this.bookId = null
    this.removedNotes = 0
    this.removedBooks = 0
    this.originalNoteId = null
    this.scenarioName = 'setup'
    this.hasLoggedRefocus = false
  }

  evaluate(expression) {
    return withTimeout(this.cdp.evaluate(expression), 'CDP evaluation')
  }

  startScenario(name) {
    this.scenarioName = name
    this.hasLoggedRefocus = false
  }

  async restoreVisibility() {
    const visibility = await this.evaluate(`(async () => {
      const visibility = document.visibilityState
      if (visibility !== 'visible') {
        await inkdrop.window.show()
        await inkdrop.window.focus()
      }
      return visibility
    })()`)
    if (visibility !== 'visible' && !this.hasLoggedRefocus) {
      console.log(`REFOCUS ${this.scenarioName} — document.visibilityState=${visibility}; called show() and focus()`)
      this.hasLoggedRefocus = true
    }
  }

  async poll(check, description, timeout = 10000) {
    const deadline = Date.now() + timeout
    do {
      await this.restoreVisibility()
      const result = await check()
      if (result) return result
      await new Promise(resolve => setTimeout(resolve, 100))
    } while (Date.now() < deadline)
    const visibility = await this.evaluate('document.visibilityState').catch(() => 'unavailable')
    throw new Error(`Timed out waiting for ${description} (${timeout} ms); document.visibilityState=${visibility}`)
  }

  async showWindow() {
    await this.evaluate('(async () => { await inkdrop.window.show(); await inkdrop.window.focus() })()')
    await this.poll(() => this.evaluate('document.visibilityState === "visible"'), 'visible renderer')
  }

  async dismissNotifications() {
    const hasNotifications = await this.evaluate(`(() => {
      if (!document.querySelector('.notification-bar .notification-item-view')) return false
      inkdrop.notifications.clear()
      inkdrop.notifications.addInfo('E2E notification reset', { dismissable: true })
      return true
    })()`)
    if (!hasNotifications) return
    // Closing a dismissable item refreshes the view from the cleared manager.
    await this.poll(() => this.evaluate(`(() => {
      const items = [...document.querySelectorAll('.notification-bar .notification-item-view')]
      for (const item of items) item.querySelector('.close-button')?.click()
      return items.length === 0
    })()`), 'notification DOM removal')
  }

  async createNotebook() {
    const books = await this.api('/books')
    assert.ok(!books.some(book => book.name === notebookName),
      `A notebook named ${notebookName} already exists; refusing to reuse or delete it`)
    assert.equal(await this.evaluate(`!!document.querySelector(${JSON.stringify(wizardSelector)})`),
      false, 'An import wizard is already open; close it before running the harness')
    this.originalNoteId = await this.evaluate('inkdrop.store.getState().editingNote?._id || null')
    const result = await this.api('/books', { name: notebookName })
    this.bookId = result.id
    assert.ok(this.bookId, 'POST /books must return the created notebook id')
    const book = await this.api(`/${this.bookId}`)
    assert.equal(book.name, notebookName)
  }

  async getTree() {
    const books = await this.api('/books')
    const descendants = []
    const ids = new Set([this.bookId])
    let changed = true
    while (changed) {
      changed = false
      for (const book of books) {
        if (!ids.has(book._id) && ids.has(book.parentBookId)) {
          descendants.push(book)
          ids.add(book._id)
          changed = true
        }
      }
    }
    return { books: descendants, ids }
  }

  async getNotes() {
    const ids = await this.evaluate(
      `inkdrop.localDB.notes.findAllIdsInBook(${JSON.stringify(this.bookId)}, { includeChildren: true })`
    )
    return Promise.all(ids.map(id => this.api(`/${id}`)))
  }

  async searchNotes(token) {
    const result = await this.api(`/notes?keyword=${encodeURIComponent(token)}&limit=100`)
    if (Array.isArray(result)) return result
    assert.ok(Array.isArray(result.rows), 'Unexpected local API notes response')
    return result.rows.map(row => row.doc || row)
  }

  async trigger(mode, fixtures, names, kind = 'markdown', target = '.sidebar-menu') {
    const files = names.map(name => fixtures[name].filename)
    if (mode === 'drop') {
      await this.dropFiles(files, target)
      return
    }
    const command = kind === 'html' ? 'import-html:import-from-file'
      : names.every(name => !path.extname(name)) ? 'import-markdown:import-from-directory'
        : 'import-markdown:import-from-file'
    const called = await this.evaluate(`(() => {
      const dialog = inkdrop.dialog
      const original = dialog.showOpenDialog
      const descriptor = Object.getOwnPropertyDescriptor(dialog, 'showOpenDialog')
      let calls = 0
      dialog.showOpenDialog = async () => {
        calls++
        return { canceled: false, filePaths: ${JSON.stringify(files)} }
      }
      try { inkdrop.commands.dispatch(document.body, ${JSON.stringify(command)}) }
      finally {
        if (descriptor) Object.defineProperty(dialog, 'showOpenDialog', descriptor)
        else delete dialog.showOpenDialog
      }
      if (dialog.showOpenDialog !== original) throw new Error('Picker restoration failed')
      return calls
    })()`)
    assert.equal(called, 1, `${command} must request the picker synchronously once`)
  }

  async dropFiles(files, selector) {
    assert.ok(['.sidebar-menu', '.note-list-bar', '.editor'].includes(selector))
    if (selector === '.note-list-bar') {
      await this.evaluate(`(() => {
        if (document.querySelector('.note-list-bar')) return
        const layout = document.querySelector('.note-list-bar-layout') ?? document.body
        inkdrop.commands.dispatch(layout, 'core:note-list-show-all-notes')
      })()`)
      await this.poll(() => this.evaluate('!!document.querySelector(".note-list-bar")'), 'note list shown')
    }
    const point = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element) throw new Error('Drop region is missing')
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) throw new Error('Drop region is hidden')
      const x = rect.x + rect.width / 2
      const y = rect.y + (${JSON.stringify(selector)} === '.editor'
        ? rect.height / 2 : Math.min(rect.height / 2, 100))
      const target = document.elementFromPoint(x, y)
      if (!target?.closest(${JSON.stringify(selector)})) throw new Error('Drop region is occluded')
      if (${JSON.stringify(selector)} !== '.editor' && target.closest('.editor'))
        throw new Error('Refusing a drop over the editor')
      return { x, y }
    })()`)
    if (selector === '.editor') {
      assert.ok(this.scratchNoteId, 'An editor drop requires the scratch note')
      const active = await this.evaluate(
        '({ id: inkdrop.store.getState().editingNote?._id, bookId: inkdrop.store.getState().editingNote?.bookId })'
      )
      assert.deepEqual(active, { id: this.scratchNoteId, bookId: this.bookId },
        'Refusing editor drop while a non-scratch note is active')
    }
    await withTimeout(this.cdp.dropFiles({ ...point, files }), 'CDP drag dispatch')
  }

  async waitWizard(kind = 'markdown') {
    const selector = `.modal-layout .import-${kind}-wizard-dialog`
    return this.poll(async () => {
      const state = await this.evaluate(`(() => {
        const dialog = document.querySelector(${JSON.stringify(selector)})
        if (!dialog) return null
        return { text: ${JSON.stringify(kind)} === 'html'
            ? [...dialog.querySelectorAll('.header, .content > .message')]
              .map(element => element.textContent.trim()).join(' — ')
            : dialog.textContent.replace(/\\s+/g, ' ').trim(),
          ready: ${JSON.stringify(kind)} === 'html'
            ? !!dialog.querySelector('.notebook-list-bar')
            : [...dialog.querySelectorAll('button')].some(b => b.textContent.trim() === 'Next'),
          error: !!dialog.querySelector('.error.message') }
      })()`)
      if (state?.error) throw new Error(state.text)
      return state?.ready ? state.text : false
    }, `${kind} wizard ${kind === 'html' ? 'notebook step' : 'summary'}`)
  }

  async clickButton(kind, label) {
    await this.poll(() => this.evaluate(`(() => {
      const dialog = document.querySelector('.modal-layout .import-${kind}-wizard-dialog')
      const button = [...(dialog?.querySelectorAll('button') || [])]
        .find(button => button.textContent.trim() === ${JSON.stringify(label)})
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`), `${kind} ${label} button`)
  }

  async importWizard(kind = 'markdown') {
    const summary = await this.waitWizard(kind)
    if (kind === 'markdown') await this.clickButton(kind, 'Next')
    await this.poll(() => this.evaluate(`(() => {
      const dialog = document.querySelector('.modal-layout .import-${kind}-wizard-dialog')
      const row = [...(dialog?.querySelectorAll('.notebook-list-bar .item[data-value]') || [])]
        .find(row => row.dataset.value === ${JSON.stringify(this.bookId)})
      if (!row) return false
      row.click()
      return true
    })()`), 'dedicated notebook picker row')
    await this.poll(() => this.evaluate(`(() => {
      const dialog = document.querySelector('.modal-layout .import-${kind}-wizard-dialog')
      const selected = dialog?.querySelector('.notebook-list-bar .item.active')
      return selected?.dataset.value === ${JSON.stringify(this.bookId)}
    })()`), 'dedicated notebook selection')
    await this.clickButton(kind, 'Import')
    await this.waitWizardClosed(kind)
    return summary
  }

  async waitWizardClosed(kind) {
    await this.poll(() => this.evaluate(`(() => {
      const dialog = document.querySelector('.modal-layout .import-${kind}-wizard-dialog')
      if (dialog?.querySelector('.error.message')) throw new Error(dialog.textContent)
      return !dialog
    })()`), `${kind} wizard DOM removal`, 20000)
  }

  async observeNoWizard(duration = 3000) {
    const deadline = Date.now() + duration
    do {
      await this.restoreVisibility()
      assert.equal(await this.evaluate(`!!document.querySelector(${JSON.stringify(wizardSelector)})`),
        false, 'Unexpected import wizard')
      await new Promise(resolve => setTimeout(resolve, 100))
    } while (Date.now() < deadline)
  }

  async closeWizards() {
    await this.poll(() => this.evaluate(`(() => {
      const dialogs = [...document.querySelectorAll(${JSON.stringify(wizardSelector)})]
      for (const dialog of dialogs) {
        const button = [...dialog.querySelectorAll('button')]
          .find(button => ['Cancel', 'Close'].includes(button.textContent.trim()))
        button?.click()
      }
      return dialogs.length === 0
    })()`), 'remaining wizard cleanup', 30000)
  }

  async closeEditorDropError() {
    const closed = await this.evaluate(`(() => {
      const dialog = document.querySelector('.modal-layout .dialog-assistive-error')
      if (!dialog?.textContent.includes('You can only insert image files.') ||
          !dialog.textContent.includes('text/markdown')) return false
      const button = [...dialog.querySelectorAll('button')]
        .find(button => button.textContent.trim() === 'Close')
      if (!button) throw new Error('Editor file-type error has no Close button')
      button.click()
      return true
    })()`)
    if (closed) {
      await this.poll(() => this.evaluate(
        `!document.querySelector('.modal-layout .dialog-assistive-error')`
      ), 'editor file-type error DOM removal')
    }
  }

  async assertContents(fixtures, expected, expectedBooks = []) {
    await this.poll(async () => (await this.getNotes()).length === expected.length,
      `${expected.length} imported notes`)
    const tree = await this.getTree()
    const bookPaths = new Map([[this.bookId, '']])
    for (const book of tree.books) {
      bookPaths.set(book._id, [bookPaths.get(book.parentBookId), book.name].filter(Boolean).join('/'))
    }
    assert.deepEqual([...bookPaths.values()].filter(Boolean).sort(), [...expectedBooks].sort(),
      'Imported notebook hierarchy')
    const notes = await this.getNotes()
    for (const [filename, bookPath] of expected) {
      const fixture = fixtures[filename]
      const note = notes.find(note => note.body?.includes(fixture.token))
      assert.ok(note, `Missing fixture ${filename}`)
      assert.equal(bookPaths.get(note.bookId), bookPath, `${filename} destination`)
      assert.ok([fixture.title, path.basename(filename, path.extname(filename))].includes(note.title),
        `${filename} title: ${note.title}`)
      await this.poll(async () => (await this.searchNotes(fixture.token)).some(result => result._id === note._id),
        `HTTP keyword search for ${filename}`)
    }
    return `${notes.length} notes; child notebooks: ${expectedBooks.join(', ') || 'none'}`
  }

  async openScratchNote(marker) {
    const result = await this.api('/notes', {
      bookId: this.bookId, title: 'E2E editor drop scratch', body: `${marker}scratch`
    })
    this.scratchNoteId = result.id
    assert.ok(this.scratchNoteId, 'POST /notes did not return an id')
    await this.evaluate(`inkdrop.commands.dispatch(document.body, 'core:open-note', {
      noteId: ${JSON.stringify(this.scratchNoteId)}, viewMode: 'edit'
    })`)
    await this.poll(() => this.evaluate(
      `inkdrop.store.getState().editingNote?._id === ${JSON.stringify(this.scratchNoteId)}`
    ), 'scratch note to become active')
  }

  async cleanup({ removeRoot = false } = {}) {
    if (!this.bookId) return
    await this.showWindow()
    await this.closeWizards()
    if (this.scratchNoteId) {
      await this.closeEditorDropError()
      await this.evaluate(`inkdrop.commands.dispatch(document.body, 'core:close-note')`)
      await this.poll(() => this.evaluate(
        `inkdrop.store.getState().editingNote?._id !== ${JSON.stringify(this.scratchNoteId)}`
      ), 'scratch editor to close')
      this.scratchNoteId = null
    }
    const owned = await this.evaluate(`(async () => {
      const bookId = ${JSON.stringify(this.bookId)}
      const books = await inkdrop.localDB.books.getAllChildren(bookId)
      const noteIds = await inkdrop.localDB.notes.findAllIdsInBook(bookId, { includeChildren: true })
      const notes = await inkdrop.localDB.notes.get(noteIds)
      return { books, notes }
    })()`)
    const tree = { books: owned.books, ids: new Set([this.bookId, ...owned.books.map(book => book._id)]) }
    const notes = owned.notes
    for (const note of notes) {
      assert.ok(tree.ids.has(note.bookId), 'Refusing cleanup outside the dedicated notebook tree')
      await this.evaluate(`(async () => {
        const note = await inkdrop.localDB.notes.get(${JSON.stringify(note._id)})
        if (!${JSON.stringify([...tree.ids])}.includes(note.bookId))
          throw new Error('Note moved outside the E2E notebook; refusing deletion')
        await inkdrop.localDB.notes.remove(note._id)
      })()`)
      this.removedNotes++
    }
    const parents = new Map(tree.books.map(book => [book._id, book.parentBookId]))
    const getDepth = book => {
      let depth = 0
      for (let parent = book.parentBookId; parents.has(parent); parent = parents.get(parent)) depth++
      return depth
    }
    for (const book of tree.books.sort((left, right) => getDepth(right) - getDepth(left))) {
      await this.evaluate(`inkdrop.localDB.utils.deleteBook(${JSON.stringify(book._id)})`)
      this.removedBooks++
    }
    if (removeRoot) {
      await this.evaluate(`inkdrop.localDB.utils.deleteBook(${JSON.stringify(this.bookId)})`)
      this.removedBooks++
      if (this.originalNoteId) {
        await this.evaluate(`inkdrop.commands.dispatch(document.body, 'core:open-note', {
          noteId: ${JSON.stringify(this.originalNoteId)}
        })`)
      }
    }
    return { notes: notes.length, books: tree.books.length + Number(removeRoot) }
  }

  async verifyCleanup(marker, fixtures) {
    await this.poll(async () => !(await this.api('/books')).some(book => book._id === this.bookId || book.name === notebookName),
      'E2E notebook removal from HTTP API')
    for (const token of [marker, ...Object.values(fixtures).map(fixture => fixture.token).filter(Boolean)]) {
      await this.poll(async () => (await this.searchNotes(token)).length === 0, `no residual marker ${token}`)
    }
    return `GET /books: no "${notebookName}"; GET /notes?keyword=<marker>: 0 for run marker and all 10 file markers`
  }
}
