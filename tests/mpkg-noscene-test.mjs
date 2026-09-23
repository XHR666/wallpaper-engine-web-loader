// mpkg-noscene-test.mjs — 「没有 `scene.json` 的容器」不再抛看不懂的 TypeError 的判据。
//
// 被验的对象：`demo.html` 里夹在 `// ═══ MPW-NOSCENE-BEGIN/END ═══` 之间的那一小段（`pkg` 解析完之后、
// 无条件的 `rd(lib.getEntry(pkg, 'scene.json'))` **之前**）。
//
// 为什么需要（已取证，本文件不重新证）：全库 155 个 `.mpkg` 里 **85 个没有 `scene.json`**（其中约 75 个是
// "视频壁纸"打包）。此前它们一律落到 `rd(undefined)` ⇒ `TextDecoder.decode: Argument 1 could not be
// converted to any of: ArrayBufferView, ArrayBuffer` ⇒ 整页 `❌ 启动失败: …`，既不点明原因也不给出路
// （读数见 docs/MPKG-SWEEP-20260923.md §2/§4）。现在：有可播视频 ⇒ 按**纯视频壁纸**播（与既有
// `?video=` / `type=video` 两档同形，blob 源 + `mpwBlobMediaRetry` 看门狗）；连视频也没有 ⇒ 如实报错并
// 列出条目名。
//
// 本文件三层判据（纯 Node、不开浏览器、不读语料）：
//   S1 结构：块存在且在**无条件 decode 之前**；块内恰好一处 `throw new Error('这个容器不是场景包…')`；
//      视频选择"project.json.file 优先、条目后缀兜底"；接线看门狗；两条 `__mpwNoScene` 记账；有 `return`。
//   S2 行为：按标记切出**真实源码**，在 mock 容器/文档上跑 5 个场景（有 scene.json / 有 project.json 视频 /
//      只有条目后缀视频 / 什么都没有 / project.json 坏）。
//   S3 变异自证：隔离副本上真改真跑，断言"期望红集"**精确相等**。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ROOT } from './_root.mjs'

const FILE = fileURLToPath(import.meta.url)
const DEMO = path.join(ROOT, 'demo.html')
const html = fs.readFileSync(DEMO, 'utf8')

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')) }
}

const BEGIN = '// ═══ MPW-NOSCENE-BEGIN ═══'
const END = '// ═══ MPW-NOSCENE-END ═══'
const iBegin = html.indexOf(BEGIN), iEnd = html.indexOf(END)
const SRC = (iBegin >= 0 && iEnd > iBegin) ? html.slice(iBegin, iEnd) : ''
const lineOf = (idx) => (idx < 0 ? -1 : html.slice(0, idx).split('\n').length)
const DECODE_ANCHOR = "const sceneJson = rd(lib.getEntry(pkg, 'scene.json'));"
const iDecode = html.indexOf(DECODE_ANCHOR)

console.log('== 没有 scene.json 的容器：不是场景包也要有出路 ==')
console.log('   demo.html: 块 ' + lineOf(iBegin) + '…' + lineOf(iEnd) + ' 行（无条件 decode 在 ' + lineOf(iDecode) + ' 行）')

/* ───────────────── S1：结构 ───────────────── */
check('S1-1 MPW-NOSCENE-BEGIN/END 各恰好一次且顺序正确',
  html.split(BEGIN).length - 1 === 1 && html.split(END).length - 1 === 1 && iBegin < iEnd,
  JSON.stringify({ BEGIN: lineOf(iBegin), END: lineOf(iEnd) }))
check('S1-2 块在**无条件的** `rd(lib.getEntry(pkg, \'scene.json\'))` 之前（否则 TypeError 照旧）',
  iBegin > 0 && iDecode > iBegin && iDecode > iEnd, '块结束 ' + lineOf(iEnd) + ' < decode ' + lineOf(iDecode))
check('S1-3 先判存在：块内用 `!lib.getEntry(pkg, \'scene.json\')` 作为入口条件',
  SRC.includes("if (!lib.getEntry(pkg, 'scene.json'))"))
check('S1-4 视频选择：project.json 的 file 优先（`nsFile && lib.getEntry(pkg, nsFile)`）',
  SRC.includes('(nsFile && lib.getEntry(pkg, nsFile))'))
check('S1-5 视频选择：条目后缀兜底 `/\.(mp4|webm|mov)$/i`',
  /\\\.\(mp4\|webm\|mov\)\$\/i/.test(SRC))
check('S1-6 没有可播视频时**如实报错**（恰好一处，且点名"不是场景包"+ 列条目名）',
  (SRC.match(/throw new Error\('这个容器不是场景包：没有 scene\.json，也没有可播的视频/g) || []).length === 1 &&
  SRC.includes('（条目：\' + nsNames + \'）'),
  JSON.stringify((SRC.match(/throw new Error\([^)]*/g) || []).map((x) => x.slice(0, 40))))
check('S1-7 有视频时接 blob 媒体看门狗（`mpwBlobMediaRetry(nsV, \'视频壁纸包\')`）',
  SRC.includes("mpwBlobMediaRetry(nsV, '视频壁纸包')"))
check('S1-8 视频走 blob 源（`URL.createObjectURL(new Blob([...])`，webm 用 video/webm、其余 video/mp4）',
  SRC.includes('URL.createObjectURL(new Blob([lib.getEntry(pkg, nsEnt)]') && SRC.includes("? 'video/webm' : 'video/mp4'"))
check('S1-9 播完就 `return`（不落到场景解析：没有 scene 就没有 scene 可解析）',
  /^\s*return\s*$/m.test(SRC))
check('S1-10 两条出路都记账到 `window.__mpwNoScene`（video / error），供门禁与现场一眼看',
  SRC.includes("path: 'video'") && SRC.includes("path: 'error'"))
check('S1-11 project.json 解析失败不抛（try/catch 兜住后按后缀兜底）',
  SRC.includes("} catch (e) { /* project.json 缺失/坏"))
check('S1-12 条目大小上限在位（256MiB；超限如实拒绝并说明出路，不是静默照播）',
  SRC.includes('const nsMax = 256 << 20') && SRC.includes("path: 'too-big'") && SRC.includes('超过本页内存内播放上限'))
check('S1-13 多实例网格里非主实例不铺整页视频（`typeof PAGE === \'undefined\' || PAGE` 守卫 + 如实报错）',
  SRC.includes("if (!(typeof PAGE === 'undefined' || PAGE))") && SRC.includes("path: 'grid-unsupported'"))

/* ───────────────── S2：行为（跑真实源码） ───────────────── */
function runBranch({ entries, projectJson, page = true }) {
  /* entries 的值可以是 true（1 字节）或数字（该条目的字节数）—— 用来量"大小上限"那一档。 */
  const logs = [], retry = [], listeners = {}, appended = []
  const el = {
    style: { cssText: '' }, autoplay: false, loop: false, muted: false, playsInline: false, src: '', error: null,
    videoWidth: 0, videoHeight: 0,
    setAttribute() {}, addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f) },
    load() { el.loads = (el.loads || 0) + 1 },
    play() { el.plays = (el.plays || 0) + 1; return { catch() {} } },
  }
  const document = { createElement: () => el, body: { appendChild: (x) => appended.push(x) } }
  const win = {}
  const enc = new TextEncoder()
  const enc1 = new TextEncoder()
  const lib = {
    getEntry: (_pkg, name) => {
      if (name === 'scene.json') return entries['scene.json'] ? enc1.encode('{}') : null
      if (name === 'project.json') return projectJson == null ? null : enc.encode(projectJson)
      return entries[name] ? enc.encode('BYTES') : null
    },
  }
  const pkg = { magic: 'PKGM0014', entries: Object.keys(entries).map((n) => ({ name: n, size: typeof entries[n] === 'number' ? entries[n] : 1 })) }
  let outcome = 'continuation', thrown = null
  const fn = new Function('pkg', 'lib', 'rd', 'logf', 'document', 'URL', 'Blob', 'window', 'PAGE',
    'applyVideoFrameBox', 'mpwSyncVideoRates', 'mpwBlobMediaRetry',
    SRC + '\n;return "CONTINUATION";')
  try {
    const r = fn(pkg, lib, (u8) => new TextDecoder().decode(u8), (m) => logs.push(String(m)), document,
      { createObjectURL: () => 'blob:mock' }, class { constructor() {} }, win, page,
      () => {}, () => {}, (e, label) => retry.push({ el: e, label }))
    if (r === 'CONTINUATION') outcome = 'continuation'
    else if (r === undefined && win.__mpwNoScene && win.__mpwNoScene.path === 'video') outcome = 'video-return'
  } catch (e) { thrown = e; outcome = 'threw' }
  return { logs, retry, listeners, appended, el, win, outcome, thrown }
}

{
  const a = runBranch({ entries: { 'scene.json': true, 'a.png': true } })
  check('S2-A 有 scene.json ⇒ 整块不介入（继续走场景解析，不建视频、不报错、无记账）',
    a.outcome === 'continuation' && !a.win.__mpwNoScene && a.retry.length === 0 && a.thrown === null, a.outcome)

  const b = runBranch({ entries: { 'preview.jpg': true, 'project.json': true, 'wallpaper.mp4': true }, projectJson: '{"file":"wallpaper.mp4"}' })
  check('S2-B 没有 scene.json + project.json.file 指到视频 ⇒ 按纯视频壁纸播（记账 video + 接线看门狗 + return）',
    b.outcome === 'video-return' && b.win.__mpwNoScene.entry === 'wallpaper.mp4' && b.retry.length === 1 &&
    b.retry[0].label === '视频壁纸包' && b.appended.length === 1 && b.el.src === 'blob:mock',
    JSON.stringify({ outcome: b.outcome, ns: b.win.__mpwNoScene, retry: b.retry.map((r) => r.label) }))
  check('S2-B2 视频真的是 blob 源且带 loop/muted/playsinline（与既有纯视频两档同形）',
    b.el.loop === true && b.el.muted === true && b.el.playsInline === true && b.el.loads === 1 && b.el.plays === 1)
  check('S2-B3 日志如实写明"不是场景包 ⇒ 按纯视频壁纸播放"并列出条目',
    b.logs.some((l) => l.includes('没有 scene.json') && l.includes('纯视频壁纸')) && b.logs.some((l) => l.includes('条目：')),
    JSON.stringify(b.logs.slice(0, 3)))

  const c = runBranch({ entries: { 'preview.jpg': true, 'movie.webm': true } })
  check('S2-C 没有 project.json ⇒ 按条目后缀兜底（movie.webm ⇒ video/webm）',
    c.outcome === 'video-return' && c.win.__mpwNoScene.entry === 'movie.webm' && c.retry.length === 1,
    JSON.stringify({ entry: c.win.__mpwNoScene && c.win.__mpwNoScene.entry }))

  const d = runBranch({ entries: { 'a.txt': true, 'b.dat': true } })
  check('S2-D 连视频也没有 ⇒ 抛**点明原因**的错（不是 TypeError），消息里带条目名，并记账 error',
    d.outcome === 'threw' && /不是场景包/.test(d.thrown.message) && /a\.txt/.test(d.thrown.message) &&
    d.win.__mpwNoScene && d.win.__mpwNoScene.path === 'error' && d.retry.length === 0,
    d.thrown ? d.thrown.message.slice(0, 90) : '(没抛)')
  check('S2-D2 那句错里**不再**出现 TextDecoder/decode（旧形状）',
    d.thrown && !/TextDecoder|decode:/.test(d.thrown.message))

  const e = runBranch({ entries: { 'v.mp4': true }, projectJson: '{坏 JSON' })
  check('S2-E project.json 是坏 JSON ⇒ 不抛、按后缀兜底播 v.mp4', e.outcome === 'video-return' && e.win.__mpwNoScene.entry === 'v.mp4',
    JSON.stringify({ outcome: e.outcome, entry: e.win.__mpwNoScene && e.win.__mpwNoScene.entry }))

  const f = runBranch({ entries: { 'huge.mp4': 791.5 * 1048576 } })
  check('S2-F 视频条目超过 256MiB ⇒ **如实拒绝**（点名大小与上限 + 出路），不复制成 blob、不建元素',
    f.outcome === 'threw' && /超过本页内存内播放上限/.test(f.thrown.message) && /791\.5MB/.test(f.thrown.message) &&
    f.win.__mpwNoScene && f.win.__mpwNoScene.path === 'too-big' && f.win.__mpwNoScene.limit === 268435456 &&
    f.appended.length === 0 && f.retry.length === 0, f.thrown ? f.thrown.message.slice(0, 110) : '(没抛)')

  const h = runBranch({ entries: { 'v.mp4': true }, page: false })
  check('S2-H 多实例网格里的**非主实例**（PAGE=false）⇒ 如实报错（不用整页视频盖住网格），记账 grid-unsupported',
    h.outcome === 'threw' && /多实例网格只渲染场景包/.test(h.thrown.message) && h.win.__mpwNoScene &&
    h.win.__mpwNoScene.path === 'grid-unsupported' && h.appended.length === 0, h.thrown ? h.thrown.message.slice(0, 90) : '(没抛)')

  const g = runBranch({ entries: { 'mid.mp4': 96 * 1048576 } })
  check('S2-G 96MiB（中位数附近）⇒ 照播，并在日志里写明大小 + 峰值提示',
    g.outcome === 'video-return' && g.logs.some((l) => /96\.0MB/.test(l)) && g.logs.some((l) => /峰值约 2 倍/.test(l)),
    JSON.stringify(g.logs.slice(0, 3)))
}

/* ───────────────── S3：变异自证（隔离副本真改真跑） ───────────────── */
const MUTANTS = [
  { id: 'guard-removed', expect: ['S1', 'S2'], edit: (s) => s.replace(SRC, '') },
  /* 把"如实报错"换成静默 return：S1-6（恰好一处 throw）与 S2-D（抛点明原因的错）**都**该红 ——
     期望集就按这两组写死（第一版我写成只 S2，被实测纠正：结构判据本来就钉着那句 throw）。 */
  { id: 'silent-return', expect: ['S1', 'S2'], edit: (s) => s.replace(/throw new Error\('这个容器不是场景包[^\n]*\n/, "return\n") },
  { id: 'no-retry-wire', expect: ['S1', 'S2'], edit: (s) => s.replace(/\n\s*try \{ mpwBlobMediaRetry\(nsV, '视频壁纸包'\) \} catch \(e\) \{\}\n/, '\n') },
]
if (!process.argv.includes('--no-mutations')) {
  console.log('== S3 变异自证（隔离副本；真树不动）==')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-noscene-'))
  for (const m of MUTANTS) {
    const root = path.join(tmp, m.id)
    fs.mkdirSync(root, { recursive: true })
    const mutated = m.edit(html)
    if (mutated === html) { check('S3 ' + m.id + ' 变异真的改到了（锚点未命中 ⇒ 判据腐烂）', false); continue }
    fs.writeFileSync(path.join(root, 'demo.html'), mutated)
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(root, 'package.json'))
    const r = spawnSync(process.execPath, [FILE, '--no-mutations'], { encoding: 'utf8', env: { ...process.env, MPW_REPO_ROOT: root } })
    const groups = new Set((r.stdout || '').split('\n').filter((l) => l.includes('✗')).map((l) => (/✗\s*(S\d)/.exec(l) || [])[1]).filter(Boolean))
    const got = [...groups].sort(), want = [...m.expect].sort()
    check('S3 ' + m.id + '：期望红集精确相等', JSON.stringify(got) === JSON.stringify(want), '期望 ' + JSON.stringify(want) + ' 实际 ' + JSON.stringify(got) + ' exit=' + r.status)
    if (JSON.stringify(got) === JSON.stringify(want)) console.log('    MUTANT-RED-OK ' + m.id + ' 红集=' + JSON.stringify(got))
  }
  const sha = spawnSync('sha256sum', [DEMO], { encoding: 'utf8' }).stdout.split(' ')[0]
  check('S3 真树 demo.html 未被变异触碰（变异只写隔离副本）', html === fs.readFileSync(DEMO, 'utf8'), sha.slice(0, 12))
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('\n===== mpkg-noscene: ' + pass + ' 通过 / ' + fail + ' 失败 =====')
process.exit(fail ? 1 : 0)
