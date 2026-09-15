// hlsl2glsl-coverage-test.mjs —— P-93：把 `docs/HLSL2GLSL-COVERAGE.md` 的覆盖率**变成会变红的断言**
//
// 复现：node hlsl2glsl-coverage-test.mjs          # 人读
//       node hlsl2glsl-coverage-test.mjs --json   # 机读
//       MPW_H2G_MAX_PKGS=8 node hlsl2glsl-coverage-test.mjs   # 多取几个包（更接近文档的 15 包口径）
//
// 依据：`docs/SIMILAR-PROJECTS-RESEARCH.md` §6.3 的 P1 完成判据原文 ——
//   「`hlsl2glsl` 作为**可选**效果路径接入 + 覆盖率回归门禁（用 `docs/HLSL2GLSL-COVERAGE.md` 的语料口径）
//     ⇒ **新增门禁项，把 98.2% 这个数字变成会变红的断言**（而不是文档里的数字）」
// 本文件只做**后半句**（覆盖率回归门禁）。前半句"接入可选效果路径"要动 `we-scene-bundle.js`，
// 与并发线冲突，**未做**（如实记在 PATCHES.md P-93 的"未做"一节）。
//
// 口径（与 `docs/HLSL2GLSL-COVERAGE.md` §2.1 的三态定义**逐条对齐**）：
//   · 候选 = `<语料根>/<id>/scene.pkg`，取包内 `shaders/**` 下 `.frag/.vert`，按 **sha256 内容去重**
//   · `通过`   = 产出 ∧ 无 HLSL 残留 token ∧ 括号/花括号平衡 ∧ （有 glslangValidator 时）GLSL ES 300 真编译过
//   · `可疑`   = 产出但上面任一条不成立
//   · `抛错`   = `hlsl2glsl()` 抛异常（**任何一条都算回归**，文档基线是 0）
//   · 语料**只在作者机存在**（真实壁纸不随仓库分发，P-87）⇒ 找不到包时 **SKIP 不红**（条件项）。
//
// 语料裁剪（**本机内存只有一名额**：仓库门禁文档明确记录过"内存压力导致假超时"的坑）：
//   默认最多 4 个包、单包 ≤128MB、累计 ≤320MB，**按体积升序**取（小包先跑，先拿到结论）。
//   语料文件数 ≥ 文档口径 114 时按 98.2% 断言；被裁剪时按回归下限 95% 断言并**明确打印这是子集**。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { hlsl2glsl } from './vendor/hlsl2glsl/hlsl2glsl.js'

const HERE = import.meta.dirname
const JSON_OUT = process.argv.includes('--json')
const MAX_PKGS = Number(process.env.MPW_H2G_MAX_PKGS || 4)
const MAX_ONE_MB = Number(process.env.MPW_H2G_MAX_ONE_MB || 128)
const MAX_ALL_MB = Number(process.env.MPW_H2G_MAX_ALL_MB || 320)
const DOC_TOTAL = 114          // 文档口径的去重文件数（§1.2）
const DOC_RATIO = 0.982        // 文档口径的覆盖率（112/114，§0 第 1 条）
const SUBSET_RATIO = 0.95      // 语料被裁剪时的回归下限

// ── 与服务器同序的包解析器解析链（缺了就没语料可读 ⇒ 条件项 SKIP） ──
const MPW_ROOT = process.env.MPW_ROOT || path.resolve(HERE, '..')
const PKG_EXTRACT = process.env.MPW_PKG_EXTRACT
  || (fs.existsSync(path.join(HERE, 'pkg-extract.mjs')) ? path.join(HERE, 'pkg-extract.mjs') : path.join(MPW_ROOT, 'dsh-mpkg-wallpaper', 'lib', 'pkg-extract.js'))
if (!fs.existsSync(PKG_EXTRACT)) {
  console.log('SKIP hlsl2glsl-coverage（找不到包解析器 ' + PKG_EXTRACT + '；装法见 PACKAGING.md §2）')
  process.exit(0)
}
// 语料根：显式 MPW_SCENE_ROOT > MPW_ROOT/allwallpaper/dd > <repo>/samples
const SCENE_ROOT = process.env.MPW_SCENE_ROOT
  || [path.join(MPW_ROOT, 'allwallpaper', 'dd'), path.join(HERE, 'samples')].find((d) => { try { return fs.statSync(d).isDirectory() } catch { return false } })
if (!SCENE_ROOT) { console.log('SKIP hlsl2glsl-coverage（无语料根）'); process.exit(0) }

const { parsePkg, readPkgEntry } = await import(PKG_EXTRACT)

const cands = []
try {
  for (const id of fs.readdirSync(SCENE_ROOT)) {
    const fp = path.join(SCENE_ROOT, id, 'scene.pkg')
    try { const st = fs.statSync(fp); if (st.isFile()) cands.push({ id, fp, bytes: st.size, mtimeMs: st.mtimeMs }) } catch { /* 非包 */ }
  }
} catch { /* 语料根读不了 ⇒ 下面按无候选 SKIP */ }
if (!cands.length) { console.log('SKIP hlsl2glsl-coverage（' + SCENE_ROOT + ' 下没有 <id>/scene.pkg；真实壁纸不随仓库分发，见 samples/README.md）'); process.exit(0) }

// 按体积升序裁剪（内存友好优先）
cands.sort((a, b) => a.bytes - b.bytes)
const picked = []
let acc = 0
for (const c of cands) {
  if (picked.length >= MAX_PKGS) break
  if (c.bytes / 1048576 > MAX_ONE_MB) continue
  if ((acc + c.bytes) / 1048576 > MAX_ALL_MB) continue
  picked.push(c); acc += c.bytes
}
if (!picked.length) { console.log('SKIP hlsl2glsl-coverage（候选包都超过单包上限 ' + MAX_ONE_MB + 'MB）'); process.exit(0) }

// ── include 解析：用**本仓库自研**的 common*.h（不复制上游头表；见 vendor/hlsl2glsl/README.md §2） ──
const HEADERS = new Map()
for (const f of fs.readdirSync(HERE)) {
  if (/^common.*\.h$/.test(f)) { try { HEADERS.set(f, fs.readFileSync(path.join(HERE, f), 'utf8')) } catch { /* ignore */ } }
}
const includeResolver = (name) => HEADERS.get(String(name).split('/').pop()) ?? null

// ── glslangValidator（可选：有则按文档的"严格三态"，无则退化成"产出+残留检查"并如实标注） ──
let GLSLANG = ''
try { GLSLANG = execFileSync('sh', ['-c', 'command -v glslangValidator'], { encoding: 'utf8' }).trim() } catch { GLSLANG = '' }
function compiles(src, stage) {
  if (!GLSLANG) return null
  const ext = stage === 'vert' ? '.vert' : '.frag'
  const fp = path.join(process.env.TMPDIR || '/tmp', 'mpw-h2g-' + process.pid + '-' + Math.abs(hash(src)) + ext)
  try {
    fs.writeFileSync(fp, src)
    execFileSync(GLSLANG, ['-S', stage === 'vert' ? 'vert' : 'frag', fp], { stdio: 'pipe', timeout: 20000 })
    return true
  } catch { return false } finally { try { fs.unlinkSync(fp) } catch { /* ignore */ } }
}
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h }

// ── 抽取语料（逐包顺序处理，用完立刻释放，避免叠加占用） ──
const uniq = new Map()   // sha256 → { name, stage, src, pkgs:[], path }
const pkgReport = []
for (const c of picked) {
  let data = null
  try {
    data = fs.readFileSync(c.fp)
    const idx = parsePkg(data)
    const sh = idx.filter((e) => /(^|\/)shaders\//i.test(e.path) && /\.(vert|frag)$/i.test(e.path))
    let n = 0
    for (const e of sh) {
      let buf = null
      try { buf = Buffer.from(readPkgEntry(data, e)) } catch { continue }
      const sha = crypto.createHash('sha256').update(buf).digest('hex')
      const stage = /\.vert$/i.test(e.path) ? 'vert' : 'frag'
      if (!uniq.has(sha)) uniq.set(sha, { sha, name: path.basename(e.path), stage, src: buf.toString('utf8'), pkgs: [], path: e.path })
      uniq.get(sha).pkgs.push(c.id)
      n++
    }
    pkgReport.push({ id: c.id, mb: +(c.bytes / 1048576).toFixed(1), entries: idx.length, shaderRefs: n })
  } catch (e) {
    pkgReport.push({ id: c.id, mb: +(c.bytes / 1048576).toFixed(1), error: String(e && e.message).slice(0, 120) })
  }
  data = null
  await new Promise((r) => setImmediate(r))     // 让 GC 有机会回收大 Buffer
}

const files = [...uniq.values()].sort((a, b) => a.stage.localeCompare(b.stage) || a.name.localeCompare(b.name))
if (!files.length) { console.log('SKIP hlsl2glsl-coverage（' + picked.length + ' 个包内没有 shaders/**/*.frag|vert）'); process.exit(0) }

// ── 逐文件过转译器 ──
const RESIDUAL = /\b(float[234]x?[234]?|tex2D|cbuffer|SamplerState|SV_Target|SV_Position|TEXCOORD\d|\[unroll\]|static const|half[234]?)\b/
const rows = []
for (const f of files) {
  const sibling = files.find((o) => o.stage !== f.stage && o.path.replace(/\.(vert|frag)$/i, '') === f.path.replace(/\.(vert|frag)$/i, ''))
  let out = null, err = ''
  try { out = hlsl2glsl(f.src, f.stage, {}, (n) => includeResolver(n), sibling ? sibling.src : '') } catch (e) { err = String(e && e.message).slice(0, 120) }
  const balanced = out ? (count(out, '{') === count(out, '}') && count(out, '(') === count(out, ')')) : false
  const residual = out ? RESIDUAL.test(out) : false
  const cok = out && balanced && !residual ? compiles(out, f.stage) : false
  const verdict = err ? 'throw' : (out && balanced && !residual && cok !== false) ? 'pass' : 'suspect'
  rows.push({ name: f.name, stage: f.stage, pkgs: [...new Set(f.pkgs)].length, verdict, reason: err || (residual ? 'HLSL 残留 token' : (!balanced ? '括号不平衡' : (cok === false ? 'GLSL ES 300 编不过' : ''))) })
}
function count(s, ch) { let n = 0; for (const c of s) if (c === ch) n++; return n }

const passN = rows.filter((r) => r.verdict === 'pass').length
const suspect = rows.filter((r) => r.verdict === 'suspect')
const thrown = rows.filter((r) => r.verdict === 'throw')
const ratio = passN / rows.length
const isDocCorpus = files.length >= DOC_TOTAL
// 门槛可被环境变量**抬高**（只允许抬高不允许压低）：用于自证"这条断言真的会变红"——
//   `MPW_H2G_MIN_RATIO=0.999 node hlsl2glsl-coverage-test.mjs; echo rc=$?` ⇒ 1（见 PATCHES.md P-93 自证）。
const floor = Math.max(isDocCorpus ? DOC_RATIO : SUBSET_RATIO, Number(process.env.MPW_H2G_MIN_RATIO || 0))

let failN = 0
const fails = []
const check = (name, ok, detail) => { if (!ok) { failN++; fails.push(name + (detail ? ' — ' + detail : '')) } console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  [' + detail + ']' : '')) }

console.log('hlsl2glsl 覆盖率门禁（P-93）')
console.log('  语料根   : ' + SCENE_ROOT)
console.log('  取样包   : ' + picked.length + '/' + cands.length + '（' + pkgReport.map((r) => r.id + '@' + r.mb + 'MB').join(', ') + '）')
console.log('  去重文件 : ' + files.length + '（frag ' + rows.filter((r) => r.stage === 'frag').length + ' / vert ' + rows.filter((r) => r.stage === 'vert').length + '）' + (isDocCorpus ? '' : '  ⚠ 子集（文档口径 ' + DOC_TOTAL + '）'))
console.log('  校验器   : ' + (GLSLANG || '未安装 → 本次为**非严格口径**（产出 + 残留/括号检查）'))
console.log('  结果     : 通过 ' + passN + ' / 可疑 ' + suspect.length + ' / 抛错 ' + thrown.length + ' ⇒ ' + (ratio * 100).toFixed(1) + '%（文档基线 ' + (DOC_RATIO * 100).toFixed(1) + '%）')
if (suspect.length) for (const s of suspect.slice(0, 10)) console.log('    · 可疑 ' + s.stage + ' ' + s.name + '：' + s.reason)
if (thrown.length) for (const s of thrown.slice(0, 10)) console.log('    · 抛错 ' + s.stage + ' ' + s.name + '：' + s.reason)

check('语料规模达到可判定下限（≥20 去重文件）', files.length >= 20, String(files.length))
check('0 个抛错（文档基线 0）', thrown.length === 0, thrown.map((t) => t.name).join(','))
check('覆盖率 ≥ ' + (floor * 100).toFixed(1) + '%' + (isDocCorpus ? '（文档口径全量）' : '（子集回归下限）'), ratio >= floor, (ratio * 100).toFixed(1) + '% = ' + passN + '/' + rows.length)
check('include 解析器非空（仓库自研 common*.h 在位）', HEADERS.size > 0, [...HEADERS.keys()].join(' '))
check('每个"可疑"都带得出原因（不是静默降级）', suspect.every((s) => !!s.reason))

if (JSON_OUT) console.log(JSON.stringify({ sceneRoot: SCENE_ROOT, pkgs: pkgReport, files: files.length, docTotal: DOC_TOTAL, strict: !!GLSLANG, pass: passN, suspect: suspect.length, throw: thrown.length, ratio, floor, ok: failN === 0 }))
console.log('\n' + '─'.repeat(72))
if (failN) { console.log('✗ hlsl2glsl 覆盖率回归：' + failN + ' 条断言失败\n  - ' + fails.join('\n  - ')); process.exit(1) }
console.log('✓ hlsl2glsl 覆盖率回归通过（' + passN + '/' + rows.length + ' = ' + (ratio * 100).toFixed(1) + '%；文档基线 ' + (DOC_RATIO * 100).toFixed(1) + '%）')
