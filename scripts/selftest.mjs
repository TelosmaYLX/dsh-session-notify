/**
 * 自检（`node scripts/selftest.mjs`，零依赖）——发布前跑一遍，覆盖本次「自定义提示音」功能
 * 以及它所依赖的既有链路。任何一项失败即以非 0 退出。
 *
 * 分组：
 *  1. core.js —— {audio} 开关标签在正文 / 推送标题 / 提问正文渲染时被剥除（不泄漏到日志）；
 *  2. index.js —— 设置 schema、DEFAULT_SETTINGS、sanitizeSettings（audios / volume 容错；时长限制已移除）；
 *  3. index.js —— mediaTagsOf（宿主下发「该原因模板插了哪些媒体标签」）；
 *  4. client.js —— 纯逻辑（parseTemplate / 唯一 {audio} 约束 / audioOf / audioMapOf / volumeOf / 只写变化字段的比对助手）；
 *  5. client.js —— 接线检查（源码级：保存、静默、唯一性、旧宿主兜底、试听可停止、无时长上限）；
 *  6. 渲染冒烟 —— 用最小 React 替身跑设置卡片：「音频」折叠区（音量 + 试听）、音频插入按钮、唯一性置灰；
 *  6b. 音量设置生效 —— 拖动音量后点「试听」，实际播放音量必须跟着变（Web Audio 与 Audio 元素两条通道）；
 *  6c. 保存只写变化字段（优化 A）—— 只改音量就只写 volume，没改动一个字段都不写，旧 maxDuration 残留键被清理；
 *  7. 播放链路 —— 用替身 AudioContext 跑完成推送：标签门控、音量、静默、解码缓存；
 *  7b. 试听 ▶/⏸ 开关（再点即停）、不排任何「到点淡出」；
 *  8. README × 5 —— {audio} 行、变更日志行、表格列数。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const coreSrc = readFileSync(join(root, 'lib', 'core.js'), 'utf8')
const hostSrc = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
const clientSrc = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

let pass = 0
let fail = 0
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}${extra ? ` → ${extra}` : ''}`) }
}
function group(title) { console.log(`\n[${title}]`) }

// 宿主 SettingsForms.volatileForm 的判定：递归收集 meta.volatile 的叶子；一个都没有
// → 返回 undefined → 宿主 describe() 跳过该条目 → 官方设置页不出现、客户端表单恒
// unavailable。这里复刻一份，用于对本插件的 Config 做契约断言（与宿主同一判据）。
function volatileLeaves(node, path = [], out = []) {
  // schemastery 的 Schema 实例是**可调用对象**（typeof === 'function'），两种都要放行。
  if (node === null || (typeof node !== 'object' && typeof node !== 'function')) return out
  if (node.meta?.volatile) { out.push({ path: path.join('.'), node }); return out }
  if (node.type === 'object') for (const [k, child] of Object.entries(node.dict || {})) volatileLeaves(child, [...path, k], out)
  return out
}
// lib/index.js 在模块顶层构造 Config（要经 HUB_REQUIRE 解析宿主 schemastery），
// 取不到时置 null，相关断言按不通过处理而不是让自测整体崩掉。
let hostModule = null
try { hostModule = await import(pathToFileURL(join(root, 'lib', 'index.js')).href) } catch { hostModule = null }

// ---------------------------------------------------------------- 1. core.js
group('1 core.js：{audio} 剥除')
const core = await import(pathToFileURL(join(root, 'lib', 'core.js')).href)
const info = { startedAt: 0, endedAt: 12000, usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5 }, titleValue: 'Demo' }

const n1 = core.buildNotice('completed', undefined, info, { language: 'zh', templates: { completed: '{audio}会话「{title}」已完成（{duration}）' } })
check('正文自定义模板剥除 {audio}', !n1.text.includes('{audio}') && n1.text.includes('已完成'), n1.text)
check('正文 summary 同源剥除', !n1.summary.includes('{audio}'), n1.summary)
check('推送标题剥除 {audio}', core.renderTitle('completed', { language: 'zh', titleTemplate: '{audio}任务完成', titleTemplates: {} }, 'Demo') === '任务完成')
check('按原因标题剥除 {audio}', core.renderTitle('error', { language: 'zh', titleTemplate: '', titleTemplates: { error: '{title}{audio} 出错了' } }, 'Demo') === 'Demo 出错了')
check('提问正文剥除 {audio}', !core.buildQuestionBody('要继续吗？{audio}', { language: 'zh', templates: { question: '{audio}AI 向你提问：{question}' } }).includes('{audio}'))
check('默认文案（无模板）不受影响', core.buildNotice('completed', undefined, info, { language: 'zh', templates: {} }).text.includes('已完成'))

// ------------------------------------------------------- 2. index.js 设置层
group('2 index.js：设置 schema / sanitize')
check('DEFAULT_SETTINGS 含 audios（6 键全空）', /audios: \{ completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '', question: '' \}/.test(hostSrc))
check('DEFAULT_SETTINGS 含 volume 0.6', /volume: 0\.6,/.test(hostSrc))
check('DEFAULT_SETTINGS 含 maxDuration 0（不限制，可自行设置）', /maxDuration: 0,/.test(hostSrc))
check('schema 声明 audios 对象', /audios: perReason\(/.test(hostSrc))
check('schema 的每个叶子都标 volatile（官方设置页只投影 volatile 字段）', (() => {
  const host = hostModule
  if (host === null) return false
  const leaves = volatileLeaves(host.Config)
  return leaves.length > 0 && leaves.every((l) => l.node.meta.volatile === true)
})())
check('宿主 volatileForm 判定不会跳过本条目', (() => {
  const host = hostModule
  return host !== null && volatileLeaves(host.Config).length > 0
})())
check('schema 投影出 22 个顶层字段', (() => {
  const host = hostModule
  return host !== null && Object.keys(host.Config.dict).length === 22
})())
check('schema 投影含 audios 六键', (() => {
  const host = hostModule
  if (host === null) return false
  const keys = Object.keys(host.Config.dict.audios.dict)
  return ['completed', 'error', 'aborted', 'blocked', 'max-tokens', 'question'].every((k) => keys.includes(k))
})())
check('volume 是数字、默认 0.6、范围 [0,1] 生效', (() => {
  const host = hostModule
  if (host === null) return false
  const v = host.Config.dict.volume
  if (v.type !== 'number' || v.meta.default !== 0.6) return false
  const bad = host.Config['~standard'].validate({ volume: 5 })
  const good = host.Config['~standard'].validate({ volume: 0.3 })
  return Boolean(bad.issues) && !good.issues
})())
check('maxDuration 是数字、默认 0（不限制）、负数被拒', (() => {
  const host = hostModule
  if (host === null) return false
  const v = host.Config.dict.maxDuration
  if (v.type !== 'number' || v.meta.default !== 0) return false
  const bad = host.Config['~standard'].validate({ maxDuration: -1 })
  const good = host.Config['~standard'].validate({ maxDuration: 30 })
  return Boolean(bad.issues) && !good.issues
})())
check('language 仍是受限 union（非法值被拒）', (() => {
  const host = hostModule
  if (host === null) return false
  return Boolean(host.Config['~standard'].validate({ language: 'nope' }).issues) &&
    !host.Config['~standard'].validate({ language: 'zh-tw' }).issues
})())
// 旧宿主兼容：volatile() 是 schemastery >= 3.18.3 才有的 API（3.18.1 / 3.18.2 里没有），
// 而 buildSettingsSchema() 在模块顶层被调用 → 直接 .volatile() 会让旧宿主上**整个插件
// 加载失败**（TypeError）。用「没有 volatile 的 schemastery 替身」验证仍能构造 schema。
check('无 volatile() 的旧 schemastery 也能构造 schema（模块顶层不会抛）', (() => {
  const host = hostModule
  if (host === null || typeof host.buildSettingsSchema !== 'function') return false
  const node = () => ({
    type: 'string',
    meta: {},
    dict: {},
    default(v) { this.meta.default = v; return this },
    min() { return this },
    max() { return this },
  })
  const fake = {
    string: node,
    number: node,
    boolean: node,
    union() { return node() },
    object(dict) { const n = node(); n.type = 'object'; n.dict = dict; return n },
  }
  try {
    const schema = host.buildSettingsSchema(fake)
    return Object.keys(schema.dict).length === 22
  } catch {
    return false
  }
})())
check('旧 schemastery（无 volatile）下不调用 volatile()，字段结构仍完整', (() => {
  const host = hostModule
  if (host === null || typeof host.buildSettingsSchema !== 'function') return false
  const node = () => ({
    type: 'string',
    meta: {},
    dict: {},
    default(v) { this.meta.default = v; return this },
    min() { return this },
    max() { return this },
  })
  const fake = {
    string: node,
    number: node,
    boolean: node,
    union() { return node() },
    object(dict) { const n = node(); n.type = 'object'; n.dict = dict; return n },
  }
  try {
    const schema = host.buildSettingsSchema(fake)
    // 替身上没有 volatile 方法，构造过程就不该调它；有调用即说明探测失效。
    return typeof schema.dict.templates.dict.completed.volatile === 'undefined'
  } catch {
    return false
  }
})())
check('sanitize 规整 audios', /const audios = \{ \.\.\.DEFAULT_SETTINGS\.audios \}/.test(hostSrc))
check('sanitize 规整 globalAudio（非字符串回落空串）', /globalAudio: typeof src\.globalAudio === 'string' \? src\.globalAudio : ''/.test(hostSrc))
check('sanitize 规整 volume 越界回落', /volume >= 0 && src\.volume <= 1\) \? src\.volume : DEFAULT_SETTINGS\.volume/.test(hostSrc))
check('sanitize 规整 maxDuration 负数/非数回落', /src\.maxDuration >= 0\) \? src\.maxDuration : DEFAULT_SETTINGS\.maxDuration/.test(hostSrc))

// 切片里可能夹带 `export function buildSettingsSchema`（模块顶层构造 Config 的那个），
// new Function 解析不了 export 关键字，先剥掉；它只被定义不被调用，不影响取值。
const settingsSrc = hostSrc.slice(hostSrc.indexOf('const DEFAULT_SETTINGS ='), hostSrc.indexOf('export const inject =')).replace(/^export /gm, '')
const sanitizeSettings = new Function(`${settingsSrc}; return sanitizeSettings`)()
const s0 = sanitizeSettings({})
check('空输入 → audios 全空（默认不设提示音）', Object.keys(s0.audios).length === 6 && Object.values(s0.audios).every((v) => v === ''))
check('空输入 → volume 默认 0.6', s0.volume === 0.6, String(s0.volume))
check('空输入 → globalAudio 为空串（不启用全局兜底）', s0.globalAudio === '', JSON.stringify(s0.globalAudio))
const sGA = sanitizeSettings({ globalAudio: 'data:audio/mpeg;base64,BBB' })
check('globalAudio 保留合法 data URI', sGA.globalAudio === 'data:audio/mpeg;base64,BBB')
check('globalAudio 非字符串回落空串', sanitizeSettings({ globalAudio: 123 }).globalAudio === '' && sanitizeSettings({ globalAudio: { a: 1 } }).globalAudio === '')
const s1 = sanitizeSettings({ audios: { completed: 'data:audio/mpeg;base64,AAA', bogus: 'x' }, volume: 0.25 })
check('audios 保留合法键、丢弃多余键', s1.audios.completed === 'data:audio/mpeg;base64,AAA' && !('bogus' in s1.audios) && s1.audios.error === '')
check('volume 0.25 保留', s1.volume === 0.25)
check('volume 越界(1.5) 回落默认', sanitizeSettings({ volume: 1.5 }).volume === 0.6)
check('volume 0（静音）保留', sanitizeSettings({ volume: 0 }).volume === 0)
check('volume 字符串污染回落默认', sanitizeSettings({ volume: '0.3' }).volume === 0.6)
check('空输入 → maxDuration 默认 0（不限制）', s0.maxDuration === 0, String(s0.maxDuration))
check('maxDuration 2.5 秒保留', sanitizeSettings({ maxDuration: 2.5 }).maxDuration === 2.5)
check('maxDuration 15 秒保留', sanitizeSettings({ maxDuration: 15 }).maxDuration === 15)
check('maxDuration 负数回落默认 0', sanitizeSettings({ maxDuration: -3 }).maxDuration === 0)
check('maxDuration 字符串/NaN 污染回落默认 0', sanitizeSettings({ maxDuration: '5' }).maxDuration === 0 && sanitizeSettings({ maxDuration: NaN }).maxDuration === 0)

// ------------------------------------------------- 3. index.js mediaTagsOf
group('3 index.js：mediaTagsOf（媒体标签下发）')
const mtStart = hostSrc.indexOf('function mediaTagsOf(kind, templates)')
const mtEnd = hostSrc.indexOf('\n}', mtStart) + 2
const mediaTagsOf = new Function(`${hostSrc.slice(mtStart, mtEnd)}; return mediaTagsOf`)()
check('模板含 {audio} → true', mediaTagsOf('completed', { completed: 'x{audio}' }).audio === true)
check('模板不含 {audio} → false', mediaTagsOf('completed', { completed: 'x' }).audio === false)
check('空模板（默认文案）→ 三项皆 false', (() => { const t = mediaTagsOf('completed', { completed: '' }); return !t.audio && !t.image && !t.icon })())
check('{image}/{icon} 同时识别', (() => { const t = mediaTagsOf('error', { error: '{image}{icon}' }); return t.image && t.icon && !t.audio })())
check('templates 缺失时安全（全 false）', (() => { const t = mediaTagsOf('completed', undefined); return !t.image && !t.icon && !t.audio })())
check('宿主把 tags 写进 notice.source', /mediaTags: mediaTags \?\? \{\}/.test(hostSrc))
check('投影 schema 含 tags、stateVersion=3', /tags: z\.record\(z\.boolean\(\)\)\.default\(\{\}\)/.test(hostSrc) && /stateVersion: 3,/.test(hostSrc))

// ------------------------------------------- 3b. v4 生产者 source 契约
group('3b index.js：v4 source.kind 契约（issue #4）')
{
  // 从源码里抠出投影 apply 的真实判定表达式求值，避免只做文本匹配而漏掉语义回归。
  const condMatch = hostSrc.match(/if \((src\.kind[\s\S]*?)\) return state/)
  if (!condMatch) throw new Error('未找到投影 source 判定表达式')
  const accepts = new Function('src', 'PLUGIN_ID', `return !(${condMatch[1]})`)
  const ID = 'dsh-session-notify'
  check('写入端写生产者自有 kind（不再是老式 "plugin" 包装）', /kind: `plugin:\$\{PLUGIN_ID\}`/.test(hostSrc))
  check('写入端保留 plugin 字段（UI 署名）', /kind: `plugin:\$\{PLUGIN_ID\}`,\s*\n\s*plugin: PLUGIN_ID,/.test(hostSrc))
  check('投影认新式 kind（带 plugin 字段）', accepts({ kind: `plugin:${ID}`, plugin: ID }, ID) === true)
  check('投影认迁移后形状（无 plugin 字段）', accepts({ kind: `plugin:${ID}`, form: 'notice' }, ID) === true)
  check('投影仍认 V3 老式形状（宿主未迁移时）', accepts({ kind: 'plugin', plugin: ID }, ID) === true)
  check('投影拒 v4 拒收的老式 "plugin" 裸包装（无 plugin 字段）', accepts({ kind: 'plugin' }, ID) === false)
  check('投影拒别的插件', accepts({ kind: 'plugin:dsh-web-tools', plugin: 'dsh-web-tools' }, ID) === false)
  check('投影拒非本插件的老式来源', accepts({ kind: 'plugin', plugin: 'dsh-layered-memory' }, ID) === false)
}

// ------------------------------------- 3c. 客户端设置服务名契约（0.2.0）
group('3c client.js：设置服务名双代兼容')
{
  // settingsScope 在 0.1.7+ 已弃用（正式名 webUiSettings），且不能作为 inject 硬依赖：
  // 服务缺席会让整个客户端 fiber 永久 park，通知与设置面板一起消失。
  const injectMatch = clientSrc.match(/exports\.inject = (\[[^\]]*\])/)
  check('inject 声明存在', injectMatch !== null)
  const declared = injectMatch ? JSON.parse(injectMatch[1].replace(/'/g, '"')) : []
  check('inject 不含 settingsScope（否则 0.2.0 永久 pending）', !declared.includes('settingsScope'))
  check('inject 仍保留 sessions / slots 硬依赖', declared.includes('sessions') && declared.includes('slots'))
  check('settingsBinder 优先取 webUiSettings', /ctx\.get\('webUiSettings'\) \?\? ctx\.get\('settingsScope'\)/.test(clientSrc))
  check('无残留的 ctx.settingsScope 直接访问', !/ctx\.settingsScope\b/.test(clientSrc))
}

// --------------------------------------------------- 4. client.js 纯逻辑
group('4 client.js：提示音纯逻辑')
function grab(startMarker, endMarker) {
  const i = clientSrc.indexOf(startMarker)
  if (i < 0) throw new Error('marker not found: ' + startMarker)
  const j = clientSrc.indexOf(endMarker, i)
  if (j < 0) throw new Error('end marker not found: ' + endMarker)
  return clientSrc.slice(i, j)
}
const helpers = [
  grab('var REASON_FIELDS =', 'var PUSH_MODES'),
  grab('/** 把模板拆成 [text|token] 片段', '/** 完整预览图'),
  grab('/** 音量（0~1）：未知/越界一律回落默认', '/** 扁平快照'),
]
const clientFns = new Function(`"use strict";
  var LANG_IDS = ['zh','zh-tw','en','ja','ko'];
  var REASON_FIELDS = ['completed','error','aborted','blocked','max-tokens','question'];
  var DEFAULT_VOLUME = 0.6;
  var DEFAULT_MAX_DURATION = 0;
  ${helpers.join('\n')}
  return { REASON_FIELDS, parseTemplate, dedupeAudioTag, hasAudioTag, audioOf, audioMapOf, volumeOf, maxDurationOf, templateOf,
    langOfValue, strOfValue, savedMapOf, samePlanValue };
`)()

const parts = clientFns.parseTemplate('会话「{title}」已完成{audio}{image}{icon}{duration}')
check('parseTemplate 识别 {audio} 为胶囊', parts.filter((p) => p.type === 'token' && p.key === 'audio').length === 1)
check('parseTemplate 仍识别 title/image/icon/duration', parts.filter((p) => p.type === 'token').map((p) => p.key).join(',') === 'title,audio,image,icon,duration')

check('dedupe 保留首个 {audio}', clientFns.dedupeAudioTag('A{audio}B{audio}C') === 'A{audio}BC')
check('dedupe 连写 {audio}{audio} → 单个', clientFns.dedupeAudioTag('{audio}{audio}') === '{audio}')
check('dedupe 三连 {audio}', clientFns.dedupeAudioTag('x{audio}{audio}{audio}y') === 'x{audio}y')
check('dedupe 无标签原样', clientFns.dedupeAudioTag('会话已完成') === '会话已完成')
check('dedupe 不误伤其他标签', clientFns.dedupeAudioTag('{audio}{image}') === '{audio}{image}')

const cur = {
  'tpl-completed': '会话已完成{audio}',
  'tpl-error': '出错了{audio}{audio}',
  'tpl-aborted': '已中止',
  'audio-completed': 'data:audio/wav;base64,AAA',
  'audio-error': 'data:audio/wav;base64,BBB',
  'audio-aborted': 'data:audio/wav;base64,CCC',
}
const map = clientFns.audioMapOf(cur)
check('有 {audio} 标签 → 保留音频数据', map.completed === 'data:audio/wav;base64,AAA' && map.error === 'data:audio/wav;base64,BBB')
check('无 {audio} 标签 → 数据清空', map.aborted === '' && map.blocked === '' && map.question === '')
check('audioMapOf 键集合与 REASON_FIELDS 一致', Object.keys(map).join(',') === clientFns.REASON_FIELDS.join(','))
check('volumeOf 合法值透传', clientFns.volumeOf({ volume: 0 }) === 0 && clientFns.volumeOf({ volume: 1 }) === 1 && clientFns.volumeOf({ volume: 0.35 }) === 0.35)
check('volumeOf 缺失/越界/非数 → 0.6', clientFns.volumeOf({}) === 0.6 && clientFns.volumeOf({ volume: 2 }) === 0.6 && clientFns.volumeOf({ volume: 'abc' }) === 0.6)
check('volumeOf 字符串数字容忍', clientFns.volumeOf({ volume: '0.8' }) === 0.8)
check('maxDurationOf 0（不限制，默认）保留', clientFns.maxDurationOf({ maxDuration: 0 }) === 0 && clientFns.maxDurationOf({}) === 0)
check('maxDurationOf 合法值透传（含小数）', clientFns.maxDurationOf({ maxDuration: 15 }) === 15 && clientFns.maxDurationOf({ maxDuration: 2.5 }) === 2.5)
check('maxDurationOf 负数/非数 → 0（不限制）', clientFns.maxDurationOf({ maxDuration: -1 }) === 0 && clientFns.maxDurationOf({ maxDuration: 'abc' }) === 0)
check('maxDurationOf 字符串数字容忍 / 空串 → 0', clientFns.maxDurationOf({ maxDuration: '4' }) === 4 && clientFns.maxDurationOf({ maxDuration: '' }) === 0)
// 「只写变化字段」的比对助手（优化 A 的底座）
check('savedMapOf：按原因映射取 6 键、缺键补空串', (() => {
  const m = clientFns.savedMapOf({ templates: { completed: 'a' } }, 'templates')
  return Object.keys(m).join(',') === clientFns.REASON_FIELDS.join(',') && m.completed === 'a' && m.error === ''
})())
check('savedMapOf：字段缺失/非对象时全空串', (() => {
  const m = clientFns.savedMapOf({}, 'audios')
  return Object.values(m).every((v) => v === '') && Object.keys(m).length === 6
})())
check('strOfValue / langOfValue：缺省与越界回落', clientFns.strOfValue({}, 'imageUrl') === '' && clientFns.langOfValue({ language: 'en' }) === 'en' && clientFns.langOfValue({ language: 'bogus' }) === 'zh')
check('samePlanValue：相同映射 → true（含大字符串同实例）', (() => {
  const big = 'data:audio/wav;base64,' + 'A'.repeat(20000)
  return clientFns.samePlanValue({ completed: big, error: '' }, { completed: big, error: '' })
})())
check('samePlanValue：任一键不同 → false', !clientFns.samePlanValue({ completed: 'x' }, { completed: 'y' }) && !clientFns.samePlanValue({ completed: '' }, { completed: '' , error: 'x' }))
check('samePlanValue：标量按值比较', clientFns.samePlanValue(0.35, 0.35) && !clientFns.samePlanValue(0.35, 0.6) && clientFns.samePlanValue('zh', 'zh') === true)

// -------------------------------------------------------- 5. 接线检查
group('5 client.js：接线检查')
const wire = [
  ['notifyUser 播放提示音（带音量 + 最长时长）', /if \(media && media\.audioData\) playAlertSound\(media\.audioData, media\.volume, media\.maxDuration\)/],
  ['mediaOf 读取 audios', /var aus = st\.value\.audios/],
  ['mediaOf 带上 maxDuration', /function mediaOf\(kind, volume\) \{[\s\S]{0,400}maxDuration: currentMaxDuration\(\)/],
  ['currentMaxDuration 读设置文档', /var v = snap && snap\.value \? snap\.value\.maxDuration : undefined/],
  ['三处媒体调用带音量', /mediaOf\('question', currentVolume\(\)\)[\s\S]*mediaOf\('approval', currentVolume\(\)\)/],
  ['completion 带 kind + tags 门控', /var mkind = proj && proj\.kind \? proj\.kind : 'completed'[\s\S]{0,400}proj\.tags\.audio === false\) media\.audioData = media\.globalAudio/],
  ['mediaOf：按原因音频优先、否则回落全局提示音', /if \(kind && aus && typeof aus\[kind\] === 'string'\) out\.audioData = aus\[kind\][\s\S]{0,120}out\.globalAudio = String\(st\.value\.globalAudio \|\| ''\)[\s\S]{0,120}if \(!out\.audioData\) out\.audioData = out\.globalAudio/],
  ['readNoticeAny 返回 kind/tags', /kind: typeof pv\.kind === 'string' && pv\.kind !== '' \? pv\.kind : 'completed'[\s\S]{0,120}tags: \(pv\.tags && typeof pv\.tags === 'object'\) \? pv\.tags : DEFAULT_TAGS/],
  ['旧宿主兜底 DEFAULT_TAGS', /var DEFAULT_TAGS = \{ image: true, icon: true, audio: true \}/],
  ['保存写 audios / globalAudio / volume / maxDuration（计划表覆盖 19 个字段）', (() => {
    const planKeys = [...clientSrc.matchAll(/\{ key: '([a-zA-Z]+)', next: /g)].map((m) => m[1])
    const want = ['language', 'templates', 'titleTemplate', 'titleTemplates', 'pushModeBlur', 'pushModeFocus', 'skipSubagents', 'imageUrl', 'iconUrl', 'imagePreviewUrl', 'iconPreviewUrl', 'images', 'icons', 'imagePreviews', 'iconPreviews', 'audios', 'globalAudio', 'volume', 'maxDuration']
    return want.every((k) => planKeys.includes(k)) && planKeys.length === want.length
  })()],
  // 优化 A：只写变化字段（每次 scope.set 都是一次全量落盘 + 整段视图回传，18 次全写在大音频下被放大 18 倍）
  ['只写变化字段（逐字段比对已保存值）', /if \(!samePlanValue\(plans\[pi\]\.next, plans\[pi\]\.prev\)\) tasks\.push\(scope\.set\(plans\[pi\]\.key, plans\[pi\]\.next\)\)/],
  ['已保存值派生与写库口径一致（language/字符串/按原因映射）', /function langOfValue\(value\)[\s\S]{0,240}function strOfValue\(value, key\)[\s\S]{0,260}function savedMapOf\(value, key\)/],
  ['大字符串比较走等价判定（引用快路径）', /function samePlanValue\(a, b\)[\s\S]{0,400}return a === b/],
  ['保存中禁用保存/重置/放弃按钮', /disabled: !dirty \|\| saving, onClick: save/],
  ['保存开始/结束维护 saving 状态', /setNote\(t\.saving\)\s*\n\s*setSaving\(true\)[\s\S]{0,4000}setSaving\(false\)/],
  ['重置写 audios / volume / maxDuration', /scope\.set\('audios', def\.audios\)[\s\S]{0,80}scope\.set\('volume', def\.volume\)[\s\S]{0,80}scope\.set\('maxDuration', def\.maxDuration\)/],
  ['预设带 volume + maxDuration', /volume: volumeOf\(cur\),\s*\n\s*maxDuration: maxDurationOf\(cur\),/],
  ['预设载入 maxDuration（旧预设保留当前值）', /if \(typeof entry\.maxDuration === 'number' && Number\.isFinite\(entry\.maxDuration\) && entry\.maxDuration >= 0\) next\.maxDuration = entry\.maxDuration/],
  ['一次性 unset 清理已撤销（设置项回来了）', !/scope\.unset\('maxDuration'\)/.test(clientSrc)],
  ['上传不做截断（无 trim 工具链）', !/trimLimitFor|TRIM_MARGIN_SECONDS|encodeWavDataUri|trimAudioDataUri|audioDurationOf/.test(clientSrc)],
  ['上传按原样写入草稿', /setVal\(draftKey, uri\)\s*\n\s*log\('audio picked for '/],
  ['按原因音频与全局音频共用读取逻辑', /function pickReasonAudio\(field\) \{ pickAudioInto\('audio-' \+ field, field\) \}[\s\S]{0,120}function pickGlobalAudio\(\) \{ pickAudioInto\('globalAudio', 'global'\) \}/],
  ['全局提示音行存在（添加/替换/试听/清除）', (() => {
    return /function globalAudioRow\(form, tt\)/.test(clientSrc) &&
      /tt\.globalAudioAdd/.test(clientSrc) && /tt\.globalAudioReplace/.test(clientSrc) &&
      /pickGlobalAudio\(\)/.test(clientSrc) && /setVal\('globalAudio', ''\)/.test(clientSrc)
  })()],
  ['全局提示音行已排进「音频」折叠区（音量 → 时长 → 全局提示音）', /volumeRow\(cur, t\),\s*\n\s*maxDurationRow\(cur, t\),\s*\n\s*globalAudioRow\(cur, t\),/],
  ['全局提示音只显示摘要不铺 base64', /function audioSummary\(uri\)[\s\S]{0,260}return kind \+ ' · ' \+ kb \+ ' KB'/],
  ['重置会清空全局提示音', /scope\.set\('globalAudio', def\.globalAudio\)/],
  ['DEFAULT_FLAT 含 globalAudio', /globalAudio: '',\s*\n\s*volume: DEFAULT_VOLUME,/],
  ['只有全局提示音时试听按钮也可用', /return globalAudioOf\(form\) \/\/ 只有全局提示音时/],
  ['最长播放时长输入行', /function maxDurationRow\(form, tt\)/],
  ['「音频」折叠区默认展开', /var audioFoldState = useState\(true\)/],
  ['「音频」区不再有说明文案（大小写不敏感，含 globalAudioHint 变体）', !/audiohint/i.test(clientSrc)],
  ['保存时剥除重复 {audio}', /templates\[k\] = dedupeAudioTag\(flat\['tpl-' \+ k\]\)/],
  ['插入按钮带唯一性约束', /disabled: hasAudioTag\(tplValue\)/],
  ['编辑器 onChange 剥除重复标签', /var next = dedupeAudioTag\(tpl\)/],
  ['音频文件选择器', /function pickReasonAudio\(field\)/],
  ['音量经 GainNode 施加', /gain\.gain\.value = vol/],
  ['音量 0 = 静音短路', /if \(vol === 0\) \{ log\('alert sound skipped \(volume 0\)'\); return \}/],
  ['解码结果缓存', /audioBufCache\.set\(dataUri, buf\)/],
  ['卸载释放音频资源', /audioBufCache\.clear\(\)[\s\S]{0,120}audioCtx = null/],
  ['手势内解锁音频上下文', /function unlockAudio\(\)/],
  // 试听可停止 + ▶↔⏸ + 音频胶囊可单独删除
  ['播放会话登记（同一时刻只播一个）', /var activePlay = null/],
  ['试听 / 停止切换（带最长时长参数）', /function toggleAlertSound\(dataUri, volume, maxSeconds\)/],
  ['同一提示音再点即停', /if \(activePlay && activePlay\.src === dataUri\) \{ stopAlertSound\(0\); return false \}/],
  ['停止播放（淡出时长可调）', /function stopAlertSound\(fadeMs\)/],
  ['最长时长淡出 0.5 秒', /var FADE_OUT_MS = 500/],
  ['最长时长触发音量淡出（Web Audio）', /gain\.gain\.linearRampToValueAtTime\(0, endAt\)/],
  ['最长时长触发音量淡出（Audio 元素回退）', /fadeAudioElementOut\(el, FADE_OUT_MS\)/],
  ['播放态可订阅（面板 ▶↔⏸ 依据）', /function subscribeAudioState\(fn\)/],
  ['音频胶囊 ▶↔⏸ 就地刷新', /function syncAudioChipIcon\(chip\)/],
  // 图标同形同款：播放/暂停成对内联 SVG（原先 ⏸ U+23F8 在 Windows 上会渲染成彩色 emoji，和单色 ▶ 不是一个观感）
  ['播放/暂停图标为内联 SVG（10×10 同框）', /function audioIconEl\(kind\)[\s\S]{0,600}setAttribute\('viewBox', '0 0 10 10'\)[\s\S]{0,300}setAttribute\('width', '9'\)/],
  ['胶囊成对挂上 play + pause 两个图标', /play\.appendChild\(audioIconEl\('play'\)\)\s*\n\s*play\.appendChild\(audioIconEl\('pause'\)\)/],
  ['播放态只切换两个图标显示（不再写 ⏸ 字符做主路径）', /playIcon\.style\.display = playing \? 'none' : 'block'[\s\S]{0,120}pauseIcon\.style\.display = playing \? 'block' : 'none'/],
  ['暂停图标为两根圆角竖条、与三角同线重', /barA\.setAttribute\('width', '2\.2'\)[\s\S]{0,260}barB\.setAttribute\('x', '5\.7'\)/],
  // 图标判据必须实时读 props：胶囊 DOM 是「插标签时」建的，缓存快照会导致选了音频再点试听也不切换
  ['播放图标判据实时读 props（点试听即切换）', /var src = String\(propsRef\.current\.audioData \|\| ''\)/],
  ['不再在胶囊 DOM 上缓存音频源快照', !/__dsnAudioSrc/.test(clientSrc)],
  // 「时长」行：标签 → 滑块（0~15s，步长 0.1）→ 数值框 → 单位
  ['时长滑块量程 0~15 秒', /var MAX_DURATION_SLIDER_MAX = 15/],
  ['时长滑块步长 0.1 秒', /var MAX_DURATION_SLIDER_STEP = 0\.1/],
  ['时长行顺序：标签 → 滑块 → 数值框 → 单位', /tt\.maxDuration\),\s*\n\s*h\('input', \{\s*\n\s*type: 'range'/],
  ['秒数取整到 1 位小数（滑块浮点噪声）', /function roundSeconds\(value\)/],
  ['音频胶囊带删除 ×', /rmAudio\.setAttribute\('data-rm', '1'\)/],
  ['音频胶囊点本体不再删除（改试听）', /if \(isAudio\) \{\s*\n\s*if \(propsRef\.current\.onPlayAudio\)/],
  ['删标签不抹掉正文（默认文案判定）', /else if \(!domIsEmpty\(\)\)/],
  ['音量行「试听↔停止」按钮', /playing \? tt\.volumeStop : tt\.volumeTest/],
  // 音量设置真正生效（试听/胶囊按钮/测试通知都按当前音量）+ 音频设置收进「音频」折叠区
  ['试听按当前音量播放（不再固定满音量）', /toggleAlertSound\(preview, vol, maxSec\)/],
  ['胶囊按钮按当前音量 + 最长时长播放', /toggleAlertSound\(src, volumeOf\(cur\), maxDurationOf\(cur\)\)/],
  ['发送测试通知按当前音量', /audioData: \(hasAudioTag\(templateOf\(cur, field\)\) \? audioOf\(cur, field\) : ''\) \|\| globalAudioOf\(cur\),\s*\n\s*volume: volumeOf\(cur\),/],
  ['「音频」折叠区展开/收起', /setAudioFoldOpen\(!audioFoldOpen\)/],
  ['「音量」标签排在滑块前面', /tt\.volume\),\s*\n\s*h\('input', \{\s*\n\s*type: 'range'/],
  ['提示音探针（自动化断言用）', /alertAudio: function \(action, src, volume, maxSeconds\)/],
]
for (const [name, matcher] of wire) check(name, typeof matcher === 'boolean' ? matcher : matcher.test(clientSrc))

// ------------------------------------------------------------ 6. 渲染冒烟
group('6 设置卡片渲染冒烟')
function buildHarness(settingsValue, useWebAudio) {
  const React = makeReact()
  let Card = null
  const created = []
  const previews = [] // 试听/通知的实际播放记录：{ volume, src? }（验证音量设置真的生效）
  const writes = [] // 实际写入设置文档的字段名（验证「只写变化字段」）
  const unsets = [] // 实际清理的字段名（验证旧 maxDuration 残留键的一次性清理）
  let lastGain = null
  class FakeParam {
    constructor(v) { this.value = v }
    setValueAtTime() { return this }
    linearRampToValueAtTime() { return this }
    cancelScheduledValues() { return this }
  }
  class FakeCtx {
    constructor() { this.state = 'running'; this.destination = {}; this.currentTime = 0 }
    resume() { this.state = 'running'; return Promise.resolve() }
    createGain() { lastGain = { gain: new FakeParam(1), connect() { return this } }; return lastGain }
    createBufferSource() {
      const g = lastGain
      return {
        buffer: null, connect() { return this },
        start() { previews.push({ volume: g ? g.gain.value : null }) },
        stop() {},
      }
    }
    decodeAudioData(buf, ok) {
      const decoded = { duration: 1 }
      try { ok && ok(decoded) } catch (e) { /* 老实现同步抛错时忽略 */ }
      return Promise.resolve(decoded)
    }
  }
  class FakeAudio {
    constructor(src) { this.src = src; this.volume = 1 }
    play() { previews.push({ volume: this.volume, src: this.src }); return Promise.resolve() }
    pause() {}
  }
  const settingsScope = {
    bind: () => ({
      getSnapshot: () => ({ status: 'ready', value: settingsValue }),
      subscribe: () => () => {},
      get: () => settingsValue,
      set: (k, v) => { writes.push(k); if (k in settingsValue) settingsValue[k] = v; return Promise.resolve() },
      unset: (k) => { unsets.push(k); delete settingsValue[k]; return Promise.resolve() },
    }),
  }
  const ctx = {
    webUiSettings: settingsScope,
    slots: { inject() {}, register() {} },
    sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {}, binding: () => null } },
    get: (k) => (k === 'webUiSettings' || k === 'settingsScope' ? settingsScope : undefined), on: () => () => {}, effect: (fn) => { void fn },
  }
  const factoryStart = clientSrc.indexOf('factory: (require) => {') + 'factory: (require) => {'.length
  const factoryBody = clientSrc.slice(factoryStart, clientSrc.lastIndexOf('\n    return module.exports'))
  const loader = new Function('window', 'require', 'console', 'document', 'requestAnimationFrame', 'Audio', `
    var module = { exports: {} };
    var exports = module.exports;
    ${factoryBody}
    return module.exports;
  `)
  const win = {
    addEventListener() {}, localStorage: { getItem: () => null, setItem() {} }, confirm: () => true,
    Notification: undefined, AudioContext: useWebAudio ? FakeCtx : undefined, webkitAudioContext: undefined,
    crypto: globalThis.crypto, setTimeout, clearTimeout,
  }
  const doc = {
    querySelector: () => null,
    createElement: (tag) => {
      const el = {
        tag, style: {}, files: null, value: '', type: '', accept: '',
        setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {},
        click() { el.clicked = true; created.push(el) },
      }
      created.push(el)
      return el
    },
    body: { appendChild() {} }, head: { appendChild() {} }, documentElement: { appendChild() {} },
  }
  // react 可用（卡片需要），其余模块不可用（走 fallback 分支）
  const mod = loader(win, (id) => { if (id === 'react') return React; throw new Error('no module: ' + id) }, { log() {}, warn() {}, error() {} }, doc, (fn) => fn(), FakeAudio)
  ctx.slots.register = (_def, component) => { Card = component }
  // slots.inject(name, generator) 语义：跑生成器（首次 next 拿到 register 调用，第二次 next 完成注册）
  ctx.slots.inject = (_name, gen) => { const it = gen(); it.next(); it.next() }
  mod.apply(ctx)
  return { Card, React, created, win, previews, writes, unsets }
}
function makeReact() {
  const store = { states: [], idx: 0 }
  function createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) }
  }
  return {
    createElement,
    useState(init) {
      const idx = store.idx++
      if (store.states[idx] === undefined) store.states[idx] = typeof init === 'function' ? init() : init
      return [store.states[idx], (v) => { store.states[idx] = typeof v === 'function' ? v(store.states[idx]) : v }]
    },
    useEffect() { store.idx++ },
    useRef(init) {
      const idx = store.idx++
      if (store.states[idx] === undefined) store.states[idx] = { current: init === undefined ? null : init }
      return store.states[idx]
    },
    __store: store,
  }
}
function flatten(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push({ type: '#text', text: String(node), props: {} }); return out }
  if (Array.isArray(node)) { node.forEach((n) => flatten(n, out)); return out }
  out.push({ type: node.type, props: node.props || {}, children: node.children || [] })
  if (typeof node.type === 'function') flatten(node.type(node.props || {}), out)
  else (node.children || []).forEach((c) => flatten(c, out))
  return out
}
const baseValue = {
  language: 'zh', templates: {}, titleTemplate: '', titleTemplates: {},
  pushModeBlur: 'dual', pushModeFocus: 'dual', skipSubagents: true,
  imageUrl: '', iconUrl: '', imagePreviewUrl: '', iconPreviewUrl: '',
  images: {}, icons: {}, imagePreviews: {}, iconPreviews: {}, audios: {}, volume: 0.6, maxDuration: 0,
}
{
  const h = buildHarness(JSON.parse(JSON.stringify(baseValue)), true)
  // 设置 → 内置插件 的独立页签：宿主不传 view，整页都是本面板 → 必须**默认展开**。
  const tabNodes = flatten(h.Card({}))
  check('独立页签（无 view）默认展开：直接渲染音量滑块', tabNodes.some((n) => n.props.type === 'range'))
  check('独立页签无折叠头（aria-expanded 头按钮不出现）', !tabNodes.some((n) => n.type === 'button' && n.props['aria-expanded'] === false))
}
{
  const h = buildHarness(JSON.parse(JSON.stringify(baseValue)), true)
  check('设置卡片注册成功', typeof h.Card === 'function')
  let nodes = flatten(h.Card({ view: 'page' }))
  check('折叠态不渲染音量行', !nodes.some((n) => n.props.type === 'range'))
  const head = nodes.find((n) => n.type === 'button' && n.props['aria-expanded'] === false)
  check('存在折叠头按钮', !!head)
  if (head) head.props.onClick({})
  h.React.__store.idx = 0
  nodes = flatten(h.Card({ view: 'page' }))
  const foldHead = (list, label) => list.find((n) => n.type === 'button' && Array.isArray(n.children)
    && n.children.some((c) => c && Array.isArray(c.children) && c.children.length === 1 && c.children[0] === label))
  // 「音频」折叠区**默认展开** → 展开卡片后立刻能看到音量滑块与「时长」滑块（两个 range）
  let ranges = nodes.filter((n) => n.props.type === 'range')
  check('「音频」区默认展开：展开卡片即渲染音量 + 时长两个滑块', ranges.length === 2, String(ranges.length))
  const volSlider = nodes.find((n) => n.props.type === 'range' && n.props.max === 100)
  const durSlider = nodes.find((n) => n.props.type === 'range' && n.props.max === 15)
  check('音量滑块 max=100、时长滑块 max=15（步长 0.1）', !!volSlider && !!durSlider && durSlider.props.min === 0 && durSlider.props.step === 0.1)
  const audioHead = foldHead(nodes, '音频')
  check('存在「音频」折叠区入口', !!audioHead)
  if (audioHead) audioHead.props.onClick({}) // 折叠
  h.React.__store.idx = 0
  nodes = flatten(h.Card({ view: 'page' }))
  check('点折叠头可收起（滑块隐藏）', nodes.filter((n) => n.props.type === 'range').length === 0)
  const audioHead2 = foldHead(nodes, '音频')
  if (audioHead2) audioHead2.props.onClick({}) // 再展开
  h.React.__store.idx = 0
  nodes = flatten(h.Card({ view: 'page' }))
  ranges = nodes.filter((n) => n.props.type === 'range')
  check('再点一次重新展开', ranges.length === 2, String(ranges.length))
  if (volSlider) {
    check('滑块 0~100、步进 1', volSlider.props.min === 0 && volSlider.props.step === 1)
    check('滑块当前值 60（0.6）', volSlider.props.value === 60, String(volSlider.props.value))
    volSlider.props.onChange({ target: { value: '35' } })
    check('拖动写入草稿 volume=0.35', h.React.__store.states.some((s) => s && typeof s === 'object' && s.volume === 0.35))
  }
  check('音量行含文案与百分比', nodes.some((n) => n.type === '#text' && n.text === '音量') && nodes.some((n) => n.type === '#text' && n.text === '60%'))
  check('「音量」标签排在滑块前面（同一行）', (() => {
    const isText = (c, text) => c && c.type === 'span' && Array.isArray(c.children) && c.children.length === 1 && c.children[0] === text
    const row = nodes.find((n) => n.type === 'div' && Array.isArray(n.children) && n.children.some((c) => isText(c, '音量')))
    if (!row) return false
    const labelIdx = row.children.findIndex((c) => isText(c, '音量'))
    const rangeIdx = row.children.findIndex((c) => c && c.type === 'input' && c.props && c.props.type === 'range')
    return labelIdx === 0 && rangeIdx === 1
  })())
  check('无提示音时「试听」禁用', nodes.some((n) => n.type === 'button' && n.props.disabled === true && n.props.title === '试听该提示音'))
  check('「音频」区已无说明文案', !nodes.some((n) => n.type === '#text' && typeof n.text === 'string' && n.text.includes('各状态模板里插入')))
  // 「时长」行：标签 + 滑块 + 数值框 + 单位（同一行）；0 = 不限制
  const numInputs = nodes.filter((n) => n.props.type === 'number')
  check('渲染时长数值输入', numInputs.length === 1, String(numInputs.length))
  check('时长行含「时长」文案 / 单位', nodes.some((n) => n.type === '#text' && n.text === '时长') && nodes.some((n) => n.type === '#text' && n.text === '秒'))
  check('时长说明含 0 = 不限制', nodes.some((n) => n.type === '#text' && typeof n.text === 'string' && n.text.includes('0 = 不限制')))
  check('「时长」行顺序 = 标签 → 滑块 → 数值框 → 单位', (() => {
    const isText = (c, text) => c && c.type === 'span' && Array.isArray(c.children) && c.children.length === 1 && c.children[0] === text
    const row = nodes.find((n) => n.type === 'div' && Array.isArray(n.children) && n.children.some((c) => isText(c, '时长')))
    if (!row) return false
    const kinds = row.children.map((c) => {
      if (isText(c, '时长')) return 'label'
      if (isText(c, '秒')) return 'unit'
      if (c && c.type === 'input' && c.props && c.props.type === 'range' && c.props.max === 15) return 'slider'
      if (c && c.type === 'input' && c.props && c.props.type === 'number') return 'box'
      return '?'
    })
    return kinds.join(',') === 'label,slider,box,unit'
  })())
  if (durSlider) {
    durSlider.props.onChange({ target: { value: '7.5' } })
    check('拖动时长滑块 → 草稿 maxDuration=7.5', h.React.__store.states.some((s) => s && typeof s === 'object' && s.maxDuration === 7.5), JSON.stringify(h.React.__store.states.filter((s) => s && s.maxDuration !== undefined)))
    durSlider.props.onChange({ target: { value: '3.3000000000000003' } })
    check('滑块浮点步进取整到 1 位小数（3.3）', h.React.__store.states.some((s) => s && typeof s === 'object' && s.maxDuration === 3.3))
    durSlider.props.onChange({ target: { value: '0' } })
    check('滑块拉到最左 → 0（不限制）', h.React.__store.states.some((s) => s && typeof s === 'object' && s.maxDuration === 0))
  }
  if (numInputs[0]) {
    check('数值框 min=0、初始显示 "0"（不限制）', numInputs[0].props.min === 0 && numInputs[0].props.value === '0', String(numInputs[0].props.value))
    numInputs[0].props.onChange({ target: { value: '3' } })
    check('输入 3 → 草稿 maxDuration=3', h.React.__store.states.some((s) => s && typeof s === 'object' && s.maxDuration === 3))
    numInputs[0].props.onChange({ target: { value: '' } })
    check('清空输入 → 草稿 maxDuration=0（不限制）', h.React.__store.states.some((s) => s && typeof s === 'object' && s.maxDuration === 0))
  }
  const plus = nodes.filter((n) => n.type === 'button' && n.props.title === '在光标处插入信息')
  check('6 个状态行各有插入按钮', plus.length === 6, String(plus.length))
  if (plus.length) plus[0].props.onClick({})
  h.React.__store.idx = 0
  nodes = flatten(h.Card({ view: 'page' }))
  const audioBtn = nodes.find((n) => n.type === 'button' && n.props.title === '选择本地音频文件（作为该状态的提示音）')
  check('插入菜单含「音频」按钮', !!audioBtn)
  if (audioBtn) {
    check('未插 {audio} → 按钮可用', audioBtn.props.disabled === false)
    audioBtn.props.onClick({})
    check('点击弹出音频文件选择（accept=audio/*）', h.created.some((el) => el.tag === 'input' && el.accept === 'audio/*' && el.clicked))
    h.React.__store.idx = 0
    const after = flatten(h.Card({ view: 'page' }))
    const audioBtn2 = after.find((n) => n.type === 'button' && n.props.title === '选择本地音频文件（作为该状态的提示音）')
    check('已插 {audio} → 按钮置灰（唯一性约束）', !!audioBtn2 && audioBtn2.props.disabled === true)
  }
}

// ---------------------------------------------- 6b. 音量设置真正生效（试听即按当前音量）
group('6b 音量设置生效（试听按当前音量）')
{
  const AUDIO_URI = 'data:audio/wav;base64,UklGRg=='
  /** 走一遍「展开卡片 →（「音频」区默认已展开）拖音量 → 点试听」，返回实际播放记录。 */
  const runPreview = (useWebAudio) => {
    const value = JSON.parse(JSON.stringify(baseValue))
    value.audios = { completed: AUDIO_URI } // 有提示音，「试听」才可用
    const h = buildHarness(value, useWebAudio)
    let nodes = flatten(h.Card({ view: 'page' }))
    const head = nodes.find((n) => n.type === 'button' && n.props['aria-expanded'] === false)
    if (head) head.props.onClick({})
    h.React.__store.idx = 0
    nodes = flatten(h.Card({ view: 'page' }))
    const range = nodes.find((n) => n.props.type === 'range' && n.props.max === 100)
    if (range) range.props.onChange({ target: { value: '35' } }) // 草稿 volume = 0.35
    h.React.__store.idx = 0
    nodes = flatten(h.Card({ view: 'page' }))
    const testBtn = nodes.find((n) => n.type === 'button' && n.props.title === '试听该提示音' && n.props.disabled === false)
    if (testBtn) testBtn.props.onClick({})
    return { h, testBtn }
  }
  const wa = runPreview(true)
  check('有提示音时「试听」可用', !!wa.testBtn)
  check('试听按当前音量播放（Web Audio 通道 0.35）', wa.h.previews.length === 1 && Math.abs(wa.h.previews[0].volume - 0.35) < 1e-9, JSON.stringify(wa.h.previews))
  const el = runPreview(false)
  check('试听按当前音量播放（Audio 元素回退通道 0.35）', el.h.previews.length === 1 && Math.abs(el.h.previews[0].volume - 0.35) < 1e-9, JSON.stringify(el.h.previews))
  check('试听播放的正是该状态已设置的提示音', el.h.previews[0] && el.h.previews[0].src === AUDIO_URI, JSON.stringify(el.h.previews))
}

// ---------------------------------- 6c. 只写变化字段（优化 A）
group('6c 保存只写变化字段')
{
  const AUDIO_URI = 'data:audio/wav;base64,UklGRg=='
  const byText = (list, type, text) => list.find((n) => n.type === type && Array.isArray(n.children) && n.children[0] === text)
  const saveOf = (h) => {
    h.React.__store.idx = 0
    const nodes = flatten(h.Card({ view: 'page' }))
    const head = nodes.find((n) => n.type === 'button' && n.props['aria-expanded'] === false)
    if (head) head.props.onClick({})
    h.React.__store.idx = 0
    return byText(flatten(h.Card({ view: 'page' })), 'button', '保存')
  }
  const value = JSON.parse(JSON.stringify(baseValue))
  value.templates = { completed: '{audio}x', error: '', aborted: '', blocked: '', 'max-tokens': '', question: '' }
  value.audios = { completed: AUDIO_URI, error: '', aborted: '', blocked: '', 'max-tokens': '', question: '' }
  value.volume = 0.6
  value.maxDuration = 0
  const h = buildHarness(value, true)
  const settle = () => new Promise((r) => setTimeout(r, 5))
  const render = () => { h.React.__store.idx = 0; return flatten(h.Card({ view: 'page' })) }
  let nodes = render()
  const cardHead = nodes.find((n) => n.type === 'button' && n.props['aria-expanded'] === false)
  if (cardHead) cardHead.props.onClick({}) // 展开卡片（「音频」区默认已展开）
  nodes = render()
  const range = nodes.find((n) => n.props.type === 'range' && n.props.max === 100)
  const numInput = nodes.find((n) => n.props.type === 'number')
  check('6c：保存按钮存在', !!byText(nodes, 'button', '保存'))

  // 只改音量 → 只写 volume（一次保存 = 一次全量落盘 + 整段设置回传，能少写就少写）
  if (range) range.props.onChange({ target: { value: '35' } })
  nodes = render()
  byText(nodes, 'button', '保存')?.props.onClick({})
  await settle()
  check('只改音量 → 只写 volume（不再 18 个字段全写）', h.writes.join(',') === 'volume', h.writes.join(','))

  // 只改最长播放时长 → 只写 maxDuration
  if (numInput) numInput.props.onChange({ target: { value: '15' } })
  nodes = render()
  byText(nodes, 'button', '保存')?.props.onClick({})
  await settle()
  check('只改最长播放时长 → 只写 maxDuration', h.writes.slice(1).join(',') === 'maxDuration', h.writes.join(','))

  // 没有任何变化 → 一个字段都不写
  nodes = render()
  byText(nodes, 'button', '保存')?.props.onClick({})
  await settle()
  check('无变化再点保存 → 不写任何字段', h.writes.length === 2, h.writes.join(','))
}
// ------------------------------------------------------------ 7. 播放链路
group('7 完成推送：提示音播放链路')
function loadClient() {
  const plays = []
  const stops = []
  const ramps = [] // 增益自动化：{ type: 'set'|'ramp', value, at }
  let decodeCalls = 0
  const decodedLens = [] // 每次 decodeAudioData 的输入字节数（用于断言"播的是哪个音频"）
  let lastGain = null
  class FakeParam {
    constructor(v) { this.value = v }
    setValueAtTime(v, t) { ramps.push({ type: 'set', value: v, at: t }); return this }
    linearRampToValueAtTime(v, t) { ramps.push({ type: 'ramp', value: v, at: t }); return this }
    cancelScheduledValues() { return this }
  }
  class FakeCtx {
    constructor() { this.state = 'running'; this.destination = {}; this.currentTime = 0 }
    resume() { this.state = 'running'; return Promise.resolve() }
    createGain() { lastGain = { gain: new FakeParam(1), connect() { return this } }; return lastGain }
    createBufferSource() {
      const g = lastGain
      return {
        buffer: null, connect() { return this },
        start() { plays.push({ volume: g ? g.gain.value : null }) },
        stop(when) { stops.push(when === undefined ? null : when) },
      }
    }
    decodeAudioData(buf, ok, err) {
      decodeCalls++
      decodedLens.push(buf ? buf.byteLength : -1) // 记录解码输入长度 → 可区分「播放的是哪个音频」
      const decoded = { duration: 1 }
      try { ok && ok(decoded) } catch (e) { err && err(e) }
      return Promise.resolve(decoded)
    }
  }
  class FakeAudio { constructor(src) { this.src = src; this.volume = 1 } play() { return Promise.resolve() } pause() {} }
  const toasts = []
  const rootEl = { children: [], setAttribute() {}, appendChild(el) { toasts.push('toast'); rootEl.children.push(el) }, remove() {}, style: {} }
  Object.defineProperty(rootEl, 'firstChild', { get: () => rootEl.children[0] || null })
  const doc = {
    querySelector: () => rootEl,
    createElement: () => ({ style: {}, children: [], setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {}, textContent: '', firstChild: null }),
    body: { appendChild() {} }, head: { appendChild() {} }, documentElement: { appendChild() {} },
  }
  const factoryStart = clientSrc.indexOf('factory: (require) => {') + 'factory: (require) => {'.length
  const factoryBody = clientSrc.slice(factoryStart, clientSrc.lastIndexOf('\n    return module.exports'))
  const loader = new Function('window', 'require', 'console', 'document', 'requestAnimationFrame', 'Audio', 'Notification', `
    var module = { exports: {} };
    var exports = module.exports;
    ${factoryBody}
    return module.exports;
  `)
  const win = { AudioContext: FakeCtx, Audio: undefined, webkitAudioContext: undefined, addEventListener() {}, localStorage: { getItem: () => null, setItem() {} }, crypto: globalThis.crypto, setTimeout, clearTimeout }
  const mod = loader(
    win,
    (id) => { throw new Error('no module: ' + id) },
    { log() {}, warn() {}, error() {} },
    doc, (fn) => fn(),
    FakeAudio,
    undefined,
  )
  return { mod, plays, stops, ramps, toasts, win, decode: () => decodeCalls, decodedLens: () => decodedLens.slice() }
}
const AUDIO = 'data:audio/wav;base64,UklGRg==' // 解码后 4 字节
const GLOBAL_AUDIO = 'data:audio/wav;base64,UklGRgAA' // 解码后 5 字节（与 AUDIO 区分，用于断言播放源）
function runCompletion({ audio, template, volume, maxDuration, pushMode, tags, globalAudio }) {
  const h = loadClient()
  const session = {
    id: 'sess-1', displayTitle: 'Demo', running: false, cwd: 'F:\\tmp', origin: 'user',
    projectionValues: {
      'session-complete-notify': Object.assign({ kind: 'completed', text: '会话已完成。', title: '任务已完成' }, tags ? { tags } : {}),
    },
  }
  const snapshot = { byId: { 'sess-1': session } }
  let listener = null
  const value = Object.assign({
    language: 'zh', templates: { completed: template }, titleTemplate: '', titleTemplates: {},
    pushModeBlur: pushMode, pushModeFocus: pushMode, skipSubagents: true,
    images: {}, icons: {}, imagePreviews: {}, iconPreviews: {}, audios: { completed: audio }, volume,
    ...(globalAudio === undefined ? {} : { globalAudio }),
  }, maxDuration === undefined ? {} : { maxDuration })
  h.mod.apply({
    sessions: { list: { getSnapshot: () => snapshot, subscribe: (fn) => { listener = fn; return () => {} }, binding: () => null } },
    settingsScope: { bind: () => ({ getSnapshot: () => ({ status: 'ready', value }), subscribe: () => () => {}, get: () => value, set: () => Promise.resolve() }) },
    slots: { inject() {}, register() {} }, get: (k) => (k === "webUiSettings" || k === "settingsScope" ? { bind: () => ({ getSnapshot: () => ({ status: "ready", value }), subscribe: () => () => {}, get: () => value, set: () => Promise.resolve() }) } : undefined), on: () => () => {}, effect: (fn) => { void fn },
  })
  listener() // 基线
  session.running = true; listener()
  session.running = false; listener()
  return h
}
const TAG_NO = { image: false, icon: false, audio: false }
const TAG_YES = { image: false, icon: false, audio: true }
{
  let h = runCompletion({ audio: AUDIO, template: '会话「{title}」已完成', volume: 0.6, pushMode: 'toast', tags: TAG_NO })
  check('未插 {audio} 且没设全局提示音 → 不播放', h.plays.length === 0, JSON.stringify(h.plays))
  check('未插 {audio} → 仍推送页内提示', h.toasts.length >= 1, String(h.toasts.length))

  h = runCompletion({ audio: AUDIO, template: '会话「{title}」已完成{audio}', volume: 0.6, pushMode: 'toast', tags: TAG_YES })
  check('插了 {audio} + 有音频 → 播放一次', h.plays.length === 1, JSON.stringify(h.plays))
  check('音量 0.6 经 GainNode 生效', h.plays[0] && Math.abs(h.plays[0].volume - 0.6) < 1e-9, JSON.stringify(h.plays))

  check('老宿主（无 tags）→ 保守播放', runCompletion({ audio: AUDIO, template: '{audio}x', volume: 0.6, pushMode: 'toast' }).plays.length === 1)

  check('音量 0 → 静音（不播放）', runCompletion({ audio: AUDIO, template: '{audio}x', volume: 0, pushMode: 'toast', tags: TAG_YES }).plays.length === 0)
  check('音量 1 → 满音量播放', runCompletion({ audio: AUDIO, template: '{audio}x', volume: 1, pushMode: 'toast', tags: TAG_YES }).plays[0].volume === 1)
  check('插了标签但没选音频、也没全局提示音 → 不播放', runCompletion({ audio: '', template: '{audio}x', volume: 0.8, pushMode: 'toast', tags: TAG_YES }).plays.length === 0)

  // ---- 全局提示音兜底（优先级低于「内容里为该状态指定的音频」）----
  // 播放的是哪个音频：按 decodeAudioData 收到的字节数区分（两个 URI 解码长度不同）
  const bytes = (uri) => Buffer.from(uri.split(',')[1], 'base64').length
  h = runCompletion({ audio: '', template: '会话「{title}」已完成', volume: 0.6, pushMode: 'toast', tags: TAG_NO, globalAudio: GLOBAL_AUDIO })
  check('未插 {audio} + 设了全局提示音 → 播放全局提示音', h.plays.length === 1 && h.decodedLens()[0] === bytes(GLOBAL_AUDIO),
    JSON.stringify(h.plays) + ' lens=' + JSON.stringify(h.decodedLens()) + ' want=' + bytes(GLOBAL_AUDIO))
  check('全局提示音同样受音量控制', h.plays[0] && Math.abs(h.plays[0].volume - 0.6) < 1e-9, JSON.stringify(h.plays))

  h = runCompletion({ audio: '', template: '{audio}x', volume: 0.6, pushMode: 'toast', tags: TAG_YES, globalAudio: GLOBAL_AUDIO })
  check('插了 {audio} 但该状态没选音频 → 回落全局提示音', h.plays.length === 1 && h.decodedLens()[0] === bytes(GLOBAL_AUDIO),
    'lens=' + JSON.stringify(h.decodedLens()))

  h = runCompletion({ audio: AUDIO, template: '{audio}x', volume: 0.6, pushMode: 'toast', tags: TAG_YES, globalAudio: GLOBAL_AUDIO })
  check('内容里指定的音频优先于全局提示音', h.plays.length === 1 && h.decodedLens()[0] === bytes(AUDIO),
    'lens=' + JSON.stringify(h.decodedLens()) + ' want=' + bytes(AUDIO))

  check('音量 0 时全局提示音一并静音', runCompletion({ audio: '', template: 'x', volume: 0, pushMode: 'toast', tags: TAG_NO, globalAudio: GLOBAL_AUDIO }).plays.length === 0)
  check('该时机「不通知」→ 全局提示音一并静默', (() => {
    const r = runCompletion({ audio: '', template: 'x', volume: 0.6, pushMode: 'off', tags: TAG_NO, globalAudio: GLOBAL_AUDIO })
    return r.plays.length === 0 && r.toasts.length === 0
  })())

  h = runCompletion({ audio: AUDIO, template: '{audio}x', volume: 0.6, pushMode: 'off', tags: TAG_YES })
  check('该时机「不通知」→ 提示音一并静默', h.plays.length === 0 && h.toasts.length === 0)

  // 解码缓存：连续两次完成只解码一次
  const h2 = loadClient()
  const session = { id: 's1', displayTitle: 'D', running: false, cwd: 'F:\\tmp', origin: 'user', projectionValues: { 'session-complete-notify': { kind: 'completed', text: 'x', title: 't', tags: TAG_YES } } }
  const snapshot = { byId: { s1: session } }
  let listener = null
  const value = {
    language: 'zh', templates: { completed: '{audio}x' }, titleTemplate: '', titleTemplates: {},
    pushModeBlur: 'toast', pushModeFocus: 'toast', skipSubagents: true,
    images: {}, icons: {}, imagePreviews: {}, iconPreviews: {}, audios: { completed: AUDIO }, volume: 0.5,
  }
  h2.mod.apply({
    sessions: { list: { getSnapshot: () => snapshot, subscribe: (fn) => { listener = fn; return () => {} }, binding: () => null } },
    settingsScope: { bind: () => ({ getSnapshot: () => ({ status: 'ready', value }), subscribe: () => () => {}, get: () => value, set: () => Promise.resolve() }) },
    slots: { inject() {}, register() {} }, get: (k) => (k === "webUiSettings" || k === "settingsScope" ? { bind: () => ({ getSnapshot: () => ({ status: "ready", value }), subscribe: () => () => {}, get: () => value, set: () => Promise.resolve() }) } : undefined), on: () => () => {}, effect: (fn) => { void fn },
  })
  listener()
  for (let i = 0; i < 2; i++) { session.running = true; listener(); session.running = false; listener() }
  check('两次完成共播放两次', h2.plays.length === 2, JSON.stringify(h2.plays))
  check('只解码一次（命中缓存）', h2.decode() === 1, String(h2.decode()))
}

// ------------------------------------------- 7b. 试听开关 + 最长播放时长淡出
group('7b 试听（播放/暂停图标）与最长播放时长淡出')
{
  // 探针：通过调试钩子直接驱动播放器（等价于点胶囊按钮 / 音量行「试听」）
  const probe = (h, action, src, vol, max) => h.win.__dsch_notify_debug.alertAudio(action, src, vol, max)
  /** 挂载最小宿主：只为装上调试钩子（含提示音探针），不涉及任何会话。 */
  const mountProbe = (h) => {
    const value = {
      language: 'zh', templates: {}, titleTemplate: '', titleTemplates: {},
      pushModeBlur: 'off', pushModeFocus: 'off', skipSubagents: true,
      images: {}, icons: {}, imagePreviews: {}, iconPreviews: {}, audios: {}, volume: 0.6, maxDuration: 0,
    }
    h.mod.apply({
      sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {}, binding: () => null } },
      settingsScope: { bind: () => ({ getSnapshot: () => ({ status: 'ready', value }), subscribe: () => () => {}, get: () => value, set: () => Promise.resolve() }) },
      slots: { inject() {}, register() {} }, get: (k) => (k === "webUiSettings" || k === "settingsScope" ? { bind: () => ({ getSnapshot: () => ({ status: "ready", value }), subscribe: () => () => {}, get: () => value, set: () => Promise.resolve() }) } : undefined), on: () => () => {}, effect: (fn) => { void fn },
    })
    return h
  }
  const base = mountProbe(loadClient())

  // —— 试听：未播放 → 播放 → 再点即停（播放/暂停图标的判据就是「当前播放音源」）
  check('初始无播放', probe(base, 'state') === '')
  check('点试听后返回该音源（图标应变为暂停）', probe(base, 'toggle', AUDIO, 1) === AUDIO)
  check('已播放一次', base.plays.length === 1, JSON.stringify(base.plays))
  check('再点一次 → 立即停止，返回空（图标回到播放）', probe(base, 'toggle', AUDIO, 1) === '')
  check('停止落到音源上（stop(0) 立即停）', base.stops.length === 1 && base.stops[0] === 0, JSON.stringify(base.stops))
  check('停止后可再次播放', probe(base, 'toggle', AUDIO, 1) === AUDIO && base.plays.length === 2)
  check('显式 stop 生效', probe(base, 'stop') === '')
  check('未设最长时长 → 不排淡出', base.ramps.length === 0 && base.stops.filter((s) => s !== 0).length === 0, JSON.stringify({ ramps: base.ramps, stops: base.stops }))

  // —— 最长播放时长：音频（假解码时长 1 秒）比上限长 → 排 0.5 秒淡出
  const fade = mountProbe(loadClient())
  check('max=0.5 播放（音频 1 秒 > 0.5 秒）', probe(fade, 'play', AUDIO, 0.6, 0.5) === AUDIO)
  check('到点增益线性降到 0（0.5 秒淡出）', fade.ramps.some((r) => r.type === 'ramp' && r.value === 0 && Math.abs(r.at - 1) < 1e-9), JSON.stringify(fade.ramps))
  check('淡出起点 = 最长时长（0.5s，先保持原音量）', fade.ramps.some((r) => r.type === 'set' && Math.abs(r.value - 0.6) < 1e-9 && Math.abs(r.at - 0.5) < 1e-9), JSON.stringify(fade.ramps))
  check('音源在淡出结束时停止（0.5 + 0.5 = 1s）', fade.stops.length === 1 && Math.abs(fade.stops[0] - 1) < 1e-9, JSON.stringify(fade.stops))

  // —— 0 = 不限制：不排任何淡出
  const unlimited = mountProbe(loadClient())
  probe(unlimited, 'play', AUDIO, 0.6, 0)
  check('maxDuration=0 → 不排淡出（不限制）', unlimited.ramps.length === 0 && unlimited.stops.length === 0, JSON.stringify({ ramps: unlimited.ramps, stops: unlimited.stops }))

  // —— 音频本身比上限短 → 自然播完即可，不必排淡出
  const short = mountProbe(loadClient())
  probe(short, 'play', AUDIO, 0.6, 5)
  check('音频短于上限 → 不排淡出', short.ramps.length === 0 && short.stops.length === 0, JSON.stringify({ ramps: short.ramps, stops: short.stops }))

  // —— 通知推送套用同一设置（与试听同口径）
  const notifiedOn = runCompletion({ audio: AUDIO, template: '{audio}x', volume: 0.6, maxDuration: 0.5, pushMode: 'toast', tags: TAG_YES })
  check('通知提示音套用最长时长淡出', notifiedOn.ramps.some((r) => r.type === 'ramp' && r.value === 0) && notifiedOn.plays.length === 1, JSON.stringify(notifiedOn.ramps))
  const notifiedOff = runCompletion({ audio: AUDIO, template: '{audio}x', volume: 0.6, maxDuration: 0, pushMode: 'toast', tags: TAG_YES })
  check('通知提示音 maxDuration=0 → 不淡出（不限制）', notifiedOff.ramps.length === 0 && notifiedOff.plays.length === 1, JSON.stringify(notifiedOff.ramps))
}

// ------------------------------------------------------------- 8. README
group('8 README × 5 一致性 + 版本一致性')
{
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const files = ['README.md', 'README.en.md', 'README.zh-TW.md', 'README.ja.md', 'README.ko.md']
  for (const f of files) {
    const s = readFileSync(join(root, f), 'utf8')
    const rows = s.split(/\r?\n/)
    const audioRows = rows.filter((r) => r.startsWith('|') && r.includes('`{audio}`') && !r.includes('`{image}`'))
    // 更新日志首行（第一条版本行）必须是 package.json 的当前版本：发版时版本号与日志不允许脱节
    const firstVersionRow = rows.find((r) => /^\| \*\*\d+\.\d+\.\d+\*\* \|/.test(r))
    const mismatched = []
    let block = []
    const flush = () => {
      if (block.length >= 2 && new Set(block.map((b) => (b.line.match(/\|/g) || []).length)).size > 1) mismatched.push(block[0].no)
      block = []
    }
    rows.forEach((line, idx) => { if (line.startsWith('|')) block.push({ no: idx + 1, line }); else flush() })
    flush()
    check(`${f}：{audio} 行 / 表格列数`, audioRows.length === 1 && mismatched.length === 0, `audio=${audioRows.length} tableMismatch=${mismatched.length}`)
    check(`${f}：更新日志首行 = package.json 版本 ${pkg.version}`, !!firstVersionRow && firstVersionRow.includes(`**${pkg.version}**`), firstVersionRow ? firstVersionRow.slice(0, 48) : 'no version row')
    check(`${f}：提及 audios / volume 设置键`, s.includes('audios') && s.includes('volume'))
    check(`${f}：提及 maxDuration 设置键`, s.includes('maxDuration'))
  }
  check('package.json 语法与 main 指向 lib/index.js', pkg.main === './lib/index.js')
}
void clientSrc.length + hostSrc.length + coreSrc.length

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
