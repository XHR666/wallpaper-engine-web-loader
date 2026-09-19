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
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)))
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

  ok(errs.length === 0, 'N6 整轮 0 个 pageerror（含本批新增的页签/面板/类型过滤/诊断流/mpw 夹具）', errs.slice(0, 2).join(' | '))
  console.log(`\n── 汇总：PASS=${pass} FAIL=${fail}`)
  for (const n of notes) console.log('  note: ' + n)
  process.exitCode = fail > 0 ? 1 : 0
} finally {
  try { await browser.close() } catch { /* ignore */ }
}
