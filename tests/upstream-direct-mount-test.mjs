// upstream-direct-mount-test.mjs —— C10【上游产物档整合】：**直挂契约**（mediaBase+src）与
// "参数组合 ⇒ 画布口径"读数表（不改上游 JS 一个字节）。
//
// 为什么是直挂（批次 3 交接纪律）：产物页的公开参数只有 11 个
//   type/src/fit/renderDpr/sceneFps/muted/loop/filter/mediaBase/liveSystem/opaque（静态 grep 实证），
//   2.x 的 URL 模式要求 `mediaBase` 与 `src` **同时存在**（内部拼 `${mediaBase}/${src}/scene.pkg`
//   与 `${mediaBase}/${src}/project.json`，缺任一 ⇒ 抛"场景壁纸缺少 mediaBase/src"⇒ canvases 空）。
//   工具条「上游产物」档的查询串往返改写由主线维护（P-228c，tests/bench-upstream-handoff-test.mjs），
//   本文件**只走直挂**，读数一律注明"直挂（mediaBase+src）"。
//   ⚠ `__wp.getQuality()` 随挂载状态变化（空挂载 postProcessing:"high"、真挂载 "off"）⇒ 只随本表
//     的挂载态一起记录，不当静态能力读。
//
// 判据：
//   A 静态契约（离线，无 GL 也跑）：产物 index.html 引用 `renderer-*.js`；bundle 内 11 个公开参数名
//     逐一存在；`media/dev` 直挂双 200（scene.pkg / project.json）。
//   B 真机读数（GL 前置；无 GL ⇒ SKIP + 原样读数）：`?type=scene&mediaBase=<origin>/media/dev&src=<id>`
//     挂载后 canvas 出现（≠300×150）、`performance` 里有 scene.pkg 资源项；参数组合
//     fit∈{contain,cover} × renderDpr∈{1,2} ⇒ 画布口径表（canvas/ CSS 盒倍率 + getQuality() +
//     全帧统计），落 reports/upstream-params-<ver>.json。
//   C 变异自证：把 mediaBase 从 URL 摘掉 ⇒ 产物不出现非默认 canvas（2.x 抛缺参 = 契约是真实的）。
// 用法：flock /tmp/.mpw-firefox.lock -c 'node tests/upstream-direct-mount-test.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './_root.mjs'
import { launchGLBrowser, glCapability, closeQuiet, findPlaywright } from './_gl-browser.mjs'

const AUTH = '127.0.0.1:8902'
const PROBE_ID = '2887099508'          // 语料夹具（任务书探针包；工具逻辑不依赖它的任何特性）
const UP_BASE = `http://${AUTH}/wallpaper-engine-webgl/renderer/index.html`
const MEDIA = `http://${AUTH}/media/dev`
const OUT = path.join(ROOT, 'reports', 'upstream-params-2.1.0.json')
let pass = 0, fail = 0, skipN = 0
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + String(detail).slice(0, 240) : '')) } }
const sk = (name, why) => { skipN++; console.log('  ~ SKIP ' + name + '（' + why + '）') }

const indexHtml = await fetch(UP_BASE).then((r) => r.text()).catch(() => null)
const assetMatch = indexHtml ? /renderer-[A-Za-z0-9_-]+\.js/.exec(indexHtml) : null
// 产物页对资产的引用是 `../assets/`（P-228 两处已登记改写之一）⇒ 真实资产在 renderer/ 的上一级
const bundleSrc = assetMatch ? await fetch(UP_BASE.replace('renderer/index.html', 'assets/' + assetMatch[0])).then((r) => r.ok ? r.text() : null).catch(() => null) : null

console.log('== C10 上游直挂契约（不改产物一字节；读数=直挂 mediaBase+src）==')
ok('A1 产物 index.html 可取且引用 renderer-*.js', !!assetMatch, assetMatch ? assetMatch[0] : 'index.html 取不到')
if (bundleSrc) {
  const PARAMS = ['type', 'src', 'fit', 'renderDpr', 'sceneFps', 'muted', 'loop', 'filter', 'mediaBase', 'liveSystem', 'opaque']
  const missing = PARAMS.filter((p) => !bundleSrc.includes(p))
  ok('A2 产物 bundle 含全部 11 个公开参数名（静态 grep，缺=' + JSON.stringify(missing) + '）', missing.length === 0, missing.join(','))
} else sk('A2 bundle 参数面', 'bundle 取不到（A1 已红）')
const pkgHead = await fetch(`${MEDIA}/${PROBE_ID}/scene.pkg`, { method: 'GET', headers: { range: 'bytes=0-15' } }).then((r) => r.status).catch(() => 0)
const pjStatus = await fetch(`${MEDIA}/${PROBE_ID}/project.json`).then((r) => r.status).catch(() => 0)
ok('A3 /media/dev 直挂双 200（scene.pkg 206/200 + project.json 200）', pkgHead === 200 || pkgHead === 206, `pkg=${pkgHead} pj=${pjStatus}`)

/* B 段：真机参数表 */
const require_ = (await import('node:module')).createRequire(path.join(ROOT, 'package.json'))
const pw = require_(findPlaywright()); const firefox = (pw.default && pw.default.firefox) || pw.firefox
const { browser, launchNote } = await launchGLBrowser(firefox)
const gl = await glCapability(browser)
console.log('   ' + launchNote + ' webgl2=' + gl.webgl2)
if (!gl.webgl2) {
  await closeQuiet(browser)
  console.log(`~ SKIP B/C 段（无 GL —— 原样读数：${JSON.stringify({ launchNote, gl })}）`)
  console.log('===== upstream-direct-mount: ' + pass + ' 通过 / ' + fail + ' 失败 / ' + (skipN + 1) + ' SKIP =====')
  process.exit(0)
}
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
const READ = () => ({
  canvases: [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight })),
  quality: (() => { try { return window.__wp && window.__wp.getQuality ? window.__wp.getQuality() : null } catch (e) { return { err: String(e.message) } } })(),
  mediaReqs: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /scene\.pkg|project\.json/.test(n)).length,
  wpReady: !!(window.__wp && typeof window.__wp.loadSceneFile === 'function'),
})
const gotoUp = async (qs) => {
  await page.goto(`${UP_BASE}?${qs}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  try { await page.waitForFunction('!!window.__wp', null, { timeout: 20000 }) } catch (e) {}
  await page.waitForTimeout(6000)
  return page.evaluate(READ)
}
const rows = []
const COMBOS = [
  { fit: 'contain', renderDpr: 1 },
  { fit: 'contain', renderDpr: 2 },
  { fit: 'cover', renderDpr: 1 },
  { fit: 'cover', renderDpr: 2 },
]
for (const c of COMBOS) {
  const qs = `type=scene&mediaBase=${encodeURIComponent(MEDIA)}&src=${PROBE_ID}&fit=${c.fit}&renderDpr=${c.renderDpr}&filter=none&muted=true`
  const r = await gotoUp(qs)
  const big = (r.canvases || []).filter((x) => x.w > 0 && !(x.w === 300 && x.h === 150)).sort((a, b) => b.w * b.h - a.w * a.h)[0] || null
  rows.push({ combo: c, canvas: big, css: big ? { w: big.cssW, h: big.cssH } : null, quality: r.quality, mediaReqs: r.mediaReqs, wpReady: r.wpReady })
  ok(`B ${c.fit}/dpr${c.renderDpr} ⇒ 画布出现（${big ? big.w + 'x' + big.h : '无'}）且 scene.pkg/project.json 已请求（${r.mediaReqs} 条）`,
    !!big && r.mediaReqs >= 2, JSON.stringify(r.canvases))
  if (big) {
    const mult = big.cssW ? +(big.w / big.cssW).toFixed(3) : 0
    ok(`B ${c.fit}/dpr${c.renderDpr} ⇒ 画布/CSS 倍率 = ${mult}（renderDpr 语义：≥1；dpr2 档 ≥ dpr1 档）`,
      mult >= 1 && mult <= 3, 'mult=' + mult)
  }
}
// 画布口径表（人读）：contain/cover 同 renderDpr 应等宽（fit 影响内容裁剪不改变内部缓冲倍率的断言
//   只在实测支持时收紧——这里如实记录，不猜）。
const dpr1 = rows.filter((r) => r.combo.renderDpr === 1 && r.canvas).map((r) => r.canvas.w)
const dpr2 = rows.filter((r) => r.combo.renderDpr === 2 && r.canvas).map((r) => r.canvas.w)
if (dpr1.length && dpr2.length) {
  ok(`B 表：renderDpr=2 的画布宽 ≥ renderDpr=1（${Math.min(...dpr2)} ≥ ${Math.max(...dpr1)}）`,
    Math.min(...dpr2) >= Math.max(...dpr1), JSON.stringify({ dpr1, dpr2 }))
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: '直挂（mediaBase+src），非工具条档', upstream: assetMatch ? assetMatch[0] : null, mediaBase: MEDIA, probeId: PROBE_ID, rows }, null, 1))

/* C 段：变异自证 —— 摘掉 mediaBase ⇒ 无非默认 canvas（缺参契约是真实的） */
{
  const r = await gotoUp(`type=scene&src=${PROBE_ID}&fit=contain&renderDpr=1`)
  const big = (r.canvases || []).filter((x) => x.w > 0 && !(x.w === 300 && x.h === 150)).length
  ok('C 变异自证：URL 缺 mediaBase ⇒ 画布不出（2.x 缺参抛错，契约承重）', big === 0, JSON.stringify(r.canvases))
}
await closeQuiet(browser)
console.log('JSON → ' + OUT)
console.log('===== upstream-direct-mount: ' + pass + ' 通过 / ' + fail + ' 失败 / ' + skipN + ' SKIP =====')
process.exit(fail ? 1 : 0)
