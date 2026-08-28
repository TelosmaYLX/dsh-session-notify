# dsh-session-notify

**DeepSeek Harness plugin that notifies you when a session finishes** — a durable system message is appended into the session log (plugin-source notice, persisted to JSONL), and the browser gets a real push (Web Notification + toast). Which session, how long it took, tokens, cache-hit rate and generation speed — all customizable from the official settings panel.

- **Dual channel**: host system message + browser push (each notification has its own tag; toast always shows as a safety net)
- **Official settings panel** (`设置 → 插件配置 → 会话完成提醒`): preset library, title template, per-reason message templates with insertable tags, live preview
- **5 languages** (zh / zh-tw / en / ja / ko) for both the panel and the generated messages
- **Real metrics** from official projections: cache hit rate (`tokenUsage`), tok/s decode speed (`sessionStats`), session title (`title`) — same source as dsh-web-ui
- **Zero build deps**: hand-written ESM host + official `window.__ModuleLoader__` client bundle; verified end-to-end with headless Chrome probes included in `scripts/`

> 中文完整文档见下文。An English section follows the Chinese README below — see 功能特性/安装/使用/标签 tables for details.

> DeepSeek Harness 会话完成提醒插件：**会话完成时，在会话内写一条系统消息，并向浏览器推送通知**（哪个会话、耗时、token、缓存命中率、生成速度，全部可自定义）。

- ✅ 双通道提醒：**宿主系统消息**（写入会话日志，随 JSONL 持久化）+ **浏览器推送**（Web Notification + 页内 toast）
- ✅ 官方设置面板：**设置 → 插件配置 → 会话完成提醒**（预设 / 语言 / 标题模板 / 消息模板 / 标签插入）
- ✅ 5 语言界面与文案：简体中文 / 繁體中文 / English / 日本語 / 한국어
- ✅ 零外部依赖打包：宿主插件为手写 ESM（无构建步骤），客户端 bundle 为官方 `window.__ModuleLoader__` 契约
- ✅ 全链路实测：无头 Chrome 端到端验证（落盘 / 渲染 / 推送），仓库附带探针脚本

---

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 完成提醒 | 监听 `session/event` 火线，`turn/end`（`completed/aborted/blocked/error/max-tokens`）时触发 |
| 系统消息 | 以 plugin-source 的 `user/message`（`form: 'notice'`）写入会话日志：UI 渲染为可折叠系统行（折叠态即显示正文渲染结果，含 `{title}`/用时/消耗，截断至 120 字符），随 JSONL 持久化，resume/replay 可见 |
| 浏览器推送 | `running → idle` 边沿检测：Web Notification（每次独立 tag，不折叠）+ **toast 永远展示**（保底，同屏最多 3 条） |
| 详情指标 | 用时 / token 用量 / **缓存命中率** / **速度 tok/s** —— 数据来自官方投影（`tokenUsage`、`sessionStats`），与 dsh-web-ui 状态栏同源 |
| 会话标题 | `{title}` 标签：推送标题与消息正文都可插入会话标题（官方 `title` 投影） |
| 设置面板 | 预设库（默认 + 自定义预设自动管理 / 命名预设）、标题模板、5 字段消息模板、5 语言、标签插入（光标处）、实时预览 |
| 多语言 | 消息文案（标签/时长/用量/默认文案）+ 面板 UI 全量 i18n：`zh` `zh-tw` `en` `ja` `ko` |
| 子代理过滤 | 默认跳过子代理会话（子代理由父会话编排） |
| 投影同步 | 注册 `session-complete-notify` 投影单元：每个会话的最新通知全文推送到客户端，**后台会话同样有完整正文** |

---

## 安装

### 方式一：GitHub 仓库（发布后）

```bash
# 在 Web GUI 会话中执行
dev_install_package github=TelosmaYLX/dsh-session-notify    # 或 dsh plugin add github:TelosmaYLX/dsh-session-notify
```

### 方式二：npm 包（发布后）

```bash
npm install @telosma/dsh-session-notify    # 或从 npm 下载 tgz 解压
```

### 方式三：bundle 热装配（本地开发，dsh-super-injector）

```bash
# 在 Web GUI 会话中执行（dir 换成你的克隆目录）
dev_install_package dir=</你的插件目录>
```

### 方式四：cordis patch（重启后由 bundles 装配，与热装配双路径一致）

在 `~/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: dsh-session-notify
      name: '@telosma/dsh-session-notify'
      config: {}
```

> 装配要求：`@deepseek-ai/dsh-settings`（设置命名空间）、`@deepseek-ai/dsh-session-projection`（投影）在部署中启用（官方 base bundle 默认包含）。

安装后**刷新浏览器页面**一次（客户端 bundle 通过 `__DSH_BOOT__` 启动图注入）。

---

## 使用

1. 打开 **设置 → 插件配置 → 会话完成提醒**
2. 配置（见下）→ **保存** → 状态位提示 `已保存 ✓ · 刷新页面后生效` → 点击 **刷新**
3. 任一会话（顶部会话）完成时：
   - 会话尾部出现系统消息（文案 = 你的模板）
   - 右下角 toast 弹出（标题 = 你的标题模板 + 会话标题）
   - 授权后系统通知同步弹出

### 设置面板字段

| 字段 | 说明 |
| --- | --- |
| **预设（载入）** | 下拉显示当前应用的预设；选预设 = 载入其全部配置（语言 + 标题 + 5 模板）。内置仅「**默认**」 |
| **新增** | 将当前配置另存为**命名**自定义预设 |
| **修改 / 删除** | 选中自定义预设时出现：修改 = 当前表单写回该预设；删除 = 移除 |
| **语言** | 简体中文 / 繁體中文 / English / 日本語 / 한국어 —— 面板与消息文案即时切换 |
| **推送标题** | 占位符提示「留空则使用会话标题」；`{title}` 标签经「＋ 会话标题」插入，如 `【完成】{title}` |
| **模板 × 5** | 完成 / 出错 / 中止 / 阻塞 / 输出上限：文字 + 内联标签胶囊（点击 × 删除、＋ 光标处插入、全选可删）；空态直接展示默认文案（始终可编辑） |
| 预览 | 纯文本最终效果（示例值直出，无标签样式） |

### 标签（可插入信息）

| 标签 | 胶囊文字 | 内容 | 示例 |
| --- | --- | --- | --- |
| `{title}` | 会话标题 | 会话标题（官方 title 投影） | DeepSeek Harness 插件开发 |
| `{duration}` | 用时 | 本轮耗时（语言化格式） | 1 分 23 秒 / 1m23s |
| `{usage}` | 消耗 | 输入 / 输出 token | 1,600 输入 / 3,560 输出 |
| `{error}` | 错误 | 错误详情；无错误显示 `none` | 连接超时 |
| `{cache}` | 缓存命中 | 缓存命中率（官方 tokenUsage 四桶口径） | 96.5% |
| `{tps}` | 速度 TPS | 输出 token ÷ 解码耗时（官方 sessionStats 口径） | 115 tok/s |

### 预设模型（自动生命周期）

- **默认预设**：空模板 + 空标题（= 内置默认文案）
- **保存 = 自动落入一个预设**：
  - 来自自定义预设 → 更新它（修改即自动，无需手动按钮）
  - 来自默认/空白 → 新建 **未命名预设**；已存在则递增编号（未命名预设 2 / 3 …），从不覆盖旧的
  - 从未命名预设本身载入再改 → 更新该未命名预设
- 预设库持久化在浏览器 localStorage（`dsh-scn-custom-presets`）

---

## 工作原理

### 生命周期

```
用户会话 turn/end
   └─ host lib/index.js（session/event 监听）
        ├─ tracker：turn/start 起表，assistant/message 累计用量
        ├─ 官方投影快照：tokenUsage → 缓存命中率；sessionStats → tok/s；title → 会话标题
        ├─ buildNotice(kind, reason, 数据, {language, templates}) → 多语言/模板渲染
        ├─ queueMicrotask → session.append('user/message', plugin-notice, {surfaceOp:'append'})
        └─（投影单元自动更新：每个会话的最新通知全文）
   └─ client lib/client.js（sessions.list running→idle 边沿）
        ├─ 正文：投影（每个会话都有全文）→ 事件窗口 notice 节点 → 降级
        ├─ 标题：用户标题模板（{title} = 会话标题；留空 = 会话标题）
        └─ 通知：独立 tag（不折叠）+ toast 永远展示（保底）
```

### 关键设计取舍

| 取舍 | 说明 |
| --- | --- |
| 追加必须微任务延迟 | `session/event` 观察者回调运行在 `turn/end` 那次 append 的发布边界内，同步重入会被拒绝（`"session append cannot reenter…"`）——`queueMicrotask` 在边界复位后执行 |
| 指标不存插件内存 | 缓存命中/速度/标题取自官方投影（宿主维护、无内存状态，热重载不丢）——与 dsh-web-ui 状态栏同源 |
| 客户端零构建 | 手写 ESM；宿主经 `createRequire` 锚定 profile 共享依赖枢纽取 schemastery/zod（从仓库目录以 realpath 加载时裸导入不可用） |
| 双通道解耦 | 系统消息（宿主，持久）与 push（客户端，即时）各自独立；正文以投影通知全文为准保证跨会话一致 |
| 标签即开关 | 模板里插了标签就显示、不插就不显示（无独立开关） |
| 注册竞态兜底 | 设置命名空间注册遇 duplicate（热重载下的旧 fiber 注销竞态）自动退避重试 8 次并落盘日志 |

### 多语言

- **宿主消息**：标签、时长（`1 分 23 秒` / `1m23s` / `1分 23초`…）、用量措辞、默认文案骨架、错误分隔符随语言
- **面板 UI**：标题/字段/预设/按钮/提示/标签名/预览示例全量 i18n（约 45 串 × 5）

---

## 脚本（验证工具）

| 脚本 | 用途 |
| --- | --- |
| `scripts/verify-notice.mjs` | 解压多帧 zstd 会话日志，核验系统消息落盘（plugin-source notice）+ turn/end 触发点 |
| `scripts/probe-client.mjs` | 客户端激活冒烟（boot graph / 模块加载 / 报错） |
| `scripts/probe-client-e2e.mjs` | 端到端推送实测：无头 Chrome 等待真实完成事件，抓取 toast 内容（可钉会话窗口：`node scripts/probe-client-e2e.mjs 900000 <sessionId>`） |
| `scripts/probe-card-render.mjs` | 无头完整流程：设置 → 插件 → 卡片渲染 + 控制台错误 |
| `scripts/probe-settings-card.mjs` | 设置面板卡片检测（DOM 文本） |

---

## 项目结构

```
lib/index.js          # 宿主：事件订阅 / 计时 / 设置命名空间（5 语言 schema）/ 投影注册 / 通知构建 + 追加
lib/core.js           # 纯逻辑：计时/用量聚合/命中率/tps/多语言标签/模板渲染（可独立单测）
lib/client.js         # 浏览器：推送（通知 + toast）/ 设置卡片（ChipEditor + 预设库 + 标题模板）
scripts/build.sh      # 构建（node --check 校验手写 ESM）
scripts/*.mjs         # 验证/探针脚本（见上表）
```

## 开发提示

- 宿主热重载后会出现一次「用时 0 秒」：内存计时器随重载重置（下轮恢复；缓存命中/速度/标题来自投影不受影响）
- 设置保存后需刷新页面：宿主实时生效，但客户端 bundle 需整页加载
- 通知权限：首次完成时浏览器会请求（权限 `default` 只发起一次）；拒绝不影响 toast
- 发布包：`npm run build`（node --check）→ `npm pack` → `telosma-dsh-session-notify-*.tgz`

## License

MIT
