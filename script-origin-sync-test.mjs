// script-origin-sync-test.mjs — RE-28 脚本 origin 同步回归测试（离线复现设备症状）
//
// 事故（用户："现在的渲染还是有问题"）：
//   3719111841 在浏览器里只剩几个 mesh 层可见（主体/耳朵/眼睛），所有带 attachment 的**图片层**
//   （头发/衣袖/发片/飘带…）整体飞出画面，背景为清屏灰。设备上报的 DIAG 行是铁证：
//     右侧发@(67,2675) | 底发@(-277,1719) | 衣袖@(-517,2661)   ← 与 **raw authored origin** 逐位相同
//   而 parseScene（父链+附件锚点）算出的是 (2575,743)/(2284,342)/(1948,1965)。
//
//   根因：demo.html 的 RE-28 同步把 raw.origin **直接赋值**给 l.origin，等于把 parseScene 加上去的
//   附件锚点偏移抹掉。CPU 预览（preview.mjs 不跑脚本）因此一直是对的，浏览器一直错 —— 两端分歧点。
//
// 本测试用 bundle 里的共享实现（snapshotAuthoredOrigins / syncScriptOrigins）在 Node 里复现这条链路：
//   T1 现状对照：旧写法（直接赋值）复现设备 DIAG 的 raw 值（证明测试确实抓得到该 bug）
//   T2 不写 origin 的脚本：修完后 origin 与 parseScene 锚点结果**逐位一致**（不再被抹）
//   T3 写 origin 的脚本：增量叠加 = 锚点结果 + (dx,-dy)（脚本语义保留）
//   T4 无锚点层等价性：没有附件锚点的层，新旧实现结果逐位相同（零行为差异）
//
// 用法: node script-origin-sync-test.mjs [sceneId]
import fs from 'node:fs'
import * as lib from './we-scene-bundle.js'
// ①(去个人化 2026-09-16) 工作区根：环境变量优先；下面的默认值只是作者本机路径，发布副本请设 MPW_ROOT。
const MPW_WS = process.env.MPW_ROOT || '/root/Desktop/DSHarea'

const sceneId = process.argv[2] || '3719111841'
const pkgPath = `${MPW_WS}/allwallpaper/dd/${sceneId}/scene.pkg`
if (!fs.existsSync(pkgPath)) { console.error('✗ 缺包: ' + pkgPath); process.exit(1) }

const DEC = new TextDecoder()
const pkg = lib.parsePkg(new Uint8Array(fs.readFileSync(pkgPath)))
const sceneJson = JSON.parse(DEC.decode(lib.getEntry(pkg, 'scene.json')).replace(/^\uFEFF/, ''))
const readEntry = (n) => lib.getEntry(pkg, n)
const sceneObj = JSON.parse(JSON.stringify(sceneJson))          // 脚本/同步会改它 → 用副本

let pass = 0, fail = 0
const ok = (cond, name, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  (' + detail + ')' : '')) }
  else { fail++; console.error('  ✗ ' + name + (detail ? '  (' + detail + ')' : '')) }
}

// 设备的 DIAG 采样（reports/r1789221848912.json 的【DIAG】行，y-down 设计坐标）
const DEVICE = { 右侧发: [67, 2675], 底发: [-277, 1719], 衣袖: [-517, 2661] }

console.log(`[T1] 复现设备症状：旧写法（raw.origin 直接赋值）`)
const anchored = lib.parseScene(JSON.parse(JSON.stringify(sceneJson)), null, { attachCtx: { readEntry, time: 0 } })
{
  // 旧实现（回归版）：l.origin = flip(raw authored)
  const H = sceneJson.general.orthogonalprojection.height
  let matched = 0, total = 0
  for (const [name, dev] of Object.entries(DEVICE)) {
    const L = anchored.layers.find((l) => l.name === name)
    const o = (sceneObj.objects || []).find((x) => x.name === name)
    if (!L || !o) continue
    const raw = String(o.origin).trim().split(/\s+/).map(Number)
    const oldOrigin = [raw[0], H - raw[1]]                       // 旧写法的结果
    total++
    const devMatch = Math.abs(oldOrigin[0] - dev[0]) < 1 && Math.abs(oldOrigin[1] - dev[1]) < 1
    const anchorDiff = Math.round(Math.hypot(oldOrigin[0] - L.origin[0], oldOrigin[1] - L.origin[1]))
    if (devMatch) matched++
    console.log(`      ${name}: 旧写法=(${Math.round(oldOrigin[0])},${Math.round(oldOrigin[1])}) 设备DIAG=(${dev[0]},${dev[1]}) ` +
      `锚点后=(${Math.round(L.origin[0])},${Math.round(L.origin[1])}) 与锚点差=${anchorDiff}px`)
  }
  ok(matched === total, 'T1 旧写法结果 == 设备 DIAG（证明测试复现了现场）', `${matched}/${total} 层逐位吻合`)
}

console.log(`\n[T2] 修复后：脚本**不写** origin → 锚点结果保持`)
{
  const sc = lib.parseScene(JSON.parse(JSON.stringify(sceneJson)), null, { attachCtx: { readEntry, time: 0 } })
  const base = lib.snapshotAuthoredOrigins(sceneObj.objects)
  const before = new Map(sc.layers.map((l) => [l.id, [l.origin[0], l.origin[1]]]))
  const n = lib.syncScriptOrigins(sc, sceneObj.objects, base, new Map())
  let same = 0, diff = []
  for (const l of sc.layers) {
    const b = before.get(l.id)
    if (Math.abs(l.origin[0] - b[0]) < 1e-9 && Math.abs(l.origin[1] - b[1]) < 1e-9) same++
    else diff.push(l.name)
  }
  ok(n === 0, 'T2a 无脚本改动 → synced=0', 'synced=' + n)
  ok(same === sc.layers.length, 'T2b 所有层 origin 逐位不变（锚点偏移保住）', `${same}/${sc.layers.length}${diff.length ? ' 变化: ' + diff.slice(0, 5) : ''}`)
  // 与标定表比对：修复后应与 refrender 一致（≤2px），旧写法会差数百 px
  const refFile = `./refrender-${sceneId}.json`
  if (fs.existsSync(refFile)) {
    const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'))
    const isMeshLayer = (l) => {
      try {
        if (!l.image) return false
        const me = readEntry(l.image)
        if (!me) return false
        const mj = JSON.parse(DEC.decode(me).replace(/^\uFEFF/, ''))
        return !!(mj && mj.puppet)
      } catch { return false }
    }
    let worst = 0, worstName = '', n = 0
    for (const l of sc.layers) {
      const r = ref[String(l.id)]
      if (!r) continue
      // 网格层的 l.origin 是网格枢轴（实绘中心 = origin + scale·meshBBox），标定表存的是实绘矩形中心
      // → 不是同一口径（layer-rect-check 才是网格层的裁判）；这里只比图片层。
      if (isMeshLayer(l)) continue
      n++
      const d = Math.hypot(l.origin[0] - (r[0] + r[2] / 2), l.origin[1] - (r[1] + r[3] / 2))
      if (d > worst) { worst = d; worstName = String(l.name) }
    }
    ok(worst < 5, 'T2c 修复后图片层 origin 与标定表一致（layer-rect-check 口径）', `${n} 层，最大 ${worst.toFixed(1)}px @ ${worstName}`)
  }
}

console.log(`\n[T3] 修复后：脚本**写** origin → 增量叠加（脚本语义保留）`)
{
  for (const [name, dx, dy] of [['底发', 120, -45], ['右侧发', -30, 88]]) {
    const rawCopy = JSON.parse(JSON.stringify(sceneJson))
    const sc = lib.parseScene(JSON.parse(JSON.stringify(rawCopy)), null, { attachCtx: { readEntry, time: 0 } })
    const objs = rawCopy.objects
    const base = lib.snapshotAuthoredOrigins(objs)
    const bl = sc.layers.find((l) => l.name === name)
    const before = { origin: [bl.origin[0], bl.origin[1]] }   // ← 必须取副本：同步是就地改写
    const o = objs.find((x) => x.name === name)
    const p = String(o.origin).trim().split(/\s+/).map(Number)
    o.origin = `${p[0] + dx} ${p[1] + dy} 0.00000`                // 模拟脚本改写 authored origin
    const n = lib.syncScriptOrigins(sc, objs, base, new Map())
    const after = sc.layers.find((l) => l.name === name)
    // 期望：x += dx，y -= dy（y-up → y-down 取反）
    const ex = [before.origin[0] + dx, before.origin[1] - dy]
    const err = Math.hypot(after.origin[0] - ex[0], after.origin[1] - ex[1])
    ok(n === 1 && err < 1e-6, `T3 ${name} 增量叠加正确（x+${dx}, y-(${dy})）`,
      `期望=(${ex[0].toFixed(1)},${ex[1].toFixed(1)}) 实际=(${after.origin[0].toFixed(1)},${after.origin[1].toFixed(1)}) synced=${n}`)
    // 幂等：同一帧重复调用不应继续漂移
    const again = lib.syncScriptOrigins(sc, objs, base, new Map())
    const err2 = Math.hypot(after.origin[0] - ex[0], after.origin[1] - ex[1])
    ok(again === 0 && err2 < 1e-6, `T3b ${name} 重复同步幂等（不累加）`, 'synced=' + again)
  }
}

console.log(`\n[T4] 无锚点层：新旧实现逐位等价（零行为差异）`)
{
  const rawA = JSON.parse(JSON.stringify(sceneJson))
  const noAnchor = lib.parseScene(rawA, null, {})                // 不带 attachCtx → 无锚点
  const base = lib.snapshotAuthoredOrigins(rawA.objects)
  const objs = rawA.objects
  const dx = 33, dy = -21
  const target = noAnchor.layers.find((l) => !l.__skin && l.origin && objs.some((o) => o.id === l.id && o.name === l.name))
  const o = objs.find((x) => x.id === target.id)
  const p = String(o.origin).trim().split(/\s+/).map(Number)
  o.origin = `${p[0] + dx} ${p[1] + dy} 0.00000`
  lib.syncScriptOrigins(noAnchor, objs, base, new Map())
  const H = sceneJson.general.orthogonalprojection.height
  const oldResult = [p[0] + dx, H - (p[1] + dy)]                  // 旧写法（直接赋值）
  const err = Math.hypot(target.origin[0] - oldResult[0], target.origin[1] - oldResult[1])
  ok(err < 1e-6, `T4 无锚点层结果 == 旧实现（逐位）`, `${target.name} 新=(${target.origin[0].toFixed(1)},${target.origin[1].toFixed(1)}) 旧=(${oldResult[0].toFixed(1)},${oldResult[1].toFixed(1)})`)
}

console.log(`\nscript-origin-sync-test：${pass} pass / ${fail} fail`)
if (fail > 0) process.exit(1)
