<div align="center">

# dsh-session-notify

**DSH（DeepSeek Harness）会话完成提醒插件 —— 每一轮结束，让完成状态主动找你，而不是你盯着屏幕等。**

[![npm version](https://img.shields.io/npm/v/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![npm downloads](https://img.shields.io/npm/dm/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![license](https://img.shields.io/npm/l/@telosmaylx/dsh-session-notify)](./LICENSE)
[![node](https://img.shields.io/node/v/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![DSH](https://img.shields.io/badge/DSH-Web%20Profile-4D6BFE)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/TelosmaYLX/dsh-session-notify/pulls)

*在会话日志写入可折叠的系统提示行（随 JSONL 持久化、恢复/回放可见），并推送浏览器系统通知 + 页内 toast。内置 5 种语言、可视化文案模板编辑器、自定义预设库，缓存命中率与生成速度与官方状态栏同口径。*

</div>

---

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
- [通知行为](#通知行为)
  - [什么触发提醒](#什么触发提醒)
  - [推送正文从哪来](#推送正文从哪来)
  - [通知示例](#通知示例)
  - [通知权限](#通知权限)
- [配置](#配置)
  - [设置面板（UI 配置）](#设置面板ui-配置)
  - [文案模板与占位符](#文案模板与占位符)
  - [预设系统](#预设系统)
  - [宿主配置项](#宿主配置项)
- [工作原理](#工作原理)
- [项目结构](#项目结构)
- [开发与调试](#开发与调试)
- [FAQ](#faq)
- [更新日志](#更新日志)
- [贡献](#贡献)
- [相关链接](#相关链接)
- [许可证](#许可证)

---

## 功能特性

### 📝 三通道提醒，一条不漏

| 通道 | 形式 | 说明 |
| --- | --- | --- |
| **会话内系统消息** | 可折叠提示行 | 每轮结束把「会话已完成 / 出错 / 被阻塞…（用时 / 消耗 / 缓存命中 / 速度 / 错误详情）」作为**插件来源**的系统消息追加进会话日志。Web UI 渲染为可折叠行，随 JSONL 落盘，**恢复 / 回放会话后依然可见**。 |
| **浏览器系统通知** | Web Notification | 原生弹窗。每次完成事件使用**独立 `tag`**（`dsh-session-notify:<timestamp>`）——不与前一次互相替换，也不被折叠成一个分组条目；点击通知聚焦回窗口。 |
| **页内 toast** | 右下角浮动弹窗 | **永远展示**的保底通道：系统通知被平台静默 / 权限拒绝 / 环境不支持时依然有可见反馈；同屏最多 3 条（超出移除最旧）、10 秒自动消失、点击关闭。 |

### 🖥️ 后台会话全覆盖

- 宿主为**所有会话**（含后台 / 未打开窗口的）维护「最近一条通知正文」的会话投影单元（key = `session-complete-notify`），推送正文跨会话一致——**不依赖你恰好开着那个窗口**。
- 客户端从会话列表快照观测所有会话的 `running` 位，`true → false` 边沿即触发推送，与官方 sidebar 提醒同策略（首次观测只记录基线，已在 idle 的会话不补发）。

### 🌐 可定制到每一句话

- **5 种语言**：简体中文 / 繁體中文 / English / 日本語 / 한국어——通知文案、时长/用量措辞、设置面板界面**全部随语言切换**（切换即时重渲染）。
- **可视化模板编辑器**（Chip 胶囊编辑器）：动态信息渲染为**内联胶囊**（`{duration}` 等占位符代码永不露出）、「＋ 插入信息」在**光标处**插入（支持插到文字中间）、点击胶囊移除、每栏带**实时预览**（信息以示例值流入正文）。
- **预设系统**：内置「默认」预设；当前配置可另存为**自定义预设**（localStorage 持久化），支持自动编号的未命名预设（`未命名`、`未命名 2`…）、「来自：xxx · 已修改」来源指示、删除预设。
- **推送标题模板**：`{title}` 引用会话标题，留空则直接用会话标题。

### 📊 与官方口径同源

- **缓存命中率**取自官方 `tokenUsage` 投影（缓存读 /（未缓存输入 + 缓存读 + 缓存写））。
- **生成速度**取自官方 `sessionStats` 投影（输出 token ÷ 解码耗时）。
- 两者**与 dsh-web-ui 状态栏完全同口径**，不含排队 / 准备 / 工具时间；投影不可用或数据未就绪时自动退回本地用量聚合估算。

### 🛡️ 工程质量

- **只响应「实时」事件**：resume / replay 不重放旧通知，加载会话不刷屏。
- **自免疫循环**：追加的消息类型（`user/message`）与自身监听目标（`turn/*`）不相交。
- **零外部依赖**：宿主平面零裸 import，UserMessage 按 `dsh-llm` 的 `createUserMessage` 契约手工构造；纯逻辑层（`lib/core.js`）可独立测试。
- **Cordis effect 纪律**：重试定时器包装 `ctx.effect()` 并返回 `clearTimeout` disposer、注册随 fiber 卸载自动撤销，HMR 热重载安全。
- **安装即挂载**：声明官方 `dsh.bundle` manifest，`dsh plugin add` 一条命令装完即用，无需手写 patch。

---

## 环境要求

| 依赖 | 要求 |
| --- | --- |
| DSH（DeepSeek Harness） | Web profile 部署；官方 base bundle 默认包含 `@deepseek-ai/dsh-settings`（设置命名空间）与 session-projection（投影），无需额外配置 |
| cordis | `>=4.0.0-rc <5`（peer dependency） |
| Node.js | `>=22`（宿主侧） |
| 浏览器 | 支持 Web Notification 则有系统通知；不支持 / 权限拒绝 / 被静默时 toast 兜底 |

---

## 安装

> ⚠️ **裸 `npm install` 只会安装依赖，不会注册插件**——这是 DSH 官方设计（"npm install only adds the dependency; it does not register the plugin"）。自动挂载的唯一官方途径是 `dsh plugin add`：它读取包内 `dsh.bundle` manifest（本插件自 0.1.3 起声明，指向仓库根 `cordis.patch.yml`）并自动应用。

### 方式一：`dsh plugin add`（推荐，一条命令自动挂载）

```bash
dsh plugin --profile web add @telosmaylx/dsh-session-notify
```

安装包的同时自动应用 `cordis.patch.yml`，把插件挂载进 profile 装配（host 事件订阅 + client 启动图注入）。装完**刷新浏览器页面**即可。

### 方式二：GitHub 仓库

```bash
# 在 Web GUI 会话中执行
dev_install_package github=TelosmaYLX/dsh-session-notify
# 或
dsh plugin add github:TelosmaYLX/dsh-session-notify
```

### 方式三：npm 包（下载 tgz 解压后本地安装）

```bash
npm pack @telosmaylx/dsh-session-notify
dev_install_package dir=</解压/目录>
```

### 方式四：手动 cordis patch（等价，不依赖安装器）

在 `~/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: dsh-session-notify
      name: '@telosmaylx/dsh-session-notify'
      config: {}
```

> 装配要求：`@deepseek-ai/dsh-settings`（设置命名空间）、`@deepseek-ai/dsh-session-projection`（投影）在部署中启用——官方 base bundle 默认包含。安装后**刷新浏览器页面**一次（客户端 bundle 通过 `__DSH_BOOT__` 启动图注入）。

---

## 快速开始

1. 按上面任一方式安装并刷新页面。
2. 发起任意一轮对话，等它结束——右下角弹出 toast、浏览器弹系统通知、会话日志里出现可折叠的系统提示行：

   ```
   会话已完成（用时 1 分 12 秒，消耗 1,240 输入 / 3,560 输出，缓存命中 96.5%，92 tok/s）。
   ```

3. 首次收到完成事件时，浏览器会请求通知权限（**每页只问一次**）；允许后后续完成都有系统通知。
4. 打开 **设置 → 插件 → 会话完成提醒**：切换语言、编辑文案模板、另存预设。保存后点「点击刷新」让两侧（宿主 + 客户端）重新读取，新语言 / 模板即生效。

---

## 通知行为

### 什么触发提醒

每轮对话结束（`turn/end`）时按结束原因判断，命中白名单即提醒：

| 结束原因 | 含义 | 默认提醒 |
| --- | --- | --- |
| `completed` | 会话正常完成 | ✅ |
| `aborted` | 会话中止 | ✅ |
| `blocked` | 会话被阻塞 | ✅ |
| `error` | 会话出错（附错误详情，超长截断） | ✅ |
| `max-tokens` | 达到输出 token 上限 | ✅ |
| `interrupted` | 中断（崩溃恢复后由持久化后端补写的孤儿轮次关闭标记） | ❌ 默认排除，可配置加入 |

**子代理会话默认跳过**（`header.origin === 'subagent'` 或 `delegationDepth > 0`）——子代理由父会话编排，逐轮提醒是噪音；可在宿主配置关闭跳过。

### 推送正文从哪来

客户端在会话列表观测到 `running: true → false` 边沿时推送，正文按以下优先级获取（最长轮询 6 秒，400ms 间隔）：

1. **宿主投影**（`session-complete-notify` key）——每个会话都有，**后台会话同样拿到全文**；
2. **会话事件窗口里的 notice 节点**（`kind=context` + `form=notice`）——正在查看的会话，落盘后立即可用；
3. **降级**——「详情见会话内系统消息」+ 工作区信息（`cwd` 最后一段）。

### 通知示例

默认文案（简体中文）：

```
✅ 会话已完成（用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出，缓存命中 96.5%，92 tok/s）。
⛔ 会话出错：connection timeout（用时 12 秒）。
🚫 会话达到输出上限（用时 2 分 10 秒，消耗 1,240 输入 / 4,096 输出）。
```

自定义模板示例（在设置面板编辑）：

```
{title} 干完了！用时 {duration}，跑了 {usage}，速度 {tps}
```

### 通知权限

- 权限状态为 `default`（未决定）时：**每页加载只发起一次授权请求**，后续完成事件不再触发询问；
- `granted`：每次完成都发系统通知（独立 tag，互不覆盖）；
- `denied` 或环境不支持：仅 toast（永远展示，保底可见）。

---

## 配置

绝大多数配置在 **DSH Web UI → 设置 → 插件 → 会话完成提醒** 面板完成（保存后点「点击刷新」生效）。仅「触发原因白名单」「跳过子代理」两项在宿主 `cordis.patch.yml` 的 `config` 中配置。

### 设置面板（UI 配置）

面板在官方「设置 → 插件」面板中注册（`settings.plugin.item` keyed slot，key = `session-complete-notify`），样式逐值复刻原生插件卡片（12px 圆角、展开/收起、旋转 chevron、footer 状态位 + 弃置 ghost + 主色保存按钮）：

| 区域 | 内容 |
| --- | --- |
| **预设** | 下拉选择内置 / 自定义预设；「新增」把当前配置另存为自定义预设；当前预设可「删除」 |
| **语言** | 5 种语言单选，切换即时重渲染整个面板 |
| **推送标题** | `{title}` 引用会话标题，留空则直接用会话标题 |
| **模板 × 5** | 每条结束原因（完成/出错/中止/阻塞/输出上限）独立一个 Chip 编辑器：文字 + 内联信息胶囊，光标处插入 / 点击移除 / 实时预览 |
| **跳过子代理会话** | 复选框（保存时一并写入设置文档） |
| **保存** | 写入宿主设置文档（language / templates / titleTemplate）；保存后显示「点击刷新」链接 |

> 说明：面板中「跳过子代理会话」复选框保存的是设置文档中的布尔值；宿主 `cordis.patch.yml` 的 `config.skipSubagents` 是其启动默认值，两者任一为真即跳过。

### 文案模板与占位符

设置面板中每条原因独立一个模板输入框，**标签即开关**——在模板里插入对应信息标签，该项数据才会显示：

| 占位符 | 含义 | 示例值 |
| --- | --- | --- |
| `{title}` | 会话标题（推送标题模板也可用） | `重构登录模块` |
| `{duration}` | 本轮用时（`turn/start` 起表 → `turn/end` 结束） | `1 分 12 秒` / `3m25s` |
| `{usage}` | token 消耗（输入 = 未缓存 + 缓存读 + 缓存写） | `1,240 输入 / 3,560 输出` |
| `{error}` | 错误信息（无错误时显示 `none`；单行化、≤80 字符） | `connection timeout` |
| `{cache}` | 缓存命中率（官方投影口径，无数据为空） | `96.5%` |
| `{tps}` | 生成速度（官方投影口径，无数据为空） | `92 tok/s` |
| `{label}` | ⚠️ **已废弃**——渲染时自动剥除，旧模板兼容（插入菜单已移除） | — |

模板留空 = 使用内置默认文案（自动带用时与消耗）。折叠行 `summary` 与正文同源（渲染结果截断至 ≤120 字符）——只看折叠行的用户也能看到真实标题与用时/消耗。

### 预设系统

- **内置预设**：仅「默认」（作为基线，其余以自定义预设承载）。
- **自定义预设**：保存在 `localStorage`（key = `dsh-scn-custom-presets`）：
  - 「新增」→ 命名保存为自定义预设；保存后可「修改」自动同步、「删除」移除；
  - **自动编号的未命名预设**：从「默认/空白」直接保存时，自动生成 `未命名`、`未命名 2`、`未命名 3`…（编号取当前最大 + 1）；
  - 表单显示「来自：xxx · 已修改」来源指示（来自预设但内容已改动时）。
- **保存即同步**：保存时若表单来源是自定义预设，则更新该预设；否则新建/继续编号未命名预设。

### 宿主配置项

```yaml
- insert:
    - id: dsh-session-notify
      name: '@telosmaylx/dsh-session-notify'
      config:
        reasons: [completed, aborted, blocked, error, max-tokens]
        skipSubagents: true
```

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `reasons` | `string[]` | `[completed, aborted, blocked, error, max-tokens]` | 触发提醒的 `turn/end` 原因白名单 |
| `skipSubagents` | `boolean` | `true` | 跳过子代理会话（`origin=subagent` 或 `delegationDepth>0`） |

---

## 工作原理

插件分**宿主平面**（Node）与**客户端平面**（浏览器），中间靠会话日志（JSONL）与官方会话投影衔接：

```
┌─────────────────── 宿主平面（lib/index.js，Node）──────────────────┐
│                                                                     │
│  session/event 火线                                                 │
│   ├─ turn/start        → tracker 起表（key: sessionId:turn）        │
│   ├─ assistant/message → 累加该轮 token 用量                        │
│   └─ turn/end          → reason.kind ∈ reasons ？                   │
│                            ├─ 子代理会话？跳过                       │
│                            ├─ 读官方投影：cache / tps / title        │
│                            ├─ 按语言+模板构建通知（summary ≤120 字） │
│                            └─ queueMicrotask 追加系统消息            │
│                                 （避开 append 重入窗口）             │
│                                                                     │
│  settings.register   → 官方「设置 → 插件」命名空间（失败退避重试）   │
│  sessionProjections  → 注册投影单元（key=session-complete-notify）  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ user/message (source: plugin, form: notice)
                               ▼  JSONL 持久化 + 投影推送
┌─────────────────── 客户端平面（lib/client.js，浏览器）──────────────┐
│                                                                     │
│  会话列表订阅：running true → false 边沿 → pushCompletion            │
│   ├─ 取正文：投影 → 事件窗口 notice → 降级（轮询 ≤6s）               │
│   ├─ Web Notification（独立 tag，点击聚焦）                          │
│   └─ 页内 toast（永远展示，≤3 条，10s 自动消失）                     │
│                                                                     │
│  slots.inject('settings.plugin.item') → 设置卡片（预设/语言/模板）   │
└─────────────────────────────────────────────────────────────────────┘
```

### 关键设计决策

- **不重放**：只处理实时事件，resume / replay 不会补发历史通知。
- **无自我循环**：插件追加 `user/message`，自身只监听 `turn/*`，事件类型不相交。
- **零外部 import**：插件从仓库目录以 realpath 加载，`@deepseek-ai/*` 无法裸解析——宿主平面用 `createRequire` 锚定 profile 共享依赖枢纽（`.dsh/profiles/node_modules`）取 `schemastery`（设置 schema）与 `zod`（投影 schema）；UserMessage 按 `dsh-llm` 契约手工构造（`id = crypto.randomUUID()`，deep-freeze 由 `session.append` 的 adopt 快照阶段完成）。
- **append 重入规避**：`session/event` 观察者回调运行在 `turn/end` 那次 append 的发布边界之内（dsh-session 在 dispatch 前置 `entry.appending`、finally 复位），同步 append 会被拒绝——因此推迟到 `queueMicrotask`（微任务在本次同步栈含 finally 复位之后才执行）。
- **effect 纪律**：设置注册的退避重试定时器包装在 `ctx.effect()` 中并返回 `clearTimeout` disposer——插件在重试窗口内被卸载 / 热重载时定时器随 fiber 拆除，不会对已释放的 ctx 触发注册（极老环境无 `ctx.effect` API 时退化为裸定时器 + ctx 已拆除兜底捕获）。
- **HMR 安全**：`core.js` 导入带 `?v=1` 缓存破坏（HMR 重载按 URL 键控）；设置注册遇到热重载竞态（duplicate）时自动退避重试（最多 8 次、400ms×attempts）。
- **投影注册双轨**：优先 `ctx.root.get('sessionProjections')`（最靠近宿主根的一份），拿不到时回退注入实例；只注册进注入实例时客户端可能读不到投影单元 → 推送正文走降级路径，属尽力而为，不影响会话内系统消息。

---

## 项目结构

```
dsh-session-notify/
├── lib/
│   ├── index.js      # 宿主平面（Node）：session/event 订阅 → 系统消息落盘；
│   │                 #   settings 命名空间注册（schemastery schema，退避重试）；
│   │                 #   sessionProjections 投影单元（后台会话推送正文）
│   ├── core.js       # 纯逻辑层（零依赖，可独立测试）：轮次计时/用量聚合、
│   │                 #   5 语言文案表、时长/用量/缓存/速度格式化、
│   │                 #   模板渲染（{title}{duration}{usage}{error}{cache}{tps}）
│   └── client.js     # 浏览器平面：完成推送（系统通知 + toast）、
│                     #   设置卡片（Chip 模板编辑器 + 预设系统 + 实时预览）
├── scripts/
│   ├── build.sh                # 零构建：仅 node --check 语法校验
│   ├── verify-notice.mjs       # 校验会话日志落盘证据（zstd 多帧逐帧解压）
│   ├── probe-client.mjs        # 探针：客户端装配
│   ├── probe-client-e2e.mjs    # 探针：客户端端到端
│   ├── probe-card-render.mjs   # 探针：设置卡片渲染
│   ├── probe-settings-card.mjs # 探针：设置面板卡片
│   ├── probe-settings-check.mjs# 探针：设置面板检查
│   └── probe-diag-settings.mjs # 探针：settings 诊断
├── cordis.patch.yml  # dsh.bundle manifest——dsh plugin add 自动挂载的凭证
├── package.json      # dsh.bundle（patch）+ dsh.client（web 注入）双 manifest；
│                     #   exports: "." / "./client" / "./core"
├── LICENSE           # MIT
└── README.md         # 本文档
```

---

## 开发与调试

```bash
# 语法校验（零构建，prepublishOnly 同款检查）
npm run build

# 本地热装配（在 Web GUI 会话中执行，dir 换成克隆目录）
dev_install_package dir=</克隆目录>
```

### 调试入口

| 入口 | 内容 |
| --- | --- |
| `~/.dsh/session-complete-notify.log` | 宿主诊断日志：设置注册/重试/失败、投影注册、追加失败堆栈 |
| 浏览器 console `[dsh-session-notify-client]` | 客户端日志：权限状态、通知展示、设置保存 |
| `window.__dsch_notify_debug.readNotice(id)` | 手动读取指定会话的最新通知正文 |
| `window.__dsch_notify_debug.snapshotDebug(id)` | 会话尾部节点类型 + notice 数量 + 最近正文（前 200 字） |
| `node scripts/verify-notice.mjs <session.jsonl.zstd>` | 离线校验：解出会话日志中所有 plugin-source 事件与 turn/end 尾部序列（不传路径则自动选 `~/.dsh/sessions` 下最新会话） |

### 发布

```bash
# 发布前自动执行 prepublishOnly（语法校验）
npm publish --registry=https://registry.npmjs.org --access public
```

---

## FAQ

<details>
<summary><b>npm install 之后为什么不自动挂载？</b></summary>

这是 DSH 官方设计：`npm install` 只把包装进依赖树，不注册插件。自动挂载的唯一途径是 `dsh plugin add`——它读取包内 `dsh.bundle` manifest（本插件自 0.1.3 起声明）并自动应用 `cordis.patch.yml`。参见[安装](#安装)。

</details>

<details>
<summary><b>为什么「中断」（interrupted）不提醒？</b></summary>

`interrupted` 是崩溃恢复后由持久化后端补写的孤儿轮次关闭标记，用户视角的「完成」不包含它（否则恢复会话会刷一屏误报）。确有需要可在宿主配置 `reasons` 中加入。

</details>

<details>
<summary><b>后台会话（没打开窗口的）也会推送吗？</b></summary>

会。客户端从会话列表快照观测所有会话的 `running` 边沿；正文优先取宿主投影——宿主为所有会话（含后台）维护投影单元，因此推送正文跨会话一致。投影不可用时降级为事件窗口 / 工作区信息。

</details>

<details>
<summary><b>保存设置后为什么提示刷新页面？</b></summary>

宿主在注册命名空间时读取一次设置，客户端 bundle 在页面加载时装配。保存后点「点击刷新」让两侧重新读取，新语言 / 模板即生效。

</details>

<details>
<summary><b>缓存命中率 / 速度数据从哪来？为什么有时是空的？</b></summary>

来自官方 `sessionProjections`（`tokenUsage` / `sessionStats`），与 dsh-web-ui 状态栏同口径。宿主读取投影快照失败或数据尚未就绪时，退回本地用量聚合估算，仍无数据则该项留空（标签插了也不显示）。

</details>

<details>
<summary><b>通知正文里的错误信息太长 / 有换行怎么办？</b></summary>

摘要行（折叠行）与错误详情都会单行化并截断（摘要 ≤120 字符、错误 ≤80 字符、标签内 ≤40 字符）。自定义模板中的 `{error}` 同样单行化，上限 80 字符，超长以 `…` 结尾。

</details>

<details>
<summary><b>可以自定义系统通知的图标 / 声音吗？</b></summary>

当前版本使用浏览器默认通知样式，不注入自定义图标 / 声音。toast 样式为固定深色卡片。如需这些能力欢迎提 Issue / PR。

</details>

---

## 更新日志

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| **0.1.3** | 2026-08-28 | 声明官方 `dsh.bundle` manifest（`dsh plugin add` 一条命令自动挂载）；settings 重试定时器改为 `ctx.effect()` 包装（Cordis effect 纪律）；安装文档重排 |
| 0.1.2 | 2026-08-27 | 包更名至 `@telosmaylx` scope（npm 用户名作用域） |
| 0.1.1 | 2026-08-27 | GitHub / npm 安装方式文档化 |
| 0.1.0 | 2026-08-26 | 初始版本：会话内系统消息 + 浏览器推送 + 官方设置面板 |

---

## 贡献

欢迎 Issue 与 PR：

1. Fork → 新建分支（`feat/xxx`）
2. 改动后跑 `npm run build`（语法校验）
3. 提交 PR，说明动机与验证方式

提交前请遵守 [Cordis 开发教程](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial) 纪律：

- Cordis 之外的资源（定时器、订阅、watcher）必须包装在 `ctx.effect()` 中并返回 disposer；
- 配置项显式 `id` 防止编辑漂移；
- 插件须声明 `dsh.bundle` manifest 才能被 `dsh plugin add` 识别安装。

---

## 相关链接

- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) —— DSH 插件精选列表（投稿规范：`dsh.bundle` 是安装唯一凭证）
- [Cordis 开发教程](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial) —— 插件开发全流程（01-07 章，本地副本见 `dsh-docs/cordis-tutorial/`）
- [npm 包主页](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
- [GitHub 仓库](https://github.com/TelosmaYLX/dsh-session-notify)

---

## 许可证

[MIT](./LICENSE) © dsh-session-notify contributors
