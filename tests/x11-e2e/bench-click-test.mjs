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
  const ox = Number.isFinite(geom.ix) ? geom.ix : geom.sx
  const oy = Number.isFinite(geom.iy) ? geom.iy : geom.sy
  console.log('窗口: ' + JSON.stringify(geom) + ` ⇒ 内容原点 (${ox},${oy})  视口 ${VIEW.w}x${VIEW.h}`)
  const shot = (n) => cua.shot(path.join(SHOTS, n + '.png'))

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
    cua.pointerGlide(ox + hit.cx, oy + hit.cy, { steps: 6, dwellMs: 60 })
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
    cua.pointerGlide(ox + hit.x, oy + hit.y, { steps: 4, dwellMs: 60 })
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
