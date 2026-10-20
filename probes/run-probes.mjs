// Answers the design's §8 unknowns against a live Inkdrop. Read-only except for a cancelled
// import dialog; leaves no notes behind. Writes results to probes/results.json.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectToInkdrop } from './cdp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.join(here, 'fixtures')
fs.mkdirSync(path.join(fixtures, 'folder'), { recursive: true })
fs.writeFileSync(path.join(fixtures, 'one.md'), '# Probe one\n\nbody\n')
fs.writeFileSync(path.join(fixtures, 'folder', 'inner.md'), '# Probe inner\n')
const oneMd = path.join(fixtures, 'one.md')
const folder = path.join(fixtures, 'folder')

const results = {}
const cdp = await connectToInkdrop()

results.environment = await cdp.evaluate(`({
  requireType: typeof require,
  inkdropType: typeof inkdrop,
  appVersion: inkdrop.appVersion,
  hasWebUtils: !!(require('electron').webUtils && require('electron').webUtils.getPathForFile),
  dialogIsObject: typeof inkdrop.dialog === 'object',
  showOpenDialogOwn: Object.prototype.hasOwnProperty.call(inkdrop.dialog, 'showOpenDialog'),
  showOpenDialogOnProto: typeof Object.getPrototypeOf(inkdrop.dialog).showOpenDialog,
  activeEditor: typeof inkdrop.getActiveEditor === 'function' ? !!inkdrop.getActiveEditor() : 'no fn',
})`)

results.layout = await cdp.evaluate(`(() => {
  const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const chain = el => { const out = []; for (let n = el, i = 0; n && i < 8; n = n.parentElement, i++) out.push(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')); return out }
  const cm = Array.from(document.querySelectorAll('.cm-editor'))
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    sidebar: rect('.sidebar'), sidebarMenu: rect('.sidebar-menu'), noteList: rect('.note-list-bar'),
    editor: rect('.editor'), mde: rect('.mde'), cmEditors: cm.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), chain: chain(e) } }),
    bookItems: document.querySelectorAll('.sidebar-menu-book-list-item').length,
    firstBookItemRect: rect('.sidebar-menu-book-list-item'),
  }
})()`)

results.existingListeners = {
  window: (await cdp.getEventListeners('window')).filter(l => /drag|drop/.test(l.type)),
  document: (await cdp.getEventListeners('document')).filter(l => /drag|drop/.test(l.type)),
  body: (await cdp.getEventListeners('document.body')).filter(l => /drag|drop/.test(l.type))
}

// Drop target for probes 1 and 3: the middle of the sidebar (outside the editor).
const sb = results.layout.sidebar || results.layout.sidebarMenu
const target = { x: sb.x + Math.floor(sb.w / 2), y: sb.y + Math.floor(sb.h / 2) }

// Baseline: no plugin handlers. Does a drop over the sidebar reach the page at all?
await cdp.evaluate(`(() => {
  window.__probe = { baselineDrop: 0, drops: [] }
  window.__probeBaseline = e => { window.__probe.baselineDrop++ }
  window.addEventListener('drop', window.__probeBaseline, true)
})()`)
await cdp.dropFiles({ ...target, files: [oneMd] })
await cdp.sleep(300)
results.baseline = await cdp.evaluate(`(() => { window.removeEventListener('drop', window.__probeBaseline, true); return { dropEventsSeen: window.__probe.baselineDrop } })()`)

// Probes 1 + 3: capture-phase dragover/drop on window; resolve paths with webUtils.
await cdp.evaluate(`(() => {
  const { webUtils } = require('electron')
  window.__probe.drops = []
  window.__probeDragover = e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }
  window.__probeDrop = e => {
    e.preventDefault(); e.stopPropagation()
    const files = Array.from(e.dataTransfer.files)
    window.__probe.drops.push({
      count: files.length,
      names: files.map(f => f.name),
      paths: files.map(f => { try { return webUtils.getPathForFile(f) } catch (err) { return 'ERR:' + err.message } }),
      legacyPath: files.map(f => f.path),
      types: Array.from(e.dataTransfer.types),
      target: e.target && e.target.className
    })
  }
  window.addEventListener('dragover', window.__probeDragover, true)
  window.addEventListener('drop', window.__probeDrop, true)
})()`)
await cdp.dropFiles({ ...target, files: [oneMd] })
await cdp.sleep(300)
await cdp.dropFiles({ ...target, files: [folder] })
await cdp.sleep(300)
await cdp.dropFiles({ ...target, files: [oneMd, folder] })
await cdp.sleep(300)
results.captureDrop = await cdp.evaluate(`(() => {
  window.removeEventListener('dragover', window.__probeDragover, true)
  window.removeEventListener('drop', window.__probeDrop, true)
  return window.__probe.drops
})()`)

// Probe 2: picker stand-in, synchronous dispatch, built-in dialog appears with the given path.
results.standIn = await cdp.evaluate(`(() => {
  const dialog = inkdrop.dialog
  const original = dialog.showOpenDialog
  let called = 0, calledWith = null
  dialog.showOpenDialog = async opts => { called++; calledWith = opts && opts.title; return { canceled: false, filePaths: [${JSON.stringify(oneMd)}] } }
  let dispatchReturned
  try {
    dispatchReturned = inkdrop.commands.dispatch(document.body, 'import-markdown:import-from-file')
  } finally {
    dialog.showOpenDialog = original
  }
  return { calledSynchronously: called, calledWith, dispatchReturned: String(dispatchReturned), restored: dialog.showOpenDialog === original }
})()`)
await cdp.sleep(1500)
results.dialogOpen = await cdp.evaluate(`(() => {
  const d = document.querySelector('.import-markdown-wizard-dialog')
  if (!d) return { present: false }
  const cs = getComputedStyle(d)
  const buttons = Array.from(d.querySelectorAll('button')).map(b => b.textContent.trim())
  return { present: true, className: d.className, display: cs.display, visibility: cs.visibility, opacity: cs.opacity, text: d.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200), buttons, parentClass: d.parentElement && d.parentElement.className }
})()`)
// Probe 5: how the dialog goes away on Cancel.
results.dialogAfterCancel = await cdp.evaluate(`(async () => {
  const d = document.querySelector('.import-markdown-wizard-dialog')
  if (!d) return { skipped: 'no dialog' }
  const cancel = Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel')
  if (!cancel) return { skipped: 'no cancel button' }
  const seen = []
  const observer = new MutationObserver(muts => { for (const m of muts) seen.push({ type: m.type, attr: m.attributeName, removed: m.removedNodes.length, added: m.addedNodes.length }) })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
  cancel.click()
  await new Promise(r => setTimeout(r, 1200))
  observer.disconnect()
  const after = document.querySelector('.import-markdown-wizard-dialog')
  const cs = after && getComputedStyle(after)
  return { stillInDom: !!after, className: after && after.className, display: cs && cs.display, visibility: cs && cs.visibility, opacity: cs && cs.opacity, mutationsSeen: seen.length, sample: seen.slice(0, 12) }
})()`)

// Probe 4: what the editor region looks like, for the exclusion selector.
results.editorRegion = await cdp.evaluate(`(() => {
  const cands = ['.cm-editor', '.mde', '.editor', '.editor-content', '.editor-body', '.mde-cm-wrapper', '.editor-preview']
  const out = {}
  for (const sel of cands) { const els = document.querySelectorAll(sel); out[sel] = Array.from(els).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }) }
  return out
})()`)

fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
cdp.close()
