// probe-client.mjs — headless Chrome 验证 dsh-session-complete-notify 客户端插件：
// 1) 打开 http://127.0.0.1:3080
// 2) 采集 console / pageerror
// 3) 检查 boot graph 与模块装载
// 用法: node scripts/probe-client.mjs
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const APP_URL = 'http://127.0.0.1:3080'
const profile = mkdtempSync(join(tmpdir(), 'dsh-probe-'))

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
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('timeout waiting for ' + label)
}

const wsUrl = await waitFor(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((t) => t.type === 'page')
  return page?.webSocketDebuggerUrl
}, 20000, 'cdp endpoint')

const ws = new WebSocket(wsUrl)
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
    events.push(`[console.${msg.params.type}] ${args}`)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    events.push(`[pageerror] ${msg.params.exceptionDetails?.text ?? ''} ${msg.params.exceptionDetails?.exception?.description ?? ''}`)
  } else if (msg.method === 'Network.loadingFailed') {
    events.push(`[net-fail] ${msg.params.errorText} ${msg.params.requestId}`)
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
await rpc('Network.enable')
await rpc('Page.enable')

const target = await rpc('Target.createTarget', { url: 'about:blank' })
const targetId = target.result?.targetId
// 直接在当前页面导航更简单：拿新的 page target
const list2 = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const pageTarget = list2.find((t) => t.id === targetId) ?? list2.find((t) => t.type === 'page')
const ws2 = new WebSocket(pageTarget.webSocketDebuggerUrl)
let seq2 = 0
const pending2 = new Map()
const pageEvents = []
ws2.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id !== undefined && pending2.has(msg.id)) {
    pending2.get(msg.id)(msg)
    pending2.delete(msg.id)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
    pageEvents.push(`[console.${msg.params.type}] ${args.slice(0, 300)}`)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    pageEvents.push(`[pageerror] ${d?.exception?.description ?? d?.text ?? ''}`.slice(0, 500))
  }
}
function rpc2(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++seq2
    pending2.set(id, resolve)
    ws2.send(JSON.stringify({ id, method, params }))
  })
}
await new Promise((r) => { ws2.onopen = r })
await rpc2('Runtime.enable')
await rpc2('Page.enable')
await rpc2('Page.navigate', { url: APP_URL })

await waitFor(async () => {
  const r = await rpc2('Runtime.evaluate', { expression: '!!window.__ModuleLoader__ && !!window.__DSH_BOOT__', returnByValue: true })
  return r.result?.result?.value
}, 30000, 'boot')

// 等待客户端插件激活（console 日志由 apply 打印）
await new Promise((r) => setTimeout(r, 6000))

const checks = {}
{
  const r = await rpc2('Runtime.evaluate', {
    expression: `(() => {
      const boot = window.__DSH_BOOT__ || {}
      const entries = (boot.entries || []).map(e => e.id)
      return JSON.stringify({
        graphLength: entries.length,
        hasEntry: entries.includes('@telosmaylx/dsh-session-notify'),
        entry: entries.find(e => e.includes('session-notify')),
        notificationSupported: typeof window.Notification !== 'undefined',
        notificationPermission: typeof window.Notification !== 'undefined' ? window.Notification.permission : 'n/a',
      })
    })()`,
    returnByValue: true,
  })
  checks.graph = JSON.parse(r.result?.result?.value ?? '{}')
}

console.log('=== console/pageerror events ===')
for (const e of pageEvents) console.log(e)
console.log('=== checks ===')
console.log(JSON.stringify(checks, null, 2))

try { ws.close() } catch {}
try { ws2.close() } catch {}
chrome.kill()
await new Promise((r) => setTimeout(r, 300))
try { rmSync(profile, { recursive: true, force: true }) } catch {}
