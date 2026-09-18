/* 参照来源许可声明：本文件提到的 wer-ref/ 是第三方参考实现（Aromatic05/wallpaper-engine-renderer，GPL-2.0-only，非 WE 官方代码、非「真值源」），与本项目（GPL-3.0-or-later）许可不兼容 —— 仅用于行为对照，不得复制/改写/逐行翻译其代码、注释、常量组织或错误文案。we-layerd-ref/（Aromatic05/we-layerd）无任何许可（保留所有权利），同样仅行为对照。血缘自查结论见 docs/WER-REF-LICENSE-AUDIT.md。 */ // core/attach-transform.mjs — elysia 附件/父链变换的逐字移植（2026-09-13，POSITION-FINDINGS §4 修法落地）
//
// 证据源（移植前已实测证明与官方逐层吻合：elysia-transform-check 3719111841 → 19/22 层 Δ<5px）：
//   - elysia/we-renderer/core.js   _mdlAnchors(L280) / _puppetBoneFinal(L314) / _attachmentOffset(L364) / resolveTransform(L421)
//   - elysia/we-renderer/puppet.js _parseMdl(L278) / _sampleAnimRT(L205) / _matMulRow(L255)
// 语义要点（与 POSITION-FINDINGS.md §4 公式一致，勿"优化"）：
//   1) 父链：root→叶，origin += R(ang.z)·(锚点偏移 × 累积scale) + R(ang.z)·(child.origin × 累积scale)；
//      scale *= child.scale；ang += child.angles（scene.json 的 angles 是**弧度**——语料实测 3.14159/1.57080，
//      wer-ref SceneNode.cpp Eigen AngleAxis 直收弧度，elysia 原样直收）。
//   2) 锚点：父模型 json.puppet → MDL 的 MDAT0001 表（u16 骨索引 + 名字\0 + 4×4 矩阵）；
//      偏移 = [bx + A.tx·cos(ba) − A.ty·sin(ba), by + A.tx·sin(ba) + A.ty·cos(ba)]，
//      (bx,by,ba) = 锚点骨骼**动画后最终世界位姿**（bind 世界位姿 ⊕ animationlayers 增量；
//      fps=每动画自带 framerate，①G-1 定案，opts.fps 可覆盖）。
//      MDAT 矩阵只取平移列（elysia 同：锚点旋转项实测可忽略）。
//   3) 单位/坐标：全部在**编辑器 y-up 空间**计算；y-down 翻转由渲染端统一做一次
//      （我们 = parseScene 末尾 PROJ_H−y；elysia = 绘制时 H−y）。本模块不做任何 y 取反。
//
// 本模块零外部依赖（纯 Uint8Array/DataView），浏览器与 Node 共用；①(P-110) 只依赖仓库内
//   `core/puppet-skin.js::bindWorldChain`（bind 世界链的唯一实现处，无第三方依赖）：
//   - core/we-scene-bundle.js parseScene（opts.attachCtx 注入时自动计算全部附件偏移）
//   - demo.html（默认路径；?att=legacy 回退旧 anchorsOf/mkOff）
//   - layer-rect-check.mjs / attach-transform-test.mjs（验收）
import { bindWorldChain, bindWorldPolar } from './puppet-skin.js'

// ── 值解包：静态字符串 / {value} / {animation}（t=0 取首帧，与 elysia 烘焙语义一致）──
function unwrapVal(v, def) {
  if (v == null) return def
  if (typeof v === 'object') {
    if (v.value !== undefined) return v.value
    if (v.animation && Array.isArray(v.animation.c0) && v.animation.c0[0] && v.animation.c0[0].value !== undefined) return v.animation.c0[0].value
    return def
  }
  return v
}

function parseVec3v(o, key, def) {
  const s = unwrapVal(o && o[key], null)
  if (s == null) return def.slice()
  if (typeof s === 'number') return [s, s, s]
  if (Array.isArray(s)) return [s[0] ?? def[0], s[1] ?? def[1], s[2] ?? def[2]]
  const p = String(s).trim().split(/\s+/).map(Number)
  return [Number.isFinite(p[0]) ? p[0] : def[0], Number.isFinite(p[1]) ? p[1] : def[1], Number.isFinite(p[2]) ? p[2] : def[2]]
}

function matchBytes(buf, off, str) {
  for (let i = 0; i < str.length; i++) if (buf[off + i] !== str.charCodeAt(i)) return false
  return true
}

function indexOfBytes(buf, str, from) {
  for (let i = from | 0; i + str.length <= buf.length; i++) if (matchBytes(buf, i, str)) return i
  return -1
}

// ── MDAT0001 锚点表（elysia _mdlAnchors 移植；Buffer 换 Uint8Array 扫描）──
// 结构：wallpaper64.exe 解析确认 —— u16 计数 + [u16 骨骼索引 + 名字\0 + 64B 列主序矩阵]×count
export function parseMdatAnchors(buf) {
  const out = []
  if (!buf) return out
  try {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    for (let idx = indexOfBytes(buf, 'MDAT', 0); idx >= 0; idx = indexOfBytes(buf, 'MDAT', idx + 4)) {
      if (!matchBytes(buf, idx, 'MDAT0001')) continue
      let p = idx + 9 + 4
      if (p + 2 > buf.length) break
      const count = dv.getUint16(p, true); p += 2
      for (let e = 0; e < count && e < 64 && p + 2 < buf.length; e++) {
        const boneIdx = dv.getUint16(p, true); p += 2
        let ne = p
        while (ne < buf.length && buf[ne] !== 0) ne++
        if (ne === buf.length || ne - p > 128) break
        const name = new TextDecoder().decode(buf.subarray(p, ne))
        p = ne + 1
        if (p + 64 > buf.length) break
        const m = []
        for (let i = 0; i < 16; i++) m.push(dv.getFloat32(p + i * 4, true))
        p += 64
        out.push({ name, boneIdx, m, tx: m[12], ty: m[13] })
      }
    }
  } catch { /* 解析失败 → 无锚点 */ }
  return out
}


// ── 行主序 4×4（elysia _matMulRow / _matInvertRow 逐字）──
export function matMulRow(a, b) {
  const o = new Array(16)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      o[r * 4 + c] = a[r * 4 + 0] * b[0 * 4 + c] + a[r * 4 + 1] * b[1 * 4 + c] + a[r * 4 + 2] * b[2 * 4 + c] + a[r * 4 + 3] * b[3 * 4 + c]
    }
  }
  return o
}

// ── MDL 解析（elysia _parseMdl 逐字移植；顶点块校验规则原样保留）──
// 返回 { positions, uvs, indices, vertexCount, indexCount, blendIndices, blendWeights, bones, animations, raw }
export function parseMdl(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let mdlsOffset = buf.length
  for (let off = 9; off + 4 < buf.length; off++) {
    if (buf[off] === 0x4d && buf[off + 1] === 0x44 && buf[off + 2] === 0x4c && buf[off + 3] === 0x53) { mdlsOffset = off; break }
  }
  let found = null
  for (let offset = 9; offset + 12 < mdlsOffset; offset++) {
    const vertexBytes = dv.getUint32(offset + 4, true)
    const verticesOffset = offset + 8
    if (vertexBytes === 0 || vertexBytes % 80 !== 0) continue
    const indexLenOffset = verticesOffset + vertexBytes
    if (indexLenOffset + 4 > mdlsOffset) continue
    const indexBytes = dv.getUint32(indexLenOffset, true)
    const indicesOffset = indexLenOffset + 4
    if (indexBytes === 0 || indexBytes % 2 !== 0 || indicesOffset + indexBytes > mdlsOffset) continue
    // 顶点合理性：前若干顶点 pos 必须有限且量级合理（部分 MDL 有垃圾候选块）
    const vc = vertexBytes / 80
    let sane = true
    for (let i = 0; i < Math.min(vc, 64); i++) {
      const vo = verticesOffset + i * 80
      for (let k = 0; k < 3; k++) {
        const v = dv.getFloat32(vo + k * 4, true)
        if (!isFinite(v) || Math.abs(v) > 1e6) { sane = false; break }
      }
      if (!sane) break
    }
    if (!sane) continue
    // 索引范围：前若干索引必须 < 顶点数
    const ic = indexBytes / 2
    if (ic > 0) {
      let idxOk = 0
      for (let k = 0; k < Math.min(ic, 400); k++) {
        if (dv.getUint16(indicesOffset + k * 2, true) < vc) idxOk++
      }
      if (idxOk < Math.min(ic, 400) * 0.98) continue
    }
    found = { verticesOffset, vertexBytes, indicesOffset, indexBytes }
    break
  }
  if (!found) return null
  const vertexCount = found.vertexBytes / 80
  const indexCount = found.indexBytes / 2
  const positions = [], uvs = [], blendIndices = [], blendWeights = []
  for (let i = 0; i < vertexCount; i++) {
    const vo = found.verticesOffset + i * 80
    positions.push([dv.getFloat32(vo, true), dv.getFloat32(vo + 4, true), dv.getFloat32(vo + 8, true)])
    uvs.push([dv.getFloat32(vo + 72, true), dv.getFloat32(vo + 76, true)])
    blendIndices.push([dv.getUint32(vo + 40, true), dv.getUint32(vo + 44, true), dv.getUint32(vo + 48, true), dv.getUint32(vo + 52, true)])
    blendWeights.push([dv.getFloat32(vo + 56, true), dv.getFloat32(vo + 60, true), dv.getFloat32(vo + 64, true), dv.getFloat32(vo + 68, true)])
  }
  const indices = []
  for (let i = 0; i < indexCount; i++) indices.push(dv.getUint16(found.indicesOffset + i * 2, true))
  // 骨骼（MDLS）+ 动画（MDLA）
  let bones = [], animations = []
  if (mdlsOffset < buf.length) {
    try {
      let p = mdlsOffset + 9
      p += 4 // 段字节
      const boneCount = dv.getUint32(p, true); p += 4
      for (let b = 0; b < boneCount && p + 12 < buf.length; b++) {
        // 骨骼头变体：tmp u8（9 字节头）为主；个别为 u16（10 字节头），按 len 合理性判定
        let headExtra = 0
        let tmp = buf[p]
        let type = dv.getUint32(p + 1, true)
        let parent = dv.getInt32(p + 5, true)
        let len = dv.getUint32(p + 9, true)
        if (len === 0 || len > 4096) {
          tmp = dv.getUint16(p, true)
          type = dv.getUint32(p + 2, true)
          parent = dv.getInt32(p + 6, true)
          len = dv.getUint32(p + 10, true)
          headExtra = 1
          if (len === 0 || len > 4096) break
        }
        p += 9 + headExtra // tmp + type + parent 之后（len 字段起点）
        p += 4 // len 字段本身
        const m = new Array(16)
        for (let i = 0; i < 16; i++) m[i] = dv.getFloat32(p + i * 4, true)
        p += len
        let je = p
        while (je < buf.length && buf[je] !== 0) je++
        p = je + 1
        bones.push({ index: b, type, parent: parent === -1 ? -1 : parent, bind: m })
      }
    } catch { bones = [] }
    // MDLA 动画（RE-03 官方头布局：id i32 + 丢弃 i32 + name\0 + mode\0 + fps f32 + length i32 + pad + boneTrackCount + segBytes）
    const mdla = indexOfBytes(buf, 'MDLA', 0)
    if (mdla >= 0) {
      try {
        let p = mdla + 9
        p += 4 // 总字节
        const animCount = dv.getUint32(p, true); p += 4
        for (let a = 0; a < animCount && p + 12 < buf.length; a++) {
          const animId = dv.getInt32(p, true)
          p += 8 // id + 丢弃字段
          let nameEnd = p
          while (nameEnd < buf.length && buf[nameEnd] !== 0) nameEnd++
          if (nameEnd >= buf.length) break
          const animName = new TextDecoder().decode(buf.subarray(p, nameEnd))
          p = nameEnd + 1
          let loopEnd = p
          while (loopEnd < buf.length && buf[loopEnd] !== 0) loopEnd++
          if (loopEnd >= buf.length) break
          p = loopEnd + 1
          // fps：头布局 = mode\0 之后紧跟 f32 framerate（第三方参考 wer-ref WPMdlParser.cpp:698 animation.fps = f.ReadFloat()）。
          // ①(G-fps 2026-09-14) 直读该字段（fps 定案=每动画自带，见 blink-phase-test.mjs）。
          //   旧实现靠搜索 [f0 41]=30.0f 的字节序特征跳位——fps≠30 的动画会搜过头把头解析炸掉（潜伏 bug）。
          //   读出的值不合理时回退旧搜索（对现存语料 48/48 动画两条路径逐位一致，blink-phase-test 有断言）。
          let fpsHdr = dv.getFloat32(p, true)
          if (!(isFinite(fpsHdr) && fpsHdr >= 1 && fpsHdr <= 240)) {
            while (p + 1 < buf.length && !(buf[p] === 0xf0 && buf[p + 1] === 0x41)) p++
            p += 2
            fpsHdr = dv.getFloat32(p - 4, true)
          } else {
            p += 4
          }
          const frameCount = dv.getUint16(p, true); p += 2
          p += 2 // u16 0
          p += 4 // u32 0
          const boneCount = dv.getUint32(p, true); p += 4
          p += 4 // u32 0
          const segBytes = dv.getUint32(p, true); p += 4
          const segs = []
          for (let b = 0; b < boneCount && p + (b + 1) * segBytes <= buf.length; b++) segs.push(p + b * segBytes)
          // fps 定案（G-1）：头里 f32 framerate（fpsHdr 已在 mode\0 后直读；回退路径也定位到同字段）
          animations.push({ id: animId, name: animName, frameCount, boneCount, segBytes, segs, fps: (isFinite(fpsHdr) && fpsHdr >= 1 && fpsHdr <= 240) ? fpsHdr : 30 })
          p += segBytes * boneCount
        }
      } catch { animations = [] }
    }
  }
  return { positions, uvs, indices, vertexCount, indexCount, blendIndices, blendWeights, bones, animations, raw: buf }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// ①(P-139 2026-09-19) **MDLA 逐骨局部量采样 = 全仓库唯一实现处（本函数）**
//
// 为什么要有"唯一实现处"（与 `core/puppet-skin.js::bindWorldChain` 同一条纪律）：同一套
//   "MDLA 轨寻址 + 轨道作用域 + 越界回绕" 的判定原先在**两个地方各写了一遍**：
//     ① 本文件 `sampleAnimRT`（只服务**附件锚点** → `puppetBoneFinal` → `attachmentOffset`）；
//     ② `elysia/we-renderer/puppet.js::_sampleAnimRT`（服务**渲染网格的 GPU 蒙皮**，
//        demo.html 的 `updateSkinBones` 每帧调它）。
//   ① 在 ①G（2026-09-14）被修成"官方逐行同址、不回绕"；② **没跟上**，仍是旧式
//   `((frame + posShift) % totalFrames)`（把"每骨行移位"折进帧号取模）。后果实测（本文件
//   的判据，见 tests/kaltsit-puppet-anchor-test.mjs A-3）：同一骨同一动画，① 的单帧最大步长
//   1.6u，② 在 6 骨模型上是 **699.4u @f0 bone5（头骨）**、14 骨模型上 **365.7u @f0 bone13**、
//   4 骨模型上 **157.4u @f298 bone3** —— 也就是 ② 把"轨 0 的**第 0 帧**"当成移位后的帧号读，
//   首帧就吃到邻轨/轨头垃圾。渲染网格走 ② ⇒ 头/眼/耳朵每次循环起点抽一下。
//   ⇒ ② 现在改为**直接调本函数**（`installPuppet` 的 `_sampleAnimRT` 只是转发），即"同一口径的
//     唯一实现"：改这里两边同时生效，不存在"改一处忘另一处"的第二次分叉。
//
// 语义（行主序/行向量，与 `sampleAnimRT` 的世界链、`bindWorldChain` 的 bind 世界链同空间）：
//   · **寻址（官方逐行同址）**：`anim.segs[b]` 是官方轨头前 `8b` 处，交错公式
//     `36·floor(2b/9) + 4·((2b)%9) === 8b` 恰好补上 b 个 8 字节轨头 ⇒
//     pos 读址 = `segs[b] + f·36 + 8b`（+0 = pos.x, +4 = pos.y），rot 读址 = 同址 +20。
//     第三方参考 wer-ref `WPPuppet.cpp:218-222` 直接采 `row ∈ [0, length)`，无行移位。
//   · **不回绕**：帧号先规约到 `[0, frameCount)`（负帧也安全），**绝不**把移位折进取模。
//     旧式回绕正是 RE-03 记录的"眼睛 [237,238,239]、主体 [178,179]、耳朵 [0,298,299] 坏帧"
//     的真身：数据没坏，寻址回绕读到了轨头/邻轨垃圾。
//   · **轨道作用域（官方 per-bone `HasAuthoredTrack`）**：某骨轨**所有帧**的
//     pos/angle 都 ≈0（<1e-6）⇒ 官方判定"该层对该骨不贡献"，该骨取 `local_bind`
//     （`bones[b].bind` 的局部位姿）；旧实现只在"数值非有限/超量级"时才回退 bind ⇒
//     "只驱动部分骨骼"的导出模型会把未 authored 的骨塌到父骨原点（结构性错位）。
//     逐位实现见 `isAuthoredTrack`（判定按**轨字节**算一次并缓存）。
//   · 数值非法（非有限/量级 >1e4）时同样回退 `bind`（不炸渲染的既有保险，保留）。
//
// 缓存：`_authoredCache` 按 `mesh` 身份（WeakMap）→ Map(anim) → Uint8Array(nb)。
//   demo.html 的 `puppetHelper._parseMdl` 每个 MDL 只解析一次并复用同一对象
//   （`l.__skin.mesh`），所以缓存命中；`sampleAnimRT` 是每帧每层调用的热路径，
//   "逐帧扫 240 帧 × 每骨"不能放在这里做。
const _authoredCache = new WeakMap()
// 导出仅为门禁断言「作用域判定本身」（RED-IF-REVERTED 把 authored 判定短路掉必须红）
export function isAuthoredTrack(mesh, anim, bones) {
  const nb = (bones && bones.length) || 0
  let perAnim = _authoredCache.get(mesh)
  if (!perAnim) { perAnim = new Map(); _authoredCache.set(mesh, perAnim) }
  let flags = perAnim.get(anim)
  if (flags && flags.length >= nb) return flags
  flags = new Uint8Array(nb)
  try {
    const raw = mesh.raw
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    const len = Math.max(1, anim.frameCount)
    for (let b = 0; b < nb; b++) {
      const segStart = anim.segs[b]
      if (!(segStart >= 0)) continue
      for (let f = 0; f < len; f++) {
        const o = segStart + f * 36 + 8 * b
        if (o + 24 > raw.length) break
        const px = dv.getFloat32(o, true), py = dv.getFloat32(o + 4, true), rot = dv.getFloat32(o + 20, true)
        if (Math.abs(px) > 1e-6 || Math.abs(py) > 1e-6 || Math.abs(rot) > 1e-6) { flags[b] = 1; break }
      }
    }
  } catch { /* 结构异常 ⇒ 全部当 authored（= 旧行为，最保守） */ flags.fill(1) }
  perAnim.set(anim, flags)
  return flags
}

/**
 * MDLA 采样：返回**每骨骼局部位姿** `{ angle, tx, ty }`（尚未做世界链合成）。
 * @param {object} mesh  `_parseMdl`/`parseMdl` 结果（需要 `raw` 与原 buffer 视图）
 * @param {object} anim  `mesh.animations[i]`（需要 `segs` / `frameCount`）
 * @param {number} frame 帧号（任意整数；内部规约到 `[0, frameCount)`，不回绕到轨外）
 * @param {number} nb    骨骼数
 * @param {Array}  bones `[{ parent, bind:[16] }]`
 * @returns {Array<{angle:number,tx:number,ty:number}>} 长度 nb，**局部位姿**（未合成世界链）
 */
export function sampleBoneLocalsRT(mesh, anim, frame, nb, bones) {
  const out = new Array(nb)
  if (!mesh || !mesh.raw || !anim || !anim.segs || !bones || !nb) return out
  const raw = mesh.raw
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const totalFrames = Math.max(1, anim.frameCount)
  let f = Math.floor(Number(frame) || 0) % totalFrames
  if (f < 0) f += totalFrames
  const authored = isAuthoredTrack(mesh, anim, bones)
  for (let b = 0; b < nb; b++) {
    const bm = bones[b] && bones[b].bind
    const segStart = anim.segs[b]
    let px = NaN, py = NaN, rotZ = NaN
    if (segStart >= 0) {
      const o = segStart + f * 36 + 8 * b
      if (o + 24 <= raw.length) {
        px = dv.getFloat32(o, true)
        py = dv.getFloat32(o + 4, true)
        rotZ = dv.getFloat32(o + 20, true)
      }
    }
    const usable = authored[b] && isFinite(px) && isFinite(py) && isFinite(rotZ) &&
      Math.abs(px) < 10000 && Math.abs(py) < 10000
    if (usable) out[b] = { angle: rotZ, tx: px, ty: py }
    else if (bm) out[b] = { angle: Math.atan2(bm[1], bm[0]), tx: bm[12], ty: bm[13] }
    else out[b] = { angle: 0, tx: 0, ty: 0 }
  }
  return out
}

/** 局部位姿 → 世界位姿（行主序：`W[b] = L_b × W[parent]`，与 `bindWorldChain` 同空间同序）。 */
export function localWorldChainRT(locals, bones, nb) {
  const out = new Array(nb)
  for (let b = 0; b < nb; b++) {
    const L = locals[b] || { angle: 0, tx: 0, ty: 0 }
    const parent = bones[b] ? bones[b].parent : -1
    if (parent >= 0 && parent < nb && out[parent]) {
      const pa = out[parent].angle, pc = Math.cos(pa), ps = Math.sin(pa)
      out[b] = { angle: pa + L.angle, tx: out[parent].tx + L.tx * pc - L.ty * ps, ty: out[parent].ty + L.tx * ps + L.ty * pc }
    } else {
      out[b] = { angle: L.angle, tx: L.tx, ty: L.ty }
    }
  }
  return out
}

// ── 采样动画帧 → 每骨骼世界姿势 {angle, tx, ty}（elysia _sampleAnimRT 移植 + ①G 修正）──
// ①(P-139) 本体只剩"唯一实现处调用 + 世界链合成"两行：寻址/作用域/回绕口径全在
//   `sampleBoneLocalsRT`（渲染网格的 `puppet.js::_sampleAnimRT` 转发同一个函数）。
export function sampleAnimRT(mesh, anim, frame, nb, bones) {
  return localWorldChainRT(sampleBoneLocalsRT(mesh, anim, frame, nb, bones), bones, nb)
}

// ── puppet 骨骼最终世界位姿（elysia _puppetBoneFinal 移植；①G fps 定案见下）──
// bind 世界位姿 ⊕ animationlayers 增量（additive 参考 = 层动画帧0；普通层 mix）
// ①(G-1 2026-09-14) fps 口径定案 = **每动画自带**（第三方参考 wer-ref WPMdlParser.cpp:698
//   animation.fps = f.ReadFloat() → WPPuppet.cpp:92-93 frame_time=1/fps、max_time=length/fps，
//   :216-222 采样 cur=fmod(cur,max_time); rate=cur/frame_time → 帧=floor(t·fps·rate) mod length；
//   lwe-ref 不解析 MDLA 动画（渲染 bind 姿态），无第二口径来源）。
//   语料实测 48/48 动画 fps=30.0（107 容器 + mpkg_work/tmp 提取物全量）→ 两种口径在现存数据上
//   逐位一致；此改动只在遇到 fps≠30 的未来资产时生效。opts.fps 强制口径（=30 复现旧行为）。
export function puppetBoneFinal(mesh, t, layers = null, opts = null) {
  const bones = mesh.bones
  if (!bones || !bones.length) return null
  const nb = bones.length
  // ①(P-110 2026-09-17) bind 世界链改走唯一实现处 `core/puppet-skin.js::bindWorldChain`
  //   （**子先乘** `W[b] = L_b × W[parent]`，与 `sampleAnimRT` 同空间；见该函数头注释的判据）。
  //   旧写法 `matMulRow(bindWorld[parent], local)`（父先乘）只由 `opts.bindOrder === 'legacy'`
  //   （URL 侧 `?bindorder=legacy`）启用，作 A/B 回退与 bug 复现。
  const legacyBind = !!(opts && (opts.bindOrder === 'legacy' || opts.bindOrderLegacy === true))
  const bindWorld = bindWorldChain(bones, { legacy: legacyBind })
  const bindRT = bindWorldPolar(bindWorld)
  const final = bindRT.map((r) => ({ angle: r.angle, tx: r.tx, ty: r.ty }))
  if (!mesh.animations || !mesh.animations.length) return final
  if (!layers || !layers.length) layers = [{ animIdx: 0, blend: 1, rate: 1, additive: false }]
  const fpsOverride = opts && typeof opts.fps === 'number' && opts.fps > 0 ? opts.fps : null
  const refCache = new Map()
  const animRef = (anim) => {
    if (!refCache.has(anim)) refCache.set(anim, sampleAnimRT(mesh, anim, 0, nb, bones))
    return refCache.get(anim)
  }
  for (const layer of layers) {
    const anim = mesh.animations[layer.animIdx] || mesh.animations[0]
    if (!anim) continue
    const fps = fpsOverride || anim.fps || 30
    // ①(P-139) 帧号同样先规约到 [0, frameCount)（`%` 对负数会给负帧，旧式会把负帧当"回绕"读轨外）
    const fr = Math.floor(t * fps * layer.rate) % Math.max(1, anim.frameCount)
    const frame = fr < 0 ? fr + Math.max(1, anim.frameCount) : fr
    const lw = sampleAnimRT(mesh, anim, frame, nb, bones)
    const refRT = animRef(anim)
    for (let b = 0; b < nb; b++) {
      if (layer.additive) {
        const ref = refRT[b]
        let da = lw[b].angle - ref.angle
        while (da > Math.PI) da -= 2 * Math.PI
        while (da < -Math.PI) da += 2 * Math.PI
        final[b].angle += da * layer.blend
        final[b].tx += (lw[b].tx - ref.tx) * layer.blend
        final[b].ty += (lw[b].ty - ref.ty) * layer.blend
      } else {
        let da = lw[b].angle - final[b].angle
        while (da > Math.PI) da -= 2 * Math.PI
        while (da < -Math.PI) da += 2 * Math.PI
        final[b].angle += da * layer.blend
        final[b].tx += (lw[b].tx - final[b].tx) * layer.blend
        final[b].ty += (lw[b].ty - final[b].ty) * layer.blend
      }
    }
  }
  return final
}

// ── animationlayers 选择（elysia _attachmentOffset 内联逻辑逐字）──
// 仅"多动画 + 有 animationlayers"时做层合成；单动画 → layers=null → 默认动画0。
export function selectAnimLayers(parent, mesh) {
  if (!(mesh.animations && mesh.animations.length > 1) || !(parent.animationlayers && parent.animationlayers.length)) return null
  const ls = parent.animationlayers
    .filter((l) => (l.visible === true || (l.visible && typeof l.visible === 'object' && l.visible.value === true)))
    .map((l) => {
      const blend = typeof l.blend === 'number' && l.blend >= 0 && l.blend <= 1 ? l.blend : 1
      const rate = typeof l.rate === 'number' && l.rate > 0 ? l.rate : 1
      let idx = mesh.animations.findIndex((a) => a.name && l.name && a.name === l.name)
      if (idx < 0 && l.name) {
        const m = String(l.name).match(/(\d+)/)
        if (m) {
          const n = parseInt(m[1], 10)
          if (n >= 1 && n <= mesh.animations.length) idx = n - 1
        }
      }
      if (idx < 0) {
        const layerIdx = parent.animationlayers.indexOf(l)
        if (layerIdx >= 0 && layerIdx < mesh.animations.length) idx = layerIdx
      }
      if (idx < 0) idx = 0
      return { animIdx: idx, blend, rate, additive: !!l.additive }
    })
  return ls.length ? ls : null
}

// ── ①(P-139) 逐帧锚点**增量表**（demo 渲染前把层 origin 从 t=0 姿态搬到当前帧）──
// 为什么需要它（而不是让宿主编排 `buildAttachOffsets` 两次）：`parseScene` 只把**一个时刻**的锚点
//   烘进层 origin，之后宿主若自己再调 `buildAttachOffsets` 并"整体替换"就会**双重应用**锚点
//   —— 必须用**增量**：`origin -= delta(t0)`，其中 `t0` = parseScene 实际用的那个时刻、
//   delta(t) = `off_{ctx.time}(t) − off_{ctx.time}(0)`（把"每个层自己的锚点"平移**相对**起来，
//   与 ctx.time=0 时的绝对锚点无关）。本函数返回 `Map(id → Δ)`，`t0` 必须由**同一个 ctx**算出。
// ctx 与 `attachmentOffset` 同形状（readModelJson/readMdl/time/fps/bindOrder/_anchorCache/_mdlCache）。
export function attachOffsetDeltas(sceneObjects, readEntry, ctx) {
  const out = new Map()
  // 第二个参数 = `readEntry(path) -> Uint8Array`（与 `buildAttachOffsets` 同签名）。
  // ctx.time 允许是数字或取值器（与 parseScene 的 attachCtx 同约定）；**取值器的返回值**才是时刻。
  //   刻意不把取值器直接透传给 buildAttachOffsets（它会读到 undefined → `t*fps=NaN` → 静默不生效）。
  let t = ctx && ctx.time
  if (typeof t === 'function') { try { t = t() } catch { t = 0 } }
  t = Number(t)
  if (!isFinite(t)) t = 0
  const popts = (ctx && (ctx.fps || ctx.bindOrder)) ? { fps: ctx.fps, bindOrder: ctx.bindOrder } : null
  // ⚠ 唯一实现处仍走 `buildAttachOffsets`（**不要**在这里另写一份"逐层各建 ctx"的循环：
  //   那样每层都要重解 model.json，且与 parseScene 的共享 `_mdlCache` 口径分叉——实测差 1.9e3）。
  //   性能由**宿主**负责（demo.html 按"动画帧号"记忆化：1/30s 才重算一次）。
  if (typeof readEntry !== 'function') return out
  let a0 = null, at = null
  try {
    a0 = buildAttachOffsets(sceneObjects, readEntry, null, 0, popts)     // 基线恒为 t=0（parse 的冻结时钟）
    at = buildAttachOffsets(sceneObjects, readEntry, null, t, popts)
  } catch { return out }
  at.forEach((v, id) => {
    const b = a0.get(id)
    if (!b) return
    // 同时给出**基线锚点**：宿主逐帧跟随必须做增量（`origin += W(Δ) − W(Δ₀)`），
    //   只知道 Δ 而不知道 Δ₀ 会把"绝对值"当增量加进去（本改动第一版就是这个 bug）。
    out.set(id, { delta: [v[0] - b[0], v[1] - b[1]], base: [b[0], b[1]] })
  })
  return out
}

// ── 附件锚点偏移（elysia _attachmentOffset 逐字；y-up 空间，无 y 取反）──
// ctx: { readModelJson(path)->obj|null, readMdl(path)->Uint8Array|null, time, _anchorCache, _mdlCache }
export function attachmentOffset(child, parent, ctx) {
  if (!child || !parent || child.attachment == null) return [0, 0]
  const parentModel = parent.image ? ctx.readModelJson(parent.image) : null
  if (!parentModel || !parentModel.puppet) return [0, 0]
  let anchors = ctx._anchorCache && ctx._anchorCache.get(parentModel.puppet)
  if (!anchors) {
    const raw = ctx.readMdl(parentModel.puppet)
    anchors = raw ? parseMdatAnchors(raw) : []
    if (!ctx._anchorCache) ctx._anchorCache = new Map()
    ctx._anchorCache.set(parentModel.puppet, anchors)
  }
  const anch = anchors.find((a) => a.name === child.attachment)
  if (!anch) return [0, 0]
  let bx = 0, by = 0, ba = 0
  let mesh = ctx._mdlCache && ctx._mdlCache.get(parentModel.puppet)
  if (!mesh) {
    const raw = ctx.readMdl(parentModel.puppet)
    mesh = raw ? parseMdl(raw) : null
    if (mesh) {
      if (!ctx._mdlCache) ctx._mdlCache = new Map()
      ctx._mdlCache.set(parentModel.puppet, mesh)
    }
  }
  if (mesh && mesh.bones && anch.boneIdx < mesh.bones.length) {
    const layers = selectAnimLayers(parent, mesh)
    // ①(P-110 2026-09-17) bind 链序随 ctx 下传（`?bindorder=legacy` 的 A/B 回退；缺省 = 子先乘修正序）
    const popts = {}
    if (ctx.fps) popts.fps = ctx.fps
    if (ctx.bindOrder) popts.bindOrder = ctx.bindOrder
    const final = puppetBoneFinal(mesh, ctx.time || 0, layers, (popts.fps || popts.bindOrder) ? popts : null)
    if (final) {
      bx = final[anch.boneIdx].tx; by = final[anch.boneIdx].ty; ba = final[anch.boneIdx].angle
    }
  }
  const c = Math.cos(ba), s = Math.sin(ba)
  return [bx + anch.tx * c - anch.ty * s, by + anch.tx * s + anch.ty * c]
}

// ── 父链变换解析（elysia resolveTransform 逐字；弧度；y-up）──
// o/表均为**原始 scene.json 对象**；返回 { origin, scale, angle, angles }
export function resolveTransform(o, byId, ctx = {}) {
  const chain = [o]
  let cur = o
  let guard = 0
  while (cur.parent != null && guard < 32) {
    const parent = byId.get(cur.parent)
    if (!parent) break
    chain.push(parent)
    cur = parent
    guard++
  }
  const root = chain[chain.length - 1]
  let origin = parseVec3v(root, 'origin', [0, 0, 0])
  let scale = parseVec3v(root, 'scale', [1, 1, 1])
  let ang = parseVec3v(root, 'angles', [0, 0, 0])
  for (let i = chain.length - 2; i >= 0; i--) {
    const co = parseVec3v(chain[i], 'origin', [0, 0, 0])
    const ca = parseVec3v(chain[i], 'angles', [0, 0, 0])
    const cos = Math.cos(ang[2]), sin = Math.sin(ang[2])
    const ao = attachmentOffset(chain[i], chain[i + 1], ctx)
    if (ao[0] !== 0 || ao[1] !== 0) {
      const ax = ao[0] * scale[0], ay = ao[1] * scale[1]
      origin = [origin[0] + ax * cos - ay * sin, origin[1] + ax * sin + ay * cos, origin[2] || 0]
    }
    const rx = co[0] * scale[0], ry = co[1] * scale[1]
    const ox = rx * cos - ry * sin
    const oy = rx * sin + ry * cos
    origin = [origin[0] + ox, origin[1] + oy, 0]
    const cs = parseVec3v(chain[i], 'scale', [1, 1, 1])
    scale = [scale[0] * cs[0], scale[1] * cs[1], scale[2] * cs[2]]
    ang = [ang[0] + ca[0], ang[1] + ca[1], ang[2] + ca[2]]
  }
  return { origin, scale, angle: ang[2], angles: ang }
}

// ── 便捷封装：为整场景预计算"附件偏移表"（id → [x,y]，y-up，供 parseScene 合并使用）──
// readEntry(name)->Uint8Array：pkg 原始条目；readJson(path)->obj|null：BOM 容错 JSON。
// opts.fps：骨骼动画采样 fps 口径覆盖（缺省=每动画自带 fps，见 puppetBoneFinal 注释）
// opts.bindOrder：①(P-110) bind 世界链序覆盖（`'legacy'` = 父先乘旧写法，作 A/B；缺省=子先乘修正序）
export function buildAttachOffsets(sceneObjects, readEntry, readJson, time = 0, opts = null) {
  const ctx = {
    readModelJson: (p) => { try { const e = readEntry(p); return e ? JSON.parse(new TextDecoder().decode(e).replace(/^\uFEFF/, '')) : null } catch { return null } },
    readMdl: (p) => readEntry(p),
    time,
    fps: opts && typeof opts.fps === 'number' ? opts.fps : undefined,
    bindOrder: opts && typeof opts.bindOrder === 'string' ? opts.bindOrder : undefined,
    _anchorCache: new Map(),
    _mdlCache: new Map(),
  }
  const byId = new Map((sceneObjects || []).map((o) => [o.id, o]))
  const out = new Map()
  for (const o of sceneObjects || []) {
    if (o.attachment == null || o.parent == null) continue
    const parent = byId.get(o.parent)
    if (!parent) continue
    const off = attachmentOffset(o, parent, ctx)
    if (off[0] !== 0 || off[1] !== 0) out.set(o.id, off)
  }
  return out
}

// ── puppet 网格包围盒（模型空间；layer-rect-check 计算"实绘矩形"用）──
export function meshBounds(mesh) {
  if (!mesh || !mesh.positions || !mesh.positions.length) return null
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9
  for (const p of mesh.positions) {
    if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]
    if (p[1] < mny) mny = p[1]; if (p[1] > mxy) mxy = p[1]
  }
  return { minX: mnx, minY: mny, maxX: mxx, maxY: mxy, cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2, w: mxx - mnx, h: mxy - mny }
}
