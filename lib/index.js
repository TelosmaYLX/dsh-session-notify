/**
 * dsh-session-complete-notify：会话完成系统消息提醒插件（host 平面）。
 *
 * 原理：订阅 session/event 火线——
 *   - turn/start   记下轮次开始时间；
 *   - assistant/message 累加该轮 token 用量；
 *   - turn/end     按 reason.kind（completed/aborted/blocked/error/max-tokens）
 *     组装一条系统消息，并以 plugin-source 的 user/message（form: 'notice'）
 *     追加进会话日志：Web UI 把它渲染为可折叠的系统提示行（醒目提醒用户），
 *     并随 JSONL 持久化，恢复/回放后依然可见。
 *
 * 设计取舍：
 *   - 只响应「实时」事件：resume/replay 不会重放旧通知，不会在加载会话时刷屏；
 *   - 追加的事件类型是 user/message，与自身监听目标（turn/*）不相交，
 *     天然免疫自我循环；
 *   - 零外部 import（@deepseek-ai/* 无法从本仓库目录解析），
 *     UserMessage 对象按 dsh-llm 的 createUserMessage 契约手工构造
 *     （id = crypto.randomUUID()，deep-freeze 由 session.append 的
 *     adoptSessionEvent 快照阶段完成）。
 *
 * 装配（cordis.patch.yml 或 dsh plugin add）：
 *   - id: session-complete-notify
 *     name: '@dsh-external/dsh-session-complete-notify'
 *     config:
 *       reasons: [completed, aborted, blocked, error, max-tokens]
 *       skipSubagents: true
 *       includeDuration: true
 *       includeUsage: true
 */

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { createTurnTracker, buildNotice, isSubagentSession, officialCacheRate, officialTps } from './core.js?v=1' // v=1: 缓存破坏——HMR 重载按 URL 键控

/** Cordis loader 诊断用插件名。 */
export const name = 'session-complete-notify'

/** 系统消息 source.plugin 标识（UI 按插件名着色/标注来源）。 */
const PLUGIN_ID = 'dsh-session-notify'

/** 设置命名空间（官方「设置 → 插件」面板的键）。 */
const SETTINGS_NS = 'session-complete-notify'

/**
 * 本插件从仓库目录以 realpath 加载，裸导入（@deepseek-ai/*）无法解析；
 * 用 createRequire 锚定 profile 共享依赖枢纽（.dsh/profiles/node_modules），
 * 取到与宿主同源（realpath 相同）的 schemastery 实例来构造设置 schema。
 */
const HUB_REQUIRE = createRequire(join(homedir(), '.dsh', 'profiles', 'node_modules', '__scn_anchor__.js'))

/** 默认配置。 */
const DEFAULT_OPTIONS = {
  /**
   * 触发提醒的 turn/end reason 白名单。默认排除 interrupted
   * （崩溃恢复后由持久化后端补写的孤儿轮次关闭标记，用户视角的“完成”不含它）。
   */
  reasons: ['completed', 'aborted', 'blocked', 'error', 'max-tokens'],
  /** 跳过子代理会话：子孙会话由父会话编排，逐轮提醒是噪音。 */
  skipSubagents: true,
  /** 系统消息附带轮次用时。 */
  includeDuration: true,
  /** 系统消息附带 token 用量。 */
  includeUsage: true,
}

/** 设置面板可见字段的默认值（与 Config 同构；仓库里的 schema 默认值与此一致）。 */
const DEFAULT_SETTINGS = {
  language: 'zh',
  templates: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
  titleTemplate: '',
  includeDuration: true,
  includeUsage: true,
  skipSubagents: true,
}

/** 从任意输入规整为设置形状（容忍缺失/多余字段）。 */
function sanitizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const templatesRaw = src.templates && typeof src.templates === 'object' ? src.templates : {}
  const templates = { ...DEFAULT_SETTINGS.templates }
  for (const key of Object.keys(templates)) {
    if (typeof templatesRaw[key] === 'string') templates[key] = templatesRaw[key]
  }
  return {
    language: ['zh', 'zh-tw', 'en', 'ja', 'ko'].includes(src.language) ? src.language : 'zh',
    templates,
    titleTemplate: typeof src.titleTemplate === 'string' ? src.titleTemplate : '',
    includeDuration: typeof src.includeDuration === 'boolean' ? src.includeDuration : true,
    includeUsage: typeof src.includeUsage === 'boolean' ? src.includeUsage : true,
    skipSubagents: typeof src.skipSubagents === 'boolean' ? src.skipSubagents : true,
  }
}

/**
 * 插件入口。
 * @param {import('cordis').Context} ctx
 * @param {Partial<typeof DEFAULT_OPTIONS>} [config]
 */
export const inject = ['settings']

export function apply(ctx, config = {}) {
  const options = { ...DEFAULT_OPTIONS, ...config }
  const reasons = new Set(Array.isArray(options.reasons) ? options.reasons : DEFAULT_OPTIONS.reasons)
  const tracker = createTurnTracker()
  let settings = DEFAULT_SETTINGS
  let projRegistry = null // sessionProjections 服务（非注入可选依赖，经 ctx.inject 捕获）

  // 官方设置命名空间：设置面板（设置 → 插件）可编辑；user 层持久化在 settings 文档。
  // 重试兜底：热重载时旧 fiber 注销与新 fiber 注册存在竞态，register 可能因
  // duplicate 被拒——短暂重试直至成功（生产无重载时一次即中）。
  try {
    const Schema = HUB_REQUIRE('@deepseek-ai/schemastery')
    const schema = Schema.object({
      language: Schema.union(['zh', 'zh-tw', 'en', 'ja', 'ko']).default('zh'),
      templates: Schema.object({
        completed: Schema.string().default(''),
        error: Schema.string().default(''),
        aborted: Schema.string().default(''),
        blocked: Schema.string().default(''),
        'max-tokens': Schema.string().default(''),
      }),
      titleTemplate: Schema.string().default(''),
      includeDuration: Schema.boolean().default(true),
      includeUsage: Schema.boolean().default(true),
      skipSubagents: Schema.boolean().default(true),
    })
    let attempts = 0
    const tryRegister = () => {
      try {
        const scope = ctx.settings.register(SETTINGS_NS, schema, { applies: 'live' })
        settings = sanitizeSettings(scope.get())
        scope.watch((next) => {
          settings = sanitizeSettings(next)
          fileLog(`settings updated: ${JSON.stringify({ language: settings.language, templates: Object.fromEntries(Object.entries(settings.templates).filter(([, v]) => v)) })}`)
        })
        fileLog('settings namespace registered')
      } catch (err) {
        if (attempts < 8) {
          attempts += 1
          setTimeout(tryRegister, 400 * attempts)
          fileLog(`settings register retry ${attempts}: ${err?.message ?? err}`)
        } else {
          warn(ctx, `设置命名空间注册失败（使用默认值）: ${err?.message ?? err}`)
          fileLog(`settings register FAILED after ${attempts} attempts: ${err?.message ?? err}`)
        }
      }
    }
    tryRegister()
  } catch (err) {
    warn(ctx, `设置依赖加载失败: ${err?.message ?? err}`)
    fileLog(`settings deps load FAILED: ${err?.message ?? err}`)
  }

  // 会话投影：把每个会话「最近的系统消息全文」注册为一个投影单元（key =
  // session-complete-notify）。宿主会对**所有会话**（含后台/未打开窗口的）
  // 推送该值 → 客户端推送正文因此跨会话一致，不再依赖事件窗口是否打开。
  try {
    const z = HUB_REQUIRE('zod')
    if (typeof ctx.inject === 'function') {
      ctx.inject(['sessionProjections'], (scoped) => {
        // 说明：注入器（dsh-super-injector）为插件提供的是二级上下文的注册表
        // 实例，与 host 对客户端推送/列表快照所用的实例可能不同；优先取
        // ctx.root.get（最靠近宿主根的一份），拿不到时回退注入实例。
        // 只注册进注入实例时，客户端可能读不到本投影单元 → 后台会话推送正文
        // 走降级路径（详情见会话内系统消息），属尽力而为，不影响会话内系统消息。
        const rootRegistry = (typeof ctx.root?.get === 'function' && ctx.root.get('sessionProjections')) || scoped.sessionProjections
        projRegistry = rootRegistry
        try {
          rootRegistry.register({
            key: SETTINGS_NS,
            schema: z.string(),
            init: () => '',
            apply: (state, event) => {
              if (event.type !== 'user/message') return state
              const src = event.data?.source ?? {}
              if (src.kind !== 'plugin' || src.plugin !== PLUGIN_ID) return state
              const text = ((event.data?.content ?? []).map((b) => b?.text ?? '')).join('').trim()
              return text || state
            },
            view: (state) => state,
            stateVersion: 1,
          })
          fileLog('session-projections unit registered (key=session-complete-notify)')
        } catch (err) {
          warn(ctx, `投影单元注册失败: ${err?.message ?? err}`)
        }
      })
    }
  } catch (err) {
    warn(ctx, `投影依赖加载失败: ${err?.message ?? err}`)
  }

  ctx.on('session/event', (session, event) => {
    switch (event.type) {
      case 'turn/start':
        tracker.start(`${session.id}:${event.data.turn}`, event.time)
        return
      case 'assistant/message':
        tracker.addUsage(`${session.id}:${event.data.turn}`, event.data.usage)
        return
      case 'turn/end': {
        const key = `${session.id}:${event.data.turn}`
        const state = tracker.end(key, event.time)
        const kind = event.data.reason?.kind
        if (!reasons.has(kind)) return
        if (isSubagentSession(session)) return // 默认跳过子代理会话（子代理由父会话编排）
        // 官方投影口径：tokenUsage（缓存命中率）+ sessionStats（tok/s 生成速度）
        // 与 dsh-web-ui 状态栏同源；投影由宿主维护，无插件内存状态，重载也不丢。
        // 用户以「标签是否插入」控制显示（用量/用时无独立开关）。
        let cacheValue
        let tpsValue
        let titleValue = ''
        try {
          if (projRegistry) {
            const snap = projRegistry.snapshot(session)
            const usage = snap?.values?.tokenUsage
            const stats = snap?.values?.sessionStats
            cacheValue = officialCacheRate(usage)
            tpsValue = officialTps(stats)
            titleValue = typeof snap?.values?.title === 'string' ? snap.values.title : ''
          }
        } catch (projErr) {
          warn(ctx, `投影快照读取失败: ${projErr?.message ?? projErr}`)
        }
        const notice = buildNotice(kind, event.data.reason, {
          ...state,
          includeDuration: true, // 标签即开关：{duration} 插了才显示
          includeUsage: true, // 标签即开关：{usage}/{cache}/{tps} 插了才显示
          cacheValue,
          tpsValue,
          titleValue,
        }, { language: settings.language, templates: settings.templates })
        // 边界约束：session/event 观察者回调运行在 turn/end 那次 append 的
        // 发布边界之内（dsh-session 在 dispatch 前 set entry.appending，
        // finally 中复位），此时同步 append 会被拒绝：
        //   "session append cannot reenter while another append is being published"
        // 推迟到微任务——微任务队列在本次同步栈（含 finally 复位）之后才跑。
        queueMicrotask(() => appendNotice(ctx, session, notice))
        return
      }
      default:
        return
    }
  })
}

/** 把系统消息追加进会话日志（失败只记日志，绝不抛出破坏 event 火线）。 */
function appendNotice(ctx, session, notice) {
  try {
    session.append(
      'user/message',
      {
        id: newId(),
        role: 'user',
        content: [{ type: 'text', text: notice.text }],
        source: { kind: 'plugin', plugin: PLUGIN_ID, form: 'notice', summary: notice.summary },
      },
      { surfaceOp: 'append' },
    )
  } catch (err) {
    warn(ctx, `追加系统消息失败: ${err?.message ?? String(err)}`)
    fileLog(`追加失败 ${session.id}: ${err?.stack ?? err}`)
  }
}

/** 追加失败时落一个调试文件（~/.dsh/session-complete-notify.log），便于排查。 */
function fileLog(line) {
  try {
    appendFileSync(join(homedir(), '.dsh', 'session-complete-notify.log'), `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch {
    /* 尽力而为 */
  }
}

/** crypto.randomUUID（Node 18+ 全局存在；旧环境回退到时间戳+随机）。 */
function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 日志上报（ctx.logger 缺失时落到 console.warn）。 */
function warn(ctx, message) {
  try {
    const logger = ctx.logger
    if (logger && typeof logger.warn === 'function') logger.warn(`[${PLUGIN_ID}] ${message}`)
    else console.warn(`[${PLUGIN_ID}] ${message}`)
  } catch {
    /* 上报是尽力而为 */
  }
}
