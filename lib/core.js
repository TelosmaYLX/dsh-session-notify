/**
 * dsh-session-complete-notify —— 纯逻辑层（零外部依赖，可独立测试）。
 *
 * 职责：
 *  - 轮次计时/用量跟踪（turn/start 起表，assistant/message 累计 token）
 *  - 会话完成系统消息的文案构建（summary 一行 + content 全文）
 */

/** 语言代码（设置面板可选值）。 */
export const LANGUAGES = ['zh', 'zh-tw', 'en', 'ja', 'ko']

/**
 * 各语言文案表：reason 标签 + 通用标签 + 分隔符/用时/消耗措辞。
 * 键为 LANGUAGES 中的代码；缺省回落 zh。
 */
const LABELS = {
  zh: { completed: '会话已完成', aborted: '会话已中止', blocked: '会话被阻塞', error: '会话出错', 'max-tokens': '会话达到输出上限', interrupted: '会话已中断', generic: '会话已结束', sep: '：', dur: '用时', use: '消耗' },
  'zh-tw': { completed: '會話已完成', aborted: '會話已中止', blocked: '會話被阻塞', error: '會話出錯', 'max-tokens': '會話達到輸出上限', interrupted: '會話已中斷', generic: '會話已結束', sep: '：', dur: '用時', use: '消耗' },
  en: { completed: 'Session completed', aborted: 'Session aborted', blocked: 'Session blocked', error: 'Session failed', 'max-tokens': 'Session hit the output-token cap', interrupted: 'Session interrupted', generic: 'Session ended', sep: ': ', dur: 'took', use: 'used' },
  ja: { completed: 'セッション完了', aborted: 'セッション中止', blocked: 'セッションがブロックされました', error: 'セッションエラー', 'max-tokens': '出力トークン上限に到達', interrupted: 'セッションが中断されました', generic: 'セッション終了', sep: '：', dur: '所要', use: '消費' },
  ko: { completed: '세션 완료', aborted: '세션 중단됨', blocked: '세션 차단됨', error: '세션 오류', 'max-tokens': '출력 토큰 한도 도달', interrupted: '세션 중단됨', generic: '세션 종료', sep: ': ', dur: '소요', use: '소모' },
}

function tableFor(language) {
  return LABELS[language] || LABELS.zh
}

/**
 * 按语言取 reason 标签。
 * @param {string} kind
 * @param {string} language - LANGUAGES 之一
 * @returns {string}
 */
export function labelFor(kind, language = 'zh') {
  return tableFor(language)[kind] ?? tableFor(language).generic
}

/**
 * 判断一个会话是否为子代理会话（子代理由父会话编排，通常不需要逐轮提醒）。
 * @param {{ header?: { origin?: string; delegationDepth?: number } }} session
 * @returns {boolean}
 */
export function isSubagentSession(session) {
  const header = session?.header ?? {}
  return header.origin === 'subagent' || (header.delegationDepth ?? 0) > 0
}

/**
 * 每个（会话, 轮次）的进行时状态：开始时间 + 累计 token 用量。
 * key 约定：`${sessionId}:${turn}`。
 */
export function createTurnTracker() {
  const turns = new Map()
  return {
    /** turn/start：起表。 */
    start(key, time) {
      turns.set(key, { startedAt: time, usage: null })
    },
    /** assistant/message：一步的 usage 并入轮次累计。 */
    addUsage(key, usage) {
      const state = turns.get(key)
      if (!state || !usage) return
      state.usage = state.usage ? addTokenUsage(state.usage, usage) : { ...usage }
    },
    /** turn/end：读取并清除。缺起表（如恢复日志边界）时以 end 时间作答。 */
    end(key, time) {
      const state = turns.get(key)
      turns.delete(key)
      return {
        startedAt: state?.startedAt ?? time,
        endedAt: time,
        usage: state?.usage ?? null,
      }
    },
  }
}

/** 合并两次 token 用量（字段按需相加，缺失字段保持缺席）。 */
function addTokenUsage(a, b) {
  const sum = (x, y) => (Number.isFinite(x) ? x : 0) + (Number.isFinite(y) ? y : 0)
  const merged = {
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens: sum(a.outputTokens, b.outputTokens),
  }
  if (a.cacheReadTokens != null || b.cacheReadTokens != null) merged.cacheReadTokens = sum(a.cacheReadTokens, b.cacheReadTokens)
  if (a.cacheWriteTokens != null || b.cacheWriteTokens != null) merged.cacheWriteTokens = sum(a.cacheWriteTokens, b.cacheWriteTokens)
  if (a.reasoningTokens != null || b.reasoningTokens != null) merged.reasoningTokens = sum(a.reasoningTokens, b.reasoningTokens)
  return merged
}

/**
 * 人类可读时长：zh/zh-tw `12 秒` `3 分 25 秒`；en `12s` `3m25s`；
 * ja `12 秒` `3 分 25 秒` `1 時間 4 分`；ko `12초` `3분 25초` `1시간 4분`。
 * @param {number} ms
 * @param {string} [language]
 * @returns {string}
 */
export function formatDuration(ms, language = 'zh') {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const lang = LABELS[language] ? language : 'zh'
  if (lang === 'en') {
    if (totalSeconds < 60) return `${totalSeconds}s`
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes < 60) return seconds ? `${minutes}m${seconds}s` : `${minutes}m`
    return `${Math.floor(minutes / 60)}h${minutes % 60}m`
  }
  if (lang === 'ja') {
    if (totalSeconds < 60) return `${totalSeconds} 秒`
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`
    return `${Math.floor(minutes / 60)} 時間 ${minutes % 60} 分`
  }
  if (lang === 'ko') {
    if (totalSeconds < 60) return `${totalSeconds}초`
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes < 60) return seconds ? `${minutes}분 ${seconds}초` : `${minutes}분`
    return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
  }
  // zh / zh-tw
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

/**
 * 用量一行：zh/zh-tw `1,240 輸入 / 3,560 輸出`；en `1,240 in / 3,560 out`；
 * ja `1,240 入力 / 3,560 出力`；ko `1,240 입력 / 3,560 출력`（不带 tokens 单位后缀）。
 * 输入 = 未缓存 + 缓存读 + 缓存写。
 * @param {{ inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }} usage
 * @param {string} [language]
 * @returns {string | null}
 */
export function summarizeUsage(usage, language = 'zh') {
  if (!usage) return null
  const input = (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
  const output = usage.outputTokens ?? 0
  const fmt = (n) => n.toLocaleString('en-US')
  const lang = LABELS[language] ? language : 'zh'
  const iw = { zh: '输入', 'zh-tw': '輸入', en: 'in', ja: '入力', ko: '입력' }[lang]
  const ow = { zh: '输出', 'zh-tw': '輸出', en: 'out', ja: '出力', ko: '출력' }[lang]
  return `${fmt(input)} ${iw} / ${fmt(output)} ${ow}`
}

/**
 * 缓存命中率：缓存读 token /（未缓存输入 + 缓存读 + 缓存写）——无缓存数据返回空串。
 * @param {{ inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }} usage
 * @returns {string}
 */
export function summarizeCache(usage) {
  if (!usage) return ''
  const read = usage.cacheReadTokens ?? 0
  const write = usage.cacheWriteTokens ?? 0
  const plain = usage.inputTokens ?? 0
  const total = plain + read + write
  if (!(total > 0)) return ''
  const pct = Math.round((read / total) * 1000) / 10
  return `${pct}%`
}

/**
 * 缓存命中率（官方 tokenUsage 投影口径，四桶不重叠）：
 * 缓存读 /（未缓存输入 + 缓存读 + 缓存写）——与 dsh-web-ui 同源。
 * @param {{ uncachedInputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }} usage
 * @returns {string}
 */
export function officialCacheRate(usage) {
  if (!usage) return ''
  const read = usage.cacheReadTokens ?? 0
  const total = (usage.uncachedInputTokens ?? 0) + read + (usage.cacheWriteTokens ?? 0)
  if (!(total > 0)) return ''
  return `${Math.round((read / total) * 1000) / 10}%`
}

/**
 * 生成速度（官方 sessionStats 投影口径）：输出 token ÷ 解码耗时（tok/s）——
 * 与 dsh-web-ui 状态栏同口径（不含排队/准备/工具时间）。
 * @param {{ decodeTokens?: number; decodeMs?: number }} stats
 * @returns {string}
 */
export function officialTps(stats) {
  if (!stats || !(stats.decodeMs > 0)) return ''
  return `${Math.round((stats.decodeTokens ?? 0) / (stats.decodeMs / 1000))} tok/s`
}

/**
 * 生成速度：输出 token / 用时秒（tok/s）——无数据返回空串。
 * @param {{ outputTokens?: number }} usage
 * @param {number} ms
 * @returns {string}
 */
export function tpsOf(usage, ms) {
  if (!usage || !(ms > 0)) return ''
  const output = usage.outputTokens ?? 0
  return `${Math.round(output / (ms / 1000))} tok/s`
}

/**
 * 构建系统消息：可折叠行的 summary（≤120 字符）+ 展开/模型可见的全文。
 *
 * @param {string} kind - turn/end 的 reason.kind。
 * @param {{ error?: { message?: string } } | undefined} reasonData
 * @param {{ startedAt: number; endedAt: number; usage?: object | null; includeDuration?: boolean; includeUsage?: boolean }} info
 * @param {{ language?: 'zh' | 'en'; templates?: Record<string, string> }} [custom] -
 *   language 切换文案语言；templates[reason] 非空时作为正文模板，
 *   支持占位符：{label} {duration} {usage} {error} {cache} {tps}。
 * @returns {{ summary: string; text: string }}
 */
export function buildNotice(kind, reasonData, { startedAt, endedAt, usage = null, includeDuration = true, includeUsage = true, cacheValue, tpsValue }, custom = {}) {
  const language = LABELS[custom.language] ? custom.language : 'zh'
  const L = tableFor(language)
  const templates = custom.templates ?? {}
  const label = labelFor(kind, language)
  const detail = detailFor(reasonData, language)
  let summary = `${label}${detail}`
  const durationLine = includeDuration ? formatDuration(endedAt - startedAt, language) : null
  const usageLine = includeUsage ? summarizeUsage(usage, language) : null
  // 缓存命中/速度：优先官方投影口径（调用方传入），无则退回用量聚合估算
  const cacheLine = typeof cacheValue === 'string' ? cacheValue : (includeUsage ? summarizeCache(usage) : '')
  const tpsLine = typeof tpsValue === 'string' ? tpsValue : (includeUsage ? tpsOf(usage, endedAt - startedAt) : '')
  const parts = []
  if (durationLine) parts.push(`${L.dur} ${durationLine}`)
  if (usageLine) parts.push(`${L.use} ${usageLine}`)
  const suffix = parts.length ? `（${parts.join('，')}）` : ''
  const template = templates[kind]
  let text
  if (typeof template === 'string' && template.trim() !== '') {
    // 自定义模板：占位符替换，保持 summary 与正文一致的语义
    text = renderTemplate(template, {
      label,
      duration: durationLine ?? '',
      usage: usageLine ?? '',
      error: plainError(reasonData) || 'none', // 无报错时显示 none，而非空串
      cache: cacheLine,
      tps: tpsLine,
    })
  } else if (language === 'en') {
    text = `${summary}${suffix ? ` (${parts.join(', ')}).` : '.'}`
  } else if (language === 'ja') {
    text = `${summary}${suffix ? `（${parts.join('、')}）。` : '。'}`
  } else if (language === 'ko') {
    text = `${summary}${suffix ? `（${parts.join(', ')}）。` : '。'}`
  } else {
    text = `${summary}${suffix}。`
  }
  return {
    summary: bound(summary, 120),
    text,
  }
}

/**
 * 模板占位符替换：{label} 已全面移除（模板中直接剥除）；支持 {duration} {usage} {error} {cache} {tps}。
 * @param {string} template
 * @param {{ label: string; duration: string; usage: string; error: string; cache: string; tps: string }} vars
 * @returns {string}
 */
export function renderTemplate(template, vars) {
  return String(template)
    .replace(/\{label\}/g, '')
    .replaceAll('{duration}', vars.duration)
    .replaceAll('{usage}', vars.usage)
    .replaceAll('{error}', vars.error)
    .replaceAll('{cache}', vars.cache)
    .replaceAll('{tps}', vars.tps)
}

/** error reason 的纯文本详情（单行、截断；无则空串）。 */
function plainError(reasonData) {
  const message = reasonData?.error?.message
  if (!message) return ''
  const flat = String(message).replace(/[\r\n]+/g, ' ').trim()
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat
}

/** error reason 的错误详情（单行、截断，分隔符随语言）。 */
function detailFor(reasonData, language = 'zh') {
  const message = reasonData?.error?.message
  if (!message) return ''
  const flat = String(message).replace(/[\r\n]+/g, ' ').trim()
  if (!flat) return ''
  const sep = tableFor(language).sep
  return `${sep}${flat.length > 40 ? `${flat.slice(0, 40)}…` : flat}`
}

/** 按字符数截断（≤ max）。 */
function bound(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export const __internals = { LABELS, addTokenUsage, detailFor, bound }
