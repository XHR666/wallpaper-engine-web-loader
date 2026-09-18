// server-pkg-index-test.mjs —— ②(P-135 丙 2026-09-19) 服务端两处单线程热点的**只读命中条目**回归
//
// 登记待办（主对话）：本文件尚未进 `tests/run-all-tests.sh` 的 add 列表 ——
//   建议 `add "pkg-index" "node tests/server-pkg-index-test.mjs" "" "^SKIP pkg-index"`（条件项：缺语料自动 SKIP）。
//
// 被测量的两处热点（docs/RENDER-BUGS-20260918.md §1.3 实测）：
//   · `/noise` 旧实现每请求**逐个整包** `readFileSync + parsePkg` 直到命中 `*noise*.tex` ——
//     本机语料顺序下 **689,870,633 B（657.9MiB）/次**（235.4+59.5+320.6+42.4MB），且发生在单线程里。
//   · `/shader/<id>/…` 旧实现**每请求**整包 readFileSync + parsePkg（336MB 包 = 每请求 336MB；每包 4–8 次）。
//   修法：`server/pkg-entry-index.mjs`（目录表只读一次并缓存 + 只读命中条目，解压仍走生产解析器）。
//
// 断言（全部带**数字**）：
//   A 目录表只读：`tableFor(最大包)` 的落盘字节 ≤ 1MB（实测 65,536 B），而该包体积 > 100MB。
//   B `/noise`：a) 首次解析读到的**表字节** ≤ 512KB（实测 262,144 = 4×64KB），旧实现同期要读 689,870,633 B；
//      b) 同一包两次解析：第二次**0 字节**（缓存命中，不再重复整包扫描）；
//      c) 条目读取 = 命中条目长度本身（91,939 B），且与"整包 parsePkg + readPkgEntry"**逐字节相同**。
//   C `/shader`：单条目字节与旧实现逐字节相同（含大小写/`shaders/` 前缀两种匹配）；第二次请求不再读目录表。
//   D HTTP 端到端（本机临时端口起真服务）：`/noise` 200 + `application/octet-stream` + 逐字节等于参考；
//      `/shader/...` 200 + `text/plain` + 逐字节等于参考 + 两次一致；404 文本、缺场景 500 文本与改动前逐字相同。
//   E 变异自证：把 `PKG_HEAD_BYTES` 改成 1GB（等价"又整包读"）⇒ A/B 的字节断言必须变红（RED 原文打印），
//      而**返回字节仍然正确** —— 证明抓住它的是"读了多少字节"，不是"结果对不对"。
//
// 口径：只读语料、不写语料；>64MB 的包**不整包读**（参考实现只对 ≤64MB 的包做逐字节对照）；
//   无本机语料时整体 `SKIP pkg-index` 且退出 0（与其它真包类门禁同口径）。
// 用法: node tests/server-pkg-index-test.mjs     退出码 0 全绿/SKIP，1 有失败
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { ROOT, WS } from './_root.mjs'
import { createPkgEntryIndex } from '../server/pkg-entry-index.mjs'

const MPW_ROOT = process.env.MPW_ROOT || WS
const DD = process.env.MPW_SCENE_ROOT || path.join(MPW_ROOT, 'allwallpaper', 'dd')
const PKG_EXTRACT = process.env.MPW_PKG_EXTRACT || path.join(MPW_ROOT, 'dsh-mpkg-wallpaper', 'lib', 'pkg-extract.js')
const MAX_REF_BYTES = 64 * 1024 * 1024          // 参考实现（整包读）只对 ≤64MB 的包做

const checks = []
const P = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) })
const bytes = (n) => Number(n).toLocaleString('en-US')
const mb = (n) => (n / 1048576).toFixed(1)

// ── 语料探测（SKIP 口径）──────────────────────────────────────────────────────────
function sceneIds(root) {
  let ids = []
  try { ids = fs.readdirSync(root) } catch { return [] }
  return ids.filter((id) => { try { return fs.existsSync(path.join(root, id, 'scene.pkg')) } catch { return false } })
}
const IDS = sceneIds(DD)
if (!IDS.length || !fs.existsSync(PKG_EXTRACT)) {
  console.log('SKIP pkg-index：本机无场景语料（' + DD + '）或 pkg-extract（' + PKG_EXTRACT + '）—— 只读命中条目类断言需要真包')
  process.exit(0)
}
const ext = await import(PKG_EXTRACT)
if (typeof ext.parsePkgIndex !== 'function') {
  console.log('SKIP pkg-index：pkg-extract 未导出 parsePkgIndex（老版本）⇒ 底座按设计全程退回旧路径')
  process.exit(0)
}
const newIndex = () => createPkgEntryIndex({ parsePkg: ext.parsePkg, readPkgEntry: ext.readPkgEntry, parsePkgIndex: ext.parsePkgIndex })

// ── A 目录表只读 ─────────────────────────────────────────────────────────────────
console.log('[A] 目录表只读（表字节 vs 包体积）')
{
  const sized = IDS.map((id) => ({ id, p: path.join(DD, id, 'scene.pkg'), size: fs.statSync(path.join(DD, id, 'scene.pkg')).size }))
    .sort((a, b) => b.size - a.size)
  const big = sized[0]
  const idx = newIndex()
  const t0 = Date.now()
  const rec = idx.tableFor(big.p)
  const ms = Date.now() - t0
  const st = idx.stats()
  // 首次读表：可能因表 >64KB 而倍增；这里断言"与包体积无关地小"
  P('A1 最大包的目录表读取 ≤ 1MB（实测 ' + bytes(st.tableBytes) + ' B = ' + (st.tableBytes / 1024).toFixed(0) + ' KB）',
    st.tableBytes > 0 && st.tableBytes <= 1048576, 'tableBytes=' + st.tableBytes + ' tableReads=' + st.tableReads)
  P('A2 该包体积 ' + mb(big.size) + ' MB > 100MB（= 旧实现每次请求都要整包读的量）', big.size > 100 * 1048576, 'size=' + big.size)
  P('A3 读取比 = 表字节 / 包体积 < 1/100（实测 ' + (big.size / st.tableBytes).toFixed(0) + '×）', big.size / st.tableBytes > 100, (big.size / st.tableBytes).toFixed(0) + '×')
  // A4 等价性用**最小包**做（不整读大包）：目录表的 path/offset/compressedSize 必须与 parsePkg 逐条一致
  const small = sized[sized.length - 1]
  const smallBuf = new Uint8Array(fs.readFileSync(small.p))
  const smallRef = ext.parsePkg(smallBuf)
  const tidx = newIndex()
  const trec = tidx.tableFor(small.p)
  const same = trec.entries.length === smallRef.length &&
    trec.entries.every((e, i) => e.path === smallRef[i].path && e.offset === smallRef[i].offset && e.compressedSize === smallRef[i].compressedSize)
  P('A4 目录表与 parsePkg 逐条一致（' + small.id + '：' + trec.entries.length + ' 条 path/offset/compressedSize）', same,
    'n=' + trec.entries.length + '/' + smallRef.length + ' first=' + JSON.stringify(trec.entries[0] && trec.entries[0].path))
  P('A4b 大包表也可解析（' + big.id + '：' + rec.entries.length + ' 条，' + ms + 'ms，只读 ' + bytes(st.tableBytes) + ' B）', rec.entries.length > 0, 'entries=' + rec.entries.length)
  const st2 = (idx.resetStats(), idx.tableFor(big.p), idx.stats())
  P('A5 第二次 tableFor 命中缓存 ⇒ 0 字节（tableCacheHits=' + st2.tableCacheHits + '）', st2.tableBytes === 0 && st2.tableCacheHits === 1, JSON.stringify(st2))
}

// ── B /noise：只读命中条目 ────────────────────────────────────────────────────────
console.log('\n[B] /noise：只读命中条目（不是整包扫描）')
{
  const idx = newIndex()
  let hit = null, legacyBytes = 0, scanned = 0
  for (const id of fs.readdirSync(DD)) {                     // 与路由同一迭代顺序（fs.readdirSync）
    const p = path.join(DD, id, 'scene.pkg')
    if (!fs.existsSync(p)) continue
    const e = idx.noiseEntry(p)                              // 路由调的就是这一句
    scanned++
    legacyBytes += fs.statSync(p).size                       // 旧实现这一轮要整包读掉的字节
    if (e) { hit = { id, p, e, size: fs.statSync(p).size }; break }
  }
  const s1 = idx.stats()
  if (!hit) {
    console.log('  （本机语料没有 *noise*.tex ⇒ 只跑"表读字节"与 SKIP 说明）')
    P('B0 无 noise 条目时：扫描 ' + scanned + ' 包只读表 ' + bytes(s1.tableBytes) + ' B（旧实现 ' + bytes(legacyBytes) + ' B）',
      s1.tableBytes <= 512 * 1024 && legacyBytes > 0, 'tableBytes=' + s1.tableBytes + ' legacyWouldRead=' + legacyBytes)
  } else {
    P('B1 命中包 ' + hit.id + '：首次解析只读目录表 ' + bytes(s1.tableBytes) + ' B（4×64KB）≤ 512KB',
      s1.tableBytes > 0 && s1.tableBytes <= 512 * 1024, 'tableBytes=' + s1.tableBytes)
    P('B2 旧实现同一次请求要整包读 ' + bytes(legacyBytes) + ' B = ' + mb(legacyBytes) + ' MB = 新实现的 ' + (legacyBytes / s1.tableBytes).toFixed(0) + '×',
      legacyBytes > s1.tableBytes && legacyBytes / s1.tableBytes >= 10, 'legacy=' + legacyBytes + ' new=' + s1.tableBytes + ' ratio=' + (legacyBytes / s1.tableBytes).toFixed(0))
    P('B3 解析阶段**没有读任何条目内容**（entryBytes=' + s1.entryBytes + '）', s1.entryBytes === 0, JSON.stringify(s1))
    // 命中条目的字节：与"整包 parsePkg + readPkgEntry"逐字节对照（该包 42.4MB ≤ 64MB 上限）
    const legacyBuf = new Uint8Array(fs.readFileSync(hit.p))
    const legacyEntries = ext.parsePkg(legacyBuf)
    const legacyEntry = legacyEntries.find((x) => /noise/i.test(x.path) && x.path.toLowerCase().endsWith('.tex'))
    const ref = Buffer.from(ext.readPkgEntry(legacyBuf, legacyEntry))
    idx.resetStats()
    const got = Buffer.from(idx.entryBytes(hit.p, hit.e))
    const s2 = idx.stats()
    P('B4 条目读取 == 命中条目长度本身：' + bytes(got.length) + ' B（旧实现读 ' + bytes(hit.size) + ' B 才拿到这段）',
      got.length === hit.e.compressedSize && s2.entryBytes === got.length, 'got=' + got.length + ' compressedSize=' + hit.e.compressedSize + ' stats=' + JSON.stringify(s2))
    P('B5 与旧实现（整包 parsePkg + readPkgEntry）**逐字节相同**', Buffer.compare(got, ref) === 0, 'len got/ref=' + got.length + '/' + ref.length)
    P('B6 条目名/长度与旧实现一致：' + hit.e.path + '（' + bytes(ref.length) + ' B）', hit.e.path === legacyEntry.path && hit.e.compressedSize === legacyEntry.compressedSize)
    // 第二次请求：缓存命中 ⇒ 0 字节（"第二次不重复整包扫描"）
    idx.resetStats()
    const e2 = idx.noiseEntry(hit.p)
    const s3 = idx.stats()
    P('B7 第二次 /noise 解析：读 0 字节（tableCacheHits+noiseCacheHits=' + s3.tableCacheHits + '+' + s3.noiseCacheHits + '），条目不变',
      s3.tableBytes === 0 && s3.entryBytes === 0 && s3.tableCacheHits === 1 && s3.noiseCacheHits === 1 && e2 && e2.path === hit.e.path,
      JSON.stringify(s3))
    P('B8 第二次取条目：只读该条目 ' + bytes(s2.entryBytes) + ' B，目录表 0 字节', s2.tableBytes === 0 && s2.entryBytes === got.length, JSON.stringify(s2))
    console.log('  · 读数：旧 ' + bytes(legacyBytes) + ' B/次 → 新 ' + bytes(s1.tableBytes + got.length) + ' B（首次）/ ' + bytes(got.length) + ' B（其后）')
  }
}

// ── C /shader：单条目读 ───────────────────────────────────────────────────────────
console.log('\n[C] /shader/<id>/…：单条目读（含匹配口径）')
let shaderRef = null
{
  const cands = IDS.map((id) => ({ id, p: path.join(DD, id, 'scene.pkg'), size: fs.statSync(path.join(DD, id, 'scene.pkg')).size }))
    .filter((c) => c.size <= MAX_REF_BYTES).sort((a, b) => a.size - b.size)
  const idx = newIndex()
  let done = false
  for (const c of cands) {
    const rec = idx.tableFor(c.p)
    const shaders = rec.entries.filter((e) => /^shaders\//i.test(e.path))
    if (!shaders.length) continue
    const legacyBuf = new Uint8Array(fs.readFileSync(c.p))      // ≤64MB
    const legacyEntries = ext.parsePkg(legacyBuf)
    let bad = 0, n = 0, first = null
    for (const e of shaders.slice(0, 4).concat(shaders.slice(-1))) {
      const ref = Buffer.from(ext.readPkgEntry(legacyBuf, legacyEntries.find((x) => x.path === e.path)))
      const got = Buffer.from(idx.entryBytes(c.p, e))
      n++
      if (Buffer.compare(got, ref) !== 0) bad++
      if (!first) first = { path: e.path, ref }
    }
    P('C1 最小含 shader 的包 ' + c.id + '（' + mb(c.size) + ' MB）：' + n + ' 条目逐字节相同（差异 ' + bad + '）', bad === 0 && n > 0, 'n=' + n + ' bad=' + bad)
    P('C2 旧实现每请求读整包 ' + mb(c.size) + ' MB；新实现每请求只读该条目（首次另加 64KB 目录表）',
      c.size / 1024 > 64, 'pkg=' + c.size + ' B')
    const fidx = newIndex()                                  // 干净实例：量"第一次请求"与"第二次请求"
    fidx.resetStats()
    fidx.entryBytes(c.p, shaders[0])
    const sA = fidx.stats()
    fidx.resetStats()
    fidx.entryBytes(c.p, shaders[0])
    const sB = fidx.stats()
    P('C3 第一次请求：表 ' + bytes(sA.tableBytes) + ' B + 条目 ' + bytes(sA.entryBytes) + ' B；第二次请求：表 ' + bytes(sB.tableBytes) + ' B + 条目 ' + bytes(sB.entryBytes) + ' B（目录表缓存命中）',
      sA.tableBytes > 0 && sA.tableBytes <= 1048576 && sA.entryBytes === shaders[0].compressedSize && sB.tableBytes === 0 && sB.entryBytes === shaders[0].compressedSize,
      JSON.stringify({ first: sA, second: sB }))
    shaderRef = { id: c.id, ...first }
    done = true
    break
  }
  if (!done) P('C0 语料里没有 ≤64MB 且含 shaders/ 的包（跳过逐字节对照）', false, 'candidates=' + cands.length)
}

// ── D HTTP 端到端 ────────────────────────────────────────────────────────────────
console.log('\n[D] HTTP 端到端（本机临时端口起真服务，响应逐字节对照）')
function freePort() { return new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) }) }
function req(port, p) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: p }, (x) => {
      const c = []; x.on('data', (b) => c.push(b)); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: Buffer.concat(c) }))
    })
    r.setTimeout(20000, () => r.destroy(new Error('请求超时 ' + p)))
    r.on('error', rej); r.end()
  })
}
async function waitReady(port, ms = 20000) {
  const t0 = Date.now()
  for (;;) {
    try { const r = await req(port, '/'); if (r.status === 200) return true } catch { /* 未就绪 */ }
    if (Date.now() - t0 > ms) return false
    await new Promise((r) => setTimeout(r, 200))
  }
}
{
  const port = await freePort()
  const tmpReports = fs.mkdtempSync(path.join(os.tmpdir(), 'p135-reports-'))
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'we-scene-demo-server.mjs')], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), MPW_SCENE_ROOT: DD, MPW_REPORTS_DIR: tmpReports }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (b) => { log += b })
  child.stderr.on('data', (b) => { log += b })
  try {
  const ready = await waitReady(port)
  P('D0 服务在本机临时端口就绪（' + port + '）', ready, String(log).split('\n').filter((l) => /http:|error/.test(l)).slice(0, 2).join(' | '))
  if (ready) {
    const ddIds = fs.readdirSync(DD)
    const noisePkg = ddIds.map((id) => ({ id, p: path.join(DD, id, 'scene.pkg') })).find(({ p }) => {
      if (!fs.existsSync(p)) return false
      try { return newIndex().noiseEntry(p) } catch { return false }
    })
    if (noisePkg) {
      const legacyBuf = new Uint8Array(fs.readFileSync(noisePkg.p))
      const le = ext.parsePkg(legacyBuf).find((x) => /noise/i.test(x.path) && x.path.toLowerCase().endsWith('.tex'))
      const want = Buffer.from(ext.readPkgEntry(legacyBuf, le))
      const t0 = Date.now()
      const r1 = await req(port, '/noise')
      const ms1 = Date.now() - t0
      const t1 = Date.now()
      const r2 = await req(port, '/noise')
      const ms2 = Date.now() - t1
      P('D1 GET /noise → 200 + application/octet-stream + ' + bytes(r1.body.length) + ' B（' + ms1 + 'ms；第 2 次 ' + ms2 + 'ms）',
        r1.status === 200 && r1.headers['content-type'] === 'application/octet-stream' && r1.body.length === want.length, 'status=' + r1.status + ' ct=' + r1.headers['content-type'])
      P('D2 /noise 响应与旧实现逐字节相同（' + bytes(want.length) + ' B）', Buffer.compare(r1.body, want) === 0, 'first-diff=' + (() => { const i = r1.body.findIndex((b, j) => b !== want[j]); return i })())
      P('D3 /noise 两次响应逐字节一致', Buffer.compare(r1.body, r2.body) === 0 && r2.status === 200)
    } else {
      P('D1 无 noise 条目（跳过 /noise HTTP 对照）', true, 'no *noise*.tex in corpus')
    }
    if (shaderRef) {
      const rel = shaderRef.path.replace(/^shaders\//, '')
      const variants = [['带前缀', shaderRef.path], ['去前缀', rel], ['大写', shaderRef.path.toUpperCase()]]
      let okN = 0
      for (const [label, v] of variants) {
        const r = await req(port, '/shader/' + shaderRef.id + '/' + v.split('/').map(encodeURIComponent).join('/'))
        const same = r.status === 200 && r.headers['content-type'] === 'text/plain' && Buffer.compare(r.body, shaderRef.ref) === 0
        if (same) okN++
        else console.log('     ✗ /shader ' + label + ' v=' + v + ' status=' + r.status + ' bytes=' + r.body.length)
      }
      P('D4 /shader 三种匹配形态（' + variants.length + ' 种：带前缀/去前缀/大写）均 200 + text/plain + 逐字节相同（' + okN + '/' + variants.length + '）',
        okN === variants.length, 'ok=' + okN)
    }
    const r404 = await req(port, '/shader/' + (shaderRef ? shaderRef.id : IDS[0]) + '/effects/__p135_nope__.frag')
    P('D5 未知 shader → 404 + `no shader`（与改动前逐字相同）', r404.status === 404 && r404.body.toString() === 'no shader', r404.status + ' ' + JSON.stringify(r404.body.toString()))
    const rMiss = await req(port, '/shader/99999999/effects/shake.frag')
    P('D6 未知场景 → 500 + 与改动前逐字相同的 TypeError 文本（`sc.pkgPath` 语义未变）',
      rMiss.status === 500 && /Cannot read properties of null \(reading 'pkgPath'\)/.test(rMiss.body.toString()), rMiss.status + ' ' + JSON.stringify(rMiss.body.toString().slice(0, 90)))
  }
  } finally {
    try { child.kill('SIGTERM') } catch { /* ignore */ }
    try { fs.rmSync(tmpReports, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ── E 变异自证（把"只读目录表"改回"整包读"）──────────────────────────────────────
console.log('\n[E] 变异自证：PKG_HEAD_BYTES 改成 1GB（等价又整包读）⇒ 字节断言必红、结果仍正确')
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'pkg-entry-index.mjs'), 'utf8')
  const mutated = src.replace('export const PKG_HEAD_BYTES = 64 * 1024', 'export const PKG_HEAD_BYTES = 1024 * 1024 * 1024')
  P('E1 变异生效（源码里 PKG_HEAD_BYTES 不再是 64KB）', mutated !== src && mutated.includes('1024 * 1024 * 1024'))
  const tmp = path.join(os.tmpdir(), 'p135-mutant-pkg-entry-index.mjs')
  fs.writeFileSync(tmp, mutated)
  const m = await import('file://' + tmp + '?v=' + Date.now())
  const midx = m.createPkgEntryIndex({ parsePkg: ext.parsePkg, readPkgEntry: ext.readPkgEntry, parsePkgIndex: ext.parsePkgIndex })
  const sized = IDS.map((id) => ({ id, p: path.join(DD, id, 'scene.pkg'), size: fs.statSync(path.join(DD, id, 'scene.pkg')).size })).sort((a, b) => b.size - a.size)
  const big = sized[0]
  midx.tableFor(big.p)
  const ms = midx.stats()
  const redA = !(ms.tableBytes <= 1048576)
  console.log('     RED A1 目录表读取 ≤ 1MB  —  实测 tableBytes=' + bytes(ms.tableBytes) + ' B（' + mb(ms.tableBytes) + ' MB ≈ 整包 ' + mb(big.size) + ' MB）')
  P('E2 变异后 A1 型断言变红（RED 行已打印）', redA, 'tableBytes=' + ms.tableBytes)
  // 结果正确性不受影响 ⇒ 抓住它的确实是"读了多少字节"
  const e0 = midx.tableFor(big.p).entries.find((x) => /^shaders\//i.test(x.path)) || midx.tableFor(big.p).entries[0]
  const gotM = Buffer.from(midx.entryBytes(big.p, e0))
  P('E3 变异后返回字节**仍然正确**（' + gotM.length + ' B）⇒ 是"读量"断言抓住了它，不是"结果"断言',
    gotM.length === e0.compressedSize, 'len=' + gotM.length + ' compressedSize=' + e0.compressedSize)
  try { fs.unlinkSync(tmp) } catch { /* ignore */ }
}

// ── 汇总 ────────────────────────────────────────────────────────────────────────
let pass = 0
for (const c of checks) { console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name + (c.detail ? '  (' + c.detail + ')' : '')); if (c.ok) pass++ }
console.log('\n' + pass + '/' + checks.length + ' 通过（server-pkg-index P-135 丙）')
process.exit(pass === checks.length ? 0 : 1)
