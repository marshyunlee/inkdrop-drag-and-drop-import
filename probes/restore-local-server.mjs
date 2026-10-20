// Re-enables Inkdrop's local HTTP server with the credentials Claude Code's MCP config already holds.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { connectToInkdrop } from './cdp.mjs'

const claudeConfig = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'))
const env = claudeConfig.mcpServers?.inkdrop?.env ?? {}
const username = env.INKDROP_LOCAL_USERNAME
const password = env.INKDROP_LOCAL_PASSWORD
const port = Number(new URL(env.INKDROP_LOCAL_SERVER_URL ?? 'http://127.0.0.1:19840').port || 19840)
if (!username || !password) throw new Error('No Inkdrop MCP credentials in ~/.claude.json')

const cdp = await connectToInkdrop()
const before = await cdp.evaluate(`JSON.stringify(inkdrop.config.get('core.server') ?? null)`)
await cdp.evaluate(`inkdrop.config.set('core.server', ${JSON.stringify({ enabled: true, port, bindAddress: '127.0.0.1', auth: { username, password } })})`)
let status = null
for (let i = 0; i < 60; i++) {
  await cdp.sleep(500)
  try { status = (await fetch(`http://127.0.0.1:${port}/`)).status } catch { status = null }
  if (status === 401) break
}
const authed = await fetch(`http://127.0.0.1:${port}/`, { headers: { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') } }).then(r => r.status).catch(() => null)
const after = await cdp.evaluate(`(() => { const s = inkdrop.config.get('core.server') ?? {}; return { enabled: s.enabled, port: s.port, authType: typeof s.auth } })()`)
console.log(JSON.stringify({ before: before === 'null' ? null : 'had value', unauthenticatedStatus: status, authenticatedStatus: authed, after }))
cdp.close()
if (status !== 401 || authed !== 200) process.exit(1)
