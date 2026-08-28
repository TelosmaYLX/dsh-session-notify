// probe-settings-card.mjs — 无头验证官方「设置 → 插件」面板里渲染出我们的设置卡片
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9355
const APP_URL = 'http://127.0.0.1:3080'
const profile = mkdtempSync(join(tmpdir(), 'dsh-card-'))

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' })

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { const v = await fn(); if (v) return v } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('timeout waiting for ' + label)
}

const page = await waitFor(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  return list.find((t) => t.type === 'page')
}, 20000, 'page')

const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const events = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
    console.log('CONSOLE:', args.slice(0, 200))
    events.push(args.slice(0, 200))
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    console.log('PAGEERROR:', (d?.exception?.description ?? d?.text ?? '').slice(0, 400))
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
await new Promise((r) => setTimeout(r, 5000)) // 等 UI 就绪

const clickByText = async (text, selector) => {
  const r = await rpc('Runtime.evaluate', {
    expression: `(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(selector ?? 'button, [role="button"], [data-menu-item], a, div')}))
      const el = els.find((e) => (e.textContent || '').trim().includes(${JSON.stringify(text)}) && (e.textContent || '').trim().length < 30)
      if (!el) return 'NOT_FOUND:' + text
      el.click()
      return 'CLICKED:' + (el.textContent || '').trim().slice(0, 20)
    })()`,
    returnByValue: true,
  })
  console.log(r.result?.result?.value)
}

// 1) 打开设置：找"设置"入口
const clickResult1 = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const els = Array.from(document.querySelectorAll('*')).filter((e) => {
      const t = (e.textContent || '').trim(); const aria = e.getAttribute('aria-label') || ''; const title = e.getAttribute('title') || ''
      return (t === '设置' || aria.includes('设置') || title.includes('设置')) && t.length < 12
    })
    const el = els[0]
    if (!el) return 'none-found'
    el.click()
    return 'clicked: ' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)
  })()`,
  returnByValue: true,
})
console.log('OPEN-SETTINGS:', clickResult1.result?.result?.value)
await new Promise((r) => setTimeout(r, 2500))
// 2) 打印面板内标签文本，找"插件"tab
const tabsDump = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const found = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      const t = (node.textContent || '').trim()
      if (t && t.length < 24 && (t.includes('插件') || t.includes('Plugins') || t.includes('通用') || t.includes('模型') || t.includes('General') || t.includes('Models'))) found.push(t)
    }
    return JSON.stringify([...new Set(found)].slice(0, 40))
  })()`,
  returnByValue: true,
})
console.log('PLUGIN-TEXTS:', tabsDump.result?.result?.value)
// 3) 点含"插件"的最短文本节点（任意可点元素）
const clickTab = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const els = Array.from(document.querySelectorAll('button, [role=tab], [role=button], [data-state], li, div, a'))
      .filter((e) => (e.textContent || '').trim().length > 0 && (e.textContent || '').trim().length < 24 && (e.textContent || '').includes('插件'))
      .sort((a, b) => (a.textContent || '').trim().length - (b.textContent || '').trim().length)
    const el = els[0]
    if (!el) return 'none-found'
    el.click()
    return 'clicked: ' + (el.textContent || '').trim()
  })()`,
  returnByValue: true,
})
console.log('CLICK-TAB:', clickTab.result?.result?.value)
await new Promise((r) => setTimeout(r, 3000))
// 3) 检查卡片文本
const found = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const text = document.body.innerText || ''
    const has = text.includes('会话完成提醒')
    const hasNg = text.includes('会话完成提醒') && (text.includes('占位符') || text.includes('跳过子代理'))
    return JSON.stringify({ hasCard: has, hasCardForm: hasNg, cardCtx: text.slice(text.indexOf('会话完成提醒') - 60, text.indexOf('会话完成提醒') + 260) })
  })()`,
  returnByValue: true,
})
console.log('CARD-CHECK:', found.result?.result?.value)

try { ws.close() } catch {}
chrome.kill()
await new Promise((r) => setTimeout(r, 300))
try { rmSync(profile, { recursive: true, force: true }) } catch {}
process.exit(0)
