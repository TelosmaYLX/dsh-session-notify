<div align="center">

# dsh-session-notify

[简体中文](README.md) · [English](README.en.md) · **繁體中文** · [日本語](README.ja.md) · [한국어](README.ko.md)

**DSH（DeepSeek Harness）會話完成提醒外掛 —— 每一輪結束，讓完成狀態主動找你，而不是你盯著畫面等。**

[![npm version](https://img.shields.io/npm/v/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![npm downloads](https://img.shields.io/npm/dm/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![license](https://img.shields.io/npm/l/@telosmaylx/dsh-session-notify)](./LICENSE)
[![node](https://img.shields.io/node/v/@telosmaylx/dsh-session-notify)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![DSH](https://img.shields.io/badge/DSH-Web%20Profile-4D6BFE)](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/TelosmaYLX/dsh-session-notify/pulls)

每輪對話結束時，把「已完成 / 出錯 / 被阻塞 / 達到上限」連同用時、token 消耗寫入會話日誌，並推送瀏覽器系統通知與頁內 toast。內建 5 種語言、視覺化文案模板編輯器、自訂預設庫，快取命中率與生成速度取自官方投影，與狀態列同口徑。

</div>

---

## 目錄

- [功能特色](#功能特色)
- [環境需求](#環境需求)
- [安裝](#安裝)
- [解除安裝](#解除安裝)
- [快速開始](#快速開始)
- [通知行為](#通知行為)
  - [觸發條件](#觸發條件)
  - [推送內文從哪來](#推送內文從哪來)
  - [通知範例](#通知範例)
  - [通知權限](#通知權限)
- [設定](#設定)
  - [設定面板](#設定面板)
  - [文案模板與佔位符](#文案模板與佔位符)
  - [預設系統](#預設系統)
  - [宿主設定項](#宿主設定項)
- [運作原理](#運作原理)
- [專案結構](#專案結構)
- [開發與除錯](#開發與除錯)
- [常見問題](#常見問題)
- [更新紀錄](#更新紀錄)
- [貢獻](#貢獻)
- [相關連結](#相關連結)
- [授權條款](#授權條款)

---

## 功能特色

### 三通道提醒，一條不漏

| 通道 | 形式 | 說明 |
| --- | --- | --- |
| 會話內系統訊息 | 可收合的提示列 | 每輪結束把結束原因與用時、消耗作為外掛來源的系統訊息附加進會話日誌，隨 JSONL 寫入磁碟，還原或重播會話後依然可見。 |
| 瀏覽器系統通知 | Web Notification | 原生彈出視窗。每次完成事件使用獨立 `tag`（`dsh-session-notify:<timestamp>`），不會與前一次互相取代，也不會被收合成一個分組項目；點擊通知聚焦回視窗。 |
| 頁內 toast | 右下角浮動彈出視窗 | 永遠顯示的保底通道：系統通知被平台靜默、權限拒絕或環境不支援時仍有可見回饋。同畫面最多 3 條（超出移除最舊），10 秒自動消失，點擊關閉。 |

### 背景會話全覆蓋

- 宿主為所有會話（含背景、未開啟視窗的）維護「最近一則通知內文」的會話投影單元（key = `session-complete-notify`），推送內文跨會話一致，不依賴你剛好開著那個視窗。
- 用戶端從會話清單快照觀測所有會話的 `running` 位元，`true → false` 邊緣即觸發推送，與官方 sidebar 提醒同策略（首次觀測只記錄基線，已在 idle 的會話不補發）。

### 可自訂到每一句話

- **5 種語言**：簡體中文、繁體中文、English、日本語、한국어 —— 通知文案、時長與用量措辭、設定面板介面全部隨語言切換（切換即時重渲染）。
- **視覺化模板編輯器**（Chip 膠囊編輯器）：動態資訊渲染為內聯膠囊（佔位符程式碼不露出），「＋ 插入資訊」在游標處插入（可插到文字中間），點擊膠囊移除，每欄帶即時預覽（資訊以範例值流入內文）。
- **預設系統**：內建「預設」預設作為基線；目前設定可另存為自訂預設（`localStorage` 持久化），支援自動編號的未命名預設（`未命名`、`未命名 2`…）、「來自：xxx · 已修改」來源指示、刪除預設。
- **推送標題模板**：留空時各原因用預設標題（完成=任務已完成 / 出錯=任務出錯 / …）；`{title}` 引用會話標題。

### 與官方口徑同源

- **快取命中率**取自官方 `tokenUsage` 投影：快取讀 /（未快取輸入 + 快取讀 + 快取寫）。
- **生成速度**取自官方 `sessionStats` 投影：輸出 token ÷ 解碼耗時。
- 兩者與 dsh-web-ui 狀態列完全同口徑，不含排隊、準備、工具時間；投影不可用或資料未就緒時自動回退為本地用量彙總估算。

> [!NOTE]
> 快取命中率與速度只在自訂模板中透過 `{cache}`、`{tps}` 佔位符插入時才顯示。使用內建預設文案時，內文只含用時與消耗。

### 工程品質

- **只回應即時事件**：resume、replay 不重播舊通知，載入會話不洗版。
- **自免疫迴圈**：外掛附加的訊息類型（`user/message`）與自身監聽目標（`turn/*`）不相交。
- **零外部依賴**：宿主平面零裸 import，UserMessage 按 `dsh-llm` 的 `createUserMessage` 契約手工構造；純邏輯層（`lib/core.js`）零依賴，可獨立測試。
- **Cordis effect 紀律**：重試計時器包裝在 `ctx.effect()` 中並回傳 `clearTimeout` disposer，註冊隨 fiber 卸載自動撤銷，HMR 熱重載安全。
- **安裝即掛載**：宣告官方 `dsh.bundle` manifest，`dsh plugin add` 一條指令裝完即用，無需手寫 patch。

---

## 環境需求

| 依賴 | 需求 |
| --- | --- |
| DSH（DeepSeek Harness） | Web profile 部署。官方 base bundle 預設包含 `@deepseek-ai/dsh-settings`（設定命名空間）與會話投影，無需額外設定 |
| cordis | `>=4.0.0-rc <5`（peer dependency，由宿主提供） |
| Node.js | `>=22`（宿主側） |
| 瀏覽器 | 支援 Web Notification 則有系統通知；不支援、權限拒絕或被靜默時由 toast 保底 |

---

## 安裝

> [!WARNING]
> 裸 `npm install` 只會把套件裝進依賴樹，**不會註冊外掛** —— 這是 DSH 官方設計（`npm install only adds the dependency; it does not register the plugin`）。自動掛載的唯一官方途徑是 `dsh plugin add`：它讀取套件內 `dsh.bundle` manifest（此外掛自 0.1.3 起宣告，指向儲存庫根 `cordis.patch.yml`）並自動套用。

### 方式一：dsh plugin add（推薦）

安裝套件的同時自動套用 `cordis.patch.yml`，把外掛掛載進 profile 組合（host 事件訂閱 + client 啟動圖注入）。

```bash
dsh plugin --profile web add @telosmaylx/dsh-session-notify
```

### 方式二：從 GitHub 儲存庫安裝

```bash
dsh plugin add github:TelosmaYLX/dsh-session-notify
```

也可以在 DSH Web GUI 會話內執行：

```bash
dev_install_package github=TelosmaYLX/dsh-session-notify
```

### 方式三：本地目錄熱掛載（開發用）

把路徑換成你的克隆目錄，在 DSH Web GUI 會話內執行：

```bash
dev_install_package dir=/你的/克隆目录/dsh-session-notify
```

### 方式四：npm 套件手動安裝

先打包：

```bash
npm pack @telosmaylx/dsh-session-notify
```

解壓縮後指定目錄安裝（在 DSH Web GUI 會話內執行）：

```bash
dev_install_package dir=/解压/目录/package
```

### 方式五：手動 cordis patch（不依賴安裝器）

在 `~/.dsh/profiles/web/cordis.patch.yml` 附加：

```yaml
- insert:
    - id: dsh-session-notify
      name: '@telosmaylx/dsh-session-notify'
      config: {}
```

> [!IMPORTANT]
> 無論用哪種方式，裝完都需要**重新整理一次瀏覽器頁面** —— 用戶端 bundle 透過 `__DSH_BOOT__` 啟動圖注入。

## 解除安裝

一條指令移除外掛及其掛載（自動從 `cordis.patch.yml` 移除 insert 項目）：

```bash
dsh plugin --profile web remove @telosmaylx/dsh-session-notify
```

> [!NOTE]
> 手動安裝（方式四/五）的使用者，需同步從 `~/.dsh/profiles/web/cordis.patch.yml` 刪除對應 insert 項目，再重新整理頁面。

### 解除安裝時自動清理的內容

外掛實作了完整的生命週期收尾（Cordis effect 紀律），解除安裝/停用/HMR 熱重載時：

| 平面 | 自動釋放的資源 |
| --- | --- |
| host | `session/event` 事件訂閱、settings 命名空間、會話投影單元、設定註冊重試計時器（`ctx.effect` 包裝）；置解除安裝旗標抑制已排程的微任務附加 |
| client | 會話清單訂閱、完成推送內文的輪詢計時器、`window.__dsch_notify_debug` 除錯鉤子（按參考刪除，防閉包洩漏）、頁內 toast 容器 DOM |

### 解除安裝後保留的資料

- **設定組態**（語言、文案模板）留在 settings 文件，重裝後自動恢復；
- **自訂預設**存於瀏覽器 `localStorage`（`dsh-scn-custom-presets`），重裝後仍在；
- 歷史會話中已附加的系統訊息與 JSONL 日誌**不會**被回滾（它們是會話資料的一部分，與官方側邊欄提示同語意）。

---

## 快速開始

1. 按上面任一方式安裝並重新整理頁面。
2. 發起任意一輪對話，等它結束 —— 右下角彈出 toast、瀏覽器彈系統通知、會話日誌裡出現可收合的系統提示列。
3. 首次收到完成事件時，瀏覽器會請求通知權限（每頁只問一次），允許後後續完成都有系統通知。
4. 開啟 **設定 → 外掛 → 會話完成提醒**，切換語言、編輯文案模板、另存預設。儲存後點「點擊重新整理」讓宿主與用戶端兩側重新讀取，新設定即生效。

剛裝好時，會話日誌裡會出現這樣一行可收合提示：

```text
会话「重构登录模块」已完成（用时 1 分 12 秒，消耗 1,240 输入 / 3,560 输出）。
```

> 預設文案在「會話」後內嵌會話標題標籤（`{title}`）；會話無標題時自動退回「會話已完成」。

---

## 通知行為

### 觸發條件

每輪對話結束（`turn/end`）時按結束原因判斷，命中白名單即提醒：

| 結束原因 | 含義 | 預設 |
| --- | --- | --- |
| `completed` | 會話正常完成 | 提醒 |
| `aborted` | 會話中止 | 提醒 |
| `blocked` | 會話被阻塞 | 提醒 |
| `error` | 會話出錯（附錯誤詳情，超長截斷） | 提醒 |
| `max-tokens` | 達到輸出 token 上限 | 提醒 |
| `interrupted` | 中斷（崩潰復原後由持久化後端補寫的孤兒輪次關閉標記） | 不提醒（可設定加入） |

**子代理會話預設跳過**（`header.origin === 'subagent'` 或 `delegationDepth > 0`）—— 子代理由父會話編排，逐輪提醒是噪音；可在宿主設定關閉跳過。

### 推送內文從哪來

用戶端在會話清單觀測到 `running: true → false` 邊緣時推送，內文按以下優先級取得（最長輪詢 6 秒，400ms 間隔）：

1. **宿主投影**（key = `session-complete-notify`）—— 每個會話都有，背景會話同樣拿到全文；
2. **會話事件視窗裡的 notice 節點**（`kind=context` + `form=notice`）—— 正在查看的會話，寫入磁碟後立即可用；
3. **降級** —— 「詳情見會話內系統訊息」+ 工作區資訊（`cwd` 最後一段）。

### 通知範例

以下均由 `lib/core.js` 的 `buildNotice` 實際生成。預設文案按結束原因**差異化表達**（非清一色句式）：

簡體中文預設文案：

```text
会话「重构登录模块」已完成（用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出）。   ← 完成：括号紧凑式 + 内嵌会话标题
会话「重构登录模块」已中止。用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出。     ← 中止：句号拆句
会话「重构登录模块」被阻塞。用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出。     ← 阻塞：句号拆句
会话「重构登录模块」达到输出上限。用时 3 分 25 秒，消耗 12,400 输入 / 35,600 输出，建议拆分任务后重试。  ← 上限：附建议
```

> 會話無標題（`titleValue` 為空）時自動退回不帶標題的句式，如「會話已完成（用時 …）」。

出錯時錯誤詳情前置（單行化，超過 40 字元截斷）：

```text
会话「重构登录模块」出错：connection timeout（用时 12 秒）。
```

English 預設文案（會話標題用雙引號）：

```text
Session "重构登录模块" completed (took 3m25s, used 12,400 in / 35,600 out).
Session "重构登录模块" hit the output-token cap. Took 3m25s, used 12,400 in / 35,600 out — consider splitting the task.
```

自訂模板（在設定面板編輯，本例用到全部資訊位）：

```text
{title} 干完了！用时 {duration}，消耗 {usage}，缓存命中 {cache}，速度 {tps}
```

渲染結果：

```text
重构登录模块 干完了！用时 3 分 25 秒，消耗 103,600 输入 / 35,600 输出，缓存命中 96.5%，速度 92 tok/s
```

五種語言的同一事件：

```text
会话「重构登录模块」已完成（用时 3 分 25 秒，消耗 1,240 输入 / 3,560 输出）。
會話「重構登入模組」已完成（用時 3 分 25 秒，消耗 1,240 輸入 / 3,560 輸出）。
Session "重构登录模块" completed (took 3m25s, used 1,240 in / 3,560 out).
セッション「重构登录模块」完了（所要 3 分 25 秒、消費 1,240 入力 / 3,560 出力）。
세션「重构登录模块」 완료（소요 3분 25초, 소모 1,240 입력 / 3,560 출력）。
```

### 通知權限

| 權限狀態 | 行為 |
| --- | --- |
| `default`（未決定） | 完成事件只發 toast；設定面板「通知權限」區提供「請求授權」按鈕（**使用者手勢內請求**——Chromium 會忽略非手勢的自動請求，因此外掛不再自動請求） |
| `granted` | 按「推送方式」發系統通知（獨立 tag，互不覆蓋） |
| `denied`（被瀏覽器封鎖） | 僅 toast；設定面板顯示網址列操作指引（權限圖示 → 網站設定 → 通知 → 允許） |
| `undefined`（非安全上下文 / 不支援） | 僅 toast；建議改用「僅頁內提示」 |

---

## 設定

絕大多數設定在 **DSH Web UI → 設定 → 外掛 → 會話完成提醒** 面板完成（儲存後點「點擊重新整理」生效）。僅「觸發原因白名單」與「跳過子代理」兩項在宿主 `cordis.patch.yml` 的 `config` 中設定。

### 設定面板

面板在官方「設定 → 外掛」面板中註冊（`settings.plugin.item` keyed slot，key = `session-complete-notify`），樣式逐值復刻原生外掛卡片（12px 圓角、展開收合、旋轉 chevron、footer 狀態位 + 棄置 ghost + 主色儲存按鈕）：

| 區域 | 內容 |
| --- | --- |
| 預設 | 下拉選擇內建或自訂預設；「新增」把目前設定另存為自訂預設；目前預設可「刪除」 |
| 語言 | 5 種語言單選，切換即時重渲染整個面板 |
| 推送方式 | 三選一：雙通道（系統通知 + 頁內提示，預設）/ 僅系統通知 / 僅頁內提示 |
| 通知圖片 | 大圖兩種來源：**按原因上傳**——在模板中透過「＋ 插入資訊 → 圖片」插入 `{image}` 標籤並選擇本機圖片（編輯器內顯示為帶縮圖的標籤，**自動壓縮至 512px 寬、按通知顯示比例 16:9 居中裁切**，隨各原因獨立儲存）；**全域大圖/圖示**——兩張上傳卡片並排一行（**圖示在前**，空態 = 圓角矩形 + 號，點擊上傳；**大圖 512×288（16:9 居中裁切）、圖示 128×128（1:1 方形居中裁切）**；已上傳則卡片顯示縮圖，**點擊縮圖可全螢幕查看完整原圖（等比未裁切）**，右上角 × 刪除）。圖示留空用網站預設圖示，也可在模板中插入 `{icon}` 標籤**按原因指定圖示**（優先於全域）。僅系統通知通道生效（頁內 toast 為文字卡片），「傳送」測試按鈕同樣生效 |
| 標題 | 摺疊區（**預設收起**，點擊展開）：**全域推送標題**（所有原因共用，Chip 編輯器——點「＋ 插入資訊」插入的資訊以**膠囊標籤**形式顯示，點擊膠囊移除；**通知發送時標題裡的資訊位（用時/消耗/錯誤/快取命中/速度）會替換為實際值，不再顯示代碼**；留空時各原因用預設標題——完成=任務已完成、出錯=任務出錯、中止=任務已中止、阻塞=任務被阻塞、上限=任務達到輸出上限）+ **按原因自訂標題**（5 條原因各自輸入，留空 = 用全域或語言預設標題） |
| 內容 | 摺疊區（**預設收起**，點擊展開）；展開後每條結束原因（完成、出錯、中止、阻塞、輸出上限）**一行式佈局**（原因標籤 + Chip 編輯器 + 「+」插入按鈕——選單展開時變「−」+ **紙飛機發送按鈕**，按鈕為矩形、垂直居中）：**空模板（預設預設）時編輯器顯示預設文案**，文字 + 內聯資訊膠囊，游標處插入；`{image}`/`{icon}` 標籤**點擊縮圖可預覽大圖、點 × 才刪除**（防誤刪），其他標籤點擊移除；**編輯後刪空則顯示「留空則使用預設文案」佔位（不可選取/刪除）** |
| 跳過子代理會話 | 核取方塊（儲存時一併寫入設定文件） |
| 通知權限 | 狀態即時顯示：已授權（綠）/ 尚未授權（附「請求授權」按鈕）/ 已被瀏覽器封鎖（附網址列操作指引）/ 環境不支援 |
| 按原因自訂標題 | 收合區（預設收合）：每個結束原因一個獨立標題輸入框，留空 = 用全域模板或語言預設標題 |
| 儲存 | 寫入宿主設定文件（`language` / `templates` / `titleTemplate` / `titleTemplates` / `pushMode`）；儲存後顯示「點擊重新整理」連結 |
| 重置 | 一鍵還原預設值（**語言保留目前選擇**，標題/模板/推送方式恢復預設）並立即儲存 |

> [!NOTE]
> 「推送方式」的取捨：`dual`（預設）同時彈 Windows 系統通知與頁內 toast，toast 是保底通道，防止系統通知被平台靜默（專注小幫手、通知橫幅關閉）。但 **QQ 瀏覽器等國產 Chromium 殼瀏覽器會把 `Notification` 渲染成「瀏覽器內建的頁內推送彈出視窗」**（頁面頂部/角落的橫幅，不經 Windows 通知中心）——此時 `dual` 會造成頁內兩個提示（瀏覽器內建彈出視窗 + 外掛 toast）。這類瀏覽器請選「僅頁內提示」（不再呼叫 `Notification`，瀏覽器內建彈出視窗不會出現，頁內只有外掛自己的小 toast）；「僅系統通知」模式在 QQ 瀏覽器無效（它永遠渲染為頁內彈出視窗）。設定面板每個原因的「傳送」測試按鈕同樣受此影響。

> [!NOTE]
> 系統通知（`Notification` API）能否彈出由**瀏覽器與網站存取方式**共同決定：Edge/Chrome 對"不熟悉"的網站會**自動封鎖通知**（網址列出現「通知已封鎖」）——點擊網址列左側權限圖示 → 網站設定 → 通知 → 允許即可恢復；`http://IP` 這類非安全上下文存取時 `Notification` 根本不存在，請改用「僅頁內提示」。設定面板「通知權限」區域會即時顯示目前狀態並給出對應操作指引（可一鍵請求授權）。Firefox 視窗聚焦時通知顯示為頁內橫幅、失焦才進系統通知中心。

> [!NOTE]
> 面板中「跳過子代理會話」儲存的是設定文件裡的布林值；宿主 `cordis.patch.yml` 的 `config.skipSubagents` 是其啟動預設值，兩者任一為真即跳過。

### 文案模板與佔位符

每條結束原因獨立一個模板輸入框，**標籤即開關** —— 在模板裡插入對應資訊標籤，該項資料才會顯示：

| 佔位符 | 含義 | 範例值 |
| --- | --- | --- |
| `{title}` | 會話標題（推送標題模板也可用） | `重構登入模組` |
| `{duration}` | 本輪用時（`turn/start` 起表 → `turn/end` 結束） | `3 分 25 秒` / `3m25s` |
| `{usage}` | token 消耗（輸入 = 未快取 + 快取讀 + 快取寫） | `1,240 輸入 / 3,560 輸出` |
| `{error}` | 錯誤資訊（無錯誤時顯示 `none`；單行化，80 字元截斷） | `connection timeout` |
| `{cache}` | 快取命中率（官方投影口徑，無資料為空） | `96.5%` |
| `{tps}` | 生成速度（官方投影口徑，無資料為空） | `92 tok/s` |
| `{image}` | 自訂通知大圖開關：從「＋ 插入資訊」插入並選擇本機圖片（自動壓縮至 512px），按原因獨立；正文渲染時剝除，不寫入會話日誌；刪除標籤時該原因圖片資料一併清除 | — |
| `{icon}` | 自訂通知圖示開關：從「＋ 插入資訊」插入並選擇本機圖片（自動壓縮至 128×128 方形），按原因獨立；正文渲染時剝除，不寫入會話日誌；優先於全域「通知圖示」；刪除標籤時該原因圖示資料一併清除 | — |
| `{label}` | 已廢棄 —— 渲染時自動剝除，舊模板仍相容（插入選單已移除該選項） | — |

模板留空即使用內建預設文案（自動帶用時與消耗）。收合行 `summary` 與內文同源（渲染結果截斷至 120 字元）—— 只看收合行的使用者也能看到真實標題與用時、消耗。

### 預設系統

- **內建預設**：僅「預設」，作為基線。
- **自訂預設**：儲存在 `localStorage`（key = `dsh-scn-custom-presets`）：
  - 「新增」命名後儲存為自訂預設；儲存後可「修改」自動同步、「刪除」移除；
  - **自動編號的未命名預設**：從「預設 / 空白」直接儲存時，自動生成 `未命名`、`未命名 2`、`未命名 3`…（編號取目前最大值 + 1）；
  - 表單顯示「來自：xxx · 已修改」來源指示（來自預設但內容已改動時）。
- **儲存即同步**：儲存時若表單來源是自訂預設則更新該預設，否則新建或繼續編號未命名預設。

### 宿主設定項

```yaml
- insert:
    - id: dsh-session-notify
      name: '@telosmaylx/dsh-session-notify'
      config:
        reasons: [completed, aborted, blocked, error, max-tokens]
        skipSubagents: true
```

| 欄位 | 型別 | 預設值 | 說明 |
| --- | --- | --- | --- |
| `reasons` | `string[]` | `[completed, aborted, blocked, error, max-tokens]` | 觸發提醒的 `turn/end` 原因白名單 |
| `skipSubagents` | `boolean` | `true` | 跳過子代理會話（`origin=subagent` 或 `delegationDepth>0`） |

---

## 運作原理

外掛分**宿主平面**（Node）與**用戶端平面**（瀏覽器），中間靠會話日誌（JSONL）與官方會話投影銜接：

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

### 關鍵設計決策

- **不重播**：只處理即時事件，resume、replay 不會補發歷史通知。
- **無自我迴圈**：外掛附加 `user/message`，自身只監聽 `turn/*`，事件類型不相交。
- **零外部 import**：外掛從儲存庫目錄以 realpath 載入，`@deepseek-ai/*` 無法裸解析 —— 宿主平面用 `createRequire` 錨定 profile 共享依賴樞紐（`.dsh/profiles/node_modules`）取 `schemastery`（設定 schema）與 `zod`（投影 schema）；UserMessage 按 `dsh-llm` 契約手工構造（`id = crypto.randomUUID()`，deep-freeze 由 `session.append` 的 adopt 快照階段完成）。
- **append 重入規避**：`session/event` 觀察者回呼執行在 `turn/end` 那次 append 的發布邊界之內（dsh-session 在 dispatch 前置 `entry.appending`、`finally` 復位），同步 append 會被拒絕 —— 因此延後到 `queueMicrotask`（微任務在本次同步棧含 `finally` 復位之後才執行）。
- **effect 紀律**：設定註冊的退避重試計時器包裝在 `ctx.effect()` 中並回傳 `clearTimeout` disposer —— 外掛在重試視窗內被卸載或熱重載時計時器隨 fiber 拆除，不會對已釋放的 ctx 觸發註冊（極老環境無 `ctx.effect` API 時退化為裸計時器 + ctx 已拆除兜底捕獲）。
- **HMR 安全**：`core.js` 匯入帶 `?v=1` 快取破壞（HMR 重載按 URL 作為鍵值）；設定註冊遇到熱重載競爭條件（duplicate）時自動退避重試（最多 8 次，間隔 `400ms × attempts`）。
- **投影註冊雙軌**：優先 `ctx.root.get('sessionProjections')`（最靠近宿主根的一份），拿不到時回退注入實例；只註冊進注入實例時用戶端可能讀不到投影單元，推送內文走降級路徑 —— 屬盡力而為，不影響會話內系統訊息。

---

## 專案結構

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

## 開發與除錯

語法驗證（零建構，`prepublishOnly` 同款檢查）：

```bash
npm run build
```

發布（發布前自動執行 `prepublishOnly` 語法驗證）：

```bash
npm publish --registry=https://registry.npmjs.org --access public
```

離線驗證：解出會話日誌中所有 plugin-source 事件與 `turn/end` 尾部序列（不傳路徑則自動選 `~/.dsh/sessions` 下最新會話）：

```bash
node scripts/verify-notice.mjs <session.jsonl.zstd>
```

### 除錯入口

| 入口 | 內容 |
| --- | --- |
| `~/.dsh/session-complete-notify.log` | 宿主診斷日誌：設定註冊、重試與失敗、投影註冊、附加失敗堆疊 |
| 瀏覽器 console `[dsh-session-notify-client]` | 用戶端日誌：權限狀態、通知展示、設定儲存 |
| `window.__dsch_notify_debug.readNotice(id)` | 手動讀取指定會話的最新通知內文 |
| `window.__dsch_notify_debug.snapshotDebug(id)` | 會話尾部節點類型 + notice 數量 + 最近內文（前 200 字） |

---

## 常見問題

<details>
<summary><b>npm install 之後為什麼不自動掛載？</b></summary>

這是 DSH 官方設計：`npm install` 只把套件裝進依賴樹，不註冊外掛。自動掛載的唯一途徑是 `dsh plugin add` —— 它讀取套件內 `dsh.bundle` manifest（此外掛自 0.1.3 起宣告）並自動套用 `cordis.patch.yml`。參見[安裝](#安裝)。

</details>

<details>
<summary><b>為什麼「中斷」（interrupted）不提醒？</b></summary>

`interrupted` 是崩潰復原後由持久化後端補寫的孤兒輪次關閉標記，使用者視角的「完成」不包含它（否則復原會話會洗版誤報）。確有需要可在宿主設定的 `reasons` 中加入。

</details>

<details>
<summary><b>背景會話（沒開啟視窗的）也會推送嗎？</b></summary>

會。用戶端從會話清單快照觀測所有會話的 `running` 邊緣；內文優先取宿主投影 —— 宿主為所有會話（含背景）維護投影單元，因此推送內文跨會話一致。投影不可用時降級為事件視窗或工作區資訊。

</details>

<details>
<summary><b>儲存設定後為什麼提示重新整理頁面？</b></summary>

宿主在註冊命名空間時讀取一次設定，用戶端 bundle 在頁面載入時組裝。儲存後點「點擊重新整理」讓兩側重新讀取，新語言、模板即生效。

</details>

<details>
<summary><b>快取命中率、速度資料從哪來？為什麼有時是空的？</b></summary>

來自官方 `sessionProjections`（`tokenUsage`、`sessionStats`），與 dsh-web-ui 狀態列同口徑。宿主讀取投影快照失敗或資料尚未就緒時，回退為本地用量彙總估算，仍無資料則該項留空（標籤插了也不顯示）。另外，這兩項只在自訂模板中透過 `{cache}`、`{tps}` 插入時才出現，預設文案不含。

</details>

<details>
<summary><b>通知內文裡的錯誤資訊太長、有換行怎麼辦？</b></summary>

摘要行（收合行）與錯誤詳情都會單行化並截斷：摘要 120 字元、模板 `{error}` 80 字元、預設文案的錯誤詳情 40 字元，超長以省略號結尾。

</details>

<details>
<summary><b>可以自訂系統通知的圖示或音效嗎？</b></summary>

目前版本使用瀏覽器預設通知樣式，不注入自訂圖示或音效，toast 為固定深色卡片。如需這些能力歡迎提 Issue 或 PR。

</details>

<details>
<summary><b>為什麼 Edge 推不了系統通知？QQ 瀏覽器為什麼只有頁內橫幅（內建推送彈出視窗）？</b></summary>

兩者都是瀏覽器行為，外掛無法強制：

- **Edge / Chrome**：對"不熟悉"的網站會**自動封鎖通知**（網址列出現「通知已封鎖」）。點擊網址列左側權限圖示 → 網站設定 → 通知 → 允許即可恢復，之後正常彈 Windows 通知中心。也可在瀏覽器通知設定中關閉「自動封鎖」。
- **QQ 瀏覽器等國產 Chromium 殼**：把 `Notification` 固定渲染為**瀏覽器內建的頁內推送彈出視窗**（頁面頂部/角落橫幅，不經 Windows 通知中心），且無系統通知選項。三種推送方式的實際表現：
  - `雙通道` → 瀏覽器內建彈出視窗 + 外掛 toast，頁內兩個提示；
  - `僅系統通知` → 無效（QQ 瀏覽器永遠渲染為頁內彈出視窗）；
  - `僅頁內提示` → 瀏覽器內建彈出視窗不出現，頁內只有外掛自帶的小 toast（推薦）。
  設定面板每個原因的「傳送」測試按鈕同樣按此規則渲染。
- **Firefox**：視窗聚焦時通知顯示為頁內橫幅，失焦/最小化才進系統通知中心；權限需在網址列手動允許。
- 另注意：`http://IP` 存取（非安全上下文）時 `Notification` 不存在，任何瀏覽器都彈不了系統通知。

設定面板「通知權限」區域會即時顯示目前狀態與對應操作指引。

</details>

---

## 更新紀錄

| 版本 | 日期 | 變更 |
| --- | --- | --- |
| **0.1.11** | 2026-08-29 | 新增**自訂通知圖片**：① 模板「＋ 插入資訊」新增**圖片**標籤——插入 `{image}` 並選擇本機圖片（**自動壓縮至 512px 寬、按通知顯示比例 16:9 居中裁切**，編輯器內顯示為帶縮圖的小標籤），按原因獨立上傳、儲存於設定文件（正文渲染時剝除，不寫入會話日誌）；② **通知大圖/通知圖示改為上傳卡片**（空態 = 圓角矩形 + 號，點擊上傳；**大圖 512×288（16:9 居中裁切）、圖示 128×128（1:1 方形居中裁切）**；已上傳顯示縮圖，右上角 × 刪除）——裁切保證上傳的圖完整顯示在通知卡片中，不被系統按顯示區域硬裁；③ **推送標題的「＋ 插入資訊」**可插入任意資訊位（會話標題/用時/消耗/快取命中/速度），不再只有會話標題；設定面板「通知圖片」區顯示**處理方式說明**（裁切比例）與**上傳後的縮圖預覽**；④ **按原因指定通知圖示**（模板插入 `{icon}` 標籤 + 本機上傳，128×128 方形，優先於全域圖示）；⑤ **刪除 `{image}`/`{icon}` 標籤即清除該原因的圖片/圖示資料**；⑥ **佈局優化：「正文模板 × 5」改為摺疊區（預設收起保持面板簡潔，頭部顯示已自訂條數，點擊展開）**；⑦ **佈局優化②：通知大圖/圖示上傳卡片並排一行（中間留白）；推送標題與按原因自訂標題合併為「標題」摺疊區（預設收起）；摺疊指示改為三角形圖示（移除「展開/收起」文案，減少 i18n 負擔）**；⑧ **互動優化：推送標題改為 Chip 編輯器（插入的資訊顯示為膠囊標籤，不再暴露 `{title}` 等代碼）；通知大圖/圖示順序調換（圖示在前）；「正文模板 × 5」改名為「內容」；圖片/圖示縮圖點擊可全螢幕預覽大圖（lightbox），標籤只有點 × 才刪除（防誤刪）**；⑨ **預覽統一為完整原圖：上傳時同時保存裁切版（通知用）與等比完整版（1024px，lightbox 查看原圖用），卡片與標籤的放大預覽都顯示未裁切的原始圖像；摺疊三角形圖示放大**；⑩ **標題資訊位修復：通知標題裡的 `{duration}` `{usage}` `{error}` `{cache}` `{tps}` 會替換為會話實際值，不再洩漏代碼文字（編輯時膠囊、發送時真實資料）；「內容」改為一行式佈局（原因標籤 + 編輯器 + 「+/-」插入按鈕 + 紙飛機發送按鈕）**；⑪ **細節：移除內容行下方的即時預覽（更緊湊）；內容編輯器內邊距收窄（compact）；「+/-」與紙飛機按鈕改矩形邊框、垂直居中**；⑫ **刪除體驗修復：內容刪空後不再復原為預設文案（改顯示佔位提示），且刪空後游標自動回到末尾——按住 Backspace 可連續刪除；「+/-」改用 SVG 線條圖示（相對按鈕邊框精確置中）；紙飛機圖示逆時針旋轉 30°**；⑬ **佔位與預設文案：預設預設（空模板）時編輯器直接顯示預設文案（所見即所推）；編輯後刪空顯示「留空則使用預設文案」佔位——改用 CSS 偽元素實現（與原生 input placeholder 一致：不可選取、不可刪除），取代原可複製的佔位文字**；⑭ **細節②：推送標題佔位描述改為「通用推送標題，留空時則使用預設標題，優先級低於下方自訂標題」，空編輯器點擊時游標移到最前（輸入文字從最左開始，與原生 placeholder 一致）；紙飛機圖示再逆時針轉 30°（共 60°）；「內容」原因標籤改為自適應寬度（編輯器緊貼標籤文字）；編輯器高度統一（box-sizing border-box + min-height 38px，與普通輸入框一致）**；⑮ **細節③：原因標籤統一為固定 70px 寬（內容與按原因自訂標題一致）；Backspace/Delete 刪除標籤改為手動刪除並恢復游標到刪除位置（不再跳到編輯器開頭）；傳送按鈕圖示更換為鈴鐺（推送語義）；自訂預設現在同時儲存通知大圖/圖示（含完整預覽版），預設預設保持留空**；各原因「傳送」測試按鈕同樣生效；僅系統通知通道生效（頁內 toast 為文字卡片） |
| **0.1.10** | 2026-08-29 | 「推送標題」改為原生輸入框（原生佔位提示：不可複製、輸入才消失、清空恢復；「＋ 會話標題」在游標處插入 `{title}`）；文件補充 QQ 瀏覽器內建推送彈出視窗說明（三種推送方式的實際表現 + 傳送按鈕測試同規則） |
| **0.1.9** | 2026-08-29 | 推送標題支援**按原因自訂**（收合區 UI，預設收合不臃腫；留空時各原因用差異化預設標題：任務已完成/任務出錯/任務已中止/任務被阻塞/任務達到輸出上限，5 語言）；投影升級為物件（kind/text/title）承載 host 渲染好的標題；重置按鈕**保留目前語言**；預設文案內嵌「會話標題」標籤（會話「{title}」已完成，無標題自動回退）；設定面板模板預覽同步；「＋插入資訊」插入標籤後不再自動收合；刪除目前使用的自訂預設自動切回預設；模板預覽修復（點擊不消失、輸入才隱藏、清空恢復）；每個原因新增「傳送」按鈕（一鍵發目前模板渲染的測試通知） |
| **0.1.8** | 2026-08-29 | 預設推送標題改為「任務已完成」（`{title}` 仍可引用會話標題）；預設文案按結束原因差異化表達（完成緊湊括號式 / 中止·阻塞拆句 / 出錯錯誤前置 / 上限附建議，5 語言）；設定面板新增「重置」按鈕一鍵還原預設 |
| **0.1.7** | 2026-08-29 | 修復 0.1.6 的設定卡片崩潰：`notificationPermissionRow`/`requestPermissionNow` 曾引用 Card 元件內 state（作用域外）導致渲染 ReferenceError、整個設定卡片消失；改為自包含 + 回呼傳參 |
| **0.1.6** | 2026-08-29 | 設定面板新增「通知權限」狀態區（授權狀態即時顯示 + 一鍵請求授權按鈕 + 被封鎖時的網址列操作指引）；授權改為**使用者手勢內請求**（Chromium 忽略非手勢自動請求，Edge 對不熟悉網站自動封鎖通知的典型場景得以解決）；FAQ 新增瀏覽器差異說明 |
| **0.1.5** | 2026-08-29 | 新增「推送方式」設定（雙通道 / 僅系統通知 / 僅頁內提示）：解決 QQ 瀏覽器等 Chromium 殼把 `Notification` 渲染成頁內橫幅導致的雙提示；`pushMode` 加入設定 schema 與設定面板 |
| **0.1.4** | 2026-08-28 | 補充完整解除安裝支援：`dispose` 生命週期收尾（host 置解除安裝旗標抑制待附加微任務；client 清理內文輪詢計時器、`__dsch_notify_debug` 鉤子、toast 容器）；解除安裝文件與 FAQ 同步 |
| **0.1.3** | 2026-08-28 | 宣告官方 `dsh.bundle` manifest（`dsh plugin add` 一條指令自動掛載）；settings 重試計時器改為 `ctx.effect()` 包裝（Cordis effect 紀律）；安裝文件重排 |
| 0.1.2 | 2026-08-27 | 套件更名至 `@telosmaylx` scope（npm 使用者名稱作用域） |
| 0.1.1 | 2026-08-27 | GitHub、npm 安裝方式文件化 |
| 0.1.0 | 2026-08-26 | 初始版本：會話內系統訊息 + 瀏覽器推送 + 官方設定面板 |

---

## 貢獻

歡迎 Issue 與 PR：

1. Fork 儲存庫並新建分支（`feat/xxx`）
2. 改動後執行 `npm run build` 做語法驗證
3. 送出 PR，說明動機與驗證方式

送出前請遵守 [Cordis 開發教學](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial) 紀律：

- Cordis 之外的資源（計時器、訂閱、watcher）必須包裝在 `ctx.effect()` 中並回傳 disposer；
- 設定項明確 `id` 防止編輯漂移；
- 外掛須宣告 `dsh.bundle` manifest 才能被 `dsh plugin add` 辨識安裝。

---

## 相關連結

- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) —— DSH 外掛精選清單（投稿規範：`dsh.bundle` 是安裝唯一憑證）
- [Cordis 開發教學](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial) —— 外掛開發全流程（01-07 章）
- [npm 套件首頁](https://www.npmjs.com/package/@telosmaylx/dsh-session-notify)
- [GitHub 儲存庫](https://github.com/TelosmaYLX/dsh-session-notify)

---

## 授權條款

[MIT](./LICENSE) © dsh-session-notify contributors
