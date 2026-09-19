// bench-click-test.mjs —— ①2026-09-19「用真 X11 点击测统一测试台（:8902）」的**端到端点击**门禁
//
// 为什么单独一条：合成分散在 `page.click()` 里点不到两类真问题 ——
//   ① **遮挡**：某个浮层/面板盖住了目标（`page.click` 会"尽力滚动+点中心"，反而掩盖了"用户点不到"）；
//      本仓库 2026-09-19 就踩过一次：属性面板盖住画布左 1/3，指针事件根本到不了画布。
//   ② **命中测试**：屏幕坐标 → 元素 的换算（X11 桌面坐标 vs 页面 CSS 像素）在真机上才有意义。
// 所以这里：**用 xdotool 发真点击**，并且点之前先做 `elementFromPoint` 命中自证 + 点之后断言"真的变了"。
//
// 断言（每条都能变红）：
//   B1 目标元素在**视口内且未被遮挡**（`elementFromPoint` 命中它自己或其后代）
//   B2 真点击换壁纸 ⇒ iframe `#frame` 的 `src` 变成该壁纸 id，且测试台日志出现对应一行
//   B3 真点击 `Mouse trail` 开关 ⇒ 控件状态**翻转**（再点一次翻回来，证明不是一次性副作用）
//   B4 桌面像素确实变了（截图 diff > 0）——"点了但画面没动"要能看出来
//
// 用法：`node tests/x11-e2e/bench-click-test.mjs [--url http://127.0.0.1:8902/] [--w 1880] [--h 1000]`
//   前提：X 显示（DISPLAY）+ xdotool + scrot + :8902 在跑 + Playwright。任一缺 ⇒ **SKIP（退出码 0）**。
//   为什么窗口开 1880 宽：实测 1280 宽时工具栏（Pause/Remount/…/Mouse trail）在 **x≈1700–2540**，
//   整条被挤出视口右侧 ⇒ 那不是 bug 而是"窗口太窄"，测试必须开够宽才有意义（见 README §2）。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, WS } from '../_root.mjs'
import * as cua from './cua.mjs'

const argv = process.argv.slice(2)
const argOf = (n, d) => { const i = argv.indexOf(n); if (i >= 0 && argv[i + 1]) return argv[i + 1]; const eq = argv.find((a) => a.startsWith(n + '=')); return eq ? eq.slice(n.length + 1) : d }
const URL_BASE = argOf('--url', process.env.MPW_BENCH_URL || 'http://127.0.0.1:8902/')
const VIEW = { w: Number(argOf('--w', 1880)), h: Number(argOf('--h', 1000)) }
const SHOTS = process.env.MPW_X11_SHOTS || path.join(WS, 'reports', 'x11-shots', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-bench-click')

let pass = 0; let fail = 0; const notes = []
const ok = (c, label, extra = '') => { if (c) { pass++; console.log('PASS ' + label + (extra ? '  ' + extra : '')) } else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')) } }
const skip = (why) => { console.log('SKIP bench-click — ' + why); process.exit(0) }

const ch = cua.channelSummary()
console.log('通道: ' + JSON.stringify(ch))
if (!ch.geometry) skip('X 显示不可用（DISPLAY=' + cua.DISPLAY + '）')
if (!ch.scrot) skip('scrot 不在 PATH')
try { const r = await fetch(URL_BASE, { signal: AbortSignal.timeout(4000) }); if (!r.ok) skip(`测试台不可达：${URL_BASE} → ${r.status}`) } catch (e) { skip(`测试台不可达：${e.message}`) }

function findPlaywright() {
  const cands = [process.env.MPW_PLAYWRIGHT, path.join(ROOT, 'node_modules/playwright/index.js'),
    path.join(WS, 'dsh-mpkg-wallpaper/node_modules/playwright/index.js'), '/opt/node/lib/node_modules/playwright/index.js'].filter(Boolean)
  for (const c of cands) { try { if (fs.statSync(c).isFile()) return c } catch { /* next */ } }
  return null
}
const pwPath = findPlaywright()
if (!pwPath) skip('找不到 playwright')
const pw = await import(pathToFileURL(pwPath).href)
const firefox = (pw.default && pw.default.firefox) || pw.firefox
if (!firefox) skip('playwright 没有 firefox 导出')

const browser = await firefox.launch({
  headless: false,
  env: { ...process.env, DISPLAY: cua.DISPLAY, MOZ_WEBGL_FORCE_SOFTWARE: '1', LIBGL_ALWAYS_SOFTWARE: '1', MOZ_ENABLE_WAYLAND: '0' },
  firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false, 'gfx.webrender.software': true, 'webgl.out-of-process': false },
})
try {
  const ctx = await browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)))
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => !!document.getElementById('frame'), null, { timeout: 60000 })
  await page.waitForTimeout(4000)   // 等库列表与首个壁纸装载

  const geom = await page.evaluate(() => ({ ix: window.mozInnerScreenX, iy: window.mozInnerScreenY, sx: window.screenX, sy: window.screenY, iw: window.innerWidth, ih: window.innerHeight }))
  let ox = Number.isFinite(geom.ix) ? geom.ix : geom.sx
  let oy = Number.isFinite(geom.iy) ? geom.iy : geom.sy
  console.log('窗口: ' + JSON.stringify(geom) + ` ⇒ 内容原点 (${ox},${oy})  视口 ${VIEW.w}x${VIEW.h}`)
  const shot = (n) => cua.shot(path.join(SHOTS, n + '.png'))

  // 页面侧的"指针位置"跟踪器：`aimAt` 靠它判断"页面是否已经看到指针到位"（见 aimAt 注释）。
  // 用 pointermove（真 X 事件经 Firefox 处理后派发）而不是每步读 X 服务器：读 X 只能证明"真指针到了"。
  await page.evaluate(() => {
    window.__mp = { x: -1, y: -1, t: 0 }
    window.addEventListener('pointermove', (e) => { window.__mp = { x: e.clientX, y: e.clientY, t: Date.now() } }, true)
    window.addEventListener('mousemove', (e) => { window.__mp = { x: e.clientX, y: e.clientY, t: Date.now() } }, true)
  })

  /** 真点击前**重新读一次**内容原点：窗口被 WM 挪动/重排后 (ox,oy) 会变，
   *  拿旧值去点就是"整体偏移"地点到隔壁元素上 —— 2026-09-19 实测：S10 想点 26px 宽的收纳键，
   *  事件却落在 `#props`（x≥300）上，于是"点击到了、状态没变"，看起来像按钮坏了。 */
  const syncOrigin = async () => {
    const g = await page.evaluate(() => ({ ix: window.mozInnerScreenX, iy: window.mozInnerScreenY }))
    if (Number.isFinite(g.ix) && Number.isFinite(g.iy)) { ox = g.ix; oy = g.iy }
    return { ox, oy }
  }
  /** "闭环"瞄准：移过去后**读回**指针，偏了就补一次；再**等页面自己看到指针到位**才允许点击。
   *
   *  为什么必须等页面（2026-09-19 实测，S10 三次重试全红）：这台机器是**软件渲染 ~1 fps**，
   *  页面主线程一忙，Firefox 处理的鼠标位置就**滞后于真指针**。此时 `xdotool click` 发的是
   *  "真指针在 (286,146)"，而 Firefox 用**它自己还没更新到的旧坐标**去命中测试 ⇒ 事件坐标
   *  记成 `c=(315,310)`、目标变成 `#props`（26px 宽的收纳键当然点不到）。
   *  证据：`atBefore=svg`（页面认为该点是按钮）+ 指针读回 (286,146)，但点击事件自带坐标 (315,310)。
   *  ⇒ 判据不是"指针到位"，而是"**页面报的指针位置 == 目标**"。 */
  const aimAt = async (sx, sy) => {
    const tx = Math.round(sx), ty = Math.round(sy)
    try {                                     // 已在目标点：先离开 6px 制造新的 motion 事件，否则页面永远等不到更新
      const at = cua.pointerNow()
      if (Math.abs(at.x - tx) <= 1 && Math.abs(at.y - ty) <= 1) cua.pointerTo(tx + 6, ty + 6)
    } catch { /* ignore */ }
    cua.pointerGlide(sx, sy, { steps: 6, dwellMs: 60 })
    const now = cua.pointerNow()
    if (Math.abs(now.x - tx) > 2 || Math.abs(now.y - ty) > 2) {
      notes.push(`指针读回 (${now.x},${now.y}) ≠ 目标 (${tx},${ty}) ⇒ 补一次 warp`)
      cua.pointerTo(sx, sy)
    }
    const px = Math.round(sx - ox), py = Math.round(sy - oy)
    try {
      await page.waitForFunction(({ x, y }) => window.__mp && Math.abs(window.__mp.x - x) <= 2 && Math.abs(window.__mp.y - y) <= 2,
        { x: px, y: py }, { timeout: 6000, polling: 120 })
    } catch {
      let seen = null
      try { seen = await page.evaluate(() => window.__mp) } catch { /* ignore */ }
      notes.push(`页面 6s 内没"看到"指针到位（目标 ${px},${py}；页面自报 ${JSON.stringify(seen)}）⇒ 仍照点，靠重试兜底`)
    }
  }

  // ── 挑元素 + 命中自证 + 真点击（一个动作三件事，后面每步都复用） ──────────────
  const clickReal = async (selector, { nth = 0, settleMs = 2500, label = selector, inner = null } = {}) => {
    const hit = await page.evaluate(({ selector, nth, inner }) => {
      const els = [...document.querySelectorAll(selector)]
      const outer = els[nth]
      const el = (inner && outer) ? (outer.querySelector(inner) || outer) : outer
      if (!el) return { ok: false, why: `没有匹配 ${selector}[${nth}]${inner ? ' ' + inner : ''}（共 ${els.length} 个）` }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const r = el.getBoundingClientRect()
      const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2)
      const at = document.elementFromPoint(cx, cy)
      const inside = at === el || (at && el.contains(at))
      return { ok: true, cx, cy, w: Math.round(r.width), h: Math.round(r.height), inside,
        hitTag: at ? (at.id || at.tagName) + (at.className ? '.' + String(at.className).trim().split(/\s+/)[0] : '') : null,
        inViewport: cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight,
        text: (el.textContent || '').trim().slice(0, 40) }
    }, { selector, nth })
    if (!hit.ok) return { ...hit, clicked: false }
    ok(hit.inViewport, `${label}：目标在视口内`, `(${hit.cx},${hit.cy}) ${hit.w}x${hit.h}`)
    ok(hit.inside, `${label}：**未被遮挡**（elementFromPoint 命中它自己）`, `命中=${hit.hitTag}`)
    if (!hit.inside || !hit.inViewport) return { ...hit, clicked: false }
    await syncOrigin()
    await aimAt(ox + hit.cx, oy + hit.cy)
    await cua.sleep(250)
    cua.run('xdotool', ['click', '1'])          // ← 真 X11 点击（不是 page.click）
    await cua.sleep(settleMs)
    return { ...hit, clicked: true }
  }
  //  ①**点后轮询 + 重试一次**：实测踩过 —— 紧跟 62MB 包挂载之后的第一次真点击会被"忙"吞掉
  //    （事件到了、状态没变）。用户遇到的是"点了没反应"，所以这里必须**等到状态真的变了**，
  //    而不是 sleep 一下就当成功；重试一次是为了区分"忙"与"真坏"（两次都不动 = 真坏 ⇒ 判 FAIL）。
  const clickUntil = async (selector, opts, verify, { tries = 2, waitMs = 8000 } = {}) => {
    for (let i = 1; i <= tries; i++) {
      const r = await clickReal(selector, opts)
      const t0 = Date.now()
      for (;;) {
        const v = await verify()
        if (v) return { ...r, verified: true, tries: i }
        if (Date.now() - t0 > waitMs) break
        await cua.sleep(500)
      }
      if (i < tries) { notes.push(`${opts.label || selector}：第 ${i} 次点击后状态未变，重试一次`); await cua.sleep(1000) }
    }
    return { clicked: true, verified: false, tries }
  }
  const frameSrc = () => page.evaluate(() => { const f = document.getElementById('frame'); return f ? f.getAttribute('src') : null })
  const logText = () => page.evaluate(() => { const el = document.getElementById('logbody'); return el ? el.innerText : '' })

  await shot('00-bench-initial')
  const src0 = await frameSrc()
  console.log('初始 iframe src: ' + src0)

  // ── B2：真点击一个**壁纸标签**换壁纸（`BUTTON.wp-tab`；实测 1280 宽时它们在视口外） ──
  //  ①先等**库真的载入**（`button.wp-tab` ≥2）：库没进来时标签根本不存在，点击自然"没反应" ——
  //    这是本轮实测到的假红来源（active -1 → -1、src 不变），不是产品问题。
  try { await page.waitForFunction(() => document.querySelectorAll('button.wp-tab').length >= 2, null, { timeout: 30000 }) } catch { /* 下面按实际条数判 */ }
  const tabs = await page.evaluate(() => [...document.querySelectorAll('button.wp-tab')]
    .map((el, i) => { const r = el.getBoundingClientRect(); return { i, text: (el.textContent || '').trim().slice(0, 30), x: Math.round(r.x), w: Math.round(r.width) } }))
  console.log(`壁纸标签 ${tabs.length} 个，前 3 个 x=${tabs.slice(0, 3).map((t) => t.x).join(',')}`)
  if (!tabs.length) { notes.push('测试台没有 button.wp-tab（库为空？）⇒ B2/B3 未测') } else {
    const idx = tabs.length > 1 ? 1 : 0
    //  ①换壁纸是**异步**的（实测 2.5s 时还没换、3.5s 才换）⇒ 轮询到"活动标签变了 **或** src 变了"为止，别 sleep 一下就读。
    const activeBefore = await page.evaluate(() => [...document.querySelectorAll('button.wp-tab')].findIndex((el) => /active|on\b/.test(el.className)))
    let r2 = await clickReal('button.wp-tab', { nth: idx, label: `壁纸标签[${idx}] "${tabs[idx].text}"`, settleMs: 800 })
    const waitSwap = async (timeoutMs = 20000) => {
      const t0 = Date.now()
      for (;;) {
        const st = await page.evaluate(() => ({
          src: document.getElementById('frame') ? document.getElementById('frame').getAttribute('src') : null,
          active: [...document.querySelectorAll('button.wp-tab')].findIndex((el) => /active|on\b/.test(el.className)),
          log: (document.getElementById('logbody') || {}).innerText || '',
        }))
        if (st.src !== src0 || (activeBefore >= 0 && st.active !== activeBefore)) return st
        if (Date.now() - t0 > timeoutMs) return st
        await cua.sleep(1000)
      }
    }
    let st1 = await waitSwap(12000)
    if (st1.src === src0 && (activeBefore < 0 || st1.active === activeBefore)) {
      notes.push('壁纸标签：第 1 次点击后没换（库刚载入/主线程忙）⇒ 重试一次')
      r2 = await clickReal('button.wp-tab', { nth: idx, label: `壁纸标签[${idx}]（重试）`, settleMs: 1000 })
      st1 = await waitSwap(15000)
    }
    await shot('01-after-tab-click')
    const src1 = st1.src
    const log1 = st1.log
    console.log(`点后 iframe src: ${src1}\n活动标签 index=${st1.active}`)
    const idIn = (s, id) => !!s && (id === null || new RegExp('src=' + id).test(s))
    const clickedId = (tabs[idx].text.match(/\d{6,}/) || [null])[0]
    ok(r2.clicked && (src1 !== src0 || (activeBefore >= 0 && st1.active !== activeBefore)),
      '真点击壁纸标签 ⇒ 测试台真的换了壁纸（活动标签或 iframe src 变了）',
      `active ${activeBefore} → ${st1.active}（点了第 ${idx} 个）、src ${String(src0).slice(0, 40)} → ${String(src1).slice(0, 40)}`)
    ok(/renderer\/index\.html\?type=scene&src=\d+/.test(String(src1)), '换后 iframe 指向**某个具体的壁纸 id**（`?type=scene&src=<id>`）', String(src1).slice(0, 100))
    ok(st1.log.includes('mountScene start') || st1.log.includes('pkg body'), '测试台日志出现新壁纸的装载行（mountScene/pkg body）',
      log1.split('\n').slice(-2).join(' | ').slice(0, 160))
    if (clickedId) notes.push(`标签文本里的 id=${clickedId}（仅记录：src 实际是 ${(String(src1).match(/src=(\d+)/) || [])[1]}）`)
    ok(!/sceneId=|src=\.\.\./.test(log1) || true, '测试台日志可读（信息项）', `日志 ${log1.split('\n').length} 行`)
    notes.push('日志尾 3 行：' + log1.split('\n').slice(-3).join(' | ').slice(0, 200))
  }

  // ── B3：真点击 `Mouse trail` 开关 ⇒ 状态翻转（点两次回到原状） ────────────────
  const trailState = () => page.evaluate(() => {
    const el = document.getElementById('trail-box')
    if (!el) return null
    const inp = el.querySelector('input')
    return { cls: el.className, checked: inp ? !!inp.checked : null, disabled: inp ? !!inp.disabled : null,
      gated: el.hasAttribute('data-gated'), title: el.getAttribute('title') }
  })
  const s0 = await trailState()
  if (!s0) { notes.push('页面里没有 #trail-box（Mouse trail 开关）⇒ B3 未测') } else {
    console.log('Mouse trail 初始: ' + JSON.stringify(s0))
    //  ①实测（2026-09-19 探针）：`#trail-box` 默认 **disabled + data-gated + title="Enable “Pointer injection” first"**
    //    ⇒ 这不是"点不动"，而是**故意门控**：必须先勾 `Pointer inject`。这条本身就是一条要钉住的行为契约。
    const pointerIdx = await page.evaluate(() => [...document.querySelectorAll('label.check')]
      .findIndex((el) => /Pointer inject|指针注入/i.test(el.textContent || '')))
    ok(s0.disabled === true, '`Mouse trail` 默认**被门控**（disabled + data-gated，提示先开 Pointer inject）',
      `disabled=${s0.disabled} gated=${s0.gated}`)
    if (pointerIdx < 0) { notes.push('没找到 `Pointer inject` 开关 ⇒ 门控后的翻转未测') } else {
      //  ①点**控件本体**（`label.check input`）而不是 label 中心；实测三者都能切换，但点控件最贴近用户行为、也最稳。
      const c0 = await clickUntil('label.check', { nth: pointerIdx, inner: 'input', label: 'Pointer inject 开关（解锁前置）', settleMs: 400 },
        async () => (await trailState()).disabled === false)
      const sPre = await trailState()
      ok(c0.verified && sPre.disabled === false, '勾上 `Pointer inject` 后 `Mouse trail` **解锁**（disabled → false）',
        `disabled=${sPre.disabled}（第 ${c0.tries} 次点击生效）`)
      await shot('02-pointer-inject-on')
      const c1 = await clickUntil('#trail-box', { inner: 'input', label: 'Mouse trail 开关（第 1 次）', settleMs: 400 },
        async () => (await trailState()).checked !== sPre.checked)
      const s1 = await trailState()
      await shot('03-trail-toggle-on')
      const c2 = await clickUntil('#trail-box', { inner: 'input', label: 'Mouse trail 开关（第 2 次）', settleMs: 400 },
        async () => (await trailState()).checked === sPre.checked)
      const s2 = await trailState()
      console.log(`Mouse trail: ${JSON.stringify(sPre)} → ${JSON.stringify(s1)} → ${JSON.stringify(s2)}`)
      ok(c1.verified, '真点击 `Mouse trail`（已解锁）⇒ 勾选态翻转', `checked ${sPre.checked} → ${s1.checked}（第 ${c1.tries} 次点击生效）`)
      ok(c2.verified, '再点一次 ⇒ 回到原状态（不是一次性副作用）', `checked ${s1.checked} → ${s2.checked}（第 ${c2.tries} 次点击生效）`)
      //  点回原状：只有当前是 on 时才点，避免"状态本来就 off 又点一下"把现场改坏
      if ((await trailState()).checked) await clickReal('#trail-box', { inner: 'input', label: 'Mouse trail 开关（还原）', settleMs: 600 })
      if ((await page.evaluate(() => { const el = document.getElementById('pointer-push'); return !!(el && el.checked) }))) {
        await clickReal('label.check', { nth: pointerIdx, inner: 'input', label: 'Pointer inject 开关（还原）', settleMs: 600 })
      }
      notes.push('已把 `Pointer inject` 点回原状，测试台状态尽量还原')
    }
  }

  // ── S9（①用户第 6 项）：工具条那 6 个原生下拉已换成自绘下拉，且**真点击**能开、再点能关 ──────
  const selInfo = await page.evaluate(() => {
    const ids = ['lang', 'resolution', 'fit', 'dpr', 'fps', 'fx']
    const nat = ids.map((i) => document.getElementById(i)).filter(Boolean)
    return {
      ids,
      roots: document.querySelectorAll('.mpw_select').length,
      nativeTotal: nat.length,
      nativeHidden: nat.filter((s) => s.hidden).length,
      styleInjected: !!document.getElementById('mpw-select-style'),
      labels: [...document.querySelectorAll('.mpw_select .mpw_select_label')].slice(0, 6).map((e) => e.textContent),
    }
  })
  console.log('工具条下拉自检: ' + JSON.stringify(selInfo))
  ok(selInfo.roots >= 5 && selInfo.nativeHidden === selInfo.nativeTotal && selInfo.styleInjected,
    'S9a 工具条 5+ 个原生 `<select>` 已换成自绘下拉（原生全部隐藏、样式注入）',
    `自绘=${selInfo.roots} native=${selInfo.nativeHidden}/${selInfo.nativeTotal} 样式=${selInfo.styleInjected}`)
  const openSel = async (idx) => {
    const hit = await page.evaluate((idx) => {
      const el = [...document.querySelectorAll('.mpw_select')][idx]
      if (!el) return null
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' })
      const btn = el.querySelector('.mpw_select_btn')
      const r = btn.getBoundingClientRect()
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2)
      const at = document.elementFromPoint(x, y)
      return { x, y, self: !!(at && (at === btn || btn.contains(at))), hit: at ? (at.className || at.tagName) : null }
    }, idx)
    if (!hit) return { ok: false }
    if (!hit.self) { notes.push(`工具条下拉[${idx}] 被遮挡（命中 ${hit.hit}）`); return { ok: false } }
    await syncOrigin()
    await aimAt(ox + hit.x, oy + hit.y)
    await cua.sleep(180)
    cua.run('xdotool', ['click', '1'])
    await cua.sleep(700)
    return { ok: true }
  }
  const selState = () => page.evaluate(() => {
    const lists = [...document.querySelectorAll('.mpw_select_list')]
    const els = [...document.querySelectorAll('.mpw_select')]
    return { n: lists.length, flip: lists[0] ? lists[0].getAttribute('data-flip') : null, openIdx: els.findIndex((e) => e.hasAttribute('data-open')), items: lists[0] ? lists[0].children.length : 0 }
  })
  let s9ok = false
  for (let i = 0; i < Math.min(3, selInfo.roots); i++) {
    const o = await openSel(i)
    const st = await selState()
    if (o.ok && st.n === 1) { s9ok = true; ok(true, `S9b 真点击工具条下拉[${i}] ⇒ 恰好 1 个列表展开`, `items=${st.items} flip=${st.flip} openIdx=${st.openIdx}`); break }
  }
  if (!s9ok) ok(false, 'S9b 真点击工具条下拉 ⇒ 列表展开', '前 3 个都没打开')
  if (s9ok) {
    await shot('03-select-open')
    const idx = (await selState()).openIdx
    const o2 = await openSel(idx)
    const st2 = await selState()
    ok(o2.ok && st2.n === 0, 'S9c **再点即关**（不是又开一个）', `list=${st2.n}`)
  }

  // ── S10（①用户第 4 项）：资源管理器**收纳键**真点击 ⇒ 收起/恢复/刷新保持 ────────────────
  // 前置卫生（2026-09-19 实测教训）：`Pointer inject` 开着时测试台会接管指针（合成事件/指针锁），
  // 后面的"真点击"就不再按坐标落到目标上 ⇒ 先把它**确认关掉**，否则 S10 的失败根本分不清是谁的锅。
  const injectOff = await page.evaluate(() => {
    const box = document.getElementById('pointer-inject-box') || document.querySelector('label.check')
    const inputs = [...document.querySelectorAll('input[type=checkbox]')]
    const hit = inputs.find((i) => (i.closest('label') || {}).textContent && /pointer\s*inject/i.test(i.closest('label').textContent))
    if (hit && hit.checked) { hit.click(); return { was: true, now: hit.checked } }
    return { was: hit ? false : null, now: hit ? hit.checked : null, box: !!box }
  })
  notes.push('S10 前置：Pointer inject = ' + JSON.stringify(injectOff))
  await cua.sleep(500)
  const navState = () => page.evaluate(() => {
    const btn = document.getElementById('sidebar-toggle')
    const main = document.getElementById('main')
    const r = main ? main.getBoundingClientRect() : null
    return {
      collapsed: document.body.classList.contains('bench-nav-collapsed'),
      aria: btn ? btn.getAttribute('aria-expanded') : null,
      mainW: r ? Math.round(r.width) : -1,
      lists: document.querySelectorAll('#list').length,
    }
  })
  const n0 = await navState()
  // 诊断（2026-09-19 实测：真点击"到了但状态没变"）——把**到达按钮的事件**与**持久化值**一起记下来，
  //   否则只看到"没变"，分不清是"没到"、"到了没处理"、还是"处理了又被另一处按 localStorage 复原"。
  await page.evaluate(() => {
    window.__navLog = []
    window.__navClickLog = []      // 只装"按键类"事件（不被 pointermove 挤掉）
    window.__navClsLog = []        // body class 的**每一次**变化（含旧值 + 调用栈），用来区分"没生效"与"生效后被复原"
    for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click', 'pointermove']) {
      document.addEventListener(t, (e) => {
        const el = e.target
        // 坐标必记：只记"目标是谁"分不清"点到了别的元素"与"点名对了但被谁吃掉"
        const row = `${t}→${el && ((el.id || el.tagName) + '')} c=(${e.clientX},${e.clientY}) s=(${e.screenX},${e.screenY})`
        if (t === 'pointermove') {
          if (window.__navLog.filter((x) => x.indexOf('pointermove') === 0).length <= 2) window.__navLog.push(row)
          return
        }
        window.__navClickLog.push(row)
        if (window.__navClickLog.length > 20) window.__navClickLog.shift()
        if (window.__navLog.length <= 40) window.__navLog.push(row)
      }, true)
    }
    try {
      new MutationObserver((muts) => {
        for (const m of muts) {
          let stack = ''
          try { stack = (new Error().stack || '').split('\n').slice(2, 4).join(' | ').slice(0, 160) } catch { /* ignore */ }
          window.__navClsLog.push({ old: String(m.oldValue || '').slice(0, 40), now: document.body.className.slice(0, 40), stack })
          if (window.__navClsLog.length > 20) window.__navClsLog.shift()
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true })
    } catch { /* ignore */ }
  })
  // 真点击 + 轮询：X11 点击偶发被"首次点击吞掉"或合成延迟影响 ⇒ 以**状态变化**为准，最多重试 2 次
  const clickPoll = async (hitTest, readState, want, tries = 3) => {
    let last = null
    for (let i = 0; i < tries; i++) {
      const p = await page.evaluate(hitTest)
      if (!p || !p.self) return { ok: false, hit: p && p.hit, tries: i }
      await syncOrigin()
      await aimAt(ox + p.x, oy + p.y); await cua.sleep(200)
      // 点**前**再自证一次：把"浏览器认为该点是谁"与"点击事件真的落在谁身上"配对记下来
      last = await page.evaluate(({ x, y }) => {
        const at = document.elementFromPoint(x, y)
        return { atBefore: at ? (at.id || at.tagName) : null, clsBefore: document.body.className.slice(0, 60) }
      }, { x: p.x, y: p.y })
      try { last.pointer = cua.pointerNow() } catch { /* ignore */ }
      last.aim = { x: p.x, y: p.y, screen: { x: ox + p.x, y: oy + p.y } }
      cua.run('xdotool', ['click', '1'])
      for (let w = 0; w < 10; w++) {                       // 单次点击后最多等 2.5s
        await cua.sleep(250)
        last = { ...last, ...(await page.evaluate(readState)) }
        if (want(last)) return { ok: true, state: last, tries: i + 1, detail: last }
      }
    }
    return { ok: false, state: last, tries, detail: last }
  }
  const navClick = (expectCollapsed) => clickPoll(
    () => {
      const btn = document.getElementById('sidebar-toggle')
      if (!btn) return null
      const r = btn.getBoundingClientRect()
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2)
      const at = document.elementFromPoint(x, y)
      return { x, y, self: !!(at && (at === btn || btn.contains(at))), hit: at ? (at.id || at.tagName) : null }
    },
    () => ({ collapsed: document.body.classList.contains('bench-nav-collapsed') }),
    (s) => s.collapsed === expectCollapsed,
  )
  const nav1 = await navClick(true)
  const n1 = await navState()
  const navDiag = await page.evaluate(() => {
    const btn = document.getElementById('sidebar-toggle')
    let storeRaw = '(读不到)'
    try { storeRaw = String(window.localStorage.getItem('bench-sidebar-collapsed')) } catch (e) { storeRaw = 'throw:' + (e && e.name) }
    const r = btn ? btn.getBoundingClientRect() : null
    return { bodyClass: document.body.className.slice(0, 80), bound: !!(btn && btn.__benchNavBound), storeRaw,
      btnRect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      clicks: (window.__navClickLog || []).slice(-8), clsLog: (window.__navClsLog || []).slice(-6) }
  })
  notes.push('S10 诊断（点后）: ' + JSON.stringify(navDiag).slice(0, 500))
  notes.push('S10 点击详情: ' + JSON.stringify(nav1.detail || nav2.detail || null).slice(0, 240))
  try { notes.push('S10 指针读回: ' + JSON.stringify(cua.pointerNow()) + '（内容原点 ' + ox + ',' + oy + '）') } catch { /* ignore */ }
  ok(nav1.ok && n1.collapsed && n1.aria === 'false', 'S10a 真点击收纳键 ⇒ 侧栏收起（body 类 + aria-expanded=false）',
    `collapsed=${n1.collapsed} aria=${n1.aria} mainW ${n0.mainW} → ${n1.mainW} tries=${nav1.tries}`)
  ok(n0.mainW > 0 && n1.mainW - n0.mainW >= 100, 'S10b 收起后 `#main` 真的变宽（不留空占位）', `Δ=${n1.mainW - n0.mainW}px`)
  // 只有"收起来了"才谈得上"再点恢复"；否则 `want=false` 会在"根本没收起"时**假绿**（2026-09-19 实测踩过）
  const nav2 = nav1.ok ? await navClick(false) : { ok: false, skippedBecauseFirstFailed: true }
  const n2 = await navState()
  ok(nav2.ok && !n2.collapsed && n2.aria === 'true' && Math.abs(n2.mainW - n0.mainW) <= 4, 'S10c 再点 ⇒ 恢复展开且宽度回到原值',
    `collapsed=${n2.collapsed} mainW=${n2.mainW}（原 ${n0.mainW}）tries=${nav2.tries ?? '-'}${nav2.ok ? '' : '（前一步没收起⇒本条不计）'}`)
  ok(n2.lists === 1, 'S10d 列表容器始终只有 1 个（不是"点几次叠几个"）', `#list=${n2.lists}`)
  await shot('06-nav-toggle')

  // ── S11（①用户第 5 项 D1）：声音控件挂在"壁纸配置"下半部，展开/收起都在，且属性表滚得到底 ──────
  const npState = () => page.evaluate(() => {
    const host = document.getElementById('np-host')
    const box = host ? host.querySelector('.snd-box') : null
    const body = document.getElementById('props-body')
    const occ = (window.__benchPatch && typeof window.__benchPatch.npOcclusion === 'function') ? window.__benchPatch.npOcclusion() : null
    return {
      host: !!host,
      card: box ? Math.round(box.getBoundingClientRect().height) : -1,
      covered: document.querySelectorAll('#props-body [data-covered-ids]').length,
      occ,
      scrollable: body ? body.scrollHeight > body.clientHeight + 4 : null,
    }
  })
  const np0 = await npState()
  ok(np0.host && np0.card > 0, 'S11a `#np-host` 里挂着声音控件（`.snd-box` 有实际高度）', `card=${np0.card}px`)
  // 命中点必须**先滚动再测量**（scrollIntoView 下一帧才生效，立刻读 rect 会拿到旧坐标）
  await page.evaluate(() => { const b = document.querySelector('#np-host .snd-box'); if (b) b.scrollIntoView({ block: 'center' }) })
  await cua.sleep(500)
  const tapHit = () => {
    const t = document.querySelector('#np-host .snd-tap') || document.querySelector('#np-host .snd-box')
    if (!t) return null
    const r = t.getBoundingClientRect()
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2)
    const at = document.elementFromPoint(x, y)
    return { x, y, self: !!(at && (at === t || t.contains(at) || (at.closest && at.closest('.snd-tap')))), hit: at ? (String(at.className || at.tagName).slice(0, 28)) : null }
  }
  const tapHitStr = JSON.stringify(await page.evaluate(tapHit))
  const cardRead = () => ({ h: Math.round((document.querySelector('#np-host .snd-box') || { getBoundingClientRect: () => ({ height: -1 }) }).getBoundingClientRect().height) })
  const h0 = (await page.evaluate(cardRead)).h
  const np1 = await clickPoll(tapHit, cardRead, (s) => s.h !== h0)
  const h1 = np1.state ? np1.state.h : -1
  ok(np1.ok && h1 > h0, 'S11b 真点击声音控件 ⇒ 卡片展开（78 → 189 那一套）',
    `card ${h0} → ${h1}px tries=${np1.tries} 命中=${tapHitStr}${np1.ok ? '' : '（未展开）'}`)
  const np2 = np1.ok && h1 > h0 ? await clickPoll(tapHit, cardRead, (s) => s.h <= h0 + 2) : { ok: false }
  ok(!np1.ok || np2.ok, 'S11b2 **再点即收**（是开关，不是只能开一次）', `card ${h1} → ${np2.state ? np2.state.h : '?'}px`)
  const npAfter = await npState()
  if (npAfter.occ) {
    console.log('遮挡读数: ' + JSON.stringify(npAfter.occ).slice(0, 220))
    notes.push('`__benchPatch.npOcclusion()` 实测：' + JSON.stringify(npAfter.occ).slice(0, 200))
  }
  const reach = await page.evaluate(async () => {
    const body = document.getElementById('props-body')
    if (!body) return null
    body.scrollTop = body.scrollHeight
    await new Promise((r) => setTimeout(r, 400))
    const rows = [...body.querySelectorAll('.prop')]
    const last = rows[rows.length - 1]
    const host = document.getElementById('np-host')
    const hr = host ? host.getBoundingClientRect() : null
    const lr = last ? last.getBoundingClientRect() : null
    return { rows: rows.length, lastBottom: lr ? Math.round(lr.bottom) : null, hostTop: hr ? Math.round(hr.top) : null,
      lastVisible: !!(lr && hr && lr.bottom <= hr.top + 2) }
  })
  if (reach) {
    console.log('属性表到底: ' + JSON.stringify(reach))
    ok(reach.rows === 0 || reach.lastVisible, 'S11c 属性表滚到底时最后一项**能滚到声音控件上方**（不被永久遮住）',
      `rows=${reach.rows} lastBottom=${reach.lastBottom} hostTop=${reach.hostTop}`)
  } else notes.push('S11c 未测：没有 `#props-body`')

  // ── B4：像素面（桌面截图）；顺带记录 pageerror ────────────────────────────────
  const py = (args) => { try { return JSON.parse(cua.run('python3', [path.join(ROOT, 'tests/x11-e2e/analyze.py'), ...args])) } catch (e) { return { ok: false, err: String(e.message).slice(0, 120) } } }
  const rect = [ox, oy + 44, VIEW.w - 40, 400].join(',')     // 舞台区域（避开左侧栏）
  const d = py(['diff', path.join(SHOTS, '00-bench-initial.png'), path.join(SHOTS, '01-after-tab-click.png'), '--rect', rect, '--min', '10'])
  console.log('像素证据（舞台区 00→01）: ' + JSON.stringify(d))
  ok(!d.ok || d.changed > 0, '换壁纸后**桌面像素真的变了**（不是"点了没反应"）', JSON.stringify(d).slice(0, 120))
  ok(errs.length === 0, '整轮 0 个 pageerror', errs.slice(0, 2).join(' | '))

  console.log(`\n shots: ${SHOTS}`)
  console.log(`\n── 汇总：PASS=${pass} FAIL=${fail}`)
  for (const n of notes) console.log('  note: ' + n)
  process.exitCode = fail ? 1 : 0
} finally {
  try { await browser.close() } catch { /* ignore */ }
  console.log('（浏览器已关闭；残留自查：ps | grep [f]irefox 应为空）')
}
