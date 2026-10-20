import { connectToInkdrop } from './cdp.mjs'
const cdp = await connectToInkdrop()
const diag = await cdp.evaluate(`(() => {
  const d = document.querySelector('.import-markdown-wizard-dialog')
  if (!d) return { noDialog: true }
  const b = Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel')
  const r = b.getBoundingClientRect(); const cx = Math.round(r.x + r.width/2), cy = Math.round(r.y + r.height/2)
  const at = document.elementFromPoint(cx, cy)
  const propsKey = Object.keys(b).find(k => k.startsWith('__reactProps'))
  const props = propsKey ? b[propsKey] : null
  return { center: [cx, cy], elementAtPoint: at && (at.tagName + '.' + at.className + ' text=' + at.textContent.trim().slice(0,20)), isButtonAtPoint: at === b, hasReactOnClick: !!(props && props.onClick), buttonDisabled: b.disabled, docHasFocus: document.hasFocus(), visibilityState: document.visibilityState, modalLayoutChildren: document.querySelector('.modal-layout') && document.querySelector('.modal-layout').children.length }
})()`)
console.log('diag:', JSON.stringify(diag))
if (!diag.noDialog) {
  const closed = await cdp.evaluate(`(async () => {
    const d = document.querySelector('.import-markdown-wizard-dialog')
    const b = Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel')
    const muts = []
    const obs = new MutationObserver(ms => { for (const m of ms) muts.push({ t: m.type, a: m.attributeName, tgt: (m.target.className||'').toString().slice(0,70), rm: m.removedNodes.length, add: m.addedNodes.length }) })
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style'] })
    const propsKey = Object.keys(b).find(k => k.startsWith('__reactProps'))
    b[propsKey].onClick({ preventDefault(){}, stopPropagation(){} })
    await new Promise(r => setTimeout(r, 1200))
    obs.disconnect()
    const after = document.querySelector('.import-markdown-wizard-dialog')
    const cs = after && getComputedStyle(after)
    return { stillInDom: !!after, className: after && after.className, display: cs && cs.display, visibility: cs && cs.visibility, opacity: cs && cs.opacity, pointerEvents: cs && cs.pointerEvents, muts: muts.length, modalMuts: muts.filter(m => /modal|dialog/.test(m.tgt)).slice(0, 10) }
  })()`)
  console.log('after React onClick:', JSON.stringify(closed, null, 1))
}
cdp.close()
