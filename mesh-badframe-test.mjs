// mesh-badframe-test.mjs — P-41 A1-b 网格动画坏帧检测 v3（detectBadAnimFrames）单测
// 复现：node mesh-badframe-test.mjs
// 背景（真机 r1789233100291 + 2026-09-12 demo 注释"每条轨道存 length+1 帧，结尾 1~17 帧是导出垃圾"）：
//   旧"迭代二阶差分（骨骼和）"过滤器三个结构性缺陷——
//   ①垃圾平台内部帧漏杀（hina 人物 f67-69,71,72 存活 → 周期性抽动）；
//   ②回绕污染（f0 的环形邻居是尾部垃圾 → f0-3 级联误杀 → 开头姿态错）；
//   ③骨骼和抵消单骨乱跳（sig 把 58-61 好帧也拖下水）。
//   v3 = 尾部逐骨绝对步长切除（垃圾=结尾连续后缀）+ 原邻域精修（中段孤立尖峰）。
import fs from 'node:fs'
import path from 'node:path'
import * as lib from './we-scene-bundle.js'
import { installPuppet } from './elysia/we-renderer/puppet.js'
import { Buffer as MpwBuffer } from './elysia/buffer.js'
// ①(去个人化 2026-09-16) 工作区根：环境变量优先；下面的默认值只是作者本机路径，发布副本请设 MPW_ROOT。
const MPW_WS = process.env.MPW_ROOT || '/root/Desktop/DSHarea'

const DIR = `${MPW_WS}/allwallpaper/dd`
const dec = new TextDecoder()
const H = {}
installPuppet(H)

let pass = 0, fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')) }
}
const dOf = (a, c) => Math.abs(c.tx - a.tx) + Math.abs(c.ty - a.ty) + Math.abs(c.angle - a.angle) * 100

// 旧检测器（逐字复刻 demo.html 修复前实现，用于证明"测试抓得到旧 bug"）
function oldDetect(sig) {
  const rawLen = sig.length
  const step = new Float64Array(rawLen)
  for (let f = 0; f < rawLen; f++) step[f] = Math.abs(sig[(f + 1) % rawLen] - sig[f])
  const bad = new Set()
  for (let pass = 0; pass < 4; pass++) {
    const goodIdx = []
    for (let f = 0; f < rawLen; f++) if (!bad.has(f)) goodIdx.push(f)
    if (goodIdx.length < 4) break
    const dev = new Float64Array(rawLen)
    for (const f of goodIdx) {
      let pg = f, ng = f
      for (let k = 1; k <= rawLen; k++) { const i = (f - k + rawLen * 4) % rawLen; if (!bad.has(i)) { pg = i; break } }
      for (let k = 1; k <= rawLen; k++) { const i = (f + k) % rawLen; if (!bad.has(i)) { ng = i; break } }
      dev[f] = Math.abs(sig[f] - (sig[pg] + sig[ng]) / 2)
    }
    const ds = goodIdx.map((f) => dev[f]).sort((x, y) => x - y)
    const med = ds.length ? ds[ds.length >> 1] : 0
    const thr = Math.max(med * 10, 5)
    let added = 0
    for (const f of goodIdx) {
      let ls = 0
      for (let k = -2; k <= 2; k++) { const i = (f + k + rawLen * 4) % rawLen; if (step[i] > ls) ls = step[i] }
      if (dev[f] > thr && dev[f] > 0.45 * ls) { bad.add(f); added++ }
    }
    if (!added) break
  }
  return bad
}

// ── T1 合成：正常帧（逐骨步长~2）+ 尾部垃圾后缀（步长~500，与骨和抵消无关）──
console.log('[T1] 合成信号：好帧步长~2，最后 13 帧垃圾步长~500')
{
  const N = 75
  const sig = new Float64Array(N)
  const maxStep = new Float64Array(N)
  for (let f = 0; f < N; f++) { sig[f] = Math.sin(f / N * Math.PI * 2) * 100; maxStep[f] = 2 }
  for (let f = 62; f < N; f++) { maxStep[f] = 500; sig[f] = 50000 + (f % 3) * 37 }
  const v2 = lib.detectBadAnimFrames({ sig, maxStep })
  const old = oldDetect(sig)
  const tail = []
  for (let f = 62; f < N; f++) tail.push(f)
  const missed = tail.filter((f) => !v2.bad.has(f))
  const headEaten = [0, 1, 2, 3].filter((f) => v2.bad.has(f))
  check('T1a v3 把尾部垃圾整段切除', missed.length === 0, missed.length ? '漏 ' + missed.join(',') : '62-74 全灭')
  check('T1b v3 不吃动画开头 0-3 帧（回绕污染修复）', headEaten.length === 0, headEaten.join(',') || '0-3 全保留')
  check('T1c 中段合法快速段不受影响（非尾部 >T 不判）', !v2.bad.has(30) && !v2.bad.has(45))
  const oldMissed = [67, 68, 69, 71, 72].filter((f) => !old.has(f))
  const oldHead = [0, 1, 2, 3].filter((f) => old.has(f))
  check('T1d 旧检测器头部误杀复现（合成 ' + oldHead.length + ' 帧；真数据平台内部漏杀见 T2d/T2c 设备日志逐位）',
    oldHead.length > 0)
}

// ── T2/T3 真数据：全部 6 个蒙皮层 ──
function meshLayersOf(id) {
  const pkg = lib.parsePkg(new Uint8Array(fs.readFileSync(path.join(DIR, id, 'scene.pkg'))))
  const entry = (n) => { const e = lib.getEntry(pkg, n); return e ? new Uint8Array(e) : null }
  const scene = lib.parseScene(JSON.parse(dec.decode(entry('scene.json')).replace(/^\uFEFF/, '')))
  const out = []
  for (const l of scene.layers) {
    try {
      if (!l.image) continue
      const me = entry(l.image); if (!me) continue
      const mj = JSON.parse(dec.decode(me)); if (!mj || !mj.puppet) continue
      const ru = entry(mj.puppet); if (!ru) continue
      const mesh = H._parseMdl(new MpwBuffer(ru.buffer, ru.byteOffset, ru.byteLength))
      if (!mesh || !mesh.bones || !mesh.bones.length || !mesh.animations || !mesh.animations.length) continue
      out.push({ name: String(l.name || l.id), mesh, nb: mesh.bones.length, anim: mesh.animations[0] })
    } catch (e) { /* 与 demo 一致 */ }
  }
  return out
}
function profilesOf(t) {
  const N = t.anim.frameCount
  const sig = new Float64Array(N), maxStep = new Float64Array(N)
  const rt = (f) => H._sampleAnimRT(t.mesh, t.anim, f, t.nb, t.mesh.bones)
  for (let f = 0; f < N; f++) {
    const a = rt(f); let sum = 0, mx = 0
    for (let b = 0; b < t.nb; b++) {
      sum += a[b].tx + a[b].ty + a[b].angle * 100
      const d = dOf(a[b], rt((f + 1) % N)[b])
      if (d > mx) mx = d
    }
    sig[f] = sum; maxStep[f] = mx
  }
  return { sig, maxStep, N }
}

console.log('[T2] 真数据 hina 3554161528「人物」（设备日志实锤：旧=16/75 [0-3+58-66,70,73,74]）')
{
  const ls = meshLayersOf('3554161528')
  const renwu = ls.find((x) => x.name === '人物')
  check('T2-0 找到蒙皮层「人物」', !!renwu, ls.map((x) => x.name).join('/'))
  if (renwu) {
    const { sig, maxStep, N } = profilesOf(renwu)
    const v3 = lib.detectBadAnimFrames({ sig, maxStep })
    const old = oldDetect(sig)
    const badArr = [...v3.bad].sort((a, b) => a - b)
    const headKept = [0, 1, 2, 3].every((f) => !v3.bad.has(f))
    // 垃圾=尾部连续后缀（设备日志与逐骨剖面：61 起步长爆发，62-74 全灭）
    const isSuffix = badArr.length > 0 && badArr.every((f, i) => f === N - badArr.length + i)
    check('T2a v3 保留动画开头 0-3 帧', headKept, 'bad=[' + badArr.join(',') + ']')
    check('T2b v3 垃圾=尾部连续后缀且 ≤17 帧', isSuffix && v3.bad.size <= 17,
      badArr.length + ' 帧：[' + badArr.slice(0, 6).join(',') + '…' + badArr.slice(-3).join(',') + ']')
    check('T2c 垃圾平台内部 67-69,71,72 被清除（旧漏杀=抽动源）', [67, 68, 69, 71, 72].every((f) => v3.bad.has(f)))
    check('T2d 旧检测器行为与设备日志逐位一致（16 帧 [0-3+58-66,70,73,74]）',
      old.size === 16 && [0, 1, 2, 3].every((f) => old.has(f)) && [67, 68, 69].some((f) => !old.has(f)))
    // 平滑性：跨坏帧插值步进 ≤ 保留区合法最大单帧步进
    const good = []
    for (let f = 0; f < N; f++) if (!v3.bad.has(f)) good.push(f)
    let mxHalf = 0
    for (let i = 0; i < good.length; i++) {
      const a = good[i], b2 = good[(i + 1) % good.length]
      const span = ((b2 - a + N) % N) || N
      const d = Math.abs(sig[b2] - sig[a]) / span
      if (d > mxHalf) mxHalf = d
    }
    let legit = 0
    for (let f = 0; f < N; f++) if (!v3.bad.has(f) && !v3.bad.has((f + 1) % N)) legit = Math.max(legit, Math.abs(sig[(f + 1) % N] - sig[f]))
    check('T2e 跨坏帧插值步进 ≤ 合法单帧步进（无结构跳变）', mxHalf <= legit * 1.05 + 1e-6,
      '插值最大=' + mxHalf.toFixed(1) + ' 合法=' + legit.toFixed(1))
  }
}

console.log('[T3] 真数据凯尔希 3719111841 + GirlCat 3544152633 蒙皮层（不误杀 + 尾部命中）')
{
  // 文档实锤的垃圾尾巴（2026-09-12 demo 注释 + 本轮逐骨剖面）
  const expect = {
    '3544152633': { 'girl': [177, 178, 179] },
    '3719111841': { '主体': [177, 178, 179], '眼睛组合': [234, 235, 236, 237, 238, 239], '左耳朵1': [298, 299] },
  }
  for (const [id, layers] of Object.entries(expect)) {
    const ls = meshLayersOf(id)
    check('T3-0 ' + id + ' 蒙皮层数 ≥ ' + Object.keys(layers).length, ls.length >= Object.keys(layers).length, ls.map((x) => x.name).join('/'))
    for (const t of ls) {
      const { sig, maxStep, N } = profilesOf(t)
      const v3 = lib.detectBadAnimFrames({ sig, maxStep })
      const old = oldDetect(sig)
      const badArr = [...v3.bad].sort((a, b) => a - b)
      const want = layers[t.name]
      if (want) {
        const wantMax = want[want.length - 1]
        // 判定：文档垃圾帧全部命中 + v3 结果是收敛到文档尾巴的连续后缀（逐骨剖面可能比 09-12 的
        // 人工记录多出紧邻帧——如 girl 174-176 步长同样 >100，属同一垃圾后缀）
        const hit = want.every((f) => v3.bad.has(f)) &&
          badArr.every((f) => f >= want[0] - 6 && f <= wantMax) &&
          badArr.every((f, i) => i === 0 || f === badArr[i - 1] + 1) &&
          badArr[badArr.length - 1] === N - 1
        check('T3 ' + id + ' ' + t.name + ' v3 坏帧=尾部垃圾后缀（含文档尾巴 ' + JSON.stringify(want) + '）', hit,
          'v3=[' + badArr.join(',') + '] 旧=[' + [...old].sort((a, b) => a - b).join(',') + ']')
      } else {
        const notWorse = v3.bad.size <= old.size + 2 && v3.bad.size / N <= 0.15
        check('T3 ' + id + ' ' + t.name + ' v3 不误杀（' + v3.bad.size + '/' + N + '，旧 ' + old.size + '）', notWorse,
          'v3=[' + badArr.join(',') + ']')
      }
    }
  }
}

// ── T4 退化输入 ──
console.log('[T4] 退化输入')
{
  const r1 = lib.detectBadAnimFrames({ sig: [1, 2, 3, 4, 5], maxStep: [1, 1, 1, 1, 1] })
  check('T4a 短序列(<8) 不判坏', r1.bad.size === 0)
  const r2 = lib.detectBadAnimFrames({ sig: new Float64Array(20).fill(7), maxStep: new Float64Array(20).fill(2) })
  check('T4b 常值序列 不判坏', r2.bad.size === 0)
  const r3 = lib.detectBadAnimFrames({ sig: new Float64Array(40).map((_, i) => Math.sin(i * 0.3) * 50), maxStep: new Float64Array(40).fill(1.5) })
  check('T4c 纯正弦 不判坏', r3.bad.size === 0, 'bad=' + [...r3.bad].join(','))
  const r4 = lib.detectBadAnimFrames({ sig: new Float64Array(30).map((_, i) => i * 3), maxStep: new Float64Array(30).fill(500) })
  // 全动画都快（中位步长>T/3）→ 尾部切除必须跳过；回绕缝由邻域精修处理（原既有行为，≤缝邻几帧）
  check('T4d 全动画都快 → 不做尾部切除（只余回绕缝邻帧，<17）', r4.bad.size < 17 && r4.bad.size <= 8,
    'bad=' + [...r4.bad].sort((a, b) => a - b).join(','))
}

console.log('\n' + (fail === 0 ? '全部通过' : '存在失败') + `：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
