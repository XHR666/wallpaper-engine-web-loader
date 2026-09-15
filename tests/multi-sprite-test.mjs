// multi-sprite-test.mjs — P0-2（RE-31 多图精灵）验收：TEXS imageId>0 → 帧=换纹理
// 证据链（REVERSE-FINDINGS-6 RE-31 + 官方 CustomShaderPass.cpp:1296-1299 ImageSlotsRef.active=imageId）：
//   ① 回归资产（真实用户包）：夜莺·alone「materials/合成 1_00000.tex」= 151 帧 / 7 图（6×3752²+1×752²，
//      每图 5×5 帧网格，TEXS0003）；夜莺·firefly「materials/背景 合成 1_00000.tex」= 53 帧 / 3 图。
//   ② 帧矩形归一域 = 帧所属 image 的尺寸（官方 WPTexHeaderParser.cpp:292-315 slotDimensions[imageId]）。
//   ③ 跨 image 的帧边界关闭 SPRITESHEETBLEND（官方帧混合只在同纹理内可行）。
//   ④ 单图精灵路径（computeSpriteFrameUV）不受影响（回归门）。
import fs from 'node:fs'
import * as lib from '../we-scene-bundle.js'
// ①(去个人化 2026-09-16) 工作区根：环境变量优先；下面的默认值只是作者本机路径，发布副本请设 MPW_ROOT。
const MPW_WS = process.env.MPW_ROOT || '/root/Desktop/DSHarea'

let pass = 0, fail = 0
const fails = []
function chk(cond, label, detail) {
  if (cond) { pass++; console.log('PASS  ' + label) }
  else { fail++; fails.push(label + (detail !== undefined ? '  [' + detail + ']' : '')); console.log('FAIL  ' + label + (detail !== undefined ? '  [' + detail + ']' : '')) }
}
const eq = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps
const PKG_ALONE = `${MPW_WS}/allwallpaper/wallpapertest1/夜莺night——【time_variation_时间变化】alone_孤独の少女【原画：rella].mpkg`
const PKG_FIREFLY = `${MPW_WS}/allwallpaper/wallpapertest1/夜莺night——【customize自定义】firefly_流萤_星空之誓——夜莺night崩坏星穹铁道.mpkg`

function loadTex(pkgPath, entryName) {
  const pkg = lib.parsePkg(new Uint8Array(fs.readFileSync(pkgPath)))
  const buf = lib.getEntry(pkg, entryName)
  if (!buf) throw new Error('缺条目 ' + entryName)
  return lib.parseTex(buf)
}

// ── ① 主回归资产：合成 1_00000.tex（151 帧 / 7 图）──
const tex = loadTex(PKG_ALONE, 'materials/合成 1_00000.tex')
chk(tex.images.length === 7, '① TEXB 7 个 image 槽', String(tex.images.length))
chk(tex.sprite && tex.sprite.frames.length === 151, '① TEXS 151 帧', String(tex.sprite && tex.sprite.frames.length))
const si = lib.spriteInfo(tex)
chk(!!si && si.multiImage === true, '① spriteInfo.multiImage=true')
chk(si.imageIds === 7, '① 引用 7 个 imageId', String(si.imageIds))
const ids = tex.sprite.frames.map((f) => f.imageId)
chk(ids.every((v, i) => i === 0 || v >= ids[i - 1]), '① imageId 按帧序单调不减（图序列）')
const perImg = {}
for (const v of ids) perImg[v] = (perImg[v] || 0) + 1
chk(perImg[0] === 25 && perImg[5] === 25 && perImg[6] === 1, '① 每图 25 帧（5×5 网格）+ 尾图 1 帧', JSON.stringify(perImg))

// ── ② 帧矩形：归一域=所属 image，5×5 网格步进 ──
const r0 = lib.spriteFrameImageRects(tex, 0, false)
chk(!!r0 && r0.cur.imageId === 0, '② 帧0 → image0')
chk(eq(r0.cur.u0, 0) && eq(r0.cur.v0, 0) && eq(r0.cur.u1, 750 / 3752) && eq(r0.cur.v1, 750 / 3752), '② 帧0 矩形=750/3752', JSON.stringify(r0.cur))
chk(eq(r0.nxt.u0, 750 / 3752) && eq(r0.nxt.u1, 1500 / 3752), '② 行主序： nxt 列进位', JSON.stringify(r0.nxt))
chk(eq(r0.blend, 0), '② 帧0 起点帧内 blend=0', String(r0.blend))
const rMid = lib.spriteFrameImageRects(tex, 0.5, false)
chk(eq(rMid.blend, 0.5) || eq(rMid.blend, Math.floor(75.5) === 75 ? 0.5 : rMid.blend), '② 帧中相位 blend≈0.5', String(rMid.blend))
chk(rMid.cur.imageId === rMid.nxt.imageId, '② 帧中 cur/nxt 同图（可混合）')
// 帧值=(24.5/151)：cur=帧24（图0 末帧）、nxt=帧25（图1）→ 跨图 → blend 强制 0
const rCross = lib.spriteFrameImageRects(tex, 24.5 / 151, false)
chk(rCross.cur.imageId === 0 && rCross.nxt.imageId === 1, '② 跨图边界：cur=图0/nxt=图1', JSON.stringify([rCross.cur.imageId, rCross.nxt.imageId]))
chk(rCross.blend === 0, '② 跨图 blend=0（官方同纹理混合）', String(rCross.blend))
const rTail = lib.spriteFrameImageRects(tex, 1 - 1e-9, false)
chk(rTail.cur.imageId === 6 && eq(rTail.cur.u1 - rTail.cur.u0, 750 / 752), '② 尾帧=尾图内 750²（图带 2px padding）', JSON.stringify(rTail.cur))
chk(eq(rTail.cur.u0, rTail.nxt.u0) && eq(rTail.cur.v0, rTail.nxt.v0), '② 尾帧 clamp：cur==nxt')

// ── ③ 多图解码 + 预算降采样 ──
const set = lib.spriteMultiImages(tex)
chk(!!set && set.imgs.length === 7, '③ 解码 7 图', String(set && set.imgs.length))
chk(set.scale === 2, '③ 超预算(6×56MB>96MB) → ×2 抽点降采样', String(set && set.scale))
chk(set.imgs.slice(0, 6).every((x) => x.w === 1876 && x.h === 1876) && set.imgs[6].w === 376, '③ 降采样后 1876²×6 + 376²', JSON.stringify(set.imgs.map((x) => x.w)))
let diff = 0
const a0 = lib.decodeImageMip0(tex, 0), a3 = lib.decodeImageMip0(tex, 3)
{ const n = Math.min(a0.rgba.length, a3.rgba.length); for (let k = 0; k < n; k += 997) if (a0.rgba[k] !== a3.rgba[k]) diff++ }
chk(diff > 0, '③ image0 与 image3 内容不同（确实换图）', String(diff))
// 解码尺寸 = mip 头尺寸（fmt5 半分辨率路径 P-19 已验，此处跨槽复验）
chk(a0.width === 3752 && a3.width === 3752, '③ 各槽解码 3752²', a0.width + 'x' + a3.width)

// ── ④ 第二资产：背景合成 1_00000.tex（53 帧 / 3 图）──
const tex2 = loadTex(PKG_FIREFLY, 'materials/背景 合成 1_00000.tex')
const si2 = lib.spriteInfo(tex2)
chk(tex2.images.length === 3 && tex2.sprite.frames.length === 53, '④ 3 图 / 53 帧', tex2.images.length + '/' + tex2.sprite.frames.length)
chk(!!si2 && si2.multiImage === true, '④ multiImage=true')
const s2 = lib.spriteMultiImages(tex2)
chk(!!s2 && s2.imgs.length === 3, '④ 解码 3 图')

// ── ⑤ 单图精灵回归门（不得受多图改动影响）──
const bub = lib.parseTex(new Uint8Array(fs.readFileSync(`${MPW_WS}/wallpaper_engine/assets/materials/particle/bubbles/bubble1.tex`)))
const bubSi = lib.spriteInfo(bub)
chk(!bubSi.multiImage, '⑤ 单图精灵 multiImage=false', String(bubSi.multiImage))
const syn = { numFrames: 4, frameWidthUV: 0.5, frameHeightUV: 0.5 }
const uv = lib.computeSpriteFrameUV(syn, 0.3, false)
chk(uv.u0 === 0.5 && uv.v0 === 0 && uv.u1 === 0 && Math.abs(uv.blend - 0.2) < 1e-9, '⑤ 单图公式：cur=1 列进位/blend 0.2', JSON.stringify(uv))
const uvNb = lib.computeSpriteFrameUV(syn, 0.3, true)
chk(uvNb.blend === 0, '⑤ noBlend → blend 0')
const rOne = lib.spriteFrameImageRects({ sprite: { frames: [{ imageId: 0, frametime: 0.1, x: 0, y: 0, xAxis: [512, 0], yAxis: [0, 512] }] }, images: [[{ width: 512, height: 512 }]] }, 0.25, false)
chk(!!rOne && eq(rOne.cur.u1, 1) && eq(rOne.cur.v1, 1), '⑤ 单图也可走 rects 路径（整帧覆盖）', JSON.stringify(rOne && rOne.cur))

console.log(`\n${pass}/${pass + fail} 通过（RE-31 多图精灵）`)
if (fails.length) console.log('失败项:\n  ' + fails.join('\n  '))
process.exit(fail === 0 ? 0 : 1)
