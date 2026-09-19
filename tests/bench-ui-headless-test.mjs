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
  //  选择器口径：测试台的 6 个下拉在 **`#toolbar`** 里（`demo/bench-patch.js: BENCH_SELECT_IDS = ['lang','resolution','fit','dpr','fps','fx']`），
  //  不是 `#bar`（2026-09-19 实测：按 `#bar` 查会得到"没挂上"的假阴性）。两个都试，再退到"属性面板之外的任意下拉"。
  const SEL_SCOPE = ['#toolbar .mpw_select', '#bar .mpw_select', '.mpw_select']
  const selInfo = await page.evaluate((scopes) => {
    const out = []
    for (const s of scopes) { const n = document.querySelectorAll(s).length; if (n > 0) { out.push({ scope: s, n }); break } }
    return { picked: out[0] || null, lists: document.querySelectorAll('.mpw_select_list').length }
  }, SEL_SCOPE)
  if (selInfo.picked) {
    const scope = selInfo.picked.scope
    let opened = false
    for (let i = 0; i < Math.min(3, selInfo.picked.n); i++) {
      const hit = await page.evaluate(({ scope, idx }) => {
        const els = [...document.querySelectorAll(scope)]
        const el = els[idx]; if (!el) return null
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const btn = el.querySelector('.mpw_select_btn'); if (!btn) return null
        const r = btn.getBoundingClientRect()
        const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2)
        const at = document.elementFromPoint(x, y)
        return { x, y, self: !!(at && (at === btn || btn.contains(at))), hit: at ? (at.id || at.tagName) : null }
      }, { scope, idx: i })
      if (!hit || !hit.self) { notes.push(`工具条下拉[${i}]（${scope}）被遮挡（命中 ${hit && hit.hit}）`); continue }
      await page.mouse.click(hit.x, hit.y); await page.waitForTimeout(500)
      const st = await page.evaluate(() => ({ n: document.querySelectorAll('.mpw_select_list').length, flip: (document.querySelector('.mpw_select_list') || {}).getAttribute ? document.querySelector('.mpw_select_list').getAttribute('data-flip') : null, open: document.querySelectorAll('.mpw_select[data-open]').length }))
      if (st.n === 1 && st.open === 1) {
        opened = true
        ok(!!st.flip, `N5a 工具条下拉[${i}] 点开 ⇒ **恰好 1 个**列表且带 \`data-flip\``, `scope=${scope} flip=${st.flip}`)
        await page.mouse.click(hit.x, hit.y); await page.waitForTimeout(500)
        const st2 = await page.evaluate(() => ({ n: document.querySelectorAll('.mpw_select_list').length, open: document.querySelectorAll('.mpw_select[data-open]').length }))
        ok(st2.n === 0 && st2.open === 0, 'N5b **再点即关**（不是又开一个）', `list=${st2.n} open=${st2.open}`)
        break
      }
    }
    if (!opened) ok(false, 'N5a 工具条下拉点开 ⇒ 列表展开', `scope=${scope} 前 3 个都没打开（见 notes 的遮挡/命中信息）`)
  } else notes.push('N5 未测：页面上找不到 `.mpw_select`（自绘下拉没挂上）')

  ok(errs.length === 0, 'N6 整轮 0 个 pageerror', errs.slice(0, 2).join(' | '))
  console.log(`\n── 汇总：PASS=${pass} FAIL=${fail}`)
  for (const n of notes) console.log('  note: ' + n)
  process.exitCode = fail > 0 ? 1 : 0
} finally {
  try { await browser.close() } catch { /* ignore */ }
}
