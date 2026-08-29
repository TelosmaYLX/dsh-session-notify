<div align="center">

# dsh-session-notify

[简体中文](README.md) · **English** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

**DSH (DeepSeek Harness) session-completion notification plugin — at the end of every turn, the completion status comes to you, instead of you staring at the screen waiting.**

[![npm version](https://img.shields.io/npm/v/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![npm downloads](https://img.shields.io/npm/dm/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![license](https://img.shields.io/npm/l/@telosmaylx/dsh-session-notify)](./LICENSE)
[![node](https://img.shields.io/node/v/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![DSH](https://img.shields.io/badge/DSH-Web%20Profile-4D6BFE)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/TelosmaYLX/dsh-session-notify/pulls)

At the end of every conversation turn, writes "completed / errored / blocked / hit the cap" along with duration and token usage into the session log, and pushes a browser system notification and an in-page toast. Built-in 5 languages, a visual copy-template editor, and a custom preset library; cache hit rate and generation speed come from the official projections, consistent with the status bar.

</div>

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Uninstall](#uninstall)
- [Quick Start](#quick-start)
- [Notification Behavior](#notification-behavior)
  - [Trigger Conditions](#trigger-conditions)
  - [Where Does the Push Body Come From](#where-does-the-push-body-come-from)
  - [Notification Examples](#notification-examples)
  - [Notification Permissions](#notification-permissions)
- [Configuration](#configuration)
  - [Settings Panel](#settings-panel)
  - [Template tokens and placeholders](#template-tokens-and-placeholders)
  - [Preset System](#preset-system)
  - [Host Configuration Options](#host-configuration-options)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Development & Debugging](#development--debugging)
- [FAQ](#faq)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [Related Links](#related-links)
- [License](#license)

---

## Features

### Three-Channel Notifications, None Missed

| Channel | Form | Description |
| --- | --- | --- |
| In-session system message | Collapsible hint line | When each turn ends, appends the end reason, duration and usage as a plugin-sourced system message into the session log, persisted with the JSONL, and still visible after restoring or replaying the session. |
| Browser system notification | Web Notification | Native popup. Each completion event uses an independent `tag` (`dsh-session-notify:<timestamp>`), so it neither replaces the previous one nor collapses into a single grouped entry; clicking the notification focuses back to the window. |
| In-page toast | Floating popup at the bottom-right | The always-shown fallback channel: still gives visible feedback when system notifications are silently suppressed by the platform, permission is denied, or the environment does not support them. At most 3 on screen at once (oldest removed when exceeded), auto-dismisses after 10 seconds, click to close. |

### Full Coverage of Background Sessions

- The host maintains a "most recent notification body" session projection unit (key = `session-complete-notify`) for all sessions, including background ones whose windows aren't open, so the pushed body is consistent across sessions and does not depend on you happening to have that window open.
- The client observes the `running` flag of all sessions from the session list snapshot; a `true → false` edge triggers a push, following the same strategy as the official sidebar reminders (the first observation only records a baseline; sessions already idle are not back-filled).

### Customizable Down to Every Sentence

- **5 languages**: Simplified Chinese, Traditional Chinese, English, Japanese, Korean — the notification copy, the duration and usage wording, and the settings panel UI all switch with the language (instant re-render on switch).
- **Visual template editor** (Chip editor): dynamic information renders as inline chips (placeholder code never leaks); "+ Insert Info" inserts at the cursor (can be inserted mid-text); clicking a chip removes it; each field has a live preview (information flows into the body with sample values).
- **Preset system**: the built-in "Default" preset serves as the baseline; the current configuration can be saved as a custom preset (persisted in `localStorage`), supports auto-numbered unnamed presets (`Untitled`, `Untitled 2`…), a "From: xxx · Modified" origin indicator, and deleting presets.
- **Push title template**: when left empty, each reason uses a default title (completed = task completed / errored = task errored / …); `{title}` references the session title.

### Same Source as the Official Metrics

- **Cache hit rate** comes from the official `tokenUsage` projection: cache reads / (uncached input + cache reads + cache writes).
- **Generation speed** comes from the official `sessionStats` projection: output tokens ÷ decode time.
- Both are fully consistent with the dsh-web-ui status bar, excluding queuing, preparation and tool time; when the projection is unavailable or the data is not ready, it automatically falls back to a local usage-aggregation estimate.

> [!NOTE]
> The cache hit rate and speed are only shown when inserted via the `{cache}` and `{tps}` placeholders in a custom template. With the built-in default copy, the body contains only duration and usage.

### Engineering Quality

- **Responds only to live events**: resume and replay do not replay old notifications; loading a session does not spam the screen.
- **Self-immune to loops**: the message type the plugin appends (`user/message`) is disjoint from its own listen target (`turn/*`).
- **Zero external dependencies**: the host plane has zero bare imports; UserMessage is constructed manually per the `dsh-llm` `createUserMessage` contract; the pure logic layer (`lib/core.js`) has zero dependencies and can be tested independently.
- **Cordis effect discipline**: the retry timer is wrapped in `ctx.effect()` and returns a `clearTimeout` disposer; the registration is automatically revoked when the fiber unloads, making HMR hot reload safe.
- **Installs and mounts in one step**: declares the official `dsh.bundle` manifest; a single `dsh plugin add` command installs it and it works, no hand-written patch needed.

---

## Requirements

| Dependency | Requirement |
| --- | --- |
| DSH (DeepSeek Harness) | Web profile deployment. The official base bundle includes `@deepseek-ai/dsh-settings` (settings namespace) and session projections by default; no extra configuration needed |
| cordis | `>=4.0.0-rc <5` (peer dependency, provided by the host) |
| Node.js | `>=22` (host side) |
| Browser | System notifications when Web Notification is supported; toast falls back when unsupported, permission denied or silently suppressed |

---

## Installation

> [!WARNING]
> A bare `npm install` only puts the package into the dependency tree; it does **not register the plugin** — this is DSH's official design (`npm install only adds the dependency; it does not register the plugin`). The only official way to auto-mount is `dsh plugin add`: it reads the `dsh.bundle` manifest inside the package (declared by this plugin since 0.1.3, pointing to the `cordis.patch.yml` at the repository root) and applies it automatically.

### Method 1: dsh plugin add (recommended)

Installing the package also automatically applies `cordis.patch.yml`, mounting the plugin into the profile assembly (host event subscription + client boot graph injection).

```bash
dsh plugin --profile web add @telosmaylx/dsh-session-notify
```

### Method 2: Install from the GitHub repository

```bash
dsh plugin add github:TelosmaYLX/dsh-session-notify
```

You can also run it inside a DSH Web GUI session:

```bash
dev_install_package github=TelosmaYLX/dsh-session-notify
```

### Method 3: Hot-mount a local directory (for development)

Replace the path with your clone directory and run it inside a DSH Web GUI session:

```bash
dev_install_package dir=/你的/克隆目录/dsh-session-notify
```

### Method 4: Manual install of the npm package

First pack it:

```bash
npm pack @telosmaylx/dsh-session-notify
```

After extracting, install from the specified directory (run inside a DSH Web GUI session):

```bash
dev_install_package dir=/解压/目录/package
```

### Method 5: Manual cordis patch (no installer required)

Append to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-session-notify
      name: '@telosmaylx/dsh-session-notify'
      config: {}
```

> [!IMPORTANT]
> Regardless of the method, you need to **refresh the browser page once** after installing — the client bundle is injected via the `__DSH_BOOT__` boot graph.

## Uninstall

A single command removes the plugin and its mounting (automatically removes the insert entry from `cordis.patch.yml`):

```bash
dsh plugin --profile web remove @telosmaylx/dsh-session-notify
```

> [!NOTE]
> Users who installed manually (Methods 4/5) need to also remove the corresponding insert entry from `~/.dsh/profiles/web/cordis.patch.yml`, then refresh the page.

### What Is Automatically Cleaned Up on Uninstall

The plugin implements complete lifecycle teardown (Cordis effect discipline); on uninstall/disable/HMR hot reload:

| Plane | Automatically released resources |
| --- | --- |
| host | `session/event` event subscription, settings namespace, session projection units, settings-registration retry timer (wrapped in `ctx.effect`); sets an uninstalled flag to suppress already-scheduled microtask appends |
| client | Session list subscription, poll timer for completion push bodies, `window.__dsch_notify_debug` debug hook (removed by reference to prevent closure leaks), in-page toast container DOM |

### Data Retained After Uninstall

- **Settings configuration** (language, copy templates) remains in the settings document and is automatically restored after reinstalling;
- **Custom presets** are stored in the browser `localStorage` (`dsh-scn-custom-presets`), still present after reinstalling;
- System messages already appended to historical sessions and JSONL logs are **not** rolled back (they are part of the session data, with the same semantics as the official sidebar hints).

---

## Quick Start

1. Install by any of the methods above and refresh the page.
2. Start any conversation turn and wait for it to end — a toast pops up in the bottom-right, a system notification appears in the browser, and a collapsible system hint line appears in the session log.
3. The first time a completion event is received, the browser requests notification permission (asked only once per page); after granting, subsequent completions all get system notifications.
4. Open **Settings → Plugins → Session Completion Notify**, switch languages, edit copy templates, and save presets. After saving, click "Click to Refresh" so both the host and client sides re-read, and the new configuration takes effect.

Right after installation, a collapsible hint line like this appears in the session log:

```text
会话「重构登录模块」已完成（用时 1 分 12 秒，消耗 1,240 输入 / 3,560 输出）。
```

> The default copy embeds the session-title token (`{title}`) after "Session"; when the session has no title, it automatically falls back to "Session completed".

---

## Notification Behavior

### Trigger Conditions

When each conversation turn ends (`turn/end`), the end reason is checked; hitting the whitelist triggers a notification:

| End reason | Meaning | Default |
| --- | --- | --- |
| `completed` | Session completed normally | Notify |
| `aborted` | Session aborted | Notify |
| `blocked` | Session blocked | Notify |
| `error` | Session errored (with error details, truncated when too long) | Notify |
| `max-tokens` | Reached the output token cap | Notify |
| `interrupted` | Interrupted (an orphan-turn close marker back-filled by the persistence backend after crash recovery) | No notification (configurable) |

**Subagent sessions are skipped by default** (`header.origin === 'subagent'` or `delegationDepth > 0`) — subagents are orchestrated by their parent session, so per-turn notifications are noise; the skip can be disabled in the host configuration.

### Where Does the Push Body Come From

When the client observes a `running: true → false` edge in the session list, it pushes; the body is fetched with the following priority (polls for up to 6 seconds at 400ms intervals):

1. **Host projection** (key = `session-complete-notify`) — available for every session; background sessions get the full text too;
2. **The notice node in the session event window** (`kind=context` + `form=notice`) — for the session being viewed, available immediately after persistence;
3. **Fallback** — "See the in-session system message for details" + workspace info (last segment of `cwd`).

### Notification Examples

All of the following are actually generated by `buildNotice` in `lib/core.js`. The default copy uses **differentiated phrasing** per end reason (not uniform sentence patterns):

Simplified Chinese default copy:

```text
会话「重构登录模块」已完成（用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出）。   ← 完成：括号紧凑式 + 内嵌会话标题
会话「重构登录模块」已中止。用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出。     ← 中止：句号拆句
会话「重构登录模块」被阻塞。用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出。     ← 阻塞：句号拆句
会话「重构登录模块」达到输出上限。用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出，建议拆分任务后重试。  ← 上限：附建议
```

> When the session has no title (`titleValue` empty), it automatically falls back to a phrasing without the title, e.g. "Session completed (took …)".

On error, the error details come first (single-lined, truncated past 40 characters):

```text
会话「重构登录模块」出错：connection timeout（用时 12 秒）。
```

English default copy (session title in double quotes):

```text
Session "重构登录模块" completed (took 3m25s, used 12,400 in / 35,600 out).
Session "重构登录模块" hit the output-token cap. Took 3m25s, used 12,400 in / 35,600 out — consider splitting the task.
```

Custom template (edited in the settings panel; this example uses all info slots):

```text
{title} 干完了！用时 {duration}，消耗 {usage}，缓存命中 {cache}，速度 {tps}
```

Rendered result:

```text
重构登录模块 干完了！用时 3 分 25 秒，消耗 103,600 输入 / 35,600 输出，缓存命中 96.5%，速度 92 tok/s
```

The same event in the five languages:

```text
会话「重构登录模块」已完成（用时 3 分 25 秒，消耗 1,240 输入 / 3,560 输出）。
會話「重構登入模組」已完成（用時 3 分 25 秒，消耗 1,240 輸入 / 3,560 輸出）。
Session "重构登录模块" completed (took 3m25s, used 1,240 in / 3,560 out).
セッション「重构登录模块」完了（所要 3 分 25 秒、消費 1,240 入力 / 3,560 出力）。
세션「重构登录模块」 완료（소요 3분 25초, 소모 1,240 입력 / 3,560 출력）。
```

### Notification Permissions

| Permission state | Behavior |
| --- | --- |
| `default` (undecided) | Completion events only send a toast; the "Notification Permissions" area of the settings panel provides a "Request Authorization" button (**requested within a user gesture** — Chromium ignores non-gesture automatic requests, so the plugin no longer requests automatically) |
| `granted` | Sends system notifications per "Push Mode" (independent tags, never overwriting each other) |
| `denied` (blocked by the browser) | Toast only; the settings panel shows address-bar instructions (permission icon → site settings → notifications → allow) |
| `undefined` (non-secure context / unsupported) | Toast only; recommends switching to "In-page only" |

---

## Configuration

Most configuration is done in the **DSH Web UI → Settings → Plugins → Session Completion Notify** panel (takes effect after saving and clicking "Click to Refresh"). Only "Trigger reason whitelist" and "Skip subagents" are configured in the `config` of the host `cordis.patch.yml`.

### Settings Panel

The panel is registered in the official "Settings → Plugins" panel (`settings.plugin.item` keyed slot, key = `session-complete-notify`), replicating the native plugin card style value by value (12px radius, expand/collapse, rotating chevron, footer status bits + discarded ghost + primary-color save button):

| Area | Content |
| --- | --- |
| Presets | Dropdown to select a built-in or custom preset; "Add" saves the current configuration as a custom preset; the current preset can be "Deleted" |
| Language | Radio selection among 5 languages; switching instantly re-renders the whole panel |
| Push mode | Choose one of three: dual channel (system notification + in-page toast, default) / system notification only / in-page only |
| Notification media | Two sources for the large image: **per-reason upload** — insert the `{image}` token via "＋ Insert info → Image" in a template and pick a local file (shown as a chip with a thumbnail in the editor, auto-compressed to 512px wide with a 16:9 center crop matching the notification display ratio, saved per reason); **global image/icon** — two upload cards side by side in one row (**icon first**; empty = a rounded "+" tile; click to upload; **image 512×288 with a 16:9 center crop, icon 128×128 with a 1:1 square center crop**; once uploaded the card shows the thumbnail — **click it for a fullscreen preview of the full original image (aspect-ratio-preserving, uncropped)**, the "×" at the top-right removes it). Icon left empty = site default icon, or insert the `{icon}` token in a template for a **per-reason icon** (takes precedence over the global one). Effective on the system-notification channel only (the in-page toast is a text card); the "Send" test buttons apply them too |
| Title | A collapsible section (**collapsed by default**, click to expand): the **global push title** (shared by all reasons; a Chip editor — info inserted via "＋ Insert info" shows as **chip tags**, click a chip to remove; when left empty, each reason uses a default title — completed = task completed, errored = task errored, aborted = task aborted, blocked = task blocked, cap = task hit the output cap) plus **per-reason titles** (5 inputs, one per reason; empty = use the global or the language default) |
| Content | A collapsible section (**collapsed by default**, click to expand). When expanded, each end reason (completed, errored, aborted, blocked, output cap) has its own Chip editor: text + inline info chips, insert at the cursor; for `{image}`/`{icon}` chips **click the thumbnail to preview the full image, only the "×" removes it** (prevents accidental removal); other chips are removed by clicking; live preview |
| Skip subagent sessions | Checkbox (written into the settings document on save) |
| Notification permissions | Status shown in real time: granted (green) / not yet granted (with a "Request Authorization" button) / blocked by the browser (with address-bar instructions) / environment unsupported |
| Per-reason titles | Collapsible area (collapsed by default): one title input per end reason; empty = use the global template or the language default title |
| Save | Writes to the host settings document (`language` / `templates` / `titleTemplate` / `titleTemplates` / `pushMode`); shows a "Click to Refresh" link after saving |
| Reset | One-click restore of default values (**the current language is kept**, titles/templates/push mode restore to defaults) and saves immediately |

> [!NOTE]
> The trade-off of "Push mode": `dual` (default) fires both a Windows system notification and an in-page toast; the toast is the fallback channel, guarding against system notifications being silently suppressed by the platform (focus assist, notification banner off). However, **Chromium-shell browsers such as QQ Browser render `Notification` as a "browser built-in in-page push popup"** (a banner at the top/corner of the page, not going through the Windows notification center) — in that case `dual` causes two in-page prompts (the browser built-in popup + the plugin toast). For such browsers, choose "In-page only" (the `Notification` API is no longer called, the browser built-in popup won't appear, and only the plugin's own small toast remains in-page); "System notification only" is ineffective in QQ Browser (it always renders as an in-page popup). The "Send" test button for each reason in the settings panel is likewise affected.

> [!NOTE]
> Whether the system notification (`Notification` API) can pop up is determined jointly by the **browser and how the site is accessed**: Edge/Chrome **auto-block notifications** for "unfamiliar" sites (a "notifications blocked" appears in the address bar) — click the permission icon on the left of the address bar → site settings → notifications → allow to restore; when accessed as a non-secure context like `http://IP`, `Notification` simply does not exist, so switch to "In-page only". The "Notification Permissions" area of the settings panel shows the current state in real time and gives the corresponding action guide (one-click authorization request). In Firefox, when the window is focused, notifications show as in-page banners and only go to the system notification center when unfocused.

> [!NOTE]
> The "Skip subagent sessions" checkbox in the panel saves a boolean into the settings document; `config.skipSubagents` in the host `cordis.patch.yml` is its startup default; if either is true, subagents are skipped.

### Template tokens and placeholders

Each end reason has its own template input; **the token is the switch** — the data is shown only when you insert the corresponding info token into the template:

| Placeholder | Meaning | Example value |
| --- | --- | --- |
| `{title}` | Session title (also usable in the push title template) | `重构登录模块` |
| `{duration}` | Duration of this turn (timed from `turn/start` to `turn/end`) | `3 分 25 秒` / `3m25s` |
| `{usage}` | Token usage (input = uncached + cache reads + cache writes) | `1,240 输入 / 3,560 输出` |
| `{error}` | Error message (shows `none` when there is no error; single-lined, truncated at 80 characters) | `connection timeout` |
| `{cache}` | Cache hit rate (per the official projection; empty when no data) | `96.5%` |
| `{tps}` | Generation speed (per the official projection; empty when no data) | `92 tok/s` |
| `{image}` | Custom notification-image switch: insert via "＋ Insert info → Image" and pick a local file (auto-compressed to 512px), independent per reason; stripped from the rendered body, never written into the session log; removing the token also clears that reason's image data | — |
| `{icon}` | Custom notification-icon switch: insert via "＋ Insert info → Icon" and pick a local file (auto-compressed to 128×128 square), independent per reason; stripped from the rendered body, never written into the session log; takes precedence over the global "Notification icon"; removing the token also clears that reason's icon data | — |
| `{label}` | Deprecated — automatically stripped at render time; old templates remain compatible (the option has been removed from the insert menu) | — |

An empty template uses the built-in default copy (automatically includes duration and usage). The collapsible row's `summary` shares the same source as the body (the rendered result is truncated to 120 characters) — users who only look at the collapsible row still see the real title, duration and usage.

### Preset System

- **Built-in preset**: only "Default", serving as the baseline.
- **Custom presets**: stored in `localStorage` (key = `dsh-scn-custom-presets`):
  - After naming, "Add" saves it as a custom preset; afterwards it can be auto-synced with "Modify" or removed with "Delete";
  - **Auto-numbered unnamed presets**: saving directly from "Default / blank" automatically generates `Untitled`, `Untitled 2`, `Untitled 3`… (the number takes the current max + 1);
  - The form shows a "From: xxx · Modified" origin indicator (when loaded from a preset but the content has been changed).
- **Save syncs**: on save, if the form originates from a custom preset, that preset is updated; otherwise a new one is created or the unnamed-preset numbering continues.

### Host Configuration Options

```yaml
- insert:
    - id: dsh-session-notify
      name: '@telosmaylx/dsh-session-notify'
      config:
        reasons: [completed, aborted, blocked, error, max-tokens]
        skipSubagents: true
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `reasons` | `string[]` | `[completed, aborted, blocked, error, max-tokens]` | Whitelist of `turn/end` reasons that trigger notifications |
| `skipSubagents` | `boolean` | `true` | Skip subagent sessions (`origin=subagent` or `delegationDepth>0`) |

---

## How It Works

The plugin is split into a **host plane** (Node) and a **client plane** (browser), bridged by the session log (JSONL) and official session projections:

```text
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

### Key Design Decisions

- **No replay**: only live events are processed; resume and replay do not back-fill historical notifications.
- **No self-loop**: the plugin appends `user/message` and only listens to `turn/*`; the event types are disjoint.
- **Zero external imports**: the plugin is loaded from the repository directory by realpath, and `@deepseek-ai/*` cannot be bare-resolved — the host plane uses `createRequire` to anchor the profile's shared dependency hub (`.dsh/profiles/node_modules`) for `schemastery` (settings schema) and `zod` (projection schema); UserMessage is constructed manually per the `dsh-llm` contract (`id = crypto.randomUUID()`, deep-freeze done by the adopt-snapshot stage of `session.append`).
- **Append reentrancy avoidance**: the `session/event` observer callback runs within the publish boundary of the append fired on `turn/end` (dsh-session sets `entry.appending` before dispatch and resets it in `finally`), so a synchronous append would be rejected — therefore it is deferred to `queueMicrotask` (the microtask runs only after this synchronous stack, including the `finally` reset).
- **Effect discipline**: the settings-registration backoff retry timer is wrapped in `ctx.effect()` and returns a `clearTimeout` disposer — if the plugin is uninstalled or hot-reloaded within the retry window, the timer is torn down with the fiber and never registers against a released ctx (in very old environments without the `ctx.effect` API, it degrades to a bare timer plus a ctx-torn-down guard catch).
- **HMR safe**: the `core.js` import carries `?v=1` cache busting (HMR reload is keyed by URL); if settings registration hits a hot-reload race (duplicate), it automatically backs off and retries (up to 8 times, interval `400ms × attempts`).
- **Dual-track projection registration**: prefers `ctx.root.get('sessionProjections')` (the instance closest to the host root), falling back to the injection instance when unavailable; if registered only into the injection instance, the client may not read the projection unit and the push body takes the fallback path — best-effort, does not affect in-session system messages.

---

## Project Structure

```text
dsh-session-notify/
├── lib/
│   ├── index.js      # 宿主平面（Node）：session/event 订阅 → 系统消息落盘；
│   │                 #   settings 命名空间注册（schemastery schema，退避重试）；
│   │                 #   sessionProjections 投影单元（后台会话推送正文）
│   ├── core.js       # 纯逻辑层（零依赖，可独立测试）：轮次计时与用量聚合、
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
├── cordis.patch.yml  # dsh.bundle manifest —— dsh plugin add 自动挂载的凭证
├── package.json      # dsh.bundle（patch）+ dsh.client（web 注入）双 manifest；
│                     #   exports: "." / "./client" / "./core"
├── LICENSE           # MIT
└── README.md         # 本文档
```

---

## Development & Debugging

Syntax check (zero-build, the same check as `prepublishOnly`):

```bash
npm run build
```

Publishing (runs the `prepublishOnly` syntax check automatically before publishing):

```bash
npm publish --registry=https://registry.npmjs.org --access public
```

Offline verification: extracts all plugin-source events and the `turn/end` tail sequence from a session log (when no path is given, automatically selects the newest session under `~/.dsh/sessions`):

```bash
node scripts/verify-notice.mjs <session.jsonl.zstd>
```

### Debugging Entry Points

| Entry point | Content |
| --- | --- |
| `~/.dsh/session-complete-notify.log` | Host diagnostic log: settings registration, retries and failures, projection registration, append-failure stacks |
| Browser console `[dsh-session-notify-client]` | Client log: permission state, notification display, settings save |
| `window.__dsch_notify_debug.readNotice(id)` | Manually read the latest notification body of a given session |
| `window.__dsch_notify_debug.snapshotDebug(id)` | Session tail node types + notice count + most recent body (first 200 chars) |

---

## FAQ

<details>
<summary><b>Why isn't it auto-mounted after npm install?</b></summary>

This is DSH's official design: `npm install` only puts the package into the dependency tree, it does not register the plugin. The only way to auto-mount is `dsh plugin add` — it reads the `dsh.bundle` manifest inside the package (declared by this plugin since 0.1.3) and automatically applies `cordis.patch.yml`. See [Installation](#installation).

</details>

<details>
<summary><b>Why is "interrupted" not notified?</b></summary>

`interrupted` is an orphan-turn close marker back-filled by the persistence backend after crash recovery; from the user's perspective it is not a "completion" (otherwise restoring a session would flood the screen with false reports). If you really need it, you can add it to `reasons` in the host configuration.

</details>

<details>
<summary><b>Do background sessions (with no window open) also get pushed?</b></summary>

Yes. The client observes the `running` edges of all sessions from the session list snapshot; the body prefers the host projection — the host maintains a projection unit for all sessions (including background ones), so the pushed body is consistent across sessions. When the projection is unavailable, it falls back to the event window or workspace info.

</details>

<details>
<summary><b>Why does it ask me to refresh the page after saving settings?</b></summary>

The host reads the settings once when registering the namespace, and the client bundle is assembled at page load. After saving, click "Click to Refresh" so both sides re-read, and the new language and templates take effect.

</details>

<details>
<summary><b>Where do the cache hit rate and speed data come from? Why are they sometimes empty?</b></summary>

They come from the official `sessionProjections` (`tokenUsage`, `sessionStats`), consistent with the dsh-web-ui status bar. When the host fails to read the projection snapshot or the data is not ready, it falls back to a local usage-aggregation estimate; if there is still no data, the field is left empty (the token shows nothing even if inserted). Additionally, these two appear only when inserted via the `{cache}` and `{tps}` placeholders in a custom template; the default copy does not include them.

</details>

<details>
<summary><b>What if the error message in the notification body is too long or has line breaks?</b></summary>

Both the summary line (collapsible row) and error details are single-lined and truncated: summary 120 chars, template `{error}` 80 chars, default-copy error details 40 chars; overlong text ends with an ellipsis.

</details>

<details>
<summary><b>Can I customize the icon or sound of system notifications?</b></summary>

The current version uses the browser's default notification style and does not inject a custom icon or sound; the toast is a fixed dark card. If you need these capabilities, feel free to open an Issue or PR.

</details>

<details>
<summary><b>Why can't Edge push system notifications? Why does QQ Browser only show an in-page banner (built-in push popup)?</b></summary>

Both are browser behaviors; the plugin cannot force anything:

- **Edge / Chrome**: **auto-block notifications** for "unfamiliar" sites (a "notifications blocked" appears in the address bar). Click the permission icon on the left of the address bar → site settings → notifications → allow to restore, after which the Windows notification center works normally. You can also turn off "auto-block" in the browser's notification settings.
- **Chromium shells like QQ Browser**: always render `Notification` as a **browser built-in in-page push popup** (a banner at the top/corner of the page, not going through the Windows notification center), and there is no system-notification option. How the three push modes actually behave:
  - `Dual channel` → browser built-in popup + plugin toast, two in-page prompts;
  - `System notification only` → ineffective (QQ Browser always renders it as an in-page popup);
  - `In-page only` → the browser built-in popup doesn't appear; only the plugin's small toast remains in-page (recommended).
  The "Send" test button for each reason in the settings panel is likewise rendered by this rule.
- **Firefox**: when the window is focused, notifications show as in-page banners; they go to the system notification center only when unfocused/minimized; permission must be manually allowed in the address bar.
- Also note: when accessed via `http://IP` (non-secure context), `Notification` does not exist, so no browser can pop a system notification.

The "Notification Permissions" area of the settings panel shows the current state and the corresponding action guide in real time.

</details>

---

## Changelog

| Version | Date | Changes |
| --- | --- | --- |
| **0.1.11** | 2026-08-29 | New **custom notification media**: ① the template "＋ Insert info" menu gains an **Image** token — insert `{image}` and pick a local file (**auto-compressed to 512px wide with a 16:9 center crop matching the notification display ratio**, shown as a thumbnail chip in the editor), uploaded per reason and stored in the settings document (stripped from the rendered body, never written into the session log); ② **notification image/icon are now upload cards** (empty = a rounded "+" tile, click to upload; **image 512×288 with a 16:9 center crop, icon 128×128 with a 1:1 square center crop**; once uploaded the card shows the thumbnail with a "×" at the top-right to remove it) — the crop guarantees the uploaded image appears complete in the notification card instead of being hard-cropped by the system's display area; ③ the **push-title "＋ Insert info"** inserts any info token (session title / duration / usage / cache hit / speed), not just the title; the "Notification media" area in the settings panel now shows a **processing guide** (crop ratios) and a **thumbnail preview** after upload; ④ **per-reason notification icons** (insert the `{icon}` token in a template + local upload, 128×128 square, takes precedence over the global icon); ⑤ **removing an `{image}`/`{icon}` token clears that reason's image/icon data**; ⑥ **layout polish: "Body templates × 5" is now a collapsible section (collapsed by default to keep the panel compact, with a customized-count hint in the header, click to expand)**; ⑦ **layout polish ②: the notification image/icon upload cards sit side by side in one row; the push title and per-reason titles merge into a "Title" collapsible section (collapsed by default); collapse indicators now use triangle icons (the "Expand/Collapse" texts removed, reducing i18n burden)**; ⑧ **interaction polish: the push title is now a Chip editor (inserted info shows as chip tags instead of raw `{title}` codes); the image/icon cards are reordered (icon first); "Body templates × 5" renamed to "Content"; image/icon thumbnails open a fullscreen lightbox preview on click, and only the "×" removes a tag (no accidental removal)**; ⑨ **previews unified to the full original: upload now stores both the cropped version (for the notification) and an aspect-preserving full version (1024px, used by the lightbox), so card and chip previews both show the uncropped image; the collapse triangle icons are enlarged**; the "Send" test buttons apply them too; effective on the system-notification channel only (the in-page toast is a text card) |
| **0.1.10** | 2026-08-29 | "Push title" changed to a native input (native placeholder behavior: not copyable, disappears when typing, restores when cleared; "+ Session Title" inserts `{title}` at the cursor); docs add the QQ Browser built-in push popup explanation (actual behavior of the three push modes + the send button tests follow the same rule) |
| **0.1.9** | 2026-08-29 | Push titles now support **per-reason customization** (collapsible UI, collapsed by default to stay lean; when empty, each reason uses a differentiated default title: task completed / task errored / task aborted / task blocked / task hit the output cap, in 5 languages); the projection upgraded to an object (kind/text/title) carrying the host-rendered title; the reset button **keeps the current language**; the default copy embeds the "session title" token (Session "{title}" completed, auto-falls back when there's no title); settings-panel template previews sync; "+ Insert Info" no longer auto-collapses after inserting a token; deleting a custom preset currently in use automatically switches back to the default; template preview fixed (doesn't hide on click, hides only when typing, restores when cleared); each reason gains a "Send" button (one-click test notification rendered with the current template) |
| **0.1.8** | 2026-08-29 | Default push title changed to "Task completed" (`{title}` can still reference the session title); default copy is differentiated per end reason (completed = compact parentheses / aborted·blocked = separate sentences / errored = error first / cap = with a suggestion, in 5 languages); the settings panel gains a "Reset" button for one-click restore of defaults |
| **0.1.7** | 2026-08-29 | Fix the 0.1.6 settings-card crash: `notificationPermissionRow`/`requestPermissionNow` referenced Card-component-internal state (out of scope), causing a render ReferenceError and the whole settings card to disappear; changed to self-contained + callback params |
| **0.1.6** | 2026-08-29 | The settings panel gains a "Notification permissions" status area (grant state in real time + one-click request-authorization button + address-bar guide when blocked); authorization changed to **requesting within a user gesture** (Chromium ignores non-gesture automatic requests; the typical Edge auto-block-for-unfamiliar-sites scenario is solved); FAQ adds browser-difference explanations |
| **0.1.5** | 2026-08-29 | New "Push mode" setting (dual channel / system notification only / in-page only): solves the double-prompt caused by Chromium shells like QQ Browser rendering `Notification` as an in-page banner; `pushMode` added to the settings schema and settings panel |
| **0.1.4** | 2026-08-28 | Complete uninstall support added: `dispose` lifecycle teardown (host sets an uninstalled flag to suppress pending microtask appends; client cleans up the body-polling timer, the `__dsch_notify_debug` hook, and the toast container); uninstall docs and FAQ updated accordingly |
| **0.1.3** | 2026-08-28 | Declare the official `dsh.bundle` manifest (`dsh plugin add` auto-mounts with a single command); settings retry timer wrapped in `ctx.effect()` (Cordis effect discipline); installation docs rearranged |
| 0.1.2 | 2026-08-27 | Package renamed to the `@telosmaylx` scope (npm username scope) |
| 0.1.1 | 2026-08-27 | Documented the GitHub and npm installation methods |
| 0.1.0 | 2026-08-26 | Initial version: in-session system messages + browser push + official settings panel |

---

## Contributing

Issues and PRs are welcome:

1. Fork the repository and create a new branch (`feat/xxx`)
2. After changes, run `npm run build` for the syntax check
3. Submit a PR, describing the motivation and how you verified it

Please follow the [Cordis development tutorial](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial) discipline before submitting:

- Resources outside Cordis (timers, subscriptions, watchers) must be wrapped in `ctx.effect()` and return a disposer;
- Configuration items must have an explicit `id` to prevent edit drift;
- A plugin must declare the `dsh.bundle` manifest to be recognized and installed by `dsh plugin add`.

---

## Related Links

- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — A curated list of DSH plugins (submission rule: `dsh.bundle` is the only credential for installation)
- [Cordis development tutorial](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial) — The full plugin-development process (chapters 01–07)
- [npm package homepage](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
- [GitHub repository](https://github.com/TelosmaYLX/dsh-session-notify)

---

## License

[MIT](./LICENSE) © dsh-session-notify contributors
