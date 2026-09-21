#!/usr/bin/env node
/**
 * bench-renderer-source-test.mjs —— 「预览用哪个渲染器」这条线的一体化门禁（2026-09-21）。
 *
 * 覆盖三件事（对应任务书三步）：
 *   A. **纯函数层**（Node 直接跑真源码，不需浏览器）：档位归一 / URL 改写（完整保留原有 query）/
 *      DPR 上限只在"用户显式改过"时生效 / 状态行计划 / src 包装层（假原型驱动真接线）。
 *   B. **core 的画布活档位**（`?res=dpr|dpr1..dpr5`）：`parseResTier` + `resolveLiveCanvasSize`
 *      的算式与上限（"画布 = 显示尺寸 × DPR（有上限）"这条链的**唯一真源**）。
 *   C. **真机读数**（headless firefox，SKIP-able）：`:8902` 里把预览切到「本仓渲染器」，读
 *      **同一个包、同一块面板**下两条路径的画布像素 / 生效 DPR / query 保留情况。
 *      —— 这是"上游 1× CSS 像素 vs 本仓 显示尺寸×DPR"的**判据**（数字，不是观感）。
 *
 * 无 :8902 / 无 Playwright / 无 firefox ⇒ C 段整体 SKIP（A/B 段照跑，门禁不红）。
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
  ok(/RENDERER_ROOT_ROUTES\.some/.test(SERVER_TEXT) && /proxyRenderer\(req, res, url, rel\)/.test(SERVER_TEXT) &&
    /if \(localErr\) return jsonErr\(res, localErr\)/.test(SERVER_TEXT),
    'C5 服务端：静态面优先（`demo/` 里真有同名文件就不代理），越根/坏 URL 仍走本服务 400/403 的口径')
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
  const browser = await firefox.launch({
    headless: true,
    env: { ...process.env, MOZ_WEBGL_FORCE_SOFTWARE: '1', LIBGL_ALWAYS_SOFTWARE: '1' },
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true, 'webgl.out-of-process': false },
  })
  let read = null
  try {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const pageErrs = []
    page.on('pageerror', (e) => pageErrs.push(String(e.message).slice(0, 160)))
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
    // 默认档 = 本仓渲染器。⚠ 时序（实测）：静态台在 1.2s 会走一次"合成样例"（本仓档下 = 把预览导航到
    //   `?id=sample-synthetic`）⇒ 先等它落定，再点壁纸，读数才是"已挂载的那张壁纸"。
    await page.waitForTimeout(4000)
    await page.evaluate((id) => {
      const li = [...document.querySelectorAll('#list li[data-id]')].find((x) => String(x.dataset.id) === String(id)) || document.querySelector('#list li[data-id]')
      if (li) li.click()
    }, PROBE_ID)
    await page.waitForTimeout(13000)
    // 兜一次：若样例探测的导航在点击之后才生效，src 会缺 `src=` ⇒ 再点一次（产物自己的挂载路径）
    if (!/src=/.test(String((await readLive()).src))) {
      await page.evaluate((id) => {
        const li = [...document.querySelectorAll('#list li[data-id]')].find((x) => String(x.dataset.id) === String(id)) || document.querySelector('#list li[data-id]')
        if (li) li.click()
      }, PROBE_ID)
      await page.waitForTimeout(12000)
    }
    //  新契约：**打开就是本仓**（先读它）⇒ 再切到上游当对照 ⇒ 再切回本仓验证可逆。
    const repo0 = await readLive()
    await selectSource('upstream')
    await page.waitForTimeout(13000)
    const up = await readLive()
    await selectSource('repo')
    await page.waitForTimeout(16000)
    const repo = await readLive()
    await selectSource('upstream')
    await page.waitForTimeout(11000)
    const back = await readLive()
    read = { repo0, up, repo, back, pageErrs }
  } finally {
    try { await browser.close() } catch { /* 已关 */ }
  }
  const { repo0, up, repo, back, pageErrs } = read
  fs.writeFileSync(path.join(os.tmpdir(), 'bench-renderer-source-readings.json'), JSON.stringify(read, null, 1))
  console.log('读数 ' + JSON.stringify({ defaultCanvas: repo0.canvas, upstream: up.canvas, repo: repo.canvas, back: back.canvas, dpr: repo.dpr, repoLive: repo.live, repoAlpha: repo.alpha }))
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
  ok(up.canvas && repo.canvas && near(up.canvas.cssW, repo.canvas.cssW, 2) &&
    near(upScale, 1, 0.05) && near(repoScale, repo.dpr, 0.05),
    'D3 ★画质判据（同一块面板、同一张包）：上游画布 = 面板 CSS 像素 × **1**（`renderDpr=1` 上限），' +
    '本仓画布 = 面板 CSS 像素 × **设备 DPR** —— 这就是"预览糊"的根因与修法',
    JSON.stringify({ panelUp: up.canvas && up.canvas.cssW, panelRepo: repo.canvas && repo.canvas.cssW, upScale, repoScale, dpr: repo.dpr }))
  ok(repo.live && repo.live.width === repo.canvas.w && repo.live.height === repo.canvas.h && repo.live.dpr === repo.dpr && repo.live.updates >= 1,
    'D4 活档位读数自洽（`window.__mpwLiveRes`）：canvas 尺寸 == live.width/height、dpr == devicePixelRatio、重算计数 ≥1',
    JSON.stringify(repo.live))
  ok(back.attrSrc === 'upstream' && String(back.src).includes('/wallpaper-engine-webgl/renderer/index.html') &&
    back.canvas && back.canvas.w === back.canvas.cssW,
    'D5 上游档的画布口径与原来逐位一致（1× CSS 像素）—— 对照档没有被"整合"弄坏', JSON.stringify(back.canvas))
  ok(pageErrs.filter((m) => !/WEBGL_debug_renderer_info|Error in parsing value/.test(m)).length === 0,
    'D6 整轮顶层页 0 个脚本错（切档/重挂载不得抛错）', JSON.stringify(pageErrs.slice(0, 3)))
}

console.log(`── 汇总：PASS=${pass} FAIL=${fail}`)
process.exit(fail === 0 ? 0 : 1)
