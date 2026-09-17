// pointer-leave-test.mjs —— ①(§7-H 2026-09-18) 台账缺口：**指针离开画布后，lockToPointer 发射器还在不在发射**
//
// 缺口原文（§7-H）："当指针**离开**画布/舞台后，发射器可能**仍在发射**（把已离开的坐标继续喂给壁纸），
//   我们**没有**一条回归断言把'离开后不再发射'钉死。"
//
// 本文件把这条钉死，方法是**假 DOM + 假事件目标 + mock-GL**（写法与 `tests/mock-gl-test.mjs` 同源：
//   同一仓库、同一 createRenderer 入口、同一个假 canvas/gl 代理），把渲染器真源码切出来跑真帧：
//
//   ① 绿前提（没有它后面的红没有意义）：画布内 `pointermove` ⇒ 发射器**确实发射**，且基准点 = 按
//      "画布归一化 × 相机取景窗口"换算出的**设计坐标**（用"画布正中 ⇒ 投影中心"这个与取景无关的
//      不变量钉死 x/y，而不是把 `__pointerDesignFromNorm` 的公式抄一遍）；
//   ② 核心：`pointerleave` ⇒ 之后**不再新增发射**（累计发射计数冻结；连续 3 帧、每帧推进时间）；
//   ③ 反假绿：再派发一次 `pointermove` ⇒ **恢复发射**（防止有人把功能整个关掉来"通过"）；
//   ④ 不误伤：同帧里**非锁定**粒子层照常发射（离开门只作用在 lockToPointer 发射器上）。
//
// ── 依据（只读，未改渲染路径）──────────────────────────────────────────────────────────────
//   · `core/we-scene-bundle.js:6616 __hookPointer()`：在 `gl.canvas` 上装三个监听
//     ——`pointermove`/`pointerdown`（记录归一坐标）+ `pointerleave`（`__pointerN = null`）；
//   · `core/we-scene-bundle.js:6644 __pointerDesign(cam)`：指针来源优先级 = `window.__mpwPointer`
//     注入（`inside !== false` 才认）> 画布归一坐标 `__pointerN`；两者都没有 ⇒ null；
//   · `core/we-scene-bundle.js:9559-9560`：每帧 `__ptrNow = CURSOR_OFF ? null : __pointerDesign(cam)`，
//     且**只有 `__ptrNow` 为真时**才 `__hookPointer()`；
//   · `core/we-scene-bundle.js:3352 spawnParticle`：`em.__ptrLocked && !sys.pointer` ⇒ **不发射**
//     （`sys.__ptrSkipped++`）。这就是"离开后停发"的落点。
//
// ── 用法 ─────────────────────────────────────────────────────────────────────────────────
//   node tests/pointer-leave-test.mjs [--only <名字子串>]... [--no-mutation] [--verbose]
//     --only <子串>   只跑名字含该子串的断言（可多次；一个都没匹配到 ⇒ 用法错误退出 2）
//     --no-mutation   跳过内置的"红-if-reverted"自检（见下）
//     --verbose       额外打印每帧台账（监听集合 / sys.pointer / 累计发射 / __ptrSkipped）
//   环境变量：
//     MPW_ROOT              工作区根（默认 /root/Desktop/DSHarea）—— 只用于真包条件项
//     MPW_POINTER_BUNDLE    备用渲染器**副本**的绝对路径（内置红-if-reverted 用它拉变异体；
//                           平时不要设，设了就等于"测的是副本"）
//   退出码：0 = 全过（含 SKIP / XFAIL）；1 = 有真失败；2 = 用法错误。
//
// ── 条件项约定（不许假绿）────────────────────────────────────────────────────────────────
//   · 缺语料/夹具 ⇒ 打 `SKIP pointer-leave <条目> — <原因>`，**不计票**，不影响退出码；
//     本文件唯一依赖外部数据的是「E 真包」一节（`$MPW_ROOT/allwallpaper/dd/3554161528/scene.pkg`）。
//   · 另一种条件项 = 内置红-if-reverted 的**变异锚点**：若核心那几行被并行线改写导致锚点不命中，
//     打 `SKIP pointer-leave mutation-selfcheck — …`（不计票），绝不把"没法变异"伪装成"变异通过"。
//   · **XFAIL 不计入 pass**（单独计数、结尾单独打印）：用于"记录当前真实行为"的已知缺口（见下）。
//     缺口被修好时它会打 `★ XPASS`，提示把该条改成正断言 —— 两个方向都出声，不会静默。
//
// ── 本次实测的已知缺口（XFAIL，最小复现都在断言 detail 里）──────────────────────────────
//   G1 注入通道优先于画布事件：`window.__mpwPointer` 有值时，画布 `pointerleave` **被忽略**
//      （`__pointerDesign` 先看注入）⇒ 宿主若按"每次 pointermove 就写注入值"这种自然写法喂坐标
//      （仓库自己的取证脚本就是这么注入的），指针离开画布后发射器**继续在旧坐标发射**
//      （实测：离开后累计 39→54，基准点仍是 (800,400)）。
//      ⚠ 同一发 `pointerleave` 在注入撤掉后**立刻生效** ⇒ 事件确实到达了、是"优先级"把它盖住的。
//   G5 `inside:false` **不是"指针不在"**，只是"别信注入值"：注入被丢弃后会**回落到上一次画布内
//      pointermove 的归一坐标**（`core/we-scene-bundle.js:6664 if (__pointerN && cam) …`）⇒ 宿主按
//      `inside` 的语义声明"离开"时，发射器**继续在旧画布坐标发射**（实测：inside:false 后累计
//      189→276，基准点仍是 (1440,810)）。只有"画布从没记过坐标"时它才真的停（D1b 钉住了这一半）。
//   G2 只监听 `pointerleave`，**不监听** `pointerout`（+relatedTarget=null）等价路径。
//   G3 完全不碰 `blur`/`visibilitychange`，也没有 window/document 级监听（本 harness 里没有
//      `document` 全局，全程无异常 ⇒ 渲染器确实一行都没引用）。
//   G4 **自举死锁（本项最重）**：`__hookPointer()` 只在 `__ptrNow` 为真时被调用，而 `__ptrNow` 只能
//      来自"注入"或"钩子已经装好"⇒ 页面不注入就永远装不上钩子。全仓库 grep：`__mpwPointer` 的
//      生产者**只有 bundle 自身**（`demo.html` 的 window pointermove 是日志面板拖动，不是它）
//      ⇒ 出货页面（`demo.html` → `./bundle.js` = core/we-scene-bundle.js）里 lockToPointer 发射器
//      **一次都不发射**，"鼠标拖尾"是死的。这一条不改代码就没法转绿（G4 因此是 XFAIL 而不是 FAIL）。
//
// ── 内置红-if-reverted（真跑到，数字见回报与下方 `M1/M2` 断言）──────────────────────────
//   把 `core/` 整目录复制进 `mkdtemp` 临时目录（**绝不改真树**；副本里是**真文件不是软链**，
//   否则 ESM 会把软链解析回真树、变异白做），对副本做两种最小变异后用 `MPW_POINTER_BUNDLE=<副本>`
//   起一个子进程跑本文件，要求：子进程 rc=1 且输出含 `✗ P3a`。
//     M1：删掉 `el.addEventListener('pointerleave', () => { __pointerN = null }, …)` 整行
//     M2：把该行处理器改成空操作（监听还在、行为回到旧写法）
//   两种变异实测都：子进程 rc=1，失败断言 = `P3a`（离开前累计=55；离开后=63,71,79 = 一直在发射），
//   且 `A3a`/`P4a`（绿前提与恢复发射）在变异体里仍为 ✓ ⇒ 变异只打破"离开"语义，不是把整条路弄挂。
//   退出时 `rmSync` 清理临时目录。
//
// ── 本轮实测证据（本机：Node 24 + mock-GL + 假 DOM，无 GPU/WebGL2）──────────────────────
//   · `node tests/pointer-leave-test.mjs` ⇒ rc=0，`ALL PASS （35 项，另记录缺口 5）`（真树那一刻的
//     `core/we-scene-bundle.js` sha256 = 316151160629303ebf48e119afaa982e806e…）。
//   · 关键数字：画布内 move(480,270) ⇒ 基准点 (480.0000,270.0000)、层累计 24→55；
//     pointerleave 后 3 帧累计 55,55,55（冻结）、alive=0,0,0、`__ptrSkipped`=6（被"无指针"门拦下）；
//     重新 move(1440,810) ⇒ 累计 55→118（恢复）。
//   · 真包（3554161528）id389 `cherry blossoms on cursor`：pointerCp=0、全部发射器挂指针；
//     无指针 0 粒（`__ptrSkipped`=60）、指针 (800,400) ⇒ 19 粒、max|Δx|=3.0 max|Δy|=2.7。
//   · ⚠ `core/we-scene-bundle.js` 在本轮进行中被**并行的 core 线**改过（我进来时 sha256=e30c64c6…，
//     收尾时 =31615116…，同一时间 HEAD 也 58e4535→343b6a3）—— 那不是我改的：本轮我只新增了本文件，
//     `core/**` 一个字节没写（下面 M 阶段的变异全在 mkdtemp 副本里做）。
//
// ── 注册待办 ─────────────────────────────────────────────────────────────────────────────
//   注册待办：`add "pointer-leave" "node tests/pointer-leave-test.mjs"`（等 run-all-tests.sh 释放后加）
//   —— 本轮 `tests/run-all-tests.sh` 被另一条线占用（dirty），按纪律**不改它**。
//
// 参照来源许可声明：本文件为原创测试代码，不含第三方实现代码（未复制/未翻译 wer-ref、we-layerd-ref、
//   oneincase/webwallgl）；假 DOM/mock-GL 写法取自**同一仓库**的 tests/mock-gl-test.mjs。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_root.mjs'

// ═══════════════════════════ 0. 用法/参数/退出码 ═══════════════════════════
const USAGE = `用法：node tests/pointer-leave-test.mjs [--only <名字子串>]... [--no-mutation] [--verbose]
  --only <子串>   只跑名字含该子串的断言（可多次）
  --no-mutation   跳过内置红-if-reverted 自检
  --verbose       打印每帧台账
退出码：0 全过（含 SKIP/XFAIL）/ 1 有失败 / 2 用法错误`
function usage(msg) { console.error('用法错误：' + msg + '\n' + USAGE); process.exit(2) }
const argv = process.argv.slice(2)
const ONLY = []
let VERBOSE = false, MUTATION = true
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--only') { const v = argv[++i]; if (!v || v.startsWith('--')) usage('--only 后面要跟名字子串'); ONLY.push(v) }
  else if (a === '--no-mutation') MUTATION = false
  else if (a === '--verbose') VERBOSE = true
  else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0) }
  else usage('未知参数 ' + a)
}
const want = (name) => ONLY.length === 0 || ONLY.some((s) => name.includes(s))

// ═══════════════════════════ 1. 真断言助手（真实计票）═══════════════════════════
let pass = 0, fail = 0, skip = 0, xfail = 0, xpass = 0
const failNames = []
const ok = (name, cond, detail) => {
  if (!want(name)) return
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { fail++; failNames.push(name); console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')) }
}
const note = (name, detail) => { if (want(name)) console.log('  · ' + name + (detail ? '  [' + detail + ']' : '')) }
const skipItem = (name, reason) => { if (want(name)) { skip++; console.log('  SKIP pointer-leave ' + name + ' — ' + reason) } }
// XFAIL：cond = **期望语义**（当前还没做到 ⇒ 记缺口、不计票）；做到了 ⇒ XPASS，同样不计票但大声报。
const xfailItem = (name, cond, detail) => {
  if (!want(name)) return
  if (cond) { xpass++; console.log('  ★ XPASS（缺口已闭合 ⇒ 请把这条改成 ok() 正断言） ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { xfail++; console.log('  ! XFAIL（已知缺口·不计票） ' + name + (detail ? '  — ' + detail : '')) }
}

// ═══════════════════════════ 2. 被测渲染器（默认真树；变异自检用副本）═══════════════════════════
const BUNDLE = process.env.MPW_POINTER_BUNDLE
  ? path.resolve(process.env.MPW_POINTER_BUNDLE)
  : path.join(ROOT, 'core', 'we-scene-bundle.js')
if (!fs.existsSync(BUNDLE)) usage('渲染器文件不存在：' + BUNDLE)
const IS_MUTANT_RUN = !!process.env.MPW_POINTER_BUNDLE
const lib = await import(pathToFileURL(BUNDLE).href)

// ═══════════════════════════ 3. 假 canvas / 假事件目标 / mock-GL ═══════════════════════════
const FRAME = 1 / 30
const RW = 1920, RH = 1080                 // 渲染尺寸 = 设计画布 = 假 canvas 的 CSS 尺寸（1:1 映射）
const LOCKED_ID = 9001, FREE_ID = 9002     // 9001 = lockToPointer 层；9002 = 普通层（对照）

const CONST = {
  LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81, ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B85,
  FRAMEBUFFER_COMPLETE: 0x8CD5, MAX_TEXTURE_SIZE: 0x0D33, NO_ERROR: 0, TEXTURE0: 0,
}
for (let i = 0; i < 8; i++) CONST['TEXTURE' + i] = i

/** 造一台"假事件目标画布 + mock-GL + 真 createRenderer"的台子。每个台子一个独立 renderer/粒子缓存。 */
function makeRig(tag) {
  const logs = []
  const fired = []
  const listeners = new Map()
  const draws = []
  const rect = { left: 0, top: 0, width: RW, height: RH, right: RW, bottom: RH, x: 0, y: 0 }
  let ids = 0, curUnit = 0, curProg = null
  const mk = (k) => ({ id: k + '#' + (++ids) })
  const canvas = {
    width: RW, height: RH, clientWidth: RW, clientHeight: RH, style: {},
    getContext: () => gl,
    getBoundingClientRect: () => rect,
    setAttribute: () => {},
    addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn) },
    removeEventListener: (t, fn) => { const a = listeners.get(t) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1) },
  }
  const handlers = {
    canvas,                                    // ← 关键：gl.canvas 必须是"有 addEventListener 的元素"，否则钩子装不上
    createTexture: () => mk('tex'), createFramebuffer: () => mk('fbo'), createBuffer: () => mk('buf'),
    createVertexArray: () => mk('vao'), createShader: () => mk('sh'), createProgram: () => mk('prog'),
    activeTexture: (u) => { curUnit = u }, useProgram: (p) => { curProg = p },
    drawArrays: (m, f, c) => draws.push({ prog: curProg && curProg.id, count: c }),
    getProgramParameter: (p, k) => (k === CONST.LINK_STATUS || k === CONST.COMPILE_STATUS) ? true
      : (k === CONST.ACTIVE_UNIFORMS ? 1 : k === CONST.ACTIVE_ATTRIBUTES ? 2 : null),
    getActiveUniform: () => ({ name: 'g_Texture0', type: 0x8B62 }),
    getActiveAttrib: (p, i) => ({ name: i === 0 ? 'a_Position' : 'a_TexCoord', size: i === 0 ? 3 : 2 }),
    getAttribLocation: (p, n) => n === 'a_Position' ? 0 : n === 'a_TexCoord' ? 1 : n === 'a_TexCoordB' ? 2 : n === 'a_Blend' ? 3 : n === 'a_Alpha' ? 4 : -1,
    getUniformLocation: (p, n) => ({ p, n }), getShaderParameter: () => true,
    checkFramebufferStatus: () => CONST.FRAMEBUFFER_COMPLETE, getError: () => CONST.NO_ERROR,
    getParameter: (k) => (k === CONST.MAX_TEXTURE_SIZE ? 4096 : 0), getShaderInfoLog: () => '', getProgramInfoLog: () => '',
  }
  const gl = new Proxy({}, {
    get(t, prop) {
      if (prop in handlers) return handlers[prop]
      if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return CONST[prop] !== undefined ? CONST[prop] : 1
      return () => {}
    },
  })
  const shaderResolver = async (rel) => (rel.endsWith('.vert')
    ? 'attribute vec3 a_Position; void main(){ gl_Position = vec4(a_Position,1.0); }'
    : 'void main(){ gl_FragColor = vec4(1.0); }')

  // 两个层用同一份发射参数，唯一差别：9001 的 def 有 `controlpoint[0].flags=1`（lockToPointer）
  // 且发射器显式挂在 cp0；9002 什么都没有（对照：不该被"离开"误伤）。
  const baseDef = (extra) => Object.assign({
    maxcount: 4000,
    emitter: [{ name: 'boxrandom', controlpoint: extra ? 0 : undefined, rate: 240, delay: 0,
      distancemin: '0 0 0', distancemax: '3 3 0', origin: '0 0 0', directions: '1 1 0', speedmin: 0, speedmax: 0 }],
    initializer: [{ name: 'lifetimerandom', min: 30, max: 30 }],   // 寿命 30s ⇒ 测试窗口内只增不减
  }, extra ? { controlpoint: [{ flags: 1, offset: '0 0 0' }] } : {})
  const mkLayer = (id, origin, def) => ({
    id, name: 'ptr-' + id, visible: true, animLayers: false, solid: false, isContainer: false,
    textureName: null, size: [400, 400], scale: [1, 1, 1], origin, angles: [0, 0, 0],
    alignment: 'center', color: [1, 1, 1], alpha: 1, brightness: 1, anim: undefined, effects: [],
    particle: 'p' + id, particleDef: def, particleTexName: 'ptr_tex', parallaxDepth: null, uvRect: undefined,
  })
  // 9001 的 authored origin 故意放在画布正中 (1920,1080)：旧实现（没实现 lockToPointer 时）的
  // "中心爆"就在那里 ⇒ 断言"出生点不在 origin 附近"= 防回退。
  const scene = {
    general: { orthogonalprojection: { width: RW, height: RH } }, camera: null,
    layers: [mkLayer(LOCKED_ID, [1920, 1080, 0], baseDef(true)), mkLayer(FREE_ID, [100, 100, 0], baseDef(false))],
    properties: {},
  }
  const textures = new Map([['ptr_tex', { glTex: { id: 'ptr_tex_gl' }, width: 64, height: 64 }]])
  const cache = new Map()
  const renderer = lib.createRenderer(canvas, {
    shaderResolver, onLog: (m) => logs.push(String(m)), particleSysCache: cache,
  })

  // ── 累计发射计数：跨"粒子系统重建"也单调 ──
  // 渲染器按输入签名缓存粒子系统；指针坐标一变签名就变 ⇒ 重建 ⇒ `particles` 从 0 重放。
  // 所以不能直接看 `particles.length`（会掉回 0），要按"同一实例内的增量"累加。
  const trackers = new Map()
  const trk = (id) => {
    if (!trackers.has(id)) trackers.set(id, { sys: null, lastLen: 0, emitted: 0 })
    const t = trackers.get(id)
    return {
      sample() {
        const entry = cache.get(id)
        const sys = entry && entry.sys
        if (!sys) return { sys: null, alive: 0, emitted: t.emitted, pointer: null, skipped: 0, rebuilt: false, sig: entry && entry.sig }
        const rebuilt = sys !== t.sys
        if (rebuilt) { t.sys = sys; t.lastLen = 0 }
        const len = sys.particles ? sys.particles.length : 0
        if (len > t.lastLen) t.emitted += len - t.lastLen
        t.lastLen = len
        return { sys, alive: len, emitted: t.emitted, pointer: sys.pointer, skipped: sys.__ptrSkipped || 0, rebuilt, sig: entry.sig }
      },
      reset() { t.sys = null; t.lastLen = 0 },
    }
  }
  let t = 0, frameNo = 0
  return {
    tag, canvas, gl, cache, scene, textures, renderer, logs, draws, listeners, fired, trk,
    get time() { return t },
    get frameNo() { return frameNo },
    /** 推进一帧（时间严格递增 1/30s） */
    async frame() { t += FRAME; frameNo++; return renderer.render(scene, textures, RW, RH, t) },
    /** 派发一个画布事件（只给真装上的监听器；没有监听器 = 真事件也到不了） */
    fire(type, ev) {
      const arr = listeners.get(type) || []
      fired.push({ type, n: arr.length, ev })
      for (const fn of arr) fn(ev)
      return arr.length
    },
    snapshot() {
      const l = trk(LOCKED_ID).sample(), f = trk(FREE_ID).sample()
      return { t: +t.toFixed(4), listeners: [...listeners.keys()], locked: l, free: f, stats: renderer.particleStats }
    },
  }
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
/** 安全取首粒位置（粒子为空/系统缺失 ⇒ null；断言失败要可读，不要抛异常） */
const firstPos = (sys) => (sys && sys.particles && sys.particles[0] ? sys.particles[0].pos : null)
const maxDistTo = (sys, p) => (sys && sys.particles.length ? Math.max(...sys.particles.map((q) => dist(q.pos, p))) : -1)
const fmt = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : String(v))
const dump = (rig, label) => {
  if (!VERBOSE) return
  const s = rig.snapshot()
  console.log(`    [台账] ${label}: t=${s.t} 监听=${JSON.stringify(s.listeners)}`
    + ` locked{ptr=${s.locked.pointer ? s.locked.pointer.map((v) => +v.toFixed(2)).join(',') : 'null'} alive=${s.locked.alive} 累计=${s.locked.emitted} 跳过=${s.locked.skipped} 重建=${s.locked.rebuilt ? 1 : 0}}`
    + ` free{累计=${s.free.emitted} alive=${s.free.alive}} 绘制调用=${rig.draws.length}`)
}

console.log('pointer-leave-test —— §7-H：指针离开画布后不再发射（假 DOM + mock-GL；渲染器=' + path.relative(ROOT, BUNDLE) + '）')

// ═══════════════════════════ 4. A 阶段：绿前提（画布内 pointermove ⇒ 真发射 + 坐标正确）═══════════
const rig = makeRig('main')
let emittedAtLeave = 0
{
  // A0：一个指针信息都没有 —— 不发射是"前置语义"，不是本项的结论
  await rig.frame()
  const s0 = rig.snapshot(); dump(rig, 'A0 无指针')
  ok('A0a 无指针信息 ⇒ lockToPointer 层 0 粒（前置语义：没有指针就不发射）',
    s0.locked.alive === 0 && s0.locked.emitted === 0, `alive=${s0.locked.alive} 累计=${s0.locked.emitted}`)
  ok('A0b 同帧非锁定层照常发射（对照层是活的，后面的"冻结"才不是"整类关掉"）',
    s0.free.alive > 0, `free alive=${s0.free.alive}`)

  // A1：按宿主契约注入一次（注入通道本身也在这里被钉住）—— 这也是装上画布钩子的**唯一**现实路径
  globalThis.window = { __mpwPointer: { x: 960, y: 540, inside: true } }
  await rig.frame()
  const s1 = rig.snapshot(); dump(rig, 'A1 注入(960,540)')
  ok('A1a 注入通道 window.__mpwPointer=画面正中 ⇒ lockToPointer 层发射（绿前提①）',
    s1.locked.alive > 0, `alive=${s1.locked.alive}`)
  ok('A1b 发射基准点 = 注入的设计坐标 (960,540) ±0.5px',
    !!s1.locked.pointer && Math.abs(s1.locked.pointer[0] - 960) <= 0.5 && Math.abs(s1.locked.pointer[1] - 540) <= 0.5,
    'ptr=' + JSON.stringify(s1.locked.pointer))
  const L = [...rig.listeners.keys()]
  ok('A1c 画布上装上了 pointermove/pointerdown/pointerleave 三个监听（本项依赖的机制在位）',
    L.includes('pointermove') && L.includes('pointerdown') && L.includes('pointerleave'), '实测=' + JSON.stringify(L))
  const handlerCount = rig.fire('pointermove', { clientX: 960, clientY: 540, pointerId: 1, pointerType: 'mouse' })
  ok('A1d 画布 pointermove 有真监听器接（不是"发了没人听"）', handlerCount >= 1, `监听器数=${handlerCount}`)
  delete globalThis.window

  // A2：撤掉注入 + 画布内 pointermove ⇒ DOM 路径自己跑起来（坐标与画布 1:1 ⇒ 设计坐标 = client 坐标）
  await rig.frame()
  const s2 = rig.snapshot(); dump(rig, 'A2 撤注入（等 DOM 事件）')
  ok('A2a 撤掉注入后、仅靠画布事件：上一条 pointermove(960,540) 已生效 ⇒ 仍发射',
    s2.locked.alive > 0, `alive=${s2.locked.alive}`)
  ok('A2b 画布正中 ⇒ 设计坐标 = 投影中心 (960,540)（与取景窗口无关的不变量；x、y 都钉）',
    !!s2.locked.pointer && Math.abs(s2.locked.pointer[0] - 960) <= 0.05 && Math.abs(s2.locked.pointer[1] - 540) <= 0.05,
    'ptr=' + JSON.stringify(s2.locked.pointer))

  const emBefore = s2.locked.emitted
  const rc = rig.fire('pointermove', { clientX: 480, clientY: 270, pointerId: 1, pointerType: 'mouse' })
  await rig.frame()
  const s3 = rig.snapshot(); dump(rig, 'A3 画布内 move(480,270)')
  ok('A3a ★ 画布内 pointermove ⇒ 真发射（DOM 路径在跑；累计计数严格增长）',
    rc >= 1 && s3.locked.alive > 0 && s3.locked.emitted > emBefore, `累计 ${emBefore}→${s3.locked.emitted}`)
  ok('A3b ★ 发射基准点 = 该 client 点换算出的设计坐标 (480,270) ±1px（画布与帧 1:1）',
    !!s3.locked.pointer && Math.abs(s3.locked.pointer[0] - 480) <= 1 && Math.abs(s3.locked.pointer[1] - 270) <= 1,
    'ptr=' + JSON.stringify(s3.locked.pointer.map((v) => +v.toFixed(4))))
  ok('A3c 坐标方向不反：从 (960,540) 移到 (480,270) ⇒ x、y 都变小',
    !!s2.locked.pointer && !!s3.locked.pointer
      && s3.locked.pointer[0] < s2.locked.pointer[0] && s3.locked.pointer[1] < s2.locked.pointer[1],
    `${JSON.stringify(s2.locked.pointer)} → ${JSON.stringify(s3.locked.pointer)}`)
  const md = maxDistTo(s3.locked.sys, s3.locked.pointer)
  const p3 = firstPos(s3.locked.sys)
  ok('A3d 粒子出生点就在指针附近（max|Δ| ≤ 6px = distancemax 3 × scale 1 + 余量）',
    md >= 0 && md <= 6, `max|Δ|=${fmt(md)} n=${s3.locked.alive} 首粒=${p3 ? JSON.stringify(p3.map((v) => +v.toFixed(2))) : 'none'}`)
  ok('A3e 出生点**不是**该层 authored origin (1920,1080)（旧"中心爆"回归：不许退回作者原点发射）',
    !!p3 && dist(p3, [1920, 1080]) > 100,
    p3 ? `到 origin 距离=${fmt(dist(p3, [1920, 1080]))}px` : '无粒子')
}

// ═══════════════════════════ 5. B 阶段：pointerleave ⇒ 不再新增发射（本项核心）═══════════════
{
  emittedAtLeave = rig.trk(LOCKED_ID).sample().emitted
  const freeBefore = rig.trk(FREE_ID).sample().emitted
  const n = rig.fire('pointerleave', { pointerId: 1, clientX: 481, clientY: 271 })
  note('B0 pointerleave 派发到 ' + n + ' 个监听器')
  const frames = []
  for (let i = 0; i < 3; i++) { await rig.frame(); const s = rig.snapshot(); dump(rig, 'B' + (i + 1) + ' 离开后'); frames.push(s) }
  const last = frames[frames.length - 1]
  ok('P3a ★★ pointerleave 后连续 3 帧**不再新增发射**（累计发射计数冻结）',
    frames.every((f) => f.locked.emitted === emittedAtLeave),
    `离开前累计=${emittedAtLeave}；离开后=${frames.map((f) => f.locked.emitted).join(',')}`)
  ok('P3b 离开后 lockToPointer 层无存活粒子（无遗留"喂着旧坐标"的粒子）',
    frames.every((f) => f.locked.alive === 0), '每帧 alive=' + frames.map((f) => f.locked.alive).join(','))
  ok('P3c 机制证据：离开后帧内指针为空，且发射尝试被"无指针"门拦下（不是速率/预算把层整个停了）',
    frames.every((f) => f.locked.pointer === null) && last.locked.skipped > 0,
    `sys.pointer=null ×3，__ptrSkipped=${last.locked.skipped}`)
  ok('P3d 离开不误伤：同 3 帧里**非锁定**层照常新增发射（门只作用在 lockToPointer 发射器上）',
    last.free.emitted > freeBefore, `free 累计 ${freeBefore}→${last.free.emitted}`)
}

// ═══════════════════════════ 6. C 阶段：重新进入 ⇒ 恢复发射（反"关掉功能"式假绿）═══════════
{
  const rc = rig.fire('pointermove', { clientX: 1440, clientY: 810, pointerId: 1, pointerType: 'mouse' })
  await rig.frame()
  const s = rig.snapshot(); dump(rig, 'C1 重新进入(1440,810)')
  ok('P4a ★★ 重新 pointermove ⇒ 恢复发射（累计计数越过离开时的水位；防止"整个关掉"来通过）',
    rc >= 1 && s.locked.alive > 0 && s.locked.emitted > emittedAtLeave,
    `累计 ${emittedAtLeave} → ${s.locked.emitted}`)
  ok('P4b 新指针坐标生效：client(1440,810) ⇒ 设计坐标 (1440,810) ±1px',
    !!s.locked.pointer && Math.abs(s.locked.pointer[0] - 1440) <= 1 && Math.abs(s.locked.pointer[1] - 810) <= 1,
    'ptr=' + JSON.stringify(s.locked.pointer.map((v) => +v.toFixed(4))))
  const md = maxDistTo(s.locked.sys, s.locked.pointer)
  const p4 = firstPos(s.locked.sys)
  ok('P4c 粒子出生点跟着新指针（max|Δ| ≤ 6px，且远离旧指针 (480,270)）',
    !!p4 && md >= 0 && md <= 6 && dist(p4, [480, 270]) > 100,
    p4 ? `max|Δ|=${fmt(md)} 到旧指针=${fmt(dist(p4, [480, 270]))}px` : '无粒子')
}

// ═══════════════════════════ 7. D 阶段：等价/相关通道 ═══════════════════════════
{
  // D1：注入通道的 `inside:false` —— **它不是"离开"信号，只是"别信注入值"**：注入被丢弃后会**回落到
  //     画布归一坐标**。所以"fresh 台子（画布还没记过坐标）"下它会停发，而"画布记过坐标"下它会继续
  //     在**旧画布坐标**上发射（G5）。两条都实测，别把语义说过头。
  const savedLoc0 = globalThis.location
  const rigInj = makeRig('inject-inside')
  try {
    globalThis.window = { __mpwPointer: { x: 1440, y: 810, inside: true } }
    await rigInj.frame()
    const a = rigInj.snapshot(); dump(rigInj, 'D1 注入 inside:true（装钩子）')
    ok('D1a 注入 inside:true ⇒ 发射（同一台子上后半段才有对照）', a.locked.alive > 0, `alive=${a.locked.alive}`)
    globalThis.window.__mpwPointer = { x: 1440, y: 810, inside: false }
    await rigInj.frame(); await rigInj.frame()
    const b = rigInj.snapshot(); dump(rigInj, 'D1b 注入 inside:false（画布无回落值）')
    ok('D1b 注入 inside:false 且画布**没有**记录过坐标 ⇒ 停发（回落到空 ⇒ 指针为空）',
      b.locked.alive === 0 && b.locked.emitted === a.locked.emitted && b.locked.pointer === null,
      `累计 ${a.locked.emitted}→${b.locked.emitted} ptr=${JSON.stringify(b.locked.pointer)}`)
  } finally {
    delete globalThis.window
    if (savedLoc0 === undefined) delete globalThis.location; else globalThis.location = savedLoc0
  }

  // D2：注入优先级 —— 有注入时画布事件被完全旁路（这是 G1/G5 的根因，先把它钉成事实）
  globalThis.window = { __mpwPointer: { x: 300, y: 200, inside: true } }
  await rig.frame()
  const s2 = rig.snapshot(); dump(rig, 'D2 注入(300,200) 覆盖画布坐标')
  ok('D2 注入通道优先于画布事件：注入 (300,200) 后基准点就是 (300,200)（不是画布上的 (1440,810)）',
    !!s2.locked.pointer && Math.abs(s2.locked.pointer[0] - 300) <= 0.5 && Math.abs(s2.locked.pointer[1] - 200) <= 0.5,
    'ptr=' + JSON.stringify(s2.locked.pointer))

  // D3 / G5：注入 inside:false **在有画布回落值时仍继续发射**（本次实测的真实行为，见文件头 G5）
  const em5 = rig.trk(LOCKED_ID).sample().emitted
  globalThis.window.__mpwPointer = { x: 300, y: 200, inside: false }
  await rig.frame(); await rig.frame()
  const s5 = rig.snapshot(); dump(rig, 'D3/G5 inside:false 回落到画布坐标')
  delete globalThis.window
  xfailItem('G5 宿主用 inside:false 声明"指针不在" ⇒ 停发（当前会回落到旧画布坐标继续发射）',
    s5.locked.emitted === em5 && s5.locked.pointer === null,
    `inside:false 后累计 ${em5}→${s5.locked.emitted}、基准点=${JSON.stringify(s5.locked.pointer)}`
    + '（= 上一次画布内 pointermove 留下的归一坐标，core/we-scene-bundle.js:6664 `if (__pointerN && cam) …`）。'
    + '最小复现：① 注入 {x:300,y:200,inside:true} 渲染一帧 ② 画布 pointermove(1440,810) ③ 注入改 {inside:false} '
    + '⇒ 期望不发射，实测仍在 (1440,810) 发射')

  // D4：?cursor=off（逃生口）—— 整个 lockToPointer 类都不发射，即使注入指针且画布有事件
  const savedLoc = globalThis.location
  globalThis.location = { search: '?cursor=off' }
  const rigOff = makeRig('cursor-off')
  try {
    globalThis.window = { __mpwPointer: { x: 960, y: 540, inside: true } }
    await rigOff.frame()
    const off1 = rigOff.snapshot(); dump(rigOff, 'D4 ?cursor=off + 注入指针')
    ok('D4 ?cursor=off ⇒ 即使有指针也不发射（lockToPointer 层的总开关；对照层照常）',
      off1.locked.alive === 0 && off1.locked.emitted === 0 && off1.free.alive > 0,
      `locked alive=${off1.locked.alive} free alive=${off1.free.alive}`)
  } finally {
    delete globalThis.window
    if (savedLoc === undefined) delete globalThis.location; else globalThis.location = savedLoc
  }
}

// ═══════════════════════════ 8. G 阶段：已知缺口（XFAIL，不计票；修好会打 XPASS）═══════════
{
  const rig2 = makeRig('gaps')

  // G4：自举死锁 —— 不注入就永远装不上钩子
  const n0 = rig2.fire('pointermove', { clientX: 960, clientY: 540, pointerId: 1, pointerType: 'mouse' })
  await rig2.frame()
  const g4 = rig2.snapshot(); dump(rig2, 'G4 未注入 + 画布 pointermove')
  xfailItem('G4 未注入时画布 pointermove 也能让 lockToPointer 层发射（DOM 路径应能自举）',
    g4.locked.alive > 0,
    `实测 alive=${g4.locked.alive}、画布监听器=${JSON.stringify(g4.listeners)}（派发命中 ${n0} 个监听器）`
    + '；根因 = core/we-scene-bundle.js:9560 `if (!CURSOR_OFF && __ptrNow) __hookPointer()`：'
    + '__ptrNow 只能来自"钩子已装"或"宿主注入"⇒ 页面不注入则钩子永不安装；'
    + '全仓库 grep __mpwPointer 的生产者只有 bundle 自身（demo.html 的 window pointermove 是日志面板拖动）')

  // 补一个"注入 + 装钩子"的台子，用来量 G1/G2/G3
  const rig3 = makeRig('inject-gaps')
  globalThis.window = { __mpwPointer: { x: 800, y: 400, inside: true } }
  await rig3.frame()                     // 装钩子（注入通道在场）
  delete globalThis.window
  rig3.fire('pointermove', { clientX: 700, clientY: 500, pointerId: 1, pointerType: 'mouse' })
  await rig3.frame()
  const base = rig3.snapshot(); dump(rig3, 'G 基线（DOM 指针 700,500）')
  ok('G0 缺口用例的前置：DOM 指针已在 (700,500) 且正在发射（下面三条 XFAIL 才有意义）',
    !!base.locked.pointer && base.locked.alive > 0, `ptr=${JSON.stringify(base.locked.pointer)} alive=${base.locked.alive}`)

  // G1：注入通道激活时，画布 pointerleave 被旁路 —— §7-H 的"离开后仍在发射"在这条路上可复现
  globalThis.window = { __mpwPointer: { x: 800, y: 400, inside: true } }
  await rig3.frame()
  const g1Before = rig3.trk(LOCKED_ID).sample().emitted
  rig3.fire('pointerleave', { pointerId: 1, clientX: 701, clientY: 501 })
  await rig3.frame(); await rig3.frame()
  const g1 = rig3.snapshot(); dump(rig3, 'G1 注入激活 + 画布 pointerleave')
  xfailItem('G1 注入通道激活时，画布 pointerleave 也能停发（当前被注入优先级旁路）',
    g1.locked.emitted === g1Before,
    `离开后累计 ${g1Before}→${g1.locked.emitted}（仍在发射；基准点=${JSON.stringify(g1.locked.pointer)}）。`
    + '最小复现 = 本测试 D2/G1 两步：① window.__mpwPointer={x:800,y:400,inside:true} ② 画布派发 pointerleave '
    + '⇒ 指针仍为 (800,400)、累计发射继续增长')
  // 同一发 pointerleave 在注入撤掉后立刻生效 ⇒ 证明"事件到了、是优先级盖住的"
  delete globalThis.window
  await rig3.frame()
  const g1b = rig3.snapshot(); dump(rig3, 'G1b 撤注入后同一发 leave 生效')
  ok('G1b 同一发 pointerleave 在注入撤掉后**立刻生效**（事件确实到达并清了 DOM 指针 ⇒ G1 是优先级问题，不是事件没到）',
    g1b.locked.pointer === null && g1b.locked.alive === 0, `ptr=${JSON.stringify(g1b.locked.pointer)} alive=${g1b.locked.alive}`)

  // G2：pointerout + relatedTarget=null（等价"离开"路径）没被监听
  rig3.fire('pointermove', { clientX: 700, clientY: 500, pointerId: 1, pointerType: 'mouse' })
  await rig3.frame()
  const g2Before = rig3.trk(LOCKED_ID).sample().emitted
  const nOut = rig3.fire('pointerout', { pointerId: 1, relatedTarget: null, clientX: 701, clientY: 501 })
  await rig3.frame(); await rig3.frame()
  const g2 = rig3.snapshot(); dump(rig3, 'G2 pointerout(relatedTarget=null)')
  xfailItem('G2 pointerout(+relatedTarget=null) 也能停发（等价"离开"路径应等价）',
    g2.locked.emitted === g2Before,
    `pointerout 派发命中 ${nOut} 个监听器；离开后累计 ${g2Before}→${g2.locked.emitted}（仍在发射）；`
    + '实测画布监听集合=' + JSON.stringify(g2.listeners) + '（没有 pointerout）')

  // G3：blur / visibilitychange（页面级"离开"）也没人管
  const g3Before = rig3.trk(LOCKED_ID).sample().emitted
  const nBlur = rig3.fire('blur', {})
  const nVis = rig3.fire('visibilitychange', {})
  await rig3.frame(); await rig3.frame()
  const g3 = rig3.snapshot(); dump(rig3, 'G3 blur/visibilitychange')
  xfailItem('G3 blur / visibilitychange（页面级离开）也能停发（当前零监听）',
    g3.locked.emitted === g3Before,
    `blur 命中 ${nBlur} 个、visibilitychange 命中 ${nVis} 个；离开后累计 ${g3Before}→${g3.locked.emitted}（仍在发射）；`
    + '本 harness 里**没有 document 全局**且全程无异常 ⇒ 渲染器确实一行都没引用 window/document 级事件')
}

// ═══════════════════════════ 9. E 阶段（条件项）：真包 3554161528 的 lockToPointer 层 ═══════════
{
  const MPW_WS = process.env.MPW_ROOT || '/root/Desktop/DSHarea'
  const PKG = path.join(MPW_WS, 'allwallpaper', 'dd', '3554161528', 'scene.pkg')
  if (!fs.existsSync(PKG)) {
    skipItem('真包 3554161528 的 lockToPointer 层', '缺语料 ' + PKG)
  } else {
    const dec = new TextDecoder()
    const pkg = lib.parsePkg(new Uint8Array(fs.readFileSync(PKG)))
    const sj = JSON.parse(dec.decode(lib.getEntry(pkg, 'scene.json')).replace(/^\uFEFF/, ''))
    const readParticleDef = (p) => { try { const e = lib.getEntry(pkg, p); return e ? JSON.parse(dec.decode(e)) : null } catch { return null } }
    const scene = lib.parseScene(sj, null, { attachCtx: { readEntry: (n) => lib.getEntry(pkg, n), time: 0 }, readParticleDef })
    const sysOf = (l) => lib.buildParticleSystem(l.particleDef, {
      origin: l.origin, scale: l.scale, angle: (l.angles && l.angles[2]) || 0, seedStr: 'pointer-leave',
    })
    const lockedLayers = scene.layers.filter((l) => l.particleDef && sysOf(l).emitters.some((e) => e.__ptrLocked))
    const flaggedOnly = scene.layers.filter((l) => {
      const d = l.particleDef; if (!d) return false
      const cp = ((d.controlpoint) || []).some((c) => c && (Number(c.flags) & 1))
      return cp && !sysOf(l).emitters.some((e) => e.__ptrLocked)
    })
    ok('E1 真包里存在 lockToPointer 发射器层（id389 cherry blossoms on cursor —— §7-H 的当事人）',
      lockedLayers.length >= 1, '命中=' + JSON.stringify(lockedLayers.map((l) => l.id + ':' + l.name)))
    if (lockedLayers.length) {
      const l = lockedLayers[0]
      const sys = sysOf(l)
      ok('E2 该层指针控制点 = cp0 且**全部**发射器挂指针（真实数据，不是合成 def）',
        sys.pointerCp === 0 && sys.emitters.length > 0 && sys.emitters.every((e) => e.__ptrLocked),
        `id=${l.id} pointerCp=${sys.pointerCp} 发射器=${sys.emitters.length}`)
      const sNo = sysOf(l); sNo.pointer = null
      lib.simulateParticleSystem(sNo, 3, 400)
      ok('E3 无指针 ⇒ 该层 0 粒（"中心爆"回归：不许退回 authored origin 发射）',
        sNo.particles.length === 0 && (sNo.__ptrSkipped || 0) > 0,
        `alive=${sNo.particles.length} __ptrSkipped=${sNo.__ptrSkipped || 0}`)
      const sYes = sysOf(l); sYes.pointer = [800, 400]
      lib.simulateParticleSystem(sYes, 0.2, 400)
      const ps = sYes.particles.slice(0, 40)
      const mx = ps.length ? Math.max(...ps.map((q) => Math.abs(q.pos[0] - 800))) : -1
      const my = ps.length ? Math.max(...ps.map((q) => Math.abs(q.pos[1] - 400))) : -1
      ok('E4 指针 (800,400) ⇒ 有粒子且出生点就在指针附近（max|Δ| < 60px，与 projection-y-test 同口径）',
        ps.length > 0 && mx < 60 && my < 60, `n=${ps.length} max|Δx|=${fmt(mx, 1)} max|Δy|=${fmt(my, 1)}`)
    } else {
      skipItem('真包 id389 断言（E2-E4）', '本包 scene.json 里找不到 lockToPointer 发射器层')
    }
    ok('E5 真包里"controlpoint[i].flags=1 但发射器不引用该控制点"的层**不**受指针门控（不误伤）',
      flaggedOnly.every((l) => sysOf(l).emitters.every((e) => !e.__ptrLocked)),
      '这类层=' + JSON.stringify(flaggedOnly.map((l) => l.id + ':' + l.name)))
  }
}

// ═══════════════════════════ 10. M 阶段：内置红-if-reverted（临时副本变异）═══════════════════════
if (IS_MUTANT_RUN) {
  note('M0 变异体运行（MPW_POINTER_BUNDLE 已设）⇒ 跳过红-if-reverted 自检，避免递归')
} else if (!MUTATION) {
  note('M0 红-if-reverted 自检被 --no-mutation 跳过（本次运行**未**复核变异必红）')
} else {
  const CORE = path.join(ROOT, 'core')
  const SRC = fs.readFileSync(BUNDLE, 'utf8')
  const ANCHOR = "el.addEventListener('pointerleave', () => { __pointerN = null }, { passive: true })"
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pointer-leave-mut-'))
  const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ } }
  process.on('exit', cleanup)
  try {
    if (!SRC.includes(ANCHOR)) {
      skipItem('mutation-selfcheck 红-if-reverted', '变异锚点未命中（核心那行已被改写 ⇒ 需重新标定；不做变异＝不算证据）')
    } else {
      // 逐文件复制（fs.cpSync 在本机 /tmp 上抛 EINVAL）；**用 statSync 判类型**（本机 fs 的
      // Dirent.isFile() 对部分普通文件报 false/isSymbolicLink()=true，靠它会漏掉依赖模块）
      const tmpCore = path.join(tmp, 'core')
      fs.mkdirSync(tmpCore, { recursive: true })
      for (const name of fs.readdirSync(CORE)) {
        const src = path.join(CORE, name)
        let st = null
        try { st = fs.statSync(src) } catch { st = null }
        if (!st || !st.isFile()) continue
        fs.writeFileSync(path.join(tmpCore, name), fs.readFileSync(src))
      }
      const mutants = [
        { id: 'M1', desc: '删掉 pointerleave 监听整行', src: SRC.replace(ANCHOR + '\n', '').replace(ANCHOR, '') },
        { id: 'M2', desc: 'pointerleave 处理器改成空操作（监听在、行为回旧写法）', src: SRC.replace('() => { __pointerN = null }', '() => { /* 变异：离开不清指针 */ }') },
      ]
      for (const m of mutants) {
        if (m.src === SRC) { skipItem('mutation-selfcheck ' + m.id, '变异未生效（锚点替换 0 次）'); continue }
        const f = path.join(tmp, 'core', 'we-scene-bundle.js')
        fs.writeFileSync(f, m.src)
        const r = spawnSync(process.execPath, [process.argv[1], '--no-mutation'], {
          encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
          env: Object.assign({}, process.env, { MPW_POINTER_BUNDLE: f }),
        })
        const out = String(r.stdout || '') + String(r.stderr || '')
        const redLine = (out.match(/✗ P3[ab][^\n]*/) || [])[0] || (out.match(/✗ [^\n]*/) || [])[0] || ''
        ok('M-' + m.id + ' 变异「' + m.desc + '」⇒ 子进程 rc=1 且 P3（离开后不再新增发射）变红',
          r.status === 1 && /✗ P3[ab]/.test(out),
          `rc=${r.status} 首个失败断言=${JSON.stringify(redLine.slice(0, 160))}`
          + ' 子进程输出尾部=' + JSON.stringify(out.slice(-240)))
        ok('M-' + m.id + 'b 变异体只打破"离开"语义，绿前提仍成立（证明不是把整条路径弄挂了）',
          /✓ A3a/.test(out) && /✓ P4a/.test(out), 'A3a/P4a 在变异体里仍为 ✓')
      }
    }
  } finally { cleanup() }
}

// ═══════════════════════════ 11. 汇总（真实计票）═══════════════════════════
if (ONLY.length && pass + fail + skip + xfail + xpass === 0) usage('--only ' + JSON.stringify(ONLY) + ' 没有匹配到任何断言')
if (fail) {
  console.log('\n' + fail + ' 项失败：')
  for (const n of failNames) console.log('  - ' + n)
}
console.log(`\n(计票：pass=${pass} fail=${fail} skip=${skip} xfail=${xfail} xpass=${xpass})`)
if (xfail) console.log(`已知缺口 XFAIL ${xfail} 条（不计票，见文件头 G1–G5；修好会打 XPASS）：注入通道下离开信号不生效 / inside:false 回落旧坐标 / 等价路径未监听 / DOM 路径自举死锁`)
if (fail === 0) console.log(`\nALL PASS （${pass} 项${skip ? '，另 SKIP ' + skip : ''}${xfail ? '，另记录缺口 ' + xfail : ''}）`)
else console.log(`\n${fail} 项失败`)
process.exit(fail ? 1 : 0)
