#!/usr/bin/env node
/**
 * verify-notice.mjs —— 验证 dsh-session-complete-notify 的落盘证据。
 *
 * 用法：
 *   node scripts/verify-notice.mjs <session.js.jsonl.zstd 路径>
 *   node scripts/verify-notice.mjs                      # 自动选 ~/.dsh/sessions 下最新会话
 *
 * 输出：该日志中所有 plugin-source（kind=plugin）的 user/message 事件，
 *       以及最近一次 turn/end 之后的尾部事件序列。
 *
 * 说明：存储文件是多帧 zstd（每次写批一帧），Node 的 zstdDecompressSync
 *       只解首帧，因此逐帧解压后拼接。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'

function* zstdFrames(buffer) {
  let i = 0
  while (i + 4 <= buffer.length) {
    if (buffer[i] !== 0x28 || buffer[i + 1] !== 0xb5 || buffer[i + 2] !== 0x2f || buffer[i + 3] !== 0xfd) throw new Error(`非 zstd 帧头 @${i}`)
    const start = i
    i += 4
    // 粗扫下一个帧头（真实帧边界）；帧头里的合法 0x28b52ffd 概率可忽略
    while (i + 4 <= buffer.length) {
      if (buffer[i] === 0x28 && buffer[i + 1] === 0xb5 && buffer[i + 2] === 0x2f && buffer[i + 3] === 0xfd) break
      i += 1
    }
    yield buffer.subarray(start, i)
  }
}

function newestSessionLog() {
  const root = join(homedir(), '.dsh', 'sessions')
  const found = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (name.startsWith('session.jsonl.zstd')) found.push({ full, mtime: stat.mtimeMs })
    }
  }
  walk(root)
  found.sort((a, b) => b.mtime - a.mtime)
  return found[0]?.full
}

const path = process.argv[2] ?? newestSessionLog()
if (!path) {
  console.error('未找到会话日志（请传入 session.jsonl.zstd 路径）')
  process.exit(1)
}
console.log(`日志: ${path}`)

let text = ''
let frames = 0
for (const frame of zstdFrames(readFileSync(path))) {
  text += zstdDecompressSync(frame).toString('utf8')
  frames += 1
}
const lines = text.split('\n').filter(Boolean)
console.log(`帧数: ${frames}，行数: ${lines.length}`)

const notices = lines
  .map((l, i) => ({ l, i }))
  .filter(({ l }) => l.includes('"type":"user/message"') && l.includes('"kind":"plugin"'))
console.log(`\n===== plugin-source 系统消息（${notices.length} 条）=====`)
for (const n of notices) {
  try {
    const row = JSON.parse(n.l)
    const msg = row.data?.message ?? row.data
    console.log(`row ${n.i} seq ${row.seq}: summary=${JSON.stringify(msg?.source?.summary)} text=${JSON.stringify((msg?.content ?? [])[0]?.text ?? '')}`)
  } catch (e) {
    console.log(`row ${n.i}（无法解析）: ${n.l.slice(0, 200)}`)
  }
}

console.log('\n===== turn/end 事件（触发点核验）=====')
for (const l of lines) {
  if (!l.includes('"type":"turn/end"')) continue
  try {
    const row = JSON.parse(l)
    console.log(`seq ${row.seq}  time ${row.time}  turn=${row.data?.turn}  reason=${JSON.stringify(row.data?.reason ?? {})}`)
  } catch { /* 忽略无法解析行 */ }
}

console.log('\n===== turn/start 事件（计时核验）=====')
for (const l of lines) {
  if (!l.includes('"type":"turn/start"')) continue
  try {
    const row = JSON.parse(l)
    console.log(`seq ${row.seq}  time ${row.time}  turn=${row.data?.turn}`)
  } catch { /* 忽略无法解析行 */ }
}

console.log('\n===== 事件尾序列（最近 24 行的 type/seq/来源）=====')
for (const l of lines.slice(-24)) {
  try {
    const row = JSON.parse(l)
    const data = row.data ?? {}
    const src = data.message?.source
    const extra = src ? ` [source=${src.kind}${src.kind === 'plugin' ? `:${src.plugin}` : ''}]` : ''
    console.log(`seq ${row.seq}  ${row.type}${extra}`)
  } catch {
    console.log(`??  ${l.slice(0, 120)}`)
  }
}
