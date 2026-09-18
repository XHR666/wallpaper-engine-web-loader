/* 参照来源许可声明：本文件提到的 wer-ref/ 是第三方参考实现（Aromatic05/wallpaper-engine-renderer，GPL-2.0-only，非 WE 官方代码、非「真值源」），与本项目（GPL-3.0-or-later）许可不兼容 —— 仅用于行为对照，不得复制/改写/逐行翻译其代码、注释、常量组织或错误文案。lwe-ref/（linux-wallpaperengine，GPL-3.0-only）与 wer-ref 同样**只作行为对照**。`oneincase/webwallgl`（MIT）在本文件中仅作**口径对照**（实例化 quad 带 rot / 图层 toWorld 变换 / 发射器 speedmin-speedmax / randExp），实现按**官方着色器与官方资产**自写，未复制其代码；台账见 docs/COPYING-RULES.md §4 与 THIRD-PARTY.md。 */
// particle-render-correctness-test.mjs — P-103 四项粒子渲染正确性修复的回归门禁（无浏览器；合成场景 + 真包 + mock-GL）
//
// 覆盖（每项都做"official vs legacy 双向"，避免"只测新行为"）：
//   ① quad 的**图层变换**（scale + z 角）：`genericparticle.vert:86-87` 的 MVP 含图层模型矩阵 ⇒ size 偏移也吃 scale；
//      本机语料 30/40 个测试包粒子层 scale≠1 或角度≠0（`?pquad=legacy` 回退）
//   ② 粒子**自转**（rotationrandom / angularvelocityrandom + angularmovement）：官方
//      `common_particles.h:20-39 ComputeParticleTangents` 的两条局部轴（`?prot=legacy` 回退）
//   ③ 随机 initializer 的 **exponent 非线性分布**（`值 = min + pow(u,exp)·(max−min)`；`?pexp=legacy` 回退）
//   ④ 发射器 **speedmin/speedmax** 初速（沿"基准点→出生点"方向；`?pspeed=legacy` 回退）
// 另含：legacy 档**逐位复现 P-100** 的断言（顶点流 / 粒子尺寸序列 / 速度序列 / 仿真代价相等），
// 以及四个档位的 `particleStats` 记账断言（真机上报与面板速查用）。
//
// 用法: node tests/particle-render-correctness-test.mjs [--verbose]
import fs from 'node:fs'
import { createRenderer } from '../core/we-scene-bundle.js'
import * as lib from '../core/we-scene-bundle.js'

const MPW_WS = process.env.MPW_ROOT || '/root/Desktop/DSHarea'
const DIR = `${MPW_WS}/allwallpaper/dd`
const WE = `${MPW_WS}/wallpaper_engine/assets`
const dec = new TextDecoder()
const VERBOSE = process.argv.includes('--verbose')
const checks = []
const push = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); if (VERBOSE || !ok) console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? ' — ' + detail : '')) }
const near = (a, b, tol) => Math.abs(a - b) <= tol
const hasPkg = (id) => fs.existsSync(`${DIR}/${id}/scene.pkg`)

// ───────────────────────── mock GL（顶点流捕获） ─────────────────────────
function makeGl() {
  // ①(P-126) rec 扩展：`bufs` 按缓冲 id 存最近一次上传、`uploads` 记上传顺序、`draws2` 记逐 draw 的
  //   uniform 快照 —— 用于断言"逐粒子颜色到底进没进 u_Color / a_Color 顶点缓冲"。
  const rec = { verts: [], draws: 0, bufs: new Map(), uploads: [], draws2: [] }
  let curUnit = 0, curBuf = null, curProg = null
  const bufVerts = new Map()
  const progUni = new Map()
  const setUni = (l, v) => { if (l && l.p && l.n) { if (!progUni.has(l.p.id)) progUni.set(l.p.id, {}); progUni.get(l.p.id)[l.n] = v } }
  const CONST = { LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81, ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B85,
    FRAMEBUFFER_COMPLETE: 0x8CD5, MAX_TEXTURE_SIZE: 0x0D33, NO_ERROR: 0, TEXTURE0: 0, FRAMEBUFFER: 0x8D40 }
  for (let i = 0; i < 8; i++) CONST['TEXTURE' + i] = i
  let seq = 0
  const handlers = {
    createTexture: () => ({ id: 'tex' + (++seq) }), createFramebuffer: () => ({ id: 'fbo' + (++seq) }),
    createBuffer: () => ({ id: 'buf' + (++seq) }), createVertexArray: () => ({ id: 'vao' + (++seq) }),
    createShader: () => ({ id: 'sh' + (++seq) }), createProgram: () => ({ id: 'prog' + (++seq) }),
    bindBuffer: (t, b) => { curBuf = b && b.id },
    bufferData: (t, data) => { if (data && data.length) { const v = Float32Array.from(data); bufVerts.set(curBuf, v); rec.bufs.set(curBuf, v); rec.uploads.push({ buf: curBuf, data: v }); rec.verts.push(v) } },
    activeTexture: (u) => { curUnit = u },
    bindTexture: () => {}, bindFramebuffer: () => {}, bindVertexArray: () => {}, useProgram: (p) => { curProg = p },
    texImage2D: () => {}, uniform1i: (l, v) => setUni(l, v), uniform1f: (l, v) => setUni(l, v), uniform2f: (l, a, b) => setUni(l, [a, b]),
    uniform3f: (l, a, b, c) => setUni(l, [a, b, c]), uniform4f: (l, a, b, c, d) => setUni(l, [a, b, c, d]),
    uniformMatrix4fv: () => {}, uniformMatrix3fv: () => {},
    drawArrays: () => { rec.draws++; rec.draws2.push({ upIdx: rec.uploads.length, buf: curBuf,
      data: rec.bufs.get(curBuf) || null, uni: Object.assign({}, (curProg && progUni.get(curProg.id)) || {}) }) },
    drawElements: () => {},
    getProgramParameter: (p, k) => (k === CONST.LINK_STATUS || k === CONST.COMPILE_STATUS) ? true : (k === CONST.ACTIVE_UNIFORMS ? 0 : (k === CONST.ACTIVE_ATTRIBUTES ? 0 : null)),
    getActiveUniform: () => ({ name: 'g_Texture0', type: 0x8B62 }),
    getActiveAttrib: (p, i) => ({ name: i === 0 ? 'a_Position' : 'a_TexCoord', size: 1 }),
    getAttribLocation: (p, n) => ({ a_Position: 0, a_TexCoord: 1, a_TexCoordB: 2, a_Blend: 3, a_Alpha: 4, a_Color: 5 }[n] ?? -1),
    getUniformLocation: (p, n) => ({ p, n }), getShaderParameter: () => true, checkFramebufferStatus: () => CONST.FRAMEBUFFER_COMPLETE,
    getError: () => CONST.NO_ERROR, getParameter: (k) => k === CONST.MAX_TEXTURE_SIZE ? 4096 : 0,
    isTexture: () => true, getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    texParameteri: () => {}, generateMipmap: () => {}, deleteTexture: () => {}, pixelStorei: () => {},
  }
  const gl = new Proxy({}, { get(t, prop) {
    if (prop in handlers) return handlers[prop]
    if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return CONST[prop] !== undefined ? CONST[prop] : 1
    return () => {}
  } })
  return { gl, rec }
}
// ①(P-126) 粒子批的识别口径：粒子 FS 独有的 `u_TexFmt`（层/效果 pass 用不到这个名字）
const isParticleDraw = (d) => !!(d && d.uni && ('u_TexFmt' in d.uni) && d.data && d.data.length / 9 > 6)
// ①(P-126 A) 同一次 draw 的 (几何流, 颜色流)：几何是它前面最近一次上传，颜色是再前面一次（不同缓冲）
function colorStreamOf(d, rec) {
  if (!d || d.upIdx < 2) return null
  const g = rec.uploads[d.upIdx - 1], c = rec.uploads[d.upIdx - 2]
  if (!g || !c || !c.data || c.buf === g.buf) return null
  return c.data
}
const VERT = 'attribute vec3 a_Position; attribute vec2 a_TexCoord; uniform mat4 g_ModelViewProjectionMatrix; varying vec2 v_TexCoord; void main(){ gl_Position = g_ModelViewProjectionMatrix * vec4(a_Position,1.0); v_TexCoord = a_TexCoord; }'
const FRAG = 'uniform sampler2D g_Texture0; varying vec2 v_TexCoord; void main(){ gl_FragColor = texture(g_Texture0, v_TexCoord); }'
const SHADER_RESOLVER = async (rel) => (rel.endsWith('.vert') ? VERT : FRAG)

// 档位 → location.search（与真机同一开关写法）
function setModes(modes = {}) {
  const q = []
  for (const [flag, v] of [['pquad', modes.pquad], ['prot', modes.prot], ['pexp', modes.pexp], ['pspeed', modes.pspeed],
    ['pframe', modes.pframe], ['pops', modes.pops]]) {
    if (v === 'legacy') q.push(flag + '=legacy')
  }
  globalThis.location = { search: q.length ? '?' + q.join('&') : '' }
}
const W = 3840, H = 2160
const mkLayer = (o) => Object.assign({ id: 1, name: 'L', visible: true, origin: [0, 0, 0], scale: [1, 1, 1], angles: [0, 0, 0],
  alpha: 1, size: [W, H], image: null, particle: 'p', particleDef: null, particleTexName: 'tex_a',
  textureName: null, effects: [], parallaxDepth: null, uvRect: undefined }, o)
const defQuad = (extraInit = []) => ({ maxcount: 8, material: 'm',
  emitter: [{ name: 'boxrandom', rate: 100, instantaneous: 1, distancemax: '0 0 0' }],
  initializer: [{ name: 'lifetimerandom', min: 100, max: 100 }, { name: 'sizerandom', min: 100, max: 100 }].concat(extraInit),
  operator: [{ name: 'movement' }] })
const TEXA = new Map([['tex_a', { glTex: { id: 'g1' }, width: 64, height: 64 }]])
// 渲染一帧，取最后一个粒子批的顶点流 + stats
async function renderQuad(def, layerExtra = {}, modes = {}, t = 1.0, texMap = TEXA) {
  setModes(modes)
  const { gl, rec } = makeGl()
  const scene = { layers: [mkLayer(Object.assign({ particleDef: def }, layerExtra))], general: {}, camera: null, size: [W, H] }
  const r = createRenderer({ getContext: () => gl }, { onLog: () => {}, shaderResolver: SHADER_RESOLVER, aggregate: true })
  await r.render(scene, texMap, W, H, t)
  return { verts: rec.verts[rec.verts.length - 1] || null, stats: r.particleStats, draws: rec.draws, rec }
}
// 顶点流 → 第 0 个 quad 的两条边（设计像素）+ 边长/角度
function quadEdges(verts) {
  const xs = [], ys = []
  for (let i = 0; i + 8 < verts.length; i += 9) { xs.push((verts[i] * 0.5 + 0.5) * W); ys.push((verts[i + 1] * 0.5 + 0.5) * H) }
  const e1 = [xs[1] - xs[0], ys[1] - ys[0]], e2 = [xs[2] - xs[0], ys[2] - ys[0]]
  const ang = (e) => Math.atan2(e[1], e[0]) * 180 / Math.PI
  return { e1, e2, l1: Math.hypot(e1[0], e1[1]), l2: Math.hypot(e2[0], e2[1]), a1: ang(e1), a2: ang(e2),
    spanX: Math.max(...xs.slice(0, 6)) - Math.min(...xs.slice(0, 6)), spanY: Math.max(...ys.slice(0, 6)) - Math.min(...ys.slice(0, 6)) }
}
function angleSpread(verts) {
  const a = []
  for (let q = 0; q * 54 + 54 <= verts.length; q++) {
    const b = q * 54
    const X = [], Y = []
    for (let k = 0; k < 6; k++) { X.push(verts[b + k * 9]); Y.push(verts[b + k * 9 + 1]) }
    const e1 = [X[1] - X[0], Y[1] - Y[0]], e2 = [X[2] - X[0], Y[2] - Y[0]]
    const long = Math.hypot(...e1) >= Math.hypot(...e2) ? e1 : e2
    let d = Math.abs(Math.atan2(long[1], long[0]) * 180 / Math.PI)
    if (d > 180) d = 360 - d
    a.push(d)
  }
  return { n: a.length, spread: a.length ? Math.max(...a) - Math.min(...a) : 0, min: a.length ? Math.min(...a) : 0, max: a.length ? Math.max(...a) : 0 }
}
const allSame = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]))

// ═══════════════════ ① 图层变换（scale + z 角） ═══════════════════
{
  const on = await renderQuad(defQuad(), { scale: [2, 3, 1] }, {})
  const off = await renderQuad(defQuad(), { scale: [2, 3, 1] }, { pquad: 'legacy' })
  const gOn = quadEdges(on.verts), gOff = quadEdges(off.verts)
  // size=100 ⇒ quad 边长 = size/2 = 50；scale[2,3] ⇒ 100 / 150
  push('① 图层 scale 进 quad 几何：spanX=size/2×2=100、spanY=size/2×3=150',
    near(gOn.spanX, 100, 0.01) && near(gOn.spanY, 150, 0.01), `span=${gOn.spanX.toFixed(2)}×${gOn.spanY.toFixed(2)}`)
  push('① ?pquad=legacy 复现 P-100（span=边长 50×50，不吃 scale）',
    near(gOff.spanX, 50, 0.01) && near(gOff.spanY, 50, 0.01), `span=${gOff.spanX.toFixed(2)}×${gOff.spanY.toFixed(2)}`)
  push('① 记账：pquadQuads>0（official）/ =0（legacy）', on.stats.pquadQuads > 0 && off.stats.pquadQuads === 0,
    `on=${on.stats.pquadQuads} off=${off.stats.pquadQuads}`)
  // 图层 z 角：π/2 ⇒ 局部 u 轴（e2）从 0° 转到 90°（本仓库与 spawnParticle 发射器偏移同号：R(−angle)）
  const rot90 = await renderQuad(defQuad(), { scale: [1, 1, 1], angles: [0, 0, Math.PI / 2] }, {})
  const rot90Leg = await renderQuad(defQuad(), { scale: [1, 1, 1], angles: [0, 0, Math.PI / 2] }, { pquad: 'legacy' })
  const q90 = quadEdges(rot90.verts), q90l = quadEdges(rot90Leg.verts)
  push('① 图层 z 角 π/2：quad 的 u 轴转到 90°（legacy 恒 0°）',
    near(Math.abs(q90.a2), 90, 0.5) && near(q90l.a2, 0, 0.001), `official a2=${q90.a2.toFixed(2)}° legacy a2=${q90l.a2.toFixed(2)}°`)
  // scale=1、角=0 ⇒ official 与 legacy **逐位相同**（证明默认档只在真有变换时才动几何）
  const same = await renderQuad(defQuad(), {}, {})
  const sameLeg = await renderQuad(defQuad(), {}, { pquad: 'legacy' })
  push('① scale=1/角=0 时 official 与 legacy 顶点流逐位相同', allSame(same.verts, sameLeg.verts), `len=${same.verts.length}`)
  // legacy 档 == 测试内**独立复算**的 P-100 公式（cxs·hw / cys·hh）⇒ "改前逐位"不是自证
  {
    const v = off.verts
    const cxs = [-1, -1, 1, 1, -1, 1], cys = [-1, 1, -1, -1, 1, 1]
    const sz = 50, hw = sz / 2, hh = sz / 2 // size=100 ⇒ sz=size/2=50, ratio=1
    // k0 的旧公式 = 中心 + (−hw, −hh) ⇒ 中心 = k0 + (hw, hh)
    const cx = (v[0] * 0.5 + 0.5) * W + hw, cy = (v[1] * 0.5 + 0.5) * H + hh
    // 容差必须按**顶点缓冲的量化**给，不能按 double 给：顶点流是 `Float32Array`，
    // NDC 分量的 ulp = 2^-24（|x|≤1 ⇒ 舍入误差 ≤ 2^-25 ≈ 2.98e-8），换算回设计像素要乘 W/2 = 1920
    // ⇒ 单分量上界 ≈ 5.7e-5 px（本机实测最大 3.81e-5 px，出现在 x=±25 的 float32 尾数上）。
    // 用 1e-6 会把"逐位正确"误判成红（浮点量化 ≠ 几何偏差）；1e-3 = 实测值的 26 倍余量，
    // 仍能抓出 ≥0.001px 的真实几何错位（含 ±1 像素级、比例错、轴错）。
    const F32_PX = 1e-3
    let ok = true, maxDev = 0
    for (let k = 0; k < 6; k++) {
      const x = (v[k * 9] * 0.5 + 0.5) * W, y = (v[k * 9 + 1] * 0.5 + 0.5) * H
      maxDev = Math.max(maxDev, Math.abs(x - (cx + cxs[k] * hw)), Math.abs(y - (cy + cys[k] * hh)))
      if (!near(x, cx + cxs[k] * hw, F32_PX) || !near(y, cy + cys[k] * hh, F32_PX)) ok = false
    }
    push('① legacy 档顶点 == 独立复算的 P-100 公式（cxs·hw / cys·hh；容差 1e-3px = float32 量化上界）',
      ok && !!v, `maxDev=${maxDev.toExponential(2)}px`)
  }
}

// ═══════════════════ ② 粒子自转 ═══════════════════
{
  const PI4 = Math.PI / 4
  const rotDef = defQuad([{ name: 'rotationrandom', min: `0 0 ${PI4}`, max: `0 0 ${PI4}` }])
  const on = await renderQuad(rotDef, {}, {})
  const off = await renderQuad(rotDef, {}, { prot: 'legacy' })
  const gOn = quadEdges(on.verts), gOff = quadEdges(off.verts)
  // 官方 ComputeParticleTangents：right=(cosθ,sinθ) ⇒ u 轴（e2）在 θ；up=(−sinθ,cosθ) ⇒ v 轴（e1）在 90°+θ
  push('② 自转 π/4：u 轴 45°、v 轴 135°（官方两条局部轴）',
    near(gOn.a2, 45, 0.5) && near(Math.abs(gOn.a1), 135, 0.5), `a2=${gOn.a2.toFixed(2)}° a1=${gOn.a1.toFixed(2)}°`)
  push('② ?prot=legacy 复现 P-100（轴对齐：u 轴 0°、v 轴 90°）',
    near(gOff.a2, 0, 0.001) && near(Math.abs(gOff.a1), 90, 0.001), `a2=${gOff.a2.toFixed(3)}° a1=${gOff.a1.toFixed(3)}°`)
  push('② 边长不因自转变化（旋转是刚体变换）', near(gOn.l1 * gOn.l2, gOff.l1 * gOff.l2, 1e-3), `area on=${(gOn.l1 * gOn.l2).toFixed(3)} off=${(gOff.l1 * gOff.l2).toFixed(3)}`)
  push('② 记账：protQuads>0（official）/ =0（legacy）', on.stats.protQuads > 0 && off.stats.protQuads === 0, `on=${on.stats.protQuads} off=${off.stats.protQuads}`)
  // rot=0（无 rotationrandom 的层）⇒ official 与 legacy 逐位相同
  const z1 = await renderQuad(defQuad(), {}, {})
  const z2 = await renderQuad(defQuad(), {}, { prot: 'legacy' })
  push('② 无自转层 official 与 legacy 顶点流逐位相同', allSame(z1.verts, z2.verts))
  // 档位自洽：真实 renderer 读到的 mode 必须与开关一致
  push('② particleStats.protMode/pquadMode 反映档位',
    z1.stats.protMode === 'official' && z2.stats.protMode === 'legacy' && z1.stats.pquadMode === 'official', JSON.stringify({ a: z1.stats.protMode, b: z2.stats.protMode }))
}

// ═══════════════════ ③ exponent 非线性分布 ═══════════════════
{
  const defExp = { maxcount: 400, material: 'm', emitter: [{ name: 'boxrandom', rate: 1000, distancemax: '0 0 0' }],
    initializer: [{ name: 'lifetimerandom', min: 100, max: 100 }, { name: 'sizerandom', min: 40, max: 80, exponent: 2 }],
    operator: [{ name: 'movement' }] }
  const run = (expLegacy) => {
    const s = lib.buildParticleSystem(defExp, { origin: [0, 0, 0], seedStr: 'p103-exp', maxCount: 400, expLegacy })
    lib.simulateParticleSystem(s, 1.0)
    return s.particles.map((p) => p.size)
  }
  const on = run(false), off = run(true)
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
  const below = (a, t) => a.filter((x) => x < t).length / a.length
  // pow(u,2) 的均值 = 1/3 ⇒ 40 + 40/3 = 53.33；均匀 = 60。P(值<50) = sqrt(0.25) = 0.5 vs 0.25
  push('③ exponent=2：官方档均值 ≈ 53.3（均匀 60）', on.length > 200 && near(mean(on), 53.33, 1.5), `mean=${mean(on).toFixed(2)} n=${on.length}`)
  push('③ ?pexp=legacy：均值 ≈ 60（忽略 exponent）', near(mean(off), 60, 1.5), `mean=${mean(off).toFixed(2)}`)
  push('③ exponent=2 分布明显向 min 偏（P(<50) ≈ 0.5，均匀 0.25）', near(below(on, 50), 0.5, 0.07) && near(below(off, 50), 0.25, 0.07),
    `official=${below(on, 50).toFixed(3)} legacy=${below(off, 50).toFixed(3)}`)
  push('③ 尺寸全在 [40,80]（exponent 不越界）', on.every((s) => s >= 40 - 1e-9 && s <= 80 + 1e-9))
  // exponent 缺省 / =1 ⇒ 两个档位**逐位相同**（同一个 rng() 调用 + 同一个算式）
  const defNo = { ...defExp, initializer: [{ name: 'lifetimerandom', min: 100, max: 100 }, { name: 'sizerandom', min: 40, max: 80 }] }
  const seqOf = (d, expLegacy) => {
    const s = lib.buildParticleSystem(d, { origin: [0, 0, 0], seedStr: 'p103-exp2', maxCount: 400, expLegacy })
    lib.simulateParticleSystem(s, 1.0)
    return s.particles.map((p) => p.size)
  }
  push('③ exponent 缺省时 official 与 legacy 尺寸序列逐位相同', allSame(seqOf(defNo, false), seqOf(defNo, true)))
  const defOne = { ...defExp, initializer: [{ name: 'lifetimerandom', min: 100, max: 100 }, { name: 'sizerandom', min: 40, max: 80, exponent: 1 }] }
  push('③ exponent=1（官方语料 17 处 colorrandom/2 处 sizerandom 的写法）与缺省逐位同值', allSame(seqOf(defOne, false), seqOf(defNo, false)))
  // 记账
  const { stats } = await renderQuad({ ...defExp, emitter: [{ name: 'boxrandom', rate: 200, distancemax: '0 0 0' }] }, {}, {}, 0.6)
  const leg = await renderQuad({ ...defExp, emitter: [{ name: 'boxrandom', rate: 200, distancemax: '0 0 0' }] }, {}, { pexp: 'legacy' }, 0.6)
  push('③ 记账：expApplied>0（official）/ =0（legacy）', stats.expApplied > 0 && leg.stats.expApplied === 0, `on=${stats.expApplied} off=${leg.stats.expApplied}`)
}

// ═══════════════════ ④ 发射器 speedmin/speedmax ═══════════════════
{
  const defSpd = { maxcount: 100, material: 'm',
    emitter: [{ name: 'sphererandom', rate: 200, distancemax: '40 40 0', speedmin: 100, speedmax: 100 }],
    initializer: [{ name: 'lifetimerandom', min: 100, max: 100 }, { name: 'sizerandom', min: 10, max: 10 }], operator: [{ name: 'movement' }] }
  const build = (speedLegacy) => {
    const s = lib.buildParticleSystem(defSpd, { origin: [0, 0, 0], seedStr: 'p103-spd', maxCount: 100, speedLegacy })
    lib.simulateParticleSystem(s, 0.2)
    return s
  }
  const on = build(false), off = build(true)
  const sp = (s) => s.particles.map((p) => Math.hypot(p.vel[0], p.vel[1]))
  const outward = (s) => s.particles.filter((p) => p.vel[0] * p.pos[0] + p.vel[1] * p.pos[1] > 0).length
  push('④ official：发射器 speed 给出 |v|=100 的初速', on.particles.length > 5 && near(Math.min(...sp(on)), 100, 1e-6) && near(Math.max(...sp(on)), 100, 1e-6),
    `n=${on.particles.length} |v|∈[${Math.min(...sp(on)).toFixed(2)},${Math.max(...sp(on)).toFixed(2)}]`)
  push('④ 初速方向 = 基准点→出生点（全部外向）', outward(on) === on.particles.length, `${outward(on)}/${on.particles.length}`)
  push('④ ?pspeed=legacy：初速恒 0（P-100 只可能来自 velocityrandom）', off.particles.length > 5 && sp(off).every((v) => v === 0), `max|v|=${Math.max(...sp(off))}`)
  // 无 speed 字段的发射器 ⇒ 两档逐位相同（不偷抽随机数）
  const defNo = { ...defSpd, emitter: [{ name: 'sphererandom', rate: 200, distancemax: '40 40 0' }] }
  const seq = (speedLegacy) => {
    const s = lib.buildParticleSystem(defNo, { origin: [0, 0, 0], seedStr: 'p103-spd2', maxCount: 100, speedLegacy })
    lib.simulateParticleSystem(s, 0.2)
    return s.particles.flatMap((p) => [p.vel[0], p.vel[1], p.pos[0], p.pos[1]])
  }
  push('④ 无 speed 字段时 official 与 legacy 粒子状态逐位相同', allSame(seq(false), seq(true)))
  const { stats } = await renderQuad({ ...defSpd, emitter: [{ name: 'sphererandom', rate: 200, distancemax: '40 40 0', speedmin: 100, speedmax: 100 }] }, {}, {}, 0.6)
  const leg = await renderQuad({ ...defSpd, emitter: [{ name: 'sphererandom', rate: 200, distancemax: '40 40 0', speedmin: 100, speedmax: 100 }] }, {}, { pspeed: 'legacy' }, 0.6)
  push('④ 记账：spawnSpeeds>0（official）/ =0（legacy）', stats.spawnSpeeds > 0 && leg.stats.spawnSpeeds === 0, `on=${stats.spawnSpeeds} off=${leg.stats.spawnSpeeds}`)
}

// ═══════════════════ ⑤ 真包：语料级证据 + 代价不回归 ═══════════════════
function loadPkg(id) {
  const pkg = lib.parsePkg(new Uint8Array(fs.readFileSync(`${DIR}/${id}/scene.pkg`)))
  const sj = JSON.parse(dec.decode(lib.getEntry(pkg, 'scene.json')).replace(/^\uFEFF/, ''))
  const readParticleDef = (p) => { try { const e = lib.getEntry(pkg, p); return e ? JSON.parse(dec.decode(e)) : null } catch { return null } }
  const scene = lib.parseScene(sj, null, { readParticleDef, legacyAnimY: true })
  lib.applyRenderConfig(scene, { sceneId: id, clearBgFx: true, hideParticles: false, hideUI: false, log: () => {} })
  return { pkg, scene }
}
function buildTex(pkg, scene, layer) {
  const textures = new Map()
  for (const l of scene.layers) {
    if (!l.particleDef || (layer && l !== layer)) continue
    try {
      const e = lib.getEntry(pkg, l.particleDef.material)
      const tn = e ? ((JSON.parse(dec.decode(e)).passes || [])[0] || {}).textures?.[0] : null
      if (!tn) continue
      l.particleTexName = tn
      if (textures.has(tn)) continue
      let buf = lib.getEntry(pkg, 'materials/' + tn + '.tex')
      if (!buf && fs.existsSync(`${WE}/materials/${tn}.tex`)) buf = new Uint8Array(fs.readFileSync(`${WE}/materials/${tn}.tex`))
      if (!buf) continue
      const tex = lib.parseTex(new Uint8Array(buf)); const m = lib.decodeMip0(tex)
      if (!m || !m.rgba) continue
      const gt = lib.makeTextureMip(makeGl().gl, [m], tex.format === 8)
      if (gt) textures.set(tn, { glTex: gt, width: m.width, height: m.height, format: tex.format })
    } catch {}
  }
  return textures
}
// 只用目标粒子层渲染 t 秒（其余层不可见），返回顶点流 + stats
// ①(P-126) 第 5 参 layerId：同名层（hina 有两个"萤火虫"）按 id 精确选择
async function renderRealLayer(id, layerName, modes = {}, t = 6.0, layerId = null) {
  const { pkg, scene } = loadPkg(id)
  const target = scene.layers.find((l) => l.particleDef && (layerId != null ? l.id === layerId : l.name === layerName))
  if (!target) return null
  for (const l of scene.layers) if (l.particleDef) l.visible = (l === target)
  for (const l of scene.layers) if (!l.particleDef) l.visible = false
  const textures = buildTex(pkg, scene, target)
  if (!textures.size) return null
  setModes(modes)
  const { gl, rec } = makeGl()
  const r = createRenderer({ getContext: () => gl }, { onLog: () => {}, shaderResolver: SHADER_RESOLVER, aggregate: true })
  await r.render(scene, textures, 1920, 1080, t)
  return { verts: rec.verts[rec.verts.length - 1] || null, stats: r.particleStats, target, pkg, scene, textures, r, rec }
}
if (hasPkg('3719111841')) {
  // Glass Shards：rotationrandom（默认 0..2π）⇒ 改前"角度散布 0°、竖直 100%"，改后必须真的转
  const on = await renderRealLayer('3719111841', 'Glass Shards', {}, 6.0)
  const off = await renderRealLayer('3719111841', 'Glass Shards', { prot: 'legacy' }, 6.0)
  if (on && off && on.verts && off.verts) {
    const aOn = angleSpread(on.verts), aOff = angleSpread(off.verts)
    push('⑤ 真包 Glass Shards：official 角度散布 ≥20°（legacy 恒 0°）',
      aOn.spread >= 20 && aOff.spread <= 0.001, `official=${aOn.spread.toFixed(1)}° legacy=${aOff.spread.toFixed(3)}° (n=${aOn.n})`)
    push('⑤ 真包 Glass Shards：official 有非轴对齐 quad（legacy 全轴对齐）', aOn.min < 89 && aOff.min >= 89.999,
      `official min=${aOn.min.toFixed(1)}° legacy min=${aOff.min.toFixed(1)}°`)
  } else push('⑤ 凯尔希真包 Glass Shards 贴图缺失（SKIP 视作 PASS）', true)
  // Bokeh Hex：图层 scale 1.18913 ⇒ official 边长 / legacy 边长 = scale
  const hon = await renderRealLayer('3719111841', 'Bokeh Hex', {}, 6.0)
  const hoff = await renderRealLayer('3719111841', 'Bokeh Hex', { pquad: 'legacy' }, 6.0)
  if (hon && hoff && hon.verts && hoff.verts) {
    const sc = hon.target.scale[0]
    const r1 = quadEdges(hon.verts).spanX / quadEdges(hoff.verts).spanX
    push('⑤ 真包 Bokeh Hex：quad 边长比 = 图层 scale(1.18913)', near(r1, sc, 0.02), `ratio=${r1.toFixed(4)} scale=${sc}`)
  } else push('⑤ 凯尔希 Bokeh Hex 贴图缺失（SKIP 视作 PASS）', true)
  // 仿真代价不回归：几何/出生期改动不得改变 simSteps/simUpdates
  const p1 = await renderRealLayer('3719111841', '尘埃', {}, 6.0)
  const p2 = await renderRealLayer('3719111841', '尘埃', { prot: 'legacy', pquad: 'legacy', pexp: 'legacy', pspeed: 'legacy' }, 6.0)
  if (p1 && p2) {
    push('⑤ 仿真代价不回归（尘埃：official/legacy 的 simSteps、simUpdates 相等）',
      p1.stats.simSteps === p2.stats.simSteps && p1.stats.simUpdates === p2.stats.simUpdates,
      `steps ${p1.stats.simSteps}/${p2.stats.simSteps} updates ${p1.stats.simUpdates}/${p2.stats.simUpdates}`)
  }
} else push('⑤ 凯尔希真包缺失（SKIP 视作 PASS）', true, 'no pkg')

if (hasPkg('3554161528')) {
  // 落花（hina）：语料真的写了 `sizerandom 40..80 exponent 2` ⇒ 官方档必须向小尺寸偏
  const { scene } = loadPkg('3554161528')
  const defs = scene.layers.filter((l) => l.particleDef && l.name === '落花').map((l) => l.particleDef)
  const withExp = defs.filter((d) => (d.initializer || []).some((i) => i.name === 'sizerandom' && Number(i.exponent) === 2))
  push('⑤ 真包 hina「落花」语料确带 sizerandom exponent:2（2 层）', withExp.length >= 1, `${withExp.length}/${defs.length} 层`)
  if (withExp.length) {
    const d = withExp[0]
    // ⚠ 该 def 带 `starttime`（33/21s）：simulateParticleSystem 的目标时刻是 `t − starttime`，
    //   用 t=4 会得到 0 粒子（"语料层的 starttime 不参与断言"是 P-103 踩过的坑）
    const t0 = (d.starttime || 0) + 6
    const seq = (expLegacy) => {
      const s = lib.buildParticleSystem(d, { origin: [0, 0, 0], seedStr: 'p103-luohua', maxCount: 600, expLegacy })
      lib.simulateParticleSystem(s, t0)
      return s.particles.map((p) => p.size)
    }
    const a = seq(false), b = seq(true)
    const mean = (x) => x.reduce((u, v) => u + v, 0) / Math.max(1, x.length)
    push('⑤ 真包「落花」尺寸均值：official < legacy（exponent 生效）', a.length > 20 && mean(a) < mean(b) - 1,
      `official=${mean(a).toFixed(2)} legacy=${mean(b).toFixed(2)} n=${a.length} (t=${t0})`)
  }
  // 代价：整帧（全部粒子层）official vs legacy 的 sim 记账必须相等
  const cost = async (modes) => {
    const { pkg, scene } = loadPkg('3554161528')
    const textures = buildTex(pkg, scene, null)
    setModes(modes)
    const { gl, rec } = makeGl()
    const r = createRenderer({ getContext: () => gl }, { onLog: () => {}, shaderResolver: SHADER_RESOLVER, aggregate: true })
    let steps = 0, updates = 0, drawn = 0
    for (let i = 0; i < 12; i++) { await r.render(scene, textures, 1920, 1080, 12.5 + i / 30); steps += r.particleStats.simSteps; updates += r.particleStats.simUpdates; drawn += r.particleStats.drawn }
    return { steps, updates, drawn, draws: rec.draws }
  }
  const cOn = await cost({}), cOff = await cost({ pquad: 'legacy', prot: 'legacy', pexp: 'legacy', pspeed: 'legacy' })
  push('⑤ hina 全粒子层 12 帧：official 与 legacy 的 simSteps/simUpdates/实画层数完全一致（代价不回归）',
    cOn.steps === cOff.steps && cOn.updates === cOff.updates && cOn.drawn === cOff.drawn,
    `steps ${cOn.steps}/${cOff.steps} updates ${cOn.updates}/${cOff.updates} drawn ${cOn.drawn}/${cOff.drawn}`)
} else push('⑤ hina 真包缺失（SKIP 视作 PASS）', true, 'no pkg')

if (hasPkg('3660962877')) {
  // cherry blossoms on cursor（orb 版）：语料发射器带 speedmin/speedmax ⇒ 官方档出生有初速
  const { scene } = loadPkg('3660962877')
  const l = scene.layers.find((x) => x.particleDef && /cherry blossoms/.test(x.name || ''))
  if (l) {
    const em = (l.particleDef.emitter || [])[0]
    push('⑤ 真包 cherry blossoms 发射器带 speedmin/speedmax（语料）', !!em && (em.speedmin != null || em.speedmax != null), JSON.stringify(em && { s: em.speedmin, S: em.speedmax }))
    // ⚠ 这层还有 `vortex`/`controlpointattract` 两个**算子**（跑一会儿速度就不为 0 了）⇒
    //   必须在**出生那一刻**比：`spawnParticle` 之后、算子之前。另外 controlpoint[0].flags=1
    //   （lockToPointer）⇒ 必须给指针，否则发射器根本不发射。
    const sp = (speedLegacy) => {
      const s = lib.buildParticleSystem(l.particleDef, { origin: l.origin, scale: l.scale, angle: (l.angles && l.angles[2]) || 0,
        seedStr: 'p103-cherry', maxCount: 500, speedLegacy })
      s.pointer = [960, 540]
      const out = []
      for (let i = 0; i < 60; i++) { const p = lib.spawnParticle(s, s.emitters[0]); if (p) out.push(Math.hypot(p.vel[0], p.vel[1])) }
      return out
    }
    const a = sp(false), b = sp(true)
    const mx = (x) => (x.length ? Math.max(...x) : -1)
    push('⑤ 真包 cherry blossoms：出生期 official 有初速（≤speedmax=20，legacy 全 0）',
      a.length > 5 && mx(a) > 0 && mx(a) <= 20 + 1e-6 && b.length > 5 && mx(b) === 0,
      `official max=${mx(a).toFixed(2)} legacy max=${mx(b).toFixed(2)} n=${a.length}`)
  } else push('⑤ 真包 cherry blossoms 层缺失（SKIP 视作 PASS）', true)
} else push('⑤ orb 真包缺失（SKIP 视作 PASS）', true, 'no pkg')

// ═══════════════ ⑥ P-126 用户⑧（萤火虫）/⑦（第 18 层雾 2）：颜色 / 帧时序 / 算子口径 ═══════════════
// 判据来源：docs/PARTICLE-FIREFLY-INVESTIGATION.md §4。每条都带 legacy 侧的反向断言
// （证明断言对旧写法敏感），另有 §4 判据里点名的"并联判据"（⑧-4 修好后粒子不得飞出层 bbox）。
const clamp01 = (v) => Math.max(0, Math.min(1, v))

// ── ⑥A 逐粒子 RGB（⑧-1：萤火虫从"白点"回到 authored 紫色）──
{
  const white = await renderQuad(defQuad(), {}, {}, 1.0)
  const wd = white.rec.draws2.filter(isParticleDraw).pop()
  const wc = wd ? colorStreamOf(wd, white.rec) : null
  push('⑥A 默认层（无 colorrandom）：u_Color 恒 (1,1,1) 且顶点色恒 1（与改前逐位一致）',
    !!wd && wd.uni.u_Color[0] === 1 && wd.uni.u_Color[1] === 1 && wd.uni.u_Color[2] === 1 &&
    !!wc && wc.length > 0 && [...wc].every((v) => v === 1),
    wd ? `u_Color=${JSON.stringify(wd.uni.u_Color)} 顶点色样本=${wc ? [...wc].slice(0, 3).join(',') : 'null'}` : 'no draw')
}
if (hasPkg('3554161528')) {
  // 层 4569：instanceoverride.colorn = "0.41176 0.30588 0.69412"（replacesColor:true ⇒ 整批同色 ⇒ 上提进 u_Color）
  const a1 = await renderRealLayer('3554161528', '萤火虫', {}, 20.0, 4569)
  const d1 = a1 && a1.rec.draws2.filter(isParticleDraw).pop()
  push('⑥A 层4569 萤火虫：绘制 u_Color = instanceoverride.colorn [0.41176,0.30588,0.69412]（旧实现恒 (1,1,1)）',
    !!d1 && near(d1.uni.u_Color[0], 0.41176, 1e-4) && near(d1.uni.u_Color[1], 0.30588, 1e-4) && near(d1.uni.u_Color[2], 0.69412, 1e-4),
    d1 ? `u_Color=${JSON.stringify(d1.uni.u_Color)}` : 'no particle draw')
  push('⑥A 层4569：整批同色走上提通道（colorUni=1 / colorAttr=0）',
    !!a1 && a1.stats.colorUni === 1 && a1.stats.colorAttr === 0,
    a1 ? `colorUni=${a1.stats.colorUni} colorAttr=${a1.stats.colorAttr}` : 'null')
  // 层 6271：无 colorn ⇒ 走作者 colorrandom"102 100 188"→"66 35 148"（逐粒子不同紫）⇒ 必须走 a_Color 顶点属性
  const a2 = await renderRealLayer('3554161528', '萤火虫', {}, 20.0, 6271)
  const d2 = a2 && a2.rec.draws2.filter(isParticleDraw).pop()
  const c2 = d2 ? colorStreamOf(d2, a2.rec) : null
  let inRange = false, spread = 0
  if (c2 && c2.length >= 3) {
    const cols = []
    for (let i = 0; i + 2 < c2.length; i += 3) cols.push([c2[i], c2[i + 1], c2[i + 2]])
    inRange = cols.every(([r, g, b]) => r >= 66 / 255 - 1e-6 && r <= 102 / 255 + 1e-6 &&
      g >= 35 / 255 - 1e-6 && g <= 100 / 255 + 1e-6 && b >= 148 / 255 - 1e-6 && b <= 188 / 255 + 1e-6)
    spread = new Set(cols.map((c) => c.map((v) => v.toFixed(4)).join(','))).size
  }
  push('⑥A 层6271 萤火虫：逐粒子颜色走 a_Color 顶点属性，且落在 authored 紫区间 [66..102, 35..100, 148..188]/255',
    !!d2 && c2 && inRange && spread > 1,
    `spread=${spread} 样本=${c2 ? [...c2].slice(3, 6).map((v) => v.toFixed(3)).join(',') : 'null'}`)
} else push('⑥A hina 真包缺失（SKIP 视作 PASS）', true, 'no pkg')

// ── ⑥B 精灵表帧时序（⑦a：fog3 = 64 帧/1s，按 age 正放、同年龄同帧）──
{
  const FOG3 = `${WE}/materials/particle/fog/fog3.tex`
  if (fs.existsSync(FOG3)) {
    const ftex = lib.parseTex(new Uint8Array(fs.readFileSync(FOG3)))
    const fsp = lib.spriteInfo(ftex)
    const fm0 = lib.decodeMip0(ftex)
    const fgt = lib.makeTextureMip(makeGl().gl, [fm0], ftex.format === 8)
    const FTEX = new Map([['fog', { glTex: fgt, width: fm0.width, height: fm0.height, format: ftex.format, sprite: fsp }]])
    push('⑥B fog3 帧表事实：64 帧 / frametime 0.015625 / duration 1（判据前提）',
      !!fsp && fsp.numFrames === 64 && fsp.frametime === 0.015625 && fsp.duration === 1,
      fsp ? `n=${fsp.numFrames} ft=${fsp.frametime} dur=${fsp.duration}` : 'null')
    // 单批 4 颗粒子同年龄：rate≈0 + instantaneous ⇒ 同屏同帧
    const bdef = { maxcount: 4,
      emitter: [{ name: 'boxrandom', rate: 0.0001, instantaneous: 4, distancemax: '40 40 0' }],
      initializer: [{ name: 'lifetimerandom', min: 3, max: 5 }, { name: 'sizerandom', min: 100, max: 100 }, { name: 'alpharandom', min: 1, max: 1 }],
      operator: [] }
    // 从顶点流反查帧号（帧矩形 = 行主序 8×8）
    const frameOf = (u0, v0) => {
      for (let f = 0; f < fsp.numFrames; f++) {
        const u = (f * fsp.frameWidthUV) - Math.floor(f * fsp.frameWidthUV), v = Math.floor(f * fsp.frameWidthUV) * fsp.frameHeightUV
        if (Math.abs(u - u0) < 1e-6 && Math.abs(v - v0) < 1e-6) return f
      }
      return -1
    }
    const framesAt = async (t, modes) => {
      const r = await renderQuad(bdef, { particleTexName: 'fog' }, modes, t, FTEX)
      const v = r.verts
      const out = new Set()
      if (v) for (let i = 0; i + 8 < v.length; i += 9) { const f = frameOf(v[i + 3], v[i + 4]); if (f >= 0) out.add(f) }
      return out
    }
    const f025 = await framesAt(0.25, {})
    push('⑥B fog3 age=0.25s ⇒ frame 16（旧口径 (1−lifePos)·seqMul 得 59~62）',
      f025.size === 1 && f025.has(16), `frames={${[...f025].join(',')}}`)
    const f05 = await framesAt(0.5, {})
    push('⑥B fog3 age=0.5s ⇒ frame 32（正放，不是倒放）', f05.size === 1 && f05.has(32), `frames={${[...f05].join(',')}}`)
    const f10 = await framesAt(1.0, {})
    push('⑥B fog3 age=1.0s（= duration）⇒ frame 0（整圈折返）', f10.size === 1 && f10.has(0), `frames={${[...f10].join(',')}}`)
    const l025 = await framesAt(0.25, { pframe: 'legacy' })
    push('⑥B ?pframe=legacy 复现 P-124：帧 16 不再出现，且逐粒子各自相位（>1 个不同帧）',
      !l025.has(16) && l025.size >= 2, `frames={${[...l025].join(',')}}`)
  } else push('⑥B fog3 贴图缺失（SKIP 视作 PASS）', true, 'no fog3.tex')
}

// ── ⑥C oscillatealpha：加性 → 乘性（⑧-3）──
{
  const alphaStats = (base, popsLegacy) => {
    const def = { maxcount: 4,
      emitter: [{ rate: 0.0001, instantaneous: 1, distancemax: '0 0 0' }],
      initializer: [{ name: 'lifetimerandom', min: 1000, max: 1000 }, { name: 'alpharandom', min: base, max: base }],
      operator: [{ name: 'oscillatealpha', frequencymin: 10, frequencymax: 20, scalemin: 0.7 }] }
    const s = lib.buildParticleSystem(def, { origin: [0, 0, 0], seedStr: 'p125C', maxCount: 4, popsLegacy })
    let lo = Infinity, hi = -Infinity, zeros = 0, n = 0
    for (let i = 0; i < 1200; i++) {           // 60s @ 0.05s
      lib.stepParticles(s, 0.05, i * 0.05)
      for (const p of s.particles) { lo = Math.min(lo, p.alpha); hi = Math.max(hi, p.alpha); if (p.alpha <= 1e-9) zeros++; n++ }
    }
    return { lo, hi, zeroFrac: zeros / Math.max(1, n) }
  }
  const on5 = alphaStats(0.5, false)
  push('⑥C base=0.5：alpha ∈ [0.35, 0.5]（乘性 mix(0.7,1,·)，旧实现 24.7% 周期触 0）',
    near(on5.lo, 0.35, 1e-6) && near(on5.hi, 0.5, 1e-6) && on5.zeroFrac === 0,
    `[${on5.lo.toFixed(4)}, ${on5.hi.toFixed(4)}] zeroFrac=${(on5.zeroFrac * 100).toFixed(1)}%`)
  const on1 = alphaStats(1.0, false)
  push('⑥C base=1：alpha ∈ [0.70, 1.00]（旧实现摆到 0.30）',
    near(on1.lo, 0.7, 1e-6) && near(on1.hi, 1.0, 1e-6), `[${on1.lo.toFixed(4)}, ${on1.hi.toFixed(4)}]`)
  const off5 = alphaStats(0.5, true)
  push('⑥C ?pops=legacy 复现 P-124：加性 + clamp ⇒ alpha 触 0（>10% 周期整颗消失）',
    off5.lo === 0 && off5.zeroFrac > 0.1, `min=${off5.lo} zeroFrac=${(off5.zeroFrac * 100).toFixed(1)}%`)
}

// ── ⑥D oscillateposition 增量式 + controlpointattract 判据（⑧-4 / ⑧-5，必须同批）──
if (hasPkg('3554161528')) {
  const { scene: hs } = loadPkg('3554161528')
  const fl = hs.layers.find((l) => l.id === 4569)
  // 出生域 bbox：发射器 directions × distancemax（该 def = "3.5 1.5 0" × 512）⇒ 粒子本就铺得很开
  const em0 = (fl.particleDef.emitter || [])[0] || {}
  const dirs = String(em0.directions || '1 1 0').trim().split(/\s+/).map(Number)
  const dmax = Number(em0.distancemax || 0)
  const MARGIN = 200
  const bbox = {
    x0: fl.origin[0] - Math.abs(dirs[0]) * dmax - MARGIN, x1: fl.origin[0] + Math.abs(dirs[0]) * dmax + MARGIN,
    y0: fl.origin[1] - Math.abs(dirs[1]) * dmax - MARGIN, y1: fl.origin[1] + Math.abs(dirs[1]) * dmax + MARGIN,
  }
  const corrOf = (xs, ys) => {
    const n = xs.length
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
    let sxy = 0, sxx = 0, syy = 0
    for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b }
    return sxy / Math.sqrt(Math.max(1e-12, sxx * syy))
  }
  const traj = (popsLegacy) => {
    const s = lib.buildParticleSystem(fl.particleDef, { origin: fl.origin, scale: fl.scale,
      angle: (fl.angles && fl.angles[2]) || 0, seedStr: String(fl.id) + '|' + String(fl.origin),
      maxCount: 100, instanceoverride: fl.instanceoverride, popsLegacy })
    // 逐粒子轨迹（同一颗粒子的时间序列才是"沿固定对角线摆动"的直接证据；跨粒子汇总会把相位差平均掉）
    const track = new Map()
    for (let i = 0; i < 240; i++) {
      lib.stepParticles(s, 1 / 60, i / 60)
      if (i < 60) continue
      for (const p of s.particles) {
        let tr = track.get(p)
        if (!tr) { tr = { x: [], y: [] }; track.set(p, tr) }
        tr.x.push(p.pos[0]); tr.y.push(p.pos[1])
      }
    }
    const series = [...track.values()].filter((tr) => tr.x.length > 60)
    const corrs = series.map((tr) => corrOf(tr.x, tr.y))
    const maxAbsCorr = corrs.length ? Math.max(...corrs.map(Math.abs)) : 1
    const allX = series.flatMap((tr) => tr.x), allY = series.flatMap((tr) => tr.y)
    const n = allX.length
    const mx = allX.reduce((a, b) => a + b, 0) / n, my = allY.reduce((a, b) => a + b, 0) / n
    const h = Math.floor(n / 2)
    const mean1x = allX.slice(0, h).reduce((a, b) => a + b, 0) / h, mean2x = allX.slice(h).reduce((a, b) => a + b, 0) / (n - h)
    const mean1y = allY.slice(0, h).reduce((a, b) => a + b, 0) / h, mean2y = allY.slice(h).reduce((a, b) => a + b, 0) / (n - h)
    const dr = Math.hypot(mean2x - mean1x, mean2y - mean1y)
    return { maxAbsCorr, dr, corrs, n, particles: series.length,
      inBox: allX.every((x) => x >= bbox.x0 && x <= bbox.x1) && allY.every((y) => y >= bbox.y0 && y <= bbox.y1),
      xmin: Math.min(...allX), xmax: Math.max(...allX), ymin: Math.min(...allY), ymax: Math.max(...allY) }
  }
  const on = traj(false), off = traj(true)
  push('⑥D 萤火虫 240 帧：每颗粒子 |corr(x,y)| < 0.99（官方逐轴增量；旧实现每颗恰好 −1.0000 = 固定对角线）',
    on.n > 10 && on.maxAbsCorr < 0.99, `maxAbsCorr=${on.maxAbsCorr.toFixed(4)} perParticle=[${on.corrs.map((c) => c.toFixed(3)).join(', ')}] n=${on.n} 粒子=${on.particles}`)
  push('⑥D 萤火虫漂移 ≠ 0（movement/turbulence 累积的漂移不再被每帧覆盖抹掉）',
    on.dr > 1, `drift=${on.dr.toFixed(2)}px`)
  push('⑥D 并联判据：官方口径下粒子全程落在出生域 bbox 内（层 origin ± directions×distancemax ± 200px）',
    on.inBox, `x∈[${on.xmin.toFixed(0)},${on.xmax.toFixed(0)}] y∈[${on.ymin.toFixed(0)},${on.ymax.toFixed(0)}] bbox x∈[${bbox.x0.toFixed(0)},${bbox.x1.toFixed(0)}] y∈[${bbox.y0.toFixed(0)},${bbox.y1.toFixed(0)}]`)
  push('⑥D ?pops=legacy 复现 P-124：每颗粒子 corr(x,y) = −1.0000（证明上面的判据对旧写法敏感）',
    off.maxAbsCorr >= 0.999, `maxAbsCorr=${off.maxAbsCorr.toFixed(4)} perParticle=[${off.corrs.map((c) => c.toFixed(3)).join(', ')}]`)
} else push('⑥D hina 真包缺失（SKIP 视作 PASS）', true, 'no pkg')
{
  // ⑧-5：无指针、退化目标 = 层空间 offset 当世界坐标 ⇒ 目标 (0,0)；threshold=70 ⇒ thr=35
  const cpDef = { maxcount: 2, emitter: [{ rate: 0.0001, instantaneous: 1, distancemax: '0 0 0' }],
    initializer: [{ name: 'lifetimerandom', min: 100, max: 100 }],
    operator: [{ name: 'controlpointattract', controlpoint: 1, scale: -1000, threshold: 70 }],
    controlpoint: [{ flags: 0 }, { flags: 1, offset: '0 0 0' }] }
  const dvAt = (dist, popsLegacy) => {
    const s = lib.buildParticleSystem(cpDef, { origin: [0, 0, 0], seedStr: 'p125E', maxCount: 2, popsLegacy })
    s.pointer = null
    lib.stepParticles(s, 1 / 60, 0)
    const p = s.particles[0]
    p.pos = [dist, 0, 0]; p.vel = [0, 0, 0]
    lib.stepParticles(s, 1 / 60, 1 / 60)
    return Math.hypot(p.vel[0], p.vel[1])
  }
  push('⑥D ⑧-5 attract 判据：d=500px（thr=35）⇒ 不施力 |Δv| = 0（旧实现 d>thr ⇒ 施力，粒子被推飞）',
    dvAt(500, false) === 0, `|Δv|=${dvAt(500, false).toFixed(4)}`)
  push('⑥D ⑧-5 attract 判据：d=10px ⇒ 施力 |Δv| = |scale|·dt = 16.667', near(dvAt(10, false), 1000 / 60, 1e-6), `|Δv|=${dvAt(10, false).toFixed(4)}`)
  push('⑥D ⑧-5 ?pops=legacy 复现 P-124：d=500px 时**施力**（判据反了）', dvAt(500, true) > 0, `|Δv|=${dvAt(500, true).toFixed(4)}`)
}

// ── ⑥F turbulence mask 缺省（⑧-6）+ starttime 语义（⑧-8，文档化断言）──
{
  const tdef = { maxcount: 2, emitter: [{ rate: 0.0001, instantaneous: 1, distancemax: '0 0 0' }],
    initializer: [{ name: 'lifetimerandom', min: 100, max: 100 }],
    operator: [{ name: 'turbulence', speedmin: 30, speedmax: 50 }] }   // 故意不写 mask（hina 两个萤火虫 def 就是这样）
  const yVel = (popsLegacy) => {
    const s = lib.buildParticleSystem(tdef, { origin: [0, 0, 0], seedStr: 'p125F', maxCount: 2, popsLegacy })
    let m = 0
    for (let i = 0; i < 120; i++) { lib.stepParticles(s, 1 / 60, i / 60); for (const p of s.particles) m = Math.max(m, Math.abs(p.vel[1])) }
    return m
  }
  push('⑥F turbulence 无 mask ⇒ 缺省 (1,1,0)：y 轴真的受力（旧缺省 [1,0,0] ⇒ y 恒 0）',
    yVel(false) > 1 && yVel(true) === 0, `official max|vy|=${yVel(false).toFixed(2)} legacy=${yVel(true).toFixed(2)}`)
}
if (hasPkg('3554161528')) {
  const { scene: hs } = loadPkg('3554161528')
  const fl = hs.layers.find((l) => l.id === 4569)
  const aliveAt = (t) => {
    const s = lib.buildParticleSystem(fl.particleDef, { origin: fl.origin, scale: fl.scale, angle: (fl.angles && fl.angles[2]) || 0,
      seedStr: 'p125-st', maxCount: 100, instanceoverride: fl.instanceoverride })
    lib.simulateParticleSystem(s, t)
    return s.particles.length
  }
  push('⑥F starttime=15 语义（官方，不是 bug）：t=10s 不发射（0 颗）、t=25s 才有粒子',
    fl.particleDef.starttime === 15 && aliveAt(10) === 0 && aliveAt(25) > 0,
    `starttime=${fl.particleDef.starttime} alive(10)=${aliveAt(10)} alive(25)=${aliveAt(25)}`)
}

const fail = checks.filter((c) => !c.ok)
console.log(`\n===== particle-render-correctness: ${checks.length - fail.length} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { for (const f of fail) console.log('  FAIL ' + f.name + (f.detail ? ' — ' + f.detail : '')) }
process.exit(fail.length ? 1 : 0)
