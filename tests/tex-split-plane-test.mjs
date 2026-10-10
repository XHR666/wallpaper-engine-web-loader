// tex-split-plane-test.mjs —— `format 5`（DXT5 半分辨率）**平面分离载荷**的判据（P-264）
//
// 实测背景（统一口径三布局对照，10 张 format 5 贴图）：
//   · 旧口径（每 16B 块 = alpha@0..7 + color@8..15）在 **10/10** 张上都是最差的（93~137）；
//   · 平面分离（前半 nB*8 = 全部 alpha 块，后半 = 全部 color 块）在 **10/10** 张上都更好，
//     其中 天空 103.6→4.9、树丛1 114.6→13.8、树丛2 98.5→20.4、树丛3 93.0→22.4、纸堆 122.8→18.1。
//  修复 = `reorderSplitPlanes()` 把平面分离重排成既有 16B/块形态（解码算法一行不改）。
//
// 判据：A 段纯函数（合成载荷，逐字节断言）；B 段真语料回归（条件项：样本不在则 SKIP）；
//       C 段接线（源码级：format 5 分支必须调用重排）。
import fs from 'node:fs'
import path from 'node:path'
import { reorderSplitPlanes, parseTex, decodeMip0 } from '../core/we-scene-bundle.js'
import { ROOT, WS } from './_root.mjs'

const rows = []
const ok = (id, why, cond, detail) => rows.push({ id, why, pass: !!cond, detail: String(detail == null ? '' : detail) })

// A1：2 块（8×4 ⇒ 2×1 块）合成载荷：alpha 平面在前、color 平面在后
const nB = 2, alpha = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18])
const color = Uint8Array.from([101, 102, 103, 104, 105, 106, 107, 108, 201, 202, 203, 204, 205, 206, 207, 208])
const payload = Uint8Array.from([...alpha, ...color])
const out = reorderSplitPlanes(payload, 8, 4)
ok('A1', '平面分离 → 每块 alpha(8)+color(8)', out.length === payload.length
  && Array.from(out.slice(0, 8)).join() === '1,2,3,4,5,6,7,8'
  && Array.from(out.slice(8, 16)).join() === '101,102,103,104,105,106,107,108'
  && Array.from(out.slice(16, 24)).join() === '11,12,13,14,15,16,17,18'
  && Array.from(out.slice(24, 32)).join() === '201,202,203,204,205,206,207,208', '逐字节重排正确')
ok('A2', '长度不匹配 ⇒ 原样返回（旧行为零风险）', (() => { const bad = payload.slice(0, 31); return reorderSplitPlanes(bad, 8, 4) === bad })() && reorderSplitPlanes(null, 4, 4) === null, 'passthrough ok')
ok('A3', '非 4 对齐尺寸的块数按 ceil 计算', reorderSplitPlanes(new Uint8Array(2 * 16), 5, 5).length === 32, 'ceil ok')

const src = fs.readFileSync(path.join(ROOT, 'core', 'we-scene-bundle.js'), 'utf8')
ok('C1', '接线：format 5 缺省走 reorderSplitPlanes（平面分离）',
  /case 5: return decodeDXT5\(TEXPLANE_LEGACY \? data : reorderSplitPlanes\(data, w, h\), w, h\)/.test(src), 'wired ok')
ok('C2', 'A/B 回退口：`?texplane=legacy` 读存在且只认 legacy（真机对照用）',
  /get\('texplane'\) === 'legacy'/.test(src) && /^\| `texplane` \|/m.test(fs.readFileSync(path.join(ROOT, 'docs', 'README-DIAGNOSTICS.md'), 'utf8')), 'legacy 开关 + 主表登记')

// B 段：真语料回归（条件项）——天空/树丛1 的不透明区 RGB 相邻差必须 ≤ 阈值
/* 样本路径**不得写成字面绝对路径**（publish-check 红线：公开仓库不带操作环境信息）：
   用运行时工作区根（_root.mjs 的 WS）+ 相对语料路径拼出来。 */
const SAMPLE = path.join(WS, 'allwallpaper', '1004', '夜莺night——【parallax_视差】blue_archive_妃咲_kisaki_月下独酌【蔚蓝档案】.mpkg')
if (!fs.existsSync(SAMPLE)) {
  console.log('  ⏭ B 段 SKIP（样本不在本机）')
} else {
  const b = fs.readFileSync(SAMPLE); let o = 0
  const ml = b.readUInt32LE(o); o += 4 + ml
  const n = b.readUInt32LE(o); o += 4
  const ents = []
  for (let i = 0; i < n; i++) { const nl = b.readUInt32LE(o); o += 4; const nm = b.toString('utf8', o, o + nl); o += nl; const off = b.readUInt32LE(o); const size = b.readUInt32LE(o + 4); o += 8; if (nm.endsWith('.tex')) ents.push({ nm, off, size }) }
  const start = o
  for (const [want, maxMad] of [['天空.tex', 10], ['树丛1.tex', 20]]) {
    const hit = ents.find((e) => e.nm.endsWith(want))
    if (!hit) { ok('B' + want, '样本条目存在', false, '未找到 ' + want); continue }
    const im = decodeMip0(parseTex(b.subarray(start + hit.off, start + hit.off + hit.size)))
    const W = im.width, H = im.height, r = im.rgba
    let s = 0, c = 0
    for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) { const i = (y * W + x) * 4, j = i - 4; if (r[i + 3] > 200 && r[j + 3] > 200) { s += Math.abs(r[i] - r[j]) + Math.abs(r[i + 1] - r[j + 1]) + Math.abs(r[i + 2] - r[j + 2]); c++ } }
    const mad = c ? s / c : NaN
    ok('B' + want, want + ' 不透明区 RGB 相邻差 ≤ ' + maxMad + '（修复前 103.6/114.6）', mad <= maxMad, 'MAD=' + mad.toFixed(1))
  }
}

const fail = rows.filter((r) => !r.pass)
for (const r of rows) console.log((r.pass ? '  ✓ ' : '  ✗ ') + r.id + ' ' + r.why + ' — ' + r.detail)
console.log(`===== tex-split-plane: ${rows.length - fail.length} 通过 / ${fail.length} 失败 =====`)
process.exit(fail.length ? 1 : 0)
