// web-frame-host-test.mjs —— 第 ⑥ 条：web 壁纸宿主契约（纯函数 + shim 语义自证）
//
// 三块：
//   H 档位/入口/降档/状态（`core/web-frame-host.mjs`）—— 把 docs/WEB-WALLPAPER-MERGE.md §3.3 的四条规则
//     与 §3.9 的失败态逐条钉住，重点是**三条硬规则**：同源绝不用 blob、被嵌入绝不自动升 compat、
//     显式档位永不自动换档。
//   I 注入与 CSP（`core/we-web-shim.mjs`）—— 幂等 / `</script` 转义 / 无 head 自造 / 超限跳过 / CSP 跳过。
//   S **真 shim 的语义**：把生成的 shim 源丢进 `node:vm` 的假 window 里执行，验证"回调延后到微任务、
//     晚挂 listener 拿全量快照、同一个对象重复赋值不重放、暂停期间不下发音频、媒体 listener 回放最近一帧、
//     帧内 storage 抛错才装 facade、上限抛 QuotaExceededError、ready 上报"。这一组是**行为**判据，
//     不是"源码里有这行字"——上一轮吃过"判据只认字符串"的亏。
//
// 运行：node tests/web-frame-host-test.mjs   （全过退出码 0）
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {
  WEB_FRAME_MODES, WEB_SHIM_READY_TIMEOUT_MS, WEB_INJECT_MAX_BYTES,
  normalizeWebFrameMode, resolveWebFrameMode, webFrameSandboxAttr, webFrameBox,
  webEntryPlan, webShimDowngradePlan, webFrameStatus,
} from '../core/web-frame-host.mjs'
import { ROOT } from './_root.mjs'
import { WEB_SHIM_ATTR, buildWebShimSource, hasBlockingCsp, escapeScriptClose, injectWebShim } from '../core/we-web-shim.mjs'
import { WEB_STORE_LIMITS, normalizeWallId, wallIdFor, storePath, sanitizeStoreData, mergeStore, evictPlan, opaqueCorsHeaders } from '../server/web-store.mjs'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  [' + d + ']' : '')) } else { fail++; console.log('  ✗ ' + n + (d ? '  [' + d + ']' : '')) } }

/** 起一个假 window 跑真 shim（沙箱里只有 shim 自己会用到的东西）。 */
function runShim(env = {}) {
  const posted = []
  const warnings = []
  const store = new Map()
  const realStorage = env.realStorage !== false
  const storage = realStorage ? {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)) },
    removeItem: (k) => { store.delete(String(k)) },
  } : {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('SecurityError') },
    removeItem: () => { throw new Error('SecurityError') },
  }
  const listeners = {}
  const win = {
    location: { search: env.search || '' },
    parent: { postMessage: (m) => posted.push(m) },
    console: { warn: (m) => warnings.push(String(m)) },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn) },
    fetch: () => Promise.resolve({ ok: true }),
    setTimeout: () => 1,
    clearTimeout: () => {},
  }
  /* ⚠ 不透明源下**访问 `window.localStorage` 本身就抛** `SecurityError`（不是"方法抛"）——
     桩必须照真语义做，否则 `?webstore=0` 那条断言（靠"访问抛不抛"判）永远为假。 */
  if (realStorage) { win.localStorage = storage; win.sessionStorage = storage }
  else {
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(win, name, { configurable: true, get() { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e } })
    }
  }
  win.window = win
  const doc = { querySelectorAll: () => [] }
  const ctx = {
    window: win, document: doc, Promise, Object, JSON, Array, String, Number, Math, Date, Error,
    URLSearchParams, DOMException, setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, console: win.console,
  }
  ctx.globalThis = ctx
  vm.createContext(ctx)
  vm.runInContext(buildWebShimSource(), ctx, { filename: 'mpw-web-shim.js' })
  return { win, posted, warnings, listeners }
}
const tick = () => new Promise((r) => setImmediate(r))

console.log('== H 档位与入口规划（docs §3.3）==')
{
  ok('H1 三档常量与插件侧同形', WEB_FRAME_MODES.join(',') === 'auto,compat,sandbox')
  ok('H2 未知档位回落 auto 且留痕', normalizeWebFrameMode('wat').mode === 'auto' && normalizeWebFrameMode('wat').fellBack === true)
  ok('H3 空值 = auto（不算回落）', normalizeWebFrameMode('').mode === 'auto' && normalizeWebFrameMode('').fellBack === false)
  ok('H4 大小写/空白不敏感', normalizeWebFrameMode('  SANDBOX ').mode === 'sandbox' && normalizeWebFrameMode('Compat').explicit === true)

  const auto = resolveWebFrameMode('', { sameOriginService: true, embed: false })
  ok('H5 auto + 本服务入口 + 未嵌入 ⇒ compat（原生指针/焦点，Spine 类贴图可用）',
    auto.mode === 'compat' && auto.explicit === false, auto.why)
  const emb = resolveWebFrameMode('', { sameOriginService: true, embed: true })
  ok('H6 auto + **被宿主嵌入** ⇒ 一律 sandbox（同源即越权面，规则②）', emb.mode === 'sandbox', emb.why)
  const cross = resolveWebFrameMode('', { sameOriginService: false, embed: false })
  ok('H7 auto + 非同源入口 ⇒ sandbox', cross.mode === 'sandbox' && cross.why === 'auto:cross-origin')
  const forced = resolveWebFrameMode('compat', { sameOriginService: false, embed: true })
  ok('H8 显式 compat 在"该 sandbox"的上下文里也照办（规则③：显式永不自动换档）',
    forced.mode === 'compat' && forced.explicit === true, forced.why)
  ok('H9 sandbox 属性**只有**那两个 allow-*（多一个都是新越权面）',
    webFrameSandboxAttr('sandbox') === 'allow-scripts'
    && webFrameSandboxAttr('compat') === 'allow-scripts allow-same-origin'
    && !/pointer-lock|popups|forms|modals|downloads|top-navigation|storage-access/.test(webFrameSandboxAttr('compat') + webFrameSandboxAttr('sandbox')))
  ok('H10 帧盒默认 100%×100%（web 没有内在尺寸，不默认 cover）',
    webFrameBox('').fit === 'auto' && webFrameBox('').full === true && webFrameBox('cover').fit === 'cover')

  const sameRaw = webEntryPlan('http://127.0.0.1:8899/web/dev/1/index.html', { sameOrigin: true })
  ok('H11 同源入口 ⇒ **原始 URL**（规则①：blob 会让 origin=null ⇒ 相对贴图跨域）',
    sameRaw.kind === 'raw' && sameRaw.injectable === true && /origin=null/.test(sameRaw.why), sameRaw.why)
  const crossRaw = webEntryPlan('https://example.com/a/index.html', { sameOrigin: false })
  ok('H12 跨源默认也走原始 URL，并如实标"宿主未注入 shim"',
    crossRaw.kind === 'raw' && crossRaw.injectable === false && /未注入/.test(crossRaw.why))
  const crossBlob = webEntryPlan('https://example.com/a/index.html', { sameOrigin: false, blobOptIn: true })
  ok('H13 只有显式 `?webshim=blob` 才走 fetch→注入→blob（并写明贴图风险）',
    crossBlob.kind === 'blob' && /风险/.test(crossBlob.why))
  ok('H14 空入口 ⇒ kind=none（调用方据此报 entry-missing，不假装有画面）',
    webEntryPlan('', {}).kind === 'none' && webEntryPlan('   ').why === 'entry-missing')
}

console.log('== H 降档与状态（规则③ + §3.9）==')
{
  const t = WEB_SHIM_READY_TIMEOUT_MS
  ok('H15 sandbox + 未 ready + 未嵌入 + 非显式 + 超时 ⇒ 一次性降 compat',
    webShimDowngradePlan({ mode: 'sandbox', explicit: false, embed: false, ready: false, elapsedMs: t + 10 }).mode === 'compat')
  ok('H16 显式档位**永不**自动换档',
    webShimDowngradePlan({ mode: 'sandbox', explicit: true, embed: false, ready: false, elapsedMs: t * 10 }).changed === false)
  ok('H17 被嵌入时**不降**（同源即越权面）并把话说明白',
    /手动/.test(webShimDowngradePlan({ mode: 'sandbox', explicit: false, embed: true, ready: false, elapsedMs: t * 10 }).why))
  ok('H18 已经降过一次就不再降（不许来回抖）',
    webShimDowngradePlan({ mode: 'sandbox', explicit: false, embed: false, ready: false, elapsedMs: t * 10, alreadyDowngraded: true }).changed === false)
  ok('H19 还没到 2.5s 就等着', webShimDowngradePlan({ mode: 'sandbox', ready: false, elapsedMs: 100 }).why === 'waiting')
  ok('H20 ready 之后不谈降档', webShimDowngradePlan({ mode: 'sandbox', ready: true, elapsedMs: t * 10 }).why === 'ready')

  const cases = [
    ['entry-missing', 'error'], ['entry-not-html', 'error'], ['entry-fetch-failed', 'warn'],
    ['csp-blocked', 'warn'], ['cross-origin-no-shim', 'warn'], ['shim-missing', 'warn'],
    ['author-error', 'warn'], ['webframe-unsupported', 'warn'], ['no-frame-pixels', 'warn'],
  ]
  let bad = []
  for (const [state, level] of cases) {
    const s = webFrameStatus({ state, mode: 'sandbox', detail: 'x' })
    if (s.level !== level || !s.line) bad.push(state + ':' + s.level)
  }
  ok('H21 九个失败态各自有 level 与一句人话（不静默）', bad.length === 0, bad.join(','))
  const okst = webFrameStatus({ state: 'ok', mode: 'compat' })
  ok('H22 正常态是 ok 级且写明档位', okst.level === 'ok' && /compat/.test(okst.line))
  ok('H23 未知状态不许崩（回落成 ok 级 + 原文）', typeof webFrameStatus({ state: 'wat' }).line === 'string')
}

console.log('== I 注入与 CSP（§3.6 / §3.1 服务端注入）==')
{
  ok('I1 幂等标记常量与插件侧同形', WEB_SHIM_ATTR === 'data-mpw-we-shim')
  ok('I2 `</script` 会被打断（否则 shim 文本提前闭合宿主 script）', escapeScriptClose('a</script>b') === 'a<\\/script>b')
  ok('I3 阻塞性 CSP 认得出', hasBlockingCsp(`<meta http-equiv="Content-Security-Policy" content="script-src 'self'">`) === true)
  ok('I4 有 unsafe-inline / 通配 / 无 script-src ⇒ 不算阻塞（别把能注入的判成不能）',
    hasBlockingCsp(`<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'">`) === false
    && hasBlockingCsp(`<meta http-equiv='Content-Security-Policy' content="script-src *">`) === false
    && hasBlockingCsp(`<meta http-equiv="Content-Security-Policy" content="img-src 'self'">`) === false
    && hasBlockingCsp('<html></html>') === false)

  const html = '<html><head><title>t</title></head><body>hi</body></html>'
  const r1 = injectWebShim(html, { seed: { op: 'props', props: { a: { value: 1 } } } })
  ok('I5 插在 `<head>` 之后（作者脚本之前）', r1.injected === true && r1.reason === 'head'
    && r1.html.indexOf(WEB_SHIM_ATTR) < r1.html.indexOf('<title>'))
  ok('I6 带种子脚本（首帧策略：免等 postMessage）', /__mpwWebSeed/.test(r1.html) && new RegExp(WEB_SHIM_ATTR + '-seed').test(r1.html))
  ok('I7 二次注入原样返回（幂等）', injectWebShim(r1.html).reason === 'already' && injectWebShim(r1.html).injected === false)
  const noHead = injectWebShim('<html><body>x</body></html>')
  ok('I8 没有 head 就自造一个（不许因为缺 head 就放弃注入）', noHead.injected === true && noHead.reason === 'made-head' && /<head><script/.test(noHead.html))
  const frag = injectWebShim('<p>raw fragment</p>')
  ok('I9 残缺 HTML 也能注入（并补成完整文档）', frag.reason === 'made-document' && frag.html.indexOf('<p>raw fragment</p>') > 0)
  const big = injectWebShim('x'.repeat(WEB_INJECT_MAX_BYTES + 1))
  ok('I10 超过 8MB 跳过（不复制大文档）', big.skipped === true && big.reason === 'too-large' && big.html.length === WEB_INJECT_MAX_BYTES + 1)
  const csp = injectWebShim('<html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'"></head></html>')
  ok('I11 阻塞性 CSP ⇒ 不注入、原样返回（留痕给宿主写响应头）', csp.injected === false && csp.reason === 'csp')
  ok('I12 空输入不注入也不崩', injectWebShim('').reason === 'empty' && injectWebShim(null).bytes === 0)
  const escaped = injectWebShim('<head></head>', { shimSource: 'var s = "</script>";' })
  ok('I13 自定义 shim 里的 `</script>` 也被转义', escaped.html.indexOf('</script>";') === -1 && escaped.html.indexOf('<\\/script>') > 0)
}

console.log('== S 真 shim 的语义（node:vm 里跑生成的源）==')
{
  const { win, posted, listeners } = runShim()
  ok('S1 shim 装好了并上报 ready', !!win.__mpwWebShim && posted.some((m) => m.op === 'ready'))
  ok('S2 `wallpaperMediaIntegration` 三个数是官方值（PLAYING=1，否则 `PLAYING||0` 会误判）',
    win.wallpaperMediaIntegration.PLAYING === 1 && win.wallpaperMediaIntegration.PLAYBACK_STOPPED === 0 && win.wallpaperMediaIntegration.PAUSED === 2)

  /* S3 赋值只登记：**同步**不回调（同步回调会重入 React 类作者的渲染函数） */
  let syncCalls = 0
  win.__mpwWebControl({ op: 'props', props: { a: { value: 1 } } })
  win.wallpaperPropertyListener = { applyUserProperties: () => { syncCalls++ } }
  ok('S3 赋值后同步回调数 = 0（回调延后到微任务）', syncCalls === 0)
  await tick(); await tick()
  ok('S4 微任务之后拿到全量快照（晚挂 listener 也补齐）', syncCalls === 1, 'calls=' + syncCalls)

  /* S5 同一个对象重复赋值不重放 */
  const same = win.wallpaperPropertyListener
  win.wallpaperPropertyListener = same
  await tick(); await tick()
  ok('S5 同一个 listener 对象重复赋值不重放', syncCalls === 1, 'calls=' + syncCalls)

  /* S6 暂停期间不下发音频；恢复后才发 */
  let bands = null
  win.wallpaperRegisterAudioListener((b) => { bands = b })
  win.__mpwWebControl({ op: 'audio', bands: [1, 2, 3] })
  await tick(); await tick()
  ok('S6 有数据时音频回调拿到数组', Array.isArray(bands) && bands.length === 3, JSON.stringify(bands))
  bands = null
  win.__mpwWebControl({ op: 'pause', paused: true })
  await tick(); await tick()
  win.__mpwWebControl({ op: 'audio', bands: [4, 5, 6] })
  await tick(); await tick()
  ok('S7 **暂停期间不下发**音频（作者不该在暂停时看到频谱）', bands === null)
  win.__mpwWebControl({ op: 'pause', paused: false })
  await tick(); await tick()
  win.__mpwWebControl({ op: 'audio', bands: [7, 8, 9] })
  await tick(); await tick()
  ok('S8 恢复后音频照旧下发', Array.isArray(bands) && bands[0] === 7)

  /* S9 媒体 listener 晚注册回放最近一帧 */
  win.__mpwWebControl({ op: 'media', mediaPlayback: 1, mediaTimeline: { position: 3, duration: 9 } })
  await tick(); await tick()
  let playback = null, timeline = null
  win.wallpaperRegisterMediaPlaybackListener((v) => { playback = v })
  win.wallpaperRegisterMediaTimelineListener((v) => { timeline = v })
  await tick(); await tick()
  ok('S9 晚注册的媒体 listener 回放最近一帧（Playback/Timeline 都有）',
    playback === 1 && timeline && timeline.duration === 9, JSON.stringify({ playback, timeline }))

  /* S10 随机文件：池空 ⇒ 空串 */
  let picked = 'unset'
  win.wallpaperRequestRandomFileForProperty('p', (v) => { picked = v })
  await tick(); await tick()
  ok('S10 池空时回调空串（作者普遍 `if (p)` 守卫）', picked === '')
  win.__mpwWebControl({ op: 'random', files: { p: ['only.png'] } })
  picked = 'unset'
  win.wallpaperRequestRandomFileForProperty('p', (v) => { picked = v })
  await tick(); await tick()
  ok('S11 池里有文件时给出池内值', picked === 'only.png')

  /* S12 setPaused 走作者 listener */
  let pausedSeen = null
  win.wallpaperPropertyListener = { setPaused: (v) => { pausedSeen = v } }
  win.__mpwWebControl({ op: 'pause', paused: true })
  await tick(); await tick()
  ok('S12 `setPaused` 传给作者（暂停 = 作者语义）', pausedSeen === true)

  ok('S13 `wallpaperPluginListener` 有 onPluginLoaded（iCUE 类作者不做 if 判断也不崩）',
    typeof win.wallpaperPluginListener.onPluginLoaded === 'function')
  ok('S14 作者异常被兜住（注册了 error/unhandledrejection，不改壁纸状态）',
    Array.isArray(listeners.error) && Array.isArray(listeners.unhandledrejection))
}

console.log('== S 真 shim 的存储 facade（不透明源）==')
{
  const opaque = runShim({ realStorage: false, search: '' })
  let facade = null
  try { facade = opaque.win.localStorage } catch (e) { facade = 'THREW' }
  ok('S15 真 storage 访问就抛（不透明源）⇒ 装 facade（不再是 SecurityError）', facade && facade !== 'THREW' && typeof facade.setItem === 'function')
  try { facade.setItem('k', 'v') } catch (e) {}
  ok('S16 facade 是同步语义（写完立刻读得到）', facade.getItem('k') === 'v' && facade.length === 1)
  let quota = null
  try { facade.setItem('big', 'x'.repeat(4097)) } catch (e) { quota = e && e.name }
  ok('S17 单值超 4096 ⇒ 抛 QuotaExceededError（与真 Storage 同形）', quota === 'QuotaExceededError', String(quota))
  let keys = null
  try { for (let i = 0; i < 80; i++) facade.setItem('k' + i, '1') } catch (e) { keys = e && e.name }
  ok('S18 键数超 64 ⇒ 抛 QuotaExceededError', keys === 'QuotaExceededError', String(keys))
  facade.removeItem('k'); facade.clear()
  ok('S19 removeItem/clear 可用且 length 跟着变', facade.getItem('k') === null && facade.length === 0)

  const real = runShim({ realStorage: true })
  const live = real.win.localStorage
  live.setItem('x', 'y')
  ok('S20 真 storage 可用时**一个字节都不动**（不装 facade，读到的是真值）', live.getItem('x') === 'y')

  /* S22 种子回灌：种子脚本在 shim 之后执行 ⇒ facade 必须"第一次访问时"再取，且同步读得到 */
  const seeded = runShim({ realStorage: false })
  seeded.win.__mpwWebSeed = { store: { data: { skin: 'dark', vol: '0.5' } } }
  ok('S22 种子里的存储值首帧同步可读（懒回灌）', seeded.win.localStorage.getItem('skin') === 'dark' && seeded.win.localStorage.length === 2,
    JSON.stringify([seeded.win.localStorage.getItem('skin'), seeded.win.localStorage.length]))
  seeded.win.localStorage.setItem('skin', 'light')
  ok('S23 回灌之后写入正常覆盖（不是只读快照）', seeded.win.localStorage.getItem('skin') === 'light')

  const off = runShim({ realStorage: false, search: '?webstore=0' })
  let threw = null
  try { void off.win.localStorage } catch (e) { threw = true }
  ok('S21 `?webstore=0` = 保留旧行为（访问即抛）', threw === true || off.win.localStorage === undefined)
}

console.log('== W 存储落盘的服务端逻辑（§3.5；与帧内 facade 同值）==')
{
  ok('W1 wallId 只接受受限字符集（路径穿越在拼路径前就被挡掉）',
    normalizeWallId('30587e367c02') === '30587e367c02' && normalizeWallId('../etc/passwd') === '' && normalizeWallId('a/b') === ''
    && normalizeWallId('') === '' && normalizeWallId('中文') === '')
  ok('W2 wallId 生成只吃相对量（同输入同结果、长度 12）',
    wallIdFor(['3580207945', 'index.html']) === wallIdFor('3580207945index.html') && wallIdFor(['a', 'b']).length === 12)
  ok('W3 storePath：非法 id ⇒ 空串（调用方据此 400，而不是拼出个路径）',
    storePath('/tmp/x', '30587e367c02') === '/tmp/x/30587e367c02.json' && storePath('/tmp/x', '../y') === '')

  const big = sanitizeStoreData({ a: 'x', big: 'y'.repeat(WEB_STORE_LIMITS.value + 1), '': 'z' })
  ok('W4 单值超限**丢这一项**（不是丢整张）、空键丢掉', big.data.a === 'x' && !('big' in big.data) && big.dropped === 2, JSON.stringify(big))
  let many = {}
  for (let i = 0; i < 90; i++) many['k' + i] = '1'
  const capped = sanitizeStoreData(many)
  ok('W5 键数封顶 64（多出来的记 truncated，不静默吞）',
    Object.keys(capped.data).length === WEB_STORE_LIMITS.keys && capped.truncated === 90 - WEB_STORE_LIMITS.keys)
  const merged = mergeStore({ a: '1', keep: 'k' }, { a: '2' })
  ok('W6 合并：新值覆盖旧值、旧键保留', merged.data.a === '2' && merged.data.keep === 'k')
  ok('W7 非对象输入不崩（回落空表）', Object.keys(sanitizeStoreData(null).data).length === 0 && Object.keys(mergeStore(null, 'x').data).length === 0)

  /* ⚠ id 必须是**契约里的长度**（6..32 位）：第一版用了 'a'/'b'/'c'，被 normalizeWallId 正当滤掉，
     于是 W9/W10/W11 变成"空表上恒真"——测试数据不真实，判据就没有分辨力。 */
  const entries = [{ id: 'aaaaaa', mtimeMs: 3 }, { id: 'bbbbbb', mtimeMs: 1 }, { id: 'cccccc', mtimeMs: 2 }]
  ok('W8 淘汰：没到上限就不删', evictPlan(entries, 'dddddd', 64).length === 0)
  const victims = evictPlan(entries, 'dddddd', 3)
  ok('W9 淘汰按"最旧优先"，且**不删这次要写的那张**', victims.length === 1 && victims[0] === 'bbbbbb', JSON.stringify(victims))
  ok('W10 更新已存在的那张不算新增（不该触发淘汰）', evictPlan(entries, 'aaaaaa', 3).length === 0)
  ok('W11 淘汰计划忽略非法 id（不拿脏数据当文件名）',
    evictPlan([{ id: '../x', mtimeMs: 0 }, { id: 'okokok', mtimeMs: 0 }], 'newnew', 1).join(',') === 'okokok')
  ok('W11b 分辨力自证：同一组数据若把 id 换成 1 字符，会得到空计划（说明 W9 不是恒真）',
    evictPlan([{ id: 'a', mtimeMs: 3 }, { id: 'b', mtimeMs: 1 }], 'd', 1).length === 0)

  const h = opaqueCorsHeaders('null')
  ok('W12 不透明源 CORS：**恰好** Origin: null 才给，且不给 allow-credentials',
    h['Access-Control-Allow-Origin'] === 'null' && !('Access-Control-Allow-Credentials' in h) && h.Vary === 'Origin')
  ok('W13 别的源一个头都不给（真实站点拿不到该头）',
    Object.keys(opaqueCorsHeaders('https://x.example')).length === 0 && Object.keys(opaqueCorsHeaders(undefined)).length === 0)
}

console.log('== P 渲染器页接线（demo.html；静态判据）==')
{
  const html = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8')
  ok('P1 有 `?type=web` 分支且**先于**取包/解析场景（web 包可能根本没有 scene.pkg）',
    /=== 'web'\)\s*\{\s*\n\s*await mountWebFrame\(id\)/.test(html)
    && html.includes('await mountWebFrame(id)')
    && html.indexOf('await mountWebFrame(id)') < html.indexOf("logf('加载场景 '"))
  ok('P2 帧属性来自契约函数（不手写字符串）：sandbox = webFrameSandboxAttr(...)',
    /fr\.setAttribute\('sandbox', webFrameSandboxAttr\(plan\.mode\)\)/.test(html))
  /* ⚠ 只在**那一行**上判：整份 demo.html 里当然到处都有 `allow*` 字样（注释/能力表），
     拿全文搜会把无关文字当成违规（第一版就是这么假红的）。 */
  /* ⚠ 只看**属性值本身**：那一行后面的注释里就写着"指针锁/弹窗/表单/下载/top-navigation 都不给"，
     拿整行去搜负向词会把注释判成违规（第二版又假红了一次）。 */
  const allowVal = (html.match(/setAttribute\('allow',\s*'([^']*)'\)/) || [, ''])[1]
  ok('P3 `allow` 只给 autoplay（指针锁/弹窗/表单/下载/top-navigation 都不给）',
    allowVal.split(/\s+/).filter(Boolean).length === 1 && /^autoplay$/.test(allowVal.trim()),
    JSON.stringify(allowVal))
  ok('P4 档位/入口/降档/状态四条都走 core 的纯函数（页内不另写一套判定）',
    /resolveWebFrameMode\(q\.get\('webframe'\)/.test(html) && /webEntryPlan\(/.test(html)
    && /webShimDowngradePlan\(/.test(html) && /webFrameStatus\(/.test(html))
  ok('P5 只有 `?webshim=blob` 才走 fetch→注入→blob（同源绝不 blob）',
    /blobOptIn: String\(q\.get\('webshim'\) \|\| ''\)\.toLowerCase\(\) === 'blob'/.test(html)
    && /if \(entry\.kind === 'blob'\)/.test(html))
  ok('P6 状态面对外可读（`window.__mpwWebFrame`，测试台/探针据此判"到底跑到没有"）',
    /window\.__mpwWebFrame = Object\.assign\(/.test(html))
  ok('P7 降档只走一次（`webReloads` 计数进 URL，重载后 alreadyDowngraded=true）',
    /alreadyDowngraded: webReloads > 0/.test(html) && /_webreload/.test(html))
  ok('P8 宿主→帧控制面与 shim 的 op 名同源（props/pause/audio/media/random）',
    /mpwWebSend\('props'/.test(html) && /mpwWebSend\('pause'/.test(html) && /mpw: 'mpw:web'/.test(html))
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')
if (fail === 0) console.log('✓ web 宿主契约通过：三档解析 / 入口规划（同源绝不 blob）/ 降档三条硬规则 / 九个失败态 / 注入五条规则 / shim 语义 23 条 / 存储落盘 13 条')
process.exit(fail > 0 ? 1 : 0)
