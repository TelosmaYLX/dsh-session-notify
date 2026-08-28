# dsh-session-notify

DeepSeek Harness 插件：**当会话（轮次）完成时，向该会话发送一条系统消息提醒用户**。

- 触发点：监听 `session/event` 火线中的 `turn/end`（`completed` / `aborted` / `blocked` / `error` / `max-tokens`，均可配置）
- 提醒形式：以 plugin-source 的 `user/message`（`form: 'notice'`）追加进会话日志 —— Web UI 渲染为**可折叠的系统提示行**，且随 JSONL 持久化，resume/replay 后依然可见
- 内容：轮次结束原因 + 用时 + token 用量（`assistant/message` 的 usage 逐轮累计）

## 原理

DSH 会话是事件日志（event-sourced）。插件订阅官方 `session/event` 火线：

| 事件 | 处理 |
| --- | --- |
| `turn/start` | 记下轮次开始时间（`event.time`） |
| `assistant/message` | 把该步 `usage` 并入本轮累计 |
| `turn/end` | 按 `reason.kind` 组装系统消息，**推迟到微任务**再 `session.append('user/message', …, { surfaceOp: 'append' })` |

> ⚠️ 为什么推迟：`session/event` 观察者回调运行在 `turn/end` 那次 append 的**发布边界内**（`dsh-session` 在分发观察者前设置 `entry.appending`，`finally` 才复位），同步重入 `session.append` 会被拒绝（`"session append cannot reenter while another append is being published"`）。`queueMicrotask` 使追加发生在本次同步栈（含边界复位）之后。

追加的 `user/message` 携带 `source: { kind: 'plugin', plugin: 'dsh-session-notify', form: 'notice', summary }`，
与官方 cron 通知同款形态：UI 显示为带来源标注的可折叠系统行，模型侧作为上下文可见。

免疫点：
- 只响应实时事件 —— resume/replay 不会重放旧通知，打开历史会话不刷屏；
- 自身追加的是 `user/message`，与监听目标 `turn/*` 不相交，无自我循环；
- 零外部 import（`@deepseek-ai/*` 无法从本仓库目录解析），`UserMessage`
  按 `@deepseek-ai/dsh-llm` 的 `createUserMessage` 契约手工构造。

## 双通道提醒

1. **宿主系统消息**（`lib/index.js`，见上）：写入会话日志，UI 渲染为折叠系统行。
2. **浏览器推送**（`lib/client.js`，`dsh.client` 声明 + `exports["./client"]`）：
   订阅客户端 `ctx.sessions.list` 快照，检测会话 `running: true → false` 边沿——
   - **标题 = 哪个会话**（`displayTitle`，即会话标题/项目名）；
     **正文 = 宿主系统消息全文**——优先级：① 宿主**投影单元**
     （`session-complete-notify` key，每个会话都推送到客户端列表，
     **后台/未打开窗口的会话同样有全文**，与官方 title 投影同机制）；
     ② 会话事件窗口的 notice 节点（窗口打开时的即时路径）；
     ③ 降级为工作区信息；
   - 优先 **Web Notification**（系统通知：**每次完成独立 tag**，不会被同 tag 替换
     或分组折叠；权限为 `default` 时**每页只请求一次**授权）；
   - **页内浮动 toast 总是展示**（右下角 10 秒自动消失、点击即关，
     同屏最多 3 条、超出移最旧——保证每次完成新弹窗都可见；
     即使系统通知被浏览器/平台静默，toast 保底可见）；
   - 无论用户是否正在查看该会话都会推送；
   - 首次观测只记录基线（已在 idle 的会话不补发，与官方 sidebar 提醒同策略）；
   - 跳过子代理会话（`origin === 'subagent'`）。

   装配注意：插件包新增 `dsh.client` 声明后，`clientModules` 注册表的
   `pkgMeta` 负缓存（`null`）会让扫描跳过它——需要清理
   `ctx.get('clientModules').pkgMeta.delete('<pkg>')` 并触发 `flush`，否则
   页面刷新后 `__DSH_BOOT__` 不含该条目（本插件已处理）；之后**刷新浏览器页面**即可生效。

## 安装

```bash
# 方式一：bundle 热装配（本机 dsh-super-injector）
#   dev_install_package dir=D:/Software/dsh-external/dsh-session-notify

# 方式二：cordis patch（重启后由 bundles 装配，与 dev_install_package 双路径一致）
cd ~/.dsh/profiles/web
cat >> cordis.patch.yml << 'EOF'
- insert:
    - id: session-complete-notify
      name: '@dsh-external/dsh-session-notify'
      config: {}
EOF
```

## 配置

```yaml
config:
  # 触发提醒的 turn/end reason 白名单
  # （默认除 interrupted —— 崩溃恢复的孤儿轮次关闭标记 —— 之外全部）
  reasons: [completed, aborted, blocked, error, max-tokens]
  # 跳过子代理会话（子代理逐轮提醒是噪音，父会话已经提醒用户）
  skipSubagents: true
  # 系统消息附带轮次用时
  includeDuration: true
  # 系统消息附带 token 用量
  includeUsage: true
```

## 消息样例

- `✅ 会话已完成（用时 12 秒，消耗 1,240 输入 / 3,560 输出 tokens）。`
- `会话出错：Connection reset by peer…（用时 5 分 2 秒，消耗 …）。`
- `会话达到输出上限（用时 1 小时 4 分）。`

summary 行按 notice 契约截断到 120 字符。

## 验证

任一会话完成任务后：

1. Web UI 会话尾部出现折叠的系统提示行；
2. 落盘确认：
   `node scripts/verify-notice.mjs <session.jsonl.zstd>`（省略路径时自动选 `~/.dsh/sessions` 下最新会话），
   输出中应出现 `plugin-source 系统消息` 一条，其 `source.plugin === "dsh-session-notify"`；
3. 推送确认（无头 Chrome 端到端）：
   `node scripts/probe-client-e2e.mjs` 会保持浏览器打开直至下一个完成事件，
   打印 `PUSH FIRED` / `PUSH-E2E-OK`（toast DOM + Notification 路径日志）；<br>
   `node scripts/probe-client.mjs <30s>` 只做激活冒烟：客户端 apply 应打印
   `active, watching session activity`。

## 设置面板（设置 → 插件配置 → 「会话完成提醒」卡片）

宿主用官方 `ctx.settings` 注册命名空间 `session-complete-notify`（schemastery schema，经
createRequire 锚定 profile 共享依赖枢纽加载——本插件从 D 盘以 realpath 加载，裸导入不可用），
客户端在官方 keyed slot `settings.plugin.item`（key = 命名空间）注册卡片。面板修改即刻生效（live）。

| 字段 | 说明 |
| --- | --- |
| 预设 | 一键应用：默认（内置）/ 轻松风格 🎉 / 正式简洁 / 详细报告 / English / English playful 🎉（应用后可继续手改，保存才写入） |
| 语言 | 中文 / English（文案语言 + 时长/用量格式） |
| 模板 · 完成/出错/中止/阻塞/输出上限 | ChipEditor：文字 + 内联胶囊；**「＋ 插入信息」**提供 完成标签/用时/消耗/错误/**缓存命中**/**速度 TPS**，光标处插入、胶囊点击移除；下方预览为纯文本最终效果（示例值直出）；底层无损模板：`{label}` `{duration}` `{usage}` `{error}` `{cache}` `{tps}` |
| 显示用时 / 显示 token 用量 | 开关（`{cache}`/`{tps}` 随「显示 token 用量」开关一并生效） |
| 跳过子代理会话 | 开关 |

`{cache}` = 缓存命中率（缓存读 token / 输入总量，1 位小数）；`{tps}` = 输出 token/秒（输出量 ÷ 用时）。

下拉细节：select 声明 `color-scheme: dark` + option 显式深色——否则 Chromium 原生弹层保持白底而文字继承深色主题的浅色（白底白字不可见）。

示例模板：`✅ {label}！耗时 {duration}，消耗 {usage}`。

## 仓库结构

```
lib/index.js   # 插件入口：事件订阅 + 消息追加 + settings 命名空间（apply(ctx, config)）
lib/client.js  # 浏览器端：推送（toast+通知）+ 设置卡片（官方 slot）
lib/core.js    # 纯逻辑：计时/用量跟踪 + 文案构建（多语言 + 模板）（可独立单测）
scripts/verify-notice.mjs       # 落盘核验
scripts/probe-client.mjs        # 客户端激活冒烟
scripts/probe-client-e2e.mjs    # 端到端推送实测（可钉会话窗口）
scripts/probe-settings-card.mjs # 设置面板卡片核验（无头）
```
