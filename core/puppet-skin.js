/* 参照来源许可声明：本文件提到的 wer-ref/ 是第三方参考实现（Aromatic05/wallpaper-engine-renderer，GPL-2.0-only，非 WE 官方代码、非「真值源」），与本项目（GPL-3.0-or-later）许可不兼容 —— 仅用于行为对照，不得复制/改写/逐行翻译其代码、注释、常量组织或错误文案。we-layerd-ref/（Aromatic05/we-layerd）无任何许可（保留所有权利），同样仅行为对照。血缘自查结论见 docs/WER-REF-LICENSE-AUDIT.md。 */ // core/puppet-skin.js —— WE puppet 骨骼蒙皮（独立实现，供 WebGL GPU 蒙皮使用）
// 语义来源：wer-ref assets/shaders/base/model_vertex_v1.h::ApplySkinningPosition
//   position' = mul(vec4(position,1), Σ w_i · g_Bones[blendIndices_i])
//   g_Bones[b] = Rz(finalWorld[b]) × bindInv[b]（行主序），蒙皮后再乘 g_ModelMatrix
// 骨骼/动画还原算法对齐 /tmp/elysia-run/lib/we-renderer/puppet.js（_parseMdl/_sampleAnimRT/_skinPuppet）
export function indexOfBytes(buf, str, from = 0) {
  const n = str.length
  for (let i = from; i + n <= buf.length; i++) {
    let ok = true
    for (let k = 0; k < n; k++) if (buf[i + k] !== str.charCodeAt(k)) { ok = false; break }
    if (ok) return i
  }
  return -1
}
const str = (buf, a, b) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(buf[i]); return s }
export function parseMdlStatic(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (buf.length < 16 || str(buf, 0, 4) !== 'MDLV') return null
  const matStart = indexOfBytes(buf, 'materials/', 8)
  if (matStart < 0) return null
  let matEnd = matStart
  while (matEnd < buf.length && buf[matEnd] !== 0) matEnd++
  const f0 = dv.getUint32(matEnd + 1, true)
  const vertBytes = dv.getUint32(matEnd + 5, true)
  const vertStart = matEnd + 9
  if (vertBytes <= 0 || vertStart + vertBytes > buf.length) return null
  const vertexCount = f0
  const stride = Math.max(1, Math.round(vertBytes / vertexCount))
  if (stride < 32 || stride > 256) return null
  // 索引段：顶点段之后（u32 索引数 + u32 索引）
  let p = vertStart + vertBytes
  let indexCount = 0, indexStart = 0, idx32 = false
  for (let k = 0; k < 6 && p + 8 <= buf.length; k++) {
    const cnt = dv.getUint32(p, true)
    if (cnt > 0 && cnt < 4_000_000) { indexCount = cnt; indexStart = p + 8; break }
    p += 4
  }
  if (!indexCount) { indexCount = dv.getUint32(p, true); indexStart = p + 4 }
  const indexU16 = dv.getUint32(indexStart, true)
  if (indexU16 > 0 && indexU16 < 4_000_000) { /* u16 索引数 */ } else idx32 = true
  // MDLS 骨骼块
  const mdls = indexOfBytes(buf, 'MDLS', 9)
  const positions = [], uvs = [], blendIndices = [], blendWeights = [], indices = []
  for (let i = 0; i < vertexCount; i++) {
    const o = vertStart + i * stride
    if (o + 12 > buf.length) break
    positions.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)])
    // uv / 骨骼索引 / 权重：按 elysia 解析结果所在偏移读取（stride=80 时 uv@+12? 由调用方覆盖）
    if (o + stride >= 20) uvs.push([dv.getFloat32(o + stride - 20, true), dv.getFloat32(o + stride - 16, true)])
    else uvs.push([0, 0])
    if (o + stride >= 16) {
      blendIndices.push([dv.getUint8(o + stride - 16), dv.getUint8(o + stride - 15), dv.getUint8(o + stride - 14), dv.getUint8(o + stride - 13)])
      blendWeights.push([dv.getFloat32(o + stride - 12, true), dv.getFloat32(o + stride - 8, true), dv.getFloat32(o + stride - 4, true), 0])
    } else { blendIndices.push([0, 0, 0, 0]); blendWeights.push([1, 0, 0, 0]) }
  }
  for (let i = 0; i < indexCount; i++) {
    const o = indexStart + i * 2
    if (o + 2 > buf.length) break
    indices.push(dv.getUint16(o, true))
  }
  return { positions, uvs, indices, blendIndices, blendWeights, vertexCount, stride, mdlsOffset: mdls, raw: buf }
}
// 行主序 4x4
export function matMulRow(a, b) {
  const o = new Array(16)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c]
  }
  return o
}
export function matInvertRow(m) {
  const inv = new Array(16)
  const a = m
  inv[0] = a[5]*a[10]*a[15] - a[5]*a[11]*a[14] - a[9]*a[6]*a[15] + a[9]*a[7]*a[14] + a[13]*a[6]*a[11] - a[13]*a[7]*a[10]
  inv[4] = -a[4]*a[10]*a[15] + a[4]*a[11]*a[14] + a[8]*a[6]*a[15] - a[8]*a[7]*a[14] - a[12]*a[6]*a[11] + a[12]*a[7]*a[10]
  inv[8] = a[4]*a[9]*a[15] - a[4]*a[11]*a[13] - a[8]*a[5]*a[15] + a[8]*a[7]*a[13] + a[12]*a[5]*a[11] - a[12]*a[7]*a[9]
  inv[12] = -a[4]*a[9]*a[14] + a[4]*a[10]*a[13] + a[8]*a[5]*a[14] - a[8]*a[6]*a[13] - a[12]*a[5]*a[10] + a[12]*a[6]*a[9]
  inv[1] = -a[1]*a[10]*a[15] + a[1]*a[11]*a[14] + a[9]*a[2]*a[15] - a[9]*a[3]*a[14] - a[13]*a[2]*a[11] + a[13]*a[3]*a[10]
  inv[5] = a[0]*a[10]*a[15] - a[0]*a[11]*a[14] - a[8]*a[2]*a[15] + a[8]*a[3]*a[14] + a[12]*a[2]*a[11] - a[12]*a[3]*a[10]
  inv[9] = -a[0]*a[9]*a[15] + a[0]*a[11]*a[13] + a[8]*a[1]*a[15] - a[8]*a[3]*a[13] - a[12]*a[1]*a[11] + a[12]*a[3]*a[9]
  inv[13] = a[0]*a[9]*a[14] - a[0]*a[10]*a[13] - a[8]*a[1]*a[14] + a[8]*a[2]*a[13] + a[12]*a[1]*a[10] - a[12]*a[2]*a[9]
  inv[2] = a[1]*a[6]*a[15] - a[1]*a[7]*a[14] - a[5]*a[2]*a[15] + a[5]*a[3]*a[14] + a[13]*a[2]*a[7] - a[13]*a[3]*a[6]
  inv[6] = -a[0]*a[6]*a[15] + a[0]*a[7]*a[14] + a[4]*a[2]*a[15] - a[4]*a[3]*a[14] - a[12]*a[2]*a[7] + a[12]*a[3]*a[6]
  inv[10] = a[0]*a[5]*a[15] - a[0]*a[7]*a[13] - a[4]*a[1]*a[15] + a[4]*a[3]*a[13] + a[12]*a[1]*a[7] - a[12]*a[3]*a[5]
  inv[14] = -a[0]*a[5]*a[14] + a[0]*a[6]*a[13] + a[4]*a[1]*a[14] - a[4]*a[2]*a[13] - a[12]*a[1]*a[6] + a[12]*a[2]*a[5]
  inv[3] = -a[1]*a[6]*a[11] + a[1]*a[7]*a[10] + a[5]*a[2]*a[11] - a[5]*a[3]*a[10] - a[9]*a[2]*a[7] + a[9]*a[3]*a[6]
  inv[7] = a[0]*a[6]*a[11] - a[0]*a[7]*a[10] - a[4]*a[2]*a[11] + a[4]*a[3]*a[10] + a[8]*a[2]*a[7] - a[8]*a[3]*a[6]
  inv[11] = -a[0]*a[5]*a[11] + a[0]*a[7]*a[9] + a[4]*a[1]*a[11] - a[4]*a[3]*a[9] - a[8]*a[1]*a[7] + a[8]*a[3]*a[5]
  inv[15] = a[0]*a[5]*a[10] - a[0]*a[6]*a[9] - a[4]*a[1]*a[10] + a[4]*a[2]*a[9] + a[8]*a[1]*a[6] - a[8]*a[2]*a[5]
  const det = a[0]*inv[0] + a[1]*inv[4] + a[2]*inv[8] + a[3]*inv[12]
  if (!det) return a.slice()
  for (let i = 0; i < 16; i++) inv[i] /= det
  return inv
}
