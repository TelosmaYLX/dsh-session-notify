/* eslint-disable no-restricted-globals */
/**
 * dsh-session-notify —— 浏览器端：完成推送 + 设置卡片。
 *
 * 与宿主插件（lib/index.js）配对：
 *  - 宿主把系统消息写进会话日志（内容随设置面板的语言/自定义模板定制）；
 *  - 这里负责「推送提醒」（系统通知每次独立 tag + toast 永远展示），
 *    并在官方「设置 → 插件」面板注册设置卡片（settings.plugin.item keyed slot、
 *    宿主同名 settings 命名空间），让用户改语言/模板/开关。
 *
 * 打包格式：官方 client bundle 契约——`window.__ModuleLoader__.load({id, factory})`，
 * factory 由浏览器侧模块表同步 require 驱动（本 bundle 仅 require('react') 用于卡片）。
 */
window.__ModuleLoader__.load({
  id: '@telosmaylx/dsh-session-notify',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    /** Cordis loader 诊断用插件名（客户端侧）。 */
    exports.name = 'session-complete-notify-client'
    /** 等待客户端服务就绪：会话列表（推送边沿）、插槽（设置卡片）、设置作用域（读写）。 */
    exports.inject = ['sessions', 'slots', 'settingsScope']

    var PLUGIN_TAG = 'dsh-session-notify'
    var SETTINGS_NS = 'session-complete-notify'
    var NOTICE_PROJECTION_KEY = 'session-complete-notify' // 宿主投影单元 key（每个会话都带）

    /** 语言代码与在原声展示名（所有语言面板统一用各自原声名）。 */
    var LANG_OPTIONS = [
      { id: 'zh', label: '简体中文' },
      { id: 'zh-tw', label: '繁體中文' },
      { id: 'en', label: 'English' },
      { id: 'ja', label: '日本語' },
      { id: 'ko', label: '한국어' },
    ]
    var LANG_IDS = ['zh', 'zh-tw', 'en', 'ja', 'ko']

    /**
     * 设置面板 i18n：标题/预设/字段/标签/按钮/提示，5 语言。
     * 按 cur.language 取用；切换语言即时重渲染整个面板。
     */
    var I18N = {
      zh: {
        title: '会话完成提醒', subtitle: '完成推送的语言与文案模板（保存后刷新生效）',
        preset: '预设', choosePreset: '选择预设…', language: '语言',
        fields: { completed: '完成', error: '出错', aborted: '中止', blocked: '阻塞', 'max-tokens': '输出上限' },
        titleLabel: '推送标题', titleHint: '留空则使用会话标题',
        kindLabels: { completed: '会话已完成', error: '会话出错', aborted: '会话已中止', blocked: '会话被阻塞', 'max-tokens': '会话达到输出上限' },
        tokens: { title: '会话标题', label: '完成标签', duration: '用时', usage: '消耗', error: '错误', cache: '缓存命中', tps: '速度 TPS' },
        samples: { title: '示例会话', label: '会话已完成', duration: '12 秒', usage: '1,240 输入 / 3,560 输出', error: '连接超时', cache: '96.5%', tps: '92 tok/s' },
        presets: { custom: '自定义预设', unnamed: '未命名预设', default: '默认', playful: '轻松风格 🎉', formal: '正式简洁', detail: '详细报告' },
        placeholder: '自定义文案：点「＋ 插入信息」，或直接输入文字',
        insertInfo: '＋ 插入信息', insertTitle: '在光标处插入信息', preview: '预览：',
        skipSubagents: '跳过子代理会话',
        pushMode: '推送方式', pushDual: '系统通知 + 页内提示', pushSystem: '仅系统通知', pushToast: '仅页内提示',
        discard: '放弃', save: '保存', saving: '保存中…', saved: '已保存 ✓ · 刷新页面后生效', saveFailed: '保存失败：', refresh: '点击刷新',
        saveAs: '新增', update: '修改', remove: '删除', presetNamePlaceholder: '预设名称', confirm: '确定', cancel: '取消', customSaved: '自定义预设已保存', customUpdated: '自定义预设已更新', customDeleted: '自定义预设已删除', saveAsTitle: '将当前配置另存为自定义预设', updateTitle: '更新当前自定义预设', removeTitle: '删除当前自定义预设', fromPreset: '来自：', modifiedSuffix: ' · 已修改',
      presetNameRequired: '请输入预设名称',
      loading: '加载中…', unavailable: '设置不可用（宿主未注册命名空间）',
      },
      'zh-tw': {
        title: '會話完成提醒', subtitle: '完成推送的語言與文案模板（儲存後重新整理生效）',
        preset: '預設', choosePreset: '選擇預設…', language: '語言',
        fields: { completed: '完成', error: '出錯', aborted: '中止', blocked: '阻塞', 'max-tokens': '輸出上限' },
        titleLabel: '推送標題', titleHint: '留空則使用會話標題',
        kindLabels: { completed: '會話已完成', error: '會話出錯', aborted: '會話已中止', blocked: '會話被阻塞', 'max-tokens': '會話達到輸出上限' },
        tokens: { title: '會話標題', label: '完成標籤', duration: '用時', usage: '消耗', error: '錯誤', cache: '快取命中', tps: '速度 TPS' },
        samples: { title: '範例會話', label: '會話已完成', duration: '12 秒', usage: '1,240 輸入 / 3,560 輸出', error: '連線逾時', cache: '96.5%', tps: '92 tok/s' },
        presets: { custom: '自訂預設', unnamed: '未命名預設', default: '預設', playful: '輕鬆風格 🎉', formal: '正式簡潔', detail: '詳細報告' },
        placeholder: '自訂文案：點「＋ 插入資訊」，或直接輸入文字',
        insertInfo: '＋ 插入資訊', insertTitle: '在游標處插入資訊', preview: '預覽：',
        skipSubagents: '跳過子代理會話',
        pushMode: '推送方式', pushDual: '系統通知 + 頁內提示', pushSystem: '僅系統通知', pushToast: '僅頁內提示',
        discard: '放棄', save: '儲存', saving: '儲存中…', saved: '已儲存 ✓ · 重新整理頁面後生效', saveFailed: '儲存失敗：', refresh: '點擊重新整理',
        saveAs: '新增', update: '修改', remove: '刪除', presetNamePlaceholder: '預設名稱', confirm: '確定', cancel: '取消', customSaved: '自訂預設已儲存', customUpdated: '自訂預設已更新', customDeleted: '自訂預設已刪除', saveAsTitle: '將當前設定另存為自訂預設', updateTitle: '更新目前自訂預設', removeTitle: '刪除目前自訂預設', fromPreset: '來自：', modifiedSuffix: ' · 已修改',
      presetNameRequired: '請輸入預設名稱',
      loading: '載入中…', unavailable: '設定不可用（宿主未註冊命名空間）',
      },
      en: {
        title: 'Session completion alert', subtitle: 'Language & message templates for completion pushes (refresh after save)',
        preset: 'Preset', choosePreset: 'Choose preset…', language: 'Language',
        fields: { completed: 'Completed', error: 'Error', aborted: 'Aborted', blocked: 'Blocked', 'max-tokens': 'Token cap' },
        titleLabel: 'Push title', titleHint: 'Leave empty to use the session title',
        kindLabels: { completed: 'Session completed', error: 'Session failed', aborted: 'Session aborted', blocked: 'Session blocked', 'max-tokens': 'Session hit the output-token cap' },
        tokens: { title: 'Session title', label: 'Label', duration: 'Duration', usage: 'Usage', error: 'Error', cache: 'Cache hit', tps: 'Speed TPS' },
        samples: { title: 'Example session', label: 'Session completed', duration: '12s', usage: '1,240 in / 3,560 out', error: 'connection timeout', cache: '96.5%', tps: '92 tok/s' },
        presets: { custom: 'Custom preset', unnamed: 'Untitled preset', default: 'Default', playful: 'Playful 🎉', formal: 'Formal', detail: 'Detailed report' },
        placeholder: 'Custom text: use “＋ Insert info”, or type directly',
        insertInfo: '＋ Insert info', insertTitle: 'Insert info at cursor', preview: 'Preview: ',
        skipSubagents: 'Skip subagent sessions',
        pushMode: 'Push channel', pushDual: 'System + in-page', pushSystem: 'System only', pushToast: 'In-page only',
        discard: 'Discard', save: 'Save', saving: 'Saving…', saved: 'Saved ✓ · refresh page to apply', saveFailed: 'Save failed: ', refresh: 'Refresh',
        saveAs: 'New', update: 'Edit', remove: 'Delete', presetNamePlaceholder: 'Preset name', confirm: 'OK', cancel: 'Cancel', customSaved: 'Custom preset saved', customUpdated: 'Custom preset updated', customDeleted: 'Custom preset deleted', saveAsTitle: 'Save current config as custom preset', updateTitle: 'Update current custom preset', removeTitle: 'Delete current custom preset', fromPreset: 'From: ', modifiedSuffix: ' · modified',
      presetNameRequired: 'Please enter a preset name',
      loading: 'Loading…', unavailable: 'Unavailable (namespace not registered on host)',
      },
      ja: {
        title: 'セッション完了通知', subtitle: '完了プッシュの言語とメッセージテンプレート（保存後に再読み込みで反映）',
        preset: 'プリセット', choosePreset: 'プリセットを選択…', language: '言語',
        fields: { completed: '完了', error: 'エラー', aborted: '中止', blocked: 'ブロック', 'max-tokens': 'トークン上限' },
        titleLabel: 'プッシュタイトル', titleHint: '空欄の場合はセッションタイトルを使用',
        kindLabels: { completed: 'セッション完了', error: 'セッションエラー', aborted: 'セッション中止', blocked: 'セッションがブロックされました', 'max-tokens': '出力トークン上限に到達' },
        tokens: { title: 'セッションタイトル', label: '完了ラベル', duration: '所要時間', usage: '消費', error: 'エラー', cache: 'キャッシュヒット', tps: '速度 TPS' },
        samples: { title: 'サンプルセッション', label: 'セッション完了', duration: '12 秒', usage: '1,240 入力 / 3,560 出力', error: '接続タイムアウト', cache: '96.5%', tps: '92 tok/s' },
        presets: { custom: 'カスタムプリセット', unnamed: '未命名プリセット', default: 'デフォルト', playful: 'カジュアル 🎉', formal: 'フォーマル', detail: '詳細レポート' },
        placeholder: 'カスタム文面：「＋ 情報を挿入」または直接入力',
        insertInfo: '＋ 情報を挿入', insertTitle: 'カーソル位置に情報を挿入', preview: 'プレビュー：',
        skipSubagents: 'サブエージェントセッションをスキップ',
        pushMode: '通知チャネル', pushDual: 'システム+ページ内', pushSystem: 'システムのみ', pushToast: 'ページ内のみ',
        discard: '破棄', save: '保存', saving: '保存中…', saved: '保存しました ✓ · ページを再読み込み', saveFailed: '保存失敗：', refresh: '再読み込み',
        saveAs: '新規', update: '編集', remove: '削除', presetNamePlaceholder: 'プリセット名', confirm: '決定', cancel: 'キャンセル', customSaved: 'カスタムプリセットを保存しました', customUpdated: 'カスタムプリセットを更新しました', customDeleted: 'カスタムプリセットを削除しました', saveAsTitle: '現在の設定をカスタムプリセットとして保存', updateTitle: '現在のカスタムプリセットを更新', removeTitle: '現在のカスタムプリセットを削除', fromPreset: '由来：', modifiedSuffix: ' · 変更あり',
      presetNameRequired: 'プリセット名を入力してください',
      loading: '読み込み中…', unavailable: '利用不可（ホストに名前空間未登録）',
      },
      ko: {
        title: '세션 완료 알림', subtitle: '완료 푸시의 언어 및 메시지 템플릿(저장 후 새로고침 시 적용)',
        preset: '프리셋', choosePreset: '프리셋 선택…', language: '언어',
        fields: { completed: '완료', error: '오류', aborted: '중단', blocked: '차단', 'max-tokens': '토큰 한도' },
        titleLabel: '푸시 제목', titleHint: '비우면 세션 제목 사용',
        kindLabels: { completed: '세션 완료', error: '세션 오류', aborted: '세션 중단됨', blocked: '세션 차단됨', 'max-tokens': '출력 토큰 한도 도달' },
        tokens: { title: '세션 제목', label: '완료 라벨', duration: '소요 시간', usage: '소모', error: '오류', cache: '캐시 히트', tps: '속도 TPS' },
        samples: { title: '예시 세션', label: '세션 완료', duration: '12초', usage: '1,240 입력 / 3,560 출력', error: '연결 시간 초과', cache: '96.5%', tps: '92 tok/s' },
        presets: { custom: '사용자 지정 프리셋', unnamed: '이름 없는 프리셋', default: '기본', playful: '캐주얼 🎉', formal: '정식', detail: '상세 보고' },
        placeholder: '사용자 지정 문구: "＋ 정보 삽입" 또는 직접 입력',
        insertInfo: '＋ 정보 삽입', insertTitle: '커서 위치에 정보 삽입', preview: '미리보기: ',
        skipSubagents: '하위 에이전트 세션 건너뛰기',
        pushMode: '알림 채널', pushDual: '시스템+페이지 내', pushSystem: '시스템만', pushToast: '페이지 내만',
        discard: '취소', save: '저장', saving: '저장 중…', saved: '저장됨 ✓ · 새로고침 후 적용', saveFailed: '저장 실패: ', refresh: '새로고침',
        saveAs: '추가', update: '수정', remove: '삭제', presetNamePlaceholder: '프리셋 이름', confirm: '확인', cancel: '취소', customSaved: '사용자 지정 프리셋 저장됨', customUpdated: '사용자 지정 프리셋 업데이트됨', customDeleted: '사용자 지정 프리셋 삭제됨', saveAsTitle: '현재 구성을 사용자 지정 프리셋으로 저장', updateTitle: '현재 사용자 지정 프리셋 업데이트', removeTitle: '현재 사용자 지정 프리셋 삭제', fromPreset: '출처: ', modifiedSuffix: ' · 수정됨',
      presetNameRequired: '프리셋 이름을 입력하세요',
      loading: '불러오는 중…', unavailable: '사용 불가(호스트에 네임스페이스 미등록)',
      },
    }

    /** 取当前语言的文案表（未知语言回落 zh）。 */
    function tOf(lang) {
      return I18N[lang] || I18N.zh
    }
    var TOAST_TTL_MS = 10000
    var TOAST_MAX = 3 // 同时保留的 toast 上限：超出则移除最旧（新弹窗永远可见）
    var permissionRequested = false // 每页加载只发起一次授权请求（后续完成事件不再触发询问）

    exports.apply = function apply(ctx) {
      var list = ctx.sessions.list
      var notifyScope = null
      try { notifyScope = ctx.settingsScope.bind({ namespace: SETTINGS_NS }) } catch (e) { /* 无设置作用域时用默认 */ }
      var prevRunning = new Map() // sessionId -> 上次观测的 running 位
      var primed = false // 首次观测只记录基线（已在 idle 的会话不补发），与官方 sidebar 提醒同策略
      var retryTimer = null // 完成推送正文轮询定时器（卸载时清除：不在已拆 fiber 上继续弹通知）
      var debugHook = null // window.__dsch_notify_debug 引用（卸载时按引用删除，防闭包泄漏）

      try {
        console.log('[' + PLUGIN_TAG + '-client] active, watching session activity for completion pushes')
      } catch (e) { /* noop */ }

      function onSnapshot() {
        var snap = list.getSnapshot()
        if (!snap || typeof snap.byId !== 'object' || snap.byId === null) return
        var entries = Object.keys(snap.byId)
        for (var i = 0; i < entries.length; i++) {
          var id = entries[i]
          var s = snap.byId[id]
          if (!s || typeof s.running !== 'boolean') continue
          var was = prevRunning.get(id)
          prevRunning.set(id, s.running)
          if (!primed) continue
          // 完成事件：running true → false 的边沿
          if (was === true && s.running === false) {
            if (s.origin === 'subagent') continue // 子代理会话由父会话编排
            pushCompletion(id, s)
          }
        }
        primed = true
      }

      /**
       * 完成推送：标题 = 哪个会话（displayTitle），正文优先取宿主刚写入的
       * 系统消息全文（含用时/token/错误详情，来自会话事件窗口的 notice 节点）。
       * 宿主通知经 mux 到达有 1~3 秒延迟，轮询窗口内取到即用，取不到降级
       * 为工作区信息。
       */
      function pushCompletion(id, s) {
        var name = s.displayTitle || s.title || id
        var cwdLine = workspaceLine(s)
        var start = Date.now()
        function attempt() {
          var notice = readNoticeAny(id)
          if (notice || Date.now() - start > 6000) {
            retryTimer = null
            notifyUser(pushTitle(name, notice ? '' : ' 已完成'), notice || (cwdLine ? cwdLine + ' · ' : '') + '详情见会话内系统消息', pushModeOf())
            return
          }
          retryTimer = setTimeout(attempt, 400)
        }
        attempt()
      }

      /** 推送通道：读设置快照；未设置/异常回落 dual（保持原双通道行为）。 */
      function pushModeOf() {
        try {
          if (notifyScope) {
            var st = notifyScope.getSnapshot()
            if (st && st.value && ['dual', 'system', 'toast'].indexOf(st.value.pushMode) >= 0) return st.value.pushMode
          }
        } catch (e) { /* 默认 */ }
        return 'dual'
      }

      /** 推送标题：用户模板（{title} = 会话标题）；无通知时附带完成标记。 */
      function pushTitle(name, suffix) {
        var tpl = '{title}'
        try {
          if (notifyScope) {
            var st = notifyScope.getSnapshot()
            if (st && st.value && typeof st.value.titleTemplate === 'string' && st.value.titleTemplate.trim() !== '') tpl = st.value.titleTemplate
          }
        } catch (e) { /* 默认 */ }
        var out = String(tpl).replaceAll('{title}', name).trim()
        if (out === '') out = name
        return out + (suffix || '')
      }

      /**
       * 通知正文优先级：
       *  1. 宿主投影（session-complete-notify key）——每个会话都推，后台会话也有全文；
       *  2. 会话事件窗口里的 notice 节点（正在看的会话，落盘后立刻可用）；
       *  3. 无 → 降级（工作区信息）。
       */
      function readNoticeAny(id) {
        try {
          var snap = list.getSnapshot()
          var cur = snap && snap.byId && snap.byId[id]
          var pv = cur && cur.projectionValues && cur.projectionValues[NOTICE_PROJECTION_KEY]
          if (typeof pv === 'string' && pv.trim() !== '') return pv
        } catch (e) { /* 投影缺失 → 走窗口路径 */ }
        return readNotice(id)
      }

      /** 从会话事件窗口找宿主写入的最新 notice 全文（kind=context + form=notice）。 */
      function readNotice(id) {
        try {
          var binding = ctx.sessions.binding(id)
          var session = binding && binding.session
          if (!session || typeof session.getSnapshot !== 'function') return null
          var snap = session.getSnapshot()
          var nodes = snap && snap.nodes
          if (!Array.isArray(nodes)) return null
          for (var i = nodes.length - 1; i >= 0; i--) {
            var node = nodes[i]
            if (!node || node.kind !== 'context' || node.form !== 'notice') continue
            var text = ''
            var blocks = node.content || []
            for (var j = 0; j < blocks.length; j++) {
              if (blocks[j] && blocks[j].type === 'text') text += blocks[j].text || ''
            }
            if (text) return text
          }
          return null
        } catch (e) {
          return null
        }
      }

      /** 工作区一行（取 cwd 最后一段）；无 cwd 返回空串。 */
      function workspaceLine(s) {
        if (!s.cwd) return ''
        var parts = String(s.cwd).split(/[\\/]/).filter(Boolean)
        return '工作区：' + (parts.length ? parts[parts.length - 1] : s.cwd)
      }

      onSnapshot()
      var dispose = list.subscribe(onSnapshot)

      // 设置卡片（官方「设置 → 插件」面板的 keyed slot）
      try {
        registerSettingsCard(ctx)
      } catch (e) {
        log('settings card registration failed: ' + (e && e.message ? e.message : e))
      }

      // 调试钩子（仅探针/排障用）：window.__dsch_notify_debug
      try {
        if (typeof window !== 'undefined') {
          debugHook = {
            readNotice: readNotice,
            snapshotDebug: function (id) {
              try {
                var binding = ctx.sessions.binding(id)
                var session = binding && binding.session
                if (!session || typeof session.getSnapshot !== 'function') return JSON.stringify({ ok: false, reason: 'no session face' })
                var snap = session.getSnapshot()
                var nodes = Array.isArray(snap && snap.nodes) ? snap.nodes : []
                var tail = nodes.slice(-8).map(function (n) { return (n && n.kind) + (n && n.form ? ':' + n.form : '') })
                var notices = nodes.filter(function (n) { return n && n.kind === 'context' && n.form === 'notice' })
                return JSON.stringify({ ok: true, nodes: nodes.length, tail: tail, notices: notices.length, lastNotice: notices.length ? (notices[notices.length - 1].content || []).map(function (b) { return b.text || '' }).join('').slice(0, 200) : null })
              } catch (e) {
                return JSON.stringify({ ok: false, reason: String(e && e.message) })
              }
            },
          }
          window.__dsch_notify_debug = debugHook
        }
      } catch (e) { /* noop */ }

      // 卸载清理（Cordis 教程第 2 章生命周期纪律）：取消会话订阅、清除正文轮询
      // 定时器（不在已拆 fiber 上继续弹通知）、按引用删除调试钩子（防闭包持有
      // ctx/list 泄漏）、移除页内 toast 容器。settings 卡片为 slot 托管 effect，
      // 自定义预设存于 localStorage（用户数据），两者卸载时均保留。
      function cleanup() {
        try { dispose() } catch (e) { /* 订阅已取消则忽略 */ }
        if (retryTimer !== null) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
        try {
          if (typeof window !== 'undefined' && window.__dsch_notify_debug === debugHook) {
            delete window.__dsch_notify_debug
          }
        } catch (e) { /* noop */ }
        try {
          if (typeof document !== 'undefined') {
            var toastRoot = document.querySelector('[data-dsh-notify-root]')
            if (toastRoot) toastRoot.remove()
          }
        } catch (e) { /* noop */ }
        log('unloaded: subscription, retry timer, debug hook, toast root released')
      }

      // 与宿主插件生命周期一致：ctx.effect 登记清理，fiber 卸载时释放。
      if (ctx.effect && typeof ctx.effect === 'function') {
        ctx.effect(function () {
          return cleanup
        })
      } else {
        try {
          var oc = ((ctx.onDispose && ctx.onDispose(cleanup)) || undefined)
          void oc
        } catch (e) {
          /* 老接口缺失时仅内存泄漏，不影响功能 */
        }
      }
    }

    /**
     * 推送：按 pushMode 决定通道——
     *  - dual（默认）：系统通知（每次独立 tag，避免同 tag 替换/分组折叠导致后续弹窗不可见）+ 页内 toast 保底；
     *  - system：仅系统通知（QQ 浏览器等 Chromium 壳把 Notification 渲染成页内横幅时配合关闭 toast）；
     *  - toast：仅页内 toast（Chromium 壳浏览器推不了 Windows 通知时用——不再调用 Notification API，
     *    浏览器横幅/气泡不会出现，页内只有插件自己的小 toast）。
     */
    function notifyUser(title, body, pushMode) {
      var mode = pushMode === 'system' || pushMode === 'toast' ? pushMode : 'dual'
      try {
        if (mode !== 'toast' && typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            // 每次完成事件的独立 tag：不与前一次互相替换，也不被折叠成一个分组条目
            var n = new Notification(title, { body: body, tag: PLUGIN_TAG + ':' + Date.now(), silent: false })
            try {
              n.onclick = function () { window.focus(); n.close() }
            } catch (e) { /* noop */ }
            log('notification shown: ' + title)
          } else if (Notification.permission === 'default') {
            if (!permissionRequested) {
              permissionRequested = true
              log('notification permission default, requesting…')
              var req = Notification.requestPermission()
              if (req && typeof req.then === 'function') {
                req.then(function (p) {
                  if (p === 'granted') log('notification permission granted (subsequent completions will use it)')
                  else log('notification permission ' + p + ', toast always shows')
                }).catch(function () { /* 权限拒绝 → toast 兜底 */ })
              }
            } else {
              log('notification permission still pending, toast only')
            }
          } else {
            log('notification permission denied, toast shows')
          }
        }
      } catch (e) { /* 环境不支持 Notification → toast 兜底 */ }
      if (mode !== 'system') showToast(title, body)
    }

    function log(message) {
      try { console.log('[' + PLUGIN_TAG + '-client] ' + message) } catch (e) { /* noop */ }
    }

    /** 页内浮动 toast（零依赖，右下角，点击关闭，10 秒自动消失）。 */
    function showToast(title, body) {
      if (typeof document === 'undefined') return
      try {
        var root = document.querySelector('[data-dsh-notify-root]')
        if (!root) {
          root = document.createElement('div')
          root.setAttribute('data-dsh-notify-root', '')
          root.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:system-ui,sans-serif'
          document.body.appendChild(root)
        }
        var el = document.createElement('div')
        el.style.cssText = 'pointer-events:auto;cursor:pointer;background:rgba(28,30,38,0.96);color:#f5f6f8;padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.35);max-width:340px;min-width:220px;opacity:0;transform:translateY(8px);transition:opacity 0.2s,transform 0.2s'
        var t1 = document.createElement('div')
        t1.textContent = title
        t1.style.cssText = 'font-size:13px;font-weight:600;line-height:1.5'
        var t2 = document.createElement('div')
        t2.textContent = body
        t2.style.cssText = 'font-size:12px;line-height:1.5;opacity:0.8;margin-top:2px'
        el.appendChild(t1)
        el.appendChild(t2)
        var close = function () { el.remove() }
        el.addEventListener('click', close)
        // 上限：移除最旧 toast，保证新弹窗始终可见（不被堆叠遮挡/顶出屏幕）
        while (root.children.length >= TOAST_MAX) root.firstChild.remove()
        root.appendChild(el)
        requestAnimationFrame(function () {
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
        })
        setTimeout(close, TOAST_TTL_MS)
      } catch (e) { /* DOM 不可用时放弃 */ }
    }

    // ============ 设置卡片：官方「设置 → 插件」面板 ============

    var REASON_FIELDS = ['completed', 'error', 'aborted', 'blocked', 'max-tokens']
    var REASON_LABELS = { completed: '完成', error: '出错', aborted: '中止', blocked: '阻塞', 'max-tokens': '输出上限' }

    /**
     * 注册设置卡片：settings.plugin.item（keyed，key = 宿主注册的 settings 命名空间）。
     * 面板按命名空间枚举（宿主注册后自动出现），卡片负责表单与保存。
     */
    function registerSettingsCard(ctx) {
      try {
        var react = require('react')
        var Card = makeSettingsCard(react, ctx)
        ctx.slots.inject('settings.plugin.item', function* () {
          yield ctx.slots.register({ name: 'settings.plugin.item', id: PLUGIN_TAG, key: SETTINGS_NS, order: 40 }, Card)
        })
        log('settings card registered (settings.plugin.item key=' + SETTINGS_NS + ')')
      } catch (e) {
        log('settings card skipped: ' + (e && e.message ? e.message : e))
      }
    }

    /** 设置卡片组件。chrome 逐值复刻原生插件卡片（modlens 同款）：
     *  12px 圆角容器、展开/收起两层背景、旋转 chevron 头部、
     *  footer 状态位 + 弃置 ghost + 主色保存按钮；字段用 primitives Input。 */
    function makeSettingsCard(react, ctx) {
      var h = react.createElement
      var useState = react.useState
      var useEffect = react.useEffect
      var useRef = react.useRef
      var scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS })

      var CARD = {
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
        borderRadius: '12px',
        transition: 'border-color .16s, background .16s',
      }
      var SUBTLE = 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.8))'
      var DIVIDER = '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))'
      var SELECT_STYLE = {
        appearance: 'none', width: '100%', padding: '8px 12px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
        background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '13px',
        // 关键：声明深色 color-scheme——Chromium 的原生下拉弹层按它渲染；
        // 否则弹层保持白底而文字继承深色主题的浅色 → 白底白字不可见。
        colorScheme: 'dark',
      }
      /** option 显式深色（弹层若不跟随 colorScheme，也至少保证文字/底均深色）。 */
      var OPTION_STYLE = {
        color: 'var(--dsw-alias-label-primary, #e8e8ea)',
        background: 'var(--dsw-alias-bg-layer-2, #26272c)',
      }
      /** 深色 option：style + 常规属性一次给齐。 */
      function darkOption(attrs, children) {
        return h('option', Object.assign({ style: OPTION_STYLE }, attrs || {}), children)
      }
      var GHOST = {
        appearance: 'none', font: 'inherit', fontSize: '13px', lineHeight: 1.5, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', borderRadius: '8px',
        padding: '5px 14px', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)',
      }
      var PRIMARY = {
        appearance: 'none', font: 'inherit', fontSize: '13px', lineHeight: 1.5, cursor: 'pointer',
        border: 0, borderRadius: '8px', padding: '5px 14px',
        background: 'var(--dsw-alias-label-primary, currentColor)', color: 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.05))',
      }

      /** 预设：应用后继续可手改，保存才写入宿主。（结构见下方统一声明） */

      /** 可插入的动态信息 token 名（标签/示例值按语言从 I18N 取）。
       *  注意：{label} 已从插入菜单移除（旧模板中的 {label} 仍兼容渲染/预览）。 */
      var TOKEN_KEYS = ['title', 'duration', 'usage', 'error', 'cache', 'tps']

      /** 系统预设：仅保留「默认」（作为基线，其余以自定义预设承载）。 */
      var PRESETS = [
        { id: 'default', labelKey: 'default', language: 'zh', titleTemplate: '', templates: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' } },
      ]

      /** 本地存储的用户自定义预设库。 */
      var CUSTOM_PRESETS_KEY = 'dsh-scn-custom-presets'
      function loadCustomPresets() {
        try {
          var raw = window.localStorage.getItem(CUSTOM_PRESETS_KEY)
          var list = raw ? JSON.parse(raw) : []
          return Array.isArray(list) ? list : []
        } catch (e) { return [] }
      }
      function saveCustomPresets(list) {
        try { window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(list)) } catch (e) { /* noop */ }
      }

      /** 当前（语言+模板）与哪个预设一致；无匹配返回 'custom'（自定义预设）。 */
      function presetIdOf(cur, customPresets) {
        var i
        for (i = 0; i < PRESETS.length; i++) {
          if (matchesPreset(cur, PRESETS[i])) return PRESETS[i].id
        }
        for (i = 0; i < (customPresets || []).length; i++) {
          if (customPresets[i] && matchesPreset(cur, customPresets[i])) return customPresets[i].id
        }
        return 'custom'
      }

      /** 预设自动同步辅助：未命名预设识别/编号/命名。 */
      function isUnnamedId(id) {
        return id === 'unnamed' || /^unnamed-\d+$/.test(id)
      }
      function unnamedNumber(id) {
        if (id === 'unnamed') return 1
        var m = /^unnamed-(\d+)$/.exec(id)
        return m ? parseInt(m[1], 10) : 0
      }
      function nextUnnamedNumber(list) {
        var max = 0
        for (var i = 0; i < (list || []).length; i++) {
          if (isUnnamedId(list[i].id)) max = Math.max(max, unnamedNumber(list[i].id))
        }
        return max + 1
      }
      function unnamedDisplayName(id, t) {
        var n = unnamedNumber(id)
        return n > 1 ? t.presets.unnamed + ' ' + n : t.presets.unnamed
      }

      /** 表单（语言+模板）与某预设内容是否一致（用于「已修改」指示）。 */
      function matchesPreset(cur, p) {
        if (!p) return false
        if (p.language !== (LANG_IDS.indexOf(cur.language) >= 0 ? cur.language : 'zh')) return false
        if (String(cur.titleTemplate ?? '') !== String(p.titleTemplate ?? '')) return false
        for (var j = 0; j < REASON_FIELDS.length; j++) {
          if (templateOf(cur, REASON_FIELDS[j]) !== String(p.templates[REASON_FIELDS[j]] ?? '').trim()) return false
        }
        return true
      }

      /** 把模板拆成 [text|token] 片段（token = {label|duration|usage|error|cache|tps}）。 */
      function parseTemplate(tpl) {
        var parts = []
        var re = /\{(title|label|duration|usage|error|cache|tps)\}/g
        var last = 0
        var m
        while ((m = re.exec(tpl)) !== null) {
          if (m.index > last) parts.push({ type: 'text', value: tpl.slice(last, m.index) })
          parts.push({ type: 'token', key: m[1] })
          last = re.lastIndex
        }
        if (last < tpl.length) parts.push({ type: 'text', value: tpl.slice(last) })
        return parts
      }
      /** 从模板中移除第一个指定 token（点击预览胶囊 × 时用）。 */
      function removeToken(tpl, key) {
        return String(tpl).replace(new RegExp('\\{' + key + '\\}'), '')
      }

      /** 扁平化读取：草稿键 tpl-<field> 优先，其次已保存的 templates[<field>]。
       *  兼容清理：{label} 已全面移除——读取时直接剥除（保存即写净）。 */
      function templateOf(cur, field) {
        var tpl = (cur && cur.templates) || {}
        return String(cur && cur['tpl-' + field] !== undefined ? cur['tpl-' + field] : (tpl[field] ?? ''))
          .replace(/\{label\}/g, '').trim()
      }
      /** 扁平快照（用于 dirty 对比与模板打包）。 */
      function flatOf(cur) {
        var out = {
          language: LANG_IDS.indexOf(cur.language) >= 0 ? cur.language : 'zh',
          titleTemplate: String(cur.titleTemplate ?? ''),
          includeDuration: !!cur.includeDuration, includeUsage: !!cur.includeUsage,
          pushMode: ['dual', 'system', 'toast'].indexOf(cur.pushMode) >= 0 ? cur.pushMode : 'dual',
        }
        for (var i = 0; i < REASON_FIELDS.length; i++) out['tpl-' + REASON_FIELDS[i]] = templateOf(cur, REASON_FIELDS[i])
        return out
      }
      function sameFlat(a, b) {
        var keys = Object.keys(a)
        if (keys.length !== Object.keys(b).length) return false
        for (var i = 0; i < keys.length; i++) if (a[keys[i]] !== b[keys[i]]) return false
        return true
      }

      var InputPrimary = null
      try {
        var ui = require('@deepseek-ai/dsh-client-ui-primitives')
        InputPrimary = (ui && ui.Input) || null
      } catch (e) {
        log('primitives Input unavailable, styled fallback: ' + (e && e.message ? e.message : e))
      }
      var TextInput = InputPrimary || function PlainInput(props) {
        return h('input', Object.assign({}, props, { style: Object.assign({}, SELECT_STYLE, props.style || {}, { height: '36px' }) }))
      }

      function chevron(open) {
        return h('svg', {
          width: 16, height: 16, viewBox: '0 0 16 16',
          style: { color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.8))', flex: 'none', transition: 'transform .16s', transform: open ? 'rotate(180deg)' : 'none' },
        }, h('path', { d: 'M4 6l4 4 4-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      }
      /** 一行控件 = label（flex column，6px 间距，上边框分隔，13px 次级标签）。 */
      function fieldRow(labelText, control, key) {
        return h('div', {
          key: key,
          style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 0', borderTop: DIVIDER },
        }, h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, inherit)' } }, labelText), control)
      }
      function checkRow(labelText, checked, onChange, key) {
        return h('label', { key: key, style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' } },
          h('input', { type: 'checkbox', checked: checked, onChange: onChange }),
          h('span', null, labelText))
      }

      /**
       * Chip 模板编辑器（contentEditable）：
       *  - 普通文字就是文字，动态信息渲染成内联胶囊（{duration} 等代码永不露出）；
       *  - 胶囊点击移除、＋ 在**光标处**插入（支持插到文字中间）；
       *  - 通栏自适应换行（多行文字全可见），模板字符串无损往返；
       *  - 外部模板变化（预设/载入）重建 DOM；用户输入期间不打扰光标。
       */
      function ChipEditor(props) {
        var editorRef = useRef(null)
        var propsRef = useRef(props)
        propsRef.current = props // 每次渲染刷新：回调用最新 props（挂载句柄不再持有陈旧闭包）
        var lastTpl = useRef(typeof props.template === 'string' ? props.template : '')
        var lastLang = useRef(props.lang || 'zh')

        function chipEl(key) {
          var t = tOf(propsRef.current.lang || 'zh')
          var label = t.tokens[key] || key
          var el = document.createElement('span')
          el.setAttribute('data-tok', key)
          el.setAttribute('contenteditable', 'false')
          el.style.cssText = 'display:inline-block;margin:1px 3px;padding:1px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,0.35));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,0.15));color:var(--dsw-alias-label-secondary,inherit);font-size:12px;line-height:1.6;cursor:pointer;user-select:none'
          el.title = label + '（点击移除）'
          el.textContent = label + ' ×'
          el.addEventListener('click', function () {
            removeChipAt(el)
          })
          return el
        }

        /** 移除胶囊并把光标恢复到原位置（不再跳到编辑器开头）。 */
        function removeChipAt(el) {
          var editor = editorRef.current
          var next = el.nextSibling
          var prev = el.previousSibling
          el.remove()
          if (editor) {
            var range = document.createRange()
            if (next) range.setStartBefore(next)
            else if (prev) range.setStartAfter(prev)
            else { range.selectNodeContents(editor); range.collapse(true) }
            range.collapse(true)
            var sel = window.getSelection()
            sel.removeAllRanges()
            sel.addRange(range)
            editor.focus()
          }
          syncFromDom()
        }

        function domToTemplate() {
          var editor = editorRef.current
          if (!editor) return ''
          var out = ''
          Array.prototype.forEach.call(editor.childNodes, function (node) {
            if (node.nodeType === 3) out += node.textContent
            else if (node.nodeType === 1 && node.hasAttribute('data-tok')) out += '{' + node.getAttribute('data-tok') + '}'
            else if (node.nodeType === 1 && !node.hasAttribute('data-ph')) out += node.textContent || ''
          })
          // 内容仍等于默认文案 → 视为「未改动」，模板保持空（默认语义）
          if (typeof propsRef.current.hint === 'string' && propsRef.current.hint !== '' && out === propsRef.current.hint) return ''
          return out
        }

        function syncFromDom() {
          var tpl = domToTemplate()
          lastTpl.current = tpl
          propsRef.current.onChange(tpl)
        }

        function clearPlaceholder() {
          var editor = editorRef.current
          if (!editor) return false
          var nodes = editor.querySelectorAll('[data-ph]')
          if (nodes.length === 0) return false
          Array.prototype.forEach.call(nodes, function (n) { n.remove() })
          return true
        }

        function rebuild(tpl) {
          var editor = editorRef.current
          if (!editor) return
          lastTpl.current = typeof tpl === 'string' ? tpl : ''
          editor.textContent = ''
          var tplStr = typeof tpl === 'string' ? tpl : ''
          // 空模板：优先提示串（真实默认内容，可编辑）；否则非编辑占位（如推送标题）
          var shown = tplStr !== '' ? tplStr : (typeof propsRef.current.hint === 'string' ? propsRef.current.hint : '')
          if (shown !== '') {
            var parts = parseTemplate(shown)
            parts.forEach(function (seg) {
              if (seg.type === 'text') {
                if (seg.value !== '') editor.appendChild(document.createTextNode(seg.value))
              } else {
                editor.appendChild(chipEl(seg.key))
              }
            })
          } else if (typeof propsRef.current.placeholder === 'string' && propsRef.current.placeholder !== '') {
            var ph = document.createElement('span')
            ph.setAttribute('data-ph', '1')
            ph.style.cssText = 'color:var(--dsw-alias-label-tertiary,rgba(127,127,127,0.8));pointer-events:none;user-select:none'
            ph.textContent = propsRef.current.placeholder
            editor.appendChild(ph)
          }
        }

        function insertAtCaret(key) {
          var editor = editorRef.current
          if (!editor) return
          clearPlaceholder()
          var sel = window.getSelection()
          var range = null
          if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) range = sel.getRangeAt(0)
          if (!range) {
            range = document.createRange()
            range.selectNodeContents(editor)
            range.collapse(false)
          }
          var chip = chipEl(key)
          range.deleteContents()
          range.insertNode(chip)
          range.setStartAfter(chip)
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
          editor.focus()
          syncFromDom()
        }

        useEffect(function () {
          var lang = props.lang || 'zh'
          if (props.template !== lastTpl.current || lang !== lastLang.current) {
            lastLang.current = lang
            rebuild(props.template)
          }
          // 仅外部变化（模板/语言）时重建；用户输入路径 lastTpl 已同步，不打扰光标
        }, [props.template, props.lang])

        useEffect(function () {
          var editor = editorRef.current
          if (editor) rebuild(props.template)
          if (props.onReady) props.onReady({ insertAtCaret: insertAtCaret })
          return function () { if (props.onReady) props.onReady(null) }
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        return h('div', {
          ref: editorRef,
          contentEditable: true,
          suppressContentEditableWarning: true,
          onInput: syncFromDom,
          onMouseDown: function () { clearPlaceholder() },
          onKeyDown: function (e) {
            clearPlaceholder()
            if (e.key === 'Enter') { e.preventDefault(); return }
            // Ctrl/Cmd+A：手动扩选“全部子节点（含胶囊）”——浏览器全选天然跳过
            // contenteditable=false 的胶囊，导致全选删除后胶囊残留
            if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
              var editor = editorRef.current
              if (editor) {
                e.preventDefault()
                var range = document.createRange()
                range.selectNodeContents(editor)
                var sel = window.getSelection()
                sel.removeAllRanges()
                sel.addRange(range)
              }
              return
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
              // 让浏览器先删（会在下一拍触发 input），删除胶囊文本的残留交给 syncFromDom
              setTimeout(syncFromDom, 0)
            }
          },
          onPaste: function (e) {
            e.preventDefault()
            clearPlaceholder()
            var text = (e.clipboardData || window.clipboardData || {}).getData ? (e.clipboardData || window.clipboardData).getData('text/plain') : ''
            if (!text) return
            try { document.execCommand('insertText', false, text) } catch (err) { /* noop */ }
            setTimeout(syncFromDom, 0)
          },
          style: {
            minHeight: '36px', padding: '7px 10px', borderRadius: '8px',
            border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
            background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '13px',
            lineHeight: 1.5, outline: 'none', wordBreak: 'break-word',
          },
        })
      }

      /** 内置默认内容的提示串（空模板时直接展示真实默认效果：文字 + 信息标签）。 */
      function defaultHintOf(field, langCode) {
        var lang = LANG_IDS.indexOf(langCode) >= 0 ? langCode : 'zh'
        var tt = tOf(lang)
        var label = (tt.kindLabels && tt.kindLabels[field]) || tt.samples.label
        var d = '{duration}'
        var u = '{usage}'
        if (lang === 'en') return label + ' (took ' + d + ', used ' + u + ').'
        if (lang === 'ja') return label + '（所要 ' + d + '、消費 ' + u + '）。'
        if (lang === 'ko') return label + '（소요 ' + d + ', 소모 ' + u + '）。'
        if (lang === 'zh-tw') return label + '（用時 ' + d + '，消耗 ' + u + '）。'
        return label + '（用时 ' + d + '，消耗 ' + u + '）。'
      }

      return function SettingsCard() {
        var statePair = useState(scope.getSnapshot())
        var snap = statePair[0]
        var setSnap = statePair[1]
        useEffect(function () {
          return scope.subscribe(function () {
            setSnap(scope.getSnapshot())
          })
        }, [])

        var openState = useState(false)
        var open = openState[0]
        var setOpen = openState[1]
        var draftState = useState(null)
        var draft = draftState[0]
        var setDraft = draftState[1]
        var noteState = useState('')
        var note = noteState[0]
        var setNote = noteState[1]
        var justSavedState = useState(false) // 保存成功后显示「点击刷新」链接
        var justSaved = justSavedState[0]
        var setJustSaved = justSavedState[1]
        var menuState = useState(null) // 当前展开「＋插入信息」菜单的字段名（null=关闭）
        var menuFor = menuState[0]
        var setMenuFor = menuState[1]
        var editorRefs = useRef({}) // field -> { insertAtCaret } 句柄
        var customState = useState(loadCustomPresets()) // 用户自定义预设库（localStorage）
        var customPresets = customState[0]
        var setCustomPresets = customState[1]
        var activeState = useState(null) // 当前表单「来自」哪个预设：{ id, name, custom, src } | null（只读来源指示/覆盖目标）
        var activePreset = activeState[0]
        var setActivePreset = activeState[1]
        var namingState = useState(false) // 另存为的名字输入行
        var naming = namingState[0]
        var setNaming = namingState[1]
        var nameState = useState('')
        var newName = nameState[0]
        var setName = nameState[1]

        var ready = snap.status === 'ready'
        var value = (snap && snap.value) || {}
        var cur = draft === null ? value : draft
        var dirty = draft !== null && !sameFlat(flatOf(draft), flatOf(value))
        var t = tOf(cur.language) // 面板语言随「语言」切换即时更新
        // 预设下拉显示「当前应用的预设」：载入来源优先，其次自动匹配（进入面板即显示当前应用项）
        var shownPresetId = activePreset !== null ? activePreset.id : presetIdOf(cur, customPresets)
        var shownEntry = null
        var shownCustom = false
        var ei
        for (ei = 0; ei < PRESETS.length; ei++) if (PRESETS[ei].id === shownPresetId) { shownEntry = PRESETS[ei]; break }
        if (!shownEntry && shownPresetId !== 'custom') {
          for (ei = 0; ei < customPresets.length; ei++) if (customPresets[ei].id === shownPresetId) { shownEntry = customPresets[ei]; shownCustom = true; break }
        }

        function setVal(key, x) {
          var next = Object.assign({}, cur)
          next[key] = x
          setDraft(next)
          setNote('')
          setJustSaved(false)
        }

        /** 载入内置或自定义预设到表单（下拉只负责载入，不跟踪表单状态）。 */
        function loadPreset(entry, custom) {
          var next = Object.assign({}, cur)
          next.language = entry.language
          next.titleTemplate = String(entry.titleTemplate ?? '')
          for (var j = 0; j < REASON_FIELDS.length; j++) next['tpl-' + REASON_FIELDS[j]] = entry.templates[REASON_FIELDS[j]]
          setDraft(next)
          setNote('')
          setJustSaved(false)
          setActivePreset({ id: entry.id, name: custom ? entry.name : null, custom: custom, src: entry })
        }

        function flatTemplatesOf(x) {
          var flat = flatOf(x)
          var templates = {}
          for (var i = 0; i < REASON_FIELDS.length; i++) {
            var k = REASON_FIELDS[i]
            templates[k] = flat['tpl-' + k]
          }
          return templates
        }

        function saveAsCustom() {
          var name = newName.trim()
          if (!name) { setNote(t.presetNameRequired); return }
          var cp = {
            id: 'cu-' + Date.now().toString(36),
            name: name,
            language: LANG_IDS.indexOf(cur.language) >= 0 ? cur.language : 'zh',
            titleTemplate: flatOf(cur).titleTemplate,
            templates: flatTemplatesOf(cur),
          }
          var next = customPresets.concat([cp])
          setCustomPresets(next)
          saveCustomPresets(next)
          setActivePreset({ id: cp.id, name: name, custom: true, src: cp })
          setNaming(false)
          setName('')
          setNote(t.customSaved)
          log('custom preset saved: ' + name)
        }

        function deleteCustom() {
          if (!shownCustom || !shownEntry) return
          var next = customPresets.filter(function (cp) { return cp.id !== shownEntry.id })
          setCustomPresets(next)
          saveCustomPresets(next)
          setActivePreset(null)
          setNote(t.customDeleted)
          log('custom preset deleted')
        }

        function save() {
          var flat = flatOf(cur)
          var templates = {}
          for (var i = 0; i < REASON_FIELDS.length; i++) {
            var k = REASON_FIELDS[i]
            templates[k] = flat['tpl-' + k]
          }
          setNote(t.saving)
          var tasks = [
            scope.set('language', flat.language),
            scope.set('templates', templates),
            scope.set('titleTemplate', flat.titleTemplate),
            scope.set('pushMode', flat.pushMode),
          ]
          Promise.all(tasks).then(function () {
            // 预设自动同步：
            //  - 来源是自定义预设（含未命名预设）→ 更新它；
            //  - 来源是默认/空白 → 【若已有未命名预设则继续编号新建】未命名预设 2/3…
            var lang = LANG_IDS.indexOf(cur.language) >= 0 ? cur.language : 'zh'
            var targetId
            var entry
            var list
            var found = null
            if (shownCustom && shownEntry) {
              targetId = shownEntry.id
              entry = Object.assign({}, shownEntry, { language: lang, titleTemplate: flat.titleTemplate, templates: templates })
              list = customPresets.map(function (cp) {
                if (cp.id === targetId) { found = Object.assign({}, cp, entry); return found }
                return cp
              })
              if (!found) { list = list.concat([entry]); found = entry }
            } else {
              var n = nextUnnamedNumber(customPresets)
              targetId = n === 1 ? 'unnamed' : 'unnamed-' + n
              entry = { id: targetId, name: null, auto: true, language: lang, titleTemplate: flat.titleTemplate, templates: templates }
              list = customPresets.concat([entry])
              found = entry
            }
            setCustomPresets(list)
            saveCustomPresets(list)
            setActivePreset({ id: targetId, custom: true, src: found })
            setDraft(null)
            setNote(t.saved)
            setJustSaved(true)
            log('settings saved; preset synced: ' + targetId)
          }).catch(function (e) {
            setNote(t.saveFailed + (e && e.message ? e.message : e))
            log('settings save failed: ' + (e && e.message ? e.message : e))
          })
        }

        function discard() {
          setDraft(null)
          setNote('')
          setJustSaved(false)
        }

        var body = null
        if (!ready) {
          body = h('div', { style: { padding: '12px 0', color: SUBTLE, fontSize: '13px' } }, snap.status === 'unavailable' ? t.unavailable : t.loading)
        } else {
          var rows = [
            h('div', {
              key: 'preset-row',
              style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 0', borderTop: DIVIDER },
            },
              h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.preset),
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('select', {
                  value: shownPresetId,
                  onChange: function (e) {
                    var v = e.target.value
                    if (v === 'custom') return // 仅显示兜底，不可选
                    var builtin = null
                    var custom = null
                    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === v) builtin = PRESETS[i]
                    for (var j = 0; j < customPresets.length; j++) if (customPresets[j].id === v) custom = customPresets[j]
                    if (builtin) loadPreset(builtin, false)
                    else if (custom) loadPreset(custom, true)
                  },
                  style: SELECT_STYLE,
                },
                  PRESETS.map(function (p) {
                    return darkOption({ value: p.id, key: p.id }, t.presets[p.labelKey] || p.labelKey)
                  }),
                  customPresets.map(function (cp) {
                    return darkOption({ value: cp.id, key: cp.id }, isUnnamedId(cp.id) ? unnamedDisplayName(cp.id, t) : cp.name)
                  })),
                h('button', {
                  type: 'button', title: t.saveAsTitle, onClick: function () { setNaming(!naming); setName('') },
                  style: { flex: 'none', appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)' },
                }, t.saveAs),
                shownCustom
                  ? h('button', {
                    type: 'button', title: t.removeTitle, onClick: deleteCustom,
                    style: { flex: 'none', appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)' },
                  }, t.remove)
                  : null,
              ),
              naming
                ? h('div', { style: { display: 'flex', gap: '6px', marginTop: '2px' } },
                  h('input', {
                    value: newName,
                    placeholder: t.presetNamePlaceholder,
                    autoFocus: true,
                    onKeyDown: function (e) { if (e.key === 'Enter') saveAsCustom(); if (e.key === 'Escape') { setNaming(false); setName('') } },
                    onChange: function (e) { setName(e.target.value) },
                    style: Object.assign({}, SELECT_STYLE, { flex: 1, fontSize: '13px' }),
                  }),
                  h('button', { type: 'button', onClick: saveAsCustom, style: { flex: 'none', appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '5px 12px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.confirm),
                  h('button', { type: 'button', onClick: function () { setNaming(false); setName('') }, style: { flex: 'none', appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '5px 12px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.cancel),
                )
                : null,
            ),
            fieldRow(t.language, h('select', {
              value: LANG_IDS.indexOf(cur.language) >= 0 ? cur.language : 'zh',
              onChange: function (e) { setVal('language', e.target.value) }, style: SELECT_STYLE,
            }, LANG_OPTIONS.map(function (o) {
              return darkOption({ value: o.id, key: o.id }, o.label)
            })), 'language'),
            fieldRow(t.pushMode, h('select', {
              value: ['dual', 'system', 'toast'].indexOf(cur.pushMode) >= 0 ? cur.pushMode : 'dual',
              onChange: function (e) { setVal('pushMode', e.target.value) }, style: SELECT_STYLE,
            }, [
              darkOption({ value: 'dual', key: 'dual' }, t.pushDual),
              darkOption({ value: 'system', key: 'system' }, t.pushSystem),
              darkOption({ value: 'toast', key: 'toast' }, t.pushToast),
            ]), 'pushMode'),
            h('div', { key: 'title-row', style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 0', borderTop: DIVIDER } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.titleLabel),
                h('button', {
                  type: 'button', title: t.insertTitle,
                  onClick: function () { setMenuFor(menuFor === 'title' ? null : 'title') },
                  style: { appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)' },
                }, t.insertInfo),
              ),
              h(ChipEditor, {
                template: String(cur.titleTemplate ?? ''),
                lang: cur.language,
                hint: '',
                placeholder: t.titleHint,
                onChange: function (tpl) { setVal('titleTemplate', tpl) },
                onReady: function (handle) {
                  if (handle) editorRefs.current.title = handle
                  else delete editorRefs.current.title
                },
              }),
              menuFor === 'title'
                ? h('div', { key: 'menu-title', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))' } },
                  h('button', {
                    type: 'button', onClick: function () {
                      var handle = editorRefs.current.title
                      if (handle) handle.insertAtCaret('title')
                      else setVal('titleTemplate', String(cur.titleTemplate ?? '') + '{title}')
                      setMenuFor(null)
                    },
                    style: { appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '4px 10px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)' },
                  }, '＋ ' + t.tokens.title)
                )
                : null,
            ),
          ]
          // 模板（forEach：每条回调独立绑定字段，避免 var 闭包串写）
          // 每栏 = 标签行（左文案 + 右「＋插入信息」）+ ChipEditor（文字+内联胶囊，光标处插入）
          //      + 实时预览（正文普通文本、信息为示例值）
          REASON_FIELDS.forEach(function (field) {
            var tplValue = templateOf(cur, field)
            // 预览：空模板时展示默认内容（与编辑器一致）；否则展示当前模板
            var previewTpl = tplValue === '' ? defaultHintOf(field, cur.language) : tplValue
            var segments = parseTemplate(previewTpl)
            rows.push(h('div', {
              key: 'tpl-' + field,
              style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 0', borderTop: DIVIDER },
            },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.fields[field]),
                h('button', {
                  type: 'button',
                  title: t.insertTitle,
                  onClick: function () { setMenuFor(menuFor === field ? null : field) },
                  style: {
                    appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '3px 10px',
                    borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
                    background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)',
                  },
                }, t.insertInfo),
              ),
              h(ChipEditor, {
                template: tplValue,
                lang: cur.language,
                hint: defaultHintOf(field, cur.language),
                onChange: function (tpl) { setVal('tpl-' + field, tpl) },
                onReady: function (handle) {
                  if (handle) editorRefs.current[field] = handle
                  else delete editorRefs.current[field]
                },
              }),
              menuFor === field
                ? h('div', {
                  key: 'menu-' + field,
                  style: {
                    display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px',
                    borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
                    background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))',
                  },
                }, TOKEN_KEYS.map(function (k) {
                  return h('button', {
                    key: k, type: 'button',
                    onClick: function () {
                      var handle = editorRefs.current[field]
                      if (handle) handle.insertAtCaret(k)
                      else setVal('tpl-' + field, templateOf(cur, field) + '{' + k + '}')
                      setMenuFor(null)
                    },
                    style: {
                      appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '4px 10px',
                      borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
                      background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)',
                    },
                  }, '＋ ' + t.tokens[k])
                }))
                : null,
            ))
            rows.push(h('div', {
              key: 'pv-' + field,
              style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.8))', marginTop: '-2px', lineHeight: 1.6 },
            }, h('span', { style: { opacity: 0.85 } }, t.preview), segments.map(function (seg, idx) {
              // 预览 = 最终效果：信息直接以示例值流入正文，不做任何标签样式
              if (seg.type === 'text') {
                return seg.value === '' ? null : h('span', { key: 'tv-' + field + '-' + idx }, seg.value)
              }
              return h('span', { key: 'tk-' + field + '-' + idx }, t.samples[seg.key] || '')
            })))
          })
          rows.push(h('div', {
            key: 'footer',
            style: { borderTop: DIVIDER, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', padding: '12px 0 4px' },
          },
            h('span', { role: 'status', style: { marginRight: 'auto', marginLeft: '10px', fontSize: '12px', color: SUBTLE } },
              note,
              justSaved
                ? h('button', {
                  type: 'button',
                  onClick: function () { try { window.location.reload() } catch (e) { /* noop */ } },
                  style: {
                    appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', marginLeft: '8px',
                    padding: '0', border: 'none', background: 'none',
                    color: 'var(--dsw-alias-label-secondary, inherit)',
                    textDecoration: 'underline', textUnderlineOffset: '2px',
                  },
                }, t.refresh)
                : null,
            ),
            h('button', {
              type: 'button', disabled: !dirty || note === t.saving, onClick: discard,
              style: Object.assign({}, GHOST, { opacity: dirty ? 1 : 0.4 }),
            }, t.discard),
            h('button', {
              type: 'button', disabled: !dirty || note === t.saving, onClick: save,
              style: Object.assign({}, PRIMARY, { opacity: dirty ? 1 : 0.4 }),
            }, t.save),
          ))
          body = h('div', null, rows)
        }

        return h('div', {
          style: Object.assign({}, CARD, {
            background: open ? 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))' : 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.05))',
          }),
        },
          h('button', {
            type: 'button', 'aria-expanded': open,
            onClick: function () { setOpen(!open) },
            style: {
              appearance: 'none', width: '100%', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer',
              background: 'none', border: 0, borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
            },
          },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { fontSize: '14px', fontWeight: 600 } }, t.title),
              h('div', { style: { color: SUBTLE, fontSize: '13px', lineHeight: 1.5 } }, t.subtitle),
            ),
            chevron(open),
          ),
          open ? h('div', { style: { margin: '0 16px', paddingBottom: '8px' } }, body) : null,
        )
      }
    }

    return module.exports
  }
})
