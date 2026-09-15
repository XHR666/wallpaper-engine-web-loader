// tex-upload-guard-test.mjs — W1/W3/W4（P-36）纹理上传加固 + 精灵帧 + 长条眼窗限定 单测
// 覆盖：
//   W1① texDownsampleCap 降采样策略（设备 MAX_TEXTURE_SIZE 无条件触发 + 旧 4096 行为保持）
//   W1② makeTexture / makeTextureMip 长度消毒（非法长度不再触达 GL；计数可上报）
//   W1   makeTextureMip generateMipmap 仅 POT（大 NPOT 不再产生 INVALID_OPERATION 残留旗标）
//   W1   makeTextureMip RG8 分支 + WebGL1（无 RG8 常量）回退
//   W1③ drawGuard isTexture=false → 跳过绘制 + 记上报
//   W4   spriteFrameRectUV（row-major 换行/回绕）+ renderLayer 精灵帧 UV 接线（forced/play）
//   W3   parseScene 文本 pointsize 属性绑定解包 + applyRenderConfig 长条眼窗场景白名单
// ①(P-69 2026-09-15 适配，非语义改动) 本用例的两条精灵帧 UV 断言写的是"**QFLIP 后**"的值
//   （下半帧 maxV=0.5 / 回绕帧 minV=0.5）。P-69 把 qflip 的默认值改成**跟随投影口径**
//   （投影修正后默认关；`?projy=legacy` 才默认开），默认路径不再翻 v。这里显式钉住 `?qflip=1`，
//   让本用例继续断言它原本要断言的那套值（qflip 默认值本身由 projection-y-test 覆盖）。
if (typeof globalThis.location === 'undefined') globalThis.location = { search: '?qflip=1' }
import * as lib from '../we-scene-bundle.js'

let pass = 0, fail = 0
const check = (name, cond, detail) => { if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')) } }

// ---- 纯函数：texDownsampleCap ----
{
  console.log('— W1① texDownsampleCap —')
  const cap = lib.texDownsampleCap
  check('3840×2260 @4096 → 不降（在限内，旧行为）', cap(3840, 2260, 4096) === null)
  check('6000×3000 @4096 → 2048（旧行为）', cap(6000, 3000, 4096) === 2048)
  check('4948×2935 @4096 → 2048（housebasic 类超限）', cap(4948, 2935, 4096) === 2048)
  check('3840×2160 @2048 设备 → 2048（设备上限触发）', cap(3840, 2160, 2048) === 2048)
  check('1600×900 @1024 设备 → 1024', cap(1600, 900, 1024) === 1024)
  check('1000×500 @4096 → 不降', cap(1000, 500, 4096) === null)
  check('devMax 缺省按 4096', cap(5000, 1000, undefined) === 2048)
  check('devMax 8192 时 6000 仍降 2048（超 4096 策略不变）', cap(6000, 3000, 8192) === 2048)
}

// ---- makeTexture 长度消毒 ----
{
  console.log('— W1② makeTexture 消毒 —')
  const W = 8, H = 4
  const uploads = []
  let texSeq = 0
  const gl = {
    createTexture: () => ({ id: ++texSeq }),
    bindTexture: () => {}, texParameteri: () => {},
    texImage2D: (t, lv, ifmt, w, h, b, fmt, type, data) => uploads.push({ w, h, data, bitmap: (data instanceof Object && !(data instanceof Uint8Array)) ? data : ((b instanceof Object && !(b instanceof Uint8Array)) ? b : null) }),
    getError: () => 0,
  }
  const g = globalThis
  const before = g.__mpwTexSanitizeCount || 0
  // RG88(2ch) 产物：w*h*2 → 补位展开
  lib.makeTexture(gl, new Uint8Array(W * H * 2), W, H)
  check('RG88 长度展开后上传 w*h*4', uploads.length === 1 && uploads[0].data.length === W * H * 4)
  // 非法长度（差 5 字节）→ 消毒成合法缓冲 + 计数
  lib.makeTexture(gl, new Uint8Array(W * H * 4 + 5), W, H)
  check('非法长度上传仍为 w*h*4（GL 永不收到坏缓冲）', uploads[1].data.length === W * H * 4)
  check('消毒计数 +1（上报可回答"为什么缺"）', (g.__mpwTexSanitizeCount || 0) === before + 1, String(g.__mpwTexSanitizeCount))
  check('消毒记录带 want/got', g.__mpwTexSanitizeLast && g.__mpwTexSanitizeLast.want === W * H * 4 && g.__mpwTexSanitizeLast.got === W * H * 4 + 5)
  // 位图路径不消毒（长度语义不适用）
  lib.makeTexture(gl, null, 0, 0, { width: 4, height: 4 })
  check('位图路径不受消毒影响', uploads[2].bitmap !== null)
}

// ---- makeTextureMip：POT-gated generateMipmap + RG8 分支 + 消毒 ----
{
  console.log('— W1 makeTextureMip —')
  const mkGL = (webgl2) => {
    const st = { uploads: [], mips: 0 }
    const gl = {
      createTexture: () => ({}), bindTexture: () => {}, texParameteri: () => {},
      texImage2D: (t, lv, ifmt, w, h, b, fmt, type, data) => st.uploads.push({ ifmt, w, h, fmt, data }),
      generateMipmap: () => { st.mips++ },
      getError: () => 0,
    }
    gl.RGBA = 6408; gl.UNSIGNED_BYTE = 5121
    if (webgl2) { gl.RG8 = 0x822B; gl.RG = 0x8227 }
    gl.__st = st
    return gl
  }
  // NPOT 大纹理不调 generateMipmap（hina 背景 3840×2260 的 0x502 根因）
  const g1 = mkGL(true)
  lib.makeTextureMip(g1, [{ width: 3840, height: 2260, rgba: new Uint8Array(3840 * 2260 * 4) }], false)
  check('NPOT(3840×2260) 不调 generateMipmap', g1.__st.mips === 0, String(g1.__st.mips))
  const g2 = mkGL(true)
  lib.makeTextureMip(g2, [{ width: 1024, height: 1024, rgba: new Uint8Array(1024 * 1024 * 4) }], false)
  check('POT(1024×1024) 仍调 generateMipmap', g2.__st.mips === 1, String(g2.__st.mips))
  // RG88 → RG8 分支（WebGL2）
  const g3 = mkGL(true)
  lib.makeTextureMip(g3, [{ width: 64, height: 32, rgba: new Uint8Array(64 * 32 * 4) }], true)
  check('RG88 @WebGL2 → RG8/RG 上传', g3.__st.uploads[0].ifmt === 0x822B && g3.__st.uploads[0].fmt === 0x8227 && g3.__st.uploads[0].data.length === 64 * 32 * 2)
  // RG88 → WebGL1 无 RG8 → RGBA 回退
  const g4 = mkGL(false)
  lib.makeTextureMip(g4, [{ width: 64, height: 32, rgba: new Uint8Array(64 * 32 * 4) }], true)
  const u4 = g4.__st.uploads[0]
  check('RG88 @WebGL1 → RGBA 回退（长度合法）', u4.ifmt === 6408 && u4.data.length === 64 * 32 * 4)
  // 非法长度消毒
  const g5 = mkGL(true)
  const before = globalThis.__mpwTexSanitizeCount || 0
  lib.makeTextureMip(g5, [{ width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4 - 3) }], false)
  check('makeTextureMip 非法长度被消毒成 w*h*4', g5.__st.uploads[0].data.length === 16 * 16 * 4 && (globalThis.__mpwTexSanitizeCount || 0) === before + 1)
}

// ---- W1③ drawGuard：isTexture=false → 跳过 + 上报 ----
{
  console.log('— W1③ drawGuard（isTexture=false）—')
  const CONST = { LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81, ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B85,
    FRAMEBUFFER_COMPLETE: 0x8CD5, MAX_TEXTURE_SIZE: 0x0D33, NO_ERROR: 0, TEXTURE0: 0 }
  const logs = []
  let draws = 0
  const handlers = {
    createTexture: () => ({}), createFramebuffer: () => ({}), createBuffer: () => ({}), createVertexArray: () => ({}),
    createShader: () => ({}), createProgram: () => ({}),
    drawArrays: () => { draws++ },
    getProgramParameter: (p, k) => (k === CONST.LINK_STATUS || k === CONST.COMPILE_STATUS) ? true : (k === CONST.ACTIVE_UNIFORMS ? 1 : k === CONST.ACTIVE_ATTRIBUTES ? 2 : null),
    getActiveUniform: () => ({ name: 'g_Texture0', type: 0x8B62 }),
    getActiveAttrib: (p, i) => ({ name: i === 0 ? 'a_Position' : 'a_TexCoord', size: i === 0 ? 3 : 2 }),
    getAttribLocation: (p, n) => n === 'a_Position' ? 0 : n === 'a_TexCoord' ? 1 : -1,
    getUniformLocation: () => ({}), getShaderParameter: () => true, checkFramebufferStatus: () => CONST.FRAMEBUFFER_COMPLETE,
    getError: () => CONST.NO_ERROR, getParameter: (k) => k === CONST.MAX_TEXTURE_SIZE ? 4096 : 0,
    // 真机语义：纹理已失效（上下文丢失/被删）→ false
    isTexture: () => false,
  }
  const gl = new Proxy({}, { get(t, prop) {
    if (prop in handlers) return handlers[prop]
    if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return CONST[prop] !== undefined ? CONST[prop] : 1
    return () => {}
  } })
  const r = lib.createRenderer({ getContext: () => gl }, { onLog: (m) => logs.push(String(m)) })
  const scene = { general: { orthogonalprojection: { width: 1920, height: 1080 } }, camera: null, properties: {}, layers: [
    { id: 1, name: '失效纹理层', visible: true, solid: false, isContainer: false, textureName: 'tex_a', size: [400, 400],
      scale: [1, 1, 1], origin: [960, 540, 0], angles: [0, 0, 0], alignment: 'center', color: [1, 1, 1], alpha: 1, brightness: 1,
      effects: [], particle: null, particleDef: null, anim: undefined, animLayers: false, parallaxDepth: null }] }
  await r.render(scene, new Map([['tex_a', { glTex: { id: 'dead' }, width: 10, height: 10 }]]), 640, 360, 0.016)
  check('失效纹理层 0 次 draw（跳过而非污染 GL 状态）', draws === 0, String(draws))
  check('记一条可对号的上报', logs.some((m) => m.includes('跳过不可绘制(tex-invalid)') && m.includes('失效纹理层')), JSON.stringify(logs))
}

// ---- W4 spriteFrameRectUV ----
{
  console.log('— W4 spriteFrameRectUV —')
  const vstrip = { numFrames: 2, frameWidthUV: 1.0, frameHeightUV: 0.5 }   // dragAndDropToggle 型竖条
  const f0 = lib.spriteFrameRectUV(vstrip, 0), f1 = lib.spriteFrameRectUV(vstrip, 1), f2 = lib.spriteFrameRectUV(vstrip, 2), fm1 = lib.spriteFrameRectUV(vstrip, -1)
  check('竖条帧0 = 上半', f0 && f0.u0 === 0 && f0.v0 === 0 && f0.u1 === 1 && Math.abs(f0.v1 - 0.5) < 1e-9, JSON.stringify(f0))
  check('竖条帧1 = 下半', f1 && f1.v0 === 0.5 && Math.abs(f1.v1 - 1) < 1e-9, JSON.stringify(f1))
  check('帧号回绕（2→0）', f2 && f2.v0 === 0, JSON.stringify(f2))
  check('负帧回绕（-1→末帧）', fm1 && fm1.v0 === 0.5, JSON.stringify(fm1))
  const grid = { numFrames: 7, frameWidthUV: 1 / 3, frameHeightUV: 1 / 3 }
  const f3 = lib.spriteFrameRectUV(grid, 3)
  check('3列网格帧3 → 第2行第1列（row-major 换行）', f3 && Math.abs(f3.u0) < 1e-9 && Math.abs(f3.v0 - 1 / 3) < 1e-9, JSON.stringify(f3))
  check('无 sprite/非法入参 → null', lib.spriteFrameRectUV(null, 0) === null && lib.spriteFrameRectUV({ numFrames: 0 }, 0) === null)
}

// ---- W4 图片层精灵帧接线（forced/play → __spriteUV → quad UV）----
{
  console.log('— W4 renderLayer 精灵帧接线 —')
  const CONST = { LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81, ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B85,
    FRAMEBUFFER_COMPLETE: 0x8CD5, MAX_TEXTURE_SIZE: 0x0D33, NO_ERROR: 0, TEXTURE0: 0 }
  const logs = []
  const handlers = {
    createTexture: () => ({}), createFramebuffer: () => ({}), createBuffer: () => ({}), createVertexArray: () => ({}),
    createShader: () => ({}), createProgram: () => ({}),
    bindBuffer: (t, b) => {},
    bufferData: (t, data) => { if (data && data.length === 30) quadBufs.push(Array.from(data)) },
    drawArrays: () => {},
    getProgramParameter: (p, k) => (k === CONST.LINK_STATUS || k === CONST.COMPILE_STATUS) ? true : (k === CONST.ACTIVE_UNIFORMS ? 1 : k === CONST.ACTIVE_ATTRIBUTES ? 2 : null),
    getActiveUniform: () => ({ name: 'g_Texture0', type: 0x8B62 }),
    getActiveAttrib: (p, i) => ({ name: i === 0 ? 'a_Position' : 'a_TexCoord', size: i === 0 ? 3 : 2 }),
    getAttribLocation: (p, n) => n === 'a_Position' ? 0 : n === 'a_TexCoord' ? 1 : -1,
    getUniformLocation: () => ({}), getShaderParameter: () => true, checkFramebufferStatus: () => CONST.FRAMEBUFFER_COMPLETE,
    getError: () => CONST.NO_ERROR, getParameter: (k) => k === CONST.MAX_TEXTURE_SIZE ? 4096 : 0,
  }
  const gl = new Proxy({}, { get(t, prop) {
    if (prop in handlers) return handlers[prop]
    if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return CONST[prop] !== undefined ? CONST[prop] : 1
    return () => {}
  } })
  const r = lib.createRenderer({ getContext: () => gl }, { onLog: (m) => logs.push(String(m)) })
  // 本地 quad 顶点布局：pos3+uv2（5 float/顶点 × 6 顶点 = 30）；UV 取每顶点第 4/5 分量。
  // QFLIP 会整体翻转 v → 断言用 min/max 语义（整图 maxV=1；下半帧 maxV=0.5；上半帧 minV=0.5）。
  const uvRange = (verts) => {
    const us = [], vs = []
    for (let i = 0; i < verts.length; i += 5) { us.push(verts[i + 3]); vs.push(verts[i + 4]) }
    return { minU: Math.min(...us), maxU: Math.max(...us), minV: Math.min(...vs), maxV: Math.max(...vs) }
  }
  const mkScene = (layerExtra) => ({ general: { orthogonalprojection: { width: 1920, height: 1080 } }, camera: null, properties: {}, layers: [
    Object.assign({ id: 1, name: '精灵层', visible: true, solid: false, isContainer: false, textureName: 'tex_s', size: [256, 128],
      scale: [1, 1, 1], origin: [960, 540, 0], angles: [0, 0, 0], alignment: 'center', color: [1, 1, 1], alpha: 1, brightness: 1,
      effects: [], particle: null, particleDef: null, anim: undefined, animLayers: false, parallaxDepth: null }, layerExtra)] })
  const sprite = { numFrames: 2, frameWidthUV: 1.0, frameHeightUV: 0.5, frametime: 0.1 }
  const texEntry = { glTex: { id: 'sheet' }, width: 256, height: 128, sprite }
  const quadBufs = []
  await r.render(mkScene({}), new Map([['tex_s', texEntry]]), 640, 360, 0.016)
  check('无脚本驱动 → 上传了 1 个整图 quad', quadBufs.length === 1, String(quadBufs.length))
  const baseUVs = quadBufs.length ? uvRange(quadBufs[0]) : null
  check('无脚本驱动 → 整图 UV（maxV=1，旧行为）', baseUVs && baseUVs.maxV === 1 && baseUVs.maxU === 1 && baseUVs.minU === 0, JSON.stringify(baseUVs))
  // 钉帧1：脚本 setFrame(1) → 下半帧（原始 v∈[0.5,1]，QFLIP 后 maxV=0.5）
  quadBufs.length = 0
  await r.render(mkScene({ __texFrame: 1, __texFrameForced: true }), new Map([['tex_s', texEntry]]), 640, 360, 0.016)
  check('setFrame(1) → 上传了精灵帧 quad', quadBufs.length === 1, String(quadBufs.length))
  const forcedUVs = quadBufs.length ? uvRange(quadBufs[0]) : null
  check('setFrame(1) → 下半帧 UV（maxV=0.5）', forcedUVs && Math.abs(forcedUVs.maxV - 0.5) < 1e-6 && forcedUVs.maxU === 1, JSON.stringify(forcedUVs))
  // play → 按时间推进（frametime=0.1，t=0.25 → 帧2→回绕帧0 → 原始 v∈[0,0.5]，QFLIP 后 minV=0.5）
  quadBufs.length = 0
  await r.render(mkScene({ __texFramePlay: true }), new Map([['tex_s', texEntry]]), 640, 360, 0.25)
  const playUVs = quadBufs.length ? uvRange(quadBufs[0]) : null
  check('play @t=0.25 → 帧2回绕=帧0（QFLIP 后 minV=0.5）', playUVs && Math.abs(playUVs.minV - 0.5) < 1e-6 && Math.abs(playUVs.maxV - 1) < 1e-6, JSON.stringify(playUVs))
}

// ---- W3 文本 pointsize 属性绑定解包 ----
{
  console.log('— W3 文本 pointsize 绑定 —')
  const scene = { general: { orthogonalprojection: { width: 3840, height: 2160 } }, objects: [
    { id: 1, name: '文本1', text: '测试', pointsize: { user: 'newproperty53', value: 45.896 }, size: '3521 292' },
    { id: 2, name: '数字', text: 'x', pointsize: 24 },
    { id: 3, name: '缺省', text: 'y' },
    { id: 4, name: '绑定坏值', text: 'z', pointsize: { user: 'p', value: -3 } },
  ] }
  const s = lib.parseScene(scene)
  const t = (n) => s.layers.find((l) => l.name === n).__text
  check('属性绑定对象取 value（白子 45.896）', t('文本1').pointsize === 45.896, String(t('文本1').pointsize))
  check('number 原样保留', t('数字').pointsize === 24)
  check('缺省仍回落 32', t('缺省').pointsize === 32)
  check('绑定非法值回落 32', t('绑定坏值').pointsize === 32)
}

// ---- W3 长条眼窗场景白名单 ----
{
  console.log('— W3 长条眼窗白名单 —')
  const mkScene = () => ({ general: { orthogonalprojection: { width: 3840, height: 2160 } }, layers: [
    { id: 1, name: '眼睛组合', visible: true, size: [584, 759], scale: [1, 1, 1] },
    { id: 2, name: '左眼皮', visible: true, size: [189, 131], scale: [1, 1, 1] },
    { id: 3, name: '主体', visible: true, size: [100, 100], scale: [1, 1, 1] },
  ] })
  const eyeOf = (s) => s.layers.find((l) => l.name === '眼睛组合')
  const lidOf = (s) => s.layers.find((l) => l.name === '左眼皮')
  const a = lib.applyRenderConfig(mkScene(), { sceneId: '3719111841' })
  check('凯尔希（白名单）→ 眼睛组合仍打 uvRect/405×120', !!eyeOf(a).uvRect && eyeOf(a).size[0] === 405 && !!lidOf(a).uvRect)
  const b = lib.applyRenderConfig(mkScene(), { sceneId: '3554161528' })
  check('其它场景 → 不再打长条眼窗（W3 主修复）', !eyeOf(b).uvRect && !lidOf(b).uvRect && eyeOf(b).size[0] === 584)
  const c = lib.applyRenderConfig(mkScene(), { sceneId: '3554161528', eyeHack: true })
  check('?eyehack=1 → 任意场景强制开（回退口）', !!eyeOf(c).uvRect)
  const d = lib.applyRenderConfig(mkScene(), { sceneId: '3719111841', eyeHack: false })
  check('?eyehack=0 → 凯尔希也可关（对照）', !eyeOf(d).uvRect)
}

console.log('\n===== tex-upload-guard 验证: ' + pass + ' 通过 / ' + fail + ' 失败 =====')
process.exit(fail ? 1 : 0)
