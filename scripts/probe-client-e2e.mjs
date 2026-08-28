// probe-client-e2e.mjs — 端到端：无头浏览器保持打开，等待真实会话完成事件，
// 验证客户端插件在 running→idle 边沿触发推送（toast DOM / Notification）。
// 可选参数 2：会话 id —— 预置 localStorage 'dsh.sessions.current' 并重载页面，
// 模拟「正在查看该会话」，使事件窗口开启（推送正文可取到宿主通知全文）。
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9344
const APP_URL = 'http://127.0.0.1:3080'
const TIMEOUT_MS = Number(process.argv[2] ?? 900000) // 默认 15 分钟
const PINNED_SESSION = process.argv[3]
const profile = mkdtempSync(join(tmpdir(), 'dsh-e2e-'))

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-gpu',
  '--window-size=1400,900',
  'about:blank',
], { stdio: 'ignore' })

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { const v = await fn(); if (v) return v } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('timeout waiting for ' + label)
}

const wsUrl = await waitFor(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  return list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
}, 20000, 'cdp endpoint')

const target = await waitFor(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((t) => t.type === 'page')
  return page
}, 20000, 'page target')

const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const events = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
    events.push(`[console.${msg.params.type}] ${args.slice(0, 300)}`)
    console.log(`EVENT ${new Date().toISOString()} ${args.slice(0, 300)}`)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    events.push(`[pageerror] ${d?.exception?.description ?? d?.text ?? ''}`.slice(0, 500))
    console.log(`EVENT ${new Date().toISOString()} [pageerror] ${(d?.exception?.description ?? d?.text ?? '').slice(0, 400)}`)
  }
}
function rpc(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
await new Promise((r) => { ws.onopen = r })
await rpc('Runtime.enable')
await rpc('Page.enable')
await rpc('Page.navigate', { url: APP_URL })

await waitFor(async () => {
  const r = await rpc('Runtime.evaluate', { expression: '!!window.__DSH_BOOT__', returnByValue: true })
  return r.result?.result?.value
}, 30000, 'boot')

if (PINNED_SESSION) {
  await rpc('Runtime.evaluate', {
    expression: `localStorage.setItem('dsh.sessions.current', JSON.stringify({ id: ${JSON.stringify(PINNED_SESSION)} }))`,
    returnByValue: true,
  })
  console.log(`${new Date().toISOString()} pinned session ${PINNED_SESSION}, reloading…`)
  await rpc('Page.reload')
  await waitFor(async () => {
    const r = await rpc('Runtime.evaluate', { expression: '!!window.__DSH_BOOT__', returnByValue: true })
    return r.result?.result?.value
  }, 30000, 'boot after reload')
  // 等窗口打开（历史含上一次通知），再 dump 快照：验证「通知节点在不在已开窗口」
  await new Promise((r) => setTimeout(r, 9000))
  const dbg = await rpc('Runtime.evaluate', {
    expression: `window.__dsch_notify_debug ? window.__dsch_notify_debug.snapshotDebug(${JSON.stringify(PINNED_SESSION)}) : 'no debug hook'`,
    returnByValue: true,
  })
  console.log(`${new Date().toISOString()} snapshotDebug: ${dbg.result?.result?.value}`)
}

console.log(`${new Date().toISOString()} booted, waiting for completion push (timeout ${TIMEOUT_MS}ms)…`)

const t0 = Date.now()
let fired = null
while (Date.now() - t0 < TIMEOUT_MS) {
  await new Promise((r) => setTimeout(r, 2000))
  const r = await rpc('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('[data-dsh-notify-root]')
      const toasts = root ? root.children.length : 0
      const text = toasts > 0 ? Array.from(root.children).map((el) => el.textContent || '').join(' | ') : ''
      return JSON.stringify({ toasts, text })
    })()`,
    returnByValue: true,
  })
  const res = JSON.parse(r.result?.result?.value ?? '{}')
  const toasts = res.toasts ?? 0
  if (toasts > 0 || events.some((e) => e.includes('notification'))) {
    fired = { toasts, text: res.text || '', events: events.slice() }
    console.log(`${new Date().toISOString()} PUSH FIRED: ${JSON.stringify(fired)}`)
    break
  }
}

console.log(`${new Date().toISOString()} RESULT: ${fired ? 'PUSH-E2E-OK' : 'NO-PUSH-IN-WINDOW'}`)
try { ws.close() } catch {}
chrome.kill()
await new Promise((r) => setTimeout(r, 300))
try { rmSync(profile, { recursive: true, force: true }) } catch {}
process.exit(0)
