// probe-settings-check.mjs — 无头验证设置面板中卡片渲染与报错
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9489
const profile = mkdtempSync(join(tmpdir(), 'dsh-card4-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' })

async function waitFor(fn, t, l) {
  const t0 = Date.now()
  while (Date.now() - t0 < t) { try { const v = await fn(); if (v) return v } catch {} await new Promise((r) => setTimeout(r, 500)) }
  throw new Error('timeout ' + l)
}
const page = await waitFor(async () => {
  const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  return l.find((x) => x.type === 'page')
}, 20000, 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const errs = []
const logs = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    errs.push((d?.exception?.description ?? d?.text ?? '').slice(0, 600))
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const a = (msg.params.args || []).map((x) => x.value ?? x.description ?? '').join(' ')
    logs.push(a.slice(0, 300))
  }
}
function rpc(method, params = {}) { return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) }) }
await new Promise((r) => { ws.onopen = r })
await rpc('Runtime.enable')
await rpc('Page.enable')
await rpc('Page.navigate', { url: 'http://127.0.0.1:3080' })
await waitFor(async () => { const r = await rpc('Runtime.evaluate', { expression: '!!window.__DSH_BOOT__', returnByValue: true }); return r.result?.result?.value }, 30000, 'boot')
await new Promise((r) => setTimeout(r, 6000))

// 点击侧边栏「设置」（找 text=设置 的最小元素的按钮祖先）
const c1 = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const textNodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let t
    const targets = []
    while ((t = textNodes.nextNode())) {
      if ((t.textContent || '').trim() !== '设置') continue
      let el = t.parentElement
      while (el && el !== document.body) {
        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') { targets.push(el); break }
        el = el.parentElement
      }
      if (!targets.length && t.parentElement) targets.push(t.parentElement)
    }
    const el = targets[0]
    if (!el) return 'none'
    el.click()
    return 'clicked ' + el.tagName + ' :: ' + (el.textContent || '').slice(0, 24)
  })()`,
  returnByValue: true,
})
console.log('SETTINGS-CLICK:', c1.result?.result?.value)
await new Promise((r) => setTimeout(r, 3500))

const dump1 = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const b = document.body.innerText || ''
    const idx = b.indexOf('会话完成提醒')
    const pluginIdx = b.indexOf('插件配置')
    return JSON.stringify({ hasCardText: idx >= 0, hasPluginsTab: pluginIdx >= 0, cardCtx: idx >= 0 ? b.slice(idx - 80, idx + 120) : '', sample: b.slice(pluginIdx, pluginIdx + 160) })
  })()`,
  returnByValue: true,
})
console.log('PANEL:', dump1.result?.result?.value)
console.log('ERRORS:', JSON.stringify(errs.slice(0, 4)))
console.log('LOGS:', JSON.stringify(logs.slice(0, 8)))

try { ws.close() } catch {}
chrome.kill()
await new Promise((r) => setTimeout(r, 300))
try { rmSync(profile, { recursive: true, force: true }) } catch {}
process.exit(0)
