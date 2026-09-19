// bench-ui-headless-test.mjs —— 测试台 UI（:8902）的**无 X11**浏览器门禁：收纳键 / 声音控件 / 自绘下拉 / 遮挡几何
//
// 为什么单独一条（与 tests/x11-e2e/bench-click-test.mjs 的关系）：
//   · `bench-click-test` 是**真 X11 指针**门禁（xdotool 发真事件 + elementFromPoint 命中自证），
//     它证明的是"用户拿鼠标点得到"，但需要 X 显示、跑一轮 5–8 分钟，且宿主机重启后 X 会消失（2026-09-19 实测）。
//   · 这一条只做**同一批 UI 的功能判定**（用 Playwright 自己的派发），headless 也能跑、几十秒出结果，
//     因此可以常驻门禁；它**不能**替代真指针门禁（遮挡/坐标换算只有真 X 事件才测得出来）。
//
// 判据（任一不满足 → 退出码 1；无 :8902 / 无 Playwright / 无 Firefox ⇒ 自我 SKIP 退出码 0）：
//   N1 资源管理器收纳键：点一次 ⇒ `body.bench-nav-collapsed` + `aria-expanded=false` + `#main` 真变宽 ≥100px；
//      再点一次 ⇒ 复原（宽度回原值 ±4px）；**刷新后保持收起**（localStorage 那条路）；#list 始终只有 1 个
//   N2 声音控件：`.snd-box` 收起 78px 量级 ⇒ 点 `.snd-tap` ⇒ 展开（高度变大）⇒ 再点 ⇒ 收回（±3px）
//   N3 遮挡几何（`__benchPatch.npOcclusion()`）：两个状态下 `unreachableCount === 0`、`scrollKnown === true`，
//      且展开态 `cover` ≥ 收起态（展开只会更挡）
//   N4 属性表滚到底：最后一项能滚到声音控件**上方**（不被永久遮住）
//   N5 自绘下拉：工具条里的 `.mpw_select` 点开 ⇒ **恰好 1 个**列表 + `data-flip` 有值 ⇒ 再点 ⇒ 关；
//      且工具条第二行的下拉**没有被属性面板盖住**（`elementFromPoint` 命中它自己 —— P-143 的 z-index 修复）
//   N6 整轮 0 个 pageerror（真机脚本错要能看见）
//
// 用法: node tests/bench-ui-headless-test.mjs [--url http://127.0.0.1:8902/] [--w 1360] [--h 900] [--keep-going]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, WS } from './_root.mjs'

const argv = process.argv.slice(2)
const argOf = (n, d) => { const i = argv.indexOf(n); if (i >= 0 && argv[i + 1]) return argv[i + 1]; const eq = argv.find((a) => a.startsWith(n + '=')); return eq ? eq.slice(n.length + 1) : d }
const URL_BASE = argOf('--url', process.env.MPW_BENCH_URL || 'http://127.0.0.1:8902/')
const VIEW = { w: Number(argOf('--w', 1360)), h: Number(argOf('--h', 900)) }

let pass = 0; let fail = 0; const notes = []
const ok = (c, label, extra = '') => { if (c) { pass++; console.log('PASS ' + label + (extra ? '  ' + extra : '')) } else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')) } }
const skip = (why) => { console.log('SKIP bench-ui-headless — ' + why); process.exit(0) }

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

const browser = await firefox.launch({ headless: true, env: { ...process.env, MOZ_WEBGL_FORCE_SOFTWARE: '1', LIBGL_ALWAYS_SOFTWARE: '1' },
  firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true, 'webgl.out-of-process': false } })
try {
  const ctx = await browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h } })
  const page = await ctx.newPage()
  //  顶层文档自己的脚本错（精确归属）：子帧（渲染器页 / web 壁纸作者页）的错不该算到本页补丁头上，
  //  Playwright 的 `pageerror` 会把它们混在一起、且 blob/沙箱文档常常**没有 stack** 可供判别。
  await page.addInitScript(() => {
    window.__topErrs = []
    window.addEventListener('error', (e) => { try { window.__topErrs.push(String((e && (e.message || (e.error && e.error.message))) || e)) } catch { /* ignore */ } })
    window.addEventListener('unhandledrejection', (e) => { try { window.__topErrs.push(String((e && e.reason && (e.reason.message || e.reason)) || e)) } catch { /* ignore */ } })
  })
  const errs = []          // 顶层文档的脚本错（门禁判定：必须 0）
  const frameErrs = []     // 子帧（渲染器页 / web 壁纸作者页）的脚本错：进 notes（不属于本页补丁的责任面）
  page.on('pageerror', (e) => {
    const msg = String(e.message).slice(0, 160)
    const st = String(e.stack || '')
    //  渲染器产物 / blob 壁纸文档 / /web/dev/ 下的作者脚本都算"子帧"
    const fromFrame = /assets\/renderer-|WEwebLoader\/renderer|blob:http|\/web\/dev\//.test(st)
    ;(fromFrame ? frameErrs : errs).push(msg + (fromFrame ? ' @' + (st.match(/(?:blob:|https?:)[^\s)]+/) || [''])[0].slice(0, 90) : ''))
  })
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => !!document.getElementById('frame'), null, { timeout: 60000 })
  await page.waitForTimeout(3500)          // 等库列表 / 首个壁纸 / patch 初始化

  // ── N1 收纳键 ────────────────────────────────────────────────────────────────
  const nav = () => page.evaluate(() => {
    const btn = document.getElementById('sidebar-toggle')
    const main = document.getElementById('main')
    const r = main ? main.getBoundingClientRect() : null
    let store = null
    try { store = window.localStorage.getItem('bench-sidebar-collapsed') } catch { store = 'throw' }
    return { collapsed: document.body.classList.contains('bench-nav-collapsed'),
      aria: btn ? btn.getAttribute('aria-expanded') : null,
      btn: btn ? (btn.getBoundingClientRect().width > 0) : false,
      mainW: r ? Math.round(r.width) : -1, lists: document.querySelectorAll('#list').length, store }
  })
  const n0 = await nav()
  ok(n0.btn, 'N1a `#sidebar-toggle` 在页面上可见', `mainW=${n0.mainW} lists=${n0.lists}`)
  await page.click('#sidebar-toggle'); await page.waitForTimeout(600)
  const n1 = await nav()
  ok(n1.collapsed && n1.aria === 'false', 'N1b 点一次 ⇒ 收起（body 类 + aria-expanded=false）', `collapsed=${n1.collapsed} aria=${n1.aria} store=${n1.store}`)
  ok(n0.mainW > 0 && n1.mainW - n0.mainW >= 100, 'N1c 收起后 `#main` 真变宽（不留空占位）', `Δ=${n1.mainW - n0.mainW}px`)
  await page.click('#sidebar-toggle'); await page.waitForTimeout(600)
  const n2 = await nav()
  ok(!n2.collapsed && n2.aria === 'true' && Math.abs(n2.mainW - n0.mainW) <= 4, 'N1d 再点 ⇒ 复原（宽度回原值）',
    `collapsed=${n2.collapsed} mainW=${n2.mainW}（原 ${n0.mainW}）`)
  ok(n2.lists === 1, 'N1e 列表容器始终只有 1 个（不是点几次叠几个）', `#list=${n2.lists}`)
  // 刷新保持：先收起，再 reload，类必须还在（首帧同步脚本 + localStorage）
  await page.click('#sidebar-toggle'); await page.waitForTimeout(600)
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!document.getElementById('frame'), null, { timeout: 60000 })
  await page.waitForTimeout(2500)
  const n3 = await nav()
  ok(n3.collapsed, 'N1f 收起状态**刷新后保持**（localStorage 那条路真的通）', `collapsed=${n3.collapsed} store=${n3.store}`)
  await page.click('#sidebar-toggle'); await page.waitForTimeout(600)   // 还原成展开

  // ── N2/N3 声音控件 + 遮挡几何 ────────────────────────────────────────────────
  const np = () => page.evaluate(() => {
    const box = document.querySelector('#np-host .snd-box')
    const occ = (window.__benchPatch && typeof window.__benchPatch.npOcclusion === 'function') ? window.__benchPatch.npOcclusion() : null
    return { host: !!document.getElementById('np-host'), card: box ? Math.round(box.getBoundingClientRect().height) : -1, occ }
  })
  const p0 = await np()
  ok(p0.host && p0.card > 0, 'N2a `#np-host` 里挂着声音控件（`.snd-box` 有实际高度）', `card=${p0.card}px`)
  await page.click('#np-host .snd-tap'); await page.waitForTimeout(700)
  const p1 = await np()
  ok(p1.card > p0.card, 'N2b 点声音控件 ⇒ 卡片展开', `card ${p0.card} → ${p1.card}px`)
  await page.click('#np-host .snd-tap'); await page.waitForTimeout(700)
  const p2 = await np()
  ok(Math.abs(p2.card - p0.card) <= 3, 'N2c 再点 ⇒ 收回（是开关，不是只能开一次）', `card ${p1.card} → ${p2.card}px`)
  if (p0.occ && p1.occ) {
    console.log('遮挡读数（收起）: ' + JSON.stringify(p0.occ).slice(0, 200))
    console.log('遮挡读数（展开）: ' + JSON.stringify(p1.occ).slice(0, 200))
    notes.push('npOcclusion 收起=' + JSON.stringify(p0.occ).slice(0, 160))
    notes.push('npOcclusion 展开=' + JSON.stringify(p1.occ).slice(0, 160))
    ok(p0.occ.scrollKnown === true && p1.occ.scrollKnown === true, 'N3a 两态都量到了滚动口径（`scrollKnown=true`，不猜）',
      `收起=${p0.occ.scrollKnown} 展开=${p1.occ.scrollKnown}`)
    ok(p0.occ.unreachableCount === 0 && p1.occ.unreachableCount === 0, 'N3b 两态都**没有够不着的属性项**（`unreachableCount=0`）',
      `收起=${p0.occ.unreachableCount} 展开=${p1.occ.unreachableCount}`)
    ok(p1.occ.cover >= p0.occ.cover, 'N3c 展开态遮挡高度 ≥ 收起态（展开只会更挡）', `cover ${p0.occ.cover} → ${p1.occ.cover}`)
  } else notes.push('N3 未测：`__benchPatch.npOcclusion()` 不可用')

  // ── N4 属性表滚到底 ─────────────────────────────────────────────────────────
  const reach = await page.evaluate(async () => {
    const body = document.getElementById('props-body')
    if (!body) return null
    body.scrollTop = body.scrollHeight
    await new Promise((r) => setTimeout(r, 500))
    const rows = [...body.querySelectorAll('.prop')]
    const last = rows[rows.length - 1]
    const host = document.getElementById('np-host')
    const hr = host ? host.getBoundingClientRect() : null
    const lr = last ? last.getBoundingClientRect() : null
    return { rows: rows.length, lastBottom: lr ? Math.round(lr.bottom) : null, hostTop: hr ? Math.round(hr.top) : null,
      lastVisible: !!(lr && hr && lr.bottom <= hr.top + 2) }
  })
  if (reach) {
    // `rows === 0` 只说明"这一档没选中壁纸 ⇒ 属性表是空的"，**不是**通过（不能拿空表当绿）
    if (reach.rows > 0) ok(reach.lastVisible, 'N4 属性表滚到底时最后一项**能滚到声音控件上方**（不被永久遮住）',
      `rows=${reach.rows} lastBottom=${reach.lastBottom} hostTop=${reach.hostTop}`)
    else notes.push('N4 未测：属性表是空的（这一档没选中带 properties 的壁纸）⇒ 不当作通过')
  } else notes.push('N4 未测：没有 `#props-body`')

  // ── N5 自绘下拉（工具条）+ 没被属性面板盖住 ──────────────────────────────────
  //  ①(P-158) 口径变了：工具条那 6 个下拉现在**全部**由 `bindDropdown` 的 `.bench-rd` 独占
  //  （`demo/bench-patch.js: BENCH_BAR_SELECT_IDS`），mpw 控件只留给 `#props-body` 里的 combo。
  //  所以这里两种控件都试：工具条优先 `.bench-rd`（打开后列表是 `.bench-rd-list`），
  //  再退到 mpw（`.mpw_select` / `.mpw_select_list`）。判据本身不变：**恰好 1 个列表**、再点即关。
  const kinds = [
    { scope: '#toolbar .bench-rd', open: '.bench-rd.open', list: '.bench-rd-list', btn: '.bench-rd-btn', flipAttr: 'data-placement' },
    { scope: '#toolbar .mpw_select', open: '.mpw_select[data-open]', list: '.mpw_select_list', btn: '.mpw_select_btn', flipAttr: 'data-flip' },
    { scope: '.mpw_select', open: '.mpw_select[data-open]', list: '.mpw_select_list', btn: '.mpw_select_btn', flipAttr: 'data-flip' },
  ]
  const selInfo = await page.evaluate((ks) => {
    for (const k of ks) { const n = document.querySelectorAll(k.scope).length; if (n > 0) return { kind: k, n } }
    return { kind: null, n: 0 }
  }, kinds)
  if (selInfo.kind) {
    const K = selInfo.kind
    let opened = false
    for (let i = 0; i < Math.min(3, selInfo.n); i++) {
      const hit = await page.evaluate(({ scope, idx, btnSel }) => {
        const els = [...document.querySelectorAll(scope)]
        const el = els[idx]; if (!el) return null
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const btn = el.querySelector(btnSel); if (!btn) return null
        const r = btn.getBoundingClientRect()
        const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2)
        const at = document.elementFromPoint(x, y)
        return { x, y, self: !!(at && (at === btn || btn.contains(at))), hit: at ? (at.id || at.tagName) : null }
      }, { scope: K.scope, idx: i, btnSel: K.btn })
      if (!hit || !hit.self) { notes.push(`工具条下拉[${i}]（${K.scope}）被遮挡（命中 ${hit && hit.hit}）`); continue }
      await page.mouse.click(hit.x, hit.y); await page.waitForTimeout(500)
      //  ①(P-158) 计数口径：`.bench-rd-list` 是**常驻**节点（`bindDropdown` 给每个 select 都建了一个），
      //  所以"恰好 1 个列表"要看**可见/展开**的那一个（`.bench-rd.open .bench-rd-list` 的 display=block），
      //  而不是 `querySelectorAll('.bench-rd-list').length`（那恒等于 select 数 ⇒ 假红）。
      const st = await page.evaluate(({ openSel, listSel, flipAttr }) => {
        const openEls = [...document.querySelectorAll(openSel)]
        const shown = [...document.querySelectorAll(listSel)].filter((l) => getComputedStyle(l).display !== 'none')
        return { open: openEls.length, shown: shown.length, flip: shown[0] ? shown[0].getAttribute(flipAttr) : (openEls[0] ? openEls[0].querySelector(listSel) && openEls[0].querySelector(listSel).getAttribute(flipAttr) : null) }
      }, { openSel: K.open, listSel: K.list, flipAttr: K.flipAttr })
      if (st.open === 1 && st.shown === 1) {
        opened = true
        ok(!!st.flip, `N5a 工具条下拉[${i}] 点开 ⇒ **恰好 1 个展开的**列表且带贴合方向标记（\`${K.flipAttr}\`）`, `scope=${K.scope} ${K.flipAttr}=${st.flip}`)
        await page.mouse.click(hit.x, hit.y); await page.waitForTimeout(500)
        const st2 = await page.evaluate(({ openSel, listSel }) => ({ open: document.querySelectorAll(openSel).length, shown: [...document.querySelectorAll(listSel)].filter((l) => getComputedStyle(l).display !== 'none').length }), { openSel: K.open, listSel: K.list })
        ok(st2.open === 0 && st2.shown === 0, 'N5b **再点即关**（不是又开一个）', `open=${st2.open} shown=${st2.shown}`)
        break
      }
    }
    if (!opened) ok(false, 'N5a 工具条下拉点开 ⇒ 列表展开', `scope=${K.scope} 前 3 个都没打开（见 notes 的遮挡/命中信息）`)
  } else notes.push('N5 未测：工具条里既没有 `.bench-rd` 也没有 `.mpw_select`（自绘下拉没挂上）')

  // ══════════════════ S 组（P-158/P-159 本批 11 条 + 类型/指针）══════════════════
  //  每条都是**几何/交互判据**，与回报里的判据一一对应；纯函数部分在 tests/bench-shell-fixes-test.mjs。

  // S1 ①④ 宽屏工具条：`#main` 的内层列不再被内容撑爆 ⇒ 每个控件都在视口内
  {
    const s = await page.evaluate(() => {
      const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width) } }
      const tb = document.getElementById('toolbar')
      const main = document.getElementById('main')
      const kids = [...tb.children]
      return {
        toolbar: R(tb), main: R(main), n: kids.length,
        out: kids.filter((k) => { const r = k.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5 }).length,
        wide: !document.documentElement.classList.contains('bench-narrow'),
      }
    })
    ok(s.toolbar.w <= s.main.w + 1, 'S1a ①④工具条宽度 = `#main` 宽度（内层列 `minmax(0,1fr)`；改前实测 2279 > 740）', `toolbar=${s.toolbar.w} main=${s.main.w} wide=${s.wide}`)
    ok(s.out === 0, 'S1b ①④工具条里**没有**超出视口的控件（用户第 1/4 条：后面的选项被顶出屏幕）', `${s.n} 个控件，溢出 ${s.out} 个`)
  }

  // S2 ② 下拉与触发框贴合（下开 ≤2px；再把工具条临时挪到底部量一次**上翻**）
  {
    const gap = await page.evaluate(async () => {
      const btn = document.getElementById('bench-rd-btn')
      const list = document.getElementById('bench-rd-list')
      btn.click(); await new Promise((r) => setTimeout(r, 350))
      const b = btn.getBoundingClientRect(); const l = list.getBoundingClientRect()
      const below = l.top >= b.top
      const g = below ? l.top - b.bottom : b.top - l.bottom
      btn.click(); await new Promise((r) => setTimeout(r, 200))
      return { gap: Math.round(g * 10) / 10, below, placement: list.getAttribute('data-placement') }
    })
    ok(gap.gap <= 2 && gap.gap >= 0 && gap.placement === 'below', 'S2a ②分辨率下拉（下开）：列表上边缘距触发框下边缘 ≤2px', JSON.stringify(gap))
    const up = await page.evaluate(async () => {
      const tb = document.getElementById('toolbar')
      const old = tb.getAttribute('style')
      tb.setAttribute('style', 'position:fixed;left:8px;bottom:8px;right:8px;z-index:50')
      await new Promise((r) => setTimeout(r, 250))
      const btn = document.getElementById('bench-rd-btn')
      const list = document.getElementById('bench-rd-list')
      btn.click(); await new Promise((r) => setTimeout(r, 350))
      const b = btn.getBoundingClientRect(); const l = list.getBoundingClientRect()
      const g = b.top - l.bottom
      const placement = list.getAttribute('data-placement')
      btn.click()
      if (old) tb.setAttribute('style', old); else tb.removeAttribute('style')
      await new Promise((r) => setTimeout(r, 250))
      return { gap: Math.round(g * 10) / 10, placement, listBottom: Math.round(l.bottom), btnTop: Math.round(b.top) }
    })
    ok(up.placement === 'above' && up.gap <= 2 && up.gap >= 0,
      'S2b ②触发框贴近裁剪盒底边 ⇒ 自动**上翻**且同样贴合（列表下边缘距触发框上边缘 ≤2px）', JSON.stringify(up))
  }

  // S3 ③ 工具条：一个 select 一个自绘控件、没有空 label
  {
    const s = await page.evaluate(() => {
      const tb = document.getElementById('toolbar')
      const sels = [...tb.querySelectorAll('select')]
      const rds = [...tb.querySelectorAll('.bench-rd')]
      const mpw = [...tb.querySelectorAll('.mpw_select')]
      return {
        selects: sels.length,
        hiddenSel: sels.filter((x) => x.hidden || getComputedStyle(x).display === 'none').length,
        nativeClass: sels.filter((x) => x.classList.contains('bench-rd-native')).length,
        rds: rds.length,
        mpw: mpw.length,
        labels: rds.map((r) => (r.querySelector('.bench-rd-btn') || {}).textContent || ''),
        expected: sels.map((x) => ((x.options[x.selectedIndex] || {}).textContent || '').trim()),
        emptyEverywhere: [...document.querySelectorAll('.mpw_select_label')].filter((l) => l.textContent === '（空）').length,
      }
    })
    ok(s.selects === 5 && s.hiddenSel === 5 && s.nativeClass === 5 && s.rds === 5 && s.mpw === 0,
      'S3a ③工具条：5 个原生 select（全部隐藏）+ **5 个 `.bench-rd`** + **0 个 `.mpw_select`**（重复增强的残留已删）',
      JSON.stringify({ selects: s.selects, hidden: s.hiddenSel, benchRdNative: s.nativeClass, rds: s.rds, mpw: s.mpw }))
    ok(s.labels.length === 5 && s.labels.every((x) => x && x.trim() && x !== '（空）') &&
      JSON.stringify(s.labels) === JSON.stringify(s.expected),
      'S3b ③每个自绘按钮都显示**真实选中项**，没有空 label / 展不开的空框', JSON.stringify(s.labels))
    ok(s.emptyEverywhere === 0, 'S3c ③全页没有「（空）」label（含属性面板的 mpw 控件；mpw 自身的 paintButton 陈旧闭包由补丁层兜底）', `count=${s.emptyEverywhere}`)
  }

  // S4 ⑤ 收起/展开"输出"：预览宽高比一致 + 完全落在可视区内 + 两个按钮两态都在
  {
    const s = await page.evaluate(async () => {
      const R = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) } }
      const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
      const hit = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); const at = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)); return !!(at && (at === el || el.contains(at))) }
      const snap = () => {
        const slot = R('#stage-slot'); const frame = R('#frame')
        const inside = !!(slot && frame && frame.x >= slot.x - 1 && frame.y >= slot.y - 1 && frame.right <= slot.right + 1 && frame.bottom <= slot.bottom + 1)
        return { slot, frame, inside, rs: frame && frame.h ? Math.round((frame.w / frame.h) * 1000) / 1000 : null, clear: vis('#clear-logs'), copy: vis('#copy-logs'), clearHit: hit('#clear-logs'), copyHit: hit('#copy-logs'), collapsed: document.getElementById('main').classList.contains('logs-collapsed') }
      }
      const before = snap()
      document.getElementById('toggle-logs').click(); await new Promise((r) => setTimeout(r, 900))
      const after = snap()
      document.getElementById('toggle-logs').click(); await new Promise((r) => setTimeout(r, 900))
      return { before, after }
    })
    ok(s.before.inside && s.after.inside,
      'S4a ⑤⑧预览内容完整落在可视区内（`#frame` rect ⊆ `#stage-slot` rect，收起前后都要）',
      JSON.stringify({ before: s.before.frame, after: s.after.frame, slotBefore: s.before.slot, slotAfter: s.after.slot }))
    const d = s.before.rs && s.after.rs ? Math.abs(s.before.rs - s.after.rs) / s.before.rs : 1
    ok(s.before.rs !== null && s.after.rs !== null && d <= 0.01 && Math.abs(s.before.rs - 16 / 9) <= 0.02,
      'S4b ⑤收起前后预览 rect 宽高比一致（±1%）且都是 16:9', `before=${s.before.rs} after=${s.after.rs} Δ=${(d * 100).toFixed(2)}%`)
    ok(s.before.clear && s.before.copy && s.after.clear && s.after.copy,
      'S4c ⑥「清空」「复制输出」在**展开与收起两态都可见**（用户第 6 条）',
      JSON.stringify({ expanded: [s.before.clear, s.before.copy], collapsed: [s.after.clear, s.after.copy] }))
    ok((s.before.clearHit && s.before.copyHit) || (!s.before.clearHit && !s.before.copyHit),
      'S4d ⑥两个按钮的命中区 = 可视区（没有"看得到点不到"）', JSON.stringify({ clear: s.before.clearHit, copy: s.before.copyHit }))
  }

  // S5 ⑧ 固定分辨率（`.fixed-res`）也要完整可见：产物的内联缩放盒不许被 `!important` 打回
  {
    const s = await page.evaluate(async () => {
      const R = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) } }
      const sel = document.getElementById('resolution')
      sel.value = '1920x1080'; sel.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 900))
      const slot = R('#stage-slot'); const sc = R('#stage-scale')
      const inside = !!(slot && sc && sc.x >= slot.x - 1 && sc.y >= slot.y - 1 && sc.right <= slot.right + 1 && sc.bottom <= slot.bottom + 1)
      const out = { ws: document.getElementById('workspace').className, inside, rs: sc && sc.h ? Math.round((sc.w / sc.h) * 1000) / 1000 : null, inline: document.getElementById('stage-scale').getAttribute('style'), badge: (document.getElementById('stage-badge') || {}).textContent }
      sel.value = 'fit'; sel.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 700))
      return out
    })
    ok(/fixed-res/.test(s.ws) && s.inside && Math.abs(s.rs - 16 / 9) <= 0.02,
      'S5 ⑧选了具体分辨率（1920×1080）⇒ 缩放盒仍完整落在可视区内且 16:9（产物的内联尺寸没被覆盖）',
      JSON.stringify({ ws: s.ws, inside: s.inside, rs: s.rs, badge: s.badge, inline: s.inline }))
  }

  // S6 ⑦ 渲染器诊断页签：订阅 `/api/diag-stream` 并显示**渲染器**消息（不是只显示补丁日志）
  {
    const s = await page.evaluate(async () => {
      const tab = document.getElementById('tab-diag')
      const r = tab.getBoundingClientRect()
      const at = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2))
      tab.click()
      await new Promise((res) => setTimeout(res, 2500))
      const before = document.querySelectorAll('#diag-body .diag-line').length
      const li = document.querySelector('#list li[data-id]')
      if (li) li.click()
      await new Promise((res) => setTimeout(res, 6000))
      const lines = [...document.querySelectorAll('#diag-body .diag-line')]
      return {
        tabHit: !!(at && (at === tab || tab.contains(at))),
        selected: tab.getAttribute('aria-selected'),
        view: document.getElementById('logs').dataset.view,
        before, after: lines.length,
        renderer: lines.filter((l) => l.dataset.source === 'renderer').length,
        errors: lines.filter((l) => l.dataset.level === 'error').length,
        state: document.getElementById('diag-body').dataset.state,
        sample: lines.slice(-1).map((l) => l.textContent.slice(0, 80)),
        logbodyHidden: getComputedStyle(document.getElementById('logbody')).display === 'none',
      }
    })
    ok(s.tabHit && s.selected === 'true' && s.view === 'diag',
      'S6a ⑦「渲染器诊断（/diag）」是可点的真页签（命中区 = 自己）⇒ `#logs[data-view="diag"]`', JSON.stringify({ hit: s.tabHit, view: s.view }))
    ok(s.renderer > 0 && s.after > s.before && s.logbodyHidden,
      'S6b ⑦诊断视图里是**渲染器诊断流**（挂载一次后条数增长，且 source=renderer），输出视图同时隐藏',
      JSON.stringify({ before: s.before, after: s.after, renderer: s.renderer, errors: s.errors, sample: s.sample }))
    await page.evaluate(async () => { document.getElementById('tab-logs').click(); await new Promise((r) => setTimeout(r, 200)) })
  }

  // S7 ⑨ 切换栏：已选/常用（位置固定、可点）+ 库列表**显式展开**
  {
    const s = await page.evaluate(async () => {
      const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
      const hit = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const at = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)); return { self: !!(at && (at === el || el.contains(at))), got: at ? (at.id || at.className || at.tagName) : null } }
      const add = document.getElementById('wp-add')
      const out = {
        tabsBefore: document.querySelectorAll('#editor-tabs .wp-tab').length,
        addParent: add.parentElement.id, addExpanded: add.getAttribute('aria-expanded'),
        addInBar: (() => { const b = R(document.getElementById('wp-switch')); const a = R(add); return !!(a && b && a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1) })(),
        addHit: hit(add),
      }
      add.click(); await new Promise((r) => setTimeout(r, 400))
      const rows = [...document.querySelectorAll('#wp-panel-list .wp-row')]
      out.panelOpen = !document.getElementById('wp-panel').hasAttribute('hidden')
      out.rows = rows.length
      out.types = rows.reduce((a, r) => { const k = (r.querySelector('.wp-kind') || {}).textContent; a[k] = (a[k] || 0) + 1; return a }, {})
      out.rowHit = rows[0] ? hit(rows[0].querySelector('.wp-row-go')) : null
      out.pinHit = rows[0] ? hit(rows[0].querySelector('.wp-pin')) : null
      out.panelInBar = (() => { const b = R(document.getElementById('wp-switch')); const p = R(document.getElementById('wp-panel')); return !!(p && b && p.x >= b.x - 1 && p.x + p.w <= b.x + b.w + 1) })()
      return out
    })
    ok(s.addInBar && s.addHit && s.addHit.self && s.addParent === 'wp-switch',
      'S7a ⑨＋ 固定在切换栏内（不是浮在别处），且命中区 = 视觉区（`elementFromPoint` 命中它自己）',
      JSON.stringify({ parent: s.addParent, inBar: s.addInBar, hit: s.addHit }))
    ok(s.panelOpen && s.rows >= 1 && s.types && (s.types.scene || 0) >= 1,
      'S7b ⑨点 ＋ 才**显式展开**库列表（默认收起）；列表行带真实类型标签', JSON.stringify({ rows: s.rows, types: s.types }))
    ok(s.rowHit && s.rowHit.self && s.pinHit && s.pinHit.self,
      'S7c ⑨每行的"切换"与"★ 固定"两个命中区都等于视觉区（没有"看得到点不到"）', JSON.stringify({ row: s.rowHit, pin: s.pinHit }))
  }

  // S7d ⑨ 从库列表挂一张壁纸 ⇒ 该壁纸进"已选"（tab 条把它固定住），面板自动收起
  {
    const s = await page.evaluate(async () => {
      const rows = [...document.querySelectorAll('#wp-panel-list .wp-row')]
      const target = rows.find((r) => (r.querySelector('.wp-kind') || {}).textContent === 'video') || rows[rows.length - 1]
      const id = target.dataset.id
      target.querySelector('.wp-pin').click()          // ★ 固定
      await new Promise((r) => setTimeout(r, 400))
      const pinnedTabs = [...document.querySelectorAll('#editor-tabs .wp-tab')].map((b) => b.dataset.id + ':' + b.dataset.kind)
      const stored = (() => { try { return JSON.parse(localStorage.getItem('bench-pinned-wallpapers') || '[]') } catch { return null } })()
      // 切换一次：面板里的行点击 ⇒ 挂载 + 面板收起
      target.querySelector('.wp-row-go').click()
      await new Promise((r) => setTimeout(r, 5500))
      const frame = document.getElementById('frame')
      return { id, pinnedTabs, stored, panelHidden: document.getElementById('wp-panel').hasAttribute('hidden'), src: frame.getAttribute('src') || '', current: (document.getElementById('current') || {}).textContent, wp: (() => { try { return !!frame.contentWindow.__wp } catch { return false } })() }
    })
    ok(s.stored && s.stored.includes(s.id) && s.pinnedTabs.some((x) => x.startsWith(s.id + ':')),
      'S7d ⑨★ 固定生效：已选集合持久化（`bench-pinned-wallpapers`）且 tab 条里出现该项（带真实类型）', JSON.stringify({ stored: s.stored, tabs: s.pinnedTabs }))
    ok(s.panelHidden && /type=video|type=web|type=scene/.test(s.src) && s.wp,
      'S7e ⑨从库列表点一行 ⇒ 真的挂载（iframe 起来了）+ 面板自动收起', JSON.stringify({ hidden: s.panelHidden, src: s.src.slice(0, 120), wp: s.wp }))
  }

  // S8 类型过滤（用户补充要求：不是只能看到 scene）
  {
    const s = await page.evaluate(async () => {
      const out = {}
      const segs = (ty) => document.querySelector('#type-filter .seg-btn[data-type="' + ty + '"]')
      const counts = () => [...document.querySelectorAll('#list li[data-id]')].map((li) => ((li.querySelector('.sub') || {}).textContent || '').split(' ')[0].toLowerCase())
      for (const ty of ['scene', 'web', 'video', 'all']) {
        segs(ty).click()
        await new Promise((r) => setTimeout(r, 700))
        const kinds = counts()
        out[ty] = { n: kinds.length, kinds: [...new Set(kinds)] }
      }
      out.visible = !!document.querySelector('#type-filter') && document.querySelector('#type-filter').getBoundingClientRect().width > 0
      out.badge = [...document.querySelectorAll('#list li[data-id] .bench-kind')].length
      return out
    })
    ok(s.visible && s.scene.n > 0 && s.web.n > 0 && s.video.n > 0 && s.all.n >= s.scene.n + s.web.n + s.video.n - 1,
      'S8a 类型过滤可用且**四档都在**：全部 = 三档之和（改前 `#type-filter` 被 hidden 且 onclick=null ⇒ 永远只有 scene）', JSON.stringify(s))
    ok(s.web.kinds.every((k) => k === 'web') && s.video.kinds.every((k) => k === 'video') && s.badge > 0,
      'S8b 每档列表里的条目类型都对得上（标签如实显示，不一律写 scene）', JSON.stringify({ web: s.web, video: s.video, badges: s.badge }))
  }

  // S9 ⑩ 库来源显式显示（没选过就不许写成"已选"）
  {
    const s = await page.evaluate(() => {
      const el = document.getElementById('lib-source')
      if (!el) return null
      return { text: el.textContent, kind: el.dataset.kind, path: el.dataset.path, title: el.getAttribute('title') }
    })
    ok(s && s.text && s.path && (s.kind === 'default' || s.kind === 'user') && s.title,
      'S9 ⑩「当前库来源」写出四态之一 + 实际路径（本机默认目录会明确标注"你还没有选择"）', JSON.stringify(s))
  }

  // S10 ⑪ 设置/关于里的双方共同署名 + 上游许可全文入口
  {
    const s = await page.evaluate(() => {
      const q = (x) => document.getElementById(x)
      return {
        title: (q('credit-title-footer') || {}).textContent, link: (q('credit-link-footer') || {}).textContent,
        href: q('credit-link-footer') && q('credit-link-footer').getAttribute('href'),
        repo: (q('credit-repo-footer') || {}).textContent,
        lic: [...document.querySelectorAll('.bench-credit-license a')].map((a) => a.getAttribute('href')),
      }
    })
    ok(s.title && s.link && s.repo && /oneincase\/webwallgl/.test(s.href || '') &&
      /XHR666\/wallpaper-engine-web-loader|wallpaper-engine-web-loader/.test(s.repo) &&
      s.lic.some((h) => /LICENSE-webwallgl-MIT\.txt/.test(h)) && s.lic.some((h) => /LICENSE-webwallgl$/.test(h)),
      'S10 ⑪双方共同署名（本仓库作者 + 上游 oneincase/webwallgl MIT）且两份许可全文入口都在', JSON.stringify(s))
  }

  // S11 ①(P-159) 指针"离开"不再推一个画面正中的活指针
  {
    const s = await page.evaluate(async () => {
      const before = (window.__benchPatch && window.__benchPatch.getPointerPark) ? window.__benchPatch.getPointerPark() : null
      const stage = document.getElementById('stage')
      const r = stage.getBoundingClientRect()
      // 合成事件：先给一个"在画面里"的坐标，再移出画面 + mouseout(null)
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: Math.round(r.x + r.width / 2), clientY: Math.round(r.y + r.height / 2), bubbles: true }))
      await new Promise((res) => setTimeout(res, 200))
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: 2, clientY: 2, bubbles: true }))
      document.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null, bubbles: true }))
      stage.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
      await new Promise((res) => setTimeout(res, 300))
      const after = (window.__benchPatch && window.__benchPatch.getPointerPark) ? window.__benchPatch.getPointerPark() : null
      return { before, after }
    })
    if (s.after) {
      ok(s.after.count > 0 && s.after.pushed === 0 && s.after.mode === 'leave',
        'S11a ①(P-159)"离开"确实发生了（count>0）但**一次都没推活坐标**（pushed===0；旧默认会 push(0.5,0.5)）', JSON.stringify(s.after))
    } else notes.push('S11 未测：`__benchPatch.getPointerPark()` 不可用')
  }

  // ══════════════════ F 组（P-158 §7.3 / 服务端 `aa2fbd2`）库目录对话框：**两档都测** ══════════════════
  //  服务端 `GET /api/fs/*` 由另一条线交付；:8902 的进程**重启过**（2026-09-19 实测 200）。这条断言
  //  先探路由状态，再按**对应那一档**判：200 ⇒ 应用内浏览真的可用（列根/进目录/确认按钮）；
  //  404 ⇒ 明确提示"服务端还没有这条路由" + 两个兜底按钮。两档都必须**不是**静默失败。
  {
    const routesStatus = await page.evaluate(() => fetch('/api/fs/roots', { headers: { accept: 'application/json' } }).then((r) => r.status).catch(() => 0))
    const dlg = await page.evaluate(async () => {
      document.getElementById('pick-lib').click()
      await new Promise((r) => setTimeout(r, 1600))
      const box = document.getElementById('bench-fs-dialog')
      if (!box) return null
      const btns = [...box.querySelectorAll('button')].map((b) => ({ text: b.textContent, disabled: b.disabled, listable: b.dataset.listable || null }))
      return {
        note: (box.querySelector('#bench-fs-note') || {}).textContent || '',
        path: (box.querySelector('.bench-dirbox-path') || {}).textContent || '',
        rows: box.querySelectorAll('#bench-fs-list .bench-dirbox-row').length,
        dirRows: box.querySelectorAll('#bench-fs-list .bench-dirbox-row[data-type="dir"]').length,
        count: (box.querySelector('#bench-fs-count') || {}).textContent || '',
        confirm: !!box.querySelector('#bench-fs-confirm'),
        chips: btns.filter((b) => b.listable !== null),
        hasFrontend: btns.some((b) => /in-browser scan|纯前端/i.test(b.text)),
        hasSystem: btns.some((b) => /system picker|系统选择器/i.test(b.text)),
      }
    })
    ok(!!dlg, 'F1 「选择文件夹」开的是**应用内对话框**（`#bench-fs-dialog`），不是直接弹系统选择器')
    if (dlg) {
      ok(dlg.hasFrontend && dlg.hasSystem, 'F2 对话框里两个兜底按钮都在（纯前端扫描 / **显式标注**的系统选择器）', JSON.stringify({ frontend: dlg.hasFrontend, system: dlg.hasSystem }))
      if (routesStatus === 200) {
        ok(dlg.rows > 0 && dlg.dirRows > 0 && dlg.confirm && dlg.chips.length > 0,
          'F3a 【200 档 · 本机实测】应用内浏览真的可用：列出了一档目录 + 「就选这个目录」按钮 + 快捷根', JSON.stringify({ status: routesStatus, rows: dlg.rows, dirs: dlg.dirRows, chips: dlg.chips.length, count: dlg.count, path: dlg.path }))
        ok(!/api\/fs\/\*|noRoute|还没有/i.test(dlg.note),
          'F3b 【200 档】不再是"服务端还没有这条路由"的降级文案（走的是只读浏览说明）', dlg.note.slice(0, 60))
        ok(dlg.chips.some((c) => c.listable === '0' && c.disabled) || dlg.chips.every((c) => c.listable === '1'),
          'F3c 【200 档】服务端标了 `listable:false` 的根**灰显**（实测 home 默认不可列；不许"点了没反应"）', JSON.stringify(dlg.chips.map((c) => c.text + (c.disabled ? '(disabled)' : ''))))
        // 进一个子目录（不点确认：那会真的换库目录 —— 门禁不许改用户的库）
        const nav = await page.evaluate(async () => {
          const row = document.querySelector('#bench-fs-list .bench-dirbox-row[data-type="dir"]')
          if (!row) return null
          row.click()
          await new Promise((r) => setTimeout(r, 1200))
          const pathEl = document.querySelector('#bench-fs-dialog .bench-dirbox-path')
          return { path: pathEl ? pathEl.textContent : '', parent: pathEl ? pathEl.dataset.parent : '', rows: document.querySelectorAll('#bench-fs-list .bench-dirbox-row').length }
        })
        ok(nav && nav.rows > 0 && nav.parent,
          'F3d 【200 档】单击目录能进去（路径 + `parent` 都更新，上一级按钮靠 `parent` 而不是字符串拼路径）', JSON.stringify(nav))
      } else {
        ok(/api\/fs\/\*|noRoute|还没有/i.test(dlg.note) && dlg.rows === 0,
          'F4a 【404 档】明确写出"服务端还没有 /api/fs/* 这条路由"（不是静默失败）', JSON.stringify({ status: routesStatus, note: dlg.note.slice(0, 80) }))
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      notes.push('F 组：/api/fs/roots 实测状态 = ' + routesStatus + '（分支：' + (routesStatus === 200 ? '200 应用内浏览' : '404 降级提示') + '）')
    }
  }

  // ══════════════════ T 组（P-161）播放卡片：真的在控当前媒体 ══════════════════
  //  为什么用 web 档：卡片的数据面来自"当前媒体元素"（`<video>`/`<audio>`）。video/scene 档在本渲染器里
  //  走 **WebCodecs 逐帧**（没有 `<video>` 元素、也没有任何 seek API），所以真控读数只能在"入口 HTML 里
  //  带媒体元素"的 web 档上取；video/scene 档的诚实降级（canSeek=false、canPlay 可用）也在这一组里断言。
  //  夹具选择：本机库 7 张 web 档里只有 3644069061（2×video + 3×audio）与 3646392375（1×audio）带媒体元素。
  {
    const t = await page.evaluate(async () => {
      const out = {}
      const seg = document.querySelector('#type-filter .seg-btn[data-type="web"]')
      if (!seg) return { err: 'no web seg' }
      seg.click()
      await new Promise((r) => setTimeout(r, 900))
      const lis = [...document.querySelectorAll('#list li[data-id]')]
      const li = lis.find((x) => x.dataset.id === '3644069061') || lis[0]
      out.id = li.dataset.id
      li.click()
      await new Promise((r) => setTimeout(r, 11000))
      //  基线要在**挂载完成之后**取：挂载本身当然会换 src（那是 bundle 的换壁纸），
      //  这一组要证的是"卡片自己的操作不再动它"。
      const frameSrcBefore = document.getElementById('frame').getAttribute('src')
      const card = () => window.__benchPatch.npCard()
      const c0 = card()
      const a = window.__benchShell.navSound
      //  T1/T2 的读数要求"媒体元素已经读完 metadata"（`seekable` 有区间 / `duration` 有值）。同机实测：
      //  同一份页面同一个壁纸，一次 canSeek=true、一次 false（11s 之后仍在读）⇒ 这里是**有界等待**，
      //  不是把判据放松：等满 15s 还没读到就照旧按原判据失败。
      for (let i = 0; i < 30; i++) {
        const m = a.mediaList()
        const v = m.vids[0] || m.auds[0]
        if (v && Number(v.duration) > 0 && v.seekable && v.seekable.length > 0) break
        await new Promise((r) => setTimeout(r, 500))
      }
      const pick = () => { const m = a.mediaList(); return m.vids.find((v) => !v.paused) || m.vids[0] || m.auds[0] || null }
      const v0 = pick()
      out.initial = {
        snap: c0 && c0.snapshot, media: c0 && c0.media, controlled: c0 && c0.controlled, link: c0 && c0.link,
        cardHeight: c0 && c0.cardHeight,
        title: (document.querySelector('#np-mount .snd-title') || {}).textContent,
        by: (document.querySelector('#np-mount .snd-by') || {}).textContent,
        clock: [...document.querySelectorAll('#np-mount .snd-clock span')].map((x) => x.textContent),
        rail: (() => { const r = document.querySelector('#np-mount .snd-run'); return r ? r.style.width : null })(),
        opLabels: [...document.querySelectorAll('#np-mount .snd-op')].map((b) => b.getAttribute('aria-label') + (b.disabled ? '(disabled)' : '')),
        video: v0 ? { paused: v0.paused, t: Math.round(v0.currentTime * 1000) / 1000, dur: Math.round((Number(v0.duration) || 0) * 1000) / 1000, volume: v0.volume, muted: v0.muted } : null,
        markers: {
          root: !!document.querySelector('#np-mount [data-mpw-now-playing]'),
          scrub: !!document.querySelector('#np-mount [data-mpw-np-scrub]'),
          link: (document.querySelector('#np-mount [data-mpw-np-link]') || {}).getAttribute ? document.querySelector('#np-mount [data-mpw-np-link]').getAttribute('data-mpw-np-link') : null,
        },
        frameSrc: frameSrcBefore,
      }
      // ① 播放/暂停：先把媒体**强制到播放中**（走宿主入口，避免被上一组/自动播放策略留在暂停态），
      //    再点卡片那颗键 ⇒ `video.paused` 必须翻转（两条路径都是真实落点）。
      window.__benchPatch.npTransport('play', 1)
      await new Promise((r) => setTimeout(r, 900))
      const lead = document.querySelector('#np-mount .snd-op[data-lead]')
      const wasPlaying = pick() ? pick().paused === false : null
      const before = lead.getAttribute('aria-pressed')
      lead.click()
      await new Promise((r) => setTimeout(r, 900))
      const v1 = pick()
      out.toggle1 = { wasPlaying, before, after: lead.getAttribute('aria-pressed'), paused: v1 ? v1.paused : null }
      lead.click()
      await new Promise((r) => setTimeout(r, 900))
      const v2 = pick()
      out.toggle2 = { paused: v2 ? v2.paused : null, aria: lead.getAttribute('aria-pressed') }
      // ② 进度：在 rail 上按 75% 处点一下 ⇒ currentTime ≈ 0.75 × duration
      const rail = document.querySelector('#np-mount .snd-rail')
      const rr = rail.getBoundingClientRect()
      const x = Math.round(rr.left + rr.width * 0.75)
      const y = Math.round(rr.top + rr.height / 2)
      rail.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerId: 1, buttons: 1 }))
      rail.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerId: 1 }))
      await new Promise((r) => setTimeout(r, 600))
      const v3 = pick()
      out.seek = { at: { x, y }, w: Math.round(rr.width), t: v3 ? Math.round(v3.currentTime * 1000) / 1000 : null, dur: v3 ? Math.round((Number(v3.duration) || 0) * 1000) / 1000 : null, ratio: v3 && v3.duration ? Math.round((v3.currentTime / v3.duration) * 100) / 100 : null }
      // ③ 音量：走卡片 op（宿主入口）⇒ 元素 volume 跟着变
      const rVol = window.__benchPatch.npTransport('volume', 0.42)
      await new Promise((r) => setTimeout(r, 400))
      const v4 = pick()
      out.volume = { op: rVol, volume: v4 ? Math.round(v4.volume * 100) / 100 : null, muted: v4 ? v4.muted : null }
      window.__benchPatch.npTransport('volume', 0)
      await new Promise((r) => setTimeout(r, 300))
      // ④ 联动开关：点心形 ⇒ link=0、所有键置灰、再点播放**不动作**
      const heart = document.querySelector('#np-mount [data-mpw-np-link]')
      heart.click()
      await new Promise((r) => setTimeout(r, 700))
      const c1 = card()
      const v5 = pick()
      const lead2 = document.querySelector('#np-mount .snd-op[data-lead]')
      const pausedBefore = v5 ? v5.paused : null
      lead2.click()
      await new Promise((r) => setTimeout(r, 600))
      const v6 = pick()
      out.link = {
        snapLink: c1 && c1.snapshot && c1.snapshot.link, canPlay: c1 && c1.snapshot && c1.snapshot.canPlay,
        attr: heart.getAttribute('data-mpw-np-link'), disabled: !!lead2.disabled,
        pausedBefore, pausedAfter: v6 ? v6.paused : null,
      }
      heart.click()      // 联动画回来
      await new Promise((r) => setTimeout(r, 500))
      out.linkBack = (card() || {}).snapshot ? card().snapshot.link : null
      // ⑤a 卡片操作**不 remount 壁纸**：这一串 op（播放/暂停/seek/音量/联动）走完，`#frame` 的 src 必须一字未动
      out.noRemountByCard = document.getElementById('frame').getAttribute('src') === frameSrcBefore
      // ⑤b 换壁纸（bundle 自己的 li.onclick）后卡片**重新绑定**到新壁纸的媒体（标题/媒体数跟着变）
      const frameSrcMid = document.getElementById('frame').getAttribute('src')
      const nextLi = lis[lis.indexOf(li) + 1] || lis[0]
      nextLi.click()
      await new Promise((r) => setTimeout(r, 9000))
      const c2 = card()
      out.rebind = {
        newTitle: c2 && c2.snapshot && c2.snapshot.title,
        cardStillThere: !!document.querySelector('#np-mount .snd-box'),
        newMeta: c2 && c2.media,
        frameReloadedBySwitch: document.getElementById('frame').getAttribute('src') !== frameSrcMid,
        cardHeight: c2 && c2.cardHeight,
      }
      return out
    })
    const ini = t.initial || {}
    ok(t && ini.snap && ini.media && (ini.media.videos + ini.media.audios) > 0 && ini.snap.canPlay && ini.snap.canSeek,
      'T1 【真控·接线】web 档（带媒体元素）挂载后卡片进入受控态：媒体元素被扫到、canPlay/canSeek 为真',
      JSON.stringify({ id: t && t.id, media: ini.media, snap: ini.snap && { kind: ini.snap.kind, source: ini.snap.source, canPlay: ini.snap.canPlay, canSeek: ini.snap.canSeek } }))
    ok(ini.title && ini.snap && ini.title === ini.snap.title && ini.by === ini.snap.byline && ini.snap.total > 0,
      'T2 【真控·显示】卡片上写的是**真实**标题/副标题/总长（不再是 "Cabra Field"/"Side B"/52s 那套装饰值）',
      JSON.stringify({ title: (ini.title || '').slice(0, 40), by: ini.by, total: ini.snap && ini.snap.total }))
    ok(t && t.toggle1 && t.toggle1.wasPlaying === true && t.toggle1.paused === true && t.toggle1.after === 'false' &&
      t.toggle2 && t.toggle2.paused === false && t.toggle2.aria === 'true',
      'T3 【真控·播放/暂停】强制播放后点卡片那颗键 ⇒ `video.paused` 翻转 + `aria-pressed` 跟着真实状态（再点回来）',
      JSON.stringify({ wasPlaying: t && t.toggle1 && t.toggle1.wasPlaying, aria: [t && t.toggle1 && t.toggle1.before, t && t.toggle1 && t.toggle1.after], paused: [t && t.toggle1 && t.toggle1.paused, t && t.toggle2 && t.toggle2.paused] }))
    ok(t && t.seek && t.seek.dur > 0 && Math.abs(t.seek.ratio - 0.75) <= 0.12,
      'T4 【真控·进度】在卡片 rail 的 75% 处按下 ⇒ `video.currentTime/duration ≈ 0.75`（±0.12 容差）',
      JSON.stringify(t && t.seek))
    ok(t && t.volume && t.volume.op === 'volume' && t.volume.volume === 0.42 && t.volume.muted === false,
      'T5 【真控·音量】经卡片 op 设 0.42 ⇒ 元素的 `volume === 0.42` 且解除静音',
      JSON.stringify(t && t.volume))
    ok(t && t.link && t.link.canPlay === false && t.link.disabled === true && t.link.pausedBefore === t.link.pausedAfter && t.linkBack === true,
      'T6 【联动开关】关掉联动 ⇒ 所有键置灰、点播放**不动作**（paused 不变）；再点回来恢复',
      JSON.stringify(t && t.link))
    ok(t && ini.markers && ini.markers.root && ini.markers.scrub && (ini.markers.link === '1' || ini.markers.link === '0'),
      'T7 【DOM 标记】卡片暴露 `data-mpw-now-playing` / `data-mpw-np-scrub` / `data-mpw-np-link`（与插件仓同一套标记口径）',
      JSON.stringify(ini.markers))
    ok(t && t.noRemountByCard === true,
      'T8a 【不打架】卡片这一串操作（播放/暂停/seek/音量/联动）走完，`#frame` 的 src **一字未动**（卡片不会 remount 壁纸）',
      JSON.stringify({ same: t && t.noRemountByCard }))
    ok(t && t.rebind && t.rebind.cardStillThere && t.rebind.newTitle && t.rebind.newTitle !== ini.title && t.rebind.newMeta,
      'T8b 【重新绑定】换一张壁纸后卡片跟着新壁纸重绑（标题/媒体数都变），React 根没被重建（`.snd-box` 仍在）',
      JSON.stringify(t && t.rebind))
    // 收尾：切回「全部」
    await page.evaluate(async () => { const all = document.querySelector('#type-filter .seg-btn[data-type="all"]'); if (all) all.click(); await new Promise((r) => setTimeout(r, 700)) })
  }

  // ══════════════════ W 组（P-160）web 壁纸：WE shim 真的注进去了 ══════════════════
  //  判据（用户补充要求：web 类要"真的能用"，不是只把入口挂上）：
  //   ①渲染器**不再**打印「同源入口未检测到 WE shim」；②壁纸文档里 WE API 就位（`__weSetPaused` 等）；
  //   ③鼠标/触摸真的能到达壁纸页（在壁纸文档里挂监听，再用真鼠标事件走一遍）；
  //   ④注入的是**渲染器自带**的那份 shim（`shimFrom` 指渲染器产物、字节数与源码一致）。
  {
    // 先把日志清空：这样 W 组判的是"本次 web 挂载"的日志，而不是历史行
    await page.evaluate(() => { const b = document.getElementById('clear-logs'); if (b) b.click() })
    const mount = await page.evaluate(async () => {
      const seg = document.querySelector('#type-filter .seg-btn[data-type="web"]')
      if (!seg) return { err: 'no web seg' }
      seg.click()
      await new Promise((r) => setTimeout(r, 900))
      const li = document.querySelector('#list li[data-id]')
      if (!li) return { err: 'no web item' }
      const id = li.dataset.id
      li.click()
      await new Promise((r) => setTimeout(r, 9000))
      const frame = document.getElementById('frame')
      const out = { id, outerSrc: frame.getAttribute('src') || '', shim: (window.__benchWebShim ? window.__benchWebShim() : null), log: (document.getElementById('logbody') || {}).textContent || '' }
      try {
        const rdoc = frame.contentWindow.document
        const wf = rdoc.querySelector('iframe')
        if (!wf) { out.err2 = 'no wallpaper iframe'; return out }
        const wwin = wf.contentWindow
        const wdoc = wwin.document
        out.wall = {
          src: wf.getAttribute('src') || '',
          sandbox: wf.getAttribute('sandbox') || '',
          hasSetPaused: typeof wwin.__weSetPaused === 'function',
          hasFps: typeof wwin.__weSetFps === 'function',
          hasVolume: typeof wwin.__weSetVolume === 'function',
          //  shim 用 `Object.defineProperty` 装的是**访问器**（getter 返回内部变量，作者赋值前是 null）
          //  ⇒ 判据是"这个属性由 shim 装在窗口自己身上"，而不是"当前值非空"（作者可能还没渲染到那一步）
          hasPropListener: ('wallpaperPropertyListener' in wwin) &&
            !!(Object.getOwnPropertyDescriptor(wwin, 'wallpaperPropertyListener') || {}).get,
          propListenerType: (() => { try { const v = wwin.wallpaperPropertyListener; return v === null ? 'null' : typeof v } catch { return 'throw' } })(),
          propAssignedByAuthor: (() => { try { return !!(wwin.wallpaperPropertyListener && typeof wwin.wallpaperPropertyListener === 'object') } catch { return false } })(),
          hasAudioReg: typeof wwin.wallpaperRegisterAudioListener === 'function',
          hasRandomFile: typeof wwin.wallpaperRequestRandomFileForProperty === 'function',
          hasPushPointer: typeof wwin.__wePushPointer === 'function',
          hasPushWheel: typeof wwin.__wePushWheel === 'function',
          shimTag: !!wdoc.querySelector('script[data-we-shim-src]'),
          baseHref: (wdoc.querySelector('base') || {}).href || '',
          scripts: wdoc.querySelectorAll('script').length,
          title: wdoc.title,
        }
        out.rendererWp = typeof frame.contentWindow.__wp === 'object' && frame.contentWindow.__wp !== null
      } catch (e) { out.err3 = String(e.message) }
      return out
    })
    ok(mount && mount.shim && mount.shim.installed && mount.shim.injected >= 1 && mount.shim.failed === 0 && mount.shim.reason === '',
      'W1 【接线】web 档挂载时 shim hook 已装并**成功注入**（failed=0 / reason 空）', JSON.stringify(mount && mount.shim))
    ok(mount && mount.shim && mount.shim.shimBytes > 10000 && /renderer-.*\.js$/.test(mount.shim.shimFrom || ''),
      'W2 【来源】注入的是**渲染器产物自带**的那份 shim（不是另抄一份），字节数 = 产物里的常量长度',
      JSON.stringify({ bytes: mount && mount.shim && mount.shim.shimBytes, from: mount && mount.shim && mount.shim.shimFrom }))
    ok(mount && !/未检测到 WE shim/.test(mount.log) && !/shim 注入失败/.test(mount.log),
      'W3 【判据①】渲染器**不再**打印「网页壁纸：同源入口未检测到 WE shim」，也没有注入失败行',
      JSON.stringify({ warn: mount ? /未检测到 WE shim/.test(mount.log) : null, fail: mount ? /shim 注入失败/.test(mount.log) : null }))
    const w = mount && mount.wall
    ok(w && w.hasSetPaused && w.hasFps && w.hasVolume && w.hasPropListener && w.hasAudioReg && w.hasRandomFile,
      'W4 【判据②】壁纸文档里 WE API 就位（`__weSetPaused/__weSetFps/__weSetVolume` + shim 装的 `wallpaperPropertyListener` 访问器 + 音频/随机文件注册）',
      JSON.stringify(w && { paused: w.hasSetPaused, fps: w.hasFps, vol: w.hasVolume, prop: w.hasPropListener, propType: w.propListenerType, authorAssigned: w.propAssignedByAuthor, audio: w.hasAudioReg, rnd: w.hasRandomFile }))
    ok(w && w.shimTag && /^blob:/.test(w.src || '') && w.baseHref && /\/web\/dev\//.test(w.baseHref) && w.scripts >= 1,
      'W5 【形态】壁纸文档 = blob（shim 在最前，带 `data-we-shim-src` 标记）+ `<base href>` 指向入口目录（相对资源不断）',
      JSON.stringify(w && { blob: /^blob:/.test(w.src || ''), shimTag: w.shimTag, base: w.baseHref, scripts: w.scripts }))
    ok(mount && mount.rendererWp && w && w.hasPushPointer && w.hasPushWheel,
      'W6 【指针通道】渲染器侧 `__wp` 仍是对象，壁纸侧 shim 的指针/滚轮通道（`__wePushPointer/__wePushWheel`）都在',
      JSON.stringify({ rendererWp: mount && mount.rendererWp, push: w && w.hasPushPointer, wheel: w && w.hasPushWheel }))

    // 判据③：真鼠标事件能不能到达壁纸页 —— 在壁纸文档里挂监听，再用 `page.mouse.move` 走一遍
    const pt = await page.evaluate(() => {
      const frame = document.getElementById('frame')
      const r = frame.getBoundingClientRect()
      try {
        const wwin = frame.contentWindow.document.querySelector('iframe').contentWindow
        wwin.__mpwSeen = { move: 0, down: 0 }
        wwin.document.addEventListener('mousemove', () => { wwin.__mpwSeen.move++ }, true)
        wwin.document.addEventListener('mousedown', () => { wwin.__mpwSeen.down++ }, true)
      } catch (e) { return { err: String(e.message) } }
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })
    if (pt && !pt.err) {
      await page.mouse.move(pt.x - 40, pt.y - 30)
      await page.mouse.move(pt.x, pt.y)
      await page.mouse.down()
      await page.mouse.up()
      await page.waitForTimeout(400)
      const seen = await page.evaluate(() => {
        try { return document.getElementById('frame').contentWindow.document.querySelector('iframe').contentWindow.__mpwSeen } catch { return null }
      })
      ok(seen && seen.move > 0 && seen.down > 0,
        'W7 【判据③】鼠标事件真的到达**壁纸页**（壁纸文档里的监听记到 mousemove/mousedown）',
        JSON.stringify({ seen, at: pt }))
    } else notes.push('W7 未测：拿不到壁纸 iframe 的 rect（' + JSON.stringify(pt) + '）')
    // 收尾：切回「全部」，别让后面的断言看到 web-only 的列表
    await page.evaluate(async () => {
      const all = document.querySelector('#type-filter .seg-btn[data-type="all"]')
      if (all) all.click()
      await new Promise((r) => setTimeout(r, 700))
    })
  }

  // ══════════════════ M 组（P-159）mpw 自绘下拉：按钮文案 + 包含块偏移后的贴合 ══════════════════
  //  为什么用**夹具**：:8902 默认档（合成样例 + 本机库）里没有 combo 属性 ⇒ 页面上本来一个 `.mpw_select`
  //  都不存在（工具条那 5 个已归 `.bench-rd`）。往 `#props-body` 插两个原生 select（选中第 2 项），
  //  补丁的 `watchBenchPropsSelects` 观察者会把它们增强成 mpw 控件 —— 这就是"真机首帧"的等价形态。
  {
    const fixture = await page.evaluate(async () => {
      const host = document.getElementById('props-body')
      if (!host) return { err: 'no #props-body' }
      const mk = (id, css) => {
        const wrap = document.createElement('div')
        wrap.id = id + '-wrap'
        wrap.setAttribute('style', css)
        const sel = document.createElement('select')
        sel.id = id
        for (const [v, label] of [['a', 'Alpha'], ['b', 'Beta'], ['c', 'Gamma']]) {
          const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o)
        }
        sel.value = 'b'
        wrap.appendChild(sel); host.appendChild(wrap)
        return wrap
      }
      //  A：页面上部（下方空间充足 ⇒ 应**下开**）  B：贴裁剪盒底边（⇒ 应**上翻**）
      mk('bench-mpw-down', 'position:fixed;left:24px;top:140px;z-index:8')
      mk('bench-mpw-up', 'position:fixed;left:24px;bottom:6px;z-index:8')
      await new Promise((r) => setTimeout(r, 600))            // 等观察者增强
      const info = (id) => {
        const sel = document.getElementById(id)
        const h = sel && sel.__mpwSelectHandle
        const btn = h && h.root ? h.root.querySelector('.mpw_select_btn') : null
        return { enhanced: !!h, label: btn ? btn.textContent : null, dataLabel: h && h.root ? h.root.getAttribute('data-mpw-label') : null, btnRect: btn ? (() => { const r = btn.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) } })() : null }
      }
      return { down: info('bench-mpw-down'), up: info('bench-mpw-up') }
    })
    ok(fixture.down && fixture.down.enhanced && fixture.down.label === 'Beta' && fixture.down.dataLabel === 'Beta',
      'M1a ①(P-159) 首次展开**之前**按钮文案 = 当前选中项（`Beta`），不是「（空）」',
      JSON.stringify({ down: fixture.down && fixture.down.label, up: fixture.up && fixture.up.label }))
    ok(fixture.up && fixture.up.enhanced && fixture.up.label === 'Beta',
      'M1b ①两个夹具都增强成功（第 2 个也走同一条链，不是只对第一个生效）', JSON.stringify(fixture.up && fixture.up.label))

    const measure = (id) => page.evaluate(async (fid) => {
      const sel = document.getElementById(fid)
      const h = sel && sel.__mpwSelectHandle
      if (!h) return { err: 'not enhanced' }
      h.open()
      await new Promise((r) => setTimeout(r, 250))
      const list = h.root.querySelector('.mpw_select_list')
      const btn = h.root.querySelector('.mpw_select_btn')
      const b = btn.getBoundingClientRect(); const l = list.getBoundingClientRect()
      const out = {
        flip: list.getAttribute('data-flip'), origin: list.getAttribute('data-origin'),
        gap: Math.round(((l.top >= b.top ? l.top - b.bottom : b.top - l.bottom)) * 10) / 10,
        firstItem: (list.firstElementChild || {}).textContent, count: list.children.length,
        btn: { top: Math.round(b.top), bottom: Math.round(b.bottom) }, list: { top: Math.round(l.top), bottom: Math.round(l.bottom) },
      }
      h.close()
      await new Promise((r) => setTimeout(r, 120))
      return out
    }, id)
    const d = await measure('bench-mpw-down')
    const u = await measure('bench-mpw-up')
    ok(d.flip === 'down' && d.gap <= 2 && d.gap >= 0 && d.firstItem === 'Alpha' && d.count === 3,
      'M2 ②(P-159) mpw 下开：列表与触发框的缝 ≤2px（减掉包含块原点后；改前是 44~48px），首项 = 第 1 个选项', JSON.stringify(d))
    ok(u.flip === 'up' && u.gap <= 2 && u.gap >= 0,
      'M3 ③(P-159) mpw 上翻：同样贴合（列表**下边缘**距触发框上边缘 ≤2px；上翻按底边锚定，内容矮也不留缝）', JSON.stringify(u))
    ok(d.origin === 'containing-block' && u.origin === 'containing-block',
      'M4 ②(P-159) 两处都如实标了 `data-origin=containing-block`（证明走的是"减掉 `#pages-track` 原点"那条路）', JSON.stringify({ down: d.origin, up: u.origin }))
    // 夹具清理：别给后面的断言留脏 DOM
    await page.evaluate(() => {
      for (const id of ['bench-mpw-down', 'bench-mpw-up']) {
        const sel = document.getElementById(id)
        try { sel && sel.__mpwSelectHandle && sel.__mpwSelectHandle.destroy() } catch { /* ignore */ }
        const w = document.getElementById(id + '-wrap')
        if (w && w.parentNode) w.parentNode.removeChild(w)
      }
    })
  }

  const topErrs = await page.evaluate(() => (window.__topErrs || []).slice(0, 4))
  // ══════════════════ X 组（P-164 ⑤）品牌图标：真机抓到的是新图且能取到 ══════════════════
  {
    const x = await page.evaluate(async () => {
      const links = [...document.querySelectorAll('link[rel*="icon"]')].map((l) => l.getAttribute('href'))
      const probe = async (href) => {
        if (!href) return null
        try {
          const r = await fetch(href, { method: 'GET' })
          return { href, status: r.status, type: r.headers.get('content-type') || '', bytes: (await r.arrayBuffer()).byteLength }
        } catch (e) { return { href, err: String(e.message) } }
      }
      const mf = await fetch(document.querySelector('link[rel="manifest"]').getAttribute('href')).then((r) => r.json())
      const icons = []
      for (const ic of mf.icons || []) icons.push(await probe(new URL(ic.src, location.href).href))
      const cover = (() => { try { const el = document.querySelector('#np-mount .snd-art'); return el ? getComputedStyle(el).backgroundImage : '' } catch { return '' } })()
      return { links, favicons: [await probe(links[0]), await probe(links[links.length - 1])], icons, cover }
    })
    const allBrand = (x.links || []).every((h) => /assets\/brand\//.test(h || ''))
    const okFetch = x.favicons.every((f) => f && f.status === 200 && /^image\//.test(f.type) && f.bytes > 500)
    ok(allBrand && (x.links || []).length >= 3 && okFetch,
      'X1 ⑤ 真机 `link[rel*=icon]` 全部指向品牌图且 fetch 200 + `image/*`', JSON.stringify({ links: x.links, favicons: x.favicons }))
    ok((x.icons || []).length === 3 && x.icons.every((i) => i && i.status === 200 && /^image\//.test(i.type) && /assets\/brand\//.test(i.href)),
      'X2 ⑤ manifest 的三个图标都是品牌图、都能取到（200 + image/*）', JSON.stringify(x.icons))
    ok(/assets\/brand\/wallpaper-engine-icon-512\.png/.test(x.cover || ''),
      'X3 ⑤ 播放卡片的封面背景图也换成了品牌图', JSON.stringify((x.cover || '').slice(0, 90)))
  }

  // ══════════════════ Y 组（P-164 ①③）标签关闭（×）+ 省略号 + 重复点击幂等 ══════════════════
  {
    const y = await page.evaluate(async () => {
      const P = window.__benchPatch
      const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height) } }
      const hit = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const at = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)); return { self: !!(at && (at === el || el.contains(at))), got: at ? (String(at.className || at.id || at.tagName)).slice(0, 24) : null } }
      const out = {}
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const tabs = () => [...document.querySelectorAll('#editor-tabs .wp-tab')]
      const tabIds = () => tabs().map((b) => b.dataset.id)
      const tabOf = (id) => tabs().find((b) => b.dataset.id === String(id)) || null
      const curText = () => String((document.getElementById('current') || {}).textContent || '')
      const curLiId = () => { const li = document.querySelector('#list li[data-id].active'); return li ? String(li.dataset.id || '') : '' }
      const store = () => { try { return JSON.parse(localStorage.getItem('bench-pinned-wallpapers') || '[]') } catch { return null } }
      const emptyVisible = () => { const e = document.getElementById('empty'); return e ? getComputedStyle(e).display !== 'none' : null }
      const srcOf = () => String(document.getElementById('frame').getAttribute('src') || '')
      const titleOf = (id) => { const li = [...document.querySelectorAll('#list li[data-id]')].find((x) => String(x.dataset.id || '') === String(id)); return li ? String((li.querySelector('.title') || {}).textContent || '').trim() : '' }
      const all = document.querySelector('#type-filter .seg-btn[data-type="all"]')
      if (all) { all.click(); await sleep(800) }
      //  **先清场**：前面各组（类型过滤 / 诊断 / mpw / 播放卡片）可能已经固定过一串项，上一版 Y6/Y7 读到的
      //  tab 数根本不是自己造出来的 ⇒ 期望值只能靠"数自己刚点出来的东西"。这里先把残留全部关掉
      //  （关"当前项"走的正是本批 ① 的回落 / 释放路径），再固定恰好三项 A/B/C。
      for (let i = 0; i < 14; i++) {
        const cx = document.querySelector('.wp-x-cur')
        const anyTab = tabs()[0] || null
        if (!cx && !anyTab) break
        const before = tabIds().length + (cx ? 1 : 0)
        ;(cx || anyTab).click()
        await sleep(cx ? 1400 : 600)
        const after = tabIds().length + (document.querySelector('.wp-x-cur') ? 1 : 0)
        if (after >= before) break                                  // 没有进展就别空转满 14 轮
      }
      await sleep(700)
      out.drain = { tabs: tabIds().length, curText: curText(), cleared: /未选择壁纸|No wallpaper/.test(curText()), emptyVisible: emptyVisible(), pinned: store() }
      const lis = [...document.querySelectorAll('#list li[data-id]')]
      const idA = String(lis[0].dataset.id || ''); const idB = String(lis[1].dataset.id || ''); const idC = String(lis[2].dataset.id || '')
      lis[0].click(); await sleep(4000)
      lis[1].click(); await sleep(4000)
      lis[2].click(); await sleep(6000)
      out.fixed = { want: [idA, idB, idC], tabs: tabIds(), cur: curLiId(), pinned: store(), curText: curText() }
      const tab = tabOf(idA)
      const name = tab ? tab.querySelector('.wp-name') : null
      const xBtn = tab ? tab.querySelector('.wp-x') : null
      out.geom = {
        tabs: document.querySelectorAll('#editor-tabs .wp-tab').length,
        tabRect: R(tab), xRect: R(xBtn), nameEllipsis: name ? getComputedStyle(name).textOverflow : null,
        nameOverflow: name ? getComputedStyle(name).overflow : null, tabMaxW: tab ? getComputedStyle(tab).maxWidth : null,
        xInsideTab: !!(tab && xBtn && R(xBtn).right <= R(tab).right + 1 && R(xBtn).x >= R(tab).x),
        xHit: hit(xBtn),
      }
      const curX = document.querySelector('.wp-x-cur')
      const cur = document.getElementById('current')
      out.curCell = {
        curRect: R(cur), xRect: R(curX), maxW: cur ? getComputedStyle(cur).maxWidth : null,
        ellipsis: cur ? getComputedStyle(cur).textOverflow : null,
        gapPx: (cur && curX) ? Math.round(R(curX).x - R(cur).right) : null, hit: hit(curX),
      }
      const activeLi = () => document.querySelector('#list li[data-id].active')
      const liNow = activeLi()
      const src0 = srcOf()
      const mounts0 = ((document.getElementById('logbody') || {}).textContent || '').split('\n').filter((l) => /Mount /.test(l)).length
      for (let i = 0; i < 3; i++) { liNow.click(); await sleep(600) }
      out.idem = {
        srcSame: srcOf() === src0,
        mountsBefore: mounts0, mountsAfter: ((document.getElementById('logbody') || {}).textContent || '').split('\n').filter((l) => /Mount /.test(l)).length,
        nodeSame: activeLi() === liNow,
        hits: (() => { const h = document.getElementById('np-host'); return h ? h.getAttribute('data-np-idem') : null })(),
      }
      //  **关非当前项**（A）：标签消失、预览不重挂、当前那一格的字一点不动。
      const before = tabIds(); const textBefore = curText()
      const xA = tabOf(idA) ? tabOf(idA).querySelector('.wp-x') : null
      if (xA) xA.click()
      await sleep(1500)
      out.closeOther = {
        closed: idA, before, after: tabIds(), srcSame: srcOf() === src0, textSame: curText() === textBefore,
        curText: curText(), pinned: store(),
      }
      //  **关当前项**（C，还固定着 B）⇒ 明确回落到 B：条上不再有 tab（当前项不进条），且当前那一格必须换成
      //  B 的名字 —— 不能留着已经关掉的 C 的旧标题（上一版断言抓到的就是这个中间态）。
      const cx2 = document.querySelector('.wp-x-cur')
      if (cx2) cx2.click()
      await sleep(2500)
      out.fellBack = {
        curText: curText(), expectTitle: titleOf(idB), tabs: tabIds(), pinned: store(), curLi: curLiId(),
        srcChanged: srcOf() !== src0, curCellX: !!document.querySelector('.wp-x-cur'),
      }
      //  **关最后一个**（B）⇒ 未选择壁纸 + 空态 + 固定集合清空。
      const cx3 = document.querySelector('.wp-x-cur')
      if (cx3) cx3.click()
      await sleep(2500)
      out.release = { curText: curText(), cleared: /未选择壁纸|No wallpaper/.test(curText()), emptyVisible: emptyVisible(), pinned: store(), tabs: tabIds().length }
      void P
      return out
    })
    ok(y.drain && y.drain.tabs === 0 && y.drain.cleared && y.drain.emptyVisible === true && (y.drain.pinned || []).length === 0,
      'Y0 ① 先把残留标签全部关掉（连点"当前项"的 `×` 直到没有）⇒ 未选择壁纸 + 空态 + 固定集合清空（本组后续期望值的干净起点）',
      JSON.stringify(y.drain))
    ok(y.fixed && y.fixed.tabs.length === 2 && y.fixed.cur === y.fixed.want[2] && (y.fixed.pinned || []).length === 3 && y.fixed.curText.length > 0,
      'Y0b ① 固定三项后：条上只有"非当前"的两个标签，当前项只在 `#current` 那一格（不重复出标签）',
      JSON.stringify(y.fixed))
    ok(y.geom && y.geom.tabs >= 1 && y.geom.tabRect && y.geom.tabRect.w <= 200 && y.geom.tabMaxW === '200px',
      'Y1 ① 标签宽度有上限（≤200px，`max-width` 生效）', JSON.stringify(y.geom && { w: y.geom.tabRect.w, maxW: y.geom.tabMaxW }))
    ok(y.geom && y.geom.nameEllipsis === 'ellipsis' && y.geom.nameOverflow === 'hidden',
      'Y2 ① 标题用 CSS 省略号（`overflow:hidden` + `text-overflow:ellipsis`）⇒ 长名字不把 × 顶远', JSON.stringify(y.geom && { o: y.geom.nameOverflow, e: y.geom.nameEllipsis }))
    ok(y.geom && y.geom.xInsideTab && y.geom.xHit && y.geom.xHit.self,
      'Y3 ① 固定标签的 `×` 在标签**右端内侧**且命中区 = 视觉区', JSON.stringify(y.geom && { inside: y.geom.xInsideTab, hit: y.geom.xHit }))
    ok(y.curCell && y.curCell.maxW === '180px' && y.curCell.ellipsis === 'ellipsis' && y.curCell.hit && y.curCell.hit.self && Math.abs(y.curCell.gapPx) <= 1,
      'Y4 ① 当前壁纸那一格：标题省略号 + 紧贴右缘的 `×`（间隙 ≤1px）且命中=视觉',
      JSON.stringify(Object.assign({}, y.curCell, {
        c: y.curCell ? [y.curCell.maxW === '180px', y.curCell.ellipsis === 'ellipsis', !!(y.curCell.hit && y.curCell.hit.self), Math.abs(y.curCell.gapPx) <= 1, y.curCell.gapPx] : null,
      })))
    ok(y.idem && y.idem.srcSame && y.idem.mountsAfter === y.idem.mountsBefore && y.idem.nodeSame && Number(y.idem.hits) >= 3,
      'Y5 ③ 连点"已选中"项 3 次：`#frame` src 不变、`Mount` 日志不增、节点身份不变、拦截计数 ≥3',
      JSON.stringify(y.idem))
    ok(y.closeOther && y.closeOther.closed && !y.closeOther.after.includes(y.closeOther.closed) &&
      y.closeOther.after.length === y.closeOther.before.length - 1 && y.closeOther.srcSame && y.closeOther.textSame,
      'Y6 ① 点**非当前项**的 `×` ⇒ 只有该标签消失（少一个）、预览不重挂（src 不变）、当前那一格的字不动',
      JSON.stringify(y.closeOther))
    ok(y.fellBack && y.fellBack.tabs.length === 0 && y.fellBack.curText === y.fellBack.expectTitle &&
      (y.fellBack.pinned || []).length === 1 && y.fellBack.curCellX === true,
      'Y7 ① 关掉**当前项**（还固定着别的项）⇒ 明确回落到它：当前那一格换成回落项标题（不留已关项的旧标题）、固定集合只剩它',
      JSON.stringify(y.fellBack))
    ok(y.release && y.release.cleared && y.release.emptyVisible === true && (y.release.pinned || []).length === 0 && y.release.tabs === 0,
      'Y8 ① 关掉最后一个（当前项）⇒ 明确回落到"未选择壁纸 + 空态"，固定集合清空', JSON.stringify(y.release))
  }

  // ══════════════════ Z 组（P-164 ②④）调试模式页签 + 指针移动转发 ══════════════════
  {
    const z = await page.evaluate(async () => {
      const P = window.__benchPatch
      const out = {}
      const probe = (key) => { const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented }
      out.before = { swallow: { ArrowRight: probe('ArrowRight'), Alt: probe('Alt') }, view: document.getElementById('logs').dataset.view }
      document.getElementById('tab-debug').click()
      await new Promise((r) => setTimeout(r, 800))
      out.on = {
        view: document.getElementById('logs').dataset.view, active: P.debugMode(), keys: P.dbgKeysInstalled(),
        layerText: (document.getElementById('dbg-layer') || {}).textContent,
        layers: P.dbgLayers(), index: P.dbgIndex(),
        logLines: ((document.getElementById('dbg-log') || {}).textContent || '').length,
        boot: P.dbgBootErr(),
      }
      const btnInfo = (id) => { const b = document.getElementById(id); if (!b) return null; const r = b.getBoundingClientRect(); const at = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)); return { id, w: Math.round(r.width), h: Math.round(r.height), hit: !!(at && (at === b || b.contains(at))) } }
      out.buttons = [btnInfo('dbg-report'), btnInfo('dbg-shot')]
      out.shot = P.dbgShot()
      const rep = await P.dbgReport()
      out.report = rep && { route: rep.route, status: rep.status || 0, bytes: rep.bytes, schema: rep.plan && rep.plan.schema, diagLines: rep.plan && rep.plan.diagLines }
      out.reportStored = (() => { try { return (localStorage.getItem('bench-debug-report') || '').length } catch { return -1 } })()
      out.swallowOn = { ArrowRight: probe('ArrowRight'), ArrowLeft: probe('ArrowLeft'), Control: probe('Control'), KeyA: probe('a'), AltThenExit: probe('Alt') }
      await new Promise((r) => setTimeout(r, 500))
      out.afterAlt = { view: document.getElementById('logs').dataset.view, active: P.debugMode(), keys: P.dbgKeysInstalled() }
      out.swallowOff = { ArrowRight: probe('ArrowRight'), Alt: probe('Alt') }
      return out
    })
    ok(z.before && z.before.swallow.ArrowRight === false && z.before.swallow.Alt === false,
      'Z1 ② 调试模式**未激活**时 ←/→/Alt 的默认行为照旧（不吞）', JSON.stringify(z.before))
    ok(z.on && z.on.view === 'debug' && z.on.active === true && z.on.keys === true,
      'Z2 ② 点「调试模式」⇒ 进入调试视图且键盘路由已装上', JSON.stringify(z.on && { view: z.on.view, active: z.on.active, keys: z.on.keys }))
    ok(z.buttons && z.buttons.every((b) => b && b.w > 40 && b.h > 0 && b.hit === true),
      'Z3 ② 「立即上报」「截图」两个按钮可见且命中区 = 视觉区', JSON.stringify(z.buttons))
    ok(z.on && typeof z.on.layerText === 'string' && z.on.layerText.length > 0 && z.on.logLines > 0,
      'Z4 ② 栏内有**当前层信息**与**日志**（没有场景时如实写"没有可逐层查看的场景"）',
      JSON.stringify({ layer: z.on && z.on.layerText, log: z.on && z.on.logLines }))
    ok(z.shot === null || (z.shot && z.shot.bytes > 1000),
      'Z5 ② 「截图」有场景时给出 JPEG（bytes>1KB），没有画布时走明确失败并写日志', JSON.stringify(z.shot))
    ok(z.report && z.report.schema === 'bench-debug/1' && z.report.bytes > 50 && /^\/(report|baseline|diag)$/.test(z.report.route) && z.reportStored > 50,
      'Z6 ② 「立即上报」：载荷 schema 正确、落点走 /report→/baseline→/diag 的第一条可用路由、并留本地副本',
      JSON.stringify({ report: z.report, stored: z.reportStored }))
    ok(z.swallowOn && z.swallowOn.ArrowRight === true && z.swallowOn.ArrowLeft === true && z.swallowOn.Control === true && z.swallowOn.KeyA === false,
      'Z7 ② 激活期间 ←/→/Ctrl 被吞（含修饰键默认行为）、普通字符键照旧', JSON.stringify(z.swallowOn))
    ok(z.afterAlt && z.afterAlt.view === 'logs' && z.afterAlt.active === false && z.afterAlt.keys === false && z.swallowOff.ArrowRight === false && z.swallowOff.Alt === false,
      'Z8 ② Alt 退出调试模式 ⇒ 视图回输出、键盘监听**卸掉**、默认行为恢复（不留全局拦截）', JSON.stringify({ after: z.afterAlt, off: z.swallowOff }))
    const pf = await page.evaluate(() => window.__benchPatch.pointerForward ? window.__benchPatch.pointerForward() : null)
    ok(pf && pf.enabled === true && typeof pf.forwarded === 'number',
      'Z9 ④ 指针转发入口可读（`enabled` + 已转发次数）', JSON.stringify(pf))
    ok(z.on && z.on.boot === '',
      'Z9b ② 进出调试页签没有**被吞掉的启动错**（`dbgBootErr` 必须是空串：正常路径下 setDebugMode 不许抛）',
      JSON.stringify({ boot: z.on && z.on.boot }))
    //  ④ 真机口径：**不按住任何键**在舞台上移动 ⇒（a）注入遮罩上收到 pointermove 并转发给渲染器，
    //  （b）尾迹画布出现墨迹。两条都用 Playwright 的真鼠标事件（不是 DOM 合成），headless 也能测。
    const ink = () => page.evaluate(() => {
      const c = document.getElementById('trail-canvas')
      if (!c) return -1
      const g = c.getContext('2d')
      if (!g) return -1
      const d = g.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++
      return n
    })
    const injOn = await page.evaluate(() => {
      const p = document.getElementById('pointer-push')
      if (p && !p.checked) p.click()
      return { checked: !!(p && p.checked), veilShown: (() => { const v = document.getElementById('pointer-veil'); return !!(v && !v.hasAttribute('hidden')) })(), trailOnEnabled: (() => { const t = document.getElementById('trail-on'); return !!(t && !t.disabled) })() }
    })
    await page.waitForTimeout(500)
    const pf0 = await page.evaluate(() => window.__benchPatch.pointerForward())
    const rect = await page.evaluate(() => {
      const v = document.getElementById('pointer-veil')
      const el = (v && !v.hasAttribute('hidden')) ? v : document.getElementById('stage')
      const r = el ? el.getBoundingClientRect() : null
      return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
    })
    if (rect && rect.w > 20 && rect.h > 20) {
      const cx = rect.x + Math.round(rect.w * 0.35); const cy = rect.y + Math.round(rect.h * 0.45)
      for (let i = 0; i < 8; i++) await page.mouse.move(cx + i * 12, cy + i * 7)      // 不按键
      await page.waitForTimeout(300)
    }
    const pf1 = await page.evaluate(() => window.__benchPatch.pointerForward())
    ok(rect && rect.w > 20 && pf1 && pf1.forwarded > pf0.forwarded,
      'Z10 ④ 舞台内**不按键**真鼠标移动 ⇒ 坐标经 `__wp.pushPointer(...,buttons=0)` 转发（计数增加）',
      JSON.stringify({ inj: injOn, rect, from: pf0, to: pf1 }))
    const ink0 = await ink()
    await page.evaluate(() => { const t = document.getElementById('trail-on'); if (t && !t.disabled && !t.checked) t.click() })
    await page.waitForTimeout(400)
    if (rect && rect.w > 20 && rect.h > 20) {
      const cx = rect.x + Math.round(rect.w * 0.5); const cy = rect.y + Math.round(rect.h * 0.55)
      for (let i = 0; i < 10; i++) await page.mouse.move(cx - i * 14, cy - i * 9)     // 依旧不按键
      await page.waitForTimeout(300)
    }
    const ink1 = await ink()
    ok(ink0 >= 0 && ink1 > 0 && ink1 >= ink0,
      'Z11 ④ 「指针注入 + 鼠标尾迹」下**不按键**移动 ⇒ 尾迹画布出现墨迹（:8899 同一口径）',
      JSON.stringify({ inkBefore: ink0, inkAfter: ink1, trail: await page.evaluate(() => { const t = document.getElementById('trail-on'); return { checked: !!(t && t.checked), disabled: !!(t && t.disabled) } }) }))
  }

  ok(topErrs.length === 0, 'N6 整轮**顶层文档** 0 个脚本错（页面自己的 error/unhandledrejection 钩子；含本批新增的页签/面板/类型过滤/诊断流/mpw 夹具/播放卡片）',
    topErrs.join(' | ') || ('pageerror(含子帧)=' + errs.length))
  for (const m of errs.slice(0, 4)) notes.push('pageerror（含子帧，仅记录）: ' + m)
  ok(![...errs, ...frameErrs].some((m) => /bench-patch\.js|mpw-select\.js|now-playing/.test(m)),
    'N6b 任何一层都不许出现**本页补丁自己**的脚本错（子帧里渲染器/壁纸作者的错另计，见 notes）',
    [...errs, ...frameErrs].filter((m) => /bench-patch\.js|mpw-select\.js|now-playing/.test(m)).slice(0, 2).join(' | '))
  for (const m of frameErrs.slice(0, 4)) notes.push('子帧脚本错（渲染器/壁纸作者，不计入 N6）: ' + m)
  console.log(`\n── 汇总：PASS=${pass} FAIL=${fail}`)
  for (const n of notes) console.log('  note: ' + n)
  process.exitCode = fail > 0 ? 1 : 0
} finally {
  try { await browser.close() } catch { /* ignore */ }
}
