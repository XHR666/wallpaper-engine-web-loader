#!/usr/bin/env node
/**
 * bench-renderer-source-test.mjs —— 「预览用哪个渲染器」这条线的一体化门禁（2026-09-21）。
 *
 * 覆盖三件事（对应任务书三步）：
 *   A. **纯函数层**（Node 直接跑真源码，不需浏览器）：档位归一 / URL 改写（完整保留原有 query）/
 *      DPR 上限只在"用户显式改过"时生效 / 状态行计划 / src 包装层（假原型驱动真接线）。
 *   B. **core 的画布活档位**（`?res=dpr|dpr1..dpr5`）：`parseResTier` + `resolveLiveCanvasSize`
 *      的算式与上限（"画布 = 显示尺寸 × DPR（有上限）"这条链的**唯一真源**）。
 *   C. **真机读数**（firefox，SKIP-able）：`:8902` 里把预览切到「本仓渲染器」，读
 *      **同一个包、同一块面板**下两条路径的画布像素 / 生效 DPR / query 保留情况。
 *      —— 这是"上游 1× CSS 像素 vs 本仓 显示尺寸×DPR"的**判据**（数字，不是观感）。
 *      ⚠ **这条判据的前置不是"有没有浏览器"，而是"这台浏览器能不能建 WebGL2"**（2026-09-22 归因）：
 *      本机（Android/PRoot，无 `/dev/dri`）**无头 Firefox 连 WebGL1 都建不了**（实测 `webgl1/webgl2` 都是
 *      null，控制台 `FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS`）⇒ 渲染器页停在
 *      「❌ 启动失败: 当前浏览器不支持 WebGL2」，画布停在 300×150 空画布、`__mpwLiveRes` 永不发布
 *      ⇒ D3/D4/D5 会**假红**（读数看着像产品坏了，其实是环境缺能力：同一浏览器里**上游产物页**也建不了 GL）。
 *      本仓库既有唯一能出 WebGL2 的组合（`docs/REAL-MACHINE-AUTOMATION.md` §1、`tests/x11-e2e/README.md` §1）
 *      = **有头 Firefox + X 显示 `:0` + 软件 llvmpipe** ⇒ D 段默认走有头；`MPW_BENCH_HEADLESS=1` 强制无头
 *      （给真有 GL 的机器用）、`MPW_X11_DISPLAY` 换显示号。拿不到 WebGL2 时：D0–D2（URL/档位层）照跑，
 *      D3–D5（画布/DPR 层）打印 SKIP + 原因 —— **不谎报成红，也不静默通过**。
 *      读数的**时序**同理不靠盲等：场景挂载/活档位发布改为**轮询到读数出现为止**（有上限，超时照读照断言）。
 *
 * 无 :8902 / 无 Playwright / 无 firefox ⇒ D 段整体 SKIP（A/B/C 段照跑，门禁不红）。
 * 纪律：真树只读（所有改写都在内存对象/假原型上做）；不启新服务；浏览器用完必关。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WS = path.resolve(ROOT, '..')
const URL_BASE = process.env.MPW_BENCH_URL || 'http://127.0.0.1:8902/'
const PROBE_ID = process.env.MPW_RENDERER_SOURCE_ID || '3544152633'

let pass = 0, fail = 0
const ok = (c, label, extra = '') => { if (c) { pass++; console.log('PASS ' + label + (extra ? '  ' + extra : '')) } else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')) } }
const skip = (why) => { console.log('SKIP bench-renderer-source — ' + why); process.exit(0) }

const PATCH_PATH = path.join(ROOT, 'demo', 'bench-patch.js')
const PATCH_TEXT = fs.readFileSync(PATCH_PATH, 'utf8')
const INDEX_TEXT = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf8')
const SERVER_TEXT = fs.readFileSync(path.join(ROOT, 'server', 'we-scene-demo-server-8902.mjs'), 'utf8')
const HTML_TEXT = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8')
const P = await import(pathToFileURL(PATCH_PATH).href)
const CORE = await import(pathToFileURL(path.join(ROOT, 'core', 'we-scene-bundle.js')).href)

/* ═══════════════════ A. 纯函数层：档位 / URL 改写 / DPR 上限 / 状态行 / 包装层 ═══════════════════ */
{
  ok(P.RENDERER_SOURCES.length === 2 && P.RENDERER_SOURCES.join(',') === 'upstream,repo' &&
    P.RENDERER_SOURCE_DEFAULT === 'repo',
    'A1 两档 = upstream/repo；**默认 = repo（本仓渲染器）**——新契约："预览只跑一个渲染器表面（本仓），' +
    '上游产物只作对照/排障档"；切回上游是**显式**动作（D5 钉住它真的能切）', P.RENDERER_SOURCES.join(',') + ' default=' + P.RENDERER_SOURCE_DEFAULT)

  ok(P.rendererSourceMode(null) === 'repo' && P.rendererSourceMode('') === 'repo' &&
    P.rendererSourceMode('垃圾值') === 'repo' && P.rendererSourceMode('REPO') === 'repo' &&
    P.rendererSourceMode(' repo ') === 'repo' && P.rendererSourceMode('UPSTREAM') === 'upstream',
    'A2 档位归一：只认两档、其余（null/空/大小写/垃圾值）回落**缺省档 = repo** —— 打错一个字母不该把预览悄悄换成另一种渲染器')

  ok(P.rendererDprCap({ dpr: 1, dprTouched: false }) === null &&
    P.rendererDprCap({ dpr: 3, dprTouched: true }) === 3 &&
    P.rendererDprCap({ dpr: 99, dprTouched: true }) === 5 &&
    P.rendererDprCap({ dpr: 'x', dprTouched: true }) === null &&
    P.rendererDprCap({ dpr: 0, dprTouched: true }) === null,
    'A3 DPR 上限只在"用户显式改过"时生效；缺省值 1（产物 HTML 的第一个 option）**不算改过** —— ' +
    '照传会把本仓的画质修复原地抵消；值域夹到 1..5（与产物 HTML 同）')

  const base = '/wallpaper-engine-webgl/renderer/index.html?type=scene&src=3544152633&fit=cover&renderDpr=1&sceneFps=60&filter=none&muted=true&loop=true&mediaBase=http%3A%2F%2F127.0.0.1%3A8902%2Fmedia%2Fdev&_t=123'
  const repo = P.rendererSourceUrl(base, 'repo', { dpr: 1, dprTouched: false })
  const keptKeys = ['type', 'src', 'fit', 'renderDpr', 'sceneFps', 'filter', 'muted', 'loop', 'mediaBase', '_t']
  const q = new URLSearchParams(repo.slice(repo.indexOf('?') + 1))
  ok(repo.startsWith('/webloader/?') && keptKeys.every((k) => q.get(k) !== null) &&
    q.get('id') === '3544152633' && q.get('res') === 'dpr',
    'A4 repo 档：路径换成同源 `/webloader/`，**原 query 一个不丢**（含 `_t`/`bandfeed`/调试档），并补 `id=<itemId>` 与 `res=dpr`',
    repo.slice(0, 120))
  ok(P.rendererSourceUrl(base, 'upstream', {}) === base,
    'A5 upstream 档：**逐字返回**（"上游 = 现在的行为"，一个字符都不改）')
  const withBand = P.rendererSourceUrl(base.replace('&_t=123', '&_t=123&bandfeed=mic'), 'repo', {})
  ok(new URLSearchParams(withBand.slice(withBand.indexOf('?') + 1)).get('bandfeed') === 'mic',
    'A6 测试台自己加的 `?bandfeed=` 在改写后仍在（换档叠参数不许把音条源弄丢）')
  const withRes = P.rendererSourceUrl(base + '&res=720p', 'repo', { dpr: 3, dprTouched: true })
  ok(new URLSearchParams(withRes.slice(withRes.indexOf('?') + 1)).get('res') === '720p',
    'A7 URL 里**已有** `res=` ⇒ 那是别人显式的调试档，**不覆盖**（"保留原有 query"优先于我们的缺省）')
  const webCase = P.rendererSourceUrl('/wallpaper-engine-webgl/renderer/index.html?type=web&src=%2Fweb%2Fdev%2F3644069061%2Findex.html', 'repo', {})
  ok(new URLSearchParams(webCase.slice(webCase.indexOf('?') + 1)).get('id') === '3644069061',
    'A8 web/video 档：`src` 是路径 ⇒ 从 `/web/dev/<id>/…` 段里取回同一个 id（取不到就不补，不编造）')
  ok(P.rendererSourceUrl('https://example.com/not-renderer/index.html?a=1', 'repo', {}) === 'https://example.com/not-renderer/index.html?a=1' &&
    P.rendererSourceUrl('blob:http://127.0.0.1/abc', 'repo', {}) === 'blob:http://127.0.0.1/abc' &&
    P.rendererSourceUrl('', 'repo', {}) === '',
    'A9 边界：非渲染器入口（同名尾巴 / blob: / 空串）**一字不改** —— 这条改写不可能把别的 URL 弄坏')
  ok(P.rendererSourceUrl('http://127.0.0.1:8902/wallpaper-engine-webgl/renderer/index.html?type=scene&src=9', 'repo', {}).startsWith('http://127.0.0.1:8902/webloader/?'),
    'A10 绝对 URL 进来 ⇒ 保持同源前缀（不把绝对入口降级成相对路径）')
  ok(P.rendererSourceUrl('/webloader/?type=scene&src=9&id=9&res=dpr', 'repo', {}).startsWith('/webloader/?'),
    'A11 已经是 `/webloader/` 的 URL 再改写一次仍是 `/webloader/`（幂等：重复写 src 不会套两层路径）')
  const back2 = P.rendererSourceUrl('/webloader/?type=scene&src=9&id=9&res=dpr&_t=1', 'upstream', {})
  ok(back2 === '/wallpaper-engine-webgl/renderer/index.html?type=scene&src=9&id=9&res=dpr&_t=1',
    'A11b ★反向映射：`/webloader/` 的 URL 在 `upstream` 档下把**路径换回产物入口**、查询串原样带走' +
    '（没有已挂载壁纸时产物自己的重挂载会直接返回 ⇒ 没有这条反向映射，换档会把 iframe 留在旧渲染器上）', back2)

  const planUp = P.rendererSourceStatusPlan('zh', 'upstream', { loaded: true })
  const planLoad = P.rendererSourceStatusPlan('zh', 'repo', { loaded: false })
  const planDead = P.rendererSourceStatusPlan('zh', 'repo', { loaded: true, error: '渲染器上游不可达' })
  const planNot = P.rendererSourceStatusPlan('zh', 'repo', { loaded: true, repoRenderer: false, src: '/x' })
  const planOk = P.rendererSourceStatusPlan('zh', 'repo', { loaded: true, repoRenderer: true, res: { width: 1056, height: 594, dpr: 2 }, caps: { setFit: false, pause: true } })
  ok(planUp.kind === 'upstream' && planLoad.kind === 'loading' && planDead.kind === 'unreachable' &&
    planNot.kind === 'repo-degraded' && planOk.kind === 'repo-degraded' &&
    /1056×594 @DPR2/.test(planOk.text) && /setFit/.test(planOk.text) && !/undefined/.test(planOk.text),
    'A12 状态行五态（upstream/loading/unreachable/not-repo/降级）都写人话；画布读数与降级名单都进文本；**不出现 `undefined`**',
    planOk.text)
  const planNoDpr = P.rendererSourceStatusPlan('zh', 'repo', { loaded: true, repoRenderer: true, res: { width: 1920, height: 1080 }, caps: {} })
  ok(/1920×1080/.test(planNoDpr.text) && !/DPRundefined/.test(planNoDpr.text),
    'A13 读数缺 `dpr` 字段（固定档位的 `__mpwResTier` 就是这种形状）⇒ 只写尺寸，不写 `DPRundefined`')

  // 包装层：用**假原型**驱动真接线（与 bench-bandfeed-switch-test 的 B2 同一手法）
  const mkProto = () => {
    let stored = ''
    const proto = {}
    Object.defineProperty(proto, 'src', {
      configurable: true, enumerable: true,
      get() { return stored },
      set(v) { stored = String(v) },
    })
    return proto
  }
  const proto = mkProto()
  let mode = 'repo'
  const installed = P.installRendererSourceSrcHook(proto, () => mode, () => ({ dpr: 2, dprTouched: true }))
  const fr = Object.create(proto)
  fr.src = base
  const afterRepo = String(fr.src)
  mode = 'upstream'
  fr.src = base
  const afterUp = String(fr.src)
  ok(installed === true && afterRepo.startsWith('/webloader/?') && /res=dpr2/.test(afterRepo) && afterUp === base,
    'A14 包装层每次写入都按**当前**档位改写（假原型：repo ⇒ /webloader/ + res=dpr2；切回 upstream ⇒ 逐字原样）')
  ok(P.installRendererSourceSrcHook(proto, () => 'repo', () => ({})) === true && proto.__benchRendererSrc === 1,
    'A15 包装层幂等（`__benchRendererSrc` 标记）：重复 init 不会套两层')
  let noAccessor = true
  try { P.installRendererSourceSrcHook({}, () => 'repo', () => ({})) } catch (e) { noAccessor = false }
  ok(noAccessor && P.installRendererSourceSrcHook(null, () => 'repo', () => ({})) === false,
    'A16 没有可包装的访问器/没有原型 ⇒ 返回 false 静默降级，绝不把页面弄坏')
}

/* ═══════════════════ B. core：画布活档位（显示尺寸 × DPR，有上限） ═══════════════════ */
{
  const t1 = CORE.parseResTier('dpr', { innerWidth: 624, innerHeight: 351, devicePixelRatio: 2 })
  ok(t1.name === 'dpr' && t1.live === true && t1.width === 1248 && t1.height === 702 && t1.liveDpr === 2,
    'B1 `?res=dpr` = 显示尺寸 × 设备 DPR（624×351 @DPR2 → 1248×702）；`live` 标记就位', JSON.stringify({ w: t1.width, h: t1.height, dpr: t1.liveDpr }))
  const t2 = CORE.parseResTier('dpr1', { innerWidth: 624, innerHeight: 351, devicePixelRatio: 2 })
  ok(t2.width === 624 && t2.height === 352 && t2.liveDprCap === 1,
    'B2 `?res=dpr1` = 上限 1×（与产物页「DPR」档同值域；工具条显式改过时才传）', JSON.stringify({ w: t2.width, h: t2.height }))
  const t3 = CORE.parseResTier('dpr', { innerWidth: 3840, innerHeight: 2160, devicePixelRatio: 2 })
  ok(t3.width * t3.height <= 3840 * 2160 && t3.liveCap === 'pixel-cap' && t3.width <= 4096,
    'B3 上限真的生效：4K 全屏 @DPR2 不会去建 7680×4320（总像素封顶 3840×2160、单边 ≤4096）', JSON.stringify({ w: t3.width, h: t3.height, cap: t3.liveCap }))
  ok(CORE.parseResTier('auto', { innerWidth: 1920, devicePixelRatio: 1 }).name === '1080p' &&
    CORE.parseResTier(null).name === '1080p' && CORE.parseResTier('legacy').legacy === true &&
    CORE.parseResTier('dpr9x', { innerWidth: 800, devicePixelRatio: 1 }).invalid === 'dpr9x',
    'B4 既有档位语义**一位没动**：`auto` 仍是"按 innerWidth×min(dpr,2) 选命名档"、缺省仍 1080p、' +
    '`legacy` 仍逐位兼容、非法值仍回退默认并在 `invalid` 里点名（新档位是**新增取值**，不新增开关名）')
  const s1 = CORE.resolveLiveCanvasSize({ cssW: 528, cssH: 297, deviceDpr: 2 })
  const s2 = CORE.resolveLiveCanvasSize({ cssW: 528, cssH: 297, deviceDpr: 2, dprCap: 1 })
  const s3 = CORE.resolveLiveCanvasSize({ cssW: 0, cssH: 0, deviceDpr: 2 })
  const s4 = CORE.resolveLiveCanvasSize({ cssW: 3000, cssH: 1000, deviceDpr: 3 })
  ok(s1.width === 1056 && s1.height === 594 && s1.capped === 'ok' && s2.width === 528 && s3.capped === 'bad-input' &&
    s4.width <= 4096 && s4.capped === 'dim-cap' && (s1.width % 2 === 0 && s1.height % 2 === 0),
    'B5 `resolveLiveCanvasSize` 是活档位的**唯一算式**：正常档精确 ×DPR、有上限、偶数对齐、' +
    '坏输入退化成 2×2 并标 `bad-input`（不猜不抛）', JSON.stringify([s1, s2, s4]))
  ok(/__mpwLiveRes/.test(HTML_TEXT) && /ResizeObserver/.test(HTML_TEXT) && /dppx/.test(HTML_TEXT) &&
    /inst\.liveResDispose/.test(HTML_TEXT) && /liveResApply/.test(HTML_TEXT) && /mpwHostFrameFn/.test(HTML_TEXT),
    'B6 接线钉子：渲染器页装了 ResizeObserver + `(resolution: Ndppx)` 媒体查询 + 每实例可释放（`liveResDispose`），' +
    '宿主改 DPR 走 `liveResApply`，帧函数与实例句柄用引用持有（避免 TDZ）')
  ok(/live: true/.test(fs.readFileSync(path.join(ROOT, 'core', 'we-scene-bundle.js'), 'utf8')) &&
    /resolveLiveCanvasSize/.test(fs.readFileSync(path.join(ROOT, 'core', 'we-scene-bundle.js'), 'utf8')),
    'B7 core 侧导出钉子：`parseResTier` 的 live 分支 + `resolveLiveCanvasSize` 都在 core（不是散在页面里）')
}

/* ═══════════════════ 静态纪律：HTML / 补丁 / 服务端 ═══════════════════ */
{
  ok(/<select id="renderer-src">/.test(INDEX_TEXT) && /value="repo" selected/.test(INDEX_TEXT) &&
    /value="upstream"/.test(INDEX_TEXT) && /id="status-renderer-src"/.test(INDEX_TEXT),
    'C1 工具条控件：`#renderer-src` 两档 + **缺省 `repo`（selected）** + 状态行 `#status-renderer-src`')
  ok(/installRendererSourceSrcHook\(/.test(PATCH_TEXT) && /paintRendererSrcStatus\(\)/.test(PATCH_TEXT) &&
    /remountRendererForBandFeed\(\)/.test(PATCH_TEXT),
    'C2 补丁接线：src 包装层已装、状态行有重画点、换档沿用产物自己的「重挂载」（不写第二套挂载逻辑）')
  ok(/bench-repo-chrome-hide/.test(PATCH_TEXT) && /#__mpwLnTag/.test(PATCH_TEXT),
    'C3 预览呈现：本仓渲染器页的**开发外壳**（顶栏/属性面板/日志/音频面板/逐层调试角标）在预览里被隐掉（幂等注入一条 CSS）')
  const routeList = (/const RENDERER_ROOT_ROUTES = \[([^\]]*)\]/.exec(SERVER_TEXT) || [])[1] || ''
  ok(/'\/pkg\/'/.test(routeList) && /'\/noise'/.test(routeList) &&
    !/'\/diag'/.test(routeList) && !/'\/media/.test(routeList) && !/'\/api/.test(routeList),
    'C4 服务端：渲染器页**自己的**根绝对路由（`/pkg/`…）被转发到上游；`/diag`、`/report`、`/baseline`、' +
    '/media|web/dev、/api 一律**不在**名单里（诊断流/落盘/媒体面必须留在本服务）')
  /* C5(2026-09-24 用户第 5 条「把 8899 直接集成到 8902」后的**新契约**，判据口径不变：
     静态面优先 + 越根/坏 URL 仍 400/403)。旧读数 = "渲染器根路由被**转发到上游**"；
     现在 = "**本地直供**（同一份 `rendererRequestHandler`），静态面里真有同名文件仍然优先"。 */
  ok(/RENDERER_LOCAL_EXACT\.has\(p\) \|\| RENDERER_LOCAL_PREFIXES\.some/.test(SERVER_TEXT) &&
    /serveRenderer\(req, res, url, relForRenderer\)/.test(SERVER_TEXT) &&
    /if \(localErr\) return jsonErr\(res, localErr\)/.test(SERVER_TEXT),
    'C5 服务端：渲染器根路由**本地直供**（静态面优先，`demo/` 里真有同名文件就不打扰渲染器处理器），' +
    '越根/坏 URL 仍走本服务 400/403 的口径')
  ok(/X-Bench-Served': 'local'/.test(SERVER_TEXT) && /X-Bench-Upstream'/.test(SERVER_TEXT) &&
    /localFallbackOk/.test(SERVER_TEXT) && /'X-Bench-Upstream-Error': code/.test(SERVER_TEXT),
    'C5b 服务端：本地直供带可观测标记 `X-Bench-Served: local`（配了上游再补 `X-Bench-Upstream`）；' +
    '上游连不上时 GET/HEAD **回退本地**（页面照常出画），只有"本地也没这条路由"才按老口径 502')
}

/* ═══════════════════ D. 真机读数（SKIP-able）：面板 → 画布像素的两条路径对比 ═══════════════════ */
function findPlaywright() {
  const cands = [process.env.MPW_PLAYWRIGHT, path.join(ROOT, 'node_modules/playwright/index.js'),
    path.join(WS, 'dsh-mpkg-wallpaper/node_modules/playwright/index.js'), '/opt/node/lib/node_modules/playwright/index.js'].filter(Boolean)
  for (const c of cands) { try { if (fs.statSync(c).isFile()) return c } catch { /* next */ } }
  return null
}
let reachable = false
try { const r = await fetch(URL_BASE, { signal: AbortSignal.timeout(4000) }); reachable = r.ok } catch { reachable = false }
if (!reachable) {
  console.log('SKIP bench-renderer-source D 段（真机读数）—— 测试台不可达：' + URL_BASE + '（A/B/C 段已跑完）')
  console.log(`── 汇总：PASS=${pass} FAIL=${fail}（D 段 SKIP）`)
  process.exit(fail === 0 ? 0 : 1)
}
const pwPath = findPlaywright()
if (!pwPath) {
  console.log('SKIP bench-renderer-source D 段（真机读数）—— 找不到 playwright（A/B/C 段已跑完）')
  console.log(`── 汇总：PASS=${pass} FAIL=${fail}（D 段 SKIP）`)
  process.exit(fail === 0 ? 0 : 1)
}
{
  const pw = await import(pathToFileURL(pwPath).href)
  const firefox = (pw.default && pw.default.firefox) || pw.firefox
  if (!firefox) {
    console.log('SKIP bench-renderer-source D 段 —— playwright 没有 firefox 导出')
    console.log(`── 汇总：PASS=${pass} FAIL=${fail}（D 段 SKIP）`)
    process.exit(fail === 0 ? 0 : 1)
  }
  /* ⚠ D 段的前置 = "这台浏览器能不能建 WebGL2"（见文件头 C 段的说明）。默认**有头 + X 显示**：本机
     （Android/PRoot，无 /dev/dri）无头 Firefox 建不了 GL ⇒ 画布/DPR 读数必假红（实测读数：
     `{"panelRepo":558,"upScale":0,"repoScale":0.537…,"dpr":2}`、`__mpwLiveRes=null`、
     `transparentPct=100` —— 那正是"页面停在 WebGL2 启动失败"的样子）。有头起不来才回落无头。 */
  const XDISPLAY = process.env.MPW_X11_DISPLAY || ':0'
  const FORCE_HEADLESS = process.env.MPW_BENCH_HEADLESS === '1'
  const launchOpts = (headless) => ({
    headless,
    env: {
      ...process.env, MOZ_WEBGL_FORCE_SOFTWARE: '1', LIBGL_ALWAYS_SOFTWARE: '1',
      ...(headless ? {} : { DISPLAY: XDISPLAY }),
    },
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true, 'webgl.out-of-process': false },
  })
  /** 起浏览器：有头优先（本机唯一能出 WebGL2 的组合），起不来回落无头（那时 D3–D5 会显式 SKIP）。 */
  const launchBrowser = async () => {
    let note = ''
    let b = null
    if (!FORCE_HEADLESS) {
      try { b = await firefox.launch(launchOpts(false)); note = '有头 DISPLAY=' + XDISPLAY }
      catch (e) { note = '有头起不来（' + String((e && e.message) || e).slice(0, 90) + '）⇒ 回落无头' }
    }
    if (!b) { b = await firefox.launch(launchOpts(true)); note = FORCE_HEADLESS ? '无头（MPW_BENCH_HEADLESS=1）' : note + ' · 无头' }
    return { browser: b, note }
  }
  /** 跑一轮：起浏览器 → 能力前置 → 面板→画布读数。拆成函数的唯一理由：**浏览器被环境带走时能重来一次**
      （本机 X 显示会被别的线重启 —— 本轮实测跑了一半显示从 1280×1024 变 1920×1200，有头 Firefox 当场被
      带走、`page.waitForTimeout` 抛 "Target page, context or browser has been closed"）。判据类失败不重试。 */
  const runAttempt = async () => {
    const launched = await launchBrowser()
    const browser = launched.browser
    const launchNote = launched.note
    /* 能力前置（读一次，不猜）：把"环境缺能力"与"产品没跑到"分开 —— 这是本轮归因的关键读数。 */
    let webgl2 = false
    let glNote = ''
    try {
      const glCtx = await browser.newContext({ viewport: { width: 400, height: 300 } })
      const glPage = await glCtx.newPage()
      await glPage.goto('about:blank')
      const g = await glPage.evaluate(() => {
        try {
          const c = document.createElement('canvas')
          const gl = c.getContext('webgl2')
          const d = gl && gl.getExtension('WEBGL_debug_renderer_info')
          return { ok: !!gl, ver: gl ? String(gl.getParameter(gl.VERSION)) : null, renderer: d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : null }
        } catch (e) { return { ok: false, err: String((e && e.message) || e).slice(0, 80) } }
      })
      webgl2 = g.ok === true
      glNote = JSON.stringify(g)
      await glCtx.close()
    } catch (e) { glNote = 'GL 探针失败: ' + String((e && e.message) || e).slice(0, 120) }
    console.log('D 段浏览器：' + launchNote + ' · WebGL2=' + (webgl2 ? '有 ' + glNote : '无 ' + glNote))
    if (!webgl2) {
      console.log('  ⚠ 拿不到 WebGL2 ⇒ 画布/DPR 层读数（D3/D4/D5）不可信，一律打 SKIP 而不是假红：')
      console.log('    渲染器页会停在「❌ 启动失败: 当前浏览器不支持 WebGL2」，画布停在 300×150 空画布、')
      console.log('    `__mpwLiveRes` 不发布 —— 这是**环境缺能力**（同一浏览器里上游产物页也建不了 GL），')
      console.log('    不是本仓渲染器的判据。要跑满：起 X 显示（本仓库既有做法 `DISPLAY=:0`，见')
      console.log('    tests/x11-e2e/README.md §1）后重跑；只有显式 `MPW_BENCH_HEADLESS=1` 才会强制无头。')
    }
    const pageErrs = []
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => pageErrs.push(String(e.message).slice(0, 160)))
    try {
      await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForSelector('#list li[data-id]', { timeout: 30000 })
      const readLive = () => page.evaluate(async () => {
        const fr = document.getElementById('frame')
        const st = document.getElementById('status-renderer-src')
        const out = {
          src: fr ? String(fr.getAttribute('src') || '') : '',
          status: st ? String(st.textContent || '') : '',
          attrSrc: st ? st.getAttribute('data-mpw-renderer-src') : null,
          dpr: window.devicePixelRatio,
          frameBox: fr ? (fr.clientWidth + 'x' + fr.clientHeight) : '',   // 面板盒（画布定尺的输入，取证用）
          /*  ①(2026-09-25 ISSUE0924A 收尾) 面板**列**几何（与渲染器档无关的那部分）：
              换档时它必须逐字不变；真正会跳的是舞台行高（见 D3 的说明）。 */
          panelBox: (() => { const m = document.getElementById('main'); return m ? (m.clientWidth + 'x' + m.clientHeight) : '' })(),
          propsBox: (() => { const m = document.getElementById('props'); return m ? (m.clientWidth + 'x' + m.clientHeight) : '' })(),
        }
        try {
          const w = fr.contentWindow
          const cv = w.document.querySelector('canvas')
          if (cv) {
            const b = cv.getBoundingClientRect()
            out.canvas = { w: cv.width, h: cv.height, cssW: Math.round(b.width), cssH: Math.round(b.height) }
            out.innerDpr = w.devicePixelRatio
            out.live = w.__mpwLiveRes || null
            out.hostCaps = w.__mpwHostCaps ? Object.keys(w.__mpwHostCaps).filter((k) => w.__mpwHostCaps[k] === false) : null
            // 该透的地方是不是黑：读画布的 alpha 分布（100% 不透明 = 没有透明区；透明区占比是像素数）
            const bmp = await w.createImageBitmap(await (await w.fetch(cv.toDataURL('image/png'))).blob())
            const oc = new w.OffscreenCanvas(bmp.width, bmp.height); const cx = oc.getContext('2d'); cx.drawImage(bmp, 0, 0)
            const dd = cx.getImageData(0, 0, bmp.width, bmp.height).data
            let tr = 0, blk = 0; const n = bmp.width * bmp.height
            for (let i = 0; i < dd.length; i += 4) { if (dd[i + 3] < 16) tr++; else if (dd[i] < 12 && dd[i + 1] < 12 && dd[i + 2] < 12) blk++ }
            out.alpha = { transparentPct: +(tr / n * 100).toFixed(1), opaqueBlackPct: +(blk / n * 100).toFixed(1) }
          }
        } catch (e) { out.innerErr = String(e.message).slice(0, 120) }
        return out
      })
      const selectSource = (mode) => page.evaluate((m) => {
        const s = document.getElementById('renderer-src')
        s.value = m
        s.dispatchEvent(new Event('change'))
      }, mode)
      /* 就绪轮询（替代盲等）：本机软件渲染 ~1fps、包 44MB，挂载/定尺时间随机器负载浮动 ⇒ 判据等的是
         "读数真的稳住了"，不是"睡够 N 秒"（旧写法 13s/16s/11s 是"环境刚好跑得动"的隐含假设）。
         一帧快照：`box` = iframe 盒（换档会让工具条/状态行重排，实测会走 505×284 → 558×314 → 529×297
         三段才定尺）、`cv` = 帧内第一块画布的像素尺寸、`ok` = 该档位的渲染器真的跑到出读数了。
         ⚠ 两个坑（2026-09-22 本轮真机实测，都不是猜的）：
         ① **换 src 之后旧文档不会立刻消失**（`contentWindow` 还是旧的、`__mpwLiveRes` 也还在）⇒ 只看读数
            会把旧文档当就绪：`repo0` 因此读到过 300×150 空画布（匹配到 1.2s 那次"合成样例"导航的文档）；
         ② **盒与画布不是同一拍定尺**：上游产物页在盒子还是 558×314 时建画布，盒子变到 529×297 之后约 5s
            才把画布重算到 529×297 ⇒ 只看"有画布"会把中途尺寸当读数：`back` 因此读到 558×314（CSS 盒
            529×297）。⇒ 就绪 = 文档对上 **且** 盒与画布**连着几拍都没变**（`waitReady` 的稳定拍数）。 */
      const frameSnap = (a) => {
        const fr = document.getElementById('frame')
        const st = document.getElementById('status-renderer-src')
        const out = { ok: false, box: '', cv: '', doc: '' }
        if (!fr || !st) return out
        out.box = fr.clientWidth + 'x' + fr.clientHeight
        if (st.getAttribute('data-mpw-renderer-src') !== a.mode) return out
        let w = null
        try { w = fr.contentWindow } catch (e) { return out }
        if (!w || !w.document) return out
        let path = '', search = '', rs = ''
        try {
          path = String(w.location.pathname || '')
          search = String(w.location.search || '')
          rs = String(w.document.readyState || '')
        } catch (e) { return out }
        if (rs !== 'complete') return out
        const cv = w.document.querySelector('canvas')
        out.cv = cv ? (cv.width + 'x' + cv.height) : '-'
        if (a.mode === 'repo') {
          if (path.indexOf('/webloader') !== 0) return out
          const m = /[?&]id=([^&]+)/.exec(search)
          if (!m || m[1] === 'sample-synthetic') return out   // 1.2s 那次"合成样例"导航的文档不是判据
          out.doc = 'repo:' + m[1]
          out.ok = !!cv && cv.width > 0 && !!w.__mpwLiveRes  // 活档位发布 = 场景真的挂上了
          return out
        }
        if (!/renderer\/index\.html$/.test(path)) return out
        out.doc = 'upstream'
        out.ok = !!cv && cv.width > 0
        return out
      }
      /** 等就绪：`ok` 成立 **且** 盒与画布连着 `stableTicks` 拍没变才认。
          为什么两档的稳定拍数不同（真机实测的时间线，`/tmp/timeline.json` 那份取证）：
            · 本仓档：`__mpwLiveRes` 发布 = 场景挂上且画布按当前盒定过尺，盒+画布稳 3 拍（2.4s）足够；
            · 上游产物档：它在**盒子还是 558×314 时**就建了画布，盒子变到 529×297 之后**约 5s**才把画布
              重算过来（本机软件渲染 ~1fps ⇒ 它那侧的重定尺落在"下一批帧"上）⇒ 稳定窗口要长过这段滞后
              （10 拍 ≈ 10.8s；旧写法给的是 11–13s 盲等，读数口径一致，只是这里改成"稳住了才读"）。
          到点没等到就返回 false，调用方**照读照断言**（超时也要给出数字，不许吞成通过）。 */
      const TICK_MS = 1200
      const waitReady = async (mode, ms, stableTicks) => {
        const t0 = Date.now()
        let prevKey = null
        let stable = 0
        for (;;) {
          const s = await page.evaluate(frameSnap, { mode }).catch(() => null)
          const key = s ? (s.box + '|' + s.cv) : null
          if (s && s.ok && key === prevKey) stable++
          else stable = 0
          prevKey = key
          if (stable >= stableTicks - 1) return true
          if (Date.now() - t0 >= ms) return false
          await page.waitForTimeout(TICK_MS)
        }
      }
      const REPO_STABLE_TICKS = 3
      const UP_STABLE_TICKS = 10
      // 无 WebGL2 时渲染器页永远到不了就绪态（见上面的能力前置）⇒ 不等满 60s，读数只作证据不作判据
      const READY_MS = webgl2 ? 60000 : 8000
      const clickItem = () => page.evaluate((id) => {
        const li = [...document.querySelectorAll('#list li[data-id]')].find((x) => String(x.dataset.id) === String(id)) || document.querySelector('#list li[data-id]')
        if (li) li.click()
      }, PROBE_ID)
      // 默认档 = 本仓渲染器。⚠ 时序（实测）：静态台在 1.2s 会走一次"合成样例"（本仓档下 = 把预览导航到
      //   `?id=sample-synthetic`）⇒ 先等它落定，再点壁纸，读数才是"已挂载的那张壁纸"。
      await page.waitForTimeout(4000)
      await clickItem()
      let readyNow = await waitReady('repo', READY_MS, REPO_STABLE_TICKS)
      // 兜一次：若样例探测的导航在点击之后才生效，src 会缺 `src=` ⇒ 再点一次（产物自己的挂载路径）
      if (!readyNow && !/src=/.test(String((await readLive()).src))) {
        await clickItem()
        readyNow = await waitReady('repo', READY_MS, REPO_STABLE_TICKS)
      }
      //  新契约：**打开就是本仓**（先读它）⇒ 再切到上游当对照 ⇒ 再切回本仓验证可逆。
      const repo0 = await readLive()
      await selectSource('upstream')
      await waitReady('upstream', READY_MS, UP_STABLE_TICKS)
      const up = await readLive()
      await selectSource('repo')
      await waitReady('repo', READY_MS, REPO_STABLE_TICKS)
      const repo = await readLive()
      await selectSource('upstream')
      await waitReady('upstream', READY_MS, UP_STABLE_TICKS)
      const back = await readLive()
      return { launchNote, webgl2, glNote, read: { repo0, up, repo, back, pageErrs } }
    } finally {
      try { await browser.close() } catch { /* 已关 */ }
    }
  }
  /** 只对"浏览器/页面被环境关掉"这一类重试一次（判据类失败照旧红，不重试）。 */
  const isEnvDeath = (e) => /has been closed|Target closed|browser has been closed|Browser closed|ECONNREFUSED|crash/i.test(String((e && e.message) || e))
  let att = null
  for (let i = 1; i <= 2 && !att; i++) {
    try { att = await runAttempt() } catch (e) {
      if (i === 1 && isEnvDeath(e)) {
        console.log('⚠ D 段浏览器被环境带走（' + String((e && e.message) || e).slice(0, 100) + '）⇒ 重试一次')
        continue
      }
      throw e
    }
  }
  const { launchNote, webgl2, glNote } = att
  const { repo0, up, repo, back, pageErrs } = att.read
  fs.writeFileSync(path.join(os.tmpdir(), 'bench-renderer-source-readings.json'),
    JSON.stringify({ launch: { mode: launchNote, webgl2, gl: glNote }, ...att.read }, null, 1))
  console.log('读数 ' + JSON.stringify({ launch: launchNote, webgl2, defaultCanvas: repo0.canvas, upstream: up.canvas, repo: repo.canvas, back: back.canvas, dpr: repo.dpr, repoLive: repo.live, repoAlpha: repo.alpha }))
  ok(repo0.attrSrc === 'repo' && String(repo0.src).startsWith('/webloader/?') && /[?&]id=/.test(String(repo0.src)),
    'D0 ★新契约：**打开预览就是本仓渲染器**（iframe 一开始就是 `/webloader/?…&id=<壁纸>`，不是产物页）',
    String(repo0.src).slice(0, 110))
  ok(up.attrSrc === 'upstream' && /renderer\/index\.html/.test(up.src) && !/\/webloader\//.test(up.src),
    'D1 对照档：显式切到「上游产物」后，iframe 回到产物那条 `/…renderer/index.html?…`（不再是 `/webloader/`）', String(up.src).slice(0, 90))
  const upQ = new URLSearchParams(String(up.src).split('?')[1] || '')
  const repoQ = new URLSearchParams(String(repo.src).split('?')[1] || '')
  ok(repo.attrSrc === 'repo' && String(repo.src).startsWith('/webloader/?') &&
    ['type', 'src', 'fit', 'renderDpr', 'sceneFps', 'filter', 'muted', 'loop', 'mediaBase', '_t'].every((k) => repoQ.get(k) !== null) &&
    repoQ.get('id') === PROBE_ID && repoQ.get('res') === 'dpr',
    'D2 切到本仓渲染器：iframe 换成同源 `/webloader/?…`，**原 query 逐项保留**（`fit/renderDpr/sceneFps/filter/muted/loop/mediaBase/_t` 都在）+ 补 `id`/`res=dpr`',
    String(repo.src).slice(0, 110))
  // 面板宽度两条路径差 ≤2px（本仓页的 `fitCanvas` 取"窗口内最大 16:9 盒"，与 iframe 盒会有 1px 取整差）
  const near = (a, b, tol) => Math.abs(a - b) <= tol
  const upScale = up.canvas ? up.canvas.w / up.canvas.cssW : 0
  const repoScale = repo.canvas ? repo.canvas.w / repo.canvas.cssW : 0
  /* D3/D4/D5 是**画布级**判据 ⇒ 前置是"这台浏览器真的能建 WebGL2"（见文件头 C 段与上面的能力前置）。
     拿不到 WebGL2 时读数必然是"300×150 空画布 + `__mpwLiveRes=null`"（渲染器页停在「当前浏览器不支持
     WebGL2」），把它当红了就是**把环境缺能力说成产品坏** ⇒ 这几条打 SKIP 并**把读数原样打出来**，
     既不谎报成红、也不静默通过（要跑满就起 X 显示，见打印的两条出路）。 */
  if (webgl2) {
    /*  ①(2026-09-25 ISSUE0924A 收尾) **判据按语义重写**（不是放宽）：
        D3 的真主张 = "分辨率乘数"——上游画布 = 面板 CSS × **1**（`renderDpr=1` 上限）、本仓 = 面板 CSS × **设备 DPR**
        （"预览糊"的根因与修法）。旧版还顺手钉了"两条路径的画布 CSS 宽相同（±2px）"，那是**当时的巧合**：
        换档会让**本服务自己的控制台行数**变化（上游档产物刷更多行）⇒ `#logs` 行高变化 ⇒ 舞台行高在
        **364↔321** 之间跳（实测 `frameBox` 604x340 ↔ 529x297），而两条路径的**面板列**几何
        （`#main` 740x838 / `#props` 320x838）逐字不变 —— 那才是"同一块面板"该钉的东西。
        所以现在钉三条**稳定不变量**：①面板列几何跨档逐字相同；②每块画布**铺满自己的 iframe 盒**；
        ③乘数语义不变。舞台盒差如实打印在读数里（不再拿它当判据）。
        ⚠ 舞台行高会跳这件事本身已记进 `docs/ISSUE0924A-PLAN.md` 的"已知遗留"（换档时预览框尺寸变化）。 */
    const fillsOwnFrame = (r) => !!r.canvas && r.frameBox === (r.canvas.cssW + 'x' + r.canvas.cssH)
    ok(up.canvas && repo.canvas && up.panelBox && up.panelBox === repo.panelBox && up.propsBox === repo.propsBox &&
      fillsOwnFrame(up) && fillsOwnFrame(repo) &&
      near(upScale, 1, 0.05) && near(repoScale, repo.dpr, 0.05),
      'D3 ★画质判据（**同一条面板列**、同一张包）：上游画布 = 面板 CSS 像素 × **1**（`renderDpr=1` 上限），' +
      '本仓画布 = 面板 CSS 像素 × **设备 DPR**；且每块画布都铺满自己的 iframe 盒（换档时本服务控制台行数变化 ⇒ 舞台盒会跳，不是画质语义）',
      JSON.stringify({ panelUp: up.canvas && up.canvas.cssW, panelRepo: repo.canvas && repo.canvas.cssW, upFrame: up.frameBox, repoFrame: repo.frameBox, panelCol: [up.panelBox, repo.panelBox], propsCol: [up.propsBox, repo.propsBox], upScale, repoScale, dpr: repo.dpr }))
    ok(repo.live && repo.canvas && repo.live.width === repo.canvas.w && repo.live.height === repo.canvas.h && repo.live.dpr === repo.dpr && repo.live.updates >= 1,
      'D4 活档位读数自洽（`window.__mpwLiveRes`）：canvas 尺寸 == live.width/height、dpr == devicePixelRatio、重算计数 ≥1',
      JSON.stringify(repo.live))
    ok(back.attrSrc === 'upstream' && String(back.src).includes('/wallpaper-engine-webgl/renderer/index.html') &&
      back.canvas && back.canvas.w === back.canvas.cssW,
      'D5 上游档的画布口径与原来逐位一致（1× CSS 像素）—— 对照档没有被"整合"弄坏', JSON.stringify(back.canvas))
  } else {
    console.log('SKIP D3 ★画质判据（画布像素）—— 本机浏览器无 WebGL2（画布级读数不可信）；读数 ' +
      JSON.stringify({ panelUp: up.canvas && up.canvas.cssW, panelRepo: repo.canvas && repo.canvas.cssW, upScale, repoScale, dpr: repo.dpr }))
    console.log('SKIP D4 活档位读数自洽 —— 本机浏览器无 WebGL2（`__mpwLiveRes` 只在场景启动后发布）；读数 ' + JSON.stringify(repo.live || null))
    console.log('SKIP D5 上游档画布口径 —— 本机浏览器无 WebGL2（产物页同样建不了 GL）；读数 ' + JSON.stringify(back.canvas || null))
  }
  ok(pageErrs.filter((m) => !/WEBGL_debug_renderer_info|Error in parsing value/.test(m)).length === 0,
    'D6 整轮顶层页 0 个脚本错（切档/重挂载不得抛错）', JSON.stringify(pageErrs.slice(0, 3)))
}

console.log(`── 汇总：PASS=${pass} FAIL=${fail}`)
process.exit(fail === 0 ? 0 : 1)
