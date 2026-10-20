import { connectToInkdrop } from './cdp.mjs'
const cdp = await connectToInkdrop()
await cdp.evaluate(`(async () => { await inkdrop.window.show(); await inkdrop.window.focus() })()`)
const r = await cdp.evaluate(`(async () => {
  const oneMd = ${JSON.stringify(process.cwd() + '/probes/fixtures/one.md')}
  const dialog = inkdrop.dialog, original = dialog.showOpenDialog
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [oneMd] })
  try { inkdrop.commands.dispatch(document.body, 'import-markdown:import-from-file') } finally { dialog.showOpenDialog = original }
  await new Promise(r => setTimeout(r, 1200))
  const d = document.querySelector('.import-markdown-wizard-dialog')
  if (!d) return { opened: false }
  const layout = d.parentElement
  const muts = []
  const obs = new MutationObserver(ms => { for (const m of ms) muts.push({ t: m.type, a: m.attributeName, tgt: (m.target.className||'').toString().slice(0,60), rm: Array.from(m.removedNodes).map(n => (n.className||'').toString().slice(0,60)), add: m.addedNodes.length }) })
  obs.observe(layout, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] })
  obs.observe(d, { attributes: true, attributeFilter: ['class', 'style'] })
  const t0 = performance.now()
  Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel').click()
  let removedAt = null
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 50)); if (!document.querySelector('.import-markdown-wizard-dialog')) { removedAt = Math.round(performance.now() - t0); break } }
  obs.disconnect()
  return { opened: true, visibility: document.visibilityState, layoutClass: layout.className, removedAfterMs: removedAt, stillInDom: !!document.querySelector('.import-markdown-wizard-dialog'), muts }
})()`)
console.log(JSON.stringify(r, null, 1))
cdp.close()
