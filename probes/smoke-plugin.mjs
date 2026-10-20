import path from 'node:path'
import { connectToInkdrop } from './cdp.mjs'
const oneMd = path.resolve('probes/fixtures/one.md')
const cdp = await connectToInkdrop()
const out = {}
out.package = await cdp.evaluate(`(() => { const p = inkdrop.packages; return { loaded: p.isPackageLoaded ? p.isPackageLoaded('drop-import') : 'n/a', active: !!p.getActivePackage?.('drop-import'), activeNames: p.getActivePackages().map(x => x.name).filter(n => /drop|import/.test(n)), disabled: p.isPackageDisabled?.('drop-import') } })()`)
out.windowListeners = (await cdp.getEventListeners('window')).filter(l => /drag|drop/.test(l.type))
await cdp.evaluate(`(async () => { await inkdrop.window.show(); await inkdrop.window.focus() })()`)
const sb = await cdp.evaluate(`(() => { const r = document.querySelector('.sidebar-menu').getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })()`)
await cdp.evaluate(`(() => { window.__errors = []; window.addEventListener('error', e => window.__errors.push(String(e.message))) })()`)
await cdp.dropFiles({ ...sb, files: [oneMd] })
let wizard = null
for (let i = 0; i < 60; i++) { await cdp.sleep(100); wizard = await cdp.evaluate(`(() => { const d = document.querySelector('.import-markdown-wizard-dialog'); return d ? { className: d.className, text: d.textContent.replace(/\\s+/g,' ').trim().slice(0, 160) } : null })()`); if (wizard && /Going to import|Scanning/.test(wizard.text) && !/Scanning/.test(wizard.text)) break }
out.wizard = wizard
out.notifications = await cdp.evaluate(`Array.from(document.querySelectorAll('.notification, .ui.message, [class*="notification"]')).map(e => e.textContent.replace(/\\s+/g,' ').trim().slice(0,120)).filter(Boolean).slice(0,5)`)
out.errors = await cdp.evaluate(`window.__errors`)
if (wizard) {
  await cdp.evaluate(`(() => { const d = document.querySelector('.import-markdown-wizard-dialog'); Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel').click() })()`)
  let gone = false
  for (let i = 0; i < 30; i++) { await cdp.sleep(100); gone = await cdp.evaluate(`!document.querySelector('.import-markdown-wizard-dialog')`); if (gone) break }
  out.cancelledAndRemoved = gone
}
console.log(JSON.stringify(out, null, 1))
cdp.close()
