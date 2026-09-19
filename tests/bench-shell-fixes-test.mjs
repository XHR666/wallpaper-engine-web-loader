// bench-shell-fixes-test.mjs —— P-158/P-159 测试台外壳一批 UI/交互修复的**无浏览器门禁**
//
// 覆盖范围（逐条对应用户的第 1~11 条 + 转来的类型/指针两条）：
//   A 纯函数层（Node 直接跑真代码）：下拉贴合/包含块偏移、已选/常用计划、库来源四态、
//     诊断流一行模型、类型标签归一、库目录对话框降级、指针"离开不再归中"
//   B 两个文件的**静态纪律**：CSS 与 SITE_LAYOUT_CSS 逐条同文（D8 之外再点名本批新增的每一条）、
//     一个 select 一个自绘控件、`#type-filter` 不许再被当"已删功能"处理、`#main` 的内层列必须钉死（工具条换行的前提）
//   C RED-IF-REVERTED：把 demo/bench-patch.js 复制到 /tmp 改坏（≠ 改真树），上面几条必须变红
//     （本机 fs.cpSync 在部分挂载上抛 EINVAL ⇒ 用 readFileSync/writeFileSync）
//
// 为什么不用浏览器：这批 90% 的判据是**几何/状态机**，纯函数与源码断言既能秒级跑，也不会因为
// "本机 X 不可用 / WebGL 起不来"而假红。真机几何在 tests/bench-ui-headless-test.mjs（另有一条）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_root.mjs'

let pass = 0; let fail = 0
const ok = (c, label, extra = '') => { if (c) { pass++; console.log('PASS ' + label + (extra ? '  ' + extra : '')) } else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')) } }
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label, `实测 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`)

const PATCH = path.join(ROOT, 'demo/bench-patch.js')
const HTML = path.join(ROOT, 'demo/index.html')
const patchSrc = fs.readFileSync(PATCH, 'utf8')
const htmlSrc = fs.readFileSync(HTML, 'utf8')
const P = await import(pathToFileURL(PATCH).href)

// 静态块里的 SITE_LAYOUT_CSS 镜像（D8 之外再点名本批新增的每一条）
const mStatic = htmlSrc.match(/<style id="bench-shell-static">([\s\S]*?)<\/style>/)
const staticCss = mStatic ? mStatic[1] : ''
const mArr = patchSrc.match(/const SITE_LAYOUT_CSS = \[([\s\S]*?)\]\.join\(''\)/)
const cssItems = mArr ? [...mArr[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'")) : []
const norm = (t) => t.replace(/\s+/g, ' ').trim()
// 负向断言（"不再出现 X"）必须先在**剥掉注释**的文本上做：本批注释里刻意引用了旧写法当反例，
// 不剥注释就会"自己把自己判红"（第一次跑就踩到了这个假阳性）。
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
const htmlCode = stripComments(htmlSrc)
const patchCode = stripComments(patchSrc)

// ══════════════════════════════ A 纯函数层 ══════════════════════════════
console.log('== A 纯函数层 ==')

// ② 下拉贴合：below/above 都 ≤2px，且包含块偏移只对"锚在 #pages-track 里"生效
{
  const clip = { left: 0, top: 44, right: 1360, bottom: 882 }
  const vp = { width: 1360, height: 900 }
  const btn = { left: 700, top: 80, right: 832, bottom: 104, width: 132, height: 24 }
  const down = P.dropdownLayerPlan(btn, clip, vp, 320)
  ok(down.placement === 'below' && (down.anchorTop - btn.bottom) <= 2 && (down.anchorTop - btn.bottom) >= 0,
    'A1 ②下方放得下 ⇒ placement=below，且列表上边缘距触发框下边缘 ≤2px', JSON.stringify({ top: down.top, gap: down.anchorTop - btn.bottom }))
  const low = { left: 700, top: 840, right: 832, bottom: 864, width: 132, height: 24 }
  const up = P.dropdownLayerPlan(low, clip, vp, 320)
  // 上翻时的贴合口径：列表**下边缘**贴触发框**上边缘** ⇒ gap = 触发框 top − anchorBottom
  ok(up.placement === 'above' && (low.top - up.anchorBottom) <= 2 && (low.top - up.anchorBottom) >= 0,
    'A2 ②贴近底边 ⇒ 自动上翻，且列表下边缘距触发框上边缘 ≤2px（上翻也贴合）', JSON.stringify({ top: up.top, gap: low.top - up.anchorBottom }))
  ok(up.anchorBottom < low.top && up.maxHeight >= 80,
    'A3 ②上翻时锚点是"触发框上边缘"，且高度保底 80px（不许塌成一条缝）', JSON.stringify({ anchorBottom: up.anchorBottom, maxHeight: up.maxHeight }))
  const off = P.layerFixedOffset(clip, true)
  const off2 = P.layerFixedOffset(clip, false)
  ok(off.dx === 0 && off.dy === 44 && off2.dx === 0 && off2.dy === 0,
    'A4 ②包含块偏移：锚在 `#pages-track` 里 ⇒ 减掉它的 left/top（实测差一个 header=44px 就是那条缝）；不在里面 ⇒ 0', JSON.stringify({ off, off2 }))
  ok(/const off = layerFixedOffset\(clip, inside\)/.test(patchSrc) && /plan\.top - off\.dy/.test(patchSrc),
    'A5 ②运行期确实把偏移减掉了（不是只定义了纯函数）')
}

// ③ 一个 select 一个自绘控件 + 工具条那 5 个归 `.bench-rd`
{
  eq(P.BENCH_SELECT_IDS, [], 'A6 ③外壳里不再用 mpw 增强任何 select（原先是 6 个 ⇒ 每个选项后面多出一个「（空）」框）')
  eq(P.BENCH_BAR_SELECT_IDS, ['lang', 'resolution', 'fit', 'dpr', 'fps', 'fx'], 'A7 ③外壳 6 个 select 全部由 `.bench-rd` 独占（一个可见控件）')
  ok(!/'resolution'/.test(mArr ? mArr[1] : ''), 'A8 ③分辨率不再进 mpw 清单（它就是"点完变成两个自适应"的那一处）')
  ok(typeof P.dropToolbarMpwSelects === 'function' && /dropToolbarMpwSelects\(doc\)/.test(patchSrc),
    'A9 ③有"清掉历史遗留第二套控件"的自愈入口，并且 init 路径里真的调了')
  const dropped = P.dropToolbarMpwSelects({ querySelector: () => null, querySelectorAll: () => [] })
  ok(dropped === 0, 'A10 ③自愈入口幂等：桩 DOM 上不抛错、返回 0')
}

// ⑨ 已选/常用（固定顺序、当前项不重复出 tab、上限裁剪）
{
  const items = [{ id: 'a', title: 'A', sub: 'scene · 1 属性 · a' }, { id: 'b', title: 'B', sub: 'web · 1 属性 · b' }, { id: 'c', title: 'C', sub: 'video · 1 属性 · c' }]
  const p1 = P.pinnedPlan(['a', 'b'], items, 'b')
  eq(p1.tabs.map((x) => x.id), ['a'], 'A11 ⑨当前项不在 tab 条里重复出现（它由产物自己的 `#current` 呈现）')
  eq(p1.tabs[0].kind, 'scene', 'A12 ⑨tab 上带**真实类型**（scene/web/video，不是一律 scene）')
  const p2 = P.pinnedPlan(['a', 'b'], items, 'x')
  eq(p2.tabs.map((x) => x.id), ['a', 'b'], 'A13 ⑨没有任何条目 active 时，已选原样列出（顺序 = 固定顺序，位置稳定）')
  const p3 = P.pinnedPlan(['a', 'x', 'b'], items, null)
  eq(p3.tabs.map((x) => x.id), ['a', 'x', 'b'], 'A14 ⑨库列表里暂时没有的 id 也保留（切类型过滤时不"丢已选"）')
  const many = Array.from({ length: 12 }, (_, i) => 'id' + i)
  const p4 = P.pinnedPlan(many, [], null, 8)
  ok(p4.ids.length === 8 && p4.dropped === 4, 'A15 ⑨超过上限（8）丢最旧并如实报 dropped', JSON.stringify({ ids: p4.ids.length, dropped: p4.dropped }))
  eq(P.trackPin(['a', 'b'], 'a', true), ['b', 'a'], 'A16 ⑨重复固定 = 移到末尾（不是插第二条）')
  eq(P.trackPin(['a', 'b'], 'a', false), ['b'], 'A17 ⑨取消固定 = 移除')
  eq(P.trackPin(['a'], 'b', true), ['a', 'b'], 'A18 ⑨新固定 = 追加（位置固定：老的不许被重排到前面）')
}

// ⑩ 库来源四态（不许假装已选）
{
  const zh = 'zh'
  const none = P.librarySourcePlan(zh, { backend: false })
  const def = P.librarySourcePlan(zh, { backend: true, dir: '/lib/dd' })
  const user = P.librarySourcePlan(zh, { backend: true, dir: '/lib/dd', chosen: '/mine/walls' })
  const src = P.librarySourcePlan(zh, { backend: true, dir: '/lib/dd', source: 'user' })
  const empty = P.librarySourcePlan(zh, { backend: true, dir: '' })
  eq([none.kind, def.kind, user.kind, empty.kind], ['none', 'default', 'user', 'empty'],
    'A19 ⑩四态齐全：无后端 / 本机默认 / 用户选的 / 空')
  ok(/默认/.test(def.label) && /还没有选择|未选择|没有选择/.test(def.label) && def.path === '/lib/dd',
    'A20 ⑩服务端给了目录但**没有任何用户选择记录**时，必须写"本机默认目录（你还没有选择）"+ 实际路径',
    def.label)
  ok(user.path === '/mine/walls' && /选择/.test(user.label), 'A21 ⑩有用户选择记录 ⇒ 显示用户选的那份路径', user.path)
  ok(src.kind === 'user', 'A22 ⑩服务端返回 `source:"user"` 时直接采信（不靠 localStorage 猜）')
  ok(def.pathShown.includes('/lib/dd') && none.pathShown.length > 0, 'A23 ⑩路径/占位文案都不为空（不会渲染出一行空白）')
}

// ⑦ 诊断流一行模型 + 视图计划
{
  const e1 = P.diagEntryLine({ seq: 7, ts: Date.UTC(2026, 8, 19, 4, 5, 6), msg: 'renderer started: 62 layers', level: 'info', source: 'renderer' })
  ok(e1.seq === '#7' && /\[renderer\]/.test(e1.line) && /renderer started/.test(e1.line) && e1.clock.length === 8,
    'A24 ⑦一行模型：`HH:MM:SS #seq [source] msg`（服务端形状 seq/ts/msg/level/source）', e1.line)
  const e2 = P.diagEntryLine({ msg: 'shader fail: boom' })
  ok(e2.level === 'error' && e2.source === 'renderer', 'A25 ⑦没有 level 字段时按消息内容判 error（与产物同口径）')
  ok(P.parseDiagEvent('{"seq":1,"msg":"hi"}').msg === 'hi' && P.parseDiagEvent('plain text').msg === 'plain text' && P.parseDiagEvent('') === null,
    'A26 ⑦SSE 载荷容错：JSON / 纯文本 / 空串三种都不抛')
  const v1 = P.logsViewPlan('logs'); const v2 = P.logsViewPlan('diag'); const v3 = P.logsViewPlan('bogus')
  ok(v1.copySelector === '#logbody' && v2.copySelector === '#diag-body' && v2.isDiag && v3.view === 'logs',
    'A27 ⑦⑥复制/清空按当前页签取文本；非法视图回落 logs')
}

// ⑨/类型：真实类型标签归一（大小写、gif）
{
  eq([P.kindOfSub('scene · 104 属性 · 3326873240'), P.kindOfSub('Scene · 35 属性 · 1'), P.kindOfSub('web · 1 属性 · 2'), P.kindOfSub('Web · 1 属性 · 3'), P.kindOfSub('video · 1 属性 · 4'), P.kindOfSub('gif · 1 属性 · 5'), P.kindOfSub('')],
    ['scene', 'scene', 'web', 'web', 'video', 'video', 'unknown'],
    'A28 类型标签归一：服务端的 `Scene`/`Web` 与 `gif` 都映射到三档小写（用户补充要求③）')
  const rows = P.wpPanelRows([{ id: 'a', title: 'A', sub: 'Web · 1 属性 · a' }], ['a'])
  ok(rows.length === 1 && rows[0].kind === 'web' && rows[0].tag === 'web' && rows[0].pinned === true,
    'A29 面板行：真实类型 + 已固定标记', JSON.stringify(rows[0]))
}

// 库目录对话框（/api/fs/* 未落地 ⇒ 降级，且系统选择器只作兜底）
{
  const noRoute = P.dirDialogPlan(false, true)
  const noBackend = P.dirDialogPlan(false, false)
  const okPlan = P.dirDialogPlan(true, true)
  ok(noRoute.mode === 'fallback' && noRoute.noticeKey === 'pickd.noRoute' && noRoute.showSystem === true,
    'A30 库目录对话框：路由 404 但后端在 ⇒ 明确提示"服务端还没有 /api/fs/* 这条路由"（不静默失败）', JSON.stringify(noRoute))
  ok(noBackend.mode === 'fallback' && noBackend.noticeKey === 'pickd.noBackend', 'A31 静态托管 ⇒ 提示"没有本机后端"（另一种降级文案）')
  ok(okPlan.mode === 'server' && okPlan.confirmKey === 'pickd.here', 'A32 路由在 ⇒ server 模式（应用内浏览 + 就选这个目录）')
  const r = P.fsRootsPlan({ ok: true, roots: [{ label: 'Home', path: '/root' }, { path: '/srv' }, { label: 'bad', path: '' }] })
  eq(r.roots.map((x) => x.path), ['/root', '/srv'], 'A33 `/api/fs/roots` 规范化：丢掉没有 path 的项，label 缺省用 path')
  const e = P.fsEntriesPlan({ ok: true, path: '/a', parent: '/', entries: [{ name: 'b', type: 'dir', path: '/a/b' }, { name: 'z.mp4', type: 'file', path: '/a/z.mp4' }, { name: '', type: 'dir' }] })
  eq(e.rows.map((x) => x.type + ':' + x.name), ['dir:b', 'file:z.mp4'], 'A34 `/api/fs/list` 规范化：目录在前、文件在后、无名项丢掉')
  ok(e.parent === '/', 'A35 `parent` 透传（上一级按钮靠它，不靠字符串拼路径）')
}

// ①(P-159) 指针"离开不再归中"
{
  const d = P.pointerParkAction({ enabled: true, hasApi: true, parked: false })
  ok(d.park === true && d.leave === true && d.push === false && d.u === undefined,
    'A36 ①(P-159) 默认"离开"= 只发 pointerLeave、**不推活坐标**（旧默认的 0.5,0.5 活指针就是尾迹被拽到中心的成因）', JSON.stringify(d))
  const c = P.pointerParkAction({ enabled: true, hasApi: true, parked: false, mode: 'center' })
  ok(c.push === true && c.u === 0.5 && c.v === 0.5 && c.reason === 'leave-center',
    'A37 ①`?ppark=center` 保留旧的"归中"行为（显式逃生口）', JSON.stringify(c))
  ok(P.pointerParkAction({ enabled: false, hasApi: true, parked: false }).park === false &&
    P.pointerParkAction({ enabled: true, hasApi: false }).park === false &&
    P.pointerParkAction({ enabled: true, hasApi: true, parked: true }).park === false,
    'A38 ①`?ppark=0`（flag-off）/ 没有渲染器 API / 已 park 三种都不动作（回退口没被删）')
  ok(P.readPatchFlags('').pparkMode === 'leave' && P.readPatchFlags('?ppark=center').pparkMode === 'center' &&
    P.readPatchFlags('?ppark=0').ppark === false && P.readPatchFlags('?ppark=1').pparkMode === 'leave',
    'A39 ①`readPatchFlags` 把 mode 与开关分开：默认 leave、`=center` 归中、`=0` 整体关闭')
  ok(/if \(act\.push && typeof api\.pushPointer === 'function'\)/.test(patchSrc),
    'A40 ①调用点只在 `act.push` 时才推坐标（源码级钉子）')
}

// ══════════════════════════════ B 静态纪律 ══════════════════════════════
console.log('== B 静态纪律 ==')

// ①④ 工具条换行的前提：`#main` 的内层列必须钉成 minmax(0,1fr)（否则产物那条 `auto` 会被内容撑到 2279px）
ok(/#main\{grid-column:3;grid-template-columns:minmax\(0,1fr\)!important;/.test(staticCss) &&
  cssItems.includes('#main{grid-column:3;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto minmax(140px,1fr) 6px minmax(60px,var(--mpw-logs-h,220px))!important}'),
  'B1 ①④`#main` 内层单列钉成 `minmax(0,1fr)`（工具条换行/预览不被顶掉的前提），静态表与 SITE_LAYOUT_CSS 同文')
ok(htmlSrc.includes("#toolbar{max-height:30vh;overflow-y:auto;flex-wrap:wrap;max-width:100%;overflow-x:hidden}"),
  'B2 ①工具条：换行 + 限宽 + 超高纵向滚动（窄屏也完整可达）')
ok(/#main\.logs-collapsed #clear-logs\{display:inline-flex!important\}/.test(staticCss),
  'B3 ⑥收起态也保留「清空」按钮（压掉产物 `#main.logs-collapsed #clear-logs{display:none}`）')

// ⑤⑧ 舞台：容器查询恢复（宽屏）+ 只钉等比（尺寸交回产物 `:not(.fixed-res)` 那条）
ok(/#stage-frame\{container-type:size!important;padding:12px\}/.test(staticCss) &&
  /#stage-scale\{aspect-ratio:16\/9\}/.test(staticCss),
  'B4 ⑤⑧宽屏恢复 `container-type:size` + 只钉 `aspect-ratio`（尺寸交给产物容器查询 ⇒ 容器内最大 16:9）')
ok(!/#stage-scale\{width:100%!important;height:auto!important/.test(stripComments(staticCss)),
  'B5 ⑤⑧不再用 `width:100%!important` 覆盖尺寸（那会让 `.fixed-res` 的内联缩放盒失效、画面被放大裁切）',
  norm((staticCss.match(/#stage-scale\{[^}]*\}/g) || []).join(' | ')).slice(0, 90))
ok(/html\.bench-shell\.bench-narrow #stage-frame\{container-type:normal!important/.test(staticCss),
  'B6 ⑤窄屏块仍然关掉容器查询（2026-09-18 的窄屏修复没被本批改坏）')

// ③b 被 `.bench-rd` 接管的原生 select 必须视觉隐藏（这条以前是 mpw 干的）
ok(/#stage-scale\{aspect-ratio:16\/9\}/.test(staticCss) && /select\.bench-rd-native\{display:none!important\}/.test(staticCss) &&
  cssItems.includes('select.bench-rd-native{display:none!important}'),
  'B4b ③`select.bench-rd-native{display:none!important}` 在位（静态表 + SITE_LAYOUT_CSS 同文）——' +
  '工具条改用 `.bench-rd` 独占后，原生 select 不再有 mpw 给的 `hidden`，不加这条就会多露出 5 个下拉框')
ok(/sel\.classList\.add\('bench-rd-native'\)/.test(patchCode),
  'B4c ③`bindDropdown` 仍然给被接管 select 打 `bench-rd-native`（CSS 的隐藏挂点没漂）')

// ⑨ 切换栏结构：`#wp-add` 在 `#wp-switch` 里（不在 `#editor-tabs` 里，不再跟着当前项跑）+ 面板静态存在
ok(/<div id="wp-switch">[\s\S]{0,1200}<div id="editor-tabs">[\s\S]{0,400}<button type="button" id="wp-add"/.test(htmlSrc),
  'B7 ⑨`#wp-add` 是 `#wp-switch` 的直接子节点（固定位置；旧实现把它 insertBefore 到当前 tab 后面 ⇒ 加号会跑）')
ok(/id="editor-tabs"[\s\S]{0,900}<div id="wp-panel" hidden/.test(htmlCode) && /id="wp-panel-list"/.test(htmlCode) && /id="wp-type-mirror"/.test(htmlCode),
  'B8 ⑨库列表面板是**静态存在 + 默认 hidden**（显式展开才显示）')
ok(!/insertBefore\(addBtn/.test(patchCode), 'B9 ⑨运行期不再移动 `#wp-add`（"点不动/触控位置不明"的一半根因）')
ok(/id="type-filter"/.test(htmlCode) && (htmlCode.match(/id="type-filter"/g) || []).length === 1 &&
  !(() => { const i = htmlCode.indexOf('id="bench-legacy-anchors"'); if (i < 0) return false; return htmlCode.slice(i, i + 900).includes('type-filter') })(),
  'B10 类型过滤宿主只有一处且**不在隐藏的兼容锚点容器里**（旧位置 = 页面永远看不到 web/video 的根因之一）')
ok(!/\['#type-filter', 'onclick'\]/.test(patchSrc) && /#type-filter` 从这个清单里去掉了/.test(patchSrc),
  'B11 运行期不再把 `#type-filter` 当"已删功能"摘处理器（`onclick=null` + `hidden` 会把类型过滤焊死）')
ok(/driveBundleType/.test(patchSrc) && /typeHost\.onclick/.test(patchSrc) && /mergeAllTypes/.test(patchSrc),
  'B12 类型过滤由产物自己的委托处理器驱动（不复制它的过滤逻辑），「全部」= 三档合并（节点搬移保 `li.onclick`）')

// ⑥⑦ 输出栏两个真页签 + 诊断视图容器
ok(/<button type="button" id="tab-logs"[^>]*role="tab"/.test(htmlSrc) && /<button type="button" id="tab-diag"[^>]*role="tab"/.test(htmlSrc) &&
  /<pre id="diag-body"/.test(htmlSrc),
  'B13 ⑥⑦「输出 / 渲染器诊断」是真页签（`#tab-logs` / `#tab-diag`）+ `#diag-body` 视图容器')
ok(/new EventSource\('\/api\/diag-stream'\)/.test(patchSrc) && /ensureDiagStream/.test(patchSrc) &&
  /\/api\/diag-stream/.test(patchSrc.split('ensureDiagStream')[1] || ''),
  'B14 ⑦自己订阅 `/api/diag-stream`（懒连接：第一次打开诊断页签才连）')
ok(/DIAG_MAX_LINES = 400/.test(patchSrc) && /children\.length > DIAG_MAX_LINES/.test(patchSrc),
  'B15 ⑦诊断视图有环形上限（400 行；本机 15GB 安卓环境长跑不能无限涨）')

// ⑩⑪ 库来源行 + 双方共同署名
ok(/<span id="lib-source"/.test(htmlSrc) && /paintLibSource/.test(patchSrc) && /librarySourcePlan/.test(patchSrc),
  'B16 ⑩「当前库来源」有静态挂点 + 运行期绘制')
ok(/id="credit-repo-footer"/.test(htmlSrc) && /\['#credit-repo-footer', 'text', 'credit\.repo'\]/.test(patchSrc),
  'B17 ⑪设置弹层里新增"本仓库作者"那一行，并且进了标签同步清单（随语言切换）')
ok(/id="credit-link-footer" href="https:\/\/github\.com\/oneincase\/webwallgl"/.test(htmlSrc) &&
  /href="\.\/LICENSE-webwallgl-MIT\.txt"/.test(htmlSrc) && /href="\.\/LICENSE-webwallgl"/.test(htmlSrc),
  'B18 ⑪上游链接与两份许可全文入口一个字没动（D5 的钉子继续成立）')
ok(/credit\.title":"渲染核心：双方共同署名/.test(patchSrc) && /credit\.repo":"本仓库作者/.test(patchSrc) &&
  /credit\.link":"上游作者/.test(patchSrc),
  'B19 ⑪中英双语的归属文案都改成"双方共同署名"（本仓库作者 + 上游 oneincase/webwallgl）')

// 新增文案键中英齐全（缺键会退化成键名）
{
  const zh = Object.keys(P.DICT.zh); const en = Object.keys(P.DICT.en)
  const missEn = zh.filter((k) => !en.includes(k)); const missZh = en.filter((k) => !zh.includes(k))
  ok(missEn.length === 0 && missZh.length === 0, 'B20 新文案键中英齐全（DICT 两份键集合相等）', JSON.stringify({ missEn: missEn.slice(0, 5), missZh: missZh.slice(0, 5) }))
  const used = ['libsrc.default', 'libsrc.user', 'libsrc.empty', 'libsrc.none', 'wp.pinned', 'wp.lib', 'wp.pin', 'wp.unpin',
    'wp.type.all', 'wp.type.scene', 'wp.type.web', 'wp.type.video', 'diag.empty', 'diag.count', 'diag.lost', 'pickd.noRoute',
    'pickd.noBackend', 'pickd.here', 'pickd.system', 'pickd.frontend', 'credit.repo']
  const missing = used.filter((k) => !P.DICT.zh[k] || !P.DICT.en[k])
  ok(missing.length === 0, 'B21 本批用到的 21 个键两份词典里都在（无键名原文泄漏）', JSON.stringify(missing))
}

// ══════════════════════════════ C RED-IF-REVERTED（变异在 /tmp，真树只读） ══════════════════════════════
console.log('== C RED-IF-REVERTED（真树只读，变异在 /tmp 副本） ==')
{
  const sha = (f) => { const c = fs.readFileSync(f); return c.length + ':' + c.subarray(0, 32).toString('hex') }
  const before = sha(PATCH)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-shell-fix-'))
  const mut = path.join(tmp, 'bench-patch.mutant.mjs')
  // 变异①：把"离开不推坐标"改回旧的"推到中心"（`act.push` 恒 true + u/v 常量）
  const mutantA = patchSrc
    .replace("return { park: true, reason: 'leave', leave: true, push: false, buttons: 0 }",
      "return { park: true, reason: 'leave', leave: true, push: true, u: 0.5, v: 0.5, buttons: 0 }")
  ok(mutantA !== patchSrc, 'C1 变异①锚点命中（把默认 park 改回推中心）')
  const fixImports = (t) => t
    .replace("from './mpw-select.js'", "from '" + pathToFileURL(path.join(ROOT, 'demo/mpw-select.js')).href + "'")
    .replace("from './mpw-select-math.mjs'", "from '" + pathToFileURL(path.join(ROOT, 'demo/mpw-select-math.mjs')).href + "'")
  fs.writeFileSync(mut, fixImports(mutantA))
  const MA = await import(pathToFileURL(mut).href)
  const dA = MA.pointerParkAction({ enabled: true, hasApi: true, parked: false })
  ok(dA.push === true && dA.u === 0.5, 'C2 ★ 变异①生效：A36（"默认不许推中心"）在变异体里必红', `变异 push=${dA.push} u=${dA.u}`)
  // 变异②：把 `#main` 的内层列改回产物那条 `auto`（工具条重新被撑爆）
  const mutantB = patchSrc.replace(/#main\{grid-column:3;grid-template-columns:minmax\(0,1fr\)!important;/, '#main{grid-column:3;')
  ok(mutantB !== patchSrc, 'C3 变异②锚点命中（`#main` 内层列改回 auto）')
  const mutB = path.join(tmp, 'bench-patch-mutantB.mjs')
  fs.writeFileSync(mutB, fixImports(mutantB))
  await import(pathToFileURL(mutB).href)                    // 变异体必须仍能加载（否则红的原因不是断言）
  const bItems = (mutB.match && (fs.readFileSync(mutB, 'utf8').match(/const SITE_LAYOUT_CSS = \[([\s\S]*?)\]\.join\(''\)/) || [])[1]) || ''
  ok(!/grid-template-columns:minmax\(0,1fr\)!important/.test(bItems),
    'C4 ★ 变异②生效：B1（"#main 内层列钉死"）在变异体里必红',
    (bItems.match(/'#main\{[^']*'/) || ['(none)'])[0].slice(0, 80))
  // 变异③：把 `?ppark=center` 的逃生口删掉（只剩 leave）
  const mutantC = patchSrc.replace("  if (e.mode === 'center') return { park: true, reason: 'leave-center', leave: true, push: true, u: 0.5, v: 0.5, buttons: 0 }", '')
  ok(mutantC !== patchSrc, 'C5 变异③锚点命中（删掉 center 逃生口）')
  const mutC = path.join(tmp, 'bench-patch-mutantC.mjs')
  fs.writeFileSync(mutC, fixImports(mutantC))
  const MC = await import(pathToFileURL(mutC).href)
  const cC = MC.pointerParkAction({ enabled: true, hasApi: true, parked: false, mode: 'center' })
  ok(cC.push === false, 'C6 ★ 变异③生效：A37（`?ppark=center` 仍能归中）在变异体里必红', `变异 push=${cC.push}`)
  ok(sha(PATCH) === before, 'C7 真树 `demo/bench-patch.js` 跑前跑后一致（变异只落 /tmp）', before.slice(0, 20))
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n── 汇总：PASS=${pass} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
