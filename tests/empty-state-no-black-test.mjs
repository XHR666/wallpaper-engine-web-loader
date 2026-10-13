// tests/empty-state-no-black-test.mjs — task-18：**壁纸清除态刷新不许黑屏** + **旧 8899 落点必须被迁移**
//
// 现场（可复跑，见 docs/reports/EMPTY-STATE-NO-BLACK-20261013.md）：
//   壁纸清除掉的状态下刷新 DSH 页面 ⇒ **先挂 :8899 的渲染器页、随后跳到 :8902/webloader/**
//   （同一份渲染器页的两跳），然后两页都是**整屏黑**。
//   两跳的成因：插件 boot 的第一次 `applyFromStorage()` 读的是**浏览器本地缓存**（早于宿主
//   `GET /settings`），存量档里写死的 `:8899` 渲染器 URL 没有被迁移；宿主合并后第二次 apply 才换到 8902。
//   黑屏的成因：渲染器页取包失败（`pkgurl HTTP 404`）时顶层 catch **只写一行日志**，而画布是
//   `position:fixed;inset:0;background:#000` 的全屏元素 ⇒ 页面上没有任何一句话说明"没有壁纸"。
//
// 本判据钉住两件事（都能失败，见文末变异自证）：
//   A. 渲染器侧：**空态占位**存在、可立可撤、且"喂正常壁纸（已出首帧）时判绿"（双向）；
//   B. 插件侧：**旧 :8899 渲染器落点被迁到当前默认**，且显式设置/非回环/带路径的一字不动。
//
// 用法: node tests/empty-state-no-black-test.mjs        （纯 Node、无浏览器、无 :8902 依赖）
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, WS } from './_root.mjs'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  [' + d + ']' : '')) } else { fail++; console.error('  ✗ ' + n + (d ? '  — ' + d : '')) } }

const DEMO = path.join(ROOT, 'demo.html')
const CLIENT = path.join(WS, 'dsh-mpkg-wallpaper', 'lib', 'client.js')
const HTML0 = fs.readFileSync(DEMO, 'utf8')
const CLIENT0 = fs.readFileSync(CLIENT, 'utf8')

/** 按注释标记切一段真源码出来（与 audio-band-wiring / baseline 等用例同一套手法）。 */
function slice(src, begin, end) {
  const i = src.indexOf(begin)
  if (i < 0) throw new Error('切片起点缺失: ' + begin)
  const j = src.indexOf(end, i)
  if (j < 0) throw new Error('切片终点缺失: ' + end)
  return src.slice(i, j + end.length)
}

/* ── 空态块的装载：真源码 + 桩 DOM（`new Function` 注入 document/window/location） ── */
function makeFakeDom() {
  const byId = new Map()
  const mk = (tag) => ({
    tagName: String(tag).toUpperCase(), id: '', className: '', style: {}, _attrs: {}, _html: '', children: [], textContent: '',
    setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') { this.id = String(v); byId.set(this.id, this) } },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null },
    removeAttribute(k) { delete this._attrs[k] },
    appendChild(c) { this.children.push(c); if (c && c.id) byId.set(c.id, c); return c },
    addEventListener() {},
    querySelector(sel) { return (sel && sel[0] === '#') ? (byId.get(sel.slice(1)) || null) : null },
    set innerHTML(v) {
      this._html = String(v)
      for (const m of String(v).matchAll(/id="([^"]+)"/g)) { const c = mk('div'); c.id = m[1]; byId.set(m[1], c); this.children.push(c) }
    },
    get innerHTML() { return this._html },
  })
  const body = mk('body')
  const document = { createElement: mk, getElementById: (id) => byId.get(id) || null, body }
  return { document, byId }
}
/** 从 demo.html 里切出 MPW-EMPTYSTATE 块并用桩环境跑起来 ⇒ 拿到真 API（不是重写的副本）。 */
function loadEmptyState(html) {
  const block = slice(html, '// ═══ MPW-EMPTYSTATE-BEGIN', '// ═══ MPW-EMPTYSTATE-END ═══')
  const { document, byId } = makeFakeDom()
  const win = {}
  const fn = new Function('window', 'document', 'location', block + '\nreturn window.__mpwEmptyState;')
  const api = fn(win, document, { pathname: '/webloader/', reload() {} })
  return { api, win, document, byId }
}
/** 从 client.js 里切出 MPW-LEGACYBASE 块 ⇒ 拿到真迁移函数。 */
function loadMigration(client) {
  const block = slice(client, '/* ═══ MPW-LEGACYBASE-BEGIN', '/* ═══ MPW-LEGACYBASE-END ═══ */')
  const fn = new Function(block + '\nreturn { migrate: mpwMigrateLegacyRendererBase, TARGET: MPW_SCENE_MIGRATED_BASE, OFF: mpwLegacyBaseMigrationOff };')
  return fn()
}
/** 去掉注释 + 去掉本迁移块后的"活代码"（用于"活代码里不许再有 8899"）。 */
function liveCode(client) {
  let s = client
  try { s = s.replace(slice(s, '/* ═══ MPW-LEGACYBASE-BEGIN', '/* ═══ MPW-LEGACYBASE-END ═══ */'), '') } catch (e) {}
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/* ══════════════ 断言集（对 (html, client) 两个字符串求值 ⇒ 变异可复跑） ══════════════ */
const CHECKS = [
  /* ── A. 渲染器空态：存在 / 全屏 / 不是又一块黑 / 双向 / 接线 ── */
  { id: 'A1-block', run: (c) => c.html.includes('// ═══ MPW-EMPTYSTATE-BEGIN') && c.html.includes('// ═══ MPW-EMPTYSTATE-END ═══') },
  { id: 'A2-overlay-covers', run: (c) => { const el = loadEmptyState(c.html).api.el(); const s = el.getAttribute('style') || ''; return /position:fixed/.test(s) && /left:0/.test(s) && /top:0/.test(s) && /right:0/.test(s) && /bottom:0/.test(s) && /z-index:(\d{4,})/.test(s) } },
  { id: 'A3-not-black', run: (c) => { const dom = loadEmptyState(c.html); dom.api.show('no-source', 'pkgurl HTTP 404', '无壁纸：没有取到可渲染的场景容器'); const el = dom.byId.get('mpw-empty-state'); const style = el.getAttribute('style') || ''; const title = dom.byId.get('mpw-empty-state-title'); return /background:#0d1117/.test(style) && !/background:#000/.test(style) && !!(title && title.textContent && title.textContent.length > 0) } },
  { id: 'A4-plan-hasframe', run: (c) => loadEmptyState(c.html).api.plan({ hasFrame: true, err: 'pkgurl HTTP 404' }).show === false },
  { id: 'A5-plan-nosource', run: (c) => { const p = loadEmptyState(c.html).api.plan({ hasFrame: false, err: '❌ 启动失败: pkgurl HTTP 404' }); return p.show === true && p.kind === 'no-source' && /无壁纸/.test(p.title) } },
  { id: 'A6-plan-nowebgl', run: (c) => loadEmptyState(c.html).api.plan({ hasFrame: false, err: '❌ 无 WebGL2：本浏览器/设备**确实不支持**' }).kind === 'no-webgl' },
  { id: 'A7-plan-noframe', run: (c) => loadEmptyState(c.html).api.plan({ hasFrame: false, err: '' }).kind === 'no-frame' },
  { id: 'A8-plan-error', run: (c) => loadEmptyState(c.html).api.plan({ hasFrame: false, err: 'TypeError: boom' }).kind === 'error' },
  {
    id: 'A9-show-hide', run: (c) => {
      const { api, byId } = loadEmptyState(c.html)
      api.show('no-source', 'pkgurl HTTP 404', '无壁纸：没有取到可渲染的场景容器')
      const el = byId.get('mpw-empty-state')
      const shown = el.getAttribute('data-mpw-empty') === 'no-source' && el.style.display === 'flex' && byId.get('mpw-empty-state-title').textContent === '无壁纸：没有取到可渲染的场景容器'
      api.hide()
      const hidden = el.getAttribute('data-mpw-empty') === null && el.style.display === 'none'
      return shown && hidden
    },
  },
  {
    id: 'A10-fail-green', run: (c) => {   // 双向反例：已出首帧 ⇒ 失败的启动也不许立占位
      const { api, win, byId } = loadEmptyState(c.html)
      win.__mpwFirstFrame = 1
      const r = api.fail(new Error('pkgurl HTTP 404'))
      const el = byId.get('mpw-empty-state')
      return r.show === false && (!el || el.getAttribute('data-mpw-empty') === null)
    },
  },
  { id: 'A11-wired-boot', run: (c) => /bootInstance\(MPW_PRIMARY_INST\)\.catch\([\s\S]{0,400}?__mpwEmptyState[\s\S]{0,80}?\.fail\(/.test(c.html) },
  { id: 'A12-wired-watchdog', run: (c) => /__mpwWatchdogNote\([\s\S]{0,600}?__mpwEmptyState[\s\S]{0,60}?\.fromLog\(/.test(c.html) },
  { id: 'A13-wired-hide', run: (c) => (c.html.match(/__mpwEmptyState[\s\S]{0,40}?\.hide\(\)/g) || []).length >= 2 },

  /* ── B. 旧落点迁移 ── */
  { id: 'B1-8899-root', run: (c) => loadMigration(c.client).migrate('http://127.0.0.1:8899/?pkgurl=X&embed=1') === 'http://127.0.0.1:8902/webloader/?pkgurl=X&embed=1' },
  { id: 'B2-localhost-8899', run: (c) => loadMigration(c.client).migrate('http://localhost:8899/') === 'http://127.0.0.1:8902/webloader/' },
  { id: 'B3-already-8902', run: (c) => { const u = 'http://127.0.0.1:8902/webloader/?pkgurl=X&embed=1'; return loadMigration(c.client).migrate(u) === u } },
  { id: 'B4-non-loopback', run: (c) => { const u = 'http://10.0.0.5:8899/?pkgurl=X'; return loadMigration(c.client).migrate(u) === u } },
  { id: 'B5-8899-with-path', run: (c) => { const u = 'http://127.0.0.1:8899/elysia/scene-scripts.js'; return loadMigration(c.client).migrate(u) === u } },
  { id: 'B6-garbage-safe', run: (c) => { const m = loadMigration(c.client).migrate; return m(undefined) === undefined && m('') === '' && m('not a url') === 'not a url' && m({}) instanceof Object } },
  { id: 'B7-rollback', run: (c) => { const m = loadMigration(c.client); const u = 'http://127.0.0.1:8899/?pkgurl=X'; return m.migrate(u, { sceneBaseLegacy: true }) === u && m.OFF({ sceneBaseLegacy: true }) === true } },
  {
    id: 'B8-target-consistent', run: (c) => {   // 迁移目标必须与活代码里那个默认 base **同一个字符串**（防将来改一处忘一处）
      const t = loadMigration(c.client).TARGET
      const m = /const MPW_SCENE_DEFAULT_BASE = "([^"]+)"/.exec(c.client)
      return !!m && m[1] === t
    },
  },
  {
    id: 'B9-wired-normalize', run: (c) => {   // 接线必须在归一化里，且早退分支不能把它跳过
      const i = c.client.indexOf('function mpwNormalizeSection(s0)')
      if (i < 0) return false
      const body = c.client.slice(i, i + 6000)
      return /mpwMigrateLegacyRendererBase\(s0\.webUrl/.test(body) && /!webNeeds\)\s*return s0/.test(body)
    },
  },
  { id: 'B10-no-live-8899', run: (c) => !/(127\.0\.0\.1|localhost|\[::1\]):8899/.test(liveCode(c.client)) },
]

function runSuite(ctx) {
  const red = []
  for (const chk of CHECKS) { try { if (!chk.run(ctx)) red.push(chk.id) } catch (e) { red.push(chk.id) } }
  return red
}
const idsOf = (p) => CHECKS.map((x) => x.id).filter((i) => i.startsWith(p))
const sorted = (a) => a.slice().sort()

/* ══════════════ ① 真源码：必须全绿 ══════════════ */
console.log('\n== ① 真源码（demo.html + lib/client.js）==')
const redReal = runSuite({ html: HTML0, client: CLIENT0 })
for (const chk of CHECKS) ok(chk.id, !redReal.includes(chk.id))
console.log('  读数：断言 ' + CHECKS.length + ' 条，红 ' + redReal.length + ' 条' + (redReal.length ? ' → ' + redReal.join(',') : ''))

/* ══════════════ ② 变异自证：期望红集 == 实际红集 ══════════════ */
console.log('\n== ② 变异自证（把修复改坏 ⇒ 判据必须红；红集必须与期望逐条相等）==')
const MUTATIONS = [
  {
    name: 'M1 撤掉渲染器侧修复（删空态块 + 删全部接线）',
    mk: (c) => ({ html: c.html.replace(slice(c.html, '// ═══ MPW-EMPTYSTATE-BEGIN', '// ═══ MPW-EMPTYSTATE-END ═══'), '').split('\n').filter((l) => !l.includes('__mpwEmptyState')).join('\n'), client: c.client }),
    expect: idsOf('A'),
  },
  {
    name: 'M2 迁移函数退化成恒等（return u）',
    mk: (c) => ({ html: c.html, client: c.client.replace('return MPW_SCENE_MIGRATED_BASE.replace(/\\/+$/, "") + "/" + String(p.search || "");', 'return u;') }),
    expect: ['B1-8899-root', 'B2-localhost-8899'],
  },
  {
    name: 'M3 空态裁决的 hasFrame 分支改坏（正常壁纸也立占位）',
    mk: (c) => ({ html: c.html.replace('if (s.hasFrame) return { show: false,', 'if (false) return { show: false,'), client: c.client }),
    expect: ['A4-plan-hasframe', 'A10-fail-green'],
  },
  {
    name: 'M4 迁移目标改回旧默认 :8899',
    mk: (c) => ({ html: c.html, client: c.client.replace('const MPW_SCENE_MIGRATED_BASE = "http://127.0.0.1:8902/webloader/";', 'const MPW_SCENE_MIGRATED_BASE = "http://127.0.0.1:8899/";') }),
    expect: ['B1-8899-root', 'B2-localhost-8899', 'B8-target-consistent'],
  },
  {
    name: 'M5 归一化早退分支漏掉 webNeeds（存量档被静默跳过）',
    mk: (c) => ({ html: c.html, client: c.client.replace('if (!need && !bsNeeds && !phNeeds && !alphaFlip && !webNeeds) return s0;', 'if (!need && !bsNeeds && !phNeeds && !alphaFlip) return s0;') }),
    expect: ['B9-wired-normalize'],
  },
  {
    name: 'M6 在活代码里塞回一个 :8899 字面量',
    mk: (c) => ({ html: c.html, client: c.client.replace('function mpwNormalizeSection(s0) {', 'const MPW_STRAY_LEGACY = "http://127.0.0.1:8899/";\n\t\tfunction mpwNormalizeSection(s0) {') }),
    expect: ['B10-no-live-8899'],
  },
]
let mutBad = 0
for (const m of MUTATIONS) {
  const ctx = m.mk({ html: HTML0, client: CLIENT0 })
  const actual = sorted(runSuite(ctx))
  const expect = sorted(m.expect)
  const same = JSON.stringify(actual) === JSON.stringify(expect)
  if (!same) mutBad++
  console.log((same ? '  ✓ ' : '  ✗ ') + m.name)
  console.log('      期望红集 == 实际红集 : ' + (same ? '是' : '否') + '  期望[' + expect.join(',') + ']  实际[' + actual.join(',') + ']')
}
ok('② 全部 6 个变异体的「期望红集 == 实际红集」', mutBad === 0, '不一致 ' + mutBad + ' 个')

/* ══════════════ ③ 读数（现场取证用的两个数） ══════════════ */
console.log('\n== ③ 读数 ==')
const mig = loadMigration(CLIENT0)
console.log('  · 迁移前 :8899 落点 → ' + mig.migrate('http://127.0.0.1:8899/?pkgurl=X&embed=1'))
console.log('  · 已是当前默认       → ' + mig.migrate('http://127.0.0.1:8902/webloader/?pkgurl=X'))
console.log('  · 显式设置(带路径)   → ' + mig.migrate('http://127.0.0.1:8899/elysia/scene-scripts.js') + '（一字不动）')
const es = loadEmptyState(HTML0).api
console.log('  · 空态裁决 hasFrame=true  → ' + JSON.stringify(es.plan({ hasFrame: true, err: 'pkgurl HTTP 404' })))
console.log('  · 空态裁决 pkgurl 404     → ' + JSON.stringify(es.plan({ hasFrame: false, err: '❌ 启动失败: pkgurl HTTP 404' })))

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '：' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail === 0 ? 0 : 1)
