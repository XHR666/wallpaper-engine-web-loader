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
//   第八批：appBrandPlan / applySiteBrand（站点品牌运行期覆盖，见文末「第八批」段）
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
//
// 第六批（**P-96 在线 demo**，见 we-scene-demo/PATCHES.md P-96 与 docs/ONLINE-DEMO.md）：
//   本文件现在是**唯一真源**（物理文件在 we-scene-demo/demo/，两条软链指过来）：
//     vendor-ref/ww-pages/wallpaper-engine-webgl/bench-patch.js  → 真源
//     vendor-ref 下的 webwallgl 检出里的 bench-patch.js            → 上一条（链式）
//   ① 线上形态判定 onlineDemoEnv()：GitHub Pages 这类"设计上就没有本机后端"的部署换一套文案；
//   ② 产物里写死的 /wallpaper-engine-webgl/ 前缀在运行期改写成相对本页（iframe src / SW 脚本）；
//   ③ 默认壁纸 = 本仓库自造的合成样例 samples/sample-synthetic/scene.pkg（`?sample=0` 关、`?sample=<url>` 换）；
//   ④ 页面上把"在线版没有本机后端"写清楚（静态横幅 + 运行期同源同义文案）。
//   开关：?online=0 强制本机口径；?sample=0 不自动载入合成样例。
//   ⚠ 将来产物能重建时，①②③④ 都应回写源码 bench/ 再删掉本文件对应段。
//
// 第八批（**2026-09-18 用户改名**：产品名 WebWallGL → **WEwebLoader**，大小写严格）：
//   用户看得见的品牌位改在**运行期呈现层**：测试台头部品牌名（`#site-brand` 里那个 `data-i18n="app.title"`）
//   与 `document.title` 显示 `WEwebLoader`；版本号 `#app-version`（产物写的 `v1.3.16`）照旧跟在后面。
//   回退口：`?appname=upstream`（或 `?brand=upstream`）⇒ 还原上游名 `wallpaper-engine-webgl`。
//   **刻意不碰**三处被钉住的静态值：`index.html` 的 `<title>` 与 `data-i18n="app.title"` 兜底文本
//   （门禁 T8）、DICT 的 `app.title`（T1：词典必须逐条等于上游 bench/i18n.ts）、`assets/*.js`
//   （许可口径：minified 产物一个字节都不改）。上游归属位（设置弹层 credit、两份 LICENSE-webwallgl、
//   许可区说明）一律原样保留。

/* ============================ 词典（由 bench/i18n.ts 机械生成，勿手改） ============================ */
// 生成方式：node -e "…解析 bench/i18n.ts 的 DICT…"（见 PATCH-NOTES.md §3）；bench-patch.test.mjs
// 的 T1 会把本块与源码 DICT 逐键比对，任何漂移都会红。
export const DICT = {"zh":{"app.title":"wallpaper-engine-webgl","picker.title":"自定义颜色","picker.hex":"十六进制","picker.hint":"拖动色相条与面板，或直接输入 #rrggbb","picker.ok":"确定","picker.cancel":"取消","copy.logs":"复制输出","copy.url":"复制链接","copy.ok":"已复制到剪贴板","copy.manual":"剪贴板不可用（file:// 或未授权）：请手动复制下面选中的文本","copy.fail":"复制失败：{msg}","error.title":"页面脚本出错（已兜底）","error.dismiss":"关闭","error.logged":"详情已写入输出区","fs.enter":"全屏","fs.enterTitle":"全屏预览（退出按钮在全屏内右上角）","fs.exit":"退出全屏","fs.exitTitle":"退出全屏（也可按 Esc）","fs.unsupported":"当前浏览器不支持全屏 API","local.pickTitle":"选择本地壁纸文件夹（纯前端读取，文件不离开浏览器）","local.unsupported":"当前浏览器不支持目录选择（webkitdirectory / showDirectoryPicker）—— 无法加载本地壁纸，请改用桌面版 Chrome / Edge / Firefox","local.reading":"正在读取文件夹…","local.none":"该文件夹里没有找到壁纸（壁纸目录需要 scene.pkg 或 project.json）","local.count":"本地文件夹：{n} 个壁纸","local.sceneOnly":"静态托管下仅支持 scene 包预览（web/video 需本机 Node 后端）","local.preview":"本地预览：{name}","local.clear":"清空","local.clearTitle":"清空本地库与当前选择","local.cleared":"已清空本地库与选择","local.notDir":"这不是文件夹选择：浏览器只回传了一个文件。请点「选择文件夹」并选择目录（不要选单个文件）","local.kindTitle":"扫描时自动识别的类型：{k}","btn.pickFile":"选择文件","pick.dirTitle":"浏览文件夹","pick.fileTitle":"浏览文件","pick.curDir":"当前目录","pick.up":"上一级","pick.home":"回到最上层","pick.here":"就选这个文件夹","pick.thisFile":"就选这个文件","pick.empty":"这里没有子文件夹","pick.noFile":"这里没有符合条件的文件","pick.filterPh":"筛选名称","pick.grant":"打开系统选择器","pick.needGrant":"浏览器安全限制：网页必须先由你在系统对话框里授权一个文件夹，之后才能在这里浏览（文件不离开浏览器）","pick.readNote":"纯前端读取：目录与文件都来自你授权的那棵树，不上传、不离开浏览器","pick.granted":"已授权：{name}（{n} 个文件 / {d} 个目录）","pick.cancelled":"已取消选择","pick.count":"{n} 项","local.grantScan":"从选择器载入：{name}","local.filePicked":"已选择文件：{name}","docs.readmeTitle":"本页 README · 使用说明速查","status.dpr":"DPR（设备像素比） {n}","status.dprTitle":"窗口 devicePixelRatio —— 影响渲染分辨率与性能","offline.tag":"离线","offline.diagReason":"静态托管无 /diag 后端：渲染器诊断流不可用（需本地 Node host 或 pnpm dev）","offline.diagTitle":"诊断流不可用（静态托管）","backend.node":"本机 Node 后端已连接","backend.static":"静态托管（无 /api 后端）","backend.staticTitle":"静态托管：本页由静态服务器提供，/api/* 与 /diag 全部 404 —— 壁纸库列表、属性保存、删除、打开所在文件夹、渲染器诊断流都不可用","backend.needBackend":"需要本机 Node 后端（静态托管下不可用）","backend.alt":"可用替代：点「选择文件夹」做纯前端扫描（scene 包可直接预览，文件不离开浏览器）","backend.online":"上线方法：在 webwallgl 源码目录运行 pnpm dev，打开它打印的地址（默认 http://localhost:1430/）—— 那是带 Node host 的完整测试台","backend.offline":"当前浏览器离线（navigator.onLine=false）：本页功能不依赖网络，缺的是本机 Node 后端","backend.blocked":"本机暂时无法启动 Node host：离线环境下依赖不全（pnpm install --offline 报 ERR_PNPM_NO_OFFLINE_TARBALL）","res.pick":"选择分辨率","res.native":"（弹层列表限高可滚动）","trail.on":"鼠标尾迹","trail.needInjection":"需先开启「指针注入」","trail.len":"长度","trail.width":"粗细","trail.color":"颜色","trail.tip":"仅在开启「指针注入」后可用：尾迹取自注入遮罩的坐标，不接管真实鼠标事件","act.explorer":"资源管理器","act.docs":"使用说明","theme.auto":"主题：跟随系统","theme.dark":"主题：深色","theme.light":"主题：浅色","lang.title":"切换语言","backend.demoNoBackend":"在线演示版（GitHub Pages）没有本机 Node 后端 —— 这不是故障，是**设计如此**：线上只有静态文件，/api/* 与 /diag 一律 404。完整测试台（壁纸库列表 / 属性保存 / 删除 / 诊断流）需要在源码目录跑 pnpm dev。","demo.onlineTitle":"在线演示版","demo.onlineBody":"本页是**在线静态演示**：没有本机 Node 后端，壁纸库列表 / 属性保存 / 删除 / 打开所在文件夹 / 渲染器诊断流（/api/* 与 /diag）在线上全部不可用 —— 这不是故障，是纯静态托管的必然结果。「选择文件夹」纯前端扫描仍然可用，默认载入的是本仓库自造的**合成样例**（不含任何真实壁纸）。","demo.onlineSample":"默认壁纸：合成样例 scene.pkg（由 tools/make-sample.mjs 生成，33 299 B，无第三方内容）—— 本仓库**不分发**任何真实壁纸包。","offline.diagReasonOnline":"在线演示版没有 /diag 后端：线上是纯静态托管，渲染器诊断流不可用（这是设计如此，不是断线）","demo.sampleMissing":"合成样例载入失败：{msg}","demo.sampleLoaded":"已载入合成样例：{name}（本仓库自造，无第三方内容）","credit.title":"渲染核心原作者","credit.link":"WebWallGL · oneincase（MIT 许可）","brand.generic":"壁纸","static.notice":"在线静态版：壁纸库列表 / 属性保存 / 删除 / 诊断流需要本机后端；可用「选择文件夹」纯前端扫描本地壁纸（scene 包可预览），完整功能请在源码目录运行 pnpm dev。","static.libPath":"静态托管 · 无本机后端","static.pickTitle":"静态托管下不可用 —— 请在本地运行（pnpm dev）","log.filePreview":"本地预览：{name}","err.filePreview":"本地预览失败：{msg}","sidebar.title":"资源管理器","sidebar.libCount":"壁纸库","sidebar.pickLib":"选择文件夹（也可继续用 WE_LIBRARY）","btn.pickLib":"选择文件夹","ph.filter":"过滤标题 / itemId","ph.propsFilter":"过滤属性名 / 文案","reveal.open":"打开所在文件夹","ctx.delete":"删除壁纸","confirm.delete":"确定删除壁纸「{title}」吗？整个目录将移入废纸篓（{id}）。","ok.delete":"已删除：{id}","err.delete":"删除失败：{msg}","tab.wallpaper":"未选择壁纸","toolbar.resolution":"分辨率","toolbar.resolutionTip":"舞台逻辑分辨率（iframe 视口）","toolbar.volume":"音量","toolbar.live":"系统实况","toolbar.liveTip":"歌名/进度：Node 读 media-control；音频条：麦克风（无系统声卡环回）。换壁纸或勾选后会重挂载","toolbar.pointerPush":"指针注入","toolbar.pointerPushTip":"模拟桌面壁纸窗口：遮罩挡住原生鼠标事件，坐标改经 __wp.pushPointer 推送 —— 与宿主对接的是同一条通道","toolbar.pause":"暂停","toolbar.resume":"恢复","toolbar.reload":"重挂载","toolbar.release":"释放","toolbar.open":"新窗口","toolbar.props":"壁纸配置","toolbar.filter":"滤镜","toolbar.filterTip":"滤镜（beta）：以 CSS filter 应用到渲染输出","filter.none":"无","filter.blur":"高斯模糊","filter.grayscale":"黑白","filter.sepia":"怀旧","filter.vivid":"鲜艳","filter.warm":"暖色","filter.cool":"冷色","filter.invert":"反色","filter.brighten":"提亮","filter.darken":"压暗","filter.contrast":"高对比","res.fit":"自适应 16:9","stage.empty":"从左侧选择一个壁纸开始渲染","logs.head":"输出","logs.diag":"渲染器诊断（/diag）","logs.clear":"清空","logs.collapse":"折叠输出","logs.expand":"展开输出","status.adaptive":"自适应 16:9","status.cap":"上限 {n}","status.uncapped":"无上限","fps.uncapped":"无上限","fps.uncappedTitle":"不加帧率上限（按显示器刷新率出帧）","status.capTitle":"帧率上限（工具条 FPS）","status.liveTitle":"壁纸实测帧率（渲染循环最近 500ms）","status.items":"{n} 项","props.title":"壁纸配置","props.reset":"恢复默认","props.collapse":"收起","props.showHidden":"显示条件隐藏项","props.reading":"读取中…","props.none":"该壁纸未声明可自定义项","props.count":"{n} 项","props.countOverridden":"{n} 项（{m} 项已改）","props.readFail":"读取失败：{msg}","props.saving":"保存中…","props.savedOverridden":"已保存（{n} 项已改）","props.savedAll":"已保存（全部默认）","props.saveFail":"保存失败：{msg}","props.pending":"待保存…","props.logSaved":"属性保存：{id} {n} 项覆盖","props.empty":"project.json 未声明 general.properties，无可自定义项。","props.noMatch":"无匹配属性","props.allHidden":"全部属性都被 condition 隐藏（可勾选上方开关查看）","props.filePh":"相对壁纸根的路径（{kind}）","props.dirPh":"目录绝对路径","props.pickFile":"选择文件…","props.pickDir":"选择目录…","props.fileUnset":"未设置","props.fileUploading":"正在导入…","err.wpNotReady":"__wp 尚未就绪（先选一个壁纸并等页面加载完）","err.diagStream":"诊断流断开（dev server 重启？）","err.pickLib":"选择文件夹失败：{msg}","err.pickFile":"选择文件失败：{msg}","err.pickDir":"选择目录失败：{msg}","err.reveal":"打开文件夹失败：{msg}","err.selectFirst":"先选一个壁纸再打开自定义配置","ok.reveal":"已打开文件夹：{id}","log.libLoaded":"壁纸库载入：{n} 项（scene {s} / web {w} / video {v}）","log.mount":"挂载 {id}：?{q}","log.liveOn":"已开启系统实况（麦克风频谱 + Music/Spotify + 前台窗口）","log.liveOff":"已关闭系统实况，恢复模拟源","log.pointerPushOn":"已开启指针注入：遮罩屏蔽原生鼠标事件，坐标改经 __wp.pushPointer 推送（模拟桌面壁纸窗口）","log.pointerPushOff":"已关闭指针注入，恢复原生鼠标事件","prompt.libDir":"壁纸库目录","nav.console":"控制台","nav.docs":"说明","nav.wpset":"壁纸设置","nav.settings":"设置","nav.settingsTip":"语言 / 主题 / 归属与许可","nav.lang":"语言","nav.theme":"主题","nav.backend":"后台","nav.backendUnknown":"未知","nav.backendNote":"静态托管（GitHub Pages）没有本机 Node 后端：壁纸库列表 / 属性保存 / 删除 / 诊断流在线上不可用 —— 这是设计如此，不是故障；「选择文件夹」纯前端扫描仍可用。","wp.add":"＋","wp.addTitle":"添加 / 切换壁纸：打开左侧列表并过滤掉当前壁纸","logs.expandTip":"展开输出（控制台）","logs.collapseTip":"收起输出（控制台）","props.emptyState":"还没有选择壁纸","props.emptyHint":"从左侧「选择壁纸」里点一张，这里就会显示它 project.json 声明的可调项。"},"en":{"app.title":"wallpaper-engine-webgl","picker.title":"Custom color","picker.hex":"Hex","picker.hint":"Drag the hue bar and panel, or type #rrggbb","picker.ok":"OK","picker.cancel":"Cancel","copy.logs":"Copy output","copy.url":"Copy link","copy.ok":"Copied to clipboard","copy.manual":"Clipboard unavailable (file:// or not permitted): copy the selected text below manually","copy.fail":"Copy failed: {msg}","error.title":"Page script error (contained)","error.dismiss":"Dismiss","error.logged":"Details were written to the output panel","fs.enter":"Fullscreen","fs.enterTitle":"Fullscreen preview (the exit button is at the top-right inside fullscreen)","fs.exit":"Exit fullscreen","fs.exitTitle":"Exit fullscreen (Esc also works)","fs.unsupported":"This browser does not support the Fullscreen API","local.pickTitle":"Pick a local wallpaper folder (read in-browser; files never leave it)","local.unsupported":"This browser cannot pick directories (webkitdirectory / showDirectoryPicker) — local wallpapers cannot be loaded here; use desktop Chrome / Edge / Firefox","local.reading":"Reading folder…","local.none":"No wallpapers found in that folder (a wallpaper folder needs scene.pkg or project.json)","local.count":"Local folder: {n} wallpapers","local.sceneOnly":"Static hosting previews scene packages only (web/video need the local Node backend)","local.preview":"Local preview: {name}","local.clear":"Clear","local.clearTitle":"Clear the local library and the current selection","local.cleared":"Cleared the local library and selection","local.notDir":"That was not a folder selection: the browser returned a single file. Click “Choose folder” and pick a directory (not a single file)","local.kindTitle":"Type auto-detected while scanning: {k}","btn.pickFile":"Choose file","pick.dirTitle":"Browse folders","pick.fileTitle":"Browse files","pick.curDir":"Current folder","pick.up":"Up one level","pick.home":"Back to top","pick.here":"Use this folder","pick.thisFile":"Use this file","pick.empty":"No subfolders here","pick.noFile":"No matching files here","pick.filterPh":"Filter by name","pick.grant":"Open system picker","pick.needGrant":"Browser security: a page can only list a folder you grant through the system dialog — pick one first (files never leave the browser)","pick.readNote":"Read in-browser: folders and files come from the tree you granted; nothing is uploaded or leaves the browser","pick.granted":"Granted: {name} ({n} files / {d} folders)","pick.cancelled":"Selection cancelled","pick.count":"{n} items","local.grantScan":"Loaded from the picker: {name}","local.filePicked":"File picked: {name}","docs.readmeTitle":"This page README · quick reference","status.dpr":"DPR (devicePixelRatio) {n}","status.dprTitle":"Window devicePixelRatio — affects render resolution and performance","offline.tag":"Offline","offline.diagReason":"Static hosting has no /diag backend: the renderer diagnostics stream is unavailable (run the local Node host or pnpm dev)","offline.diagTitle":"Diagnostics stream unavailable (static hosting)","backend.node":"Local Node backend connected","backend.static":"Static hosting (no /api backend)","backend.staticTitle":"Static hosting: this page is served statically, so /api/* and /diag are all 404 — the library listing, property saving, deleting, reveal-in-folder and the diagnostics stream are unavailable","backend.needBackend":"Needs the local Node backend (unavailable under static hosting)","backend.alt":"Working alternative: “Choose folder” scans in-browser (scene packages preview directly; files never leave the browser)","backend.online":"To go online: run pnpm dev in the webwallgl source tree and open the address it prints (default http://localhost:1430/) — that is the full bench with the Node host","backend.offline":"The browser is offline (navigator.onLine=false): nothing here needs the network; what is missing is the local Node backend","backend.blocked":"The Node host cannot be started on this machine right now: dependencies are incomplete offline (pnpm install --offline fails with ERR_PNPM_NO_OFFLINE_TARBALL)","res.pick":"Pick resolution","res.native":"(popup list is height-limited and scrollable)","trail.on":"Mouse trail","trail.needInjection":"Enable “Pointer injection” first","trail.len":"Length","trail.width":"Width","trail.color":"Color","trail.tip":"Only available after enabling “Pointer injection”: the trail uses the injection veil coordinates and never takes over real mouse events","act.explorer":"Explorer","act.docs":"User guide","theme.auto":"Theme: system","theme.dark":"Theme: dark","theme.light":"Theme: light","lang.title":"Switch language","backend.demoNoBackend":"The online demo (GitHub Pages) has no local Node backend — this is **by design**, not a failure: online there are only static files, so /api/* and /diag are 404. The full bench (library listing, property saving, deleting, diagnostics stream) needs pnpm dev in the source tree.","demo.onlineTitle":"Online demo","demo.onlineBody":"This page is an **online static demo**: there is no local Node backend, so the library listing, property saving, deleting, reveal-in-folder and the renderer diagnostics stream (/api/* and /diag) are unavailable online — by design under plain static hosting, not a failure. “Choose folder” (fully client-side scanning) still works, and the default wallpaper is the **synthetic sample** generated by this repository (no real wallpaper is bundled).","demo.onlineSample":"Default wallpaper: the synthetic sample scene.pkg (generated by tools/make-sample.mjs, 33 299 B, no third-party content) — this repository **does not redistribute** any real wallpaper package.","offline.diagReasonOnline":"The online demo has no /diag backend: online is plain static hosting, so the renderer diagnostics stream is unavailable (by design, not a dropped connection)","demo.sampleMissing":"Loading the synthetic sample failed: {msg}","demo.sampleLoaded":"Loaded the synthetic sample: {name} (generated by this repository, no third-party content)","credit.title":"Original renderer author","credit.link":"WebWallGL · oneincase (MIT license)","brand.generic":"Wallpaper","static.notice":"Static demo: the library listing, property saving, deleting and the diagnostics stream need a local backend. Use “Choose folder” to scan local wallpapers in-browser (scene packages preview), or run pnpm dev in the source tree for the full bench.","static.libPath":"Static hosting · no local backend","static.pickTitle":"Unavailable on static hosting — run locally (pnpm dev)","log.filePreview":"Local preview: {name}","err.filePreview":"Local preview failed: {msg}","sidebar.title":"Explorer","sidebar.libCount":"Library","sidebar.pickLib":"Pick folder (or keep using WE_LIBRARY)","btn.pickLib":"Pick folder","ph.filter":"Filter title / itemId","ph.propsFilter":"Filter property name / label","reveal.open":"Open containing folder","ctx.delete":"Delete wallpaper","confirm.delete":"Delete wallpaper “{title}”? Its whole folder will be moved to the Trash ({id}).","ok.delete":"Deleted: {id}","err.delete":"Delete failed: {msg}","tab.wallpaper":"No wallpaper","toolbar.resolution":"Resolution","toolbar.resolutionTip":"Stage logical resolution (iframe viewport)","toolbar.volume":"Volume","toolbar.live":"Live system","toolbar.liveTip":"Title/progress via Node media-control; audio bars via mic (no system loopback). Remounts on toggle","toolbar.pointerPush":"Pointer inject","toolbar.pointerPushTip":"Simulates a desktop wallpaper window: a veil blocks native mouse events and coordinates are pushed via __wp.pushPointer — the same channel the native host uses","toolbar.pause":"Pause","toolbar.resume":"Resume","toolbar.reload":"Remount","toolbar.release":"Release","toolbar.open":"New window","toolbar.props":"Wallpaper config","toolbar.filter":"Filter","toolbar.filterTip":"Filter (beta): CSS filter applied to the rendered output","filter.none":"None","filter.blur":"Blur","filter.grayscale":"Grayscale","filter.sepia":"Sepia","filter.vivid":"Vivid","filter.warm":"Warm","filter.cool":"Cool","filter.invert":"Invert","filter.brighten":"Brighten","filter.darken":"Darken","filter.contrast":"Contrast","res.fit":"Adaptive 16:9","stage.empty":"Pick a wallpaper on the left to start rendering","logs.head":"Output","logs.diag":"Renderer diagnostics (/diag)","logs.clear":"Clear","logs.collapse":"Collapse output","logs.expand":"Expand output","status.adaptive":"Adaptive 16:9","status.cap":"Cap {n}","status.uncapped":"Uncapped","fps.uncapped":"Uncapped","fps.uncappedTitle":"No frame-rate cap (renders as fast as the display allows)","status.capTitle":"FPS cap (toolbar FPS)","status.liveTitle":"Measured wallpaper FPS (render loop, last 500ms)","status.items":"{n} items","props.title":"Wallpaper config","props.reset":"Reset defaults","props.collapse":"Collapse","props.showHidden":"Show condition-hidden items","props.reading":"Reading…","props.none":"This wallpaper declares no custom properties","props.count":"{n} items","props.countOverridden":"{n} items ({m} overridden)","props.readFail":"Read failed: {msg}","props.saving":"Saving…","props.savedOverridden":"Saved ({n} overridden)","props.savedAll":"Saved (all defaults)","props.saveFail":"Save failed: {msg}","props.pending":"Pending save…","props.logSaved":"Properties saved: {id} ({n} overrides)","props.empty":"project.json declares no general.properties — nothing to customize.","props.noMatch":"No matching properties","props.allHidden":"All properties hidden by condition (tick the switch above to view)","props.filePh":"Path relative to wallpaper root ({kind})","props.dirPh":"Absolute directory path","props.pickFile":"Choose file…","props.pickDir":"Choose folder…","props.fileUnset":"Not set","props.fileUploading":"Importing…","err.wpNotReady":"__wp not ready (pick a wallpaper and wait for it to load)","err.diagStream":"Diagnostics stream lost (dev server restarted?)","err.pickLib":"Picking folder failed: {msg}","err.pickFile":"Choosing file failed: {msg}","err.pickDir":"Choosing folder failed: {msg}","err.reveal":"Opening folder failed: {msg}","err.selectFirst":"Pick a wallpaper before opening Properties","ok.reveal":"Opened folder: {id}","log.libLoaded":"Library loaded: {n} items (scene {s} / web {w} / video {v})","log.mount":"Mount {id}: ?{q}","log.liveOn":"Live system on (mic spectrum + Music/Spotify + front window)","log.liveOff":"Live system off; back to simulated sources","log.pointerPushOn":"Pointer injection on: veil blocks native mouse events; coordinates now pushed via __wp.pushPointer (simulates desktop wallpaper window)","log.pointerPushOff":"Pointer injection off; native mouse events restored","prompt.libDir":"Wallpaper library directory","nav.console":"Console","nav.docs":"Guide","nav.wpset":"Wallpaper settings","nav.settings":"Settings","nav.settingsTip":"Language / theme / attribution & licences","nav.lang":"Language","nav.theme":"Theme","nav.backend":"Backend","nav.backendUnknown":"unknown","nav.backendNote":"Static hosting (GitHub Pages) has no local Node backend: library listing / property saving / deleting / the diagnostics stream are unavailable online — by design, not a failure. “Choose folder” (in-browser scan) still works.","wp.add":"＋","wp.addTitle":"Add / switch wallpaper: open the left list filtered to hide the current one","logs.expandTip":"Expand the output (console)","logs.collapseTip":"Collapse the output (console)","props.emptyState":"No wallpaper picked yet","props.emptyHint":"Pick one in “Choose wallpaper” on the left; the options declared in its project.json show up here."}}

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

/** <title> 与标题栏都要用同一个名字（用户拍板 wallpaper-engine-webgl）。
 *  ⚠ ⑧(2026-09-18 品牌改名)：这里的**静态值不动** —— 它是门禁 T5/T8 的钉子（产物 JS 的两处 app.title 同理，
 *  且 DICT 还必须逐条等于上游 bench/i18n.ts 的 T1）；页面上要让用户看到的产品名走 applySiteBrand。 */
export function applyTitle(doc, lang) {
  const name = t(lang, 'app.title')
  try { doc.title = name } catch { /* 无 document（测试） */ }
  return name
}

/** ⑧(2026-09-18 品牌改名) 站点品牌决策（纯函数，便于 Node 断言）。
 *  产品现名 **WEwebLoader**（用户 2026-09-18 亲自给的名字，大小写严格照抄）；
 *  回退时（`?appname=upstream` / `?brand=upstream`）用**上游名**（= DICT 的 `app.title`）。
 *  为什么不直接改静态 HTML 的 `<title>`/DICT/minified 产物：那三处分别被门禁 T5/T8、T1（词典零漂移）与
 *  许可口径（`demo/LICENSE-webwallgl`：minified 产物一个字节不改）钉住 ⇒ 产品名只做**运行期呈现层**覆盖。 */
export function appBrandPlan(env) {
  const e = env || {}
  const upstream = String(e.upstreamTitle == null ? '' : e.upstreamTitle)
  if (e.override === false) return { name: upstream, overridden: false, reason: 'flag-off' }
  const name = String(e.productName == null || e.productName === '' ? 'WEwebLoader' : e.productName)
  return { name, overridden: true, reason: 'product-name' }
}

/** 把站点品牌写进 DOM：只写**品牌名元素**与 `document.title`。
 *  `#app-version`（`v1.3.16`，产物启动时写一次）刻意**不碰** ⇒ 头部仍是「WEwebLoader v1.3.16」。 */
export function applySiteBrand(env) {
  const e = env || {}
  const plan = appBrandPlan(e)
  try { if (e.brandEl) e.brandEl.textContent = plan.name } catch { /* 桩 DOM */ }
  try { if (e.doc) e.doc.title = plan.name } catch { /* 无 document（测试） */ }
  return plan
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
 * 各开关默认**全开**（= 新行为）；写成 0/false/off/no 表示回退到上游原行为。
 *   ppark     鼠标离开舞台/视口 → 指针回到中性位置（中心）
 *   clocklock 注入到页面里的 DOM 时间层 → pointer-events:none / 不可选中 / 不可拖拽
 *   clockdrag 壁纸自带「可拖动」用户属性 → 关掉（时钟/日期组件拖不走）
 *   brand     媒体组件的名称/图标 → 用壁纸自己的 project.json title / preview
 *   appname   ⑧站点品牌（测试台头部品牌名 + document.title）→ 显示产品现名 **WEwebLoader**；
 *             `?appname=upstream`（或 `=0/false/off/no`，或 `?brand=upstream`）⇒ **还原上游名**
 *             `wallpaper-engine-webgl`（版本号 `#app-version` 两种情况都不动）。
 */
export function readPatchFlags(search) {
  const q = new URLSearchParams(String(search == null ? '' : search))
  const on = (name, def) => {
    const v = q.get(name)
    if (v == null || v === '') return def
    return !/^(0|false|off|no)$/i.test(String(v))
  }
  // ⑧(2026-09-18 品牌改名) 站点品牌覆盖 = 默认开（显示 WEwebLoader）；`?appname=upstream|0|off|false|no`
  //   或 `?brand=upstream` ⇒ 关（还原上游名）。注意 `?brand=0` 只关**媒体组件**品牌，不影响站点品牌。
  const rawApp = String(q.get('appname') == null ? '' : q.get('appname'))
  const rawBrand = String(q.get('brand') == null ? '' : q.get('brand'))
  const appname = !(/^(upstream|0|false|off|no)$/i.test(rawApp) || /^upstream$/i.test(rawBrand))
  return { ppark: on('ppark', true), clocklock: on('clocklock', true), clockdrag: on('clockdrag', true), brand: on('brand', true), appname }
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

/* ============================ 第七批纯函数层（插件同款目录/文件选择器 + 滚动位置稳定 + 文档视图轨道） ============================
   用户原话两条：
     ①「去引用我的上游的 DSH 插件那样同款的选择文件夹的功能，包括选择文件也是的」
       「选择文件夹时，鼠标上下滑动，画面有时候会自动弹跳到最顶上，有时候会自动锁定到最顶上」
     ②「README 界面下方约 1/5 区域无法显示内容（像被切掉）」
   这一层只有纯函数（Node 可直接 import 断言，无 DOM）；DOM 壳子在 init() 的「第七批」段落里。
   参考实现（**只借鉴"锚点 + 偏移"这一条滚动稳定技巧与选择器交互契约**，未复制任何代码；
   Lucide 图标见 docs/ICONS-NEEDED.md，台账见 docs/COPYING-RULES.md §4）：
     · TanStack Virtual（MIT）—— measureElement/scrollToOffset：滚动位置由"锚定条目 + 偏移"表达，
       条目高度变化时按锚点回推 scrollTop，而不是按比例（本层的 pickerRestoreScroll 就是这条）；
     · Firefox/Blink 的 CSS Scroll Anchoring（overflow-anchor）—— 浏览器自己也会"调 scrollTop"，
       这正是"有时候自动弹跳"的来源 ⇒ 列表容器必须 overflow-anchor:none（CSS 侧，见产物 CSS 追加段）；
     · DSH 插件 dsh-mpkg-wallpaper/lib/client.js:7014-7022/7464-7511 的目录选择器
       —— 交互契约（当前目录 + 上级 + 子目录列表 + "选择此文件夹"）与我们这层一一对应；
       它那里的两道补丁（按比例恢复 / 600ms 内让位）是被同一个根因逼出来的绕路，
       本层换成"锚点 + 偏移 + 写回期间不认自己的 scroll 事件"，见 pickerScrollGuard。 */

/** 归一化浏览器给的选择器路径：统一 '/'、去掉空段与 './'、保留大小写（纯函数） */
export function pickerPath(raw) {
  return String(raw == null ? '' : raw).replace(/\\/g, '/').split('/').filter((s) => s && s !== '.').join('/')
}

/** 索引的根名：取"带层级的第一条路径"的第一段（webkitdirectory 的 webkitRelativePath 必带根目录名）。
 *  只有散文件（单文件选择）⇒ 返回 ''（调用方按"这不是文件夹选择"处理）。 */
export function pickerRootOf(dirs, files) {
  const cand = []
  for (const d of (dirs || [])) if (String(d.path).indexOf('/') >= 0) { cand.push(String(d.path)); break }
  for (const f of (files || [])) if (String(f.path).indexOf('/') >= 0) { cand.push(String(f.path)); break }
  return cand.length ? cand[0].split('/')[0] : ''
}

/**
 * 把一次「授权选择」拿到的东西折成**可浏览的索引**（纯函数）：
 *   entries: [{ path, file?, getFile? }]（webkitdirectory 的 File / showDirectoryPicker 的 handle 包装）
 * 返回 { root, dirs:[{path,name,depth}], files:[{path,name,dir,ext,file,getFile}], truncated }
 * 说明：浏览器里**没有**"列任意目录"的能力，唯一合法来源就是用户授权过的那棵树
 *   —— 这正是本选择器与插件（Node 侧 /list-dirs）的差别：插件的宿主能直接读盘，网页不能。
 */
export function buildPickerIndex(entries, opt) {
  const o = Object.assign({ maxFiles: 6000, maxDepth: 8 }, opt || {})
  const dirMap = new Map()
  const files = []
  let truncated = false
  for (const e of (entries || [])) {
    const p = pickerPath(e && (e.path || e.name))
    if (!p) continue
    const parts = p.split('/')
    if (parts.length > o.maxDepth) { truncated = true; continue }
    if (files.length >= o.maxFiles) { truncated = true; break }
    for (let i = 1; i < parts.length; i++) {
      const dp = parts.slice(0, i).join('/')
      if (!dirMap.has(dp)) dirMap.set(dp, { path: dp, name: parts[i - 1], depth: i - 1 })
    }
    const name = parts[parts.length - 1]
    files.push({
      path: p, name, dir: parts.slice(0, -1).join('/'),
      ext: (name.indexOf('.') > 0 ? name.split('.').pop() : '').toLowerCase(),
      file: (e && e.file) || null, getFile: (e && e.getFile) || null,
    })
  }
  const dirs = [...dirMap.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { root: pickerRootOf(dirs, files), dirs, files, truncated: truncated || files.length >= o.maxFiles }
}

/** 当前目录名归一化：'' / 根名 / 已存在目录名 都接受；非法值一律折回根（纯函数） */
export function pickerResolveDir(index, cwd) {
  if (!index) return ''
  const root = String(index.root || '')
  const want = pickerPath(cwd)
  if (!want || want === '.' || want === root) return root
  const rel = want.indexOf(root + '/') === 0 ? want.slice(root.length + 1) : want
  const full = root ? root + '/' + rel : rel
  for (const d of index.dirs) if (d.path === full) return full
  return root
}

/** 上级目录（根 ⇒ 根自己；纯函数） */
export function pickerParentOf(cwd, root) {
  const cur = pickerPath(cwd)
  const r = String(root || '')
  if (!cur || cur === r) return r
  const parts = cur.split('/')
  parts.pop()
  const up = parts.join('/')
  return (r && (up === r || up.indexOf(r + '/') === 0)) ? up : r
}

/** 目录视图（纯函数）：子目录 + 当前目录下的文件 + 上级。
 *  列表行的形状统一成 {name, path, kind:'dir'|'file', ext}，方便过滤/锚点/增量渲染共用。 */
export function pickerView(index, cwd) {
  if (!index) return null
  const cur = pickerResolveDir(index, cwd)
  const prefix = cur ? cur + '/' : ''
  const dirs = []
  for (const d of index.dirs) {
    if (d.path.indexOf(prefix) !== 0) continue
    if (d.path.slice(prefix.length).indexOf('/') >= 0) continue
    dirs.push({ name: d.name, path: d.path, kind: 'dir', ext: '' })
  }
  const files = []
  for (const f of index.files) {
    if (f.dir !== cur) continue
    files.push({ name: f.name, path: f.path, kind: 'file', ext: f.ext, file: f.file, getFile: f.getFile })
  }
  return { cwd: cur, root: String(index.root || ''), parent: pickerParentOf(cur, index.root), isRoot: cur === String(index.root || ''), dirs, files }
}

/** 导航（纯函数）：target = '..' 上级 / '/' 最上层 / 子目录名或路径。
 *  返回 { cwd, moved, reason }——非法目标不动（reason 说明原因），调用方据此决定是否重绘。 */
export function pickerNavigate(index, cwd, target) {
  if (!index) return { cwd: '', moved: false, reason: 'no-index' }
  const cur = pickerResolveDir(index, cwd)
  const t = pickerPath(target)
  if (t === '..') {
    const up = pickerParentOf(cur, index.root)
    return { cwd: up, moved: up !== cur, reason: up !== cur ? 'up' : 'at-root' }
  }
  if (t === '/' || t === '' || t === '.') {
    return { cwd: String(index.root || ''), moved: cur !== String(index.root || ''), reason: 'home' }
  }
  const base = cur ? cur + '/' : ''
  const full = t.indexOf(String(index.root || '') + '/') === 0 ? t : base + t
  for (const d of index.dirs) if (d.path === full) return { cwd: full, moved: full !== cur, reason: 'enter' }
  return { cwd: cur, moved: false, reason: 'not-a-dir' }
}

/** 名称过滤（纯函数；大小写不敏感的子串）。空查询 ⇒ 原样返回（不重排、不新建数组语义）。
 *  ⚠ 过滤只改"行集合"，**不碰滚动位置**——滚动由锚点逻辑负责（这正是"过滤后不跳顶"的断言点）。 */
export function filterPickerRows(rows, query) {
  const list = rows || []
  const q = String(query == null ? '' : query).trim().toLowerCase()
  if (!q) return list.slice()
  return list.filter((r) => String(r && r.name ? r.name : '').toLowerCase().indexOf(q) >= 0)
}

/**
 * 滚动锚点：找出"第一个可见行"及其相对滚动容器顶边的偏移（纯函数，只吃矩形）。
 *   rects: [{top,bottom}] 行矩形（视口坐标）；containerRect: {top,bottom}
 * 为什么用锚点而不是比例：行高不一致（名字 + 类型两行）时比例恢复会漂；锚点 + 偏移是精确解。
 */
export function pickerAnchor(rects, containerRect) {
  const list = rects || []
  const ct = Number(containerRect && containerRect.top)
  if (!isFinite(ct)) return null
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (!r) continue
    if (Number(r.bottom) > ct + 1) return { index: i, offset: Number(r.top) - ct }
  }
  return null
}

/**
 * 重绘后的 scrollTop（纯函数）：锚点行回到原偏移；锚点行没了 ⇒ **夹住原 scrollTop**，
 * 绝不回 0。返回 { scrollTop, reason }：
 *   'anchor'  锚点行还在 → 精确回位（内容整体上移/下移都不跳）
 *   'clamp'   锚点行被过滤掉/删了 → 保留原有位置（夹到 [0, max]）——这是"跳顶/锁顶"的正面防线
 *   'noop'    非有限输入 ⇒ 不动
 */
export function pickerRestoreScroll(plan) {
  const p = plan || {}
  const max = Math.max(0, Number(p.scrollHeight || 0) - Number(p.clientHeight || 0))
  const prev = Number(p.prevScrollTop)
  const keep = isFinite(prev) ? Math.min(Math.max(0, prev), max) : 0
  // ①(第七批 修，2026-09-17 无头 Firefox 探针实测)「锚点行已被过滤/删除」时调用方传的是 **null**，
  //   必须当成"没有锚点"。原写法 `Number(null)` = 0 且 isFinite(0) = true ⇒ 被当成有效锚点算 top−off，
  //   结果为负再夹到 0，表现正是用户报的「鼠标上下滑动时画面自动弹跳到最顶上」（探针：真弹窗
  //   setPickerFilter 后 scrollTop 300 → 0，reason 还被记成 'anchor'）；"锁在最顶上"则是同一个 0 被
  //   后面的恢复逻辑反复写回。⇒ 这一条同时挡住两种症状。
  const top = (p.anchorContentTop == null || p.anchorContentTop === '') ? NaN : Number(p.anchorContentTop)
  const off = (p.anchorOffset == null || p.anchorOffset === '') ? NaN : Number(p.anchorOffset)
  if (!isFinite(top) || !isFinite(off)) return { scrollTop: keep, reason: isFinite(prev) ? 'clamp' : 'noop' }
  return { scrollTop: Math.min(Math.max(0, top - off), max), reason: 'anchor' }
}

/** 程序化恢复要不要让位给用户（纯函数）。用户刚滚过（默认 700ms 内）⇒ 一个字都不许写 scrollTop。
 *  插件侧的绕路是"按比例恢复 + 600ms 内让位"（client.js:7019-7022）；让位这条是对的，比例那条不要。 */
export function pickerScrollGuard(env) {
  const e = env || {}
  const win = e.windowMs == null ? 700 : Number(e.windowMs)
  const last = Number(e.lastUserScrollAt)
  const now = Number(e.now)
  if (!isFinite(last) || last <= 0) return { skip: false, reason: 'no-user-scroll' }
  if (!isFinite(now)) return { skip: false, reason: 'no-clock' }
  return (now - last) < win ? { skip: true, reason: 'user-scrolling' } : { skip: false, reason: 'idle' }
}

/**
 * 键盘导航决策（纯函数）—— 与插件侧同一行为契约（Esc 关 / ↑↓ 移动 / Enter 激活或确认）。
 * env: { key, rows, index }（index = 当前游标，-1 = 还没选任何行）
 * 返回 { action, index }：
 *   'close'    Esc —— 关弹窗（不写任何状态）
 *   'next'/'prev'  ↑↓ —— 在行集合内移动，到头就停（不绕圈；行集合为空 ⇒ 'none'）
 *   'activate' Enter 且游标在某行 ⇒ 激活那一行（目录=进入 / 文件=选中）
 *   'confirm'  Enter 但没游标 ⇒ 等同底部按钮（目录模式=就选这个文件夹）
 *   'none'     其它键一律不接管（过滤框照常输入）
 */
export function pickerKeyAction(env) {
  const e = env || {}
  const key = String(e.key || '')
  const rows = Math.max(0, Number(e.rows) || 0)
  const cur = Number(e.index)
  const idx = isFinite(cur) ? cur : -1
  if (key === 'Escape' || key === 'Esc') return { action: 'close', index: idx }
  if (key === 'ArrowDown') return rows ? { action: 'next', index: Math.min(rows - 1, idx + 1) } : { action: 'none', index: idx }
  if (key === 'ArrowUp') return rows ? { action: 'prev', index: Math.max(0, idx - 1) } : { action: 'none', index: idx }
  if (key === 'Enter') return (idx >= 0 && idx < rows) ? { action: 'activate', index: idx } : { action: 'confirm', index: idx }
  return { action: 'none', index: idx }
}

/** 增量渲染的键差（纯函数）：只为证明"重绘不等于清空容器"。
 *  返回 { add, remove, keep, order }——DOM 侧按 add 建新节点、remove 删旧节点、keep 复用并原地移动。 */
export function pickerRowDiff(prevKeys, nextKeys) {
  const prev = (prevKeys || []).map(String)
  const next = (nextKeys || []).map(String)
  const pset = new Set(prev), nset = new Set(next)
  return {
    add: next.filter((k) => !pset.has(k)),
    remove: prev.filter((k) => !nset.has(k)),
    keep: next.filter((k) => pset.has(k)),
    order: next.slice(),
  }
}

/** input.accept → 扩展名集合（纯函数）。'image/*,.png' ⇒ {any:['image/'], ext:['png']} */
export function pickerAcceptKinds(accept) {
  const out = { any: [], ext: [] }
  for (const raw of String(accept == null ? '' : accept).split(',')) {
    const s = raw.trim().toLowerCase()
    if (!s) continue
    if (s.indexOf('/') >= 0) out.any.push(s)
    else if (s.indexOf('.') === 0) out.ext.push(s.slice(1))
  }
  return out
}

/** 文件名是否符合 accept（纯函数）。kinds 为空 ⇒ 全通过（"选择文件"的默认口径）。 */
export function pickerAcceptMatch(name, kinds) {
  const n = String(name == null ? '' : name).toLowerCase()
  const k = kinds || { any: [], ext: [] }
  if (!k.any.length && !k.ext.length) return true
  const ext = n.indexOf('.') > 0 ? n.split('.').pop() : ''
  if (k.ext.indexOf(ext) >= 0) return true
  for (const a of k.any) {
    const head = a.split('/')[0]
    if (head === '*') return true
    if (head === 'image' && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'].indexOf(ext) >= 0) return true
    if (head === 'audio' && ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac', 'opus'].indexOf(ext) >= 0) return true
    if (head === 'video' && ['mp4', 'webm', 'mov', 'm4v', 'mkv'].indexOf(ext) >= 0) return true
  }
  return false
}

/**
 * ②「README 面板下方约 1/5 被切」的**布局决策**（纯函数）。
 * 根因：`#main{display:grid;grid-template-rows:auto minmax(0,1fr) 200px}` 是三条**显式轨道**。
 *   文档视图下 bundle 把 `#editor-chrome` 与 `#logs` 都设成 `hidden`（display:none）⇒
 *   ① `#workspace` 被自动放置顶到第 1 条（`auto`）轨道，第 2 条 `minmax(0,1fr)` 空着；
 *   ② 第 3 条 `200px` 是固定轨道：**没有条目也照样占 200px**。
 *   ⇒ 面板高度 = main − 200px，底部整整 200px 死区（800px 视口 = 25%，常见窗口高 ≈1/5）。
 * 修法：CSS 把三个子元素**钉死**在 1/2/3 轨道（`grid-row`），并给"只剩文档视图"的 #main 挂一个类，
 *   把两条空轨道收成 0；轨道值本身仍由 CSS 决定（JS 不写内联 grid-template-rows，免得
 *   把 bundle 自己的 `#main.logs-collapsed{…35px}` 压掉）。
 */
export function mainViewPlan(env) {
  const e = env || {}
  const chrome = e.chromeVisible !== false
  const logs = e.logsVisible !== false
  const docsOnly = !chrome && !logs
  return { docsOnly, cls: docsOnly ? 'bench-view-docs' : '', reason: docsOnly ? 'docs-only' : (chrome ? 'stage' : 'chrome-hidden') }
}

/* ============================ 浏览器初始化 ============================ */
// 对外钩子：源码侧 bench/bench.ts 在语言切换 / 分辨率变更 / 指针注入开关变化时调用
// （window.__benchPatch?.xxx）。三个钩子都是幂等的，重复调用无害。
/* ═══════════════════ ⑩ 站点外壳（site header tab / 设置弹层 / 壁纸切换栏 / 控制台拖动） ═══════════════════
   用户 2026-09-17 新样式（docs/newstyle.md 的 ASCII 稿）：
     顶部 tab：控制台 / 说明 / 壁纸设置                       设置 ▾   ☀/🌙
     左：选择壁纸 │ 壁纸参数      右：切换栏+设置1（上） / 壁纸（中） / 控制台（下）
   原则：外壳只碰 DOM 与 class —— 壁纸切换走 bundle 自己的 `li.onclick`，语言走 `#lang`，
   主题走 `#theme-toggle`，属性面板走 bundle 的 `#props` 链路；本层不重实现任何渲染逻辑。
   切页只平移整条 track（不动宽度 ⇒ iframe 不重排、WebGL 不重挂）。 */

/** 纯函数：页面索引 ↔ 平移百分比（越界钳位；count 缺省 3）。 */
export function sitePagePlan(active, count = 3) {
  const c = Math.max(1, Number(count) || 3)
  let i = Number(active)
  if (!Number.isFinite(i)) i = 0
  i = Math.max(0, Math.min(c - 1, Math.round(i)))
  // ①(修正 2026-09-17) 轨道宽度 = count × 视口（CSS `width:300%`），每页 = 100/count %
  //   ⇒ 每页平移 = -(100/count)% 的**轨道宽** = 正好一个视口。
  //   早先写成 -100*i（把一页宽当成整个轨道宽）：轨道只有一页宽 ⇒ overflow/contain 的**裁剪窗口**
  //   跟着轨道一起被移出屏幕 ⇒ 第 2/3 页整页被裁掉（真机：切到「说明/壁纸设置」只看到空白）。
  return { index: i, offsetPercent: -(100 / c) * i, pagePercent: 100 / c }
}

/** 纯函数：从当前列表项算出切换栏计划（当前项置前、其余按库序、上限 limit、过滤掉重复 id）。 */
export function switcherPlan(items, currentId, limit = 12) {
  const list = Array.isArray(items) ? items : []
  const seen = new Set()
  const out = []
  const push = (it) => {
    if (!it || !it.id || seen.has(it.id)) return
    seen.add(it.id); out.push({ ...it, active: it.id === currentId })
  }
  for (const it of list) if (it && it.id === currentId) push(it)
  for (const it of list) push(it)
  return { tabs: out.slice(0, Math.max(1, Number(limit) || 12)), total: out.length, currentId: currentId || null }
}

/** 纯函数：控制台高度钳位（px；<24 视为收起 ⇒ 0）。 */
export function clampLogsHeight(px, viewportH, min = 80, maxFrac = 0.72) {
  const vh = Number(viewportH) > 0 ? Number(viewportH) : 800
  const hi = Math.max(min, Math.round(vh * maxFrac))
  let v = Math.round(Number(px))
  if (!Number.isFinite(v)) v = 220
  if (v < 24) return 0
  return Math.max(min, Math.min(hi, v))
}

/** 站点外壳初始化。ctx = { t, lang, log }（都是可选；缺省安全降级）。 */
export function initSiteShell(ctx = {}) {
  // ①(修正 2026-09-18 门禁抓到) 版本/新 DOM 两个值由**调用方注入**（ctx），不要直接引用模块作用域常量：
  //   它们在浏览器初始化区里声明，而本函数定义在更前面 ⇒ 直接引用会 ReferenceError，被外层 catch 吞掉后
  //   表现为"外壳初始化失败"（静态 CSS 仍在 ⇒ 页面看着还行，但切页/切换栏/拖动全部失效 —— 典型的假绿）。
  const VER = ctx.shellVersion || (typeof window !== 'undefined' && window.__benchShellVersion) || 'bench-shell (unknown)'
  const DOM_NEW = ctx.domIsNew !== undefined ? !!ctx.domIsNew : !!(typeof document !== 'undefined' && document.querySelector && document.querySelector('#pages-track'))
  const tr = typeof ctx.t === 'function' ? ctx.t : ((l, k) => k)
  const curLang = typeof ctx.lang === 'function' ? ctx.lang : (() => 'zh')
  const D = typeof document !== 'undefined' ? document : null
  if (!D) return null
  const q = (sel) => D.querySelector(sel)
  const PAGE_KEY = 'bench-site-page'
  const LOGS_KEY = 'bench-logs-h'
  const PAGES = ['console', 'docs', 'wpset']
  const track = q('#pages-track')
  const tabs = PAGES.map((n) => q('#tab-' + n))
  const ink = q('#site-tab-ink')

  function pageFromName(name) {
    const i = PAGES.indexOf(String(name))
    return sitePagePlan(i < 0 ? 0 : i, PAGES.length)
  }
  function getPage() { return PAGES[pageFromName(readKey(PAGE_KEY) || 'console').index] }
  function readKey(k) { try { return localStorage.getItem(k) } catch { return null } }
  function writeKey(k, v) { try { localStorage.setItem(k, v) } catch { /* 沙箱/隐私模式：忽略 */ } }

  function paintInk(index) {
    if (!ink || !tabs[index]) return
    const el = tabs[index]
    try {
      ink.style.width = el.offsetWidth + 'px'
      ink.style.transform = 'translateX(' + el.offsetLeft + 'px)'
    } catch { /* 桩 DOM 无布局：忽略 */ }
  }
  function pagesEls() { return PAGES.map((n) => q('#page-' + n)) }
  function hideInactive(activeIdx) {
    pagesEls().forEach((el, i) => { if (el) { try { el.style.display = i === activeIdx ? '' : 'none' } catch {} } })
  }
  function setPage(name, persist = true) {
    const plan = pageFromName(name)
    const active = PAGES[plan.index]
    // ①(2026-09-18 用户要求：「左右切换的效果去掉 变成一个个页面(不要加载过程)」)
    //   页签改成**互斥的独立页面**：不再有 300% 宽的轨道、不再有 translateX 动画、也**不再有 340ms 的
    //   "先全部可见、动画结束再隐藏"的定时器**（那 340ms 就是用户说的"加载过程"：切页时另外两页会短暂
    //   跟着动、iframe 还可能盖在上面）。现在切页 = 立刻只显示目标页、其余页 display:none。
    //   为什么用 display 而不是 visibility：用户要的就是"一个个页面"（不在布局里占位）；
    //   画布/iframe 不重建 ⇒ 没有加载过程，切回来时浏览器会给 iframe 发 resize，渲染器自行按新尺寸重算。
    hideInactive(plan.index)
    pagesEls().forEach((el, i) => { if (el) { try { el.setAttribute('aria-hidden', i === plan.index ? 'false' : 'true') } catch {} } })
    if (track) {
      try {
        track.style.transform = ''                    // 清掉历史内联量（旧版补丁可能写过）
        track.setAttribute('data-active', active)
      } catch {}
    }
    tabs.forEach((el, i) => {
      if (!el) return
      const on = i === plan.index
      el.classList.toggle('active', on)
      try { el.setAttribute('aria-selected', on ? 'true' : 'false') } catch {}
    })
    paintInk(plan.index)
    // 切页后给一次布局"唤醒"：目标页里若含 iframe/画布，其视口尺寸从 0 变回真实值，
    // 主动 dispatch 一次 resize 让宿主侧监听器（舞台自适应等）立刻重算，而不是等下一次用户操作。
    try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('resize')) } catch {}
    if (persist) writeKey(PAGE_KEY, active)
    return active
  }

  /* ── 顶部 tab：点击 / 左右方向键（ARIA tablist 惯例） ── */
  tabs.forEach((el, i) => {
    if (!el) return
    el.addEventListener('click', () => setPage(PAGES[i]))
    el.addEventListener('keydown', (e) => {
      const k = e && e.key
      if (k !== 'ArrowRight' && k !== 'ArrowLeft') return
      const next = (i + (k === 'ArrowRight' ? 1 : PAGES.length - 1)) % PAGES.length
      setPage(PAGES[next])
      try { tabs[next].focus() } catch {}
      try { e.preventDefault() } catch {}
    })
  })

  /* ── 设置弹层（语言 / 主题状态 / 后端状态 / 归属与许可） ── */
  const popBtn = q('#settings-btn'), pop = q('#settings-pop')
  let catcher = null
  function popOpen(open) {
    if (!pop || !popBtn) return false
    const on = open === undefined ? pop.hasAttribute('hidden') : !!open
    if (on) pop.removeAttribute('hidden'); else pop.setAttribute('hidden', '')
    try { popBtn.setAttribute('aria-expanded', on ? 'true' : 'false') } catch {}
    // ①(修正 2026-09-18) 弹层打开时铺一层透明"点击捕手"（z-index 低于弹层、高于页面其余部分，**包括同源 iframe**）：
    //   点页面任何地方（含壁纸舞台 iframe 区域）都先命中它 ⇒ 关闭弹层。不依赖焦点/blur（合成事件下 blur 不可靠，
    //   真机上点 iframe 也不一定触发主窗 blur）。
    try {
      if (on) {
        if (!catcher) {
          catcher = D.createElement('div')
          catcher.id = 'settings-catcher'
          catcher.addEventListener('pointerdown', () => popOpen(false))
          catcher.addEventListener('click', () => popOpen(false))
        }
        if (catcher.parentNode !== D.body) D.body.appendChild(catcher)
      } else if (catcher && catcher.parentNode) catcher.parentNode.removeChild(catcher)
    } catch { /* 桩 DOM */ }
    return on
  }
  if (popBtn) popBtn.addEventListener('click', (e) => { try { e.stopPropagation() } catch {}; popOpen() })
  if (pop) pop.addEventListener('click', (e) => { try { e.stopPropagation() } catch {} })
  D.addEventListener('click', () => popOpen(false))
  D.addEventListener('keydown', (e) => { if (e && e.key === 'Escape') popOpen(false) })
  // ①(修正 2026-09-18 独立验证员发现) 点**壁纸舞台**（同源 iframe 内）不会冒泡到主文档 ⇒ 弹层不关。
  //   同源 iframe 获得焦点时主窗口会 blur ⇒ 用它兜底关闭（切到别的窗口/标签也同样关，符合"点外面就关"的直觉）。
  try {
    if (typeof addEventListener === 'function') addEventListener('blur', () => { if (pop && !pop.hasAttribute('hidden')) popOpen(false) })
  } catch {}

  /* 主题 / 后端状态文字：主题看 #theme-toggle 的 data-mode（bundle 写），后端看 #bench-backend-note（bundle 写） */
  const themeBtn = q('#theme-toggle'), themeState = q('#theme-state'), backendState = q('#backend-state'), backendNote = q('#bench-backend-note')
  function paintStatus() {
    const mode = (themeBtn && themeBtn.dataset && themeBtn.dataset.mode) || 'auto'
    if (themeState) themeState.textContent = tr(curLang(), 'theme.' + mode)
    if (backendState) {
      const note = backendNote ? String(backendNote.textContent || '').trim() : ''
      backendState.textContent = note ? note.split('\n')[0] : tr(curLang(), 'nav.backendUnknown')
    }
  }
  try {
    if (themeBtn && typeof MutationObserver === 'function') {
      new MutationObserver(paintStatus).observe(themeBtn, { attributes: true, attributeFilter: ['data-mode'] })
    }
    if (backendNote && typeof MutationObserver === 'function') {
      new MutationObserver(paintStatus).observe(backendNote, { childList: true, characterData: true, subtree: true, attributes: true })
    }
  } catch {}

  /* ── ④ 壁纸切换栏：从 bundle 渲染出的 #list 读取（dataset.id + .title + .active），点击转交 li.onclick ── */
  const listEl = q('#list'), tabsBox = q('#editor-tabs'), addBtn = q('#wp-add')
  let curId = null
  function listItems() {
    if (!listEl) return []
    return [...listEl.querySelectorAll('li[data-id]')].map((li) => ({
      id: String(li.dataset.id || ''),
      title: (li.querySelector('.title')?.textContent || li.textContent || '').trim(),
      active: li.classList.contains('active'),
      el: li,
    }))
  }
  let switcherSig = null
  function refreshSwitcher(force = false) {
    if (!tabsBox || !listEl) return { tabs: 0 }
    const items = listItems()
    const activeItem = items.find((it) => it.active)
    if (activeItem) curId = activeItem.id
    const plan = switcherPlan(items, curId, 12)
    // ①(修正 2026-09-17) **签名守卫**：内容没变就一个 DOM 写都不做。
    //   真机事故：补丁往 #editor-tabs 插 tab → #editor-chrome 变高 → 产物的 stage ResizeObserver 重算 →
    //   又触发 #list 变更事件 → 再插一遍 …… 两个观察者互激成忙循环，页面 load 卡死（探针超时）。
    const sig = JSON.stringify(plan.tabs.map((t) => [t.id, t.title, t.active])) + '|' + String(curId)
    if (!force && sig === switcherSig) return { tabs: plan.tabs.length, total: plan.total, unchanged: true }
    switcherSig = sig
    for (const el of [...tabsBox.querySelectorAll('.wp-tab')]) el.remove()
    for (const it of plan.tabs) {
      const b = D.createElement('button')
      b.type = 'button'; b.className = 'wp-tab' + (it.active ? ' active' : '')
      b.dataset.id = it.id
      b.textContent = it.title || it.id
      b.title = it.title ? it.title + '（' + it.id + '）' : it.id
      b.addEventListener('click', () => { try { it.el.click() } catch {} })
      tabsBox.appendChild(b)
    }
    const cur = q('#current')
    if (cur && activeItem) cur.classList.toggle('active', true)
    // ④ 加号跟随当前壁纸那一项：把它插到"当前 tab"右边（没有 .wp-tab 时跟在 #current 之后）
    try {
      if (addBtn && tabsBox) {
        const activeTab = tabsBox.querySelector('.wp-tab.active')
        const anchor = activeTab || cur
        if (anchor && anchor.nextSibling !== addBtn) tabsBox.insertBefore(addBtn, anchor.nextSibling)
      }
    } catch {}
    return { tabs: plan.tabs.length, total: plan.total }
  }
  try {
    if (listEl && typeof MutationObserver === 'function') {
      let timer = null
      new MutationObserver(() => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; refreshSwitcher() }, 60) })
        .observe(listEl, { childList: true })
    }
  } catch {}
  /* ＋：切回控制台页 + 清过滤 + 把列表滚到顶部（"去左边挑另一张"） */
  if (addBtn) addBtn.addEventListener('click', () => {
    setPage('console')
    const f = q('#filter'); if (f) { f.value = ''; try { f.dispatchEvent(new Event('input', { bubbles: true })) } catch {} }
    if (listEl) { try { listEl.scrollTop = 0 } catch {} }
    for (const li of listEl ? [...listEl.querySelectorAll('li[data-id]')] : []) li.classList.toggle('wp-cur', String(li.dataset.id || '') === curId)
    const firstOther = listEl ? [...listEl.querySelectorAll('li[data-id]')].find((li) => String(li.dataset.id || '') !== curId) : null
    if (firstOther && firstOther.scrollIntoView) { try { firstOther.scrollIntoView({ block: 'center' }) } catch {} }
  })

  /* ── 壁纸参数栏常驻 + 空态（bundle 会按需 hidden 它；新样式里它是一列） ── */
  const propsEl = q('#props'), propsBody = q('#props-body')
  function paintPropsEmpty() {
    if (!propsEl || !propsBody) return
    // ①(修正 2026-09-17) **必须先排除我们自己插的空态节点**再判断"有没有内容"：
    //   否则 空态 = 子节点 → 判成"有内容" → 删掉空态 → 又变空 → 再插…… MutationObserver 自激成死循环
    //   （真机表现：页面 load 卡死、探针超时）。空态节点不算内容，判据里直接滤掉。
    const kids = [...propsBody.children].filter((el) => el.id !== 'props-empty')
    const has = kids.length > 0
    if (propsEl.hasAttribute('hidden')) { try { propsEl.removeAttribute('hidden') } catch {} }
    let empty = propsBody.querySelector('#props-empty')
    // ①(修正 2026-09-17) 状态一致就不写 DOM（同样的观察者互激问题：写 → 观察者 → 再写）
    if (!has && empty && empty.dataset.state === curLang()) return
    if (has && !empty) return
    if (!has) {
      if (!empty) {
        empty = D.createElement('div'); empty.id = 'props-empty'; empty.className = 'props-empty'
        empty.innerHTML = ''
        const a = D.createElement('strong'); a.textContent = tr(curLang(), 'props.emptyState')
        const b = D.createElement('span'); b.textContent = tr(curLang(), 'props.emptyHint')
        empty.appendChild(a); empty.appendChild(b); propsBody.appendChild(empty)
      } else {
        empty.firstChild.textContent = tr(curLang(), 'props.emptyState')
        empty.lastChild.textContent = tr(curLang(), 'props.emptyHint')
      }
      try { empty.dataset.state = curLang() } catch {}
    } else if (empty) empty.remove()
  }
  try {
    if (propsEl && typeof MutationObserver === 'function') {
      let t2 = null
      new MutationObserver(() => { if (t2) clearTimeout(t2); t2 = setTimeout(() => { t2 = null; paintPropsEmpty() }, 80) })
        .observe(propsBody || propsEl, { childList: true })
    }
  } catch {}

  /* ── 控制台：拖动上沿调高度（⑥ 与 8899 demo.html 的日志条同一套手感）+ 双击复位 ── */
  const mainEl = q('#main'), splitter = q('#logs-splitter'), logsEl = q('#logs')
  function logsHeight() {
    const raw = readKey(LOGS_KEY)
    if (raw === 'collapsed') return 0
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 220
  }
  function stageFloorPx() { return 140 }   // 舞台保底高度（窄视口下不许被工具栏/控制台吃光）
  function maxLogsForLayout() {
    if (!mainEl) return 220
    // ①(2026-09-18) 窄屏布局是"文档流堆叠 + 页面内滚动"，舞台不再和 1fr 争高度 ⇒ 不钳制。
    //   判据用**同一个闸门**（`html.bench-narrow`，由 index.html 的 head 同步脚本按视口宽度加），
    //   这里不再重复写一遍宽度阈值：2026-09-18 平板修复把阈值从 860 提到 1180，两处各写一份必然漂移。
    try { if (document && document.documentElement && document.documentElement.classList.contains('bench-narrow')) return 100000 } catch {}
    try {
      const mainH = mainEl.getBoundingClientRect().height
      const chromeH = (q('#editor-chrome') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height
      const rest = mainH - chromeH - 6 - stageFloorPx()
      return Math.max(60, Math.round(rest))
    } catch { return 220 }
  }
  function setLogsHeight(px, persist = true) {
    if (!mainEl) return 0
    // ①(修正 2026-09-18 窄视口塌陷) 上限同时受"给舞台留 140px"约束：真机在 ≤900×620 且控制台展开时
    //   #toolbar 换行长到 337px，把 1fr 吃光 ⇒ 舞台高度 0、壁纸缩到左上角。这里按真实几何钳制。
    const v0 = clampLogsHeight(px, (typeof innerHeight === 'number' ? innerHeight : 800))
    const v = Math.min(v0, maxLogsForLayout())
    mainEl.style.setProperty('--mpw-logs-h', v + 'px')
    const collapsed = v === 0
    try { mainEl.classList.toggle('logs-collapsed', collapsed) } catch {}
    if (logsEl) { try { logsEl.classList.toggle('bench-logs-collapsed-tag', collapsed) } catch {} }
    if (persist) writeKey(LOGS_KEY, collapsed ? 'collapsed' : String(v))
    paintLogsArrow(collapsed)
    return v
  }
  /* ⑦ 箭头语义（用户口径）：**收起后**按钮表示"展开" ⇒ 箭头朝上；展开态表示"收起" ⇒ 箭头朝下。
     这里同时给按钮加文字标签（收起时显示"展开"），避免只有一个箭头时的歧义。 */
  // ⑦ 真机根因（子代理定位，产物 minified `pt()`）：折叠开关被写成
  //   `#toggle-logs.textContent = collapsed ? '▸' : '▾'` —— 写 textContent 会**删掉我们的两个 svg**，
  //   `▸` 是个朝右的三角（用户看到的"向右的箭头"）。用户口径：收起后该按钮表示"展开"，箭头应朝上。
  //   修法：按状态把按钮内容统一成文本字形 —— 收起 = `▴`（点它展开）、展开 = `▾`（点它收起），
  //   与同仓 `demo.html` 的日志条一致（tests/log-panel-collapse-test.mjs:79 同口径）；只在需要时才写，避免观察者自激。
  function paintLogsGlyph(collapsed) {
    const btn = q('#toggle-logs')
    if (!btn) return
    const want = collapsed ? '▴' : '▾'
    try {
      const svg = btn.querySelector && btn.querySelector('svg')
      const cur = (btn.textContent || '').trim()
      if (svg) { btn.textContent = want }            // 产物替换过/还在：统一成文字字形
      else if (cur !== want) btn.textContent = want
    } catch { /* 桩 DOM */ }
  }
  let logsArrowState = null
  function paintLogsArrow(collapsed) {
    const key = (collapsed ? 'c' : 'e') + '|' + curLang() + '|' + (typeof document !== 'undefined' && document.querySelector('#toggle-logs') ? (document.querySelector('#toggle-logs').textContent || '').trim() : '')
    if (key === logsArrowState) return
    logsArrowState = key
    const up = q('#ico-logs-up'), down = q('#ico-logs-down'), btn = q('#toggle-logs')
    if (up && down) {
      if (collapsed) { up.removeAttribute('hidden'); down.setAttribute('hidden', '') }
      else { down.removeAttribute('hidden'); up.setAttribute('hidden', '') }
    }
    if (btn) {
      try { btn.dataset.tag = tr(curLang(), collapsed ? 'logs.expand' : 'logs.collapse') } catch {}
      try { btn.setAttribute('title', tr(curLang(), collapsed ? 'logs.expandTip' : 'logs.collapseTip')) } catch {}
    }
    try { paintLogsGlyph(collapsed) } catch {}
  }
  if (splitter && mainEl) {
    let dragging = false
    const onMove = (e) => {
      if (!dragging) return
      const rect = mainEl.getBoundingClientRect()
      setLogsHeight(rect.bottom - e.clientY)
      try { e.preventDefault() } catch {}
    }
    const stop = () => {
      if (!dragging) return
      dragging = false
      try { splitter.classList.remove('dragging') } catch {}
      D.removeEventListener('pointermove', onMove)
      D.removeEventListener('pointerup', stop)
    }
    splitter.addEventListener('pointerdown', (e) => {
      dragging = true
      try { splitter.classList.add('dragging') } catch {}
      D.addEventListener('pointermove', onMove)
      D.addEventListener('pointerup', stop)
      try { e.preventDefault() } catch {}
    })
    splitter.addEventListener('dblclick', () => setLogsHeight(220))
  }
  /* 收起按钮：bundle 负责切 class，这里在 class 变化后重画箭头（两种路径都覆盖）；
     另外盯按钮自身的内容改写（产物会写 textContent ⇒ 我们的 svg 被删、变成朝右的 ▸）。 */
  try {
    if (mainEl && typeof MutationObserver === 'function') {
      new MutationObserver(() => paintLogsArrow(mainEl.classList.contains('logs-collapsed')))
        .observe(mainEl, { attributes: true, attributeFilter: ['class'] })
      const btnEl = q('#toggle-logs')
      if (btnEl) {
        let gt = null
        new MutationObserver(() => {
          if (gt) clearTimeout(gt)
          gt = setTimeout(() => { gt = null; paintLogsGlyph(mainEl.classList.contains('logs-collapsed')) }, 40)
        }).observe(btnEl, { childList: true, characterData: true, subtree: true })
      }
    }
  } catch {}

  /* ⑪ 新布局里"设置1"（#editor-chrome）与"控制台"（#logs）是常驻区：产物在未选壁纸/文档视图时
     会给它们加 `hidden`（display:none）——外壳模式下统一摘掉，并在产物再次加上时立刻摘掉。 */
  // ①(2026-09-18) 把产物的"活动视图"置成它自己认的 explorer：它的启动恢复读 localStorage['we-bench-view']，
  //   只有**恰好等于 'explorer'** 才走非 docs 分支（见 assets/bench-*.js 的 `O(e)`），否则一律切到 docs（README）。
  try { localStorage.setItem('we-bench-view', 'explorer') } catch {}
  const FORCE_SHOWN = ['#editor-chrome', '#logs', '#sidebar', '#stage-slot', '#stage']
  const FORCE_HIDDEN = ['#docs-view']   // 产物自带的文档视图（原作者 README）：新布局里由「说明」页取代
  function forceChromeVisible() {
    for (const sel of FORCE_SHOWN) {
      const el = q(sel)
      if (el && el.hasAttribute('hidden')) { try { el.removeAttribute('hidden') } catch {} }
    }
    for (const sel of FORCE_HIDDEN) {
      const el = q(sel)
      if (el && !el.hasAttribute('hidden')) {
        try { el.setAttribute('hidden', '') } catch {}
        // 产物刚把视图切到 docs ⇒ 把它的持久化值改回 explorer，避免下一次启动又落 docs
        try { localStorage.setItem('we-bench-view', 'explorer') } catch {}
      }
    }
  }
  forceChromeVisible()
  // 产物的异步恢复可能在补丁初始化之后才跑（真机"一帧后跳 README"就是它）⇒ 稍后再归一化一次视图键，
  // 让它的内部状态（act-docs/act-explorer 高亮、下次启动分支）也回到 explorer。CSS 锁是主修复，这里只是收尾。
  try { setTimeout(() => { try { localStorage.setItem('we-bench-view', 'explorer') } catch {} }, 0) } catch {}
  try { setTimeout(() => { try { localStorage.setItem('we-bench-view', 'explorer') } catch {} }, 800) } catch {}
  try {
    if (typeof MutationObserver === 'function') {
      const mo2 = new MutationObserver(() => forceChromeVisible())
      for (const sel of FORCE_SHOWN.concat(FORCE_HIDDEN)) { const el = q(sel); if (el) mo2.observe(el, { attributes: true, attributeFilter: ['hidden'] }) }
    }
  } catch {}

  /* ①(2026-09-18) 窗口尺寸变化 ⇒ 重新按几何钳制控制台高度（窄窗口下把舞台让出来）。
     用 rAF 去抖，避免拖动窗口时抖动；只在需要变小时改，不会把用户手动调高的值顶回去。 */
  try {
    if (typeof addEventListener === 'function') {
      let rt = null
      addEventListener('resize', () => {
        if (rt) return
        rt = setTimeout(() => {
          rt = null
          try {
            const cur = logsHeight()
            const cap = maxLogsForLayout()
            if (cur > cap) setLogsHeight(cap)
          } catch { /* 忽略 */ }
        }, 120)
      })
    }
  } catch {}

  /* ①(2026-09-18) 版本标记：唯一权威判据是 `<html data-bench-shell-version>` 与 `window.__benchShellVersion`
     （都在模块作用域写入，已验证生效）。这里再把它挂进 api，便于测试与用户核对；不再往状态栏插节点
     ——那一版在真机上静默失败（原因未查明，属非必要装饰，按"宁缺勿假"去掉）。 */

  /* ①(2026-09-18 修正) 这里曾用 JS 算舞台尺寸并写内联；真机实测被后续写入/元素替换吃掉（内联只剩后两条，
     舞台塌成 16px）⇒ 改为**纯 CSS 定高不变量**（见 index.html `.bench-narrow` 块的 `#stage-scale{height:46vh}`），
     少一处失败面。窗口尺寸变化由 CSS 自动跟随，无需 JS。 */

  /* 首次上电 */
  setPage(getPage(), false)
  setLogsHeight(logsHeight(), false)
  paintStatus()
  paintPropsEmpty()
  refreshSwitcher()
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => paintInk(pageFromName(getPage()).index))

  return {
    setPage, getPage, popOpen, refreshSwitcher, listItems,
    logsHeight, setLogsHeight, paintLogsArrow, paintPropsEmpty, paintStatus,
    shellVersion: VER, domIsNew: DOM_NEW, maxLogsForLayout,
  }
}

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
  // 第七批：把「拿到一棵授权树」抽成独立步骤（onEntries 回调），因为选择器需要**整棵树**
  //   （目录 + 文件）才能浏览；旧入口（bundle enterStaticMode / 探针 / 测试）走 loadLocalEntries 不变。
  let localInputCb = null
  function ensureLocalInput() {
    if (localInput) return localInput
    localInput = doc.createElement('input')
    localInput.type = 'file'; localInput.multiple = true
    localInput.setAttribute('webkitdirectory', ''); localInput.setAttribute('directory', '')
    localInput.style.display = 'none'
    localInput.addEventListener('change', () => {
      const fs2 = Array.from(localInput.files || [])
      localInput.value = ''                                      // 允许重复选择同一目录
      const cb = localInputCb; localInputCb = null
      if (!fs2.length) { if (cb) cb(null); return }               // 用户取消：不打印、不清空
      const entries = fs2.map((f) => ({ path: f.webkitRelativePath || f.name, file: f }))
      if (cb) cb(entries)
      else loadLocalEntries(entries)
    })
    doc.body.appendChild(localInput)
    return localInput
  }
  /**
   * 「选择文件夹」（系统对话框）——`onEntries(entries|null)`：entries = [{path,file}]（取消 ⇒ null）。
   * 不传 onEntries 时保持历史行为（直接扫描进本地库）。
   */
  function pickLocalFolder(opt) {
    const cb = (opt && typeof opt.onEntries === 'function') ? opt.onEntries : null
    if (canPickViaInput()) { localInputCb = cb; ensureLocalInput().click(); return true }
    if (canShowDirPicker()) { pickLocalFolderViaHandle(cb); return true }
    logLine(t(curLang, 'local.unsupported'), true)
    if (cb) cb(null)
    return false
  }
  /** showDirectoryPicker（Chromium）：递归取回 {path,getFile}（惰性，不读内容），与 webkitdirectory 同一条链。
   *  onlyWallpaper=true 时只收 scene.pkg/project.json（旧行为：直接扫描）。 */
  async function walkHandle(root, opt) {
    const o = Object.assign({ maxDepth: 6, maxFiles: 4000, onlyWallpaper: false }, opt || {})
    const out = []
    const walk = async (dir, prefix, depth) => {
      if (depth > o.maxDepth || out.length > o.maxFiles) return
      for await (const handle of dir.values()) {
        const path = prefix ? prefix + '/' + handle.name : handle.name
        if (handle.kind === 'directory') await walk(handle, path, depth + 1)
        else if (handle.kind === 'file') {
          const hit = !o.onlyWallpaper || /^(scene\.pkg|project\.json)$/i.test(handle.name)
          if (hit) out.push({ path: root.name + '/' + path, getFile: () => handle.getFile() })
        }
      }
    }
    await walk(root, '', 0)
    return out
  }
  /** showDirectoryPicker 兜底（Chromium）：递归取回 {path,file}，与 webkitdirectory 走同一条扫描链 */
  async function pickLocalFolderViaHandle(cb) {
    try {
      const root = await window.showDirectoryPicker()
      const entries = await walkHandle(root, { onlyWallpaper: true })
      // 旧链路要 File（loadLocalEntries 直接读 project.json 文本）⇒ 这里当场取回
      for (const e of entries) { try { e.file = await e.getFile() } catch { e.file = null } }
      if (cb) cb(entries)
      else loadLocalEntries(entries)
    } catch (e) {
      if (e && (e.name === 'AbortError')) { if (cb) cb(null); return }   // 用户取消
      logLine(t(curLang, 'local.unsupported') + ' — ' + String(e && e.message), true)
      if (cb) cb(null)
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
      if (!pickLibBtn.disabled) { e.preventDefault(); e.stopImmediatePropagation(); openLibraryPicker() }
    }, true)   // 捕获阶段：抢在 bundle 的 /api/library-dir 之前走纯前端路径
  }
  const clearLocalBtn = $('#clear-local')
  if (clearLocalBtn) clearLocalBtn.addEventListener('click', () => clearLocalLibrary(false))

  /* ==================== 第七批：插件同款选择器（文件夹 / 文件）+ 滚动位置稳定 ====================
     同款交互（对照 dsh-mpkg-wallpaper/lib/client.js:9856-9906 的目录选择弹窗）：
       标题 + 当前目录 + 「回到最上层 / 上一级」+ 子目录列表 + 底部「就选这个文件夹 / 取消」；
       列表限高可滚动；单击目录进入；过滤框筛名字。
     数据来源的**唯一**差别：插件跑在 DSH 宿主里，宿主能直接读盘（/list-dirs?path=…）；
       网页没有这个能力 —— 只能浏览**用户自己授权过的那棵树**
       （webkitdirectory 全选 或 showDirectoryPicker；两者都没有 ⇒ 按老规矩明说不可用）。
     滚动为什么以前会跳顶/锁顶（三条根因，逐条都有对应修法）：
       ① 旧代码 `localBox.innerHTML = ''` 整块重建列表 ⇒ 容器内容瞬间变空，浏览器把 scrollTop
          夹到 0（异步扫描返回后再重建一次 ⇒ 用户滑到一半就被"弹回顶上"）；
          ⇒ 现在**只做按键增量更新**（pickerRowDiff：复用节点、只增删差集，appendChild 原地排序），
            并保证"列表里内容高度突变"这件事本身不再发生。
       ② 重绘后没有任何"回位"逻辑；而浏览器自带的 CSS 滚动锚定（overflow-anchor）会按**它自己的**
          启发式改 scrollTop —— 它挑的锚点与用户的视线不一致时就表现为"有时候自动弹跳"；
          ⇒ 容器 `overflow-anchor:none` 让浏览器退场，改成我们自己的"锚点行 + 偏移"精确回位
            （pickerRestoreScroll；锚点行没了就夹住原位置，**绝不回 0**）。
       ③ 插件那条老路（按比例恢复 + 恢复逻辑与用户滚轮打架）会把"用户正在滚"当成"该恢复"，
          表现为"锁在最顶上"；⇒ 用户刚滚过 700ms 内一个字都不写 scrollTop（pickerScrollGuard），
          并且程序化写入期间的 scroll 事件不计入"用户在滚"（否则自己把自己锁住）。
       另外两条小纪律：行**不**调用 focus()（打字机式的 focus 会把滚动容器滚到顶）、
       弹窗自身 focus({preventScroll:true})；点行用 pointerdown 锁定目标、click 时用锁定值
       （列表重排时不会点错行 —— 插件 client.js:9883-9891 的同款教训）。 */
  const BENCH_PICK_CSS = [
    '/* 第七批：选择器（单源在 bench-patch.js，运行期注入 —— :8902 宿主的产物 CSS 实际取不到，',
    '   只往产物 CSS 里追加的话那边就没样式） */',
    '.bench-dirbox{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;',
    'background:rgba(0,0,0,.45);font-family:var(--ui-font,-apple-system,"Segoe UI","Noto Sans CJK SC",sans-serif);color:var(--fg,#ccc)}',
    '.bench-dirbox-win{width:min(580px,92vw);max-height:min(80vh,660px);display:flex;flex-direction:column;overflow:hidden;',
    'border:1px solid var(--widget-border,#3c3c3c);border-radius:6px;background:var(--panel,#1b1b1b);box-shadow:0 18px 48px rgba(0,0,0,.55)}',
    '.bench-dirbox-head{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--hairline,#2b2b2b)}',
    '.bench-dirbox-title{flex:1;min-width:0;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.bench-dirbox-x{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;',
    'border:1px solid var(--widget-border,#3c3c3c);border-radius:3px;background:var(--input,#313131);color:inherit}',
    '.bench-dirbox-path{padding:6px 12px 0;font-family:var(--mono,monospace);font-size:11px;color:var(--fg-dim,#9d9d9d);word-break:break-all}',
    '.bench-dirbox-tools{display:flex;align-items:center;gap:6px;padding:7px 12px}',
    '.bench-dirbox-tools button{height:24px;padding:0 8px;display:inline-flex;align-items:center;gap:4px;cursor:pointer;',
    'border:1px solid var(--widget-border,#3c3c3c);border-radius:3px;background:var(--input,#313131);color:inherit;font-size:11px}',
    '.bench-dirbox-tools button:disabled{opacity:.45;cursor:default}',
    '.bench-dirbox-filter{flex:1;min-width:0;height:24px;padding:0 8px;border:1px solid var(--widget-border,#3c3c3c);border-radius:3px;',
    'background:var(--input,#313131);color:inherit;font-size:11.5px}',
    '.bench-dirbox-filter:focus{border-color:var(--fg,#ccc);outline:none}',
    '/* overflow-anchor:none = 让浏览器自带的滚动锚定退场（"有时候自动弹跳"的另一半根因） */',
    '.bench-dirbox-list{flex:1 1 auto;min-height:132px;max-height:46vh;overflow-y:auto;overflow-anchor:none;padding:4px 6px;',
    'border-top:1px solid var(--hairline,#2b2b2b);border-bottom:1px solid var(--hairline,#2b2b2b)}',
    '.bench-dirbox-row{display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:3px;font-size:12px;cursor:pointer;',
    'user-select:none;-webkit-user-select:none}',
    '.bench-dirbox-row:hover{background:var(--hover,rgba(255,255,255,.07))}',
    '.bench-dirbox-row.on{background:var(--accent,#0078d4);color:#fff}',
    '.bench-dirbox-row svg{flex:none;opacity:.85}',
    '.bench-dirbox-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.bench-dirbox-sub{flex:none;font-size:10px;opacity:.6}',
    '.bench-dirbox-empty{padding:10px 8px;font-size:11.5px;line-height:1.6;opacity:.7}',
    '.bench-dirbox-note{padding:6px 12px 0;font-size:10.5px;line-height:1.6;color:var(--fg-mute,#6e6e6e)}',
    '.bench-dirbox-foot{display:flex;align-items:center;gap:8px;padding:8px 12px}',
    '.bench-dirbox-count{flex:1;font-size:11px;color:var(--fg-dim,#9d9d9d)}',
    '.bench-dirbox-go{height:26px;padding:0 12px;display:inline-flex;align-items:center;gap:5px;cursor:pointer;',
    'border:1px solid var(--widget-border,#3c3c3c);border-radius:3px;background:var(--accent,#0078d4);color:#fff;font-size:11.5px}',
    '.bench-dirbox-go:disabled{opacity:.45;cursor:default}',
    '.bench-dirbox-go2{background:var(--input,#313131);color:inherit}',
    '/* ② README 面板被切：三条显式轨道与三个子元素钉死（顺序不再随 display:none 漂移）；',
    '   只剩文档视图时把两条空轨道收成 0px（改动前的 200px 死区就是这么来的） */',
    '#main > #editor-chrome{grid-row:1}',
    '#main > #workspace{grid-row:2}',
    '#main > #logs{grid-row:3}',
    '#main.bench-view-docs{grid-template-rows:0px minmax(0,1fr) 0px}',
  ].join('')
  function injectBenchPickerStyle() {
    try {
      if (!doc.head || $('#bench-pick-style')) return false
      const st = doc.createElement('style')
      st.id = 'bench-pick-style'
      st.textContent = BENCH_PICK_CSS
      doc.head.appendChild(st)
      return true
    } catch { return false }
  }
  const BENCH_STYLE_INJECTED = injectBenchPickerStyle()

  /* ═══════════ ⑩ 站点外壳（2026-09-17 新样式 docs/newstyle.md） ═══════════
     顶部 site header（tab：控制台/说明/壁纸设置 + 设置弹层 + 深色浅色切换）
     中部三列：选择壁纸 │ 壁纸参数 │ 右侧（切换栏+设置1 / 壁纸 / 控制台）
     底部状态栏。切页 = 整条 track 平移（只 transform，不改宽度 ⇒ iframe 不重排）。 */
  // ①(2026-09-18) 窄屏/手机自适应的 @media 规则**只放在 index.html 的静态表里**（`#bench-shell-static`）：
  //   静态表是首屏权威、且 D8 比对会跳过 @media 条目；这里不再重复，避免两处漂移。
  const SITE_LAYOUT_CSS = [
    /* 外壳 */
    'body{display:flex!important;flex-direction:column;grid-template-rows:none!important}',
    '#site-header{flex:none;height:44px;display:flex;align-items:center;gap:14px;padding:0 12px;background:var(--titlebar);border-bottom:1px solid var(--border);position:relative;z-index:30}',
    '#site-brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--fg);white-space:nowrap}',
    '.brand-dot{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,var(--accent,#0078d4),#7dd3fc)}',
    '#app-version{font-size:11px;color:var(--fg-mute);font-weight:400}',
    '#site-tabs{position:relative;display:flex;align-items:stretch;height:100%}',
    '.site-tab{appearance:none;border:0;background:transparent;color:var(--fg-dim);font:inherit;font-size:13px;padding:0 14px;cursor:pointer;border-bottom:2px solid transparent}',
    '.site-tab:hover{color:var(--fg)}',
    '.site-tab.active{color:var(--fg);border-bottom-color:transparent}',
    '#site-tab-ink{position:absolute;bottom:0;left:0;height:2px;width:0;background:var(--accent,#0078d4);transition:none;pointer-events:none}',
    '#site-actions{margin-left:auto;display:flex;align-items:center;gap:8px;position:relative}',
    '#settings-btn{appearance:none;font:inherit;font-size:12.5px;color:var(--fg);background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer}',
    '#settings-btn:hover,#settings-btn[aria-expanded="true"]{background:var(--accent,#0078d4);border-color:var(--accent,#0078d4);color:#fff}',
    '#site-actions .theme-btn{width:30px;height:26px;border-radius:6px}',
    '#settings-pop{position:absolute;right:0;top:calc(100% + 6px);width:330px;background:var(--panel);border:1px solid var(--border);border-radius:8px;box-shadow:0 14px 40px rgba(0,0,0,.38);padding:10px 12px;z-index:40;display:flex;flex-direction:column;gap:8px;font-size:12.5px}',
        '#settings-catcher{position:fixed;inset:0;z-index:35;background:transparent}',
'#settings-pop[hidden]{display:none!important}',
    '.pop-row,.lang-box{display:flex;align-items:center;gap:8px}',
    '.pop-k{color:var(--fg-mute);min-width:44px}',
    '.pop-val{color:var(--fg)}',
    '.pop-note{margin:2px 0 0;color:var(--fg-mute);font-size:11.5px;line-height:1.6}',
    '.pop-credit{margin-top:2px;padding-top:8px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--fg-mute)}',
    '.pop-credit a{color:var(--link,var(--accent,#58a6ff))}',
    /* 三页滑动轨道 */
    '#pages-track{flex:1 1 auto;width:auto;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;contain:paint;transform:none!important;transition:none!important}',
    '.page{flex:1 1 auto;width:100%;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}',
    '#page-docs,#page-wpset{overflow-y:auto;background:var(--editor)}',
    /* 工作台三列 */
    '#workbench{flex:1;grid-template-columns:var(--mpw-lib-w,300px) auto minmax(0,1fr)!important;min-height:0;overflow:hidden}',
    '#activitybar{display:none!important}',
    '#sidebar{grid-column:1;width:auto!important;max-width:none!important;min-width:0!important;resize:none!important}',
    '#props{grid-column:2;width:var(--mpw-props-w,320px);min-width:0;border-left:1px solid var(--border);border-right:1px solid var(--border)}',
    '#props[hidden]{display:flex!important}',
    '.props-empty{padding:14px 12px;color:var(--fg-mute);font-size:12.5px;line-height:1.75}',
    '.props-empty strong{display:block;color:var(--fg-dim);margin-bottom:4px}',
    '#toolbar{max-height:30vh;overflow-y:auto}',
    '#main{grid-column:3;grid-template-rows:auto minmax(140px,1fr) 6px minmax(60px,var(--mpw-logs-h,220px))!important}',
    '#main.logs-collapsed{grid-template-rows:auto minmax(0,1fr) 6px 34px!important}',
    '#editor-chrome{grid-row:1}',
    '#workspace{grid-row:2}',
    '#main > #logs-splitter{grid-row:3;cursor:row-resize;background:var(--border);opacity:.55}',
    '#logs-splitter:hover,#logs-splitter.dragging{background:var(--accent,#0078d4);opacity:1}',
    '#main > #logs{grid-row:4}',
    /* ④ 壁纸切换栏（设置1 上方） */
    '#wp-switch{display:flex;align-items:stretch;background:var(--sidebar);border-bottom:1px solid var(--border)}',
    '#editor-tabs{flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;height:32px;border-bottom:0;scrollbar-width:thin}',
    '#editor-tabs .tab{height:32px;font-size:12.5px}',
    '.wp-tab{max-width:200px;display:flex;align-items:center;gap:6px;padding:0 10px;font:inherit;font-size:12.5px;color:var(--fg-dim);background:transparent;border:0;border-right:1px solid var(--border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}',
    '.wp-tab:hover{background:var(--hover,rgba(255,255,255,.07));color:var(--fg)}',
    '.wp-tab.active{background:var(--editor);color:var(--fg);box-shadow:inset 0 -2px 0 var(--accent,#0078d4)}',
    '.wp-tab.wp-cur{opacity:.45}',
    '#wp-add{flex:none;width:34px;border:0;border-left:1px solid var(--border);background:transparent;color:var(--fg-dim);font-size:16px;line-height:1;cursor:pointer}',
    '#wp-add:hover{background:var(--accent,#0078d4);color:#fff}',
    /* ⑦ 输出按钮：折叠态给文字标签，箭头朝上（展开）/朝下（收起） */
    '#toggle-logs{gap:4px;width:auto!important;padding:0 6px!important}',
    '#logs.bench-logs-collapsed-tag #toggle-logs::after{content:attr(data-tag);font-size:11px;color:var(--fg-dim)}',
    /* ⑧ 全屏按钮在浅色主题下也必须看得见（原先只定义了 :hover，浅色下是黑底黑字） */
    '.stage-tools button{color:var(--fg)!important;background:color-mix(in srgb,var(--panel) 86%,transparent);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer}',
    '.stage-tools button:hover{background:var(--accent,#0078d4)!important;border-color:var(--accent,#0078d4);color:#fff!important}',
    /* 文档页排版（说明 / 壁纸设置） */
    '.doc-wrap{max-width:1020px;margin:0 auto;padding:22px 28px 64px;font-size:13.5px;line-height:1.75;color:var(--fg)}',
    '.doc-wrap h1{font-size:20px;margin:6px 0 10px}',
    '.doc-wrap h2{font-size:14.5px;margin:22px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border)}',
    '.doc-lede{color:var(--fg-dim);font-size:13px}',
    '.doc-wrap table{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0 4px}',
    '.doc-wrap th,.doc-wrap td{text-align:left;vertical-align:top;padding:6px 9px;border-bottom:1px solid var(--border)}',
    '.doc-wrap th{color:var(--fg-mute);font-weight:500}',
    '.doc-wrap code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:color-mix(in srgb,var(--fg) 10%,transparent);border-radius:4px;padding:1px 5px}',
    '.doc-wrap pre{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px 12px;overflow:auto}',
    '.doc-wrap pre code{background:none;padding:0}',
    '.doc-wrap ul,.doc-wrap ol{padding-left:22px}',
    '.doc-note{color:var(--fg-mute);font-size:12.5px}',
    '.tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:999px;border:1px solid var(--border);white-space:nowrap}',
    '.tag-ok{color:#3fb950;border-color:rgba(63,185,80,.45);background:rgba(63,185,80,.12)}',
    '.tag-todo{color:#d29922;border-color:rgba(210,153,34,.45);background:rgba(210,153,34,.12)}',
    '.tag-we{color:var(--fg-dim)}',
    /* ①(修正 2026-09-18 真机"一帧正确然后跳 README") 产物把"活动视图"持久化在 localStorage['we-bench-view']，
       启动时 `O(存的值 === 'explorer' ? 'explorer' : 'docs')` —— **任何非 'explorer' 的值都落到 docs**，
       而它切换视图时会 `#sidebar/#logs/#editor-chrome/#stage-slot.hidden = true; #docs-view.hidden = false`。
       补丁的外壳初始化早于它那条异步恢复 ⇒ 用户看到"一帧控制台、随后跳 README"。这里用 CSS 把状态钉死：
       docs 视图永不显示，那 5 个常驻区即使被加 hidden 也照旧显示（不依赖任何竞态）。 */
    '#docs-view{display:none!important}',
    '#sidebar[hidden]{display:flex!important}',
    '#logs[hidden]{display:flex!important}',
    '#editor-chrome[hidden]{display:block!important}',
    '#stage-slot[hidden]{display:flex!important}',
    'html[lang="en"] .lang-zh{display:none}',
    'html:not([lang="en"]) .lang-en{display:none}',
    '@media (prefers-reduced-motion: reduce){#pages-track,#site-tab-ink{transition:none!important}}',   // 现在本来就无动画；保留只为兼容旧文档/旧断言
  ].join('')
  function injectSiteLayoutStyle() {
    try {
      if (!doc.head || $('#bench-site-style')) return false
      const st = doc.createElement('style')
      st.id = 'bench-site-style'
      // ①(修正 2026-09-18) **不再在这里注入布局规则**：运行期注入的表在 `<style id="bench-shell-static">`（index.html）
      //   **之后**，同为 `!important` 时后者胜 ⇒ 会把静态表里的窄屏 @media 覆盖掉（真机：手机视口下舞台仍爆到 1683px）。
      //   现在静态表是唯一权威（首屏即生效、含窄屏自适应）；这里只留一个标记元素 + 说明，便于测试与排障。
      //   上面那份 SITE_LAYOUT_CSS 数组保留，作为"静态表必须覆盖这些规则"的对照（tests/demo-check.mjs 的 D8 逐条比对）。
      st.textContent = '/* bench-site-style: layout rules live in <style id="bench-shell-static"> (index.html) */'
      doc.head.appendChild(st)
      return true
    } catch { return false }
  }
  // `?shell=off` = 新样式总回退：既不注入站点外壳 CSS、也不初始化外壳（旧行为，一行 URL 复原）
  const SHELL_OFF = (() => { try { return /[?&]shell=(off|0|false|no)\b/.test(String((typeof location !== 'undefined' && location.search) || '')) } catch { return false } })()
  // ①(修正 2026-09-18 第二起真机事故) 浏览器**缓存里的旧 HTML** + 新补丁：旧 DOM 没有 #pages-track，
  //   而补丁的站点布局 CSS 只管新结构 ⇒ 套在旧 DOM 上就是"控制台缩到左上角、右边闪出 README"。
  //   这里先认 DOM 版本：不是新 DOM 就**不注入**布局 CSS，并用带 cache-buster 的规范 URL 重新取一次文档
  //   （URL 变了 ⇒ 浏览器必须走网络，绕开启发式缓存与 SW 缓存；sessionStorage 守卫只重取一次，不打转）。
  /** 当前文档是否是「新样式外壳」的 DOM（静态 CSS + #pages-track）。 */
  const shellDomIsNew = (doc0) => !!(doc0 && doc0.querySelector && doc0.querySelector('#pages-track'))
  const DOM_IS_NEW = shellDomIsNew(typeof document !== 'undefined' ? document : null)
  if (!SHELL_OFF && !DOM_IS_NEW && typeof location !== 'undefined') {
    try {
      const GUARD = 'bench-stale-html-renew'
      if (!sessionStorage.getItem(GUARD)) {
        sessionStorage.setItem(GUARD, '1')
        const u = new URL(location.href)
        u.searchParams.set('benchrenew', String(Date.now()))
        location.replace(u.href)
      }
    } catch { /* 无 storage/无 URL：静默降级（至少不注入不匹配的布局 CSS） */ }
  }
  const SITE_STYLE_INJECTED = (SHELL_OFF || !DOM_IS_NEW) ? false : injectSiteLayoutStyle()
  // ①(2026-09-18) 版本标记：把"当前页面到底是哪一版"变成可核对的事实（控制台/属性/状态栏都能看）——
  //   用户报"还是不行"时，第一件事就是核对它（旧缓存会让 `window.__benchShellVersion` 整个不存在）。
  const BENCH_SHELL_VERSION = 'bench-shell 2026-09-18a (static first-paint CSS; dom=' + (DOM_IS_NEW ? 'new' : 'old') + (SHELL_OFF ? '; shell=off' : '') + ')'
  try {
    if (typeof window !== 'undefined') {
      window.__benchShellVersion = BENCH_SHELL_VERSION
      if (document && document.documentElement) document.documentElement.setAttribute('data-bench-shell-version', BENCH_SHELL_VERSION)
    }
  } catch { /* 桩 DOM */ }

  // 图标：Lucide v0.545.0（ISC，© Lucide Contributors / Feather 部分 MIT）——
  //   用户给的 docs/SVG-ICONS.md 里已有 arrow-up / search，其余按同风格取 Lucide 同名条目；
  //   许可与出处逐条记在 we-scene-demo/docs/ICONS-NEEDED.md 与 docs/COPYING-RULES.md §4。
  const DIR_ICONS = {
    folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
    file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4'],
    house: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    up: ['m5 12 7-7 7 7', 'M12 19V5'],
    search: ['m21 21-4.34-4.34', 'c:11:11:8'],
    check: ['M20 6 9 17l-5-5'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
  }
  const DIR_SVG_NS = 'http://www.w3.org/2000/svg'
  const dirIcon = (name, size) => {
    const spec = DIR_ICONS[name]
    if (!spec) return null
    let svg = null
    try { svg = doc.createElementNS(DIR_SVG_NS, 'svg') } catch { svg = null }
    if (!svg) { try { svg = doc.createElement('svg') } catch { return null } }
    if (!svg.setAttribute) return null
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', String(size || 13)); svg.setAttribute('height', String(size || 13))
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true')
    for (const d of spec) {
      let node = null
      if (d.indexOf('c:') === 0) {
        const p = d.split(':')
        try { node = doc.createElementNS(DIR_SVG_NS, 'circle') } catch { node = doc.createElement('circle') }
        if (node && node.setAttribute) { node.setAttribute('cx', p[1]); node.setAttribute('cy', p[2]); node.setAttribute('r', p[3]) }
      } else {
        try { node = doc.createElementNS(DIR_SVG_NS, 'path') } catch { node = doc.createElement('path') }
        if (node && node.setAttribute) node.setAttribute('d', d)
      }
      if (node && svg.appendChild) svg.appendChild(node)
    }
    return svg
  }
  const dirMk = (tag, cls, text) => {
    const el = doc.createElement(tag)
    if (cls) el.className = cls
    if (text != null) el.textContent = String(text)
    return el
  }
  const dirBtn = (cls, label, title, iconName) => {
    const b = dirMk('button', cls)
    b.type = 'button'
    const ic = iconName ? dirIcon(iconName, 12) : null
    if (ic) b.appendChild(ic)
    if (label != null && label !== '') b.appendChild(dirMk('span', '', label))
    if (title) b.setAttribute('title', title)
    return b
  }

  // ── ② README 面板：#main 的轨道决策（纯函数 mainViewPlan）+ 观察者（视图切回来也能收回死区）──
  const mainEl = $('#main')
  const dirShown = (el) => {
    if (!el) return false
    if (el.hidden === true) return false
    try { if (el.style && el.style.display === 'none') return false } catch { /* 无 style（极简假 DOM） */ }
    try {
      if (typeof getComputedStyle === 'function') {
        const cs = getComputedStyle(el)
        if (cs && cs.display === 'none') return false
      }
    } catch { /* 假 DOM 没有 getComputedStyle ⇒ 只看 hidden */ }
    return true
  }
  // ①(修正 2026-09-17，真机事故) 这里曾经**自激成死循环**：观察者同时盯 `#main`（写入目标）
  //   与它的输入节点，`paintMainView()` 又去 add/remove `#main` 的 class ⇒ 每次写入都重新触发自己；
  //   当 docsOnly 判定在两次调用间来回翻转时（新布局里 `#main` 有 4 个子元素、0px 轨道映射不同），
  //   循环以微任务速度跑满主线程 ⇒ **页面 load 永不完成**（无头探针 45s 超时、真机浏览器卡死）。
  //   instrument 证据：MutationObserver on DIV#main.bench-view-docs attr=class 被调用 10000+ 次/6s。
  //   修法两条：①写入幂等（状态没变就不碰 DOM）②**不观察写入目标本身**，只看输入节点。
  const MAIN_VIEW_ON = !SHELL_OFF   // 新样式（站点外壳）下 #main 的轨道由 SITE_LAYOUT_CSS 钉死，本机制整体让位
  function paintMainView() {
    if (!mainEl) return null
    const plan = mainViewPlan({ chromeVisible: dirShown($('#editor-chrome')), logsVisible: dirShown($('#logs')) })
    if (MAIN_VIEW_ON) return plan   // 外壳模式下不改 class（避免与外壳布局互相触发）
    try {
      const on = mainEl.classList.contains('bench-view-docs')
      if (plan.docsOnly !== on) mainEl.classList.toggle('bench-view-docs', plan.docsOnly)
    } catch { /* 无 classList */ }
    return plan
  }
  let mainViewPlanNow = paintMainView()
  if (!MAIN_VIEW_ON && mainEl && typeof MutationObserver === 'function') {
    try {
      const mo = new MutationObserver(() => { mainViewPlanNow = paintMainView() })
      for (const sel of ['#editor-chrome', '#workspace', '#logs']) {   // ← 不含 #main（写入目标，自激源）
        const el = $(sel)
        if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] })
      }
    } catch { /* 观察者挂了也不影响功能（下次语言同步还会重算） */ }
  }

  // ── ① 授权树（选择器的数据源）──
  let pickIndex = null
  let pickGrantFrom = ''
  function grantPickerIndex(entries, opt) {
    const o = opt || {}
    const index = buildPickerIndex(entries || [], o)
    if (!index.root) { logLine(t(curLang, 'local.notDir'), true); return null }
    pickIndex = index
    pickGrantFrom = String(o.from || 'system-picker')
    logLine(t(curLang, 'pick.granted', { n: index.files.length, d: index.dirs.length, name: index.root }))
    return index
  }
  const dirFileOf = async (entry) => {
    if (!entry) return null
    if (entry.file) return entry.file
    if (typeof entry.getFile === 'function') { try { return await entry.getFile() } catch { return null } }
    return null
  }
  /** 授权树里 cwd 子树下的全部文件（惰性 getFile 的也要取回：扫描要读 project.json 文本） */
  async function dirEntriesUnder(cwd) {
    if (!pickIndex) return []
    const out = []
    for (const f of pickIndex.files) {
      if (f.dir !== cwd && f.dir.indexOf(cwd + '/') !== 0) continue
      const file = await dirFileOf(f)
      if (file) out.push({ path: f.path, file })
    }
    return out
  }

  // ── ② 弹窗本体 ──
  let dirBoxEl = null
  let dirState = null
  let dirKeyHandler = null
  const dirRowNodes = new Map()
  let dirLastUserScrollAt = 0
  let dirSelfScroll = 0
  let dirClickLock = null
  const dirMarkUserScroll = () => {
    if (dirSelfScroll > 0) return                       // 程序化写入造成的事件不算"用户在滚"
    dirLastUserScrollAt = Date.now()
  }
  function dirSetScrollTop(list, v) {
    if (!list) return
    dirSelfScroll++
    try { list.scrollTop = Number(v) || 0 } finally { setTimeout(() => { dirSelfScroll-- }, 0) }
  }
  function closeDirPicker() {
    if (dirKeyHandler) { try { doc.removeEventListener('keydown', dirKeyHandler) } catch { /* 假 DOM */ } }
    dirKeyHandler = null
    if (dirBoxEl && dirBoxEl.parentNode) { try { dirBoxEl.parentNode.removeChild(dirBoxEl) } catch { /* 已移除 */ } }
    dirBoxEl = null; dirState = null
    dirRowNodes.clear()
  }
  function dirRowsFor(st) {
    const view = pickerView(pickIndex, st.cwd)
    if (!view) return { rows: [], view: null }
    const q = st.query
    const dirs = filterPickerRows(view.dirs, q)
    const files = st.mode === 'file' ? filterPickerRows(view.files.filter((f) => pickerAcceptMatch(f.name, st.kinds)), q) : []
    return { rows: dirs.concat(files), view }
  }
  function dirAnchorOf(list, nodes) {
    if (!list || !nodes || !nodes.length) return null
    const rects = []
    for (const n of nodes) { const r = n.getBoundingClientRect ? n.getBoundingClientRect() : null; rects.push(r ? { top: r.top, bottom: r.bottom } : null) }
    return pickerAnchor(rects, list.getBoundingClientRect ? list.getBoundingClientRect() : null)
  }
  function dirAnchorContentTop(key, list) {
    const n = dirRowNodes.get(key)
    if (!n || !n.getBoundingClientRect || !list.getBoundingClientRect) return null
    const r = n.getBoundingClientRect(), lr = list.getBoundingClientRect()
    return (Number(r.top) - Number(lr.top)) + (Number(list.scrollTop) || 0)
  }
  /** 重绘前后：锚点行 + 偏移 → 精确回位（锚点没了 ⇒ 夹住原位置；用户刚滚过 ⇒ 让位） */
  function dirRestoreScroll(anchor, prevTop) {
    const list = dirState && dirState.listEl
    if (!list) return null
    const guard = pickerScrollGuard({ lastUserScrollAt: dirLastUserScrollAt, now: Date.now(), windowMs: 700 })
    if (guard.skip) { dirState.lastRestore = { reason: 'user-scrolling', to: Number(list.scrollTop) || 0 }; return dirState.lastRestore }
    const plan = pickerRestoreScroll({
      anchorContentTop: anchor ? dirAnchorContentTop(anchor.key, list) : null,
      anchorOffset: anchor ? anchor.offset : null,
      prevScrollTop: prevTop,
      scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
    })
    if (Math.abs((Number(list.scrollTop) || 0) - plan.scrollTop) >= 1) dirSetScrollTop(list, plan.scrollTop)
    dirState.lastRestore = { reason: plan.reason, from: Math.round(Number(prevTop) || 0), to: Math.round(plan.scrollTop) }
    return dirState.lastRestore
  }
  function dirPaintRows() {
    const st = dirState
    const list = st && st.listEl
    if (!list) return
    const anchorPlan = dirAnchorOf(list, st.rowNodes)
    const anchorKey = (anchorPlan && st.rowNodes[anchorPlan.index]) ? st.rowNodes[anchorPlan.index].__rowKey : null
    const anchor = (anchorPlan && anchorKey) ? { key: anchorKey, offset: anchorPlan.offset } : null
    const prevTop = Number(list.scrollTop) || 0
    const plan = dirRowsFor(st)
    st.rows = plan.rows
    const keys = plan.rows.map((r) => r.kind + ':' + r.path)
    const diff = pickerRowDiff(st.rowNodes.map((n) => n.__rowKey), keys)
    for (const k of diff.remove) {
      const n = dirRowNodes.get(k)
      if (n && n.parentNode) n.parentNode.removeChild(n)
      dirRowNodes.delete(k)
    }
    st.rowNodes = []
    for (const r of plan.rows) {
      const key = r.kind + ':' + r.path
      let n = dirRowNodes.get(key)
      if (!n) { n = dirMakeRow(r); dirRowNodes.set(key, n) }
      n.__row = r
      n.className = 'bench-dirbox-row' + (r.kind === 'file' ? ' is-file' : ' is-dir') + (st.sel === r.path ? ' on' : '')
      list.appendChild(n)                              // 复用节点 ⇒ 只是原地移动，容器内容从不清空
      st.rowNodes.push(n)
    }
    st.diff = diff
    // 行集合变了（过滤词改了 / 换目录了）⇒ 键盘游标失效：绝不让它指向"另一行"
    if (diff.add.length || diff.remove.length) st.cursor = -1
    if (!plan.rows.length) {
      let empty = dirRowNodes.get('__empty')
      if (!empty) { empty = dirMk('div', 'bench-dirbox-empty'); empty.__rowKey = '__empty'; dirRowNodes.set('__empty', empty) }
      empty.textContent = st.mode === 'file' ? t(curLang, 'pick.noFile') : t(curLang, 'pick.empty')
      list.appendChild(empty)
    } else {
      const empty = dirRowNodes.get('__empty')
      if (empty && empty.parentNode) empty.parentNode.removeChild(empty)
      if (empty) dirRowNodes.delete('__empty')
    }
    if (st.pendingReset) { st.pendingReset = false; dirState.lastRestore = { reason: 'enter', to: 0 }; dirSetScrollTop(list, 0) }
    else dirRestoreScroll(anchor, prevTop)
  }
  function dirPaintChrome() {
    const st = dirState
    if (!st) return
    const view = st.view
    if (st.pathEl) st.pathEl.textContent = t(curLang, 'pick.curDir') + '：' + (st.cwd || '')
    if (st.listEl) st.listEl.setAttribute('aria-label', st.cwd || '')
    if (st.countEl) st.countEl.textContent = t(curLang, 'pick.count', { n: st.rows.length })
    if (st.upBtn) st.upBtn.disabled = !!(view && view.isRoot)
    if (st.homeBtn) st.homeBtn.disabled = !!(view && view.isRoot)
    if (st.confirmBtn) {
      const ready = st.mode === 'dir' ? !!st.cwd : !!st.sel
      st.confirmBtn.disabled = !ready
      st.confirmLabel.textContent = t(curLang, st.mode === 'file' ? 'pick.thisFile' : 'pick.here')
    }
    if (st.noteEl) st.noteEl.textContent = t(curLang, 'pick.readNote')
  }
  function dirPaint(opt) {
    const st = dirState
    if (!st) return
    const o = opt || {}
    if (o.reset) st.pendingReset = true
    const plan = dirRowsFor(st)
    st.view = plan.view
    dirPaintRows()
    dirPaintChrome()
    return { rows: st.rows.length, diff: st.diff, restore: st.lastRestore }
  }
  function dirMakeRow(r) {
    const n = dirMk('div', 'bench-dirbox-row ' + (r.kind === 'file' ? 'is-file' : 'is-dir'))
    n.setAttribute('role', 'button')
    n.setAttribute('tabindex', '-1')                 // 行不进 Tab 序：避免浏览器/辅助技术把焦点带进来顺带滚顶
    const ic = dirIcon(r.kind === 'file' ? 'file' : 'folder', 13)
    if (ic) n.appendChild(ic)
    n.appendChild(dirMk('span', 'bench-dirbox-name', r.name))
    n.appendChild(dirMk('span', 'bench-dirbox-sub', r.kind === 'file' ? (r.ext ? '.' + r.ext : '') : '›'))
    n.__rowKey = r.kind + ':' + r.path
    n.__row = r
    n.addEventListener('mousedown', (ev) => {
      // 不 focus()（focus 会把滚动容器滚到顶）；挡掉默认的聚焦/选区，并按 pointerdown 锁定目标行
      try { if (ev && ev.preventDefault) ev.preventDefault() } catch { /* 合成事件 */ }
      dirClickLock = { key: n.__rowKey, at: Date.now() }
    })
    n.addEventListener('click', () => dirActivateRow(n.__rowKey))
    return n
  }
  /** 键盘游标移动（↑↓）：只改高亮 + 必要时把那一行滚进可视区。
   *  两条纪律：① 不 focus()（focus 会把滚动容器滚到顶，用户实测过）；② 行已在可视区里就一个字都不写 scrollTop。 */
  function dirMoveCursor(i) {
    const st = dirState
    if (!st || !st.rows.length) return null
    const idx = Math.max(0, Math.min(st.rows.length - 1, Number(i) || 0))
    st.cursor = idx
    st.sel = st.rows[idx].path
    dirPaint()
    dirEnsureVisible(idx)
    return st.rows[idx]
  }
  function dirEnsureVisible(i) {
    const st = dirState
    const list = st && st.listEl
    const n = st && st.rowNodes[i]
    if (!list || !n || !n.getBoundingClientRect || !list.getBoundingClientRect) return
    const r = n.getBoundingClientRect(), lr = list.getBoundingClientRect()
    const top = Number(list.scrollTop) || 0
    if (r.bottom > lr.bottom) dirSetScrollTop(list, top + (r.bottom - lr.bottom))
    else if (r.top < lr.top) dirSetScrollTop(list, Math.max(0, top - (lr.top - r.top)))
    else return
    st.lastRestore = { reason: 'keyboard', to: Math.round(Number(list.scrollTop) || 0) }
  }
  function dirFindRow(key) {
    const st = dirState
    if (!st) return null
    for (const r of st.rows) if ((r.kind + ':' + r.path) === key) return r
    return null
  }
  function dirActivateRow(key) {
    const st = dirState
    if (!st) return
    const lock = dirClickLock
    dirClickLock = null
    // 重排/重绘后 click 落在别的行上：用 pointerdown 时锁定的那一行（插件 client.js:9885-9889 的同款修法）
    const use = (lock && lock.key === key && (Date.now() - lock.at) < 2000) ? lock.key : key
    const row = dirFindRow(use)
    if (!row) return
    if (row.kind === 'dir') {
      const nav = pickerNavigate(pickIndex, st.cwd, row.path)
      if (!nav.moved) return
      st.cwd = nav.cwd
      st.sel = null
      dirPaint({ reset: true })
      return
    }
    st.sel = st.sel === row.path ? null : row.path
    dirPaint()
  }
  function dirSetFilter(q) {
    const st = dirState
    if (!st) return null
    st.query = String(q == null ? '' : q)
    return dirPaint()                                  // 过滤 = 行集合变化 + 锚点回位（断言点：scrollTop 不许跳 0）
  }
  function dirConfirm() {
    const st = dirState
    if (!st) return
    const cb = st.onPick
    if (st.mode === 'dir') {
      const cwd = st.cwd
      closeDirPicker()
      const entriesPromise = Promise.resolve().then(() => dirEntriesUnder(cwd))
      if (cb) entriesPromise.then((entries) => cb({ kind: 'dir', path: cwd, entries: entries }))
      return
    }
    const row = st.rows.filter((r) => r.kind === 'file' && r.path === st.sel)[0]
    if (!row) return
    closeDirPicker()
    if (cb) cb({ kind: 'file', path: row.path, name: row.name, ext: row.ext, dir: row.path.split('/').slice(0, -1).join('/'), file: row.file, getFile: row.getFile })
  }
  /** 打开选择器（mode='dir'|'file'）。onPick({kind, path, name?, entries?})；无授权树时给"先授权"空态。 */
  function openDirPicker(opt) {
    const o = opt || {}
    const mode = o.mode === 'file' ? 'file' : 'dir'
    closeDirPicker()
    const st = dirState = {
      mode, kinds: o.kinds || pickerAcceptKinds(''), onPick: o.onPick || null,
      cwd: pickerResolveDir(pickIndex, o.cwd || (pickIndex ? pickIndex.root : '')),
      query: '', sel: null, cursor: -1, rows: [], rowNodes: [], view: null, diff: null,
      listEl: null, pathEl: null, countEl: null, confirmBtn: null, confirmLabel: null, noteEl: null,
      upBtn: null, homeBtn: null, lastRestore: null, pendingReset: true,
    }
    const box = dirBoxEl = dirMk('div', 'bench-dirbox')
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true')
    const win = dirMk('div', 'bench-dirbox-win')
    const head = dirMk('div', 'bench-dirbox-head')
    const title = dirMk('strong', 'bench-dirbox-title', t(curLang, mode === 'file' ? 'pick.fileTitle' : 'pick.dirTitle'))
    const xBtn = dirBtn('bench-dirbox-x', '', t(curLang, 'picker.cancel'), 'x')
    xBtn.addEventListener('click', () => closeDirPicker())
    head.appendChild(title); head.appendChild(xBtn)
    const pathEl = dirMk('div', 'bench-dirbox-path')
    const tools = dirMk('div', 'bench-dirbox-tools')
    const homeBtn = dirBtn('', t(curLang, 'pick.home'), t(curLang, 'pick.home'), 'house')
    const upBtn = dirBtn('', t(curLang, 'pick.up'), t(curLang, 'pick.up'), 'up')
    const grantBtn = dirBtn('', t(curLang, 'pick.grant'), t(curLang, 'pick.grant'), 'folder')
    const filter = dirMk('input', 'bench-dirbox-filter')
    filter.setAttribute('type', 'search'); filter.setAttribute('placeholder', t(curLang, 'pick.filterPh'))
    homeBtn.addEventListener('click', () => { const nav = pickerNavigate(pickIndex, st.cwd, '/'); if (nav.moved) { st.cwd = nav.cwd; st.sel = null; st.query = ''; filter.value = ''; dirPaint({ reset: true }) } })
    upBtn.addEventListener('click', () => { const nav = pickerNavigate(pickIndex, st.cwd, '..'); if (nav.moved) { st.cwd = nav.cwd; st.sel = null; st.query = ''; filter.value = ''; dirPaint({ reset: true }) } })
    grantBtn.addEventListener('click', () => pickLocalFolder({ onEntries: (entries) => { if (entries) { grantPickerIndex(entries); const root = pickIndex ? pickIndex.root : ''; st.cwd = pickerResolveDir(pickIndex, root); st.sel = null; dirPaint({ reset: true }) } else if (st.needGrantNote) st.needGrantNote.textContent = t(curLang, 'pick.needGrant') } }))
    filter.addEventListener('input', () => dirSetFilter(filter.value))
    tools.appendChild(homeBtn); tools.appendChild(upBtn); tools.appendChild(grantBtn); tools.appendChild(filter)
    const noteEl = dirMk('div', 'bench-dirbox-note')
    const list = dirMk('div', 'bench-dirbox-list')
    list.setAttribute('tabindex', '0')
    list.addEventListener('wheel', dirMarkUserScroll, { passive: true })
    list.addEventListener('touchmove', dirMarkUserScroll, { passive: true })
    list.addEventListener('scroll', dirMarkUserScroll, { passive: true })
    const foot = dirMk('div', 'bench-dirbox-foot')
    const countEl = dirMk('span', 'bench-dirbox-count')
    const confirmBtn = dirBtn('bench-dirbox-go', '', '', 'check')
    const confirmLabel = dirMk('span', '', t(curLang, mode === 'file' ? 'pick.thisFile' : 'pick.here'))
    confirmBtn.appendChild(confirmLabel)
    const cancelBtn = dirBtn('bench-dirbox-go bench-dirbox-go2', t(curLang, 'picker.cancel'))
    confirmBtn.addEventListener('click', () => dirConfirm())
    cancelBtn.addEventListener('click', () => closeDirPicker())
    foot.appendChild(countEl); foot.appendChild(cancelBtn); foot.appendChild(confirmBtn)
    win.appendChild(head); win.appendChild(pathEl)
    if (!pickIndex) {
      const need = dirMk('div', 'bench-dirbox-note', t(curLang, 'pick.needGrant'))
      st.needGrantNote = need
      win.appendChild(need)
    }
    win.appendChild(tools); win.appendChild(list); win.appendChild(noteEl); win.appendChild(foot)
    box.appendChild(win)
    box.addEventListener('mousedown', (ev) => { if (ev && ev.target === box) closeDirPicker() })
    doc.body.appendChild(box)
    st.listEl = list; st.pathEl = pathEl; st.countEl = countEl; st.confirmBtn = confirmBtn
    st.filterEl = filter                                  // 第七批②：换目录时连带清空过滤框（与「上一级/回到最上层」一致）
    st.confirmLabel = confirmLabel; st.noteEl = noteEl; st.upBtn = upBtn; st.homeBtn = homeBtn
    // 第七批②：键盘导航走纯函数决策（Esc 关 / ↑↓ 移动 / Enter 激活或确认）——
    // 与插件侧同一行为契约；方向键与 Enter 一律 preventDefault（不冒泡去滚宿主页面）。
    dirKeyHandler = (ev) => {
      const st = dirState
      if (!ev || !st) return
      const key = ev.key || (ev.keyCode === 27 ? 'Escape' : '')
      const k = pickerKeyAction({ key: key, rows: st.rows.length, index: st.cursor == null ? -1 : st.cursor })
      if (k.action === 'none') return
      try { if (ev.preventDefault) ev.preventDefault() } catch { /* 合成事件 */ }
      if (k.action === 'close') { closeDirPicker(); return }
      if (k.action === 'next' || k.action === 'prev') { dirMoveCursor(k.index); return }
      if (k.action === 'activate') { const r = st.rows[k.index]; if (r) dirActivateRow(r.kind + ':' + r.path); return }
      dirConfirm()
    }
    try { doc.addEventListener('keydown', dirKeyHandler) } catch { /* 假 DOM */ }
    try { if (box.focus) box.focus({ preventScroll: true }) } catch { /* 老浏览器：不带参数也不影响滚动 */ }
    dirPaint({ reset: true })
    return { mode: mode, cwd: st.cwd, rows: st.rows.length, granted: !!pickIndex }
  }

  // ── ③ 三个入口：壁纸库「选择文件夹」/ 侧栏「选择文件」/ 属性面板的行内「选择文件…」──
  async function useSubtreeAsLibrary(res) {
    if (!res) return
    logLine(t(curLang, 'local.grantScan', { name: res.path }))
    const entries = (res.entries || []).filter((e) => e && e.file)
    if (!entries.length) { logLine(t(curLang, 'local.none'), true); return }
    await loadLocalEntries(entries)
  }
  function openLibraryPicker() {
    // 第七批②：入口**一律先开插件同款弹窗**（与 dsh-mpkg-wallpaper/lib/client.js 的目录选择弹窗同款交互）。
    // 还没授权过也开：弹窗里给「浏览器安全限制」说明 + 「打开系统选择器」按钮，授权完**原地**继续浏览。
    // 老写法是没授权就直接弹系统对话框 —— 用户看不到"两个入口用的是同一个选择器"，也没有说明。
    if (!canPickViaInput() && !canShowDirPicker()) { logLine(t(curLang, 'local.unsupported'), true); return false }
    openDirPicker({ mode: 'dir', onPick: useSubtreeAsLibrary })
    return true
  }
  async function previewPickedFile(res) {
    const dir = res.dir || ''
    const find = (rx) => (pickIndex ? pickIndex.files.filter((f) => f.dir === dir && rx.test(f.name))[0] : null)
    const pkgEntry = /^scene\.pkg$/i.test(res.name) ? res : find(/^scene\.pkg$/i)
    const projEntry = /^project\.json$/i.test(res.name) ? res : find(/^project\.json$/i)
    const pkg = await dirFileOf(pkgEntry)
    if (!pkg) { logLine(t(curLang, 'local.sceneOnly'), true); return false }
    let meta = {}
    const proj = await dirFileOf(projEntry)
    if (proj && typeof proj.text === 'function') { try { meta = JSON.parse(await proj.text()) || {} } catch { /* 坏 project.json 忽略 */ } }
    const dirName = dir ? dir.split('/').pop() : res.name
    previewLocal({
      dir: dir || res.path, id: dir || res.path, title: String(meta.title || dirName),
      kind: detectWallpaperKind(meta, [pkg.name || res.name]) || 'unknown',
      pkg: pkg, proj: proj, preview: null,
      properties: (meta.general && meta.general.properties) || null,
    })
    return true
  }
  async function onSidebarFilePicked(res) {
    if (!res) return
    logLine(t(curLang, 'local.filePicked', { name: res.path }))
    const ok = await previewPickedFile(res)
    if (!ok) logLine(t(curLang, 'local.sceneOnly'), true)
  }
  function openFilePickerFlow() {
    const kinds = pickerAcceptKinds('')
    // 第七批②：与「选择文件夹」同一个选择器（同款弹窗、文件模式），入口一律先开弹窗；
    // 未授权时同样给说明 + 「打开系统选择器」。
    if (!canPickViaInput() && !canShowDirPicker()) { logLine(t(curLang, 'local.unsupported'), true); return false }
    openDirPicker({ mode: 'file', kinds: kinds, onPick: onSidebarFilePicked })
    return true
  }
  const pickFileBtn = $('#pick-file')
  if (pickFileBtn) {
    pickFileBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopImmediatePropagation(); openFilePickerFlow()
    }, true)
  }
  async function handFileToInput(res) {
    const f = await dirFileOf(res)
    return f
  }
  function openPropsFilePicker(input) {
    const kinds = pickerAcceptKinds(input && input.getAttribute ? input.getAttribute('accept') : '')
    const onPick = async (res) => {
      const file = await handFileToInput(res)
      if (!file) { logLine(t(curLang, 'err.pickFile', { msg: 'no-file-handle' }), true); return }
      try {
        // 沿用 bundle 自己的上传链：它给隐藏 input 挂了 onchange（bench.ts:1288 uploadPropFile）
        const DT = (typeof window !== 'undefined') ? window.DataTransfer : null
        if (!DT) throw new Error('DataTransfer unavailable')
        const dt = new DT()
        dt.items.add(file)
        input.files = dt.files
        input.dispatchEvent(new Event('change'))
      } catch (e) {
        logLine(t(curLang, 'err.pickFile', { msg: String((e && e.message) || e) }), true)
      }
    }
    if (pickIndex) { openDirPicker({ mode: 'file', kinds: kinds, onPick: onPick }); return true }
    if (!canPickViaInput() && !canShowDirPicker()) return false
    return pickLocalFolder({ onEntries: (entries) => {
      if (!entries) return
      grantPickerIndex(entries)
      openDirPicker({ mode: 'file', kinds: kinds, onPick: onPick })
    } })
  }
  const propsBodyEl = $('#props-body')
  if (propsBodyEl) {
    // 捕获阶段：抢在 bundle 的 `pick.onclick = () => file.click()` 之前把手写选择器换上。
    // 目录型属性（.prop-file 里没有 input.prop-file-input）不拦：它的值必须是绝对路径，
    // 只有宿主侧流程（/api/props-dir）能给，网页里的相对路径写进去反而更坏。
    propsBodyEl.addEventListener('click', (ev) => {
      const target = ev && ev.target
      const btn = (target && typeof target.closest === 'function') ? target.closest('.prop-pick') : null
      if (!btn) return
      const row = (typeof btn.closest === 'function') ? btn.closest('.prop-file') : null
      const input = row ? row.querySelector('input.prop-file-input') : null
      if (!input) return
      try { ev.preventDefault(); ev.stopImmediatePropagation() } catch { /* 合成事件 */ }
      openPropsFilePicker(input)
    }, true)
  }

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

  // ── ⑧(2026-09-18 品牌改名) 站点品牌运行期覆盖 ──
  //   目标：用户**看得见的地方**（头部品牌名 + document.title）显示产品现名 `WEwebLoader`，版本号 `v1.3.16`
  //   照旧跟在后面（`#app-version` 由产物启动时写一次，本函数不碰）。
  //   为什么是运行期覆盖：静态 HTML 的 `<title>` 与 DICT 的 `app.title` 分别是门禁 T8（产物接线）与
  //   T1（词典必须逐条等于上游 bench/i18n.ts）的钉子，`demo/assets/*.js` 又是"不改一个字节"的许可口径
  //   ⇒ 产品名只能在呈现层覆盖。回退口：`?appname=upstream`（或 `?brand=upstream`）还原上游名。
  //   必须在 `applyStaticI18n` **之后**跑：它会把带 `data-i18n="app.title"` 的品牌名写回上游名。
  function applySiteBrandNow() {
    const brandEl = (doc.querySelector && (doc.querySelector('[data-i18n="app.title"]') || doc.querySelector('#site-brand .brand-name'))) || null
    const plan = applySiteBrand({ override: FLAGS.appname, upstreamTitle: t(curLang, 'app.title'), brandEl, doc })
    try { if (typeof window !== 'undefined') window.__benchBrandPlan = plan } catch { /* 桩 DOM */ }
    return plan
  }

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
    applySiteBrandNow()                                        // ⑧品牌名覆盖（必须在 applyStaticI18n 之后）
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
    ['#pick-file', 'title', 'pick.fileTitle'],        // 第七批：插件同款「选择文件」入口（弹窗里的文案由 dirPaintChrome 随语言重画）
    ['#copy-logs', 'title', 'copy.logs'],
    ['#trail-len', 'title', 'trail.len'],
    ['#trail-w', 'title', 'trail.width'],
    ['#trail-color', 'title', 'trail.color'],
    ['#trail-box', 'title', 'trail.tip'],
    ['#bench-local', 'skip', null],                   // 由 renderLocal 渲染（带类型标签）
    ['#bench-rd-btn', 'skip', null],
    // 第五批④：文档页底部的**原作者归属外链**（赞赏卡片已删；这两个节点故意不挂 data-i18n ——
    // 旧 bundle 的词典里没有 credit.* 键，挂了会被它的 applyStatic 写成键名原文）
    // ①(第七批修，2026-09-17) 页脚 #bench-credit 里那对**曾经复用同样的 id**（同页两处同 id ⇒ querySelector
    // 只认文档视图那份，页脚永远不随语言切换）⇒ 页脚改成 *-footer 专名，两条一起同步（T31 通用唯一 id 断言盯着）。
    ['#credit-title-footer', 'text', 'credit.title'],
    ['#credit-link-footer', 'text', 'credit.link'],
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
    try { if (typeof window !== 'undefined' && typeof window.__benchShellRefresh === 'function') window.__benchShellRefresh() } catch { /* 外壳未初始化（测试桩）：忽略 */ }
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

  // ── ⑩ 站点外壳（2026-09-17 新样式）：在 syncAllLabels 之后初始化 —— 它要读已本地化的按钮文案。
  //   句柄挂 window（供 syncAllLabels 在语言切换时刷新，不走 TDZ 风险的闭包变量）。 ──
  if (!SHELL_OFF) try {
    window.__benchShell = initSiteShell({ t, lang: () => curLang, log: (m) => logLine(String(m)), shellVersion: BENCH_SHELL_VERSION, domIsNew: DOM_IS_NEW })
    window.__benchShellRefresh = () => {
      try {
        const sh = window.__benchShell
        if (!sh) return
        sh.paintStatus(); sh.paintPropsEmpty(); sh.refreshSwitcher()
        sh.paintLogsArrow(window.__benchMainCollapsed ? window.__benchMainCollapsed() : false)
      } catch { /* 外壳刷新失败不影响页面 */ }
    }
  } catch (e) { logLine('站点外壳初始化失败：' + ((e && e.message) || e), true) }

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
    // ⑧(2026-09-18 品牌改名)：站点品牌覆盖的重放入口（探针/测试用；语言切换链里也会自动跑）
    siteBrandNow: () => applySiteBrandNow(),
    // P-93 在线 demo（线上形态 / 路径改写 / 合成样例 / 横幅）：探针与测试同一入口
    getDemoEnv: () => Object.assign({}, demoEnv),
    getOnlineNotice: () => paintOnlineNotice(),
    remapDemoUrl: (u) => remap(u),
    getDefaultSample: () => defaultSample,
    loadDefaultSample: (u) => loadDefaultSample(u),
    shell: { indexHtml: 'demo/index.html', singleSource: 'demo/bench-patch.js' },
    // ── 第七批：插件同款选择器（探针与测试同一入口；假授权树 + 滚动位置读数都在这里）──
    grantPickerEntries: (entries, opt) => grantPickerIndex(entries, opt),
    getPickerIndex: () => (pickIndex ? { root: pickIndex.root, dirs: pickIndex.dirs.length, files: pickIndex.files.length, truncated: pickIndex.truncated, from: pickGrantFrom } : null),
    openPicker: (opt) => openDirPicker(opt || {}),
    closePicker: () => closeDirPicker(),
    getPickerState: () => (dirState ? {
      mode: dirState.mode, cwd: dirState.cwd, query: dirState.query,
      rows: dirState.rows.map((r) => r.kind + ':' + r.path),
      sel: dirState.sel, cursor: dirState.cursor, diff: dirState.diff, restore: dirState.lastRestore,
      scrollTop: dirState.listEl ? Math.round(Number(dirState.listEl.scrollTop) || 0) : null,
      scrollHeight: dirState.listEl ? dirState.listEl.scrollHeight : null,
      clientHeight: dirState.listEl ? dirState.listEl.clientHeight : null,
    } : null),
    setPickerFilter: (q) => dirSetFilter(q),
    setPickerScroll: (v) => { if (dirState && dirState.listEl) { dirSetScrollTop(dirState.listEl, v); return true } return false },
    // 第七批②：导航（探针/脚本入口）与「上一级 / 回到最上层」按钮同款——换目录时清过滤词 + 关键盘游标
    pickerGo: (target) => {
      if (!dirState) return null
      const nav = pickerNavigate(pickIndex, dirState.cwd, target)
      if (nav.moved) {
        dirState.cwd = nav.cwd; dirState.sel = null; dirState.cursor = -1; dirState.query = ''
        if (dirState.filterEl) dirState.filterEl.value = ''
        dirPaint({ reset: true })
      }
      return nav
    },
    confirmPicker: () => { dirConfirm(); return true },
    // 键盘导航走**真处理器**（dirKeyHandler）而不是复制一份逻辑：探针按的就是用户按键那条路
    pickerKey: (key) => {
      if (!dirState || !dirKeyHandler) return null
      dirKeyHandler({ key: String(key), preventDefault: function () { /* 合成事件：不需要真的阻止默认行为 */ } })
      return dirState ? { cursor: dirState.cursor, sel: dirState.sel, rows: dirState.rows.length, cwd: dirState.cwd, open: !!dirBoxEl } : { open: false }
    },
    getMainViewPlan: () => paintMainView(),
    // ⑩ 站点外壳（2026-09-17 新样式）：切页 / 切换栏 / 控制台高度 / 参数栏空态
    getPage: () => (window.__benchShell ? window.__benchShell.getPage() : null),
    setPage: (n) => (window.__benchShell ? window.__benchShell.setPage(n) : null),
    switcher: () => (window.__benchShell ? { plan: window.__benchShell.refreshSwitcher(), items: window.__benchShell.listItems() } : null),
    logsHeight: () => (window.__benchShell ? window.__benchShell.logsHeight() : null),
    setLogsHeight: (v) => (window.__benchShell ? window.__benchShell.setLogsHeight(v) : null),
    siteStyleInjected: () => SITE_STYLE_INJECTED,
    shellVersion: () => BENCH_SHELL_VERSION,
    domIsNew: () => DOM_IS_NEW,
    pickerStyleInjected: () => BENCH_STYLE_INJECTED,
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
