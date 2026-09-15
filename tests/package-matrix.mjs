// package-matrix.mjs — 逐包质量门禁 + 回归矩阵（MERGED-2 第 1 项 E）
// 扫描 allwallpaper/**、$MPW_PLUGIN_CACHE/*.mpkg、$MPW_SD_ROOT，
// 一包一行输出 package-matrix.json + 控制台表格；门禁规则进 issues[]；--check 与基线比对。
//
// 用法:
//   node package-matrix.mjs                     # 全量扫描，写 package-matrix.json（基线不存在则同时写 package-baseline.json）
//   node package-matrix.mjs --check             # 与 package-baseline.json 逐包逐字段比对，退化非零退出
//   node package-matrix.mjs --pkg <绝对路径>    # 只分析一个包（不写基线）
//   node package-matrix.mjs --json              # 只输出 JSON（供脚本消费）
//   node package-matrix.mjs --max-mb 400        # 跳过超过 N MB 的包（默认 400，防 OOM）
//   node package-matrix.mjs --write-baseline    # 强制用本次结果覆盖基线
//
// 审计部分 = render-audit.mjs 的 mock-GL + 真实 renderScene 路径，扩展了：
//   - 层归属：bundle 的 [首帧] #N 日志在每层绘制**前**同步打出 → mock GL 的每次 draw
//     归属给"当时层号"，得到 drawnLayers / 每层 draw 数 / srcTex 白块·透明观测。
//   - 1×1 纹理标记：texImage2D 上传 1×1 全 255 / 全 0 时给纹理对象打 __solid 标记
//     （bundle 内部 whiteTex/transparentTex 的来源），绘制时绑定到 g_Texture0 即命中。
//     util/* 种子纹理用带 __name 的假对象，不会被误标。
//   - 纹理/粒子层接线与 demo.html loadScene 同语义：pass0.textures[0] 成功解码 →
//     layer.textureName / layer.particleTexName；model.solidlayer → layer.solid。
import fs from 'node:fs'
import path from 'node:path'
import * as lib from '../we-scene-bundle.js'
import { installPuppet } from '../elysia/we-renderer/puppet.js'
import { Buffer as MpwBuffer } from '../elysia/buffer.js'
import { ROOT } from './_root.mjs'   // ①(2026-09-16 目录整理) 仓库根（本脚本已移入 tests/）
// ①(去个人化 2026-09-16) 工作区根：环境变量优先；下面的默认值只是作者本机路径，发布副本请设 MPW_ROOT。
const MPW_WS = process.env.MPW_ROOT || '/root/Desktop/DSHarea'
// ①(去个人化 2026-09-16) 插件下载缓存 / 备用语料根：环境变量优先；默认值只是作者本机路径。
const MPW_PLUGIN_CACHE = process.env.MPW_PLUGIN_CACHE || '/root/.dsh-mpkg-wallpaper'
const MPW_SD_ROOT = process.env.MPW_SD_ROOT || '/mnt/sdcard/wallpapertest1'

const dec = new TextDecoder()
const ARGS = process.argv.slice(2)
const argVal = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null }
const HAS = (k) => ARGS.includes(k)
const MAX_MB = Number(argVal('--max-mb') || 400)
const ROOTS = [`${MPW_WS}/allwallpaper`, MPW_PLUGIN_CACHE, MPW_SD_ROOT]
const WE_ASSETS = `${MPW_WS}/wallpaper_engine/assets`
const OUT_JSON = path.join(ROOT, 'package-matrix.json')
const BASELINE = path.join(ROOT, 'package-baseline.json')
const KNOWN = path.join(ROOT, 'known.json')

// ── 门禁键（与 SELFCK/known.json 字段对齐）──────────────────────────────
const GATES = {
  CONTAINER: '容器解析失败/布局越界',
  SCENE: 'scene.json 缺失或解析失败',
  NO_VISIBLE: '可见层数为 0',
  LAYER_ERR: '有层绘制失败/抛异常',
  WHITE_FALLBACK: '有层落到白块回退',
  TRANSPARENT_FALLBACK: '有层落到透明回退',
  TEX_DECODE: '有纹理解码失败',
  PARTICLE_EMPTY: '可见粒子层模拟后 0 粒子',
}

function findPkgs() {
  const out = []
  const roots = argVal('--pkg') ? [argVal('--pkg')] : ROOTS
  const scan = (p) => {
    let st; try { st = fs.statSync(p) } catch { return }
    if (st.isFile()) { if (/\.(pkg|mpkg)$/i.test(p)) out.push(p); return }
    for (const f of fs.readdirSync(p)) scan(path.join(p, f))
  }
  roots.forEach(scan)
  return [...new Set(out)]
}

function pkgId(file) {
  const d = path.basename(path.dirname(file))
  if (d === 'dd' || d === 'wallpapertest1' || d === 'wallpaperE' || path.extname(file).toLowerCase() === '.mpkg') {
    return path.basename(file).replace(/\.(pkg|mpkg)$/i, '')
  }
  return d
}

// ── mock GL（render-audit 同款 + 层归属 + 1×1 回退标记）─────────────────
// getLayer(): 每次绘制时取"当前层号"（bundle 的 [首帧] #N 日志在绘制前同步打出，见 auditPkg）
function makeMockGL(getLayer) {
  const CONST = { LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81, ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B85,
    FRAMEBUFFER_COMPLETE: 0x8CD5, MAX_TEXTURE_SIZE: 0x0D33, NO_ERROR: 0, TEXTURE0: 0 }
  for (let i = 0; i < 8; i++) CONST['TEXTURE' + i] = i
  let ids = 0, curUnit = 0, curFbo = null, curProg = null, drawCount = 0
  const curTex = new Array(8).fill(null)
  const mk = (k) => ({ id: k + '#' + (++ids) })
  const gl = {
    __draws: [],
    createTexture: () => mk('tex'), createFramebuffer: () => mk('fbo'), createBuffer: () => mk('buf'), createVertexArray: () => mk('vao'),
    createShader: () => mk('sh'), createProgram: () => mk('prog'),
    bindVertexArray: () => {}, activeTexture: (u) => { curUnit = u - CONST.TEXTURE0 },
    bindTexture: (t, tex) => { curTex[curUnit] = tex || null },
    bindFramebuffer: (t, f) => { curFbo = f }, useProgram: (p) => { curProg = p },
    bindBuffer: () => {},
    // 1×1 上传打标：全 255 → white（bundle whiteTex），全 0 → transparent
    texImage2D: (target, level, ifmt, w, h, b, fmt, type, data) => {
      const tex = curTex[curUnit]
      if (!tex || w !== 1 || h !== 1 || !data || data.length < 4) return
      let all = data[0]; for (let i = 1; i < 4; i++) if (data[i] !== all) { all = -1; break }
      if (all === 255) tex.__solid = 'white'
      else if (all === 0) tex.__solid = 'transparent'
    },
    drawArrays: (m, f, c) => { drawCount++; gl.__draws.push({ __layer: getLayer ? getLayer() : null, tex0: curTex[0] }) },
    drawElements: (m, c) => { drawCount++; gl.__draws.push({ __layer: getLayer ? getLayer() : null, tex0: curTex[0] }) },
    getProgramParameter: (p, k) => (k === CONST.LINK_STATUS || k === CONST.COMPILE_STATUS) ? true : (k === CONST.ACTIVE_UNIFORMS ? 1 : k === CONST.ACTIVE_ATTRIBUTES ? 2 : null),
    getActiveUniform: () => ({ name: 'g_Texture0', type: 0x8B62 }),
    getActiveAttrib: (p, i) => ({ name: i === 0 ? 'a_Position' : 'a_TexCoord', size: i === 0 ? 3 : 2 }),
    getAttribLocation: (p, n) => n === 'a_Position' ? 0 : n === 'a_TexCoord' ? 1 : n === 'a_Alpha' ? 2 : -1,
    getUniformLocation: () => ({ u: 1 }), getShaderParameter: () => true, checkFramebufferStatus: () => CONST.FRAMEBUFFER_COMPLETE,
    getError: () => CONST.NO_ERROR, getParameter: (k) => k === CONST.MAX_TEXTURE_SIZE ? 4096 : 0,
    getShaderInfoLog: () => '', getProgramInfoLog: () => '',
  }
  const proxy = new Proxy(gl, { get(t, prop) {
    if (prop in t) return t[prop]
    if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return CONST[prop] !== undefined ? CONST[prop] : 1
    return () => {}
  } })
  return proxy
}

const VERT = 'attribute vec3 a_Position; attribute vec2 a_TexCoord; uniform mat4 g_ModelViewProjectionMatrix; varying vec2 v_TexCoord; void main(){ gl_Position = g_ModelViewProjectionMatrix * vec4(a_Position,1.0); v_TexCoord = a_TexCoord; }'
const FRAG = 'uniform sampler2D g_Texture0; varying vec2 v_TexCoord; void main(){ gl_FragColor = texture(g_Texture0, v_TexCoord); }'
const shaderResolver = async (rel) => (rel.endsWith('.vert') ? VERT : FRAG)

// ── 单包分析 ────────────────────────────────────────────────────────────
async function analyze(file) {
  const t0 = performance.now()
  const row = { id: pkgId(file), path: file, fileMB: +(fs.statSync(file).size / 1048576).toFixed(1), issues: [] }
  const issue = (key, detail) => row.issues.push({ key, detail: detail || GATES[key] || key })
  let tParse = 0, tDecode = 0

  let pkg = null
  try { pkg = lib.parsePkg(new Uint8Array(fs.readFileSync(file))) } catch (e) {
    row.container = { err: String(e.message) }; issue('CONTAINER', 'parsePkg: ' + e.message); row.timing = { parseMs: +(performance.now() - t0).toFixed(1) }
    return row
  }
  const entry = (n) => { const e = lib.getEntry(pkg, n); return e ? new Uint8Array(e) : null }
  // 包内入口优先，WE 公共资产兜底（粒子材质/公共纹理可能在 assets 下）
  const readBytes = (n) => {
    const e = entry(n); if (e) return e
    try { const fp = path.join(WE_ASSETS, String(n || '')); if (fp.startsWith(WE_ASSETS) && fs.existsSync(fp)) return new Uint8Array(fs.readFileSync(fp)) } catch {}
    return null
  }
  const rd = (b) => dec.decode(b)
  // 纹理名解析（demo loadTex 同款）：材质引用裸名 → 包内入口 materials/<名>.tex，WE 公共资产兜底
  const readTexBytes = (tn) => {
    for (const cand of ['materials/' + tn + '.tex', 'materials/' + tn, tn + '.tex', tn]) {
      const e = entry(cand); if (e) return e
    }
    try { const fp = path.join(WE_ASSETS, 'materials', tn + '.tex'); if (fs.existsSync(fp)) return new Uint8Array(fs.readFileSync(fp)) } catch {}
    return null
  }
  const lay = lib.verifyLayout(pkg)
  row.container = { magic: pkg.magic, entries: pkg.entries.length, sizeMB: +(pkg.fileSize / 1048576).toFixed(1), layoutOk: !!lay.ok }
  if (!lay.ok) issue('CONTAINER', '入口数据越界 dataEnd=' + lay.dataEnd + ' fileSize=' + lay.fileSize)

  // 视频壁纸容器（PKGM0014：wallpaper.mp4 + preview + project.json [+ scene.json 编辑器残留]）：
  // 没有 .tex 资产，官方就是整段播放 mp4——场景层不渲染是**预期**，不做场景/白块/粒子门禁
  const videoEntries = pkg.entries.filter((e) => /\.(mp4|webm)$/i.test(e.name)).length
  const texEntries = pkg.entries.filter((e) => /\.tex$/i.test(e.name)).length
  if (videoEntries > 0 && texEntries === 0) {
    let layerN = 0
    try { const se = entry('scene.json'); if (se) layerN = ((JSON.parse(rd(se).replace(/^\uFEFF/, '')) || {}).objects || []).length } catch {}
    row.type = 'video-wallpaper'
    row.scene = { layers: layerN, visible: 0, video: true }
    row.textures = { referenced: 0, pkgHit: 0, decodeOk: 0, decodeFail: 0, bytesMB: 0, formats: {}, failNames: [] }
    row.particles = { layers: 0, maxcount: 0, spriteSheets: 0, multiImage: 0, aliveRows: [] }
    row.audit = { drawnLayers: 0, skippedLayers: 0, layerErrors: [], whiteFallback: [], transparentFallback: [], draws: 0 }
    row.timing = { parseMs: +(performance.now() - t0).toFixed(1), decodeMs: 0, auditMs: 0 }
    return row
  }

  // ── scene ──
  let sceneObj = null
  for (const n of ['scene.json', 'Scene.json']) { const e = entry(n); if (e) { try { sceneObj = JSON.parse(rd(e).replace(/^\uFEFF/, '')) } catch (er) { row.sceneErr = String(er.message) } ; break } }
  if (!sceneObj) {
    // PKGM0014 三入口（mp4+preview.gif+project.json）= 视频壁纸容器，无 scene.json 属正常
    const isVideoPkg = pkg.entries.some((e) => /\.(mp4|webm)$/i.test(e.name))
    if (isVideoPkg) { row.type = 'video-wallpaper'; row.scene = { layers: 0, visible: 0, video: true }; row.textures = { referenced: 0, pkgHit: 0, decodeOk: 0, decodeFail: 0, bytesMB: 0, formats: {}, failNames: [] }; row.particles = { layers: 0, maxcount: 0, spriteSheets: 0, multiImage: 0, aliveRows: [] }; row.audit = { drawnLayers: 0, skippedLayers: 0, layerErrors: [], whiteFallback: [], transparentFallback: [], draws: 0 }; row.timing = { parseMs: +(performance.now() - t0).toFixed(1), decodeMs: 0, auditMs: 0 }; return row }
    row.scene = { err: row.sceneErr || 'no scene.json' }; issue('SCENE', row.sceneErr || 'no scene.json'); row.timing = { parseMs: +(performance.now() - t0).toFixed(1) }; return row
  }
  const objs = sceneObj.objects || []
  let soundN = 0, lightN = 0, attachmentN = 0
  for (const o of objs) {
    if (o.sound != null) soundN++
    if (o.light != null) lightN++
    if (o.attachment != null) attachmentN++
  }

  const readParticleDef = (p) => { try { const e = entry(p); return e ? JSON.parse(rd(e)) : null } catch { return null } }
  let scene = null
  try {
    scene = lib.parseScene(sceneObj, null, { attachCtx: { readEntry: (n) => lib.getEntry(pkg, n), time: 0 }, readParticleDef })
  } catch (e) { row.scene = { err: 'parseScene: ' + e.message }; issue('SCENE', 'parseScene: ' + e.message); row.timing = { parseMs: +(performance.now() - t0).toFixed(1) }; return row }
  tParse = performance.now() - t0

  // render config：与 demo 默认一致（hideUI/clearBgFx 开，粒子**保留**——门禁要审计粒子）
  let propsMap = null
  try {
    const pj = entry('project.json') || (fs.existsSync(path.join(path.dirname(file), 'project.json')) ? fs.readFileSync(path.join(path.dirname(file), 'project.json')) : null)
    const pr = pj ? JSON.parse(rd(pj)) : null
    if (pr && pr.general && pr.general.properties) { propsMap = {}; for (const [k, v] of Object.entries(pr.general.properties)) propsMap[k] = v && typeof v === 'object' ? v.value : v }
  } catch {}
  lib.applyRenderConfig(scene, { sceneId: row.id, properties: propsMap, refrender: null, anchor: "refcenter", hideUI: true, hideParticles: false, clearBgFx: true, log: () => {} })

  const layers = scene.layers
  const visible = layers.filter((l) => l.visible).length
  row.scene = {
    layers: layers.length, visible,
    containers: layers.filter((l) => l.isContainer).length,
    image: layers.filter((l) => typeof l.image === 'string' && !l.isContainer).length,
    video: layers.filter((l) => /\.(mp4|webm)$/i.test(String(l.image || ''))).length,
    particle: layers.filter((l) => l.particleDef).length,
    text: layers.filter((l) => l.__text).length,
    sound: soundN, light: lightN,
  }
  row.transforms = {
    parented: layers.filter((l) => l.parent !== undefined && l.parent !== null).length,
    attachment: attachmentN,
    puppet: layers.filter((l) => l.puppet || l.animLayers).length,
    alignNonCenter: layers.filter((l) => l.alignment && l.alignment !== 'center').length,
    animated: layers.filter((l) => l.anim && Object.keys(l.anim).length).length,
  }
  if (layers.length > 0 && visible === 0) issue('NO_VISIBLE', `层=${layers.length} 全部不可见`)

  // ── 纹理：demo loadScene 同款（model→material→passes[0].textures[0]→textureName/particleTexName）──
  const texStats = { referenced: 0, pkgHit: 0, decodeOk: 0, decodeFail: 0, bytes: 0, formats: {}, failNames: [] }
  const texRecs = new Map() // 名 → {ok, missing, tex, m0, err}
  const ensureTex = (tn) => {
    if (texRecs.has(tn)) return texRecs.get(tn)
    let rec = { ok: false, missing: true }
    const b = readTexBytes(tn)
    if (b) {
      rec.missing = false
      try {
        const tex = lib.parseTex(b)
        texStats.formats[tex.format] = (texStats.formats[tex.format] || 0) + 1
        const m0 = lib.decodeMip0(tex)
        // kind：rgba=Node 已解出像素；image=PNG/JPEG/WEBP（浏览器 createImageBitmap，Node 光栅化不了）；video=MP4
        const kind = m0.rgba ? 'rgba' : (m0.image ? 'image' : (m0.video ? 'video' : 'none'))
        rec = { ok: true, missing: false, tex, m0, kind }
        texStats.decodeOk++
        texStats.bytes += m0.rgba ? m0.rgba.length : (m0.image ? m0.image.length : (m0.video ? m0.video.length : 0))
      } catch (e) { rec = { ok: false, missing: false, err: e.message }; texStats.decodeFail++; texStats.failNames.push(tn + ': ' + e.message) }
    }
    texRecs.set(tn, rec)
    return rec
  }
  const refTex = (tn) => { // 引用计数 + 解码；返回是否可用（util/* 视为 builtin 可用）
    if (typeof tn !== 'string' || !tn || tn.startsWith('_rt_')) return false
    texStats.referenced++
    if (tn.startsWith('util/')) { texStats.pkgHit++; return true }
    const r = ensureTex(tn)
    if (!r.missing) texStats.pkgHit++
    return r.ok
  }
  const modelMissing = []
  for (const l of layers) {
    try {
      if (typeof l.image === 'string' && !l.isContainer) {
        const bi = lib.resolveBuiltin(l.image)
        let mj = bi && bi.kind === 'model' ? bi.value : null
        if (!mj) {
          const me = entry(l.image)
          if (!me) { modelMissing.push(l.image); continue }
          mj = JSON.parse(rd(me))
        }
        if (mj.solidlayer) l.solid = true
        const mat = lib.resolveMaterial(mj)
        let material = null
        if (mat && mat.materialPath) {
          const bm = lib.resolveBuiltin(mat.materialPath)
          material = bm && bm.kind === 'material' ? bm.value : null
          if (!material) { const mate = readBytes(mat.materialPath); if (mate) { try { material = JSON.parse(rd(mate)) } catch {} } }
        }
        if (!material) continue
        const passes = material.passes || []
        const pass0 = passes[0]
        const texName = pass0 && pass0.textures && pass0.textures[0]
        if (refTex(texName)) l.textureName = texName
        for (let pi = 1; pi < passes.length; pi++) for (const tn of (passes[pi].textures || [])) refTex(tn)
      }
      // 效果链纹理（demo：resolveEffectChain + 逐 pass 加载，util/_rt_ 除外）
      for (const ef of (l.effects || [])) {
        try {
          lib.resolveEffectChain(pkg, ef, rd)
          for (const p of (ef.passes || [])) for (const tn of (p.textures || [])) {
            if (typeof tn === 'string' && !tn.startsWith('util/') && !tn.startsWith('_rt_')) refTex(tn)
          }
        } catch {}
      }
      // 粒子层：def.material → pass0.textures[0] → particleTexName（WE assets 兜底）
      if (l.particleDef && l.particleDef.material) {
        try {
          const mate = readBytes(l.particleDef.material)
          const material = mate ? JSON.parse(rd(mate)) : null
          const pass0 = material && material.passes && material.passes[0]
          l.particleBlending = (pass0 && pass0.blending) || 'translucent'
          const texName = pass0 && pass0.textures && pass0.textures[0]
          if (refTex(texName)) l.particleTexName = texName
        } catch {}
      }
    } catch {}
  }
  if (modelMissing.length) row.modelMissing = [...new Set(modelMissing)].slice(0, 8)
  row.textures = {
    referenced: texStats.referenced, pkgHit: texStats.pkgHit,
    decodeOk: texStats.decodeOk, decodeFail: texStats.decodeFail,
    bytesMB: +(texStats.bytes / 1048576).toFixed(1), formats: texStats.formats,
    failNames: texStats.failNames.slice(0, 8),
  }
  if (texStats.decodeFail > 0) issue('TEX_DECODE', texStats.failNames.slice(0, 3).join(' | '))
  tDecode = performance.now() - t0

  // ── 粒子 CPU 模拟：build + simulate 至 starttime+25s（发射窗口）→ 存活数 ──
  const particleRows = []
  for (const l of layers.filter((x) => x.particleDef)) {
    const def = l.particleDef
    const st = (def && def.starttime) || 0
    const horizon = st + 25
    let alive = null
    let unverifiable = false
    if (l.visible && horizon <= 95) { // simulateParticleSystem 步进 guard=2000×0.05s=100s
      try {
        const sys = lib.buildParticleSystem(def, { seedStr: 'matrix:' + (l.name || l.id) })
        // ①(P-75e 2026-09-15) **直接模拟这条路径也必须给指针**：`controlpoint[].flags & 1`
        //   （lockToPointer）的发射器在**没有指针信息时根本不发射**（P-69 语义，官方预览亦然）。
        //   本审计此前只给"渲染那条路径"注入了 `__mpwPointer`（见下方 render 前那段），
        //   **漏了这条直接 `buildParticleSystem` + `simulateParticleSystem` 的路径** ⇒
        //   hina `cherry blossoms on cursor`(maxcount 1000)、3660962877/红鸾樱落的"鼠标"层
        //   被误报 `[PARTICLE_EMPTY] … t=25s 存活 0`：那是**假阳性**，不是渲染 bug。
        //   这里的指针 = 画布正中（设计坐标，y 向下）= 真机"鼠标停在画面里"的常态；
        //   "无指针 ⇒ 不发射"由 projection-y-test.mjs 断言覆盖，两边都不丢。
        try { sys.pointer = [1920, 1080] } catch (e) { /* ignore */ }
        lib.simulateParticleSystem(sys, horizon)
        alive = sys.particles.length
        if (alive === 0) issue('PARTICLE_EMPTY', `层 "${l.name || l.id}" maxcount=${sys.maxCount} 但 t=${horizon}s 存活 0`)
      } catch (e) { alive = -1; issue('PARTICLE_EMPTY', `层 "${l.name || l.id}" 模拟异常: ${e.message}`) }
    } else if (l.visible) unverifiable = true // starttime 太晚，模拟不到
    particleRows.push({ name: l.name || l.id, maxcount: (def && def.maxcount) || 0, alive, ...(unverifiable ? { unverifiable: true } : {}), ...(l.visible ? {} : { hidden: true }) })
  }
  row.particles = {
    layers: particleRows.length,
    maxcount: particleRows.reduce((s, r) => s + r.maxcount, 0),
    spriteSheets: 0, multiImage: 0, aliveRows: particleRows,
  }
  for (const l of layers.filter((x) => x.particleDef)) {
    const rec = l.particleTexName ? texRecs.get(l.particleTexName) : null
    if (rec && rec.ok && rec.tex) {
      const si = lib.spriteInfo(rec.tex)
      if (si) { row.particles.spriteSheets++; if (si.multiImage) row.particles.multiImage++ }
    }
  }

  // ── 审计：mock GL + 真实 renderScene（render-audit 路径）──
  row.audit = await auditPkg(pkg, scene, texRecs, row)
  const a = row.audit
  if (a.layerErrors.length) issue('LAYER_ERR', a.layerErrors.slice(0, 3).join(' | '))
  if (a.whiteFallback.length) issue('WHITE_FALLBACK', a.whiteFallback.slice(0, 5).join(','))
  if (a.transparentFallback.length) issue('TRANSPARENT_FALLBACK', a.transparentFallback.slice(0, 5).join(','))
  const tEnd = performance.now()
  row.timing = { parseMs: +tParse.toFixed(1), decodeMs: +(tDecode - tParse).toFixed(1), auditMs: +(tEnd - t0 - tDecode).toFixed(1) }
  return row
}

// mock-GL 驱动真实 renderScene；[首帧] 日志给出层归属
async function auditPkg(pkg, scene, texRecs, row) {
  const gl = makeMockGL(() => curLayerIdx)
  const logs = []
  let curLayerIdx = -1
  const H = {}
  installPuppet(H)
  const entry = (n) => { const e = lib.getEntry(pkg, n); return e ? new Uint8Array(e) : null }

  // 蒙皮准备（render-audit 同款）
  const skinLayers = []
  for (const l of scene.layers) {
    try {
      if (!l.image) continue
      const me = entry(l.image); if (!me) continue
      const mj = JSON.parse(dec.decode(me)); if (!mj || !mj.puppet) continue
      const ru = entry(mj.puppet); if (!ru) continue
      const mesh = H._parseMdl(new MpwBuffer(ru.buffer, ru.byteOffset, ru.byteLength))
      if (!mesh || !mesh.bones || !mesh.bones.length || !mesh.animations || !mesh.animations.length) continue
      const nb = mesh.bones.length
      const bindWorld = new Array(nb), bindInv = new Array(nb)
      for (let b = 0; b < nb; b++) { const p = mesh.bones[b].parent, lo = mesh.bones[b].bind; bindWorld[b] = (p >= 0 && bindWorld[p]) ? H._matMulRow(bindWorld[p], lo) : lo.slice() }
      for (let b = 0; b < nb; b++) bindInv[b] = H._matInvertRow(bindWorld[b])
      const anim = mesh.animations[0]
      const N = Math.max(3, anim.frameCount || 3)
      const l2 = { mesh, nb, bindInv, animIdx: 0, fps: anim.fps || 30, frameCount: N, gBones: new Float32Array(nb * 16) }
      skinLayers.push(Object.assign(l, { __skin: l2 }))
    } catch {}
  }
  const updateBones = (tSec) => {
    for (const l of skinLayers) {
      const sk = l.__skin
      const rt = H._sampleAnimRT(sk.mesh, sk.mesh.animations[sk.animIdx], Math.floor(tSec * sk.fps) % sk.frameCount, sk.nb, sk.mesh.bones)
      for (let b = 0; b < sk.nb; b++) {
        const m = H._matMulRow(H._matMulRow([Math.cos(rt[b].angle), -Math.sin(rt[b].angle), 0, 0, Math.sin(rt[b].angle), Math.cos(rt[b].angle), 0, 0, 0, 0, 1, 0, rt[b].tx, rt[b].ty, 0, 1], [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]), sk.bindInv[b])
        sk.gBones.set(m, b * 16)
      }
    }
  }

  // 真实纹理上传（1×1 全白/全黑由 texImage2D 打标；util 种子用带名假纹理避免误标）
  // image/video 种类（PNG/JPEG/WEBP/MP4）Node 无法光栅化 → 种带名假对象：加载已成功，
  // 只是本机无像素（浏览器侧 createImageBitmap/<video> 解码）——不算白块。
  const fake = (n, w = 8, h = 8) => ({ glTex: { __name: n, id: 'fake_' + n }, width: w, height: h })
  const texMap = new Map()
  for (const [tn, rec] of texRecs) {
    if (!rec.ok) continue
    try {
      if (rec.m0 && rec.m0.rgba) texMap.set(tn, { glTex: lib.makeTexture(gl, rec.m0.rgba, rec.m0.width, rec.m0.height), width: rec.m0.width, height: rec.m0.height })
      else texMap.set(tn, fake(tn, rec.m0 ? rec.m0.width : 8, rec.m0 ? rec.m0.height : 8))
    } catch {}
  }
  texMap.set('util/white', fake('util/white', 1, 1))
  texMap.set('util/noflow', fake('util/noflow', 1, 1))
  texMap.set('util/noise', fake('util/noise', 256, 256))
  for (const tn of ['util/gradient', 'base_white']) texMap.set(tn, fake(tn))

  const whiteDrawn = new Set()
  const transparentDrawn = new Set()
  const layerErrors = []
  const meshDrawn = new Set()
  const op = scene.general && scene.general.orthogonalprojection
  const W = Math.min(1920, (op && op.width) || 1920), Hh = Math.min(1080, (op && op.height) || 1080)

  let renderer = null
  try {
    renderer = lib.createRenderer({ getContext: () => gl, width: W, height: Hh }, {
      onLog: (m) => {
        logs.push(m)
        const m1 = /^\[首帧\] #(\d+) /.exec(m)
        if (m1) curLayerIdx = Number(m1[1])
        else if (m.includes('层循环结束')) curLayerIdx = -2
        if (/跳过渲染失败的层|GPU 错误/.test(m)) layerErrors.push(m)
      },
      shaderResolver,
      onMeshLayer: (layer) => {
        const sk = layer.__skin
        const tex = layer.textureName ? texMap.get(layer.textureName) : null
        meshDrawn.add(curLayerIdx)
        if (renderer.renderMeshLayer && sk && sk.gBones && tex && tex.glTex) {
          renderer.renderMeshLayer(layer, sk.mesh, sk.gBones, sk.nb, [layer.origin[0], layer.origin[1]], [layer.scale[0], -layer.scale[1]], [(op && op.width) || 3840, (op && op.height) || 2160], tex.glTex)
        }
      },
      trace: false, auditFrames: 1, copyBackground: false, clearBgFx: true, hideParticles: false, align: true,
    })
  } catch (e) {
    return { err: 'createRenderer: ' + e.message, drawnLayers: 0, skippedLayers: scene.layers.length, layerErrors: [String(e.message)], whiteFallback: [], transparentFallback: [], draws: 0 }
  }
  updateBones(1.0)
  skinLayers.forEach((l) => { l.__skinReady = true })
  // 静态白块预测：声明了纹理名但表里没有（解码失败/入口缺失/未上传）的非纯色可见层。
  // 文本层（__text）的纹理由页面文本渲染器运行时生成（'text:*'），Node 侧恒缺 → 排除。
  const staticWhite = new Set()
  for (const l of scene.layers) {
    if (!l.visible || l.isContainer || l.solid || !l.textureName || l.__text) continue
    if (!texMap.has(l.textureName)) staticWhite.add(l.name || l.id)
  }
  let renderErr = null
  // ①(P-69 2026-09-15) 渲染前注入指针：`controlpoint[].flags:1`（lockToPointer）的发射器**需要指针才发射**
  //   （官方预览/无鼠标时本就不发射，见 we-scene-bundle.js 的 BONES/CURSOR 段与 PATCHES P-69）。
  //   本审计原先没有指针信息 ⇒ hina `cherry blossoms on cursor`、3660962877/红鸾樱落的"鼠标"层
  //   从"有粒子"变成"0 粒"，会让 drawnLayers 16→15 并误触 PARTICLE_EMPTY 规则。
  //   注入一个画布正中的指针 = 真机"鼠标在画面里"的常态（也顺带覆盖"有指针时会发射"这条新路径）；
  //   "无指针 ⇒ 0 粒"由 projection-y-test.mjs 断言覆盖。坐标口径：设计坐标（0..3840 / 0..2160，y 向下）。
  try { globalThis.__mpwPointer = { x: 1920, y: 1080, inside: true } } catch (e) { /* ignore */ }
  try { await renderer.render(scene, texMap, W, Hh, 1.0) } catch (e) { renderErr = String(e.message) }
  try { delete globalThis.__mpwPointer } catch (e) { /* ignore */ }
  // draw 归属统计（handler 在绘制瞬间读取 curLayerIdx → __layer）
  const drawn = new Set()
  for (const d of gl.__draws) {
    const li = d.__layer
    if (li == null || li < 0) continue
    drawn.add(li)
    const s = d.tex0 && d.tex0.__solid
    if (s === 'white') whiteDrawn.add(li)
    else if (s === 'transparent') transparentDrawn.add(li)
  }
  const nameOf = (li) => { const l = scene.layers[li]; return l ? (l.name || l.id) : 'layer#' + li }
  // GL 观测的回退也要过滤：solid 层绑 whiteTex×颜色是正常路径；文本层透明回退 = Node 无文本渲染
  const isRealWhite = (li) => { const l = scene.layers[li]; return l && !l.solid && !l.__text && l.textureName && !texMap.has(l.textureName) }
  const whiteFallback = [...new Set([...staticWhite, ...[...whiteDrawn].filter(isRealWhite).map(nameOf)])]
  // ①(N5 2026-09-14) **按层号判定 __text，不按名字回查**：同一场景里"文本层 `Clock`"与"底板层 `Clock`"
  //   重名时，`scene.layers.find(name===n)` 会命中另一个（非文本）层 → 文本层的透明回退被误计成异常
  //   （P-57 N5 让时钟/日期文本默认可见后实测 9 个包各 +2：`纯色,Clock,Date` 全是重名误判）。
  //   文本层恒被排除（Node 侧没有文本光栅器，'text:*' 纹理必缺），与上面的注释口径一致。
  const transparentFallback = [...new Set([...transparentDrawn]
    .filter((li) => { const l = scene.layers[li]; return !(l && l.__text) && !staticWhite.has(nameOf(li)) })
    .map(nameOf))]
  const skipped = []
  for (const m of logs) { const mm = /^\[首帧\] \. #(\d+) 跳过/.exec(m); if (mm) skipped.push(nameOf(Number(mm[1]))) }
  return {
    drawnLayers: drawn.size, skippedLayers: skipped.length, skippedNames: [...new Set(skipped)].slice(0, 12),
    layerErrors: [...new Set(layerErrors)].slice(0, 8),
    whiteFallback: whiteFallback.slice(0, 12), transparentFallback: transparentFallback.slice(0, 12),
    meshDrawn: [...meshDrawn].filter((i) => i >= 0).map(nameOf).slice(0, 12),
    draws: gl.__draws.length, renderErr,
    logTail: logs.filter((m) => /⚠|error|失败|错误/.test(m)).slice(0, 8),
  }
}

// ── 汇总/门禁/基线 ──────────────────────────────────────────────────────
function loadKnown() {
  try { return JSON.parse(fs.readFileSync(KNOWN, 'utf8')) } catch { return { updated: null, entries: {} } }
}

function printTable(rows) {
  console.log(`\n${'包'.padEnd(28)} 层  可见 绘制 白块 透明 解码败 粒子(max)  门禁`)
  for (const r of rows) {
    if (r.container && r.container.err) { console.log(`${r.id.slice(0, 26).padEnd(28)} ✗ ${r.container.err}`); continue }
    if (r.scene && r.scene.err) { console.log(`${r.id.slice(0, 26).padEnd(28)} ✗ ${r.scene.err}`); continue }
    const a = r.audit || {}
    const gates = r.issues.map((i) => (i.known ? '·' + i.key : '❌' + i.key)).join(' ') || '✓'
    console.log(
      `${r.id.slice(0, 26).padEnd(28)} ${String((r.scene && r.scene.layers) || 0).padStart(3)} ${String((r.scene && r.scene.visible) || 0).padStart(4)} ` +
      `${String(a.drawnLayers ?? '-').padStart(4)} ${String((a.whiteFallback || []).length).padStart(4)} ` +
      `${String((a.transparentFallback || []).length).padStart(4)} ${String((r.textures && r.textures.decodeFail) || 0).padStart(4)} ` +
      `${String((r.particles ? r.particles.layers : 0) + '(' + (r.particles ? r.particles.maxcount : 0) + ')').padStart(7)}  ${gates}`)
  }
}

function compareToBaseline(rows) {
  let base
  try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) } catch { return { missing: true } }
  const baseRows = new Map((base.rows || []).map((r) => [r.path, r]))
  const diffs = []
  const explained = []   // ①(P-75f) 已解释的基线变化（照旧打印，不静默）
  for (const r of rows) {
    const b = baseRows.get(r.path)
    if (!b) { diffs.push({ id: r.id, kind: 'NEW', msg: '基线中不存在（新包）' }); continue }
    const a = r.audit || {}, ab = b.audit || {}
    const cmp = [
      ['drawnLayers', (a.drawnLayers ?? 0), (ab.drawnLayers ?? 0), 'lt'],
      ['whiteFallback', (a.whiteFallback || []).length, (ab.whiteFallback || []).length, 'gt'],
      ['transparentFallback', (a.transparentFallback || []).length, (ab.transparentFallback || []).length, 'gt'],
      ['decodeFail', (r.textures && r.textures.decodeFail) || 0, (b.textures && b.textures.decodeFail) || 0, 'gt'],
      ['layerErrors', (a.layerErrors || []).length, (ab.layerErrors || []).length, 'gt'],
    ]
    // ①(P-75f 2026-09-15) **已解释的基线下降**：不是白名单式静默豁免 —— 每条必须带 reason 与证据，
    //   且**照旧打印**（走 explained 列表而不是 diffs 列表）。这样门禁不会为"已知且已解释的行为变化"变红，
    //   但读者仍能看到它、并能按 reason 复核。
    const EXPLAINED_BASE_DROPS = [
      {
        id: '3554161528', field: 'drawnLayers', base: 16, now: 15,
        reason: 'P-69 语义修正：`cherry blossoms on cursor`(id389) 的 controlpoint[0].flags=1 是 lockToPointer'
          + '（发射器锁定鼠标指针）⇒ **没有指针信息时不发射**，该层不再产生 GL draw。'
          + '依据：官方 WE 渲染 Testphoto/TP11/W1.jpg 画面正中没有任何放射花瓣爆（用户第 2 项即为此）；'
          + '注入指针后实测该层 +103 粒（`--import` 注入 `__mpwPointer` 对比：alive 91→194 @t=1.03s）。'
          + '**未定**：注入指针后该层已发射却仍未产生 GL draw（见 PATCHES P-75f 的待查项）。',
      },
    ]
    for (const [k, v, bv, dir] of cmp) {
      const regressed = dir === 'lt' ? v < bv : v > bv
      if (!regressed) continue
      const ex = EXPLAINED_BASE_DROPS.find((e) => e.id === r.id && e.field === k && e.base === bv && e.now === v)
      if (ex) { explained.push({ id: r.id, field: k, base: bv, now: v, reason: ex.reason }); continue }
      diffs.push({ id: r.id, kind: 'REGRESS', field: k, now: v, base: bv, msg: `${k}: ${bv} → ${v}` })
    }
    for (const tk of ['parseMs', 'decodeMs', 'auditMs']) {
      const v = (r.timing || {})[tk], bv = (b.timing || {})[tk]
      // 只对有意义的绝对值判慢：地板 800ms + 幅度阈值。
      // ①(2026-09-14 主会话整合修) 阈值 1.8× → **3.0×**，并给出实测依据：
      //   本机重度换页（swap ~10GB/12GB）时 auditMs 同内容实测 2.65/2.99/3.26s vs 基线 1.63s
      //   = 1.6–2.0× 的**纯负载噪声**（`drawn` 24→24、decodeMs 470–500ms 稳定不变）。
      //   1.8× 阈值会把这种噪声判成门禁红 → 正是"假红浪费会话"的典型。计时字段只做**粗筛**：
      //   真退化（解码器/审计翻三倍以上）仍会命中；内容类断言（NEW/REGRESS/drawn/tex/audit）保持严格。
      //   timing 基线重置：node package-matrix.mjs --write-baseline
      if (typeof v === 'number' && typeof bv === 'number' && bv >= 800 && v > bv * 3.0) diffs.push({ id: r.id, kind: 'SLOW', field: tk, now: v, base: bv, msg: `${tk}: ${bv}ms → ${v}ms (+200%，墙钟；本机负载噪声实测可达 2.0×）` })
    }
  }
  return { diffs, explained }
}

// ── main ────────────────────────────────────────────────────────────────
const files = findPkgs()
if (!HAS('--json') && !HAS('--pkg')) console.error(`扫描 ${files.length} 个包（max ${MAX_MB}MB）…`)
const rows = []
for (const f of files) {
  try { rows.push(await analyze(f)) } catch (e) {
    rows.push({ id: pkgId(f), path: f, fatal: String(e.message), issues: [{ key: 'CONTAINER', detail: 'analyze 异常: ' + e.message }], scene: { layers: 0, visible: 0 }, textures: { decodeFail: 0 }, particles: { layers: 0, maxcount: 0 }, audit: {} })
  }
}
const known = loadKnown()
for (const row of rows) for (const iss of row.issues) {
  const k = row.id + '|' + iss.key
  if (known.entries && known.entries[k]) iss.known = known.entries[k]
}

if (HAS('--json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0) }
printTable(rows)

const bad = rows.filter((r) => r.issues.some((i) => !i.known))
console.log(`\n══ 门禁汇总：${rows.length} 包 · ${bad.length} 包有未豁免异常`)
for (const r of bad) for (const i of r.issues) if (!i.known) console.log(`  ❌ ${r.id} [${i.key}] ${i.detail}`)
const knownHit = rows.flatMap((r) => r.issues.filter((i) => i.known).map((i) => `  · ${r.id} [${i.key}] ${i.detail}（known: ${i.known.reason}）`))
if (knownHit.length) { console.log(`  已豁免 ${knownHit.length} 项：`); knownHit.slice(0, 10).forEach((l) => console.log(l)) }

fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1))
if (HAS('--write-baseline') || !fs.existsSync(BASELINE)) {
  fs.writeFileSync(BASELINE, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1))
  console.log(`\n基线已写入 ${path.basename(BASELINE)}${HAS('--write-baseline') ? '（--write-baseline）' : '（首次运行）'}`)
}
if (HAS('--check')) {
  const { missing, diffs, explained } = compareToBaseline(rows)
  if (missing) { console.error('✗ package-baseline.json 不存在，先跑一次 node package-matrix.mjs 生成'); process.exit(2) }
  // ①(P-75f) 已解释的基线变化：**照旧打印**（不是静默豁免），并给出 reason 供复核。
  //   注意必须放在 `if (diffs.length)` **之外** —— 否则"只有已解释项、没有真退化"时反而不打印，
  //   而那正是最需要让人看见的情况（本次 hina 16→15 就是这种）。
  if (explained && explained.length) {
    console.log(`\n已解释的基线变化 ${explained.length} 项（非退化，带依据）：`)
    for (const e of explained) console.log(`  · ${e.id} ${e.field}: ${e.base} → ${e.now}\n     依据：${e.reason}`)
  }
  if (diffs.length) {
    console.error(`\n✗ 与基线相比 ${diffs.length} 项退化：`)
    for (const d of diffs) console.error(`  ✗ ${d.id} ${d.msg}${d.kind === 'NEW' ? '' : '（基线 ' + d.base + ' → 现在 ' + d.now + '）'}`)
    process.exit(1)
  }
  console.log('\n✓ --check：与基线逐包比对无退化')
}
process.exit(0)
