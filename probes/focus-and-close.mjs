import { connectToInkdrop } from './cdp.mjs'
const cdp = await connectToInkdrop()
const state = () => cdp.evaluate(`({ visibility: document.visibilityState, hasFocus: document.hasFocus(), dialog: !!document.querySelector('.import-markdown-wizard-dialog.visible') })`)
console.log('before:', JSON.stringify(await state()))
try { await cdp.send('Page.bringToFront'); console.log('Page.bringToFront ok') } catch (e) { console.log('Page.bringToFront failed:', e.message) }
await cdp.sleep(500)
console.log('after bringToFront:', JSON.stringify(await state()))
if ((await state()).visibility === 'hidden') {
  const r = await cdp.evaluate(`(async () => { const w = inkdrop.window; const out = {}; for (const m of ['show','focus','restore','moveTop']) { if (typeof w[m] === 'function') { try { await w[m](); out[m] = 'called' } catch (e) { out[m] = 'ERR ' + e.message } } else out[m] = 'absent' } return out })()`)
  console.log('inkdrop.window calls:', JSON.stringify(r))
  await cdp.sleep(800)
  console.log('after window calls:', JSON.stringify(await state()))
}
const closed = await cdp.evaluate(`(async () => {
  const d = document.querySelector('.import-markdown-wizard-dialog')
  if (!d) return { noDialog: true }
  const b = Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel')
  const muts = []
  const obs = new MutationObserver(ms => { for (const m of ms) muts.push({ t: m.type, a: m.attributeName, tgt: (m.target.className||'').toString().slice(0,70), rm: m.removedNodes.length, add: m.addedNodes.length }) })
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style'] })
  b.click()
  await new Promise(r => setTimeout(r, 1500))
  obs.disconnect()
  const after = document.querySelector('.import-markdown-wizard-dialog')
  return { stillInDom: !!after, className: after && after.className, muts: muts.length, modalMuts: muts.filter(m => /modal|dialog/.test(m.tgt)).slice(0, 10) }
})()`)
console.log('close via button.click():', JSON.stringify(closed, null, 1))
cdp.close()
