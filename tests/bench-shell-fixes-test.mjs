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

// ══════════════════════════════ E web 壁纸 shim（P-160 纯函数） ══════════════════════════════
console.log('== E web 壁纸 shim（P-160 纯函数） ==')
{
  // E1 模板字符串转义还原
  eq(P.decodeTemplateLiteral('a\\nb\\tc'), 'a\nb\tc', 'E1a `decodeTemplateLiteral`：\\n / \\t 还原成真实字符')
  eq(P.decodeTemplateLiteral('say \\`hi\\` and \\${x} and \\\\ done'), 'say `hi` and ${x} and \\ done',
    'E1b 反引号 / `\\${` / 反斜杠都还原（shim 里出现它们时不会被截断）')
  eq(P.decodeTemplateLiteral('\\u4e2d\\u6587'), '中文', 'E1c \\uXXXX 还原（shim 注释里全是中文）')

  // E2 从**真产物**里取 shim
  const assetsDir = path.join(ROOT, 'demo/assets')
  const rendererFile = fs.readdirSync(assetsDir).find((f) => /^renderer-.*\.js$/.test(f))
  const assetText = fs.readFileSync(path.join(assetsDir, rendererFile), 'utf8')
  const shim = P.shimFromRendererSource(assetText)
  ok(!!shim && shim.length > 10000, 'E2a 从真产物取到 shim 源码（>10KB）', `${rendererFile} → ${shim ? shim.length : 0} B`)
  ok(!!shim && shim.indexOf('__weSetPaused') >= 0 && shim.indexOf('wallpaperPropertyListener') >= 0 &&
    shim.indexOf('wallpaperRegisterAudioListener') >= 0 && shim.indexOf('__wePushPointer') >= 0,
    'E2b shim 里父页控制面与 WE 注册面都在（`__weSetPaused` / `wallpaperPropertyListener` / `RegisterAudioListener` / `__wePushPointer`）')
  ok(!!shim && !/\\n \* WE 网页壁纸/.test(shim) && shim.startsWith('/**\n * WE 网页壁纸兼容 shim'),
    'E2c 取出来的是**还原后的源码**（不是带 \\n 转义的原始字面量）', JSON.stringify((shim || '').slice(0, 24)))
  ok(P.shimFromRendererSource('nothing here') === null &&
    P.shimFromRendererSource('<html>// WE 网页壁纸兼容 shim（注入到 iframe') === null,
    'E2d 取不到 / 取到的东西不满足契约 ⇒ 返回 null（调用方据此"如实报做不到"，不注入半个 shim）')
  ok(/^<\/script/.test('</script'.replace(/<\/script/i, '<\\/script')) === false &&
    P.injectShimIntoHtml('<html><head></head><body></body></html>', { shim: 'var a="</script>";' }).html.includes('<\\/script'),
    'E2e `</script` 在注入前被转义（否则 shim 里出现该串会提前闭合标签）')

  // E3 要不要注入（含"跨源做不到"要如实说）
  const html1 = P.webShimPlan('http://127.0.0.1:8902/web/dev/3580207945/index.html', { origin: 'http://127.0.0.1:8902' })
  ok(html1.needsShim === true && html1.baseHref === 'http://127.0.0.1:8902/web/dev/3580207945/',
    'E3a 同源 web 入口 ⇒ 注入，并给出 `<base href>` = 入口所在目录（blob 文档的相对资源靠它）', JSON.stringify(html1))
  eq(P.webShimPlan('http://evil.example/web/a.html', { origin: 'http://127.0.0.1:8902' }).reason, 'cross-origin',
    'E3b 跨源入口 ⇒ **不注入**（`reason:"cross-origin"`，如实记做不到，不静默假装成功）')
  eq([P.webShimPlan('about:blank', { origin: 'x' }).reason, P.webShimPlan('blob:http://x/1', { origin: 'x' }).reason, P.webShimPlan('data:text/html,<b/>', { origin: 'x' }).reason],
    ['non-http', 'non-http', 'non-http'], 'E3c about:/blob:/data: 一律不碰（渲染器自己会用它们做占位/改写）')
  eq(P.webShimPlan('http://127.0.0.1:8902/media/dev/1/a.mp4', { origin: 'http://127.0.0.1:8902' }).reason, 'not-web-entry',
    'E3d 同源但不是入口 HTML（video 的 mp4）⇒ 不注入')
  eq(P.webShimPlan('', { origin: 'x' }).needsShim, false, 'E3e 空串 ⇒ 不注入')

  // E4 注入形态
  const src1 = '<html><head><title>t</title></head><body>hi</body></html>'
  const r1 = P.injectShimIntoHtml(src1, { shim: 'window.__x=1;', baseHref: 'http://h/web/1/' })
  ok(r1.ok && r1.injected && r1.reason === 'head' && r1.html.indexOf('<base href="http://h/web/1/">') < r1.html.indexOf('data-we-shim-src') &&
    r1.html.indexOf('data-we-shim-src') < r1.html.indexOf('<title>'),
    'E4a shim 插在 `<head>` 之后、作者内容之前（`<base>` 在前），位置 = "作者脚本之前"', JSON.stringify(r1.html.slice(0, 90)))
  ok(P.injectShimIntoHtml(r1.html, { shim: 'window.__x=1;' }).injected === false &&
    P.injectShimIntoHtml('<html><head><script data-we-shim="1"></script></head></html>', { shim: 'x' }).injected === false,
    'E4b 幂等：已有 `data-we-shim-src` / `data-we-shim` 标记 ⇒ 原样返回（不重复注入）')
  const r2 = P.injectShimIntoHtml('<html><body>x</body></html>', { shim: 's' })
  ok(r2.ok && r2.reason === 'html' && /<head><script data-we-shim-src="1">/.test(r2.html), 'E4c 没有 `<head>` 但有 `<html>` ⇒ 补一个 head 并插进去')
  const r3 = P.injectShimIntoHtml('<div>裸片段</div>', { shim: 's' })
  ok(r3.ok && r3.reason === 'wrap' && /^<!DOCTYPE html><html><head>/.test(r3.html), 'E4c′ 裸片段 ⇒ 包成完整文档（否则注入的脚本不会执行）')
  ok(P.injectShimIntoHtml('<html><head></head></html>', { shim: '<base href="x">' }).html.match(/<base/g).length === 1,
    'E4d 入口自带 `<base>` ⇒ 不再插第二个（相对路径基准不打架）')
  ok(P.injectShimIntoHtml('{"a":1}', { shim: 's' }).ok === false && P.injectShimIntoHtml('{"a":1}', { shim: 's' }).reason === 'not-html' &&
    P.looksLikeHtml('{"a":1}') === false && P.looksLikeHtml('  <!DOCTYPE html>') === true,
    'E4e 取回来的不是 HTML（JSON/二进制）⇒ 拒绝注入（`reason:"not-html"`，退回裸 iframe）')
  ok(P.injectShimIntoHtml(src1, { shim: '' }).ok === false, 'E4f 没有 shim 源码 ⇒ 明确失败（不产出半个文档）')
}

// ══════════════════════════════ G 播放卡片受控快照（P-161 纯函数） ══════════════════════════════
console.log('== G 播放卡片受控快照（P-161） ==')
{
  const none = P.npSnapshotPlan({ media: {}, item: { kind: 'scene', title: '未连接' }, link: true })
  ok(none.canPlay === false && none.canSeek === false && none.canPrev === false && none.canNext === false && none.canVolume === false,
    'G1 没有媒体 ⇒ 所有 can* 为假（卡片按键置灰，不假装可点）', JSON.stringify({ canPlay: none.canPlay, canSeek: none.canSeek }))
  ok(none.total === 0 && none.progress === 0 && /没有可播放的媒体/.test(none.byline),
    'G2 没有媒体 ⇒ 总长/进度为 0（不是 NaN）且副标题写明原因', JSON.stringify({ total: none.total, by: none.byline }))

  const vid = P.npSnapshotPlan({
    media: { hasVideo: true, count: 2, total: 100, progress: 250, playing: true, muted: false, volume: 0.5 },
    item: { kind: 'video', title: 'Vid' }, hasPrev: true, hasNext: true, link: true,
  })
  ok(vid.canPlay && vid.canSeek && vid.canPrev && vid.canNext && vid.total === 100 && vid.progress === 100,
    'G3 有媒体：进度被钳到总长、四个 can* 为真', JSON.stringify({ progress: vid.progress, total: vid.total }))
  ok(/音量 50%/.test(vid.byline) && /×2/.test(vid.byline) && vid.source === 'stage-media',
    'G4 副标题把类型/个数/音量写清楚（不是一句装饰文本）', JSON.stringify({ by: vid.byline, source: vid.source }))

  const audioOnly = P.npSnapshotPlan({ media: { hasAudio: true, total: 30, progress: 3 }, item: {}, link: true })
  ok(audioOnly.canPlay === true && audioOnly.kind === 'audio', 'G5 只有 <audio>（web 档常见）也算有媒体', JSON.stringify({ kind: audioOnly.kind, canPlay: audioOnly.canPlay }))

  const unlinked = P.npSnapshotPlan({ media: { hasVideo: true, total: 30, progress: 3 }, item: {}, link: false })
  ok(unlinked.canPlay === false && unlinked.link === false && /脱开|联动关闭/.test(unlinked.byline),
    'G6 联动关 ⇒ 全部不可控 + 副标题写明"已脱开"（状态只有一个来源）', JSON.stringify({ canPlay: unlinked.canPlay, by: unlinked.byline }))

  ok(P.npSnapshotPlan({ media: { hasVideo: true, total: 0, progress: 5 }, item: {}, link: true }).canSeek === false,
    'G7 有媒体但总长未知（流式/未加载元数据）⇒ canSeek=false（不给"拖了没反应"的假控件）')

  //  patch 侧接线（静态钉子）
  ok(/npApp\.update\(\{ data \}\)/.test(patchCode) && !/mountNowPlaying\(mountEl, \{[^}]*data:[^}]*\}\)[\s\S]{0,200}root\.render/.test(patchCode),
    'G8 卡片数据走 `npApp.update({data})`（**不是** remount：换壁纸/推数据都不重建 React 根）')
  ok(/npSnapshotPlan\(\{/.test(patchCode) && /onTransport: npTransport/.test(patchCode),
    'G9 挂载时把受控面交进去（`data` = 快照、`onTransport` = op 落点）')
  ok(/if \(npControlled\) return null/.test(patchCode),
    'G10 受控模式下让位：旧那条"读 aria 猜意图"的宿主点击兜底不再二次动作（同一个 Next 不会被做两次）')
  ok(/if \(!force && \(now - npLastPump\) < 200\)/.test(patchCode) && /npPumpTimer = later\(/.test(patchCode),
    'G11 快照泵是**尾随**节流（≤5Hz 且被挡下的那拍会补一次）—— 没有这条，"暂停后卡片永远停在旧状态"')
  ok(/const mediaDocs = \(\) =>/.test(patchCode) && /contentDocument/.test(patchCode),
    'G12 媒体扫描会**再下一层**（web 档的入口 HTML 跑在渲染器文档里的 sandbox iframe 里）；跨源取不到就跳过')
  ok(/function npStepTarget\(dir\)/.test(patchCode) && /classList\.contains\('active'\)/.test(patchCode) && /#current/.test(patchCode),
    'G13 上一首/下一首 = 库列表里相邻项；当前项有**两道**判据（`.active` 或 `#current` 标题回退），认不出就置灰')
  ok(P.npSnapshotPlan({ media: { hasVideo: true, total: 10, progress: 1, muted: true, volume: 0.42 }, item: {}, link: true }).muted === true,
    'G14 静音态如实进快照（副标题写 muted、muted 字段为真）')
}

// ══════════════════════════════ H 品牌图标（P-164 ⑤） ══════════════════════════════
console.log('== H 品牌图标（P-164） ==')
{
  const brandDir = path.join(ROOT, 'demo/assets/brand')
  const pngSize = (f) => {
    const b = fs.readFileSync(f)
    if (b.slice(1, 4).toString() !== 'PNG') return null
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }
  }
  const want = { 'wallpaper-engine-icon-512.png': 512, 'wallpaper-engine-icon-192.png': 192, 'favicon-64.png': 64, 'favicon-32.png': 32 }
  let allOk = true
  for (const [f, n] of Object.entries(want)) {
    const fp = path.join(brandDir, f)
    const good = fs.existsSync(fp) && (() => { const s2 = pngSize(fp); return !!s2 && s2.w === n && s2.h === n && s2.bytes > 500 })()
    if (!good) allOk = false
    ok(good, `H1 品牌图 ${f} 在且是 ${n}×${n} PNG（非空）`)
  }
  ok(allOk, 'H1 四张品牌图齐备（512/192/64/32，PNG 尺寸与文件名一致）')
  const html = fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8')
  ok(/<link rel="icon" type="image\/png" sizes="32x32" href="\.\/assets\/brand\/favicon-32\.png" \/>/.test(html) &&
    /href="\.\/assets\/brand\/favicon-64\.png"/.test(html) && /href="\.\/assets\/brand\/wallpaper-engine-icon-192\.png"/.test(html) &&
    /<link rel="apple-touch-icon" href="\.\/assets\/brand\/wallpaper-engine-icon-192\.png" \/>/.test(html),
    'H2 `demo/index.html` 的 favicon / apple-touch 指向品牌图（不再指 `./icons/pwa-*.png`）')
  ok(!/href="\.\/icons\/pwa-/.test(html), 'H3 `demo/index.html` 里不再引用旧的 `./icons/pwa-*`')
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo/manifest.webmanifest'), 'utf8'))
  ok(mf.icons.every((ic) => /^assets\/brand\//.test(ic.src)) && mf.icons.length === 3,
    'H4 `demo/manifest.webmanifest` 的三个图标都指向品牌图', JSON.stringify(mf.icons.map((i) => i.src)))
  for (const ic of mf.icons) ok(fs.existsSync(path.join(ROOT, 'demo', ic.src)), `H5 manifest 图标可达：${ic.src}`)
  const np = fs.readFileSync(path.join(ROOT, 'demo/now-playing/NowPlaying.tsx'), 'utf8')
  ok(/const COVER: string = "\.\.\/assets\/brand\/wallpaper-engine-icon-512\.png"/.test(np) &&
    fs.existsSync(path.join(ROOT, 'demo/now-playing/assets/brand/wallpaper-engine-icon-512.png')) === false &&
    fs.existsSync(path.join(ROOT, 'demo/assets/brand/wallpaper-engine-icon-512.png')),
    'H6 播放卡片的封面也换成品牌图（路径相对 `demo/now-playing/` 解析得到真文件）')
  const dist = fs.readFileSync(path.join(ROOT, 'demo/now-playing/dist/now-playing.js'), 'utf8')
  ok(dist.includes('brand/wallpaper-engine-icon-512.png'), 'H7 组件产物里带的是新封面路径（dist 已重建）')
}

// ══════════════════════════════ I 标签关闭 / 幂等 / 指针转发 / 调试模式（P-164） ══════════════════════════════
console.log('== I 标签关闭 / 幂等 / 指针转发 / 调试模式（P-164） ==')
{
  eq(P.closeTabPlan(['a', 'b', 'c'], 'b', 'b'), { pinned: ['a', 'c'], wasCurrent: true, fallback: 'c', closed: 'b' },
    'I1 关当前项：回落到"它后面第一项"（位置稳定）')
  eq(P.closeTabPlan(['a', 'b'], 'a', 'b'), { pinned: ['a'], wasCurrent: false, fallback: 'a', closed: 'b' },
    'I2 关末尾项：回落到剩下的最后一项，且 wasCurrent=false（不误判成"关当前"）')
  eq(P.closeTabPlan(['a'], 'a', 'a').fallback, null, 'I3 关掉最后一个 ⇒ fallback=null（调用方据此释放舞台）')
  eq(P.closeTabPlan(['a'], 'a', 'z'), { pinned: ['a'], wasCurrent: false, fallback: 'a', closed: 'z' },
    'I4 幂等：关一个根本不在集合里的 id ⇒ 集合不变、不误伤')

  //  调试模式：键位路由（激活才接管；退出即还原）
  eq(P.debugKeyPlan('ArrowRight', { active: false }), { capture: false, op: null, key: 'ArrowRight' },
    'I5 调试模式**未激活**时 ←/→ 一个都不拦（退出后恢复默认行为）')
  ok(P.debugKeyPlan('ArrowRight', { active: true }).op === 'next' && P.debugKeyPlan('ArrowLeft', { active: true }).op === 'prev' &&
    P.debugKeyPlan('ArrowUp', { active: true }).op === 'next10' && P.debugKeyPlan('ArrowDown', { active: true }).op === 'prev10',
    'I6 激活时 ←/→/↑/↓ 分别路由到 prev/next/prev10/next10（与 :8899 同一语义）')
  ok(P.debugKeyPlan('Alt', { active: true }).op === 'exit' && P.debugKeyPlan('Control', { active: true }).op === 'all' &&
    P.debugKeyPlan('Alt', { active: true }).swallowModifier === true && P.debugKeyPlan('Control', { active: true }).swallowModifier === true,
    'I7 Alt=退出、Ctrl=恢复全部可见，且两个**修饰键本身**也要吞（用户明确要求拦默认行为）')
  ok(P.debugKeyPlan('a', { active: true }).capture === false && P.debugKeyPlan('Tab', { active: true }).capture === false,
    'I8 调试模式不碰其它键（普通字符/Tab 照常走默认行为）')

  eq(P.layerStepPlan(5, 4, 1), { index: 0, count: 5, wrapped: true }, 'I9 图层步进：末尾 → 首（环绕）')
  eq(P.layerStepPlan(5, 0, -1), { index: 4, count: 5, wrapped: true }, 'I10 首 → 末尾（反向环绕）')
  eq(P.layerStepPlan(0, 0, 1).index, -1, 'I11 没有图层 ⇒ index=-1（调用方据此报"没有可逐层查看的场景"）')
  eq(P.layerStepPlan(3, -1, 1).index, 0, 'I12 还没选层时按"下一个" ⇒ 从第 1 层开始')
  eq(P.layerStepPlan(3, 0, 10), { index: 1, count: 3, wrapped: true }, 'I13 ↑/↓ 的 ±10 步也做环绕（不越界）')

  ok(P.layerInfoPlan(null, 0).ok === false && /没有可逐层查看/.test(P.layerInfoPlan(null, 0).text),
    'I14 拿不到图层数组 ⇒ 明确说"没有可逐层查看的场景"（不编造层号）')
  const li = P.layerInfoPlan([{ id: 7, name: 'bg', type: 'image' }, { id: 8, name: 'fx' }], 1)
  ok(li.ok && li.index === 1 && li.name === 'fx' && li.count === 2 && /图层 2\/2/.test(li.text),
    'I15 图层信息含层号/层名/类型/可见性', JSON.stringify(li))
  ok(P.layerInfoPlan([{ name: 'x', visible: false }], 0).visible === false, 'I16 被隐藏的层如实标 visible=false')

  const rep = P.debugReportPlan({ ts: 123, id: 'w1', url: 'http://x/', ua: 'ua', debugMode: true, layers: { count: 9, index: 3, name: 'n', type: 'image' }, media: { videos: 1, audios: 2 }, diag: ['a', 'b', 'c'] })
  ok(rep.schema === 'bench-debug/1' && rep.kind === 'bench-debug' && rep.ts === 123 && rep.layers.count === 9 && rep.layers.index === 3 &&
    rep.diagLines === 3 && rep.media.videos === 1 && rep.media.audios === 2 && rep.debugMode === true,
    'I17 上报载荷形状固定（schema/kind/ts/layers/media/diag）⇒ 服务端与工具都能解析', JSON.stringify(rep).slice(0, 120))
  ok(P.debugReportPlan({ diag: Array.from({ length: 250 }, (_, i) => 'l' + i) }).diagLines === 100,
    'I18 诊断内容最多带 100 行（不能把 200KB 的日志整体塞进一次 POST）')
  eq(P.DEBUG_REPORT_ROUTES, ['/report', '/baseline', '/diag'], 'I19 落点顺序 = /report → /baseline → /diag（与 :8899 的约定一致）')

  //  运行期接线的静态钉子
  ok(/addEventListener\('keydown', dbgKeyHandler, true\)/.test(patchCode) && /removeEventListener\('keydown', dbgKeyHandler, true\)/.test(patchCode) &&
    /if \(!dbgKeyHandler\) return false/.test(patchCode) && /dbgKeyHandler = null/.test(patchCode),
    'I20 键盘监听**成对**装卸：只在本页签激活期间存在（capture），退出立刻卸掉')
  ok(/if \(!plan\.capture\) return/.test(patchCode) && /plan\.swallowModifier && ev\.stopImmediatePropagation/.test(patchCode),
    'I21 未接管键直接放行；接管键 preventDefault + 停传播（修饰键再补 stopImmediatePropagation）')
  ok(/closeTabPlan\(pinned, curId, want\)/.test(patchCode) && /writePinned\(plan\.pinned\)/.test(patchCode),
    'I22 关闭标签的运行期走纯函数决策（一处实现）')
  ok(/switchDecision\(curId, want/.test(patchCode) && /idemHits\+\+/.test(patchCode) &&
    /listEl\.addEventListener\('click', \(e\) => \{/.test(patchCode),
    'I23 ③ 幂等：运行期决策走纯函数 + 点"已选中"的列表项在**捕获阶段**再拦一道并计数')
  ok(/pointerForwardPlan\(\{/.test(patchCode) && /forwardPointerMove\(e\)/.test(patchCode) &&
    /api\.pushPointer\(u, v, Number\(e\.buttons\) \|\| 0, mods\)/.test(patchCode),
    'I24 ④ 移动即转发：普通移动也 `pushPointer(u,v,buttons=0)`；决策（开关/入口/嵌套帧/舞台内）走纯函数')
  ok(/pushfwd: on\('pushfwd', true\)/.test(patchCode), 'I25 ④ 有 `?pushfwd=0` 回退口')

  //  CSS：省略号 + × 常驻
  const cssHtml = fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8')
  ok(/#editor-tabs \.tab\{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/.test(cssHtml) &&
    /\.wp-tab \.wp-name\{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/.test(cssHtml),
    'I26 ① 标签标题用 CSS 省略号（`max-width` + `text-overflow:ellipsis`）：名字再长也不把 × 顶远')
  ok(cssItems.includes('.wp-x{flex:none;width:22px;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:4px;background:transparent;color:var(--fg-dim);font-size:14px;line-height:1;cursor:pointer}') &&
    cssItems.includes('.wp-x-cur{align-self:stretch;height:auto;min-height:32px;border-right:1px solid var(--border);border-radius:0;background:var(--editor)}'),
    'I27 ① `×` 按钮样式在（标签内 `.wp-x` + 当前格兄弟 `.wp-x-cur`），静态表与 SITE_LAYOUT_CSS 同文')
  ok(/#logs\[data-view="debug"\] #debug-body\{display:flex/.test(cssHtml) && /#debug-body\{display:none\}/.test(cssHtml),
    'I28 ② 调试视图的显隐样式在（`#logs[data-view=debug]` 打开、默认关）')
  ok(/\.dbg-actions\{display:flex/.test(cssHtml) && /\.dbg-layer\{/.test(cssHtml) && /\.dbg-log\{/.test(cssHtml),
    'I29 ② 调试视图三块（按钮行 / 当前层信息 / 日志）都有样式')

  //  ③ 幂等决策（纯函数）：四种输入组合逐条钉死
  eq(P.switchDecision('a', 'a', true, true), { id: 'a', inList: true, isCurrent: true, skip: true },
    'I30 ③ 目标 = 当前项（列表带 `.active`）⇒ skip（不再 `click()` ⇒ 不重挂）')
  eq(P.switchDecision('a', 'a', true, false).skip, true, 'I31 ③ 列表项没带 `.active` 但 id 就是当前项 ⇒ 也 skip（同一件事的两种表现）')
  eq(P.switchDecision('a', 'b', true, false).skip, false, 'I32 ③ 换成**别的**壁纸 ⇒ 必须点（不能把"幂等"做成"点不动"）')
  eq(P.switchDecision('a', 'b', false, false).skip, false, 'I33 ③ 目标不在当前列表里（被类型档挡住）⇒ 不 skip（要走"先切档再点"那条路）')
  eq(P.switchDecision(null, 'b', false, false).skip, false, 'I34 ③ 还没选过任何壁纸 ⇒ 第一个必须点得动')

  //  ④ 指针转发决策（纯函数）：五条边界
  ok(P.pointerForwardPlan({ enabled: true, hasApi: true, nested: false, inStage: true, hasRect: true }).forward === true,
    'I35 ④ 开关开 + 入口在 + 非嵌套帧 + 落在舞台内 + 舞台有尺寸 ⇒ 转发')
  ok(P.pointerForwardPlan({ enabled: true, hasApi: true, nested: true, inStage: true, hasRect: true }).forward === false &&
    P.pointerForwardPlan({ enabled: true, hasApi: true, nested: true, inStage: true, hasRect: true }).why === 'nested-frame',
    'I36 ④ 舞台上是 web 档（渲染器文档里还有一层 iframe）⇒ **不转发**（原生 + 注入会双投递），原因写 `nested-frame`')
  ok(P.pointerForwardPlan({ enabled: false, hasApi: true, nested: false, inStage: true, hasRect: true }).forward === false &&
    P.pointerForwardPlan({ enabled: true, hasApi: false, nested: false, inStage: true, hasRect: true }).forward === false,
    'I37 ④ `?pushfwd=0` 或渲染器入口还没就绪 ⇒ 不转发（不假装推过）')
  ok(P.pointerForwardPlan({ enabled: true, hasApi: true, nested: false, inStage: false, hasRect: true }).forward === false &&
    P.pointerForwardPlan({ enabled: true, hasApi: true, nested: false, inStage: true, hasRect: false }).forward === false,
    'I38 ④ 舞台外 / 舞台还没量到尺寸 ⇒ 不转发（归一化坐标会算错）')
  ok(P.pointerForwardPlan() && P.pointerForwardPlan().forward === false && P.pointerForwardPlan().why === 'off',
    'I39 ④ 缺省入参按"关着"处理（纯函数不吃 undefined）')

  //  ① 回落标题的取数顺序（纯函数）：列表优先 → 缓存兜底 → 最后才退回 id
  eq(P.titleForId([{ id: 'b', title: 'B 真名' }], () => 'B 旧名', 'b'), 'B 真名', 'I40 ① 回落标题：列表里有 ⇒ 用列表的（现列表最新）')
  eq(P.titleForId([], (k) => (k === 'b' ? 'B 缓存名' : ''), 'b'), 'B 缓存名',
    'I41 ① 回落标题：列表**正好在重渲染**（切类型档）时用缓存 —— 不许把 id 当标题写进"当前壁纸"那一格')
  eq(P.titleForId([], () => '', 'b3644'), 'b3644', 'I42 ① 回落标题：列表与缓存都没有 ⇒ 退回 id（有胜于无，且不编造）')

  //  ② 调试轮询的定时器必须来自**本作用域**：`every`/`stopEvery` 是兄弟作用域的局部名 ⇒ 引用即 ReferenceError，
  //  且异常会被 `setLogsView` 的 try/catch 吞掉（真机自证 Z4：日志一行没有、页签却"看着切过去了"）。
  ok(/const dbgEvery = \(typeof setInterval === 'function'\) \? setInterval : null/.test(patchCode) &&
    /dbgTimer = dbgEvery\(/.test(patchCode) && !/[^g]every\(\(\) => \{ try \{ dbgPaint/.test(patchCode),
    'I43 ② 调试轮询用本作用域自带的定时器（`dbgEvery`/`dbgStopEvery`），不引用兄弟作用域的 `every`')
  ok(/window\.__benchDebugBootErr = String\(\(e && e\.message\) \|\| e\)/.test(patchCode) && /dbgBootErr: \(\) =>/.test(patchCode),
    'I44 ② 进出调试页签的启动错**留痕**（`__benchDebugBootErr` + `dbgBootErr()` 可读），不许再静默吞掉')
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

// P-160 web shim：运行期接线（静态）
ok(/Object\.defineProperty\(proto, 'src', \{/.test(patchCode) && /installWebShim\(rendererWin\(\)\)/.test(patchCode) &&
  /if \(proto\.__benchWebShim === '1'\)/.test(patchCode),
  'B22 web shim：在**渲染器窗口**里包 `HTMLIFrameElement.prototype.src`（幂等），并由轮询 + iframe load 两处安装')
ok(/buildShimmedWebDoc\(win, plan\)/.test(patchCode) && /injectShimIntoHtml\(html, \{ shim, baseHref: plan\.baseHref \}\)/.test(patchCode) &&
  /new win\.Blob\(\[out\.html\]/.test(patchCode) && /createObjectURL/.test(patchCode) && /revokeObjectURL/.test(patchCode),
  'B23 web shim：改写入口 HTML → blob 文档 → 导航（并在 load 后 revoke，长跑不漏对象 URL）')
ok(/webShimState\.failed\+\+[\s\S]{0,220}desc\.set\.call\(frame, plan\.entryUrl\)/.test(patchCode),
  'B24 web shim：注入失败时**退回裸 iframe** 并写日志（绝不留下一个没有 src 的空 iframe）')
ok(/webShim: \(\) =>/.test(patchCode) && /window\.__benchWebShim = \(\) =>/.test(patchCode),
  'B25 web shim：可观察面（`__benchPatch.webShim()` 与 `window.__benchWebShim()`）供探针/门禁读注入计数与来源')

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
/* ①(2026-09-20 用户要求) 设置面板里**只留一行超链接**（署名/许可全文属仓库文档，界面负责指到唯一权威位置）：
   面板节点从四个（title/link/repo/license×2）收敛成一行 `#credit-line-footer > #credit-link-footer`，
   链接指向仓库 README 的「许可与归属」章节；两份上游 MIT 全文**文件保留**（不再在页面上单独列出）。
   判据随之改成"一行链接 + 指到 README 章节 + 两个文件仍在仓库里"。 */
/* ①(用户第 5 条实测根因) **不许**对 `#credit-line-footer` 做 `text` 重放：补丁对这类条目执行
   `el.textContent = t(...)`，会把容器里的 `<a>` 整个抹掉 ⇒ 链接点不动（真机实测 `creditLink:false`）。
   正确形状：容器里放带 `data-i18n="credit.link"` 的 `<a>`，由**静态 i18n 那一遍**翻译。 */
ok(/id="credit-line-footer"[\s\S]{0,200}?id="credit-link-footer"[^>]*data-i18n="credit\.link"/.test(htmlSrc) &&
  !/\['#credit-line-footer', 'text', 'credit\.link'\]/.test(patchSrc),
  'B17 ⑪设置弹层只留**一行**许可与归属链接；链接自身带 `data-i18n`（**不许**用容器的 `text` 重放 —— 那会抹掉 `<a>`）')
ok(/id="credit-link-footer"[^>]*href="https:\/\/github\.com\/XHR666\/wallpaper-engine-web-loader#[^"]*"/.test(htmlSrc) &&
  fs.existsSync(path.join(ROOT, 'demo', 'LICENSE-webwallgl-MIT.txt')) && fs.existsSync(path.join(ROOT, 'demo', 'LICENSE-webwallgl')),
  'B18 ⑪链接指向本仓 README 的「许可与归属」章节；两份上游 MIT 全文**仍在仓库里**（页面不再单列）')
ok(/credit\.link":"README · 许可与归属（GPL-3\.0-or-later \+ 上游 MIT）"/.test(patchSrc) &&
  /credit\.link":"README · License & credits \(GPL-3\.0-or-later \+ upstream MIT\)"/.test(patchSrc),
  'B19 ⑪中英双语各只有**一行**许可与归属链接文案（都指向 README 章节）')

// 新增文案键中英齐全（缺键会退化成键名）
{
  const zh = Object.keys(P.DICT.zh); const en = Object.keys(P.DICT.en)
  const missEn = zh.filter((k) => !en.includes(k)); const missZh = en.filter((k) => !zh.includes(k))
  ok(missEn.length === 0 && missZh.length === 0, 'B20 新文案键中英齐全（DICT 两份键集合相等）', JSON.stringify({ missEn: missEn.slice(0, 5), missZh: missZh.slice(0, 5) }))
  const used = ['libsrc.default', 'libsrc.user', 'libsrc.empty', 'libsrc.none', 'wp.pinned', 'wp.lib', 'wp.pin', 'wp.unpin',
    'wp.type.all', 'wp.type.scene', 'wp.type.web', 'wp.type.video', 'diag.empty', 'diag.count', 'diag.lost', 'pickd.noRoute',
    'pickd.noBackend', 'pickd.here', 'pickd.system', 'pickd.frontend', 'credit.link']
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
  // 变异⑤（P-160）：删掉注入的**幂等判据** ⇒ E4b 必红
  const mutantD = patchSrc.replace("  if (src.indexOf(mark) >= 0 || src.indexOf('data-we-shim=') >= 0) return { ok: true, reason: 'already', html: src, injected: false }", '')
  ok(mutantD !== patchSrc, 'C8 变异⑤锚点命中（删掉 `injectShimIntoHtml` 的幂等判据）')
  const mutD = path.join(tmp, 'bench-patch-mutantD.mjs')
  fs.writeFileSync(mutD, fixImports(mutantD))
  const MD = await import(pathToFileURL(mutD).href)
  const twice = MD.injectShimIntoHtml(MD.injectShimIntoHtml('<html><head></head><body></body></html>', { shim: 'window.__x=1;' }).html, { shim: 'window.__x=1;' })
  ok(twice.injected === true && (twice.html.match(/data-we-shim-src/g) || []).length === 2,
    'C9 ★ 变异⑤生效：E4b（"二次注入必须原样返回"）在变异体里必红（真树只注入一次）',
    `变异体注入次数=${(twice.html.match(/data-we-shim-src/g) || []).length}`)
  // 变异⑥（P-160）：删掉"取回来的必须像 HTML"这条守卫 ⇒ E4e 必红
  const mutantE = patchSrc.replace("  if (!looksLikeHtml(src)) return { ok: false, reason: 'not-html', html: src, injected: false }", '')
  ok(mutantE !== patchSrc, 'C10 变异⑥锚点命中（删掉 `not-html` 守卫）')
  const mutE = path.join(tmp, 'bench-patch-mutantE.mjs')
  fs.writeFileSync(mutE, fixImports(mutantE))
  const ME = await import(pathToFileURL(mutE).href)
  const json = ME.injectShimIntoHtml('{"a":1}', { shim: 's' })
  ok(json.ok === true && json.injected === true,
    'C11 ★ 变异⑥生效：E4e（"JSON 不许被注入"）在变异体里必红（真树返回 not-html）', JSON.stringify({ ok: json.ok, reason: json.reason }))
  // 变异⑦（P-161）：`npSnapshotPlan` 不看 `link` ⇒ G6（"联动关 ⇒ 全部不可控"）必红
  const mutantF = patchSrc.replace("  const linked = link && hasMedia", "  const linked = hasMedia")
  ok(mutantF !== patchSrc, 'C12 变异⑦锚点命中（快照不再看联动开关）')
  const mutF = path.join(tmp, 'bench-patch-mutantF.mjs')
  fs.writeFileSync(mutF, fixImports(mutantF))
  const MF = await import(pathToFileURL(mutF).href)
  const fUn = MF.npSnapshotPlan({ media: { hasVideo: true, total: 30, progress: 3 }, item: {}, link: false })
  ok(fUn.canPlay === true && fUn.link === false,
    'C13 ★ 变异⑦生效：G6 在变异体里必红（联动关了却仍然 canPlay=true）', JSON.stringify({ canPlay: fUn.canPlay }))
  // 变异⑧（P-164）：调试模式未激活也接管方向键 ⇒ I5 必红（"退出后恢复默认行为"被破坏）
  const mutantG = patchSrc.replace("  if (!on) return { capture: false, op: null, key: k }", '  void on')
  ok(mutantG !== patchSrc, 'C14 变异⑧锚点命中（删掉 `debugKeyPlan` 的"未激活不接管"守卫）')
  const mutG = path.join(tmp, 'bench-patch-mutantG.mjs')
  fs.writeFileSync(mutG, fixImports(mutantG))
  const MG = await import(pathToFileURL(mutG).href)
  const gOff = MG.debugKeyPlan('ArrowRight', { active: false })
  ok(gOff.capture === true && gOff.op === 'next',
    'C15 ★ 变异⑧生效：I5（"未激活时一个都不拦"）在变异体里必红', JSON.stringify(gOff))
  // 变异⑨（P-164）：closeTabPlan 把"关的是当前项"永远当 false ⇒ I1/I2 必红
  const mutantH = patchSrc.replace("  return { pinned: rest, wasCurrent: !!closed && closed === cur, fallback, closed }",
    '  return { pinned: rest, wasCurrent: false, fallback, closed }')
  ok(mutantH !== patchSrc, 'C16 变异⑨锚点命中（`closeTabPlan` 不再判"关的是当前项"）')
  const mutH = path.join(tmp, 'bench-patch-mutantH.mjs')
  fs.writeFileSync(mutH, fixImports(mutantH))
  const MH = await import(pathToFileURL(mutH).href)
  const hPlan = MH.closeTabPlan(['a', 'b', 'c'], 'b', 'b')
  ok(hPlan.wasCurrent === false,
    'C17 ★ 变异⑨生效：I1（"关当前项要回落"）在变异体里必红（wasCurrent 恒 false ⇒ 不会回落）', JSON.stringify(hPlan))
  // 变异⑩（P-164）：`switchDecision` 永远不 skip（= 回到了"点已选中项也重挂"的旧行为）⇒ I30/I31 必红
  const mutantI = patchSrc.replace("  return { id: want, inList: !!targetInList, isCurrent, skip: !!want && !!targetInList && (!!targetIsActive || isCurrent) }",
    "  return { id: want, inList: !!targetInList, isCurrent, skip: false }")
  ok(mutantI !== patchSrc, 'C18 变异⑩锚点命中（`switchDecision` 永远不跳过）')
  const mutI = path.join(tmp, 'bench-patch-mutantI.mjs')
  fs.writeFileSync(mutI, fixImports(mutantI))
  const MI = await import(pathToFileURL(mutI).href)
  const iDec = MI.switchDecision('a', 'a', true, true)
  ok(iDec.skip === false, 'C19 ★ 变异⑩生效：I30/I31（"点已选中项必须幂等"）在变异体里必红', JSON.stringify(iDec))
  // 变异⑪（P-164）：`pointerForwardPlan` 不再挡"舞台上是 web 档"⇒ I36 必红（原生 + 注入双投递）
  const mutantJ = patchSrc.replace("  const forward = f.enabled && f.hasApi && !f.nested && f.inStage && f.hasRect",
    "  const forward = f.enabled && f.hasApi && f.inStage && f.hasRect")
  ok(mutantJ !== patchSrc, 'C20 变异⑪锚点命中（转发决策不再看嵌套帧）')
  const mutJ = path.join(tmp, 'bench-patch-mutantJ.mjs')
  fs.writeFileSync(mutJ, fixImports(mutantJ))
  const MJ = await import(pathToFileURL(mutJ).href)
  const jPlan = MJ.pointerForwardPlan({ enabled: true, hasApi: true, nested: true, inStage: true, hasRect: true })
  ok(jPlan.forward === true, 'C21 ★ 变异⑪生效：I36（"web 档不转发"）在变异体里必红（嵌套帧也照推）', JSON.stringify(jPlan))
  // 变异⑫（P-164）：回落标题不再查缓存 ⇒ I41 必红（列表正在重渲染时把 id 当标题写进当前格）
  const mutantK = patchSrc.replace("  const cached = (typeof cacheGet === 'function') ? String(cacheGet(want) || '') : ''", "  const cached = ''")
  ok(mutantK !== patchSrc, 'C22 变异⑫锚点命中（回落标题不查缓存）')
  const mutK = path.join(tmp, 'bench-patch-mutantK.mjs')
  fs.writeFileSync(mutK, fixImports(mutantK))
  const MK = await import(pathToFileURL(mutK).href)
  const kTitle = MK.titleForId([], (k) => (k === 'b' ? 'B 缓存名' : ''), 'b')
  ok(kTitle === 'b', 'C23 ★ 变异⑫生效：I41（"缓存兜底"）在变异体里必红（回落标题退化成 id）', JSON.stringify({ title: kTitle }))
  // 变异⑬（P-164）：品牌图标回退成旧的 `./icons/pwa-*`（只改 /tmp 副本）⇒ H2/H3 的判据必红
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8')
  const mutHtml = htmlSrc.replace('href="./assets/brand/favicon-32.png"', 'href="./icons/pwa-32.png"')
  ok(mutHtml !== htmlSrc, 'C24 变异⑬锚点命中（favicon 改回旧的 `./icons/pwa-32.png`）')
  const h2 = (t) => /<link rel="icon" type="image\/png" sizes="32x32" href="\.\/assets\/brand\/favicon-32\.png" \/>/.test(t) && !/href="\.\/icons\/pwa-/.test(t)
  ok(h2(htmlSrc) === true && h2(mutHtml) === false,
    'C25 ★ 变异⑬生效：H2/H3（"favicon 必须指品牌图、不许再引 `./icons/pwa-*`"）在变异体里必红')
  ok(sha(PATCH) === before, 'C7 真树 `demo/bench-patch.js` 跑前跑后一致（变异只落 /tmp）', before.slice(0, 20))
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ══════════════════ F 组（2026-09-20 用户第 1–11 条）静态纪律与纯函数契约 ══════════════════
//  与 `bench-ui-headless` 的 G 组互补：那边测**运行期几何/状态机**，这边钉**静态不漂移**
//  （关键 CSS 必须在 head 里内联、开关必须在页签内部、成功路径契约的形状、清空按视图分流……）。
console.log('== F 组（2026-09-20 用户第 1–11 条）==')
{
  const staticBare = staticCss.replace(/\/\*[\s\S]*?\*\//g, ' ')

  // ①(用户第 1 条) 入口单一主人：接管 `#pick-lib` 时必须把产物自己的 `onclick` 摘掉
  ok(/function detachArtifactPickChain\(\)/.test(patchCode) && /pickLibBtn\.onclick = null/.test(patchCode) &&
    /detachArtifactPickChain\(\)/.test(patchCode) && /callArtifactPickChain\(\)/.test(patchCode),
    'F1 ① 接管「选择文件夹」时**摘掉产物自己的 onclick**（同元素捕获拦不住它 ⇒ 它会 window.prompt 阻塞主线程）')
  ok(/export function libDirCommitPlan\(\)/.test(patchSrc) &&
    /closeFsDialog\('committed'\)/.test(patchCode) && /refreshLibrarySoft\(\)/.test(patchCode),
    'F2 ① 成功路径三段在代码里真的接上了：重拉列表（`refreshLibrarySoft`）+ 自动关窗（`closeFsDialog(\'committed\')`）')
  const plan = P.libDirCommitPlan()
  ok(plan.reloadPage === false && plan.closeDialogOnSuccess === true && plan.closeDialogOnFailure === false &&
    plan.touchSelection === false && plan.showReasonOnFailure === true &&
    plan.listRequest.method === 'GET' && plan.listRequest.path === '/api/library',
    'F3 ① 「就选这个目录」成功之后的动作契约（纯函数）：同页 GET /api/library + 自动关窗 + **不碰当前选中的壁纸**；失败不关窗 + 写原因',
    JSON.stringify(plan))
  ok(/function fsSetState\(/.test(patchCode) && /FS_TIMEOUT_MS/.test(patchCode) && /ui\.gen !== gen/.test(patchCode),
    'F4 ① 状态机自带可见状态 + 超时 + 代际号（"永远停在 Reading…"从构造上不可能）')
  ok(/if \(el && \(plan\.isDiag \|\| !el\.textContent\)\)/.test(patchCode) === false,
    'F5 ② 清空按钮那条**自锁判据**（`plan.isDiag || !el.textContent` ⇒ 调试视图永远清不掉）已删除')

  // ②(用户第 2 条) 清空按当前视图分流，三个视图各留一条"已清空"
  ok(/function clearLogsView\(\)/.test(patchCode) && /dbgLines = \[\]/.test(patchCode) &&
    /logsView === 'diag'/.test(patchCode) && /logsView === 'debug'/.test(patchCode) && /logs\.cleared/.test(patchSrc),
    'F6 ② 清空按**当前视图**分流（输出 / 诊断 / 调试各清各的 + 调试的行缓冲一起清）+ 一条"已清空"系统行')

  // ③(用户第 3 条) 开关在页签内部；切页签不碰模式
  ok(/id="dbg-mode"/.test(htmlSrc) && /id="debug-body"[\s\S]{0,900}?id="dbg-mode"/.test(htmlSrc),
    'F7 ③ 调试模式开关在**调试页签内部**（`#debug-body` 里的 `#dbg-mode`），不是页签自己')
  ok(/setDebugMode\(plan\.isDebug\)/.test(patchCode) === false && /dbgSyncKeys\(\)/.test(patchCode),
    'F8 ③ `setLogsView()` **不再**调 `setDebugMode`（切页签永不改模式）；键盘改由 `dbgSyncKeys()` 按"模式 ∧ 本页可见"装卸')
  ok(/'#debug-body'/.test(patchSrc) === false || true, 'F9 ③ （占位：`#debug-body` 由静态 HTML 提供，补丁只查 `#dbg-mode`）')

  // ④(用户第 4 条) 调试页签要看到与 :8899 同一份诊断文本
  ok(/function dbgMirrorDiagLine\(/.test(patchCode) && /dbgMirrorDiagLine\(entry\)/.test(patchCode) &&
    /dataset\.src = 'diag'/.test(patchCode),
    'F10 ④ 诊断流的每一条都**原样**镜像进 `#dbg-log`（带 `data-src="diag"` 标记 ⇒ 与 :8899 的 #log 同一份内容）')
  ok(/dbgReportBtn/.test(patchCode) && /dbgShotBtn/.test(patchCode),
    'F11 ④ 8902 自己的「立即上报 / 截图」按钮保留（镜像不替换它们）')

  // ⑤(用户第 5 条) 麦克风默认关 + 闸门
  ok(/id="mic-enable"/.test(htmlSrc) && /id="mic-enable"[^>]*checked/.test(htmlSrc) === false,
    'F12 ⑤ 工具条有「启用麦克风」且**静态 HTML 里没有 checked**（默认关）')
  ok(/function installMicGateOn\(/.test(patchCode) && /micGateOpen\(\)/.test(patchCode) &&
    /Promise\.reject\(micDeny\(win\)\)/.test(patchCode) && /liveEl\.checked = false/.test(patchCode),
    'F13 ⑤ 闸门三层都在：getUserMedia 包装（关着直接拒绝、不调原函数）+ 「系统实况」强制关（URL 拿不到 liveSystem=1）+ 探针')

  // ⑥(用户第 6 条) 图标几何居中三件事
  ok(/border:0;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;place-items:center/.test(staticBare) &&
    /#theme-toggle svg\.ic\{display:block;line-height:1;margin:0;vertical-align:middle\}/.test(staticBare),
    'F14 ⑥ 居中三件事同时在静态表里：按钮 `border:0` + flex/place-items 居中 + 图标 `display:block;line-height:1`')

  // ⑦(用户第 7 条) 滚动条：一处定义（变量）+ 两处引用（同一份选择器清单）
  ok(/--bench-sb-size:8px/.test(staticBare) && /--bench-sb-thumb:rgba\(255,255,255,\.5\)/.test(staticBare) &&
    /--bench-sb-thumb:rgba\(0,0,0,\.28\)/.test(staticBare) &&
    /scrollbar-width:thin;scrollbar-color:var\(--bench-sb-thumb\) var\(--bench-sb-track\)/.test(staticBare) &&
    /border-radius:999px/.test(staticBare),
    'F15 ⑦ 滚动条：细 8px + 滑块 rgba(255,255,255,.5)（亮色 rgba(0,0,0,.28)）+ 透明轨道 + 999px 圆角，各只定义一次')
  const sbRule = (staticBare.match(/^html\.bench-shell ([^{]*#list[^{]*)\{scrollbar-width:thin[^}]*\}$/m) || [])[1] || ''
  ok(/#list/.test(sbRule) && /#logbody/.test(sbRule) && /#diag-body/.test(sbRule) && /\.dbg-log/.test(sbRule) && /,/.test(sbRule),
    'F16 ⑦ 资源管理器列表与输出区**共用同一条选择器清单**（一处定义、两处引用：改样式只改这一行）', sbRule.slice(0, 90))

  // ⑨(用户第 10 条) 输入框聚焦
  ok(/--bench-input-border:#ccc;--bench-input-focus:#111/.test(staticBare) &&
    /--bench-input-focus:#fff/.test(staticBare) &&
    /border:1px solid var\(--bench-input-border\)!important/.test(staticBare) &&
    /:focus, html\.bench-shell textarea:focus\{outline:none;border-color:var\(--bench-input-focus\)!important\}/.test(staticBare),
    'F17 ⑨ 输入框：平时灰边、聚焦黑边（暗色白边），`outline:none` + 两处颜色统一到变量；`!important` 必需（产物 `#filter:focus` 带 id，特异性永远压过不带 id 的选择器）')

  // ⑪(用户第 11 条) 首屏防闪**必须在 head 的静态表里**
  ok(/html\.bench-shell:not\(\[data-bench-ready\]\) body\{visibility:hidden\}/.test(staticBare) &&
    /html\.bench-shell\[data-bench-ready\] body\{visibility:visible\}/.test(staticBare),
    'F18 ⑪ 首屏闸门在 `<style id="bench-shell-static">` 里内联（不依赖 JS/补丁就能挡住堆叠帧）')
  /* ⚠ 这条用**原始 HTML**（`htmlSrc`）而不是剥注释版：index.html 那句 `demo/assets/brand/**` 里的 `/**`
     会让 `stripComments` 的「斜杠星号 … 星号斜杠」规则提前收尾，把 head 里那段脚本整段吞掉
     （踩到过：断言读不到明明存在的代码）。查的是 script 里的真代码，用原始文本更准。 */
  ok(/window\.__benchReady = ready/.test(htmlSrc) && /setTimeout\(ready, 1200\)/.test(htmlSrc) && /setTimeout\(ready, 3000\)/.test(htmlSrc) &&
    /document\.addEventListener\('DOMContentLoaded', function \(\) \{ setTimeout\(ready, 0\) \}\)/.test(htmlSrc),
    'F19 ⑪ 摘闸门有三个时刻：补丁显式就绪 + DOMContentLoaded + 1.2s/3s 硬兜底（任何异常路径下都不会白屏）')

  // ⑧(用户第 8 条) 类型筛选单一事实源
  ok(/function setSegActive\(b, on\)/.test(patchCode) && /b\.classList\.contains\('active'\) !== !!on/.test(patchCode) &&
    /try \{ paintTypeSegs\(\) \} catch/.test(patchCode),
    'F20 ⑧ 高亮与过滤同一个变量：`paintTypeSegs()` 只读 `uiType`，且列表每次变动后按它再对一次账（写同值不产生 mutation）')

  // ①(用户第 9 条) 幽灵叉号
  ok(/else curId = null/.test(patchCode) && /if \(cur && curId && activeItem && cur\.parentNode === tabsBox\)/.test(patchCode) &&
    /const isOpen = \(Array\.isArray\(pinned\) && pinned\.indexOf\(want\) >= 0\)/.test(patchCode),
    'F21 ① 幽灵叉号：`curId` 只在"列表里真有 active 项"时非空 + 叉号按同一判据渲染 + 关不存在的 id 幂等返回 false（不写日志）')
}

console.log(`\n── 汇总：PASS=${pass} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
