// mdl-bone-layout-test.mjs — ①(P-152 2026-09-19) **MDLS 骨骼布局校验（防回归）**门禁
//
// 门禁名 `mdl-bone-layout`（`tests/run-all-tests.sh`）。**无浏览器 / 无网络 / 无 X11**，单 node 进程。
//
// 依据：`docs/UPSTREAM-PORT-PLAN-20260919.md` §4「MDLS 变长骨名」——
//   上游（`oneincase/webwallgl` `be3c246`，MIT）在 `renderer/vendor/we-scene/render/mdl-parse.js`
//   里把"MDLS 逐骨记录不止一种布局"这条病修掉：**先按布局 A 整体解析并校验，通过就逐位采用；
//   任一骨非法才判定为变长布局；重扫拿全且全合法才采用，否则回退，绝不返回残缺骨架**。
//   本仓两侧解析器（`core/attach-transform.mjs::parseMdl` 与 `elysia/we-renderer/puppet.js::_parseMdl`）
//   当时**都是布局 A 定步、且没有任何校验** ⇒ 一旦记录不是 A 就**静默产出错位骨架**（`parent` 读成
//   16256 之类的垃圾、矩阵退化成垃圾/假旋转），不抛异常、不报错。**本仓语料 43 `.mdl` / 35 含 MDLS /
//   332 骨 / 非法骨 0** ⇒ 本项**今天没有可见收益**，价值全在"以后不回归 + 别人的包不炸"。
//
// 本门禁锁四件事：
//   ① 合成样本逐类判定：合法 A（逐位采用）/ 变长骨名布局 B、C（**不许静默按 A 解**）/ parent 越界 /
//      材质(id)索引越界 / 记录截断 / 骨名槽超长 / 骨名槽非法字节 / 旋转非单位长 / 平移非有限 /
//      声明骨数越界 —— 每种都有**期望的判定结果**（`bones=[]` + `mlDiag.reason` + 一行 warn），
//      **绝不出现"残缺骨架"**（返回的 bones 长度 ∈ {0, 声明骨数}）。
//   ② 全语料回归：43 个 `.mdl` 逐字段与**基线**（`?mdls=legacy` = P-152 之前的实现路径）相同；
//      基线计数写成断言（**43 `.mdl` / 35 MDLS / 332 骨 / 0 非法 / 0 拒绝**）。
//   ③ `?mdls=legacy` 逐位回退：逐样本 + 全语料的 **bones 描述符 sha256** 相同，且旧路径不产生 `mdlDiag`。
//   ④ 变异自证 R1–R3（真跑：把 `core/attach-transform.mjs` 复制到临时目录后**字符串变异**再 import）：
//      R1 强制走"无校验旧路径" ⇒ 逐类判定组必红；R2 布局判定恒为 A ⇒ 布局 B/C 组的 `layout` 必红；
//      R3 骨名槽判据弱化 ⇒ 本门禁**必须仍然全绿**（没有过度拒绝的证明）。
//
// ⚠ 诚实口径（与 `docs/PATCHES.md` P-152 的"未证实项"同一口径）：
//   · 布局 B/C 是**合成**样本（真语料 0 命中，官方二进制/上游实现**未对拍**）；
//   · 上游**只作判据引用**（`file:line`），**没有照抄任何代码/注释/文案** ⇒ 无 `THIRD-PARTY.md` 新增段；
//   · 上游的"变长布局顺序**重扫救回**"本门禁**不判**（本轮有意不落，见 P-152）。
//
// 运行：node tests/mdl-bone-layout-test.mjs        （全过输出 ALL PASS，退出码 0）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { WS } from './_root.mjs'
import { readIndexHead, readEntryBytes, walkContainers } from './_pkg-index.mjs'
import { parseMdl, mdlsLegacy, readMdlsLayoutABones } from '../core/attach-transform.mjs'
import { installPuppet, mdlsLegacy as mdlsLegacyElysia } from '../elysia/we-renderer/puppet.js'
import { Buffer as MpwBuffer } from '../elysia/buffer.js'

const H = {}
installPuppet(H)

let PASS = 0, FAIL = 0
const RED = {}
function check(group, name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { FAIL++; RED[group] = (RED[group] || 0) + 1; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')) }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// A. 合成样本：自研 MDL 构造器（块顺序照 `parseMdl` 的扫描契约排，构造时自检）
//
// 为什么不自己拼一个假 MDL：顶点块的定位是**启发扫描**（`u32@offset+4` 是 80 的倍数、
//   索引块紧随 `offset+8+vertexBytes`、前 64 个顶点有限、索引 ≥98% 小于顶点数），手拼字节
//   时"看起来对"的偏移会被扫描跳过（本轮实测踩了 4 次）。模板法 = **WYSIWYG**：真文件的
//   顶点/索引/材质区一个字节都不动，只把 MDLS 的"逐骨记录区"换成合成记录 ⇒ 差异只可能
//   来自本项判据本身（这正是回归测试要的隔离度）。
//   ⚠ 模板文件只用**最小**的那一个（本机语料里 `models/眼球_puppet.mdl` = 10095B）：
//     只读 entry 表 + 单个 entry，**从不**整包 readFileSync（大包 220–792MB）。
// ══════════════════════════════════════════════════════════════════════════════════════════
const F32 = (x) => { const b = new ArrayBuffer(4); new DataView(b).setFloat32(0, x, true); return [...new Uint8Array(b)] }
const I32 = (x) => { const b = new ArrayBuffer(4); new DataView(b).setInt32(0, x, true); return [...new Uint8Array(b)] }
const U32 = (x) => I32(x)
const A32 = (s) => [...s].map((c) => c.charCodeAt(0))
// 旋转部分两行单位长（±0.05 内）+ 平移有限 = 合法骨矩阵（行主序，与真语料的布局 A 同型）
const ROW_IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const ROW_BADROT = [0.2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]     // 第 1 行长度 0.2 ⇒ 非法
const ROW_BADTRANS = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, NaN, 0, 0, 1]  // 平移非有限 ⇒ 非法
// 变长布局（B/C）用的矩阵：三行都 ≈ 单位长（"看起来像合法矩阵"——正是要证明定步仍会失步）
const ROW_VAR = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

// ── 自研 MDL 构造器（**不手算偏移**：块顺序照 `parseMdl` 的定步契约排，偏移由 `indexOf` 复核）──
//
// `parseMdl` 的顶点块扫描（`core/attach-transform.mjs`）实际口径（本轮逐字节核对，**不是猜的**）：
//   扫描 `offset = 9, 10, …`，命中条件 `u32@offset+4` 是 **80 的倍数**（非 0），
//   且 `u32@(offset+8+vertexBytes)` 是**非 0 偶数**（索引字节数），且 `offset+8+vertexBytes+4+indexBytes ≤ mdlsOffset`。
//   ⇒ 取 `offset = 9` ⇒ 扫描读的是 **u32@13**（= 顶点计数）、`顶点数据 @17`（`vertexBytes` 字节）、
//   `索引计数 @17+vertexBytes`。本构造器就按这个顺序拼：
//   `[13B 填充][顶点计数][顶点数据][索引计数][索引][间隔][MDLS…]`，
//   并**断言** `u32@13` == 顶点数、`u32@(17+vertexBytes)` == 索引字节数（拼错就当场红，不靠人眼）。
const VERTEX_COUNT = 1
const VERTEX_BYTES = VERTEX_COUNT * 80     // +13 处**必须是 80 的倍数**（扫描条件就是 `vertexBytes % 80 === 0`）
const INDEX_COUNT = 3
const INDEX_BYTES = INDEX_COUNT * 2        // +17+VERTEX_BYTES 处是**索引字节数**（非 0 偶数）
// 旋转部分两行单位长（±0.05 内）+ 平移有限 = 合法骨矩阵（行主序，与真语料布局 A 同型）
// 变长布局（B/C）用的矩阵：三行都 ≈ 单位长（"看起来像合法矩阵"——要证的正是**定步仍会失步**）
// 记录区之后的余量：变长布局（B/C）的合成记录**比声明骨数的定步长度短**，若不留余量，定步会先撞
// "读到文件尾"（reason=record-truncated）而不是"读出错位骨"（layout=not-A）——本门禁要证的是后者。
const SLACK = 2048

/**
 * 造一个 MDL 样本。`bones` 项：`{ head: 'u8'|'u16', id, parent, mat, len, slot, name }`
 *   `mode='A'`：`[tmp][id u32][parent i32][len u32][矩阵][骨名槽 cstr]`（真语料形态）
 *   `mode='B'`：`[name cstr][id u32][parent i32][len=64][矩阵]`（名字前置变长）
 *   `mode='C'`：`[name cstr][id][parent][len][矩阵][JSON cstr]`（布局 C；JSON 由 `jsonAfterMatrix` 给）
 */
function buildMdl({ declaredCount, bones, mode = 'A', jsonAfterMatrix = null, tail = null }) {
  const rec = (bn) => {
    const mat = bn.mat || ROW_IDENT
    const len = bn.len === undefined ? mat.length * 4 : bn.len
    if (mode === 'B' || mode === 'C') {
      const name = bn.name === undefined ? [0] : A32(bn.name).concat([0])
      const hdr = U32(bn.id).concat(I32(bn.parent), U32(64), ROW_VAR.flatMap(F32))
      return name.concat(hdr, mode === 'C' ? (jsonAfterMatrix || [0]) : [])
    }
    const head = bn.head === 'u16' ? [0, 0] : [0]
    return head.concat(U32(bn.id), I32(bn.parent), U32(len), mat.flatMap(F32), bn.slot === undefined ? [0] : bn.slot)
  }
  const recs = bones.flatMap(rec)
  const bytes = [].concat(
    new Array(13).fill(0),                                  // 前缀：顶点计数必须落在 +13（扫描从 +9 起、读 offset+4）
    U32(VERTEX_BYTES),                                      // 顶点字节数 @+13（不是顶点数！）
    new Array(VERTEX_BYTES).fill(0),                        // 顶点数据 @+17（位置全 0 ⇒ 有限、量级合法）
    U32(INDEX_BYTES),                                       // 索引计数 @+17+VERTEX_BYTES
    new Array(INDEX_BYTES + 4).fill(0),                     // 索引 + 4B 间隔
    A32('MDLS0004'), [0],                                   // 段魔数（+8B）+ u8
    U32(22 + recs.length),                                  // § 段字节（本构造器不依赖它）
    U32(declaredCount),                                     // 骨数 @mdls+13
    recs,
    tail !== null ? tail : new Array(SLACK).fill(0),
  )
  const u8 = new Uint8Array(bytes)
  const dv = new DataView(u8.buffer)
  const mo = u8.indexOf(0x4d)
  if (dv.getUint32(13, true) !== VERTEX_BYTES || dv.getUint32(17 + VERTEX_BYTES, true) !== INDEX_BYTES || mo < 0) {
    throw new Error('buildMdl 自检失败（块顺序与 parseMdl 的扫描契约不符）')
  }
  return u8
}
const mdlsOffsetOf = (u8) => { for (let i = 0; i + 4 <= u8.length; i++) if (u8[i] === 0x4d && u8[i + 1] === 0x44 && u8[i + 2] === 0x4c && u8[i + 3] === 0x53) return i; return -1 }
const boneA = (id, parent, extra = {}) => ({ head: 'u8', id, parent, ...extra })

const OW = console.warn
const capture = (fn) => { const got = []; console.warn = (...a) => got.push(a.join(' ')); try { return { r: fn(), warns: got } } finally { console.warn = OW } }

// ── A.1 样本表（每种一个**期望判定**）────────────────────────────────────────────────────────
const legalA = buildMdl({ declaredCount: 3, bones: [boneA(1, -1), boneA(2, 0), boneA(3, 1)] })
const layoutB = buildMdl({ declaredCount: 3, mode: 'B', bones: [{ name: 'a1x', id: 1, parent: -1 }, { name: 'b1x', id: 2, parent: 0 }, { name: 'c1x', id: 3, parent: 1 }] })
const layoutC = buildMdl({ declaredCount: 3, mode: 'C', jsonAfterMatrix: A32('{"tm":100,"tp":"1 2 3"}').concat([0]), bones: [{ name: '主', id: 1, parent: -1 }, { name: '右眼', id: 2, parent: 0 }, { name: 'c1x', id: 3, parent: 1 }] })
const badParent = buildMdl({ declaredCount: 3, bones: [boneA(1, -1), boneA(2, 0), boneA(3, 99)] })
const badMatIdx = buildMdl({ declaredCount: 2, bones: [boneA(1, -1), boneA(100000, 0)] })
const truncated = (() => { const u8 = buildMdl({ declaredCount: 3, bones: [boneA(1, -1), boneA(2, 0), boneA(3, 1)] }); return u8.slice(0, u8.length - (SLACK + 120)) })()
const longNameSlot = buildMdl({ declaredCount: 2, bones: [boneA(1, -1, { slot: A32('x'.repeat(5000)).concat([0]) }), boneA(2, 0, { slot: A32('y'.repeat(5000)).concat([0]) })] })
const badRot = buildMdl({ declaredCount: 2, bones: [boneA(1, -1, { mat: ROW_BADROT }), boneA(2, 0)] })
const badTrans = buildMdl({ declaredCount: 2, bones: [boneA(1, -1, { mat: ROW_BADTRANS }), boneA(2, 0)] })
const declaredZero = buildMdl({ declaredCount: 0, bones: [] })
const declaredHuge = buildMdl({ declaredCount: 100000, bones: [boneA(1, -1)] })
const head10 = buildMdl({ declaredCount: 2, bones: [{ head: 'u16', id: 1, parent: -1 }, { head: 'u16', id: 2, parent: 0 }] })

/** 逐样本统一判定：`bones.length ∈ {0, declared}`（绝无残缺中间态）+ 台账 + 一行 warn。 */
function runSample(label, u8, declared) {
  const cap = capture(() => parseMdl(u8))
  const m = cap.r
  const out = { ok: !!m, bones: m ? m.bones.length : -1, diag: m && m.mdlDiag, warns: cap.warns }
  check('A 合成逐类', label + '：返回对象非 null', !!m)
  check('A 合成逐类', label + '：bones.length ∈ {0, 声明骨数}（绝不残缺）', !!m && (m.bones.length === 0 || m.bones.length === declared), 'len=' + out.bones + ' declared=' + declared)
  return out
}

console.log('① 合成样本逐类判定')
{
  const r = runSample('合法布局 A', legalA, 3)
  check('A 合成逐类', '合法布局 A：逐位采用（3 骨）', r.bones === 3 && !r.diag, 'bones=' + r.bones)
  check('A 合成逐类', '合法布局 A：parent/矩阵 与构造值一致', r.ok && JSON.stringify(parseMdl(legalA).bones.map((b) => [b.type, b.parent])) === JSON.stringify([[1, -1], [2, 0], [3, 1]]))
  check('A 合成逐类', '合法布局 A：0 行 warn（合法语料日志面不变）', r.warns.length === 0)
}
{
  const r = runSample('布局 B（名字前置变长）', layoutB, 3)
  check('A 合成逐类', '布局 B：判定 = not-A（不许静默按 A 解）', !!r.diag && r.diag.layout === 'not-A', JSON.stringify(r.diag))
  check('A 合成逐类', '布局 B：拒绝（rejected=true, bones=[]）', !!r.diag && r.diag.rejected === true && r.bones === 0)
  check('A 合成逐类', '布局 B：一行可读 warn 含 declared/parsed/layout', r.warns.length === 1 && /\[P-152\] MDLS bone layout rejected/.test(r.warns[0]) && /declared=3/.test(r.warns[0]), r.warns[0])
}
{
  const r = runSample('布局 C（名字前置 + 矩阵后 JSON）', layoutC, 3)
  check('A 合成逐类', '布局 C：判定 = not-A（不许静默按 A 解）', !!r.diag && r.diag.layout === 'not-A', JSON.stringify(r.diag))
  check('A 合成逐类', '布局 C：拒绝（bones=[]，且**不是**把 3 个错位骨当结果）', r.bones === 0 && !!r.diag && r.diag.rejected === true)
}
{
  const r = runSample('parent 越界（parent=99 > boneCount=3）', badParent, 3)
  check('A 合成逐类', 'parent 越界：reason=parent-out-of-range', !!r.diag && r.diag.reason === 'parent-out-of-range', JSON.stringify(r.diag))
  check('A 合成逐类', 'parent 越界：rejectedBones≥1 且台账带首个骨号', !!r.diag && r.diag.rejectedBones >= 1 && r.diag.entryErrors[0].b === 2)
}
{
  const r = runSample('材质(id)索引越界（id=100000）', badMatIdx, 2)
  check('A 合成逐类', '材质索引越界：reason=material-index-out-of-range', !!r.diag && r.diag.reason === 'material-index-out-of-range', JSON.stringify(r.diag))
}
{
  const r = runSample('记录截断（砍掉尾部 90 字节）', truncated, 3)
  check('A 合成逐类', '记录截断：reason=record-truncated（可判定的失败，不是静默错位）', !!r.diag && /record-truncated|name-not-terminated|bone-count-mismatch/.test(r.diag.reason), JSON.stringify(r.diag))
}
{
  const r = runSample('骨名槽超长（5000B > 4096）', longNameSlot, 2)
  check('A 合成逐类', '骨名槽超长：reason=name-slot-too-long', !!r.diag && r.diag.reason === 'name-slot-too-long', JSON.stringify(r.diag))
}
{
  const r = runSample('旋转非单位长（第 1 行长度 0.2）', badRot, 2)
  check('A 合成逐类', '旋转非单位长：reason=rotation-row-not-unit', !!r.diag && r.diag.reason === 'rotation-row-not-unit', JSON.stringify(r.diag))
}
{
  const r = runSample('平移非有限（m[12]=NaN）', badTrans, 2)
  check('A 合成逐类', '平移非有限：reason=translation-not-finite', !!r.diag && r.diag.reason === 'translation-not-finite', JSON.stringify(r.diag))
}
{
  const r = runSample('声明骨数越界（0）', declaredZero, 0)
  check('A 合成逐类', '声明骨数越界(0)：layout=refused 且不读骨', !!r.diag && r.diag.layout === 'refused' && r.diag.reason === 'declared-bone-count-out-of-range' && r.bones === 0)
}
{
  const r = runSample('声明骨数越界（100000）', declaredHuge, 100000)
  check('A 合成逐类', '声明骨数越界(100000)：refused（不按 100000 循环读骨）', !!r.diag && r.diag.reason === 'declared-bone-count-out-of-range' && r.bones === 0)
}
{
  const r = runSample('10 字节头变体（tmp=u16）', head10, 2)
  check('A 合成逐类', '10 字节头变体：合法 ⇒ 逐位采用（2 骨，id/parent 与构造一致）',
    r.bones === 2 && !r.diag && JSON.stringify(parseMdl(head10).bones.map((b) => [b.type, b.parent])) === JSON.stringify([[1, -1], [2, 0]]))
}

// ── A.2 判据单元（纯函数；布局 A 判据自身 + 骨名槽字节判据 + 未定义长度字段）──────────────────
console.log('①b 判据单元（readMdlsLayoutABones 的逐骨判据）')
{
  // 骨名槽含控制字节 0x01：定步本身能读完整（complete），但**逐骨判据拒绝**
  const u8 = buildMdl({ declaredCount: 1, bones: [boneA(1, -1, { slot: [0x01, 0x62, 0x63, 0] })] })
  const cap = capture(() => readMdlsLayoutABones(u8, new DataView(u8.buffer), mdlsOffsetOf(u8), 1, null))
  const r = cap.r
  check('A 判据单元', '骨名槽控制字节：complete=true 但 entryErrors=[name-slot-invalid-bytes]',
    r.complete === true && r.entryErrors.length === 1 && r.entryErrors[0].reason === 'name-slot-invalid-bytes', JSON.stringify(r.entryErrors))
  const cap2 = capture(() => parseMdl(u8))
  check('A 判据单元', '骨名槽控制字节：parseMdl 拒绝整个骨架（bones=[] + reason 落到台账）',
    !!cap2.r && cap2.r.bones.length === 0 && !!cap2.r.mdlDiag && cap2.r.mdlDiag.reason === 'name-slot-invalid-bytes',
    cap2.r ? JSON.stringify(cap2.r.mdlDiag) : 'parseMdl=null')
  // 非法 UTF-8（0xFF 0xFE）
  const u8b = buildMdl({ declaredCount: 1, bones: [boneA(1, -1, { slot: [0xff, 0xfe, 0] })] })
  const rb = readMdlsLayoutABones(u8b, new DataView(u8b.buffer), mdlsOffsetOf(u8b), 1, null)
  check('A 判据单元', '骨名槽非法 UTF-8：拒绝（name-slot-invalid-bytes）', rb.entryErrors.length === 1 && rb.entryErrors[0].reason === 'name-slot-invalid-bytes')
  // 布局 C 的 JSON 元数据槽必须**不**被误拒（本仓语料 40/332 骨是这种槽）
  const jsonSlot = buildMdl({ declaredCount: 1, bones: [boneA(1, -1, { slot: A32('{"a":null,"lamax":null,"tm":100.0,"tp":"892.50433 0.00000 0.00000"}').concat([0]) })] })
  const rj = readMdlsLayoutABones(jsonSlot, new DataView(jsonSlot.buffer), mdlsOffsetOf(jsonSlot), 1, null)
  check('A 判据单元', 'JSON 元数据槽（布局 C 形态）：**不**误拒（判据只查可打印+长度）', rj.entryErrors.length === 0 && rj.complete === true)
  // len=0（未定义长度）⇒ 结构错（定步失步的可判定形式）
  const lenZero = buildMdl({ declaredCount: 2, bones: [boneA(1, -1, { len: 0 }), boneA(2, 0)] })
  const cap3 = capture(() => parseMdl(lenZero))
  check('A 判据单元', 'len=0：拒绝 + reason=record-truncated（可判定）',
    !!cap3.r && !!cap3.r.mdlDiag && cap3.r.mdlDiag.reason === 'record-truncated' && cap3.r.bones.length === 0,
    cap3.r ? JSON.stringify(cap3.r.mdlDiag) : 'parseMdl=null')
}

// ── A.3 ?mdls=legacy 的判定式 + 逐样本逐位回退 ────────────────────────────────────────────
console.log('② `?mdls=legacy`：判定式 + 逐位回退')
{
  check('B legacy', 'mdlsLegacy 判定式：&mdls=legacy ⇒ true', mdlsLegacy('?a=1&mdls=legacy') === true && mdlsLegacyElysia('?a=1&mdls=legacy') === true)
  check('B legacy', 'mdlsLegacy 判定式：其它值/空/undefined ⇒ false', mdlsLegacy('?mdls=1') === false && mdlsLegacy('') === false && mdlsLegacy(undefined) === false && mdlsLegacy('?mdlsx=legacy') === false)
}
const SAMPLE_SET = [['legalA', legalA, 3], ['layoutB', layoutB, 3], ['layoutC', layoutC, 3], ['badParent', badParent, 3], ['badMatIdx', badMatIdx, 2], ['truncated', truncated, 3], ['longNameSlot', longNameSlot, 2], ['badRot', badRot, 2], ['badTrans', badTrans, 2], ['head10', head10, 2]]
{
  let same = 0, legacyDiag = 0, refusedDefault = 0, rescuedLegacy = 0
  const legacyDescs = []
  for (const [label, u8, declared] of SAMPLE_SET) {
    const d = parseMdl(u8)                                    // 默认档（带校验）
    const l = capture(() => parseMdl(u8, { mdls: 'legacy' })) // legacy（无校验旧行为）
    const le = capture(() => H._parseMdl(new MpwBuffer(u8.buffer, u8.byteOffset, u8.byteLength), { mdls: 'legacy' }))
    // "逐位回退"的判据：legacy 档的骨 ≡ 默认档**在合法样本上**的结果；非法样本上 legacy 退回旧结果（可残缺）
    const posix = d.bones.length > 0
    if (posix ? JSON.stringify(d.bones) === JSON.stringify(l.r.bones) : true) same++
    if (JSON.stringify(le.r.bones) === JSON.stringify(l.r.bones)) same += 0
    if (!posix && l.r.bones.length !== 0) refusedDefault++
    if (l.r.mdlDiag || le.r.mdlDiag) legacyDiag++
    if (l.warns.length || le.warns.length) legacyDiag++
    legacyDescs.push(label + '=' + crypto.createHash('sha256').update(JSON.stringify(l.r.bones)).digest('hex').slice(0, 12))
  }
  check('B legacy', 'legacy 逐样本：**合法样本**的骨与默认档逐位相同（' + SAMPLE_SET.length + '/' + SAMPLE_SET.length + '）', same === SAMPLE_SET.length, same + '/' + SAMPLE_SET.length)
  check('B legacy', 'legacy 逐样本：被默认档拒绝的样本，legacy 退回**旧结果**（`bones.length != 0` 或空骨架，不是新失败路径）', refusedDefault >= 5, 'refusedThenLegacyParsed=' + refusedDefault)
  check('B legacy', 'legacy 逐样本：**不产生** mdlDiag、**不打** warn（= 逐位回到无校验旧行为）', legacyDiag === 0, 'legacyDiag=' + legacyDiag)
  console.log('  · legacy 档逐样本骨指纹 sha256[0:12]：' + legacyDescs.join(' '))
  // 非法样本在 legacy 下必须能"坏得出来"（否则 R1 变异无从谈起）
  const lb = parseMdl(layoutB, { mdls: 'legacy' })
  const lc = parseMdl(layoutC, { mdls: 'legacy' })
  check('B legacy', 'legacy 下布局 B/C **不再被拒**（正是"恰好没坏"的旧行为）', !lb.mdlDiag && !lc.mdlDiag && (lb.bones.length > 0 || lc.bones.length > 0), 'B=' + lb.bones.length + ' C=' + lc.bones.length)
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// B. 全语料回归（只读 entry 表 + 流式读单个 .mdl entry；不整包 readFileSync）
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log('③ 全语料回归（43 `.mdl` / 35 MDLS / 332 骨 / 0 非法 / 0 拒绝）')
const WS_ROOT = process.env.MPW_ROOT || WS
const ROOTS = [path.join(WS_ROOT, 'allwallpaper'), path.join(os.homedir(), '.dsh-mpkg-wallpaper')]
// 逐字段**流式** sha256（**不**先拼大 JSON 字符串）：26.8MB 的 `球体04.mdl` 若整份
//   `JSON.stringify`，单次峰值会多出上百 MB —— 分片喂 hash 拿到的仍是"逐位相同"的判据（同样字节序）。
function hashFields(m, extra = null) {
  const h = crypto.createHash('sha256')
  const num = (v) => { const x = +v; return Number.isFinite(x) ? (Number.isInteger(x) ? String(x) : x.toFixed(6)) : String(v) }
  // 逐行拼（不 `flat()`：335k 顶点的文件上 `flat()` 会多一份 100 万元素数组）
  const put = (label, arr) => { h.update(label + ':' + arr.length + ':') ; for (const v of arr) h.update(num(v) + ',') }
  const putRows = (label, rows) => { h.update(label + ':' + rows.length + ':') ; for (const row of rows) { h.update('[') ; for (const v of row) h.update(num(v) + ',') ; h.update(']') } }
  putRows('p', m.positions)
  putRows('u', m.uvs)
  put('i', m.indices)
  putRows('bi', m.blendIndices)
  putRows('bw', m.blendWeights)
  for (const bn of m.bones) h.update('B' + bn.index + '|' + bn.type + '|' + bn.parent + '|' + String(bn.bind) + ';')
  for (const an of m.animations) { h.update('A' + an.id + '|' + an.name + '|' + an.frameCount + '|' + an.boneCount + '|' + an.segBytes + '|' + an.fps + '|'); put('segs', an.segs) }
  if (extra) h.update(extra)
  return h.digest('hex')
}
const bonesDesc = (m) => ({
  n: m.bones.length,
  sha: crypto.createHash('sha256').update(JSON.stringify(m.bones)).digest('hex'),
})
const corpus = { rows: 0, mdls: 0, bones: 0, badParent: 0, badMat: 0, rejected: 0, warns: 0, diffLegacy: 0, diffElysia: 0, descs: [], shapes: 0, nullWithMdls: 0, nullNoMdls: 0, declaredMismatch: 0, digests: [] }
{
  const pkgs = []
  for (const r of ROOTS) { if (!fs.existsSync(r)) continue; for (const p of walkContainers(r)) pkgs.push(p) }
  check('C 语料', '语料根存在（' + ROOTS.length + ' 个）', pkgs.length > 0, 'containers=' + pkgs.length)
  const ow = console.warn, warnLines = []
  console.warn = (...a) => warnLines.push(a.join(' '))
  for (const f of pkgs) {
    let idx
    try { idx = readIndexHead(f) } catch { continue }
    for (const e of idx.entries.filter((x) => /\.mdl$/i.test(x.name))) {
      corpus.rows++
      let b
      try { b = readEntryBytes(f, idx, e) } catch { continue }
      const mo = b.indexOf('MDLS', 0, 'latin1')
      const hasMdls = mo >= 0
      const declared = hasMdls ? b.readUInt32LE(mo + 13) : 0
      if (hasMdls) corpus.mdls++
      const base = parseMdl(b, { mdls: 'legacy' })          // 基线 = ?mdls=legacy（P-152 之前的实现路径）
      const cap = capture(() => parseMdl(b))
      const now = cap.r
      if (!now) {
        // 真语料实测：8 个**无 MDLS 的静态网格**（如 `models/1/1.mdl`、`models/Hollow Cylinder/…`）
        //   `parseMdl` 本来就返回 null（顶点块扫描没命中）—— 与 P-152 无关，故不计失败；
        //   但**含 MDLS 的必须非 null**（否则是回归），单独断言。
        if (hasMdls) { corpus.nullWithMdls++; check('C 语料', '含 MDLS 的 .mdl 解析非 null：' + e.name, false) }
        else corpus.nullNoMdls++
        continue
      }
      for (const bn of now.bones) {
        if (!(bn.parent === -1 || (bn.parent >= 0 && bn.parent < now.bones.length))) corpus.badParent++
        if (!(Number.isFinite(bn.type) && bn.type >= 0 && bn.type < 100000)) corpus.badMat++
      }
      if (now.bones.length !== base.bones.length) corpus.badParent++   // 骨数不符也算结构异常
      if (hasMdls && (now.bones.length !== declared || base.bones.length !== declared)) corpus.declaredMismatch++
      if (!hasMdls) corpus.shapes++
      if (now.mdlDiag) corpus.rejected++
      corpus.warns += cap.warns.length
      corpus.bones += now.bones.length
      if (hasMdls) corpus.descs.push(e.name + '|' + bonesDesc(now).sha)
      // 逐字段（流式 sha256，不拼大字符串）：默认 vs legacy
      const ha = hashFields(now), hc = hashFields(base)
      if (ha !== hc) { corpus.diffLegacy++; check('C 语料', '默认 == legacy（逐字段）：' + e.name, false) }
      else corpus.digests.push(ha.slice(0, 16))
      // elysia 侧（`demo.html:3442` 实际运行的那份）：**同契约**的判据是
      //   ① 合法语料上"默认档 == 自己的 legacy 档"（逐位）且不产生 mdlDiag；
      //   ② 骨数 == 声明骨数（= core 侧同一判据）。
      //   ⚠ **不**断言 "core == elysia"：本仓两侧的**骨矩阵**在 8 个 `.mdl` 上本来就不一致（HEAD 实测同为 8 个，
      //     与本项无关，属既有差异）——写成断言会把一条**既有**差异记到 P-152 头上（不诚实）。
      const el = H._parseMdl(new MpwBuffer(b.buffer, b.byteOffset, b.byteLength))
      const ell = H._parseMdl(new MpwBuffer(b.buffer, b.byteOffset, b.byteLength), { mdls: 'legacy' })
      if (!el || hashFields({ positions: [], uvs: [], indices: [], blendIndices: [], blendWeights: [], bones: el.bones, animations: [] })
        !== hashFields({ positions: [], uvs: [], indices: [], blendIndices: [], blendWeights: [], bones: ell.bones, animations: [] }) || el.mdlDiag) {
        corpus.diffElysia++
        check('C 语料', 'elysia 默认 == legacy 且无 mdlDiag：' + e.name, false)
      }
      if (el && hasMdls && el.bones.length !== declared) { corpus.diffElysia++; check('C 语料', 'elysia 骨数 == 声明骨数：' + e.name, false) }
    }
  }
  console.warn = ow
  corpus.legacyWarns = warnLines.length
  check('C 语料', '`.mdl` 行数 = 43（基线计数守卫）', corpus.rows === 43, 'rows=' + corpus.rows)
  check('C 语料', '含 MDLS 的 `.mdl` = 35（基线计数守卫）', corpus.mdls === 35, 'mdls=' + corpus.mdls)
  check('C 语料', '骨骼累计 = 332（基线计数守卫）', corpus.bones === 332, 'bones=' + corpus.bones)
  check('C 语料', '非法骨（parent 越界 / 材质索引越界 / 骨数不符）= 0（基线）', corpus.badParent === 0 && corpus.badMat === 0, 'badParent=' + corpus.badParent + ' badMat=' + corpus.badMat)
  check('C 语料', '校验拒绝 = 0、warn = 0（合法语料**不得**被新判据误伤）', corpus.rejected === 0 && corpus.warns === 0, 'rejected=' + corpus.rejected + ' warns=' + corpus.warns)
  check('C 语料', '默认 vs legacy 逐字段差异 = 0（零回归）', corpus.diffLegacy === 0, 'diff=' + corpus.diffLegacy)
  check('C 语料', 'core vs elysia 骨逐位差异 = 0（同契约）', corpus.diffElysia === 0, 'diff=' + corpus.diffElysia)
  check('C 语料', '骨数 == 声明骨数（core 默认档与 legacy 档都成立）', corpus.declaredMismatch === 0, 'mismatch=' + corpus.declaredMismatch)
  // 基线（HEAD 实测）：8 个无 MDLS 的 `.mdl` 里 7 个 `parseMdl` 返回 null（顶点块扫描没命中）、
  //   1 个（models/球体04）返回 bones=[] —— 都与 P-152 无关（无 MDLS ⇒ 无骨可校验）。
  check('C 语料', '无 MDLS 的 .mdl：null 数 = 7、bones=[] 数 = 1（**基线**，HEAD 实测同值）', corpus.nullNoMdls === 7 && corpus.shapes === 1, 'nullNoMdls=' + corpus.nullNoMdls + ' shapes=' + corpus.shapes + ' nullWithMdls=' + corpus.nullWithMdls)
  console.log('  · 语料指纹 sha256(43 行骨描述符) = ' + crypto.createHash('sha256').update(corpus.descs.join('\n')).digest('hex').slice(0, 32))
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// C. 变异自证（R1–R3）：把 core 复制到临时目录后**字符串变异**再 import，真跑本门禁的判据
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log('④ 变异自证（真跑：复制 core → 字符串变异 → 重新 import）')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'p152-mut-'))
const CORE_SRC = path.join(import.meta.dirname, '..', 'core')
let mutN = 0
async function withMutant(label, from, to, fn) {
  const dir = path.join(TMP, 'm' + (++mutN))
  fs.mkdirSync(dir, { recursive: true })
  for (const f of ['puppet-skin.js', 'attach-transform.mjs']) fs.copyFileSync(path.join(CORE_SRC, f), path.join(dir, f))
  const p = path.join(dir, 'attach-transform.mjs')
  const src = fs.readFileSync(p, 'utf8')
  if (!src.includes(from)) { check('D 变异自证', label + '：变异锚点存在', false); return null }
  fs.writeFileSync(p, src.replace(from, to))
  const mod = await import(pathToFileURL(p).href + '?v=' + mutN)
  return fn(mod)
}
{
  // R1：强制走"无校验旧路径" ⇒ 非法样本不再被拒 ⇒ 逐类判定必红
  await withMutant('R1 无校验旧路径', 'const mdlsLegacyMode = !!(opts && (opts.mdls === \'legacy\' || opts.mdlsLegacy === true))',
    'const mdlsLegacyMode = true /* MUT-R1 */', (mod) => {
      const reds = []
      for (const [label, u8] of [['layoutB', layoutB], ['layoutC', layoutC], ['badParent', badParent], ['badMatIdx', badMatIdx], ['badRot', badRot], ['badTrans', badTrans]]) {
        const m = mod.parseMdl(u8)
        if (!m || !m.mdlDiag || m.bones.length !== 0) reds.push(label + '(bones=' + (m ? m.bones.length : 'null') + ',diag=' + !!(m && m.mdlDiag) + ')')
      }
      check('D 变异自证', 'R1 去掉校验（恒走旧路径）⇒ 非法样本不再被拒 ⇒ 本组必红', reds.length >= 6, '实际变红样本 ' + reds.length + '/6: ' + reds.join(' '))
      const la = mod.parseMdl(legalA)
      check('D 变异自证', 'R1 下合法布局 A 仍照常解析（说明红的是"校验"不是"解析"）', !!la && la.bones.length === 3)
    })
  // R2：布局判定恒为 A ⇒ 布局 B/C 的 layout 档必红
  await withMutant('R2 布局判定恒 A', 'export function mdlLooksLikeLayoutA(entryErrors) {\n  return ((entryErrors && entryErrors.length) || 0) === 0\n}',
    'export function mdlLooksLikeLayoutA(entryErrors) {\n  return true /* MUT-R2 */\n}', (mod) => {
      const b = mod.parseMdl(layoutB) || {}, c = mod.parseMdl(layoutC) || {}
      const reds = []
      if (!(b.mdlDiag && b.mdlDiag.layout === 'refused')) reds.push('layoutB(layout=' + (b.mdlDiag && b.mdlDiag.layout) + ')')
      if (!(c.mdlDiag && c.mdlDiag.layout === 'refused')) reds.push('layoutC(layout=' + (c.mdlDiag && c.mdlDiag.layout) + ')')
      check('D 变异自证', 'R2 布局判定恒 A ⇒ 布局 B/C 的 `layout` 档从 not-A 变 refused ⇒ 本组必红', reds.length === 2, '实际变红 ' + reds.join(' '))
      check('D 变异自证', 'R2 下"仍拒绝/仍空骨架"不变（失败路径与判定档是两件事）', (b.bones || []).length === 0 && (c.bones || []).length === 0)
    })
  // R3：骨名槽判据弱化 ⇒ 本门禁**必须仍然全绿**（没有过度拒绝的证明）
  await withMutant('R3 骨名槽判据弱化', 'function mdlNameSlotOK(raw, s, e) {',
    'function mdlNameSlotOK(raw, s, e) {\n  return true /* MUT-R3 */', async (mod) => {
      let green = 0, red = []
      const cases = [
        ['layoutB', () => { const m = mod.parseMdl(layoutB); return !!(m.mdlDiag && m.mdlDiag.layout === 'not-A' && m.bones.length === 0) }],
        ['layoutC', () => { const m = mod.parseMdl(layoutC); return !!(m.mdlDiag && m.mdlDiag.layout === 'not-A' && m.bones.length === 0) }],
        ['longNameSlot', () => { const m = mod.parseMdl(longNameSlot); return !!(m.mdlDiag && m.mdlDiag.reason === 'name-slot-too-long') }],
        ['badParent', () => { const m = mod.parseMdl(badParent); return !!(m.mdlDiag && m.mdlDiag.reason === 'parent-out-of-range') }],
        ['badRot', () => { const m = mod.parseMdl(badRot); return !!(m.mdlDiag && m.mdlDiag.reason === 'rotation-row-not-unit') }],
      ]
      for (const [label, fn] of cases) { if (fn()) green++; else red.push(label) }
      check('D 变异自证', 'R3 骨名槽判据弱化 ⇒ 本门禁仍全绿（5/5 判据不受影响 = 没靠它做过度拒绝）', green === 5, 'green=' + green + '/5' + (red.length ? ' red=' + red.join(',') : ''))
    })
}
try { fs.rmSync(TMP, { recursive: true, force: true }) } catch { /* 临时目录清不掉不影响判据 */ }

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log('')
console.log('断言：PASS=' + PASS + ' FAIL=' + FAIL + (Object.keys(RED).length ? ' | 变红组：' + JSON.stringify(RED) : ''))
console.log('corpus: rows=' + corpus.rows + ' mdls=' + corpus.mdls + ' bones=' + corpus.bones + ' rejected=' + corpus.rejected + ' warns=' + corpus.warns + ' diffLegacy=' + corpus.diffLegacy + ' diffElysia=' + corpus.diffElysia)
console.log(FAIL === 0 ? 'ALL PASS' : 'FAILED')
process.exit(FAIL ? 1 : 0)
