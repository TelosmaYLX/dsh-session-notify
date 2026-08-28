// probe-card-render.mjs — 无头完整验证：设置 → 插件 → 卡片渲染 + 控制台错误
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9588
const profile = mkdtempSync(join(tmpdir(), 'dsh-card5-'))
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
    errs.push((d?.exception?.description ?? d?.text ?? '').slice(0, 700))
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

async function clickExactText(text) {
  const r = await rpc('Runtime.evaluate', {
    expression: `(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node
      const targets = []
      while ((node = walker.nextNode())) {
        if ((node.textContent || '').trim() !== ${JSON.stringify(text)}) continue
        let el = node.parentElement
        while (el && el !== document.body) {
          if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'LI' || el.getAttribute('role') === 'tab') { targets.push(el); break }
          el = el.parentElement
        }
        if (!targets.length && node.parentElement) targets.push(node.parentElement)
      }
      const el = targets[0]
      if (!el) return 'none:' + ${JSON.stringify(text)}
      el.click()
      return 'clicked:' + el.tagName + '::' + (el.textContent || '').trim().slice(0, 16)
    })()`,
    returnByValue: true,
  })
  console.log('CLICK', JSON.stringify(text), '=>', r.result?.result?.value)
}

await clickExactText('设置')
await new Promise((r) => setTimeout(r, 3000))
// 插件页签（左侧导航）：点文本为「插件」的最小元素
await clickExactText('插件')
await new Promise((r) => setTimeout(r, 3500))

const check = await rpc('Runtime.evaluate', {
  expression: `(() => {
    const b = document.body.innerText || ''
    const lines = b.split('\\n').map((s) => s.trim()).filter(Boolean)
    return JSON.stringify({
      // 精确行匹配（避免侧边栏会话名误判）
      cardTitleLine: lines.includes('会话完成提醒'),
      hasSubtitle: b.includes('（保存后刷新生效）') || b.includes('保存后刷新'),
      hasPresetRow: lines.includes('预设') && b.includes('未命名预设'),
      hasLangRow: lines.includes('语言') && b.includes('简体中文'),
      hasFooter: b.includes('保存') && b.includes('放弃'),
      modalTextSample: b.slice(b.indexOf('插件列表') - 100, b.indexOf('插件列表') + 200),
    })
  })()`,
  returnByValue: true,
})
console.log('CHECK:', check.result?.result?.value)
console.log('ERRORS:', JSON.stringify(errs.slice(0, 5)))
console.log('LOGS:', JSON.stringify(logs.slice(0, 8)))

try { ws.close() } catch {}
chrome.kill()
await new Promise((r) => setTimeout(r, 300))
try { rmSync(profile, { recursive: true, force: true }) } catch {}
process.exit(0)
