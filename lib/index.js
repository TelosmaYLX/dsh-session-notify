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
 * 装配：package.json 声明官方 dsh.bundle manifest（patch → 仓库根 cordis.patch.yml），
 *   一条命令安装即自动挂载：
 *     dsh plugin --profile web add @telosmaylx/dsh-session-notify
 *   也可手动在 ~/.dsh/profiles/web/cordis.patch.yml 追加（等价）：
 *     - insert:
 *         - id: dsh-session-notify
 *           name: '@telosmaylx/dsh-session-notify'
 *           config:
 *             reasons: [completed, aborted, blocked, error, max-tokens]
 *             skipSubagents: true
 *             includeDuration: true
 *             includeUsage: true
 */

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { createTurnTracker, buildNotice, isSubagentSession, officialCacheRate, officialTps, renderTitle } from './core.js?v=1' // v=1: 缓存破坏——HMR 重载按 URL 键控

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
  titleTemplate: '', // 空 = 未自定义全局标题，各原因使用语言默认标题（如「任务已完成」「任务出错」）
  /** 按原因定制推送标题（空 = 用 titleTemplate 或语言默认标题）。 */
  titleTemplates: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
  includeDuration: true,
  includeUsage: true,
  skipSubagents: true,
  /** 推送通道：dual=系统通知+页内提示（默认）；system=仅系统通知；toast=仅页内提示。 */
  pushMode: 'dual',
  /** 系统通知大图（Notification image，https URL）：显示在通知卡片正文中/下方；空 = 不显示。 */
  imageUrl: '',
  /** 系统通知图标（Notification icon，https URL）：空 = 浏览器默认（站点图标）。 */
  iconUrl: '',
  /** 按原因的自定义通知大图（{image} 标签开关对应的数据，本地文件压缩后的 data URI）。 */
  images: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
}

/** 从任意输入规整为设置形状（容忍缺失/多余字段）。 */
function sanitizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const templatesRaw = src.templates && typeof src.templates === 'object' ? src.templates : {}
  const templates = { ...DEFAULT_SETTINGS.templates }
  for (const key of Object.keys(templates)) {
    if (typeof templatesRaw[key] === 'string') templates[key] = templatesRaw[key]
  }
  const titlesRaw = src.titleTemplates && typeof src.titleTemplates === 'object' ? src.titleTemplates : {}
  const titleTemplates = { ...DEFAULT_SETTINGS.titleTemplates }
  for (const key of Object.keys(titleTemplates)) {
    if (typeof titlesRaw[key] === 'string') titleTemplates[key] = titlesRaw[key]
  }
  const imagesRaw = src.images && typeof src.images === 'object' ? src.images : {}
  const images = { ...DEFAULT_SETTINGS.images }
  for (const key of Object.keys(images)) {
    if (typeof imagesRaw[key] === 'string') images[key] = imagesRaw[key]
  }
  return {
    language: ['zh', 'zh-tw', 'en', 'ja', 'ko'].includes(src.language) ? src.language : 'zh',
    templates,
    titleTemplate: typeof src.titleTemplate === 'string' ? src.titleTemplate : '',
    titleTemplates,
    includeDuration: typeof src.includeDuration === 'boolean' ? src.includeDuration : true,
    includeUsage: typeof src.includeUsage === 'boolean' ? src.includeUsage : true,
    skipSubagents: typeof src.skipSubagents === 'boolean' ? src.skipSubagents : true,
    pushMode: ['dual', 'system', 'toast'].includes(src.pushMode) ? src.pushMode : 'dual',
    imageUrl: typeof src.imageUrl === 'string' ? src.imageUrl : '',
    iconUrl: typeof src.iconUrl === 'string' ? src.iconUrl : '',
    images,
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
  let disposed = false // 卸载/HMR 拆除标记：置位后不再追加通知

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
      titleTemplates: Schema.object({
        completed: Schema.string().default(''),
        error: Schema.string().default(''),
        aborted: Schema.string().default(''),
        blocked: Schema.string().default(''),
        'max-tokens': Schema.string().default(''),
      }),
      includeDuration: Schema.boolean().default(true),
      includeUsage: Schema.boolean().default(true),
      skipSubagents: Schema.boolean().default(true),
      pushMode: Schema.union(['dual', 'system', 'toast']).default('dual'),
      imageUrl: Schema.string().default(''),
      iconUrl: Schema.string().default(''),
      images: Schema.object({
        completed: Schema.string().default(''),
        error: Schema.string().default(''),
        aborted: Schema.string().default(''),
        blocked: Schema.string().default(''),
        'max-tokens': Schema.string().default(''),
      }),
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
          scheduleRetry(attempts)
          fileLog(`settings register retry ${attempts}: ${err?.message ?? err}`)
        } else {
          warn(ctx, `设置命名空间注册失败（使用默认值）: ${err?.message ?? err}`)
          fileLog(`settings register FAILED after ${attempts} attempts: ${err?.message ?? err}`)
        }
      }
    }
    // Cordis 教程第 2 章 effect 纪律：重试定时器是 Cordis 之外的资源，必须包装为
    // effect（返回 clearTimeout disposer）——插件在重试窗口内被卸载/热重载时，
    // 定时器随 fiber 拆除而取消，不再对已释放的 ctx 触发注册。
    const scheduleRetry = (attempt) => {
      try {
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => {
            const timer = setTimeout(tryRegister, 400 * attempt)
            return () => clearTimeout(timer)
          })
        } else {
          setTimeout(tryRegister, 400 * attempt) // 极老环境无 effect API，退化为旧行为
        }
      } catch {
        /* ctx 已拆除（卸载/HMR 替换）：放弃重试，避免未捕获异常 */
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
            // 投影值：{ kind: 结束原因, text: 系统消息全文, title: 该原因的推送标题（host 已渲染，含 {title} 替换）}
            schema: z.object({ kind: z.string(), text: z.string(), title: z.string() }),
            init: () => ({ kind: '', text: '', title: '' }),
            apply: (state, event) => {
              if (event.type !== 'user/message') return state
              const src = event.data?.source ?? {}
              if (src.kind !== 'plugin' || src.plugin !== PLUGIN_ID) return state
              const text = ((event.data?.content ?? []).map((b) => b?.text ?? '')).join('').trim()
              if (!text) return state
              return {
                kind: typeof src.reasonKind === 'string' ? src.reasonKind : state.kind,
                text,
                title: typeof src.titleText === 'string' && src.titleText ? src.titleText : state.title,
              }
            },
            view: (state) => state,
            stateVersion: 2, // 投影值从 string 升级为对象（kind/text/title）
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
        // 标题投影缺失时从会话自身兜底（header.title / title），确保默认文案能内嵌会话标题
        if (!titleValue) {
          const h = session?.header ?? {}
          titleValue = (typeof h.title === 'string' && h.title.trim()) ? h.title
            : (typeof session?.title === 'string' && session.title.trim()) ? session.title : ''
        }
        const notice = buildNotice(kind, event.data.reason, {
          ...state,
          includeDuration: true, // 标签即开关：{duration} 插了才显示
          includeUsage: true, // 标签即开关：{usage}/{cache}/{tps} 插了才显示
          cacheValue,
          tpsValue,
          titleValue,
        }, { language: settings.language, templates: settings.templates })
        // 推送标题按原因渲染：titleTemplates[kind] > titleTemplate > 语言默认（如「任务已完成」）
        const title = renderTitle(kind, { language: settings.language, titleTemplate: settings.titleTemplate, titleTemplates: settings.titleTemplates }, titleValue)
        // 边界约束：session/event 观察者回调运行在 turn/end 那次 append 的
        // 发布边界之内（dsh-session 在 dispatch 前 set entry.appending，
        // finally 中复位），此时同步 append 会被拒绝：
        //   "session append cannot reenter while another append is being published"
        // 推迟到微任务——微任务队列在本次同步栈（含 finally 复位）之后才跑。
        queueMicrotask(() => {
          if (disposed) return // 卸载窗口内已调度的微任务：fiber 已拆除，跳过追加
          appendNotice(ctx, session, notice, kind, title)
        })
        return
      }
      default:
        return
    }
  })

  // 卸载清理（Cordis 教程第 2 章生命周期纪律）：事件订阅 / settings scope /
  // 投影注入均为 Cordis 托管 effect，卸载时自动释放；这里只做插件自有状态的
  // 收尾——置 disposed 标志（抑制已调度的微任务追加）并落一条卸载日志。
  try {
    if (typeof ctx.on === 'function') {
      ctx.on('dispose', () => {
        disposed = true
        fileLog('plugin unloaded (host): pending appends suppressed')
      })
    }
  } catch {
    /* 极老环境无 dispose 事件：由 fiber 自然回收 */
  }
}

/** 把系统消息追加进会话日志（失败只记日志，绝不抛出破坏 event 火线）。 */
function appendNotice(ctx, session, notice, kind, title) {
  try {
    session.append(
      'user/message',
      {
        id: newId(),
        role: 'user',
        content: [{ type: 'text', text: notice.text }],
        source: {
          kind: 'plugin',
          plugin: PLUGIN_ID,
          form: 'notice',
          summary: notice.summary,
          reasonKind: typeof kind === 'string' ? kind : '', // 投影 apply 取用
          titleText: typeof title === 'string' ? title : '', // 投影 apply 取用（host 渲染好的推送标题）
        },
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
