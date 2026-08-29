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
        titlesGroup: '标题', titleLabel: '推送标题', titleHint: '通用推送标题，留空时则使用默认标题，优先级低于下方自定义标题', titleTplLabel: '按原因定制标题（可选）', tplLabel: '内容', ttPlaceholders: { completed: '任务已完成', error: '任务出错', aborted: '任务已中止', blocked: '任务被阻塞', 'max-tokens': '任务达到输出上限' },
        kindLabels: { completed: '会话已完成', error: '会话出错', aborted: '会话已中止', blocked: '会话被阻塞', 'max-tokens': '会话达到输出上限' },
        tokens: { title: '会话标题', label: '完成标签', duration: '用时', usage: '消耗', error: '错误', cache: '缓存命中', tps: '速度 TPS', image: '图片', icon: '图标' },
        samples: { title: '示例会话', label: '会话已完成', duration: '12 秒', usage: '1,240 输入 / 3,560 输出', error: '连接超时', cache: '96.5%', tps: '92 tok/s', image: '[图片]', icon: '[图标]' },
        imagePickTitle: '选择本地图片（自动压缩为通知大图）', iconPickTitle: '选择本地图片（自动压缩为通知图标）', imageFailed: '图片读取失败',
        clearMedia: '清除',
        mediaNote: '本地上传会自动处理：大图按通知显示比例 16:9 居中裁切（512×288）、图标 1:1 方形裁切（128×128），裁切后即通知中显示的效果',
        presets: { custom: '自定义预设', unnamed: '未命名预设', default: '默认', playful: '轻松风格 🎉', formal: '正式简洁', detail: '详细报告' },
        placeholder: '留空则使用默认文案',
        insertInfo: '＋ 插入信息', insertTitle: '在光标处插入信息', sendTestTitle: '发送测试通知（当前模板渲染）',
        skipSubagents: '跳过子代理会话',
        pushMode: '推送方式', pushDual: '系统通知 + 页内提示', pushSystem: '仅系统通知', pushToast: '仅页内提示',
        imageUrl: '通知大图', iconUrl: '通知图标',
        discard: '放弃', save: '保存', saving: '保存中…', saved: '已保存 ✓ · 刷新页面后生效', saveFailed: '保存失败：', refresh: '点击刷新', reset: '重置', resetDone: '已重置为默认值 · 刷新页面后生效',
        permTitle: '通知权限', permGranted: '已授权：系统通知可用', permDefault: '尚未授权', permDenied: '已被浏览器屏蔽', permUnsupported: '当前环境不支持系统通知',
        permDefaultHint: '点击「请求授权」；若浏览器未弹出询问，请用地址栏权限图标手动允许', permDeniedHint: '浏览器阻止了本网站的通知：点击地址栏左侧权限图标 → 网站设置 → 通知 → 允许，然后刷新页面', permUnsupportedHint: '系统通知需要 HTTPS 或 localhost 访问；可改用「仅页内提示」', permRequest: '请求授权',
        saveAs: '新增', update: '修改', remove: '删除', presetNamePlaceholder: '预设名称', confirm: '确定', cancel: '取消', customSaved: '自定义预设已保存', customUpdated: '自定义预设已更新', customDeleted: '自定义预设已删除', saveAsTitle: '将当前配置另存为自定义预设', updateTitle: '更新当前自定义预设', removeTitle: '删除当前自定义预设', fromPreset: '来自：', modifiedSuffix: ' · 已修改',
      presetNameRequired: '请输入预设名称',
      loading: '加载中…', unavailable: '设置不可用（宿主未注册命名空间）',
      },
      'zh-tw': {
        title: '會話完成提醒', subtitle: '完成推送的語言與文案模板（儲存後重新整理生效）',
        preset: '預設', choosePreset: '選擇預設…', language: '語言',
        fields: { completed: '完成', error: '出錯', aborted: '中止', blocked: '阻塞', 'max-tokens': '輸出上限' },
        titlesGroup: '標題', titleLabel: '推送標題', titleHint: '通用推送標題，留空時則使用預設標題，優先級低於下方自訂標題', titleTplLabel: '按原因自訂標題（選填）', tplLabel: '內容', ttPlaceholders: { completed: '任務已完成', error: '任務出錯', aborted: '任務已中止', blocked: '任務被阻塞', 'max-tokens': '任務達到輸出上限' },
        kindLabels: { completed: '會話已完成', error: '會話出錯', aborted: '會話已中止', blocked: '會話被阻塞', 'max-tokens': '會話達到輸出上限' },
        tokens: { title: '會話標題', label: '完成標籤', duration: '用時', usage: '消耗', error: '錯誤', cache: '快取命中', tps: '速度 TPS', image: '圖片', icon: '圖示' },
        samples: { title: '範例會話', label: '會話已完成', duration: '12 秒', usage: '1,240 輸入 / 3,560 輸出', error: '連線逾時', cache: '96.5%', tps: '92 tok/s', image: '[圖片]', icon: '[圖示]' },
        imagePickTitle: '選擇本機圖片（自動壓縮為通知大圖）', iconPickTitle: '選擇本機圖片（自動壓縮為通知圖示）', imageFailed: '圖片讀取失敗',
        clearMedia: '清除',
        mediaNote: '本機上傳會自動處理：大圖按通知顯示比例 16:9 居中裁切（512×288）、圖示 1:1 方形裁切（128×128），裁切後即通知中顯示的效果',
        presets: { custom: '自訂預設', unnamed: '未命名預設', default: '預設', playful: '輕鬆風格 🎉', formal: '正式簡潔', detail: '詳細報告' },
        placeholder: '留空則使用預設文案',
        insertInfo: '＋ 插入資訊', insertTitle: '在游標處插入資訊', sendTestTitle: '傳送測試通知（目前範本渲染）',
        skipSubagents: '跳過子代理會話',
        pushMode: '推送方式', pushDual: '系統通知 + 頁內提示', pushSystem: '僅系統通知', pushToast: '僅頁內提示',
        imageUrl: '通知大圖', iconUrl: '通知圖示',
        discard: '放棄', save: '儲存', saving: '儲存中…', saved: '已儲存 ✓ · 重新整理頁面後生效', saveFailed: '儲存失敗：', refresh: '點擊重新整理', reset: '重置', resetDone: '已重置為預設值 · 重新整理頁面後生效',
        permTitle: '通知權限', permGranted: '已授權：系統通知可用', permDefault: '尚未授權', permDenied: '已被瀏覽器封鎖', permUnsupported: '目前環境不支援系統通知',
        permDefaultHint: '點擊「請求授權」；若瀏覽器未彈出詢問，請用網址列權限圖示手動允許', permDeniedHint: '瀏覽器封鎖了本網站的通知：點擊網址列左側權限圖示 → 網站設定 → 通知 → 允許，然後重新整理頁面', permUnsupportedHint: '系統通知需要 HTTPS 或 localhost 存取；可改用「僅頁內提示」', permRequest: '請求授權',
        saveAs: '新增', update: '修改', remove: '刪除', presetNamePlaceholder: '預設名稱', confirm: '確定', cancel: '取消', customSaved: '自訂預設已儲存', customUpdated: '自訂預設已更新', customDeleted: '自訂預設已刪除', saveAsTitle: '將當前設定另存為自訂預設', updateTitle: '更新目前自訂預設', removeTitle: '刪除目前自訂預設', fromPreset: '來自：', modifiedSuffix: ' · 已修改',
      presetNameRequired: '請輸入預設名稱',
      loading: '載入中…', unavailable: '設定不可用（宿主未註冊命名空間）',
      },
      en: {
        title: 'Session completion alert', subtitle: 'Language & message templates for completion pushes (refresh after save)',
        preset: 'Preset', choosePreset: 'Choose preset…', language: 'Language',
        fields: { completed: 'Completed', error: 'Error', aborted: 'Aborted', blocked: 'Blocked', 'max-tokens': 'Token cap' },
        titlesGroup: 'Title', titleLabel: 'Push title', titleHint: 'Generic push title; leave empty to use the default title (per-reason titles below take precedence)', titleTplLabel: 'Per-reason titles (optional)', tplLabel: 'Content', ttPlaceholders: { completed: 'Task completed', error: 'Task failed', aborted: 'Task aborted', blocked: 'Task blocked', 'max-tokens': 'Task hit the output cap' },
        kindLabels: { completed: 'Session completed', error: 'Session failed', aborted: 'Session aborted', blocked: 'Session blocked', 'max-tokens': 'Session hit the output-token cap' },
        tokens: { title: 'Session title', label: 'Label', duration: 'Duration', usage: 'Usage', error: 'Error', cache: 'Cache hit', tps: 'Speed TPS', image: 'Image', icon: 'Icon' },
        samples: { title: 'Example session', label: 'Session completed', duration: '12s', usage: '1,240 in / 3,560 out', error: 'connection timeout', cache: '96.5%', tps: '92 tok/s', image: '[image]', icon: '[icon]' },
        imagePickTitle: 'Pick a local image (auto-compressed for the notification)', iconPickTitle: 'Pick a local image (auto-compressed for the notification icon)', imageFailed: 'Failed to read the image',
        clearMedia: 'Clear',
        mediaNote: 'Local uploads are processed automatically: large images are center-cropped to the notification ratio 16:9 (512×288) and icons to 1:1 square (128×128) — the cropped result is exactly what shows in the notification',
        presets: { custom: 'Custom preset', unnamed: 'Untitled preset', default: 'Default', playful: 'Playful 🎉', formal: 'Formal', detail: 'Detailed report' },
        placeholder: 'Leave empty to use the default text',
        insertInfo: '＋ Insert info', insertTitle: 'Insert info at cursor', sendTestTitle: 'Send test notification (rendered from current template)',
        skipSubagents: 'Skip subagent sessions',
        pushMode: 'Push channel', pushDual: 'System + in-page', pushSystem: 'System only', pushToast: 'In-page only',
        imageUrl: 'Notification image', iconUrl: 'Notification icon',
        discard: 'Discard', save: 'Save', saving: 'Saving…', saved: 'Saved ✓ · refresh page to apply', saveFailed: 'Save failed: ', refresh: 'Refresh', reset: 'Reset', resetDone: 'Reset to defaults ✓ · refresh page to apply',
        permTitle: 'Notification permission', permGranted: 'Granted: system notifications available', permDefault: 'Not yet granted', permDenied: 'Blocked by browser', permUnsupported: 'System notifications not supported here',
        permDefaultHint: 'Click "Request"; if the browser shows no prompt, allow via the address-bar permissions icon', permDeniedHint: 'This browser blocked notifications for this site: click the address-bar permissions icon → Site settings → Notifications → Allow, then reload', permUnsupportedHint: 'System notifications require HTTPS or localhost; use "In-page only" instead', permRequest: 'Request',
        saveAs: 'New', update: 'Edit', remove: 'Delete', presetNamePlaceholder: 'Preset name', confirm: 'OK', cancel: 'Cancel', customSaved: 'Custom preset saved', customUpdated: 'Custom preset updated', customDeleted: 'Custom preset deleted', saveAsTitle: 'Save current config as custom preset', updateTitle: 'Update current custom preset', removeTitle: 'Delete current custom preset', fromPreset: 'From: ', modifiedSuffix: ' · modified',
      presetNameRequired: 'Please enter a preset name',
      loading: 'Loading…', unavailable: 'Unavailable (namespace not registered on host)',
      },
      ja: {
        title: 'セッション完了通知', subtitle: '完了プッシュの言語とメッセージテンプレート（保存後に再読み込みで反映）',
        preset: 'プリセット', choosePreset: 'プリセットを選択…', language: '言語',
        fields: { completed: '完了', error: 'エラー', aborted: '中止', blocked: 'ブロック', 'max-tokens': 'トークン上限' },
        titlesGroup: 'タイトル', titleLabel: 'プッシュタイトル', titleHint: '共通のプッシュタイトル。空欄の場合はデフォルトタイトルを使用（下の理由別タイトルが優先）', titleTplLabel: '理由ごとのタイトル（任意）', tplLabel: 'コンテンツ', ttPlaceholders: { completed: 'タスク完了', error: 'タスクエラー', aborted: 'タスク中止', blocked: 'タスクがブロックされました', 'max-tokens': '出力上限に到達' },
        kindLabels: { completed: 'セッション完了', error: 'セッションエラー', aborted: 'セッション中止', blocked: 'セッションがブロックされました', 'max-tokens': '出力トークン上限に到達' },
        tokens: { title: 'セッションタイトル', label: '完了ラベル', duration: '所要時間', usage: '消費', error: 'エラー', cache: 'キャッシュヒット', tps: '速度 TPS', image: '画像', icon: 'アイコン' },
        samples: { title: 'サンプルセッション', label: 'セッション完了', duration: '12 秒', usage: '1,240 入力 / 3,560 出力', error: '接続タイムアウト', cache: '96.5%', tps: '92 tok/s', image: '[画像]', icon: '[アイコン]' },
        imagePickTitle: 'ローカル画像を選択（通知用に自動圧縮）', iconPickTitle: 'ローカル画像を選択（通知アイコン用に自動圧縮）', imageFailed: '画像の読み込みに失敗しました',
        clearMedia: 'クリア',
        mediaNote: 'ローカルアップロードは自動処理されます：大きな画像は通知表示比率 16:9（512×288）に中央クロップ、アイコンは 1:1 正方形（128×128）。クロップ後の見た目がそのまま通知に表示されます',
        presets: { custom: 'カスタムプリセット', unnamed: '未命名プリセット', default: 'デフォルト', playful: 'カジュアル 🎉', formal: 'フォーマル', detail: '詳細レポート' },
        placeholder: '空欄の場合はデフォルトの文面を使用',
        insertInfo: '＋ 情報を挿入', insertTitle: 'カーソル位置に情報を挿入', sendTestTitle: 'テスト通知を送信（現在のテンプレートで描画）',
        skipSubagents: 'サブエージェントセッションをスキップ',
        pushMode: '通知チャネル', pushDual: 'システム+ページ内', pushSystem: 'システムのみ', pushToast: 'ページ内のみ',
        imageUrl: '通知イメージ', iconUrl: '通知アイコン',
        discard: '破棄', save: '保存', saving: '保存中…', saved: '保存しました ✓ · ページを再読み込み', saveFailed: '保存失敗：', refresh: '再読み込み', reset: 'リセット', resetDone: 'デフォルトに戻しました ✓ · ページを再読み込み',
        permTitle: '通知権限', permGranted: '許可済み：システム通知が利用可能', permDefault: '未許可', permDenied: 'ブラウザがブロック', permUnsupported: 'この環境ではシステム通知を利用できません',
        permDefaultHint: '「許可をリクエスト」をクリック。ブラウザに確認が出ない場合は、アドレスバーの権限アイコンから手動で許可', permDeniedHint: 'このサイトの通知がブロックされています：アドレスバー左の権限アイコン → サイト設定 → 通知 → 許可 → ページを再読み込み', permUnsupportedHint: 'システム通知には HTTPS または localhost が必要です。「ページ内のみ」を推奨', permRequest: '許可をリクエスト',
        saveAs: '新規', update: '編集', remove: '削除', presetNamePlaceholder: 'プリセット名', confirm: '決定', cancel: 'キャンセル', customSaved: 'カスタムプリセットを保存しました', customUpdated: 'カスタムプリセットを更新しました', customDeleted: 'カスタムプリセットを削除しました', saveAsTitle: '現在の設定をカスタムプリセットとして保存', updateTitle: '現在のカスタムプリセットを更新', removeTitle: '現在のカスタムプリセットを削除', fromPreset: '由来：', modifiedSuffix: ' · 変更あり',
      presetNameRequired: 'プリセット名を入力してください',
      loading: '読み込み中…', unavailable: '利用不可（ホストに名前空間未登録）',
      },
      ko: {
        title: '세션 완료 알림', subtitle: '완료 푸시의 언어 및 메시지 템플릿(저장 후 새로고침 시 적용)',
        preset: '프리셋', choosePreset: '프리셋 선택…', language: '언어',
        fields: { completed: '완료', error: '오류', aborted: '중단', blocked: '차단', 'max-tokens': '토큰 한도' },
        titlesGroup: '제목', titleLabel: '푸시 제목', titleHint: '공통 푸시 제목. 비우면 기본 제목 사용(아래 사유별 제목이 우선)', titleTplLabel: '이유별 제목 (선택)', tplLabel: '콘텐츠', ttPlaceholders: { completed: '작업 완료', error: '작업 오류', aborted: '작업 중단됨', blocked: '작업 차단됨', 'max-tokens': '출력 한도 도달' },
        kindLabels: { completed: '세션 완료', error: '세션 오류', aborted: '세션 중단됨', blocked: '세션 차단됨', 'max-tokens': '출력 토큰 한도 도달' },
        tokens: { title: '세션 제목', label: '완료 라벨', duration: '소요 시간', usage: '소모', error: '오류', cache: '캐시 히트', tps: '속도 TPS', image: '이미지', icon: '아이콘' },
        samples: { title: '예시 세션', label: '세션 완료', duration: '12초', usage: '1,240 입력 / 3,560 출력', error: '연결 시간 초과', cache: '96.5%', tps: '92 tok/s', image: '[이미지]', icon: '[아이콘]' },
        imagePickTitle: '로컬 이미지 선택(알림용으로 자동 압축)', iconPickTitle: '로컬 이미지 선택(알림 아이콘용으로 자동 압축)', imageFailed: '이미지를 읽지 못했습니다',
        clearMedia: '지우기',
        mediaNote: '로컬 업로드는 자동 처리됩니다: 큰 이미지는 알림 표시 비율 16:9(512×288) 중앙 크롭, 아이콘은 1:1 정사각(128×128). 크롭 후 모습이 그대로 알림에 표시됩니다',
        presets: { custom: '사용자 지정 프리셋', unnamed: '이름 없는 프리셋', default: '기본', playful: '캐주얼 🎉', formal: '정식', detail: '상세 보고' },
        placeholder: '비우면 기본 문구 사용',
        insertInfo: '＋ 정보 삽입', insertTitle: '커서 위치에 정보 삽입', sendTestTitle: '테스트 알림 보내기 (현재 템플릿으로 렌더링)',
        skipSubagents: '하위 에이전트 세션 건너뛰기',
        pushMode: '알림 채널', pushDual: '시스템+페이지 내', pushSystem: '시스템만', pushToast: '페이지 내만',
        imageUrl: '알림 이미지', iconUrl: '알림 아이콘',
        discard: '취소', save: '저장', saving: '저장 중…', saved: '저장됨 ✓ · 새로고침 후 적용', saveFailed: '저장 실패: ', refresh: '새로고침', reset: '초기화', resetDone: '기본값으로 초기화됨 ✓ · 새로고침 후 적용',
        permTitle: '알림 권한', permGranted: '허용됨: 시스템 알림 사용 가능', permDefault: '아직 허용되지 않음', permDenied: '브라우저에서 차단됨', permUnsupported: '이 환경에서는 시스템 알림을 사용할 수 없음',
        permDefaultHint: '「권한 요청」클릭. 브라우저에 확인이 없으면 주소 표시줄 권한 아이콘에서 수동 허용', permDeniedHint: '이 사이트의 알림이 차단되었습니다: 주소 표시줄 왼쪽 권한 아이콘 → 사이트 설정 → 알림 → 허용 후 새로고침', permUnsupportedHint: '시스템 알림은 HTTPS 또는 localhost가 필요합니다. 「페이지 내만」사용 권장', permRequest: '권한 요청',
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
          var proj = readNoticeAny(id)
          if (proj || Date.now() - start > 6000) {
            retryTimer = null
            notifyUser(pushTitle(name, proj ? proj.title : '', proj ? '' : ' 已完成'), (proj && proj.text) || (cwdLine ? cwdLine + ' · ' : '') + '详情见会话内系统消息', pushModeOf(), mediaOf(proj ? proj.kind : ''))
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

      /** 通知媒体：iconUrl = 全局小图标 URL；iconData = 该原因上传的图标（icons[kind]，data URI）；
       *  imageData = 该原因上传的大图（images[kind]，data URI）；imageUrl = 全局大图 URL 兜底。
       *  kind 缺失（投影降级）时只用全局 URL。 */
      function mediaOf(kind) {
        var out = { imageUrl: '', iconUrl: '', imageData: '', iconData: '' }
        try {
          if (notifyScope) {
            var st = notifyScope.getSnapshot()
            if (st && st.value) {
              out.imageUrl = String(st.value.imageUrl || '')
              out.iconUrl = String(st.value.iconUrl || '')
              var imgs = st.value.images
              if (kind && imgs && typeof imgs[kind] === 'string') out.imageData = imgs[kind]
              var ics = st.value.icons
              if (kind && ics && typeof ics[kind] === 'string') out.iconData = ics[kind]
            }
          }
        } catch (e) { /* 默认 */ }
        return out
      }

      /**
       * 推送标题：优先级——
       *  1. 宿主投影渲染好的该原因标题（projTitle，含 {title} 替换）；
       *  2. 用户全局 titleTemplate（{title} = 会话标题）；
       *  3. 默认「任务已完成」。
       * 无通知正文时（降级）附带完成标记 suffix。
       */
      function pushTitle(name, projTitle, suffix) {
        if (typeof projTitle === 'string' && projTitle.trim() !== '') return projTitle.trim() + (suffix || '')
        var tpl = '任务已完成'
        try {
          if (notifyScope) {
            var st = notifyScope.getSnapshot()
            if (st && st.value && typeof st.value.titleTemplate === 'string' && st.value.titleTemplate.trim() !== '') tpl = st.value.titleTemplate
          }
        } catch (e) { /* 默认 */ }
        var out = String(tpl).replaceAll('{title}', name).trim()
        if (out === '') out = '任务已完成'
        return out + (suffix || '')
      }

      /**
       * 通知正文优先级：
       *  1. 宿主投影（session-complete-notify key）——每个会话都推，后台会话也有全文；
       *  2. 会话事件窗口里的 notice 节点（正在看的会话，落盘后立刻可用）；
       *  3. 无 → 降级（工作区信息）。
       */
      /**
       * 读取完成通知：返回 { text, title } | null。
       * 优先宿主投影（新格式对象 {kind,text,title}；兼容旧版字符串值）；
       * 投影缺失时从会话事件窗口读 notice 节点（此时无该原因标题，title 为空串 → 走模板/默认）。
       */
      function readNoticeAny(id) {
        try {
          var snap = list.getSnapshot()
          var cur = snap && snap.byId && snap.byId[id]
          var pv = cur && cur.projectionValues && cur.projectionValues[NOTICE_PROJECTION_KEY]
          if (pv != null) {
            if (typeof pv === 'string' && pv.trim() !== '') return { text: pv, title: '' }
            if (typeof pv === 'object' && pv !== null) {
              var txt = typeof pv.text === 'string' ? pv.text : ''
              if (txt.trim() !== '') return { text: txt, title: typeof pv.title === 'string' ? pv.title : '' }
            }
          }
        } catch (e) { /* 投影缺失 → 走窗口路径 */ }
        var fallback = readNotice(id)
        return fallback ? { text: fallback, title: '' } : null
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
    function notifyUser(title, body, pushMode, media) {
      var mode = pushMode === 'system' || pushMode === 'toast' ? pushMode : 'dual'
      try {
        if (mode !== 'toast' && typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            // 每次完成事件的独立 tag：不与前一次互相替换，也不被折叠成一个分组条目；
            // 自定义媒体：icon = 通知小图标（按原因 iconData 优先，其次全局 iconUrl；空 = 站点默认），
            // image = 通知卡片中的大图（按原因 imageData 优先，其次全局 imageUrl）
            var opts = { body: body, tag: PLUGIN_TAG + ':' + Date.now(), silent: false }
            var mediaIcon = media ? (media.iconData || media.iconUrl || '') : ''
            if (mediaIcon) opts.icon = mediaIcon
            var mediaImg = media ? (media.imageData || media.imageUrl || '') : ''
            if (mediaImg) opts.image = mediaImg
            var n = new Notification(title, opts)
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
        { id: 'default', labelKey: 'default', language: 'zh', titleTemplate: '', titleTemplates: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' }, templates: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' } },
      ]

      /** 重置目标：与宿主 DEFAULT_SETTINGS 一致（设置面板可编辑字段子集；语言保留当前值）。 */
      var DEFAULT_IMAGES = { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' }
      var DEFAULT_FLAT = {
        language: 'zh',
        titleTemplate: '',
        titleTemplates: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
        pushMode: 'dual',
        imageUrl: '',
        iconUrl: '',
        imagePreviewUrl: '',
        iconPreviewUrl: '',
        images: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
        icons: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
        imagePreviews: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
        iconPreviews: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
        templates: { completed: '', error: '', aborted: '', blocked: '', 'max-tokens': '' },
      }

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
          if (titleTplOf(cur, REASON_FIELDS[j]) !== String((p.titleTemplates && p.titleTemplates[REASON_FIELDS[j]]) ?? '').trim()) return false
        }
        return true
      }

      /** 把模板拆成 [text|token] 片段（token = {label|duration|usage|error|cache|tps}）。 */
      function parseTemplate(tpl) {
        var parts = []
        var re = /\{(title|label|duration|usage|error|cache|tps|image|icon)\}/g
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
      /** 按原因定制标题：草稿键 tt-<field> 优先，其次已保存的 titleTemplates[<field>]。 */
      function titleTplOf(cur, field) {
        var tt = (cur && cur.titleTemplates) || {}
        return String(cur && cur['tt-' + field] !== undefined ? cur['tt-' + field] : (tt[field] ?? '')).trim()
      }
      /** 按原因上传的通知大图：草稿键 img-<field> 优先，其次已保存的 images[<field>]（data URI）。 */
      function imageOf(cur, field) {
        var im = (cur && cur.images) || {}
        return String(cur && cur['img-' + field] !== undefined ? cur['img-' + field] : (im[field] ?? ''))
      }
      /** 按原因上传的通知图标：草稿键 icon-<field> 优先，其次已保存的 icons[<field>]（data URI）。 */
      function iconOf(cur, field) {
        var ic = (cur && cur.icons) || {}
        return String(cur && cur['icon-' + field] !== undefined ? cur['icon-' + field] : (ic[field] ?? ''))
      }
      /** 完整预览图（lightbox 查看原图用）：等比 1024 未裁切版。kind ∈ 'img'|'icon'|'imageUrl'|'iconUrl'。
       *  草稿键 pv-img-<field> / pv-icon-<field> / preview-imageUrl / preview-iconUrl 优先，
       *  其次已保存的 imagePreviews / iconPreviews / imagePreviewUrl / iconPreviewUrl；无则空串（回退裁切版）。 */
      function previewOf(cur, kind, field) {
        if (kind === 'imageUrl') {
          return String(cur && cur['preview-imageUrl'] !== undefined ? cur['preview-imageUrl'] : ((cur && cur.imagePreviewUrl) || ''))
        }
        if (kind === 'iconUrl') {
          return String(cur && cur['preview-iconUrl'] !== undefined ? cur['preview-iconUrl'] : ((cur && cur.iconPreviewUrl) || ''))
        }
        var saved = kind === 'img' ? ((cur && cur.imagePreviews) || {}) : ((cur && cur.iconPreviews) || {})
        return String(cur && cur['pv-' + kind + '-' + field] !== undefined ? cur['pv-' + kind + '-' + field] : (saved[field] ?? ''))
      }
      /** 扁平快照（用于 dirty 对比与模板打包）。 */
      function flatOf(cur) {
        var out = {
          language: LANG_IDS.indexOf(cur.language) >= 0 ? cur.language : 'zh',
          titleTemplate: String(cur.titleTemplate ?? ''),
          includeDuration: !!cur.includeDuration, includeUsage: !!cur.includeUsage,
          pushMode: ['dual', 'system', 'toast'].indexOf(cur.pushMode) >= 0 ? cur.pushMode : 'dual',
          imageUrl: String(cur.imageUrl ?? ''),
          iconUrl: String(cur.iconUrl ?? ''),
        }
        for (var i = 0; i < REASON_FIELDS.length; i++) out['tpl-' + REASON_FIELDS[i]] = templateOf(cur, REASON_FIELDS[i])
        for (var j = 0; j < REASON_FIELDS.length; j++) out['tt-' + REASON_FIELDS[j]] = titleTplOf(cur, REASON_FIELDS[j])
        for (var k = 0; k < REASON_FIELDS.length; k++) out['img-' + REASON_FIELDS[k]] = imageOf(cur, REASON_FIELDS[k])
        for (var m = 0; m < REASON_FIELDS.length; m++) out['icon-' + REASON_FIELDS[m]] = iconOf(cur, REASON_FIELDS[m])
        for (var n = 0; n < REASON_FIELDS.length; n++) out['pv-img-' + REASON_FIELDS[n]] = previewOf(cur, 'img', REASON_FIELDS[n])
        for (var p = 0; p < REASON_FIELDS.length; p++) out['pv-icon-' + REASON_FIELDS[p]] = previewOf(cur, 'icon', REASON_FIELDS[p])
        out['preview-imageUrl'] = previewOf(cur, 'imageUrl')
        out['preview-iconUrl'] = previewOf(cur, 'iconUrl')
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
       * 通知权限状态区块：实时显示浏览器对 Notification API 的授权状态与下一步引导。
       *  - granted：系统通知可用（按 pushMode 生效）；
       *  - default：未授权，提供「请求授权」按钮（用户手势内请求——Chromium 忽略非手势的自动请求）；
       *  - denied：浏览器已屏蔽（如 Edge 对"不熟悉"站点的自动阻止），引导到地址栏手动允许；
       *  - undefined：非安全上下文（http://IP）或浏览器不支持，引导改用页内提示。
       */
      function notificationPermissionRow(t, onRequest) {
        var statusText, hintText, statusColor = SUBTLE
        var hasApi = typeof Notification !== 'undefined'
        if (!hasApi) {
          statusText = t.permUnsupported
          hintText = t.permUnsupportedHint
        } else if (Notification.permission === 'granted') {
          statusText = t.permGranted
          hintText = ''
          statusColor = 'var(--dsw-alias-success, #2ecc71)'
        } else if (Notification.permission === 'denied') {
          statusText = t.permDenied
          hintText = t.permDeniedHint
          statusColor = 'var(--dsw-alias-warning, #e67e22)'
        } else {
          statusText = t.permDefault
          hintText = t.permDefaultHint
        }
        return h('div', {
          key: 'perm',
          style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 0', borderTop: DIVIDER },
        },
          h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.permTitle),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
            h('span', { style: { fontSize: '12px', color: statusColor } }, statusText),
            hasApi && Notification.permission === 'default'
              ? h('button', {
                type: 'button', onClick: onRequest,
                style: { appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '2px 10px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)' },
              }, t.permRequest)
              : null,
          ),
          hintText
            ? h('div', { style: { fontSize: '12px', color: SUBTLE, lineHeight: 1.6, wordBreak: 'break-word' } }, hintText)
            : null,
        )
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
        var everEdited = useRef(false) // 用户是否编辑过（输入/插入）：编辑后删空不再显示默认文案（hint），只留占位提示

        function chipEl(key) {
          var t = tOf(propsRef.current.lang || 'zh')
          var label = t.tokens[key] || key
          var el = document.createElement('span')
          el.setAttribute('data-tok', key)
          el.setAttribute('contenteditable', 'false')
          el.style.cssText = 'display:inline-block;margin:1px 3px;padding:1px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,0.35));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,0.15));color:var(--dsw-alias-label-secondary,inherit);font-size:12px;line-height:1.6;cursor:pointer;user-select:none'
          var isMedia = key === 'image' || key === 'icon'
          var mediaSrc = isMedia ? (key === 'image' ? propsRef.current.imageData : propsRef.current.iconData) : ''
          if (isMedia) {
            // 图片/图标标签：缩略图 + 独立 × ——点 × 才删除，点缩略图/文字查看大图（防误删）
            el.title = label
            if (mediaSrc) {
              var th = document.createElement('img')
              th.src = mediaSrc
              th.alt = ''
              th.style.cssText = key === 'icon'
                ? 'width:16px;height:16px;object-fit:cover;border-radius:3px;vertical-align:-3px;margin-right:3px'
                : 'width:24px;height:15px;object-fit:cover;border-radius:3px;vertical-align:-3px;margin-right:3px'
              el.appendChild(th)
            }
            el.appendChild(document.createTextNode(label))
            var rm = document.createElement('span')
            rm.setAttribute('data-rm', '1')
            rm.title = t.clearMedia
            rm.style.cssText = 'margin-left:4px;font-weight:bold;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,0.8))'
            rm.textContent = ' ×'
            el.appendChild(rm)
          } else {
            el.title = label + '（点击移除）'
            el.textContent = label + ' ×'
          }
          el.addEventListener('click', function (e) {
            // 只有 × 才删除；图片/图标点击本体 → 大图预览（lightbox）
            if (e.target && e.target.getAttribute && e.target.getAttribute('data-rm')) { removeChipAt(el); return }
            if (isMedia) {
              // 预览 = 完整原图（等比未裁切版，优先），无则回退裁切版
              var s = key === 'image'
                ? (propsRef.current.imagePreview || propsRef.current.imageData)
                : (propsRef.current.iconPreview || propsRef.current.iconData)
              if (s && propsRef.current.onPreview) propsRef.current.onPreview(s)
              return
            }
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
          everEdited.current = true // 任何用户编辑（输入/删除/插入标签）都标记，删空后不再复原默认文案
          var tpl = domToTemplate()
          lastTpl.current = tpl
          // 占位提示只随内容变化：有输入 → 隐藏；清空 → 恢复（hint 可编辑内容或 placeholder）
          if (tpl !== '') clearPlaceholder()
          else {
            rebuild('')
            // 删空后光标恢复到编辑器末尾：否则 rebuild 重建 DOM 会丢光标，
            // 按住 Backspace 无法继续连续删除，且视觉上像「内容自动复原」
            var ed = editorRef.current
            if (ed && document.activeElement === ed) {
              try {
                var range = document.createRange()
                range.selectNodeContents(ed)
                range.collapse(false)
                var sel = window.getSelection()
                sel.removeAllRanges()
                sel.addRange(range)
              } catch (e) { /* noop */ }
            }
          }
          propsRef.current.onChange(tpl)
        }

        function clearPlaceholder() {
          // CSS 伪元素占位：输入内容后移除 data-ph-empty 属性即消失（不可选中、不可删除）
          var editor = editorRef.current
          if (!editor) return false
          var had = editor.hasAttribute('data-ph-empty')
          editor.removeAttribute('data-ph-empty')
          return had
        }

        /** 占位状态：编辑器真正为空（无文本且无胶囊）时挂 data-ph-empty + data-placeholder（CSS ::before 渲染）。
         *  注意：空模板但显示了 hint（默认文案）时编辑器有内容 → 不显示占位。 */
        function updatePlaceholderState() {
          var editor = editorRef.current
          if (!editor) return
          var hasContent = false
          Array.prototype.forEach.call(editor.childNodes, function (node) {
            if (hasContent) return
            if (node.nodeType === 3 && node.textContent !== '') hasContent = true
            else if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-tok')) hasContent = true
          })
          if (!hasContent) {
            editor.setAttribute('data-ph-empty', '1')
            editor.setAttribute('data-placeholder', typeof propsRef.current.placeholder === 'string' ? propsRef.current.placeholder : '')
          } else {
            editor.removeAttribute('data-ph-empty')
          }
        }

        function rebuild(tpl) {
          var editor = editorRef.current
          if (!editor) return
          lastTpl.current = typeof tpl === 'string' ? tpl : ''
          editor.textContent = ''
          var tplStr = typeof tpl === 'string' ? tpl : ''
          // 空模板：优先显示默认文案（hint，可编辑的真实内容——默认预设下所见即默认推送文案）；
          // 用户编辑过再删空（everEdited）→ 不显示默认文案（避免「删完自动复原」），只留 CSS 占位提示
          var shown = tplStr !== ''
            ? tplStr
            : (everEdited.current ? '' : (typeof propsRef.current.hint === 'string' ? propsRef.current.hint : ''))
          if (shown !== '') {
            var parts = parseTemplate(shown)
            parts.forEach(function (seg) {
              if (seg.type === 'text') {
                if (seg.value !== '') editor.appendChild(document.createTextNode(seg.value))
              } else {
                editor.appendChild(chipEl(seg.key))
              }
            })
          }
          updatePlaceholderState()
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
            // 外部模板变化（载入预设/切换语言）= 新上下文 → 重置「已编辑」标记，默认预设下重新显示默认文案
            if (props.template !== lastTpl.current) everEdited.current = false
            rebuild(props.template)
          }
          // 仅外部变化（模板/语言）时重建；用户输入路径 lastTpl 已同步，不打扰光标
        }, [props.template, props.lang])

        // 图片/图标数据变化（上传完成/替换/清除）→ 重建 DOM，让 {image}/{icon} 标签立即显示新缩略图
        useEffect(function () {
          rebuild(props.template)
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [props.imageData, props.iconData])

        useEffect(function () {
          var editor = editorRef.current
          if (editor) rebuild(props.template)
          if (props.onReady) props.onReady({ insertAtCaret: insertAtCaret })
          // 注入一次占位 CSS：contentEditable 无原生 placeholder，用 ::before 伪元素模拟
          // （不可选中、不可删除、不进入文本流——与 input 的 placeholder 行为一致）
          if (!window.__dsnChipPhCss) {
            try {
              var st = document.createElement('style')
              st.textContent = '[data-dsn-ph]::before{content:attr(data-placeholder);color:var(--dsw-alias-label-tertiary,rgba(127,127,127,0.8));pointer-events:none;user-select:none;white-space:pre-wrap}'
              document.head.appendChild(st)
              window.__dsnChipPhCss = true
            } catch (e) { /* noop */ }
          }
          return function () { if (props.onReady) props.onReady(null) }
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        return h('div', {
          ref: editorRef,
          'data-dsn-ph': '1',
          contentEditable: true,
          suppressContentEditableWarning: true,
          onInput: syncFromDom,
          onMouseDown: function () {
            // 空编辑器点击：光标移到最前（占位位置）——与原生 input placeholder 一致，输入文字从最左开始
            var ed = editorRef.current
            if (ed && !ed.textContent && !ed.querySelector('[data-tok]')) {
              try {
                var range = document.createRange()
                range.selectNodeContents(ed)
                range.collapse(true)
                var sel = window.getSelection()
                sel.removeAllRanges()
                sel.addRange(range)
              } catch (e) { /* noop */ }
            }
          },
          onKeyDown: function (e) {
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
              // 删除紧邻的胶囊时手动处理：浏览器删除 contenteditable=false 元素后会把光标乱跳
              // （常跳到编辑器开头），这里走 removeChipAt（光标恢复到删除位置）
              var sel = window.getSelection()
              var range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
              var target = null
              if (range && range.collapsed) {
                if (e.key === 'Backspace') {
                  var bc = range.startContainer
                  if (bc.nodeType === 3 && range.startOffset === 0) target = bc.previousSibling
                  else if (bc.nodeType === 1) target = range.startContainer.previousSibling
                  else if (bc.nodeType === 3 && range.startOffset > 0) { /* 文本中间，正常删字符 */ }
                } else {
                  var dc = range.startContainer
                  if (dc.nodeType === 3 && range.startOffset === dc.length) target = dc.nextSibling
                  else if (dc.nodeType === 1) target = dc.nextSibling
                }
                while (target && target.nodeType !== 1) target = e.key === 'Backspace' ? target.previousSibling : target.nextSibling
                if (target && target.hasAttribute && target.hasAttribute('data-tok')) {
                  e.preventDefault()
                  removeChipAt(target)
                  return
                }
              }
              // 普通文本删除：交给浏览器（会在下一拍触发 input），删除文本的残留交给 syncFromDom
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
            minHeight: '38px', padding: props.compact ? '5px 8px' : '7px 10px', borderRadius: '8px',
            border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
            background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '13px',
            lineHeight: 1.5, outline: 'none', wordBreak: 'break-word',
            boxSizing: 'border-box', // 与普通 input 高度一致（minHeight 含 padding/border）
          },
        })
      }

      /** 各语言「会话」前缀（用于默认提示中在标签内插入会话标题标签）。 */
      var SESSION_PREFIX = { zh: '会话', 'zh-tw': '會話', en: 'Session ', ja: 'セッション', ko: '세션 ' }

      /** 内置默认内容的提示串（空模板时直接展示真实默认效果：会话「会话标题」+ 信息标签）。 */
      function defaultHintOf(field, langCode) {
        var lang = LANG_IDS.indexOf(langCode) >= 0 ? langCode : 'zh'
        var tt = tOf(lang)
        var label = (tt.kindLabels && tt.kindLabels[field]) || tt.samples.label
        var d = '{duration}'
        var u = '{usage}'
        var prefix = SESSION_PREFIX[lang] || '会话'
        var rest = String(label).slice(prefix.length) // 剥掉「会话」前缀，保留原因后缀（已完成/中止/…）
        var titleTag = lang === 'en' ? '"{title}"' : '「{title}」'
        var head = prefix + titleTag + ((lang === 'en' || lang === 'ko') ? ' ' : '') + rest
        if (lang === 'en') return head + ' (took ' + d + ', used ' + u + ').'
        if (lang === 'ja') return head + '（所要 ' + d + '、消費 ' + u + '）。'
        if (lang === 'ko') return head + '（소요 ' + d + ', 소모 ' + u + '）。'
        if (lang === 'zh-tw') return head + '（用時 ' + d + '，消耗 ' + u + '）。'
        return head + '（用时 ' + d + '，消耗 ' + u + '）。'
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
        var permTickState = useState(0) // 通知权限状态刷新计数（请求授权后 setPermTick(+1) 重渲染）
        var permTick = permTickState[0]
        var setPermTick = permTickState[1]
        var titleFoldState = useState(false) // 「标题」折叠区（全局推送标题 + 按原因定制标题）展开状态
        var titleFoldOpen = titleFoldState[0]
        var setTitleFoldOpen = titleFoldState[1]
        var titleMenuState = useState(false) // 推送标题的「＋ 插入信息」菜单展开状态
        var titleMenuOpen = titleMenuState[0]
        var setTitleMenuOpen = titleMenuState[1]
        var tplOpenState = useState(false) // 「内容」折叠区展开状态（默认收起，保持面板简洁）
        var tplOpen = tplOpenState[0]
        var setTplOpen = tplOpenState[1]
        var previewState = useState(null) // 大图预览（lightbox）：非空 = 正在预览该 data URI/URL
        var previewUrl = previewState[0]
        var setPreviewUrl = previewState[1]

        /** 用户手势内请求通知权限（Chromium 忽略非手势的自动请求，必须由点击触发）；授权结果经重渲染刷新状态区。 */
        function requestPermissionNow() {
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
              var req = Notification.requestPermission()
              if (req && typeof req.then === 'function') {
                req.then(function (p) {
                  log('user-gesture notification permission → ' + p)
                  setPermTick(permTick + 1)
                }).catch(function () { setPermTick(permTick + 1) })
              } else {
                setPermTick(permTick + 1)
              }
            }
          } catch (e) { /* noop */ }
        }

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
          // 函数式更新：以**最新** draft 为基准（而非渲染闭包 cur）——
          // 图片上传等异步回调（FileReader/压缩）晚于点击事件执行，若用旧 cur
          // Object.assign 会把期间刚插入的 {image} 等模板更新覆盖掉（标签消失 bug）。
          setDraft(function (prev) {
            var base = prev === null ? value : prev
            var next = Object.assign({}, base)
            next[key] = x
            return next
          })
          setNote('')
          setJustSaved(false)
        }

        /** 载入内置或自定义预设到表单（下拉只负责载入，不跟踪表单状态）。 */
        function loadPreset(entry, custom) {
          var flat = flatOf(cur)
          var next = Object.assign({}, cur)
          next.language = entry.language
          next.titleTemplate = String(entry.titleTemplate ?? '')
          for (var j = 0; j < REASON_FIELDS.length; j++) next['tpl-' + REASON_FIELDS[j]] = entry.templates[REASON_FIELDS[j]]
          // 按原因定制标题（旧预设可能没有 → 空）
          var et = (entry.titleTemplates && typeof entry.titleTemplates === 'object') ? entry.titleTemplates : {}
          for (var t2 = 0; t2 < REASON_FIELDS.length; t2++) next['tt-' + REASON_FIELDS[t2]] = typeof et[REASON_FIELDS[t2]] === 'string' ? et[REASON_FIELDS[t2]] : ''
          // 通知媒体（大图/图标 + 完整预览版；旧预设缺失 → 清空）
          next.imageUrl = String(entry.imageUrl ?? '')
          next.iconUrl = String(entry.iconUrl ?? '')
          next['preview-imageUrl'] = String(entry.imagePreviewUrl ?? '')
          next['preview-iconUrl'] = String(entry.iconPreviewUrl ?? '')
          var ei = (entry.images && typeof entry.images === 'object') ? entry.images : {}
          var eic = (entry.icons && typeof entry.icons === 'object') ? entry.icons : {}
          var eip = (entry.imagePreviews && typeof entry.imagePreviews === 'object') ? entry.imagePreviews : {}
          var eicp = (entry.iconPreviews && typeof entry.iconPreviews === 'object') ? entry.iconPreviews : {}
          for (var t3 = 0; t3 < REASON_FIELDS.length; t3++) {
            var f3 = REASON_FIELDS[t3]
            next['img-' + f3] = typeof ei[f3] === 'string' ? ei[f3] : ''
            next['icon-' + f3] = typeof eic[f3] === 'string' ? eic[f3] : ''
            next['pv-img-' + f3] = typeof eip[f3] === 'string' ? eip[f3] : ''
            next['pv-icon-' + f3] = typeof eicp[f3] === 'string' ? eicp[f3] : ''
          }
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
          var flat = flatOf(cur)
          var images = {}
          var icons = {}
          var imagePreviews = {}
          var iconPreviews = {}
          for (var si = 0; si < REASON_FIELDS.length; si++) {
            var sk = REASON_FIELDS[si]
            images[sk] = flat['img-' + sk]
            icons[sk] = flat['icon-' + sk]
            imagePreviews[sk] = flat['pv-img-' + sk]
            iconPreviews[sk] = flat['pv-icon-' + sk]
          }
          var cp = {
            id: 'cu-' + Date.now().toString(36),
            name: name,
            language: LANG_IDS.indexOf(cur.language) >= 0 ? cur.language : 'zh',
            titleTemplate: flat.titleTemplate,
            titleTemplates: flat.titleTemplates,
            templates: flatTemplatesOf(cur),
            // 通知媒体（大图/图标 + 完整预览版）一并存入预设；默认预设保持留空
            imageUrl: flat.imageUrl,
            iconUrl: flat.iconUrl,
            imagePreviewUrl: flat['preview-imageUrl'],
            iconPreviewUrl: flat['preview-iconUrl'],
            images: images,
            icons: icons,
            imagePreviews: imagePreviews,
            iconPreviews: iconPreviews,
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
          // 删除的是当前使用的预设 → 表单恢复默认预设内容（presetIdOf 自动匹配「默认」）
          if (shownEntry.id === (activePreset && activePreset.id)) {
            setDraft(Object.assign({}, DEFAULT_FLAT))
          }
          setNote(t.customDeleted)
          log('custom preset deleted')
        }

        function save() {
          var flat = flatOf(cur)
          var templates = {}
          var titleTemplates = {}
          var images = {}
          var icons = {}
          var imagePreviews = {}
          var iconPreviews = {}
          for (var i = 0; i < REASON_FIELDS.length; i++) {
            var k = REASON_FIELDS[i]
            templates[k] = flat['tpl-' + k]
            titleTemplates[k] = flat['tt-' + k]
            // 标签即数据开关：模板里没有 {image}/{icon} 时对应数据一并清空（删除标签即删除图片数据）
            var hasImg = String(flat['tpl-' + k]).indexOf('{image}') >= 0
            var hasIcon = String(flat['tpl-' + k]).indexOf('{icon}') >= 0
            images[k] = hasImg ? flat['img-' + k] : ''
            imagePreviews[k] = hasImg ? flat['pv-img-' + k] : ''
            icons[k] = hasIcon ? flat['icon-' + k] : ''
            iconPreviews[k] = hasIcon ? flat['pv-icon-' + k] : ''
          }
          setNote(t.saving)
          var tasks = [
            scope.set('language', flat.language),
            scope.set('templates', templates),
            scope.set('titleTemplate', flat.titleTemplate),
            scope.set('titleTemplates', titleTemplates),
            scope.set('pushMode', flat.pushMode),
            scope.set('imageUrl', flat.imageUrl),
            scope.set('iconUrl', flat.iconUrl),
            scope.set('imagePreviewUrl', flat['preview-imageUrl']),
            scope.set('iconPreviewUrl', flat['preview-iconUrl']),
            scope.set('images', images),
            scope.set('icons', icons),
            scope.set('imagePreviews', imagePreviews),
            scope.set('iconPreviews', iconPreviews),
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
              entry = Object.assign({}, shownEntry, { language: lang, titleTemplate: flat.titleTemplate, titleTemplates: titleTemplates, templates: templates })
              list = customPresets.map(function (cp) {
                if (cp.id === targetId) { found = Object.assign({}, cp, entry); return found }
                return cp
              })
              if (!found) { list = list.concat([entry]); found = entry }
            } else {
              var n = nextUnnamedNumber(customPresets)
              targetId = n === 1 ? 'unnamed' : 'unnamed-' + n
              entry = { id: targetId, name: null, auto: true, language: lang, titleTemplate: flat.titleTemplate, titleTemplates: titleTemplates, templates: templates }
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

        /**
         * 本地图片 → 两份 data URI（canvas、JPEG 0.8），回调 cb({ media, full })：
         *  - media：通知媒体版——maxSize 宽 + cropAspect>0 时**中心裁切（cover）**（Windows toast hero 约 16:9、
         *    图标 1:1），裁切后 = 通知里显示的图（所见即所得）；cropAspect=0 时等比不裁切。小图不放大。
         *  - full：完整预览版——等比缩放至最长边 1024px（不裁切，保原比例），供点击缩略图时 lightbox 查看原图
         *    （不被裁切；小图不放大）。单张约 60~250KB。
         */
        function compressImageFile(file, cb, maxSize, cropAspect) {
          try {
            if (!file || String(file.type || '').indexOf('image/') !== 0) { cb(null); return }
            var reader = new FileReader()
            reader.onload = function () {
              var img = new Image()
              img.onload = function () {
                try {
                  var w0 = img.width || 1
                  var h0 = img.height || 1
                  // 完整预览版：等比 1024（不裁切）
                  var fscale = Math.min(1, 1024 / Math.max(w0, h0))
                  var fw = Math.max(1, Math.round(w0 * fscale))
                  var fh = Math.max(1, Math.round(h0 * fscale))
                  var fcanvas = document.createElement('canvas')
                  fcanvas.width = fw
                  fcanvas.height = fh
                  fcanvas.getContext('2d').drawImage(img, 0, 0, fw, fh)
                  var full = fcanvas.toDataURL('image/jpeg', 0.8)
                  // 通知媒体版：maxSize 宽 + 裁切（cropAspect>0）或等比（0）
                  var MAX = maxSize || 512
                  var ratio = cropAspect && cropAspect > 0 ? cropAspect : 0
                  var TW, TH, sx, sy, sw, sh
                  if (ratio > 0) {
                    // cover 中心裁切到 ratio：目标宽 = min(MAX, 裁切后源宽)（小图不放大）
                    var srcAspect = w0 / h0
                    var dstAspect = ratio
                    if (srcAspect > dstAspect) { sh = h0; sw = Math.round(h0 * dstAspect); sx = Math.round((w0 - sw) / 2); sy = 0 }
                    else { sw = w0; sh = Math.round(w0 / dstAspect); sx = 0; sy = Math.round((h0 - sh) / 2) }
                    TW = Math.max(1, Math.min(MAX, sw))
                    TH = Math.max(1, Math.round(TW / ratio))
                  } else {
                    // 等比缩放（不裁切）
                    var scale = Math.min(1, MAX / Math.max(w0, h0))
                    TW = Math.max(1, Math.round(w0 * scale))
                    TH = Math.max(1, Math.round(h0 * scale))
                    sx = 0; sy = 0; sw = w0; sh = h0
                  }
                  var canvas = document.createElement('canvas')
                  canvas.width = TW
                  canvas.height = TH
                  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, TW, TH)
                  cb({ media: canvas.toDataURL('image/jpeg', 0.8), full: full })
                } catch (e) { cb(null) }
              }
              img.onerror = function () { cb(null) }
              img.src = String(reader.result || '')
            }
            reader.onerror = function () { cb(null) }
            reader.readAsDataURL(file)
          } catch (e) { cb(null) }
        }

        /** 全局通知大图/图标的本地上传：压缩（裁切版 + 完整预览版）后写入 imageUrl/iconUrl（通知用）
         *  与 preview-imageUrl/preview-iconUrl（lightbox 查看原图用）草稿。 */
        function pickMediaUrl(key, maxSize, cropAspect) {
          try {
            var input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = function () {
              var file = input.files && input.files[0]
              compressImageFile(file, function (res) {
                input.remove()
                if (res) {
                  setVal(key, res.media)
                  setVal('preview-' + key, res.full)
                  log('media uploaded for ' + key + ' (' + Math.round((res.media.length + res.full.length) / 1024) + 'KB)')
                } else {
                  setNote(t.imageFailed)
                  log('media upload failed for ' + key)
                }
              }, maxSize, cropAspect)
            }
            input.click()
          } catch (e) { /* noop */ }
        }

        /** 通知媒体卡片（供「通知图片」行横排复用）：label 在上 + 卡片在下。
         *  空态 = 圆角矩形 + 号（点击上传）；有图 = 缩略图 + 右上角 ×（点击删除）。
         *  兼容旧数据：值可为 data URI 或 https URL（img 直接显示，加载失败隐藏留空矩形，× 仍可删除）。 */
        function mediaCard(key, maxSize, cropAspect, label) {
          var val = String(cur[key] ?? '')
          var hasMedia = val !== ''
          // 预览 = 完整原图（等比未裁切版，优先），无则回退裁切版/URL
          var pvSrc = previewOf(cur, key === 'iconUrl' ? 'iconUrl' : 'imageUrl') || val
          var square = cropAspect === 1
          // 两卡等高（64px）：图标 1:1 = 64×64，大图 16:9 = 114×64
          var CARD_H = 64
          var w = square ? CARD_H + 'px' : Math.round(CARD_H * (16 / 9)) + 'px'
          var hh = CARD_H + 'px' // 注意：不可命名为 h（会遮蔽模块级 react.createElement）
          var cardBorder = '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))'
          return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' } },
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, inherit)' } }, label),
            h('div', { style: { position: 'relative', width: w, height: hh } },
              hasMedia
                ? h('img', {
                  src: val, alt: '', title: label,
                  onClick: function () { setPreviewUrl(pvSrc) }, // 点击缩略图查看完整原图（等比未裁切）
                  style: {
                    width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', display: 'block',
                    border: cardBorder, background: 'rgba(127,127,127,0.12)', cursor: 'zoom-in',
                  },
                  onError: function (e) { e.target.style.visibility = 'hidden' },
                })
                : h('button', {
                  type: 'button',
                  title: square ? t.iconPickTitle : t.imagePickTitle,
                  onClick: function () { pickMediaUrl(key, maxSize, cropAspect) },
                  style: {
                    width: '100%', height: '100%', cursor: 'pointer', padding: '0',
                    fontSize: '26px', lineHeight: '1', color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.8))',
                    borderRadius: '8px', border: '1px dashed var(--dsw-alias-border-l2, rgba(127,127,127,0.5))',
                    background: 'rgba(127,127,127,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  },
                }, '+'),
              hasMedia
                ? h('button', {
                  type: 'button', title: t.clearMedia,
                  onClick: function () { setVal(key, '') },
                  style: {
                    position: 'absolute', top: '-7px', right: '-7px', width: '20px', height: '20px', padding: '0',
                    borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: 'rgba(20,22,28,0.75)', color: '#fff', fontSize: '12px', lineHeight: '20px', textAlign: 'center',
                  },
                }, '×')
                : null,
            ),
          )
        }

        /** 为某原因选择本地图片：文件选择 → 压缩 → 写入 img-<field> 草稿（保存时随设置文档持久化）。 */
        /** 为某原因上传媒体（大图 img / 图标 icon）：压缩（裁切版 + 完整预览版）→ 写入 img-<field>/icon-<field>（通知用）
         *  与 pv-img-<field>/pv-icon-<field>（lightbox 查看原图用）草稿。 */
        function pickReasonMedia(field, key, maxSize, cropAspect) {
          try {
            var input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = function () {
              var file = input.files && input.files[0]
              compressImageFile(file, function (res) {
                input.remove()
                if (res) {
                  setVal(key + '-' + field, res.media)
                  setVal('pv-' + key + '-' + field, res.full)
                  log(key + ' picked for ' + field + ' (' + Math.round((res.media.length + res.full.length) / 1024) + 'KB)')
                } else {
                  setNote(t.imageFailed)
                  log(key + ' pick failed for ' + field)
                }
              }, maxSize, cropAspect)
            }
            input.click()
          } catch (e) { /* noop */ }
        }

        /** 发送测试通知：用当前模板（空模板用默认文案）渲染该原因的通知；标题按原因优先级。 */
        function sendTestNotice(field) {
          try {
            var samples = t.samples
            var titleTpl = titleTplOf(cur, field) || String(cur.titleTemplate || '').trim() || t.ttPlaceholders[field]
            var title = String(titleTpl)
              .replace(/\{image\}/g, '').replace(/\{icon\}/g, '')
              .replaceAll('{title}', samples.title)
              .replaceAll('{duration}', samples.duration)
              .replaceAll('{usage}', samples.usage)
              .replaceAll('{error}', samples.error)
              .replaceAll('{cache}', samples.cache)
              .replaceAll('{tps}', samples.tps)
              .trim() || samples.title
            var tpl = templateOf(cur, field)
            var bodyTpl = tpl !== '' ? tpl : defaultHintOf(field, cur.language)
            var body = String(bodyTpl)
              .replace(/\{label\}/g, '')
              .replace(/\{image\}/g, '') // {image}/{icon} 是开关标签：正文只剥除，媒体由 notifyUser 按 data 附加
              .replace(/\{icon\}/g, '')
              .replaceAll('{title}', samples.title)
              .replaceAll('{duration}', samples.duration)
              .replaceAll('{usage}', samples.usage)
              .replaceAll('{error}', samples.error)
              .replaceAll('{cache}', samples.cache)
              .replaceAll('{tps}', samples.tps)
            notifyUser(title, body, ['dual', 'system', 'toast'].indexOf(cur.pushMode) >= 0 ? cur.pushMode : 'dual', {
              iconUrl: String(cur.iconUrl || ''),
              imageUrl: String(cur.imageUrl || ''),
              imageData: imageOf(cur, field),
              iconData: iconOf(cur, field),
            })
            log('test notice sent: ' + field)
          } catch (e) {
            log('test notice failed: ' + (e && e.message ? e.message : e))
          }
        }

        /** 一键重置：除语言外全部还原为默认值（语言保留当前选择）并立即保存。 */
        function resetAll() {
          var def = DEFAULT_FLAT
          var lang = LANG_IDS.indexOf(cur.language) >= 0 ? cur.language : 'zh' // 重置不改变语言
          setNote(t.saving)
          var tasks = [
            scope.set('language', lang),
            scope.set('templates', def.templates),
            scope.set('titleTemplate', def.titleTemplate),
            scope.set('titleTemplates', def.titleTemplates),
            scope.set('pushMode', def.pushMode),
            scope.set('imageUrl', def.imageUrl),
            scope.set('iconUrl', def.iconUrl),
            scope.set('imagePreviewUrl', def.imagePreviewUrl),
            scope.set('iconPreviewUrl', def.iconPreviewUrl),
            scope.set('images', def.images),
            scope.set('icons', def.icons),
            scope.set('imagePreviews', def.imagePreviews),
            scope.set('iconPreviews', def.iconPreviews),
          ]
          Promise.all(tasks).then(function () {
            setDraft(null)
            setNote(t.resetDone)
            setJustSaved(true)
            log('settings reset to defaults (language kept: ' + lang + ')')
          }).catch(function (e) {
            setNote(t.saveFailed + (e && e.message ? e.message : e))
            log('settings reset failed: ' + (e && e.message ? e.message : e))
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
            // 通知媒体：自定义大图（Notification image）与小图标（Notification icon），仅系统通知通道生效；
            // 两张上传卡片并排一行（中间留白），上方是处理方式说明
            h('div', { key: 'media-note', style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.8))', lineHeight: 1.6, padding: '8px 0 0' } }, t.mediaNote),
            h('div', { key: 'media-row', style: { display: 'flex', alignItems: 'flex-start', gap: '36px', padding: '12px 0', borderTop: DIVIDER } },
              mediaCard('iconUrl', 128, 1, t.iconUrl),
              mediaCard('imageUrl', 512, 16 / 9, t.imageUrl),
            ),
            // 标题折叠区（默认收起）：全局推送标题 + 按原因定制标题
            h('div', { key: 'title-fold', style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 0', borderTop: DIVIDER } },
              h('button', {
                type: 'button',
                onClick: function () { setTitleFoldOpen(!titleFoldOpen) },
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', appearance: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '0', font: 'inherit', textAlign: 'left', width: '100%' },
              },
                h('span', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.titlesGroup),
                h('span', { style: { fontSize: '18px', lineHeight: '1', color: SUBTLE, display: 'inline-block', width: '18px', textAlign: 'center' } }, titleFoldOpen ? '▾' : '▸'),
              ),
            ),
            titleFoldOpen
              ? h('div', { key: 'title-fold-body', style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 0', borderTop: DIVIDER } },
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
                    h('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.titleLabel),
                    h('button', {
                      type: 'button', title: t.insertTitle,
                      onClick: function () { setTitleMenuOpen(!titleMenuOpen) },
                      style: { appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))', background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)' },
                    }, t.insertInfo),
                  ),
                  // 推送标题的信息插入菜单：与原因栏同款（可插 {title}{duration}{usage}{error}{cache}{tps}，不含图片）
                  titleMenuOpen
                    ? h('div', {
                      key: 'title-menu',
                      style: {
                        display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px',
                        borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
                        background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))',
                      },
                    }, TOKEN_KEYS.map(function (k) {
                      return h('button', {
                        key: k, type: 'button',
                        onClick: function () {
                          var handle = editorRefs.current.__title
                          if (handle) handle.insertAtCaret(k)
                          else setVal('titleTemplate', String(cur.titleTemplate ?? '') + '{' + k + '}')
                          // 插入后保持菜单展开：方便连续插入多个标签，由用户自行折叠
                        },
                        style: {
                          appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '4px 10px',
                          borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
                          background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)',
                        },
                      }, '＋ ' + t.tokens[k])
                    }))
                    : null,
                  // 推送标题 = Chip 编辑器（标签化显示，与正文模板同款交互：光标处插入胶囊、点击移除）
                  h(ChipEditor, {
                    template: String(cur.titleTemplate ?? ''),
                    lang: cur.language,
                    placeholder: t.titleHint,
                    imageData: '',
                    iconData: '',
                    imagePreview: '',
                    iconPreview: '',
                    onChange: function (tpl) { setVal('titleTemplate', tpl) },
                    onReady: function (handle) {
                      if (handle) editorRefs.current.__title = handle
                      else delete editorRefs.current.__title
                    },
                    onPreview: function (src) { setPreviewUrl(src) },
                  }),
                ),
                // 按原因定制标题：留空 = 用上方全局模板或语言默认标题
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  h('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.titleTplLabel),
                  REASON_FIELDS.map(function (field) {
                    return h('div', { key: 'tt-' + field, style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                      h('span', { style: { width: '60px', flex: 'none', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.8))' } }, t.fields[field]),
                      h('input', {
                        value: titleTplOf(cur, field),
                        placeholder: t.ttPlaceholders[field],
                        onChange: function (e) { setVal('tt-' + field, e.target.value) },
                        style: Object.assign({}, SELECT_STYLE, { flex: 1, fontSize: '13px' }),
                      }),
                    )
                  }),
                ),
              )
              : null,
          ]
          // 内容折叠区（默认收起，保持面板简洁）：展开后才是 5 条原因的正文模板编辑器
          rows.push(h('div', {
            key: 'tpl-fold',
            style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 0', borderTop: DIVIDER },
          },
            h('button', {
              type: 'button',
              onClick: function () { setTplOpen(!tplOpen) },
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', appearance: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '0', font: 'inherit', textAlign: 'left', width: '100%' },
            },
              h('span', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary, inherit)' } }, t.tplLabel),
              h('span', { style: { fontSize: '18px', lineHeight: '1', color: SUBTLE, display: 'inline-block', width: '18px', textAlign: 'center' } }, tplOpen ? '▾' : '▸'),
            ),
          ))
          // 模板（forEach：每条回调独立绑定字段，避免 var 闭包串写）
          // 每栏 = 标签行（左文案 + 右「＋插入信息」）+ ChipEditor（文字+内联胶囊，光标处插入）
          //      + 实时预览（正文普通文本、信息为示例值）
          if (tplOpen) {
            REASON_FIELDS.forEach(function (field) {
              var tplValue = templateOf(cur, field)
            // 一行式：原因标签 + Chip 编辑器（紧凑内边距）+ 「+/−」插入菜单按钮 + 纸飞机发送按钮
            var iconBtn = {
              appearance: 'none', width: '28px', height: '28px', borderRadius: '6px', padding: '0', flex: 'none',
              border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
              background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)', cursor: 'pointer',
              fontSize: '16px', lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }
            rows.push(h('div', {
              key: 'tpl-' + field,
              style: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '5px 0', borderTop: DIVIDER },
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { width: '60px', flex: 'none', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.8))' } }, t.fields[field]),
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h(ChipEditor, {
                    template: tplValue,
                    lang: cur.language,
                    compact: true,
                    hint: defaultHintOf(field, cur.language), // 空模板（默认预设）时显示默认文案，所见即所推
                    placeholder: t.placeholder, // 用户编辑后删空 → 显示占位提示（CSS 伪元素，不可选中/删除）
                    imageData: imageOf(cur, field),
                    iconData: iconOf(cur, field),
                    imagePreview: previewOf(cur, 'img', field),
                    iconPreview: previewOf(cur, 'icon', field),
                    onChange: function (tpl) {
                      setVal('tpl-' + field, tpl)
                      // 标签即数据开关：模板中不再含 {image}/{icon} → 即时清除该原因已上传的图片/图标数据
                      if (String(tpl).indexOf('{image}') === -1) setVal('img-' + field, '')
                      if (String(tpl).indexOf('{icon}') === -1) setVal('icon-' + field, '')
                    },
                    onReady: function (handle) {
                      if (handle) editorRefs.current[field] = handle
                      else delete editorRefs.current[field]
                    },
                    onPreview: function (src) { setPreviewUrl(src) },
                  }),
                ),
                h('button', {
                  type: 'button', title: t.insertTitle,
                  onClick: function () { setMenuFor(menuFor === field ? null : field) },
                  style: iconBtn,
                }, menuFor === field
                  ? h('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', style: { display: 'block' } },
                    h('line', { x1: '5', y1: '12', x2: '19', y2: '12' }))
                  : h('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', style: { display: 'block' } },
                    h('line', { x1: '12', y1: '5', x2: '12', y2: '19' }),
                    h('line', { x1: '5', y1: '12', x2: '19', y2: '12' }))),
                h('button', {
                  type: 'button', title: t.sendTestTitle,
                  onClick: function () { sendTestNotice(field) },
                  style: iconBtn,
                }, h('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block' } },
                  h('path', { d: 'M5 12h14' }),
                  h('path', { d: 'm12 5 7 7-7 7' }))),
              ),
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
                      // 插入后保持菜单展开：方便连续插入多个标签，由用户自行折叠
                    },
                    style: {
                      appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '4px 10px',
                      borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
                      background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)',
                    },
                  }, '＋ ' + t.tokens[k])
                }).concat([
                  h('button', {
                    key: 'image', type: 'button', title: t.imagePickTitle,
                    onClick: function () {
                      // 插入 {image} 标签 + 弹文件选择（上传的图压缩后存 img-<field>，保存时随设置文档持久化）；
                      // 已有图再点 = 替换。渲染时 {image} 只作开关被剥除，图片本体不进会话日志
                      var handle = editorRefs.current[field]
                      if (handle) handle.insertAtCaret('image')
                      else setVal('tpl-' + field, templateOf(cur, field) + '{image}')
                      pickReasonMedia(field, 'img', 512, 16 / 9)
                    },
                    style: {
                      appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '4px 10px',
                      borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
                      background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)',
                    },
                  }, '＋ ' + t.tokens.image),
                  h('button', {
                    key: 'icon', type: 'button', title: t.iconPickTitle,
                    onClick: function () {
                      // 插入 {icon} 标签 + 弹文件选择（图标 128×128 方形裁切，存 icon-<field>）
                      var handle = editorRefs.current[field]
                      if (handle) handle.insertAtCaret('icon')
                      else setVal('tpl-' + field, templateOf(cur, field) + '{icon}')
                      pickReasonMedia(field, 'icon', 128, 1)
                    },
                    style: {
                      appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '4px 10px',
                      borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
                      background: 'none', color: 'var(--dsw-alias-label-secondary, inherit)',
                    },
                  }, '＋ ' + t.tokens.icon),
                ]))
                : null,
            ))
          })
          }
          // 通知权限状态区（footer 之上）：授权状态 + 引导（Edge 自动屏蔽等场景一目了然）
          rows.push(notificationPermissionRow(t, requestPermissionNow))
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
              type: 'button', disabled: note === t.saving, onClick: resetAll,
              style: Object.assign({}, GHOST, { opacity: note === t.saving ? 0.4 : 1 }),
            }, t.reset),
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
          // 大图预览（lightbox）：点击图片/图标缩略图时全屏查看，点击任意处关闭
          previewUrl
            ? h('div', {
              key: 'lightbox',
              onClick: function () { setPreviewUrl(null) },
              style: {
                position: 'fixed', inset: '0', zIndex: 9999, cursor: 'zoom-out',
                background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
              },
            },
              h('img', {
                src: previewUrl, alt: '',
                style: { maxWidth: '92%', maxHeight: '92%', borderRadius: '8px', objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' },
              }),
            )
            : null,
        )
      }
    }

    return module.exports
  }
})
