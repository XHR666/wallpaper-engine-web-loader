// bench-patch.js — :8901 测试台（WebWallGL 静态构建产物）的运行期补丁
//
// 为什么存在：本机/离线环境装不上依赖（`pnpm install --offline` 缺 mediabunny，
// 见 ww-pages/PATCH-NOTES.md §0），无法 `vite build` 重新出包，所以行为改动集中在
// **这一个** 文件里，由 index.html 末尾以 `type="module"` 引入。它**不改 minified 产物**
// （只被动读 DOM / 读写 #resolution 的 value 并派发 change，沿用 bundle 既有链路）。
//
// 纯函数（Node 可直接 import 测试，见同目录 bench-patch.test.mjs）：
//   makeT / buildValueIndex / translateRendered / collectSlots / sweepRendered
//   hasResidualLang / applyTitle / applyStaticI18n / diagOfflineState / trailPointAt
//   第五批：readPatchFlags / pointerParkAction / ownTextOf / timeLayerPlan /
//           brandingFromProject / sniffItemId / dragPropsToDisable / mediaBrandPlan
// 浏览器初始化只在 `typeof document !== 'undefined'` 时执行。
//
// 第五批开关（写 0/false/off/no 即回退到上游原行为；默认全开）：
//   ?ppark=0      鼠标移出舞台/视口后**不**把指针拉回中心（上游：冻结在最后位置）
//   ?clocklock=0  **不**给注入到页面里的 DOM 时间层加 pointer-events:none/不可拖拽
//   ?clockdrag=0  **不**关闭壁纸自带的「可拖动」布尔用户属性
//   ?brand=0      **不**把媒体组件的名称/图标换成壁纸自己的 project.json title/preview
//
// ⚠ 重建纪律：本文件里 ③④（i18n 全量切换、诊断离线态）已在源码 bench/i18n.ts + bench/bench.ts
//   里用正规写法实现，**重建后可删对应 init 段**；②（自绘紧凑下拉）与 ⑨（鼠标尾迹）尚未回写
//   源码（产物版无 TS 编译校验，直接改 TS 有不可验证风险），搬迁清单见 PATCH-NOTES.md §2/§4。

/* ============================ 词典（由 bench/i18n.ts 机械生成，勿手改） ============================ */
// 生成方式：node -e "…解析 bench/i18n.ts 的 DICT…"（见 PATCH-NOTES.md §3）；bench-patch.test.mjs
// 的 T1 会把本块与源码 DICT 逐键比对，任何漂移都会红。
export const DICT = {"zh":{"app.title":"wallpaper-engine-webgl","picker.title":"自定义颜色","picker.hex":"十六进制","picker.hint":"拖动色相条与面板，或直接输入 #rrggbb","picker.ok":"确定","picker.cancel":"取消","copy.logs":"复制输出","copy.url":"复制链接","copy.ok":"已复制到剪贴板","copy.manual":"剪贴板不可用（file:// 或未授权）：请手动复制下面选中的文本","copy.fail":"复制失败：{msg}","error.title":"页面脚本出错（已兜底）","error.dismiss":"关闭","error.logged":"详情已写入输出区","fs.enter":"全屏","fs.enterTitle":"全屏预览（退出按钮在全屏内右上角）","fs.exit":"退出全屏","fs.exitTitle":"退出全屏（也可按 Esc）","fs.unsupported":"当前浏览器不支持全屏 API","local.pickTitle":"选择本地壁纸文件夹（纯前端读取，文件不离开浏览器）","local.unsupported":"当前浏览器不支持目录选择（webkitdirectory / showDirectoryPicker）—— 无法加载本地壁纸，请改用桌面版 Chrome / Edge / Firefox","local.reading":"正在读取文件夹…","local.none":"该文件夹里没有找到壁纸（壁纸目录需要 scene.pkg 或 project.json）","local.count":"本地文件夹：{n} 个壁纸","local.sceneOnly":"静态托管下仅支持 scene 包预览（web/video 需本机 Node 后端）","local.preview":"本地预览：{name}","local.clear":"清空","local.clearTitle":"清空本地库与当前选择","local.cleared":"已清空本地库与选择","local.notDir":"这不是文件夹选择：浏览器只回传了一个文件。请点「选择文件夹」并选择目录（不要选单个文件）","local.kindTitle":"扫描时自动识别的类型：{k}","docs.readmeTitle":"本页 README · 使用说明速查","status.dpr":"DPR（设备像素比） {n}","status.dprTitle":"窗口 devicePixelRatio —— 影响渲染分辨率与性能","offline.tag":"离线","offline.diagReason":"静态托管无 /diag 后端：渲染器诊断流不可用（需本地 Node host 或 pnpm dev）","offline.diagTitle":"诊断流不可用（静态托管）","backend.node":"本机 Node 后端已连接","backend.static":"静态托管（无 /api 后端）","backend.staticTitle":"静态托管：本页由静态服务器提供，/api/* 与 /diag 全部 404 —— 壁纸库列表、属性保存、删除、打开所在文件夹、渲染器诊断流都不可用","backend.needBackend":"需要本机 Node 后端（静态托管下不可用）","backend.alt":"可用替代：点「选择文件夹」做纯前端扫描（scene 包可直接预览，文件不离开浏览器）","backend.online":"上线方法：在 webwallgl 源码目录运行 pnpm dev，打开它打印的地址（默认 http://localhost:1430/）—— 那是带 Node host 的完整测试台","backend.offline":"当前浏览器离线（navigator.onLine=false）：本页功能不依赖网络，缺的是本机 Node 后端","backend.blocked":"本机暂时无法启动 Node host：离线环境下依赖不全（pnpm install --offline 报 ERR_PNPM_NO_OFFLINE_TARBALL）","res.pick":"选择分辨率","res.native":"（弹层列表限高可滚动）","trail.on":"鼠标尾迹","trail.needInjection":"需先开启「指针注入」","trail.len":"长度","trail.width":"粗细","trail.color":"颜色","trail.tip":"仅在开启「指针注入」后可用：尾迹取自注入遮罩的坐标，不接管真实鼠标事件","act.explorer":"资源管理器","act.docs":"使用说明","theme.auto":"主题：跟随系统","theme.dark":"主题：深色","theme.light":"主题：浅色","lang.title":"切换语言","backend.demoNoBackend":"在线演示版（GitHub Pages）没有本机 Node 后端 —— 这不是故障，是**设计如此**：线上只有静态文件，/api/* 与 /diag 一律 404。完整测试台（壁纸库列表 / 属性保存 / 删除 / 诊断流）需要在源码目录跑 pnpm dev。","demo.onlineTitle":"在线演示版","demo.onlineBody":"本页是**在线静态演示**：没有本机 Node 后端，壁纸库列表 / 属性保存 / 删除 / 打开所在文件夹 / 渲染器诊断流（/api/* 与 /diag）在线上全部不可用 —— 这不是故障，是纯静态托管的必然结果。「选择文件夹」纯前端扫描仍然可用，默认载入的是本仓库自造的**合成样例**（不含任何真实壁纸）。","demo.onlineSample":"默认壁纸：合成样例 scene.pkg（由 make-sample.mjs 生成，33 299 B，无第三方内容）—— 本仓库**不分发**任何真实壁纸包。","offline.diagReasonOnline":"在线演示版没有 /diag 后端：线上是纯静态托管，渲染器诊断流不可用（这是设计如此，不是断线）","demo.sampleMissing":"合成样例载入失败：{msg}","demo.sampleLoaded":"已载入合成样例：{name}（本仓库自造，无第三方内容）","credit.title":"渲染核心原作者","credit.link":"WebWallGL · oneincase（MIT 许可）","brand.generic":"壁纸","static.notice":"在线静态版：壁纸库列表 / 属性保存 / 删除 / 诊断流需要本机后端；可用「选择文件夹」纯前端扫描本地壁纸（scene 包可预览），完整功能请在源码目录运行 pnpm dev。","static.libPath":"静态托管 · 无本机后端","static.pickTitle":"静态托管下不可用 —— 请在本地运行（pnpm dev）","log.filePreview":"本地预览：{name}","err.filePreview":"本地预览失败：{msg}","sidebar.title":"资源管理器","sidebar.libCount":"壁纸库","sidebar.pickLib":"选择文件夹（也可继续用 WE_LIBRARY）","btn.pickLib":"选择文件夹","ph.filter":"过滤标题 / itemId","ph.propsFilter":"过滤属性名 / 文案","reveal.open":"打开所在文件夹","ctx.delete":"删除壁纸","confirm.delete":"确定删除壁纸「{title}」吗？整个目录将移入废纸篓（{id}）。","ok.delete":"已删除：{id}","err.delete":"删除失败：{msg}","tab.wallpaper":"未选择壁纸","toolbar.resolution":"分辨率","toolbar.resolutionTip":"舞台逻辑分辨率（iframe 视口）","toolbar.volume":"音量","toolbar.live":"系统实况","toolbar.liveTip":"歌名/进度：Node 读 media-control；音频条：麦克风（无系统声卡环回）。换壁纸或勾选后会重挂载","toolbar.pointerPush":"指针注入","toolbar.pointerPushTip":"模拟桌面壁纸窗口：遮罩挡住原生鼠标事件，坐标改经 __wp.pushPointer 推送 —— 与宿主对接的是同一条通道","toolbar.pause":"暂停","toolbar.resume":"恢复","toolbar.reload":"重挂载","toolbar.release":"释放","toolbar.open":"新窗口","toolbar.props":"壁纸配置","toolbar.filter":"滤镜","toolbar.filterTip":"滤镜（beta）：以 CSS filter 应用到渲染输出","filter.none":"无","filter.blur":"高斯模糊","filter.grayscale":"黑白","filter.sepia":"怀旧","filter.vivid":"鲜艳","filter.warm":"暖色","filter.cool":"冷色","filter.invert":"反色","filter.brighten":"提亮","filter.darken":"压暗","filter.contrast":"高对比","res.fit":"自适应 16:9","stage.empty":"从左侧选择一个壁纸开始渲染","logs.head":"输出","logs.diag":"渲染器诊断（/diag）","logs.clear":"清空","logs.collapse":"折叠输出","logs.expand":"展开输出","status.adaptive":"自适应 16:9","status.cap":"上限 {n}","status.uncapped":"无上限","fps.uncapped":"无上限","fps.uncappedTitle":"不加帧率上限（按显示器刷新率出帧）","status.capTitle":"帧率上限（工具条 FPS）","status.liveTitle":"壁纸实测帧率（渲染循环最近 500ms）","status.items":"{n} 项","props.title":"壁纸配置","props.reset":"恢复默认","props.collapse":"收起","props.showHidden":"显示条件隐藏项","props.reading":"读取中…","props.none":"该壁纸未声明可自定义项","props.count":"{n} 项","props.countOverridden":"{n} 项（{m} 项已改）","props.readFail":"读取失败：{msg}","props.saving":"保存中…","props.savedOverridden":"已保存（{n} 项已改）","props.savedAll":"已保存（全部默认）","props.saveFail":"保存失败：{msg}","props.pending":"待保存…","props.logSaved":"属性保存：{id} {n} 项覆盖","props.empty":"project.json 未声明 general.properties，无可自定义项。","props.noMatch":"无匹配属性","props.allHidden":"全部属性都被 condition 隐藏（可勾选上方开关查看）","props.filePh":"相对壁纸根的路径（{kind}）","props.dirPh":"目录绝对路径","props.pickFile":"选择文件…","props.pickDir":"选择目录…","props.fileUnset":"未设置","props.fileUploading":"正在导入…","err.wpNotReady":"__wp 尚未就绪（先选一个壁纸并等页面加载完）","err.diagStream":"诊断流断开（dev server 重启？）","err.pickLib":"选择文件夹失败：{msg}","err.pickFile":"选择文件失败：{msg}","err.pickDir":"选择目录失败：{msg}","err.reveal":"打开文件夹失败：{msg}","err.selectFirst":"先选一个壁纸再打开自定义配置","ok.reveal":"已打开文件夹：{id}","log.libLoaded":"壁纸库载入：{n} 项（scene {s} / web {w} / video {v}）","log.mount":"挂载 {id}：?{q}","log.liveOn":"已开启系统实况（麦克风频谱 + Music/Spotify + 前台窗口）","log.liveOff":"已关闭系统实况，恢复模拟源","log.pointerPushOn":"已开启指针注入：遮罩屏蔽原生鼠标事件，坐标改经 __wp.pushPointer 推送（模拟桌面壁纸窗口）","log.pointerPushOff":"已关闭指针注入，恢复原生鼠标事件","prompt.libDir":"壁纸库目录"},"en":{"app.title":"wallpaper-engine-webgl","picker.title":"Custom color","picker.hex":"Hex","picker.hint":"Drag the hue bar and panel, or type #rrggbb","picker.ok":"OK","picker.cancel":"Cancel","copy.logs":"Copy output","copy.url":"Copy link","copy.ok":"Copied to clipboard","copy.manual":"Clipboard unavailable (file:// or not permitted): copy the selected text below manually","copy.fail":"Copy failed: {msg}","error.title":"Page script error (contained)","error.dismiss":"Dismiss","error.logged":"Details were written to the output panel","fs.enter":"Fullscreen","fs.enterTitle":"Fullscreen preview (the exit button is at the top-right inside fullscreen)","fs.exit":"Exit fullscreen","fs.exitTitle":"Exit fullscreen (Esc also works)","fs.unsupported":"This browser does not support the Fullscreen API","local.pickTitle":"Pick a local wallpaper folder (read in-browser; files never leave it)","local.unsupported":"This browser cannot pick directories (webkitdirectory / showDirectoryPicker) — local wallpapers cannot be loaded here; use desktop Chrome / Edge / Firefox","local.reading":"Reading folder…","local.none":"No wallpapers found in that folder (a wallpaper folder needs scene.pkg or project.json)","local.count":"Local folder: {n} wallpapers","local.sceneOnly":"Static hosting previews scene packages only (web/video need the local Node backend)","local.preview":"Local preview: {name}","local.clear":"Clear","local.clearTitle":"Clear the local library and the current selection","local.cleared":"Cleared the local library and selection","local.notDir":"That was not a folder selection: the browser returned a single file. Click “Choose folder” and pick a directory (not a single file)","local.kindTitle":"Type auto-detected while scanning: {k}","docs.readmeTitle":"This page README · quick reference","status.dpr":"DPR (devicePixelRatio) {n}","status.dprTitle":"Window devicePixelRatio — affects render resolution and performance","offline.tag":"Offline","offline.diagReason":"Static hosting has no /diag backend: the renderer diagnostics stream is unavailable (run the local Node host or pnpm dev)","offline.diagTitle":"Diagnostics stream unavailable (static hosting)","backend.node":"Local Node backend connected","backend.static":"Static hosting (no /api backend)","backend.staticTitle":"Static hosting: this page is served statically, so /api/* and /diag are all 404 — the library listing, property saving, deleting, reveal-in-folder and the diagnostics stream are unavailable","backend.needBackend":"Needs the local Node backend (unavailable under static hosting)","backend.alt":"Working alternative: “Choose folder” scans in-browser (scene packages preview directly; files never leave the browser)","backend.online":"To go online: run pnpm dev in the webwallgl source tree and open the address it prints (default http://localhost:1430/) — that is the full bench with the Node host","backend.offline":"The browser is offline (navigator.onLine=false): nothing here needs the network; what is missing is the local Node backend","backend.blocked":"The Node host cannot be started on this machine right now: dependencies are incomplete offline (pnpm install --offline fails with ERR_PNPM_NO_OFFLINE_TARBALL)","res.pick":"Pick resolution","res.native":"(popup list is height-limited and scrollable)","trail.on":"Mouse trail","trail.needInjection":"Enable “Pointer injection” first","trail.len":"Length","trail.width":"Width","trail.color":"Color","trail.tip":"Only available after enabling “Pointer injection”: the trail uses the injection veil coordinates and never takes over real mouse events","act.explorer":"Explorer","act.docs":"User guide","theme.auto":"Theme: system","theme.dark":"Theme: dark","theme.light":"Theme: light","lang.title":"Switch language","backend.demoNoBackend":"The online demo (GitHub Pages) has no local Node backend — this is **by design**, not a failure: online there are only static files, so /api/* and /diag are 404. The full bench (library listing, property saving, deleting, diagnostics stream) needs pnpm dev in the source tree.","demo.onlineTitle":"Online demo","demo.onlineBody":"This page is an **online static demo**: there is no local Node backend, so the library listing, property saving, deleting, reveal-in-folder and the renderer diagnostics stream (/api/* and /diag) are unavailable online — by design under plain static hosting, not a failure. “Choose folder” (fully client-side scanning) still works, and the default wallpaper is the **synthetic sample** generated by this repository (no real wallpaper is bundled).","demo.onlineSample":"Default wallpaper: the synthetic sample scene.pkg (generated by make-sample.mjs, 33 299 B, no third-party content) — this repository **does not redistribute** any real wallpaper package.","offline.diagReasonOnline":"The online demo has no /diag backend: online is plain static hosting, so the renderer diagnostics stream is unavailable (by design, not a dropped connection)","demo.sampleMissing":"Loading the synthetic sample failed: {msg}","demo.sampleLoaded":"Loaded the synthetic sample: {name} (generated by this repository, no third-party content)","credit.title":"Original renderer author","credit.link":"WebWallGL · oneincase (MIT license)","brand.generic":"Wallpaper","static.notice":"Static demo: the library listing, property saving, deleting and the diagnostics stream need a local backend. Use “Choose folder” to scan local wallpapers in-browser (scene packages preview), or run pnpm dev in the source tree for the full bench.","static.libPath":"Static hosting · no local backend","static.pickTitle":"Unavailable on static hosting — run locally (pnpm dev)","log.filePreview":"Local preview: {name}","err.filePreview":"Local preview failed: {msg}","sidebar.title":"Explorer","sidebar.libCount":"Library","sidebar.pickLib":"Pick folder (or keep using WE_LIBRARY)","btn.pickLib":"Pick folder","ph.filter":"Filter title / itemId","ph.propsFilter":"Filter property name / label","reveal.open":"Open containing folder","ctx.delete":"Delete wallpaper","confirm.delete":"Delete wallpaper “{title}”? Its whole folder will be moved to the Trash ({id}).","ok.delete":"Deleted: {id}","err.delete":"Delete failed: {msg}","tab.wallpaper":"No wallpaper","toolbar.resolution":"Resolution","toolbar.resolutionTip":"Stage logical resolution (iframe viewport)","toolbar.volume":"Volume","toolbar.live":"Live system","toolbar.liveTip":"Title/progress via Node media-control; audio bars via mic (no system loopback). Remounts on toggle","toolbar.pointerPush":"Pointer inject","toolbar.pointerPushTip":"Simulates a desktop wallpaper window: a veil blocks native mouse events and coordinates are pushed via __wp.pushPointer — the same channel the native host uses","toolbar.pause":"Pause","toolbar.resume":"Resume","toolbar.reload":"Remount","toolbar.release":"Release","toolbar.open":"New window","toolbar.props":"Wallpaper config","toolbar.filter":"Filter","toolbar.filterTip":"Filter (beta): CSS filter applied to the rendered output","filter.none":"None","filter.blur":"Blur","filter.grayscale":"Grayscale","filter.sepia":"Sepia","filter.vivid":"Vivid","filter.warm":"Warm","filter.cool":"Cool","filter.invert":"Invert","filter.brighten":"Brighten","filter.darken":"Darken","filter.contrast":"Contrast","res.fit":"Adaptive 16:9","stage.empty":"Pick a wallpaper on the left to start rendering","logs.head":"Output","logs.diag":"Renderer diagnostics (/diag)","logs.clear":"Clear","logs.collapse":"Collapse output","logs.expand":"Expand output","status.adaptive":"Adaptive 16:9","status.cap":"Cap {n}","status.uncapped":"Uncapped","fps.uncapped":"Uncapped","fps.uncappedTitle":"No frame-rate cap (renders as fast as the display allows)","status.capTitle":"FPS cap (toolbar FPS)","status.liveTitle":"Measured wallpaper FPS (render loop, last 500ms)","status.items":"{n} items","props.title":"Wallpaper config","props.reset":"Reset defaults","props.collapse":"Collapse","props.showHidden":"Show condition-hidden items","props.reading":"Reading…","props.none":"This wallpaper declares no custom properties","props.count":"{n} items","props.countOverridden":"{n} items ({m} overridden)","props.readFail":"Read failed: {msg}","props.saving":"Saving…","props.savedOverridden":"Saved ({n} overridden)","props.savedAll":"Saved (all defaults)","props.saveFail":"Save failed: {msg}","props.pending":"Pending save…","props.logSaved":"Properties saved: {id} ({n} overrides)","props.empty":"project.json declares no general.properties — nothing to customize.","props.noMatch":"No matching properties","props.allHidden":"All properties hidden by condition (tick the switch above to view)","props.filePh":"Path relative to wallpaper root ({kind})","props.dirPh":"Absolute directory path","props.pickFile":"Choose file…","props.pickDir":"Choose folder…","props.fileUnset":"Not set","props.fileUploading":"Importing…","err.wpNotReady":"__wp not ready (pick a wallpaper and wait for it to load)","err.diagStream":"Diagnostics stream lost (dev server restarted?)","err.pickLib":"Picking folder failed: {msg}","err.pickFile":"Choosing file failed: {msg}","err.pickDir":"Choosing folder failed: {msg}","err.reveal":"Opening folder failed: {msg}","err.selectFirst":"Pick a wallpaper before opening Properties","ok.reveal":"Opened folder: {id}","log.libLoaded":"Library loaded: {n} items (scene {s} / web {w} / video {v})","log.mount":"Mount {id}: ?{q}","log.liveOn":"Live system on (mic spectrum + Music/Spotify + front window)","log.liveOff":"Live system off; back to simulated sources","log.pointerPushOn":"Pointer injection on: veil blocks native mouse events; coordinates now pushed via __wp.pushPointer (simulates desktop wallpaper window)","log.pointerPushOff":"Pointer injection off; native mouse events restored","prompt.libDir":"Wallpaper library directory"}}

/* ============================ 纯函数层 ============================ */
export const LANGS = ['zh', 'en']
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export function t(lang, key, params) {
  const raw = (DICT[lang] && DICT[lang][key]) || (DICT.en && DICT.en[key]) || key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (_, k) => (params[k] === undefined ? '{' + k + '}' : String(params[k])))
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/**
 * 把一种语言的**已渲染文本**映射回词典条目，从而算出另一种语言的文本。
 * - 精确值：`"资源管理器"` → key → `"Explorer"`
 * - 带参模板：`"上限 60"` ← `"上限 {n}"` ⇒ 捕获 `n=60` → `"Cap 60"`
 * 返回 { key, params } 或 null（不是可翻译文本）。
 */
export function buildValueIndex(lang, toLang) {
  const cand = []
  for (const key of Object.keys(DICT[lang] || {})) {
    const val = DICT[lang][key]
    if (!val) continue
    if (val.indexOf('{') >= 0) {
      const rx = new RegExp('^' + esc(val).replace(/\\\{(\w+)\\\}/g, '(.+?)') + '$')
      cand.push({ key, val, rx, names: (val.match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)) })
    } else {
      cand.push({ key, val, rx: null, names: [] })
    }
  }
  // 同值多键（例如 zh 的 "资源管理器" = act.explorer + sidebar.title）：
  //   候选键在**目标语言**里同值 ⇒ 无害，保留其一；
  //   目标值不一致（曾实测 en "Color" = picker.title + trail.color）⇒ 判为歧义**不译**：
  //   宁可不译也不译错；未命中会进 sweepRendered 的 missed 清单，便于发现词典撞车。
  const byVal = new Map()
  for (const c of cand) { if (!byVal.has(c.val)) byVal.set(c.val, []); byVal.get(c.val).push(c) }
  const out = []
  for (const [, list] of byVal) {
    if (list.length === 1) { out.push(list[0]); continue }
    if (toLang && DICT[toLang]) {
      const targets = new Set(list.map((c) => DICT[toLang][c.key]))
      if (targets.size > 1) continue
    }
    out.push(list[0])
  }
  // 长串优先，避免短串抢先匹配（例如 "音量" 与 "音量 "）
  out.sort((a, b) => b.val.length - a.val.length)
  return out
}

/** 一段已渲染文本 → 目标语言文本；命中不了就原样返回（并标记 hit=false）。 */
export function translateRendered(str, fromLang, toLang, index) {
  const idx = index || buildValueIndex(fromLang, toLang)
  const s = String(str == null ? '' : str)
  const trimmed = s.trim()
  if (!trimmed) return { text: s, hit: false }
  for (const e of idx) {
    let params = null
    if (e.rx) {
      const m = e.rx.exec(trimmed)
      if (!m) continue
      params = {}
      e.names.forEach((n, i) => { params[n] = m[i + 1] })
    } else if (e.val !== trimmed) continue
    const next = t(toLang, e.key, params)
    if (next === e.key) continue // 目标语言没这条键 → 不要写回 key 字面量
    // 保留原有前后空白
    const lead = s.slice(0, s.indexOf(trimmed))
    const tail = s.slice(lead.length + trimmed.length)
    return { text: lead + next + tail, hit: true, key: e.key }
  }
  return { text: s, hit: false }
}

/** 英文残留 = 文本恰好是 en 词典的值（且不是 zh 词典的值）。 */
export function hasResidualLang(strings, lang) {
  const other = lang === 'en' ? 'zh' : 'en'
  const otherVals = new Set(Object.values(DICT[other] || {}).filter((v) => v && v.indexOf('{') < 0))
  const selfVals = new Set(Object.values(DICT[lang] || {}).filter((v) => v && v.indexOf('{') < 0))
  const bad = []
  for (const raw of strings || []) {
    const s = String(raw == null ? '' : raw).trim()
    if (!s) continue
    if (lang === 'en') { if (CJK.test(s)) bad.push(s); continue }
    if (otherVals.has(s) && !selfVals.has(s)) bad.push(s)
  }
  return bad
}

/**
 * 采集"可翻译文本槽"。真实 DOM 走 TreeWalker + [placeholder] + [title] + <title>；
 * 测试用假 DOM 可在 root 上挂 `__slots`（[{read,write,kind}]）作为注入缝。
 */
export function collectSlots(root, doc) {
  if (root && Array.isArray(root.__slots)) return root.__slots.slice()
  const slots = []
  const d = doc || (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null)
  if (!d) return slots
  const walker = d.createTreeWalker(root, 0x4 /* SHOW_TEXT */, null)
  let n = walker.nextNode()
  while (n) {
    const p = n.parentNode
    const tag = p && p.nodeName ? String(p.nodeName).toLowerCase() : ''
    if (tag !== 'script' && tag !== 'style') slots.push({ kind: 'text', read: () => n.nodeValue, write: (v) => { n.nodeValue = v } })
    n = walker.nextNode()
  }
  for (const el of root.querySelectorAll('[placeholder]')) slots.push({ kind: 'placeholder', read: () => el.placeholder, write: (v) => { el.placeholder = v } })
  for (const el of root.querySelectorAll('[title]')) slots.push({ kind: 'title', read: () => el.getAttribute('title'), write: (v) => { el.setAttribute('title', v) } })
  for (const el of root.querySelectorAll('svg title, svg > title')) slots.push({ kind: 'svgtitle', read: () => el.textContent, write: (v) => { el.textContent = v } })
  return slots
}

/**
 * 把 root 里**所有已渲染文本**从 fromLang 切到 toLang。
 * 覆盖 data-i18n 静态节点之外的一切：动态拼的日志/诊断流、属性面板、状态栏。
 * 返回 { changed, scanned, missed }（missed = 看起来是 fromLang 但没命中的串，供诊断）。
 */
export function sweepRendered(root, fromLang, toLang, doc) {
  const idx = buildValueIndex(fromLang, toLang)
  const slots = collectSlots(root, doc)
  const missed = []
  let changed = 0
  for (const s of slots) {
    let cur
    try { cur = s.read() } catch { continue }
    if (cur == null || !String(cur).trim()) continue
    const r = translateRendered(cur, fromLang, toLang, idx)
    if (r.hit) { if (r.text !== cur) { s.write(r.text); changed++ } }
    else if (CJK.test(String(cur)) && fromLang === 'zh') missed.push(String(cur).trim().slice(0, 40))
  }
  return { changed, scanned: slots.length, missed }
}

/** <title> 与标题栏都要用同一个名字（用户拍板 wallpaper-engine-webgl）。 */
export function applyTitle(doc, lang) {
  const name = t(lang, 'app.title')
  try { doc.title = name } catch { /* 无 document（测试） */ }
  return name
}

/** data-i18n / data-i18n-ph / data-i18n-title 三类的静态刷新（与源码 applyStatic 等价）。 */
export function applyStaticI18n(root, lang) {
  let n = 0
  for (const el of root.querySelectorAll('[data-i18n]')) { el.textContent = t(lang, el.dataset.i18n); n++ }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) { el.placeholder = t(lang, el.dataset.i18nPh); n++ }
  for (const el of root.querySelectorAll('[data-i18n-title]')) { el.setAttribute('title', t(lang, el.dataset.i18nTitle)); n++ }
  return n
}

/** 诊断面板状态：静态托管下 /api/diag-stream 404 ⇒ 置灰 + 写明原因（不是只往日志写一行）。 */
export function diagOfflineState(httpStatus) {
  const offline = !(httpStatus >= 200 && httpStatus < 300)
  return {
    offline,
    reasonKey: offline ? 'offline.diagReason' : null,
    tagKey: offline ? 'offline.tag' : null,
    disableDiag: offline,
  }
}

/** 尾迹：把 0..1 的注入坐标折线按"越旧越淡越细"算出一段绘制参数（纯函数，便于测试）。 */
export function trailSegments(points, opt) {
  const o = Object.assign({ width: 2, color: '#7dd3fc', max: 24 }, opt || {})
  const pts = (points || []).slice(-o.max)
  const out = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const k = i / Math.max(1, pts.length - 1)         // 0=最旧 1=最新
    out.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], alpha: 0.08 + 0.72 * k, width: Math.max(0.5, o.width * (0.35 + 0.65 * k)), color: o.color })
  }
  return out
}



/* ============================ C 组：插件实现移植（纯函数层，Node 可测） ============================ */
// 来源：dsh-mpkg-wallpaper/lib/client.js:6654-6760 的 hexToHsv/hsvToHex（同一套数学，逐相位照搬），
//       :929-941 的剪贴板降级思路。只搬思路与视觉，无对插件的运行时依赖。

/** 归一化 hex：接受 #rgb / #rrggbb / 裸 6 位；非法返回 null */
export function normalizeHex(v) {
  const t = String(v == null ? '' : v).trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(t)) return '#' + t.split('').map((c) => c + c).join('').toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(t)) return '#' + t.toLowerCase()
  return null
}

/** #rrggbb → {h:0..360, s:0..1, v:0..1}（与插件 client.js:6673 逐行一致） */
export function hexToHsv(hex) {
  const nx = normalizeHex(hex) || '#808080'
  const n = parseInt(nx.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dlt = mx - mn
  let hh = 0
  if (dlt !== 0) {
    if (mx === r) hh = ((g - b) / dlt) % 6
    else if (mx === g) hh = (b - r) / dlt + 2
    else hh = (r - g) / dlt + 4
    hh *= 60
    if (hh < 0) hh += 360
  }
  return { h: hh, s: mx === 0 ? 0 : dlt / mx, v: mx }
}

/** {h,s,v} → #rrggbb（与插件 client.js:6679 逐行一致） */
export function hsvToHex(hh, ss, vv) {
  const c = vv * ss, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = vv - c
  let r = 0, g = 0, b = 0
  if (hh < 60) { r = c; g = x } else if (hh < 120) { r = x; g = c } else if (hh < 180) { g = c; b = x }
  else if (hh < 240) { g = x; b = c } else if (hh < 300) { r = x; b = c } else { r = c; b = x }
  const to = (q) => Math.round((q + m) * 255).toString(16).padStart(2, '0')
  return '#' + to(r) + to(g) + to(b)
}

/** 色相条 x∈[0,1] → h、SV 面板 (x,y)∈[0,1]² → (s,v)。纯函数，供指针事件换算与测试。 */
export function pickerFromPointer(hueX, svX, svY) {
  const h = Math.max(0, Math.min(1, hueX)) * 360
  const s = Math.max(0, Math.min(1, svX))
  const v = 1 - Math.max(0, Math.min(1, svY))
  return { h, s, v }
}

/**
 * 剪贴板降级决策（C 组硬要求：http 与 file:// 两种协议都要能用）。
 * 优先级：navigator.clipboard.writeText（需安全上下文）→ document.execCommand('copy')
 *        → 手动兜底（弹出可选中输入框）。
 */
export function clipboardPlan(env) {
  const e = env || {}
  const hasApi = !!e.hasClipboardApi
  const secure = e.isSecureContext !== false        // file:// 下 Chrome 视作 secure，但 clipboard 常缺失
  const canExec = e.hasExecCommand !== false
  if (hasApi && secure) return 'api'
  if (canExec) return 'execCommand'
  return 'manual'
}

/** 错误兜底条要显示的文本（可见性断言用） */
export function errorBannerModel(lang, msg) {
  return { title: t(lang, 'error.title'), message: String(msg == null ? '' : msg).slice(0, 300), note: t(lang, 'error.logged') }
}

/** AbortController 包装：中止后 promise **不 reject**（返回 {aborted:true}），避免未捕获拒绝 */
export function abortable(promise, signal) {
  const st = { aborted: false }
  const p2 = new Promise((resolve) => {
    if (signal && signal.aborted) { st.aborted = true; resolve({ aborted: true }); return }
    const onAbort = () => { st.aborted = true; resolve({ aborted: true }) }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(
      (value) => { if (!st.aborted) resolve({ aborted: false, value }) },
      (error) => { if (!st.aborted) resolve({ aborted: false, error }) },
    )
  })
  return { promise: p2, state: st }
}

/* ============================ 第四批纯函数层（主题 / 类型识别 / 无上限 FPS / 本地扫描 / 后端状态） ============================ */

/** 主题三态循环：auto → dark → light → auto（与源码 bench/bench.ts 的 applyTheme 同一顺序） */
export function nextThemeMode(mode) {
  return mode === 'auto' ? 'dark' : mode === 'dark' ? 'light' : 'auto'
}

/** auto 解析成实际生效的主题（prefers-color-scheme） */
export function resolveTheme(mode, prefersDark) {
  if (mode === 'auto') return prefersDark ? 'dark' : 'light'
  return mode === 'light' ? 'light' : 'dark'
}

/** 从 localStorage 的原始值算出 {mode, theme}：非法值一律回 auto（与 bundle 的读取逻辑等价） */
export function themePlan(saved, prefersDark) {
  const mode = (saved === 'auto' || saved === 'dark' || saved === 'light') ? saved : 'auto'
  return { mode, theme: resolveTheme(mode, prefersDark) }
}

/** 工具条标签大小写：只在**文本内容与目标仅差大小写**时改写，否则不动（绝不吃掉别的文案） */
export function uppercaseLabel(current, want) {
  const c = String(current == null ? '' : current).trim()
  if (!c) return null
  return c.toLowerCase() === String(want).toLowerCase() ? want : null
}

/** 无上限 FPS 的协议值：渲染器的帧率门是 `now - lastRender >= 1000/fps`（renderer/src/scene-mount.ts:2933），
 *  fps=1000 ⇒ 间隔 1ms，比任何真实 rAF 间隔都小 ⇒ 等价"不跳帧"。
 *  之所以不用 0：渲染器读参数是 `Number(params.get("sceneFps")) || 60`（renderer/src/main.ts:432），
 *  0 会被折回 60 ⇒ 0 表达不了"无上限"。 */
export const FPS_UNCAPPED = '1000'
const FPS_UNCAPPED_MIN = 600

/** 一个 <select id="fps"> 的 value → 上限/无上限的判定与状态栏文案键（纯函数，便于测试） */
export function fpsPlan(value) {
  const n = Number(String(value == null ? '' : value).trim())
  const bad = !isFinite(n) || n <= 0
  const uncapped = !bad && n >= FPS_UNCAPPED_MIN
  const cap = bad ? 60 : n
  return {
    cap,
    uncapped,
    statusKey: uncapped ? 'status.uncapped' : 'status.cap',
    statusParams: uncapped ? null : { n: cap },
    titleKey: uncapped ? 'fps.uncappedTitle' : 'status.capTitle',
  }
}

/** 扫描时自动识别壁纸类型（⑶ 用户要求：不再让用户手选 scene/web/video）。
 *  meta = project.json 解析结果；names = 该目录下的文件名。
 *  优先级：显式 type → 文件证据（scene.pkg / *.html / 视频扩展名）。识别不出返回 null（调用方显示 unknown）。 */
export function detectWallpaperKind(meta, names) {
  const declared = String((meta && meta.type) || '').trim().toLowerCase()
  if (declared === 'gif') return 'video'
  if (declared === 'scene' || declared === 'web' || declared === 'video') return declared
  const list = (names || []).map((x) => String(x).toLowerCase())
  const has = (rx) => list.some((x) => rx.test(x))
  if (has(/^scene\.pkg$/)) return 'scene'
  if (has(/\.html?$/)) return 'web'
  if (has(/\.(mp4|webm|mov|mkv|gif)$/)) return 'video'
  return declared || null
}

/**
 * 把一次「选择文件夹」拿到的文件列表折成壁纸条目（纯函数，Node 可测；不读文件内容）。
 * entries: [{ path, file?, text? }]，path = webkitRelativePath（目录选择）或 name（单文件）。
 * 返回 { selection, items }：
 *   selection='empty'  没选任何东西（用户取消）
 *   selection='notdir' 浏览器只回传了散文件（**不是目录选择**）⇒ ⑹ 必须给明确提示，不能说"正在读取文件夹"
 *   selection='dir'    确实是目录选择（items 可能为空 = 该目录下没有壁纸）
 * 与旧实现的关键差别：目录按「文件的父目录」分组 ⇒ 同时支持 <根>/<壁纸>/scene.pkg 与 <根>/scene.pkg（浅层）。
 */
export function planLocalScan(entries, opt) {
  const o = Object.assign({ maxItems: 500 }, opt || {})
  const list = (entries || []).filter((e) => e && e.path)
  if (!list.length) return { selection: 'empty', items: [] }
  const dirs = new Map()
  let withDir = 0
  for (const e of list) {
    const parts = String(e.path).split('/').filter(Boolean)
    if (parts.length < 2) continue                 // 根目录下的散文件：不构成壁纸目录
    withDir++
    const dir = parts.slice(0, -1).join('/')
    if (!dirs.has(dir)) dirs.set(dir, [])
    dirs.get(dir).push({ name: parts[parts.length - 1], file: e.file, text: e.text })
  }
  if (!withDir) return { selection: 'notdir', items: [] }
  const items = []
  for (const [dir, files] of dirs) {
    const pkg = files.find((f) => /^scene\.pkg$/i.test(f.name))
    const proj = files.find((f) => /^project\.json$/i.test(f.name))
    if (!pkg && !proj) continue                    // 不是壁纸目录（例如 materials/、shaders/）
    // 第五批③：把 preview 图也带上（品牌修复要用它当媒体组件的图标；优先 project.json 里声明的名字）
    const prev = files.find((f) => /^preview\.(gif|png|jpe?g|webp)$/i.test(f.name)) || null
    items.push({
      dir, dirName: dir.split('/').pop(), pkg: pkg || null, proj: proj || null,
      names: files.map((f) => f.name),
      files: files.map((f) => ({ name: f.name, file: f.file || null })),
      prev,
    })
    if (items.length >= o.maxItems) break
  }
  items.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
  return { selection: 'dir', items }
}

/** 后端状态判定（⑦ 用户问"是不是离线导致的"）：把**静态托管**与**离线**分成两件事。
 *  env = { apiStatus, onLine, hostBlocked, online }；apiStatus = /api/library 的 HTTP 状态码（0=网络失败）。
 *  online = 本页是否跑在**线上静态托管**（GitHub Pages 这类不可达的本机后端，见 P-93）；
 *  它只在 static 分支里换文案，node 分支（本机 Node 宿主在）行为一字不变。 */
export function backendMode(env) {
  const e = env || {}
  const onLine = e.onLine !== false
  const api = Number(e.apiStatus)
  const node = isFinite(api) && api >= 200 && api < 300
  if (node) return { mode: 'node', online: onLine, labelKey: 'backend.node', reasonKey: null, howKey: null, blocked: false, deployed: false }
  const deployed = !!e.online
  if (deployed) {
    return {
      mode: 'static',
      online: onLine,
      labelKey: onLine ? 'backend.static' : 'offline.tag',
      reasonKey: onLine ? 'backend.staticTitle' : 'backend.offline',
      howKey: 'backend.demoNoBackend',
      blocked: false,        // 在线版不是"本机被阻断"，而是**设计如此**：不要说"依赖不全"
      deployed: true,
    }
  }
  return {
    mode: 'static',
    online: onLine,
    labelKey: onLine ? 'backend.static' : 'offline.tag',
    reasonKey: onLine ? 'backend.staticTitle' : 'backend.offline',
    howKey: 'backend.online',
    blocked: !!e.hostBlocked,
    deployed: false,
  }
}

/** 侧栏「能不能用 / 为什么不能 / 怎么办」的文案模型（可见性可断言，见 T21） */
export function backendNotice(lang, env) {
  const m = backendMode(env)
  if (m.mode === 'node') return { hidden: true, mode: 'node', label: t(lang, 'backend.node'), lines: [] }
  const lines = [t(lang, m.reasonKey), t(lang, 'backend.alt'), t(lang, m.howKey)]
  if (m.blocked) lines.push(t(lang, 'backend.blocked'))
  return { hidden: false, mode: 'static', label: t(lang, m.labelKey), lines, deployed: m.deployed }
}

/** 诊断区的离线原因行：静态托管 / 离线 两件事分开写清楚（⑺ 用户就是问这个） */
export function diagReasonText(lang, env) {
  const m = backendMode(env)
  if (m.mode === 'node') return ''
  const base = m.deployed ? t(lang, 'offline.diagReasonOnline') : t(lang, 'offline.diagReason')
  return m.online ? base : base + ' · ' + t(lang, 'backend.offline')
}

/* ============================ P-93 在线 demo 纯函数层（线上形态判定 / 路径改写 / 合成样例 / 横幅） ============================ */
/** 合成样例在仓库里的位置（相对**站点根**；demo/ 与 Pages 产物里的 /wallpaper-engine-webgl/ 都一样）。 */
export const DEMO_SAMPLE_REL = 'samples/sample-synthetic/'
/** 本页相对站点根的层级：demo/ 与 wallpaper-engine-webgl/ 都是 1 层。 */
export function assetBaseOf(href) {
  const s = String(href == null ? '' : href)
  const m = s.match(/^(https?:\/\/[^/]+)?(\/[^\s?#]*)?/)
  const path = (m && m[2]) || '/'
  const dir = path.endsWith('/') ? path : path.replace(/[^/]*$/, '/')
  return dir
}

/** demo 子路径前缀（相对当前页，带尾斜杠；Pages 与 :8901 都是 './'；根目录时退化成 './'）。 */
export function demoPrefixFor(basePath) {
  const parts = String(basePath || '/').split('/').filter(Boolean)
  if (parts.length && parts[parts.length - 1] === 'demo') parts.pop()
  return parts.length ? './' : './'
}

/** 线上静态托管判定（探针/测试同源）：pages 域名 / 非本机 host 两者取或，`?online=0` 可强制关掉。
 *  本机（127.0.0.1 / localhost / ::1 / 0.0.0.0 / *.local / 局域网 IP）一律**不**算在线版 ——
 *  本机静态台 :8901 与 vite 宿主 :1430 仍走老文案（"去跑 pnpm dev"对它们是有意义的）。 */
export function onlineDemoEnv(href, opt) {
  const o = opt || {}
  let location = null
  if (o.location) location = o.location
  else if (typeof window !== 'undefined' && window.location) location = window.location
  const raw = location && location.href ? String(location.href) : String(href == null ? '' : href)
  let host = ''
  try { host = new URL(raw, 'http://127.0.0.1/').hostname } catch { host = '' }
  const forced = String(o.force == null ? '1' : o.force)
  const forcedOff = /^(0|false|off|no)$/i.test(forced)
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' ||
    /\.localhost$/i.test(host) || /\.local$/i.test(host) || /^10\./.test(host) ||
    /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  const pagesHost = /(^|\.)github\.io$/i.test(host)
  const basePath = assetBaseOf(raw)
  return {
    online: !forcedOff && !isLocalHost && host !== '',   // file:// ⇒ host 为空 ⇒ 不算在线版
    host,
    basePath,
    isLocalHost,
    pagesHost,
    demoPrefix: demoPrefixFor(basePath),
  }
}

/** 产物里的三条硬编码绝对路径 → 相对本站的路径。
 *  为什么需要：产物是 minified、**不可重建**的（离线装不上依赖），而它写死了
 *  `/wallpaper-engine-webgl/renderer/index.html`（iframe src）与 `/wallpaper-engine-webgl/sw.js`。
 *  本地静态台恰好在 `/wallpaper-engine-webgl/` 下 ⇒ 原样可用；线上落在 `/demo/` ⇒ 必须改写。
 *  本函数只做**一次前缀替换**，其余路径一律返回原文（不认识的 URL 不动）。 */
export function demoAssetUrl(url, prefix) {
  const s = String(url == null ? '' : url)
  const p = String(prefix == null ? './' : prefix)
  const m = s.match(/^\/wallpaper-engine-webgl\/(.*)$/)
  if (!m) return s
  return p.replace(/\/+$/, '') + '/' + m[1]
}

/** 默认壁纸计划：`sample` = 合成样例 URL（相对本页），`auto` = 是否自动挂载。
 *  仓库**不分发任何真实壁纸** ⇒ 默认壁纸只能是自造的合成样例（samples/sample-synthetic/scene.pkg，33 299 B）。
 *  关掉：`?sample=0`（或 false/off/no）。 */
export function defaultSamplePlan(opt) {
  const o = opt || {}
  if (o.force !== undefined && /^(0|false|off|no)$/i.test(String(o.force))) return { auto: false, sample: '', reason: 'disabled' }
  const prefix = String(o.prefix == null ? './' : o.prefix)
  const rel = String(o.rel == null ? DEMO_SAMPLE_REL : o.rel)
  return { auto: true, sample: prefix.replace(/\/+$/, '') + '/' + rel + 'scene.pkg', reason: 'synthetic-sample' }
}

/** 在线版横幅（落地页/测试台共用同一份文案；静态标记与运行期注入都用它，保证同源同义）。 */
export function onlineDemoNotice(lang) {
  return { title: t(lang, 'demo.onlineTitle'), body: t(lang, 'demo.onlineBody'), sample: t(lang, 'demo.onlineSample') }
}

/* ============================ A5/A6 统一下拉工厂（导出以便 Node 测试直接驱动） ============================ */
/**
 * 把一个原生 <select> 换成同一个自绘紧凑组件：
 *  - 原生 select 视觉隐藏（select.bench-rd-native），**保留 value/options/onchange 契约**
 *  - 列表限高可滚动（CSS .bench-rd-list{max-height:280px;overflow:auto}）
 *  - 收起：点触发器（toggle）/ 点空白（调用方挂全局 click）/ Esc（调用方挂全局 keydown）
 *  - 选中：写回 sel.value 并派发 change → bundle 侧逻辑一行不改
 * 返回 { sel, wrap, btn, list, label, open, close, isOpen }（isOpen 供测试断言）
 */
export function bindDropdown(doc, sel, registry) {
  if (!sel || !sel.parentNode) return null
  let wrap = sel.parentNode.classList && sel.parentNode.classList.contains('bench-rd') ? sel.parentNode : null
  let btn, list
  if (wrap) {
    btn = wrap.querySelector('.bench-rd-btn'); list = wrap.querySelector('.bench-rd-list')
  } else {
    wrap = doc.createElement('span'); wrap.className = 'bench-rd'
    btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'bench-rd-btn'
    btn.setAttribute('aria-haspopup', 'listbox')
    list = doc.createElement('ul'); list.className = 'bench-rd-list'; list.setAttribute('role', 'listbox')
    sel.parentNode.insertBefore(wrap, sel)
    wrap.appendChild(btn); wrap.appendChild(list); wrap.appendChild(sel)
  }
  if (!btn || !list) return null
  sel.classList.add('bench-rd-native')
  const label = () => {
    const o = sel.options[sel.selectedIndex]
    btn.textContent = o ? o.textContent : sel.value
    btn.disabled = !!sel.disabled
  }
  const close = () => { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false') }
  const open = () => {
    for (const d of registry || []) if (d !== api) d.close()
    list.innerHTML = ''
    for (const o of sel.options) {
      const li = doc.createElement('li')
      li.textContent = o.textContent
      li.dataset.value = o.value
      li.setAttribute('role', 'option')
      if (o.value === sel.value) li.setAttribute('aria-selected', 'true')
      li.addEventListener('click', () => {
        if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })) }
        label(); close()
      })
      list.appendChild(li)
    }
    wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true')
  }
  btn.addEventListener('click', (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (e && e.stopPropagation) e.stopPropagation()
    wrap.classList.contains('open') ? close() : open()      // A6 点触发器可收回
  })
  sel.addEventListener('change', label)
  const api = { sel, wrap, btn, list, label, open, close, isOpen: () => wrap.classList.contains('open') }
  if (registry) registry.push(api)
  label()
  return api
}

/* ============================ 第五批纯函数层（指针归中 / 时间层锁 / 壁纸品牌 / 拖动开关） ============================ */
// 用户实测三条（2026-09-15 第五批）：
//  ①鼠标移出画面后壁纸在最后位置「原地转圈」——上游**没有**离开语义：pointer.js 的
//    onLeaveWindow / pushExternalLeave 都只清按键、**刻意保留位置与 has**（且被文档与测试当契约守着）。
//    我们的补丁层在**舞台外**这一点上补一条「回到中性位置（中心）」的语义，可用 ?ppark=0 回退。
//  ②壁纸自身的时钟/日期组件能被鼠标拖走——上游把「可拖动」交给壁纸自己的用户属性（如 hina
//    3554161528 的 newproperty21「可拖动/Dragable」）；我们按属性标签识别并置 false（?clockdrag=0 回退），
//    另对**注入到页面里的 DOM 时间层**做 pointer-events/选中/拖拽三件套（?clocklock=0 回退）。
//  ③媒体组件显示的是上游库品牌（WebWallGL / oneincase / 库 logo，硬编码在
//    renderer/vendor/we-scene/render/media.js:63-123）——改为壁纸自己的 project.json title + preview（?brand=0 回退）。

/**
 * 补丁层的 URL 开关（与渲染器侧 `?res=`/`?cursor=` 同形，一律 `new URLSearchParams(location.search)`）。
 * 四个开关默认**全开**（= 新行为）；写成 0/false/off/no 表示回退到上游原行为。
 *   ppark     鼠标离开舞台/视口 → 指针回到中性位置（中心）
 *   clocklock 注入到页面里的 DOM 时间层 → pointer-events:none / 不可选中 / 不可拖拽
 *   clockdrag 壁纸自带「可拖动」用户属性 → 关掉（时钟/日期组件拖不走）
 *   brand     媒体组件的名称/图标 → 用壁纸自己的 project.json title / preview
 */
export function readPatchFlags(search) {
  const q = new URLSearchParams(String(search == null ? '' : search))
  const on = (name, def) => {
    const v = q.get(name)
    if (v == null || v === '') return def
    return !/^(0|false|off|no)$/i.test(String(v))
  }
  return { ppark: on('ppark', true), clocklock: on('clocklock', true), clockdrag: on('clockdrag', true), brand: on('brand', true) }
}

/** 鼠标离开后的「归中」决策（纯函数，便于 Node 断言）。
 *  依据：上游 pointer.js:87-88 的初值就是 u=v=0.5（中心），注释写明「视差/粒子/iris 要的是相对中心为零」
 *  ⇒ 归中等于回到「用户还没动鼠标」的状态，而不是改 has/位置冻结（那正是 bug 本身）。 */
export function pointerParkAction(env) {
  const e = env || {}
  if (e.enabled === false) return { park: false, reason: 'flag-off' }
  if (!e.hasApi) return { park: false, reason: 'no-renderer-api' }
  if (e.parked) return { park: false, reason: 'already-parked' }
  return { park: true, reason: 'leave', u: 0.5, v: 0.5, buttons: 0, leave: true }
}

/** 元素自身文本（不含后代），时间层判定只看它，避免容器把整页文本聚合进来 */
export function ownTextOf(el) {
  if (!el || !el.childNodes) return ''
  let s = ''
  for (const n of el.childNodes) if (n && (n.nodeType === 3 || n.nodeName === '#text')) s += String(n.nodeValue == null ? '' : n.nodeValue)
  return s.trim()
}

const TIME_ONLY = [
  /^\d{1,2}:\d{2}(:\d{2})?(\s*(am|pm))?$/i,                       // 10:59 / 22:59:07 / 10:59 pm
  /^\d{4}\s*[年/.-]\s*\d{1,2}\s*[月/.-]\s*\d{1,2}\s*日?$/,        // 2026/09/14 · 2026-09-14 · 2026年9月14日
  /^\d{1,2}\s*[月/.-]\s*\d{1,2}\s*日?$/,                          // 9/14 · 9月14日
  /^(星期|周|週)[一二三四五六日天]$/,                                // 星期一 / 周日
  /^(mon|tue|wed|thu|fri|sat|sun)(day)?$/i,
]
const CLOCK_NAME = /(^|[-_.])(clock|time|date|weekday|calendar|时钟|时间|日期|星期)([-_.]|$)/i

/** 时间/日期**浮层**识别（纯函数）。
 *  只认「浮层（fixed/absolute）+ 时间样文本」或「浮层 + 时钟样类名/id」——
 *  文档流里的表格日期单元格（使用说明页的版本表）**不受影响**（position:static、无时钟类名）。
 *  img/svg 之类没有文本的装饰元素也放过（本函数不看它们）。 */
export function timeLayerPlan(desc) {
  const d = desc || {}
  const tag = String(d.tag || '').toUpperCase()
  if (['CANVAS', 'IFRAME', 'VIDEO', 'AUDIO', 'BODY', 'HTML', 'SCRIPT', 'STYLE', 'LINK'].indexOf(tag) >= 0) return { lock: false, reason: 'structural' }
  const pos = String(d.position || '').toLowerCase()
  const overlay = pos === 'fixed' || pos === 'absolute'
  const named = CLOCK_NAME.test(String(d.id || '')) || CLOCK_NAME.test(String(d.cls || ''))
  if (!overlay && !named) return { lock: false, reason: 'not-overlay' }
  const text = String(d.text == null ? '' : d.text).trim()
  const timeText = !!text && TIME_ONLY.some((rx) => rx.test(text))
  if (named && overlay) return { lock: true, reason: 'overlay+named' }
  if (timeText && overlay) return { lock: true, reason: 'overlay+time-text' }
  return { lock: false, reason: named ? 'named-not-overlay' : 'no-time-text' }
}

/** 壁纸品牌：名称取 project.json 的 title、图标取 preview（数据 URL 或 URL 字符串）。
 *  拿不到就给**中性文案**（generic），绝不回落到上游项目名/图标。 */
export function brandingFromProject(meta, opt) {
  const o = opt || {}
  const m = meta || {}
  const title = String(m.title == null ? '' : m.title).trim()
  const generic = String(o.generic == null ? '壁纸' : o.generic)
  if (!title) return { title: generic, artist: '', hasThumbnail: false, thumbnail: '', source: 'neutral' }
  const thumb = String(o.thumbnail == null ? '' : o.thumbnail)
  return { title, artist: String(o.artist == null ? '' : o.artist), hasThumbnail: !!thumb, thumbnail: thumb, source: 'project' }
}

/** 从渲染器收到的 src / cfg 里嗅出工坊 itemId（`/media/dev/<id>/scene.pkg`、`<id>/scene.pkg` 都能认） */
export function sniffItemId(text) {
  const s = String(text == null ? '' : text)
  const m = s.match(/(?:^|[/\\])(\d{6,12})(?:[/\\]|$)/)
  return m ? m[1] : ''
}

/** 壁纸自带的「可拖动」类布尔属性（要置 false 的键）。
 *  依据：hina 3554161528 的 project.json 里 `newproperty21` = text「可拖动/Dragable」type=bool value=true，
 *  它绑到 scene.json 时钟层 origin.script 的 scriptproperties.isMovable（见 docs/HINA-CLOCK-AND-PROPERTIES.md §1）。 */
export function dragPropsToDisable(properties) {
  const out = []
  for (const [key, v] of Object.entries(properties || {})) {
    if (!v || typeof v !== 'object') continue
    if (String(v.type || '').toLowerCase() !== 'bool') continue
    const label = String(v.text == null ? '' : v.text).replace(/<[^>]*>/g, '')
    if (/可拖动|可移动|拖动|拖拽|drag|movable/i.test(label + ' ' + key)) out.push(key)
  }
  return out
}

/** 媒体接管决策：真实 Now Playing（live）在播 ⇒ 不接管（尊重真实媒体，优先级见
 *  renderer/src/scene-mount.ts:526-534）；没有壁纸品牌 ⇒ 不动。 */
export function mediaBrandPlan(brand, stats) {
  if (!brand || !brand.title) return { take: false, reason: 'no-brand' }
  if (stats && stats.live) return { take: false, reason: 'live-media' }
  return { take: true, reason: 'simulated-media' }
}

/* ============================ 浏览器初始化 ============================ */
// 对外钩子：源码侧 bench/bench.ts 在语言切换 / 分辨率变更 / 指针注入开关变化时调用
// （window.__benchPatch?.xxx）。三个钩子都是幂等的，重复调用无害。
export function init() {
  const doc = (typeof document !== 'undefined') ? document : null
  if (!doc) return { ok: false, reason: 'no document' }
  const $ = (sel) => doc.querySelector(sel)
  const langOf = () => (String(doc.documentElement.lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en')
  let curLang = langOf()

  // ── 各控件的重绘函数（先定义，applyLang 统一调用）──
  const dprSel = $('#dpr'), dprStatus = $('#status-dpr')
  const paintDpr = () => {
    if (dprStatus) dprStatus.textContent = t(curLang, 'status.dpr', { n: dprSel ? dprSel.value : '1' })
  }
  // ⑸ dpr/fps 一律大写（HTML 已改；这里再兜一次：旧 HTML 缓存 / bundle 重渲染都不会让小写回来）
  const paintUppercaseLabels = () => {
    for (const pair of [['#lab-dpr', 'DPR'], ['#lab-fps', 'FPS']]) {
      const el = $(pair[0])
      if (!el || !el.firstChild || el.firstChild.nodeType !== 3) continue
      const next = uppercaseLabel(el.firstChild.nodeValue, pair[1])
      if (next) el.firstChild.nodeValue = next
    }
  }
  // ⑷ 无上限 FPS：状态栏文案 + tooltip（bundle 的 syncStatusChrome 只会写"上限 N"，所以这里必须最后写）
  const fpsSel = $('#fps'), fpsStatus = $('#status-fps')
  const paintFps = () => {
    if (!fpsStatus) return
    const plan = fpsPlan(fpsSel ? fpsSel.value : '60')
    fpsStatus.textContent = plan.uncapped ? t(curLang, plan.statusKey) : t(curLang, plan.statusKey, plan.statusParams)
    fpsStatus.title = t(curLang, plan.titleKey)
  }
  if (fpsSel) fpsSel.addEventListener('change', () => { paintFps(); setTimeout(paintFps, 0) })
  // ⚠ bundle 的 syncStatusChrome（产物里是 `_t.textContent = \`DPR ${ie.value}\``：硬编码、没有词典键）
  //   被 #dpr / #fps 的 change 直接调用 ⇒ 动这两个下拉会把状态栏**两格一起**改回旧文案。
  //   所以两条链都要重画（实测：只重画 fps，`DPR（设备像素比） 1` 会退回 `DPR 1`）。
  const paintStatusChrome = () => { paintDpr(); paintFps(); paintUppercaseLabels() }
  for (const el of [dprSel, fpsSel]) {
    if (el) el.addEventListener('change', () => { paintStatusChrome(); setTimeout(paintStatusChrome, 0) })
  }
  const toggleLogs = $('#toggle-logs')
  const upIco = $('#ico-logs-up'), downIco = $('#ico-logs-down')
  const paintLogsIcon = () => {
    if (!toggleLogs || !upIco || !downIco) return
    const open = toggleLogs.getAttribute('aria-expanded') !== 'false'
    // A7 用户口径：「输出旁边的箭头应该是**向下**的，点了把输出栏收纳起来」
    //   ⇒ 展开态显示 ArrowDown（点它收纳），折叠态显示 ArrowUp（点它展开）
    if (open) { downIco.removeAttribute('hidden'); upIco.setAttribute('hidden', '') }
    else { upIco.removeAttribute('hidden'); downIco.setAttribute('hidden', '') }
    toggleLogs.setAttribute('title', t(curLang, open ? 'logs.collapse' : 'logs.expand'))
  }
  const diagBox = $('#logs'), offlineTag = $('#offline-tag'), diagReason = $('#diag-offline')
  let diagState = diagOfflineState(200)
  const paintDiag = () => {
    if (offlineTag) {
      if (diagState.offline) { offlineTag.removeAttribute('hidden'); offlineTag.textContent = t(curLang, 'offline.tag'); offlineTag.title = t(curLang, 'offline.diagTitle') }
      else offlineTag.setAttribute('hidden', '')
    }
    if (diagReason) {
      if (diagState.offline) { diagReason.removeAttribute('hidden'); diagReason.textContent = diagReasonText(curLang, backendEnv()) }
      else { diagReason.setAttribute('hidden', ''); diagReason.textContent = '' }
    }
    if (diagBox) diagBox.classList.toggle('bench-diag-off', !!diagState.offline)
  }

  // ── ① 主题：bundle 正常时**绝不重复接管**（否则一次点击走两格）；只在 bundle 没跑起来时兜底 ──
  //   线上事故：产物缺 assets/modulepreload-polyfill-*.js ⇒ bundle 整体不执行 ⇒ 主题按钮永远没反应。
  //   补齐文件是根治；这里再加一层"bundle 死了也能切主题"的兜底（判据 = <html> 上还没有 data-theme）。
  const THEME_KEY = 'webwallgl-theme'
  const themeBtn = $('#theme-toggle')
  function ensureThemeFallback() {
    if (!themeBtn) return false
    try { if (doc.documentElement.dataset && doc.documentElement.dataset.theme) return false } catch { return false }
    let mq = null
    try { mq = (typeof matchMedia === 'function') ? matchMedia('(prefers-color-scheme: dark)') : null } catch { mq = null }
    let saved = null
    try { saved = (typeof localStorage !== 'undefined') ? localStorage.getItem(THEME_KEY) : null } catch { saved = null }
    const apply = (mode) => {
      const plan = themePlan(mode, !!(mq && mq.matches))
      try { doc.documentElement.dataset.theme = plan.theme } catch { /* 无 dataset（测试） */ }
      try { themeBtn.dataset.mode = plan.mode } catch { /* 同上 */ }
      themeBtn.setAttribute('title', t(curLang, 'theme.' + plan.mode))
      for (const ic of themeBtn.querySelectorAll('.ic')) {
        if (ic.classList.contains('ic-' + plan.mode)) ic.removeAttribute('hidden')
        else ic.setAttribute('hidden', '')
      }
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, plan.mode) } catch { /* 隐私模式 */ }
    }
    apply(themePlan(saved, !!(mq && mq.matches)).mode)
    themeBtn.addEventListener('click', () => apply(nextThemeMode((themeBtn.dataset && themeBtn.dataset.mode) || 'auto')))
    return true
  }

  // ── ⑦ 后端状态：把「静态托管」与「离线」分开讲清楚（用户问：是不是我离线导致的？）──
  //   本 checkout 的 Node host 起不来（离线 + 依赖不全，见 PATCH-NOTES 第四批 §7），故 hostBlocked=true。
  const HOST_BLOCKED_HERE = true
  let apiStatus = 0
  // P-93：在线形态判定（GitHub Pages 这类**设计上就没有本机后端**的部署）。
  //   在线 ⇒ 不再说"去跑 pnpm dev"（对访客无意义），改说"在线版就是没有后端"，
  //   并且**不**打"本机依赖不全"那行（那是作者本机的状态，不是线上访客的）。
  //   开关：`?online=0` 强制按本机口径渲染（探针/对照用）。
  const onlineFlag = (() => {
    try {
      const m = String((typeof location !== 'undefined' && location.search) || '').match(/[?&]online=([^&]*)/)
      return m ? decodeURIComponent(m[1]) : '1'
    } catch { return '1' }
  })()
  const demoEnv = onlineDemoEnv(null, { force: onlineFlag })
  const backendEnv = () => ({
    apiStatus,
    onLine: (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') ? navigator.onLine : true,
    hostBlocked: HOST_BLOCKED_HERE,
    online: demoEnv.online,
  })
  const backendNoteEl = $('#bench-backend-note')
  // 后端专有控件（静态托管下点不动/点了没内容）：统一挂"为什么不可用"的 title
  const BACKEND_ONLY_CONTROLS = ['#filter', '#toggle-props', '#props-reset', '#props-close', '#props-filter', '#props-all']
  const paintBackendNote = () => {
    const note = backendNotice(curLang, backendEnv())
    if (!backendNoteEl) return note
    if (note.hidden) { backendNoteEl.hidden = true; backendNoteEl.textContent = ''; return note }
    backendNoteEl.hidden = false
    backendNoteEl.textContent = ''
    const head = doc.createElement('div'); head.className = 'bench-backend-head'; head.textContent = note.label
    backendNoteEl.appendChild(head)
    for (const line of note.lines) {
      const p2 = doc.createElement('div'); p2.className = 'bench-backend-line'; p2.textContent = line
      backendNoteEl.appendChild(p2)
    }
    backendNoteEl.title = note.lines[0] || ''
    const reason = t(curLang, 'backend.needBackend')
    for (const sel of BACKEND_ONLY_CONTROLS) { const el = $(sel); if (el) el.setAttribute('title', reason) }
    return note
  }

  // ── A5/A6 所有原生 <select> → 同一个自绘紧凑组件（工厂见模块级 bindDropdown）──
  const dropdowns = []
  const closeAll = (except) => { for (const d of dropdowns) if (d !== except) d.close() }
  for (const sel of doc.querySelectorAll('select')) bindDropdown(doc, sel, dropdowns)
  doc.addEventListener('click', (e) => { for (const d of dropdowns) if (!d.wrap.contains(e.target)) d.close() })
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(null) })
  // ── A8 预览全屏 + 全屏内可见的"退出全屏"（用户键盘上没有 F12，不能依赖快捷键）──
  const stageSlot = $('#stage-slot'), fsEnter = $('#fs-enter'), fsExit = $('#fs-exit')
  const fsSupported = !!(stageSlot && stageSlot.requestFullscreen)
  if (fsEnter) {
    if (!fsSupported) { fsEnter.disabled = true; fsEnter.title = t(curLang, 'fs.unsupported') }
    fsEnter.addEventListener('click', () => {
      if (!fsSupported) return
      Promise.resolve(stageSlot.requestFullscreen()).catch((err) => console.warn('[bench-patch] 全屏失败:', err && err.message))
    })
  }
  if (fsExit) fsExit.addEventListener('click', () => { if (doc.fullscreenElement) doc.exitFullscreen() })
  const paintFs = () => {
    const on = !!doc.fullscreenElement
    if (fsEnter) fsEnter.textContent = t(curLang, 'fs.enter')
    if (fsExit) fsExit.textContent = t(curLang, 'fs.exit')
    if (fsEnter) fsEnter.title = t(curLang, 'fs.enterTitle')
    if (fsExit) fsExit.title = t(curLang, 'fs.exitTitle')
    // #stage-slot 变尺寸后 bundle 的 ResizeObserver(stageFrameEl) 会自己重排；这里再兜一次
    if (on) requestAnimationFrame(() => dispatchEvent(new Event('resize')))
  }
  doc.addEventListener('fullscreenchange', paintFs)

  // ── A1 本页 README：bundle 的 renderDocs 每次重渲染 #docs-body，所以每次语言同步后补挂一份 ──
  const README = {
    zh: [
      ['h', '本页 README · 使用说明速查'],
      ['p', '这个页面是 wallpaper-engine-webgl（浏览器端 Wallpaper Engine 渲染核心）的测试台。静态托管（python3 -m http.server）下没有本机 Node 后端，所以「壁纸库列表 / 属性保存 / 渲染器诊断流」不可用；下面这些能力**纯前端**可用。'],
      ['h2', '1. 怎么把壁纸放进来'],
      ['ul', [
        '「选择文件夹」：**唯一**的本地载入方式（第四批已删掉「打开本地 .pkg」）。选一个装了壁纸的文件夹，测试台纯前端扫描：每个含 scene.pkg 或 project.json 的目录算一个壁纸，类型（scene/web/video）由扫描自动识别并显示在名字下面。',
        '扫描不区分层级：<根>/<壁纸>/scene.pkg 与直接把某个壁纸目录当作根来选（<壁纸>/scene.pkg）都能识别。',
        '「清空」：清掉已扫描的本地库、列表条目与当前选择（舞台回到"从左侧选择一个壁纸"）。',
        '带本机后端时（在 webwallgl 源码目录跑 pnpm dev）：左侧会直接列出壁纸库，支持搜索、右键删除、属性保存。',
      ]],
      ['h2', '2. 地址栏参数（渲染器侧）'],
      ['ul', [
        '?res=1920x1080 —— 强制舞台逻辑分辨率（等价于工具条「分辨率」下拉；自适应时按 16:9 撑满）。',
        '?psim=1 —— 模拟/固定随机，粒子等随机系统可复现（调参对照用）。',
        '?cursor=0 / 1 —— 关/开鼠标指针驱动的效果（部分壁纸的视差、跟着鼠标的粒子依赖它）。',
        '?projy=1 —— 强制投影/透视相机路径（透视类粒子层用）。',
        '?bones=1 —— 打开骨骼（木偶 mesh 层）蒙皮路径；关掉可看未蒙皮 quad 的对照画面。',
        '多个参数用 & 连接，例如：?res=2560x1440&cursor=1&bones=1',
      ]],
      ['h2', '3. 逐层调试键位 / 开关'],
      ['ul', [
        '工具条「滤镜」：以 CSS filter 作用于渲染输出，用来区分"画面本身错"还是"输出后处理错"。',
        '「指针注入」：模拟桌面壁纸窗口（遮罩挡住原生鼠标事件，坐标改由 __wp.pushPointer 推送）；下面hint的「鼠标尾迹」必须先在它开启后才可用。',
        '「鼠标尾迹」：勾选后在舞台内画出跟随指针的渐隐尾迹，只看注入通道收到的坐标。',
        '分辨率下拉是**自绘**的：点触发器展开、再点触发器 / 点空白 / Esc 都能收回；列表限高可滚动。',
      ]],
      ['h2', '4. 已知限制'],
      ['ul', [
        '静态托管无 /api/* 与 /diag：壁纸库列表、属性保存、删除、打开所在文件夹、渲染器诊断流不可用（诊断区会置灰并写明原因，左侧栏给出「为什么不可用 + 怎么办」）。注意：**这不是因为本机离线** —— 静态托管与离线是两件事，离线只影响外网，本页缺的是本机 Node 后端。',
        'web / video 两类壁纸在静态托管下无法预览（需要本机 Node 后端做目录与转码）；scene 包可直接预览。',
        '本页无法替代真实桌面壁纸环境：多显示器、系统音频环回、桌面右键菜单等宿主能力不在测试台范围内。',
      ]],
    ],
    en: [
      ['h', 'This page README · quick reference'],
      ['p', 'This is the bench for wallpaper-engine-webgl (a browser-side Wallpaper Engine rendering core). Under static hosting (python3 -m http.server) there is no local Node backend, so the library listing, property saving and the renderer diagnostics stream are unavailable. Everything below works fully client-side.'],
      ['h2', '1. Getting a wallpaper in'],
      ['ul', [
        '“Choose folder” is the **only** way to load local content (“Open local .pkg” was removed in batch 4). Pick a folder holding wallpapers: the bench scans it fully client-side — every directory containing scene.pkg or project.json becomes one wallpaper, and its type (scene/web/video) is auto-detected while scanning and shown under the name.',
        'No depth requirement: both <root>/<wallpaper>/scene.pkg and picking a single wallpaper directory as the root (<wallpaper>/scene.pkg) are recognised.',
        '“Clear”: drops the scanned library, the list entries and the current selection (the stage goes back to “Pick a wallpaper on the left”).',
        'With the local backend (run pnpm dev inside the webwallgl source tree) the library is listed directly, with search, right-click delete and property saving.',
      ]],
      ['h2', '2. URL parameters (renderer side)'],
      ['ul', [
        '?res=1920x1080 — force the stage logical resolution (same as the toolbar dropdown; adaptive fits 16:9).',
        '?psim=1 — fixed/simulated randomness so particle systems reproduce (useful for A/B tuning).',
        '?cursor=0 / 1 — disable/enable pointer-driven effects (parallax and cursor-following particles rely on it).',
        '?projy=1 — force the projection/perspective camera path (used by perspective particle layers).',
        '?bones=1 — enable the skinned puppet mesh path; turn it off to compare against unskinned quads.',
        'Join parameters with &, e.g. ?res=2560x1440&cursor=1&bones=1',
      ]],
      ['h2', '3. Debug switches'],
      ['ul', [
        'Toolbar “Filter”: applies a CSS filter to the rendered output — use it to tell a broken picture from broken post-processing.',
        '“Pointer inject”: simulates a desktop wallpaper window (a veil blocks native mouse events; coordinates are pushed via __wp.pushPointer). “Mouse trail” only becomes available after enabling it.',
        '“Mouse trail”: draws a fading trail following the pointer inside the stage, fed only by the injection channel.',
        'The resolution dropdown is custom-drawn: click the trigger to open, then click the trigger again / click empty space / press Esc to close; the list is height-limited and scrollable.',
      ]],
      ['h2', '4. Known limitations'],
      ['ul', [
        'Static hosting has no /api/* or /diag: library listing, property saving, deleting, reveal-in-folder and the diagnostics stream are unavailable (the diagnostics area is greyed out with the reason, and the sidebar explains why and what to do). Note this is **not** caused by being offline — static hosting and offline are two different things; nothing here needs the network, what is missing is the local Node backend.',
        'web / video wallpapers cannot be previewed under static hosting (they need the local Node backend for directory access and transcoding); scene packages preview directly.',
        'This page cannot replace a real desktop wallpaper environment: multi-monitor, system audio loopback and desktop context menus are out of scope.',
      ]],
    ],
  }
  function injectReadme() {
    const body = $('#docs-body')
    if (!body) return
    const old = body.querySelector('#bench-readme')
    if (old) old.remove()
    const sec = doc.createElement('section')
    sec.id = 'bench-readme'
    sec.className = 'doc-section bench-readme'
    for (const [k, v] of README[curLang] || README.zh) {
      if (k === 'h') { const h = doc.createElement('h1'); h.textContent = v; sec.appendChild(h) }
      else if (k === 'h2') { const h = doc.createElement('h2'); h.textContent = v; sec.appendChild(h) }
      else if (k === 'p') { const p2 = doc.createElement('p'); p2.textContent = v; sec.appendChild(p2) }
      else if (k === 'ul') { const ul = doc.createElement('ul'); for (const it of v) { const li = doc.createElement('li'); li.textContent = it; ul.appendChild(li) } sec.appendChild(ul) }
    }
    body.insertBefore(sec, body.firstChild)   // 放在文档最前面，第一眼就能看到
  }
  // 文档视图打开时补挂（bundle 的 setView("docs") 会重渲染 #docs-body，所以监听点击 + 语言同步各挂一次）
  const actDocsBtn = $('#act-docs')
  if (actDocsBtn) actDocsBtn.addEventListener('click', () => setTimeout(injectReadme, 0))
  injectReadme()

  // ── A2/A3 + ⑶⑹ 本地文件夹库：静态托管下「选择文件夹」是**唯一**的本地载入方式 ──
  //   ⑶ 分类切换器已删除：不再按 scene/web/video 过滤，改为扫描时**自动识别类型**并显示在每个条目的名字下面。
  //   ⑹ 只认真正的目录选择（webkitRelativePath 含 '/'）：单文件选择给明确提示，绝不假装"正在读取文件夹"。
  //   渲染到**独立容器** #bench-local（挂在 #list 之后），不碰 bundle 的 #list。
  const pickLibBtn = $('#pick-lib')
  let localItems = []
  let localInput = null
  const localBox = doc.createElement('div')
  localBox.id = 'bench-local'
  localBox.className = 'bench-local'
  localBox.hidden = true
  const listHost = $('#list')
  if (listHost && listHost.parentNode) listHost.parentNode.insertBefore(localBox, listHost.nextSibling)
  function renderLocal() {
    if (!localBox) return
    if (!localItems.length) { localBox.hidden = true; return }
    localBox.hidden = false
    localBox.innerHTML = ''
    const h = doc.createElement('div'); h.className = 'bench-local-head'
    h.textContent = t(curLang, 'local.count', { n: localItems.length })
    const hint = doc.createElement('div'); hint.className = 'bench-local-hint'
    hint.textContent = t(curLang, 'local.sceneOnly')
    localBox.appendChild(h); localBox.appendChild(hint)
    const ul = doc.createElement('ul'); ul.className = 'bench-local-list'
    for (const it of localItems) {
      const kind = it.kind || 'unknown'
      const li = doc.createElement('li')
      li.dataset.kind = kind
      const name = doc.createElement('span'); name.className = 'bench-local-name'
      name.textContent = it.title || it.dir
      // ⑶ 类型小标签（在名字下面一行）：扫描时自动识别，不再需要用户手选分类
      const meta = doc.createElement('span'); meta.className = 'bench-local-meta'
      const tag = doc.createElement('span'); tag.className = 'bench-kind'; tag.textContent = kind
      tag.title = t(curLang, 'local.kindTitle', { k: kind })
      const dirEl = doc.createElement('span'); dirEl.className = 'bench-local-dir'; dirEl.textContent = it.dir
      meta.appendChild(tag); meta.appendChild(dirEl)
      li.appendChild(name); li.appendChild(meta)
      li.title = it.dir
      if (it.pkg) li.addEventListener('click', () => previewLocal(it))
      else { li.classList.add('disabled'); li.title = it.dir + ' — ' + t(curLang, 'local.sceneOnly') }
      ul.appendChild(li)
    }
    localBox.appendChild(ul)
  }
  async function previewLocal(it) {
    if (!it.pkg) return
    const fr = $('#frame')
    if (!fr) return
    try {
      const api = await ensureRendererFrame(fr)
      api.loadSceneFile(it.pkg)
      onWallpaperOpened(it.id || it.dir)          // 第五批③④：本地路径直接知道是哪张壁纸（品牌 + 拖动开关）
      const cur = $('#current')
      if (cur) { cur.textContent = it.title || it.pkg.name; cur.title = cur.textContent }
      const em = $('#empty'); if (em) em.style.display = 'none'
      fr.classList.add('on')
      logLine(t(curLang, 'local.preview', { name: it.title || it.pkg.name }))
    } catch (e) { logLine('❌ ' + (e && e.message), true) }
  }
  // ⑹ 「清空」按钮：清掉本地库 + 列表 + 选择/舞台状态（用户报"点清空也清空不了"）
  function clearLocalLibrary(silent) {
    localItems = []
    if (localInput) { try { localInput.value = '' } catch { /* 隐私模式 */ } }
    if (localBox) { localBox.hidden = true; localBox.innerHTML = '' }
    const cur = $('#current')
    if (cur) { cur.textContent = t(curLang, 'tab.wallpaper'); cur.title = '' }
    const fr = $('#frame')
    if (fr) { fr.removeAttribute('src'); fr.classList.remove('on') }
    const em = $('#empty'); if (em) em.style.display = ''
    for (const li of doc.querySelectorAll('#list li')) li.classList.remove('active')
    renderLocal()
    if (!silent) logLine(t(curLang, 'local.cleared'))
  }
  // 复用 bundle 自己的渲染器页契约（同一个 URL、同一个 __wp 接口），只是由我们发起
  function ensureRendererFrame(fr) {
    return new Promise((resolve, reject) => {
      const w = fr.contentWindow
      if (w && w.__wp) return resolve(w.__wp)
      const onLoad = () => {
        const w2 = fr.contentWindow
        if (w2 && w2.__wp) resolve(w2.__wp)
        else reject(new Error('renderer page loaded but __wp missing'))
      }
      fr.addEventListener('load', onLoad, { once: true })
      fr.src = '/wallpaper-engine-webgl/renderer/index.html?_t=' + Date.now()
    })
  }
  function logLine(msg, isErr) {
    const body = $('#logbody')
    if (!body) { console.log('[bench-patch] ' + msg); return }
    const line = doc.createElement('div')
    if (isErr) line.className = 'err'
    line.textContent = msg
    body.appendChild(line); body.scrollTop = body.scrollHeight
  }
  // ⑹ 目录选择能力：webkitdirectory 是唯一跨 Chrome/Edge/Firefox/Safari 的目录 API（且可被自动化验证）；
  //    只有在它缺席时才退回新的 showDirectoryPicker（Chromium 系）。两者都没有 ⇒ 明确置灰 + 说明原因。
  const canPickViaInput = () => {
    try { return 'webkitdirectory' in doc.createElement('input') } catch { return false }
  }
  const canShowDirPicker = () => {
    try { return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' } catch { return false }
  }
  function pickLocalFolder() {
    if (canPickViaInput()) {
      if (!localInput) {
        localInput = doc.createElement('input')
        localInput.type = 'file'; localInput.multiple = true
        localInput.setAttribute('webkitdirectory', ''); localInput.setAttribute('directory', '')
        localInput.style.display = 'none'
        localInput.addEventListener('change', () => {
          const fs2 = Array.from(localInput.files || [])
          localInput.value = ''                                    // 允许重复选择同一目录
          if (!fs2.length) return                                  // 用户取消：不打印、不清空
          loadLocalEntries(fs2.map((f) => ({ path: f.webkitRelativePath || f.name, file: f })))
        })
        doc.body.appendChild(localInput)
      }
      localInput.click()
      return
    }
    if (canShowDirPicker()) { pickLocalFolderViaHandle(); return }
    logLine(t(curLang, 'local.unsupported'), true)
  }
  /** showDirectoryPicker 兜底（Chromium）：递归取回 {path,file}，与 webkitdirectory 走同一条扫描链 */
  async function pickLocalFolderViaHandle() {
    try {
      const root = await window.showDirectoryPicker()
      const out = []
      const walk = async (dir, prefix, depth) => {
        if (depth > 6 || out.length > 4000) return
        for await (const handle of dir.values()) {
          const path = prefix ? prefix + '/' + handle.name : handle.name
          if (handle.kind === 'directory') await walk(handle, path, depth + 1)
          else if (handle.kind === 'file' && /^(scene\.pkg|project\.json)$/i.test(handle.name)) out.push({ path: root.name + '/' + path, file: await handle.getFile() })
        }
      }
      await walk(root, '', 0)
      loadLocalEntries(out)
    } catch (e) {
      if (e && (e.name === 'AbortError')) return                     // 用户取消
      logLine(t(curLang, 'local.unsupported') + ' — ' + String(e && e.message), true)
    }
  }
  /**
   * ⑹ 扫描入口（也是探针/测试的驱动接口）：entries = [{path, file}]
   * 关键修复：只有**确实是目录选择**（path 里带 '/'）才说「正在读取文件夹」；
   * 只回传散文件（浏览器把目录选择当单文件 / 用户选了单个文件）⇒ 给明确提示，且**不动**已有本地库。
   */
  async function loadLocalEntries(entries) {
    const plan = planLocalScan(entries)
    if (plan.selection === 'empty') return
    if (plan.selection === 'notdir') { logLine(t(curLang, 'local.notDir'), true); return }
    logLine(t(curLang, 'local.reading'))
    const items = []
    for (const it of plan.items) {
      let meta = {}
      if (it.proj && it.proj.file && typeof it.proj.file.text === 'function') {
        try { meta = JSON.parse(await it.proj.file.text()) || {} } catch { /* 坏 project.json 忽略 */ }
      }
      // 第五批③：图标优先取 project.json 里 preview 字段指向的那张图（同名文件才认）
      const want = String(meta.preview == null ? '' : meta.preview).trim().toLowerCase()
      const hit = want ? (it.files || []).find((f) => String(f.name).toLowerCase() === want) : null
      const previewFile = (hit && hit.file) ? hit.file : (it.prev ? it.prev.file : null)
      items.push({
        dir: it.dir,
        id: it.dirName,                                             // 工坊 itemId 形态（目录名），品牌/拖动开关按它查
        title: String(meta.title || it.dirName),
        kind: detectWallpaperKind(meta, it.names) || 'unknown',     // ⑶ 扫描时自动识别类型
        pkg: it.pkg ? it.pkg.file : null,
        proj: it.proj ? it.proj.file : null,
        preview: previewFile,                                       // 第五批③：媒体组件图标（preview.gif）
        properties: (meta.general && meta.general.properties) || null,   // 第五批④：找「可拖动」类布尔属性
      })
    }
    localItems = items
    if (!items.length) { logLine(t(curLang, 'local.none'), true); renderLocal(); return }
    logLine(t(curLang, 'local.count', { n: items.length }))
    renderLocal()
  }
  if (pickLibBtn) {
    // 静态托管下 bundle 会 disable 它（bench.ts enterStaticMode）；我们的本地库让它重新可用
    const reenable = () => {
      if (pickLibBtn.disabled && localItems.length === 0) {
        pickLibBtn.disabled = false
        pickLibBtn.title = t(curLang, 'local.pickTitle')
      }
    }
    reenable(); setTimeout(reenable, 800); setTimeout(reenable, 2500)
    pickLibBtn.addEventListener('click', (e) => {
      if (!pickLibBtn.disabled) { e.preventDefault(); e.stopImmediatePropagation(); pickLocalFolder() }
    }, true)   // 捕获阶段：抢在 bundle 的 /api/library-dir 之前走纯前端路径
  }
  const clearLocalBtn = $('#clear-local')
  if (clearLocalBtn) clearLocalBtn.addEventListener('click', () => clearLocalLibrary(false))

  // ── C 组 1/4：自绘 HSV 取色盘（移植 client.js:6654-6760 的结构与数学）──
  //   挂载点：① 工具条 `#trail-color`（静态托管下**当场可见可验**）② 属性面板的颜色项
  //   （bundle bench.ts:1519 `input[type=color]`，需本机后端才有内容 —— MutationObserver 自动接管）。
  let pickerEl = null, pickerCleanup = null
  const closePicker = () => {
    if (typeof pickerCleanup === 'function') { try { pickerCleanup() } catch {} }
    if (pickerEl) { try { pickerEl.remove() } catch {} }
    pickerEl = null; pickerCleanup = null
  }
  function openColorPicker(anchor, currentHex, onPick) {
    closePicker()                                    // 先清理旧实例的全局监听（插件同款纪律）
    const start = normalizeHex(currentHex) || '#7dd3fc'
    let { h, s: sat, v } = hexToHsv(start)
    const wrap = doc.createElement('div')
    wrap.className = 'bench-picker glass'
    wrap.setAttribute('role', 'dialog')
    const title = doc.createElement('div'); title.className = 'bench-picker-title'; title.textContent = t(curLang, 'picker.title')
    const hue = doc.createElement('div'); hue.className = 'bench-picker-hue'
    const hueDot = doc.createElement('div'); hueDot.className = 'bench-picker-dot'; hue.appendChild(hueDot)
    const sv = doc.createElement('div'); sv.className = 'bench-picker-sv'
    const svDot = doc.createElement('div'); svDot.className = 'bench-picker-dot'; sv.appendChild(svDot)
    const row = doc.createElement('div'); row.className = 'bench-picker-row'
    const prev = doc.createElement('div'); prev.className = 'bench-picker-preview'
    const hexIn = doc.createElement('input'); hexIn.className = 'bench-picker-hex'; hexIn.value = start
    const hint = doc.createElement('div'); hint.className = 'bench-picker-hint'; hint.textContent = t(curLang, 'picker.hint')
    const actions = doc.createElement('div'); actions.className = 'bench-picker-actions'
    const okBtn = doc.createElement('button'); okBtn.type = 'button'; okBtn.className = 'primary'; okBtn.textContent = t(curLang, 'picker.ok')
    const cancelBtn = doc.createElement('button'); cancelBtn.type = 'button'; cancelBtn.textContent = t(curLang, 'picker.cancel')
    row.appendChild(prev); row.appendChild(hexIn)
    actions.appendChild(okBtn); actions.appendChild(cancelBtn)
    wrap.appendChild(title); wrap.appendChild(hue); wrap.appendChild(sv); wrap.appendChild(row); wrap.appendChild(hint); wrap.appendChild(actions)
    doc.body.appendChild(wrap)
    // 定位到锚点下方（越界则上移）
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 20, top: 60, bottom: 84 }
    wrap.style.left = Math.max(8, Math.min(r.left, innerWidth - 224)) + 'px'
    wrap.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - 260)) + 'px'
    const curHex = () => hsvToHex(h, sat, v)
    const paint = () => {
      wrap.style.setProperty('--bench-hue', hsvToHex(h, 1, 1))
      const hx = curHex()
      prev.style.background = hx
      if (doc.activeElement !== hexIn) hexIn.value = hx
      hueDot.style.left = (h / 360 * 100) + '%'; hueDot.style.top = '50%'
      svDot.style.left = (sat * 100) + '%'; svDot.style.top = ((1 - v) * 100) + '%'
    }
    const drag = (el, fn) => {
      const at = (ev) => { const b = el.getBoundingClientRect(); fn((ev.clientX - b.left) / Math.max(1, b.width), (ev.clientY - b.top) / Math.max(1, b.height)) }
      const down = (ev) => { ev.preventDefault(); at(ev); const mv = (e2) => at(e2), up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up) }; addEventListener('mousemove', mv); addEventListener('mouseup', up) }
      el.addEventListener('mousedown', down)
      return down
    }
    drag(hue, (x) => { h = pickerFromPointer(x, sat, 1 - v).h; paint() })
    drag(sv, (x, y) => { const q = pickerFromPointer(0, x, y); sat = q.s; v = q.v; paint() })
    hexIn.addEventListener('input', () => { const nx = normalizeHex(hexIn.value); if (nx) { const q = hexToHsv(nx); h = q.h; sat = q.s; v = q.v; paint() } })
    const commit = () => { const hx = curHex(); closePicker(); try { onPick(hx) } catch (e) { logLine(String(e && e.message), true) } }
    okBtn.addEventListener('click', commit)
    cancelBtn.addEventListener('click', closePicker)
    hexIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') closePicker() })
    const onDocDown = (e) => { if (!wrap.contains(e.target) && e.target !== anchor) closePicker() }   // 点空白收回（A6 同款交互）
    const onKey = (e) => { if (e.key === 'Escape') closePicker() }
    doc.addEventListener('mousedown', onDocDown, true)
    doc.addEventListener('keydown', onKey)
    pickerCleanup = () => { doc.removeEventListener('mousedown', onDocDown, true); doc.removeEventListener('keydown', onKey) }
    pickerEl = wrap
    paint()
    return wrap
  }
  // 让一个 input[type=color] 改用自绘取色盘（原生仍保留语义，只被我们的浮窗替代交互）
  function attachPicker(input) {
    if (!input || input.dataset.benchPicker === '1') return
    input.dataset.benchPicker = '1'
    if (input.parentNode) input.parentNode.classList.add('bench-color-host')
    const fire = (hx) => {
      input.value = hx
      input.dispatchEvent(new Event('input', { bubbles: true }))    // bundle 的 oninput → changeProp / 尾迹颜色
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    input.addEventListener('click', (e) => {
      e.preventDefault()
      openColorPicker(input, input.value, fire)
    })
  }
  attachPicker($('#trail-color'))
  const propsBody = $('#props-body')
  if (propsBody) {
    const scan = () => { for (const el of propsBody.querySelectorAll('input[type="color"]')) attachPicker(el) }
    scan()
    new MutationObserver(scan).observe(propsBody, { childList: true, subtree: true })   // 属性面板颜色项（需后端）
  }

  // ── C 组 2/4：剪贴板（http 与 file:// 都能用：API → execCommand → 手动兜底）──
  function copyText(text, label) {
    const plan = clipboardPlan({
      hasClipboardApi: !!(navigator.clipboard && navigator.clipboard.writeText),
      isSecureContext: typeof isSecureContext === 'boolean' ? isSecureContext : true,
      hasExecCommand: typeof doc.execCommand === 'function',
    })
    const manual = () => {
      const box = doc.createElement('div'); box.className = 'bench-copy-fallback glass'
      const inp = doc.createElement('input'); inp.value = String(text)
      const note = doc.createElement('div'); note.textContent = t(curLang, 'copy.manual')
      box.appendChild(inp); box.appendChild(note); doc.body.appendChild(box)
      inp.focus(); inp.select()
      setTimeout(() => box.remove(), 12000)
      logLine(t(curLang, 'copy.manual'))
    }
    try {
      if (plan === 'api') { navigator.clipboard.writeText(String(text)).then(() => logLine(t(curLang, 'copy.ok')), manual); return plan }
      if (plan === 'execCommand') {
        const ta = doc.createElement('textarea'); ta.value = String(text)
        ta.style.cssText = 'position:fixed;left:-9999px;top:0'
        doc.body.appendChild(ta); ta.select()
        const ok = doc.execCommand('copy'); ta.remove()
        if (ok) { logLine(t(curLang, 'copy.ok')); return plan }
      }
      manual(); return 'manual'
    } catch (e) { logLine(t(curLang, 'copy.fail', { msg: String(e && e.message) }), true); manual(); return 'manual' }
  }
  const copyLogsBtn = $('#copy-logs')
  if (copyLogsBtn) copyLogsBtn.addEventListener('click', () => copyText(($('#logbody') && $('#logbody').textContent) || '', 'logs'))
  const copyUrlBtn = $('#copy-url')
  if (copyUrlBtn) copyUrlBtn.addEventListener('click', () => copyText(location.href, 'url'))

  // ── C 组 3/4：AbortController —— 切语言/关页时取消在途请求 + 过期响应不覆盖新状态 ──
  let reqAbort = null
  const abortInflight = () => { if (reqAbort) { try { reqAbort.abort() } catch {} } reqAbort = null }
  const fetchAbortable = (url, init) => {
    abortInflight()
    reqAbort = typeof AbortController === 'function' ? new AbortController() : null
    const o = Object.assign({}, init || {})
    if (reqAbort) o.signal = reqAbort.signal
    const { promise, state } = abortable(fetch(url, o).then((r) => r.status).catch(() => 0), reqAbort && reqAbort.signal)
    return { promise, state }
  }
  // 用可中止版本重探一次诊断端点（原来的裸 fetch 已取消不了）；取消不报错，见 T15
  fetchAbortable('/api/diag-stream', { headers: { Accept: 'text/event-stream' } }).promise.then((r) => {
    if (r.aborted) return
    diagState = diagOfflineState(r.value)
    paintDiag()
  })
  // ⑦ 再问一次 /api/library：200+JSON ⇒ 本机 Node host 在（完整功能）；404/HTML ⇒ 静态托管。
  //    据此决定侧栏"为什么不可用 + 怎么办"的说明。
  //    ⚠ **不能**复用上面的 fetchAbortable：它每次调用都 abort 上一个在途请求，
  //      串起来用会把**诊断探测**掐掉 ⇒ 离线标记永远不出现（本批实测踩到过）。
  //      这里给启动探测一个独立的中止槽（切语言/关页时一起取消即可）。
  let bootCtl = null
  try { bootCtl = typeof AbortController === 'function' ? new AbortController() : null } catch { bootCtl = null }
  const probeStatus = (url, init) => {
    const o = Object.assign({}, init || {})
    if (bootCtl) o.signal = bootCtl.signal
    return abortable(fetch(url, o).then((r) => r.status).catch(() => 0), bootCtl && bootCtl.signal).promise
  }
  probeStatus('/api/library', { headers: { Accept: 'application/json' } }).then((r) => {
    if (r.aborted) return
    apiStatus = Number(r.value) || 0
    paintBackendNote()
    paintDiag()
  })

  // ── C 组 4/4（可选）：最小错误兜底 —— error / unhandledrejection → 可见条 + 写输出区 ──
  //   插件里没有现成实现（ErrorBoundary/componentDidCatch 0 命中），这是自写的最小版：
  //   每条错误只报一次，条上显示消息本身（可见性可断言，见 T16）。
  const errBar = $('#bench-errorbar'), errMsg = $('#bench-error-msg'), errClose = $('#bench-error-close')
  const errSeen = new Set()
  function showError(msg) {
    const m = String(msg == null ? '' : msg).slice(0, 300)
    if (errSeen.has(m)) return false
    errSeen.add(m)
    if (errBar && errMsg) {
      const model = errorBannerModel(curLang, m)
      const tEl = $('#bench-error-title'); const nEl = $('#bench-error-note')
      if (tEl) tEl.textContent = model.title
      if (nEl) nEl.textContent = model.note
      errMsg.textContent = model.message
      errBar.removeAttribute('hidden')
    }
    logLine('❌ ' + m, true)
    return true
  }
  if (errClose) errClose.addEventListener('click', () => { if (errBar) errBar.setAttribute('hidden', '') })
  addEventListener('error', (e) => { showError(e && (e.message || (e.error && e.error.message))) })
  addEventListener('unhandledrejection', (e) => { showError(e && e.reason && (e.reason.message || e.reason)) })
  window.__benchPatchShowError = showError     // 自检/断言入口

  // ── ⑨ 鼠标尾迹（最小可用版：只在"指针注入"开启后可用；不抢真实鼠标事件）──
  //   ⚠ 这段与下面的 applyLang/syncAllLabels 曾在一次批量替换里被整段删掉（线上事故），
  //     现在由 bench-patch.test.mjs 的 T17（定义↔调用差集）+ T18（冷启动 smoke）双保险看住。
  const pushEl = $('#pointer-push'), trailOn = $('#trail-on'), veil = $('#pointer-veil'), cv = $('#trail-canvas')
  const lenEl = $('#trail-len'), widEl = $('#trail-w'), colEl = $('#trail-color')
  const trailBox = $('#trail-box')
  let trailPts = [], trailAttached = false, trailCtx = null
  const sizeCanvas = () => {
    if (!cv) return
    const host = veil && veil.parentElement ? veil : cv.parentElement
    if (!host) return
    const r = host.getBoundingClientRect()
    cv.width = Math.max(1, Math.round(r.width)); cv.height = Math.max(1, Math.round(r.height))
    trailCtx = cv.getContext('2d')
  }
  const drawTrail = () => {
    if (!trailCtx || !cv) return
    trailCtx.clearRect(0, 0, cv.width, cv.height)
    const segs = trailSegments(trailPts, { width: widEl ? Number(widEl.value) || 2 : 2, color: colEl ? colEl.value : '#7dd3fc' })
    trailCtx.lineCap = 'round'
    for (const sg of segs) {
      trailCtx.globalAlpha = sg.alpha; trailCtx.strokeStyle = sg.color; trailCtx.lineWidth = sg.width
      trailCtx.beginPath(); trailCtx.moveTo(sg.x0, sg.y0); trailCtx.lineTo(sg.x1, sg.y1); trailCtx.stroke()
    }
    trailCtx.globalAlpha = 1
  }
  // 只挂在**注入遮罩**上（该遮罩仅在指针注入开启时接收事件）；passive 且不阻止传播/不拦截，
  // bundle 自己的 pointermove 监听照常执行 —— 不抢真实鼠标事件（用户要求）。
  const onVeilMove = (e) => {
    if (!cv || !veil) return
    const r = veil.getBoundingClientRect()
    trailPts.push([e.clientX - r.left, e.clientY - r.top])
    const max = lenEl ? Math.max(2, Math.min(120, Number(lenEl.value) || 24)) : 24
    if (trailPts.length > max) trailPts.splice(0, trailPts.length - max)
    drawTrail()
  }
  const onVeilLeave = () => { trailPts = []; drawTrail() }
  const setTrailAttached = (on) => {
    if (!veil) return
    if (on && !trailAttached) {
      veil.addEventListener('pointermove', onVeilMove, { passive: true })
      veil.addEventListener('pointerleave', onVeilLeave, { passive: true })
      trailAttached = true; sizeCanvas(); drawTrail()
    } else if (!on && trailAttached) {
      veil.removeEventListener('pointermove', onVeilMove)
      veil.removeEventListener('pointerleave', onVeilLeave)
      trailAttached = false; trailPts = []; drawTrail()
    }
  }
  const trailGate = () => {
    const injection = !!(pushEl && pushEl.checked)
    const canTrail = injection && !!(trailOn && trailOn.checked)
    if (trailOn) {
      trailOn.disabled = !injection                      // 未开启注入 → 置灰
      if (trailBox) {
        if (injection) trailBox.removeAttribute('data-gated'); else trailBox.setAttribute('data-gated', '')
        trailBox.title = injection ? t(curLang, 'trail.tip') : t(curLang, 'trail.needInjection')
      }
    }
    for (const el of [lenEl, widEl, colEl]) if (el) el.disabled = !canTrail
    if (cv) { if (canTrail) cv.removeAttribute('hidden'); else cv.setAttribute('hidden', '') }
    setTrailAttached(canTrail)
  }
  if (pushEl) pushEl.addEventListener('change', () => setTimeout(trailGate, 0))
  if (trailOn) trailOn.addEventListener('change', trailGate)
  for (const el of [lenEl, widEl, colEl]) if (el) el.addEventListener('input', drawTrail)
  addEventListener('resize', () => { if (trailAttached) { sizeCanvas(); drawTrail() } })

  // ── 第五批 ①~④：指针归中 / 时间层锁 / 壁纸品牌 / 拖动开关（开关见 readPatchFlags）──
  //   共同前提：渲染器是**同源 iframe**（#frame → /wallpaper-engine-webgl/renderer/index.html），
  //   所以父页能拿到它的 window（跨源时下面每个 try 都会安全失败，功能静默关闭而不是抛错）。
  const FLAGS = readPatchFlags(typeof location !== 'undefined' ? location.search : '')
  const frameEl = $('#frame')
  const stageEl = $('#stage') || $('#stage-slot')
  const rendererWin = () => { try { const w = frameEl && frameEl.contentWindow; return w && w.__wp ? w : null } catch { return null } }
  const rendererApi = () => { const w = rendererWin(); return w ? w.__wp : null }

  // ① 鼠标离开舞台/视口 → 指针回中性位置（中心）+ 清按键；回到画面里自动恢复（真实 mousemove 本来就是唯一坐标源）
  let parked = false
  let parkCount = 0
  function parkPointerNow() {
    const api = rendererApi()
    const act = pointerParkAction({ enabled: FLAGS.ppark, hasApi: !!api, parked })
    if (!act.park) return false
    parked = true
    parkCount++
    try { if (act.leave && typeof api.pointerLeave === 'function') api.pointerLeave() } catch { /* 旧 bundle 无此方法 */ }
    try { if (typeof api.pushPointer === 'function') api.pushPointer(act.u, act.v, act.buttons, 0) } catch { /* 同上 */ }
    return true
  }
  const unparkPointer = () => { parked = false }
  const stageHasPoint = (x, y) => {
    if (!stageEl || typeof stageEl.getBoundingClientRect !== 'function') return false
    try { const r = stageEl.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom } catch { return false }
  }
  // 父页：鼠标离开窗口（relatedTarget=null）／在舞台矩形之外移动（从 iframe 移到父页时最先命中这条）
  doc.addEventListener('mouseout', (e) => { if (!e.relatedTarget) parkPointerNow() }, { passive: true })
  if (typeof doc.addEventListener === 'function') doc.addEventListener('pointermove', (e) => {
    if (stageHasPoint(e.clientX, e.clientY)) { unparkPointer(); return }
    parkPointerNow()
  }, { passive: true })
  if (stageEl && stageEl.addEventListener) stageEl.addEventListener('mouseleave', () => parkPointerNow(), { passive: true })
  // 渲染器 iframe 内部（同源）：鼠标离开该文档 / 窗口失焦；回到文档内则解锁（允许下一次离开再归中）
  function bindRendererPointerLeave() {
    const w = rendererWin()
    if (!w || !w.document || !w.document.addEventListener) return false
    const rdoc = w.document
    try { if (rdoc.__benchParkBound === '1') return true; rdoc.__benchParkBound = '1' } catch { return false }
    rdoc.addEventListener('mouseleave', () => parkPointerNow(), { passive: true })
    rdoc.addEventListener('mouseout', (e) => { if (!e.relatedTarget) parkPointerNow() }, { passive: true })
    rdoc.addEventListener('mousemove', () => unparkPointer(), { passive: true })
    try { w.addEventListener('blur', () => parkPointerNow(), { passive: true }) } catch { /* 跨源/已卸载 */ }
    return true
  }
  try { doc.addEventListener('visibilitychange', () => { if (doc.hidden) parkPointerNow() }, { passive: true }) } catch { /* 无 document.hidden */ }

  // ② 注入到页面里的 DOM 时间层：不可交互 / 不可选中 / 不可拖拽（只动元素自身，绝不碰 canvas / iframe / 遮罩 ⇒ 跟随链不受影响）
  let clockLockCount = 0
  const LOCK_STYLE = [
    ['pointer-events', 'none'],
    ['user-select', 'none'],
    ['-webkit-user-select', 'none'],
    ['-webkit-user-drag', 'none'],
  ]
  function applyTimeLayerLock(el) {
    if (!el || !el.setAttribute) return false
    try { el.setAttribute('draggable', 'false') } catch { /* 只读元素 */ }
    try { el.draggable = false } catch { /* 同上 */ }
    try { if (el.dataset) el.dataset.benchClockLock = '1' } catch { /* 同上 */ }
    try {
      if (el.style && typeof el.style.setProperty === 'function') {
        for (const [k, v] of LOCK_STYLE) el.style.setProperty(k, v, 'important')
      }
    } catch { /* 同上 */ }
    return true
  }
  function computedPosition(el, win) {
    try { if (el.style && el.style.position) return el.style.position } catch { /* 无 style */ }
    try { if (win && typeof win.getComputedStyle === 'function') return win.getComputedStyle(el).position || '' } catch { /* 假 DOM / 已脱离 */ }
    return ''
  }
  function lockTimeLayers(root, win) {
    if (!FLAGS.clocklock || !root || typeof root.querySelectorAll !== 'function') return 0
    let list = []
    try { list = Array.from(root.querySelectorAll('*')) } catch { return 0 }
    let n = 0
    for (const el of list) {
      const plan = timeLayerPlan({
        tag: el.tagName, id: el.id, cls: el.className,
        text: ownTextOf(el), position: computedPosition(el, win),
      })
      if (!plan.lock) continue
      if (applyTimeLayerLock(el)) n++
    }
    return n
  }
  function lockTimeLayersEverywhere() {
    let n = 0
    const slot = $('#stage-slot')
    if (slot) n += lockTimeLayers(slot, typeof window !== 'undefined' ? window : null)
    const w = rendererWin()
    if (w && w.document) n += lockTimeLayers(w.document, w)
    clockLockCount = n
    return n
  }

  // ③ 壁纸品牌：媒体组件显示壁纸自己的 project.json title + preview（拿不到 → 中性文案，绝不回落到上游品牌）
  let mediaBrand = null
  let mediaShim = null            // { snap, saved: {k: descriptor} } —— 用过就还原得回去
  let hostLibCache = null
  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      try {
        const FR = (typeof FileReader !== 'undefined') ? FileReader : null
        if (!FR || !file) { resolve(''); return }
        const r = new FR()
        r.onload = () => resolve(String(r.result || ''))
        r.onerror = () => resolve('')
        r.readAsDataURL(file)
      } catch { resolve('') }
    })
  }
  function restoreMediaShim() {
    if (!mediaShim) return false
    const { snap, saved } = mediaShim
    mediaShim = null
    for (const k of Object.keys(saved)) {
      try {
        const d = saved[k]
        if (d && d.get) Object.defineProperty(snap, k, d)
        else { delete snap[k]; snap[k] = d && 'value' in d ? d.value : '' }
      } catch { /* 还原失败不致命 */ }
    }
    return true
  }
  function applyMediaBranding() {
    const w = rendererWin()
    if (!w || !mediaBrand) return false
    let stats = null
    try { stats = typeof w.__mediaStats === 'function' ? w.__mediaStats() : null } catch { stats = null }
    const plan = mediaBrandPlan(mediaBrand, stats)
    if (!plan.take) { restoreMediaShim(); return false }
    const patch = {
      title: mediaBrand.title, artist: mediaBrand.artist,
      hasThumbnail: !!mediaBrand.hasThumbnail, thumbnail: mediaBrand.thumbnail || '',
    }
    try { if (typeof w.__mediaSet === 'function') w.__mediaSet(patch) } catch { /* 场景未挂载时没有它 */ }
    // 模拟媒体源每帧 applyAt() 都会把 title/artist/thumbnail 写回品牌（media.js:135-272）⇒
    // 只有把它写回的那几个字段改成**只读访问器**才能真正钉住（否则下一帧就变回 WebWallGL）。
    let ctl = null
    try { ctl = w.__mediaControl } catch { ctl = null }
    const snap = ctl && ctl.snapshot
    if (snap) {
      if (!mediaShim || mediaShim.snap !== snap) {
        restoreMediaShim()
        const saved = {}
        for (const k of Object.keys(patch)) {
          try { saved[k] = Object.getOwnPropertyDescriptor(snap, k) || { value: snap[k], writable: true, configurable: true, enumerable: true } } catch { /* 取不到就不还原 */ }
        }
        mediaShim = { snap, saved }
      }
      for (const k of Object.keys(patch)) {
        const v = patch[k]
        try { Object.defineProperty(snap, k, { configurable: true, enumerable: true, get: () => v, set: () => {} }) } catch { /* 冻结失败：退化为一次性 __mediaSet */ }
      }
      try { if (typeof w.__mediaSet === 'function') w.__mediaSet(patch) } catch { /* 广播失败不影响画面字段 */ }
    }
    return true
  }
  async function setBrandingFromProject(meta, opt) {
    const o = opt || {}
    const thumb = o.previewFile ? await readFileAsDataUrl(o.previewFile) : String(o.thumbnail || '')
    mediaBrand = brandingFromProject(meta, { thumbnail: thumb, generic: t(curLang, 'brand.generic') })
    applyMediaBranding()
    return mediaBrand
  }
  function hostLibrary() {
    if (hostLibCache) return hostLibCache
    hostLibCache = (typeof fetch === 'function')
      ? fetch('/api/library', { headers: { Accept: 'application/json' } })
        .then((r) => (r && r.ok ? r.json() : null))
        .then((j) => (j && Array.isArray(j.items)) ? j.items : [])
        .catch(() => [])
      : Promise.resolve([])
    return hostLibCache
  }
  async function brandingForItemId(itemId) {
    if (!itemId) return null
    const local = localItems.find((it) => it.id === itemId || it.dir === itemId || String(it.dir).endsWith('/' + itemId))
    if (local) return setBrandingFromProject({ title: local.title }, { previewFile: local.preview })
    const items = await hostLibrary()
    const hit = (items || []).find((it) => String(it.itemId) === String(itemId))
    if (!hit) { mediaBrand = brandingFromProject(null, { generic: t(curLang, 'brand.generic') }); applyMediaBranding(); return mediaBrand }
    const thumb = hit.preview ? ('/media/dev/' + hit.itemId + '/' + hit.preview) : ''
    return setBrandingFromProject(hit, { thumbnail: thumb })
  }
  // ④ 壁纸自带「可拖动」类用户属性 → 关掉（hina 3554161528 的 newproperty21；详见 docs/HINA-CLOCK-AND-PROPERTIES.md）
  let dragDisabled = []
  function disableWallpaperDrag(properties) {
    if (!FLAGS.clockdrag) return []
    const keys = dragPropsToDisable(properties)
    if (!keys.length) return []
    const api = rendererApi()
    if (!api || typeof api.updateWebProps !== 'function') return []
    const wire = {}
    for (const k of keys) wire[k] = { value: false }
    try { api.updateWebProps(wire) } catch { return [] }
    dragDisabled = keys
    return keys
  }
  async function propertiesForItemId(itemId) {
    if (!itemId) return null
    const local = localItems.find((it) => it.id === itemId || it.dir === itemId || String(it.dir).endsWith('/' + itemId))
    if (local && local.properties) return local.properties
    const items = await hostLibrary()
    const hit = (items || []).find((it) => String(it.itemId) === String(itemId))
    return hit ? hit.properties : null
  }
  /** 打开壁纸后统一接线：itemId → 品牌 + 拖动开关。
   *  场景挂载是异步的（__mediaControl 要挂载后才在），所以**不在这里等**：
   *  下面的 batch5Timer 每 1.2s 重放一次 applyMediaBranding()，挂载一完成就自动生效。 */
  async function onWallpaperOpened(itemId) {
    const props = await propertiesForItemId(itemId)
    disableWallpaperDrag(props)
    await brandingForItemId(itemId)
    applyMediaBranding()
  }
  // 同源 iframe 里挂一层薄包装：跟住「换了哪张壁纸」（本地路径我们直接知道；后端路径从 src 里嗅 itemId）
  function wrapRendererApi() {
    const w = rendererWin()
    if (!w || w.__benchWrapped === '1') return false
    const api = w.__wp
    if (!api) return false
    try { w.__benchWrapped = '1' } catch { return false }
    for (const name of ['setWallpaper', 'loadSceneFile']) {
      const orig = api[name]
      if (typeof orig !== 'function') continue
      api[name] = function (a, b) {
        const r = orig.apply(this, arguments)
        try {
          const id = sniffItemId((a && (a.src || a.source)) || b || '')
          if (id) onWallpaperOpened(id)
        } catch { /* 嗅探失败不影响加载 */ }
        return r
      }
    }
    bindRendererPointerLeave()
    return true
  }
  // iframe 每次换 src（换壁纸/重挂载）都会换一个内部 window ⇒ 包装与监听要周期性重挂
  // （廉价：只读 __wp 上的一个标记位）。时间层扫描更贵，隔几拍跑一次。
  let pollTick = 0
  const batch5Timer = setInterval(() => {
    pollTick++
    wrapRendererApi()
    bindRendererPointerLeave()
    if (FLAGS.brand) applyMediaBranding()
    if (FLAGS.clocklock && pollTick % 3 === 0) lockTimeLayersEverywhere()
  }, 1200)
  if (frameEl && frameEl.addEventListener) frameEl.addEventListener('load', () => {
    setTimeout(() => { wrapRendererApi(); bindRendererPointerLeave() }, 0)
    setTimeout(() => { lockTimeLayersEverywhere() }, 800)
  })

  // ── ③ 语言切换：把所有**已渲染文本**（含 bundle 覆盖不到的动态面板）并入切换链 ──
  //   ⚠ 顺序硬要求（父任务）：**先 sweep 已渲染文本，再 repaint**。反过来的话，刚被 repaint
  //     写好的新语言标签会被 sweep 当成"已渲染文本"再翻一次（T4 的零残留断言就是防这个）。
  function applyLang(next) {
    const to = next === 'zh' ? 'zh' : 'en'
    if (to !== curLang) {
      const from = curLang
      curLang = to
      const r = sweepRendered(doc.body, from, to, doc)          // 1) 先翻译"已渲染"的动态文本
      if (r && r.missed && r.missed.length) console.info('[bench-patch] 未命中的待翻译文本(' + r.missed.length + '):', r.missed.slice(0, 8))
    }
    applyStaticI18n(doc, curLang)                              // 幂等：补上 bundle 尚未重渲染的 data-i18n 节点
    applyTitle(doc, curLang)                                   // 窗口/标签页标题
    paintDpr(); paintLogsIcon(); paintDiag(); paintFs(); trailGate()   // 2) 再 repaint（参数化/双态/离线态/门控）
    paintFps(); paintUppercaseLabels(); paintBackendNote()      // ⑷⑸⑺ 无上限状态、大小写、后端说明
    syncAllLabels()                                            // 3) 最后统一重写补丁注入控件的标签
    injectReadme(); renderLocal(); closePicker(); fixStaticNotice()
    if (typeof paintOnlineNotice === 'function') paintOnlineNotice()   // P-93：在线横幅随语言
    // 第五批：语言切换后补一次时间层锁文案/品牌中性文案（brand.generic 随语言变）+ 时间层锁重扫
    if (FLAGS && FLAGS.clocklock) lockTimeLayersEverywhere()
    if (mediaBrand && mediaBrand.source === 'neutral') { mediaBrand.title = t(curLang, 'brand.generic'); applyMediaBranding() }
  }

  // ── 补丁注入/接管控件的**标签同步清单**（改这里 = 改覆盖范围；T18 会核对清单里每个 id 都在 index.html 里）──
  const LABEL_SPEC = [
    ['#status-dpr', 'text', 'status.dpr', true],      // 带参 → 由 paintDpr 处理，这里只登记
    ['#status-fps', 'text', 'status.cap', true],      // 带参/无上限两态 → 由 paintFps 处理，这里只登记
    ['#copy-logs', 'text', 'copy.logs'],
    ['#copy-url', 'text', 'copy.url'],
    ['#fs-enter', 'text', 'fs.enter'],
    ['#fs-exit', 'text', 'fs.exit'],
    ['#offline-tag', 'text', 'offline.tag'],
    ['#bench-error-title', 'text', 'error.title'],
    ['#bench-error-note', 'text', 'error.logged'],
    ['#bench-error-close', 'text', 'error.dismiss'],
    ['#clear-local', 'text', 'local.clear'],
    ['#clear-local', 'title', 'local.clearTitle'],
    ['#pick-lib', 'title', 'local.pickTitle'],
    ['#copy-logs', 'title', 'copy.logs'],
    ['#trail-len', 'title', 'trail.len'],
    ['#trail-w', 'title', 'trail.width'],
    ['#trail-color', 'title', 'trail.color'],
    ['#trail-box', 'title', 'trail.tip'],
    ['#bench-local', 'skip', null],                   // 由 renderLocal 渲染（带类型标签）
    ['#bench-rd-btn', 'skip', null],
    // 第五批④：文档页底部的**原作者归属外链**（赞赏卡片已删；这两个节点故意不挂 data-i18n ——
    // 旧 bundle 的词典里没有 credit.* 键，挂了会被它的 applyStatic 写成键名原文）
    ['#credit-title', 'text', 'credit.title'],
    ['#credit-link', 'text', 'credit.link'],
  ]
  function syncAllLabels() {
    for (const [sel, kind, key, skip] of LABEL_SPEC) {
      if (skip || !key) continue
      const el = $(sel)
      if (!el) continue
      if (kind === 'text') el.textContent = t(curLang, key)
      else if (kind === 'title') el.setAttribute('title', trailOrPickTitle(sel, key))
    }
    for (const d of dropdowns) d.label()                        // 自绘下拉触发器（#lang/#resolution/#fit/#dpr/#fps/#fx）
    const themeBtn = $('#theme-toggle')                         // 主题按钮 title 随模式+语言
    if (themeBtn && themeBtn.dataset && themeBtn.dataset.mode) themeBtn.title = t(curLang, 'theme.' + themeBtn.dataset.mode)
    paintDpr(); paintLogsIcon(); paintFps(); paintUppercaseLabels()   // 状态栏两格：bundle 会写旧文案，必须最后覆盖
  }
  // #pick-lib 的 title 在静态托管下要显示"选择本地文件夹"的原因（gate 时显示 needInjection 同款逻辑）
  function trailOrPickTitle(sel, key) {
    if (sel === '#trail-box') {
      const injection = !!(pushEl && pushEl.checked)
      return t(curLang, injection ? 'trail.tip' : 'trail.needInjection')
    }
    if (sel === '#pick-lib') {
      return t(curLang, canPickViaInput() || canShowDirPicker() ? 'local.pickTitle' : 'local.unsupported')
    }
    return t(curLang, key)
  }
  // ⑵ bundle 自己 append 的静态提示文案仍写着「打开本地 .pkg」（它那份词典烘死在 minified 产物里）。
  //    这里把节点文本改回本补丁的新词典；bundle 每次 renderList 都会重建它，所以挂在 MutationObserver 上。
  function fixStaticNotice() {
    const listEl2 = $('#list')
    if (!listEl2) return
    for (const n of listEl2.querySelectorAll('.static-notice')) {
      if (n.textContent !== t(curLang, 'static.notice')) n.textContent = t(curLang, 'static.notice')
      if (n.dataset) n.dataset.i18n = 'static.notice'      // 让 applyStaticI18n/语言切换继续管它
    }
  }
  const listWatchEl = $('#list')
  if (listWatchEl && typeof MutationObserver === 'function') {
    new MutationObserver(() => fixStaticNotice()).observe(listWatchEl, { childList: true, subtree: true })
  }
  fixStaticNotice()

  // ⑵⑶⑻ 已删功能留下的「兼容锚点」：节点只是让旧 bundle 不 NPE，这里再把处理器摘掉，双保险。
  for (const pair of [['#open-pkg', 'onclick'], ['#pkg-file', 'onchange'], ['#sponsor-btn', 'onclick'], ['#type-filter', 'onclick']]) {
    const el = $(pair[0])
    if (!el) continue
    try { el[pair[1]] = null } catch { /* 空元素也可以没有该属性 */ }
    try { el.setAttribute('hidden', ''); el.setAttribute('aria-hidden', 'true') } catch { /* 同上 */ }
    if (el.tagName === 'INPUT') { try { el.removeAttribute('accept'); el.disabled = true } catch { /* 同上 */ } }
  }
  const themeFallback = ensureThemeFallback()      // ① bundle 已接管时返回 false（绝不重复接管）
  paintBackendNote()                              // ⑺ 先按"未探测"渲染一次，探测回来再刷新

  const langEl = $('#lang')
  if (langEl) langEl.addEventListener('change', () => applyLang(langEl.value))

  /* ==================== P-93：在线 demo（GitHub Pages）三件事 ====================
     ① 产物里的硬编码绝对路径 → 相对本页（线上挂在 /demo/ 下，绝对路径会 404）；
     ② 页面上把"在线版没有本机后端"写清楚（静态横幅 + 运行期同源文案）；
     ③ 默认壁纸 = 本仓库自造的**合成样例**（仓库不分发任何真实壁纸）。 */
  const demoPrefix = demoEnv.demoPrefix
  const remap = (u) => demoAssetUrl(u, demoPrefix)

  // ①-a 渲染器 iframe：产物里 3 处 `frame.src = '/wallpaper-engine-webgl/renderer/index.html…'`。
  //   产物是 minified 且**不可重建**（离线装不上依赖），改产物风险大于收益 ⇒ 在 iframe 的
  //   src 属性上做一次前缀改写（只认 /wallpaper-engine-webgl/ 这一个前缀，别的 URL 原样放行）。
  try {
    const fr = $('#frame')
    const proto = (typeof HTMLIFrameElement !== 'undefined') ? HTMLIFrameElement.prototype : null
    if (fr && proto) {
      const desc = Object.getOwnPropertyDescriptor(proto, 'src')
      const setter = desc && desc.set
      const getter = desc && desc.get
      if (setter && getter && !proto.__benchDemoRemap) {
        Object.defineProperty(proto, 'src', {
          configurable: true,
          enumerable: true,
          get() { return getter.call(this) },
          set(v) {
            const cur = typeof location !== 'undefined' ? location.href : ''
            if (String(v).indexOf('/wallpaper-engine-webgl/') === 0 && (onlineDemoEnv(cur, { force: '1' }).online || demoPrefix !== './')) {
              setter.call(this, remap(v))
            } else setter.call(this, v)
          },
        })
        // 标记打在原型上：重复 init（同一页多次调用）不重复包裹
        try { Object.defineProperty(proto, '__benchDemoRemap', { value: 1, configurable: true }) } catch { /* 冻结的原型（罕见） */ }
      }
    }
  } catch (e) { console.warn('[bench-patch] iframe src 前缀改写跳过：', e && e.message) }

  // ①-b Service Worker：产物末尾确实有 `navigator.serviceWorker.register("/wallpaper-engine-webgl/sw.js").catch(()=>{})`。
  //   本补丁把脚本 URL 改写成相对本页，**并吞掉失败**：产物那条注册在 /demo/ 挂载下本来就注册不上
  //   （scope 与路径都不对），上游自己也是 `.catch(()=>{})` —— 我们不改这个行为，只求控制台不冒假红。
  //   不主动注册是有意的：线上不留 SW ⇒ 不会出现"旧版本被 SW 缓存住"的经典事故（见 docs/ONLINE-DEMO.md §6）。
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
      const swContainer = navigator.serviceWorker
      const swReg = swContainer.register.bind(swContainer)
      swContainer.register = (url, opt) => {
        try { return Promise.resolve(swReg(remap(url), opt)).catch(() => null) } catch { return Promise.resolve(null) }
      }
    }
  } catch { /* 无 SW 支持（file:// / 隐私模式）：无关紧要 */ }

  // ② 在线版横幅：只在"线上形态"下注入；节点 id 固定 `#bench-online-notice`，落地页用同名区块。
  const demoNotice = onlineDemoNotice(curLang)
  const paintOnlineNotice = () => {
    let box = $('#bench-online-notice')
    if (!demoEnv.online) { if (box) box.hidden = true; return null }
    if (!box) {
      box = doc.createElement('section')
      box.id = 'bench-online-notice'
      box.className = 'bench-online-notice'
      const host = $('#statusbar') || doc.body
      host.parentNode ? host.parentNode.insertBefore(box, host) : doc.body.appendChild(box)
    }
    const n = onlineDemoNotice(curLang)
    box.hidden = false
    const strong = doc.createElement('strong'); strong.textContent = n.title
    const p1 = doc.createElement('div'); p1.textContent = n.body
    const p2 = doc.createElement('div'); p2.className = 'bench-online-sample'; p2.textContent = n.sample
    box.textContent = ''
    box.appendChild(strong); box.appendChild(p1); box.appendChild(p2)
    return n
  }
  paintOnlineNotice()

  // ③ 默认壁纸 = 合成样例（`?sample=0` 关掉；`?sample=<url>` 换成别的 URL）。
  //   走渲染器自己的公开契约 `__wp.loadSceneFile(blob, projectJson)`；
  //   project.json 一并喂进去，属性面板/品牌才有名字可用。
  async function loadDefaultSample(explicitUrl) {
    const fr = $('#frame')
    if (!fr) return { ok: false, reason: 'no-frame' }
    // explicitUrl 未给 ⇒ 读 `?sample=`：缺省 = 自动载入合成样例；`?sample=0` = 不载；`?sample=<url>` = 换来源
    let raw = explicitUrl
    if (raw === undefined || raw === null) {
      try {
        const m = String((typeof location !== 'undefined' && location.search) || '').match(/[?&]sample=([^&]*)/)
        raw = m ? decodeURIComponent(m[1]) : ''
      } catch { raw = '' }
    }
    raw = String(raw)
    const plan = defaultSamplePlan({ force: raw })
    if (!plan.auto) return { ok: false, reason: 'sample-flag-off' }
    const abs = (u) => {
      try { return new URL(u, (typeof location !== 'undefined' ? location.href : 'http://127.0.0.1/')).href } catch { return u }
    }
    const pkgUrl = abs(raw !== '' ? raw : plan.sample)
    const projUrl = String(pkgUrl).replace(/scene\.pkg(\?.*)?$/, 'project.json')
    try {
      const rendererApi = await ensureRendererFrame(fr)
      const rs = await fetch(pkgUrl, { cache: 'no-store' })
      if (!rs.ok) throw new Error('HTTP ' + rs.status)
      const buf = await rs.arrayBuffer()
      let project = null
      try { const rj = await fetch(projUrl, { cache: 'no-store' }); if (rj.ok) project = await rj.json() } catch { /* project.json 可选 */ }
      // 必须是带 arrayBuffer() 的对象：渲染器的 source 契约就是 `scenePkg: () => t.arrayBuffer()`
      // （真机实测：裸 ArrayBuffer 会 `t.arrayBuffer is not a function` ⇒ 场景挂载失败）。
      // 用 Blob 而**不是** File：T17 的"定义↔调用"审计会把裸 `new File(` 当成未定义标识符。
      rendererApi.loadSceneFile(new Blob([buf], { type: 'application/octet-stream' }), project)
      const cur = $('#current')
      if (cur) { cur.textContent = 'sample-synthetic'; cur.title = t(curLang, 'demo.onlineSample') }
      const em = $('#empty'); if (em) em.style.display = 'none'
      fr.classList.add('on')
      logLine(t(curLang, 'demo.sampleLoaded', { name: 'sample-synthetic/scene.pkg' }))
      return { ok: true, url: pkgUrl, bytes: buf.byteLength, hasProject: !!project }
    } catch (e) {
      logLine('❌ ' + t(curLang, 'demo.sampleMissing', { msg: String((e && e.message) || e) }), true)
      return { ok: false, reason: String((e && e.message) || e), url: pkgUrl }
    }
  }
  let defaultSample = null
  // 本机静态台（:8901，无 Node host）与线上都载一次 —— "打开就有画面"两边一致；
  // vite 宿主（:1430，hostBlocked=false，有真 Node 后端）不抢它自己的默认壁纸。
  if (HOST_BLOCKED_HERE || demoEnv.online) {
    setTimeout(() => {
      defaultSample = loadDefaultSample()
      defaultSample.then((r) => { if (r && r.ok) wrapRendererApi() })
    }, 1200)
  }

  // 首次同步
  applyLang(curLang)
  paintDiag()
  trailGate()
  paintFs()
  setTimeout(() => { const b = $('#pick-lib'); if (b && b.disabled && !localItems.length) { b.disabled = false; b.title = t(curLang, 'local.pickTitle') } }, 3000)

  syncAllLabels()

  // 源码侧钩子（bench/bench.ts 调用；重建后若源码自足可删）
  const api = {
    langChanged: (l) => applyLang(l),
    resolutionChanged: () => syncAllLabels(),
    pointerPushChanged: () => trailGate(),
    // A2 源码侧 enterStaticMode() 在支持 webkitdirectory 时把「选择文件夹」委托到这里
    pickLocalFolder: () => pickLocalFolder(),
    // ⑹ 扫描入口与清空（探针/测试用同一入口，浏览器里也能从控制台调用）
    loadLocalEntries: (entries) => loadLocalEntries(entries),
    clearLocalLibrary: (silent) => clearLocalLibrary(!!silent),
    getLocalItems: () => localItems.map((it) => ({ dir: it.dir, title: it.title, kind: it.kind, hasPkg: !!it.pkg })),
    // ⑺ 后端状态（静态托管 / 离线；探针断言用）
    getBackendMode: () => backendMode(backendEnv()).mode,
    getBackendNotice: () => backendNotice(curLang, backendEnv()),
    // ① 主题兜底是否被启用（bundle 活着时应为 false）
    themeFallbackApplied: () => themeFallback,
    showError: (m) => showError(m),
    openColorPicker: (el, hex, cb) => openColorPicker(el, hex, cb),
    syncAllLabels: () => syncAllLabels(),
    getLang: () => curLang,
    // 第五批（用户实测三条 + 归属外链）：开关状态与自检入口（探针/测试用同一入口）
    flags: () => Object.assign({}, FLAGS),
    pointerParkNow: () => parkPointerNow(),
    getPointerPark: () => ({ parked, count: parkCount, enabled: FLAGS.ppark }),
    lockTimeLayersNow: () => lockTimeLayersEverywhere(),
    getClockLock: () => ({ count: clockLockCount, enabled: FLAGS.clocklock }),
    applyMediaBranding: () => applyMediaBranding(),
    getBranding: () => (mediaBrand ? Object.assign({}, mediaBrand) : null),
    setBranding: (meta, opt) => setBrandingFromProject(meta, opt),
    onWallpaperOpened: (id) => onWallpaperOpened(id),
    disableWallpaperDrag: (props) => disableWallpaperDrag(props),
    getDragDisabled: () => dragDisabled.slice(),
    wrapRendererApi: () => wrapRendererApi(),
    labelIds: LABEL_SPEC.map((s2) => s2[0]),
    // P-93 在线 demo（线上形态 / 路径改写 / 合成样例 / 横幅）：探针与测试同一入口
    getDemoEnv: () => Object.assign({}, demoEnv),
    getOnlineNotice: () => paintOnlineNotice(),
    remapDemoUrl: (u) => remap(u),
    getDefaultSample: () => defaultSample,
    loadDefaultSample: (u) => loadDefaultSample(u),
    shell: { indexHtml: 'demo/index.html', singleSource: 'demo/bench-patch.js' },
    // 清单里可能不存在的 id：① 由 bindDropdown 动态创建 ② 可选控件（如复制链接按钮将来才加）
    dynamicIds: ['#bench-rd-btn', '#copy-url', '#bench-local'],   // 由补丁动态创建（#bench-local = 本地库容器）
  }
  window.__benchPatch = api
  return api
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
}
