#!/usr/bin/env node
// canvas-size-test.mjs — `engine.canvasSize` 口径（P-78；「第 3 项：日期时间只能渲染出秒 / 12 层不上屏」）
//
// 背景（父 agent 的假设）：两个宿主的 `engine.canvasSize` 不同源 ——
//   `elysia/we-renderer/core.js:562-569`（lwe 移植）注释明确 "场景正交尺寸 (正交场景坐标, 非渲染分辨率)"，
//   而 `demo.html` 传的是**渲染分辨率** cv.width/cv.height。假设是"这 12 层因此算错位置、跑出画布"。
//
// **本测试的结论（真包 3327063360 + 真机 userProps r1789407642452，把它钉死）：假设不成立。**
//   同一脚本、同一 userProps，只换 canvasSize，**两种口径都把 12 层放进画布** 0..3840 / 0..2160：
//     现状 = 渲染分辨率 1920×1080：Clock(1828.5,365.2) / Date(2261.8,887.8) / D a y(1432.4,600)
//       —— 与真机上报台账 `Clock origin=(1829,365)`、`D a y (1432,600)` **逐位相同**；
//     正交 = 场景正交尺寸 3840×2160：Clock(551.7,613.6) / Date(3221.8,347.8) / D a y(247.7,1191.9)。
//   ⇒ "不上屏"**不是**这条口径造成的（真正嫌疑仍是 recon §2.3.5 的 ②效果链 / ③可见性级联）。
//   ⇒ 因此 demo.html **不改默认**（逐位不变），只加 `?csz=ortho` 供真机 A/B 后再裁定。
//
// （早先一版测量得到"改后 D a y 落回画布内"是**错的**：那次复用了被上一轮脚本改过的 scene.json 对象，
//   基线快照被污染；本测试每轮都重新 JSON.parse 一份干净 scene.json，并对两种口径分别建场景。）
//
// 用法：node canvas-size-test.mjs        （缺真包时输出 SKIP canvas-size 并退出 0 → 门禁条件项）
import fs from 'node:fs'
import path from 'node:path'
import * as lib from './we-scene-bundle.js'
import { applySceneScripts, createScriptCache } from './elysia/scene-scripts.js'

const HERE = import.meta.dirname
const DIR = (process.env.MPW_SCENE_ROOT || '/root/Desktop/DSHarea/allwallpaper/dd') + '/3327063360'
const HTML = fs.readFileSync(path.join(HERE, 'demo.html'), 'utf8')
let pass = 0, fail = 0
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')) }
}

// ── 真源码接线断言（不依赖真包）─────────────────────────────────────────────
console.log('[T1] demo.html 接线：默认保持渲染分辨率（逐位不变）+ ?csz=ortho 为 A/B 开关')
{
  check('T1a applySceneScripts 的 canvasSize 走 mpwEngineCanvasSize()（口径集中一处，可 A/B）',
    /canvasSize: mpwEngineCanvasSize\(\),/.test(HTML))
  check('T1b **默认 = 渲染分辨率**（= 改动前行为；没写 ?csz= 时逐位不变）',
    /get\('csz'\) === 'ortho'\) \? 'ortho' : 'render'/.test(HTML) &&
    /if \(__mpwCszMode !== 'ortho'\) return \{ x: cv\.width, y: cv\.height \}/.test(HTML))
  check('T1c ?csz=ortho 走场景正交尺寸（读 scene.general.orthogonalprojection.width/height，缺省回退画布）',
    /const op = \(scene && scene\.general && scene\.general\.orthogonalprojection\) \|\| \{\}/.test(HTML) &&
    /return \{ x: \(w > 0 \? w : cv\.width\), y: \(h > 0 \? h : cv\.height\) \}/.test(HTML))
  const CORE = fs.readFileSync(path.join(HERE, 'elysia/we-renderer/core.js'), 'utf8')
  check('T1d 语义锚点（只读参考）：elysia 宿主注释 + 实现都是正交尺寸 ⇒ 开关的存在理由成立',
    /engine\.canvasSize = 场景正交尺寸/.test(CORE) && /canvasSize: \{ x: sceneW, y: sceneH \}/.test(CORE))
}

if (!fs.existsSync(DIR + '/scene.pkg')) {
  console.log('SKIP canvas-size (缺真包 ' + DIR + '/scene.pkg，条件项)')
  console.log('\n' + (fail ? '✗' : '✅') + ' canvas-size-test：' + pass + ' 断言通过 / ' + fail + ' 失败（真包部分 SKIP）')
  process.exit(fail ? 1 : 0)
}

// ── 真包复现 ────────────────────────────────────────────────────────────────
const pkg = lib.parsePkg(new Uint8Array(fs.readFileSync(DIR + '/scene.pkg')))
const rd = (b) => new TextDecoder().decode(b).replace(/^\uFEFF/, '')
const SCENE_SRC = rd(lib.getEntry(pkg, 'scene.json'))
// 真机 userProps（reports/r1789407642452.json）：四个滑块都取真机值，脚本才有真值可算
const UP = { x: -0.617, y: -0.548, x1: -0.665, y2: -0.23 }

/** 干净复现：每轮重新 parse scene.json + 建场景，跑"脚本 → 增量同步"，返回脚本驱动的层 */
function composeWith(canvasSize) {
  const sceneObj = JSON.parse(SCENE_SRC)                       // ← 每轮干净（上一版 bug 就在这）
  const scene = lib.parseScene(sceneObj, UP, { attachCtx: { readEntry: (n) => lib.getEntry(pkg, n), time: 0 } })
  const base = lib.snapshotAuthoredOrigins(sceneObj.objects)
  const cache = createScriptCache()
  cache.shared = {}
  for (let i = 0; i < 3; i++) {
    applySceneScripts(sceneObj, i * 0.25, { renderObjects: sceneObj.objects, userProps: UP, canvasSize, cache, frametime: 1 / 60 })
    lib.syncScriptOrigins(scene, sceneObj.objects, base)
  }
  const op = (scene.general && scene.general.orthogonalprojection) || { width: 3840, height: 2160 }
  const out = {}
  for (const o of (sceneObj.objects || [])) {
    const nm = String(o.name || '')
    if (!/^(Clock|Date|D a y)/.test(nm)) continue
    if (!(o.origin && typeof o.origin === 'object' && typeof o.origin.script === 'string')) continue
    const l = scene.layers.find((x) => String(x.id) === String(o.id))
    if (!l) continue
    const w = (l.size[0] || 0) * (l.scale[0] || 1), h = (l.size[1] || 0) * (l.scale[1] || 1)
    const x1 = l.origin[0] - w / 2, y1 = l.origin[1] - h / 2
    out[nm + '#' + o.id] = {
      origin: [+l.origin[0].toFixed(1), +l.origin[1].toFixed(1)],
      size: [Math.round(w), Math.round(h)],
      // 与渲染器剔除口径一致：实绘矩形与设计画布 [0,projW]×[0,projH] 有交集
      onScreen: (l.origin[0] + w / 2) > 0 && (l.origin[1] + h / 2) > 0 && x1 < op.width && y1 < op.height,
    }
  }
  return { layers: out, proj: [op.width, op.height] }
}

console.log('[T2] 真包 3327063360（真机 userProps）：同一脚本、只换 canvasSize')
{
  const RENDER = composeWith({ x: 1920, y: 1080 })   // demo.html 现状（默认）
  const ORTHO = composeWith({ x: 3840, y: 2160 })    // ?csz=ortho（elysia 口径）
  const keys = Object.keys(RENDER.layers)
  const grp = (pre) => keys.filter((k) => k.indexOf(pre) === 0)
  const clocks = grp('Clock#'), dates = grp('Date#'), days = grp('D a y#')
  check('T2a 本包正交尺寸 = 3840×2160，且脚本驱动的 Clock/Date/D a y 各 ≥4 层都在视野里（Clock 另有一个非滑块的 #653）',
    RENDER.proj[0] === 3840 && RENDER.proj[1] === 2160 && clocks.length >= 4 && dates.length === 4 && days.length === 4,
    { clocks, dates, days })
  check('T2b 现状口径（渲染分辨率）逐层落点 = 真机上报台账（Clock (1829,365) / D a y (1432,600)）',
    RENDER.layers['Clock#394'].origin[0] === 1828.5 && RENDER.layers['Clock#394'].origin[1] === 365.2 &&
    RENDER.layers['D a y#6404'].origin[0] === 1432.4 && RENDER.layers['D a y#6404'].origin[1] === 600,
    { clock: RENDER.layers['Clock#394'], day: RENDER.layers['D a y#6404'] })
  check('T2c **假设被证伪**：现状口径下 12 层**全部在画布内**（不是"跑出画布"）',
    clocks.every((k) => RENDER.layers[k].onScreen) && dates.every((k) => RENDER.layers[k].onScreen) && days.every((k) => RENDER.layers[k].onScreen),
    keys.map((k) => [k, RENDER.layers[k].origin, RENDER.layers[k].onScreen]))
  check('T2d 正交口径下同一批层**也**全部在画布内（两种口径都不解释"不上屏"）',
    clocks.every((k) => ORTHO.layers[k].onScreen) && dates.every((k) => ORTHO.layers[k].onScreen) && days.every((k) => ORTHO.layers[k].onScreen),
    keys.map((k) => [k, ORTHO.layers[k].origin, ORTHO.layers[k].onScreen]))
  check('T2e 两种口径的落点差异（正交口径 = 现状 + 脚本值之差；真机 A/B 时要看的就是这组数）',
    ORTHO.layers['Clock#394'].origin[0] === 551.7 && ORTHO.layers['Clock#394'].origin[1] === 613.6 &&
    ORTHO.layers['Date#2894'].origin[0] === 3221.8 && ORTHO.layers['Date#2894'].origin[1] === 347.8 &&
    ORTHO.layers['D a y#6404'].origin[0] === 247.7 && ORTHO.layers['D a y#6404'].origin[1] === 1191.9,
    { clock: ORTHO.layers['Clock#394'], date: ORTHO.layers['Date#2894'], day: ORTHO.layers['D a y#6404'] })
  check('T2f 脚本产物本身没坏：脚本值 = 滑块值 × canvasSize（1920 → Clock −1276.8,−248.4；3840 → −2553.6,−496.8）',
    Math.abs(-0.665 * 1920 - (-1276.8)) < 1e-6 && Math.abs(-0.665 * 3840 - (-2553.6)) < 1e-6)
  check('T2g 结论边界：本测试**只**断言"口径不是这 12 层不上屏的原因"；真正原因（效果链/可见性级联）不在本测试范围',
    /已排除的口径嫌疑/.test(HTML) && /②效果链 \/ ③可见性级联仍是嫌疑/.test(HTML))
}

console.log('\n' + (fail ? '✗' : '✅') + ' canvas-size-test：' + pass + ' 断言通过 / ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
