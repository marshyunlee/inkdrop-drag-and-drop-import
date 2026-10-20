// Minimal Chrome DevTools Protocol client for an Inkdrop launched with --remote-debugging-port.
// Uses the WebSocket global (Node 22+); no dependencies.

export async function connectToInkdrop(port = 9222) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page = targets.find(t => t.type === 'page' && t.url.includes('renderer/index.html'))
  if (!page) throw new Error(`No Inkdrop renderer page among ${targets.length} targets`)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('WebSocket connect failed'))
  })
  let nextId = 0
  const pending = new Map()
  const events = []
  ws.onmessage = ev => {
    const message = JSON.parse(ev.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
    } else {
      events.push(message)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression, { awaitPromise = true } = {}) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true
    })
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails)
      )
    }
    return result.result.value
  }
  const getEventListeners = async expression => {
    const { result } = await send('Runtime.evaluate', { expression })
    const listeners = await send('DOMDebugger.getEventListeners', { objectId: result.objectId })
    return listeners.listeners.map(l => ({
      type: l.type,
      useCapture: l.useCapture,
      passive: l.passive,
      scriptId: l.scriptId,
      line: l.lineNumber,
      column: l.columnNumber
    }))
  }
  const dropFiles = async ({ x, y, files }) => {
    const data = {
      items: files.map(f => ({ mimeType: 'text/uri-list', data: 'file://' + encodeURI(f) })),
      files,
      dragOperationsMask: 1
    }
    await send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data })
    await send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data })
    await send('Input.dispatchDragEvent', { type: 'drop', x, y, data })
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  return { send, evaluate, getEventListeners, dropFiles, sleep, events, close: () => ws.close() }
}
