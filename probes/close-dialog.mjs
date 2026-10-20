import { connectToInkdrop } from './cdp.mjs'
const cdp = await connectToInkdrop()
const rect = await cdp.evaluate(`(() => { const d = document.querySelector('.import-markdown-wizard-dialog'); if (!d) return null; const b = Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })()`)
console.log('cancel button at', rect)
if (rect) {
  await cdp.evaluate(`(() => { window.__muts = []; window.__obs = new MutationObserver(ms => { for (const m of ms) window.__muts.push({ t: m.type, a: m.attributeName, tgt: (m.target.className||'').toString().slice(0,60), rm: m.removedNodes.length, add: m.addedNodes.length }) }); window.__obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style'] }) })()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  await cdp.sleep(1200)
  const after = await cdp.evaluate(`(() => { window.__obs.disconnect(); const d = document.querySelector('.import-markdown-wizard-dialog'); const cs = d && getComputedStyle(d); return { stillInDom: !!d, className: d && d.className, display: cs && cs.display, visibility: cs && cs.visibility, opacity: cs && cs.opacity, muts: window.__muts.length, sample: window.__muts.filter(m => /modal|dialog/.test(m.tgt)).slice(0, 10) } })()`)
  console.log('after mouse click:', JSON.stringify(after, null, 1))
  if (after.stillInDom && /visible/.test(after.className)) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await cdp.sleep(800)
    console.log('after Escape:', JSON.stringify(await cdp.evaluate(`(() => { const d = document.querySelector('.import-markdown-wizard-dialog'); return { stillInDom: !!d, className: d && d.className } })()`)))
  }
}
cdp.close()
