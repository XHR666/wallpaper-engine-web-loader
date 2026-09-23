/* 参照来源许可声明：本文件提到的第三方参考实现只作**行为对照**，不复制其代码/注释/常量组织/错误文案：
 *   · references/wer-ref（Aromatic05/wallpaper-engine-renderer，GPL-2.0-only）—— 仅行为对照；
 *   · references/vendor-ref/webwallgl（oneincase/webwallgl，**MIT**）—— 允许移植，本文件仍按"行为规格"独立实现。
 */
// clock-combo-visible-test.mjs —— WEBWALLGL issue #2「时钟层 `visible` 绑 combo、同组 ≥3 变体时
// **偶发同屏两个时钟**」的**官方语义核对 + 合成复现/反证**门禁（无浏览器、无网络、无 GPU）。
//
// ── 先纠正一处命名（避免继续在错的名字上打转）────────────────────────────────────────────
//   本仓 **没有** `recomputeLayerVisibility` / `visibleSelf` / `visibleScript` 这三个符号
//   （`grep -rn` 在 core/ elysia/ demo.html 全 0 命中）。它们属于 `demo/assets/renderer-BOSoB05I.js`
//   （上游 webwallgl 的构建产物，MIT，仅行为对照）：
//     · 上游 `recomputeLayerVisibility(layers)` = `visibleSelf ≠ false` + `parentId` 级联，
//       **完全不看 combo**（grep 产物：`function G0(t){…let r=n.visibleSelf!==!1…}`）；
//     · 上游把 combo→visible 放在 `Wr(objects, properties)`（`du()` → `fu(props,name)` → `H0(value,condition)`）
//       先解析成字面量，再算 visibleSelf。
//   本仓的等价链是：`parseScene` 存 `l.__visibleRaw`/`l.__bindRaw` → `applyRenderConfig` 的
//   RE-06 段（`evalVisibleWithProps` + 父链级联）→ 面板路径 `applyUserProperties`（`writeBindField('visible')`）。
//
// ── 官方语义（真语料，file:line 级）────────────────────────────────────────────────────────
//   · WE 的 combo 属性在 `project.json.general.properties.<name>`：`{"type":"combo","value":"5",
//     "options":[{"label":"字体1","value":"1"},…]}` —— **选项值是 1 起的字符串**（实测
//     `allwallpaper/0917/3448877775/project.json` 的 `b1`：options "1".."5"、默认 "5"）。
//   · 层的 `visible` 形如 `{"user":{"name":"b1","condition":"6"},"value":true}`：每个变体一个 condition，
//     同一组 ≥3 个变体。实测同包 scene.json 里 `b1` 组有 **6 个 `Clock` 层**（condition 1..6），
//     **其中 condition "6" 有两层**（id 502 父 498 `横Clock`、id 531 父 3991 `横Clock`，两层都 authored true）。
//   · 另两个实测形态：属性自身带**门控表达式**（`b1.condition = "time.value"`、`display.condition =
//     "timevarying.value==2"`、`clocklocation.condition = "language.value == 1"`），
//     以及同一属性名下 **authored true 的层多于一层**（`allwallpaper/0917/3299228616` 的
//     `clocklocation` cond"1" 下 `Clock Layer 1` 与 `Clock 12` 都是 true）。
//
// ── 本档的三条复现（合成场景，形状照抄真语料）＋一条反证 ────────────────────────────────────
//   C2 属性表缺该键（`?proj=off` / 包内没有 project.json / 键被改名）⇒ `evalVisibleWithProps`
//      走"未知 → 可见"（core/we-scene-bundle.js:2145 `if (!has) return true`）⇒ **3 个变体全部可见**。
//   C3 属性被门控关闭（父属性取关）⇒ 绑定不生效、回落 authored value（:2146）⇒ 作者存了几个 true
//      就同屏几个时钟（真语料 `dd/3660962877` 该形态下是 **2 个**）。
//   C4 属性值恰好是 **bool**（面板/URL 传 true）且 condition ≥3 ⇒ `resolveUserBinding`:2129-2131 的
//      `pv === true` 兜底让 **除 "1" 以外的所有 condition 全部命中** ⇒ 2 个以上同屏。
//   C5 反证：props 完整时，逐帧切换 combo 1→2→3 **每帧恰好 1 个可见**、切换原子（无"旧层未隐藏/
//      新旧叠加"的中间帧）、重复 apply 幂等 ⇒ 同屏两层**不可能**是"可见性重算不完备/时序窗口"，
//      只能来自 C2/C3/C4 这三条解析口径。
//
// ── 变异自证（RED-IF-REVERTED）────────────────────────────────────────────────────────────
//   断言体收在 `coreChecks(L)`；真模块全绿，4 个变异体各自期望红集，实测==期望时打印 `MUTANT-RED-OK`。
//
// 用法: node tests/clock-combo-visible-test.mjs [--no-mutation] [--no-corpus] [--verbose]
// 退出码：0 全绿（含 SKIP）/ 1 有断言失败 / 2 用法错误。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { ROOT, WS } from './_root.mjs'

const argv = process.argv.slice(2)
if (argv.some((a) => !['--no-mutation', '--no-corpus', '--verbose', '--help'].includes(a))) {
  console.error('未知参数（用法见文件头）'); process.exit(2)
}
if (argv.includes('--help')) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 30).join('\n')); process.exit(0) }
const NO_MUT = argv.includes('--no-mutation')
const NO_CORPUS = argv.includes('--no-corpus')
const VERBOSE = argv.includes('--verbose')
globalThis.location = globalThis.location || { search: '', href: 'http://localhost/' }
const lib = await import('../core/we-scene-bundle.js')

let passN = 0, failN = 0
const fails = []
const ok = (name, cond, detail) => {
  if (cond) { passN++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { failN++; fails.push(name); console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')) }
}
const V = (o) => JSON.stringify(o)
const skip = (m) => console.log('  SKIP ' + m)

// ═════════════════════════ 1 合成场景（形状照抄真语料）════════════════════════════════════
/** 3 变体时钟（条件 "1"/"2"/"3"，默认 "1"）+ 可选"同 condition 的第二层"与"门控属性"。 */
function mkSceneJson({ dupSameCond = false, gate = null } = {}) {
  const objects = [
    { id: 1, name: 'ClockRoot', origin: '1920 1080 0', scale: '1 1 1', size: '3840 2160', angles: '0 0 0', visible: true, image: 'models/util/composelayer.json' },
  ]
  const conds = ['1', '2', '3']
  const authored = [true, false, false]        // 真语料：只有当前选中的那个变体 authored true
  for (let i = 0; i < 3; i++) {
    objects.push({ id: 11 + i, parent: 1, name: 'Clock ' + (i + 1), origin: '0 0 0', scale: '1 1 1', size: '400 160',
      angles: '0 0 0', text: '12:34', visible: { user: { name: 'clockstyle', condition: conds[i] }, value: authored[i] } })
  }
  if (dupSameCond) objects.push({ id: 14, parent: 1, name: 'Clock 3b', origin: '600 0 0', scale: '1 1 1', size: '400 160',
    angles: '0 0 0', text: '12:34', visible: { user: { name: 'clockstyle', condition: '3' }, value: true } })
  const schema = { clockstyle: { type: 'combo', value: '1', options: [{ label: '字体1', value: '1' }, { label: '字体2', value: '2' }, { label: '字体3', value: '3' }] } }
  if (gate) {
    schema.gateprop = { type: 'bool', value: true }
    schema.clockstyle.condition = gate                 // 真语料形态：b1.condition = "time.value"
  }
  return { scene: { version: 1, camera: null, general: { orthogonalprojection: { width: 3840, height: 2160 }, properties: {} }, objects },
    project: { general: { properties: schema } } }
}
/** 逐层判定（本档自己复刻 RE-06 的"每层绑定 + 父链级联"口径，用于**独立对照**被测实现）。 */
function visibleSet(scene, props, schema, L) {
  const gated = L.gatedOffNames(schema, props)
  const byId = new Map(scene.layers.map((l) => [l.id, l]))
  const cache = new Map()
  const visOf = (l) => {
    if (cache.has(l.id)) return cache.get(l.id)
    cache.set(l.id, true)
    let v = L.evalVisibleWithProps((l.__visibleRaw !== undefined) ? l.__visibleRaw : l.visible, props, gated)
    if (v && l.parent !== undefined && l.parent !== null) { const p = byId.get(l.parent); if (p && !visOf(p)) v = false }
    cache.set(l.id, v)
    return v
  }
  return { ids: scene.layers.filter((l) => visOf(l)).map((l) => l.id), gated }
}
/** 每个候选时钟层的"层 id → visible"快照（逐帧台账用）。 */
const clockIds = (scene, dup) => scene.layers.filter((l) => /^Clock /.test(String(l.name))).map((l) => l.id)

// ═════════════════════════ 2 mock GL（只为"逐帧"这一跳：renderScene 不改 visible，只读它）══════
const CONST = { LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81, ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B85,
  FRAMEBUFFER_COMPLETE: 0x8CD5, MAX_TEXTURE_SIZE: 0x0D33, NO_ERROR: 0, TEXTURE0: 0, VERTEX_SHADER: 0x8B31,
  FRAGMENT_SHADER: 0x8B30, FLOAT: 0x1406, FLOAT_VEC2: 0x8B50, FLOAT_VEC3: 0x8B51, FLOAT_VEC4: 0x8B52,
  INT: 0x1404, BOOL: 0x8B56, FLOAT_MAT4: 0x8B5C, FLOAT_MAT3: 0x8B5B, SAMPLER_2D: 0x8B5E }
for (let i = 0; i < 8; i++) CONST['TEXTURE' + i] = i
function mkGL() {
  let seq = 0, curProg = null
  const mk = (k) => ({ id: k + '#' + (++seq) })
  const handlers = {
    createTexture: () => mk('tex'), createFramebuffer: () => mk('fbo'), createBuffer: () => mk('buf'),
    createVertexArray: () => mk('vao'), createShader: () => mk('sh'), createProgram: () => mk('prog'),
    getProgramParameter: (p, k) => (k === CONST.LINK_STATUS || k === CONST.COMPILE_STATUS ? true : (k === CONST.ACTIVE_UNIFORMS ? 1 : (k === CONST.ACTIVE_ATTRIBUTES ? 2 : null))),
    getActiveUniform: () => ({ name: 'g_Texture0', type: CONST.SAMPLER_2D }),
    getActiveAttrib: (p, i) => ({ name: i === 0 ? 'a_Position' : 'a_TexCoord', size: i === 0 ? 3 : 2 }),
    getAttribLocation: (p, n) => (n === 'a_Position' ? 0 : n === 'a_TexCoord' ? 1 : -1),
    getUniformLocation: (p, n) => ({ p, n }), getShaderParameter: () => true,
    checkFramebufferStatus: () => CONST.FRAMEBUFFER_COMPLETE, getError: () => CONST.NO_ERROR,
    getParameter: (k) => (k === CONST.MAX_TEXTURE_SIZE ? 4096 : 0), getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    useProgram: (p) => { curProg = p },
  }
  const gl = new Proxy({}, { get(t, prop) {
    if (prop in handlers) return handlers[prop]
    if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return CONST[prop] !== undefined ? CONST[prop] : 1
    return () => {}
  } })
  return { gl }
}
const VERT = 'attribute vec3 a_Position; attribute vec2 a_TexCoord; uniform mat4 g_ModelViewProjectionMatrix; varying vec2 v_TexCoord; void main(){ gl_Position = g_ModelViewProjectionMatrix * vec4(a_Position,1.0); v_TexCoord = a_TexCoord; }'
const FRAG = 'uniform sampler2D g_Texture0; varying vec2 v_TexCoord; void main(){ gl_FragColor = texture(g_Texture0, v_TexCoord); }'
const shaderResolver = async (rel) => (String(rel).endsWith('.vert') ? VERT : FRAG)

/** 逐帧台账：给定"属性时间线"，每帧记录每个候选层的 visible。`path` = 'load'（applyRenderConfig）| 'panel'（applyUserProperties）。 */
async function traceFrames({ sceneJson, project, steps, dup = false, L = lib }) {
  const sc = L.parseScene(sceneJson, project)
  const schema = (project.general && project.general.properties) || {}
  const cands = clockIds(sc, dup)
  const { gl } = mkGL()
  const r = L.createRenderer({ getContext: () => gl, width: 3840, height: 2160 }, { shaderResolver, onLog: () => {} })
  const rows = []
  let frame = 0
  for (const st of steps) {
    const props = st.props
    if (st.path === 'load') L.applyRenderConfig(sc, { properties: props, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    else L.applyUserProperties(sc, props, { schema, gated: L.gatedOffNames(schema, props) })
    for (let k = 0; k < (st.frames || 2); k++) {
      await r.render(sc, new Map(), 3840, 2160, 1 / 60)
      frame++
      const vis = cands.filter((id) => sc.layers.find((l) => l.id === id).visible)
      rows.push({ frame, path: st.path, tag: st.tag, prop: st.prop, visible: vis, n: vis.length })
    }
  }
  return { rows, cands, scene: sc }
}

// ═════════════════════════ 3 断言体（对同一个 L 可反复跑 ⇒ 变异自证）══════════════════════
async function coreChecks(L) {
  const out = []
  const add = (id, okv, detail) => out.push({ id, ok: !!okv, detail: detail || '' })

  // C1 props 完整（combo 字符串）：3 个取值各恰好 1 层可见
  {
    const { scene, project } = mkSceneJson()
    const sc = L.parseScene(scene, project)
    const schema = project.general.properties
    const got = {}
    for (const v of ['1', '2', '3']) {
      const props = Object.assign(L.propsDefaults(schema), { clockstyle: v })
      L.applyRenderConfig(sc, { properties: props, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
      got[v] = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    }
    add('C1', ['1', '2', '3'].every((v) => got[v].length === 1), V(got))
  }
  // C2 ★属性表缺该键：**装载路径** ⇒ 全部变体可见（core:2145/2679 "未知 → 可见"）；
  //        **面板路径** ⇒ 直接跳过不写（core:2378 `stats.missing++`）⇒ 保持 authored。
  //        两条路径对同一状态给出不同结果 ⇒ "同屏几个时钟"取决于**最后一次是谁写的**（偶发的直接来源）。
  {
    const { scene, project } = mkSceneJson()
    const schema = project.general.properties
    const other = L.propsDefaults(schema); delete other.clockstyle
    const sc = L.parseScene(scene, project)
    L.applyRenderConfig(sc, { properties: other, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const a = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    const sc2 = L.parseScene(mkSceneJson().scene, project)
    const st = L.applyUserProperties(sc2, other, { schema, gated: L.gatedOffNames(schema, other) })
    const b = clockIds(sc2).filter((id) => sc2.layers.find((l) => l.id === id).visible)
    const sc3 = L.parseScene(mkSceneJson().scene, project)
    L.applyRenderConfig(sc3, { properties: {}, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const c = clockIds(sc3).filter((id) => sc3.layers.find((l) => l.id === id).visible)
    add('C2', a.length === 3 && c.length === 3 && b.length === 1,
      V({ 装载_缺键: a, 面板_缺键: b, 装载_空props: c, 面板missing计数: st && st.missing }))
  }
  // C3 ★门控关 ⇒ 回落 authored；作者存了两个 true ⇒ 同屏两个
  {
    const { scene, project } = mkSceneJson({ dupSameCond: true, gate: 'gateprop' })
    const sc = L.parseScene(scene, project)
    const schema = project.general.properties
    const on = Object.assign(L.propsDefaults(schema), { gateprop: true })
    L.applyRenderConfig(sc, { properties: on, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const gateOn = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    const off = Object.assign(L.propsDefaults(schema), { gateprop: false })
    L.applyRenderConfig(sc, { properties: off, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const gateOff = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    add('C3', gateOn.length === 1 && gateOff.length === 2,
      V({ 门控开: gateOn, 门控关: gateOff }) + '（门控关 ⇒ authored 回落 ⇒ 两个 true 的层同屏）')
  }
  // C4 ★bool 型属性值 + ≥3 变体 ⇒ "1" 以外全命中
  {
    const { scene, project } = mkSceneJson()
    const sc = L.parseScene(scene, project)
    const schema = project.general.properties
    const props = Object.assign(L.propsDefaults(schema), { clockstyle: true })
    L.applyRenderConfig(sc, { properties: props, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const v = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    add('C4', v.length === 2, V(v) + '（pv=true 时 condition "1" 不命中、其余 condition 全命中）')
  }
  // C5 反证：逐帧切换原子 + 幂等 + 每帧恰好 1 个可见
  {
    const { scene, project } = mkSceneJson()
    const schema = project.general.properties
    const base = L.propsDefaults(schema)
    const steps = []
    for (const v of ['1', '2', '3', '1']) steps.push({ path: 'panel', tag: 'switch->' + v, prop: v, props: Object.assign({}, base, { clockstyle: v }), frames: 3 })
    const t = await traceFrames({ sceneJson: scene, project, steps, L })
    console.log('  逐帧台账（面板路径，每格 = 该帧可见的时钟层 id）：')
    for (const r of t.rows) console.log('    frame ' + String(r.frame).padStart(2) + '  ' + r.tag.padEnd(12) + ' n=' + r.n + '  ' + V(r.visible))
    const allOne = t.rows.every((r) => r.n === 1)
    // 原子性：任何相邻两帧的可见集要么完全相同、要么"旧层已隐藏 + 新层出现"同时发生（不允许出现 n≥2 的过渡帧）
    const noOverlap = t.rows.every((r) => r.n <= 1)
    // 幂等：同一 props 连续 apply 10 次，可见集不变
    const sc = L.parseScene(scene, project)
    const props = Object.assign({}, base, { clockstyle: '2' })
    L.applyRenderConfig(sc, { properties: props, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const once = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    for (let i = 0; i < 9; i++) L.applyUserProperties(sc, props, { schema, gated: L.gatedOffNames(schema, props) })
    const tenth = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    add('C5', allOne && noOverlap && V(once) === V(tenth),
      V({ 每帧恰好一层: allOne, 无叠加帧: noOverlap, 幂等: V(once) === V(tenth) }))
  }
  // C6 父链级联完备性（容器不可见 ⇒ 变体不可见；恢复后回来）
  {
    const { scene, project } = mkSceneJson({ dupSameCond: true })
    const sc = L.parseScene(scene, project)
    const schema = project.general.properties
    const props = Object.assign(L.propsDefaults(schema), { clockstyle: '3' })
    L.applyRenderConfig(sc, { properties: props, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const before = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    const root = sc.layers.find((l) => l.id === 1)
    root.__visibleRaw = false
    L.applyRenderConfig(sc, { properties: props, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const off = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    root.__visibleRaw = true
    L.applyRenderConfig(sc, { properties: props, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
    const back = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible)
    add('C6', before.length === 2 && off.length === 0 && V(back) === V(before), V({ 容器开: before, 容器关: off, 再开: back }))
  }
  // C7 独立对照：本档自复刻的"每层绑定 + 级联"与实现逐位一致（6 组配置）
  {
    let same = 0, total = 0, bad = null
    for (const cfg of [{}, { dupSameCond: true }, { dupSameCond: true, gate: 'gateprop' }]) {
      const { scene, project } = mkSceneJson(cfg)
      const schema = project.general.properties
      for (const pv of ['1', '2', '3', true, false, undefined]) {
        const sc = L.parseScene(JSON.parse(JSON.stringify(scene)), project)
        const props = L.propsDefaults(schema)
        if (pv === undefined) delete props.clockstyle; else props.clockstyle = pv
        L.applyRenderConfig(sc, { properties: props, propertiesSchema: schema, hideParticles: true, hideUI: true, log: () => {} })
        const got = clockIds(sc).filter((id) => sc.layers.find((l) => l.id === id).visible).sort()
        const exp = visibleSet(sc, props, schema, L).ids.filter((id) => clockIds(sc).includes(id)).sort()
        total++
        if (V(got) === V(exp)) same++; else bad = V({ cfg, pv, got, exp })
      }
    }
    add('C7', same === total, same + '/' + total + ' 组一致' + (bad ? ' 例:' + bad : ''))
  }
  return out
}

// ═════════════════════════ 4 跑真模块 ═════════════════════════════════════════════════════
console.log('[C] 合成场景（3 变体时钟；形状照抄真语料 0917/3448877775 的 `b1`、dd/3660962877 的 `b1`）')
const realChecks = await coreChecks(lib)
for (const c of realChecks) ok(c.id, c.ok, c.detail)

// ═════════════════════════ 5 语料核对（真实 scene.json + 真实 project.json）════════════════
console.log('[C8] 语料核对：同组 ≥3 condition 的时钟变体组，逐取值数"同屏几个时钟簇"')
if (NO_CORPUS) skip('--no-corpus')
else {
  const CORPUS = process.env.MPW_SCENE_ROOT || path.join(WS, 'allwallpaper')
  if (!fs.existsSync(CORPUS)) skip('无 ' + CORPUS)
  else {
    const res = scanClockGroups(CORPUS, { maxFiles: Number(process.env.MPW_CLOCK_MAX || 260), maxBytes: 16 << 20 })
    console.log('  扫过容器 ' + res.walked + ' 个（含 scene.json ' + res.withScene + '、有 project.json ' + res.withProj + '、异常 ' + res.skipped.length + '）')
    console.log('  时钟变体组（≥3 condition）：' + res.groups.length + ' 组，涉及 ' + res.pkgs + ' 个包')
    const worst = res.groups.slice().sort((a, b) => b.maxMissing - a.maxMissing).slice(0, 5)
    for (const g of worst) {
      console.log('    ' + g.file.slice(0, 46) + ' prop=' + g.prop + ' type=' + g.type + ' value=' + g.value + ' cond=' + g.condition
        + ' variants=' + g.variants + ' → 完整 props 各取值簇数 ' + V(g.byValue) + ' / 缺键 ' + g.missing + ' / 门控关 ' + (g.gated === null ? '-' : g.gated))
    }
    const actGroups = res.groups.filter((g) => Object.keys(g.byValueActive).length > 0 && g.hasProj)
    const badActive = actGroups.filter((g) => Object.values(g.byValueActive).some((n) => n > 1))
    if (badActive.length) for (const g of badActive) console.log('    ★C8a 例外: ' + g.file + ' prop=' + g.prop + ' ' + V(g.byValueActive))
    ok('C8a 包内有 project.json 且属性未被门控时：完整 props 下每个取值 ≤1 个时钟簇（' + actGroups.length + '/' + res.groups.length + ' 组可测）',
      actGroups.length > 0 && badActive.length === 0,
      badActive.slice(0, 3).map((g) => g.file.slice(-30) + ':' + g.prop + V(g.byValueActive)).join('  '))
    // 无 project.json 的包（含 scene.json 的容器里绝大多数）：整张属性表缺失 ⇒ 连**父容器**的绑定都落回"未知 → 可见"
    const noProj = res.groups.filter((g) => !g.hasProj)
    const noProjMulti = noProj.filter((g) => Object.values(g.byValue).some((n) => n >= 2))
    console.log('    无 project.json 的组：' + noProj.length + '/' + res.groups.length
      + '（其中每取值 ≥2 个时钟簇的 ' + noProjMulti.length + ' 组）—— 含 scene.json 的容器共 ' + res.withScene + ' 个，其中带 project.json 的只有 ' + res.withProj + ' 个')
    if (noProjMulti.length) console.log('      例: ' + noProjMulti.slice(0, 3).map((g) => g.file.slice(-34) + ':' + g.prop + V(g.byValue)).join(' | '))
    ok('C8b ★真语料"整张属性表缺失 ⇒ 同屏 ≥2 个时钟"：' + noProjMulti.length + ' 组（且缺单个键也有 ' + res.groups.filter((g) => g.missing >= 2).length + ' 组）',
      noProjMulti.length > 0, noProjMulti.slice(0, 2).map((g) => g.file.slice(-34) + ':' + g.prop + V(g.byValue)).join('  '))
    const gatedSeen = res.groups.filter((g) => g.gated !== null)
    const gatedRep = gatedSeen.filter((g) => g.gated >= 2)
    ok('C8c 门控关 ⇒ 回落 authored 的**机制**在真语料里可测（' + gatedSeen.length + ' 组命中门控；其中回落成 ≥2 个的 ' + gatedRep.length + ' 组）',
      gatedSeen.length > 0,
      gatedSeen.slice(0, 3).map((g) => g.file.slice(-34) + ':' + g.prop + '→' + g.gated + '（active ' + V(g.byValueActive) + '）').join('  ') + '｜本机语料 0 组因此 ≥2')
    const dup = res.groups.filter((g) => g.dupCond.length > 0 && Object.values(g.byValue).some((n) => n > 1))
    console.log('  同 condition 重复层的组（数据层"两个时钟"形态）：' + dup.length + ' 组'
      + (dup.length ? ' 例: ' + dup.slice(0, 3).map((g) => g.file.slice(-26) + ':' + g.prop + ' dup=' + V(g.dupCond) + ' 簇=' + V(g.byValue)).join(' | ') : ''))
    ok('C8d ★真语料里存在"同一 condition 下两层都 visible、且各自父容器都可见"的组（数据层成因，非渲染器）：' + dup.length + ' 组',
      dup.length > 0, dup.slice(0, 2).map((g) => g.file.slice(-26) + ':' + g.prop + ' ' + V(g.dupCond)).join('  '))
  }
}

// ═════════════════════════ 6 变异自证（RED-IF-REVERTED）═══════════════════════════════════
if (NO_MUT) console.log('[M] SKIP（--no-mutation）')
else {
  console.log('[M] RED-IF-REVERTED：真源码逐条改回旧写法（副本落 /tmp，真树只读）')
  const SRC_FILE = path.join(ROOT, 'core', 'we-scene-bundle.js')
  const CORE = path.dirname(SRC_FILE)
  const SRC = fs.readFileSync(SRC_FILE, 'utf8')
  const shaOf = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
  const srcSha = shaOf(SRC_FILE)
  const mutants = [
    { label: 'N1(evalVisibleWithProps 里"未知→可见"改成 authored 兜底)', expect: ['C7'],
      pairs: [['  if (!has) return true                                   // 未知（拿不到 project.json）→ 可见',
        '  if (!has) return raw.value === undefined ? true : !!raw.value   // MUTANT']] },
    // N1b 同时让 C7（独立对照）变红：RE-06 自己那份复制与 evalVisibleWithProps 分叉，本档的交叉核对抓到了它
    { label: 'N1b(RE-06 里**同一规则的第二份复制**改成 authored 兜底)', expect: ['C2', 'C7'],
      pairs: [['      if (user && user.name) return true',
        '      if (user && user.name) return v.value === undefined ? true : !!v.value   // MUTANT']] },
    { label: 'N2(被门控关闭的属性仍按"可见"而不是回落 authored)', expect: ['C3'],
      pairs: [['  if (gated && gated.has(name)) return raw.value === undefined ? true : !!raw.value',
        '  if (gated && gated.has(name)) return true   // MUTANT']] },
    { label: 'N3(bool 值不再对 "0"/"1" 以外的 condition 兜底)', expect: ['C4'],
      pairs: [['    const matched = (typeof pv === \'boolean\')\n      ? (cond === \'0\' ? pv === true : (cond === \'1\' ? pv === false : pv === true))\n      : String(pv) === cond',
        '    const matched = (typeof pv === \'boolean\')\n      ? (cond === \'0\' ? pv === true : (cond === \'1\' ? pv === false : false))   // MUTANT\n      : String(pv) === cond']] },
    { label: 'N4(RE-06 去掉父链级联)', expect: ['C6'],
      pairs: [['      if (vis && l.parent !== undefined && l.parent !== null) {\n        const par = byId.get(l.parent)\n        if (par && !visibleOf(par)) vis = false\n      }',
        '      // MUTANT: 去掉父链级联']] },
  ]
  for (const mu of mutants) {
    let body = SRC, missing = null
    for (const [from, to] of mu.pairs) {
      if (!body.includes(from)) { missing = from; break }
      body = body.replace(from, to)
    }
    if (missing) { failN++; console.log('  ✗ ' + mu.label + ' 变异锚点不在源码里：' + V(String(missing).slice(0, 70))); continue }
    const tmp = path.join(os.tmpdir(), 'ckmut-' + mu.label.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) + '.mjs')
    fs.rmSync(tmp, { force: true })
    fs.writeFileSync(tmp, body.replace(/from '\.\//g, `from '${CORE}/`))
    let red = [], detail = ''
    try {
      const mm = await import('file://' + tmp + '?v=' + Date.now() + Math.random())
      const got = await coreChecks(mm)
      red = got.filter((c) => !c.ok).map((c) => c.id)
      detail = got.filter((c) => !c.ok).map((c) => c.id + '(' + c.detail + ')').join(' ')
    } catch (e) { detail = '变异体跑挂：' + String(e && e.message).slice(0, 140) }
    finally { fs.rmSync(tmp, { force: true }) }
    const exp = mu.expect.join(','), act = red.join(',')
    ok('MUTANT-RED-OK｜' + mu.label + '：期望红集 [' + exp + '] == 实际红集 [' + act + ']', exp === act, detail.slice(0, 200))
  }
  const leftovers = fs.readdirSync(os.tmpdir()).filter((f) => /^ckmut-.*\.mjs$/.test(f))
  ok('M-end 真树 core/we-scene-bundle.js 跑前跑后 sha256 相同（副本落 /tmp 且已 unlink）',
    shaOf(SRC_FILE) === srcSha && leftovers.length === 0, 'sha相同=' + (shaOf(SRC_FILE) === srcSha) + ' /tmp残留=' + leftovers.length)
}

// ═════════════════════════ 7 语料扫描实现（有界读；本档独立实现，不复用他档）════════════════
function scanClockGroups(root, { maxFiles = 260, maxBytes = 16 << 20 } = {}) {
  const out = { walked: 0, withScene: 0, withProj: 0, skipped: [], groups: [], pkgs: 0 }
  const files = []
  ;(function walk(d, dep) {
    if (dep > 3 || files.length >= maxFiles) return
    let ents = []
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (files.length >= maxFiles) return
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p, dep + 1)
      else if (/\.(pkg|mpkg)$/i.test(e.name)) files.push(p)
    }
  })(root, 0)
  for (const p of files) {
    out.walked++
    let sceneRaw = null, projRaw = null
    try { sceneRaw = readPkgEntry(p, 'scene.json', maxBytes) } catch (e) { out.skipped.push(path.basename(p)); continue }
    if (sceneRaw === null) continue
    out.withScene++
    try { projRaw = readPkgEntry(p, 'project.json', maxBytes) } catch (e) { projRaw = null }
    let j = null, proj = null
    try { j = JSON.parse(sceneRaw) } catch (e) { out.skipped.push(path.basename(p) + ':scene'); continue }
    if (projRaw) { try { proj = JSON.parse(projRaw); out.withProj++ } catch (e) { proj = null } }
    const schema = (proj && ((proj.general && proj.general.properties) || proj.properties)) || {}
    const objs = j.objects || []
    const clocks = objs.filter((o) => o.visible && typeof o.visible === 'object' && o.visible.user && typeof o.visible.user === 'object'
      && /clock|时间/i.test(String(o.name || '')))
    const byProp = new Map()
    for (const o of clocks) { const k = String(o.visible.user.name); if (!byProp.has(k)) byProp.set(k, []); byProp.get(k).push(o) }
    let pkgHit = false
    for (const [name, arr] of byProp) {
      const conds = [...new Set(arr.map((o) => String(o.visible.user.condition)))]
      if (conds.length < 3) continue
      const def = schema[name] || null
      const opts = def && def.options ? def.options.map((o) => o && o.value).filter((x) => x !== undefined) : conds
      const props0 = lib.propsDefaults(schema)
      const evalCount = (props) => {
        const gated = lib.gatedOffNames(schema, props)
        const byId = new Map(objs.filter((o) => o.id !== undefined).map((o) => [o.id, o]))
        const cache = new Map()
        const visOf = (l) => {
          if (cache.has(l.id)) return cache.get(l.id)
          cache.set(l.id, true)
          let v = (l.visible === undefined) ? true : lib.evalVisibleWithProps(l.visible, props, gated)
          if (v && l.parent !== undefined && l.parent !== null) { const par = byId.get(l.parent); if (par && !visOf(par)) v = false }
          cache.set(l.id, v); return v
        }
        const shown = arr.filter((o) => visOf(o))
        // 簇 = 去掉"祖先也在 shown 里"的层（父/子同属一个时钟）
        const roots = shown.filter((o) => { let q = o.parent; while (q !== undefined && q !== null) { const par = byId.get(q); if (!par) break; if (shown.includes(par)) return false; q = par.parent } return true })
        return roots.length
      }
      const byValue = {}, byValueActive = {}
      for (const v of opts) {
        const props = Object.assign({}, props0); props[name] = lib.normalizePropValue(def && def.type, v, v)
        const isGated = lib.gatedOffNames(schema, props).has(name)
        byValue[String(v)] = evalCount(props)
        if (!isGated) byValueActive[String(v)] = byValue[String(v)]
      }
      const noKey = Object.assign({}, props0); delete noKey[name]
      let gated = null
      if (def && def.condition) {
        const dep = lib.propConditionNames(String(def.condition))[0]
        if (dep) {
          for (const v of (schema[dep] && schema[dep].options ? schema[dep].options.map((o) => o.value) : ['0', '1'])) {
            const props = Object.assign({}, props0); props[dep] = lib.normalizePropValue(schema[dep] && schema[dep].type, v, v)
            if (lib.gatedOffNames(schema, props).has(name)) { gated = evalCount(props); break }
          }
        }
      }
      const dupCond = (() => { const m = new Map(); for (const o of arr) { const c = String(o.visible.user.condition); m.set(c, (m.get(c) || 0) + 1) } return [...m.entries()].filter(([, n]) => n > 1).map(([c, n]) => c + '×' + n) })()
      out.groups.push({ file: p, hasProj: !!proj, prop: name, type: def && def.type, value: def && def.value, condition: (def && def.condition) || null,
        variants: arr.length, byValue, byValueActive, dupCond, missing: evalCount(noKey), gated })
      pkgHit = true
    }
    if (pkgHit) out.pkgs++
  }
  return out
}
/** 只读容器目录表 + 指定条目（内存有界；条目绝对偏移 = 目录表结束位置 + entry.offset）。 */
function readPkgEntry(file, want, maxBytes) {
  const fd = fs.openSync(file, 'r')
  try {
    const h = Buffer.alloc(4); fs.readSync(fd, h, 0, 4, 0)
    const ml = h.readUInt32LE(0)
    if (!(ml >= 1 && ml <= 64)) throw new Error('magicLen 异常')
    const mb = Buffer.alloc(ml); fs.readSync(fd, mb, 0, ml, 4)
    if (!/^(PKGV|PKGM|v\d)/i.test(mb.toString('latin1'))) throw new Error('非 PKG 容器')
    const cb = Buffer.alloc(4); fs.readSync(fd, cb, 0, 4, 4 + ml)
    const count = cb.readUInt32LE(0)
    if (count > 200000) throw new Error('入口数异常')
    let pos = 8 + ml, hit = null
    for (let i = 0; i < count; i++) {
      const nb = Buffer.alloc(4); fs.readSync(fd, nb, 0, 4, pos); pos += 4
      const nl = nb.readUInt32LE(0)
      const nbuf = Buffer.alloc(nl); fs.readSync(fd, nbuf, 0, nl, pos); pos += nl
      const ob = Buffer.alloc(8); fs.readSync(fd, ob, 0, 8, pos); pos += 8
      if (nbuf.toString('utf8') === want) hit = { offset: ob.readUInt32LE(0), size: ob.readUInt32LE(4) }
    }
    const tableEnd = pos
    if (!hit) return null
    if (hit.size > maxBytes) throw new Error('条目过大')
    const b = Buffer.alloc(hit.size); fs.readSync(fd, b, 0, hit.size, tableEnd + hit.offset)
    return b.toString('utf8').replace(/^\uFEFF/, '')
  } finally { fs.closeSync(fd) }
}

console.log('\n===== clock-combo-visible: ' + passN + ' 通过 / ' + failN + ' 失败 =====')
if (fails.length) console.log('失败项：\n  - ' + fails.join('\n  - '))
process.exit(failN ? 1 : 0)
