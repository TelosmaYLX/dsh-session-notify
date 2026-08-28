// probe-diag-settings.mjs — 诊断设置面板入口：列出含 data-* 属性的元素与设置相关文本
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9377
const profile = mkdtempSync(join(tmpdir(), 'dsh-diag2-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' })

async function waitFor(fn, t, l) {
  const t0 = Date.now()
  while (Date.now() - t0 < t) { try { const v = await fn(); if (v) return v } catch {} await new Promise((r) => setTimeout(r, 400)) }
  throw new Error('timeout ' + l)
}
const page = await waitFor(async () => {
  const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  return l.find((x) => x.type === 'page')
}, 20000, 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } }
function rpc(method, params = {}) { return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) }) }
await new Promise((r) => { ws.onopen = r })
await rpc('Runtime.enable')
await rpc('Page.enable')
await rpc('Page.navigate', { url: 'http://127.0.0.1:3080' })
await waitFor(async () => { const r = await rpc('Runtime.evaluate', { expression: '!!window.__DSH_BOOT__', returnByValue: true }); return r.result?.result?.value }, 30000, 'boot')
await new Promise((r) => setTimeout(r, 5000))

const diag = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const out = { dataAttrs: [], settingTexts: [] }
    const all = document.querySelectorAll('[data-*]')
    const seen = new Set()
    document.querySelectorAll('[data-dsh-settings-root], [data-settings], [data-settings-page], [data-view]').forEach((e) => out.dataAttrs.push((e.getAttribute('data-dsh-settings-root') || e.getAttribute('data-settings') || e.getAttribute('data-settings-page') || e.getAttribute('data-view') || '') + ' :: ' + (e.textContent || '').slice(0, 40)))
    // 找文本节点包含 设置 的元素
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      const t = (node.textContent || '').trim()
      if (t === '设置') { const p = node.parentElement; const tag = p?.tagName; const attr = p?.outerHTML?.slice(0, 160); out.settingTexts.push(tag + ' :: ' + attr) }
    }
    return JSON.stringify(out)
  })()`,
  returnByValue: true,
})
console.log('DIAG:', diag.result?.result?.value)

// 点击 settings 入口后再 dump body 结构
await rpc('Runtime.evaluate', {
  expression: `(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      if ((node.textContent || '').trim() === '设置') { node.parentElement?.click(); return 'clicked' }
    }
    return 'none'
  })()`,
  returnByValue: true,
})
await new Promise((r) => setTimeout(r, 3000))
const post = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const body = document.body.innerText
    const idx = body.indexOf('设置')
    return JSON.stringify({ len: body.length, ctx: body.slice(idx, idx + 500) })
  })()`,
  returnByValue: true,
})
console.log('POST:', post.result?.result?.value)

try { ws.close() } catch {}
chrome.kill()
await new Promise((r) => setTimeout(r, 300))
try { rmSync(profile, { recursive: true, force: true }) } catch {}
process.exit(0)
